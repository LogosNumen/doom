# DESIGN NOTES — Dead Air for Night Listeners

Working notes for a personal homepage built in the spirit of `fauux.neocities.org`.
Nothing is copied from that site: no markup, CSS, JS, text, images, audio or
filenames. What follows is what I *measured* from it, and what I decided to do
with those measurements.

---

## 0. Decisions I made without asking

| Decision | Why |
| --- | --- |
| Built into `E:\china\dead-air\`, not `E:\china\` itself | `E:\china` is a parent folder holding several unrelated projects (`Git`, `LightSensor`, `OBSIDIAN`, `goofcalculator`, `LogosNumen.github.io`, a stray PNG). `git init` at that level would have swallowed all of them into one repo and scattered site files among them. A dedicated subfolder is the only sane reading of "this folder". |
| Deployable root = the repo root | Everything except `tools/`, `.venv/`, `DESIGN_NOTES.md` and `README.md` is site payload. Neocities gets the site files; GitHub Pages deploys from main branch root. No build step, so no `docs/` or `dist/` split. |
| No email in the footer | `EMAIL: none` in the settings. The footer carries the handle as plain text and no `mailto:`. |
| Guestbook `href` left as a marked TODO | The brief said to. **Superseded in the second pass** — the book now works; see section 10. |
| A `.venv` in the repo, gitignored | Pillow and numpy were both missing from the system Python 3.12. `tools/requirements.txt` pins them. |
| Handle `operator`; guest post signed `-vhf` | The brief asked for one post by a different handle, "as if a friend guest-posted". `vhf` reads as another night listener, not a persona. |
| Copyright range 2019–2026 | The reference runs 2013–2025, i.e. "this has been here a long time". Twelve years would be a costume; seven is plausible for a site whose oldest post I actually wrote. |

---

## 1. What I measured from the reference

Pulled with `curl -s`: the homepage, `stylesheet.css`, `stylesheetU800px.css`,
and four subpages (`login.html`, `unorgz.html`, `help.html`, `AboutMe.html`).
Raw source only. No crawling, no mirroring.

### Colour
- Body `background-color: #d2738a` — a dusty rose — but almost entirely covered
  by two stacked tiling background GIFs, so the *rendered* page reads near-black
  with rose showing through the torn edges.
- Text `#c1b492`. A pale warm sand, not white and not grey.
- Links `#d2738a` in every state except `:hover`, which flips to the text colour
  `#c1b492` and runs a 1s glow animation.
- `hr` border colour `#d2738a`. Footer text `#d2738a`. `b` recoloured to
  `#d2738a` at `font-weight: normal` — bold is used as a *colour* hook, not weight.
- Subpages just declare `bgcolor="#000000"` on `<body>` and `<font color="#c1b492">`.
  So the deeper you go, the more it becomes literally black + sand + rose.
- Total palette in play: **two colours and black.** That is the whole thing.

### Type
- No `font-family` on `body` at all — so prose renders in the browser's default
  serif (Times). `h1` explicitly `Times, "Times New Roman", serif`, `font-weight: normal`.
- Sizes, exactly: `h1` 20px · article body 13px · `#navline` 13px · `.author` 13px
  (with `line-height: 40px`) · `.copy` 11px · `h6`/`.mail`/`.date`/`.comment`/footer 9px
  · `.navline` 8px.
- `h5` is `font-weight: normal`. Headings are used as *size classes*, not semantics.
- The signature: `* { letter-spacing: 8px }` on the universal selector. At 13px
  that is ~0.6em of tracking on everything, prose included. `#note` (the glyph
  string) and the blink classes explicitly reset it to `0px`.
- `* { -webkit-font-smoothing: none; font-smooth: never; image-rendering: pixelated }`
  — antialiasing is switched off site-wide, on purpose.
- A `.jap` class re-enables smoothing for Japanese runs, because unsmoothed CJK is
  unreadable.

### Layout & spacing
- Fixed `800px` centred column (`margin-left/right: auto`), `text-align: center`
  for the entire document. Not a grid, not flex — 2013 centring.
- The header block and each post share the same recipe: 800px wide, transparent
  background colour + a tiling background GIF, `box-shadow: black 0 5px 10px`,
  centred text, `padding-top` 40px / 20px, `margin-top` 40px.
- Vertical rhythm is done with literal stacks of `<br />`. Three or four in a row
  between a post's `<hr>` and its image.
- Corner brackets: `display:inline-block; float:left; width:400px` — two 400px
  halves so the upper brackets land at the far edges of the 800px block, and the
  same again for the lower pair. They blink to black on a 2s cycle.
