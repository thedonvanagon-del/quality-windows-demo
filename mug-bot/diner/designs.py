from kit import *

D = []


def add(pun, style):
    def wrap(fn):
        D.append((pun, style, fn()))
        return fn
    return wrap


@add("Brew-dolph the Red-Nosed Reindeer", "70s sunset disc")
def d1():
    disc = (f'<circle cx="600" cy="360" r="300" fill="{CREAM}" stroke="{INK}" stroke-width="10"/>' +
            stripes(300, 330, 600, 330, [CHERRY, ORANGE, MUSTARD, TEAL, NAVY],
                    clip='<circle cx="600" cy="360" r="290"/>', gap=0.22) +
            f'<circle cx="600" cy="360" r="300" fill="none" stroke="{INK}" stroke-width="10"/>')
    ant = "".join(f'<path d="{d}" fill="none" stroke="{INK}" stroke-width="30" stroke-linecap="round"/>'
                  f'<path d="{d}" fill="none" stroke="#b07a4a" stroke-width="16" stroke-linecap="round"/>' for d in
                  ("M520,220 L470,110 M495,165 L440,150 M482,135 L455,90", "M680,220 L730,110 M705,165 L760,150 M718,135 L745,90"))
    head = (ant + f'<ellipse cx="600" cy="320" rx="135" ry="125" fill="{COFFEE}" stroke="{INK}" stroke-width="10"/>'
            f'<ellipse cx="600" cy="385" rx="88" ry="66" fill="#c99a6b" stroke="{INK}" stroke-width="8"/>'
            f'<ellipse cx="545" cy="290" rx="20" ry="26" fill="{WHITE}" stroke="{INK}" stroke-width="6"/><circle cx="550" cy="296" r="11" fill="{INK}"/>'
            f'<ellipse cx="655" cy="290" rx="20" ry="26" fill="{WHITE}" stroke="{INK}" stroke-width="6"/><circle cx="650" cy="296" r="11" fill="{INK}"/>'
            f'<circle cx="600" cy="360" r="42" fill="{CHERRY}" stroke="{INK}" stroke-width="8"/><circle cx="586" cy="346" r="11" fill="{WHITE}"/>'
            f'<path d="M565,420 q35,28 70,0" fill="none" stroke="{INK}" stroke-width="8" stroke-linecap="round"/>')
    return svg(disc + head + diner_mug(690, 330, 0.75) +
               retro(600, 800, "Brew-dolph", 190, "Pacifico", CHERRY, depth=16) +
               ribbon(600, 900, 680, 84, TEAL, "#1f7c75") +
               plain(600, 920, "THE RED-NOSED REINDEER", 44, "Righteous", WHITE, maxw=640, spacing=3))


@add("Have Yourself a Merry Little Latte", "Chrome marquee sign")
def d2():
    return svg(diner_mug(470, 40, 1.0, WHITE, CHERRY) + marquee(130, 270, 940, 560, TEAL) +
               retro(600, 400, "HAVE YOURSELF A", 62, "Righteous", CREAM, depth=8, maxw=760, spacing=4) +
               retro(600, 580, "Merry Little", 170, "Yellowtail", CREAM, outline=INK, depth=14, maxw=800) +
               retro(600, 760, "LATTE", 150, "Bungee", CHERRY, depth=14, maxw=760, spacing=10))


@add("Deck the Mugs", "Checkerboard & hanging mugs")
def d3():
    garland = f'<path d="M90,150 Q600,420 1110,150" fill="none" stroke="{DKGREEN}" stroke-width="26" stroke-linecap="round"/>'
    garland += f'<path d="M90,150 Q600,420 1110,150" fill="none" stroke="{GREEN}" stroke-width="12" stroke-dasharray="18 14" stroke-linecap="round"/>'
    mugs = ""
    for i, (x, c) in enumerate(((250, CHERRY), (420, TEAL), (600, MUSTARD), (780, PINK), (950, CHERRY))):
        t = (x - 90) / 1020
        y = (1 - t) ** 2 * 150 + 2 * (1 - t) * t * 420 + t ** 2 * 150
        mugs += f'<line x1="{x}" y1="{y}" x2="{x}" y2="{y+40}" stroke="{INK}" stroke-width="6"/>'
        mugs += diner_mug(x - 70, y + 30, 0.55, WHITE, c, steam=False)
    holl = "".join(holly(x, 140 + 0.9 * (1 - ((x - 600) / 510) ** 2) * 140, 0.55) for x in (335, 690, 865))
    floor = checker(120, 770, 960, 200, 48, INK, WHITE,
                    clip='<path d="M120,770 h960 l-60,200 h-840 z"/>')
    return svg(garland + mugs + holl + floor +
               f'<path d="M120,770 h960 l-60,200 h-840 z" fill="none" stroke="{INK}" stroke-width="10"/>' +
               retro(600, 690, "Deck the Mugs", 170, "Shrikhand", MUSTARD, depth=18, maxw=1080))


