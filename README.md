# Dead Air for Night Listeners

An unmanned relay station that kept transmitting after everyone left.

Static HTML, CSS and vanilla JavaScript. No build step, no framework, no CDN,
no webfonts, no analytics, no cookies, no trackers. It runs from a file on a
disk, from `python3 -m http.server`, from Neocities, and from a GitHub Pages
project site, without changing a line.

Design decisions and what they were measured against: **[DESIGN_NOTES.md](DESIGN_NOTES.md)**.

---

## What is here

```
index.html          the homepage — the framed title, the nav, the post stream
about.html          recovered transmission fragments
login.html          a login nobody can register for
help.html           a manual for a machine that may not exist
tracklist.html      seven Web Audio patches. no audio files exist.
dir.html            an "Index of /etc" listing
carrier.html        one sentence, tiled until it stops being a sentence
404.html            \  identical, self-contained, work at any URL
not_found.html      /  (GitHub Pages uses the first, Neocities the second)

etc/                the experiments — snow, scope, numbers, mirror, forecast
hidden/             four pages that are not linked from anywhere
img/                every image. all generated. see below.
css/site.css        the homepage stylesheet. subpages carry their own.
js/sound.js         the audio bus — one source at a time, site-wide
js/site.js          the homepage odds and ends

tools/              not part of the deployed site. see below.
```

---

## Adding a post

Posts are plain HTML written straight into `index.html`, so the homepage works
with JavaScript switched off. There is no post loader and no JSON file.

Open `index.html`, find the commented template at the top of `<div class="stream">`,
copy it, and paste it directly underneath. Newest first.

```html
<div class="post">
  <div class="mark"></div>
  <h1>Ｆｕｌｌｗｉｄｔｈ　ｔｉｔｌｅ</h1>
  <h5 class="by">-operator</h5>
  <h5 class="date">??.??.26</h5>
  <hr>
  <picture class="shot">
    <source srcset="img/thing_still.gif" media="(prefers-reduced-motion: reduce)">
    <img src="img/thing.gif" width="000" height="000" alt="Say what is in it.">
  </picture>
  <p>A few lines. Terse. Do not explain.</p>
</div>
```

Notes on filling it in:

- **The title goes through the fullwidth converter.** Do not type fullwidth
  characters by hand — you will mix half-width and full-width and it will show.
  ```bash
  python tools/fullwidth.py "Test card, 0412z"
  ```
- **Dates are inconsistent on purpose.** `04.12.26`, `28.02.25` and `??.??.24`
  are all valid. Mixing `DD.MM` and `MM.DD` in the same column is the point.
- **`alt` text is required and must say something.** Cryptic is fine; empty is
  not. Every image on the site has one.
- **Always use `<picture>` with the `_still` source.** That is what swaps the
  animation out for a static frame under `prefers-reduced-motion`.
- **Put real `width` and `height` on the `<img>`** so the page does not jump
  while images load.
- To let someone else sign a post, change `-operator` to their handle. There is
  one guest post already, signed `-vhf`.

---

## Images

Every image on this site is generated. Nothing is downloaded, traced or sampled.
Photographs go through the same pipeline as the generated art, so they land in
the same visual world.

### Dithering your own photos

```bash
python tools/dither.py me.jpg img/me.gif --width 240 --colors 4 --mode bayer8
```

| Option | What it does |
| --- | --- |
| `--width N` | resize so the long edge is N px |
| `--palette 1bit\|greys\|site` | 1bit is black + the text colour; `site` is the four-tone site ramp |
| `--colors N` | number of grey levels when `--palette greys` |
| `--mode floyd-steinberg\|bayer4\|bayer8` | error diffusion, or ordered (bayer bands harder — usually what you want) |
| `--noise F` | 0–1, film grain added before dithering |
| `--scanlines` | darken every other row |
| `--gamma F` / `--contrast F` | tune before quantising |
| `--signal` | add the accent red to the palette |
| `--fps N` | frame rate for animated output |

Animated GIFs keep their frames, and a `_still` first frame is written next to
every animation automatically — that is the file the `<picture>` element points
at for reduced motion.

Aim for **under 150 KB per image**. If you are over, drop `--width` or
`--colors` before anything else. The whole look came out of a size limit;
treating the budget as a constraint is what keeps it honest.

### Regenerating the whole starter set

```bash
python tools/generate_assets.py            # everything
python tools/generate_assets.py mast wire  # just those
```

This draws the mast, the test card, the wireframe, the static, the snow, the
waveform, the dial, the meter, the horizon, the header icon, the 88×31 button
and the favicons — then pushes all of them through `dither.py`. The 88×31
button's lettering is a 3×5 pixel font defined as binary strings inside the
script, which is how you get pixel type without shipping a font file.

The 404 pages embed their own image as a data URI, so they are rebuilt
separately:

```bash
python tools/build_404.py     # writes 404.html and not_found.html, identical
```

### First-time setup

