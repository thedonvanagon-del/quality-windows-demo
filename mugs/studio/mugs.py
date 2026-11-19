"""Buddha Beans mug studio, drop 7: 20 coffee-pun mugs, throwback artwork, five Printify mug styles.

Run:  python3 mugs.py   -> ../drop7/ (prints/, mockups/, listings.csv, overview.jpg)

Every design is a compact BADGE drawn on a 1200x900 canvas. A real mug shows only ~3.5in of its wrap from the front,
so the art lives in the middle of the print area. White ceramic mugs also get a pattern wrap behind the badge.
Each PNG is rendered at the exact print-area size of its Printify blank, so it uploads at scale 1 with no stretching.
"""
import csv, math, os, random, re, subprocess
from concurrent.futures import ThreadPoolExecutor

CHROME = "/opt/pw-browsers/chromium"
BW, BH, BX, BY = 1200, 900, 600, 450
INTER, MONO, SERIF, SANS = "Inter", "JetBrains Mono", "Liberation Serif", "DejaVu Sans"
K = {INTER: .66, MONO: .62, SERIF: .5, SANS: .66}

# style -> Printify blueprint, print areas per size, listing prices, how the art is made
STYLES = {
 "ceramic_white": dict(bp=478, label="White Ceramic Mug", sizes=[("11oz", 2475, 1155, 18), ("15oz", 2475, 1275, 22)], wrap=True),
 "black":         dict(bp=479, label="Black Glossy Mug", sizes=[("11oz", 2327, 1086, 20), ("15oz", 2448, 1266, 24)], wrap=False),
 "twotone":       dict(bp=2693, label="Two-Tone Color Accent Mug", sizes=[("11oz", 2538, 1088, 21), ("15oz", 2475, 1275, 25)], wrap=False),
 "latte":         dict(bp=289, label="Latte Mug", sizes=[("12oz", 1988, 1196, 24)], wrap=False),
 "enamel":        dict(bp=483, label="Enamel Camp Mug", sizes=[("12oz", 2400, 750, 26)], wrap=False),
}

PAL = {
 "sunset":   dict(bg="#f3e6cf", ink="#4a2a1a", a="#d9772b", b="#e0a43a", c="#b9502a", d="#7a8b6a", cream="#fbf3e2"),
 "sunset_t": dict(bg="#e8f0e4", ink="#1f3a3a", a="#e07a5f", b="#f2cc8f", c="#3d8b8b", d="#81b29a", cream="#fbf6ea"),
 "groovy_m": dict(bg="#f1c24b", ink="#4b2a14", a="#d8503f", b="#f3e6cf", c="#6b8f5a", d="#c46a2b", cream="#fbf3e2"),
 "groovy_p": dict(bg="#f9d5e5", ink="#4a1f3a", a="#e0457b", b="#ffd23f", c="#3fa89b", d="#8a4fbf", cream="#fff7f0"),
 "memphis":  dict(bg="#fbe9f1", ink="#1d1d3b", a="#ff4f9a", b="#00b5ba", c="#ffd23f", d="#7a4dff", cream="#ffffff"),
 "memphis_b":dict(bg="#d9f3f1", ink="#1d1d3b", a="#ff6b6b", b="#7a4dff", c="#ffd23f", d="#00a6a6", cream="#ffffff"),
 "diner":    dict(bg="#f7efe0", ink="#7a1f2b", a="#c0392b", b="#2a8c8c", c="#1f1f1f", d="#e8b23a", cream="#fffaf0"),
 "diner_t":  dict(bg="#dff1ef", ink="#1f4d4d", a="#e0525a", b="#1f4d4d", c="#1f1f1f", d="#f2cc8f", cream="#fffaf0"),
 "pixel":    dict(bg="#1b1b3a", ink="#f4f0e0", a="#ff5c5c", b="#ffd23f", c="#4ee0a0", d="#5aa9ff", cream="#f4f0e0"),
 "pixel_g":  dict(bg="#0f2a1d", ink="#d8f5c4", a="#ff9f1c", b="#f6e05e", c="#7bd88f", d="#5aa9ff", cream="#d8f5c4"),
 "cass_o":   dict(bg="#f3e6cf", ink="#2b2118", a="#d9772b", b="#e0a43a", c="#b9502a", d="#7a8b6a", cream="#fbf3e2"),
 "cass_t":   dict(bg="#e3efec", ink="#1f3a3a", a="#e0525a", b="#f2cc8f", c="#3d8b8b", d="#e8b23a", cream="#fbf6ea"),
 "vapor":    dict(bg="#2b1055", bg2="#7a2f8a", ink="#ffffff", a="#ff71ce", b="#01cdfe", c="#05ffa1", d="#fffb96", cream="#ffffff"),
 "vapor_s":  dict(bg="#1a0b3a", bg2="#8e2de2", ink="#ffffff", a="#ff4e50", b="#f9d423", c="#fc913a", d="#6ee7f9", cream="#ffffff"),
 "rainbow":  dict(bg="#fff4e0", ink="#3b2418", a="#d8503f", b="#e8913a", c="#e8b23a", d="#6b8f5a", e="#3d7ea6", cream="#fffaf0"),
 "rainbow_p":dict(bg="#fde9f0", ink="#4a1f3a", a="#ff8fab", b="#ffb677", c="#ffe08a", d="#9be3b8", e="#8fb8ff", cream="#ffffff"),
 "burst_a":  dict(bg="#f3e6cf", ink="#4a2a1a", a="#d9772b", b="#efc06a", c="#b9502a", d="#7a8b6a", cream="#fbf3e2"),
 "burst_b":  dict(bg="#fbe3c8", ink="#2f3a2b", a="#c0392b", b="#f3b562", c="#3f6b48", d="#e8b23a", cream="#fff7ea"),
 "checker_r":dict(bg="#f7efe0", ink="#1f1f1f", a="#c0392b", b="#e8b23a", c="#e8b23a", d="#1f1f1f", cream="#fffaf0"),
 "checker_t":dict(bg="#eef6f4", ink="#1f3a3a", a="#2a8c8c", b="#f2cc8f", c="#e0525a", d="#1f3a3a", cream="#fffaf0"),
}

