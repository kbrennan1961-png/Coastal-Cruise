# Radio music

The published game ships ten offline MP3 radio stations in **this `audio/`
folder**. Their paths are wired up in `js/radiodata.js`; no server, CDN, or
runtime download is needed.

| Station | Format | Bundled file |
|---|---|---|
| COASTAL FM | Chill adult contemporary | `coastal-fm.mp3` |
| CRUISE 101 | Upbeat cruising pop/rock | `cruise-101.mp3` |
| PLAYBACK FM | Old-school hip-hop and R&B | `playback-fm.mp3` |
| ISLAND WAVE | Reggae and tropical | `island-wave.mp3` |
| MOONLIGHT | Late-night jazz and soul | `moonlight.mp3` |
| OUTLAW 99 | Country and twang | `outlaw-99.mp3` |
| NEON PULSE | Synthwave and electronic | `neon-pulse.mp3` |
| BAY NEWS TALK | News and call-in talk | `bay-news-talk.mp3` |
| SPORTS REEL | Sports talk and highlights | `sports-reel.mp3` |
| DRIVE-IN OLDIES | Classic rock and oldies | `drive-in-oldies.mp3` |

If a file is missing or cannot play from `file://`, that station falls back to
silence — the procedural/synth station is disabled. Use short, royalty-free
clips that you are allowed to distribute/play locally. See `MEDIA-GUIDE.md` for
encoding tips.

## Bundled encoding

The included MP3s are compacted so every file stays under GitHub's 25 MB limit:

- Talk stations (`bay-news-talk`, `sports-reel`): **24 kbps mono, 22.05 kHz**
- Music stations: **24–56 kbps mono, 22.05/32 kHz**, chosen per track
- Total `audio/` folder size: about **207 MiB**

Keep the filenames unchanged so `js/radiodata.js` keeps finding them. The previous
higher-bitrate versions remain in git history; these are the GitHub-sized copies.

To add a different station or another format, edit `js/radiodata.js`:

```js
{ name: 'BEACH FM', files: ['audio/beach-fm.mp3'], fallback: 'island' }
```

Cycle stations with controller **D-pad up**, the `B` key, or the 📻 HUD button.
Audio volume is controlled from the ⚙ Audio menu.
