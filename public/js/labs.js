import { $, api, say, ROLE_LABEL } from './common.js';

// A lab is an artifact plus the questions somebody would ask about it. The
// viewer has to make hunting possible, so both kinds get a filter: that is
// what an analyst actually does with a log or an alert queue.

// A guided walk through a lab's tasks: one step at a time, reveal the model
// answer for that step, then move on. step is the index into tasks; answers
// holds what the learner wrote at each step; done marks it finished.
const state = {
  lab: null,
  tasks: [],
  step: 0,
  answers: [],
  stepRevealed: false,
  rows: null,
  sort: { col: null, dir: 1 },
};
let onNeedsAuth = () => {};
let onOpenLab = () => {};

export function setLabHandlers({ needsAuth, openLab }) {
  onNeedsAuth = needsAuth;
  onOpenLab = openLab;
}

/* ----------------------------------------------------------- the list */

// Level (who it is for) and difficulty (how hard it is) are two different
// axes: a fresher lab can be medium, a mid lab can be hard. Both are filterable
// and both are sortable, so a candidate can warm up easy or go straight for the
// hard ones.
const DIFF_LABEL = { 1: 'Easy', 2: 'Medium', 3: 'Hard' };
let allLabs = [];
let wired = false;
const labView = { role: '', level: '', diff: '', sort: 'diff-asc' };

function labCard(lab) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'lab-card';

  const top = document.createElement('div');
  top.className = 'lab-top';
  const tag = document.createElement('span');
  tag.className = 'lab-tag';
  tag.setAttribute('aria-hidden', 'true');
  const ext = String(lab.artifact_name || '').split('.').pop();
  tag.textContent = (ext && ext !== lab.artifact_name ? ext : 'lab').slice(0, 4).toUpperCase();
  const head = document.createElement('div');
  const h = document.createElement('h3');
  h.textContent = lab.title;
  const meta = document.createElement('div');
  meta.className = 'meta';
  for (const bit of [
    ROLE_LABEL[lab.role] || lab.role,
    lab.artifact_name,
    `${lab.tasks} task${lab.tasks === 1 ? '' : 's'}`,
  ]) {
    const s = document.createElement('span');
    s.textContent = bit;
    meta.append(s);
  }
  head.append(h, meta);
  top.append(tag, head);

  const foot = document.createElement('div');
  foot.className = 'lab-foot';
  const lvl = document.createElement('span');
  lvl.className = 'lvl' + (lab.level === 'mid' ? ' mid' : '');
  lvl.textContent = lab.level === 'mid' ? 'Mid-level' : lab.level === 'fresher' ? 'Fresher' : lab.level;
  foot.append(lvl);
  if (lab.difficulty) {
    const diff = document.createElement('span');
    diff.className = 'diff d' + lab.difficulty;
    diff.textContent = DIFF_LABEL[lab.difficulty] || '';
    foot.append(diff);
  }
  if (lab.done) {
    const done = document.createElement('span');
    done.className = 'done';
    done.textContent = 'Solved';
    foot.append(done);
  }
  const go = document.createElement('span');
  go.className = 'go';
  go.textContent = lab.done ? 'Review lab' : 'Open lab';
  foot.append(go);

  card.append(top, foot);
  card.addEventListener('click', () => onOpenLab(lab.id));
  return card;
}

function render() {
  const v = labView;
  const lvl = (l) => (l.level === 'mid' ? 1 : 0);
  const byTitle = (a, b) => a.title.localeCompare(b.title);
  const rows = allLabs
    .filter(
      (l) =>
        (!v.role || l.role === v.role) &&
        (!v.level || l.level === v.level) &&
        (!v.diff || String(l.difficulty) === v.diff),
    )
    .sort((a, b) => {
      if (v.sort === 'diff-desc') return b.difficulty - a.difficulty || byTitle(a, b);
      if (v.sort === 'level-asc') return lvl(a) - lvl(b) || a.difficulty - b.difficulty || byTitle(a, b);
      if (v.sort === 'level-desc') return lvl(b) - lvl(a) || a.difficulty - b.difficulty || byTitle(a, b);
      return a.difficulty - b.difficulty || byTitle(a, b); // diff-asc default
    });

  if (!rows.length) {
    $('labList').replaceChildren();
    say($('labsMsg'), 'No labs match those filters. Widen them.');
    return;
  }
  say($('labsMsg'), '');
  $('labList').replaceChildren(...rows.map(labCard));
}

function wireControls() {
  const apply = () => {
    labView.role = $('lfRole').value;
    labView.level = $('lfLevel').value;
    labView.diff = $('lfDiff').value;
    labView.sort = $('lfSort').value;
    render();
  };
  ['lfRole', 'lfLevel', 'lfDiff', 'lfSort'].forEach((id) => $(id).addEventListener('change', apply));
}

