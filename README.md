# Coastal Cruise

A single-page, no-build 3D arcade driving game. Drive a small coastal trailer-park town with **black streets, a sandy beach and bay, wooded areas, mobile homes, a boat launch, a store, a restaurant and a church**. Built with locally vendored **Three.js**, plain JavaScript and the Web Audio API. Supports a **standard gamepad** as well as keyboard controls.

## Run it

**Just double-click `index.html`** — the full map works offline with no local
server and no internet connection. The street network and world data are baked
into `js/mapdata.js`, and Three.js plus GLTFLoader are vendored under
`js/vendor/`, so nothing is downloaded at runtime.

You can also use a server if you prefer:

```bash
cd /Users/kb/coastal-cruise
python3 -m http.server 8080
```

Then visit <http://localhost:8080>. Either way is completely offline.

## Deployment

The live game is hosted on **Deplexo** at
<https://coastal-cruise.de.deplexo.com>, connected to
`kbrennan1961-png/Coastal-Cruise` on GitHub. Pushes to `main` trigger an
automatic rebuild and redeploy. The site is fully static; nginx serves the
files from a Docker image that pulls the Git LFS media at build time. Netlify
is no longer the active host. The Dockerfile uses GitHub's commit API as a
cache buster so the source clone is rebuilt on every push. `nginx.conf` serves
`index.html`, `map-editor.html`, `js/MapEdits.js` and `js/CommunityAssets.js`
with `no-store`, and **Apply to game** also rewrites those script URLs with a
fresh `?v=` timestamp, so an exported road edit cannot be hidden by a cached
copy of the patch.

The radio MP3s in `audio/` are compressed to under 25 MB each. The repo uses
Git LFS for `*.mp3`, so GitHub stores small pointer files and the Deplexo build
fetches the real audio. See `audio/README.md` for bitrates and filenames.

This Mac does **not** push directly to GitHub. `origin` points to the bare repo
on the mini PC (`obsidian-vault:git/Coastal-Cruise.git`), and the mini PC pushes
that history to GitHub from its bridge clone. After committing on the Mac:

```bash
git push origin main
ssh obsidian-vault 'git -C ~/git/Coastal-Cruise-bridge pull origin main && git -C ~/git/Coastal-Cruise-bridge push github main'
```

The mini PC bridge clone has `origin` set to the local bare repo and
`remote.pushDefault` set to `github`, so GitHub and Deplexo only see pushes
from the mini PC.

## Blender 3.6 asset workflow

Blender **3.6** is the version used for the baked CC0 models. The export scripts
in `tools/` run headlessly, for example:

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b \
  --python tools/export-vehicles.py -- <source-dir> <output-dir>
```

The other scripts are `export-extra-vehicles.py`, `export-trailer-park.py` and
`export-bus-stop.py`. They import FBX, clean up materials and axes, and write
GLB files for `tools/import-assets.js`, which bakes them into
`js/GeneratedAssets.js`.

Typical loop:

1. Author or edit the model in Blender 3.6 and save FBX/GLB.
2. Run the matching `tools/export-*.py` script with Blender 3.6.
3. Run `node tools/import-assets.js ...` to regenerate the baked JS bundle.
4. Hard-refresh `index.html` and verify in-game.

Keep textures small and retain the flat-shaded PS2 look.

### Blender ↔ map editor

For layout work, two more Blender 3.6 scripts exchange the map editor's native
JSON patch shape:

```bash
# Blender -> map editor JSON (roads, buildings, bridges, trees, models, elevation)
/Applications/Blender.app/Contents/MacOS/Blender -b scene.blend \
  --python tools/blender_map_export.py -- layout.json

# MapEdits.js or JSON -> Blender scene with real baked meshes
/Applications/Blender.app/Contents/MacOS/Blender -b \
  --python tools/blender_map_import.py -- js/MapEdits.js --clear \
  --save /tmp/coastal-map.blend

# Lightweight tagged empties/cones instead of baked meshes
/Applications/Blender.app/Contents/MacOS/Blender -b \
  --python tools/blender_map_import.py -- js/MapEdits.js --clear --proxies \
  --save /tmp/coastal-map-proxies.blend

# One-command helpers (same operations with friendlier paths/errors)
node tools/blender-map-bridge.js to-blender js/MapEdits.js map.blend
node tools/blender-map-bridge.js to-editor map.blend patch.json
```

The editor's **Blender** button opens these commands and can download the
current patch as JSON. After exporting from Blender, use **Import data** (or
**Import Blender JSON** in that dialog) to load the patch back. The round trip
preserves roads, buildings, bridges, trees, baked models, elevation, landmarks,
challenges and trailer shots.

### Prompt-generated models

The **New Asset** dialog can hand a detailed prompt to Blender 3.6 without MCP
or a network connection. Enable **Generate a new model with Blender 3.6**,
enter the prompt, and create the asset at the clicked map position. The editor
places a pending model marker, downloads a `.aiasset.json` job, and shows the
exact helper command. Run it from the Coastal Cruise folder:

```bash
node tools/blender-ai-asset.js generate ~/Downloads/<name>.aiasset.json \
  --out capture/generated-<key>.json
