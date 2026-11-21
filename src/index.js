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
import { mailConfigured, resetEmail, sendMail } from './mail.js';

const app = new Hono();

const TRACKS = new Set(['fresher', 'mid', 'exploring']);
const ROLES = new Set(['soc', 'pentest', 'network', 'cloud', 'grc']);
const LEVELS = new Set(['fresher', 'mid']);
const RATINGS = new Set(['got_it', 'shaky', 'missed']);

const fail = (c, status, message) => c.json({ error: message }, status);
const tokenFrom = (c) => readCookie(c.req.header('cookie'), SESSION_COOKIE);
const clientIp = (c) => c.req.header('cf-connecting-ip') || 'unknown';
const nowIso = () => new Date().toISOString();

/* --------------------------------------------------------------- headers */

app.use('*', async (c, next) => {
  await next();
  const h = c.res.headers;
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

/* ------------------------------------------------------------- sessions */

const OPEN_ROUTES = new Set([
  '/api/auth/signup',
  '/api/auth/login',
  '/api/auth/forgot',
  '/api/auth/reset',
]);

app.use('/api/*', async (c, next) => {
  if (OPEN_ROUTES.has(new URL(c.req.url).pathname)) return next();
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

/* ----------------------------------------------------------------- auth */

app.post('/api/auth/signup', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return fail(c, 400, 'Send JSON.');

  const email = normalizeEmail(body.email);
  if (!emailLooksValid(email)) return fail(c, 400, 'That email does not look right.');

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
  return c.json({ user: { id, email, track, is_admin: false } }, 201);
});

app.post('/api/auth/login', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return fail(c, 400, 'Send JSON.');

  const email = normalizeEmail(body.email);
  const keys = [`ip:${clientIp(c)}`, `email:${email}`];

  const lockedFor = await throttleCheck(c.env.DB, keys);
  if (lockedFor) {
    const mins = Math.ceil(lockedFor / 60);
    return fail(c, 429, `Too many attempts. Try again in about ${mins} minute${mins > 1 ? 's' : ''}.`);
  }

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

app.get('/api/me', (c) => c.json({ user: c.get('user') }));

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

app.get('/api/next', async (c) => {
  const user = c.get('user');
  const { role, level } = filters(c);

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
  const clause = where.join(' AND ');

  let row = await c.env.DB.prepare(
    `SELECT q.id, q.role, q.topic, q.level, q.prompt
       FROM questions q
      WHERE ${clause}
        AND q.id NOT IN (SELECT question_id FROM attempts WHERE user_id = ?)
      ORDER BY RANDOM() LIMIT 1`,
  )
    .bind(...args, user.id)
    .first();

  // mode: 'fresh' never seen, 'due' the schedule says it is time, 'review' the
  // schedule is empty or nothing is due yet so fall back to the weakest and
  // stalest. The client reads this to tell the candidate why a question is back.
  let mode = 'fresh';

  // Due: the spaced-repetition layer. Most overdue, worst last rating first. A
  // question answered this session sits days out and will not reappear here.
  if (!row) {
    row = await c.env.DB.prepare(
      `SELECT q.id, q.role, q.topic, q.level, q.prompt
         FROM review_schedule s
         JOIN questions q ON q.id = s.question_id
        WHERE s.user_id = ? AND s.due_at <= ?
          AND ${clause}
        ORDER BY CASE s.last_rating WHEN 'missed' THEN 0 WHEN 'shaky' THEN 1 ELSE 2 END ASC,
                 s.due_at ASC
        LIMIT 1`,
    )
      .bind(user.id, nowIso(), ...args)
      .first();
    if (row) mode = 'due';
  }

  // Review: nothing due (or legacy attempts with no schedule row). Keep practice
  // alive with the weakest, stalest thing rather than dead-ending.
  if (!row) {
    row = await c.env.DB.prepare(
      `SELECT q.id, q.role, q.topic, q.level, q.prompt,
              MIN(CASE a.self_rating WHEN 'missed' THEN 0 WHEN 'shaky' THEN 1 ELSE 2 END) AS worst,
              MAX(a.created_at) AS last_seen
         FROM questions q
         JOIN attempts a ON a.question_id = q.id AND a.user_id = ?
        WHERE ${clause}
        GROUP BY q.id
        ORDER BY worst ASC, last_seen ASC
        LIMIT 1`,
    )
      .bind(user.id, ...args)
      .first();
    if (row) mode = 'review';
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
      follow_up_count: followUps?.n ?? 0,
    },
    fresh: mode === 'fresh',
    mode,
  });
});

// Answers stay out of the page until the candidate has committed to one.
app.get('/api/questions/:id/answer', async (c) => {
  const id = c.req.param('id');
  const question = await c.env.DB.prepare('SELECT id, model_answer FROM questions WHERE id = ?')
    .bind(id)
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
const GOT_IT_DAYS = [2, 4, 9, 21, 45, 90];

function nextReview(prevReps, rating) {
  if (rating === 'got_it') {
    const reps = prevReps + 1;
    const days = GOT_IT_DAYS[Math.min(reps, GOT_IT_DAYS.length) - 1];
    return { reps, interval_days: days };
  }
  if (rating === 'shaky') return { reps: 0, interval_days: 2 };
  return { reps: 0, interval_days: 1 };
}

function inDays(days) {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

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
     ${level ? 'WHERE q.level = ?' : ''}
     GROUP BY q.role
     ORDER BY q.role`;
  const stmt = level
    ? c.env.DB.prepare(sql).bind(user.id, level)
    : c.env.DB.prepare(sql).bind(user.id);
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
const RATING_WEIGHT = { got_it: 1, shaky: 0.5, missed: 0 };

function readinessBand(hold, seen) {
  if (!seen) return 'untouched';
  if (hold < 25) return 'cold';
  if (hold < 50) return 'shaky';
  if (hold < 72) return 'building';
  if (hold < 88) return 'close';
  return 'ready';
}

app.get('/api/readiness', async (c) => {
  const user = c.get('user');
  const { level } = filters(c);
  const lv = level || null;

  const qWhere = lv ? 'WHERE q.level = ?' : '';
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
      ${qWhere}`,
  )
    .bind(...(lv ? [user.id, lv] : [user.id]))
    .all();

  const scenarioRows = await c.env.DB.prepare(
    `SELECT s.role,
            COUNT(DISTINCT s.id) AS total,
            COUNT(DISTINCT CASE WHEN a.id IS NOT NULL THEN s.id END) AS done
       FROM scenarios s
       LEFT JOIN scenario_attempts a ON a.scenario_id = s.id AND a.user_id = ?
      ${lv ? 'WHERE s.level = ?' : ''}
      GROUP BY s.role`,
  )
    .bind(...(lv ? [user.id, lv] : [user.id]))
    .all();

  const labRows = await c.env.DB.prepare(
    `SELECT l.role,
            COUNT(DISTINCT l.id) AS total,
            COUNT(DISTINCT CASE WHEN a.id IS NOT NULL THEN l.id END) AS done
       FROM labs l
       LEFT JOIN lab_attempts a ON a.lab_id = l.id AND a.user_id = ?
      ${lv ? 'WHERE l.level = ?' : ''}
      GROUP BY l.role`,
  )
    .bind(...(lv ? [user.id, lv] : [user.id]))
    .all();

  const scByRole = new Map((scenarioRows.results ?? []).map((r) => [r.role, r]));
  const labByRole = new Map((labRows.results ?? []).map((r) => [r.role, r]));

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
    `SELECT l.id, l.title, l.role, l.level, l.artifact_kind, l.artifact_name, l.is_free,
            (SELECT COUNT(*) FROM lab_tasks t WHERE t.lab_id = l.id) AS tasks,
            (SELECT COUNT(*) FROM lab_attempts a WHERE a.lab_id = l.id AND a.user_id = ?) AS done
       FROM labs l ORDER BY l.level, l.role, l.title`,
  )
    .bind(user.id)
    .all();
  return c.json({ labs: results ?? [] });
});

// The artifact and the tasks, but never the answers: the whole point is to
// read the evidence before being told what is in it.
app.get('/api/labs/:id', async (c) => {
  const id = c.req.param('id');
  const lab = await c.env.DB.prepare(
    `SELECT l.id, l.title, l.role, l.level, l.brief, l.artifact_kind, l.artifact_name,
            a.body, a.bytes
       FROM labs l LEFT JOIN lab_artifacts a ON a.lab_id = l.id
      WHERE l.id = ?`,
  )
    .bind(id)
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
  const { results } = await c.env.DB.prepare(
    'SELECT position, prompt, model_answer FROM lab_tasks WHERE lab_id = ? ORDER BY position',
  )
    .bind(c.req.param('id'))
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
              WHERE a.scenario_id = s.id AND a.user_id = ?) AS done
       FROM scenarios s ORDER BY s.level, s.role, s.title`,
  )
    .bind(user.id)
    .all();
  return c.json({ scenarios: results ?? [] });
});

// The brief, and the point labels only. The model answer and what each point
// is really asking for stay on the server until something has been written,
// otherwise the reveal is one network tab away and the exercise is pointless.
app.get('/api/scenarios/:id', async (c) => {
  const id = c.req.param('id');
  const scenario = await c.env.DB.prepare(
    'SELECT id, title, role, level, situation, ask, minutes FROM scenarios WHERE id = ?',
  )
    .bind(id)
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

  const scenario = await c.env.DB.prepare(
    'SELECT id, model_answer FROM scenarios WHERE id = ?',
  )
    .bind(body.scenario_id)
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

export default app;
