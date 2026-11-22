-- Company interview tracks. Additive; safe to re-run.
CREATE TABLE IF NOT EXISTS company_tracks (
  id           TEXT PRIMARY KEY,
  slug         TEXT NOT NULL UNIQUE,
  company      TEXT NOT NULL,
  role         TEXT NOT NULL,
  level        TEXT NOT NULL,
  title        TEXT NOT NULL,
  blurb        TEXT NOT NULL,
  tier         TEXT NOT NULL DEFAULT 'free',
  rounds       TEXT NOT NULL,
  focus        TEXT NOT NULL,
  prep         TEXT NOT NULL,
  question_ids TEXT NOT NULL,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_company_tracks_role ON company_tracks(role, level);
