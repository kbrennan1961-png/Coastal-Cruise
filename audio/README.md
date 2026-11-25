# Radio music

The game plays ten synthesized radio stations out of the box, so no files are
required. To use your own offline music, drop audio files into **this `audio/`
folder** using the names below. The paths are already wired up in
`js/radiodata.js`, so you do **not** need to edit any code — just add the files
and reload the page.

| Station | Format | Put one of these files in `audio/` |
|---|---|---|
| COASTAL FM | Chill adult contemporary | `coastal-fm.mp3` / `.ogg` / `.wav` |
| CRUISE 101 | Upbeat cruising pop/rock | `cruise-101.mp3` / `.ogg` / `.wav` |
| PLAYBACK FM | Old-school hip-hop and R&B | `playback-fm.mp3` / `.ogg` / `.wav` |
| ISLAND WAVE | Reggae and tropical | `island-wave.mp3` / `.ogg` / `.wav` |
| MOONLIGHT | Late-night jazz and soul | `moonlight.mp3` / `.ogg` / `.wav` |
| OUTLAW 99 | Country and twang | `outlaw-99.mp3` / `.ogg` / `.wav` |
| NEON PULSE | Synthwave and electronic | `neon-pulse.mp3` / `.ogg` / `.wav` |
| BAY NEWS TALK | News and call-in talk | `bay-news-talk.mp3` / `.ogg` / `.wav` |
| SPORTS REEL | Sports talk and highlights | `sports-reel.mp3` / `.ogg` / `.wav` |
| DRIVE-IN OLDIES | Classic rock and oldies | `drive-in-oldies.mp3` / `.ogg` / `.wav` |

Files are tried in order; if a file is missing or cannot play, that station
falls back to its own synthesized style. Use short, royalty-free clips that you
are allowed to distribute/play locally. See `MEDIA-GUIDE.md` for encoding tips.

## Bundled encoding

The included MP3s are compacted so every file stays under GitHub's 25 MB limit:

- Talk stations (`bay-news-talk`, `sports-reel`): **24 kbps mono, 22.05 kHz**
- Music stations: **24–56 kbps mono, 22.05/32 kHz**, chosen per track
- Total `audio/` folder size: about **207 MiB**

Keep the filenames unchanged so `js/radiodata.js` keeps finding them. The previous
higher-bitrate versions remain in git history; these are the GitHub-sized copies.

To add a different station or more formats, edit `js/radiodata.js`:

```js
{ name: 'BEACH FM', files: ['audio/beach-fm.mp3', 'audio/beach-fm.wav'],
  fallback: 'island' }
```

Cycle stations with controller **D-pad up**, the `B` key, or the 📻 HUD button.
Audio volume is controlled from the ⚙ Audio menu.
