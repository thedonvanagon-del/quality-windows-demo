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
        return (f'<path d="{d}" pathLength="1" style="animation-delay:{at * beat:.3f}s;animation-duration:{dur * beat:.3f}s;'
                f'stroke:{color or INK};stroke-width:{P(width)}px;fill:{fillc}"/>')

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
    else:
        raise SystemExit(f"print style has no scene type '{t}'")

    css += (f".ring{{position:absolute;border-radius:50%;background:radial-gradient(circle,transparent 61%,"
            f"rgba(85,48,16,.20) 63%,rgba(85,48,16,.34) 68%,rgba(85,48,16,.16) 72%,transparent 74%);}}"
            ".abs{position:absolute}"
            f".liq{{position:absolute;overflow:hidden}}.liq i{{position:absolute;inset:0;background:{CUP_BROWN};"
            "transform-origin:50% 100%;transform:scaleY(0);animation:fill linear forwards}"
            "@keyframes fill{from{transform:scaleY(0)}to{transform:scaleY(1)}}"
            ".steam{position:absolute;opacity:0;animation:steamup linear infinite}"
            f"@keyframes steamup{{0%{{opacity:0;transform:translateY(0)}}25%{{opacity:.75}}100%{{opacity:0;transform:translateY({P(-90)}px)}}}}")
    return "".join(parts), css
