// Public candidate profile at /u/<handle>. Shows the candidate's best SecMox
// Score per role, each with a verify link. Read-only, no login: the candidate
// claimed this handle to share it.

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

function message(text) {
  card().replaceChildren(brand(), el('p', 'verify-sub', text));
}

function roleRow(r) {
  const a = el('a', 'profile-role');
  a.href = r.code ? `/score/?code=${encodeURIComponent(r.code)}` : '#';
  if (!r.code) a.removeAttribute('href');
  const left = el('div', 'profile-role-left');
  left.append(el('span', 'profile-role-name', r.position || ROLE[r.role] || r.role));
  const sub = el('span', 'profile-role-sub');
  if (typeof r.percentile === 'number') sub.textContent = `Top ${100 - r.percentile}% · ${r.fresh ? 'current' : 'dated'}`;
  else sub.textContent = r.fresh ? 'current' : 'dated';
  left.append(sub);
  a.append(left);
  const right = el('div', 'profile-role-right');
  right.append(el('span', `profile-role-score band-${r.band}`, String(r.score)));
  if (r.code) right.append(el('span', 'profile-role-verify', 'Verify'));
  a.append(right);
  return a;
}

function render(data) {
  const c = card();
  c.replaceChildren();
  c.append(brand());
  c.append(el('p', 'verify-name', data.name || data.handle));
  c.append(el('p', 'verify-label', 'SecMox profile'));

  if (!data.roles || !data.roles.length) {
    c.append(el('p', 'verify-sub', 'No scores to show yet.'));
  } else {
    if (data.top_fit) {
      const tf = data.top_fit;
      const banner = el('div', 'profile-topfit');
      banner.append(el('span', 'profile-topfit-label', 'Strongest demonstrated fit'));
      banner.append(el('span', 'profile-topfit-role', tf.position || ROLE[tf.role] || tf.role));
      const sub =
        `SecMox Score ${tf.score}, ${tf.band}` +
        (typeof tf.percentile === 'number' ? `, top ${100 - tf.percentile}%` : '');
      banner.append(el('span', 'profile-topfit-sub', sub));
      c.append(banner);
    }
    const list = el('div', 'profile-roles');
    for (const r of data.roles) list.append(roleRow(r));
    c.append(list);
  }

  const meta = el('div', 'verify-meta');
  meta.append(document.createTextNode('Scores on '));
  const link = el('a', null, 'secmox.com');
  link.href = '/';
  meta.append(link);
  c.append(meta);

  c.append(
    el(
      'p',
      'verify-note',
      'Each score comes from a timed, scenario-based test for that role, auto-graded on how far the ' +
        'candidate reasons through each incident. Tap a role to verify that score. Measures interview ' +
        'readiness, not certified competence; the name is self-declared.',
    ),
  );
}

async function load() {
  const handle = location.pathname.replace(/^\/u\//, '').replace(/\/+$/, '').toLowerCase();
  if (!handle) return message('No profile specified.');
  try {
    const res = await fetch(`/api/profile/${encodeURIComponent(handle)}`);
    if (res.status === 404) return message('No such profile.');
    if (!res.ok) return message('Could not load this profile right now.');
    render(await res.json());
  } catch {
    message('Could not load this profile right now.');
  }
}

load();
