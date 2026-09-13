/* ------------------------------------------------------------------ *
 *  Test Card -- lydian organ swells and tape wow. The warmest thing
 *  here, which on this site is not saying much, but the raised fourth
 *  keeps it from settling into the same minor as everything else.
 * ------------------------------------------------------------------ */

(function (DAA) {
  "use strict";
  const T = DAA.theory, U = DAA.trackUtil;

  const ARRANGEMENT = [
    { bar: 0,  name: "warm up",   layers: ["organ"] },
    { bar: 8,  name: "sub in",    layers: ["organ", "sub"] },
    { bar: 18, name: "upper",     layers: ["organ", "sub", "upper"] },
    { bar: 32, name: "full card", layers: ["organ", "sub", "upper", "shimmer"] },
    { bar: 48, name: "held",      layers: ["organ", "shimmer"] },
    { bar: 58, name: "return",    layers: ["organ", "sub", "upper", "shimmer"] },
    { bar: 76, name: "fade",      layers: ["organ", "sub"] },
    { bar: 86, name: "again",     layers: ["organ", "sub", "upper"] }
  ];
  const LOOP_AT = 86, LOOP_TO = 18;

  DAA.tracks.testcard = {
    id: "testcard",
    title: "Ｔｅｓｔ　Ｃａｒｄ",
    blurb: "lydian organ swells, tape wow. the closest thing here to warmth.",
    bpm: 66,
    root: 53,                      // F3
    mode: "lydian",
    hiss: 0.030,                   // the most tape-like track gets the most hiss
    delayTime: 60 / 66,
    feedback: 0.3,
    arrangement: ARRANGEMENT,

    init: function (ctx, bus, rng) {
      return {
        rng: rng,
        // I - II - vi - IV in lydian: the II is the one with the raised fourth
        prog: T.progression(this.root, this.mode, [0, 1, 5, 3], 4),
        // wow is the whole character of this one, so it is deeper than usual
        wow: DAA.fx.makeWow(ctx, 9, 0.17, 5.1)
      };
    },

    onStep: function (ctx, bus, st, step, t, eng) {
      const bar = Math.floor(step / 16);
      const pos = step % 16;
      const at = U.loopBar(bar, LOOP_AT, LOOP_TO);
      const sec = U.sectionAt(ARRANGEMENT, at);
      const rng = st.rng;
      const chord = st.prog[Math.floor(bar / 2) % st.prog.length];

      /* the swell: a chord that arrives slowly, twice a bar-pair */
      if (U.has(sec, "organ") && pos === 0 && bar % 2 === 0) {
        const open = U.through(ARRANGEMENT, at);
        chord.forEach(function (n, i) {
          eng.note("organ", {
            t: t + rng.range(0, 0.09),
            f: T.mtof(n), table: rng.chance(0.5) ? "drawbar" : "soft",
            a: 1.6 + rng.range(0, 0.6),        // the swell IS the instrument
            d: 0.9, s: 0.85, hold: 2.4, r: 2.2,
            gain: U.vel(rng, 0.105, 0.12),
            tone: 2200 + open * 2600,
            pan: (i - 1.5) * 0.36,
            detune: rng.gauss(0, 4),
            wow: st.wow,
            dry: 0.7, rev: 0.55, dly: 0.15, bus: bus
          });
        });
      }

      /* a slow bass, one note every two bars, sliding in */
      if (U.has(sec, "sub") && pos === 0 && bar % 2 === 0) {
        eng.note("sub", {
          t: t + 0.02,
          f: T.mtof(chord[0] - 12),
          gain: 0.15, a: 0.08, d: 0.4, s: 0.7, hold: 2.6, r: 1.2,
          slide: 0.9, glide: 0.25, drive: 1.3, bus: bus
        });
      }

      /* an upper voice picking one chord tone and holding it */
      if (U.has(sec, "upper") && pos === 8 && rng.chance(0.55)) {
        const n = chord[rng.int(1, chord.length)] + 12;
        eng.note("organ", {
          t: t + U.jitter(rng, 20),
          f: T.mtof(n), table: "hollow",
          a: 0.9, d: 0.5, s: 0.6, hold: 1.4, r: 1.8,
          gain: U.vel(rng, 0.08, 0.2),
          tone: 3200, pan: rng.range(-0.7, 0.7),
          wow: st.wow,
          dry: 0.55, rev: 0.8, dly: 0.3, bus: bus
        });
      }

      /* shimmer: a bell two octaves up, rare, so the card has a highlight */
      if (U.has(sec, "shimmer") && rng.chance(0.12)) {
        eng.note("bell", {
          t: t + U.jitter(rng, 25),
          f: T.mtof(chord[rng.int(0, chord.length)] + 24),
          ratio: 2.01, index: rng.range(120, 320), bright: 1.1,
          life: rng.range(2.5, 4.5), gain: U.vel(rng, 0.075, 0.3),
          pan: rng.range(-0.8, 0.8),
          dry: 0.4, rev: 0.9, dly: 0.5, bus: bus
        });
      }
    }
  };
})(window.DAA);