```

Blender runs `tools/blender_prompt_asset.py` headless, bakes the low-poly result
into `js/CustomModels.js`, and writes a result JSON. Back in the open editor,
use **Blender 3.6 Round Trip → Import generated model** on that result. The
model appears immediately at the original map position and can be dragged like
any other placed model. `CustomModels.js` is loaded by both `index.html` and
`map-editor.html`, so exported maps keep working from `file://`.

The importer reads the model geometry embedded in `GeneratedAssets.js`,
`DownloadedAssets.js` and `CustomModels.js`, so cars, houses, pines, downloaded
rocks and prompt-generated props appear as visible meshes in Blender. Each
placement gets a tagged parent empty; the child `part_*` meshes are
display-only, so exporting again produces the same
patch rather than duplicating assets.

Set `cc_type` on objects to `road`, `building`, `bridge`, `tree`, `model`,
`elevation`, `landmark`, or `challenge`. Landmarks and challenges round-trip as
full JSON objects in the `cc_data` custom property. For `model`, set
`cc_model_key` to a baked model name (for example
`retro1`, `sedan`, `pine`, or `downloadedRock0`) plus optional `cc_scale`,
`cc_y`, `cc_rot`, and `cc_color`. Name prefixes such as `model_`, `road_`, and
`elev_` also work. Blender coordinates map to the game as `X → x`,
`Y → -Z`, `Z → height`, and Blender Z rotation → game Y rotation.

## Map editor

Open **`map-editor.html`** directly (no server needed). It loads the same baked
image map as the game: the 2D backdrop is the exact ground canvas used in
`index.html`, and roads, buildings, landmarks, coast rules and terrain heights
come from the same runtime map data. An X/Z coordinate grid sits over the coast,
river and town. Use **New map** to start a blank project with your own
width/height (centred on X0/Z0); exported patches then redefine the game's world
bounds and base map.
**Import data** reads OSM XML, GeoJSON, or this editor's JSON patch shape,
including roads, buildings, trees, baked models and elevation. OSM `highway` ways become
roads, `building` ways become buildings, `natural=tree` nodes become trees, and
`ele` tags become terrain bumps.

Tools:

- **Select / move** (`V`) — drag buildings, landmarks, custom assets or road points.
- **Road** (`B`) — click to add points, double-click or `Enter` to finish.
- **Erase road** (`E`) — click a segment to split it, `Shift`+click to delete the road.
- **Building** (`R`) and **Bridge** (`G`) — drag to size; a bridge also adds a drivable road.
- **Tree** (`T`) — place a primitive tree.
- **Paint** (`W`) — Photoshop-style stamp brush. Drag to paint trees or any baked model; the Brush panel sets brush size, stamp spacing, scatter, scale, random rotation and scale variation. A whole drag is one undo step.
- **Model** (`M`) — place any baked model from the brush list (vehicles, pines, houses, trailers, rocks and props). Rotation and height are editable in the inspector.
- **Trailer** (`K`) — click a start point, then a finish point. The dialog stores vehicle, mode, camera, speed, duration and optional audio as a shot in the patch.
- **Erase asset** (`X`) — remove any placed asset. New assets open a dialog for a name and description; descriptions stay editable in the inspector.
- **Pan** (`H`) / middle mouse / `Space`+drag; scroll to zoom; `0` fits the map.

The **2D / 3D preview** toggle (or `P`) renders the map with the same baked models
as the game. In 3D, **Game / Realistic** switches between the in-game PS2 look
and an editor-only Blender/Unreal-style preview with softer PBR materials,
shadows and detailed building facades; the game itself is unchanged. Baked
**Model** assets show their real geometry. Click to select an object, then use
**View / Move / Rotate / Scale** (or keys `1`–`4`) for Blender-like gizmo
editing. Left-drag orbits in View mode; right/middle/`Shift`+drag pans, wheel
zooms and double-click fits. Move changes X/Z, Rotate changes Y rotation, and
Scale changes the model scale or building footprint. Switch back to 2D for road
drawing and map-wide tools.

Use **Apply to game** to export `MapEdits.js`. Save that file over
`js/MapEdits.js`, then hard-refresh `index.html`. The patch replaces the baked
roads/assets after the game's normal runtime overrides, so the editor view is
what you drive. **Load patch** reopens an exported patch, **Reset** discards it
and reloads the current game map, and **Copy JS** copies the patch for manual
saving.

For a map that is its own game rather than an edit of Coastal Cruise, choose
**New game** in the editor, enter a game title, then click **Create game
folder**. The editor asks you to pick the current game folder as a template;
it then writes a complete standalone copy of the engine with your blank map
installed as `js/MapEdits.js` and the splash/branding renamed. In Chrome or
Edge it can write directly into a folder you choose. In browsers without the
File System Access API it downloads a `.zip`, which you unzip into a new
folder. The huge optional `audio/` MP3s are skipped, so the new game's radio is
silent; copy the MP3s over yourself if you want file-backed stations.

## Trailer capture

A scripted Playwright harness can record a clean, HUD-free gameplay trailer.
Run it from the repository root — on the mini PC that is the bridge clone,
not your home directory:

