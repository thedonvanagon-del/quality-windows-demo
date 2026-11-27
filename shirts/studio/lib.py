"""Buddha Beans shirt studio: palettes, icons, layout templates, and the build pipeline.

A drop file defines a list of designs and calls build(). See drop4.py.
"""
import csv, math, os, re, subprocess

CHROME = "/opt/pw-browsers/chromium"
SERIF, SANS, DSERIF = "Liberation Serif", "DejaVu Sans", "DejaVu Serif"

# ink = main color, a/b/c = accents, cream = highlight / knockout, shirt = garment color
PAL = {
 # light shirts
 "espresso": dict(ink="#3b2418", a="#7a8b6a", b="#c08552", c="#a0673d", cream="#f2e8d8", shirt="#e9dcc6", shirt_name="Natural"),
 "pink":     dict(ink="#4a2c2a", a="#d07f7f", b="#c9876a", c="#a0673d", cream="#fbeee8", shirt="#f4d9d4", shirt_name="Blossom Pink"),
 "retro":    dict(ink="#3b2418", a="#d9772b", b="#e0a43a", c="#b9502a", cream="#f2e8d8", shirt="#f3ead8", shirt_name="Ivory"),
 "mauve":    dict(ink="#3d2a33", a="#a86f7f", b="#c9a227", c="#8a5a44", cream="#f6efe9", shirt="#ffffff", shirt_name="White"),
 "sage":     dict(ink="#2f3a2b", a="#7a8b6a", b="#c08552", c="#8a5a44", cream="#f2efe4", shirt="#dfe3d3", shirt_name="Sage Mist"),
 "sand_m":   dict(ink="#3b2418", a="#b9502a", b="#d9a441", c="#7a8b6a", cream="#e3d3b8", shirt="#e3d3b8", shirt_name="Sandstone"),
 "xmas_w":   dict(ink="#2f4a35", a="#c0392b", b="#d9a441", c="#3f6b48", cream="#f6efe4", shirt="#f3ead8", shirt_name="Ivory"),
 "xmas_pink":dict(ink="#7a1f2b", a="#d65a6f", b="#3f6b48", c="#a0673d", cream="#fbeee8", shirt="#f4d9d4", shirt_name="Blossom Pink"),
 "xmas_retro":dict(ink="#3b2418", a="#c0392b", b="#e0a43a", c="#3f6b48", cream="#f2e8d8", shirt="#f3ead8", shirt_name="Ivory"),
 # dark shirts (cream = shirt color so highlights read as knockouts)
 "xmas_m":   dict(ink="#f1e8d6", a="#d8503f", b="#e3b54e", c="#8fb08a", cream="#4b5a3a", shirt="#4b5a3a", shirt_name="Moss"),
 "xmas_red": dict(ink="#f4ecdc", a="#e3b54e", b="#f4ecdc", c="#2f5a3a", cream="#9e2a2b", shirt="#9e2a2b", shirt_name="Red"),
 "xmas_black":dict(ink="#f1e8d6", a="#d8503f", b="#e3b54e", c="#6f9a6a", cream="#1f1f1f", shirt="#1f1f1f", shirt_name="Black"),
 "forest":   dict(ink="#f1e8d6", a="#e08a3c", b="#e3b54e", c="#c9a27a", cream="#4b5a3a", shirt="#4b5a3a", shirt_name="Moss"),
 "navy":     dict(ink="#f1e8d6", a="#e08a3c", b="#e3b54e", c="#9fb3c8", cream="#27344d", shirt="#27344d", shirt_name="True Navy"),
 "charcoal": dict(ink="#f1e8d6", a="#d9772b", b="#e0a43a", c="#b9502a", cream="#3d3d3d", shirt="#3d3d3d", shirt_name="Pepper"),
 "black":    dict(ink="#f1e8d6", a="#d9772b", b="#e0a43a", c="#c08552", cream="#1f1f1f", shirt="#1f1f1f", shirt_name="Black"),
 "espresso_dark": dict(ink="#f1e8d6", a="#c9a27a", b="#e3b54e", c="#a0673d", cream="#4a3427", shirt="#4a3427", shirt_name="Espresso"),
}
def is_dark(P): return int(P["shirt"][1:3], 16) < 0x80

def esc(t): return t.replace("&", "&amp;").replace('"', "&quot;")

def text(x, y, t, size, fill, font=SERIF, weight=400, italic=False, ls=0, maxw=1240, anchor="middle", extra=""):
    """Text that shrinks its font to fit maxw (estimated)."""
    k = 0.64 if font == SANS and weight >= 700 else (0.76 if font == DSERIF and weight >= 700 else (0.6 if font == DSERIF else 0.52))
    est = len(t) * size * k + max(0, len(t) - 1) * ls
    if est > maxw:
        f = maxw / est; size = int(size * f); ls = ls * f
    ita = ' font-style="italic"' if italic else ""
    return (f'<text x="{x}" y="{y}" font-family="{font}" font-weight="{weight}" font-size="{size}"{ita} '
            f'letter-spacing="{ls:.1f}" fill="{fill}" text-anchor="{anchor}"{extra}>{esc(t)}</text>')

def sparkle(x, y, r, fill):
    pts = []
    for k in range(8):
        rr = r if k % 2 == 0 else r * .27; ang = k * math.pi / 4 - math.pi / 2
        pts.append(f"{x+rr*math.cos(ang):.0f},{y+rr*math.sin(ang):.0f}")
    return f'<polygon points="{" ".join(pts)}" fill="{fill}"/>'