def esc(t): return t.replace("&", "&amp;").replace('"', "&quot;").replace("<", "&lt;")

def T(x, y, s, size, fill, font=INTER, weight=900, maxw=900, ls=0, italic=False, extra=""):
    est = len(s) * size * K[font] + max(0, len(s) - 1) * ls
    if est > maxw: f = maxw / est; size = int(size * f); ls *= f
    ita = ' font-style="italic"' if italic else ""
    return (f'<text x="{x}" y="{y}" font-family="{font}" font-weight="{weight}" font-size="{size}"{ita} letter-spacing="{ls:.1f}" '
            f'fill="{fill}" text-anchor="middle"{extra}>{esc(s)}</text>')

def R(x, y, w, h, fill, rx=0, extra=""): return f'<rect x="{x:.0f}" y="{y:.0f}" width="{w:.0f}" height="{h:.0f}" rx="{rx}" fill="{fill}" {extra}/>'

def star(x, y, r, fill, pts=5, inner=.42):
    p = []
    for k in range(pts * 2):
        rr = r if k % 2 == 0 else r * inner; a = k * math.pi / pts - math.pi / 2
        p.append(f"{x+rr*math.cos(a):.0f},{y+rr*math.sin(a):.0f}")
    return f'<polygon points="{" ".join(p)}" fill="{fill}"/>'

def sparkle(x, y, r, fill): return star(x, y, r, fill, 4, .25)

def flower(x, y, r, petal, center):
    g = "".join(f'<ellipse cx="0" cy="{-r*.62:.0f}" rx="{r*.34:.0f}" ry="{r*.5:.0f}" fill="{petal}" transform="rotate({k*72})"/>' for k in range(5))
    return f'<g transform="translate({x:.0f} {y:.0f})">{g}<circle r="{r*.28:.0f}" fill="{center}"/></g>'

def wave(x0, x1, y, amp, period, sw, col):
    dd = f"M {x0:.0f} {y:.0f}"; x = x0; up = 1
    while x < x1:
        dd += f" q {period/4:.0f} {-amp*up:.0f} {period/2:.0f} 0"; x += period / 2; up = -up
    return f'<path d="{dd}" fill="none" stroke="{col}" stroke-width="{sw}" stroke-linecap="round"/>'

def block(lines, ys, sizes, cols, font=INTER, **kw): return "".join(T(BX, y, s, z, c, font, **kw) for s, y, z, c in zip(lines, ys, sizes, cols))

def wavy(lines, ys, sizes, P, maxw):
    out = ""
    for s, y, size in zip(lines, ys, sizes):
        if len(s) * size * .66 > maxw: size = int(size * maxw / (len(s) * size * .66))
        cw = size * .66; x0 = BX - (len(s) - 1) * cw / 2
        for k, ch in enumerate(s):
            if ch == " ": continue
            x = x0 + k * cw; yy = y + size * .07 * math.sin(k * .9)
            out += (f'<text x="{x:.0f}" y="{yy:.0f}" font-family="{INTER}" font-weight="900" font-size="{size}" fill="{[P["a"], P["ink"], P["c"], P["d"]][k % 4]}" '
                    f'stroke="{P["cream"]}" stroke-width="10" paint-order="stroke" text-anchor="middle" transform="rotate({5*math.sin(k*.9):.1f} {x:.0f} {y})">{esc(ch)}</text>')
    return out

# ---------------- badges (1200x900) ----------------
def b_sunset(d, P):
    n = len(d["lines"]); ys, sz = ([632, 744], [110, 110]) if n == 2 else ([700], [165])
    cuts = "".join(R(380, 318 + i * 34, 440, 6 + i * 5, P["bg"]) for i in range(5))
    waves = "".join(wave(150, 380, 250 + i * 46, 14, 120, 20, c) + wave(820, 1050, 250 + i * 46, 14, 120, 20, c) for i, c in enumerate([P["a"], P["b"], P["c"]]))
    return (R(100, 60, 1000, 780, P["bg"], 70, f'stroke="{P["ink"]}" stroke-width="14"') + R(124, 84, 952, 732, "none", 50, f'stroke="{P["a"]}" stroke-width="5"')
            + waves + f'<circle cx="600" cy="300" r="205" fill="{P["a"]}"/>' + cuts + block(d["lines"], ys, sz, [P["ink"], P["c"]], maxw=860)
            + T(600, 800, d["sub"], 32, P["ink"], SANS, 700, 800, 9))

