# GTA-era / community asset import

The editor's **asset import** button opens a browser for converted assets. It
accepts:

- generated `asset-index.generated.json` files from `tools/import-gta-assets.js`
- standalone `.glb` models (embedded textures are baked into the editor)
- loose `.png`, `.jpg`, `.jpeg`, `.webp` and `.bmp` textures
- `.dff`, `.txd` and `.img` file names are detected, but those raw formats need
  the local Blender converter below

No GTAinside account, password or reset link is stored anywhere. You can
manually download files from GTAinside or <https://libertycity.net/> and point
the converter at the folder.

## Convert raw files

From the Coastal Cruise folder:

```sh
node tools/import-gta-assets.js --source "/path/to/downloads"
```

To import specific files from an archive/IMG:

```sh
node tools/import-gta-assets.js \
  --source "/path/to/downloads" \
  --asset landstal.dff \
  --asset bus.dff
```

The helper uses Blender plus the vendored DragonFF addon to produce embedded
GLBs, then bakes them into `js/CommunityAssets.js` and writes
`assets/gta/asset-index.generated.json`. In the editor, choose
**File → asset import → Import asset files…** and select that generated JSON.
A reload also picks up the baked `CommunityAssets.js`.

## Types

Assets are sorted into `textures`, `buildings`, `roads`, `characters`,
`vehicles`, `trees`, `props` and `models`. Place model entries with **Place**;
apply texture entries to the currently selected placed model with **Apply**.
The selection inspector also has a texture dropdown for every model asset.

## Licensing

Generated GTA-derived files are local build artifacts and are not committed.
Before shipping any asset to the live site, confirm its source license and add
the author/link to `assets/SOURCE-LICENSES.md`. LibertyCity.net and GTAinside
downloads can have different terms per author; do not assume redistribution is
allowed.
