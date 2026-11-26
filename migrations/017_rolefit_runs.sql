-- Find-your-role diagnostic: a lightweight record of each cross-role run, kept
-- separate from score_results so the credential pool (codes, verify portal) is
-- never polluted by these quick first-read runs.
CREATE TABLE IF NOT EXISTS rolefit_runs (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  created_at TEXT NOT NULL,
  top_role   TEXT,
  detail     TEXT
);
CREATE INDEX IF NOT EXISTS idx_rolefit_runs_user ON rolefit_runs (user_id, created_at DESC);
