import { $, api, say } from './common.js';
import { setupOrgContent, loadOrgContent } from './org-content.js';

// The company console, for an org_admin. Scoped to one company at a time; if you
// run more than one, a picker switches between them. Everything it touches is
// filtered to the chosen company server-side.

const ORG_ROLE_LABEL = { org_admin: 'Company admin', trainer: 'Trainer', learner: 'Learner' };

let adminOrgs = [];
let orgId = null;

function since(iso) {
  if (!iso) return '-';
  const days = Math.floor((Date.now() - new Date(iso.endsWith('Z') ? iso : iso + 'Z').getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function until(iso) {
  const days = Math.ceil((new Date(iso.endsWith('Z') ? iso : iso + 'Z').getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return 'soon';
  return `in ${days}d`;
}

function cell(text, cls) {
  const td = document.createElement('td');
  if (cls) td.className = cls;
  td.textContent = text;
  return td;
}

async function loadMembers() {
  const out = await api(`/api/org/${orgId}/members`);
  $('orgTitle').textContent = out.org?.name || 'Company';
  const rows = (out.members || []).map((m) => {
    const tr = document.createElement('tr');
    const act = document.createElement('td');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'inf danger small';
    btn.textContent = 'Remove';
    btn.addEventListener('click', async () => {
      if (!window.confirm(`Remove ${m.email} from the company?`)) return;
      try {
        await api(`/api/org/${orgId}/members/${m.user_id}/remove`, { method: 'POST' });
        await loadMembers();
      } catch (err) {
        say($('memberListMsg'), err.message, 'err');
      }
    });
    act.append(btn);
    tr.append(cell(m.email, 'q'), cell(ORG_ROLE_LABEL[m.role] || m.role, 'meta'), cell(since(m.created_at), 'meta'), act);
    return tr;
  });
  if (!rows.length) {
    const tr = document.createElement('tr');
    const td = cell('No members yet. Invite someone above.', 'none');
    td.colSpan = 4;
    tr.append(td);
    $('memberRows').replaceChildren(tr);
  } else {
    $('memberRows').replaceChildren(...rows);
  }
}

async function loadInvites() {
  const out = await api(`/api/org/${orgId}/invites`);
  const rows = (out.invites || []).map((inv) => {
    const tr = document.createElement('tr');
    const act = document.createElement('td');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'inf ghost small';
    btn.textContent = 'Revoke';
    btn.addEventListener('click', async () => {
      try {
        await api(`/api/org/${orgId}/invites/${inv.id}/revoke`, { method: 'POST' });
        await loadInvites();
      } catch (err) {
        say($('inviteListMsg'), err.message, 'err');
      }
    });
    act.append(btn);
    tr.append(cell(inv.email, 'q'), cell(ORG_ROLE_LABEL[inv.role] || inv.role, 'meta'), cell(until(inv.expires_at), 'meta'), act);
    return tr;
  });
  if (!rows.length) {
    const tr = document.createElement('tr');
    const td = cell('No invites waiting.', 'none');
    td.colSpan = 4;
    tr.append(td);
    $('inviteRows').replaceChildren(tr);
  } else {
    $('inviteRows').replaceChildren(...rows);
  }
}

function wire() {
  $('inviteForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('inviteEmail').value.trim();
    if (!email) return;
    $('inviteSend').disabled = true;
    say($('inviteMsg'), 'Creating.');
    try {
      const out = await api(`/api/org/${orgId}/invites`, {
        method: 'POST',
        body: JSON.stringify({ email, role: $('inviteRole').value }),
      });
      $('inviteEmail').value = '';
      $('inviteLink').textContent = out.link;
      $('inviteLinkWrap').hidden = false;
      say($('inviteMsg'), '');
      await loadInvites();
    } catch (err) {
      say($('inviteMsg'), err.message, 'err');
    }
    $('inviteSend').disabled = false;
  });

  $('copyLink').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('inviteLink').textContent);
      $('copyLink').textContent = 'Copied';
      setTimeout(() => ($('copyLink').textContent = 'Copy'), 1500);
    } catch (_) {
      /* clipboard can be blocked; the link is visible to select by hand */
    }
  });

  $('orgPick').addEventListener('change', async () => {
    orgId = $('orgPick').value;
    await Promise.all([loadMembers(), loadInvites(), loadOrgContent()]);
  });

  setupOrgContent(() => orgId);
}

(async () => {
  try {
    const me = await api('/api/me');
    $('whoEmail').textContent = me.user.email;
    adminOrgs = (me.user.orgs || []).filter((o) => o.role === 'org_admin');
    if (!adminOrgs.length) {
      $('denied').hidden = false;
      return;
    }
    orgId = adminOrgs[0].org_id;
    if (adminOrgs.length > 1) {
      const sel = $('orgPick');
      sel.hidden = false;
      sel.replaceChildren(
        ...adminOrgs.map((o) => {
          const opt = document.createElement('option');
          opt.value = o.org_id;
          opt.textContent = o.name;
          return opt;
        }),
      );
    }
    wire();
    await Promise.all([loadMembers(), loadInvites(), loadOrgContent()]);
    $('main').hidden = false;
  } catch (err) {
    if (err.status === 401) {
      window.location.href = '/app/';
      return;
    }
    $('denied').hidden = false;
  }
})();
