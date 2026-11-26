"""70s/80s diner drawing kit. Canvas 1200x1000."""
import math, os

FP = os.path.join(os.path.dirname(os.path.abspath(__file__)), "node_modules", "@fontsource")
def _f(pkg): return f"file://{FP}/{pkg}/files/{pkg}-latin-400-normal.woff2"
FONTS = {k: _f(v) for k, v in {
    "Pacifico": "pacifico", "Monoton": "monoton", "Shrikhand": "shrikhand", "Righteous": "righteous",
    "Bungee": "bungee", "BungeeShade": "bungee-shade", "BungeeInline": "bungee-inline", "Yellowtail": "yellowtail",
    "Lobster": "lobster", "Chango": "chango", "Bowlby": "bowlby-one", "Kaushan": "kaushan-script",
    "Damion": "damion", "RubikMono": "rubik-mono-one"}.items()}
FACES = "".join(f"@font-face{{font-family:'{k}';src:url('{v}');}}" for k, v in FONTS.items())

CHERRY, TEAL, MINT, CREAM = "#e03a3e", "#2fb3a8", "#9fe0d6", "#fdf0d5"
MUSTARD, ORANGE, PINK, INK = "#f6b93b", "#f07b3f", "#ff7eb6", "#231a2b"
NAVY, CHROME, CHROME2, COFFEE, DKCOFFEE = "#24365a", "#e4ebef", "#9fadb6", "#7a4529", "#3d2216"
GREEN, DKGREEN, WHITE = "#3f8f5a", "#22553a", "#ffffff"
_id = [0]


def uid(p="u"):
    _id[0] += 1
    return f"{p}{_id[0]}"


DEFS = ('<defs><filter id="glow" x="-30%" y="-30%" width="160%" height="160%">'
        '<feGaussianBlur stdDeviation="9" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/>'
        '<feMergeNode in="SourceGraphic"/></feMerge></filter></defs>')


def svg(body, bg=None):
    rect = f'<rect width="1200" height="1000" fill="{bg}"/>' if bg else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1000" width="1200" height="1000">'
            f'<style>{FACES}</style>{DEFS}{rect}{body}</svg>')


def esc(s):
    return s.replace("&", "&amp;")


def fit(inner, x, y, maxw):
    """Group that render.js shrinks around (x, y) if wider than maxw."""
    return f'<g data-max="{maxw}" data-x="{x}" data-y="{y}">{inner}</g>'


def retro(x, y, s, size, font, fill, outline=INK, ow=None, shadow=INK, depth=14, dx=1, dy=1,
          maxw=1060, anchor="middle", spacing=0, rot=0, inline=None):
    """Chunky lettering: solid extruded shadow + thick outline + face, the diner-sign look."""
    ow = ow if ow is not None else max(6, size * 0.09)
    t = esc(s)
    base = f'font-family="{font}" font-size="{size}" text-anchor="{anchor}" letter-spacing="{spacing}"'
    out = []
    steps = max(1, int(depth / 2))
    for i in range(steps, 0, -1):
        o = i * depth / steps
        out.append(f'<text x="{x + o*dx:.1f}" y="{y + o*dy:.1f}" {base} fill="{shadow}" stroke="{shadow}" '
                   f'stroke-width="{ow}" stroke-linejoin="round">{t}</text>')
    out.append(f'<text x="{x}" y="{y}" {base} fill="{fill}" stroke="{outline}" stroke-width="{ow}" '
               f'stroke-linejoin="round" paint-order="stroke">{t}</text>')
    if inline:
        out.append(f'<text x="{x}" y="{y}" {base} fill="none" stroke="{inline}" stroke-width="{max(2, size*0.018):.1f}" '
                   f'stroke-linejoin="round" opacity=".9">{t}</text>')
    g = "".join(out)
    if rot:
        g = f'<g transform="rotate({rot} {x} {y})">{g}</g>'
    return fit(g, x, y, maxw)


