# MUSIC NOTES — the audio engine

Working notes for the generative music on *Dead Air for Night Listeners*.
Every note is produced by code in `js/audio/`. There is no audio file anywhere
in this repository, no sample, no transcription, and nothing here is a
recreation of any existing piece of music. The genre words below name a
neighbourhood, not a target.

---

## 0. Decisions I made without asking

| Decision | Why |
| --- | --- |
| **Plain scripts, not ES modules** | The rest of this site works when opened straight off a disk from `file://`, and module imports do not — the browser refuses them over that scheme. Everything hangs off one global `DAA` namespace and loads in dependency order instead. |
| **The engine loads on demand** | Thirteen files of audio code is a lot to hand somebody who never touches the ♫. `sound.js` injects them the first time sound is switched on (`async = false` preserves execution order), so a reader who only reads downloads none of it. |
| **`sound.js` kept as the controller** | It owns the toggle, persistence, speech and the small bespoke instruments on the experiment pages (the hum, the scope tones, the marker). The engine owns the music. Splitting it that way meant the ♫ contract and the one-source-at-a-time rule did not have to be rewritten. |
| **The experiment toys were not ported** | The hum, the scope and the marker are three-oscillator sketches that *are* their pages. Rebuilding them on the track engine would make them longer without making them better. They still route through their own small context, and turning one on stops the music. |
| **Bit-depth crush only, no sample-rate reduction** | True SRR needs a sample-and-hold, which means an `AudioWorklet`, which loads as a module and breaks `file://`. The crusher quantises amplitude honestly and a lowpass alongside stands in for the anti-alias character. Written up rather than hidden. |
| **Karplus–Strong is pitch-limited on purpose** | Web Audio adds one render quantum (128 samples) of latency to any feedback loop. The delay is shortened to compensate, but above ~344 Hz there is no room left, so the pluck is used below that. Plucked strings live down there anyway. |

---

## 1. The shape of it

```
js/audio/
  theory.js    seeded PRNG, modes, chords by stacked thirds, voice leading,
               Euclidean rhythm, note/time conversion. No audio at all.
  fx.js        generated impulse responses, reverb, ping-pong delay, chorus,
               saturation, bit crush, tape wow, hiss, master chain.
  voices.js    the instruments. pad, organ, pluck, bell, vowel, sub, perc, kick.
  engine.js    context, buses, transport, voice allocation, crossfade,
               metering, session continuity, speech ducking.
  tracks/
    common.js  arrangement helpers: sections, humanising, the loop fold.
    *.js       one file per track: a data table and a generator.
```

**Scheduling** is the standard lookahead pattern — a 25 ms `setInterval` that
schedules every event falling inside the next 100 ms against
`audioContext.currentTime`. Notes are never fired from a timer directly; `setTimeout`
and `requestAnimationFrame` are both at the mercy of whatever else the page is
doing, and the drift is audible within a couple of bars.

**Randomness** is seeded per track with mulberry32, so a track is reproducible
when something needs debugging, and reseeded per session so no two visits are
the same piece of music.

**Arrangement is data.** Every track opens with a table of sections: a bar
number, a name, and the layers awake during it. The shape of the piece is
readable without following the code and editable without understanding it.

Past its last section a track folds back (`loopBar`) to a mid-point rather than
stopping. Because the generators draw from a running PRNG rather than from the
bar number, the second pass through a section is not the same music as the first.

---

## 2. The mix

Voice → channel gain → panner → three destinations: dry, reverb send, delay
send. **One** reverb and **one** delay for the whole mix. Building a
`ConvolverNode` per note is the classic way to make a page seize up after a
minute of playback.

- **Reverb**: three impulse responses generated from noise times an exponential
  decay — a 1.4 s room, a 4.5 s hall, and a 9 s one for the pieces that need to
  sound a long way off. Left and right use independent noise, which is what
  makes a tail wide instead of a mono blur in the middle, and a one-pole lowpass
  closes across the tail so the room darkens as it dies. Pre-delay 20–40 ms. The
  returns are highpassed at 180 Hz, because low end in a long tail is the
  fastest way to turn a mix to soup.
