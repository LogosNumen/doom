/* ------------------------------------------------------------------ *
 *  figure.js -- somebody is occasionally at the edge of the site.
 *
 *  Rare on purpose. It will not happen on most page loads, and when it
 *  does it takes a while, so it reads as something you caught rather
 *  than something the page did at you.
 *
 *  It cannot be clicked and it is hidden from assistive technology: it
 *  carries no information and it must never eat a click meant for a
 *  link underneath it.
 *
 *  prefers-reduced-motion switches it off entirely. A thing that fades
 *  in at the edge of vision is exactly what that setting is for.
 * ------------------------------------------------------------------ */

(function () {
  "use strict";

  if (window.__daFigure) return;
  window.__daFigure = true;

  var reduced =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) return;

  /* ---- how often ---------------------------------------------------
     Roughly one page load in five, and then not for at least twenty
     seconds. Sightings are counted locally so the rare variant can stay
     rare across a whole visit rather than per page.                    */

  var CHANCE = 0.2;
  var COUNT = "da.figure";

  if (Math.random() > CHANCE) return;

  function seen() {
    try { return parseInt(localStorage.getItem(COUNT) || "0", 10) || 0; }
    catch (e) { return 0; }
  }
  function bump() {
    try { localStorage.setItem(COUNT, String(seen() + 1)); } catch (e) {}
  }

  var here = location.pathname.replace(/[^/]*$/, "");   // ./ of this page
  var deep = /\/(etc|hidden)\//.test(location.pathname);
  var base = deep ? "../img/" : "img/";
  void here;

  /* far is the usual one. the doorway is rarer. near is rare enough that
     most people will never get it. */
  function pick() {
    var n = seen();
    var r = Math.random();
    if (n >= 3 && r < 0.12) return { f: "figure-near", w: 120, h: 150, o: 0.5 };
    if (r < 0.35) return { f: "figure-door", w: 120, h: 150, o: 0.42 };
    return { f: "figure-far", w: 120, h: 150, o: 0.34 };
  }

  /* ---- where -------------------------------------------------------
     Edges only, and never the middle. Somebody standing in the centre of
     the page is a graphic; somebody at the edge is a person.           */

  var SPOTS = [
    { left: "2%",  bottom: "0",   origin: "left" },
    { right: "2%", bottom: "0",   origin: "right" },
    { left: "6%",  bottom: "12%", origin: "left" },
    { right: "6%", bottom: "18%", origin: "right" }
  ];

  function show() {
    if (document.hidden) {
      // wait until somebody is actually looking
      document.addEventListener("visibilitychange", function again() {
        if (!document.hidden) {
          document.removeEventListener("visibilitychange", again);
          setTimeout(show, 4000 + Math.random() * 8000);
        }
      });
      return;
    }

    var v = pick();
    var spot = SPOTS[Math.floor(Math.random() * SPOTS.length)];

    var img = document.createElement("img");
    img.src = base + v.f + ".gif";
    img.width = v.w;
    img.height = v.h;
    img.alt = "";
    img.setAttribute("aria-hidden", "true");

    var wrap = document.createElement("div");
    wrap.appendChild(img);
    wrap.style.cssText =
      "position:fixed;z-index:8500;pointer-events:none;opacity:0;" +
      "transition:opacity 2.4s linear;image-rendering:pixelated;" +
      "line-height:0;filter:brightness(.8)";
    Object.keys(spot).forEach(function (k) {
      if (k !== "origin") wrap.style[k] = spot[k];
    });

    document.body.appendChild(wrap);
    bump();

    // in, stay, out, gone
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { wrap.style.opacity = String(v.o); });
    });

    var stay = 5000 + Math.random() * 5000;
    setTimeout(function () {
      wrap.style.opacity = "0";
      setTimeout(function () {
        if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
      }, 2600);
    }, 2400 + stay);
  }

  function start() {
    // pages can decline with data-nofigure: the reader is for reading, and
    // the mirror is already showing you a person
    if (document.body && document.body.hasAttribute("data-nofigure")) return;
    setTimeout(show, 20000 + Math.random() * 50000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
