# absolute-cinema 🎬

Filmes com sessão legendada nos cinemas monitorados, direto da API do ingresso.com.

> Deploy: GitHub → Cloudflare (Workers Builds, automático a cada push em `main`).

Lista **todos os filmes com sessão legendada** do cinema (cidade **473** — Três Lagoas, cinema **1537** — CinépolisShopping Três Lagoas) usando a API do ingresso.com:

```
https://api-content.ingresso.com/v0/sessions/city/473/theater/1537/partnership/home/groupBy/sessionType
```

Toda vez que um comando de script é executado, a rota é consultada **ao vivo** (sem cache), sempre devolvendo os dados mais recentes — nome do filme, data e horário de cada sessão legendada.

## Stack

- Node.js (fetch nativo)
- TypeScript 7 (compilador nativo — versão mais recente)
- tsx (executa TypeScript direto, versão mais recente)
- Wrangler 4 + Cloudflare Workers (site/hospedagem — versão mais recente)

## Uso

```bash
npm install
npm start            # lista os filmes com sessão legendada (nome, data e horário)
npm run sessions     # idem
npm run legendado    # idem
npm run dev          # modo watch, refaz a requisição a cada execução
npm run build        # compila a CLI para dist/ (não consulta a API)
npm run dev:web      # site completo local: front + API em http://localhost:8787
npm run deploy       # publica o site no Cloudflare
npm run check        # valida os tipos da CLI e do Worker
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

## Site (front + Cloudflare Worker)

O repositório também contém uma versão web do comando: uma página com um único botão que, ao clicar, consulta `/api/sessions` (o Worker) e lista os filmes legendados com data e horário.

```bash
npm run dev:web   # sobe front + Worker localmente em http://localhost:8787
npm run deploy    # verifica tipos e publica no Cloudflare (Workers + Assets)
```

A rota `/api/sessions` funciona como proxy com CORS restritivo e cache de 60 s no edge — a API do ingresso.com não permite chamadas diretas do navegador (sem CORS), por isso o Worker é necessário.

### Publicação (passos manuais)

1. `npx wrangler login` — autentica sua conta Cloudflare pelo navegador
2. `npm run deploy` — publica; o CLI imprime a URL final (`*.workers.dev`)
3. (Opcional) No dashboard do Cloudflare, defina a variável `ALLOWED_ORIGIN` no Worker com seu domínio final para reforçar o CORS
4. (Opcional) Conecte o repositório GitHub a uma Worker para deploy automático a cada `git push`

A Worker se chama `tres-lagoas`; a URL final fica em `https://tres-lagoas.<subdomínio-da-conta>.workers.dev`.

### Estrutura

```
absolute-cinema/
├── package.json
├── tsconfig.json           # CLI (tipos Node)
├── tsconfig.worker.json    # Worker (tipos Cloudflare)
├── wrangler.jsonc          # front estático + worker na rota /api/*
├── .gitignore
├── src/
│   ├── index.ts            # CLI: imprime as sessões legendadas
│   ├── worker.ts           # backend do site: proxy + cache + CORS
│   ├── ingresso.ts         # cliente da API (usado pela CLI e pelo site)
│   └── types.ts            # tipos da resposta da API do ingresso.com
└── web/                    # front-end (HTML/CSS/JS puro)
    ├── index.html
    ├── style.css
    └── main.js
```

