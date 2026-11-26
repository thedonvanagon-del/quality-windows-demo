from toon import *

D = []
EST = ("EST.", "2018")


def add(pun, style):
    def wrap(fn):
        D.append((pun, style, fn()))
        return fn
    return wrap


def sparkles(p, spots, outline=True):
    return "".join((outline_sparkle(x, y, r, p["ink"], 6) if outline else sparkle(x, y, r, p["ink"])) for x, y, r in spots)


def groovy(x, y, s, size, p, font="Bagel", maxw=1060, color=None, shadow=None):
    return text(x, y, s, size, font, color or p["ink"], maxw=maxw, shadow=shadow or p["accent"], depth=7, sw=2)


# ---- layouts ----

def badge(p, top, bottom, char, est=True, bottom_font="Slab", sub=None):
    g = arc(600, 560, 430, top, min(96, 1120 / (0.74 * len(top))), "Slab", p["ink"], spacing=6)
    g += char
    if est:
        g += text(230, 730, EST[0], 54, "Slab", p["ink"]) + text(970, 730, EST[1], 54, "Slab", p["ink"])
    g += sparkles(p, ((215, 470, 30), (985, 470, 30), (300, 330, 18), (900, 330, 18)))
    g += text(600, 935, bottom, 64, bottom_font, p["ink"], maxw=1000, spacing=3)
    if sub:
        g += text(600, 990, sub, 34, "Slab", p["accent"], spacing=4)
    return svg(g)


def checker_card(p, lines, char, size=128, font="Bagel", extra=""):
    card = (f'<rect x="72" y="72" width="1068" height="868" rx="70" fill="{p["ink"]}"/>' +
            checker(60, 60, 1068, 868, 76, p["peach"], p["paper"], f'<rect x="60" y="60" width="1068" height="868" rx="70"/>') +
            f'<rect x="60" y="60" width="1068" height="868" rx="70" fill="none" stroke="{p["ink"]}" stroke-width="10"/>')
    g = card + cloud(250, 190, 1.1, p["paper"], p["ink"]) + extra
    y0 = 520 - (len(lines) - 1) * size * 0.5
    for i, l in enumerate(lines):
        g += groovy(330, y0 + i * size * 1.0, l, size, p, font, maxw=460)
    g += char
    return svg(g)


def stamp(p, top, bottom, char, corner="5¢"):
    g = stamp_frame(170, 40, 860, 920, p)
    g += text(600, 200, top, 124, "Bebas", p["ink"], maxw=740, spacing=6)
    g += f'<line x1="250" y1="230" x2="950" y2="230" stroke="{p["ink"]}" stroke-width="6"/>'
    g += char
    g += f'<line x1="250" y1="790" x2="950" y2="790" stroke="{p["ink"]}" stroke-width="6"/>'
    g += text(600, 880, bottom, 110, "Bebas", p["ink"], maxw=740, spacing=6)
    g += text(270, 300, EST[0], 40, "Bebas", p["ink"], spacing=3) + text(930, 300, EST[1], 40, "Bebas", p["ink"], spacing=3)
    g += text(920, 760, corner, 54, "Bebas", p["ink"])
    return svg(g)


def groovy_bottom(p, small, big, char, spots=None, big2=None):
    g = char + sparkles(p, spots or ((230, 200, 34), (970, 170, 28), (1010, 520, 22), (180, 520, 22)))
    if small:
        g += text(600, 770, small, 50, "Slab", p["accent"], spacing=4, maxw=900)
    g += groovy(600, 880 if big2 is None else 860, big, 128, p, maxw=1080)
    if big2:
        g += groovy(600, 975, big2, 100, p, maxw=1000)
    return svg(g)


