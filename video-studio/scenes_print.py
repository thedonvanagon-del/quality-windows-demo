"""Print-shop look for Buddha Beans: ink on kraft, screen-print wobble, hand-drawn marks.

Built to read as made by a person, not generated:
  - Brothers is the only typeface. If it fails to load the render stops.
  - Everything moves on twos (12 fps) like stop-motion; the ink edge boils between frames.
  - Hard cuts on the beat. No fades, no glow, no floating.
  - Marker underlines, a hand-drawn arrow, torn paper and tape, off-register colour.

build() returns (html, events). events are (seconds, kind) pairs that the sound
module uses to land a thud or slap on the same frame the picture hits.
"""
import base64
import html
import random
from pathlib import Path

PAL = {"kraft": "#d6b88a", "ink": "#1b1410", "cream": "#f1e4c6", "coral": "#ee7556", "plum": "#4f1c3a"}
FG = {"kraft": "ink", "ink": "cream", "coral": "ink", "cream": "ink"}
SPOT = {"kraft": "coral", "ink": "coral", "coral": "cream", "cream": "coral"}
FACES = (("Brothers", 400, "brothersregular_regular-webfont.woff2"),
         ("Brothers", 500, "brothers_medium-webfont.woff2"),
         ("Brothers", 700, "brothersbold_bold-webfont.woff2"),
         ("BrothersSlant", 400, "brothers_superslant_regular-webfont.woff2"))

FIT_JS = """() => { document.querySelectorAll('.fit').forEach(el => {
  const maxW = +el.dataset.w, cap = +el.dataset.cap; let lo = 10, hi = cap;
  for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2; el.style.fontSize = m + 'px';
    if (el.scrollWidth <= maxW) lo = m; else hi = m; }
  el.style.fontSize = lo + 'px'; }); }"""

LOADED_JS = """async () => { await document.fonts.ready;
  return [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family.replace(/['"]/g, '')); }"""


_NOISE = base64.b64encode(
    b"<svg xmlns='http://www.w3.org/2000/svg' width='260' height='260'><filter id='n'>"
    b"<feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/>"
    b"<feColorMatrix values='0 0 0 0 .3  0 0 0 0 .2  0 0 0 0 .1  0 0 0 .55 0'/></filter>"
    b"<rect width='100%' height='100%' filter='url(#n)'/></svg>").decode()


def _u(path):
    return "file://" + str(Path(path).resolve())


def torn(wd, ht, step, amp, rng):
    """clip-path polygon for a roughly torn rectangle."""
    pts = []
    x = 0.0
    while x < wd:
        pts.append((x, rng.uniform(0, amp)))
        x += step * rng.uniform(.6, 1.4)
    y = 0.0
    while y < ht:
        pts.append((wd - rng.uniform(0, amp), y))
        y += step * rng.uniform(.6, 1.4)
    x = wd
    while x > 0:
        pts.append((x, ht - rng.uniform(0, amp)))
        x -= step * rng.uniform(.6, 1.4)
    y = ht
    while y > 0:
        pts.append((rng.uniform(0, amp), y))
        y -= step * rng.uniform(.6, 1.4)
    return "polygon(" + ",".join(f"{px:.0f}px {py:.0f}px" for px, py in pts) + ")"


def scribble(rng):
    """Marker underline: one pass out, a short pass back. viewBox 0 0 100 14."""
    pts = [(2, 6 + rng.uniform(-1, 1))]
    for i in range(1, 10):
        pts.append((2 + i * 10.6, 6 + rng.uniform(-1.6, 1.6) - i * .12))
    pts.append((88, 10.5))
    for i in range(1, 8):
        pts.append((88 - i * 10.2, 10.5 + rng.uniform(-1.4, 1.4)))
    return "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in pts)


