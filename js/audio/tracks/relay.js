/* ------------------------------------------------------------------ *
 *  Relay -- the melodic one.
 *
 *  A seven-step arpeggio running against a sixteen-step bar, so the
 *  pattern does not come back round to the same place for seven bars.
 *  Over the top, a melody that phrases and then stops, built by walking
 *  the scale with a bias toward small intervals and letting it leap
 *  occasionally.
 * ------------------------------------------------------------------ */

(function (DAA) {
  "use strict";
  const T = DAA.theory, U = DAA.trackUtil;

  const ARRANGEMENT = [
    { bar: 0,  name: "arp alone",  layers: ["arp"] },
    { bar: 8,  name: "ground",     layers: ["arp", "bass"] },
    { bar: 16, name: "pad",        layers: ["arp", "bass", "pad"] },
    { bar: 28, name: "the tune",   layers: ["arp", "bass", "pad", "lead"] },
    { bar: 48, name: "arp only",   layers: ["arp", "bass"] },
    { bar: 56, name: "everything", layers: ["arp", "bass", "pad", "lead", "bell"] },
    { bar: 78, name: "thinning",   layers: ["arp", "pad"] },
    { bar: 88, name: "out",        layers: ["pad"] },
    { bar: 96, name: "again",      layers: ["arp", "bass", "pad"] }
  ];
  const LOOP_AT = 96, LOOP_TO = 16;

  DAA.tracks.relay = {
    id: "relay",
    title: "Ｒｅｌａｙ",
    blurb: "an arpeggio in polymeter with a melody over it.",
    bpm: 76,
    root: 45,                     // A2
    mode: "aeolian",
    hiss: 0.007,
    delayTime: 60 / 76 * 0.75,
    feedback: 0.48,
    arrangement: ARRANGEMENT,

    init: function (ctx, bus, rng) {
      const scale = T.scale(this.root, this.mode, 4);
      return {
        rng: rng,
        scale: scale,
        prog: T.progression(this.root, this.mode, [0, 5, 2, 4, 0, 3, 6, 4], 4),
        arpLen: 7,                 // against 16. seven bars to come round.
        arpAt: 0,
        // the melody's current position in the scale, so it moves by step
        mel: 14,
        phrase: 0
      };
    },

    onStep: function (ctx, bus, st, step, t, eng) {
      const bar = Math.floor(step / 16);
      const pos = step % 16;
      const at = U.loopBar(bar, LOOP_AT, LOOP_TO);
      const sec = U.sectionAt(ARRANGEMENT, at);
      const rng = st.rng;
      const chord = st.prog[Math.floor(bar / 2) % st.prog.length];
      const open = U.through(ARRANGEMENT, at);

      /* the arpeggio: every other sixteenth, cycling a 7-note figure */
      if (U.has(sec, "arp") && pos % 2 === 0) {
        const idx = st.arpAt % st.arpLen;
        st.arpAt++;
        // a seven-note shape drawn from the chord, wrapping octaves
        const tone = chord[idx % chord.length] + (idx >= chord.length ? 12 : 0);
        eng.note("pluck", {
          t: t + U.jitter(rng, 8),
          f: T.mtof(Math.min(64, tone + 12)),
          gain: U.vel(rng, 0.30, 0.2),
          decay: 0.87, damp: 1600 + open * 2600,
          life: rng.range(1.1, 2.0),
          pan: Math.sin(st.arpAt * 0.7) * 0.55,
          dry: 0.8, rev: 0.45, dly: 0.4, bus: bus
        });
      }

      /* bass on the bar and the middle of it */
      if (U.has(sec, "bass") && (pos === 0 || pos === 10)) {
        eng.note("sub", {
          t: t + U.jitter(rng, 6),
          f: T.mtof(chord[0] - 12),
          gain: U.vel(rng, 0.11, 0.1),
          a: 0.008, d: 0.14, s: 0.55, hold: 0.5, r: 0.4,
          drive: 1.7, bus: bus
        });
        if (pos === 0) eng.dip(t, 0.78, 0.02, 0.22);
      }

      /* pad */
      if (U.has(sec, "pad") && pos === 0 && bar % 2 === 0) {
        chord.forEach(function (n, i) {
          eng.note("pad", {
            t: t + rng.range(0, 0.07),
            f: T.mtof(n), a: 1.8, d: 1.2, s: 0.78, hold: 2.2, r: 2.8,
            gain: 0.058, open: 900 + open * 2400, shut: 320,
            pan: (i - 1.5) * 0.38,
            dry: 0.5, rev: 0.8, dly: 0, bus: bus
          });
        });
      }

      /* the melody. four bars of phrase, two of rest, and it moves by
         step far more often than it leaps. */
      if (U.has(sec, "lead")) {
        const inPhrase = (bar % 6) < 4;
        if (inPhrase && pos % 2 === 0 && rng.chance(0.34)) {
          const leap = rng.chance(0.18);
          const move = leap ? rng.int(-4, 5) : rng.pick([-2, -1, -1, 1, 1, 2]);
          st.mel = Math.max(10, Math.min(st.scale.length - 2, st.mel + move));
          // land on a chord tone at the start of a bar, pass between them otherwise
          let n = st.scale[st.mel];
          if (pos === 0) {
            const tones = chord.map(function (c) { return c % 12; });
            let guard = 0;
            while (tones.indexOf(n % 12) < 0 && guard++ < 7) {
              st.mel++; n = st.scale[Math.min(st.scale.length - 1, st.mel)];
            }
          }
          eng.note("organ", {
            t: t + U.jitter(rng, 14),
            f: T.mtof(n + 12), table: "soft",
            a: 0.05, d: 0.2, s: 0.5, hold: rng.range(0.1, 0.5), r: 1.1,
            gain: U.vel(rng, 0.125, 0.2),
            tone: 2800, pan: rng.gauss(0, 0.25),
            dry: 0.75, rev: 0.6, dly: 0.45, bus: bus
          });
        }
      }

      /* a bell marking the top of a phrase */
      if (U.has(sec, "bell") && pos === 0 && bar % 6 === 0) {
        eng.note("bell", {
          t: t + rng.range(0, 0.1),
          f: T.mtof(chord[chord.length - 1] + 24),
          ratio: 2.414, index: rng.range(300, 700), bright: 1.6,
          life: rng.range(4, 7), gain: 0.095,
          pan: rng.range(-0.5, 0.5),
          dry: 0.5, rev: 0.9, dly: 0.5, bus: bus
        });
      }
    }
  };
})(window.DAA);
