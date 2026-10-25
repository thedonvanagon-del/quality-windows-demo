"""Make the art and fit it to the mug's print area.

Pillow is the one dependency, for placing the art on the wrap."""

import base64
import io
import json
import urllib.error
import urllib.request

from PIL import Image

from .config import PRINT_HEIGHT, PRINT_WIDTH
from .http import ApiError, USER_AGENT

IMAGES_URL = "https://api.openai.com/v1/images/generations"


def generate(cfg, prompt):
    """Ask OpenAI for one landscape image and return it as PNG bytes."""
    if not cfg.openai_api_key:
        raise SystemExit("OPENAI_API_KEY has to be set to generate art (or pass --image).")
    payload = {"model": cfg.image_model, "prompt": prompt, "size": "1536x1024",
               "quality": "high", "n": 1}
    request = urllib.request.Request(
        IMAGES_URL, data=json.dumps(payload).encode(), method="POST",
        headers={"Authorization": f"Bearer {cfg.openai_api_key}",
                 "Content-Type": "application/json", "User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=300) as resp:
            reply = json.load(resp)
    except urllib.error.HTTPError as err:
        raise ApiError(f"image generation returned {err.code}: {err.read()[:400]!r}") from None
    return base64.b64decode(reply["data"][0]["b64_json"])


def fit_to_mug(png_bytes):
    """Center the art on a white 2700x1120 canvas, as tall as the margin allows.
    The mug is white and dye-sublimation leaves white unprinted, so a white
    background costs nothing. Returns PNG bytes."""
    art = Image.open(io.BytesIO(png_bytes))
    art = art.convert("RGBA")
    margin = 40
    scale = min((PRINT_HEIGHT - 2 * margin) / art.height, (PRINT_WIDTH - 2 * margin) / art.width)
    art = art.resize((round(art.width * scale), round(art.height * scale)), Image.LANCZOS)
    canvas = Image.new("RGB", (PRINT_WIDTH, PRINT_HEIGHT), "white")
    canvas.paste(art, ((PRINT_WIDTH - art.width) // 2, (PRINT_HEIGHT - art.height) // 2), art)
    out = io.BytesIO()
    canvas.save(out, "PNG")
    return out.getvalue()
