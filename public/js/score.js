// The SecMox Score: a timed, scenario-based test per role, taken one question at
// a time. Each scenario is a ladder of escalating steps; the score rewards how
// far you climb correctly (depth), not flat correctness. Scenario variables and
// option order are randomised every attempt, and every step has one right answer
// the server checks, so the score cannot be self-inflated or memorised by rote.

import { $, api, say, ROLE_LABEL } from './common.js';

const ROLES = ['soc', 'pentest', 'network', 'cloud', 'grc'];
const roleName = (r) => ROLE_LABEL[r] || r;

let run = null;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function shuffle(n) {
  const a = [...Array(n).keys()];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Slide the current question card out, then run fn (which draws the next one
// with its own enter animation). Falls through instantly if motion is reduced.
function leaveThen(fn) {
  const card = $('scoreBody').querySelector('.score-chain');
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!card || reduce) {
    fn();
    return;
  }
  card.classList.remove('q-enter');
  card.classList.add('q-leave');
  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    fn();
  };
  card.addEventListener('animationend', go, { once: true });
  setTimeout(go, 220); // fallback if animationend does not fire
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
    'A timed, scenario-based test, one question at a time. Each scenario is a ladder that gets ' +
    'harder step by step, and your score is how far you climb correctly, not how many you tick. ' +
    'The details and the length change every attempt. Enter your name, then pick a role to begin.';
  root.append(intro);

  const nameWrap = el('div', 'score-namewrap');
  const nameLabel = el('label', 'score-namelabel', 'Your name (shown on your scorecard)');
  nameLabel.htmlFor = 'scoreName';
  const nameInput = el('input', 'score-nameinput');
  nameInput.id = 'scoreName';
  nameInput.type = 'text';
  nameInput.maxLength = 60;
  nameInput.placeholder = 'e.g. Priya Sharma';
  nameInput.autocomplete = 'name';
  if (run && run.name) nameInput.value = run.name;
  nameWrap.append(nameLabel, nameInput);
  const nameMsg = el('p', 'msg');
  nameMsg.id = 'scoreNameMsg';
  nameWrap.append(nameMsg);
  root.append(nameWrap);

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
      row.href = `/score/?code=${s.code || ''}`;
      row.target = '_blank';
      row.rel = 'noopener';
      row.append(el('span', 'score-hist-role', roleName(s.role)));
      row.append(el('span', `score-hist-num band-${s.band}`, String(s.score)));
      if (s.code) row.append(el('span', 'score-hist-code', s.code));
      row.append(el('span', 'score-hist-date', new Date(s.date).toLocaleDateString()));
      list.append(row);
    }
    box.append(list);
  } catch {
    // A missing history is not worth an error.
  }
}

// --- The test: one question at a time ---

async function startRun(role) {
  const name = ($('scoreName')?.value || '').trim();
  if (name.length < 2) {
    say($('scoreNameMsg'), 'Enter your name first, it goes on your scorecard.', 'err');
    $('scoreName')?.focus();
    return;
  }
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

  // Flatten chains into a single sequence of questions, each carrying its
  // scenario context. Shuffle each question's options up front.
  const flat = [];
  data.chains.forEach((ch, ci) => {
    ch.steps.forEach((step, si) => {
      flat.push({ chainId: ch.id, chainIdx: ci, stepIdx: si, step, order: shuffle(step.options.length) });
    });
  });

  run = { role, name, chains: data.chains, flat, pos: 0, answers: new Map() };
  renderQuestion();
  startTimer(Math.max(6, data.chains.length * 3));
}

function diffLabel(d) {
  return d >= 3 ? 'hard' : d === 2 ? 'medium' : 'easy';
}

