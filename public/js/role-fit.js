import { $, ROLE_LABEL } from './common.js';

// Which role fits you. A ranking that answers "which role should I be walking
// into interviews for?".
//
// The fit number itself is computed on the server (src/scoring.js roleFit) and
// arrives on each readiness row as fit / fit_band / confidence / evidence /
// practical_pct / has_score. This file only reads those fields and renders them,
// so the browser and the HR scorecard show one and the same number, and there is
// no second copy of the maths here to drift from the server's.

const calm = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const BAND = {
  untouched: { label: 'Not started', cls: 'b-none' },
  cold: { label: 'Cold', cls: 'b-cold' },
  shaky: { label: 'Shaky', cls: 'b-shaky' },
  building: { label: 'Building', cls: 'b-building' },
  close: { label: 'Close', cls: 'b-close' },
  ready: { label: 'Room-ready', cls: 'b-ready' },
};

// Lift the server-computed fit fields off a readiness row into the shape the
// renderer below expects. No maths: the number is the server's.
export function fitOf(r) {
  return {
    fit: r.fit ?? 0,
    confidence: r.confidence ?? 'thin',
    practical_pct: r.practical_pct ?? null,
    evidence: r.evidence ?? 0,
    band: r.fit_band ?? 'untouched',
    has_score: !!r.has_score,
  };
}

// The single move that would lift this role's fit the most, said plainly.
function leadGap(r, f) {
  if (!f.evidence) return 'Not started. A few questions here will give a first read.';
  if (f.confidence === 'thin') return 'Too little practice to trust the number. Face more of this role first.';
  const weak = r.weak_topics.find((t) => t.hold < 60);
  if (weak) return `Weakest part is ${weak.topic}, ${weak.hold}% held. Close that first.`;
  if (r.unseen > 0) return `${r.unseen} question${r.unseen === 1 ? '' : 's'} still unseen. A blind spot is a blind spot.`;
  if (r.depth_pct !== null && r.depth_pct < 60) return 'You hold the opener but fold on the follow-ups. Push the depth.';
  if (f.practical_pct !== null && f.practical_pct < 60) return 'Recall is there; the applied side is not. Do the scenarios and labs.';
  if (!f.has_score) return 'Looking solid. Take the SecMox Score for this role to turn it into a verifiable number.';
  return 'Nothing glaring. Keep it warm so it does not fade before the interview.';
}

function verdict(ranked) {
  const top = ranked[0];
  if (!top || !top.f.evidence) {
    return 'No read yet. Practise a role and come back, and this will tell you where you stand.';
  }
  if (top.f.confidence === 'thin') {
    return `Most of your work so far is in ${ROLE_LABEL[top.r.role] || top.r.role}, but it is too thin to call a fit. Keep going.`;
  }
  const name = ROLE_LABEL[top.r.role] || top.r.role;
  const backed = top.f.has_score ? ', backed by your SecMox Score' : '';
  if (top.f.band === 'ready') return `Your strongest fit is ${name}${backed}. On your own practice, you could walk into that room.`;
  if (top.f.band === 'close') return `Your strongest fit is ${name}${backed}. Close, not quite room-ready.`;
  return `Your strongest fit right now is ${name}${backed}, and it is still a work in progress.`;
}

function chip(text, cls) {
  const s = document.createElement('span');
  s.className = cls;
  s.textContent = text;
  return s;
}

function fitRow(entry, gapText, isLead, onDrill) {
  const { r, f } = entry;
  const band = BAND[f.band] || BAND.cold;
  const row = document.createElement('article');
  row.className = `fit-row ${band.cls}${isLead ? ' fit-lead' : ''}`;

  const head = document.createElement('div');
  head.className = 'fit-head';
  const name = document.createElement('h3');
  name.textContent = ROLE_LABEL[r.role] || r.role;
  const num = document.createElement('span');
  num.className = 'fit-num';
  num.textContent = `${f.fit}%`;
  head.append(name, num);

  const bar = document.createElement('div');
  bar.className = 'fit-bar';
  const fill = document.createElement('div');
  fill.className = 'fit-fill';
  bar.append(fill);
  fill.animate([{ width: '0%' }, { width: `${f.fit}%` }], {
    duration: calm() ? 1 : 650,
    fill: 'both',
    easing: 'ease-out',
  });

  const chips = document.createElement('div');
  chips.className = 'fit-chips';
  chips.append(
    chip(band.label, 'fit-band'),
    chip(`${f.confidence} evidence`, `fit-conf c-${f.confidence}`),
  );
  if (f.has_score) chips.append(chip('score-backed', 'fit-conf c-solid'));

  const gap = document.createElement('p');
  gap.className = 'fit-gap';
  gap.textContent = gapText;

  row.append(head, bar, chips, gap);

  // You can only drill spots you have actually stumbled on. An untouched or
  // all-held role has nothing to grind, so no button.
  const weakCount = (r.missed || 0) + (r.shaky || 0);
  if (onDrill && weakCount > 0) {
    const act = document.createElement('div');
    act.className = 'fit-act';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'inf ghost small';
    btn.textContent = `Drill these ${weakCount}`;
    btn.addEventListener('click', () => onDrill(r.role));
    act.append(btn);
    row.append(act);
  }
  return row;
}

// rows: the /api/readiness array. Fills #roleFit, or hides it when there is
// nothing to rank yet (the readiness view already prints its own empty note).
export function renderRoleFit(rows, onDrill) {
  const host = $('roleFit');
  if (!rows || !rows.length) {
    host.hidden = true;
    host.replaceChildren();
    return;
  }
  const ranked = rows
    .map((r) => ({ r, f: fitOf(r) }))
    .sort((a, b) => b.f.fit - a.f.fit || b.f.evidence - a.f.evidence);

  const head = document.createElement('div');
  head.className = 'fit-top';
  const h = document.createElement('h2');
  h.textContent = 'Which role fits you';
  const v = document.createElement('p');
  v.className = 'fit-verdict';
  v.textContent = verdict(ranked);
  head.append(h, v);

  const list = document.createElement('div');
  list.className = 'fit-list';
  list.append(...ranked.map((e, i) => fitRow(e, leadGap(e.r, e.f), i === 0, onDrill)));

  host.replaceChildren(head, list);
  host.hidden = false;
}
