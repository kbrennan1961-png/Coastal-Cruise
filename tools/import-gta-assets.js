/* Import GTA-era / community DFF + TXD assets into the Coastal Cruise editor.
 *
 * The conversion is deliberately done through Blender + the vendored open-source
 * DragonFF addon (tools/vendor/DragonFF). DFF geometry is imported, centred and
 * normalised, then exported as a GLB with embedded PNG textures. This script
 * bakes those GLBs into the same part format used by GeneratedAssets.js, adds
 * extracted TXD/PNG textures, and writes a categorized asset index for the
 * editor's "asset import" panel.
 *
 * Sources can be local GTA files or manually downloaded community packs from
 * GTAinside / LibertyCity.net. No account, password or reset link is needed.
 *
 * Usage:
 *   node tools/import-gta-assets.js \
 *     --source "/path/to/downloads" \
 *     --out js/CommunityAssets.js \
 *     --index assets/gta/asset-index.generated.json
 *
 * Optional:
 *   --asset barrel1.dff [--asset landstal.dff ...]
 *   --img /path/to/gta3.img
 *   --max 12
 *   --blender /Applications/Blender.app/Contents/MacOS/Blender
 *
 * Generated output contains GTA-derived geometry/textures. Do not commit it
 * unless you have confirmed redistribution rights for those specific files.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { DffParser, TxdParser } = require('rw-parser');
const { PNG } = require('pngjs');

const ROOT = path.resolve(__dirname, '..');
const COMPONENT = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

const CATEGORIES = [
  { key: 'textures', label: 'Textures' },
  { key: 'buildings', label: 'Buildings' },
  { key: 'roads', label: 'Roads' },
  { key: 'characters', label: 'Characters' },
  { key: 'vehicles', label: 'Vehicles' },
  { key: 'trees', label: 'Trees' },
  { key: 'props', label: 'Props' },
  { key: 'models', label: 'Models' }
];

const DEFAULT_ASSETS = [
  // Props and street furniture from gta3.img.
  'barrel1.dff', 'bin1.dff', 'trafficcone.dff', 'trafficlight1.dff',
  'lamppost1.dff', 'phonebooth1.dff', 'fenceshit.dff', 'crates.dff',
  // Vegetation.
  'pinetree01.dff', 'bush01_lvs.dff', 'rockbrkq.dff',
  // GTA-era vehicles.
  'landstal.dff', 'infernus.dff', 'copcarla.dff', 'bus.dff', 'taxi.dff'
];

const HEIGHTS = {
  textures: 0, buildings: 8, roads: 0.5, characters: 2,
  vehicles: 1.6, trees: 7, props: 2.5, models: 4
};

function parseArgs(argv) {
  const out = {
    source: '/Volumes/PS2/GTA San Andreas MODS',
    img: null,
    out: path.join(ROOT, 'js', 'CommunityAssets.js'),
    index: path.join(ROOT, 'assets', 'gta', 'asset-index.generated.json'),
    work: path.join(ROOT, 'assets', 'gta', 'work'),
    blender: process.env.BLENDER || '/Applications/Blender.app/Contents/MacOS/Blender',
    max: 16,
    assets: [],
    textures: [],
    noTextures: false,
    noModels: false
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--asset') out.assets.push(argv[++i]);
    else if (a === '--texture') out.textures.push(argv[++i]);
    else if (a === '--source') out.source = argv[++i];
    else if (a === '--img') out.img = argv[++i];
    else if (a === '--out') out.out = argv[++i];
    else if (a === '--index') out.index = argv[++i];
    else if (a === '--work') out.work = argv[++i];
    else if (a === '--blender') out.blender = argv[++i];
    else if (a === '--max') out.max = Number(argv[++i]) || 16;
    else if (a === '--no-textures') out.noTextures = true;
    else if (a === '--no-models') out.noModels = true;
    else if (a === '--help' || a === '-h') {
      console.log('Usage: node tools/import-gta-assets.js --source DIR [--asset FILE] [--out JS] [--index JSON]');
      process.exit(0);
    } else throw new Error('Unknown argument: ' + a);
  }
  out.assets = out.assets.filter(Boolean);
  out.textures = out.textures.filter(Boolean);
  if (!out.assets.length) out.assets = DEFAULT_ASSETS.slice(0, out.max);
  return out;
}

function slug(value) {
  return String(value || 'asset').toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'asset';
}

function categoryOf(name) {
  const n = String(name || '').toLowerCase();
  if (/\.(txd|png|jpe?g|tga|bmp)$/.test(n)) return 'textures';
  if (/ped|player|npc|citizen|redneck|roach|cop|police|soldier|worker|woman|man\b|boy|girl|zombie|skin|character/.test(n)) return 'characters';
  if (/landstal|infernus|comet|copcarla|taxi|bus|car|vehicle|truck|van|bike|moto|plane|heli|boat|sport|sedan/.test(n)) return 'vehicles';
  if (/road|street|pave|sidewalk|kerb|curb|lane|bridge|rail|track|asphalt|concrete/.test(n)) return 'roads';
  if (/tree|pine|oak|bush|fern|plant|palm|shrub|grass|vegetation/.test(n)) return 'trees';
  if (/house|building|shop|store|garage|warehouse|bank|hotel|office|church|school|hospital|bar\b|restaurant|gas|station|kiosk|home|crate|fence/.test(n)) return 'buildings';
  return 'props';
}

function walkFiles(dir, filter, limit) {
  const found = [];
  if (!dir || !fs.existsSync(dir)) return found;
  const stack = [dir];
  while (stack.length && found.length < (limit || Infinity)) {
    const here = stack.pop();
    let entries = [];
    try { entries = fs.readdirSync(here, { withFileTypes: true }); } catch (e) { continue; }
    entries.forEach(function (entry) {
      if (found.length >= (limit || Infinity)) return;
      const full = path.join(here, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && filter(entry.name, full)) found.push(full);
    });
  }
  return found;
}

function findInSource(source, name) {
  const direct = path.join(source, name);
  if (fs.existsSync(direct)) return direct;
  const lower = String(name).toLowerCase();
  const matches = walkFiles(source, function (file) {
    return file.toLowerCase() === lower;
  }, 1);
  return matches[0] || null;
}

function readImg(file) {
  if (!file || !fs.existsSync(file)) return null;
  const data = fs.readFileSync(file);
  if (data.slice(0, 4).toString('ascii') !== 'VER2') return null;
  const count = data.readUInt32LE(4);
  const entries = new Map();
  let off = 8;
  for (let i = 0; i < count && off + 32 <= data.length; i++) {
    const sector = data.readUInt32LE(off);
    const sectors = data.readUInt32LE(off + 4);
    const name = data.slice(off + 8, off + 32).toString('ascii').replace(/\0.*$/, '');
    const start = sector * 2048;
    const size = sectors * 2048;
    if (name && start >= 0 && start + size <= data.length) {
      entries.set(name.toLowerCase(), data.slice(start, start + size));
    }
    off += 32;
  }
  return entries;
}

function assetBuffer(source, img, name) {
  const local = findInSource(source, name);
  if (local) return fs.readFileSync(local);
  return img && img.get(String(name).toLowerCase()) || null;
}

function referencedTextures(dffBuffer) {
  try {
    const dff = new DffParser(dffBuffer).parse();
    const names = new Set();
    const geometries = (dff.geometryList && dff.geometryList.geometries) || [];
    geometries.forEach(function (g) {
      const materials = (g.materialList && g.materialList.materialData) || [];
      materials.forEach(function (m) {
        if (m.texture && m.texture.textureName) names.add(String(m.texture.textureName).toLowerCase());
      });
    });
    return Array.from(names);
  } catch (e) {
    return [];
  }
}

function txdTextureNames(buffer) {
  try {
    const txd = new TxdParser(buffer).parse();
    return ((txd.textureDictionary && txd.textureDictionary.textureNatives) || [])
      .map(function (t) { return String(t.textureName || '').toLowerCase(); });
  } catch (e) {
    return [];
  }
}

function findTxdBuffer(source, img, name, dffBuffer, cache) {
  const base = slug(name);
  const directNames = [base + '.txd', String(name).replace(/\.dff$/i, '.txd')];
  for (const candidate of directNames) {
    const buf = assetBuffer(source, img, candidate);
    if (buf) return buf;
  }

  const wanted = referencedTextures(dffBuffer);
  if (!wanted.length || !img) return null;
  const pieces = [];
  for (const [entryName, buffer] of img.entries()) {
    if (!entryName.endsWith('.txd') || pieces.length >= 8) continue;
    if (!cache[entryName]) cache[entryName] = txdTextureNames(buffer);
    if (cache[entryName].some(function (n) { return wanted.includes(n); })) {
      pieces.push(buffer);
    }
  }
  return pieces.length ? Buffer.concat(pieces) : null;
}

function readGLB(buffer) {
  if (buffer.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB');
  let off = 12;
  let json = null;
  let binary = null;
  while (off + 8 <= buffer.length) {
    const len = buffer.readUInt32LE(off);
    const type = buffer.slice(off + 4, off + 8).toString('ascii');
    const chunk = buffer.slice(off + 8, off + 8 + len);
    if (type === 'JSON') json = JSON.parse(chunk.toString('utf8'));
    if (type === 'BIN\0') binary = chunk;
    off += 8 + len;
  }
  if (!json || !binary) throw new Error('incomplete GLB');
  return { json: json, binary: binary };
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

function imageData(glb, index) {
  const image = glb.json.images && glb.json.images[index];
  if (!image) return null;
  if (image.uri && /^data:/.test(image.uri)) return image.uri;
  if (image.bufferView == null) return null;
  const view = glb.json.bufferViews[image.bufferView];
  const start = view.byteOffset || 0;
  const bytes = glb.binary.slice(start, start + view.byteLength);
  return 'data:' + (image.mimeType || 'image/png') + ';base64,' + bytes.toString('base64');
}

function bakeGLB(buffer, key, category, textures, assetTextures) {
  const glb = readGLB(buffer);
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
    mesh.primitives.forEach(function (prim, pi) {
      if ((prim.mode == null ? 4 : prim.mode) !== 4) return;
      const srcPos = readAccessor(glb, prim.attributes.POSITION, true);
      const srcNorm = prim.attributes.NORMAL != null ? readAccessor(glb, prim.attributes.NORMAL, true) : null;
      const srcUv = prim.attributes.TEXCOORD_0 != null ? readAccessor(glb, prim.attributes.TEXCOORD_0, true) : null;
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

      const material = glb.json.materials && prim.material != null
        ? glb.json.materials[prim.material] : null;
      const matName = slug((material && material.name) || ('mat' + prim.material));
      const role = matName + '_' + pi;
      let textureKey = null;
      let textureURI = null;
      if (material && material.pbrMetallicRoughness &&
          material.pbrMetallicRoughness.baseColorTexture) {
        textureURI = imageData(glb, material.pbrMetallicRoughness.baseColorTexture.index);
        if (textureURI) {
          textureKey = 'gtaTex_' + key + '_' + role;
          textures[textureKey] = textureURI;
          assetTextures.push(textureKey);
        }
      }
      const factor = material && material.pbrMetallicRoughness &&
        material.pbrMetallicRoughness.baseColorFactor || [0.8, 0.8, 0.8, 1];
      const color = (Math.round((factor[0] == null ? 0.8 : factor[0]) * 255) << 16) |
        (Math.round((factor[1] == null ? 0.8 : factor[1]) * 255) << 8) |
        Math.round((factor[2] == null ? 0.8 : factor[2]) * 255);

      if (!groups[role]) {
        groups[role] = { pos: [], norm: [], uv: [], idx: [], count: 0, textureKey: textureKey, color: color };
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

  const parts = Object.keys(groups).map(function (role) {
    const g = groups[role];
    const index = g.count > 65535 ? new Uint32Array(g.idx) : new Uint16Array(g.idx);
    const part = {
      role: role,
      position: b64(new Float32Array(g.pos)),
      normal: b64(new Float32Array(g.norm)),
      uv: b64(new Float32Array(g.uv)),
      indexType: index.BYTES_PER_ELEMENT === 4 ? 5125 : 5123,
      index: b64(index),
      color: g.color
    };
    if (g.textureKey) part.texture = g.textureKey;
    return part;
  });
  return {
    parts: parts,
    bounds: bounds,
    gtaType: category,
    gtaSource: key
  };
}

function extractTxd(buffer, label, textures, assets) {
  let parsed;
  try { parsed = new TxdParser(buffer).parse(); } catch (e) { return 0; }
  const natives = (parsed.textureDictionary && parsed.textureDictionary.textureNatives) || [];
  let added = 0;
  natives.forEach(function (native, i) {
    const rgba = native.mipmaps && native.mipmaps[0];
    if (!rgba || !native.width || !native.height) return;
    try {
      const png = new PNG({ width: native.width, height: native.height, colorType: 6 });
      png.data = Buffer.from(rgba);
      const bytes = PNG.sync.write(png);
      const key = 'gtaTex_' + slug(label) + '_' + i;
      textures[key] = 'data:image/png;base64,' + bytes.toString('base64');
      assets.push({
        key: key,
        label: native.textureName || (label + ' ' + (i + 1)),
        type: 'textures',
        source: label,
        texture: key,
        model: false
      });
      added++;
    } catch (e) { /* Skip unsupported raster formats. */ }
  });
  return added;
}

