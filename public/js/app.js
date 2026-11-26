import { $, api, say, wirePasswordToggles, ROLE_LABEL } from './common.js';
import { loadLabs, openLab, setLabHandlers } from './labs.js';
import { splash } from './splash.js';
import { loadScenarios, openScenario, setScenarioHandlers, wireScenario }
  from './scenarios.js';
import { loadReadiness, wireReadiness, setReadinessHandlers } from './readiness.js';
import { loadPacks } from './packs.js';

// Register the service worker so the app is installable and loads fast / offline.
// Best-effort: a failure here never affects the app.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
import { loadDashboard, setDashboardHandlers } from './dashboard.js';
import { loadTracks, openTrack, setTrackHandlers } from './tracks.js';
import { openScore, openDiagnostic } from './score.js';

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
  nudged: false,
  // A company-track run: a fixed, ordered queue of question objects played in
  // place of the usual next-question engine. null means ordinary practice.
  run: null,
  // Bookmarked question ids, loaded once so the star shows the right state
  // wherever a question appears.
  bookmarks: new Set(),
};
// This sitting's honest tally. In-memory only: it resets when the page reloads,
// so it is a sense of momentum, not a streak to protect.
const session = { total: 0, got_it: 0, shaky: 0, missed: 0 };
let resetToken = null;

wirePasswordToggles();

/* ------------------------------------------------------------- views */

const VIEWS = ['authView', 'forgotView', 'resetView', 'onboardView', 'dashboardView', 'practiceView',
  'labsView', 'labView', 'scenariosView', 'scenarioView', 'tracksView', 'trackView', 'readinessView',
  'scoreView', 'packsView', 'mockView', 'accountView'];
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
    view === 'labView' ? 'labsView'
    : view === 'scenarioView' ? 'scenariosView'
    : view === 'trackView' ? 'tracksView'
    : view;
  for (const tab of $('tabsNav').querySelectorAll('[data-view]')) {
    if (tab.dataset.view === marked) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
  window.scrollTo(0, 0);
}