def star5(x, y, r, fill):
    pts = []
    for k in range(10):
        rr = r if k % 2 == 0 else r * .42; ang = k * math.pi / 5 - math.pi / 2
        pts.append(f"{x+rr*math.cos(ang):.0f},{y+rr*math.sin(ang):.0f}")
    return f'<polygon points="{" ".join(pts)}" fill="{fill}"/>'

_uid = [0]
def uid():
    _uid[0] += 1; return f"u{_uid[0]}"

# ---------- icons: drawn in a ~400x400 box centred on 0,0 ----------
def icon(name, cx, cy, s, P):
    i, a, b, c, cr = P["ink"], P["a"], P["b"], P["c"], P["cream"]
    u = uid()
    if name == "hot":
        g = f'<path d="M -150 -40 h 260 v 30 c 0 120 -60 180 -130 180 c -70 0 -130 -60 -130 -180 z" fill="{i}"/><path d="M 110 0 c 70 0 85 95 8 115 l -10 -28 c 36 -10 34 -58 2 -58 z" fill="{i}"/><rect x="-180" y="150" width="320" height="22" rx="11" fill="{i}"/><g fill="none" stroke="{a}" stroke-width="16" stroke-linecap="round"><path d="M -70 -70 c -30 -45 30 -75 0 -125"/><path d="M 10 -70 c -30 -45 30 -75 0 -125"/></g>'
    elif name == "iced":
        g = f'<defs><clipPath id="{u}"><path d="M -130 -130 L 130 -130 L 100 190 Q 0 205 -100 190 Z"/></clipPath></defs><rect x="40" y="-230" width="26" height="200" rx="8" fill="{a}" transform="rotate(14 50 -130)"/><g clip-path="url(#{u})"><rect x="-150" y="-70" width="300" height="300" fill="{c}"/><rect x="-60" y="-30" width="55" height="55" rx="8" fill="{cr}" transform="rotate(12 -32 -2)"/><rect x="15" y="-10" width="50" height="50" rx="8" fill="{cr}" transform="rotate(-16 40 15)"/></g><path d="M -130 -130 L 130 -130 L 100 190 Q 0 205 -100 190 Z" fill="none" stroke="{i}" stroke-width="14" stroke-linejoin="round"/><rect x="-150" y="-150" width="300" height="36" rx="18" fill="{i}"/>'
    elif name == "bean":
        g = f'<ellipse rx="95" ry="140" fill="{i}" transform="rotate(-25)"/><path d="M -20 -125 C 40 -60 -60 30 10 125" fill="none" stroke="{cr}" stroke-width="18" stroke-linecap="round" transform="rotate(-25)"/>'
    elif name == "latte":
        g = f'<path d="M -190 -40 Q -170 160 0 170 Q 170 160 190 -40" fill="{i}"/><ellipse cx="0" cy="-40" rx="190" ry="60" fill="{i}"/><ellipse cx="0" cy="-42" rx="160" ry="44" fill="{c if not is_dark(P) else a}"/><path d="M 0 -15 C -75 -50 -60 -100 0 -72 C 60 -100 75 -50 0 -15 Z" fill="{cr if not is_dark(P) else i}"/><path d="M 185 0 c 70 -5 80 80 5 95" fill="none" stroke="{i}" stroke-width="24"/>'
    elif name == "pour":
        g = f'<path d="M -150 -170 L 150 -170 L 40 -20 L -40 -20 Z" fill="{i}"/><rect x="-50" y="-20" width="100" height="20" fill="{i}"/><defs><clipPath id="{u}"><path d="M -90 20 h 180 l 40 200 q 0 50 -55 50 h -150 q -55 0 -55 -50 z"/></clipPath></defs><path d="M -90 20 h 180 l 40 200 q 0 50 -55 50 h -150 q -55 0 -55 -50 z" fill="{i}"/><rect x="-150" y="150" width="300" height="140" fill="{c}" clip-path="url(#{u})"/>'
    elif name == "book":
        g = f'<path d="M -190 -110 Q -95 -150 0 -105 Q 95 -150 190 -110 L 190 130 Q 95 90 0 135 Q -95 90 -190 130 Z" fill="{i}"/><path d="M 0 -105 L 0 135" stroke="{cr}" stroke-width="10"/><g stroke="{cr}" stroke-width="8" stroke-linecap="round"><path d="M -150 -60 Q -85 -85 -35 -60"/><path d="M -150 -10 Q -85 -35 -35 -10"/><path d="M 35 -60 Q 85 -85 150 -60"/><path d="M 35 -10 Q 85 -35 150 -10"/></g>' + "".join(f'<path d="M {x} -150 c 18 -14 -22 -26 0 -48 c 20 -18 -18 -28 6 -44" fill="none" stroke="{a}" stroke-width="12" stroke-linecap="round"/>' for x in (-25, 25))
    elif name == "martini":
        g = f'<path d="M -170 -150 L 170 -150 L 0 40 Z" fill="{i}"/><path d="M -130 -110 L 130 -110 L 0 30 Z" fill="{c}"/><rect x="-10" y="30" width="20" height="160" fill="{i}"/><rect x="-90" y="185" width="180" height="20" rx="10" fill="{i}"/>'
    elif name == "sun":
        g = f'<circle r="90" fill="{b}"/>' + "".join(f'<rect x="-10" y="-190" width="20" height="60" rx="10" fill="{b}" transform="rotate({k*30})"/>' for k in range(12))
    elif name == "daisy":
        g = "".join(f'<ellipse cx="0" cy="-95" rx="45" ry="85" fill="{cr}" stroke="{i}" stroke-width="10" transform="rotate({k*36})"/>' for k in range(10)) + f'<circle r="55" fill="{b}" stroke="{i}" stroke-width="10"/>'
    elif name == "heart":
        g = f'<path d="M 0 150 C -260 -10 -150 -230 0 -100 C 150 -230 260 -10 0 150 Z" fill="{a}"/>'
    elif name == "moon":
        g = f'<path d="M 60 -170 A 180 180 0 1 0 60 170 A 140 140 0 1 1 60 -170 Z" fill="{b}"/>' + sparkle(120, -90, 34, b) + sparkle(150, 60, 22, b)
    elif name == "leaf":
        g = f'<path d="M 0 -170 C 140 -90 140 90 0 170 C -140 90 -140 -90 0 -170 Z" fill="{c}"/><path d="M 0 -150 L 0 170" stroke="{cr}" stroke-width="10"/>'
    elif name == "bulb":
        cols = [a, b, c, a]
        g = f'<path d="M -230 -80 Q -115 20 0 -80 Q 115 20 230 -80" stroke="{i}" stroke-width="10" fill="none"/>'
        for (x, y, r), col in zip([(-165, -42, 14), (-60, -42, -10), (60, -42, 10), (165, -42, -14)], cols):
            g += f'<g transform="translate({x} {y}) rotate({r})"><rect x="-17" y="-6" width="34" height="34" rx="5" fill="{i}"/><path d="M -32 30 C -50 90 -30 150 0 160 C 30 150 50 90 32 30 Z" fill="{col}"/></g>'
        g += "".join(f'<line x1="{x}" y1="140" x2="{x+dx}" y2="175" stroke="{b}" stroke-width="8" stroke-linecap="round"/>' for x, dx in [(-200, -16), (-165, 0), (165, 0), (200, 16)])
    elif name == "dial":
        g = f'<circle r="175" fill="none" stroke="{i}" stroke-width="20"/><circle r="128" fill="{a}"/>' + "".join(f'<rect x="-5" y="-168" width="10" height="26" fill="{i}" transform="rotate({k})"/>' for k in range(-120, 121, 30)) + f'<text y="40" font-family="{DSERIF}" font-weight="700" font-size="112" fill="{cr if not is_dark(P) else P["shirt"]}" text-anchor="middle">68°</text>'
    elif name == "snowflake":
        g = f'<g stroke="{i}" stroke-width="20" stroke-linecap="round" fill="none">' + "".join(
            f'<g transform="rotate({k*60})"><line x1="0" y1="0" x2="0" y2="-180"/><path d="M -50 -150 L 0 -110 L 50 -150"/><path d="M -36 -85 L 0 -58 L 36 -85"/></g>' for k in range(6)) + f'</g><circle r="26" fill="{a}"/>'
    elif name == "tree":
        g = f'<path d="M 0 -170 L 110 -40 L 60 -40 L 155 95 L -155 95 L -60 -40 L -110 -40 Z" fill="{c}"/><rect x="-28" y="95" width="56" height="60" fill="{i}"/>' + star5(0, -175, 52, b) + "".join(f'<circle cx="{x}" cy="{y}" r="17" fill="{col}"/>' for x, y, col in [(-40, -60, a), (35, -20, b), (-70, 50, b), (60, 65, a), (5, 40, a)])
    elif name == "star":
        g = star5(0, 10, 190, b) + sparkle(-170, -120, 40, a) + sparkle(175, 120, 34, a)
    elif name == "check":
        g = f'<rect x="-140" y="-180" width="280" height="360" rx="18" fill="{cr if not is_dark(P) else i}" stroke="{i}" stroke-width="14"/>'
        lc = i if not is_dark(P) else P["shirt"]
        for k, y in enumerate((-100, -10, 80)):
            g += f'<rect x="-100" y="{y-24}" width="48" height="48" rx="6" fill="none" stroke="{lc}" stroke-width="10"/><line x1="-25" y1="{y}" x2="100" y2="{y}" stroke="{lc}" stroke-width="14" stroke-linecap="round"/>'
        g += f'<path d="M -98 -100 L -78 -76 L -40 -136" fill="none" stroke="{a}" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>'
    elif name == "notes":
        g = f'<g fill="{i}"><ellipse cx="-95" cy="110" rx="55" ry="40" transform="rotate(-22 -95 110)"/><ellipse cx="95" cy="75" rx="55" ry="40" transform="rotate(-22 95 75)"/><rect x="-52" y="-130" width="18" height="245"/><rect x="138" y="-165" width="18" height="245"/><path d="M -52 -130 L 156 -165 L 156 -115 L -52 -80 Z"/></g>' + f'<g fill="{a}"><ellipse cx="-170" cy="-90" rx="30" ry="22" transform="rotate(-22 -170 -90)"/><rect x="-147" y="-200" width="10" height="110"/></g>'
    elif name == "gift":
        g = f'<rect x="-150" y="-30" width="300" height="200" fill="{a}"/><rect x="-170" y="-90" width="340" height="66" fill="{a}"/><rect x="-24" y="-90" width="48" height="260" fill="{b}"/><g fill="{b}"><ellipse cx="-62" cy="-125" rx="70" ry="38" transform="rotate(-25 -62 -125)"/><ellipse cx="62" cy="-125" rx="70" ry="38" transform="rotate(25 62 -125)"/><circle cx="0" cy="-100" r="26"/></g><rect x="-150" y="-30" width="300" height="10" fill="{i}" opacity=".25"/>'
    elif name == "holly":
        leaf = "M 0 0 C 30 -30 70 -35 100 -20 L 125 -50 L 150 -10 L 195 -15 C 190 25 160 55 120 55 L 105 90 L 70 60 L 25 75 C 15 45 5 20 0 0 Z"
        lg = c if is_dark(P) else "#3f6b48"
        g = f'<path d="{leaf}" fill="{lg}" transform="translate(5 0)"/><path d="{leaf}" fill="{lg}" transform="translate(-5 0) scale(-1 1)"/><path d="{leaf}" fill="{lg}" transform="rotate(-90) scale(.8)"/>' + "".join(f'<circle cx="{x}" cy="{y}" r="34" fill="{a}"/>' for x, y in [(0, 15), (-42, -18), (42, -18)])
    elif name == "cookie":
        gb = "#b06a35"; ic = "#f6efe4"
        g = f'<circle cx="0" cy="-120" r="62" fill="{gb}"/><path d="M -40 -70 L 40 -70 L 130 -40 Q 160 -20 135 5 L 60 -5 L 80 140 Q 85 175 50 175 L 0 90 L -50 175 Q -85 175 -80 140 L -60 -5 L -135 5 Q -160 -20 -130 -40 Z" fill="{gb}"/><g fill="{ic}"><circle cx="-22" cy="-130" r="9"/><circle cx="22" cy="-130" r="9"/><circle cx="0" cy="-10" r="11"/><circle cx="0" cy="35" r="11"/></g><path d="M -26 -100 Q 0 -80 26 -100" fill="none" stroke="{ic}" stroke-width="8" stroke-linecap="round"/><g stroke="{ic}" stroke-width="8" fill="none" stroke-linecap="round"><path d="M -120 -25 q 10 10 0 20"/><path d="M 120 -25 q -10 10 0 20"/><path d="M -62 140 q 14 8 28 0"/><path d="M 34 140 q 14 8 28 0"/></g>'
    elif name == "apple":
        g = f'<path d="M 0 -90 C -60 -140 -190 -110 -180 20 C -170 140 -80 190 0 160 C 80 190 170 140 180 20 C 190 -110 60 -140 0 -90 Z" fill="{a}"/><path d="M 0 -90 C 0 -130 10 -160 30 -180" stroke="{i}" stroke-width="16" fill="none" stroke-linecap="round"/><path d="M 20 -130 C 60 -190 130 -180 145 -150 C 105 -110 55 -110 20 -130 Z" fill="{c}"/>'
    elif name == "paw":
        g = f'<g fill="{i}"><path d="M 0 -10 C 90 -10 150 80 120 140 C 95 185 40 160 0 160 C -40 160 -95 185 -120 140 C -150 80 -90 -10 0 -10 Z"/><ellipse cx="-140" cy="-60" rx="42" ry="55" transform="rotate(-20 -140 -60)"/><ellipse cx="-58" cy="-140" rx="44" ry="58" transform="rotate(-8 -58 -140)"/><ellipse cx="58" cy="-140" rx="44" ry="58" transform="rotate(8 58 -140)"/><ellipse cx="140" cy="-60" rx="42" ry="55" transform="rotate(20 140 -60)"/></g><path d="M 0 115 C -55 80 -40 40 0 60 C 40 40 55 80 0 115 Z" fill="{a}"/>'
    elif name == "mushroom":
        g = f'<path d="M -60 10 L 60 10 L 75 165 Q 0 185 -75 165 Z" fill="{cr if not is_dark(P) else i}" stroke="{i}" stroke-width="10"/><path d="M -195 20 C -195 -170 195 -170 195 20 Q 0 50 -195 20 Z" fill="{a}" stroke="{i}" stroke-width="10"/>' + "".join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{cr if not is_dark(P) else i}"/>' for x, y, r in [(-95, -45, 26), (15, -95, 32), (110, -35, 22), (-20, -20, 16)])
    elif name == "battery":
        g = f'<rect x="-185" y="-90" width="340" height="180" rx="26" fill="none" stroke="{i}" stroke-width="22"/><rect x="160" y="-40" width="32" height="80" rx="8" fill="{i}"/>' + "".join(f'<rect x="{-158+k*78}" y="-62" width="62" height="124" rx="8" fill="{a}"/>' for k in range(2))
    elif name == "fish":
        g = f'<path d="M -180 0 C -100 -115 90 -115 150 0 C 90 115 -100 115 -180 0 Z" fill="{i}"/><path d="M 135 0 L 215 -85 L 200 0 L 215 85 Z" fill="{i}"/><circle cx="-110" cy="-18" r="15" fill="{cr}"/><path d="M -50 -62 Q -15 0 -50 62" stroke="{cr}" stroke-width="10" fill="none"/><path d="M -10 -105 Q 40 -150 90 -95" fill="{i}"/><path d="M 175 -150 C 140 -200 60 -230 0 -210" stroke="{a}" stroke-width="6" fill="none"/>'
    elif name == "grill":
        g = f'<path d="M -170 -30 A 170 150 0 0 1 170 -30 Z" fill="{i}"/><rect x="-35" y="-205" width="70" height="26" rx="10" fill="{i}"/><path d="M -175 -5 A 175 135 0 0 0 175 -5 Z" fill="{i}"/><g stroke="{i}" stroke-width="16" stroke-linecap="round"><line x1="-95" y1="100" x2="-150" y2="215"/><line x1="95" y1="100" x2="150" y2="215"/><line x1="0" y1="128" x2="0" y2="215"/></g><rect x="-190" y="-28" width="380" height="18" rx="9" fill="{a}"/>' + "".join(f'<path d="M {x} -225 c -22 -30 22 -50 0 -85" fill="none" stroke="{c}" stroke-width="12" stroke-linecap="round"/>' for x in (-60, 60))
    elif name == "flag":
        g = f'<line x1="-20" y1="-195" x2="-20" y2="150" stroke="{i}" stroke-width="16"/><path d="M -12 -195 L 165 -140 L -12 -85 Z" fill="{a}"/><ellipse cx="0" cy="160" rx="170" ry="30" fill="{i}"/><circle cx="105" cy="118" r="30" fill="{cr if not is_dark(P) else i}" stroke="{i}" stroke-width="8"/>'
    elif name == "wrench":
        g = f'<g transform="rotate(-45)"><rect x="-30" y="-120" width="60" height="300" rx="30" fill="{i}"/><circle cx="0" cy="-160" r="85" fill="{i}"/><rect x="-32" y="-270" width="64" height="120" fill="{cr}"/></g><g transform="rotate(45)"><rect x="-26" y="-60" width="52" height="250" rx="12" fill="{a}"/><rect x="-60" y="-190" width="120" height="140" rx="18" fill="{a}"/></g>'
    elif name == "mountain":
        g = (f'<path d="M -200 100 L -95 -55 L -55 -5 L 15 -125 L 105 10 L 140 -30 L 200 100 Z" fill="{c}"/>'
             f'<path d="M -200 100 L -130 20 L -80 60 L -20 -10 L 60 70 L 120 30 L 200 100 Z" fill="{i}"/>'
             + "".join(f'<path d="M {x} {y} l 18 36 h -10 l 16 32 h -48 l 16 -32 h -10 z" fill="{i}"/>' for x, y in [(-160, 30), (-120, 40), (150, 40)]))
    else:
        from icons2 import EXTRA
        g = EXTRA[name](i, a, b, c, cr, P, u)
    return f'<g transform="translate({cx} {cy}) scale({s})">{g}</g>'

