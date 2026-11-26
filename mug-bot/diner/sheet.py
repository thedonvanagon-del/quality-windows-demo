import json, sys
from PIL import Image, ImageDraw, ImageFont
import os
F = os.path.join(os.path.dirname(os.path.abspath(__file__)), "node_modules", "@fontsource")
meta = json.load(open("meta.json"))
TW, TH, CAP, PAD = 600, 500, 90, 24
num_font = ImageFont.truetype(F + "/bungee/files/bungee-latin-400-normal.woff2", 40)
cap_font = ImageFont.truetype(F + "/righteous/files/righteous-latin-400-normal.woff2", 25)
sty_font = ImageFont.truetype(F + "/righteous/files/righteous-latin-400-normal.woff2", 20)


def sheet(items, out, cols=3):
    rows = (len(items) + cols - 1) // cols
    W = cols * TW + (cols + 1) * PAD
    H = rows * (TH + CAP) + (rows + 1) * PAD
    img = Image.new("RGB", (W, H), "#e6e0d4")
    d = ImageDraw.Draw(img)
    for k, m in enumerate(items):
        r, c = divmod(k, cols)
        x, y = PAD + c * (TW + PAD), PAD + r * (TH + CAP + PAD)
        d.rounded_rectangle([x, y, x + TW, y + TH + CAP], 18, fill="white")
        art = Image.open(f"art/{m['n']:02d}.png").convert("RGBA").resize((TW - 40, (TW - 40) * 1000 // 1200), Image.LANCZOS)
        img.paste(art, (x + 20, y + 20 + (TH - 40 - art.height) // 2), art)
        d.ellipse([x + 14, y + 14, x + 84, y + 84], fill="#2f5d3a")
        d.text((x + 49, y + 49), str(m["n"]), font=num_font, fill="white", anchor="mm")
        d.text((x + TW // 2, y + TH + 22), m["pun"], font=cap_font, fill="#3b2418", anchor="mm")
        d.text((x + TW // 2, y + TH + 56), m["style"], font=sty_font, fill="#7a4a2a", anchor="mm")
    img.save(out)


sheet(meta[0:9], "sheet-1-9.png")
sheet(meta[9:18], "sheet-10-18.png")
sheet(meta[18:25], "sheet-19-25.png")
print("ok")
