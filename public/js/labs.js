import { $, api, say, ROLE_LABEL } from './common.js';

// A lab is an artifact plus the questions somebody would ask about it. The
// viewer has to make hunting possible, so both kinds get a filter: that is
// what an analyst actually does with a log or an alert queue.

const state = { lab: null, tasks: [], revealed: false, rows: null, sort: { col: null, dir: 1 } };
let onNeedsAuth = () => {};
let onOpenLab = () => {};

export function setLabHandlers({ needsAuth, openLab }) {
  onNeedsAuth = needsAuth;
  onOpenLab = openLab;
}

/* ----------------------------------------------------------- the list */

export async function loadLabs() {
  say($('labsMsg'), '');
  try {
    const out = await api('/api/labs');
    if (!out.labs.length) {
      say($('labsMsg'), 'No labs yet. Add the first one from the admin page.');
      $('labList').replaceChildren();
      return;
    }
    const cards = out.labs.map((lab) => {
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
    });
    $('labList').replaceChildren(...cards);
  } catch (err) {
    if (err.status === 401) return onNeedsAuth();
    say($('labsMsg'), err.message, 'err');
  }
}

/* ------------------------------------------------------------ one lab */

export async function openLab(id) {
  say($('labMsg'), '');
  state.revealed = false;
  state.rows = null;
  state.sort = { col: null, dir: 1 };
  $('labRate').hidden = true;
  $('labReveal').hidden = false;
  $('labReveal').disabled = false;
  $('artFilter').value = '';

  try {
    const out = await api(`/api/labs/${id}`);
    state.lab = out.lab;
    state.tasks = out.tasks;

    $('labTitle').textContent = out.lab.title;
    $('labMeta').textContent = `${ROLE_LABEL[out.lab.role] || out.lab.role} / ${out.lab.level}`;
    $('labBrief').textContent = out.lab.brief;
    $('artName').textContent = `${out.lab.artifact_name} · ${formatBytes(out.lab.bytes)}`;

    if (out.lab.artifact_kind === 'table') renderTable(out.lab.body || '');
    else renderLog(out.lab.body || '');

    renderTasks();
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

/* ------------------------------------------------------------- tasks */

function renderTasks() {
  const items = state.tasks.map((t) => {
    const box = document.createElement('div');
    box.className = 'task';
    box.dataset.position = String(t.position);

    const no = document.createElement('span');
    no.className = 'no';
    no.textContent = `task ${t.position}`;

    const q = document.createElement('p');
    q.className = 'q';
    q.textContent = t.prompt;

    const ta = document.createElement('textarea');
    ta.placeholder = 'Answer from what you can see in the artifact.';
    ta.setAttribute('aria-label', `Answer to task ${t.position}`);

    box.append(no, q, ta);
    return box;
  });
  $('taskList').replaceChildren(...items);
}

$('labReveal').addEventListener('click', async () => {
  if (!state.lab || state.revealed) return;
  $('labReveal').disabled = true;
  try {
    const out = await api(`/api/labs/${state.lab.id}/answers`);
    state.revealed = true;
    for (const t of out.tasks) {
      const box = $('taskList').querySelector(`[data-position="${t.position}"]`);
      if (!box) continue;
      const model = document.createElement('div');
      model.className = 'model';
      const h = document.createElement('h4');
      h.textContent = 'What a strong answer covers';
      const p = document.createElement('p');
      p.textContent = t.model_answer;
      model.append(h, p);
      box.append(model);
    }
    $('labReveal').hidden = true;
    $('labRate').hidden = false;
  } catch (err) {
    $('labReveal').disabled = false;
    if (err.status === 401) return onNeedsAuth();
    say($('labMsg'), err.message, 'err');
  }
});

$('labRate').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-lab-rate]');
  if (!btn || !state.lab) return;
  const buttons = $('labRate').querySelectorAll('button');
  buttons.forEach((b) => (b.disabled = true));
  say($('labMsg'), 'Saving.');
  try {
    const answers = [...$('taskList').querySelectorAll('textarea')].map((t) => t.value.trim());
    await api('/api/lab-attempts', {
      method: 'POST',
      body: JSON.stringify({ lab_id: state.lab.id, answers, self_rating: btn.dataset.labRate }),
    });
    say($('labMsg'), 'Recorded.', 'ok');
    await loadLabs();
  } catch (err) {
    if (err.status === 401) return onNeedsAuth();
    say($('labMsg'), err.message, 'err');
  }
  buttons.forEach((b) => (b.disabled = false));
});