Pillow and numpy are the only dependencies.

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r tools/requirements.txt   # Windows
# source .venv/bin/activate && pip install -r tools/requirements.txt   # macOS / Linux
```

---

## Checking it

```bash
python tools/linkcheck.py
```

Reports broken internal links, missing images, dead `#anchor` targets, absolute
paths that would break in a subfolder, images over 150 KB, and the total
deployable size against the 10 MB budget. Exits non-zero if anything is wrong.

To serve it locally:

```bash
python -m http.server 8811
```

To check it also survives being served from a subfolder — which is what a
GitHub Pages project site does — serve the *parent* directory and open
`http://localhost:8812/dead-air/`:

```bash
cd .. && python -m http.server 8812
```

Both were tested. Every internal path on the site is relative, with one
deliberate exception documented under Deploying.

---

## Deploying

Everything in the repo root **except** `tools/`, `.venv/`, `README.md` and
`DESIGN_NOTES.md` is site payload. There is no build step, so there is nothing
to compile and no `dist/` directory.

### Neocities

Upload the site files. `tools/` is optional — it is only needed if you want to
generate new images, and Neocities will not run Python anyway.

Neocities serves **`not_found.html`** for missing pages. It is already in the
root and is byte-identical to `404.html`.

### GitHub Pages

Settings → Pages → Deploy from a branch → `main` / `/ (root)`.

GitHub Pages serves **`404.html`** for missing pages. Also already in the root.

Both project sites (`user.github.io/repo/`) and user sites
(`user.github.io/`) work, because every link on the site is relative.

### The one absolute path, and why

`404.html` and `not_found.html` are served at whatever URL somebody mistyped,
so no relative path in them can be trusted. Their "back to the station" link
starts as `href="/"` — correct on Neocities and on a user site — and then a
small inline script probes for the real site root by requesting `img/favicon.gif`
at each candidate prefix, keeping the shallowest one that answers. On a project
site that resolves to `/repo/`. With JavaScript off you get `/`, which is the
least-wrong static answer available.

`tools/linkcheck.py` knows about this exception and does not flag it.

---

## Sound

There is no audio file anywhere in this repository. Everything is oscillators,
filtered noise, slow LFOs, and `speechSynthesis`.

- **Nothing plays until you click.** No autoplay, ever.
- The **♫** in the header glyph string is the toggle. On pages that break the
  homepage template, `sound.js` injects a small `♫` at the top right — so mute
  is one click away on every page on the site.
- First switch-on makes the station say its own name, slowly and low, preferring
  a whisper voice if the OS has one. It only does that once per page load.
- The setting is saved in `localStorage`. If it was on, sound resumes on your
  next interaction with any page — a click or a keypress — because browsers
  will not start audio without a gesture, and should not.
- **Exactly one source plays at a time, site-wide.** The tracklist, the scope
  tones, the numbers station and the hum all go through the same bus; starting
  one stops whatever else was running.

### Your own records

The tracklist has a second section that plays audio files from your own
machine. **No audio is stored in this repository and none is uploaded** — the
files are read in the browser, kept in IndexedDB (`da-tracks`) on that device
only, and removed when you clear site data. `*.mp3`, `*.m4a`, `*.flac`, `*.ogg`,
`*.opus` and `*.wav` are gitignored so a copy cannot be committed by accident.

Imported tracks go out through the same single-source bus as the patches, so
starting a record stops whatever drone was running, and vice versa. They get
the same text level meter, driven off an `AnalyserNode` reading the real
signal. The station's master gain sits low because everything else is a drone,
so records are given that headroom back on the way through.

`localStorage` keys, and nothing else: the sound setting (`da.sound`), whether
the hidden door has been opened (`da.relay9`), reading position
(`da.reader.pos`), which volume of a series you were last in
(`da.reader.series`), and reader text size (`da.reader.size`).

---

## Accessibility and motion

- `prefers-reduced-motion: reduce` kills every CSS animation and swaps every
  animated GIF for its static first frame via `<picture>`. The carrier field
  stops drifting; the canvas experiments render one frame and stop.
- Visible keyboard focus everywhere, including on the invisible link in
  `about.html` — it reveals itself on focus, so it is reachable by keyboard and
  not only by mouse-dragging.
- Body text is `#c8c3b4` on `#000000`, about 11.6:1. The mid grey `#6b675e` is
  about 3.9:1 and is used only for meta, rules and ornament — never for reading
  text.
- The camera page asks for nothing until you press the button, and says so
  before you do.

---
---

## SPOILERS

Everything below gives the site away. It is here so you can find your own
secrets again in two years.

### The four hidden pages, and how you are meant to reach them

