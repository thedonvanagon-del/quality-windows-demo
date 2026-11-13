"""Render a sunrise at the beach: rolling swells that steepen, break, and wash up the sand.

Usage: python3 waves.py OUT.mp4 [fps]

Makes a 16-second clip that loops with no seam (every motion repeats exactly in
16 s), so compose.py can loop it to any length. Drawn at 540x960 and upscaled
to 1080x1920 (9:16).

How it works: each pixel below the horizon is mapped onto a flat ocean plane,
then a sum of travelling sine waves gives height and slope. Slope drives a sky
reflection, sun glint, and foam. Waves grow and whiten as the water shallows
toward the beach.
"""
import subprocess
import sys
from multiprocessing import Pool

import numpy as np

W, H = 540, 960
T = 16.0           # loop length, seconds
HZ = 0.32          # horizon height, fraction of frame
SUN_X = 0.5
K = 6.0            # ground-plane scale: Z = K / (v - HZ)
HC = 1.6           # camera height
F = K / HC         # focal length in frame-heights
G = 4.0            # slowed gravity so the swell moves calmly
Z_SHORE = 12.0     # mean shoreline distance
Z_BREAK = 46.0     # waves start to steepen here
TAU = 2 * np.pi

yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
u = xx / W
v = yy / H
v_below = np.clip(v - HZ, 1e-3, None)
Z = (K / v_below).astype(np.float32)
X = ((u - 0.5) * Z * 0.95).astype(np.float32)
foot = (K / v_below ** 2 / H).astype(np.float32)   # world units per pixel, along Z

rng = np.random.default_rng(11)

# (n cycles per loop, direction angle, amplitude)
WAVES = [(3, -0.10, 0.34), (4, 0.18, 0.40), (5, -0.30, 0.22), (6, 0.35, 0.16), (8, -0.45, 0.09), (10, 0.5, 0.05)]
WAVE_P = []
for n, th, a in WAVES:
    w = TAU * n / T
    k = w * w / G
    WAVE_P.append((w, k, th, a, rng.uniform(0, TAU)))
A_SUM = sum(p[3] for p in WAVE_P)
W_MAIN, K_MAIN = WAVE_P[1][0], WAVE_P[1][1]
C_MAIN = W_MAIN / K_MAIN

FOAM_P = []
for _ in range(6):
    kx, kz = rng.uniform(1.2, 3.6), rng.uniform(1.4, 3.8)
    n = max(1, round(kz * C_MAIN * T / TAU))     # drifts shoreward with the swell
    FOAM_P.append((kx, kz, TAU * n / T, rng.uniform(0, TAU)))


def smooth(e0, e1, x):
    s = np.clip((x - e0) / (e1 - e0), 0, 1)
    return s * s * (3 - 2 * s)


def mix(a, b, t):
    return a + (b - a) * t[..., None]


def ramp(t, stops):
    t = np.clip(t, 0, 1)
    out = np.zeros(t.shape + (3,), np.float32)
    for (p0, c0), (p1, c1) in zip(stops, stops[1:]):
        m = (t >= p0) & (t <= p1)
        f = ((t - p0) / (p1 - p0))[m][:, None]
        out[m] = np.array(c0, np.float32) + (np.array(c1, np.float32) - np.array(c0, np.float32)) * f
    return out


SKY_STOPS = [(0.0, (30, 38, 78)), (0.4, (98, 84, 136)), (0.75, (238, 142, 128)), (1.0, (255, 196, 140))]
SUN_C = np.array([255, 208, 150], np.float32)
FOAM_C = np.array([250, 238, 228], np.float32)
SAND_STOPS = [(0.0, (150, 124, 104)), (1.0, (206, 178, 148))]


def sky_at(t):
    return ramp(t, SKY_STOPS)


# ---- static layers ----------------------------------------------------------
sky_t = np.clip(v / HZ, 0, 1)
SKY = sky_at(sky_t)
d2 = ((u - SUN_X) * 0.55) ** 2 + ((v - (HZ - 0.012)) * 1.0) ** 2
SKY = SKY + np.exp(-d2 * 55.0)[..., None] * SUN_C * 0.30
SKY = SKY + np.exp(-d2 * 3500.0)[..., None] * SUN_C * 0.9          # sun disc
# long thin cloud streaks lit from below
cl = np.zeros_like(u)
for kx, kz, ph in [(2.2, 38, 0.3), (3.6, 61, 1.9), (5.1, 24, 4.0), (1.4, 47, 2.6)]:
    cl += np.sin(kx * u * 6 + kz * v + ph)
