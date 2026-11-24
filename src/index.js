import { Hono } from 'hono';
import {
  SESSION_COOKIE,
  SESSION_DAYS,
  consumeResetToken,
  createResetToken,
  createSession,
  destroyAllSessions,
  destroySession,
  emailLooksValid,
  hashNewPassword,
  newId,
  normalizeEmail,
  passwordProblem,
  randomHex,
  rateLimit,
  purgeThrottle,
  readCookie,
  sessionCookie,
  sha256Hex,
  throttleCheck,
  throttleClear,
  throttleFail,
  userForToken,
  isContentAdmin,
  verifyPassword,
} from './auth.js';
import { mailConfigured, resetEmail, verifyEmail, inviteEmail, sendMail, sendMailBatch } from './mail.js';
import { fillChain } from './vars.js';
import {
  RATING_WEIGHT,
  nextReview,
  inDays,
  readinessBand,
  gradeObjective,
  objectiveScore,
  scoreBand,
  confidenceGapLabel,
  chainDepth,
  chainsScore,
  POSITION,
  ROLE_TAG,
  CODE_ALPHABET,
  normalizeCode,
  strengthsWeaknesses,
} from './scoring.js';

const app = new Hono();

const TRACKS = new Set(['fresher', 'mid', 'exploring']);
const ROLES = new Set(['soc', 'pentest', 'network', 'cloud', 'grc']);
const LEVELS = new Set(['fresher', 'mid']);
const RATINGS = new Set(['got_it', 'shaky', 'missed']);

const fail = (c, status, message) => c.json({ error: message }, status);
const tokenFrom = (c) => readCookie(c.req.header('cookie'), SESSION_COOKIE);
const clientIp = (c) => c.req.header('cf-connecting-ip') || 'unknown';
const nowIso = () => new Date().toISOString();

// A 429 with a Retry-After header, phrased for a person rather than a crawler.
const tooMany = (c, seconds) => {
  const mins = Math.ceil(seconds / 60);
  c.header('Retry-After', String(seconds));
  return fail(c, 429, `Too many attempts. Try again in about ${mins} minute${mins > 1 ? 's' : ''}.`);
};

// Guard an open auth route against abuse. Returns a 429 response to return
// early, or null to carry on. Each limit keeps its own namespace in the throttle
// table. Housekeeping runs occasionally so stale rows do not pile up.
async function guardAuth(c, limits) {
  if (Math.random() < 0.02) {
    await purgeThrottle(c.env.DB).catch(() => {});
  }
  for (const [key, limit, windowMinutes] of limits) {
    const wait = await rateLimit(c.env.DB, key, limit, windowMinutes);
    if (wait) return tooMany(c, wait);
  }
  return null;
}

/* --------------------------------------------------------------- headers */

app.use('*', async (c, next) => {
  // One id per request, surfaced on the response and carried into any error log
  // so a report ("it broke, id abc123") can be traced to the exact line.
  const reqId = crypto.randomUUID();
  c.set('reqId', reqId);
  await next();
  const h = c.res.headers;
  h.set('X-Request-Id', reqId);
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  h.set('X-Frame-Options', 'DENY');
  h.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  h.set('Cross-Origin-Opener-Policy', 'same-origin');
  // API responses are never a page and never cached.
  if (new URL(c.req.url).pathname.startsWith('/api/')) {
    h.set('Cache-Control', 'no-store');
  }
});

// Anything a handler throws lands here: logged as one structured line (captured
// by Workers observability) and returned to the caller without leaking
// internals. The request id ties the two together.
app.onError((err, c) => {
  const reqId = c.get('reqId') || 'unknown';
  const status = Number.isInteger(err?.status) ? err.status : 500;
  console.error(
    JSON.stringify({
      at: new Date().toISOString(),
      level: 'error',
      reqId,
      method: c.req.method,
      path: new URL(c.req.url).pathname,
      status,
      name: err?.name,
      message: err?.message,
      stack: err?.stack,
    }),
  );
  const body =
    status < 500
      ? { error: err?.message || 'Request failed.' }
      : { error: 'Something went wrong on our end. Quote this id if you get in touch.', id: reqId };
  return c.json(body, status, { 'X-Request-Id': reqId });
});

/* ------------------------------------------------------------- sessions */

const OPEN_ROUTES = new Set([
  '/api/auth/signup',
  '/api/auth/login',
  '/api/auth/forgot',
  '/api/auth/reset',
  // Clicked from a confirmation email, before the person is necessarily signed in.
  '/api/auth/verify',
  // Reading an invite needs only the token, which is itself the secret, so the
  // invitee can see who invited them before they have an account. Accepting
  // still requires being signed in as the invited email.
  '/api/invites/preview',
]);

app.use('/api/*', async (c, next) => {
  const pathname = new URL(c.req.url).pathname;
  if (OPEN_ROUTES.has(pathname)) return next();
  // A published SecMox Score is meant to be shared, so its verify endpoint is
  // public. Only the GET under this prefix; starting and submitting a run stay
  // behind auth.
  if (
    c.req.method === 'GET' &&
    (pathname.startsWith('/api/score/r/') ||
      pathname.startsWith('/api/score/v/') ||
      pathname.startsWith('/api/profile/'))
  )
    return next();
  const user = await userForToken(c.env.DB, tokenFrom(c));
  if (!user) return fail(c, 401, 'Sign in to continue.');
  c.set('user', user);
  return next();
});

app.use('/api/admin/*', async (c, next) => {
  if (!c.get('user')?.is_admin) return fail(c, 403, 'Not your area.');
  return next();
});

// The platform console. Any platform role reaches it; what each can do inside is
// gated per route. While impersonating, the effective platform_role is the
// target's (usually none), so the console closes until you exit view-as, which
// is the right behaviour: managing the platform is not something you do wearing
// someone else's face.
const PLATFORM_ROLES = new Set(['owner', 'developer', 'business']);
app.use('/api/console/*', async (c, next) => {
  if (!PLATFORM_ROLES.has(c.get('user')?.platform_role)) return fail(c, 403, 'Not your area.');
  return next();
});

function signIn(c, token) {
  c.header('Set-Cookie', sessionCookie(token, SESSION_DAYS * 86400));
}

/* -------------------------------------------------------------- score */

// How many scenario chains a run draws. Not a fixed number: each run picks a
// random count in this range (capped by how many scenarios the role has), so the
// length of the test varies, and because scenarios differ in depth the total
// question count lands anywhere from a short set to a long one.
const SCORE_CHAINS_MIN = 2;
const SCORE_CHAINS_MAX = 4;

function pickChainCount(available) {
  const hi = Math.min(SCORE_CHAINS_MAX, available);
  const lo = Math.min(SCORE_CHAINS_MIN, hi);
  if (hi <= lo) return hi;
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

// A short, resume-friendly credential code, unique across all scores.
function codeBody(len) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let s = '';
  for (const b of bytes) s += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return s;
}
async function uniqueCode(db, role) {
  const tag = ROLE_TAG[role] || 'GEN';
  for (let i = 0; i < 6; i++) {
    const code = `SMX-${tag}-${codeBody(6)}`;
    const hit = await db.prepare('SELECT 1 FROM score_results WHERE code = ?').bind(code).first();
    if (!hit) return code;
  }
  return `SMX-${tag}-${codeBody(8)}`; // vanishingly unlikely fallback
}

