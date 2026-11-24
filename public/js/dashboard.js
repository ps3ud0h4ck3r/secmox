import { $, api, ROLE_LABEL } from './common.js';
import { scoreRole } from './role-fit.js';

// The home base. Most of it is a lens on the readiness read the user already
// has; /api/dashboard adds only what readiness does not carry (reviews due,
// recent activity, the streak, and the readiness trend).

const SVGNS = 'http://www.w3.org/2000/svg';
const ROLE_ORDER = ['soc', 'pentest', 'network', 'cloud', 'grc'];
const BAND_WORD = {
  untouched: 'not started',
  cold: 'cold',
  shaky: 'shaky',
  building: 'building',
  close: 'close',
  ready: 'room-ready',
};
const calm = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let handlers = { navigate: () => {}, drill: () => {} };
export function setDashboardHandlers(h) {
  handlers = { ...handlers, ...h };
}

/* ------------------------------------------------------- tiny builders */

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function svg(tag, attrs) {
  const n = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}

// CSP forbids inline style, so a bar's extent is animated in rather than set.
function grow(node, pct, prop) {
  const to = `${Math.max(0, Math.min(100, pct))}%`;
  node.animate([{ [prop]: '0%' }, { [prop]: to }], {
    duration: calm() ? 1 : 520,
    fill: 'both',
    easing: 'ease-out',
  });
}

function panel(title) {
  const p = el('div', 'dash-panel');
  p.append(el('h2', null, title));
  return p;
}

/* ----------------------------------------------------------- sections */

function renderTarget(rows, targetRole) {
  const host = $('dashTarget');
  const box = el('div', 'dash-target');

  const left = el('div', 'dt-left');
  left.append(el('span', 'dt-label', targetRole ? 'AIMING FOR' : 'SET A TARGET'));
  const roleLine = el('span', 'dt-role', targetRole ? ROLE_LABEL[targetRole] || targetRole : 'No target yet');
  const changeBtn = el('button', 'dt-edit', targetRole ? 'change' : 'choose');
  changeBtn.type = 'button';
  roleLine.append(changeBtn);
  left.append(roleLine);

  // The picker: a select that posts the choice and reloads.
  const picker = el('select', 'dt-picker');
  picker.hidden = true;
  picker.append(new Option('Pick a role', ''));
  for (const r of ROLE_ORDER) picker.append(new Option(ROLE_LABEL[r] || r, r));
  if (targetRole) picker.value = targetRole;
  changeBtn.addEventListener('click', () => {
    picker.hidden = !picker.hidden;
    if (!picker.hidden) picker.focus();
  });
  picker.addEventListener('change', async () => {
    try {
      await api('/api/me/target', { method: 'POST', body: JSON.stringify({ role: picker.value || null }) });
      await loadDashboard();
    } catch (err) {
      $('dashMsg').textContent = err.message;
    }
  });
  left.append(picker);

  const prog = el('div', 'dt-prog');
  if (targetRole) {
    const row = rows.find((r) => r.role === targetRole);
    const fit = row ? scoreRole(row).fit : 0;
    const band = row ? BAND_WORD[scoreRole(row).band] || '' : '';
    const bar = el('div', 'dt-bar');
    const fill = el('div', 'dt-fill');
    bar.append(fill);
    prog.append(bar, el('span', 'dt-pct', `${fit}% of the way there${band ? ', ' + band : ''}`));
    box.append(left, prog);
    host.replaceChildren(box);
    grow(fill, fit, 'width');
  } else {
    prog.append(el('span', 'dt-pct', 'Pick the role you are interviewing for and track progress toward it.'));
    box.append(left, prog);
    host.replaceChildren(box);
  }
}

function statTile(label, value, sub) {
  const t = el('div', 'dash-stat');
  t.append(el('span', 'ds-label', label), el('span', 'ds-value', value));
  if (sub) t.append(el('span', 'ds-sub', sub));
  return t;
}

