/* Coastal Cruise - low-poly PS2-era water and 4-point buoyancy.
 *
 * Everything that touches the water surface shares getWaterHeight(). The same
 * deterministic wave equation moves the mesh vertices, floats boats/props and
 * tilts hulls, so what you see is what things float on.
 *
 * Tuning quick reference:
 *   Wave amplitude ....... WAVE_AMPLITUDE below (or the amps in getWaterHeight).
 *   Mesh detail .......... SEGMENTS in createRetroWater() (48 = visible facets).
 *   Boat float height .... state.floatHeight / centerOffsetY in applyBuoyancy().
 *   Car sinking .......... state.buoyancyFactor (boats > 1, cars < 1).
 *   Choppiness ........... updateRetroWater() uv scroll speeds.
 *   Pattern .............. makePixelWaterTexture() diamond period/palette.
 */
(function () {
  'use strict';

  const CC = (window.CC = window.CC || {});
  const C = CC.C || { SEA_LEVEL: 0, WORLD: { minX: -430, maxX: 430, minZ: -370, maxZ: 370 } };

  // Global wave scale. 1 = the classic gentle coastal swell used by the game.
  const WAVE_AMPLITUDE = 1;

  function seaLevel() { return Number(C.SEA_LEVEL) || 0; }

  // The river is a calm, flat channel. Fade swells out across the last few
  // metres of bank/mouth so the transition into open-bay waves is not a seam.
  // coast.riverDepth() is negative inside the river in both the procedural and
  // baked maps; custom editor maps with no river report a large positive value.
  function waveFactor(x, z) {
    if (!CC.coast || typeof CC.coast.riverDepth !== 'function') return 1;
    const d = CC.coast.riverDepth(x, z);
    if (d <= 0) return 0;
    const t = d < 14 ? d / 14 : 1;
    return t * t * (3 - 2 * t);
  }

  /* ---------- shared wave equation ----------
     Layered sine/cosine swells in world X/Z + elapsed seconds. No randomness,
     no GPU-only math: physics can call this at any arbitrary point. The river
     corridor is deliberately flat. */
  function getWaterHeight(x, z, elapsedTime) {
    const t = Number(elapsedTime) || 0;
    let h = 0;
    h += Math.sin(x * 0.075 + t * 1.15) * 0.42;
    h += Math.cos(z * 0.095 - t * 0.85) * 0.34;
    h += Math.sin((x + z) * 0.045 + t * 0.60) * 0.25;
    h += Math.cos((x - z) * 0.130 + t * 1.65) * 0.08;
    return seaLevel() + h * WAVE_AMPLITUDE * waveFactor(x, z);
  }

  /* ---------- procedural pixelated diamond texture ----------
     The harbour reference uses a chunky cross-hatched diamond shimmer. Build
     it from two rotated grid distances in 2x2 block space: every diamond is
     made of hard retro pixels, and the tile always wraps seamlessly. The top
     sheet is ridge-only with alpha so it can scroll over the solid base. */
  function makePixelWaterTexture(repeat, opts) {
    const o = opts || {};
    const size = 64;
    const period = o.period || 16;
    const phase = Number(o.phase) || 0;
    const ridgesOnly = !!o.ridgesOnly;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(size, size);
    const d = img.data;

    const dark = o.dark || (ridgesOnly ? [12, 74, 98] : [5, 34, 58]);
    const mid = o.mid || (ridgesOnly ? [58, 151, 163] : [15, 76, 97]);
    const bright = o.bright || (ridgesOnly ? [182, 232, 218] : [69, 158, 164]);

    function hash(bx, by) {
      let n = Math.imul(bx + 4096, 374761393) ^ Math.imul(by + 4096, 668265263);
      n = Math.imul(n ^ (n >>> 13), 1274126177);
      return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
    }
    function mix(a, b, t) { return a + (b - a) * t; }
    function palette(t) {
      if (t <= 0.55) return [mix(dark[0], mid[0], t / 0.55),
        mix(dark[1], mid[1], t / 0.55), mix(dark[2], mid[2], t / 0.55)];
      const k = (t - 0.55) / 0.45;
      return [mix(mid[0], bright[0], k), mix(mid[1], bright[1], k),
        mix(mid[2], bright[2], k)];
    }

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        // One value per 2x2 block keeps the nearest-neighbour PS2 look.
        const bx = x >> 1, by = y >> 1;
        const u = (((bx + by + phase) % period) + period) % period;
        const v = (((bx - by + phase) % period) + period) % period;
        const fu = u / period, fv = v / period;
        const edge = Math.max(Math.abs(fu * 2 - 1), Math.abs(fv * 2 - 1));
        const rim = edge > 0.82;
        const shoulder = edge > 0.64;
        const grain = hash(bx, by);

        let t = 0.34 + grain * 0.16 + Math.sin((bx + by) * 0.55) * 0.06;
        if (rim) t += 0.42;
        else if (shoulder) t -= 0.12;
        // One edge of each diamond catches the light; the opposite edge is
        // darker, which reads as a moving swell when the UVs scroll.
        if (fu < 0.14 || fv < 0.14) t += 0.12;
        if (fu > 0.86 || fv > 0.86) t -= 0.10;
        t = Math.max(0, Math.min(1, t));

        const rgb = palette(t);
        d[i] = Math.round(rgb[0]);
        d[i + 1] = Math.round(rgb[1]);
        d[i + 2] = Math.round(rgb[2]);
        d[i + 3] = ridgesOnly ? (rim ? 220 : shoulder ? 82 : 0) : 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const rx = Array.isArray(repeat) ? repeat[0] : (repeat || 32);
    const ry = Array.isArray(repeat) ? repeat[1] : rx;
    tex.repeat.set(rx, ry);
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // The river is drawn as a separate, dead-flat sheet, so the animated sheets
  // must be masked out of the channel. Both masks come from the same water
  // classification pass, which guarantees no seam or uncovered gap at the bank.
  const RIVER_CALM_EDGE = 6;

  function inCalmRiver(x, z) {
    return !!(CC.coast && typeof CC.coast.riverDepth === 'function' &&
      CC.coast.riverDepth(x, z) < RIVER_CALM_EDGE);
  }

  function maskTexture(w, h, values) {
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(w, h);
    const d = img.data;
    for (let i = 0, p = 0; i < values.length; i++, p += 4) {
      const v = values[i] ? 255 : 0;
      d[p] = d[p + 1] = d[p + 2] = v;
      d[p + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    return tex;
  }

  // The baked map paints water into the ground image. Build two matching masks
  // so animated swells stay out of the river while the calm sheet covers only
  // the channel. Returns null when running the procedural fallback map.
  function makeWaterMasks() {
    const IM = CC.ImageMap;
    if (!CC.World || !CC.World.imageMode || !IM || !IM.classes || !IM.W || !IM.H) return null;
    const n = IM.W * IM.H;
    const calm = new Uint8Array(n), river = new Uint8Array(n);
    const hasRiver = !!(CC.coast && typeof CC.coast.riverDepth === 'function');
    for (let y = 0; y < IM.H; y++) {
      const wz = IM.toWorldZ(y + 0.5);
      for (let x = 0; x < IM.W; x++) {
        const i = y * IM.W + x;
        if (IM.classes[i] !== IM.CLS.WATER) continue;
        if (hasRiver && inCalmRiver(IM.toWorldX(x + 0.5), wz)) river[i] = 1;
        else calm[i] = 1;
      }
    }
    return { calm: maskTexture(IM.W, IM.H, calm), river: maskTexture(IM.W, IM.H, river) };
  }

  /* ---------- animated water planes ---------- */
  let state = null;

  // Reused every buoyancy call so the physics loop allocates nothing.
  const CORNERS = [{ x: 0, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 0 }];
  const SAMPLES = [
    { x: 0, z: 0, waterY: 0, depth: 0 }, { x: 0, z: 0, waterY: 0, depth: 0 },
    { x: 0, z: 0, waterY: 0, depth: 0 }, { x: 0, z: 0, waterY: 0, depth: 0 }
  ];
  const BUOY_RESULT = { submersion: 0, averageDepth: 0, corners: SAMPLES };

  // One geometry is shared by both sheets. With flatShading the GPU derives
  // face normals itself, so no normal buffer is ever rebuilt at runtime.
  function makeWaterGeometry(width, height, cx, cz, segments) {
    const geo = new THREE.PlaneGeometry(width, height, segments, segments);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const wx = new Float32Array(pos.count);
    const wz = new Float32Array(pos.count);
    const baseY = seaLevel();
    for (let i = 0; i < pos.count; i++) {
      wx[i] = cx + pos.getX(i);
      wz[i] = cz + pos.getZ(i);
      pos.setY(i, getWaterHeight(wx[i], wz[i], 0) - baseY);
    }
    pos.needsUpdate = true;
    return { geometry: geo, wx: wx, wz: wz, baseY: baseY };
  }

  function makeLayer(plane, cx, cz, baseY, tex, mask, opacity, scroll, order, dynamic) {
    const mat = new THREE.MeshPhongMaterial({
      map: tex,
      color: 0xffffff,
      flatShading: true,
      shininess: 30,
      specular: 0x86c6cc,
      side: THREE.FrontSide,
      transparent: opacity < 1,
      opacity: opacity,
      depthWrite: opacity >= 1
    });
    if (mask) {
      mat.alphaMap = mask;
      mat.alphaTest = 0.42;
    }
    const mesh = new THREE.Mesh(plane.geometry, mat);
    mesh.position.set(cx, baseY, cz);
    mesh.renderOrder = order;
    mesh.receiveShadow = false;
    mesh.castShadow = false;
    // StaticBatcher must never freeze an animated surface. The river sheet
    // opts out because it is deliberately static.
    if (dynamic !== false) mesh.userData.dynamic = true;
    return { mesh: mesh, texture: tex, scroll: scroll };
  }

  /* Create (or replace) the retro water surface.
     size may be { width, height, cx, cz, segments }. */
  function createRetroWater(scene, size) {
    if (!scene || !THREE) return null;
    if (state) {
      state.allLayers.forEach(function (l) {
        if (l.mesh.parent) l.mesh.parent.remove(l.mesh);
        l.texture.dispose();
      });
      if (state.masks) {
        state.masks.calm.dispose();
        if (state.masks.river) state.masks.river.dispose();
      }
      state.planes.forEach(function (p) { p.geometry.dispose(); });
      state = null;
    }
    const W = C.WORLD;
    const width = size && size.width ? size.width : W.maxX - W.minX;
    const height = size && size.height ? size.height : W.maxZ - W.minZ;
    const cx = size && size.cx != null ? size.cx : (W.minX + W.maxX) * 0.5;
    const cz = size && size.cz != null ? size.cz : (W.minZ + W.maxZ) * 0.5;
    // 48 subdivisions still leaves the low-poly facets visible while cutting
    // the per-frame vertex work by nearly half versus 64.
    const segments = size && size.segments ? size.segments : 48;
    const masks = makeWaterMasks();
    const texA = makePixelWaterTexture(32, { period: 16, phase: 0 });
    const texB = makePixelWaterTexture(48, {
      period: 8, phase: 3, ridgesOnly: true
    });
    const plane = makeWaterGeometry(width, height, cx, cz, segments);
    const planes = [plane];

    const base = makeLayer(plane, cx, cz, seaLevel(), texA,
      masks ? masks.calm : null, 1, { x: 0.016, y: 0.010 }, 1);
    // A second, semi-transparent sheet with ridge-only diamonds scrolling at a
    // different angle produces the shimmering cross-hatch from the harbour
    // reference without extra shader work.
    const top = makeLayer(plane, cx, cz, seaLevel() + 0.12, texB,
      masks ? masks.calm : null, 0.42, { x: -0.024, y: 0.018 }, 2);
    texB.offset.set(0.37, 0.21);

    const allLayers = [base, top];
    scene.add(base.mesh);
    scene.add(top.mesh);

    // The channel gets its own static, unscrolled sheet. Its vertices never
    // move, so boats in the river sit on genuinely still water instead of
    // inheriting wave interpolation from neighbouring bay vertices.
    let riverLayer = null;
    if (masks && masks.river) {
      const flat = { geometry: plane.geometry.clone() };
      const fp = flat.geometry.attributes.position;
      for (let i = 0; i < fp.count; i++) fp.setY(i, 0);
      fp.needsUpdate = true;
      planes.push(flat);
      riverLayer = makeLayer(flat, cx, cz, seaLevel() + 0.03,
        makePixelWaterTexture(24, { period: 16, phase: 8 }),
        masks.river, 1, { x: 0, y: 0 }, 1.5, false);
      allLayers.push(riverLayer);
      scene.add(riverLayer.mesh);
    }

    state = {
      scene: scene, layers: [base, top], allLayers: allLayers, masks: masks,
      riverLayer: riverLayer, plane: plane, planes: planes,
      width: width, height: height, lastVertTime: -1
    };
    if (CC.World) CC.World.ocean = base.mesh;
    if (CC.Details) CC.Details.waterMaterial = base.mesh.material;
    CC.RetroWater.state = state;
    updateRetroWater(0, CC.Game ? CC.Game.time || 0 : 0);
    return state;
  }

  /* Scroll UVs every frame (cheap), but only re-displace vertices at 30 Hz.
     The waves move at ~1 rad/sec, so 30 Hz is visually indistinguishable and
     halves the CPU/buffer-upload cost. */
  function updateRetroWater(deltaTime, elapsedTime) {
    if (!state) return;
    const dt = Math.min(0.1, Math.max(0, Number(deltaTime) || 0));
    const t = Number(elapsedTime) || 0;
    for (let li = 0; li < state.layers.length; li++) {
      const l = state.layers[li];
      l.texture.offset.x = (l.texture.offset.x + l.scroll.x * dt) % 1;
      l.texture.offset.y = (l.texture.offset.y + l.scroll.y * dt) % 1;
    }
    if (state.lastVertTime >= 0 && t - state.lastVertTime < 1 / 30) return;
    state.lastVertTime = t;
    const pos = state.plane.geometry.attributes.position;
    const wx = state.plane.wx, wz = state.plane.wz, base = state.plane.baseY;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, getWaterHeight(wx[i], wz[i], t) - base);
    }
    pos.needsUpdate = true;
  }

  /* ---------- 4-corner pontoon buoyancy ----------
     object3D needs .position and optionally .rotation. physicsState supplies
     velocity/angularVelocity vectors (plain {x,y,z} objects) and tuning:
       halfLength, halfWidth   pontoon spacing from centre
       centerOffsetY           hull origin above the waterline contact
       buoyancyFactor          >1 floats, <1 sinks (cars)
       stiffness, gravity, maxDepth
       forwardDrag, lateralDrag, verticalDamping
       pitchStiffness, rollStiffness, angularDamping
       yaw                     optional override of object3D.rotation.y
     Returns the submerged fraction and the four corner samples. */
  function applyBuoyancy(object3D, physicsState, elapsedTime, deltaTime) {
    if (!object3D || !object3D.position || !physicsState) return null;
    const s = physicsState;
    const dt = Math.min(0.05, Math.max(0, Number(deltaTime) || 0));
    const t = Number(elapsedTime) || 0;
    const vel = s.velocity || (s.velocity = { x: 0, y: 0, z: 0 });
    const ang = s.angularVelocity || (s.angularVelocity = { x: 0, y: 0, z: 0 });
    const rot = object3D.rotation || { x: 0, y: 0, z: 0 };
    const yaw = s.yaw != null ? s.yaw : (rot.y || 0);
    const halfL = Math.max(0.2, Number(s.halfLength) || 2);
    const halfW = Math.max(0.2, Number(s.halfWidth) || 1);
    const centerY = object3D.position.y + (Number(s.centerOffsetY) || 0);
    const cy = Math.cos(yaw), sy = Math.sin(yaw);

    // Front-left, front-right, back-left, back-right in object-local space.
    CORNERS[0].x = -halfW; CORNERS[0].z = halfL;
    CORNERS[1].x = halfW; CORNERS[1].z = halfL;
    CORNERS[2].x = -halfW; CORNERS[2].z = -halfL;
    CORNERS[3].x = halfW; CORNERS[3].z = -halfL;
    const pitchSin = Math.sin(rot.x || 0), rollSin = Math.sin(rot.z || 0);
    for (let i = 0; i < 4; i++) {
      const p = CORNERS[i], out = SAMPLES[i];
      const wx = object3D.position.x + cy * p.x + sy * p.z;
      const wz = object3D.position.z - sy * p.x + cy * p.z;
      // Small-angle pitch/roll correction for each corner's own height.
      const cornerY = centerY - pitchSin * p.z + rollSin * p.x;
      out.x = wx; out.z = wz;
      out.waterY = getWaterHeight(wx, wz, t);
      out.depth = out.waterY - cornerY;
    }
    const samples = SAMPLES;
    const avgDepth = (samples[0].depth + samples[1].depth + samples[2].depth + samples[3].depth) * 0.25;
    const maxDepth = Math.max(0.2, Number(s.maxDepth) || 2);
    const submerged = Math.max(0, Math.min(1, avgDepth / maxDepth));

    // Upward spring force proportional to depth; gravity only acts while any
    // part of the body is actually in the water.
    const stiffness = Number(s.stiffness) || 16;
    const buoyancyFactor = s.buoyancyFactor == null ? 1.6 : s.buoyancyFactor;
    const gravity = s.gravity == null ? 9.8 : s.gravity;
    if (submerged > 0.01) {
      vel.y += (Math.max(0, avgDepth) * stiffness * buoyancyFactor - gravity) * dt;
      vel.y -= vel.y * (Number(s.verticalDamping) || 4.2) * submerged * dt;
    }

    // Torque from the height difference across the front/back and left/right
    // pontoons. Sign convention matches Three.js X pitch / Z roll.
    const front = (samples[0].waterY + samples[1].waterY) * 0.5;
    const back = (samples[2].waterY + samples[3].waterY) * 0.5;
    const left = (samples[0].waterY + samples[2].waterY) * 0.5;
    const right = (samples[1].waterY + samples[3].waterY) * 0.5;
    const targetPitch = -Math.atan2(front - back, 2 * halfL) * submerged;
    const targetRoll = Math.atan2(right - left, 2 * halfW) * submerged;
    const pitchK = Number(s.pitchStiffness) || 9;
    const rollK = Number(s.rollStiffness) || 9;
    const damping = Number(s.angularDamping) || 4.5;
    ang.x += ((targetPitch - (rot.x || 0)) * pitchK - ang.x * damping) * dt;
    ang.z += ((targetRoll - (rot.z || 0)) * rollK - ang.z * damping) * dt;
    ang.x = Math.max(-3, Math.min(3, ang.x));
    ang.z = Math.max(-3, Math.min(3, ang.z));

    // Water drag in the body's own forward/right axes.
    if (submerged > 0.01) {
      const fx = sy, fz = cy, rx = cy, rz = -sy;
      const vf = vel.x * fx + vel.z * fz;
      const vr = vel.x * rx + vel.z * rz;
      const fDrag = Math.min(1, (Number(s.forwardDrag) || 0.6) * submerged * dt);
      const rDrag = Math.min(1, (Number(s.lateralDrag) || 2.4) * submerged * dt);
      const nvf = vf * (1 - fDrag), nvr = vr * (1 - rDrag);
      vel.x += fx * (nvf - vf) + rx * (nvr - vr);
      vel.z += fz * (nvf - vf) + rz * (nvr - vr);
    }

    object3D.position.y += vel.y * dt;
    if (object3D.rotation) {
      object3D.rotation.x = Math.max(-0.35, Math.min(0.35, (rot.x || 0) + ang.x * dt));
      object3D.rotation.z = Math.max(-0.35, Math.min(0.35, (rot.z || 0) + ang.z * dt));
    }
    BUOY_RESULT.submersion = submerged;
    BUOY_RESULT.averageDepth = avgDepth;
    return BUOY_RESULT;
  }

  // Small helper for buoys/dolphins/fish so they bob on the same surface.
  function waterYFor(x, z, elapsedTime, offset) {
    return getWaterHeight(x, z, elapsedTime) + (Number(offset) || 0);
  }

  CC.RetroWater = {
    getWaterHeight: getWaterHeight,
    createRetroWater: createRetroWater,
    updateRetroWater: updateRetroWater,
    applyBuoyancy: applyBuoyancy,
    waterYFor: waterYFor,
    state: null
  };
})();