def b_rainbow(d, P):
    cols = [P["a"], P["b"], P["c"], P["d"], P["e"]]; n = len(d["lines"])
    st = "".join(R(50, 90 + i * 26, 1100, 26, c) + R(50, 680 + i * 26, 1100, 26, c) for i, c in enumerate(cols))
    ys, sz = ([420, 560], [150, 150]) if n == 2 else ([540], [200])
    return (f'<defs><clipPath id="rb"><rect x="50" y="90" width="1100" height="720" rx="60"/></clipPath></defs><rect x="50" y="90" width="1100" height="720" rx="60" fill="{P["cream"]}"/>'
            f'<g clip-path="url(#rb)">{st}</g><rect x="50" y="90" width="1100" height="720" rx="60" fill="none" stroke="{P["ink"]}" stroke-width="14"/>'
            + block(d["lines"], ys, sz, [P["ink"], P["a"]], maxw=940) + T(600, 648, d["sub"], 36, P["ink"], SANS, 700, 900, 9)
            + sparkle(150, 330, 34, P["b"]) + sparkle(1050, 590, 40, P["a"]))

def b_diner(d, P):
    n = len(d["lines"]); a, b = d["lines"][0], (d["lines"][1] if n > 1 else "")
    return (f'<ellipse cx="600" cy="450" rx="540" ry="390" fill="{P["cream"]}" stroke="{P["ink"]}" stroke-width="16"/><ellipse cx="600" cy="450" rx="505" ry="355" fill="none" stroke="{P["a"]}" stroke-width="6"/>'
            + T(600, 225, d["sub"], 34, P["b"], SANS, 700, 640, 9)
            + T(612, 442, a, 240, P["c"], SERIF, 700, 800, 0, True) + T(600, 430, a, 240, P["a"], SERIF, 700, 800, 0, True)
            + (T(612, 662, b, 220, P["c"], SERIF, 700, 840, 0, True) + T(600, 650, b, 220, P["ink"], SERIF, 700, 840, 0, True) if b else "")
            + star(110, 450, 40, P["d"]) + star(1090, 450, 40, P["d"]) + star(520, 748, 26, P["a"]) + star(600, 756, 30, P["a"]) + star(680, 748, 26, P["a"]))

def confetti(rnd, P, avoid, count, bounds=(0, 0, BW, BH), sz=(30, 66)):
    out = []
    for _ in range(count * 3):
        if len(out) >= count: break
        x, y = rnd.randint(bounds[0], bounds[2]), rnd.randint(bounds[1], bounds[3])
        if avoid[0] < x < avoid[2] and avoid[1] < y < avoid[3]: continue
        c = rnd.choice([P["a"], P["b"], P["c"], P["d"]]); k = rnd.choice("tcsqz"); s = rnd.randint(*sz); r = rnd.randint(0, 359)
        if k == "t": e = f'<polygon points="0,{-s} {s},{s} {-s},{s}" fill="{c}"/>'
        elif k == "c": e = f'<circle r="{s*.7:.0f}" fill="none" stroke="{c}" stroke-width="14"/>'
        elif k == "s": e = f'<circle r="{s*.35:.0f}" fill="{c}"/>'
        elif k == "q": e = R(-s, -s * .28, s * 2, s * .56, c)
        else: e = f'<path d="M {-s} 0 q {s/2:.0f} {-s} {s} 0 t {s} 0" fill="none" stroke="{c}" stroke-width="13" stroke-linecap="round" transform="translate({-s/2:.0f} 0)"/>'
        out.append(f'<g transform="translate({x} {y}) rotate({r})">{e}</g>')
    return "".join(out)

def b_memphis(d, P):
    n = len(d["lines"]); rnd = random.Random(d["name"]); ys, sz = ([418, 588], [185, 185]) if n == 2 else ([560], [220])
    return (confetti(rnd, P, (80, 140, 1120, 770), 34, (30, 30, 1170, 870)) + R(142, 192, 960, 560, P["ink"], 50) + R(120, 170, 960, 560, P["cream"], 50, f'stroke="{P["ink"]}" stroke-width="12"')
            + block(d["lines"], ys, sz, [P["ink"], P["a"]], maxw=840) + T(600, 676, d["sub"], 34, P["ink"], SANS, 700, 820, 9))

CUP = ["....#.#.#.....", "...#.#.#......", "..............", "##############.", "#cccccccccccc###", "#cccccccccccc#.#", "#cccccccccccc#.#", "#cccccccccccc###", "#cccccccccccc#.", ".#cccccccccc#..", "..############.."]
def b_pixel(d, P):
    n = len(d["lines"]); px = 24; x0, y0 = 600 - 7 * px, 160; cup = ""
    for r, row in enumerate(CUP):
        for c, ch in enumerate(row):
            col = {"#": P["ink"], "c": P["a"]}.get(ch)
            if ch == "c" and r in (5, 6): col = P["b"]
            if col: cup += R(x0 + c * px, y0 + r * px, px, px, col)
    rnd = random.Random(d["name"]); sp = "".join(R(rnd.randint(8, 92) * 12, rnd.randint(10, 66) * 12, 12, 12, rnd.choice([P["b"], P["c"], P["d"]]), 0, 'opacity=".5"') for _ in range(40))
    ys, sz = ([545, 665], [118, 118]) if n == 2 else ([600], [150])
    txt = "".join(T(600 + 7, y + 7, s, z, P["a"], MONO, 800, 880, 0) + T(600, y, s, z, P["ink"], MONO, 800, 880, 0) for s, y, z in zip(d["lines"], ys, sz))
    scan = "".join(R(100, y, 1000, 3, "#000", 0, 'opacity=".2"') for y in range(110, 790, 9))
    return (R(50, 60, 1100, 780, "#2b2b30", 90) + R(100, 110, 1000, 680, P["bg"], 55) + f'<clipPath id="sc"><rect x="100" y="110" width="1000" height="680" rx="55"/></clipPath>'
            + f'<g clip-path="url(#sc)">{sp}{cup}{txt}{T(600, 745, d["sub"], 34, P["b"], MONO, 700, 880, 7)}{scan}</g>' + f'<circle cx="1085" cy="815" r="9" fill="{P["c"]}"/>')

