# absolute-cinema 🎬

Filmes com sessão legendada nos cinemas monitorados, com programação ao vivo e retrospecto de Três Lagoas.

> Deploy: GitHub → Cloudflare (Workers Builds, automático a cada push em `main`).

O projeto consulta os cinemas configurados em `src/ingresso.ts`. A programação de Três Lagoas vem da API do ingresso.com (cidade **473**, cinema **1537** — Cinépolis Shopping Três Lagoas):

```
https://api-content.ingresso.com/v0/sessions/city/473/theater/1537/partnership/home/groupBy/sessionType
```

As sessões exibidas são legendadas. Sessões esgotadas também aparecem quando continuam na programação; bloqueios por outros motivos permanecem ocultos. O retrospecto grava somente as sessões do Cinépolis Shopping Três Lagoas; os demais cinemas continuam aparecendo apenas na consulta ao vivo.

## Stack

- Node.js (fetch nativo)
- TypeScript 7 (compilador nativo — versão mais recente)
- tsx (executa TypeScript direto, versão mais recente)
- Wrangler 4 + Cloudflare Workers (site/hospedagem — versão mais recente)

## Uso

```bash
npm install
npm start            # lista os filmes com sessão legendada (nome, data e horário)
npm run dev          # modo watch, refaz a requisição a cada execução
npm run build        # compila a CLI para dist/ (não consulta a API)
npm run dev:web      # site completo local: front + API em http://localhost:8787
npm run db:migrate:local  # cria as tabelas do histórico no D1 local
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

O site oferece dois botões:

- **Ver filmes legendados** consulta `/api/sessions` e mantém a programação ao vivo dos cinemas configurados.
- **Ver retrospecto** consulta `/api/history` e exibe sessões legendadas registradas no Cinépolis Shopping Três Lagoas, agrupadas por mês.

A mensagem abaixo do botão **Ver retrospecto** informa que o histórico começa em **28 de outubro de 2026**; ela aparece após clicar no botão. O retrospecto abre no mês mais recente e os anteriores são carregados sob demanda (`/api/history?month=AAAA-MM`).

O histórico é gravado somente pela coleta agendada, que roda às 09h, 12h, 15h, 18h e 21h no horário de Três Lagoas (MS, UTC-4) e acessa apenas esse cinema. Visitas ao site não escrevem no banco.

Os horários das sessões são hora local de cada cinema. A API do ingresso.com anexa `-03:00` também às sessões de Três Lagoas, então o site ignora esse offset e compara pelo fuso configurado em `THEATERS` (`timeZone`).

### Banco de dados (Cloudflare D1)

A base `absolute-cinema-history` já está criada e vinculada em `wrangler.jsonc`. Se for executar o projeto em outra conta Cloudflare, crie uma base e atualize o `database_id` com o UUID retornado:

```bash
npx wrangler d1 create absolute-cinema-history
```

Para preparar o banco local e iniciar o site:

```bash
npm run db:migrate:local
npm run dev:web
```

Antes de publicar, aplique a migração remota e faça o deploy:

```bash
npm run db:migrate:remote
npm run deploy
```

O histórico é acumulado a partir da implantação/coleta: a API de programação não fornece um arquivo completo de sessões antigas. Ele registra sessões anunciadas pela programação, não confirma que uma sessão ocorreu de fato.

A rota `/api/sessions` funciona como proxy — a API do ingresso.com não permite chamadas diretas do navegador (sem CORS), por isso o Worker é necessário. `/api/history` consulta o D1.

As duas rotas usam o cache do edge: a cópia fica fresca por 5 min (1 min se algum cinema falhou) e, depois disso, continua sendo servida por até 1 h enquanto o Worker a revalida em segundo plano, de modo que a visita não espera as fontes externas. O navegador reutiliza a resposta por 60 s.

Sem `ALLOWED_ORIGIN`, nenhum header CORS é enviado e só o próprio site (mesma origem) lê a API pelo navegador.

### Publicação (passos manuais)

1. `npx wrangler login` — autentica sua conta Cloudflare pelo navegador
2. `npm run deploy` — publica; o CLI imprime a URL final (`*.workers.dev`)
3. (Opcional) Defina a variável `ALLOWED_ORIGIN` no Worker para liberar a API a um site em outra origem
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
│   ├── worker.ts           # backend: proxy, histórico, agendamento, cache e CORS
│   ├── history.ts          # persistência e consulta do histórico de Três Lagoas
│   ├── ingresso.ts         # cliente da API (usado pela CLI e pelo site)
│   └── types.ts            # tipos da resposta da API do ingresso.com
├── migrations/             # migrações do banco D1
└── web/                    # front-end (HTML/CSS/JS puro)
    ├── index.html
    ├── style.css
    ├── main.js
    └── fonts/              # Bebas Neue (OFL), servida localmente
```