export async function loadLabs() {
  say($('labsMsg'), '');
  try {
    const out = await api('/api/labs');
    allLabs = out.labs || [];
    if (!wired) {
      wireControls();
      wired = true;
    }
    if (!allLabs.length) {
      say($('labsMsg'), 'No labs yet. Add the first one from the admin page.');
      $('labList').replaceChildren();
      return;
    }
    render();
  } catch (err) {
    if (err.status === 401) return onNeedsAuth();
    say($('labsMsg'), err.message, 'err');
  }
}

/* ------------------------------------------------------------ one lab */

export async function openLab(id) {
  say($('labMsg'), '');
  state.rows = null;
  state.sort = { col: null, dir: 1 };
  state.step = 0;
  state.answers = [];
  state.stepRevealed = false;
  progShown = 0;
  $('labRate').hidden = true;
  $('artFilter').value = '';

  try {
    const out = await api(`/api/labs/${id}`);
    state.lab = out.lab;
    state.tasks = out.tasks;
    state.answers = out.tasks.map(() => '');

    $('labTitle').textContent = out.lab.title;
    $('labMeta').textContent = `${ROLE_LABEL[out.lab.role] || out.lab.role} / ${out.lab.level}`;
    $('labBrief').textContent = out.lab.brief;
    $('artName').textContent = `${out.lab.artifact_name} · ${formatBytes(out.lab.bytes)}`;

    if (out.lab.artifact_kind === 'table') renderTable(out.lab.body || '');
    else renderLog(out.lab.body || '');

    $('labDone').replaceChildren();
    renderStep();
    return true;
  } catch (err) {
    if (err.status === 401) {
      onNeedsAuth();
      return false;
    }
    say($('labMsg'), err.message, 'err');
    return false;
  }
}

