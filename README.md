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
src/auth.js         password hashing and sessions
public/index.html   landing page
public/app/         the practice app
schema.sql          D1 tables
seed.sql            generated; edit tools/questions.js instead
tools/questions.js  the question bank, with each question's follow-up chain
tools/seed.js       regenerates seed.sql
DESIGN.md           the design language every surface follows
```

## Data model

| Table | Holds |
| --- | --- |
| `users` | email, PBKDF2 hash with per-row salt and iteration count, track |
| `sessions` | SHA-256 of the cookie token, so a table dump grants nothing |
| `questions` | prompt and model answer, by role, level and topic |
| `follow_ups` | the ordered chain an interviewer walks after the first answer |
| `attempts` | what the candidate wrote, their self-rating, how deep they got |

## Deploy

Cloudflare Workers Builds, connected to this repository. Every push to `main`
builds and deploys. Bindings come from `wrangler.jsonc`, so the D1 database is
attached on deploy and needs no dashboard step.

Schema and seed changes do not travel with a push. Apply those against the
remote database:

```bash
node tools/seed.js                                        # regenerate seed.sql
npx wrangler d1 execute secmox --remote --file=schema.sql
npx wrangler d1 execute secmox --remote --file=seed.sql
```

## Auth note

Passwords use PBKDF2-SHA256 at 100,000 iterations, which exceeds the 10ms CPU
budget on the Workers Free plan. On that plan, either lower
`PBKDF2_ITERATIONS` in `src/auth.js` or move to the paid plan. The iteration
count is stored per user, so changing it does not lock anyone out.

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
