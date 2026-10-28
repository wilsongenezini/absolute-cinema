CREATE TABLE IF NOT EXISTS history_movies (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  original_title TEXT NOT NULL,
  content_rating TEXT NOT NULL,
  site_url TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS history_sessions (
  id TEXT PRIMARY KEY,
  movie_id TEXT NOT NULL REFERENCES history_movies(id) ON DELETE CASCADE,
  full_date TEXT NOT NULL,
  day_and_month TEXT NOT NULL,
  day_of_week TEXT NOT NULL,
  session_time TEXT NOT NULL,
  room TEXT NOT NULL,
  price REAL NOT NULL DEFAULT 0,
  site_url TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS history_sessions_full_date_idx
  ON history_sessions(full_date);

CREATE INDEX IF NOT EXISTS history_sessions_movie_id_idx
  ON history_sessions(movie_id);