# ---------- templates (canvas 1500x1800) ----------
def t_wavy(d, P):
    word, sub = d["lines"][0], d.get("sub", "")
    cols = d.get("cols") or [P["b"], P["a"], P["c"], P["ink"], P["ink"]]
    n = d.get("n", 5); out = ""; top = 900 - (n - 1) * 95
    for k in range(n):
        y = top + k * 190; u = uid()
        out += f'<path id="{u}" d="M 170 {y} C 500 {y-80}, 1000 {y+80}, 1330 {y}" fill="none"/>'
        out += f'<text font-family="{SANS}" font-weight="700" font-size="205" fill="{cols[k % len(cols)]}" stroke="{P["ink"]}" stroke-width="6" paint-order="stroke"><textPath href="#{u}" textLength="1140" lengthAdjust="spacingAndGlyphs">{esc(word)}</textPath></text>'
    if sub: out += text(750, top + n * 190 + 70, sub, 90, P["ink"], italic=True)
    return out

def t_club(d, P):
    top, bot = d["lines"]; u = uid()
    out = f'<defs><path id="{u}" d="M 150 860 A 720 720 0 0 1 1350 860"/></defs>'
    sz = min(140, int(1350 / len(top)))
    out += f'<text font-family="{DSERIF}" font-weight="700" font-size="{sz}" letter-spacing="10" fill="{P["ink"]}" text-anchor="middle"><textPath href="#{u}" startOffset="50%">{esc(top)}</textPath></text>'
    out += icon(d["icon"], 750, 900, .8, P)
    out += text(400, 1000, "EST.", 64, P["a"], DSERIF, 700) + text(1100, 1000, d.get("est", "2026"), 64, P["a"], DSERIF, 700)
    out += text(750, 1300, bot, 230, P["ink"], DSERIF, 700, ls=24, maxw=1100)
    out += f'<line x1="330" y1="1360" x2="1170" y2="1360" stroke="{P["ink"]}" stroke-width="8"/>'
    out += text(750, 1450, d.get("sub", ""), 46, P["ink"], SANS, ls=12, maxw=1100)
    return out

