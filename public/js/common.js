// Shared by the practice app and the admin page.

export const $ = (id) => document.getElementById(id);

const EYE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="2.6"/></svg>';
const EYE_OFF =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M10.6 6.1A9.9 9.9 0 0 1 12 5.5c6.4 0 10 6.5 10 6.5a18 18 0 0 1-3.3 4.1"/><path d="M6.4 7.6A17.6 17.6 0 0 0 2 12s3.6 6.5 10 6.5a9.8 9.8 0 0 0 3.9-.8"/><path d="M9.8 10a2.6 2.6 0 0 0 3.5 3.6"/></svg>';

// Every password field gets a reveal control, built here so no page repeats it.
export function wirePasswordToggles(root = document) {
  root.querySelectorAll('.pw').forEach((wrap) => {
    if (wrap.querySelector('.peek')) return;
    const input = wrap.querySelector('input');
    if (!input) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'peek';
    btn.innerHTML = EYE;
    btn.setAttribute('aria-label', 'Show password');
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', () => {
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      btn.innerHTML = showing ? EYE : EYE_OFF;
      btn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
      btn.setAttribute('aria-pressed', String(!showing));
      input.focus({ preventScroll: true });
    });
    wrap.append(btn);
  });
}

export async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...options,
  });
  let body = null;
  try {
    body = await res.json();
  } catch (_) {
    /* no body */
  }
  if (!res.ok) {
    const err = new Error(body?.error || body?.message || 'Something went wrong. Try again.');
    err.status = res.status;
    throw err;
  }
  return body;
}

export function say(el, text, kind) {
  el.textContent = text || '';
  el.className = 'msg' + (kind ? ' ' + kind : '');
}

export const ROLE_LABEL = {
  soc: 'SOC analyst',
  pentest: 'Penetration testing',
  network: 'Network security',
  cloud: 'Cloud security',
  grc: 'GRC',
};
