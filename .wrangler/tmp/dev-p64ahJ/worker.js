var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/grupocine.ts
var SITE_BASE = "https://www.grupocine.com.br";
async function fetchGrupocineHtml(programacaoUrl) {
  const response = await fetch(programacaoUrl, {
    signal: AbortSignal.timeout(2e4),
    headers: {
      accept: "text/html",
      // o site é renderizado por template server-side; botão padrão basta
      "user-agent": "absolute-cinema/1.0 (+https://github.com/wilsongenezini/absolute-cinema)"
    }
  });
  if (!response.ok) {
    throw new Error(
      `O site do Grupo Cine respondeu ${response.status} (${response.statusText})`
    );
  }
  return await response.text();
}
__name(fetchGrupocineHtml, "fetchGrupocineHtml");
function extractSubtitledMoviesGrupocine(html) {
  const movieBlocks = matchAll(html, /<div class="filme-box">[\S\s]*?(?=<div class="filme-box">|$)/g);
  const movies = [];
  for (const [block = ""] of movieBlocks) {
    if (!block) continue;
    const title = firstCapture(block, /titulo-filme">\s*([\S\s]*?)<\/h2>/);
    if (!title) continue;
    const sessions = [];
    for (const [button, buyUrl = "", content = ""] of matchAll(
      block,
      /<a href="([^"]+)"[^>]*class="btn btn-horario">([\S\s]*?)<\/a>/g
    )) {
      void button;
      const time = firstCapture(content, /class="fw-bold">\s*(\d{1,2}:\d{2})/);
      const hidden = normalizeSpaces(
        firstCapture(content, /class="visually-hidden">([\S\s]*?)<\/span>/) ?? ""
      );
      const dateMatch = hidden.match(
        /,\s*em\s+(\d{2})\/(\d{2})\/(\d{4}),\s*(.*)$/
      );
      if (!time || !dateMatch) continue;
      const [, day, month, year, rest = ""] = dateMatch;
      if (!day || !month || !year) continue;
      if (!/legendado/i.test(rest)) continue;
      const room = firstCapture(rest, /sala\s+([^,]+)/i) ?? "N\xE3o informada";
      const isoDate = `${year}-${month}-${day}T${time}:00-03:00`;
      sessions.push({
        id: buyUrl || `${title}-${isoDate}`,
        dayAndMonth: `${day}/${month}`,
        dayOfWeek: weekdayOf(isoDate),
        time,
        fullDate: isoDate,
        room: formatRoom(room),
        price: 0,
        siteURL: buyUrl || null
      });
    }
    if (sessions.length === 0) continue;
    const infoUrl = firstCapture(
      block,
      /<a href="(https?:\/\/(?:www\.)?grupocine\.com\.br\/filme\/[^"]+)"/
    ) ?? "";
    const contentRating = firstCapture(block, /classificacao-box[^>]*>\s*([^<]*?)\s*</) ?? "";
    const existing = movies.find((movie) => movie.title === title);
    if (existing) {
      existing.sessions.push(...sessions);
    } else {
      movies.push({
        id: infoUrl || title,
        title,
        originalTitle: title,
        contentRating,
        siteURL: infoUrl || SITE_BASE,
        sessions
      });
    }
  }
  return movies.map((movie) => ({
    ...movie,
    sessions: [...movie.sessions].sort((a, b) => a.fullDate.localeCompare(b.fullDate))
  })).sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
}
__name(extractSubtitledMoviesGrupocine, "extractSubtitledMoviesGrupocine");
function matchAll(source, regex) {
  return [...source.matchAll(regex)];
}
__name(matchAll, "matchAll");
function normalizeSpaces(text) {
  return text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
__name(normalizeSpaces, "normalizeSpaces");
function firstCapture(source, regex) {
  return normalizeSpaces(regex.exec(source)?.[1] ?? "");
}
__name(firstCapture, "firstCapture");
function formatRoom(room) {
  if (/^sala\s*\d+$/i.test(room)) return `Sala ${room.replace(/^sala\s*/i, "")}`;
  if (/^\d+$/.test(room)) return `Sala ${room}`;
  return room;
}
__name(formatRoom, "formatRoom");
var WEEKDAY = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  timeZone: "America/Sao_Paulo"
});
function weekdayOf(isoDate) {
  const date = new Date(isoDate);
  return isNaN(date.valueOf()) ? "" : WEEKDAY.format(date);
}
__name(weekdayOf, "weekdayOf");