@add("Espresso Yourself This Christmas", "Atomic starburst")
def d4():
    return svg(starburst(600, 420, 360, MUSTARD, 18, 0.78) + starburst(600, 420, 290, CREAM, 18, 0.86, rot=10, sw=5) +
               diner_mug(470, 260, 1.05, CHERRY, WHITE) + sparkles(((230, 160, 40), (980, 170, 34), (1010, 640, 46), (190, 620, 30))) +
               retro(600, 170, "Espresso", 170, "Lobster", CHERRY, depth=16, maxw=900) +
               retro(600, 760, "YOURSELF", 140, "Bungee", TEAL, depth=16, maxw=1000, spacing=6) +
               ribbon(600, 880, 620, 84, CHERRY) + plain(600, 900, "THIS CHRISTMAS", 52, "Righteous", WHITE, maxw=580, spacing=6))


@add("Santa's Little Helper (He's Caffeinated)", "Neon sign at night")
def d5():
    panel = (f'<rect x="80" y="60" width="1040" height="880" rx="80" fill="{INK}" stroke="{CHROME2}" stroke-width="16"/>'
             f'<rect x="104" y="84" width="992" height="832" rx="62" fill="none" stroke="{CHROME}" stroke-width="4"/>')
    return svg(panel + diner_mug(470, 380, 1.0, WHITE, TEAL) + santa_hat(450, 300, 1.25) +
               neon(600, 250, "Santa's Little Helper", 120, "Yellowtail", PINK, maxw=960) +
               neon(600, 760, "HE'S", 70, "Monoton", TEAL, spacing=10) +
               neon(600, 870, "CAFFEINATED", 96, "Monoton", MUSTARD, maxw=940, spacing=4))


@add("Let It Brew, Let It Brew, Let It Brew", "Diner coffee pot & stacked type")
def d6():
    flakes = sparkles(((150, 160, 34), (1050, 120, 40), (1080, 470, 28), (120, 480, 26), (300, 300, 20), (930, 300, 22)), WHITE)
    return svg(flakes + diner_pot(420, 30, 1.25, ORANGE) +
               retro(600, 640, "LET IT BREW", 120, "Bungee", CHERRY, depth=12, spacing=4) +
               retro(600, 770, "LET IT BREW", 120, "Bungee", TEAL, depth=12, spacing=4) +
               retro(600, 900, "LET IT BREW", 120, "Bungee", MUSTARD, depth=12, spacing=4))


@add("Silent Night, Decaf Never", "Midnight diner badge")
def d7():
    badge = (f'<circle cx="600" cy="460" r="440" fill="{NAVY}" stroke="{INK}" stroke-width="12"/>'
             f'<circle cx="600" cy="460" r="410" fill="none" stroke="{MUSTARD}" stroke-width="6" stroke-dasharray="4 18"/>'
             f'<circle cx="880" cy="440" r="52" fill="{CREAM}" stroke="{INK}" stroke-width="6"/><circle cx="905" cy="423" r="47" fill="{NAVY}"/>' +
             sparkles(((330, 200, 22), (450, 140, 14), (690, 170, 16), (250, 330, 12), (960, 380, 14)), MUSTARD))
    cross = (f'<g stroke="{INK}" stroke-width="40" stroke-linecap="round"><line x1="430" y1="340" x2="770" y2="640"/><line x1="770" y1="340" x2="430" y2="640"/></g>'
             f'<g stroke="{CHERRY}" stroke-width="24" stroke-linecap="round"><line x1="430" y1="340" x2="770" y2="640"/><line x1="770" y1="340" x2="430" y2="640"/></g>')
    return svg(badge + diner_pot(470, 330, 1.0, ORANGE) + cross +
               neon(600, 245, "Silent Night", 120, "Pacifico", CREAM, core=WHITE, maxw=740) +
               retro(600, 820, "DECAF NEVER", 100, "Bungee", MUSTARD, depth=10, maxw=760, spacing=4))


