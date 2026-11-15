"""Narrate a meditation with the open-source Kokoro voice model, over soft wave sound.

Usage:
  python3 voice.py --models DIR --script ../2026-11-15.script.json \
      --out-audio narration.wav --out-captions cues.json [--voice af_heart] [--speed 0.9]

--script is a JSON list of [line, seconds of silence after it].
--voice is one Kokoro voice, or a blend like "af_heart:0.5,af_nicole:0.5".

DIR must hold kokoro-v1.0.onnx and voices-v1.0.bin, from
https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0
Needs: pip install kokoro-onnx soundfile

Each line is spoken on its own, then placed on a timeline with the pause that
follows it. The caption cues are written from where each line actually lands,
so compose.py --captions lines up with the voice.
"""
import argparse
import json

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

GAP_SCALE = 1.0
LEAD_IN = 1.5      # seconds of waves before the first word
TAIL = 3.0         # seconds of waves after the last word


def trim(x, sr, thresh=0.01, pad=0.06):
    idx = np.where(np.abs(x) > thresh)[0]
    if len(idx) == 0:
        return x
    a = max(0, idx[0] - int(pad * sr))
    b = min(len(x), idx[-1] + int(pad * sr))
    return x[a:b]


def wave_bed(n, sr, seed=3):
    """Soft surf: low-passed noise that swells and recedes every several seconds."""
    rng = np.random.default_rng(seed)
    noise = rng.standard_normal(n).astype(np.float32)
    spec = np.fft.rfft(noise)
    f = np.fft.rfftfreq(n, 1 / sr)
    shape = 1 / (1 + (f / 500.0) ** 2) * (f / (f + 40.0))     # brownish, no rumble
    low = np.fft.irfft(spec * shape, n)
    hiss = np.fft.irfft(spec * (1 / (1 + (f / 3500.0) ** 4)) * (f / (f + 900.0)), n)   # foam fizz
    t = np.arange(n) / sr
    swell = 0.5 + 0.5 * np.sin(2 * np.pi * t / 8.0 - 1.2)
    swell2 = 0.5 + 0.5 * np.sin(2 * np.pi * t / 13.0 + 0.7)
    env = 0.35 + 0.65 * (0.65 * swell ** 2 + 0.35 * swell2)
    bed = low / np.abs(low).max() * env + 0.25 * hiss / np.abs(hiss).max() * env ** 3
    return (bed / np.abs(bed).max()).astype(np.float32)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", required=True)
    ap.add_argument("--script", required=True)
    ap.add_argument("--voice", default="af_heart")
    ap.add_argument("--speed", type=float, default=0.9)
    ap.add_argument("--out-audio", required=True)
    ap.add_argument("--out-captions", required=True)
    a = ap.parse_args()

    k = Kokoro(f"{a.models}/kokoro-v1.0.onnx", f"{a.models}/voices-v1.0.bin")
    LINES = [tuple(x) for x in json.load(open(a.script))]
    mix = [(p.split(":")[0], float(p.split(":")[1]) if ":" in p else 1.0) for p in a.voice.split(",")]
    style = sum(k.get_voice_style(name) * w for name, w in mix)

    clips, sr = [], None
    for text, _ in LINES:
        samples, sr = k.create(text, voice=style, speed=a.speed, lang="en-us")
        clips.append(trim(np.asarray(samples, np.float32), sr))

    gaps = [g * GAP_SCALE for _, g in LINES]
    cues, pos = [], LEAD_IN
    total = LEAD_IN + sum(len(c) / sr + gap for c, gap in zip(clips, gaps)) + TAIL
    voice = np.zeros(int(total * sr) + 1, np.float32)
    for clip, (text, _), gap in zip(clips, LINES, gaps):
        i = int(pos * sr)
        voice[i:i + len(clip)] += clip
        end = pos + len(clip) / sr
        # hold the caption a beat past the last word, but never into the next line
        cues.append({"start": round(pos - 0.15, 2), "end": round(end + min(0.6, gap * 0.6) + 0.15, 2), "text": text})
        pos = end + gap
    for cur, nxt in zip(cues, cues[1:]):
        cur["end"] = min(cur["end"], nxt["start"])

    voice = voice / np.abs(voice).max() * 0.85
    bed = wave_bed(len(voice), sr) * 0.16
    fade = int(1.5 * sr)
    bed[:fade] *= np.linspace(0, 1, fade)
    mix = np.clip(voice + bed, -1, 1)
    sf.write(a.out_audio, mix, sr)
    json.dump(cues, open(a.out_captions, "w"), indent=1)
    print(f"{total:.1f} seconds")


if __name__ == "__main__":
    main()
