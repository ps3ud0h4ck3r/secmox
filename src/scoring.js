// Pure scoring and review-scheduling helpers. Kept out of index.js so they can
// be unit-tested without the Worker runtime, and imported back there.

// How much a self-rating counts toward "held cold". Missed earns nothing, shaky
// half, got_it full.
export const RATING_WEIGHT = { got_it: 1, shaky: 0.5, missed: 0 };

// Spaced-repetition ladder for a question rated got_it, in days. Each clean
// repetition pushes the next review further out.
const GOT_IT_DAYS = [2, 4, 9, 21, 45, 90];

export function nextReview(prevReps, rating) {
  if (rating === 'got_it') {
    const reps = prevReps + 1;
    const days = GOT_IT_DAYS[Math.min(reps, GOT_IT_DAYS.length) - 1];
    return { reps, interval_days: days };
  }
  if (rating === 'shaky') return { reps: 0, interval_days: 2 };
  return { reps: 0, interval_days: 1 };
}

export function inDays(days) {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

// Readiness band for a role from the share of questions held cold. A role you
// have not seen is 'untouched'; everything else is graded on the hold.
export function readinessBand(hold, seen) {
  if (!seen) return 'untouched';
  if (hold < 25) return 'cold';
  if (hold < 50) return 'shaky';
  if (hold < 72) return 'building';
  if (hold < 88) return 'close';
  return 'ready';
}

// --- SecMox Score (objective, auto-graded) ---

// Is an answer to an objective item correct? For mcq/pick the choice is the
// chosen option index; for order it is the chosen sequence of option indices,
// right only if it matches the answer exactly.
export function gradeObjective(type, answer, choice) {
  if (type === 'order') {
    if (!Array.isArray(choice) || !Array.isArray(answer) || choice.length !== answer.length) return false;
    return choice.every((v, i) => v === answer[i]);
  }
  return choice === answer;
}

// Turn graded items into a 0..1000 score, weighting each by its difficulty so a
// hard item is worth more than an easy one. graded: [{ weight, correct }].
export function objectiveScore(graded) {
  const possible = graded.reduce((s, g) => s + (g.weight || 1), 0);
  if (!possible) return 0;
  const earned = graded.reduce((s, g) => s + (g.correct ? g.weight || 1 : 0), 0);
  return Math.round((earned / possible) * 1000);
}

// A human-readable band for a 0..1000 score, shared vocabulary with readiness.
export function scoreBand(score) {
  if (score >= 850) return 'ready';
  if (score >= 700) return 'close';
  if (score >= 500) return 'building';
  if (score >= 300) return 'shaky';
  return 'cold';
}

// The confidence gap: felt readiness (self-rated hold, a percent) minus measured
// (the objective score as a percent). A clear positive means the candidate
// feels more ready than they tested, which is how people fail interviews.
export function confidenceGapLabel(gap) {
  if (gap >= 15) return 'overconfident';
  if (gap <= -15) return 'underconfident';
  return 'calibrated';
}

// --- Scenario-depth chains ---

// How far up a chain the candidate climbed: the number of correct steps from the
// start, stopping at the first wrong one. A pasted or guessed answer tends to
// break the streak at the first real follow-up, so depth is hard to fake.
export function chainDepth(stepCorrects) {
  let depth = 0;
  for (const ok of stepCorrects) {
    if (!ok) break;
    depth += 1;
  }
  return depth;
}

// Turn per-chain depth into a 0..1000 score. Each chain contributes the fraction
// of its ladder climbed, weighted by its difficulty, so getting deep into a hard
// scenario is worth more than clearing an easy one.
export function chainsScore(chains) {
  const possible = chains.reduce((s, c) => s + (c.weight || 1), 0);
  if (!possible) return 0;
  const earned = chains.reduce((s, c) => {
    const frac = c.stepCount ? c.depth / c.stepCount : 0;
    return s + frac * (c.weight || 1);
  }, 0);
  return Math.round((earned / possible) * 1000);
}

// ---- SecMox Score as a shareable credential --------------------------------

// The position a role maps to on a scorecard HR reads.
export const POSITION = {
  soc: 'SOC Analyst',
  pentest: 'Penetration Tester',
  network: 'Network Security',
  cloud: 'Cloud Security',
  grc: 'GRC / Security Risk',
};

// Short tag used inside a score code (SMX-<tag>-xxxxx).
export const ROLE_TAG = { soc: 'SOC', pentest: 'PEN', network: 'NET', cloud: 'CLD', grc: 'GRC' };

// Crockford base32, minus look-alikes, so a code reads cleanly off a resume.
export const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

// Normalise a code a reader types in (case, spaces, common separators).
export function normalizeCode(raw) {
  return String(raw || '')
    .toUpperCase()
    .replace(/[\s–—]/g, '')
    .replace(/[^A-Z0-9-]/g, '')
    .trim();
}

// Derive strengths and weaknesses from how far the candidate climbed each
// scenario. A ladder mostly climbed is a strength; one that stalled early is a
// gap. Middling ones are left out rather than forced into either bucket.
export function strengthsWeaknesses(chains) {
  const strengths = [];
  const weaknesses = [];
  for (const ch of chains || []) {
    const ratio = ch.step_count ? ch.depth / ch.step_count : 0;
    if (ratio >= 0.75) strengths.push(ch.title);
    else if (ratio <= 0.25) weaknesses.push(ch.title);
  }
  return { strengths, weaknesses };
}
