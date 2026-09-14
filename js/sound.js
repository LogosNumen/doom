/* ------------------------------------------------------------------ *
 *  sound.js -- the ♫, and the door into the audio engine.
 *
 *  This file is the controller: the toggle, the persistence, speech, and
 *  the small bespoke instruments the experiment pages use. The music
 *  itself lives in js/audio/ and is not loaded at all until somebody
 *  actually asks for sound -- so a reader who never touches the ♫ never
 *  downloads or parses a line of it.
 *
 *  Rules, unchanged:
 *    - nothing makes a sound until a human clicks something
 *    - one source at a time, site-wide
 *    - the toggle is on every page, so mute is always one click away
 * ------------------------------------------------------------------ */

(function () {
  "use strict";

  var KEY = "da.sound";
  var NAME = "Dead Air for Night Listeners";

  var ctx = null;          // the small context, for the experiment toys
  var master = null;
  var current = null;      // { id, stop } -- a bespoke toy, not a track
  var ambientName = null;
  var spoke = false;
  var buttons = [];
  var engineReady = false;
  var engineLoading = null;

  /* ---- persistence ------------------------------------------------ */

  function stored() {
    try { return localStorage.getItem(KEY) === "on"; } catch (e) { return false; }
  }
  function store(on) {
    try { localStorage.setItem(KEY, on ? "on" : "off"); } catch (e) {}
  }

  /* ---- loading the engine ----------------------------------------- *
   * Order matters and these are plain scripts, not modules -- the site
   * has to keep working when opened off a disk, and module imports do
   * not. `async = false` on an injected script preserves execution order.
   */

  /* Stamped by tools/stamp_versions.py from the contents of js/audio/.
     Do not edit by hand -- run the tool. */
  var AUDIO_VER = "c19ae57e";

  var FILES = [
    "theory.js", "fx.js", "voices.js", "engine.js",
    "tracks/common.js",
    "tracks/drone.js", "tracks/carrier.js", "tracks/nocturne.js",
    "tracks/testcard.js", "tracks/hymn.js", "tracks/decay.js",
    "tracks/forecast.js", "tracks/relay.js"
  ];

  function base() {
    // find our own <script> so the path works from etc/ and hidden/ too
    var s = document.querySelector('script[src*="js/sound.js"]');
    var src = s ? s.getAttribute("src") : "js/sound.js";
    return src.replace(/js\/sound\.js.*$/, "js/audio/");
  }

  function loadEngine() {
    if (engineReady) return Promise.resolve(true);
    if (engineLoading) return engineLoading;

    var root = base();
    engineLoading = FILES.reduce(function (chain, f) {
      return chain.then(function () {
        return new Promise(function (res, rej) {
          var el = document.createElement("script");
          el.src = root + f + (AUDIO_VER ? "?v=" + AUDIO_VER : "");
          el.async = false;
          el.onload = res;
          el.onerror = function () { rej(new Error("could not load " + f)); };
          document.head.appendChild(el);
        });
      });
    }, Promise.resolve()).then(function () {
      engineReady = !!(window.DAA && window.DAA.engine);
      return engineReady;
    }).catch(function (e) {
      if (window.console) console.warn("audio engine did not load:", e.message);
      return false;
    });

    return engineLoading;
  }

  /* ---- the small context, for the experiment toys ------------------ */

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

  /* ---- the bus ----------------------------------------------------- */

  function announce(id) {
    document.dispatchEvent(new CustomEvent("da:source", { detail: { id: id } }));
  }

  function teardown() {
    if (current) {
      try { current.stop(); } catch (e) {}
      current = null;
    }
  }

  /** The page's bed. Starts the drone in this page's room. */
  function idle() {
    if (!DA.on || !ambientName) return;
    loadEngine().then(function (ok) {
      if (!ok || !DA.on) return;
      if (window.DAA.engine.playing()) return;
      var drone = window.DAA.tracks.drone;
      drone.__room = ambientName;
      window.DAA.engine.play("drone", { crossfade: 2 });
      announce("ambience");
    });
  }

  /**
   * Stop the toy that is playing. The room comes back by default --
   * silence is the mute button's job.
   */
  function stop(resume) {
    teardown();
    announce(null);
    if (resume !== false) idle();
  }

  /** A bespoke toy (the hum, the scope tones, the marker). */
  function play(id, build) {
    var c = audio();
    if (!c) return false;
    teardown();
    if (window.DAA && window.DAA.engine && window.DAA.engine.playing()) {
      window.DAA.engine.stop(0.4);
    }
    if (!DA.on) set(true, true);
    current = { id: id, stop: build(c, master) };
    announce(id);
    return true;
  }

  function playing(id) {
    if (!current) return false;
    if (id === undefined) return true;
    return current.id === id;
  }

  function ambience(name) {
    ambientName = name;
    if (DA.on) idle();
  }

  /* ---- speech ------------------------------------------------------ *
   * speechSynthesis cannot be routed through Web Audio, so the music has
   * to get out of its way on its own.                                   */

  function pickVoice() {
    if (!window.speechSynthesis) return null;
    var vs = window.speechSynthesis.getVoices() || [];
    return (
      vs.filter(function (v) { return /whisper/i.test(v.name); })[0] ||
      vs.filter(function (v) { return /^en/i.test(v.lang) && /murmur|breath|soft/i.test(v.name); })[0] ||
      vs.filter(function (v) { return /^en/i.test(v.lang); })[0] ||
      vs[0] || null
    );
  }

  function speak(text, opts) {
    if (!window.speechSynthesis || !DA.on) return;
    opts = opts || {};
    var u = new SpeechSynthesisUtterance(text);
    var v = pickVoice();
    if (v) u.voice = v;
    u.rate = opts.rate !== undefined ? opts.rate : 0.62;
    u.pitch = opts.pitch !== undefined ? opts.pitch : 0.35;
    u.volume = opts.volume !== undefined ? opts.volume : 0.55;

    u.onstart = function () {
      if (window.DAA && window.DAA.engine) window.DAA.engine.speechDuck(true);
      ramp(0.12, 0.25);
    };
    var back = function () {
      if (window.DAA && window.DAA.engine) window.DAA.engine.speechDuck(false);
      if (DA.on) ramp(0.32, 0.4);
    };
    u.onend = back;
    u.onerror = back;

    try { window.speechSynthesis.speak(u); } catch (e) {}
    return u;
  }

  /* ---- on / off ---------------------------------------------------- */

  function set(on, quiet) {
    DA.on = !!on;
    store(DA.on);
    paint();

    if (DA.on) {
      audio();
      ramp(0.32, 1.6);
      if (!spoke) {
        spoke = true;
        if (window.speechSynthesis && !window.speechSynthesis.getVoices().length) {
          window.speechSynthesis.addEventListener(
            "voiceschanged", function () { speak(NAME); }, { once: true });
        } else {
          speak(NAME);
        }
      }
      if (!quiet) idle();
    } else {
      ramp(0.0, 0.7);
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      if (window.DAA && window.DAA.engine) window.DAA.engine.stop(0.8);
      setTimeout(function () { stop(false); }, 750);
    }
  }

  function toggle() { set(!DA.on); }

  /* ---- the control -------------------------------------------------- */

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
      var restyle = function () { b.style.color = DA.on ? "#b4503c" : "#6b675e"; };
      document.addEventListener("da:sound", restyle);
      restyle();
    }

    if (document.body && document.body.getAttribute("data-amb")) {
      ambientName = document.body.getAttribute("data-amb");
    } else if (!ambientName) {
      ambientName = "station";
    }

    buttons.push(b);
    b.addEventListener("click", function () {
      toggle();
      document.dispatchEvent(new CustomEvent("da:sound", { detail: { on: DA.on } }));
    });
    paint();

    /* If sound was left on, resume on the next gesture. Browsers will not
       let us start without one, and a track carried over from the last
       page is picked up roughly where it was. */
    if (stored()) {
      DA.on = true;
      paint();
      var resume = function () {
        document.removeEventListener("pointerdown", resume);
        document.removeEventListener("keydown", resume);
        if (!DA.on) return;
        audio();
        ramp(0.32, 1.6);
        loadEngine().then(function (ok) {
          if (!ok || !DA.on) return;
          var prev = window.DAA.engine.saved();
          if (prev && prev.id && prev.id !== "drone" && window.DAA.tracks[prev.id]) {
            window.DAA.engine.play(prev.id, {
              crossfade: 2, fromStep: prev.resumeStep, seed: prev.seed
            });
          } else {
            idle();
          }
        });
      };
      document.addEventListener("pointerdown", resume);
      document.addEventListener("keydown", resume);
    }
  }

  /* ---- public -------------------------------------------------------- */

  var DA = {
    on: false,
    play: play,
    stop: stop,
    playing: playing,
    ambience: ambience,
    speak: speak,
    noise: noise,
    set: set,
    toggle: toggle,
    context: audio,
    loadEngine: loadEngine,
    engine: function () { return window.DAA && window.DAA.engine; },
    NAME: NAME
  };
  window.DA = DA;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wire);
  } else {
    wire();
  }
})();
