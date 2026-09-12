#!/usr/bin/env python3
"""
build_guestbook.py -- turn signed issues into guestbook.json.

The book is signed on guestbook.html, which opens a pre-filled issue on the
repository. This reads those issues back and writes the file the page renders,
so nobody has to transcribe anything by hand.

    gh issue list --state open --limit 200 --json number,title,body,author,createdAt \
      | python tools/build_guestbook.py

Reads the issue list as JSON on stdin, merges it with guestbook.seed.json
(hand-written entries that always appear), and writes guestbook.json.

MODERATION, such as it is:
  * only issues whose title starts "guestbook:" are considered
  * closing an issue removes the entry -- the file is rebuilt from scratch
    every run, so closing or deleting is the delete button
  * everything is length-capped and stripped to plain text
  * bots are ignored

guestbook.json is GENERATED. Do not hand-edit it; edit guestbook.seed.json.
"""

from __future__ import annotations

import io
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "guestbook.json")
SEED = os.path.join(ROOT, "guestbook.seed.json")

MAX_HANDLE = 32
MAX_WHERE = 40
MAX_TEXT = 600
MAX_ENTRIES = 300

TITLE = re.compile(r"^\s*guestbook\s*:", re.I)
FOOTER = re.compile(r"\n-{3,}\s*\nsent from the book.*$", re.I | re.S)

# --------------------------------------------------------------------------
# RESERVED HANDLES
#
# Names already in the book. To sign as one you have to show you got through
# the login: guestbook.html turns the pass phrase plus the handle into a token
# and posts it with the entry, and it is checked again here.
#
# The client-side check is the polite half -- it can be walked straight past by
# opening an issue on the tracker by hand, which is exactly why this exists.
#
# The repository owner is always allowed them: it is their site and their name.
#
# Like the login it protects, this is obfuscation and not security. The
# expected values are sitting in a public repository. It stops casual
# impersonation, which is all it is for.
# --------------------------------------------------------------------------

RESERVED = {
    "operator": 0x81862BA7,
    "vhf": 0xF4648BD5,
    "station": 0x93D44485,
    "admin": 0xC1220F96,
}

# Names nobody signs with, including the owner and including anyone who has
# solved the login. Putting the phrase the station says in the book, in the
# largest text on the page and next to a date, hands it to every future visitor
# before they have had a chance to work it out. No proof gets past this one.
BLOCKED = {"stillhere"}

OWNER = (os.environ.get("GITHUB_REPOSITORY_OWNER") or "").lower()


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", str(s or "").lower())


def header(body: str) -> tuple[dict, str]:
    """
    Read the leading "key: value" lines the page writes, stop at the first
    blank line, and hand back the rest as the message. Parsing them one at a
    time rather than with one big pattern means an extra field (proof) does
    not quietly break the message.
    """
    fields, lines = {}, body.split("\n")
    i = 0
    while i < len(lines):
        line = lines[i]
        if not line.strip():
            i += 1
            break
        m = re.match(r"\s*(handle|where|date|proof)\s*:\s*(.*)$", line, re.I)
        if not m:
            break
        fields[m.group(1).lower()] = m.group(2)
        i += 1
    return fields, "\n".join(lines[i:])


def clean(s: str, cap: int) -> str:
    """Plain text only, collapsed whitespace, capped."""
    s = str(s or "")
    s = s.replace("\r\n", "\n").replace("\r", "\n")
    # no markup, no control characters
    s = re.sub(r"<[^>]*>", "", s)
    s = "".join(ch for ch in s if ch == "\n" or ch >= " ")
    # at most one blank line in a row
    s = re.sub(r"\n{3,}", "\n\n", s)
    s = re.sub(r"[ \t]{2,}", " ", s)
    return s.strip()[:cap]


def one_line(s: str, cap: int) -> str:
    return clean(s, cap).replace("\n", " ").strip()


