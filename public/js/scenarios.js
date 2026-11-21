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

export async function loadScenarios() {
  const list = $('scList');
  list.textContent = 'Loading scenarios.';
  try {
    const { scenarios } = await api('/api/scenarios');
    list.textContent = '';
    if (!scenarios.length) {
      list.textContent = 'No scenarios yet.';
      return;
    }
    for (const sc of scenarios) {
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
      if (sc.done) meta.textContent += ` · written ${plural(sc.done, 'time', 'times')}`;

      card.append(head, meta);
      card.addEventListener('click', () => onOpen(sc.id));
      list.append(card);
    }
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