@add("Fa La La La Latte", "Row of diner mugs")
def d8():
    mugs = "".join(diner_mug(x, 120, 0.82, WHITE, c) for x, c in ((60, CHERRY), (340, TEAL), (620, MUSTARD), (900, PINK)))
    las = "".join(retro(x, 440, w, 100, "Shrikhand", c, depth=10) for x, w, c in ((160, "Fa", CHERRY), (440, "La", TEAL), (720, "La", MUSTARD), (1000, "La", PINK)))
    return svg(mugs + las + retro(600, 790, "Latte", 300, "Pacifico", CREAM, depth=22, maxw=900) +
               sparkles(((150, 640, 40), (1060, 620, 46), (960, 900, 26))))


@add("Holly Jolly Roast", "Teal starburst badge")
def d9():
    beans = "".join(f'<g transform="translate({600+380*math.cos(math.radians(a)):.0f},{470+380*math.sin(math.radians(a)):.0f}) rotate({a+90})">'
                    f'<ellipse rx="26" ry="38" fill="{COFFEE}" stroke="{INK}" stroke-width="6"/><path d="M0,-32 c-14,16 14,46 0,64" fill="none" stroke="{INK}" stroke-width="6"/></g>'
                    for a in range(0, 360, 30))
    return svg(beans + starburst(600, 470, 330, TEAL, 20, 0.84) + f'<circle cx="600" cy="470" r="240" fill="{CREAM}" stroke="{INK}" stroke-width="8"/>' +
               holly(600, 270, 1.3) +
               retro(600, 470, "Holly Jolly", 130, "Shrikhand", CHERRY, depth=12, maxw=600) +
               ribbon(600, 610, 560, 100, MUSTARD, "#c48a1c") + plain(600, 640, "ROAST", 80, "Bungee", INK, spacing=14))


@add("Jingle Bell Brew", "Googie boomerangs")
def d10():
    bell = (f'<g stroke="{INK}" stroke-width="10" stroke-linejoin="round">'
            f'<path d="M600,140 c-140,0 -150,150 -160,250 l-50,70 h420 l-50,-70 c-10,-100 -20,-250 -160,-250 z" fill="{MUSTARD}"/>'
            f'<path d="M470,330 h260" stroke="{CHERRY}" stroke-width="28"/>'
            f'<circle cx="600" cy="490" r="40" fill="{MUSTARD}"/>'
            f'<path d="M545,135 q55,-80 110,0" fill="none" stroke="{CHERRY}" stroke-width="22"/></g>'
            f'<path d="M520,200 q-30,60 -30,140" fill="none" stroke="{WHITE}" stroke-width="16" opacity=".7" stroke-linecap="round"/>')
    googie = (boomerang(250, 230, 1.5, TEAL, -20) + boomerang(950, 250, 1.4, PINK, 25) + boomerang(200, 520, 1.1, CHERRY, 15) +
              boomerang(1000, 520, 1.2, TEAL, -10) + sparkles(((330, 110, 34), (870, 110, 28), (120, 380, 22), (1090, 390, 26))))
    return svg(googie + bell + retro(600, 720, "Jingle Bell", 190, "Lobster", CHERRY, depth=16, maxw=1000) +
               retro(600, 900, "BREW", 160, "BungeeShade", TEAL, outline=INK, ow=4, depth=0, spacing=20))


@add("Merry Crisp-Mocha", "Candy-cane panel")
def d11():
    pat = (f'<defs><pattern id="cane" width="90" height="90" patternUnits="userSpaceOnUse" patternTransform="rotate(40)">'
           f'<rect width="90" height="90" fill="{WHITE}"/><rect width="42" height="90" fill="{CHERRY}"/></pattern></defs>')
    panel = (f'<rect x="132" y="66" width="940" height="560" rx="70" fill="{INK}"/>'
             f'<rect x="120" y="50" width="940" height="560" rx="70" fill="url(#cane)" stroke="{INK}" stroke-width="12"/>'
             f'<rect x="220" y="130" width="740" height="400" rx="200" fill="{CREAM}" stroke="{INK}" stroke-width="10"/>')
    cream = (f'<path d="M478,262 q20,-70 80,-52 q30,-70 96,-20 q60,-30 76,46 q-10,26 -60,22 h-150 q-50,4 -42,4 z" '
             f'fill="{WHITE}" stroke="{INK}" stroke-width="9" stroke-linejoin="round"/>'
             + "".join(f'<rect x="{x}" y="{y}" width="14" height="6" rx="3" fill="{c}" transform="rotate({r} {x} {y})"/>' for x, y, r, c in
                       ((540, 230, 20, CHERRY), (600, 205, -30, TEAL), (650, 238, 60, MUSTARD), (700, 222, 10, PINK), (580, 250, -60, GREEN))))
    return svg(pat + panel + diner_mug(470, 200, 1.05, COFFEE, CREAM, coffee="#5a321e", steam=False) + cream +
               retro(600, 790, "Merry", 180, "Pacifico", CHERRY, depth=16) +
               retro(600, 940, "CRISP-MOCHA", 120, "Chango", TEAL, depth=14, maxw=1080))


