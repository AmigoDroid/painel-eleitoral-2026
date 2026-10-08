import React, { useEffect, useRef, useState, useMemo } from "react";
import { createRoot } from "react-dom/client";
import "brazil-map";
import "./styles.css";

const STATES = {
  AC: "Acre",
  AL: "Alagoas",
  AP: "Amapá",
  AM: "Amazonas",
  BA: "Bahia",
  CE: "Ceará",
  DF: "Distrito Federal",
  ES: "Espírito Santo",
  GO: "Goiás",
  MA: "Maranhão",
  MT: "Mato Grosso",
  MS: "Mato Grosso do Sul",
  MG: "Minas Gerais",
  PA: "Pará",
  PB: "Paraíba",
  PR: "Paraná",
  PE: "Pernambuco",
  PI: "Piauí",
  RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte",
  RS: "Rio Grande do Sul",
  RO: "Rondônia",
  RR: "Roraima",
  SC: "Santa Catarina",
  SP: "São Paulo",
  SE: "Sergipe",
  TO: "Tocantins",
};

// Configuração centralizada de cores por número do candidato (candidato.n)
const CORES_CANDIDATOS = {
  22: "#1d4ed8", // Azul
  13: "#dc2626", // Vermelho
};
const COR_PADRAO = "#475569"; // Cinza neutro

function fmt(v) {
  return new Intl.NumberFormat("pt-BR").format(Number(v) || 0);
}

function pct(v) {
  const numero = Number(String(v ?? "0").replace(",", "."));
  return `${numero.toFixed(2).replace(".", ",")}%`;
}

// Função centralizada para montar a URL oficial do TSE por turno e abrangência
function getTseUrl(round, uf = "br") {
  const ufLower = uf.toLowerCase();
  const eleicaoId = round === 2 ? "6258" : "6257";
  return `https://resultados.tse.jus.br/oficial/ele2026/${eleicaoId}/dados/${ufLower}/${ufLower}-c0001-e00${eleicaoId}-u.jws`;
}

// Funções auxiliares reutilizáveis
function obterCandidatos(dados) {
  return (
    dados?.carg
      ?.find((cargo) => cargo.cd === "1")
      ?.agr?.flatMap(
        (grupo) => grupo.par?.flatMap((partido) => partido.cand || []) || [],
      ) || []
  );
}

function obterCandidatosOrdenados(dados) {
  const candidatos = obterCandidatos(dados);
  return [...candidatos].sort(
    (a, b) => Number(b.vap || 0) - Number(a.vap || 0),
  );
}

function obterCorCandidato(candidato) {
  if (!candidato || !candidato.n) return COR_PADRAO;
  return CORES_CANDIDATOS[candidato.n] || COR_PADRAO;
}

// Função para carregar arquivo JWS do TSE
async function carregarArquivoTSE(url, signal) {
  const resposta = await fetch(url, { signal });
  if (!resposta.ok) {
    throw new Error(`Erro HTTP: ${resposta.status}`);
  }
  const jws = (await resposta.text()).trim();
  const partes = jws.split(".");
  if (partes.length !== 3) {
    throw new Error("JWS inválido");
  }

  const payloadBase64 = partes[1];
  const base64 = payloadBase64.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);

  const bytes = Uint8Array.from(atob(base64 + padding), (c) => c.charCodeAt(0));

  const payload = new TextDecoder("utf-8").decode(bytes);
  return JSON.parse(payload);
}

