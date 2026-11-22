import { $, api, ROLE_LABEL } from './common.js';
import { scoreRole } from './role-fit.js';

// The home base. Everything here is aggregated from the readiness read the user
// already has, so the dashboard adds no new source of truth: it is a lens on
// where they stand and the fastest next move, not another number to maintain.

const BAND_WORD = {
  untouched: 'not started',
  cold: 'cold',
  shaky: 'shaky',
  building: 'building',
  close: 'close',
  ready: 'room-ready',
};

let handlers = { navigate: () => {}, drill: () => {} };
export function setDashboardHandlers(h) {
  handlers = { ...handlers, ...h };
}

function statTile(label, value, sub) {
  const t = document.createElement('div');
  t.className = 'dash-stat';
  const l = document.createElement('span');
  l.className = 'ds-label';
  l.textContent = label;
  const v = document.createElement('span');
  v.className = 'ds-value';
  v.textContent = value;
  t.append(l, v);
  if (sub) {
    const s = document.createElement('span');
    s.className = 'ds-sub';
    s.textContent = sub;
    t.append(s);
  }
  return t;
}

function actionCard({ title, sub, onClick, primary }) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'dash-card' + (primary ? ' primary' : '');
  const h = document.createElement('h3');
  h.textContent = title;
  const p = document.createElement('p');
  p.textContent = sub;
  b.append(h, p);
  b.addEventListener('click', onClick);
  return b;
}

export async function loadDashboard() {
  const msg = $('dashMsg');
  msg.textContent = '';
  try {
    const out = await api('/api/readiness');
    const rows = out.readiness || [];
    const sum = (f) => rows.reduce((a, r) => a + f(r), 0);
    const seen = sum((r) => r.seen);
    const total = sum((r) => r.total);
    const weak = sum((r) => r.missed + r.shaky);
    const labsDone = sum((r) => r.labs.done);
    const labsTotal = sum((r) => r.labs.total);
    const scDone = sum((r) => r.scenarios.done);
    const scTotal = sum((r) => r.scenarios.total);
    const coverage = total ? Math.round((seen / total) * 100) : 0;
    const hasData = seen > 0 || labsDone > 0 || scDone > 0;

    const ranked = rows
      .map((r) => ({ r, f: scoreRole(r) }))
      .sort((a, b) => b.f.fit - a.f.fit || b.f.evidence - a.f.evidence);
    const top = ranked[0];

    const stats = $('dashStats');
    const actions = $('dashActions');

    if (!hasData) {
      $('dashHello').textContent =
        'Nothing practised yet. Answer a few questions and this fills in with where you stand.';
      stats.replaceChildren();
      stats.hidden = true;
      actions.replaceChildren(
        actionCard({
          title: 'Start practising',
          sub: 'One question, answered before you look. SecMox reads from there.',
          primary: true,
          onClick: () => handlers.navigate('practiceView'),
        }),
        actionCard({
          title: 'Try a lab',
          sub: 'A real artifact and the questions someone would ask about it.',
          onClick: () => handlers.navigate('labsView'),
        }),
        actionCard({
          title: 'Write a scenario',
          sub: 'Judgment under a prompt, scored against a rubric.',
          onClick: () => handlers.navigate('scenariosView'),
        }),
      );
      return;
    }

    $('dashHello').textContent = 'Where you stand, and the fastest next move.';
    stats.hidden = false;
    const fitValue =
      top && top.f.evidence
        ? `${ROLE_LABEL[top.r.role] || top.r.role}`
        : 'Not called yet';
    const fitSub =
      top && top.f.evidence ? `${top.f.fit}% fit, ${BAND_WORD[top.f.band] || ''}` : 'practise more';
    stats.replaceChildren(
      statTile('Strongest fit', fitValue, fitSub),
      statTile('Coverage', `${coverage}%`, `${seen} of ${total} questions seen`),
      statTile('Weak spots', String(weak), weak ? 'missed or shaky' : 'nothing outstanding'),
    );

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
    actions.replaceChildren(...cards);
  } catch (err) {
    if (err.status === 401) return;
    msg.className = 'msg err';
    msg.textContent = err.message;
  }
}
