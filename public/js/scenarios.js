// Scenario writing.
//
// The order matters and it is the whole point: the brief and the point labels
// come down first, the candidate writes, and only then does the server hand
// back the model answer and what each point is really asking for. Writing is
// what unlocks the answer, so there is nothing to read ahead.

import { $, api, say, ROLE_LABEL } from './common.js';

let current = null; // { id, points, startedAt, attemptId }
let onOpen = () => {};

export function setScenarioHandlers(handlers) {
  onOpen = handlers.openScenario;
}

const words = (text) => (text.trim() ? text.trim().split(/\s+/).length : 0);

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Level (who it is for) and status (have you done it) are both worth filtering,
// and the shortest scenario is a different commitment from the longest, so both
// axes sort. All client-side over the loaded set.
let allScenarios = [];
let scWired = false;
const scView = { role: '', level: '', status: '', sort: 'level-asc' };
// scenario_id -> Set(point_id) the learner keeps missing, so the rubric can
// flag them on the next attempt.
let blindByScenario = new Map();

function scenarioCard(sc) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'lab-card';
  card.dataset.id = sc.id;

  const head = document.createElement('div');
  head.className = 'lab-card-head';
  const title = document.createElement('h3');
  title.textContent = sc.title;
  const tag = document.createElement('span');
  tag.className = 'pill-tag';
  tag.textContent = `${ROLE_LABEL[sc.role] ?? sc.role} / ${sc.level}`;
  head.append(title, tag);

  const meta = document.createElement('p');
  meta.className = 'lab-card-meta';
  meta.textContent = `${plural(sc.minutes, 'minute', 'minutes')} · ${plural(sc.points, 'point', 'points')} to cover`;

  card.append(head, meta);

  // Done scenarios show the best the user has covered, which is more use than a
  // raw attempt count: it says how close they got.
  if (sc.done) {
    const foot = document.createElement('div');
    foot.className = 'lab-foot sc-foot';
    const done = document.createElement('span');
    done.className = 'done';
    done.textContent = 'Done';
    foot.append(done);
    if (sc.best != null) {
      const score = document.createElement('span');
      score.className = 'sc-best';
      score.textContent = `best ${sc.best}/${sc.points} covered`;
      foot.append(score);
    }
    card.append(foot);
  }

  card.addEventListener('click', () => onOpen(sc.id));
  return card;
}

function scRender() {
  const list = $('scList');
  const v = scView;
  const lvl = (s) => (s.level === 'mid' ? 1 : 0);
  const byTitle = (a, b) => a.title.localeCompare(b.title);
  const rows = allScenarios
    .filter(
      (s) =>
        (!v.role || s.role === v.role) &&
        (!v.level || s.level === v.level) &&
        (!v.status || (v.status === 'done' ? s.done > 0 : !s.done)),
    )
    .sort((a, b) => {
      if (v.sort === 'level-desc') return lvl(b) - lvl(a) || byTitle(a, b);
      if (v.sort === 'time-asc') return a.minutes - b.minutes || byTitle(a, b);
      if (v.sort === 'time-desc') return b.minutes - a.minutes || byTitle(a, b);
      return lvl(a) - lvl(b) || byTitle(a, b); // level-asc default
    });

  if (!rows.length) {
    list.replaceChildren();
    say($('scListMsg'), 'No scenarios match those filters. Widen them.');
    return;
  }
  say($('scListMsg'), '');
  list.replaceChildren(...rows.map(scenarioCard));
}

function scWireControls() {
  const apply = () => {
    scView.role = $('scfRole').value;
    scView.level = $('scfLevel').value;
    scView.status = $('scfStatus').value;
    scView.sort = $('scfSort').value;
    scRender();
  };
  ['scfRole', 'scfLevel', 'scfStatus', 'scfSort'].forEach((id) => $(id).addEventListener('change', apply));
}

function renderBlind(spots) {
  blindByScenario = new Map();
  for (const s of spots) {
    if (!blindByScenario.has(s.scenario_id)) blindByScenario.set(s.scenario_id, new Set());
    blindByScenario.get(s.scenario_id).add(s.point_id);
  }
  const panel = $('scBlind');
  if (!spots.length) {
    panel.hidden = true;
    return;
  }
  const list = $('scBlindList');
  list.replaceChildren(
    ...spots.map((s) => {
      const li = document.createElement('li');
      li.className = 'blind-item';
      li.dataset.id = s.scenario_id;

      const label = document.createElement('span');
      label.className = 'blind-label';
      label.textContent = s.label;

      const meta = document.createElement('span');
      meta.className = 'blind-meta';
      meta.textContent = `${s.scenario_title} · missed ${s.missed} of ${s.total}`;

      li.append(label, meta);
      li.addEventListener('click', () => onOpen(s.scenario_id));
      return li;
    }),
  );
  panel.hidden = false;
}