@add("Sleigh All Day", "80s synthwave sunset")
def d12():
    sun = (f'<defs><linearGradient id="sun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{MUSTARD}"/>'
           f'<stop offset="1" stop-color="{PINK}"/></linearGradient><clipPath id="sc"><circle cx="600" cy="420" r="300"/></clipPath></defs>'
           f'<g clip-path="url(#sc)"><rect x="300" y="120" width="600" height="300" fill="url(#sun)"/>' +
           "".join(f'<rect x="300" y="{300+i*30+i*i*4}" width="600" height="{8+i*4}" fill="url(#sun)"/>' for i in range(5)) + "</g>")
    grid = (f'<clipPath id="gc"><rect x="80" y="430" width="1040" height="260"/></clipPath><g clip-path="url(#gc)"><rect x="80" y="430" width="1040" height="260" fill="{NAVY}"/>' +
            "".join(f'<line x1="80" y1="{430+i*i*9+8}" x2="1120" y2="{430+i*i*9+8}" stroke="{PINK}" stroke-width="4"/>' for i in range(1, 9)) +
            "".join(f'<line x1="{600+k*40}" y1="430" x2="{600+k*170}" y2="690" stroke="{PINK}" stroke-width="4"/>' for k in range(-6, 7)) +
            f'</g><line x1="80" y1="430" x2="1120" y2="430" stroke="{MUSTARD}" stroke-width="8"/>')
    sleigh = (f'<g stroke="{INK}" stroke-width="10" stroke-linejoin="round" stroke-linecap="round">'
              f'<path d="M380,250 h300 c40,0 60,-40 70,-90 l40,10 c-10,80 -40,170 -130,170 h-250 c-40,0 -60,-30 -30,-90 z" fill="{CHERRY}"/>'
              f'<path d="M400,280 h270" stroke="{MUSTARD}" stroke-width="12"/>'
              f'<path d="M330,385 h420 c50,0 70,-30 60,-60" fill="none" stroke-width="16"/>'
              f'<path d="M440,340 v45 M640,340 v45" stroke-width="12"/>'
              f'<rect x="420" y="160" width="110" height="100" rx="10" fill="{COFFEE}"/>'
              f'<path d="M440,190 h70 M440,220 h70" stroke="{CREAM}" stroke-width="6"/>'
              f'<rect x="540" y="185" width="90" height="75" rx="8" fill="{TEAL}"/>'
              f'<path d="M560,210 h50" stroke="{WHITE}" stroke-width="6"/></g>')
    return svg(sun + grid + sleigh + neon(600, 850, "Sleigh All Day", 150, "Kaushan", PINK, maxw=1040) +
               neon(600, 960, "COFFEE EDITION", 60, "Monoton", TEAL, spacing=6))


@add("O Come All Ye Caffeinated", "Diner letter-board menu")
def d13():
    board = (f'<rect x="102" y="92" width="1000" height="820" rx="24" fill="{COFFEE}" stroke="{INK}" stroke-width="12"/>'
             f'<rect x="140" y="130" width="924" height="744" rx="8" fill="#1d1d22" stroke="{INK}" stroke-width="6"/>' +
             "".join(f'<line x1="150" y1="{y}" x2="1054" y2="{y}" stroke="#2c2c33" stroke-width="3"/>' for y in range(150, 870, 22)))
    def row(y, s, size=66, color=WHITE, font="RubikMono"):
        return plain(600, y, s, size, font, color, maxw=880, spacing=4)
    return svg(board + row(220, "~ TODAY'S SPECIAL ~", 44, MUSTARD) +
               row(340, "O COME", 92) + row(450, "ALL YE", 92) + row(600, "CAFFEINATED", 92, PINK) +
               row(710, "BOTTOMLESS CUP .... 5¢", 40, MINT) + row(800, "MERRY CHRISTMAS", 40, MUSTARD) +
               holly(150, 110, 0.9) + holly(1050, 110, 0.9))


