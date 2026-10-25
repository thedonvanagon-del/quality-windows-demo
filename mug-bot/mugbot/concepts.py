"""Coffee Christmas puns, one per mug. Each is the words on the mug plus a
hint for the picture. STYLE keeps the whole line looking like one collection,
matching the Joy to the Brew badge."""

STYLE = (
    "Ornate vintage holiday badge illustration, flat vector look. Forest green, "
    "antique gold and cream palette with burnt-orange accents. Decorative scrollwork "
    "border, holly leaves and berries, a banner carrying the exact words in clean "
    "hand-lettered type. Centered on a plain white background. No other text, no mockup."
)

# (words on the mug, picture hint)
PUNS = [
    ("Joy to the Brew", "a green paper coffee cup with a snowflake, latte art cup below the banner"),
    ("Brew-dolph the Red-Nosed Reindeer", "a reindeer with a red nose holding a steaming coffee mug in its antlers"),
    ("Have Yourself a Merry Little Latte", "a latte with a holly leaf drawn in the foam"),
    ("Deck the Mugs", "mugs hung on a garland with holly and tiny lights"),
    ("Espresso Yourself This Christmas", "a small espresso cup topped with a bow, steam curling into a star"),
    ("All I Want for Christmas Is Brew", "a stocking stuffed with coffee beans and a cinnamon stick"),
    ("Santa's Little Helper (He's Caffeinated)", "an elf in a Santa hat carrying an oversized coffee mug"),
    ("Let It Brew, Let It Brew, Let It Brew", "a falling-snow scene around a steaming French press"),
    ("Silent Night, Decaf Never", "a crescent moon over a coffee pot on a snowy rooftop"),
    ("Fa La La La Latte", "four lattes in a row, each with a different foam holiday pattern"),
    ("Holly Jolly Roast", "coffee beans mixed with holly berries in a burlap sack"),
    ("Jingle Bell Brew", "a coffee mug with a jingle bell tied to the handle with ribbon"),
    ("Merry Crisp-Mocha", "a mocha with whipped cream, a candy cane and a sprinkle of cocoa"),
    ("Sleigh All Day (Coffee Edition)", "a sleigh loaded with coffee sacks pulled by two reindeer"),
    ("O Come All Ye Caffeinated", "a crowd of mugs of different shapes lined up like a choir"),
    ("Bean There, Wrapped That", "a gift box tied with ribbon, coffee beans spilling from the lid"),
    ("Nut-Crack-a-Brew", "a nutcracker soldier holding a steaming coffee cup like a drum"),
    ("Mistle-Toe the Line, Drink Coffee", "a mug hanging under a mistletoe sprig"),
    ("Frost Things First, Coffee", "a frosted window with a coffee cup drawn in the ice crystals"),
    ("Coffee Is My Love Language, Christmas Edition", "a heart made of coffee beans wrapped in a red ribbon"),
    ("Winter Wonder-Latte", "a snowy mountain village scene reflected in a latte cup"),
    ("Hot Cocoa Who? Coffee, Please", "a mug beside a small cocoa cup that is crossed out with a ribbon"),
    ("It's the Most Wonderful Brew of the Year", "a glowing Christmas tree built from stacked coffee cups"),
    ("Bean There, Done Christmas", "a holly wreath made of coffee beans around a steaming mug"),
]


def pick(taken):
    """The first pun not already on Printify. Returns (words, hint) or None
    once every pun has a mug."""
    taken = {t.strip().lower() for t in taken}
    for words, hint in PUNS:
        if words.lower() not in taken:
            return words, hint
    return None


def prompt_for(words, hint):
    return f'{STYLE} The banner reads exactly: "{words}". Picture: {hint}.'
