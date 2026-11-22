-- Per-org branding: a logo shown to that company's learners. Stored as a small
-- base64 data URI (img-src allows data:). Additive.
ALTER TABLE orgs ADD COLUMN logo TEXT;
