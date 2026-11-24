// Company post-mortem packs. Candidates log questions they were actually asked,
// by company and role; submissions are reviewed, then browsable by everyone.
// This is the content that compounds and cannot be copied.

import { $, api, say, ROLE_LABEL } from './common.js';

const ROLES = ['soc', 'pentest', 'network', 'cloud', 'grc'];
const roleName = (r) => ROLE_LABEL[r] || r;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function roleSelect(withAll) {
  const s = el('select', 'pack-select');
  if (withAll) {
    const o = el('option', null, 'All roles');
    o.value = '';
    s.append(o);
  }
  for (const r of ROLES) {
    const o = el('option', null, roleName(r));
    o.value = r;
    s.append(o);
  }
  return s;
}

function qCard(r, opts = {}) {
  const card = el('div', 'pack-q');
  const top = el('div', 'pack-q-top');
  top.append(el('span', 'pack-q-co', r.company));
  top.append(el('span', 'pack-q-role', roleName(r.role)));
  if (r.asked_on) top.append(el('span', 'pack-q-when', r.asked_on));
  if (opts.status) top.append(el('span', `pack-q-status s-${r.status}`, r.status));
  card.append(top);
  card.append(el('p', 'pack-q-text', r.question));
  if (opts.mod) {
    const act = el('div', 'pack-q-act');
    for (const [label, status] of [
      ['Approve', 'approved'],
      ['Hide', 'hidden'],
    ]) {
      const b = el('button', 'inf ghost small', label);
      b.type = 'button';
      b.addEventListener('click', async () => {
        b.disabled = true;
        try {
          await api(`/api/admin/reports/${r.id}`, { method: 'POST', body: JSON.stringify({ status }) });
          card.remove();
        } catch (err) {
          say($('packModMsg'), err.message, 'err');
          b.disabled = false;
        }
      });
      act.append(b);
    }
    card.append(act);
  }
  return card;
}

// --- Add a question ---

function renderSubmit(root) {
  const box = el('div', 'pack-card');
  box.append(el('h3', null, 'Add a question you were asked'));
  box.append(el('p', 'sub', 'What did a real interviewer ask? It goes into the shared pack after a quick review.'));
  const form = el('div', 'pack-form');
  const company = el('input', 'pack-input');
  company.placeholder = 'Company (e.g. TCS)';
  company.maxLength = 60;
  const role = roleSelect(false);
  const askedOn = el('input', 'pack-input');
  askedOn.placeholder = 'When (optional, e.g. Nov 2026)';
  askedOn.maxLength = 24;
  const q = el('textarea', 'pack-textarea');
  q.placeholder = 'The question, as close to word-for-word as you remember.';
  q.maxLength = 1000;
  const go = el('button', 'btn', 'Submit question');
  go.type = 'button';
  const msg = el('p', 'msg');
  msg.id = 'packSubmitMsg';
  go.addEventListener('click', async () => {
    go.disabled = true;
    try {
      await api('/api/reports', {
        method: 'POST',
        body: JSON.stringify({
          company: company.value.trim(),
          role: role.value,
          question: q.value.trim(),
          asked_on: askedOn.value.trim(),
        }),
      });
      company.value = '';
      q.value = '';
      askedOn.value = '';
      say(msg, 'Thanks. It will show in the pack once reviewed.', 'ok');
      renderMine(root);
    } catch (err) {
      say(msg, err.message, 'err');
    }
    go.disabled = false;
  });
  const row1 = el('div', 'pack-form-row');
  row1.append(company, role, askedOn);
  form.append(row1, q, go, msg);
  box.append(form);
  root.append(box);
}

// --- Browse the pack ---

async function renderBrowse(root) {
  const box = el('div', 'pack-card');
  box.id = 'packBrowse';
  box.append(el('h3', null, 'Browse the pack'));
  const filters = el('div', 'pack-form-row');
  const company = el('select', 'pack-select');
  company.id = 'packCompany';
  const anyCo = el('option', null, 'All companies');
  anyCo.value = '';
  company.append(anyCo);
  const role = roleSelect(true);
  role.id = 'packRole';
  filters.append(company, role);
  box.append(filters);
  const list = el('div', 'pack-list');
  list.id = 'packBrowseList';
  box.append(list);
  root.append(box);

  try {
    const { companies } = await api('/api/reports/companies');
    for (const co of companies) {
      const o = el('option', null, `${co.company} (${co.n})`);
      o.value = co.company;
      company.append(o);
    }
  } catch {
    /* companies list is optional */
  }
  const refresh = async () => {
    const params = new URLSearchParams();
    if (company.value) params.set('company', company.value);
    if (role.value) params.set('role', role.value);
    list.replaceChildren(el('p', 'sub', 'Loading.'));
    try {
      const { reports } = await api('/api/reports?' + params.toString());
      if (!reports.length) {
        list.replaceChildren(el('p', 'sub', 'No questions here yet. Be the first to add one.'));
        return;
      }
      list.replaceChildren(...reports.map((r) => qCard(r)));
    } catch (err) {
      list.replaceChildren(el('p', 'msg err', err.message));
    }
  };
  company.addEventListener('change', refresh);
  role.addEventListener('change', refresh);
  refresh();
}

// --- Your submissions ---

async function renderMine(root) {
  let box = $('packMine');
  if (!box) {
    box = el('div', 'pack-card');
    box.id = 'packMine';
    root.append(box);
  }
  box.replaceChildren(el('h3', null, 'Your submissions'));
  const list = el('div', 'pack-list');
  box.append(list);
  try {
    const { reports } = await api('/api/reports/mine');
    if (!reports.length) {
      list.append(el('p', 'sub', 'You have not added any questions yet.'));
      return;
    }
    list.replaceChildren(...reports.map((r) => qCard(r, { status: true })));
  } catch {
    list.append(el('p', 'sub', 'Could not load your submissions.'));
  }
}

// --- Admin moderation ---

async function renderModeration(root) {
  const box = el('div', 'pack-card pack-mod');
  box.append(el('h3', null, 'Review queue (admin)'));
  const msg = el('p', 'msg');
  msg.id = 'packModMsg';
  box.append(msg);
  const list = el('div', 'pack-list');
  box.append(list);
  root.append(box);
  try {
    const { reports } = await api('/api/admin/reports?status=pending');
    if (!reports.length) {
      list.append(el('p', 'sub', 'Nothing pending.'));
      return;
    }
    list.replaceChildren(...reports.map((r) => qCard({ ...r, status: 'pending' }, { mod: true })));
  } catch (err) {
    list.append(el('p', 'msg err', err.message));
  }
}

export async function loadPacks() {
  const root = $('packsBody');
  if (!root) return;
  root.replaceChildren();
  renderSubmit(root);
  renderBrowse(root);
  renderMine(root);
  try {
    const me = (await api('/api/me')).user;
    if (me?.is_admin) renderModeration(root);
  } catch {
    /* non-admin or offline: no moderation panel */
  }
}
