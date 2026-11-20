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
  throttleCheck,
  throttleClear,
  throttleFail,
  userForToken,
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
    'SELECT id, email, track, is_admin, password_hash, password_salt, iterations FROM users WHERE email = ?',
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
    user: { id: user.id, email: user.email, track: user.track, is_admin: user.is_admin === 1 },
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

  let fresh = true;
  if (!row) {
    fresh = false;
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
    fresh,
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

  await c.env.DB.prepare(
    `INSERT INTO attempts (id, user_id, question_id, answer, self_rating, depth_reached, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(newId('att'), user.id, question.id, answer, body.self_rating, depth, nowIso())
    .run();

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

app.get('/api/admin/stats', async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM users)      AS users,
            (SELECT COUNT(*) FROM questions)  AS questions,
            (SELECT COUNT(*) FROM follow_ups) AS follow_ups,
            (SELECT COUNT(*) FROM attempts)   AS attempts`,
  ).first();
  return c.json({ stats: row, mail: mailConfigured(c.env) });
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
