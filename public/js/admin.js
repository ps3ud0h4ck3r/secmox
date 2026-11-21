import { $, api, say } from './common.js';
import { clearLabForm, loadLabTable, setLabAdminHooks } from './admin-labs.js';

let questions = [];

/* ------------------------------------------------------- follow-ups */

function addFollowUp(value = {}) {
  const list = $('fuList');
  if (list.children.length >= 6) return;

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
  l1.textContent = 'What the interviewer asks next';
  const t1 = document.createElement('textarea');
  t1.className = 'fu-prompt short';
  t1.placeholder = 'The success was on a different account from the failures. Does that change your read?';
  t1.value = value.prompt || '';
  f1.append(l1, t1);

  const f2 = document.createElement('div');
  f2.className = 'field';
  const l2 = document.createElement('label');
  l2.textContent = 'What a strong answer covers';
  const t2 = document.createElement('textarea');
  t2.className = 'fu-answer short';
  t2.value = value.model_answer || '';
  f2.append(l2, t2);

  box.append(head, f1, f2);
  list.append(box);
  renumber();
}

function renumber() {
  [...$('fuList').children].forEach((box, i) => {
    box.querySelector('.fu-head span').textContent = `follow-up ${i + 1}`;
  });
}

function readFollowUps() {
  return [...$('fuList').children].map((box) => ({
    prompt: box.querySelector('.fu-prompt').value.trim(),
    model_answer: box.querySelector('.fu-answer').value.trim(),
  }));
}

$('addFu').addEventListener('click', () => addFollowUp());

/* ------------------------------------------------------------- form */

function clearForm() {
  $('qId').value = '';
  $('qTopic').value = '';
  $('qPrompt').value = '';
  $('qAnswer').value = '';
  $('fuList').replaceChildren();
  addFollowUp();
  addFollowUp();
  $('formTitle').textContent = 'Add a question';
  $('saveBtn').textContent = 'Save question';
  say($('formMsg'), '');
}

$('clearBtn').addEventListener('click', () => {
  clearForm();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

$('qForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    id: $('qId').value || undefined,
    role: $('qRole').value,
    level: $('qLevel').value,
    topic: $('qTopic').value.trim(),
    prompt: $('qPrompt').value.trim(),
    model_answer: $('qAnswer').value.trim(),
    follow_ups: readFollowUps().filter((f) => f.prompt || f.model_answer),
  };

  $('saveBtn').disabled = true;
  say($('formMsg'), 'Saving.');
  try {
    const out = await api('/api/admin/questions', { method: 'POST', body: JSON.stringify(payload) });
    clearForm();
    say($('formMsg'), `Saved as ${out.id}. It is live now.`, 'ok');
    await load();
  } catch (err) {
    say($('formMsg'), err.message, 'err');
  }
  $('saveBtn').disabled = false;
});

