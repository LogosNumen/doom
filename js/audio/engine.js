/* ------------------------------------------------------------------ *
 *  engine.js -- context, buses, transport, voice allocation.
 *
 *  Scheduling is the standard lookahead pattern: a 25ms setInterval that
 *  schedules every event falling inside the next 100ms against
 *  audioContext.currentTime. Notes are never triggered directly from a
 *  timer -- setTimeout and rAF are both subject to whatever else the page
 *  is doing, and the drift is audible within a few bars.
 *
 *  One reverb, one delay, one chorus for the entire mix. Sends, not
 *  per-note effects.
 * ------------------------------------------------------------------ */

window.DAA = window.DAA || {};

(function (DAA) {
  "use strict";

  const LOOKAHEAD_MS = 25;      // how often the scheduler wakes
  const HORIZON = 0.1;          // how far ahead it schedules
  const MAX_VOICES = 24;

  let ctx = null;
  let master = null;            // the master chain
  let out = null;               // where tracks send dry signal
  let halls = {};               // the three reverbs
  let delay = null;
  let chorus = null;
  let hiss = null;
  let analyser = null;
  let meterData = null;
  let specData = null;

  let bus = null;               // { dry, reverb, delay } handed to voices
  let duck = null;              // pad/reverb ducking gain

  let timer = null;
  let track = null;             // the running track
  let state = null;
  let step = 0;
  let nextStepTime = 0;
  let startedAt = 0;
  let voices = [];              // active voice end-times, for the cap

  const SESSION = "da.audio";

  /* ---- setup ------------------------------------------------------- */

  function context() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    build(ctx);
    return ctx;
  }

  /**
   * Build the whole mix once. Impulse responses in particular are
   * expensive and must never be made per note.
   */
  function build(c) {
    master = DAA.fx.makeMaster(c, c.destination);

    analyser = c.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.75;
    meterData = new Uint8Array(analyser.fftSize);
    specData = new Uint8Array(analyser.frequencyBinCount);
    master.output.connect(analyser);

    // the dry path, with a ducking stage the kick can dip
    duck = c.createGain();
    duck.gain.value = 1;
    duck.connect(master.input);

    out = c.createGain();
    out.gain.value = 1;
    out.connect(duck);

    halls.room  = DAA.fx.makeReverb(c, master.input,
      DAA.fx.makeIR(c, { seconds: 1.4, decay: 2.6, damp: 0.5, preDelay: 0.02 }), 1);
    halls.hall  = DAA.fx.makeReverb(c, master.input,
      DAA.fx.makeIR(c, { seconds: 4.5, decay: 3.0, damp: 0.34, preDelay: 0.03 }), 1);
    halls.vast  = DAA.fx.makeReverb(c, master.input,
      DAA.fx.makeIR(c, { seconds: 9.0, decay: 2.4, damp: 0.22, preDelay: 0.04 }), 1);

    // the reverb returns duck too, or the tail smears over every kick
    halls.hall.output.disconnect();
    halls.vast.output.disconnect();
    halls.hall.output.connect(duck);
    halls.vast.output.connect(duck);

    delay = DAA.fx.makePingPong(c, master.input, 0.45, 0.45);
    chorus = DAA.fx.makeChorus(c, master.input, 0.0045, 0.19);
    hiss = DAA.fx.makeHiss(c, master.input, 0.0);   // raised when a track runs

    bus = { dry: out, reverb: halls.hall.input, delay: delay.input,
            room: halls.room.input, vast: halls.vast.input, chorus: chorus.input };
  }

  /* ---- voice allocation -------------------------------------------- */

  function prune(now) {
    let i = 0;
    while (i < voices.length) {
      if (voices[i].until <= now) voices.splice(i, 1);
      else i++;
    }
  }

  /**
   * Play one note. Enforces the cap by stealing the oldest voice rather
   * than refusing the new one -- a dropped new note is far more audible
   * than an early release on something already decaying.
   */
  function note(name, opts) {
    const fn = DAA.voices[name];
    if (!fn || !ctx) return 0;

    /* Humanisation jitters note times by a few milliseconds either way,
       which at step 0 can land before the start of the context. Web Audio
       throws on a negative start time rather than clamping, so this is the
       one place to catch it -- every track gets it for free. */
    if (!(opts.t >= 0)) opts.t = 0;

    /* Prune against the time this note is scheduled for, not currentTime.
       The scheduler always runs ahead of the clock, and offline there is no
       clock at all -- currentTime sits at 0 for the whole render, so pruning
       against it would never retire anything and the graph would grow to
       hold every voice in the piece at once. */
    const now = Math.max(ctx.currentTime, opts.t || 0);
    prune(now);

    if (voices.length >= MAX_VOICES) {
      voices.sort(function (a, b) { return a.until - b.until; });
      voices.shift();
    }

    const until = fn(ctx, opts.bus || bus, opts);
    voices.push({ until: until });
    return until;
  }

  /** Dip the pad and reverb returns under a hit. Fake sidechain. */
  function dip(t, amount, hold, back) {
    if (!duck) return;
    const a = amount === undefined ? 0.62 : amount;
    duck.gain.cancelScheduledValues(t);
    duck.gain.setValueAtTime(duck.gain.value, t);
    duck.gain.linearRampToValueAtTime(a, t + 0.012);
    duck.gain.linearRampToValueAtTime(1, t + (hold || 0.02) + (back || 0.26));
  }

  /* ---- transport --------------------------------------------------- */

  function stepSeconds() {
    const bpm = (track && track.bpm) || 70;
    return 60 / bpm / 4;              // sixteenths
  }

  function tick() {
    if (!ctx || !track) return;
    const ahead = ctx.currentTime + HORIZON;
    let guard = 0;
    while (nextStepTime < ahead && guard++ < 128) {
      try {
        track.onStep(ctx, bus, state, step, nextStepTime, DAA.engine);
      } catch (e) {
        // one bad step must not take the transport down with it
        if (window.console) console.error("track step failed", e);
      }
      step++;
      nextStepTime += stepSeconds();
    }
  }

  function startTransport(fromStep) {
    step = fromStep || 0;
    nextStepTime = ctx.currentTime + 0.08;
    startedAt = ctx.currentTime - (step * stepSeconds());
    clearInterval(timer);
    timer = setInterval(tick, LOOKAHEAD_MS);
    tick();
  }

  function stopTransport() {
    clearInterval(timer);
    timer = null;
  }

  /* ---- playback ---------------------------------------------------- */

  function fade(param, to, seconds, at) {
    const t = at === undefined ? ctx.currentTime : at;
    param.cancelScheduledValues(t);
    param.setValueAtTime(Math.max(0.0001, param.value), t);
    param.linearRampToValueAtTime(to, t + seconds);
  }

  /**
   * Start a track. If one is already running, cross-fade over two
   * seconds rather than cutting, which is the difference between a
   * station and a playlist.
   */
  function play(id, opts) {
    const c = context();
    if (!c) return false;
    if (c.state === "suspended" && c.resume) c.resume();

    const def = DAA.tracks && DAA.tracks[id];
    if (!def) return false;
    opts = opts || {};

    const cross = opts.crossfade === undefined ? 2 : opts.crossfade;

    function begin() {
      track = def;
      const seed = (opts.seed === undefined)
        ? (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0
        : opts.seed;
      state = def.init(c, bus, DAA.theory.Rng(seed >>> 0), DAA.engine);
      state.__seed = seed;
      if (hiss) fade(hiss.gain.gain, def.hiss === undefined ? 0.005 : def.hiss, 1.5);
      if (def.delayTime) delay.setTime(def.delayTime);
      if (def.feedback !== undefined) delay.setFeedback(def.feedback);
      out.gain.cancelScheduledValues(c.currentTime);
      out.gain.setValueAtTime(0.0001, c.currentTime);
      fade(out.gain, 1, cross ? cross : 0.05);
      startTransport(opts.fromStep || 0);
      save();
      emit();
    }

    if (track && cross) {
      fade(out.gain, 0.0001, cross * 0.5);
      setTimeout(function () { stopTransport(); begin(); }, cross * 500);
    } else {
      stopTransport();
      begin();
    }
    return true;
  }

  function stop(seconds) {
    if (!ctx) return;
    const s = seconds === undefined ? 1.2 : seconds;
    if (out) fade(out.gain, 0.0001, s);
    if (hiss) fade(hiss.gain.gain, 0.0001, s);
    setTimeout(function () {
      stopTransport();
      track = null;
      state = null;
      voices = [];
      emit();
    }, s * 1000 + 60);
    try { sessionStorage.removeItem(SESSION); } catch (e) {}
  }

  function playing() { return track ? track.id : null; }
  function elapsed() { return ctx && track ? ctx.currentTime - startedAt : 0; }

  function volume(v) {
    if (!master) return 1;
    if (v === undefined) return master.trim.gain.value;
    master.trim.gain.setTargetAtTime(Math.max(0, Math.min(1.2, v)), ctx.currentTime, 0.05);
    return v;
  }

  /* ---- carrying the track between pages ----------------------------- *
   * sessionStorage, so the station keeps going as you move around and is
   * forgotten when the tab closes.                                       */

  function save() {
    if (!track) return;
    try {
      sessionStorage.setItem(SESSION, JSON.stringify({
        id: track.id, at: Date.now(), step: step, seed: state && state.__seed
      }));
    } catch (e) {}
  }

  function saved() {
    try {
      const raw = sessionStorage.getItem(SESSION);
      if (!raw) return null;
      const d = JSON.parse(raw);
      // roughly where it was: carry the position forward by the time away
      const away = (Date.now() - d.at) / 1000;
      const bpm = (DAA.tracks[d.id] && DAA.tracks[d.id].bpm) || 70;
      d.resumeStep = Math.max(0, Math.round(d.step + away / (60 / bpm / 4)));
      return d;
    } catch (e) { return null; }
  }

  /* ---- metering ----------------------------------------------------- */

  function level() {
    if (!analyser) return 0;
    analyser.getByteTimeDomainData(meterData);
    let sum = 0;
    for (let i = 0; i < meterData.length; i++) {
      const v = (meterData[i] - 128) / 128;
      sum += v * v;
    }
    return Math.sqrt(sum / meterData.length);
  }

  function spectrum() {
    if (!analyser) return null;
    analyser.getByteFrequencyData(specData);
    return specData;
  }

  /* ---- speech ducking ----------------------------------------------- *
   * speechSynthesis output cannot be routed through Web Audio, so it will
   * sit on top of the music unless the music gets out of the way.        */

  function speechDuck(on) {
    if (!master) return;
    const t = ctx.currentTime;
    const to = on ? 0.25 : 1;            // about -12dB
    out.gain.cancelScheduledValues(t);
    out.gain.setValueAtTime(Math.max(0.0001, out.gain.value), t);
    out.gain.linearRampToValueAtTime(to, t + 0.25);
  }

  /* ---- events ------------------------------------------------------- */

  function emit() {
    document.dispatchEvent(new CustomEvent("daa:track", {
      detail: { id: playing() }
    }));
  }

  /* ---- tab visibility ------------------------------------------------ */

  document.addEventListener("visibilitychange", function () {
    if (!ctx) return;
    if (document.hidden) {
      save();
      if (ctx.suspend && track) ctx.suspend();
    } else if (ctx.resume) {
      ctx.resume();
    }
  });

  window.addEventListener("pagehide", save);

  DAA.engine = {
    context: context,
    play: play,
    stop: stop,
    playing: playing,
    elapsed: elapsed,
    volume: volume,
    note: note,
    dip: dip,
    level: level,
    spectrum: spectrum,
    speechDuck: speechDuck,
    saved: saved,
    save: save,
    bus: function () { return bus; },
    /** The tape hiss under everything. play() sets it; offline renders
        have to set it themselves, since nothing calls play() there. */
    hiss: function (level) {
      if (!hiss) return 0;
      if (level === undefined) return hiss.gain.gain.value;
      hiss.gain.gain.value = level;
      return level;
    },
    halls: function () { return halls; },
    delay: function () { return delay; },
    chorus: function () { return chorus; },
    master: function () { return master; },
    analyser: function () { return analyser; },
    voiceCount: function () { prune(ctx ? ctx.currentTime : 0); return voices.length; },
    MAX_VOICES: MAX_VOICES,
    /** Rebuild the mix inside a different context (offline rendering). */
    attach: function (c) { ctx = c; build(c); return { bus: bus, master: master }; },
    _internals: function () {
      return { get track() { return track; }, get step() { return step; } };
    }
  };
})(window.DAA);
