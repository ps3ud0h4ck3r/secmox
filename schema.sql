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
  platform_role TEXT,
  target_role   TEXT,
  onboarded_at  TEXT,
  created_at    TEXT NOT NULL
);

-- One readiness reading per user per day, written when they open the dashboard.
-- The trend line is built from these; history accrues a point at a time.
CREATE TABLE IF NOT EXISTS readiness_snapshots (
  user_id    TEXT NOT NULL,
  day        TEXT NOT NULL,          -- YYYY-MM-DD (UTC)
  readiness  INTEGER NOT NULL,       -- overall hold, 0-100
  PRIMARY KEY (user_id, day)
);

-- Session ids are stored as a SHA-256 of the cookie token, so a dump of this
-- table does not hand out live sessions.
CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  impersonating_user_id TEXT
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
  difficulty   INTEGER NOT NULL DEFAULT 1,
  org_id       TEXT,
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
  difficulty    INTEGER NOT NULL DEFAULT 1,  -- 1 easy | 2 medium | 3 hard; independent of level
  org_id        TEXT,
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

-- Scenario writing. A scenario has no artifact to open: it is a situation and
-- a brief, the candidate writes their handling end to end, and then scores
-- what they wrote against the points a panel would look for. The model answer
-- and the point details are never sent until they have submitted, so the
-- reveal cannot be read ahead of time from the network tab.
CREATE TABLE IF NOT EXISTS scenarios (
  id           TEXT PRIMARY KEY,
  role         TEXT NOT NULL,
  level        TEXT NOT NULL,
  title        TEXT NOT NULL,
  situation    TEXT NOT NULL,
  ask          TEXT NOT NULL,
  minutes      INTEGER NOT NULL DEFAULT 20,
  model_answer TEXT NOT NULL,
  is_free      INTEGER NOT NULL DEFAULT 0,
  org_id       TEXT,
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scenario_points (
  id          TEXT PRIMARY KEY,
  scenario_id TEXT NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  ord         INTEGER NOT NULL,
  label       TEXT NOT NULL,
  detail      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scenario_points_scenario ON scenario_points(scenario_id, ord);

CREATE TABLE IF NOT EXISTS scenario_attempts (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scenario_id TEXT NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  response    TEXT NOT NULL,
  covered     INTEGER NOT NULL DEFAULT 0,
  out_of      INTEGER NOT NULL,
  -- which points they ticked, so a later coverage view can show what keeps
  -- getting missed rather than only how many
  covered_ids TEXT NOT NULL DEFAULT '[]',
  scored_at   TEXT,
  minutes     INTEGER,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scenario_attempts_user ON scenario_attempts(user_id, created_at);

-- Spaced repetition. One row per user and question, carrying when the question
-- should next come back. Intervals widen with each consecutive got-it and
-- collapse on a shaky or a missed, so a question you keep holding drifts out of
-- the way while one you keep dropping stays close. The question bank and the
-- attempt history are untouched; this only decides ordering in /api/next, and a
-- question with attempts but no row here (from before this table existed) still
-- surfaces through the older worst-and-stalest fallback.
CREATE TABLE IF NOT EXISTS review_schedule (
  user_id       TEXT NOT NULL,
  question_id   TEXT NOT NULL,
  reps          INTEGER NOT NULL DEFAULT 0,
  interval_days INTEGER NOT NULL DEFAULT 0,
  due_at        TEXT NOT NULL,
  last_rating   TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  PRIMARY KEY (user_id, question_id)
);
CREATE INDEX IF NOT EXISTS idx_review_due ON review_schedule(user_id, due_at);

-- Impersonation log: a platform account can act as any user to support or
-- debug them. Every start and stop is written here and a banner shows the whole
-- time, so the power always leaves a trail. (The session's own
-- impersonating_user_id column, and users.platform_role, are part of the base
-- table definitions above; existing databases get them via a one-time ALTER.)
CREATE TABLE IF NOT EXISTS impersonation_log (
  id         TEXT PRIMARY KEY,
  actor_id   TEXT NOT NULL,
  target_id  TEXT NOT NULL,
  reason     TEXT,
  started_at TEXT NOT NULL,
  ended_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_imp_actor ON impersonation_log(actor_id, started_at);

-- Tenancy. A company is one orgs row; everything that belongs to it carries its
-- org_id, and every company-scoped query filters by the asker's org so one
-- company never sees another's people or private content. is_sandbox marks a
-- developer's throwaway company and a demo company, kept out of real metrics.
CREATE TABLE IF NOT EXISTS orgs (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  plan        TEXT NOT NULL DEFAULT 'pilot',
  status      TEXT NOT NULL DEFAULT 'active',
  is_sandbox  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);

-- Who is in a company and as what. A person can be in more than one company,
-- so the key is the pair. Role: org_admin, trainer, learner.
CREATE TABLE IF NOT EXISTS org_members (
  org_id     TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  role       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (org_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON org_members(user_id);

-- Invitations. The client holds a random token; the stored value is its
-- SHA-256, like sessions and resets. An invite is spent once accepted.
CREATE TABLE IF NOT EXISTS invites (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL,
  email       TEXT NOT NULL,
  role        TEXT NOT NULL,
  token_hash  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  accepted_at TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_invites_org ON invites(org_id, created_at);

-- A company hiding a global item from its own learners. It cannot edit or
-- delete a global item, only hide it, because that item belongs to everyone.
CREATE TABLE IF NOT EXISTS org_hidden_content (
  org_id     TEXT NOT NULL,
  kind       TEXT NOT NULL,
  content_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (org_id, kind, content_id)
);

-- Company interview tracks. A curated, ordered run of existing questions shaped
-- around how a given company and role tends to interview. Global content
-- (org_id is not modelled here; tracks are platform-wide for now). question_ids
-- is a JSON array of question ids in drill order; rounds and focus are JSON too.
-- tier is 'free' for every track today; the column lets a paid plan gate some
-- later without a migration.
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

-- Questions a learner saved to come back to. focus=saved in /api/next plays
-- only these; the star on the practice card toggles membership.
CREATE TABLE IF NOT EXISTS bookmarks (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (user_id, question_id)
);

-- A learner flagging a question as wrong, confusing or stale. Captured for
-- review; resolved_at is set when it has been dealt with.
CREATE TABLE IF NOT EXISTS question_reports (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  reason      TEXT NOT NULL,
  note        TEXT,
  created_at  TEXT NOT NULL,
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_question_reports_open ON question_reports(resolved_at, created_at);

-- Cohorts: a batch of learners inside a company. A company groups its people
-- into cohorts, and a trainer watches a cohort's readiness.
CREATE TABLE IF NOT EXISTS cohorts (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cohorts_org ON cohorts(org_id, created_at);
CREATE TABLE IF NOT EXISTS cohort_members (
  cohort_id  TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (cohort_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_cohort_members_user ON cohort_members(user_id);
