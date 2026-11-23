import { $, api, say, ROLE_LABEL } from './common.js';
import { renderRoleFit } from './role-fit.js';

let onDrill = null;
export function setReadinessHandlers(handlers) {
  onDrill = handlers?.onDrill || null;
}

// The readiness reading. One card per role, weakest first, because the weakest
// role is the one an interview will find. Everything here is the candidate's own
// practice reflected back, so the copy never claims more certainty than a
// self-mark earns.

const BAND = {
  untouched: { label: 'Not started', cls: 'b-none' },
  cold: { label: 'Cold', cls: 'b-cold' },
  shaky: { label: 'Shaky', cls: 'b-shaky' },
  building: { label: 'Building', cls: 'b-building' },
  close: { label: 'Close', cls: 'b-close' },
  ready: { label: 'Room-ready', cls: 'b-ready' },
};

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const calm = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function sinceLabel(iso) {
  if (!iso) return 'not yet practised';
  const days = Math.floor((Date.now() - new Date(iso + 'Z').getTime()) / 86_400_000);
  if (days <= 0) return 'practised today';
  if (days === 1) return 'practised yesterday';
  if (days < 14) return `practised ${days} days ago`;
  if (days < 60) return `practised ${Math.floor(days / 7)} weeks ago`;
  return 'practised a while ago';
}

// The one move most worth making next for this role.
function nextMove(r) {
  if (r.unseen > 0) return `Face the ${plural(r.unseen, 'question', 'questions')} you have not seen.`;
  const weak = r.weak_topics.find((t) => t.hold < 60);
  if (weak) return `Go back over ${weak.topic}. It is the shakiest part.`;
  if (r.depth_pct !== null && r.depth_pct < 60) return 'Push further up the follow-ups before you reveal.';
  if (r.scenarios.done < r.scenarios.total) {
    return `Write up ${plural(r.scenarios.total - r.scenarios.done, 'scenario', 'scenarios')} for this role.`;
  }
  if (r.labs.done < r.labs.total) {
    return `Open ${plural(r.labs.total - r.labs.done, 'lab', 'labs')} you have not touched.`;
  }
  return 'Keep it warm. Come back before it fades.';
}

function line(label, value, muted) {
  const row = document.createElement('div');
  row.className = 'ready-line';
  const k = document.createElement('span');
  k.className = 'rl-k';
  k.textContent = label;
  const v = document.createElement('span');
  v.className = muted ? 'rl-v muted' : 'rl-v';
  v.textContent = value;
  row.append(k, v);
  return row;
}

function card(r) {
  const band = BAND[r.band] || BAND.cold;
  const el = document.createElement('article');
  el.className = `ready-card ${band.cls}`;

  const head = document.createElement('div');
  head.className = 'ready-head';
  const name = document.createElement('h2');
  name.textContent = ROLE_LABEL[r.role] || r.role;
  const tag = document.createElement('span');
  tag.className = 'ready-band';
  tag.textContent = band.label;
  head.append(name, tag);

  const score = document.createElement('div');
  score.className = 'ready-score';
  const num = document.createElement('span');
  num.className = 'rs-num';
  num.textContent = `${r.hold}%`;
  const cap = document.createElement('span');
  cap.className = 'rs-cap';
  cap.textContent = 'held';
  score.append(num, cap);

  const bar = document.createElement('div');
  bar.className = 'ready-bar';
  const fill = document.createElement('div');
  fill.className = 'ready-fill';
  bar.append(fill);
  // Width via the Web Animations API, held with fill:both, so the bar carries
  // no inline style attribute and style-src stays strict, the same way the
  // landing hero is driven.
  fill.animate([{ width: '0%' }, { width: `${r.hold}%` }], {
    duration: calm() ? 1 : 600,
    fill: 'both',
    easing: 'ease-out',
  });

  const lines = document.createElement('div');
  lines.className = 'ready-lines';
  lines.append(
    line('Questions', `${r.got_it} held · ${r.shaky} shaky · ${r.missed} missed · ${r.unseen} unseen`),
    line(
      'Follow-up depth',
      r.depth_pct === null ? 'no follow-ups faced yet' : `${r.depth_pct}% up the ladder`,
      r.depth_pct === null,
    ),
    line('Scenarios', `${r.scenarios.done} of ${r.scenarios.total} written`, !r.scenarios.total),
    line('Labs', `${r.labs.done} of ${r.labs.total} opened`, !r.labs.total),
    line('SecMox Score', r.score === null ? 'not taken yet' : `${r.score} / 1000`, r.score === null),
    line('Last seen', sinceLabel(r.last_practiced), true),
  );

  const move = document.createElement('p');
  move.className = 'ready-move';
  move.textContent = nextMove(r);

  const parts = [head, score, bar, lines];
  const gap = gapRow(r);
  if (gap) parts.push(gap);
  parts.push(move);
  el.append(...parts);
  return el;
}

// The confidence gap: felt readiness (self-rated hold) against the measured
// SecMox Score. The one reading no other tool gives, so it leads visually.
function gapRow(r) {
  const box = document.createElement('div');
  if (r.gap_label === null) {
    // Only prompt when they have practised but not tested; nothing to say on an
    // untouched role.
    if (r.seen === 0 || r.score !== null) return null;
    box.className = 'ready-gap gap-none';
    box.textContent = 'Take a Score test for this role to see your confidence gap.';
    return box;
  }
  const map = {
    overconfident: {
      cls: 'gap-over',
      title: 'Overconfident',
      text: `You feel more ready than you tested (+${r.gap}). This is the gap that fails interviews. Close it before you sit one.`,
    },
    underconfident: {
      cls: 'gap-under',
      title: 'Underconfident',
      text: `You tested better than you feel (${r.gap}). The risk here is nerves, not knowledge.`,
    },
    calibrated: {
      cls: 'gap-ok',
      title: 'Well calibrated',
      text: 'Your sense of how ready you are matches how you tested.',
    },
  }[r.gap_label];
  box.className = `ready-gap ${map.cls}`;
  const t = document.createElement('span');
  t.className = 'ready-gap-title';
  t.textContent = `Confidence gap: ${map.title}`;
  const d = document.createElement('p');
  d.className = 'ready-gap-text';
  d.textContent = map.text;
  box.append(t, d);
  return box;
}

export async function loadReadiness() {
  const list = $('readyList');
  list.textContent = 'Reading your practice.';
  say($('readyMsg'), '');
  const params = new URLSearchParams();
  if ($('rLevel').value) params.set('level', $('rLevel').value);
  try {
    const out = await api('/api/readiness?' + params.toString());
    const rows = out.readiness || [];
    if (!rows.length) {
      list.textContent = '';
      renderRoleFit([]);
      say($('readyMsg'), 'Nothing to read yet. Answer a few questions and come back.');
      return;
    }
    renderRoleFit(rows, onDrill);
    list.replaceChildren(...rows.map(card));
  } catch (err) {
    list.textContent = '';
    renderRoleFit([]);
    say($('readyMsg'), err.message, 'err');
  }
}

export function wireReadiness() {
  $('rLevel').addEventListener('change', loadReadiness);
}
