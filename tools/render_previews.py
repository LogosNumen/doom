#!/usr/bin/env python3
"""
render_previews.py -- render every track offline and write WAVs to previews/.

Drives tools/render_harness.html in headless Chromium. Each track is
rendered once through an OfflineAudioContext for the full span, then three
windows are cut out of that single render: the opening, a minute in, and
four minutes in. The last one is the whole point -- if 240s sounds like 0s,
the track is a loop wearing a costume.

    python tools/render_previews.py                  # all tracks
    python tools/render_previews.py carrier relay    # just those
    python tools/render_previews.py --seconds 90     # shorter, for a quick look

previews/ is gitignored. Nothing here ships with the site.
"""

from __future__ import annotations

import argparse
import base64
import functools
import http.server
import os
import socketserver
import sys
import threading

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "previews")
PORT = 8899

# opening, a minute in, four minutes in
WINDOWS = [(0, 30), (60, 90), (240, 270)]


def serve(root, port):
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=root)

    class Quiet(socketserver.TCPServer):
        allow_reuse_address = True

    httpd = Quiet(("127.0.0.1", port), handler)
    # the default handler logs every request, which drowns the actual output
    handler.log_message = lambda *a, **k: None
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    return httpd


def main(argv=None):
    ap = argparse.ArgumentParser(description="Render track previews offline.")
    ap.add_argument("tracks", nargs="*", help="track ids (default: all)")
    ap.add_argument("--seconds", type=int, default=275,
                    help="how far to render (default 275, enough for the 240s window)")
    ap.add_argument("--seed", type=int, default=20260913)
    ap.add_argument("--port", type=int, default=PORT)
    a = ap.parse_args(argv)

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("playwright is not installed. pip install playwright && "
              "python -m playwright install chromium", file=sys.stderr)
        return 1

    os.makedirs(OUT, exist_ok=True)
    httpd = serve(ROOT, a.port)
    url = "http://127.0.0.1:%d/tools/render_harness.html" % a.port

    windows = [w for w in WINDOWS if w[1] <= a.seconds] or [(0, min(30, a.seconds))]
    written = []

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
            page = browser.new_page()
            errors = []
            page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
            page.on("pageerror", lambda e: errors.append(str(e)))

            page.goto(url)
            page.wait_for_function("window.__ready === true", timeout=30000)

            all_tracks = page.evaluate("window.trackList()")
            ids = a.tracks or [t["id"] for t in all_tracks]

            print("rendering %d track(s), %ds each\n" % (len(ids), a.seconds))

            for tid in ids:
                info = page.evaluate(
                    "([id, s, seed]) => window.renderTrack(id, s, seed)",
                    [tid, a.seconds, a.seed],
                )
                print("  %-10s %6.1fs rendered" % (tid, info["seconds"]))

                for (f, t) in windows:
                    b64 = page.evaluate("([f,t]) => window.windowWav(f,t)", [f, t])
                    name = "%s_%03d-%03d.wav" % (tid, f, t)
                    path = os.path.join(OUT, name)
                    with open(path, "wb") as fh:
                        fh.write(base64.b64decode(b64))
                    written.append(path)
                    print("      %-26s %6.1f KB" % (name, os.path.getsize(path) / 1024))

            browser.close()

            if errors:
                print("\nconsole errors during render:", file=sys.stderr)
                for e in errors[:20]:
                    print("  " + e, file=sys.stderr)
                return 2
    finally:
        httpd.shutdown()

    print("\n%d files in previews/" % len(written))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
