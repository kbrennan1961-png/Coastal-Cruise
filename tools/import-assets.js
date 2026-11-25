/* Bake CC0 low-poly assets into js/GeneratedAssets.js.
 *
 * Sources:
 *  - Rgsdev "Free Low Poly Vehicles Pack" (CC0), exported to GLB with
 *    tools/export-vehicles.py.
 *  - Avramania "Nature & Terrain, Free edition" (CC0), GLB folder.
 *  - Elegant Crow "Retro House Pack" (CC0), GLB folder.
 *  - Elbolilloduro "Trailer Park" and "Bus stop" (CC0), exported to GLB with Blender
 *    (tools/export-trailer-park.py and tools/export-bus-stop.py).
 *
 * Usage:
 *   node tools/import-assets.js <vehicle-glb> <nature-glb> <house-glb> <trailer-glb> <output.js>
 *
 * The generated file embeds geometry and PNG palettes as base64, so the game
 * never has to fetch a local model over file://.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const vehicleFiles = [
  ['vehicle_sedan.glb', 'sedan'], ['vehicle_hatchback.glb', 'hatchback'],
  ['vehicle_muscle.glb', 'muscle'], ['vehicle_sports.glb', 'sports'],
  ['vehicle_roadster.glb', 'roadster'], ['vehicle_pickup.glb', 'pickup'],
  ['vehicle_truck.glb', 'boxTruck'], ['vehicle_suv.glb', 'suv'],
  ['vehicle_van.glb', 'van'], ['vehicle_police.glb', 'police'],
  // Extra CC0 vehicles from the Rgsdev pack.
  ['vehicle_ambulance.glb', 'ambulance'], ['vehicle_bus.glb', 'bus'],
  ['vehicle_firetruck.glb', 'firetruck'], ['vehicle_limo.glb', 'limo'],
  ['vehicle_monster.glb', 'monster'], ['vehicle_muscle2.glb', 'muscle2'],
  ['vehicle_taxi.glb', 'taxi'], ['vehicle_trailertruck.glb', 'trailerTruck'],
  // CC0 low-poly cars from Designersoup.
  ['vehicle_beatall.glb', 'beatall'], ['vehicle_landyroamer.glb', 'landyRoamer'],
  ['vehicle_toyoyo.glb', 'toyoyo'], ['vehicle_tristar.glb', 'tristar'],
  ['vehicle_dlorean.glb', 'dlorean']
];
const natureFiles = [
  ['mdvl_nature_pine_01.glb', 'pine'], ['mdvl_nature_oak_01.glb', 'oak'],
  ['mdvl_nature_birch_01.glb', 'birch'], ['mdvl_nature_deadtree_01.glb', 'deadTree'],
  ['mdvl_nature_bush_01.glb', 'bush'], ['mdvl_nature_fern_01.glb', 'fern'],
  ['mdvl_nature_grass_01.glb', 'grass'], ['mdvl_nature_flowers_01.glb', 'flowers'],
  ['mdvl_nature_rocks_01.glb', 'rocks'], ['mdvl_nature_boulder_01.glb', 'boulder'],
  ['mdvl_nature_stump_01.glb', 'stump'], ['mdvl_nature_lilypad_01.glb', 'lilyPad']
];
const houseFiles = [
  ['house1.glb', 'retro1'], ['house2.glb', 'retro2'], ['house3.glb', 'retro3'],
  ['house4.glb', 'retro4'], ['house5.glb', 'retro5']
];
const trailerFiles = [
  ['home.glb', 'trailer1'], ['home01.glb', 'trailer2'], ['home02.glb', 'trailer3'],
  ['home03.glb', 'trailer4'], ['home04.glb', 'trailer5'], ['home05.glb', 'trailer6']
];
const busStopFiles = [['bus_stop.glb', 'busStop']];

function readGLB(file) {
  const data = fs.readFileSync(file);
  if (data.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB: ' + file);
  let off = 12, json = null, binary = null;
  while (off + 8 <= data.length) {
    const len = data.readUInt32LE(off);
    const type = Buffer.from(data.slice(off + 4, off + 8)).toString('ascii');
    const chunk = data.slice(off + 8, off + 8 + len);
    if (type === 'JSON') json = JSON.parse(chunk.toString('utf8'));
    if (type === 'BIN\0') binary = chunk;
    off += 8 + len;
  }
  if (!json || !binary) throw new Error('incomplete GLB: ' + file);
  return { json, binary };
}

function matMul(a, b) {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let v = 0;
      for (let k = 0; k < 4; k++) v += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = v;
    }
  }
  return out;
}
function nodeMatrix(node) {
  if (node.matrix) return new Float32Array(node.matrix);
  const t = node.translation || [0, 0, 0];
  const q = node.rotation || [0, 0, 0, 1];
  const s = node.scale || [1, 1, 1];
  const x = q[0], y = q[1], z = q[2], w = q[3];
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return new Float32Array([
    (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
    (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
    (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1
  ]);
}
function transformPoint(m, p) {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]
  ];
}
function transformDir(m, p) {
  const v = [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2]
  ];
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

const COMPONENT = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
function readAccessor(glb, index, asFloat) {
  const a = glb.json.accessors[index];
  const view = glb.json.bufferViews[a.bufferView];
  const comps = COMPONENTS[a.type];
  const csize = COMPONENT[a.componentType];
  const stride = view.byteStride || comps * csize;
  const base = (view.byteOffset || 0) + (a.byteOffset || 0);
  const out = asFloat ? new Float32Array(a.count * comps)
    : a.componentType === 5125 ? new Uint32Array(a.count * comps)
      : new Uint16Array(a.count * comps);
  const dv = new DataView(glb.binary.buffer, glb.binary.byteOffset, glb.binary.byteLength);
  for (let i = 0; i < a.count; i++) {
    for (let c = 0; c < comps; c++) {
      const o = base + i * stride + c * csize;
      let v = 0;
      if (a.componentType === 5126) v = dv.getFloat32(o, true);
      else if (a.componentType === 5125) v = dv.getUint32(o, true);
      else if (a.componentType === 5123) v = dv.getUint16(o, true);
      else if (a.componentType === 5122) v = dv.getInt16(o, true);
      else if (a.componentType === 5121) v = dv.getUint8(o);
      else v = dv.getInt8(o);
      out[i * comps + c] = v;
    }
  }
  return out;
}

function b64(array) {
  return Buffer.from(array.buffer, array.byteOffset, array.byteLength).toString('base64');
}
function roleForMaterial(name) {
  const n = (name || '').toLowerCase();
  if (/siren.*red|flashers.*red/.test(n)) return 'sirenRed';
  if (/siren.*blue|flashers.*blue/.test(n)) return 'sirenBlue';
  if (/headlight/.test(n)) return 'head';
  if (/rear light|taillight/.test(n)) return 'brake';
  if (/window|glass/.test(n)) return 'glass';
  if (/body black/.test(n)) return 'trimDark';
  if (/body white/.test(n)) return 'bodyAccent';
  if (/body/.test(n)) return 'body';
  if (/tire/.test(n)) return 'tire';
  return 'trim';
}
function imageData(glb, index) {
  const image = glb.json.images[index];
  if (!image) return null;
  if (image.uri && /^data:/.test(image.uri)) return image.uri;
  if (image.bufferView == null) return null;
  const view = glb.json.bufferViews[image.bufferView];
  const start = (view.byteOffset || 0);
  const bytes = glb.binary.slice(start, start + view.byteLength);
  return 'data:' + (image.mimeType || 'image/png') + ';base64,' + bytes.toString('base64');
}
function safeKey(name) {
  return String(name || 'part').replace(/[^A-Za-z0-9_]/g, '_');
}
function materialTexture(glb, prim) {
  if (prim.material == null) return null;
  const material = glb.json.materials[prim.material];
  if (!material || !material.pbrMetallicRoughness) return null;
  const tex = material.pbrMetallicRoughness.baseColorTexture;
  if (!tex) return null;
  return imageData(glb, tex.index);
}

function parseModel(glb, opts) {
  const nodes = glb.json.nodes || [];
  const world = new Array(nodes.length).fill(null);
  const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  function visit(i, parent) {
    const n = nodes[i];
    const m = matMul(parent, nodeMatrix(n));
    world[i] = m;
    (n.children || []).forEach(function (child) { visit(child, m); });
  }
  const roots = glb.json.scenes && glb.json.scenes[0] && glb.json.scenes[0].nodes;
  (roots || nodes.map(function (_, i) { return i; })).forEach(function (i) { visit(i, identity); });

  const groups = {};
  const wheels = [];
  const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  nodes.forEach(function (node, ni) {
    if (node.mesh == null || !world[ni]) return;
    const name = node.name || '';
    if (opts.vehicles && /wheel/i.test(name)) {
      const p = transformPoint(world[ni], [0, 0, 0]);
      wheels.push({ x: +p[0].toFixed(3), y: +p[1].toFixed(3), z: +p[2].toFixed(3) });
      return;
    }
    const mesh = glb.json.meshes[node.mesh];
    mesh.primitives.forEach(function (prim) {
      const mode = prim.mode == null ? 4 : prim.mode;
      if (mode !== 4) return;
      const srcPos = readAccessor(glb, prim.attributes.POSITION, true);
      const srcNorm = prim.attributes.NORMAL != null
        ? readAccessor(glb, prim.attributes.NORMAL, true) : null;
      const srcUv = prim.attributes.TEXCOORD_0 != null
        ? readAccessor(glb, prim.attributes.TEXCOORD_0, true) : null;
      const srcIdx = prim.indices != null ? readAccessor(glb, prim.indices, false) : null;
      const count = srcPos.length / 3;
      const pos = new Float32Array(count * 3);
      const norm = new Float32Array(count * 3);
      const uv = new Float32Array(count * 2);
      for (let i = 0; i < count; i++) {
        const p = transformPoint(world[ni], [srcPos[i * 3], srcPos[i * 3 + 1], srcPos[i * 3 + 2]]);
        pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = p[2];
        for (let k = 0; k < 3; k++) {
          bounds.min[k] = Math.min(bounds.min[k], p[k]);
          bounds.max[k] = Math.max(bounds.max[k], p[k]);
        }
        if (srcNorm) {
          const n = transformDir(world[ni], [srcNorm[i * 3], srcNorm[i * 3 + 1], srcNorm[i * 3 + 2]]);
          norm[i * 3] = n[0]; norm[i * 3 + 1] = n[1]; norm[i * 3 + 2] = n[2];
        }
        if (srcUv) { uv[i * 2] = srcUv[i * 2]; uv[i * 2 + 1] = srcUv[i * 2 + 1]; }
      }
      let role = 'palette';
      let textureKey = null;
      let textureURI = null;
      if (opts.vehicles) {
        const mat = glb.json.materials[prim.material];
        role = roleForMaterial(mat && mat.name);
      } else if (opts.house) {
        role = /window/i.test(name) ? 'glass' : /door/i.test(name) ? 'door' : 'body';
      } else if (opts.trailer) {
        const mat = glb.json.materials[prim.material];
        role = safeKey(mat && mat.name);
        textureKey = 'trailer_' + role;
        textureURI = materialTexture(glb, prim);
      } else if (opts.prop) {
        const mat = glb.json.materials[prim.material];
        role = safeKey(mat && mat.name);
        textureKey = 'busStop_' + role;
        textureURI = materialTexture(glb, prim);
      } else if (opts.textureKey) {
        textureURI = materialTexture(glb, prim) || primTexture(glb);
      }
      if (!groups[role]) {
        groups[role] = {
          pos: [], norm: [], uv: [], idx: [], count: 0,
          textureKey: textureKey, textureURI: textureURI
        };
      }
      const g = groups[role], offset = g.count;
      for (let i = 0; i < pos.length; i++) g.pos.push(pos[i]);
      for (let i = 0; i < norm.length; i++) g.norm.push(norm[i]);
      for (let i = 0; i < uv.length; i++) g.uv.push(uv[i]);
      if (srcIdx) {
        for (let i = 0; i < srcIdx.length; i++) g.idx.push(offset + srcIdx[i]);
      } else {
        for (let i = 0; i < count; i++) g.idx.push(offset + i);
      }
      g.count += count;
    });
  });
  // Buildings are instanced around their plot centre, so bake a local origin
  // and a ground-level floor into the geometry.
  if (opts.recenter && isFinite(bounds.min[0])) {
    const cx = (bounds.min[0] + bounds.max[0]) * 0.5;
    const cz = (bounds.min[2] + bounds.max[2]) * 0.5;
    const y0 = bounds.min[1];
    for (const role in groups) {
      const g = groups[role];
      for (let i = 0; i < g.pos.length; i += 3) {
        g.pos[i] -= cx; g.pos[i + 1] -= y0; g.pos[i + 2] -= cz;
      }
    }
    bounds.min[0] -= cx; bounds.max[0] -= cx;
    bounds.min[1] -= y0; bounds.max[1] -= y0;
    bounds.min[2] -= cz; bounds.max[2] -= cz;
  }
  const parts = Object.keys(groups).map(function (role) {
    const g = groups[role];
    const index = g.count > 65535 ? new Uint32Array(g.idx) : new Uint16Array(g.idx);
    const part = {
      role: role,
      position: b64(new Float32Array(g.pos)),
      normal: b64(new Float32Array(g.norm)),
      uv: b64(new Float32Array(g.uv)),
      indexType: index.BYTES_PER_ELEMENT === 4 ? 5125 : 5123,
      index: b64(index)
    };
    if (g.textureKey) {
      part.texture = g.textureKey;
      if (g.textureURI) part.textureURI = g.textureURI;
    }
    return part;
  });
  const model = { parts: parts, bounds: bounds };
  if (opts.vehicles) {
    model.wheels = wheels;
    model.scale = opts.scale || 1;
  }
  if (opts.textureKey) {
    model.texture = opts.textureKey;
    const p = primTexture(glb);
    if (p) model.textureURI = p;
  }
  return model;
}
function primTexture(glb) {
  const mat = glb.json.materials && glb.json.materials[0];
  if (!mat || !mat.pbrMetallicRoughness || !mat.pbrMetallicRoughness.baseColorTexture) return null;
  return imageData(glb, mat.pbrMetallicRoughness.baseColorTexture.index);
}

function main() {
  const [vehicleDir, natureDir, houseDir, trailerDir, output, busStopDir] = process.argv.slice(2);
  if (!vehicleDir || !natureDir || !houseDir || !trailerDir || !output) {
    throw new Error('usage: import-assets.js <vehicle-glb> <nature-glb> <house-glb> <trailer-glb> <output.js> [bus-stop-glb]');
  }
  const textures = {};
  const models = {};
  vehicleFiles.forEach(function (entry) {
    const glb = readGLB(path.join(vehicleDir, entry[0]));
    const scales = { sedan: 0.95, hatchback: 0.95, muscle: 0.92, sports: 0.92,
      roadster: 0.92, pickup: 0.94, boxTruck: 0.78, suv: 0.9, van: 0.86, police: 0.95,
      ambulance: 0.85, bus: 0.65, firetruck: 0.62, limo: 0.55, monster: 0.9,
      muscle2: 0.82, taxi: 0.95, trailerTruck: 0.5,
      beatall: 1.35, landyRoamer: 1.2, toyoyo: 1.05, tristar: 1.1, dlorean: 1.05 };
    models[entry[1]] = parseModel(glb, { vehicles: true, scale: scales[entry[1]] });
  });
  natureFiles.forEach(function (entry) {
    const glb = readGLB(path.join(natureDir, entry[0]));
    const model = parseModel(glb, { textureKey: entry[1] });
    if (model.textureURI) textures[entry[1]] = model.textureURI;
    delete model.textureURI;
    models[entry[1]] = model;
  });
  houseFiles.forEach(function (entry) {
    const glb = readGLB(path.join(houseDir, entry[0]));
    const model = parseModel(glb, { house: true, recenter: true });
    model.kind = 'house';
    models[entry[1]] = model;
  });
  trailerFiles.forEach(function (entry) {
    const glb = readGLB(path.join(trailerDir, entry[0]));
    const model = parseModel(glb, { trailer: true, recenter: true, parentKey: entry[1] });
    model.kind = 'trailer';
    model.parts.forEach(function (part) {
      if (part.textureURI) {
        textures[part.texture] = part.textureURI;
        delete part.textureURI;
      }
    });
    models[entry[1]] = model;
  });
  if (busStopDir) {
    busStopFiles.forEach(function (entry) {
      const glb = readGLB(path.join(busStopDir, entry[0]));
      const model = parseModel(glb, { prop: true, recenter: false });
      model.kind = 'prop';
      model.parts.forEach(function (part) {
        if (part.textureURI) {
          textures[part.texture] = part.textureURI;
          delete part.textureURI;
        }
      });
      models[entry[1]] = model;
    });
  }
  const body = '/* Generated by tools/import-assets.js - CC0 assets, embedded for file:// use. */\n' +
    '(function () {\n  \'use strict\';\n  const CC = window.CC = window.CC || {};\n' +
    '  CC.GeneratedAssets = { textures: ' + JSON.stringify(textures) + ',\n' +
    '    models: ' + JSON.stringify(models) + ' };\n})();\n';
  fs.writeFileSync(output, body);
  console.log('wrote', output, (body.length / 1024 / 1024).toFixed(2) + ' MB',
    Object.keys(models).length, 'models');
}
main();
