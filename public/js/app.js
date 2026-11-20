import { $, api, say, wirePasswordToggles, ROLE_LABEL } from './common.js';
import { loadLabs, openLab, setLabHandlers } from './labs.js';

const state = { user: null, question: null, followUps: [], shown: 0, revealed: false, mode: 'in' };
let resetToken = null;

wirePasswordToggles();

/* ------------------------------------------------------------- views */

const VIEWS = ['authView', 'forgotView', 'resetView', 'practiceView', 'labsView', 'labView', 'accountView'];
const SIGNED_OUT = new Set(['authView', 'forgotView', 'resetView']);

function show(view) {
  for (const v of VIEWS) {
    const el = $(v);
    const active = v === view;
    // Re-adding the class restarts the entrance, so switching views never jumps.
    if (active && el.hidden) {
      el.classList.remove('view');
      void el.offsetWidth;
      el.classList.add('view');
    }
    el.hidden = !active;
  }
  const chromeOn = Boolean(state.user) && !SIGNED_OUT.has(view);
  $('headActions').hidden = !chromeOn;
  $('tabsNav').hidden = !chromeOn;
  const marked = view === 'labView' ? 'labsView' : view;
  for (const tab of $('tabsNav').querySelectorAll('[data-view]')) {
    if (tab.dataset.view === marked) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
  window.scrollTo(0, 0);
}

$('tabsNav').addEventListener('click', (e) => {
  const tab = e.target.closest('[data-view]');
  if (!tab) return;
  if (tab.dataset.view === 'accountView') openAccount();
  else if (tab.dataset.view === 'labsView') {
    show('labsView');
    loadLabs();
  } else show('practiceView');
});

setLabHandlers({
  needsAuth,
  openLab: async (id) => {
    if (await openLab(id)) show('labView');
  },
});

$('backToLabs').addEventListener('click', () => {
  show('labsView');
  loadLabs();
});

function needsAuth() {
  state.user = null;
  setMode('in');
  show('authView');
}

/* -------------------------------------------------------------- auth */

function setMode(mode) {
  state.mode = mode;
  const up = mode === 'up';
  $('tabIn').setAttribute('aria-selected', String(!up));
  $('tabUp').setAttribute('aria-selected', String(up));
  $('trackField').hidden = !up;
  $('authGo').textContent = up ? 'Create account' : 'Sign in';
  $('authMode').textContent = up ? 'create account' : 'sign in';
  $('toForgot').hidden = up;
  $('password').setAttribute('autocomplete', up ? 'new-password' : 'current-password');
  say($('authMsg'), '');
}

$('tabIn').addEventListener('click', () => setMode('in'));
$('tabUp').addEventListener('click', () => setMode('up'));
$('toForgot').addEventListener('click', () => {
  say($('forgotMsg'), '');
  show('forgotView');
});
$('backToAuth').addEventListener('click', () => show('authView'));

$('authForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const up = state.mode === 'up';
  const payload = {
    email: $('email').value.trim(),
    password: $('password').value,
    ...(up ? { track: $('track').value } : {}),
  };

  $('authGo').disabled = true;
  say($('authMsg'), up ? 'Creating your account.' : 'Signing in.');
  try {
    const out = await api(up ? '/api/auth/signup' : '/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    $('password').value = '';
    state.user = out.user;
    enterApp();
  } catch (err) {
    say($('authMsg'), err.message, 'err');
  }
  $('authGo').disabled = false;
});

$('forgotForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('forgotGo').disabled = true;
  say($('forgotMsg'), 'Sending.');
  try {
    const out = await api('/api/auth/forgot', {
      method: 'POST',
      body: JSON.stringify({ email: $('forgotEmail').value.trim() }),
    });
    say($('forgotMsg'), out.message, 'ok');
  } catch (err) {
    say($('forgotMsg'), err.message, 'err');
  }
  $('forgotGo').disabled = false;
});

$('resetForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('resetGo').disabled = true;
  say($('resetMsg'), 'Saving.');
  try {
    await api('/api/auth/reset', {
      method: 'POST',
      body: JSON.stringify({ token: resetToken, password: $('resetPw').value }),
    });
    $('resetPw').value = '';
    const me = await api('/api/me');
    state.user = me.user;
    enterApp();
  } catch (err) {
    say($('resetMsg'), err.message, 'err');
  }
  $('resetGo').disabled = false;
});