function renderStats(agg) {
  const { top, coverage, seen, total, weak, streak, weekTotal } = agg;
  $('dashStats').replaceChildren(
    statTile(
      'Strongest fit',
      top && top.f.evidence ? ROLE_LABEL[top.r.role] || top.r.role : 'Not called yet',
      top && top.f.evidence ? `${top.f.fit}% fit, ${BAND_WORD[top.f.band] || ''}` : 'practise more',
    ),
    statTile('Coverage', `${coverage}%`, `${seen} of ${total} questions seen`),
    statTile('Weak spots', String(weak), weak ? 'missed or shaky' : 'nothing outstanding'),
    statTile(
      'Streak',
      streak ? `${streak} day${streak === 1 ? '' : 's'}` : 'None yet',
      streak ? `${weekTotal} answered this week` : 'answer one to start',
    ),
  );
}

function renderCoverage(rows) {
  const p = panel('Coverage by role');
  const ordered = [...rows].sort((a, b) => b.seen / (b.total || 1) - a.seen / (a.total || 1));
  if (!ordered.length) {
    p.append(el('p', 'dash-empty', 'No questions available yet.'));
    return p;
  }
  for (const r of ordered) {
    const pct = r.total ? Math.round((r.seen / r.total) * 100) : 0;
    const row = el('div', 'cov-row');
    const track = el('div', 'cov-track');
    const fill = el('div', 'cov-fill');
    track.append(fill);
    row.append(
      el('span', 'cov-name', ROLE_LABEL[r.role] || r.role),
      track,
      el('span', 'cov-pct', `${pct}% · ${r.seen}/${r.total}`),
    );
    p.append(row);
    grow(fill, pct, 'width');
  }
  return p;
}

function renderTrend(trend) {
  const p = panel('Readiness over time');
  p.classList.add('trend');
  if (!trend || trend.length < 2) {
    p.append(
      el(
        'p',
        'dash-empty',
        'The line builds a point a day as you practise. Come back tomorrow for the first stretch.',
      ),
    );
    return p;
  }
  const W = 420;
  const H = 150;
  const pad = 10;
  const xs = (i) => pad + (i * (W - 2 * pad)) / (trend.length - 1);
  const ys = (v) => H - pad - (v / 100) * (H - 2 * pad);
  const pts = trend.map((t, i) => `${xs(i).toFixed(1)},${ys(t.readiness).toFixed(1)}`).join(' ');

  const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', class: 'trend-svg' });
  const defs = svg('defs', {});
  const grad = svg('linearGradient', { id: 'trendGrad', x1: '0', x2: '0', y1: '0', y2: '1' });
  grad.append(
    svg('stop', { offset: '0', 'stop-color': '#29B6FF', 'stop-opacity': '.28' }),
    svg('stop', { offset: '1', 'stop-color': '#29B6FF', 'stop-opacity': '0' }),
  );
  defs.append(grad);
  s.append(
    defs,
    svg('polygon', { points: `${pts} ${xs(trend.length - 1).toFixed(1)},${H} ${pad},${H}`, fill: 'url(#trendGrad)' }),
    svg('polyline', { points: pts, fill: 'none', stroke: '#29B6FF', 'stroke-width': '2.5' }),
    svg('circle', { cx: xs(trend.length - 1).toFixed(1), cy: ys(trend[trend.length - 1].readiness).toFixed(1), r: '4', fill: '#7FD3FF' }),
  );
  p.append(s);
  const first = trend[0].readiness;
  const last = trend[trend.length - 1].readiness;
  p.append(el('p', 'trend-foot', `${first}% → ${last}% across your last ${trend.length} readings`));
  return p;
}

function renderDue(due) {
  const p = panel('Due for review');
  p.append(el('div', 'due-num', String(due)));
  if (due > 0) {
    p.append(el('p', 'due-sub', 'questions the spacing says you should see again today.'));
    const btn = el('button', 'due-btn', 'Review them now');
    btn.type = 'button';
    btn.addEventListener('click', () => handlers.navigate('practiceView'));
    p.append(btn);
  } else {
    p.append(el('p', 'due-sub', 'Nothing due today. The schedule is clear.'));
  }
  return p;
}