$('tabsNav').addEventListener('click', (e) => {
  const tab = e.target.closest('[data-view]');
  if (!tab) return;
  // On a narrow screen the nav is a horizontal strip; keep the tapped item in view.
  tab.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  // Navigating away from a first run counts as skipping onboarding, so it does
  // not nag on the next login. Fire and forget; the navigation proceeds.
  if (state.user && !state.user.onboarded_at) saveOnboard({});
  if (tab.dataset.view === 'dashboardView') {
    show('dashboardView');
    loadDashboard();
  } else if (tab.dataset.view === 'accountView') openAccount();
  else if (tab.dataset.view === 'scenariosView') {
    show('scenariosView');
    loadScenarios();
  } else if (tab.dataset.view === 'readinessView') {
    show('readinessView');
    loadReadiness();
  } else if (tab.dataset.view === 'scoreView') {
    show('scoreView');
    openScore();
  } else if (tab.dataset.view === 'mockView') {
    show('mockView');
  } else if (tab.dataset.view === 'packsView') {
    show('packsView');
    loadPacks();
  } else if (tab.dataset.view === 'labsView') {
    show('labsView');
    loadLabs();
  } else if (tab.dataset.view === 'tracksView') {
    show('tracksView');
    loadTracks();
  } else {
    // Clicking Practice is a move to free practice, so it ends any track run.
    endRun();
    startPractice();
  }
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
wireOnboard();

// Company tracks: opening one shows its overview; starting it loads the curated
// questions into a run that the practice loop walks in order.
setTrackHandlers({
  openTrack: async (slug) => {
    await splash({
      quick: true,
      note: 'opening the track',
      work: (async () => {
        if (await openTrack(slug)) show('trackView');
      })(),
    });
  },
  startRun: (questions, meta) => startTrackRun(questions, meta),
});

$('backToTracks').addEventListener('click', () => {
  show('tracksView');
  loadTracks();
});

// A run is a fixed, ordered queue of questions from one track. It overrides the
// next-question engine until it is exhausted or exited.
function startTrackRun(questions, meta, startIdx = 0) {
  state.run = { questions, idx: startIdx, meta };
  show('practiceView');
  loadQuestion();
}

function endRun() {
  state.run = null;
  $('runBar').hidden = true;
}

function renderRunBar() {
  const run = state.run;
  if (!run) {
    $('runBar').hidden = true;
    return;
  }
  $('runTag').textContent = `${run.meta.company} · ${run.meta.title}`;
  const done = Math.min(run.idx, run.questions.length);
  $('runProg').textContent = `${Math.min(run.idx + 1, run.questions.length)} of ${run.questions.length}`;
  if (done >= run.questions.length) $('runProg').textContent = `${run.questions.length} of ${run.questions.length} · complete`;
  $('runBar').hidden = false;
}

$('runExit').addEventListener('click', () => {
  endRun();
  loadQuestion();
});

// When a platform account is viewing as someone, a banner stays up the whole
// time and the only way out is the exit, which clears it server-side and
// returns to the console. Without this the viewer could forget whose screen
// they are on.
function applyImpersonation(user) {
  if (!user?.impersonating) return;
  $('impWho').textContent = user.actor?.email ? `${user.email}` : user.email;
  $('impBanner').hidden = false;
  document.body.classList.add('is-impersonating');
}

$('impExit').addEventListener('click', async () => {
  $('impExit').disabled = true;
  try {
    await api('/api/impersonate/stop', { method: 'POST' });
  } catch (_) {
    /* fall through to reload regardless; the session flag is what matters */
  }
  window.location.href = '/console/';
});

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

/* --------------------------------------------------- email verification */

// A soft nudge, not a gate: unverified users keep full access and just see a
// dismissible banner until they confirm.
function maybeEmailBanner() {
  const b = $('verifyBanner');
  if (!b) return;
  let dismissed = false;
  try {
    dismissed = sessionStorage.getItem('sm_verify_dismiss') === '1';
  } catch (_) {
    /* private mode; treat as not dismissed */
  }
  b.hidden = !(state.user && state.user.email_verified === false && !dismissed);
}

$('verifyDismiss')?.addEventListener('click', () => {
  try {
    sessionStorage.setItem('sm_verify_dismiss', '1');
  } catch (_) {
    /* ignore */
  }
  $('verifyBanner').hidden = true;
});

$('verifyResend')?.addEventListener('click', async () => {
  const btn = $('verifyResend');
  const prev = btn.textContent;
  btn.disabled = true;
  try {
    const out = await api('/api/auth/resend-verification', { method: 'POST' });
    btn.textContent = out.already ? 'Already verified' : out.mail === false ? 'Email not set up' : 'Sent';
  } catch {
    btn.textContent = 'Try later';
  }
  setTimeout(() => {
    btn.textContent = prev;
    btn.disabled = false;
  }, 2500);
});

// The confirm link bounces back to /app/?verified=1 (or 0). Show the outcome and
// strip the param so a refresh does not repeat it.
function handleVerifiedParam() {
  const p = new URLSearchParams(location.search);
  if (!p.has('verified')) return;
  const ok = p.get('verified') === '1';
  const b = $('verifyBanner');
  if (b) {
    b.hidden = false;
    b.classList.toggle('is-ok', ok);
    $('verifyBannerMsg').textContent = ok
      ? 'Email confirmed. Thanks.'
      : 'That confirmation link has expired. Use Resend to get a new one.';
    const actions = b.querySelector('.verify-banner-actions');
    if (actions) actions.hidden = ok;
    if (ok) setTimeout(() => (b.hidden = true), 4000);
  }
  p.delete('verified');
  const qs = p.toString();
  history.replaceState(null, '', location.pathname + (qs ? `?${qs}` : ''));
}

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
  $('tabConsole').hidden = !['owner', 'developer', 'business'].includes(state.user.platform_role);
  $('tabOrg').hidden = !(state.user.orgs || []).some((o) => o.role === 'org_admin');
  setOrgBrand(state.user.orgs);
  setRoleBadge(state.user.platform_role);
  if (state.user.track === 'mid') $('fLevel').value = 'mid';
  else if (state.user.track === 'fresher') $('fLevel').value = 'fresher';

  // A first-time learner names a role and level before anything else, so the
  // dashboard and the first question are already aimed. Everyone else lands on
  // the dashboard. forceOnboard (from ?onboard=1 or the Account re-aim) brings
  // the screen back on demand, since it is otherwise first-run only.
  if (forceOnboard || !state.user.onboarded_at) {
    forceOnboard = false;
    enterOnboarding();
    return;
  }
  // Bookmarks first, so the first question's star is correct rather than
  // flashing empty.
  await loadBookmarks();
  // Land on the dashboard, but pre-warm practice so switching there is instant.
  show('dashboardView');
  handleVerifiedParam();
  maybeEmailBanner();
  // None reject: each reports its own failure in place.
  await Promise.all([loadDashboard(), loadQuestion(), loadCoverage()]);
}

// A learner who belongs to a company sees its logo and name in the sidebar, so
// the app feels like their programme.
function setOrgBrand(orgs) {
  const org = (orgs || []).find((o) => o.name);
  const wrap = $('orgBrand');
  if (!org) {
    wrap.hidden = true;
    return;
  }
  $('orgBrandName').textContent = org.name;
  // The logo img is built here (never a src-less img sitting in the markup).
  const existing = wrap.querySelector('img');
  if (existing) existing.remove();
  if (org.logo) {
    const img = document.createElement('img');
    img.src = org.logo;
    img.alt = '';
    wrap.prepend(img);
  }
  wrap.hidden = false;
}

/* ------------------------------------------------------- onboarding */

const obPick = { role: null, level: null };
// When true, enterApp shows onboarding even for an already-onboarded user, so
// the first-run screen is reachable again (via ?onboard=1 or the re-aim button).
let forceOnboard = false;

function enterOnboarding() {
  obPick.role = state.user.target_role ?? null;
  obPick.level = state.user.track === 'mid' ? 'mid' : state.user.track === 'fresher' ? 'fresher' : null;
  const roles = [
    ['soc', 'SOC analyst', 'Watch, triage and respond. The most common first security job.'],
    ['pentest', 'Penetration testing', 'Find the holes before attackers do. Hands-on and offensive.'],
    ['network', 'Network security', 'Defend how traffic moves and what is allowed to cross.'],
    ['cloud', 'Cloud security', 'Lock down identity, storage and config across cloud accounts.'],
    ['grc', 'GRC', 'Governance, risk and compliance. Frameworks, audits and policy.'],
  ];
  const box = $('obRoles');
  box.replaceChildren(
    ...roles.map(([id, label, blurb]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ob-role';
      b.dataset.role = id;
      const strong = document.createElement('strong');
      strong.textContent = label;
      const span = document.createElement('span');
      span.textContent = blurb;
      b.append(strong, span);
      if (id === obPick.role) b.setAttribute('aria-pressed', 'true');
      b.addEventListener('click', () => {
        obPick.role = id;
        [...box.children].forEach((c) => c.setAttribute('aria-pressed', String(c === b)));
        refreshOnboard();
      });
      return b;
    }),
  );
  const levels = $('obLevels');
  [...levels.children].forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.level === obPick.level));
    b.onclick = () => {
      obPick.level = b.dataset.level;
      [...levels.children].forEach((c) => c.setAttribute('aria-pressed', String(c === b)));
      refreshOnboard();
    };
  });
  say($('obMsg'), '');
  refreshOnboard();
  show('onboardView');
}

