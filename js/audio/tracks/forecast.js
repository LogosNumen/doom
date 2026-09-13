/* ------------------------------------------------------------------ *
 *  03:00 Forecast -- mostly silence.
 *
 *  Single tones, one low drone, and long gaps between them. This is the
 *  track that makes the other six land: without something this empty in
 *  the list, "sparse" has nothing to be sparse against.
 *
 *  It is the one track allowed to be silent for more than two seconds,
 *  and the analysis exempts it for exactly that reason.
 * ------------------------------------------------------------------ */

(function (DAA) {
  "use strict";
  const T = DAA.theory, U = DAA.trackUtil;

  const ARRANGEMENT = [
    { bar: 0,  name: "nothing",   layers: ["drone"] },
    { bar: 8,  name: "one tone",  layers: ["drone", "tone"] },
    { bar: 24, name: "answer",    layers: ["drone", "tone", "answer"] },
    { bar: 44, name: "quiet",     layers: ["drone"] },
    { bar: 54, name: "two tones", layers: ["drone", "tone", "answer"] },
    { bar: 74, name: "almost",    layers: ["drone", "tone"] },
    { bar: 88, name: "out",       layers: ["drone"] },
    { bar: 96, name: "again",     layers: ["drone", "tone"] }
  ];
  const LOOP_AT = 96, LOOP_TO = 24;

  DAA.tracks.forecast = {
    id: "forecast",
    title: "０３：００　Ｆｏｒｅｃａｓｔ",
    blurb: "mostly silence. single tones and long gaps.",
    bpm: 56,
    root: 41,                      // F2
    mode: "aeolian",
    hiss: 0.011,                   // the hiss is doing a lot of the work here
    sparse: true,                  // the analyser's silence check skips this one
    delayTime: 60 / 56 * 3,
    feedback: 0.52,
    arrangement: ARRANGEMENT,

    init: function (ctx, bus, rng) {
      return {
        rng: rng,
        scale: T.scale(this.root, this.mode, 3),
        prog: T.progression(this.root, this.mode, [0, 5], 3),
        last: -99
      };
    },

    onStep: function (ctx, bus, st, step, t, eng) {
      const bar = Math.floor(step / 16);
      const pos = step % 16;
      const at = U.loopBar(bar, LOOP_AT, LOOP_TO);
      const sec = U.sectionAt(ARRANGEMENT, at);
      const rng = st.rng;

      /* the drone: one note, changing about once a minute */
      if (U.has(sec, "drone") && pos === 0 && bar % 12 === 0) {
        const n = st.prog[Math.floor(bar / 12) % 2][0];
        eng.note("pad", {
          t: t,
          f: T.mtof(n),
          a: 9, d: 4, s: 0.9, hold: 24, r: 12,
          gain: 0.055, open: 460, shut: 170, lfo: 0.016, lfoDepth: 90,
          pan: 0, dry: 0.6, rev: 0.6, dly: 0,
          bus: { dry: bus.dry, reverb: bus.vast, delay: bus.delay }
        });
      }

      /* a single tone, every eight bars at most, and not always then */
      if (U.has(sec, "tone") && pos === 0 && bar % 8 === 0 && bar - st.last >= 8) {
        if (rng.chance(0.75)) {
          st.last = bar;
          const n = st.scale[rng.int(7, st.scale.length)] + 12;
          eng.note("organ", {
            t: t + rng.range(0, 0.4),
            f: T.mtof(n), table: "hollow",
            a: 2.6, d: 1.4, s: 0.7, hold: 3.5, r: 5,
            gain: U.vel(rng, 0.075, 0.15),
            tone: 2400, pan: rng.range(-0.5, 0.5),
            dry: 0.45, rev: 0.9, dly: 0.5,
            bus: { dry: bus.dry, reverb: bus.vast, delay: bus.delay }
          });
        }
      }

      /* something answering it, much later and further away */
      if (U.has(sec, "answer") && pos === 8 && bar % 8 === 4 && rng.chance(0.5)) {
        const n = st.scale[rng.int(4, 10)] + 12;
        eng.note("bell", {
          t: t + rng.range(0, 0.8),
          f: T.mtof(n), ratio: 1.732,
          index: rng.range(120, 300), bright: 2.4,
          life: rng.range(5, 9), gain: U.vel(rng, 0.055, 0.2),
          pan: rng.range(-0.8, 0.8),
          dry: 0.3, rev: 1.0, dly: 0.6,
          bus: { dry: bus.dry, reverb: bus.vast, delay: bus.delay }
        });
      }
    }
  };
})(window.DAA);
