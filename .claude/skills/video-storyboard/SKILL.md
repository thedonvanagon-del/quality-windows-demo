---
name: video-storyboard
description: Turn a video goal into a script and a studio.py storyboard JSON. Use when planning any video, short, ad, explainer, or product spot before rendering.
---

# Storyboard

## Pick the shape

| Platform | Format | Length | Hook window |
|---|---|---|---|
| TikTok / Reels / Shorts | `9:16` | 15-35s | first 2s |
| Instagram feed | `4:5` | 15-30s | first 2s |
| Site hero / email | `16:9` or `1:1` | 8-20s | first 3s |
| Wholesale explainer | `16:9` | 45-90s | first 5s |

Rough pace: one scene per 3-5 seconds. One idea per scene.

## Script in the brand voice

Direct. Specific. Laid back. Short sentences, plain verbs. Coffee copy leads with taste, smell, and feel: "bright and fruity up front, smooth cocoa at the end." CBD/CBG copy stays factual and conversational. Say what's in it and how much. Don't say what it does for your body.

Structure that works: **hook** (a taste or a question) → **2-3 specifics** → **one proof point** (real review, real origin, real roast date) → **one call to action**.

## Storyboard JSON

```json
{
  "title": "Name used for the output files",
  "brand": "buddhabeans",
  "format": "9:16",
  "fps": 30,
  "transition": 0.5,
  "scenes": [ ... ],
  "audio": {"voiceover": "path.wav", "music": "path.mp3", "music_volume": 0.18}
}
```

Scene types and their fields:

- `title`: `text`, `sub`
- `bullets`: `text` (heading), `bullets` (list, 2-4 items)
- `quote`: `text`, `attribution`. Real reviews only.
- `image`: `image` (path), `text` (optional). Slow zoom over a still.
- `clip`: `clip` (path), `start`, `text` (optional). Trims real footage and fills the frame.
- `outro`: `text`, `sub`. Adds the site URL automatically.

Every scene takes `duration` (seconds) and an optional `caption`. Captions burn in as a lower third and also export to the `.srt`.

With `n` scenes the final runtime is `sum(durations) - (n-1) * transition`.

## Done check

Before rendering: every scene earns its seconds, there is one call to action, and `studio.py lint` is clean.