// src/ingresso.ts
var THEATERS = [
  {
    id: "tres-lagoas",
    name: "Cin\xE9polis Shopping Tr\xEAs Lagoas",
    source: { kind: "ingresso", cityId: "473", theaterId: "1537" }
  },
  {
    id: "andradina",
    name: "Grupo Cine Andradina",
    source: { kind: "grupocine", programacaoUrl: "https://www.grupocine.com.br/andradina/programacao" }
  },
  {
    id: "aracatuba",
    name: "Cine Ara\xFAjo Multiplex Pra\xE7a Nova Ara\xE7atuba",
    source: { kind: "ingresso", cityId: "83", theaterId: "1645" }
  }
];
function buildSessionsUrl(cityId, theaterId, partnership = "home") {
  return `https://api-content.ingresso.com/v0/sessions/city/${cityId}/theater/${theaterId}/partnership/${partnership}/groupBy/sessionType`;
}
__name(buildSessionsUrl, "buildSessionsUrl");
function isEnabled(session) {
  return session.enabled && !session.blockMessage;
}
__name(isEnabled, "isEnabled");
function isSubtitled(session) {
  return session.type.includes("Legendado");
}
__name(isSubtitled, "isSubtitled");
function extractSubtitledMovies(response) {
  const byMovie = /* @__PURE__ */ new Map();
  for (const day of response) {
    for (const movie of day.movies) {
      const subtitledSessions = movie.sessionTypes.flatMap((group) => group.sessions).filter((session) => isSubtitled(session) && isEnabled(session));
      if (subtitledSessions.length === 0) continue;
      const accumulated = byMovie.get(movie.id);
      if (accumulated) {
        accumulated.sessions.push(...subtitledSessions.map(toView));
      } else {
        byMovie.set(movie.id, {
          id: movie.id,
          title: movie.title,
          originalTitle: movie.originalTitle,
          contentRating: movie.contentRating,
          siteURL: movie.siteURLByTheater || movie.siteURL,
          sessions: subtitledSessions.map(toView)
        });
      }
    }
  }
  const sessionsAscending = /* @__PURE__ */ __name((a, b) => a.fullDate.localeCompare(b.fullDate), "sessionsAscending");
  return [...byMovie.values()].sort((a, b) => a.title.localeCompare(b.title, "pt-BR")).map((movie) => ({
    ...movie,
    sessions: [...movie.sessions].sort(sessionsAscending)
  }));
}
__name(extractSubtitledMovies, "extractSubtitledMovies");
function toView(session) {
  return {
    id: session.id,
    dayAndMonth: session.realDate.dayAndMonth,
    dayOfWeek: session.realDate.dayOfWeek,
    time: session.time,
    fullDate: session.realDate.localDate,
    room: session.room,
    price: session.price,
    siteURL: session.siteURL
  };
}
__name(toView, "toView");
async function fetchSessions(cityId, theaterId) {
  const url = buildSessionsUrl(cityId, theaterId);
  const response = await fetch(url, {
    signal: AbortSignal.timeout(15e3),
    headers: {
      accept: "application/json"
    }
  });
  if (!response.ok) {
    throw new Error(
      `A API respondeu ${response.status} (${response.statusText}) em ${url}`
    );
  }
  return await response.json();
}
__name(fetchSessions, "fetchSessions");
async function fetchTheater(theater) {
  if (theater.source.kind === "grupocine") {
    const html = await fetchGrupocineHtml(theater.source.programacaoUrl);
    return { theater, movies: extractSubtitledMoviesGrupocine(html) };
  }
  const sessions = await fetchSessions(
    theater.source.cityId,
    theater.source.theaterId
  );
  return { theater, movies: extractSubtitledMovies(sessions) };
}
__name(fetchTheater, "fetchTheater");
async function fetchAllTheaters(theaters) {
  return Promise.all(
    theaters.map(async (theater) => {
      try {
        return await fetchTheater(theater);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Erro inesperado";
        return { theater, movies: [], error: message };
      }
    })
  );
}
__name(fetchAllTheaters, "fetchAllTheaters");

// src/worker.ts
var CACHE_TTL_SECONDS = 60;
var json = /* @__PURE__ */ __name((data, status, corsHeaders = {}) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": `public, max-age=${CACHE_TTL_SECONDS}`,
    ...corsHeaders
  }
}), "json");
var worker_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const corsHeaders = {
      "access-control-allow-origin": env.ALLOWED_ORIGIN || "*",
      vary: "Origin"
    };
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...corsHeaders,
          "access-control-allow-methods": "GET"
        }
      });
    }
    if (url.pathname !== "/api/sessions") {
      return json({ error: "Recurso n\xE3o encontrado." }, 404, corsHeaders);
    }
    if (request.method !== "GET") {
      return json(
        { error: "Use GET para consultar as sess\xF5es." },
        405,
        corsHeaders
      );
    }
    const cache = caches.default;
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    try {
      ctx.passThroughOnException();
      const groups = await fetchAllTheaters(THEATERS);
      const response = json(groups, 200, corsHeaders);
      ctx.waitUntil(cache.put(request, response.clone()));
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro inesperado";
      return json(
        { error: `N\xE3o foi poss\xEDvel consultar o ingresso.com: ${message}` },
        502,
        corsHeaders
      );
    }
  }
};

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-AD9ksp/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-AD9ksp/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=worker.js.map