- **Delay**: ping-pong, two lines cross-fed, lowpass in the feedback path so
  repeats lose treble. Tempo-synced, usually dotted eighth. Feedback is clamped
  below 0.72 — a delay line above about 0.8 runs away and pins the meters.
- **Tape**: tanh saturation, wow and flutter as two slow LFOs at unrelated rates
  on detune, and a hiss bed always underneath.
- **Master**: highpass at 30 Hz, gentle bus glue, saturation, then a limiter
  (ratio 20, 2 ms attack, −6 dB threshold) and a trim, so the limiter is not
  also acting as the volume control.
- **Ducking**: the dry bus and the two big reverb returns pass through one gain
  that every kick and every low hit dips with a scheduled ramp. Fake sidechain,
  about five lines, and it is most of why the low end stops fighting itself.

---

## 3. The tracks

All seven run 5–7 minutes before folding, and are stereo, nocturnal and
deliberately dark.

### Carrier — 62 BPM, A aeolian
Slow dub techno; the one with a groove. Sub kick on the four, chords landing on
the off-beat and soaked in the long hall, a short sub bass, hats on a 5-in-7
Euclid against the 16-step bar so the pattern takes seven bars to come round.

*Arrangement*: pad alone → kick (b2) → chords (b12) → weight, sub arrives (b20)
→ opening (b36) → breakdown, no kick (b52) → back (b62) → stripped (b84) → out
(b94) → folds to b20.

*What I was going for*: the room the rest of the site is set in, with a pulse.
It is the only track anyone would call rhythmic, and it still spends ten bars
doing nothing in the middle.

### Nocturne for Empty Rooms — 58 BPM, D aeolian
Plucked strings and FM bells over a four-chord progression, in the 9-second
reverb. No percussion at all, so the only rhythm is the phrasing: four bars of
plucks, two of rest.

*Arrangement*: one voice → the room (b6) → bells (b14) → low answer (b26) →
thinning (b40) → together (b48) → leaving (b66) → last (b76) → folds to b14.

*What I was going for*: the most straightforwardly pretty thing here, and the
one that would still work if you were not paying attention.

### Test Card — 66 BPM, F lydian
The odd one out, and the only major-ish mode on the site. Organ swells built
from drawbar-style `PeriodicWave` tables, heavy tape wow, a slow bass sliding
into pitch under it.

*Arrangement*: warm up → sub (b8) → upper voice (b18) → full card (b32) → held
(b48) → return (b58) → fade (b76) → folds to b18.

*What I was going for*: warmth, which on this site means "not actively bleak".
The raised fourth keeps it from settling into the same minor as everything else.

### Shortwave Hymn — 55 BPM, C phrygian
Vowel pads — saw stacks through three bandpass formants — drifting between two
chords and between vowel shapes. Two chords is the entire harmony; the interest
is in the formants moving. Almost no transients: nothing starts, things are
either already happening or on their way out.

*Arrangement*: far off → nearer (b10) → two parts (b22) → widest (b40) →
receding (b56) → back in (b68) → gone (b84) → folds to b22.

*What I was going for*: a choir that is not a choir and not a sample, a very
long way away.

### Signal Decay — 84 BPM, G dorian
The busiest one. Euclidean noise percussion through a bit crusher on its own
bus, a dorian bass riff, and the ping-pong delay doing half the rhythmic work.
A 7-in-11 counter-rhythm against the 16-step bar.

*Arrangement*: ticks → bass (b6) → counter (b16) → opening (b28) → drop out
(b44) → all of it (b52) → crushed (b72) → gone (b82) → folds to b16.

*What I was going for*: the one that sounds like the equipment rather than the
room. The crusher's lowpass opens across each section on a 30-second sweep.

