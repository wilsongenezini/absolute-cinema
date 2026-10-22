import type {
  Session,
  SessionsResponse,
  SubtitledMovie,
} from "./types.js";

export const DEFAULT_CITY_ID = "473";
export const DEFAULT_THEATER_ID = "1537";

/** Cinemas monitorados pelo site/CLI */
export interface TheaterConfig {
  cityId: string;
  theaterId: string;
  name: string;
}

export const THEATERS: TheaterConfig[] = [
  { cityId: "473", theaterId: "1537", name: "Cinépolis Shopping Três Lagoas" },
  {
    cityId: "83",
    theaterId: "1645",
    name: "Cine Araújo Multiplex Praça Nova Araçatuba",
  },
];

/** Sessões legendadas de um cinema */
export interface TheaterSessions {
  theater: TheaterConfig;
  movies: SubtitledMovie[];
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

export function isSubtitled(session: Session): boolean {
  return session.type.includes("Legendado");
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
        .filter((session) => isSubtitled(session) && isEnabled(session));

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

/** Busca as sessões legendadas de vários cinemas em paralelo */
export async function fetchAllTheaters(
  theaters: TheaterConfig[],
): Promise<TheaterSessions[]> {
  return Promise.all(
    theaters.map(async (theater) => {
      const sessions = await fetchSessions(theater.cityId, theater.theaterId);
      return { theater, movies: extractSubtitledMovies(sessions) };
    }),
  );
}
