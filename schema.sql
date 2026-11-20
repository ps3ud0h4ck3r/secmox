-- SecMox schema. Applied to the "secmox" D1 database.
-- Re-runnable: every statement is IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  iterations    INTEGER NOT NULL,
  track         TEXT NOT NULL DEFAULT 'fresher',
  is_admin      INTEGER NOT NULL DEFAULT 0,
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

-- Reset tokens are stored hashed for the same reason as sessions, are single
-- use, and expire in an hour.
CREATE TABLE IF NOT EXISTS password_resets (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_resets_user ON password_resets(user_id);

-- Failed sign-in counter, keyed separately by address and by email so one
-- noisy address cannot lock a stranger out of their own account.
CREATE TABLE IF NOT EXISTS auth_throttle (
  key          TEXT PRIMARY KEY,
  fails        INTEGER NOT NULL DEFAULT 0,
  first_fail   TEXT NOT NULL,
  locked_until TEXT
);

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
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  question_id   TEXT NOT NULL,
  answer        TEXT,
  self_rating   TEXT NOT NULL,
  depth_reached INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attempts_user_time ON attempts(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_attempts_user_question ON attempts(user_id, question_id);

-- Browser labs: a real artifact and the questions somebody would ask about it.
CREATE TABLE IF NOT EXISTS labs (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  role          TEXT NOT NULL,
  level         TEXT NOT NULL,
  brief         TEXT NOT NULL,
  artifact_kind TEXT NOT NULL,          -- log | table
  artifact_name TEXT NOT NULL,
  is_free       INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_labs_role_level ON labs(role, level);

-- Kept in its own table so that moving artifacts to R2, once they are packet
-- captures and memory images rather than text, touches one table and one
-- accessor instead of the whole data model.
CREATE TABLE IF NOT EXISTS lab_artifacts (
  lab_id TEXT PRIMARY KEY,
  body   TEXT NOT NULL,
  bytes  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS lab_tasks (
  id           TEXT PRIMARY KEY,
  lab_id       TEXT NOT NULL,
  position     INTEGER NOT NULL,
  prompt       TEXT NOT NULL,
  model_answer TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lab_tasks ON lab_tasks(lab_id, position);

CREATE TABLE IF NOT EXISTS lab_attempts (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  lab_id      TEXT NOT NULL,
  answers     TEXT,
  self_rating TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lab_attempts_user ON lab_attempts(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_lab_attempts_user_lab ON lab_attempts(user_id, lab_id);