function refreshOnboard() {
  // A role is enough to begin; level defaults sensibly if they leave it.
  $('obStart').disabled = !obPick.role;
}

// Marks the user onboarded so the flow never shows again, saving whatever they
// picked. Returns false if the save failed, so the caller can keep them here.
async function saveOnboard(payload) {
  try {
    const out = await api('/api/me/onboard', { method: 'POST', body: JSON.stringify(payload) });
    state.user.onboarded_at = new Date().toISOString();
    if (out.target_role !== undefined) state.user.target_role = out.target_role;
    if (out.track) state.user.track = out.track;
    return true;
  } catch (err) {
    say($('obMsg'), err.message, 'err');
    return false;
  }
}

function wireOnboard() {
  // Re-aim from the Account page: show the onboarding screen again, pre-filled
  // with the current target and level.
  $('reaimGo').addEventListener('click', () => enterOnboarding());

  $('obStart').addEventListener('click', async () => {
    if (!obPick.role) return;
    $('obStart').disabled = true;
    const level = obPick.level || 'fresher';
    const ok = await saveOnboard({ role: obPick.role, level });
    if (!ok) { $('obStart').disabled = false; return; }
    // Guided straight to the first question in their chosen role.
    $('fRole').value = obPick.role;
    $('fLevel').value = level;
    show('practiceView');
    await loadBookmarks();
    await splash({ work: Promise.all([loadQuestion(), loadCoverage(), loadDashboard()]), quick: true, note: 'lining up your first question' });
  });

  $('obSkip').addEventListener('click', async () => {
    const ok = await saveOnboard({});
    if (!ok) return;
    show('dashboardView');
    await Promise.all([loadBookmarks(), loadDashboard(), loadQuestion(), loadCoverage()]);
  });
}