```bash
cd ~/git/Coastal-Cruise-bridge   # mini PC; on this Mac: cd ~/coastal-cruise
npm ci                           # one time, installs Playwright + ffmpeg-static
npm run trailer
```

`npm run` looks for `package.json` in the current directory. Running it from
`/home/kb` produces `ENOENT: no such file or directory, open '/home/kb/package.json'`.
If Playwright reports a missing Chromium build, run
`npx playwright install chromium` once from the same folder. On Ubuntu 26.04
that installer is not supported yet; use an already-cached Chrome for Testing
build instead, for example
`--chromium ~/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome`.

It opens the game from `file://`, drives a coupe along Main Street, follows a
pedestrian on the boardwalk, flies a jetpack over the harbor, then finishes with
a low bridge chase. The harness pauses the normal animation loop and steps the
game deterministically, saving each rendered WebGL frame. This avoids the
near-static videos that `MediaRecorder` produces when a headless browser
throttles animation frames. The default `media/base_211.m4a` is muxed into
`capture/coastal-cruise-trailer.mp4`.

Useful options:

```bash
npm run trailer -- --music audio/playback-fm.mp3
npm run trailer -- --no-music --out capture/test.webm --units 0.1 --fps 12
npm run trailer -- --music media/base_211.m4a --width 960 --height 540 \
  --fps 12 --scale 1920x1080 --out capture/my-trailer.mp4
```

`--units 0.1` produces a short smoke test. `--fps` sets how many deterministic
frames are rendered per timeline second; lower values finish faster on software
GL. `--scale` resizes the encoded video, so a 960×540 capture can be delivered
as 1920×1080. `--keep-raw` keeps the intermediate JPEG frames. The scripted
input path is in `tools/trailer-runtime.js`; change the waypoint lists and
segment durations there to restage the default trailer.

### Individual clips for Filmcraft

Use the map editor's **Trailer** tool to save shots, then **Export JSON**. Each
shot renders as its own clip in `capture/clips/`:

```bash
npm run trailer -- --shots trailer-shots.json --fps 12 \
  --width 960 --height 540 --scale 1920x1080
```

Ground shots with `"mode": "road"` call the game's existing `CC.computeRoute()`
GPS router, densify the road-centerline path, and steer along it. They never
fall back to a straight cross-country path; if no drivable road route exists the
shot fails with a clear error. Aircraft, jetpacks and FPV drones use
`"mode": "straight"` and fly directly to the finish `x/z/alt`. Air shots should
leave `audio` empty and let Filmcraft use one continuous `base_211` track.

### INAV missions as cutscene/trailer camera paths

The map editor's **INAV Mission** dialog has **Export trailer shots**. It saves
the active waypoint plan as a normal shots file that the trailer harness can
render. WAYPOINT moves become `straight` camera flights, POSHOLD_TIME becomes a
timed hover, SET_POI aims the camera at the waypoint's POI, JUMP cuts to the
target waypoint, LAND descends, and the automatic final RTH flies home. Speed
and altitude come straight from the planner's cm/s and cm values.

The same conversion is available from the command line on an exported patch:

```bash
node tools/mission-to-shots.js js/MapEdits.js --out capture/mission-shots.json
npm run trailer -- --shots capture/mission-shots.json --no-music --fps 12
```

The same shots file can drive the pixelated harbor cutscene renderer instead of
its built-in camera path. This is deterministic — no slow real-time screen
recording — and writes a 1280×960 MP4 at an exact frame rate:

```bash
npm run cutscene -- --shots capture/mission-shots.json \
  --out capture/inav-cutscene.mp4 --fps 24
npm run cutscene -- --out capture/harbor-cutscene.mp4
```

A shot looks like this:

```json
{
  "name": "01-main-street",
  "vehicle": "coupe",
  "mode": "road",
  "start": { "x": -188, "z": -60, "h": 0, "s": 0 },
  "finish": { "x": 125, "z": -58 },
  "speed": 28,
  "camera": 0,
  "durationSec": 6,
  "boost": false,
  "audio": null,
  "note": "Main Street sweep"
}
```

The game opens with a **“The Harbor” intro splash screen**. Choose **Start Cruising** (or press `Enter`, or gamepad `A`) for the gate challenges, or **Free Roam** (or press `F`) to hide the rings and drive with no timer. That first gesture also enables audio and starts the radio; browsers block autoplay until you interact with the page. While the town loads you can choose a **local music or video file** with the 🎵/🎬 buttons on the splash; it loops in the background and stops the moment you start driving. Nothing is uploaded — the file stays on your computer.

## Controls

### Keyboard

