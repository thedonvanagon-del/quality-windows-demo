"""Rubber-hose retro mascot kit (1930s cartoon x 70s groovy). Canvas 1200x1000."""
import math, os

FP = os.path.join(os.path.dirname(os.path.abspath(__file__)), "node_modules", "@fontsource")
def _f(pkg): return f"file://{FP}/{pkg}/files/{pkg}-latin-400-normal.woff2"
FONTS = {k: _f(v) for k, v in {
    "Slab": "alfa-slab-one", "Bagel": "bagel-fat-one", "Titan": "titan-one", "Bebas": "bebas-neue",
    "Rye": "rye", "Lilita": "lilita-one", "Shrikhand": "shrikhand", "Pacifico": "pacifico",
    "Chango": "chango", "Righteous": "righteous", "Yellowtail": "yellowtail", "Lobster": "lobster"}.items()}
FACES = "".join(f"@font-face{{font-family:'{k}';src:url('{v}');}}" for k, v in FONTS.items())

# Palettes: ink, paper (light), mid, accent, cup, shoe
MOCHA = dict(ink="#3b2316", paper="#fbf1e1", peach="#f4d2b8", accent="#d9653b", cup="#fbf1e1", tan="#b9875a", shoe="#7a4a2a", sleeve="#d9653b")
SEPIA = dict(ink="#5a3a22", paper="#f3e6cf", peach="#e8d3b4", accent="#9a6a42", cup="#e8d3b4", tan="#b9875a", shoe="#5a3a22", sleeve="#9a6a42")
XMAS = dict(ink="#2b1d16", paper="#fbf1e1", peach="#f4d2b8", accent="#c8372d", cup="#fbf1e1", tan="#2f6b45", shoe="#c8372d", sleeve="#2f6b45")
PEACH = dict(ink="#3b2316", paper="#fbefe3", peach="#f6cdb3", accent="#e0603f", cup="#e0603f", tan="#b9875a", shoe="#7a4a2a", sleeve="#fbefe3")
GREEN = dict(ink="#23301f", paper="#f3ecd8", peach="#dfe6c8", accent="#c8372d", cup="#f3ecd8", tan="#3f6b3a", shoe="#3f6b3a", sleeve="#c8372d")

_id = [0]
def uid(p="u"):
    _id[0] += 1
    return f"{p}{_id[0]}"


def svg(body):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1000" width="1200" height="1000">'
            f'<style>{FACES}</style>{body}</svg>')


def esc(s):
    return s.replace("&", "&amp;")


def fit(inner, x, y, maxw):
    return f'<g data-max="{maxw}" data-x="{x}" data-y="{y}">{inner}</g>'


def text(x, y, s, size, font, fill, maxw=1060, spacing=0, anchor="middle", stroke=None, sw=0, shadow=None, depth=0):
    base = f'font-family="{font}" font-size="{size}" text-anchor="{anchor}" letter-spacing="{spacing}"'
    out = ""
    if shadow:
        out += (f'<text x="{x+depth}" y="{y+depth}" {base} fill="{shadow}" stroke="{shadow}" stroke-width="{sw}" '
                f'stroke-linejoin="round">{esc(s)}</text>')
    st = f'stroke="{stroke}" stroke-width="{sw}" stroke-linejoin="round" paint-order="stroke"' if stroke else ""
    out += f'<text x="{x}" y="{y}" {base} fill="{fill}" {st}>{esc(s)}</text>'
    return fit(out, x, y, maxw)


def arc(cx, cy, r, s, size, font, fill, top=True, spacing=4):
    i = uid("arc")
    d = f"M {cx-r},{cy} A {r},{r} 0 0 1 {cx+r},{cy}" if top else f"M {cx-r},{cy} A {r},{r} 0 0 0 {cx+r},{cy}"
    return (f'<defs><path id="{i}" d="{d}"/></defs><text font-family="{font}" font-size="{size}" fill="{fill}" '
            f'letter-spacing="{spacing}"><textPath href="#{i}" startOffset="50%" text-anchor="middle">{esc(s)}</textPath></text>')