cl = smooth(0.4, 2.4, cl) * smooth(0.02, 0.12, v) * (1 - smooth(HZ - 0.07, HZ - 0.005, v))
SKY = SKY + cl[..., None] * np.array([120, 40, 40], np.float32) * 0.6 * (0.5 + 0.8 * sky_t[..., None])

grain = (rng.random((H, W)).astype(np.float32) - 0.5)
SUN_DIR = np.array([(SUN_X - 0.5) * 0.95, 0.008, 1.0], np.float32)
SUN_DIR /= np.linalg.norm(SUN_DIR)
VEC_V = np.stack([-X, np.full_like(X, HC), -Z], -1)
VEC_V /= np.linalg.norm(VEC_V, axis=-1, keepdims=True)


def frame(i):
    t = i / 30.0
    ph_t = TAU * t / T
    sh = smooth(0.0, 1.0, np.clip((Z_BREAK - Z) / (Z_BREAK - Z_SHORE), 0, 1))   # 0 far, 1 at the beach

    # height and slopes from the wave sum, with distance anti-aliasing
    h = np.zeros_like(Z)
    hx = np.zeros_like(Z)
    hz = np.zeros_like(Z)
    for w, k, th, a, ph in WAVE_P:
        fade = np.exp(-((foot * k * 0.9) ** 2))
        amp = 0.62 * a * (1 + 1.1 * sh) * fade
        arg = k * (X * np.sin(th) + Z * np.cos(th)) + w * t + ph
        # lean crests toward the shore as they steepen
        s = np.sin(arg)
        c = np.cos(arg)
        h += amp * s
        hx += amp * k * np.sin(th) * c
        hz += amp * k * np.cos(th) * c
    hn = h / (0.62 * A_SUM * (1 + 1.1 * sh))

    # surface normal, Fresnel, sky reflection
    nx, ny, nz = -hx, np.ones_like(hx), -hz
    nl = np.sqrt(nx * nx + ny * ny + nz * nz)
    nx, ny, nz = nx / nl, ny / nl, nz / nl
    vv = VEC_V
    ndv = np.clip(nx * vv[..., 0] + ny * vv[..., 1] + nz * vv[..., 2], 0, 1)
    rx = 2 * ndv * nx - vv[..., 0]
    ry = 2 * ndv * ny - vv[..., 1]
    rz = 2 * ndv * nz - vv[..., 2]
    ndv_eff = np.clip(vv[..., 1] + 0.12 * (ndv - vv[..., 1]), 0.03, 1)
    fres = 0.03 + 0.62 * (1 - ndv_eff) ** 4
    ry_s = np.clip(vv[..., 1] + 0.25 * (ry - vv[..., 1]), 0, 1)
    refl = sky_at(1 - np.clip(ry_s / 0.6, 0, 1)) * 0.82
    refl = refl + np.exp(-((rx - SUN_DIR[0]) ** 2) * 30.0)[..., None] * SUN_C * 0.18 * (1 - np.clip(ry_s / 0.3, 0, 1))[..., None]
    dots = np.clip(rx * SUN_DIR[0] + ry * SUN_DIR[1] + rz * SUN_DIR[2], 0, 1)
    glint = (dots ** 900) * 6.0 + (dots ** 60) * 0.35

    # water body: deep teal, turquoise in the shallows and through thin crests
    depth_c = ramp(1 - sh, [(0.0, (46, 142, 140)), (0.45, (22, 86, 104)), (1.0, (10, 44, 62))])
    body = depth_c + np.clip(hn, 0, 1)[..., None] ** 2 * np.array([30, 80, 70], np.float32) * (0.4 + sh[..., None])
    water = body * (1 - fres[..., None]) + refl * fres[..., None] + glint[..., None] * SUN_C

    # foam: crest, lacy trail behind it, and a fine drifting texture
    ft = np.zeros_like(Z)
    for kx, kz, w, ph in FOAM_P:
        ft += np.sin(kx * X + kz * Z + w * t + ph)
    ft = np.clip(ft / 6 * 2.2 + 0.5, 0, 1)
    warp = 0.7 * np.sin(0.45 * X + TAU * 2 * t / T + 1.0)
    phi = K_MAIN * (X * np.sin(WAVE_P[1][2]) + Z * np.cos(WAVE_P[1][2])) + W_MAIN * t + WAVE_P[1][4] + warp
    d = np.mod(phi - np.pi / 2, TAU)
    crest = np.exp(-np.minimum(d, TAU - d) ** 2 / 0.40)
    trail = np.exp(-d / 1.1) * (d < np.pi * 1.2)
    crest2 = np.clip((hn - 0.5) / 0.35, 0, 1)
    foam = (crest * (0.18 + 1.4 * sh) + trail * sh * 1.0 + crest2 * sh * 0.9)
    foam = np.clip(foam * (0.55 + 0.9 * ft), 0, 1) * np.exp(-((foot * 4.0) ** 1.5) * 0.0)
    foam = foam * np.clip(1.15 - foot * 0.9, 0, 1)
    water = water + foam[..., None] * (FOAM_C * (0.92 + 0.08 * ft[..., None]) - water)

    # ---- the beach and the swash -------------------------------------------
    n_edge = (np.sin(0.8 * X + ph_t * 3 + 0.5) + np.sin(1.7 * X - ph_t * 5 + 2.0)) * 0.12
    zs = Z_SHORE + 1.5 * np.sin(ph_t * 4 + n_edge * 1.3) + 0.25 * n_edge
    dist_in = Z - zs                       # >0 water side, <0 sand side
    ds = -dist_in
    sand = ramp(smooth(-12.0, 0.0, -Z + Z_SHORE + 6) * 0 + np.clip((Z_SHORE + 4 - Z) / 10, 0, 1), SAND_STOPS)
    sand = sand * (1 + 0.07 * grain[..., None])
    wet = 1 - smooth(0.0, 3.4, ds)
    wet = wet * (ds > 0)
    sky_sheen = sky_at(np.full_like(Z, 0.8))
    sand = sand * (1 - 0.40 * wet[..., None]) + sky_sheen * (0.22 * wet[..., None]) 
    lace = np.exp(-ds.clip(0, None) / 1.1) * (ds > 0) * (0.5 + 0.2 * ft) * 0.5
    sand = sand + lace[..., None] * (FOAM_C - sand)

    alpha_w = smooth(0.0, 2.2, dist_in)
    swash_foam = (1 - smooth(0.0, 3.0, dist_in)) * (0.5 + 0.6 * ft) * (dist_in > -0.2)
    edge_line = np.exp(-((dist_in - 0.15) / 0.20) ** 2) * (0.55 + 0.45 * ft)
    thin = mix(sand, water, alpha_w * 0.85 + 0.15 * (dist_in > 0))
    thin = thin + np.clip(swash_foam + edge_line, 0, 1)[..., None] * (FOAM_C - thin) * 0.9
    beach = np.where((dist_in > 0)[..., None], thin, sand)

    land = np.where((dist_in < 4.5)[..., None], beach, water)
    land = np.where((dist_in > 0)[..., None] & (dist_in < 4.5)[..., None], thin, land)
    out = np.where((v >= HZ)[..., None], land, SKY)

    # softly lift the horizon haze, then a light vignette
    haze = np.exp(-((v - HZ) / 0.012) ** 2)
    out = out + haze[..., None] * np.array([40, 24, 14], np.float32) * 0.8
    vig = 1 - 0.22 * (((u - 0.5) * 1.5) ** 2 + ((v - 0.5) * 1.0) ** 2)
    out = out * vig[..., None] * 1.04
    return np.clip(out, 0, 255).astype(np.uint8).tobytes()


def main():
    out_path = sys.argv[1]
    fps = int(sys.argv[2]) if len(sys.argv) > 2 else 30
    if fps != 30:
        raise SystemExit("frame() assumes 30 fps")
    n = int(T * fps)
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(fps), "-i", "-",
        "-vf", "scale=1080:1920:flags=lanczos,gblur=sigma=0.5",
        "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p", out_path,
    ]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    with Pool(4) as pool:
        for i, fr in enumerate(pool.imap(frame, range(n), chunksize=4)):
            p.stdin.write(fr)
            if i % 60 == 0:
                print(f"{i}/{n}", flush=True)
    p.stdin.close()
    p.wait()


if __name__ == "__main__":
    main()