// Platform roles get a badge so a privileged account never looks like a plain
// one. A normal learner has no platform role and no badge.
const ROLE_BADGE = { owner: 'Owner', developer: 'Developer', business: 'Business' };
function setRoleBadge(role) {
  const badge = $('roleBadge');
  const label = ROLE_BADGE[role];
  if (!label) {
    badge.hidden = true;
    return;
  }
  badge.textContent = label;
  badge.className = 'role-badge role-' + role;
  badge.hidden = false;
}

function resetCard() {
  state.followUps = [];
  state.rung = 0;
  state.phase = 'hidden';
  state.rungBox = null;
  state.nudged = false;
  $('qAnswer').value = '';
  $('qAnswer').readOnly = false;
  $('qAnswerField').hidden = false;
  $('qActions').hidden = false;
  $('answerArea').hidden = true;
  $('answerArea').replaceChildren();
  $('rateRow').hidden = true;
  $('reveal').hidden = false;
  $('reveal').disabled = false;
  $('reveal').textContent = 'Show the answer';
  $('qDepth').textContent = '';
  $('qStar').hidden = true;
  $('qReport').hidden = true;
  $('qReportPanel').hidden = true;
  say($('qMsg'), '');
}

// Paint a question object (same shape from /api/next or a track run) onto the
// card. The run/engine decides which question; this just renders it.
function renderQuestion(q, note) {
  $('reveal').hidden = false;
  state.question = q;
  const diffWord = { 1: 'easy', 2: 'medium', 3: 'hard' }[q.difficulty];
  $('qMeta').textContent =
    `${ROLE_LABEL[q.role] || q.role} / ${q.level} / ${q.topic}` + (diffWord ? ` / ${diffWord}` : '');
  $('qPrompt').textContent = q.prompt;
  $('qDepth').textContent = q.follow_up_count
    ? `${q.follow_up_count} follow-up${q.follow_up_count > 1 ? 's' : ''} waiting`
    : 'no follow-ups';
  // Save star and report, both tied to a real question on the card.
  const star = $('qStar');
  star.hidden = false;
  star.setAttribute('aria-pressed', String(state.bookmarks.has(q.id)));
  $('qReport').hidden = false;
  $('qReportPanel').hidden = true;
  if (note) say($('qMsg'), note);
}

async function loadBookmarks() {
  try {
    const { ids } = await api('/api/bookmarks');
    state.bookmarks = new Set(ids || []);
  } catch (_) {
    // A missing bookmark list is not worth blocking practice; the star just
    // starts empty and corrects on the next toggle.
  }
}