// Trim a self-declared candidate name to something safe to print on a card.
function cleanName(raw) {
  return String(raw || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

// Create a verification token and email the confirm link. Best-effort: never
// blocks the flow it is called from, and quietly no-ops if mail is not set up.
async function sendVerification(c, userId, email) {
  try {
    const token = randomHex(20);
    const now = Date.now();
    await c.env.DB.prepare(
      'INSERT INTO email_verifications (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
    )
      .bind(token, userId, new Date(now).toISOString(), new Date(now + 3 * 86400000).toISOString())
      .run();
    const link = `${new URL(c.req.url).origin}/api/auth/verify?token=${token}`;
    const { subject, text } = verifyEmail(link);
    await sendMail(c.env, { to: email, subject, text });
  } catch {
    // Verification is a nudge, not a gate; a failure here must not break signup.
  }
}

// A public profile handle: lowercase, starts alphanumeric, 3-24 chars.
function validHandle(h) {
  return typeof h === 'string' && /^[a-z0-9][a-z0-9-]{2,23}$/.test(h);
}

// Start a run: the scenario chains for a role, with the answer key stripped from
// every step. The candidate climbs each ladder; depth is scored on submit.
app.get('/api/score/chains', async (c) => {
  const role = c.req.query('role');
  if (!ROLES.has(role)) return fail(c, 400, 'Unknown role.');
  const avail = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM score_chains WHERE role = ? AND org_id IS NULL`,
  )
    .bind(role)
    .first();
  const n = pickChainCount(avail?.n || 0);
  const rows = await c.env.DB.prepare(
    `SELECT id, title, scenario, difficulty, steps FROM score_chains
       WHERE role = ? AND org_id IS NULL ORDER BY RANDOM() LIMIT ?`,
  )
    .bind(role, n)
    .all();
  // Strip answer keys, then fill the scenario's placeholder variables with fresh
  // values so no two attempts look identical.
  const chains = (rows.results || []).map((r) =>
    fillChain({
      id: r.id,
      title: r.title,
      scenario: r.scenario,
      difficulty: r.difficulty,
      steps: JSON.parse(r.steps).map((s) => ({
        label: s.label || null,
        prompt: s.prompt,
        type: s.type,
        options: s.options,
      })),
    }),
  );
  return c.json({ role, count: chains.length, chains });
});

// Grade the run server-side (the client never holds the answer keys). For each
// chain, depth is how far the candidate climbed before the first wrong step; the
// score weights depth by difficulty. Store under a shareable id.
app.post('/api/score/submit', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => null);
  const role = body?.role;
  if (!ROLES.has(role)) return fail(c, 400, 'Unknown role.');
  const name = cleanName(body?.name);
  const runs = Array.isArray(body?.runs) ? body.runs : [];
  const ids = [...new Set(runs.map((r) => r?.id).filter((x) => typeof x === 'string'))].slice(0, 20);
  if (!ids.length) return fail(c, 400, 'No answers to grade.');

  const placeholders = ids.map(() => '?').join(',');
  const rows = await c.env.DB.prepare(
    `SELECT id, title, difficulty, steps FROM score_chains
       WHERE role = ? AND org_id IS NULL AND id IN (${placeholders})`,
  )
    .bind(role, ...ids)
    .all();
  const byId = new Map((rows.results || []).map((r) => [r.id, r]));

  const chainResults = [];
  const review = [];
  let totalSteps = 0;
  let totalCorrect = 0;
  for (const run of runs) {
    const ch = byId.get(run?.id);
    if (!ch) continue;
    const steps = JSON.parse(ch.steps);
    const choices = Array.isArray(run.answers) ? run.answers : [];
    const stepCorrects = steps.map((st, i) => gradeObjective(st.type, st.answer, choices[i]));
    const depth = chainDepth(stepCorrects);
    const correct = stepCorrects.filter(Boolean).length;
    totalSteps += steps.length;
    totalCorrect += correct;
    chainResults.push({ stepCount: steps.length, depth, weight: ch.difficulty || 1 });
    review.push({
      id: ch.id,
      title: ch.title,
      depth,
      step_count: steps.length,
      steps: steps.map((st, i) => ({ correct: stepCorrects[i], answer: st.answer, explain: st.explain || '' })),
    });
  }
  if (!chainResults.length) return fail(c, 400, 'No valid chains.');

  const score = chainsScore(chainResults);
  const band = scoreBand(score);
  const id = randomHex(16);
  const code = await uniqueCode(c.env.DB, role);
  // Store a compact per-scenario breakdown so the verify page can show metrics
  // and derive strengths and weaknesses without re-grading.
  const summary = review.map((r) => ({ title: r.title, depth: r.depth, step_count: r.step_count }));
  const detail = JSON.stringify({ band, chains: summary });
  await c.env.DB.prepare(
    `INSERT INTO score_results (id, user_id, role, score, items_total, items_correct, detail, code, candidate_name, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, user.id, role, score, totalSteps, totalCorrect, detail, code, name || null, nowIso())
    .run();

  return c.json({ id, code, role, score, band, correct: totalCorrect, total: totalSteps, review });
});

// A learner's own recent runs, best per role first for the dashboard.
app.get('/api/score/mine', async (c) => {
  const user = c.get('user');
  const rows = await c.env.DB.prepare(
    `SELECT id, code, role, score, items_total, items_correct, created_at
       FROM score_results WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
  )
    .bind(user.id)
    .all();
  const runs = (rows.results || []).map((r) => ({
    id: r.id,
    code: r.code || null,
    role: r.role,
    score: r.score,
    band: scoreBand(r.score),
    total: r.items_total,
    correct: r.items_correct,
    date: r.created_at,
  }));
  return c.json({ runs });
});

// Build the public scorecard from a stored result. The holder shares the code or
// link deliberately, so the self-declared name and the per-scenario breakdown are
// shown. The email never is.
function scorecard(row) {
  let band = scoreBand(row.score);
  let chains = [];
  try {
    const d = JSON.parse(row.detail || '{}');
    if (d.band) band = d.band;
    if (Array.isArray(d.chains)) chains = d.chains;
  } catch {
    // An older row without a breakdown still yields the headline numbers.
  }
  const { strengths, weaknesses } = strengthsWeaknesses(chains);
  // Freshness is a trust signal: a score goes stale, so a reader should see
  // whether it is recent. Ninety days is the line between current and dated.
  const ageMs = Date.now() - new Date(row.created_at).getTime();
  const fresh = Number.isFinite(ageMs) ? ageMs < 90 * 86400000 : true;
  return {
    code: row.code || null,
    name: row.candidate_name || null,
    role: row.role,
    position: POSITION[row.role] || row.role,
    score: row.score,
    band,
    total: row.items_total,
    correct: row.items_correct,
    scenarios: chains.map((ch) => ({ title: ch.title, depth: ch.depth, step_count: ch.step_count })),
    strengths,
    weaknesses,
    date: row.created_at,
    timed: true, // the Score test is always timed and auto-graded
    fresh,
  };
}

// Where a score sits against everyone else who took that role's test. Only
// meaningful once enough people have taken it, so it is withheld below a floor.
const BENCH_MIN = 20;
async function benchmark(db, role, score) {
  const r = await db
    .prepare(
      `SELECT COUNT(*) AS total, SUM(CASE WHEN score <= ? THEN 1 ELSE 0 END) AS below
         FROM score_results WHERE role = ?`,
    )
    .bind(score, role)
    .first();
  const total = r?.total || 0;
  if (total < BENCH_MIN) return { percentile: null, sample_size: total };
  return { percentile: Math.round(((r.below || 0) / total) * 100), sample_size: total };
}

const SCORECARD_COLS =
  'role, score, items_total, items_correct, detail, code, candidate_name, created_at';

// Verify by the memorable code: what an HR reader types into the portal.
app.get('/api/score/v/:code', async (c) => {
  // Public and unauthenticated, so rate-limit by IP: a code is short, and the
  // card shows a name, so mass guessing must be made impractical.
  const blocked = await guardAuth(c, [[`verify:ip:${clientIp(c)}`, 40, 10]]);
  if (blocked) return blocked;
  const code = normalizeCode(c.req.param('code'));
  if (!code) return fail(c, 400, 'Enter a code.');
  const row = await c.env.DB.prepare(`SELECT ${SCORECARD_COLS} FROM score_results WHERE code = ?`)
    .bind(code)
    .first();
  if (!row) return fail(c, 404, 'No score matches that code.');
  const bench = await benchmark(c.env.DB, row.role, row.score);
  return c.json({ ...scorecard(row), ...bench });
});

// Verify by the share link's id (back-compatible with older links).
app.get('/api/score/r/:id', async (c) => {
  const blocked = await guardAuth(c, [[`verify:ip:${clientIp(c)}`, 40, 10]]);
  if (blocked) return blocked;
  const row = await c.env.DB.prepare(`SELECT ${SCORECARD_COLS} FROM score_results WHERE id = ?`)
    .bind(c.req.param('id'))
    .first();
  if (!row) return fail(c, 404, 'No such score.');
  const bench = await benchmark(c.env.DB, row.role, row.score);
  return c.json({ ...scorecard(row), ...bench });
});

/* ---------------------------------------------------- email verification */

// Clicked from the confirmation email. Marks the address verified and bounces
// back into the app, verified flag or not.
app.get('/api/auth/verify', async (c) => {
  const base = new URL(c.req.url).origin;
  const token = c.req.query('token') || '';
  if (!token) return c.redirect(`${base}/app/?verified=0`, 302);
  const row = await c.env.DB.prepare(
    'SELECT user_id, expires_at FROM email_verifications WHERE token = ?',
  )
    .bind(token)
    .first();
  if (!row || new Date(row.expires_at) < new Date()) {
    if (row) await c.env.DB.prepare('DELETE FROM email_verifications WHERE token = ?').bind(token).run();
    return c.redirect(`${base}/app/?verified=0`, 302);
  }
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').bind(row.user_id),
    c.env.DB.prepare('DELETE FROM email_verifications WHERE user_id = ?').bind(row.user_id),
  ]);
  return c.redirect(`${base}/app/?verified=1`, 302);
});

// Re-send the confirmation email, for the nudge banner. Rate-limited per account.
app.post('/api/auth/resend-verification', async (c) => {
  const user = c.get('user');
  if (user.email_verified) return c.json({ ok: true, already: true });
  const blocked = await guardAuth(c, [[`verify-resend:${user.id}`, 3, 60]]);
  if (blocked) return blocked;
  await c.env.DB.prepare('DELETE FROM email_verifications WHERE user_id = ?').bind(user.id).run();
  await sendVerification(c, user.id, user.email);
  return c.json({ ok: true, mail: mailConfigured(c.env) });
});

/* ------------------------------------------------------- public profile */

// Claim or change a public profile handle and the name it shows.
app.post('/api/profile/claim', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => null);
  const handle = String(body?.handle || '').toLowerCase().trim();
  if (!validHandle(handle)) {
    return fail(
      c,
      400,
      'Handle must be 3-24 characters: lowercase letters, numbers or dashes, starting with a letter or number.',
    );
  }
  const display = cleanName(body?.display_name) || user.display_name || null;
  const clash = await c.env.DB.prepare('SELECT id FROM users WHERE handle = ? AND id != ?')
    .bind(handle, user.id)
    .first();
  if (clash) return fail(c, 409, 'That handle is already taken.');
  await c.env.DB.prepare('UPDATE users SET handle = ?, display_name = ? WHERE id = ?')
    .bind(handle, display, user.id)
    .run();
  return c.json({ ok: true, handle, display_name: display });
});

// Public profile by handle: the candidate's best score per role, each with a
// verify code. Email is never shown. Rate-limited like the other public reads.
app.get('/api/profile/:handle', async (c) => {
  const blocked = await guardAuth(c, [[`profile:ip:${clientIp(c)}`, 60, 10]]);
  if (blocked) return blocked;
  const handle = String(c.req.param('handle') || '').toLowerCase();
  const u = await c.env.DB.prepare('SELECT id, handle, display_name FROM users WHERE handle = ?')
    .bind(handle)
    .first();
  if (!u) return fail(c, 404, 'No such profile.');
  const rows = await c.env.DB.prepare(
    'SELECT role, score, code, detail, created_at FROM score_results WHERE user_id = ? ORDER BY score DESC',
  )
    .bind(u.id)
    .all();
  const best = new Map();
  for (const r of rows.results || []) if (!best.has(r.role)) best.set(r.role, r);
  const roles = [];
  for (const r of best.values()) {
    let band = scoreBand(r.score);
    try {
      const d = JSON.parse(r.detail || '{}');
      if (d.band) band = d.band;
    } catch {
      /* older rows carry only the headline */
    }
    const bench = await benchmark(c.env.DB, r.role, r.score);
    const ageMs = Date.now() - new Date(r.created_at).getTime();
    roles.push({
      role: r.role,
      position: POSITION[r.role] || r.role,
      score: r.score,
      band,
      code: r.code || null,
      date: r.created_at,
      fresh: ageMs < 90 * 86400000,
      percentile: bench.percentile,
    });
  }
  roles.sort((a, b) => b.score - a.score);
  return c.json({ handle: u.handle, name: u.display_name || null, roles });
});

/* ------------------------------------------- company post-mortem packs */

const cleanText = (raw, max) =>
  String(raw || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

// A candidate logs a question they were actually asked. Starts pending; an admin
// approves it into the shared pack. Rate-limited so the queue cannot be flooded.
app.post('/api/reports', async (c) => {
  const user = c.get('user');
  const blocked = await guardAuth(c, [[`report:${user.id}`, 20, 60]]);
  if (blocked) return blocked;
  const body = await c.req.json().catch(() => null);
  const company = cleanText(body?.company, 60);
  const role = body?.role;
  const question = cleanText(body?.question, 1000);
  const askedOn = cleanText(body?.asked_on, 24) || null;
  if (!company) return fail(c, 400, 'Which company asked it?');
  if (!ROLES.has(role)) return fail(c, 400, 'Pick a role.');
  if (question.length < 10) return fail(c, 400, 'Add the question (at least 10 characters).');
  await c.env.DB.prepare(
    `INSERT INTO interview_reports (id, user_id, company, role, question, asked_on, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
  )
    .bind(newId('rep'), user.id, company, role, question, askedOn, nowIso())
    .run();
  return c.json({ ok: true, status: 'pending' });
});

// Companies that have approved questions, with counts, for the browse picker.
app.get('/api/reports/companies', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT company, COUNT(*) AS n FROM interview_reports
      WHERE status = 'approved' GROUP BY company ORDER BY n DESC, company LIMIT 100`,
  ).all();
  return c.json({ companies: results ?? [] });
});

// The candidate's own submissions, any status, so they can see what they added.
app.get('/api/reports/mine', async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare(
    `SELECT id, company, role, question, asked_on, status, created_at
       FROM interview_reports WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`,
  )
    .bind(user.id)
    .all();
  return c.json({ reports: results ?? [] });
});

// Browse the approved pack, optionally by company and role.
app.get('/api/reports', async (c) => {
  const where = ["status = 'approved'"];
  const args = [];
  const company = cleanText(c.req.query('company'), 60);
  const role = c.req.query('role');
  if (company) {
    where.push('company = ?');
    args.push(company);
  }
  if (ROLES.has(role)) {
    where.push('role = ?');
    args.push(role);
  }
  const { results } = await c.env.DB.prepare(
    `SELECT id, company, role, question, asked_on, created_at
       FROM interview_reports WHERE ${where.join(' AND ')}
      ORDER BY created_at DESC LIMIT 200`,
  )
    .bind(...args)
    .all();
  return c.json({ reports: results ?? [] });
});

// Admin moderation: the pending queue (or any status), and approve/hide.
app.get('/api/admin/reports', async (c) => {
  const status = c.req.query('status') || 'pending';
  const { results } = await c.env.DB.prepare(
    `SELECT r.id, r.company, r.role, r.question, r.asked_on, r.status, r.created_at, u.email
       FROM interview_reports r JOIN users u ON u.id = r.user_id
      WHERE r.status = ? ORDER BY r.created_at DESC LIMIT 200`,
  )
    .bind(status)
    .all();
  return c.json({ reports: results ?? [] });
});

app.post('/api/admin/reports/:id', async (c) => {
  const id = c.req.param('id');
  const status = (await c.req.json().catch(() => null))?.status;
  if (!['approved', 'hidden', 'pending'].includes(status)) return fail(c, 400, 'Unknown status.');
  const r = await c.env.DB.prepare('UPDATE interview_reports SET status = ? WHERE id = ?')
    .bind(status, id)
    .run();
  if (!r.meta.changes) return fail(c, 404, 'No such report.');
  return c.json({ ok: true, id, status });
});

/* ----------------------------------------------------------------- auth */

app.post('/api/auth/signup', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return fail(c, 400, 'Send JSON.');

  const email = normalizeEmail(body.email);
  if (!emailLooksValid(email)) return fail(c, 400, 'That email does not look right.');

  // Cap how many accounts one address or one network can open in an hour, so the
  // table of users cannot be flooded from a single source.
  const blocked = await guardAuth(c, [
    [`signup:ip:${clientIp(c)}`, 5, 60],
    [`signup:email:${email}`, 3, 60],
  ]);
  if (blocked) return blocked;

  const problem = passwordProblem(body.password);
  if (problem) return fail(c, 400, problem);

  const track = TRACKS.has(body.track) ? body.track : 'fresher';

  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?')
    .bind(email)
    .first();
  if (existing) return fail(c, 409, 'That email is already registered. Sign in instead.');

  const { salt, hash, iterations } = await hashNewPassword(body.password);
  const id = newId('usr');
  await c.env.DB.prepare(
    `INSERT INTO users (id, email, password_hash, password_salt, iterations, track, is_admin, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
  )
    .bind(id, email, hash, salt, iterations, track, nowIso())
    .run();

  const { token } = await createSession(c.env.DB, id);
  signIn(c, token);
  await sendVerification(c, id, email);
  return c.json({ user: { id, email, track, is_admin: false, email_verified: false } }, 201);
});

app.post('/api/auth/login', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return fail(c, 400, 'Send JSON.');

  const email = normalizeEmail(body.email);
  const keys = [`ip:${clientIp(c)}`, `email:${email}`];

  const lockedFor = await throttleCheck(c.env.DB, keys);
  if (lockedFor) return tooMany(c, lockedFor);

  const user = await c.env.DB.prepare(
    'SELECT id, email, track, is_admin, platform_role, password_hash, password_salt, iterations FROM users WHERE email = ?',
  )
    .bind(email)
    .first();

  // Same message either way: whether an address is registered is not public.
  const wrong = async () => {
    await throttleFail(c.env.DB, keys);
    return fail(c, 401, 'Email or password is wrong.');
  };
  if (!user) return wrong();
  if (!(await verifyPassword(body.password ?? '', user))) return wrong();

  await throttleClear(c.env.DB, keys);
  const { token } = await createSession(c.env.DB, user.id);
  signIn(c, token);
  return c.json({
    user: {
      id: user.id,
      email: user.email,
      track: user.track,
      platform_role: user.platform_role ?? null,
      is_admin: isContentAdmin(user.platform_role),
    },
  });
});

app.post('/api/auth/logout', async (c) => {
  await destroySession(c.env.DB, tokenFrom(c));
  c.header('Set-Cookie', sessionCookie('', 0));
  return c.json({ ok: true });
});

app.post('/api/auth/logout-all', async (c) => {
  await destroyAllSessions(c.env.DB, c.get('user').id);
  c.header('Set-Cookie', sessionCookie('', 0));
  return c.json({ ok: true });
});

// Exit view-as. This lives outside the /api/console guard on purpose: while
// impersonating, the effective role is the target's, so a guarded route would
// refuse the very call that ends the impersonation. It checks the real actor
// instead, carried alongside the effective user.
app.post('/api/impersonate/stop', async (c) => {
  const user = c.get('user');
  if (!user.impersonating || !user.actor) return c.json({ ok: true });
  const sid = await sha256Hex(tokenFrom(c));
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE sessions SET impersonating_user_id = NULL WHERE id = ?').bind(sid),
    c.env.DB
      .prepare(
        `UPDATE impersonation_log SET ended_at = ?
          WHERE id = (SELECT id FROM impersonation_log
                       WHERE actor_id = ? AND target_id = ? AND ended_at IS NULL
                       ORDER BY started_at DESC LIMIT 1)`,
      )
      .bind(nowIso(), user.actor.id, user.id),
  ]);
  return c.json({ ok: true });
});

// Always the same answer, whether or not the address is registered.
app.post('/api/auth/forgot', async (c) => {
  const body = await c.req.json().catch(() => null);
  const email = normalizeEmail(body?.email);
  const said = { ok: true, message: 'If that address has an account, a reset link is on its way.' };
  if (!emailLooksValid(email)) return c.json(said);

  // This route sends mail, so it is a way to flood an inbox or burn through the
  // mail quota. Cap it per network and, tighter, per target address. The cap is
  // on the submitted address alone, so a 429 here still says nothing about
  // whether that address has an account.
  const blocked = await guardAuth(c, [
    [`forgot:ip:${clientIp(c)}`, 5, 15],
    [`forgot:email:${email}`, 3, 60],
  ]);
  if (blocked) return blocked;

  const user = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (!user) return c.json(said);

  const { token } = await createResetToken(c.env.DB, user.id);
  const link = `${new URL(c.req.url).origin}/app/?reset=${token}`;
  const { subject, text } = resetEmail(link);
  const result = await sendMail(c.env, { to: email, subject, text });

  if (!result.sent) {
    // Do not claim an email went out when it did not.
    return c.json({
      ok: false,
      message: mailConfigured(c.env)
        ? 'Could not send the email just now. Try again shortly.'
        : 'Password reset by email is not switched on yet. Ask the team to reset it for you.',
    }, 503);
  }
  return c.json(said);
});

app.post('/api/auth/reset', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return fail(c, 400, 'Send JSON.');

  // Reset tokens are long random hex, so guessing is already hopeless, but cap
  // submissions per network anyway to keep anyone from hammering the endpoint.
  const blocked = await guardAuth(c, [[`reset:ip:${clientIp(c)}`, 10, 15]]);
  if (blocked) return blocked;

  const problem = passwordProblem(body.password);
  if (problem) return fail(c, 400, problem);

  const userId = await consumeResetToken(c.env.DB, body.token);
  if (!userId) return fail(c, 400, 'That reset link has expired or has already been used.');

  const { salt, hash, iterations } = await hashNewPassword(body.password);
  await c.env.DB.prepare(
    'UPDATE users SET password_hash = ?, password_salt = ?, iterations = ? WHERE id = ?',
  )
    .bind(hash, salt, iterations, userId)
    .run();

  // A reset means the old password may be in someone else's hands.
  await destroyAllSessions(c.env.DB, userId);
  const { token } = await createSession(c.env.DB, userId);
  signIn(c, token);
  return c.json({ ok: true });
});

app.post('/api/auth/password', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => null);
  if (!body) return fail(c, 400, 'Send JSON.');

  const problem = passwordProblem(body.next);
  if (problem) return fail(c, 400, problem);

  // Changing the password checks the current one, so it is a guess surface for
  // anyone who already has the session. Cap it per account.
  const blocked = await guardAuth(c, [[`pwchange:uid:${user.id}`, 10, 15]]);
  if (blocked) return blocked;

  const row = await c.env.DB.prepare(
    'SELECT password_hash, password_salt, iterations FROM users WHERE id = ?',
  )
    .bind(user.id)
    .first();
  if (!row || !(await verifyPassword(body.current ?? '', row))) {
    return fail(c, 401, 'Current password is wrong.');
  }

  const { salt, hash, iterations } = await hashNewPassword(body.next);
  await c.env.DB.prepare(
    'UPDATE users SET password_hash = ?, password_salt = ?, iterations = ? WHERE id = ?',
  )
    .bind(hash, salt, iterations, user.id)
    .run();

  await destroyAllSessions(c.env.DB, user.id);
  const { token } = await createSession(c.env.DB, user.id);
  signIn(c, token);
  return c.json({ ok: true });
});

app.post('/api/account/delete', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => null);

  const row = await c.env.DB.prepare(
    'SELECT password_hash, password_salt, iterations FROM users WHERE id = ?',
  )
    .bind(user.id)
    .first();
  if (!row || !(await verifyPassword(body?.password ?? '', row))) {
    return fail(c, 401, 'Password is wrong.');
  }

  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM attempts WHERE user_id = ?').bind(user.id),
    c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id),
    c.env.DB.prepare('DELETE FROM password_resets WHERE user_id = ?').bind(user.id),
    c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user.id),
  ]);
  c.header('Set-Cookie', sessionCookie('', 0));
  return c.json({ ok: true });
});

app.get('/api/me', async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare(
    `SELECT m.org_id, m.role, o.name, o.slug, o.logo
       FROM org_members m JOIN orgs o ON o.id = m.org_id
      WHERE m.user_id = ? ORDER BY o.name`,
  )
    .bind(user.id)
    .all();
  return c.json({ user: { ...user, orgs: results ?? [] } });
});

// The role a candidate is aiming for. Progress toward it is just that role's
// readiness, read on the dashboard. Null clears it.
app.post('/api/me/target', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => null);
  const role = body?.role ? String(body.role) : null;
  if (role !== null && !ROLES.has(role)) return fail(c, 400, 'Unknown role.');
  await c.env.DB.prepare('UPDATE users SET target_role = ? WHERE id = ?').bind(role, user.id).run();
  return c.json({ ok: true, target_role: role });
});

// First-run onboarding: the learner names the role they are aiming for and
// their level, and we mark them onboarded so it never shows again. role and
// level are optional (skip still onboards), but validated when present.
app.post('/api/me/onboard', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const role = body?.role ? String(body.role) : null;
  const level = body?.level ? String(body.level) : null;
  if (role !== null && !ROLES.has(role)) return fail(c, 400, 'Unknown role.');
  if (level !== null && !TRACKS.has(level)) return fail(c, 400, 'Unknown level.');

  const sets = ['onboarded_at = ?'];
  const args = [nowIso()];
  if (role !== null) { sets.push('target_role = ?'); args.push(role); }
  if (level !== null) { sets.push('track = ?'); args.push(level); }
  args.push(user.id);
  await c.env.DB.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).bind(...args).run();
  return c.json({ ok: true, target_role: role ?? user.target_role ?? null, track: level ?? user.track });
});

/* ------------------------------------------ bookmarks, reports, search */

// The ids the learner has saved, so the star shows the right state wherever a
// question appears (fresh practice, a weak drill, a track run).
app.get('/api/bookmarks', async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare(
    'SELECT question_id FROM bookmarks WHERE user_id = ? ORDER BY created_at DESC',
  )
    .bind(user.id)
    .all();
  return c.json({ ids: (results ?? []).map((r) => r.question_id) });
});

