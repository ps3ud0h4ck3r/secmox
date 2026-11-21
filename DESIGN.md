# SecMox design language

Read this before building or changing any SecMox surface: landing page, app
screens, lab UI, mock interview view, emails, decks.

## The concept

A security console you train in. The page is almost black, one neon blue
accent glows, a faint grid sits under everything, and the machine speaks in a
terminal voice. Think lab platform, a little cyberpunk, a little terminal, a
little game: ranks, levels, progress. Everything the candidate has to read
still sits on calm, legible panels. Glow is for the accent, never for body copy.

## Tokens

```css
--bg:#05070B; --panel:#0A0F16; --panel-2:#0C131C; --raise:#101A26;
--text:#E6EEF7; --dim:#A9B8C9; --faint:#8798AC;
--neon:#29B6FF; --neon-hi:#7FD3FF; --neon-ink:#02121C;
--line:rgba(41,182,255,.18); --line-soft:rgba(41,182,255,.1);
--alarm:#FF6B5E; --amber:#FFC24D; --mint:#5FE3A1; --violet:#C38BFF;
```

Background: `--bg`, one soft blue wash at the top, and a 48px grid of
hairlines at 5% neon, fixed attachment.

One accent. `--neon` is the brand, the primary button, the active nav item
and anything the eye should land on. Text on a neon fill is always
`--neon-ink`, never white (white on `#29B6FF` fails contrast).

Colour still carries meaning: `--alarm` is failure and severity, `--amber` is
warning, `--mint` is pass or solved. `--violet` marks the mid-level badge so the
two levels differ in more than hue alone. None of these is decoration.

## Type

- **Chakra Petch** (500 to 700) for headings, prices and big numbers. It is
  the gaming, console edge of the system.
- **IBM Plex Sans** for everything a person reads: body, buttons, labels.
- **JetBrains Mono** for everything a machine says: logs, prompts like
  `> ./start`, timers, panel bars, badges, table heads.

## Surfaces

- **Panel**: `--panel` or a `--panel-2` to `#080C12` fade, 1px `--line`
  border, 12px radius. The default for cards, settings, tasks, lab cards.
- **Terminal** (`.device` + `.screen`): a panel with a mono title bar led by a
  glowing dot. For logs, artifacts, auth forms and transcripts.
- **Lead**: one element per section may take a full `--neon` border and a
  soft blue halo (the Pro tier, the mid-level track, the next mock).

## Controls

Primary button: solid `--neon`, `--neon-ink` text, 8px radius, a blue glow
that strengthens on hover. Ghost: 6% neon fill, 50% neon border, light text.
Minimum height 44px. Inputs are near black with a neon border that brightens
and rings on focus.

## App shell

Signed in, the app is a left sidebar (brand, icon nav, signed-in card at the
bottom) and a fluid main column. The active nav item gets a neon tinted fill
and border. Below 900px the sidebar becomes a top bar and the links wrap.

Lab cards: a mono file-type tag (LOG, PCAP, EML), title, mono meta line, a
level badge (Fresher in neon, Mid-level in violet), Solved in mint, and the
action on the right.

## Isometric

For the one diagram in the landing hero only: `rotateX(56deg) rotateZ(-45deg)`
with `transform-style: preserve-3d`, glowing plates stacked on `translateZ`,
labelled with real artifact names. Never behind text.

## Transition screen

Signing in, creating an account, restoring a session, opening a lab and
opening a practical all go through `splash()` in `public/js/splash.js`. The
mark draws its own outline, the core pops in, then a neon rule sweeps right
and pulls the wordmark out behind it.

Page load is the exception: the session check runs bare and the screen only
goes up once a session comes back. Wrapping the check itself would make every
signed-out visitor sit through a logo on the way to a sign in form.

Two rules it must keep:

- **The work starts first** and runs underneath, so a slow request holds the
  screen rather than making someone wait twice. The screen does set a floor of
  its own, though: at these lengths it is a deliberate beat, not just a cover
  for latency.
- **It always clears.** Removal runs off a timer, never an `animationend`
  event, because `prefers-reduced-motion` cancels every animation here and an
  event that never fires would strand the overlay.

Timing lives in `splash.css` as three numbers on the element: `--beat` (the
drawing), `--hold` (the finished lockup sitting still) and `--fade`. Every
keyframe step is a fraction of `--beat`, so the drawing always completes
whatever the beat is, and `splash.js` reads the three values back off the
element rather than keeping its own copy. Never shorten the screen by
shortening the wait alone: that cuts the drawing off mid-sweep and the
wordmark never arrives.

Full: 1.9s draw, 0.45s hold, 0.38s fade, for auth and session restore.
Short: 1.15s, 0.2s, 0.3s, for opening a lab or a practical. Repeat actions inside a
view, skipping a question or changing a filter, get no screen at all: those
have to stay instant.

This is the orchestrated moment for the app shell, so no app view should add
a second one.

## Landing page scroll

Two scroll-driven moves, both in `landing.js`, both off under
`prefers-reduced-motion`.

**The hero hands the screen over.** It is `position: sticky`, and the section
below rides up over it with an opaque background and the same fixed grid, so
the page opens by passing the screen on rather than scrolling away. The hero's
content fades and drifts up at about two thirds of scroll speed, so the
incoming edge catches it. Fading it in place leaves a long empty band between
the faded hero and the incoming edge; fading it too slowly lets that edge cut
a headline in half. Because the hero stays pinned for the whole page, every
other section is `position: relative; z-index: 1` and the spent hero drops
`pointer-events`, or an invisible hero would swallow clicks meant for the
section actually on screen.

**One pinned section.** The four mode names stay put while their panels scroll
past, and the name belonging to the panel crossing the middle of the viewport
lights up. An `IntersectionObserver` with a thin band in the middle decides
that, so it costs nothing while the page sits still. The dim state stays
readable: these are real headings, not decoration. Below 900px there is
nothing to pin against, so the section goes back to four plain cards.

The fade is a paused Web Animations keyframe seeked by scroll position, not an
inline style, so `style-src` stays strict.

## Detector baseline

```bash
npx -y impeccable@latest detect --no-advisory public/
```

The clean baseline is **31 `dark-glow` findings and nothing else**. The glow
on buttons, the logo, the lead cards and the terminal dot is the look itself,
so those stay, and the count rises by one whenever a new screen reuses them:
it was 30 before the admin scenarios pane, 31 after. Any *other* finding is a
regression, contrast above all: fix it rather than waiving it. The advisory
`codex-grid-background` note is the grid by design.

## Copy voice

Plain, direct, specific to security work. Name the real thing: a pcap, an alert
queue, an EDR verdict, a 2am containment call. No "unlock your potential", no
exclamation marks, no em dashes. Buttons say what happens ("Create account",
never "Submit"), and an action keeps the same name through the whole flow.

## Quality floor

Responsive to mobile, visible keyboard focus, `prefers-reduced-motion`
respected (the log typing, the cursor blink and the floating plates all stop),
and at most one orchestrated motion moment per page.