// In a track run the next question comes from the curated queue, in order, with
// the practice filters ignored. When the queue runs out the run is done.
function loadFromRun() {
  resetCard();
  const run = state.run;
  renderRunBar();
  if (run.idx >= run.questions.length) {
    state.question = null;
    $('reveal').hidden = true;
    $('rateRow').hidden = true;
    $('qMeta').textContent = 'run complete';
    $('qPrompt').textContent =
      `That is the whole ${run.meta.company} ${run.meta.title} run — ${run.questions.length} ` +
      `question${run.questions.length > 1 ? 's' : ''}. Exit the run for free practice, or open another track.`;
    $('qDepth').textContent = '';
    return;
  }
  renderQuestion(
    run.questions[run.idx],
    `${run.meta.company} ${run.meta.title} · question ${run.idx + 1} of ${run.questions.length}. Answer it cold.`,
  );
}

// Rebuild the Difficulty dropdown so it only offers difficulties that actually
// have questions for the chosen role and level. This is what stops the user ever
// landing on an empty combo like Fresher + Hard: they cannot pick it.
async function syncDiffOptions() {
  const sel = $('fDiff');
  if (!sel) return;
  let facets;
  try {
    const qs = $('fRole').value ? `?role=${encodeURIComponent($('fRole').value)}` : '';
    facets = await api('/api/next/facets' + qs);
  } catch (_) {
    return; // on failure leave the options as they are
  }
  const level = $('fLevel').value;
  const allowed = new Set(
    level && facets.diffByLevel[level] ? facets.diffByLevel[level] : facets.difficulties,
  );
  const LABEL = { 1: 'Easy', 2: 'Medium', 3: 'Hard' };
  const cur = sel.value;
  sel.replaceChildren();
  const any = document.createElement('option');
  any.value = '';
  any.textContent = 'Any difficulty';
  sel.append(any);
  for (const d of [1, 2, 3]) {
    if (!allowed.has(d)) continue;
    const o = document.createElement('option');
    o.value = String(d);
    o.textContent = LABEL[d];
    sel.append(o);
  }
  // Keep the current choice if it still exists; otherwise fall back to Any so no
  // impossible difficulty is ever sent.
  sel.value = allowed.has(Number(cur)) ? cur : '';
}

