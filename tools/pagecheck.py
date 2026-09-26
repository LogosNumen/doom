#!/usr/bin/env python3
"""
Open every page in a real browser and see whether it actually works.

linkcheck.py proves the links resolve. audit.py proves the markup means what
the page looks like. Neither of them runs a line of JavaScript, so neither
would notice a page that throws on load, references a function that no longer
exists, or spills off the side of a phone. That is the gap this closes.

For each page it reports:
  * uncaught exceptions and console errors
  * requests that 404 (an image or script the link checker cannot see,
    because it is built at runtime)
  * horizontal overflow at 360px, which the brief asks about by name
  * whether anything started making noise on its own

    python tools/pagecheck.py
    python tools/pagecheck.py --width 360
"""

import argparse
import http.server
import os
import socketserver
import sys
import threading

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {".git", ".venv", "tools", ".claude", ".github", "previews",
             "__pycache__"}
PORT = 8823

# Noise a headless browser makes that says nothing about the page.
IGNORE = (
    "favicon.ico",
    "the AudioContext was not allowed to start",
    "play() failed because the user didn",
    # The two error pages are served at an unknown depth, so no relative
    # path can be right. They find the site root by asking for a file they
    # know exists at each candidate and watching which request succeeds --
    # the failures ARE the mechanism, and probe.onerror swallows them on
    # purpose. Counting them as faults would fail the page for working.
    "?probe=",
    # A failed subresource logs "Failed to load resource" with no URL in the
    # text, so it cannot be told apart from any other. The response listener
    # below reports the same failure WITH the URL, which can be judged
    # precisely -- so this line is always a vaguer duplicate of something
    # already counted, and dropping it loses nothing.
    "Failed to load resource",
)


def pages():
    out = []
    for dirpath, dirnames, files in os.walk(ROOT):
        dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS)
        for fn in sorted(files):
            if fn.endswith(".html"):
                rel = os.path.relpath(os.path.join(dirpath, fn), ROOT)
                out.append(rel.replace("\\", "/"))
    return out


class Quiet(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, *a):
        pass


def serve(port):
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("127.0.0.1", port), Quiet)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def interesting(text):
    low = text.lower()
    return not any(s.lower() in low for s in IGNORE)


def main(argv=None):
    ap = argparse.ArgumentParser(description="Load every page for real.")
    ap.add_argument("--width", type=int, default=360,
                    help="viewport width (default 360, the brief's floor)")
    ap.add_argument("--port", type=int, default=PORT)
    ap.add_argument("--settle", type=float, default=1.2,
                    help="seconds to let a page run before judging it")
    a = ap.parse_args(argv)

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("playwright is not installed. pip install playwright && "
              "python -m playwright install chromium", file=sys.stderr)
        return 2

    httpd = serve(a.port)
    base = "http://127.0.0.1:%d/" % a.port
    rows = []

    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            for rel in pages():
                ctx = browser.new_context(
                    viewport={"width": a.width, "height": 800},
                    reduced_motion="reduce")
                page = ctx.new_page()
                errs, bad_reqs = [], []
                page.on("pageerror",
                        lambda e: errs.append("uncaught: %s" % e))
                page.on("console", lambda m: errs.append(
                    "console.%s: %s" % (m.type, m.text))
                    if m.type == "error" else None)
                page.on("response", lambda r: bad_reqs.append(
                    "%d %s" % (r.status, r.url.replace(base, "")))
                    if r.status >= 400 else None)

                try:
                    page.goto(base + rel, wait_until="load", timeout=20000)
                    page.wait_for_timeout(int(a.settle * 1000))
                    overflow = page.evaluate(
                        "() => document.documentElement.scrollWidth "
                        "> window.innerWidth + 1")
                    # Nothing may make a sound before a human asks for one.
                    noisy = page.evaluate(
                        "() => !!(window.DAA && window.DAA.engine "
                        "&& window.DAA.engine.playing())")
                    title = page.title()
                except Exception as e:  # noqa: BLE001 - report, never raise
                    errs.append("navigation failed: %s" % e)
                    overflow, noisy, title = False, False, ""

                ctx.close()
                rows.append({
                    "page": rel, "title": title,
                    "errors": [e for e in errs if interesting(e)],
                    "bad": [b for b in bad_reqs if interesting(b)],
                    "overflow": overflow, "noisy": noisy,
                })
            browser.close()
    finally:
        httpd.shutdown()

    fails = 0
    for r in rows:
        problems = []
        problems += r["errors"]
        problems += ["request %s" % b for b in r["bad"]]
        if r["overflow"]:
            problems.append("scrolls sideways at %dpx" % a.width)
        if r["noisy"]:
            problems.append("started playing without being asked")
        if problems:
            fails += 1
            print("FAIL  %s" % r["page"])
            for p in problems:
                print("        " + p)
        else:
            print("ok    %s" % r["page"])

    print()
    print("%d pages loaded at %dpx, %d with problems"
          % (len(rows), a.width, fails))
    return 1 if fails else 0


if __name__ == "__main__":
    raise SystemExit(main())