// Toggle a bookmark. Only a question the learner can actually see can be saved.
app.post('/api/questions/:id/bookmark', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const q = await c.env.DB.prepare(
    `SELECT q.id FROM questions q WHERE q.id = ? AND ${visibleSql('q', 'question')}`,
  )
    .bind(id, user.id, user.id)
    .first();
  if (!q) return fail(c, 404, 'No such question.');
  const existing = await c.env.DB.prepare(
    'SELECT 1 AS x FROM bookmarks WHERE user_id = ? AND question_id = ?',
  )
    .bind(user.id, id)
    .first();
  if (existing) {
    await c.env.DB.prepare('DELETE FROM bookmarks WHERE user_id = ? AND question_id = ?')
      .bind(user.id, id)
      .run();
    return c.json({ bookmarked: false });
  }
  await c.env.DB.prepare('INSERT OR IGNORE INTO bookmarks (user_id, question_id, created_at) VALUES (?, ?, ?)')
    .bind(user.id, id, nowIso())
    .run();
  return c.json({ bookmarked: true });
});

const REPORT_REASONS = new Set(['wrong', 'typo', 'confusing', 'outdated', 'other']);

// Report a bad question: wrong answer, typo, confusing, stale. Captured for
// review rather than acted on live.
app.post('/api/questions/:id/report', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const reason = body?.reason ? String(body.reason) : '';
  if (!REPORT_REASONS.has(reason)) return fail(c, 400, 'Pick a reason.');
  const note = String(body?.note ?? '').trim().slice(0, 1000) || null;
  const q = await c.env.DB.prepare(
    `SELECT q.id FROM questions q WHERE q.id = ? AND ${visibleSql('q', 'question')}`,
  )
    .bind(id, user.id, user.id)
    .first();
  if (!q) return fail(c, 404, 'No such question.');
  await c.env.DB.prepare(
    'INSERT INTO question_reports (id, user_id, question_id, reason, note, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(newId('rep'), user.id, id, reason, note, nowIso())
    .run();
  return c.json({ ok: true });
});

// Search the bank by prompt or topic, visible questions only. The client plays
// the matches as a run, so the shape matches a question card.
app.get('/api/search', async (c) => {
  const user = c.get('user');
  const term = String(c.req.query('q') ?? '').trim().slice(0, 100);
  if (term.length < 2) return c.json({ results: [] });
  const like = '%' + term.replace(/[%_\\]/g, (m) => '\\' + m) + '%';
  const { results } = await c.env.DB.prepare(
    `SELECT q.id, q.role, q.topic, q.level, q.prompt, q.difficulty,
            (SELECT COUNT(*) FROM follow_ups f WHERE f.question_id = q.id) AS follow_up_count
       FROM questions q
      WHERE (q.prompt LIKE ? ESCAPE '\\' OR q.topic LIKE ? ESCAPE '\\')
        AND ${visibleSql('q', 'question')}
      ORDER BY q.role, q.level, q.topic
      LIMIT 25`,
  )
    .bind(like, like, user.id, user.id)
    .all();
  return c.json({ results: results ?? [] });
});

// Dashboard aggregates that readiness does not already carry: how many reviews
// are due, the last week of activity and the current streak, and the readiness
// trend. Opening the dashboard also records today's reading, so the trend grows
// a point a day.
app.get('/api/dashboard', async (c) => {
  const user = c.get('user');
  const now = nowIso();
  const vis = visibleSql('q', 'question');

  // Reviews due now, counting only questions the user can still see.
  const due = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n
       FROM review_schedule r JOIN questions q ON q.id = r.question_id
      WHERE r.user_id = ? AND r.due_at <= ? AND ${vis}`,
  )
    .bind(user.id, now, user.id, user.id)
    .first();

  // Days are the user's local days, not UTC. The client sends its offset in
  // minutes east of UTC (IST = 330); attempts are stored in UTC, so a day
  // boundary at midnight IST would otherwise land at 18:30 the day before and
  // split or merge a learner's day. No DST handling: the target users are IST,
  // which has none, and a fixed offset is correct there.
  const tzRaw = Number(c.req.query('tz'));
  const off = Number.isInteger(tzRaw) && tzRaw >= -720 && tzRaw <= 840 ? tzRaw : 0;
  const mod = `${off >= 0 ? '+' : ''}${off} minutes`;
  const localDay = (ms) => new Date(ms + off * 60000).toISOString().slice(0, 10);

  // Per-day attempt counts over the last 90 days, for the 7-day strip, the week
  // total and the streak, grouped by the user's local day.
  const ninety = new Date(Date.now() - 90 * 86400000).toISOString();
  const byDay = await c.env.DB.prepare(
    `SELECT date(created_at, ?) AS d, COUNT(*) AS n
       FROM attempts WHERE user_id = ? AND created_at >= ? GROUP BY d`,
  )
    .bind(mod, user.id, ninety)
    .all();
  const counts = new Map((byDay.results ?? []).map((r) => [r.d, r.n]));

  const activity = [];
  let weekTotal = 0;
  for (let i = 6; i >= 0; i--) {
    const day = localDay(Date.now() - i * 86400000);
    const n = counts.get(day) || 0;
    activity.push({ day, count: n });
    weekTotal += n;
  }
  let streak = 0;
  let probeMs = Date.now();
  if (!counts.has(localDay(probeMs))) probeMs -= 86400000;
  while (counts.has(localDay(probeMs))) {
    streak += 1;
    probeMs -= 86400000;
  }

  // Today's overall readiness: across every visible question, how much the user
  // can hold on their latest answer. Upsert it as today's snapshot.
  const held = await c.env.DB.prepare(
    `WITH latest AS (
       SELECT question_id, self_rating,
              ROW_NUMBER() OVER (PARTITION BY question_id ORDER BY created_at DESC, id DESC) AS rn
         FROM attempts WHERE user_id = ?
     )
     SELECT q.id, l.self_rating AS rating
       FROM questions q LEFT JOIN latest l ON l.question_id = q.id AND l.rn = 1
      WHERE ${vis}`,
  )
    .bind(user.id, user.id, user.id)
    .all();
  const rows = held.results ?? [];
  const total = rows.length;
  const points = rows.reduce((a, r) => a + (RATING_WEIGHT[r.rating] ?? 0), 0);
  const overall = total ? Math.round((points / total) * 100) : 0;
  const today = localDay(Date.now());
  if (total) {
    await c.env.DB.prepare(
      `INSERT INTO readiness_snapshots (user_id, day, readiness) VALUES (?, ?, ?)
       ON CONFLICT(user_id, day) DO UPDATE SET readiness = excluded.readiness`,
    )
      .bind(user.id, today, overall)
      .run();
  }
  const snaps = await c.env.DB.prepare(
    'SELECT day, readiness FROM readiness_snapshots WHERE user_id = ? ORDER BY day ASC',
  )
    .bind(user.id)
    .all();

  // Journey signals: has the candidate practised at all, taken any Score, and
  // claimed a public profile. Cheap, and they drive the "you are here" strip.
  const scoresTaken = await c.env.DB.prepare(
    'SELECT COUNT(*) AS n FROM score_results WHERE user_id = ?',
  )
    .bind(user.id)
    .first();
  const practiced = await c.env.DB.prepare(
    'SELECT 1 FROM attempts WHERE user_id = ? LIMIT 1',
  )
    .bind(user.id)
    .first();

  return c.json({
    target_role: user.target_role ?? null,
    due: due?.n ?? 0,
    streak,
    week_total: weekTotal,
    activity,
    overall,
    trend: (snaps.results ?? []).slice(-60),
    scores_taken: scoresTaken?.n ?? 0,
    has_practiced: Boolean(practiced),
    has_profile: Boolean(user.handle),
  });
});

// Everything the account holds, in one file. Their data, on request.
app.get('/api/account/export', async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare(
    `SELECT a.created_at, a.self_rating, a.depth_reached, a.answer,
            q.prompt, q.role, q.level, q.topic
       FROM attempts a JOIN questions q ON q.id = a.question_id
      WHERE a.user_id = ? ORDER BY a.created_at`,
  )
    .bind(user.id)
    .all();
  return c.json(
    { account: { email: user.email, track: user.track, created_at: user.created_at }, attempts: results ?? [] },
    200,
    { 'Content-Disposition': 'attachment; filename="secmox-export.json"' },
  );
});

/* ------------------------------------------------------------ questions */

function filters(c) {
  const role = c.req.query('role');
  const level = c.req.query('level');
  return { role: ROLES.has(role) ? role : null, level: LEVELS.has(level) ? level : null };
}

// Content a user may see: a global item their org has not hidden, or an item
// their own org added. A user with no org membership sees only global items, so
// for the whole current B2C base this is exactly today's behaviour. References
// <a>.org_id and <a>.id, and consumes two binds, both the user id, placed at the
// end of the WHERE so the bind order stays simple. kind is a fixed literal, never
// user input.
function visibleSql(a, kind) {
  return `((${a}.org_id IS NULL AND NOT EXISTS (
             SELECT 1 FROM org_hidden_content h JOIN org_members mh ON mh.org_id = h.org_id
              WHERE mh.user_id = ? AND h.kind = '${kind}' AND h.content_id = ${a}.id))
           OR EXISTS (SELECT 1 FROM org_members mv WHERE mv.user_id = ? AND mv.org_id = ${a}.org_id))`;
}

app.get('/api/next', async (c) => {
  const user = c.get('user');
  const { role, level } = filters(c);
  const vis = visibleSql('q', 'question');

  const where = ['1 = 1'];
  const args = [];
  if (role) {
    where.push('q.role = ?');
    args.push(role);
  }
  if (level) {
    where.push('q.level = ?');
    args.push(level);
  }
  const diff = c.req.query('difficulty');
  if (diff === '1' || diff === '2' || diff === '3') {
    where.push('q.difficulty = ?');
    args.push(Number(diff));
  }
  const clause = where.join(' AND ');

  // Weak-spots drill: only the questions whose latest rating was missed or
  // shaky, worst first, so the candidate grinds exactly what has not stuck.
  // No fresh or due fallback here; an empty pile means there is nothing to
  // drill, and the client says so rather than slipping into normal practice.
  if (c.req.query('focus') === 'weak') {
    const weak = await c.env.DB.prepare(
      `WITH latest AS (
         SELECT question_id, self_rating,
                ROW_NUMBER() OVER (PARTITION BY question_id ORDER BY created_at DESC, id DESC) AS rn
           FROM attempts WHERE user_id = ?
       )
       SELECT q.id, q.role, q.topic, q.level, q.prompt, q.difficulty
         FROM questions q
         JOIN latest l ON l.question_id = q.id AND l.rn = 1
        WHERE l.self_rating IN ('missed', 'shaky')
          AND ${clause}
          AND ${vis}
        ORDER BY CASE l.self_rating WHEN 'missed' THEN 0 ELSE 1 END ASC, RANDOM()
        LIMIT 1`,
    )
      .bind(user.id, ...args, user.id, user.id)
      .first();
    if (!weak) return c.json({ question: null, mode: 'weak' });
    const fu = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM follow_ups WHERE question_id = ?')
      .bind(weak.id)
      .first();
    return c.json({
      question: {
        id: weak.id,
        role: weak.role,
        topic: weak.topic,
        level: weak.level,
        prompt: weak.prompt,
        difficulty: weak.difficulty,
        follow_up_count: fu?.n ?? 0,
      },
      fresh: false,
      mode: 'weak',
    });
  }

  // Saved drill: only the questions the learner bookmarked, random order. Like
  // weak, no fallback — an empty pile means nothing is saved and the client
  // says so rather than slipping into normal practice.
  if (c.req.query('focus') === 'saved') {
    const saved = await c.env.DB.prepare(
      `SELECT q.id, q.role, q.topic, q.level, q.prompt, q.difficulty
         FROM questions q
         JOIN bookmarks b ON b.question_id = q.id AND b.user_id = ?
        WHERE ${clause} AND ${vis}
        ORDER BY RANDOM() LIMIT 1`,
    )
      .bind(user.id, ...args, user.id, user.id)
      .first();
    if (!saved) return c.json({ question: null, mode: 'saved' });
    const fu = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM follow_ups WHERE question_id = ?')
      .bind(saved.id)
      .first();
    return c.json({
      question: {
        id: saved.id,
        role: saved.role,
        topic: saved.topic,
        level: saved.level,
        prompt: saved.prompt,
        difficulty: saved.difficulty,
        follow_up_count: fu?.n ?? 0,
      },
      fresh: false,
      mode: 'saved',
    });
  }

  let row = await c.env.DB.prepare(
    `SELECT q.id, q.role, q.topic, q.level, q.prompt, q.difficulty
       FROM questions q
      WHERE ${clause}
        AND q.id NOT IN (SELECT question_id FROM attempts WHERE user_id = ?)
        AND ${vis}
      ORDER BY RANDOM() LIMIT 1`,
  )
    .bind(...args, user.id, user.id, user.id)
    .first();

  // mode: 'fresh' never seen, 'due' the schedule says it is time, 'review' the
  // schedule is empty or nothing is due yet so fall back to the weakest and
  // stalest. The client reads this to tell the candidate why a question is back.
  let mode = 'fresh';

  // Due: the spaced-repetition layer. Most overdue, worst last rating first. A
  // question answered this session sits days out and will not reappear here.
  if (!row) {
    row = await c.env.DB.prepare(
      `SELECT q.id, q.role, q.topic, q.level, q.prompt, q.difficulty
         FROM review_schedule s
         JOIN questions q ON q.id = s.question_id
        WHERE s.user_id = ? AND s.due_at <= ?
          AND ${clause}
          AND ${vis}
        ORDER BY CASE s.last_rating WHEN 'missed' THEN 0 WHEN 'shaky' THEN 1 ELSE 2 END ASC,
                 s.due_at ASC
        LIMIT 1`,
    )
      .bind(user.id, nowIso(), ...args, user.id, user.id)
      .first();
    if (row) mode = 'due';
  }

  // Review: nothing due (or legacy attempts with no schedule row). Keep practice
  // alive with the weakest, stalest thing rather than dead-ending.
  if (!row) {
    row = await c.env.DB.prepare(
      `SELECT q.id, q.role, q.topic, q.level, q.prompt, q.difficulty,
              MIN(CASE a.self_rating WHEN 'missed' THEN 0 WHEN 'shaky' THEN 1 ELSE 2 END) AS worst,
              MAX(a.created_at) AS last_seen
         FROM questions q
         JOIN attempts a ON a.question_id = q.id AND a.user_id = ?
        WHERE ${clause}
          AND ${vis}
        GROUP BY q.id
        ORDER BY worst ASC, last_seen ASC
        LIMIT 1`,
    )
      .bind(user.id, ...args, user.id, user.id)
      .first();
    if (row) mode = 'review';
  }

  // Safety net: the exact combo has nothing at all (e.g. a difficulty that does
  // not exist at this level). Rather than hand the user a blank screen, widen the
  // search, dropping difficulty first, then level, and tell the client what was
  // relaxed so it can show a short note. The data-driven filters should keep this
  // from happening, but a stale picker or a race should never dead-end the user.
  let relaxed = null;
  if (!row) {
    const tries = [];
    if (diff === '1' || diff === '2' || diff === '3') tries.push({ lvl: level, note: 'difficulty' });
    if (level) tries.push({ lvl: null, note: 'difficulty and level' });
    for (const t of tries) {
      const w = ['1 = 1'];
      const a = [];
      if (role) {
        w.push('q.role = ?');
        a.push(role);
      }
      if (t.lvl) {
        w.push('q.level = ?');
        a.push(t.lvl);
      }
      row = await c.env.DB.prepare(
        `SELECT q.id, q.role, q.topic, q.level, q.prompt, q.difficulty
           FROM questions q
          WHERE ${w.join(' AND ')} AND ${vis}
          ORDER BY (q.id NOT IN (SELECT question_id FROM attempts WHERE user_id = ?)) DESC, RANDOM()
          LIMIT 1`,
      )
        .bind(...a, user.id, user.id, user.id)
        .first();
      if (row) {
        relaxed = t.note;
        mode = 'relaxed';
        break;
      }
    }
  }

  if (!row) return c.json({ question: null });

  const followUps = await c.env.DB.prepare(
    'SELECT COUNT(*) AS n FROM follow_ups WHERE question_id = ?',
  )
    .bind(row.id)
    .first();

  return c.json({
    question: {
      id: row.id,
      role: row.role,
      topic: row.topic,
      level: row.level,
      prompt: row.prompt,
      difficulty: row.difficulty,
      follow_up_count: followUps?.n ?? 0,
    },
    fresh: mode === 'fresh',
    mode,
    relaxed,
  });
});

// Which levels and difficulties actually have questions (per role), so the client
// only offers filter values that can return something. Prevents the dead-end
// combo (e.g. Fresher + Hard when no such question exists).
app.get('/api/next/facets', async (c) => {
  const user = c.get('user');
  const role = c.req.query('role');
  const vis = visibleSql('q', 'question');
  const where = ['1 = 1'];
  const args = [];
  if (role && ROLES.has(role)) {
    where.push('q.role = ?');
    args.push(role);
  }
  const rows = await c.env.DB.prepare(
    `SELECT DISTINCT q.level AS level, q.difficulty AS difficulty
       FROM questions q WHERE ${where.join(' AND ')} AND ${vis}`,
  )
    .bind(...args, user.id, user.id)
    .all();
  const levels = new Set();
  const difficulties = new Set();
  const diffByLevel = {};
  for (const r of rows.results || []) {
    if (r.level) levels.add(r.level);
    if (r.difficulty) {
      difficulties.add(r.difficulty);
      (diffByLevel[r.level] ??= new Set()).add(r.difficulty);
    }
  }
  const out = {};
  for (const k of Object.keys(diffByLevel)) out[k] = [...diffByLevel[k]].sort();
  return c.json({
    role: role && ROLES.has(role) ? role : null,
    levels: [...levels],
    difficulties: [...difficulties].sort(),
    diffByLevel: out,
  });
});

// Answers stay out of the page until the candidate has committed to one.
app.get('/api/questions/:id/answer', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  // Scoped by visibility too, so another company's private question cannot be
  // opened by guessing its id.
  const question = await c.env.DB.prepare(
    `SELECT id, model_answer FROM questions q WHERE id = ? AND ${visibleSql('q', 'question')}`,
  )
    .bind(id, user.id, user.id)
    .first();
  if (!question) return fail(c, 404, 'No such question.');

  const { results } = await c.env.DB.prepare(
    'SELECT position, prompt, model_answer FROM follow_ups WHERE question_id = ? ORDER BY position',
  )
    .bind(id)
    .all();

  return c.json({ model_answer: question.model_answer, follow_ups: results ?? [] });
});

// The widening ladder. A got-it moves the question one rung further out; a
// shaky brings it back to a couple of days; a missed puts it on tomorrow. The
// rungs are days, capped so nothing drifts past about a quarter.

app.post('/api/attempts', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => null);
  if (!body) return fail(c, 400, 'Send JSON.');
  if (!RATINGS.has(body.self_rating)) return fail(c, 400, 'Rate the attempt first.');

  const question = await c.env.DB.prepare('SELECT id FROM questions WHERE id = ?')
    .bind(body.question_id)
    .first();
  if (!question) return fail(c, 404, 'No such question.');

  const answer = typeof body.answer === 'string' ? body.answer.slice(0, 8000) : null;
  const depth = Number.isInteger(body.depth_reached)
    ? Math.max(0, Math.min(10, body.depth_reached))
    : 0;

  const prior = await c.env.DB.prepare(
    'SELECT reps FROM review_schedule WHERE user_id = ? AND question_id = ?',
  )
    .bind(user.id, question.id)
    .first();
  const { reps, interval_days } = nextReview(prior?.reps ?? 0, body.self_rating);

  await c.env.DB.batch([
    c.env.DB
      .prepare(
        `INSERT INTO attempts (id, user_id, question_id, answer, self_rating, depth_reached, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(newId('att'), user.id, question.id, answer, body.self_rating, depth, nowIso()),
    c.env.DB
      .prepare(
        `INSERT INTO review_schedule (user_id, question_id, reps, interval_days, due_at, last_rating, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, question_id) DO UPDATE SET
           reps = excluded.reps, interval_days = excluded.interval_days,
           due_at = excluded.due_at, last_rating = excluded.last_rating,
           updated_at = excluded.updated_at`,
      )
      .bind(user.id, question.id, reps, interval_days, inDays(interval_days), body.self_rating, nowIso()),
  ]);

  return c.json({ ok: true }, 201);
});