@add("Bean There, Wrapped That", "Pink starburst gift")
def d14():
    gift = (f'<g stroke="{INK}" stroke-width="10" stroke-linejoin="round">'
            f'<rect x="420" y="330" width="360" height="290" fill="{CHERRY}"/>'
            f'<rect x="395" y="270" width="410" height="80" fill="#c62b33"/>'
            f'<rect x="570" y="270" width="60" height="350" fill="{MUSTARD}"/>'
            f'<path d="M600,270 c-150,-140 -200,30 0,0 c200,30 150,-140 0,0" fill="{MUSTARD}"/></g>')
    beans = "".join(f'<g transform="translate({x},{y}) rotate({r})"><ellipse rx="26" ry="38" fill="{COFFEE}" stroke="{INK}" stroke-width="6"/>'
                    f'<path d="M0,-32 c-14,16 14,46 0,64" fill="none" stroke="{INK}" stroke-width="6"/></g>'
                    for x, y, r in ((330, 600, -30), (870, 590, 40), (300, 470, 10), (900, 450, -20), (450, 200, 60), (760, 190, -50)))
    return svg(starburst(600, 440, 340, PINK, 16, 0.75) + gift + beans +
               retro(600, 160, "Bean There,", 150, "Pacifico", TEAL, depth=14, maxw=1000) +
               retro(600, 860, "WRAPPED THAT", 130, "Bungee", CHERRY, depth=14, maxw=1080, spacing=4))


@add("Nut-Crack-a-Brew", "Cartoon nutcracker")
def d15():
    n = (f'<g stroke="{INK}" stroke-width="9" stroke-linejoin="round">'
         f'<rect x="510" y="90" width="180" height="150" rx="16" fill="{INK}"/>'
         f'<rect x="490" y="225" width="220" height="30" rx="8" fill="{MUSTARD}"/>'
         f'<rect x="525" y="255" width="150" height="140" rx="20" fill="#f3c9a1"/>'
         f'<path d="M525,330 h150 v40 a20,20 0 0 1 -20,20 h-110 a20,20 0 0 1 -20,-20 z" fill="{WHITE}"/>'
         f'<rect x="560" y="350" width="80" height="18" fill="{INK}"/>'
         f'<circle cx="570" cy="300" r="12" fill="{INK}"/><circle cx="630" cy="300" r="12" fill="{INK}"/>'
         f'<circle cx="555" cy="330" r="12" fill="{PINK}" stroke-width="0"/><circle cx="645" cy="330" r="12" fill="{PINK}" stroke-width="0"/>'
         f'<rect x="490" y="395" width="220" height="250" rx="20" fill="{CHERRY}"/>'
         f'<rect x="585" y="395" width="30" height="250" fill="{MUSTARD}"/>'
         f'<rect x="490" y="600" width="220" height="40" fill="{INK}"/>'
         f'<rect x="505" y="640" width="85" height="150" fill="{NAVY}"/><rect x="610" y="640" width="85" height="150" fill="{NAVY}"/>'
         f'<rect x="495" y="780" width="105" height="34" rx="10" fill="{INK}"/><rect x="600" y="780" width="105" height="34" rx="10" fill="{INK}"/>'
         f'<rect x="420" y="410" width="70" height="190" rx="24" fill="{CHERRY}"/><rect x="710" y="410" width="70" height="150" rx="24" fill="{CHERRY}"/></g>'
         + "".join(f'<circle cx="600" cy="{y}" r="9" fill="{WHITE}" stroke="{INK}" stroke-width="3"/>' for y in (440, 490, 540)))
    return svg(starburst(600, 450, 260, TEAL, 14, 0.8, sw=8) + n + diner_mug(720, 470, 0.6, WHITE, MUSTARD) +
               retro(210, 330, "NUT-", 120, "Shrikhand", MUSTARD, depth=12, maxw=420) +
               retro(210, 460, "CRACK", 120, "Shrikhand", CHERRY, depth=12, maxw=360) +
               retro(1000, 720, "-A-", 90, "Shrikhand", TEAL, depth=10, maxw=360) +
               retro(1000, 870, "BREW", 130, "Shrikhand", MUSTARD, depth=12, maxw=340))


