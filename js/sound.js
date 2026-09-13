/* ------------------------------------------------------------------ *
 *  sound.js -- the station's audio.
 *
 *  Everything is procedural: oscillators, filtered noise, slow LFOs and
 *  speechSynthesis. There is not a single audio file on this site.
 *
 *  Rules this file enforces:
 *    - nothing makes a sound until a human clicks something
 *    - exactly one source plays at a time, site-wide
 *    - the toggle is on every page, so mute is always one click away
 *    - the on/off setting persists in localStorage and nothing else does
 *
 *  Each page declares its own ambience with DA.ambience("name"). That bed
 *  is the idle source: it starts when sound comes on, it is displaced when
 *  something explicit is played (a track, a tone toy), and it comes back
 *  when that thing stops. Rooms sound different from each other, which is
 *  most of what makes a place feel like a place.
 * ------------------------------------------------------------------ */

(function () {
  "use strict";

  var KEY = "da.sound";
  var NAME = "Dead Air for Night Listeners";

  var ctx = null;
  var master = null;
  var current = null;      // { id, stop }
  var ambientName = null;  // what this page wants when nothing else is on
  var spoke = false;
  var buttons = [];

  /* ---- persistence ------------------------------------------------ */

  function stored() {
    try { return localStorage.getItem(KEY) === "on"; }
    catch (e) { return false; }   // private mode. quiet is the safe default.
  }
  function store(on) {
    try { localStorage.setItem(KEY, on ? "on" : "off"); } catch (e) {}
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

  /* ---- building blocks -------------------------------------------- *
   * The difference between a drone and a room is that a room is never
   * quite steady. Everything below drifts, at its own rate, and no two
   * rates are in step -- so the texture never lands on a loop point you
   * can hear.                                                          */

  var noiseBuf = null;

  function noise() {
    var c = audio();
    if (!noiseBuf) {
      var len = c.sampleRate * 3;
      noiseBuf = c.createBuffer(1, len, c.sampleRate);
      var d = noiseBuf.getChannelData(0);
      // brownish rather than white: less hiss, more weather
      var last = 0;
      for (var i = 0; i < len; i++) {
        var w = Math.random() * 2 - 1;
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5 + w * 0.25;
      }
    }
    var src = c.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    return src;
  }

  function panner(c, out, rate, depth) {
    if (!c.createStereoPanner) return out;
    var p = c.createStereoPanner();
    p.connect(out);
    if (rate) {
      var l = c.createOscillator(); l.frequency.value = rate;
      var g = c.createGain(); g.gain.value = depth === undefined ? 0.6 : depth;
      l.connect(g); g.connect(p.pan); l.start();
      p.__lfo = l;
    }
    return p;
  }

  /* one voice: a tone that will not hold still */
  function voice(c, out, o) {
    var dest = panner(c, out, o.panRate || 0, o.panDepth);
    var osc = c.createOscillator();
    osc.type = o.type || "sine";
    osc.frequency.value = o.freq;
    var g = c.createGain();
    g.gain.value = o.gain === undefined ? 0.1 : o.gain;
    osc.connect(g);
    g.connect(dest);
    osc.start();

    var kids = [osc];
    if (dest.__lfo) kids.push(dest.__lfo);

    // pitch drift -- a few cents, slowly, so it beats against its neighbours
    if (o.driftRate) {
      var d = c.createOscillator(); d.frequency.value = o.driftRate;
      var dg = c.createGain(); dg.gain.value = o.driftDepth || 3;
      d.connect(dg); dg.connect(osc.detune); d.start();
      kids.push(d);
    }
    // amplitude breathing
    if (o.breathRate) {
      var b = c.createOscillator(); b.frequency.value = o.breathRate;
      var bg = c.createGain(); bg.gain.value = o.breathDepth || 0.03;
      b.connect(bg); bg.connect(g.gain); b.start();
      kids.push(b);
    }
    return kids;
  }

  /* one band of weather */
  function bed(c, out, o) {
    var dest = panner(c, out, o.panRate || 0, o.panDepth);
    var n = noise();
    var f = c.createBiquadFilter();
    f.type = o.type || "bandpass";
    f.frequency.value = o.freq;
    f.Q.value = o.q === undefined ? 0.8 : o.q;
    var g = c.createGain();
    g.gain.value = o.gain === undefined ? 0.05 : o.gain;
    n.connect(f); f.connect(g); g.connect(dest);
    n.start();

    var kids = [n];
    if (dest.__lfo) kids.push(dest.__lfo);

    if (o.sweepRate) {
      var l = c.createOscillator(); l.frequency.value = o.sweepRate;
      var lg = c.createGain(); lg.gain.value = o.sweepDepth || 300;
      l.connect(lg); lg.connect(f.frequency); l.start();
      kids.push(l);
    }
    if (o.swellRate) {
      var s = c.createOscillator(); s.frequency.value = o.swellRate;
      var sg = c.createGain(); sg.gain.value = o.swellDepth || 0.03;
      s.connect(sg); sg.connect(g.gain); s.start();
      kids.push(s);
    }
    return kids;
  }

  /* a short event: click, thump, blip. the things that make a room
     sound occupied rather than recorded. */
  function hit(c, out, o) {
    var t = c.currentTime + (o.at || 0);
    var g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(o.gain || 0.2, t + (o.attack || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + (o.decay || 0.18));
    g.connect(out);

    if (o.noise) {
      var n = noise();
      var f = c.createBiquadFilter();
      f.type = "bandpass"; f.frequency.value = o.freq || 1800; f.Q.value = o.q || 2;
      n.connect(f); f.connect(g);
      n.start(t); n.stop(t + (o.decay || 0.18) + 0.05);
    } else {
      var osc = c.createOscillator();
      osc.type = o.type || "sine";
      osc.frequency.setValueAtTime(o.freq || 90, t);
      if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + (o.decay || 0.18));
      osc.connect(g);
      osc.start(t); osc.stop(t + (o.decay || 0.18) + 0.05);
    }
    setTimeout(function () { try { g.disconnect(); } catch (e) {} },
               ((o.at || 0) + (o.decay || 0.2) + 0.3) * 1000);
  }

  /* something happens every so often, never on the beat */
  function sparse(c, out, everyMs, jitterMs, make) {
    var timer = null;
    function go() {
      make(c, out);
      timer = setTimeout(go, everyMs + (Math.random() * 2 - 1) * jitterMs);
    }
    timer = setTimeout(go, Math.random() * everyMs);
    return { stop: function () { clearTimeout(timer); } };
  }

  function killer(nodes, bus, timers) {
    return function () {
      (nodes || []).forEach(function (n) { try { n.stop(); } catch (e) {} });
      (timers || []).forEach(function (t) { try { t.stop(); } catch (e) {} });
      try { bus.disconnect(); } catch (e) {}
    };
  }

  /* ---- the beds --------------------------------------------------- *
   * One per kind of room. Each returns its own teardown.               */

  var AMB = {

    /* the homepage and anywhere unlisted: the station itself */
    station: function (c, out) {
      var bus = c.createGain(); bus.gain.value = 0.5; bus.connect(out);
      var n = [], t = [];
      n = n.concat(voice(c, bus, { freq: 55,    type: "triangle", gain: 0.15, driftRate: 0.031, driftDepth: 4, panRate: 0.013, panDepth: 0.25, breathRate: 0.0125, breathDepth: 0.04 }));
      n = n.concat(voice(c, bus, { freq: 55.35, type: "triangle", gain: 0.13, driftRate: 0.019, driftDepth: 5, panRate: 0.009, panDepth: 0.3 }));
      n = n.concat(voice(c, bus, { freq: 82.5,  type: "sine",     gain: 0.06, driftRate: 0.023, driftDepth: 3 }));
      n = n.concat(bed(c, bus,   { freq: 620, q: 0.7, gain: 0.05, sweepRate: 0.031, sweepDepth: 380, panRate: 0.007, panDepth: 0.4 }));
      // the lamp relay: forty a minute, as the manual keeps complaining
      t.push(sparse(c, bus, 1500, 30, function (cc, oo) {
        hit(cc, oo, { noise: true, freq: 2600, q: 6, gain: 0.05, decay: 0.035 });
      }));
      // and, rarely, something settling somewhere in the building
      t.push(sparse(c, bus, 26000, 12000, function (cc, oo) {
        hit(cc, oo, { freq: 70, to: 38, gain: 0.10, decay: 1.1, type: "sine" });
      }));
      return killer(n, bus, t);
    },

    /* about / help / dir: a small dry room with paper in it */
    room: function (c, out) {
      var bus = c.createGain(); bus.gain.value = 0.42; bus.connect(out);
      var n = [], t = [];
      n = n.concat(voice(c, bus, { freq: 48, type: "sine", gain: 0.10, driftRate: 0.017, driftDepth: 3, breathRate: 0.009, breathDepth: 0.03 }));
      n = n.concat(bed(c, bus, { freq: 300, q: 0.5, gain: 0.035, sweepRate: 0.011, sweepDepth: 140, panRate: 0.006, panDepth: 0.35 }));
      t.push(sparse(c, bus, 9000, 5000, function (cc, oo) {
        hit(cc, oo, { noise: true, freq: 1200 + Math.random() * 1800, q: 4, gain: 0.03, decay: 0.05 });
      }));
      return killer(n, bus, t);
    },

    /* carrier.html: purer, wider, emptier */
    carrier: function (c, out) {
      var bus = c.createGain(); bus.gain.value = 0.46; bus.connect(out);
      var n = [];
      n = n.concat(voice(c, bus, { freq: 110, type: "sine", gain: 0.13, driftRate: 0.007, driftDepth: 2, panRate: 0.004, panDepth: 0.55, breathRate: 0.006, breathDepth: 0.03 }));
      n = n.concat(voice(c, bus, { freq: 110.4, type: "sine", gain: 0.11, driftRate: 0.005, driftDepth: 2, panRate: 0.0035, panDepth: -0.55 }));
      n = n.concat(bed(c, bus, { freq: 1400, q: 0.4, gain: 0.022, sweepRate: 0.004, sweepDepth: 500 }));
      return killer(n, bus);
    },

    /* coastline / forecast: weather off a sea nobody surveyed */
    sea: function (c, out) {
      var bus = c.createGain(); bus.gain.value = 0.5; bus.connect(out);
      var n = [], t = [];
      n = n.concat(bed(c, bus, { type: "lowpass", freq: 520, q: 0.6, gain: 0.10, sweepRate: 0.021, sweepDepth: 260, swellRate: 0.043, swellDepth: 0.055, panRate: 0.011, panDepth: 0.5 }));
      n = n.concat(bed(c, bus, { type: "lowpass", freq: 900, q: 0.4, gain: 0.05, sweepRate: 0.013, sweepDepth: 400, swellRate: 0.027, swellDepth: 0.04, panRate: 0.008, panDepth: -0.45 }));
      n = n.concat(voice(c, bus, { freq: 41, type: "sine", gain: 0.09, driftRate: 0.009, driftDepth: 2 }));
      // a bell on something, a long way out
      t.push(sparse(c, bus, 31000, 15000, function (cc, oo) {
        hit(cc, oo, { freq: 640, gain: 0.045, decay: 2.4, type: "sine" });
      }));
      return killer(n, bus, t);
    },

    /* dwell: something that measures */
    clock: function (c, out) {
      var bus = c.createGain(); bus.gain.value = 0.46; bus.connect(out);
      var n = [], t = [];
      n = n.concat(voice(c, bus, { freq: 44, type: "sine", gain: 0.11, driftRate: 0.006, driftDepth: 2, breathRate: 0.008, breathDepth: 0.04 }));
      n = n.concat(bed(c, bus, { freq: 240, q: 0.6, gain: 0.025, sweepRate: 0.009, sweepDepth: 90 }));
      t.push(sparse(c, bus, 1000, 6, function (cc, oo) {
        hit(cc, oo, { noise: true, freq: 3200, q: 9, gain: 0.035, decay: 0.022 });
      }));
      return killer(n, bus, t);
    },

    /* nobody / gone: almost nothing, and one thing */
    empty: function (c, out) {
      var bus = c.createGain(); bus.gain.value = 0.4; bus.connect(out);
      var n = [], t = [];
      n = n.concat(voice(c, bus, { freq: 38, type: "sine", gain: 0.09, driftRate: 0.004, driftDepth: 2 }));
      n = n.concat(bed(c, bus, { type: "lowpass", freq: 180, q: 0.4, gain: 0.03, sweepRate: 0.005, sweepDepth: 60 }));
      t.push(sparse(c, bus, 17000, 9000, function (cc, oo) {
        hit(cc, oo, { freq: 1500, gain: 0.03, decay: 0.09, type: "sine" });
      }));
      return killer(n, bus, t);
    },

    /* shutdown: a tone that keeps starting to fall and never lands */
    descend: function (c, out) {
      var bus = c.createGain(); bus.gain.value = 0.44; bus.connect(out);
      var n = [], t = [];
      n = n.concat(voice(c, bus, { freq: 60, type: "sine", gain: 0.11, driftRate: 0.011, driftDepth: 4 }));
      n = n.concat(bed(c, bus, { freq: 420, q: 0.7, gain: 0.035, sweepRate: 0.017, sweepDepth: 200 }));
      t.push(sparse(c, bus, 11000, 3000, function (cc, oo) {
        hit(cc, oo, { freq: 420, to: 120, gain: 0.05, decay: 2.2, type: "sine" });
      }));
      return killer(n, bus, t);
    },

    /* sequence: walking through the building */
    walk: function (c, out) {
      var bus = c.createGain(); bus.gain.value = 0.46; bus.connect(out);
      var n = [], t = [];
      n = n.concat(voice(c, bus, { freq: 52, type: "sine", gain: 0.10, driftRate: 0.013, driftDepth: 3 }));
      n = n.concat(bed(c, bus, { type: "lowpass", freq: 400, q: 0.5, gain: 0.045, sweepRate: 0.015, sweepDepth: 180, panRate: 0.01, panDepth: 0.4 }));
      t.push(sparse(c, bus, 5200, 2600, function (cc, oo) {
        hit(cc, oo, { freq: 88, to: 44, gain: 0.07, decay: 0.32, type: "sine" });
      }));
      return killer(n, bus, t);
    },

    /* node 9: all of it, including the thing on the fourth rack */
    deep: function (c, out) {
      var bus = c.createGain(); bus.gain.value = 0.5; bus.connect(out);
      var n = [], t = [];
      n = n.concat(voice(c, bus, { freq: 50, type: "sine", gain: 0.14, driftRate: 0.005, driftDepth: 2, breathRate: 0.007, breathDepth: 0.04 }));
      n = n.concat(voice(c, bus, { freq: 100, type: "sine", gain: 0.06, driftRate: 0.009, driftDepth: 2 }));
      n = n.concat(voice(c, bus, { freq: 150, type: "sine", gain: 0.035, driftRate: 0.013, driftDepth: 3 }));
      n = n.concat(voice(c, bus, { freq: 55.2, type: "triangle", gain: 0.09, driftRate: 0.021, driftDepth: 5, panRate: 0.006, panDepth: 0.35 }));
      n = n.concat(bed(c, bus, { freq: 700, q: 0.6, gain: 0.045, sweepRate: 0.019, sweepDepth: 420, panRate: 0.005, panDepth: -0.4 }));
      // the eleven hertz, felt on the bus rather than heard
      var slow = c.createOscillator(); slow.frequency.value = 11;
      var sg = c.createGain(); sg.gain.value = 0.055;
      slow.connect(sg); sg.connect(bus.gain); slow.start();
      n.push(slow);
      t.push(sparse(c, bus, 1500, 25, function (cc, oo) {
        hit(cc, oo, { noise: true, freq: 2600, q: 6, gain: 0.045, decay: 0.035 });
      }));
      return killer(n, bus, t);
    }
  };

  /* the original drone, kept because the tracklist and the numbers page
     both build on it by name */
  function drone(c, out) { return AMB.station(c, out); }

  /* ---- the one-source-at-a-time bus -------------------------------- */

  function teardown() {
    if (current) {
      try { current.stop(); } catch (e) {}
      current = null;
    }
  }

  function announce(id) {
    document.dispatchEvent(new CustomEvent("da:source", { detail: { id: id } }));
  }

  /** Start this page's bed, if it has one and sound is on. */
  function idle() {
    if (!DA.on || !ambientName || current) return;
    var build = AMB[ambientName];
    if (!build) return;
    var c = audio();
    if (!c) return;
    current = { id: "ambience", stop: build(c, master) };
    announce("ambience");
  }

  /**
   * Stop whatever is playing. By default the room comes back -- silence is
   * the mute button's job, not this one's.
   */
  function stop(resume) {
    teardown();
    announce(null);
    if (resume !== false) idle();
  }

  /**
   * Claim the bus. `build(ctx, out)` wires up whatever it likes and returns
   * a function that tears it down. Anything already playing is stopped.
   */
  function play(id, build) {
    var c = audio();
    if (!c) return false;
    teardown();
    if (!DA.on) set(true, true);   // pressing play is consent
    current = { id: id, stop: build(c, master) };
    announce(id);
    return true;
  }

  function playing(id) {
    if (!current) return false;
    if (id === undefined) return true;
    return current.id === id;
  }

  /** A page says which room it is. Called before DOM ready is fine. */
  function ambience(name) {
    ambientName = name;
    if (DA.on && (!current || current.id === "ambience")) {
      teardown();
      idle();
    }
  }

  /* ---- speech ----------------------------------------------------- */

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
    try { window.speechSynthesis.speak(u); } catch (e) {}
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
      setTimeout(function () { stop(false); }, 750);
    }
  }

  function toggle() { set(!DA.on); }

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
      var restyle = function () { b.style.color = DA.on ? "#b4503c" : "#6b675e"; };
      document.addEventListener("da:sound", restyle);
      restyle();
    }
    /* A page says which room it is with data-amb on <body>. One attribute
       beats a script tag per page, and it is visible in the source where
       somebody reading the markup will find it. */
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
          idle();
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
    ambience: ambience,
    speak: speak,
    noise: noise,
    drone: drone,
    beds: AMB,
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
