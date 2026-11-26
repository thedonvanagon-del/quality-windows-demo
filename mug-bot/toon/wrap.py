import sys
from PIL import Image, ImageDraw
W, H = 2700, 1120


def wrap(n, out):
    canvas = Image.new("RGB", (W, H), "white")
    art = Image.open(f"art/{n:02d}.png").convert("RGBA")
    h = 1040
    art = art.resize((art.width * h // art.height, h), Image.LANCZOS)
    canvas.paste(art, ((W - art.width) // 2, (H - h) // 2), art)
    logo = Image.open("buddha-beans-logo.png").convert("RGBA")
    lw = 260
    logo = logo.resize((lw, logo.height * lw // logo.width), Image.LANCZOS)
    canvas.paste(logo, (W - 70 - lw, H - 60 - logo.height), logo)
    canvas.save(out)


if __name__ == "__main__":
    wrap(int(sys.argv[1]), sys.argv[2])
