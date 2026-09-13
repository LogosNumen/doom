/* ------------------------------------------------------------------ *
 *  Drone -- the bed that plays when you are just reading.
 *
 *  Not a track you choose; it is what the ♫ starts. It has to hold up
 *  for as long as somebody stays on a page, which is longer than any of
 *  the tracks, so it is almost entirely long tones that arrive and leave
 *  at unrelated intervals and never quite line up.
 *
 *  Each page names a room with data-amb, and the room chooses a variant
 *  here: register, density, which layers are awake, how bright. Same
 *  engine, same voices, different place.
 * ------------------------------------------------------------------ */

(function (DAA) {
  "use strict";
  const T = DAA.theory, U = DAA.trackUtil;

  /* The rooms. `every` is in bars between chord entries -- the larger it
     is, the emptier the room feels. */
  const ROOMS = {
    station: { root: 45, mode: "aeolian",  open: 900, every: 8,  gain: 0.050,
               layers: ["pad", "sub", "tick", "air"], tick: 1.5 },
    room:    { root: 48, mode: "aeolian",  open: 700, every: 10, gain: 0.044,
               layers: ["pad", "air"] },
    carrier: { root: 45, mode: "aeolian",  open: 640, every: 12, gain: 0.052,
               layers: ["pad", "sub", "vowel"] },
    sea:     { root: 41, mode: "dorian",   open: 520, every: 12, gain: 0.050,
               layers: ["pad", "swell", "bell"] },
    clock:   { root: 43, mode: "aeolian",  open: 600, every: 10, gain: 0.044,
               layers: ["pad", "tick"], tick: 1.0 },
    empty:   { root: 38, mode: "aeolian",  open: 420, every: 16, gain: 0.038,
               layers: ["pad", "spark"] },
    descend: { root: 40, mode: "phrygian", open: 560, every: 10, gain: 0.046,
               layers: ["pad", "fall"] },
    walk:    { root: 45, mode: "aeolian",  open: 700, every: 8,  gain: 0.046,
               layers: ["pad", "sub", "step"] },
    deep:    { root: 38, mode: "aeolian",  open: 760, every: 8,  gain: 0.056,
               layers: ["pad", "sub", "vowel", "tick", "air"], tick: 1.5 }
  };

  DAA.tracks.drone = {
    id: "drone",
    title: "Ｃａｒｒｉｅｒ　ｏｎｌｙ",
    blurb: "the bed. what the station sounds like when nothing is on it.",
    bpm: 60,                        // one step a quarter-second; it is a grid, not a pulse
    root: 45,
    mode: "aeolian",
    hiss: 0.006,
    sparse: true,
    delayTime: 2.0,
    feedback: 0.4,
    rooms: ROOMS,
    arrangement: [{ bar: 0, name: "bed", layers: ["pad"] }],

    init: function (ctx, bus, rng, eng, opts) {
      const name = (opts && opts.room) || this.__room || "station";
      const r = ROOMS[name] || ROOMS.station;
      return {
        rng: rng,
        room: r,
        name: name,
        prog: T.progression(r.root, r.mode, [0, 5, 3, 6], 4),
        scale: T.scale(r.root, r.mode, 3),
        wow: DAA.fx.makeWow(ctx, 4, 0.19, 4.7),
        i: 0
      };
    },

    onStep: function (ctx, bus, st, step, t, eng) {
      const bar = Math.floor(step / 16);
      const pos = step % 16;
      const rng = st.rng;
      const r = st.room;
      const has = function (l) { return r.layers.indexOf(l) >= 0; };
      const wide = { dry: bus.dry, reverb: bus.vast, delay: bus.delay };

      /* the chord, arriving rarely and leaving slowly */
      if (pos === 0 && bar % r.every === 0) {
        const chord = st.prog[st.i % st.prog.length];
        st.i++;
        chord.forEach(function (n, k) {
          eng.note("pad", {
            // ragged entries: the voices are never quite together
            t: t + rng.range(0, 1.4),
            f: T.mtof(n),
            a: rng.range(5, 9), d: 3, s: 0.85,
            hold: r.every * 2.2, r: rng.range(6, 10),
            gain: r.gain * rng.range(0.8, 1.15),
            open: r.open, shut: r.open * 0.45,
            lfo: 0.017 + k * 0.006, lfoDepth: 130,
            pan: (k - 1.5) * 0.42 + rng.gauss(0, 0.1),
            wow: st.wow,
            dry: 0.55, rev: 0.8, dly: 0, bus: wide
          });
        });
      }

      /* a low note holding the room down */
      if (has("sub") && pos === 0 && bar % (r.every * 2) === 0) {
        eng.note("pad", {
          t: t, f: T.mtof(st.prog[st.i % st.prog.length][0] - 12),
          a: 8, d: 4, s: 0.9, hold: r.every * 4, r: 10,
          gain: r.gain * 0.9, open: 300, shut: 150, lfo: 0.011, lfoDepth: 60,
          pan: 0, dry: 0.6, rev: 0.4, dly: 0, bus: wide
        });
      }

      /* the lamp relay, at forty a minute -- 1.5s, the rate the manual
         keeps complaining about */
      if (has("tick") && r.tick) {
        const per = Math.round(r.tick / (60 / 60 / 4));
        if (step % per === 0) {
          eng.note("perc", {
            t: t + U.jitter(rng, 12),
            f: 2600, q: 6, life: 0.03,
            gain: 0.035 * rng.range(0.8, 1.2),
            pan: rng.gauss(0, 0.15),
            dry: 0.8, rev: 0.3, dly: 0, bus: bus
          });
        }
      }

      /* very quiet air */
      if (has("air") && pos % 8 === 0 && rng.chance(0.22)) {
        eng.note("perc", {
          t: t + rng.range(0, 2),
          f: rng.range(1600, 5400), q: 0.6,
          life: rng.range(1.5, 3.5), gain: 0.012,
          pan: rng.range(-0.9, 0.9),
          dry: 0.3, rev: 0.8, dly: 0.2, bus: wide
        });
      }

      /* room-specific colour */
      if (has("vowel") && pos === 0 && bar % (r.every + 3) === 0) {
        eng.note("vowel", {
          t: t + rng.range(0, 1),
          f: T.mtof(st.prog[st.i % st.prog.length][2] + 12),
          from: "u", to: rng.pick(["o", "a"]), glide: 12,
          a: 6, d: 3, s: 0.85, hold: 10, r: 8,
          gain: 0.035, pan: rng.range(-0.6, 0.6),
          dry: 0.2, rev: 1.0, dly: 0.2, bus: wide
        });
      }

      if (has("swell") && pos % 4 === 0 && rng.chance(0.1)) {
        eng.note("perc", {
          t: t + rng.range(0, 1.5),
          f: 380, sweep: 180, q: 0.5, type: "lowpass",
          life: rng.range(3, 6), gain: 0.06,
          pan: rng.range(-0.7, 0.7),
          dry: 0.5, rev: 0.7, dly: 0, bus: wide
        });
      }

      if (has("bell") && rng.chance(0.006)) {
        eng.note("bell", {
          t: t + rng.range(0, 2),
          f: T.mtof(st.scale[rng.int(7, st.scale.length)] + 12),
          ratio: 1.732, index: 200, bright: 2.5, life: rng.range(5, 9),
          gain: 0.04, pan: rng.range(-0.8, 0.8),
          dry: 0.35, rev: 1.0, dly: 0.5, bus: wide
        });
      }

      if (has("spark") && rng.chance(0.004)) {
        eng.note("bell", {
          t: t + rng.range(0, 3),
          f: T.mtof(st.scale[rng.int(10, st.scale.length)] + 12),
          ratio: 3.162, index: 120, bright: 1.2, life: 3,
          gain: 0.03, pan: rng.range(-0.9, 0.9),
          dry: 0.3, rev: 0.9, dly: 0.4, bus: wide
        });
      }

      if (has("fall") && pos === 0 && bar % 7 === 0) {
        eng.note("bell", {
          t: t + rng.range(0, 0.5),
          f: T.mtof(st.prog[st.i % st.prog.length][1] + 12),
          ratio: 1.414, index: 700, bright: 4,
          life: rng.range(6, 10), gain: 0.045,
          pan: rng.gauss(0, 0.3),
          dry: 0.4, rev: 0.95, dly: 0.3, bus: wide
        });
      }

      if (has("step") && pos % 16 === 0 && rng.chance(0.5)) {
        eng.note("perc", {
          t: t + rng.range(0, 1.2),
          f: 150, sweep: 70, q: 1, life: 0.3,
          gain: 0.07, pan: rng.gauss(0, 0.2),
          dry: 0.8, rev: 0.4, dly: 0, bus: bus
        });
      }
    }
  };
})(window.DAA);
