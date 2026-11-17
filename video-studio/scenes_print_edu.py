"""Diagram scenes for the print style: a cup, a curve, four icon cards, a two-column fix list.

Everything here is hand-drawn on purpose: wobbly marker lines, torn cards, a dot that
climbs a curve you watch being drawn. Coordinates are written for a 1080-wide canvas
and scaled by u. Times are in beats; events carry seconds.
"""
import html
import math

CUP_BROWN = "#4b2c17"


def build_edu(t, sc, C):
    P, S, u, w, h = C.P, C.S, C.u, C.w, C.h
    rng, beat, PAL, fg, spot, ev, word_html = C.rng, C.beat, C.PAL, C.fg, C.spot, C.ev, C.word_html
    INK, CREAM, CORAL = PAL["ink"], PAL["cream"], PAL["coral"]
    css = (".deg{display:inline-block;width:.2em;height:.2em;border:.055em solid currentColor;border-radius:50%;"
           "vertical-align:.5em;margin:0 .04em}")

    # ---------------------------------------------------------------- drawing helpers (px out)
    def wob(x1, y1, x2, y2, amp=3.0):
        x1, y1, x2, y2 = S(x1), S(y1), S(x2), S(y2)
        L = math.hypot(x2 - x1, y2 - y1) or 1
        n = max(3, int(L / 70))
        nx, ny = -(y2 - y1) / L, (x2 - x1) / L
        pts = []
        for i in range(n + 1):
            k = i / n
            o = rng.uniform(-amp, amp) * u if 0 < i < n else 0
            pts.append((x1 + (x2 - x1) * k + nx * o, y1 + (y2 - y1) * k + ny * o))
        return "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in pts)

    def ell(cx, cy, rx, ry, amp=3.0, turns=1.07):
        n = 36
        pts = []
        for i in range(int(n * turns) + 1):
            a = i / n * 2 * math.pi - math.pi / 2
            r = 1 + rng.uniform(-amp, amp) / max(rx, 1)
            pts.append((S(cx + rx * r * math.cos(a)), S(cy + ry * r * math.sin(a))))
        return "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in pts)

    def path_el(d, at, color=None, width=11, dur=.45, fillc="none"):
        if fillc == "none":
            st = (f"animation-delay:{at * beat:.3f}s;animation-duration:{dur * beat:.3f}s;stroke:{color or INK};"
                  f"stroke-width:{P(width)}px;fill:none")
        else:  # outline draws on; the fill fades in just behind it
            st = (f"animation-name:draw,fillin;animation-duration:{dur * beat:.3f}s,{.25 * beat:.3f}s;"
                  f"animation-delay:{at * beat:.3f}s,{(at + dur * .55) * beat:.3f}s;stroke:{color or INK};"
                  f"stroke-width:{P(width)}px;fill:{fillc};fill-opacity:0")
        return f'<path d="{d}" pathLength="1" style="{st}"/>'

    def ell_rot(cx, cy, rx, ry, rot, amp=2.5, turns=1.06):
        n = 36
        c, s_ = math.cos(math.radians(rot)), math.sin(math.radians(rot))
        pts = []
        for i in range(int(n * turns) + 1):
            a = i / n * 2 * math.pi - math.pi / 2
            r = 1 + rng.uniform(-amp, amp) / max(rx, 1)
            x, y = rx * r * math.cos(a), ry * r * math.sin(a)
            pts.append((S(cx + x * c - y * s_), S(cy + x * s_ + y * c)))
        return "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in pts)

    def bean(cx, cy, rot, color, at, k=1.0, dur=.5, oc=None):
        rx, ry = 56 * k, 80 * k
        c, s_ = math.cos(math.radians(rot)), math.sin(math.radians(rot))
        lum = sum(int(color[i:i + 2], 16) for i in (1, 3, 5)) / 3
        crease_c = INK if lum > 110 else CREAM
        pts = [(0, -ry * .85), (rx * .38, -ry * .35), (-rx * .38, ry * .3), (0, ry * .85)]
        rp = [(cx + x * c - y * s_, cy + x * s_ + y * c) for x, y in pts]
        crease = "M" + " L".join(f"{S(x):.0f},{S(y):.0f}" for x, y in rp)
        return (path_el(ell_rot(cx, cy, rx, ry, rot), at, oc or INK, 9 * max(k, .45), dur, fillc=color)
                + path_el(crease, at + .3, crease_c, 8 * max(k, .45), .25))

    def burst(cx, cy, r, at, color, n=16):
        pts = []
        for i in range(n * 2):
            a = i * math.pi / n + rng.uniform(-.04, .04)
            rr = r * (1 if i % 2 == 0 else .66) * (1 + rng.uniform(-.06, .06))
            pts.append((S(cx + rr * math.cos(a)), S(cy + rr * math.sin(a))))
        return path_el("M" + " L".join(f"{x:.0f},{y:.0f}" for x, y in pts) + " Z", at, INK, 10, .45, fillc=color)

    def poly(pts, at, color=None, width=10, dur=.4, fillc="none", close=False):
        d = "M" + " L".join(f"{S(x):.0f},{S(y):.0f}" for x, y in pts) + (" Z" if close else "")
        return path_el(d, at, color, width, dur, fillc)

    def fitsize(text, maxw, cap, k=.72):
        return int(min(cap, maxw / (max(len(text), 1) * k)))

    def arrow(x1, y1, x2, y2, at, color=None, width=11, bulge=40):
        mx, my = (x1 + x2) / 2 + bulge, (y1 + y2) / 2
        ang = math.atan2(y2 - my, x2 - mx)
        head = lambda a: (x2 - 46 * math.cos(ang + a), y2 - 46 * math.sin(ang + a))
        h1, h2 = head(.5), head(-.5)
        ev.append((at * beat, "scribble"))
        return (path_el(f"M{S(x1):.0f},{S(y1):.0f} Q{S(mx):.0f},{S(my):.0f} {S(x2):.0f},{S(y2):.0f}", at, color, width)
                + path_el(f"M{S(h1[0]):.0f},{S(h1[1]):.0f} L{S(x2):.0f},{S(y2):.0f} L{S(h2[0]):.0f},{S(h2[1]):.0f}",
                          at + .35, color, width, .25))

    def lab(text, x, y, size, at, rot=0, color=None, shadow=None, weight=700, track=".01em", width=None,
            center=False, slant=False, kind="slap", dx=-120, dy=-60):
        fam = "'BrothersSlant','Brothers'" if slant else "'Brothers'"
        sh = f"text-shadow:.055em .05em 0 {shadow};" if shadow else ""
        left = x - (width or 0) / 2 if center else x
        wcss = f"width:{P(width)}px;" if width else ""
        if kind:
            ev.append((at * beat, kind))
        return (f'<div class="word abs" style="left:{P(left)}px;top:{P(y)}px;{wcss}--r:{rot}deg;--dx:{P(dx)}px;'
                f'--dy:{P(dy)}px;animation-delay:{at * beat:.3f}s"><span style="font-family:{fam};font-size:{P(size)}px;'
                f'font-weight:{weight};letter-spacing:{track};color:{color or fg};{sh}white-space:nowrap;'
                f'text-transform:{"none" if slant else "uppercase"};line-height:1">'
                f'{html.escape(text).replace("°", "<i class=deg></i>")}</span></div>')

    def torn_rect(wd, ht):
        return C.torn(P(wd), P(ht), P(22), P(7), rng)

    def ring(cx, cy, d):
        return (f'<div class="ring" style="left:{P(cx - d / 2)}px;top:{P(cy - d / 2)}px;width:{P(d)}px;height:{P(d)}px"></div>')

    def tagl(text):
        return lab(text, 70, 120, 36, 0, weight=500, track=".2em", color=spot if C.bgname != "kraft" else PAL["plum"],
                   kind=None, dx=-60, dy=0)

    svg = lambda inner: f'<svg class="over" viewBox="0 0 {w} {h}">{inner}</svg>'
    parts = []
    deco = lambda *rs: "".join(ring(*r) for r in rs)

    # ================================================================ cup
    if t == "cup":
        parts.append(deco((930, 1560, 330), (60, 560, 220)))
        parts.append(tagl(sc.get("tag", "(01) THE CUP")))
        parts.append(lab("DRIP COFFEE IS", 540, 250, 86, 0, rot=-1.5, center=True, width=940))
        parts.append(f'<div class="abs" style="left:{P(70)}px;top:{P(350)}px;width:{P(940)}px">'
                     + word_html("~98% WATER.", 1.0 * beat, P(330), -2, fill=spot, shadow=fg, width=P(940),
                                 scrib_at=2.0 * beat) + "</div>")
        cup = []
        cup.append(path_el(wob(325, 905, 365, 1330), 2.4, width=14))
        cup.append(path_el(wob(365, 1330, 540, 1348) + " " + wob(540, 1348, 715, 1330).replace("M", "L", 1), 2.8, width=14))
        cup.append(path_el(wob(715, 1330, 755, 905), 3.2, width=14))
        cup.append(path_el(ell(540, 905, 215, 38, 3, 1.06), 3.6, width=14, dur=.6))
        hp = [(752, 985), (850, 975), (925, 1040), (930, 1130), (900, 1205), (820, 1245), (735, 1250)]
        cup.append(path_el("M" + " L".join(f"{S(x):.0f},{S(y):.0f}" for x, y in hp), 4.2, width=14, dur=.6))
        cup.append(path_el(wob(270, 1366, 810, 1366), 4.8, width=12))
        parts.append(svg("".join(cup)))
        lw, lh = 402, 400
        poly = f"polygon(0 0,{P(38)}px {P(lh)}px,{P(364)}px {P(lh)}px,{P(lw)}px 0)"
        ev.append((5.0 * beat, "pour"))
        parts.append(f'<div class="liq" style="left:{P(339)}px;top:{P(918)}px;width:{P(lw)}px;height:{P(lh)}px;clip-path:{poly}">'
                     f'<i style="animation-delay:{5.0 * beat:.3f}s;animation-duration:{1.6 * beat:.3f}s"></i></div>')
        parts.append(lab("WATER", 540, 1090, 94, 6.4, rot=-4, color=CREAM, center=True, width=380))
        steams = "".join(
            f'<svg class="steam" style="left:{P(x)}px;top:{P(700)}px;animation-delay:{(6.2 + i * .5) * beat:.3f}s;'
            f'animation-duration:{2 * beat:.3f}s" width="{P(60)}" height="{P(190)}" viewBox="0 0 60 190">'
            f'<path d="M30,185 C6,150 54,120 30,90 C8,60 50,34 30,4" fill="none" stroke="{INK}" stroke-width="{9}" '
            f'stroke-linecap="round"/></svg>' for i, x in enumerate((440, 520, 600)))
        parts.append(steams)
        parts.append(lab("the other ~2% is the coffee.", 540, 1450, 66, 7.0, rot=-3, center=True, width=980, slant=True))
        parts.append(svg(arrow(640, 1440, 600, 1335, 7.5, bulge=-35)))

    # ================================================================ chart
    elif t == "chart":
        L, R, T, B = 200, 1000, 640, 1500
        W, H = R - L, B - T
        Y = lambda pct: B - pct / 30 * H
        X = lambda tt: L + tt * W
        samples = [(X(i / 120), Y(29 * (1 - math.exp(-(i / 120) / .28)))) for i in range(121)]
        cum = [0.0]
        for (a, b), (c, d) in zip(samples, samples[1:]):
            cum.append(cum[-1] + math.hypot(c - a, d - b))
        frac = lambda ypx: next(cum[i] / cum[-1] for i, (_, y) in enumerate(samples) if y <= ypx)
        f18, f22 = frac(Y(18)), frac(Y(22))
        t0, tr = 2.0, 6.0
        at18, at22, tend = t0 + tr * f18, t0 + tr * f22, t0 + tr
        parts.append(deco((960, 560, 240)))
        parts.append(tagl(sc.get("tag", "(02) THE SWEET SPOT")))
        parts.append(f'<div class="abs" style="left:{P(70)}px;top:{P(170)}px;width:{P(940)}px">'
                     + word_html("PULL OUT", 0, P(210), -2, width=P(940))
                     + word_html("JUST ENOUGH.", 1.0 * beat, P(210), 1.5, fill=spot, shadow=fg, width=P(940)) + "</div>")
        zone = lambda top, hh, style, at: (f'<div class="zone on abs" style="left:{P(L)}px;top:{P(top)}px;width:{P(W)}px;'
                                           f'height:{P(hh)}px;{style};animation-delay:{at * beat:.3f}s"></div>')
        parts.append(zone(Y(18), B - Y(18), "background:rgba(238,117,86,.38)", t0))
        parts.append(zone(Y(22), Y(18) - Y(22), f"background:rgba(241,228,198,.96);border:{P(5)}px dashed {INK}", at18))
        parts.append(zone(T, Y(22) - T, "background:rgba(27,20,16,.2)", at22))
        ax = (path_el(wob(L, B + 8, L, T - 30), 0, width=13, dur=.8) + path_el(wob(L - 8, B, R + 30, B), .5, width=13, dur=.8)
              + path_el(f"M{S(L - 22):.0f},{S(T + 6):.0f} L{S(L):.0f},{S(T - 32):.0f} L{S(L + 22):.0f},{S(T + 6):.0f}", 1.2, width=13, dur=.25)
              + path_el(f"M{S(R + 4):.0f},{S(B - 22):.0f} L{S(R + 32):.0f},{S(B):.0f} L{S(R + 4):.0f},{S(B + 22):.0f}", 1.3, width=13, dur=.25))
        curve_pts = [(S(x) + rng.uniform(-1.2, 1.2) * u, S(y) + rng.uniform(-1.2, 1.2) * u) for x, y in samples]
        curve_d = "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in curve_pts)
        parts.append(svg(ax + path_el(curve_d, t0, color=INK, width=17, dur=tr)))
        parts.append(lab("EXTRACTED →", 105, 1020, 44, 0.6, rot=-90, weight=500, track=".14em", center=True, width=330, kind=None))
        parts.append(lab("TIME →", 600, 1522, 44, 0.8, weight=500, track=".14em", center=True, width=300, kind=None))
        parts.append(lab("SOUR", 262, 1250, 160, t0 + .3, rot=-3, color=INK, shadow=CREAM))
        parts.append(lab("SWEET SPOT", 548, 874, 66, at18 + .1, rot=-1, color=INK, shadow=CORAL))
        parts.append(lab("18–22%", 212, 882, 50, at18 + .5, weight=500, track=".06em", color=INK, kind=None))
        parts.append(lab("BITTER", 230, 668, 130, at22 + .1, rot=2, color=INK, shadow=CREAM))
        dpath = "M " + " L ".join(f"{x:.1f} {y:.1f}" for x, y in curve_pts)
        parts.append(f'<div class="dot" style="offset-path:path(\'{dpath}\');animation-delay:{t0 * beat:.3f}s;'
                     f'animation-duration:{tr * beat:.3f}s;width:{P(58)}px;height:{P(58)}px"></div>')
        k = t0
        while k <= tend:
            ev.append((k * beat, "tick"))
            k += .5
        mid = (f18 + f22) / 2
        i_mid = next(i for i, c in enumerate(cum) if c / cum[-1] >= mid)
        cx, cy = samples[i_mid]
        parts.append(svg(path_el(ell(cx, cy, 78, 70, 3, 1.08), 8.0, color=CORAL, width=14, dur=.6)))
        parts.append(lab("stop in here.", 600, 1130, 62, 8.6, rot=-4, slant=True, color=INK))
        parts.append(svg(arrow(690, 1118, cx + 70, cy + 60, 9.0, bulge=60, color=INK)))
        parts.append(lab("a sketch, not real data", 560, 1430, 36, 10.0, rot=2, slant=True, color=INK, kind=None))
        css += (".zone{clip-path:inset(0 100% 0 0)}.zone.on{animation:wipe .5s linear both}"
                ".dot{position:absolute;left:0;top:0;border-radius:50%;opacity:0;offset-anchor:50% 50%;"
                f"background:{CORAL};border:{P(9)}px solid {INK};animation:travel linear forwards}}"
                "@keyframes travel{from{offset-distance:0%;opacity:1}to{offset-distance:100%;opacity:1}}")

    # ================================================================ knobs (2x2 icon cards + badge)
    elif t == "knobs":
        parts.append(deco((90, 1500, 260)))
        parts.append(tagl(sc.get("tag", "(03) THE FOUR KNOBS")))
        cw, chh = 460, 520
        cards = [
            (60, 190, -1.5, -1, -1, 0.0, "GRIND", "FINER", "= FASTER"),
            (560, 205, 1.3, 1, -1, 2.0, "WATER", "195–205°F", "90–96°C"),
            (60, 740, 1.2, -1, 1, 4.0, "RATIO", "1 : 16", "COFFEE : WATER, BY WEIGHT"),
            (560, 725, -1.2, 1, 1, 6.0, "TIME", "~3 MIN", "POUR-OVER"),
        ]

        def icon(kind, at):
            d = []
            a = at + .6
            if kind == "GRIND":
                for (x, y, r) in ((90, 300, 30), (160, 330, 25), (80, 385, 24), (150, 395, 28)):
                    d.append(path_el(ell(x, y, r, r, 2), a, width=10, dur=.3))
                d.append(arrow(200, 350, 270, 350, a + .3, width=10, bulge=-10))
                for i in range(16):
                    x, y = 300 + rng.uniform(0, 130), 300 + rng.uniform(0, 110)
                    d.append(path_el(ell(x, y, 6, 6, 1, 1), a + .5 + i * .03, width=9, dur=.1, fillc=INK))
            elif kind == "WATER":
                d.append(path_el(wob(205, 270, 205, 380) + " " + wob(205, 380, 255, 380).replace("M", "L", 1), a, width=11, dur=.3))
                d.append(path_el(wob(255, 380, 255, 270), a + .1, width=11, dur=.3))
                d.append(path_el(ell(230, 268, 25, 16, 2, 1.05), a + .2, width=11, dur=.3))
                d.append(path_el(ell(230, 420, 38, 38, 2, 1.05), a + .3, width=11, dur=.3, fillc=CORAL))
                d.append(path_el(wob(230, 395, 230, 310), a + .5, width=14, color=CORAL, dur=.3))
                for y in (295, 325, 355):
                    d.append(path_el(wob(275, y, 310, y), a + .4, width=9, dur=.15))
            elif kind == "RATIO":
                d.append(path_el(ell(190, 345, 52, 52, 2, 1.05), a, width=11, dur=.35, fillc=CORAL))
                d.append(path_el(wob(238, 330, 360, 280), a + .3, width=18, dur=.3))
            else:
                d.append(path_el(ell(230, 345, 78, 78, 2, 1.06), a, width=11, dur=.45))
                d.append(path_el(wob(215, 255, 245, 255), a + .3, width=14, dur=.15))
                d.append(path_el(wob(230, 345, 262, 300), a + .5, width=12, dur=.2, color=CORAL))
                for ang in (0, 90, 180, 270):
                    rr = math.radians(ang)
                    d.append(path_el(wob(230 + 62 * math.cos(rr), 345 + 62 * math.sin(rr), 230 + 74 * math.cos(rr),
                                         345 + 74 * math.sin(rr)), a + .5, width=8, dur=.1))
            return f'<svg class="over" viewBox="0 0 {w} {h}" style="left:0;top:{-P(62)}px">{"".join(d)}</svg>'

        for (x, y, rot, sx, sy, at, title, value, sub) in cards:
            inner = (lab(title, 32, 22, 94, at + .35, color=INK, kind=None, dx=sx * 60, dy=0)
                     + lab(value, 32, 398, 70, at + 1.2, color=INK, shadow=CORAL, dx=sx * 60, dy=0)
                     + lab(sub, 32, 478, 32 if len(sub) < 14 else 25, at + 1.5, weight=500, track=".1em", color=PAL["plum"],
                           kind=None, dx=0, dy=20))
            ev.append((at * beat, "slap"))
            ev.append(((at + 1.2) * beat, "slap"))
            parts.append(
                f'<div class="word abs cardw" style="left:{P(x)}px;top:{P(y)}px;width:{P(cw)}px;height:{P(chh)}px;--r:{rot}deg;'
                f'--dx:{P(sx * 260)}px;--dy:{P(sy * 260)}px;animation-delay:{at * beat:.3f}s">'
                f'<div class="cardsh"><div class="cardbg" style="clip-path:{torn_rect(cw, chh)}"></div></div>{inner}'
                f'<div style="position:absolute;left:0;top:0;width:{P(cw)}px;height:{P(chh)}px">{icon(title, at)}</div></div>')
        ev.append((8.0 * beat, "thunk"))
        parts.append(f'<div class="abs thunk badge" style="left:{P(760 - 135)}px;top:{P(1400 - 135)}px;width:{P(270)}px;height:{P(270)}px;'
                     f'animation-delay:{8.0 * beat:.3f}s"><span>EXTRACTION</span></div>')
        parts.append(svg(path_el(ell(760, 1400, 150, 150, 4, 1.06), 9.0, color=CREAM, width=11, dur=.7)))
        parts.append(lab("tweak any one.", 60, 1372, 58, 10.0, rot=-6, width=460, slant=True, color=CREAM, kind=None))
        css += (f".cardbg{{position:absolute;inset:0;background:{CREAM}}}"
                f".cardsh{{position:absolute;inset:0;filter:drop-shadow({P(12)}px {P(14)}px 0 rgba(20,10,0,.32))}}"
                f".badge{{border-radius:50%;background:{CORAL};border:{P(10)}px solid {INK};display:flex;align-items:center;"
                f"justify-content:center;opacity:0}}"
                f".badge span{{font:700 {P(38)}px 'Brothers';color:{INK};letter-spacing:.02em}}")

    # ================================================================ fix (two columns)
    elif t == "fix":
        parts.append(deco((960, 1620, 300)))
        parts.append(tagl(sc.get("tag", "(04) THE FIX")))
        cols = [
            (60, -1.2, CORAL, INK, CREAM, -1, 0.0, "TASTES", "SOUR?", 124, "(UNDER-EXTRACTED)",
             [("GRIND", "FINER"), ("WATER", "HOTTER"), ("BREW", "LONGER")], "up"),
            (550, 1.0, INK, CREAM, CORAL, 1, 1.0, "TASTES", "BITTER?", 100, "(OVER-EXTRACTED)",
             [("GRIND", "COARSER"), ("WATER", "COOLER"), ("BREW", "SHORTER")], "down"),
        ]
        for ci, (x, rot, bgc, txt, hi, sx, at, l1, l2, s2, small, rows, dirn) in enumerate(cols):
            kids = [lab(l1, 36, 40, 70, at + .5, weight=500, track=".14em", color=txt, kind=None, dx=sx * 60, dy=0),
                    lab(l2, 36, 120, s2, at + .8, color=txt, shadow=hi, dx=sx * 60, dy=0),
                    lab(small, 36, 262, 30, at + 1.1, weight=500, track=".06em", color=txt, kind=None, dx=0, dy=20)]
            arrows = []
            for ri, (a_, b_) in enumerate(rows):
                rat = 2.0 + ri * .8 + ci * .4
                y0 = 350 + ri * 200
                kids.append(lab(a_, 112, y0, 82, rat, color=txt, dx=sx * 80, dy=0))
                kids.append(lab(b_, 112, y0 + 84, 76 if len(b_) < 7 else 66, rat + .15, color=hi, shadow=txt if False else None,
                                dx=sx * 80, dy=0, kind=None))
                if dirn == "up":
                    arrows.append(path_el(wob(58, y0 + 150, 58, y0 + 22), rat + .2, txt, 15, .25))
                    arrows.append(path_el(f"M{S(26):.0f},{S(y0 + 58):.0f} L{S(58):.0f},{S(y0 + 20):.0f} L{S(90):.0f},{S(y0 + 58):.0f}", rat + .35, txt, 15, .2))
                else:
                    arrows.append(path_el(wob(58, y0 + 20, 58, y0 + 148), rat + .2, txt, 15, .25))
                    arrows.append(path_el(f"M{S(26):.0f},{S(y0 + 112):.0f} L{S(58):.0f},{S(y0 + 150):.0f} L{S(90):.0f},{S(y0 + 112):.0f}", rat + .35, txt, 15, .2))
            ev.append((at * beat, "slap"))
            parts.append(
                f'<div class="word abs cardw" style="left:{P(x)}px;top:{P(270)}px;width:{P(470)}px;height:{P(960)}px;--r:{rot}deg;'
                f'--dx:{P(sx * 300)}px;--dy:0px;animation-delay:{at * beat:.3f}s">'
                f'<div class="cardsh"><div class="cardbg" style="background:{bgc};clip-path:{torn_rect(470, 960)}"></div></div>{"".join(kids)}'
                f'<svg class="over" viewBox="0 0 {w} {h}" style="left:0;top:0">{"".join(arrows)}</svg></div>')
        parts.append(f'<div class="abs" style="left:{P(70)}px;top:{P(1290)}px;width:{P(940)}px">'
                     + word_html("ONE CHANGE AT A TIME.", 7.0 * beat, P(140), -1.5, fill=spot, shadow=fg, width=P(940),
                                 scrib_at=8.2 * beat) + "</div>")
        parts.append(lab("then taste again.", 540, 1465, 70, 9.6, rot=2, center=True, width=900, slant=True))
        css += (f".cardsh{{position:absolute;inset:0;filter:drop-shadow({P(12)}px {P(14)}px 0 rgba(20,10,0,.32))}}"
                ".cardbg{position:absolute;inset:0}")
    # ================================================================ cracks (two big numbers with bursts)
    elif t == "cracks":
        parts.append(deco((90, 1640, 300)))
        parts.append(tagl(sc.get("tag", "(02) THE CRACKS")))
        blocks = [("FIRST CRACK", "~385°F", "light roasts finish near here.", "POP!", 0.0, 200, 860),
                  ("SECOND CRACK", "~435°F", "dark roast territory.", "CRACK!", 4.0, 960, 1500)]
        for (lbl, num, note, word, b0, y0, _y1) in blocks:
            parts.append(lab(lbl, 70, y0, 54, b0, weight=500, track=".16em", color=CORAL, kind=None, dx=-100, dy=0))
            parts.append(lab(num, 60, y0 + 70, 200, b0 + .5, rot=-2, color=CREAM, shadow=CORAL))
            parts.append(svg(burst(880, y0 + 200, 175 if len(word) > 5 else 150, b0 + 1.2, CORAL)))
            parts.append(lab(word, 880, y0 + 165, 66 if len(word) < 6 else 54, b0 + 1.5, rot=-9, color=INK, center=True,
                             width=300, kind="thunk"))
            parts.append(lab(note, 70, y0 + 330, 62, b0 + 2.2, rot=-2, slant=True, color=CREAM, kind=None))

    # ================================================================ roast (five beans, green to dark)
    elif t == "roast":
        parts.append(deco((950, 1560, 320), (60, 640, 200)))
        parts.append(tagl(sc.get("tag", "(01) THE ROAST")))
        parts.append(f'<div class="abs" style="left:{P(70)}px;top:{P(190)}px;width:{P(940)}px">'
                     + word_html("LONGER ROAST,", 0, P(190), -2, width=P(940))
                     + word_html("DARKER BEAN.", 1.0 * beat, P(190), 1.5, fill=spot, shadow=fg, width=P(940),
                                 scrib_at=2.0 * beat) + "</div>")
        cols = ["#6f8a3a", "#b9803f", "#7a4a26", "#4b2c17", "#24130b"]
        names = ["GREEN", "LIGHT", "MEDIUM", "MED-DARK", "DARK"]
        inner = ""
        for i, (c_, nm) in enumerate(zip(cols, names)):
            cx = 140 + 200 * i
            at = 2.4 + .65 * i
            inner += bean(cx, 950, (-14, 12)[i % 2], c_, at, k=1.45)
            parts.append(lab(nm, cx, 1110, 34, at + .5, weight=500, track=".06em", center=True, width=196, kind=None))
            ev.append((at * beat, "slap"))
        parts.append(svg(inner))
        parts.append(svg(arrow(110, 1290, 960, 1290, 6.2, width=12, bulge=0)))
        parts.append(lab("MORE TIME IN THE ROASTER", 540, 1342, 42, 6.8, weight=500, track=".14em", center=True, width=900, kind=None))
        parts.append(lab("hotter and longer = darker.", 540, 1430, 58, 7.2, rot=-2, center=True, width=900, slant=True))

    # ================================================================ compare (n columns of cards)
    elif t == "compare":
        specs = sc["columns"]
        n = len(specs)
        gap = 20
        cw = int((1000 - gap * (n - 1)) / n)
        chh = sc.get("height", 940)
        top = sc.get("top", 260)
        parts.append(deco((960, 1600, 300)))
        parts.append(tagl(sc.get("tag", "(03) SIDE BY SIDE")))
        cbg = {"cream": (CREAM, INK, CORAL), "coral": (CORAL, INK, CREAM), "ink": (INK, CREAM, CORAL), "kraft": ("#c4a56f", INK, CREAM)}
        for i, cs in enumerate(specs):
            x = 40 + i * (cw + gap)
            at = i * 1.4
            bgc, txt, hi = cbg[cs.get("bg", "cream")]
            rot = (-1.2, .9, -.8, 1.1)[i % 4]
            kids = []
            y = 24
            if cs.get("bean"):
                kids.append(f'<svg class="over" viewBox="0 0 {w} {h}" style="left:0;top:0">{bean(cw / 2, 100, -14, cs["bean"], at + .4, k=.8, oc=(CREAM if cs.get("bg") == "ink" else None))}</svg>')
                y = 190
            for li, line in enumerate(cs["title"]):
                sz = fitsize(line, cw - 40, 96 if li == 0 else 110)
                kids.append(lab(line, cw / 2, y, sz, at + .5 + .15 * li, color=txt, shadow=hi if li else None,
                                center=True, width=cw - 20, kind=None, dx=0, dy=-40))
                y += int(sz * 1.05)
            if cs.get("small"):
                kids.append(lab(cs["small"], cw / 2, y + 6, 28, at + 1.0, weight=500, track=".06em", color=txt, center=True,
                                width=cw - 20, kind=None, dx=0, dy=20))
                y += 54
            y += 40
            for ri, row in enumerate(cs["rows"]):
                words = row.split()
                lines = [row] if len(row) <= 9 else [" ".join(words[:len(words) // 2 or 1]), " ".join(words[len(words) // 2 or 1:])]
                lines = [ln for ln in lines if ln]
                sz = min(fitsize(max(lines, key=len), cw - 30, 78), 78)
                rat = at + 1.4 + .75 * ri
                for li, ln in enumerate(lines):
                    kids.append(lab(ln, cw / 2, y + li * int(sz * 1.05), sz, rat, color=txt if ri % 2 == 0 else hi,
                                    center=True, width=cw - 10, kind=("slap" if li == 0 else None), dx=(-60 if i % 2 == 0 else 60), dy=0))
                y += int(sz * 1.05) * len(lines) + 46
            ev.append((at * beat, "slap"))
            parts.append(
                f'<div class="word abs cardw" style="left:{P(x)}px;top:{P(top)}px;width:{P(cw)}px;height:{P(chh)}px;--r:{rot}deg;'
                f'--dx:{P(-300 + 300 * i)}px;--dy:{P(-200)}px;animation-delay:{at * beat:.3f}s">'
                f'<div class="cardsh"><div class="cardbg" style="background:{bgc};clip-path:{torn_rect(cw, chh)}"></div></div>'
                f'{"".join(kids)}</div>')
        bt = sc.get("banner_at", 8.0)
        if sc.get("banner"):
            parts.append(f'<div class="abs" style="left:{P(70)}px;top:{P(top + chh + 50)}px;width:{P(940)}px">'
                         + word_html(sc["banner"], bt * beat, P(110), -1.5, fill=spot, shadow=fg, width=P(940),
                                     scrib_at=(bt + 1.2) * beat) + "</div>")
        if sc.get("note"):
            parts.append(lab(sc["note"], 540, top + chh + 215, 60, bt + 2.5, rot=2, center=True, width=940, slant=True))
        css += (f".cardsh{{position:absolute;inset:0;filter:drop-shadow({P(12)}px {P(14)}px 0 rgba(20,10,0,.32))}}"
                ".cardbg{position:absolute;inset:0}")

    # ================================================================ myth (struck-out claim, then the fact)
    elif t == "myth":
        parts.append(deco((940, 1640, 300)))
        parts.append(tagl(sc.get("tag", "MYTH OR FACT?")))
        l1, l2 = sc["claim"]
        parts.append(lab(l1, 70, 300, fitsize(l1, 940, 170), 0.0, rot=-1.5, color=INK, shadow=CREAM))
        parts.append(lab(l2, 70, 300 + fitsize(l1, 940, 170) + 30, fitsize(l2, 940, 100), 1.0, rot=1, color=INK))
        s1 = 300 + fitsize(l1, 940, 170) * .5
        s2 = 300 + fitsize(l1, 940, 170) + 30 + fitsize(l2, 940, 100) * .5
        parts.append(svg(path_el(wob(50, s1 + 8, 1030, s1 - 14, 6), 2.6, INK, 16, .35)
                         + path_el(wob(50, s2 - 8, 1030, s2 + 12, 6), 3.0, INK, 16, .35)))
        ev.append((2.6 * beat, "slap"))
        ev.append((3.0 * beat, "slap"))
        parts.append(f'<div class="abs" style="left:{P(70)}px;top:{P(780)}px;width:{P(940)}px">'
                     + word_html(sc["fact"][0], 4.0 * beat, P(260), -2, width=P(940))
                     + word_html(sc["fact"][1], 5.0 * beat, P(260), 1.5, fill=CREAM, shadow=INK, width=P(940),
                                 scrib_at=5.6 * beat) + "</div>")
        parts.append(lab(sc["note"], 540, 1350, fitsize(sc["note"], 940, 58, .52), 6.6, rot=-2, center=True, width=980, slant=True, color=INK))

    # ================================================================ methods (four rows with icons + a grind scale)
    elif t == "methods":
        parts.append(deco((960, 1600, 300)))
        parts.append(tagl(sc.get("tag", "(01) FOUR WAYS")))
        rows = [
            ("ESPRESSO", "FINE GRIND", "~25–30 SEC", .06),
            ("POUR-OVER", "MEDIUM-FINE", "~3 MIN", .33),
            ("FRENCH PRESS", "COARSE", "~4 MIN", .80),
            ("COLD BREW", "COARSE", "12–24 HOURS", .93),
        ]
        brown = CUP_BROWN
        for i, (name, grind, tm, pos) in enumerate(rows):
            oy = 200 + i * 285
            at = 1.0 + 3.0 * i
            ox = 60
            ic = []
            if i == 0:   # espresso cup
                ic.append(poly([(ox + 45, oy + 95), (ox + 55, oy + 170), (ox + 150, oy + 170), (ox + 160, oy + 95)], at + .3, INK, 9, .4, brown, True))
                ic.append(path_el(wob(ox + 35, oy + 95, ox + 170, oy + 95), at + .6, INK, 9, .2))
                ic.append(poly([(ox + 162, oy + 110), (ox + 198, oy + 106), (ox + 202, oy + 140), (ox + 160, oy + 146)], at + .7, INK, 9, .3))
                ic.append(path_el(wob(ox + 20, oy + 186, ox + 195, oy + 186), at + .9, INK, 9, .25))
            elif i == 1:  # cone over a mug
                ic.append(poly([(ox + 30, oy + 30), (ox + 190, oy + 30), (ox + 128, oy + 112), (ox + 92, oy + 112)], at + .3, INK, 9, .4, CORAL, True))
                ic.append(poly([(ox + 62, oy + 128), (ox + 70, oy + 198), (ox + 150, oy + 198), (ox + 158, oy + 128)], at + .7, INK, 9, .4, brown, True))
                ic.append(path_el(wob(ox + 55, oy + 128, ox + 165, oy + 128), at + 1.0, INK, 9, .2))
            elif i == 2:  # french press
                ic.append(poly([(ox + 55, oy + 55), (ox + 58, oy + 200), (ox + 162, oy + 200), (ox + 165, oy + 55)], at + .3, INK, 9, .4, brown, True))
                ic.append(path_el(wob(ox + 48, oy + 48, ox + 172, oy + 48), at + .6, INK, 11, .2))
                ic.append(path_el(wob(ox + 110, oy + 48, ox + 110, oy + 8), at + .8, INK, 9, .2))
                ic.append(path_el(ell(ox + 110, oy + 8, 13, 10, 1.5), at + .9, INK, 9, .2, CORAL))
                ic.append(poly([(ox + 166, oy + 85), (ox + 198, oy + 92), (ox + 198, oy + 160), (ox + 164, oy + 165)], at + .9, INK, 9, .3))
            else:         # cold brew jar with ice
                ic.append(poly([(ox + 58, oy + 70), (ox + 52, oy + 200), (ox + 168, oy + 200), (ox + 162, oy + 70)], at + .3, INK, 9, .4, brown, True))
                ic.append(poly([(ox + 62, oy + 38), (ox + 158, oy + 38), (ox + 160, oy + 68), (ox + 60, oy + 68)], at + .7, INK, 9, .3, CORAL, True))
                for (qx, qy) in ((82, 112), (118, 135), (96, 160)):
                    ic.append(poly([(ox + qx, oy + qy), (ox + qx + 30, oy + qy + 4), (ox + qx + 27, oy + qy + 32), (ox + qx - 2, oy + qy + 28)],
                                   at + 1.0 + qx * .004, CREAM, 7, .15, "rgba(241,228,198,.55)", True))
            parts.append(svg("".join(ic)))
            parts.append(svg(path_el(ell(ox + 4, oy + 8, 28, 28, 1.5), at, INK, 8, .25, CORAL)))
            parts.append(lab(str(i + 1), ox + 4, oy - 12, 38, at + .1, center=True, width=60, color=INK, kind=None, dx=0, dy=0))
            nsz = fitsize(name, 690, 92)
            parts.append(lab(name, 310, oy + 10, nsz, at))
            parts.append(lab(grind, 312, oy + 118, 46, at + .5, weight=500, track=".1em", color=PAL["plum"], kind=None))
            parts.append(lab(tm, 310, oy + 172, 72, at + 1.0, color=INK, shadow=CORAL, kind="slap"))
        # grind scale: dots get bigger left to right, numbered pins mark each method
        sy = 1478
        dots = ""
        for k in range(9):
            r = 5 + k * 2.4
            x = 120 + k * 105
            dots += path_el(ell(x, sy, r, r, 1, 1), 12.2 + k * .12, INK, 7, .15, fillc=INK)
        parts.append(svg(dots))
        parts.append(lab("FINE", 60, sy + 52, 38, 12.2, weight=500, track=".14em", kind=None))
        parts.append(lab("COARSE", 1020, sy + 52, 38, 12.4, weight=500, track=".14em", kind=None, center=False) if False else
                     lab("COARSE", 880, sy + 52, 38, 12.4, weight=500, track=".14em", kind=None))
        pins = ""
        for i, (_n, _g, _t, pos) in enumerate(rows):
            px_ = 120 + pos * 840
            pins += path_el(ell(px_, sy - 62, 26, 26, 1.5), 13.0 + .35 * i, INK, 8, .25, CORAL)
            pins += path_el(wob(px_, sy - 36, px_, sy - 22), 13.2 + .35 * i, INK, 7, .15)
        parts.append(svg(pins))
        for i, (_n, _g, _t, pos) in enumerate(rows):
            parts.append(lab(str(i + 1), 120 + pos * 840, sy - 84, 34, 13.1 + .35 * i, center=True, width=60, kind="slap", dx=0, dy=-20))

    # ================================================================ belt (globe with the coffee belt shaded)
    elif t == "belt":
        parts.append(deco((90, 1650, 280), (960, 560, 220)))
        parts.append(tagl(sc.get("tag", "(02) THE BEAN BELT")))
        parts.append(f'<div class="abs" style="left:{P(70)}px;top:{P(170)}px;width:{P(940)}px">'
                     + word_html("COFFEE GROWS", 0, P(200), -2, width=P(940))
                     + word_html("BETWEEN THE TROPICS.", 1.0 * beat, P(200), 1.5, fill=spot, shadow=fg, width=P(940)) + "</div>")
        cx, cy, R = 500, 1010, 360
        lat = R * math.sin(math.radians(23.4))
        band_h = 2 * lat
        parts.append(f'<div class="abs globe" style="left:{P(cx - R)}px;top:{P(cy - R)}px;width:{P(2 * R)}px;height:{P(2 * R)}px">'
                     f'<div class="beltband on" style="top:{P(R - lat)}px;height:{P(band_h)}px;animation-delay:{4.0 * beat:.3f}s"></div></div>')
        g = path_el(ell(cx, cy, R, R, 3, 1.05), 2.0, INK, 13, .9)
        g += path_el(ell(cx, cy, R * .45, R, 3, 1.05), 2.6, INK, 7, .6)
        g += path_el(wob(cx - R, cy, cx + R, cy), 3.0, INK, 8, .5)
        for sgn in (-1, 1):
            yy = cy + sgn * lat
            half = math.sqrt(R * R - lat * lat)
            g += path_el(wob(cx - half, yy, cx + half, yy), 3.4, CORAL, 10, .5)
        parts.append(svg(g))
        parts.append(lab("TROPIC OF CANCER", 878, cy - lat - 24, 24, 3.8, weight=500, track=".06em", color=INK, kind=None) if False else
                     lab("CANCER", 872, cy - lat - 22, 30, 3.8, weight=500, track=".1em", kind=None))
        parts.append(lab("CAPRICORN", 872, cy + lat - 22, 30, 3.9, weight=500, track=".1em", kind=None))
        parts.append(lab("EQUATOR", 872, cy - 20, 30, 3.7, weight=500, track=".1em", kind=None))
        pins = ""
        spots = [(320, 930, -20), (410, 1085, 15), (490, 955, 8), (590, 1100, -12), (670, 935, 22), (740, 1050, -8),
                 (380, 1000, 30), (560, 1020, -25), (700, 990, 14)]
        for i, (px_, py_, rr) in enumerate(spots):
            pins += bean(px_, py_, rr, CUP_BROWN, 5.0 + .35 * i, k=.34, dur=.3)
            ev.append(((5.0 + .35 * i) * beat, "slap"))
        parts.append(svg(pins))
        parts.append(lab("the bean belt.", 140, 590, 70, 8.4, rot=-6, slant=True))
        parts.append(svg(arrow(300, 690, 380, 880, 8.8, bulge=-40)))
        parts.append(lab("roughly 23°N to 23°S", 540, 1430, 54, 10.0, rot=1.5, center=True, width=940, slant=True))
        css += (".globe{border-radius:50%;overflow:hidden}.beltband{position:absolute;left:0;width:100%;background:rgba(238,117,86,.5);"
                "clip-path:inset(0 100% 0 0)}.beltband.on{animation:wipe .6s linear both}")

    elif t == "sketch":
        from scenes_print_sketch import build_sketch
        body_, css_ = build_sketch(sc, C)
        parts.append(body_)
        css += css_

    else:
        raise SystemExit(f"print style has no scene type '{t}'")

    css += "@keyframes fillin{from{fill-opacity:0}to{fill-opacity:1}}"
    css += (f".ring{{position:absolute;border-radius:50%;background:radial-gradient(circle,transparent 61%,"
            f"rgba(85,48,16,.20) 63%,rgba(85,48,16,.34) 68%,rgba(85,48,16,.16) 72%,transparent 74%);}}"
            ".abs{position:absolute}"
            f".liq{{position:absolute;overflow:hidden}}.liq i{{position:absolute;inset:0;background:{CUP_BROWN};"
            "transform-origin:50% 100%;transform:scaleY(0);animation:fill linear forwards}"
            "@keyframes fill{from{transform:scaleY(0)}to{transform:scaleY(1)}}"
            ".steam{position:absolute;opacity:0;animation:steamup linear infinite}"
            f"@keyframes steamup{{0%{{opacity:0;transform:translateY(0)}}25%{{opacity:.75}}100%{{opacity:0;transform:translateY({P(-90)}px)}}}}")
    return "".join(parts), css
