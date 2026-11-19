// Passwords and sessions.
//
// Passwords: PBKDF2-SHA256 over WebCrypto, 16-byte random salt per user, and
// the iteration count stored per row so it can be raised later without
// invalidating anyone.
//
// Sessions: the cookie carries a 32-byte random token. What is stored in D1 is
// the SHA-256 of that token, so a dump of the sessions table hands out nothing.

export const SESSION_COOKIE = 'sm_session';
export const SESSION_DAYS = 30;

// Workers Free caps CPU at 10ms per request, which this exceeds. On that plan
// lower it (anything you set is recorded per user, so existing logins keep
// working) or move to the paid plan, which is the right home for a paid product.
export const PBKDF2_ITERATIONS = 100_000;

const enc = new TextEncoder();

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomHex(bytes) {
  return toHex(crypto.getRandomValues(new Uint8Array(bytes)));
}

export function newId(prefix) {
  return `${prefix}_${randomHex(12)}`;
}

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

async function sha256Hex(value) {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(value)));
}

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

export async function userForToken(db, token) {
  if (!token) return null;
  const id = await sha256Hex(token);
  const row = await db
    .prepare(
      `SELECT u.id, u.email, u.track, u.created_at, s.expires_at
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.id = ?`,
    )
    .bind(id)
    .first();
  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) {
    await db.prepare('DELETE FROM sessions WHERE id = ?').bind(id).run();
    return null;
  }
  return { id: row.id, email: row.email, track: row.track, created_at: row.created_at };
}

export async function destroySession(db, token) {
  if (!token) return;
  await db.prepare('DELETE FROM sessions WHERE id = ?').bind(await sha256Hex(token)).run();
}

export function sessionCookie(token, maxAgeSeconds) {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  return parts.join('; ');
}

export function readCookie(header, name) {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=');
  }
  return null;
}

// Deliberately permissive: the point is to catch typos, not to police addresses.
export function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function emailLooksValid(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

export function passwordProblem(password) {
  if (typeof password !== 'string' || password.length < 10) {
    return 'Password needs at least 10 characters.';
  }
  if (password.length > 200) return 'Password is too long.';
  return null;
}
