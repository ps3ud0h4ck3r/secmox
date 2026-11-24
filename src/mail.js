// Outbound email, currently for password resets only.
//
// Sending needs two secrets on the Worker:
//   RESEND_API_KEY   from resend.com
//   MAIL_FROM        e.g. "SecMox <no-reply@secmox.com>"
//
// Until a domain is verified at Resend, MAIL_FROM can be
// "SecMox <onboarding@resend.dev>", which only delivers to the address the
// Resend account was registered with. Good enough to test the flow, not
// enough to launch on.
//
// With no key configured, send() reports that it could not send rather than
// pretending it did. The reset flow still records the token, so the link can
// be delivered by hand if it ever has to be.

export function mailConfigured(env) {
  return Boolean(env.RESEND_API_KEY && env.MAIL_FROM);
}

export async function sendMail(env, { to, subject, text }) {
  if (!mailConfigured(env)) {
    return { sent: false, reason: 'no_mailer' };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, text }),
    });
    if (!res.ok) {
      return { sent: false, reason: `resend_${res.status}` };
    }
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: 'network' };
  }
}

// Send many messages in as few requests as possible. Resend's batch endpoint
// takes up to 100 at a time, so a class-sized invite list is one or two calls
// rather than one fetch per address, which would blow the Worker's subrequest
// budget. Returns how many were handed to Resend; a failed chunk is left unsent
// so the caller can still fall back to showing the links.
export async function sendMailBatch(env, messages) {
  if (!mailConfigured(env) || !messages.length) {
    return { sent: 0, attempted: messages.length, reason: mailConfigured(env) ? null : 'no_mailer' };
  }
  let sent = 0;
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100).map((m) => ({
      from: env.MAIL_FROM,
      to: [m.to],
      subject: m.subject,
      text: m.text,
    }));
    try {
      const res = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(chunk),
      });
      if (res.ok) sent += chunk.length;
    } catch {
      // Leave this chunk unsent; the caller keeps the links as a fallback.
    }
  }
  return { sent, attempted: messages.length };
}

export function resetEmail(link) {
  return {
    subject: 'Reset your SecMox password',
    text: [
      'Someone asked to reset the password on this SecMox account.',
      '',
      'Open this link within the hour to set a new one:',
      link,
      '',
      'The link works once. If you did not ask for this, ignore this email;',
      'nothing changes until the link is used.',
    ].join('\n'),
  };
}

export function verifyEmail(link) {
  return {
    subject: 'Confirm your SecMox email',
    text: [
      'Welcome to SecMox, a practice space for cybersecurity and IT interviews.',
      '',
      'Confirm this email address by opening the link below:',
      link,
      '',
      'The link works once and expires in a few days. You can keep using',
      'SecMox in the meantime; this just verifies the address is yours.',
    ].join('\n'),
  };
}

export function inviteEmail(link, orgName, days) {
  const team = orgName || 'A team';
  return {
    subject: `You're invited to ${team} on SecMox`,
    text: [
      `${team} has invited you to join their team on SecMox,`,
      'a practice space for cybersecurity and IT interviews.',
      '',
      'Open this link to accept and set up your account:',
      link,
      '',
      `The invite is tied to this email address and expires in ${days} days.`,
      'If you were not expecting it, you can ignore this email.',
    ].join('\n'),
  };
}