def b_vapor(d, P):
    n = len(d["lines"]); ys, sz = ([410, 535], [120, 120]) if n == 2 else ([500], [150])
    grid = "".join(f'<line x1="{600+k*60}" y1="570" x2="{600+k*250}" y2="920" stroke="{P["a"]}" stroke-width="4"/>' for k in range(-12, 13))
    hl = "".join(f'<line x1="0" y1="{y}" x2="1200" y2="{y}" stroke="{P["a"]}" stroke-width="4"/>' for y in (588, 620, 662, 718, 790, 880))
    cuts = "".join(R(400, 300 + i * 32, 400, 5 + i * 5, P["bg"]) for i in range(5))
    return (f'<defs><clipPath id="vc"><circle cx="600" cy="450" r="440"/></clipPath><linearGradient id="vg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{P["bg"]}"/><stop offset=".63" stop-color="{P["bg2"]}"/><stop offset=".64" stop-color="{P["bg"]}"/></linearGradient>'
            f'<linearGradient id="vs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{P["b"]}"/><stop offset="1" stop-color="{P["a"]}"/></linearGradient></defs>'
            f'<g clip-path="url(#vc)"><rect width="1200" height="900" fill="url(#vg)"/>{grid}{hl}<circle cx="600" cy="320" r="200" fill="url(#vs)"/>{cuts}'
            + sparkle(250, 230, 34, P["d"]) + sparkle(960, 280, 40, P["d"]) + sparkle(330, 640, 20, P["d"])
            + "".join(T(600 + 7, y + 7, s, z, P["b"], INTER, 900, 720, 3) + T(600, y, s, z, P["ink"], INTER, 900, 720, 3, extra=f' stroke="{P["a"]}" stroke-width="6" paint-order="stroke"') for s, y, z in zip(d["lines"], ys, sz))
            + T(600, 712, d["sub"], 28, P["c"], MONO, 800, 500, 7) + f'</g><circle cx="600" cy="450" r="440" fill="none" stroke="{P["a"]}" stroke-width="14"/>')

def b_cassette(d, P):
    n = len(d["lines"]); x, y, w, h = 40, 130, 1120, 640
    reels = "".join(f'<circle cx="{600+dx}" cy="{y+470}" r="72" fill="{P["cream"]}" stroke="{P["ink"]}" stroke-width="10"/><circle cx="{600+dx}" cy="{y+470}" r="32" fill="{P["ink"]}"/>'
                    + "".join(R(600 + dx - 5, y + 470 - 58, 10, 26, P["ink"], 0, f'transform="rotate({k*60} {600+dx} {y+470})"') for k in range(6)) for dx in (-260, 260))
    ys, sz = ([y + 160, y + 252], [88, 88]) if n == 2 else ([y + 215], [135])
    return (R(x + 14, y + 16, w, h, "#00000030", 54) + R(x, y, w, h, P["ink"], 54) + R(x + 50, y + 40, w - 100, 300, P["cream"], 20) + R(x + 50, y + 40, w - 100, 50, P["a"], 20) + R(x + 50, y + 70, w - 100, 20, P["a"])
            + T(x + 80, y + 78, "SIDE A", 28, P["cream"], SANS, 700, 200, 8).replace('text-anchor="middle"', 'text-anchor="start"')
            + T(x + w - 80, y + 78, "C-60 · HIGH BIAS", 26, P["cream"], SANS, 700, 400, 6).replace('text-anchor="middle"', 'text-anchor="end"')
            + block(d["lines"], ys, sz, [P["ink"], P["c"]], maxw=900) + T(600, y + 318, d["sub"], 26, P["ink"], SANS, 700, 800, 8)
            + R(600 - 130, y + 430, 260, 80, "#00000045", 14, f'stroke="{P["cream"]}" stroke-width="6"') + reels)

def b_sunburst(d, P):
    n = len(d["lines"]); rays = ""
    for k in range(32):
        a0, a1 = k * 2 * math.pi / 32, (k + .5) * 2 * math.pi / 32
        rays += f'<polygon points="600,450 {600+700*math.cos(a0):.0f},{450+700*math.sin(a0):.0f} {600+700*math.cos(a1):.0f},{450+700*math.sin(a1):.0f}" fill="{P["b"] if k%2==0 else P["a"]}"/>'
    ys, sz = ([462, 584], [112, 112]) if n == 2 else ([540], [150])
    return (f'<defs><clipPath id="sb"><circle cx="600" cy="450" r="440"/></clipPath></defs><circle cx="600" cy="450" r="440" fill="{P["bg"]}"/><g clip-path="url(#sb)">{rays}</g>'
            f'<circle cx="600" cy="450" r="440" fill="none" stroke="{P["ink"]}" stroke-width="16"/><circle cx="600" cy="450" r="350" fill="{P["ink"]}"/><circle cx="600" cy="450" r="334" fill="{P["cream"]}"/>'
            f'<circle cx="600" cy="450" r="306" fill="none" stroke="{P["c"]}" stroke-width="6" stroke-dasharray="3 14" stroke-linecap="round"/>'
            + star(600, 262, 32, P["a"]) + block(d["lines"], ys, sz, [P["ink"], P["c"]], maxw=540) + T(600, 662, d["sub"], 28, P["ink"], SANS, 700, 400, 6))

