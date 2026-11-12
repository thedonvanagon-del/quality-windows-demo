"""Render a looping-feel dawn beach with rolling, breaking waves.

Usage: python3 waves.py OUT.mp4 [seconds] [fps]

Draws at 540x960 and upscales to 1080x1920 (9:16) with ffmpeg. Waves are soft,
so the upscale costs nothing visible. To use real footage instead, skip this
file and pass your own clip to compose.py.
"""
import subprocess
import sys

import numpy as np

W, H = 540, 960
HORIZON = 0.36  # fraction of frame height
SEED = 7


def lerp(a, b, t):
    return a + (b - a) * t


def ramp(t, stops):
    """Piecewise-linear colour ramp. stops = [(pos, (r,g,b)), ...], t in [0,1]."""
    t = np.clip(t, 0, 1)
    out = np.zeros(t.shape + (3,), dtype=np.float32)
    for (p0, c0), (p1, c1) in zip(stops, stops[1:]):
        m = (t >= p0) & (t <= p1)
        u = ((t - p0) / (p1 - p0))[m][:, None]
        out[m] = lerp(np.array(c0, np.float32), np.array(c1, np.float32), u)
    return out


rng = np.random.default_rng(SEED)
# A handful of sine components stand in for noise. (kx, kz, speed, phase, amp)
COMPONENTS = [
    (rng.uniform(1.5, 6.0), rng.uniform(0.6, 2.2), rng.uniform(0.3, 1.2),
     rng.uniform(0, 6.28), rng.uniform(0.5, 1.0))
    for _ in range(9)
]


def noise(x, z, t):
    acc = np.zeros_like(x)
    for kx, kz, sp, ph, amp in COMPONENTS:
        acc += amp * np.sin(kx * x + kz * z * 6.0 + sp * t * 6.28 + ph)
    return acc / sum(c[4] for c in COMPONENTS)  # -1..1


yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
u = xx / W            # 0..1 across
v = yy / H            # 0..1 down
hz = HORIZON

SKY = [(0.0, (22, 33, 66)), (0.45, (92, 82, 128)), (0.8, (232, 150, 130)), (1.0, (252, 205, 150))]
SEA_DEEP = [(0.0, (44, 74, 96)), (0.5, (22, 82, 98)), (1.0, (40, 128, 130))]
SAND = [(0.0, (120, 98, 84)), (1.0, (196, 170, 140))]
FOAM = np.array([252, 246, 238], np.float32)
SUN = np.array([255, 214, 160], np.float32)
SUN_X = 0.42

sky_t = np.clip(v / hz, 0, 1)
sky = ramp(sky_t, SKY)
dx = (u - SUN_X) * (W / H)
dy = (v - hz * 0.92)
glow = np.exp(-(dx * dx * 2.2 + dy * dy * 9.0) * 10.0)[..., None]
sky = sky + glow * SUN * 0.55

# sea perspective: depth 0 at horizon, 1 at the bottom of the water
sea_top = hz
shore_base = 0.86
depth = np.clip((v - sea_top) / (shore_base - sea_top), 0, 1.4)
z = 1.0 / (depth + 0.07)   # perspective-correct distance
z_n = (z - z.min()) / (z.max() - z.min())


def fnoise(fx, fz, t, speed=0.5, seed=0):
    """Cheap band-limited noise: a few sines at the given x/z frequencies."""
    r = np.random.default_rng(seed)
    acc = np.zeros_like(u)
    for _ in range(4):
        kx = fx * r.uniform(0.6, 1.4)
        kz = fz * r.uniform(0.6, 1.4)
        acc += np.sin(kx * u + kz * z_n + r.uniform(0, 6.28) + speed * t * r.uniform(0.6, 1.4) * 6.28)
    return acc / 4.0


def smooth(e0, e1, x):
    s = np.clip((x - e0) / (e1 - e0), 0, 1)
    return s * s * (3 - 2 * s)


