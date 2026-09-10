#!/usr/bin/env python3
"""
dither.py -- turn any image or GIF into the Dead Air look.

Crushes an image down to a small, low-colour, dithered GIF: the grain and the
banding are the point, not an accident. Animation frames are preserved, and a
static first frame is written alongside every animation so that
`prefers-reduced-motion` has something to swap in.

Usage
-----
    python tools/dither.py me.jpg img/me.gif --width 240 --colors 4 --mode bayer8
    python tools/dither.py clip.gif img/clip.gif --width 200 --palette site --noise 0.05
    python tools/dither.py photo.png img/photo.gif --width 180 --palette 1bit --scanlines

Options
-------
    --width N        resize so the long edge is N px (aspect preserved)
    --palette KIND   1bit | greys | site        (default: site)
    --colors N       number of grey levels when --palette greys (default 4)
    --mode MODE      floyd-steinberg | bayer4 | bayer8   (default floyd-steinberg)
    --noise F        0..1, film grain added before dithering (default 0)
    --scanlines      darken every other row before dithering
    --gamma F        gamma applied to luminance before dithering (default 1.0)
    --contrast F     contrast multiplier around mid grey (default 1.0)
    --fps N          frames per second for animated output (default: keep source)
    --no-still       do not write the static first frame
    --quiet          no output

This module is also imported by tools/generate_assets.py, which is why the
useful parts are plain functions rather than buried in main().
"""

from __future__ import annotations

import argparse
import os
import sys

import numpy as np
from PIL import Image, ImageSequence

# --------------------------------------------------------------------------
# palettes
# --------------------------------------------------------------------------

# The site tokens, as RGB. Kept in one place so the images and the CSS agree.
BG = (0x00, 0x00, 0x00)   # --bg
INK = (0x1c, 0x1a, 0x17)  # --ink
DIM = (0x6b, 0x67, 0x5e)  # --dim
FG = (0xc8, 0xc3, 0xb4)   # --fg
SIG = (0xb4, 0x50, 0x3c)  # --sig

SITE_PALETTE = [BG, INK, DIM, FG]
SITE_PALETTE_SIG = [BG, INK, DIM, FG, SIG]


def luminance(rgb) -> float:
    r, g, b = rgb
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255.0


def build_palette(kind: str = "site", colors: int = 4, signal: bool = False):
    """Return a list of RGB tuples, sorted dark -> light."""
    kind = kind.lower()
    if kind in ("1bit", "1-bit", "mono"):
        pal = [BG, FG]
    elif kind in ("site", "dead-air"):
        pal = list(SITE_PALETTE_SIG if signal else SITE_PALETTE)
    elif kind in ("greys", "grays", "grey", "gray"):
        n = max(2, int(colors))
        pal = []
        for i in range(n):
            t = i / (n - 1)
            # interpolate along the site ramp rather than pure grey, so the
            # greys stay warm and match the text colour
            pal.append(
                (
                    round(BG[0] + (FG[0] - BG[0]) * t),
                    round(BG[1] + (FG[1] - BG[1]) * t),
                    round(BG[2] + (FG[2] - BG[2]) * t),
                )
            )
    else:
        raise ValueError("unknown palette: %s (want 1bit, greys or site)" % kind)

    # a signal-red entry is appended, not interpolated -- it is a lamp, not a tone
    if signal and SIG not in pal:
        pal = pal + [SIG]
    return sorted(pal, key=luminance)


# --------------------------------------------------------------------------
# ordered dither matrices
# --------------------------------------------------------------------------


def bayer_matrix(n: int) -> np.ndarray:
    """Normalised Bayer threshold matrix of size n x n (n must be a power of 2)."""
    m = np.array([[0]], dtype=np.float64)
    size = 1
    while size < n:
        m = np.block(
            [
                [4 * m + 0, 4 * m + 2],
                [4 * m + 3, 4 * m + 1],
            ]
        )
        size *= 2
    return m / (size * size)


BAYER = {"bayer4": bayer_matrix(4), "bayer8": bayer_matrix(8), "bayer2": bayer_matrix(2)}


# --------------------------------------------------------------------------
# the dither itself
# --------------------------------------------------------------------------


def _nearest_level(value: float, levels: np.ndarray) -> int:
    return int(np.argmin(np.abs(levels - value)))