- Post skeleton, verbatim in shape: a 16×16 icon block (a background image on an
  empty div, not an `<img>`), `h1` title, an `h5` "-handle" line, an `h5` date,
  `<br><br>`, `<hr>`, `<br><br><br>`, image, `<p>` prose, trailing `<br>`s.
- Header skeleton: bracket halves, `h1` (title split across `<span>`s each with
  its own animation delay, then the glyph run), a 9px rotating bracketed phrase,
  copyright line, contact lines, bracket halves, a small logo GIF, a two-line
  nav of plain-text links separated by `︱` (U+FE31), `<hr>`, a one-line status
  sentence, a bracketed action link.
- Mobile stylesheet is 12 lines: widths to `100%`, `margin-top` adjusted, corner
  brackets `display:none`. That is the entire responsive story — and the viewport
  tag is `initial-scale=0.5`, i.e. it cheats by zooming out. **I am not doing that**
  (the brief forbids it, and it is the one genuinely bad decision on the page).

### Images
- Every image is a small GIF, most animated, most heavily dithered and banded.
  Displayed at natural size, no `width`/`height` in CSS, `image-rendering: pixelated`
  inherited from the universal selector.
- The site openly says why, in a 2013 post: a 10 MB host limit forced everything
  small. Grain and banding are a budget artefact that became the aesthetic.

### Structure & tone
- Dates are inconsistent on purpose: `12.10.25`, `01.22.25`, `20.09.24`, `30.12.13`,
  `15.12.13`, and a long run of `??.??.13` for anything undated. Both `MM.DD.YY`
  and `DD.MM.YY` appear in the same column.
- Subpages abandon the homepage template entirely — inline `<style>`, `bgcolor`
  attributes, `<font>`, `<div align="center">`, `<sup>` nested in `<sup>` used as a
  size control, anchor-linked sections separated by `● ● ──────── ● ●` rules.
- Titles are fullwidth with corner brackets.
- The "dir" page is a bare alphabetical list of one-word page names, most of which
  explain nothing.
- The login page is a dead end by design: a password box, and a note saying you
  need an invite that will not be given.
- Audio is three stacked `<audio autoplay loop>` elements with no control of any
  kind. **I am not doing that either** — mine is opt-in and one click to mute.

---

## 2. My token system

### Colour — 5 tokens
The reference runs black + one warm pale + one accent. I keep that *relationship*
and that *count*, but recolour it for the motif and desaturate the text toward the
old-terminal grey the brief asks for. Rose becomes a signal-lamp red: the colour of
a light on top of a mast at night.

| Token | Hex | Role |
| --- | --- | --- |
| `--bg` | `#000000` | Pure black. Not `#111`, not tinted. |
| `--fg` | `#c8c3b4` | Pale warm grey. Prose, titles, links at rest. |
| `--dim` | `#6b675e` | Mid grey. Dates, meta, `hr`, footer, listing chrome, the tiled phrase. |
| `--sig` | `#b4503c` | The one accent. Rationed to: sound-on state, link hover, the bracketed action link, the mast light inside generated art. Nothing else. |
| `--ink` | `#1c1a17` | Near-black. The fourth step in the image dither ramp, and the fill behind the focus ring. |

`--fg` on `--bg` is ~11.6:1. `--dim` on `--bg` is ~3.9:1, so `--dim` is never used
for reading text — only for chrome, meta and ornament.

### Fonts — 2 stacks
| Token | Stack | Role |
| --- | --- | --- |
| `--serif` | `Times, "Times New Roman", "Liberation Serif", serif` | Titles and prose. Measured off the reference's `h1` rule; the reference's body inherits the browser default, which is the same font. |
| `--mono` | `"MS Gothic", "Osaka-Mono", "Courier New", monospace` | Ornament glyph runs, the directory listing, the login terminal, help spec lines, and every CJK fragment. CJK-friendly by design. |

No webfonts, no self-hosted font. The pixel lettering on the 88×31 button is drawn
as bitmaps inside `tools/generate_assets.py`, which is the honest way to get a pixel
font without shipping one.

### Type scale
| Step | px | Tracking | Used for |
| --- | --- | --- | --- |
| display | 22 | .30em | Post `h1`, header title |
| nav | 13 | .42em | The nav line |
| body | 13 | .18em | Prose |
| meta | 11 | .40em | Copyright line, status line |
| micro | 9 | .50em | `-handle`, dates, footer, captions |

