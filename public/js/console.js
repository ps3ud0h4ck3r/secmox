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
let canImpersonate = false;
let showActions = false;
let myId = null;
let myRole = null;

// A developer may view only plain users; the owner may view anyone but itself.
function canViewAs(u) {
  if (!canImpersonate || u.id === myId) return false;
  if (myRole === 'developer' && u.platform_role) return false;
  return true;
}

function actionCell(u) {
  const td = document.createElement('td');
  const wrap = document.createElement('div');
  wrap.className = 'actions';
  if (canEditRoles) wrap.append(roleSelect(u));
  if (canViewAs(u)) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'inf ghost small';
    btn.textContent = 'View as';
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await api(`/api/console/impersonate/${u.id}`, { method: 'POST', body: JSON.stringify({}) });
        window.location.href = '/app/';
      } catch (err) {
        btn.disabled = false;
        say($('userMsg'), err.message, 'err');
      }
    });
    wrap.append(btn);
  }
  td.append(wrap);
  return td;
}

// Owner-only: a dropdown that grants or revokes a platform role on the spot. A
// refused change (the last-owner guard) snaps back and says why.
function roleSelect(u) {
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
  return sel;
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
      if (showActions) tr.append(actionCell(u));
      return tr;
    });
    if (!rows.length) {
      const tr = document.createElement('tr');
      const td = cell(q ? 'No account matches that.' : 'No accounts yet.', 'none');
      td.colSpan = showActions ? 9 : 8;
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

function duration(startIso, endIso) {
  if (!endIso) return 'open now';
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${Math.round(ms / 3_600_000)}h`;
}

function stamp(iso) {
  if (!iso) return '';
  const d = new Date(iso.endsWith('Z') ? iso : iso + 'Z');
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

async function loadImpersonations() {
  try {
    const { impersonations } = await api('/api/console/impersonations');
    const rows = impersonations.map((r) => {
      const tr = document.createElement('tr');
      const open = !r.ended_at;
      tr.append(
        cell(r.actor_email, 'q'),
        cell(r.target_email, 'meta'),
        cell(r.reason || '-', 'meta'),
        cell(stamp(r.started_at), 'meta'),
        cell(duration(r.started_at, r.ended_at), open ? 'meta chain-zero' : 'meta'),
      );
      return tr;
    });
    if (!rows.length) {
      const tr = document.createElement('tr');
      const td = cell('No view-as sessions yet.', 'none');
      td.colSpan = 5;
      tr.append(td);
      $('impRows').replaceChildren(tr);
    } else {
      $('impRows').replaceChildren(...rows);
    }
  } catch (_) {
    /* the log is a record, never a blocker */
  }
}

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
    myId = me.user.id;
    myRole = role;
    canEditRoles = role === 'owner';
    canImpersonate = role === 'owner' || role === 'developer';
    showActions = canEditRoles || canImpersonate;
    if (showActions) $('actCol').hidden = false;
    if (role === 'business') {
      $('consoleSub').textContent = 'Usage across the platform, for selling and onboarding.';
    }
    $('impScope').textContent =
      role === 'owner' ? 'Every view-as on the platform.' : 'Your own view-as sessions.';
    await Promise.all([loadOverview(), loadUsers(), loadImpersonations()]);
    $('main').hidden = false;
  } catch (err) {
    if (err.status === 401) {
      window.location.href = '/app/';
      return;
    }
    $('denied').hidden = false;
  }
})();