def parse(issue: dict) -> dict | None:
    """Pull an entry out of one issue, in the format the page writes."""
    title = issue.get("title") or ""
    if not TITLE.match(title):
        return None

    author = (issue.get("author") or {})
    login = author.get("login") or "anonymous"
    if author.get("is_bot") or login.endswith("[bot]"):
        return None

    body = (issue.get("body") or "").replace("\r\n", "\n")
    body = FOOTER.sub("", body)

    fields, text = header(body)

    if fields:
        handle = fields.get("handle", "")
        where = fields.get("where", "")
        date = fields.get("date", "")
    else:
        # signed by hand, straight on the tracker: still let it in
        handle = login
        where = ""
        text = body
        date = (issue.get("createdAt") or "")[:10]
        if date:
            y, mo, d = date.split("-")
            date = "%s.%s.%s" % (d, mo, y[2:])

    handle = one_line(handle, MAX_HANDLE) or login
    where = one_line(where, MAX_WHERE)
    if where in ("-", "—"):
        where = ""
    date = one_line(date, 12)
    text = clean(text, MAX_TEXT)

    if not text:
        return None

    # ---- blocked outright, whoever sent it --------------------------------
    n = norm(handle)
    if n in BLOCKED:
        print(
            "issue #%s: refusing blocked handle %r from %s"
            % (issue.get("number"), handle, login),
            file=sys.stderr,
        )
        return None

    # ---- reserved handles -------------------------------------------------
    if n in RESERVED:
        allowed = False
        why = "no proof"

        if OWNER and login.lower() == OWNER:
            allowed, why = True, "repository owner"
        else:
            token = one_line(fields.get("proof", ""), 16).lower()
            try:
                allowed = int(token, 16) == RESERVED[n]
            except ValueError:
                allowed = False
            if allowed:
                why = "solved the login"

        if not allowed:
            print(
                "issue #%s: refusing reserved handle %r from %s (%s)"
                % (issue.get("number"), handle, login, why),
                file=sys.stderr,
            )
            return None

    return {
        "handle": handle,
        "where": where,
        "at": date,
        "text": text,
        "issue": issue.get("number"),
        "by": login,
    }


def load_seed() -> list:
    if not os.path.exists(SEED):
        return []
    try:
        d = json.load(io.open(SEED, encoding="utf-8"))
        return d.get("entries", []) if isinstance(d, dict) else list(d)
    except Exception as e:                                   # noqa: BLE001
        print("seed file unreadable, ignoring it: %s" % e, file=sys.stderr)
        return []


def main() -> int:
    raw = sys.stdin.read().strip()
    issues = []
    if raw:
        try:
            issues = json.loads(raw)
        except json.JSONDecodeError as e:
            print("could not read the issue list: %s" % e, file=sys.stderr)
            return 1
    if not isinstance(issues, list):
        issues = []

    signed = []
    for it in issues:
        e = parse(it)
        if e:
            signed.append(e)

    # newest issue first, then the hand-written seeds underneath
    signed.sort(key=lambda e: -(e.get("issue") or 0))
    entries = (signed + load_seed())[:MAX_ENTRIES]

    doc = {
        "_README": (
            "GENERATED by tools/build_guestbook.py from the repository's issues. "
            "Do not hand-edit this file - edit guestbook.seed.json for permanent "
            "entries, and close an issue to remove the one it produced."
        ),
        "count": len(entries),
        "entries": entries,
    }

    new = json.dumps(doc, indent=2, ensure_ascii=False) + "\n"
    old = io.open(OUT, encoding="utf-8").read() if os.path.exists(OUT) else ""

    if new == old:
        print("guestbook.json unchanged (%d entries)" % len(entries))
        return 0

    io.open(OUT, "w", encoding="utf-8", newline="\n").write(new)
    print("guestbook.json written: %d entries (%d signed, %d seed)"
          % (len(entries), len(signed), len(entries) - len(signed)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
