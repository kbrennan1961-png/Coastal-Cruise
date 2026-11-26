# Coastal Cruise media guide

The published build works by double-clicking `index.html` from `file://`.
Three.js and GLTFLoader are vendored under `js/vendor`, and the bundled radio
MP3s stay local; nothing is fetched from a server or CDN at runtime.

## Radio audio files

Put files in the `audio/` folder. `js/radiodata.js` already points every station
at these names; replace a file, reload, and that station uses it. Missing or
unplayable files leave that station silent because the old synthesized fallback
is intentionally muted.

| Station | Bundled file | Musical style |
|---|---|---|
| COASTAL FM | `audio/coastal-fm.mp3` | chill |
| CRUISE 101 | `audio/cruise-101.mp3` | cruise |
| PLAYBACK FM | `audio/playback-fm.mp3` | retro hip-hop |
| ISLAND WAVE | `audio/island-wave.mp3` | reggae |
| MOONLIGHT | `audio/moonlight.mp3` | jazz |
| OUTLAW 99 | `audio/outlaw-99.mp3` | country |
| NEON PULSE | `audio/neon-pulse.mp3` | synthwave |
| BAY NEWS TALK | `audio/bay-news-talk.mp3` | talk bed |
| SPORTS REEL | `audio/sports-reel.mp3` | sports bed |
| DRIVE-IN OLDIES | `audio/drive-in-oldies.mp3` | oldies |

The published build lists MP3 files only, so no missing-format requests are
made at runtime. To add `.ogg`/`.wav` alternatives, append them to a station's
`files` array in `js/radiodata.js`; files are tried in order.

### Recommended compression

- **Format:** MP3 is the safest offline choice. OGG/Opus is smaller and also
  works in current Chrome/Firefox/Edge.
- **Bitrate:** 128 kbps is fine for music, 96 kbps is enough for talk. Use
  160–192 kbps if you want extra headroom.
- **Sample rate:** 44.1 kHz is standard for MP3; 48 kHz is also fine. Do not use
  96/192 kHz — it only makes the files larger.
- **Channels:** stereo for music, mono is fine for talk.
- **Length:** a 2–5 minute seamless loop per station keeps the game folder
  small. Long files are streamed from disk, not preloaded.

Example FFmpeg command for a station loop:

```sh
ffmpeg -i source.wav -b:a 128k -ar 44100 -ac 2 audio/coastal-fm.mp3
```

## Intro video

Put a movie in the `media/` folder. `js/config.js` lists the names that are
tried in order:

1. `media/intro.webm`
2. `media/intro.mp4`

Both files are included. The supplied
`Retro_video_game_harbor_intro_8cf96d7b.mp4` was installed as `intro.mp4` and
transcoded to VP9/Opus `intro.webm`. The game now falls through to the next
candidate if the first one fails to load, so deleting either file still works.

### Recommended video settings

- **Best choice:** WebM with VP9 video and Opus audio.
- **Fallback:** MP4 with H.264 video and AAC audio (widest browser support).
- **Resolution:** 1280×720 is plenty for the splash-sized player; 1920×1080 if
  you want a crisp full-screen intro.
- **Frame rate:** 24 or 30 fps.
- **Video bitrate:** 6–12 Mbps for 720p, 12–20 Mbps for 1080p.
- **Audio bitrate:** 128–192 kbps, 48 kHz stereo.
- **Length:** keep it under 60 seconds. The game has a safety timeout and a
  **SKIP INTRO** button.

Example FFmpeg command:

```sh
ffmpeg -i intro-source.mov \
  -c:v libvpx-vp9 -b:v 8M -row-mt 1 \
  -c:a libopus -b:a 160k -ar 48000 \
  media/intro.webm
```

The intro plays after you press **Start Cruising**, **Free Roam**, Enter, or
gamepad **Start/A**. Press Enter, Start/A again, or **SKIP INTRO** to skip it.
If no video file is present, the game starts immediately as before.

## Custom splash image

Create `media/splash.png` (or change `CC.mediaDef.splashImage` in
`js/config.js`). A 1600×900 PNG or JPEG works well; the image is darkened by a
gradient so the title and the two clickable mode buttons stay readable. If the
file is missing, the original gradient splash remains.