def b_groovy(d, P):
    n = len(d["lines"]); ys, sz = ([420, 560], [125, 125]) if n == 2 else ([520], [170])
    x0, y0, w, h = 80, 120, 1040, 660; fl = []; i = 0
    cols = [P["a"], P["c"], P["d"], P["ink"]]
    pts = [(x0 + k * w / 7, y0) for k in range(8)] + [(x0 + k * w / 7, y0 + h) for k in range(8)] + [(x0, y0 + k * h / 4) for k in range(1, 4)] + [(x0 + w, y0 + k * h / 4) for k in range(1, 4)]
    for k, (x, y) in enumerate(pts): fl.append(flower(x, y, 54, cols[k % 4] if cols[k % 4] != P["ink"] else P["b"], P["ink"]))
    return (R(x0, y0, w, h, P["bg"], 90, f'stroke="{P["ink"]}" stroke-width="14"') + "".join(fl) + wavy(d["lines"], ys, sz, P, 880)
            + T(600, 690, d["sub"], 40, P["ink"], SERIF, 700, 780, 4, True))

def b_checker(d, P):
    n = len(d["lines"]); t = 55; ch = ""
    for r in range(13):
        for c in range(20):
            if (r + c) % 2 == 0: ch += R(70 + c * t, 120 + r * t, t, t, P["ink"])
    ys, sz = ([420, 568], [140, 140]) if n == 2 else ([540], [175])
    return (f'<defs><clipPath id="ck"><rect x="70" y="120" width="1060" height="660" rx="36"/></clipPath></defs><rect x="70" y="120" width="1060" height="660" rx="36" fill="{P["cream"]}"/>'
            f'<g clip-path="url(#ck)">{ch}</g><rect x="70" y="120" width="1060" height="660" rx="36" fill="none" stroke="{P["ink"]}" stroke-width="14"/>'
            + R(125, 235, 950, 430, P["ink"]) + R(135, 245, 930, 410, P["a"]) + block(d["lines"], ys, sz, [P["cream"], P["b"]], maxw=840, italic=True)
            + T(600, 628, d["sub"], 30, P["cream"], SANS, 700, 840, 9))

# ---------------- wrap patterns for white ceramic (behind the badge) ----------------
def p_sunset(P, pw, ph):
    out = ""
    for sg in (-1, 1):
        for i, c in enumerate([P["a"], P["b"], P["c"], P["d"]]):
            x0, x1 = (-60, pw * .27) if sg < 0 else (pw * .73, pw + 60)
            out += wave(x0, x1, ph * .36 + i * ph * .08, 30, 250, 36, c)
    return out
def p_rainbow(P, pw, ph):
    cols = [P["a"], P["b"], P["c"], P["d"], P["e"]]; s = ph * .06
    return "".join(R(-60, ph * .08 + i * s, pw + 120, s, c) + R(-60, ph * .92 - 5 * s + i * s, pw + 120, s, c) for i, c in enumerate(cols))
def p_diner(P, pw, ph):
    s = ph * .075; out = ""
    for r in range(2):
        for c in range(int(pw / s) + 3):
            if (r + c) % 2 == 0: out += R(c * s - s, r * s, s, s, P["c"]) + R(c * s - s, ph - 2 * s + r * s, s, s, P["c"])
    return out + R(-60, 2 * s + 6, pw + 120, 12, P["a"]) + R(-60, ph - 2 * s - 18, pw + 120, 12, P["a"])
def p_memphis(P, pw, ph):
    rnd = random.Random("wrap"); out = ""
    for _ in range(80):
        x, y = rnd.randint(0, int(pw)), rnd.randint(0, int(ph))
        if pw * .22 < x < pw * .78 and ph * .08 < y < ph * .92: continue
        out += confetti(random.Random(x * 7 + y), P, (-1, -1, -1, -1), 1, (x, y, x, y), (40, 80))
    return out
WRAP = dict(sunset=p_sunset, rainbow=p_rainbow, diner=p_diner, memphis=p_memphis)
BADGE = dict(sunset=b_sunset, rainbow=b_rainbow, diner=b_diner, memphis=b_memphis, pixel=b_pixel, vapor=b_vapor, cassette=b_cassette, sunburst=b_sunburst, groovy=b_groovy, checker=b_checker)

