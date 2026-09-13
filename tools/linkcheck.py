#!/usr/bin/env python3
"""
linkcheck.py -- verify every internal link and asset path, and measure the site.

Checks that:
  * every internal href / src / srcset resolves to a file that exists
  * no internal path starts with "/" (an absolute path breaks the site the
    moment it is served from a subfolder, which is how GitHub Pages project
    sites work)
  * every in-page #anchor has an element with that id
  * the deployable payload is under the 10 MB budget
  * no single image is over 150 KB

    python tools/linkcheck.py
    python tools/linkcheck.py --quiet     only problems and the totals

Exits non-zero if anything is broken, so it can be wired into anything.
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# things that are not site payload
SKIP_DIRS = {".git", ".venv", "tools", "screenshots", "__pycache__", ".claude",
             ".github", "previews"}   # previews/ is rendered audio, not payload
SKIP_FILES = {"DESIGN_NOTES.md", "README.md", ".gitignore"}

BUDGET = 10 * 1024 * 1024
IMG_BUDGET = 150 * 1024

EXTERNAL = re.compile(r"^(?:[a-z][a-z0-9+.-]*:|//)", re.I)
# the guestbook is deliberately unfinished; it is flagged, not counted as broken
TODO = re.compile(r"^#TODO-")


class Refs(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.refs = []      # (attr, value, line)
        self.ids = set()

    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        if d.get("id"):
            self.ids.add(d["id"])
        if d.get("name") and tag == "a":
            self.ids.add(d["name"])
        for a in ("href", "src"):
            if d.get(a):
                self.refs.append((a, d[a], self.getpos()[0]))
        if d.get("srcset"):
            ss = d["srcset"].strip()
            # a data: URI contains a comma of its own, so it cannot be split
            # on commas like an ordinary candidate list
            if ss.startswith("data:"):
                self.refs.append(("srcset", ss, self.getpos()[0]))
            else:
                for part in ss.split(","):
                    u = part.strip().split(" ")[0]
                    if u:
                        self.refs.append(("srcset", u, self.getpos()[0]))


def html_files():
    out = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for f in sorted(filenames):
            if f.endswith(".html"):
                out.append(os.path.join(dirpath, f))
    return sorted(out)


def payload_files():
    out = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for f in filenames:
            if f in SKIP_FILES or f.startswith("."):
                continue
            out.append(os.path.join(dirpath, f))
    return out


def rel(p):
    return os.path.relpath(p, ROOT).replace("\\", "/")


def main(argv=None):
    ap = argparse.ArgumentParser(description="Check internal links and size.")
    ap.add_argument("--quiet", action="store_true")
    a = ap.parse_args(argv)

    problems = []
    todos = []
    checked = 0

    pages = html_files()
    ids_by_page = {}
    parsed = {}

    for path in pages:
        with open(path, encoding="utf-8") as fh:
            p = Refs()
            p.feed(fh.read())
        parsed[path] = p
        ids_by_page[rel(path)] = p.ids

    for path in pages:
        p = parsed[path]
        here = os.path.dirname(path)
        page = rel(path)
        shown = False

        for attr, value, line in p.refs:
            v = value.strip()
            if not v or v.startswith("data:") or v.startswith("javascript:"):
                continue
            if TODO.match(v):
                todos.append("%s:%d  %s" % (page, line, v))
                continue
            if EXTERNAL.match(v):
                continue

            checked += 1

            if v.startswith("/"):
                # The two error pages are the documented exception: they are
                # served at arbitrary URLs, so no relative path can be right.
                # "/" is their no-JS fallback; JS probes for the real root.
                if os.path.basename(path) in ("404.html", "not_found.html"):
                    continue
                problems.append(
                    "%s:%d  absolute path %r — breaks in a subfolder" % (page, line, v)
                )
                continue

            # split off any fragment
            frag = ""
            target = v
            if "#" in v:
                target, frag = v.split("#", 1)

            # and any query. Scripts carry a ?v= cache-buster so a browser
            # cannot pair new HTML with an old cached script; the file on
            # disk is still just the part before the "?".
            if "?" in target:
                target = target.split("?", 1)[0]

            if not target:
                # a bare #anchor, into this page
                if frag and frag not in p.ids:
                    problems.append("%s:%d  #%s — no element with that id" % (page, line, frag))
                continue

            resolved = os.path.normpath(os.path.join(here, target))
            if not os.path.exists(resolved):
                problems.append("%s:%d  %s -> %s (missing)" % (page, line, v, rel(resolved)))
                continue

            if frag and resolved.endswith(".html"):
                other = ids_by_page.get(rel(resolved))
                if other is not None and frag not in other:
                    problems.append(
                        "%s:%d  %s — target has no id %r" % (page, line, v, frag)
                    )

            if not a.quiet and not shown:
                shown = True

    # ---- size -----------------------------------------------------------

    files = payload_files()
    total = sum(os.path.getsize(f) for f in files)
    big = [
        (rel(f), os.path.getsize(f))
        for f in files
        if f.lower().endswith((".gif", ".png", ".jpg", ".jpeg", ".webp"))
        and os.path.getsize(f) > IMG_BUDGET
    ]

    # ---- report ---------------------------------------------------------

    print("pages          %d" % len(pages))
    print("internal links %d checked" % checked)

    if todos:
        print("\nTODO placeholders (deliberate, not broken):")
        for t in todos:
            print("  %s" % t)

    if big:
        print("\nimages over %d KB:" % (IMG_BUDGET // 1024))
        for name, sz in big:
            print("  %-34s %6.1f KB" % (name, sz / 1024.0))

    print("\ndeployable files %d" % len(files))
    print("deployable size  %.2f MB  of %d MB budget  (%.1f%%)"
          % (total / 1048576.0, BUDGET // 1048576, 100.0 * total / BUDGET))

    if problems:
        print("\n%d BROKEN:" % len(problems))
        for pr in problems:
            print("  %s" % pr)
        return 1

    over = total > BUDGET
    if over:
        print("\nOVER BUDGET")
        return 1

    print("\nno broken internal links, no missing images, within budget.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
