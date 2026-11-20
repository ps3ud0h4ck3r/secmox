// The transition screen, used wherever the app makes someone wait: signing in,
// creating an account, restoring a session, opening a lab or a practical.
//
// Timing is not in this file. splash.css sets --beat, --hold and --fade on the
// element and every keyframe step is a fraction of --beat, so the drawing
// always completes whatever the beat is. This module just reads those three
// numbers back off the element and waits. Change the feel in the stylesheet.
//
// Two rules it keeps:
//
//   1. The work starts first and runs underneath, so a slow request holds the
//      screen rather than making someone wait twice.
//   2. It always clears. Removal runs off a timer, never an animationend
//      event, because prefers-reduced-motion cancels every animation in this
//      codebase and an event that never fires would strand the overlay.

const MARK = `<svg class="splash-mark" viewBox="0 0 32 32" aria-hidden="true">
  <path class="ring" d="M16 2 L28 9 V23 L16 30 L4 23 V9 Z"/>
  <path class="core" d="M11 13 L16 10 L21 13 V19 L16 22 L11 19 Z"/>
</svg>`;

function build(note, quick) {
  const el = document.createElement('div');
  el.className = quick ? 'splash quick' : 'splash';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.innerHTML = `<div class="splash-lock">
      <div class="splash-row">${MARK}
        <div class="splash-word">
          <span class="splash-text">SECMOX</span>
          <span class="splash-rule"></span>
        </div>
      </div>
      <p class="splash-note">${note || ''}</p>
    </div>`;
  if (!note) el.querySelector('.splash-note').remove();
  return el;
}

// a CSS time off the element, in milliseconds
function cssMs(el, name) {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return 0;
  return v.endsWith('ms') ? n : n * 1000;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Show the transition screen while `work` runs.
 *
 * @param {object}  opts
 * @param {Promise} [opts.work]   what is actually happening. Rejections are
 *                                handed back to the caller after the screen
 *                                clears, so a failed sign in still shows its
 *                                own error on a visible form.
 * @param {string}  [opts.note]   mono line under the lockup
 * @param {boolean} [opts.quick]  the shorter beat, for in-app navigation
 * @returns {Promise} resolves with whatever `work` resolved to
 */
export async function splash({ work, note, quick } = {}) {
  const el = build(note, quick);
  document.body.append(el);

  const floor = cssMs(el, '--beat') + cssMs(el, '--hold');
  const fade = cssMs(el, '--fade');

  // one frame before the run class, so the start state is painted first and
  // the animation does not get skipped
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('run')));

  let result, failure;
  try {
    [result] = await Promise.all([Promise.resolve(work), wait(floor)]);
  } catch (err) {
    failure = err;
    await wait(floor);
  }

  el.classList.add('out');
  await wait(fade);
  el.remove();

  if (failure) throw failure;
  return result;
}
