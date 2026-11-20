# SecMox design language

Read this before building or changing any SecMox surface: landing page, app
screens, lab UI, mock interview view, emails, decks.

## The concept

The page is the exam paper. The machine speaks in dark recessed panels;
everything the candidate reads sits on calm, legible surfaces. Hold that split.
Never put body copy inside a glossy, chrome or inflated treatment.

## Four visual languages, one job each

Never apply more than one to the same element.

**Skeuomorphism** is for machine panels only: log viewers, lab artifact readers,
transcript panes, the waitlist form. Build them as physical devices with a raised
bezel, a recessed screen, inner shadow, and one diagonal glare pass.

**3D inflated** is for interactive elements only: buttons, pricing tiers, form
fields, toggles, badges. Soft body, rim light along the top, inner shade at the
bottom, contact shadow below, and 3px of press travel on `:active`.

**Liquid chrome** is for the brand only: the SecMox wordmark, and at most one
hero element per page. Animated gradient with `background-clip: text`. Never on
headings, metrics or body copy.

**Isometric** is for explanatory diagrams only: `rotateX(56deg) rotateZ(-45deg)`
with `transform-style: preserve-3d`, plates stacked on `translateZ`. Never
behind text.

## Tokens

```css
--deep:#0B1622; --steel:#16222F; --raise:#1E2D3D; --rim:#2C3E52;
--text:#E6EDF4; --dim:#9DB1C4;
--blue:#3B7BFF; --blue-deep:#1E4FD0;
--alarm:#FF5A4D; --amber:#FFB341; --mint:#5FD6A4;
--lite:#EDF2F7; --lite-ink:#15202C;
```

Background is two radial washes over `--deep`, fixed attachment.

Colour carries meaning and nothing else: `--alarm` is severity and failure,
`--amber` is warning, `--mint` is pass. None of the three is ever decoration.

## Type

**Archivo** (variable, width axis) for everything a human says. Display at
`font-stretch: 110-116%`, `letter-spacing: -.03em` to `-.04em`, weight 700.

**IBM Plex Mono** for everything a machine says: logs, transcripts, timers,
panel chrome, field labels inside devices.

Two voices, two faces. Mono is not a decorative label style.

## The contrast trap

On a gradient, a contrast checker samples the lightest stop, not the average. An
inflated blue button needs its lightest stop at `#3570E2` or darker to hold
4.5:1 against white text. Check the top of every gradient. This is the most
common regression in this design language.

## Detector findings that are intentional

Run before shipping:

```bash
npx -y impeccable@latest detect public/
```

These are part of the design language, not mistakes. Waive them inline with
`data-impeccable-ignore="<rule>"` on the element rather than removing the
treatment:

- `gradient-text` on the chrome wordmark
- `dark-glow` on the brand LED bead
- `hard-offset-shadow` on inflated bottom edges (advisory only)

`nested-cards` fires on every bezel-plus-screen panel and the inline waiver
does not suppress it, so the clean baseline is **5 findings, all
`nested-cards`**: four in `public/app/` and one in `public/index.html`. Treat a
sixth as new. Every other finding, contrast above all, is a regression: fix it
rather than waiving it.

## Copy voice

Plain, direct, specific to security work. Name the real thing: a pcap, an alert
queue, an EDR verdict, a 2am containment call. No "unlock your potential", no
exclamation marks, no em dashes. Buttons say what happens ("Join the waitlist",
never "Submit"), and an action keeps the same name through the whole flow.

## Quality floor

Responsive to mobile, visible keyboard focus, `prefers-reduced-motion`
respected (kill the log typing and the chrome animation), and at most one
orchestrated motion moment per page.
