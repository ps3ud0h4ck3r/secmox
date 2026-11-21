import { $, api, say, ROLE_LABEL } from './common.js';

// The scenario editor. A scenario is a situation, an ask, a model answer, and
// the rubric: the points a panel listens for. The points carry the weight, so
// the form keeps them on the same screen as the situation they grade.

let scenarios = [];
let reloadStats = async () => {};

export function setScenarioAdminHooks({ onSaved }) {
  reloadStats = onSaved;
}

/* ------------------------------------------------------------ points */

function addPoint(value = {}) {
  const list = $('saPoints');
  if (list.children.length >= 12) return;

  const box = document.createElement('div');
  box.className = 'fu';

  const head = document.createElement('div');
  head.className = 'fu-head';
  const label = document.createElement('span');
  const drop = document.createElement('button');
  drop.type = 'button';
  drop.className = 'inf ghost small';
  drop.textContent = 'Remove';
  drop.addEventListener('click', () => {
    box.remove();
    renumber();
  });
  head.append(label, drop);

  const f1 = document.createElement('div');
  f1.className = 'field';
  const l1 = document.createElement('label');
  l1.textContent = 'The point, as the candidate ticks it';
  const t1 = document.createElement('input');
  t1.className = 'point-label';
  t1.placeholder = 'Establishes whether it is still live before anything else';
  t1.value = value.label || '';
  f1.append(l1, t1);

  const f2 = document.createElement('div');
  f2.className = 'field';
  const l2 = document.createElement('label');
  l2.textContent = 'What earns the tick, so a miss teaches why it mattered';
  const t2 = document.createElement('textarea');
  t2.className = 'point-detail short';
  t2.placeholder = 'Process still running, persistence written, connection still open. Six hours of lag does not mean it is over.';
  t2.value = value.detail || '';
  f2.append(l2, t2);

  box.append(head, f1, f2);
  list.append(box);
  renumber();
}

function renumber() {
  [...$('saPoints').children].forEach((box, i) => {
    box.querySelector('.fu-head span').textContent = `point ${i + 1}`;
  });
}

function readPoints() {
  return [...$('saPoints').children]
    .map((box) => ({
      label: box.querySelector('.point-label').value.trim(),
      detail: box.querySelector('.point-detail').value.trim(),
    }))
    .filter((p) => p.label || p.detail);
}

$('saAddPoint').addEventListener('click', () => addPoint());

/* -------------------------------------------------------------- form */

export function clearScenarioForm() {
  $('saId').value = '';
  $('saTitle').value = '';
  $('saMinutes').value = '20';
  $('saSituation').value = '';
  $('saAsk').value = '';
  $('saModel').value = '';
  $('saFree').checked = false;
  $('saPoints').replaceChildren();
  addPoint();
  addPoint();
  addPoint();
  $('saFormTitle').textContent = 'Add a scenario';
  $('saSave').textContent = 'Save scenario';
  say($('saFormMsg'), '');
}

$('saClear').addEventListener('click', () => {
  clearScenarioForm();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

$('saForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    id: $('saId').value || undefined,
    title: $('saTitle').value.trim(),
    role: $('saRole').value,
    level: $('saLevel').value,
    minutes: Number($('saMinutes').value),
    situation: $('saSituation').value.trim(),
    ask: $('saAsk').value.trim(),
    model_answer: $('saModel').value.trim(),
    is_free: $('saFree').checked,
    points: readPoints(),
  };

  $('saSave').disabled = true;
  say($('saFormMsg'), 'Saving.');
  try {
    const out = await api('/api/admin/scenarios', { method: 'POST', body: JSON.stringify(payload) });
    clearScenarioForm();
    say($('saFormMsg'), `Saved as ${out.id}. It is live now.`, 'ok');
    await loadScenarioTable();
    await reloadStats();
  } catch (err) {
    say($('saFormMsg'), err.message, 'err');
  }
  $('saSave').disabled = false;
});

async function editScenario(id) {
  try {
    const out = await api(`/api/admin/scenarios/${id}`);
    $('saId').value = out.scenario.id;
    $('saTitle').value = out.scenario.title;
    $('saRole').value = out.scenario.role;
    $('saLevel').value = out.scenario.level;
    $('saMinutes').value = out.scenario.minutes;
    $('saSituation').value = out.scenario.situation;
    $('saAsk').value = out.scenario.ask;
    $('saModel').value = out.scenario.model_answer;
    $('saFree').checked = !!out.scenario.is_free;
    $('saPoints').replaceChildren();
    (out.points.length ? out.points : [{}, {}, {}]).forEach((p) => addPoint(p));
    $('saFormTitle').textContent = `Editing ${out.scenario.id}`;
    $('saSave').textContent = 'Save changes';
    say($('saFormMsg'), '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    say($('saListMsg'), err.message, 'err');
  }
}

async function removeScenario(id, attempts) {
  const extra = attempts ? ` ${attempts} recorded attempt${attempts > 1 ? 's' : ''} go with it.` : '';
  if (!window.confirm(`Delete ${id}?${extra} This cannot be undone.`)) return;
  try {
    await api(`/api/admin/scenarios/${id}/delete`, { method: 'POST' });
    say($('saListMsg'), `${id} deleted.`, 'ok');
    await loadScenarioTable();
    await reloadStats();
  } catch (err) {
    say($('saListMsg'), err.message, 'err');
  }
}

/* -------------------------------------------------------------- list */

function cell(text, className) {
  const td = document.createElement('td');
  if (className) td.className = className;
  td.textContent = text;
  return td;
}

export async function loadScenarioTable() {
  const out = await api('/api/admin/scenarios');
  scenarios = out.scenarios;

  if (!scenarios.length) {
    const tr = document.createElement('tr');
    const td = cell('No scenarios yet. Add the first one above.', 'none');
    td.colSpan = 7;
    tr.append(td);
    $('saRows').replaceChildren(tr);
    return;
  }

  const rows = scenarios.map((sc) => {
    const tr = document.createElement('tr');
    const acts = document.createElement('td');
    const wrap = document.createElement('div');
    wrap.className = 'actions';
    const ed = document.createElement('button');
    ed.type = 'button';
    ed.className = 'inf ghost small';
    ed.textContent = 'Edit';
    ed.addEventListener('click', () => editScenario(sc.id));
    const dl = document.createElement('button');
    dl.type = 'button';
    dl.className = 'inf danger small';
    dl.textContent = 'Delete';
    dl.addEventListener('click', () => removeScenario(sc.id, sc.attempts));
    wrap.append(ed, dl);
    acts.append(wrap);

    tr.append(
      cell(sc.title, 'q'),
      cell(ROLE_LABEL[sc.role] || sc.role, 'meta'),
      cell(sc.level, 'meta'),
      cell(`${sc.minutes} min`, 'meta'),
      cell(String(sc.points), sc.points ? 'meta' : 'meta chain-zero'),
      cell(String(sc.attempts), 'meta'),
      acts,
    );
    return tr;
  });

  $('saRows').replaceChildren(...rows);
}
