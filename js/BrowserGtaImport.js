/* Browser-side importer for GTA-era / community asset files.
 *
 * Converted GLBs, generated JSON registries and loose PNG/JPG textures can be
 * loaded straight into an open editor session. Raw DFF/TXD/IMG files need the
 * local Blender helper (tools/import-gta-assets.js), so the panel reports the
 * exact command for those. Everything is embedded as data URIs / baked parts,
 * keeping the editor double-click friendly from file://.
 */
(function () {
  'use strict';

  const CC = window.CC = window.CC || {};
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
  const COMPONENT = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
  const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

  function slug(value) {
    return String(value || 'asset').toLowerCase()
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'asset';
  }

  function categoryOf(name) {
    const n = String(name || '').toLowerCase();
    if (/\.(txd|png|jpe?g|webp|bmp)$/.test(n)) return 'textures';
    if (/ped|player|npc|citizen|redneck|roach|cop|police|soldier|worker|woman|man\b|boy|girl|zombie|skin|character/.test(n)) return 'characters';
    if (/landstal|infernus|comet|copcarla|taxi|bus|car|vehicle|truck|van|bike|moto|plane|heli|boat|sport|sedan/.test(n)) return 'vehicles';
    if (/road|street|pave|sidewalk|kerb|curb|lane|bridge|rail|track|asphalt|concrete/.test(n)) return 'roads';
    if (/tree|pine|oak|bush|fern|plant|palm|shrub|grass|vegetation/.test(n)) return 'trees';
    if (/house|building|shop|store|garage|warehouse|bank|hotel|office|church|school|hospital|bar\b|restaurant|gas|station|kiosk|home|crate|fence/.test(n)) return 'buildings';
    return 'props';
  }

  function readBuffer(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(reader.error || new Error('Could not read ' + file.name)); };
      reader.readAsArrayBuffer(file);
    });
  }

  function readDataURI(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(reader.error || new Error('Could not read ' + file.name)); };
      reader.readAsDataURL(file);
    });
  }

  function base64(bytes) {
    const step = 0x8000;
    let out = '';
    for (let i = 0; i < bytes.length; i += step) {
      out += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
    }
    return btoa(out);
  }

  function uniqueKey(base, used) {
    let key = base;
    let n = 2;
    while (used[key]) key = base + '_' + (n++);
    used[key] = true;
    return key;
  }

  function readGLB(buffer) {
    const view = new DataView(buffer);
    if (buffer.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67) {
      throw new Error('not a GLB file');
    }
    let off = 12;
    let json = null;
    let binary = null;
    while (off + 8 <= buffer.byteLength) {
      const length = view.getUint32(off, true);
      const type = String.fromCharCode(
        view.getUint8(off + 4), view.getUint8(off + 5),
        view.getUint8(off + 6), view.getUint8(off + 7)
      );
      const start = off + 8;
      if (start + length > buffer.byteLength) break;
      if (type === 'JSON') {
        json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, start, length)));
      } else if (type === 'BIN\0') {
        binary = new Uint8Array(buffer, start, length);
      }
      off = start + length + (length % 4 ? 4 - (length % 4) : 0);
    }
    if (!json || !binary) throw new Error('GLB is missing JSON or binary data');
    return { json: json, binary: binary };
  }

  function readAccessor(glb, index) {
    const a = glb.json.accessors[index];
    if (!a) return new Float32Array(0);
    const view = glb.json.bufferViews[a.bufferView];
    if (!view) return new Float32Array(0);
    const comps = COMPONENTS[a.type] || 1;
    const csize = COMPONENT[a.componentType] || 4;
    const stride = view.byteStride || comps * csize;
    const base = (view.byteOffset || 0) + (a.byteOffset || 0);
    const dv = new DataView(glb.binary.buffer, glb.binary.byteOffset, glb.binary.byteLength);
    const Ctor = a.componentType === 5126 ? Float32Array
      : a.componentType === 5125 ? Uint32Array : Uint16Array;
    const out = new Ctor(a.count * comps);
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
        if (a.normalized && a.componentType !== 5126) {
          const max = a.componentType === 5121 ? 255 : a.componentType === 5120 ? 127
            : a.componentType === 5123 ? 65535 : 32767;
          v = Math.max(-1, v / max);
        }
        out[i * comps + c] = v;
      }
    }
    return out;
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

  function imageData(glb, index) {
    const image = glb.json.images && glb.json.images[index];
    if (!image) return null;
    if (image.uri && /^data:/.test(image.uri)) return image.uri;
    if (image.bufferView == null) return null;
    const view = glb.json.bufferViews[image.bufferView];
    const start = view.byteOffset || 0;
    const bytes = glb.binary.subarray(start, start + view.byteLength);
    return 'data:' + (image.mimeType || 'image/png') + ';base64,' + base64(bytes);
  }

  function bakeGLB(buffer, label, models, textures, assets) {
    const glb = readGLB(buffer);
    const nodes = glb.json.nodes || [];
    const world = new Array(nodes.length).fill(null);
    const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const parentOf = {};
    nodes.forEach(function (node) {
      (node.children || []).forEach(function (child) { parentOf[child] = true; });
    });
    function visit(i, parent) {
      if (world[i]) return;
      const node = nodes[i];
      if (!node) return;
      const matrix = matMul(parent, nodeMatrix(node));
      world[i] = matrix;
      (node.children || []).forEach(function (child) { visit(child, matrix); });
    }
    const scene = glb.json.scenes && glb.json.scenes[glb.json.scene || 0];
    const roots = scene && scene.nodes
      ? scene.nodes : nodes.map(function (_, i) { return i; }).filter(function (i) { return !parentOf[i]; });
    roots.forEach(function (i) { visit(i, identity); });
    nodes.forEach(function (_, i) { if (!world[i]) visit(i, identity); });

    const category = categoryOf(label);
    const key = uniqueKey('gta_' + category + '_' + slug(label), models);
    const groups = {};
    const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };

    nodes.forEach(function (node, ni) {
      if (node.mesh == null || !world[ni]) return;
      const mesh = glb.json.meshes && glb.json.meshes[node.mesh];
      if (!mesh) return;
      mesh.primitives.forEach(function (prim, pi) {
        if ((prim.mode == null ? 4 : prim.mode) !== 4 || prim.attributes.POSITION == null) return;
        const srcPos = readAccessor(glb, prim.attributes.POSITION);
        const srcNorm = prim.attributes.NORMAL != null ? readAccessor(glb, prim.attributes.NORMAL) : null;
        const srcUv = prim.attributes.TEXCOORD_0 != null ? readAccessor(glb, prim.attributes.TEXCOORD_0) : null;
        const srcIdx = prim.indices != null ? readAccessor(glb, prim.indices) : null;
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
          if (srcNorm && srcNorm.length >= count * 3) {
            const n = transformDir(world[ni], [srcNorm[i * 3], srcNorm[i * 3 + 1], srcNorm[i * 3 + 2]]);
            norm[i * 3] = n[0]; norm[i * 3 + 1] = n[1]; norm[i * 3 + 2] = n[2];
          }
          if (srcUv && srcUv.length >= count * 2) {
            uv[i * 2] = srcUv[i * 2]; uv[i * 2 + 1] = srcUv[i * 2 + 1];
          }
        }

        const material = glb.json.materials && prim.material != null
          ? glb.json.materials[prim.material] : null;
        const matName = slug((material && material.name) || ('material' + prim.material));
        const role = matName + '_' + pi;
        let textureKey = null;
        let textureLabel = matName;
        const pbr = material && material.pbrMetallicRoughness;
        if (pbr && pbr.baseColorTexture) {
          const uri = imageData(glb, pbr.baseColorTexture.index);
          if (uri) {
            textureKey = uniqueKey('gtaTex_' + key + '_' + role, textures);
            textures[textureKey] = uri;
            const image = glb.json.images[pbr.baseColorTexture.index];
            textureLabel = (image && image.name) || matName || (label + ' texture');
            assets.push({
              key: textureKey, label: textureLabel, type: 'textures',
              source: label, texture: textureKey, model: false
            });
          }
        }
        const factor = (pbr && pbr.baseColorFactor) || [0.8, 0.8, 0.8, 1];
        const color = (Math.round((factor[0] == null ? 0.8 : factor[0]) * 255) << 16) |
          (Math.round((factor[1] == null ? 0.8 : factor[1]) * 255) << 8) |
          Math.round((factor[2] == null ? 0.8 : factor[2]) * 255);

        if (!groups[role]) {
          groups[role] = { pos: [], norm: [], uv: [], idx: [], count: 0, texture: textureKey, color: color };
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

    if (!Object.keys(groups).length) throw new Error('GLB has no triangle meshes');
    if (bounds.min[0] === Infinity) {
      bounds = { min: [0, 0, 0], max: [0, 0, 0] };
    }
    const parts = Object.keys(groups).map(function (role) {
      const g = groups[role];
      const index = g.count > 65535 ? new Uint32Array(g.idx) : new Uint16Array(g.idx);
      const part = {
        role: role,
        position: base64(new Float32Array(g.pos)),
        normal: base64(new Float32Array(g.norm)),
        uv: base64(new Float32Array(g.uv)),
        indexType: index.BYTES_PER_ELEMENT === 4 ? 5125 : 5123,
        index: base64(index),
        color: g.color
      };
      if (g.texture) part.texture = g.texture;
      return part;
    });
    models[key] = {
      parts: parts, bounds: bounds, gtaType: category, gtaSource: label
    };
    assets.push({
      key: key, label: label.replace(/\.[^.]+$/, ''), type: category,
      source: label, model: true, bounds: bounds
    });
    return key;
  }

  function normalizeData(data) {
    const parsed = data && data.GTAImport ? data.GTAImport : data;
    if (!parsed || typeof parsed !== 'object') return null;
    const hasRegistry = !!(parsed.models || parsed.textures ||
      (Array.isArray(parsed.assets) && Array.isArray(parsed.categories)));
    if (!hasRegistry) return null;
    return {
      categories: Array.isArray(parsed.categories) ? parsed.categories : CATEGORIES,
      textures: parsed.textures && !Array.isArray(parsed.textures) ? parsed.textures : {},
      models: parsed.models && !Array.isArray(parsed.models) ? parsed.models : {},
      assets: Array.isArray(parsed.assets) ? parsed.assets : [],
      notices: []
    };
  }

  async function importFiles(fileList) {
    const files = Array.prototype.slice.call(fileList || []);
    const result = {
      categories: CATEGORIES,
      textures: {},
      models: {},
      assets: [],
      notices: []
    };
    const usedTextures = {};
    Object.keys((CC.GeneratedAssets && CC.GeneratedAssets.textures) || {}).forEach(function (key) {
      usedTextures[key] = true;
    });
    const usedModels = {};
    Object.keys((CC.AssetLoader && CC.AssetLoader.models) || {}).forEach(function (key) {
      usedModels[key] = true;
    });
    const rawFiles = [];

    for (const file of files) {
      const name = file.name || 'asset';
      if (/\.json$/i.test(name)) {
        try {
          const data = normalizeData(JSON.parse(await file.text()));
          if (!data) {
            result.notices.push(name + ': not a GTA asset registry.');
            continue;
          }
          if (data.categories && data.categories.length) result.categories = data.categories;
          Object.keys(data.textures).forEach(function (key) {
            result.textures[key] = data.textures[key];
            usedTextures[key] = true;
          });
          Object.keys(data.models).forEach(function (sourceKey) {
            result.models[sourceKey] = data.models[sourceKey];
            usedModels[sourceKey] = true;
          });
          data.assets.forEach(function (asset) { result.assets.push(asset); });
        } catch (e) {
          result.notices.push(name + ': ' + (e && e.message ? e.message : 'invalid JSON'));
        }
      } else if (/\.(png|jpe?g|webp|bmp)$/i.test(name)) {
        try {
          const uri = await readDataURI(file);
          const key = uniqueKey('gtaTex_' + slug(name), usedTextures);
          result.textures[key] = uri;
          result.assets.push({
            key: key, label: name.replace(/\.[^.]+$/, ''), type: 'textures',
            source: name, texture: key, model: false
          });
        } catch (e) {
          result.notices.push(name + ': could not read image.');
        }
      } else if (/\.glb$/i.test(name)) {
        try {
          bakeGLB(await readBuffer(file), name, result.models, result.textures, result.assets);
          Object.keys(result.models).forEach(function (key) { usedModels[key] = true; });
        } catch (e) {
          result.notices.push(name + ': ' + (e && e.message ? e.message : 'invalid GLB'));
        }
      } else if (/\.(dff|txd|img)$/i.test(name)) {
        rawFiles.push(name);
      } else {
        result.notices.push(name + ': unsupported file type.');
      }
    }

    if (rawFiles.length) {
      result.notices.push(rawFiles.join(', ') + ': convert with `node tools/import-gta-assets.js` first.');
    }
    return result;
  }

  CC.GtaImporter = {
    categories: CATEGORIES,
    categoryOf: categoryOf,
    importFiles: importFiles
  };
})();
