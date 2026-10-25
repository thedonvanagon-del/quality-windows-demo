"""Extra icons for lib.icon(). Each takes (ink, a, b, c, cream, palette, uid) and draws in a ~400x400 box centred on 0,0."""
import math
from lib import is_dark, star5, sparkle

BALL = "#f6efe4"      # off-white for balls, foam, etc.
GREEN = "#6f8f5e"     # plant green that reads on every palette
BROWN = "#8a4a2b"

def _wheel(x, y, r, i, cr):
    return f'<circle cx="{x}" cy="{y}" r="{r}" fill="{i}"/><circle cx="{x}" cy="{y}" r="{r*.38:.0f}" fill="{cr}"/>'

def truck(i, a, b, c, cr, P, u):
    return (f'<path d="M 120 -175 L 185 -20 L 55 -20 Z" fill="{GREEN}"/><rect x="110" y="-20" width="20" height="16" fill="{i}"/>'
            f'<path d="M -200 75 V 10 Q -200 -12 -178 -12 L -125 -12 L -92 -85 L 15 -85 L 15 -5 L 205 -5 L 205 75 Z" fill="{a}"/>'
            f'<path d="M -110 -22 L -85 -72 L 0 -72 L 0 -22 Z" fill="{cr if not is_dark(P) else P["shirt"]}"/>'
            + _wheel(-120, 80, 44, i, cr if not is_dark(P) else P["shirt"]) + _wheel(125, 80, 44, i, cr if not is_dark(P) else P["shirt"]))

def semi(i, a, b, c, cr, P, u):
    h = cr if not is_dark(P) else P["shirt"]
    return (f'<rect x="-210" y="-120" width="270" height="160" rx="10" fill="{i}"/>'
            f'<path d="M 70 45 V -70 L 135 -70 L 185 -15 L 210 -8 V 45 Z" fill="{a}"/><path d="M 100 -58 L 132 -58 L 165 -20 L 100 -20 Z" fill="{h}"/>'
            + "".join(_wheel(x, 62, 30, i, h) for x in (-160, -95, 115, 175)))

def popcorn(i, a, b, c, cr, P, u):
    g = f'<defs><clipPath id="{u}"><path d="M -125 -30 L 125 -30 L 95 190 L -95 190 Z"/></clipPath></defs>'
    g += f'<path d="M -125 -30 L 125 -30 L 95 190 L -95 190 Z" fill="{BALL}"/><g clip-path="url(#{u})">' + "".join(f'<rect x="{x}" y="-40" width="42" height="240" fill="{a}"/>' for x in (-110, -25, 60)) + '</g>'
    g += "".join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{BALL}" stroke="{i}" stroke-width="8"/>' for x, y, r in [(-95, -50, 45), (-35, -85, 50), (35, -80, 48), (95, -50, 45), (0, -40, 40), (-60, -130, 34), (55, -135, 36)])
    return g

def cowboyhat(i, a, b, c, cr, P, u):
    return (f'<path d="M -110 45 C -125 -60 -95 -135 -40 -115 Q 0 -85 40 -115 C 95 -135 125 -60 110 45 Z" fill="{i}"/>'
            f'<rect x="-112" y="5" width="224" height="28" fill="{a}"/>'
            f'<path d="M -215 0 Q -185 65 0 65 Q 185 65 215 0 Q 165 110 0 110 Q -165 110 -215 0 Z" fill="{i}"/>')

def skis(i, a, b, c, cr, P, u):
    return (f'<g transform="rotate(-22)"><rect x="-22" y="-200" width="44" height="400" rx="22" fill="{a}"/></g>'
            f'<g transform="rotate(22)"><rect x="-22" y="-200" width="44" height="400" rx="22" fill="{c}"/></g>'
            f'<g stroke="{i}" stroke-width="12" stroke-linecap="round"><line x1="-150" y1="-170" x2="-40" y2="190"/><line x1="150" y1="-170" x2="40" y2="190"/></g>'
            f'<circle cx="-58" cy="130" r="22" fill="none" stroke="{i}" stroke-width="8"/><circle cx="58" cy="130" r="22" fill="none" stroke="{i}" stroke-width="8"/>')

