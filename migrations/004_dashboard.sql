-- Dashboard: a target role per user, and daily readiness snapshots for the
-- trend line. One-time migration for databases that already exist.
ALTER TABLE users ADD COLUMN target_role TEXT;

CREATE TABLE IF NOT EXISTS readiness_snapshots (
  user_id    TEXT NOT NULL,
  day        TEXT NOT NULL,
  readiness  INTEGER NOT NULL,
  PRIMARY KEY (user_id, day)
);