def neon(x, y, s, size, font, color, core=WHITE, maxw=1060, spacing=0, rot=0):
    base = f'font-family="{font}" font-size="{size}" text-anchor="middle" letter-spacing="{spacing}"'
    g = (f'<g filter="url(#glow)"><text x="{x}" y="{y}" {base} fill="none" stroke="{color}" stroke-width="{size*0.09:.1f}" '
         f'stroke-linejoin="round">{esc(s)}</text></g>'
         f'<text x="{x}" y="{y}" {base} fill="none" stroke="{core}" stroke-width="{size*0.03:.1f}" stroke-linejoin="round">{esc(s)}</text>')
    if rot:
        g = f'<g transform="rotate({rot} {x} {y})">{g}</g>'
    return fit(g, x, y, maxw)


def plain(x, y, s, size, font, fill, maxw=1060, spacing=0, anchor="middle"):
    return fit(f'<text x="{x}" y="{y}" font-family="{font}" font-size="{size}" fill="{fill}" text-anchor="{anchor}" '
               f'letter-spacing="{spacing}">{esc(s)}</text>', x, y, maxw)


def starburst(cx, cy, r, fill=MUSTARD, points=14, inner=0.74, stroke=INK, sw=8, rot=0):
    pts = []
    for i in range(points * 2):
        rr = r if i % 2 == 0 else r * inner
        a = math.radians(rot - 90 + i * 180 / points)
        pts.append(f"{cx + rr*math.cos(a):.1f},{cy + rr*math.sin(a):.1f}")
    return f'<polygon points="{" ".join(pts)}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}" stroke-linejoin="round"/>'


def sparkle(cx, cy, r, fill=MUSTARD, stroke=INK, sw=4):
    k = r * 0.22
    return (f'<path d="M{cx},{cy-r} Q{cx+k},{cy-k} {cx+r},{cy} Q{cx+k},{cy+k} {cx},{cy+r} '
            f'Q{cx-k},{cy+k} {cx-r},{cy} Q{cx-k},{cy-k} {cx},{cy-r} Z" fill="{fill}" stroke="{stroke}" stroke-width="{sw}" stroke-linejoin="round"/>')


def sparkles(spots, fill=MUSTARD):
    return "".join(sparkle(x, y, r, fill) for x, y, r in spots)


def stripes(x, y, w, h, colors, clip=None, gap=0.28):
    n = len(colors)
    sh = h / n
    rects = "".join(f'<rect x="{x}" y="{y + i*sh:.1f}" width="{w}" height="{sh*(1-gap):.1f}" fill="{c}"/>' for i, c in enumerate(colors))
    if clip:
        cid = uid("c")
        return f'<clipPath id="{cid}">{clip}</clipPath><g clip-path="url(#{cid})">{rects}</g>'
    return rects