app.get('/api/coverage', async (c) => {
  const user = c.get('user');
  const { level } = filters(c);
  const sql = `
    SELECT q.role,
           COUNT(DISTINCT q.id)          AS total,
           COUNT(DISTINCT a.question_id) AS seen,
           SUM(CASE WHEN a.self_rating = 'missed' THEN 1 ELSE 0 END) AS missed
      FROM questions q
      LEFT JOIN attempts a ON a.question_id = q.id AND a.user_id = ?
     WHERE ${level ? 'q.level = ? AND ' : ''}${visibleSql('q', 'question')}
     GROUP BY q.role
     ORDER BY q.role`;
  const stmt = level
    ? c.env.DB.prepare(sql).bind(user.id, level, user.id, user.id)
    : c.env.DB.prepare(sql).bind(user.id, user.id, user.id);
  const { results } = await stmt.all();
  return c.json({ coverage: results ?? [] });
});

// Readiness: a per-role reading with the gaps named. There is no graded score
// yet, so this is a mirror of the candidate's own practice and self-marks, not
// an external verdict, and the client says so. "Hold" is the headline: of every
// question in the role, a got-it counts 1, a shaky a half, a missed or an
// unseen nothing, so a role is only as ready as the share you can actually hold
// cold. Depth, scenarios and labs refine it, and the weak topics are the part
// the candidate can act on.
app.get('/api/readiness', async (c) => {
  const user = c.get('user');
  const { level } = filters(c);
  const lv = level || null;

  const questionRows = await c.env.DB.prepare(
    `WITH latest AS (
       SELECT question_id, self_rating, depth_reached, created_at,
              ROW_NUMBER() OVER (PARTITION BY question_id ORDER BY created_at DESC, id DESC) AS rn
         FROM attempts WHERE user_id = ?
     )
     SELECT q.role, q.topic, q.id AS qid,
            (SELECT COUNT(*) FROM follow_ups f WHERE f.question_id = q.id) AS fu,
            l.self_rating, l.depth_reached, l.created_at AS last_at
       FROM questions q
       LEFT JOIN latest l ON l.question_id = q.id AND l.rn = 1
      WHERE ${lv ? 'q.level = ? AND ' : ''}${visibleSql('q', 'question')}`,
  )
    .bind(...(lv ? [user.id, lv, user.id, user.id] : [user.id, user.id, user.id]))
    .all();

  const scenarioRows = await c.env.DB.prepare(
    `SELECT s.role,
            COUNT(DISTINCT s.id) AS total,
            COUNT(DISTINCT CASE WHEN a.id IS NOT NULL THEN s.id END) AS done
       FROM scenarios s
       LEFT JOIN scenario_attempts a ON a.scenario_id = s.id AND a.user_id = ?
      WHERE ${lv ? 's.level = ? AND ' : ''}${visibleSql('s', 'scenario')}
      GROUP BY s.role`,
  )
    .bind(...(lv ? [user.id, lv, user.id, user.id] : [user.id, user.id, user.id]))
    .all();

  const labRows = await c.env.DB.prepare(
    `SELECT l.role,
            COUNT(DISTINCT l.id) AS total,
            COUNT(DISTINCT CASE WHEN a.id IS NOT NULL THEN l.id END) AS done
       FROM labs l
       LEFT JOIN lab_attempts a ON a.lab_id = l.id AND a.user_id = ?
      WHERE ${lv ? 'l.level = ? AND ' : ''}${visibleSql('l', 'lab')}
      GROUP BY l.role`,
  )
    .bind(...(lv ? [user.id, lv, user.id, user.id] : [user.id, user.id, user.id]))
    .all();

  const scByRole = new Map((scenarioRows.results ?? []).map((r) => [r.role, r]));
  const labByRole = new Map((labRows.results ?? []).map((r) => [r.role, r]));

  // The trustworthy signal: the latest objective SecMox Score per role. Comparing
  // it against the self-rated practice hold gives the confidence gap.
  const scoreRows = await c.env.DB.prepare(
    `SELECT role, score FROM score_results
      WHERE user_id = ? AND created_at = (
        SELECT MAX(created_at) FROM score_results s2 WHERE s2.user_id = ? AND s2.role = score_results.role
      )`,
  )
    .bind(user.id, user.id)
    .all();
  const scoreByRole = new Map((scoreRows.results ?? []).map((r) => [r.role, r.score]));

  const roles = new Map();
  for (const row of questionRows.results ?? []) {
    if (!roles.has(row.role)) {
      roles.set(row.role, { role: row.role, rows: [], topics: new Map() });
    }
    const bucket = roles.get(row.role);
    bucket.rows.push(row);
    if (!bucket.topics.has(row.topic)) {
      bucket.topics.set(row.topic, { topic: row.topic, total: 0, points: 0 });
    }
    const t = bucket.topics.get(row.topic);
    t.total += 1;
    t.points += RATING_WEIGHT[row.self_rating] ?? 0;
  }

  const readiness = [...roles.values()]
    .map((bucket) => {
      const total = bucket.rows.length;
      let points = 0;
      let seen = 0;
      const counts = { got_it: 0, shaky: 0, missed: 0 };
      let depthReached = 0;
      let depthAvailable = 0;
      let lastAt = null;

      for (const row of bucket.rows) {
        if (row.self_rating) {
          seen += 1;
          counts[row.self_rating] = (counts[row.self_rating] ?? 0) + 1;
          points += RATING_WEIGHT[row.self_rating] ?? 0;
          if (row.fu > 0) {
            depthAvailable += row.fu;
            depthReached += Math.min(row.depth_reached ?? 0, row.fu);
          }
          if (row.last_at && (!lastAt || row.last_at > lastAt)) lastAt = row.last_at;
        }
      }

      const hold = total ? Math.round((points / total) * 100) : 0;
      const sc = scByRole.get(bucket.role);
      const lab = labByRole.get(bucket.role);

      // Confidence gap: how you rate yourself (hold, from self-rated practice)
      // versus how you actually tested (the objective score, scaled to a
      // percent). Positive means you feel more ready than you are. Only read it
      // when both signals exist.
      const objScore = scoreByRole.has(bucket.role) ? scoreByRole.get(bucket.role) : null;
      const scorePct = objScore === null ? null : Math.round(objScore / 10);
      let gap = null;
      let gapLabel = null;
      if (objScore !== null && seen > 0) {
        gap = hold - scorePct;
        gapLabel = confidenceGapLabel(gap);
      }

      const weak = [...bucket.topics.values()]
        .map((t) => ({ topic: t.topic, hold: t.total ? Math.round((t.points / t.total) * 100) : 0 }))
        .sort((a, b) => a.hold - b.hold)
        .slice(0, 3);

      return {
        role: bucket.role,
        total,
        seen,
        unseen: total - seen,
        got_it: counts.got_it,
        shaky: counts.shaky,
        missed: counts.missed,
        hold,
        band: readinessBand(hold, seen),
        depth_pct: depthAvailable ? Math.round((depthReached / depthAvailable) * 100) : null,
        scenarios: { total: sc?.total ?? 0, done: sc?.done ?? 0 },
        labs: { total: lab?.total ?? 0, done: lab?.done ?? 0 },
        score: objScore,
        score_pct: scorePct,
        gap,
        gap_label: gapLabel,
        weak_topics: weak,
        last_practiced: lastAt,
      };
    })
    .sort((a, b) => a.hold - b.hold);

  return c.json({ readiness });
});

/* ----------------------------------------------------------------- labs */

const ARTIFACT_KINDS = new Set(['log', 'table']);
const MAX_ARTIFACT_BYTES = 600_000;

app.get('/api/labs', async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare(
    `SELECT l.id, l.title, l.role, l.level, l.difficulty, l.artifact_kind, l.artifact_name, l.is_free,
            (SELECT COUNT(*) FROM lab_tasks t WHERE t.lab_id = l.id) AS tasks,
            (SELECT COUNT(*) FROM lab_attempts a WHERE a.lab_id = l.id AND a.user_id = ?) AS done
       FROM labs l
      WHERE ${visibleSql('l', 'lab')}
      ORDER BY l.level, l.role, l.title`,
  )
    .bind(user.id, user.id, user.id)
    .all();
  return c.json({ labs: results ?? [] });
});

// The artifact and the tasks, but never the answers: the whole point is to
// read the evidence before being told what is in it.
app.get('/api/labs/:id', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  const lab = await c.env.DB.prepare(
    `SELECT l.id, l.title, l.role, l.level, l.brief, l.artifact_kind, l.artifact_name,
            a.body, a.bytes
       FROM labs l LEFT JOIN lab_artifacts a ON a.lab_id = l.id
      WHERE l.id = ? AND ${visibleSql('l', 'lab')}`,
  )
    .bind(id, user.id, user.id)
    .first();
  if (!lab) return fail(c, 404, 'No such lab.');

  const { results } = await c.env.DB.prepare(
    'SELECT position, prompt FROM lab_tasks WHERE lab_id = ? ORDER BY position',
  )
    .bind(id)
    .all();

  return c.json({ lab, tasks: results ?? [] });
});

app.get('/api/labs/:id/answers', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  // The answer key is a reveal route, so it carries the same wall as the lab
  // itself: another company's private lab is a 404 here, not a leak.
  const lab = await c.env.DB.prepare(
    `SELECT l.id FROM labs l WHERE l.id = ? AND ${visibleSql('l', 'lab')}`,
  )
    .bind(id, user.id, user.id)
    .first();
  if (!lab) return fail(c, 404, 'No such lab.');
  // A guided walk reveals one step at a time, so ?position=N returns just that
  // task's answer and nothing ahead of it. No position returns them all.
  const pos = c.req.query('position');
  if (pos !== undefined && pos !== '') {
    const n = Number(pos);
    if (!Number.isInteger(n)) return fail(c, 400, 'Bad position.');
    const task = await c.env.DB.prepare(
      'SELECT position, prompt, model_answer FROM lab_tasks WHERE lab_id = ? AND position = ?',
    )
      .bind(id, n)
      .first();
    if (!task) return fail(c, 404, 'No such task.');
    return c.json({ tasks: [task] });
  }
  const { results } = await c.env.DB.prepare(
    'SELECT position, prompt, model_answer FROM lab_tasks WHERE lab_id = ? ORDER BY position',
  )
    .bind(id)
    .all();
  if (!results?.length) return fail(c, 404, 'No such lab.');
  return c.json({ tasks: results });
});

app.post('/api/lab-attempts', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => null);
  if (!body) return fail(c, 400, 'Send JSON.');
  if (!RATINGS.has(body.self_rating)) return fail(c, 400, 'Rate the attempt first.');

  const lab = await c.env.DB.prepare('SELECT id FROM labs WHERE id = ?').bind(body.lab_id).first();
  if (!lab) return fail(c, 404, 'No such lab.');

  const answers = Array.isArray(body.answers)
    ? JSON.stringify(body.answers.slice(0, 20).map((a) => String(a ?? '').slice(0, 4000)))
    : null;

  await c.env.DB.prepare(
    'INSERT INTO lab_attempts (id, user_id, lab_id, answers, self_rating, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(newId('lat'), user.id, lab.id, answers, body.self_rating, nowIso())
    .run();

  return c.json({ ok: true }, 201);
});

/* ----------------------------------------------------------- scenarios */

app.get('/api/scenarios', async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare(
    `SELECT s.id, s.title, s.role, s.level, s.minutes, s.is_free,
            (SELECT COUNT(*) FROM scenario_points p WHERE p.scenario_id = s.id) AS points,
            (SELECT COUNT(*) FROM scenario_attempts a
              WHERE a.scenario_id = s.id AND a.user_id = ?) AS done,
            (SELECT MAX(a.covered) FROM scenario_attempts a
              WHERE a.scenario_id = s.id AND a.user_id = ?) AS best
       FROM scenarios s
      WHERE ${visibleSql('s', 'scenario')}
      ORDER BY s.level, s.role, s.title`,
  )
    .bind(user.id, user.id, user.id, user.id)
    .all();
  return c.json({ scenarios: results ?? [] });
});

// Recurring blind spots: rubric points the learner keeps failing to cover.
// covered_ids records what they ticked per attempt; a point in the rubric but
// not in covered_ids was missed. For a scenario attempted more than once, a
// blind spot is a point missed in the latest scored attempt and in at least
// half of all scored attempts — a pattern, not a one-off bad run. Registered
// before /api/scenarios/:id so the literal path is not swallowed as an id.
app.get('/api/scenarios/blindspots', async (c) => {
  const user = c.get('user');
  const attempts = await c.env.DB.prepare(
    `SELECT a.scenario_id, a.covered_ids, a.created_at, s.title
       FROM scenario_attempts a JOIN scenarios s ON s.id = a.scenario_id
      WHERE a.user_id = ? AND a.scored_at IS NOT NULL AND ${visibleSql('s', 'scenario')}
      ORDER BY a.created_at ASC`,
  )
    .bind(user.id, user.id, user.id)
    .all();

  // Group scored attempts by scenario, oldest to newest.
  const byScenario = new Map();
  for (const a of attempts.results ?? []) {
    let covered;
    try { covered = new Set(JSON.parse(a.covered_ids)); } catch { covered = new Set(); }
    if (!byScenario.has(a.scenario_id)) byScenario.set(a.scenario_id, { title: a.title, runs: [] });
    byScenario.get(a.scenario_id).runs.push(covered);
  }

  // Only scenarios tried more than once can show a pattern. Pull their points.
  const multi = [...byScenario.entries()].filter(([, v]) => v.runs.length >= 2);
  const spots = [];
  if (multi.length) {
    const ids = multi.map(([sid]) => sid);
    const placeholders = ids.map(() => '?').join(', ');
    const pts = await c.env.DB.prepare(
      `SELECT id, scenario_id, ord, label FROM scenario_points
        WHERE scenario_id IN (${placeholders}) ORDER BY ord`,
    )
      .bind(...ids)
      .all();
    const pointsByScenario = new Map();
    for (const p of pts.results ?? []) {
      if (!pointsByScenario.has(p.scenario_id)) pointsByScenario.set(p.scenario_id, []);
      pointsByScenario.get(p.scenario_id).push(p);
    }

    for (const [sid, { title, runs }] of multi) {
      const latest = runs[runs.length - 1];
      const total = runs.length;
      for (const p of pointsByScenario.get(sid) ?? []) {
        if (latest.has(p.id)) continue; // got it last time, not a live blind spot
        const missed = runs.reduce((n, r) => n + (r.has(p.id) ? 0 : 1), 0);
        if (missed * 2 >= total) {
          spots.push({ scenario_id: sid, point_id: p.id, scenario_title: title, label: p.label, missed, total });
        }
      }
    }
    spots.sort((a, b) => b.missed - a.missed || b.total - a.total);
  }

  return c.json({ blindspots: spots.slice(0, 12) });
});

