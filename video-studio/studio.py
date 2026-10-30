#!/usr/bin/env python3
"""video-studio: storyboard JSON in, finished MP4 out.

Scenes are either HTML motion graphics (rendered frame by frame with
Playwright) or real footage (trimmed and reframed with ffmpeg). Scenes are
joined with crossfades, mixed with voiceover and ducked music, loudness
normalised, and shipped with an SRT and a thumbnail.

    python3 studio.py build examples/storyboard.example.json
    python3 studio.py lint  examples/storyboard.example.json
    python3 studio.py reframe in.mp4 out.mp4 --format 9:16
    python3 studio.py contact in.mp4 sheet.png
"""
import argparse
import html
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import scenes
import sound

HERE = Path(__file__).resolve().parent
# Cloud containers ship a Chromium that the pip package may not match; use it when present.
CHROMIUM = os.environ.get("CHROMIUM_PATH") or (
    "/opt/pw-browsers/chromium" if Path("/opt/pw-browsers/chromium").exists() else None)
FORMATS = {"9:16": (1080, 1920), "16:9": (1920, 1080), "1:1": (1080, 1080), "4:5": (1080, 1350)}

# Wellness copy rules. Anything here is a flag, not a hard block.
RISKY = [
    r"\bcures?\b", r"\btreats?\b", r"\bheals?\b", r"\bdiagnos\w*", r"\bprevents?\b",
    r"\banxiety\b", r"\bdepression\b", r"\bpain\b", r"\binsomnia\b", r"\bcancer\b",
    r"\bFDA[- ]approved\b", r"\bguarantee\w*", r"\bmiracle\b", r"\bclinically proven\b",
]


def run(cmd, **kw):
    r = subprocess.run([str(c) for c in cmd], capture_output=True, text=True, **kw)
    if r.returncode:
        sys.exit(f"command failed: {' '.join(map(str, cmd))}\n{r.stderr[-2000:]}")
    return r


def probe_duration(path):
    r = run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path])
    return float(r.stdout.strip())


# ---------------------------------------------------------------- brand / lint

def load_brand(sb):
    name = sb.get("brand", "buddhabeans")
    p = HERE / "brands" / f"{name}.json"
    if not p.exists():
        sys.exit(f"brand file not found: {p}")
    brand = json.loads(p.read_text())
    brand["_dir"] = str(p.parent / name)
    return brand


def scene_text(scene):
    parts = [scene.get(k, "") for k in ("text", "sub", "caption", "attribution", "eyebrow", "burst", "note")]
    parts += scene.get("bullets", []) + scene.get("labels", [])
    return " ".join(p for p in parts if p)


def lint(sb):
    hits = []
    for i, sc in enumerate(sb["scenes"], 1):
        txt = scene_text(sc)
        for pat in RISKY:
            for m in re.finditer(pat, txt, re.I):
                hits.append((i, m.group(0), txt))
    for i, word, txt in hits:
        print(f"  scene {i}: '{word}' in: {txt[:80]}")
    if not hits:
        print("  clean")
    return hits


# ---------------------------------------------------------------- HTML scenes

def render_html_scene(sc, brand, w, h, fps, out, tmp):
    from playwright.sync_api import sync_playwright  # imported late: only HTML scenes need it
    frames = Path(tmp) / f"frames_{out.stem}"
    frames.mkdir()
    page_file = Path(tmp) / f"{out.stem}.html"
    page_file.write_text(scenes.build_html(sc, brand, w, h))
    n = int(round(sc["duration"] * fps))
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROMIUM) if CHROMIUM else p.chromium.launch()
        pg = b.new_page(viewport={"width": w, "height": h})
        pg.goto(f"file://{page_file}")
        pg.wait_for_timeout(150)
        for i in range(n):
            ms = i * 1000 / fps
            pg.evaluate("t=>document.getAnimations().forEach(a=>{a.pause();a.currentTime=t})", ms)
            pg.screenshot(path=str(frames / f"{i:05d}.png"))
        b.close()
    run(["ffmpeg", "-y", "-framerate", fps, "-i", frames / "%05d.png", "-c:v", "libx264",
         "-pix_fmt", "yuv420p", "-crf", "17", "-preset", "medium", out])
    shutil.rmtree(frames)