**Tracking is the one measurement I deliberately pull back from.** The reference
sets `8px` on the universal selector — at 13px that is 0.6em, on prose. It is the
loudest thing about the page and it is also why the page is hard to *read*. I keep
0.4–0.5em on the ornamental sizes where it belongs (nav, meta, micro, glyph runs)
and drop prose to 0.18em, which still reads as tracked-out and still reads as a
page from 2013, but survives a 360px screen. Recorded here because it is the single
biggest intentional divergence.

---

## 3. Homepage wireframe

### Desktop (>=800px, 720px column, centred)

```
                    +- viewport, #000 ----------------------------+
                    |                                             |
 [                  |                                             |  ]   <- corner brackets,
                    |                                             |         float halves, blink
                    |        D e a d   A i r   f o r              |      <- h1, 22px serif,
                    |        N i g h t   L i s t e n e r s        |         fullwidth, staggered
                    |                                             |
                    |      || : .   || : .   M   . : ||   . : ||  |      <- glyph run, mono
                    |                        ^ sound toggle       |         the note = the button
                    |                                             |
                    |            [nobody is listening]            |      <- 9px, rotates language
                    |                                             |
                    |            Copyright (c) 2019-2026          |      <- 11px
                    |                 operator                    |      <- 9px, no mailto
                    |                                             |
                    |               [ mast.gif ]                  |      <- 64x56 animated icon
                    |                                             |
                    |  About | Login | Help | Tracklist           |      <- 13px, .42em
                    |  Dir/etc | Guestbook | Carrier | Nightside   |
                    |                                             |
 [                  |  -----------------------------------------  |  ]
                    |  The carrier is up. No one is modulating it.|      <- status line
                    |            [listen anyway]                  |      <- --sig, -> carrier.html
                    |                                             |
                    +- post ---------------------------------------+
                    |                    #                        |      <- 16px icon block
                    |        T e s t   c a r d ,   0 4 1 2 z      |      <- h1 22px fullwidth
                    |                 -operator                   |      <- 9px micro
                    |                  04.12.26                   |      <- 9px, --dim
                    |  -----------------------------------------  |
                    |                                             |
                    |              [ testcard.gif ]               |      <- small, pixelated
                    |                                             |
                    |   three or four lines of prose, centred,    |      <- 13px .18em
                    |   13px, no more than that                   |
                    |                                             |
                    +- post ---------------------------------------+
                    |                    :                        |
                    |            (10-12 posts total)              |
                    +---------------------------------------------+
                                    [ 88x31.gif ]                        <- footer button
                                  operator  (c)  2019-2026               <- 9px, --dim
```

### Mobile (360–390px)

```
+--------------------+
|  (brackets hidden) |   .frame { display:none } — the same call the reference makes
|                    |
|  D e a d   A i r   |   h1 wraps; column becomes width:100%, 14px side padding
|  f o r   N i g h t |
|  L i s t e n e r s |
|                    |
| || : .  M  . : ||  |   glyph run shortened via CSS (the outer pairs hide)
|                    |
| [nobody is         |
|  listening]        |
|                    |
|   [ mast.gif ]     |   max-width:100%, height:auto
|                    |
| About | Login |    |   nav is inline text — it wraps on its own. No menu,
| Help | Tracklist | |   no hamburger, no JS.
| Dir/etc | ...      |
| ------------------ |
| The carrier is up. |
| [listen anyway]    |
+--------------------+
|         #          |
|  T e s t  c a r d  |   title tracking drops to .18em under 480px so
|    -operator       |   fullwidth titles stop overflowing
|     04.12.26       |
| ------------------ |
|  [ testcard.gif ]  |
|  prose wraps       |
+--------------------+
```

No horizontal scroll at 360px: the column is `width:100%` with `box-sizing:border-box`,
every `img` is `max-width:100%; height:auto`, and the two long ornament runs
(glyph string, footer rule) are shortened rather than allowed to overflow.

---

## 4. Where the boldness goes

**`carrier.html` — the tiled dead-air field.**

The whole viewport filled, edge to edge, with one sentence repeated in 10px
`--dim` mono until it stops being language and becomes texture — and one large
dithered animated GIF of a relay mast burning at the centre of it, on top. The
tiling is generated in JS to fill whatever the viewport happens to be, it drifts
by a fraction of a pixel per frame so the text never quite sits still, and roughly
every 40 seconds one random tile in the field changes to a *different* sentence
and stays changed. Read the wall long enough and it stops saying the same thing.

That is the one place I spend the effect budget. Everything else stays flat.

---

## 5. Not doing

Generic tells that would instantly date this to 2026 instead of 2013:

- All-caps eyebrow labels above headings (`LATEST · DISPATCH`)
- `A · B · C` middot meta strings
- Arrows tacked onto link text (`Read more ->`, `Enter ↗`)
- Fade-and-slide-up reveal on scroll, on anything
- Card grids, tiles, masonry, "featured" blocks
- Glassmorphism, backdrop blur, translucent panels
- Neon glow, `text-shadow` bloom on headings
- Rounded corners, anywhere, on anything
- Box shadows used as elevation (the reference has one hard black shadow; that is a
  1990s drop shadow, not Material elevation — I use a hairline rule instead)
- Gradients of any kind
- Icon fonts, SVG icon sets, emoji as UI
- A hamburger menu or any JS-driven navigation
- Sticky headers, scroll progress bars, back-to-top buttons
- `system-ui` / Inter / Helvetica Neue — the modern-dark-mode giveaway
- Skeleton loaders, spinners, toasts
- Autoplaying audio (the reference *does* do this; it is the one thing I refuse to
  reproduce — sound here is opt-in and one click to mute)
- `initial-scale=0.5` viewport zoom-out as a mobile strategy

Checked the plan back against the design language: black is pure, palette is two
colours plus black, every image is a dithered GIF, the column is centred and narrow,
headings are raw with `<hr>` dividers, fullwidth and corner brackets carry the
ornament, the homepage is one long scroll, subpages break the template, the depths
are chaos. Nothing in the plan reads like a dark-mode blog theme.

---

## 6. Puzzle chain

Recorded here for my own sake; the full spoiler list is at the bottom of README.md.

```
index.html  --HTML comment in source----------->  hidden/0300z.html
index.html  --console.log on load-------------->  hidden/hum.html
about.html  --word "spool", --fg on --fg------->  hidden/tape-b7.html
404.html    --fragment naming the offset------->  points at etc/numbers.html
help.html   --"OFFSET REGISTER ... 07"--------->  the cipher key

etc/numbers.html
    five-digit groups, format 2-1-2
    (first two digits - 07) = letter index, 01..26
    middle digit and last two digits are padding
    decodes to STILLHERE  ---------------------> login.html passphrase

login.html  --FNV-1a 32-bit of the phrase------>  hidden/relay-9.html
```

Hash is an inline FNV-1a so it works from `file://` (SubtleCrypto needs a secure
context, which `file://` is not). It is obfuscation, not security, and the README
says so out loud.

---

## 7. Budget

10 MB hard ceiling, 150 KB soft ceiling per image, measured by
`tools/linkcheck.py`. The constraint is the aesthetic: every GIF is
<=5 colours and <=320px on its long edge before display scaling, which is why they
look the way they look.

---

## 8. Build log — what actually happened

Filled in as I went, so the divergences are on the record.

- **Tracking.** Landed at 0.18em for prose as planned. At 0.6em (the measured
  value) the mobile layout was unreadable and the desktop column was doing more
  wrapping than the reference does, because my column is 720px, not 800px.
- **Column width.** 720px, down from the measured 800px. The brief asks for a
  narrow column and 800px in 2026 does not read as narrow.
- **Antialiasing off.** Kept `-webkit-font-smoothing: none`. It is a large part of
  why the reference looks like it does, and it costs nothing.
- **`box-shadow`.** Dropped. The reference's hard black shadow is invisible against
  a pure black background, so it would have been decoration with no effect. Posts
  are separated by whitespace and an `<hr>` instead.
- **The effect I removed at the end of the critique pass.** The header title
  originally ran a staggered per-span glow animation (the reference does this with
  a `text-shadow` keyframe). Against pure black the glow read as a blur rather than
  a pulse, and it fought the tracking. Removed the `text-shadow` half and kept only
  the staggered opacity fade, which is quieter and reads better.
- **Reduced motion.** Every animated GIF is wrapped in `<picture>` with a
  `prefers-reduced-motion: reduce` source pointing at a static first frame, and the
  CSS kills every keyframe animation under the same query. The carrier field stops
  drifting, and the canvas experiments render one frame and stop.
---

## 9. Critique pass — what the screenshots changed

Screenshotted every page at 1280 and 390 in a headless-equivalent browser pane,
alongside a screenshot of the reference homepage at 1280 for comparison. What
came out of it:

1. **The title was one long line; the reference stacks its title.** This was the
   biggest single difference and I nearly missed it. Side by side, the
   reference's four short centred lines read as a *masthead*; my one long line
   read as a *sentence*. Changed `.title span` from `inline-block` to `block`,
   so the three spans stack. It is a one-word CSS change and it is most of the
   difference between "in the spirit of" and "vaguely similar".