async function loadQuestion() {
  if (state.run) return loadFromRun();
  resetCard();
  $('qPrompt').textContent = 'Loading a question.';
  $('qMeta').textContent = 'loading';

  // Keep the Difficulty options in step with the chosen role/level before we read
  // them, so the request can never carry a combo that has no questions.
  const facetKey = `${$('fRole').value}|${$('fLevel').value}`;
  if (state.facetKey !== facetKey) {
    await syncDiffOptions();
    state.facetKey = facetKey;
  }

  const weak = $('fWeak').getAttribute('aria-pressed') === 'true';
  const saved = $('fSaved').getAttribute('aria-pressed') === 'true';
  const params = new URLSearchParams();
  if ($('fRole').value) params.set('role', $('fRole').value);
  if ($('fLevel').value) params.set('level', $('fLevel').value);
  if ($('fDiff').value) params.set('difficulty', $('fDiff').value);
  if (weak) params.set('focus', 'weak');
  else if (saved) params.set('focus', 'saved');

  try {
    const out = await api('/api/next?' + params.toString());
    if (!out.question) {
      // No question to answer, so no answer box: a blank textarea with nothing to
      // respond to is the dead-end we are removing. Show only the message.
      state.question = null;
      $('reveal').hidden = true;
      $('qAnswerField').hidden = true;
      $('qActions').hidden = true;
      $('qDepth').textContent = '';
      if (out.mode === 'saved') {
        $('qMeta').textContent = 'empty';
        $('qPrompt').textContent =
          'Nothing saved yet. Star a question while practising to save it here, then turn Saved on.';
      } else if (out.mode === 'weak') {
        $('qMeta').textContent = 'clear';
        $('qPrompt').textContent =
          'No weak spots right now. Nothing you have faced is on a missed or shaky mark. Turn Weak spots off for fresh questions.';
      } else {
        $('qMeta').textContent = 'empty';
        $('qPrompt').textContent =
          'No questions here yet. The filters above only offer combinations that have questions, so this is rare; pick another role or difficulty.';
      }
      return;
    }
    const note =
      out.mode === 'relaxed'
        ? `No questions for that exact ${out.relaxed === 'difficulty' ? 'difficulty' : 'filter'}, so here is the closest match.`
        : out.mode === 'saved'
          ? 'From your saved questions.'
          : out.mode === 'weak'
            ? 'A weak spot: you marked this missed or shaky last time. Hold it now.'
            : out.mode === 'due'
              ? 'Back on schedule. Enough time has passed to see if it stuck.'
              : out.mode === 'review'
                ? 'Nothing new left with these filters, so here is the weakest one to keep warm.'
                : '';
    renderQuestion(out.question, note);
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
    // Retrieval is the whole point, so an empty answer gets one gentle nudge
    // before the answer opens. One tap more and it reveals anyway; nobody is
    // forced to type.
    if (!$('qAnswer').value.trim() && !state.nudged) {
      state.nudged = true;
      say($('qMsg'), 'Try it first, even roughly. Pulling it from memory is where the practice is. Tap again to reveal.');
      return;
    }
    $('reveal').disabled = true;
    try {
      const out = await api(`/api/questions/${state.question.id}/answer`);
      state.followUps = out.follow_ups || [];
      // Lock what you wrote the moment you look, so the self-rating is honest:
      // you are grading the answer you actually gave, not one tidied up after.
      $('qAnswer').readOnly = true;
      $('qAnswer').blur();
      say($('qMsg'), '');

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
    session.total += 1;
    if (btn.dataset.rate in session) session[btn.dataset.rate] += 1;
    renderSession();
    buttons.forEach((b) => (b.disabled = false));
    if (state.run) state.run.idx += 1;
    await loadQuestion();
    loadCoverage();
  } catch (err) {
    buttons.forEach((b) => (b.disabled = false));
    if (err.status === 401) return needsAuth();
    say($('qMsg'), err.message, 'err');
  }
});

// In a run, Skip moves to the next curated question instead of a fresh draw.
$('skip').addEventListener('click', () => {
  if (state.run) state.run.idx += 1;
  loadQuestion();
});

// Touching any filter is a move to free practice, so it ends the current run.
function filterChanged() {
  endRun();
  loadQuestion();
}
$('fRole').addEventListener('change', filterChanged);
$('fLevel').addEventListener('change', filterChanged);
$('fDiff').addEventListener('change', filterChanged);

$('fWeak').addEventListener('click', () => {
  const on = $('fWeak').getAttribute('aria-pressed') === 'true';
  setWeak(!on);
  if (!on) setSaved(false); // weak and saved are exclusive focuses
  endRun();
  loadQuestion();
});

$('fSaved').addEventListener('click', () => {
  const on = $('fSaved').getAttribute('aria-pressed') === 'true';
  setSaved(!on);
  if (!on) setWeak(false);
  endRun();
  loadQuestion();
});

// Star: save or unsave the question on the card. Optimistic, reverts on error.
$('qStar').addEventListener('click', async () => {
  const q = state.question;
  if (!q) return;
  const star = $('qStar');
  const want = star.getAttribute('aria-pressed') !== 'true';
  star.setAttribute('aria-pressed', String(want));
  try {
    const out = await api(`/api/questions/${encodeURIComponent(q.id)}/bookmark`, { method: 'POST' });
    if (out.bookmarked) state.bookmarks.add(q.id);
    else state.bookmarks.delete(q.id);
    star.setAttribute('aria-pressed', String(out.bookmarked));
  } catch (err) {
    star.setAttribute('aria-pressed', String(!want));
    say($('qMsg'), err.message, 'err');
  }
});

