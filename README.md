# absolute-cinema 🎬

Lista **todos os filmes com sessão legendada** do cinema (cidade **473** — Três Lagoas, cinema **1537** — CinépolisShopping Três Lagoas) usando a API do ingresso.com:

```
https://api-content.ingresso.com/v0/sessions/city/473/theater/1537/partnership/home/groupBy/sessionType
```

Toda vez que um comando de script é executado, a rota é consultada **ao vivo** (sem cache), sempre devolvendo os dados mais recentes — nome do filme, data e horário de cada sessão legendada.

## Stack

- Node.js (fetch nativo)
- TypeScript 7 (compilador nativo — versão mais recente)
- tsx (executa TypeScript direto, versão mais recente)

## Uso

```bash
npm install
npm start            # lista os filmes com sessão legendada (nome, data e horário)
npm run sessions     # idem
npm run legendado    # idem
npm run dev          # modo watch, refaz a requisição a cada execução
npm run build        # compila para dist/ (não consulta a API)
```

### Opções

```bash
npm start -- --json    # saída em JSON processável
npm start -- --debug   # mostra totais gerais da resposta
```

### Sobrescrever cidade/cinema

```bash
INGRESSO_CITY_ID=<id> INGRESSO_THEATER_ID=<id> npm start
```

## Exemplo de saída

```
🎬 6 sessões legendadas em 3 filmes

🍿 Dune: Part Two (Dune: Part Two)
   🗓️  22/10 (quinta-feira) às 19:10 — Sala 3 — R$ 45,60
   🗓️  22/10 (quinta-feira) às 22:40 — Sala 3 — R$ 45,60
```

## Estrutura

```
absolute-cinema/
├── package.json
├── tsconfig.json
├── .gitignore
└── src/
    ├── index.ts      # CLI: formata e imprime as sessões legendadas
    ├── ingresso.ts   # cliente da API + extração das sessões legendadas
    └── types.ts      # tipos da resposta da API do ingresso.com
```
