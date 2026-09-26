#!/usr/bin/env python3
"""
Audit every page for the things the brief actually promised.

linkcheck.py already proves the links resolve and the payload fits. This
checks the rest of the floor -- alt text, labels, focus, reduced motion,
heading order, unique ids -- across all the pages at once, because that is
too many to hold in your head and every one of these failures is invisible
to someone reading the page normally. Nothing here needs a browser: it
reads the markup.

    python tools/audit.py            # report
    python tools/audit.py --quiet    # failures only; exit 1 if any
"""

import argparse
import collections
import io
import os
import re
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {".git", ".venv", "tools", ".claude", ".github", "previews",
             "__pycache__", "img", "css", "js"}
# The error pages are deliberately standalone and are served at arbitrary
# URLs, so a few page-level rules do not apply to them.
STANDALONE = {"404.html", "not_found.html"}

VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link",
        "meta", "param", "source", "track", "wbr"}
# Elements HTML5 lets you leave open
OPTIONAL_CLOSE = {"p", "li", "dt", "dd", "option", "thead", "tbody", "tr",
                  "td", "th", "html", "body", "head"}


class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ids = collections.Counter()
        self.headings = []
        self.stack = []
        self.unclosed = []
        self.imgs = []
        self.inputs = []
        self.labels_for = set()
        self.links = []
        self.buttons = []
        self.lang = None
        self.viewport = False
        self.title = None
        self.description = None
        self.autoplay = []
        self.robots = ""
        self.tabindex = []
        self.has_focusable = False
        self._in_title = False
        self._title_text = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        line = self.getpos()[0]
        if "id" in a:
            self.ids[a["id"]] += 1
        if "tabindex" in a:
            self.tabindex.append((tag, a["tabindex"], line))
        if tag == "html":
            self.lang = a.get("lang")
        if tag == "meta":
            if a.get("name") == "viewport":
                self.viewport = True
            if a.get("name") == "description":
                self.description = a.get("content", "")
            if a.get("name") == "robots":
                self.robots = a.get("content", "")
        if tag == "title":
            self._in_title = True
            self._title_text = []
        if tag == "img":
            self.imgs.append((a, line))
        if tag in ("input", "select", "textarea"):
            self.inputs.append((tag, a, line))
        if tag == "label" and "for" in a:
            self.labels_for.add(a["for"])
        if tag in ("audio", "video") and "autoplay" in a:
            self.autoplay.append((tag, line))
        if tag in ("a", "button", "input", "select", "textarea", "summary"):
            self.has_focusable = True
        if re.fullmatch(r"h[1-6]", tag):
            self.headings.append([int(tag[1]), "", line])
        if tag == "a":
            self.links.append([a, line, ""])
        if tag == "button":
            self.buttons.append([a, line, ""])
        if tag not in VOID:
            self.stack.append((tag, line))

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                for orphan in self.stack[i + 1:]:
                    if orphan[0] not in OPTIONAL_CLOSE:
                        self.unclosed.append(orphan)
                del self.stack[i:]
                break
        if tag == "title":
            self._in_title = False
            self.title = "".join(self._title_text).strip()

    def handle_data(self, data):
        if self._in_title:
            self._title_text.append(data)
        s = data.strip()
        if not s:
            return
        if self.headings and not self.headings[-1][1]:
            self.headings[-1][1] = s[:60]
        for coll in (self.links, self.buttons):
            if coll and not coll[-1][2]:
                coll[-1][2] = s[:60]


# ---- contrast ---------------------------------------------------------
# The palette is pale grey on pure black, which is easy to get slightly
# wrong and impossible to notice once your eyes have adjusted to it. These
# are the WCAG numbers, so the judgement is arithmetic rather than taste.
#
# --dim and --sig were both under 4.5:1 and both are used for navigation,
# dates and footers at 9-11px -- normal-size text by the standard, however
# small it looks. They were nudged up by the least that cleared it. --ink
# is a focus fill and an image ramp and is never text, so it is exempt.

TEXT_TOKENS = ("--fg", "--dim", "--sig")
AA_NORMAL = 4.5


def _lin(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def luminance(hexv):
    h = hexv.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    return 0.2126 * _lin(r) + 0.7152 * _lin(g) + 0.0722 * _lin(b)


def contrast(a, b):
    la, lb = luminance(a), luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def check_palette(css_text):
    """Every token used for text must clear AA against the background."""
    out = []
    tokens = dict(re.findall(r"(--[a-z]+):\s*(#[0-9a-fA-F]{3,6})\s*;",
                             css_text))
    bg = tokens.get("--bg")
    if not bg:
        # Silence here would read exactly like a pass, and a check that
        # cannot find what it measures should say so rather than agree.
        out.append("css/site.css  no --bg token found; contrast unchecked")
        return out
    for name in TEXT_TOKENS:
        val = tokens.get(name)
        if not val:
            continue
        r = contrast(val, bg)
        if r < AA_NORMAL:
            out.append("css/site.css  %s %s on %s is %.2f:1 -- under %.1f:1, "
                       "and it is used for text at 9-11px"
                       % (name, val, bg, r, AA_NORMAL))
    return out


def read(p):
    return io.open(p, encoding="utf-8", errors="replace").read()


def pages():
    out = []
    for dirpath, dirnames, files in os.walk(ROOT):
        dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS)
        for fn in sorted(files):
            if fn.endswith(".html"):
                out.append(os.path.join(dirpath, fn))
    return out


def rel(p):
    return os.path.relpath(p, ROOT).replace("\\", "/")


