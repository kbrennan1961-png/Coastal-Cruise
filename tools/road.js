#!/usr/bin/env node
/* Road editing helper for Coastal Cruise.
 * Usage:
 *   node tools/road.js near <x> <z> [radius=60]   - show road points/segments near coord
 *   node tools/road.js roads [filter]              - list road names from config/imagemap
 *
 * Read-only inspector; use output to make targeted edits in js/config.js or js/imagemap.js.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const files = ['js/config.js', 'js/imagemap.js'].map(f => path.join(root, f)).filter(fs.existsSync);

function extractRoads(text, file) {
  const roads = [];
  const nameRe = /name:\s*['"]([^'"]+)['"]/g;
  let nm;
  while ((nm = nameRe.exec(text))) {
    const name = nm[1];
    // Look ahead for points array within a reasonable window (same object)
    const window = text.slice(nm.index, nm.index + 4000);
    const ptsM = window.match(/points:\s*(\[\s*\[[\s\S]*?\]\s*\])\s*[,}]/);
    if (!ptsM) continue;
    // Make sure there isn't another name: before points: that is closer? no, we started at name
    const beforePts = window.slice(0, ptsM.index);
    if (/name:\s*['"]/.test(beforePts.replace(/^name:\s*['"][^'"]+['"]/, ''))) continue;
    const pts = [];
    const pRe = /\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]/g;
    let pm;
    while ((pm = pRe.exec(ptsM[1]))) pts.push([Number(pm[1]), Number(pm[2])]);
    if (!pts.length) continue;
    const block = window.slice(0, ptsM.index + ptsM[0].length + 50);
    const closed = /closed:\s*true/.test(block);
    const width = (block.match(/width:\s*(\d+(?:\.\d+)?)/) || [])[1];
    const type = (block.match(/type:\s*['"]([^'"]+)['"]/) || [])[1];
    roads.push({ file: path.relative(root, file), name, closed, width: width ? Number(width) : undefined, type, points: pts, index: nm.index });
  }
  const out = [];
  const seen = new Set();
  for (const r of roads) {
    const k = r.file + '|' + r.name + '|' + r.index;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

function loadRoads() {
  const all = [];
  for (const f of files) all.push(...extractRoads(fs.readFileSync(f, 'utf8'), f));
  return all;
}

function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
function pointSegDist(p, a, b) {
  const abx = b[0] - a[0], abz = b[1] - a[1];
  const apx = p[0] - a[0], apz = p[1] - a[1];
  const ab2 = abx * abx + abz * abz;
  const t = ab2 ? Math.max(0, Math.min(1, (apx * abx + apz * abz) / ab2)) : 0;
  const cx = a[0] + abx * t, cz = a[1] + abz * t;
  return { d: Math.hypot(p[0] - cx, p[1] - cz), t, cx, cz };
}

function cmdNear(x, z, radius) {
  const P = [Number(x), Number(z)];
  const r = Number(radius || 60);
  const roads = loadRoads();
  const hits = [];
  for (const road of roads) {
    road.points.forEach((pt, i) => {
      const d = dist(P, pt);
      if (d <= r) hits.push({ kind: 'point', d, road, i, pt });
    });
    for (let i = 0; i < road.points.length - 1; i++) {
      const a = road.points[i], b = road.points[i + 1];
      const ps = pointSegDist(P, a, b);
      if (ps.d <= r) hits.push({ kind: 'seg', d: ps.d, road, i, a, b, proj: [ps.cx, ps.cz], t: ps.t });
    }
  }
  hits.sort((a, b) => a.d - b.d || (a.kind === 'point' ? -1 : 1));
  console.log(`Near (${P[0]}, ${P[1]}) radius ${r}`);
  for (const h of hits.slice(0, 40)) {
    if (h.kind === 'point') {
      console.log(`  [point] d=${h.d.toFixed(1)}  ${h.road.file}  ${h.road.name}  pts[${h.i}]=[${h.pt[0]},${h.pt[1]}]  ${h.road.closed ? 'closed' : 'open'} w=${h.road.width || '?'}`);
    } else {
      console.log(`  [seg]   d=${h.d.toFixed(1)}  ${h.road.file}  ${h.road.name}  seg ${h.i}-${h.i + 1} [${h.a[0]},${h.a[1]}]->[${h.b[0]},${h.b[1]}] proj=[${h.proj[0].toFixed(1)},${h.proj[1].toFixed(1)}] t=${h.t.toFixed(2)}`);
    }
  }
  if (!hits.length) console.log('  (no hits)');
}

function cmdRoads(filter) {
  const roads = loadRoads();
  const f = (filter || '').toLowerCase();
  for (const r of roads) {
    if (f && !r.name.toLowerCase().includes(f)) continue;
    console.log(`${r.file}\t${r.name}\t${r.closed ? 'closed' : 'open'}\tw=${r.width || '?'}\tpts=${r.points.length}\t${JSON.stringify(r.points[0])} -> ${JSON.stringify(r.points[r.points.length - 1])}`);
  }
}

const [,, cmd, ...args] = process.argv;
if (cmd === 'near') cmdNear(args[0], args[1], args[2]);
else if (cmd === 'roads') cmdRoads(args[0]);
else {
  console.log('Usage:\n  node tools/road.js near <x> <z> [radius=60]\n  node tools/road.js roads [filter]');
  process.exit(cmd ? 1 : 0);
}