def sunburst(p, line1, line2, char):
    cid = uid("sb")
    rays = "".join(f'<path d="M600,420 L{600+420*math.cos(math.radians(a)):.0f},{420+420*math.sin(math.radians(a)):.0f} '
                   f'L{600+420*math.cos(math.radians(a+10)):.0f},{420+420*math.sin(math.radians(a+10)):.0f} Z" fill="{p["peach"]}"/>'
                   for a in range(0, 360, 20))
    g = (f'<clipPath id="{cid}"><circle cx="600" cy="420" r="330"/></clipPath>'
         f'<circle cx="600" cy="420" r="330" fill="{p["paper"]}"/><g clip-path="url(#{cid})">{rays}</g>'
         f'<circle cx="600" cy="420" r="330" fill="none" stroke="{p["ink"]}" stroke-width="10"/>'
         f'<circle cx="600" cy="420" r="350" fill="none" stroke="{p["ink"]}" stroke-width="4" stroke-dasharray="2 16" stroke-linecap="round"/>')
    g += char + sparkles(p, ((170, 170, 34), (1030, 170, 34), (140, 600, 22), (1060, 600, 22)))
    g += groovy(600, 880, line1, 120, p, maxw=1080)
    if line2:
        g += text(600, 965, line2, 56, "Slab", p["accent"], spacing=5, maxw=900)
    return svg(g)


# ---- the 25 ----

@add("Brew-dolph the Red-Nosed Reindeer", "Arched badge")
def d1():
    return badge(MOCHA, "BREW-DOLPH", "THE RED-NOSED REINDEER",
                 character(600, 485, MOCHA, "bean", "walk", "grin", 0.8, hat="antlers", nose="#c8372d"))


@add("Have Yourself a Merry Little Latte", "Groovy type")
def d2():
    return groovy_bottom(XMAS, "HAVE YOURSELF A", "merry little latte",
                         character(600, 330, XMAS, "mug", "wave", "grin", 0.84, prop="scarf"))


@add("Deck the Mugs", "Checkerboard card")
def d3():
    p = PEACH
    return checker_card(p, ["deck", "the", "mugs"], character(840, 440, MOCHA, "mug", "cheer", "grin", 0.66),
                        extra=lights(560, 120, 1120, 140, 90, p))


@add("Espresso Yourself This Christmas", "Sunburst disc")
def d4():
    return sunburst(MOCHA, "espresso yourself", "THIS CHRISTMAS",
                    character(600, 400, MOCHA, "cup", "cheer", "grin", 0.6, hat="santa"))


@add("Santa's Little Helper (He's Caffeinated)", "Arched badge")
def d5():
    return badge(XMAS, "SANTA'S LITTLE HELPER", "(HE'S CAFFEINATED)",
                 character(600, 485, XMAS, "cup", "strut", "grin", 0.8, hat="santa"))


@add("Let It Brew, Let It Brew, Let It Brew", "One-color vintage stamp")
def d6():
    p = MONO("#3b2316", "#f3e6cf")
    return stamp(p, "LET IT BREW", "LET IT BREW · LET IT BREW", character(600, 505, p, "pot", "cheer", "grin", 0.68))


@add("Silent Night, Decaf Never", "Groovy type, sleepy cup")
def d7():
    p = SEPIA
    return groovy_bottom(p, "SILENT NIGHT,", "decaf never",
                         character(600, 330, p, "cup", "walk", "smirk", 0.84, lid=0.45),
                         spots=((200, 160, 30), (300, 300, 16), (980, 140, 36), (1020, 420, 18), (170, 480, 20)))


@add("Fa La La La Latte", "Checkerboard card")
def d8():
    p = XMAS
    return checker_card(p, ["fa la", "la la", "latte"], character(840, 440, p, "mug", "walk", "grin", 0.66, prop="scarf"))


@add("Holly Jolly Roast", "Arched badge")
def d9():
    p = GREEN
    return badge(p, "HOLLY JOLLY ROAST", "SMALL BATCH · BIG CHEER",
                 character(600, 485, p, "bean", "wave", "grin", 0.8, prop="scarf"))


@add("Jingle Bell Brew", "Sunburst disc")
def d10():
    return sunburst(PEACH, "jingle bell brew", "ROCKIN' SINCE 2018",
                    character(600, 400, MOCHA, "cup", "wave", "grin", 0.6, prop="scarf"))


@add("Merry Crisp-Mocha", "Groovy type, candy cane")
def d11():
    p = XMAS
    return groovy_bottom(p, None, "merry crisp-mocha",
                         character(600, 330, p, "cup", "wave", "grin", 0.84,
                                   hand_item=lambda ps: candy_cane(240, -270, p, 0, 1.0)))