function writeRegistry(options, textures, models, assets) {
  const order = {};
  CATEGORIES.forEach(function (c, i) { order[c.key] = i; });
  assets.sort(function (a, b) {
    const d = (order[a.type] == null ? 99 : order[a.type]) - (order[b.type] == null ? 99 : order[b.type]);
    return d || String(a.label).localeCompare(String(b.label));
  });
  const index = {
    version: 1,
    generated: new Date().toISOString(),
    categories: CATEGORIES,
    assets: assets,
    textures: textures,
    models: models
  };
  const js = '/* Generated by tools/import-gta-assets.js - local GTA/community assets. Do not commit GTA-derived data. */\n' +
    '(function () {\n  \'use strict\';\n  const CC = window.CC = window.CC || {};\n' +
    '  CC.GeneratedAssets = Object.assign({ textures: {}, models: {} }, CC.GeneratedAssets || {});\n' +
    '  Object.assign(CC.GeneratedAssets.textures, ' + JSON.stringify(textures) + ');\n' +
    '  Object.assign(CC.GeneratedAssets.models, ' + JSON.stringify(models) + ');\n' +
    '  CC.GTAImport = ' + JSON.stringify({
      version: 1,
      generated: index.generated,
      categories: CATEGORIES,
      assets: assets
    }) + ';\n})();\n';

  fs.mkdirSync(path.dirname(path.resolve(options.out)), { recursive: true });
  fs.mkdirSync(path.dirname(path.resolve(options.index)), { recursive: true });
  fs.writeFileSync(path.resolve(options.out), js);
  fs.writeFileSync(path.resolve(options.index), JSON.stringify(index, null, 2));
  console.log('wrote', path.relative(ROOT, options.out), 'and', path.relative(ROOT, options.index));
  console.log('assets', assets.length, 'models', Object.keys(models).length,
    'textures', Object.keys(textures).length);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const img = readImg(options.img || path.join(options.source, 'GTA San Andreas', 'models', 'gta3.img'));
  const textures = {};
  const models = {};
  const assets = [];
  const txdCache = {};
  fs.mkdirSync(options.work, { recursive: true });

  // Standalone texture files (community downloads are often loose TXD/PNG).
  const textureFiles = options.textures.slice();
  if (!options.noTextures && !textureFiles.length && fs.existsSync(options.source)) {
    walkFiles(options.source, function (file) {
      return /\.(txd|png|jpe?g)$/i.test(file);
    }, options.max).forEach(function (file) { textureFiles.push(file); });
  }
  textureFiles.slice(0, options.max).forEach(function (file) {
    const buffer = fs.readFileSync(file);
    const label = path.basename(file);
    if (/\.txd$/i.test(file)) extractTxd(buffer, label, textures, assets);
    else {
      const key = 'gtaTex_' + slug(label);
      const mime = /\.jpe?g$/i.test(file) ? 'image/jpeg' : 'image/png';
      textures[key] = 'data:' + mime + ';base64,' + buffer.toString('base64');
      assets.push({ key: key, label: label, type: 'textures', source: label, texture: key, model: false });
    }
  });

  const blenderScript = path.join(ROOT, 'tools', 'blender_gta_convert.py');
  const addonDir = path.join(ROOT, 'tools', 'vendor');
  if (!options.noModels) options.assets.slice(0, options.max).forEach(function (requested, i) {
    const dffBuffer = assetBuffer(options.source, img, requested);
    if (!dffBuffer) {
      console.warn('missing', requested);
      return;
    }
    const category = categoryOf(requested);
    const key = 'gta_' + category + '_' + slug(requested);
    const dffFile = path.join(options.work, key + '.dff');
    const txdFile = path.join(options.work, key + '.txd');
    const glbFile = path.join(options.work, key + '.glb');
    fs.writeFileSync(dffFile, dffBuffer);
    const txdBuffer = findTxdBuffer(options.source, img, requested, dffBuffer, txdCache);
    if (txdBuffer) fs.writeFileSync(txdFile, txdBuffer);
    else if (fs.existsSync(txdFile)) fs.unlinkSync(txdFile);

    const args = [
      '-b', '--python', blenderScript, '--',
      '--addon-dir', addonDir,
      '--dff', dffFile,
      '--out', glbFile,
      '--height', String(HEIGHTS[category] || 4),
      '--name', key
    ];
    if (txdBuffer) args.push('--txd', txdFile);
    const run = spawnSync(options.blender, args, {
      encoding: 'utf8', maxBuffer: 32 * 1024 * 1024
    });
    if (run.status !== 0 || !fs.existsSync(glbFile)) {
      console.warn('convert failed', requested, String(run.stderr || run.stdout || '').slice(-400));
      return;
    }

    try {
      const assetTextures = [];
      const model = bakeGLB(fs.readFileSync(glbFile), key, category, textures, assetTextures);
      models[key] = model;
      assets.push({
        key: key,
        label: path.basename(requested).replace(/\.[^.]+$/, ''),
        type: category,
        source: requested,
        model: true,
        textures: assetTextures,
        bounds: model.bounds
      });
      console.log('converted', requested, '->', key, '(' + model.parts.length + ' parts)');
    } catch (e) {
      console.warn('bake failed', requested, String(e && e.message || e));
    }
    if (i % 5 === 4) console.log('progress', i + 1, '/', Math.min(options.assets.length, options.max));
  });

  writeRegistry(options, textures, models, assets);
}

main();