| Key | Action |
|---|---|
| `W` / `↑` | Accelerate |
| `S` / `↓` | Brake / reverse |
| `A D` / `← →` | Steer |
| `Space` | Handbrake / drift; **swim down** on foot / descend in aircraft |
| `Shift` | Boost / **sprint** on foot (stamina bar) / climb in aircraft |
| `C` | Cycle camera: chase → hood → cinematic orbit |
| `R` | Reset / flip the vehicle |
| `E` | Exit the vehicle / get back in; on foot near the airport, board that parked aircraft; at an amusement station, pay and ride |
| `1`–`9`, `U` | Switch vehicle — `6` is **On Foot**, `7` is the **Marina Boat**, `8` is the **Plane**, `9` is the **Helicopter**, `U` is the **Bus** (or open the 🚙 **VEHICLES** button next to ⚙ SOUND). That panel also has **Classic / Redneck / Roach** on-foot character buttons. |
| `0` | Launch / leave the **FPV Kamikaze Quad**. It launches from exactly where you are standing or parked — no airport trip. The pilot stays behind at that spot. |
| `W` / `S` (FPV) | Pitch forward / back — same as the jetpack |
| `A` / `D` (FPV) | Strafe left / right — same inverted mapping as the jetpack |
| `Q` / `Z` (FPV) | Yaw left / right |
| `Shift` / `Space` (FPV) | Climb / descend — return to the pilot spot for a battery swap |
| `Esc` / `E` (FPV) | Leave goggles and return to the pilot vehicle/person at the launch coordinates |
| FPV kills | Drones, planes, helicopters, birds and enemy UFOs are destroyed on impact and pay **$5,000** each |
| `N` | Toggle music |
| `B` | Next radio station |
| `X` | Horn / pick up companions (or beat up a pedestrian on foot) |
| `P` | Sound menu (master, music & effects levels) and world settings |
| `V` | Change weather (clear → cloudy → rain) |
| `H` | Toggle controls help |
| `M` | Open / close the large north-up map drawn from the live game world (click the map or minimap to enlarge it, then click to set a waypoint) |
| `G` | Spawn on foot at the chosen waypoint (works after clicking the big map; also available as a button in the map footer) |
| `Enter` | Start the game from the splash screen |
| `F` | Start in / toggle **Free Roam** (hides the rings and timer) |

### Gamepad (standard mapping — Xbox / PlayStation / generic)

| Input | Action |
|---|---|
| Left stick ← → | Steer on land / aircraft yaw |
| Left stick ↑ ↓ | Drive on land (alternative to triggers); plane throttle; helicopter and drone climb/descend with the centre holding altitude |
| Right stick ← → | Free-look the camera on land; aircraft roll |
| Right stick ↑ ↓ | Free-look the camera on land; aircraft pitch (pull back to climb in a plane, push forward to fly a helicopter or drone forward) |
| RT / R2 | Accelerate |
| LT / L2 | Brake / reverse |
| A / Cross | Handbrake / drift, swim down / aircraft descend |
| B / Circle | Boost / sprint / aircraft climb |
| X / Square | Change camera |
| Y / Triangle | Reset vehicle |
| LB / RB | Previous / next vehicle |
| D-pad ↑ | Next radio station |
| D-pad ↓ | Horn / pick up companions |
| D-pad ← → | Previous / next vehicle |
| L3 / R3 | Toggle music / exit or enter vehicles (steal any nearby vehicle on foot) |
| A / Start | Start the game from the splash screen; with a waypoint set, Start drops you there on foot |
| Start / Options | Controls help |
| Back / Share | Toggle the full-screen waypoint map |

Aircraft use a centred Mode 2 layout: left-stick X is yaw, left-stick Y is collective lift on helicopters/drones (centre hovers at the current altitude) and forward airspeed on the plane, while right-stick X/Y is roll/pitch. On the plane, pulling the right stick back raises the nose and climbs; pushing it forward dives. Keyboard `Shift` / `Space` still work as aircraft climb / descend fallbacks.

The HUD shows a **GAMEPAD: …** status line. Controllers can be plugged in or unplugged while the game is running, and keyboard + gamepad can be used together. Free Roam is available from the splash button or the `F` key.

### On-foot characters and creatures

Open the small-car **VEHICLES** button and use the **ON-FOOT CHARACTER** row to switch between **Classic**, **Redneck** and **Roach**. Selecting a skin while in a car first puts you on foot. The redneck has authored `Idle`, `Walk`, `Run`, `Attack`, `Hit` and `Death` clips; the giant cockroach has idle, walking, attack, death and flying clips. Both are baked into `js/DownloadedAssets.js` as data URIs, so no GLB is fetched at runtime. Model credits are in `ATTRIBUTION.md`.

To add cockroaches to the world, open `map-editor.html`, choose **Model**, select **Characters → Roach** and click to place one. The **Paint** brush (`W`) can stamp many at once; set **Baked model** to **Roach** in the Brush panel. Use **Apply to game**, save the generated `js/MapEdits.js` over `js/MapEdits.js`, and hard-refresh `index.html`. The editor 3D preview uses a static character marker, but the game builds the animated GLB at runtime.

Redneck and roach are not included in random town pedestrians by default. To make them wander town, change the downloaded-pedestrian source list in `js/npcs.js` from `DL.keys` to `DL.allKeys` in the `NPCSystem.init()` block near the end of that function.

## The town map

The town uses a **hand-defined network of twelve roads** — two main avenues, three cross streets, a park loop, two cul-de-sacs, a gravel road to the water, a port access spur and a long east-side Riverbend Loop. Streets are straight and well defined, and traffic and time trials follow the paved ones. The old angled crossing near the mouth is gone: North Cross is now a straight east–west approach that meets the river's short north-south reach at a right angle just south of the airport. Its east landing joins Main Street through a broad semicircular road through the woods, with trees cleared from the corridor. Beside Burger Bay the west loop turns north into a clean T junction with Main Street, and on the east bank the Cul-de-sac runs north–south beneath the elevated Main Street bridge.

