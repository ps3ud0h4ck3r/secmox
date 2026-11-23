// The SecMox Score: a short, auto-graded, objective test per role that produces
// one number (0 to 1000) the learner can check and share. Every item has one
// right answer the server checks, so the score cannot be self-inflated.

import { $, api, say, ROLE_LABEL } from './common.js';

const ROLES = ['soc', 'pentest', 'network', 'cloud', 'grc'];
const roleName = (r) => ROLE_LABEL[r] || r;

let run = null; // { role, items, answers: Map<id, choice> }

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

export function openScore() {
  renderStart();
}

// --- Start: pick a role, see past scores ---

function renderStart() {
  run = null;
  const root = $('scoreBody');
  root.replaceChildren();

  const intro = el('p', 'sub');
  intro.textContent =
    'A short, auto-graded test. One correct answer each, checked by the system, ' +
    'so the score is honest and cannot be faked. Pick a role to begin.';
  root.append(intro);

  const picker = el('div', 'score-roles');
  for (const r of ROLES) {
    const b = el('button', 'score-role');
    b.type = 'button';
    b.textContent = roleName(r);
    b.addEventListener('click', () => startRun(r));
    picker.append(b);
  }
  root.append(picker);

  const past = el('div', 'score-past');
  past.id = 'scorePast';
  root.append(past);
  loadMine();
}

async function loadMine() {
  const box = $('scorePast');
  if (!box) return;
  try {
    const { runs } = await api('/api/score/mine');
    box.replaceChildren();
    if (!runs.length) return;
    box.append(el('h3', null, 'Your past scores'));
    const list = el('div', 'score-history');
    for (const s of runs.slice(0, 8)) {
      const row = el('a', 'score-hist');
      row.href = `/score/?id=${s.id}`;
      row.target = '_blank';
      row.rel = 'noopener';
      row.append(el('span', 'score-hist-role', roleName(s.role)));
      const n = el('span', `score-hist-num band-${s.band}`, String(s.score));
      row.append(n);
      row.append(el('span', 'score-hist-date', new Date(s.date).toLocaleDateString()));
      list.append(row);
    }
    box.append(list);
  } catch {
    // A missing history is not worth an error; just show nothing.
  }
}

// --- The test ---

async function startRun(role) {
  const root = $('scoreBody');
  root.replaceChildren(el('p', 'sub', 'Loading the test.'));
  let data;
  try {
    data = await api(`/api/score/items?role=${encodeURIComponent(role)}`);
  } catch (err) {
    root.replaceChildren(el('p', 'msg err', err.message));
    return;
  }
  if (!data.items.length) {
    root.replaceChildren(el('p', 'sub', 'No items for this role yet. Try another.'));
    const back = el('button', 'btn-ghost', 'Back');
    back.type = 'button';
    back.addEventListener('click', renderStart);
    root.append(back);
    return;
  }
  run = { role, items: data.items, answers: new Map() };
  renderRun();
}

function diffLabel(d) {
  return d >= 3 ? 'hard' : d === 2 ? 'medium' : 'easy';
}

function renderRun() {
  const root = $('scoreBody');
  root.replaceChildren();

  const head = el('div', 'score-runhead');
  head.append(el('h2', null, `${roleName(run.role)} score test`));
  head.append(el('p', 'sub', `${run.items.length} questions. Answer them all, then submit.`));
  root.append(head);

  run.items.forEach((item, idx) => {
    root.append(renderItem(item, idx));
  });

  const foot = el('div', 'score-foot');
  const submit = el('button', 'btn', 'Submit and get my score');
  submit.type = 'button';
  submit.id = 'scoreSubmit';
  submit.addEventListener('click', submitRun);
  foot.append(submit);
  const msg = el('p', 'msg');
  msg.id = 'scoreRunMsg';
  foot.append(msg);
  root.append(foot);
}

function renderItem(item, idx) {
  const card = el('div', 'score-item');
  card.id = `si-${item.id}`;

  const meta = el('div', 'score-item-meta');
  meta.append(el('span', 'score-num', `Q${idx + 1}`));
  meta.append(el('span', 'score-topic', item.topic));
  meta.append(el('span', `score-diff d-${diffLabel(item.difficulty)}`, diffLabel(item.difficulty)));
  card.append(meta);

  card.append(el('p', 'score-prompt', item.prompt));
  if (item.body) {
    const pre = el('pre', 'score-body');
    pre.append(el('code', null, item.body));
    card.append(pre);
  }

  if (item.type === 'order') card.append(renderOrder(item));
  else card.append(renderChoice(item));

  return card;
}

function renderChoice(item) {
  const wrap = el('div', 'score-opts');
  item.options.forEach((opt, i) => {
    const id = `${item.id}-${i}`;
    const label = el('label', 'score-opt');
    label.htmlFor = id;
    const input = el('input');
    input.type = 'radio';
    input.name = item.id;
    input.id = id;
    input.value = String(i);
    input.addEventListener('change', () => run.answers.set(item.id, i));
    label.append(input);
    label.append(el('span', 'score-opt-text', opt));
    wrap.append(label);
  });
  return wrap;
}

