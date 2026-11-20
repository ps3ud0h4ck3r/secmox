import { $, api, say, ROLE_LABEL } from './common.js';

// The lab editor. A lab is only worth having if every task needs the artifact
// to answer, so the form keeps the artifact and the tasks on the same screen.

let labs = [];
let reloadStats = async () => {};

export function setLabAdminHooks({ onSaved }) {
  reloadStats = onSaved;
}

/* ------------------------------------------------------------- tasks */

function addTask(value = {}) {
  const list = $('taskEditor');
  if (list.children.length >= 10) return;

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
  l1.textContent = 'What they have to work out from the artifact';
  const t1 = document.createElement('textarea');
  t1.className = 'task-prompt short';
  t1.placeholder = 'One external address is responsible. Which is it, and when does it first appear?';
  t1.value = value.prompt || '';
  f1.append(l1, t1);

  const f2 = document.createElement('div');
  f2.className = 'field';
  const l2 = document.createElement('label');
  l2.textContent = 'What a strong answer covers';
  const t2 = document.createElement('textarea');
  t2.className = 'task-answer short';
  t2.value = value.model_answer || '';
  f2.append(l2, t2);

  box.append(head, f1, f2);
  list.append(box);
  renumber();
}

function renumber() {
  [...$('taskEditor').children].forEach((box, i) => {
    box.querySelector('.fu-head span').textContent = `task ${i + 1}`;
  });
}

function readTasks() {
  return [...$('taskEditor').children]
    .map((box) => ({
      prompt: box.querySelector('.task-prompt').value.trim(),
      model_answer: box.querySelector('.task-answer').value.trim(),
    }))
    .filter((t) => t.prompt || t.model_answer);
}

$('addTask').addEventListener('click', () => addTask());

/* -------------------------------------------------------------- form */

function sizeNote() {
  const bytes = new TextEncoder().encode($('labArtifact').value).length;
  $('labBytes').textContent = bytes
    ? `${(bytes / 1024).toFixed(1)} KB pasted. 600 KB limit for now.`
    : 'Or paste above. 600 KB limit for now.';
}

$('labArtifact').addEventListener('input', sizeNote);

$('labFile').addEventListener('change', async () => {
  const file = $('labFile').files?.[0];
  if (!file) return;
  if (file.size > 600_000) {
    say($('labFormMsg'), 'That file is over the 600 KB limit for now.', 'err');
    $('labFile').value = '';
    return;
  }
  $('labArtifact').value = await file.text();
  if (!$('labArtName').value.trim()) $('labArtName').value = file.name;
  if (file.name.endsWith('.csv') || file.name.endsWith('.tsv')) $('labKind').value = 'table';
  sizeNote();
  say($('labFormMsg'), `Loaded ${file.name}.`, 'ok');
});

export function clearLabForm() {
  $('labId').value = '';
  $('labTitleIn').value = '';
  $('labArtName').value = '';
  $('labBriefIn').value = '';
  $('labArtifact').value = '';
  $('labFile').value = '';
  $('taskEditor').replaceChildren();
  addTask();
  addTask();
  $('labFormTitle').textContent = 'Add a lab';
  $('labSave').textContent = 'Save lab';
  sizeNote();
  say($('labFormMsg'), '');
}

$('labClear').addEventListener('click', () => {
  clearLabForm();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

$('labForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    id: $('labId').value || undefined,
    title: $('labTitleIn').value.trim(),
    role: $('labRole').value,
    level: $('labLevel').value,
    brief: $('labBriefIn').value.trim(),
    artifact_kind: $('labKind').value,
    artifact_name: $('labArtName').value.trim(),
    artifact: $('labArtifact').value,
    tasks: readTasks(),
  };

  $('labSave').disabled = true;
  say($('labFormMsg'), 'Saving.');
  try {
    const out = await api('/api/admin/labs', { method: 'POST', body: JSON.stringify(payload) });
    clearLabForm();
    say($('labFormMsg'), `Saved as ${out.id}. It is live now.`, 'ok');
    await loadLabTable();
    await reloadStats();
  } catch (err) {
    say($('labFormMsg'), err.message, 'err');
  }
  $('labSave').disabled = false;
});

async function editLab(id) {
  try {
    const out = await api(`/api/admin/labs/${id}`);
    $('labId').value = out.lab.id;
    $('labTitleIn').value = out.lab.title;
    $('labRole').value = out.lab.role;
    $('labLevel').value = out.lab.level;
    $('labKind').value = out.lab.artifact_kind;
    $('labArtName').value = out.lab.artifact_name;
    $('labBriefIn').value = out.lab.brief;
    $('labArtifact').value = out.lab.body || '';
    $('taskEditor').replaceChildren();
    (out.tasks.length ? out.tasks : [{}, {}]).forEach((t) => addTask(t));
    $('labFormTitle').textContent = `Editing ${out.lab.id}`;
    $('labSave').textContent = 'Save changes';
    sizeNote();
    say($('labFormMsg'), '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    say($('labListMsg'), err.message, 'err');
  }
}

async function removeLab(id, attempts) {
  const extra = attempts ? ` ${attempts} recorded attempt${attempts > 1 ? 's' : ''} go with it.` : '';
  if (!window.confirm(`Delete ${id}?${extra} This cannot be undone.`)) return;
  try {
    await api(`/api/admin/labs/${id}/delete`, { method: 'POST' });
    say($('labListMsg'), `${id} deleted.`, 'ok');
    await loadLabTable();
    await reloadStats();
  } catch (err) {
    say($('labListMsg'), err.message, 'err');
  }
}

/* -------------------------------------------------------------- list */

function cell(text, className) {
  const td = document.createElement('td');
  if (className) td.className = className;
  td.textContent = text;
  return td;
}

export async function loadLabTable() {
  const out = await api('/api/admin/labs');
  labs = out.labs;

  if (!labs.length) {
    const tr = document.createElement('tr');
    const td = cell('No labs yet. Add the first one above.', 'none');
    td.colSpan = 8;
    tr.append(td);
    $('labRows').replaceChildren(tr);
    return;
  }

  const rows = labs.map((lab) => {
    const tr = document.createElement('tr');
    const acts = document.createElement('td');
    const wrap = document.createElement('div');
    wrap.className = 'actions';
    const e = document.createElement('button');
    e.type = 'button';
    e.className = 'inf ghost small';
    e.textContent = 'Edit';
    e.addEventListener('click', () => editLab(lab.id));
    const d = document.createElement('button');
    d.type = 'button';
    d.className = 'inf danger small';
    d.textContent = 'Delete';
    d.addEventListener('click', () => removeLab(lab.id, lab.attempts));
    wrap.append(e, d);
    acts.append(wrap);

    tr.append(
      cell(lab.title, 'q'),
      cell(ROLE_LABEL[lab.role] || lab.role, 'meta'),
      cell(lab.level, 'meta'),
      cell(`${lab.artifact_name} (${lab.artifact_kind})`, 'meta'),
      cell(lab.bytes ? `${(lab.bytes / 1024).toFixed(1)} KB` : '-', 'meta'),
      cell(String(lab.tasks), lab.tasks ? 'meta' : 'meta chain-zero'),
      cell(String(lab.attempts), 'meta'),
      acts,
    );
    return tr;
  });

  $('labRows').replaceChildren(...rows);
}
