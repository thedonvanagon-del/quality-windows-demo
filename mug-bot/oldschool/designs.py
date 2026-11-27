from oldschool import *

D = []


def add(pun, style):
    def wrap(fn):
        D.append((pun, style, fn()))
        return fn
    return wrap


def stars(p, spots):
    return "".join(outline_sparkle(x, y, r, p["ink"], 6) for x, y, r in spots)


# ---- layouts ----

def title_card(p, banner_txt, title, tagline, char, title2=None):
    shape = '<rect x="80" y="40" width="1040" height="920" rx="60"/>'
    vg, cid = vignette(shape, p)
    g = (f'<rect x="92" y="54" width="1040" height="920" rx="60" fill="{p["ink"]}"/>' + vg + grain(cid, p) +
         f'<rect x="80" y="40" width="1040" height="920" rx="60" fill="none" stroke="{p["ink"]}" stroke-width="12"/>'
         f'<rect x="108" y="68" width="984" height="864" rx="40" fill="none" stroke="{p["ink"]}" stroke-width="4"/>')
    g += banner(600, 135, 560, p, banner_txt, 40)
    g += title_text(600, 290, title, 118, p, maxw=940)
    if title2:
        g += title_text(600, 400, title2, 118, p, maxw=940)
    g += char + stars(p, ((190, 470, 26), (1010, 470, 26), (220, 640, 16), (980, 640, 16)))
    g += text(600, 905, tagline, 46, "Limelight", p["ink"], maxw=860, spacing=4)
    return svg(g)


def iris(p, title, sub, char, extra=""):
    cid = uid("ir")
    circle = '<circle cx="600" cy="400" r="330"/>'
    vg, vcid = vignette(circle, p)
    g = (f'<path d="M150,30 H1050 a40,40 0 0 1 40,40 V730 a40,40 0 0 1 -40,40 H150 a40,40 0 0 1 -40,-40 V70 a40,40 0 0 1 40,-40 Z '
         f'M600,70 a330,330 0 1 0 0.1,0 Z" fill="{p["ink"]}" fill-rule="evenodd"/>' + vg + grain(vcid, p) +
         f'<circle cx="600" cy="400" r="330" fill="none" stroke="{p["ink"]}" stroke-width="10"/>')
    g += extra + char
    g += title_text(600, 880, title, 110, p, maxw=1060)
    if sub:
        g += text(600, 965, sub, 46, "Limelight", p["ink"], maxw=900, spacing=5)
    return svg(g)


def film_strip(p, top, bottom, char, extra=""):
    shape = '<rect x="170" y="290" width="860" height="440"/>'
    vg, cid = vignette(shape, p)
    holes = "".join(f'<rect x="{x}" y="{y}" width="34" height="24" rx="6" fill="{p["paper"]}"/>' for x in range(40, 1170, 70) for y in (248, 752))
    g = (f'<rect x="20" y="230" width="1160" height="560" fill="{p["ink"]}"/>' + holes + vg + grain(cid, p) +
         f'<rect x="170" y="290" width="860" height="440" fill="none" stroke="{p["ink"]}" stroke-width="6"/>')
    g += extra + char
    g += title_text(600, 160, top, 120, p, maxw=1080)
    g += title_text(600, 930, bottom, 120, p, maxw=1080)
    return svg(g)


def stamp(p, top, bottom, char, corner="5¢"):
    g = stamp_frame(170, 40, 860, 920, dict(ink=p["ink"], paper=p["paper"]))
    g += text(600, 200, top, 118, "Luckiest", p["ink"], maxw=740, spacing=4)
    g += f'<line x1="250" y1="230" x2="950" y2="230" stroke="{p["ink"]}" stroke-width="6"/>'
    g += char
    g += f'<line x1="250" y1="790" x2="950" y2="790" stroke="{p["ink"]}" stroke-width="6"/>'
    g += text(600, 880, bottom, 100, "Luckiest", p["ink"], maxw=740, spacing=4)
    g += text(275, 300, "EST.", 40, "Limelight", p["ink"], spacing=3) + text(925, 300, "2018", 40, "Limelight", p["ink"], spacing=3)
    g += text(915, 760, corner, 52, "Limelight", p["ink"])
    return svg(g)


