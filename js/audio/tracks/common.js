/* ------------------------------------------------------------------ *
 *  tracks/common.js -- the bits every track needs.
 *
 *  An arrangement is data: a list of sections with a start time in bars
 *  and a set of layers that are awake during it. Keeping it as a table at
 *  the top of each track file means the shape of the piece is readable
 *  without following the code, and editable without understanding it.
 * ------------------------------------------------------------------ */

window.DAA = window.DAA || {};
window.DAA.tracks = window.DAA.tracks || {};

(function (DAA) {
  "use strict";

  /** Which section is running at this bar. */
  function sectionAt(arrangement, bar) {
    let cur = arrangement[0];
    for (let i = 0; i < arrangement.length; i++) {
      if (bar >= arrangement[i].bar) cur = arrangement[i];
      else break;
    }
    return cur;
  }

  function has(section, layer) {
    return !!(section && section.layers && section.layers.indexOf(layer) >= 0);
  }

  /**
   * How far through the current section we are, 0..1. Filter sweeps want
   * to take thirty seconds, not two, and this is what lets a track say so
   * without hard-coding times.
   */
  function through(arrangement, bar) {
    let idx = 0;
    for (let i = 0; i < arrangement.length; i++) {
      if (bar >= arrangement[i].bar) idx = i;
    }
    const from = arrangement[idx].bar;
    const to = idx + 1 < arrangement.length ? arrangement[idx + 1].bar : from + 16;
    return Math.max(0, Math.min(1, (bar - from) / Math.max(1, to - from)));
  }

  /** Timing humanisation, in seconds. Machine-exact timing sounds dead. */
  function jitter(rng, ms) {
    return rng.gauss(0, (ms === undefined ? 10 : ms) / 1000);
  }

  /** Velocity variation, kept positive. */
  function vel(rng, base, spread) {
    return Math.max(0.04, base * (1 + rng.gauss(0, spread === undefined ? 0.16 : spread)));
  }

  /** Total length of an arrangement in bars. */
  function bars(arrangement) {
    const last = arrangement[arrangement.length - 1];
    return last.bar + (last.length || 16);
  }

  /**
   * Tracks run forever, but an arrangement is finite. Past `loopAt` the
   * bar count folds back to `loopTo`, so the piece keeps its shape without
   * ever reaching a hard stop -- and because the generators are seeded
   * from a running PRNG rather than the bar number, the second pass
   * through a section is not the same music as the first.
   */
  function loopBar(bar, loopAt, loopTo) {
    if (bar < loopAt) return bar;
    const span = Math.max(1, loopAt - loopTo);
    return loopTo + ((bar - loopAt) % span);
  }

  DAA.trackUtil = {
    sectionAt: sectionAt,
    has: has,
    through: through,
    jitter: jitter,
    vel: vel,
    bars: bars,
    loopBar: loopBar
  };
})(window.DAA);
