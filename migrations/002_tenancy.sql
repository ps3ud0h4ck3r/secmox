-- One-time migration for databases created before tenancy. Fresh databases get
-- all of this from schema.sql; this is only for existing production and local.
-- The CREATE TABLEs are idempotent; the ALTERs are not, which guards a double
-- apply.
CREATE TABLE IF NOT EXISTS orgs (id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, plan TEXT NOT NULL DEFAULT 'pilot', status TEXT NOT NULL DEFAULT 'active', is_sandbox INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS org_members (org_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (org_id, user_id));
CREATE INDEX IF NOT EXISTS idx_org_members_user ON org_members(user_id);
CREATE TABLE IF NOT EXISTS invites (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, email TEXT NOT NULL, role TEXT NOT NULL, token_hash TEXT NOT NULL, expires_at TEXT NOT NULL, accepted_at TEXT, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_invites_org ON invites(org_id, created_at);
CREATE TABLE IF NOT EXISTS org_hidden_content (org_id TEXT NOT NULL, kind TEXT NOT NULL, content_id TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (org_id, kind, content_id));
ALTER TABLE questions ADD COLUMN org_id TEXT;
ALTER TABLE labs ADD COLUMN org_id TEXT;
ALTER TABLE scenarios ADD COLUMN org_id TEXT;