def badge(p, top, bottom, char):
    g = arc(600, 560, 430, top, min(100, 1120 / (0.78 * len(top))), "Luckiest", p["ink"], spacing=4)
    g += char
    g += text(225, 730, "EST.", 56, "Limelight", p["ink"]) + text(975, 730, "2018", 56, "Limelight", p["ink"])
    g += stars(p, ((210, 470, 30), (990, 470, 30), (300, 330, 18), (900, 330, 18)))
    g += banner(600, 920, 760, p, bottom, 50)
    return svg(g)


MONO_FILM = dict(FILM, cup=FILM["paper"], accent=FILM["ink"], shoe=FILM["ink"], sleeve=FILM["ink"], glove=FILM["paper"], mid=FILM["paper"], grey=FILM["ink"])
MONO_SEPIA = dict(SEPIA, cup=SEPIA["paper"], accent=SEPIA["ink"], shoe=SEPIA["ink"], sleeve=SEPIA["ink"], glove=SEPIA["paper"], mid=SEPIA["paper"], grey=SEPIA["ink"])


def gift_for(p):
    return lambda ps: gift(0, 120, dict(ink=p["ink"], accent=p["accent"], paper=p["cup"]), 1.0)


# ---- the 25 ----

@add("Brew-dolph the Red-Nosed Reindeer", "EST. badge")
def d1():
    return badge(FILM, "BREW-DOLPH", "THE RED-NOSED REINDEER",
                 character(600, 470, FILM, "bean", "strut", "grin", 0.74, hat="antlers", nose="#c2362b"))


@add("Have Yourself a Merry Little Latte", "Film title card")
def d2():
    p = SEPIA
    return title_card(p, "HAVE YOURSELF A", "MERRY LITTLE LATTE", "A BUDDHA BEANS HOLIDAY",
                      character(600, 585, p, "mug", "wave", "grin", 0.68, prop="scarf"))


@add("Deck the Mugs", "Film strip, string lights")
def d3():
    p = FILM
    return film_strip(p, "DECK THE MUGS", "FA LA LA LA LA",
                      character(600, 488, p, "mug", "cheer", "grin", 0.56),
                      extra=lights(180, 300, 1020, 300, 60, dict(ink=p["ink"]), 9))


@add("Espresso Yourself This Christmas", "Iris-out circle")
def d4():
    p = TWOSTRIP
    return iris(p, "ESPRESSO YOURSELF", "THIS CHRISTMAS",
                character(600, 405, p, "cup", "dance", "grin", 0.64, hat="santa"))


@add("Santa's Little Helper (He's Caffeinated)", "Film title card")
def d5():
    p = FILM
    return title_card(p, "BUDDHA BEANS PRESENTS", "SANTA'S LITTLE HELPER", "(HE'S CAFFEINATED)",
                      character(600, 585, p, "cup", "thumbs", "grin", 0.68, hat="santa"))


@add("Let It Brew, Let It Brew, Let It Brew", "One-color stamp")
def d6():
    p = MONO_SEPIA
    return stamp(p, "LET IT BREW", "LET IT BREW!", character(600, 480, p, "pot", "cheer", "grin", 0.6))


@add("Silent Night, Decaf Never", "Iris-out circle, sleepy cup")
def d7():
    p = FILM
    return iris(p, "DECAF NEVER", "SILENT NIGHT", character(600, 415, p, "cup", "hold", "smirk", 0.64, lid=0.45),
                extra=stars(p, ((430, 160, 18), (780, 150, 24), (360, 300, 12), (850, 290, 14))))


@add("Fa La La La Latte", "EST. badge")
def d8():
    p = TWOSTRIP
    return badge(p, "FA LA LA LA LATTE", "SING IT LOUD, SIP IT HOT",
                 character(600, 470, p, "mug", "dance", "grin", 0.72))


@add("Holly Jolly Roast", "Film title card")
def d9():
    p = TWOSTRIP
    return title_card(p, "BUDDHA BEANS PRESENTS", "HOLLY JOLLY ROAST", "SMALL BATCH · BIG CHEER",
                      character(600, 585, p, "bean", "cheer", "grin", 0.68, prop="scarf"))


@add("Jingle Bell Brew", "Film strip")
def d10():
    p = SEPIA
    return film_strip(p, "JINGLE BELL", "BREW!", character(600, 488, p, "cup", "strut", "grin", 0.56, prop="scarf"))


@add("Merry Crisp-Mocha", "Iris-out circle, candy cane")
def d11():
    p = FILM
    return iris(p, "MERRY CRISP-MOCHA", None,
                character(600, 415, p, "cup", "wave", "grin", 0.64, hand_item=lambda ps: candy_cane(250, -290, dict(ink=p["ink"]), 0, 1.0)))