def build(sc, brand, w, h, bpm):
    beat = 60.0 / bpm
    u = min(w, h) / 1080
    P = lambda v: int(v * u)
    rng = random.Random(sc.get("seed", 7))
    assets = Path(brand["_dir"]) / "assets"
    missing = [f for _, _, f in FACES if not (assets / f).exists()]
    if missing:
        raise SystemExit("Brothers font files missing, refusing to render in a fallback font: "
                         f"{', '.join(missing)}. Run sync_brand.py first.")
    faces = "".join(f"@font-face{{font-family:'{fam}';font-weight:{wt};font-display:block;"
                    f"src:url('{_u(assets / f)}') format('woff2')}}" for fam, wt, f in FACES)

    bgname = sc.get("bg", "kraft")
    fg, spot = PAL[FG[bgname]], PAL[SPOT[bgname]]
    bg = PAL[bgname]
    ev = []
    t = sc.get("type", "slam")
    body = ""
    nbeats = sc.get("beats", 4)

    def word_html(text, at, size_cap, rot, fill=None, shadow=None, dx=-160, weight=700, track=".01em",
                  scrib_at=None, width=None, extra=""):
        width = width or (w - P(140))
        fillc = fill or fg
        shadc = shadow or spot
        sc_html = ""
        if scrib_at is not None:
            sc_html = (f'<svg class="scrib on" style="animation-delay:{scrib_at:.3f}s" viewBox="0 0 100 14" preserveAspectRatio="none">'
                       f'<path d="{scribble(rng)}" style="stroke:{spot if fillc == fg else fg}"/></svg>')
            ev.append((scrib_at, "scribble"))
        ev.append((at, "slap"))
        return (f'<div class="word" style="--r:{rot}deg;--dx:{P(dx)}px;--dy:{P(-70)}px;animation-delay:{at:.3f}s">'
                f'<span class="fit" data-w="{width}" data-cap="{size_cap}" style="font-weight:{weight};'
                f'letter-spacing:{track};color:{fillc};text-shadow:.055em .05em 0 {shadc}{extra}">'
                f'{html.escape(text)}{sc_html}</span></div>')

    # ------------------------------------------------------------ mascot
    if t == "mascot":
        mascot = assets / "mascot_ink.png"
        mw = min(w * .9, h * .55)
        ev += [(0, "thunk")]
        words = sc.get("words", ["BUDDHA BEANS"])
        body = (f'<div class="col" style="top:{P(150) if h > w else P(60)}px;bottom:{P(150)}px">'
                f'<div class="thunk" style="width:{int(mw)}px"><img class="sway" src="{_u(mascot)}" '
                f'style="width:100%;animation-duration:{2 * beat}s"></div>'
                + word_html(words[0], 1 * beat, P(260), -2, width=w - P(140))
                + (word_html(sc.get("sub", ""), 2 * beat, P(90), 1.5, weight=500, track=".16em",
                             width=w - P(300)) if sc.get("sub") else "")
                + (word_html(sc.get("tag", ""), 3 * beat, P(70), -1, weight=500, track=".18em",
                             width=w - P(400), fill=spot, shadow=fg) if sc.get("tag") else "")
                + '</div>')

    # ------------------------------------------------------------ slam
    elif t == "slam":
        words = sc["words"]
        n = len(words)
        step = 1.0 if n <= nbeats - 1 else (nbeats - 1) / max(n - 1, 1)
        acc = sc.get("accent", n - 1)
        rots = [-2.5, 1.8, -1.4, 2.2]
        parts = []
        for k, wd in enumerate(words):
            at = (sc["at"][k] if sc.get("at") else k * step) * beat
            is_acc = (k == acc)
            parts.append(word_html(wd, at, P(560), rots[k % 4], fill=spot if is_acc else None,
                                   shadow=fg if is_acc else None, dx=(-170 if k % 2 == 0 else 170),
                                   scrib_at=(at + .55 * beat) if (is_acc and sc.get("underline", True)) else None))
        body = f'<div class="col" style="top:{P(170)}px;bottom:{P(170)}px">' + "".join(parts) + "</div>"

    # ------------------------------------------------------------ cutout (photo, tape, arrow)
    elif t == "cutout":
        img = sc.get("image", "bag.jpg")
        img_url = _u(img) if Path(img).is_absolute() else _u(assets / img)
        pw = P(720)
        ph = int(pw * sc.get("aspect", 942 / 738))
        pad = P(24)
        cw, chh = pw + 2 * pad, ph + 2 * pad
        cx, cy = w * .5, h * .41
        rot = -4.0
        ev += [(0, "slap"), (1.0 * beat, "tape")]
        card_clip = torn(cw, chh, P(20), P(7), rng)
        tape = lambda x, y, r: (f'<div class="tape" style="left:{x}px;top:{y}px;transform:rotate({r}deg);'
                                f'clip-path:{torn(P(230), P(78), P(12), P(5), rng)};animation-delay:{1.0 * beat:.3f}s"></div>')
        # arrow: from under the note, curving down to the label sticker on the bag
        import math
        th = math.radians(rot)
        lx, ly = (sc.get("target", (.66, .5))[0] - .5) * pw, (sc.get("target", (.66, .5))[1] - .5) * ph
        tx, ty = cx + lx * math.cos(th) - ly * math.sin(th), cy + lx * math.sin(th) + ly * math.cos(th)
        sx, sy = w * .70, cy - chh / 2 - P(10)
        mx, my = (sx + tx) / 2 + P(150), (sy + ty) / 2
        ang = math.atan2(ty - my, tx - mx)
        hd = lambda a: (tx - P(58) * math.cos(ang + a), ty - P(58) * math.sin(ang + a))
        h1, h2 = hd(.45), hd(-.45)
        at_arrow = 3.5 * beat
        ev += [(at_arrow, "scribble"), (at_arrow + .4 * beat, "scribble")]
        arrow = (f'<svg class="over" viewBox="0 0 {w} {h}">'
                 f'<path d="M{sx:.0f},{sy:.0f} Q{mx:.0f},{my:.0f} {tx:.0f},{ty:.0f}" pathLength="1" '
                 f'style="animation-delay:{at_arrow:.3f}s"/>'
                 f'<path d="M{h1[0]:.0f},{h1[1]:.0f} L{tx:.0f},{ty:.0f} L{h2[0]:.0f},{h2[1]:.0f}" pathLength="1" '
                 f'style="animation-delay:{at_arrow + .4 * beat:.3f}s"/></svg>')
        words = sc.get("words", ["MEXICO,", "CHIAPAS."])
        wd_html = "".join(word_html(x, (1.5 + .75 * i) * beat, P(380), (-3, 2)[i % 2], dx=(-170, 170)[i % 2],
                                    fill=(None, spot)[i % 2], shadow=(None, fg)[i % 2])
                          for i, x in enumerate(words))
        note = sc.get("note", "")
        ev.append((4.0 * beat, "slap"))
        body = (
            f'<div class="photo" style="left:{cx - cw / 2:.0f}px;top:{cy - chh / 2:.0f}px;width:{cw}px;height:{chh}px;'
            f'--r:{rot}deg;animation-delay:0s"><div class="card" style="clip-path:{card_clip}">'
            f'<img src="{img_url}" style="margin:{pad}px;width:{pw}px;height:{ph}px"></div>'
            f'{tape(P(40), P(-34), -24)}{tape(cw - P(250), P(-30), 21)}</div>'
            f'{arrow}'
            f'<div class="note" style="left:{w * .30:.0f}px;top:{sy - P(150):.0f}px;animation-delay:{4.0 * beat:.3f}s">'
            f'{html.escape(note)}</div>'
            f'<div class="col low" style="top:{h * .62:.0f}px;bottom:{P(120)}px">{wd_html}</div>')

    # ------------------------------------------------------------ stack (poster of bands)
    elif t == "stack":
        lines = sc["lines"]
        n = len(lines)
        bh = h / n
        cyc = [("cream", "ink"), ("ink", "cream"), ("coral", "ink"), ("kraft", "ink")]
        out = []
        for i, ln in enumerate(lines):
            bgc, fgc = cyc[i % 4]
            if i == n - 1 and sc.get("last_accent", True):
                bgc, fgc = "ink", "coral"
            at = i * (nbeats - 1.5) / max(n - 1, 1) * beat
            ev.append((at, "band"))
            sx = -w if i % 2 == 0 else w
            rot = (-1.1, 1.0)[i % 2]
            align = ("flex-start", "flex-end")[i % 2]
            scr = ""
            if i == n - 1 and sc.get("underline", True):
                scr = (f'<svg class="scrib on" style="animation-delay:{at + .5 * beat:.3f}s" viewBox="0 0 100 14" '
                       f'preserveAspectRatio="none"><path d="{scribble(rng)}" style="stroke:{PAL["cream"]}"/></svg>')
                ev.append((at + .5 * beat, "scribble"))
            out.append(
                f'<div class="band" style="top:{i * bh - bh * .03:.0f}px;height:{bh * 1.06:.0f}px;background:{PAL[bgc]};'
                f'justify-content:{align};--r:{rot}deg;--sx:{sx}px;animation-delay:{at:.3f}s;z-index:{i}">'
                f'<span class="fit" data-w="{w - P(130)}" data-cap="{int(bh * .84)}" '
                f'style="color:{PAL[fgc]};font-weight:700;letter-spacing:.01em">{html.escape(ln)}{scr}</span></div>')
        body = "".join(out)

    # ------------------------------------------------------------ outro
    elif t == "outro":
        logo = assets / "logo_ink.png"
        lw = min(w * .84, h * .42 * 1.48)
        ev += [(0, "thunk")]
        words = sc.get("words", ["RETAIL + WHOLESALE."])
        url = sc.get("url", brand.get("url", "")).upper()
        body = (f'<div class="col" style="top:{P(160)}px;bottom:{P(190)}px">'
                f'<div class="thunk" style="width:{int(lw)}px"><img src="{_u(logo)}" style="width:100%"></div>'
                + word_html(words[0], 2 * beat, P(250), -1.6, width=w - P(140))
                + word_html(url, 3.5 * beat, P(100), 1.2, weight=500, track=".1em", width=w - P(120),
                            scrib_at=4.1 * beat) + '</div>')
    else:
        raise SystemExit(f"print style has no scene type '{t}'")

    shakes = ",".join(f"shake .26s linear {at:.3f}s both" for at, k in ev if k in ("slap", "thunk", "band"))
    specks = "".join(
        f'<circle cx="{rng.uniform(0, w):.0f}" cy="{rng.uniform(0, h):.0f}" r="{rng.uniform(.8, 3.2) * u:.1f}"/>'
        for _ in range(90))
    noise = _NOISE

    page = f"""<!doctype html><html><head><meta charset="utf-8"><style>
{faces}
*{{box-sizing:border-box;margin:0}}
html,body{{width:{w}px;height:{h}px;overflow:hidden;background:{bg};color:{fg};font-family:'Brothers','Impact',sans-serif}}
.paper{{position:absolute;inset:0;background:
  radial-gradient(60% 40% at 15% 20%,rgba(255,235,190,{.16 if bgname != 'ink' else .04}),transparent 70%),
  radial-gradient(50% 35% at 85% 75%,rgba(90,50,10,.13),transparent 70%),{bg}}}
.grain{{position:absolute;inset:0;background:url("data:image/svg+xml;base64,{noise}");mix-blend-mode:multiply;opacity:{.5 if bgname != 'ink' else .22}}}
.specks{{position:absolute;inset:0;fill:{PAL['ink'] if bgname != 'ink' else PAL['cream']};opacity:.2}}
.edge{{position:absolute;inset:0;background:radial-gradient(120% 90% at 50% 50%,transparent 62%,rgba(50,25,0,.22))}}
.ink{{position:absolute;inset:0;filter:url(#rough);animation:{shakes or 'none'}}}
.col{{position:absolute;left:{P(70)}px;right:{P(70)}px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:{P(16)}px}}
.col.low{{justify-content:flex-start}}
.word{{text-align:center;transform-origin:50% 60%;opacity:0;animation:slam .5s linear forwards}}
.fit{{display:inline-block;white-space:nowrap;line-height:.9;text-transform:uppercase;position:relative;padding-bottom:.08em}}
.scrib{{position:absolute;left:-2%;right:-2%;bottom:-.1em;width:104%;height:.3em;overflow:visible}}
.scrib path{{fill:none;stroke-width:{P(15)}px;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke}}
.scrib{{clip-path:inset(0 100% 0 0)}}
.scrib.on{{animation:wipe .45s linear both}}
.over{{position:absolute;inset:0;width:{w}px;height:{h}px}}
.over path{{fill:none;stroke:{PAL['ink']};stroke-width:{P(11)}px;stroke-linecap:round;stroke-linejoin:round;
  stroke-dasharray:1;stroke-dashoffset:1;animation:draw .5s linear both}}
.thunk{{opacity:0;animation:thunk .5s linear forwards}}
.sway{{display:block;transform-origin:50% 85%;animation:sway 1s steps(1,end) infinite}}
.band{{position:absolute;left:{-P(30)}px;right:{-P(30)}px;display:flex;align-items:center;padding:0 {P(100)}px;
  transform-origin:50% 50%;opacity:0;animation:slide .5s linear forwards}}
.photo{{position:absolute;transform-origin:50% 50%;opacity:0;animation:photo .5s linear forwards;
  filter:drop-shadow({P(14)}px {P(18)}px 0 rgba(20,10,0,.3))}}
.card{{background:{PAL['cream']};width:100%;height:100%}}
.tape{{position:absolute;width:{P(230)}px;height:{P(78)}px;background:rgba(236,222,170,.85);mix-blend-mode:multiply;
  animation:tape .2s steps(2,end) both}}
.note{{position:absolute;font:400 {P(74)}px/1 'BrothersSlant','Brothers',sans-serif;color:{PAL['ink']};
  transform:rotate(-5deg);animation:rise .3s steps(2,end) both;white-space:nowrap}}
@keyframes slam{{0%{{opacity:1;transform:translate(var(--dx),var(--dy)) scale(1.8) rotate(calc(var(--r)*3))}}
  16.7%{{opacity:1;transform:translate(calc(var(--dx)*.3),calc(var(--dy)*.3)) scale(1.3) rotate(calc(var(--r)*2))}}
  33.3%{{opacity:1;transform:translate(0,0) scale(.92) rotate(var(--r))}}50%{{opacity:1;transform:scale(1.04) rotate(var(--r))}}
  66.7%{{opacity:1;transform:scale(.99) rotate(var(--r))}}83.3%,100%{{opacity:1;transform:scale(1) rotate(var(--r))}}}}
@keyframes thunk{{0%{{opacity:1;transform:scale(1.6) rotate(-6deg)}}16.7%{{opacity:1;transform:scale(1.22) rotate(-3deg)}}
  33.3%{{opacity:1;transform:scale(.95) rotate(1.5deg)}}50%{{opacity:1;transform:scale(1.025) rotate(-.6deg)}}
  66.7%,100%{{opacity:1;transform:none}}}}
@keyframes photo{{0%{{opacity:1;transform:translateY({P(-420)}px) rotate(calc(var(--r)*5)) scale(1.1)}}
  16.7%{{opacity:1;transform:translateY({P(-170)}px) rotate(calc(var(--r)*3)) scale(1.05)}}
  33.3%{{opacity:1;transform:translateY({P(14)}px) rotate(var(--r)) scale(.97)}}
  50%{{opacity:1;transform:rotate(var(--r)) scale(1.015)}}66.7%,100%{{opacity:1;transform:rotate(var(--r)) scale(1)}}}}
@keyframes slide{{0%{{opacity:1;transform:translateX(var(--sx)) rotate(var(--r))}}
  16.7%{{opacity:1;transform:translateX(calc(var(--sx)*.42)) rotate(var(--r))}}
  33.3%{{opacity:1;transform:translateX(calc(var(--sx)*-.035)) rotate(var(--r))}}
  50%,100%{{opacity:1;transform:translateX(0) rotate(var(--r))}}}}
@keyframes sway{{0%{{transform:rotate(-2.2deg) scale(1)}}50%{{transform:rotate(2.2deg) scale(1.025)}}}}
@keyframes wipe{{from{{clip-path:inset(0 100% 0 0)}}to{{clip-path:inset(0 -2% 0 0)}}}}
@keyframes draw{{from{{stroke-dashoffset:1}}to{{stroke-dashoffset:0}}}}
@keyframes tape{{from{{opacity:0}}to{{opacity:1}}}}
@keyframes rise{{from{{opacity:0;transform:translateY({P(30)}px) rotate(-5deg)}}to{{opacity:1;transform:rotate(-5deg)}}}}
@keyframes shake{{0%{{transform:translate(0,0)}}25%{{transform:translate({P(-9)}px,{P(6)}px)}}
  50%{{transform:translate({P(7)}px,{P(-5)}px)}}75%{{transform:translate({P(-3)}px,{P(3)}px)}}100%{{transform:translate(0,0)}}}}
</style></head><body>
<svg width="0" height="0" style="position:absolute"><filter id="rough" x="-3%" y="-3%" width="106%" height="106%">
<feTurbulence id="boil" type="fractalNoise" baseFrequency=".03" numOctaves="2" seed="1" result="n"/>
<feDisplacementMap in="SourceGraphic" in2="n" scale="{3.6 * u:.1f}" xChannelSelector="R" yChannelSelector="G"/></filter></svg>
<div class="paper"><div class="grain"></div><svg class="specks" width="{w}" height="{h}">{specks}</svg><div class="edge"></div></div>
<div class="ink">{body}</div></body></html>"""
    return page, ev
