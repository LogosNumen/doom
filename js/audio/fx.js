/* ------------------------------------------------------------------ *
 *  fx.js -- space, dirt, and the master chain.
 *
 *  One reverb and one delay for the whole mix, shared, fed by sends.
 *  Building a ConvolverNode per note is the classic way to make a page
 *  audibly seize up after a minute.
 *
 *  Impulse responses are generated here from noise and an exponential
 *  decay, decorrelated between channels and darkened across the tail.
 *  No audio files, same as everything else on this site.
 * ------------------------------------------------------------------ */

window.DAA = window.DAA || {};

(function (DAA) {
  "use strict";

  /* ---- impulse responses ------------------------------------------- */

  /**
   * A room, from arithmetic.
   *
   * Noise shaped by an exponential decay, with a one-pole lowpass whose
   * cutoff falls as the tail progresses, so the reverb darkens as it dies
   * the way a real room does. Left and right use independent noise, which
   * is what makes the tail wide instead of a mono blur in the middle.
   */
  function makeIR(ctx, opts) {
    const seconds = opts.seconds;
    const rate = ctx.sampleRate;
    const len = Math.max(1, Math.floor(rate * seconds));
    const pre = Math.floor(rate * (opts.preDelay || 0.025));
    const buf = ctx.createBuffer(2, len + pre, rate);
    const decay = opts.decay === undefined ? 3.2 : opts.decay;
    const damp = opts.damp === undefined ? 0.35 : opts.damp;

    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        // exponential fall
        const env = Math.pow(1 - t, decay);
        // early build so it does not start at full level and sound like a gate
        const swell = Math.min(1, i / (rate * 0.008));
        const white = Math.random() * 2 - 1;
        // damping coefficient closes as the tail goes on
        const a = Math.max(0.04, damp * (1 - t * 0.85));
        lp += a * (white - lp);
        d[i + pre] = lp * env * swell;
      }
    }
    return buf;
  }

  /* ---- reverb ------------------------------------------------------ */

  function makeReverb(ctx, dest, ir, level) {
    const send = ctx.createGain();
    send.gain.value = level === undefined ? 1 : level;
    const conv = ctx.createConvolver();
    conv.buffer = ir;
    conv.normalize = true;
    // keep the low end out of the tail or the whole mix turns to soup
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 180;
    const out = ctx.createGain();
    out.gain.value = 1;

    send.connect(conv);
    conv.connect(hp);
    hp.connect(out);
    out.connect(dest);

    return { input: send, output: out, conv: conv };
  }

  /* ---- ping-pong delay --------------------------------------------- *
   * Two lines cross-fed, so a repeat alternates sides. The lowpass in the
   * feedback path is what stops it turning into a hiss generator after
   * eight repeats.                                                      */

  function makePingPong(ctx, dest, time, feedback) {
    const input = ctx.createGain();
    const dl = ctx.createDelay(4.0);
    const dr = ctx.createDelay(4.0);
    dl.delayTime.value = time;
    dr.delayTime.value = time;

    const fb = ctx.createGain();
    // hard cap: a delay line above about 0.8 will run away and pin the meters
    fb.gain.value = Math.min(0.72, feedback === undefined ? 0.45 : feedback);

    const damp = ctx.createBiquadFilter();
    damp.type = "lowpass";
    damp.frequency.value = 2200;

    const pl = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    const pr = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    if (pl.pan) pl.pan.value = -0.85;
    if (pr.pan) pr.pan.value = 0.85;

    const out = ctx.createGain();
    out.gain.value = 1;

    input.connect(dl);
    dl.connect(pl); pl.connect(out);
    dl.connect(damp);
    damp.connect(dr);
    dr.connect(pr); pr.connect(out);
    dr.connect(fb);
    fb.connect(dl);                       // the cross-feed that makes it pong
    out.connect(dest);

    return {
      input: input, output: out,
      setTime: function (t) {
        const now = ctx.currentTime;
        dl.delayTime.setTargetAtTime(t, now, 0.05);
        dr.delayTime.setTargetAtTime(t, now, 0.05);
      },
      setFeedback: function (v) { fb.gain.value = Math.min(0.72, Math.max(0, v)); }
    };
  }

  /* ---- chorus ------------------------------------------------------ */

  function makeChorus(ctx, dest, depth, rate) {
    const input = ctx.createGain();
    const out = ctx.createGain();
    out.gain.value = 0.5;
    const nodes = [];

    [-1, 1].forEach(function (side, i) {
      const d = ctx.createDelay(0.1);
      d.delayTime.value = 0.012 + i * 0.007;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = (rate || 0.22) * (i ? 1.31 : 1);   // never in step
      // opposite phase: one line widens as the other narrows
      const amt = ctx.createGain();
      amt.gain.value = (depth || 0.004) * side;
      lfo.connect(amt); amt.connect(d.delayTime);
      lfo.start();

      const p = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
      if (p.pan) p.pan.value = side * 0.8;

      input.connect(d); d.connect(p); p.connect(out);
      nodes.push(lfo);
    });

    out.connect(dest);
    return { input: input, output: out, stop: function () {
      nodes.forEach(function (n) { try { n.stop(); } catch (e) {} });
    } };
  }

  /* ---- saturation & quantisation ----------------------------------- */

  /** tanh curve. Soft knee, no hard corners, so it warms rather than fuzzes. */
  function tanhCurve(amount) {
    const n = 2048;
    const c = new Float32Array(n);
    const k = amount || 2.2;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      c[i] = Math.tanh(x * k) / Math.tanh(k);
    }
    return c;
  }

  function makeSaturator(ctx, amount) {
    const ws = ctx.createWaveShaper();
    ws.curve = tanhCurve(amount);
    ws.oversample = "2x";
    return ws;
  }

  /**
   * Bit reduction, as a quantising transfer curve.
   *
   * Honest note: this is bit-depth only. True sample-rate reduction needs
   * a sample-and-hold, which means an AudioWorklet -- and worklets load as
   * modules, which breaks this site's ability to run from file://. The
   * lowpass alongside stands in for the missing anti-alias character.
   */
  function makeCrusher(ctx, bits) {
    const n = 2048;
    const c = new Float32Array(n);
    const steps = Math.pow(2, bits || 6);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      c[i] = Math.round(x * steps) / steps;
    }
    const ws = ctx.createWaveShaper();
    ws.curve = c;
    ws.oversample = "none";              // the aliasing is the point
    return ws;
  }

  /* ---- tape -------------------------------------------------------- *
   * The thread back to the site's compressed, degraded look: a little
   * saturation, a gentle high cut, and a hiss bed always underneath.    */

  function makeHiss(ctx, dest, level) {
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        last = (last + 0.06 * w) / 1.06;       // slightly brown, less fizzy
        d[i] = last * 2.2 + w * 0.15;
      }
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    /* Highpassed rather than bandpassed. A narrow band at 3kHz gives the
       mix no air at all above 5k, and on a record where every other voice
       is deliberately lowpassed the hiss is the only thing up there. It is
       the tape thread and the top octave at the same time. */
    const bp = ctx.createBiquadFilter();
    bp.type = "highpass";
    bp.frequency.value = 1800;
    bp.Q.value = 0.5;
    const tilt = ctx.createBiquadFilter();
    tilt.type = "highshelf";
    tilt.frequency.value = 6000;
    tilt.gain.value = 4;
    const g = ctx.createGain();
    g.gain.value = level === undefined ? 0.006 : level;
    src.connect(bp); bp.connect(tilt); tilt.connect(g); g.connect(dest);
    src.start();
    return { source: src, gain: g };
  }

  /**
   * Wow and flutter. Two slow LFOs at unrelated rates, summed onto a
   * detune param. Attach it to anything with a detune AudioParam.
   */
  function makeWow(ctx, depthCents, wowRate, flutterRate) {
    const out = ctx.createGain();
    out.gain.value = 1;
    const nodes = [];

    const wow = ctx.createOscillator();
    wow.frequency.value = wowRate || 0.27;
    const wg = ctx.createGain();
    wg.gain.value = depthCents === undefined ? 6 : depthCents;
    wow.connect(wg); wg.connect(out); wow.start();
    nodes.push(wow);

    const flut = ctx.createOscillator();
    flut.frequency.value = flutterRate || 5.7;
    const fg = ctx.createGain();
    fg.gain.value = (depthCents === undefined ? 6 : depthCents) * 0.18;
    flut.connect(fg); fg.connect(out); flut.start();
    nodes.push(flut);

    return {
      output: out,
      connect: function (param) { out.connect(param); },
      stop: function () { nodes.forEach(function (n) { try { n.stop(); } catch (e) {} }); }
    };
  }

  /* ---- master chain ------------------------------------------------ *
   * Highpass to kill DC and rumble, gentle bus glue, then a limiter doing
   * the actual catching. Peaks want to sit below -1 dBFS.               */

  function makeMaster(ctx, dest) {
    const input = ctx.createGain();
    input.gain.value = 1;

    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 30;

    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -18;
    glue.knee.value = 18;
    glue.ratio.value = 2.2;
    glue.attack.value = 0.02;
    glue.release.value = 0.25;

    const sat = makeSaturator(ctx, 1.4);

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.12;

    // final trim, so the limiter is not also the volume control
    const trim = ctx.createGain();
    trim.gain.value = 0.82;

    input.connect(hp);
    hp.connect(glue);
    glue.connect(sat);
    sat.connect(limiter);
    limiter.connect(trim);
    trim.connect(dest);

    return { input: input, output: trim, limiter: limiter, trim: trim };
  }

  DAA.fx = {
    makeIR: makeIR,
    makeReverb: makeReverb,
    makePingPong: makePingPong,
    makeChorus: makeChorus,
    makeSaturator: makeSaturator,
    makeCrusher: makeCrusher,
    makeHiss: makeHiss,
    makeWow: makeWow,
    makeMaster: makeMaster,
    tanhCurve: tanhCurve
  };
})(window.DAA);
