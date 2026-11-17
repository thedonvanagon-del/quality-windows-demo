"""Hand-sketched brew guides for other methods: espresso, AeroPress, French press.

Same approach as scenes_print_sketch (the pour-over): a fixed set per method so hard cuts between
steps read as one demo, a black-and-white figure whose arms are posed with inverse kinematics,
and every moving part sampled at 12 poses a second into CSS keyframes. Objects only appear in the
steps that use them (the kettle comes in for the water step), which keeps the counter clear.
Coordinates are design units for a 1080x1920 canvas.
"""
import html
import math

from scenes_print_sketch import KG, KS, KT, ease, lerp

L = 205
SR, SL = (330, 905), (170, 905)
IDLE_R, IDLE_L = (300, 1285), (205, 1285)
BROWN = "#4b2c17"

RECIPES = {
    "espresso": dict(steps=[
        (["A PROPER", "ESPRESSO."], ["Here's how."]),
        (["1. DOSE"], ["18 g, ground fine.", "Finer than table salt."]),
        (["2. TAMP"], ["Level it out.", "Tamp firm and flat."]),
        (["3. LOCK IN"], ["Lock it in.", "Start the shot."]),
        (["4. PULL"], ["About 36 g out in 25–30 seconds.", "That's 1:2."]),
        (["5. DRINK"], ["Crema on top.", "Drink it fresh."]),
    ]),
    "aeropress": dict(steps=[
        (["A PROPER", "AEROPRESS."], ["Here's how."]),
        (["1. ADD COFFEE"], ["Paper filter in the cap.", "15 g, ground medium-fine."]),
        (["2. ADD WATER"], ["240 g of hot water.", "That's 1:16."]),
        (["3. STIR + STEEP"], ["Stir for 10 seconds.", "Plunger in. Steep 1 minute."]),
        (["4. PRESS"], ["Press slowly, about 30 seconds.", "Stop when it hisses."]),
        (["5. DRINK"], ["That's it. Drink up."]),
    ]),
    "frenchpress": dict(steps=[
        (["A PROPER", "FRENCH PRESS."], ["Here's how."]),
        (["1. ADD COFFEE"], ["20 g, ground coarse.", "Like sea salt."]),
        (["2. ADD WATER"], ["300 g, just off the boil.", "That's 1:15."]),
        (["3. STIR + STEEP"], ["Stir. Lid on, plunger up.", "Steep 4 minutes."]),
        (["4. PRESS"], ["Press down slowly.", "Steady, no force."]),
        (["5. POUR"], ["Pour it all out now.", "Don't let it sit on the grounds."]),
    ]),
}


def ik(sh, target):
    dx, dy = target[0] - sh[0], target[1] - sh[1]
    d = max(1e-3, min(math.hypot(dx, dy), 2 * L - 1))
    a = math.atan2(dy, dx)
    b = math.acos(max(-1, min(1, d / (2 * L))))
    th1 = a + b
    ex, ey = sh[0] + L * math.cos(th1), sh[1] + L * math.sin(th1)
    tx, ty = sh[0] + d * math.cos(a), sh[1] + d * math.sin(a)
    th2 = math.atan2(ty - ey, tx - ex)
    return math.degrees(th1), math.degrees(th2 - th1), tx, ty


def tip_to_H(tx, ty, kw):
    ox, oy = (KT[0] - KG[0]) * KS, (KT[1] - KG[1]) * KS
    c, s = math.cos(math.radians(kw)), math.sin(math.radians(kw))
    return tx - (ox * c - oy * s), ty - (ox * s + oy * c)


def H_to_tip(H, kw):
    ox, oy = (KT[0] - KG[0]) * KS, (KT[1] - KG[1]) * KS
    c, s = math.cos(math.radians(kw)), math.sin(math.radians(kw))
    return H[0] + ox * c - oy * s, H[1] + ox * s + oy * c


def rot_about(p, pivot, deg):
    c, s = math.cos(math.radians(deg)), math.sin(math.radians(deg))
    x, y = p[0] - pivot[0], p[1] - pivot[1]
    return pivot[0] + x * c - y * s, pivot[1] + x * s + y * c