def t_iconwave(d, P):
    l1 = d["lines"][0]; l2 = d["lines"][1] if len(d["lines"]) > 1 else ""; u = uid()
    out = f'<defs><path id="{u}" d="M 180 1360 C 450 1280 1050 1440 1320 1360" fill="none"/></defs>'
    if d.get("pre"): out += text(750, 330, d["pre"], 100, P["a"], italic=True)
    out += icon(d["icon"], 750, 830, 1.6, P)
    out += f'<text font-family="{SANS}" font-weight="700" font-size="150" fill="{P["a"]}" stroke="{P["ink"]}" stroke-width="6" paint-order="stroke" text-anchor="middle"><textPath href="#{u}" startOffset="50%" textLength="1140" lengthAdjust="spacingAndGlyphs">{esc(l1)}</textPath></text>'
    if l2: out += text(750, 1560, l2, 110, P["ink"], SANS, 700, ls=36, maxw=1150)
    return out

def t_tarot(d, P):
    out = f'<rect x="270" y="130" width="960" height="1540" rx="40" fill="none" stroke="{P["ink"]}" stroke-width="20"/><rect x="310" y="170" width="880" height="1460" rx="24" fill="none" stroke="{P["ink"]}" stroke-width="6"/>'
    out += text(750, 290, d["num"], 90, P["ink"], DSERIF, 700)
    out += "".join(f'<line x1="750" y1="540" x2="750" y2="360" stroke="{P["a"]}" stroke-width="12" stroke-linecap="round" transform="rotate({a} 750 760)"/>' for a in range(-80, 81, 20))
    out += f'<circle cx="750" cy="760" r="300" fill="none" stroke="{P["a"]}" stroke-width="8" stroke-dasharray="4 22" stroke-linecap="round"/>'
    for x, y in [(420, 470), (1080, 520), (440, 1150), (1070, 1110), (560, 380), (950, 390)]: out += sparkle(x, y, 36, P["a"])
    out += icon(d["icon"], 750, 860, 1.25, P)
    out += f'<line x1="380" y1="1420" x2="1120" y2="1420" stroke="{P["ink"]}" stroke-width="6"/>'
    out += text(750, 1540, d["lines"][0], 80, P["ink"], DSERIF, 700, ls=4, maxw=700)
    return out