// The brief, and the point labels only. The model answer and what each point
// is really asking for stay on the server until something has been written,
// otherwise the reveal is one network tab away and the exercise is pointless.
app.get('/api/scenarios/:id', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  const scenario = await c.env.DB.prepare(
    `SELECT id, title, role, level, situation, ask, minutes FROM scenarios s
      WHERE id = ? AND ${visibleSql('s', 'scenario')}`,
  )
    .bind(id, user.id, user.id)
    .first();
  if (!scenario) return fail(c, 404, 'No such scenario.');

  const { results } = await c.env.DB.prepare(
    'SELECT id, ord, label FROM scenario_points WHERE scenario_id = ? ORDER BY ord',
  )
    .bind(id)
    .all();
  return c.json({ scenario, points: results ?? [] });
});

// Writing is what unlocks the answer. The response is saved first and the
// reveal comes back in the same call, so there is no way to read it without
// having committed to something.
app.post('/api/scenario-attempts', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => null);
  if (!body) return fail(c, 400, 'Send JSON.');

  const response = String(body.response ?? '').trim().slice(0, 20000);
  if (response.length < 40) return fail(c, 400, 'Write your answer before revealing the rubric.');

  // Writing unlocks the rubric, but only for a scenario this user may see.
  // Without the wall here, a non-member could POST an id and read the model
  // answer of a company's private scenario straight out of the response.
  const scenario = await c.env.DB.prepare(
    `SELECT s.id, s.model_answer FROM scenarios s
      WHERE s.id = ? AND ${visibleSql('s', 'scenario')}`,
  )
    .bind(body.scenario_id, user.id, user.id)
    .first();
  if (!scenario) return fail(c, 404, 'No such scenario.');

  const { results } = await c.env.DB.prepare(
    'SELECT id, ord, label, detail FROM scenario_points WHERE scenario_id = ? ORDER BY ord',
  )
    .bind(scenario.id)
    .all();
  const points = results ?? [];

  const minutes = Number.isFinite(body.minutes) ? Math.max(0, Math.round(body.minutes)) : null;
  const attemptId = newId('sat');
  await c.env.DB.prepare(
    `INSERT INTO scenario_attempts (id, user_id, scenario_id, response, out_of, minutes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(attemptId, user.id, scenario.id, response, points.length, minutes, nowIso())
    .run();

  return c.json({ attempt_id: attemptId, model_answer: scenario.model_answer, points }, 201);
});

app.post('/api/scenario-attempts/:id/score', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  if (!body) return fail(c, 400, 'Send JSON.');

  const attempt = await c.env.DB.prepare(
    'SELECT id, scenario_id, out_of FROM scenario_attempts WHERE id = ? AND user_id = ?',
  )
    .bind(id, user.id)
    .first();
  if (!attempt) return fail(c, 404, 'No such attempt.');

  const { results } = await c.env.DB.prepare(
    'SELECT id FROM scenario_points WHERE scenario_id = ?',
  )
    .bind(attempt.scenario_id)
    .all();
  const valid = new Set((results ?? []).map((r) => r.id));
  const ticked = Array.isArray(body.covered_ids)
    ? [...new Set(body.covered_ids.map(String))].filter((pid) => valid.has(pid))
    : [];

  await c.env.DB.prepare(
    'UPDATE scenario_attempts SET covered = ?, covered_ids = ?, scored_at = ? WHERE id = ?',
  )
    .bind(ticked.length, JSON.stringify(ticked), nowIso(), attempt.id)
    .run();

  return c.json({ ok: true, covered: ticked.length, out_of: attempt.out_of });
});

/* ------------------------------------------------------- company tracks */

const parseJson = (s, fallback) => {
  try { return JSON.parse(s); } catch { return fallback; }
};

// The company tracks: curated, ordered runs of existing questions shaped around
// how a given company and role tends to interview. Optional role filter. Each
// card carries how many of its questions the candidate has already attempted,
// so progress shows without opening it.
app.get('/api/tracks', async (c) => {
  const user = c.get('user');
  const role = c.req.query('role');
  const roleOk = ROLES.has(role);
  const { results } = await c.env.DB.prepare(
    `SELECT t.id, t.slug, t.company, t.role, t.level, t.title, t.blurb, t.tier,
            json_array_length(t.question_ids) AS q_total,
            (SELECT COUNT(DISTINCT a.question_id)
               FROM attempts a
               JOIN json_each(t.question_ids) je ON je.value = a.question_id
              WHERE a.user_id = ?) AS q_done
       FROM company_tracks t
      ${roleOk ? 'WHERE t.role = ?' : ''}
      ORDER BY t.company`,
  )
    .bind(...(roleOk ? [user.id, role] : [user.id]))
    .all();
  return c.json({ tracks: results ?? [] });
});

// One track in full: its rounds, focus and prep, plus the curated questions in
// order. Questions are filtered through the same visibility gate as everywhere
// else, so a question a company has hidden from its learners simply drops out of
// the run rather than leaking in. Each question carries the candidate's last
// self-rating so the client can mark what is already solid.
app.get('/api/tracks/:slug', async (c) => {
  const user = c.get('user');
  const slug = c.req.param('slug');
  const track = await c.env.DB.prepare(
    `SELECT id, slug, company, role, level, title, blurb, tier, rounds, focus, prep, question_ids
       FROM company_tracks WHERE slug = ?`,
  )
    .bind(slug)
    .first();
  if (!track) return fail(c, 404, 'No such track.');

  const ids = parseJson(track.question_ids, []);
  let questions = [];
  if (ids.length) {
    const placeholders = ids.map(() => '?').join(', ');
    const { results } = await c.env.DB.prepare(
      `SELECT q.id, q.role, q.topic, q.level, q.prompt, q.difficulty,
              (SELECT COUNT(*) FROM follow_ups f WHERE f.question_id = q.id) AS follow_up_count
         FROM questions q
        WHERE q.id IN (${placeholders}) AND ${visibleSql('q', 'question')}`,
    )
      .bind(...ids, user.id, user.id)
      .all();
    const byId = new Map((results ?? []).map((r) => [r.id, r]));

    // Latest self-rating per question for this user, so the run can show what is
    // already solid versus still shaky.
    const rated = await c.env.DB.prepare(
      `WITH latest AS (
         SELECT question_id, self_rating,
                ROW_NUMBER() OVER (PARTITION BY question_id ORDER BY created_at DESC, id DESC) AS rn
           FROM attempts WHERE user_id = ? AND question_id IN (${placeholders})
       )
       SELECT question_id, self_rating FROM latest WHERE rn = 1`,
    )
      .bind(user.id, ...ids)
      .all();
    const ratingById = new Map((rated.results ?? []).map((r) => [r.question_id, r.self_rating]));

    // Preserve the curated order; drop anything hidden or retired.
    questions = ids
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((q) => ({ ...q, last_rating: ratingById.get(q.id) ?? null }));
  }

  return c.json({
    track: {
      slug: track.slug,
      company: track.company,
      role: track.role,
      level: track.level,
      title: track.title,
      blurb: track.blurb,
      tier: track.tier,
      rounds: parseJson(track.rounds, []),
      focus: parseJson(track.focus, []),
      prep: track.prep,
    },
    questions,
  });
});

/* ---------------------------------------------------------------- admin */

app.get('/api/admin/questions', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT q.id, q.role, q.level, q.topic, q.prompt,
            (SELECT COUNT(*) FROM follow_ups f WHERE f.question_id = q.id) AS follow_ups,
            (SELECT COUNT(*) FROM attempts a WHERE a.question_id = q.id)   AS attempts
       FROM questions q ORDER BY q.role, q.level, q.id`,
  ).all();
  return c.json({ questions: results ?? [] });
});

app.get('/api/admin/questions/:id', async (c) => {
  const id = c.req.param('id');
  const question = await c.env.DB.prepare('SELECT * FROM questions WHERE id = ?').bind(id).first();
  if (!question) return fail(c, 404, 'No such question.');
  const { results } = await c.env.DB.prepare(
    'SELECT position, prompt, model_answer FROM follow_ups WHERE question_id = ? ORDER BY position',
  )
    .bind(id)
    .all();
  return c.json({ question, follow_ups: results ?? [] });
});

function questionProblem(body) {
  if (!ROLES.has(body?.role)) return 'Pick a role.';
  if (!LEVELS.has(body?.level)) return 'Pick a level.';
  if (!body?.topic?.trim()) return 'Give it a topic.';
  if (!body?.prompt?.trim()) return 'The question itself is empty.';
  if (!body?.model_answer?.trim()) return 'Write what a strong answer covers.';
  if (!Array.isArray(body.follow_ups)) return 'Follow-ups must be a list.';
  if (body.follow_ups.length > 6) return 'Six follow-ups is already more than any interviewer asks.';
  for (const f of body.follow_ups) {
    if (!f?.prompt?.trim() || !f?.model_answer?.trim()) {
      return 'Every follow-up needs both a question and an answer.';
    }
  }
  return null;
}

app.post('/api/admin/questions', async (c) => {
  const body = await c.req.json().catch(() => null);
  const problem = questionProblem(body);
  if (problem) return fail(c, 400, problem);

  const id = body.id?.trim() || newId('q');
  const statements = [
    c.env.DB.prepare(
      `INSERT INTO questions (id, role, topic, level, prompt, model_answer, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET role = excluded.role, topic = excluded.topic,
         level = excluded.level, prompt = excluded.prompt, model_answer = excluded.model_answer`,
    ).bind(
      id,
      body.role,
      body.topic.trim(),
      body.level,
      body.prompt.trim(),
      body.model_answer.trim(),
      nowIso(),
    ),
    c.env.DB.prepare('DELETE FROM follow_ups WHERE question_id = ?').bind(id),
  ];
  body.follow_ups.forEach((f, i) => {
    statements.push(
      c.env.DB
        .prepare(
          'INSERT INTO follow_ups (id, question_id, position, prompt, model_answer) VALUES (?, ?, ?, ?, ?)',
        )
        .bind(`${id}_f${i + 1}`, id, i + 1, f.prompt.trim(), f.model_answer.trim()),
    );
  });

  await c.env.DB.batch(statements);
  return c.json({ ok: true, id });
});

app.post('/api/admin/questions/:id/delete', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM follow_ups WHERE question_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM attempts WHERE question_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM questions WHERE id = ?').bind(id),
  ]);
  return c.json({ ok: true });
});

/* ---------------------------------------------------------- admin: labs */

app.get('/api/admin/labs', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT l.id, l.title, l.role, l.level, l.artifact_kind, l.artifact_name, l.is_free,
            (SELECT COUNT(*) FROM lab_tasks t WHERE t.lab_id = l.id)      AS tasks,
            (SELECT COUNT(*) FROM lab_attempts a WHERE a.lab_id = l.id)   AS attempts,
            (SELECT bytes FROM lab_artifacts x WHERE x.lab_id = l.id)     AS bytes
       FROM labs l ORDER BY l.role, l.level, l.title`,
  ).all();
  return c.json({ labs: results ?? [] });
});

app.get('/api/admin/labs/:id', async (c) => {
  const id = c.req.param('id');
  const lab = await c.env.DB.prepare(
    `SELECT l.*, a.body FROM labs l LEFT JOIN lab_artifacts a ON a.lab_id = l.id WHERE l.id = ?`,
  )
    .bind(id)
    .first();
  if (!lab) return fail(c, 404, 'No such lab.');
  const { results } = await c.env.DB.prepare(
    'SELECT position, prompt, model_answer FROM lab_tasks WHERE lab_id = ? ORDER BY position',
  )
    .bind(id)
    .all();
  return c.json({ lab, tasks: results ?? [] });
});

function labProblem(body) {
  if (!ROLES.has(body?.role)) return 'Pick a role.';
  if (!LEVELS.has(body?.level)) return 'Pick a level.';
  if (!ARTIFACT_KINDS.has(body?.artifact_kind)) return 'Pick an artifact kind.';
  if (!body?.title?.trim()) return 'Give the lab a title.';
  if (!body?.brief?.trim()) return 'Write the brief: what the candidate has been handed, and why.';
  if (!body?.artifact_name?.trim()) return 'Name the artifact file.';
  if (!body?.artifact?.trim()) return 'The artifact is empty.';
  if (new TextEncoder().encode(body.artifact).length > MAX_ARTIFACT_BYTES) {
    return 'That artifact is too large for now. Keep it under 600 KB.';
  }
  if (body.artifact_kind === 'table' && !body.artifact.includes(',')) {
    return 'A table artifact needs comma-separated values with a header row.';
  }
  if (!Array.isArray(body.tasks) || !body.tasks.length) return 'A lab needs at least one task.';
  if (body.tasks.length > 10) return 'Ten tasks is already more than anyone finishes.';
  for (const t of body.tasks) {
    if (!t?.prompt?.trim() || !t?.model_answer?.trim()) {
      return 'Every task needs both a question and an answer.';
    }
  }
  return null;
}

app.post('/api/admin/labs', async (c) => {
  const body = await c.req.json().catch(() => null);
  const problem = labProblem(body);
  if (problem) return fail(c, 400, problem);

  const id = body.id?.trim() || newId('lab');
  const bytes = new TextEncoder().encode(body.artifact).length;

  const statements = [
    c.env.DB.prepare(
      `INSERT INTO labs (id, title, role, level, brief, artifact_kind, artifact_name, is_free, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET title = excluded.title, role = excluded.role,
         level = excluded.level, brief = excluded.brief, artifact_kind = excluded.artifact_kind,
         artifact_name = excluded.artifact_name, is_free = excluded.is_free`,
    ).bind(
      id,
      body.title.trim(),
      body.role,
      body.level,
      body.brief.trim(),
      body.artifact_kind,
      body.artifact_name.trim(),
      body.is_free ? 1 : 0,
      nowIso(),
    ),
    c.env.DB.prepare(
      `INSERT INTO lab_artifacts (lab_id, body, bytes) VALUES (?, ?, ?)
       ON CONFLICT(lab_id) DO UPDATE SET body = excluded.body, bytes = excluded.bytes`,
    ).bind(id, body.artifact, bytes),
    c.env.DB.prepare('DELETE FROM lab_tasks WHERE lab_id = ?').bind(id),
  ];
  body.tasks.forEach((t, i) => {
    statements.push(
      c.env.DB
        .prepare(
          'INSERT INTO lab_tasks (id, lab_id, position, prompt, model_answer) VALUES (?, ?, ?, ?, ?)',
        )
        .bind(`${id}_t${i + 1}`, id, i + 1, t.prompt.trim(), t.model_answer.trim()),
    );
  });

  await c.env.DB.batch(statements);
  return c.json({ ok: true, id });
});

app.post('/api/admin/labs/:id/delete', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM lab_tasks WHERE lab_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM lab_attempts WHERE lab_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM lab_artifacts WHERE lab_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM labs WHERE id = ?').bind(id),
  ]);
  return c.json({ ok: true });
});

/* ------------------------------------------------------ admin scenarios */

app.get('/api/admin/scenarios', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT s.id, s.title, s.role, s.level, s.minutes, s.is_free,
            (SELECT COUNT(*) FROM scenario_points p WHERE p.scenario_id = s.id)   AS points,
            (SELECT COUNT(*) FROM scenario_attempts a WHERE a.scenario_id = s.id) AS attempts
       FROM scenarios s ORDER BY s.role, s.level, s.title`,
  ).all();
  return c.json({ scenarios: results ?? [] });
});

app.get('/api/admin/scenarios/:id', async (c) => {
  const id = c.req.param('id');
  const scenario = await c.env.DB.prepare('SELECT * FROM scenarios WHERE id = ?')
    .bind(id)
    .first();
  if (!scenario) return fail(c, 404, 'No such scenario.');
  const { results } = await c.env.DB.prepare(
    'SELECT ord, label, detail FROM scenario_points WHERE scenario_id = ? ORDER BY ord',
  )
    .bind(id)
    .all();
  return c.json({ scenario, points: results ?? [] });
});