export async function loadScenarios() {
  const list = $('scList');
  list.textContent = 'Loading scenarios.';
  try {
    // The list and the blind spots are independent; one failing should not take
    // the other down.
    const [listRes, blindRes] = await Promise.allSettled([
      api('/api/scenarios'),
      api('/api/scenarios/blindspots'),
    ]);
    if (listRes.status === 'rejected') throw listRes.reason;
    allScenarios = listRes.value.scenarios || [];
    renderBlind(blindRes.status === 'fulfilled' ? blindRes.value.blindspots || [] : []);
    if (!scWired) {
      scWireControls();
      scWired = true;
    }
    list.textContent = '';
    if (!allScenarios.length) {
      list.textContent = 'No scenarios yet.';
      return;
    }
    scRender();
  } catch (err) {
    list.textContent = '';
    say($('scListMsg'), err.message, 'err');
  }
}

export async function openScenario(id) {
  say($('scMsg'), '');
  say($('scReviewMsg'), '');
  try {
    const { scenario, points } = await api(`/api/scenarios/${encodeURIComponent(id)}`);
    current = { id: scenario.id, points, startedAt: Date.now(), attemptId: null };

    $('scTitle').textContent = scenario.title;
    $('scMeta').textContent = `${ROLE_LABEL[scenario.role] ?? scenario.role} / ${scenario.level}`;
    $('scSituation').textContent = scenario.situation;
    $('scAsk').textContent = scenario.ask;
    $('scPointsNote').textContent =
      `There are ${plural(points.length, 'point', 'points')} a panel would listen for. ` +
      `You will see them once you have written something.`;

    $('scResponse').value = '';
    $('scCount').textContent = '0 words';
    $('scClock').textContent = `${scenario.minutes} minutes is the usual budget`;
    $('scWriting').hidden = false;
    $('scReview').hidden = true;
    $('scSubmit').disabled = false;
    return true;
  } catch (err) {
    say($('scListMsg'), err.message, 'err');
    return false;
  }
}

function paragraphs(into, text) {
  into.textContent = '';
  for (const part of String(text).split(/\n\n+/)) {
    const p = document.createElement('p');
    p.textContent = part;
    into.append(p);
  }
}

function renderRubric(points) {
  const box = $('scRubric');
  box.textContent = '';
  for (const point of points) {
    const row = document.createElement('label');
    row.className = 'sc-point';

    const tick = document.createElement('input');
    tick.type = 'checkbox';
    tick.value = point.id;

    const body = document.createElement('span');
    const label = document.createElement('strong');
    label.textContent = point.label;
    // Flag a point the learner has left uncovered across past attempts.
    if (blindByScenario.get(current?.id)?.has(point.id)) {
      row.classList.add('sc-point-blind');
      const flag = document.createElement('span');
      flag.className = 'sc-point-flag';
      flag.textContent = 'missed before';
      label.append(' ', flag);
    }
    const detail = document.createElement('span');
    detail.className = 'sc-point-detail';
    detail.textContent = point.detail;
    body.append(label, detail);

    row.append(tick, body);
    tick.addEventListener('change', score);
    box.append(row);
  }
  score();
}

function ticked() {
  return [...$('scRubric').querySelectorAll('input:checked')].map((i) => i.value);
}

function score() {
  const got = ticked().length;
  const outOf = current?.points?.length ?? 0;
  $('scScore').textContent = `${got} of ${outOf} covered`;
  $('scScore').classList.toggle('sc-score-good', outOf > 0 && got / outOf >= 0.7);
}

export function wireScenario() {
  const box = $('scResponse');

  box.addEventListener('input', () => {
    const n = words(box.value);
    $('scCount').textContent = plural(n, 'word', 'words');
  });

  $('scSubmit').addEventListener('click', async () => {
    if (!current) return;
    const response = box.value.trim();
    if (response.length < 40) {
      say($('scMsg'), 'Write your answer first. The rubric is the reward, not the prompt.', 'err');
      return;
    }
    $('scSubmit').disabled = true;
    say($('scMsg'), 'Saving.');
    try {
      const out = await api('/api/scenario-attempts', {
        method: 'POST',
        body: JSON.stringify({
          scenario_id: current.id,
          response,
          minutes: Math.round((Date.now() - current.startedAt) / 60000),
        }),
      });
      current.attemptId = out.attempt_id;
      current.points = out.points;

      renderRubric(out.points);
      paragraphs($('scModel'), out.model_answer);
      paragraphs($('scYours'), response);

      $('scWriting').hidden = true;
      $('scReview').hidden = false;
      $('scReview').scrollIntoView({ block: 'start', behavior: 'smooth' });
      say($('scMsg'), '');
    } catch (err) {
      $('scSubmit').disabled = false;
      say($('scMsg'), err.message, 'err');
    }
  });

  // The score saves when they leave the review, so ticking boxes never costs
  // a round trip and an unfinished self-assessment is never half-written to
  // the database.
  $('backToScenarios').addEventListener('click', saveScore);
}

export async function saveScore() {
  if (!current?.attemptId) return;
  const covered = ticked();
  const attemptId = current.attemptId;
  current.attemptId = null;
  try {
    await api(`/api/scenario-attempts/${encodeURIComponent(attemptId)}/score`, {
      method: 'POST',
      body: JSON.stringify({ covered_ids: covered }),
    });
  } catch (_) {
    // A lost self-score is not worth blocking the person's way out of the view.
  }
}
