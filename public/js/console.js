import { $, api, say, ROLE_LABEL } from './common.js';

// The platform console. Step one: see everything. Role management and
// impersonation land on top of this in their own passes.

const ROLE_BADGE = {
  owner: 'owner',
  developer: 'developer',
  business: 'business',
};

function since(iso) {
  if (!iso) return 'never';
  const days = Math.floor((Date.now() - new Date(iso.endsWith('Z') ? iso : iso + 'Z').getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function tile(k, v) {
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
}

async function loadOverview() {
  const { overview: o } = await api('/api/console/overview');
  const tiles = [
    ['Accounts', o.users],
    ['Platform', `${o.owners + o.developers + o.business}`],
    ['Questions', o.attempts],
    ['Scenarios', o.scenario_attempts],
    ['Labs', o.lab_attempts],
    ['Content', o.questions + o.labs + o.scenarios],
  ].map(([k, v]) => tile(k, String(v)));
  $('overview').replaceChildren(...tiles);
}

function cell(text, cls) {
  const td = document.createElement('td');
  if (cls) td.className = cls;
  td.textContent = text;
  return td;
}

function roleCell(role) {
  const td = document.createElement('td');
  if (role) {
    const b = document.createElement('span');
    b.className = `pill-tag plat-${role}`;
    b.textContent = ROLE_BADGE[role] || role;
    td.append(b);
  } else {
    td.className = 'meta';
    td.textContent = 'user';
  }
  return td;
}

let searchTimer = null;
let canEditRoles = false;

// Owner-only: a dropdown that grants or revokes a platform role on the spot. A
// refused change (the last-owner guard) snaps back and says why.
function roleEditCell(u) {
  const td = document.createElement('td');
  const sel = document.createElement('select');
  sel.className = 'role-set';
  for (const [value, label] of [['', 'User'], ['business', 'Business'], ['developer', 'Developer'], ['owner', 'Owner']]) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    if ((u.platform_role || '') === value) opt.selected = true;
    sel.append(opt);
  }
  const was = u.platform_role || '';
  sel.addEventListener('change', async () => {
    sel.disabled = true;
    try {
      await api(`/api/console/users/${u.id}/role`, {
        method: 'POST',
        body: JSON.stringify({ platform_role: sel.value }),
      });
      u.platform_role = sel.value || null;
      say($('userMsg'), `${u.email} is now ${sel.value || 'a plain user'}.`, 'ok');
      await Promise.all([loadOverview(), loadUsers()]);
    } catch (err) {
      sel.value = was;
      say($('userMsg'), err.message, 'err');
    }
    sel.disabled = false;
  });
  td.append(sel);
  return td;
}

async function loadUsers() {
  const q = $('userSearch').value.trim();
  try {
    const out = await api('/api/console/users' + (q ? `?q=${encodeURIComponent(q)}` : ''));
    const rows = out.users.map((u) => {
      const tr = document.createElement('tr');
      tr.append(
        cell(u.email, 'q'),
        roleCell(u.platform_role),
        cell(u.track, 'meta'),
        cell(String(u.attempts), 'meta'),
        cell(String(u.scenarios), 'meta'),
        cell(String(u.labs), 'meta'),
        cell(since(u.last_seen), 'meta'),
        cell(since(u.created_at), 'meta'),
      );
      if (canEditRoles) tr.append(roleEditCell(u));
      return tr;
    });
    if (!rows.length) {
      const tr = document.createElement('tr');
      const td = cell(q ? 'No account matches that.' : 'No accounts yet.', 'none');
      td.colSpan = canEditRoles ? 9 : 8;
      tr.append(td);
      $('userRows').replaceChildren(tr);
    } else {
      $('userRows').replaceChildren(...rows);
    }
    say($('userMsg'), out.capped ? 'Showing the first 200. Narrow with search.' : '');
  } catch (err) {
    say($('userMsg'), err.message, 'err');
  }
}

$('userSearch').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadUsers, 250);
});

(async () => {
  try {
    const me = await api('/api/me');
    const role = me.user.platform_role;
    if (!['owner', 'developer', 'business'].includes(role)) {
      $('denied').hidden = false;
      return;
    }
    $('whoEmail').textContent = me.user.email;
    $('whoRole').textContent = role;
    $('toAdmin').hidden = !me.user.is_admin;
    canEditRoles = role === 'owner';
    if (canEditRoles) $('actCol').hidden = false;
    if (role === 'business') {
      $('consoleSub').textContent = 'Usage across the platform, for selling and onboarding.';
    }
    await Promise.all([loadOverview(), loadUsers()]);
    $('main').hidden = false;
  } catch (err) {
    if (err.status === 401) {
      window.location.href = '/app/';
      return;
    }
    $('denied').hidden = false;
  }
})();
