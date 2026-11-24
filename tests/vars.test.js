import { describe, it, expect } from 'vitest';
import { genValue, buildVarMap, fill, fillChain } from '../src/vars.js';

// A deterministic stand-in for Math.random that walks a fixed list.
function seq(values) {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('genValue', () => {
  it('ip looks like a public IPv4', () => {
    const v = genValue('ip', seq([0, 0.5, 0.5, 0.5]));
    expect(v).toMatch(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/);
  });
  it('host has a prefix and number', () => {
    expect(genValue('host', seq([0, 0.2]))).toMatch(/^[A-Z]+-WS-\d{2}$/);
  });
  it('time is h:mm AM', () => {
    expect(genValue('time', seq([0, 0.1]))).toMatch(/^\d:\d{2} AM$/);
  });
  it('unknown kind returns the kind itself', () => {
    expect(genValue('nope', Math.random)).toBe('nope');
  });
});

describe('buildVarMap + fill', () => {
  it('assigns one value per unique token and reuses it', () => {
    const texts = ['host {{ip}} hits {{host}}', 'again {{ip}}'];
    const map = buildVarMap(texts, seq([0.5, 0.5, 0.5, 0.5, 0.1, 0.2]));
    expect(Object.keys(map).sort()).toEqual(['{{host}}', '{{ip}}']);
    const out = fill(texts[0], map);
    // the same {{ip}} resolves to the same value in both texts
    expect(fill(texts[1], map)).toContain(map['{{ip}}']);
    expect(out).not.toContain('{{');
  });
  it('leaves unknown tokens untouched is not possible (all kinds generate), but malformed stay', () => {
    expect(fill('plain text', {})).toBe('plain text');
  });
  it('supports a suffixed token like {{ip:2}} as distinct', () => {
    const map = buildVarMap(['{{ip}} and {{ip:2}}'], seq([0.5, 0.5, 0.5, 0.5, 0.1, 0.1, 0.1, 0.1]));
    expect(Object.keys(map).sort()).toEqual(['{{ip:2}}', '{{ip}}']);
  });
});

describe('fillChain', () => {
  const chain = {
    id: 'x',
    scenario: 'Alert on {{host}} talking to {{ip}}',
    steps: [
      { prompt: 'Who is {{ip}}?', options: ['block {{ip}}', 'ignore'], answer: 0, explain: 'generic reason' },
    ],
  };
  it('fills scenario, prompts and options, leaves answer/explain alone', () => {
    const out = fillChain(chain, seq([0, 0.2, 0.5, 0.5, 0.5, 0.5]));
    expect(out.scenario).not.toContain('{{');
    expect(out.steps[0].prompt).not.toContain('{{');
    expect(out.steps[0].options[0]).not.toContain('{{');
    expect(out.steps[0].answer).toBe(0);
    expect(out.steps[0].explain).toBe('generic reason');
    // the ip used in the scenario is the same one used in the prompt and option
    const ip = out.scenario.split('talking to ')[1];
    expect(out.steps[0].prompt).toContain(ip);
    expect(out.steps[0].options[0]).toContain(ip);
  });
  it('does not mutate the source chain', () => {
    const before = JSON.stringify(chain);
    fillChain(chain);
    expect(JSON.stringify(chain)).toBe(before);
  });
});
