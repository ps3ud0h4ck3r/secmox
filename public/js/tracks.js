// Company interview tracks.
//
// A track is the existing question bank seen through one employer's lens: the
// rounds you tend to meet, what that kind of interview weighs, and a curated,
// ordered run of questions to drill against it. Opening a track shows the
// overview; "Practice this track" hands the ordered questions to the practice
// loop as a fixed run.

import { $, api, say, ROLE_LABEL } from './common.js';

let onOpen = () => {};
let onStartRun = () => {};
let current = null; // { meta, questions } for the open detail

export function setTrackHandlers(handlers) {
  onOpen = handlers.openTrack;
  onStartRun = handlers.startRun;
}

const DIFF_LABEL = { 1: 'easy', 2: 'medium', 3: 'hard' };

// CSP forbids an inline style attribute, so a bar's width is animated in.
function grow(node, pct) {
  const to = Math.max(0, Math.min(100, pct)) + '%';
  node.animate([{ width: '0%' }, { width: to }], { duration: 500, easing: 'ease-out', fill: 'both' });
}

const initials = (company) =>
  company
    .replace(/[^A-Za-z0-9 ]/g, '')
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 3)
    .toUpperCase();

/* ---------------------------------------------------------------- list */

let allTracks = [];
let trkWired = false;
const trkView = { role: '', sort: 'company' };

function trackCard(t) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'track-card';
  card.dataset.slug = t.slug;

  const logo = document.createElement('span');
  logo.className = 'track-logo';
  logo.textContent = initials(t.company);

  const body = document.createElement('div');
  body.className = 'track-card-body';

  const head = document.createElement('div');
  head.className = 'track-card-head';
  const name = document.createElement('h3');
  name.textContent = t.company;
  const pill = document.createElement('span');
  pill.className = 'pill-tag';
  pill.textContent = `${t.title} · ${ROLE_LABEL[t.role] ?? t.role} / ${t.level}`;
  head.append(name, pill);

  const blurb = document.createElement('p');
  blurb.className = 'track-card-blurb';
  blurb.textContent = t.blurb;

  const prog = document.createElement('div');
  prog.className = 'track-prog';
  const bar = document.createElement('div');
  bar.className = 'trk-bar';
  const fill = document.createElement('div');
  fill.className = 'trk-fill';
  if (t.q_done >= t.q_total && t.q_total > 0) fill.classList.add('full');
  bar.append(fill);
  const label = document.createElement('span');
  label.className = 'track-prog-label';
  label.textContent = `${t.q_done} / ${t.q_total} practised`;
  prog.append(bar, label);

  body.append(head, blurb, prog);
  card.append(logo, body);
  card.addEventListener('click', () => onOpen(t.slug));

  // Animate the fill after it is in the DOM.
  requestAnimationFrame(() => grow(fill, t.q_total ? (t.q_done / t.q_total) * 100 : 0));
  return card;
}

function trkRender() {
  const list = $('trkList');
  const v = trkView;
  const lvl = (t) => (t.level === 'mid' ? 1 : 0);
  const byCompany = (a, b) => a.company.localeCompare(b.company);
  const rows = allTracks
    .filter((t) => !v.role || t.role === v.role)
    .sort((a, b) => {
      if (v.sort === 'progress') {
        const pa = a.q_total ? a.q_done / a.q_total : 0;
        const pb = b.q_total ? b.q_done / b.q_total : 0;
        return pa - pb || byCompany(a, b);
      }
      if (v.sort === 'level-asc') return lvl(a) - lvl(b) || byCompany(a, b);
      return byCompany(a, b);
    });

  if (!rows.length) {
    list.replaceChildren();
    say($('trkListMsg'), 'No tracks match that filter. Widen it.');
    return;
  }
  say($('trkListMsg'), '');
  list.replaceChildren(...rows.map(trackCard));
}

function trkWireControls() {
  const apply = () => {
    trkView.role = $('trkRole').value;
    trkView.sort = $('trkSort').value;
    trkRender();
  };
  ['trkRole', 'trkSort'].forEach((id) => $(id).addEventListener('change', apply));
}

