-- One-time migration for databases created before platform roles existed.
-- Fresh databases get these columns from schema.sql directly; this is only for
-- the existing production and local databases. Safe to run once; re-running
-- fails on the ALTERs because the columns already exist, which is the intended
-- guard against a double apply.
ALTER TABLE users ADD COLUMN platform_role TEXT;
ALTER TABLE sessions ADD COLUMN impersonating_user_id TEXT;
UPDATE users SET platform_role = 'owner' WHERE is_admin = 1;