def t_cup(d, P):
    l = d["lines"]
    out = text(750, 420, l[0], 130, P["a"], italic=True, maxw=1200)
    out += icon(d["icon"], 750, 860, 1.4, P)
    out += text(750, 1330, l[1], 170, P["ink"], DSERIF, 700, ls=14, maxw=1260)
    if len(l) > 2: out += text(750, 1480, l[2], 52, P["ink"], SANS, ls=16, maxw=1150)
    return out

def t_quote(d, P):
    l = d["lines"]; n = len(l); y0 = 900 - (n - 1) * 95 - 40; out = ""
    out += icon(d.get("icon", "bean"), 750, y0 - 300, .75, P)
    for k, t in enumerate(l):
        it = k % 2 == 1
        out += text(750, y0 + k * 190, t, 150, P["a"] if it else P["ink"], italic=it, weight=400 if it else 700, maxw=1280)
    yl = y0 + (n - 1) * 190 + 110
    out += f'<line x1="560" y1="{yl}" x2="940" y2="{yl}" stroke="{P["ink"]}" stroke-width="6"/>'
    if d.get("sub"): out += text(750, yl + 90, d["sub"], 44, P["ink"], SANS, ls=14, maxw=1050)
    return out

def t_badge(d, P):
    top, bot = d["lines"][0], d["lines"][1]; ut, ub = uid(), uid()
    out = f'<defs><path id="{ut}" d="M 330 900 A 420 420 0 0 1 1170 900"/><path id="{ub}" d="M 290 900 A 460 460 0 0 0 1210 900"/></defs>'
    out += f'<circle cx="750" cy="900" r="540" fill="none" stroke="{P["ink"]}" stroke-width="18"/><circle cx="750" cy="900" r="330" fill="none" stroke="{P["ink"]}" stroke-width="8"/>'
    for path, t, base in ((ut, top, ""), (ub, bot, ' dominant-baseline="hanging"')):
        sz = min(104, int(1250 / (len(t) * 0.88)))
        out += f'<text font-family="{DSERIF}" font-weight="700" font-size="{sz}" letter-spacing="10" fill="{P["ink"]}" text-anchor="middle"{base}><textPath href="#{path}" startOffset="50%">{esc(t)}</textPath></text>'
    out += sparkle(260, 900, 40, P["a"]) + sparkle(1240, 900, 40, P["a"])
    out += icon(d["icon"], 750, 900, 1.05, P)
    return out

