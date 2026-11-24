CREATE TABLE IF NOT EXISTS score_chains (
  id         TEXT PRIMARY KEY,
  role       TEXT NOT NULL,
  title      TEXT NOT NULL,
  scenario   TEXT NOT NULL,
  difficulty INTEGER NOT NULL DEFAULT 2,
  steps      TEXT NOT NULL,
  org_id     TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_score_chains_role ON score_chains(role);