function renderOrder(item) {
  const wrap = el('div', 'score-order');
  wrap.append(el('p', 'score-order-hint', 'Click the steps in the correct order.'));

  const chosen = el('div', 'score-chosen');
  const pool = el('div', 'score-pool');

  const state = []; // chosen option indices in order

  const redraw = () => {
    chosen.replaceChildren();
    state.forEach((optIdx, pos) => {
      const chip = el('span', 'score-chip');
      chip.append(el('b', null, `${pos + 1}.`));
      chip.append(document.createTextNode(' ' + item.options[optIdx]));
      chosen.append(chip);
    });
    for (const btn of pool.children) {
      const i = Number(btn.dataset.i);
      btn.disabled = state.includes(i);
    }
    run.answers.set(item.id, state.length === item.options.length ? [...state] : undefined);
  };

  item.options.forEach((opt, i) => {
    const b = el('button', 'score-step');
    b.type = 'button';
    b.dataset.i = String(i);
    b.textContent = opt;
    b.addEventListener('click', () => {
      if (state.includes(i)) return;
      state.push(i);
      redraw();
    });
    pool.append(b);
  });

  const reset = el('button', 'btn-ghost score-reset', 'Reset order');
  reset.type = 'button';
  reset.addEventListener('click', () => {
    state.length = 0;
    redraw();
  });

  wrap.append(chosen, pool, reset);
  redraw();
  return wrap;
}

async function submitRun() {
  const msg = $('scoreRunMsg');
  // Every item must be answered for the score to mean anything.
  const missing = run.items.filter((it) => {
    const a = run.answers.get(it.id);
    return a === undefined || a === null;
  });
  if (missing.length) {
    say(msg, `Answer all ${run.items.length} questions first (${missing.length} left).`, 'err');
    const first = $(`si-${missing[0].id}`);
    if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  const btn = $('scoreSubmit');
  btn.disabled = true;
  say(msg, 'Scoring.');
  const answers = run.items.map((it) => ({ id: it.id, choice: run.answers.get(it.id) }));
  try {
    const out = await api('/api/score/submit', {
      method: 'POST',
      body: JSON.stringify({ role: run.role, answers }),
    });
    renderResult(out);
  } catch (err) {
    btn.disabled = false;
    say(msg, err.message, 'err');
  }
}

// --- Result ---

function renderResult(out) {
  const items = run.items;
  const byId = new Map((out.review || []).map((r) => [r.id, r]));
  const root = $('scoreBody');
  root.replaceChildren();

  const card = el('div', `score-result band-${out.band}`);
  card.append(el('p', 'score-result-label', `${roleName(out.role)} SecMox Score`));
  card.append(el('div', 'score-big', String(out.score)));
  card.append(el('p', 'score-band', `${out.band} · ${out.correct}/${out.total} correct`));
  root.append(card);

  const share = el('div', 'score-share');
  const link = `${location.origin}/score/?id=${out.id}`;
  const field = el('input', 'score-link');
  field.type = 'text';
  field.readOnly = true;
  field.value = link;
  field.setAttribute('aria-label', 'Shareable score link');
  const copy = el('button', 'btn-ghost', 'Copy link');
  copy.type = 'button';
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(link);
      copy.textContent = 'Copied';
      setTimeout(() => (copy.textContent = 'Copy link'), 1500);
    } catch {
      field.select();
    }
  });
  share.append(el('p', 'sub', 'Share or verify this score:'));
  const row = el('div', 'score-link-row');
  row.append(field, copy);
  share.append(row);
  root.append(share);

  // Per-item review: what you missed and why.
  const review = el('div', 'score-review');
  review.append(el('h3', null, 'Review'));
  items.forEach((item, idx) => {
    const r = byId.get(item.id);
    const row = el('div', `score-rev ${r && r.correct ? 'ok' : 'bad'}`);
    row.append(el('span', 'score-rev-mark', r && r.correct ? '✓' : '✗'));
    const body = el('div', 'score-rev-body');
    body.append(el('p', 'score-rev-q', `Q${idx + 1}. ${item.prompt}`));
    if (r && !r.correct) {
      const correctText =
        item.type === 'order'
          ? r.answer.map((i) => item.options[i]).join(' → ')
          : item.options[r.answer];
      body.append(el('p', 'score-rev-ans', `Correct: ${correctText}`));
    }
    if (r && r.explain) body.append(el('p', 'score-rev-why', r.explain));
    row.append(body);
    review.append(row);
  });
  root.append(review);

  const again = el('button', 'btn-ghost score-again', 'Take another test');
  again.type = 'button';
  again.addEventListener('click', renderStart);
  root.append(again);
}
