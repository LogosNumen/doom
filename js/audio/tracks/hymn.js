/* ------------------------------------------------------------------ *
 *  Shortwave Hymn -- vowel pads drifting between two chords, a long way
 *  off. Almost no transients anywhere: nothing here starts, things are
 *  either already happening or on their way out.
 *
 *  Two chords is the whole harmony. The interest is in the formants
 *  moving, not in the progression.
 * ------------------------------------------------------------------ */

(function (DAA) {
  "use strict";
  const T = DAA.theory, U = DAA.trackUtil;

  const ARRANGEMENT = [
    { bar: 0,  name: "far off",   layers: ["choir"] },
    { bar: 10, name: "nearer",    layers: ["choir", "drone"] },
    { bar: 22, name: "two parts", layers: ["choir", "drone", "upper"] },
    { bar: 40, name: "widest",    layers: ["choir", "drone", "upper", "air"] },
    { bar: 56, name: "receding",  layers: ["choir", "drone"] },
    { bar: 68, name: "back in",   layers: ["choir", "drone", "upper", "air"] },
    { bar: 84, name: "gone",      layers: ["drone"] },
    { bar: 92, name: "again",     layers: ["choir", "drone", "upper"] }
  ];
  const LOOP_AT = 92, LOOP_TO = 22;

  const VOWEL_PATH = ["u", "o", "a", "o", "u", "e"];

  DAA.tracks.hymn = {
    id: "hymn",
    title: "Ｓｈｏｒｔｗａｖｅ　Ｈｙｍｎ",
    blurb: "vowel pads between two chords. very distant.",
    bpm: 55,
    root: 48,                      // C3
    mode: "phrygian",
    hiss: 0.009,
    delayTime: 60 / 55 * 2,
    feedback: 0.5,
    arrangement: ARRANGEMENT,

    init: function (ctx, bus, rng) {
      // two chords, and that is the entire harmonic content
      return {
        rng: rng,
        prog: T.progression(this.root, this.mode, [0, 1], 4),
        v: 0
      };
    },

    onStep: function (ctx, bus, st, step, t, eng) {
      const bar = Math.floor(step / 16);
      const pos = step % 16;
      const at = U.loopBar(bar, LOOP_AT, LOOP_TO);
      const sec = U.sectionAt(ARRANGEMENT, at);
      const rng = st.rng;
      // eight bars per chord: it takes its time
      const chord = st.prog[Math.floor(bar / 8) % 2];

      /* the choir. every entry glides between two vowel shapes, and the
         two are never the same pair twice running. */
      if (U.has(sec, "choir") && pos === 0 && bar % 4 === 0) {
        st.v = (st.v + 1) % VOWEL_PATH.length;
        const from = VOWEL_PATH[st.v];
        const to = VOWEL_PATH[(st.v + 2) % VOWEL_PATH.length];
        chord.forEach(function (n, i) {
          eng.note("vowel", {
            t: t + rng.range(0, 0.6),        // ragged entries, like people
            f: T.mtof(n + 12),
            from: from, to: to,
            glide: rng.range(9, 15),
            a: rng.range(3.5, 5.5), d: 2, s: 0.9, hold: 8, r: 6,
            gain: U.vel(rng, 0.075, 0.12),
            pan: (i - 1.5) * 0.48 + rng.gauss(0, 0.08),
            dry: 0.25, rev: 1.0, dly: 0.2,
            bus: { dry: bus.dry, reverb: bus.vast, delay: bus.delay }
          });
        });
      }

      /* one low note underneath the whole thing */
      if (U.has(sec, "drone") && pos === 0 && bar % 8 === 0) {
        eng.note("pad", {
          t: t,
          f: T.mtof(chord[0] - 12),
          a: 6, d: 3, s: 0.9, hold: 14, r: 8,
          gain: 0.06, open: 620, shut: 200, lfo: 0.023, lfoDepth: 120,
          pan: 0, dry: 0.6, rev: 0.5, dly: 0,
          bus: { dry: bus.dry, reverb: bus.vast, delay: bus.delay }
        });
      }

      /* a high part that is only ever half there */
      if (U.has(sec, "upper") && pos === 0 && bar % 4 === 2) {
        eng.note("vowel", {
          t: t + rng.range(0, 1.2),
          f: T.mtof(chord[rng.int(1, chord.length)] + 24),
          from: "i", to: rng.pick(["e", "u"]),
          glide: rng.range(7, 12),
          a: 5, d: 2, s: 0.85, hold: 6, r: 7,
          gain: U.vel(rng, 0.04, 0.2),
          pan: rng.range(-0.85, 0.85),
          dry: 0.15, rev: 1.0, dly: 0.35,
          bus: { dry: bus.dry, reverb: bus.vast, delay: bus.delay }
        });
      }

      /* air: filtered noise so quiet it reads as distance, not as a part */
      if (U.has(sec, "air") && pos % 8 === 0 && rng.chance(0.4)) {
        eng.note("perc", {
          t: t + rng.range(0, 1.5),
          f: rng.range(1800, 5200), q: 0.7,
          life: rng.range(1.8, 4), gain: U.vel(rng, 0.018, 0.3),
          pan: rng.range(-0.9, 0.9),
          dry: 0.3, rev: 0.9, dly: 0.2,
          bus: { dry: bus.dry, reverb: bus.vast, delay: bus.delay }
        });
      }
    }
  };
})(window.DAA);
