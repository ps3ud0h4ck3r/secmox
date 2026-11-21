import { $, api, say, wirePasswordToggles, ROLE_LABEL } from './common.js';
import { loadLabs, openLab, setLabHandlers } from './labs.js';
import { splash } from './splash.js';
import { loadScenarios, openScenario, setScenarioHandlers, wireScenario }
  from './scenarios.js';
import { loadReadiness, wireReadiness } from './readiness.js';

// phase walks a question: 'hidden' (answer not shown yet), 'answered' (main
// answer shown, a follow-up prompt is the next click), 'prompt' (a follow-up is
// on screen cold, its answer is the next click), 'done' (no rungs left). rung is
// how many follow-ups the candidate has climbed through, which is the depth.
const state = {
  user: null,
  question: null,
  followUps: [],
  rung: 0,
  phase: 'hidden',
  rungBox: null,
  mode: 'in',
};
let resetToken = null;

wirePasswordToggles();

/* ------------------------------------------------------------- views */

const VIEWS = ['authView', 'forgotView', 'resetView', 'practiceView', 'labsView', 'labView',
  'scenariosView', 'scenarioView', 'readinessView', 'accountView'];
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
  $('topHead').hidden = chromeOn;
  const marked =
    view === 'labView' ? 'labsView' : view === 'scenarioView' ? 'scenariosView' : view;
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
  else if (tab.dataset.view === 'scenariosView') {
    show('scenariosView');
    loadScenarios();
  } else if (tab.dataset.view === 'readinessView') {
    show('readinessView');
    loadReadiness();
  } else if (tab.dataset.view === 'labsView') {
    show('labsView');
    loadLabs();
  } else startPractice();
});

// Only when arriving from another view. Skipping a question or changing a
// filter reloads the same view and must stay instant.
async function startPractice() {
  if (!$('practiceView').hidden) return;
  show('practiceView');
  await splash({ work: loadQuestion(), quick: true, note: 'opening the practical' });
}

setScenarioHandlers({
  openScenario: async (id) => {
    await splash({
      quick: true,
      note: 'opening the scenario',
      work: (async () => {
        if (await openScenario(id)) show('scenarioView');
      })(),
    });
  },
});
wireScenario();
wireReadiness();

$('backToScenarios').addEventListener('click', () => {
  show('scenariosView');
  loadScenarios();
});

setLabHandlers({
  needsAuth,
  openLab: async (id) => {
    await splash({
      quick: true,
      note: 'opening the lab',
      work: (async () => {
        if (await openLab(id)) show('labView');
      })(),
    });
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
  say($('authMsg'), '');
  try {
    // The form stays mounted underneath, so a rejection lands back on a
    // visible field instead of an empty screen.
    await splash({
      note: up ? 'creating your account' : 'signing you in',
      work: (async () => {
        const out = await api(up ? '/api/auth/signup' : '/api/auth/login', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        $('password').value = '';
        state.user = out.user;
        await enterApp();
      })(),
    });
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

async function enterApp() {
  $('whoEmail').textContent = state.user.email;
  $('tabAdmin').hidden = !state.user.is_admin;
  if (state.user.track === 'mid') $('fLevel').value = 'mid';
  else if (state.user.track === 'fresher') $('fLevel').value = 'fresher';
  show('practiceView');
  // Neither rejects: both report their own failure in place.
  await Promise.all([loadQuestion(), loadCoverage()]);
}

function resetCard() {
  state.followUps = [];
  state.rung = 0;
  state.phase = 'hidden';
  state.rungBox = null;
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
    if (out.mode === 'due') {
      say($('qMsg'), 'Back on schedule. Enough time has passed to see if it stuck.');
    } else if (out.mode === 'review') {
      say($('qMsg'), 'Nothing new left with these filters, so here is the weakest one to keep warm.');
    }
  } catch (err) {
    if (err.status === 401) return needsAuth();
    say($('qMsg'), err.message, 'err');
  }
}

// The ladder. A follow-up is shown cold, prompt first, and its answer only on
// the next click, so the candidate has to confront each rung the way the room
// would make them, instead of reading the question and its answer together.
function labelForNextRung() {
  return state.rung === 0 ? 'Face the follow-up' : 'The next follow-up';
}

$('reveal').addEventListener('click', async () => {
  if (!state.question) return;

  // Step 1: reveal the main answer, then hand over to the ladder.
  if (state.phase === 'hidden') {
    $('reveal').disabled = true;
    try {
      const out = await api(`/api/questions/${state.question.id}/answer`);
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

      if (state.followUps.length) {
        state.phase = 'answered';
        $('reveal').textContent = labelForNextRung();
        $('reveal').hidden = false;
        $('qDepth').textContent = `depth 0 of ${state.followUps.length}`;
      } else {
        state.phase = 'done';
        $('reveal').hidden = true;
      }
    } catch (err) {
      $('reveal').disabled = false;
      if (err.status === 401) return needsAuth();
      say($('qMsg'), err.message, 'err');
    }
    return;
  }

  // Step 2: put the next follow-up on screen, prompt only.
  if (state.phase === 'answered') {
    const fu = state.followUps[state.rung];
    if (!fu) return;

    const box = document.createElement('div');
    box.className = 'followup awaiting';
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = `follow-up ${state.rung + 1}`;
    const q = document.createElement('p');
    q.textContent = fu.prompt;
    const hint = document.createElement('p');
    hint.className = 'fu-hint';
    hint.textContent = 'Answer it in your head before you look.';
    box.append(tag, q, hint);
    $('answerArea').append(box);
    state.rungBox = box;

    state.phase = 'prompt';
    $('reveal').textContent = 'Show this answer';
    box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return;
  }

  // Step 3: reveal the current rung's answer, climb one, line up the next.
  if (state.phase === 'prompt') {
    const fu = state.followUps[state.rung];
    if (!fu || !state.rungBox) return;

    state.rungBox.classList.remove('awaiting');
    state.rungBox.querySelector('.fu-hint')?.remove();
    const a = document.createElement('div');
    a.className = 'model';
    a.textContent = fu.model_answer;
    state.rungBox.append(a);

    state.rung += 1;
    $('qDepth').textContent = `depth ${state.rung} of ${state.followUps.length}`;

    if (state.rung >= state.followUps.length) {
      state.phase = 'done';
      $('reveal').hidden = true;
    } else {
      state.phase = 'answered';
      $('reveal').textContent = labelForNextRung();
    }
  }
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
        depth_reached: state.rung,
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

  // Ask first, then decide whether to show anything. Wrapping the session
  // check itself would make every signed-out visitor sit through a logo on
  // the way to a sign in form.
  let me;
  try {
    me = await api('/api/me');
  } catch (_) {
    show('authView');
    return;
  }

  state.user = me.user;
  await splash({
    note: 'restoring your session',
    work: (async () => {
      if (params.get('view') === 'account') {
        $('whoEmail').textContent = state.user.email;
        $('tabAdmin').hidden = !state.user.is_admin;
        openAccount();
      } else {
        await enterApp();
      }
    })(),
  });
})();