$('signOut').addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
  needsAuth();
});

/* ----------------------------------------------------------- account */

function openAccount() {
  $('accountWho').textContent = `Signed in as ${state.user.email}.`;
  for (const id of ['pwMsg', 'sessMsg', 'delMsg']) say($(id), '');
  show('accountView');
}

$('pwForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('pwGo').disabled = true;
  say($('pwMsg'), 'Changing.');
  try {
    await api('/api/auth/password', {
      method: 'POST',
      body: JSON.stringify({ current: $('pwCurrent').value, next: $('pwNext').value }),
    });
    $('pwCurrent').value = '';
    $('pwNext').value = '';
    say($('pwMsg'), 'Changed. Other devices have been signed out.', 'ok');
  } catch (err) {
    say($('pwMsg'), err.message, 'err');
  }
  $('pwGo').disabled = false;
});

$('logoutAll').addEventListener('click', async () => {
  say($('sessMsg'), 'Ending every session.');
  try {
    await api('/api/auth/logout-all', { method: 'POST' });
    needsAuth();
  } catch (err) {
    say($('sessMsg'), err.message, 'err');
  }
});

$('delForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!window.confirm('Delete the account and every attempt with it? This cannot be undone.')) return;
  $('delGo').disabled = true;
  say($('delMsg'), 'Deleting.');
  try {
    await api('/api/account/delete', {
      method: 'POST',
      body: JSON.stringify({ password: $('delPw').value }),
    });
    window.location.href = '/';
  } catch (err) {
    say($('delMsg'), err.message, 'err');
    $('delGo').disabled = false;
  }
});

/* ---------------------------------------------------------- practice */

function enterApp() {
  $('whoEmail').textContent = state.user.email;
  $('tabAdmin').hidden = !state.user.is_admin;
  if (state.user.track === 'mid') $('fLevel').value = 'mid';
  else if (state.user.track === 'fresher') $('fLevel').value = 'fresher';
  show('practiceView');
  loadQuestion();
  loadCoverage();
}

function resetCard() {
  state.followUps = [];
  state.shown = 0;
  state.revealed = false;
  $('qAnswer').value = '';
  $('answerArea').hidden = true;
  $('answerArea').replaceChildren();
  $('rateRow').hidden = true;
  $('reveal').hidden = false;
  $('reveal').disabled = false;
  $('reveal').textContent = 'Show the answer';
  $('qDepth').textContent = '';
  say($('qMsg'), '');
}

async function loadQuestion() {
  resetCard();
  $('qPrompt').textContent = 'Loading a question.';
  $('qMeta').textContent = 'loading';

  const params = new URLSearchParams();
  if ($('fRole').value) params.set('role', $('fRole').value);
  if ($('fLevel').value) params.set('level', $('fLevel').value);

  try {
    const out = await api('/api/next?' + params.toString());
    if (!out.question) {
      state.question = null;
      $('qMeta').textContent = 'empty';
      $('qPrompt').textContent =
        'Nothing here with those filters yet. Widen them, or add questions from the admin page.';
      $('reveal').hidden = true;
      return;
    }
    state.question = out.question;
    const q = out.question;
    $('qMeta').textContent = `${ROLE_LABEL[q.role] || q.role} / ${q.level} / ${q.topic}`;
    $('qPrompt').textContent = q.prompt;
    $('qDepth').textContent = q.follow_up_count
      ? `${q.follow_up_count} follow-up${q.follow_up_count > 1 ? 's' : ''} waiting`
      : 'no follow-ups';
    if (!out.fresh) {
      say($('qMsg'), 'Seen before. It came back because it went badly or it has been a while.');
    }
  } catch (err) {
    if (err.status === 401) return needsAuth();
    say($('qMsg'), err.message, 'err');
  }
}

