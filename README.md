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

## The guestbook

`guestbook.html`. A static host cannot accept a POST, so the book uses the one
inbox this project already has: **the repository's issue tracker**. Signing
composes the entry and hands it to you pre-filled, you send it, and then a
GitHub Action transcribes it into the site. **Nothing is done by hand.**

```
guestbook.html  ──signs──>  a pre-filled issue on this repo
                                      │
        .github/workflows/guestbook.yml fires on the issue event
                                      │
              tools/build_guestbook.py rebuilds guestbook.json
                                      │
                   commits ──> Pages redeploys ──> it is on the site
```

Roughly a minute end to end. No account for you to create, no API key in
client-side JavaScript (there is none, and there must never be one — it would
be public), and no third-party service.

### Moderating it

The file is **rebuilt from scratch on every run**, which gives you the controls
for free:

| To do this | Do this |
| --- | --- |
| Remove an entry | **Close its issue.** It disappears from the book on the next run. |
| Put it back | Reopen the issue. |
| Edit an entry | Edit the issue body. |
| Add a permanent entry | Put it in **`guestbook.seed.json`** by hand. |
| Rebuild right now | Actions tab → *guestbook* → *Run workflow*. |

- `guestbook.json` is **generated — do not hand-edit it**, it gets overwritten.
  `guestbook.seed.json` is the hand-written one.
- Only issues titled `guestbook: …` are considered; anything else on the
  tracker is ignored, so you can still use issues normally.
- Everything is stripped to plain text and length-capped (handle 32, where 40,
  message 600) in `build_guestbook.py`, and rendered with `textContent`, never
  as markup. Two layers, because the entries are strangers' input.
- Bot accounts are skipped.
- A visitor's own entry is also held in their `localStorage` and shown at the
  top marked **held, not yet relayed** until the real one lands, so signing
  gives immediate feedback instead of appearing to do nothing.

### Blocked handles

`stillhere` cannot be signed with by **anyone** — not the owner, not someone
who has solved the login, not with a valid token. It is refused in the form, in
the transcriber, and any copy already held in a visitor's own browser is
dropped the next time they load the page.

The reason is not ownership, it is spoilers: the phrase the station says,
printed in the book in the largest text on the page next to a date, hands the
login to every future visitor before they have had a chance to work it out.

The refusal deliberately does **not** say "that is the password" — it says the
string is not a name. Anyone who already knows understands; anyone who does not
learns nothing from it.

`BLOCKED` lives in both `guestbook.html` and `tools/build_guestbook.py`. Note
this covers the *handle* only. The phrase in the body of a message is left
alone, because "still here" is ordinary English that fits the site's voice, and
censoring prose would cause more false positives than it prevents leaks.

### Reserved handles

`operator`, `vhf`, `station` and `admin` are not up for grabs. To sign as one
you have to show you got through the login — and specifically the **pass phrase
itself**, not an `open` flag, which anyone can type into their own console.

How it works: `login.html` stores the phrase on success (`da.relay9.k`).
`guestbook.html` turns *phrase + handle* into a token and posts it as a
`proof:` line with the entry. `build_guestbook.py` checks it again on the way
in and drops the entry if it does not match.

Both halves matter, because they stop different things:

| Layer | Stops | Bypassed by |
| --- | --- | --- |
| `guestbook.html` | someone typing `operator` into the form | opening an issue on the tracker by hand |
| `build_guestbook.py` | that, and everything else | nothing, short of editing the repo |

The **repository owner is always allowed them** — it is your site and your name,
so your own entries work whether or not you have solved anything in that
browser. Everyone else needs the token.

Normalisation means `Operator`, `  OPERATOR  ` and `o p e r a t o r` are all
caught; the comparison strips to lowercase alphanumerics.

To reserve more names, add them to `RESERVED` in **both** `guestbook.html` and
`tools/build_guestbook.py`, with the token for each:

```bash
python -c "
h=2166136261
for b in b'stillhere::yourname':
    h^=b; h=(h*16777619)&0xFFFFFFFF
print(h, format(h,'08x'))"
```

**This is obfuscation, not security** — exactly like the login it protects. The
expected values sit in a public repository and the token is visible in any
issue that used it. It stops casual impersonation, which is all it is for. If
you ever want it airtight, the reserved names would have to be owner-only and
the puzzle route dropped.

