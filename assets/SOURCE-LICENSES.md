# Third-party art

The models embedded in `js/GeneratedAssets.js` come from six CC0 packs. The
originals are not required at runtime; the generated file keeps the game
double-click friendly from `file://`.

- **Free Low Poly Vehicles Pack** by Raphael Gonçalves (Rgsdev) — CC0 1.0.
  Used for the sedan, hatchback, muscle, sports, roadster, pickup, box truck,
  SUV, van and police car meshes, plus the ambulance, bus, firetruck, limo,
  monster truck, second muscle car, taxi and trailer truck. Converted from FBX
  with `tools/export-vehicles.py` and `tools/export-extra-vehicles.py`.
- **Low Poly Car Pack** by Designersoup — CC0 1.0. Used for the Beatall compact,
  Landyroamer, Toyoyo Highlight off-road pickup, Tristar Racer and docLorean
  meshes. Converted from FBX with `tools/export-extra-vehicles.py`.
- **Avramania Asset Library — Nature & Terrain, Free edition** by Avramania —
  CC0 1.0. Used for pine, oak, birch, dead tree, bush, fern, grass, flowers,
  rocks, boulder, stump and lily pad meshes.
- **Retro House Pack** by Elegant Crow — CC0 1.0. Five low-poly houses are used
  for a quarter of the baked homes. Their geometry is embedded directly; the
  archive's external textures were not required.
- **Trailer Park** by Elbolilloduro — CC0 1.0. Six mobile-home bodies and their
  reduced 256px texture sets are used for the remaining baked homes. Blender was
  used to isolate each home from the full scene FBX before baking.
- **Bus stop** by Elbolilloduro — CC0 1.0. The compact shelter, concrete pad,
  glass and sign meshes from `Stop_01.fbx` are used at each transit stop. The
  full diorama was not baked; `tools/export-bus-stop.py` isolates only the
  useful pieces and its 256px sign texture is embedded for `file://` use.

All six packs explicitly allow use in any project, including commercial games,
with no credit required. Their license notices were included in the source
archives.

## Additional user-supplied packs

These were added from the user's `Downloads` folder after the CC0 bake. Their
geometry, animations and textures are embedded in `js/DownloadedAssets.js` by
`tools/import-downloaded-assets.js`; the animated characters are parsed at
runtime with Three.js `GLTFLoader` and keep their original animations.

- **`rocks.rar`** (user-supplied) — the five rock meshes and two 128×128 PNGs
  are scattered across dry land. The archive contained no license or credit
  file.
- **PSX South Asian Villagers — FREE Sample v1.0** by **LowPoly Lanka**
  (<https://lowpolylanka.itch.io>) — six rigged, animated tuk-tuk driver and
  grandmother models. License: personal/commercial use and modification are
  allowed; credit is appreciated but not required. The assets may not be
  resold, shared or redistributed on their own or as part of another asset
  pack, and may not be used to train AI/ML models. The full notice is in
  `assets/villagers_src/LowPolyLanka_PSX_Villagers_FREE_Sample_v1.0/LICENSE.txt`.
- **`Characters_psx.rar`** (user-supplied) — six skinned characters and their
  512×512 PNG texture atlases are used for the higher-resolution citizens
  (residents, beach visitors, ranger, firefighter and doctor). The archive
  contained no license, credit or redistribution notice; these are included
  only because they were supplied for this project and are not offered as a
  standalone asset pack.
- **`craftpix-net-558275-free-sky-with-clouds-background-pixel-art-set.zip`**
  (user-supplied) — CraftPix freebie license. Three day/golden-hour/night
  backgrounds were composited from the pack's sky gradients and cloud layers by
  `tools/bake-craftpix-sky.py`, then embedded in `js/GeneratedAssets.js` as
  in-game sky textures. The license permits unlimited personal and commercial
  projects with no attribution required; the source PNGs are not resold or
  redistributed, and the art is not offered for separate download.
- **`Retro_video_game_harbor_intro_8cf96d7b.mp4`** (user-supplied) — 3-second
  1280×720 intro clip installed as `media/intro.mp4` and transcoded to
  `media/intro.webm`. No license or credit notice was included with the file;
  it is used only as this project's optional loading intro and is not offered
  as a standalone asset.

The `PSX Style Cars by GGBot` archive was **not** used: it contains no license
file or redistribution terms, so it was not embedded here.
