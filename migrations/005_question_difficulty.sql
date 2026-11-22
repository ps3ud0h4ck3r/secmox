-- Questions get a difficulty axis (1 easy, 2 medium, 3 hard), like labs and
-- scenarios. One-time ALTER for existing databases; the real per-question
-- values arrive when seed.sql is re-applied (INSERT OR REPLACE carries them).
ALTER TABLE questions ADD COLUMN difficulty INTEGER NOT NULL DEFAULT 1;
