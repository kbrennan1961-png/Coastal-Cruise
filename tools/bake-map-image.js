/* Bake map.png into the embedded texture table for the offline full map.
   Run from anywhere: node tools/bake-map-image.js

   The enlarged planner shows this picture north-up, without rotating or
   rebuilding it from the road graph. Base64 in GeneratedAssets.js keeps the
   game playable from file:// with no runtime map.png fetch. */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MAP = path.join(ROOT, 'map.png');
const OUT = path.join(ROOT, 'js', 'GeneratedAssets.js');
const KEY = 'mapFull';

const marker = 'CC.GeneratedAssets = { textures: ';
const separator = ',\n    models:';

const source = fs.readFileSync(OUT, 'utf8');
const start = source.indexOf(marker);
if (start < 0) throw new Error('Could not find GeneratedAssets texture table');
const tableStart = start + marker.length;
const tableEnd = source.indexOf(separator, tableStart);
if (tableEnd < 0) throw new Error('Could not find end of GeneratedAssets texture table');

const textures = JSON.parse(source.slice(tableStart, tableEnd));
const png = fs.readFileSync(MAP);
textures[KEY] = 'data:image/png;base64,' + png.toString('base64');

const replacement = JSON.stringify(textures);
fs.writeFileSync(OUT, source.slice(0, tableStart) + replacement + source.slice(tableEnd));
console.log('baked', KEY, png.length, 'bytes from', MAP);
