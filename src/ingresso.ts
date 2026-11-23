import {
  extractSubtitledMoviesGrupocine,
  fetchGrupocineHtml,
  fetchVeloxSeatAvailability,
  veloxSessionId,
} from "./grupocine.js";
import type {
  SeatAvailability,
  Session,
  SessionsResponse,
  SubtitledMovie,
  SubtitledMovieSession,
} from "./types.js";

export const DEFAULT_CITY_ID = "473";
export const DEFAULT_THEATER_ID = "1537";

/** Cinemas monitorados pelo site/CLI */
export interface TheaterConfig {
  id: string;
  name: string;
  /**
   * Fuso IANA do cinema. Os horários das fontes são hora local do cinema;
   * o offset que a API do ingresso.com anexa (-03:00) não é confiável
   * (Três Lagoas está em UTC-4).
   */
  timeZone: string;
  source:
    | { kind: "ingresso"; cityId: string; theaterId: string }
    | { kind: "grupocine"; programacaoUrl: string };
}

export const THEATERS: TheaterConfig[] = [
  {
    id: "tres-lagoas",
    name: "Cinépolis Shopping Três Lagoas",
    timeZone: "America/Campo_Grande",
    source: { kind: "ingresso", cityId: "473", theaterId: "1537" },
  },
  {
    id: "andradina",
    name: "Grupo Cine Andradina",
    timeZone: "America/Sao_Paulo",
    source: { kind: "grupocine", programacaoUrl: "https://www.grupocine.com.br/andradina/programacao" },
  },
  {
    id: "aracatuba",
    name: "Cine Araújo Multiplex Praça Nova Araçatuba",
    timeZone: "America/Sao_Paulo",
    source: { kind: "ingresso", cityId: "83", theaterId: "1645" },
  },
];

/** Sessões legendadas de um cinema */
export interface TheaterSessions {
  theater: TheaterConfig;
  movies: SubtitledMovie[];
  /** Preenchido quando não foi possível consultar o cinema */
  error?: string;
}

export function buildSessionsUrl(
  cityId: string,
  theaterId: string,
  partnership = "home",
): string {
  return `https://api-content.ingresso.com/v0/sessions/city/${cityId}/theater/${theaterId}/partnership/${partnership}/groupBy/sessionType`;
}

export function isEnabled(session: Session): boolean {
  return session.enabled && !session.blockMessage;
}

/** Sessões esgotadas continuam fazendo parte da programação do cinema. */
export function isSoldOut(session: Session): boolean {
  return /lotad|esgotad/i.test(session.blockMessage);
}

export function isSubtitled(session: Session): boolean {
  return session.type.includes("Legendado");
}

/** Sessão legendada que entra na listagem (à venda ou esgotada). */
export function isListed(session: Session): boolean {
  return isSubtitled(session) && (isEnabled(session) || isSoldOut(session));
}

/**
 * Reduz a resposta da API apenas aos filmes que possuem ao menos
 * uma sessão legendada, mantendo (e somando) as legendadas de todos os dias.
 */
export function extractSubtitledMovies(
  response: SessionsResponse,
): SubtitledMovie[] {
  const byMovie = new Map<string, SubtitledMovie>();

  for (const day of response) {
    for (const movie of day.movies) {
      const subtitledSessions = movie.sessionTypes
        .flatMap((group) => group.sessions)
        .filter(isListed);

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
          sessions: subtitledSessions.map(toView),
        });
      }
    }
  }

  const sessionsAscending = (
    a: SubtitledMovie["sessions"][number],
    b: SubtitledMovie["sessions"][number],
  ) => a.fullDate.localeCompare(b.fullDate);

  return [...byMovie.values()]
    .sort((a, b) => a.title.localeCompare(b.title, "pt-BR"))
    .map((movie) => ({
      ...movie,
      sessions: [...movie.sessions].sort(sessionsAscending),
    }));
}

function toView(session: Session): SubtitledMovie["sessions"][number] {
  return {
    id: session.id,
    dayAndMonth: session.realDate.dayAndMonth,
    dayOfWeek: session.realDate.dayOfWeek,
    time: session.time,
    fullDate: session.realDate.localDate,
    room: session.room,
    price: session.price,
    siteURL: session.siteURL,
  };
}

/**
 * Busca as sessões na rota do ingresso.com.
 * A requisição é feita a toda chamada — sem cache —, garantindo dados frescos.
 */
