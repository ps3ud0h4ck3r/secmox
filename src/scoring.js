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
