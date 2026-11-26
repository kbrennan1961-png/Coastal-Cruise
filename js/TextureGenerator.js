/* Coastal Cruise - procedural canvas textures.
 *
 * Every surface in the game starts from a generated canvas, so the original
 * file:// double-click setup never needs an image download. Each canvas is
 * kept in CC.TextureGenerator.textures, and replace()/load() let a skin or a
 * future asset pack swap any of them without touching the calling code.
 */
(function () {
  'use strict';

  const CC = window.CC;
  const U = CC.util;

  let maxAnisotropy = 16;
  let rendererRef = null;
  let envMap = null;
  let nightAmount = 0;
  const textures = {};
  const sources = {};
  const facadeMaterials = new Set();

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a += 0x6d2b79f5;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function surface(size, height) {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = height || size;
    return { canvas: c, ctx: c.getContext('2d', { willReadFrequently: false }) };
  }

  // Pixel-level grit. Drawing one ImageData pass is far cheaper than thousands
  // of canvas fillRect calls and survives mipmapping much better than flat art.
  function grain(ctx, w, h, seed, strength, tint) {
    const random = rng(seed);
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const tr = tint ? tint[0] : 0;
    const tg = tint ? tint[1] : 0;
    const tb = tint ? tint[2] : 0;
    for (let i = 0; i < d.length; i += 4) {
      const n = (random() - 0.5) * strength;
      const warm = random() * 0.35;
      d[i] = U.clamp(d[i] + n + tr * warm, 0, 255);
      d[i + 1] = U.clamp(d[i + 1] + n + tg * warm, 0, 255);
      d[i + 2] = U.clamp(d[i + 2] + n + tb * warm, 0, 255);
    }
    ctx.putImageData(img, 0, 0);
  }

  function register(name, canvas, options) {
    options = options || {};
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = options.clamp
      ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
    if (options.repeat) tex.repeat.set(options.repeat[0], options.repeat[1]);
    tex.anisotropy = options.anisotropy || 1;
    if (THREE.SRGBColorSpace && options.srgb !== false) tex.colorSpace = THREE.SRGBColorSpace;
    if (options.mapping) tex.mapping = options.mapping;
    textures[name] = tex;
    sources[name] = canvas;
    return tex;
  }

  function ensure(name, build, options) {
    return textures[name] || register(name, build(), options);
  }

  function asphaltCanvas() {
    const s = surface(512);
    const g = s.ctx, n = s.canvas.width;
    g.fillStyle = '#15171a';
    g.fillRect(0, 0, n, n);

    const random = rng(7731);
    // Coarse aggregate patches give the road a worn, uneven base.
    for (let i = 0; i < 210; i++) {
      const x = random() * n, y = random() * n;
      const r = 8 + random() * 48;
      const shade = Math.floor(18 + random() * 26);
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, 'rgba(' + shade + ',' + shade + ',' + (shade + 2) + ',0.5)');
      grad.addColorStop(1, 'rgba(12,12,14,0)');
      g.fillStyle = grad;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    grain(g, n, n, 3319, 46);

    // Tiny pale stones and tar seams.
    for (let i = 0; i < 5200; i++) {
      const v = Math.floor(42 + random() * 62);
      g.fillStyle = 'rgba(' + v + ',' + v + ',' + (v + 3) + ',' + (0.12 + random() * 0.4).toFixed(2) + ')';
      g.fillRect(random() * n, random() * n, random() < 0.15 ? 2 : 1, 1);
    }
    g.lineCap = 'round';
    for (let i = 0; i < 22; i++) {
      let x = random() * n, y = random() * n;
      g.strokeStyle = 'rgba(5,6,7,' + (0.24 + random() * 0.38).toFixed(2) + ')';
      g.lineWidth = 0.6 + random() * 1.4;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 5; k++) {
        x += (random() - 0.5) * 58;
        y += 18 + random() * 52;
        g.lineTo(x, y);
      }
      g.stroke();
    }

    // A dashed centre line is baked into the asphalt. UV.v runs along each
    // road at 8 m per tile, so this repeats as a believable short dash.
    g.save();
    g.globalAlpha = 0.86;
    g.fillStyle = '#d8c15c';
    g.fillRect(n * 0.49, 10, n * 0.02, 300);
    g.fillRect(n * 0.49, 330, n * 0.02, 172);
    g.globalAlpha = 0.28;
    g.fillStyle = '#fff0a6';
    g.fillRect(n * 0.493, 12, n * 0.006, 296);
    g.restore();
    return s.canvas;
  }

  function concreteCanvas() {
    const s = surface(256);
    const g = s.ctx;
    g.fillStyle = '#9c9d96';
    g.fillRect(0, 0, 256, 256);
    grain(g, 256, 256, 4127, 38);
    const random = rng(991);
    for (let i = 0; i < 80; i++) {
      g.fillStyle = 'rgba(62,60,54,' + (0.03 + random() * 0.09).toFixed(2) + ')';
      const x = random() * 256, y = random() * 256, r = 6 + random() * 24;
      g.beginPath(); g.ellipse(x, y, r, r * 0.6, random() * 3, 0, Math.PI * 2); g.fill();
    }
    g.strokeStyle = 'rgba(38,39,37,0.42)';
    g.lineWidth = 2;
    for (let i = 0; i <= 256; i += 128) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke();
      g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke();
    }
    return s.canvas;
  }

  function grassDirtCanvas() {
    const s = surface(512);
    const g = s.ctx;
    g.fillStyle = '#687f43';
    g.fillRect(0, 0, 512, 512);
    const random = rng(6113);
    for (let i = 0; i < 180; i++) {
      const x = random() * 512, y = random() * 512, r = 12 + random() * 70;
      const dirt = random() < 0.3;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, dirt ? 'rgba(96,72,45,0.55)' : 'rgba(122,158,72,0.5)');
      grad.addColorStop(1, dirt ? 'rgba(96,72,45,0)' : 'rgba(122,158,72,0)');
      g.fillStyle = grad;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    grain(g, 512, 512, 1151, 44, [8, 6, 0]);
    g.lineWidth = 1;
    for (let i = 0; i < 3400; i++) {
      const x = random() * 512, y = random() * 512, len = 2 + random() * 6;
      g.strokeStyle = random() < 0.35
        ? 'rgba(205,188,112,0.25)' : 'rgba(47,76,32,0.3)';
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (random() - 0.5) * 3, y - len); g.stroke();
    }
    return s.canvas;
  }

  function facadeCanvases(style, color) {
    const key = style + ':' + color;
    if (sources[key + ':base']) {
      return { base: sources[key + ':base'], emissive: sources[key + ':emissive'] };
    }
    const base = surface(512), lit = surface(512);
    const g = base.ctx, e = lit.ctx;
    const col = new THREE.Color(color);
    const rgb = [Math.round(col.r * 255), Math.round(col.g * 255), Math.round(col.b * 255)];
    const random = rng(style === 'brick' ? 2021 : 4093);

    g.fillStyle = 'rgb(' + rgb.join(',') + ')';
    g.fillRect(0, 0, 512, 512);
    if (style === 'brick') {
      const bw = 64, bh = 24;
      for (let row = 0; row < 22; row++) {
        const offset = row % 2 ? bw * 0.5 : 0;
        for (let x = -bw; x < 512 + bw; x += bw) {
          const shade = Math.floor((random() - 0.5) * 34);
          g.fillStyle = 'rgba(' + U.clamp(rgb[0] + shade, 0, 255) + ',' +
            U.clamp(rgb[1] + shade, 0, 255) + ',' + U.clamp(rgb[2] + shade, 0, 255) + ',0.85)';
          g.fillRect(x + offset + 1, row * bh + 1, bw - 2, bh - 2);
        }
      }
    } else {
      for (let i = 0; i < 400; i++) {
        const x = random() * 512, y = random() * 512, r = 10 + random() * 38;
        const grad = g.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, 'rgba(255,255,255,0.06)');
        grad.addColorStop(1, 'rgba(40,35,28,0.05)');
        g.fillStyle = grad;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      }
    }
    grain(g, 512, 512, style === 'brick' ? 77 : 91, 30);

    // Window grid: unlit panes are painted dark into the base texture, lit
    // panes are white in the emissive mask so only those glow at night.
    e.fillStyle = '#000';
    e.fillRect(0, 0, 512, 512);
    const cols = 4, rows = 3;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = 24 + col * 124, y = 46 + row * 142;
        g.fillStyle = 'rgba(36,31,27,0.8)';
        g.fillRect(x - 4, y - 4, 80, 86);
        g.fillStyle = '#172b35';
        g.fillRect(x, y, 72, 78);
        g.fillStyle = 'rgba(150,186,198,0.18)';
        g.fillRect(x + 4, y + 4, 30, 70);
        g.strokeStyle = 'rgba(230,222,200,0.55)';
        g.lineWidth = 2;
        g.strokeRect(x, y, 72, 78);
        g.beginPath(); g.moveTo(x + 36, y); g.lineTo(x + 36, y + 78); g.stroke();
        if (random() < 0.46) {
          const warm = random() < 0.72;
          e.fillStyle = warm ? '#ffd88a' : '#d8ecff';
          e.globalAlpha = 0.65 + random() * 0.35;
          e.fillRect(x + 2, y + 2, 68, 74);
          e.globalAlpha = 1;
          // A soft bloom border keeps the window from looking like a decal.
          e.strokeStyle = warm ? 'rgba(255,190,80,0.45)' : 'rgba(180,220,255,0.4)';
          e.lineWidth = 7;
          e.strokeRect(x, y, 72, 78);
        }
      }
    }

    // Fake ambient occlusion where the wall meets the pavement.
    const ao = g.createLinearGradient(0, 370, 0, 512);
    ao.addColorStop(0, 'rgba(0,0,0,0)');
    ao.addColorStop(0.68, 'rgba(0,0,0,0.18)');
    ao.addColorStop(1, 'rgba(0,0,0,0.58)');
    g.fillStyle = ao;
    g.fillRect(0, 370, 512, 142);

    sources[key + ':base'] = base.canvas;
    sources[key + ':emissive'] = lit.canvas;
    return { base: base.canvas, emissive: lit.canvas };
  }

  function leafCanvas() {
    const s = surface(128);
    const g = s.ctx;
    g.clearRect(0, 0, 128, 128);
    g.translate(64, 64);
    const random = rng(3701);
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * Math.PI * 2 + 0.12;
      g.save();
      g.rotate(a);
      const grad = g.createLinearGradient(0, 0, 0, -60);
      grad.addColorStop(0, '#274d2a');
      grad.addColorStop(0.6, '#3b7b38');
      grad.addColorStop(1, '#6ca552');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(0, 0);
      g.quadraticCurveTo(-8 - random() * 4, -30, 0, -58 - random() * 8);
      g.quadraticCurveTo(8 + random() * 4, -30, 0, 0);
      g.fill();
      g.strokeStyle = 'rgba(18,48,24,0.8)';
      g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -58); g.stroke();
      g.restore();
    }
    return s.canvas;
  }

  function shadowCanvas() {
    const s = surface(128);
    const g = s.ctx;
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    grad.addColorStop(0, 'rgba(0,0,0,0.72)');
    grad.addColorStop(0.48, 'rgba(0,0,0,0.44)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return s.canvas;
  }

  function manholeCanvas() {
    const s = surface(128);
    const g = s.ctx;
    g.clearRect(0, 0, 128, 128);
    const grad = g.createRadialGradient(52, 46, 8, 64, 64, 62);
    grad.addColorStop(0, 'rgba(104,106,100,0.96)');
    grad.addColorStop(0.78, 'rgba(56,59,57,0.96)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(18,20,19,0.85)';
    g.lineWidth = 4;
    g.beginPath(); g.arc(64, 64, 51, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2;
      g.beginPath();
      g.moveTo(64 + Math.cos(a) * 20, 64 + Math.sin(a) * 20);
      g.lineTo(64 + Math.cos(a) * 47, 64 + Math.sin(a) * 47);
      g.stroke();
    }
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * Math.PI * 2;
      g.fillStyle = 'rgba(20,22,21,0.8)';
      g.beginPath(); g.arc(64 + Math.cos(a) * 55, 64 + Math.sin(a) * 55, 2.4, 0, Math.PI * 2); g.fill();
    }
    return s.canvas;
  }

  function skidCanvas() {
    const s = surface(128, 32);
    const g = s.ctx;
    g.clearRect(0, 0, 128, 32);
    const random = rng(882);
    for (let i = 0; i < 46; i++) {
      const x = random() * 128, y = 6 + random() * 20;
      g.fillStyle = 'rgba(8,9,10,' + (0.1 + random() * 0.34).toFixed(2) + ')';
      g.fillRect(x, y, 4 + random() * 24, 1 + random() * 4);
    }
    return s.canvas;
  }

  function burnoutCanvas() {
    const s = surface(128, 64);
    const g = s.ctx;
    g.clearRect(0, 0, 128, 64);
    const random = rng(6613);
    // Dark layered rubber smears for burnouts.
    for (let i = 0; i < 140; i++) {
      const x = random() * 128, y = 4 + random() * 56;
      const w = 6 + random() * 30;
      const h = 1 + random() * 5;
      const a = 0.08 + random() * 0.32;
      g.fillStyle = 'rgba(6,7,8,' + a.toFixed(3) + ')';
      g.fillRect(x, y, w, h);
    }
    g.globalAlpha = 0.45;
    for (let lane = 24; lane <= 104; lane += 40) {
      for (let y = 0; y < 64; y += 3) {
        const wobble = Math.sin(y * 0.28 + lane) * 2.2 + (random() - 0.5) * 2.5;
        g.fillStyle = 'rgba(10,10,11,' + (0.12 + random() * 0.22).toFixed(3) + ')';
        g.fillRect(lane + wobble - 4, y, 8 + random() * 4, 2);
      }
    }
    g.globalAlpha = 1;
    return s.canvas;
  }

  function crosswalkGritCanvas() {
    const s = surface(256, 128);
    const g = s.ctx;
    g.clearRect(0, 0, 256, 128);
    const random = rng(1297);
    for (let stripe = 0; stripe < 5; stripe++) {
      const x = 10 + stripe * 49;
      g.fillStyle = 'rgba(238,236,220,0.34)';
      g.fillRect(x, 8, 34, 112);
      for (let i = 0; i < 110; i++) {
        g.fillStyle = 'rgba(20,22,21,' + (0.05 + random() * 0.26).toFixed(2) + ')';
        g.fillRect(x + random() * 34, 8 + random() * 112, 1 + random() * 6, 1 + random() * 3);
      }
    }
    return s.canvas;
  }

  function skyCanvas() {
    const s = surface(512, 256);
    const g = s.ctx;
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#203a5c');
    grad.addColorStop(0.42, '#6fa9cf');
    grad.addColorStop(0.52, '#f3c58c');
    grad.addColorStop(0.62, '#8fa09a');
    grad.addColorStop(1, '#4d5547');
    g.fillStyle = grad;
    g.fillRect(0, 0, 512, 256);
    grain(g, 512, 256, 881, 12);
    return s.canvas;
  }

  const TextureGenerator = (CC.TextureGenerator = {
    textures: textures,

    init(renderer) {
      if (renderer) rendererRef = renderer;
      if (renderer && renderer.capabilities && renderer.capabilities.getMaxAnisotropy) {
        maxAnisotropy = Math.max(1, renderer.capabilities.getMaxAnisotropy());
      }
      this.asphalt();
      this.concrete();
      this.grassDirt();
      this.leafCard();
      this.shadow();
      this.manhole();
      this.skid();
      this.burnout();
      this.crosswalkGrit();
      this.sky();
      return this;
    },

    anisotropy() { return maxAnisotropy; },

    asphalt() {
      return ensure('asphalt', asphaltCanvas, {
        repeat: [1, 1], anisotropy: maxAnisotropy
      });
    },

    concrete() {
      return ensure('concrete', concreteCanvas, { repeat: [2, 2], anisotropy: maxAnisotropy });
    },

    grassDirt() {
      return ensure('grassDirt', grassDirtCanvas, { repeat: [8, 8], anisotropy: maxAnisotropy });
    },

    leafCard() {
      return ensure('leafCard', leafCanvas, {
        clamp: true, anisotropy: maxAnisotropy, srgb: true
      });
    },

    shadow() {
      return ensure('shadow', shadowCanvas, { clamp: true, srgb: false });
    },

    manhole() {
      return ensure('manhole', manholeCanvas, { clamp: true, anisotropy: maxAnisotropy });
    },

    skid() {
      return ensure('skid', skidCanvas, { clamp: true, anisotropy: maxAnisotropy });
    },

    burnout() {
      return ensure('burnout', burnoutCanvas, { clamp: true, anisotropy: maxAnisotropy });
    },

    crosswalkGrit() {
      return ensure('crosswalkGrit', crosswalkGritCanvas, { clamp: true, anisotropy: maxAnisotropy });
    },

    sky() {
      return ensure('skyEquirect', skyCanvas, {
        clamp: true, anisotropy: 1, mapping: THREE.EquirectangularReflectionMapping
      });
    },

    // A small PMREM sky reflection gives low-poly paint a PS2-era glossy
    // highlight without shipping a cubemap or forcing a per-frame CubeCamera.
    environmentMap(renderer) {
      if (envMap) return envMap;
      const gl = renderer || rendererRef || (CC.Game && CC.Game.renderer);
      if (!gl || !THREE.PMREMGenerator) return this.sky();
      try {
        const pmrem = new THREE.PMREMGenerator(gl);
        pmrem.compileEquirectangularShader();
        envMap = pmrem.fromEquirectangular(this.sky()).texture;
        pmrem.dispose();
      } catch (err) {
        envMap = this.sky();
      }
      return envMap;
    },

    facadeMaterial(color, style) {
      const safeColor = new THREE.Color(color == null ? 0xd8d4c8 : color).getHex();
      style = style === 'brick' ? 'brick' : 'stucco';
      const key = 'facade:' + style + ':' + safeColor;
      if (textures[key]) return textures[key].userData.material;
      const pair = facadeCanvases(style, safeColor);
      const map = register(key + ':map', pair.base, { repeat: [1, 1], anisotropy: maxAnisotropy });
      const emissiveMap = register(key + ':emissive', pair.emissive, {
        clamp: true, anisotropy: 1, srgb: true
      });
      const material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: map,
        emissive: 0xffd796,
        emissiveMap: emissiveMap,
        emissiveIntensity: nightAmount * 1.45,
        roughness: 0.88,
        metalness: 0.02,
        flatShading: true
      });
      material.name = key;
      map.userData.material = material;
      facadeMaterials.add(material);
      return material;
    },

    setNight(value) {
      const next = U.clamp(value || 0, 0, 1);
      // Lighting.update() calls this every frame; skip the full material sweep
      // while daylight is steady or the night level has not visibly moved.
      if (Math.abs(next - nightAmount) < 0.005) return nightAmount;
      nightAmount = next;
      facadeMaterials.forEach(function (m) { m.emissiveIntensity = nightAmount * 1.45; });
      return nightAmount;
    },

    // Tileable procedural water grain. R/G hold two drifting swell patterns
    // and B holds a sparse spray mask, so the ocean shaders can scroll them at
    // different speeds to read as moving texture without any external files.
    waterNoise() {
      return ensure('waterNoise', function () {
        const s = surface(128);
        const g = s.ctx;
        const n = s.canvas.width;
        const img = g.createImageData(n, n);
        const d = img.data;
        const TAU = Math.PI * 2;
        for (let y = 0; y < n; y++) {
          const v = y / n;
          for (let x = 0; x < n; x++) {
            const u = x / n;
            const long = Math.sin(TAU * (u * 3 + v * 1)) * 0.5 +
              Math.sin(TAU * (u * 2 - v * 4)) * 0.3;
            const chop = Math.sin(TAU * (u * 9 - v * 5)) * 0.34 +
              Math.sin(TAU * (u * 5 + v * 11)) * 0.22 +
              Math.sin(TAU * (u * 15 + v * 8)) * 0.14;
            const spray = Math.sin(TAU * (u * 7 + v * 3)) *
              Math.sin(TAU * (u * 4 - v * 9));
            const i = (y * n + x) * 4;
            d[i] = U.clamp(128 + long * 92, 0, 255);
            d[i + 1] = U.clamp(128 + chop * 104, 0, 255);
            d[i + 2] = U.clamp(128 + spray * 118, 0, 255);
            d[i + 3] = 255;
          }
        }
        g.putImageData(img, 0, 0);
        return s.canvas;
      }, { srgb: false });
    },

    // Overlay procedural grit on the baked map without changing the canvas the
    // minimap reads. Roads stay black because the overlay is low-alpha.
    grittyCopy(sourceCanvas, strength) {
      if (!sourceCanvas) return null;
      const out = surface(sourceCanvas.width, sourceCanvas.height);
      out.ctx.drawImage(sourceCanvas, 0, 0);
      out.ctx.globalAlpha = U.clamp(strength == null ? 0.16 : strength, 0, 1);
      out.ctx.drawImage(sources.grassDirt || grassDirtCanvas(), 0, 0, out.canvas.width, out.canvas.height);
      out.ctx.globalAlpha = 1;
      return out.canvas;
    },

    // External texture swaps: replace(name, HTMLCanvasElement|HTMLImageElement)
    // updates every material already using that texture in place.
    replace(name, source) {
      const tex = textures[name];
      if (!tex || !source) return false;
      const canvas = sources[name];
      if (canvas && canvas.getContext && source.width && source.height) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
      } else {
        tex.image = source;
      }
      tex.needsUpdate = true;
      return true;
    },

    load(name, url) {
      return new Promise(function (resolve, reject) {
        const img = new Image();
        img.onload = function () { resolve(TextureGenerator.replace(name, img)); };
        img.onerror = reject;
        img.src = url;
      });
    }
  });
})();
