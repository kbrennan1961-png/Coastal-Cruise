/* Coastal Cruise - world generation: terrain, ocean, roads, props, gates, particles. */
(function () {
  'use strict';

  const CC = window.CC;
  const C = CC.C, U = CC.util;
  const World = (CC.World = {
    obstacles: [],
    destructibles: [],
    challengeGates: [],
    particles: null,
    scene: null,
    time: 0
  });

  const rng = CC.rng(20261119);
  const tmpMat = {};

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
  function chainTexture() {
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
  function buildOcean(scene) {
    const geo = new THREE.PlaneGeometry(1500, 1300, 80, 70);
    geo.rotateX(-Math.PI / 2);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uShallow: { value: new THREE.Color(C.COLORS.water) },
        uDeep: { value: new THREE.Color(C.COLORS.waterDeep) },
        uFoam: { value: new THREE.Color(C.COLORS.foam) }
      },
      vertexShader: [
        'varying vec2 vUv; varying float vWave;',
        'uniform float uTime;',
        'void main(){',
        '  vUv = uv;',
        '  vec3 p = position;',
        '  float w = sin(p.x*0.075 + uTime*1.15)*0.42 + sin(p.z*0.095 - uTime*0.85)*0.34 + sin((p.x+p.z)*0.045 + uTime*0.6)*0.25;',
        '  p.y += w;',
        '  vWave = w;',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0);',
        '}'
      ].join('\n'),
      fragmentShader: [
        'varying vec2 vUv; varying float vWave;',
        'uniform vec3 uShallow; uniform vec3 uDeep; uniform vec3 uFoam;',
        'void main(){',
        '  float t = clamp(vWave*0.55 + 0.5, 0.0, 1.0);',
        '  vec3 col = mix(uDeep, uShallow, t);',
        '  float crest = smoothstep(0.52, 0.78, t);',
        '  col = mix(col, uFoam, crest*0.45);',
        '  float glint = pow(max(0.0, sin(vUv.x*180.0 + vWave*6.0)), 24.0)*0.09;',
        '  gl_FragColor = vec4(col + glint, 1.0);',
        '}'
      ].join('\n')
    });
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(0, -0.15, 10);
    mesh.receiveShadow = false;
    scene.add(mesh);
    World.ocean = mesh;
  }

  /* ---------- terrain ---------- */
  function buildTerrain(scene) {
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
      const y = CC.heightAt(x, z);
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
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: false }));
    mesh.position.z = 10;
    mesh.receiveShadow = true;
    scene.add(mesh);
    World.terrain = mesh;
  }

  /* ---------- roads ---------- */
  function ribbonGeometry(road, halfWidth, lift) {
    const pts = road.points;
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
      const y = CC.heightAt(p[0], p[1]) + lift;
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
    const roadMat = getMat('road', C.COLORS.road);
    const gravelMat = getMat('gravel', C.COLORS.gravel);
    const boardMat = getMat('board', C.COLORS.boardwalk);
    const shoulderMat = getMat('shoulder', 0xa99a78);

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
      const shoulder = new THREE.Mesh(ribbonGeometry(road, road.width * 0.5 + 1.8, 0.05), shoulderMat);
      shoulder.receiveShadow = true;
      scene.add(shoulder);
      const surface = new THREE.Mesh(
        ribbonGeometry(road, road.width * 0.5, 0.11),
        isGravel ? gravelMat : roadMat
      );
      surface.receiveShadow = true;
      scene.add(surface);
    });

    // Dashed center lines for paved roads, batched into one InstancedMesh.
    const dashGeo = new THREE.BoxGeometry(0.22, 0.03, 3.6);
    const dashMat = getMat('dash', C.COLORS.roadEdge);
    const transforms = [];
    CC.roadDefs.forEach(function (road) {
      if (road.type !== 'paved') return;
      for (let s = 6; s < road._length - 4; s += 9) {
        const p = CC.sampleRoad(road, s);
        transforms.push({ x: p.x, z: p.z, r: Math.atan2(p.dx, p.dz) });
      }
    });
    const inst = new THREE.InstancedMesh(dashGeo, dashMat, transforms.length);
    const d = new THREE.Object3D();
    transforms.forEach(function (t, i) {
      d.position.set(t.x, CC.heightAt(t.x, t.z) + 0.14, t.z);
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
  function placeTree(scene, type, x, z) {
    const t = type === 'palm' ? makePalm() : makePine();
    t.position.set(x, CC.heightAt(x, z), z);
    t.rotation.y = rng() * Math.PI * 2;
    const s = U.randRange(rng, 0.8, 1.25);
    t.scale.setScalar(s);
    scene.add(t);
    World.obstacles.push({ x, z, r: type === 'palm' ? 0.7 * s : 1.0 * s, type: 'tree' });
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
    const wireMat = new THREE.MeshLambertMaterial({
      color: 0xc3cbcc, map: chainTexture(), transparent: true, alphaTest: 0.28, side: THREE.DoubleSide
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
    const MAX = 700;
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
        ' gl_PointSize = (36.0 + aLife*26.0) / max(1.0, -mv.z) * 10.0;',
        ' gl_Position = projectionMatrix * mv; }'
      ].join('\n'),
      fragmentShader: [
        'varying vec3 vColor; varying float vLife;',
        'void main(){ vec2 d=gl_PointCoord-vec2(0.5); float a=smoothstep(0.5,0.08,length(d))*vLife*0.55;',
        ' if(a<0.01) discard; gl_FragColor=vec4(vColor,a); }'
      ].join('\n'),
      vertexColors: true
    });
    const points = new THREE.Points(geo, material);
    points.frustumCulled = false;
    scene.add(points);
    World.particles = {
      points, geo, positions, colors, life, vel, MAX, cursor: 0,
      spawn(x, y, z, count, colorHex, strength) {
        const col = new THREE.Color(colorHex == null ? C.COLORS.sand : colorHex);
        for (let n = 0; n < count; n++) {
          const i = this.cursor++ % this.MAX;
          this.positions[i * 3] = x + (Math.random() - 0.5) * 1.2;
          this.positions[i * 3 + 1] = y + Math.random() * 0.3;
          this.positions[i * 3 + 2] = z + (Math.random() - 0.5) * 1.2;
          const s = strength || 1;
          this.vel[i * 3] = (Math.random() - 0.5) * 3.2 * s;
          this.vel[i * 3 + 1] = (0.5 + Math.random() * 1.8) * s;
          this.vel[i * 3 + 2] = (Math.random() - 0.5) * 3.2 * s;
          const v = 0.82 + Math.random() * 0.18;
          this.colors[i * 3] = col.r * v; this.colors[i * 3 + 1] = col.g * v; this.colors[i * 3 + 2] = col.b * v;
          this.life[i] = 1;
        }
        this.geo.attributes.position.needsUpdate = true;
        this.geo.attributes.color.needsUpdate = true;
        this.geo.attributes.aLife.needsUpdate = true;
      },
      update(dt) {
        for (let i = 0; i < this.MAX; i++) {
          if (this.life[i] <= 0) continue;
          this.life[i] -= dt * 0.85;
          if (this.life[i] < 0) this.life[i] = 0;
          this.positions[i * 3] += this.vel[i * 3] * dt;
          this.positions[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
          this.positions[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
          this.vel[i * 3 + 1] -= 2.4 * dt;
          this.vel[i * 3] *= 1 - dt * 1.2;
          this.vel[i * 3 + 2] *= 1 - dt * 1.2;
        }
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

  World.init = function (scene) {
    World.scene = scene;
    buildOcean(scene);
    buildTerrain(scene);
    buildRoads(scene);
    buildProps(scene);
    buildGates(scene);
    buildParticles(scene);
  };

  World.update = function (dt, time) {
    World.time = time;
    if (World.ocean) World.ocean.material.uniforms.uTime.value = time;
    for (let i = 0; i < World.challengeGates.length; i++) {
      const g = World.challengeGates[i];
      const pulse = 0.5 + 0.5 * Math.sin(time * 3 + i * 0.8);
      g.ring.material.emissiveIntensity = 0.9 + pulse * 1.1;
      g.inner.material.emissiveIntensity = 0.6 + pulse * 0.8;
      g.beam.material.opacity = 0.08 + pulse * 0.10;
      g.group.rotation.z = Math.sin(time * 0.8 + i) * 0.05;
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