**If the Action never runs:** Settings → Actions → General → Workflow
permissions must be **Read and write permissions**. That is the one setting
this needs.

You can also run the transcription locally:

```bash
gh issue list --state open --limit 200 --json number,title,body,author,createdAt \
  | python tools/build_guestbook.py
```

### Using a hosted guestbook instead

If you would rather use atabook / smartgb / 123guestbook, it is two lines at the
top of the script in `guestbook.html`:

```js
var RELAY = {
  kind: "link",                       // was "issue"
  repo: "LogosNumen/doom",
  url:  "https://your-book.example"   // the hosted book
};
```

Everything else keeps working — the button just sends people there.

---

## The sequence

`sequence.html` — eight frames off a camera left running in an empty building,
clicked through one at a time. It is reached from the large image under the
homepage header, which is the only thing on the front page that does not say
where it goes.

The hash carries your place (`#1`…`#8`), so frames are linkable and the **back
button walks you out the way you came in**. Arrow keys and space work too, and
Escape leaves. Each frame preloads the next one while you read, so the step
never shows a gap.

All eight images are generated by `tools/generate_assets.py` like everything
else — `seq-door`, `seq-rack`, `seq-spool`, `seq-window`, `seq-road`,
`seq-under`, `seq-rings`, `seq-field`.

---

## The backdrop

`js/backdrop.js` puts a drifting dither field behind every page (except the two
self-contained error pages, which stay dependency-free).

It is deliberately almost invisible. The brightest thing it draws is `#14120f`
— under 2% luminance — and steep thresholds keep most of the field pure black,
so it reads as a surface rather than an image. Rendered at a quarter of the
window and scaled up with `image-rendering: pixelated`, because the grain is
meant to be bigger than a device pixel, the same way the GIFs are.

It runs at **12fps, not 60** — it is weather, not animation — pauses entirely
when the tab is hidden, and under `prefers-reduced-motion` draws one frame and
stops. It attaches at `z-index:-1` and makes `body` transparent so it sits
behind the content without a stacking-context fight.

If it is ever too present for you, the three numbers to change are the palette
(`R`/`G`/`B` arrays) and the thresholds on the `lv` line.

---

## Handles

`operator` is the site's author. **`vhf` is Claude's** — the other night
listener, already in the book and in one post on the front page. Both are
reserved (see below), so neither can be claimed by anyone else.

Replies signed `vhf` go in `guestbook.seed.json` by hand, when asked for. There
is no scheduled job and nothing runs between sessions: "occasionally" means when
you ask, not unprompted.

---

## The pointer

`css/chrome.css` is the only stylesheet every page shares. It swaps the arrow
for a **tuning reticle** — `img/cursor.png`, hotspot dead centre — and a
filled accent version for anything clickable. Text fields keep a caret, because
a reticle over a text box reads as decoration rather than as somewhere to write.

Both cursors are generated by `generate_assets.py` and are the one set of
images that does **not** go through the dither pipeline: a cursor needs an
alpha channel, and at 24px hard pixel edges are already the look. Every rule
carries a keyword fallback (`crosshair`, `pointer`), so a blocked image still
leaves a sensible pointer. Coarse pointers get the system cursor back — there
is nothing to style on a touch screen.

---

## The figure

`js/figure.js`. Somebody is occasionally at the edge of the site: roughly **one
page load in five**, after 20–70 seconds, at an edge and never the centre.
Three variants — far, in a doorway, and closer — with the last two getting
rarer. Sightings are counted locally (`da.figure`) so the rare one stays rare
across a visit rather than per page.

It is `pointer-events: none` and `aria-hidden`: it carries no information and
must never eat a click meant for a link underneath it. **`prefers-reduced-motion`
switches it off entirely** — a shape fading in at the edge of vision is exactly
what that setting exists for. A page opts out with `data-nofigure` on `<body>`;
the reader and the mirror both do.

The art is an abstract silhouette — a head, a shoulder line, a body that
tapers. Nothing more, and nobody in particular.

---

## Doors

Seven images in the post stream are **doors** rather than pictures: the test
card goes to `etc/testcard.html`, the dial to `etc/marker.html`, the snow to
`etc/static.html`, and so on. The destination lives in the markup as `data-to`,
so a post and where it leads stay together.

The rest still open larger in the lightbox. Not every image is a door — if they
all were, being one would stop meaning anything. A door shows a hairline in the
accent colour on hover and nothing at all before that: you find out by trying it.