@add("Mistle-Toe the Line", "Green & pink neon")
def d16():
    panel = f'<rect x="100" y="40" width="1000" height="920" rx="90" fill="{INK}" stroke="{CHROME2}" stroke-width="16"/>'
    sprig = (f'<g filter="url(#glow)" fill="none" stroke-linecap="round" stroke-linejoin="round">'
             f'<path d="M600,80 v120" stroke="{CHERRY}" stroke-width="10"/>'
             f'<path d="M600,200 q-90,-10 -120,60 q70,10 120,-60 q90,-10 120,60 q-70,10 -120,-60" stroke="#4cff8a" stroke-width="9"/>'
             f'<circle cx="586" cy="230" r="14" stroke="{WHITE}" stroke-width="7"/><circle cx="616" cy="236" r="14" stroke="{WHITE}" stroke-width="7"/></g>'
             f'<g filter="url(#glow)" fill="none" stroke="{TEAL}" stroke-width="10" stroke-linejoin="round" stroke-linecap="round">'
             f'<path d="M470,330 h240 l-14,170 a30,30 0 0 1 -30,26 h-152 a30,30 0 0 1 -30,-26 z"/>'
             f'<path d="M710,370 c80,0 80,110 -6,110"/></g>')
    return svg(panel + sprig + neon(600, 720, "Mistle-Toe", 170, "Yellowtail", "#4cff8a", maxw=900) +
               neon(600, 870, "the line", 140, "Pacifico", PINK, maxw=800))


@add("Frost Things First (Coffee)", "Icy 70s rainbow")
def d17():
    arch = "".join(f'<path d="M{600-r},{560} a{r},{r} 0 0 1 {2*r},0" fill="none" stroke="{c}" stroke-width="44"/>'
                   for r, c in ((420, NAVY), (370, "#3d6fa8"), (320, "#6fa8d6"), (270, MINT), (220, "#e8f6f8")))
    arch = f'<path d="M{600-444},560 a444,444 0 0 1 888,0 h-50 a394,394 0 0 0 -788,0 z" fill="{INK}" transform="translate(10,12)"/>' + arch
    return svg(arch + sparkles(((300, 250, 30), (900, 240, 34), (180, 470, 22), (1020, 470, 24)), WHITE) + diner_mug(470, 330, 1.0, WHITE, "#6fa8d6") +
               retro(600, 720, "Frost Things First", 130, "Shrikhand", "#e8f6f8", outline=NAVY, shadow=NAVY, depth=12, maxw=1080) +
               retro(600, 880, "(coffee)", 120, "Pacifico", MUSTARD, depth=12))


@add("Winter Wonder-Latte", "Chrome snow globe")
def d18():
    globe = (f'<circle cx="600" cy="370" r="290" fill="#dff3f5" stroke="{INK}" stroke-width="12"/>'
             f'<path d="M330,470 q270,-60 540,0 v60 h-540 z" fill="{WHITE}" stroke="{INK}" stroke-width="6"/>' +
             pine(420, 520, 120, 210) + pine(790, 520, 110, 190) + diner_mug(500, 290, 0.85, WHITE, CHERRY) +
             "".join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{WHITE}" stroke="{CHROME2}" stroke-width="2"/>' for x, y, r in
                     ((450, 180, 10), (720, 160, 12), (560, 240, 8), (800, 290, 9), (400, 320, 8), (660, 210, 7), (500, 130, 9))) +
             f'<path d="M410,110 q-80,80 -80,200" fill="none" stroke="{WHITE}" stroke-width="18" opacity=".8" stroke-linecap="round"/>'
             f'<path d="M330,560 h540 l50,140 h-640 z" fill="{CHROME2}" stroke="{INK}" stroke-width="12" stroke-linejoin="round"/>'
             f'<path d="M350,590 h500 l30,80 h-560 z" fill="{CHERRY}" stroke="{INK}" stroke-width="6"/>')
    return svg(globe + plain(600, 655, "WINTER", 56, "Monoton", WHITE, spacing=12, maxw=520) +
               retro(600, 880, "Wonder-Latte", 170, "Pacifico", TEAL, depth=16, maxw=1080))


@add("It's the Most Wonderful Brew of the Year", "Mug tree on checkerboard")
def d19():
    t = starburst(600, 80, 60, MUSTARD, 5, 0.45, sw=6)
    for n, y in ((1, 120), (2, 250), (3, 380)):
        for i in range(n):
            x = 600 + (i - (n - 1) / 2) * 200 - 95
            t += diner_mug(x, y, 0.72, WHITE, [CHERRY, TEAL, MUSTARD, PINK][(i + n) % 4], steam=False)
    floor = checker(200, 560, 800, 90, 45, INK, WHITE, clip='<path d="M240,560 h720 l40,90 h-800 z"/>')
    return svg(t + floor + f'<path d="M240,560 h720 l40,90 h-800 z" fill="none" stroke="{INK}" stroke-width="8"/>' +
               retro(600, 760, "IT'S THE MOST WONDERFUL", 66, "Righteous", TEAL, depth=8, maxw=1060, spacing=2) +
               retro(600, 920, "Brew of the Year", 160, "Lobster", CHERRY, depth=16, maxw=1080))


