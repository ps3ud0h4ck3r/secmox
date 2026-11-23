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