def heartbeat(i, a, b, c, cr, P, u):
    return (f'<path d="M 0 160 C -260 0 -150 -220 0 -90 C 150 -220 260 0 0 160 Z" fill="{a}"/>'
            f'<polyline points="-215,10 -95,10 -65,-70 -25,95 15,-40 45,10 215,10" fill="none" stroke="{i}" stroke-width="18" stroke-linejoin="round" stroke-linecap="round"/>')

def turkey(i, a, b, c, cr, P, u):
    cols = [a, b, c, a, b, c, a]
    g = "".join(f'<ellipse cx="0" cy="-60" rx="42" ry="125" fill="{col}" transform="rotate({ang} 0 60)"/>' for ang, col in zip(range(-72, 73, 24), cols))
    g += f'<ellipse cx="0" cy="80" rx="105" ry="95" fill="{BROWN}"/><circle cx="0" cy="-15" r="58" fill="{BROWN}"/>'
    g += f'<circle cx="-20" cy="-30" r="9" fill="{BALL}"/><circle cx="20" cy="-30" r="9" fill="{BALL}"/><path d="M -16 -5 L 16 -5 L 0 22 Z" fill="{b}"/><ellipse cx="10" cy="28" rx="10" ry="22" fill="#c0392b"/>'
    return g

def pie(i, a, b, c, cr, P, u):
    return (f'<circle r="185" fill="{b}"/><circle r="185" fill="none" stroke="{i}" stroke-width="10" stroke-dasharray="26 14" opacity=".5"/>'
            f'<circle r="145" fill="{a}"/>'
            + "".join(f'<line x1="{x}" y1="-140" x2="{x}" y2="140" stroke="{b}" stroke-width="26" stroke-linecap="round"/>' for x in (-70, 0, 70))
            + "".join(f'<line x1="-140" y1="{y}" x2="140" y2="{y}" stroke="{b}" stroke-width="26" stroke-linecap="round"/>' for y in (-70, 0, 70)))

def car(i, a, b, c, cr, P, u):
    h = cr if not is_dark(P) else P["shirt"]
    return (f'<path d="M -205 60 L -205 0 Q -195 -22 -150 -28 L -100 -95 L 90 -95 L 150 -28 Q 200 -22 205 0 L 205 60 Z" fill="{a}"/>'
            f'<path d="M -88 -38 L -58 -80 L -6 -80 L -6 -38 Z" fill="{h}"/><path d="M 14 -38 L 14 -80 L 80 -80 L 118 -38 Z" fill="{h}"/>'
            + _wheel(-115, 65, 45, i, h) + _wheel(115, 65, 45, i, h))

def mower(i, a, b, c, cr, P, u):
    return (f'<line x1="110" y1="10" x2="200" y2="-200" stroke="{i}" stroke-width="18" stroke-linecap="round"/><line x1="170" y1="-205" x2="230" y2="-180" stroke="{i}" stroke-width="18" stroke-linecap="round"/>'
            f'<rect x="-75" y="-60" width="120" height="70" rx="16" fill="{i}"/><rect x="-170" y="0" width="300" height="80" rx="34" fill="{a}"/>'
            + _wheel(-120, 95, 42, i, cr if not is_dark(P) else P["shirt"]) + _wheel(85, 95, 42, i, cr if not is_dark(P) else P["shirt"])
            + "".join(f'<path d="M {x} 190 l 10 -40 l 10 40 l 10 -30 l 10 30" fill="none" stroke="{GREEN}" stroke-width="10"/>' for x in (-200, -60, 80)))

def _seamball(fill, stitch, i):
    seams = "".join(f'<path d="{p}" fill="none" stroke="{stitch}" stroke-width="{w}" {extra}/>'
                    for p in ("M -115 -125 Q -35 0 -115 125", "M 115 -125 Q 35 0 115 125")
                    for w, extra in ((8, ""), (26, 'stroke-dasharray="6 18"')))
    return f'<circle r="172" fill="{fill}" stroke="{i}" stroke-width="12"/>' + seams