@add("Bean There, Done Christmas", "Diner guest check")
def d20():
    pad = (f'<g transform="rotate(-4 600 500)"><rect x="262" y="72" width="700" height="860" fill="{INK}"/>'
           f'<rect x="250" y="60" width="700" height="860" fill="#eef7e9" stroke="{INK}" stroke-width="8"/>'
           f'<rect x="250" y="60" width="700" height="120" fill="{GREEN}" stroke="{INK}" stroke-width="8"/>' +
           plain(600, 140, "GUEST CHECK", 64, "RubikMono", WHITE, spacing=4) +
           "".join(f'<line x1="270" y1="{y}" x2="930" y2="{y}" stroke="#9cc9a6" stroke-width="3"/>' for y in range(250, 900, 70)) +
           f'<line x1="790" y1="190" x2="790" y2="900" stroke="{CHERRY}" stroke-width="3"/>' +
           "".join(plain(290, y, s, 50, "Kaushan", NAVY, anchor="start", maxw=490) + plain(870, y, m, 50, "Kaushan", NAVY, maxw=150)
                   for y, s, m in ((290, "Christmas", "✓"), (360, "Gifts wrapped", "✓"), (430, "Cookies baked", "✓"), (500, "Coffee refills", "12"))) +
           retro(600, 680, "Bean There,", 120, "Pacifico", CHERRY, depth=10, maxw=640) +
           retro(600, 830, "DONE CHRISTMAS", 76, "Bungee", GREEN, depth=10, maxw=640) + "</g>")
    return svg(pad + holly(930, 90, 1.0))


@add("Brewed Awakening: Christmas Morning", "70s sunrise arch")
def d21():
    clip = '<path d="M220,640 V400 a380,380 0 0 1 760,0 V640 z"/>'
    scene = (stripes(220, 20, 760, 620, [MUSTARD, ORANGE, CHERRY, PINK, "#b5487a", NAVY], clip=clip, gap=0.0) +
             f'<clipPath id="ac">{clip}</clipPath><g clip-path="url(#ac)"><circle cx="600" cy="560" r="170" fill="{CREAM}" stroke="{INK}" stroke-width="8"/>' +
             "".join(pine(x, 660, w, h, c) for x, w, h, c in ((270, 170, 330, DKGREEN), (410, 140, 250, GREEN), (790, 150, 270, GREEN), (930, 190, 350, DKGREEN), (600, 110, 190, DKGREEN))) +
             "</g>" + f'<path d="M220,640 V400 a380,380 0 0 1 760,0 V640 z" fill="none" stroke="{INK}" stroke-width="12"/>')
    return svg(scene + retro(600, 800, "Brewed Awakening", 136, "Shrikhand", CREAM, depth=14, maxw=1080) +
               retro(600, 930, "Christmas Morning", 110, "Yellowtail", ORANGE, depth=10, maxw=900))


@add("Pour Some Sugar Cookie on Me", "80s neon jukebox night")
def d22():
    panel = f'<rect x="80" y="50" width="1040" height="900" rx="90" fill="{NAVY}" stroke="{CHROME2}" stroke-width="16"/>'
    limbs = [((600, 360), (600, 470), 130), ((470, 410), (730, 410), 72), ((600, 470), (520, 590), 80), ((600, 470), (680, 590), 80)]
    cookie = "".join(f'<line x1="{a[0]}" y1="{a[1]}" x2="{b[0]}" y2="{b[1]}" stroke="{INK}" stroke-width="{w+18}" stroke-linecap="round"/>' for a, b, w in limbs)
    cookie += f'<circle cx="600" cy="300" r="78" fill="{INK}"/>'
    cookie += "".join(f'<line x1="{a[0]}" y1="{a[1]}" x2="{b[0]}" y2="{b[1]}" stroke="#c98b4f" stroke-width="{w}" stroke-linecap="round"/>' for a, b, w in limbs)
    cookie += (f'<circle cx="600" cy="300" r="69" fill="#c98b4f"/>'
               f'<circle cx="578" cy="290" r="9" fill="{INK}"/><circle cx="622" cy="290" r="9" fill="{INK}"/>'
               f'<path d="M574,320 q26,20 52,0" fill="none" stroke="{INK}" stroke-width="7" stroke-linecap="round"/>'
               + "".join(f'<path d="{d}" fill="none" stroke="{WHITE}" stroke-width="7" stroke-linecap="round"/>' for d in
                         ("M450,395 q8,15 0,30", "M750,395 q-8,15 0,30", "M500,590 q20,10 40,0", "M660,590 q20,10 40,0"))
               + "".join(f'<circle cx="600" cy="{y}" r="11" fill="{c}" stroke="{INK}" stroke-width="4"/>' for y, c in ((400, CHERRY), (440, TEAL))))
    return svg(panel + cookie + neon(600, 175, "POUR SOME", 86, "Monoton", PINK, spacing=6) +
               neon(600, 760, "Sugar Cookie", 150, "Pacifico", TEAL, maxw=960) +
               neon(600, 890, "ON ME", 100, "Monoton", MUSTARD, spacing=10))


