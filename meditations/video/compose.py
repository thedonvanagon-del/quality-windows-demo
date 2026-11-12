"""Put the logo and title card over a background clip. Output is 1080x1920 (9:16) for Reels.

Usage:
  python3 compose.py --bg waves.mp4 --logo logo.png --out reel.mp4 \
      [--seconds 60] [--audio voiceover.m4a] [--title "Buddha Beans Morning Meditation Vol. 2"]

--bg      any video. Scaled and cropped to fill 9:16, and looped or trimmed to --seconds.
--logo    PNG, ideally with a transparent background. Omit it for a labeled placeholder.
--audio   optional voiceover or music. Trimmed to --seconds, faded out at the end.
"""
import argparse
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1080, 1920
FONT = "/usr/share/fonts/opentype/inter/InterDisplay-Light.otf"
FONT_BOLD = "/usr/share/fonts/opentype/inter/InterDisplay-Medium.otf"
LOGO_W = 560          # logo width in px
CENTER_Y = 880        # logo centre; a bit above middle so title sits near true centre


def tracked(draw, text, font, cx, y, fill, tracking):
    """Draw text centred on cx with extra letter spacing."""
    widths = [draw.textlength(ch, font=font) for ch in text]
    total = sum(widths) + tracking * (len(text) - 1)
    x = cx - total / 2
    for ch, w in zip(text, widths):
        draw.text((x, y), ch, font=font, fill=fill)
        x += w + tracking


def placeholder_logo():
    img = Image.new("RGBA", (600, 600), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse((10, 10, 590, 590), outline=(255, 255, 255, 230), width=8)
    f = ImageFont.truetype(FONT_BOLD, 64)
    t = "YOUR LOGO"
    d.text((300 - d.textlength(t, font=f) / 2, 270), t, font=f, fill=(255, 255, 255, 230))
    return img


def build_overlay(logo_path, title_lines):
    logo = Image.open(logo_path).convert("RGBA") if logo_path else placeholder_logo()
    scale = LOGO_W / logo.width
    logo = logo.resize((LOGO_W, round(logo.height * scale)), Image.LANCZOS)

    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))

    # soft dark scrim behind the logo and title so they hold up on bright water
    scrim = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(scrim)
    sd.ellipse((60, CENTER_Y - 560, W - 60, CENTER_Y + 700), fill=(8, 22, 34, 120))
    scrim = scrim.filter(ImageFilter.GaussianBlur(120))
    overlay = Image.alpha_composite(overlay, scrim)

    # logo with a faint shadow
    lx, ly = (W - logo.width) // 2, CENTER_Y - logo.height // 2
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    shadow.paste(Image.new("RGBA", logo.size, (0, 0, 0, 255)), (lx, ly), logo.split()[3])
    shadow = shadow.filter(ImageFilter.GaussianBlur(18))
    shadow.putalpha(shadow.split()[3].point(lambda a: int(a * 0.45)))
    overlay = Image.alpha_composite(overlay, shadow)
    overlay.alpha_composite(logo, (lx, ly))

    # title under the logo
    d = ImageDraw.Draw(overlay)
    y = ly + logo.height + 70
    big = ImageFont.truetype(FONT_BOLD, 74)
    mid = ImageFont.truetype(FONT, 58)
    sizes = [(big, 14), (mid, 10), (mid, 10)]
    for line, (font, tr) in zip(title_lines, sizes):
        tracked(d, line, font, W / 2, y, (255, 250, 240, 255), tr)
        y += font.size + 26
    return overlay


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bg", required=True)
    ap.add_argument("--logo")
    ap.add_argument("--out", required=True)
    ap.add_argument("--seconds", type=float, default=60)
    ap.add_argument("--audio")
    ap.add_argument("--title", default="Buddha Beans Morning Meditation Vol. 2")
    a = ap.parse_args()

    # "Buddha Beans" / "Morning Meditation" / "Vol. 2": same words, three lines
    words = a.title.split()
    if a.title == "Buddha Beans Morning Meditation Vol. 2":
        lines = ["BUDDHA BEANS", "Morning Meditation", "Vol. 2"]
    else:
        lines = [a.title]

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
