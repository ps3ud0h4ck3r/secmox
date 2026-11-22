-- First-run onboarding flag. Nullable; NULL means not yet onboarded.
ALTER TABLE users ADD COLUMN onboarded_at TEXT;
-- Existing users have already been using the app, so treat them as onboarded;
-- only genuinely new signups should see the first-run flow.
UPDATE users SET onboarded_at = created_at WHERE onboarded_at IS NULL;