def build_brew(sc, C):
    P, w, h, rng, beat, PAL, fg, spot, ev, word_html = C.P, C.w, C.h, C.rng, C.beat, C.PAL, C.fg, C.spot, C.ev, C.word_html
    INK, CREAM, CORAL, PLUM = PAL["ink"], PAL["cream"], PAL["coral"], PAL["plum"]
    WHITE = "#fbf7ef"
    OY = 90
    method = sc["method"]
    step = int(sc.get("step", 0))
    head_lines, say_lines = RECIPES[method]["steps"][step]
    nsteps = len(RECIPES[method]["steps"]) - 1
    D = float(sc["duration"])
    N = int(round(D * 12))
    css = []

    def at(b):
        return b * beat

    def seq(t, keys):
        if t <= keys[0][0]:
            return keys[0][1]
        for (t0, v0), (t1, v1) in zip(keys, keys[1:]):
            if t <= t1:
                return lerp(v0, v1, ease((t - t0) / max(t1 - t0, 1e-6)))
        return keys[-1][1]

    # ------------------------------------------------------------ reusable motions
    def cup_cycle(t, lip, ready):
        """Hand brings a dose cup over, tips it, brings it back."""
        kw = seq(t, [(.6, 0), (1.1, 64), (2.2, 64), (2.7, 0)])
        c, sn = math.cos(math.radians(kw)), math.sin(math.radians(kw))
        Hc = (lip[0] - (100 * c + 40 * sn), lip[1] - (100 * sn - 40 * c))
        if t < .45:
            rh = lerp(IDLE_R, ready, ease(t / .45))
        elif t < .6:
            rh = ready
        elif t < 1.1:
            rh = lerp(ready, Hc, ease((t - .6) / .5))
        elif t < 2.7:
            rh = Hc
        else:
            rh = lerp(Hc, IDLE_R, ease((t - 2.7) / .3))
        return rh, (rh, kw)

    def kettle_pour(t, tip, t_on, t_off, t_end, wob=8.0, kwp=24.0):
        kw = seq(t, [(0, 0), (t_on, kwp), (t_off, kwp), (t_end, 0)])
        on = t_on <= t <= t_off
        ph = 2 * math.pi * 1.1 * t
        return tip_to_H(tip[0] + (wob * math.cos(ph) if on else 0), tip[1], kw), kw, on

    def wave(t):
        return (455 + 55 * math.sin(2 * math.pi * 1.6 * t), 735 + 14 * math.sin(2 * math.pi * 3.2 * t)) if t > .3 else IDLE_R

    # ------------------------------------------------------------ choreography per method / step
    readings, timer, falls = [], [], None

    def state(t):
        s = dict(rh=IDLE_R, lh=IDLE_L, kettle=None, cup=None, tool=None, T={}, O={}, F={}, S=[], pour_to=None)
        if step == 0:
            s["rh"] = wave(t)
        # ---------------- French press
        if method == "frenchpress":
            s["O"].update(lid=0, rod=0, grounds=1 if step > 1 else 0, crust=0, steam=0)
            s["F"].update(press=.85 if step >= 3 else 0, mug=0)
            if step == 1:
                s["rh"], s["cup"] = cup_cycle(t, (700, 975), (560, 1000))
                s["O"]["grounds"] = seq(t, [(1.3, 0), (2.3, 1)])
            elif step == 2:
                H, kw, on = kettle_pour(t, (690, 935), .5, 3.2, 3.7)
                s.update(rh=H, kettle=kw)
                f = seq(t, [(.6, 0), (3.2, .85)])
                s["F"]["press"] = f
                s["O"]["crust"] = seq(t, [(.8, 0), (2.0, 1)])
                if on:
                    s["pour_to"] = 1242 - f * 224
            elif step == 3:
                stir = t < 1.4
                s["rh"] = (690 + 26 * math.cos(2 * math.pi * 2.2 * t), 960 + 8 * math.sin(2 * math.pi * 2.2 * t)) if stir else \
                    seq(t, [(1.4, (690, 960)), (1.9, (690, 852)), (2.3, (690, 852)), (2.8, IDLE_R)])
                s["tool"] = ("spoon", 1.0 if stir else seq(t, [(1.4, 1), (1.5, 0)]))
                s["O"]["crust"] = seq(t, [(0, 1), (1.4, 0)])
                s["O"]["lid"] = s["O"]["rod"] = seq(t, [(1.6, 0), (1.7, 1)])
                s["T"]["rod"] = f"translate(0px,{seq(t, [(1.6, -110), (2.0, 0)]):.1f}px)"
                s["T"]["lid"] = s["T"]["rod"]
            elif step == 4:
                dy = seq(t, [(.4, 0), (2.6, 190)])
                s["O"]["lid"] = s["O"]["rod"] = 1
                s["T"]["rod"] = f"translate(0px,{dy:.1f}px)"
                s["rh"] = lerp(IDLE_R, (690, 852 + dy), ease(t / .4)) if t < .4 else (690, 852 + dy)
            elif step == 5:
                r = seq(t, [(.3, 0), (1.0, 40), (2.4, 40), (2.9, 0)])
                s["O"]["lid"] = s["O"]["rod"] = 1
                s["T"]["rod"] = "translate(0px,190px)"
                s["T"]["press"] = f"rotate({r:.1f}deg)"
                hx, hy = rot_about((565, 1115), (770, 1250), r)
                s["rh"] = lerp(IDLE_R, (hx, hy), ease(t / .3)) if t < .3 else (hx, hy)
                fm = seq(t, [(1.0, 0), (2.4, .8)])
                s["F"]["mug"] = fm
                s["F"]["press"] = seq(t, [(1.0, .85), (2.4, .2)])
                s["O"]["steam"] = seq(t, [(2.4, 0), (2.8, 1)])
                if 1.0 <= t <= 2.4:
                    sx, sy = rot_about((772, 1010), (770, 1250), r)
                    s["S"].append((sx, sy, 1245 - fm * 95))
        # ---------------- AeroPress
        elif method == "aeropress":
            s["O"].update(plunger=0, grounds=1 if step > 1 else 0, steam=0, press_all=1)
            s["F"].update(chamber=.75 if step == 3 else 0, mug=0)
            if step == 1:
                s["rh"], s["cup"] = cup_cycle(t, (700, 860), (560, 900))
                s["O"]["grounds"] = seq(t, [(1.3, 0), (2.3, 1)])
            elif step == 2:
                H, kw, on = kettle_pour(t, (690, 835), .4, 2.4, 2.9, 5)
                s.update(rh=H, kettle=kw)
                f = seq(t, [(.5, 0), (2.4, .75)])
                s["F"]["chamber"] = f
                if on:
                    s["pour_to"] = 1108 - f * 203
            elif step == 3:
                stir = t < 1.2
                s["rh"] = (690 + 18 * math.cos(2 * math.pi * 2.5 * t), 790) if stir else seq(t, [(1.2, (690, 790)), (1.6, IDLE_R)])
                s["tool"] = ("paddle", 1.0 if stir else seq(t, [(1.2, 1), (1.3, 0)]))
                s["O"]["plunger"] = seq(t, [(1.4, 0), (1.5, 1)])
                s["T"]["plunger"] = f"translate(0px,{seq(t, [(1.4, -150), (1.8, 0)]):.1f}px)"
            elif step == 4:
                dy = seq(t, [(.3, 0), (2.6, 170)])
                s["O"]["plunger"] = 1
                s["T"]["plunger"] = f"translate(0px,{dy:.1f}px)"
                s["rh"] = lerp(IDLE_R, (690, 712 + dy), ease(t / .3)) if t < .3 else (690, 712 + dy)
                s["F"]["chamber"] = seq(t, [(.3, .75), (2.6, .06)])
                fm = seq(t, [(.4, 0), (2.7, .72)])
                s["F"]["mug"] = fm
                if .4 <= t <= 2.7:
                    s["S"].append((690, 1128, 1245 - fm * 95))
            elif step == 5:
                s["O"]["plunger"] = 1
                s["T"]["plunger"] = "translate(0px,170px)"
                s["F"]["chamber"] = .06
                s["F"]["mug"] = .72
                s["O"]["press_all"] = seq(t, [(.3, 1), (.8, 0)])
                s["T"]["press_all"] = f"translate(0px,{seq(t, [(.3, 0), (.8, -120)]):.1f}px)"
                s["O"]["steam"] = seq(t, [(.8, 0), (1.2, 1)])
        # ---------------- Espresso
        elif method == "espresso":
            s["O"].update(mound=0, flat=1 if step > 2 else 0, light=1 if step >= 4 else 0, crema=0, steam=0, nine=0)
            s["F"].update(cup=.85 if step == 5 else 0)
            locked = "translate(170px,-265px)"
            s["T"]["pf"] = locked if step >= 4 else "translate(0px,0px)"
            s["T"]["needle"] = "rotate(-120deg)"
            if step == 1:
                s["rh"], s["cup"] = cup_cycle(t, (575, 1185), (470, 1100))
                s["O"]["mound"] = seq(t, [(1.3, 0), (2.3, 1)])
            elif step == 2:
                y = seq(t, [(0, 1100), (.6, 1150), (1.0, 1186), (1.4, 1150), (1.9, 1186), (2.3, 1150), (2.8, 1100)])
                s["rh"] = lerp(IDLE_R, (560, y), ease(t / .4)) if t < .4 else (560, y)
                s["tool"] = ("tamper", 1.0)
                s["O"]["mound"] = 0 if t > 1.0 else 1
                s["O"]["flat"] = 1 if t > 1.0 else 0
            elif step == 3:
                p = seq(t, [(.9, 0), (2.0, 1)])
                twist = seq(t, [(2.0, 0), (2.25, -7), (2.5, 0)])
                s["T"]["pf"] = f"translate({170 * p:.1f}px,{-265 * p:.1f}px) rotate({twist:.1f}deg)"
                grip = (560 - 140 + 170 * p, 1250 + 22 - 265 * p)
                s["rh"] = lerp(IDLE_R, grip, ease(t / .8)) if t < .8 else grip
                s["O"]["light"] = seq(t, [(2.5, 0), (2.6, 1)])
            elif step == 4:
                s["rh"] = (590, 1007)
                s["T"]["needle"] = f"rotate({seq(t, [(.2, -120), (.8, 20)]):.1f}deg)"
                s["O"]["nine"] = seq(t, [(.8, 0), (.9, 1)])
                fc = seq(t, [(.6, 0), (3.4, .85)])
                s["F"]["cup"] = fc
                if .6 <= t <= 3.4:
                    for x in (722, 738):
                        s["S"].append((x, 1022, 1202 - fc * 66))
                s["O"]["crema"] = seq(t, [(2.6, 0), (3.4, 1)])
            elif step == 5:
                s["rh"] = (590, 1007)
                s["T"]["needle"] = "rotate(20deg)"
                s["O"]["crema"] = 1
                s["O"]["steam"] = seq(t, [(.3, 0), (.7, 1)])
        return s

    if method == "frenchpress":
        readings = {1: [(0, "0"), (2.3, "20")], 2: [(0, "0"), (.9, "60"), (1.5, "150"), (2.1, "220"), (2.7, "300")]}.get(step, [])
        timer = {3: [(2.0, "0:00"), (2.5, "1:00"), (3.0, "2:00"), (3.4, "3:00"), (3.8, "4:00")]}.get(step, [])
        falls = ((700, 975), 245) if step == 1 else None
    elif method == "aeropress":
        readings = {1: [(0, "0"), (2.3, "15")], 2: [(0, "0"), (.8, "60"), (1.3, "120"), (1.8, "190"), (2.3, "240")]}.get(step, [])
        timer = {3: [(1.6, "0:00"), (2.1, "0:20"), (2.5, "0:40"), (2.9, "1:00")],
                 4: [(0, "1:00"), (.9, "1:10"), (1.8, "1:20"), (2.6, "1:30")]}.get(step, [])
        falls = ((700, 860), 225) if step == 1 else None
    else:
        readings = {4: [(0, "0"), (1.0, "8"), (1.6, "16"), (2.2, "24"), (2.8, "31"), (3.4, "36")], 5: [(0, "36")]}.get(step, [])
        timer = {4: [(.6, "0:00"), (1.3, "0:08"), (2.0, "0:15"), (2.7, "0:22"), (3.4, "0:28")]}.get(step, [])
        falls = ((575, 1185), 55) if step == 1 else None

    # ------------------------------------------------------------ poses
    states = []
    for k in range(N + 1):
        s = state(k / 12)
        r1, r2, rx, ry = ik(SR, s["rh"])
        l1, l2, lx, ly = ik(SL, s["lh"])
        s.update(r1=r1, r2=r2, rhand=(rx, ry), l1=l1, l2=l2)
        if s["kettle"] is not None and s["pour_to"] is not None:
            tx, ty = H_to_tip((rx, ry), s["kettle"])
            s["S"].insert(0, (tx, ty, s["pour_to"]))
        states.append(s)

    def kf(name, prop, fn):
        name = "bw_" + name
        rules = "".join(f"{100 * (k / 12) / D:.3f}%{{{prop}:{fn(k, states[k])}}}" for k in range(N + 1))
        css.append(f"@keyframes {name}{{{rules}}}")
        return f"animation:{name} {D:.4f}s linear forwards;transform-box:view-box;"

    def stepped(name, pairs, x, y, size, fill, extra=""):
        out = ""
        for i, (t0, val) in enumerate(pairs):
            t1 = pairs[i + 1][0] if i + 1 < len(pairs) else D + 1
            rules = "".join(f"{100 * (k / 12) / D:.3f}%{{opacity:{1 if t0 <= k / 12 < t1 else 0}}}" for k in range(N + 1))
            css.append(f"@keyframes bw_{name}{i}{{{rules}}}")
            out += txt(x, y, val, size, fill, extra=f"animation:bw_{name}{i} {D:.4f}s linear forwards;{extra}")
        return out

    # ------------------------------------------------------------ drawing helpers
    def wb(x1, y1, x2, y2, amp=2.2):
        Ln = math.hypot(x2 - x1, y2 - y1) or 1
        n = max(2, int(Ln / 60))
        nx, ny = -(y2 - y1) / Ln, (x2 - x1) / Ln
        pts = [(x1 + (x2 - x1) * i / n + nx * (rng.uniform(-amp, amp) if 0 < i < n else 0),
                y1 + (y2 - y1) * i / n + ny * (rng.uniform(-amp, amp) if 0 < i < n else 0)) for i in range(n + 1)]
        return "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in pts)

    def pth(d, wd=9, col=INK, fill="none", extra=""):
        return f'<path d="{d}" style="stroke:{col};stroke-width:{wd};fill:{fill};{extra}"/>'

    def pg(pts, fill=CREAM, wd=9, col=INK, amp=2.0):
        j = [(x + rng.uniform(-amp, amp), y + rng.uniform(-amp, amp)) for x, y in pts]
        return pth("M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in j) + " Z", wd, col, fill)

    def circ(cx, cy, r, fill=CREAM, wd=9, col=INK):
        pts = [(cx + r * (1 + rng.uniform(-.025, .025)) * math.cos(a / 24 * 2 * math.pi),
                cy + r * (1 + rng.uniform(-.025, .025)) * math.sin(a / 24 * 2 * math.pi)) for a in range(25)]
        return pth("M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in pts) + " Z", wd, col, fill)

    def txt(x, y, text, size, fill=INK, weight=700, anchor="middle", extra=""):
        return (f'<text x="{x}" y="{y}" text-anchor="{anchor}" style="font:{weight} {size}px Brothers;fill:{fill};'
                f'letter-spacing:.04em;{extra}">{html.escape(text)}</text>')

    def tg(name, inner, origin=(0, 0), default="translate(0px,0px)"):
        a = kf(name, "transform", lambda k, s: s["T"].get(name, default)) + f"transform-origin:{origin[0]}px {origin[1]}px;"
        return f'<g style="{a}">{inner}</g>'

    def og(name, inner, default=1.0):
        a = kf(name + "_o", "opacity", lambda k, s: f"{s['O'].get(name, default):.2f}")
        return f'<g style="{a}">{inner}</g>'

    def fill(name, d, bottom, color=BROWN):
        a = kf(name + "_f", "transform", lambda k, s: f"scale(1,{max(s['F'].get(name, 0), .001):.3f})") + f"transform-origin:0 {bottom}px;"
        return f'<g style="{a}"><path d="{d}" style="fill:{color};stroke:none"/></g>'

    def scale_box(x0, x1, y0=1250):
        return (pg([(x0, y0), (x1, y0), (x1 + 12, y0 + 50), (x0 - 12, y0 + 50)], CREAM, 9)
                + pg([(x1 - 130, y0 + 8), (x1 - 14, y0 + 8), (x1 - 14, y0 + 42), (x1 - 130, y0 + 42)], INK, 6)
                + txt(x0 + 58, y0 + 36, "SCALE", 22, INK, 500, extra="letter-spacing:.14em")
                + stepped("rd", readings or [(0, "0")], x1 - 72, y0 + 36, 28, CREAM, "")
                .replace("</text>", " g</text>"))

    def steam_lines(x0, y0, name="steam"):
        return og(name, "".join(pth(wb(x, y0, x + 8, y0 - 60, 4), 6, INK) for x in (x0 - 30, x0, x0 + 30)), 0)

    # ------------------------------------------------------------ set
    back = [pth(wb(30, 1300, 1050, 1300), 12),
            pg([(30, 1300), (1050, 1300), (1050, 1440), (30, 1440)], "rgba(120,80,30,.22)", 8)]
    back += [pth(wb(x, 1312, x, 1432, 1.5), 4, "rgba(27,20,16,.45)") for x in range(110, 1050, 150)]
    front = []  # drawn above the figure's arms? no: set pieces the hand must sit over go in back

    if method == "frenchpress":
        back.append(scale_box(560, 820))
        mug = (fill("mug", "M868,1152 L972,1152 L968,1245 L872,1245 Z", 1245)
               + pg([(860, 1145), (980, 1145), (975, 1250), (865, 1250)], "none", 9)
               + pth("M980,1165 C1030,1160 1034,1235 976,1232", 9) + steam_lines(920, 1120))
        back.append(mug)
        press_body = (fill("press", "M618,1018 L762,1018 L762,1242 L618,1242 Z", 1242)
                      + og("grounds", pg([(618, 1206), (762, 1206), (762, 1242), (618, 1242)], "#2e1a0d", 4), 0)
                      + og("crust", pg([(618, 1052), (762, 1052), (762, 1074), (618, 1074)], "#2e1a0d", 4)
                           + "".join(circ(rng.uniform(628, 752), rng.uniform(1056, 1070), 3, CREAM, 2) for _ in range(10)), 0)
                      + pth("M610,1010 L610,1250 L770,1250 L770,1010", 11)
                      + pth(wb(610, 1100, 770, 1100, 1), 5, "rgba(27,20,16,.35)") + pth(wb(610, 1180, 770, 1180, 1), 5, "rgba(27,20,16,.35)")
                      + pth("M766,1010 L782,1000", 9)
                      + pth("M610,1050 C560,1055 558,1115 565,1115 C558,1120 560,1176 610,1180", 11)
                      + og("lid", tg("lid", pg([(598, 992), (782, 992), (782, 1010), (598, 1010)], CREAM, 8)), 0)
                      + og("rod", tg("rod", pth("M690,1000 L690,866", 9) + circ(690, 852, 17, INK, 4)
                                    + pth("M622,1030 L758,1030", 10) + pth("M630,1036 L750,1036", 4, INK, "none", "stroke-dasharray:8 6")), 0))
        back.append(tg("press", press_body, (770, 1250), "rotate(0deg)"))
    elif method == "aeropress":
        back.append(scale_box(560, 820))
        mug = (fill("mug", "M642,1140 L738,1140 L734,1245 L646,1245 Z", 1245)
               + pg([(630, 1130), (750, 1130), (745, 1250), (635, 1250)], "none", 9)
               + pth("M750,1150 C795,1146 798,1225 745,1222", 9) + steam_lines(690, 1110))
        back.append(mug)
        chamber = (fill("chamber", "M651,905 L729,905 L729,1108 L651,1108 Z", 1108)
                   + og("grounds", pg([(651, 1084), (729, 1084), (729, 1108), (651, 1108)], "#2e1a0d", 4), 0)
                   + pth("M645,880 L645,1110 L735,1110 L735,880", 10)
                   + pg([(628, 872), (752, 872), (752, 884), (628, 884)], CREAM, 7)
                   + pg([(633, 1108), (747, 1108), (747, 1130), (633, 1130)], INK, 6)
                   + "".join(pth(f"M647,{y} L668,{y}", 5) for y in (1060, 1020, 980, 940))
                   + og("plunger", tg("plunger", pg([(652, 724), (728, 724), (728, 900), (652, 900)], "rgba(241,228,198,.85)", 8)
                                      + pg([(636, 712), (744, 712), (744, 726), (636, 726)], CREAM, 7)
                                      + pg([(650, 896), (730, 896), (730, 912), (650, 912)], INK, 4)), 0))
        back.append(og("press_all", tg("press_all", chamber)))
    else:
        mach = (pg([(650, 820), (1010, 820), (1010, 1255), (650, 1255)], CREAM, 10)
                + pg([(640, 806), (1020, 806), (1020, 822), (640, 822)], INK, 6)
                + pg([(680, 945), (780, 945), (780, 985), (680, 985)], INK, 6)
                + circ(900, 920, 46, WHITE, 8) + txt(900, 958, "BAR", 16, INK, 500, extra="letter-spacing:.1em")
                + "".join(pth(wb(900 + 34 * math.cos(math.radians(a)), 920 + 34 * math.sin(math.radians(a)),
                                 900 + 44 * math.cos(math.radians(a)), 920 + 44 * math.sin(math.radians(a)), .5), 4)
                          for a in range(-210, 31, 30))
                + tg("needle", pth("M900,920 L936,920", 6, CORAL) + circ(900, 920, 7, INK, 2), (900, 920), "rotate(-120deg)")
                + og("nine", txt(900, 890, "9", 26, CORAL), 0)
                + og("light", circ(960, 1010, 14, CORAL, 5), 0) + circ(960, 1010, 14, "none", 5)
                + pth("M990,960 C1000,1010 996,1060 1004,1110", 10)
                + pg([(660, 1232), (800, 1232), (800, 1255), (660, 1255)], INK, 5)
                + pg([(675, 1204), (785, 1204), (785, 1232), (675, 1232)], CREAM, 6)
                + stepped("rd", readings or [(0, "0")], 730, 1226, 20, INK).replace("</text>", " g</text>")
                + fill("cup", "M707,1136 L753,1136 L750,1202 L710,1202 Z", 1202)
                + og("crema", pth("M707,1142 L753,1142", 8, "#c08a52"), 0)
                + pg([(700, 1128), (760, 1128), (755, 1204), (705, 1204)], "none", 8)
                + pth("M760,1140 C786,1138 788,1186 756,1184", 8) + steam_lines(730, 1105))
        back.append(mach)
        pf = (pth("M520,1265 L380,1272", 22) + pth("M520,1265 L380,1272", 10, PLUM)
              + pg([(520, 1250), (600, 1250), (594, 1280), (526, 1280)], CREAM, 8)
              + pth("M548,1280 L548,1292", 7) + pth("M572,1280 L572,1292", 7)
              + og("mound", pth("M528,1252 Q560,1222 592,1252 Z", 6, INK, BROWN), 0)
              + og("flat", pth("M528,1250 L592,1250", 9, BROWN), 0))
        back.append(tg("pf", pf, (560, 1265)))

    # ------------------------------------------------------------ timer card
    if timer:
        back.append(pg([(785, 560), (1025, 560), (1025, 750), (785, 750)], CREAM, 9)
                    + txt(905, 600, "TIMER", 30, PLUM, 500, extra="letter-spacing:.2em")
                    + stepped("tm", timer, 905, 695, 92, INK)
                    + txt(905, 735, "(SPED UP)", 24, PLUM, 500, extra="letter-spacing:.14em"))

    # ------------------------------------------------------------ figure (black and white, minimal)
    ch = [pg([(178, 905), (322, 905), (338, 1300), (162, 1300)], WHITE, 9), pth(wb(250, 858, 250, 905, 1), 9)]
    limb = pth(f"M0,0 L{L},0", 20, INK)

    def arm(sh, a1, a2, name):
        ua = kf(name + "u", "transform", lambda k, s: f"rotate({s[a1]:.2f}deg)") + "transform-origin:0 0;"
        fa = kf(name + "f", "transform", lambda k, s: f"rotate({s[a2]:.2f}deg)") + "transform-origin:0 0;"
        return (f'<g transform="translate({sh[0]} {sh[1]})"><g style="{ua}">{limb}'
                f'<g transform="translate({L} 0)"><g style="{fa}">{limb}{circ(L, 0, 20, WHITE, 8)}</g></g></g></g>')

    larm = arm(SL, "l1", "l2", "la")
    rarm = arm(SR, "r1", "r2", "ra")

    held = ""
    if any(s["kettle"] is not None for s in states):
        def ket(k, s):
            H, kw = s["rhand"], s["kettle"] or 0
            return f"translate({H[0]:.1f}px,{H[1]:.1f}px) rotate({kw:.1f}deg) scale({KS}) translate({-KG[0]}px,{-KG[1]}px)"
        held += (f'<g style="{kf("ket", "transform", ket)}transform-origin:0 0;">'
                 + pth("M0,40 L150,40 Q166,100 158,150 L-8,150 Q-16,100 0,40 Z", 10, INK, CREAM)
                 + pth("M24,40 L126,40", 10) + circ(75, 22, 11, INK, 4) + pth("M0,58 C-72,52 -82,128 -6,138", 11)
                 + pth("M150,128 C196,120 232,100 238,60 C240,40 252,30 268,28", 12) + pth("M12,84 L140,84", 5, CORAL) + "</g>")
    if any(s["cup"] is not None for s in states):
        def cup_tf(k, s):
            if s["cup"] is None:
                return "translate(-500px,0px)"
            (H, kw) = s["cup"]
            return f"translate({H[0]:.1f}px,{H[1]:.1f}px) rotate({kw:.1f}deg)"
        held += (f'<g style="{kf("cup", "transform", cup_tf)}transform-origin:0 0;">'
                 + pg([(0, -85), (105, -85), (92, 0), (12, 0)], CORAL, 9) + pth("M-4,-85 L109,-85", 10) + "</g>")
    if falls:
        (lx, ly), dist = falls
        css.append(f"@keyframes bw_fall{{from{{opacity:1;transform:translateY(0)}}to{{opacity:1;transform:translateY({dist}px)}}}}")
        held += "".join(
            f'<circle cx="{lx + rng.uniform(-14, 14):.0f}" cy="{ly + 8}" r="{rng.uniform(3, 6):.1f}" style="fill:{BROWN};stroke:none;'
            f'opacity:0;animation:bw_fall {max(.25, dist / 650):.2f}s linear {1.15 + .09 * i:.2f}s forwards"/>' for i in range(12))
    tools = [s["tool"][0] for s in states if s["tool"]]
    if tools:
        kind = tools[0]
        if kind == "spoon":
            art = pth("M0,0 L6,150", 9) + pth("M2,150 Q6,175 12,150", 8, INK, INK)
        elif kind == "paddle":
            art = pth("M0,0 L0,140", 10) + pg([(-14, 140), (14, 140), (14, 200), (-14, 200)], CREAM, 7)
        else:  # tamper
            art = circ(0, 0, 20, PLUM, 7) + pth("M0,18 L0,52", 14) + pg([(-38, 52), (38, 52), (38, 66), (-38, 66)], INK, 5)
        tool_tf = kf("tool", "transform", lambda k, s: f"translate({s['rhand'][0]:.1f}px,{s['rhand'][1]:.1f}px)")
        tool_o = kf("tool_o", "opacity", lambda k, s: f"{s['tool'][1] if s['tool'] else 0:.2f}")
        held += f'<g style="{tool_o}"><g style="{tool_tf}transform-origin:0 0;">{art}</g></g>'

    streams = ""
    for i in range(max((len(s["S"]) for s in states), default=0)):
        def st_tf(k, s, i=i):
            if i >= len(s["S"]):
                return "translate(0px,0px) scale(1,.0001)"
            x, y0, y1 = s["S"][i]
            return f"translate({x:.1f}px,{y0:.1f}px) scale(1,{max(y1 - y0, 1) / 100:.3f})"
        streams += (f'<g style="{kf(f"st{i}", "transform", st_tf)}transform-origin:0 0;">'
                    f'<line x1="0" y1="0" x2="0" y2="100" style="stroke:{INK};stroke-width:{8 if method == "espresso" else 11};vector-effect:non-scaling-stroke"/>'
                    f'<line x1="0" y1="0" x2="0" y2="100" style="stroke:{CREAM if method != "espresso" else "#c08a52"};stroke-width:4;'
                    f'vector-effect:non-scaling-stroke;stroke-dasharray:16 12;animation:bw_flow .5s linear infinite"/></g>')
    css.append("@keyframes bw_flow{to{stroke-dashoffset:-28}}")

    blink = kf("bl", "transform", lambda k, s: "scale(1,.12)" if k in (int(N * .3), int(N * .7)) else "scale(1,1)") + "transform-origin:0 752px;"
    head_a = kf("hd", "transform", lambda k, s: f"translate(0px,{3 * math.sin(2 * math.pi * (k / 12) / (2 * beat)):.1f}px)")
    head = (f'<g style="{head_a}">' + circ(250, 745, 100, WHITE, 9)
            + f'<g style="{blink}">{circ(214, 752, 7, INK, 2)}{circ(286, 752, 7, INK, 2)}</g>'
            + f'<path d="M220,792 Q250,818 280,792" style="stroke:{INK};stroke-width:8;fill:none"/></g>')

    scene_svg = (f'<svg class="sk" viewBox="0 0 1080 1920" style="position:absolute;left:0;top:0;width:{w}px;height:{h}px">'
                 f'<g transform="translate(0 {OY})">' + "".join(back) + "".join(ch) + larm + held + streams + rarm + head
                 + "".join(front) + "</g></svg>")

    # ------------------------------------------------------------ bubble, header, dots
    BY = OY + (60 if step == 0 else 0)
    t0_, b0_ = 300 + BY, 530 + BY
    bd = (f"M96,{t0_} L984,{t0_} Q1012,{t0_} 1012,{t0_ + 28} L1012,{b0_ - 28} Q1012,{b0_} 984,{b0_} L96,{b0_} "
          f"Q68,{b0_} 68,{b0_ - 28} L68,{t0_ + 28} Q68,{t0_} 96,{t0_} Z")
    tail = f"M205,{b0_ - 2} L292,{b0_ - 2} L252,{636 + OY} Z"
    bat = at(.45)
    ev.append((bat, "slap"))
    bubble = (f'<svg class="over" viewBox="0 0 {w} {h}" style="left:0;top:0">'
              f'<path d="{tail}" pathLength="1" style="animation-name:draw,fillin;animation-duration:{.4 * beat:.3f}s,{.2 * beat:.3f}s;'
              f'animation-delay:{bat:.3f}s,{bat + .2 * beat:.3f}s;stroke:{INK};stroke-width:9px;fill:{CREAM};fill-opacity:0"/>'
              f'<path d="{bd}" pathLength="1" style="animation-name:draw,fillin;animation-duration:{.5 * beat:.3f}s,{.2 * beat:.3f}s;'
              f'animation-delay:{bat:.3f}s,{bat + .25 * beat:.3f}s;stroke:{INK};stroke-width:9px;fill:{CREAM};fill-opacity:0"/>'
              f'<path d="M222,{b0_ - 2} L276,{b0_ - 2}" pathLength="1" style="animation-name:fillin;animation-duration:{.2 * beat:.3f}s;'
              f'animation-delay:{bat + .35 * beat:.3f}s;stroke:{CREAM};stroke-width:12px;fill:none;stroke-dasharray:none;'
              f'stroke-dashoffset:0;opacity:1"/></svg>')
    fs = 56 if len(say_lines) > 1 else 72
    say_html = "".join(f'<div style="font:400 {fs}px/1.15 BrothersSlant,Brothers,sans-serif;color:{INK};white-space:nowrap">'
                       f'{html.escape(ln)}</div>' for ln in say_lines)
    say = (f'<div class="word abs" style="left:{P(70)}px;top:{P(t0_)}px;width:{P(940)}px;height:{P(230)}px;display:flex;'
           f'flex-direction:column;justify-content:center;align-items:center;--r:0deg;--dx:0px;--dy:{P(30)}px;'
           f'animation-delay:{bat + .3 * beat:.3f}s">{say_html}</div>')
    if step == 0:
        header = (f'<div class="abs" style="left:{P(70)}px;top:{P(90)}px;width:{P(940)}px">'
                  + word_html(head_lines[0], 0, P(100), -2, width=P(780))
                  + word_html(head_lines[1], at(1.0), P(125), 1.5, fill=spot, shadow=fg, width=P(940), scrib_at=at(2.0)) + "</div>")
    else:
        header = (f'<div class="abs" style="left:{P(70)}px;top:{P(110)}px;width:{P(940)}px">'
                  + word_html(head_lines[0], 0, P(170), -1.5, width=P(940), scrib_at=at(1.0)) + "</div>")
    ev.append((0, "slap"))
    dots = ""
    x0 = 540 - (nsteps * 80 - 36) / 2
    for i in range(nsteps):
        cur = (i + 1 == step)
        dots += (f'<div class="word abs" style="left:{P(x0 + i * 80)}px;top:{P(1590)}px;width:{P(44)}px;height:{P(44)}px;'
                 f'border-radius:50%;border:{P(6)}px solid {INK};background:{CORAL if cur else "transparent"};--r:0deg;--dx:0px;'
                 f'--dy:0px;animation-delay:{at(.2 + .1 * i):.3f}s"></div>')
    css.append(".sk path{stroke-linecap:round;stroke-linejoin:round}.sk text{white-space:pre}.word.abs{white-space:nowrap}")
    return header + scene_svg + bubble + say + dots, "".join(css)