$('reveal').addEventListener('click', async () => {
  if (!state.question) return;

  if (!state.revealed) {
    $('reveal').disabled = true;
    try {
      const out = await api(`/api/questions/${state.question.id}/answer`);
      state.revealed = true;
      state.followUps = out.follow_ups || [];

      const block = document.createElement('div');
      block.className = 'answer-block';
      const h = document.createElement('h4');
      h.textContent = 'What a strong answer covers';
      const p = document.createElement('p');
      p.textContent = out.model_answer;
      block.append(h, p);

      const area = $('answerArea');
      area.hidden = false;
      area.replaceChildren(block);

      $('rateRow').hidden = false;
      $('reveal').disabled = false;
      $('reveal').textContent = 'Next follow-up';
      $('reveal').hidden = state.followUps.length === 0;
    } catch (err) {
      $('reveal').disabled = false;
      if (err.status === 401) return needsAuth();
      say($('qMsg'), err.message, 'err');
    }
    return;
  }

  const next = state.followUps[state.shown];
  if (!next) return;
  state.shown += 1;

  const box = document.createElement('div');
  box.className = 'followup';
  const tag = document.createElement('span');
  tag.className = 'tag';
  tag.textContent = `follow-up ${state.shown}`;
  const q = document.createElement('p');
  q.textContent = next.prompt;
  const a = document.createElement('div');
  a.className = 'model';
  a.textContent = next.model_answer;
  box.append(tag, q, a);
  $('answerArea').append(box);

  $('qDepth').textContent = `depth ${state.shown} of ${state.followUps.length}`;
  if (state.shown >= state.followUps.length) $('reveal').hidden = true;
});

$('rateRow').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-rate]');
  if (!btn || !state.question) return;
  const buttons = $('rateRow').querySelectorAll('button');
  buttons.forEach((b) => (b.disabled = true));
  say($('qMsg'), 'Saving.');
  try {
    await api('/api/attempts', {
      method: 'POST',
      body: JSON.stringify({
        question_id: state.question.id,
        answer: $('qAnswer').value.trim() || null,
        self_rating: btn.dataset.rate,
        depth_reached: state.shown,
      }),
    });
    buttons.forEach((b) => (b.disabled = false));
    await loadQuestion();
    loadCoverage();
  } catch (err) {
    buttons.forEach((b) => (b.disabled = false));
    if (err.status === 401) return needsAuth();
    say($('qMsg'), err.message, 'err');
  }
});

$('skip').addEventListener('click', loadQuestion);
$('fRole').addEventListener('change', loadQuestion);
$('fLevel').addEventListener('change', loadQuestion);

async function loadCoverage() {
  try {
    const out = await api('/api/coverage');
    const items = (out.coverage || []).map((row) => {
      const item = document.createElement('div');
      item.className = 'cov-item';
      const r = document.createElement('div');
      r.className = 'r';
      r.textContent = ROLE_LABEL[row.role] || row.role;
      const n = document.createElement('div');
      n.className = 'n';
      n.textContent = (row.total ? Math.round((row.seen / row.total) * 100) : 0) + '%';
      const d = document.createElement('div');
      d.className = 'd';
      d.textContent = `${row.seen} of ${row.total} seen` + (row.missed ? `, ${row.missed} missed` : '');
      item.append(r, n, d);
      return item;
    });
    $('coverage').replaceChildren(...items);
  } catch (_) {
    /* coverage is a nicety, never a blocker */
  }
}

/* ------------------------------------------------------------- start */

(async () => {
  const params = new URLSearchParams(window.location.search);
  resetToken = params.get('reset');

  if (resetToken) {
    // Keep the token out of the address bar, the history and any referrer.
    window.history.replaceState({}, '', window.location.pathname);
    show('resetView');
    return;
  }

  const wantsNew = params.get('new');
  if (wantsNew) window.history.replaceState({}, '', window.location.pathname);
  setMode(wantsNew ? 'up' : 'in');

  try {
    const out = await api('/api/me');
    state.user = out.user;
    if (params.get('view') === 'account') {
      $('whoEmail').textContent = state.user.email;
      $('tabAdmin').hidden = !state.user.is_admin;
      openAccount();
    } else {
      enterApp();
    }
  } catch (_) {
    show('authView');
  }
})();
