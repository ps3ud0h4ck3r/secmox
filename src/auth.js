// Passwords, sessions, reset tokens and sign-in throttling.
//
// Passwords: PBKDF2-SHA256 over WebCrypto, 16-byte random salt per user, and
// the iteration count stored per row so it can be raised later without
// invalidating anyone.
//
// Sessions and reset tokens: the client holds a random token; what is stored
// is its SHA-256. A dump of either table hands out nothing.

export const SESSION_COOKIE = 'sm_session';
export const SESSION_DAYS = 30;
export const RESET_MINUTES = 60;

// Workers Free caps CPU at 10ms per request. If sign-in starts failing with a
// CPU error, lower this: the count is recorded per user, so existing logins
// keep working at whatever they were created with.
export const PBKDF2_ITERATIONS = 100_000;

// Sign-in throttle: this many failures inside the window locks further
// attempts for the cooldown.
const MAX_FAILS = 8;
const WINDOW_MINUTES = 15;
const COOLDOWN_MINUTES = 15;

const enc = new TextEncoder();

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomHex(bytes) {
  return toHex(crypto.getRandomValues(new Uint8Array(bytes)));
}

export function newId(prefix) {
  return `${prefix}_${randomHex(12)}`;
}

export async function sha256Hex(value) {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(value)));
}

/* ----------------------------------------------------------- passwords */

export async function derivePasswordHash(password, saltHex, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(saltHex), iterations },
    key,
    256,
  );
  return toHex(bits);
}

export async function hashNewPassword(password) {
  const salt = randomHex(16);
  const hash = await derivePasswordHash(password, salt, PBKDF2_ITERATIONS);
  return { salt, hash, iterations: PBKDF2_ITERATIONS };
}

// Length-independent compare, so a wrong password reveals nothing through timing.
function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export async function verifyPassword(password, user) {
  const candidate = await derivePasswordHash(password, user.password_salt, user.iterations);
  return constantTimeEqual(candidate, user.password_hash);
}

/* ------------------------------------------------------------ sessions */

export async function createSession(db, userId) {
  const token = randomHex(32);
  const id = await sha256Hex(token);
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 864e5);
  await db
    .prepare('INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(id, userId, now.toISOString(), expires.toISOString())
    .run();
  return { token, expires };
}

// The content pages treat owner and developer as admins; business sells and
// does not touch content, so it is not a content admin.
export function isContentAdmin(platformRole) {
  return platformRole === 'owner' || platformRole === 'developer';
}

// Resolves a token to the EFFECTIVE user, which is the impersonated target when
// a platform account is viewing as someone, otherwise the account itself. When
// impersonating, `actor` carries the real platform account so the middleware
// knows both who is acting and as whom; otherwise `actor` is null.
export async function userForToken(db, token) {
  if (!token) return null;
  const id = await sha256Hex(token);
  const row = await db
    .prepare(
      `SELECT s.expires_at, s.impersonating_user_id,
              u.id AS u_id, u.email AS u_email, u.track AS u_track,
              u.created_at AS u_created, u.platform_role AS u_role, u.target_role AS u_target,
              u.onboarded_at AS u_onboarded,
              t.id AS t_id, t.email AS t_email, t.track AS t_track,
              t.created_at AS t_created, t.platform_role AS t_role, t.target_role AS t_target,
              t.onboarded_at AS t_onboarded
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         LEFT JOIN users t ON t.id = s.impersonating_user_id
        WHERE s.id = ?`,
    )
    .bind(id)
    .first();
  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) {
    await db.prepare('DELETE FROM sessions WHERE id = ?').bind(id).run();
    return null;
  }

  const impersonating = Boolean(row.impersonating_user_id && row.t_id);
  const eff = impersonating
    ? { id: row.t_id, email: row.t_email, track: row.t_track, created_at: row.t_created, role: row.t_role, target: row.t_target, onboarded: row.t_onboarded }
    : { id: row.u_id, email: row.u_email, track: row.u_track, created_at: row.u_created, role: row.u_role, target: row.u_target, onboarded: row.u_onboarded };

  return {
    id: eff.id,
    email: eff.email,
    track: eff.track,
    created_at: eff.created_at,
    platform_role: eff.role ?? null,
    target_role: eff.target ?? null,
    onboarded_at: eff.onboarded ?? null,
    is_admin: isContentAdmin(eff.role),
    impersonating,
    actor: impersonating
      ? { id: row.u_id, email: row.u_email, platform_role: row.u_role ?? null }
      : null,
  };
}

export async function destroySession(db, token) {
  if (!token) return;
  await db.prepare('DELETE FROM sessions WHERE id = ?').bind(await sha256Hex(token)).run();
}

export async function destroyAllSessions(db, userId) {
  await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
}

export function sessionCookie(token, maxAgeSeconds) {
  return [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ].join('; ');
}

export function readCookie(header, name) {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=');
  }
  return null;
}

/* -------------------------------------------------------- reset tokens */

export async function createResetToken(db, userId) {
  // One live token per account: asking again invalidates the last link.
  await db.prepare('DELETE FROM password_resets WHERE user_id = ?').bind(userId).run();
  const token = randomHex(32);
  const now = new Date();
  const expires = new Date(now.getTime() + RESET_MINUTES * 60_000);
  await db
    .prepare(
      'INSERT INTO password_resets (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
    )
    .bind(await sha256Hex(token), userId, now.toISOString(), expires.toISOString())
    .run();
  return { token, expires };
}

