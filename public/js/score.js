// The SecMox Score: a timed, scenario-based test per role. Each scenario is a
// ladder of escalating steps; the score rewards how far you climb correctly
// (depth), not flat correctness. Every step has one right answer the server
// checks, so the score cannot be self-inflated.

import { $, api, say, ROLE_LABEL } from './common.js';

const ROLES = ['soc', 'pentest', 'network', 'cloud', 'grc'];
const roleName = (r) => ROLE_LABEL[r] || r;

let run = null; // { role, chains, answers: Map<chainId, number[]>, timer, endsAt }

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

export function openScore() {
  stopTimer();
  renderStart();
}

// --- Start: pick a role, see past scores ---

function renderStart() {
  run = null;
  const root = $('scoreBody');
  root.replaceChildren();

  const intro = el('p', 'sub');
  intro.textContent =
    'A timed, scenario-based test. Each scenario is a ladder that gets harder step by step, ' +
    'and your score is how far you climb correctly, not how many you tick. Pick a role to begin.';
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
      row.append(el('span', `score-hist-num band-${s.band}`, String(s.score)));
      row.append(el('span', 'score-hist-date', new Date(s.date).toLocaleDateString()));
      list.append(row);
    }
    box.append(list);
  } catch {
    // A missing history is not worth an error.
  }
}

// --- The test ---

async function startRun(role) {
  const root = $('scoreBody');
  root.replaceChildren(el('p', 'sub', 'Loading the test.'));
  let data;
  try {
    data = await api(`/api/score/chains?role=${encodeURIComponent(role)}`);
  } catch (err) {
    root.replaceChildren(el('p', 'msg err', err.message));
    return;
  }
  if (!data.chains.length) {
    root.replaceChildren(el('p', 'sub', 'No scenarios for this role yet. Try another.'));
    const back = el('button', 'btn-ghost', 'Back');
    back.type = 'button';
    back.addEventListener('click', renderStart);
    root.append(back);
    return;
  }
  const answers = new Map();
  for (const ch of data.chains) answers.set(ch.id, new Array(ch.steps.length).fill(null));
  run = { role, chains: data.chains, answers };
  renderRun();
  startTimer(Math.max(6, data.chains.length * 3)); // ~3 minutes a scenario, 6 min floor
}

function diffLabel(d) {
  return d >= 3 ? 'hard' : d === 2 ? 'medium' : 'easy';
}

function renderRun() {
  const root = $('scoreBody');
  root.replaceChildren();

  const head = el('div', 'score-runhead');
  const title = el('h2', null, `${roleName(run.role)} score test`);
  const clock = el('span', 'score-clock');
  clock.id = 'scoreClock';
  head.append(title, clock);
  root.append(head);
  root.append(
    el('p', 'sub', `${run.chains.length} ${run.chains.length === 1 ? 'scenario' : 'scenarios'}. Work through each ladder. Climb as far as you can.`),
  );

  run.chains.forEach((ch, ci) => root.append(renderChain(ch, ci)));

  const foot = el('div', 'score-foot');
  const submit = el('button', 'btn', 'Submit and get my score');
  submit.type = 'button';
  submit.id = 'scoreSubmit';
  submit.addEventListener('click', () => submitRun(false));
  foot.append(submit);
  const msg = el('p', 'msg');
  msg.id = 'scoreRunMsg';
  foot.append(msg);
  root.append(foot);
}

function renderChain(ch, ci) {
  const card = el('div', 'score-chain');

  const meta = el('div', 'score-item-meta');
  meta.append(el('span', 'score-num', `Scenario ${ci + 1}`));
  meta.append(el('span', 'score-topic', ch.title));
  meta.append(el('span', `score-diff d-${diffLabel(ch.difficulty)}`, diffLabel(ch.difficulty)));
  card.append(meta);

  const scen = el('pre', 'score-scenario');
  scen.append(el('code', null, ch.scenario));
  card.append(scen);

  ch.steps.forEach((step, si) => card.append(renderStep(ch, ci, step, si)));
  return card;
}

