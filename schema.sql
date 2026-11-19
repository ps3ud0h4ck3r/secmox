-- SecMox schema. Applied to the "secmox" D1 database.
-- Re-runnable: every statement is IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  iterations    INTEGER NOT NULL,
  track         TEXT NOT NULL DEFAULT 'fresher',
  created_at    TEXT NOT NULL
);

-- Session ids are stored as a SHA-256 of the cookie token, so a dump of this
-- table does not hand out live sessions.
CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS questions (
  id           TEXT PRIMARY KEY,
  role         TEXT NOT NULL,
  topic        TEXT NOT NULL,
  level        TEXT NOT NULL,
  prompt       TEXT NOT NULL,
  model_answer TEXT NOT NULL,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_questions_role_level ON questions(role, level);
CREATE INDEX IF NOT EXISTS idx_questions_topic ON questions(topic);

-- The differentiator: what the interviewer asks next.
CREATE TABLE IF NOT EXISTS follow_ups (
  id           TEXT PRIMARY KEY,
  question_id  TEXT NOT NULL,
  position     INTEGER NOT NULL,
  prompt       TEXT NOT NULL,
  model_answer TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_followups_question ON follow_ups(question_id, position);

CREATE TABLE IF NOT EXISTS attempts (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL,
  question_id      TEXT NOT NULL,
  answer           TEXT,
  self_rating      TEXT NOT NULL,
  depth_reached    INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attempts_user_time ON attempts(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_attempts_user_question ON attempts(user_id, question_id);
