/// <reference types="@cloudflare/workers-types" />

import {
  DEFAULT_CITY_ID,
  DEFAULT_THEATER_ID,
  extractSubtitledMovies,
  fetchSessions,
} from "./ingresso.js";

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
}

const json = (data: unknown, status: number, corsHeaders: HeadersInit = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=${CACHE_TTL_SECONDS}`,
      ...corsHeaders,
    },
  });

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
      const sessions = await fetchSessions(
        DEFAULT_CITY_ID,
        DEFAULT_THEATER_ID,
      );
      const subtitled = extractSubtitledMovies(sessions);
      const response = json(subtitled, 200, corsHeaders);
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
};
