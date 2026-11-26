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
  chainDepth,
  chainsScore,
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

describe('chainDepth', () => {
  it('counts leading correct steps and stops at the first wrong one', () => {
    expect(chainDepth([true, true, true, true])).toBe(4);
    expect(chainDepth([true, true, false, true])).toBe(2);
    expect(chainDepth([false, true, true])).toBe(0);
    expect(chainDepth([])).toBe(0);
  });
});

describe('chainsScore', () => {
  it('is 0 with no chains', () => {
    expect(chainsScore([])).toBe(0);
  });
  it('is 1000 when every ladder is fully climbed', () => {
    expect(chainsScore([{ stepCount: 4, depth: 4, weight: 2 }, { stepCount: 3, depth: 3, weight: 3 }])).toBe(1000);
  });
  it('scores the fraction climbed, weighted by difficulty', () => {
    // One chain, climbed halfway: 500.
    expect(chainsScore([{ stepCount: 4, depth: 2, weight: 2 }])).toBe(500);
    // Easy chain fully (w1, frac1) + hard chain none (w3, frac0): 1/4 -> 250.
    expect(chainsScore([{ stepCount: 2, depth: 2, weight: 1 }, { stepCount: 4, depth: 0, weight: 3 }])).toBe(250);
  });
});

import { normalizeCode, strengthsWeaknesses, POSITION } from '../src/scoring.js';

describe('credential helpers', () => {
  it('normalizeCode uppercases and strips noise', () => {
    expect(normalizeCode(' smx-soc-k7q2m ')).toBe('SMX-SOC-K7Q2M');
    expect(normalizeCode('smx soc k7q2m')).toBe('SMXSOCK7Q2M');
  });
  it('strengthsWeaknesses splits by climb ratio', () => {
    const { strengths, weaknesses } = strengthsWeaknesses([
      { title: 'A', depth: 4, step_count: 4 },
      { title: 'B', depth: 0, step_count: 4 },
      { title: 'C', depth: 2, step_count: 4 },
    ]);
    expect(strengths).toEqual(['A']);
    expect(weaknesses).toEqual(['B']);
  });
  it('POSITION maps roles to titles', () => {
    expect(POSITION.soc).toBe('SOC Analyst');
    expect(POSITION.grc).toBe('GRC / Security Risk');
  });
});

describe('gradeObjective exact', () => {
  it('matches case/space-insensitively against accepted answers', () => {
    expect(gradeObjective('exact', ['203.0.113.44'], '203.0.113.44')).toBe(true);
    expect(gradeObjective('exact', ['update-check.live'], '  Update-Check.Live ')).toBe(true);
    expect(gradeObjective('exact', ['a.com', 'b.com'], 'b.com')).toBe(true);
    expect(gradeObjective('exact', ['203.0.113.44'], '203.0.113.45')).toBe(false);
    expect(gradeObjective('exact', ['x'], '')).toBe(false);
  });
});

import { roleFit, rankRoleFit, bestFitLine } from '../src/scoring.js';

describe('roleFit', () => {
  const base = (over) => ({
    role: 'soc', total: 10, seen: 0, hold: 0, depth_pct: null,
    scenarios: { total: 0, done: 0 }, labs: { total: 0, done: 0 }, score_pct: null, ...over,
  });

  it('untouched role gets zero fit and untouched band', () => {
    const f = roleFit(base());
    expect(f.fit).toBe(0);
    expect(f.band).toBe('untouched');
    expect(f.confidence).toBe('thin');
    expect(f.has_score).toBe(false);
  });

  it('folds missing depth and practical weight back into hold', () => {
    // No scenarios/labs/follow-ups: fit should equal the hold percent.
    const f = roleFit(base({ seen: 10, hold: 80 }));
    expect(f.fit).toBe(80);
  });

  it('an objective score takes a firm 45% share of the blend', () => {
    // hold 40, no depth/practical -> self blend = 40; score_pct 100 -> 0.45*100 + 0.55*40 = 67
    const f = roleFit(base({ seen: 10, hold: 40, score_pct: 100 }));
    expect(f.fit).toBe(67);
    expect(f.has_score).toBe(true);
  });

  it('caps a thin-evidence role at building however high the fit', () => {
    const f = roleFit(base({ seen: 2, hold: 100 }));
    expect(f.confidence).toBe('thin');
    expect(f.band).toBe('building');
  });

  it('a score lifts a thin role out of thin confidence', () => {
    const f = roleFit(base({ seen: 1, hold: 90, score_pct: 90 }));
    expect(f.confidence).toBe('some');
  });

  it('solid evidence with high fit can reach ready', () => {
    const f = roleFit(base({
      total: 10, seen: 10, hold: 95, depth_pct: 95,
      scenarios: { total: 3, done: 3 }, labs: { total: 3, done: 3 }, score_pct: 95,
    }));
    expect(f.confidence).toBe('solid');
    expect(f.band).toBe('ready');
  });
});

describe('rankRoleFit', () => {
  it('ranks strongest fit first and breaks ties by evidence', () => {
    const rows = [
      { role: 'soc', total: 10, seen: 2, hold: 50, depth_pct: null, scenarios: { total: 0, done: 0 }, labs: { total: 0, done: 0 }, score_pct: null },
      { role: 'grc', total: 10, seen: 10, hold: 50, depth_pct: null, scenarios: { total: 0, done: 0 }, labs: { total: 0, done: 0 }, score_pct: null },
    ];
    const ranked = rankRoleFit(rows);
    // equal fit (50), grc has more evidence so it leads
    expect(ranked[0].role).toBe('grc');
    expect(ranked[0].fit).toBe(50);
  });
});

describe('bestFitLine', () => {
  it('returns null when nothing is backed', () => {
    expect(bestFitLine([{ role: 'soc', evidence: 0 }])).toBeNull();
    expect(bestFitLine([])).toBeNull();
  });
  it('names the position and hedges on thin evidence', () => {
    expect(bestFitLine([{ role: 'soc', evidence: 3, confidence: 'thin', band: 'building' }]))
      .toBe('Leaning SOC Analyst, on limited evidence so far.');
    expect(bestFitLine([{ role: 'grc', evidence: 20, confidence: 'solid', band: 'ready' }]))
      .toBe('Strongest demonstrated fit: GRC / Security Risk.');
  });
});
