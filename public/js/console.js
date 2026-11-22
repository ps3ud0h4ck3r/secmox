// The platform console: god mode. Owner (and, for a subset, developer/business)
// create tenants and accounts, hand out roles, and view the portal as anyone.
// The APIs enforce who may do what; this page just drives them.

import { $, api, say } from './common.js';

let me = null;
let orgs = [];

/* ----------------------------------------------------------- tabs */

function showPane(name) {
  for (const btn of document.querySelectorAll('.con-tab')) {
    btn.setAttribute('aria-selected', String(btn.dataset.pane === name));
  }
  for (const pane of document.querySelectorAll('.con-pane')) {
    pane.hidden = pane.id !== `pane-${name}`;
  }
  if (name === 'overview') loadOverview();
  if (name === 'tenants') loadTenants();
  if (name === 'users') loadUsers();
  if (name === 'log') loadLog();
}

document.querySelector('.con-tabs')?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-pane]');
  if (btn) showPane(btn.dataset.pane);
});

/* ------------------------------------------------------- overview */

const STAT_FIELDS = [
  ['users', 'Accounts'],
  ['plain', 'Plain users'],
  ['owners', 'Owners'],
  ['developers', 'Developers'],
  ['business', 'Business'],
  ['attempts', 'Question attempts'],
  ['scenario_attempts', 'Scenario attempts'],
  ['lab_attempts', 'Lab attempts'],
  ['questions', 'Questions'],
  ['labs', 'Labs'],
  ['scenarios', 'Scenarios'],
];

async function loadOverview() {
  const box = $('conStats');
  box.textContent = 'Loading.';
  try {
    const { overview } = await api('/api/console/overview');
    box.replaceChildren(
      ...STAT_FIELDS.map(([key, label]) => {
        const tile = document.createElement('div');
        tile.className = 'con-stat';
        const n = document.createElement('span');
        n.className = 'con-stat-n';
        n.textContent = String(overview?.[key] ?? 0);
        const l = document.createElement('span');
        l.className = 'con-stat-l';
        l.textContent = label;
        tile.append(n, l);
        return tile;
      }),
    );
  } catch (err) {
    box.textContent = err.message;
  }
}

/* -------------------------------------------------------- tenants */

async function loadTenants() {
  const list = $('orgList');
  list.textContent = 'Loading.';
  try {
    const res = await api('/api/console/orgs');
    orgs = res.orgs || [];
    fillOrgSelect();
    if (!orgs.length) {
      list.textContent = 'No tenants yet. Create one above.';
      return;
    }
    list.replaceChildren(...orgs.map(orgCard));
  } catch (err) {
    list.textContent = err.message;
  }
}

function fillOrgSelect() {
  const sel = $('newOrg');
  const current = sel.value;
  sel.replaceChildren();
  const none = document.createElement('option');
  none.value = '';
  none.textContent = 'No tenant';
  sel.append(none);
  for (const o of orgs) {
    const opt = document.createElement('option');
    opt.value = o.id;
    opt.textContent = o.name + (o.is_sandbox ? ' (sandbox)' : '');
    sel.append(opt);
  }
  sel.value = current;
}

function orgCard(o) {
  const card = document.createElement('div');
  card.className = 'con-card';

  const head = document.createElement('div');
  head.className = 'con-card-head';
  const title = document.createElement('h3');
  title.textContent = o.name;
  const tags = document.createElement('span');
  tags.className = 'con-card-tags';
  tags.textContent = `${o.members} member${o.members === 1 ? '' : 's'}` + (o.is_sandbox ? ' · sandbox' : '');
  head.append(title, tags);

  const roster = document.createElement('div');
  roster.className = 'con-roster';
  roster.hidden = true;

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'inf ghost small';
  toggle.textContent = 'Show people';
  toggle.addEventListener('click', async () => {
    if (!roster.hidden) {
      roster.hidden = true;
      toggle.textContent = 'Show people';
      return;
    }
    roster.hidden = false;
    toggle.textContent = 'Hide people';
    await loadRoster(o.id, roster);
  });

  head.append(toggle);
  card.append(head, roster);
  return card;
}

async function loadRoster(orgId, into) {
  into.textContent = 'Loading.';
  try {
    const { members } = await api(`/api/console/orgs/${orgId}/members`);
    if (!members.length) {
      into.textContent = 'Nobody here yet. Add someone from the Users tab, or create an account attached to this tenant.';
      return;
    }
    into.replaceChildren(
      ...members.map((m) => {
        const row = document.createElement('div');
        row.className = 'con-person';
        const who = document.createElement('div');
        who.className = 'con-person-who';
        const email = document.createElement('span');
        email.className = 'con-person-email';
        email.textContent = m.email;
        const role = document.createElement('span');
        role.className = 'con-role-pill r-' + m.role;
        role.textContent = m.role.replace('_', ' ');
        who.append(email, role);
        const view = document.createElement('button');
        view.type = 'button';
        view.className = 'inf ghost small';
        view.textContent = 'View as';
        view.addEventListener('click', () => viewAs(m.id, m.email));
        row.append(who, view);
        return row;
      }),
    );
  } catch (err) {
    into.textContent = err.message;
  }
}

$('orgForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('orgName').value.trim();
  if (name.length < 2) return say($('orgMsg'), 'Give the tenant a name.', 'err');
  $('orgCreate').disabled = true;
  try {
    await api('/api/console/orgs', {
      method: 'POST',
      body: JSON.stringify({ name, is_sandbox: $('orgSandbox').checked }),
    });
    $('orgName').value = '';
    $('orgSandbox').checked = false;
    say($('orgMsg'), `Created ${name}.`, 'ok');
    await loadTenants();
  } catch (err) {
    say($('orgMsg'), err.message, 'err');
  }
  $('orgCreate').disabled = false;
});

