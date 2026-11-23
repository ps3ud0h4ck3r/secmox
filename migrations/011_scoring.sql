-- SecMox Score: objective auto-scored items and completed score runs.
CREATE TABLE IF NOT EXISTS objective_items (
  id         TEXT PRIMARY KEY,
  role       TEXT NOT NULL,
  topic      TEXT NOT NULL,
  difficulty INTEGER NOT NULL DEFAULT 1,
  type       TEXT NOT NULL,
  prompt     TEXT NOT NULL,
  body       TEXT,
  options    TEXT NOT NULL,
  answer     TEXT NOT NULL,
  explain    TEXT,
  org_id     TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_objitems_role ON objective_items(role);

CREATE TABLE IF NOT EXISTS score_results (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  role          TEXT NOT NULL,
  score         INTEGER NOT NULL,
  items_total   INTEGER NOT NULL,
  items_correct INTEGER NOT NULL,
  detail        TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scoreresults_user ON score_results(user_id, created_at);
