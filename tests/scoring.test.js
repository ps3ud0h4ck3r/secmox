import { describe, it, expect } from 'vitest';
import {
  RATING_WEIGHT,
  nextReview,
  inDays,
  readinessBand,
  gradeObjective,
  objectiveScore,
  scoreBand,
  confidenceGapLabel,
} from '../src/scoring.js';

describe('RATING_WEIGHT', () => {
  it('weights got_it full, shaky half, missed nothing', () => {
    expect(RATING_WEIGHT.got_it).toBe(1);
    expect(RATING_WEIGHT.shaky).toBe(0.5);
    expect(RATING_WEIGHT.missed).toBe(0);
  });
});

describe('nextReview', () => {
  it('pushes got_it further out each clean repetition', () => {
    expect(nextReview(0, 'got_it')).toEqual({ reps: 1, interval_days: 2 });
    expect(nextReview(1, 'got_it')).toEqual({ reps: 2, interval_days: 4 });
    expect(nextReview(2, 'got_it')).toEqual({ reps: 3, interval_days: 9 });
  });

  it('caps the ladder at its last step', () => {
    // Ladder is [2,4,9,21,45,90]; any rep beyond it stays at 90.
    expect(nextReview(50, 'got_it')).toEqual({ reps: 51, interval_days: 90 });
  });

  it('resets reps and shortens the interval for shaky and missed', () => {
    expect(nextReview(5, 'shaky')).toEqual({ reps: 0, interval_days: 2 });
    expect(nextReview(5, 'missed')).toEqual({ reps: 0, interval_days: 1 });
  });
});

describe('inDays', () => {
  it('returns an ISO timestamp the given number of days ahead', () => {
    const before = Date.now();
    const iso = inDays(3);
    const ms = Date.parse(iso);
    expect(Number.isNaN(ms)).toBe(false);
    const delta = ms - before;
    // ~3 days, allowing a little slack for execution time.
    expect(delta).toBeGreaterThan(3 * 86_400_000 - 5000);
    expect(delta).toBeLessThan(3 * 86_400_000 + 5000);
  });
});

describe('readinessBand', () => {
  it('is untouched when nothing has been seen, whatever the hold', () => {
    expect(readinessBand(100, 0)).toBe('untouched');
  });

  it('grades the hold once a role has been seen', () => {
    expect(readinessBand(0, 10)).toBe('cold');
    expect(readinessBand(24.9, 10)).toBe('cold');
    expect(readinessBand(25, 10)).toBe('shaky');
    expect(readinessBand(49, 10)).toBe('shaky');
    expect(readinessBand(50, 10)).toBe('building');
    expect(readinessBand(71, 10)).toBe('building');
    expect(readinessBand(72, 10)).toBe('close');
    expect(readinessBand(87, 10)).toBe('close');
    expect(readinessBand(88, 10)).toBe('ready');
    expect(readinessBand(100, 10)).toBe('ready');
  });
});

describe('gradeObjective', () => {
  it('checks index equality for mcq and pick', () => {
    expect(gradeObjective('mcq', 2, 2)).toBe(true);
    expect(gradeObjective('mcq', 2, 1)).toBe(false);
    expect(gradeObjective('pick', 0, 0)).toBe(true);
  });
  it('requires the exact sequence for order', () => {
    expect(gradeObjective('order', [2, 1, 0, 3, 4], [2, 1, 0, 3, 4])).toBe(true);
    expect(gradeObjective('order', [2, 1, 0], [2, 0, 1])).toBe(false);
    expect(gradeObjective('order', [0, 1], [0])).toBe(false);
    expect(gradeObjective('order', [0, 1], 0)).toBe(false);
  });
});

describe('objectiveScore', () => {
  it('is 0 with no items', () => {
    expect(objectiveScore([])).toBe(0);
  });
  it('is 1000 when everything is correct', () => {
    expect(objectiveScore([{ weight: 1, correct: true }, { weight: 3, correct: true }])).toBe(1000);
  });
  it('weights harder items more', () => {
    // Easy right (1), hard wrong (3): 1 of 4 possible -> 250.
    expect(objectiveScore([{ weight: 1, correct: true }, { weight: 3, correct: false }])).toBe(250);
    // Easy wrong, hard right: 3 of 4 -> 750.
    expect(objectiveScore([{ weight: 1, correct: false }, { weight: 3, correct: true }])).toBe(750);
  });
});

describe('scoreBand', () => {
  it('maps the 0..1000 score to a band', () => {
    expect(scoreBand(0)).toBe('cold');
    expect(scoreBand(299)).toBe('cold');
    expect(scoreBand(300)).toBe('shaky');
    expect(scoreBand(500)).toBe('building');
    expect(scoreBand(700)).toBe('close');
    expect(scoreBand(850)).toBe('ready');
    expect(scoreBand(1000)).toBe('ready');
  });
});

describe('confidenceGapLabel', () => {
  it('flags a clear positive gap as overconfident', () => {
    expect(confidenceGapLabel(15)).toBe('overconfident');
    expect(confidenceGapLabel(40)).toBe('overconfident');
  });
  it('flags a clear negative gap as underconfident', () => {
    expect(confidenceGapLabel(-15)).toBe('underconfident');
    expect(confidenceGapLabel(-50)).toBe('underconfident');
  });
  it('treats a small gap as calibrated', () => {
    expect(confidenceGapLabel(0)).toBe('calibrated');
    expect(confidenceGapLabel(14)).toBe('calibrated');
    expect(confidenceGapLabel(-14)).toBe('calibrated');
  });
});
