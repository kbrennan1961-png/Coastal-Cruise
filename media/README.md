# Optional presentation media

This folder is **optional**. The game works with an empty `media/` folder (or
no folder at all): the splash card and start flow have built-in fallbacks.

Put these files here if you want custom presentation:

| File | Used for | Recommended |
|---|---|---|
| `splash.png` | Background art on the start screen | 1920×1080 PNG or JPEG, under ~3 MB |
| `intro.webm` | Intro video, tried first — **included** | VP9/Opus, 1280×720, 24 fps, generated from the supplied clip |
| `intro.mp4` | Intro video fallback — **included** | H.264/AAC, 1280×720, 24 fps, supplied clip |

Paths are defined in `js/config.js` as `CC.mediaDef`. Everything is loaded from
a relative local path, so double-clicking `index.html` from `file://` still
works. The included intro came from
`Retro_video_game_harbor_intro_8cf96d7b.mp4`; the game tries `intro.webm` first
and falls through to `intro.mp4` if a file is missing or unplayable. Keep custom
clips short (10–20 seconds); the game supplies its own music and effects. Press
**Enter**, **Space**, gamepad **Start**, or click **SKIP INTRO** to bypass the
video.

See `MEDIA-GUIDE.md` in the project root for encoding examples.
