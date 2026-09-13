/* ------------------------------------------------------------------ *
 *  Signal Decay -- Euclidean noise percussion through a bit crusher, a
 *  dorian bass riff, and the ping-pong delay doing half the rhythmic
 *  work. The busiest thing here.
 *
 *  The crusher sits on the percussion bus only. Across a master bus it
 *  would just sound broken.
 * ------------------------------------------------------------------ */

(function (DAA) {
  "use strict";
  const T = DAA.theory, U = DAA.trackUtil;

  const ARRANGEMENT = [
    { bar: 0,  name: "ticks",     layers: ["perc"] },
    { bar: 6,  name: "bass",      layers: ["perc", "bass"] },
    { bar: 16, name: "counter",   layers: ["perc", "bass", "counter"] },
    { bar: 28, name: "opening",   layers: ["perc", "bass", "counter", "pad"] },
    { bar: 44, name: "drop out",  layers: ["bass", "pad"] },
    { bar: 52, name: "all of it", layers: ["perc", "bass", "counter", "pad", "lead"] },
    { bar: 72, name: "crushed",   layers: ["perc", "bass"] },
    { bar: 82, name: "gone",      layers: ["pad"] },
    { bar: 90, name: "again",     layers: ["perc", "bass", "counter"] }
  ];
  const LOOP_AT = 90, LOOP_TO = 16;

  DAA.tracks.decay = {
    id: "decay",
    title: "Ｓｉｇｎａｌ　Ｄｅｃａｙ",
    blurb: "euclidean percussion, bitcrushed. the busiest one.",
    bpm: 84,
    root: 43,                        // G2
    mode: "dorian",
    hiss: 0.013,
    delayTime: 60 / 84 * 0.75,       // dotted eighth, carrying the rhythm
    feedback: 0.56,
    arrangement: ARRANGEMENT,

    init: function (ctx, bus, rng) {
      /* the crushed bus: quantise, then a lowpass standing in for the
         anti-aliasing a real sample-rate reducer would need a worklet for */
      const crush = DAA.fx.makeCrusher(ctx, 5);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 5200;
      const g = ctx.createGain();
      g.gain.value = 0.9;
      crush.connect(lp); lp.connect(g); g.connect(bus.dry);

      // notes go INTO the crusher, not past it. routing them at `g` put them
      // after the quantiser and bypassed the only thing this track is about.
      const crushBus = { dry: crush, reverb: bus.reverb, delay: bus.delay };

      return {
        rng: rng,
        crushBus: crushBus,
        lp: lp,
        prog: T.progression(this.root, this.mode, [0, 6, 3, 4], 4),
        riff: T.rotate(T.euclid(5, 16), 2),          // the main pulse
        counter: T.euclid(7, 11),                    // 11 against 16
        hats: T.rotate(T.euclid(9, 16), 5),
        scale: T.scale(this.root, this.mode, 3)
      };
    },

    onStep: function (ctx, bus, st, step, t, eng) {
      const bar = Math.floor(step / 16);
      const pos = step % 16;
      const at = U.loopBar(bar, LOOP_AT, LOOP_TO);
      const sec = U.sectionAt(ARRANGEMENT, at);
      const rng = st.rng;
      const chord = st.prog[Math.floor(bar / 4) % st.prog.length];
      const open = U.through(ARRANGEMENT, at);

      // the crusher's lowpass opens across each section: a 30-second sweep
      st.lp.frequency.setTargetAtTime(2600 + open * 5200, t, 2.5);

      /* the low hits */
      if (U.has(sec, "perc") && st.riff[pos]) {
        eng.note("perc", {
          t: t + U.jitter(rng, 9),
          f: 190, sweep: 80, q: 1.1, life: 0.13,
          gain: U.vel(rng, 0.20, 0.15), pan: rng.gauss(0, 0.12),
          dry: 1, rev: 0.15, dly: 0.1, bus: st.crushBus
        });
        eng.dip(t, 0.72, 0.02, 0.18);
      }

      /* the counter-rhythm, 11 steps against the bar */
      if (U.has(sec, "counter") && st.counter[step % st.counter.length]) {
        eng.note("perc", {
          t: t + U.jitter(rng, 11),
          f: 1900 + rng.range(-500, 900), q: 3.2, life: 0.07,
          gain: U.vel(rng, 0.20, 0.28),
          pan: rng.range(-0.8, 0.8),
          dry: 0.7, rev: 0.3, dly: 0.55, bus: st.crushBus
        });
      }

      /* hats, quiet, wide */
      if (U.has(sec, "perc") && st.hats[pos] && rng.chance(0.8)) {
        eng.note("perc", {
          t: t + U.jitter(rng, 7),
          f: 8600 + rng.range(-1100, 1100), q: 1.1, life: 0.04,
          gain: U.vel(rng, 0.095, 0.35), pan: rng.range(-0.75, 0.75),
          dry: 0.8, rev: 0.2, dly: 0.3, bus: st.crushBus
        });
      }

      /* the bass riff: dorian, and it moves */
      if (U.has(sec, "bass") && (pos % 4 === 0 || (pos % 8 === 6 && rng.chance(0.5)))) {
        const deg = rng.pick([0, 0, 0, 2, 4, 6]);
        eng.note("sub", {
          t: t + U.jitter(rng, 7),
          f: T.mtof(chord[0] - 12 + T.MODES.dorian[deg % 7]),
          gain: U.vel(rng, 0.22, 0.1),
          a: 0.005, d: 0.1, s: 0.55, hold: 0.1, r: 0.22,
          drive: 2.2, bus: bus
        });
      }

      /* pad underneath, wide and slow */
      if (U.has(sec, "pad") && pos === 0 && bar % 4 === 0) {
        chord.forEach(function (n, i) {
          eng.note("pad", {
            t: t + rng.range(0, 0.08),
            f: T.mtof(n + 12), a: 2.4, d: 1.6, s: 0.75, hold: 5, r: 4,
            gain: 0.038, open: 800 + open * 2200, shut: 280,
            pan: (i - 1.5) * 0.42,
            dry: 0.45, rev: 0.85, dly: 0, bus: bus
          });
        });
      }

      /* a lead line that phrases and rests */
      if (U.has(sec, "lead")) {
        const inPhrase = (bar % 8) < 5;
        if (pos % 2 === 0 && rng.chance(inPhrase ? 0.3 : 0.04)) {
          const n = st.scale[rng.int(7, st.scale.length - 2)] + 12;
          eng.note("bell", {
            t: t + U.jitter(rng, 13),
            f: T.mtof(n), ratio: rng.pick([1.5, 2.01, 3.0]),
            index: rng.range(180, 520), bright: 0.7,
            life: rng.range(0.9, 2.2), gain: U.vel(rng, 0.075, 0.25),
            pan: rng.range(-0.6, 0.6),
            dry: 0.6, rev: 0.5, dly: 0.7, bus: bus
          });
        }
      }
    }
  };
})(window.DAA);
