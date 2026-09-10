#!/usr/bin/env python3
"""
build_404.py -- generate 404.html and not_found.html.

Both files are served at arbitrary URLs, so neither can rely on a relative
path being correct. They are therefore fully self-contained: inline CSS,
inline JS, and the static burst embedded as a data URI. This script draws
that burst through the same dither pipeline as everything else in img/, so
the 404 page looks like it belongs to the site even though it shares no
files with it.

    python tools/build_404.py

Writes 404.html (GitHub Pages) and not_found.html (Neocities), identical.
"""

import base64
import io
import os
import shutil
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dither import dither_image                    # noqa: E402
from generate_assets import noise_layer, to_rgb    # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def burst():
    """A short, hard, one-bit burst. Same look as img/static.gif, smaller."""
    W, H, N = 128, 96, 6
    frames = []
    for f in range(N):
        arr = noise_layer(W, H, 2100 + f, 1.0)
        arr = np.clip((arr - 128) * 2.2 + 120, 0, 255)
        rng = np.random.default_rng(2200 + f)
        for _ in range(2):
            y = int(rng.integers(0, H - 6))
            th = int(rng.integers(3, 9))
            arr[y:y + th] = np.roll(arr[y:y + th], int(rng.integers(-30, 30)), axis=1) * 1.3
        arr[::2] *= 0.6
        frames.append(to_rgb(Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "L")))

    tmp = os.path.join(ROOT, "img", ".404-burst.gif")
    dither_image(frames, tmp, width=None, palette="1bit", mode="bayer4",
                 fps=10, write_still=True, quiet=True)
    stl = tmp.replace(".gif", "_still.gif")
    anim = base64.b64encode(open(tmp, "rb").read()).decode()
    still = base64.b64encode(open(stl, "rb").read()).decode()
    for p in (tmp, stl):                 # scratch files, not site payload
        os.remove(p)
    return anim, still


anim, still = burst()

PAGE = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>⌈Ｎｏ　Ｓｉｇｎａｌ⌋</title>
<meta name="robots" content="noindex">

<!-- =================================================================
     This page is served at whatever URL somebody mistyped, so it can
     not rely on a single relative path being correct. Everything is
     inline: no stylesheet, no script file, no image file, no favicon
     request. The way home is worked out at runtime, below.

     404.html          — GitHub Pages
     not_found.html    — Neocities
     The two files are identical. If you edit one, copy it over the
     other, or run tools/build_404.py again.
     ================================================================= -->

<style>
* { margin:0; padding:0; box-sizing:border-box; image-rendering:pixelated;
    -webkit-font-smoothing:none; font-smooth:never; }
