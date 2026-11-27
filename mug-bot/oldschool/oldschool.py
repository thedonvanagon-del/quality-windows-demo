"""1930s cartoon kit: pie-cut eyes, open grins, puffy 4-finger gloves, big round shoes,
bouncy poses with motion lines, film title cards. Builds on toon.py helpers."""
import math
import toon
from toon import (fit, text, arc, sparkle, outline_sparkle, uid, esc, hose, steam, santa_hat, antlers,
                  scarf, candy_cane, gift, lights, earmuffs, gingerbread, mistletoe, stamp_frame)

toon.FONTS.update({k: toon._f(v) for k, v in {"Luckiest": "luckiest-guy", "Limelight": "limelight",
                                               "Sancreek": "sancreek"}.items()})
FACES = "".join(f"@font-face{{font-family:'{k}';src:url('{v}');}}" for k, v in toon.FONTS.items())

# Palettes: black-and-white film with one red, aged sepia, two-strip color
FILM = dict(ink="#1a1714", paper="#f3ead4", grey="#a39b8c", mid="#d9cfb6", accent="#c2362b",
            cup="#faf4e4", shoe="#1a1714", sleeve="#1a1714", lid="#1a1714", glove="#ffffff")
SEPIA = dict(ink="#2e1f14", paper="#efe0c2", grey="#a8895f", mid="#dcc59c", accent="#9c4a26",
             cup="#f7ecd4", shoe="#2e1f14", sleeve="#2e1f14", lid="#2e1f14", glove="#fffaf0")
TWOSTRIP = dict(ink="#1c1612", paper="#f4e6cc", grey="#3f8a83", mid="#e8c9a4", accent="#d6512c",
                cup="#faf1df", shoe="#d6512c", sleeve="#3f8a83", lid="#1c1612", glove="#ffffff")


def svg(body):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1000" width="1200" height="1000">'
            f'<style>{FACES}</style>{body}</svg>')


# ---------------- face ----------------

def pie_pupil(cx, cy, rx, ry, color, cut=True):
    if not cut:
        return f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="{color}"/>'
    a1, a2 = math.radians(-20), math.radians(-62)
    x1, y1 = cx + rx * math.cos(a1), cy + ry * math.sin(a1)
    x2, y2 = cx + rx * math.cos(a2), cy + ry * math.sin(a2)
    return f'<path d="M{cx},{cy} L{x1:.1f},{y1:.1f} A{rx},{ry} 0 1 1 {x2:.1f},{y2:.1f} Z" fill="{color}"/>'