export async function loadTracks() {
  const list = $('trkList');
  list.textContent = 'Loading tracks.';
  try {
    const { tracks } = await api('/api/tracks');
    allTracks = tracks || [];
    if (!trkWired) {
      trkWireControls();
      wireDetail();
      trkWired = true;
    }
    list.textContent = '';
    if (!allTracks.length) {
      list.textContent = 'No tracks yet.';
      return;
    }
    trkRender();
  } catch (err) {
    list.textContent = '';
    say($('trkListMsg'), err.message, 'err');
  }
}

/* -------------------------------------------------------------- detail */

export async function openTrack(slug) {
  try {
    const { track, questions } = await api(`/api/tracks/${encodeURIComponent(slug)}`);
    current = { meta: { company: track.company, title: track.title, slug: track.slug }, questions };

    $('trkDetailLogo').textContent = initials(track.company);
    $('trkDetailTitle').textContent = `${track.company} — ${track.title}`;
    $('trkDetailMeta').textContent = `${ROLE_LABEL[track.role] ?? track.role} / ${track.level}`;
    $('trkDetailBlurb').textContent = track.blurb;

    // Rounds.
    const rounds = $('trkRounds');
    rounds.replaceChildren(
      ...track.rounds.map((r) => {
        const li = document.createElement('li');
        const name = document.createElement('strong');
        name.textContent = r.name;
        const what = document.createElement('span');
        what.textContent = r.what;
        li.append(name, what);
        return li;
      }),
    );

    // Focus.
    const focus = $('trkFocus');
    focus.replaceChildren(
      ...track.focus.map((f) => {
        const li = document.createElement('li');
        li.textContent = f;
        return li;
      }),
    );

    // Prep.
    $('trkPrep').replaceChildren(
      (() => {
        const tag = document.createElement('span');
        tag.className = 'track-prep-tag';
        tag.textContent = 'How to prep';
        return tag;
      })(),
      (() => {
        const p = document.createElement('p');
        p.textContent = track.prep;
        return p;
      })(),
    );

    // The run: curated questions in order, each with difficulty and whether the
    // candidate has already got it solid.
    $('trkRunNote').textContent = questions.length
      ? `${questions.length} question${questions.length > 1 ? 's' : ''}, in the order a prep run would take them.`
      : 'No questions available in this track right now.';
    $('trkStart').disabled = !questions.length;

    const qs = $('trkQs');
    qs.replaceChildren(
      ...questions.map((q, i) => {
        const li = document.createElement('li');
        li.className = 'track-q';

        const n = document.createElement('span');
        n.className = 'track-q-n';
        n.textContent = String(i + 1);

        const mid = document.createElement('div');
        mid.className = 'track-q-mid';
        const prompt = document.createElement('p');
        prompt.className = 'track-q-prompt';
        prompt.textContent = q.prompt;
        const meta = document.createElement('p');
        meta.className = 'track-q-meta';
        meta.textContent =
          `${ROLE_LABEL[q.role] ?? q.role} / ${q.level} / ${q.topic}` +
          (q.difficulty ? ` · ${DIFF_LABEL[q.difficulty]}` : '') +
          (q.follow_up_count ? ` · ${q.follow_up_count} follow-up${q.follow_up_count > 1 ? 's' : ''}` : '');
        mid.append(prompt, meta);

        li.append(n, mid);
        if (q.last_rating) {
          const state = document.createElement('span');
          state.className = 'track-q-state s-' + q.last_rating;
          state.textContent =
            q.last_rating === 'got_it' ? 'solid' : q.last_rating === 'shaky' ? 'shaky' : 'missed';
          li.append(state);
        }
        return li;
      }),
    );
    return true;
  } catch (err) {
    say($('trkListMsg'), err.message, 'err');
    return false;
  }
}

function wireDetail() {
  $('trkStart').addEventListener('click', () => {
    if (current?.questions?.length) onStartRun(current.questions, current.meta);
  });
}
