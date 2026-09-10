/* ------------------------------------------------------------------ *
 *  site.js -- the small stuff. Loaded on the homepage only.
 *
 *  Nothing here is required to read the page: posts are plain HTML in
 *  index.html and the site works fine with JS switched off.
 * ------------------------------------------------------------------ */

(function () {
  "use strict";

  var reduced =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- the bracketed phrase under the title ----------------------- *
   * The same sentence, drifting through the languages the station has
   * been heard in. Text only -- the link target never changes.         */

  var PHRASES = [
    "[nobody is listening]",
    "[誰も聞いていない]",
    "[niemand hört zu]",
    "[personne n'écoute]",
    "[nadie está escuchando]",
    "[никто не слушает]",
    "[아무도 듣지 않는다]",
    "[ingen lyssnar]",
    "[没有人在听]",
    "[ninguém está ouvindo]",
    "[kimse dinlemiyor]",
    "[nikt nie słucha]"
  ];

  var phrase = document.getElementById("phrase-text");
  if (phrase && !reduced) {
    var pi = 0;
    setInterval(function () {
      pi = (pi + 1) % PHRASES.length;
      phrase.textContent = PHRASES[pi];
    }, 3400);
  }

  /* ---- the one text effect, in the one place it is used ----------- *
   * The action link under the status line degrades while you hover it,
   * then settles. Used here and nowhere else on the site.              */

  var GLYPHS = "▓▒░#*+=-·:";

  document.querySelectorAll(".scramble").forEach(function (el) {
    if (reduced) return;
    var real = el.textContent;
    var timer = null;

    function run() {
      var frame = 0;
      clearInterval(timer);
      timer = setInterval(function () {
        var out = "";
        for (var i = 0; i < real.length; i++) {
          var ch = real.charAt(i);
          if (ch === "[" || ch === "]" || ch === " ") {
            out += ch;
          } else if (i < frame / 2) {
            out += ch;
          } else {
            out += GLYPHS.charAt(Math.floor(Math.random() * GLYPHS.length));
          }
        }
        el.textContent = out;
        frame++;
        if (frame / 2 > real.length) {
          clearInterval(timer);
          el.textContent = real;
        }
      }, 40);
    }

    function settle() {
      clearInterval(timer);
      el.textContent = real;
    }

    el.addEventListener("mouseenter", run);
    el.addEventListener("focus", run);
    el.addEventListener("mouseleave", settle);
    el.addEventListener("blur", settle);
  });

  /* ---- a message for whoever opens the console -------------------- */

  var log = [
    "",
    "  RELAY 9 — automatic service",
    "  carrier present, no modulation",
    "",
    "  listener number " + (1 + Math.floor(Math.random() * 3)) + " tonight,",
    "  according to a counter that has never been wired to anything.",
    "",
    "  the hum never stopped. it is on the racks, behind the door",
    "  nobody logged:  hidden/hum.html",
    ""
  ].join("\n");

  try {
    console.log("%c" + log, "color:#6b675e;font-family:monospace;line-height:1.5");
  } catch (e) {
    /* no console, no hint. fair enough. */
  }
})();