function renderQuestion() {
  const root = $('scoreBody');
  root.replaceChildren();
  const q = run.flat[run.pos];
  const chain = run.chains[q.chainIdx];

  // Header: role, timer, progress.
  const head = el('div', 'score-runhead');
  head.append(el('h2', null, `${roleName(run.role)} score test`));
  const clock = el('span', 'score-clock');
  clock.id = 'scoreClock';
  head.append(clock);
  root.append(head);

  const prog = el('div', 'score-progress');
  prog.append(el('span', 'score-progress-n', `Question ${run.pos + 1} of ${run.flat.length}`));
  const bar = el('div', 'score-progress-bar');
  const fill = el('div', 'score-progress-fill');
  fill.style.width = `${Math.round((run.pos / run.flat.length) * 100)}%`;
  bar.append(fill);
  prog.append(bar);
  root.append(prog);

  // Scenario context.
  const card = el('div', 'score-chain q-enter');
  const meta = el('div', 'score-item-meta');
  meta.append(el('span', 'score-num', `Scenario ${q.chainIdx + 1}`));
  meta.append(el('span', 'score-topic', chain.title));
  meta.append(el('span', `score-diff d-${diffLabel(chain.difficulty)}`, diffLabel(chain.difficulty)));
  card.append(meta);
  const scen = el('pre', 'score-scenario');
  scen.append(el('code', null, chain.scenario));
  card.append(scen);

  // The current step.
  const stepWrap = el('div', 'score-ladder-step');
  const sh = el('p', 'score-step-head');
  if (q.step.label) sh.append(el('span', 'score-step-label', q.step.label));
  sh.append(el('span', 'score-step-prompt', q.step.prompt));
  stepWrap.append(sh);

  const opts = el('div', 'score-opts');
  const key = `${q.chainId}::${q.stepIdx}`;
  const name = `q${run.pos}`;
  const chosen = run.answers.get(key);
  q.order.forEach((origIdx, displayPos) => {
    const id = `${name}-${displayPos}`;
    const label = el('label', 'score-opt');
    label.htmlFor = id;
    const input = el('input');
    input.type = 'radio';
    input.name = name;
    input.id = id;
    input.value = String(origIdx);
    if (chosen === origIdx) input.checked = true;
    input.addEventListener('change', () => run.answers.set(key, origIdx));
    label.append(input);
    label.append(el('span', 'score-opt-text', q.step.options[origIdx]));
    opts.append(label);
  });
  stepWrap.append(opts);
  card.append(stepWrap);
  root.append(card);

  // Navigation.
  const foot = el('div', 'score-foot');
  const last = run.pos === run.flat.length - 1;
  const next = el('button', 'btn', last ? 'Submit and get my score' : 'Next question');
  next.type = 'button';
  next.id = 'scoreNext';
  next.addEventListener('click', () => {
    if (!run.answers.has(key)) {
      say($('scoreRunMsg'), 'Pick an answer to continue.', 'err');
      return;
    }
    next.disabled = true; // guard against a double-click during the transition
    if (last) {
      leaveThen(() => submitRun(false));
    } else {
      leaveThen(() => {
        run.pos += 1;
        renderQuestion();
      });
    }
  });
  foot.append(next);
  const msg = el('p', 'msg');
  msg.id = 'scoreRunMsg';
  foot.append(msg);
  root.append(foot);
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
  stopTimer();
  const next = $('scoreNext');
  if (next) next.disabled = true;
  const msg = $('scoreRunMsg');
  if (msg) say(msg, 'Scoring.');

  // Group answers back into per-chain arrays in step order.
  const runs = run.chains.map((ch) => ({
    id: ch.id,
    answers: ch.steps.map((_, si) => {
      const v = run.answers.get(`${ch.id}::${si}`);
      return v === undefined ? null : v;
    }),
  }));

  try {
    const out = await api('/api/score/submit', {
      method: 'POST',
      body: JSON.stringify({ role: run.role, name: run.name, runs }),
    });
    renderResult(out);
  } catch (err) {
    if (next) next.disabled = false;
    if (msg) say(msg, err.message, 'err');
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

  // The credential code is the thing to flaunt: short, memorable, verifiable.
  if (out.code) {
    const cred = el('div', 'score-cred');
    cred.append(el('p', 'score-cred-label', 'Your verification code'));
    const codeRow = el('div', 'score-code-row');
    codeRow.append(el('span', 'score-code', out.code));
    const copyC = el('button', 'btn-ghost', 'Copy');
    copyC.type = 'button';
    copyC.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(out.code);
        copyC.textContent = 'Copied';
        setTimeout(() => (copyC.textContent = 'Copy'), 1500);
      } catch {
        /* clipboard may be blocked; the code is visible to copy by hand */
      }
    });
    codeRow.append(copyC);
    cred.append(codeRow);
    cred.append(
      el(
        'p',
        'score-cred-hint',
        `Put this on your resume. Anyone can verify it at ${location.host} without signing in.`,
      ),
    );
    root.append(cred);
  }

  const share = el('div', 'score-share');
  const link = `${location.origin}/score/?code=${out.code || ''}`;
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
  share.append(el('p', 'sub', 'Or share the direct link:'));
  const row = el('div', 'score-link-row');
  row.append(field, copy);
  share.append(row);
  root.append(share);

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
