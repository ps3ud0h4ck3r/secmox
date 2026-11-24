-- A SecMox Score becomes a shareable credential: a short, memorable code a
-- candidate puts on a resume, and the name the scorecard shows. Old rows keep
-- NULL for both; the unique index allows many NULLs but no duplicate codes.
ALTER TABLE score_results ADD COLUMN code TEXT;
ALTER TABLE score_results ADD COLUMN candidate_name TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_scoreresults_code ON score_results(code);