def t_sunset(d, P):
    u = uid(); cols = [P["a"], P["c"], P["ink"], P["a"], P["c"]]
    out = f'<defs><clipPath id="{u}"><circle cx="750" cy="800" r="440"/></clipPath></defs><g clip-path="url(#{u})">'
    out += f'<rect x="300" y="350" width="900" height="500" fill="{P["b"]}"/>'
    for k in range(5): out += f'<rect x="300" y="{620+k*72}" width="900" height="{42-k*4}" fill="{cols[k]}"/>'
    out += '</g>'
    if d.get("icon") == "mountain":
        u2 = uid()
        out += f'<defs><clipPath id="{u2}"><rect x="300" y="340" width="900" height="612"/></clipPath></defs><g clip-path="url(#{u})"><g clip-path="url(#{u2})">' + icon("mountain", 750, 722, 2.3, P) + '</g></g>'
    if d.get("icon") and d["icon"] != "mountain": out += icon(d["icon"], 750, 640, .9, P)
    out += text(750, 1110, d["lines"][0], 190, P["ink"], DSERIF, 700, ls=10, maxw=1300)
    if len(d["lines"]) > 1: out += text(750, 1280, d["lines"][1], 110, P["a"], italic=True, maxw=1250)
    return out

def t_daisy(d, P):
    by = 1540 if len(d["lines"]) > 2 else 1400
    out = icon("daisy", 330, 420, .55, P) + icon("daisy", 1170, 470, .45, P) + icon("daisy", 300, by, .4, P) + icon("daisy", 1190, by - 20, .55, P)
    out += icon(d.get("icon", "hot"), 750, 620, .95, P)
    l = d["lines"]
    out += text(750, 1050, l[0], 170, P["ink"], DSERIF, 700, maxw=1060)
    if len(l) > 1: out += text(750, 1230, l[1], 140, P["a"], italic=True, maxw=1000)
    if len(l) > 2: out += text(750, 1360, l[2], 48, P["ink"], SANS, ls=14, maxw=800)
    return out

def t_stack(d, P):
    l = d["lines"]; out = icon(d.get("icon", "bean"), 750, 470, 1.0, P); y = 920
    for k, t in enumerate(l):
        big = k == 1
        out += text(750, y, t, 230 if big else 120, P["ink"] if big else P["a"], DSERIF if big else SERIF, 700 if big else 400, italic=not big, ls=16 if big else 0, maxw=1300 if big else 1240)
        y += 200 if (big or k == 0) else 170
        if k == 0: y += 60
    return out

