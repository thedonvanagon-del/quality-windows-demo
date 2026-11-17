"""A hand-sketched barista showing how to make a pour-over, one step per scene.

The set is fixed (counter, scale, mug, dripper, kettle) so hard cuts between steps read as one
continuous demo. Arms are two-link limbs posed with inverse kinematics, so the pouring hand really
traces circles over the dripper and the kettle stays in it. Every moving part is sampled at 12
poses a second and written out as CSS keyframes, which is what makes it look hand-animated.
Coordinates are design units for a 1080x1920 canvas.
"""
import html
import math

SR, SL = (330, 905), (170, 905)     # shoulders (screen right / left)
L = 190                             # upper arm and forearm length
DX, SURF, TIPY = 840, 1072, 925     # dripper centre x, grounds surface y, kettle tip height
KS = .75                            # kettle scale
KG, KT = (-52, 92), (268, 28)       # kettle grip point and spout tip, local coordinates
HREST = (410, 1250)                 # hand position when the kettle sits on the counter
IDLE_R, IDLE_L = (300, 1285), (205, 1285)
HEAD = (250, 745)


def ease(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def lerp(a, b, x):
    return tuple(p + (q - p) * x for p, q in zip(a, b)) if isinstance(a, tuple) else a + (b - a) * x


def ik(sh, target):
    """Two-link arm, elbow down. Returns (upper angle deg, forearm angle relative deg, hand x, hand y)."""
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


STEPS = {
    0: dict(head=["A PROPER", "POUR-OVER."], say=["Here's how."]),
    1: dict(head=["1. SET UP"], say=["Scale. Dripper. Paper filter.", "Kettle. Water just off the boil."]),
    2: dict(head=["2. RINSE"], say=["Rinse the paper filter", "with hot water. Dump it."]),
    3: dict(head=["3. ADD COFFEE"], say=["20 g, ground medium-fine.", "Like table salt."]),
    4: dict(head=["4. BLOOM"], say=["Pour 40 g, just to wet it.", "Wait about 30 seconds."]),
    5: dict(head=["5. POUR"], say=["Slow circles up to 320 g.", "About 3 minutes in all."]),
    6: dict(head=["6. DRINK"], say=["That's a proper pour-over."]),
}


def build_sketch(sc, C):
    P, w, h, rng, beat, PAL, fg, spot, ev, word_html = C.P, C.w, C.h, C.rng, C.beat, C.PAL, C.fg, C.spot, C.ev, C.word_html
    INK, CREAM, CORAL, PLUM = PAL["ink"], PAL["cream"], PAL["coral"], PAL["plum"]
    BROWN = "#4b2c17"
    OY = 90
    step = int(sc.get("step", 0))
    cfg = STEPS[step]
    D = float(sc["duration"])
    N = int(round(D * 12))
    css = []

    def at(b):
        return b * beat

    # ------------------------------------------------------------ choreography
    def kettle_cycle(t, t_up, t_p0, t_p1, t_down, rfun, rate, kw_pour=22.0):
        """Right hand + kettle through pick up, pour in circles, put down."""
        def Hp(tt):
            r = rfun(tt)
            ph = 2 * math.pi * rate * (tt - t_p0)
            return tip_to_H(DX + r * math.cos(ph), TIPY + 5 * math.sin(ph * .5), kw_pour)
        out = dict(rh=IDLE_R, kw=0.0, held=False, stream=False)
        if t < t_up - .4:
            pass
        elif t < t_up:
            out["rh"] = lerp(IDLE_R, HREST, ease((t - (t_up - .4)) / .4))
        elif t < t_p0:
            x = ease((t - t_up) / max(t_p0 - t_up, 1e-3))
            out.update(rh=lerp(HREST, Hp(t_p0), x), kw=kw_pour * x, held=True)
        elif t < t_p1:
            out.update(rh=Hp(t), kw=kw_pour, held=True, stream=True)
        elif t < t_down:
            x = ease((t - t_p1) / max(t_down - t_p1, 1e-3))
            out.update(rh=lerp(Hp(t_p1), HREST, x), kw=kw_pour * (1 - x), held=True)
        else:
            x = ease((t - t_down) / .4)
            out["rh"] = lerp(HREST, IDLE_R, x)
        return out

    def seq(t, keys):
        if t <= keys[0][0]:
            return keys[0][1]
        for (t0, v0), (t1, v1) in zip(keys, keys[1:]):
            if t <= t1:
                return lerp(v0, v1, ease((t - t0) / (t1 - t0)))
        return keys[-1][1]

    def stepped(t, pairs, default=""):
        cur = default
        for tt, txt in pairs:
            if t >= tt:
                cur = txt
        return cur

    readings, timer = [("0", 0)], []
    cup_on = mug_lift = False
    reading_pairs = [(0, "0")]
    timer_pairs = []

    def state(t):
        s = dict(rh=IDLE_R, lh=IDLE_L, kw=0.0, held=False, stream=False, fill=0.0, grounds=0.0, dome=0.0,
                 cup=None, mug=(0.0, 0.0, 0.0), dripper=1.0, mouth="smile", steam=0.0, tilt=0.0)
        if step == 0:
            s["rh"] = (455 + 55 * math.sin(2 * math.pi * 1.6 * t), 735 + 14 * math.sin(2 * math.pi * 3.2 * t)) if t > .3 else IDLE_R
        elif step == 1:
            s["rh"] = seq(t, [(0, IDLE_R), (.5, (600, 1010)), (1.3, (610, 1040)), (2.0, (590, 1170)), (2.7, (600, 1060)), (3.0, IDLE_R)])
        elif step == 2:
            s.update(kettle_cycle(t, .5, 1.0, 2.1, 2.6, lambda tt: 25 + 20 * math.sin((tt - 1.0) * 2.0), 1.1))
            s["fill"] = seq(t, [(1.1, 0), (2.1, .3), (2.35, .3), (2.9, 0)])
        elif step == 3:
            lip = (815, 990)
            kw = seq(t, [(.6, 0), (1.1, 64), (2.2, 64), (2.7, 0)])
            c, sn = math.cos(math.radians(kw)), math.sin(math.radians(kw))
            ready = (610, 1010)
            Hc = (lip[0] - (100 * c + 40 * sn), lip[1] - (100 * sn - 40 * c)) if t > .6 else ready
            Hc = lerp(ready, Hc, ease((t - .6) / .5)) if .6 < t < 1.1 else Hc
            s["rh"] = lerp(IDLE_R, ready, ease(t / .45)) if t < .45 else (Hc if t < 2.7 else lerp(Hc, IDLE_R, ease((t - 2.7) / .3)))
            s["cup"] = (s["rh"], kw)
            s["grounds"] = seq(t, [(1.3, 0), (2.3, 1)])
        elif step == 4:
            s.update(kettle_cycle(t, .1, .35, 1.9, 2.4, lambda tt: 8 + 14 * (tt - .35) / 1.55, 1.3))
            s["grounds"] = 1.0
            s["dome"] = seq(t, [(.5, 0), (1.9, 1), (3.0, .75), (4.0, .6)])
            s["fill"] = seq(t, [(2.8, 0), (4.0, .04)])
        elif step == 5:
            s.update(kettle_cycle(t, .1, .35, 5.3, 5.8, lambda tt: 40 + 14 * math.sin((tt - .35) * .9), 1.0))
            s["grounds"] = 1.0
            s["dome"] = seq(t, [(0, .6), (.8, .3), (5, 0)])
            s["fill"] = seq(t, [(0, .04), (5.7, .76)])
        elif step == 6:
            s["dripper"] = 1 - ease(t / .5)
            m = seq(t, [(.4, (0, 0, 0)), (1.3, (-415, -420, 0)), (1.8, (-415, -420, 0)), (2.1, (-430, -410, -14)), (3.0, (-430, -410, -14))])
            s["mug"] = m
            hx, hy = 955 + m[0], 1190 + m[1]
            s["rh"] = lerp(IDLE_R, (hx - 12, hy), ease((t - .3) / .7)) if t < 1.0 else (hx - 12, hy)
            s["fill"] = .8
            s["steam"] = ease((t - 1.2) / .4)
            s["mouth"] = "open" if t > 2.0 else "smile"
            s["tilt"] = seq(t, [(1.8, 0), (2.2, -6), (3.0, -6)])
        else:
            pass
        if step in (2, 4, 5) and s["held"]:
            pass
        return s

    # reading / timer schedule per step
    reading_pairs = {3: [(0, "0"), (2.3, "20")], 4: [(0, "0"), (.7, "8"), (1.0, "17"), (1.3, "29"), (1.6, "40")],
                     5: [(0, "40")] + [(.5 + .6 * i, str(80 + 40 * i)) for i in range(7)]}.get(step, [(0, "0")])
    timer_pairs = {4: [(.5, "0:00"), (1.3, "0:10"), (2.1, "0:20"), (2.9, "0:30"), (3.6, "0:40")],
                   5: [(0, "0:45"), (1.0, "1:00"), (2.0, "1:30"), (3.0, "2:00"), (4.0, "2:30"), (5.0, "3:00")]}.get(step, [])

    # ------------------------------------------------------------ precompute poses
    states = []
    for k in range(N + 1):
        t = k / 12
        s = state(t)
        r1, r2, rx, ry = ik(SR, s["rh"])
        l1, l2, lx, ly = ik(SL, s["lh"])
        s.update(r1=r1, r2=r2, rhand=(rx, ry), l1=l1, l2=l2, lhand=(lx, ly))
        states.append(s)

    def kf(name, prop, fn):
        name = "sk_" + name
        rules = "".join(f"{100 * (k / 12) / D:.3f}%{{{prop}:{fn(k, states[k])}}}" for k in range(N + 1))
        css.append(f"@keyframes {name}{{{rules}}}")
        return f"animation:{name} {D:.4f}s linear forwards;transform-box:view-box;"

    # ------------------------------------------------------------ drawing helpers
    def wb(x1, y1, x2, y2, amp=2.2):
        Ln = math.hypot(x2 - x1, y2 - y1) or 1
        n = max(2, int(Ln / 60))
        nx, ny = -(y2 - y1) / Ln, (x2 - x1) / Ln
        pts = []
        for i in range(n + 1):
            o = rng.uniform(-amp, amp) if 0 < i < n else 0
            pts.append((x1 + (x2 - x1) * i / n + nx * o, y1 + (y2 - y1) * i / n + ny * o))
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

    def stepped_opacity(name, pairs):
        """A text node per reading, visible between its time and the next one."""
        out = []
        for i, (t0, val) in enumerate(pairs):
            t1 = pairs[i + 1][0] if i + 1 < len(pairs) else D + 1
            rules = "".join(f"{100 * (k / 12) / D:.3f}%{{opacity:{1 if t0 <= k / 12 < t1 else 0}}}" for k in range(N + 1))
            css.append(f"@keyframes sk_{name}{i}{{{rules}}}")
            out.append((val, f"animation:sk_{name}{i} {D:.4f}s linear forwards;"))
        return out

    # ------------------------------------------------------------ static set
    back = []
    back.append(pth(wb(30, 1300, 1050, 1300), 12))
    back.append(pg([(30, 1300), (1050, 1300), (1050, 1440), (30, 1440)], "rgba(120,80,30,.22)", 8))
    for x in range(110, 1050, 150):
        back.append(pth(wb(x, 1312, x, 1432, 1.5), 4, "rgba(27,20,16,.45)"))

    # scale + readings
    back.append(pg([(700, 1250), (980, 1250), (992, 1300), (688, 1300)], CREAM, 9))
    back.append(pg([(840, 1258), (966, 1258), (966, 1292), (840, 1292)], INK, 6))
    for val, anim in stepped_opacity("rd", reading_pairs):
        back.append(txt(903, 1286, val + " g", 28, CREAM, extra=anim))
    back.append(txt(770, 1286, "SCALE", 24, INK, 500, extra="letter-spacing:.14em"))

    # fill + mug + steam (the mug can be carried off in step 6)
    def mug_tf(k, s):
        mx, my, mr = s["mug"]
        return f"translate({mx:.1f}px,{my:.1f}px) rotate({mr:.1f}deg)"
    mug_anim = kf("mug", "transform", mug_tf) + "transform-origin:840px 1190px;"
    mug = []
    fill_anim = kf("fill", "transform", lambda k, s: f"scale(1,{max(s['fill'], .001):.3f})") + "transform-origin:0 1244px;"
    mug.append(f'<g style="{fill_anim}"><path d="M782,1143 L896,1143 L893,1244 L785,1244 Z" style="fill:{BROWN};stroke:none"/></g>')
    mug.append(pg([(770, 1128), (910, 1128), (904, 1250), (776, 1250)], "none", 9))
    mug.append(pth("M910,1150 C965,1145 972,1228 905,1226", 9))
    steam_anim = kf("steam", "opacity", lambda k, s: f"{s['steam']:.2f}")
    mug.append(f'<g style="{steam_anim}">' + "".join(pth(wb(x, 1100, x + 8, 1040, 4), 6, INK) for x in (810, 840, 870)) + "</g>")
    back.append(f'<g style="{mug_anim}">{"".join(mug)}</g>')

    # dripper, filter, grounds, dome
    drip_anim = kf("drip", "opacity", lambda k, s: f"{s['dripper']:.2f}")
    dr = []
    dr.append(pg([(745, 1040), (935, 1040), (868, 1140), (812, 1140)], CORAL, 9))
    dr.append(pth(wb(732, 1036, 948, 1036), 13))
    dr.append(pth("M762,1052 L822,1134", 4, INK, "none", "stroke-dasharray:10 9"))
    dr.append(pth("M918,1052 L858,1134", 4, INK, "none", "stroke-dasharray:10 9"))
    g_anim = kf("grd", "opacity", lambda k, s: f"{s['grounds']:.2f}")
    dr.append(f'<g style="{g_anim}">' + pg([(786, 1075), (894, 1075), (864, 1134), (816, 1134)], BROWN, 6)
              + "".join(circ(rng.uniform(796, 884), rng.uniform(1080, 1100), 3, INK, 3) for _ in range(14)) + "</g>")
    d_anim = kf("dome", "transform", lambda k, s: f"scale(1,{max(s['dome'], .001):.3f})") + "transform-origin:0 1078px;"
    dr.append(f'<g style="{d_anim}"><path d="M790,1078 C800,1038 880,1038 890,1078 Z" style="fill:{BROWN};stroke:{INK};stroke-width:7"/>'
              + "".join(circ(x, y, 5, CREAM, 3) for x, y in ((820, 1060), (845, 1050), (866, 1064)))
              + "</g>")
    back.append(f'<g style="{drip_anim}">{"".join(dr)}</g>')

    # timer card
    if timer_pairs:
        back.append(pg([(785, 560), (1025, 560), (1025, 750), (785, 750)], CREAM, 9))
        back.append(txt(905, 600, "TIMER", 30, PLUM, 500, extra="letter-spacing:.2em"))
        for val, anim in stepped_opacity("tm", timer_pairs):
            back.append(txt(905, 695, val, 92, INK, extra=anim))
        back.append(txt(905, 735, "(SPED UP)", 24, PLUM, 500, extra="letter-spacing:.14em"))

    # ------------------------------------------------------------ character
    ch = []
    ch.append(pg([(170, 905), (330, 905), (348, 1300), (152, 1300)], CREAM, 9))                      # shirt
    ch.append(pg([(190, 962), (310, 962), (326, 1300), (174, 1300)], CORAL, 9))                      # apron
    ch.append(pth(wb(196, 962, 186, 905, 1), 8) + pth(wb(304, 962, 314, 905, 1), 8))
    ch.append(pg([(232, 862), (268, 862), (272, 910), (228, 910)], CREAM, 8))                        # neck
    ch.append(circ(250, 1115, 14, CREAM, 6))                                                          # apron pocket dot
    ch.append(pth(wb(205, 1175, 295, 1175, 1.5), 6))

    def arm(sh, a1, a2, name, hand=True):
        ua = kf(name + "u", "transform", lambda k, s: f"rotate({s[a1]:.2f}deg)") + "transform-origin:0 0;"
        fa = kf(name + "f", "transform", lambda k, s: f"rotate({s[a2]:.2f}deg)") + "transform-origin:0 0;"
        sleeve = pth(f"M0,0 L{L},0", 52, INK) + pth(f"M0,0 L{L},0", 38, CREAM)
        return (f'<g transform="translate({sh[0]} {sh[1]})"><g style="{ua}">{sleeve}'
                f'<g transform="translate({L} 0)"><g style="{fa}">{sleeve}{circ(L, 0, 27, CREAM, 8)}</g></g></g></g>')

    larm = arm(SL, "l1", "l2", "la")
    rarm = arm(SR, "r1", "r2", "ra")

    # kettle (world-space so it can sit on the counter or ride the right hand)
    def kettle_tf(k, s):
        if s["held"]:
            H = s["rhand"]
            kw = s["kw"]
        else:
            H, kw = HREST, 0
        return f"translate({H[0]:.1f}px,{H[1]:.1f}px) rotate({kw:.1f}deg) scale({KS}) translate({-KG[0]}px,{-KG[1]}px)"
    ket_anim = kf("ket", "transform", kettle_tf) + "transform-origin:0 0;"
    kettle = (pth("M0,40 L150,40 Q166,100 158,150 L-8,150 Q-16,100 0,40 Z", 10, INK, CREAM)
              + pth("M24,40 L126,40", 10, INK) + circ(75, 22, 11, INK, 4)
              + pth("M0,58 C-72,52 -82,128 -6,138", 11, INK)
              + pth("M150,128 C196,120 232,100 238,60 C240,40 252,30 268,28", 12, INK)
              + pth("M12,84 L140,84", 5, CORAL))
    kettle = f'<g style="{ket_anim}">{kettle}</g>'

    # dose cup (step 3)
    cup = ""
    if step == 3:
        def cup_tf(k, s):
            H, kw = s["cup"][0], s["cup"][1]
            return f"translate({H[0]:.1f}px,{H[1]:.1f}px) rotate({kw:.1f}deg)"
        ca = kf("cup", "transform", cup_tf) + "transform-origin:0 0;"
        cup = (f'<g style="{ca}">' + pg([(0, -85), (105, -85), (92, 0), (12, 0)], CORAL, 9)
               + pth("M-4,-85 L109,-85", 10) + "</g>")
        drops = ""
        for i in range(12):
            x0 = 815 + rng.uniform(-14, 14)
            dl = 1.15 + .09 * i
            drops += (f'<circle cx="{x0:.0f}" cy="995" r="{rng.uniform(3, 6):.1f}" style="fill:{BROWN};stroke:none;opacity:0;'
                      f'animation:fall .38s linear {dl:.2f}s forwards"/>')
        cup += drops
        css.append("@keyframes fall{from{opacity:1;transform:translateY(0)}to{opacity:1;transform:translateY(88px)}}")

    # water stream
    stream = ""
    if any(s["stream"] for s in states):
        def stream_tf(k, s):
            if not s["stream"]:
                return "translate(0px,0px) scale(1,.0001)"
            tx, ty = H_to_tip(s["rhand"], s["kw"])
            return f"translate({tx:.1f}px,{ty:.1f}px) scale(1,{max(SURF - ty, 1) / 100:.3f})"
        sa = kf("str", "transform", stream_tf) + "transform-origin:0 0;"
        stream = (f'<g style="{sa}"><line x1="0" y1="0" x2="0" y2="100" style="stroke:{INK};stroke-width:11;vector-effect:non-scaling-stroke"/>'
                  f'<line x1="0" y1="0" x2="0" y2="100" style="stroke:{CREAM};stroke-width:4;vector-effect:non-scaling-stroke;'
                  f'stroke-dasharray:16 12;animation:flow .5s linear infinite"/></g>')
        css.append("@keyframes flow{to{stroke-dashoffset:-28}}")

    # head
    head_anim = kf("hd", "transform", lambda k, s: f"translate(0px,{3 * math.sin(2 * math.pi * (k / 12) / (2 * beat)):.1f}px) rotate({s['tilt'] + (2.5 if s['stream'] else 0):.1f}deg)") + "transform-origin:250px 850px;"
    blink = kf("bl", "transform", lambda k, s: "scale(1,.12)" if k in (int(N * .3), int(N * .7)) else "scale(1,1)") + "transform-origin:0 745px;"
    open_a = kf("op", "opacity", lambda k, s: "1" if s["mouth"] == "open" else "0")
    smile_a = kf("sm", "opacity", lambda k, s: "0" if s["mouth"] == "open" else "1")
    face = []
    face.append(circ(250, 745, 108, CREAM, 10))
    face.append(f'<path d="M142,735 C142,625 358,625 358,735 L338,725 C300,705 200,705 162,725 Z" style="fill:{PLUM};stroke:{INK};stroke-width:9"/>')
    face.append(pth("M146,728 L354,728", 14, INK))
    face.append(f'<g style="{blink}">{circ(212, 758, 8, INK, 2)}{circ(288, 758, 8, INK, 2)}</g>')
    face.append(pth(wb(194, 730, 232, 724, 1), 6) + pth(wb(268, 724, 306, 730, 1), 6))
    face.append(circ(188, 792, 15, CORAL, 0, CORAL) + circ(312, 792, 15, CORAL, 0, CORAL))
    face.append(f'<g style="{smile_a}"><path d="M216,795 Q250,830 284,795" style="stroke:{INK};stroke-width:8;fill:none"/></g>')
    face.append(f'<g style="{open_a}"><ellipse cx="250" cy="806" rx="20" ry="24" style="fill:{INK};stroke:none"/></g>')
    head = f'<g style="{head_anim}">{"".join(face)}</g>'

    scene_svg = ('<svg class="sk" viewBox="0 0 1080 1920" style="position:absolute;left:0;top:0;width:{w}px;height:{h}px">'.format(w=w, h=h)
                 + f'<g transform="translate(0 {OY})">' + "".join(back) + "".join(ch) + larm + kettle + cup + stream + rarm + head + "</g></svg>")

    # ------------------------------------------------------------ bubble, header, progress dots
    BY = OY + (60 if step == 0 else 0)
    t0_, b0_ = 300 + BY, 530 + BY
    bd = (f"M96,{t0_} L984,{t0_} Q1012,{t0_} 1012,{t0_ + 28} L1012,{b0_ - 28} Q1012,{b0_} 984,{b0_} L96,{b0_} "
          f"Q68,{b0_} 68,{b0_ - 28} L68,{t0_ + 28} Q68,{t0_} 96,{t0_} Z")
    tail = f"M205,{b0_ - 2} L292,{b0_ - 2} L252,{626 + OY} Z"
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
    lines = cfg["say"]
    fs = 56 if len(lines) > 1 else 72
    say_html = "".join(f'<div style="font:400 {fs}px/1.15 BrothersSlant,Brothers,sans-serif;color:{INK};white-space:nowrap">{html.escape(ln)}</div>'
                       for ln in lines)
    say = (f'<div class="word abs" style="left:{P(70)}px;top:{P(t0_)}px;width:{P(940)}px;height:{P(230)}px;display:flex;'
           f'flex-direction:column;justify-content:center;align-items:center;--r:0deg;--dx:0px;--dy:{P(30)}px;'
           f'animation-delay:{bat + .3 * beat:.3f}s">{say_html}</div>')

    if step == 0:
        header = (f'<div class="abs" style="left:{P(70)}px;top:{P(90)}px;width:{P(940)}px">'
                  + word_html(cfg["head"][0], 0, P(100), -2, width=P(780))
                  + word_html(cfg["head"][1], at(1.0), P(125), 1.5, fill=spot, shadow=fg, width=P(940), scrib_at=at(2.0)) + "</div>")
        ev.append((0, "slap"))
    else:
        header = (f'<div class="abs" style="left:{P(70)}px;top:{P(110)}px;width:{P(940)}px">'
                  + word_html(cfg["head"][0], 0, P(170), -1.5, width=P(940), scrib_at=at(1.0)) + "</div>")
        ev.append((0, "slap"))
    dots = ""
    for i in range(6):
        cur = (i + 1 == step)
        dots += (f'<div class="word abs" style="left:{P(318 + i * 80)}px;top:{P(1590)}px;width:{P(44)}px;height:{P(44)}px;'
                 f'border-radius:50%;border:{P(6)}px solid {INK};background:{CORAL if cur else "transparent"};--r:0deg;--dx:0px;'
                 f'--dy:0px;animation-delay:{at(.2 + .1 * i):.3f}s"></div>')
    callouts = ""
    if step == 1:
        def note(x, y, t_, b, rot=-3, size=48):
            ev.append((at(b), "slap"))
            return (f'<div class="word abs" style="left:{P(x)}px;top:{P(y)}px;--r:{rot}deg;--dx:0px;--dy:{P(30)}px;'
                    f'animation-delay:{at(b):.3f}s;font:400 {size}px BrothersSlant,Brothers;color:{INK};white-space:nowrap">{html.escape(t_)}</div>')

        def arrow_(d, b):
            return (f'<path d="{d}" pathLength="1" style="animation-delay:{at(b):.3f}s;animation-duration:{.3 * beat:.3f}s;'
                    f'stroke:{INK};stroke-width:8px;stroke-linecap:round"/>')
        callouts = (note(700, 985, "V60 + paper filter", 1.6, 2, 42) + note(850, 1440, "scale", 2.6)
                    + note(340, 1440, "gooseneck kettle", 3.6, -2, 42)
                    + f'<svg class="over" viewBox="0 0 {w} {h}" style="left:0;top:0">'
                    + arrow_("M850,1032 L850,1112", 1.8) + arrow_("M880,1432 L868,1398", 2.8) + arrow_("M520,1430 L520,1372", 3.8)
                    + "</svg>")
        ratio = (f'<svg class="over" viewBox="0 0 {w} {h}" style="left:0;top:0"><g transform="translate(0 {OY})">'
                 f'<path d="M785,560 L1025,560 L1025,750 L785,750 Z" pathLength="1" style="animation-name:draw,fillin;'
                 f'animation-duration:{.4 * beat:.3f}s,{.2 * beat:.3f}s;animation-delay:{at(4.2):.3f}s,{at(4.4):.3f}s;stroke:{INK};'
                 f'stroke-width:9px;fill:{CREAM};fill-opacity:0"/></g></svg>'
                 f'<div class="word abs" style="left:{P(785)}px;top:{P(560 + OY)}px;width:{P(240)}px;height:{P(190)}px;display:flex;'
                 f'flex-direction:column;align-items:center;justify-content:center;--r:0deg;--dx:0px;--dy:{P(20)}px;'
                 f'animation-delay:{at(4.5):.3f}s"><div style="font:500 {P(28)}px Brothers;color:{PLUM};letter-spacing:.2em">RATIO</div>'
                 f'<div style="font:700 {P(88)}px/1 Brothers;color:{INK}">1 : 16</div>'
                 f'<div style="font:500 {P(22)}px Brothers;color:{PLUM};letter-spacing:.08em">G COFFEE : G WATER</div></div>')
        callouts += ratio
        ev.append((at(4.5), "slap"))
    if step == 2:
        ev.append((at(4.2), "slap"))
        callouts = (f'<div class="word abs" style="left:{P(520)}px;top:{P(1440)}px;--r:-3deg;--dx:0px;--dy:{P(30)}px;'
                    f'animation-delay:{at(4.4):.3f}s;font:400 {P(54)}px BrothersSlant,Brothers;color:{INK};white-space:nowrap">'
                    f'then dump it.</div>')

    css.append(".sk path{stroke-linecap:round;stroke-linejoin:round}.sk text{white-space:pre}"
               ".word.abs{white-space:nowrap}")
    return header + scene_svg + bubble + say + dots + callouts, "".join(css)
