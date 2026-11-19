# Coastal Cruise

A single-page, no-build 3D arcade driving prototype set in a sun-drenched coastal mobile-home park. Built with Three.js (CDN), plain JavaScript and the Web Audio API.

## Run it

**Option A — just open the file**

Double-click `index.html` (or open it in Chrome / Edge / Firefox / Safari). The Three.js script is loaded from a CDN, so an internet connection is needed the first time.

**Option B — local server (recommended)**

```bash
cd /Users/kb/coastal-cruise
python3 -m http.server 8080
```

Then visit <http://localhost:8080>.

> Click the page or press any key once to enable procedural engine audio (browser autoplay policy).

## Controls

| Key | Action |
|---|---|
| `W` / `↑` | Accelerate |
| `S` / `↓` | Brake / reverse |
| `A D` / `← →` | Steer |
| `Space` | Handbrake / drift |
| `Shift` | Boost |
| `C` | Cycle camera: chase → hood → cinematic orbit |
| `R` | Reset / flip the vehicle |
| `1`–`5` | Switch vehicle (or click the HUD buttons) |
| `H` | Toggle controls help |
| `M` | Toggle minimap |

## What's in the prototype

- **World:** a coastal peninsula with animated ocean, sand/dune beaches, wooden boardwalks, paved two-lane roads, gravel shortcuts, cul-de-sacs, pastel single/double-wide mobile homes, porches, window ACs, propane tanks, chain-link fences, palms, scrub pines, boats on trailers, umbrellas and destructible mailboxes/trash cans/lawn chairs.
- **Five vehicles with distinct handling:** nimble motorbike with lean, grip-focused ATV, whisper-quiet ultra-tight golf cart, drift-friendly sedan, and a torquey pickup that bulldozes yard props. Sand/grass penalties, suspension bounce, dust particles and boosts are per-vehicle.
- **Traffic:** AI sedans, pickups and carts follow road waypoints with right-hand lane discipline, brake lights, collision avoidance and horns when you cut them off.
- **Pedestrians:** strollers, dog walkers, chatting neighbours and fishers; they jump aside when a vehicle approaches at speed.
- **Time trials:** drive through the glowing gate of *Boardwalk Sprint*, *Trailer Park Slalom* or *Dune Run*, then hit each gate in order. Best times persist in `localStorage`.
- **HUD:** speed gauge, vehicle indicator, surface/camera readouts, live minimap and procedural Web Audio engine tones that change with vehicle and speed.

## Files

```
index.html      page shell + HUD
style.css       HUD styling
js/config.js    world math, road network, vehicle tuning, challenges
js/world.js     terrain, ocean, roads, props, gates, particles
js/vehicles.js  vehicle meshes + arcade physics
js/npcs.js      traffic + pedestrian AI
js/game.js      renderer, cameras, input, audio, HUD, game loop
```

Everything is intentionally data-driven and tweakable: edit `CC.vehicleSpecs`, `CC.roadDefs` or `CC.challengeDefs` in `js/config.js` to change handling, layout or trials.


## Core Gameplay Loop & Controls

### Controls
- **Drive/steer:** `W`/`S`/`A`/`D` or Arrow keys
- **Handbrake/drift:** `Space`
- **Boost/sprint:** `Shift`
- **Toggle camera angles:** `C` (chase cam → hood cam → cinematic orbit)
- **Reset/flip vehicle:** `R`

### Free-Roam & Mini-Challenges
Explore the coastal peninsula freely — drive roads, cut through grass and sand, hit jumps and destructible props. Optional glowing checkpoint time-trials are scattered around the map (e.g., **Boardwalk Sprint**, **Trailer Park Slalom**, **Dune Run**). Drive through the starting gate, then hit each checkpoint gate in order. Best times persist in `localStorage`.

### HUD
- **Speedometer:** current speed
- **Current vehicle indicator:** which of the five vehicles you\re driving

## Core Gameplay Loop & Controls

### Controls
- **Drive/steer:** W/S/A/D or Arrow keys
- **Handbrake/drift:** Space
- **Boost/sprint:** Shift
- **Toggle camera angles:** C (chase cam → hood cam → cinematic orbit)
- **Reset/flip vehicle:** R

### Free-Roam & Mini-Challenges
Explore the coastal peninsula freely — drive roads, cut through grass and sand, hit jumps and destructible props. Optional glowing checkpoint time-trials are scattered around the map (e.g., Boardwalk Sprint, Trailer Park Slalom, Dune Run). Drive through the starting gate, then hit each checkpoint gate in order. Best times persist in localStorage.

### HUD
- **Speedometer:** current speed
- **Current vehicle indicator:** which of the five vehicles you're driving
- **Mini-map:** shows roads, water, and checkpoints
- **Procedural Web Audio API engine sounds:** distinct pitch/tone per vehicle, changing with speed
