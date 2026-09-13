#!/usr/bin/env python3
"""
analyse_audio.py -- measure the rendered previews.

Since the person writing the music cannot hear it, this is the part that
decides whether any of it is any good. Every check below is a way a
generative track fails that you would notice instantly by ear and never by
reading the code.

    python tools/analyse_audio.py
    python tools/analyse_audio.py --dir previews --verbose

Checks, per rendered window:
  clip      no sample at or above 0.99
  peak      true peak below -1 dBFS
  rms       loudness in a sensible band, not whisper-quiet and not crushed
  silence   no unintended gap longer than 2s (sparse tracks are exempt)
  dc        no DC offset
  clicks    no sample-to-sample jumps big enough to hear as a tick
  stereo    left and right not fully correlated
  spectrum  energy present low, mid and high; no massive sub buildup
  stable    level not climbing across the window, which means feedback escaping

And per track, across windows:
  evolves   the 240s window measurably different from the 0s window.
            This is the actual proof the track is composed rather than looped.
"""

from __future__ import annotations

import argparse
import math
import os
import re
import sys
import wave

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# tracks allowed to be silent for a long time, because that is what they are
SPARSE = {"forecast", "drone"}

LIMITS = {
    "peak_db": -1.0,
    "rms_db_min": -34.0,
    "rms_db_max": -9.0,
    "silence_s": 2.0,
    "dc": 0.003,
    "click": 0.45,          # sample-to-sample delta
    "crest_db": 6.0,        # peak-to-RMS below this is a clipped wave
    "corr": 0.995,          # above this the two channels are the same signal
    "growth_db": 7.0,
    "climb": 0.80,          # fraction of 2s slices still rising: a runaway
                            # climbs in nearly all of them, a swell does not
}


def read_wav(path):
    with wave.open(path, "rb") as w:
        n, ch, sw, rate = w.getnframes(), w.getnchannels(), w.getsampwidth(), w.getframerate()
        raw = w.readframes(n)
    if sw != 2:
        raise ValueError("expected 16-bit: %s" % path)
    a = np.frombuffer(raw, dtype="<i2").astype(np.float64) / 32768.0
    if ch == 2:
        a = a.reshape(-1, 2)
    else:
        a = np.stack([a, a], axis=1)
    return a, rate


def db(x):
    return -np.inf if x <= 0 else 20 * math.log10(x)


