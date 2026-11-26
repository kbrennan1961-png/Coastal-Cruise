/* Bake the user-supplied rock and character packs into js/DownloadedAssets.js.
 *
 * Sources (all local to the user's Downloads folder):
 *  - rocks.rar -> rocks.fbx + two 128x128 PNGs.
 *  - LowPolyLanka_PSX_Villagers_FREE_Sample_v1.0.zip -> six animated GLBs.
 *  - Characters_psx.rar -> six skinned FBX models converted with FBX2glTF plus
 *    their original 512x512 PNG texture atlases.
 *
 * Usage:
 *   node tools/import-downloaded-assets.js <repo-root> <output.js>
 *
 * Rock geometry is converted to the same baked part format used by
 * GeneratedAssets.js. Animated characters stay as GLB bytes so GLTFLoader can
 * reconstruct their skeletons and clips at runtime. Everything is embedded as
 * data URIs, so no fetch/CORS is required when opening index.html directly.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const COMPONENT = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

function readGLB(file) {
  const data = fs.readFileSync(file);
  if (data.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB: ' + file);
  let off = 12;
  let json = null;
  let binary = null;
  while (off + 8 <= data.length) {
    const len = data.readUInt32LE(off);
    const type = data.slice(off + 4, off + 8).toString('ascii');
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

function dataURI(file, mime) {
  return 'data:' + (mime || 'image/png') + ';base64,' + fs.readFileSync(file).toString('base64');
}

// Bake a static GLB prop (the F-16) into the same part format used by
// GeneratedAssets. Each glTF material becomes one part carrying its own
// baseColorFactor so the desert camo and Star-of-David roundels keep their
// colours without needing a texture atlas.
function bakeStaticProp(glb, targetHeight) {
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
  const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  nodes.forEach(function (node, ni) {
    if (node.mesh == null || !world[ni]) return;
    const mesh = glb.json.meshes[node.mesh];
    mesh.primitives.forEach(function (prim) {
      if ((prim.mode == null ? 4 : prim.mode) !== 4) return;
      const srcPos = readAccessor(glb, prim.attributes.POSITION, true);
      const srcNorm = prim.attributes.NORMAL != null
        ? readAccessor(glb, prim.attributes.NORMAL, true) : null;
      const srcIdx = prim.indices != null ? readAccessor(glb, prim.indices, false) : null;
      const count = srcPos.length / 3;
      const pos = new Float32Array(count * 3);
      const norm = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const p = transformPoint(world[ni], [srcPos[i * 3], srcPos[i * 3 + 1], srcPos[i * 3 + 2]]);
        // Blender GLB was authored Y=up/Z=length; map to game X=span,
        // Y=height, Z=length (nose toward +Z).
        pos[i * 3] = p[0]; pos[i * 3 + 1] = p[2]; pos[i * 3 + 2] = p[1];
        for (let k = 0; k < 3; k++) {
          bounds.min[k] = Math.min(bounds.min[k], pos[i * 3 + k]);
          bounds.max[k] = Math.max(bounds.max[k], pos[i * 3 + k]);
        }
        if (srcNorm) {
          const n = transformDir(world[ni], [srcNorm[i * 3], srcNorm[i * 3 + 1], srcNorm[i * 3 + 2]]);
          norm[i * 3] = n[0]; norm[i * 3 + 1] = n[2]; norm[i * 3 + 2] = n[1];
        }
      }
      const material = glb.json.materials && prim.material != null
        ? glb.json.materials[prim.material] : null;
      const name = material && material.name || 'prop';
      const factor = material && material.pbrMetallicRoughness &&
        material.pbrMetallicRoughness.baseColorFactor || [0.8, 0.8, 0.8, 1];
      const color = (Math.round((factor[0] || 0) * 255) << 16) |
        (Math.round((factor[1] || 0) * 255) << 8) |
        Math.round((factor[2] || 0) * 255);
      const role = name.replace(/[^A-Za-z0-9]/g, '');
      if (!groups[role]) groups[role] = { pos: [], norm: [], idx: [], count: 0, color: color };
      const g = groups[role], offset = g.count;
      for (let i = 0; i < pos.length; i++) g.pos.push(pos[i]);
      for (let i = 0; i < norm.length; i++) g.norm.push(norm[i]);
      if (srcIdx) {
        for (let i = 0; i < srcIdx.length; i++) g.idx.push(offset + srcIdx[i]);
      } else {
        for (let i = 0; i < count; i++) g.idx.push(offset + i);
      }
      g.count += count;
    });
  });

  // Recenter on the ground and scale to the requested height.
  const cx = (bounds.min[0] + bounds.max[0]) * 0.5;
  const cz = (bounds.min[2] + bounds.max[2]) * 0.5;
  const y0 = bounds.min[1];
  const scale = targetHeight / Math.max(0.0001, bounds.max[1] - bounds.min[1]);
  const parts = Object.keys(groups).map(function (role) {
    const g = groups[role];
    const pos = new Float32Array(g.pos.length);
    for (let i = 0; i < g.pos.length; i += 3) {
      pos[i] = (g.pos[i] - cx) * scale;
      pos[i + 1] = (g.pos[i + 1] - y0) * scale;
      pos[i + 2] = (g.pos[i + 2] - cz) * scale;
    }
    const index = g.count > 65535 ? new Uint32Array(g.idx) : new Uint16Array(g.idx);
    const uv = new Float32Array(g.count * 2);
    return {
      role: role,
      color: g.color,
      position: b64(pos),
      normal: b64(new Float32Array(g.norm)),
      uv: b64(uv),
      indexType: index.BYTES_PER_ELEMENT === 4 ? 5125 : 5123,
      index: b64(index)
    };
  });
  return {
    parts: parts,
    bounds: {
      min: [(bounds.min[0] - cx) * scale, 0, (bounds.min[2] - cz) * scale],
      max: [(bounds.max[0] - cx) * scale, targetHeight, (bounds.max[2] - cz) * scale]
    }
  };
}

// Tiny replacement geometry so baked animated characters still show up in the
// editor's model list, footprint math and static fallbacks. The runtime swaps
// this marker for the real skinned GLB when the asset kind is "character".
function bakeMarker(width, height, depth) {
  const x = width / 2, y = height, z = depth / 2;
  const faces = [
    [[-x, 0, -z], [x, 0, -z], [x, y, -z], [-x, y, -z], [0, 0, -1]],
    [[x, 0, z], [-x, 0, z], [-x, y, z], [x, y, z], [0, 0, 1]],
    [[-x, 0, z], [-x, 0, -z], [-x, y, -z], [-x, y, z], [-1, 0, 0]],
    [[x, 0, -z], [x, 0, z], [x, y, z], [x, y, -z], [1, 0, 0]],
    [[-x, y, -z], [x, y, -z], [x, y, z], [-x, y, z], [0, 1, 0]],
    [[-x, 0, z], [x, 0, z], [x, 0, -z], [-x, 0, -z], [0, -1, 0]]
  ];
  const pos = [], norm = [], uv = [], index = [];
  faces.forEach(function (face) {
    const base = pos.length / 3;
    const n = face[4];
    [0, 1, 2, 3].forEach(function (i, corner) {
      pos.push.apply(pos, face[i]);
      norm.push.apply(norm, n);
      uv.push(corner === 1 || corner === 2 ? 1 : 0, corner >= 2 ? 1 : 0);
    });
    index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  return {
    role: 'character',
    position: b64(new Float32Array(pos)),
    normal: b64(new Float32Array(norm)),
    uv: b64(new Float32Array(uv)),
    index: b64(new Uint16Array(index))
  };
}

function bakeRock(glb, nodeIndex, textureKey, targetHeight) {
  const nodes = glb.json.nodes || [];
  const world = new Array(nodes.length).fill(null);
  const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  function visit(i, parent) {
    const n = nodes[i];
    const m = matMul(parent, nodeMatrix(n));
    world[i] = m;
    (n.children || []).forEach((child) => visit(child, m));
  }
  const roots = glb.json.scenes && glb.json.scenes[0] && glb.json.scenes[0].nodes;
  (roots || nodes.map((_, i) => i)).forEach((i) => visit(i, identity));

  const node = nodes[nodeIndex];
  const mesh = glb.json.meshes[node.mesh];
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  const prims = [];
  mesh.primitives.forEach((prim) => {
    if ((prim.mode == null ? 4 : prim.mode) !== 4) return;
    const srcPos = readAccessor(glb, prim.attributes.POSITION, true);
    const srcNorm = prim.attributes.NORMAL != null
      ? readAccessor(glb, prim.attributes.NORMAL, true) : null;
    const srcUv = prim.attributes.TEXCOORD_0 != null
      ? readAccessor(glb, prim.attributes.TEXCOORD_0, true) : null;
    const count = srcPos.length / 3;
    const pos = new Float32Array(count * 3);
    const norm = new Float32Array(count * 3);
    const uv = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const p = transformPoint(world[nodeIndex], [srcPos[i * 3], srcPos[i * 3 + 1], srcPos[i * 3 + 2]]);
      pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = p[2];
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], p[k]);
        max[k] = Math.max(max[k], p[k]);
      }
      if (srcNorm) {
        const n = transformDir(world[nodeIndex], [srcNorm[i * 3], srcNorm[i * 3 + 1], srcNorm[i * 3 + 2]]);
        norm[i * 3] = n[0]; norm[i * 3 + 1] = n[1]; norm[i * 3 + 2] = n[2];
      }
      if (srcUv) { uv[i * 2] = srcUv[i * 2]; uv[i * 2 + 1] = srcUv[i * 2 + 1]; }
    }
    const idx = prim.indices != null ? readAccessor(glb, prim.indices, false) : null;
    const indices = idx ? Array.from(idx) : Array.from({ length: count }, (_, i) => i);
    prims.push({ pos, norm, uv, indices });
  });
  if (!prims.length) throw new Error('rock node has no triangles: ' + node.name);

  const cx = (min[0] + max[0]) * 0.5;
  const cz = (min[2] + max[2]) * 0.5;
  const scale = targetHeight / Math.max(0.0001, max[1] - min[1]);
  const pos = [];
  const norm = [];
  const uv = [];
  const index = [];
  let vertexCount = 0;
  prims.forEach((p) => {
    for (let i = 0; i < p.pos.length; i += 3) {
      pos.push((p.pos[i] - cx) * scale, (p.pos[i + 1] - min[1]) * scale, (p.pos[i + 2] - cz) * scale);
      norm.push(p.norm[i], p.norm[i + 1], p.norm[i + 2]);
    }
    for (let i = 0; i < p.uv.length; i++) uv.push(p.uv[i]);
    p.indices.forEach((v) => index.push(vertexCount + v));
    vertexCount += p.pos.length / 3;
  });
  const idxArray = vertexCount > 65535 ? new Uint32Array(index) : new Uint16Array(index);
  return {
    source: node.name,
    kind: 'downloadedRock',
    texture: textureKey,
    parts: [{
      role: 'stone',
      texture: textureKey,
      position: b64(new Float32Array(pos)),
      normal: b64(new Float32Array(norm)),
      uv: b64(new Float32Array(uv)),
      indexType: idxArray.BYTES_PER_ELEMENT === 4 ? 5125 : 5123,
      index: b64(idxArray)
    }],
    bounds: {
      min: [-((max[0] - min[0]) * 0.5 * scale), 0, -((max[2] - min[2]) * 0.5 * scale)],
      max: [(max[0] - min[0]) * 0.5 * scale, targetHeight, (max[2] - min[2]) * 0.5 * scale]
    }
  };
}

function main() {
  const [repo, output] = process.argv.slice(2);
  if (!repo || !output) {
    throw new Error('usage: import-downloaded-assets.js <repo-root> <output.js>');
  }
  const rockDir = path.join(repo, 'assets/rocks');
  const villagerDir = path.join(repo, 'assets/villagers_src/LowPolyLanka_PSX_Villagers_FREE_Sample_v1.0/Models');
  const charDir = path.join(repo, 'assets/characters_psx');
  const charTextures = path.join(charDir, 'Characters_psx/Textures');
  const charGLBs = path.join(charDir, 'converted');

  const textures = {
    downloadedRockA: dataURI(path.join(rockDir, 'rocks/Rocks.png')),
    downloadedRockB: dataURI(path.join(rockDir, 'rocks/Rokcs 2.png'))
  };

  const rockGLB = readGLB(path.join(rockDir, 'rocks_converted.glb'));
  const rockSpecs = [
    ['downloadedRock0', 'small rock', 0.8],
    ['downloadedRock1', 'mediun rock 2', 1.15],
    ['downloadedRock2', 'mediun rock', 1.35],
    ['downloadedRock3', 'mediun rock 3', 1.6],
    ['downloadedRock4', 'big rock', 2.4]
  ];
  const models = {};
  rockSpecs.forEach(([key, source, height]) => {
    const ni = rockGLB.json.nodes.findIndex((n) => n.name === source);
    if (ni < 0) throw new Error('missing rock node: ' + source);
    const matIndex = rockGLB.json.meshes[rockGLB.json.nodes[ni].mesh].primitives[0].material;
    const matName = (rockGLB.json.materials[matIndex].name || '').toLowerCase();
    const texKey = /stone\s*2/.test(matName) ? 'downloadedRockB' : 'downloadedRockA';
    models[key] = bakeRock(rockGLB, ni, texKey, height);
  });

  const villagers = [
    ['achchiA', path.join(villagerDir, 'PSX_Achchi/PSX_Achchi_A.glb'), 'Achchi (grey sari)', 'villager'],
    ['achchiB', path.join(villagerDir, 'PSX_Achchi/PSX_Achchi_B.glb'), 'Achchi (green sari)', 'villager'],
    ['achchiC', path.join(villagerDir, 'PSX_Achchi/PSX_Achchi_C.glb'), 'Achchi (blue sari)', 'villager'],
    ['driverA', path.join(villagerDir, 'PSX_TukTukDriver/PSX_TukTukDriver_A.glb'), 'Tuk-tuk driver (green)', 'driver'],
    ['driverB', path.join(villagerDir, 'PSX_TukTukDriver/PSX_TukTukDriver_B.glb'), 'Tuk-tuk driver (orange)', 'driver'],
    ['driverC', path.join(villagerDir, 'PSX_TukTukDriver/PSX_TukTukDriver_C.glb'), 'Tuk-tuk driver (blue)', 'driver']
  ];
  const villagerAssets = {};
  villagers.forEach(([key, file, label, kind]) => {
    villagerAssets[key] = {
      label,
      kind,
      glb: 'data:application/octet-stream;base64,' + fs.readFileSync(file).toString('base64'),
      animations: readGLB(file).json.animations.map((a) => a.name),
      pixelTextures: true
    };
  });

  const characters = [
    ['citizenA', 'Character_01', 'Character_01.png', 'Coastal resident'],
    ['citizenB', 'Character_12', 'Character_12.png', 'Coastal resident'],
    ['citizenC', 'Character_29', 'Character_29.png', 'Beach visitor'],
    ['police', 'Character_17_Police', 'Character_17_Police.png', 'Park ranger'],
    ['firefighter', 'Character_21_Female_Firefighter', 'Character_21_Female_Firefighter.png', 'Firefighter'],
    ['doctor', 'Character_23_Female_Doctor', 'Character_23_Female_Doctor.png', 'Clinic doctor']
  ];
  const characterAssets = {};
  characters.forEach(([key, stem, texture, label]) => {
    const file = path.join(charGLBs, stem + '.glb');
    characterAssets[key] = {
      label,
      kind: 'citizen',
      glb: 'data:application/octet-stream;base64,' + fs.readFileSync(file).toString('base64'),
      texture: dataURI(path.join(charTextures, texture)),
      animations: readGLB(file).json.animations.map((a) => a.name),
      pixelTextures: false
    };
  });

  // Locally authored Sketchfab characters. The redneck GLB gained Idle/Walk/
  // Run/Attack/Hit/Death clips in Blender; the cockroach ships with six clips.
  // Both stay embedded so the game never fetches an external file at runtime.
  const creatureDir = path.join(repo, 'assets/downloaded_src');
  const creatureSpecs = [
    ['redneck', 'redneck_animated.glb', 'Redneck', 'redneck', 0.9, 0.7],
    ['roach', 'giant_cockroach.glb', 'Giant cockroach', 'creature', 1.3, 1.4]
  ];
  const creatureAssets = {};
  creatureSpecs.forEach(([key, file, label, kind, width, depth]) => {
    const source = path.join(creatureDir, file);
    creatureAssets[key] = {
      label,
      kind,
      glb: 'data:application/octet-stream;base64,' + fs.readFileSync(source).toString('base64'),
      animations: readGLB(source).json.animations.map((a) => a.name),
      pixelTextures: false
    };
    models[key] = {
      source: label,
      kind: 'character',
      characterKey: key,
      parts: [bakeMarker(width, 1.9, depth)],
      bounds: {
        min: [-width / 2, 0, -depth / 2],
        max: [width / 2, 1.9, depth / 2]
      }
    };
  });

  // Static low-poly F-16 Barak. Baked without a texture atlas so the flat PSX
  // material colours and Star-of-David roundels survive in the offline build.
  const jetSource = path.join(creatureDir, 'f16_barak.glb');
  if (fs.existsSync(jetSource)) {
    models.f16 = bakeStaticProp(readGLB(jetSource), 4.6);
    models.f16.source = 'Israeli F-16 Barak (PSX)';
  }

  const body = '/* Generated by tools/import-downloaded-assets.js - local user assets. */\n' +
    '(function () {\n  \'use strict\';\n  const CC = window.CC = window.CC || {};\n' +
    '  const data = {\n' +
    '    textures: ' + JSON.stringify(textures) + ',\n' +
    '    models: ' + JSON.stringify(models) + ',\n' +
    '    villagers: ' + JSON.stringify(villagerAssets) + ',\n' +
    '    characters: ' + JSON.stringify(characterAssets) + ',\n' +
    '    creatures: ' + JSON.stringify(creatureAssets) + '\n' +
    '  };\n' +
    '  if (CC.GeneratedAssets) {\n' +
    '    Object.assign(CC.GeneratedAssets.textures, data.textures);\n' +
    '    Object.assign(CC.GeneratedAssets.models, data.models);\n' +
    '  }\n' +
    '  CC.DownloadedAssets = data;\n' +
    '})();\n';
  fs.writeFileSync(output, body);
  console.log('wrote', output, (body.length / 1024 / 1024).toFixed(2) + ' MB',
    Object.keys(models).length + ' models,', Object.keys(villagerAssets).length + ' villagers,',
    Object.keys(characterAssets).length + ' high-res characters,',
    Object.keys(creatureAssets).length + ' animated creatures');
}

main();
