/* ------------------------------------------------------------------ *
 *  Carrier -- slow dub techno. The one with a groove.
 *
 *  A sub kick on the four, chords landing on the off-beat and soaked in
 *  the long hall, sub bass underneath, hiss over the top. Everything
 *  ducks under the kick, which is what stops the low end fighting itself.
 * ------------------------------------------------------------------ */

(function (DAA) {
  "use strict";
  const T = DAA.theory, U = DAA.trackUtil;

  /* The shape of the piece, as a table. Bars, and what is awake. */
  const ARRANGEMENT = [
    { bar: 0,   name: "carrier only", layers: ["hiss", "pad"] },
    { bar: 2,   name: "the four",     layers: ["hiss", "pad", "kick"] },
    { bar: 12,  name: "chords",       layers: ["hiss", "pad", "kick", "stab"] },
    { bar: 20,  name: "weight",       layers: ["hiss", "pad", "kick", "sub", "stab"] },
    { bar: 36,  name: "opening",      layers: ["hiss", "pad", "kick", "sub", "stab"] },
    { bar: 52,  name: "breakdown",    layers: ["hiss", "pad", "stab"] },
    { bar: 62,  name: "back",         layers: ["hiss", "pad", "kick", "sub", "stab"] },
    { bar: 84,  name: "stripped",     layers: ["hiss", "pad", "kick", "sub"] },
    { bar: 94,  name: "out",          layers: ["hiss", "pad"] },
    { bar: 104, name: "loop",         layers: ["hiss", "pad", "kick", "sub", "stab"] }
  ];

  const LOOP_AT = 104, LOOP_TO = 20;

  DAA.tracks.carrier = {
    id: "carrier",
    title: "Ｃａｒｒｉｅｒ",
    blurb: "slow dub techno. the one with a groove.",
    bpm: 62,
    root: 45,                    // A2
    mode: "aeolian",
    hiss: 0.016,
    delayTime: 60 / 62 * 0.75,   // dotted eighth
    feedback: 0.42,
    arrangement: ARRANGEMENT,

    init: function (ctx, bus, rng) {
      const prog = T.progression(this.root, this.mode, [0, 5, 3, 4], 4);
      return {
        rng: rng,
        prog: prog,
        // a 7-step hat against the 16-step bar: takes 7 bars to come round
        hat: T.euclid(5, 7),
        wow: DAA.fx.makeWow(ctx, 3, 0.21, 6.3)
      };
    },

    onStep: function (ctx, bus, st, step, t, eng) {
      const bar = Math.floor(step / 16);
      const pos = step % 16;
      const at = U.loopBar(bar, LOOP_AT, LOOP_TO);
      const sec = U.sectionAt(ARRANGEMENT, at);
      const rng = st.rng;
      const chord = st.prog[Math.floor(bar / 2) % st.prog.length];

      /* kick on every beat, ducking everything under it */
      if (U.has(sec, "kick") && pos % 4 === 0) {
        eng.note("kick", {
          t: t, f: 92, to: 46, gain: U.vel(rng, 0.24, 0.06),
          life: 0.34, pitchFall: 0.07, rev: 0.05, bus: bus
        });
        eng.dip(t, 0.58, 0.03, 0.3);
      }

      /* sub bass: root and fifth, off the kick so they do not collide */
      if (U.has(sec, "sub") && (pos === 2 || pos === 10 || (pos === 14 && rng.chance(0.4)))) {
        const deg = pos === 10 ? 2 : 0;
        eng.note("sub", {
          t: t + U.jitter(rng, 6),
          f: T.mtof(chord[0] - 12 + (deg ? 7 : 0)),
          gain: U.vel(rng, 0.05, 0.1), hold: 0.12, r: 0.22, bus: bus
        });
      }

      /* the stab: off-beat, short, drenched */
      if (U.has(sec, "stab") && pos % 4 === 2) {
        const open = U.through(ARRANGEMENT, at);
        const side = (pos === 2 || pos === 10) ? -0.4 : 0.4;
        chord.forEach(function (n, i) {
          if (i === 0 && rng.chance(0.5)) return;       // thin it out sometimes
          eng.note("organ", {
            t: t + U.jitter(rng, 9) + i * 0.004,
            f: T.mtof(n + 12), table: "hollow",
            a: 0.006, d: 0.08, s: 0.15, hold: 0.02, r: 0.5,
            gain: U.vel(rng, 0.155, 0.2),
            tone: 900 + open * 2600,
            pan: side + rng.gauss(0, 0.1),
            dry: 0.5, rev: 0.9, dly: 0.35, bus: bus
          });
        });
      }

      /* a hat that is really a filtered noise tick, on a 7 against the 16 */
      if (U.has(sec, "kick") && st.hat[step % st.hat.length]) {
        eng.note("perc", {
          t: t + U.jitter(rng, 8),
          f: 8200 + rng.range(-900, 900), q: 1.1, life: 0.055,
          gain: U.vel(rng, 0.16, 0.3), pan: rng.range(-0.5, 0.5),
          dry: 0.8, rev: 0.25, dly: 0.2, bus: bus
        });
      }

      /* pad, once a bar, very long */
      if (U.has(sec, "pad") && pos === 0 && bar % 2 === 0) {
        const open = 1400 + U.through(ARRANGEMENT, at) * 2600;
        chord.forEach(function (n, i) {
          eng.note("pad", {
            t: t + rng.range(0, 0.05),
            f: T.mtof(n), a: 2.2, d: 1.4, s: 0.8, hold: 2.4, r: 3.2,
            gain: 0.075, open: open, shut: 300,
            pan: (i - 1.5) * 0.32, wow: st.wow,
            dry: 0.55, rev: 1.0, dly: 0, bus: bus
          });
        });
      }
    }
  };
})(window.DAA);