@add("Sleigh All Day", "Film title card, gift")
def d12():
    p = SEPIA
    return title_card(p, "BUDDHA BEANS PRESENTS", "SLEIGH ALL DAY", "COFFEE EDITION",
                      character(600, 585, p, "cup", "hold", "grin", 0.68, hat="santa", hand_item=gift_for(p)))


@add("O Come All Ye Caffeinated", "One-color stamp")
def d13():
    p = MONO_FILM
    return stamp(p, "O COME ALL YE", "CAFFEINATED", character(600, 480, p, "mug", "wave", "grin", 0.6), corner="25¢")


@add("Bean There, Wrapped That", "Film strip, gift")
def d14():
    p = FILM
    return film_strip(p, "BEAN THERE,", "WRAPPED THAT", character(600, 488, p, "bean", "hold", "grin", 0.56, hand_item=gift_for(p)))


@add("Nut-Crack-a-Brew", "EST. badge, top hat")
def d15():
    p = FILM
    return badge(p, "NUT-CRACK-A-BREW", "TOUGHEST NUT ON THE BLOCK",
                 character(600, 520, p, "cup", "strut", "smirk", 0.64, hat="tophat"))


@add("Mistle-Toe the Line", "Iris-out circle, mistletoe")
def d16():
    p = SEPIA
    return iris(p, "MISTLE-TOE THE LINE", "XOXO · EST. 2018",
                character(600, 435, p, "mug", "hold", "oh", 0.64),
                extra=mistletoe(600, 150, dict(ink=p["ink"]), 0.9))


@add("Frost Things First (Coffee)", "Film title card, earmuffs")
def d17():
    p = TWOSTRIP
    return title_card(p, "BUDDHA BEANS PRESENTS", "FROST THINGS FIRST", "(COFFEE, THAT IS)",
                      character(600, 585, p, "cup", "strut", "grin", 0.68, hat="earmuffs", prop="scarf"))


@add("Winter Wonder-Latte", "EST. badge, earmuffs")
def d18():
    p = SEPIA
    return badge(p, "WINTER WONDER-LATTE", "HOT · FRESH · FESTIVE",
                 character(600, 480, p, "mug", "cheer", "grin", 0.7, hat="earmuffs"))


@add("It's the Most Wonderful Brew of the Year", "Film strip")
def d19():
    p = TWOSTRIP
    return film_strip(p, "MOST WONDERFUL", "BREW OF THE YEAR", character(600, 488, p, "pot", "cheer", "grin", 0.56))


@add("Bean There, Done Christmas", "One-color stamp")
def d20():
    p = MONO_SEPIA
    return stamp(p, "BEAN THERE", "DONE CHRISTMAS", character(600, 480, p, "bean", "thumbs", "grin", 0.6))


@add("Brewed Awakening: Christmas Morning", "Iris-out circle, sleepy cup")
def d21():
    p = SEPIA
    return iris(p, "BREWED AWAKENING", "CHRISTMAS MORNING", character(600, 415, p, "cup", "strut", "smile", 0.64, lid=0.5))


@add("Pour Some Sugar Cookie on Me", "Film title card, gingerbread")
def d22():
    p = FILM
    return title_card(p, "POUR SOME", "SUGAR COOKIE", "ON ME!",
                      character(600, 585, p, "mug", "hold", "grin", 0.68,
                                hand_item=lambda ps: gingerbread(0, 50, dict(ink=p["ink"]), 1.2)))


@add("Yule Need More Coffee", "Film strip, sleepy pot")
def d23():
    p = SEPIA
    return film_strip(p, "YULE NEED", "MORE COFFEE", character(600, 488, p, "pot", "strut", "oh", 0.56, lid=0.5))


@add("'Tis the Season to Be Caffeinated", "EST. badge")
def d24():
    p = TWOSTRIP
    return badge(p, "'TIS THE SEASON", "TO BE CAFFEINATED",
                 character(600, 470, p, "cup", "thumbs", "grin", 0.72, hat="santa"))


@add("Rockin' Around the Coffee Pot", "Iris-out circle")
def d25():
    p = FILM
    return iris(p, "ROCKIN' AROUND", "THE COFFEE POT", character(600, 415, p, "pot", "dance", "grin", 0.64))
