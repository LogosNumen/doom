/* ------------------------------------------------------------------ *
 *  Nocturne for Empty Rooms -- plucked strings and FM bells over a real
 *  progression. No percussion anywhere in it, so the only rhythm is the
 *  phrasing, and the reverb is the biggest one in the building.
 * ------------------------------------------------------------------ */

(function (DAA) {
  "use strict";
  const T = DAA.theory, U = DAA.trackUtil;

  const ARRANGEMENT = [
    { bar: 0,  name: "one voice",  layers: ["pluck"] },
    { bar: 6,  name: "the room",   layers: ["pluck", "pad"] },
    { bar: 14, name: "bells",      layers: ["pluck", "pad", "bell"] },
    { bar: 26, name: "low answer", layers: ["pluck", "pad", "bell", "low"] },
    { bar: 40, name: "thinning",   layers: ["pad", "bell"] },
    { bar: 48, name: "together",   layers: ["pluck", "pad", "bell", "low"] },
    { bar: 66, name: "leaving",    layers: ["pluck", "pad"] },
    { bar: 76, name: "last",       layers: ["pad"] },
    { bar: 84, name: "again",      layers: ["pluck", "pad", "bell"] }
  ];
  const LOOP_AT = 84, LOOP_TO = 14;

  DAA.tracks.nocturne = {
    id: "nocturne",
    title: "Ｎｏｃｔｕｒｎｅ　ｆｏｒ　Ｅｍｐｔｙ　Ｒｏｏｍｓ",
    blurb: "plucked strings and fm bells. no percussion at all.",
    bpm: 58,
    root: 50,                       // D3
    mode: "aeolian",
    hiss: 0.012,
    delayTime: 60 / 58 * 1.5,
    feedback: 0.36,
    arrangement: ARRANGEMENT,

    init: function (ctx, bus, rng) {
      return {
        rng: rng,
        prog: T.progression(this.root, this.mode, [0, 3, 5, 2], 4),
        scale: T.scale(this.root, this.mode, 3),
        // the melody phrases and then stops. a line that never rests is noise.
        phrase: 0,
        resting: false
      };
    },

    onStep: function (ctx, bus, st, step, t, eng) {
      const bar = Math.floor(step / 16);
      const pos = step % 16;
      const at = U.loopBar(bar, LOOP_AT, LOOP_TO);
      const sec = U.sectionAt(ARRANGEMENT, at);
      const rng = st.rng;
      const chord = st.prog[Math.floor(bar / 4) % st.prog.length];

      /* pad: the room the rest of it sits in */
      if (U.has(sec, "pad") && pos === 0 && bar % 4 === 0) {
        chord.forEach(function (n, i) {
          eng.note("pad", {
            t: t + rng.range(0, 0.12),
            f: T.mtof(n + 12), a: 3.4, d: 2, s: 0.8, hold: 6, r: 5,
            gain: 0.075, open: 1700, shut: 380, lfo: 0.045,
            pan: (i - 1.5) * 0.4,
            dry: 0.4, rev: 0, dly: 0, bus: { dry: bus.dry, reverb: bus.vast, delay: bus.delay }
          });
        });
      }

      /* plucks: arpeggiated, with rests between phrases */
      if (U.has(sec, "pluck")) {
        // four bars on, two off -- the breathing is the arrangement
        const inPhrase = (bar % 6) < 4;
        const hit = pos % 2 === 0 && rng.chance(inPhrase ? 0.24 : 0.04);
        if (hit) {
          const n = chord[rng.int(0, chord.length)] + (rng.chance(0.3) ? 12 : 0);
          if (T.mtof(n) < 340) {                // Karplus-Strong's working range
            eng.note("pluck", {
              t: t + U.jitter(rng, 12),
              f: T.mtof(n),
              gain: U.vel(rng, 0.13, 0.22),
              decay: 0.88, damp: 1500 + rng.range(-300, 700),
              life: rng.range(2.4, 4.2),
              pan: rng.range(-0.6, 0.6),
              dry: 0.85, rev: 0.5, dly: 0.25,
              bus: { dry: bus.dry, reverb: bus.vast, delay: bus.delay }
            });
          }
        }
      }

      /* a low pluck answering, once every couple of bars */
      if (U.has(sec, "low") && pos === 8 && bar % 2 === 1 && rng.chance(0.7)) {
        eng.note("pluck", {
          t: t + U.jitter(rng, 14),
          f: T.mtof(chord[0] - 12),
          gain: 0.17, decay: 0.90, damp: 1100, life: 5.5,
          pan: rng.range(-0.2, 0.2),
          dry: 0.9, rev: 0.35, dly: 0,
          bus: { dry: bus.dry, reverb: bus.vast, delay: bus.delay }
        });
      }

      /* bells: sparse, inharmonic, high up */
      if (U.has(sec, "bell") && rng.chance(pos % 8 === 0 ? 0.22 : 0.03)) {
        const n = st.scale[rng.int(7, st.scale.length)] + 12;
        eng.note("bell", {
          t: t + U.jitter(rng, 18),
          f: T.mtof(n),
          ratio: rng.pick([1.414, 1.732, 2.414, 3.162]),
          index: rng.range(280, 760), bright: rng.range(0.9, 2.2),
          life: rng.range(3.5, 6.5),
          gain: U.vel(rng, 0.085, 0.3),
          pan: rng.range(-0.75, 0.75),
          dry: 0.6, rev: 0.85, dly: 0.4,
          bus: { dry: bus.dry, reverb: bus.vast, delay: bus.delay }
        });
      }
    }
  };
})(window.DAA);
