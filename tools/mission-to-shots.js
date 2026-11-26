#!/usr/bin/env node
/* Convert a map-editor mission patch into trailer/cutscene shots.

  node tools/mission-to-shots.js js/MapEdits.js --out capture/mission-shots.json
  npm run trailer -- --shots capture/mission-shots.json --no-music

Accepts MapEdits.js (CC.mapEdits = {...}) or plain patch JSON. The generated
shots are ordinary trailer shots, so INAV WAYPOINT / POSHOLD_TIME / SET_POI /
JUMP / LAND actions become camera moves, holds, looks and cuts. RTH is appended
automatically because the planner always ends missions with return-to-home. */
'use strict';

const fs = require('fs');
const path = require('path');
const MissionShots = require('../js/MissionShots.js');

function value(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function number(flag, fallback) {
  const n = Number(value(flag, String(fallback)));
  return Number.isFinite(n) ? n : fallback;
}

function help() {
  console.log(`INAV mission -> trailer shots

Usage:
  node tools/mission-to-shots.js <MapEdits.js|patch.json> [options]

Options:
  --out FILE         Shot JSON to write (default capture/mission-shots.json)
  --mission N        Mission index to convert (default 0)
  --vehicle KEY      Trailer vehicle (default fpv)
  --camera N         Camera mode (default 1, forward view)
  --min-seconds N    Minimum shot length (default 1)
  --max-seconds N    Maximum shot length (default 20)
  --help             Show this text
`);
}

function readPatch(file) {
  const abs = path.resolve(process.cwd(), file);
  const text = fs.readFileSync(abs, 'utf8');
  const marker = 'CC.mapEdits = ';
  const start = text.indexOf(marker);
  if (start < 0) return JSON.parse(text);
  const brace = text.indexOf('{', start + marker.length);
  let depth = 0, inString = false, escaped = false;
  for (let i = brace; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (!depth) return JSON.parse(text.slice(brace, i + 1));
    }
  }
  throw new Error('Unterminated CC.mapEdits object in ' + abs);
}

function main() {
  if (process.argv.includes('--help')) { help(); return; }
  const file = process.argv[2];
  if (!file) throw new Error('A MapEdits.js or patch JSON file is required.');

  const out = path.resolve(process.cwd(),
    value('--out', path.join('capture', 'mission-shots.json')));
  const result = MissionShots.toShots(readPatch(file), {
    missionIndex: number('--mission', 0),
    vehicle: value('--vehicle', 'fpv'),
    camera: number('--camera', 1),
    minSeconds: number('--min-seconds', 1),
    maxSeconds: number('--max-seconds', 20)
  });
  if (!result.shots.length) throw new Error('The selected mission has no actions.');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(result, null, 2));
  console.log('Wrote ' + result.shots.length + ' shots from "' + result.mission +
    '" to ' + out);
  console.log('Render: npm run trailer -- --shots ' + path.relative(process.cwd(), out));
}

try { main(); } catch (err) {
  console.error('mission-to-shots: ' + (err && err.message ? err.message : err));
  process.exit(1);
}
