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
