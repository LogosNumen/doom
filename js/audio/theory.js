/* ------------------------------------------------------------------ *
 *  theory.js -- the part that decides what the notes are.
 *
 *  No audio in here at all. Seeded randomness, scales, chords built by
 *  stacking thirds, voice leading that actually moves by step, Euclidean
 *  rhythm, and the two unit conversions everything else needs.
 *
 *  Plain script, global DAA namespace, loaded in order. Not ES modules:
 *  the rest of this site works when opened straight off a disk from
 *  file://, and module imports do not.
 * ------------------------------------------------------------------ */

window.DAA = window.DAA || {};

(function (DAA) {
  "use strict";

  /* ---- seeded randomness ------------------------------------------ *
   * mulberry32. Small, fast, and good enough that nobody will hear the
   * difference. Seeded so a track is reproducible when debugging, and
   * reseeded per session so no two visits are the same piece.          */

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function Rng(seed) {
    const f = mulberry32(seed);
    return {
      seed: seed,
      f: f,
      /** 0..1 */
      next: f,
      /** a..b */
      range: function (a, b) { return a + f() * (b - a); },
      /** integer a..b-1 */
      int: function (a, b) { return Math.floor(a + f() * (b - a)); },
      pick: function (arr) { return arr[Math.floor(f() * arr.length)]; },
      chance: function (p) { return f() < p; },
      /** roughly normal, for humanising -- sum of three is close enough */
      gauss: function (mean, dev) {
        return mean + ((f() + f() + f()) / 3 - 0.5) * 2 * (dev || 1);
      },
      /** a shuffled copy */
      shuffle: function (arr) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
          const j = Math.floor(f() * (i + 1));
          const t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
      }
    };
  }

  /* ---- pitch ------------------------------------------------------- */

  /** MIDI note to hertz. 69 is A440. */
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  function noteName(m) { return NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1); }

  /* Modes as semitone offsets. The dark ones plus lydian for the odd
     track out, which is the only place anything here is allowed to sound
     like it is in a good mood. */
  const MODES = {
    aeolian:  [0, 2, 3, 5, 7, 8, 10],
    dorian:   [0, 2, 3, 5, 7, 9, 10],
    phrygian: [0, 1, 3, 5, 7, 8, 10],
    lydian:   [0, 2, 4, 6, 7, 9, 11],
    minorPent:[0, 3, 5, 7, 10]
  };

  /**
   * The scale as MIDI numbers across `octaves`, starting at `root`.
   * Root is a MIDI number, so scale(57, "aeolian", 3) is A2 upward.
   */
  function scale(root, mode, octaves) {
    const steps = MODES[mode] || MODES.aeolian;
    const out = [];
    for (let o = 0; o < (octaves || 3); o++) {
      for (let i = 0; i < steps.length; i++) out.push(root + o * 12 + steps[i]);
    }
    return out;
  }

  /** Degree `d` (0-based) of the mode, `size` notes, stacked in thirds. */
  function chord(root, mode, d, size) {
    const steps = MODES[mode] || MODES.aeolian;
    const n = steps.length;
    const out = [];
    for (let i = 0; i < (size || 3); i++) {
      const idx = d + i * 2;                       // thirds = every other degree
      const oct = Math.floor(idx / n);
      out.push(root + oct * 12 + steps[((idx % n) + n) % n]);
    }
    return out;
  }

  /* ---- voice leading ----------------------------------------------- *
   * Random notes from a scale is not a progression. This moves each voice
   * to the nearest available chord tone, trying every rotation of the new
   * chord and keeping whichever moves the least in total.               */

  function nearestOctave(target, near) {
    // shift `target` by octaves until it sits as close to `near` as possible
    let t = target;
    while (t - near > 6) t -= 12;
    while (near - t > 6) t += 12;
    return t;
  }

  function voiceLead(prev, next) {
    if (!prev || !prev.length) return next.slice();
    const n = next.length;
    let best = null, bestCost = Infinity;

    for (let r = 0; r < n; r++) {
      const rot = [];
      for (let i = 0; i < n; i++) rot.push(next[(i + r) % n]);

      const placed = [];
      let cost = 0;
      for (let i = 0; i < n; i++) {
        const near = prev[Math.min(i, prev.length - 1)];
        const p = nearestOctave(rot[i], near);
        placed.push(p);
        cost += Math.abs(p - near);
      }
      // penalise voices crossing, which is what makes a voicing sound muddled
      const sorted = placed.slice().sort(function (a, b) { return a - b; });
      for (let i = 0; i < n; i++) if (sorted[i] !== placed[i]) cost += 1.5;

      if (cost < bestCost) { bestCost = cost; best = placed; }
    }
    return best;
  }

  /**
   * A progression of `len` chords over the mode, as voiced MIDI arrays.
   * Degrees are given so a track can state its own harmony as data.
   */
  function progression(root, mode, degrees, size) {
    const out = [];
    let prev = null;
    for (let i = 0; i < degrees.length; i++) {
      const c = chord(root, mode, degrees[i], size || 4);
      prev = voiceLead(prev, c);
      out.push(prev.slice());
    }
    return out;
  }

  /* ---- rhythm ------------------------------------------------------ *
   * Bjorklund: spread k onsets as evenly as possible over n steps. Every
   * useful non-four-on-the-floor pattern is in here somewhere.          */

  function euclid(k, n) {
    if (k <= 0) return new Array(n).fill(0);
    if (k >= n) return new Array(n).fill(1);
    let a = [], b = [];
    for (let i = 0; i < k; i++) a.push([1]);
    for (let i = 0; i < n - k; i++) b.push([0]);

    while (b.length > 1) {
      const m = Math.min(a.length, b.length);
      const na = [], nb = [];
      for (let i = 0; i < m; i++) na.push(a[i].concat(b[i]));
      if (a.length > m) for (let i = m; i < a.length; i++) nb.push(a[i]);
      else for (let i = m; i < b.length; i++) nb.push(b[i]);
      a = na; b = nb;
    }
    return [].concat.apply([], a.concat(b));
  }

  /** Rotate a pattern, because the same euclid at a different phase is a
      different rhythm and costs nothing. */
  function rotate(pat, by) {
    const n = pat.length;
    const k = ((by % n) + n) % n;
    return pat.slice(k).concat(pat.slice(0, k));
  }

  /* ---- time -------------------------------------------------------- */

  function spb(bpm) { return 60 / bpm; }             // seconds per beat
  function beats(bpm, n) { return n * spb(bpm); }

  /* ---- exports ----------------------------------------------------- */

  DAA.theory = {
    Rng: Rng,
    mulberry32: mulberry32,
    mtof: mtof,
    noteName: noteName,
    MODES: MODES,
    scale: scale,
    chord: chord,
    voiceLead: voiceLead,
    progression: progression,
    euclid: euclid,
    rotate: rotate,
    spb: spb,
    beats: beats
  };
})(window.DAA);