function renderStep(ch, ci, step, si) {
  const wrap = el('div', 'score-ladder-step');
  const head = el('p', 'score-step-head');
  if (step.label) head.append(el('span', 'score-step-label', step.label));
  head.append(el('span', 'score-step-prompt', step.prompt));
  wrap.append(head);

  const opts = el('div', 'score-opts');
  const name = `${ch.id}::${si}`;
  step.options.forEach((opt, oi) => {
    const id = `${name}-${oi}`;
    const label = el('label', 'score-opt');
    label.htmlFor = id;
    const input = el('input');
    input.type = 'radio';
    input.name = name;
    input.id = id;
    input.value = String(oi);
    input.addEventListener('change', () => {
      run.answers.get(ch.id)[si] = oi;
    });
    label.append(input);
    label.append(el('span', 'score-opt-text', opt));
    opts.append(label);
  });
  wrap.append(opts);
  return wrap;
}

// --- Timer ---

function startTimer(minutes) {
  run.endsAt = Date.now() + minutes * 60_000;
  tick();
  run.timer = setInterval(tick, 1000);
}

function stopTimer() {
  if (run && run.timer) {
    clearInterval(run.timer);
    run.timer = null;
  }
}

function tick() {
  const clock = $('scoreClock');
  if (!clock || !run) return;
  const left = Math.max(0, Math.round((run.endsAt - Date.now()) / 1000));
  const m = Math.floor(left / 60);
  const s = left % 60;
  clock.textContent = `${m}:${String(s).padStart(2, '0')}`;
  clock.classList.toggle('low', left <= 30);
  if (left <= 0) {
    stopTimer();
    submitRun(true);
  }
}

// --- Submit ---

async function submitRun(auto) {
  const msg = $('scoreRunMsg');
  if (!auto) {
    // Every step must be answered for a fair score; on timeout we take whatever
    // is there.
    let missing = 0;
    for (const ch of run.chains) missing += run.answers.get(ch.id).filter((v) => v === null).length;
    if (missing) {
      say(msg, `Answer every step first (${missing} left). The clock is running.`, 'err');
      return;
    }
  }
  stopTimer();
  const btn = $('scoreSubmit');
  if (btn) btn.disabled = true;
  say(msg, 'Scoring.');

  const runs = run.chains.map((ch) => ({ id: ch.id, answers: run.answers.get(ch.id) }));
  try {
    const out = await api('/api/score/submit', {
      method: 'POST',
      body: JSON.stringify({ role: run.role, runs }),
    });
    renderResult(out);
  } catch (err) {
    if (btn) btn.disabled = false;
    say(msg, err.message, 'err');
  }
}

// --- Result ---

function renderResult(out) {
  const chains = run.chains;
  const byId = new Map((out.review || []).map((r) => [r.id, r]));
  const root = $('scoreBody');
  root.replaceChildren();

  const card = el('div', `score-result band-${out.band}`);
  card.append(el('p', 'score-result-label', `${roleName(out.role)} SecMox Score`));
  card.append(el('div', 'score-big', String(out.score)));
  card.append(el('p', 'score-band', `${out.band} · ${out.correct}/${out.total} steps`));
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

  // Per-scenario review: how deep you climbed, and where you fell off.
  const review = el('div', 'score-review');
  review.append(el('h3', null, 'How you climbed'));
  chains.forEach((ch, ci) => {
    const r = byId.get(ch.id);
    if (!r) return;
    const block = el('div', 'score-rev-chain');
    const h = el('p', 'score-rev-chain-h');
    h.append(el('span', null, `Scenario ${ci + 1}: ${ch.title}`));
    h.append(el('span', 'score-rev-depth', `depth ${r.depth}/${r.step_count}`));
    block.append(h);

    ch.steps.forEach((step, si) => {
      const sr = r.steps[si];
      const line = el('div', `score-rev ${sr.correct ? 'ok' : 'bad'}`);
      line.append(el('span', 'score-rev-mark', sr.correct ? '✓' : '✗'));
      const b = el('div', 'score-rev-body');
      b.append(el('p', 'score-rev-q', `${step.label ? step.label + ': ' : ''}${step.prompt}`));
      if (!sr.correct) b.append(el('p', 'score-rev-ans', `Correct: ${step.options[sr.answer]}`));
      if (sr.explain) b.append(el('p', 'score-rev-why', sr.explain));
      line.append(b);
      block.append(line);
    });
    review.append(block);
  });
  root.append(review);

  const again = el('button', 'btn-ghost score-again', 'Take another test');
  again.type = 'button';
  again.addEventListener('click', openScore);
  root.append(again);
}