| Page | The hint |
| --- | --- |
| `hidden/0300z.html` | An HTML comment near the top of `index.html`'s source, above `<body>`. Only findable by viewing source. |
| `hidden/hum.html` | A `console.log` printed by `js/site.js` on the homepage. Open devtools. `0300z.html` also nudges you towards the console. |
| `hidden/tape-b7.html` | In `about.html`, the word **"spool"** is a link the same colour as the prose around it. Select the text, or tab to it — it turns accent-coloured on keyboard focus. |
| `hidden/relay-9.html` | The reward. Unlocked by the passphrase on `login.html`. Also self-links once opened, and remembers via `localStorage`. |
| `hidden/reader.html` | Linked from `relay-9.html`, so it needs the passphrase first. An EPUB reader for books on your own disk — see below. |

### The reading room

`hidden/reader.html` reads `.epub` files you open yourself. **No book text is
in this repository**, nothing is uploaded, and `*.epub`/`*.mobi`/`*.azw3` are
gitignored. Files are parsed in the browser and cached in IndexedDB
(`da-reader`) on that device.

It treats a multi-volume series as one book. Volumes group by their shared
`dc:title` and order themselves by the chapter numbers in their own headings,
so:

- the shelf lists them as `vol 1 — chapters 1–95`, `vol 2 — chapters 96–350`…
- the running count is series-wide (`chapter 2261 / 2882`), not per file
- **Next** at the end of a volume rolls into the start of the next one, and
  **Prev** at the start rolls back into the end of the previous one
- one **CONTINUE** button picks the whole work up wherever you left it

Reading position (chapter *and* how far into it) is saved against a hash of the
book's own metadata, so it survives re-picking or renaming the file. It is
written by a 2-second poll as well as the scroll event, because scroll events
are not guaranteed for programmatic or restored scrolls and losing someone's
place is the one failure that page must not have.

Chapter markup from the file is rebuilt through an allow-list — scripts,
styles, frames, event handlers and `javascript:` URLs are dropped — because it
is foreign content.

### The numbers puzzle

The chain runs: **`etc/numbers.html`** → **`help.html`** → **`login.html`** →
`hidden/relay-9.html`.

1. `etc/numbers.html` transmits **nine five-digit groups**, twice:

   ```
   26483  27107  16942  19358  19721  15264  12809  25536  12690
   ```

2. The page states the format: **2 – 1 – 2**. The first two digits carry the
   payload; the middle digit and the last two are padding.

3. The offset is **not** on that page. It is in `help.html` under *Registers*,
   as **`R3  OFFSET  sealed — 07. subtract it. do not add it.`**

4. Take 07 off each pair, read as A=01…Z=26:

   ```
   26-07=19 S    27-07=20 T    16-07=09 I
   19-07=12 L    19-07=12 L    15-07=08 H
   12-07=05 E    25-07=18 R    12-07=05 E
   ```

   → **STILLHERE**

5. Type `still here` (or `STILLHERE`, or `Still Here` — it is normalised to
   lowercase alphanumerics) into the passphrase field on `login.html`.

The check is an **FNV-1a 32-bit hash** inline in `login.html`, comparing against
`4194926279`. Deliberately not SubtleCrypto: that needs a secure context, and
this site has to work opened straight off a disk from `file://`. It is
obfuscation so the phrase is not sitting in the source as plain text. **It is
not security, and there is nothing here worth securing.**

> If you ever change the passphrase, regenerate the constant with:
> ```bash
> python -c "h=2166136261
> for b in b'yournewphrase':
>     h^=b; h=(h*16777619)&0xFFFFFFFF
> print(h)"
> ```
> The JavaScript side must use `Math.imul`, not `*` — the product overflows
> 2^53 and a plain multiply silently gives a different hash. That bug cost an
> hour.

### Other things that are not obvious

- **`login.html`** has eleven refusals. They do not repeat until the list is
  exhausted, and the list gets stranger and more personal as it goes. Number
  eleven is the one to read.
- **`carrier.html`** — every 40 seconds one random tile in the wall of text
  changes to a *different* sentence and stays changed. The first change is at
  9 seconds so you have a chance of catching one happening. `still here` is in
  the rotation twice.
- **`etc/static.html`** — stop moving the pointer for about four seconds and
  **ARE YOU STILL THERE** surfaces out of the noise. Move again and it dissolves.
- **`etc/scope.html`** — arrow keys work as well as the pointer. The readout
  says LOCKED only when the two frequencies reduce to a ratio of small whole
  numbers.
- **`dir.html`** — five entries are 0 bytes and link to the 404. The line at
  the bottom says `1 not listed`, which refers to `hidden/0300z.html`, and the
  page's own prose plays dumb about it.
- **`404.html`** — carries a fragment restating the group format and the
  register number, so a dead link is still a step forward in the puzzle.
- **`hidden/hum.html`** has an 11 Hz component wired to the bus gain rather than
  to the output, so you feel it as a wobble instead of hearing it as a tone.
- The rotating bracketed phrase under the title is a **link** — it goes to
  `etc/static.html`.
- The guestbook link is `href="#TODO-guestbook"` and is meant to be replaced.
  It renders as `Guestbook [TODO]` so it cannot be forgotten.