def baseball(i, a, b, c, cr, P, u): return _seamball(BALL, "#c0392b", i)
def softball(i, a, b, c, cr, P, u): return _seamball("#e8d24a", "#c0392b", i)

def football(i, a, b, c, cr, P, u):
    return (f'<g transform="rotate(-30)"><ellipse rx="195" ry="115" fill="{BROWN}" stroke="{i}" stroke-width="10"/>'
            f'<path d="M -150 -55 Q -140 0 -150 55 M 150 -55 Q 140 0 150 55" stroke="{BALL}" stroke-width="16" fill="none"/>'
            f'<line x1="-60" y1="0" x2="60" y2="0" stroke="{BALL}" stroke-width="12"/>'
            + "".join(f'<line x1="{x}" y1="-20" x2="{x}" y2="20" stroke="{BALL}" stroke-width="10"/>' for x in (-40, -13, 13, 40)) + '</g>')

def volleyball(i, a, b, c, cr, P, u):
    return (f'<circle r="172" fill="{BALL}" stroke="{i}" stroke-width="12"/>'
            f'<g fill="none" stroke="#3b2418" stroke-width="11"><path d="M -168 30 Q -20 -40 110 -130"/><path d="M -60 -162 Q 20 0 -95 145"/><path d="M 35 168 Q 50 10 170 -30"/></g>'
            f'<path d="M -168 30 Q -20 -40 110 -130 L 140 -100 Q 10 -10 -160 70 Z" fill="{a}" opacity=".85"/>')

def hockey(i, a, b, c, cr, P, u):
    stick = lambda col: f'<rect x="-13" y="-200" width="26" height="340" fill="{col}"/><path d="M -13 135 h 95 q 22 0 22 22 v 18 h -117 z" fill="{col}"/>'
    return (f'<g transform="rotate(-32)">{stick(i)}</g><g transform="scale(-1 1) rotate(-32)">{stick(a)}</g>'
            f'<ellipse cx="0" cy="185" rx="60" ry="22" fill="{i}"/>')

def pickleball(i, a, b, c, cr, P, u):
    holes = "".join(f'<circle cx="{120+dx}" cy="{105+dy}" r="9" fill="{i}"/>' for dx, dy in [(0, 0), (-28, -18), (28, -18), (-24, 24), (24, 24), (0, -38), (0, 40)])
    return (f'<g transform="rotate(-25)"><rect x="-115" y="-205" width="210" height="245" rx="95" fill="{a}"/><rect x="-28" y="30" width="36" height="140" rx="12" fill="{i}"/></g>'
            f'<circle cx="120" cy="105" r="68" fill="#e8d24a" stroke="{i}" stroke-width="8"/>' + holes)

def trophy(i, a, b, c, cr, P, u):
    return (f'<path d="M -115 -175 h 230 v 55 q 0 150 -115 160 q -115 -10 -115 -160 Z" fill="{b}"/>'
            f'<path d="M -115 -140 q -90 0 -80 70 q 10 60 90 70 M 115 -140 q 90 0 80 70 q -10 60 -90 70" fill="none" stroke="{b}" stroke-width="22"/>'
            f'<rect x="-22" y="40" width="44" height="80" fill="{b}"/><rect x="-100" y="118" width="200" height="34" rx="8" fill="{i}"/><rect x="-130" y="150" width="260" height="40" rx="8" fill="{i}"/>'
            + star5(0, -85, 52, i if not is_dark(P) else P["shirt"]))

