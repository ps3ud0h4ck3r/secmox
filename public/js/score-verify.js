// Public SecMox Score verify page. Reads ?id=, fetches the result, renders it.
// No login: the holder shares the link deliberately.

const ROLE = {
  soc: 'SOC Analyst',
  pentest: 'Penetration Tester',
  network: 'Network Security',
  cloud: 'Cloud Security',
  grc: 'GRC',
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

function message(text) {
  const card = document.getElementById('card');
  card.replaceChildren(brand(), el('p', 'verify-sub', text));
}

async function load() {
  const id = new URLSearchParams(location.search).get('id');
  if (!id) return message('No score specified.');

  let data;
  try {
    const res = await fetch(`/api/score/r/${encodeURIComponent(id)}`);
    if (res.status === 404) return message('That score could not be found.');
    if (!res.ok) return message('Could not load this score right now.');
    data = await res.json();
  } catch {
    return message('Could not load this score right now.');
  }

  const card = document.getElementById('card');
  card.replaceChildren();
  card.append(brand());
  card.append(el('p', 'verify-label', `${ROLE[data.role] || data.role} readiness`));
  card.append(el('div', `verify-big band-${data.band}`, String(data.score)));
  card.append(el('p', 'verify-band', `${data.band} · out of 1000`));
  card.append(el('p', 'verify-sub', `${data.correct} of ${data.total} correct`));

  const meta = el('div', 'verify-meta');
  const when = new Date(data.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  meta.append(document.createTextNode(`Taken ${when} · `));
  const link = el('a', null, 'secmox.com');
  link.href = '/';
  meta.append(link);
  card.append(meta);

  card.append(
    el(
      'p',
      'verify-note',
      'A SecMox Score comes from a timed test of objective, auto-graded questions ' +
        'for this role. It measures interview readiness, not certified competence.',
    ),
  );
}

load();
