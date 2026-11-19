import { Hono } from 'hono';
import {
  SESSION_COOKIE,
  SESSION_DAYS,
  createSession,
  destroySession,
  emailLooksValid,
  hashNewPassword,
  newId,
  normalizeEmail,
  passwordProblem,
  readCookie,
  sessionCookie,
  userForToken,
  verifyPassword,
} from './auth.js';

const app = new Hono();

const TRACKS = new Set(['fresher', 'mid', 'exploring']);
const ROLES = new Set(['soc', 'pentest', 'network', 'cloud', 'grc']);
const LEVELS = new Set(['fresher', 'mid']);
const RATINGS = new Set(['got_it', 'shaky', 'missed']);

const fail = (c, status, message) => c.json({ error: message }, status);

function tokenFrom(c) {
  return readCookie(c.req.header('cookie'), SESSION_COOKIE);
}

// Everything under /api except signup and login needs a session.
app.use('/api/*', async (c, next) => {
  const open = ['/api/auth/signup', '/api/auth/login'];
  if (open.includes(new URL(c.req.url).pathname)) return next();

  const user = await userForToken(c.env.DB, tokenFrom(c));
  if (!user) return fail(c, 401, 'Sign in to continue.');
  c.set('user', user);
  return next();
});

/* ---------------------------------------------------------- auth */

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
    `INSERT INTO users (id, email, password_hash, password_salt, iterations, track, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, email, hash, salt, iterations, track, new Date().toISOString())
    .run();

  const { token } = await createSession(c.env.DB, id);
  c.header('Set-Cookie', sessionCookie(token, SESSION_DAYS * 86400));
  return c.json({ user: { id, email, track } }, 201);
});

app.post('/api/auth/login', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return fail(c, 400, 'Send JSON.');

  const email = normalizeEmail(body.email);
  const user = await c.env.DB.prepare(
    'SELECT id, email, track, password_hash, password_salt, iterations FROM users WHERE email = ?',
  )
    .bind(email)
    .first();

  // Same message either way: whether an address is registered is not public.
  const wrong = () => fail(c, 401, 'Email or password is wrong.');
  if (!user) return wrong();
  if (!(await verifyPassword(body.password ?? '', user))) return wrong();

  const { token } = await createSession(c.env.DB, user.id);
  c.header('Set-Cookie', sessionCookie(token, SESSION_DAYS * 86400));
  return c.json({ user: { id: user.id, email: user.email, track: user.track } });
});

app.post('/api/auth/logout', async (c) => {
  await destroySession(c.env.DB, tokenFrom(c));
  c.header('Set-Cookie', sessionCookie('', 0));
  return c.json({ ok: true });
});

app.get('/api/me', (c) => c.json({ user: c.get('user') }));

/* ----------------------------------------------------- questions */

function filters(c) {
  const role = c.req.query('role');
  const level = c.req.query('level');
  return {
    role: ROLES.has(role) ? role : null,
    level: LEVELS.has(level) ? level : null,
  };
}

// The next question worth asking: something unseen first, otherwise whatever
// went worst longest ago.
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
  const depth = Number.isInteger(body.depth_reached) ? Math.max(0, Math.min(10, body.depth_reached)) : 0;

  await c.env.DB.prepare(
    `INSERT INTO attempts (id, user_id, question_id, answer, self_rating, depth_reached, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(newId('att'), user.id, question.id, answer, body.self_rating, depth, new Date().toISOString())
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

/* -------------------------------------------------------- static */

app.all('/api/*', (c) => fail(c, 404, 'No such endpoint.'));
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