def dither_array(lum: np.ndarray, levels: np.ndarray, mode: str = "floyd-steinberg") -> np.ndarray:
    """
    lum:    float array in 0..1
    levels: sorted float array of palette luminances in 0..1
    returns: int array of palette indices
    """
    h, w = lum.shape
    mode = mode.lower()

    if mode in BAYER:
        m = BAYER[mode]
        tile = np.tile(m, (h // m.shape[0] + 1, w // m.shape[1] + 1))[:h, :w]
        spread = 1.0 / max(1, (len(levels) - 1))
        shifted = np.clip(lum + (tile - 0.5) * spread, 0.0, 1.0)
        # nearest level, vectorised
        idx = np.abs(shifted[..., None] - levels[None, None, :]).argmin(axis=-1)
        return idx.astype(np.int32)

    if mode in ("floyd-steinberg", "fs", "floyd"):
        buf = lum.astype(np.float64).copy()
        out = np.zeros((h, w), dtype=np.int32)
        for y in range(h):
            for x in range(w):
                old = buf[y, x]
                i = _nearest_level(old, levels)
                out[y, x] = i
                err = old - levels[i]
                if x + 1 < w:
                    buf[y, x + 1] += err * 7 / 16
                if y + 1 < h:
                    if x > 0:
                        buf[y + 1, x - 1] += err * 3 / 16
                    buf[y + 1, x] += err * 5 / 16
                    if x + 1 < w:
                        buf[y + 1, x + 1] += err * 1 / 16
        return out

    if mode in ("none", "flat"):
        idx = np.abs(lum[..., None] - levels[None, None, :]).argmin(axis=-1)
        return idx.astype(np.int32)

    raise ValueError("unknown mode: %s" % mode)


def process_frame(
    frame: Image.Image,
    palette,
    mode: str = "floyd-steinberg",
    noise: float = 0.0,
    scanlines: bool = False,
    gamma: float = 1.0,
    contrast: float = 1.0,
    rng: np.random.Generator | None = None,
    accent: Image.Image | None = None,
) -> Image.Image:
    """
    Dither a single RGB frame down to `palette`. Returns a P-mode image.

    `accent` is an optional 'L' mask, already resized to match the frame. Where
    it is bright, the output is forced to the accent entry in the palette. The
    ditherer maps by luminance alone, and the signal red happens to sit at almost
    exactly the same luminance as the mid grey -- so a lamp drawn as a colour
    would simply dissolve into the greys. A lamp is a lamp, not a tone, so it
    gets stamped in afterwards.
    """
    rgb = np.asarray(frame.convert("RGB"), dtype=np.float64) / 255.0
    lum = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]

    if contrast != 1.0:
        lum = np.clip((lum - 0.5) * contrast + 0.5, 0.0, 1.0)
    if gamma != 1.0:
        lum = np.clip(lum, 0.0, 1.0) ** gamma
    if scanlines:
        lum[1::2] *= 0.55
    if noise > 0:
        rng = rng or np.random.default_rng(0xDEAD)
        lum = np.clip(lum + rng.normal(0.0, noise, lum.shape), 0.0, 1.0)

    # The accent is a lamp, not a step on the ramp. Its luminance happens to land
    # within a hair of the mid grey, so leaving it in the tone ramp makes every
    # mid-grey edge on the page dither into red speckle. Tones are mapped against
    # the greys only; the accent is stamped in afterwards, from the mask.
    tones = [c for c in palette if c != SIG]
    levels = np.array([luminance(c) for c in tones], dtype=np.float64)
    tone_idx = dither_array(np.clip(lum, 0.0, 1.0), levels, mode)

    lookup = np.array([palette.index(c) for c in tones], dtype=np.int32)
    idx = lookup[tone_idx]

    if accent is not None and SIG in palette:
        m = np.asarray(accent.convert("L").resize(frame.size, Image.LANCZOS))
        idx[m > 127] = palette.index(SIG)

    out = Image.fromarray(idx.astype(np.uint8), mode="P")
    flat = []
    for c in palette:
        flat.extend(c)
    flat.extend([0, 0, 0] * (256 - len(palette)))
    out.putpalette(flat)
    return out


def _resize(frame: Image.Image, width: int | None) -> Image.Image:
    if not width:
        return frame
    w, h = frame.size
    if w >= h:
        nw, nh = width, max(1, round(h * width / w))
    else:
        nh, nw = width, max(1, round(w * width / h))
    return frame.resize((nw, nh), Image.LANCZOS)


def still_path(out_path: str) -> str:
    """Path of the static first frame that sits beside an animated GIF."""
    root, ext = os.path.splitext(out_path)
    return root + "_still" + (ext or ".gif")


def dither_image(
    src,
    out_path: str,
    width: int | None = None,
    palette: str = "site",
    colors: int = 4,
    mode: str = "floyd-steinberg",
    noise: float = 0.0,
    scanlines: bool = False,
    gamma: float = 1.0,
    contrast: float = 1.0,
    signal: bool = False,
    fps: float | None = None,
    write_still: bool = True,
    quiet: bool = False,
    accent=None,
):
    """
    src may be a path, a PIL Image, or a list of PIL Images (an animation).
    Writes an optimised GIF and, for animations, a static first frame.

    `accent` is an optional 'L' mask -- one image, or one per frame -- marking
    where the signal red should be stamped in after dithering. See process_frame.
    """
    pal = build_palette(palette, colors, signal=signal) if isinstance(palette, str) else palette

    durations = None
    if isinstance(src, list):
        frames = src
    elif isinstance(src, Image.Image):
        frames = [src]
    else:
        im = Image.open(src)
        frames = []
        durations = []
        for f in ImageSequence.Iterator(im):
            frames.append(f.convert("RGB"))
            durations.append(f.info.get("duration", 100))

    if accent is None:
        masks = [None] * len(frames)
    elif isinstance(accent, list):
        masks = accent
    else:
        masks = [accent] * len(frames)

    rng = np.random.default_rng(0xDEAD)
    done = []
    for f, m in zip(frames, masks):
        done.append(
            process_frame(
                _resize(f, width),
                pal,
                mode=mode,
                noise=noise,
                scanlines=scanlines,
                gamma=gamma,
                contrast=contrast,
                rng=rng,
                accent=m,
            )
        )

    os.makedirs(os.path.dirname(os.path.abspath(out_path)) or ".", exist_ok=True)

    if len(done) == 1:
        done[0].save(out_path, "GIF", optimize=True)
        if not quiet:
            _report(out_path)
        return out_path

    if fps:
        durations = [max(20, round(1000.0 / fps))] * len(done)
    elif not durations:
        durations = [100] * len(done)

    done[0].save(
        out_path,
        "GIF",
        save_all=True,
        append_images=done[1:],
        duration=durations,
        loop=0,
        optimize=True,
        disposal=1,
    )
    if write_still:
        sp = still_path(out_path)
        done[0].save(sp, "GIF", optimize=True)
        if not quiet:
            _report(sp)
    if not quiet:
        _report(out_path)
    return out_path


def _report(path: str):
    size = os.path.getsize(path)
    warn = "   <-- over 150 KB" if size > 150 * 1024 else ""
    print("  %-40s %7.1f KB%s" % (os.path.relpath(path), size / 1024.0, warn))


# --------------------------------------------------------------------------
# cli
# --------------------------------------------------------------------------


def main(argv=None):
    p = argparse.ArgumentParser(
        description="Turn an image or GIF into the Dead Air look.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="example:\n"
        "  python tools/dither.py me.jpg img/me.gif --width 240 --colors 4 --mode bayer8\n",
    )
    p.add_argument("src", help="source image or GIF")
    p.add_argument("out", help="destination .gif")
    p.add_argument("--width", type=int, default=None, help="long-edge width in px")
    p.add_argument("--palette", default="site", choices=["1bit", "greys", "site"])
    p.add_argument("--colors", type=int, default=4, help="grey levels when --palette greys")
    p.add_argument(
        "--mode", default="floyd-steinberg", choices=["floyd-steinberg", "bayer4", "bayer8", "none"]
    )
    p.add_argument("--noise", type=float, default=0.0, help="0..1 grain before dithering")
    p.add_argument("--scanlines", action="store_true", help="darken every other row")
    p.add_argument("--gamma", type=float, default=1.0)
    p.add_argument("--contrast", type=float, default=1.0)
    p.add_argument("--signal", action="store_true", help="add the accent red to the palette")
    p.add_argument("--fps", type=float, default=None)
    p.add_argument("--no-still", dest="still", action="store_false")
    p.add_argument("--quiet", action="store_true")
    a = p.parse_args(argv)

    if not os.path.exists(a.src):
        print("no such file: %s" % a.src, file=sys.stderr)
        return 1

    dither_image(
        a.src,
        a.out,
        width=a.width,
        palette=a.palette,
        colors=a.colors,
        mode=a.mode,
        noise=a.noise,
        scanlines=a.scanlines,
        gamma=a.gamma,
        contrast=a.contrast,
        signal=a.signal,
        fps=a.fps,
        write_still=a.still,
        quiet=a.quiet,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