def face(cx, cy, p, mood="grin", look=(0, 6), s=1.0, nose=None, mask=False, lid=0.0):
    ink = p["ink"]
    g = ""
    if mask:  # cream face patch on a dark body, 1930s style
        g += (f'<path d="M{cx-92*s},{cy+10*s} C{cx-100*s},{cy-60*s} {cx-60*s},{cy-80*s} {cx-30*s},{cy-62*s} '
              f'C{cx-10*s},{cy-90*s} {cx+10*s},{cy-90*s} {cx+30*s},{cy-62*s} C{cx+60*s},{cy-80*s} {cx+100*s},{cy-60*s} {cx+92*s},{cy+10*s} '
              f'C{cx+96*s},{cy+90*s} {cx+40*s},{cy+120*s} {cx},{cy+118*s} C{cx-40*s},{cy+120*s} {cx-96*s},{cy+90*s} {cx-92*s},{cy+10*s} Z" '
              f'fill="{p["cup"]}"/>')
    # eye whites: two tall ovals touching
    for sx in (-1, 1):
        ex = cx + sx * 25 * s
        g += f'<ellipse cx="{ex}" cy="{cy-8*s}" rx="{25*s}" ry="{44*s}" fill="#ffffff" stroke="{ink}" stroke-width="{6*s}"/>'
        g += pie_pupil(ex + look[0] * s, cy + (look[1] + 6) * s, 15 * s, 30 * s, ink)
        if lid:
            cid = uid("ld")
            top = cy - 8 * s - 44 * s
            h = 88 * s * lid
            g += (f'<clipPath id="{cid}"><ellipse cx="{ex}" cy="{cy-8*s}" rx="{25*s}" ry="{44*s}"/></clipPath>'
                  f'<rect x="{ex-27*s}" y="{top-2}" width="{54*s}" height="{h+2}" fill="{p["cup"] if not mask else p["cup"]}" clip-path="url(#{cid})"/>'
                  f'<path d="M{ex-25*s},{top+h} Q{ex},{top+h+10*s} {ex+25*s},{top+h}" fill="none" stroke="{ink}" stroke-width="{6*s}" stroke-linecap="round"/>'
                  f'<ellipse cx="{ex}" cy="{cy-8*s}" rx="{25*s}" ry="{44*s}" fill="none" stroke="{ink}" stroke-width="{6*s}"/>')
    my = cy + 52 * s
    if mood == "grin":  # wide open mouth, tongue, smile creases
        g += (f'<path d="M{cx-62*s},{my-6*s} Q{cx},{my+12*s} {cx+62*s},{my-6*s} Q{cx+50*s},{my+70*s} {cx},{my+72*s} Q{cx-50*s},{my+70*s} {cx-62*s},{my-6*s} Z" '
              f'fill="{ink}" stroke="{ink}" stroke-width="{6*s}" stroke-linejoin="round"/>'
              f'<path d="M{cx-30*s},{my+56*s} Q{cx},{my+28*s} {cx+30*s},{my+56*s} Q{cx},{my+74*s} {cx-30*s},{my+56*s} Z" fill="{p["accent"]}"/>'
              f'<path d="M{cx-70*s},{my-18*s} q-10,{14*s} 2,{26*s}" fill="none" stroke="{ink}" stroke-width="{6*s}" stroke-linecap="round"/>'
              f'<path d="M{cx+70*s},{my-18*s} q10,{14*s} -2,{26*s}" fill="none" stroke="{ink}" stroke-width="{6*s}" stroke-linecap="round"/>')
    elif mood == "smile":
        g += (f'<path d="M{cx-50*s},{my} Q{cx},{my+46*s} {cx+50*s},{my}" fill="none" stroke="{ink}" stroke-width="{8*s}" stroke-linecap="round"/>'
              f'<path d="M{cx-58*s},{my-10*s} q-6,{12*s} 4,{20*s} M{cx+58*s},{my-10*s} q6,{12*s} -4,{20*s}" fill="none" stroke="{ink}" stroke-width="{6*s}" stroke-linecap="round"/>')
    elif mood == "oh":
        g += f'<ellipse cx="{cx}" cy="{my+18*s}" rx="{18*s}" ry="{24*s}" fill="{ink}"/>'
    elif mood == "smirk":
        g += (f'<path d="M{cx-44*s},{my+10*s} Q{cx},{my+40*s} {cx+48*s},{my-10*s}" fill="none" stroke="{ink}" stroke-width="{8*s}" stroke-linecap="round"/>'
              f'<path d="M{cx+52*s},{my-20*s} q8,{10*s} 0,{20*s}" fill="none" stroke="{ink}" stroke-width="{6*s}" stroke-linecap="round"/>')
    if nose:
        g += (f'<ellipse cx="{cx}" cy="{cy+40*s}" rx="{24*s}" ry="{18*s}" fill="{nose}" stroke="{ink}" stroke-width="{6*s}"/>'
              f'<ellipse cx="{cx-8*s}" cy="{cy+34*s}" rx="{7*s}" ry="{4*s}" fill="#ffffff"/>')
    else:
        g += f'<ellipse cx="{cx}" cy="{cy+40*s}" rx="{16*s}" ry="{11*s}" fill="{ink}"/>'
    return g


# ---------------- hands & feet ----------------

