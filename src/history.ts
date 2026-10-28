/// <reference types="@cloudflare/workers-types" />

import type { TheaterSessions } from "./ingresso.js";
import type { SubtitledMovie } from "./types.js";

/** The retrospective is intentionally limited to the Três Lagoas theater. */
export const HISTORY_THEATER_ID = "tres-lagoas";

/** Local Três Lagoas midnight on the first day covered by this archive. */
const HISTORY_START_AT = "2026-10-28T00:00:00-03:00";
const MAX_BATCH_SIZE = 100;

export interface HistoryPeriod {
  /** Local calendar month in YYYY-MM format. */
  month: string;
  movies: SubtitledMovie[];
}

interface HistoryRow {
  movieId: string;
  title: string;
  originalTitle: string;
  contentRating: string;
  movieSiteUrl: string;
  sessionId: string;
  dayAndMonth: string;
  dayOfWeek: string;
  time: string;
  fullDate: string;
  room: string;
  price: number;
  sessionSiteUrl: string | null;
}

/**
 * Stores only enabled, subtitled sessions already normalized by ingresso.ts.
 * Other cinemas can continue to be returned to the live page without entering
 * this archive.
 */
export async function recordTheaterHistory(
  db: D1Database,
  group: TheaterSessions,
  observedAt = new Date(),
): Promise<void> {
  if (group.theater.id !== HISTORY_THEATER_ID || group.error) return;

  const movies = group.movies.filter((movie) => movie.sessions.length > 0);
  if (movies.length === 0) return;

  const timestamp = observedAt.toISOString();
  const statements: D1PreparedStatement[] = [];

  for (const movie of movies) {
    statements.push(
      db
        .prepare(
          `INSERT INTO history_movies (
            id, title, original_title, content_rating, site_url,
            first_seen_at, last_seen_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            original_title = excluded.original_title,
            content_rating = excluded.content_rating,
            site_url = excluded.site_url,
            last_seen_at = excluded.last_seen_at`,
        )
        .bind(
          movie.id,
          movie.title,
          movie.originalTitle,
          movie.contentRating,
          movie.siteURL,
          timestamp,
          timestamp,
        ),
    );

    for (const session of movie.sessions) {
      statements.push(
        db
          .prepare(
            `INSERT INTO history_sessions (
              id, movie_id, full_date, day_and_month, day_of_week,
              session_time, room, price, site_url, first_seen_at, last_seen_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              movie_id = excluded.movie_id,
              full_date = excluded.full_date,
              day_and_month = excluded.day_and_month,
              day_of_week = excluded.day_of_week,
              session_time = excluded.session_time,
              room = excluded.room,
              price = excluded.price,
              site_url = excluded.site_url,
              last_seen_at = excluded.last_seen_at`,
          )
          .bind(
            session.id,
            movie.id,
            session.fullDate,
            session.dayAndMonth,
            session.dayOfWeek,
            session.time,
            session.room,
            session.price,
            session.siteURL,
            timestamp,
            timestamp,
          ),
      );
    }
  }

  // Keep each D1 batch bounded. Upserts make retries safe if a later batch fails.
  for (let offset = 0; offset < statements.length; offset += MAX_BATCH_SIZE) {
    await db.batch(statements.slice(offset, offset + MAX_BATCH_SIZE));
  }
}

/** Returns recorded Três Lagoas sessions grouped by their local month. */
export async function readHistory(
  db: D1Database,
): Promise<HistoryPeriod[]> {
  const { results } = await db
    .prepare(
      `SELECT
        m.id AS movieId,
        m.title AS title,
        m.original_title AS originalTitle,
        m.content_rating AS contentRating,
        m.site_url AS movieSiteUrl,
        s.id AS sessionId,
        s.day_and_month AS dayAndMonth,
        s.day_of_week AS dayOfWeek,
        s.session_time AS time,
        s.full_date AS fullDate,
        s.room AS room,
        s.price AS price,
        s.site_url AS sessionSiteUrl
      FROM history_sessions AS s
      INNER JOIN history_movies AS m ON m.id = s.movie_id
      WHERE datetime(s.full_date) >= datetime(?)
      ORDER BY datetime(s.full_date) DESC, m.title COLLATE NOCASE ASC`,
    )
    .bind(HISTORY_START_AT)
    .all<HistoryRow>();

  const periods = new Map<
    string,
    { month: string; movies: Map<string, SubtitledMovie> }
  >();

  for (const row of results) {
    const month = row.fullDate.slice(0, 7);
    let period = periods.get(month);
    if (!period) {
      period = { month, movies: new Map() };
      periods.set(month, period);
    }

    let movie = period.movies.get(row.movieId);
    if (!movie) {
      movie = {
        id: row.movieId,
        title: row.title,
        originalTitle: row.originalTitle,
        contentRating: row.contentRating,
        siteURL: row.movieSiteUrl,
        sessions: [],
      };
      period.movies.set(row.movieId, movie);
    }

    movie.sessions.push({
      id: row.sessionId,
      dayAndMonth: row.dayAndMonth,
      dayOfWeek: row.dayOfWeek,
      time: row.time,
      fullDate: row.fullDate,
      room: row.room,
      price: row.price,
      siteURL: row.sessionSiteUrl,
    });
  }

  return [...periods.values()].map(({ month, movies }) => ({
    month,
    movies: [...movies.values()],
  }));
}
