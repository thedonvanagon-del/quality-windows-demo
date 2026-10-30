# video-studio

Storyboard JSON in, finished MP4 out. This is the engine behind the `video-producer` agent in `.claude/agents/`.

## Setup

Needs `ffmpeg`, Python 3.10+, and Playwright with Chromium.

```bash
pip install playwright
# Locally, also: playwright install chromium
# In the cloud container Chromium is already at /opt/pw-browsers/chromium and gets picked up automatically.
# Override with CHROMIUM_PATH=/path/to/chrome.
```

## Use

```bash
python3 studio.py build examples/storyboard.example.json   # MP4 + SRT + thumbnail in ./out
python3 studio.py build examples/how-coffee-is-roasted.json --format 9:16   # same storyboard, other aspect ratio
python3 studio.py lint  examples/storyboard.example.json   # health-claim wording check
python3 studio.py reframe in.mp4 out.mp4 --format 9:16     # footage to vertical/square
python3 studio.py contact out/video.mp4 out/sheet.png      # contact sheet for review
```

Or in Claude Code: ask for a video and the `video-producer` agent runs the whole workflow.

## What it does

| Stage | How |
|---|---|
| Motion graphics scenes | HTML/CSS per scene, animations seeked frame by frame in headless Chromium, encoded with x264 |
| Footage scenes | ffmpeg trim, fill-crop to target format, optional text overlay |
| Transitions | `xfade` crossfade between scenes |
| Audio | voiceover + music with sidechain ducking, fade out, loudnorm to -14 LUFS |
| Sound design | `"audio": {"sfx": true}` synthesises whooshes, pops, bean-crack rolls, ticks, plops, chimes and a roaster-drum bed, timed to the scenes (`sound.py`). `studio.py sound <storyboard> <video> <out>` adds it to a finished render without re-rendering. |
| Captions | lower-third burned into the scene, plus an `.srt` sidecar |
| Copy check | blocks flagged health-claim words unless `--force` |

Brand assets: `python3 sync_brand.py /path/to/buddhabeans-theme` copies the Brothers and IBM Plex Mono fonts, the bag photo, and ink and cream versions of the logo and mascot into `brands/buddhabeans/assets/`. That folder is git-ignored because this repo is public. Without it, scenes fall back to system fonts and no images.

`python3 studio.py still <storyboard> --t 3` writes one PNG per scene for quick look-dev without a full render.

Formats: `9:16`, `16:9`, `1:1`, `4:5`. Scene types: `logo`, `title`, `beans`, `bullets`, `pop`, `roastline`, `photo`, `quote`, `image`, `clip`, `outro`. The field list is in `.claude/skills/video-storyboard/SKILL.md`.

## Speed

Motion graphics render at roughly 10 to 12 seconds per second of output on a 4-core container. Drop `fps` to 24 for drafts. Masters come out around 43MB for 50 seconds because of the paper grain; re-encode with `-crf 26` for sharing (about 14MB).

## Not included

- **Voiceover generation.** No TTS engine is bundled. Pass a recording in `audio.voiceover`.
- **Music.** Supply licensed tracks. The built-in sound design is effects and a quiet bed, not a song.
- **Generated footage.** Nothing here creates AI video. For cinematic generated clips use a tool like Higgsfield, then cut the clips in with `clip` scenes.
- **Auto-captions from speech.** Captions come from the `caption` field per scene, not transcription.

## Brand

`brands/buddhabeans.json` holds colors, font names, and voice notes. The scene themes live in `scenes.py`. Add another brand by dropping a new JSON file next to it and setting `"brand"` in the storyboard.
