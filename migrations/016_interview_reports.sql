-- C8. Company post-mortem packs: candidates log questions they were actually
-- asked, by company and role. Submissions start pending; an admin approves them
-- into the shared pack. The compounding, hard-to-copy content moat.
CREATE TABLE IF NOT EXISTS interview_reports (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  company    TEXT NOT NULL,
  role       TEXT NOT NULL,
  question   TEXT NOT NULL,
  asked_on   TEXT,
  status     TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ireports_company ON interview_reports(company, status);
CREATE INDEX IF NOT EXISTS idx_ireports_user ON interview_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_ireports_status ON interview_reports(status, created_at);
