// Cohorts: a company groups its learners into batches and watches each batch's
// readiness. Lives in the company console beside people and content.

import { $, api, say } from './common.js';

let getOrgId = () => null;
const orgId = () => getOrgId();

const ROLE_LABEL = { soc: 'SOC', pentest: 'Pentest', network: 'Network', cloud: 'Cloud', grc: 'GRC' };

function since(iso) {
  if (!iso) return 'never';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export function setupCohorts(fn) {
  getOrgId = fn;
  $('cohortForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('cohortName').value.trim();
    if (name.length < 2) return say($('cohortMsg'), 'Give the cohort a name.', 'err');
    $('cohortCreate').disabled = true;
    try {
      await api(`/api/org/${orgId()}/cohorts`, { method: 'POST', body: JSON.stringify({ name }) });
      $('cohortName').value = '';
      say($('cohortMsg'), `Created ${name}.`, 'ok');
      await loadCohorts();
    } catch (err) {
      say($('cohortMsg'), err.message, 'err');
    }
    $('cohortCreate').disabled = false;
  });
}

export async function loadCohorts() {
  const list = $('cohortList');
  list.textContent = 'Loading.';
  try {
    const { cohorts } = await api(`/api/org/${orgId()}/cohorts`);
    if (!cohorts.length) {
      list.textContent = 'No cohorts yet. Create one above.';
      return;
    }
    list.replaceChildren(...cohorts.map(cohortCard));
  } catch (err) {
    list.textContent = err.message;
  }
}

function cohortCard(ch) {
  const card = document.createElement('div');
  card.className = 'cohort-card';

  const head = document.createElement('div');
  head.className = 'cohort-head';
  const title = document.createElement('h3');
  title.textContent = ch.name;
  const count = document.createElement('span');
  count.className = 'cohort-count';
  count.textContent = `${ch.members} learner${ch.members === 1 ? '' : 's'}`;

  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'inf ghost small';
  open.textContent = 'Open';

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'inf ghost small';
  del.textContent = 'Delete';

  const body = document.createElement('div');
  body.className = 'cohort-body';
  body.hidden = true;

  open.addEventListener('click', async () => {
    if (!body.hidden) {
      body.hidden = true;
      open.textContent = 'Open';
      return;
    }
    body.hidden = false;
    open.textContent = 'Close';
    await loadRoster(ch.id, body);
  });
  del.addEventListener('click', async () => {
    if (!confirm(`Delete cohort "${ch.name}"? The learners stay in your company; only the grouping goes.`)) return;
    try {
      await api(`/api/org/${orgId()}/cohorts/${ch.id}/delete`, { method: 'POST' });
      await loadCohorts();
    } catch (err) {
      say($('cohortMsg'), err.message, 'err');
    }
  });

  head.append(title, count, open, del);
  card.append(head, body);
  return card;
}

function pct(el, n, good) {
  el.textContent = `${n}%`;
  el.classList.add('cohort-pct');
  if (n >= good) el.classList.add('hi');
  else if (n >= good / 2) el.classList.add('mid');
  else el.classList.add('lo');
}

async function loadRoster(cid, into) {
  into.textContent = 'Loading.';
  try {
    const { total, members } = await api(`/api/org/${orgId()}/cohorts/${cid}`);
    into.replaceChildren();

    // Add a learner by email.
    const add = document.createElement('form');
    add.className = 'cohort-add';
    const input = document.createElement('input');
    input.type = 'email';
    input.placeholder = 'learner@email in your company';
    input.setAttribute('aria-label', 'Learner email');
    const btn = document.createElement('button');
    btn.type = 'submit';
    btn.className = 'inf ghost small';
    btn.textContent = 'Add to cohort';
    const msg = document.createElement('p');
    msg.className = 'msg';
    add.append(input, btn);
    add.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = input.value.trim();
      if (!email) return;
      btn.disabled = true;
      try {
        await api(`/api/org/${orgId()}/cohorts/${cid}/members`, { method: 'POST', body: JSON.stringify({ email }) });
        input.value = '';
        await loadRoster(cid, into);
      } catch (err) {
        say(msg, err.message, 'err');
      }
      btn.disabled = false;
    });
    into.append(add, msg);

    if (!members.length) {
      const empty = document.createElement('p');
      empty.className = 'sub';
      empty.textContent = 'No learners in this cohort yet. Add someone from your company above.';
      into.append(empty);
      return;
    }

    const note = document.createElement('p');
    note.className = 'cohort-note';
    note.textContent = `Coverage is of the ${total} questions your learners can see. Readiness is how much they hold on what they have faced.`;
    into.append(note);

    const table = document.createElement('table');
    table.className = 'cohort-table';
    const thead = document.createElement('thead');
    thead.innerHTML =
      '<tr><th>Learner</th><th>Target</th><th>Attempts</th><th>Coverage</th><th>Readiness</th><th>Last active</th><th></th></tr>';
    const tbody = document.createElement('tbody');
    for (const m of members) {
      const tr = document.createElement('tr');

      const who = document.createElement('td');
      who.textContent = m.email;

      const tgt = document.createElement('td');
      tgt.className = 'meta';
      tgt.textContent = m.target_role ? (ROLE_LABEL[m.target_role] ?? m.target_role) : '—';

      const att = document.createElement('td');
      att.className = 'meta';
      att.textContent = String(m.attempts);

      const cov = document.createElement('td');
      pct(cov, m.coverage, 60);

      const rdy = document.createElement('td');
      pct(rdy, m.readiness, 70);

      const last = document.createElement('td');
      last.className = 'meta';
      last.textContent = since(m.last_active);

      const act = document.createElement('td');
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'linkish';
      rm.textContent = 'remove';
      rm.addEventListener('click', async () => {
        try {
          await api(`/api/org/${orgId()}/cohorts/${cid}/members/${m.id}/remove`, { method: 'POST' });
          await loadRoster(cid, into);
        } catch (err) {
          say(msg, err.message, 'err');
        }
      });
      act.append(rm);

      tr.append(who, tgt, att, cov, rdy, last, act);
      tbody.append(tr);
    }
    table.append(thead, tbody);

    const scroll = document.createElement('div');
    scroll.className = 'table-scroll';
    scroll.append(table);
    into.append(scroll);
  } catch (err) {
    into.textContent = err.message;
  }
}