def art_svg(d, pw, ph):
    P = PAL[d["pal"]]; st = STYLES[d["style"]]
    s = min(.86 * ph / BH, (.62 if d["style"] == "latte" else .5) * pw / BW)
    if d["style"] == "enamel": s = .92 * ph / BH
    pre = ""
    if st["wrap"] and d["tpl"] in WRAP:
        pre = R(-100, -100, pw + 200, ph + 200, P["bg"]) + WRAP[d["tpl"]](P, pw, ph)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{pw}" height="{ph}" viewBox="0 0 {pw} {ph}">{pre}'
            f'<g transform="translate({pw/2:.1f} {ph/2:.1f}) scale({s:.4f}) translate({-BX} {-BY})">{BADGE[d["tpl"]](d, P)}</g></svg>')

# ---------------- the 20 designs ----------------
def dd(name, style, tpl, pal, lines, sub, era, tags, blurb, colors=""):
    return dict(name=name, style=style, tpl=tpl, pal=pal, lines=lines, sub=sub, era=era, tags=tags, blurb=blurb, colors=colors)
D = [
 # white ceramic: pattern wrap + badge
 dd("Brew-tiful Morning", "ceramic_white", "sunset", "sunset", ["BREW-TIFUL", "MORNING"], "RISE · SIP · REPEAT", "70s", ["brewtiful morning", "morning coffee mug", "retro sunset mug", "good morning gift", "coffee pun mug"], "A 70s sunset on a mug that makes every morning a little more brew-tiful."),
 dd("Good Things Brew", "ceramic_white", "rainbow", "rainbow", ["GOOD THINGS", "BREW"], "COME TO THOSE WHO SIP", "70s", ["good things brew", "rainbow coffee mug", "retro rainbow mug", "positive vibes mug", "coffee pun gift"], "Retro rainbow stripes and a good-news pun."),
 dd("Bean Appetit", "ceramic_white", "diner", "diner", ["Bean", "Appétit"], "SERVED HOT SINCE 1955", "50s", ["bean appetit mug", "retro diner mug", "50s coffee cup", "coffee pun mug", "diner style gift"], "Checkerboard diner style for anyone who takes coffee seriously."),
 dd("Mocha Me Crazy", "ceramic_white", "memphis", "memphis", ["MOCHA ME", "CRAZY"], "SIP · SMILE · REPEAT", "80s", ["mocha me crazy", "80s coffee mug", "memphis design mug", "funny coffee pun", "mocha lover gift"], "Bold 80s confetti for the person who orders the mocha."),
 # black glossy: badge only
 dd("Brew Crew", "black", "pixel", "pixel", ["BREW CREW"], "PRESS START TO SIP", "8-bit", ["brew crew mug", "8 bit coffee mug", "gamer coffee cup", "pixel art mug", "gamer gift"], "A pixel-art cup for the 8-bit crowd."),
 dd("Cold Brew Cool", "black", "vapor", "vapor", ["COLD BREW", "COOL"], "ICED · CHILLED · SYNTHWAVE", "90s", ["cold brew cool", "vaporwave mug", "synthwave coffee", "iced coffee lover", "retro 90s mug"], "Neon sunset vibes for the iced coffee drinker, even in a hot mug."),
 dd("Mug Life", "black", "cassette", "cass_o", ["MUG LIFE"], "SIDE A · COFFEE MIX", "80s", ["mug life", "cassette tape mug", "mixtape coffee cup", "80s retro mug", "music lover gift"], "A mixtape for your morning. Side A is all coffee."),
 dd("Rise and Grind", "black", "sunburst", "burst_a", ["RISE &", "GRIND"], "FRESH GROUND DAILY", "70s", ["rise and grind", "sunburst mug", "morning person mug", "retro coffee cup", "coffee grinder gift"], "A vintage sunburst for the early shift."),
 # two-tone color accent: badge, three color picks each
 dd("Latte Love", "twotone", "groovy", "groovy_m", ["LATTE LOVE"], "peace · love · espresso", "70s", ["latte love mug", "groovy coffee mug", "flower power mug", "hippie coffee cup", "coffee lover gift"], "Flower power meets the espresso machine.", "Yellow|Maroon|Green"),
 dd("Coffee Is My Love Language", "twotone", "groovy", "groovy_p", ["COFFEE IS MY", "LOVE LANGUAGE"], "pink · groovy · caffeinated", "70s", ["coffee love language", "groovy pink mug", "gift for her", "coffee lover mug", "valentine coffee"], "Say it with caffeine.", "Pink|Maroon|Light Blue"),
 dd("Fuel Up Buttercup", "twotone", "rainbow", "rainbow_p", ["FUEL UP", "BUTTERCUP"], "COFFEE FIRST · FEELINGS LATER", "70s", ["fuel up buttercup", "pastel rainbow mug", "cute coffee mug", "gift for her", "coffee pun gift"], "Pastel rainbow, firm advice.", "Pink|Light Blue|Yellow"),
 dd("Frappe Happy", "twotone", "diner", "diner_t", ["Frappé", "Happy"], "COLD · SWEET · DINER STYLE", "50s", ["frappe happy", "teal diner mug", "retro 50s mug", "frappe lover gift", "coffee pun cup"], "A teal diner classic for the blended-coffee crowd.", "Light Blue|Blue|Black"),
 # latte mug
 dd("Sip Happens", "latte", "sunset", "sunset_t", ["SIP", "HAPPENS"], "AND THEN IT'S BETTER", "70s", ["sip happens mug", "funny coffee mug", "teal retro sunset", "coffee pun gift", "latte mug gift"], "A mellow teal sunset for rough mornings."),
 dd("Whole Latte Life", "latte", "checker", "checker_r", ["WHOLE LATTE", "LIFE"], "RACE TO THE ESPRESSO", "90s", ["whole latte life", "racing checker mug", "funny latte mug", "coffee pun gift", "latte lover gift"], "Checkered flag energy for a life that runs on lattes."),
 dd("Brew Ha Ha", "latte", "memphis", "memphis_b", ["BREW", "HA HA"], "LAUGH NOW · DRINK COFFEE", "80s", ["brew ha ha", "funny coffee mug", "80s pattern mug", "coffee pun mug", "office mug gift"], "A confetti pun for the office joker."),
 dd("Dreamy Steamy", "latte", "vapor", "vapor_s", ["DREAMY", "STEAMY"], "COFFEE AT SUNSET", "90s", ["dreamy steamy", "retrowave mug", "sunset coffee cup", "synthwave gift", "steamy latte mug"], "A dusky retrowave sunset for your steaming cup."),
 # enamel camp mug
 dd("Java Jam", "enamel", "cassette", "cass_t", ["JAVA JAM"], "MIXTAPE VOL. 1", "80s", ["java jam mug", "mixtape camp mug", "cassette coffee cup", "campfire coffee", "80s music gift"], "Mixtape Vol. 1: songs for slow campfire mornings."),
 dd("Stay Grounded", "enamel", "checker", "checker_t", ["STAY", "GROUNDED"], "COFFEE · NOT THE PUNISHMENT", "90s", ["stay grounded", "camp coffee mug", "checkered mug", "camping gift", "retro teal mug"], "Keep your feet on the ground and your hands on the mug."),
 dd("Brewed Awakening", "enamel", "sunburst", "burst_b", ["BREWED", "AWAKENING"], "OPEN EYES · CLOSED MOUTH", "70s", ["brewed awakening", "camp coffee mug", "camping gift", "sunburst coffee mug", "coffee pun mug"], "A very polite way to say please don't talk yet."),
 dd("Level Up Your Latte", "enamel", "pixel", "pixel_g", ["LEVEL UP", "YOUR LATTE"], "+10 CAFFEINE", "8-bit", ["level up latte", "gamer camp mug", "8 bit mug", "video game gift", "pixel latte cup"], "A green-screen pixel cup for the grinders."),
]
assert len(D) == 20 and len({x["name"] for x in D}) == 20

