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

/* --------------------------------------------------------------- static */

app.all('/api/*', (c) => fail(c, 404, 'No such endpoint.'));

// Static files are normally served before the Worker is reached, so this only
// runs for paths with no matching file.
app.all('*', (c) => {
  if (c.env.ASSETS) return c.env.ASSETS.fetch(c.req.raw);
  return c.text('Not found', 404);
});

export default app;
