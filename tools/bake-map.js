/* Regenerate js/mapdata.js from map.png.
   Run from anywhere: node tools/bake-map.js
   Uses only Node built-ins (no npm packages / Python needed).

   The baked file contains the road mask, roads, home sites, time trials and
   a recoloured ground image as a data URI, so the game can load the picture
   map from file:// where reading pixels from map.png is blocked. */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const MAP = path.join(ROOT, 'map.png');
const OUT = path.join(ROOT, 'js', 'mapdata.js');

/* ---------- minimal PNG reader/writer (8-bit RGB/RGBA, non-interlaced) ---------- */
const crcTable = (function () {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('map.png is not a PNG');
  let pos = 8, w = 0, h = 0, depth = 0, color = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.slice(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      depth = data[8]; color = data[9];
      if (data[12] !== 0) throw new Error('interlaced PNGs are not supported');
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (depth !== 8 || (color !== 2 && color !== 6)) {
    throw new Error('map.png must be an 8-bit RGB or RGBA PNG');
  }
  const bpp = color === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const out = new Uint8Array(w * h * 4);
  let prev = new Uint8Array(stride), rp = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[rp++];
    const line = new Uint8Array(stride);
    for (let i = 0; i < stride; i++) {
      const x = raw[rp++];
      const a = i >= bpp ? line[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v;
      if (filter === 0) v = x;
      else if (filter === 1) v = x + a;
      else if (filter === 2) v = x + b;
      else if (filter === 3) v = x + ((a + b) >> 1);
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v = x + (pa <= pb && pa <= pc ? a : (pb <= pc ? b : c));
      } else throw new Error('unsupported PNG filter: ' + filter);
      line[i] = v & 255;
    }
    for (let x = 0; x < w; x++) {
      const s = x * bpp, d = (y * w + x) * 4;
      out[d] = line[s]; out[d + 1] = line[s + 1]; out[d + 2] = line[s + 2];
      out[d + 3] = bpp === 4 ? line[s + 3] : 255;
    }
    prev = line;
  }
  return { width: w, height: h, data: out };
}

function encodePNG(w, h, rgba) {
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  const src = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    src.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ---------- run the browser map modules in Node ---------- */
const source = decodePNG(fs.readFileSync(MAP));

global.window = global;
global.atob = function (s) { return Buffer.from(s, 'base64').toString('binary'); };
global.btoa = function (s) { return Buffer.from(s, 'binary').toString('base64'); };
global.THREE = {
  Texture: function (img) { this.image = img; },
  SRGBColorSpace: 'srgb'
};
global.Image = function () {
  this.width = source.width; this.height = source.height;
  this.naturalWidth = source.width; this.naturalHeight = source.height;
  this.onload = null; this.onerror = null;
  Object.defineProperty(this, 'src', { set: function () { if (this.onload) this.onload(); } });
  Object.defineProperty(this, 'crossOrigin', { set: function () {} });
};
global.document = {
  createElement: function (tag) {
    if (tag !== 'canvas') return {};
    const canvas = { width: 0, height: 0, _data: null };
    canvas.getContext = function () {
      return {
        drawImage: function () {},
        getImageData: function () { return { data: source.data }; },
        createImageData: function (w, h) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; },
        putImageData: function (img) { canvas._data = img.data; }
      };
    };
    return canvas;
  }
};

require(path.join(ROOT, 'js', 'config.js'));
CC.World = {};
require(path.join(ROOT, 'js', 'imagemap.js'));

function round(n) { return Math.round(n * 100) / 100; }

CC.ImageMap.load('map.png').then(function (ok) {
  if (!ok) throw new Error('could not process map.png');
  CC.ImageMap.apply();
  const IM = CC.ImageMap;

  // The terrain (water, beach, woods, roads) is regenerated at runtime from
  // these zone definitions, so no image or pixel mask needs to be stored.
  const baked = {
    width: IM.W,
    height: IM.H,
    zones: IM.zones,
    landmarks: IM.landmarks,
    roads: CC.roadDefs.map(function (r) {
      return { name: r.name, type: r.type, width: r.width, closed: r.closed, points: r.points };
    }),
    buildings: CC.World.imageBuildings.map(function (b) {
      return { x: round(b.x), z: round(b.z), w: b.w, l: b.l, h: round(b.h), color: b.color };
    }),
    challenges: CC.challengeDefs.map(function (c) {
      return { id: c.id, name: c.name, color: c.color, gates: c.gates.map(function (g) { return [round(g[0]), round(g[1])]; }) };
    })
  };

  const text = '/* Generated by tools/bake-map.js - do not edit by hand. */\n' +
    '(function () {\n  \'use strict\';\n  CC.bakedMap = ' + JSON.stringify(baked, null, 2) + ';\n})();\n';
  fs.writeFileSync(OUT, text);
  console.log('Baked ' + baked.roads.length + ' roads, ' + baked.buildings.length +
    ' homes, ' + baked.challenges.length + ' trials into ' + path.relative(ROOT, OUT));
  console.log('Size: ' + (text.length / 1024).toFixed(0) + ' KB');
}).catch(function (err) {
  console.error('Bake failed:', err);
  process.exitCode = 1;
});
