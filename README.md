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

## Repository layout

```
public/           static landing page, deployed as-is
DESIGN.md         the design language every surface follows
```

The Next.js application will be added alongside `public/` once the data model is
settled.

## Deploy

Cloudflare Pages, connected to this repository.

- Build command: none (static)
- Build output directory: `public`
- Production branch: `main`

Every push to `main` redeploys.

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