def sparkle(cx, cy, r, fill, stroke=None, sw=0):
    k = r * 0.18
    st = f'stroke="{stroke}" stroke-width="{sw}" stroke-linejoin="round"' if stroke else ""
    return (f'<path d="M{cx},{cy-r} Q{cx+k},{cy-k} {cx+r},{cy} Q{cx+k},{cy+k} {cx},{cy+r} '
            f'Q{cx-k},{cy+k} {cx-r},{cy} Q{cx-k},{cy-k} {cx},{cy-r} Z" fill="{fill}" {st}/>')


def outline_sparkle(cx, cy, r, ink, sw=6):
    return sparkle(cx, cy, r, "none", ink, sw)


def checker(x, y, w, h, cell, a, b, clip):
    cid = uid("ck")
    sq = [f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{b}"/>']
    for i in range(int(w // cell) + 2):
        for j in range(int(h // cell) + 2):
            if (i + j) % 2 == 0:
                sq.append(f'<rect x="{x + i*cell}" y="{y + j*cell}" width="{cell}" height="{cell}" fill="{a}"/>')
    return f'<clipPath id="{cid}">{clip}</clipPath><g clip-path="url(#{cid})">{"".join(sq)}</g>'


def cloud(cx, cy, s, fill, ink, sw=6):
    return (f'<path transform="translate({cx},{cy}) scale({s})" d="M-90,30 C-120,30 -120,-10 -90,-12 C-92,-50 -40,-60 -24,-30 '
            f'C-12,-70 50,-66 52,-24 C80,-36 110,-10 92,18 C104,30 90,40 76,30 Z" fill="{fill}" stroke="{ink}" stroke-width="{sw/s:.1f}" stroke-linejoin="round"/>')


# ---------------- character parts ----------------

def eye(cx, cy, p, look=(4, 4), lid=0.0, s=1.0):
    """Pie-cut eye. lid 0..0.6 droops the upper lid (sleepy)."""
    rx, ry = 27 * s, 36 * s
    px, py = cx + look[0] * s, cy + look[1] * s
    prx, pry = 15 * s, 22 * s
    a1, a2 = math.radians(-25), math.radians(-70)
    x1, y1 = px + prx * math.cos(a1), py + pry * math.sin(a1)
    x2, y2 = px + prx * math.cos(a2), py + pry * math.sin(a2)
    g = (f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="#ffffff" stroke="{p["ink"]}" stroke-width="{7*s}"/>'
         f'<path d="M{px},{py} L{x1:.1f},{y1:.1f} A{prx},{pry} 0 1 1 {x2:.1f},{y2:.1f} Z" fill="{p["ink"]}"/>')
    if lid:
        cid = uid("ey")
        g += (f'<clipPath id="{cid}"><ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}"/></clipPath>'
              f'<rect x="{cx-rx-2}" y="{cy-ry-2}" width="{2*rx+4}" height="{2*ry*lid+2}" fill="{p["cup"]}" clip-path="url(#{cid})"/>'
              f'<path d="M{cx-rx},{cy-ry+2*ry*lid} Q{cx},{cy-ry+2*ry*lid+6*s} {cx+rx},{cy-ry+2*ry*lid}" fill="none" stroke="{p["ink"]}" stroke-width="{7*s}" stroke-linecap="round"/>'
              f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="none" stroke="{p["ink"]}" stroke-width="{7*s}"/>')
    return g


def face(cx, cy, p, mood="smile", look=(4, 4), lid=0.0, s=1.0, nose=None):
    ink = p["ink"]
    g = eye(cx - 34 * s, cy, p, look, lid, s) + eye(cx + 34 * s, cy, p, look, lid, s)
    g += (f'<path d="M{cx-58*s},{cy-50*s} q20,-14 36,-2" fill="none" stroke="{ink}" stroke-width="{6*s}" stroke-linecap="round"/>'
          f'<path d="M{cx+22*s},{cy-52*s} q20,-12 36,2" fill="none" stroke="{ink}" stroke-width="{6*s}" stroke-linecap="round"/>')
    my = cy + 58 * s
    if mood == "smile":
        g += f'<path d="M{cx-30*s},{my} q30,{26*s} 60,0" fill="none" stroke="{ink}" stroke-width="{7*s}" stroke-linecap="round"/>'
    elif mood == "grin":
        g += (f'<path d="M{cx-34*s},{my-4*s} q34,{40*s} 68,0 z" fill="{ink}" stroke="{ink}" stroke-width="{6*s}" stroke-linejoin="round"/>'
              f'<path d="M{cx-16*s},{my+14*s} q16,{-8*s} 32,0 q-16,{12*s} -32,0" fill="{p["accent"]}"/>')
    elif mood == "oh":
        g += f'<ellipse cx="{cx}" cy="{my+4*s}" rx="{10*s}" ry="{13*s}" fill="{ink}"/>'
    elif mood == "smirk":
        g += f'<path d="M{cx-26*s},{my+4*s} q26,{14*s} 52,{-10*s}" fill="none" stroke="{ink}" stroke-width="{7*s}" stroke-linecap="round"/>'
    for sx in (-1, 1):
        g += f'<ellipse cx="{cx + sx*64*s}" cy="{cy + 40*s}" rx="{14*s}" ry="{9*s}" fill="{p["accent"]}" opacity=".55"/>'
    if nose:
        g += (f'<circle cx="{cx}" cy="{cy+30*s}" r="{19*s}" fill="{nose}" stroke="{ink}" stroke-width="{6*s}"/>'
              f'<circle cx="{cx-6*s}" cy="{cy+24*s}" r="{5*s}" fill="#ffffff"/>')
    return g


def glove(x, y, rot, p, s=1.0, kind="open"):
    ink = p["ink"]
    if kind == "fist":
        hand = (f'<path d="M-24,-10 C-26,-34 22,-36 26,-12 C34,-6 32,14 20,18 C6,28 -20,26 -26,10 Z" fill="#ffffff" stroke="{ink}" stroke-width="7" stroke-linejoin="round"/>'
                f'<path d="M-8,-20 v14 M8,-22 v14" stroke="{ink}" stroke-width="5" stroke-linecap="round"/>')
    elif kind == "thumb":
        hand = (f'<path d="M-24,-6 C-26,-30 20,-32 24,-10 C32,-4 30,14 18,18 C6,26 -20,24 -26,10 Z" fill="#ffffff" stroke="{ink}" stroke-width="7" stroke-linejoin="round"/>'
                f'<path d="M-6,-24 C-10,-52 12,-56 14,-28" fill="#ffffff" stroke="{ink}" stroke-width="7" stroke-linejoin="round"/>')
    else:
        hand = (f'<path d="M-22,10 C-34,-6 -30,-26 -18,-30 C-20,-46 -4,-52 2,-40 C6,-54 24,-52 24,-36 C38,-38 42,-20 32,-8 '
                f'C42,4 34,22 18,24 C6,32 -14,28 -22,10 Z" fill="#ffffff" stroke="{ink}" stroke-width="7" stroke-linejoin="round"/>'
                f'<path d="M-4,-22 l2,14 M12,-24 l0,14" stroke="{ink}" stroke-width="5" stroke-linecap="round"/>')
    cuff = f'<rect x="-22" y="22" width="44" height="18" rx="8" fill="#ffffff" stroke="{ink}" stroke-width="7"/>'
    return f'<g transform="translate({x},{y}) rotate({rot}) scale({s})">{cuff}{hand}</g>'


def hose(points, p, w=16):
    (x0, y0), (c1x, c1y), (c2x, c2y), (x1, y1) = points
    return (f'<path d="M{x0},{y0} C{c1x},{c1y} {c2x},{c2y} {x1},{y1}" fill="none" stroke="{p["ink"]}" '
            f'stroke-width="{w}" stroke-linecap="round"/>')


def shoe(x, y, p, flip=False, rot=0, s=1.0):
    ink = p["ink"]
    sx = -1 if flip else 1
    return (f'<g transform="translate({x},{y}) rotate({rot}) scale({sx*s},{s})" stroke="{ink}" stroke-width="7" stroke-linejoin="round">'
            f'<path d="M-30,-18 C-10,-30 30,-26 50,-8 C70,0 72,22 52,24 H-34 C-46,24 -48,0 -30,-18 Z" fill="{p["shoe"]}"/>'
            f'<path d="M-40,14 H66" stroke-width="6"/>'
            f'<path d="M24,-24 C44,-20 66,-6 66,14 H40 C40,0 34,-12 24,-24 Z" fill="#ffffff" stroke-width="6"/></g>')


def shadow(cx, cy, w, p):
    return f'<ellipse cx="{cx}" cy="{cy}" rx="{w}" ry="{w*0.13:.0f}" fill="{p["ink"]}" opacity=".9"/>'


def steam(cx, top, p, n=1):
    return "".join(f'<path d="M{cx+dx},{top} c-18,-20 18,-34 0,-56 c-18,-22 18,-34 0,-56" fill="none" stroke="{p["ink"]}" stroke-width="7" stroke-linecap="round"/>'
                   for dx in ([0] if n == 1 else [-26, 26]))


# ---------------- bodies ----------------

def cup_body(p, lid_color=None):
    ink, cup = p["ink"], p["cup"]
    def hw(y): return 110 - 25 * (y + 150) / 300
    sl = (f'<path d="M{-hw(45):.0f},45 L{hw(45):.0f},45 L{hw(118):.0f},118 L{-hw(118):.0f},118 Z" fill="{p["sleeve"]}" stroke="{ink}" stroke-width="7"/>')
    lid = lid_color or p["tan"]
    return (f'<path d="M-110,-150 L110,-150 L85,150 Q84,166 68,166 L-68,166 Q-84,166 -85,150 Z" fill="{cup}" stroke="{ink}" stroke-width="9" stroke-linejoin="round"/>'
            + sl +
            f'<path d="M-96,-140 l14,200" stroke="#ffffff" stroke-width="10" opacity=".55" stroke-linecap="round"/>'
            f'<rect x="-126" y="-186" width="252" height="40" rx="16" fill="{lid}" stroke="{ink}" stroke-width="9"/>'
            f'<path d="M-104,-186 Q-98,-226 -58,-228 H58 Q98,-226 104,-186 Z" fill="{lid}" stroke="{ink}" stroke-width="9" stroke-linejoin="round"/>'
            f'<ellipse cx="40" cy="-212" rx="18" ry="6" fill="{ink}"/>')


def mug_body(p):
    ink, cup = p["ink"], p["cup"]
    return (f'<path d="M118,-60 c90,-6 96,130 0,124" fill="none" stroke="{ink}" stroke-width="44" stroke-linecap="round"/>'
            f'<path d="M118,-60 c90,-6 96,130 0,124" fill="none" stroke="{cup}" stroke-width="22" stroke-linecap="round"/>'
            f'<path d="M-130,-140 H130 V120 Q130,160 90,160 H-90 Q-130,160 -130,120 Z" fill="{cup}" stroke="{ink}" stroke-width="9" stroke-linejoin="round"/>'
            f'<rect x="-126" y="78" width="252" height="30" fill="{p["sleeve"]}"/>'
            f'<ellipse cx="0" cy="-140" rx="130" ry="24" fill="{p["shoe"]}" stroke="{ink}" stroke-width="9"/>'
            f'<path d="M-110,-110 v200" stroke="#ffffff" stroke-width="10" opacity=".55" stroke-linecap="round"/>')


def bean_body(p):
    ink = p["ink"]
    return (f'<ellipse cx="0" cy="0" rx="135" ry="170" fill="{p["shoe"]}" stroke="{ink}" stroke-width="9"/>'
            f'<path d="M30,-160 C-40,-80 80,40 10,165" fill="none" stroke="{ink}" stroke-width="10" stroke-linecap="round"/>'
            f'<path d="M-90,-90 q-20,40 -14,100" fill="none" stroke="#ffffff" stroke-width="10" opacity=".35" stroke-linecap="round"/>')


def pot_body(p):
    ink = p["ink"]
    return (f'<path d="M-70,-170 H70 L60,-130 C150,-80 160,60 125,165 H-125 C-160,60 -150,-80 -60,-130 Z" fill="#e8f2f0" stroke="{ink}" stroke-width="9" stroke-linejoin="round"/>'
            f'<path d="M-138,10 C-120,-50 -90,-80 -50,-92 H50 C90,-80 120,-50 138,10 L125,165 H-125 Z" fill="{p["shoe"]}" stroke="none"/>'
            f'<path d="M-70,-170 H70 L60,-130 C150,-80 160,60 125,165 H-125 C-160,60 -150,-80 -60,-130 Z" fill="none" stroke="{ink}" stroke-width="9" stroke-linejoin="round"/>'
            f'<path d="M-86,-212 H86 a10,10 0 0 1 10,10 V-170 H-96 V-202 a10,10 0 0 1 10,-10 Z" fill="{p["accent"]}" stroke="{ink}" stroke-width="9"/>'
            f'<path d="M140,-90 c90,0 90,130 20,190" fill="none" stroke="{ink}" stroke-width="34" stroke-linecap="round"/>'
            f'<path d="M140,-90 c90,0 90,130 20,190" fill="none" stroke="{p["accent"]}" stroke-width="16" stroke-linecap="round"/>'
            f'<path d="M-112,-20 q-16,60 -6,150" fill="none" stroke="#ffffff" stroke-width="12" opacity=".6" stroke-linecap="round"/>')


BODIES = {"cup": (cup_body, -60, 110, 166, -228), "mug": (mug_body, -50, 130, 160, -164),
          "bean": (bean_body, -40, 128, 168, -170), "pot": (pot_body, -40, 130, 165, -212)}


# ---------------- props ----------------

def santa_hat(x, y, p, s=1.0, rot=-8):
    ink = p["ink"]
    return (f'<g transform="translate({x},{y}) rotate({rot}) scale({s})" stroke="{ink}" stroke-width="8" stroke-linejoin="round">'
            f'<path d="M-110,0 C-80,-110 40,-150 150,-60 L118,-30 C60,-80 -10,-60 -40,0 Z" fill="#c8372d"/>'
            f'<rect x="-128" y="-14" width="256" height="44" rx="22" fill="#ffffff"/>'
            f'<circle cx="152" cy="-58" r="28" fill="#ffffff"/></g>')


def antlers(x, y, p, s=1.0):
    ink = p["ink"]
    d = "M0,0 C-10,-60 -30,-90 -60,-120 M-22,-62 C-50,-70 -70,-60 -86,-50 M-40,-96 C-40,-124 -30,-140 -20,-150"
    one = (f'<path d="{d}" fill="none" stroke="{ink}" stroke-width="30" stroke-linecap="round"/>'
           f'<path d="{d}" fill="none" stroke="#b9875a" stroke-width="16" stroke-linecap="round"/>')
    return (f'<g transform="translate({x-70},{y}) scale({s})">{one}</g>'
            f'<g transform="translate({x+70},{y}) scale({-s},{s})">{one}</g>')


def scarf(y, halfw, p, color=None, s=1.0):
    ink = p["ink"]
    c = color or p["accent"]
    return (f'<path d="M{-halfw-6},{y-22} Q0,{y+12} {halfw+6},{y-22} L{halfw+2},{y+16} Q0,{y+50} {-halfw-2},{y+16} Z" fill="{c}" stroke="{ink}" stroke-width="8" stroke-linejoin="round"/>'
            f'<path d="M{halfw-40},{y+18} l40,110 l-46,8 l-30,-100 z" fill="{c}" stroke="{ink}" stroke-width="8" stroke-linejoin="round"/>'
            + "".join(f'<path d="M{halfw-40+i*16},{y+150-i*2} v-26" stroke="{ink}" stroke-width="5"/>' for i in range(0)) +
            f'<path d="M{-halfw+10},{y-2} Q0,{y+30} {halfw-10},{y-2}" fill="none" stroke="#ffffff" stroke-width="6" stroke-dasharray="14 12" opacity=".8"/>')


def candy_cane(x, y, p, rot=0, s=1.0):
    ink = p["ink"]
    cid = uid("cc")
    return (f'<defs><pattern id="{cid}" width="34" height="34" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">'
            f'<rect width="34" height="34" fill="#ffffff"/><rect width="15" height="34" fill="#c8372d"/></pattern></defs>'
            f'<g transform="translate({x},{y}) rotate({rot}) scale({s})">'
            f'<path d="M0,180 V0 a40,40 0 0 0 -80,0" fill="none" stroke="{ink}" stroke-width="40" stroke-linecap="round"/>'
            f'<path d="M0,180 V0 a40,40 0 0 0 -80,0" fill="none" stroke="url(#{cid})" stroke-width="26" stroke-linecap="round"/></g>')


def gift(x, y, p, s=1.0):
    ink = p["ink"]
    return (f'<g transform="translate({x},{y}) scale({s})" stroke="{ink}" stroke-width="8" stroke-linejoin="round">'
            f'<rect x="-60" y="-50" width="120" height="100" fill="{p["accent"]}"/>'
            f'<rect x="-70" y="-74" width="140" height="30" fill="{p["accent"]}"/>'
            f'<rect x="-12" y="-74" width="24" height="124" fill="{p["paper"]}"/>'
            f'<path d="M0,-74 c-50,-50 -70,10 0,0 c70,10 50,-50 0,0" fill="{p["paper"]}"/></g>')


def lights(x0, y0, x1, y1, sag, p, n=7):
    colors = ["#c8372d", "#f2b33d", "#2f6b45", "#4a8fc4"]
    d = f"M{x0},{y0} Q{(x0+x1)/2},{(y0+y1)/2+sag} {x1},{y1}"
    g = f'<path d="{d}" fill="none" stroke="{p["ink"]}" stroke-width="6"/>'
    for i in range(1, n + 1):
        t = i / (n + 1)
        x = (1 - t) ** 2 * x0 + 2 * (1 - t) * t * (x0 + x1) / 2 + t ** 2 * x1
        y = (1 - t) ** 2 * y0 + 2 * (1 - t) * t * ((y0 + y1) / 2 + sag) + t ** 2 * y1
        g += (f'<rect x="{x-7}" y="{y}" width="14" height="10" fill="{p["ink"]}"/>'
              f'<ellipse cx="{x}" cy="{y+26}" rx="12" ry="18" fill="{colors[i % 4]}" stroke="{p["ink"]}" stroke-width="5"/>')
    return g


def earmuffs(y, halfw, p):
    ink = p["ink"]
    return (f'<path d="M{-halfw+4},{y} C{-halfw+10},{y-130} {halfw-10},{y-130} {halfw-4},{y}" fill="none" stroke="{ink}" stroke-width="16"/>'
            f'<circle cx="{-halfw}" cy="{y}" r="34" fill="{p["accent"]}" stroke="{ink}" stroke-width="8"/>'
            f'<circle cx="{halfw}" cy="{y}" r="34" fill="{p["accent"]}" stroke="{ink}" stroke-width="8"/>')


# ---------------- whole character ----------------

POSES = {
    # (left arm end, left glove, right arm end, right glove, legs)
    "walk": dict(la=(-230, -10, 200, "open"), ra=(210, 60, -20, "fist"), legs="walk"),
    "wave": dict(la=(-220, 70, 160, "fist"), ra=(220, -150, -20, "open"), legs="stand"),
    "cheer": dict(la=(-230, -170, 20, "open"), ra=(230, -170, -20, "open"), legs="stand"),
    "thumbs": dict(la=(-220, 70, 160, "fist"), ra=(230, -40, -10, "thumb"), legs="walk"),
    "hold": dict(la=(-150, 70, 180, "fist"), ra=(150, 70, 180, "fist"), legs="stand"),
    "strut": dict(la=(-210, 80, 150, "fist"), ra=(230, -120, -30, "thumb"), legs="walk"),
}


def character(cx, cy, p, body="cup", pose="walk", mood="smile", s=1.0, look=(4, 4), lid=0.0, nose=None,
              hat=None, prop=None, ground=True, steam_on=True, hand_item=None):
    """A full mascot. (cx, cy) is the body center. Returns SVG."""
    fn, face_y, half, bottom, top = BODIES[body]
    ps = POSES[pose]
    g = []
    # legs
    hip = bottom - 10
    if ps["legs"] == "walk":
        g.append(hose(((-40, hip), (-60, hip + 80), (-120, hip + 100), (-130, hip + 175)), p, 19))
        g.append(hose(((40, hip), (50, hip + 80), (120, hip + 90), (140, hip + 175)), p, 19))
        g.append(shoe(-132, hip + 188, p, flip=True, rot=14, s=1.3))
        g.append(shoe(152, hip + 188, p, rot=-6, s=1.3))
        foot_y = hip + 220
    else:
        g.append(hose(((-45, hip), (-50, hip + 60), (-75, hip + 120), (-75, hip + 175)), p, 19))
        g.append(hose(((45, hip), (50, hip + 60), (75, hip + 120), (75, hip + 175)), p, 19))
        g.append(shoe(-92, hip + 188, p, flip=True, s=1.3))
        g.append(shoe(92, hip + 188, p, s=1.3))
        foot_y = hip + 220
    sh = shadow(0, foot_y, 210, p) if ground else ""
    # arms
    arms, gloves = [], []
    for side, key in ((-1, "la"), (1, "ra")):
        ex, ey, rot, kind = ps[key]
        sx = side * (half - 8)
        sy = -20
        midx = (sx + ex) / 2 + side * 40
        arms.append(hose(((sx, sy), (sx + side * 70, sy), (midx, ey + (sy - ey) * 0.2), (ex, ey)), p, 16))
        gloves.append(glove(ex, ey, rot, p, 1.25, kind))
    body_svg = fn(p)
    face_svg = face(0, face_y, p, mood, look, lid, 1.28, nose)
    extra_top = ""
    if hat == "santa":
        extra_top = santa_hat(-6, top + 14, p, 1.0)
    elif hat == "antlers":
        extra_top = antlers(0, top + 10, p, 1.0)
    elif hat == "tophat":
        extra_top = (f'<g stroke="{p["ink"]}" stroke-width="9" stroke-linejoin="round">'
                     f'<rect x="-80" y="{top-170}" width="160" height="180" rx="10" fill="{p["ink"]}"/>'
                     f'<rect x="-80" y="{top-40}" width="160" height="34" fill="#e0b13a"/>'
                     f'<rect x="-116" y="{top-8}" width="232" height="26" rx="12" fill="{p["ink"]}"/></g>'
                     f'<path d="M-40,{top-150} q60,-60 120,-30" fill="none" stroke="#c8372d" stroke-width="16" stroke-linecap="round"/>')
    elif hat == "earmuffs":
        extra_top = earmuffs(face_y - 20, half + 10, p)
    st = steam(0, top - 10, p, 2) if steam_on and not hat else ""
    sy = {"cup": 62, "mug": 70, "bean": 85, "pot": 70}[body]
    shw = {"cup": 100, "mug": 128, "bean": 118, "pot": 140}[body]
    scarf_svg = scarf(sy, shw, p) if prop == "scarf" else ""
    item = hand_item(ps) if hand_item else ""
    inner = "".join(g) + body_svg + face_svg + scarf_svg + "".join(arms) + item + "".join(gloves) + extra_top + st
    return f'<g transform="translate({cx},{cy}) scale({s})">{sh}{inner}</g>'


def stamp_frame(x, y, w, h, p, fill=None, ink=None, step=26):
    """Postage-stamp scalloped border."""
    ink = ink or p["ink"]
    pts = []
    def edge(x0, y0, x1, y1, n):
        out = []
        for i in range(n):
            ax, ay = x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n
            bx, by = x0 + (x1 - x0) * (i + 1) / n, y0 + (y1 - y0) * (i + 1) / n
            out.append(f"A{step/2*0.62:.1f},{step/2*0.62:.1f} 0 0 0 {bx:.1f},{by:.1f}")
        return out
    nx, ny = int(w // step), int(h // step)
    d = [f"M{x},{y}"] + edge(x, y, x + w, y, nx) + edge(x + w, y, x + w, y + h, ny) + edge(x + w, y + h, x, y + h, nx) + edge(x, y + h, x, y, ny)
    return (f'<path d="{" ".join(d)} Z" fill="{fill or p["paper"]}" stroke="{ink}" stroke-width="8" stroke-linejoin="round"/>'
            f'<rect x="{x+28}" y="{y+28}" width="{w-56}" height="{h-56}" fill="none" stroke="{ink}" stroke-width="7"/>')


MONO = lambda ink, paper: dict(ink=ink, paper=paper, peach=paper, accent=paper, cup=paper, tan=paper, shoe=ink, sleeve=ink)


def gingerbread(x, y, p, s=1.0):
    ink, c = p["ink"], "#c98b4f"
    limbs = [((0, 20), (0, 90), 70), ((-60, 45), (60, 45), 36), ((0, 85), (-38, 140), 40), ((0, 85), (38, 140), 40)]
    g = "".join(f'<line x1="{a[0]}" y1="{a[1]}" x2="{b[0]}" y2="{b[1]}" stroke="{ink}" stroke-width="{w+14}" stroke-linecap="round"/>' for a, b, w in limbs)
    g += f'<circle cx="0" cy="-10" r="42" fill="{ink}"/>'
    g += "".join(f'<line x1="{a[0]}" y1="{a[1]}" x2="{b[0]}" y2="{b[1]}" stroke="{c}" stroke-width="{w}" stroke-linecap="round"/>' for a, b, w in limbs)
    g += (f'<circle cx="0" cy="-10" r="35" fill="{c}"/><circle cx="-12" cy="-16" r="5" fill="{ink}"/><circle cx="12" cy="-16" r="5" fill="{ink}"/>'
          f'<path d="M-12,2 q12,10 24,0" fill="none" stroke="{ink}" stroke-width="4" stroke-linecap="round"/>'
          f'<circle cx="0" cy="45" r="6" fill="#ffffff"/><circle cx="0" cy="70" r="6" fill="#ffffff"/>')
    return f'<g transform="translate({x},{y}) scale({s})">{g}</g>'


def mistletoe(x, y, p, s=1.0):
    ink = p["ink"]
    leaf = lambda r: (f'<path transform="rotate({r})" d="M0,0 C20,-14 60,-14 80,0 C60,14 20,14 0,0 Z" fill="#4f7d3a" stroke="{ink}" stroke-width="6" stroke-linejoin="round"/>')
    return (f'<g transform="translate({x},{y}) scale({s})"><path d="M0,-200 V0" stroke="#c8372d" stroke-width="8"/>'
            f'<path d="M-26,-14 q26,-30 52,0" fill="none" stroke="#c8372d" stroke-width="10"/>'
            + leaf(140) + leaf(40) + leaf(170) + leaf(10) +
            "".join(f'<circle cx="{cx}" cy="{cy}" r="11" fill="#ffffff" stroke="{ink}" stroke-width="4"/>' for cx, cy in ((-8, 8), (10, 12), (0, -4))) + "</g>")