function renderWeakTopics(rows) {
  const p = panel('Work on these');
  const topics = [];
  for (const r of rows) for (const t of r.weak_topics || []) topics.push(t);
  topics.sort((a, b) => a.hold - b.hold);
  const top = topics.slice(0, 3);
  if (!top.length) {
    p.append(el('p', 'dash-empty', 'No weak topics yet. Practise a little and this points you at them.'));
    return p;
  }
  for (const t of top) {
    const item = el('div', 'weak-item');
    item.append(el('span', 'weak-topic', t.topic), el('span', 'weak-hold', `${t.hold}% held`));
    p.append(item);
  }
  return p;
}

function renderActivity(activity, streak, weekTotal) {
  const p = panel('Last 7 days');
  const bars = el('div', 'act-bars');
  const max = Math.max(1, ...activity.map((a) => a.count));
  const INITIAL = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  for (const a of activity) {
    const col = el('div', 'act-day');
    const bar = el('div', 'act-bar' + (a.count ? '' : ' zero'));
    const d = new Date(a.day + 'T00:00:00Z');
    col.append(bar, el('span', 'act-lbl', INITIAL[d.getUTCDay()]));
    bars.append(col);
    grow(bar, a.count ? Math.max(8, (a.count / max) * 100) : 3, 'height');
  }
  p.append(bars);
  p.append(
    el(
      'span',
      'act-streak',
      streak ? `${streak}-day streak · ${weekTotal} this week` : `No streak yet · ${weekTotal} this week`,
    ),
  );
  return p;
}

function actionCard({ title, sub, onClick, primary }) {
  const b = el('button', 'dash-card' + (primary ? ' primary' : ''));
  b.type = 'button';
  b.append(el('h3', null, title), el('p', null, sub));
  b.addEventListener('click', onClick);
  return b;
}

function renderActions(agg) {
  const { weak, scDone, scTotal, labsDone, labsTotal } = agg;
  const cards = [
    actionCard({
      title: 'Resume practice',
      sub: 'Pick up the question bank where you left off.',
      primary: true,
      onClick: () => handlers.navigate('practiceView'),
    }),
  ];
  if (weak > 0) {
    cards.push(
      actionCard({
        title: 'Drill your weak spots',
        sub: `${weak} marked missed or shaky. Grind them until they stick.`,
        primary: true,
        onClick: () => handlers.drill(),
      }),
    );
  }
  cards.push(
    actionCard({
      title: 'See your readiness',
      sub: 'The full role-by-role read, and which role fits you.',
      onClick: () => handlers.navigate('readinessView'),
    }),
    actionCard({
      title: 'Open a lab',
      sub: labsTotal ? `${labsDone} of ${labsTotal} solved.` : 'Hands-on with a real artifact.',
      onClick: () => handlers.navigate('labsView'),
    }),
    actionCard({
      title: 'Write a scenario',
      sub: scTotal ? `${scDone} of ${scTotal} done.` : 'Judgment under a prompt.',
      onClick: () => handlers.navigate('scenariosView'),
    }),
  );
  $('dashActions').replaceChildren(...cards);
}

/* --------------------------------------------------------------- load */

// The journey: where the candidate is on the path to interview-ready, and the
// single next move. Built from the dashboard signals plus the top role's fit.
function navTo(view) {
  const t = document.querySelector(`#tabsNav [data-view="${view}"]`);
  if (t) t.click();
}