export async function fetchSessions(
  cityId: string,
  theaterId: string,
): Promise<SessionsResponse> {
  const url = buildSessionsUrl(cityId, theaterId);
  const response = await fetch(url, {
    signal: AbortSignal.timeout(15_000),
    headers: {
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `A API respondeu ${response.status} (${response.statusText}) em ${url}`,
    );
  }

  return (await response.json()) as SessionsResponse;
}

/**
 * Limite de consultas ao mapa de assentos por cinema, priorizando as sessões
 * mais próximas. Mantém o total de subrequisições do Worker sob controle.
 */
const MAX_SEAT_LOOKUPS_PER_THEATER = 20;

interface SeatMapResponse {
  lines?: { seats?: { status?: string }[] }[];
}

/** Conta as poltronas livres do mapa de assentos de uma sessão. */
export async function fetchSeatAvailability(
  sessionId: string,
  sectorId: string,
): Promise<SeatAvailability> {
  const url = `https://api.ingresso.com/v1/sessions/${encodeURIComponent(sessionId)}/sections/${encodeURIComponent(sectorId)}/seats?partnership=home`;
  const response = await fetch(url, {
    signal: AbortSignal.timeout(10_000),
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`O mapa de assentos respondeu ${response.status}`);
  }

  const map = (await response.json()) as SeatMapResponse;
  let available = 0;
  let total = 0;
  for (const line of map.lines ?? []) {
    for (const seat of line.seats ?? []) {
      total++;
      if (seat.status === "Available") available++;
    }
  }
  if (total === 0) throw new Error("Mapa de assentos vazio");
  return { available, total };
}

/** Hora local de um fuso como "AAAA-MM-DDTHH:mm:ss" (relógio de parede). */
function wallClockNow(timeZone: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    dateStyle: "short",
    timeStyle: "medium",
  })
    .format(new Date())
    .replace(" ", "T");
}

/** Consulta do mapa de assentos de uma sessão; null quando não há mapa */
type SeatLookup = (
  session: SubtitledMovieSession,
) => (() => Promise<SeatAvailability>) | null;

/**
 * Preenche a ocupação das sessões que ainda não começaram. Falhas são
 * silenciosas: a sessão apenas fica sem a porcentagem.
 */
async function attachSeatAvailability(
  theater: TheaterConfig,
  movies: SubtitledMovie[],
  lookupFor: SeatLookup,
): Promise<void> {
  const now = wallClockNow(theater.timeZone);
  const lookups = movies
    .flatMap((movie) => movie.sessions)
    .filter((session) => session.fullDate.slice(0, 19) > now)
    .sort((a, b) => a.fullDate.localeCompare(b.fullDate))
    .flatMap((session) => {
      const lookup = lookupFor(session);
      return lookup ? [{ session, lookup }] : [];
    })
    .slice(0, MAX_SEAT_LOOKUPS_PER_THEATER);

  await Promise.all(
    lookups.map(async ({ session, lookup }) => {
      try {
        session.seats = await lookup();
      } catch {
        // Sem mapa de assentos: a sessão continua listada, só sem a ocupação
      }
    }),
  );
}

/** Setor do mapa de assentos de cada sessão da resposta do ingresso.com */
function ingressoSeatLookup(raw: SessionsResponse): SeatLookup {
  const sectorBySession = new Map<string, string>();
  for (const day of raw) {
    for (const movie of day.movies) {
      for (const group of movie.sessionTypes) {
        for (const session of group.sessions) {
          if (session.hasSeatSelection !== false && session.defaultSector) {
            sectorBySession.set(session.id, session.defaultSector);
          }
        }
      }
    }
  }

  return (session) => {
    const sector = sectorBySession.get(session.id);
    return sector ? () => fetchSeatAvailability(session.id, sector) : null;
  };
}

/** A sessão da Velox vem codificada no link de compra do Grupo Cine */
const veloxSeatLookup: SeatLookup = (session) => {
  const id = veloxSessionId(session.siteURL);
  return id ? () => fetchVeloxSeatAvailability(id) : null;
};

/** Recebe a resposta bruta da API do ingresso.com (ex.: para depuração) */
export type RawSessionsListener = (
  theater: TheaterConfig,
  raw: SessionsResponse,
) => void;

/**
 * Busca as sessões legendadas de um cinema, despachando pela fonte.
 * Com `includeSeats`, consulta também a ocupação das próximas sessões.
 */
export async function fetchTheater(
  theater: TheaterConfig,
  onRaw?: RawSessionsListener,
  includeSeats = false,
): Promise<TheaterSessions> {
  if (theater.source.kind === "grupocine") {
    const html = await fetchGrupocineHtml(theater.source.programacaoUrl);
    const movies = extractSubtitledMoviesGrupocine(html);
    if (includeSeats) await attachSeatAvailability(theater, movies, veloxSeatLookup);
    return { theater, movies };
  }
  const sessions = await fetchSessions(
    theater.source.cityId,
    theater.source.theaterId,
  );
  onRaw?.(theater, sessions);
  const movies = extractSubtitledMovies(sessions);
  if (includeSeats) {
    await attachSeatAvailability(theater, movies, ingressoSeatLookup(sessions));
  }
  return { theater, movies };
}

/** Busca as sessões legendadas de vários cinemas em paralelo; um cinema
 * que falhar não derruba os demais */
export async function fetchAllTheaters(
  theaters: TheaterConfig[],
  onRaw?: RawSessionsListener,
): Promise<TheaterSessions[]> {
  return Promise.all(
    theaters.map(async (theater) => {
      try {
        return await fetchTheater(theater, onRaw, true);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Erro inesperado";
        return { theater, movies: [], error: message };
      }
    }),
  );
}
