/* Coastal Cruise - world generation: terrain, ocean, roads, props, gates, particles. */
(function () {
  'use strict';

  const CC = window.CC;
  const C = CC.C, U = CC.util;
  const World = (CC.World = {
    obstacles: [],
    destructibles: [],
    explosions: [],
    challengeGates: [],
    particles: null,
    scene: null,
    time: 0,
    imageMode: false,
    imageBuildings: [],
    imageLandmarks: [],
    imageTexture: null,
    bridgeRailGaps: 0
  });

  const rng = CC.rng(20261119);
  const tmpMat = {};

  // Tree, shrub, palm and rock placement tests run tens of thousands of times
  // at startup. Build the reserved-zone list once instead of concatenating a
  // new array for every rejection test.
  let reservedZoneCache = null;
  function reservedZones() {
    if (!reservedZoneCache) {
      reservedZoneCache = Object.freeze(
        ['park', 'farm', 'boardwalk', 'amusement', 'pier', 'gas', 'fastfood', 'trailhead']
          .concat(CC.serviceZoneNames ? CC.serviceZoneNames() : []));
    }
    return reservedZoneCache;
  }

  function mat(color, opts) {
    opts = opts || {};
    return new THREE.MeshLambertMaterial(Object.assign({ color, flatShading: true }, opts));
  }
  function getMat(key, color, opts) {
    if (!tmpMat[key]) tmpMat[key] = mat(color, opts);
    return tmpMat[key];
  }
  function box(w, h, d, material, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }

  /* ---------- canvas textures ---------- */
  function stripeTexture(base, stripe, vertical) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = base; g.fillRect(0, 0, 64, 64);
    g.fillStyle = stripe;
    for (let i = 0; i < 64; i += 8) {
      if (vertical) g.fillRect(i, 0, 2, 64);
      else g.fillRect(0, i, 64, 2);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(vertical ? 1 : 4, vertical ? 6 : 1);
    return tex;
  }
  let chainTexCache = null;
  function chainTexture() {
    if (chainTexCache) return chainTexCache;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 64, 64);
    g.strokeStyle = 'rgba(215,225,228,0.85)';
    g.lineWidth = 2;
    for (let i = -64; i < 128; i += 12) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 64, 64); g.stroke();
      g.beginPath(); g.moveTo(i + 64, 0); g.lineTo(i, 64); g.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 1.5);
    chainTexCache = tex;
    return tex;
  }
  const sidingCache = {};
  function sidingMaterial(hex) {
    const key = 'siding' + hex;
    if (!sidingCache[key]) {
      const col = new THREE.Color(hex);
      const light = '#' + col.clone().offsetHSL(0, -0.03, 0.08).getHexString();
      const dark = '#' + col.clone().offsetHSL(0, 0, -0.08).getHexString();
      sidingCache[key] = new THREE.MeshLambertMaterial({
        color: 0xffffff, map: stripeTexture(dark, light, false), flatShading: true
      });
    }
    return sidingCache[key];
  }
  const roofTexCache = {};
  function roofMaterial(hex) {
    const key = 'roof' + hex;
    if (!roofTexCache[key]) {
      const col = new THREE.Color(hex);
      const a = '#' + col.getHexString();
      const b = '#' + col.clone().offsetHSL(0, 0, -0.1).getHexString();
      roofTexCache[key] = new THREE.MeshLambertMaterial({
        color: 0xffffff, map: stripeTexture(a, b, true), flatShading: true
      });
    }
    return roofTexCache[key];
  }

  /* ---------- ocean ---------- */
  // The old scrolling-noise shader is gone. Both the baked-map overlay and the
  // procedural-map ocean now come from the shared retro-water module.
  function buildOcean(scene) {
    if (CC.RetroWater) {
      CC.RetroWater.createRetroWater(scene, {
        width: 1500, height: 1300, cx: 0, cz: 10, segments: 48
      });
    }
  }

  /* ---------- terrain ---------- */
  function buildTerrain(scene) {
    if (World.imageMode && World.imageTexture) {
      // The picture is the ground texture, but a subdivided mesh lets the
      // rolling hills from ImageMap.heightAt show up as real 3D elevation.
      const W = C.WORLD;
      const cx = (W.minX + W.maxX) / 2, cz = (W.minZ + W.maxZ) / 2;
      const geo = new THREE.PlaneGeometry(W.maxX - W.minX, W.maxZ - W.minZ, 190, 166);
      geo.rotateX(-Math.PI / 2);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        pos.setY(i, (CC.groundHeightAt || CC.heightAt)(pos.getX(i) + cx, pos.getZ(i) + cz));
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();
      // A low-alpha grit pass keeps the baked map readable while adding the
      // mottled grass/dirt grain of a PS2-era street-level surface.
      const source = World.imageTexture && World.imageTexture.image;
      const groundCanvas = CC.TextureGenerator
        ? CC.TextureGenerator.grittyCopy(source, 0.15) : source;
      const groundTex = groundCanvas && groundCanvas !== source
        ? new THREE.CanvasTexture(groundCanvas) : World.imageTexture;
      if (groundTex && CC.TextureGenerator) groundTex.anisotropy = CC.TextureGenerator.anisotropy();
      if (groundTex && THREE.SRGBColorSpace) groundTex.colorSpace = THREE.SRGBColorSpace;
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
        map: groundTex, roughness: 1, metalness: 0
      }));
      mesh.position.set(cx, 0, cz);
      mesh.receiveShadow = true;
      scene.add(mesh);
      World.terrain = mesh;
      return;
    }
    const geo = new THREE.PlaneGeometry(900, 800, 130, 116);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const cGrass = new THREE.Color(C.COLORS.grass);
    const cGrassD = new THREE.Color(C.COLORS.grassDark);
    const cSand = new THREE.Color(C.COLORS.sand);
    const cSandD = new THREE.Color(C.COLORS.sandDark);
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + 0, z = pos.getZ(i) + 10;
      const y = (CC.groundHeightAt || CC.heightAt)(x, z);
      pos.setY(i, y);
      const dw = CC.coast.distanceToWater(x, z);
      const n = (Math.sin(x * 0.11) * Math.cos(z * 0.13) + 1) * 0.5;
      if (CC.coast.isWater(x, z)) {
        tmp.copy(cSandD);
      } else if (dw < 48) {
        tmp.copy(cSandD).lerp(cSand, 0.35 + n * 0.55);
        if (dw < 3) tmp.lerp(cSandD, 0.6);
      } else {
        tmp.copy(cGrassD).lerp(cGrass, 0.3 + n * 0.6);
      }
      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      vertexColors: true, map: CC.TextureGenerator ? CC.TextureGenerator.grassDirt() : null,
      roughness: 1, metalness: 0, flatShading: false
    }));
    mesh.position.z = 10;
    mesh.receiveShadow = true;
    scene.add(mesh);
    World.terrain = mesh;
  }

  /* ---------- roads ---------- */
  let asphaltMat = null;
  function asphaltMaterial() {
    if (asphaltMat) return asphaltMat;
    // Shared procedural canvas: grit, cracks and a baked dashed centre line.
    // TextureGenerator applies the renderer's maximum anisotropy for us.
    const tex = CC.TextureGenerator ? CC.TextureGenerator.asphalt() : null;
    asphaltMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, map: tex, roughness: 0.96, metalness: 0.0
    });
    return asphaltMat;
  }

  let dirtRoadMat = null;
  function dirtRoadMaterial() {
    if (dirtRoadMat) return dirtRoadMat;
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#9b8767';
    ctx.fillRect(0, 0, 256, 256);
    const img = ctx.getImageData(0, 0, 256, 256);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * 34;
      d[i] = Math.max(0, Math.min(255, d[i] + n));
      d[i+1] = Math.max(0, Math.min(255, d[i+1] + n * 0.92));
      d[i+2] = Math.max(0, Math.min(255, d[i+2] + n * 0.75));
    }
    ctx.putImageData(img, 0, 0);
    ctx.strokeStyle = 'rgba(90,70,45,0.18)';
    for (let i = 0; i < 120; i++) {
      ctx.lineWidth = Math.random() * 1.8;
      ctx.beginPath();
      const x = Math.random() * 256, y = Math.random() * 256;
      ctx.moveTo(x, y);
      ctx.lineTo(x + (Math.random() - 0.5) * 18, y + (Math.random() - 0.5) * 18);
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 4);
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    dirtRoadMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex, roughness: 1, metalness: 0 });
    return dirtRoadMat;
  }

  function ribbonGeometry(road, halfWidth, lift) {
    // Sample every few metres instead of only at control points. Without this
    // the elevated bridge ramps would be a single long straight triangle and
    // the visible deck would not match the drivable height.
    const source = road.points;
    const pts = [];
    for (let i = 0; i < source.length - 1; i++) {
      const a = source[i], b = source[i + 1];
      const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2));
      for (let k = 0; k < steps; k++) {
        const t = k / steps;
        pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    pts.push(source[source.length - 1]);
    const verts = [], indices = [], uvs = [];
    let running = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const prev = pts[Math.max(0, i - 1)];
      const next = pts[Math.min(pts.length - 1, i + 1)];
      let dx = next[0] - prev[0], dz = next[1] - prev[1];
      const len = Math.hypot(dx, dz) || 1;
      dx /= len; dz /= len;
      const nx = dz, nz = -dx;
      if (i > 0) running += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
      const base = CC.roadSurfaceHeightAt
        ? CC.roadSurfaceHeightAt(p[0], p[1], road)
        : (CC.groundHeightAt ? CC.groundHeightAt(p[0], p[1]) : CC.heightAt(p[0], p[1])) +
          CC.bridgeLiftAt(p[0], p[1]);
      const y = base + lift;
      verts.push(p[0] + nx * halfWidth, y, p[1] + nz * halfWidth);
      verts.push(p[0] - nx * halfWidth, y, p[1] - nz * halfWidth);
      uvs.push(0, running / 8, 1, running / 8);
      if (i < pts.length - 1) {
        const a = i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  function buildRoads(scene) {
    // The picture map has black asphalt roads with dark shoulders.
    const roadMat = World.imageMode ? asphaltMaterial() : getMat('road', C.COLORS.road);
    const gravelMat = getMat('gravel', C.COLORS.gravel);
    const boardMat = getMat('board', C.COLORS.boardwalk);
    const concrete = CC.TextureGenerator ? CC.TextureGenerator.concrete() : null;
    const shoulderMat = World.imageMode
      ? getMat('shoulderDark', 0x242424, { map: concrete })
      : getMat('shoulder', 0xa99a78, { map: concrete });

    CC.roadDefs.forEach(function (road) {
      if (road.type === 'boardwalk') {
        // Plank deck.
        const deck = new THREE.Mesh(ribbonGeometry(road, road.width * 0.5, 1.15), boardMat);
        deck.receiveShadow = true; deck.castShadow = true;
        scene.add(deck);
        const plankGeo = new THREE.BoxGeometry(road.width * 0.96, 0.06, 0.22);
        const plankMat = getMat('plankLine', 0x6f4f31);
        const count = Math.floor(road._length / 1.3);
        const inst = new THREE.InstancedMesh(plankGeo, plankMat, count);
        const dummy = new THREE.Object3D();
        for (let i = 0; i < count; i++) {
          const s = i * 1.3 + 0.6;
          const p = CC.sampleRoad(road, s);
          dummy.position.set(p.x, CC.heightAt(p.x, p.z) + 1.2, p.z);
          dummy.rotation.set(0, Math.atan2(p.dx, p.dz), 0);
          dummy.updateMatrix();
          inst.setMatrixAt(i, dummy.matrix);
        }
        inst.castShadow = false; inst.receiveShadow = true;
        scene.add(inst);
        return;
      }
      const isGravel = road.type === 'gravel';
      const isDirt = road.type === 'dirt' || road.dirt;
      const shoulder = new THREE.Mesh(ribbonGeometry(road, road.width * 0.5 + 1.8, 0.05), shoulderMat);
      shoulder.receiveShadow = true;
      scene.add(shoulder);
      const surfaceMat = isDirt ? dirtRoadMaterial() : (isGravel ? gravelMat : roadMat);
      const surface = new THREE.Mesh(
        ribbonGeometry(road, road.width * 0.5, 0.11),
        surfaceMat
      );
      surface.receiveShadow = true;
      scene.add(surface);
    });

    // Dashed center lines for paved roads, batched into one InstancedMesh.
    // The picture map already draws its own road markings, so skip these.
    if (World.imageMode) return;
    const dashGeo = new THREE.BoxGeometry(0.22, 0.03, 3.6);
    const dashMat = getMat('dash', C.COLORS.roadEdge);
    const transforms = [];
    CC.roadDefs.forEach(function (road) {
      if (road.type !== 'paved') return;
      for (let s = 6; s < road._length - 4; s += 9) {
        const p = CC.sampleRoad(road, s);
        transforms.push({ x: p.x, z: p.z, r: Math.atan2(p.dx, p.dz), road: road });
      }
    });
    const inst = new THREE.InstancedMesh(dashGeo, dashMat, transforms.length);
    const d = new THREE.Object3D();
    transforms.forEach(function (t, i) {
      const base = CC.roadSurfaceHeightAt
        ? CC.roadSurfaceHeightAt(t.x, t.z, t.road) : CC.heightAt(t.x, t.z);
      d.position.set(t.x, base + 0.14, t.z);
      d.rotation.set(0, t.r, 0);
      d.updateMatrix();
      inst.setMatrixAt(i, d.matrix);
    });
    scene.add(inst);
  }

  /* ---------- vegetation ---------- */
  function makePalm() {
    const g = new THREE.Group();
    const trunkMat = getMat('trunk', C.COLORS.trunk);
    const leafMat = getMat('palm', C.COLORS.palm);
    const h = U.randRange(rng, 5, 9);
    const segs = 5;
    for (let i = 0; i < segs; i++) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.22 - i * 0.02, 0.28 - i * 0.02, h / segs, 6), trunkMat);
      seg.position.set(Math.sin(i * 0.4) * 0.18, (i + 0.5) * h / segs, Math.cos(i * 0.3) * 0.1);
      seg.rotation.z = -0.06 + Math.sin(i) * 0.04;
      seg.castShadow = true;
      g.add(seg);
    }
    const crownX = Math.sin(segs * 0.4) * 0.18;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + rng() * 0.3;
      const frond = new THREE.Mesh(new THREE.ConeGeometry(0.62, 3.8, 4), leafMat);
      frond.position.set(crownX + Math.cos(a) * 1.5, h + 0.35 - Math.abs(Math.sin(a)) * 0.2, Math.sin(a) * 1.5);
      frond.rotation.set(Math.PI / 2 - 0.35, 0, -a + Math.PI / 2);
      frond.scale.set(1, 1, 0.22);
      frond.castShadow = true;
      g.add(frond);
    }
    return g;
  }
  function makePine() {
    const g = new THREE.Group();
    const trunkMat = getMat('trunk', C.COLORS.trunk);
    const leafMat = getMat('pine', C.COLORS.pine);
    const h = U.randRange(rng, 4, 7);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, h * 0.5, 5), trunkMat);
    trunk.position.y = h * 0.25; trunk.castShadow = true;
    g.add(trunk);
    for (let i = 0; i < 3; i++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.6 - i * 0.38, h * 0.52, 6), leafMat);
      cone.position.y = h * (0.42 + i * 0.23);
      cone.castShadow = true;
      g.add(cone);
    }
    return g;
  }
  function makeBroadleaf() {
    const g = new THREE.Group();
    const trunkMat = getMat('trunk', C.COLORS.trunk);
    const leafMat = getMat('broadleaf', 0x5d9a52);
    const h = U.randRange(rng, 4.5, 7.5);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, h * 0.55, 6), trunkMat);
    trunk.position.y = h * 0.275; trunk.castShadow = true;
    g.add(trunk);
    for (let i = 0; i < 3; i++) {
      const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(U.randRange(rng, 1.3, 2.1), 0), leafMat);
      blob.position.set(U.randRange(rng, -0.9, 0.9), h * 0.72 + U.randRange(rng, -0.3, 0.6), U.randRange(rng, -0.9, 0.9));
      blob.castShadow = true;
      g.add(blob);
    }
    return g;
  }
  function placeTree(scene, type, x, z) {

    const y = CC.heightAt(x, z);
    const rotation = rng() * Math.PI * 2;
    let s = U.randRange(rng, 0.8, 1.25);
    if (type !== 'palm' && CC.AssetVegetation && CC.AssetVegetation.available !== false) {
      // The CC0 nature models replace the old cone/icosahedron trees. Palms are
      // kept procedural because the pack has no coastal palm.
      let model = 'pine';
      if (type === 'broadleaf') {
        model = rng() < 0.63 ? 'oak' : 'birch';
        s = U.randRange(rng, 1.0, 1.45);
      } else if (rng() < 0.06) {
        model = 'deadTree';
      } else {
        s = U.randRange(rng, 0.72, 1.12);
      }
      CC.AssetVegetation.queue(model, x, y, z, s, rotation);
    } else {
      const t = type === 'palm' ? makePalm() : type === 'broadleaf' ? makeBroadleaf() : makePine();
      t.position.set(x, y, z);
      t.rotation.y = rotation;
      t.scale.setScalar(s);
      scene.add(t);
    }
    World.obstacles.push({ x, z, r: (type === 'palm' ? 0.7 : 1.0) * s, type: 'tree' });
  }

  /* ---------- mobile homes ---------- */
  const pastels = [0xe9d7bd, 0xbcd9d0, 0xe7c5b5, 0xd7d3b0, 0xc6d3e5, 0xe6d3a6, 0xd9c4dc, 0xcfe0c0];
  const roofColors = [0x9aa3a6, 0xb7aaa0, 0x8e9aa0, 0xa8a08f];

  function makeMobileHome(doubleWide) {
    const g = new THREE.Group();
    const w = doubleWide ? 7.4 : 4.3;
    const l = doubleWide ? 15 : 13.5;
    const bodyColor = U.pick(rng, pastels);
    const roofColor = U.pick(rng, roofColors);

    const skirting = box(w + 0.25, 0.85, l + 0.25, getMat('skirt', 0x8d8c83), 0, 0.42, 0);
    g.add(skirting);
    const body = box(w, 2.9, l, sidingMaterial(bodyColor), 0, 2.25, 0);
    g.add(body);

    const roofMat = roofMaterial(roofColor);
    for (const side of [-1, 1]) {
      const roof = box(w / 2 + 0.45, 0.18, l + 0.7, roofMat, side * w * 0.25, 3.78, 0);
      roof.rotation.z = side * -0.085;
      g.add(roof);
    }
    const ridge = box(0.35, 0.28, l + 0.7, roofMat, 0, 3.92, 0);
    g.add(ridge);

    // Porch + steps at local +Z (front).
    const porch = box(w + 0.5, 0.22, 2.5, getMat('deck', 0xa67f55), 0, 0.78, l / 2 + 1.2);
    g.add(porch);
    for (const px of [-w * 0.35, w * 0.35]) {
      const post = box(0.14, 2.5, 0.14, getMat('post', 0xeee6d2), px, 2.02, l / 2 + 2.1);
      g.add(post);
    }
    const awning = box(w + 0.7, 0.14, 2.7, roofMat, 0, 3.32, l / 2 + 1.25);
    awning.rotation.x = -0.08;
    g.add(awning);
    g.add(box(2.2, 0.16, 0.75, getMat('step', 0x9c906f), w * 0.28, 0.35, l / 2 + 2.75));

    // Door, windows, AC.
    const dark = getMat('window', 0x27485c, { emissive: 0x0d1d26 });
    g.add(box(1.1, 2.1, 0.12, getMat('door', 0x6d8a86), -w * 0.25, 1.85, l / 2 + 0.06));
    const winCount = doubleWide ? 3 : 2;
    for (let i = 0; i < winCount; i++) {
      const wx = -w * 0.05 + i * (w / (winCount + 0.6));
      g.add(box(1.35, 1.1, 0.13, dark, wx, 2.2, l / 2 + 0.08));
      g.add(box(1.5, 0.12, 0.2, getMat('trim', 0xf0ead9), wx, 2.8, l / 2 + 0.1));
    }
    for (const side of [-1, 1]) {
      g.add(box(0.13, 1.1, 1.5, dark, side * (w / 2 + 0.07), 2.2, -l * 0.18));
    }
    const ac = box(0.55, 0.55, 0.75, getMat('ac', 0xd6d9d4), w / 2 + 0.35, 2.4, -l * 0.34);
    g.add(ac);
    for (let i = 0; i < 4; i++) g.add(box(0.06, 0.4, 0.06, getMat('acVent', 0x8f9797), w / 2 + 0.66, 2.4, -l * 0.34 - 0.25 + i * 0.17));

    // Propane tank.
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 1.15, 8), getMat('propane', C.COLORS.rust));
    tank.position.set(-w / 2 - 0.6, 0.85, -l * 0.32);
    tank.castShadow = true;
    g.add(tank);

    g.userData.bounds = { w, l };
    return g;
  }

  function addFence(scene, x, z, angle, length) {
    const group = new THREE.Group();
    const postMat = getMat('fencePost', 0x8f9a9d);
    const wireMat = getMat('chainWire', 0xc3cbcc, {
      map: chainTexture(), transparent: true, alphaTest: 0.28, side: THREE.DoubleSide
    });
    const n = Math.max(2, Math.round(length / 2.4));
    for (let i = 0; i <= n; i++) {
      const p = box(0.12, 1.85, 0.12, postMat, -length / 2 + (length / n) * i, 0.95, 0);
      group.add(p);
    }
    const wire = new THREE.Mesh(new THREE.PlaneGeometry(length, 1.7), wireMat);
    wire.position.y = 1.05;
    group.add(wire);
    group.position.set(x, CC.heightAt(x, z), z);
    group.rotation.y = angle;
    scene.add(group);
  }

  /* ---------- small destructible yard props ---------- */
  function makeMailbox() {
    const g = new THREE.Group();
    g.add(box(0.12, 1.35, 0.12, getMat('mailPost', 0x7b6a55), 0, 0.68, 0));
    g.add(box(0.62, 0.42, 0.9, getMat('mailBox', 0x6f95b8), 0, 1.48, 0));
    const flag = box(0.06, 0.42, 0.08, getMat('flag', 0xd8503f), 0.34, 1.72, 0);
    g.add(flag);
    return g;
  }
  function makeTrashCan() {
    const g = new THREE.Group();
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.35, 1.0, 8), getMat('trash', 0x4f6b74));
    can.position.y = 0.5; can.castShadow = true;
    g.add(can);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.1, 8), getMat('lid', 0x364d53));
    lid.position.y = 1.04;
    g.add(lid);
    return g;
  }
  function makeLawnChair() {
    const g = new THREE.Group();
    const cm = getMat('chair', 0xdd8f6a);
    const seat = box(0.95, 0.1, 0.9, cm, 0, 0.48, 0);
    seat.rotation.x = -0.12;
    g.add(seat);
    const back = box(0.95, 0.9, 0.1, cm, 0, 0.95, -0.42);
    back.rotation.x = -0.28;
    g.add(back);
    for (const x of [-0.4, 0.4]) for (const z of [-0.35, 0.35]) {
      g.add(box(0.07, 0.48, 0.07, getMat('chairLeg', 0xb6b3a5), x, 0.24, z));
    }
    return g;
  }
  function addDestructible(scene, type, x, z, angle) {
    const mesh = type === 'mailbox' ? makeMailbox() : type === 'trash' ? makeTrashCan() : makeLawnChair();
    mesh.position.set(x, CC.heightAt(x, z), z);
    mesh.rotation.y = angle || rng() * Math.PI * 2;
    scene.add(mesh);
    const d = { mesh, x, z, type, alive: true, r: type === 'chair' ? 0.8 : 0.5, vy: 0, spin: 0, fallen: false };
    World.destructibles.push(d);
    return d;
  }

  function makeBoatTrailer() {
    const g = new THREE.Group();
    const hullMat = getMat('boatHull', 0xf0ece0);
    const trimMat = getMat('boatTrim', 0x3c7fa5);
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 0.55, 5.4, 6, 1, false, 0, Math.PI), hullMat);
    hull.rotation.z = Math.PI / 2;
    hull.rotation.y = Math.PI / 2;
    hull.scale.set(1, 1, 0.55);
    hull.position.y = 1.75;
    hull.castShadow = true;
    g.add(hull);
    g.add(box(1.5, 0.5, 2.4, trimMat, 0, 1.55, 0.4));
    g.add(box(0.12, 0.6, 3.6, getMat('trailerFrame', 0x5b6064), 0, 0.72, 0));
    g.add(box(2.2, 0.12, 0.12, getMat('trailerFrame', 0x5b6064), 0, 0.72, -1.4));
    for (const x of [-1.05, 1.05]) for (const z of [-1.4, 1.3]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.2, 10), getMat('tyre', 0x2c3033));
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.45, z);
      g.add(wheel);
    }
    return g;
  }

  function makeUmbrella() {
    const g = new THREE.Group();
    g.add(box(0.08, 2.4, 0.08, getMat('umPole', 0xd9d2bc), 0, 1.2, 0));
    const top = new THREE.Mesh(new THREE.ConeGeometry(1.7, 0.8, 8), getMat('umbrella', U.pick(rng, [0xef8c72, 0x68b8c4, 0xe9c65e])));
    top.position.y = 2.6; top.castShadow = true;
    g.add(top);
    return g;
  }

  function farFromObstacles(x, z, minDist) {
    for (let i = 0; i < World.obstacles.length; i++) {
      const o = World.obstacles[i];
      if (U.distance2D(x, z, o.x, o.z) < minDist + o.r) return false;
    }
    return true;
  }

  function buildProps(scene) {
    // Mobile homes along the roads, facing the street.
    let homes = 0;
    const pavedRoads = CC.roadDefs.filter(r => r.type === 'paved');
    const outer = [pavedRoads[0], pavedRoads[1], pavedRoads[2], pavedRoads[3], pavedRoads[4]];
    for (let pass = 0; pass < 3 && homes < 36; pass++) {
      for (let ri = 0; ri < outer.length && homes < 36; ri++) {
        const road = outer[ri];
        for (let s = 20 + pass * 13; s < road._length - 14 && homes < 36; s += 42) {
          if (rng() > 0.62) continue;
          const p = CC.sampleRoad(road, s);
          const side = rng() < 0.5 ? 1 : -1;
          const nx = p.dz * side, nz = -p.dx * side;
          const off = road.width * 0.5 + U.randRange(rng, 12, 21);
          const x = p.x + nx * off, z = p.z + nz * off;
          if (CC.coast.isWater(x, z) || CC.coast.distanceToWater(x, z) < 8) continue;
          if (!farFromObstacles(x, z, 16)) continue;
          const doubleWide = rng() < 0.38;
          const home = makeMobileHome(doubleWide);
          home.position.set(x, CC.heightAt(x, z), z);
          home.rotation.y = Math.atan2(-nx, -nz);
          scene.add(home);
          const b = home.userData.bounds;
          World.obstacles.push({ x, z, r: Math.max(b.w, b.l) * 0.42, type: 'home' });
          homes++;

          // Yard details.
          if (rng() < 0.65) {
            const fx = x + nx * (b.w * 0.5 + 5) + U.randRange(rng, -2, 2);
            const fz = z + nz * (b.w * 0.5 + 5) + U.randRange(rng, -2, 2);
            if (!CC.coast.isWater(fx, fz)) addFence(scene, fx, fz, Math.atan2(p.dx, p.dz), U.randRange(rng, 8, 16));
          }
          const mx = p.x + nx * (road.width * 0.5 + 3.2);
          const mz = p.z + nz * (road.width * 0.5 + 3.2);
          if (!CC.coast.isWater(mx, mz)) addDestructible(scene, 'mailbox', mx, mz, home.rotation.y);
          if (rng() < 0.7) {
            const tx = x - nx * (b.w * 0.5 + 2.6) + U.randRange(rng, -3, 3);
            const tz = z - nz * (b.w * 0.5 + 2.6) + U.randRange(rng, -3, 3);
            addDestructible(scene, rng() < 0.6 ? 'trash' : 'chair', tx, tz);
          }
        }
      }
    }

    // Trees.
    let trees = 0;
    let attempts = 0;
    while (trees < 115 && attempts < 1800) {
      attempts++;
      const x = U.randRange(rng, C.WORLD.minX + 25, C.WORLD.maxX - 25);
      const z = U.randRange(rng, C.WORLD.minZ + 25, C.WORLD.maxZ - 25);
      if (CC.coast.isWater(x, z) || CC.coast.distanceToWater(x, z) < 10) continue;
      const nr = CC.nearestRoad(x, z);
      if (nr && nr.dist < nr.width * 0.5 + 4) continue;
      if (!farFromObstacles(x, z, 3.5)) continue;
      if (CC.nearNatureTrail && CC.nearNatureTrail(x, z)) continue;
      const nearBeach = CC.coast.distanceToWater(x, z) < 85;
      placeTree(scene, nearBeach || rng() < 0.45 ? 'palm' : 'pine', x, z);
      trees++;
    }

    // Boats on trailers near the shore.
    let boats = 0;
    attempts = 0;
    while (boats < 9 && attempts < 600) {
      attempts++;
      const x = U.randRange(rng, -270, 150);
      const z = U.randRange(rng, -320, 255);
      const dw = CC.coast.distanceToWater(x, z);
      if (CC.coast.isWater(x, z) || dw < 14 || dw > 90) continue;
      const nr = CC.nearestRoad(x, z);
      if (nr && nr.dist < nr.width * 0.5 + 7) continue;
      if (!farFromObstacles(x, z, 10)) continue;
      const boat = makeBoatTrailer();
      boat.position.set(x, CC.heightAt(x, z), z);
      boat.rotation.y = rng() * Math.PI * 2;
      scene.add(boat);
      World.obstacles.push({ x, z, r: 3.0, type: 'boat' });
      boats++;
    }

    // Beach umbrellas.
    for (let i = 0; i < 16; i++) {
      const nearSouth = rng() < 0.5;
      let x, z;
      if (nearSouth) {
        x = U.randRange(rng, -260, 320);
        z = CC.coast.southLine(x) - U.randRange(rng, 8, 30);
      } else {
        z = U.randRange(rng, -320, 250);
        x = CC.coast.westLine(z) + U.randRange(rng, 8, 30);
      }
      if (CC.coast.isWater(x, z)) continue;
      const u = makeUmbrella();
      u.position.set(x, CC.heightAt(x, z), z);
      u.rotation.y = rng() * Math.PI;
      scene.add(u);
      World.obstacles.push({ x, z, r: 0.6, type: 'umbrella' });
    }

    // Extra scattered yard props along gravel/inner roads.
    for (let i = 0; i < 26; i++) {
      const road = U.pick(rng, CC.roadDefs.filter(r => r.type !== 'boardwalk'));
      const p = CC.sampleRoad(road, rng() * road._length);
      const side = rng() < 0.5 ? 1 : -1;
      const x = p.x + p.dz * side * (road.width * 0.5 + U.randRange(rng, 3, 9));
      const z = p.z - p.dx * side * (road.width * 0.5 + U.randRange(rng, 3, 9));
      if (CC.coast.isWater(x, z)) continue;
      addDestructible(scene, U.pick(rng, ['mailbox', 'trash', 'chair']), x, z);
    }
  }

  /* ---------- buildings and greenery traced from the picture ---------- */
  function buildImageBuildings(scene) {
    const margin = (CC.imageMapDef && CC.imageMapDef.lawnMargin) || 3;
    const lawnGeo = {};
    const retroNames = ['retro1', 'retro2', 'retro3', 'retro4', 'retro5'];
    const trailerNames = ['trailer1', 'trailer2', 'trailer3', 'trailer4', 'trailer5', 'trailer6'];
    const canUseAssets = CC.AssetBuildings && CC.AssetLoader && CC.AssetLoader.footprint;
    (World.imageBuildings || []).forEach(function (b, i) {
      const y = Math.max(0, CC.heightAt(b.x, b.z));
      const key = b.w + 'x' + b.l;
      if (!lawnGeo[key]) lawnGeo[key] = new THREE.PlaneGeometry(b.w + margin * 2, b.l + margin * 2);
      const group = new THREE.Group();
      group.position.set(b.x, 0, b.z);
      group.rotation.y = b.rot || 0;

      // A patch of green grass around each small trailer home.
      const lawn = new THREE.Mesh(lawnGeo[key], getMat('lawn' + (i % 2), i % 2 ? 0x6b9c49 : 0x79a851, {
        map: CC.TextureGenerator ? CC.TextureGenerator.grassDirt() : null
      }));
      lawn.rotation.x = -Math.PI / 2;
      lawn.position.set(0, y + 0.06, 0);
      lawn.receiveShadow = true;
      group.add(lawn);

      const isRetro = i % 4 === 0;
      const name = isRetro ? retroNames[i % retroNames.length] : trailerNames[i % trailerNames.length];
      const fp = canUseAssets ? CC.AssetLoader.footprint(name) : null;
      if (fp) {
        // Keep the baked footprint and collision math. The model's long axis
        // follows the row, so the detailed body never reaches a neighbouring
        // lot or the shoulder of the road.
        const alongX = b.w >= b.l;
        const shortSide = alongX ? b.l : b.w;
        const longSide = alongX ? b.w : b.l;
        const scale = {
          x: shortSide / fp.w * 0.94,
          z: longSide / fp.l * 0.94,
          y: U.clamp((b.h + (isRetro ? 1.35 : 0.5)) / fp.h, 0.42, 1)
        };
        const rotation = (alongX ? Math.PI / 2 : 0) + (i % 2 ? Math.PI : 0);
        if (isRetro) CC.AssetBuildings.queueHouse(name, b.x, y + 0.08, b.z, rotation, scale, b.color);
        else CC.AssetBuildings.queueTrailer(name, b.x, y + 0.08, b.z, rotation, scale);
        b.asset = name;
      } else {
        const body = box(b.w, b.h, b.l, sidingMaterial(b.color), 0, y + 0.1 + b.h * 0.5, 0);
        group.add(body);
        const roofColor = [0x7f8b90, 0x949a9b, 0xa8a196][i % 3];
        const roof = box(b.w + 0.4, 0.22, b.l + 0.4, getMat('imgRoof' + (i % 3), roofColor), 0, y + 0.1 + b.h + 0.11, 0);
        group.add(roof);
      }
      if (CC.EnvironmentManager) {
        CC.EnvironmentManager.attachBlobShadow(group, b.w * 1.55, y + 0.075, b.l * 1.35);
      }
      scene.add(group);
      World.obstacles.push({ x: b.x, z: b.z, r: Math.min(b.w, b.l) * 0.48, type: 'home' });
    });
  }

  /* ---------- waterfront and town landmarks ---------- */
  function addLandmarkObstacle(x, z, r) {
    World.obstacles.push({ x: x, z: z, r: r, type: 'landmark' });
  }

  function makePicnicTable(x, z, angle) {
    const g = new THREE.Group();
    const wood = getMat('picnicWood', 0xb08256);
    g.add(box(2.6, 0.16, 1.5, wood, 0, 1.05, 0));
    for (const side of [-1, 1]) {
      g.add(box(2.6, 0.14, 0.42, wood, 0, 0.62, side * 1.15));
      for (const px of [-1.0, 1.0]) {
        g.add(box(0.14, 1.0, 0.14, getMat('picnicLeg', 0x7d6146), px, 0.5, side * 0.55));
      }
    }
    g.position.set(x, CC.heightAt(x, z), z);
    g.rotation.y = angle || 0;
    return g;
  }

  function buildLandmarks(scene) {
    (CC.World.imageLandmarks || []).forEach(function (l, i) {
      const group = new THREE.Group();
      group.position.set(l.x, 0, l.z);
      group.rotation.y = l.rot || 0;
      const front = l.l * 0.5;

      if (l.type === 'store' || l.type === 'restaurant') {
        const bodyColor = l.type === 'store' ? 0xe6d6ad : 0xd9c7a8;
        group.add(box(l.w, 4.6, l.l, sidingMaterial(bodyColor), 0, 2.45, 0));
        group.add(box(l.w + 1.2, 0.55, l.l + 1.4,
          getMat(l.type + 'Roof', l.type === 'store' ? 0x9b5c46 : 0x7a4f45), 0, 4.95, 0));
        const awning = box(l.w + 1.4, 0.22, 3.2,
          getMat('awn' + i, l.type === 'restaurant' ? 0xc8503f : 0x2f7d88), 0, 3.35, front + 1.4);
        awning.rotation.x = -0.13;
        group.add(awning);
        const dark = getMat('shopWindow', 0x2b4f5e, { emissive: 0x0d1d26 });
        for (const side of [-1, 1]) {
          group.add(box(l.w * 0.26, 1.7, 0.14, dark, side * l.w * 0.3, 2.15, front + 0.08));
          group.add(box(l.w * 0.28, 0.16, 0.2, getMat('shopTrim', 0xf3ead6), side * l.w * 0.3, 3.06, front + 0.2));
        }
        group.add(box(1.8, 2.6, 0.16, getMat('shopDoor', 0x5c7d78), 0, 1.55, front + 0.1));
        addLandmarkObstacle(l.x, l.z, Math.max(l.w, l.l) * 0.52);

      } else if (l.type === 'launch') {
        // Local +Z points out into the bay. The ramp is painted as drivable
        // sand in the ground texture, so vehicles can roll right up to it.
        group.add(box(l.w, 0.3, 34, getMat('launchRamp', 0xa8ada9), 0, 0.22, 19));
        group.add(box(l.w * 0.75, 0.35, 12, getMat('launchDock', 0xa87b4e), 0, 1.25, 28));
        for (const side of [-1, 1]) {
          for (let k = 0; k < 3; k++) {
            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 2.4, 7), getMat('dockPost', 0x7d6a4f));
            post.position.set(side * l.w * 0.34, 0.6, 23 + k * 5);
            post.castShadow = true;
            group.add(post);
          }
        }
        const trailer = makeBoatTrailer();
        trailer.position.set(3.5, 0.15, -2);
        trailer.rotation.y = 0.4;
        group.add(trailer);
        addLandmarkObstacle(l.x, l.z + 8, 3.2);
      } else if (l.type === 'pavilion') {
        group.add(box(l.w, 0.35, l.l, getMat('pavSlab', 0xb8b6a7), 0, 0.2, 0));
        const postMat = getMat('pavPost', 0xe9e5d4);
        for (const px of [-l.w * 0.42, l.w * 0.42]) {
          for (const pz of [-l.l * 0.42, l.l * 0.42]) {
            group.add(box(0.28, 4.2, 0.28, postMat, px, 2.3, pz));
          }
        }
        const roof = new THREE.Mesh(new THREE.ConeGeometry(l.w * 0.82, 2.8, 4), getMat('pavRoof', 0x4e7f88));
        roof.position.y = 5.3; roof.rotation.y = Math.PI / 4; roof.castShadow = true;
        group.add(roof);
        addLandmarkObstacle(l.x, l.z, 4.5);
        for (let k = 0; k < 3; k++) {
          const a = (k / 3) * Math.PI * 2;
          scene.add(makePicnicTable(l.x + Math.cos(a) * 16, l.z + Math.sin(a) * 16, a));
        }
      }
      scene.add(group);
    });
  }

  function buildImageProps(scene) {
    const IM = CC.ImageMap;
    // Beach umbrellas first, so the trees are kept clear of them.
    let umbrellas = 0, uAttempts = 0;
    while (umbrellas < 18 && uAttempts < 6000) {
      uAttempts++;
      const x = U.randRange(rng, C.WORLD.minX + 18, C.WORLD.minX + 180);
      const z = U.randRange(rng, C.WORLD.minZ + 18, C.WORLD.maxZ - 18);
      if (!IM || IM.classify(x, z) !== IM.CLS.SAND) continue;
      if (CC.coast.distanceToWater(x, z) > 10) continue;
      if (!farFromObstacles(x, z, 5)) continue;
      const u = makeUmbrella();
      u.position.set(x, CC.heightAt(x, z), z);
      scene.add(u);
      World.obstacles.push({ x: x, z: z, r: 1.2, type: 'umbrella' });
      umbrellas++;
    }
    // Transit shelters are placed later in Details, so reserve their positions
    // here while the baked trees and shrubs are still being scattered.
    const busStopPoints = CC.busStopPoints ? CC.busStopPoints() : [];
    function nearBusStop(x, z, radius) {
      for (let i = 0; i < busStopPoints.length; i++) {
        if (U.distance2D(x, z, busStopPoints[i].x, busStopPoints[i].z) < radius) return true;
      }
      return false;
    }

    // Dense woods, packed yard trees and lots of palms along the shore.
    let placed = 0, palms = 0, attempts = 0;
    // More of the same baked Nature_Terrain trees, with a slightly wider road
    // margin so the larger broadleaf canopies never hang over the shoulder.
    while (placed < 1100 && attempts < 55000) {
      attempts++;
      const x = U.randRange(rng, C.WORLD.minX + 12, C.WORLD.maxX - 12);
      const z = U.randRange(rng, C.WORLD.minZ + 12, C.WORLD.maxZ - 12);
      const c = IM ? IM.classify(x, z) : IM.CLS.ROAD;
      if (c === IM.CLS.ROAD || c === IM.CLS.BUILDING || c === IM.CLS.WATER) continue;
      if (IM && reservedZones().some(function (name) {
        return IM.inZone(x, z, name);
      })) continue;
      if (CC.nearNatureTrail && CC.nearNatureTrail(x, z)) continue;
      if (nearBusStop(x, z, 5.5)) continue;
      // Leave some open sand for umbrellas and beachgoers.
      if (c === IM.CLS.SAND && rng() > 0.32) continue;
      const nr = CC.nearestRoad(x, z);
      if (nr && nr.dist < nr.width * 0.5 + 3.2) continue;
      if (!farFromObstacles(x, z, 3.2)) continue;
      const nearWater = !IM || c === IM.CLS.SAND || CC.coast.distanceToWater(x, z) < 28;
      const palmChance = nearWater ? 0.55 : c === IM.CLS.FOREST ? 0.02 : 0.12;
      const broadChance = c === IM.CLS.FOREST ? 0.12 : 0.24;
      const roll = rng();
      let type = 'pine';
      if (roll < palmChance) type = 'palm';
      else if (roll < palmChance + broadChance) type = 'broadleaf';
      if (type === 'palm') palms++;
      placeTree(scene, type, x, z);
      placed++;
    }
    World.treeCount = placed;
    World.palmCount = palms;
    World.imageTreeTarget = 1100;

    // Extra shoreline palms. The general woods pass only picks a palm around
    // half the time on sand, so this dedicated sweep fills the beachfront with
    // a denser tropical line while still avoiding roads, buildings and sites.
    let beachPalms = 0, beachAttempts = 0;
    while (beachPalms < 170 && beachAttempts < 32000) {
      beachAttempts++;
      const x = U.randRange(rng, C.WORLD.minX + 8, C.WORLD.maxX - 8);
      const z = U.randRange(rng, C.WORLD.minZ + 8, C.WORLD.maxZ - 8);
      if (!IM || !IM.classify || IM.classify(x, z) !== IM.CLS.SAND) continue;
      const dw = CC.coast.distanceToWater(x, z);
      if (CC.coast.isWater(x, z) || dw < 5 || dw > 38) continue;
      if (IM.inZone && reservedZones().some(function (name) {
        return IM.inZone(x, z, name);
      })) continue;
      if (CC.nearNatureTrail && CC.nearNatureTrail(x, z)) continue;
      if (nearBusStop(x, z, 6)) continue;
      const nr = CC.nearestRoad(x, z);
      if (nr && nr.dist < nr.width * 0.5 + 5) continue;
      if (!farFromObstacles(x, z, 4.5)) continue;
      placeTree(scene, 'palm', x, z);
      beachPalms++;
    }
    World.palmCount += beachPalms;
    World.beachPalmCount = beachPalms;

    // CC0 ferns, bushes, grass, flowers and rocks replace most of the old
    // scattered vegetation, batched into one instanced draw per model.
    if (CC.AssetVegetation && CC.AssetVegetation.available !== false) {
      let cover = 0, coverAttempts = 0;
      // Denser baked shrubbery from the same CC0 Nature_Terrain pack.
      while (cover < 1200 && coverAttempts < 60000) {
        coverAttempts++;
        const x = U.randRange(rng, C.WORLD.minX + 14, C.WORLD.maxX - 14);
        const z = U.randRange(rng, C.WORLD.minZ + 14, C.WORLD.maxZ - 14);
        const c = IM ? IM.classify(x, z) : IM.CLS.GRASS;
        if (c === IM.CLS.ROAD || c === IM.CLS.BUILDING || c === IM.CLS.WATER) continue;
        if (c === IM.CLS.SAND && rng() > 0.18) continue;
        if (IM && reservedZones().some(function (name) {
          return IM.inZone(x, z, name);
        })) continue;
        if (CC.nearNatureTrail && CC.nearNatureTrail(x, z)) continue;
        if (nearBusStop(x, z, 4.5)) continue;
        const nr = CC.nearestRoad(x, z);
        if (nr && nr.dist < nr.width * 0.5 + 3.4) continue;
        if (!farFromObstacles(x, z, 1.15)) continue;
        const nearWater = CC.coast.distanceToWater(x, z) < 34;
        const roll = rng();
        let model;
        if (nearWater && roll < 0.22) model = 'fern';
        else if (roll < 0.56) model = 'bush';
        else if (roll < 0.70) model = 'grass';
        else if (roll < 0.80) model = 'flowers';
        else if (roll < 0.90) model = 'rocks';
        else if (roll < 0.96) model = 'boulder';
        else model = 'stump';
        const scale = model === 'boulder' ? U.randRange(rng, 0.6, 1.4)
          : model === 'stump' ? U.randRange(rng, 0.7, 1.1)
            : U.randRange(rng, 0.85, 1.6);
        CC.AssetVegetation.queue(model, x, CC.heightAt(x, z), z, scale, rng() * Math.PI * 2);
        cover++;
      }
      World.assetGroundCover = cover;
      World.bakedCoverTarget = 1200;
    }

    // Downloaded rock pack: scatter the five individually baked stones across
    // dry land, keeping them clear of roads, bus stops, trails and buildings.
    const rockNames = ['downloadedRock0', 'downloadedRock1', 'downloadedRock2',
      'downloadedRock3', 'downloadedRock4'];
    if (CC.AssetRocks && rockNames.every(function (n) { return CC.AssetRocks.queue(n, 1e6, 0, 1e6, 1, 0); })) {
      CC.AssetRocks.queues = {};
      let rocks = 0, attempts = 0;
      while (rocks < 95 && attempts < 14000) {
        attempts++;
        const x = U.randRange(rng, C.WORLD.minX + 10, C.WORLD.maxX - 10);
        const z = U.randRange(rng, C.WORLD.minZ + 10, C.WORLD.maxZ - 10);
        const c = IM ? IM.classify(x, z) : IM.CLS.GRASS;
        if (c === IM.CLS.ROAD || c === IM.CLS.BUILDING || c === IM.CLS.WATER) continue;
        if (c === IM.CLS.SAND && rng() > 0.32) continue;
        // Service-zone car parks are paved at runtime, so the baked image can
        // still classify an empty lot as grass. Keep every rock out of them.
        if (IM && CC.serviceZoneNames().some(function (name) {
          return IM.inZone(x, z, name);
        })) continue;
        if (CC.nearNatureTrail && CC.nearNatureTrail(x, z)) continue;
        if (nearBusStop(x, z, 5)) continue;
        const nr = CC.nearestRoad(x, z);
        if (nr && nr.dist < nr.width * 0.5 + 3.8) continue;
        if (!farFromObstacles(x, z, 2.4)) continue;
        const name = U.pick(rng, rockNames);
        const bounds = CC.AssetLoader.footprint ? CC.AssetLoader.footprint(name) : null;
        const scale = U.randRange(rng, 0.85, 1.45);
        const footprint = bounds ? Math.max(bounds.w, bounds.l) * 0.5 * scale : 1;
        if (!farFromObstacles(x, z, footprint + 1.6)) continue;
        CC.AssetRocks.queue(name, x, CC.heightAt(x, z), z, scale, rng() * Math.PI * 2);
        World.obstacles.push({ x: x, z: z, r: Math.max(0.55, footprint * 0.8), type: 'rock' });
        rocks++;
      }
      World.downloadedRockCount = rocks;
    }
    // A few knock-overable props beside the roads.
    const paved = CC.roadDefs.filter(function (r) { return r.type === 'paved'; });
    for (let i = 0; i < 22 && paved.length; i++) {
      const road = U.pick(rng, paved);
      const p = CC.sampleRoad(road, rng() * road._length);
      const side = rng() < 0.5 ? 1 : -1;
      const x = p.x + p.dz * side * (road.width * 0.5 + 3.2);
      const z = p.z - p.dx * side * (road.width * 0.5 + 3.2);
      if (!CC.coast.isWater(x, z)) addDestructible(scene, U.pick(rng, ['mailbox', 'trash', 'chair']), x, z);
    }
  }

  /* ---------- time-trial gates ---------- */
  function gateLabel(text, color) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(10,25,35,0.65)';
    g.roundRect ? g.roundRect(2, 2, 252, 60, 12) : g.fillRect(2, 2, 252, 60);
    g.fill();
    g.font = 'bold 28px Arial';
    g.fillStyle = '#' + new THREE.Color(color).getHexString();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 128, 33);
    const tex = new THREE.CanvasTexture(c);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    spr.scale.set(12, 3, 1);
    return spr;
  }

  function buildGates(scene) {
    CC.challengeDefs.forEach(function (ch) {
      try { ch.best = Number(localStorage.getItem('cc_best_' + ch.id)) || null; }
      catch (e) { ch.best = null; }
      const col = new THREE.Color(ch.color);
      const ringMat = new THREE.MeshStandardMaterial({
        color: col, emissive: col, emissiveIntensity: 1.5, roughness: 0.3, metalness: 0.1
      });
      const beamMat = new THREE.MeshBasicMaterial({
        color: col, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
      });
      ch.gates.forEach(function (coord, i) {
        const x = coord[0], z = coord[1];
        const y = CC.heightAt(x, z);
        const next = ch.gates[i + 1] || ch.gates[i - 1];
        const prev = ch.gates[i - 1] || ch.gates[i + 1];
        const dir = new THREE.Vector3(next[0] - prev[0], 0, next[1] - prev[1]).normalize();
        const group = new THREE.Group();
        group.position.set(x, y + 3.2, z);
        group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);

        const ring = new THREE.Mesh(new THREE.TorusGeometry(3.3, 0.22, 6, 20), ringMat.clone());
        group.add(ring);
        const inner = new THREE.Mesh(new THREE.TorusGeometry(2.75, 0.06, 5, 20), ringMat.clone());
        group.add(inner);
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.7, 7, 16, 1, true), beamMat.clone());
        beam.rotation.x = Math.PI / 2;
        beam.position.z = 0;
        group.add(beam);
        for (const side of [-1, 1]) {
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 3.2, 6), getMat('gatePost', 0xe8e8dd));
          post.position.set(side * 3.35, -1.6, 0);
          post.castShadow = true;
          group.add(post);
        }
        if (i === 0) {
          const label = gateLabel(ch.name, ch.color);
          label.position.set(0, 5.2, 0);
          group.add(label);
        }
        scene.add(group);
        World.challengeGates.push({ group, ring, inner, beam, challenge: ch, index: i, x, z, y, color: col });
      });
    });
  }

  /* ---------- dust particle pool ---------- */
  function buildParticles(scene) {
    const MAX = 1800;
    const positions = new Float32Array(MAX * 3);
    const colors = new Float32Array(MAX * 3);
    const life = new Float32Array(MAX);
    const vel = new Float32Array(MAX * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aLife', new THREE.BufferAttribute(life, 1));
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      vertexShader: [
        'attribute float aLife; varying vec3 vColor; varying float vLife;',
        'void main(){ vColor=color; vLife=aLife;',
        ' vec4 mv = modelViewMatrix * vec4(position,1.0);',
        ' gl_PointSize = (46.0 + aLife*38.0) / max(1.0, -mv.z) * 11.0;',
        ' gl_Position = projectionMatrix * mv; }'
      ].join('\n'),
      fragmentShader: [
        'varying vec3 vColor; varying float vLife;',
        'void main(){ vec2 d=gl_PointCoord-vec2(0.5); float a=smoothstep(0.5,0.05,length(d))*vLife*0.72;',
        ' if(a<0.01) discard; gl_FragColor=vec4(vColor,a); }'
      ].join('\n'),
      vertexColors: true
    });
    const points = new THREE.Points(geo, material);
    points.frustumCulled = false;
    scene.add(points);
    const scratchColor = new THREE.Color();
    World.particles = {
      points, geo, positions, colors, life, vel, MAX, cursor: 0, alive: 0,
      spawn(x, y, z, count, colorHex, strength, opts) {
        const col = scratchColor.set(colorHex == null ? C.COLORS.sand : colorHex);
        const o = opts || {};
        const spread = o.spread == null ? 0.7 : o.spread;
        const rise = o.rise == null ? 0.8 : o.rise;
        const vy = o.vy == null ? 1.6 : o.vy;
        const vxz = o.vxz == null ? 1.8 : o.vxz;
        const life = o.life == null ? 1.25 : o.life;
        const decay = o.decay == null ? 0.65 : o.decay;
        for (let n = 0; n < count; n++) {
          const i = this.cursor++ % this.MAX;
          if (this.life[i] <= 0) this.alive++;
          this.positions[i * 3] = x + (Math.random() - 0.5) * spread;
          this.positions[i * 3 + 1] = y + Math.random() * spread * 0.35;
          this.positions[i * 3 + 2] = z + (Math.random() - 0.5) * spread;
          const s = strength || 1;
          this.vel[i * 3] = (Math.random() - 0.5) * vxz * s + (o.vx || 0);
          this.vel[i * 3 + 1] = (rise + Math.random() * vy) * s + (o.baseVy || 0);
          this.vel[i * 3 + 2] = (Math.random() - 0.5) * vxz * s + (o.vz || 0);
          const v = 0.82 + Math.random() * 0.18;
          this.colors[i * 3] = col.r * v; this.colors[i * 3 + 1] = col.g * v; this.colors[i * 3 + 2] = col.b * v;
          this.life[i] = life * (0.8 + Math.random() * 0.4);
        }
        this.geo.attributes.position.needsUpdate = true;
        this.geo.attributes.color.needsUpdate = true;
        this.geo.attributes.aLife.needsUpdate = true;
      },
      update(dt) {
        this.points.visible = true;
        let alive = 0;
        for (let i = 0; i < this.MAX; i++) {
          if (this.life[i] <= 0) continue;
          this.life[i] -= dt * 0.65;
          if (this.life[i] <= 0) {
            this.life[i] = 0;
            continue;
          }
          alive++;
          this.positions[i * 3] += this.vel[i * 3] * dt;
          this.positions[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
          this.positions[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
          this.vel[i * 3 + 1] += 0.55 * dt;
          this.vel[i * 3] *= 1 - dt * 0.7;
          this.vel[i * 3 + 2] *= 1 - dt * 0.7;
        }
        this.alive = alive;
        this.geo.attributes.position.needsUpdate = true;
        this.geo.attributes.aLife.needsUpdate = true;
      }
    };
  }

  /* ---------- knock-down helper ---------- */
  World.knockDown = function (prop, dirX, dirZ, force) {
    if (!prop.alive) return false;
    prop.alive = false;
    prop.fallen = true;
    prop.spin = (Math.random() - 0.5) * 7 * force;
    prop.vy = 3.2 * force;
    prop.vx = dirX * 5 * force;
    prop.vz = dirZ * 5 * force;
    World.particles.spawn(prop.x, CC.heightAt(prop.x, prop.z) + 0.6, prop.z, 7, 0xe8d4a2, 0.7);
    return true;
  };

  // Large impact explosion: particle burst, expanding shockwave, a column of
  // flame and smoke, a hot point light, and physics for nearby props.
  World.createExplosion = function (x, z, opts) {
    if (!World.scene) return null;
    const options = opts || {};
    const scale = options.scale || 1;
    const y = options.y == null ? CC.heightAt(x, z) + 1 : options.y;
    if (World.particles) {
      World.particles.spawn(x, y, z, Math.round(48 * scale), 0xff8a24, 2.4 * scale);
      World.particles.spawn(x, y + 2, z, Math.round(28 * scale), 0x3f4140, 1.6 * scale);
      World.particles.spawn(x, y + 1, z, Math.round(18 * scale), 0xffefc2, 1.5 * scale);
    }

    const group = new THREE.Group();
    group.position.set(x, y, z);
    World.scene.add(group);

    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffd28a, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false, fog: false
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(1, 1.18, 40), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.18;
    group.add(ring);

    const fires = [], smokes = [];
    for (let i = 0; i < 10; i++) {
      const h = U.randRange(Math.random, 4, 10) * scale;
      const m = new THREE.Mesh(
        new THREE.ConeGeometry(U.randRange(Math.random, 0.8, 1.8) * scale, h, 6),
        new THREE.MeshBasicMaterial({
          color: i % 3 === 0 ? 0xffe178 : i % 3 === 1 ? 0xff9a2e : 0xff5b20,
          transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending,
          depthWrite: false, fog: false
        })
      );
      const a = Math.random() * Math.PI * 2, r = Math.random() * 3.2 * scale;
      m.position.set(Math.cos(a) * r, h * 0.5, Math.sin(a) * r);
      m.userData = { phase: Math.random() * Math.PI * 2, base: h, x: m.position.x, z: m.position.z };
      group.add(m); fires.push(m);
    }
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(U.randRange(Math.random, 1.3, 3.2) * scale, 7, 6),
        new THREE.MeshBasicMaterial({
          color: i % 3 === 0 ? 0x6b6c68 : 0x34373a,
          transparent: true, opacity: 0.55, depthWrite: false, fog: false
        })
      );
      const a = Math.random() * Math.PI * 2, r = Math.random() * 4.5 * scale;
      m.position.set(Math.cos(a) * r, U.randRange(Math.random, 4, 16) * scale, Math.sin(a) * r);
      m.userData = {
        phase: Math.random() * Math.PI * 2,
        base: m.position.y, x: m.position.x, z: m.position.z, rise: U.randRange(Math.random, 0.6, 1.5)
      };
      group.add(m); smokes.push(m);
    }
    const light = new THREE.PointLight(0xff7a2a, 10 * scale, 95 * scale, 2);
    light.position.y = 4 * scale;
    group.add(light);

    const blastRadius = 16 * scale;
    for (let i = 0; i < World.destructibles.length; i++) {
      const d = World.destructibles[i];
      if (!d.alive) continue;
      const dx = d.x - x, dz = d.z - z;
      const dist = Math.hypot(dx, dz);
      if (dist < blastRadius && dist > 0.01) {
        World.knockDown(d, dx / dist, dz / dist, U.clamp(1.8 - dist / blastRadius, 0.4, 1.8) * scale);
      }
    }
    if (CC.Audio && CC.Audio.explosion) CC.Audio.explosion();

    const explosion = {
      group: group, ring: ring, light: light, fires: fires, smokes: smokes,
      x: x, y: y, z: z, scale: scale, t: 0, duration: options.duration || 22
    };
    World.explosions.push(explosion);
    return explosion;
  };

  // Rails must stop where another street meets a bridge. A continuous rail
  // would fence off every junction on the long middle crossings, so find the
  // closest approach of each other road and leave a gap around it.
  function bridgeRailLayout(span, len) {
    const threshold = span.width * 0.5 + 7;
    const gapRadius = span.width * 0.5 + 6.5;
    // Keep rails continuous on bridges near sensitive areas (water tower /
    // police station) for a clean safety barrier. North Cross is fixed and
    // needs full guard rails.
    const spanRoad = (CC.roadDefs && CC.roadDefs[span.roadIndex]) || {};
    if (spanRoad.name === 'South Cross' || spanRoad.name === 'Main Street' || spanRoad.name === 'North Cross') {
      return { gaps: [], intervals: [[0, len]] };
    }
    const centers = [];
    (CC.roadSegments || []).forEach(function (other) {
      if (other.roadIndex === span.roadIndex) return;
      const otherLen = Math.hypot(other.bx - other.ax, other.bz - other.az) || 1;
      const steps = Math.max(2, Math.ceil(otherLen / 3));
      let best = null;
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        const x = other.ax + (other.bx - other.ax) * t;
        const z = other.az + (other.bz - other.az) * t;
        const r = U.distanceToSegment(x, z, span.ax, span.az, span.bx, span.bz);
        if (!best || r.dist < best.dist) best = { dist: r.dist, at: r.t * len };
      }
      if (best && best.dist <= threshold) centers.push(best.at);
    });
    centers.sort(function (a, b) { return a - b; });
    const gaps = [];
    centers.forEach(function (at) {
      const gap = { lo: Math.max(0, at - gapRadius), hi: Math.min(len, at + gapRadius) };
      const last = gaps[gaps.length - 1];
      if (last && gap.lo <= last.hi) last.hi = Math.max(last.hi, gap.hi);
      else gaps.push(gap);
    });
    let intervals = [[0, len]];
    gaps.forEach(function (gap) {
      const next = [];
      intervals.forEach(function (part) {
        if (gap.hi <= part[0] || gap.lo >= part[1]) { next.push(part); return; }
        if (gap.lo > part[0]) next.push([part[0], gap.lo]);
        if (gap.hi < part[1]) next.push([gap.hi, part[1]]);
      });
      intervals = next;
    });
    return {
      gaps: gaps,
      intervals: intervals.filter(function (part) { return part[1] - part[0] >= 4; })
    };
  }

  // A deck slice follows the analytic bridge profile at both ends, so the
  // roadway is a continuous slope rather than a staircase of flat boxes.
  function bridgeDeckSliceGeometry(s, dx, dz, len, t0, t1, halfWidth) {
    const steps = Math.max(1, Math.ceil((t1 - t0) * len / 2));
    const verts = [], indices = [];
    for (let k = 0; k <= steps; k++) {
      const t = t0 + (t1 - t0) * k / steps;
      const wx = s.ax + dx * t, wz = s.az + dz * t;
      const y = CC.heightAt(wx, wz);
      const z = (t - 0.5) * len;
      verts.push(-halfWidth, y + 0.02, z, halfWidth, y + 0.02, z,
        -halfWidth, y - 0.34, z, halfWidth, y - 0.34, z);
      if (k === 0) continue;
      const a = (k - 1) * 4, b = k * 4;
      indices.push(a, b, b + 1, a, b + 1, a + 1);          // top
      indices.push(a + 2, a + 3, b + 3, a + 2, b + 3, b + 2); // bottom
      indices.push(a + 2, b + 2, b, a + 2, b, a);          // left edge
      indices.push(a + 1, b + 1, b + 3, a + 1, b + 3, a + 3); // right edge
    }
    indices.push(0, 2, 3, 0, 3, 1);
    const last = steps * 4;
    indices.push(last, last + 1, last + 3, last, last + 3, last + 2);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  // Rails and girders are boxes laid along the local +Z axis (the road
  // direction). Tilting each piece by its own elevation change keeps them
  // parallel to the roadway instead of cutting across it.
  function bridgeSlopePiece(s, dx, dz, len, t0, t1, side, offset, yOffset, w, h, mat) {
    const y0 = CC.heightAt(s.ax + dx * t0, s.az + dz * t0) + yOffset;
    const y1 = CC.heightAt(s.ax + dx * t1, s.az + dz * t1) + yOffset;
    const horizontal = (t1 - t0) * len;
    const dy = y1 - y0;
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, Math.hypot(horizontal, dy) + 0.14), mat);
    m.position.set(side * offset, (y0 + y1) * 0.5, ((t0 + t1) * 0.5 - 0.5) * len);
    m.rotation.x = -Math.atan2(dy, horizontal);
    m.castShadow = false; m.receiveShadow = true;
    return m;
  }

  // Road ribbons already cover the drivable deck. These meshes add the
  // girders, rails and abutments. Slicing the deck lets it follow the raised
  // road profile and lets the drawbridge leaves lift with the drivable surface.
  function buildBasculeBridge(scene, s) {
    const dx = (s.bx - s.ax) / (Math.hypot(s.bx - s.ax, s.bz - s.az) || 1);
    const dz = (s.bz - s.az) / (Math.hypot(s.bx - s.ax, s.bz - s.az) || 1);
    const len = Math.hypot(s.bx - s.ax, s.bz - s.az) || 1;
    const g = new THREE.Group();
    g.position.set((s.ax + s.bx) * 0.5, 0, (s.az + s.bz) * 0.5);
    g.rotation.y = Math.atan2(dx, dz);
    const concrete = getMat('bridgeConcrete', 0x8d9290, { map: CC.TextureGenerator ? CC.TextureGenerator.concrete() : null });
    const steel = getMat('bridgeSteel', 0x535b60);
    const rail = getMat('bridgeRail', 0xb9c0bd);
    const asphalt = getMat('roadPaved', 0x252525, { map: CC.TextureGenerator ? CC.TextureGenerator.asphalt ? CC.TextureGenerator.asphalt() : null : null });
    const stripe = getMat('roadStripe', 0xe2d06a);
    const wood = getMat('bridgeWood', 0x6d5135);

    const deckYAt = function (t) { return CC.heightAt(s.ax + dx * len * t, s.az + dz * len * t); };
    const ws = s.waterStart == null ? len * 0.3 : s.waterStart;
    const we = s.waterEnd == null ? len * 0.7 : s.waterEnd;
    const channelMid = (ws + we) * 0.5;
    const leafLen = Math.max(4, (we - ws) * 0.5 - 0.4);
    const leftHinge = channelMid - leafLen;
    const rightHinge = channelMid + leafLen;
    const deckW = s.width * 0.5 + 0.7;

    function addFixedSegment(t0, t1) {
      const z0 = (t0 - 0.5) * len, z1 = (t1 - 0.5) * len;
      const segLen = Math.abs(z1 - z0);
      const y0 = deckYAt(t0), y1 = deckYAt(t1);
      const slab = new THREE.Mesh(new THREE.BoxGeometry(s.width + 1.4, 0.6, segLen + 0.1), concrete);
      slab.position.set(0, (y0 + y1) * 0.5 - 0.35, (z0 + z1) * 0.5);
      slab.rotation.x = -Math.atan2(y1 - y0, segLen);
      slab.receiveShadow = true; g.add(slab);
      const top = new THREE.Mesh(new THREE.BoxGeometry(s.width, 0.14, segLen + 0.1), asphalt);
      top.position.set(0, (y0 + y1) * 0.5 + 0.03, (z0 + z1) * 0.5);
      top.rotation.x = slab.rotation.x; top.receiveShadow = true; g.add(top);
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, segLen * 0.8), stripe);
      line.position.set(0, (y0 + y1) * 0.5 + 0.08, (z0 + z1) * 0.5);
      line.rotation.x = slab.rotation.x; g.add(line);
      [-1,1].forEach(function(side){
        const sw = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.2, segLen + 0.1), concrete);
        sw.position.set(side * (s.width * 0.5 + 0.8), (y0 + y1) * 0.5 + 0.08, (z0 + z1) * 0.5);
        sw.rotation.x = slab.rotation.x; g.add(sw);
      });
      // pylons under fixed approaches
      const n = Math.max(1, Math.floor(segLen / 8));
      for (let i = 0; i <= n; i++) {
        const tt = t0 + (t1 - t0) * i / n;
        const wx = s.ax + dx * tt * len, wz = s.az + dz * tt * len;
        const pyTop = deckYAt(tt) - 0.5;
        const groundY = CC.groundHeightAt(wx, wz);
        const h = Math.max(1.2, pyTop - groundY + 0.2);
        [-1,1].forEach(function(side){
          const p = new THREE.Mesh(new THREE.CylinderGeometry(0.45,0.55,h,8), concrete);
          p.position.set(side * (s.width * 0.5 - 0.2), groundY + h * 0.5 - 0.1, (tt - 0.5) * len);
          g.add(p);
        });
      }
    }

    addFixedSegment(0, leftHinge / len);
    addFixedSegment(rightHinge / len, 1);

    function addLeaf(sideSign) {
      // sideSign -1: left leaf, hinge at leftHinge, extends toward center (+z local)
      // sideSign +1: right leaf, hinge at rightHinge, extends toward center (-z local)
      const hingeT = sideSign < 0 ? leftHinge / len : rightHinge / len;
      const hingeZ = (hingeT - 0.5) * len;
      const hingeY = deckYAt(hingeT);
      const leaf = new THREE.Group();
      leaf.position.set(0, hingeY, hingeZ);
      g.add(leaf);
      const dir = sideSign < 0 ? 1 : -1; // local z direction leaf extends
      const L = leafLen;
      const deck = new THREE.Mesh(new THREE.BoxGeometry(s.width, 0.55, L), concrete);
      deck.position.set(0, -0.28, dir * L * 0.5);
      deck.receiveShadow = true; leaf.add(deck);
      const top = new THREE.Mesh(new THREE.BoxGeometry(s.width - 0.2, 0.14, L - 0.1), asphalt);
      top.position.set(0, 0.04, dir * L * 0.5); top.receiveShadow = true; leaf.add(top);
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, L * 0.7), stripe);
      line.position.set(0, 0.08, dir * L * 0.5); leaf.add(line);
      // truss railings
      [-1,1].forEach(function(side){
        const railTop = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, L), rail);
        railTop.position.set(side * (s.width * 0.5 + 0.45), 1.05, dir * L * 0.5); leaf.add(railTop);
        const railBot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, L), rail);
        railBot.position.set(side * (s.width * 0.5 + 0.45), 0.55, dir * L * 0.5); leaf.add(railBot);
        for (let i=0;i<=4;i++){
          const pz = dir * L * i / 4;
          leaf.add(box(0.12,1.2,0.12, steel, side*(s.width*0.5+0.45), 0.45, pz));
        }
      });
      // counterweight / pivot housing - keep clear of roadway
      const cw = new THREE.Mesh(new THREE.BoxGeometry(s.width + 1.8, 2.0, 2.2), concrete);
      cw.position.set(0, -1.25, -dir * 1.6); leaf.add(cw);
      const pivot = new THREE.Mesh(new THREE.CylinderGeometry(0.5,0.5,s.width+2.0,10), steel);
      pivot.rotation.z = Math.PI/2; pivot.position.set(0,-0.05,0); leaf.add(pivot);

      if (CC.Drawbridges) CC.Drawbridges.registerBasculeLeaf(leaf, s, sideSign);
    }
    addLeaf(-1);
    addLeaf(1);

    // fenders and marine signals - keep to water channel only, avoid roadway/debris
    const fz0 = (ws/len - 0.5) * len + 1.2;
    const fz1 = (we/len - 0.5) * len - 1.2;
    const roadName = (CC.roadDefs && CC.roadDefs[s.roadIndex] && CC.roadDefs[s.roadIndex].name) || '';
    // Fenders on these spans created long rectangular artifacts across the river.
    const allowFenders = roadName !== 'Cul-de-sac South' && !s.bascule;
    if (allowFenders && fz1 > fz0 + 1) {
      [-1,1].forEach(function(side){
        const f = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.4, (fz1-fz0)), wood);
        f.position.set(side * (s.width * 0.5 + 2.6), 0.8, (fz0+fz1)*0.5);
        f.receiveShadow = true; g.add(f);
      });
    }
    const redMat = new THREE.MeshBasicMaterial({ color: 0xff3333 });
    const greenMat = new THREE.MeshBasicMaterial({ color: 0x44ff66 });
    s._marineLights = [];
    [-1,1].forEach(function(side){
      [fz0 + 0.7, fz1 - 0.7].forEach(function(zz, idx){
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.08,2.2,6), steel);
        pole.position.set(side * (s.width * 0.5 + 2.6), 2.9, zz); g.add(pole);
        const red = new THREE.Mesh(new THREE.SphereGeometry(0.22,8,6), redMat.clone());
        red.position.set(side * (s.width * 0.5 + 2.6), 4.0, zz); g.add(red);
        const green = new THREE.Mesh(new THREE.SphereGeometry(0.22,8,6), greenMat.clone());
        green.position.set(side * (s.width * 0.5 + 2.6), 4.0, zz); green.visible = false; g.add(green);
        s._marineLights.push({ red:red, green:green });
      });
    });

    scene.add(g);
  }

  function buildBridges(scene) {
    const spans = CC.bridgeSegments || [];
    World.bridgeRailGaps = 0;
    if (!spans.length) return;
    const concrete = getMat('bridgeConcrete', 0x8d9290, { map: CC.TextureGenerator ? CC.TextureGenerator.concrete() : null });
    const steel = getMat('bridgeSteel', 0x535b60);
    const rail = getMat('bridgeRail', 0xb9c0bd);
    spans.forEach(function (s) {
      if (s.bascule) { buildBasculeBridge(scene, s); return; }
      const dx = (s.bx - s.ax) / (Math.hypot(s.bx - s.ax, s.bz - s.az) || 1);
      const dz = (s.bz - s.az) / (Math.hypot(s.bx - s.ax, s.bz - s.az) || 1);
      const len = Math.hypot(s.bx - s.ax, s.bz - s.az) || 1;
      const layout = bridgeRailLayout(s, len);
      World.bridgeRailGaps += layout.gaps.length;
      const g = new THREE.Group();
      g.position.set((s.ax + s.bx) * 0.5, 0, (s.az + s.bz) * 0.5);
      g.rotation.y = Math.atan2(dx, dz);
      // 4.5 m slices keep the analytic slope smooth while cutting moving
      // drawbridge pieces (and their post/rail children) by almost half.
      const slices = Math.max(2, Math.ceil(len / 4.5));
      for (let i = 0; i < slices; i++) {
        const t0 = i / slices, t1 = (i + 1) / slices, tm = (t0 + t1) * 0.5;
        const piece = new THREE.Group();
        const deck = new THREE.Mesh(
          bridgeDeckSliceGeometry(s, dx, dz, len, t0, t1, s.width * 0.5 + 0.6), concrete);
        deck.receiveShadow = true;
        piece.add(deck);
        const railHere = layout.intervals.some(function (part) {
          return tm * len >= part[0] && tm * len <= part[1];
        });
        [-1, 1].forEach(function (side) {
          piece.add(bridgeSlopePiece(s, dx, dz, len, t0, t1, side,
            s.width * 0.5 + 0.35, -0.42, 0.32, 0.65, steel));
          if (!railHere) return;
          const upperRail = bridgeSlopePiece(s, dx, dz, len, t0, t1, side,
            s.width * 0.5 + 0.7, 1.08, 0.18, 0.18, rail);
          upperRail.name = 'bridgeRail';
          upperRail.userData.bridgeSpan = s;
          piece.add(upperRail);
          const lowerRail = bridgeSlopePiece(s, dx, dz, len, t0, t1, side,
            s.width * 0.5 + 0.7, 0.62, 0.18, 0.18, rail);
          lowerRail.name = 'bridgeRail';
          lowerRail.userData.bridgeSpan = s;
          piece.add(lowerRail);
          const posts = Math.max(1, Math.round((t1 - t0) * len / 4));
          for (let j = 0; j <= posts; j++) {
            const tt = t0 + (t1 - t0) * j / posts;
            const wx = s.ax + dx * tt, wz = s.az + dz * tt;
            piece.add(box(0.14, 1.2, 0.14, steel,
              side * (s.width * 0.5 + 0.7), CC.heightAt(wx, wz) + 0.5,
              (tt - 0.5) * len));
          }
        });
        g.add(piece);
        if (s.drawbridge && CC.Drawbridges) {
          const weight = CC.Drawbridges.weightAt(tm, s);
          if (weight > 0.01) CC.Drawbridges.registerVisual(piece, 0, weight, s);
        }
      }
      // Bank abutments reach from the approach deck down to dry land, but stay
      // outside the navigable channel so boats pass beneath the high span.
      [-1, 1].forEach(function (end) {
        if (layout.gaps.some(function (gap) {
          return end < 0 ? gap.lo <= 1 : gap.hi >= len - 1;
        })) return;
        const ex = end < 0 ? s.ax : s.bx;
        const ez = end < 0 ? s.az : s.bz;
        const bankY = CC.heightAt(ex, ez);
        const height = bankY + 2.2;
        const z = end * (len * 0.5 + 0.7);
        g.add(box(s.width + 2.2, height, 1.4, concrete, 0, (bankY - 0.8) * 0.5, z));
      });
      // Fixed North Cross gets visible pylons supporting the level deck.
      const spanRoad = (CC.roadDefs && CC.roadDefs[s.roadIndex]) || {};
      if (spanRoad.name === 'North Cross') {
        const ws = s.waterStart == null ? 0 : s.waterStart;
        const we = s.waterEnd == null ? len : s.waterEnd;
        const mid = (ws + we) * 0.5;
        const gapHalf = s.lowWaterCrossing ? 8 : 0;
        for (let t = 0.12; t <= 0.88; t += 0.19) {
          const along = t * len;
          if (gapHalf > 0 && Math.abs(along - mid) < gapHalf) continue; // boat gap
          const wx = s.ax + dx * t, wz = s.az + dz * t;
          const deckY = CC.heightAt(wx, wz);
          const groundY = CC.groundHeightAt(wx, wz);
          const h = Math.max(1.4, deckY - groundY + 0.4);
          const py = groundY + h * 0.5 - 0.2;
          const pz = (t - 0.5) * len;
          [-1, 1].forEach(function (side) {
            const p = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.52, h, 8), concrete);
            p.position.set(side * (s.width * 0.5 - 0.4), py, pz);
            p.castShadow = false; p.receiveShadow = true;
            g.add(p);
            g.add(box(0.9, 0.32, 0.9, steel, side * (s.width * 0.5 - 0.4), deckY - 0.35, pz));
          });
          g.add(box(s.width * 0.9, 0.35, 0.8, steel, 0, deckY - 0.45, pz));
        }
        // Optional timber fenders at boat gap
        if (s.lowWaterCrossing) {
          const fMat = getMat('bridgeWood', 0x6d5135);
          [-1, 1].forEach(function (side) {
            const fz = (mid - 0.5 * len);
            g.add(box(0.6, 2.2, 2.0, fMat, side * (s.width * 0.5 + 1.6), 0.7, fz - gapHalf - 1.2));
            g.add(box(0.6, 2.2, 2.0, fMat, side * (s.width * 0.5 + 1.6), 0.7, fz + gapHalf + 1.2));
          });
        }
      }
      // Floating channel marker buoys for low water crossing
      if (s.lowWaterCrossing) {
        const ws = s.waterStart == null ? 0 : s.waterStart;
        const we = s.waterEnd == null ? len : s.waterEnd;
        const mid = (ws + we) * 0.5;
        const buoyDefs = [
          { z: (mid - 14 - 0.5 * len), side: -1, color: 0xe24a3b },
          { z: (mid - 14 - 0.5 * len), side: 1, color: 0x49c45d },
          { z: (mid + 14 - 0.5 * len), side: -1, color: 0xe24a3b },
          { z: (mid + 14 - 0.5 * len), side: 1, color: 0x49c45d }
        ];
        buoyDefs.forEach(function (bd) {
          const bg = new THREE.Group();
          bg.position.set(bd.side * 4.2, 0, bd.z);
          const body = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.7, 1.2, 8), getMat('buoyBody'+bd.color, bd.color));
          body.position.y = 0.35; bg.add(body);
          const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,1.3,6), getMat('buoyMast',0x8a9398));
          mast.position.y = 1.25; bg.add(mast);
          const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.16,8,6), new THREE.MeshBasicMaterial({ color: bd.color }));
          beacon.position.y = 1.95; bg.add(beacon);
          bg.userData.buoy = true; bg.userData.phase = Math.random() * Math.PI * 2;
          bg.userData.baseY = CC.SEA_LEVEL || 0;
          g.add(bg);
          if (!World.channelBuoysAnim) World.channelBuoysAnim = [];
          World.channelBuoysAnim.push(bg);
        });
      }
      scene.add(g);
    });
  }

  World.init = function (scene) {
    World.scene = scene;
    if (!World.imageMode) buildOcean(scene);
    buildTerrain(scene);
    buildRoads(scene);
    buildBridges(scene);
    if (World.imageMode) {
      buildLandmarks(scene);
      buildImageBuildings(scene);
      buildImageProps(scene);
    } else {
      buildProps(scene);
    }
    buildGates(scene);
    buildParticles(scene);
    if (CC.Details) CC.Details.init(scene);
    if (CC.AssetBuildings) CC.AssetBuildings.flush(scene);
    if (CC.AssetVegetation) CC.AssetVegetation.flush(scene);
    if (CC.AssetRocks) CC.AssetRocks.flush(scene);
    // Static props exported from the offline map editor.
    if (CC.buildMapEdits) CC.buildMapEdits(scene);
  };

  World._detailsTimer = 0;
  World.update = function (dt, time) {
    World.time = time;
    World._detailsTimer -= dt;
    if (CC.Details && World._detailsTimer <= 0) {
      CC.Details.update(Math.min(0.1, 0.05 - World._detailsTimer), time);
      World._detailsTimer = 0.05;
    }
    if (CC.RetroWater) CC.RetroWater.updateRetroWater(dt, time);
    if (World.channelBuoysAnim) {
      const v = CC.Game && CC.Game.vehicles ? CC.Game.vehicles[CC.Game.activeKey] : null;
      const px = v && v.pos ? v.pos.x : 0, pz = v && v.pos ? v.pos.z : 0;
      for (let i = 0; i < World.channelBuoysAnim.length; i++) {
        const b = World.channelBuoysAnim[i];
        const dx = b.position.x - px, dz = b.position.z - pz;
        if (dx*dx + dz*dz > 260*260) { b.visible = false; continue; }
        b.visible = true;
        const ph = b.userData.phase || 0;
        b.position.y = CC.RetroWater
          ? CC.RetroWater.waterYFor(b.position.x, b.position.z, time, 0.15)
          : (b.userData.baseY || 0) + Math.sin(time * 1.8 + ph) * 0.12;
        b.rotation.z = CC.RetroWater
          ? Math.sin(time * 1.3 + ph) * 0.05 +
            (CC.RetroWater.getWaterHeight(b.position.x + 1, b.position.z, time) -
             CC.RetroWater.getWaterHeight(b.position.x - 1, b.position.z, time)) * 0.08
          : Math.sin(time * 1.3 + ph) * 0.08;
        b.rotation.x = Math.cos(time * 1.1 + ph) * 0.06;
      }
    }
    for (let i = 0; i < World.challengeGates.length; i++) {
      const g = World.challengeGates[i];
      const pulse = 0.5 + 0.5 * Math.sin(time * 3 + i * 0.8);
      g.ring.material.emissiveIntensity = 0.9 + pulse * 1.1;
      g.inner.material.emissiveIntensity = 0.6 + pulse * 0.8;
      g.beam.material.opacity = 0.08 + pulse * 0.10;
      g.group.rotation.z = Math.sin(time * 0.8 + i) * 0.05;
    }
    for (let ei = World.explosions.length - 1; ei >= 0; ei--) {
      const e = World.explosions[ei];
      e.t += dt;
      const flash = U.clamp(e.t / 0.7, 0, 1);
      const fade = U.clamp((e.duration - e.t) / 4, 0, 1);
      e.ring.scale.setScalar(1 + flash * 15 * e.scale);
      e.ring.material.opacity = Math.max(0, (1 - flash) * 0.85);
      e.light.intensity = (flash < 1 ? 14 * (1 - flash) : 0) * e.scale +
        (2.2 + Math.sin(time * 17 + ei) * 0.8) * fade * e.scale;
      for (let i = 0; i < e.fires.length; i++) {
        const m = e.fires[i], d = m.userData;
        const flick = 0.7 + 0.3 * Math.sin(time * 12 + d.phase);
        m.scale.set(flick, 0.7 + flick * 0.6, flick);
        m.position.y = d.base * 0.5 + Math.sin(time * 8 + d.phase) * 0.4;
        m.rotation.z = Math.sin(time * 3 + d.phase) * 0.2;
        m.material.opacity = 0.9 * fade * flick;
      }
      for (let i = 0; i < e.smokes.length; i++) {
        const m = e.smokes[i], d = m.userData;
        m.position.y = d.base + e.t * d.rise * 0.8;
        m.position.x = d.x + Math.sin(time * 0.6 + d.phase) * e.t * 0.25;
        m.position.z = d.z + Math.cos(time * 0.5 + d.phase) * e.t * 0.25;
        m.scale.setScalar(1 + e.t * 0.035);
        m.material.opacity = 0.5 * fade;
      }
      if (World.particles && Math.random() < dt * 12) {
        World.particles.spawn(e.x, e.y + 3 * e.scale, e.z, 3,
          Math.random() < 0.5 ? 0xff8a24 : 0x4a4c4a, 0.9 * e.scale);
      }
      if (e.t >= e.duration) {
        World.scene.remove(e.group);
        e.group.traverse(function (o) {
          if (o.geometry) o.geometry.dispose();
          if (o.material) {
            if (Array.isArray(o.material)) o.material.forEach(function (m) { m.dispose(); });
            else o.material.dispose();
          }
        });
        World.explosions.splice(ei, 1);
      }
    }
    for (let i = 0; i < World.destructibles.length; i++) {
      const d = World.destructibles[i];
      if (!d.fallen) continue;
      d.vy -= C.GRAVITY * dt;
      d.mesh.position.y += d.vy * dt;
      d.mesh.position.x += (d.vx || 0) * dt;
      d.mesh.position.z += (d.vz || 0) * dt;
      d.mesh.rotation.z += d.spin * dt;
      d.mesh.rotation.x += d.spin * 0.4 * dt;
      const ground = CC.heightAt(d.mesh.position.x, d.mesh.position.z);
      if (d.mesh.position.y < ground + 0.1) {
        d.mesh.position.y = ground + 0.1;
        if (Math.abs(d.vy) < 0.6) { d.fallen = false; d.vy = 0; d.spin = 0; }
        else d.vy *= -0.28;
      }
    }
    if (World.particles) World.particles.update(dt);
  };
})();
