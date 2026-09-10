/* ------------------------------------------------------------------ *
 *  sound.js -- the station's audio bus.
 *
 *  Everything is procedural: oscillators, filtered noise, slow LFOs and
 *  speechSynthesis. There is not a single audio file on this site.
 *
 *  Rules this file enforces:
 *    - nothing makes a sound until a human clicks something
 *    - exactly one source plays at a time, site-wide
 *    - the toggle is on every page, so mute is always one click away
 *    - the on/off setting persists in localStorage and nothing else does
 * ------------------------------------------------------------------ */

(function () {
  "use strict";

  var KEY = "da.sound";
  var NAME = "Dead Air for Night Listeners";

  var ctx = null;
  var master = null;
  var current = null; // { id: string, stop: function }
  var spoke = false;
  var buttons = [];

  /* ---- persistence ------------------------------------------------ */

  function stored() {
    try {
      return localStorage.getItem(KEY) === "on";
    } catch (e) {
      return false; // private mode, file://, whatever. quiet is the safe default.
    }
  }

  function store(on) {
    try {
      localStorage.setItem(KEY, on ? "on" : "off");
    } catch (e) {
      /* nothing to do about it */
    }
  }

  /* ---- context ---------------------------------------------------- */

  function audio() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.0;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended" && ctx.resume) ctx.resume();
    return ctx;
  }

  function ramp(target, seconds) {
    if (!master) return;
    var t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(target, t + (seconds || 1.2));
  }

  /* ---- noise ------------------------------------------------------ */

  var noiseBuf = null;

  function noise() {
    var c = audio();
    if (!noiseBuf) {
      var len = c.sampleRate * 2;
      noiseBuf = c.createBuffer(1, len, c.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    var src = c.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    return src;
  }

  /* ---- the one-source-at-a-time bus -------------------------------- */

  function stop() {
    if (current) {
      try {
        current.stop();
      } catch (e) {
        /* already gone */
      }
      current = null;
    }
    document.dispatchEvent(new CustomEvent("da:source", { detail: { id: null } }));
  }

  /**
   * Claim the bus. `build(ctx, out)` wires up whatever it likes and returns a
   * function that tears it down. Anything already playing is stopped first.
   */
  function play(id, build) {
    var c = audio();
    if (!c) return false;
    stop();
    if (!DA.on) set(true, true); // clicking play is consent
    var stopper = build(c, master);
    current = { id: id, stop: stopper };
    document.dispatchEvent(new CustomEvent("da:source", { detail: { id: id } }));
    return true;
  }

  function playing(id) {
    return !!current && (id === undefined || current.id === id);
  }

  /* ---- the station drone ------------------------------------------ */

  function drone(c, out) {
    var bus = c.createGain();
    bus.gain.value = 0.5;
    bus.connect(out);

    // two detuned low tones: the carrier, and its own reflection
    var oscs = [];
    [55, 55.35, 82.5].forEach(function (f, i) {
      var o = c.createOscillator();
      o.type = i === 2 ? "sine" : "triangle";
      o.frequency.value = f;
      var g = c.createGain();
      g.gain.value = i === 2 ? 0.07 : 0.16;
      o.connect(g);
      g.connect(bus);
      o.start();
      oscs.push(o);
    });

    // band-limited hiss, slowly swept -- the sound of an empty channel
    var n = noise();
    var bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 620;
    bp.Q.value = 0.7;
    var ng = c.createGain();
    ng.gain.value = 0.055;
    n.connect(bp);
    bp.connect(ng);
    ng.connect(bus);
    n.start();

    // a very slow sweep on the hiss, and a slower breath on the whole bus
    var lfo = c.createOscillator();
    lfo.frequency.value = 0.031;
    var lg = c.createGain();
    lg.gain.value = 380;
    lfo.connect(lg);
    lg.connect(bp.frequency);
    lfo.start();

    var breath = c.createOscillator();
    breath.frequency.value = 0.0125;
    var bg = c.createGain();
    bg.gain.value = 0.22;
    breath.connect(bg);
    bg.connect(bus.gain);
    breath.start();

    return function () {
      oscs.concat([lfo, breath]).forEach(function (o) {
        try { o.stop(); } catch (e) {}
      });
      try { n.stop(); } catch (e) {}
      bus.disconnect();
    };
  }

  /* ---- speech ----------------------------------------------------- */

  function voice() {
    if (!window.speechSynthesis) return null;
    var vs = window.speechSynthesis.getVoices() || [];
    // a whisper voice if the OS has one; otherwise the quietest thing going
    var pick =
      vs.filter(function (v) { return /whisper/i.test(v.name); })[0] ||
      vs.filter(function (v) { return /^en/i.test(v.lang) && /murmur|breath|soft/i.test(v.name); })[0] ||
      vs.filter(function (v) { return /^en/i.test(v.lang); })[0] ||
      vs[0];
    return pick || null;
  }

  function speak(text, opts) {
    if (!window.speechSynthesis || !DA.on) return;
    opts = opts || {};
    var u = new SpeechSynthesisUtterance(text);
    var v = voice();
    if (v) u.voice = v;
    u.rate = opts.rate !== undefined ? opts.rate : 0.62;
    u.pitch = opts.pitch !== undefined ? opts.pitch : 0.35;
    u.volume = opts.volume !== undefined ? opts.volume : 0.55;
    try {
      window.speechSynthesis.speak(u);
    } catch (e) {
      /* some browsers refuse without a gesture; that is fine */
    }
    return u;
  }

  /* ---- on / off --------------------------------------------------- */

  function set(on, quiet) {
    DA.on = !!on;
    store(DA.on);
    paint();

    if (DA.on) {
      audio();
      ramp(0.32, 1.6);
      if (!spoke) {
        spoke = true;
        // the station says its own name, once, slowly, the first time you ask
        if (window.speechSynthesis && !window.speechSynthesis.getVoices().length) {
          window.speechSynthesis.addEventListener(
            "voiceschanged",
            function () { speak(NAME); },
            { once: true }
          );
        } else {
          speak(NAME);
        }
      }
      if (!current && !quiet) play("drone", drone);
    } else {
      ramp(0.0, 0.7);
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      setTimeout(stop, 750);
    }
  }

  function toggle() {
    set(!DA.on);
  }

  /* ---- the control ------------------------------------------------ */

  function paint() {
    buttons.forEach(function (b) {
      b.setAttribute("aria-pressed", DA.on ? "true" : "false");
      b.title = DA.on ? "sound on — click to mute" : "sound off — click to listen";
      b.setAttribute("aria-label", DA.on ? "Mute the station" : "Turn on the station");
    });
  }

  function wire() {
    var b = document.getElementById("snd");
    if (!b) {
      // Every page needs a mute, including the ones that break the template.
      b = document.createElement("button");
      b.id = "snd";
      b.type = "button";
      b.textContent = "♫";
      b.style.cssText =
        "position:fixed;top:8px;right:10px;z-index:9500;background:none;border:0;" +
        'font:14px "MS Gothic","Courier New",monospace;color:#6b675e;cursor:pointer;' +
        "padding:4px 6px;letter-spacing:0;line-height:1";
      b.addEventListener("mouseenter", function () {
        if (!DA.on) b.style.color = "#c8c3b4";
      });
      b.addEventListener("mouseleave", function () {
        b.style.color = DA.on ? "#b4503c" : "#6b675e";
      });
      document.body.appendChild(b);
      var restyle = function () {
        b.style.color = DA.on ? "#b4503c" : "#6b675e";
      };
      document.addEventListener("da:sound", restyle);
      restyle();
    }
    buttons.push(b);
    b.addEventListener("click", function () {
      toggle();
      document.dispatchEvent(new CustomEvent("da:sound", { detail: { on: DA.on } }));
    });
    paint();

    // If sound was left on, resume on the next gesture -- browsers will not
    // let us start without one, and we would not want to anyway.
    if (stored()) {
      DA.on = true;
      paint();
      var resume = function () {
        document.removeEventListener("pointerdown", resume);
        document.removeEventListener("keydown", resume);
        if (DA.on && !current) {
          audio();
          ramp(0.32, 1.6);
          play("drone", drone);
        }
      };
      document.addEventListener("pointerdown", resume);
      document.addEventListener("keydown", resume);
    }
  }

  /* ---- public ----------------------------------------------------- */

  var DA = {
    on: false,
    play: play,
    stop: stop,
    playing: playing,
    speak: speak,
    noise: noise,
    drone: drone,
    set: set,
    toggle: toggle,
    context: audio,
    NAME: NAME
  };
  window.DA = DA;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wire);
  } else {
    wire();
  }
})();