@add("Sleigh All Day", "Checkerboard card")
def d12():
    p = MOCHA
    return checker_card(p, ["sleigh", "all day"], character(840, 440, p, "cup", "hold", "smile", 0.66, hat="santa",
                                                            hand_item=lambda ps: gift(0, 120, p, 1.0)))


@add("O Come All Ye Caffeinated", "One-color vintage stamp")
def d13():
    p = MONO("#22385a", "#eef0f0")
    return stamp(p, "O COME ALL YE", "CAFFEINATED", character(600, 505, p, "mug", "wave", "grin", 0.68), corner="25¢")


@add("Bean There, Wrapped That", "Groovy type, gift")
def d14():
    p = MOCHA
    return groovy_bottom(p, "BEAN THERE,", "wrapped that",
                         character(600, 330, p, "bean", "hold", "grin", 0.84, hand_item=lambda ps: gift(0, 110, XMAS, 1.0)))


@add("Nut-Crack-a-Brew", "Arched badge, top hat")
def d15():
    p = XMAS
    return badge(p, "NUT-CRACK-A-BREW", "THE TOUGHEST NUT ON THE BLOCK",
                 character(600, 530, p, "cup", "strut", "smirk", 0.72, hat="tophat"))


@add("Mistle-Toe the Line", "Sunburst disc, mistletoe")
def d16():
    p = PEACH
    return sunburst(p, "mistle-toe the line", "XOXO · EST. 2018",
                    mistletoe(600, 140, p, 1.0) + character(600, 440, MOCHA, "mug", "walk", "oh", 0.56))


@add("Frost Things First, Coffee", "Checkerboard card, earmuffs")
def d17():
    p = dict(MOCHA, peach="#d7e6ee", paper="#f4f8fa", accent="#4a7fa8")
    return checker_card(p, ["frost", "things", "first"], character(840, 440, p, "cup", "walk", "smile", 0.66, hat="earmuffs", prop="scarf"))


@add("Winter Wonder-Latte", "Arched badge, earmuffs")
def d18():
    p = SEPIA
    return badge(p, "WINTER WONDER-LATTE", "HOT · FRESH · FESTIVE",
                 character(600, 485, p, "mug", "cheer", "grin", 0.8, hat="earmuffs"))


@add("It's the Most Wonderful Brew of the Year", "Groovy type")
def d19():
    p = XMAS
    return groovy_bottom(p, "IT'S THE MOST WONDERFUL", "brew of the year",
                         character(600, 330, p, "pot", "cheer", "grin", 0.84))


@add("Bean There, Done Christmas", "One-color vintage stamp")
def d20():
    p = MONO("#5a2a1e", "#f6e9d6")
    return stamp(p, "BEAN THERE", "DONE CHRISTMAS", character(600, 505, p, "bean", "thumbs", "grin", 0.68))


@add("Brewed Awakening: Christmas Morning", "Sunburst disc, sleepy cup")
def d21():
    return sunburst(MOCHA, "brewed awakening", "CHRISTMAS MORNING",
                    character(600, 400, MOCHA, "cup", "walk", "smile", 0.6, lid=0.5))


@add("Pour Some Sugar Cookie on Me", "Checkerboard card, gingerbread")
def d22():
    p = PEACH
    return checker_card(p, ["pour some", "sugar", "cookie", "on me"],
                        character(840, 440, MOCHA, "mug", "hold", "grin", 0.66,
                                  hand_item=lambda ps: gingerbread(0, 40, p, 1.2)), size=104)


@add("Yule Need More Coffee", "Groovy type, sleepy pot")
def d23():
    p = PEACH
    return groovy_bottom(p, "YULE NEED", "more coffee",
                         character(600, 330, MOCHA, "pot", "walk", "oh", 0.84, lid=0.5))


@add("'Tis the Season to Be Caffeinated", "Arched badge")
def d24():
    p = MOCHA
    return badge(p, "'TIS THE SEASON", "TO BE CAFFEINATED",
                 character(600, 485, p, "cup", "thumbs", "grin", 0.8, hat="santa"))


@add("Rockin' Around the Coffee Pot", "Sunburst disc")
def d25():
    return sunburst(XMAS, "rockin' around", "THE COFFEE POT",
                    character(600, 400, XMAS, "pot", "strut", "grin", 0.56))
