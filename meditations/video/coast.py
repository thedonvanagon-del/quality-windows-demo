"""Paint a soft-focus Santa Barbara style coast: mountains behind a curving beach, palms, a pier.

Usage: python3 coast.py OUT.png

This is a painted scene blurred like an out-of-focus photo, not a photograph.
To use a real photo instead, pass it straight to compose.py --bg (blur it first).
"""
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

W, H = 1080, 1920
HZ = 800          # horizon y
rng = np.random.default_rng(5)


def vgrad(top, bottom, y0, y1):
    img = Image.new("RGB", (W, H))
    arr = np.zeros((H, W, 3), np.float32)
    t = np.clip((np.arange(H) - y0) / (y1 - y0), 0, 1)[:, None, None]
    arr[:] = np.array(top, np.float32) * (1 - t) + np.array(bottom, np.float32) * t
    return arr


def shore_x(y):
    """Shoreline: far away at the horizon on the right, sweeping to the near left."""
    t = np.clip((y - HZ) / (H - HZ), 0, 1)
    return 700 - 640 * t ** 0.55


def ridge(n, base, height, rough, seed):
    r = np.random.default_rng(seed)
    x = np.linspace(0, 1, n)
    y = np.zeros(n)
    for k, a in [(1.5, 1.0), (3.1, 0.55), (6.7, 0.3), (13, 0.16), (29, 0.07)]:
        y += a * np.sin(k * x * 6.28 + r.uniform(0, 6.28))
    y = (y - y.min()) / (y.max() - y.min())
    return base - height * (0.35 + 0.65 * y) * rough


def main():
    out = sys.argv[1]
    # sky: soft blue down to warm morning haze
    arr = vgrad((104, 150, 205), (246, 214, 186), 0, HZ)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    sun = np.exp(-(((xx - 860) / 420) ** 2 + ((yy - 640) / 300) ** 2))
    arr += sun[..., None] * np.array([40, 30, 5], np.float32)

    # sea: hazy at the horizon, deeper blue-green up close
    sea = vgrad((168, 196, 208), (36, 104, 128), HZ, H)
    glit = np.exp(-((xx - 860) / 150) ** 2) * np.clip(1.3 - (yy - HZ) / 700, 0, 1)
    sea += glit[..., None] * np.array([70, 60, 40], np.float32)
    arr = np.where((yy >= HZ)[..., None], sea, arr)
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(img)

    # Santa Ynez mountains: a far hazy ridge, then nearer foothills, dropping toward the sea on the right
    xs = np.linspace(0, 1000, 240)
    fall = np.clip(1 - (xs / 1000) ** 2.2, 0, 1)
    far = HZ - (ridge(240, 0, -1, 1, 1) * 300) * fall
    d.polygon([(0, HZ)] + list(zip(xs, far)) + [(1000, HZ)], fill=(128, 134, 164))
    near = HZ - (ridge(240, 0, -1, 1, 2) * 170) * np.clip(1 - (xs / 900) ** 2, 0, 1)
    d.polygon([(0, HZ)] + list(zip(xs, near)) + [(1000, HZ)], fill=(104, 118, 112))

    # land: town and trees at the foot of the hills, then sand
    ys = np.arange(HZ, H, 4)
    sx = shore_x(ys)
    d.polygon([(0, HZ - 14)] + [(float(x), float(y)) for x, y in zip(sx, ys)] + [(0, H)], fill=(206, 182, 148))
    d.polygon([(0, HZ - 26), (720, HZ - 10), (700, HZ + 6)] +
              [(float(shore_x(y) - 60 - (y - HZ) * 1.5), float(y)) for y in range(HZ + 6, HZ + 130, 4)] + [(0, HZ + 150)],
              fill=(112, 128, 104))
    # terracotta roofs and white walls, as specks
    for _ in range(90):
        x, y = rng.uniform(0, 600), rng.uniform(HZ - 22, HZ + 70)
        if x < shore_x(y) - 90:
            c = (196, 120, 90) if rng.random() < 0.5 else (232, 224, 210)
            d.rectangle((x, y, x + rng.uniform(8, 20), y + rng.uniform(5, 10)), fill=c)

    # wet sand and surf lines hugging the shore
    for off, wdt, col in [(0, 70, (150, 138, 124)), (26, 26, (236, 240, 240)), (70, 16, (214, 230, 232)), (118, 12, (190, 216, 222))]:
        pts_a, pts_b = [], []
        for y in ys:
            s = (y - HZ) / (H - HZ)
            x = shore_x(y) + off * (0.15 + 1.6 * s) + 10 * np.sin(y / 37.0 + off)
            w2 = wdt * (0.1 + 1.5 * s)
            pts_a.append((float(x - w2 / 2), float(y)))
            pts_b.append((float(x + w2 / 2), float(y)))
        d.polygon(pts_a + pts_b[::-1], fill=col)

    # Stearns Wharf: a thin dark pier running out from the far shore
    d.rectangle((690, HZ + 8, 980, HZ + 13), fill=(70, 62, 58))
    for x in range(700, 980, 14):
        d.line((x, HZ + 13, x, HZ + 22), fill=(70, 62, 58), width=2)

    # palms along the beach, bigger as they get closer
    for bx, by, ht in [(470, 900, 150), (400, 960, 200), (330, 1030, 270), (240, 1130, 380), (120, 1290, 560), (40, 1180, 430)]:
        top = (bx + ht * 0.08, by - ht)
        d.line((bx, by, bx + ht * 0.03, by - ht * 0.5, *top), fill=(58, 48, 40), width=max(3, int(ht / 34)), joint="curve")
        for ang in np.linspace(-0.3, np.pi + 0.3, 11):
            ln = ht * rng.uniform(0.26, 0.36)
            ex, ey = top[0] + np.cos(ang) * ln, top[1] - np.sin(ang) * ln * 0.55 + ln * 0.28
            d.line((*top, (top[0] + ex) / 2, min(top[1], ey) - ln * 0.12, ex, ey), fill=(30, 48, 36),
                   width=max(4, int(ht / 20)), joint="curve")

    # out of focus, then a little grain and a vignette so it reads as a photo
    img = img.filter(ImageFilter.GaussianBlur(16))
    a = np.asarray(img, np.float32)
    a += rng.normal(0, 3.0, (H, W, 1)).astype(np.float32)
    vig = 1 - 0.30 * (((xx - W / 2) / (W / 2)) ** 2 * 0.6 + ((yy - H / 2) / (H / 2)) ** 2 * 0.8)
    a *= vig[..., None] * 0.86      # slightly dark, so white type stands out
    Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).save(out)


if __name__ == "__main__":
    main()
