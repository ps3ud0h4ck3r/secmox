-- Cohorts and their members. Additive; safe to re-run.
CREATE TABLE IF NOT EXISTS cohorts (
  id TEXT PRIMARY KEY, org_id TEXT NOT NULL, name TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cohorts_org ON cohorts(org_id, created_at);
CREATE TABLE IF NOT EXISTS cohort_members (
  cohort_id TEXT NOT NULL, user_id TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY (cohort_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_cohort_members_user ON cohort_members(user_id);