### 03:00 Forecast — 56 BPM, F aeolian
Mostly silence. One low drone changing about once a minute, single tones eight
bars apart at most, and something answering them much later and further away.

*Arrangement*: nothing → one tone (b8) → answer (b24) → quiet (b44) → two tones
(b54) → almost (b74) → out (b88) → folds to b24.

*What I was going for*: the track that makes the other six land. Without
something this empty in the list, "sparse" has nothing to be sparse against. It
is the only track exempt from the silence check, for exactly that reason.

### Relay — 76 BPM, A aeolian
The melodic one. A seven-step arpeggio running against the sixteen-step bar, so
the figure does not return to the same place for seven bars. Over it, a melody
that walks the scale — small intervals most of the time, an occasional leap,
landing on a chord tone at the top of a bar and passing between them otherwise —
and which phrases for four bars and rests for two.

*Arrangement*: arp alone → ground (b8) → pad (b16) → the tune (b28) → arp only
(b48) → everything (b56) → thinning (b78) → out (b88) → folds to b16.

*What I was going for*: the one you could hum, if you were the kind of person
who hums at four in the morning.

### Drone — the bed
Not a track you choose; it is what the ♫ starts. Almost entirely long tones
arriving and leaving at unrelated intervals, so it holds up for as long as
somebody stays on a page — longer than any of the tracks have to.

Each page names a room with `data-amb` on `<body>`, and the room picks a variant:
register, density, which layers are awake, how bright. Nine of them — `station`,
`room`, `carrier`, `sea`, `clock`, `empty`, `descend`, `walk`, `deep` — so the
about page and node 9 sound like different places while running the same engine.

The `station` and `deep` variants tick a relay at **40 a minute**, which is the
rate the manual keeps complaining the lamp is running at.

---

## 4. What the analysis caught

The measurements are in `tools/analyse_audio.py`, run against WAVs rendered
offline by `tools/render_previews.py`. Since I cannot hear any of this, that
pipeline is the only thing standing between "it runs" and "it is any good". It
earned its place immediately:

1. **Fifteen seconds of silence at the top of Carrier.** The opening section was
   hiss-only, and the offline harness never raised the hiss because only
   `play()` does. Two bugs in one: the harness now sets it the way `play()`
   would, and the arrangement no longer opens with a section that has nothing
   audible in it.
2. **98% of the energy below 200 Hz.** Gain staging. The kick and sub were
   roughly 20 dB above the harmony. Fixed at source by rebalancing rather than
   by moving the threshold — kick down, sub down hard, stabs and hats up.
3. **The pad had a hidden sub oscillator.** A sine an octave below the root,
   times four notes in a voicing, on every track that uses a pad. Dropped from
   0.30 to 0.12 and made overridable. This was a global fault that only showed
   up as a spectral number.
4. **An eight-bar section with no mid at all.** Carrier had a stretch that was
   kick, sub and pad only. That is not a mix problem, it is a composition
   problem, and the fix was to bring the harmony in before the weight.
5. **Nothing above 3 kHz.** The whole mix was a blanket over the speaker. The
   hiss was band-limited to 3.2 kHz, and on a record where every other voice is
   deliberately lowpassed the hiss is the only thing up there. It is now
   highpassed at 1.8 kHz with a shelf at 6 k — the tape thread and the top
   octave at the same time.
6. **A negative start time on the first note.** Timing humanisation jitters a
   few milliseconds either way, which at step 0 lands before the start of the
   context, and Web Audio throws rather than clamping. Caught by the renderer,
   but it would have hit the live site on every track's first note. Clamped in
   `engine.note()`, so every track gets the fix for free.
7. **My own analyser was wrong.** `bands()` was FFT-ing only the first 65k
   samples of a 30-second window and calling that the spectral balance — which
   reported "no treble" because one 1.5-second frame happened to land between
   two hat hits. Now averaged across the whole window. Worth flagging as the one
   case where the correct response to a failing check was to fix the check: the
   measurement was not measuring what it claimed to.
