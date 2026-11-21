import { $, api, say, ROLE_LABEL } from './common.js';

// The content side of the company console: a company's own private questions,
// and the global catalogue with a hide toggle per item. Wired once by
// setupOrgContent; refilled per company by loadOrgContent. The org id is read
// live through a getter so switching companies in the picker just works.

const LEVEL_LABEL = { fresher: 'Fresher', mid: 'Mid-level' };

let getOrgId = () => null;

/* ------------------------------------------------------- follow-ups */

function renumber() {
  [...$('qcFuList').children].forEach((box, i) => {
    box.querySelector('.fu-head span').textContent = `follow-up ${i + 1}`;
  });
}

function addFollowUp(value = {}) {
  const list = $('qcFuList');
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

function resetFollowUps() {
  $('qcFuList').replaceChildren();
  addFollowUp();
  addFollowUp();
}

function readFollowUps() {
  return [...$('qcFuList').children].map((box) => ({
    prompt: box.querySelector('.fu-prompt').value.trim(),
    model_answer: box.querySelector('.fu-answer').value.trim(),
  }));
}

/* ------------------------------------------------------- tables */

function cell(text, cls) {
  const td = document.createElement('td');
  if (cls) td.className = cls;
  td.textContent = text;
  return td;
}

function emptyRow(tbody, text, cols) {
  const tr = document.createElement('tr');
  const td = cell(text, 'none');
  td.colSpan = cols;
  tr.append(td);
  tbody.replaceChildren(tr);
}

function fillPrivate(questions) {
  const orgId = getOrgId();
  if (!questions.length) {
    emptyRow($('privQRows'), 'Nothing yet. Write one above.', 5);
    return;
  }
  $('privQRows').replaceChildren(
    ...questions.map((q) => {
      const tr = document.createElement('tr');
      const act = document.createElement('td');
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'inf danger small';
      del.textContent = 'Delete';
      del.addEventListener('click', async () => {
        if (!window.confirm('Delete this question from your library?')) return;
        try {
          await api(`/api/org/${orgId}/questions/${q.id}/delete`, { method: 'POST' });
          await loadOrgContent();
        } catch (err) {
          say($('privQMsg'), err.message, 'err');
        }
      });
      act.append(del);
      tr.append(
        cell(q.prompt, 'q'),
        cell(ROLE_LABEL[q.role] || q.role, 'meta'),
        cell(LEVEL_LABEL[q.level] || q.level, 'meta'),
        cell(String(q.follow_ups), 'meta'),
        act,
      );
      return tr;
    }),
  );
}

function fillGlobal(tbody, items, kind, labelCells) {
  if (!items.length) {
    emptyRow(tbody, 'Nothing here yet.', 4);
    return;
  }
  const orgId = getOrgId();
  tbody.replaceChildren(
    ...items.map((g) => {
      const tr = document.createElement('tr');
      if (g.hidden) tr.className = 'row-hidden';
      const act = document.createElement('td');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = g.hidden ? 'inf ghost small' : 'inf danger small';
      btn.textContent = g.hidden ? 'Show' : 'Hide';
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          await api(`/api/org/${orgId}/hidden`, {
            method: 'POST',
            body: JSON.stringify({ kind, content_id: g.id, hidden: !g.hidden }),
          });
          await loadOrgContent();
        } catch (err) {
          say($('gMsg'), err.message, 'err');
          btn.disabled = false;
        }
      });
      act.append(btn);
      tr.append(...labelCells(g), act);
      return tr;
    }),
  );
}

const roleLevelCells = (g, first) => [
  cell(first, 'q'),
  cell(ROLE_LABEL[g.role] || g.role, 'meta'),
  cell(LEVEL_LABEL[g.level] || g.level, 'meta'),
];

export async function loadOrgContent() {
  const orgId = getOrgId();
  if (!orgId) return;
  const out = await api(`/api/org/${orgId}/content`);
  fillPrivate(out.private?.questions || []);
  fillGlobal($('gQRows'), out.globals?.questions || [], 'question', (g) => roleLevelCells(g, g.topic));
  fillGlobal($('gSRows'), out.globals?.scenarios || [], 'scenario', (g) => roleLevelCells(g, g.title));
  fillGlobal($('gLRows'), out.globals?.labs || [], 'lab', (g) => roleLevelCells(g, g.title));
}

export function setupOrgContent(orgIdGetter) {
  getOrgId = orgIdGetter;
  resetFollowUps();
  $('qcAddFu').addEventListener('click', () => addFollowUp());

  $('qcForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const orgId = getOrgId();
    if (!orgId) return;
    $('qcSave').disabled = true;
    say($('qcMsg'), 'Saving.');
    const payload = {
      role: $('qcRole').value,
      level: $('qcLevel').value,
      topic: $('qcTopic').value.trim(),
      prompt: $('qcPrompt').value.trim(),
      model_answer: $('qcAnswer').value.trim(),
      follow_ups: readFollowUps().filter((f) => f.prompt || f.model_answer),
    };
    try {
      await api(`/api/org/${orgId}/questions`, { method: 'POST', body: JSON.stringify(payload) });
      $('qcTopic').value = '';
      $('qcPrompt').value = '';
      $('qcAnswer').value = '';
      resetFollowUps();
      say($('qcMsg'), 'Saved to your library.', 'ok');
      await loadOrgContent();
    } catch (err) {
      say($('qcMsg'), err.message, 'err');
    }
    $('qcSave').disabled = false;
  });
}