- **Streets:** textured black asphalt with connected double-yellow centre lines, yellow edge lines (clipped at intersections), zebra crosswalks on all junction approaches, right-corner stop signs, speed-limit signs, direction signs and a single two-blade street-name pole per intersection, working traffic signals at the main T-junctions, and street lamps that glow at night. Traffic drives on the right.
- **Drawbridges:** every river crossing is a lifting drawbridge on one shared cycle — down for 15 minutes, raised for 5 minutes to pass ships. Each approach has a traffic signal that turns red before the lift, a boom gate that physically blocks vehicles and pedestrians while the span is open, and a flashing yellow beacon. The relocated mouth crossing meets the river at a right angle, and the east-side connector curves through cleared woods between that bridge and Main Street.
- **Waterfront:** a bay along the west edge with scrolling textured swells, rolling waves, whitecaps and shoreline foam, a **sandy beach** you can drive on with dunes, sea grass and palms, a **boat launch** with a ramp and dock, and a **marina** with eight slips and moored boats. Fish, crabs, lobsters and clams live on the sea floor; on foot you can swim out and hold `Space` to dive among them. A large "Welcome to the Harbor" billboard greets you at the town entrance. Beach umbrellas and walking fishermen complete the shore.
- **Businesses & landmarks:** a country store, restaurant, **Community Chapel** with a steeple, graveyard and a large lit sign with a daily-changing message and "All are welcome", park pavilion, seaside diner, hardware store and motel — the buildings use physical fascia and roadside signs rather than floating nameplates. The businesses have fenced parking lots with parked cars, and each compound is checked so no fence or parking bay reaches the road. The **Lucky Stop** gas station has a red-and-yellow canopy, four pumps, a convenience store and a tall double-sided sign, with an open forecourt and no perimeter fence. East of town, a blue-and-white **Walmart** big-box store has a large asphalt lot with 44 striped parking spaces, parked cars, a roadside pylon and seven lamp posts that illuminate the lot after dark. A guyed lattice **cell tower** with a blinking beacon shares a compound with two large **satellite dishes**, and a fenced **power station** has transformer banks, porcelain bushings and high-tension lattice towers with sagging wires. A small **Harber Realty** office sits on Main Street with a black-and-white roadside sign reading `Harber Realty` and `910-253-6788`, a large black SUV and a golf cart parked in the drive, and matching miniature `FOR SALE` placards at the kerbside of one home in eight. The bar, club and every storefront have extra pedestrians moving around their frontages.
- **Parks & farm:** **Harbor Park** has a ball diamond, soccer and basketball courts, tennis courts, a playground, benches and night lamps, plus a **skateboard park** beside the ball fields with a ramp, coping, grind rail and platform. **Piney Acre Farm** adds a barn, silo, farmhouse, tractor, crop rows, a turning windmill and wandering cows, sheep, pigs, chickens, a horse and a goat.
- **Boardwalk & amusements:** a long wooden **boardwalk** lined with arcades, food carts, beach-apparel shops and souvenir stores leads to the lit **Harbor Amusement Park** arch. A dense midway adds pretzel, cotton-candy, hot-dog and pizza stalls, arcade cabinets, a shooting gallery and video games, with 28 guests, 11 workers and 12 loose stray dogs. The **carousel** and **Ferris wheel** cost `$1.00` from your account; the five-car **roller coaster** costs `$2.50` and carries you around the whole loop with ten seats. The **SURF SHACK** storefront has an extra railing around its boardwalk overlook, and strollers walk the planks while anglers fish from the deck. A shorter **fishing pier** keeps a clear shipping lane: ships and boats steer around the spur instead of sailing through the pilings. Aproned clerks and vendors work the storefronts and wander their small patches in front of the shops. Dolphins swim and leap in the water beside it.
- **Community facilities:** **Coastal General Hospital** has an emergency canopy, red cross, rooftop helipad, ambulance and marked parking; the **post office** is in town centre. A fenced **police station** has a blue-and-gold badge, barred jail windows, patrol cars, a flag and a lit entrance; the pedestrian respawn for an arrest appears at its gate. A waterfront **boatyard** stores dozens of boats in dry-stack racks and has a travel lift, slipway and yard office. There is also a fenced **dog park** with separate small/large runs, agility equipment and animated dogs, plus a water treatment plant, fuel depot, water tower and cemetery.
- **Airport:** a full-length runway with paired edge and lead-in lights that start white then sweep blue from one end to the other, a large rotating radar dish, a glassed-in control tower with a beacon, a terminal, hangar, windsock and parked planes and helicopters you can board on foot with `E` (R3 on a gamepad). A fenced **Military Outpost** sits on the north-west apron with tents, supply crates, a staff car and a waving US flag; platoons of soldiers march from it to sites all over the map and return, with flag bearers leading and rifles slung over the other soldiers' shoulders. The FPV quad still has a lit apron pad, but pressing `0` now launches it from your current pedestrian or car position; the orange map diamond marks the **pilot spot** and post-explosion respawn point.
- **Mobile homes:** around 120 small homes scattered across the open grass, each on a green lawn with siding, windows, a door, a fenced yard, and flower gardens out front. A numbered family mailbox stands by each front fence with two or three household surnames on its label. Some homes light their windows and porch lamps at night, and selected backyards add fenced swimming pools, wooden gazebos or formal gardens with clipped hedges, topiary and birdbaths. Sites, fences and backyard features are set back from the asphalt; driveways run from the road to each home with vehicles parked in them. Telephone poles and sagging power lines run down the streets with service drops to the houses.
- **Terrain:** smooth rolling hills rise in the open fields, always clear of houses, landmarks and the beach; the pavement stays level as it crosses them.
- **Vegetation:** 1,100 placed pines, broadleaf trees and palms, 1,500 extra instanced trees, 2,700 dense trees in the woods with winding dirt trails, 1,200 baked bushes and ground-cover tufts, tall and short grass, weeds and wildflowers across the green areas. Extra palms line the shore and scattered inland spots, and trees and bushes are kept clear of the nature trail and bus stops so they stay walkable.
- **Ponds & wetlands:** a bay-side marsh and river wind through town, and four large ponds ringed with tall reeds and cattails — including **Willow Pond** beside the park. Ducks paddle the water, and alligators sun themselves along the banks of the larger pools. A paved access spur reaches the **River Container Port** on the west bank, where gantry cranes, container stacks, lit berths and a berthed freighter handle cargo. Inbound cargo ships follow the river channel from the bay to the berth, load and unload, then sail back out to sea. Lighted channel buoys mark the route with **red on the right and green on the left when returning into port**.

