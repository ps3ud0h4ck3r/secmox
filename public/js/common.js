// Shared by the practice app and the admin page.

export const $ = (id) => document.getElementById(id);

const EYE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="2.6"/></svg>';
const EYE_OFF =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M10.6 6.1A9.9 9.9 0 0 1 12 5.5c6.4 0 10 6.5 10 6.5a18 18 0 0 1-3.3 4.1"/><path d="M6.4 7.6A17.6 17.6 0 0 0 2 12s3.6 6.5 10 6.5a9.8 9.8 0 0 0 3.9-.8"/><path d="M9.8 10a2.6 2.6 0 0 0 3.5 3.6"/></svg>';

// The reveal animation: a matrix-style decode (characters scramble through
// glyphs and resolve left to right) crossed with a glitch (RGB-split ghosts and
// a slice jitter, both from CSS), in the site's neon. It plays inside the field
// only, over an overlay that masks the input while it runs.
const GLYPHS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789$#%&@*+=<>/|{}';
const glyph = () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
const reduceMotion = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// The scrambling text is wrapped in a span whose data-t the CSS ::before/::after
// read for the colour-split ghosts, so no inline style is needed (CSP-safe).
function pwPaint(fx, text) {
  const span = document.createElement('span');
  span.className = 'pw-fx-g';
  span.textContent = text;
  span.setAttribute('data-t', text);
  fx.replaceChildren(span);
}

function pwReveal(input, fx, done) {
  const showing = input.type === 'text';
  // Target is the plaintext on show, bullets on hide.
  const target = showing ? input.value : '•'.repeat(input.value.length);
  const len = target.length;
  if (!len || reduceMotion()) {
    done();
    return;
  }
  const frames = 13;
  let f = 0;
  fx.classList.add('on');
  const iv = setInterval(() => {
    f += 1;
    const resolved = Math.floor((f / frames) * len);
    let out = '';
    for (let i = 0; i < len; i++) {
      out +=
        i < resolved
          ? target[i]
          : target[i] === '•' && Math.random() > 0.5
            ? '•'
            : glyph();
    }
    pwPaint(fx, out);
    if (f >= frames) {
      clearInterval(iv);
      pwPaint(fx, target);
      setTimeout(() => {
        fx.classList.remove('on');
        fx.replaceChildren();
        done();
      }, 70);
    }
  }, 32);
}

// Every password field gets a reveal control, built here so no page repeats it.
export function wirePasswordToggles(root = document) {
  root.querySelectorAll('.pw').forEach((wrap) => {
    if (wrap.querySelector('.peek')) return;
    const input = wrap.querySelector('input');
    if (!input) return;

    const fx = document.createElement('div');
    fx.className = 'pw-fx';
    fx.setAttribute('aria-hidden', 'true');
    wrap.append(fx);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'peek';
    btn.innerHTML = EYE;
    btn.setAttribute('aria-label', 'Show password');
    btn.setAttribute('aria-pressed', 'false');
    let busy = false;
    btn.addEventListener('click', () => {
      if (busy) return;
      busy = true;
      pwReveal(input, fx, () => {
        const showing = input.type === 'text';
        input.type = showing ? 'password' : 'text';
        btn.innerHTML = showing ? EYE : EYE_OFF;
        btn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
        btn.setAttribute('aria-pressed', String(!showing));
        input.focus({ preventScroll: true });
        busy = false;
      });
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
  if (el && !el.hasAttribute('aria-live')) {
    // Announce this status line to screen readers when it changes.
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('role', 'status');
  }
  el.textContent = text || '';
  el.className = 'msg' + (kind ? ' ' + kind : '');
}

// Mark every status line present at load as a polite live region, so the
// attribute is in place before its text first changes. say() covers any added
// later, but having it up front makes the first update announce reliably.
function markLiveRegions() {
  for (const el of document.querySelectorAll('.msg')) {
    if (!el.hasAttribute('aria-live')) {
      el.setAttribute('aria-live', 'polite');
      el.setAttribute('role', 'status');
    }
  }
}
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', markLiveRegions);
  } else {
    markLiveRegions();
  }
}

export const ROLE_LABEL = {
  soc: 'SOC analyst',
  pentest: 'Penetration testing',
  network: 'Network security',
  cloud: 'Cloud security',
  grc: 'GRC',
};
