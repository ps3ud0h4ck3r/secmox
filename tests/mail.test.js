import { describe, it, expect, vi, afterEach } from 'vitest';
import { mailConfigured, resetEmail, inviteEmail, sendMailBatch } from '../src/mail.js';

const liveEnv = { RESEND_API_KEY: 'test_key', MAIL_FROM: 'SecMox <no-reply@secmox.com>' };

describe('mailConfigured', () => {
  it('needs both the key and the from address', () => {
    expect(mailConfigured(liveEnv)).toBe(true);
    expect(mailConfigured({ RESEND_API_KEY: 'k' })).toBe(false);
    expect(mailConfigured({ MAIL_FROM: 'x' })).toBe(false);
    expect(mailConfigured({})).toBe(false);
  });
});

describe('resetEmail', () => {
  it('names the link and reads as a one-time reset', () => {
    const m = resetEmail('https://secmox.com/app/?reset=abc');
    expect(m.subject).toMatch(/reset/i);
    expect(m.text).toContain('https://secmox.com/app/?reset=abc');
  });
});

describe('inviteEmail', () => {
  it('names the company, the link and the expiry', () => {
    const m = inviteEmail('https://secmox.com/join/?token=abc', 'Byte Cyber Labs', 14);
    expect(m.subject).toContain('Byte Cyber Labs');
    expect(m.text).toContain('https://secmox.com/join/?token=abc');
    expect(m.text).toContain('14 days');
  });
  it('falls back to a generic team name when none is given', () => {
    const m = inviteEmail('https://secmox.com/join/?token=abc', '', 7);
    expect(m.subject).toContain('A team');
  });
});

describe('sendMailBatch', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('does nothing and reports no_mailer when mail is off', async () => {
    const r = await sendMailBatch({}, [{ to: 'a@b.co', subject: 's', text: 't' }]);
    expect(r).toEqual({ sent: 0, attempted: 1, reason: 'no_mailer' });
  });

  it('batches in chunks of 100', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    const messages = Array.from({ length: 150 }, (_, i) => ({ to: `u${i}@b.co`, subject: 's', text: 't' }));
    const r = await sendMailBatch(liveEnv, messages);
    expect(fetchMock).toHaveBeenCalledTimes(2); // 100 + 50
    expect(r.sent).toBe(150);
    // The batch endpoint, not the single one.
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.resend.com/emails/batch');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toHaveLength(100);
    expect(body[0]).toMatchObject({ from: liveEnv.MAIL_FROM, to: ['u0@b.co'] });
  });

  it('counts only the chunks Resend accepted', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 429 }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await sendMailBatch(liveEnv, [{ to: 'a@b.co', subject: 's', text: 't' }]);
    expect(r.sent).toBe(0);
  });
});
