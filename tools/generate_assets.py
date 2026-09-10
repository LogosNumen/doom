#!/usr/bin/env python3
"""
generate_assets.py -- draw every image on the site, then crush it through dither.py.

Nothing here is traced, sampled or downloaded. Every asset is drawn from
arithmetic: masts, rings, noise fields, wireframes, test cards, needles. They
all leave through the same dither pipeline as photographs would, so a photo you
run through tools/dither.py lands in the same visual world as the generated art.

    python tools/generate_assets.py            # everything
    python tools/generate_assets.py mast wire  # just those

Output goes to img/. Animated assets also get a `_still` first frame for
prefers-reduced-motion.
"""

from __future__ import annotations

import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dither import dither_image  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(ROOT, "img")

SS = 2  # supersample factor: draw big, shrink, let the dither do the rest

# grey levels used while drawing, before quantisation
BLACK, DARK, MID, PALE, WHITE = 0, 46, 116, 196, 255


# --------------------------------------------------------------------------
# a 3x5 pixel font, drawn by hand in binary because shipping a font file for
# eleven characters on an 88x31 button would be absurd
# --------------------------------------------------------------------------

FONT = {
    "A": ("010", "101", "111", "101", "101"),
    "B": ("110", "101", "110", "101", "110"),
    "C": ("011", "100", "100", "100", "011"),
    "D": ("110", "101", "101", "101", "110"),
    "E": ("111", "100", "110", "100", "111"),
    "F": ("111", "100", "110", "100", "100"),
    "G": ("011", "100", "101", "101", "011"),
    "H": ("101", "101", "111", "101", "101"),
    "I": ("111", "010", "010", "010", "111"),
    "J": ("001", "001", "001", "101", "010"),
    "K": ("101", "101", "110", "101", "101"),
    "L": ("100", "100", "100", "100", "111"),
    "M": ("101", "111", "111", "101", "101"),
    "N": ("110", "101", "101", "101", "101"),
    "O": ("010", "101", "101", "101", "010"),
    "P": ("110", "101", "110", "100", "100"),
    "Q": ("010", "101", "101", "111", "011"),
    "R": ("110", "101", "110", "101", "101"),
    "S": ("011", "100", "010", "001", "110"),
    "T": ("111", "010", "010", "010", "010"),
    "U": ("101", "101", "101", "101", "111"),
    "V": ("101", "101", "101", "101", "010"),
    "W": ("101", "101", "111", "111", "101"),
    "X": ("101", "101", "010", "101", "101"),
    "Y": ("101", "101", "010", "010", "010"),
    "Z": ("111", "001", "010", "100", "111"),
    "0": ("111", "101", "101", "101", "111"),
    "1": ("010", "110", "010", "010", "111"),
    "2": ("110", "001", "010", "100", "111"),
    "3": ("111", "001", "011", "001", "111"),
    "4": ("101", "101", "111", "001", "001"),
    "5": ("111", "100", "110", "001", "110"),
    "6": ("011", "100", "110", "101", "010"),
    "7": ("111", "001", "010", "010", "010"),
    "8": ("010", "101", "010", "101", "010"),
    "9": ("010", "101", "011", "001", "110"),
    " ": ("000", "000", "000", "000", "000"),
    ".": ("000", "000", "000", "000", "010"),
    "-": ("000", "000", "111", "000", "000"),
    "/": ("001", "001", "010", "100", "100"),
    ":": ("000", "010", "000", "010", "000"),
}


def text_width(s: str, scale: int = 1) -> int:
    return (len(s) * 4 - 1) * scale


def draw_pixel_text(px, x: int, y: int, s: str, scale: int = 1, value: int = WHITE):
    """Stamp `s` into a PIL PixelAccess at 1:1, no antialiasing anywhere."""
    for ci, ch in enumerate(s.upper()):
        glyph = FONT.get(ch, FONT[" "])
        gx = x + ci * 4 * scale
        for ry, row in enumerate(glyph):
            for rx, bit in enumerate(row):
                if bit == "1":
                    for sy in range(scale):
                        for sx in range(scale):
                            px[gx + rx * scale + sx, y + ry * scale + sy] = value