def duck(i, a, b, c, cr, P, u):
    return (f'<path d="M -190 50 Q -180 -30 -50 -25 Q 60 -25 80 10 Q 190 20 165 85 Q 130 140 -60 130 Q -200 120 -190 50 Z" fill="{BROWN}"/>'
            f'<path d="M -170 40 Q -60 0 60 50" fill="none" stroke="{BALL}" stroke-width="10"/>'
            f'<circle cx="40" cy="-75" r="66" fill="{GREEN}"/><rect x="5" y="-18" width="70" height="14" fill="{BALL}"/>'
            f'<path d="M 95 -95 L 200 -70 L 95 -45 Z" fill="{b}"/><circle cx="55" cy="-92" r="10" fill="{i}"/>')

def controller(i, a, b, c, cr, P, u):
    h = cr if not is_dark(P) else P["shirt"]
    return (f'<path d="M -150 -70 Q -205 -70 -205 -5 L -192 90 Q -180 150 -125 125 L -80 65 L 80 65 L 125 125 Q 180 150 192 90 L 205 -5 Q 205 -70 150 -70 Z" fill="{i}"/>'
            f'<rect x="-140" y="-25" width="70" height="22" rx="4" fill="{h}"/><rect x="-116" y="-50" width="22" height="70" rx="4" fill="{h}"/>'
            + "".join(f'<circle cx="{x}" cy="{y}" r="17" fill="{col}"/>' for x, y, col in [(105, -45, a), (145, -12, b), (65, -12, c), (105, 22, a)]))

def shoe(i, a, b, c, cr, P, u):
    h = cr if not is_dark(P) else P["shirt"]
    return (f'<path d="M -195 55 L -195 -15 Q -185 -65 -125 -85 L -60 -110 L 5 -45 Q 70 -15 145 -10 Q 205 0 205 50 L 205 60 Z" fill="{a}"/>'
            f'<rect x="-205" y="52" width="420" height="38" rx="14" fill="{i}"/>'
            + "".join(f'<line x1="{-80+k*25}" y1="{-80+k*20}" x2="{-40+k*25}" y2="{-95+k*20}" stroke="{h}" stroke-width="10" stroke-linecap="round"/>' for k in range(3))
            + "".join(f'<line x1="-300" y1="{y}" x2="-225" y2="{y}" stroke="{i}" stroke-width="12" stroke-linecap="round"/>' for y in (-40, 0, 40)))