def t_sweater(d, P):
    """Pixel-knit 'ugly sweater' bands around stacked text."""
    out = ""
    def band(y0, col):
        s = ""
        for cx in range(0, 40):
            x = 150 + cx * 30; r = abs((cx % 8) - 4)
            s += f'<rect x="{x}" y="{y0 + r*30}" width="28" height="28" fill="{col}"/>'
            s += f'<rect x="{x}" y="{y0 + (8 - r)*30 - 120}" width="28" height="28" fill="{col}"/>' if r in (0, 4) else ""
        return s
    out += band(180, P["a"])
    for k, x in enumerate(range(310, 1300, 220)): out += icon("tree" if k % 2 == 0 else "snowflake", x, 520, .38, P)
    l = d["lines"]
    out += text(750, 820, l[0], 120, P["ink"], DSERIF, 700, ls=14)
    out += text(750, 1010, l[1], 170, P["a"], DSERIF, 700, ls=8, maxw=1250)
    out += text(750, 1190, l[2], 170, P["ink"], DSERIF, 700, ls=20, maxw=1250)
    for k, x in enumerate(range(310, 1300, 220)): out += icon("snowflake" if k % 2 == 0 else "tree", x, 1370, .38, P)
    out += band(1500, P["a"])
    return out

def t_mostlikely(d, P):
    l = d["lines"]
    out = icon("holly", 750, 330, .7, P)
    out += sparkle(540, 330, 34, P["b"]) + sparkle(960, 330, 34, P["b"])
    out += text(750, 620, "MOST LIKELY TO", 104, P["ink"], DSERIF, 700, ls=14, maxw=1000)
    out += text(750, 900, l[0], 210, P["a"], italic=True, maxw=1300)
    out += text(750, 1110, l[1], 160, P["ink"], DSERIF, 700, ls=10, maxw=1300)
    if len(l) > 2: out += text(750, 1280, l[2], 120, P["ink"], DSERIF, 700, ls=10, maxw=1300)
    out += f'<line x1="520" y1="1370" x2="980" y2="1370" stroke="{P["ink"]}" stroke-width="6"/>'
    out += text(750, 1460, d.get("sub", "THE FAMILY CHRISTMAS AWARDS"), 46, P["ink"], SANS, ls=12, maxw=1000)
    return out

def t_forecast(d, P):
    l = d["lines"]
    out = text(750, 330, "WEEKEND FORECAST", 108, P["ink"], DSERIF, 700, ls=12, maxw=1150)
    out += f'<line x1="430" y1="390" x2="1070" y2="390" stroke="{P["ink"]}" stroke-width="6"/>'
    out += icon(d["icon"], 750, 760, 1.35, P)
    out += text(750, 1200, l[0], 230, P["ink"], DSERIF, 700, ls=20, maxw=1250)
    out += text(750, 1370, l[1], 110, P["a"], italic=True, maxw=1250)
    return out

T = dict(wavy=t_wavy, club=t_club, iconwave=t_iconwave, tarot=t_tarot, cup=t_cup, quote=t_quote, badge=t_badge,
         sunset=t_sunset, daisy=t_daisy, stack=t_stack, sweater=t_sweater, mostlikely=t_mostlikely, forecast=t_forecast)

GRUNGE = ('<filter id="grunge" x="0" y="0" width="1" height="1"><feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="3" seed="7" result="n"/>'
          '<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -3.2 0 0 0 2.35" result="m"/>'
          '<feComposite in="SourceGraphic" in2="m" operator="in"/></filter>')

def svg_for(d):
    P = PAL[d["pal"]]
    body = T[d["tpl"]](d, P)
    if d.get("grunge"):
        body = f'<defs>{GRUNGE}</defs><g filter="url(#grunge)">{body}</g>'
    return f'<svg width="1500" height="1800" viewBox="0 0 1500 1800" xmlns="http://www.w3.org/2000/svg">{body}</svg>'

# ---------- products ----------
BLANKS = {
 "W": dict(blueprint="womens_relaxed", price=29, kind="Womens", gift="Gift for Her",
           blank="Women's relaxed fit tee (Bella+Canvas 6400). Runs true to size. Size up for an oversized look.",
           tags=["gift for her", "womens graphic tee", "trendy womens tee", "cute womens shirt", "birthday gift her", "retro womens tee", "christmas gift her"]),
 "M": dict(blueprint="unisex_heavy", price=30, kind="Mens", gift="Gift for Him",
           blank="Heavyweight garment-dyed tee (Comfort Colors 1717). Relaxed unisex fit, true to size.",
           tags=["gift for him", "mens graphic tee", "gift for dad", "funny mens shirt", "comfort colors tee", "birthday gift him", "christmas gift him"]),
 "U": dict(blueprint="unisex_heavy", price=30, kind="Unisex", gift="Holiday Gift",
           blank="Heavyweight garment-dyed tee (Comfort Colors 1717). Unisex fit. Women may want one size down.",
           tags=["unisex graphic tee", "funny gift idea", "comfort colors tee", "holiday shirt", "christmas gift", "gift for friend", "secret santa gift"]),
 "F": dict(blueprint="unisex_heavy", price=30, kind="Family Matching", gift="Matching Family Christmas Tee",
           blank="Heavyweight garment-dyed tee (Comfort Colors 1717). Unisex fit. Order the whole set for family photos.",
           tags=["family matching", "matching xmas shirt", "family christmas", "christmas pajama", "group shirts", "family photo shirt", "most likely to"]),
 "K": dict(blueprint="youth", price=24, kind="Kids Youth", gift="Christmas Gift for Kids",
           blank="Youth tee (Bella+Canvas 3001Y). Soft, lightweight, true to size.",
           tags=["kids christmas", "youth shirt", "kids graphic tee", "boys christmas tee", "girls christmas tee", "funny kids shirt", "stocking stuffer"]),
}