def longest_silence(mono, rate, thresh=0.002):
    """Longest run under `thresh`, in seconds, measured on 20ms blocks."""
    blk = max(1, int(rate * 0.02))
    usable = (len(mono) // blk) * blk
    if usable == 0:
        return 0.0
    b = np.abs(mono[:usable]).reshape(-1, blk).max(axis=1)
    quiet = b < thresh
    best = run = 0
    for q in quiet:
        run = run + 1 if q else 0
        best = max(best, run)
    return best * blk / rate


def avg_spectrum(mono, rate, n=8192):
    """
    Power spectrum averaged over the whole window, not a snapshot of the
    start of it. Measuring one 1.5s frame of a 30s file and calling it the
    spectral balance is how you conclude a track has no treble because the
    first frame happened to land between two hat hits.
    """
    if len(mono) < n:
        n = 1 << int(math.floor(math.log2(max(256, len(mono)))))
    hop = n // 2
    win = np.hanning(n)
    acc = None
    frames = 0
    for a in range(0, len(mono) - n + 1, hop):
        seg = mono[a:a + n] * win
        p = np.abs(np.fft.rfft(seg)) ** 2
        acc = p if acc is None else acc + p
        frames += 1
    if acc is None:
        return np.zeros(n // 2 + 1), np.fft.rfftfreq(n, 1.0 / rate)
    return acc / frames, np.fft.rfftfreq(n, 1.0 / rate)


def bands(mono, rate):
    """Fraction of energy below 200Hz, 200Hz-5kHz, and above 5kHz."""
    spec, freq = avg_spectrum(mono, rate)
    total = spec.sum() or 1.0
    lo = spec[freq < 200].sum() / total
    mid = spec[(freq >= 200) & (freq < 5000)].sum() / total
    hi = spec[freq >= 5000].sum() / total
    return (float(lo), float(mid), float(hi))


def centroid(mono, rate):
    spec, freq = avg_spectrum(mono, rate)
    amp = np.sqrt(spec)
    s = amp.sum()
    return float((amp * freq).sum() / s) if s else 0.0


def analyse(path):
    a, rate = read_wav(path)
    L, R = a[:, 0], a[:, 1]
    mono = a.mean(axis=1)

    name = os.path.basename(path)
    m = re.match(r"(.+?)_(\d+)-(\d+)\.wav$", name)
    track = m.group(1) if m else name
    start = int(m.group(2)) if m else 0

    peak = float(np.abs(a).max())
    rms = float(np.sqrt((mono ** 2).mean()))
    dc = float(abs(mono.mean()))
    sil = longest_silence(mono, rate)
    clicks = int((np.abs(np.diff(mono)) > LIMITS["click"]).sum())

    # Crest factor: peak over RMS, in dB. This is the one number that tells a
    # tick apart from a wave that is simply squashed flat. A runaway string
    # pinned against the limiter reads as tens of thousands of "clicks", but
    # so would a genuinely percussive track; what actually gives it away is a
    # crest of ~3 dB, where real playing sits nearer 12-20. Worth measuring
    # directly rather than inferring it from a click count a second time.

    # stereo correlation
    if L.std() < 1e-9 or R.std() < 1e-9:
        corr = 1.0
    else:
        corr = float(abs(np.corrcoef(L, R)[0, 1]))

    lo, mid, hi = bands(mono, rate)

    # level drift across the window
    third = max(1, len(mono) // 3)
    r0 = float(np.sqrt((mono[:third] ** 2).mean()))
    r2 = float(np.sqrt((mono[-third:] ** 2).mean()))
    growth = db(r2) - db(r0) if r0 > 0 and r2 > 0 else 0.0

    # Growth alone cannot tell a crescendo from a runaway: several of these
    # tracks are written to emerge out of near-silence, so "ends louder than
    # it started" is the arrangement doing its job. What actually marks an
    # escaping feedback loop is that it never stops climbing. Measured in
    # 2-second slices, hymn at 60s holds -43 dB for fourteen seconds, steps
    # to -26 and then sits there; at 240s it climbs and falls back to -40.
    # A runaway does neither -- it rises in nearly every slice, without end.
    # So flag sustained climb, not any climb.
    seg = max(1, rate * 2)
    slices = [float(np.sqrt((mono[i:i + seg] ** 2).mean()))
              for i in range(0, max(1, len(mono) - seg), seg)]
    steps = np.diff([db(v) for v in slices]) if len(slices) > 2 else np.array([0.0])
    climb = float((steps > 0).mean())

    return {
        "file": name, "track": track, "start": start, "rate": rate,
        "peak": peak, "peak_db": db(peak), "rms": rms, "rms_db": db(rms),
        "crest": (db(peak) - db(rms)) if rms > 0 else 0.0,
        "dc": dc, "silence": sil, "clicks": clicks, "corr": corr,
        "low": lo, "mid": mid, "high": hi, "growth": growth, "climb": climb,
        "centroid": centroid(mono, rate),
    }


def verdict(r):
    sparse = r["track"] in SPARSE
    fails = []
    if r["peak"] >= 0.99:
        fails.append("clip")
    if r["peak_db"] > LIMITS["peak_db"]:
        fails.append("peak")
    if not (LIMITS["rms_db_min"] <= r["rms_db"] <= LIMITS["rms_db_max"]) and not sparse:
        fails.append("rms")
    if r["silence"] > LIMITS["silence_s"] and not sparse:
        fails.append("silence")
    if r["dc"] > LIMITS["dc"]:
        fails.append("dc")
    if r["clicks"] > 0:
        fails.append("clicks")
    if r["crest"] < LIMITS["crest_db"]:
        fails.append("squashed")
    if r["corr"] > LIMITS["corr"]:
        fails.append("stereo")
    if r["high"] < 0.001 or r["low"] > 0.80:
        fails.append("spectrum")
    if r["growth"] > LIMITS["growth_db"] and r["climb"] >= LIMITS["climb"]:
        fails.append("stable")
    return fails


def main(argv=None):
    ap = argparse.ArgumentParser(description="Measure the rendered previews.")
    ap.add_argument("--dir", default=os.path.join(ROOT, "previews"))
    ap.add_argument("--verbose", action="store_true")
    a = ap.parse_args(argv)

    if not os.path.isdir(a.dir):
        print("no previews directory: %s\nrun tools/render_previews.py first"
              % a.dir, file=sys.stderr)
        return 1

    files = sorted(f for f in os.listdir(a.dir) if f.endswith(".wav"))
    if not files:
        print("no wavs in %s" % a.dir, file=sys.stderr)
        return 1

    # ---- are we even measuring the current code? ----------------------
    # A render that fails writes nothing, and an analysis of last hour's
    # files looks exactly like an analysis of this minute's -- same columns,
    # same verdicts, quietly describing code that no longer exists. Once was
    # enough: say so, loudly, rather than report a stale pass as a fix.
    engine_dir = os.path.join(ROOT, "js", "audio")
    newest_src, newest_name = 0.0, ""
    for dirpath, _dirnames, srcs in os.walk(engine_dir):
        for fn in srcs:
            if fn.endswith(".js"):
                m = os.path.getmtime(os.path.join(dirpath, fn))
                if m > newest_src:
                    newest_src, newest_name = m, fn
    stale = [f for f in files
             if os.path.getmtime(os.path.join(a.dir, f)) < newest_src]
    if stale:
        print("STALE: %d of %d preview(s) predate js/audio/%s."
              % (len(stale), len(files), newest_name))
        print("       re-render before trusting anything below:")
        for f in sorted(set(x.split("_")[0] for x in stale)):
            print("         " + f)
        print()

    rows = [analyse(os.path.join(a.dir, f)) for f in files]

    hdr = ("%-10s %5s  %8s %8s %6s %7s %6s %6s %6s   %5s %5s %5s  %7s  %s"
           % ("track", "at", "peak dB", "rms dB", "crest", "silence", "dc",
              "clicks", "corr", "low", "mid", "high", "drift", "result"))
    print(hdr)
    print("-" * len(hdr))

    bad = 0
    for r in rows:
        f = verdict(r)
        if f:
            bad += 1
        print("%-10s %4ds  %8.1f %8.1f %5.1f %6.1fs %6.4f %6d %6.3f   %.2f  %.2f  %.2f  %+6.1f  %s"
              % (r["track"], r["start"], r["peak_db"], r["rms_db"], r["crest"],
                 r["silence"], r["dc"], r["clicks"], r["corr"], r["low"],
                 r["mid"], r["high"], r["growth"], ", ".join(f) if f else "pass"))

    # ---- does each track actually go anywhere? -----------------------
    print()
    print("%-10s %-38s %s" % ("track", "0s window vs 240s window", "result"))
    print("-" * 74)

    evolve_bad = 0
    by_track = {}
    for r in rows:
        by_track.setdefault(r["track"], {})[r["start"]] = r

    for t, w in sorted(by_track.items()):
        if 0 not in w or 240 not in w:
            print("%-10s %-38s %s" % (t, "only one window rendered", "skipped"))
            continue
        a0, a4 = w[0], w[240]
        d_rms = abs(a4["rms_db"] - a0["rms_db"])
        d_cen = abs(a4["centroid"] - a0["centroid"])
        d_bal = (abs(a4["low"] - a0["low"]) + abs(a4["mid"] - a0["mid"])
                 + abs(a4["high"] - a0["high"]))
        moved = (d_rms > 1.0) or (d_cen > 120) or (d_bal > 0.06)
        if not moved:
            evolve_bad += 1
        print("%-10s rms %+5.1f dB  centroid %+6.0f Hz  balance %.3f   %s"
              % (t, a4["rms_db"] - a0["rms_db"], a4["centroid"] - a0["centroid"],
                 d_bal, "evolves" if moved else "LOOPS"))

    print()
    print("%d/%d windows pass, %d track(s) not evolving"
          % (len(rows) - bad, len(rows), evolve_bad))
    return 0 if (bad == 0 and evolve_bad == 0) else 1


if __name__ == "__main__":
    raise SystemExit(main())