// Report a problem with the question on the card.
$('qReport').addEventListener('click', () => {
  $('qReportPanel').hidden = false;
  $('qReport').hidden = true;
  $('qReportNote').value = '';
});
$('qReportCancel').addEventListener('click', () => {
  $('qReportPanel').hidden = true;
  $('qReport').hidden = false;
});
$('qReportSend').addEventListener('click', async () => {
  const q = state.question;
  if (!q) return;
  $('qReportSend').disabled = true;
  try {
    await api(`/api/questions/${encodeURIComponent(q.id)}/report`, {
      method: 'POST',
      body: JSON.stringify({ reason: $('qReportReason').value, note: $('qReportNote').value.trim() || null }),
    });
    $('qReportPanel').hidden = true;
    $('qReport').hidden = true;
    say($('qMsg'), 'Thanks, that is flagged for review.');
  } catch (err) {
    say($('qMsg'), err.message, 'err');
  } finally {
    $('qReportSend').disabled = false;
  }
});

$('qSearchGo').addEventListener('click', runSearch);
$('qSearch').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); runSearch(); }
});
$('qSearch').addEventListener('input', () => {
  if (!$('qSearch').value.trim()) $('qSearchResults').hidden = true;
});

function setWeak(on) {
  $('fWeak').setAttribute('aria-pressed', String(on));
  $('fWeak').classList.toggle('on', on);
}

function setSaved(on) {
  $('fSaved').setAttribute('aria-pressed', String(on));
  $('fSaved').classList.toggle('on', on);
}

/* --------------------------------------------------- search the bank */

let searchResults = [];

async function runSearch() {
  const term = $('qSearch').value.trim();
  const box = $('qSearchResults');
  if (term.length < 2) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  box.textContent = 'Searching.';
  try {
    const { results } = await api('/api/search?q=' + encodeURIComponent(term));
    searchResults = results || [];
    renderSearchResults(term);
  } catch (err) {
    box.textContent = err.message;
  }
}

function renderSearchResults(term) {
  const box = $('qSearchResults');
  box.replaceChildren();
  if (!searchResults.length) {
    const p = document.createElement('p');
    p.className = 'search-empty';
    p.textContent = `No questions match "${term}".`;
    box.append(p);
    return;
  }
  const head = document.createElement('div');
  head.className = 'search-head';
  const count = document.createElement('span');
  count.className = 'search-count';
  count.textContent = `${searchResults.length} match${searchResults.length > 1 ? 'es' : ''}`;
  const all = document.createElement('button');
  all.className = 'inf ghost small';
  all.type = 'button';
  all.textContent = 'Practice all';
  all.addEventListener('click', () => startSearchRun(0, term));
  const close = document.createElement('button');
  close.className = 'inf ghost small';
  close.type = 'button';
  close.textContent = 'Close';
  close.addEventListener('click', () => { box.hidden = true; });
  head.append(count, all, close);
  box.append(head);

  const list = document.createElement('ul');
  list.className = 'search-list';
  searchResults.forEach((q, i) => {
    const li = document.createElement('li');
    li.className = 'search-item';
    li.tabIndex = 0;
    const prompt = document.createElement('span');
    prompt.className = 'search-prompt';
    prompt.textContent = q.prompt;
    const meta = document.createElement('span');
    meta.className = 'search-meta';
    meta.textContent = `${ROLE_LABEL[q.role] ?? q.role} / ${q.level} / ${q.topic}`;
    li.append(prompt, meta);
    const open = () => startSearchRun(i, term);
    li.addEventListener('click', open);
    li.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
    list.append(li);
  });
  box.append(list);
}

// Play the matches as a run, starting at the one they picked.
function startSearchRun(idx, term) {
  $('qSearchResults').hidden = true;
  endRun();
  startTrackRun(searchResults, { company: 'Search', title: term }, idx);
}

