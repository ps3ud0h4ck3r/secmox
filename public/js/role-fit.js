import { $, ROLE_LABEL } from './common.js';

// Which role fits you. A ranking built on top of the readiness reading: it takes
// the same per-role signals the cards already show and turns them into one
// honest answer to "which role should I be walking into interviews for?".
//
// Everything here is derived on the client from the readiness payload, so there
// is no hidden server verdict: the number is yours to check. A fit is a blend of
// recall, depth under follow-ups, and applied practice; confidence is a separate
// axis for how much evidence backs it, and a thin role is never crowned ready.

const calm = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const BAND = {
  untouched: { label: 'Not started', cls: 'b-none' },
  cold: { label: 'Cold', cls: 'b-cold' },
  shaky: { label: 'Shaky', cls: 'b-shaky' },
  building: { label: 'Building', cls: 'b-building' },
  close: { label: 'Close', cls: 'b-close' },
  ready: { label: 'Room-ready', cls: 'b-ready' },
};
const BAND_ORDER = ['untouched', 'cold', 'shaky', 'building', 'close', 'ready'];

function rawBand(fit, evidence) {
  if (!evidence) return 'untouched';
  if (fit < 25) return 'cold';
  if (fit < 50) return 'shaky';
  if (fit < 72) return 'building';
  if (fit < 88) return 'close';
  return 'ready';
}

// Thin evidence cannot earn the top bands: three-of-three is not readiness.
function cap(band, confidence) {
  const ceiling = confidence === 'thin' ? 'building' : confidence === 'some' ? 'close' : 'ready';
  return BAND_ORDER.indexOf(band) > BAND_ORDER.indexOf(ceiling) ? ceiling : band;
}

export function scoreRole(r) {
  const pracTotal = r.scenarios.total + r.labs.total;
  const pracDone = r.scenarios.done + r.labs.done;
  const practical_pct = pracTotal ? Math.round((pracDone / pracTotal) * 100) : null;

  // Blend. A dimension with no content available folds its weight back into
  // hold, so a role is never punished for scenarios or follow-ups that do not
  // exist for it.
  let wHold = 0.55;
  let wDepth = 0.2;
  let wPrac = 0.25;
  let depth = r.depth_pct;
  let prac = practical_pct;
  if (depth === null) {
    wHold += wDepth;
    wDepth = 0;
    depth = 0;
  }
  if (prac === null) {
    wHold += wPrac;
    wPrac = 0;
    prac = 0;
  }
  const fit = Math.round(wHold * r.hold + wDepth * depth + wPrac * prac);

  // Confidence is volume of evidence, not quality of it.
  const evidence = r.seen + r.scenarios.done + r.labs.done;
  const pool = r.total + r.scenarios.total + r.labs.total;
  const coverage = pool ? evidence / pool : 0;
  let confidence = 'thin';
  if (evidence >= 12 && coverage >= 0.5) confidence = 'solid';
  else if (evidence >= 5 && coverage >= 0.25) confidence = 'some';

  const band = cap(rawBand(fit, evidence), confidence);
  return { fit, confidence, practical_pct, evidence, band };
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
  if (top.f.band === 'ready') return `Your strongest fit is ${name}. On your own practice, you could walk into that room.`;
  if (top.f.band === 'close') return `Your strongest fit is ${name}. Close, not quite room-ready.`;
  return `Your strongest fit right now is ${name}, and it is still a work in progress.`;
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
    .map((r) => ({ r, f: scoreRole(r) }))
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