def slug(s): return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
def run(cmd): subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

def shoot(html, png, w, h, transparent):
    a = [CHROME, "--headless", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files", f"--window-size={w},{h}", f"--screenshot={png}", "file://" + html]
    if transparent: a.insert(5, "--default-background-color=00000000")
    run(a)

# ---------------- mockups: a clean studio preview of each blank (Printify makes its own for Etsy) ----------------
ACC = dict(Pink="#f2a7c3", Red="#c8372d", Orange="#ec8a2f", Maroon="#6e1f2d", Black="#1c1c1e", Blue="#2f5fb0", Yellow="#f2c94c", Green="#3f7d4e", **{"Light Blue": "#9ccbea", "Light Green": "#a8d8a0"})
def mockup_html(d, art, pw, ph):
    kind, acc = d["style"], ACC.get((d["colors"].split("|")[0] if d["colors"] else ""), "#ddd")
    body_fill = "#17171a" if kind == "black" else "#fbfaf7"
    if kind == "latte":
        body = "M 170 250 L 790 250 C 790 480 740 700 640 730 L 320 730 C 220 700 170 480 170 250 Z"; hand = '<path d="M 770 330 C 900 320 890 560 705 600" fill="none" stroke="#f4f1ec" stroke-width="40" stroke-linecap="round"/>'
        rim = (480, 250, 310, 34); ax, ay, ah = 480, 300, 420
    elif kind == "enamel":
        body = "M 205 310 L 755 310 L 755 700 Q 755 735 720 735 L 240 735 Q 205 735 205 700 Z"; hand = '<path d="M 755 380 C 880 375 880 640 750 650" fill="none" stroke="#2a2a2e" stroke-width="30" stroke-linecap="round"/>'
        rim = (480, 310, 275, 26); ax, ay, ah = 480, 345, 360
    else:
        body = "M 215 230 L 735 230 L 735 690 Q 735 745 685 745 L 265 745 Q 215 745 215 690 Z"; hc = acc if kind == "twotone" else ("#17171a" if kind == "black" else "#f4f1ec")
        hand = f'<path d="M 730 300 C 880 290 890 560 720 600" fill="none" stroke="{hc}" stroke-width="46" stroke-linecap="round"/>'
        rim = (475, 230, 260, 30); ax, ay, ah = 475, 250, 480
    aw = ah * pw / ph; inner = acc if kind == "twotone" else "#3b2418"
    rim_col = "#e9e5de" if kind not in ("black", "enamel") else ("#2b2b30" if kind == "black" else "#b9bcc2")
    gloss = ".28" if kind == "black" else ".18"
    return f'''<!doctype html><html><head><meta charset="utf-8"><style>html,body{{margin:0;background:#efe9e2}}</style></head><body>
<svg width="1000" height="900" viewBox="0 0 1000 900" xmlns="http://www.w3.org/2000/svg"><defs><clipPath id="b"><path d="{body}"/></clipPath>
<linearGradient id="sh" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".34"/><stop offset=".16" stop-color="#000" stop-opacity="0"/><stop offset=".6" stop-color="#fff" stop-opacity="{gloss}"/><stop offset=".7" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".38"/></linearGradient>
<filter id="ds"><feDropShadow dx="0" dy="18" stdDeviation="16" flood-opacity=".24"/></filter></defs>
<ellipse cx="475" cy="765" rx="340" ry="26" fill="#00000026"/>{hand}
<path d="{body}" fill="{body_fill}" filter="url(#ds)"/><g clip-path="url(#b)"><image href="{art}" x="{ax-aw/2:.0f}" y="{ay}" width="{aw:.0f}" height="{ah}" preserveAspectRatio="none"/></g>
<path d="{body}" fill="url(#sh)"/><ellipse cx="{rim[0]}" cy="{rim[1]}" rx="{rim[2]}" ry="{rim[3]}" fill="{rim_col}"/><ellipse cx="{rim[0]}" cy="{rim[1]+3}" rx="{rim[2]-22}" ry="{rim[3]-9}" fill="{inner}"/>
<text x="500" y="842" font-family="DejaVu Sans" font-size="22" letter-spacing="4" fill="#00000066" text-anchor="middle">{STYLES[kind]["label"].upper()}</text></svg></body></html>'''

def build(out):
    for sub in ("html", "prints", "mockups", "_mk"): os.makedirs(os.path.join(out, sub), exist_ok=True)
    rows, jobs = [], []
    for n, d in enumerate(D, 1):
        st = STYLES[d["style"]]; fn = f"{n:02d}-{slug(d['name'])}"; files = []
        for size, pw, ph, price in st["sizes"]:
            h = os.path.join(out, "html", f"{fn}-{size}.html"); png = os.path.join(out, "prints", f"{fn}-{size}.png")
            open(h, "w").write('<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent}svg{display:block}</style></head><body>' + art_svg(d, pw, ph) + "</body></html>")
            jobs.append(("art", h, png, pw, ph)); files.append((f"prints/{fn}-{size}.png", price, size, pw, ph))
        mk = os.path.join(out, "_mk", fn + ".html"); mkpng = os.path.join(out, "_mk", fn + ".png")
        open(mk, "w").write(mockup_html(d, f"../prints/{fn}-{files[0][2]}.png", files[0][3], files[0][4]))
        jobs.append(("mk", mk, mkpng, os.path.join(out, "mockups", fn + ".jpg"), 0))
        niche = d["tags"]; tags = []
        for t in niche + ["coffee mug", "funny coffee mug", "retro coffee mug", "throwback gift", "coffee lover gift", "ceramic mug", "gift for coffee lover", "coffee cup"]:
            t = t[:20].strip()
            if t and t not in tags: tags.append(t)
        kindword = {"ceramic_white": "Ceramic Coffee Mug", "black": "Black Coffee Mug", "twotone": "Color Accent Coffee Mug", "latte": "Latte Mug", "enamel": "Enamel Camp Mug"}[d["style"]]
        title = f"{d['name']} {kindword}, Funny Coffee Pun, Retro {d['era']} Throwback, " + ", ".join(x.title() for x in niche[:2]) + ", Coffee Lover Gift"
        while len(title) > 140: title = title.rsplit(",", 1)[0]
        sizes_txt = " and ".join(s[2] for s in files)
        made = {"ceramic_white": "White ceramic mug, C-handle, rounded corners", "black": "Glossy black ceramic mug with a C-handle", "twotone": "White ceramic mug with a colored inside and handle",
                "latte": "Wide, rounded latte mug for big pours", "enamel": "Enamel camp mug with a steel rim, light and tough for the trail"}[d["style"]]
        desc = (f"{d['name']}. {d['blurb']}\n\nDesign: " + " / ".join(d["lines"]) + f"\n\n• {made}\n• Printed to order just for you\n• Size: {sizes_txt}\n• Wash by hand to keep the print looking its best")
        rows.append(dict(sku=f"BB-DROP7-M{n:02d}", name=d["name"], style=d["style"], blueprint=st["bp"], colors=d["colors"],
                         file_a=files[0][0], price_a=f"{files[0][1]}.00", size_a=files[0][2],
                         file_b=files[1][0] if len(files) > 1 else "", price_b=f"{files[1][1]}.00" if len(files) > 1 else "", size_b=files[1][2] if len(files) > 1 else "",
                         mockup=f"mockups/{fn}.jpg", title=title, description=desc, tags=",".join(tags[:13])))
    def work(j):
        if j[0] == "art": shoot(j[1], j[2], j[3], j[4], True)
        else: shoot(j[1], j[2], 1000, 900, False); run(["convert", j[2], "-quality", "90", j[3]])
    with ThreadPoolExecutor(6) as ex: list(ex.map(work, [j for j in jobs if j[0] == "art"]))   # art before mockups
    with ThreadPoolExecutor(6) as ex: list(ex.map(work, [j for j in jobs if j[0] == "mk"]))
    with open(os.path.join(out, "listings.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
    run(["montage"] + [os.path.join(out, r["mockup"]) for r in rows] + ["-tile", "5x4", "-geometry", "360x324+6+6", "-background", "#efe9e2", os.path.join(out, "overview.jpg")])
    return rows

if __name__ == "__main__":
    rows = build(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "drop7"))
    print(len(rows), "mugs;", "max title", max(len(r["title"]) for r in rows), "min tags", min(len(r["tags"].split(",")) for r in rows))