function scenarioProblem(body) {
  if (!ROLES.has(body?.role)) return 'Pick a role.';
  if (!LEVELS.has(body?.level)) return 'Pick a level.';
  if (!body?.title?.trim()) return 'Give the scenario a title.';
  if (!body?.situation?.trim()) return 'Write the situation: what has happened and what they are walking into.';
  if (!body?.ask?.trim()) return 'Write the ask: what the candidate has to produce.';
  const minutes = Number(body?.minutes);
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 120) {
    return 'Minutes should be a whole number between 5 and 120.';
  }
  if (!body?.model_answer?.trim()) return 'Write the model answer. It is what a strong response looks like.';
  if (!Array.isArray(body.points) || !body.points.length) return 'A scenario needs at least one scoring point.';
  if (body.points.length > 12) return 'Twelve points is already more than anyone ticks honestly.';
  for (const p of body.points) {
    if (!p?.label?.trim() || !p?.detail?.trim()) {
      return 'Every point needs both a label and the detail that earns the tick.';
    }
  }
  return null;
}

app.post('/api/admin/scenarios', async (c) => {
  const body = await c.req.json().catch(() => null);
  const problem = scenarioProblem(body);
  if (problem) return fail(c, 400, problem);

  const id = body.id?.trim() || newId('sc');
  const statements = [
    c.env.DB.prepare(
      `INSERT INTO scenarios (id, role, level, title, situation, ask, minutes, model_answer, is_free, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET role = excluded.role, level = excluded.level,
         title = excluded.title, situation = excluded.situation, ask = excluded.ask,
         minutes = excluded.minutes, model_answer = excluded.model_answer, is_free = excluded.is_free`,
    ).bind(
      id,
      body.role,
      body.level,
      body.title.trim(),
      body.situation.trim(),
      body.ask.trim(),
      Number(body.minutes),
      body.model_answer.trim(),
      body.is_free ? 1 : 0,
      nowIso(),
    ),
    c.env.DB.prepare('DELETE FROM scenario_points WHERE scenario_id = ?').bind(id),
  ];
  body.points.forEach((p, i) => {
    statements.push(
      c.env.DB
        .prepare(
          'INSERT INTO scenario_points (id, scenario_id, ord, label, detail) VALUES (?, ?, ?, ?, ?)',
        )
        .bind(`${id}_p${i + 1}`, id, i + 1, p.label.trim(), p.detail.trim()),
    );
  });

  await c.env.DB.batch(statements);
  return c.json({ ok: true, id });
});

app.post('/api/admin/scenarios/:id/delete', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM scenario_points WHERE scenario_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM scenario_attempts WHERE scenario_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM scenarios WHERE id = ?').bind(id),
  ]);
  return c.json({ ok: true });
});

app.get('/api/admin/stats', async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM users)        AS users,
            (SELECT COUNT(*) FROM questions)    AS questions,
            (SELECT COUNT(*) FROM follow_ups)   AS follow_ups,
            (SELECT COUNT(*) FROM attempts)     AS attempts,
            (SELECT COUNT(*) FROM labs)         AS labs,
            (SELECT COUNT(*) FROM lab_attempts) AS lab_attempts,
            (SELECT COUNT(*) FROM scenarios)         AS scenarios,
            (SELECT COUNT(*) FROM scenario_attempts) AS scenario_attempts`,
  ).first();
  return c.json({ stats: row, mail: mailConfigured(c.env) });
});

/* ------------------------------------------------------------- org side */

// The platform owner can manage any company; otherwise you must be an org_admin
// of this specific company. While impersonating, the effective user is the
// target, so an owner viewing as a learner is checked as that learner, which is
// right.
async function isOrgAdmin(db, user, orgId) {
  if (user.platform_role === 'owner') return true;
  const row = await db
    .prepare("SELECT 1 FROM org_members WHERE org_id = ? AND user_id = ? AND role = 'org_admin'")
    .bind(orgId, user.id)
    .first();
  return Boolean(row);
}

// A trainer or an admin may look at a company's cohorts and readiness; only an
// admin changes them.
async function isOrgStaff(db, user, orgId) {
  if (user.platform_role === 'owner') return true;
  const row = await db
    .prepare("SELECT 1 FROM org_members WHERE org_id = ? AND user_id = ? AND role IN ('org_admin', 'trainer')")
    .bind(orgId, user.id)
    .first();
  return Boolean(row);
}

const INVITE_DAYS = 14;

app.get('/api/org/:orgId/members', async (c) => {
  const orgId = c.req.param('orgId');
  if (!(await isOrgAdmin(c.env.DB, c.get('user'), orgId))) return fail(c, 403, 'Not your company.');
  const rows = await c.env.DB.prepare(
    `SELECT m.user_id, m.role, m.created_at, u.email
       FROM org_members m JOIN users u ON u.id = m.user_id
      WHERE m.org_id = ? ORDER BY m.role, u.email`,
  )
    .bind(orgId)
    .all();
  const org = await c.env.DB.prepare('SELECT id, name, slug FROM orgs WHERE id = ?').bind(orgId).first();
  return c.json({ org, members: rows.results ?? [] });
});

app.post('/api/org/:orgId/members/:userId/remove', async (c) => {
  const orgId = c.req.param('orgId');
  if (!(await isOrgAdmin(c.env.DB, c.get('user'), orgId))) return fail(c, 403, 'Not your company.');
  const userId = c.req.param('userId');

  const target = await c.env.DB.prepare(
    'SELECT role FROM org_members WHERE org_id = ? AND user_id = ?',
  )
    .bind(orgId, userId)
    .first();
  if (!target) return fail(c, 404, 'Not a member.');
  if (target.role === 'org_admin') {
    const admins = await c.env.DB.prepare(
      "SELECT COUNT(*) AS n FROM org_members WHERE org_id = ? AND role = 'org_admin'",
    )
      .bind(orgId)
      .first();
    if ((admins?.n ?? 0) <= 1) return fail(c, 409, 'That is the last admin. Make someone else an admin first.');
  }
  await c.env.DB.prepare('DELETE FROM org_members WHERE org_id = ? AND user_id = ?')
    .bind(orgId, userId)
    .run();
  return c.json({ ok: true });
});

/* ------------------------------------------------------------- cohorts */

app.get('/api/org/:orgId/cohorts', async (c) => {
  const orgId = c.req.param('orgId');
  if (!(await isOrgStaff(c.env.DB, c.get('user'), orgId))) return fail(c, 403, 'Not your company.');
  const rows = await c.env.DB.prepare(
    `SELECT ch.id, ch.name, ch.created_at,
            (SELECT COUNT(*) FROM cohort_members cm WHERE cm.cohort_id = ch.id) AS members
       FROM cohorts ch WHERE ch.org_id = ? ORDER BY ch.created_at DESC`,
  )
    .bind(orgId)
    .all();
  return c.json({ cohorts: rows.results ?? [] });
});

app.post('/api/org/:orgId/cohorts', async (c) => {
  const orgId = c.req.param('orgId');
  if (!(await isOrgAdmin(c.env.DB, c.get('user'), orgId))) return fail(c, 403, 'Not your company.');
  const body = await c.req.json().catch(() => null);
  const name = (body?.name ?? '').toString().trim().slice(0, 80);
  if (name.length < 2) return fail(c, 400, 'Give the cohort a name.');
  const id = newId('coh');
  await c.env.DB.prepare('INSERT INTO cohorts (id, org_id, name, created_at) VALUES (?, ?, ?, ?)')
    .bind(id, orgId, name, nowIso())
    .run();
  return c.json({ ok: true, id });
});

app.post('/api/org/:orgId/cohorts/:cid/delete', async (c) => {
  const orgId = c.req.param('orgId');
  if (!(await isOrgAdmin(c.env.DB, c.get('user'), orgId))) return fail(c, 403, 'Not your company.');
  const cid = c.req.param('cid');
  const coh = await c.env.DB.prepare('SELECT id FROM cohorts WHERE id = ? AND org_id = ?').bind(cid, orgId).first();
  if (!coh) return fail(c, 404, 'No such cohort.');
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM cohort_members WHERE cohort_id = ?').bind(cid),
    c.env.DB.prepare('DELETE FROM cohorts WHERE id = ?').bind(cid),
  ]);
  return c.json({ ok: true });
});

// A cohort's roster with each learner's readiness: how much they have practised
// (attempts, questions seen, coverage of the bank) and how solid it is (held
// percentage on what they have faced). Shared by the JSON dashboard and the CSV
// export. Returns null when the cohort is not this company's.
async function cohortReadiness(db, orgId, cid) {
  const cohort = await db.prepare('SELECT id, name FROM cohorts WHERE id = ? AND org_id = ?').bind(cid, orgId).first();
  if (!cohort) return null;
  // How many questions this company's learners can see: global not hidden, plus
  // the company's own private questions. The coverage denominator.
  const totalRow = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM questions q
        WHERE (q.org_id IS NULL OR q.org_id = ?)
          AND q.id NOT IN (SELECT content_id FROM org_hidden_content WHERE org_id = ? AND kind = 'question')`,
    )
    .bind(orgId, orgId)
    .first();
  const total = totalRow?.n ?? 0;

  const mem = await db
    .prepare(
      `SELECT u.id, u.email, u.target_role
         FROM cohort_members cm JOIN users u ON u.id = cm.user_id
        WHERE cm.cohort_id = ? ORDER BY u.email`,
    )
    .bind(cid)
    .all();
  const members = mem.results ?? [];
  if (!members.length) return { cohort, total, members: [] };

  const ids = members.map((m) => m.id);
  const ph = ids.map(() => '?').join(', ');
  const held = await db
    .prepare(
      `WITH latest AS (
         SELECT user_id, question_id, self_rating,
                ROW_NUMBER() OVER (PARTITION BY user_id, question_id ORDER BY created_at DESC, id DESC) AS rn
           FROM attempts WHERE user_id IN (${ph})
       )
       SELECT user_id, COUNT(*) AS seen,
              SUM(CASE self_rating WHEN 'got_it' THEN 1.0 WHEN 'shaky' THEN 0.5 ELSE 0 END) AS points
         FROM latest WHERE rn = 1 GROUP BY user_id`,
    )
    .bind(...ids)
    .all();
  const activity = await db
    .prepare(
      `SELECT user_id, COUNT(*) AS attempts, MAX(created_at) AS last_active
         FROM attempts WHERE user_id IN (${ph}) GROUP BY user_id`,
    )
    .bind(...ids)
    .all();
  const heldBy = new Map((held.results ?? []).map((r) => [r.user_id, r]));
  const actBy = new Map((activity.results ?? []).map((r) => [r.user_id, r]));

  const rows = members.map((m) => {
    const h = heldBy.get(m.id);
    const a = actBy.get(m.id);
    const seen = h?.seen ?? 0;
    return {
      id: m.id,
      email: m.email,
      target_role: m.target_role ?? null,
      attempts: a?.attempts ?? 0,
      seen,
      coverage: total ? Math.round((seen / total) * 100) : 0,
      readiness: seen ? Math.round((h.points / seen) * 100) : 0,
      last_active: a?.last_active ?? null,
    };
  });
  return { cohort, total, members: rows };
}

app.get('/api/org/:orgId/cohorts/:cid', async (c) => {
  const orgId = c.req.param('orgId');
  if (!(await isOrgStaff(c.env.DB, c.get('user'), orgId))) return fail(c, 403, 'Not your company.');
  const data = await cohortReadiness(c.env.DB, orgId, c.req.param('cid'));
  if (!data) return fail(c, 404, 'No such cohort.');
  return c.json(data);
});

// The same readiness, as a CSV a trainer can hand to a manager. A GET so a
// plain download link carries the session cookie.
app.get('/api/org/:orgId/cohorts/:cid/report.csv', async (c) => {
  const orgId = c.req.param('orgId');
  if (!(await isOrgStaff(c.env.DB, c.get('user'), orgId))) return fail(c, 403, 'Not your company.');
  const data = await cohortReadiness(c.env.DB, orgId, c.req.param('cid'));
  if (!data) return fail(c, 404, 'No such cohort.');
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [['learner', 'target_role', 'attempts', 'questions_seen', 'coverage_pct', 'readiness_pct', 'last_active'].join(',')];
  for (const m of data.members) {
    lines.push([m.email, m.target_role ?? '', m.attempts, m.seen, m.coverage, m.readiness, m.last_active ?? ''].map(esc).join(','));
  }
  const file = (data.cohort.name || 'cohort').replace(/[^a-z0-9]+/gi, '-').toLowerCase().replace(/^-+|-+$/g, '');
  return new Response(lines.join('\n') + '\n', {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${file || 'cohort'}-readiness.csv"`,
    },
  });
});

// Add a company member to a cohort by email. They must already be in the
// company; cohorts group existing members, they do not invite.
app.post('/api/org/:orgId/cohorts/:cid/members', async (c) => {
  const orgId = c.req.param('orgId');
  if (!(await isOrgAdmin(c.env.DB, c.get('user'), orgId))) return fail(c, 403, 'Not your company.');
  const cid = c.req.param('cid');
  const coh = await c.env.DB.prepare('SELECT id FROM cohorts WHERE id = ? AND org_id = ?').bind(cid, orgId).first();
  if (!coh) return fail(c, 404, 'No such cohort.');
  const body = await c.req.json().catch(() => null);
  const email = normalizeEmail(body?.email);
  if (!emailLooksValid(email)) return fail(c, 400, 'That email does not look right.');
  const user = await c.env.DB.prepare(
    `SELECT u.id FROM users u JOIN org_members m ON m.user_id = u.id
      WHERE u.email = ? AND m.org_id = ?`,
  )
    .bind(email, orgId)
    .first();
  if (!user) return fail(c, 404, 'That person is not in your company yet. Invite or add them first.');
  await c.env.DB.prepare('INSERT OR IGNORE INTO cohort_members (cohort_id, user_id, created_at) VALUES (?, ?, ?)')
    .bind(cid, user.id, nowIso())
    .run();
  return c.json({ ok: true });
});

app.post('/api/org/:orgId/cohorts/:cid/members/:uid/remove', async (c) => {
  const orgId = c.req.param('orgId');
  if (!(await isOrgAdmin(c.env.DB, c.get('user'), orgId))) return fail(c, 403, 'Not your company.');
  const cid = c.req.param('cid');
  const coh = await c.env.DB.prepare('SELECT id FROM cohorts WHERE id = ? AND org_id = ?').bind(cid, orgId).first();
  if (!coh) return fail(c, 404, 'No such cohort.');
  await c.env.DB.prepare('DELETE FROM cohort_members WHERE cohort_id = ? AND user_id = ?')
    .bind(cid, c.req.param('uid'))
    .run();
  return c.json({ ok: true });
});

/* ----------------------------------------------------------- branding */

app.get('/api/org/:orgId/branding', async (c) => {
  const orgId = c.req.param('orgId');
  if (!(await isOrgStaff(c.env.DB, c.get('user'), orgId))) return fail(c, 403, 'Not your company.');
  const org = await c.env.DB.prepare('SELECT name, logo FROM orgs WHERE id = ?').bind(orgId).first();
  if (!org) return fail(c, 404, 'No such company.');
  return c.json({ name: org.name, logo: org.logo ?? null });
});

// A company logo its learners see in the app. Stored as a small base64 data URI
// (img-src allows data:); raster formats only, size-capped. null clears it.
app.post('/api/org/:orgId/branding', async (c) => {
  const orgId = c.req.param('orgId');
  if (!(await isOrgAdmin(c.env.DB, c.get('user'), orgId))) return fail(c, 403, 'Not your company.');
  const body = await c.req.json().catch(() => null);
  const raw = body?.logo;
  let logo = null;
  if (raw !== null && raw !== undefined && raw !== '') {
    logo = String(raw);
    if (!/^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(logo)) {
      return fail(c, 400, 'Upload a PNG, JPG, WebP or GIF.');
    }
    if (logo.length > 140000) return fail(c, 400, 'That image is too large. Keep it under about 100 KB.');
  }
  await c.env.DB.prepare('UPDATE orgs SET logo = ? WHERE id = ?').bind(logo, orgId).run();
  return c.json({ ok: true, logo });
});

app.get('/api/org/:orgId/invites', async (c) => {
  const orgId = c.req.param('orgId');
  if (!(await isOrgAdmin(c.env.DB, c.get('user'), orgId))) return fail(c, 403, 'Not your company.');
  const rows = await c.env.DB.prepare(
    `SELECT id, email, role, expires_at, created_at FROM invites
      WHERE org_id = ? AND accepted_at IS NULL ORDER BY created_at DESC`,
  )
    .bind(orgId)
    .all();
  return c.json({ invites: rows.results ?? [] });
});