2. **The nav stranded a separator at 390px.** Line two wrapped after the `︱`
   following "Nightside", leaving a bar hanging at the end of the line. Fixed by
   binding each separator to the link that *follows* it inside a
   `white-space: nowrap` group, so a bar can never be orphaned by a wrap.
3. **`carrier.html` was generating about twice the tiles it needed.** I measured
   the glyph box of one `<i>` and divided the field height by it, but rows are
   *line boxes* — the count overshot by the line-height factor. Now reads
   `line-height` off the computed style.
4. **The caption and back link on `carrier.html` were illegible.** A
   `text-shadow` halo is not enough against a field that dense. Sat them on
   solid black chips instead, which is what the reference does to its own
   footer, and for exactly the same reason.
5. **The login could never be solved.** The FNV-1a hash in the browser did not
   match the one in Python, because JavaScript's `*` loses low bits once the
   product passes 2^53. `Math.imul` does an exact 32-bit multiply. Caught only
   because I actually typed the passphrase in and watched it get refused —
   nothing about the page *looked* wrong. Worth remembering that the visual
   pass is not the functional pass.
6. **The console message said "you are the 2th listener".** Reworded.

Also verified, since they are the kind of thing that is easy to assume:

- No console errors on any of the 18 pages.
- No horizontal scroll at 390px or 360px; `scrollWidth` equals `innerWidth`.
- The 404 root-probe resolves to `/` when served at the domain root and to
  `/dead-air/` when served from a subfolder, including for deep misses, and
  falls back to `/` for a path that is not under the site at all.
- Header and post titles measure identically (22px, 6.6px tracking) — they only
  *looked* different because of length.

### The effect I removed

The brief asks for one unnecessary effect to be removed at the end. The header
title originally ran a staggered glow — a `text-shadow` keyframe, which is what
the reference does to its own title. Against a pure black background a glow
reads as a *blur*, not a pulse, and at 0.30em tracking it smeared the letter
edges into each other. Removed the `text-shadow` half of the keyframe and kept
only the staggered opacity fade, which is quieter, does not fight the tracking,
and is closer to what a weak signal actually does.

---

## 10. Second pass — clickability, the backdrop, the book

### The backdrop, and why it got quieter

First version rendered at 1/6 scale with `#1c1a17` (`--ink`) as its top step.
On screen it read as **grey blocks**, not texture — distinct rectangles in the
upper field that looked like rendering artefacts and competed with the prose.

Three changes fixed it: finer cells (1/4 rather than 1/6), a darker ceiling
(`#14120f`, under 2% luminance), and much steeper thresholds so most of the
field stays pure black and only the top few percent of cells lift at all. Dust,
not static. It also runs at 12fps rather than 60 and stops entirely when the
tab is hidden — it is meant to be weather in the room, not something the page
is *doing*.

This is the one place the "pure black background" rule bends, and it bends by
about two percent. Worth recording as a deliberate exception rather than
letting it look like drift.

### The guestbook problem

A static host cannot accept a POST, so "make the guestbook work" has no
straightforward answer. The options were: a third-party hosted book (needs an
account I cannot create), an embedded comment widget (needs a CDN script and
brings trackers — both forbidden here), or something that uses an inbox the
project already has.

Went with the last: signing composes a pre-filled issue on the repository's own
tracker. It genuinely works today with zero setup, adds no third-party
JavaScript, and the page is honest about the mechanism rather than pretending
there is a server. The entry is also held in the visitor's own `localStorage`
and shown marked *held, not yet relayed*, so signing gives feedback instead of
appearing to do nothing.

`RELAY` at the top of the script swaps it to a hosted book in two lines if that
is ever preferred.

### Clickability

- The large image under the header enters `sequence.html` and says nothing
  about where it goes. The reference puts its equivalent in exactly that slot.
- Every image in the post stream opens at double size — keyboard reachable,
  Escape to close, focus restored on close.
- Links get a 150ms colour transition and a hairline rule on hover. Colour
  only, and fast: a link should answer, not perform. No fade-and-slide, which
  is still on the not-doing list.

### The sequence

Eight frames, one page, hash-routed. A page per frame would have been more
faithful to 2013, but the brief here was "smoother" — hash routing gives
linkable frames, a working back button and a crossfade, at the cost of nothing.
Each frame preloads the next while you read it, so the step never shows a gap.

The images are deliberately *almost* representational. A doorway, a rack, a
spool, a window, a road, a mast from underneath, rings coming inward, and then
grain. Procedural art is bad at literal illustration and good at shapes you
recognise a beat late, which happens to be exactly the register this site
wants.