def checker(x, y, w, h, cell=40, a=INK, b=WHITE, clip=None):
    sq = [f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{b}"/>']
    for i in range(int(w // cell) + 1):
        for j in range(int(h // cell) + 1):
            if (i + j) % 2 == 0:
                sq.append(f'<rect x="{x + i*cell}" y="{y + j*cell}" width="{cell}" height="{cell}" fill="{a}"/>')
    body = "".join(sq)
    cid = uid("k")
    clip = clip or f'<rect x="{x}" y="{y}" width="{w}" height="{h}"/>'
    return f'<clipPath id="{cid}">{clip}</clipPath><g clip-path="url(#{cid})">{body}</g>'


def bulbs(path_pts, r=9, on=MUSTARD):
    return "".join(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r}" fill="{on}" stroke="{INK}" stroke-width="3"/>'
                   f'<circle cx="{x-r*0.3:.1f}" cy="{y-r*0.3:.1f}" r="{r*0.3:.1f}" fill="{WHITE}" opacity=".8"/>' for x, y in path_pts)


def rect_bulbs(x, y, w, h, step=46, r=9, on=MUSTARD):
    pts = []
    for i in range(int(w // step) + 1):
        pts += [(x + i * w / int(w // step), y), (x + i * w / int(w // step), y + h)]
    for j in range(1, int(h // step)):
        pts += [(x, y + j * h / int(h // step)), (x + w, y + j * h / int(h // step))]
    return bulbs(pts, r, on)


def marquee(x, y, w, h, face=CHERRY, rad=40, bulb=True, on=MUSTARD):
    """Chrome-rimmed diner sign panel with light bulbs."""
    g = (f'<rect x="{x+12}" y="{y+16}" width="{w}" height="{h}" rx="{rad}" fill="{INK}"/>'
         f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rad}" fill="{CHROME2}" stroke="{INK}" stroke-width="8"/>'
         f'<rect x="{x+14}" y="{y+14}" width="{w-28}" height="{h-28}" rx="{rad-10}" fill="{CHROME}" stroke="{INK}" stroke-width="4"/>'
         f'<rect x="{x+30}" y="{y+30}" width="{w-60}" height="{h-60}" rx="{rad-18}" fill="{face}" stroke="{INK}" stroke-width="6"/>')
    if bulb:
        g += rect_bulbs(x + 22, y + 22, w - 44, h - 44, 48, 7, on)
    return g


def diner_mug(x, y, s=1.0, body=WHITE, band=CHERRY, coffee=COFFEE, steam=True):
    """Thick diner mug, about 260x230 at s=1, top-left at (x, y)."""
    g = [f'<g transform="translate({x},{y}) scale({s})" stroke="{INK}" stroke-linejoin="round" stroke-linecap="round">']
    g.append(f'<path d="M188,92 c86,-6 90,118 0,112" fill="none" stroke-width="44"/>')
    g.append(f'<path d="M188,92 c86,-6 90,118 0,112" fill="none" stroke="{body}" stroke-width="22"/>')
    g.append(f'<path d="M14,60 h200 l-12,150 a30,30 0 0 1 -30,26 h-116 a30,30 0 0 1 -30,-26 z" fill="{body}" stroke-width="10"/>')
    g.append(f'<path d="M20,118 h188 l-3,34 h-182 z" fill="{band}" stroke-width="0"/>')
    g.append(f'<path d="M40,80 l8,120" stroke="{WHITE}" stroke-width="12" opacity=".6"/>')
    g.append(f'<ellipse cx="114" cy="60" rx="100" ry="16" fill="{coffee}" stroke-width="10"/>')
    if steam:
        for dx in (70, 114, 158):
            g.append(f'<path d="M{dx},34 c-22,-22 22,-34 0,-58 c-22,-22 22,-34 0,-56" fill="none" stroke="{INK}" stroke-width="9" opacity=".85"/>')
    g.append("</g>")
    return "".join(g)


def diner_pot(x, y, s=1.0, cap=ORANGE, coffee=COFFEE):
    """Glass diner carafe (Bunn style), about 240x300 at s=1."""
    return (f'<g transform="translate({x},{y}) scale({s})" stroke="{INK}" stroke-linejoin="round" stroke-width="9">'
            f'<path d="M60,70 h120 l-8,40 c70,40 80,120 60,170 h-224 c-20,-50 -10,-130 60,-170 z" transform="translate(0,0)" fill="#d8eef0"/>'
            f'<path d="M14,190 c10,-30 30,-50 60,-60 h92 c30,10 50,30 60,60 l-4,90 h-204 z" fill="{coffee}" stroke-width="0"/>'
            f'<path d="M60,70 h120 l-8,40 c70,40 80,120 60,170 h-224 c-20,-50 -10,-130 60,-170 z" fill="none"/>'
            f'<path d="M46,30 h148 a10,10 0 0 1 10,10 v30 h-168 v-30 a10,10 0 0 1 10,-10 z" fill="{cap}"/>'
            f'<path d="M196,92 c70,0 70,100 30,150" fill="none" stroke-width="30"/>'
            f'<path d="M196,92 c70,0 70,100 30,150" fill="none" stroke="{cap}" stroke-width="14"/>'
            f'<path d="M40,150 q-14,40 -4,100" fill="none" stroke="{WHITE}" stroke-width="12" opacity=".7"/>'
            f'<path d="M36,70 l-30,-14" stroke-width="12"/></g>')


def ribbon(cx, cy, w, h=90, fill=CHERRY, tail="#a3242a"):
    x0, x1 = cx - w / 2, cx + w / 2
    y0 = cy - h / 2 + 26
    return (f'<path d="M{x0+20},{y0} h-110 l40,{h/2} l-40,{h/2} h110 z" fill="{tail}" stroke="{INK}" stroke-width="7" stroke-linejoin="round"/>'
            f'<path d="M{x1-20},{y0} h110 l-40,{h/2} l40,{h/2} h-110 z" fill="{tail}" stroke="{INK}" stroke-width="7" stroke-linejoin="round"/>'
            f'<rect x="{x0}" y="{cy - h/2}" width="{w}" height="{h}" fill="{fill}" stroke="{INK}" stroke-width="8"/>')


def holly(cx, cy, s=1.0):
    def leaf(rot):
        return (f'<g transform="translate({cx},{cy}) rotate({rot}) scale({s})">'
                f'<path d="M0,0 c14,-16 26,-6 34,-22 c6,14 20,10 30,4 c-4,16 6,26 18,28 c-14,6 -16,18 -10,30 '
                f'c-14,-8 -26,-2 -32,10 c-6,-16 -18,-18 -32,-12 c6,-14 -2,-26 -16,-28 z" fill="{GREEN}" stroke="{INK}" stroke-width="{5/s:.1f}"/>'
                f'<path d="M6,4 L80,30" stroke="{INK}" stroke-width="{4/s:.1f}"/></g>')
    berries = "".join(f'<circle cx="{cx+dx*s}" cy="{cy+dy*s}" r="{13*s}" fill="{CHERRY}" stroke="{INK}" stroke-width="4"/>'
                      for dx, dy in ((-12, -8), (12, -8), (0, 12)))
    return leaf(200) + leaf(-20) + berries


def santa_hat(x, y, s=1.0):
    return (f'<g transform="translate({x},{y}) scale({s})" stroke="{INK}" stroke-width="8" stroke-linejoin="round">'
            f'<path d="M20,120 C40,20 140,-10 230,60 L200,90 C160,50 110,60 90,120 Z" fill="{CHERRY}"/>'
            f'<rect x="0" y="110" width="200" height="44" rx="22" fill="{WHITE}"/>'
            f'<circle cx="232" cy="70" r="26" fill="{WHITE}"/></g>')


def ornament(cx, cy, r, fill=CHERRY, band=MUSTARD):
    return (f'<rect x="{cx-r*0.25}" y="{cy-r*1.22}" width="{r*0.5}" height="{r*0.3}" fill="{CHROME2}" stroke="{INK}" stroke-width="5"/>'
            f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{fill}" stroke="{INK}" stroke-width="7"/>'
            f'<path d="M{cx-r*0.96},{cy-r*0.15} h{r*1.92} v{r*0.3} h-{r*1.92} z" fill="{band}" stroke="{INK}" stroke-width="4"/>'
            f'<circle cx="{cx-r*0.4}" cy="{cy-r*0.45}" r="{r*0.15}" fill="{WHITE}" opacity=".8"/>')


def pine(cx, base, w, h, fill=GREEN):
    return (f'<polygon points="{cx},{base-h} {cx-w/2},{base-h*0.35} {cx-w*0.2},{base-h*0.38} {cx-w*0.6},{base} {cx+w*0.6},{base} '
            f'{cx+w*0.2},{base-h*0.38} {cx+w/2},{base-h*0.35}" fill="{fill}" stroke="{INK}" stroke-width="7" stroke-linejoin="round"/>')


def boomerang(cx, cy, s=1.0, fill=TEAL, rot=0):
    return (f'<path transform="translate({cx},{cy}) rotate({rot}) scale({s})" d="M-80,30 Q0,-70 80,30 Q0,-20 -80,30 Z" '
            f'fill="{fill}" stroke="{INK}" stroke-width="{6/s:.1f}" stroke-linejoin="round"/>')
