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
  // Typed answer (read an artifact, type the IOC). Deterministic: normalise
  // case/whitespace and accept any of the allowed answers. No AI, no cost.
  if (type === 'exact') {
    const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, '');
    const want = Array.isArray(answer) ? answer : [answer];
    const got = norm(choice);
    return got.length > 0 && want.some((a) => norm(a) === got);
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

// ---- Role fit: which role to walk into interviews for ----------------------

// Computed on the server so the number exists in exactly one place: it backs the
// in-app ranking and the HR-facing scorecard from the same engine, and the
// client only renders it (no second, divergent copy of the maths in the browser,
// and nothing a candidate can self-inflate before HR reads it).
//
// A fit blends recall (hold), depth under follow-ups, and applied practice, with
// the objective SecMox Score taking a firm share when it exists because it
// cannot be faked. Confidence is a separate axis measuring how much evidence
// backs the number, and a thin role is never crowned ready.

export const ROLE_FIT_BANDS = ['untouched', 'cold', 'shaky', 'building', 'close', 'ready'];

function rawFitBand(fit, evidence) {
  if (!evidence) return 'untouched';
  if (fit < 25) return 'cold';
  if (fit < 50) return 'shaky';
  if (fit < 72) return 'building';
  if (fit < 88) return 'close';
  return 'ready';
}

// Thin evidence cannot earn the top bands: three-of-three is not readiness.
function capFitBand(band, confidence) {
  const ceiling = confidence === 'thin' ? 'building' : confidence === 'some' ? 'close' : 'ready';
  return ROLE_FIT_BANDS.indexOf(band) > ROLE_FIT_BANDS.indexOf(ceiling) ? ceiling : band;
}

// r: one readiness row (role, total, seen, hold, depth_pct, scenarios, labs,
// score_pct). Returns the fit verdict for that role.
export function roleFit(r) {
  const pracTotal = (r.scenarios?.total ?? 0) + (r.labs?.total ?? 0);
  const pracDone = (r.scenarios?.done ?? 0) + (r.labs?.done ?? 0);
  const practical_pct = pracTotal ? Math.round((pracDone / pracTotal) * 100) : null;

  // A dimension with no content available folds its weight back into hold, so a
  // role is never punished for scenarios or follow-ups that do not exist for it.
  let wHold = 0.55;
  let wDepth = 0.2;
  let wPrac = 0.25;
  let depth = r.depth_pct;
  let prac = practical_pct;
  if (depth === null || depth === undefined) {
    wHold += wDepth;
    wDepth = 0;
    depth = 0;
  }
  if (prac === null) {
    wHold += wPrac;
    wPrac = 0;
    prac = 0;
  }
  let fit = wHold * (r.hold ?? 0) + wDepth * depth + wPrac * prac;

  // The objective Score, taken for this role, is the trustworthy signal (it
  // cannot be self-inflated), so it takes a firm share and the self-rated blend
  // is scaled down to make room.
  const hasScore = r.score_pct != null;
  if (hasScore) {
    const wScore = 0.45;
    fit = wScore * r.score_pct + (1 - wScore) * fit;
  }
  fit = Math.round(fit);

  // Confidence is volume of evidence, not quality of it; an objective score is
  // real evidence, so it lifts a role out of "thin".
  const engaged = (r.seen ?? 0) + (r.scenarios?.done ?? 0) + (r.labs?.done ?? 0);
  const evidence = engaged + (hasScore ? 1 : 0);
  const pool = (r.total ?? 0) + (r.scenarios?.total ?? 0) + (r.labs?.total ?? 0);
  const coverage = pool ? engaged / pool : 0;
  let confidence = 'thin';
  if (evidence >= 12 && coverage >= 0.5) confidence = 'solid';
  else if (evidence >= 5 && coverage >= 0.25) confidence = 'some';
  if (hasScore && confidence === 'thin') confidence = 'some';

  const band = capFitBand(rawFitBand(fit, evidence), confidence);
  return { fit, confidence, practical_pct, evidence, band, has_score: hasScore };
}

// Rank readiness rows by fit, strongest first, each row carrying its fit verdict.
// evidence breaks a tie so a better-backed role wins over a thinly-backed equal.
export function rankRoleFit(rows) {
  return (rows || [])
    .map((r) => ({ ...r, ...roleFit(r) }))
    .sort((a, b) => b.fit - a.fit || b.evidence - a.evidence);
}

// One HR-facing line naming the demonstrated best-fit role from a ranked list.
// Honest about thin evidence; never crowns a role it cannot back.
export function bestFitLine(ranked) {
  const top = (ranked || [])[0];
  if (!top || !top.evidence) return null;
  const name = POSITION[top.role] || top.role;
  if (top.confidence === 'thin') return `Leaning ${name}, on limited evidence so far.`;
  if (top.band === 'ready') return `Strongest demonstrated fit: ${name}.`;
  if (top.band === 'close') return `Strongest demonstrated fit: ${name} (close to room-ready).`;
  return `Strongest demonstrated fit so far: ${name} (still building).`;
}

// ---- Find-your-role diagnostic --------------------------------------------

// Rank the roles a brand-new user just sat one short scenario in each. perRole:
// [{ role, depth, steps }]. The read is deliberately shallow (one ladder each),
// so it is framed as a first read that points at the full Score, never a verdict.
export function diagnosticRank(perRole) {
  const ranked = (perRole || [])
    .map((r) => ({
      role: r.role,
      depth: r.depth || 0,
      steps: r.steps || 0,
      pct: r.steps ? Math.round((r.depth / r.steps) * 100) : 0,
    }))
    .sort((a, b) => b.pct - a.pct || b.depth - a.depth);

  const top = ranked[0];
  if (!top || top.depth <= 0) {
    return {
      ranked,
      top_role: null,
      verdict:
        'This quick run did not get far into any role yet. Try a little role practice, then take it again.',
    };
  }
  const name = POSITION[top.role] || top.role;
  return {
    ranked,
    top_role: top.role,
    verdict:
      `On this quick diagnostic your strongest fit is ${name}. It is a first read from one scenario ` +
      `each, not a final verdict. Take the full ${name} Score to confirm it and earn a verifiable code.`,
  };
}
