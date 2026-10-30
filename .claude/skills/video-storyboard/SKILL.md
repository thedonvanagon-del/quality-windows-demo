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

- `logo`: brand logo on a sunburst. `sub` (tagline). Use as the opener.
- `title`: `text`, `sub`
- `beans`: illustrated beans. `text`, `eyebrow`, `sub`, `from` and `to` (roast colors the beans shift between: green, yellow, light, medium, mediumdark, dark), `steam` (true for rising steam)
- `bullets`: `text` (heading), `eyebrow`, `bullets` (2-4 items), plus the bean fields above for the art beside it
- `pop`: big number with a starburst. `text` (e.g. `~385°F`), `sub`, `burst` (the word in the burst: POP!, CRACK!), `to` (bean color)
- `roastline`: a row of beans from green to dark. `text`, `labels` (5 names)
- `photo`: tilted polaroid. `image` (defaults to the bag photo), `note` (handwritten label), `text`, `bullets`
- `quote`: `text`, `attribution`. Real reviews only.
- `image`: `image` (path), full-bleed with a slow zoom
- `clip`: `clip` (path), `start`, `text` (optional). Trims real footage and fills the frame.
- `outro`: `text`. Logo, line, and the site URL.

**Print style** (`"style": "print"`, `"bpm": 120`, scene length in `beats`, hard cuts). Use it when the video should look hand-made and on brand. Scene types:

- `mascot`: laughing-Buddha cutout, `words`, `sub`, `tag`
- `slam`: giant stacked words that slap in. `words`, `accent` (index of the coloured word, gets a marker underline), `bg` (kraft, ink, coral, cream)
- `cutout`: torn, taped photo with big overlapping words and a hand-drawn arrow. `image`, `words`, `note`, `target` (where the arrow points, as fractions of the photo)
- `stack`: poster of full-width bands that slide in on the beat. `lines`
- `outro`: logo stamp, `words`, URL with marker underline

Only Brothers is used. Keep every word on screen from the logo, the catalog, or text the owner supplied.

Any scene takes `theme`: `kraft` (default, tan paper), `ink` (dark) or `coral`. Alternate them so the video doesn't feel flat.

Set `"audio": {"sfx": true}` for synthesised sound design timed to the scenes. Add `voiceover` or `music` paths to layer real audio on top.

Every scene takes `duration` (seconds) and an optional `caption`. Captions burn in as a lower third and also export to the `.srt`.

With `n` scenes the final runtime is `sum(durations) - (n-1) * transition`.

## Done check

Before rendering: every scene earns its seconds, there is one call to action, and `studio.py lint` is clean.
