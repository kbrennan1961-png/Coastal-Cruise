# Asset attributions

## Animated characters

- **Redneck Character PSX Style** — [vinrax](https://sketchfab.com/vinrax), [Sketchfab model](https://sketchfab.com/3d-models/redneck-character-psx-style-7b02de568d7c491b8be7bc50246789ad), licensed [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/). The supplied GLB had no clips; `tools/author-redneck-animations.py` adds locally authored Idle, Walk, Run, Attack, Hit and Death actions in Blender 3.6 and keeps the original 26-joint skin.
- **Giant cockroach** — [Drillimpact](https://sketchfab.com/Drillimpact), [Sketchfab model](https://sketchfab.com/3d-models/giant-cockroach-4b19ed8851f74c278eef835250a82896), licensed [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/). Its six supplied clips (`idle`, `Attack`, `death_start`, `flying_kidnapping`, `flying_straight`, `walking`) are preserved in the baked asset.

Both models are embedded in `js/DownloadedAssets.js` as data URIs and load from `file://` without network access. This attribution satisfies their CC BY 4.0 credit requirement.
