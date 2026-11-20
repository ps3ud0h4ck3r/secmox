// The one orchestrated moment on the page: the log types itself out, the
// interviewer asks, and the clock starts. Everything else on the page is
// still, which is what makes this read as the point rather than as decoration.

const LOG = [
  { t: 'cmd', s: '$ tail -f /var/log/auth.log' },
  { t: 'n', s: 'Nov 19 02:14:07 web-03 sshd[20481]: Failed password for root from 103.84.22.17 port 59122 ssh2' },
  { t: 'n', s: 'Nov 19 02:14:09 web-03 sshd[20483]: Failed password for root from 103.84.22.17 port 59130 ssh2' },
  { t: 'n', s: 'Nov 19 02:14:11 web-03 sshd[20486]: Failed password for admin from 103.84.22.17 port 59141 ssh2' },
  { t: 'hit', s: 'Nov 19 02:14:14 web-03 sshd[20490]: Accepted password for deploy from 103.84.22.17 port 59158 ssh2' },
  { t: 'hit', s: 'Nov 19 02:14:15 web-03 sudo: deploy : TTY=pts/0 ; USER=root ; COMMAND=/usr/bin/curl' },
];

const logEl = document.getElementById('log');
const askEl = document.getElementById('ask');
const clockEl = document.getElementById('clock');
const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function line(item) {
  const span = document.createElement('span');
  if (item.t === 'cmd') span.className = 'cmd';
  if (item.t === 'hit') span.className = 'hit';
  span.textContent = item.s + '\n';
  logEl.append(span);
}

function startClock() {
  let left = 161;
  const tick = () => {
    const m = Math.floor(left / 60);
    const s = left % 60;
    clockEl.textContent = m + ':' + String(s).padStart(2, '0');
    if (left > 0) {
      left -= 1;
      setTimeout(tick, 1000);
    }
  };
  tick();
}

if (calm) {
  LOG.forEach(line);
  askEl.hidden = false;
} else {
  let i = 0;
  const next = () => {
    if (i < LOG.length) {
      line(LOG[i]);
      i += 1;
      setTimeout(next, i === 1 ? 380 : 230);
    } else {
      askEl.hidden = false;
      startClock();
    }
  };
  setTimeout(next, 400);
}

/* ------------------------------------------------------------ scrolling */

// The pinned section: the panel crossing the middle of the viewport decides
// which name is lit. An observer with a thin band in the middle does this
// without a scroll handler, so it costs nothing while the page sits still.
const words = new Map(
  [...document.querySelectorAll('.pin-stack span')].map((el) => [el.dataset.mode, el]),
);
const panels = [...document.querySelectorAll('.pin-panel')];

if (words.size && panels.length) {
  const light = (mode) => {
    for (const [key, el] of words) el.classList.toggle('on', key === mode);
  };
  light(panels[0].dataset.mode);
  const band = new IntersectionObserver(
    (entries) => {
      for (const e of entries) if (e.isIntersecting) light(e.target.dataset.mode);
    },
    { rootMargin: '-45% 0px -45% 0px', threshold: 0 },
  );
  for (const panel of panels) band.observe(panel);
}

// The hero hands the screen over: it is sticky, the next section rides up
// over it, and its content fades as that happens. The fade is a paused Web
// Animations keyframe seeked by scroll position, not an inline style, so
// style-src stays strict and the work stays off the main thread's style
// recalc path.
const heroInner = document.querySelector('.hero-sec .wrap');

if (heroInner && !calm && typeof heroInner.animate === 'function') {
  // It drifts up at about two thirds of the scroll speed while it fades, so
  // the section riding over it catches up and covers it. Fading in place
  // instead leaves a long empty band between the faded hero and the incoming
  // edge, and fading too slowly lets the edge cut a headline in half.
  const recede = heroInner.animate(
    [
      { opacity: 1, transform: 'translateY(0)', offset: 0 },
      { opacity: 0, transform: 'translateY(-104px)', offset: 0.34 },
      { opacity: 0, transform: 'translateY(-230px)', offset: 1 },
    ],
    { duration: 1000, fill: 'both', easing: 'linear' },
  );
  recede.pause();

  let queued = false;
  const seek = () => {
    queued = false;
    const over = Math.min(1, Math.max(0, window.scrollY / window.innerHeight));
    recede.currentTime = over * 1000;
    heroInner.classList.toggle('spent', over > 0.34);
  };
  const onScroll = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(seek);
  };
  seek();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
}