def glove(x, y, rot, p, s=1.0, kind="open"):
    ink, w = p["ink"], p["glove"]
    st = f'fill="{w}" stroke="{ink}" stroke-width="6" stroke-linejoin="round"'
    if kind == "open":
        fingers = "".join(f'<ellipse cx="0" cy="-50" rx="13" ry="30" transform="rotate({a})" {st}/>' for a in (-33, -11, 11, 33))
        thumb = f'<ellipse cx="-34" cy="-6" rx="11" ry="22" transform="rotate(-60 -34 -6)" {st}/>'
        palm = f'<ellipse cx="0" cy="-8" rx="36" ry="32" {st}/>'
    elif kind == "thumb":
        fingers = "".join(f'<ellipse cx="{dx}" cy="-12" rx="10" ry="14" {st}/>' for dx in (-18, 0, 18))
        thumb = f'<ellipse cx="-4" cy="-52" rx="12" ry="26" {st}/>'
        palm = f'<ellipse cx="0" cy="-4" rx="34" ry="28" {st}/>'
    else:  # fist
        fingers, thumb = "", ""
        palm = (f'<ellipse cx="0" cy="-10" rx="34" ry="32" {st}/>'
                f'<path d="M-14,-38 q4,14 0,26 M2,-40 q4,14 0,28 M18,-36 q4,12 0,24" fill="none" stroke="{ink}" stroke-width="5" stroke-linecap="round"/>')
    stitches = '' if kind == "fist" else f'<path d="M-12,-2 v-16 M0,0 v-18 M12,-2 v-16" stroke="{ink}" stroke-width="4" stroke-linecap="round"/>'
    cuff = (f'<path d="M-24,16 L24,16 L34,44 Q0,52 -34,44 Z" fill="{w}" stroke="{ink}" stroke-width="6" stroke-linejoin="round"/>'
            f'<path d="M-26,24 Q0,30 26,24" fill="none" stroke="{ink}" stroke-width="4"/>')
    return f'<g transform="translate({x},{y}) rotate({rot}) scale({s})">{cuff}{thumb}{fingers}{palm}{stitches}</g>'


def shoe(x, y, p, flip=False, rot=0, s=1.0):
    ink = p["ink"]
    sx = -1 if flip else 1
    return (f'<g transform="translate({x},{y}) rotate({rot}) scale({sx*s},{s})">'
            f'<path d="M-46,4 C-50,-26 -10,-30 10,-24 C40,-40 92,-30 96,4 C100,30 60,34 20,32 H-30 C-46,32 -48,18 -46,4 Z" '
            f'fill="{p["shoe"]}" stroke="{ink}" stroke-width="7" stroke-linejoin="round"/>'
            f'<ellipse cx="54" cy="-12" rx="18" ry="8" fill="#ffffff" opacity=".85" transform="rotate(-12 54 -12)"/>'
            f'<path d="M-40,26 H70" stroke="{ink}" stroke-width="5"/></g>')


def motion(x, y, side, p, n=3, r=40, s=1.0):
    """Little arcs beside a moving hand or foot."""
    ink = p["ink"]
    out = ""
    for i in range(n):
        rr = r + i * 16
        out += (f'<path d="M{x + side*rr*0.4},{y - rr*0.5} Q{x + side*rr},{y} {x + side*rr*0.4},{y + rr*0.5}" '
                f'fill="none" stroke="{ink}" stroke-width="{6*s}" stroke-linecap="round"/>')
    return out


def bounce(x, y, p):
    ink = p["ink"]
    return "".join(f'<path d="M{x+dx},{y} l{dx*0.4},{14}" stroke="{ink}" stroke-width="6" stroke-linecap="round"/>' for dx in (-60, -30, 0, 30, 60))


# ---------------- bodies (1930s fills) ----------------

def cup_body(p):
    ink = p["ink"]
    def hw(y): return 110 - 25 * (y + 150) / 300
    return (f'<path d="M-110,-150 L110,-150 L85,150 Q84,166 68,166 L-68,166 Q-84,166 -85,150 Z" fill="{p["cup"]}" stroke="{ink}" stroke-width="9" stroke-linejoin="round"/>'
            f'<path d="M{-hw(104):.0f},104 L{hw(104):.0f},104 L{hw(150):.0f},150 L{-hw(150):.0f},150 Z" fill="{p["sleeve"]}" stroke="{ink}" stroke-width="7"/>'
            f'<path d="M{-hw(127)+8:.0f},127 L{hw(127)-8:.0f},127" stroke="{p["cup"]}" stroke-width="6" stroke-dasharray="14 10"/>'
            f'<rect x="-126" y="-186" width="252" height="40" rx="16" fill="{p["lid"]}" stroke="{ink}" stroke-width="9"/>'
            f'<path d="M-104,-186 Q-98,-226 -58,-228 H58 Q98,-226 104,-186 Z" fill="{p["lid"]}" stroke="{ink}" stroke-width="9" stroke-linejoin="round"/>'
            f'<path d="M-80,-200 q10,-16 40,-18" fill="none" stroke="#ffffff" stroke-width="7" opacity=".7" stroke-linecap="round"/>')