function App() {
  const mapRef = useRef(null);
  const cacheTSE = useRef({ 1: {}, 2: {} });
  const coresEstadosRef = useRef({});

  const [round, setRound] = useState(1);
  const [uf, setUf] = useState("BR");
  const [mapReady, setMapReady] = useState(false);

  // Estados isolados por turno estruturalmente
  const [dadosTSEPorTurno, setDadosTSEPorTurno] = useState({
    1: null,
    2: null,
  });
  const [dadosEstadosPorTurno, setDadosEstadosPorTurno] = useState({
    1: {},
    2: {},
  });
  const [carregandoTSE, setCarregandoTSE] = useState(true);
  const [erroTSE, setErroTSE] = useState(null);

  const dadosTSE = dadosTSEPorTurno[round];
  const dadosEstados = dadosEstadosPorTurno[round];

  // ============================
  // FUNÇÕES DE SELEÇÃO E RETORNO AO BRASIL
  // ============================
  function selecionarEstado(novaUf) {
    setUf(novaUf);
  }

  function voltarParaBrasil() {
    setUf("BR");
    const el = mapRef.current;
    if (el) {
      el.selected = "";
      if (typeof el.removeAttribute === "function") {
        el.removeAttribute("selected");
      }
    }
  }

  // ============================
  // CARREGA TSE (BR E ESTADOS) POR TURNO
  // ============================
  useEffect(() => {
    const controller = new AbortController();

    async function carregarDadosGerais(isBackground = false) {
      try {
        if (!isBackground) {
          setCarregandoTSE(true);
          setErroTSE(null);
        }

        const url = getTseUrl(round, uf);
        const dados = await carregarArquivoTSE(url, controller.signal);

        cacheTSE.current[round][uf] = dados;
        setDadosTSEPorTurno((prev) => ({
          ...prev,
          [round]: dados,
        }));

        const chavesEstados = Object.keys(STATES);
        const novosDadosEstados = { ...(dadosEstadosPorTurno[round] || {}) };
        let mudouEstados = false;

        for (const sigla of chavesEstados) {
          try {
            const urlEst = getTseUrl(round, sigla);
            const dadosEst = await carregarArquivoTSE(
              urlEst,
              controller.signal,
            );
            cacheTSE.current[round][sigla] = dadosEst;
            novosDadosEstados[sigla] = dadosEst;
            mudouEstados = true;
          } catch (err) {
            if (err.name === "AbortError") throw err;
          }
        }

        if (mudouEstados) {
          setDadosEstadosPorTurno((prev) => ({
            ...prev,
            [round]: novosDadosEstados,
          }));
        }
      } catch (erro) {
        if (erro.name === "AbortError") return;
        console.error(`ERRO AO LER TSE PARA ${uf} (${round}º TURNO):`, erro);
        if (!isBackground) {
          const nomeEstado = uf === "BR" ? "Brasil" : STATES[uf];
          if (round === 2) {
            setErroTSE(
              `Os dados oficiais do 2º Turno para ${nomeEstado} ainda não estão disponíveis ou a apuração não foi iniciada.`,
            );
          } else {
            setErroTSE(`Não foi possível carregar os dados de ${nomeEstado}.`);
          }
        }
      } finally {
        if (!controller.signal.aborted && !isBackground) {
          setCarregandoTSE(false);
        }
      }
    }

    carregarDadosGerais(false);

    const intervalo = setInterval(() => {
      carregarDadosGerais(true);
    }, 10000);

    return () => {
      controller.abort();
      clearInterval(intervalo);
    };
  }, [uf, round]);

  // ============================
  // PINTURA AUTOMÁTICA DO MAPA E HOVER CUSTOMIZADO
  // ============================
  useEffect(() => {
    const el = mapRef.current;
    if (!el || !el.shadowRoot) return;

    Object.keys(STATES).forEach((sigla) => {
      const dadosEst = dadosEstados[sigla] || (sigla === uf ? dadosTSE : null);
      const estadoEl = el.shadowRoot.querySelector(`#BR-${sigla}`);

      if (estadoEl) {
        let cor = COR_PADRAO;
        if (dadosEst) {
          const candidatosOrd = obterCandidatosOrdenados(dadosEst);
          const vencedor = candidatosOrd[0];
          cor = obterCorCandidato(vencedor);
        }

        coresEstadosRef.current[sigla] = cor;
        estadoEl.style.fill = cor;

        if (!estadoEl.dataset.hoverBound) {
          estadoEl.dataset.hoverBound = "true";

          estadoEl.addEventListener("mouseenter", () => {
            const atualCor = coresEstadosRef.current[sigla] || COR_PADRAO;
            estadoEl.style.fill = atualCor;
            estadoEl.style.stroke = "#ffffff";
            estadoEl.style.strokeWidth = "2.5";
            estadoEl.style.filter = "brightness(1.15)";
          });

          estadoEl.addEventListener("mouseleave", () => {
            const atualCor = coresEstadosRef.current[sigla] || COR_PADRAO;
            estadoEl.style.fill = atualCor;
            if (sigla === uf && uf !== "BR") {
              estadoEl.style.stroke = "#ffffff";
              estadoEl.style.strokeWidth = "2.5";
            } else {
              estadoEl.style.stroke = "#07111f";
              estadoEl.style.strokeWidth = "1";
            }
            estadoEl.style.filter = "none";
          });
        }

        if (sigla === uf && uf !== "BR") {
          estadoEl.style.stroke = "#ffffff";
          estadoEl.style.strokeWidth = "2.5";
        } else {
          estadoEl.style.stroke = "#07111f";
          estadoEl.style.strokeWidth = "1";
        }
      }
    });
  }, [dadosEstados, dadosTSE, uf, round, mapReady]);

  // ============================
  // EVENTO DE CLIQUE NO MAPA
  // ============================
  useEffect(() => {
    const el = mapRef.current;
    if (!el) return;

    const handler = (event) => {
      const selected = String(event.detail || "").toUpperCase();
      if (STATES[selected]) {
        selecionarEstado(selected);
      }
    };

    el.addEventListener("onStateSelected", handler);
    setMapReady(true);

    return () => {
      el.removeEventListener("onStateSelected", handler);
    };
  }, []);

  const candidatosOrdenados = useMemo(() => {
    return obterCandidatosOrdenados(dadosTSE);
  }, [dadosTSE]);

  const title = uf === "BR" ? "Brasil" : STATES[uf];
  const votosValidos = dadosTSE?.v?.vvc || 0;
  const percentualApurado = dadosTSE?.s?.pst || "0,00";
  const ultimaAtualizacao = dadosTSE?.ht || "--:--:--";

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <div className="eyebrow">ELEIÇÕES 2026</div>
          <h1>Apuração para Presidente</h1>
          <p>Resultado por estado</p>
        </div>

        <div className="live">
          <span /> AO VIVO
        </div>
      </header>

      <main>
        {/* ============================
            TURNO
        ============================ */}
        <div className="round-switch">
          <button
            className={round === 1 ? "selected" : ""}
            onClick={() => setRound(1)}
          >
            1º TURNO
          </button>
          <button
            className={round === 2 ? "selected" : ""}
            onClick={() => setRound(2)}
          >
            2º TURNO
          </button>
        </div>

        {/* ============================
            ERRO
        ============================ */}
        {erroTSE && (
          <div className="notice">
            <b>Aviso do TSE ({round}º Turno)</b>
            <p>{erroTSE}</p>
          </div>
        )}

        {/* ============================
            PLACAR
        ============================ */}
        {candidatosOrdenados.length >= 2 && (
          <section className="score">
            <div className="score-side">
              <small>
                {candidatosOrdenados[0].nmu || candidatosOrdenados[0].nm}
              </small>
              <strong>{fmt(candidatosOrdenados[0].vap)}</strong>
              <b>{pct(candidatosOrdenados[0].pvapn)}</b>
            </div>

            <div className="versus">×</div>

            <div className="score-side right">
              <small>
                {candidatosOrdenados[1].nmu || candidatosOrdenados[1].nm}
              </small>
              <strong>{fmt(candidatosOrdenados[1].vap)}</strong>
              <b>{pct(candidatosOrdenados[1].pvapn)}</b>
            </div>
          </section>
        )}

        {/* ============================
            CONTEÚDO
        ============================ */}
        <section className="grid">
          {/* ============================
              MAPA
          ============================ */}
          <div className="map-card">
            <div className="card-head">
              <div>
                <small>MAPA ELEITORAL ({round}º TURNO)</small>
                <h2>{title}</h2>
              </div>

              {uf !== "BR" && (
                <button onClick={voltarParaBrasil}>Voltar para o Brasil</button>
              )}
            </div>

            <div className="map-wrap">
              <brazil-component
                ref={mapRef}
                className="brazil-map"
                hidden-states=""
                style={{
                  "--brazil-bg-color": "transparent",
                  "--brazil-bg-hover-color": "transparent",
                  "--brazil-stroke-color": "#07111f",
                  "--brazil-stroke-hover-color": "#ffffff",
                  "--brazil-acronym-color": "#dcebf6",
                  "--brazil-acronym-hover-color": "#ffffff",
                }}
              />

              {!mapReady && <div className="loading">Carregando mapa…</div>}
            </div>

            <p className="hint">
              Clique em um estado para abrir a apuração detalhada daquela UF.
            </p>
          </div>

          {/* ============================
              RESULTADOS LATERAIS
          ============================ */}
          <aside className="results-card">
            <small>APURAÇÃO — {round}º TURNO</small>
            <h2>{title}</h2>

            {carregandoTSE && (
              <div
                className="loading-sub"
                style={{
                  margin: "10px 0",
                  fontSize: "0.9rem",
                  color: "#4b91c2",
                }}
              >
                Carregando dados do {round}º turno para {title}...
              </div>
            )}

            {!carregandoTSE && candidatosOrdenados.length === 0 && (
              <div
                className="loading-sub"
                style={{
                  margin: "15px 0",
                  fontSize: "0.9rem",
                  color: "#94a3b8",
                }}
              >
                Nenhum candidato retornado para este turno.
              </div>
            )}

            {candidatosOrdenados.map((candidato) => {
              const percentual = Number(
                String(candidato.pvapn || candidato.pvap || 0).replace(
                  ",",
                  ".",
                ),
              );
              return (
                <div className="candidate" key={candidato.sqcand}>
                  <div className="candidate-top">
                    <span>{candidato.nmu || candidato.nm}</span>
                    <b>{pct(percentual)}</b>
                  </div>

                  <div className="bar">
                    <i
                      style={{
                        width: `${percentual}%`,
                        backgroundColor: obterCorCandidato(candidato),
                      }}
                    />
                  </div>

                  <strong>{fmt(candidato.vap)} votos</strong>
                </div>
              );
            })}

            <hr />

            <div className="info">
              <span>Turno</span>
              <b>{round}º</b>
            </div>

            <div className="info">
              <span>Seções totalizadas</span>
              <b>{percentualApurado}%</b>
            </div>

            <div className="info">
              <span>Votos válidos</span>
              <b>{fmt(votosValidos)}</b>
            </div>

            <div className="info">
              <span>Última atualização</span>
              <b>{ultimaAtualizacao}</b>
            </div>

            <div className="notice">
              <b>Dados oficiais</b>
              <p>
                Dados carregados diretamente do arquivo oficial de resultados do
                TSE ({round}º Turno).
              </p>
            </div>
          </aside>
        </section>
      </main>

      <footer>
        Mapa SVG incorporado pelo pacote <code>brazil-map</code>. Resultados
        oficiais ligados aos dados do TSE.
      </footer>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