function formatBytes(n) {
  if (!n) return '0 B';
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(1)} KB`;
}

/* ------------------------------------------------------- log viewer */

function renderLog(body) {
  const lines = body.split('\n');
  const grid = document.createElement('div');
  grid.className = 'loglines';
  lines.forEach((text, i) => {
    const ln = document.createElement('div');
    ln.className = 'ln';
    ln.textContent = String(i + 1);
    const lt = document.createElement('div');
    lt.className = 'lt';
    lt.textContent = text;
    grid.append(ln, lt);
  });
  $('artBody').replaceChildren(grid);
  filterLog('');
}

function filterLog(needle) {
  const grid = $('artBody').firstElementChild;
  if (!grid) return;
  const kids = [...grid.children];
  const total = kids.length / 2;
  let shown = 0;
  for (let i = 0; i < kids.length; i += 2) {
    const text = kids[i + 1].textContent.toLowerCase();
    const match = !needle || text.includes(needle);
    kids[i].classList.toggle('off', !match);
    kids[i + 1].classList.toggle('off', !match);
    kids[i].classList.toggle('hit', Boolean(needle) && match);
    kids[i + 1].classList.toggle('hit', Boolean(needle) && match);
    if (match) shown += 1;
  }
  $('artCount').textContent = needle ? `${shown} of ${total} lines` : `${total} lines`;
}

/* ----------------------------------------------------- table viewer */

// Small CSV reader: handles quoted fields, which is all these artifacts need.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; }
        else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c !== ''));
}

function renderTable(body) {
  const rows = parseCsv(body);
  if (!rows.length) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = 'This artifact has no rows.';
    $('artBody').replaceChildren(p);
    return;
  }
  state.rows = { head: rows[0], body: rows.slice(1) };
  drawTable();
}

function drawTable() {
  const { head, body } = state.rows;
  const needle = $('artFilter').value.trim().toLowerCase();

  let data = body.map((r, i) => ({ r, i }));
  if (state.sort.col !== null) {
    const c = state.sort.col;
    data.sort((a, b) => {
      const x = a.r[c] ?? '';
      const y = b.r[c] ?? '';
      const nx = Number(x);
      const ny = Number(y);
      const cmp = !Number.isNaN(nx) && !Number.isNaN(ny) && x !== '' && y !== ''
        ? nx - ny
        : x.localeCompare(y);
      return cmp * state.sort.dir || a.i - b.i;
    });
  }

  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const htr = document.createElement('tr');
  head.forEach((name, c) => {
    const th = document.createElement('th');
    th.textContent = name;
    if (state.sort.col === c) {
      const dir = document.createElement('span');
      dir.className = 'dir';
      dir.textContent = state.sort.dir === 1 ? '↑' : '↓';
      th.append(dir);
    }
    th.addEventListener('click', () => {
      if (state.sort.col === c) state.sort.dir *= -1;
      else state.sort = { col: c, dir: 1 };
      drawTable();
    });
    htr.append(th);
  });
  thead.append(htr);

  const tbody = document.createElement('tbody');
  let shown = 0;
  for (const { r } of data) {
    const hay = r.join(' ').toLowerCase();
    if (needle && !hay.includes(needle)) continue;
    shown += 1;
    const tr = document.createElement('tr');
    if (needle) tr.className = 'hit';
    for (const cell of r) {
      const td = document.createElement('td');
      td.textContent = cell;
      tr.append(td);
    }
    tbody.append(tr);
  }

  table.append(thead, tbody);
  $('artBody').replaceChildren(table);
  $('artCount').textContent = needle
    ? `${shown} of ${body.length} rows`
    : `${body.length} rows`;
}

$('artFilter').addEventListener('input', () => {
  if (state.rows) drawTable();
  else filterLog($('artFilter').value.trim().toLowerCase());
});

/* ------------------------------------------- guided task walkthrough */

// CSP forbids an inline style attribute, so the progress bar grows via WAAPI,
// animating from where it was to where it should be.
let progShown = 0;
function grow(node, pct) {
  const to = Math.max(0, Math.min(100, pct));
  node.animate([{ width: progShown + '%' }, { width: to + '%' }], { duration: 400, easing: 'ease-out', fill: 'both' });
  progShown = to;
}

// Draw the active step: its prompt and a fresh answer box, reveal hidden behind
// the learner's attempt.
function renderStep() {
  const i = state.step;
  const t = state.tasks[i];
  if (!t) return;
  state.stepRevealed = false;
  $('labProgress').textContent = `Step ${i + 1} of ${state.tasks.length}`;
  grow($('labProgFill'), state.tasks.length ? (i / state.tasks.length) * 100 : 0);
  $('labStep').hidden = false;
  $('labStepNo').textContent = `task ${t.position}`;
  $('labStepQ').textContent = t.prompt;
  const ta = $('labStepAnswer');
  ta.value = state.answers[i] || '';
  ta.readOnly = false;
  $('labStepModel').hidden = true;
  $('labStepNextWrap').hidden = true;
  $('labStepReveal').hidden = false;
  $('labStepReveal').disabled = false;
}

// Fold the finished step into the running record above the active one, so the
// learner keeps the thread without the current step competing for attention.
function appendDone(task, answer, model) {
  const box = document.createElement('div');
  box.className = 'lab-done-item';
  const q = document.createElement('p');
  q.className = 'lab-done-q';
  q.textContent = `${task.position}. ${task.prompt}`;
  box.append(q);
  if (answer) {
    const you = document.createElement('p');
    you.className = 'lab-done-you';
    you.textContent = answer;
    box.append(you);
  }
  const m = document.createElement('p');
  m.className = 'lab-done-model';
  m.textContent = model;
  box.append(m);
  $('labDone').append(box);
}

function finishLab() {
  grow($('labProgFill'), 100);
  $('labProgress').textContent = `${state.tasks.length} of ${state.tasks.length} done`;
  $('labStep').hidden = true;
  $('labRate').hidden = false;
  $('labRate').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

$('labStepReveal').addEventListener('click', async () => {
  if (!state.lab || state.stepRevealed) return;
  const i = state.step;
  const t = state.tasks[i];
  state.answers[i] = $('labStepAnswer').value.trim();
  $('labStepReveal').disabled = true;
  try {
    const out = await api(`/api/labs/${state.lab.id}/answers?position=${t.position}`);
    $('labStepModelText').textContent = out.tasks?.[0]?.model_answer || '';
    $('labStepModel').hidden = false;
    $('labStepAnswer').readOnly = true;
    state.stepRevealed = true;
    $('labStepReveal').hidden = true;
    const last = i === state.tasks.length - 1;
    $('labStepNext').textContent = last ? 'Finish and rate' : 'Next step';
    $('labStepNextWrap').hidden = false;
    $('labStepModel').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  } catch (err) {
    $('labStepReveal').disabled = false;
    if (err.status === 401) return onNeedsAuth();
    say($('labMsg'), err.message, 'err');
  }
});

$('labStepNext').addEventListener('click', () => {
  if (!state.stepRevealed) return;
  const i = state.step;
  appendDone(state.tasks[i], state.answers[i], $('labStepModelText').textContent);
  if (i === state.tasks.length - 1) {
    finishLab();
  } else {
    state.step = i + 1;
    renderStep();
  }
});

$('labRate').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-lab-rate]');
  if (!btn || !state.lab) return;
  const buttons = $('labRate').querySelectorAll('button');
  buttons.forEach((b) => (b.disabled = true));
  say($('labMsg'), 'Saving.');
  try {
    await api('/api/lab-attempts', {
      method: 'POST',
      body: JSON.stringify({ lab_id: state.lab.id, answers: state.answers, self_rating: btn.dataset.labRate }),
    });
    say($('labMsg'), 'Recorded.', 'ok');
    await loadLabs();
  } catch (err) {
    if (err.status === 401) return onNeedsAuth();
    say($('labMsg'), err.message, 'err');
  }
  buttons.forEach((b) => (b.disabled = false));
});