export async function consumeResetToken(db, token) {
  if (!token) return null;
  const id = await sha256Hex(token);
  const row = await db
    .prepare('SELECT id, user_id, expires_at, used_at FROM password_resets WHERE id = ?')
    .bind(id)
    .first();
  if (!row || row.used_at) return null;
  if (new Date(row.expires_at) < new Date()) {
    await db.prepare('DELETE FROM password_resets WHERE id = ?').bind(id).run();
    return null;
  }
  await db
    .prepare('UPDATE password_resets SET used_at = ? WHERE id = ?')
    .bind(new Date().toISOString(), id)
    .run();
  return row.user_id;
}

/* ----------------------------------------------------------- throttling */

export async function throttleCheck(db, keys) {
  const now = new Date();
  for (const key of keys) {
    const row = await db
      .prepare('SELECT fails, first_fail, locked_until FROM auth_throttle WHERE key = ?')
      .bind(key)
      .first();
    if (row?.locked_until && new Date(row.locked_until) > now) {
      const seconds = Math.ceil((new Date(row.locked_until) - now) / 1000);
      return Math.max(seconds, 1);
    }
  }
  return 0;
}

export async function throttleFail(db, keys) {
  const now = new Date();
  const windowStart = new Date(now.getTime() - WINDOW_MINUTES * 60_000);
  for (const key of keys) {
    const row = await db
      .prepare('SELECT fails, first_fail FROM auth_throttle WHERE key = ?')
      .bind(key)
      .first();

    if (!row || new Date(row.first_fail) < windowStart) {
      await db
        .prepare(
          `INSERT INTO auth_throttle (key, fails, first_fail, locked_until) VALUES (?, 1, ?, NULL)
           ON CONFLICT(key) DO UPDATE SET fails = 1, first_fail = excluded.first_fail, locked_until = NULL`,
        )
        .bind(key, now.toISOString())
        .run();
      continue;
    }

    const fails = row.fails + 1;
    const locked =
      fails >= MAX_FAILS ? new Date(now.getTime() + COOLDOWN_MINUTES * 60_000).toISOString() : null;
    await db
      .prepare('UPDATE auth_throttle SET fails = ?, locked_until = ? WHERE key = ?')
      .bind(fails, locked, key)
      .run();
  }
}

export async function throttleClear(db, keys) {
  for (const key of keys) {
    await db.prepare('DELETE FROM auth_throttle WHERE key = ?').bind(key).run();
  }
}

// General fixed-window rate limiter, for actions that have no "fail" signal of
// their own (signup, password-reset request, reset submit). Counts every call
// under `key` inside the window and blocks once it passes `limit`. Reuses the
// auth_throttle table; callers namespace their keys (e.g. 'signup:ip:1.2.3.4')
// so they never collide with the sign-in throttle's bare ip:/email: keys.
// Returns the seconds to wait when over the limit, otherwise 0.
export async function rateLimit(db, key, limit, windowMinutes) {
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowMinutes * 60_000);
  const row = await db
    .prepare('SELECT fails, first_fail FROM auth_throttle WHERE key = ?')
    .bind(key)
    .first();

  // No row, or the window has rolled over: start a fresh window at 1.
  if (!row || new Date(row.first_fail) < windowStart) {
    await db
      .prepare(
        `INSERT INTO auth_throttle (key, fails, first_fail, locked_until) VALUES (?, 1, ?, NULL)
         ON CONFLICT(key) DO UPDATE SET fails = 1, first_fail = excluded.first_fail, locked_until = NULL`,
      )
      .bind(key, now.toISOString())
      .run();
    return 0;
  }

  if (row.fails >= limit) {
    const resetAt = new Date(new Date(row.first_fail).getTime() + windowMinutes * 60_000);
    return Math.max(Math.ceil((resetAt - now) / 1000), 1);
  }

  await db.prepare('UPDATE auth_throttle SET fails = fails + 1 WHERE key = ?').bind(key).run();
  return 0;
}

// Best-effort housekeeping so the table does not grow without bound. Drops rows
// whose window closed over a day ago and are not actively locked. Called with a
// low probability from the open auth routes, so it costs almost nothing.
export async function purgeThrottle(db) {
  const cutoff = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  await db
    .prepare(
      `DELETE FROM auth_throttle
        WHERE first_fail < ? AND (locked_until IS NULL OR locked_until < ?)`,
    )
    .bind(cutoff, new Date().toISOString())
    .run();
}

/* ----------------------------------------------------------- validation */

export function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function emailLooksValid(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

// Length beats composition rules: a long passphrase is stronger than a short
// string with a symbol bolted on, and composition rules push people to reuse.
export function passwordProblem(password) {
  if (typeof password !== 'string' || password.length < 10) {
    return 'Password needs at least 10 characters.';
  }
  if (password.length > 200) return 'Password is too long.';
  const weak = ['password', '1234567890', 'qwertyuiop', 'letmeinnow'];
  if (weak.some((w) => password.toLowerCase().includes(w))) {
    return 'That password is too easy to guess. Try a phrase instead.';
  }
  return null;
}
