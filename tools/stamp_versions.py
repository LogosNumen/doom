#!/usr/bin/env python3
"""
Stamp a content hash onto every shared script reference.

A static host with a CDN in front of it will happily serve a visitor new HTML
and the copy of js/sound.js they cached last week. That pairing is what threw
"window.DA.loadEngine is not a function" on the live tracklist: the page was
new, the script was old, and the error only appeared for people who had been
to the site before.

A hand-written ?v=2 fixes it exactly once and then rots, because the next
edit to the JS needs someone to remember to bump it. This derives the query
from the bytes instead, so forgetting is not possible: run it after touching
any JS and the sites's references update themselves.

This is not a build step -- it rewrites the files in place and the site stays
plain static HTML that runs from a disk. Run it, look at the diff, commit it.
"""

import hashlib
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHARED = ["backdrop.js", "sound.js", "figure.js", "site.js"]
SKIP_DIRS = {".git", ".venv", "tools", ".claude", ".github", "previews", "img"}
# the two error pages are self-contained by design: no external scripts at all
SKIP_FILES = {"404.html", "not_found.html"}


def digest(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        h.update(fh.read())
    return h.hexdigest()[:8]


def read(p):
    return io.open(p, encoding="utf-8").read()


def write(p, s):
    io.open(p, "w", encoding="utf-8", newline="\n").write(s)


def main():
    check = "--check" in sys.argv
    changed = []

    # ---- the engine: one version for the whole set ---------------------
    audio_dir = os.path.join(ROOT, "js", "audio")
    parts = []
    for dirpath, dirnames, files in os.walk(audio_dir):
        dirnames.sort()
        for fn in sorted(files):
            if fn.endswith(".js"):
                parts.append(digest(os.path.join(dirpath, fn)))
    engine_ver = hashlib.sha256("".join(parts).encode()).hexdigest()[:8]

    sound_path = os.path.join(ROOT, "js", "sound.js")
    s = read(sound_path)
    new = re.sub(r'var AUDIO_VER = "[0-9a-f]*";',
                 'var AUDIO_VER = "%s";' % engine_ver, s)
    if new != s:
        if not check:
            write(sound_path, new)
        changed.append("js/sound.js (engine -> %s)" % engine_ver)

    # ---- the shared scripts, hashed one by one -------------------------
    # sound.js is hashed AFTER its own rewrite above, or the stamp in the
    # HTML would refer to a version of the file that no longer exists.
    vers = {}
    for name in SHARED:
        p = os.path.join(ROOT, "js", name)
        if os.path.exists(p):
            vers[name] = digest(p)

    for dirpath, dirnames, files in os.walk(ROOT):
        dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS)
        for fn in sorted(files):
            if not fn.endswith(".html") or fn in SKIP_FILES:
                continue
            p = os.path.join(dirpath, fn)
            s = read(p)
            out = s
            for name, v in vers.items():
                out = re.sub(
                    r'(src="[^"]*js/%s)(?:\?[^"]*)?(")' % re.escape(name),
                    r'\1?v=' + v + r'\2', out)
            if out != s:
                if not check:
                    write(p, out)
                changed.append(os.path.relpath(p, ROOT).replace("\\", "/"))

    if check:
        if changed:
            print("stale script versions in %d file(s):" % len(changed))
            for c in changed:
                print("  " + c)
            return 1
        print("script versions are current.")
        return 0

    if changed:
        print("stamped %d file(s):" % len(changed))
        for c in changed:
            print("  " + c)
    else:
        print("script versions already current.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
