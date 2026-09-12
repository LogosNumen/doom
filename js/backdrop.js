/* ------------------------------------------------------------------ *
 *  backdrop.js -- the room the site sits in.
 *
 *  A drifting dither field behind everything. It is deliberately almost
 *  invisible: the brightest thing it ever draws is --ink (#1c1a17), which
 *  is four percent luminance, so it reads as a surface rather than as an
 *  image and never competes with the text sitting on it.
 *
 *  Rendered at a sixth of the window and scaled up with pixelated
 *  smoothing -- the grain is meant to be bigger than a device pixel, the
 *  same way the GIFs are, and it costs almost nothing to draw.
 *
 *  Runs at 12fps, not 60. It is weather, not animation.
 *  prefers-reduced-motion gets one frame and then silence.
 * ------------------------------------------------------------------ */

(function () {
  "use strict";

  if (window.__daBackdrop) return;
  window.__daBackdrop = true;

  var reduced =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var c = document.createElement("canvas");
  c.id = "da-backdrop";
  c.setAttribute("aria-hidden", "true");
  c.style.cssText =
    "position:fixed;inset:0;width:100%;height:100%;z-index:-1;" +
    "pointer-events:none;image-rendering:pixelated;display:block";

  function attach() {
    if (!document.body) return;
    document.body.appendChild(c);
    // the page's own background must not paint over us
    var cs = getComputedStyle(document.body).backgroundColor;
    if (cs && cs !== "rgba(0, 0, 0, 0)") document.body.style.background = "transparent";
    var hs = getComputedStyle(document.documentElement).backgroundColor;
    if (!hs || hs === "rgba(0, 0, 0, 0)") document.documentElement.style.background = "#000";
    resize();
    start();
  }

  var ctx = c.getContext("2d", { alpha: false });
  var SCALE = 4;
  var W = 0, H = 0, img = null;

  /* Three steps and the brightest is #14120f — under 2% luminance. The whole
     field is meant to be something you notice only once, early, and then stop
     seeing. Anything brighter competes with the prose sitting on top of it. */
  var R = [0x00, 0x08, 0x0e, 0x14],
      G = [0x00, 0x07, 0x0d, 0x12],
      B = [0x00, 0x07, 0x0b, 0x0f];

  function resize() {
    W = Math.max(1, Math.ceil(window.innerWidth / SCALE));
    H = Math.max(1, Math.ceil(window.innerHeight / SCALE));
    c.width = W;
    c.height = H;
    img = ctx.createImageData(W, H);
    ctx.imageSmoothingEnabled = false;
  }

  var rt = null;
  window.addEventListener("resize", function () {
    clearTimeout(rt);
    rt = setTimeout(function () { resize(); draw(t); }, 200);
  });

  /* cheap value noise: a hash per cell, smoothed by sampling a coarse grid */
  function hash(x, y) {
    var n = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  }

  var t = 0;

  function draw(time) {
    if (!img) return;
    var d = img.data;

    // two fields drifting at different speeds and angles, so the texture
    // never settles into a pattern you can read
    var ax = time * 0.05, ay = time * 0.021;
    var bx = -time * 0.017, by = time * 0.043;

    // a very slow band working down the screen, like a roll bar on a set
    // nobody is watching. Weak enough to read as a drift, not a wipe.
    var band = (time * 0.42) % (H + 160) - 80;

    for (var y = 0, i = 0, p = 0; y < H; y++) {
      var bandLift = (1 - Math.min(1, Math.abs(y - band) / 60)) * 0.10;
      var scan = (y & 1) ? 0.62 : 1.0;
      for (var x = 0; x < W; x++, i++, p += 4) {
        // one fine field and one coarse one, drifting apart, so the grain
        // never settles into a pattern you can actually read
        var v =
          hash(Math.floor(x + ax), Math.floor(y + ay)) * 0.62 +
          hash(Math.floor((x + bx) * 0.16), Math.floor((y + by) * 0.16)) * 0.38;

        v = v + bandLift;
        v *= scan;

        // steep thresholds: most of the field stays pure black, and only the
        // top few percent of cells lift at all. Dust, not static.
        var lv = v > 0.955 ? 3 : v > 0.90 ? 2 : v > 0.82 ? 1 : 0;
        d[p] = R[lv]; d[p + 1] = G[lv]; d[p + 2] = B[lv]; d[p + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  var timer = null;

  function start() {
    draw(0);
    if (reduced) return;                 // one frame, then it stays put
    clearInterval(timer);
    timer = setInterval(function () {
      if (document.hidden) return;       // nothing to draw for nobody
      t += 1;
      draw(t);
    }, 84);                              // ~12fps
  }

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && !reduced) draw(t);
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", attach);
  } else {
    attach();
  }
})();
