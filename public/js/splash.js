// The transition screen, used wherever the app makes someone wait: signing in,
// creating an account, opening a lab or a practical.
//
// Two rules it follows, because a splash that breaks either one is worse than
// no splash at all:
//
//   1. It never adds waiting. The work starts first and runs underneath. The
//      screen clears as soon as both the work and one short beat are done, so
//      a fast network sees the beat and a slow one sees the screen hold.
//   2. It always clears. Removal runs off a timer, not an animationend event,
//      because prefers-reduced-motion cancels every animation in this codebase
//      and an event that never fires would leave the overlay stuck on screen.

const FULL_MS = 1250;   // the whole draw, for a sign in or a new account
const QUICK_MS = 520;   // opening a lab or a practical, which happens a lot
const FADE_MS = 280;

const calm = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const MARK = `<svg class="splash-mark" viewBox="0 0 32 32" aria-hidden="true">
  <path class="ring" d="M16 2 L28 9 V23 L16 30 L4 23 V9 Z"/>
  <path class="core" d="M11 13 L16 10 L21 13 V19 L16 22 L11 19 Z"/>
</svg>`;

function build(note) {
  const el = document.createElement('div');
  el.className = 'splash';
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
 * @param {boolean} [opts.quick]  the short version, for in-app navigation
 * @returns {Promise} resolves with whatever `work` resolved to
 */
export async function splash({ work, note, quick } = {}) {
  const beat = calm() ? 220 : (quick ? QUICK_MS : FULL_MS);
  const el = build(note);
  document.body.append(el);
  // one frame before the run class, so the start state is painted first and
  // the animation does not get skipped
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('run')));

  let result, failure;
  try {
    [result] = await Promise.all([Promise.resolve(work), wait(beat)]);
  } catch (err) {
    failure = err;
    await wait(beat);
  }

  el.classList.add('out');
  await wait(calm() ? 0 : FADE_MS);
  el.remove();

  if (failure) throw failure;
  return result;
}