def slug(s): return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")

TEE = {
 "women": "M 380 110 C 420 200 580 200 620 110 L 760 150 C 820 190 870 260 900 340 L 795 395 L 760 340 C 740 480 720 600 735 720 C 750 860 770 980 775 1090 Q 500 1130 225 1090 C 230 980 250 860 265 720 C 280 600 260 480 240 340 L 205 395 L 100 340 C 130 260 180 190 240 150 Z",
 "unisex": "M 395 100 C 435 185 565 185 605 100 L 790 150 C 850 190 905 270 940 360 L 815 420 L 780 360 L 785 1100 Q 500 1115 215 1100 L 220 360 L 185 420 L 60 360 C 95 270 150 190 210 150 Z",
}

def run(cmd): subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

def shoot(html_path, png_path, w, h, scale, transparent):
    args = [CHROME, "--headless", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files",
            f"--force-device-scale-factor={scale}", f"--window-size={w},{h}", f"--screenshot={png_path}", "file://" + html_path]
    if transparent: args.insert(5, "--default-background-color=00000000")
    run(args)

def build(drop, designs, out_root):
    from concurrent.futures import ThreadPoolExecutor
    OUT = os.path.join(out_root, drop)
    for sub in ("html", "prints", "mockups", "_mk", "_thumbs"): os.makedirs(os.path.join(OUT, sub), exist_ok=True)
    rows, jobs = [], []
    for n, d in enumerate(designs, 1):
        who = d["who"]; B = BLANKS[who]; P = PAL[d["pal"]]
        if who == "M" and "grunge" not in d: d["grunge"] = True
        sku = f"BB-{drop.upper()}-{d.get('series', who)}{n:02d}"
        fn = f"{n:02d}-{slug(d['name'])}"
        html = os.path.join(OUT, "html", fn + ".html")
        open(html, "w").write('<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent}svg{display:block}</style></head><body>' + svg_for(d) + '</body></html>')
        png = os.path.join(OUT, "prints", fn + ".png")
        tee = "women" if who == "W" else "unisex"
        mk = os.path.join(OUT, "_mk", fn + ".html")
        open(mk, "w").write(f'''<!doctype html><html><head><meta charset="utf-8"><style>html,body{{margin:0;background:#efe9e2}}</style></head><body>
<svg width="1000" height="1200" viewBox="0 0 1000 1200" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="sh" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".12"/><stop offset=".25" stop-color="#000" stop-opacity="0"/><stop offset=".75" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".14"/></linearGradient>
<filter id="ds"><feDropShadow dx="0" dy="14" stdDeviation="16" flood-opacity=".18"/></filter></defs>
<path d="{TEE[tee]}" fill="{P['shirt']}" stroke="#00000022" stroke-width="3" filter="url(#ds)"/><path d="{TEE[tee]}" fill="url(#sh)"/>
<path d="{TEE[tee].split(' L ')[0]}" fill="none" stroke="#00000030" stroke-width="16"/>
<image href="../prints/{fn}.png" x="340" y="265" width="320" height="384"/>
<text x="500" y="1170" font-family="DejaVu Sans" font-size="22" letter-spacing="4" fill="#00000066" text-anchor="middle">{B['kind'].upper()} · {P['shirt_name'].upper()}</text>
</svg></body></html>''')
        jobs.append((html, png, mk, os.path.join(OUT, "_mk", fn + ".png"), os.path.join(OUT, "mockups", fn + ".jpg"), os.path.join(OUT, "_thumbs", f"{n:02d}.jpg")))

        niche = d["tags"]
        tags = []
        for t in niche + B["tags"] + ["christmas shirt", "holiday tee", "funny christmas"] * d.get("xmas", False) + ["graphic tee", "trendy shirt"]:
            t = t[:20].strip()
            if t and t not in tags: tags.append(t)
        title = f"{d['name']} Shirt, {B['kind']} {d.get('theme', 'Graphic')} T-Shirt, " + ", ".join(x.title() for x in niche[:3]) + f", {B['gift']}"
        while len(title) > 140: title = title.rsplit(",", 1)[0]
        desc = (f"{d['name']}. {d.get('blurb', '')}\n\nDesign: " + " / ".join(d["lines"]) + "\n\n"
                f"• {B['blank']}\n• Printed to order just for you\n• Size chart in photos\n• Wash cold, inside out. Tumble dry low or hang dry")
        alt = "White" if not is_dark(P) else ("Pepper" if P["shirt_name"] == "Black" else "Black")
        rows.append(dict(sku=sku, who=who, name=d["name"], file=f"prints/{fn}.png", mockup=f"mockups/{fn}.jpg", blueprint=B["blueprint"],
                         shirt_color=P["shirt_name"], alt_color=alt, shirt_hex=P["shirt"], price=f"{B['price']}.00",
                         title=title, description=desc, tags=",".join(tags[:13])))

    def work(j):
        html, png, mk, mkpng, jpg, th = j
        shoot(html, png, 1500, 1800, 3, True)
        shoot(mk, mkpng, 1000, 1200, 1, False)
        run(["convert", mkpng, "-quality", "88", jpg])
        run(["convert", mkpng, "-resize", "250x300", th])
    with ThreadPoolExecutor(6) as ex: list(ex.map(work, jobs))

    with open(os.path.join(OUT, "listings.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
    return OUT, rows