app.post('/api/org/:orgId/invites', async (c) => {
  const orgId = c.req.param('orgId');
  if (!(await isOrgAdmin(c.env.DB, c.get('user'), orgId))) return fail(c, 403, 'Not your company.');
  const body = await c.req.json().catch(() => null);
  const email = normalizeEmail(body?.email);
  const role = (body?.role ?? '').toString();
  if (!emailLooksValid(email)) return fail(c, 400, 'That email does not look right.');
  if (!ORG_ROLES.has(role)) return fail(c, 400, 'Pick a role for them.');

  // If they already have an account and are already in, say so rather than
  // minting a dead invite.
  const existing = await c.env.DB.prepare(
    `SELECT 1 FROM org_members m JOIN users u ON u.id = m.user_id
      WHERE m.org_id = ? AND u.email = ?`,
  )
    .bind(orgId, email)
    .first();
  if (existing) return fail(c, 409, 'They are already in this company.');

  const token = randomHex(24);
  await c.env.DB.prepare(
    `INSERT INTO invites (id, org_id, email, role, token_hash, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(newId('inv'), orgId, email, role, await sha256Hex(token), inDays(INVITE_DAYS), nowIso())
    .run();

  const origin = new URL(c.req.url).origin;
  const link = `${origin}/join/?token=${token}`;

  // Email it straight to them when mail is on; otherwise the admin hands the
  // link over themselves, exactly as before.
  let emailed = false;
  if (mailConfigured(c.env)) {
    const org = await c.env.DB.prepare('SELECT name FROM orgs WHERE id = ?').bind(orgId).first();
    const { subject, text } = inviteEmail(link, org?.name, INVITE_DAYS);
    const r = await sendMail(c.env, { to: email, subject, text });
    emailed = r.sent;
  }
  return c.json({ ok: true, link, email, emailed });
});

// Invite many at once: paste or upload a list of emails, pick one role. Returns
// a link per created invite (tokens are shown only at creation), plus who was
// skipped (already in the company) and which addresses were invalid. When mail
// is on, each invite is also emailed; the links still come back as a fallback.
app.post('/api/org/:orgId/invites/bulk', async (c) => {
  const orgId = c.req.param('orgId');
  if (!(await isOrgAdmin(c.env.DB, c.get('user'), orgId))) return fail(c, 403, 'Not your company.');
  const body = await c.req.json().catch(() => null);
  const role = (body?.role ?? '').toString();
  if (!ORG_ROLES.has(role)) return fail(c, 400, 'Pick a role for them.');
  const raw = Array.isArray(body?.emails) ? body.emails : String(body?.emails ?? '').split(/[\s,;]+/);
  const emails = [...new Set(raw.map((e) => normalizeEmail(e)).filter(Boolean))].slice(0, 200);
  if (!emails.length) return fail(c, 400, 'Add at least one email.');

  const origin = new URL(c.req.url).origin;
  const created = [];
  const skipped = [];
  const invalid = [];
  for (const email of emails) {
    if (!emailLooksValid(email)) {
      invalid.push(email);
      continue;
    }
    const inOrg = await c.env.DB.prepare(
      'SELECT 1 FROM org_members m JOIN users u ON u.id = m.user_id WHERE m.org_id = ? AND u.email = ?',
    )
      .bind(orgId, email)
      .first();
    if (inOrg) {
      skipped.push(email);
      continue;
    }
    const token = randomHex(24);
    await c.env.DB.prepare(
      `INSERT INTO invites (id, org_id, email, role, token_hash, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(newId('inv'), orgId, email, role, await sha256Hex(token), inDays(INVITE_DAYS), nowIso())
      .run();
    created.push({ email, link: `${origin}/join/?token=${token}` });
  }

  // One batched send for the whole list when mail is on.
  let emailed = 0;
  if (mailConfigured(c.env) && created.length) {
    const org = await c.env.DB.prepare('SELECT name FROM orgs WHERE id = ?').bind(orgId).first();
    const messages = created.map((x) => {
      const { subject, text } = inviteEmail(x.link, org?.name, INVITE_DAYS);
      return { to: x.email, subject, text };
    });
    const r = await sendMailBatch(c.env, messages);
    emailed = r.sent;
  }
  return c.json({ created, skipped, invalid, emailed, mailed: mailConfigured(c.env) });
});

app.post('/api/org/:orgId/invites/:inviteId/revoke', async (c) => {
  const orgId = c.req.param('orgId');
  if (!(await isOrgAdmin(c.env.DB, c.get('user'), orgId))) return fail(c, 403, 'Not your company.');
  await c.env.DB.prepare('DELETE FROM invites WHERE id = ? AND org_id = ? AND accepted_at IS NULL')
    .bind(c.req.param('inviteId'), orgId)
    .run();
  return c.json({ ok: true });
});

// The invitee's side. Preview is readable by any signed-in user holding the
// token; accept ties the membership to the account and requires the email to
// match, so a forwarded link cannot enrol the wrong person.
app.get('/api/invites/preview', async (c) => {
  const token = c.req.query('token') || '';
  const inv = await c.env.DB.prepare(
    `SELECT i.email, i.role, i.expires_at, i.accepted_at, o.name AS org_name
       FROM invites i JOIN orgs o ON o.id = i.org_id
      WHERE i.token_hash = ?`,
  )
    .bind(await sha256Hex(token))
    .first();
  if (!inv) return fail(c, 404, 'This invite link is not valid.');
  if (inv.accepted_at) return fail(c, 409, 'This invite has already been used.');
  if (new Date(inv.expires_at) < new Date()) return fail(c, 410, 'This invite has expired.');
  return c.json({ invite: { org_name: inv.org_name, role: inv.role, email: inv.email } });
});

app.post('/api/invites/accept', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => null);
  const token = (body?.token ?? '').toString();
  const inv = await c.env.DB.prepare(
    'SELECT id, org_id, email, role, expires_at, accepted_at FROM invites WHERE token_hash = ?',
  )
    .bind(await sha256Hex(token))
    .first();
  if (!inv) return fail(c, 404, 'This invite link is not valid.');
  if (inv.accepted_at) return fail(c, 409, 'This invite has already been used.');
  if (new Date(inv.expires_at) < new Date()) return fail(c, 410, 'This invite has expired.');
  if (normalizeEmail(user.email) !== normalizeEmail(inv.email)) {
    return fail(c, 403, 'This invite is for a different email. Sign in as that account.');
  }

  await c.env.DB.batch([
    c.env.DB
      .prepare(
        `INSERT INTO org_members (org_id, user_id, role, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(org_id, user_id) DO UPDATE SET role = excluded.role`,
      )
      .bind(inv.org_id, user.id, inv.role, nowIso()),
    c.env.DB.prepare('UPDATE invites SET accepted_at = ? WHERE id = ?').bind(nowIso(), inv.id),
  ]);
  return c.json({ ok: true });
});

/* ----------------------------------------------------------- org content */

const HIDE_KINDS = new Set(['question', 'scenario', 'lab']);
const HIDE_TABLE = { question: 'questions', scenario: 'scenarios', lab: 'labs' };

// A company's own library seen from the admin side: the private questions it
// has written, plus the whole global catalogue with a flag on each item the
// company has chosen to hide from its own learners.
app.get('/api/org/:orgId/content', async (c) => {
  const orgId = c.req.param('orgId');
  if (!(await isOrgAdmin(c.env.DB, c.get('user'), orgId))) return fail(c, 403, 'Not your company.');

  const privateQs = await c.env.DB.prepare(
    `SELECT q.id, q.role, q.topic, q.level, q.prompt,
            (SELECT COUNT(*) FROM follow_ups f WHERE f.question_id = q.id) AS follow_ups
       FROM questions q WHERE q.org_id = ? ORDER BY q.created_at DESC`,
  )
    .bind(orgId)
    .all();

  // Each global row flagged with whether this company hides it. The bind is the
  // org id for the correlated EXISTS.
  const hiddenFlag = (kind) =>
    `EXISTS (SELECT 1 FROM org_hidden_content h
              WHERE h.org_id = ? AND h.kind = '${kind}' AND h.content_id = x.id) AS hidden`;

  const globalQs = await c.env.DB.prepare(
    `SELECT x.id, x.role, x.topic, x.level, ${hiddenFlag('question')}
       FROM questions x WHERE x.org_id IS NULL ORDER BY x.level, x.role, x.topic`,
  )
    .bind(orgId)
    .all();
  const globalSc = await c.env.DB.prepare(
    `SELECT x.id, x.role, x.level, x.title, ${hiddenFlag('scenario')}
       FROM scenarios x WHERE x.org_id IS NULL ORDER BY x.level, x.role, x.title`,
  )
    .bind(orgId)
    .all();
  const globalLabs = await c.env.DB.prepare(
    `SELECT x.id, x.role, x.level, x.title, ${hiddenFlag('lab')}
       FROM labs x WHERE x.org_id IS NULL ORDER BY x.level, x.role, x.title`,
  )
    .bind(orgId)
    .all();

  return c.json({
    private: { questions: privateQs.results ?? [] },
    globals: {
      questions: globalQs.results ?? [],
      scenarios: globalSc.results ?? [],
      labs: globalLabs.results ?? [],
    },
  });
});

// Write a private question for the company. The id is always minted fresh and
// org_id is pinned to this company, so an admin can never pass the id of a
// global question and overwrite it, nor reach into another company's library.
app.post('/api/org/:orgId/questions', async (c) => {
  const orgId = c.req.param('orgId');
  if (!(await isOrgAdmin(c.env.DB, c.get('user'), orgId))) return fail(c, 403, 'Not your company.');
  const body = await c.req.json().catch(() => null);
  const problem = questionProblem(body);
  if (problem) return fail(c, 400, problem);

  const id = newId('q');
  const statements = [
    c.env.DB.prepare(
      `INSERT INTO questions (id, role, topic, level, prompt, model_answer, org_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      body.role,
      body.topic.trim(),
      body.level,
      body.prompt.trim(),
      body.model_answer.trim(),
      orgId,
      nowIso(),
    ),
  ];
  body.follow_ups.forEach((f, i) => {
    statements.push(
      c.env.DB.prepare(
        'INSERT INTO follow_ups (id, question_id, position, prompt, model_answer) VALUES (?, ?, ?, ?, ?)',
      ).bind(`${id}_f${i + 1}`, id, i + 1, f.prompt.trim(), f.model_answer.trim()),
    );
  });
  await c.env.DB.batch(statements);
  return c.json({ ok: true, id }, 201);
});

// Remove a private question. Pinned to this company's org_id, so the delete can
// only ever touch the company's own item.
app.post('/api/org/:orgId/questions/:qid/delete', async (c) => {
  const orgId = c.req.param('orgId');
  if (!(await isOrgAdmin(c.env.DB, c.get('user'), orgId))) return fail(c, 403, 'Not your company.');
  const qid = c.req.param('qid');
  const owned = await c.env.DB.prepare('SELECT id FROM questions WHERE id = ? AND org_id = ?')
    .bind(qid, orgId)
    .first();
  if (!owned) return fail(c, 404, 'No such question in your library.');
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM follow_ups WHERE question_id = ?').bind(qid),
    c.env.DB.prepare('DELETE FROM attempts WHERE question_id = ?').bind(qid),
    c.env.DB.prepare('DELETE FROM questions WHERE id = ? AND org_id = ?').bind(qid, orgId),
  ]);
  return c.json({ ok: true });
});

// Hide or show a global item for this company's learners. You can only ever
// hide a global (org_id IS NULL) item: your own private content you delete, and
// another company's private content you cannot see in the first place.
app.post('/api/org/:orgId/hidden', async (c) => {
  const orgId = c.req.param('orgId');
  if (!(await isOrgAdmin(c.env.DB, c.get('user'), orgId))) return fail(c, 403, 'Not your company.');
  const body = await c.req.json().catch(() => null);
  const kind = (body?.kind ?? '').toString();
  const contentId = (body?.content_id ?? '').toString();
  const hidden = Boolean(body?.hidden);
  if (!HIDE_KINDS.has(kind)) return fail(c, 400, 'Unknown kind.');
  if (!contentId) return fail(c, 400, 'Which item?');

  const exists = await c.env.DB.prepare(
    `SELECT 1 FROM ${HIDE_TABLE[kind]} WHERE id = ? AND org_id IS NULL`,
  )
    .bind(contentId)
    .first();
  if (!exists) return fail(c, 404, 'No such global item.');

  if (hidden) {
    await c.env.DB.prepare(
      `INSERT INTO org_hidden_content (org_id, kind, content_id, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(org_id, kind, content_id) DO NOTHING`,
    )
      .bind(orgId, kind, contentId, nowIso())
      .run();
  } else {
    await c.env.DB.prepare(
      'DELETE FROM org_hidden_content WHERE org_id = ? AND kind = ? AND content_id = ?',
    )
      .bind(orgId, kind, contentId)
      .run();
  }
  return c.json({ ok: true, hidden });
});

/* --------------------------------------------------------------- console */

// Platform-wide numbers. Everything, across everyone, because the console sits
// above the per-company world.
app.get('/api/console/overview', async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM users)                               AS users,
            (SELECT COUNT(*) FROM users WHERE platform_role='owner')     AS owners,
            (SELECT COUNT(*) FROM users WHERE platform_role='developer') AS developers,
            (SELECT COUNT(*) FROM users WHERE platform_role='business')  AS business,
            (SELECT COUNT(*) FROM users WHERE platform_role IS NULL)     AS plain,
            (SELECT COUNT(*) FROM attempts)          AS attempts,
            (SELECT COUNT(*) FROM scenario_attempts) AS scenario_attempts,
            (SELECT COUNT(*) FROM lab_attempts)      AS lab_attempts,
            (SELECT COUNT(*) FROM questions)         AS questions,
            (SELECT COUNT(*) FROM labs)              AS labs,
            (SELECT COUNT(*) FROM scenarios)         AS scenarios`,
  ).first();
  return c.json({ overview: row });
});

// Every account on the platform, newest first, with how much each has done.
app.get('/api/console/users', async (c) => {
  const q = (c.req.query('q') || '').trim().toLowerCase();
  const base = `SELECT u.id, u.email, u.track, u.platform_role, u.created_at,
            (SELECT COUNT(*) FROM attempts a WHERE a.user_id = u.id)          AS attempts,
            (SELECT COUNT(*) FROM scenario_attempts s WHERE s.user_id = u.id) AS scenarios,
            (SELECT COUNT(*) FROM lab_attempts l WHERE l.user_id = u.id)      AS labs,
            (SELECT MAX(a.created_at) FROM attempts a WHERE a.user_id = u.id) AS last_seen
       FROM users u`;
  const sql = q
    ? `${base} WHERE lower(u.email) LIKE ? ORDER BY u.created_at DESC LIMIT 200`
    : `${base} ORDER BY u.created_at DESC LIMIT 200`;
  const stmt = q ? c.env.DB.prepare(sql).bind(`%${q}%`) : c.env.DB.prepare(sql);
  const rows = await stmt.all();
  return c.json({ users: rows.results ?? [], capped: (rows.results?.length ?? 0) >= 200 });
});

// Grant or revoke a platform role. Owner only: a developer must not be able to
// mint owners or hand itself more power. An empty role drops the account back to
// a plain user. The last owner cannot be demoted, so no one can lock everyone
// out of god mode, themselves included.
const ASSIGNABLE = new Set(['owner', 'developer', 'business']);

app.post('/api/console/users/:id/role', async (c) => {
  if (c.get('user').platform_role !== 'owner') {
    return fail(c, 403, 'Only the owner can change platform roles.');
  }
  const body = await c.req.json().catch(() => null);
  const raw = (body?.platform_role ?? '').toString();
  const role = raw === '' ? null : raw;
  if (role !== null && !ASSIGNABLE.has(role)) return fail(c, 400, 'Unknown platform role.');

  const target = await c.env.DB.prepare('SELECT id, platform_role FROM users WHERE id = ?')
    .bind(c.req.param('id'))
    .first();
  if (!target) return fail(c, 404, 'No such account.');

  if (target.platform_role === 'owner' && role !== 'owner') {
    const owners = await c.env.DB.prepare(
      "SELECT COUNT(*) AS n FROM users WHERE platform_role = 'owner'",
    ).first();
    if ((owners?.n ?? 0) <= 1) {
      return fail(c, 409, 'That is the last owner. Make someone else an owner first.');
    }
  }

  // is_admin is vestigial but kept honest: owner and developer are content
  // admins, everyone else is not.
  await c.env.DB.prepare('UPDATE users SET platform_role = ?, is_admin = ? WHERE id = ?')
    .bind(role, isContentAdmin(role) ? 1 : 0, target.id)
    .run();

  return c.json({ ok: true, id: target.id, platform_role: role });
});

// Reset a user's data. scope 'scores' wipes their SecMox Scores and codes;
// 'progress' wipes practice, labs, scenarios, review schedule and onboarding;
// 'all' does both. The account, its login and its memberships stay; this is a
// reset, not a deletion.
app.post('/api/console/users/:id/reset', async (c) => {
  if (c.get('user').platform_role !== 'owner') {
    return fail(c, 403, 'Only the owner can reset accounts.');
  }
  const id = c.req.param('id');
  const scope = ((await c.req.json().catch(() => null))?.scope || 'all').toString();
  if (!['scores', 'progress', 'all'].includes(scope)) return fail(c, 400, 'Unknown reset scope.');

  const target = await c.env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(id).first();
  if (!target) return fail(c, 404, 'No such account.');

  const stmts = [];
  if (scope === 'scores' || scope === 'all') {
    stmts.push(c.env.DB.prepare('DELETE FROM score_results WHERE user_id = ?').bind(id));
  }
  if (scope === 'progress' || scope === 'all') {
    for (const t of [
      'attempts',
      'lab_attempts',
      'scenario_attempts',
      'review_schedule',
      'readiness_snapshots',
      'bookmarks',
      'question_reports',
    ]) {
      stmts.push(c.env.DB.prepare(`DELETE FROM ${t} WHERE user_id = ?`).bind(id));
    }
    stmts.push(c.env.DB.prepare('UPDATE users SET onboarded_at = NULL WHERE id = ?').bind(id));
  }
  await c.env.DB.batch(stmts);
  return c.json({ ok: true, id, scope });
});

// Change a user's login email. Owner only.
app.post('/api/console/users/:id/email', async (c) => {
  if (c.get('user').platform_role !== 'owner') return fail(c, 403, 'Only the owner can change accounts.');
  const id = c.req.param('id');
  const email = normalizeEmail((await c.req.json().catch(() => null))?.email);
  if (!emailLooksValid(email)) return fail(c, 400, 'That email does not look right.');
  const target = await c.env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(id).first();
  if (!target) return fail(c, 404, 'No such account.');
  const clash = await c.env.DB.prepare('SELECT id FROM users WHERE email = ? AND id != ?')
    .bind(email, id)
    .first();
  if (clash) return fail(c, 409, 'That email is already registered.');
  await c.env.DB.prepare('UPDATE users SET email = ? WHERE id = ?').bind(email, id).run();
  return c.json({ ok: true, id, email });
});

// Set a user's password. Owner only. Revokes their existing sessions so the old
// password cannot keep a session alive.
app.post('/api/console/users/:id/password', async (c) => {
  if (c.get('user').platform_role !== 'owner') return fail(c, 403, 'Only the owner can change accounts.');
  const id = c.req.param('id');
  const password = (await c.req.json().catch(() => null))?.password;
  const problem = passwordProblem(password);
  if (problem) return fail(c, 400, problem);
  const target = await c.env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(id).first();
  if (!target) return fail(c, 404, 'No such account.');
  const { salt, hash, iterations } = await hashNewPassword(password);
  await c.env.DB.batch([
    c.env.DB.prepare(
      'UPDATE users SET password_hash = ?, password_salt = ?, iterations = ? WHERE id = ?',
    ).bind(hash, salt, iterations, id),
    c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id),
  ]);
  return c.json({ ok: true, id });
});

// Delete a user and all their data. Owner only; you cannot delete yourself here,
// so the console can never lock out its own owner.
app.delete('/api/console/users/:id', async (c) => {
  const me = c.get('user');
  if (me.platform_role !== 'owner') return fail(c, 403, 'Only the owner can delete accounts.');
  const id = c.req.param('id');
  if (id === me.id) return fail(c, 400, 'You cannot delete your own account from here.');
  const target = await c.env.DB.prepare('SELECT id, email FROM users WHERE id = ?').bind(id).first();
  if (!target) return fail(c, 404, 'No such account.');
  const stmts = [];
  for (const t of [
    'attempts',
    'bookmarks',
    'cohort_members',
    'lab_attempts',
    'org_members',
    'password_resets',
    'question_reports',
    'readiness_snapshots',
    'review_schedule',
    'scenario_attempts',
    'score_results',
    'sessions',
  ]) {
    stmts.push(c.env.DB.prepare(`DELETE FROM ${t} WHERE user_id = ?`).bind(id));
  }
  stmts.push(
    c.env.DB.prepare('DELETE FROM impersonation_log WHERE actor_id = ? OR target_id = ?').bind(id, id),
  );
  stmts.push(c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id));
  await c.env.DB.batch(stmts);
  return c.json({ ok: true, id, email: target.email, deleted: true });
});