function renderJourney(dash, agg) {
  const host = $('dashJourney');
  if (!host) return;
  const topReady =
    agg.top && agg.top.f.has_score && ['close', 'ready'].includes(agg.top.f.band);
  const steps = [
    { label: 'Practise', done: Boolean(dash.has_practiced), action: { label: 'Start practising', view: 'practiceView' } },
    { label: 'Take a Score', done: (dash.scores_taken || 0) > 0, action: { label: 'Take a Score', view: 'scoreView' } },
    { label: 'Build profile', done: Boolean(dash.has_profile), action: { label: 'Claim your profile', view: 'scoreView' } },
    { label: 'Interview-ready', done: Boolean(topReady), action: { label: 'See your readiness', view: 'readinessView' } },
  ];
  const current = steps.findIndex((s) => !s.done);

  const wrap = document.createElement('div');
  wrap.className = 'journey';
  const strip = document.createElement('div');
  strip.className = 'journey-steps';
  steps.forEach((s, i) => {
    const node = document.createElement('div');
    const state = s.done ? 'done' : i === current ? 'current' : 'todo';
    node.className = `journey-step is-${state}`;
    const mark = document.createElement('span');
    mark.className = 'journey-mark';
    mark.textContent = s.done ? '✓' : String(i + 1);
    node.append(mark, document.createTextNode(s.label));
    strip.append(node);
  });
  wrap.append(strip);

  const foot = document.createElement('div');
  foot.className = 'journey-foot';
  if (current === -1) {
    foot.append(document.createTextNode('You are interview-ready. Keep it sharp, and share your profile.'));
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'inf ghost small';
    btn.textContent = 'Share your profile';
    btn.addEventListener('click', () => navTo('scoreView'));
    foot.append(btn);
  } else {
    const s = steps[current];
    foot.append(document.createTextNode(`Next: ${s.label.toLowerCase()}.`));
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'inf';
    btn.textContent = s.action.label;
    btn.addEventListener('click', () => navTo(s.action.view));
    foot.append(btn);
  }
  wrap.append(foot);
  host.replaceChildren(wrap);
}

export async function loadDashboard() {
  $('dashMsg').textContent = '';
  try {
    // Minutes east of UTC (IST = 330) so the server counts days, the streak and
    // the activity strip in the learner's local time, not UTC.
    const tz = -new Date().getTimezoneOffset();
    const [rd, dash] = await Promise.all([
      api('/api/readiness'),
      api('/api/dashboard?tz=' + tz),
    ]);
    const rows = rd.readiness || [];
    const sum = (f) => rows.reduce((a, r) => a + f(r), 0);
    const seen = sum((r) => r.seen);
    const total = sum((r) => r.total);
    const weak = sum((r) => r.missed + r.shaky);
    const ranked = rows
      .map((r) => ({ r, f: scoreRole(r) }))
      .sort((a, b) => b.f.fit - a.f.fit || b.f.evidence - a.f.evidence);
    const agg = {
      top: ranked[0],
      coverage: total ? Math.round((seen / total) * 100) : 0,
      seen,
      total,
      weak,
      streak: dash.streak || 0,
      weekTotal: dash.week_total || 0,
      scDone: sum((r) => r.scenarios.done),
      scTotal: sum((r) => r.scenarios.total),
      labsDone: sum((r) => r.labs.done),
      labsTotal: sum((r) => r.labs.total),
    };
    const practised = seen > 0 || agg.labsDone > 0 || agg.scDone > 0;
    $('dashHello').textContent = practised
      ? 'Where you stand, and the fastest next move.'
      : 'Nothing practised yet. Each move below fills this in with where you stand.';

    renderJourney(dash, agg);
    renderTarget(rows, dash.target_role);
    renderStats(agg);
    $('dashMid').replaceChildren(renderCoverage(rows), renderTrend(dash.trend));
    $('dashRow').replaceChildren(
      renderDue(dash.due || 0),
      renderWeakTopics(rows),
      renderActivity(dash.activity || [], agg.streak, agg.weekTotal),
    );
    renderActions(agg);
  } catch (err) {
    if (err.status === 401) return;
    $('dashMsg').className = 'msg err';
    $('dashMsg').textContent = err.message;
  }
}
