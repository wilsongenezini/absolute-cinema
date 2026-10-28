/// <reference types="@cloudflare/workers-types" />

import { THEATERS, fetchAllTheaters, fetchTheater } from "./ingresso.js";
import {
  HISTORY_THEATER_ID,
  readHistory,
  recordTheaterHistory,
} from "./history.js";

/** Tempo, em segundos, da resposta em cache no edge do Cloudflare */
const CACHE_TTL_SECONDS = 60;

export interface Env {
  /**
   * Origem autorizada a consumir a API do site (header Origin).
   * Ex.: "https://absolute-cinema.minha-conta.workers.dev".
   * Configure no dashboard do worker após o primeiro deploy, ou deixe
   * "" (vazio) para permitir qualquer origem — é público e sem segredos,
   * então "*" é seguro por padrão.
   */
  ALLOWED_ORIGIN?: string;
  DB: D1Database;
}

const json = (
  data: unknown,
  status: number,
  corsHeaders: HeadersInit = {},
  cacheControl = `public, max-age=${CACHE_TTL_SECONDS}`,
) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": cacheControl,
      ...corsHeaders,
    },
  });

async function collectTresLagoasHistory(db: D1Database): Promise<void> {
  const theater = THEATERS.find(({ id }) => id === HISTORY_THEATER_ID);
  if (!theater) {
    throw new Error(`Cinema de histórico não configurado: ${HISTORY_THEATER_ID}`);
  }

  const group = await fetchTheater(theater);
  await recordTheaterHistory(db, group);
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);

    // CORS restritivo: só o próprio site (ou ALLOWED_ORIGIN) consome esta rota
    const corsHeaders: HeadersInit = {
      "access-control-allow-origin": env.ALLOWED_ORIGIN || "*",
      vary: "Origin",
    };
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...corsHeaders,
          "access-control-allow-methods": "GET",
        },
      });
    }

    if (url.pathname === "/api/history") {
      if (request.method !== "GET") {
        return json(
          { error: "Use GET para consultar o histórico." },
          405,
          corsHeaders,
          "no-store",
        );
      }

      try {
        return json(await readHistory(env.DB), 200, corsHeaders, "no-store");
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Erro inesperado";
        return json(
          { error: `Não foi possível consultar o histórico: ${message}` },
          500,
          corsHeaders,
          "no-store",
        );
      }
    }

    if (url.pathname !== "/api/sessions") {
      return json({ error: "Recurso não encontrado." }, 404, corsHeaders);
    }
    if (request.method !== "GET") {
      return json(
        { error: "Use GET para consultar as sessões." },
        405,
        corsHeaders,
      );
    }

    // Serve do cache do edge quando disponível, para não bater na API
    // do ingresso.com a cada visita
    const cache = caches.default;
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }

    try {
      ctx.passThroughOnException();
      const groups = await fetchAllTheaters(THEATERS);
      const historyGroup = groups.find(
        ({ theater }) => theater.id === HISTORY_THEATER_ID,
      );
      if (historyGroup) {
        ctx.waitUntil(
          recordTheaterHistory(env.DB, historyGroup).catch((error) =>
            console.error(
              "Não foi possível gravar o histórico de Três Lagoas:",
              error,
            ),
          ),
        );
      }

      const response = json(groups, 200, corsHeaders);
      ctx.waitUntil(cache.put(request, response.clone()));
      return response;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro inesperado";
      return json(
        { error: `Não foi possível consultar o ingresso.com: ${message}` },
        502,
        corsHeaders,
      );
    }
  },

  async scheduled(
    _controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    ctx.waitUntil(
      collectTresLagoasHistory(env.DB).catch((error) => {
        console.error(
          "Falha na coleta agendada do histórico de Três Lagoas:",
          error,
        );
      }),
    );
  },
};
