# Eleições 2026 — Mapa interativo

Projeto React + Vite com mapa SVG dos 26 estados + DF incorporado via pacote npm `brazil-map`. O mapa não depende de GeoJSON/CDN em tempo de execução: depois de `npm install`, os arquivos do mapa ficam em `node_modules`.

## Rodar

```bash
npm install
npm run dev
```

Abra o endereço mostrado pelo Vite, normalmente `http://localhost:5173`.

## O que já está pronto

- seletor 1º turno / 2º turno;
- mapa dos 27 entes federativos;
- estados clicáveis;
- painel do estado selecionado;
- interface responsiva;
- dados de demonstração zerados, sem inventar resultado eleitoral.

## Próxima etapa

Conectar o painel aos arquivos oficiais do TSE. O TSE informa que a divulgação de 2026 usa arquivos EA14, EA15 e EA20 e que o Presidente é obtido da totalização nacional no EA20. Também informa limite de 100 requisições por IP por segundo e que múltiplos 404 podem gerar bloqueio temporário.