# --------------------------------------------------------------------------
# small drawing helpers
# --------------------------------------------------------------------------


def frame(w: int, h: int, fill: int = BLACK, ss: int = SS):
    im = Image.new("L", (w * ss, h * ss), fill)
    return im, ImageDraw.Draw(im)


def noise_layer(w: int, h: int, seed: int, amount: float = 1.0, coarse: int = 1) -> np.ndarray:
    """A block of noise in 0..255. `coarse` makes the grain bigger than a pixel."""
    rng = np.random.default_rng(seed)
    small = rng.random((max(1, h // coarse) + 1, max(1, w // coarse) + 1))
    if coarse > 1:
        small = np.kron(small, np.ones((coarse, coarse)))
    return (small[:h, :w] * 255.0 * amount).astype(np.float64)


def to_rgb(im: Image.Image) -> Image.Image:
    return im.convert("RGB")


def lamp_mask(w: int, h: int, spots, ss: int = 1) -> Image.Image:
    """Build the accent mask: a white blob at each (x, y, r) in `spots`."""
    m = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(m)
    for (x, y, r) in spots:
        d.ellipse([x - r, y - r, x + r, y + r], fill=255)
    return m


def mast_shape(d: ImageDraw.ImageDraw, cx: float, base_y: float, top_y: float, half: float, ss: int):
    """A lattice mast: two legs, cross-braces, guy wires. Drawn in supersampled space."""
    lw = max(1, ss)
    left_b, right_b = cx - half, cx + half
    top_half = half * 0.16
    d.line([left_b, base_y, cx - top_half, top_y], fill=PALE, width=lw)
    d.line([right_b, base_y, cx + top_half, top_y], fill=PALE, width=lw)

    steps = 13
    for i in range(steps):
        t0 = i / steps
        t1 = (i + 1) / steps
        y0 = base_y + (top_y - base_y) * t0
        y1 = base_y + (top_y - base_y) * t1
        hw0 = half + (top_half - half) * t0
        hw1 = half + (top_half - half) * t1
        # horizontal tie
        d.line([cx - hw0, y0, cx + hw0, y0], fill=MID, width=lw)
        # alternating diagonal brace
        if i % 2 == 0:
            d.line([cx - hw0, y0, cx + hw1, y1], fill=MID, width=lw)
        else:
            d.line([cx + hw0, y0, cx - hw1, y1], fill=MID, width=lw)

    # guy wires
    d.line([cx, top_y + 2 * ss, cx - half * 3.1, base_y], fill=DARK, width=lw)
    d.line([cx, top_y + 2 * ss, cx + half * 3.1, base_y], fill=DARK, width=lw)
    # the pole above the lattice
    d.line([cx, top_y, cx, top_y - 8 * ss], fill=PALE, width=lw)


def stars(d: ImageDraw.ImageDraw, w: int, h: int, seed: int, n: int, ss: int, twinkle: float = 0.0):
    rng = np.random.default_rng(seed)
    for i in range(n):
        x = rng.random() * w * ss
        y = rng.random() * h * ss * 0.8
        v = MID if (i + int(twinkle * 7)) % 5 else PALE
        d.ellipse([x, y, x + ss - 1, y + ss - 1], fill=v)


# --------------------------------------------------------------------------
# assets
# --------------------------------------------------------------------------


def a_icon():
    """The small animated mast that sits under the header block. 64x56."""
    W, H, N = 64, 56, 8
    frames, masks = [], []
    for f in range(N):
        im, d = frame(W, H)
        stars(d, W, H, 11, 14, SS, twinkle=f / N)
        mast_shape(d, W / 2 * SS, (H - 6) * SS, 16 * SS, 9 * SS, SS)
        d.line([0, (H - 6) * SS, W * SS, (H - 6) * SS], fill=MID, width=SS)
        # expanding transmission arcs
        for k in range(3):
            phase = (f / N + k / 3.0) % 1.0
            r = (6 + phase * 26) * SS
            v = int(PALE * (1.0 - phase) ** 1.4)
            if v > 12:
                d.arc(
                    [W / 2 * SS - r, 8 * SS - r, W / 2 * SS + r, 8 * SS + r],
                    start=205,
                    end=335,
                    fill=v,
                    width=SS,
                )
        lit = f % 4 < 2
        frames.append(to_rgb(im))
        masks.append(lamp_mask(W, H, [(W // 2, 8, 1)] if lit else []))
    return frames, masks, dict(width=W, signal=True, mode="bayer4", fps=8)


def a_favicon(size: int, out: str):
    """A mast in a box, small enough to be a rumour. Static."""
    ss = 4
    im = Image.new("L", (size * ss, size * ss), BLACK)
    d = ImageDraw.Draw(im)
    cx = size / 2 * ss
    base = (size - 2) * ss
    top = 4 * ss
    d.line([cx - 3.4 * ss, base, cx - 0.4 * ss, top], fill=PALE, width=ss)
    d.line([cx + 3.4 * ss, base, cx + 0.4 * ss, top], fill=PALE, width=ss)
    for i in range(4):
        t = i / 4.0
        y = base + (top - base) * t
        hw = (3.4 + (0.4 - 3.4) * t) * ss
        d.line([cx - hw, y, cx + hw, y], fill=MID, width=ss)
    d.line([0, base, size * ss, base], fill=MID, width=ss)
    mask = lamp_mask(size, size, [(size // 2, 2, 0)])
    dither_image(
        [to_rgb(im)],
        out,
        width=size,
        palette="site",
        signal=True,
        mode="bayer4",
        accent=mask,
        write_still=False,
    )


def a_btn():
    """The 88x31. Drawn at 1:1 -- no supersampling, no resize, no mercy."""
    W, H, N = 88, 31, 6
    frames, masks = [], []
    for f in range(N):
        im = Image.new("L", (W, H), BLACK)
        d = ImageDraw.Draw(im)
        d.rectangle([0, 0, W - 1, H - 1], outline=MID)
        # a faint dither ground so the button has texture, not flat black
        px = im.load()
        rng = np.random.default_rng(900 + f)
        for y in range(2, H - 2):
            for x in range(2, W - 2):
                if rng.random() < 0.055:
                    px[x, y] = DARK
        big = "DEAD AIR"
        small = "NIGHT LISTENERS"
        draw_pixel_text(px, (W - text_width(big, 2)) // 2, 5, big, 2, WHITE)
        draw_pixel_text(px, (W - text_width(small, 1)) // 2, 19, small, 1, MID)
        # a scanline that walks down the button
        sy = 2 + (f * 5) % (H - 5)
        for x in range(2, W - 2):
            if px[x, sy] == BLACK:
                px[x, sy] = DARK
        frames.append(to_rgb(im))
        lit = f % 3 == 0
        masks.append(lamp_mask(W, H, [(W - 5, 4, 1)] if lit else []))
    return frames, masks, dict(width=None, signal=True, mode="none", fps=5)


def a_testcard():
    """A test card for a channel with nobody behind it. 192x144."""
    W, H, N = 192, 144, 6
    frames, masks = [], []
    for f in range(N):
        im, d = frame(W, H)
        w, h = W * SS, H * SS
        cx, cy = w / 2, h / 2
        # grid
        for gx in range(0, W + 1, 16):
            d.line([gx * SS, 0, gx * SS, h], fill=DARK, width=SS)
        for gy in range(0, H + 1, 16):
            d.line([0, gy * SS, w, gy * SS], fill=DARK, width=SS)
        # circle and crosshair
        r = min(w, h) * 0.42
        d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=PALE, width=SS)
        d.ellipse([cx - r * 0.5, cy - r * 0.5, cx + r * 0.5, cy + r * 0.5], outline=MID, width=SS)
        d.line([cx, cy - r * 0.22, cx, cy + r * 0.22], fill=WHITE, width=SS)
        d.line([cx - r * 0.22, cy, cx + r * 0.22, cy], fill=WHITE, width=SS)
        # grey ramp along the bottom
        bars = 6
        for i in range(bars):
            v = int(BLACK + (WHITE - BLACK) * i / (bars - 1))
            x0 = w * 0.16 + (w * 0.68) * i / bars
            x1 = w * 0.16 + (w * 0.68) * (i + 1) / bars
            d.rectangle([x0, h * 0.80, x1 - SS, h * 0.90], fill=v)
        # corner registration marks
        for (mx, my) in [(0.06, 0.06), (0.94, 0.06), (0.06, 0.94), (0.94, 0.94)]:
            d.line([mx * w - 5 * SS, my * h, mx * w + 5 * SS, my * h], fill=PALE, width=SS)
            d.line([mx * w, my * h - 5 * SS, mx * w, my * h + 5 * SS], fill=PALE, width=SS)
        # the frame counter, in the pixel font, after downscale would blur --
        # so it is drawn onto the small image instead, further down
        small = im.resize((W, H), Image.LANCZOS)
        px = small.load()
        draw_pixel_text(px, 8, 6, "NO SOURCE", 1, PALE)
        draw_pixel_text(px, W - text_width("%02d" % ((f * 7) % 60), 1) - 8, 6, "%02d" % ((f * 7) % 60), 1, MID)
        # a roll bar creeping up the card
        arr = np.asarray(small, dtype=np.float64)
        band = int((H - (f * H / N)) % H)
        for k in range(6):
            arr[(band + k) % H] = np.clip(arr[(band + k) % H] * 1.5 + 18, 0, 255)
        arr += noise_layer(W, H, 300 + f, 0.09)
        small = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "L")
        frames.append(to_rgb(small))
        masks.append(lamp_mask(W, H, [(W - 12, H - 12, 2)] if f % 2 == 0 else []))
    return frames, masks, dict(width=None, signal=True, mode="bayer8", fps=5)


def a_mast():
    """Relay nine, from the road. 168x160."""
    W, H, N = 168, 160, 8
    frames, masks = [], []
    for f in range(N):
        im, d = frame(W, H)
        stars(d, W, H, 4, 40, SS, twinkle=f / N)
        # a low horizon glow
        d.rectangle([0, (H - 18) * SS, W * SS, H * SS], fill=DARK)
        mast_shape(d, W / 2 * SS, (H - 18) * SS, 24 * SS, 22 * SS, SS)
        d.line([0, (H - 18) * SS, W * SS, (H - 18) * SS], fill=MID, width=SS)
        small = im.resize((W, H), Image.LANCZOS)
        arr = np.asarray(small, dtype=np.float64) + noise_layer(W, H, 500 + f, 0.10)
        small = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "L")
        frames.append(to_rgb(small))
        lit = f % 5 < 2
        masks.append(lamp_mask(W, H, [(W // 2, 16, 2)] if lit else []))
    return frames, masks, dict(width=None, signal=True, mode="bayer8", fps=6)


def a_static():
    """A burst. 176x132."""
    W, H, N = 176, 132, 8
    frames = []
    for f in range(N):
        arr = noise_layer(W, H, 700 + f, 1.0)
        arr = np.clip((arr - 128) * 1.9 + 128, 0, 255)
        # a couple of torn horizontal bands, offset per frame
        rng = np.random.default_rng(770 + f)
        for _ in range(3):
            y = rng.integers(0, H - 4)
            th = int(rng.integers(2, 7))
            shift = int(rng.integers(-24, 24))
            arr[y : y + th] = np.roll(arr[y : y + th], shift, axis=1) * 1.25
        frames.append(to_rgb(Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "L")))
    return frames, None, dict(width=None, palette="1bit", mode="bayer4", fps=12)


def a_snow():
    """Dead channel. Softer than a burst, and it never stops. 192x144."""
    W, H, N = 192, 144, 8
    frames = []
    for f in range(N):
        arr = noise_layer(W, H, 800 + f, 1.0, coarse=2) * 0.55 + 34
        # a slow diagonal drift band
        yy, xx = np.mgrid[0:H, 0:W]
        drift = np.sin((yy * 0.06 + xx * 0.012 + f * 0.7)) * 16
        arr = arr + drift
        arr[::2] *= 0.72  # scanlines
        frames.append(to_rgb(Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "L")))
    return frames, None, dict(width=None, palette="greys", colors=4, mode="bayer8", fps=10)


def a_wire():
    """A wireframe octahedron, turning. Nobody built it for anything. 160x160."""
    W, H, N = 160, 160, 12
    verts = [(0, 1, 0), (0, -1, 0), (1, 0, 0), (-1, 0, 0), (0, 0, 1), (0, 0, -1)]
    edges = [
        (0, 2), (0, 3), (0, 4), (0, 5),
        (1, 2), (1, 3), (1, 4), (1, 5),
        (2, 4), (4, 3), (3, 5), (5, 2),
    ]
    frames = []
    for f in range(N):
        im, d = frame(W, H)
        ay = f / N * math.tau
        ax = math.sin(ay) * 0.42
        pts = []
        for (x, y, z) in verts:
            # rotate about Y then X
            x2 = x * math.cos(ay) + z * math.sin(ay)
            z2 = -x * math.sin(ay) + z * math.cos(ay)
            y2 = y * math.cos(ax) - z2 * math.sin(ax)
            z3 = y * math.sin(ax) + z2 * math.cos(ax)
            s = 52 * SS
            pts.append((W / 2 * SS + x2 * s, H / 2 * SS - y2 * s, z3))
        for (a, b) in edges:
            (xa, ya, za), (xb, yb, zb) = pts[a], pts[b]
            depth = (za + zb) / 2.0
            v = int(MID + (WHITE - MID) * (depth + 1) / 2.0)
            d.line([xa, ya, xb, yb], fill=v, width=SS)
        for (x, y, z) in pts:
            d.ellipse([x - 2 * SS, y - 2 * SS, x + 2 * SS, y + 2 * SS], fill=WHITE)
        small = im.resize((W, H), Image.LANCZOS)
        arr = np.asarray(small, dtype=np.float64)
        arr[::2] *= 0.8
        frames.append(to_rgb(Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "L")))
    return frames, None, dict(width=None, palette="greys", colors=4, mode="bayer4", fps=10)


def a_wave():
    """A waveform scrolling past. It is not carrying anything. 240x64."""
    W, H, N = 240, 64, 16
    frames = []
    span = W * 2
    xs = np.arange(span)
    base = (
        np.sin(xs * 0.055) * 0.44
        + np.sin(xs * 0.017 + 1.1) * 0.30
        + np.sin(xs * 0.131 + 2.4) * 0.13
    )
    rng = np.random.default_rng(4242)
    base = base + rng.normal(0, 0.045, span)
    for f in range(N):
        im, d = frame(W, H)
        w, h = W * SS, H * SS
        d.line([0, h / 2, w, h / 2], fill=DARK, width=SS)
        for gx in range(0, W + 1, 20):
            d.line([gx * SS, h / 2 - 3 * SS, gx * SS, h / 2 + 3 * SS], fill=DARK, width=SS)
        off = int(f * span / (2 * N))
        prev = None
        for x in range(W):
            v = base[(x + off) % span]
            y = h / 2 - v * h * 0.40
            if prev is not None:
                d.line([(x - 1) * SS, prev, x * SS, y], fill=PALE, width=SS)
            prev = y
        small = im.resize((W, H), Image.LANCZOS)
        frames.append(to_rgb(small))
    return frames, None, dict(width=None, palette="greys", colors=3, mode="bayer4", fps=14)


def a_carrier():
    """The big one, for carrier.html. A mast still radiating into nothing. 288x216."""
    W, H, N = 288, 216, 10
    frames, masks = [], []
    for f in range(N):
        im, d = frame(W, H)
        w, h = W * SS, H * SS
        stars(d, W, H, 9, 55, SS, twinkle=f / N)
        lamp_x, lamp_y = W / 2, 30
        # rings leaving the lamp
        for k in range(5):
            phase = (f / N + k / 5.0) % 1.0
            r = (8 + phase * 150) * SS
            v = int(PALE * (1.0 - phase) ** 1.7)
            if v > 10:
                d.ellipse(
                    [lamp_x * SS - r, lamp_y * SS - r, lamp_x * SS + r, lamp_y * SS + r],
                    outline=v,
                    width=SS,
                )
        d.rectangle([0, (H - 26) * SS, w, h], fill=DARK)
        mast_shape(d, lamp_x * SS, (H - 26) * SS, lamp_y * SS, 26 * SS, SS)
        d.line([0, (H - 26) * SS, w, (H - 26) * SS], fill=MID, width=SS)
        small = im.resize((W, H), Image.LANCZOS)
        arr = np.asarray(small, dtype=np.float64)
        arr[::2] *= 0.62
        arr += noise_layer(W, H, 1000 + f, 0.13)
        small = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "L")
        frames.append(to_rgb(small))
        lit = f % 5 < 3
        masks.append(lamp_mask(W, H, [(int(lamp_x), int(lamp_y), 3)] if lit else []))
    return frames, masks, dict(width=None, signal=True, mode="bayer8", fps=6)


def a_dial():
    """A tuning dial being swept by nobody. 208x56."""
    W, H, N = 208, 56, 14
    frames, masks = [], []
    for f in range(N):
        im, d = frame(W, H)
        w, h = W * SS, H * SS
        d.rectangle([2 * SS, 2 * SS, w - 2 * SS, h - 2 * SS], outline=MID, width=SS)
        for i in range(41):
            x = 8 * SS + (w - 16 * SS) * i / 40
            tall = 9 if i % 5 == 0 else 5
            d.line([x, 8 * SS, x, (8 + tall) * SS], fill=PALE if i % 5 == 0 else MID, width=SS)
        # needle sweeps back and forth
        t = 0.5 - 0.5 * math.cos(f / N * math.tau)
        nx = 8 * SS + (w - 16 * SS) * t
        d.line([nx, 6 * SS, nx, (H - 16) * SS], fill=WHITE, width=SS)
        # signal strength trace along the bottom
        prev = None
        for x in range(8, W - 8):
            u = (x - 8) / (W - 16)
            strength = 0.0
            for (pos, amp, wide) in [(0.18, 0.9, 0.02), (0.47, 0.5, 0.014), (0.79, 0.7, 0.03)]:
                strength += amp * math.exp(-((u - pos) ** 2) / (2 * wide ** 2))
            strength *= 0.55 + 0.45 * math.sin(f * 0.9 + x * 0.3)
            y = (H - 6) * SS - strength * 10 * SS
            if prev is not None:
                d.line([(x - 1) * SS, prev, x * SS, y], fill=PALE, width=SS)
            prev = y
        small = im.resize((W, H), Image.LANCZOS)
        px = small.load()
        for (u, label) in [(0.10, "4625"), (0.44, "6840"), (0.78, "9330")]:
            draw_pixel_text(px, int(8 + (W - 16) * u), H - 32, label, 1, MID)
        frames.append(to_rgb(small))
        # the lock lamp: lit only while the needle sits on a peak
        near = any(abs(t - p) < 0.05 for p in (0.18, 0.47, 0.79))
        masks.append(lamp_mask(W, H, [(W - 9, 8, 2)] if near else []))
    return frames, masks, dict(width=None, signal=True, mode="bayer4", fps=12)


def a_meter():
    """A needle with nothing to measure. 128x40."""
    W, H, N = 128, 40, 12
    rng = np.random.default_rng(31337)
    levels = np.abs(rng.normal(0, 0.30, N)) * 0.8
    frames, masks = [], []
    for f in range(N):
        im, d = frame(W, H)
        w, h = W * SS, H * SS
        cx, cy = w / 2, h * 1.35
        r = h * 1.05
        for i in range(11):
            a = math.radians(238 + 64 * i / 10)
            x0, y0 = cx + math.cos(a) * r, cy + math.sin(a) * r
            x1, y1 = cx + math.cos(a) * (r - 5 * SS), cy + math.sin(a) * (r - 5 * SS)
            d.line([x0, y0, x1, y1], fill=PALE if i > 7 else MID, width=SS)
        lv = levels[f]
        a = math.radians(238 + 64 * min(1.0, lv))
        d.line([cx, cy, cx + math.cos(a) * (r - 2 * SS), cy + math.sin(a) * (r - 2 * SS)],
               fill=WHITE, width=SS)
        d.rectangle([SS, SS, w - SS, h - SS], outline=DARK, width=SS)
        small = im.resize((W, H), Image.LANCZOS)
        px = small.load()
        draw_pixel_text(px, 5, 4, "VU", 1, MID)
        frames.append(to_rgb(small))
        masks.append(lamp_mask(W, H, [(W - 8, 6, 1)] if lv > 0.62 else []))
    return frames, masks, dict(width=None, signal=True, mode="bayer4", fps=10)


def a_horizon():
    """Sea, a horizon, and one light that is not a star. 224x88."""
    W, H, N = 224, 88, 10
    frames, masks = [], []
    hz = 34
    for f in range(N):
        im, d = frame(W, H)
        w = W * SS
        stars(d, W, hz, 21, 26, SS, twinkle=f / N)
        d.line([0, hz * SS, w, hz * SS], fill=MID, width=SS)
        # water: rows of dashes that shuffle each frame
        rng = np.random.default_rng(600 + f)
        for row in range(hz + 2, H, 2):
            depth = (row - hz) / (H - hz)
            n = int(6 + depth * 26)
            for _ in range(n):
                x = rng.random() * W
                ln = 1 + depth * 5
                v = int(DARK + (PALE - DARK) * depth * 0.8)
                d.line([x * SS, row * SS, (x + ln) * SS, row * SS], fill=v, width=SS)
        small = im.resize((W, H), Image.LANCZOS)
        arr = np.asarray(small, dtype=np.float64) + noise_layer(W, H, 640 + f, 0.07)
        small = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "L")
        frames.append(to_rgb(small))
        lit = f % 6 < 2
        masks.append(lamp_mask(W, H, [(int(W * 0.72), hz - 2, 1)] if lit else []))
    return frames, masks, dict(width=None, signal=True, mode="bayer8", fps=5)


# --------------------------------------------------------------------------
# registry + main
# --------------------------------------------------------------------------

ASSETS = {
    "icon": (a_icon, "icon.gif"),
    "btn": (a_btn, "btn.gif"),
    "testcard": (a_testcard, "testcard.gif"),
    "mast": (a_mast, "mast.gif"),
    "static": (a_static, "static.gif"),
    "snow": (a_snow, "snow.gif"),
    "wire": (a_wire, "wire.gif"),
    "wave": (a_wave, "wave.gif"),
    "carrier": (a_carrier, "carrier.gif"),
    "dial": (a_dial, "dial.gif"),
    "meter": (a_meter, "meter.gif"),
    "horizon": (a_horizon, "horizon.gif"),
}


def build(name: str):
    fn, out = ASSETS[name]
    frames, masks, opts = fn()
    dither_image(frames, os.path.join(IMG, out), accent=masks, **opts)


def main(argv=None):
    argv = list(argv if argv is not None else sys.argv[1:])
    os.makedirs(IMG, exist_ok=True)
    wanted = argv or (list(ASSETS) + ["favicon"])
    print("generating into %s" % os.path.relpath(IMG, ROOT))
    for name in wanted:
        if name == "favicon":
            a_favicon(16, os.path.join(IMG, "favicon.gif"))
            a_favicon(32, os.path.join(IMG, "favicon32.gif"))
            continue
        if name not in ASSETS:
            print("  unknown asset: %s" % name, file=sys.stderr)
            continue
        build(name)
    total = sum(
        os.path.getsize(os.path.join(IMG, f)) for f in os.listdir(IMG) if f.endswith(".gif")
    )
    print("img/ total: %.1f KB" % (total / 1024.0))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
