"""HTML for one scene. Pure string building, no browser here.

Look: kraft paper with a slow sunburst, ink type set in the brand's Brothers
face, a laughing-Buddha sticker, illustrated beans that change colour as they
roast. Everything degrades to system fonts and no images if the private brand
assets haven't been synced (see sync_brand.py).
"""
import base64
import html
from pathlib import Path

ROAST = {  # bean colours, green to dark
    "green": "#6f8a3a", "yellow": "#c9b04a", "light": "#b9803f",
    "medium": "#7a4a26", "mediumdark": "#4b2c17", "dark": "#24130b",
}

THEMES = {  # bg, fg, accent, chip, ray
    "kraft": ("#e6d3ab", "#1b1410", "#e8583a", "#4f1c3a", "rgba(120,80,30,.09)"),
    "ink":   ("#1b1410", "#f3e6c8", "#f0795a", "#d9a441", "rgba(255,240,200,.05)"),
    "coral": ("#f0795a", "#1b1410", "#f3e6c8", "#4f1c3a", "rgba(255,255,255,.14)"),
}

_NOISE = base64.b64encode(
    b"<svg xmlns='http://www.w3.org/2000/svg' width='260' height='260'><filter id='n'>"
    b"<feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/>"
    b"<feColorMatrix values='0 0 0 0 .3  0 0 0 0 .2  0 0 0 0 .1  0 0 0 .55 0'/></filter>"
    b"<rect width='100%' height='100%' filter='url(#n)'/></svg>").decode()


def shade(hex_, f):
    """Darken a #rrggbb by fraction f."""
    c = [int(hex_[i:i + 2], 16) for i in (1, 3, 5)]
    return "#%02x%02x%02x" % tuple(int(v * (1 - f)) for v in c)


def bean(c0, c1=None, px=170, rot=0, delay=0.0, bob=True, dur=4.0):
    """An illustrated coffee bean. c0 -> c1 shifts colour over the scene."""
    c1 = c1 or c0
    k0, k1 = shade(c0, .38), shade(c1, .38)
    anim = f"animation:shift {dur}s ease-in-out .6s both;" if c0 != c1 else ""
    return (
        f'<div class="pop" style="--d:{delay}s;width:{px}px;height:{px * 1.28:.0f}px">'
        f'<div class="{"bob" if bob else ""}" style="--r:{rot}deg;--bd:{delay * 1.7}s">'
        f'<svg viewBox="0 0 100 128" width="{px}" height="{px * 1.28:.0f}" style="--c0:{c0};--c1:{c1};--k0:{k0};--k1:{k1}">'
        f'<ellipse class="bb" cx="50" cy="64" rx="41" ry="58" fill="{c0}" style="{anim}"/>'
        f'<path class="bk" d="M52 8 C28 44 74 84 48 120" fill="none" stroke="{k0}" stroke-width="7" '
        f'stroke-linecap="round" style="{anim}"/>'
        f'<ellipse cx="33" cy="40" rx="7" ry="16" fill="#fff" opacity=".22" transform="rotate(18 33 40)"/>'
        f'</svg></div></div>')


def steam(px, n=3):
    waves = "".join(
        f'<svg class="steam" viewBox="0 0 40 120" width="{px * .3:.0f}" height="{px * .9:.0f}" style="--sd:{i * .9}s;left:{i * 32}%">'
        f'<path d="M20 118 C4 96 36 80 20 58 C4 36 34 24 20 4" fill="none" stroke="currentColor" stroke-width="7" '
        f'stroke-linecap="round" opacity=".55"/></svg>' for i in range(n))
    return f'<div class="steams" style="height:{px}px">{waves}</div>'


def starburst(word, px):
    pts = []
    import math
    for i in range(32):
        r = px / 2 * (1 if i % 2 == 0 else .8)
        a = i * math.pi / 16
        pts.append(f"{px / 2 + r * math.cos(a):.1f},{px / 2 + r * math.sin(a):.1f}")
    return (f'<div class="burst pop" style="--d:.15s;width:{px}px;height:{px}px">'
            f'<svg class="spin" viewBox="0 0 {px} {px}" width="{px}" height="{px}">'
            f'<polygon points="{" ".join(pts)}" fill="var(--accent)" stroke="var(--fg)" stroke-width="8" stroke-linejoin="round"/></svg>'
            f'<b>{html.escape(word)}</b></div>')


