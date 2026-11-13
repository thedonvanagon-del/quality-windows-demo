"""Put the logo and title card over a background clip. Output is 1080x1920 (9:16) for Reels.

Usage:
  python3 compose.py --bg waves_loop.mp4 --logo assets/logo.jpg --out reel.mp4 \
      [--seconds 60] [--audio voiceover.m4a] [--title "Buddha Beans Morning Meditation Vol. 2"]

--bg      any video. Scaled and cropped to fill 9:16, and looped or trimmed to --seconds.
--logo    PNG or JPG. A black-on-white logo is turned into a cream-white one with a
          transparent background, so it shows on the water.
--audio   optional voiceover or music. Trimmed to --seconds, faded out at the end.
"""
import argparse
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1080, 1920
FONT = "/usr/share/fonts/X11/Type1/c0419bt_.pfb"        # Courier 10 Pitch
FONT_BOLD = "/usr/share/fonts/X11/Type1/c0583bt_.pfb"   # Courier 10 Pitch Bold
CREAM = (255, 247, 233)
LOGO_W = 720          # logo width in px
LOGO_CY = 760         # logo centre y


def load_logo(path):
    """Return an RGBA logo, cropped to its artwork. Black-on-white art becomes cream on transparent."""
    img = Image.open(path)
    if img.mode == "RGBA" and np.asarray(img)[..., 3].min() < 250:
        rgba = img
    else:
        lum = np.asarray(img.convert("L"), np.float32)
        alpha = np.clip((255 - lum) * 1.25, 0, 255).astype(np.uint8)
        rgba = Image.new("RGBA", img.size, CREAM + (0,))
        rgba.putalpha(Image.fromarray(alpha))
    box = rgba.split()[3].point(lambda a: 255 if a > 24 else 0).getbbox()
    return rgba.crop(box) if box else rgba


def tracked(draw, text, font, cx, y, fill, tracking, shadow=None):
    """Draw text centred on cx with extra letter spacing."""
    widths = [draw.textlength(ch, font=font) for ch in text]
    total = sum(widths) + tracking * (len(text) - 1)
    x = cx - total / 2
    for ch, w in zip(text, widths):
        if shadow:
            draw.text((x + 3, y + 3), ch, font=font, fill=shadow)
        draw.text((x, y), ch, font=font, fill=fill)
        x += w + tracking


def build_overlay(logo_path, lines):
    logo = load_logo(logo_path)
    logo = logo.resize((LOGO_W, round(logo.height * LOGO_W / logo.width)), Image.LANCZOS)
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))

    # soft dark scrim so the cream logo and title hold up against the bright sun and foam
    scrim = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(scrim).ellipse((40, LOGO_CY - 420, W - 40, LOGO_CY + 760), fill=(14, 20, 36, 70))
    overlay = Image.alpha_composite(overlay, scrim.filter(ImageFilter.GaussianBlur(110)))

    lx, ly = (W - logo.width) // 2, LOGO_CY - logo.height // 2
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    shadow.paste(Image.new("RGBA", logo.size, (0, 0, 0, 255)), (lx, ly), logo.split()[3])
    shadow = shadow.filter(ImageFilter.GaussianBlur(14))
    shadow.putalpha(shadow.split()[3].point(lambda a: int(a * 0.55)))
    overlay = Image.alpha_composite(overlay, shadow)
    overlay.alpha_composite(logo, (lx, ly))

    d = ImageDraw.Draw(overlay)
    y = ly + logo.height + 80
    specs = [(FONT_BOLD, 88, 10), (FONT, 66, 6), (FONT, 66, 6)]
    for line, (path, size, tr) in zip(lines, specs):
        font = ImageFont.truetype(path, size)
        tracked(d, line, font, W / 2, y, CREAM + (255,), tr, shadow=(0, 0, 0, 130))
        y += int(size * 1.35)
    return overlay


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bg", required=True)
    ap.add_argument("--logo", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--seconds", type=float, default=60)
    ap.add_argument("--audio")
    ap.add_argument("--title", default="Buddha Beans Morning Meditation Vol. 2")
    a = ap.parse_args()

    # same words as the title, broken over three lines
    lines = ["BUDDHA BEANS", "Morning Meditation", "Vol. 2"] if a.title == "Buddha Beans Morning Meditation Vol. 2" else [a.title]

    with tempfile.TemporaryDirectory() as tmp:
        ov = Path(tmp) / "overlay.png"
        build_overlay(a.logo, lines).save(ov)
        s = a.seconds
        cmd = ["ffmpeg", "-y", "-loglevel", "error", "-stream_loop", "-1", "-i", a.bg, "-loop", "1", "-i", str(ov)]
        if a.audio:
            cmd += ["-i", a.audio]
        vf = (
            f"[0:v]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},setsar=1,fps=30[bg];"
            f"[1:v]format=rgba,fade=t=in:st=0.6:d=1.2:alpha=1[ov];"
            f"[bg][ov]overlay=0:0:shortest=1,fade=t=in:st=0:d=0.8,fade=t=out:st={s-1.2}:d=1.2[v]"
        )
        cmd += ["-filter_complex", vf, "-map", "[v]"]
        if a.audio:
            cmd += ["-map", "2:a", "-af", f"afade=t=out:st={s-1.5}:d=1.5", "-c:a", "aac", "-b:a", "192k"]
        cmd += ["-t", str(s), "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
                "-movflags", "+faststart", a.out]
        subprocess.run(cmd, check=True)


if __name__ == "__main__":
    main()