// This sitting's tally, shown once the first question is rated.
function renderSession() {
  const bar = $('sessionBar');
  if (!session.total) {
    bar.hidden = true;
    return;
  }
  const parts = [
    ['total', `${session.total} answered`],
    ['got_it', `${session.got_it} got it`],
    ['shaky', `${session.shaky} shaky`],
    ['missed', `${session.missed} missed`],
  ];
  bar.replaceChildren(
    ...parts.map(([k, text]) => {
      const s = document.createElement('span');
      s.className = 's-' + k;
      s.textContent = text;
      return s;
    }),
  );
  bar.hidden = false;
}

// Keyboard flow: a drilling tool should not need the mouse. Only acts while
// the practice view is open, and leaves normal typing in the answer box alone
// except for the reveal chord.
document.addEventListener('keydown', (e) => {
  if ($('practiceView').hidden) return;

  // Typing in search, the report note or any other field is never a shortcut.
  // The answer box is handled specially below (locked = rating still works).
  const tag = e.target.tagName;
  if ((tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') && e.target !== $('qAnswer')) return;

  // A locked (post-reveal) answer box is not really "typing", so number-key
  // rating should work even if focus is still sitting in it.
  const inAnswer = e.target === $('qAnswer') && !$('qAnswer').readOnly;
  const revealReady = !$('reveal').hidden && !$('reveal').disabled;

  // Reveal / advance from anywhere, including the answer box: Ctrl or Cmd + Enter.
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    if (revealReady) {
      e.preventDefault();
      $('reveal').click();
    }
    return;
  }
  // Single-key shortcuts only when no modifier is held and not mid-typing.
  if (e.ctrlKey || e.metaKey || e.altKey || inAnswer) return;

  if (e.key === '1' || e.key === '2' || e.key === '3') {
    if ($('rateRow').hidden) return;
    const rate = { 1: 'got_it', 2: 'shaky', 3: 'missed' }[e.key];
    const btn = $('rateRow').querySelector(`[data-rate="${rate}"]`);
    if (btn && !btn.disabled) {
      e.preventDefault();
      btn.click();
    }
  } else if (e.key === 'Enter' || e.key === 'n' || e.key === 'N') {
    if (revealReady) {
      e.preventDefault();
      $('reveal').click();
    }
  } else if (e.key === 's' || e.key === 'S') {
    e.preventDefault();
    $('skip').click();
  }
});

// Deep-link from the readiness role-fit block: drill one role's weak spots.
async function startDrill(role) {
  endRun();
  $('fRole').value = role || '';
  setWeak(true);
  show('practiceView');
  await splash({ work: loadQuestion(), quick: true, note: 'opening your weak spots' });
}
setReadinessHandlers({ onDrill: startDrill });

setDashboardHandlers({
  navigate: (view) => $('tabsNav').querySelector(`[data-view="${view}"]`)?.click(),
  drill: () => startDrill(),
});

// The sidebar logo is a home button when signed in: it goes to the dashboard,
// not back out to the public site. Signed out, the href carries to the landing
// page as normal.
$('brandHome').addEventListener('click', (e) => {
  if (state.user) {
    e.preventDefault();
    $('tabsNav').querySelector('[data-view="dashboardView"]').click();
  }
});

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

  // The landing's find-your-role hook lands here as ?find=role; after the
  // session restores, drop straight into the diagnostic.
  const wantsFind = params.get('find') === 'role';

  // ?onboard=1 brings the first-run screen back for an already-onboarded user.
  if (params.get('onboard') === '1') {
    forceOnboard = true;
    window.history.replaceState({}, '', window.location.pathname);
  }

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
  applyImpersonation(me.user);
  await splash({
    note: 'restoring your session',
    work: (async () => {
      if (params.get('view') === 'account') {
        $('whoEmail').textContent = state.user.email;
        $('tabAdmin').hidden = !state.user.is_admin;
        openAccount();
      } else {
        await enterApp();
        if (wantsFind) {
          show('scoreView');
          openDiagnostic();
        }
      }
    })(),
  });
})();