async function edit(id) {
  try {
    const out = await api(`/api/admin/questions/${id}`);
    $('qId').value = out.question.id;
    $('qRole').value = out.question.role;
    $('qLevel').value = out.question.level;
    $('qTopic').value = out.question.topic;
    $('qPrompt').value = out.question.prompt;
    $('qAnswer').value = out.question.model_answer;
    $('fuList').replaceChildren();
    (out.follow_ups.length ? out.follow_ups : [{}, {}]).forEach((f) => addFollowUp(f));
    $('formTitle').textContent = `Editing ${out.question.id}`;
    $('saveBtn').textContent = 'Save changes';
    say($('formMsg'), '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    say($('listMsg'), err.message, 'err');
  }
}

async function remove(id, attempts) {
  const extra = attempts ? ` ${attempts} recorded attempt${attempts > 1 ? 's' : ''} go with it.` : '';
  if (!window.confirm(`Delete ${id}?${extra} This cannot be undone.`)) return;
  try {
    await api(`/api/admin/questions/${id}/delete`, { method: 'POST' });
    say($('listMsg'), `${id} deleted.`, 'ok');
    await load();
  } catch (err) {
    say($('listMsg'), err.message, 'err');
  }
}

/* ------------------------------------------------------------- list */

function cell(text, className) {
  const td = document.createElement('td');
  if (className) td.className = className;
  td.textContent = text;
  return td;
}

function render() {
  const needle = $('filter').value.trim().toLowerCase();
  const shown = questions.filter(
    (q) =>
      !needle ||
      [q.role, q.level, q.topic, q.prompt, q.id].join(' ').toLowerCase().includes(needle),
  );

  if (!shown.length) {
    const tr = document.createElement('tr');
    const td = cell(
      questions.length ? 'Nothing matches that filter.' : 'The bank is empty. Add the first question above.',
      'none',
    );
    td.colSpan = 7;
    tr.append(td);
    $('rows').replaceChildren(tr);
    return;
  }

  const rows = shown.map((q) => {
    const tr = document.createElement('tr');
    const chain = cell(String(q.follow_ups), q.follow_ups ? 'meta' : 'meta chain-zero');

    const acts = document.createElement('td');
    const wrap = document.createElement('div');
    wrap.className = 'actions';
    const e = document.createElement('button');
    e.type = 'button';
    e.className = 'inf ghost small';
    e.textContent = 'Edit';
    e.addEventListener('click', () => edit(q.id));
    const d = document.createElement('button');
    d.type = 'button';
    d.className = 'inf danger small';
    d.textContent = 'Delete';
    d.addEventListener('click', () => remove(q.id, q.attempts));
    wrap.append(e, d);
    acts.append(wrap);

    tr.append(
      cell(q.prompt, 'q'),
      cell(q.role, 'meta'),
      cell(q.level, 'meta'),
      cell(q.topic, 'meta'),
      chain,
      cell(String(q.attempts), 'meta'),
      acts,
    );
    return tr;
  });

  $('rows').replaceChildren(...rows);
}

$('filter').addEventListener('input', render);

async function load() {
  const [list, stats] = await Promise.all([api('/api/admin/questions'), api('/api/admin/stats')]);
  questions = list.questions;
  render();

  const tiles = [
    ['Questions', stats.stats.questions],
    ['Follow-ups', stats.stats.follow_ups],
    ['Labs', stats.stats.labs],
    ['Scenarios', stats.stats.scenarios],
    ['Accounts', stats.stats.users],
    [
      'Attempts',
      stats.stats.attempts + stats.stats.lab_attempts + stats.stats.scenario_attempts,
    ],
  ].map(([k, v]) => {
    const el = document.createElement('div');
    el.className = 'stat';
    const kk = document.createElement('div');
    kk.className = 'k';
    kk.textContent = k;
    const vv = document.createElement('div');
    vv.className = 'v';
    vv.textContent = v;
    el.append(kk, vv);
    return el;
  });
  $('stats').replaceChildren(...tiles);

  say(
    $('mailWarn'),
    stats.mail ? '' : 'Password reset email is not switched on: set RESEND_API_KEY and MAIL_FROM on the Worker.',
    'err',
  );
}

function showPane(which) {
  const labs = which === 'labs';
  $('labsPane').hidden = !labs;
  $('questionsPane').hidden = labs;
  $('paneLabs').toggleAttribute('aria-current', labs);
  $('paneQuestions').toggleAttribute('aria-current', !labs);
  if (labs) $('paneLabs').setAttribute('aria-current', 'page');
  else $('paneQuestions').setAttribute('aria-current', 'page');
}

$('paneQuestions').addEventListener('click', () => showPane('questions'));
$('paneLabs').addEventListener('click', () => showPane('labs'));

setLabAdminHooks({ onSaved: load });

(async () => {
  try {
    const me = await api('/api/me');
    $('whoEmail').textContent = me.user.email;
    await load();
    await loadLabTable();
    $('main').hidden = false;
    clearForm();
    clearLabForm();
    showPane('questions');
  } catch (err) {
    if (err.status === 401) {
      window.location.href = '/app/';
      return;
    }
    $('denied').hidden = false;
  }
})();