def render_clip_scene(sc, w, h, fps, out):
    """Trim footage, fill the frame (crop), match fps. Source audio is dropped; the mix adds sound."""
    ss = sc.get("start", 0)
    vf = f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},fps={fps},setsar=1"
    if sc.get("text"):
        vf += (f",drawtext=text='{sc['text'].replace(chr(39), '')}':fontcolor=white:fontsize={int(64*w/1080)}"
               f":x=(w-text_w)/2:y=h*0.78:box=1:boxcolor=black@0.5:boxborderw=24")
    run(["ffmpeg", "-y", "-ss", ss, "-t", sc["duration"], "-i", sc["clip"], "-an", "-vf", vf,
         "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "17", out])


# ---------------------------------------------------------------- assembly

def join_scenes(paths, durs, trans, out, fps):
    """Chain xfade. With one scene, copy through."""
    if len(paths) == 1:
        shutil.copy(paths[0], out)
        return
    inputs = []
    for p in paths:
        inputs += ["-i", p]
    chain, last, acc = [], "[0:v]", durs[0]
    for i in range(1, len(paths)):
        off = round(acc - trans, 3)
        tag = f"[v{i}]"
        chain.append(f"{last}[{i}:v]xfade=transition=fade:duration={trans}:offset={off}{tag}")
        last = tag
        acc = acc + durs[i] - trans
    run(["ffmpeg", "-y", *inputs, "-filter_complex", ";".join(chain), "-map", last,
         "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "17", "-r", fps, out])
    return acc


def mix_audio(video, out, total, audio_cfg):
    vo, music = audio_cfg.get("voiceover"), audio_cfg.get("music")
    vol = audio_cfg.get("music_volume", 0.18)
    if not (vo or music):
        shutil.copy(video, out)
        return
    ins, fc = ["-i", video], []
    if vo and music:
        ins += ["-i", vo, "-stream_loop", "-1", "-i", music]
        fc = [f"[2:a]volume={vol}[m]", "[1:a]asplit[vo][sc]",
              "[m][sc]sidechaincompress=threshold=0.04:ratio=8:attack=20:release=400[duck]",
              "[vo][duck]amix=inputs=2:normalize=0[mix]"]
    elif vo:
        ins += ["-i", vo]
        fc = ["[1:a]anull[mix]"]
    else:
        ins += ["-stream_loop", "-1", "-i", music]
        fc = [f"[1:a]volume={vol * 2.5}[mix]"]
    fc.append(f"[mix]afade=t=out:st={max(total - 1.5, 0)}:d=1.5,loudnorm=I=-14:TP=-1.5:LRA=11,alimiter=limit=0.8:level=false[a]")
    run(["ffmpeg", "-y", *ins, "-filter_complex", ";".join(fc), "-map", "0:v", "-map", "[a]",
         "-t", round(total, 3), "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", out])


def write_srt(scenes, starts, path):
    def ts(s):
        return f"{int(s // 3600):02}:{int(s % 3600 // 60):02}:{int(s % 60):02},{int(s % 1 * 1000):03}"
    lines, n = [], 0
    for i, (sc, st) in enumerate(zip(scenes, starts)):
        if sc.get("caption"):
            n += 1
            end = st + sc["duration"] - 0.1
            if i + 1 < len(starts):  # crossfades overlap scenes; end before the next cue begins
                end = min(end, starts[i + 1] + 0.25 - 0.05)
            lines += [str(n), f"{ts(st + 0.25)} --> {ts(end)}", sc["caption"], ""]
    if n:
        path.write_text("\n".join(lines))
    return n


# ---------------------------------------------------------------- commands

def cmd_build(a):
    sb = json.loads(Path(a.storyboard).read_text())
    brand = load_brand(sb)
    fmt = a.format or sb.get("format", "9:16")
    w, h = FORMATS[fmt]
    fps = sb.get("fps", 30)
    trans = sb.get("transition", 0.5)
    out_dir = Path(a.out or HERE / "out")
    out_dir.mkdir(parents=True, exist_ok=True)
    name = re.sub(r"[^a-z0-9]+", "-", sb.get("title", "video").lower()).strip("-")
    if a.format:
        name += "-" + fmt.replace(":", "x")

    print("copy check:")
    if lint(sb) and not a.force:
        sys.exit("fix the flagged copy, or rerun with --force")

    with tempfile.TemporaryDirectory(prefix="vstudio_") as tmp:
        paths, durs = [], []
        for i, sc in enumerate(sb["scenes"], 1):
            p = Path(tmp) / f"scene_{i:02}.mp4"
            print(f"scene {i}/{len(sb['scenes'])}: {sc.get('type', 'title')} ({sc['duration']}s)")
            if sc.get("type") == "clip":
                render_clip_scene(sc, w, h, fps, p)
            else:
                render_html_scene(sc, brand, w, h, fps, p, tmp)
            paths.append(p)
            durs.append(float(sc["duration"]))

        silent = Path(tmp) / "joined.mp4"
        total = join_scenes(paths, durs, trans, silent, fps) or durs[0]
        final = out_dir / f"{name}.mp4"
        audio = dict(sb.get("audio", {}))
        if audio.get("sfx") and not audio.get("music"):
            wav = Path(tmp) / "sfx.wav"
            sound.write_wav(sound.score(sb, total), wav)
            audio.update(music=str(wav), music_volume=0.4)  # music-only path applies x2.5 -> unity gain
        mix_audio(silent, final, total, audio)

        starts, acc = [], 0.0
        for d in durs:
            starts.append(acc)
            acc += d - trans
        srt = out_dir / f"{name}.srt"
        n = write_srt(sb["scenes"], starts, srt)
        run(["ffmpeg", "-y", "-ss", min(1.0, total / 2), "-i", final, "-frames:v", 1,
             out_dir / f"{name}.jpg"])
    print(f"\ndone: {final}  ({total:.1f}s, {w}x{h}, {fps}fps)")
    print(f"thumbnail: {out_dir / (name + '.jpg')}" + (f"\ncaptions: {srt}" if n else ""))


def cmd_still(a):
    """One PNG per scene at time --t, for fast look-dev."""
    from playwright.sync_api import sync_playwright
    sb = json.loads(Path(a.storyboard).read_text())
    brand = load_brand(sb)
    w, h = FORMATS[a.format or sb.get("format", "9:16")]
    out = Path(a.out or HERE / "out" / "stills")
    out.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="vstudio_") as tmp, sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROMIUM) if CHROMIUM else p.chromium.launch()
        pg = b.new_page(viewport={"width": w, "height": h})
        for i, sc in enumerate(sb["scenes"], 1):
            if sc.get("type") == "clip":
                continue
            f = Path(tmp) / f"s{i}.html"
            f.write_text(scenes.build_html(sc, brand, w, h))
            pg.goto(f"file://{f}")
            pg.wait_for_timeout(200)
            t = min(a.t, sc["duration"] - 0.05) * 1000
            pg.evaluate("t=>document.getAnimations().forEach(a=>{a.pause();a.currentTime=t})", t)
            pg.screenshot(path=str(out / f"scene_{i:02}.png"))
        b.close()
    print(f"stills in {out}")


def cmd_sound(a):
    """Add the synthesised sound design to a video that is already rendered (video stream is copied)."""
    sb = json.loads(Path(a.storyboard).read_text())
    total = probe_duration(a.video)
    with tempfile.TemporaryDirectory(prefix="vstudio_") as tmp:
        wav = Path(tmp) / "sfx.wav"
        sound.write_wav(sound.score(sb, total), wav)
        mix_audio(Path(a.video), Path(a.out), total, {"music": str(wav), "music_volume": 0.4})
    print(f"wrote {a.out}")


def cmd_lint(a):
    sb = json.loads(Path(a.storyboard).read_text())
    sys.exit(1 if lint(sb) else 0)


def cmd_reframe(a):
    w, h = FORMATS[a.format]
    # blurred, scaled copy fills the frame; sharp copy sits on top at full width/height fit
    fc = (f"[0:v]split[bg][fg];[bg]scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},"
          f"boxblur=30:5[b];[fg]scale={w}:{h}:force_original_aspect_ratio=decrease[f];"
          f"[b][f]overlay=(W-w)/2:(H-h)/2,setsar=1[v]")
    run(["ffmpeg", "-y", "-i", a.src, "-filter_complex", fc, "-map", "[v]", "-map", "0:a?",
         "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", a.dst])
    print(f"wrote {a.dst}")


def cmd_contact(a):
    d = probe_duration(a.src)
    run(["ffmpeg", "-y", "-i", a.src, "-vf",
         f"fps=8/{d:.2f},scale=270:-1,tile=4x2:padding=6:color=black", "-frames:v", 1, a.dst])
    print(f"wrote {a.dst}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build"); b.add_argument("storyboard"); b.add_argument("--out")
    b.add_argument("--format", choices=FORMATS, help="override storyboard format")
    b.add_argument("--force", action="store_true", help="ship even if copy lint flags words")
    b.set_defaults(fn=cmd_build)
    st = sub.add_parser("still"); st.add_argument("storyboard"); st.add_argument("--t", type=float, default=2.5)
    st.add_argument("--format", choices=FORMATS); st.add_argument("--out"); st.set_defaults(fn=cmd_still)
    so = sub.add_parser("sound"); so.add_argument("storyboard"); so.add_argument("video"); so.add_argument("out")
    so.set_defaults(fn=cmd_sound)
    l = sub.add_parser("lint"); l.add_argument("storyboard"); l.set_defaults(fn=cmd_lint)
    r = sub.add_parser("reframe"); r.add_argument("src"); r.add_argument("dst")
    r.add_argument("--format", default="9:16", choices=FORMATS); r.set_defaults(fn=cmd_reframe)
    c = sub.add_parser("contact"); c.add_argument("src"); c.add_argument("dst"); c.set_defaults(fn=cmd_contact)
    a = ap.parse_args()
    a.fn(a)


if __name__ == "__main__":
    main()