html, body { height:100%; }
body {
  background:#000; color:#c8c3b4; text-align:center;
  font:12px/2.0 "MS Gothic","Osaka-Mono","Courier New",monospace;
  letter-spacing:.1em;
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  gap:16px; padding:30px 16px;
}
h1 {
  font:15px/2.2 "MS Gothic","Courier New",monospace; font-weight:normal;
  letter-spacing:.6em; color:#c8c3b4;
  animation:tear 5.5s steps(1,end) infinite;
}
@keyframes tear {
  0%, 88%  { transform:none; opacity:1; }
  89%      { transform:translateX(-3px); opacity:.75; }
  90%      { transform:translateX(4px);  opacity:1; }
  91%      { transform:translateX(-2px); opacity:.6; }
  92%,100% { transform:none; opacity:1; }
}
.sub { color:#6b675e; font-size:10px; letter-spacing:.45em; }
img { width:256px; max-width:86vw; height:auto; }
p.body { color:#6b675e; max-width:44ch; text-align:left; letter-spacing:.04em;
         line-height:1.95; }
p.body b { color:#c8c3b4; font-weight:normal; }
.path { color:#b4503c; word-break:break-all; letter-spacing:.02em; }
a { color:#c8c3b4; text-decoration:none; letter-spacing:.5em; font-size:11px; }
a:hover, a:focus { color:#b4503c; }
:focus-visible { outline:1px dotted #c8c3b4; outline-offset:4px; }
.frag { color:#3a3833; font-size:10px; letter-spacing:.2em; max-width:46ch;
        line-height:2.0; }
.frag b { color:#6b675e; font-weight:normal; }
body::after {
  content:""; position:fixed; inset:0; pointer-events:none; z-index:9000;
  background:repeating-linear-gradient(to bottom,
    rgba(0,0,0,0) 0, rgba(0,0,0,0) 2px, rgba(0,0,0,.26) 2px, rgba(0,0,0,.26) 3px);
}
@media (prefers-reduced-motion:reduce) { * { animation:none !important; } }
</style>
</head>
<body>

<h1>ＮＯ　ＳＩＧＮＡＬ</h1>
<p class="sub">the channel is there · the programme is not</p>

<picture>
  <source srcset="data:image/gif;base64,__STILL__" media="(prefers-reduced-motion: reduce)">
  <img src="data:image/gif;base64,__ANIM__" width="128" height="96"
       alt="A hard burst of one-bit static, torn through by shifted bands.">
</picture>

<p class="body">Nothing is filed at <span class="path" id="p">that address</span>.</p>

<p class="body">Five files in the directory are empty on purpose and one is not
listed at all, so a dead link here is not necessarily a mistake. It is at least
as likely that you have found one of the empty ones.</p>

<p class="frag">
  ── fragment recovered from this page's own source ──<br>
  <b>groups are five digits. two carry, one pads, two pad.</b><br>
  <b>the correction is a subtraction, not an addition.</b><br>
  <b>R3. the manual. under Registers.</b>
</p>

<p><a id="home" href="/">[ back to the station ]</a></p>

<script>
(function () {
  "use strict";

  var link = document.getElementById("home");
  var p = document.getElementById("p");
  try { p.textContent = location.pathname + location.search; } catch (e) {}

  /* -------------------------------------------------------------- *
   * Working out the way home.
   *
   * On Neocities the site lives at the domain root, so home is "/".
   * On a GitHub Pages *project* site it lives at "/<repo>/", and this
   * page gets served for any missing URL under it — so the path we
   * are standing on tells us nothing reliable by itself. A user page
   * (name.github.io) and a custom domain are both at the root again.
   *
   * Rather than guess from the hostname, probe: ask for a file we
   * know the site has, at each candidate root, and keep the first one
   * that answers. The favicon is the smallest thing on the server.
   * -------------------------------------------------------------- */

  var segs = location.pathname.split("/").filter(Boolean);
  var candidates = ["/"];
  if (segs.length) candidates.push("/" + segs[0] + "/");
  if (segs.length > 1) candidates.push("/" + segs[0] + "/" + segs[1] + "/");

  if (location.protocol === "file:") {
    // opened straight off a disk: relative is the only thing that can work
    link.setAttribute("href", "index.html");
    return;
  }

  link.setAttribute("href", "/");

  // Shallower candidates win, so a later answer never overrides a better one.
  // (Tracked as an index rather than a flag: candidate 0 is a legitimate
  // winner and would be falsy as a flag.)
  var best = Infinity;
  candidates.forEach(function (root, i) {
    var probe = new Image();
    probe.onload = function () {
      if (i >= best) return;
      best = i;
      link.setAttribute("href", root);
    };
    probe.onerror = function () {};
    probe.src = root + "img/favicon.gif?probe=" + i;
  });
})();
</script>
</body>
</html>
"""

PAGE = PAGE.replace("__ANIM__", anim).replace("__STILL__", still)

a = os.path.join(ROOT, "404.html")
b = os.path.join(ROOT, "not_found.html")
io.open(a, "w", encoding="utf-8", newline="\n").write(PAGE)
shutil.copyfile(a, b)
print("wrote 404.html and not_found.html -- %.1f KB each"
      % (len(PAGE.encode("utf-8")) / 1024.0))
