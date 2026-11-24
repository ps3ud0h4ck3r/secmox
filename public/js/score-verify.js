// Public SecMox Score verify portal. Reads ?code= (or an older ?id=), fetches the
// scorecard and renders it: who the candidate is, the role they tested for, the
// score, and where they were strong and weak. With no code it shows an entry box,
// so an HR reader can land here and type the code from a resume. No login: the
// holder shares the code deliberately.

const ROLE = {
  soc: 'SOC Analyst',
  pentest: 'Penetration Tester',
  network: 'Network Security',
  cloud: 'Cloud Security',
  grc: 'GRC / Security Risk',
};

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

function brand() {
  const b = el('div', 'verify-brand');
  b.innerHTML =
    '<svg viewBox="0 0 32 32" aria-hidden="true">' +
    '<path d="M16 2 L28 9 V23 L16 30 L4 23 V9 Z" fill="none" stroke="#29B6FF" stroke-width="2"/>' +
    '<path d="M11 13 L16 10 L21 13 V19 L16 22 L11 19 Z" fill="#29B6FF"/></svg>';
  b.append(document.createTextNode('SecMox'));
  return b;
}

const card = () => document.getElementById('card');

function message(text, keepForm) {
  const c = card();
  c.replaceChildren(brand(), el('p', 'verify-sub', text));
  if (keepForm) c.append(form());
}

// The code-entry portal.
function form() {
  const wrap = el('form', 'verify-form');
  wrap.append(el('label', 'verify-form-label', 'Enter a SecMox Score code to verify'));
  const row = el('div', 'verify-form-row');
  const input = el('input', 'verify-input');
  input.type = 'text';
  input.placeholder = 'e.g. SMX-SOC-K7Q2M';
  input.setAttribute('aria-label', 'SecMox Score code');
  input.autocapitalize = 'characters';
  input.spellcheck = false;
  const btn = el('button', 'btn', 'Verify');
  btn.type = 'submit';
  row.append(input, btn);
  wrap.append(row);
  wrap.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = input.value.trim();
    if (code) location.search = `?code=${encodeURIComponent(code)}`;
  });
  return wrap;
}

function depthRow(s) {
  const row = el('div', 'verify-sc');
  row.append(el('span', 'verify-sc-title', s.title));
  const bar = el('div', 'verify-sc-bar');
  const fill = el('div', 'verify-sc-fill');
  const pct = s.step_count ? Math.round((s.depth / s.step_count) * 100) : 0;
  fill.style.width = `${pct}%`;
  bar.append(fill);
  row.append(bar);
  row.append(el('span', 'verify-sc-num', `${s.depth}/${s.step_count}`));
  return row;
}

function tagList(cls, label, items) {
  const box = el('div', `verify-tags ${cls}`);
  box.append(el('p', 'verify-tags-label', label));
  const list = el('div', 'verify-tag-row');
  for (const t of items) list.append(el('span', 'verify-tag', t));
  box.append(list);
  return box;
}

function renderCard(data) {
  const c = card();
  c.replaceChildren();
  c.append(brand());

  if (data.name) c.append(el('p', 'verify-name', data.name));
  c.append(el('p', 'verify-label', `${data.position || ROLE[data.role] || data.role} · SecMox Score`));
  c.append(el('div', `verify-big band-${data.band}`, String(data.score)));
  c.append(el('p', 'verify-band', `${data.band} · out of 1000`));
  c.append(el('p', 'verify-sub', `${data.correct} of ${data.total} steps correct`));
  if (data.code) c.append(el('p', 'verify-code', data.code));

  if (Array.isArray(data.scenarios) && data.scenarios.length) {
    const metrics = el('div', 'verify-metrics');
    metrics.append(el('p', 'verify-section', 'How far they climbed each scenario'));
    for (const s of data.scenarios) metrics.append(depthRow(s));
    c.append(metrics);
  }

  if (data.strengths?.length) c.append(tagList('is-strong', 'Strengths', data.strengths));
  if (data.weaknesses?.length) c.append(tagList('is-weak', 'Weak spots', data.weaknesses));

  const meta = el('div', 'verify-meta');
  const when = new Date(data.date).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  meta.append(document.createTextNode(`Taken ${when} · `));
  const link = el('a', null, 'secmox.com');
  link.href = '/';
  meta.append(link);
  c.append(meta);

  c.append(
    el(
      'p',
      'verify-note',
      'A SecMox Score comes from a timed, scenario-based test for this role, auto-graded on how ' +
        'far the candidate reasons through each incident. It measures interview readiness, not ' +
        'certified competence. The name is self-declared by the candidate.',
    ),
  );

  const again = el('details', 'verify-again');
  again.append(el('summary', null, 'Verify another code'));
  again.append(form());
  c.append(again);
}

async function load() {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  const id = params.get('id');
  if (!code && !id) return message('Verify a SecMox Score a candidate shared with you.', true);

  const url = code ? `/api/score/v/${encodeURIComponent(code)}` : `/api/score/r/${encodeURIComponent(id)}`;
  let data;
  try {
    const res = await fetch(url);
    if (res.status === 404) return message('No score matches that code. Check it and try again.', true);
    if (!res.ok) return message('Could not load this score right now.', true);
    data = await res.json();
  } catch {
    return message('Could not load this score right now.', true);
  }
  renderCard(data);
}

load();