/* --------------------------------------------------------- companies */

const ORG_ROLES = new Set(['org_admin', 'trainer', 'learner']);

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'company';
}

// Owner only for now: creating and staffing real companies is owner-level work.
// Developer sandboxes and business demos slot in here later with their own
// guards.
app.get('/api/console/orgs', async (c) => {
  if (c.get('user').platform_role !== 'owner') return fail(c, 403, 'Only the owner manages companies.');
  const rows = await c.env.DB.prepare(
    `SELECT o.id, o.name, o.slug, o.plan, o.status, o.is_sandbox, o.created_at,
            (SELECT COUNT(*) FROM org_members m WHERE m.org_id = o.id) AS members
       FROM orgs o ORDER BY o.created_at DESC`,
  ).all();
  return c.json({ orgs: rows.results ?? [] });
});

app.post('/api/console/orgs', async (c) => {
  if (c.get('user').platform_role !== 'owner') return fail(c, 403, 'Only the owner manages companies.');
  const body = await c.req.json().catch(() => null);
  const name = (body?.name ?? '').toString().trim();
  if (name.length < 2) return fail(c, 400, 'Give the company a name.');

  let slug = slugify(name);
  const clash = await c.env.DB.prepare('SELECT 1 FROM orgs WHERE slug = ?').bind(slug).first();
  if (clash) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;

  const id = newId('org');
  await c.env.DB.prepare(
    'INSERT INTO orgs (id, name, slug, is_sandbox, created_at) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(id, name, slug, body?.is_sandbox ? 1 : 0, nowIso())
    .run();
  return c.json({ ok: true, id, slug });
});

// A company's roster, so the owner can see who is in a tenant and view-as any
// of them to experience that company's portal.
app.get('/api/console/orgs/:id/members', async (c) => {
  if (c.get('user').platform_role !== 'owner') return fail(c, 403, 'Only the owner manages companies.');
  const rows = await c.env.DB.prepare(
    `SELECT u.id, u.email, m.role, m.created_at,
            (SELECT COUNT(*) FROM attempts a WHERE a.user_id = u.id) AS attempts
       FROM org_members m JOIN users u ON u.id = m.user_id
      WHERE m.org_id = ?
      ORDER BY CASE m.role WHEN 'org_admin' THEN 0 WHEN 'trainer' THEN 1 ELSE 2 END, u.email`,
  )
    .bind(c.req.param('id'))
    .all();
  return c.json({ members: rows.results ?? [] });
});

// Bootstrap a company's first admin (or add any member) by email. The account
// must already exist; invites handle people who do not yet.
app.post('/api/console/orgs/:id/members', async (c) => {
  if (c.get('user').platform_role !== 'owner') return fail(c, 403, 'Only the owner manages companies.');
  const body = await c.req.json().catch(() => null);
  const email = normalizeEmail(body?.email);
  const role = (body?.role ?? '').toString();
  if (!emailLooksValid(email)) return fail(c, 400, 'That email does not look right.');
  if (!ORG_ROLES.has(role)) return fail(c, 400, 'Pick a company role.');

  const org = await c.env.DB.prepare('SELECT id FROM orgs WHERE id = ?').bind(c.req.param('id')).first();
  if (!org) return fail(c, 404, 'No such company.');
  const user = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (!user) return fail(c, 404, 'No account with that email. Invite them instead.');

  await c.env.DB.prepare(
    `INSERT INTO org_members (org_id, user_id, role, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(org_id, user_id) DO UPDATE SET role = excluded.role`,
  )
    .bind(org.id, user.id, role, nowIso())
    .run();
  return c.json({ ok: true });
});

// Owner only: mint an account directly, for provisioning a demo tenant or a
// platform teammate without a self-signup. Optionally attach it to a company
// with an org role in the same call, so populating a tenant is one action.
// Accounts made here are marked onboarded, so viewing-as them lands on the
// working portal rather than the first-run flow.
app.post('/api/console/users', async (c) => {
  if (c.get('user').platform_role !== 'owner') return fail(c, 403, 'Only the owner can create accounts.');
  const body = await c.req.json().catch(() => null);
  if (!body) return fail(c, 400, 'Send JSON.');

  const email = normalizeEmail(body.email);
  if (!emailLooksValid(email)) return fail(c, 400, 'That email does not look right.');
  const problem = passwordProblem(body.password);
  if (problem) return fail(c, 400, problem);
  const track = TRACKS.has(body.track) ? body.track : 'fresher';
  const platformRole =
    body.platform_role && ASSIGNABLE.has(String(body.platform_role)) ? String(body.platform_role) : null;

  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existing) return fail(c, 409, 'That email is already registered.');

  const { salt, hash, iterations } = await hashNewPassword(body.password);
  const id = newId('usr');
  const now = nowIso();
  await c.env.DB.prepare(
    `INSERT INTO users (id, email, password_hash, password_salt, iterations, track, is_admin, platform_role, onboarded_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, email, hash, salt, iterations, track, isContentAdmin(platformRole) ? 1 : 0, platformRole, now, now)
    .run();

  // Optional one-shot company attach.
  let attached = null;
  const orgId = body.org_id ? String(body.org_id) : null;
  const orgRole = body.org_role ? String(body.org_role) : null;
  if (orgId && ORG_ROLES.has(orgRole)) {
    const org = await c.env.DB.prepare('SELECT id FROM orgs WHERE id = ?').bind(orgId).first();
    if (org) {
      await c.env.DB.prepare(
        `INSERT INTO org_members (org_id, user_id, role, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(org_id, user_id) DO UPDATE SET role = excluded.role`,
      )
        .bind(orgId, id, orgRole, now)
        .run();
      attached = { org_id: orgId, role: orgRole };
    }
  }
  return c.json({ ok: true, id, email, platform_role: platformRole, attached }, 201);
});

// The view-as trail. The owner sees every impersonation ever; a developer or
// business account sees only its own, because the full log is an accountability
// record and that belongs to the owner.
app.get('/api/console/impersonations', async (c) => {
  const me = c.get('user');
  const base = `SELECT il.id, il.started_at, il.ended_at, il.reason,
                       a.email AS actor_email, t.email AS target_email
                  FROM impersonation_log il
                  JOIN users a ON a.id = il.actor_id
                  JOIN users t ON t.id = il.target_id`;
  const sql =
    me.platform_role === 'owner'
      ? `${base} ORDER BY il.started_at DESC LIMIT 100`
      : `${base} WHERE il.actor_id = ? ORDER BY il.started_at DESC LIMIT 100`;
  const stmt = me.platform_role === 'owner' ? c.env.DB.prepare(sql) : c.env.DB.prepare(sql).bind(me.id);
  const rows = await stmt.all();
  return c.json({ impersonations: rows.results ?? [] });
});

// Start view-as. Owner can view anyone; a developer can view only plain users,
// never a platform account, so impersonation can never be used to climb. The
// impersonation flag is set on this exact session, not the account, so the
// actor's other sessions are untouched, and the window is logged open.
app.post('/api/console/impersonate/:id', async (c) => {
  const actor = c.get('user');
  if (actor.impersonating) return fail(c, 409, 'Exit the current view-as first.');
  if (actor.platform_role !== 'owner' && actor.platform_role !== 'developer') {
    return fail(c, 403, 'Your role cannot view as other users.');
  }
  const targetId = c.req.param('id');
  if (targetId === actor.id) return fail(c, 400, 'You are already yourself.');

  const target = await c.env.DB.prepare('SELECT id, platform_role FROM users WHERE id = ?')
    .bind(targetId)
    .first();
  if (!target) return fail(c, 404, 'No such account.');
  if (actor.platform_role === 'developer' && target.platform_role) {
    return fail(c, 403, 'Developers can view plain users only.');
  }

  const body = await c.req.json().catch(() => null);
  const reason = typeof body?.reason === 'string' ? body.reason.slice(0, 300) : null;
  const sid = await sha256Hex(tokenFrom(c));

  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE sessions SET impersonating_user_id = ? WHERE id = ?').bind(target.id, sid),
    c.env.DB
      .prepare(
        `INSERT INTO impersonation_log (id, actor_id, target_id, reason, started_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(newId('imp'), actor.id, target.id, reason, nowIso()),
  ]);
  return c.json({ ok: true });
});

/* --------------------------------------------------------------- static */

app.all('/api/*', (c) => fail(c, 404, 'No such endpoint.'));

// Static files are normally served before the Worker is reached, so this only
// runs for paths with no matching file.
app.all('*', (c) => {
  if (c.env.ASSETS) return c.env.ASSETS.fetch(c.req.raw);
  return c.text('Not found', 404);
});

// The old workers.dev address now redirects to secmox.com, path and query kept,
// so links already shared keep working. Preview URLs (*-secmox...) are left
// alone so preview deploys stay testable. run_worker_first sends every request
// here first, which is what lets static pages redirect too; everything that is
// not the old host goes on exactly as before: /api/* to the app, the rest to
// the static assets.
const OLD_HOST = 'secmox.superakash.workers.dev';
const NEW_ORIGIN = 'https://secmox.com';

// --- Social preview (OG) injection for shareable pages -----------------------
// Scrapers (LinkedIn, WhatsApp, Twitter) do not run the page's JS, so a per-score
// or per-profile preview must be baked into the HTML at serve time. We fetch the
// page's static shell and inject personalised OG/Twitter tags; the brand image is
// reused so a clean thumbnail always shows.

const ogEsc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function ogTags({ title, description, image, pageUrl }) {
  return [
    `<meta property="og:title" content="${ogEsc(title)}">`,
    `<meta property="og:description" content="${ogEsc(description)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:url" content="${ogEsc(pageUrl)}">`,
    `<meta property="og:image" content="${ogEsc(image)}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${ogEsc(title)}">`,
    `<meta name="twitter:description" content="${ogEsc(description)}">`,
    `<meta name="twitter:image" content="${ogEsc(image)}">`,
    `<meta name="description" content="${ogEsc(description)}">`,
  ].join('\n');
}

async function serveWithOg(env, assetPath, url, tags) {
  const res = await env.ASSETS.fetch(new Request(new URL(assetPath, url.origin)));
  if (!res.ok) return res;
  const html = (await res.text()).replace('</head>', `${tags}\n</head>`);
  return new Response(html, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' },
  });
}

async function ogScore(env, url) {
  const brand = `${url.origin}/og.png`;
  let title = 'SecMox Score';
  let desc = 'Verify a SecMox Score for a cybersecurity or IT role.';
  try {
    const code = url.searchParams.get('code');
    const id = url.searchParams.get('id');
    let row = null;
    if (code)
      row = await env.DB.prepare(
        'SELECT role, score, candidate_name FROM score_results WHERE code = ?',
      )
        .bind(normalizeCode(code))
        .first();
    else if (id)
      row = await env.DB.prepare(
        'SELECT role, score, candidate_name FROM score_results WHERE id = ?',
      )
        .bind(id)
        .first();
    if (row) {
      const pos = POSITION[row.role] || row.role;
      const who = row.candidate_name ? `${row.candidate_name} - ` : '';
      title = `${who}${pos} SecMox Score: ${row.score}`;
      desc = `A verified SecMox Score (${row.score}/1000) for ${pos}, from a timed, scenario-based test. Check it on SecMox.`;
    }
  } catch {
    /* fall back to the generic preview */
  }
  return serveWithOg(env, '/score/index.html', url, ogTags({ title, description: desc, image: brand, pageUrl: url.href }));
}

async function ogProfile(env, url) {
  const brand = `${url.origin}/og.png`;
  let title = 'SecMox profile';
  let desc = 'A candidate’s SecMox Scores across cybersecurity and IT roles.';
  try {
    const handle = url.pathname.replace(/^\/u\//, '').replace(/\/+$/, '').toLowerCase();
    if (handle) {
      const u = await env.DB.prepare('SELECT id, display_name FROM users WHERE handle = ?')
        .bind(handle)
        .first();
      if (u) {
        const name = u.display_name || 'A candidate';
        const top = await env.DB.prepare(
          'SELECT role, score FROM score_results WHERE user_id = ? ORDER BY score DESC LIMIT 1',
        )
          .bind(u.id)
          .first();
        if (top) {
          const pos = POSITION[top.role] || top.role;
          title = `${name} on SecMox - ${pos} Score ${top.score}`;
          desc = `${name}'s SecMox Scores for cybersecurity and IT roles. Top: ${pos} ${top.score}/1000. Verify on SecMox.`;
        } else {
          title = `${name} on SecMox`;
        }
      }
    }
  } catch {
    /* fall back to the generic preview */
  }
  return serveWithOg(env, '/u/index.html', url, ogTags({ title, description: desc, image: brand, pageUrl: url.href }));
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.hostname === OLD_HOST) {
      return Response.redirect(NEW_ORIGIN + url.pathname + url.search, 301);
    }
    if (url.pathname.startsWith('/api/')) return app.fetch(request, env, ctx);
    if (!env.ASSETS) return app.fetch(request, env, ctx);
    // Shareable pages get server-injected previews; profile uses clean /u/<handle>.
    if (url.pathname === '/score/' || url.pathname === '/score/index.html') {
      return ogScore(env, url);
    }
    if (url.pathname.startsWith('/u/')) {
      return ogProfile(env, url);
    }
    return env.ASSETS.fetch(request);
  },
};
