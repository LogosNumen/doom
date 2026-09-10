#!/usr/bin/env python3
"""
fullwidth.py -- ASCII -> fullwidth forms, for page titles and headings.

The rule: printable ASCII 0x21..0x7E maps to U+FF01..U+FF5E by adding 0xFEE0,
and a plain space (0x20) maps to the ideographic space U+3000. Doing it here
rather than by hand means the titles are consistent and I never mistype one.

Usage
-----
    python tools/fullwidth.py "Dead Air for Night Listeners"
    python tools/fullwidth.py --bracket "Help"          # wraps in corner brackets
    python tools/fullwidth.py --titles                  # print every page title
"""

from __future__ import annotations

import argparse
import sys

# corner brackets used as a frame; the pairing is deliberate -- upper-left
# with lower-right, so the title looks clipped out of something larger
OPEN = "⌈"   # left ceiling
CLOSE = "⌋"  # right floor


def fullwidth(s: str) -> str:
    out = []
    for ch in s:
        o = ord(ch)
        if o == 0x20:
            out.append("　")
        elif 0x21 <= o <= 0x7E:
            out.append(chr(o + 0xFEE0))
        else:
            out.append(ch)
    return "".join(out)


def bracketed(s: str) -> str:
    return OPEN + fullwidth(s) + CLOSE


# Every <title> on the site, in one place, so they stay in the same voice.
TITLES = {
    "index.html": "Dead Air for Night Listeners",
    "about.html": "Who Is Still Here",
    "login.html": "Relay / Login",
    "help.html": "Help",
    "tracklist.html": "Tracklist",
    "dir.html": "Unsorted",
    "carrier.html": "Carrier Only",
    "404.html": "No Signal",
    "etc/static.html": "Snow",
    "etc/scope.html": "Scope",
    "etc/numbers.html": "Numbers",
    "etc/mirror.html": "Mirror",
    "etc/forecast.html": "Forecast",
    "hidden/0300z.html": "0300 Zulu",
    "hidden/hum.html": "Hum",
    "hidden/tape-b7.html": "Spool B7",
    "hidden/relay-9.html": "Relay Nine",
}


def main(argv=None):
    p = argparse.ArgumentParser(description="ASCII to fullwidth forms.")
    p.add_argument("text", nargs="*", help="text to convert")
    p.add_argument("--bracket", "-b", action="store_true", help="wrap in corner brackets")
    p.add_argument("--titles", action="store_true", help="print every page title")
    a = p.parse_args(argv)

    if a.titles:
        for path, title in TITLES.items():
            print("%-22s %s" % (path, bracketed(title)))
        return 0

    if not a.text:
        p.print_help()
        return 1

    s = " ".join(a.text)
    print(bracketed(s) if a.bracket else fullwidth(s))
    return 0


if __name__ == "__main__":
    sys.exit(main())
