import { $, api, say } from './common.js';
import { setupOrgContent, loadOrgContent } from './org-content.js';
import { setupCohorts, loadCohorts } from './org-cohorts.js';

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

// undefined = no pending change, null = remove, string = a new data URL.
let pendingLogo;

function showLogo(logo) {
  const box = $('brandPreview');
  box.replaceChildren();
  if (logo) {
    const img = document.createElement('img');
    img.src = logo;
    img.alt = 'Company logo';
    box.append(img);
  } else {
    const span = document.createElement('span');
    span.className = 'brand-empty';
    span.textContent = 'No logo yet';
    box.append(span);
  }
}

async function loadBranding() {
  try {
    const { logo } = await api(`/api/org/${orgId}/branding`);
    showLogo(logo);
    pendingLogo = undefined;
    $('brandSave').disabled = true;
  } catch (_) {
    /* branding is optional; leave the empty state */
  }
}

function renderBulk(out) {
  const box = $('bulkResults');
  box.replaceChildren();
  box.hidden = false;

  const summary = document.createElement('p');
  summary.className = 'bulk-summary';
  const parts = [`${out.created.length} invited`];
  if (out.emailed) parts.push(`${out.emailed} emailed`);
  if (out.skipped.length) parts.push(`${out.skipped.length} already in`);
  if (out.invalid.length) parts.push(`${out.invalid.length} invalid`);
  summary.textContent = parts.join(' · ');
  box.append(summary);

  if (out.created.length) {
    const hint = document.createElement('p');
    hint.className = 'sub';
    hint.textContent = out.emailed
      ? 'Invites were emailed. The links below are a backup you can share directly.'
      : 'Email is not set up yet, so share these links directly.';
    box.append(hint);
  }

  if (out.created.length) {
    const copyAll = document.createElement('button');
    copyAll.type = 'button';
    copyAll.className = 'inf ghost small';
    copyAll.textContent = 'Copy all links';
    copyAll.addEventListener('click', () => {
      navigator.clipboard?.writeText(out.created.map((x) => `${x.email}\t${x.link}`).join('\n')).catch(() => {});
    });
    box.append(copyAll);

    const list = document.createElement('div');
    list.className = 'bulk-links';
    for (const x of out.created) {
      const row = document.createElement('div');
      row.className = 'bulk-link-row';
      const em = document.createElement('span');
      em.className = 'bulk-link-email';
      em.textContent = x.email;
      const link = document.createElement('code');
      link.textContent = x.link;
      row.append(em, link);
      list.append(row);
    }
    box.append(list);
  }

  if (out.skipped.length || out.invalid.length) {
    const note = document.createElement('p');
    note.className = 'sub bulk-skip';
    const bits = [];
    if (out.skipped.length) bits.push(`Already in: ${out.skipped.join(', ')}`);
    if (out.invalid.length) bits.push(`Invalid: ${out.invalid.join(', ')}`);
    note.textContent = bits.join('.  ');
    box.append(note);
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
      say($('inviteMsg'), out.emailed ? `Invite emailed to ${out.email}.` : '', out.emailed ? 'ok' : '');
      await loadInvites();
    } catch (err) {
      say($('inviteMsg'), err.message, 'err');
    }
    $('inviteSend').disabled = false;
  });

  $('bulkForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const emails = $('bulkEmails').value.trim();
    if (!emails) return say($('bulkMsg'), 'Paste at least one email.', 'err');
    $('bulkSend').disabled = true;
    say($('bulkMsg'), 'Inviting.');
    try {
      const out = await api(`/api/org/${orgId}/invites/bulk`, {
        method: 'POST',
        body: JSON.stringify({ emails, role: $('bulkRole').value }),
      });
      renderBulk(out);
      $('bulkEmails').value = '';
      say($('bulkMsg'), '');
      await loadInvites();
    } catch (err) {
      say($('bulkMsg'), err.message, 'err');
    }
    $('bulkSend').disabled = false;
  });

  $('brandFile').addEventListener('change', () => {
    const file = $('brandFile').files?.[0];
    if (!file) return;
    if (file.size > 90 * 1024) {
      say($('brandMsg'), 'That image is over 90 KB. Pick a smaller one.', 'err');
      $('brandFile').value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      pendingLogo = reader.result;
      showLogo(pendingLogo);
      $('brandSave').disabled = false;
      say($('brandMsg'), 'Ready to save.', 'ok');
    };
    reader.readAsDataURL(file);
  });

  $('brandSave').addEventListener('click', async () => {
    if (pendingLogo === undefined) return;
    $('brandSave').disabled = true;
    try {
      await api(`/api/org/${orgId}/branding`, { method: 'POST', body: JSON.stringify({ logo: pendingLogo }) });
      pendingLogo = undefined;
      say($('brandMsg'), 'Saved. Your learners will see it.', 'ok');
    } catch (err) {
      say($('brandMsg'), err.message, 'err');
      $('brandSave').disabled = false;
    }
  });

  $('brandRemove').addEventListener('click', async () => {
    try {
      await api(`/api/org/${orgId}/branding`, { method: 'POST', body: JSON.stringify({ logo: null }) });
      showLogo(null);
      $('brandFile').value = '';
      pendingLogo = undefined;
      $('brandSave').disabled = true;
      say($('brandMsg'), 'Removed.', 'ok');
    } catch (err) {
      say($('brandMsg'), err.message, 'err');
    }
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
    await Promise.all([loadMembers(), loadInvites(), loadCohorts(), loadBranding(), loadOrgContent()]);
  });

  setupOrgContent(() => orgId);
  setupCohorts(() => orgId);
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
    await Promise.all([loadMembers(), loadInvites(), loadCohorts(), loadBranding(), loadOrgContent()]);
    $('main').hidden = false;
  } catch (err) {
    if (err.status === 401) {
      window.location.href = '/app/';
      return;
    }
    $('denied').hidden = false;
  }
})();