def mug_body(p):
    ink = p["ink"]
    return (f'<path d="M118,-60 c90,-6 96,130 0,124" fill="none" stroke="{ink}" stroke-width="46" stroke-linecap="round"/>'
            f'<path d="M118,-60 c90,-6 96,130 0,124" fill="none" stroke="{p["cup"]}" stroke-width="22" stroke-linecap="round"/>'
            f'<path d="M-130,-140 H130 V120 Q130,160 90,160 H-90 Q-130,160 -130,120 Z" fill="{p["cup"]}" stroke="{ink}" stroke-width="9" stroke-linejoin="round"/>'
            f'<rect x="-126" y="130" width="252" height="22" fill="{p["sleeve"]}"/>'
            f'<ellipse cx="0" cy="-140" rx="130" ry="24" fill="{ink}" stroke="{ink}" stroke-width="9"/>'
            f'<ellipse cx="-20" cy="-144" rx="60" ry="8" fill="#ffffff" opacity=".25"/>')


def bean_body(p):
    ink = p["ink"]
    return (f'<ellipse cx="0" cy="0" rx="138" ry="172" fill="{ink}" stroke="{ink}" stroke-width="9"/>'
            f'<path d="M40,96 C10,130 40,150 18,170" fill="none" stroke="{p["grey"]}" stroke-width="10" stroke-linecap="round"/>'
            f'<path d="M-96,-100 q-22,40 -16,96" fill="none" stroke="#ffffff" stroke-width="10" opacity=".45" stroke-linecap="round"/>')


def pot_body(p):
    ink = p["ink"]
    return (f'<path d="M-70,-170 H70 L60,-130 C150,-80 160,60 125,165 H-125 C-160,60 -150,-80 -60,-130 Z" fill="#ffffff" stroke="{ink}" stroke-width="9" stroke-linejoin="round"/>'
            f'<path d="M-142,105 C-136,80 -120,62 -96,58 H96 C120,62 136,80 142,105 L125,165 H-125 Z" fill="{ink}"/>'
            f'<path d="M-70,-170 H70 L60,-130 C150,-80 160,60 125,165 H-125 C-160,60 -150,-80 -60,-130 Z" fill="none" stroke="{ink}" stroke-width="9" stroke-linejoin="round"/>'
            f'<path d="M-86,-212 H86 a10,10 0 0 1 10,10 V-170 H-96 V-202 a10,10 0 0 1 10,-10 Z" fill="{p["accent"]}" stroke="{ink}" stroke-width="9"/>'
            f'<path d="M140,-90 c90,0 90,130 20,190" fill="none" stroke="{ink}" stroke-width="34" stroke-linecap="round"/>'
            f'<path d="M140,-90 c90,0 90,130 20,190" fill="none" stroke="{p["accent"]}" stroke-width="16" stroke-linecap="round"/>'
            f'<path d="M-112,-30 q-16,50 -8,110" fill="none" stroke="{p["mid"]}" stroke-width="12" stroke-linecap="round"/>')


# name: (fn, face_y, half width, bottom, top, mask)
BODIES = {"cup": (cup_body, -60, 110, 166, -228, False), "mug": (mug_body, -40, 130, 160, -164, False),
          "bean": (bean_body, -30, 132, 168, -172, True), "pot": (pot_body, -55, 130, 165, -212, False)}
FACE_S = {"cup": 1.3, "mug": 1.35, "bean": 1.25, "pot": 1.12}