The road list, water/beach/wood zones, landmark sites, home sites and time trials are baked into `js/mapdata.js`. At startup the game paints the ground texture from those numbers (blue water, tan sand, dark green woods, black roads) and uses the same data for driving surfaces and the minimap.

**To change the layout:** edit `buildDesignedMap()` in `js/imagemap.js` (roads, zones, landmarks and home count), the tree/umbrella counts in `buildImageProps()` in `js/world.js`, and the extra vegetation counts in `buildExtraVegetation()` in `js/details.js`, then rebuild the data:

```bash
node tools/bake-map.js
```

The game reads `js/mapdata.js` at startup. If it is missing, the game builds the same map live. The enlarged map draws the exact painted ground canvas used by the 3D terrain, together with the live road, zone and marker data — it is not the reference `map.png`. No runtime `fetch()` is needed.

## What's in the game

- **More than a dozen rides** with distinct handling, including coupes, muscle cars, a taxi, limousine, off-road vehicle, a full-size **bus**, a small outboard **boat** with wake particles and shoreline bouncing, a **plane**, a **helicopter**, and an **FPV Kamikaze Quad**. `Shift` climbs and `Space` descends in the aircraft (the helicopter's collective is speed-neutral, so it can climb straight up); the boat boards from its marina slip (key `7`), keys `8`/`9` spawn planes and helicopters from the airport, `0` launches the FPV quad from wherever you are, and `U` selects a bus that follows a fixed route and stops at every painted bus stop with visible riders. On foot, the vehicle panel can swap you into the redneck or giant cockroach skin.
- **Retro water:** the old scrolling-noise water texture is gone. The bay now uses a moving diamond-grid shimmer like the harbour reference: a solid nearest-filtered 64×64 pixel base plus an alpha-only ridge sheet scroll in opposite directions over flat-shaded Phong facets. A third, unscrolled sheet covers only the river, so the channel stays glassy flat while the bay still swells. A single deterministic `getWaterHeight(x, z, time)` drives both the visible swells and four-corner pontoon buoyancy, so boats rock on the bay but sit level in the river, while cars wallow and sink before the deep-water reset. See `js/RetroWater.js` for tuning.
- **On-foot mode:** jogs at speed with the same animated limbs as the townsfolk, and holding `Shift` switches to a GTA-style sprint with a quicker stride and a stamina bar under the speedometer. Sprint drains stamina; when it empties you must recover before sprinting again. Swims in deep water and holds `Space` to dive to the sea floor. Press `E` (gamepad R3) to hop out and back in again, or carjack any nearby drivable vehicle — parked and moving cars, buses, cruisers, gang bikes, NPC boats and parked airport aircraft; stepping out to one side keeps your position.
- **Radio:** ten stations, including **Playback FM**, Coastal FM, **Cruise 101**, Island Wave and Moonlight. The bundled MP3s in `audio/` are the only music source; the old synth/FM fallback is intentionally muted, so a missing file stays silent instead of producing chiptunes. Game starts on **Cruise 101**. Change station with `B`, gamepad **D-pad up**, or the boombox HUD button — a short static burst plays between stations. Toggle music with `N`, L3 or the ♪ button; the music button opens a vertical slider and its bottom mutes. The radio is silent in pedestrian mode (`6`) and resumes the same station when you get back into a vehicle. See `audio/README.md` for filenames and bitrates.
- **Sound & display menu:** `P` or the ⚙ SOUND button opens a menu with **Master sound**, **Music level** and **Game sounds / effects** sliders (saved locally), plus weather and time-of-day controls. The **⛶ FULL SCREEN** button fills the display, and **Full screen on start** remembers the choice for your next drive. The loading music/video volume follows the master slider.
- **Weather & sky:** three baked CraftPix pixel-art sky paintings (day, golden hour and night) cross-fade on the sky dome, joined by large, bright low-poly clouds high above the aircraft ceiling. Conditions change between clear/cloudy/rain with wind-driven slanted rain, branching lightning flashes and generated thunder, rising wind audio, a sun that arcs across the day, a moon and stars at night, and gradual dawn/day/dusk lighting. Use `V` to change weather or the settings menu to jump to a different hour.
- **Traffic** follows the paved town streets, with lane discipline, braking, avoidance and horns. Cars stop for pedestrians crossing their lane and give way to marching platoons, steering around soldiers instead of through the column; a reckless minority still tailgates, cuts cars off, passes on the right, runs lights, clips other cars or chases pedestrians off the shoulder. Walkers, animals and drivers slide around buildings, rocks, fences, signs and parked boats instead of clipping through them; only pedestrians and wildlife may push through trees inside the marked forest zones. Three **transit buses** run a fixed downtown loop, stopping at every shelter while riders board and alight, and three **military platoons** route from the airport outpost to landmarks across the island and back. Marked **police cars** patrol the same roads and walking cops beat the sidewalks. Ramming a police car in a vehicle or running over a pedestrian adds a wanted star — walking into a parked cruiser does not — and stealing any nearby vehicle starts a chase and earns wanted stars. Each extra star sends more cruisers, and four stars dispatch two police helicopters with searchlights. Cops and helicopters shoot tracers throughout the chase. A cruiser can only ram your car — it cannot arrest a driver. Once you bail out, a walking cop has to grab you, then you get a few seconds to mash `A`/`D` or `W`/`S` (or wiggle the left stick) to break free. If you fail, a **Busted** card appears and you wake up on foot outside the station. Stay out of police sight for **three minutes** and the whole wanted level clears. **Aircraft** (planes and helicopters) circle overhead; **ships and motor boats** share the buoyed river channel, with cargo ships docking at the River Container Port before heading back out to the bay.
- **Teen motorcycle gangs:** three crews of noisy riders tear donuts through the park, boardwalk, bus stops and home lawns by day, leaving skid marks and trampled grass. After dark they switch to burglarizing houses and stealing parked cars, then lead cruisers on a chase. Up to two patrol cars are assigned per suspect (one if you are also wanted); contact means a bust, and a fresh crew rides out later. Activity is counted in the smoke/debug state (`teenVandalism`, `teenDonuts`, `teenBurglaries`, `teenCarThefts`, `teenArrests`).
- **Shahed-style drones:** four low-flying delta-wing drones launch from the harbor water and cross the coast on random routes. Occasionally one picks a building, landmark or parked/moving car and dives into it; the impact leaves a giant blast, lingering flame and smoke column, and knocks down nearby props. New drones take to the air after each crash.
- **TR-3B UFO squadron:** three large triangular craft drift over the island in formation, with three rotating blue underlights, red port / green starboard corner lamps and a flashing white nose, plus an Iranian flag on the hull. Intermittent white searchlight rays sweep the ground; when a ray finds a pedestrian or animal it locks on, lifts the victim into the belly and vanishes them for a while before they reappear at the original spot. The craft also blast harbor facilities with bright white beams and explosions. FPV kamikaze drones and the air-defense battery can hit them; a hit sends the craft straight up in a flash and it disappears.
- **FPV kamikaze missions:** key `0` launches from your current spot. The quad is visible for a fraction of a second at the pilot, then goggles switch to a forward windshield-style view with gyro horizon, crosshairs, moving lat/lon, a home-direction arrow, GPS satellite count, altitude, speed, battery, a fresh random mission name and `FLIGHT MODE JETPACK`. Controls match the jetpack exactly: `W/S` pitch, `A/D` strafe, `Q/Z` yaw and `Shift/Space` climb/descend. The 15-minute battery ends in motor loss; return to the pilot spot for a swap. Ram a Shahed drone, plane, helicopter, bird or enemy UFO to destroy it and earn **$5,000**; the quad explodes and respawns at the exact pilot coordinates. `Esc` / `E` exits the goggles and puts you back in the pedestrian/car at that spot.
- **Vehicle damage:** repeated impacts and police gunfire make the current car smoke, then catch fire; if you stay inside, it explodes after a short fuse. Ordinary crashes never kill you — only a fire that reaches the explosion shows **Wasted** and respawns you as a pedestrian at the hospital.
- **Wildlife:** dozens of free-roaming dogs, hopping rabbits and squirrels, gulls and songbirds circling overhead, and ducks and alligators in the ponds. Small animals and dogs bolt out of the way when you drive or run at them.
- **Pedestrians** wander the streets and beach, and jump aside when you approach quickly. Twelve of them use the downloaded animated villagers and higher-resolution PSX citizens — with 22 idle/walk/talk animations on the villagers and 512×512 texture atlases on the citizens — spread across the boardwalk, roads, trailer park and beaches. The rest keep the original procedural rigs.
- **Food delivery gigs:** stop for a second at a restaurant door or Burger Bay pickup window to grab an order, follow the GPS marker to a numbered family home, then slow down at the mailbox to hand it to the named resident and get paid. Pickup and drop-off are automatic — no new keys — and the cash lands in the HUD beside the speedometer.
- **Downloaded rocks:** five individually baked stones from the supplied rock pack are scattered over dry land, instanced into five draw calls and kept clear of roads, bus stops, trails and buildings. See `assets/SOURCE-LICENSES.md` for sources and terms.
- **Time trials** run along three of the longest streets; drive through the glowing gates in order. Best times persist in `localStorage`. In **Free Roam** the gates and timer are hidden, so you can explore without the challenge.
- **HUD & navigation:** speed gauge, a compact centered icon bar with music note, boombox, provided settings gear and small-car buttons (each shows a hover label above it), surface/camera readouts, gamepad status, procedural Web Audio sound, and a **round, heading-up minimap** raised above the bottom icon bar that becomes a full-screen planner with `M`. Your direction of travel always points to the top of the minimap—including when you reverse or drift—and the world rotates underneath it. A gold **N** rides the round minimap's rim to show which way is north. Pressing `M` opens a large rectangular **north-up** planner drawn from the same painted ground canvas used by the 3D world, with live roads, zone shapes and marker symbols but no floating text boxes over buildings, businesses, landmarks, homes or safe houses. Click anywhere on the full map to drop a waypoint through the world projection, then press `G` (or gamepad `Start`, or the map's **GO ON FOOT** button) to appear there as a pedestrian; the small map draws a road-following GPS route with distance and ETA while you drive.

