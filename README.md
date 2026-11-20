# SecMox

Interview practice for IT and security roles, built around the rounds people
actually fail: the practical, the scenario, and the live grilling.

## Who it is for

- **Freshers** (0 to 2 years) — fundamentals that survive a follow-up, labs with
  guidance, HR rounds, resume review.
- **Mid-level** (2 to 7 years) — incident response end to end, architecture
  trade-offs, tool depth (SIEM, EDR), defending decisions under pressure.

## What it does

| Mode | What the candidate does |
| --- | --- |
| Question bank | Answers role-filtered questions, each carrying the follow-up an interviewer asks next |
| Browser labs | Reads real artifacts (pcaps, auth logs, alert queues, phishing headers) in the browser, no VM setup |
| Mock interviews | Gets grilled for 30 minutes, timed, then reads a transcript marking where the answer went thin |
| Scenario writing | Writes an end-to-end incident response, scored against a hiring-panel rubric |

## Pricing

- Free — 50 questions, 2 labs, 1 mock a month, coverage score
- Pro, 699 INR a month — full bank, every lab, unlimited mocks, scored scenarios
- Live round, 999 INR a mock — 45 minutes one-on-one, company-specific, written report

## Stack

Cloudflare Worker (Hono) in front of D1, serving static files from `public/`.
No build step beyond `npm install`, and nothing to run locally to ship a change.

```
src/index.js        routes: /api/* on the Worker, everything else from public/
src/auth.js         passwords, sessions, reset tokens, sign-in throttling
src/mail.js         outbound email (Resend), used by password reset
public/index.html   landing page
public/app/         sign in, password reset, the practice loop, account
public/admin/       question bank editor, for accounts flagged is_admin
public/_headers     security headers for the static pages
schema.sql          D1 tables
seed.sql            generated; edit tools/bank/ instead
tools/bank/*.js     the question bank, one file per role
tools/seed.js       regenerates seed.sql
DESIGN.md           the design language every surface follows
```

## Accounts

Email and password. PBKDF2-SHA256 with a per-user salt and the iteration count
stored per row. Session cookies carry a random token; what D1 holds is its
SHA-256, so a dump of the sessions table grants nothing. Reset tokens work the
same way, expire in an hour and are single use.

Sign-in failures are counted separately by address and by email, so flooding
one address cannot lock a stranger out of their own account. Eight failures in
fifteen minutes buys a fifteen-minute cooldown.

An account can change its password, sign out everywhere, export everything it
holds, and delete itself. Changing or resetting a password ends every other
session.

Admin is a flag on the user row, set directly in the database:

```sql
UPDATE users SET is_admin = 1 WHERE email = 'you@example.com';
```

## Email

Password reset needs two secrets on the Worker, set in the Cloudflare
dashboard under Settings, Variables and Secrets:

| Secret | Value |
| --- | --- |
| `RESEND_API_KEY` | from resend.com |
| `MAIL_FROM` | e.g. `SecMox <no-reply@secmox.com>` |

Before a domain is verified at Resend, `SecMox <onboarding@resend.dev>` works
but only delivers to the address the Resend account was registered with.
Without these set, the reset endpoint says it cannot send rather than
pretending it did, and the admin page shows a warning.

## Data model

| Table | Holds |
| --- | --- |
| `users` | email, PBKDF2 hash with per-row salt and iteration count, track |
| `sessions` | SHA-256 of the cookie token, so a table dump grants nothing |
| `questions` | prompt and model answer, by role, level and topic |
| `follow_ups` | the ordered chain an interviewer walks after the first answer |
| `attempts` | what the candidate wrote, their self-rating, how deep they got |

## Deploy

GitHub Actions (`.github/workflows/deploy.yml`) on every push to `main`, and by
hand from the Actions tab. It installs, runs `wrangler deploy --dry-run` to
catch config and bundling errors, then deploys. Bindings come from
`wrangler.jsonc`, so D1 attaches on deploy with no dashboard step.

Two repository secrets are required: `CLOUDFLARE_API_TOKEN` (Workers Scripts
Edit, D1 Edit, Account Settings Read) and `CLOUDFLARE_ACCOUNT_ID`.

Cloudflare's own git integration is not used: it stopped delivering push events
for this repository and produced no builds, successful or failed.

Schema and seed are a separate manual workflow (`.github/workflows/db.yml`,
Actions tab, Run workflow). That is deliberate. Once questions are edited from
the admin page, `tools/bank/` is a baseline rather than the live truth, and
seeding again overwrites those rows with the file versions.

Before pushing, the same checks run locally without credentials:

```bash
npm run verify     # bundle and bindings
npm run check      # the design detector; see DESIGN.md for the baseline
```

## Known trade-offs

**PBKDF2 cost.** 100,000 iterations exceeds the 10ms CPU budget on the Workers
Free plan. It runs fine on the current plan; if sign-in ever starts failing with
a CPU error, lower `PBKDF2_ITERATIONS` in `src/auth.js`. The count is stored per
user, so changing it locks nobody out.

**CSP allows inline scripts.** Every page keeps its script inline, so
`script-src` needs `'unsafe-inline'`. External script loading is still blocked
and nothing user-supplied is ever written as HTML, but moving the scripts to
their own files and dropping `'unsafe-inline'` is the real fix and is worth
doing.

## Waitlist

`public/index.html` has a single constant near the top of its script block:

```js
const FORM_ENDPOINT = "";
```

Set it to a Formspree, Tally or Getform URL and the waitlist posts there. Left
empty, the form only works for signed-in viewers of the Claude artifact preview,
which is not enough for a public page.

## Design and quality checks

Read `DESIGN.md` before changing any UI. Before shipping a page:

```bash
npx -y impeccable@latest detect public/
```

Fix every contrast finding. Four rules are waived inline on purpose and are
documented in `DESIGN.md`; anything else the detector reports is a regression.