def audit_page(path, css_text):
    name = os.path.basename(path)
    src = read(path)
    p = Page()
    p.feed(src)
    bad, warn = [], []
    r = rel(path)

    def fail(msg):
        bad.append("%s  %s" % (r, msg))

    def note(msg):
        warn.append("%s  %s" % (r, msg))

    # ---- document level ------------------------------------------------
    if not p.lang:
        fail("<html> has no lang attribute")
    if not p.viewport:
        fail("no viewport meta -- unreadable when zoomed on a phone")
    if not p.title:
        fail("no <title>")
    # A page asking not to be indexed has nothing to describe to a search
    # engine, and the hidden pages ask for exactly that on purpose: they are
    # the reward for solving something, and a description would hand the
    # answer to anyone who typed the right words.
    indexed = "noindex" not in p.robots.lower()
    if name not in STANDALONE and indexed and p.description is None:
        note("no meta description")

    # ---- images --------------------------------------------------------
    for a, line in p.imgs:
        if "alt" not in a:
            fail("line %d: <img> with no alt (%s)"
                 % (line, (a.get("src") or "?")[:44]))
        elif not a["alt"].strip():
            if a.get("role") != "presentation" and "aria-hidden" not in a:
                note('line %d: empty alt -- correct for decoration, but say '
                     'so with role="presentation"' % line)

    # ---- form controls -------------------------------------------------
    for tag, a, line in p.inputs:
        if a.get("type") in ("hidden", "submit", "button", "reset"):
            continue
        # A control carrying the `hidden` attribute is removed from the
        # accessibility tree entirely, so it can never take focus and has
        # nothing to announce. The file inputs here are exactly that: the
        # visible button opens them programmatically.
        if "hidden" in a:
            continue
        labelled = ("aria-label" in a or "aria-labelledby" in a
                    or "title" in a
                    or (a.get("id") and a["id"] in p.labels_for))
        if not labelled:
            fail("line %d: <%s> has no label, aria-label or aria-labelledby"
                 % (line, tag))

    # ---- anything clickable needs an accessible name -------------------
    for a, line, text in p.links:
        if not (text or a.get("aria-label") or a.get("title") or "").strip():
            fail("line %d: <a> with no text and no aria-label" % line)
    for a, line, text in p.buttons:
        if not (text or a.get("aria-label") or a.get("title") or "").strip():
            fail("line %d: <button> with no text and no aria-label" % line)

    # ---- ids -----------------------------------------------------------
    for i, n in p.ids.items():
        if n > 1:
            fail("id %r used %d times" % (i, n))

    # ---- headings ------------------------------------------------------
    levels = [h[0] for h in p.headings]
    if levels:
        if levels[0] != 1:
            note("first heading is h%d, not h1" % levels[0])
        prev = levels[0]
        for lv, text, line in p.headings[1:]:
            if lv > prev + 1:
                note("line %d: heading jumps h%d to h%d (%s)"
                     % (line, prev, lv, text))
            prev = lv
    elif name not in STANDALONE:
        note("no headings at all")

    # ---- structure -----------------------------------------------------
    for tag, line in p.unclosed:
        fail("line %d: <%s> never closed" % (line, tag))
    for tag, line in p.stack:
        if tag not in OPTIONAL_CLOSE:
            fail("line %d: <%s> left open at end of document" % (line, tag))

    # ---- the promises the brief made explicitly ------------------------
    for tag, line in p.autoplay:
        fail("line %d: <%s autoplay> -- nothing may make noise unasked"
             % (line, tag))

    style = src + css_text
    if re.search(r"(animation|transition)\s*:", style):
        if "prefers-reduced-motion" not in style:
            fail("animates or transitions but honours no "
                 "prefers-reduced-motion")
    if p.has_focusable and ":focus" not in style:
        fail("has focusable elements but styles no :focus state")

    for tag, val, line in p.tabindex:
        try:
            if int(val) > 0:
                fail("line %d: tabindex=%s on <%s> -- a positive value "
                     "reorders the whole page" % (line, val, tag))
        except ValueError:
            pass

    return bad, warn


def main(argv=None):
    ap = argparse.ArgumentParser(description="Audit the pages.")
    ap.add_argument("--quiet", action="store_true", help="failures only")
    a = ap.parse_args(argv)

    css_text = ""
    css_dir = os.path.join(ROOT, "css")
    if os.path.isdir(css_dir):
        for fn in sorted(os.listdir(css_dir)):
            if fn.endswith(".css"):
                css_text += read(os.path.join(css_dir, fn))

    all_bad, all_warn = [], []
    all_bad += check_palette(css_text)
    titles = {}
    page_list = pages()
    for path in page_list:
        bad, warn = audit_page(path, css_text)
        all_bad += bad
        all_warn += warn
        p = Page()
        p.feed(read(path))
        if p.title:
            titles.setdefault(p.title, []).append(rel(path))

    for title, where in sorted(titles.items()):
        real = [w for w in where if os.path.basename(w) not in STANDALONE]
        if len(real) > 1:
            all_warn.append("title %r is shared by: %s"
                            % (title, ", ".join(real)))

    if all_bad:
        print("FAILURES (%d)" % len(all_bad))
        for b in all_bad:
            print("  " + b)
        print()
    if all_warn and not a.quiet:
        print("worth a look (%d)" % len(all_warn))
        for w in all_warn:
            print("  " + w)
        print()

    print("%d pages audited, %d failures, %d notes"
          % (len(page_list), len(all_bad), len(all_warn)))
    return 1 if all_bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
