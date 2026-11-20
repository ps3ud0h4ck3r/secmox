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