## Files

```
index.html        page shell + HUD
style.css         HUD styling
map.png           original reference picture (not used by the game)
js/config.js      constants, vehicle tuning, legacy picture-map settings
js/mapdata.js     baked map: roads, zones, landmarks, homes, trials (generated)
tools/bake-map.js regenerates js/mapdata.js from the designed map
js/imagemap.js    street network, terrain painting, home placement, map loading
js/GeneratedAssets.js  embedded CC0 meshes plus baked CraftPix skies (generated)
js/DownloadedAssets.js embedded rocks, villagers and citizens (generated)
tools/import-assets.js regenerates js/GeneratedAssets.js from the CC0 sources
tools/bake-craftpix-sky.py adds the composited sky paintings to js/GeneratedAssets.js
tools/import-downloaded-assets.js regenerates js/DownloadedAssets.js
tools/trailer.js scripted Playwright trailer capture + MP4 muxing
tools/trailer-runtime.js browser-side camera/input timeline, road-following shots
tools/blender_map_import.py map patch -> Blender 3.6 scene
tools/blender_map_export.py Blender scene -> map patch
tools/blender-map-bridge.js one-command Blender round-trip helper
js/CustomModels.js      baked prompt-generated Blender props (generated)
tools/blender-ai-asset.js downloads a prompt job, runs Blender, registers the model
tools/blender_prompt_asset.py offline Blender 3.6 prompt -> low-poly mesh generator
js/MapPreview3D.js editor 3D preview + selection/move/rotate/scale gizmos
js/AssetLoader.js baked mesh batching, materials and prop building
js/world.js       terrain, roads, landmarks, homes, trees, props, gates, particles
js/details.js     road markings, signs, signals, lamps, poles, marina, extra vegetation
js/vehicles.js    vehicle meshes, arcade physics, boat + player pedestrian
js/DownloadedCharacterLoader.js runtime GLTFLoader + AnimationMixer for the downloaded characters
js/npcs.js        traffic, police, drones, aircraft, watercraft, pedestrians, shop workers, dogs, small animals, birds
js/TeenGangSystem.js teen motorcycle crews, vandalism, burglary, car theft, police pursuits
js/radiodata.js   radio station list (optional local audio file paths)
js/gamepad.js     standard gamepad polling and button edge detection
js/DeliverySystem.js restaurant pickup, home drop-off and delivery payouts
js/weather.js     clouds, rain, thunder, sun/moon and day/night lighting
js/game.js        renderer, cameras, input, radio, audio, HUD, game loop
js/StaticBatcher.js merges static scenery by material at boot to cut draw calls
```

## Performance

The world is built from a lot of small procedural props. Two boot-time passes
keep it cheap to render: `StaticBatcher` merges thousands of static meshes into
a few hundred material/tile batches, and the scattered-instance pools in
`AssetLoader`/`details.js` are split into 160–320 m spatial tiles so the GPU only
sees tiles near the camera. This drops the rendered triangle count from ~4.3 M
to under 1 M in a typical view. Pixel ratio is capped at 1.25, real shadow maps
are off (the world uses baked blob shadows), camera far matches the fog cutoff,
and the HUD canvases/DOM hints refresh at 10–20 Hz instead of every frame.
Render resolution now adapts to measured frame time (0.7–1.25×), the two
scrolling retro-water sheets share one geometry updated at 30 Hz with no
normal-buffer rebuilds, and the flat river sheet never updates, so the water
costs a fraction of its original frame time.