/* ---------------------------------------------------------- users */

let userSearchTimer = null;

async function loadUsers() {
  const list = $('userList');
  const q = $('userSearch').value.trim();
  list.textContent = 'Loading.';
  try {
    const { users, capped } = await api('/api/console/users' + (q ? '?q=' + encodeURIComponent(q) : ''));
    if (!users.length) {
      list.textContent = 'No accounts match.';
      return;
    }
    list.replaceChildren(...users.map(userRow));
    say($('userMsg'), capped ? 'Showing the first 200. Narrow with search.' : '');
  } catch (err) {
    list.textContent = err.message;
  }
}

function userRow(u) {
  const row = document.createElement('div');
  row.className = 'con-person';

  const who = document.createElement('div');
  who.className = 'con-person-who';
  const email = document.createElement('span');
  email.className = 'con-person-email';
  email.textContent = u.email;
  const stat = document.createElement('span');
  stat.className = 'con-person-stat';
  stat.textContent = `${u.attempts} attempts${u.platform_role ? ' · ' + u.platform_role : ''}`;
  who.append(email, stat);

  const actions = document.createElement('div');
  actions.className = 'con-person-actions';

  const roleSel = document.createElement('select');
  roleSel.className = 'con-role-select';
  roleSel.setAttribute('aria-label', `Platform role for ${u.email}`);
  for (const [val, label] of [['', 'Plain user'], ['developer', 'Developer'], ['business', 'Business'], ['owner', 'Owner']]) {
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = label;
    if ((u.platform_role || '') === val) opt.selected = true;
    roleSel.append(opt);
  }
  roleSel.addEventListener('change', async () => {
    roleSel.disabled = true;
    try {
      await api(`/api/console/users/${u.id}/role`, {
        method: 'POST',
        body: JSON.stringify({ platform_role: roleSel.value || null }),
      });
      u.platform_role = roleSel.value || null;
      stat.textContent = `${u.attempts} attempts${u.platform_role ? ' · ' + u.platform_role : ''}`;
    } catch (err) {
      say($('userMsg'), err.message, 'err');
      roleSel.value = u.platform_role || '';
    }
    roleSel.disabled = false;
  });

  const view = document.createElement('button');
  view.type = 'button';
  view.className = 'inf ghost small';
  view.textContent = 'View as';
  view.addEventListener('click', () => viewAs(u.id, u.email));

  actions.append(roleSel, view);
  row.append(who, actions);
  return row;
}

$('userSearch').addEventListener('input', () => {
  clearTimeout(userSearchTimer);
  userSearchTimer = setTimeout(loadUsers, 250);
});

$('userForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('newEmail').value.trim();
  const password = $('newPass').value;
  if (!email || password.length < 10) return say($('userFormMsg'), 'Email and a password of at least 10 characters.', 'err');
  $('userCreate').disabled = true;
  try {
    const payload = { email, password };
    if ($('newPlatform').value) payload.platform_role = $('newPlatform').value;
    if ($('newOrg').value) { payload.org_id = $('newOrg').value; payload.org_role = $('newOrgRole').value; }
    const out = await api('/api/console/users', { method: 'POST', body: JSON.stringify(payload) });
    $('newEmail').value = '';
    $('newPass').value = '';
    const where = out.attached ? ` and added to the tenant as ${out.attached.role.replace('_', ' ')}` : '';
    say($('userFormMsg'), `Created ${email}${where}.`, 'ok');
    await loadUsers();
    if (out.attached) await loadTenants();
  } catch (err) {
    say($('userFormMsg'), err.message, 'err');
  }
  $('userCreate').disabled = false;
});

/* ------------------------------------------------------- view-as */

async function viewAs(id, email) {
  try {
    await api(`/api/console/impersonate/${id}`, {
      method: 'POST',
      body: JSON.stringify({ reason: 'console view-as' }),
    });
    // Land in the practice app as them. The banner there is only on your own
    // screen; they are told nothing.
    window.location.href = '/app/';
  } catch (err) {
    say($('userMsg'), `Could not view as ${email}: ${err.message}`, 'err');
  }
}

/* ----------------------------------------------------------- log */

async function loadLog() {
  const list = $('logList');
  list.textContent = 'Loading.';
  try {
    const { impersonations } = await api('/api/console/impersonations');
    if (!impersonations.length) {
      list.textContent = 'No view-as sessions yet.';
      return;
    }
    list.replaceChildren(
      ...impersonations.map((im) => {
        const row = document.createElement('div');
        row.className = 'con-log-row';
        const who = document.createElement('span');
        who.className = 'con-log-who';
        who.textContent = `${im.actor_email} → ${im.target_email}`;
        const when = document.createElement('span');
        when.className = 'con-log-when';
        const started = new Date(im.started_at).toLocaleString();
        when.textContent = im.ended_at ? `${started} · ended` : `${started} · open`;
        row.append(who, when);
        return row;
      }),
    );
  } catch (err) {
    list.textContent = err.message;
  }
}

/* ----------------------------------------------------------- boot */

(async () => {
  try {
    me = (await api('/api/me')).user;
    $('whoEmail').textContent = me.email;
    if (!['owner', 'developer', 'business'].includes(me.platform_role)) {
      $('denied').hidden = false;
      return;
    }
    $('main').hidden = false;
    showPane('overview');
  } catch (err) {
    if (err.status === 401) { window.location.href = '/app/'; return; }
    $('denied').hidden = false;
  }
})();
