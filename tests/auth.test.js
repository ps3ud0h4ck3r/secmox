import { describe, it, expect } from 'vitest';
import {
  normalizeEmail,
  emailLooksValid,
  passwordProblem,
  isContentAdmin,
  readCookie,
  sessionCookie,
  rateLimit,
} from '../src/auth.js';

describe('normalizeEmail', () => {
  it('trims and lower-cases', () => {
    expect(normalizeEmail('  Foo@Bar.COM ')).toBe('foo@bar.com');
  });
  it('returns empty string for non-strings', () => {
    expect(normalizeEmail(undefined)).toBe('');
    expect(normalizeEmail(null)).toBe('');
    expect(normalizeEmail(42)).toBe('');
  });
});

describe('emailLooksValid', () => {
  it('accepts an ordinary address', () => {
    expect(emailLooksValid('a@b.co')).toBe(true);
  });
  it('rejects malformed or oversized addresses', () => {
    expect(emailLooksValid('no-at-sign')).toBe(false);
    expect(emailLooksValid('a@b')).toBe(false);
    expect(emailLooksValid('a @b.co')).toBe(false);
    expect(emailLooksValid(`${'x'.repeat(250)}@b.co`)).toBe(false);
  });
});

describe('passwordProblem', () => {
  it('passes a long enough passphrase', () => {
    expect(passwordProblem('correct horse battery')).toBeNull();
  });
  it('rejects short, non-string, and over-long passwords', () => {
    expect(passwordProblem('short')).toMatch(/at least 10/);
    expect(passwordProblem(12345678901)).toMatch(/at least 10/);
    expect(passwordProblem('x'.repeat(201))).toMatch(/too long/);
  });
  it('rejects obvious weak passwords', () => {
    expect(passwordProblem('letmeinnow123')).toMatch(/too easy/);
    expect(passwordProblem('mypassword99')).toMatch(/too easy/);
  });
});

describe('isContentAdmin', () => {
  it('is true only for owner and developer', () => {
    expect(isContentAdmin('owner')).toBe(true);
    expect(isContentAdmin('developer')).toBe(true);
    expect(isContentAdmin('business')).toBe(false);
    expect(isContentAdmin(null)).toBe(false);
    expect(isContentAdmin(undefined)).toBe(false);
  });
});

describe('readCookie', () => {
  it('reads a named cookie from a header', () => {
    expect(readCookie('a=1; sm_session=abc; b=2', 'sm_session')).toBe('abc');
  });
  it('keeps = inside a value', () => {
    expect(readCookie('t=aa=bb', 't')).toBe('aa=bb');
  });
  it('returns null when absent or no header', () => {
    expect(readCookie('a=1', 'missing')).toBeNull();
    expect(readCookie('', 'x')).toBeNull();
    expect(readCookie(null, 'x')).toBeNull();
  });
});

describe('sessionCookie', () => {
  it('is HttpOnly, Secure, SameSite=Lax with the given max-age', () => {
    const c = sessionCookie('tok', 3600);
    expect(c).toContain('sm_session=tok');
    expect(c).toContain('HttpOnly');
    expect(c).toContain('Secure');
    expect(c).toContain('SameSite=Lax');
    expect(c).toContain('Max-Age=3600');
  });
});

// A minimal in-memory stand-in for the D1 surface rateLimit uses:
// prepare(sql).bind(...).first() / .run().
function fakeDb() {
  const rows = new Map();
  return {
    rows,
    prepare(sql) {
      return {
        sql,
        args: [],
        bind(...a) {
          this.args = a;
          return this;
        },
        async first() {
          if (/SELECT fails, first_fail/.test(this.sql)) {
            return rows.get(this.args[0]) || null;
          }
          return null;
        },
        async run() {
          if (/INSERT INTO auth_throttle/.test(this.sql)) {
            rows.set(this.args[0], { fails: 1, first_fail: this.args[1] });
          } else if (/UPDATE auth_throttle SET fails = fails \+ 1/.test(this.sql)) {
            const r = rows.get(this.args[0]);
            if (r) r.fails += 1;
          }
          return { success: true };
        },
      };
    },
  };
}

describe('rateLimit', () => {
  it('allows up to the limit, then blocks with a positive wait', async () => {
    const db = fakeDb();
    expect(await rateLimit(db, 'k', 3, 60)).toBe(0); // 1
    expect(await rateLimit(db, 'k', 3, 60)).toBe(0); // 2
    expect(await rateLimit(db, 'k', 3, 60)).toBe(0); // 3
    const wait = await rateLimit(db, 'k', 3, 60); // 4 -> blocked
    expect(wait).toBeGreaterThan(0);
    expect(wait).toBeLessThanOrEqual(60 * 60);
  });

  it('keeps separate counts per key', async () => {
    const db = fakeDb();
    await rateLimit(db, 'a', 1, 60);
    expect(await rateLimit(db, 'a', 1, 60)).toBeGreaterThan(0);
    expect(await rateLimit(db, 'b', 1, 60)).toBe(0);
  });

  it('starts a fresh window once the old one has elapsed', async () => {
    const db = fakeDb();
    await rateLimit(db, 'k', 1, 60);
    expect(await rateLimit(db, 'k', 1, 60)).toBeGreaterThan(0);
    // Backdate the window well past 60 minutes.
    db.rows.get('k').first_fail = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
    expect(await rateLimit(db, 'k', 1, 60)).toBe(0);
  });
});
