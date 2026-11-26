#!/usr/bin/env node
/* One-command bridge between the map editor patch and Blender 3.6.
   Usage:
     node tools/blender-map-bridge.js to-blender js/MapEdits.js map.blend
     node tools/blender-map-bridge.js to-editor map.blend patch.json
   Set BLENDER=/path/to/blender to override the default macOS location. */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const BLENDER = process.env.BLENDER || '/Applications/Blender.app/Contents/MacOS/Blender';

function fail(message) {
  console.error('blender-map-bridge: ' + message);
  process.exit(1);
}

function abs(p) {
  return path.resolve(process.cwd(), p);
}

function ensureParent(p) {
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function run(args) {
  if (!fs.existsSync(BLENDER)) {
    fail('Blender not found at ' + BLENDER + '. Set BLENDER=/path/to/blender.');
  }
  const result = spawnSync(BLENDER, args, { stdio: 'inherit' });
  if (result.error) fail(result.error.message);
  if (result.status !== 0) process.exit(result.status || 1);
}

function usage() {
  console.log('Coastal Cruise Blender 3.6 map bridge\n\n' +
    '  node tools/blender-map-bridge.js to-blender <patch.js|patch.json> [out.blend] [--proxies]\n' +
    '  node tools/blender-map-bridge.js to-editor <scene.blend> [out.json]\n\n' +
    'Environment:\n' +
    '  BLENDER   Path to Blender (default: /Applications/Blender.app/Contents/MacOS/Blender)\n');
}

function main() {
  const argv = process.argv.slice(2);
  if (!argv.length || argv[0] === '--help' || argv[0] === '-h') {
    usage();
    return;
  }
  const command = argv.shift();
  if (command === 'to-blender') {
    const proxies = argv.indexOf('--proxies') !== -1;
    const rest = argv.filter(function (a) { return a !== '--proxies'; });
    const input = rest[0];
    const output = rest[1] || path.join(ROOT, 'capture', 'map.blend');
    if (!input) fail('to-blender needs a MapEdits.js or patch JSON path.');
    ensureParent(abs(output));
    const args = ['-b', '--python', path.join(ROOT, 'tools', 'blender_map_import.py'), '--', abs(input), '--clear'];
    if (proxies) args.push('--proxies');
    args.push('--save', abs(output));
    run(args);
    console.log('Saved Blender scene: ' + abs(output));
    return;
  }
  if (command === 'to-editor') {
    const blend = argv[0];
    const output = argv[1] || path.join(ROOT, 'capture', 'map-patch.json');
    if (!blend) fail('to-editor needs a .blend scene path.');
    ensureParent(abs(output));
    run(['-b', abs(blend), '--python', path.join(ROOT, 'tools', 'blender_map_export.py'), '--', abs(output)]);
    console.log('Saved editor patch: ' + abs(output));
    return;
  }
  usage();
  fail('Unknown command: ' + command);
}

main();
