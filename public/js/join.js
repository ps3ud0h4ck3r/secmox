import { $, api, say } from './common.js';

// The invitee's landing page. It shows who invited them and as what, then either
// accepts (if they are signed in as the invited email) or points them to sign in
// as that email first. The token lives only in the URL and the accept call.

const ORG_ROLE_LABEL = { org_admin: 'a company admin', trainer: 'a trainer', learner: 'a learner' };

const token = new URLSearchParams(window.location.search).get('token') || '';

function button(label, cls, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `inf ${cls}`;
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

function link(label, href) {
  const a = document.createElement('a');
  a.className = 'inf ghost';
  a.href = href;
  a.textContent = label;
  return a;
}

(async () => {
  if (!token) {
    $('joinTitle').textContent = 'This link is incomplete';
    $('joinBody').textContent = 'The invite link is missing its code. Ask whoever invited you to send it again.';
    return;
  }

  let preview;
  try {
    preview = (await api(`/api/invites/preview?token=${encodeURIComponent(token)}`)).invite;
  } catch (err) {
    $('joinTitle').textContent = 'This invite cannot be used';
    $('joinBody').textContent = err.message;
    return;
  }

  $('joinTitle').textContent = `Join ${preview.org_name}`;
  $('joinBody').textContent = `You have been invited to ${preview.org_name} as ${ORG_ROLE_LABEL[preview.role] || preview.role}, for ${preview.email}.`;

  // Are they signed in, and as whom?
  let me = null;
  try {
    me = (await api('/api/me')).user;
  } catch (_) {
    me = null;
  }

  const actions = $('joinActions');
  actions.hidden = false;

  if (me && me.email.toLowerCase() === preview.email.toLowerCase()) {
    actions.append(
      button('Accept and join', 'go', async () => {
        say($('joinMsg'), 'Joining.');
        try {
          await api('/api/invites/accept', { method: 'POST', body: JSON.stringify({ token }) });
          window.location.href = '/app/';
        } catch (err) {
          say($('joinMsg'), err.message, 'err');
        }
      }),
    );
  } else if (me) {
    $('joinBody').textContent = `This invite is for ${preview.email}, but you are signed in as ${me.email}.`;
    actions.append(link('Go to practice', '/app/'));
    say($('joinMsg'), `Sign out and sign back in as ${preview.email} to accept.`);
  } else {
    actions.append(link(`Sign in as ${preview.email}`, `/app/?invite=${encodeURIComponent(token)}`));
    say($('joinMsg'), 'Create an account or sign in with that email, then open this link again.');
  }
})();