def beer(i, a, b, c, cr, P, u):
    return (f'<path d="M 95 -60 q 90 0 90 90 q 0 90 -90 90" fill="none" stroke="{b}" stroke-width="30"/>'
            f'<rect x="-120" y="-100" width="215" height="270" rx="18" fill="{b}"/>'
            + "".join(f'<rect x="{x}" y="-60" width="16" height="200" rx="8" fill="{i}" opacity=".18"/>' for x in (-70, -12, 46))
            + "".join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{BALL}"/>' for x, y, r in [(-95, -110, 42), (-35, -130, 50), (30, -125, 46), (80, -105, 38), (-60, -95, 30), (20, -95, 34)]))

def bolt(i, a, b, c, cr, P, u):
    return f'<polygon points="45,-205 -125,25 -10,25 -55,205 125,-45 10,-45" fill="{b}" stroke="{i}" stroke-width="10" stroke-linejoin="round"/>'

def flame(i, a, b, c, cr, P, u):
    return (f'<path d="M 0 -205 C 90 -110 165 -40 145 65 C 132 145 72 195 0 195 C -72 195 -135 145 -145 65 C -155 -20 -85 -60 -60 -135 C -20 -85 -10 -45 0 -205 Z" fill="{a}"/>'
            f'<path d="M 5 -40 C 55 10 85 50 75 105 C 68 145 38 170 0 170 C -38 170 -72 145 -75 105 C -80 60 -40 40 -30 0 C -10 25 0 10 5 -40 Z" fill="{b}"/>')

def scissors(i, a, b, c, cr, P, u):
    return (f'<path d="M -12 20 L 55 -205 L 75 -200 L 22 25 Z" fill="{i}"/><path d="M 12 20 L -55 -205 L -75 -200 L -22 25 Z" fill="{i}"/>'
            f'<line x1="-5" y1="15" x2="-70" y2="80" stroke="{i}" stroke-width="22"/><line x1="5" y1="15" x2="70" y2="80" stroke="{i}" stroke-width="22"/>'
            f'<circle cx="-85" cy="125" r="55" fill="none" stroke="{a}" stroke-width="24"/><circle cx="85" cy="125" r="55" fill="none" stroke="{a}" stroke-width="24"/>'
            f'<circle cx="0" cy="12" r="14" fill="{b}"/>')

def house(i, a, b, c, cr, P, u):
    return (f'<rect x="75" y="-150" width="38" height="80" fill="{a}"/><path d="M -185 10 L 0 -165 L 185 10 Z" fill="{a}"/>'
            f'<rect x="-140" y="5" width="280" height="175" fill="{i}"/><rect x="-32" y="80" width="64" height="100" rx="6" fill="{b}"/>'
            f'<rect x="55" y="40" width="55" height="55" fill="{cr if not is_dark(P) else P["shirt"]}"/><rect x="-110" y="40" width="55" height="55" fill="{cr if not is_dark(P) else P["shirt"]}"/>')

def cat(i, a, b, c, cr, P, u):
    h = cr if not is_dark(P) else P["shirt"]
    return (f'<path d="M -150 -55 L -135 -195 L -45 -112 Q 0 -126 45 -112 L 135 -195 L 150 -55 Q 178 45 120 112 Q 62 162 0 162 Q -62 162 -120 112 Q -178 45 -150 -55 Z" fill="{i}"/>'
            f'<path d="M -118 -150 L -112 -90 L -70 -115 Z M 118 -150 L 112 -90 L 70 -115 Z" fill="{a}"/>'
            f'<ellipse cx="-58" cy="5" rx="24" ry="32" fill="{b}"/><ellipse cx="58" cy="5" rx="24" ry="32" fill="{b}"/>'
            f'<ellipse cx="-58" cy="5" rx="7" ry="26" fill="{h}"/><ellipse cx="58" cy="5" rx="7" ry="26" fill="{h}"/>'
            f'<path d="M -18 55 L 18 55 L 0 75 Z" fill="{a}"/>'
            f'<g stroke="{h}" stroke-width="7" stroke-linecap="round"><line x1="-40" y1="80" x2="-140" y2="65"/><line x1="-40" y1="95" x2="-140" y2="105"/><line x1="40" y1="80" x2="140" y2="65"/><line x1="40" y1="95" x2="140" y2="105"/></g>')

def dachshund(i, a, b, c, cr, P, u):
    return (f'<path d="M -170 -20 Q -230 -70 -205 -120" fill="none" stroke="{BROWN}" stroke-width="22" stroke-linecap="round"/>'
            f'<rect x="-180" y="-55" width="300" height="100" rx="50" fill="{BROWN}"/>'
            + "".join(f'<rect x="{x}" y="20" width="32" height="75" rx="14" fill="{BROWN}"/>' for x in (-160, -110, 60, 105))
            + f'<ellipse cx="150" cy="-75" rx="62" ry="48" fill="{BROWN}"/><ellipse cx="210" cy="-58" rx="45" ry="26" fill="{BROWN}"/>'
            f'<ellipse cx="130" cy="-50" rx="26" ry="52" fill="#5e3220"/><circle cx="168" cy="-92" r="9" fill="{BALL}"/><circle cx="252" cy="-62" r="12" fill="{i}"/>')

def chicken(i, a, b, c, cr, P, u):
    body = cr if not is_dark(P) else P["shirt"]
    return (f'<path d="M -130 -40 Q -200 -120 -175 -170 Q -130 -120 -95 -105 Q -110 -160 -70 -175 Q -60 -110 -40 -90 Z" fill="{i}"/>'
            f'<ellipse cx="-10" cy="40" rx="160" ry="115" fill="{body}" stroke="{i}" stroke-width="12"/>'
            f'<circle cx="110" cy="-80" r="62" fill="{body}" stroke="{i}" stroke-width="12"/>'
            + "".join(f'<circle cx="{x}" cy="{y}" r="22" fill="#c0392b"/>' for x, y in [(85, -150), (112, -158), (139, -148)])
            + f'<path d="M 168 -88 L 215 -70 L 168 -55 Z" fill="{b}"/><ellipse cx="160" cy="-30" rx="12" ry="22" fill="#c0392b"/><circle cx="125" cy="-90" r="10" fill="{i}"/>'
            f'<path d="M -70 40 Q -10 80 60 30" fill="none" stroke="{i}" stroke-width="10"/>'
            f'<g stroke="{b}" stroke-width="12" stroke-linecap="round"><line x1="-40" y1="150" x2="-50" y2="200"/><line x1="30" y1="150" x2="40" y2="200"/></g>')

def horseshoe(i, a, b, c, cr, P, u):
    holes = "".join(f'<circle cx="{x}" cy="{y}" r="9" fill="{i if not is_dark(P) else P["shirt"]}"/>' for x, y in [(-145, -80), (-150, 10), (-120, 95), (145, -80), (150, 10), (120, 95)])
    return f'<path d="M -110 -175 C -215 40 -130 185 0 185 C 130 185 215 40 110 -175" fill="none" stroke="{b}" stroke-width="66"/>' + holes + sparkle(0, -40, 50, a)

def plant(i, a, b, c, cr, P, u):
    leaves = "".join(f'<ellipse cx="0" cy="-95" rx="42" ry="105" fill="{GREEN}" transform="rotate({ang} 0 30)"/>' for ang in (-60, -28, 0, 28, 60))
    return leaves + f'<rect x="-128" y="20" width="256" height="42" rx="8" fill="{i}"/><path d="M -110 60 L 110 60 L 85 195 L -85 195 Z" fill="{a}"/>'

def yarn(i, a, b, c, cr, P, u):
    h = cr if not is_dark(P) else P["shirt"]
    return (f'<path d="M 110 110 Q 200 160 150 210" fill="none" stroke="{a}" stroke-width="14"/><circle r="150" fill="{a}"/>'
            f'<g fill="none" stroke="{h}" stroke-width="10" opacity=".7"><path d="M -120 -80 Q 0 -10 110 -100"/><path d="M -145 -20 Q 0 60 140 -40"/><path d="M -130 60 Q 0 130 120 50"/><path d="M -40 -145 Q 40 0 -20 148"/></g>'
            f'<line x1="-210" y1="-170" x2="40" y2="60" stroke="{i}" stroke-width="16" stroke-linecap="round"/><path d="M -210 -170 q -20 -30 10 -40" fill="none" stroke="{i}" stroke-width="16" stroke-linecap="round"/>')

def lotus(i, a, b, c, cr, P, u):
    g = "".join(f'<ellipse cx="0" cy="-50" rx="55" ry="130" fill="{col}" transform="rotate({ang} 0 80)"/>' for ang, col in [(-70, b), (70, b), (-35, a), (35, a), (0, a)])
    return g + f'<path d="M -210 110 Q -105 80 0 110 Q 105 140 210 110" fill="none" stroke="{i}" stroke-width="12"/><path d="M -150 160 Q -75 135 0 160 Q 75 185 150 160" fill="none" stroke="{i}" stroke-width="10"/>'

def hemp(i, a, b, c, cr, P, u):
    g = ""
    for ang, L in [(-85, 95), (-55, 150), (-25, 185), (0, 205), (25, 185), (55, 150), (85, 95)]:
        g += f'<path d="M 0 0 C 30 {-L*.3:.0f} 28 {-L*.8:.0f} 0 {-L} C -28 {-L*.8:.0f} -30 {-L*.3:.0f} 0 0 Z" fill="{GREEN}" transform="translate(0 70) rotate({ang})"/>'
    return g + f'<rect x="-8" y="70" width="16" height="130" rx="8" fill="{GREEN}"/>'

def battery_low(i, a, b, c, cr, P, u):
    return (f'<rect x="-185" y="-90" width="340" height="180" rx="26" fill="none" stroke="{i}" stroke-width="22"/><rect x="160" y="-40" width="32" height="80" rx="8" fill="{i}"/>'
            f'<rect x="-158" y="-62" width="26" height="124" rx="6" fill="#d8503f"/>')

def clock(i, a, b, c, cr, P, u):
    return (f'<path d="M -150 -120 A 70 70 0 0 1 -60 -180 Z" fill="{a}"/><path d="M 150 -120 A 70 70 0 0 0 60 -180 Z" fill="{a}"/>'
            f'<circle r="165" fill="none" stroke="{i}" stroke-width="22"/>'
            + "".join(f'<rect x="-6" y="-140" width="12" height="28" fill="{i}" transform="rotate({k*30})"/>' for k in range(12))
            + f'<line x1="0" y1="0" x2="0" y2="-95" stroke="{i}" stroke-width="16" stroke-linecap="round"/><line x1="0" y1="0" x2="75" y2="30" stroke="{a}" stroke-width="14" stroke-linecap="round"/>'
            f'<line x1="-110" y1="150" x2="-140" y2="195" stroke="{i}" stroke-width="18" stroke-linecap="round"/><line x1="110" y1="150" x2="140" y2="195" stroke="{i}" stroke-width="18" stroke-linecap="round"/>')

def cross(i, a, b, c, cr, P, u):
    rays = "".join(f'<line x1="0" y1="-60" x2="0" y2="-200" stroke="{b}" stroke-width="10" stroke-linecap="round" transform="rotate({k} 0 -60)"/>' for k in range(-75, 76, 25))
    return rays + f'<rect x="-28" y="-180" width="56" height="370" rx="6" fill="{i}"/><rect x="-120" y="-100" width="240" height="56" rx="6" fill="{i}"/>'

def cactus(i, a, b, c, cr, P, u):
    return (f'<g stroke="{GREEN}" stroke-linecap="round" fill="none"><path d="M -40 40 L -120 40 L -120 -60" stroke-width="64"/><path d="M 40 0 L 115 0 L 115 -110" stroke-width="64"/></g>'
            f'<rect x="-48" y="-190" width="96" height="380" rx="48" fill="{GREEN}"/><line x1="-200" y1="185" x2="200" y2="185" stroke="{i}" stroke-width="14" stroke-linecap="round"/>'
            + sparkle(-170, -150, 30, b) + sparkle(170, 90, 24, b))

def wildflower(i, a, b, c, cr, P, u):
    def bloom(x, y, col):
        return "".join(f'<ellipse cx="{x}" cy="{y-34}" rx="18" ry="34" fill="{col}" transform="rotate({k*60} {x} {y})"/>' for k in range(6)) + f'<circle cx="{x}" cy="{y}" r="16" fill="{b}"/>'
    stems = f'<g stroke="{GREEN}" stroke-width="12" fill="none" stroke-linecap="round"><path d="M 0 200 Q -10 0 -110 -110"/><path d="M 0 200 Q 0 0 0 -170"/><path d="M 0 200 Q 20 20 120 -80"/></g>'
    leaves = f'<ellipse cx="-35" cy="90" rx="22" ry="55" fill="{GREEN}" transform="rotate(-40 -35 90)"/><ellipse cx="38" cy="60" rx="22" ry="55" fill="{GREEN}" transform="rotate(40 38 60)"/>'
    return stems + leaves + bloom(-110, -110, a) + bloom(0, -170, c) + bloom(120, -80, a)

def glass(i, a, b, c, cr, P, u):
    return (f'<defs><clipPath id="{u}"><path d="M -140 -110 L 140 -110 L 120 170 Q 0 185 -120 170 Z"/></clipPath></defs>'
            f'<rect x="-150" y="30" width="300" height="160" fill="{b}" clip-path="url(#{u})"/>'
            f'<rect x="-75" y="-10" width="70" height="70" rx="10" fill="{BALL}" opacity=".85" transform="rotate(12 -40 25)"/><rect x="15" y="10" width="62" height="62" rx="10" fill="{BALL}" opacity=".85" transform="rotate(-14 46 41)"/>'
            f'<path d="M -140 -110 L 140 -110 L 120 170 Q 0 185 -120 170 Z" fill="none" stroke="{i}" stroke-width="14" stroke-linejoin="round"/>'
            f'<g transform="rotate(-18 150 -150)"><rect x="40" y="-170" width="210" height="40" rx="18" fill="{BROWN}"/><rect x="235" y="-170" width="20" height="40" fill="{a}"/></g>'
            f'<path d="M 245 -200 c -20 -25 20 -45 0 -75" fill="none" stroke="{i}" stroke-width="8" stroke-linecap="round" opacity=".6"/>')

def _mug(i):
    return (f'<path d="M -150 -40 h 260 v 30 c 0 120 -60 180 -130 180 c -70 0 -130 -60 -130 -180 z" fill="{i}"/>'
            f'<path d="M 110 0 c 70 0 85 95 8 115 l -10 -28 c 36 -10 34 -58 2 -58 z" fill="{i}"/><rect x="-180" y="150" width="320" height="22" rx="11" fill="{i}"/>')

def santacup(i, a, b, c, cr, P, u):
    return (_mug(i) + '<path d="M -150 -50 Q -95 -215 75 -175 Q 15 -125 40 -50 Z" fill="#c0392b"/>'
            f'<rect x="-172" y="-72" width="304" height="44" rx="22" fill="{BALL}"/><circle cx="82" cy="-176" r="30" fill="{BALL}"/>')

def reindeercup(i, a, b, c, cr, P, u):
    antler = ('M 0 0 C -8 -70 -40 -110 -70 -170 M -22 -75 L 30 -130 M -45 -125 L -105 -140 M 12 -100 L 22 -150')
    return (f'<g fill="none" stroke="{BROWN}" stroke-width="20" stroke-linecap="round">'
            f'<path d="{antler}" transform="translate(-80 -45)"/><path d="{antler}" transform="translate(40 -45) scale(-1 1)"/></g>'
            + _mug(i) + f'<circle cx="-62" cy="40" r="11" fill="{BALL if is_dark(P) else cr}"/><circle cx="2" cy="40" r="11" fill="{BALL if is_dark(P) else cr}"/>')

def beantree(i, a, b, c, cr, P, u):
    beans = "".join(f'<g transform="translate({x} {y}) rotate({r})"><ellipse rx="17" ry="25" fill="{BROWN}"/><path d="M -3 -22 C 8 -8 -8 8 3 22" stroke="{BALL}" stroke-width="5" fill="none"/></g>'
                    for x, y, r in [(-35, -75, -20), (35, -40, 25), (-70, 25, 15), (15, 15, -30), (75, 70, 20), (-20, 70, 10)])
    return (f'<path d="M 0 -175 L 115 -40 L 65 -40 L 160 100 L -160 100 L -65 -40 L -115 -40 Z" fill="{GREEN}"/>'
            f'<rect x="-28" y="100" width="56" height="60" fill="{BROWN}"/>' + beans + star5(0, -180, 52, b))

EXTRA = dict(truck=truck, semi=semi, popcorn=popcorn, cowboyhat=cowboyhat, skis=skis, heartbeat=heartbeat, turkey=turkey, pie=pie,
             car=car, mower=mower, baseball=baseball, softball=softball, football=football, volleyball=volleyball, hockey=hockey,
             pickleball=pickleball, trophy=trophy, duck=duck, controller=controller, shoe=shoe, beer=beer, bolt=bolt, flame=flame,
             scissors=scissors, house=house, cat=cat, dachshund=dachshund, chicken=chicken, horseshoe=horseshoe, plant=plant,
             yarn=yarn, lotus=lotus, hemp=hemp, battery_low=battery_low, clock=clock, cross=cross, cactus=cactus,
             wildflower=wildflower, glass=glass, santacup=santacup, reindeercup=reindeercup, beantree=beantree)
