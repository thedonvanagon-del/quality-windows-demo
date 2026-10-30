#!/usr/bin/env python3
"""Copy Buddha Beans brand assets out of the private theme repo into
brands/buddhabeans/assets/ (git-ignored: this repo is public, the font and logo are not ours to publish).

    python3 sync_brand.py /path/to/buddhabeans-theme

Makes: Brothers + IBM Plex Mono fonts, the bag photo, and the logo and mascot
recoloured to ink and cream on transparent backgrounds.
"""
import shutil
import sys
from pathlib import Path

from PIL import Image, ImageOps

INK, CREAM = (27, 20, 16), (243, 230, 200)
FONTS = [
    "brothersregular_regular-webfont.woff2", "brothers_medium-webfont.woff2",
    "brothersbold_bold-webfont.woff2", "brothers_superslant_regular-webfont.woff2",
    "ibm-plex-mono-400.woff2", "ibm-plex-mono-500.woff2",
]


def recolour(src, dst, rgb):
    """Black-on-white artwork in, solid colour with the ink as alpha out."""
    g = ImageOps.invert(Image.open(src).convert("L"))
    bbox = g.point(lambda v: 255 if v > 24 else 0).getbbox()
    g = g.crop(bbox)
    out = Image.new("RGBA", g.size, rgb + (0,))
    out.putalpha(g)
    out.save(dst)


def main():
    theme = Path(sys.argv[1] if len(sys.argv) > 1 else "/home/user/buddhabeans-theme") / "assets"
    out = Path(__file__).resolve().parent / "brands" / "buddhabeans" / "assets"
    out.mkdir(parents=True, exist_ok=True)
    for f in FONTS:
        shutil.copy(theme / f, out / f)
    shutil.copy(theme / "ppop_erewhon3-1.jpg", out / "bag.jpg")
    for name, src in (("logo", "1585423085.png"), ("mascot", "amp-1722274273035-onboarding-uploaded-logo.jpeg")):
        recolour(theme / src, out / f"{name}_ink.png", INK)
        recolour(theme / src, out / f"{name}_cream.png", CREAM)
    print(f"brand assets in {out}: {len(list(out.iterdir()))} files")


if __name__ == "__main__":
    main()