POSES = {
    "strut": dict(la=(-210, 70, 160, "fist"), ra=(230, -130, -20, "open"), legs="kick", wave="ra"),
    "wave": dict(la=(-215, 60, 160, "fist"), ra=(225, -150, -18, "open"), legs="stand", wave="ra"),
    "cheer": dict(la=(-235, -175, 18, "open"), ra=(235, -175, -18, "open"), legs="hop", wave=None),
    "thumbs": dict(la=(-215, 60, 160, "fist"), ra=(235, -40, -10, "thumb"), legs="kick", wave=None),
    "hold": dict(la=(-140, 80, 180, "fist"), ra=(140, 80, 180, "fist"), legs="stand", wave=None),
    "dance": dict(la=(-240, -120, 30, "open"), ra=(230, 40, -150, "open"), legs="kick", wave="la"),
}


def character(cx, cy, p, body="cup", pose="strut", mood="grin", s=1.0, look=(0, 6), lid=0.0, nose=None,
              hat=None, prop=None, ground=True, steam_on=True, hand_item=None):
    fn, face_y, half, bottom, top, mask = BODIES[body]
    ps = POSES[pose]
    ink = p["ink"]
    hip = bottom - 12
    legs, feet = [], []
    if ps["legs"] == "kick":  # one foot planted, one kicked up behind
        legs.append(hose(((-40, hip), (-50, hip + 70), (-80, hip + 120), (-84, hip + 175)), p, 15))
        legs.append(hose(((40, hip), (70, hip + 50), (150, hip + 40), (190, hip + 90)), p, 15))
        feet.append(shoe(-90, hip + 190, p, flip=True, s=1.25))
        feet.append(shoe(205, hip + 102, p, rot=-35, s=1.2))
        foot_y = hip + 224
        dash = bounce(240, hip + 160, p)
    elif ps["legs"] == "hop":  # both feet off the ground
        legs.append(hose(((-40, hip), (-80, hip + 60), (-60, hip + 110), (-100, hip + 150)), p, 15))
        legs.append(hose(((40, hip), (80, hip + 60), (60, hip + 110), (100, hip + 150)), p, 15))
        feet.append(shoe(-110, hip + 162, p, flip=True, rot=-10, s=1.2))
        feet.append(shoe(110, hip + 162, p, rot=10, s=1.2))
        foot_y = hip + 250
        dash = bounce(0, hip + 212, p)
    else:
        legs.append(hose(((-45, hip), (-55, hip + 60), (-80, hip + 120), (-80, hip + 175)), p, 15))
        legs.append(hose(((45, hip), (55, hip + 60), (80, hip + 120), (80, hip + 175)), p, 15))
        feet.append(shoe(-96, hip + 190, p, flip=True, s=1.25))
        feet.append(shoe(96, hip + 190, p, s=1.25))
        foot_y = hip + 224
        dash = ""
    sh = f'<ellipse cx="0" cy="{foot_y}" rx="190" ry="20" fill="{ink}" opacity=".85"/>' if ground else ""
    arms, gloves = [], []
    for side, key in ((-1, "la"), (1, "ra")):
        ex, ey, rot, kind = ps[key]
        sx, sy = side * (half - 8), -10
        midx = (sx + ex) / 2 + side * 46
        arms.append(hose(((sx, sy), (sx + side * 70, sy), (midx, ey + (sy - ey) * 0.25), (ex, ey)), p, 15))
        gloves.append(glove(ex, ey, rot, p, 1.2, kind))
        if ps["wave"] == key:
            gloves.append(motion(ex, ey - 20, side, p, 2, 54))
    body_svg = fn(p)
    face_svg = face(0, face_y, p, mood, look, FACE_S[body], nose, mask, lid)
    hat_svg = ""
    if hat == "santa":
        hat_svg = santa_hat(-6, top + 14, dict(ink=ink), 1.0)
    elif hat == "antlers":
        hat_svg = antlers(0, top + 10, dict(ink=ink), 1.0)
    elif hat == "earmuffs":
        hat_svg = earmuffs(face_y - 20, half + 10, dict(ink=ink, accent=p["accent"]))
    elif hat == "tophat":
        hat_svg = (f'<g stroke="{ink}" stroke-width="9" stroke-linejoin="round">'
                   f'<rect x="-80" y="{top-170}" width="160" height="180" rx="10" fill="{ink}"/>'
                   f'<rect x="-80" y="{top-40}" width="160" height="34" fill="{p["accent"]}"/>'
                   f'<rect x="-116" y="{top-8}" width="232" height="26" rx="12" fill="{ink}"/></g>')
    elif hat == "bowler":
        hat_svg = (f'<path d="M-90,{top+4} C-90,{top-110} 90,{top-110} 90,{top+4} Z" fill="{ink}"/>'
                   f'<rect x="-128" y="{top-6}" width="256" height="24" rx="12" fill="{ink}"/>'
                   f'<path d="M-50,{top-60} q30,-24 70,-20" fill="none" stroke="#ffffff" stroke-width="8" opacity=".5" stroke-linecap="round"/>')
    st = steam(0, top - 10, dict(ink=ink), 2) if steam_on and not hat else ""
    sy = {"cup": 74, "mug": 74, "bean": 92, "pot": 30}[body]
    shw = {"cup": 100, "mug": 128, "bean": 120, "pot": 146}[body]
    scarf_svg = scarf(sy, shw, dict(ink=ink, accent=p["accent"])) if prop == "scarf" else ""
    item = hand_item(ps) if hand_item else ""
    inner = (sh + dash + "".join(legs) + "".join(feet) + body_svg + face_svg + scarf_svg + "".join(arms) + item
             + "".join(gloves) + hat_svg + st)
    return f'<g transform="translate({cx},{cy}) scale({s})">{inner}</g>'


