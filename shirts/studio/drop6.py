"""Drop 6: 25 Christmas coffee shirts (no repeats of earlier coffee lines)."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import build

def d(who, name, tpl, pal, lines, icon=None, tags=(), blurb="", **kw):
    x = dict(who=who, name=name, tpl=tpl, pal=pal, lines=list(lines), tags=list(tags), blurb=blurb, theme="Christmas Coffee", xmas=True, **kw)
    if icon: x["icon"] = icon
    return x

CT = ["christmas coffee", "coffee lover gift"]  # shared lead tags
D = [
 d("U", "All Is Calm All Is Caffeinated", "quote", "xmas_w", ["All is calm,", "all is caffeinated."], "santacup", CT + ["all is calm", "silent night shirt", "calm christmas"], "A quiet Christmas morning, with the coffee already brewed.", sub="SILENT MORNING · STRONG POUR"),
 d("U", "O Come All Ye Caffeinated", "badge", "xmas_red", ["O COME ALL YE", "CAFFEINATED"], "hot", CT + ["o come all ye", "christmas carol tee", "church christmas"], "The carol, with a coffee-house twist."),
 d("W", "O Coffee Tree", "stack", "xmas_pink", ["o", "COFFEE TREE", "how lovely are thy beans"], "beantree", CT + ["coffee tree shirt", "pink christmas", "christmas tree tee"], "Coffee does grow on trees. Ours are decorated."),
 d("U", "Deck the Halls with Coffee Beans", "badge", "xmas_w", ["DECK THE HALLS", "WITH COFFEE BEANS"], "beantree", CT + ["deck the halls", "coffee bean shirt", "christmas tree tee"], "Fa la la la, la la la... latte."),
 d("M", "Silent Morning Strong Coffee", "quote", "xmas_black", ["Silent morning,", "strong coffee."], "santacup", CT + ["silent night", "black coffee", "christmas morning"], "Before the kids wake up.", sub="CHRISTMAS MORNING RITUAL"),
 d("U", "Joy to the Pour", "sunset", "xmas_retro", ["JOY TO THE POUR", "pour over season"], "pour", CT + ["joy to the world", "pour over gift", "retro christmas"], "Retro sunset for pour-over people."),
 d("U", "12 Days of Caffeine", "stack", "xmas_red", ["the", "12 DAYS", "of caffeine"], "hot", CT + ["12 days christmas", "caffeine shirt", "funny xmas tee"], "And a latte in a pear tree."),
 d("M", "Holiday Spirit 100 Percent Espresso", "stack", "xmas_m", ["holiday spirit", "100%", "espresso"], "santacup", CT + ["espresso shirt", "holiday spirit", "funny xmas tee"], "Spirit levels: fully charged."),
 d("W", "Mistletoe and Mochas", "iconwave", "xmas_pink", ["MISTLETOE &", "MOCHAS"], "holly", CT + ["mistletoe shirt", "mocha lover", "pink christmas"], "Meet me under the mistletoe. Bring a mocha."),
 d("W", "Gingerbread Latte Season", "iconwave", "xmas_retro", ["GINGERBREAD LATTE", "SEASON"], "cookie", CT + ["gingerbread latte", "gingerbread shirt", "holiday latte"], "The best cup of the year.", pre="it's"),
 d("U", "Santa Runs on Coffee", "club", "xmas_red", ["SANTA RUNS ON", "COFFEE"], "santacup", CT + ["santa coffee", "santa shirt", "funny xmas tee"], "One night, every house. You'd need coffee too.", sub="SO DO HIS HELPERS"),
 d("M", "North Pole Coffee Co", "club", "xmas_m", ["NORTH POLE", "COFFEE CO."], "bean", CT + ["north pole shirt", "vintage christmas", "coffee roaster"], "Vintage roaster crest. Sleigh delivered.", sub="SMALL BATCH · SLEIGH DELIVERED", est="1823"),
 d("U", "Reindeer Fuel", "badge", "xmas_retro", ["REINDEER", "FUEL"], "reindeercup", CT + ["reindeer shirt", "reindeer fuel", "cute christmas"], "What really gets the sleigh off the ground."),
 d("W", "Cookies for Santa Coffee for Mom", "quote", "xmas_pink", ["Cookies for Santa,", "coffee for mom."], "cookie", CT + ["christmas mom", "mom coffee shirt", "xmas gift for mom"], "Everyone gets a treat on Christmas Eve.", sub="CHRISTMAS EVE RULES"),
 d("F", "Christmas Morning Coffee Club", "club", "xmas_red", ["CHRISTMAS MORNING", "COFFEE CLUB"], "santacup", CT + ["family matching", "christmas pajamas", "christmas morning"], "For the family photo in pajamas.", sub="PAJAMAS REQUIRED"),
 d("W", "Up All Night Wrapping", "quote", "xmas_w", ["Up all night wrapping.", "Fueled by espresso."], "gift", CT + ["christmas mom", "gift wrapping", "funny mom shirt"], "Santa's busiest helper.", sub="SANTA'S BUSIEST HELPER"),
 d("W", "Dear Santa Just Bring Coffee", "cup", "xmas_pink", ["dear santa,", "JUST BRING COFFEE", "I'VE BEEN GOOD-ISH"], "santacup", CT + ["dear santa shirt", "pink christmas", "funny xmas tee"], "Skip the list. One thing, please."),
 d("M", "Yule Brew", "stack", "xmas_black", ["the", "YULE BREW", "holiday roast · small batch"], "bean", CT + ["yule shirt", "holiday roast", "coffee roaster"], "A pun on the yule log, and a nod to holiday roasts."),
 d("U", "Naughty or Nice Coffee First", "stack", "xmas_w", ["naughty or nice,", "COFFEE FIRST", "then we'll talk"], "hot", CT + ["naughty or nice", "coffee first", "funny xmas tee"], "The list can wait."),
 d("M", "Caffeinated and Lit", "club", "xmas_black", ["CAFFEINATED &", "LIT"], "bulb", CT + ["christmas lights", "lit shirt", "funny dad xmas"], "Coffee in hand, lights on the roof.", sub="COFFEE IN HAND · LIGHTS ON THE ROOF"),
 d("U", "Snow Day Coffee Club", "club", "navy", ["SNOW DAY COFFEE", "CLUB"], "snowflake", CT + ["snow day shirt", "winter coffee", "cozy winter tee"], "No plans. Full pot.", sub="NO PLANS · FULL POT"),
 d("U", "Frosted Mornings Hot Coffee", "sunset", "navy", ["FROSTED MORNINGS", "hot coffee, cold toes"], "snowflake", CT + ["winter coffee", "frosty morning", "retro winter tee"], "Retro winter sunrise."),
 d("W", "Coffee and Carols", "iconwave", "xmas_w", ["COFFEE &", "CAROLS"], "notes", CT + ["christmas carols", "caroling shirt", "choir christmas"], "Warm cup, loud singing."),
 d("U", "Grounds for Celebration", "badge", "xmas_red", ["GROUNDS FOR", "CELEBRATION"], "bean", CT + ["coffee pun shirt", "coffee grounds", "funny xmas tee"], "A coffee pun for the holiday party."),
 d("F", "Most Likely to Drink All the Coffee", "mostlikely", "xmas_red", ["drink all", "THE COFFEE"], tags=CT + ["most likely to", "family matching", "family xmas tee"], blurb="Part of the Most Likely To family set."),
]
assert len(D) == 25, len(D)

if __name__ == "__main__":
    out, rows = build("drop6", D, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "drops"))
    print(out, len(rows), "designs")
    print("max title", max(len(r["title"]) for r in rows), "min tags", min(len(r["tags"].split(",")) for r in rows))
