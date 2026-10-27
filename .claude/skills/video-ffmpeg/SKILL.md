---
name: video-ffmpeg
description: ffmpeg recipes for editing video the studio doesn't cover directly. Use for cuts, speed changes, audio fixes, GIFs, platform exports, and format conversion.
---

# ffmpeg recipes

All commands assume `ffmpeg` 6.x with libx264, libx265, libvpx-vp9, aac, and libopus. Add `-y` to overwrite.

**Trim (re-encoded, frame accurate)**
`ffmpeg -ss 00:00:05 -t 8 -i in.mp4 -c:v libx264 -crf 18 -c:a aac out.mp4`

**Join clips with identical codec and size**
`printf "file 'a.mp4'\nfile 'b.mp4'\n" > list.txt && ffmpeg -f concat -safe 0 -i list.txt -c copy out.mp4`

**Speed up 1.25x**
`ffmpeg -i in.mp4 -filter_complex "[0:v]setpts=PTS/1.25[v];[0:a]atempo=1.25[a]" -map "[v]" -map "[a]" out.mp4`

**Loudness to social standard (-14 LUFS)**
`ffmpeg -i in.mp4 -af loudnorm=I=-14:TP=-1.5:LRA=11 -c:v copy out.mp4`

**Burn in an SRT**
`ffmpeg -i in.mp4 -vf "subtitles=in.srt:force_style='FontName=Inter,FontSize=18,Outline=2'" out.mp4`

**Vertical from landscape with blurred sides**
`python3 video-studio/studio.py reframe in.mp4 out.mp4 --format 9:16`

**Web-friendly export (small, fast start)**
`ffmpeg -i in.mp4 -c:v libx264 -crf 23 -preset slow -movflags +faststart -c:a aac -b:a 128k out.mp4`

**WebM for site heroes**
`ffmpeg -i in.mp4 -c:v libvpx-vp9 -crf 33 -b:v 0 -an out.webm`

**GIF (two-pass palette)**
`ffmpeg -i in.mp4 -vf "fps=12,scale=540:-1:flags=lanczos,palettegen" p.png && ffmpeg -i in.mp4 -i p.png -filter_complex "fps=12,scale=540:-1:flags=lanczos[x];[x][1:v]paletteuse" out.gif`

**Poster frame**
`ffmpeg -ss 2 -i in.mp4 -frames:v 1 poster.jpg`

**Inspect**
`ffprobe -v error -show_entries stream=codec_name,width,height,r_frame_rate,duration -of compact in.mp4`

## Gotchas

- `xfade` needs matching size, fps, and pixel format on every input. The studio normalises these. Hand-built chains must too.
- `-c copy` cuts on keyframes only. Re-encode when you need exact frames.
- Phone footage can be rotated by metadata. Check with ffprobe before cropping.
- Always set `-pix_fmt yuv420p` for H.264 that has to play in browsers and phones.