# ---------------- 1930s framing ----------------

def grain(cid_clip, p, opacity=0.18):
    fid = uid("gr")
    return (f'<filter id="{fid}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7"/>'
            f'<feColorMatrix values="0 0 0 0 0.1  0 0 0 0 0.08  0 0 0 0 0.06  0 0 0 1.6 -0.55"/></filter>'
            f'<rect x="0" y="0" width="1200" height="1000" filter="url(#{fid})" opacity="{opacity}" clip-path="url(#{cid_clip})"/>')


def vignette(shape, p):
    cid, gid = uid("vc"), uid("vg")
    return (f'<defs><radialGradient id="{gid}" cx="50%" cy="45%" r="65%"><stop offset="0.55" stop-color="{p["paper"]}"/>'
            f'<stop offset="1" stop-color="{p["mid"]}"/></radialGradient><clipPath id="{cid}">{shape}</clipPath></defs>'
            f'<g clip-path="url(#{cid})"><rect width="1200" height="1000" fill="url(#{gid})"/></g>', cid)


def title_text(x, y, s, size, p, maxw=1060, fill=None, font="Luckiest", spacing=2):
    """Bouncy cartoon title: cream face, thick black outline, offset black shadow."""
    ink = p["ink"]
    base = f'font-family="{font}" font-size="{size}" text-anchor="middle" letter-spacing="{spacing}"'
    ow = size * 0.1
    g = (f'<text x="{x+8}" y="{y+9}" {base} fill="{ink}" stroke="{ink}" stroke-width="{ow}" stroke-linejoin="round">{esc(s)}</text>'
         f'<text x="{x}" y="{y}" {base} fill="{fill or p["cup"]}" stroke="{ink}" stroke-width="{ow}" stroke-linejoin="round" paint-order="stroke">{esc(s)}</text>')
    return fit(g, x, y, maxw)


def banner(cx, cy, w, p, label, size=46, font="Limelight"):
    ink = p["ink"]
    x0, x1 = cx - w / 2, cx + w / 2
    return (f'<path d="M{x0-70},{cy-20} h90 v70 h-90 l30,-35 z" fill="{p["mid"]}" stroke="{ink}" stroke-width="7" stroke-linejoin="round"/>'
            f'<path d="M{x1+70},{cy-20} h-90 v70 h90 l-30,-35 z" fill="{p["mid"]}" stroke="{ink}" stroke-width="7" stroke-linejoin="round"/>'
            f'<path d="M{x0},{cy-40} Q{cx},{cy-60} {x1},{cy-40} V{cy+30} Q{cx},{cy+10} {x0},{cy+30} Z" fill="{p["cup"]}" stroke="{ink}" stroke-width="8" stroke-linejoin="round"/>'
            + text(cx, cy + 6, label, size, font, ink, maxw=w - 60, spacing=3))