def frame(t):
    sky_img = sky
    d = np.clip(depth, 0, 1)

    # --- water colour: deep teal near the horizon, clear green at the shore ---
    water = ramp(d, SEA_DEEP)
    water = water * (0.92 + 0.08 * fnoise(5, 3, t, 0.2, 1)[..., None])
    # sky reflection near the horizon
    refl = np.exp(-d * 5.0)[..., None]
    water = water * (1 - 0.45 * refl) + refl * 0.45 * np.array([225, 150, 130], np.float32)

    # --- sun glitter: short horizontal dashes under the sun --------------------
    column = np.exp(-((u - SUN_X) ** 2) * 28.0)
    rows = np.clip(np.sin(z * 2.1 - t * 3.0 + fnoise(2, 1.5, t, 0.3, 2) * 2.0), 0, 1) ** 4
    dash = np.clip(fnoise(34, 2, t, 0.8, 3) * 1.4 + 0.1, 0, 1)
    glitter = column * rows * dash * (1 - 0.6 * d)
    water = water + glitter[..., None] * SUN * 1.1

    # --- swells rolling in: light/dark bands, horizontal, bending slowly -------
    ph = z * 0.55 - t * 1.3 + fnoise(3, 1.2, t, 0.15, 4) * 0.9
    swell = np.sin(ph * 6.2832)
    water = water * (1 + 0.10 * swell[..., None] * (0.3 + d[..., None]))

    # --- crests with foam; they steepen and break as the water gets shallow ----
    ph2 = z * 0.62 - t * 1.3 + fnoise(3, 1.2, t, 0.15, 4) * 0.9
    crest = (np.sin(ph2 * 6.2832 + 0.9) * 0.5 + 0.5) ** 10
    shallow = smooth(0.35, 0.95, d)
    foam_mask = np.clip(fnoise(46, 2.5, t, 0.6, 5) * 0.9 + 0.55, 0, 1)
    foam = crest * (0.10 + 1.0 * shallow) * foam_mask
    # lacy foam left behind the crest as it breaks
    lace = np.clip(np.sin((ph2 - 0.16) * 6.2832 + 0.9) * 0.5 + 0.5, 0, 1) ** 4
    lace = lace * shallow * np.clip(fnoise(60, 4, t, 0.5, 6) * 0.9 + 0.35, 0, 1) * 0.55
    foam = np.clip(foam + lace, 0, 1)
    sea = water + foam[..., None] * (FOAM - water)

    # --- the beach: sand, with the wash running up and back --------------------
    wash = 0.5 + 0.5 * np.sin(t * 2.6 + fnoise(2.5, 0.0, t, 0.0, 7) * 1.4)
    shore = shore_base + 0.045 * wash - 0.015 + 0.006 * fnoise(18, 0, t, 0.4, 8)
    sand_t = np.clip((v - (shore_base - 0.03)) / (1.0 - (shore_base - 0.03)), 0, 1)
    sand = ramp(sand_t, SAND)
    wet = smooth(-0.07, 0.0, v - shore) * (1 - smooth(0.0, 0.07, v - shore) * 0.0)
    wet_zone = smooth(shore - 0.0, shore + 0.03, v) * (1 - smooth(shore + 0.03, shore + 0.09, v))
    sand = sand * (1 - 0.30 * wet_zone[..., None]) + wet_zone[..., None] * 0.10 * np.array([255, 190, 160], np.float32)

    cover = 1 - smooth(shore - 0.012, shore + 0.012, v)      # 1 = water over sand
    cover = cover[..., None]
    shallow_tint = np.array([84, 150, 142], np.float32)
    water_on_sand = sea * 0.55 + sand * 0.45 * 0.9 + shallow_tint * 0.12
    beach = sand * (1 - cover) + np.where(v[..., None] > shore_base - 0.05, water_on_sand, sea) * cover
    edge = np.exp(-((v - shore) ** 2) / (2 * 0.0065 ** 2)) * (0.6 + 0.4 * fnoise(30, 0, t, 0.5, 9))
    beach = beach + edge[..., None] * (FOAM - beach) * 0.85
    # thin film of foam left on the sand as the wash withdraws
    film = smooth(shore, shore + 0.012, v) * (1 - smooth(shore + 0.012, shore + 0.05, v)) * 0.25
    beach = beach + film[..., None] * (FOAM - beach) * np.clip(fnoise(40, 0, t, 0.2, 10) + 0.6, 0, 1)[..., None]

    out = np.where((v >= sea_top)[..., None], np.where((v > shore_base - 0.09)[..., None], beach, sea), sky_img)

    vig = 1 - 0.28 * (((u - 0.5) * 1.6) ** 2 + ((v - 0.5) * 1.1) ** 2)
    out = out * vig[..., None]
    return np.clip(out, 0, 255).astype(np.uint8)


def main():
    out_path = sys.argv[1]
    seconds = float(sys.argv[2]) if len(sys.argv) > 2 else 60.0
    fps = int(sys.argv[3]) if len(sys.argv) > 3 else 30
    n = int(seconds * fps)
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(fps), "-i", "-",
        "-vf", "scale=1080:1920:flags=lanczos,gblur=sigma=0.6",
        "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", out_path,
    ]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for i in range(n):
        p.stdin.write(frame(i / fps).tobytes())
        if i % 150 == 0:
            print(f"{i}/{n}", flush=True)
    p.stdin.close()
    p.wait()


if __name__ == "__main__":
    main()
