/** Tipos da resposta da API de sessões do ingresso.com */

export interface SessionTypeDetail {
  id: number;
  name: string;
  alias: string;
  display: boolean;
}

export interface Session {
  id: string;
  boxOfficeId: string;
  eventBoxOfficeId: string;
  price: number;
  room: string;
  type: string[];
  types: SessionTypeDetail[];
  date: SessionDate;
  realDate: SessionDate;
  time: string;
  siteURL: string | null;
  enabled: boolean;
  blockMessage: string;
}

export interface SessionDate {
  /** ISO 8601 com offset local, ex.: 2026-10-22T15:50:00-03:00 */
  localDate: string;
  isToday: boolean;
  dayOfWeek: string;
  dayAndMonth: string;
  hour: string;
  year: string;
}

/** Grupo de sessões de um filme, separadas por formato/idioma (ex.: Normal + Legendado) */
export interface SessionTypeGroup {
  type: string[];
  sessions: Session[];
}

export interface Movie {
  id: string;
  type: string;
  title: string;
  originalTitle: string;
  duration: string;
  contentRating: string;
  distributor: string;
  urlKey: string;
  siteURL: string;
  siteURLByTheater: string;
  releaseYear: number;
  genres: string[];
  images: { url: string; type: string }[];
  sessionTypes: SessionTypeGroup[];
}

export interface DaySessions {
  date: string;
  dateFormatted: string;
  dayOfWeek: string;
  isToday: boolean;
  movies: Movie[];
}

export type SessionsResponse = DaySessions[];

/** Sessão de filme legendada, já normalizada pra exibição */
export interface SubtitledMovieSession {
  id: string;
  /** Ex.: 22/10 */
  dayAndMonth: string;
  dayOfWeek: string;
  /** Ex.: 15:50 */
  time: string;
  fullDate: string;
  room: string;
  price: number;
  siteURL: string | null;
}

/** Filme com somente as sessões legendadas, pronto para exibição */
export interface SubtitledMovie {
  id: string;
  title: string;
  originalTitle: string;
  contentRating: string;
  siteURL: string;
  sessions: SubtitledMovieSession[];
}
