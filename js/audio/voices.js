/* ------------------------------------------------------------------ *
 *  voices.js -- the instruments.
 *
 *  Every voice is a function (ctx, bus, opts) that schedules itself at
 *  opts.t and cleans itself up afterwards. `bus` carries the three
 *  destinations a note can go to: dry, reverb send, delay send.
 *
 *  House rules, applied everywhere:
 *    - gain is never assigned directly, only ramped. Direct assignment
 *      on a running graph is what a click actually is.
 *    - attack is never shorter than 3ms.
 *    - release exponentials stop at a small positive value and then take
 *      a short linear ramp to zero, because an exponential ramp cannot
 *      reach zero and will hold a tiny DC offset forever if you let it.
 *    - nodes stop and disconnect after the release, not before.
 * ------------------------------------------------------------------ */

window.DAA = window.DAA || {};

(function (DAA) {
  "use strict";

  const MIN_A = 0.003;      // 3ms
  const FLOOR = 0.0005;     // where exponential releases hand over to linear

  /* ---- envelope ---------------------------------------------------- */

  /**
   * ADSR onto a gain param, returning when the voice is finished so the
   * caller knows when to tear down.
   */
  function env(param, t, o) {
    const a = Math.max(MIN_A, o.a === undefined ? 0.01 : o.a);
    const d = o.d === undefined ? 0.1 : o.d;
    const s = o.s === undefined ? 0.7 : o.s;
    const r = Math.max(0.02, o.r === undefined ? 0.3 : o.r);
    const peak = Math.max(FLOOR * 2, o.peak === undefined ? 0.3 : o.peak);
    const hold = Math.max(0, o.hold === undefined ? 0.2 : o.hold);
    const sus = Math.max(FLOOR * 2, peak * s);

    param.cancelScheduledValues(t);
    param.setValueAtTime(FLOOR, t);
    param.exponentialRampToValueAtTime(peak, t + a);
    param.exponentialRampToValueAtTime(sus, t + a + d);

    const rel = t + a + d + hold;
    param.setValueAtTime(sus, rel);
    param.exponentialRampToValueAtTime(FLOOR, rel + r);
    param.linearRampToValueAtTime(0, rel + r + 0.01);

    return rel + r + 0.02;
  }

  /** Wire a node to the three destinations with per-send levels. */
  function route(node, bus, o) {
    const dry = o.dry === undefined ? 1 : o.dry;
    if (dry > 0 && bus.dry) {
      const g = node.context.createGain();
      g.gain.value = dry;
      node.connect(g); g.connect(bus.dry);
    }
    if (o.rev > 0 && bus.reverb) {
      const g = node.context.createGain();
      g.gain.value = o.rev;
      node.connect(g); g.connect(bus.reverb);
    }
    if (o.dly > 0 && bus.delay) {
      const g = node.context.createGain();
      g.gain.value = o.dly;
      node.connect(g); g.connect(bus.delay);
    }
  }

  function panner(ctx, pan) {
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan || 0));
      return p;
    }
    return ctx.createGain();
  }

  function cleanup(ctx, nodes, at) {
    /* Offline rendering has no realtime clock: currentTime sits at 0 until
       the render completes, so a wall-clock timer would tear voices down
       while they were still being rendered. The context is thrown away
       after an offline render anyway, so there is nothing to clean up. */
    if (DAA.offline) return;

    const delay = Math.max(0, (at - ctx.currentTime) * 1000) + 120;
    setTimeout(function () {
      nodes.forEach(function (n) {
        try { if (n.stop) n.stop(); } catch (e) {}
        try { n.disconnect(); } catch (e) {}
      });
    }, delay);
  }

  /* ---- periodic waves ---------------------------------------------- *
   * Stock waveforms are the sound of an unfinished patch. These are built
   * from harmonic tables once and cached on the context.                */

  const TABLES = {
    // drawbar-ish: strong fundamental, octave, twelfth
    drawbar:   [0, 1, 0.5, 0.22, 0.35, 0.08, 0.14, 0.04, 0.09],
    // odd harmonics only: hollow, clarinet-like
    hollow:    [0, 1, 0, 0.32, 0, 0.16, 0, 0.09, 0, 0.05],
    // soft, a few partials, nothing above the eighth
    soft:      [0, 1, 0.28, 0.12, 0.06, 0.03],
    // brighter stack for pads that need to cut a little
    glass:     [0, 1, 0.42, 0.3, 0.18, 0.14, 0.1, 0.06, 0.05, 0.03]
  };

  function wave(ctx, name) {
    ctx.__waves = ctx.__waves || {};
    if (ctx.__waves[name]) return ctx.__waves[name];
    const t = TABLES[name] || TABLES.soft;
    const real = new Float32Array(t.length);
    const imag = new Float32Array(t.length);
    for (let i = 0; i < t.length; i++) imag[i] = t[i];
    const w = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
    ctx.__waves[name] = w;
    return w;
  }

  /* ================================================================== *
   *  PAD
   *  Three detuned saws about a cent apart either side, plus a sub sine
   *  an octave down. Lowpass with its own envelope and a slow LFO, so it
   *  opens as it arrives rather than being the same brightness always.
   * ================================================================== */

  function pad(ctx, bus, o) {
    const t = o.t;
    const nodes = [];
    const amp = ctx.createGain();
    amp.gain.value = FLOOR;

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.Q.value = o.q === undefined ? 0.9 : o.q;

    const open = o.open === undefined ? 1800 : o.open;
    const shut = o.shut === undefined ? 320 : o.shut;
    const a = Math.max(MIN_A, o.a === undefined ? 1.2 : o.a);
    lp.frequency.cancelScheduledValues(t);
    lp.frequency.setValueAtTime(shut, t);
    lp.frequency.linearRampToValueAtTime(open, t + a * 1.6);
    lp.frequency.setTargetAtTime(shut * 1.6, t + a * 1.6, 4);

    // a slow wobble on the cutoff so it never sits still
    const lfo = ctx.createOscillator();
    lfo.frequency.value = o.lfo === undefined ? 0.07 : o.lfo;
    const lg = ctx.createGain();
    lg.gain.value = o.lfoDepth === undefined ? 260 : o.lfoDepth;
    lfo.connect(lg); lg.connect(lp.frequency); lfo.start(t);
    nodes.push(lfo);

    const detunes = [-7, 0, 7];
    detunes.forEach(function (c, i) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = o.f;
      osc.detune.value = c + (o.detune || 0);
      const g = ctx.createGain();
      g.gain.value = i === 1 ? 0.34 : 0.24;
      osc.connect(g); g.connect(lp);
      osc.start(t);
      nodes.push(osc);
      if (o.wow) o.wow.connect(osc.detune);
    });

    /* Sub an octave down to anchor the chord. Kept deliberately quiet:
       a sine an octave below the root, times four notes in a voicing, is
       an enormous amount of energy under 200Hz and it will bury the mid
       of any track that also has a real bass part. */
    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.value = o.f / 2;
    const sg = ctx.createGain();
    sg.gain.value = o.subLevel === undefined ? 0.12 : o.subLevel;
    sub.connect(sg); sg.connect(lp);
    sub.start(t);
    nodes.push(sub);

    lp.connect(amp);
    const p = panner(ctx, o.pan);
    amp.connect(p);
    route(p, bus, o);

    const done = env(amp.gain, t, {
      a: a, d: o.d === undefined ? 0.8 : o.d, s: o.s === undefined ? 0.75 : o.s,
      hold: o.hold, r: o.r === undefined ? 2.2 : o.r,
      peak: o.gain === undefined ? 0.16 : o.gain
    });
    nodes.push(amp, lp, p);
    cleanup(ctx, nodes, done);
    return done;
  }

  /* ================================================================== *
   *  ORGAN -- PeriodicWave, no filter theatrics, just the harmonics.
   * ================================================================== */

  function organ(ctx, bus, o) {
    const t = o.t;
    const nodes = [];
    const amp = ctx.createGain();
    amp.gain.value = FLOOR;

    const osc = ctx.createOscillator();
    osc.setPeriodicWave(wave(ctx, o.table || "drawbar"));
    osc.frequency.value = o.f;
    osc.detune.value = o.detune || 0;
    if (o.wow) o.wow.connect(osc.detune);

    // a second, very slightly sharp, for the beating that makes it breathe
    const osc2 = ctx.createOscillator();
    osc2.setPeriodicWave(wave(ctx, o.table || "drawbar"));
    osc2.frequency.value = o.f;
    osc2.detune.value = (o.detune || 0) + 5;
    const g2 = ctx.createGain();
    g2.gain.value = 0.5;

    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = o.tone === undefined ? 2600 : o.tone;
    tone.Q.value = 0.6;

    osc.connect(tone);
    osc2.connect(g2); g2.connect(tone);
    tone.connect(amp);
    const p = panner(ctx, o.pan);
    amp.connect(p);
    route(p, bus, o);

    osc.start(t); osc2.start(t);
    nodes.push(osc, osc2, g2, tone, amp, p);

    const done = env(amp.gain, t, {
      a: o.a === undefined ? 0.35 : o.a, d: o.d === undefined ? 0.4 : o.d,
      s: o.s === undefined ? 0.8 : o.s, hold: o.hold,
      r: o.r === undefined ? 1.1 : o.r, peak: o.gain === undefined ? 0.14 : o.gain
    });
    cleanup(ctx, nodes, done);
    return done;
  }

  /* ================================================================== *
   *  PLUCK -- Karplus-Strong.
   *
   *  A noise burst into a delay line with a lowpass in the feedback path.
   *  The loop length sets the pitch; the filter is why the high partials
   *  die first, which is the whole character of a plucked string.
   *
   *  Web Audio adds one render quantum (128 samples) of latency to any
   *  feedback loop, so the delay is shortened to compensate. Above about
   *  sampleRate/128 (~344Hz) there is no room left to compensate with, so
   *  the voice is pitch-limited -- which is fine, because that is the
   *  register plucked strings live in anyway.
   * ================================================================== */

  function pluck(ctx, bus, o) {
    const t = o.t;
    const nodes = [];
    const sr = ctx.sampleRate;
    const block = 128 / sr;
    const period = 1 / o.f;
    const dt = Math.max(1 / sr, period - block);

    const delay = ctx.createDelay(0.2);
    delay.delayTime.value = dt;

    const fb = ctx.createGain();
    // longer decay for lower notes, so the bass does not die first
    fb.gain.value = Math.min(0.97, o.decay === undefined ? 0.94 : o.decay);

    const damp = ctx.createBiquadFilter();
    damp.type = "lowpass";
    damp.frequency.value = o.damp === undefined ? 2600 : o.damp;

    // the excitation: a very short burst of noise
    const burst = ctx.createBufferSource();
    const blen = Math.max(2, Math.floor(sr * (o.burst === undefined ? 0.006 : o.burst)));
    const bbuf = ctx.createBuffer(1, blen, sr);
    const bd = bbuf.getChannelData(0);
    for (let i = 0; i < blen; i++) {
      bd[i] = (Math.random() * 2 - 1) * (1 - i / blen);
    }
    burst.buffer = bbuf;

    const amp = ctx.createGain();
    amp.gain.value = FLOOR;

    burst.connect(delay);
    delay.connect(damp);
    damp.connect(fb);
    fb.connect(delay);
    delay.connect(amp);

    const p = panner(ctx, o.pan);
    amp.connect(p);
    route(p, bus, o);

    burst.start(t);
    nodes.push(burst, delay, damp, fb, amp, p);

    // the string is its own envelope; this just opens the gate and closes it
    const life = o.life === undefined ? 3.2 : o.life;
    const peak = o.gain === undefined ? 0.5 : o.gain;
    amp.gain.cancelScheduledValues(t);
    amp.gain.setValueAtTime(FLOOR, t);
    amp.gain.exponentialRampToValueAtTime(peak, t + MIN_A);
    amp.gain.exponentialRampToValueAtTime(FLOOR, t + life);
    amp.gain.linearRampToValueAtTime(0, t + life + 0.02);

    const done = t + life + 0.05;
    cleanup(ctx, nodes, done);
    return done;
  }

  /* ================================================================== *
   *  FM BELL -- one oscillator on another's frequency, index falling.
   *  Inharmonic ratios give the metallic tone; whole-number ratios would
   *  just sound like a brighter organ.
   * ================================================================== */

  function bell(ctx, bus, o) {
    const t = o.t;
    const nodes = [];
    const car = ctx.createOscillator();
    car.type = "sine";
    car.frequency.value = o.f;

    const mod = ctx.createOscillator();
    mod.type = "sine";
    mod.frequency.value = o.f * (o.ratio === undefined ? 1.414 : o.ratio);

    const idx = ctx.createGain();
    const depth = o.index === undefined ? 620 : o.index;
    idx.gain.cancelScheduledValues(t);
    idx.gain.setValueAtTime(depth, t);
    // the index falling is what makes it a bell rather than a drone
    idx.gain.exponentialRampToValueAtTime(
      Math.max(1, depth * 0.015), t + (o.bright === undefined ? 1.4 : o.bright));

    mod.connect(idx); idx.connect(car.frequency);

    const amp = ctx.createGain();
    amp.gain.value = FLOOR;
    car.connect(amp);
    const p = panner(ctx, o.pan);
    amp.connect(p);
    route(p, bus, o);

    car.start(t); mod.start(t);
    nodes.push(car, mod, idx, amp, p);

    const life = o.life === undefined ? 4.5 : o.life;
    const peak = o.gain === undefined ? 0.18 : o.gain;
    amp.gain.setValueAtTime(FLOOR, t);
    amp.gain.exponentialRampToValueAtTime(peak, t + Math.max(MIN_A, o.a || 0.004));
    amp.gain.exponentialRampToValueAtTime(FLOOR, t + life);
    amp.gain.linearRampToValueAtTime(0, t + life + 0.02);

    const done = t + life + 0.05;
    cleanup(ctx, nodes, done);
    return done;
  }

  /* ================================================================== *
   *  VOWEL PAD -- saw stack through three bandpass formants, drifting
   *  between vowel shapes. This is what gives a distant choir without a
   *  single sample.
   * ================================================================== */

  const VOWELS = {
    a: [730, 1090, 2440],
    e: [530, 1840, 2480],
    i: [270, 2290, 3010],
    o: [570, 840, 2410],
    u: [300, 870, 2240]
  };

  function vowel(ctx, bus, o) {
    const t = o.t;
    const nodes = [];
    const amp = ctx.createGain();
    amp.gain.value = FLOOR;

    const src = ctx.createGain();
    [-9, 0, 9].forEach(function (c) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = o.f;
      osc.detune.value = c;
      const g = ctx.createGain();
      g.gain.value = 0.2;
      osc.connect(g); g.connect(src);
      osc.start(t);
      nodes.push(osc, g);
      if (o.wow) o.wow.connect(osc.detune);
    });

    const from = VOWELS[o.from || "u"];
    const to = VOWELS[o.to || "o"];
    const glide = o.glide === undefined ? 6 : o.glide;

    for (let i = 0; i < 3; i++) {
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.Q.value = 7 - i * 1.6;
      bp.frequency.cancelScheduledValues(t);
      bp.frequency.setValueAtTime(from[i], t);
      // drifting between two vowels is the whole trick
      bp.frequency.linearRampToValueAtTime(to[i], t + glide);
      const g = ctx.createGain();
      g.gain.value = [0.5, 0.32, 0.18][i];
      src.connect(bp); bp.connect(g); g.connect(amp);
      nodes.push(bp, g);
    }

    const p = panner(ctx, o.pan);
    amp.connect(p);
    route(p, bus, o);
    nodes.push(src, amp, p);

    const done = env(amp.gain, t, {
      a: o.a === undefined ? 2.4 : o.a, d: o.d === undefined ? 1.5 : o.d,
      s: o.s === undefined ? 0.85 : o.s, hold: o.hold,
      r: o.r === undefined ? 3.4 : o.r, peak: o.gain === undefined ? 0.5 : o.gain
    });
    cleanup(ctx, nodes, done);
    return done;
  }

  /* ================================================================== *
   *  SUB -- sine, a little saturation, a short slide into pitch.
   *  Never sent to reverb: low end in a long tail is what turns a mix to
   *  mud faster than anything else.
   * ================================================================== */

  function sub(ctx, bus, o) {
    const t = o.t;
    const nodes = [];
    const osc = ctx.createOscillator();
    osc.type = "sine";
    const f = o.f;
    osc.frequency.cancelScheduledValues(t);
    // slide in from a little under, which reads as weight rather than a beep
    osc.frequency.setValueAtTime(f * (o.slide === undefined ? 0.78 : o.slide), t);
    osc.frequency.exponentialRampToValueAtTime(f, t + (o.glide === undefined ? 0.05 : o.glide));

    const shaper = DAA.fx.makeSaturator(ctx, o.drive === undefined ? 1.6 : o.drive);
    const amp = ctx.createGain();
    amp.gain.value = FLOOR;

    osc.connect(shaper); shaper.connect(amp);
    const p = panner(ctx, 0);           // sub stays centred, always
    amp.connect(p);
    route(p, bus, { dry: o.dry === undefined ? 1 : o.dry, rev: 0, dly: o.dly || 0 });

    osc.start(t);
    nodes.push(osc, shaper, amp, p);

    const done = env(amp.gain, t, {
      a: o.a === undefined ? 0.006 : o.a, d: o.d === undefined ? 0.12 : o.d,
      s: o.s === undefined ? 0.6 : o.s, hold: o.hold === undefined ? 0.1 : o.hold,
      r: o.r === undefined ? 0.35 : o.r, peak: o.gain === undefined ? 0.5 : o.gain
    });
    cleanup(ctx, nodes, done);
    return done;
  }

  /* ================================================================== *
   *  PERC -- filtered noise. The bandpass centre and the envelope length
   *  between them decide whether it reads as a hat, a rim or a soft kick.
   * ================================================================== */

  function noiseBuffer(ctx) {
    if (ctx.__noise) return ctx.__noise;
    const len = ctx.sampleRate * 2;
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    ctx.__noise = b;
    return b;
  }

  function perc(ctx, bus, o) {
    const t = o.t;
    const nodes = [];
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx);
    src.loop = true;

    const bp = ctx.createBiquadFilter();
    bp.type = o.type || "bandpass";
    bp.frequency.value = o.f === undefined ? 2400 : o.f;
    bp.Q.value = o.q === undefined ? 2.4 : o.q;
    if (o.sweep) {
      bp.frequency.cancelScheduledValues(t);
      bp.frequency.setValueAtTime(o.f, t);
      bp.frequency.exponentialRampToValueAtTime(
        Math.max(40, o.sweep), t + (o.life === undefined ? 0.12 : o.life));
    }

    const amp = ctx.createGain();
    amp.gain.value = FLOOR;
    src.connect(bp); bp.connect(amp);
    const p = panner(ctx, o.pan);
    amp.connect(p);
    route(p, bus, o);

    src.start(t);
    nodes.push(src, bp, amp, p);

    const life = o.life === undefined ? 0.12 : o.life;
    const peak = o.gain === undefined ? 0.25 : o.gain;
    amp.gain.setValueAtTime(FLOOR, t);
    amp.gain.exponentialRampToValueAtTime(peak, t + MIN_A);
    amp.gain.exponentialRampToValueAtTime(FLOOR, t + life);
    amp.gain.linearRampToValueAtTime(0, t + life + 0.01);

    const done = t + life + 0.04;
    cleanup(ctx, nodes, done);
    return done;
  }

  /** A soft kick: sine with a fast downward pitch sweep. */
  function kick(ctx, bus, o) {
    const t = o.t;
    const nodes = [];
    const osc = ctx.createOscillator();
    osc.type = "sine";
    const top = o.f === undefined ? 92 : o.f;
    osc.frequency.cancelScheduledValues(t);
    osc.frequency.setValueAtTime(top, t);
    osc.frequency.exponentialRampToValueAtTime(
      o.to === undefined ? 41 : o.to, t + (o.pitchFall === undefined ? 0.09 : o.pitchFall));

    const shaper = DAA.fx.makeSaturator(ctx, 1.8);
    const amp = ctx.createGain();
    amp.gain.value = FLOOR;
    osc.connect(shaper); shaper.connect(amp);
    const p = panner(ctx, 0);
    amp.connect(p);
    route(p, bus, { dry: o.dry === undefined ? 1 : o.dry, rev: o.rev || 0, dly: 0 });

    osc.start(t);
    nodes.push(osc, shaper, amp, p);

    const life = o.life === undefined ? 0.5 : o.life;
    const peak = o.gain === undefined ? 0.62 : o.gain;
    amp.gain.setValueAtTime(FLOOR, t);
    amp.gain.exponentialRampToValueAtTime(peak, t + 0.004);
    amp.gain.exponentialRampToValueAtTime(FLOOR, t + life);
    amp.gain.linearRampToValueAtTime(0, t + life + 0.01);

    const done = t + life + 0.04;
    cleanup(ctx, nodes, done);
    return done;
  }

  DAA.voices = {
    pad: pad, organ: organ, pluck: pluck, bell: bell,
    vowel: vowel, sub: sub, perc: perc, kick: kick,
    wave: wave, TABLES: TABLES, VOWELS: VOWELS,
    env: env, noiseBuffer: noiseBuffer
  };
})(window.DAA);