@add("Yule Need More Coffee", "70s bumper sticker")
def d23():
    sticker = (f'<rect x="96" y="226" width="1020" height="560" rx="110" fill="{INK}"/>'
               f'<rect x="80" y="210" width="1020" height="560" rx="110" fill="{WHITE}" stroke="{INK}" stroke-width="12"/>'
               f'<rect x="114" y="244" width="952" height="492" rx="80" fill="{CHERRY}" stroke="{INK}" stroke-width="6"/>' +
               stripes(114, 640, 952, 80, [MUSTARD, ORANGE], clip='<rect x="114" y="244" width="952" height="492" rx="80"/>', gap=0.15))
    return svg(sticker + retro(590, 450, "YULE NEED", 150, "Chango", CREAM, depth=14, maxw=900) +
               retro(570, 595, "MORE COFFEE", 110, "Chango", MUSTARD, depth=14, maxw=820) +
               holly(160, 230, 1.3) + diner_mug(930, 700, 0.66, WHITE, TEAL, steam=False))


@add("'Tis the Season to Be Caffeinated", "Open-24-hours sign")
def d24():
    sign = (marquee(120, 70, 960, 600, CREAM, rad=60, on=PINK) +
            f'<rect x="770" y="720" width="330" height="150" rx="28" fill="{INK}" stroke="{CHROME2}" stroke-width="10"/>')
    return svg(sign + retro(600, 230, "'TIS THE SEASON", 84, "Righteous", TEAL, depth=8, maxw=820, spacing=4) +
               retro(600, 360, "to be", 110, "Yellowtail", CHERRY, depth=10) +
               retro(600, 540, "CAFFEINATED", 128, "Bungee", MUSTARD, depth=14, maxw=820) +
               neon(935, 800, "OPEN", 64, "Monoton", PINK, spacing=6, maxw=290) +
               neon(935, 850, "24 HRS", 38, "Righteous", TEAL, spacing=6, maxw=290) +
               diner_mug(170, 755, 1.0, WHITE, CHERRY))


@add("Rockin' Around the Coffee Pot", "Jukebox arch")
def d25():
    arch = (f'<path d="M262,712 V360 a338,338 0 0 1 676,0 V712 z" fill="{INK}"/>'
            f'<path d="M250,700 V360 a350,350 0 0 1 700,0 V700 z" fill="{CHROME2}" stroke="{INK}" stroke-width="12"/>' +
            stripes(290, 40, 620, 660, [PINK, MUSTARD, TEAL, CHERRY, ORANGE, PINK, TEAL], clip='<path d="M290,700 V360 a310,310 0 0 1 620,0 V700 z"/>', gap=0.18) +
            f'<path d="M290,700 V360 a310,310 0 0 1 620,0 V700 z" fill="none" stroke="{INK}" stroke-width="8"/>'
            f'<circle cx="600" cy="420" r="210" fill="{CREAM}" stroke="{INK}" stroke-width="10"/>')
    notes = "".join(f'<text x="{x}" y="{y}" font-size="90" fill="{c}" stroke="{INK}" stroke-width="4" text-anchor="middle">♪</text>'
                    for x, y, c in ((160, 300, TEAL), (1040, 260, PINK), (130, 560, MUSTARD), (1070, 560, CHERRY)))
    return svg(arch + notes + diner_pot(480, 250, 0.95, CHERRY) +
               retro(600, 830, "Rockin' Around", 150, "Pacifico", CHERRY, depth=14, maxw=1080) +
               retro(600, 950, "THE COFFEE POT", 100, "Bungee", TEAL, depth=12, maxw=1000, spacing=4))