def _u(path):
    return f"file://{Path(path).resolve()}"


def build_html(sc, brand, w, h):
    dur = float(sc["duration"])
    land = w > h
    u = min(w, h) / 1080
    px = lambda v: f"{int(v * u)}px"
    pf = 1 if land else 1.3  # art scale: the tall frame has room to spare
    t = sc.get("type", "title")
    theme = sc.get("theme") or {"pop": "ink", "outro": "coral", "logo": "kraft"}.get(t, "kraft")
    bg, fg, accent, chip, ray = THEMES[theme]
    assets = Path(brand["_dir"]) / "assets"
    have = assets.exists()
    asset = lambda n: _u(assets / n) if (assets / n).exists() else None
    logo = asset("logo_cream.png" if theme == "ink" else "logo_ink.png")
    mascot = asset("mascot_cream.png" if theme == "ink" else "mascot_ink.png")

    faces = ""
    if have:
        for fam, f, wt in (("Brothers", "brothersregular_regular-webfont.woff2", 400),
                           ("Brothers", "brothers_medium-webfont.woff2", 500),
                           ("Brothers", "brothersbold_bold-webfont.woff2", 700),
                           ("BrothersSlant", "brothers_superslant_regular-webfont.woff2", 400),
                           ("PlexMono", "ibm-plex-mono-400.woff2", 400),
                           ("PlexMono", "ibm-plex-mono-500.woff2", 500)):
            if asset(f):
                faces += f"@font-face{{font-family:'{fam}';font-weight:{wt};src:url('{asset(f)}') format('woff2')}}"

    E = lambda k: html.escape(sc.get(k, ""))
    eyebrow = f'<div class="eyebrow pop" style="--d:0s">{E("eyebrow")}</div>' if sc.get("eyebrow") else ""
    sub = f'<p class="sub slide" style="--d:.35s">{E("sub")}</p>' if sc.get("sub") else ""
    head = f'<h1 class="slide" style="--d:.1s">{E("text")}</h1>' if sc.get("text") else ""
    text = eyebrow + head + sub
    art = ""
    full = False  # art spans the width below the heading

    if t == "bullets":
        lis = "".join(
            f'<li class="slide" style="--d:{.5 + .5 * i}s"><span class="dot"></span>{html.escape(b)}</li>'
            for i, b in enumerate(sc.get("bullets", [])))
        text += f"<ul>{lis}</ul>"
        c0, c1 = ROAST[sc.get("from", "green")], ROAST[sc.get("to", sc.get("from", "green"))]
        art = '<div class="beanpile">' + "".join(
            bean(c0, c1, px=int(190 * u * pf * s), rot=r, delay=.2 + i * .18, dur=dur * .7)
            for i, (s, r) in enumerate([(1, -18), (.8, 22), (.9, -6)])) + "</div>"
        if sc.get("steam"):
            art = f'<div class="stack">{steam(int(260 * u * pf))}{art}</div>'
    elif t == "beans":
        c0, c1 = ROAST[sc.get("from", "green")], ROAST[sc.get("to", sc.get("from", "green"))]
        spec = [(1.0, -16), (.78, 20), (.9, -4), (.7, 14), (.85, -24)]
        art = '<div class="beanpile">' + "".join(
            bean(c0, c1, px=int(200 * u * pf * s), rot=r, delay=.2 + i * .15, dur=dur * .7)
            for i, (s, r) in enumerate(spec)) + "</div>"
        if sc.get("steam"):
            art = f'<div class="stack">{steam(int(280 * u * pf))}{art}</div>'
    elif t == "pop":  # big number plus a starburst
        big = E("text").replace("°", '<span class="deg">°</span>')  # Brothers draws ° as &
        text = eyebrow + f'<div class="stat slide" style="--d:.1s">{big}</div>' + sub
        c = ROAST[sc.get("to", "medium")]
        art = (f'<div class="stack">{starburst(sc.get("burst", "POP!"), int(560 * u))}'
               + '<div class="jumpers">' + "".join(
                   bean(c, px=int(120 * u), rot=r, delay=.5 + i * .12) for i, r in enumerate((-30, 10, 34))) + "</div></div>")
    elif t == "roastline":
        full = True
        labels = sc.get("labels", ["Green", "Light", "Medium", "Medium-dark", "Dark"])
        keys = ["green", "light", "medium", "mediumdark", "dark"][:len(labels)] if len(labels) == 5 else list(ROAST)[:len(labels)]
        size = int((150 if land else 160) * u)
        art = '<div class="line">' + "".join(
            f'<div class="stop">{bean(ROAST[k], px=size, rot=(-12 if i % 2 else 12), delay=.5 + i * .35)}'
            f'<span class="lbl slide" style="--d:{.7 + i * .35}s">{html.escape(l)}</span></div>'
            for i, (k, l) in enumerate(zip(keys, labels))) + '<i class="track"></i></div>'
    elif t == "photo":
        img = sc.get("image")
        img_url = _u(img) if img and Path(img).is_absolute() else asset(img or "bag.jpg")
        chips = "".join(f'<li class="slide" style="--d:{.5 + .5 * i}s"><span class="dot"></span>{html.escape(b)}</li>'
                        for i, b in enumerate(sc.get("bullets", [])))
        text += f"<ul>{chips}</ul>" if chips else ""
        mascot = None  # the polaroid sits where the sticker would
        art = (f'<div class="polaroid pop" style="--d:.2s"><div class="ph"><img src="{img_url}" class="kb"></div>'
               f'<span class="hand">{E("note")}</span></div>') if img_url else ""
    elif t == "bags":  # product-photo lineup; each bag drops in with a pop
        full = True
        items = sc.get("bags", [])
        cw = int((300 if land else 270) * u)
        cards = ""
        for i, b in enumerate(items):
            src = b["image"]
            url = _u(src) if Path(src).is_absolute() else (asset(src) or "")
            rot = (-3, 2.5, -1.5, 3, -2.5)[i % 5]
            cards += (f'<div class="pop" style="--d:{.3 + i * .28}s"><div class="bagcard" style="width:{cw}px;transform:rotate({rot}deg)">'
                      f'<div class="bagimg" style="height:{int(cw * 1.2)}px"><img src="{url}"></div>'
                      f'<span class="lbl">{html.escape(b.get("label", ""))}</span></div></div>')
        art = f'<div class="bagrow">{cards}</div>'
    elif t == "logo":
        full = True
        text = ""
        art = (f'<div class="bigcol"><img class="biglogo pop" style="--d:.1s" src="{logo}">{sub}</div>' if logo else
               f'<h1 class="slide">{E("brand_name") or "Buddha Beans"}</h1>{sub}')
        mascot = None
    elif t == "outro":
        full = True
        art = (f'<div class="bigcol">' + (f'<img class="biglogo2 pop" style="--d:.1s" src="{logo}">' if logo else "")
               + f'<h1 class="slide" style="--d:.5s">{E("text")}</h1>'
               + f'<div class="url pop" style="--d:.9s">{html.escape(brand.get("url", ""))}</div>{sub}</div>')
        text = ""
        mascot = None
    elif t == "quote":
        text = (f'<blockquote class="slide" style="--d:.1s">&ldquo;{E("text")}&rdquo;</blockquote>'
                f'<p class="sub slide" style="--d:.5s">{E("attribution")}</p>')
    elif t == "image":
        img = sc.get("image")
        art = f'<img class="fullbleed kb" src="{_u(img)}">' if img else ""
    elif t == "stat":  # legacy alias of pop
        return build_html({**sc, "type": "pop"}, brand, w, h)
    elif t == "roastbar":
        return build_html({**sc, "type": "roastline"}, brand, w, h)

    cap = f'<div class="cap slide" style="--d:.6s">{E("caption")}</div>' if sc.get("caption") else ""
    sticker = f'<img class="sticker" src="{mascot}">' if mascot else ""
    layout = "full" if full else ("split" if land else "stack")

    return f"""<!doctype html><html><head><meta charset="utf-8"><style>
{faces}
:root{{--bg:{bg};--fg:{fg};--accent:{accent};--chip:{chip};--ray:{ray}}}
*{{box-sizing:border-box;margin:0}}
html,body{{width:{w}px;height:{h}px;overflow:hidden;background:var(--bg);color:var(--fg);
  font-family:'Brothers','Impact','DejaVu Sans',sans-serif}}
.paper{{position:absolute;inset:0;overflow:hidden}}
.paper::after{{content:"";position:absolute;inset:0;background:url("data:image/svg+xml;base64,{_NOISE}");
  mix-blend-mode:multiply;opacity:{.5 if theme != "ink" else .25};pointer-events:none}}
.rays{{position:absolute;left:50%;top:50%;width:{int(max(w, h) * 2.2)}px;height:{int(max(w, h) * 2.2)}px;
  margin:{-int(max(w, h) * 1.1)}px 0 0 {-int(max(w, h) * 1.1)}px;
  background:repeating-conic-gradient(var(--ray) 0 8deg,transparent 8deg 16deg);animation:spin 70s linear infinite}}
.content{{position:absolute;left:{px(90)};right:{px(90)};top:{px(260 if not land else 80)};
  bottom:{px(430 if not land else 250) if sc.get("caption") else px(120)};display:flex;
  flex-direction:{"row" if layout == "split" else "column"};align-items:center;justify-content:center;gap:{px(60)}}}
.text{{display:flex;flex-direction:column;gap:{px(26)};{"flex:1.1;" if layout == "split" else ""}min-width:0}}
.art{{display:flex;align-items:center;justify-content:center;{"flex:.9;" if layout == "split" else ""}min-width:0;position:relative}}
.stack .text,.full .text{{width:100%}} .stack .text{{align-items:flex-start}}
.full .art{{width:100%}} .full .text{{align-items:center;text-align:center}}
h1{{font-weight:700;font-size:{px(128 if land else 104)};line-height:.98;text-transform:uppercase;letter-spacing:.01em;
  text-wrap:balance}}
.stat{{font-weight:700;font-size:{px(300 if land else 230)};line-height:.9;color:var(--accent);
  -webkit-text-stroke:{px(5)} var(--fg);paint-order:stroke fill;text-shadow:{px(10)} {px(10)} 0 var(--fg)}}
.deg{{font-family:'Impact','DejaVu Sans',sans-serif;-webkit-text-stroke:0;font-size:.8em}}
.sub{{font:500 {px(46)}/1.25 'PlexMono',monospace;max-width:22em}}
.eyebrow{{align-self:flex-start;font:500 {px(34)} 'PlexMono',monospace;letter-spacing:.14em;text-transform:uppercase;
  background:var(--chip);color:#f3e6c8;padding:{px(8)} {px(20)};transform:rotate(-2deg)}}
.full .eyebrow{{align-self:center}}
ul{{list-style:none;padding:0;display:flex;flex-direction:column;gap:{px(18)};margin-top:{px(8)}}}
li{{display:flex;align-items:center;gap:{px(22)};font:500 {px(50)}/1.15 'PlexMono',monospace}}
.dot{{flex:none;width:{px(26)};height:{px(26)};border-radius:50%;background:var(--accent);border:{px(5)} solid var(--fg)}}
blockquote{{font:400 {px(92)}/1.1 'BrothersSlant','Brothers',serif}}
.cap{{position:absolute;left:{px(70)};right:{px(70)};bottom:{px(150 if not land else 70)};text-align:center;
  font:500 {px(40)}/1.3 'PlexMono',monospace;background:var(--fg);color:var(--bg);padding:{px(20)} {px(32)};
  transform:rotate(-.7deg);box-shadow:{px(8)} {px(8)} 0 var(--accent)}}
.sticker{{position:absolute;right:{px(60)};top:{px(60 if not land else 50)};height:{px(130 if not land else 150)};animation:wob 3s ease-in-out infinite}}
.beanpile{{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:{px(14)};max-width:100%}}
.stack{{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center}}
.steams{{position:relative;width:{px(300)};color:var(--fg);margin-bottom:{px(-20)}}}
.steam{{position:absolute;bottom:0;animation:rise 2.6s ease-in infinite;animation-delay:var(--sd);opacity:0}}
.burst{{position:relative;display:flex;align-items:center;justify-content:center}}
.burst svg{{position:absolute;inset:0}}
.burst b{{position:relative;font:700 {px(130)} 'Brothers',Impact,sans-serif;transform:rotate(-8deg);color:var(--bg);
  -webkit-text-stroke:{px(4)} var(--fg);paint-order:stroke fill;text-shadow:{px(6)} {px(6)} 0 var(--fg)}}
.jumpers{{position:absolute;inset:0;display:flex;align-items:flex-end;justify-content:space-around;padding:0 {px(40)}}}
.line{{position:relative;display:flex;justify-content:space-between;align-items:flex-end;width:100%;max-width:{px(1500)};
  gap:{px(10)};margin-top:{px(10)}}}
.stop{{display:flex;flex-direction:column;align-items:center;gap:{px(16)};z-index:1}}
.lbl{{font:500 {px(34 if land else 30)} 'PlexMono',monospace;text-transform:uppercase;letter-spacing:.06em;text-align:center;
  background:var(--fg);color:var(--bg);padding:{px(6)} {px(14)}}}
.track{{position:absolute;left:5%;right:5%;bottom:{px(34)};border-top:{px(6)} dashed var(--fg);opacity:.35}}
.bagrow{{display:flex;flex-wrap:wrap;justify-content:center;gap:{px(30)} {px(26)}}}
.bagcard{{background:#fffaf0;padding:{px(14)};box-shadow:{px(10)} {px(12)} 0 rgba(0,0,0,.22);display:flex;flex-direction:column;gap:{px(12)};align-items:center}}
.bagimg{{width:100%;background:#efe2c6;display:flex;align-items:center;justify-content:center;overflow:hidden}}
.bagimg img{{max-width:100%;max-height:100%;object-fit:contain}}
.bagcard .lbl{{font-size:{px(24)};text-align:center}}
.polaroid{{background:#fffaf0;padding:{px(22)} {px(22)} {px(40)};box-shadow:{px(16)} {px(20)} 0 rgba(0,0,0,.25);
  transform:rotate(-4deg);display:flex;flex-direction:column;gap:{px(14)}}}
.ph{{width:{px(470 if land else 500)};height:{px(600 if land else 620)};overflow:hidden;background:#000}}
.ph img{{width:100%;height:100%;object-fit:cover;display:block}}
.hand{{font:400 {px(46)} 'BrothersSlant','Brothers',serif;color:#1b1410;text-align:center}}
.bigcol{{display:flex;flex-direction:column;align-items:center;gap:{px(30)};text-align:center}}
.biglogo{{width:{px(900 if land else 940)};max-width:100%}}
.biglogo2{{width:{px(720 if land else 780)};max-width:100%}}
.url{{font:500 {px(54)} 'PlexMono',monospace;background:var(--fg);color:var(--bg);padding:{px(12)} {px(30)};
  transform:rotate(-1.5deg);box-shadow:{px(8)} {px(8)} 0 var(--chip)}}
.fullbleed{{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}}
.pop{{animation:pop .75s cubic-bezier(.3,1.7,.5,1) both;animation-delay:var(--d,0s)}}
.slide{{animation:slide .6s cubic-bezier(.2,.8,.2,1) both;animation-delay:var(--d,0s)}}
.bob{{animation:bob 2.2s ease-in-out infinite;animation-delay:var(--bd,0s);transform:rotate(var(--r,0deg))}}
.spin{{animation:spin 24s linear infinite}}
.kb{{animation:kb {dur}s linear both}}
.bb{{fill:var(--c0)}} .bk{{stroke:var(--k0)}}
@keyframes shift{{from{{fill:var(--c0);stroke:var(--k0)}}to{{fill:var(--c1);stroke:var(--k1)}}}}
@keyframes pop{{from{{opacity:0;transform:scale(.1) rotate(-25deg)}}to{{opacity:1;transform:none}}}}
@keyframes slide{{from{{opacity:0;transform:translateY({px(60)})}}to{{opacity:1;transform:none}}}}
@keyframes bob{{0%,100%{{transform:translateY(0) rotate(var(--r,0deg))}}50%{{transform:translateY({px(-22)}) rotate(calc(var(--r,0deg) * -1))}}}}
@keyframes wob{{0%,100%{{transform:rotate(-5deg)}}50%{{transform:rotate(5deg) scale(1.05)}}}}
@keyframes spin{{to{{transform:rotate(360deg)}}}}
@keyframes rise{{0%{{transform:translateY(0);opacity:0}}25%{{opacity:.8}}100%{{transform:translateY({px(-110)});opacity:0}}}}
@keyframes kb{{from{{transform:scale(1)}}to{{transform:scale(1.14)}}}}
</style></head><body><div class="paper"><div class="rays"></div>
<div class="content {layout}"><div class="text">{text}</div><div class="art">{art}</div></div>
{sticker}{cap}</div></body></html>"""