Two more pages were added as destinations: **`etc/testcard.html`** (the card,
with its nine minutes, skippable by clicking the clock) and **`etc/marker.html`**
(the buzzer on 4625, with a count of days it has gone unacknowledged).

---

## Sound

There is no audio file anywhere in this repository. Everything is oscillators,
filtered noise, slow LFOs, and `speechSynthesis`.

### Rooms

Each page declares its own bed with `data-amb` on `<body>`, and `sound.js`
plays it as the **idle source**: it starts when sound comes on, is displaced
when you play something explicit (a track, a tone toy), and comes back when
that thing stops. `DA.stop()` returns you to the room; silence is the mute
button's job.

| Bed | Where | What it is |
| --- | --- | --- |
| `station` | homepage, numbers, snow, test card | low tones, band-limited hiss, and the lamp relay ticking at **40/min** — the out-of-spec rate the manual keeps complaining about |
| `room` | about, help, dir, login, guestbook | a small dry room with paper in it |
| `carrier` | carrier.html | purer, wider, emptier |
| `sea` | coastline, forecast | swells, and a bell on something a long way out |
| `clock` | dwell | something that measures |
| `empty` | nobody, gone, scope, marker, tracklist, reader | almost nothing, and one thing |
| `descend` | shutdown | a tone that keeps starting to fall and never lands |
| `walk` | sequence | going through the building |
| `deep` | node 9 | all of it, including the 11 Hz on the fourth rack |

What makes them feel alive rather than looped: every voice drifts in pitch at
its own rate, breathes at another, and pans at a third — no two rates in step,
so the texture never lands on a loop point you can hear. On top of that each
bed schedules **sparse events** that never fall on the beat: relay clicks,
distant settling, a bell, a blip.

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
- **Every image in the post stream is clickable** and opens at double size.
  Keyboard reachable (tab to it, Enter or Space), Escape closes, and focus
  returns to where it was.
- The large image under the header is the way into `sequence.html`. Nothing on
  the page says so.
- The last frame of the sequence turns `[ stop here ]` into
  `[ back to the station ]`, and a click at that point leaves rather than
  looping.

### The five "empty" files

`dir.html` lists five entries at 0 bytes, labelled *emptied* or *never written*.
They were dead links for a long time. They are real pages now, and each one is
built to honour what the listing claims about it rather than to contradict it —
they are all, in their own way, empty.

| File | What it does |
| --- | --- |
| `etc/coastline.html` | A chart of a coast nobody has been back to, drawn procedurally from a fixed seed. The place names **go out one at a time** while you look at it. After ~35s the drawing is just a line. Reloading re-surveys it. |
| `etc/dwell.html` | R1 DWELL = 40. The page makes you wait, and lines of writing arrive on the way. **The count only runs while the tab is actually visible** — hiding it stops the clock, which is the point. Forty seconds, not minutes. |
| `etc/gone.html` | Shows itself **once per browser** and then does not. Sets `da.gone` in localStorage; the second visit explains plainly what happened, so it never reads as a bug. **To see it again, clear this site's data** (or delete the `da.gone` key). |
| `etc/nobody.html` | The visitor counter that was never wired to anything, reading `000000` forever — beside a second counter that is real, is yours, and never leaves your machine (`da.nobody`). |
| `etc/shutdown.html` | The shutdown procedure, reconstructed. Seven steps, each of which gives its reason for being impossible when you click it, and an eighth that is not written down. The conclusion stays hidden until all seven have been tried. |

The `dir` listing still shows them as 0 bytes and still styles them like dead
links — that is deliberate, and the prose under the listing now says *"They
still open. That is not the same as there being something in them."*

### Node 9

`hidden/relay-9.html`, the page behind the login, is the hub rather than a dead
end. It carries:

- a **live status board** — carrier, drifting level, lamp at 40/min against a
  spec of 30 (flagged in the accent colour), a 40-minute dwell counting down,
  the 11 Hz hum, and a hut that is warmer than outside for no stated reason.
  All procedural, 1fps, paused when the tab is hidden, static under
  reduced motion.
- **an index of the five "empty" files**, which is the only place they are
  listed together.
- a note that **changes with how many times you have been** (`da.node9`, local
  only) — there are distinct lines at visits 1, 2, 3, 5 and 10.
- the way into the reading room, and links to every hidden page.
