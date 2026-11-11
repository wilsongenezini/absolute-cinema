/// <reference types="@cloudflare/workers-types" />

import { THEATERS, fetchAllTheaters, fetchTheater } from "./ingresso.js";
import {
  HISTORY_THEATER_ID,
  readHistory,
  recordTheaterHistory,
} from "./history.js";

/** Tempo, em segundos, que o navegador pode reutilizar a resposta */
const BROWSER_TTL_SECONDS = 60;
/** Tempo em que a cópia do edge é considerada fresca */
const FRESH_SECONDS = 300;
/** Frescor reduzido quando algum cinema falhou, para tentar de novo logo */
const DEGRADED_FRESH_SECONDS = 60;
/**
 * Tempo máximo em que uma cópia vencida ainda é servida enquanto o Worker
 * a revalida em segundo plano (stale-while-revalidate).
 */
const STALE_SECONDS = 3600;
const FRESH_UNTIL_HEADER = "x-fresh-until";

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export interface Env {
  /**
   * Origem externa autorizada a consumir a API (header Origin).
   * Ex.: "https://absolute-cinema.minha-conta.workers.dev".
   * Vazio (padrão): nenhum header CORS é enviado, então só o próprio site
   * (mesma origem) consegue ler as respostas pelo navegador.
   */
  ALLOWED_ORIGIN?: string;
  DB: D1Database;
}

const json = (
  body: string,
  status: number,
  corsHeaders: HeadersInit,
  cacheControl = `public, max-age=${BROWSER_TTL_SECONDS}`,
) =>
  new Response(body, {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": cacheControl,
      ...corsHeaders,
    },
  });

const errorJson = (message: string, status: number, corsHeaders: HeadersInit) =>
  json(JSON.stringify({ error: message }), status, corsHeaders, "no-store");

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : "Erro inesperado";

interface Produced {
  data: unknown;
  /** Por quantos segundos a cópia do edge fica fresca */
  freshSeconds: number;
}

/**
 * Serve o JSON a partir do cache do edge. Cópia fresca: devolve direto.
 * Cópia vencida: devolve mesmo assim e revalida em segundo plano, para que
 * nenhuma visita espere as fontes externas. Sem cópia: produz na hora.
 */
async function serveCached(
  url: URL,
  ctx: ExecutionContext,
  corsHeaders: HeadersInit,
  produce: () => Promise<Produced>,
): Promise<Response> {
  const cache = caches.default;
  // Chave sem headers do visitante; o CORS é aplicado só na hora de servir
  const cacheKey = new Request(url.toString(), { method: "GET" });

  const refresh = async (): Promise<string> => {
    const { data, freshSeconds } = await produce();
    const body = JSON.stringify(data);
    ctx.waitUntil(
      cache.put(
        cacheKey,
        new Response(body, {
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": `public, max-age=${STALE_SECONDS}`,
            [FRESH_UNTIL_HEADER]: String(Date.now() + freshSeconds * 1000),
          },
        }),
      ),
    );
    return body;
  };

  const hit = await cache.match(cacheKey);
  if (hit) {
    const freshUntil = Number(hit.headers.get(FRESH_UNTIL_HEADER));
    if (!(Date.now() < freshUntil)) {
      ctx.waitUntil(
        refresh().catch((error) =>
          console.error(`Falha ao revalidar ${url.pathname}:`, error),
        ),
      );
    }
    return json(await hit.text(), 200, corsHeaders);
  }

  return json(await refresh(), 200, corsHeaders);
}

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

    // CORS restritivo: sem ALLOWED_ORIGIN, só o próprio site (mesma origem)
    const corsHeaders: HeadersInit = env.ALLOWED_ORIGIN
      ? { "access-control-allow-origin": env.ALLOWED_ORIGIN, vary: "Origin" }
      : {};
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...corsHeaders,
          "access-control-allow-methods": "GET",
        },
      });
    }

    if (url.pathname !== "/api/sessions" && url.pathname !== "/api/history") {
      return errorJson("Recurso não encontrado.", 404, corsHeaders);
    }
    if (request.method !== "GET") {
      return errorJson("Use GET para consultar esta rota.", 405, corsHeaders);
    }

    if (url.pathname === "/api/history") {
      const month = url.searchParams.get("month") ?? undefined;
      if (month !== undefined && !MONTH_PATTERN.test(month)) {
        return errorJson("Informe o mês no formato AAAA-MM.", 400, corsHeaders);
      }

      // Só o parâmetro conhecido entra na chave do cache
      const keyUrl = new URL(url.pathname, url.origin);
      if (month) keyUrl.searchParams.set("month", month);

      try {
        return await serveCached(keyUrl, ctx, corsHeaders, async () => ({
          data: await readHistory(env.DB, month),
          freshSeconds: FRESH_SECONDS,
        }));
      } catch (error) {
        return errorJson(
          `Não foi possível consultar o histórico: ${messageOf(error)}`,
          500,
          corsHeaders,
        );
      }
    }

    try {
      const keyUrl = new URL(url.pathname, url.origin);
      return await serveCached(keyUrl, ctx, corsHeaders, async () => {
        const groups = await fetchAllTheaters(THEATERS);
        return {
          data: groups,
          freshSeconds: groups.some((group) => group.error)
            ? DEGRADED_FRESH_SECONDS
            : FRESH_SECONDS,
        };
      });
    } catch (error) {
      return errorJson(
        `Não foi possível consultar os cinemas: ${messageOf(error)}`,
        502,
        corsHeaders,
      );
    }
  },

  /** O histórico é gravado somente aqui, nunca durante uma visita ao site. */
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
