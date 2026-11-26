/* Coastal Cruise - road markings, traffic furniture, signage, marina and scenery.
   Everything is generated at startup from the same baked road/coast data the
   rest of the game uses, so it works offline from file:// as well as http://. */
(function () {
  'use strict';

  const CC = window.CC;
  const C = CC.C, U = CC.util;
  const Details = (CC.Details = {
    trafficSignals: 0,
    stopSigns: 0,
    speedSigns: 0,
    streetSigns: 0,
    directionSigns: 0,
    billboards: 0,
    businesses: 0,
    businessFences: 0,
    businessFrontFencesSkipped: 0,
    businessSites: [],
    communitySites: 0,
    communitySiteNames: [],
    airport: false,
    airportHelis: 0,
    militaryOutpost: false,
    outpostPos: null,
    controlTower: false,
    radarDishes: 0,
    runwayLights: [],
    runwayLightStations: 0,
    waterTower: false,
    cemetery: false,
    church: false,
    churchGraves: 0,
    spiritualSign: null,
    spiritualSigns: 0,
    spiritualSignDay: -1,
    hospital: false,
    boatyard: false,
    boatyardLift: false,
    boatyardBoats: 0,
    dogPark: false,
    dogParkDogs: [],
    powerStation: false,
    powerTowers: 0,
    powerTransformers: 0,
    cellTowers: 0,
    satelliteSite: false,
    satelliteDishes: 0,
    airDefense: false,
    aaLaunchers: 0,
    aaVisuals: null,
    walmart: false,
    walmartStalls: 0,
    walmartPoles: 0,
    walmartLights: [],
    nuclearPlant: false,
    riverPylons: 0,
    walkingStream: false,
    walkingStreamHomes: 0,
    beaconSeafood: false,
    realty: false,
    realtyName: '',
    realtyPhone: '',
    realtySign: null,
    realtyVehicles: 0,
    forSaleSigns: 0,
    motel: false,
    motelSigns: 0,
    motelSpots: [],
    busStops: [],
    busStopSigns: 0,
    busStopShelters: 0,
    riverDocks: 0,
    fishingBoats: 0,
    marshReeds: 0,
    ponds: [],
    pondWater: 0,
    pondGrass: 0,
    mailboxes: 0,
    mailboxLabels: 0,
    deliveryAddresses: [],
    foodPickupSites: [],
    nightlifeSpots: [],
    businessCrowdSpots: [],
    beaconDockSpots: [],
    beaconCustomerSpot: null,
    beaconLotParkSpots: [],
    clubParkingSpots: [],
    clubEntranceSpots: [],
    streetLamps: 0,
    telephonePoles: 0,
    telephonePolesSkipped: 0,
    telephonePolesCrossingRoads: 0,
    polesRemoved: 0,
    crosswalks: 0,
    guardRails: 0,
    extraTrees: 0,
    bushes: 0,
    shrubs: 0,
    grassTufts: 0,
    flowers: 0,
    parkedVehicles: 0,
    driveways: 0,
    homeWindows: 0,
    homeLitHomes: 0,
    homeLitWindows: 0,
    homePorchLights: 0,
    homeFences: 0,
    fencesRemoved: 0,
    homeFlowers: 0,
    homePools: 0,
    homeGazebos: 0,
    homeGardens: 0,
    homeBoatTrailers: 0,
    homeCampers: 0,
    safeHouses: [],
    dunes: 0,
    seaGrass: 0,
    weeds: 0,
    denseTrees: 0,
    forestTrails: 0,
    trailhead: false,
    fastFood: false,
    beachGoers: 0,
    beachWavePeople: [],
    beachBalls: [],
    seaLife: [],
    waterWaves: false,
    park: false,
    parkFields: 0,
    parkSkatePark: false,
    parkSkateboardPark: false,
    parkJungleGym: false,
    farm: false,
    cropRows: 0,
    farmAnimals: [],
    windmillBlades: null,
    boardwalk: false,
    boardwalkShops: 0,
    boardwalkWorkers: 0,
    boardwalkWorkerAnchors: [],
    boardwalkDeckOffset: 1.07,
    boardwalkPath: null,
    surfShackRailing: 0,
    arcadeMachines: 0,
    foodVendors: 0,
    pier: false,
    pierRect: null,
    pierLength: 0,
    pierDeckY: 0,
    jetties: 0,
    fishermen: 0,
    fishingBobbers: [],
    dolphins: [],
    amusementRides: 0,
    amusementSignText: '',
    amusementVendorNames: [],
    rideStations: [],
    rideSeats: { ferris: [], coaster: [], carousel: [] },
    rideBulbMats: [],
    carouselHorses: [],
    ferrisRiders: [],
    coasterRiders: [],
    coasterPhase: 0,
    ferrisWheel: null,
    carousel: null,
    coasterCurve: null,
    coasterCars: [],
    clubNeon: [],
    gasStation: false,
    luckyStopSign: null,
    marina: null,
    junctions: [],
    signals: [],
    signalStates: ['green', 'red']
  });
  const rng = CC.rng(20261120);
  const tmpMat = {};

  /* Shared pixel textures for the approved Beacon harbor look. They are drawn
     once from the same recipes as intro-cutscene.html, so the fish house, every
     pier/jetty and the tin roofs use the exact chunky wood/tin/window palette
     from the video. Nearest filtering keeps the PSX look at file:// too. */
  const pixelTexCache = {};
  function pixelTexture(key, w, h, paint) {
    if (pixelTexCache[key]) return pixelTexCache[key];
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    paint(c.getContext('2d'), w, h);
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    pixelTexCache[key] = tex;
    return tex;
  }
  function pixelRand(seed) {
    let s = seed >>> 0;
    return function () {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }
  function harborWoodTexture() {
    return pixelTexture('harborWood', 64, 64, function (g, w, h) {
      g.fillStyle = '#6d5138'; g.fillRect(0, 0, w, h);
      const r = pixelRand(23);
      for (let y = 0; y < h; y += 8) {
        g.fillStyle = y % 16 === 0 ? '#5a402c' : '#7a5a3d';
        g.fillRect(0, y, w, 7);
        for (let i = 0; i < 8; i++) {
          g.fillStyle = 'rgba(30,20,12,0.35)';
          g.fillRect((r() * w) | 0, y + 1 + ((r() * 5) | 0), 1 + ((r() * 6) | 0), 1);
        }
      }
    });
  }
  function harborTinTexture() {
    return pixelTexture('harborTin', 64, 64, function (g, w, h) {
      for (let x = 0; x < w; x += 4) {
        g.fillStyle = x % 8 === 0 ? '#8e9294' : '#666c70';
        g.fillRect(x, 0, 4, h);
      }
      const r = pixelRand(11);
      for (let i = 0; i < 30; i++) {
        g.fillStyle = 'rgba(120,70,40,0.25)';
        g.fillRect((r() * w) | 0, (r() * h) | 0, 2 + ((r() * 4) | 0), 2);
      }
    });
  }
  function harborWindowTexture() {
    return pixelTexture('harborWindow', 32, 32, function (g, w, h) {
      g.fillStyle = '#3a2410'; g.fillRect(0, 0, w, h);
      for (let y = 2; y < h; y += 8) for (let x = 2; x < w; x += 8) {
        g.fillStyle = (x + y) % 16 === 4 ? '#ffcf72' : '#f39c3c';
        g.fillRect(x, y, 6, 6);
      }
    });
  }

  const CLS = { WATER: 1, GRASS: 2, ROAD: 3, BUILDING: 4, SAND: 5, FOREST: 6, MARSH: 7 };

  function mat(color, opts) {
    return new THREE.MeshLambertMaterial(Object.assign({ color, flatShading: true }, opts || {}));
  }
  function getMat(key, color, opts) {
    if (!tmpMat[key]) {
      tmpMat[key] = mat(color, opts);
      tmpMat[key].name = key;
    }
    return tmpMat[key];
  }
  // Gritty facade with baked lower-wall AO and emissive window grid.
  // World-wide InstancedMeshes are never frustum-culled because their bounds
  // cover the whole map. Bake them into 160 m tiles so the renderer only
  // submits the tiles actually in view.
  const SCATTER_TILE = 160;
  function tiledInstances(scene, geo, material, spots, place, colors, shadows) {
    if (!spots.length) return null;
    const scratch = new THREE.Object3D();
    const tint = new THREE.Color();
    const buckets = new Map();
    const pickColor = typeof colors === 'function' ? colors :
      colors ? function (s) { return colors[Math.floor(rng() * colors.length)]; } : null;
    for (let i = 0; i < spots.length; i++) {
      place(scratch, spots[i]);
      scratch.updateMatrix();
      const m = scratch.matrix.elements;
      const key = Math.floor(m[12] / SCATTER_TILE) + '|' + Math.floor(m[14] / SCATTER_TILE);
      let bucket = buckets.get(key);
      if (!bucket) { bucket = []; buckets.set(key, bucket); }
      bucket.push({
        matrix: scratch.matrix.clone(),
        color: pickColor ? pickColor(spots[i]) : null
      });
    }
    const first = [];
    buckets.forEach(function (bucket) {
      const mesh = new THREE.InstancedMesh(geo, material, bucket.length);
      for (let i = 0; i < bucket.length; i++) {
        mesh.setMatrixAt(i, bucket[i].matrix);
        if (colors && bucket[i].color != null) mesh.setColorAt(i, tint.setHex(bucket[i].color));
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = !!shadows;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      scene.add(mesh);
      if (!first.length) first.push(mesh);
    });
    return first[0] || null;
  }
  function facadeMat(color, style) {
    return CC.TextureGenerator
      ? CC.TextureGenerator.facadeMaterial(color, style)
      : getMat('facade' + (style || '') + color, color);
  }
  // Shared immutable primitives. StaticBatcher reads geometry but never
  // mutates a source, so repeated props can reuse one buffer per size.
  const boxGeoCache = Object.create(null);
  const cylGeoCache = Object.create(null);

  function box(w, h, d, material, x, y, z) {
    const key = w + '|' + h + '|' + d;
    const geo = boxGeoCache[key] || (boxGeoCache[key] = new THREE.BoxGeometry(w, h, d));
    const m = new THREE.Mesh(geo, material);
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }
  function cylinder(rt, rb, h, segs, material, x, y, z) {
    const key = rt + '|' + rb + '|' + h + '|' + segs;
    const geo = cylGeoCache[key] || (cylGeoCache[key] = new THREE.CylinderGeometry(rt, rb, h, segs));
    const m = new THREE.Mesh(geo, material);
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }
  function isGreen(x, z) {
    if (CC.World.imageMode && CC.ImageMap && CC.ImageMap.classify) {
      const c = CC.ImageMap.classify(x, z);
      return c === CLS.GRASS || c === CLS.FOREST;
    }
    return CC.surfaceAt(x, z) === 'grass';
  }
  function isRoad(x, z) {
    if (CC.World.imageMode && CC.ImageMap && CC.ImageMap.classify) {
      if (CC.ImageMap.classify(x, z) === CLS.ROAD) return true;
    }
    // Include the rendered shoulder plus a small safety margin.
    return CC.roadClearance ? CC.roadClearance(x, z, 0) < 0.8 : false;
  }
  function dry(x, z) {
    if (CC.coast.onBridge && CC.coast.onBridge(x, z, 0)) return false;
    if (CC.coast.inMarsh && CC.coast.inMarsh(x, z)) return false;
    return !CC.coast.isWater(x, z) && CC.coast.distanceToWater(x, z) > 1.5;
  }
  // A prop sampled beside one road can still land on a crossing street. Nudge
  // it outward to the first dry spot that clears every road surface, so poles
  // never stick up through the asphalt at intersections.
  function clearRoadside(x, z, minClear) {
    minClear = minClear == null ? 1.2 : minClear;
    if (!CC.roadClearance) return { x: x, z: z };
    if (CC.roadClearance(x, z, 0.3) >= minClear) return { x: x, z: z };
    for (let ring = 1; ring <= 14; ring++) {
      const radius = ring * 0.8;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const nx = x + Math.cos(a) * radius, nz = z + Math.sin(a) * radius;
        if (!dry(nx, nz)) continue;
        if (CC.roadClearance(nx, nz, 0.3) >= minClear) return { x: nx, z: nz };
      }
    }
    return null;
  }
  // Tag vertical roadside props so the final audit can remove the whole prop
  // (post, arm, sign head and glow together) instead of leaving floating bits.
  function markRoadside(g, kind) {
    g.name = 'roadside-' + kind;
    g.userData.roadside = true;
    g.userData.roadsideKind = kind;
    return g;
  }
  let playZoneCache = null, treeSkipZoneCache = null;
  function playZones() {
    if (!playZoneCache) {
      playZoneCache = Object.freeze(
        ['park', 'farm', 'boardwalk', 'amusement', 'pier', 'gas', 'fastfood', 'trailhead']
          .concat(CC.serviceZoneNames ? CC.serviceZoneNames() : []));
    }
    return playZoneCache;
  }
  function treeSkipZones() {
    if (!treeSkipZoneCache) {
      treeSkipZoneCache = Object.freeze(
        ['park', 'farm', 'boardwalk', 'amusement', 'pier', 'gas', 'fastfood']
          .concat(CC.serviceZoneNames ? CC.serviceZoneNames() : []));
    }
    return treeSkipZoneCache;
  }
  function inPlayZone(x, z) {
    const IM = CC.ImageMap;
    if (!IM || !IM.inZone) return false;
    return playZones().some(function (name) {
      return IM.inZone(x, z, name);
    });
  }

  /* ---------- flat painted road lines (batched into one buffer) ---------- */
  function buffer() { return { pos: [], idx: [] }; }

  function quad(buf, a, b, c, d) {
    const i = buf.pos.length / 3;
    buf.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2]);
    buf.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }

  // A rectangle aligned with the road; offset is measured along the right normal.
  function roadRect(buf, road, s0, s1, offset, halfWidth, lift) {
    const p0 = CC.sampleRoad(road, s0), p1 = CC.sampleRoad(road, s1);
    const n0x = p0.dz, n0z = -p0.dx, n1x = p1.dz, n1z = -p1.dx;
    const ax = p0.x + n0x * (offset - halfWidth), az = p0.z + n0z * (offset - halfWidth);
    const bx = p0.x + n0x * (offset + halfWidth), bz = p0.z + n0z * (offset + halfWidth);
    const cx = p1.x + n1x * (offset + halfWidth), cz = p1.z + n1z * (offset + halfWidth);
    const dx = p1.x + n1x * (offset - halfWidth), dz = p1.z + n1z * (offset - halfWidth);
    quad(buf,
      [ax, CC.heightAt(ax, az) + lift, az],
      [bx, CC.heightAt(bx, bz) + lift, bz],
      [cx, CC.heightAt(cx, cz) + lift, cz],
      [dx, CC.heightAt(dx, dz) + lift, dz]);
  }

  function commitBuffer(scene, buf, color) {
    if (!buf.pos.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(buf.pos, 3));
    geo.setIndex(buf.idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, getMat('paint' + color, color, {
      side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
    }));
    mesh.receiveShadow = false;
    mesh.castShadow = false;
    mesh.renderOrder = 2; // painted on top of the textured asphalt ribbon
    scene.add(mesh);
  }

  // A tiny tileable grit texture gives the woodland path a dirt surface rather
  // than a flat brown ribbon. UVs run along the path so the speckles repeat.
  let dirtTrailTex = null;
  function dirtTrailTexture() {
    if (dirtTrailTex) return dirtTrailTex;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#9b7a50'; g.fillRect(0, 0, 64, 64);
    const er = CC.rng(41417);
    for (let i = 0; i < 900; i++) {
      const v = Math.floor(U.randRange(er, 92, 178));
      g.fillStyle = 'rgba(' + v + ',' + Math.floor(v * 0.82) + ',' + Math.floor(v * 0.55) + ',0.55)';
      g.fillRect(er() * 64, er() * 64, er() < 0.15 ? 2 : 1, 1);
    }
    for (let i = 0; i < 28; i++) {
      g.fillStyle = er() < 0.5 ? 'rgba(210,194,158,0.32)' : 'rgba(68,52,36,0.28)';
      g.beginPath(); g.arc(er() * 64, er() * 64, U.randRange(er, 0.7, 2.2), 0, 6.28); g.fill();
    }
    dirtTrailTex = new THREE.CanvasTexture(c);
    dirtTrailTex.wrapS = dirtTrailTex.wrapT = THREE.RepeatWrapping;
    if (THREE.SRGBColorSpace) dirtTrailTex.colorSpace = THREE.SRGBColorSpace;
    return dirtTrailTex;
  }

  let brickTrailTex = null;
  function brickTrailTexture() {
    if (brickTrailTex) return brickTrailTex;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#8a6250'; g.fillRect(0, 0, 128, 128);
    const er = CC.rng(27182);
    const bw = 32, bh = 16;
    for (let row = 0; row < 9; row++) {
      const offset = row % 2 ? bw * 0.5 : 0;
      for (let x = -bw; x < 128 + bw; x += bw) {
        const shade = Math.floor((er() - 0.5) * 26);
        const r = U.clamp(168 + shade, 110, 210);
        const gv = U.clamp(112 + shade, 70, 155);
        const b = U.clamp(88 + shade * 0.8, 55, 130);
        g.fillStyle = 'rgb(' + r + ',' + gv + ',' + b + ')';
        g.fillRect(x + offset + 1, row * bh + 1, bw - 2, bh - 2);
        if (er() < 0.25) {
          g.fillStyle = 'rgba(60,40,30,0.12)';
          g.fillRect(x + offset + 2, row * bh + 2, bw - 4, bh - 4);
        }
      }
    }
    for (let i = 0; i < 500; i++) {
      const v = Math.floor(U.randRange(er, 80, 180));
      g.fillStyle = 'rgba(' + v + ',' + Math.floor(v * 0.75) + ',' + Math.floor(v * 0.55) + ',0.18)';
      g.fillRect(er() * 128, er() * 128, 1, 1);
    }
    brickTrailTex = new THREE.CanvasTexture(c);
    brickTrailTex.wrapS = brickTrailTex.wrapT = THREE.RepeatWrapping;
    if (THREE.SRGBColorSpace) brickTrailTex.colorSpace = THREE.SRGBColorSpace;
    return brickTrailTex;
  }
  function quadUV(buf, a, b, c, d, u0, u1) {
    const i = buf.pos.length / 3;
    buf.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2]);
    buf.uv.push(u0, 0, u0, 1, u1, 1, u1, 0);
    buf.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }
  // Atlas version of quadUV: v coordinates are supplied so many unique labels
  // can share one canvas texture and one draw call.
  function quadUVAtlas(buf, a, b, c, d, u0, u1, v0, v1) {
    const i = buf.pos.length / 3;
    buf.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2]);
    buf.uv.push(u0, v0, u0, v1, u1, v1, u1, v0);
    buf.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }
  function commitTrailBuffer(scene, buf, tex) {
    if (!buf.pos.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(buf.pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(buf.uv, 2));
    geo.setIndex(buf.idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
      map: tex || dirtTrailTexture(), side: THREE.DoubleSide
    }));
    mesh.receiveShadow = true;
    mesh.renderOrder = 2;
    scene.add(mesh);
  }

  /* ---------- junctions ---------- */
  function segmentCross(a, b) {
    const dx = a.bx - a.ax, dz = a.bz - a.az;
    const ex = b.bx - b.ax, ez = b.bz - b.az;
    const den = dx * ez - dz * ex;
    if (Math.abs(den) < 1e-5) return null;
    const ox = b.ax - a.ax, oz = b.az - a.az;
    const t = (ox * ez - oz * ex) / den;
    const u = (ox * dz - oz * dx) / den;
    // Baked roads meet exactly at shared endpoints - those are real junctions.
    if (t < -0.01 || t > 1.01 || u < -0.01 || u > 1.01) return null;
    return { x: a.ax + dx * t, z: a.az + dz * t, t: t, u: u };
  }

  function armFor(seg, t) {
    const road = CC.roadDefs[seg.roadIndex];
    const s = U.clamp((road._cum ? road._cum[seg.segIndex] : 0) + t * seg.len, 0, road._length);
    return {
      road: road, roadIndex: seg.roadIndex, seg: seg, s: s,
      width: seg.width, dx: seg.dx, dz: seg.dz
    };
  }

  function findJunctions() {
    const segs = CC.roadSegments.filter(function (s) {
      return s.type === 'paved' && s.len > 0.5;
    });
    const raw = [];
    for (let i = 0; i < segs.length; i++) {
      for (let j = i + 1; j < segs.length; j++) {
        if (segs[i].roadIndex === segs[j].roadIndex) continue;
        const hit = segmentCross(segs[i], segs[j]);
        if (!hit) continue;
        raw.push({
          x: hit.x, z: hit.z,
          arms: [armFor(segs[i], hit.t), armFor(segs[j], hit.u)]
        });
      }
    }
    // Group nearby hits so a four-way crossing is one junction with four approaches.
    const groups = [];
    raw.forEach(function (h) {
      let g = null;
      for (let i = 0; i < groups.length; i++) {
        if (U.distance2D(h.x, h.z, groups[i].x, groups[i].z) < 14) { g = groups[i]; break; }
      }
      if (!g) { g = { x: h.x, z: h.z, arms: [] }; groups.push(g); }
      h.arms.forEach(function (arm) {
        const seen = g.arms.some(function (a) {
          return a.roadIndex === arm.roadIndex && Math.abs(a.s - arm.s) < 12;
        });
        if (!seen) g.arms.push(arm);
      });
    });
    return groups.filter(function (g) { return g.arms.length >= 2; });
  }

  // Two roads that both terminate here and meet at a narrow angle form the
  // hairpin in the north woods. They get no zebra crossing and a guard rail.
  function sharpTerminalJunctions(junctions) {
    return junctions.filter(function (j) {
      if (j.arms.length !== 2) return false;
      const dirs = j.arms.map(function (arm) {
        const d = arm.s < arm.road._length * 0.5 ? 4 : -4;
        const p = CC.sampleRoad(arm.road, U.clamp(arm.s + d, 0, arm.road._length));
        const vx = j.x - p.x, vz = j.z - p.z, len = Math.hypot(vx, vz) || 1;
        return { x: vx / len, z: vz / len, end: Math.min(arm.s, arm.road._length - arm.s) };
      });
      return dirs.every(function (d) { return d.end < 8; }) &&
        (dirs[0].x * dirs[1].x + dirs[0].z * dirs[1].z) > Math.cos(50 * Math.PI / 180);
    });
  }

  function buildRoadGaps(junctions, skip) {
    const gaps = CC.roadDefs.map(function () { return []; });
    junctions.forEach(function (j) {
      // A terminal hairpin has no crossing furniture, so the centre lines can
      // run right through it instead of leaving a bare break in the asphalt.
      if (skip && skip.indexOf(j) !== -1) return;
      j.arms.forEach(function (a) {
        gaps[a.roadIndex].push({ s: a.s, r: Math.max(5.5, a.width * 0.5 + 1.5) });
      });
    });
    return gaps;
  }

  function buildRoadMarkings(scene, junctions) {
    const gaps = buildRoadGaps(junctions, sharpTerminalJunctions(junctions));
    const yellow = buffer();
    const step = 1.6;
    CC.roadDefs.forEach(function (road, ri) {
      if (road.type !== 'paved') return;
      const end = road._length - 0.02;
      const index = road._index == null ? ri : road._index;
      const blocked = gaps[index] || [];
      for (let s = 0; s < end; s += step) {
        const s1 = Math.min(s + step, end);
        let skip = false;
        for (let i = 0; i < blocked.length; i++) {
          if (s1 > blocked[i].s - blocked[i].r && s < blocked[i].s + blocked[i].r) {
            skip = true; break;
          }
        }
        if (skip) continue;
        // Double yellow centre line. A little extra lift keeps the paint from
        // z-fighting with the ribbon and breaking into missing dashes.
        roadRect(yellow, road, s, s1, -0.23, 0.075, 0.24);
        roadRect(yellow, road, s, s1, 0.23, 0.075, 0.24);
        // One solid yellow line down each edge of the pavement.
        const edge = road.width * 0.5 - 0.7;
        roadRect(yellow, road, s, s1, -edge, 0.08, 0.24);
        roadRect(yellow, road, s, s1, edge, 0.08, 0.24);
      }
    });
    commitBuffer(scene, yellow, 0xe4b227);
  }

  // One zebra crossing on a specific approach of a junction.
  function addCrosswalk(buf, arm, sign) {
    const d = arm.width * 0.5 + 3.7;
    const s = arm.s + sign * d;
    if (s < 1 || s > arm.road._length - 1) return false;
    const p = CC.sampleRoad(arm.road, s);
    const dx = p.dx, dz = p.dz, nx = dz, nz = -dx;
    const halfAcross = Math.max(2.2, arm.width * 0.5 - 0.9);
    const halfAlong = 0.26;
    const count = 5, gap = 0.92;
    for (let k = 0; k < count; k++) {
      const along = (k - (count - 1) * 0.5) * gap;
      const px = p.x + dx * along, pz = p.z + dz * along;
      const a = [px - dx * halfAlong - nx * halfAcross, 0, pz - dz * halfAlong - nz * halfAcross];
      const b = [px + dx * halfAlong - nx * halfAcross, 0, pz + dz * halfAlong - nz * halfAcross];
      const c = [px + dx * halfAlong + nx * halfAcross, 0, pz + dz * halfAlong + nz * halfAcross];
      const d2 = [px - dx * halfAlong + nx * halfAcross, 0, pz - dz * halfAlong + nz * halfAcross];
      a[1] = CC.heightAt(a[0], a[2]) + 0.24;
      b[1] = CC.heightAt(b[0], b[2]) + 0.24;
      c[1] = CC.heightAt(c[0], c[2]) + 0.24;
      d2[1] = CC.heightAt(d2[0], d2[2]) + 0.24;
      quad(buf, a, b, c, d2);
    }
    return true;
  }

  /* ---------- canvas-textured signs ---------- */
  const texCache = {};
  // Shrink long sign text until it fits its painted panel. Canvas text does not
  // wrap here, so the large entrance/business/directional signs need this.
  function fitFont(g, text, maxWidth, size, family, weight) {
    family = family || 'Arial';
    weight = weight || 'bold';
    let px = size;
    while (px > 7) {
      g.font = weight + ' ' + px + 'px ' + family;
      if (g.measureText(text).width <= maxWidth) break;
      px -= 2;
    }
    return px;
  }
  function fitText(g, text, x, y, maxWidth, size, family, weight) {
    fitFont(g, text, maxWidth, size, family, weight);
    g.fillText(text, x, y, maxWidth);
  }
  let usFlagTex = null;
  function usFlagTexture() {
    if (usFlagTex) return usFlagTex;
    const c = document.createElement('canvas');
    c.width = 160; c.height = 84;
    const g = c.getContext('2d');
    const stripe = c.height / 13;
    for (let i = 0; i < 13; i++) {
      g.fillStyle = i % 2 === 0 ? '#b3192d' : '#f4f1e8';
      g.fillRect(0, i * stripe, c.width, stripe + 0.5);
    }
    g.fillStyle = '#243b73';
    g.fillRect(0, 0, 68, stripe * 7);
    g.fillStyle = '#ffffff';
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 5; col++) {
        const x = 7 + col * 13 + (row % 2) * 6;
        const y = 6 + row * 10;
        g.beginPath();
        for (let k = 0; k < 10; k++) {
          const a = -Math.PI / 2 + k * Math.PI / 5;
          const r = k % 2 ? 1.5 : 3.2;
          if (k === 0) g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
          else g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        }
        g.closePath(); g.fill();
      }
    }
    usFlagTex = new THREE.CanvasTexture(c);
    if (THREE.SRGBColorSpace) usFlagTex.colorSpace = THREE.SRGBColorSpace;
    return usFlagTex;
  }

  function signFaceTexture(text, kind) {
    const key = kind + '|' + text;
    if (texCache[key]) return texCache[key];
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 128, 128);
    g.textAlign = 'center'; g.textBaseline = 'middle';

    if (kind === 'stop') {
      g.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = Math.PI / 8 + i * Math.PI / 4;
        const x = 64 + Math.cos(a) * 60, y = 64 + Math.sin(a) * 60;
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.closePath();
      g.fillStyle = '#c62828'; g.fill();
      g.lineWidth = 7; g.strokeStyle = '#f6f4ec'; g.stroke();
      g.fillStyle = '#ffffff'; fitText(g, 'STOP', 64, 66, 108, 29);
    } else if (kind === 'speed') {
      g.fillStyle = '#f7f7f0'; g.fillRect(3, 3, 122, 122);
      g.lineWidth = 8; g.strokeStyle = '#202020'; g.strokeRect(8, 8, 112, 112);
      g.fillStyle = '#202020'; fitText(g, text, 64, 56, 100, 62);
      fitText(g, 'SPEED LIMIT', 64, 106, 108, 12);
    } else if (kind === 'yield') {
      g.beginPath(); g.moveTo(64, 16); g.lineTo(118, 110); g.lineTo(10, 110); g.closePath();
      g.fillStyle = '#ffffff'; g.fill();
      g.lineWidth = 8; g.strokeStyle = '#c62828'; g.stroke();
      g.fillStyle = '#b71c1c'; fitText(g, 'YIELD', 64, 82, 88, 19);
    } else if (kind === 'street') {
      g.fillStyle = '#16603c'; g.fillRect(2, 38, 124, 52);
      g.lineWidth = 4; g.strokeStyle = '#f2f6ee'; g.strokeRect(4, 40, 120, 48);
      g.fillStyle = '#ffffff';
      fitText(g, text, 64, 64, 116, text.length > 13 ? 15 : 19);
    } else if (kind === 'dirRight' || kind === 'dirLeft') {
      g.fillStyle = '#176b45'; g.fillRect(2, 30, 124, 68);
      g.lineWidth = 4; g.strokeStyle = '#f2f6ee'; g.strokeRect(4, 32, 120, 64);
      g.fillStyle = '#ffffff';
      const right = kind === 'dirRight';
      g.beginPath();
      if (right) { g.moveTo(84, 64); g.lineTo(68, 52); g.lineTo(68, 76); }
      else { g.moveTo(44, 64); g.lineTo(60, 52); g.lineTo(60, 76); }
      g.closePath(); g.fill();
      g.textAlign = right ? 'left' : 'right';
      fitText(g, text, right ? 18 : 110, 66, right ? 46 : 50, 16);
    } else if (kind === 'info') {
      g.fillStyle = '#22577a'; g.fillRect(2, 28, 124, 72);
      g.lineWidth = 4; g.strokeStyle = '#eaf3f7'; g.strokeRect(4, 30, 120, 68);
      g.fillStyle = '#ffffff'; fitText(g, text, 64, 64, 116, 17);
    } else if (kind === 'bus') {
      g.fillStyle = '#176b45'; g.fillRect(2, 18, 124, 92);
      g.lineWidth = 5; g.strokeStyle = '#f4f1df'; g.strokeRect(5, 21, 118, 86);
      g.fillStyle = '#f4d35e'; fitText(g, 'bus stop', 64, 57, 110, 25, 'Arial', 'bold');
      g.fillStyle = '#ffffff'; fitText(g, 'CITY TRANSIT', 64, 91, 106, 14);
    } else {
      g.fillStyle = '#1f6b8c'; g.fillRect(2, 28, 124, 72);
      g.lineWidth = 6; g.strokeStyle = '#e8f2f4'; g.strokeRect(7, 32, 114, 64);
      g.fillStyle = '#ffffff'; fitText(g, text, 64, 66, 108, 21);
    }
    const tex = new THREE.CanvasTexture(c);
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    texCache[key] = tex;
    return tex;
  }

  function faceSize(kind, size) {
    if (kind === 'street') return [size * 2.6, size * 0.62];
    if (kind === 'dirRight' || kind === 'dirLeft' || kind === 'info') return [size * 2.3, size * 0.8];
    if (kind === 'bus') return [size * 2.2, size * 1.0];
    if (kind === 'billboard') return [size, size];
    return [size, size];
  }

  function addRoadSign(scene, x, z, yaw, text, kind, scale) {
    const size = scale || 1.6;
    const wide = kind === 'street' || kind === 'dirRight' || kind === 'dirLeft' ||
      kind === 'info' || kind === 'bus';
    const postH = kind === 'stop' ? 3.1 : wide ? 3.6 : 2.9;
    const g = new THREE.Group();
    g.add(cylinder(0.075, 0.095, postH, 6, getMat('signPost', 0x9aa2a5), 0, postH * 0.5, 0));
    const wh = faceSize(kind, size);
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(wh[0], wh[1]),
      new THREE.MeshLambertMaterial({
        map: signFaceTexture(text, kind), transparent: true, alphaTest: 0.25,
        side: THREE.DoubleSide
      })
    );
    face.position.y = postH + wh[1] * 0.42;
    g.add(face);
    g.position.set(x, CC.heightAt(x, z), z);
    g.rotation.y = yaw;
    scene.add(g);
    return g;
  }

  // Two perpendicular name blades on one post at a street corner.
  function addCornerNameSign(scene, x, z, yaw, nameA, nameB) {
    const g = new THREE.Group();
    const post = getMat('signPost', 0x9aa2a5);
    g.add(cylinder(0.09, 0.12, 4.0, 6, post, 0, 2.0, 0));
    [
      { text: nameA, ry: 0, y: 3.55 },
      { text: nameB, ry: Math.PI / 2, y: 2.35 }
    ].forEach(function (blade) {
      const face = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.05),
        new THREE.MeshLambertMaterial({
          map: signFaceTexture(blade.text, 'street'), transparent: true,
          alphaTest: 0.25, side: THREE.DoubleSide
        }));
      face.position.y = blade.y;
      face.rotation.y = blade.ry;
      g.add(face);
    });
    g.position.set(x, CC.heightAt(x, z), z);
    g.rotation.y = yaw;
    scene.add(g);
  }

  /* ---------- traffic lights and street lamps ---------- */
  function makeBulbMats() {
    return {
      red: new THREE.MeshStandardMaterial({ color: 0x8b241d, emissive: 0xff2a14, emissiveIntensity: 0.05, flatShading: true }),
      yellow: new THREE.MeshStandardMaterial({ color: 0x8a6d1e, emissive: 0xffc02a, emissiveIntensity: 0.05, flatShading: true }),
      green: new THREE.MeshStandardMaterial({ color: 0x1f6b3b, emissive: 0x2bff70, emissiveIntensity: 0.05, flatShading: true })
    };
  }
  // Axis 2 is the shared drawbridge approach phase.
  const bulbMats = [makeBulbMats(), makeBulbMats(), makeBulbMats()];
  const gateBeaconMat = new THREE.MeshBasicMaterial({ color: 0xffc928 });
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xfff1c9, emissive: 0xffd98a, emissiveIntensity: 0.1, flatShading: true
  });
  const lampGlowMat = new THREE.MeshBasicMaterial({
    color: 0xffe7ad, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  function addTrafficLight(scene, x, z, yaw, axis, signal) {
    // Keep the signal logic even if no safe roadside spot exists for a mesh.
    if (signal) {
      signal.state = 'red';
      Details.signals.push(signal);
      Details.trafficSignals++;
    }
    const spot = clearRoadside(x, z, 1.2);
    if (!spot) return;
    x = spot.x; z = spot.z;
    const bulbs = bulbMats[axis];
    const g = markRoadside(new THREE.Group(), 'trafficLight');
    g.add(cylinder(0.13, 0.17, 5.6, 7, getMat('lightPole', 0x5b6366), 0, 2.8, 0));
    g.add(box(0.14, 0.14, 3.3, getMat('lightPole', 0x5b6366), 0, 5.45, 1.6));
    g.add(box(0.82, 2.25, 0.6, getMat('lightBox', 0x1d2326), 0, 4.3, 3.15));
    ['red', 'yellow', 'green'].forEach(function (key, i) {
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), bulbs[key]);
      bulb.position.set(0, 5.0 - i * 0.7, 3.5);
      g.add(bulb);
      const visor = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.3, 0.28, 8, 1, true),
        getMat('visor', 0x161a1c)
      );
      visor.rotation.x = Math.PI / 2;
      visor.position.set(0, 5.0 - i * 0.7, 3.62);
      g.add(visor);
    });
    g.position.set(x, CC.heightAt(x, z), z);
    g.rotation.y = yaw;
    scene.add(g);
  }

  function addStreetLamp(scene, x, z, yaw) {
    const spot = clearRoadside(x, z, 1.2);
    if (!spot) return;
    x = spot.x; z = spot.z;
    const g = markRoadside(new THREE.Group(), 'streetLamp');
    g.add(cylinder(0.11, 0.16, 6.1, 7, getMat('lampPole', 0x596164), 0, 3.05, 0));
    const arm = box(0.13, 0.13, 2.5, getMat('lampPole', 0x596164), 0, 6.0, 1.2);
    arm.rotation.x = -0.1;
    g.add(arm);
    g.add(box(0.72, 0.2, 1.05, lampMat, 0, 5.82, 2.35));
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.75, 8, 6), lampGlowMat);
    glow.position.set(0, 5.65, 2.35);
    g.add(glow);
    g.position.set(x, CC.heightAt(x, z), z);
    g.rotation.y = yaw;
    scene.add(g);
    Details.streetLamps++;
  }

  // Returns the approach just outside a junction, plus its direction toward it.
  function approachPoint(arm, sign, lateralPad) {
    const d = arm.width * 0.5 + (lateralPad == null ? 4.2 : lateralPad);
    const s = arm.s + sign * d;
    if (s < 1 || s > arm.road._length - 1) return null;
    const p = CC.sampleRoad(arm.road, s);
    // sign > 0 means the approach is after the junction, so travel back toward it.
    const toX = sign > 0 ? -p.dx : p.dx;
    const toZ = sign > 0 ? -p.dz : p.dz;
    // Right-hand normal = forward cross up = (-toZ, toX) in the x-z plane.
    return { x: p.x, z: p.z, toX: toX, toZ: toZ, rightX: -toZ, rightZ: toX, arm: arm };
  }

  function isMajor(junction) {
    if (junction.arms.length < 2) return false;
    // Signalise junctions where two wide roads meet - includes the T-junctions
    // formed where a cross street terminates on Harbor/Palm Boulevard.
    const wide = junction.arms.filter(function (a) { return a.width >= 11; });
    if (wide.length < 2) return false;
    return junction.arms.some(function (a) {
      return approachPoint(a, 1, 4.4) || approachPoint(a, -1, 4.4);
    });
  }

  // Group non-conflicting approaches into two phases by the road's dominant axis.
  function signalAxis(arm) {
    return Math.abs(arm.dx) >= Math.abs(arm.dz) ? 0 : 1;
  }

  function buildIntersectionFurniture(scene, junctions) {
    const white = buffer();
    const used = [];
    const sharp = sharpTerminalJunctions(junctions);
    Details.sharpJunctions = sharp;
    junctions.forEach(function (junction) {
      const major = isMajor(junction);
      // The sharp wooded hairpin gets neither zebra stripes nor stop signs.
      const noFurniture = sharp.indexOf(junction) !== -1;
      let nameSignPlaced = false;
      junction.arms.forEach(function (arm, ai) {
        [-1, 1].forEach(function (sign) {
          const ap = approachPoint(arm, sign, 3.7);
          if (!ap) return;
          if (!noFurniture && addCrosswalk(white, arm, sign)) Details.crosswalks++;

          // Signalised junctions use lights instead of STOP signs. Other
          // approaches get a STOP on the right-hand corner only.
          const corner = approachPoint(arm, sign, 4.4);
          if (corner && dry(corner.x, corner.z)) {
            const lateral = arm.width * 0.5 + 1.7;
            const sx = corner.x + corner.rightX * lateral;
            const sz = corner.z + corner.rightZ * lateral;
            if (!major && !noFurniture && dry(sx, sz)) {
              const duplicate = used.some(function (p) { return U.distance2D(p.x, p.z, sx, sz) < 3.2; });
              if (!duplicate) {
                used.push({ x: sx, z: sz });
                addRoadSign(scene, sx, sz, Math.atan2(-corner.toX, -corner.toZ), 'STOP', 'stop', 1.45);
                Details.stopSigns++;
              }
            }
            // One two-blade name pole per junction, independent of signage.
            if (!nameSignPlaced && dry(sx, sz)) {
              const bx = sx + corner.rightX * 1.4, bz = sz + corner.rightZ * 1.4;
              if (dry(bx, bz)) {
                const other = junction.arms.filter(function (a) {
                  return a.roadIndex !== arm.roadIndex;
                })[0];
                const ownName = (arm.road.name || 'STREET').toUpperCase();
                addCornerNameSign(scene, bx, bz, Math.atan2(-corner.rightX, -corner.rightZ),
                  ownName, other ? (other.road.name || 'STREET').toUpperCase() : ownName);
                Details.streetSigns++;
                nameSignPlaced = true;
              }
            }
          }

          const forceSignal = junction.arms.some(function (a) {
            return a.road && (a.road.name === 'Duke Lot Exit' || a.road.name === 'Port Access');
          });
          if (major || forceSignal) {
            const light = approachPoint(arm, sign, 4.5);
            if (light && dry(light.x, light.z)) {
              const lateral = arm.width * 0.5 + 2.6;
              const lx = light.x + light.rightX * lateral;
              const lz = light.z + light.rightZ * lateral;
              const signal = {
                x: lx, z: lz, fx: light.toX, fz: light.toZ,
                axis: signalAxis(arm), state: 'red'
              };
              addTrafficLight(scene, lx, lz, Math.atan2(-light.toX, -light.toZ), signal.axis, signal);
            }
          }
        });
      });
    });
    commitBuffer(scene, white, 0xf2f2e8);
  }

  // A boom gate and flashing amber beacon accompany every drawbridge signal.
  // The gate obstacle is added before vehicles spawn and toggled by the shared
  // Drawbridges update, so traffic cannot slip through a closed crossing.
  function addDrawbridgeGate(scene, span, end, dx, dz) {
    const outX = dx * end, outZ = dz * end;
    const baseX = (end < 0 ? span.ax : span.bx) + outX * 8;
    const baseZ = (end < 0 ? span.az : span.bz) + outZ * 8;
    const toX = -outX, toZ = -outZ;
    const latX = -toZ, latZ = toX;
    const half = span.width * 0.5 + 1.2;
    const armLen = half * 2;
    const pivotX = baseX - latX * half;
    const pivotZ = baseZ - latZ * half;
    const g = new THREE.Group();
    g.position.set(pivotX, CC.heightAt(pivotX, pivotZ), pivotZ);
    g.rotation.y = Math.atan2(-toX, -toZ);
    const pole = getMat('gatePole', 0x394447);
    const armMat = getMat('gateArm', 0xe9e5d9);
    const stripe = getMat('gateStripe', 0xcf3b2f);
    g.add(box(0.55, 4.6, 0.55, pole, 0, 2.3, 0));
    g.add(box(0.55, 4.6, 0.55, pole, armLen, 2.3, 0));
    const arm = new THREE.Group();
    arm.add(box(armLen, 0.34, 0.34, armMat, armLen * 0.5, 2.65, 0));
    for (let i = 0; i < 4; i++) {
      arm.add(box(1.1, 0.36, 0.36, stripe, armLen * (0.18 + i * 0.21), 2.65, 0));
    }
    g.add(arm);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.36, 8, 6), gateBeaconMat);
    beacon.position.set(0, 4.9, 0);
    beacon.visible = false;
    g.add(beacon);
    scene.add(g);

    const obstacle = { x: baseX, z: baseZ, r: half + 0.5, type: 'gate', disabled: false };
    if (CC.World && CC.World.obstacles) CC.World.obstacles.push(obstacle);
    if (CC.Drawbridges) {
      CC.Drawbridges.registerGate(g, arm, obstacle, span);
      CC.Drawbridges.registerBeacon(beacon, span);
    }
  }

  function addFixedTrafficLight(scene, x, z, facingYaw, axis) {
    addTrafficLight(scene, x, z, facingYaw, axis, {
      x: x, z: z, fx: Math.sin(facingYaw), fz: Math.cos(facingYaw),
      axis: axis, state: axis === 0 ? 'green' : 'red', fixed: true
    });
  }

  // Both ends of every drawbridge get a red/green signal, a boom gate and a
  // flashing amber beacon. Fixed crossings like North Cross are excluded.
  function buildDrawbridgeLights(scene) {
    const spans = (CC.Drawbridges && CC.Drawbridges.spans) || [];
    spans.forEach(function (s) {
      const len = Math.hypot(s.bx - s.ax, s.bz - s.az) || 1;
      const dx = (s.bx - s.ax) / len, dz = (s.bz - s.az) / len;
      [-1, 1].forEach(function (end) {
        const outX = dx * end, outZ = dz * end;
        const baseX = (end < 0 ? s.ax : s.bx) + outX * 8;
        const baseZ = (end < 0 ? s.az : s.bz) + outZ * 8;
        const toX = -outX, toZ = -outZ;
        const lateral = s.width * 0.5 + 3.2;
        const lx = baseX - toZ * lateral;
        const lz = baseZ + toX * lateral;
        const signal = {
          x: lx, z: lz, fx: toX, fz: toZ,
          axis: 2, state: 'green', drawbridge: true, span: s
        };
        addTrafficLight(scene, lx, lz, Math.atan2(-toX, -toZ), 2, signal);
        addDrawbridgeGate(scene, s, end, dx, dz);
      });

      // Add fixed intersection-style signals on the west approach where a
      // bridge meets a nearby stop-controlled cross street.
      const spanRoad = (CC.roadDefs && CC.roadDefs[s.roadIndex]) || {};
      if (spanRoad.name === 'South Cross' || spanRoad.name === 'Main Street') {
        const westBaseX = s.ax - dx * 38;
        const westBaseZ = s.az - dz * 38;
        const westLateral = s.width * 0.5 + 3.4;
        addFixedTrafficLight(scene,
          westBaseX + dz * westLateral, westBaseZ - dx * westLateral,
          Math.atan2(dx, dz), 0);
        addFixedTrafficLight(scene,
          westBaseX - dz * westLateral, westBaseZ + dx * westLateral,
          Math.atan2(dx, dz), 0);

        const junction = (Details.junctions || []).filter(function (j) {
          return j.arms.some(function (a) { return a.roadIndex === s.roadIndex && a.s < len * 0.45; }) &&
            j.arms.some(function (a) { return a.roadIndex !== s.roadIndex; });
        })[0];
        if (junction) {
          junction.arms.forEach(function (arm) {
            if (arm.roadIndex === s.roadIndex) return;
            const sign = arm.s < arm.road._length * 0.5 ? 1 : -1;
            const lx = junction.x - arm.toX * 16 - arm.toZ * 3.4;
            const lz = junction.z - arm.toZ * 16 + arm.toX * 3.4;
            addFixedTrafficLight(scene, lx, lz, Math.atan2(arm.toX * sign, arm.toZ * sign), 1);
          });
        }
      }
    });
  }

  // Curved rail on the outside of the sharp terminal turn, with capped posts
  // and collision so the player cannot drive through it into the trees.
  function buildGuardRails(scene, junctions) {
    const metal = getMat('guardRail', 0xc6ccd0);
    const post = getMat('guardPost', 0x7d8588);
    sharpTerminalJunctions(junctions).forEach(function (j) {
      const dirs = j.arms.map(function (arm) {
        const d = arm.s < arm.road._length * 0.5 ? 4 : -4;
        const p = CC.sampleRoad(arm.road, U.clamp(arm.s + d, 0, arm.road._length));
        const vx = j.x - p.x, vz = j.z - p.z, len = Math.hypot(vx, vz) || 1;
        return { x: vx / len, z: vz / len };
      });
      const bx = dirs[0].x + dirs[1].x, bz = dirs[0].z + dirs[1].z;
      const bl = Math.hypot(bx, bz) || 1;
      const baseAngle = Math.atan2(bz / bl, bx / bl);
      const pts = [];
      for (let k = -5; k <= 5; k++) {
        const a = baseAngle + k * 0.16, r = 12.5;
        const x = j.x + Math.cos(a) * r, z = j.z + Math.sin(a) * r;
        pts.push({ x: x, z: z, y: CC.heightAt(x, z) });
      }
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        [0.62, 1.06].forEach(function (h) {
          beamBetween(scene, a.x, a.y + h, a.z, b.x, b.y + h, b.z, 0.085, metal);
        });
      }
      pts.forEach(function (p, i) {
        beamBetween(scene, p.x, p.y - 0.1, p.z, p.x, p.y + 1.15, p.z, 0.13, post);
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.17, 7, 5), metal);
        cap.position.set(p.x, p.y + 1.2, p.z);
        scene.add(cap);
        if (i % 2 === 0 && CC.World && CC.World.obstacles) {
          CC.World.obstacles.push({ x: p.x, z: p.z, r: 1.15, type: 'guardrail' });
        }
      });
      Details.guardRails++;
    });
  }

  function buildRoadSigns(scene) {
    const paved = CC.roadDefs.filter(function (r) { return r.type === 'paved'; });
    paved.forEach(function (road) {
      const p = CC.sampleRoad(road, 10);
      const side = rng() < 0.5 ? 1 : -1;
      const x = p.x + p.dz * side * (road.width * 0.5 + 2.6);
      const z = p.z - p.dx * side * (road.width * 0.5 + 2.6);
      if (dry(x, z)) {
        const limit = road.width >= 14 ? '45' : road.width >= 12 ? '35' : '25';
        addRoadSign(scene, x, z, Math.atan2(-p.dx, -p.dz), limit, 'speed', 1.5);
        Details.speedSigns++;
      }
      // Yield signs at the closed end of a cul-de-sac.
      if (/cul/i.test(road.name || '')) {
        const e = CC.sampleRoad(road, road._length - 9);
        const ex = e.x + e.dz * (road.width * 0.5 + 2.4);
        const ez = e.z - e.dx * (road.width * 0.5 + 2.4);
        if (dry(ex, ez)) {
          addRoadSign(scene, ex, ez, Math.atan2(-e.dx, -e.dz), 'YIELD', 'yield', 1.45);
          Details.streetSigns++;
        }
      }
    });
    buildDirectionSigns(scene);
    buildBillboards(scene);
    buildWelcomeBillboard(scene);
  }

  function buildDirectionSigns(scene) {
    const lm = CC.World.imageLandmarks || [];
    const find = function (type) { return lm.filter(function (l) { return l.type === type; })[0]; };
    const targets = [];
    if (Details.marina) targets.push({ name: 'MARINA', x: Details.marina.x, z: Details.marina.z });
    const launch = find('launch');
    if (launch) targets.push({ name: 'BOAT LAUNCH', x: launch.x, z: launch.z });
    targets.push({ name: 'BEACH', x: CC.coast.westLine(120) + 10, z: 120 });
    const store = find('store'); if (store) targets.push({ name: 'PINE MARKET', x: store.x, z: store.z });

    const park = find('pavilion'); if (park) targets.push({ name: 'PARK', x: park.x, z: park.z });
    if (!targets.length) return;

    CC.roadDefs.filter(function (r) { return r.type === 'paved'; }).forEach(function (road) {
      [0.3, 0.72].forEach(function (frac) {
        const p = CC.sampleRoad(road, road._length * frac);
        let best = null, score = -Infinity;
        targets.forEach(function (t) {
          const dx = t.x - p.x, dz = t.z - p.z;
          const d = Math.hypot(dx, dz);
          if (d < 30 || d > 420) return;
          const align = Math.abs((dx * p.dx + dz * p.dz) / d);
          const s = align * 100 - d * 0.04;
          if (s > score) {
            score = s;
            const rightDot = -(dx * p.dz - dz * p.dx);
            best = { t: t, right: rightDot >= 0 ? 1 : -1 };
          }
        });
        if (!best) return;
        const off = road.width * 0.5 + 3.3;
        const x = p.x - p.dz * best.right * off;
        const z = p.z + p.dx * best.right * off;
        if (!dry(x, z)) return;
        // Face the sign toward the road (left for a right-side sign, right otherwise).
        const nx = best.right * p.dz, nz = -best.right * p.dx;
        const yaw = Math.atan2(nx, nz);
        addRoadSign(scene, x, z, yaw, best.t.name,
          best.right > 0 ? 'dirRight' : 'dirLeft', 1.5);
        Details.directionSigns++;
      });
    });
  }

  function billboardTexture(title, sub, color) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = color; g.fillRect(0, 0, 256, 128);
    g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 5;
    g.strokeRect(6, 6, 244, 116);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#ffffff';
    fitText(g, title, 128, 52, 232, 32);
    fitText(g, sub, 128, 91, 232, 18);
    const tex = new THREE.CanvasTexture(c);
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function buildBillboards(scene) {
    const ads = [
      ['COASTAL CRUISE', 'SEE THE WHOLE BAY', '#1d5f8a'],
      ['PINE MARKET', 'FRESH SUPPLIES', '#2c6b3f'],
      ['HARBOR GRILL', 'SEAFOOD & SUNSETS', '#8a3d2c'],
      ['MARINA', 'SLIPS & BOAT RENTAL', '#185a6b'],
      ['BEACH DAYS', 'SUN • SAND • SURF', '#c08a2e'],

    ];
    const paved = CC.roadDefs.filter(function (r) { return r.type === 'paved' && r._length > 4; });
    if (!paved.length) return;
    adLoop:
    for (let i = 0; i < ads.length; i++) {
      for (let tries = 0; tries < 18; tries++) {
        const road = paved[i % paved.length];
        const s = road._length * (0.18 + rng() * 0.7);
        const p = CC.sampleRoad(road, s);
        const side = rng() < 0.5 ? 1 : -1;
        const off = road.width * 0.5 + 6.5;
        const x = p.x + p.dz * side * off, z = p.z - p.dx * side * off;
        if (!dry(x, z) || isRoad(x, z)) continue;
        let nearJunction = false;
        for (let j = 0; j < CC.World.obstacles.length; j++) {
          const o = CC.World.obstacles[j];
          if (o.type === 'home' && U.distance2D(x, z, o.x, o.z) < o.r + 5) { nearJunction = true; break; }
        }
        if (nearJunction) continue;
        const g = new THREE.Group();
        const postMat = getMat('billboardPost', 0x6f7376);
        g.add(cylinder(0.16, 0.2, 7.4, 6, postMat, -3.5, 3.7, 0));
        g.add(cylinder(0.16, 0.2, 7.4, 6, postMat, 3.5, 3.7, 0));
        const panel = new THREE.Mesh(
          new THREE.PlaneGeometry(10, 5),
          new THREE.MeshLambertMaterial({ map: billboardTexture(ads[i][0], ads[i][1], ads[i][2]) })
        );
        panel.position.y = 8;
        panel.castShadow = true;
        g.add(panel);
        g.position.set(x, CC.heightAt(x, z), z);
        g.rotation.y = Math.atan2(-side * p.dz, side * p.dx);
        scene.add(g);
        Details.billboards++;
        continue adLoop;
      }
    }
  }

  function welcomeTexture() {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 384;
    const g = c.getContext('2d');
    g.fillStyle = '#12496b'; g.fillRect(0, 0, 1024, 384);
    g.strokeStyle = '#e8d8a8'; g.lineWidth = 12; g.strokeRect(14, 14, 996, 356);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#f6ead0';
    fitText(g, 'WELCOME TO THE HARBOR', 512, 132, 940, 96, 'Georgia');
    fitText(g, 'COASTAL CRUISE', 512, 248, 900, 52);
    fitText(g, 'Slow down and enjoy the view', 512, 322, 900, 30, 'Arial', 'normal');
    const tex = new THREE.CanvasTexture(c);
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function buildWelcomeBillboard(scene) {
    const road = CC.roadDefs[0];
    if (!road) return;
    const p = CC.sampleRoad(road, Math.min(110, road._length * 0.3));
    const off = road.width * 0.5 + 13;
    let x = p.x + p.dz * off, z = p.z - p.dx * off;
    if (!dry(x, z) || isRoad(x, z)) { x = p.x - p.dz * off; z = p.z + p.dx * off; }
    if (!dry(x, z)) return;
    const g = new THREE.Group();
    const postMat = getMat('billboardPost', 0x6f7376);
    g.add(cylinder(0.28, 0.34, 10, 6, postMat, -7, 5, 0));
    g.add(cylinder(0.28, 0.34, 10, 6, postMat, 7, 5, 0));
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(20, 7.5),
      new THREE.MeshLambertMaterial({ map: welcomeTexture() }));
    panel.position.y = 10.5;
    panel.castShadow = true;
    g.add(panel);
    g.add(box(20.4, 0.35, 0.4, postMat, 0, 14.5, 0));
    g.position.set(x, CC.heightAt(x, z), z);
    g.rotation.y = Math.atan2(p.x - x, p.z - z);
    scene.add(g);
    Details.billboards++;
  }

  const spiritualSayings = [
    'Kindness is the best sermon',
    'The path is brighter when shared',
    'Faith is a journey, not a destination',
    'Grace is a gift with no return address',
    'Love your neighbor — parking is free',
    'Every soul has a seat at the table',
    'Mercy is always in season',
    'Peace begins with a hello',
    'The light finds those who look up',
    'Pray like it matters — because it does'
  ];
  function spiritualSignTexture(saying) {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 448;
    const g = c.getContext('2d');
    g.fillStyle = '#103b4d'; g.fillRect(0, 0, 1024, 448);
    g.strokeStyle = '#e9cf8b'; g.lineWidth = 12; g.strokeRect(14, 14, 996, 420);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#fff3d4';
    fitText(g, 'Community Chapel', 512, 112, 930, 86, 'Georgia');
    g.fillStyle = '#f4d78f';
    fitText(g, 'All are welcome', 512, 202, 900, 62, 'Georgia', 'normal');
    g.strokeStyle = '#e9cf8b'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(150, 258); g.lineTo(874, 258); g.stroke();
    g.fillStyle = '#dceef1';
    fitText(g, saying, 512, 338, 900, 46, 'Arial', 'normal');
    const tex = new THREE.CanvasTexture(c);
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function buildSpiritualSign(scene) {
    const x = 205, z = 280;
    const map = CC.ImageMap;
    if (map && map.inWater && map.inWater(x, z)) return;
    if (CC.roadClearance && CC.roadClearance(x, z, 10) < 3) return;
    const road = CC.nearestRoad && CC.nearestRoad(x, z, 'paved');
    const yaw = road ? Math.atan2(road.x - x, road.z - z) : Math.PI;
    const g = new THREE.Group();
    const postMat = getMat('chapelSignPost', 0x5a6064);
    g.add(cylinder(0.34, 0.42, 11, 6, postMat, -9, 5.5, 0));
    g.add(cylinder(0.34, 0.42, 11, 6, postMat, 9, 5.5, 0));
    const textures = spiritualSayings.map(spiritualSignTexture);
    const material = new THREE.MeshStandardMaterial({
      map: textures[0], emissive: 0xffffff, emissiveMap: textures[0],
      emissiveIntensity: 0.18, roughness: 0.82, side: THREE.DoubleSide
    });
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(22, 9.6), material);
    panel.position.y = 11.6;
    panel.castShadow = true;
    g.add(panel);
    g.add(box(22.5, 0.4, 0.45, postMat, 0, 16.6, 0));
    g.add(box(22.5, 0.4, 0.45, postMat, 0, 6.6, 0));
    const lampMat = getMat('chapelSignLamp', 0xfff0bd, { emissive: 0xffd98a });
    const lights = [];
    [-7.2, 7.2].forEach(function (lx) {
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), lampMat);
      lamp.position.set(lx, 8.2, 1.1);
      g.add(lamp);
      const light = new THREE.PointLight(0xffdf9c, 0.05, 26, 2);
      light.position.set(lx, 8.2, 2.2);
      g.add(light);
      lights.push(light);
    });
    g.position.set(x, CC.heightAt(x, z), z);
    g.rotation.y = yaw;
    scene.add(g);
    Details.spiritualSign = { panel: panel, material: material, textures: textures, lights: lights };
    Details.spiritualSayings = spiritualSayings.slice();
    Details.spiritualSigns++;
    CC.World.obstacles.push({ x: x, z: z, r: 10, type: 'sign' });
  }

  function trailSignTexture() {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#1f5b3a'; g.fillRect(0, 0, 512, 256);
    g.strokeStyle = '#e9dcb2'; g.lineWidth = 10; g.strokeRect(12, 12, 488, 232);
    g.fillStyle = '#e9dcb2';
    [-150, 0, 150].forEach(function (dx, i) {
      const x = 256 + dx, top = 58 + (i === 1 ? -12 : 6);
      g.beginPath(); g.moveTo(x, top); g.lineTo(x - 42, top + 68); g.lineTo(x + 42, top + 68); g.closePath(); g.fill();
      g.fillRect(x - 6, top + 66, 12, 32);
    });
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff7df';
    fitText(g, 'PINE WOODS', 256, 146, 450, 48, 'Georgia');
    fitText(g, 'NATURE TRAIL', 256, 204, 450, 56, 'Arial');
    const tex = new THREE.CanvasTexture(c);
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // Fenced trailhead car park with a big trail sign and roadside direction signs.
  function buildTrailhead(scene) {
    const q = CC.ImageMap && CC.ImageMap.zones && CC.ImageMap.zones.trailhead;
    if (!q) return;
    const y = CC.heightAt(q.x, q.z);
    const gravel = 0xa79b83;
    paintRect(scene, q.x - q.w * 0.5, q.z - q.h * 0.5,
      q.x + q.w * 0.5, q.z + q.h * 0.5, y + 0.08, gravel);
    for (let i = -2; i <= 2; i++) {
      paintLine(scene, q.x + i * 5.2, q.z - q.h * 0.5 + 1.5,
        q.x + i * 5.2, q.z + q.h * 0.5 - 1.5, y + 0.1, 0xd8d2c0, 0.18);
    }
    const wood = getMat('trailFence', 0xa98052);
    const x0 = q.x - q.w * 0.5, x1 = q.x + q.w * 0.5;
    const z0 = q.z - q.h * 0.5, z1 = q.z + q.h * 0.5;
    fenceRun(scene, x0, z0, x1, z0, y, wood, 1.5, 2.3);
    fenceRun(scene, x0, z0, x0, z1, y, wood, 1.5, 2.3);
    fenceRun(scene, x1, z0, x1, z1, y, wood, 1.5, 2.3);
    // South edge has a central opening onto the trail spur.
    fenceRun(scene, x0, z1, q.x - 3.6, z1, y, wood, 1.5, 2.3);
    fenceRun(scene, q.x + 3.6, z1, x1, z1, y, wood, 1.5, 2.3);

    const sign = new THREE.Group();
    const postMat = getMat('trailPost', 0x7d5b3c);
    [-6.2, 6.2].forEach(function (ox) {
      const post = beamBetween(sign, ox, 0, 0, ox, 6.8, 0, 0.24, postMat);
      post.castShadow = true;
    });
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(14, 7),
      new THREE.MeshLambertMaterial({ map: trailSignTexture(), side: THREE.DoubleSide }));
    panel.position.y = 6.6;
    panel.castShadow = true;
    sign.add(panel);
    sign.add(box(14.4, 0.35, 0.5, postMat, 0, 10.2, 0));
    sign.position.set(q.x, y, z0 + 1.2);
    sign.rotation.y = Math.PI; // face the car park
    scene.add(sign);

    // A small trail map/guide board beside the gate.
    const board = new THREE.Group();
    board.add(cylinder(0.09, 0.11, 2.4, 6, postMat, 0, 1.2, 0));
    board.add(box(2.6, 1.7, 0.14, getMat('trailBoard', 0xe7dfc5), 0, 2.5, 0));
    addShopSign(board, 'TRAIL MAP', 2.3, 0.75, 0x2c6b45, 0xfff4d5, 0, 2.9, 0.09, 0);
    board.position.set(q.x + 8.5, y, z1 - 1.8);
    scene.add(board);

    // Point drivers from the nearest main roads toward the trailhead.
    const candidates = [];
    CC.roadDefs.filter(function (r) { return r.type === 'paved'; }).forEach(function (road) {
      let best = null;
      for (let s = 0; s < road._length; s += 4) {
        const p = CC.sampleRoad(road, s);
        const d = U.distance2D(p.x, p.z, q.x, q.z);
        if (!best || d < best.d) best = { p: p, d: d, width: road.width };
      }
      if (best && best.d > 24 && best.d < 170) candidates.push(best);
    });
    candidates.sort(function (a, b) { return a.d - b.d; });
    candidates.slice(0, 3).forEach(function (c) {
      const p = c.p;
      const dot = (q.x - p.x) * p.dz + (q.z - p.z) * -p.dx;
      const side = dot >= 0 ? 1 : -1;
      const distance = c.width * 0.5 + 3.4;
      const x = p.x + p.dz * side * distance;
      const z = p.z - p.dx * side * distance;
      if (!dry(x, z) || CC.roadClearance(x, z, 0) < 0.8) return;
      addRoadSign(scene, x, z, Math.atan2(-side * p.dz, side * p.dx),
        'NATURE TRAIL', side > 0 ? 'dirLeft' : 'dirRight', 1.6);
      Details.directionSigns++;
    });
    Details.trailhead = true;
  }

  /* ---------- bus stops (CC0 Bus_stop shelter + painted signs) ---------- */
  function buildBusStops(scene) {
    const legs = CC.busRouteLegs ? CC.busRouteLegs() : [];
    const defs = CC.busStopDefs ? CC.busStopDefs() : [];
    Details.busStops.length = 0;
    Details.busStopSigns = 0;
    Details.busStopShelters = 0;
    if (!legs.length || !defs.length) return;
    defs.forEach(function (def) {
      const road = CC.roadDefs[def.road];
      const leg = legs[def.leg];
      if (!road || !leg || !road._length) return;
      const s = U.clamp(def.s, 0, road._length);
      const p = CC.sampleRoad(road, s);
      const tx = p.dx * leg.dir, tz = p.dz * leg.dir;
      const sx = -tz, sz = tx; // same right-side convention as traffic
      const offset = road.width * 0.5 + 4.2;
      const x = p.x + sx * offset, z = p.z + sz * offset;
      if (!dry(x, z) || CC.roadClearance(x, z, 1.6) < 0.5) return;
      const faceYaw = Math.atan2(-sx, -sz);
      if (CC.AssetLoader && CC.AssetLoader.buildProp) {
        const shelter = CC.AssetLoader.buildProp('busStop');
        if (shelter) {
          shelter.position.set(x, CC.heightAt(x, z), z);
          shelter.rotation.y = faceYaw;
          scene.add(shelter);
          Details.busStopShelters++;
        }
      }
      addRoadSign(scene, x + sx * 1.7, z + sz * 1.7, faceYaw,
        'bus stop', 'bus', 1.25);
      Details.busStopSigns++;
      const stop = {
        name: def.name,
        x: x, z: z,
        waitX: x - sx * 1.1, waitZ: z - sz * 1.1,
        yaw: faceYaw,
        roadIndex: def.road, s: s, leg: def.leg,
        waiting: []
      };
      Details.busStops.push(stop);
      if (CC.World && CC.World.obstacles) {
        CC.World.obstacles.push({ x: x, z: z, r: 3.0, type: 'busstop' });
      }
    });
  }

  function buildStreetLamps(scene) {
    CC.roadDefs.filter(function (r) { return r.type === 'paved'; }).forEach(function (road, ri) {
      for (let s = 20; s < road._length - 8; s += 30) {
        const p = CC.sampleRoad(road, s);
        const side = ((Math.floor(s / 30) + ri) % 2) ? 1 : -1;
        const off = road.width * 0.5 + 2.9;
        const x = p.x + p.dz * side * off, z = p.z - p.dx * side * off;
        if (dry(x, z)) addStreetLamp(scene, x, z, Math.atan2(-p.dx, -p.dz));
      }
    });
  }

  /* ---------- telephone poles and power lines ---------- */
  const wirePoints = [];
  const _wireScratch = { dist: 0, t: 0, x: 0, z: 0, dx: 0, dz: 0 };

  // A wire may not cut through a raised deck, its rail, or the swept volume of
  // an opening draw leaf. Checking the whole span (not just its endpoints)
  // stops the long wire between two bank poles from crossing the bridge.
  function wireHitsBridge(a, b, sag, clearance) {
    const segs = CC.bridgeSegments || [];
    if (!segs.length) return false;
    const span = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(8, Math.ceil(span / 4));
    const B = CC.BRIDGE;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = U.lerp(a.x, b.x, t);
      const z = U.lerp(a.z, b.z, t);
      const y = U.lerp(a.y, b.y, t) - Math.sin(t * Math.PI) * (sag || 0);
      for (let k = 0; k < segs.length; k++) {
        const s = segs[k];
        const r = U.distanceToSegment(x, z, s.ax, s.az, s.bx, s.bz, _wireScratch);
        if (r.dist > s.width * 0.5 + 1.6) continue;
        const maxDeck = C.SEA_LEVEL + B.deckHeight + (s.drawbridge ? B.drawLift : 0);
        if (y < maxDeck + (clearance || 1.5)) return true;
      }
    }
    return false;
  }

  function addWire(a, b, sag) {
    if (wireHitsBridge(a, b, sag, 1.5)) {
      Details.bridgeWiresSkipped = (Details.bridgeWiresSkipped || 0) + 1;
      return;
    }
    const steps = 7;
    let prev = a;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const p = {
        x: U.lerp(a.x, b.x, t),
        y: U.lerp(a.y, b.y, t) - Math.sin(t * Math.PI) * sag,
        z: U.lerp(a.z, b.z, t)
      };
      wirePoints.push(prev.x, prev.y, prev.z, p.x, p.y, p.z);
      prev = p;
    }
  }

  function addTelephonePole(scene, x, z) {
    const y = CC.heightAt(x, z);
    const g = markRoadside(new THREE.Group(), 'telephonePole');
    g.add(cylinder(0.18, 0.25, 7.6, 7, getMat('telPole', 0x6f563f), 0, 3.8, 0));
    g.add(box(2.7, 0.15, 0.17, getMat('telCross', 0x7d6247), 0, 7.0, 0));
    [-0.98, 0, 0.98].forEach(function (dx) {
      g.add(cylinder(0.1, 0.1, 0.22, 6, getMat('insulator', 0xcbd6d2), dx, 7.22, 0));
    });
    g.position.set(x, y, z);
    scene.add(g);
    Details.telephonePoles++;
    return [-0.98, 0, 0.98].map(function (dx) {
      return { x: x + dx, y: y + 7.32, z: z };
    });
  }

  function buildTelephonePoles(scene) {
    const paved = CC.roadDefs.filter(function (r) { return r.type === 'paved'; });
    const homes = CC.World.obstacles.filter(function (o) { return o.type === 'home'; });
    const stops = Details.busStops || [];
    Details.telephonePolesSkipped = 0;
    Details.telephonePolesCrossingRoads = 0;
    paved.forEach(function (road, ri) {
      const poles = [];
      const spacing = 58;
      for (let s = 14; s < road._length - 8; s += spacing) {
        const p = CC.sampleRoad(road, s);
        const side = ((Math.floor(s / spacing) + ri) % 2) ? 1 : -1;
        const off = road.width * 0.5 + 7.5;
        const x = p.x + p.dz * side * off, z = p.z - p.dx * side * off;
        if (CC.coast.isWater(x, z) || CC.surfaceAt(x, z) === 'water') continue;
        // A pole offset from one road can still land in the middle of the
        // crossing street at an intersection, or on top of a bus shelter.
        const clear = CC.roadClearance ? CC.roadClearance(x, z, 1.4) : 99;
        const nearStop = stops.some(function (b) {
          return U.distance2D(x, z, b.x, b.z) < 5.5;
        });
        if (clear < 2.2 || nearStop) {
          Details.telephonePolesSkipped++;
          continue;
        }
        if (clear < 0) Details.telephonePolesCrossingRoads++;
        poles.push(addTelephonePole(scene, x, z));
      }
      for (let i = 1; i < poles.length; i++) {
        for (let k = 0; k < 3; k++) addWire(poles[i - 1][k], poles[i][k], 0.65);
      }
      poles.forEach(function (tops) {
        let best = null, bestD = 24;
        homes.forEach(function (h) {
          const d = U.distance2D(tops[1].x, tops[1].z, h.x, h.z);
          if (d < bestD) { bestD = d; best = h; }
        });
        if (best) {
          addWire(tops[1], { x: best.x, y: CC.heightAt(best.x, best.z) + 3.6, z: best.z }, 1.1);
        }
      });
    });
    if (wirePoints.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(wirePoints, 3));
      scene.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x2b3033 })));
    }
    // Last-pass safety net for any pole whose base still touches the asphalt.
    if (CC.roadClearance) {
      const placed = [];
      scene.traverse(function (o) { if (o.name === 'telephonePole') placed.push(o); });
      placed.forEach(function (g) {
        if (CC.roadClearance(g.position.x, g.position.z, 0.3) < 0) {
          Details.telephonePolesCrossingRoads++;
          if (g.parent) g.parent.remove(g);
        }
      });
    }
  }

  /* ---------- painted sports surfaces ---------- */
  function paintRect(scene, x0, z0, x1, z1, y, color) {
    const b = buffer();
    quad(b, [x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]);
    commitBuffer(scene, b, color);
  }
  function paintLine(scene, x0, z0, x1, z1, y, color, thick) {
    const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len * thick * 0.5, nz = dx / len * thick * 0.5;
    const b = buffer();
    quad(b, [x0 + nx, y, z0 + nz], [x1 + nx, y, z1 + nz],
      [x1 - nx, y, z1 - nz], [x0 - nx, y, z0 - nz]);
    commitBuffer(scene, b, color);
  }
  function paintCircle(scene, cx, cz, r, y, color, segments) {
    const b = buffer(), n = segments || 32;
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2, a2 = (i + 1) / n * Math.PI * 2;
      quad(b, [cx, y, cz], [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r],
        [cx + Math.cos(a2) * r, y, cz + Math.sin(a2) * r], [cx, y, cz]);
    }
    commitBuffer(scene, b, color);
  }
  function paintArc(scene, cx, cz, r, y, color, thick, a0, a1) {
    const steps = Math.max(4, Math.ceil(Math.abs(a1 - a0) * 12));
    for (let i = 0; i < steps; i++) {
      const t0 = a0 + (a1 - a0) * i / steps, t1 = a0 + (a1 - a0) * (i + 1) / steps;
      paintLine(scene, cx + Math.cos(t0) * r, cz + Math.sin(t0) * r,
        cx + Math.cos(t1) * r, cz + Math.sin(t1) * r, y, color, thick);
    }
  }
  function fenceRun(group, ax, az, bx, bz, baseY, material, height, spacing) {
    const len = Math.hypot(bx - ax, bz - az) || 1;
    const yaw = Math.atan2(-(bz - az), bx - ax);
    const n = Math.max(1, Math.floor(len / (spacing || 2.4)));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      group.add(box(0.16, height, 0.16, material,
        U.lerp(ax, bx, t), baseY + height * 0.5, U.lerp(az, bz, t)));
    }
    [height * 0.42, height * 0.82].forEach(function (ry) {
      const rail = box(len, 0.12, 0.1, material, (ax + bx) * 0.5, baseY + ry, (az + bz) * 0.5);
      rail.rotation.y = yaw;
      group.add(rail);
    });
  }

  // Last-pass safety net: any ordinary fence mesh whose world footprint lands
  // on a road or its paved shoulder is removed. Instanced home fences already
  // filter each rail while it is generated, so they are skipped here.
  const fenceBounds = new THREE.Box3();
  function auditFenceClearance(scene) {
    let removed = 0;
    if (!CC.roadClearance) return removed;
    scene.updateMatrixWorld(true);
    const fences = [];
    scene.traverse(function (mesh) {
      if (!mesh.isMesh || mesh.isInstancedMesh || !mesh.geometry) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const named = materials.some(function (m) { return /fence/i.test((m && m.name) || ''); });
      if (named) fences.push(mesh);
    });
    for (let f = 0; f < fences.length; f++) {
      const mesh = fences[f];
      fenceBounds.setFromObject(mesh);
      if (fenceBounds.isEmpty()) continue;
      const min = fenceBounds.min, max = fenceBounds.max;
      let crossing = false;
      for (let ix = 0; ix <= 2 && !crossing; ix++) {
        for (let iz = 0; iz <= 2 && !crossing; iz++) {
          const x = U.lerp(min.x, max.x, ix * 0.5);
          const z = U.lerp(min.z, max.z, iz * 0.5);
          if (CC.roadClearance(x, z, 0.05) < 0) crossing = true;
        }
      }
      if (crossing && mesh.parent) {
        mesh.parent.remove(mesh);
        removed++;
      }
    }
    return removed;
  }

  // Same last-pass net for traffic-light masts, street lamps and utility poles.
  // Check the BASE of each tagged prop, not its arm or sign head: lights are
  // supposed to hang over the road, but their posts must stand beside it.
  const poleWorld = new THREE.Vector3();
  function auditPoleClearance(scene) {
    let removed = 0;
    if (!CC.roadClearance) return removed;
    scene.updateMatrixWorld(true);
    const poles = [];
    scene.traverse(function (o) {
      let root = null;
      if (o.userData && o.userData.roadside) {
        root = o;
      } else if (o.isMesh && o.parent === scene) {
        const m = Array.isArray(o.material) ? o.material[0] : o.material;
        const name = (m && m.name) || '';
        if (/pole|lamp|tel/i.test(name) && !/lightBox|lampGlow|clubNeon|visor/i.test(name)) root = o;
      }
      if (root && poles.indexOf(root) === -1) poles.push(root);
    });
    for (let i = 0; i < poles.length; i++) {
      const g = poles[i];
      g.getWorldPosition(poleWorld);
      if (CC.roadClearance(poleWorld.x, poleWorld.z, 0.3) >= 0) continue;
      const kind = (g.userData && g.userData.roadsideKind) || '';
      if (kind === 'telephonePole' && Details.telephonePoles > 0) Details.telephonePoles--;
      if (kind === 'streetLamp' && Details.streetLamps > 0) Details.streetLamps--;
      if (g.parent) g.parent.remove(g);
      removed++;
    }
    return removed;
  }

  /* ---------- community park ---------- */
  function buildPark(scene) {
    const q = CC.ImageMap && CC.ImageMap.zones && CC.ImageMap.zones.park;
    if (!q) return;
    const y = CC.heightAt(q.x, q.z);
    const g = new THREE.Group();
    g.position.set(q.x, y, q.z);
    const P = function (lx, lz) { return [q.x + lx, q.z + lz]; };
    const white = 0xf2f0e6;
    const wood = getMat('parkWood', 0xb08a5c);
    const metal = getMat('parkMetal', 0x8f9799);

    // Walking paths and the park lawn.
    paintRect(scene, q.x - q.w * 0.5 + 3, q.z + 3, q.x + q.w * 0.5 - 3, q.z + 9, y + 0.05, 0xb9aa81);
    paintRect(scene, q.x - 3, q.z - q.h * 0.5 + 3, q.x + 3, q.z + q.h * 0.5 - 3, y + 0.05, 0xb9aa81);

    // ---- baseball / softball diamond ----
    const bx = -39, bz = -20;
    paintCircle(scene, q.x + bx + 10, q.z + bz, 22, y + 0.06, 0x6ea35a, 40);
    paintCircle(scene, q.x + bx + 10, q.z + bz, 10.5, y + 0.07, 0xb07a4e, 28);
    paintLine(scene, q.x + bx, q.z + bz, q.x + bx + 10, q.z + bz - 10, y + 0.09, white, 0.35);
    paintLine(scene, q.x + bx + 10, q.z + bz - 10, q.x + bx + 20, q.z + bz, y + 0.09, white, 0.35);
    paintLine(scene, q.x + bx + 20, q.z + bz, q.x + bx + 10, q.z + bz + 10, y + 0.09, white, 0.35);
    paintLine(scene, q.x + bx + 10, q.z + bz + 10, q.x + bx, q.z + bz, y + 0.09, white, 0.35);
    paintArc(scene, q.x + bx + 10, q.z + bz, 4.5, y + 0.09, white, 0.3, -1.15, 1.15);
    [[bx, bz], [bx + 10, bz - 10], [bx + 20, bz], [bx + 10, bz + 10]].forEach(function (p, i) {
      const base = box(i === 0 ? 0.9 : 1.1, 0.14, i === 0 ? 0.7 : 1.1, getMat('baseWhite', white),
        p[0], 0.13, p[1]);
      g.add(base);
    });
    g.add(cylinder(1.1, 1.3, 0.18, 12, getMat('mound', 0xb07a4e), bx + 10, 0.09, bz));
    // Backstop and dugouts.
    fenceRun(g, bx - 5, bz - 8, bx - 5, bz + 8, 0, metal, 3.4, 2.2);
    fenceRun(g, bx - 5, bz - 8, bx + 1, bz - 8, 0, metal, 3.4, 2.2);
    fenceRun(g, bx - 5, bz + 8, bx + 1, bz + 8, 0, metal, 3.4, 2.2);
    [-8, 8].forEach(function (off) {
      g.add(box(5, 2.3, 3, getMat('dugout', 0xa8a49a), bx - 1, 1.15, bz + off));
      g.add(box(5.6, 0.25, 3.6, metal, bx - 1, 2.45, bz + off));
    });
    for (let r = 0; r < 3; r++) {
      g.add(box(8, 0.28, 0.7, wood, bx - 9 - r * 0.8, 0.4 + r * 0.42, bz));
    }

    // ---- soccer pitch ----
    const sx = 25, sz = -18;
    paintRect(scene, q.x + sx - 24, q.z + sz - 15, q.x + sx + 24, q.z + sz + 15, y + 0.06, 0x669c55);
    [[sx - 24, sz - 15, sx + 24, sz - 15], [sx - 24, sz + 15, sx + 24, sz + 15],
     [sx - 24, sz - 15, sx - 24, sz + 15], [sx + 24, sz - 15, sx + 24, sz + 15],
     [sx - 24, sz, sx + 24, sz]].forEach(function (l) {
      paintLine(scene, q.x + l[0], q.z + l[1], q.x + l[2], q.z + l[3], y + 0.08, white, 0.3);
    });
    paintArc(scene, q.x + sx, q.z + sz, 5, y + 0.08, white, 0.3, 0, Math.PI * 2);
    [-1, 1].forEach(function (side) {
      const gx = sx + side * 24;
      paintRect(scene, q.x + gx - side * 6, q.z + sz - 7, q.x + gx, q.z + sz + 7, y + 0.07, 0xb4b0a4);
      [-4, 4].forEach(function (oz) { g.add(cylinder(0.12, 0.12, 3, 6, getMat('goalPost', white), gx, 1.5, sz + oz)); });
      g.add(cylinder(0.12, 0.12, 8, 6, getMat('goalPost', white), gx, 1.5, sz));
    });

    // ---- basketball court ----
    const kx = -30, kz = 25;
    paintRect(scene, q.x + kx - 15, q.z + kz - 9, q.x + kx + 15, q.z + kz + 9, y + 0.06, 0x565b5c);
    [[kx - 15, kz - 9, kx + 15, kz - 9], [kx - 15, kz + 9, kx + 15, kz + 9],
     [kx - 15, kz - 9, kx - 15, kz + 9], [kx + 15, kz - 9, kx + 15, kz + 9],
     [kx, kz - 9, kx, kz + 9]].forEach(function (l) {
      paintLine(scene, q.x + l[0], q.z + l[1], q.x + l[2], q.z + l[3], y + 0.08, white, 0.28);
    });
    paintArc(scene, q.x + kx, q.z + kz, 3, y + 0.08, white, 0.28, 0, Math.PI * 2);
    [-1, 1].forEach(function (side) {
      const hx = kx + side * 13;
      g.add(cylinder(0.16, 0.2, 3.6, 8, metal, hx, 1.8, kz));
      g.add(box(0.2, 1.2, 1.9, getMat('backboard', 0xe9edf0), hx - side * 0.5, 3.4, kz));
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.07, 6, 14), getMat('rim', 0xd9672f));
      rim.rotation.x = -Math.PI / 2;
      rim.position.set(hx - side * 1.3, 3.05, kz);
      g.add(rim);
    });

    // ---- two tennis courts ----
    // Shifted slightly west to leave room for the skate park along the east edge.
    [-6, 6].forEach(function (off) {
      const tx = 16 + off, tz = 26;
      paintRect(scene, q.x + tx - 5.5, q.z + tz - 11, q.x + tx + 5.5, q.z + tz + 11, y + 0.06, 0x3f7f8c);
      [[tx - 5, tz - 10, tx + 5, tz - 10], [tx - 5, tz + 10, tx + 5, tz + 10],
       [tx - 5, tz - 10, tx - 5, tz + 10], [tx + 5, tz - 10, tx + 5, tz + 10],
       [tx - 5, tz, tx + 5, tz]].forEach(function (l) {
        paintLine(scene, q.x + l[0], q.z + l[1], q.x + l[2], q.z + l[3], y + 0.08, white, 0.18);
      });
      g.add(cylinder(0.09, 0.09, 1.2, 6, metal, tx - 5.7, 0.6, tz));
      g.add(cylinder(0.09, 0.09, 1.2, 6, metal, tx + 5.7, 0.6, tz));
      const net = new THREE.Mesh(new THREE.PlaneGeometry(11.4, 1),
        new THREE.MeshLambertMaterial({ color: 0xdedede, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
      net.position.set(tx, 0.55, tz);
      g.add(net);
    });

    // ---- jungle gym / playground ----
    const jx = -4, jz = 39;
    paintRect(scene, q.x + jx - 9, q.z + jz - 7, q.x + jx + 9, q.z + jz + 7,
      y + 0.055, 0xc98c61);
    const playMetal = getMat('playMetal', 0xd1543f);
    const playDeck = getMat('playDeck', 0xe0b36b);
    const ladderWood = getMat('ladderWood', 0xa97845);
    const slideMat = getMat('slide', 0xd8703f);
    const swingSeat = getMat('swingSeat', 0xc45d3f);
    // Four corner posts, two raised decks and a connecting bridge.
    [[-7, -4], [-1, -4], [-7, 2], [-1, 2]].forEach(function (p) {
      g.add(cylinder(0.12, 0.14, 4.8, 6, playMetal, jx + p[0], 2.4, jz + p[1]));
    });
    g.add(box(6.6, 0.22, 4.2, playDeck, jx - 4, 2.5, jz - 1));
    g.add(box(5.2, 0.22, 3.6, playDeck, jx + 2, 3.9, jz + 0.5));
    g.add(box(3.2, 0.18, 1.1, playMetal, jx + 1.1, 3.75, jz - 0.8));
    // Ladders and rungs up to each deck.
    [-5.2, -2.8].forEach(function (x) {
      g.add(cylinder(0.07, 0.07, 2.6, 5, playMetal, jx + x, 1.3, jz - 4.1));
    });
    for (let i = 0; i < 6; i++) {
      g.add(box(2.6, 0.1, 0.1, ladderWood, jx - 4, 0.45 + i * 0.42, jz - 4.1));
    }
    [-0.2, 1.8].forEach(function (x) {
      g.add(cylinder(0.07, 0.07, 4.1, 5, playMetal, jx + x, 2.05, jz - 1.3));
    });
    for (let i = 0; i < 8; i++) {
      g.add(box(2.2, 0.1, 0.1, ladderWood, jx + 0.8, 0.5 + i * 0.45, jz - 1.3));
    }
    // Monkey bars, climbing wall and two slides.
    [-3.2, 0.2].forEach(function (x) {
      g.add(cylinder(0.09, 0.09, 3.8, 5, playMetal, jx + x, 1.9, jz + 4.2));
    });
    g.add(box(3.8, 0.14, 0.14, playMetal, jx - 1.5, 3.75, jz + 4.2));
    for (let i = 0; i < 5; i++) {
      g.add(box(0.14, 0.55, 0.14, playMetal, jx - 3.1 + i * 0.8, 3.45, jz + 4.2));
    }
    const climb = box(2.8, 2.6, 0.18, getMat('climbWall', 0x5fa0a8), jx - 4, 1.3, jz + 3.9);
    climb.rotation.x = -0.28;
    g.add(climb);
    for (let i = 0; i < 8; i++) {
      g.add(box(0.4, 0.16, 0.22, playMetal,
        jx - 5 + (i % 4) * 0.65, 0.7 + Math.floor(i / 4) * 1.1, jz + 4.1));
    }
    const slideA = box(1.5, 0.18, 5.2, slideMat, jx - 4, 1.35, jz - 5.4);
    slideA.rotation.x = -0.42;
    g.add(slideA);
    const slideB = box(1.4, 0.18, 4.6, getMat('slideBlue', 0x4f93c4), jx + 3.4, 2.0, jz + 4.4);
    slideB.rotation.x = 0.38;
    g.add(slideB);
    // Swing frame and tyre swing complete the playground.
    [-6.5, -2.5].forEach(function (x) {
      g.add(cylinder(0.09, 0.11, 3.2, 6, metal, jx + x, 1.6, jz + 5.8));
    });
    g.add(box(4.4, 0.14, 0.14, metal, jx - 4.5, 3.2, jz + 5.8));
    [-5.6, -3.4].forEach(function (x) {
      g.add(box(0.05, 1.6, 0.05, metal, jx + x, 2.4, jz + 5.8));
      g.add(box(0.9, 0.1, 0.35, swingSeat, jx + x, 1.6, jz + 5.8));
    });
    Details.parkJungleGym = true;

    // ---- skate park ----
    const skx = 38, skz = 26;
    paintRect(scene, q.x + skx - 10, q.z + skz - 10, q.x + skx + 10, q.z + skz + 10,
      y + 0.055, 0x6a7075);
    const skateMetal = getMat('skateMetal', 0x9aa3a8);
    const skateCoping = getMat('skateCoping', 0xd6dde0);
    const rampMat = getMat('skateRamp', 0x8a9296);
    [[-9, 0], [9, 0], [0, -9], [0, 9]].forEach(function (p, i) {
      const wall = box(i < 2 ? 0.4 : 19, 1.1, i < 2 ? 19 : 0.4,
        getMat('skateWall', 0x555d62), skx + p[0], 0.55, skz + p[1]);
      g.add(wall);
    });
    // Quarter pipes on two ends and a central funbox with a rail.
    [-6.4, 6.4].forEach(function (off) {
      const ramp = box(10, 0.3, 4.4, rampMat, skx, 1.1, skz + off);
      ramp.rotation.x = off < 0 ? -0.42 : 0.42;
      g.add(ramp);
      g.add(cylinder(0.16, 0.16, 10, 8, skateCoping, skx, 2.0, skz + off * 0.62)
        .rotateZ(Math.PI / 2));
    });
    [-5.6, 5.6].forEach(function (off) {
      const ramp = box(4.4, 0.3, 8, rampMat, skx + off, 1.1, skz);
      ramp.rotation.z = off < 0 ? 0.42 : -0.42;
      g.add(ramp);
    });
    g.add(box(4.4, 1.3, 3.4, rampMat, skx, 0.65, skz));
    const railTop = cylinder(0.09, 0.09, 4.6, 6, skateMetal, skx, 1.5, skz + 2.4);
    railTop.rotation.z = Math.PI / 2;
    g.add(railTop);
    [-2, 2].forEach(function (x) {
      g.add(cylinder(0.06, 0.06, 1.5, 5, skateMetal, skx + x, 0.75, skz + 2.4));
    });
    addShopSign(g, 'SKATE PARK', 8, 1.7, 0x23333a, 0xffd166, skx, 2.6, skz - 9.5, 0);
    Details.parkSkatePark = true;

    // A second, compact skateboard park sits beside the ball fields so players
    // walking the diamond can hop straight onto a quarter pipe or grind rail.
    const s2x = -12, s2z = -38;
    paintRect(scene, q.x + s2x - 6, q.z + s2z - 6, q.x + s2x + 6, q.z + s2z + 6,
      y + 0.055, 0x70787d);
    const s2Ramp = box(7, 0.26, 3.2, rampMat, s2x, 0.95, s2z - 2.4);
    s2Ramp.rotation.x = -0.4; g.add(s2Ramp);
    g.add(cylinder(0.13, 0.13, 7, 8, skateCoping, s2x, 1.7, s2z - 3.1).rotateZ(Math.PI / 2));
    g.add(box(3.4, 0.9, 2.2, rampMat, s2x + 1.2, 0.45, s2z + 2.1));
    const s2Rail = cylinder(0.08, 0.08, 4.2, 6, skateMetal, s2x + 1.2, 1.25, s2z + 3.1);
    s2Rail.rotation.z = Math.PI / 2; g.add(s2Rail);
    [-1, 3.4].forEach(function (lx) {
      g.add(cylinder(0.06, 0.06, 1.25, 5, skateMetal, s2x + lx, 0.62, s2z + 3.1));
    });
    addShopSign(g, 'SKATEBOARD PARK', 7.6, 1.5, 0x23333a, 0xffd166, s2x, 2.4, s2z - 5.2, 0);
    Details.parkSkateboardPark = true;

    // Park entrance sign, benches, bins and lamps.
    g.add(cylinder(0.14, 0.18, 3, 6, metal, -52, 1.5, 0));
    g.add(cylinder(0.14, 0.18, 3, 6, metal, -52, 1.5, 4));
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(7, 2),
      new THREE.MeshLambertMaterial({ map: signFaceTexture('HARBOR PARK', 'plain'), side: THREE.DoubleSide }));
    sign.position.set(-52, 3.6, 2);
    sign.rotation.y = -Math.PI / 2;
    g.add(sign);
    for (let i = 0; i < 6; i++) {
      const p = P(U.randRange(rng, -46, 46), U.randRange(rng, -40, 24));
      g.add(box(2.2, 0.16, 0.6, wood, p[0] - q.x, 0.55, p[1] - q.z));
      g.add(box(2.2, 0.7, 0.14, wood, p[0] - q.x, 0.95, p[1] - q.z - 0.25));
    }
    [[-48, -40], [46, -38], [-46, 36], [44, 38]].forEach(function (p) {
      g.add(cylinder(0.12, 0.16, 5, 6, metal, p[0], 2.5, p[1]));
      g.add(box(0.9, 0.22, 0.5, getMat('parkLamp', 0xfff0c0), p[0], 5.05, p[1]));
    });

    // A ring of shade trees just inside the boundary. Keep them off every
    // court, playground and skate surface so facilities stay clear.
    const playAreas = [
      [-45, 16, -15, 34],       // basketball
      [4.5, 15, 15.5, 37],      // tennis (west)
      [16.5, 15, 27.5, 37],     // tennis (east)
      [-13, 32, 5, 46],         // jungle gym / playground
      [28, 16, 48, 36]          // skate park
    ];
    const clearOfPlay = function (x, z, pad) {
      if (Math.hypot(x + 29, z + 20) < 24 + pad) return false; // baseball
      if (x > 1 - pad && x < 49 + pad && z > -33 - pad && z < -3 + pad) return false; // soccer
      return !playAreas.some(function (r) {
        return x > r[0] - pad && x < r[2] + pad && z > r[1] - pad && z < r[3] + pad;
      });
    };
    const treeSpots = [];
    for (let i = 0; i < 34; i++) {
      const a = i / 34 * Math.PI * 2;
      const tx = Math.cos(a) * (q.w * 0.5 - 4);
      const tz = Math.sin(a) * (q.h * 0.5 - 4);
      if (clearOfPlay(tx, tz, 1.5)) treeSpots.push([tx, tz]);
    }
    const dummy = new THREE.Object3D();
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.3, 2.4, 5),
      getMat('extraTrunk', C.COLORS.trunk), treeSpots.length);
    const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(2.2, 0),
      getMat('parkCrown', 0x568f4b), treeSpots.length);
    treeSpots.forEach(function (p, i) {
      const s = U.randRange(rng, 0.85, 1.3);
      dummy.position.set(p[0], 1.2 * s, p[1]); dummy.rotation.set(0, rng() * 6.28, 0); dummy.scale.setScalar(s);
      dummy.updateMatrix(); trunk.setMatrixAt(i, dummy.matrix);
      dummy.position.set(p[0], 3.9 * s, p[1]); dummy.updateMatrix(); crown.setMatrixAt(i, dummy.matrix);
    });
    g.add(trunk); g.add(crown);

    scene.add(g);
    Details.park = true;
    Details.parkFields = 6;
  }

  /* ---------- small farm ---------- */
  const _farmGeoCache = {};
  function farmModel(name, opts) {
    const data = CC.FarmBuildingsData && CC.FarmBuildingsData[name];
    if (!data) return null;
    if (!_farmGeoCache[name]) {
      const b64ToU8 = function (b64) {
        const bin = atob(b64); const u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        return u8;
      };
      const p = new Int16Array(b64ToU8(data.p).buffer);
      const n = new Int16Array(b64ToU8(data.n).buffer);
      const c = b64ToU8(data.c);
      const pos = new Float32Array(p.length);
      const nrm = new Float32Array(n.length);
      const col = new Float32Array(c.length);
      for (let i = 0; i < p.length; i++) pos[i] = p[i] / 1000;
      for (let i = 0; i < n.length; i++) nrm[i] = n[i] / 1000;
      for (let i = 0; i < c.length; i++) col[i] = c[i] / 255;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.computeBoundingBox();
      _farmGeoCache[name] = geo;
    }
    const geo = _farmGeoCache[name];
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const mesh = new THREE.Mesh(geo, mat);
    const bb = geo.boundingBox;
    const size = new THREE.Vector3(); bb.getSize(size);
    const target = (opts && opts.height) ? opts.height : (size.y || 1);
    const s = target / (size.y || 1);
    mesh.scale.setScalar(s);
    if (opts && opts.yaw) mesh.rotation.y = opts.yaw;
    mesh.position.set((opts && opts.x) || 0, (opts && opts.y) || 0, (opts && opts.z) || 0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  function buildFarm(scene) {
    const q = CC.ImageMap && CC.ImageMap.zones && CC.ImageMap.zones.farm;
    if (!q) return;
    const y = CC.heightAt(q.x, q.z);
    const g = new THREE.Group();
    g.position.set(q.x, y, q.z);
    const fenceMat = getMat('farmFence', 0xe6e1d2);
    const red = getMat('barnRed', 0xa63d31);
    const trim = getMat('farmTrim', 0xf0ead8);
    const roofMat = getMat('barnRoof', 0x5a514a);

    // Perimeter fence with a gate on the south side.
    const hx = q.w * 0.5 - 2, hz = q.h * 0.5 - 2;
    fenceRun(g, -hx, -hz, hx, -hz, 0, fenceMat, 1.7, 2.6);
    fenceRun(g, -hx, hz, hx, hz, 0, fenceMat, 1.7, 2.6);
    fenceRun(g, -hx, -hz, -hx, hz, 0, fenceMat, 1.7, 2.6);
    fenceRun(g, hx, -hz, hx, hz, 0, fenceMat, 1.7, 2.6);
    // A second fence around the animal pen.
    fenceRun(g, -38, -6, -4, -6, 0, fenceMat, 1.3, 2.4);
    fenceRun(g, -38, 14, -4, 14, 0, fenceMat, 1.3, 2.4);
    fenceRun(g, -38, -6, -38, 14, 0, fenceMat, 1.3, 2.4);
    fenceRun(g, -4, -6, -4, 14, 0, fenceMat, 1.3, 2.4);

    // Quaternius farm buildings replace procedural barn/silo/house where available.
    const barnM = farmModel('BigBarn', { height: 14, x: -19, z: -21, yaw: Math.PI });
    if (barnM) g.add(barnM);
    else {
      const barn = new THREE.Group();
      barn.position.set(-19, 0, -21);
      barn.add(box(24, 8.5, 16, red, 0, 4.25, 0));
      [-1, 1].forEach(function (s) {
        const slope = box(13.6, 0.6, 17, roofMat, s * 6.6, 10.4, 0);
        slope.rotation.z = s * 0.62;
        barn.add(slope);
      });
      barn.add(box(12, 0.5, 17.2, roofMat, 0, 12.9, 0));
      g.add(barn);
    }

    const siloM = farmModel('Silo', { height: 15, x: -1, z: -23, yaw: 0 });
    if (siloM) g.add(siloM);
    else {
      g.add(cylinder(3.2, 3.2, 15, 12, getMat('silo', 0xc9c6bb), -1, 7.5, -23));
    }
    const houseM = farmModel('Silo_House', { height: 9, x: 24, z: -23, yaw: Math.PI });
    if (houseM) g.add(houseM);
    else {
      const house = new THREE.Group();
      house.position.set(24, 0, -23);
      house.add(box(16, 6.5, 12, getMat('farmHouse', 0xe7dcc2), 0, 3.25, 0));
      g.add(house);
    }
    const coop = farmModel('ChickenCoop', { height: 4.2, x: -42, z: -18, yaw: Math.PI / 2 });
    if (coop) g.add(coop);
    const well = farmModel('Well', { height: 3.2, x: 34, z: -10, yaw: 0 });
    if (well) g.add(well);
    const openBarn = farmModel('OpenBarn', { height: 8, x: 40, z: 4, yaw: -Math.PI / 2 });
    if (openBarn) g.add(openBarn);

    // Tractor, hay bales and a water trough.
    const green = getMat('tractorGreen', 0x3f7a3a);
    const tyre = getMat('tyre', 0x27292a);
    const tractor = new THREE.Group();
    tractor.position.set(8, 0, -5);
    tractor.add(box(3.2, 1.4, 5, green, 0, 1.3, 0));
    tractor.add(box(1.6, 1.2, 1.8, green, 0, 2.4, -1.2));
    tractor.add(box(1.8, 0.2, 1.6, tyre, 0, 2.9, -1.2));
    tractor.add(cylinder(0.12, 0.12, 1.4, 6, tyre, 0.7, 2.7, -1.8));
    [[-1.5, 1.5], [1.5, 1.5]].forEach(function (p) {
      const wheel = cylinder(1.25, 1.25, 0.45, 12, tyre, p[0], 1.25, p[1]);
      wheel.rotation.z = Math.PI / 2; tractor.add(wheel);
    });
    [[-1.25, -1.7], [1.25, -1.7]].forEach(function (p) {
      const wheel = cylinder(0.8, 0.8, 0.35, 12, tyre, p[0], 0.8, p[1]);
      wheel.rotation.z = Math.PI / 2; tractor.add(wheel);
    });
    g.add(tractor);
    const hay = getMat('hay', 0xd8b95e);
    [[-30, 3], [-27.5, 3.5], [-29, 5.5], [36, -10]].forEach(function (p) {
      const bale = cylinder(0.9, 0.9, 1.5, 10, hay, p[0], 0.9, p[1]);
      bale.rotation.z = Math.PI / 2; g.add(bale);
    });
    g.add(box(4, 0.9, 1.6, getMat('trough', 0x8d9092), -6, 0.45, 10));

    // Crop fields with painted furrows and instanced plants.
    const fields = [
      { x0: -48, x1: -18, color: 0x6a9a3f, row: 0xb28b52, kind: 'corn' },
      { x0: -14, x1: 16, color: 0xc6a94f, row: 0xa4803f, kind: 'wheat' },
      { x0: 20, x1: 48, color: 0x4e8c48, row: 0x8d7550, kind: 'soy' }
    ];
    const dummy = new THREE.Object3D();
    fields.forEach(function (f) {
      paintRect(scene, q.x + f.x0, q.z + 24, q.x + f.x1, q.z + 48, y + 0.05, f.row);
      for (let x = f.x0 + 2; x < f.x1 - 1; x += 2.6) {
        paintLine(scene, q.x + x, q.z + 25, q.x + x, q.z + 47, y + 0.06, 0x7a5c3a, 0.5);
      }
      const spots = [];
      for (let x = f.x0 + 1.5; x < f.x1 - 1; x += 2.6) {
        for (let z = 25.5; z < 47; z += 2.2) spots.push([x, z]);
      }
      const geo = f.kind === 'wheat' ? new THREE.ConeGeometry(0.28, 1.5, 4) :
        new THREE.ConeGeometry(0.42, f.kind === 'corn' ? 2.2 : 1.1, 5);
      const mesh = new THREE.InstancedMesh(geo, getMat('crop' + f.kind, f.color), spots.length);
      const col = new THREE.Color();
      spots.forEach(function (p, i) {
        dummy.position.set(p[0], f.kind === 'corn' ? 1.1 : 0.7, p[1]);
        dummy.rotation.set((rng() - 0.5) * 0.12, rng() * 6.28, (rng() - 0.5) * 0.12);
        dummy.scale.setScalar(U.randRange(rng, 0.85, 1.15));
        dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
        col.setHex(f.color); col.offsetHSL(0, 0, (rng() - 0.5) * 0.12);
        mesh.setColorAt(i, col);
      });
      mesh.castShadow = false; g.add(mesh);
    });

    // Farm animals.
    function animal(kind, x, z) {
      const a = new THREE.Group();
      const bodyColor = {
        cow: 0xf2efe6, sheep: 0xe8e4d8, pig: 0xe6a6a0,
        chicken: 0xf6f2e8, horse: 0x8b5e3c, goat: 0xd9d2bf
      }[kind];
      const body = box(kind === 'chicken' ? 0.9 : 1.9, kind === 'chicken' ? 0.8 : 1.2,
        kind === 'chicken' ? 1.1 : 1.0, getMat('animal' + kind, bodyColor), 0, 0.95, 0);
      a.add(body);
      if (kind === 'cow') {
        [[-0.6, 0.35], [0.6, -0.3]].forEach(function (p) {
          a.add(box(0.6, 0.5, 1.02, getMat('cowSpot', 0x2d2b29), p[0], 1.05, p[1]));
        });
      }
      const head = box(0.8, 0.75, 0.8, getMat('animal' + kind, bodyColor), 0, kind === 'chicken' ? 1.65 : 1.5, 0.9);
      a.add(head);
      a.add(box(0.45, 0.16, 0.3, getMat('snout', kind === 'pig' ? 0xd88f88 : 0xc9b8a0), 0, 1.35, 1.35));
      [-0.3, 0.3].forEach(function (hx) {
        [-0.35, 0.35].forEach(function (hz) {
          a.add(box(0.18, kind === 'chicken' ? 0.45 : 0.8, 0.18,
            getMat('hoof', 0x4a4238), hx, kind === 'chicken' ? 0.25 : 0.4, hz));
        });
      });
      if (kind === 'chicken') {
        a.add(new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.4, 4), getMat('beak', 0xe8a13c)));
        a.children[a.children.length - 1].position.set(0, 1.6, 1.35);
        a.children[a.children.length - 1].rotation.x = Math.PI / 2;
      }
      a.position.set(x, 0, z);
      a.rotation.y = rng() * Math.PI * 2;
      a.userData.baseY = 0;
      a.userData.phase = rng() * 6.28;
      g.add(a);
      Details.farmAnimals.push(a);
    }
    for (let i = 0; i < 5; i++) animal('cow', U.randRange(rng, -35, -8), U.randRange(rng, -3, 11));
    for (let i = 0; i < 4; i++) animal('sheep', U.randRange(rng, -35, -8), U.randRange(rng, -3, 11));
    for (let i = 0; i < 3; i++) animal('pig', U.randRange(rng, -35, -8), U.randRange(rng, -3, 11));
    for (let i = 0; i < 6; i++) animal('chicken', U.randRange(rng, -35, -8), U.randRange(rng, -3, 11));
    animal('horse', 12, -5);
    animal('goat', 30, -8);

    // Windmill and farm sign.
    const windM = farmModel('Windmill', { height: 14, x: 42, z: -40, yaw: 0 });
    if (windM) {
      g.add(windM);
      Details.windmillBlades = null; // Quaternius windmill is static; no separate blade hub.
    } else {
      const tower = getMat('windmill', 0xbfc3c2);
      g.add(cylinder(0.9, 1.7, 13, 8, tower, 42, 6.5, -40));
      const hub = new THREE.Group();
      hub.position.set(42, 13.4, -39.2);
      for (let i = 0; i < 8; i++) {
        const blade = box(0.35, 3.4, 0.12, trim, 0, 1.9, 0);
        const arm = new THREE.Group();
        arm.rotation.z = i / 8 * Math.PI * 2;
        arm.add(blade); hub.add(arm);
      }
      g.add(hub);
      Details.windmillBlades = hub;
    }
    g.add(cylinder(0.12, 0.16, 3, 6, fenceMat, -50, 1.5, 0));
    g.add(cylinder(0.12, 0.16, 3, 6, fenceMat, -50, 1.5, 4));
    const farmSign = new THREE.Mesh(new THREE.PlaneGeometry(7, 2),
      new THREE.MeshLambertMaterial({ map: signFaceTexture('PINEY ACRE FARM', 'plain'), side: THREE.DoubleSide }));
    farmSign.position.set(-50, 3.6, 2);
    farmSign.rotation.y = -Math.PI / 2;
    g.add(farmSign);

    scene.add(g);
    Details.farm = true;
    Details.cropRows = fields.length;
  }

  /* ---------- coastal entertainment district ---------- */
  const shopTexCache = {};
  function cssHex(n) { return '#' + ('000000' + n.toString(16)).slice(-6); }
  function shopTexture(text, bg, fg) {
    const key = text + '|' + bg + '|' + fg;
    if (shopTexCache[key]) return shopTexCache[key];
    const c = document.createElement('canvas');
    c.width = 512; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = cssHex(bg); g.fillRect(0, 0, 512, 128);
    g.strokeStyle = cssHex(fg); g.lineWidth = 9; g.strokeRect(7, 7, 498, 114);
    g.fillStyle = cssHex(fg); g.textAlign = 'center'; g.textBaseline = 'middle';
    const size = text.length > 18 ? 40 : text.length > 12 ? 52 : 66;
    fitText(g, text, 256, 68, 474, size);
    const tex = new THREE.CanvasTexture(c);
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    shopTexCache[key] = tex;
    return tex;
  }
  function addShopSign(group, text, w, h, bg, fg, x, y, z, yaw) {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: shopTexture(text, bg, fg), side: THREE.DoubleSide }));
    sign.position.set(x, y, z);
    sign.rotation.y = yaw || 0;
    group.add(sign);
    return sign;
  }

  // Harber Realty branding: black panel, white lettering. The office board and
  // every little FOR SALE placard share these two textures so the small signs
  // read as the same design at a fraction of the size.
  const harberTexCache = {};
  const HARBER_NAME = 'Harber Realty';
  const HARBER_PHONE = '910-253-6788';
  function harberSignTexture(kind) {
    if (harberTexCache[kind]) return harberTexCache[kind];
    const c = document.createElement('canvas');
    c.width = 512; c.height = 192;
    const g = c.getContext('2d');
    g.fillStyle = '#050505';
    g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 8;
    g.strokeRect(8, 8, c.width - 16, c.height - 16);
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (kind === 'sale') {
      fitText(g, 'FOR SALE', 256, 56, 460, 54);
      fitText(g, HARBER_NAME, 256, 112, 460, 40);
      fitText(g, HARBER_PHONE, 256, 156, 460, 30);
    } else {
      fitText(g, HARBER_NAME, 256, 78, 460, 62);
      fitText(g, HARBER_PHONE, 256, 138, 460, 42);
    }
    const tex = new THREE.CanvasTexture(c);
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    harberTexCache[kind] = tex;
    return tex;
  }
  function harberSignMaterial(kind) {
    const key = 'harberSign' + kind;
    if (!tmpMat[key]) {
      tmpMat[key] = new THREE.MeshBasicMaterial({
        map: harberSignTexture(kind), side: THREE.DoubleSide
      });
      tmpMat[key].name = key;
    }
    return tmpMat[key];
  }
  function addHarberSign(group, kind, w, h, x, y, z, yaw) {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(w, h), harberSignMaterial(kind));
    sign.position.set(x, y, z);
    sign.rotation.y = yaw || 0;
    group.add(sign);
    return sign;
  }
  function beamBetween(group, ax, ay, az, bx, by, bz, r, material) {
    const a = new THREE.Vector3(ax, ay, az), b = new THREE.Vector3(bx, by, bz);
    const dir = b.clone().sub(a), len = dir.length() || 0.001;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6), material);
    m.position.copy(a).addScaledVector(dir, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    m.castShadow = true;
    group.add(m);
    return m;
  }
  function boardwalkX(z, offset) {
    const IM = CC.ImageMap;
    const shore = IM && IM.shoreLine ? IM.shoreLine(z) : C.WORLD.minX + 70;
    return shore + (offset === undefined ? 18 : offset);
  }
  // Shared by the boardwalk rail and the pier so the entrance stays clear.
  // The fishing pier used to run almost to the world edge; keeping it to a
  // manageable spur leaves a clear shipping lane around its offshore end.
  const PIER_Z = -250, PIER_MOUTH_HALF = 5.4, PIER_LENGTH = 62;
  function addBench(group, x, y, z, yaw) {
    const wood = getMat('boardBench', 0x9a6d43);
    const b = new THREE.Group();
    b.add(box(2.6, 0.16, 0.7, wood, 0, 0.55, 0));
    b.add(box(2.6, 0.7, 0.13, wood, 0, 0.95, -0.3));
    [-1.05, 1.05].forEach(function (lx) {
      b.add(box(0.14, 0.55, 0.14, getMat('benchIron', 0x4b4e50), lx, 0.28, 0));
    });
    b.position.set(x, y, z);
    b.rotation.y = yaw || 0;
    group.add(b);
  }
  function addArcadeCabinet(group, x, y, z, yaw, color) {
    const cab = new THREE.Group();
    const body = getMat('cab' + color, color);
    cab.add(box(1.15, 2.15, 0.85, body, 0, 1.08, 0));
    cab.add(box(1.0, 0.72, 0.07, getMat('cabScreen', 0x14202c, { emissive: 0x123f5a }), 0, 1.55, 0.46));
    cab.add(box(1.05, 0.1, 0.48, getMat('cabPanel', 0x2b2e32), 0, 1.08, 0.48));
    [0xffd75e, 0xff5d6c, 0x66e0a3].forEach(function (c, i) {
      cab.add(cylinder(0.06, 0.06, 0.06, 6, getMat('cabBtn' + c, c), -0.28 + i * 0.28, 1.16, 0.52));
    });
    addShopSign(cab, 'PLAY', 1.0, 0.34, color, 0xffffff, 0, 2.3, 0.02, 0);
    cab.position.set(x, y, z);
    cab.rotation.y = yaw || 0;
    group.add(cab);
    Details.arcadeMachines++;
  }
  function addSurfboard(group, x, y, z, color, lean) {
    const board = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 12), getMat('surf' + color, color));
    board.scale.set(1, 2.7, 0.18);
    board.position.set(x, y + 1.45, z);
    board.rotation.z = lean || 0.12;
    group.add(board);
    const stripe = box(0.08, 2.2, 0.04, getMat('surfStripe', 0xf6f2e2), x, y + 1.45, z + 0.11);
    stripe.rotation.z = lean || 0.12;
    group.add(stripe);
  }
  function addFoodCart(group, x, z, name, color) {
    const y = CC.heightAt(x, z);
    const cart = new THREE.Group();
    cart.position.set(x, y, z);
    cart.rotation.y = -Math.PI / 2;
    cart.add(box(5.2, 1.3, 2.2, getMat('cart' + color, color), 0, 1.35, 0));
    cart.add(box(5.5, 0.12, 2.5, getMat('cartTop', 0xece5d1), 0, 2.05, 0));
    [-1.8, 1.8].forEach(function (wx) {
      const wheel = cylinder(0.42, 0.42, 0.18, 10, getMat('cartWheel', 0x333638), wx, 0.5, 1.15);
      wheel.rotation.x = Math.PI / 2; cart.add(wheel);
    });
    beamBetween(cart, -2.2, 2.1, 0, -2.2, 4.0, 0, 0.07, getMat('cartPole', 0xb9b6aa));
    beamBetween(cart, 2.2, 2.1, 0, 2.2, 4.0, 0, 0.07, getMat('cartPole', 0xb9b6aa));
    cart.add(box(5.6, 0.18, 3.0, getMat('cartCanopy', 0xf3e3bd), 0, 4.05, 0));
    addShopSign(cart, name, 4.8, 1.1, color, 0xffffff, 0, 2.85, 1.2, 0);
    group.add(cart);
    Details.boardwalkWorkerAnchors.push({
      x: x - 2.7, z: z + 1.4, yaw: -Math.PI / 2, role: 'vendor', name: name, color: color
    });
    Details.foodPickupSites.push({ key: 'cart-' + z, name: name, x: x - 3.2, z: z + 1.4 });
    Details.amusementVendorNames.push(name);
    Details.foodVendors++;
  }
  const rideBulbCache = {};
  function rideBulbMat(color, phase) {
    const key = color + '|' + phase;
    if (!rideBulbCache[key]) {
      const m = mat(color, { emissive: color, emissiveIntensity: 0.7 });
      m.name = 'rideBulb' + key;
      rideBulbCache[key] = m;
      Details.rideBulbMats.push({ mat: m, phase: phase });
    }
    return rideBulbCache[key];
  }
  function addRideBulb(parent, x, y, z, color, phase, r) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(r || 0.18, 6, 5), rideBulbMat(color, phase));
    b.position.set(x, y, z);
    parent.add(b);
    return b;
  }
  function addRiderFigure(parent, x, y, z, yaw, scale) {
    if (!CC.CharacterFactory) return null;
    const figure = CC.CharacterFactory.build({
      skin: U.pick(rng, [0xe8bd96, 0xd39b72, 0xb87a54, 0xf0c9a0]),
      shirt: U.pick(rng, [0xe45745, 0x4e9bd0, 0xe7b84d, 0x62a878, 0xb06fc0]),
      pants: U.pick(rng, [0x3f4a5a, 0x5b5147, 0x2e3944]),
      hair: U.pick(rng, [0x3b2c24, 0x1f1b18, 0x7a4b2a])
    }).group;
    figure.scale.setScalar(scale || 0.55);
    figure.position.set(x, y, z);
    figure.rotation.y = yaw || 0;
    parent.add(figure);
    return figure;
  }
  function addCarouselHorse(parent, hx, hz, localAngle, index) {
    const horse = new THREE.Group();
    const coats = [0xf3e6cf, 0x8c5c43, 0xd9a066, 0x5b4a42];
    const manes = [0x6b3f2e, 0x2f2724, 0x8c5a32, 0x211d1b];
    const coat = getMat('horseCoat' + (index % 4), coats[index % 4]);
    const mane = getMat('horseMane' + (index % 4), manes[index % 4]);
    const tack = getMat('horseTack', 0xb9453f);
    const gold = getMat('horseGold', 0xf2c94c);

    const body = new THREE.Mesh(new THREE.SphereGeometry(0.62, 8, 6), coat);
    body.scale.set(0.92, 0.76, 1.5); body.position.y = 0.12; horse.add(body);
    const neck = box(0.4, 1.0, 0.52, coat, 0, 0.76, 0.78);
    neck.rotation.x = -0.5; horse.add(neck);
    const head = box(0.38, 0.42, 0.8, coat, 0, 1.26, 1.17);
    head.rotation.x = -0.2; horse.add(head);
    horse.add(box(0.3, 0.25, 0.28, getMat('horseMuzzle', 0xe4c8a6), 0, 1.12, 1.56));
    [-0.12, 0.12].forEach(function (ex) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.24, 5), coat);
      ear.position.set(ex, 1.58, 1.02); horse.add(ear);
    });
    const crest = box(0.14, 0.9, 0.3, mane, 0, 1.2, 0.82);
    crest.rotation.x = -0.55; horse.add(crest);
    const tail = box(0.18, 0.18, 0.72, mane, 0, 0.42, -0.96);
    tail.rotation.x = -0.5; horse.add(tail);
    horse.add(box(0.72, 0.18, 0.72, tack, 0, 0.66, 0.04));
    horse.add(box(0.76, 0.06, 0.08, gold, 0, 0.78, -0.3));
    const legs = [];
    [-0.35, 0.35].forEach(function (lx) {
      [-0.55, 0.55].forEach(function (lz) {
        const leg = box(0.17, 0.82, 0.19, coat, lx, -0.52, lz);
        horse.add(leg); legs.push(leg);
      });
    });
    horse.add(cylinder(0.075, 0.075, 5.4, 6, getMat('horsePole', 0xd8b968), 0, 0.2, 0));
    horse.position.set(hx, 3.0, hz);
    horse.rotation.y = Math.PI / 2 - localAngle;
    parent.add(horse);
    const rider = addRiderFigure(horse, 0, 1.02, 0.02, 0, 0.52);
    Details.rideSeats.carousel.push({ host: horse, offset: { x: 0, y: 1.02, z: 0.02 } });
    Details.carouselHorses.push({ group: horse, rider: rider, legs: legs, phase: index * 0.78 });
  }
  function addParkStall(group, x, z, name, color, kind) {
    const y = CC.heightAt(x, z);
    const stall = new THREE.Group();
    stall.position.set(x, y, z);
    const roof = getMat('stallRoof', 0x4a4441);
    stall.add(box(9, 4.2, 6, getMat('stallBody' + name, color), 0, 2.1, 0));
    stall.add(box(10, 0.42, 7, roof, 0, 4.42, 0));
    stall.add(box(9.6, 0.18, 2.4, getMat('stallAwning', 0xf3e5c7), 0, 3.5, 3.45));
    addShopSign(stall, name, 7.8, 1.45, color, 0xffffff, 0, 4.95, 3.1, 0);
    [-4, 4].forEach(function (sx, i) {
      addRideBulb(stall, sx, 4.6, 3.2, [0xff5d6c, 0x66e0a3][i], i * 1.4, 0.16);
    });
    if (kind === 'arcade' || kind === 'video') {
      for (let i = 0; i < 4; i++) {
        addArcadeCabinet(stall, -3.1 + i * 2.05, 0, 3.7, 0,
          [0x8b55b0, 0x4f70bd, 0xd45f3f, 0x3f9a72][i]);
      }
    } else if (kind === 'shooting') {
      stall.add(box(8.4, 0.9, 1.1, getMat('shootCounter', 0x6c4c39), 0, 1.3, 3.7));
      for (let i = 0; i < 8; i++) {
        const target = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.12, 10),
          getMat('shootTarget' + (i % 2), i % 2 ? 0xf5f1e4 : 0xe45745));
        target.rotation.x = Math.PI / 2;
        target.position.set(-3.1 + i * 0.9, 2.2 + (i % 3) * 0.42, 2.65);
        stall.add(target);
      }
      for (let i = 0; i < 3; i++) {
        stall.add(box(0.12, 0.12, 1.5, getMat('shootRifle', 0x3a2b23), -1.6 + i * 1.6, 1.9, 4.2));
      }
      Details.arcadeMachines += 3;
    }
    group.add(stall);
    Details.boardwalkWorkerAnchors.push({
      x: x + 3.4, z: z + 4.1, yaw: 0, role: 'vendor', name: name, color: color
    });
    if (kind === 'food') {
      Details.foodPickupSites.push({ key: 'stall-' + name, name: name, x: x + 3.5, z: z + 4.1 });
      Details.foodVendors++;
    }
    Details.amusementVendorNames.push(name);
  }
  function addShopBuilding(group, z, kind, name, color) {
    const x = boardwalkX(z, 29), y = CC.heightAt(x, z);
    const b = new THREE.Group();
    b.position.set(x, y, z);
    b.rotation.y = -Math.PI / 2; // front faces the boardwalk / water
    const dark = getMat('shopRoof', 0x4c4540);
    b.add(box(11, 5.2, 7.5, getMat('shopBody' + name, color), 0, 2.6, 0));
    b.add(box(12, 0.45, 8.4, dark, 0, 5.4, 0));
    b.add(box(11.5, 0.18, 2.4, getMat('awning' + name, 0xf3e8cf), 0, 3.85, 4.4));
    for (let i = 0; i < 6; i++) {
      b.add(box(1.85, 0.07, 2.45, getMat('awningStripe' + color, color), -4.65 + i * 1.86, 3.96, 4.4));
    }
    addShopSign(b, name, 9, 2.1, color, 0xffffff, 0, 6.5, 3.9, 0);
    b.add(box(1.7, 2.8, 0.16, getMat('shopDoor', 0x4a6b70), 0, 1.4, 3.82));
    [-3.4, 3.4].forEach(function (wx) {
      b.add(box(2.5, 1.7, 0.14, getMat('shopGlass', 0x4f7d90, { emissive: 0x102431 }), wx, 2.4, 3.82));
      b.add(box(2.7, 0.12, 0.18, dark, wx, 1.5, 3.9));
    });
    if (kind === 'apparel') {
      const shirtColors = [0xf06c7f, 0x59b7c8, 0xf2c65b, 0x8b78c9, 0x6fc08a];
      beamBetween(b, -2.4, 0.2, 5.7, -2.4, 2.6, 5.7, 0.07, getMat('rack', 0xb6b9b8));
      beamBetween(b, 2.4, 0.2, 5.7, 2.4, 2.6, 5.7, 0.07, getMat('rack', 0xb6b9b8));
      beamBetween(b, -2.4, 2.5, 5.7, 2.4, 2.5, 5.7, 0.07, getMat('rack', 0xb6b9b8));
      for (let i = 0; i < 8; i++) {
        b.add(box(0.85, 0.95, 0.12, getMat('shirt' + shirtColors[i], shirtColors[i]),
          -2.0 + i * 0.57, 1.95, 5.7));
      }
      addSurfboard(b, -4.7, 0, 6.1, 0xe6644f, 0.18);
      addSurfboard(b, 4.7, 0, 6.1, 0x4aa8c4, -0.16);
    } else if (kind === 'souvenir') {
      b.add(box(3.4, 2.4, 0.6, getMat('postcardRack', 0xb28352), -2.8, 1.2, 5.6));
      for (let i = 0; i < 6; i++) {
        b.add(box(0.32, 0.55, 0.05, getMat('postcard' + i, [0xf2d06b, 0x69b5c6, 0xe97d6d][i % 3]),
          -4.0 + i * 0.48, 1.3, 5.95));
      }
      const shell = new THREE.Mesh(new THREE.SphereGeometry(1.1, 10, 6), getMat('giantShell', 0xf0d9b0));
      shell.scale.set(1.4, 0.55, 1); shell.position.set(3.2, 0.6, 5.8); b.add(shell);
      b.add(box(2.5, 1.4, 1.1, getMat('giftBoxes', 0xd66e78), 3.2, 1.6, 5.8));
    } else if (kind === 'arcade') {
      [-3.1, 0, 3.1].forEach(function (cx, i) {
        addArcadeCabinet(b, cx, 0, 5.7, (i - 1) * 0.12, [0x9b57b5, 0xd24f5b, 0x3f8ec0][i]);
      });
      addShopSign(b, 'TOKENS', 2.2, 0.7, 0xf0c24c, 0x4a3010, 4.4, 2.0, 5.9, 0);
    } else if (kind === 'food') {
      b.add(box(5.2, 0.18, 1.6, getMat('foodCounter', 0xd8c9a7), 0, 1.3, 5.1));
      [-1.8, 0, 1.8].forEach(function (sx) {
        b.add(cylinder(0.35, 0.35, 0.14, 10, getMat('stool', 0xc45b45), sx, 0.85, 6.4));
        beamBetween(b, sx, 0.1, 6.4, sx, 0.8, 6.4, 0.07, getMat('stoolLeg', 0x55595b));
      });
      addShopSign(b, 'MENU', 2.2, 1.3, 0x2d4f5d, 0xfff2c9, -3.9, 2.1, 5.7, 0);
      Details.foodVendors++;
    } else if (kind === 'pizza') {
      b.add(box(5.4, 0.18, 1.7, getMat('pizzaCounter', 0xe8d6ae), 0, 1.3, 5.1));
      [-1.8, 0, 1.8].forEach(function (sx) {
        b.add(cylinder(0.35, 0.35, 0.14, 10, getMat('pizzaStool', 0xc45b45), sx, 0.85, 6.4));
        beamBetween(b, sx, 0.1, 6.4, sx, 0.8, 6.4, 0.07, getMat('stoolLeg', 0x55595b));
      });
      // Stone oven, pizza peels and a small stack of takeaway boxes.
      b.add(box(3.2, 2.3, 1.5, getMat('pizzaOven', 0xc96b45), -3.5, 1.15, 5.7));
      b.add(box(2.1, 1.2, 0.08, getMat('pizzaOvenMouth', 0x3b2418, { emissive: 0x6d2f0f }), -3.5, 1.15, 6.48));
      [0, 1].forEach(function (i) {
        const pie = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.12, 12),
          getMat('pizzaBase', 0xe8bd74));
        pie.position.set(1.4 + i * 1.8, 1.45, 5.45); b.add(pie);
        const sauce = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.04, 12),
          getMat('pizzaSauce', 0xc94a34));
        sauce.position.set(1.4 + i * 1.8, 1.53, 5.45); b.add(sauce);
      });
      b.add(box(1.4, 0.9, 1.0, getMat('pizzaBoxes', 0xd9b479), 4.4, 0.45, 5.7));
      addShopSign(b, 'PIZZA', 2.4, 1.0, 0x8f2f2f, 0xfff2c9, -4.0, 2.4, 6.2, 0);
      Details.foodVendors++;
    }
    group.add(b);
    // Staff stand just outside the door, facing the waterfront walkway.
    Details.boardwalkWorkerAnchors.push({
      x: x - 5.2, z: z + 1.1, yaw: -Math.PI / 2, role: 'worker', name: name, color: color
    });
    if (kind === 'arcade' || kind === 'food' || kind === 'pizza') {
      Details.boardwalkWorkerAnchors.push({
        x: x - 5.0, z: z - 2.4, yaw: -Math.PI / 2, role: 'worker', name: name, color: color
      });
    }
    if (kind === 'food' || kind === 'pizza') {
      Details.foodPickupSites.push({ key: 'shop-' + z, name: name, x: x - 6, z: z });
    }
    Details.boardwalkShops++;
  }

  function buildBoardwalk(scene) {
    const q = CC.ImageMap && CC.ImageMap.zones && CC.ImageMap.zones.boardwalk;
    if (!q) return;
    Details.boardwalkWorkerAnchors.length = 0;
    Details.boardwalkWorkers = 0;
    Details.boardwalkPath = function (z, offset) { return boardwalkX(z, offset); };
    // Food carts and food shops register pickup windows here. buildHomeDetails
    // runs later and must not clear this list (it used to wipe them all).
    Details.foodPickupSites.length = 0;
    const g = new THREE.Group();
    const z0 = q.z - q.h * 0.5 + 8, z1 = q.z + q.h * 0.5 - 8;
    const pts = [];
    for (let z = z0; z < z1; z += 6) pts.push({ x: boardwalkX(z), z: z });
    pts.push({ x: boardwalkX(z1), z: z1 });
    const woodTex = harborWoodTexture();
    const deckMat = getMat('boardDeck', 0xa07d54, { map: woodTex });
    const plankMat = getMat('boardPlank', 0xa07d54, { map: woodTex });
    const railMat = getMat('boardRail', 0xe6d9a8);
    const plankXf = [];
    const dummy = new THREE.Object3D();
    const pierLo = PIER_Z - PIER_MOUTH_HALF, pierHi = PIER_Z + PIER_MOUTH_HALF;
    function waterPost(x, y, z) {
      beamBetween(g, x - 4.8, y + 0.9, z, x - 4.8, y + 2.2, z, 0.1, railMat);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.15, 7, 5), railMat);
      cap.position.set(x - 4.8, y + 2.24, z);
      g.add(cap);
    }
    function railPoint(a, b, ay, by, z) {
      const t = Math.abs(b.z - a.z) > 0.001 ? (z - a.z) / (b.z - a.z) : 0;
      return { x: U.lerp(a.x, b.x, t), y: U.lerp(ay, by, t), z: z };
    }
    function railIntervals(za, zb) {
      if (zb <= pierLo || za >= pierHi) return [[za, zb]];
      const parts = [];
      if (za < pierLo) parts.push([za, pierLo]);
      if (zb > pierHi) parts.push([pierHi, zb]);
      return parts;
    }

    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1;
      const yaw = Math.atan2(dx, dz);
      const ay = CC.heightAt(a.x, a.z), by = CC.heightAt(b.x, b.z);
      const deck = box(10, 0.45, len + 0.35, deckMat, (a.x + b.x) * 0.5,
        (ay + by) * 0.5 + 0.75, (a.z + b.z) * 0.5);
      deck.rotation.y = yaw; g.add(deck);
      const n = Math.max(1, Math.round(len / 1.05));
      for (let j = 0; j < n; j++) {
        const t = (j + 0.5) / n;
        const px = U.lerp(a.x, b.x, t), pz = U.lerp(a.z, b.z, t);
        dummy.position.set(px, CC.heightAt(px, pz) + 1.02, pz);
        dummy.rotation.set(0, yaw, 0); dummy.scale.setScalar(1);
        dummy.updateMatrix(); plankXf.push(dummy.matrix.clone());
      }
      // Water-side rail (the shoreline is to the west / lower x). Leave the
      // fishing-pier mouth open instead of running a rail across the entrance.
      railIntervals(a.z, b.z).forEach(function (pair) {
        if (pair[1] - pair[0] < 0.05) return;
        const p0 = railPoint(a, b, ay, by, pair[0]);
        const p1 = railPoint(a, b, ay, by, pair[1]);
        [1.42, 2.05].forEach(function (h) {
          beamBetween(g, p0.x - 4.8, p0.y + h, p0.z, p1.x - 4.8, p1.y + h, p1.z, 0.075, railMat);
        });
        [p0, p1].forEach(function (p) {
          if (Math.abs(p.z - pierLo) < 0.01 || Math.abs(p.z - pierHi) < 0.01) {
            waterPost(p.x, p.y, p.z);
          }
        });
      });
    }
    // Surf Shack overlook: extra posts and a land-side return rail frame the
    // storefront while leaving a clear gap for its door and the walkway.
    Details.surfShackRailing = 0;
    const surfLo = -340, surfHi = -322, surfSteps = 8;
    for (let i = 0; i <= surfSteps; i++) {
      const z = U.lerp(surfLo, surfHi, i / surfSteps);
      const bx = boardwalkX(z), y = CC.heightAt(bx, z), wx = bx - 4.8;
      beamBetween(g, wx, y + 0.9, z, wx, y + 2.35, z, 0.14, railMat);
      Details.surfShackRailing++;
      if (i < surfSteps) {
        const zn = U.lerp(surfLo, surfHi, (i + 1) / surfSteps);
        const xn = boardwalkX(zn) - 4.8;
        const yn = CC.heightAt(boardwalkX(zn), zn);
        [1.42, 2.05, 2.3].forEach(function (h) {
          beamBetween(g, wx, y + h, z, xn, yn + h, zn, 0.075, railMat);
        });
      }
    }
    [[-340, -335], [-327, -322]].forEach(function (pair) {
      const steps = 3;
      for (let i = 0; i <= steps; i++) {
        const z = U.lerp(pair[0], pair[1], i / steps);
        const bx = boardwalkX(z), y = CC.heightAt(bx, z), lx = bx + 4.8;
        beamBetween(g, lx, y + 0.9, z, lx, y + 2.2, z, 0.12, railMat);
        Details.surfShackRailing++;
        if (i < steps) {
          const zn = U.lerp(pair[0], pair[1], (i + 1) / steps);
          const xn = boardwalkX(zn) + 4.8;
          const yn = CC.heightAt(boardwalkX(zn), zn);
          [1.42, 2.05].forEach(function (h) {
            beamBetween(g, lx, y + h, z, xn, yn + h, zn, 0.075, railMat);
          });
        }
      }
    });

    if (plankXf.length) {
      const planks = new THREE.InstancedMesh(new THREE.BoxGeometry(9.6, 0.1, 0.82), plankMat, plankXf.length);
      plankXf.forEach(function (m, i) { planks.setMatrixAt(i, m); });
      planks.receiveShadow = true; g.add(planks);
    }
    pts.forEach(function (p, i) {
      const y = CC.heightAt(p.x, p.z);
      [-4.1, 4.1].forEach(function (ox) {
        // These are deck supports: keep their tops below the planks so they
        // cannot read as sharp posts sticking up through the walkway.
        beamBetween(g, p.x + ox, y - 0.25, p.z, p.x + ox, y + 0.64, p.z, 0.14, railMat);
      });
      if (Math.abs(p.z - PIER_Z) >= PIER_MOUTH_HALF) waterPost(p.x, y, p.z);
      if (i % 4 === 1) {
        beamBetween(g, p.x + 3.7, y + 0.9, p.z, p.x + 3.7, y + 5.4, p.z, 0.12, railMat);
        g.add(box(0.9, 0.25, 0.6, getMat('boardLamp', 0xffe6a6, { emissive: 0xffcf6b }),
          p.x + 3.7, y + 5.45, p.z));
      }
    });
    [-325, -290, -212].forEach(function (z) {
      addBench(g, boardwalkX(z, 25.5), CC.heightAt(boardwalkX(z, 25.5), z) + 0.9, z, -Math.PI / 2);
    });
    // Entrance arches at both ends of the wooden walkway.
    [z0 + 2, z1 - 2].forEach(function (z) {
      const x = boardwalkX(z), y = CC.heightAt(x, z);
      [-5, 5].forEach(function (ox) {
        beamBetween(g, x + ox, y, z, x + ox, y + 7.5, z, 0.22, railMat);
      });
      addShopSign(g, 'BOARDWALK', 10, 1.9, 0x1f6b8c, 0xfff4d5, x, y + 7.5, z, 0);
    });

    [
      [-332, 'apparel', 'SURF SHACK', 0x2f95ad],
      [-315, 'souvenir', 'SEA TREASURES', 0xd4863c],
      [-298, 'arcade', 'ARCADE ALLEY', 0x8b55b0],
      [-281, 'pizza', 'PIZZA PALAZZO', 0xd45f3f],
      [-263, 'souvenir', 'GIFT GALLERY', 0x3f9a72],
      [-236, 'apparel', 'BEACH WEAR', 0xd96f96],
      [-219, 'food', 'SEAFOOD SHACK', 0xd4a03e],
      [-203, 'arcade', 'GAME ZONE', 0x4f70bd]
    ].forEach(function (s) { addShopBuilding(g, s[0], s[1], s[2], s[3]); });
    [-307, -269, -227].forEach(function (z, i) {
      addFoodCart(g, boardwalkX(z, 23.5), z, ['HOT DOGS', 'ICE CREAM', 'TACOS'][i],
        [0xe45745, 0x5ba9d0, 0xe0a93f][i]);
    });

    scene.add(g);
    Details.boardwalkWorkers = Details.boardwalkWorkerAnchors.length;
    Details.boardwalk = true;
  }

  function buildAmusementPark(scene) {
    const q = CC.ImageMap && CC.ImageMap.zones && CC.ImageMap.zones.amusement;
    if (!q) return;
    const g = new THREE.Group();
    const groundY = CC.heightAt(q.x, q.z);
    const steel = getMat('rideSteel', 0xd7dcdd);
    const dark = getMat('rideDark', 0x45494c);
    Details.amusementVendorNames.length = 0;
    Details.rideStations.length = 0;
    Details.rideSeats.ferris.length = 0;
    Details.rideSeats.coaster.length = 0;
    Details.rideSeats.carousel.length = 0;
    Details.coasterPhase = 0;
    Details.rideBulbMats.length = 0;
    Details.carouselHorses.length = 0;
    Details.ferrisRiders.length = 0;
    Details.coasterRiders.length = 0;
    const bulbColors = [0xff5d6c, 0xffd166, 0x66e0a3, 0x6fb6ff];

    // Entrance plaza and arch facing the boardwalk.
    paintRect(scene, -332, -254, -300, -246, CC.heightAt(-316, -250) + 0.06, 0xb9aa81);
    [-256, -244].forEach(function (z) {
      beamBetween(g, -300, CC.heightAt(-300, z), z, -300, CC.heightAt(-300, z) + 8.5, z, 0.3, steel);
    });
    beamBetween(g, -300, groundY + 8.5, -256, -300, groundY + 8.5, -244, 0.26, steel);
    Details.amusementSignText = 'Harbor Amusement Park';
    addShopSign(g, Details.amusementSignText, 16, 2.7, 0xd34b4b, 0xfff4cf,
      -300, groundY + 9.4, -250, -Math.PI / 2);
    for (let i = 0; i < 14; i++) {
      addRideBulb(g, -300, groundY + 8.65, -256 + i * (12 / 13),
        bulbColors[i % bulbColors.length], i * 0.7, 0.17);
    }

    // ---- Ferris wheel: rim, spokes, lit cabins and A-frame supports ----
    const wheel = new THREE.Group();
    const fx = -265, fz = -250, radius = 17;
    const fy = CC.heightAt(fx, fz) + 20;
    wheel.position.set(fx, fy, fz);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.34, 8, 40), getMat('wheelRim', 0xe8eef0));
    rim.rotation.y = Math.PI / 2; wheel.add(rim);
    const innerRim = new THREE.Mesh(new THREE.TorusGeometry(radius - 1.2, 0.16, 6, 40), steel);
    innerRim.rotation.y = Math.PI / 2; wheel.add(innerRim);
    wheel.add(cylinder(1.0, 1.0, 2.6, 12, dark, 0, 0, 0).rotateZ(Math.PI / 2));
    const cabins = [];
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2;
      const ry = Math.sin(a) * radius, rz = Math.cos(a) * radius;
      beamBetween(wheel, 0, 0, 0, 0, ry, rz, 0.1, steel);
      addRideBulb(wheel, 0, ry, rz, bulbColors[i % bulbColors.length], i * 0.55, 0.28);
      const cabin = new THREE.Group();
      cabin.position.set(0, ry, rz);
      cabin.add(box(2.2, 1.5, 2.0, getMat('cabin' + (i % 3), [0xe05d55, 0x4e9bd0, 0xe7b84d][i % 3]), 0, -1.6, 0));
      cabin.add(box(2.3, 0.14, 2.1, dark, 0, -2.4, 0));
      cabin.add(box(1.7, 0.72, 0.08, getMat('cabinGlass', 0x9fd8e8, {
        transparent: true, opacity: 0.5
      }), 0, -1.35, 1.03));
      [-0.8, 0.8].forEach(function (cx) {
        beamBetween(cabin, cx, -0.5, 0, cx, -1.0, 0, 0.05, steel);
      });
      Details.ferrisRiders.push(addRiderFigure(cabin, 0, -2.25, 0, 0, 0.52));
      Details.rideSeats.ferris.push({ host: cabin, offset: { x: 0, y: -2.25, z: 0 } });
      wheel.add(cabin); cabins.push(cabin);
    }
    for (let i = 0; i < 36; i++) {
      const a = i / 36 * Math.PI * 2;
      addRideBulb(wheel, 0, Math.sin(a) * (radius + 0.6), Math.cos(a) * (radius + 0.6),
        bulbColors[(i + 1) % bulbColors.length], i * 0.35, 0.15);
    }
    [-4.5, 4.5].forEach(function (sx) {
      [-10, 10].forEach(function (dz) {
        beamBetween(g, fx + sx, CC.heightAt(fx + sx, fz + dz) + 0.2, fz + dz,
          fx + sx, fy, fz, 0.3, steel);
      });
      g.add(box(2.6, 1.0, 2.6, dark, fx + sx, CC.heightAt(fx + sx, fz) + 0.5, fz));
    });
    g.add(wheel);
    Details.ferrisWheel = { group: wheel, cabins: cabins };
    Details.amusementRides++;
    const ferriPlatformY = CC.heightAt(fx, fz + 21);
    g.add(box(9, 0.5, 5, getMat('ridePlatform', 0xbeb49a), fx, ferriPlatformY + 0.55, fz + 21));
    addShopSign(g, 'FERRIS WHEEL  $1.00', 10, 1.6, 0x397fa0, 0xfff4cf,
      fx, ferriPlatformY + 3.2, fz + 23.2, 0);
    Details.rideStations.push({
      key: 'ferris', name: 'FERRIS WHEEL', price: 1,
      x: fx, z: fz + 21, boardX: fx, boardZ: fz + 21
    });

    // ---- Roller coaster: banked closed loop with rails, ties and cars ----
    const cp = [
      [-302, 2.2, -285], [-284, 8.5, -297], [-255, 15.5, -288], [-228, 8.0, -266],
      [-232, 3.0, -238], [-260, 11.5, -224], [-291, 6.5, -241]
    ].map(function (p) { return new THREE.Vector3(p[0], p[1], p[2]); });
    const curve = new THREE.CatmullRomCurve3(cp, true, 'catmullrom', 0.5);
    const samples = [], left = [], right = [];
    for (let i = 0; i < 180; i++) {
      const t = i / 180, p = curve.getPointAt(t), tan = curve.getTangentAt(t);
      const rv = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
      samples.push(p); left.push(p.clone().addScaledVector(rv, -0.75));
      right.push(p.clone().addScaledVector(rv, 0.75));
    }
    const railMat = getMat('coasterRail', 0xe4e9ea);
    [left, right].forEach(function (arr) {
      const rail = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arr, true), 180, 0.11, 6, true), railMat);
      g.add(rail);
    });
    for (let i = 0; i < samples.length; i += 5) {
      const p = samples[i], tan = curve.getTangentAt(i / samples.length);
      const tie = box(2.0, 0.14, 0.3, dark, p.x, p.y - 0.16, p.z);
      tie.rotation.y = Math.atan2(tan.x, tan.z); g.add(tie);
      if (i % 10 === 0) {
        beamBetween(g, p.x, CC.heightAt(p.x, p.z), p.z, p.x, p.y - 0.25, p.z, 0.11, steel);
      }
    }
    const station = box(16, 0.35, 5, getMat('coasterStation', 0x8e8375), -299, CC.heightAt(-299, -286) + 0.5, -286);
    g.add(station);
    addShopSign(g, 'COASTER  $2.50', 8.4, 1.6, 0xc44c46, 0xfff1c8,
      -299, CC.heightAt(-299, -286) + 3.2, -283, 0);
    Details.coasterCurve = curve;
    for (let i = 0; i < 5; i++) {
      const car = new THREE.Group();
      car.add(box(1.7, 0.9, 2.3, getMat('coasterCar' + i,
        [0xe15c55, 0xefc04a, 0x4fa3cf, 0x7d58b5, 0x54b589][i]), 0, 0.5, 0));
      car.add(box(1.75, 0.5, 0.16, dark, 0, 1.05, -0.95));
      [-0.42, 0.42].forEach(function (hx, seat) {
        car.add(box(0.25, 0.5, 0.25, getMat('coasterSeat', 0x3b3f45), hx, 1.0, 0.1));
        Details.coasterRiders.push({
          group: addRiderFigure(car, hx, 0.95, 0.1, 0, 0.42),
          car: car, seat: seat
        });
        Details.rideSeats.coaster.push({
          host: car, offset: { x: hx, y: 0.95, z: 0.1 }, car: car, seat: seat
        });
      });
      addRideBulb(car, 0, 1.2, 1.2, bulbColors[i % bulbColors.length], i * 0.8, 0.16);
      car.userData.offset = i * 0.035;
      g.add(car); Details.coasterCars.push(car);
    }
    Details.rideStations.push({
      key: 'coaster', name: 'ROLLER COASTER', price: 2.5,
      x: -299, z: -286, boardX: -299, boardZ: -282
    });
    Details.amusementRides++;

    // ---- Carousel and ticket booth ----
    const carousel = new THREE.Group();
    const cx = -240, cz = -275, cy = CC.heightAt(cx, cz);
    carousel.position.set(cx, cy, cz);
    carousel.add(cylinder(7, 7, 0.55, 16, getMat('carouselBase', 0xd2b578), 0, 0.3, 0));
    carousel.add(cylinder(0.35, 0.35, 6, 8, steel, 0, 3.3, 0));
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(8, 3, 12), getMat('carouselTop', 0xd65656));
    canopy.position.y = 7.4; carousel.add(canopy);
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2;
      const hx = Math.cos(a) * 5, hz = Math.sin(a) * 5;
      beamBetween(carousel, hx, 0.6, hz, hx, 5.8, hz, 0.08, steel);
      addCarouselHorse(carousel, hx, hz, a, i);
    }
    for (let i = 0; i < 24; i++) {
      const a = i / 24 * Math.PI * 2;
      addRideBulb(carousel, Math.cos(a) * 7.3, 6.05, Math.sin(a) * 7.3,
        bulbColors[i % bulbColors.length], i * 0.42, 0.18);
    }
    g.add(carousel);
    Details.carousel = carousel;
    Details.amusementRides++;
    addShopSign(g, 'MERRY-GO-ROUND  $1.00', 11, 1.6, 0xd65656, 0xfff4cf,
      cx, cy + 3.4, cz + 9.2, 0);
    Details.rideStations.push({
      key: 'carousel', name: 'MERRY-GO-ROUND', price: 1,
      x: cx, z: cz + 9, boardX: cx, boardZ: cz + 9
    });

    const booth = new THREE.Group();
    const bx = -296, bz = -279;
    booth.position.set(bx, CC.heightAt(bx, bz), bz);
    booth.rotation.y = Math.PI / 2;
    booth.add(box(6, 3.6, 4, getMat('ticketBooth', 0xe0c78f), 0, 1.8, 0));
    booth.add(box(6.8, 0.35, 4.8, dark, 0, 3.8, 0));
    addShopSign(booth, 'TICKETS', 5.2, 1.2, 0xd6574c, 0xfff0c8, 0, 4.5, 2.1, 0);
    g.add(booth);

    // Food, games and a busy midway: the park keeps its own vendor names so the
    // smoke harness can verify every requested concession was actually placed.
    addFoodCart(g, -292, -238, 'PRETZELS', 0xd39a3c);
    addFoodCart(g, -247, -229, 'COTTON CANDY', 0xe47bb2);
    addFoodCart(g, -300, -266, 'HOT DOGS', 0xe45745);
    addParkStall(g, -292, -207, 'PIZZA PIAZZA', 0xd45f3f, 'food');
    addParkStall(g, -276, -207, 'ARCADE ALLEY', 0x7b4fbf, 'arcade');
    addParkStall(g, -260, -207, 'SHOOTING GALLERY', 0x397fa0, 'shooting');
    addParkStall(g, -244, -207, 'VIDEO GAMES', 0x4f70bd, 'video');
    [
      { x: -240, z: -264, yaw: 0, name: 'RIDE OPERATOR' },
      { x: -265, z: -229, yaw: 0, name: 'RIDE OPERATOR' },
      { x: -299, z: -280, yaw: 0, name: 'COASTER CREW' },
      { x: -296, z: -276, yaw: 0, name: 'TICKET BOOTH' }
    ].forEach(function (a) {
      Details.boardwalkWorkerAnchors.push({
        x: a.x, z: a.z, yaw: a.yaw, role: 'worker', name: a.name, color: 0xd34b4b
      });
    });

    scene.add(g);
  }

  function addAngler(group, x, z, deckY, yaw, shirt) {
    let figure;
    if (CC.CharacterFactory) {
      figure = CC.CharacterFactory.build({
        shirt: shirt, pants: 0x3f4a5a, skin: 0xdba978,
        hair: 0x3b2c24, hat: 0xd9b45c
      }).group;
    } else {
      figure = new THREE.Group();
      figure.add(box(0.6, 1.1, 0.4, getMat('anglerShirt', shirt), 0, 1.15, 0));
      figure.add(box(0.45, 0.45, 0.45, getMat('anglerHead', 0xdba978), 0, 1.9, 0));
    }
    figure.position.set(x, deckY, z);
    figure.rotation.y = yaw;
    const rodMat = getMat('fishingRod', 0x5b4630);
    const tipX = 0.5, tipY = 3.3, tipZ = 5.5;
    beamBetween(figure, 0.4, 1.3, 0.45, tipX, tipY, tipZ, 0.05, rodMat);
    beamBetween(figure, tipX, tipY, tipZ, tipX, -1.05, 9.0, 0.012, getMat('fishingLine', 0xe8eef0));
    const bobber = new THREE.Mesh(new THREE.SphereGeometry(0.17, 7, 5), getMat('bobber', 0xe64f46));
    bobber.position.set(tipX, -1.05, 9.0);
    figure.add(bobber);
    figure.add(cylinder(0.35, 0.3, 0.5, 8, getMat('bucket', 0x5c8ea0), -0.6, 0.25, 0.6));
    group.add(figure);
    Details.fishermen++;
    Details.fishingBobbers.push(bobber);
  }

  function buildPier(scene) {
    const q = CC.ImageMap && CC.ImageMap.zones && CC.ImageMap.zones.pier;
    if (!q) return;
    const g = new THREE.Group();
    const deckY = 1.15;
    const x0 = boardwalkX(PIER_Z) + 2;
    const x1 = Math.max(C.WORLD.minX + 5, x0 - PIER_LENGTH);
    const woodTex = harborWoodTexture();
    const deckMat = getMat('pierDeck', 0xa07d54, { map: woodTex });
    const plankMat = getMat('pierPlank', 0xa07d54, { map: woodTex });
    const railMat = getMat('pierRail', 0xe6d9a8);
    const planks = [];
    const dummy = new THREE.Object3D();
    for (let x = x0; x > x1; x -= 6) {
      const xb = Math.max(x1, x - 6), len = x - xb;
      g.add(box(len + 0.2, 0.42, 10, deckMat, (x + xb) * 0.5, deckY, PIER_Z));
      for (let t = 0.5; t < len; t += 1.05) {
        dummy.position.set(x - t, deckY + 0.27, PIER_Z);
        dummy.rotation.set(0, Math.PI / 2, 0); dummy.scale.setScalar(1);
        dummy.updateMatrix(); planks.push(dummy.matrix.clone());
      }
    }
    if (planks.length) {
      const m = new THREE.InstancedMesh(new THREE.BoxGeometry(9.6, 0.1, 0.8), plankMat, planks.length);
      planks.forEach(function (mtx, i) { m.setMatrixAt(i, mtx); });
      g.add(m);
    }
    // Piling supports down into the water.
    for (let x = x0; x >= x1; x -= 8) {
      [-4.2, 4.2].forEach(function (oz) {
        beamBetween(g, x, -2.6, PIER_Z + oz, x, deckY - 0.1, PIER_Z + oz, 0.24,
          getMat('pierPiling', 0x6d5138, { map: woodTex }));
      });
      [-4.8, 4.8].forEach(function (oz) {
        beamBetween(g, x, deckY + 0.7, PIER_Z + oz, Math.max(x1, x - 8), deckY + 0.7, PIER_Z + oz, 0.075, railMat);
      });
    }
    const pierCapMat = getMat('pierRailCap', 0xf2eee2);
    for (let x = x0; x >= x1; x -= 2.7) {
      [-4.8, 4.8].forEach(function (oz) {
        const z = PIER_Z + oz;
        beamBetween(g, x, deckY + 0.05, z, x, deckY + 1.8, z, 0.09, railMat);
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.14, 7, 5), pierCapMat);
        cap.position.set(x, deckY + 1.85, z);
        g.add(cap);
      });
    }
    for (let x = x0 - 18; x > x1; x -= 26) {
      const lampZ = PIER_Z - 4.1;
      beamBetween(g, x, deckY + 1.8, lampZ, x, deckY + 5.2, lampZ, 0.11, railMat);
      g.add(box(0.8, 0.22, 0.55, beaconBasic('pierLamp', 0xffd98a), x, deckY + 5.3, lampZ));
    }
    // Wide fishing platform at the end, with a cleaning table and bench.
    g.add(box(12, 0.45, 16, deckMat, x1 + 3, deckY, PIER_Z));
    addBench(g, x1 + 3, deckY + 0.3, PIER_Z, Math.PI / 2);
    g.add(box(3.8, 0.18, 1.8, getMat('fishTable', 0xa9adb0), x1 + 3, deckY + 1.2, PIER_Z - 6));
    addShopSign(g, 'PIER END', 5.5, 1.3, 0x1f6b8c, 0xfff4d5, x1 + 8, deckY + 3.6, PIER_Z, -Math.PI / 2);
    // Bait shack at the shore end.
    const shack = new THREE.Group();
    shack.position.set(x0 + 3, deckY, -242);
    shack.add(box(6, 3.6, 5, getMat('baitShack', 0xc28a5b), 0, 1.8, 0));
    shack.add(box(6.8, 0.3, 5.8, getMat('baitRoof', 0x6b5b4b), 0, 3.75, 0));
    addShopSign(shack, 'BAIT & TACKLE', 5.5, 1.2, 0xe2b14c, 0x3d2c18, 0, 2.9, 2.6, 0);
    g.add(shack);

    [
      [x0 - 10, -254, 0xc7524c], [x0 - 22, -246, 0x4f8fc0],
      [x0 - 35, -255, 0xe0a441], [x0 - 47, -245, 0x6aa36a],
      [x1 + 8, -246, 0xc46b91], [x1 + 8, -255, 0x5aa4b4]
    ].forEach(function (a) { addAngler(g, a[0], a[1], deckY + 0.35, -Math.PI / 2, a[2]); });
    scene.add(g);
    Details.pier = true;
    // Conservative collision rectangle for the shortened pier, including the
    // wide end platform and railings. Watercraft use it to steer around the
    // spur instead of sailing through the pilings.
    Details.pierRect = { startX: x0, endX: x1 - 4, z: PIER_Z, halfZ: 9 };
    Details.pierLength = x0 - Details.pierRect.endX;
    Details.pierDeckY = deckY + 0.3;
    Details.pierPath = { minX: x1 + 5, maxX: x0 - 2, z: PIER_Z, halfZ: 3.2 };
  }

  function makeDolphin() {
    const g = new THREE.Group();
    const skin = getMat('dolphinSkin', 0x718f9f);
    const belly = getMat('dolphinBelly', 0xcbd8d9);
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), skin);
    body.scale.set(0.78, 0.62, 2.4); body.castShadow = true; g.add(body);
    const underside = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), belly);
    underside.scale.set(0.6, 0.3, 2.05); underside.position.y = -0.27; g.add(underside);
    const snout = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.95, 8), skin);
    snout.rotation.x = Math.PI / 2; snout.position.set(0, -0.05, 2.45); g.add(snout);
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.95, 4), skin);
    fin.position.set(0, 0.72, -0.15); fin.rotation.x = -0.4; g.add(fin);
    [-0.5, 0.5].forEach(function (ex) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.075, 6, 5), getMat('dolphinEye', 0x1c2427));
      eye.position.set(ex, 0.16, 1.6); g.add(eye);
    });
    const tail = new THREE.Group();
    tail.position.z = -2.25;
    [-1, 1].forEach(function (s) {
      const fluke = box(1.15, 0.1, 0.55, skin, s * 0.55, 0, -0.2);
      fluke.rotation.z = s * 0.32; tail.add(fluke);
    });
    g.add(tail);
    g.userData.tail = tail;
    return g;
  }

  function buildDolphins(scene) {
    if (!CC.ImageMap || !CC.ImageMap.zones || !CC.ImageMap.zones.pier) return;
    for (let i = 0; i < 6; i++) {
      const d = makeDolphin();
      d.userData.phase = i / 6 * Math.PI * 2;
      d.userData.speed = 0.28 + (i % 3) * 0.06;
      d.userData.rx = 24 + (i % 3) * 9;
      d.userData.rz = 12 + (i % 4) * 4;
      scene.add(d);
      Details.dolphins.push(d);
    }
  }

  /* ---------- Lucky Stop gas station ---------- */
  function buildGasStation(scene) {
    const q = CC.ImageMap && CC.ImageMap.zones && CC.ImageMap.zones.gas;
    if (!q) return;
    const g = new THREE.Group();
    const concrete = getMat('gasConcrete', 0x8d908e);
    const red = getMat('luckyRed', 0xd4463f);
    const yellow = getMat('luckyYellow', 0xf0c34b);
    const white = getMat('gasWhite', 0xe9e9e2);

    // Apron and painted parking bays.
    paintRect(scene, q.x - 31, q.z - 24, q.x + 31, q.z + 24, CC.heightAt(q.x, q.z) + 0.06, 0x9a9d99);
    for (let i = -3; i <= 3; i++) {
      paintLine(scene, q.x + i * 7, q.z + 8, q.x + i * 7, q.z + 22,
        CC.heightAt(q.x, q.z) + 0.08, 0xf0efe6, 0.22);
    }
    // Convenience store.
    const sx = q.x, sz = q.z - 16;
    const sy = CC.heightAt(sx, sz);
    const store = new THREE.Group();
    store.position.set(sx, sy, sz);
    store.add(box(25, 6.2, 11, white, 0, 3.1, 0));
    store.add(box(26.5, 0.55, 12.5, red, 0, 6.45, 0));
    store.add(box(11, 3.4, 0.16, getMat('storeGlass', 0x6b9db0, { emissive: 0x183440 }), -5.5, 2.6, 5.6));
    store.add(box(2.2, 3.2, 0.18, getMat('storeDoor', 0x3d6e7c), 5.5, 1.6, 5.62));
    store.add(box(2.0, 1.3, 0.1, getMat('storePoster', 0xf0c34b), 9.5, 3.2, 5.65));
    addShopSign(store, 'Lucky Stop', 17, 3.4, 0xd4463f, 0xffe08a, 0, 7.7, 5.7, 0);
    // Shelf silhouettes and a coffee counter visible through the glass.
    for (let i = 0; i < 4; i++) {
      store.add(box(1.0, 2.0, 0.6, getMat('shelf' + i, [0xc7a26b, 0x8fa9b5, 0xd17868, 0x89a96e][i]),
        -9 + i * 2.4, 1.1, 4.7));
    }
    g.add(store);

    // Service canopy and four dual pumps.
    const canopyY = sy + 6.8;
    g.add(box(38, 0.9, 19, red, q.x, canopyY + 0.8, q.z - 2));
    g.add(box(38.8, 0.35, 19.8, yellow, q.x, canopyY + 1.35, q.z - 2));
    [-16, 16].forEach(function (ox) {
      [-9, 9].forEach(function (oz) {
        beamBetween(g, q.x + ox, sy, q.z - 2 + oz, q.x + ox, canopyY + 0.4, q.z - 2 + oz, 0.42, concrete);
      });
    });
    [-12, -4, 4, 12].forEach(function (ox, i) {
      const px = q.x + ox, pz = q.z - 2;
      const py = CC.heightAt(px, pz);
      g.add(box(1.6, 0.22, 5.4, concrete, px, py + 0.12, pz));
      const pump = new THREE.Group();
      pump.position.set(px, py, pz);
      pump.add(box(1.4, 2.4, 1.1, white, 0, 1.3, 0));
      pump.add(box(1.5, 0.3, 1.2, red, 0, 2.55, 0));
      pump.add(box(0.85, 0.55, 0.08, getMat('pumpScreen', 0x1d3e4c, { emissive: 0x1a5a72 }), 0, 1.85, 0.6));
      addShopSign(pump, String(87 + i), 0.9, 0.38, 0xf0c34b, 0x3d2c18, 0, 1.25, 0.58, 0);
      [-0.55, 0.55].forEach(function (hx) {
        const hose = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.055, 5, 10, Math.PI * 1.4),
          getMat('hose', 0x242728));
        hose.position.set(hx, 1.1, 0.7); hose.rotation.y = Math.PI / 2; pump.add(hose);
      });
      g.add(pump);
    });
    // Air pump, bin and a pair of hay? No - a tidy roadside flower bed.
    g.add(box(1.1, 1.6, 0.8, getMat('airPump', 0x5f9a8b), q.x + 27, CC.heightAt(q.x + 27, q.z + 2) + 0.8, q.z + 2));
    g.add(cylinder(0.5, 0.45, 1.2, 8, getMat('gasBin', 0x3f4a4e), q.x - 26, CC.heightAt(q.x - 26, q.z + 18) + 0.6, q.z + 18));
    for (let i = 0; i < 8; i++) {
      g.add(cylinder(0.08, 0.1, 0.6, 5, getMat('stationFlower', i % 2 ? 0xf06b7b : 0xf0c34b),
        q.x - 12 + i * 3.4, CC.heightAt(q.x - 12 + i * 3.4, q.z + 25) + 0.3, q.z + 25));
    }

    // Tall roadside pylon - the large "Lucky Stop" landmark sign.
    const signX = q.x, signZ = q.z + 27;
    const signY = CC.heightAt(signX, signZ);
    [-2.2, 2.2].forEach(function (ox) {
      beamBetween(g, signX + ox, signY, signZ, signX + ox, signY + 16, signZ, 0.32, concrete);
    });
    const pylon = new THREE.Group();
    pylon.position.set(signX, signY + 13, signZ);
    pylon.add(box(15, 7.2, 1.1, red, 0, 0, 0));
    pylon.add(box(15.6, 0.4, 1.3, yellow, 0, 3.7, 0));
    pylon.add(box(15.6, 0.4, 1.3, yellow, 0, -3.7, 0));
    addShopSign(pylon, 'Lucky Stop', 14, 5.4, 0xd4463f, 0xffe08a, 0, 0, 0.62, 0);
    addShopSign(pylon, 'Lucky Stop', 14, 5.4, 0xd4463f, 0xffe08a, 0, 0, -0.62, Math.PI);
    g.add(pylon);
    Details.luckyStopSign = pylon;

    scene.add(g);
    Details.gasStation = true;
  }

  /* ---------- roadside fast food with drive-thru ---------- */
  function buildFastFood(scene) {
    const q = CC.ImageMap && CC.ImageMap.zones && CC.ImageMap.zones.fastfood;
    if (!q) return;
    const y = CC.heightAt(q.x, q.z);
    const asphalt = 0x2b2c2d;
    // Entry, around-the-building lane and exit, connected to the main road.
    paintRect(scene, q.x + 12, q.z - 14, q.x + 20, q.z + 22, y + 0.07, asphalt);
    paintRect(scene, q.x - 16, q.z - 18, q.x + 20, q.z - 10, y + 0.07, asphalt);
    paintRect(scene, q.x - 20, q.z - 14, q.x - 12, q.z + 22, y + 0.07, asphalt);
    paintRect(scene, q.x - 20, q.z + 20, q.x + 20, q.z + 42, y + 0.07, asphalt);
    for (let i = 0; i < 7; i++) {
      paintLine(scene, q.x + 16, q.z - 8 + i * 4, q.x + 16, q.z - 6 + i * 4,
        y + 0.1, 0xe8e3cf, 0.22);
    }

    const g = new THREE.Group();
    const bx = q.x - 2, bz = q.z - 2;
    const by = CC.heightAt(bx, bz);
    const wall = facadeMat(0xf1e6cf, 'stucco');
    const red = getMat('fastFoodRed', 0xd84538);
    const yellow = getMat('fastFoodYellow', 0xf2c247);
    const dark = getMat('fastFoodDark', 0x34383a);
    const b = new THREE.Group();
    b.position.set(bx, by, bz);
    b.add(box(26, 6.4, 15, wall, 0, 3.2, 0));
    b.add(box(27.5, 0.6, 16.5, red, 0, 6.7, 0));
    b.add(box(27, 0.25, 3.2, yellow, 0, 4.55, 8.1));
    for (let i = 0; i < 9; i++) {
      b.add(box(2.7, 0.08, 3.3, i % 2 ? red : yellow, -11.2 + i * 2.8, 4.7, 8.1));
    }
    // Front counter and windows face the car park.
    b.add(box(9, 3.4, 0.14, getMat('fastGlass', 0x6d9caf, { emissive: 0x173743 }), -7, 2.8, 7.6));
    b.add(box(2.4, 3.4, 0.14, getMat('fastDoor', 0x3f6d79), 3, 1.7, 7.62));
    b.add(box(6.5, 2.6, 0.16, getMat('fastGlass', 0x6d9caf, { emissive: 0x173743 }), 9, 2.8, 7.62));
    addShopSign(b, 'BURGER BAY', 18, 3.5, 0xd84538, 0xfff0c4, 0, 8.4, 7.8, 0);
    // Drive-thru order and pickup windows on the east wall.
    addShopSign(b, 'ORDER', 3.4, 1.1, 0x2e6d4b, 0xffffff, 13.1, 3.3, 3.6, Math.PI / 2);
    addShopSign(b, 'PICK UP', 3.4, 1.1, 0xc06a2c, 0xffffff, 13.1, 3.3, -2.6, Math.PI / 2);
    b.add(box(0.16, 2.4, 3.6, getMat('fastGlass', 0x6d9caf, { emissive: 0x173743 }), 13.08, 2.5, 3.6));
    b.add(box(0.16, 2.4, 3.6, getMat('fastGlass', 0x6d9caf, { emissive: 0x173743 }), 13.08, 2.5, -2.6));
    g.add(b);

    // Menu board and speaker beside the order point.
    const menu = new THREE.Group();
    menu.add(cylinder(0.1, 0.12, 3.1, 6, dark, 0, 1.55, 0));
    menu.add(box(3.2, 2.1, 0.25, dark, 0, 3.25, 0));
    addShopSign(menu, 'MENU', 2.8, 1.7, 0x26343a, 0xffe9b0, 0, 3.3, 0.14, 0);
    menu.position.set(q.x + 17.5, CC.heightAt(q.x + 17.5, q.z + 2), q.z + 2);
    menu.rotation.y = -Math.PI / 2;
    g.add(menu);

    // Roadside pylon sign, visible from the main street.
    const sx = q.x + 14, sz = q.z + 40, sy = CC.heightAt(sx, sz);
    [-2, 2].forEach(function (ox) {
      beamBetween(g, sx + ox, sy, sz, sx + ox, sy + 11, sz, 0.28, dark);
    });
    const pylon = new THREE.Group();
    pylon.position.set(sx, sy + 9.5, sz);
    pylon.add(box(13, 5.6, 1, red, 0, 0, 0));
    pylon.add(box(13.6, 0.35, 1.2, yellow, 0, 2.9, 0));
    pylon.add(box(13.6, 0.35, 1.2, yellow, 0, -2.9, 0));
    addShopSign(pylon, 'BURGER BAY', 12, 4.2, 0xd84538, 0xfff0c4, 0, 0, 0.55, 0);
    addShopSign(pylon, 'BURGER BAY', 12, 4.2, 0xd84538, 0xfff0c4, 0, 0, -0.55, Math.PI);
    addShopSign(pylon, 'DRIVE THRU', 8, 1.5, 0x2e6d4b, 0xffffff, 0, -3.9, 0.55, 0);
    g.add(pylon);

    scene.add(g);
    Details.fastFood = true;
  }

  /* ---------- small jetties along the beach ---------- */
  function buildJetties(scene) {
    const shoreAt = CC.coast && CC.coast.westLine ? CC.coast.westLine : function () { return -300; };
    const woodTex = harborWoodTexture();
    const wood = getMat('jettyWood', 0xa07d54, { map: woodTex });
    const post = getMat('jettyPost', 0x6d5138, { map: woodTex });
    const capMat = getMat('jettyCap', 0xe6d9a8);
    const lampMat = beaconBasic('jettyLamp', 0xffd98a);
    [-180, -125, 250, 310].forEach(function (z, i) {
      const shore = shoreAt(z);
      const length = i % 2 ? 22 : 28;
      const width = 5;
      const x0 = shore + 2, x1 = shore - length;
      const mx = CC.ImageMap && CC.ImageMap.inZone && CC.ImageMap.inZone((x0 + x1) * 0.5, z, 'pier');
      if (mx) return;
      scene.add(box(x0 - x1, 0.35, width, wood, (x0 + x1) * 0.5, 1.15, z));
      for (let x = x1 + 2; x <= x0; x += 5) {
        [-width * 0.5 + 0.4, width * 0.5 - 0.4].forEach(function (dz) {
          beamBetween(scene, x, 0.05, z + dz, x, 1.45, z + dz, 0.16, post);
          const cap = new THREE.Mesh(new THREE.SphereGeometry(0.2, 7, 5), capMat);
          cap.position.set(x, 1.5, z + dz);
          scene.add(cap);
        });
      }
      // A bench and a small lamp make each jetty read as a fishing spot.
      scene.add(box(2.6, 0.12, 1.4, post, x1 + 5, 1.5, z));
      const lampZ = z + width * 0.5 - 0.5;
      scene.add(cylinder(0.08, 0.1, 3.2, 6, post, x1 + 3, 2.8, lampZ));
      scene.add(box(0.85, 0.18, 0.5, lampMat, x1 + 3, 4.5, lampZ));
      Details.jetties++;
    });
  }

  /* ---------- businesses and parking lots ---------- */
  const businessDefs = [
    { name: 'COASTAL FUEL', sub: 'GAS & SNACKS', x: 258, z: -145, w: 18, l: 12, color: 0xe8e2d2, roof: 0xb5553f, stalls: 5, noFence: true },
    { name: 'SEASIDE DINER', sub: 'OPEN ALL DAY', x: -125, z: -145, w: 20, l: 14, color: 0xf0e4c8, roof: 0x3f6b8a, stalls: 6 },
    { name: 'BAY HARDWARE', sub: 'TOOLS & SUPPLIES', x: 258, z: 115, w: 22, l: 14, color: 0xd8dfd2, roof: 0x9a5e3c, stalls: 6, noFrontFence: true },
    { name: 'DRIFTWOOD MOTEL', sub: 'VACANCY', x: -205, z: 212, w: 24, l: 12, color: 0xe6d9c4, roof: 0x6a5a72, stalls: 7 }
  ];

  function parkingTexture(stalls) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#242526'; g.fillRect(0, 0, 512, 128);
    for (let i = 0; i < 1600; i++) {
      const v = Math.floor(U.randRange(rng, 40, 78));
      g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
      g.fillRect(rng() * 512, rng() * 128, 1, 1);
    }
    g.strokeStyle = '#d9d9cf'; g.lineWidth = 3;
    for (let i = 0; i <= stalls; i++) {
      const x = 8 + i * (496 / stalls);
      g.beginPath(); g.moveTo(x, 14); g.lineTo(x, 114); g.stroke();
    }
    g.beginPath(); g.moveTo(8, 114); g.lineTo(504, 114); g.stroke();
    const tex = new THREE.CanvasTexture(c);
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function buildBusinesses(scene) {
    if (!CC.VehicleFactory) return;
    Details.businessSites = [];
    Details.businessFrontFencesSkipped = 0;
    businessDefs.forEach(function (b) {
      const checkFront = b.l * 0.5 + 0.04;
      const checkLotW = b.stalls * 3.4 + 4;
      const checkFx = checkLotW * 0.5 + 2, checkBack = -b.l * 0.5 - 3, checkFrontZ = checkFront + 24;
      // Check the building AND the whole fenced yard, not just the centre, so
      // no rail or parking bay can end up on the asphalt.
      function compoundClear(cx, cz, rot) {
        const cos = Math.cos(rot), sin = Math.sin(rot);
        function world(lx, lz) {
          return { x: cx + lx * cos - lz * sin, z: cz + lx * sin + lz * cos };
        }
        const samples = [];
        [[-checkFx, checkBack], [checkFx, checkBack], [-checkFx, checkFrontZ], [checkFx, checkFrontZ],
         [-4, checkFrontZ], [4, checkFrontZ]].forEach(function (p) { samples.push(world(p[0], p[1])); });
        [-b.w * 0.5, b.w * 0.5].forEach(function (lx) {
          [-b.l * 0.5, b.l * 0.5].forEach(function (lz) { samples.push(world(lx, lz)); });
        });
        // Walk each fence edge as well, so a long rail crossing a road is caught.
        [[-checkFx, checkBack, -checkFx, checkFrontZ], [checkFx, checkBack, checkFx, checkFrontZ],
         [-checkFx, checkBack, checkFx, checkBack], [-checkFx, checkFrontZ, checkFx, checkFrontZ],
         [-checkFx, checkFrontZ, -4, checkFrontZ], [4, checkFrontZ, checkFx, checkFrontZ]].forEach(function (e) {
          const len = Math.hypot(e[2] - e[0], e[3] - e[1]);
          const n = Math.max(2, Math.ceil(len / 2));
          for (let i = 0; i <= n; i++) samples.push(world(U.lerp(e[0], e[2], i / n), U.lerp(e[1], e[3], i / n)));
        });
        for (let i = 0; i < samples.length; i++) {
          const p = samples[i];
          if (!dry(p.x, p.z) || CC.roadClearance(p.x, p.z, 0.6) < 2.5) return false;
        }
        for (let i = 0; i < CC.World.obstacles.length; i++) {
          const o = CC.World.obstacles[i];
          if (o.type === 'tree' || o.type === 'bush') continue;
          if (U.distance2D(cx, cz, o.x, o.z) < o.r + 11) return false;
        }
        return true;
      }
      let x = b.x, z = b.z, rot = 0, ok = false;
      for (let attempt = 0; attempt < 64 && !ok; attempt++) {
        const ang = attempt * 2.399;
        const rad = Math.floor(attempt / 8) * 11;
        const tx = b.x + Math.cos(ang) * rad;
        const tz = b.z + Math.sin(ang) * rad;
        if (!dry(tx, tz) || isRoad(tx, tz)) continue;
        const base = Math.atan2(-tx, -tz) + Math.PI;
        const rotations = [base, base + Math.PI * 0.5, base - Math.PI * 0.5, base + Math.PI];
        for (let r = 0; r < rotations.length && !ok; r++) {
          if (compoundClear(tx, tz, rotations[r])) {
            x = tx; z = tz; rot = rotations[r]; ok = true;
          }
        }
      }
      if (!ok) return;
      const y = CC.heightAt(x, z);
      const g = new THREE.Group();

      // Building body and roof.
      const wall = facadeMat(b.color, 'brick');
      const roof = getMat('bizRoof' + b.name, b.roof);
      g.add(box(b.w, 4.6, b.l, wall, 0, 2.3, 0));
      g.add(box(b.w + 1.2, 0.5, b.l + 1.2, roof, 0, 4.85, 0));
      // Horizontal siding lines.
      const siding = getMat('bizSiding', 0xbfc3ba);
      for (let ry = 0.7; ry < 4.5; ry += 0.85) {
        g.add(box(b.w + 0.06, 0.08, b.l + 0.06, siding, 0, ry, 0));
      }
      // Storefront glazing and door on the front (+Z) face.
      const glass = new THREE.MeshStandardMaterial({
        color: 0x9fc4d4, emissive: 0x18303a, emissiveIntensity: 0.35,
        metalness: 0.25, roughness: 0.25
      });
      const doorMat = getMat('bizDoor', 0x6b4a33);
      const front = b.l * 0.5 + 0.04;
      const winW = b.w / 5;
      for (let i = 0; i < 5; i++) {
        if (i === 2) {
          g.add(box(winW * 0.8, 2.9, 0.14, doorMat, (i - 2) * winW, 1.45, front));
          g.add(box(0.16, 0.16, 0.16, getMat('bizKnob', 0xd9c27a), (i - 2) * winW + 0.5, 1.5, front + 0.12));
        } else {
          g.add(box(winW * 0.85, 2.3, 0.14, glass, (i - 2) * winW, 2.5, front));
        }
      }
      // Awning.
      g.add(box(b.w + 1, 0.22, 2.6, roof, 0, 4.0, front + 1.3));
      // Fascia sign with business name.
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(Math.min(b.w, 20), 2.1),
        new THREE.MeshLambertMaterial({ map: signFaceTexture(b.name, 'plain'), side: THREE.DoubleSide })
      );
      sign.position.set(0, 5.9, front + 0.3);
      g.add(sign);
      g.add(box(0.16, 0.16, 0.16, roof, 0, 5.0, front + 1.0));

      // Parking lot in front of the building.
      const lotZ = front + 12;
      const lotW = b.stalls * 3.4 + 4;
      const lot = new THREE.Mesh(new THREE.PlaneGeometry(lotW, 20),
        new THREE.MeshLambertMaterial({ map: parkingTexture(b.stalls) }));
      lot.rotation.x = -Math.PI / 2;
      lot.position.set(0, 0.07, lotZ);
      lot.receiveShadow = true;
      g.add(lot);
      // Parked cars in the stalls.
      const carColors = [0xd9d6c9, 0x7d9ab5, 0xc67d6a, 0x9fb08b, 0xd6b45f, 0xe8e5dc];
      for (let i = 0; i < b.stalls; i++) {
        if (rng() < 0.25) continue;
        const cx = (i - (b.stalls - 1) / 2) * 3.4;
        const car = CC.VehicleFactory.build(rng() < 0.2 ? 'truck' : 'car',
          carColors[Math.floor(rng() * carColors.length)]);
        car.group.position.set(cx, 0.08, lotZ + (rng() < 0.5 ? 3.5 : -3.5));
        car.group.rotation.y = (rng() < 0.5 ? 0 : Math.PI) + (rng() - 0.5) * 0.05;
        g.add(car.group);
        Details.parkedVehicles++;
      }

      // Perimeter fence with an entrance gap at the front. The former
      // COASTAL FUEL site sits inside the Lucky Stop apron, so it stays open.
      const fx = lotW * 0.5 + 2, fzBack = -b.l * 0.5 - 3, fzFront = front + 24;
      if (!b.noFence) {
        const fenceMat = getMat('bizFence', 0xcfd3cb);
        function fenceRun(ax, az, bx2, bz2) {
          const len = Math.hypot(bx2 - ax, bz2 - az) || 1;
          // Rails are X-aligned boxes: local +X must map to (dx,dz) after Y rotation.
          const yaw = Math.atan2(-(bz2 - az), bx2 - ax);
          const n = Math.max(2, Math.floor(len / 2.4));
          for (let i = 0; i <= n; i++) {
            const t = i / n;
            const p = box(0.14, 1.6, 0.14, fenceMat, U.lerp(ax, bx2, t), 0.8, U.lerp(az, bz2, t));
            p.rotation.y = yaw;
            g.add(p);
          }
          [0.55, 1.25].forEach(function (ry) {
            const rail = box(len, 0.1, 0.1, fenceMat, (ax + bx2) / 2, ry, (az + bz2) / 2);
            rail.rotation.y = yaw;
            g.add(rail);
          });
        }
        fenceRun(-fx, fzBack, -fx, fzFront);
        fenceRun(fx, fzBack, fx, fzFront);
        fenceRun(-fx, fzBack, fx, fzBack);
        if (!b.noFrontFence) {
          fenceRun(-fx, fzFront, -4, fzFront);
          fenceRun(4, fzFront, fx, fzFront);
        } else {
          // Bay Hardware's frontage faces the North Shops bus stop, so the
          // sidewalk stays open all the way across the property line.
          Details.businessFrontFencesSkipped = (Details.businessFrontFencesSkipped || 0) + 1;
        }
        Details.businessFences = (Details.businessFences || 0) + 1;
      }

      g.position.set(x, y, z);
      g.rotation.y = rot;
      scene.add(g);
      Details.businessSites.push({
        name: b.name, x: x, z: z, rot: rot,
        fx: fx, fzBack: fzBack, fzFront: fzFront
      });
      CC.World.obstacles.push({ x: x, z: z, r: Math.max(b.w, b.l) * 0.52, type: 'landmark' });
      Details.businesses = (Details.businesses || 0) + 1;
    });
  }

  /* ---------- community sites ---------- */
  function serviceSite(name) {
    const zones = CC.ImageMap && CC.ImageMap.zones;
    const q = zones && zones[name];
    if (!q) return null;
    const g = new THREE.Group();
    g.position.set(q.x, CC.heightAt(q.x, q.z), q.z);
    return { q: q, g: g, name: name };
  }
  function servicePad(g, w, d, color, y) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(color, { side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = y == null ? 0.06 : y;
    m.receiveShadow = true;
    g.add(m);
    return m;
  }
  function serviceFence(g, w, d, gateHalf) {
    const fence = getMat('serviceFence', 0xc8ccc3);
    const hw = w * 0.5, hd = d * 0.5, gate = gateHalf || 4;
    function run(ax, az, bx, bz) {
      const len = Math.hypot(bx - ax, bz - az) || 1;
      const yaw = Math.atan2(-(bz - az), bx - ax);
      const n = Math.max(2, Math.ceil(len / 3));
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        g.add(box(0.14, 1.65, 0.14, fence, U.lerp(ax, bx, t), 0.83, U.lerp(az, bz, t)));
      }
      [0.55, 1.3].forEach(function (ry) {
        const rail = box(len, 0.1, 0.1, fence, (ax + bx) * 0.5, ry, (az + bz) * 0.5);
        rail.rotation.y = yaw;
        g.add(rail);
      });
    }
    run(-hw, -hd, hw, -hd);
    run(-hw, -hd, -hw, hd);
    run(hw, -hd, hw, hd);
    run(-hw, hd, -gate, hd);
    run(gate, hd, hw, hd);
  }
  function servicePylon(g, text, x, z, bg, fg, height) {
    const post = getMat('servicePylonPost', 0x5b6064);
    beamBetween(g, x, 0, z, x, height, z, 0.24, post);
    addShopSign(g, text, 13, 3, bg, fg, x, height - 0.6, z, 0);
    addShopSign(g, text, 13, 3, bg, fg, x, height - 0.6, z, Math.PI);
  }
  function serviceObstacle(site, ox, oz, r) {
    CC.World.obstacles.push({ x: site.q.x + ox, z: site.q.z + oz, r: r, type: 'landmark' });
  }
  function serviceDone(site) {
    sceneAdd(site.g);
    Details.communitySites++;
    Details.communitySiteNames.push(site.name);
  }
  // Kept as a tiny wrapper so each builder reads the same as the older ones.
  let serviceScene = null;
  function sceneAdd(group) { if (serviceScene) serviceScene.add(group); }

  // A compact storefront shell shared by the six small town businesses.
  function storeShell(site, opts) {
    const g = site.g, q = site.q;
    const w = Math.min(opts.w || 24, q.w - 13);
    const l = 10, wallH = 5.2;
    const bz = -Math.max(4, q.h * 0.16);
    const wall = facadeMat(opts.wall, 'stucco');
    const roof = getMat('svcRoof' + site.name, opts.roof);
    g.add(box(w, wallH, l, wall, 0, wallH * 0.5, bz));
    g.add(box(w + 1.2, 0.5, l + 1.2, roof, 0, wallH + 0.25, bz));
    // Trim and corner pilasters keep the small boxes from looking like sheds.
    [-w * 0.5 + 0.5, w * 0.5 - 0.5].forEach(function (x) {
      g.add(box(0.9, wallH + 0.5, 0.9, roof, x, (wallH + 0.5) * 0.5, bz + l * 0.5 - 0.4));
    });
    const front = bz + l * 0.5 + 0.06;
    const glass = getMat('svcGlass' + site.name, 0x9fc4d4, { emissive: 0x183440 });
    const door = getMat('svcDoor' + site.name, 0x3f4a50);
    for (let i = -2; i <= 2; i++) {
      const wx = i * (w / 5.4);
      if (i === 0) {
        g.add(box(2.1, 3.1, 0.14, door, wx, 1.55, front));
        g.add(box(0.14, 0.14, 0.14, getMat('svcKnob', 0xe0c976), wx + 0.7, 1.55, front + 0.12));
      } else {
        g.add(box(w / 6, 2.4, 0.14, glass, wx, 2.7, front));
      }
    }
    g.add(box(w + 0.8, 0.22, 1.9, roof, 0, 4.0, front + 0.85));
    addShopSign(g, opts.sign || opts.name, Math.min(w - 1, 22), 3.1, opts.bg, opts.fg,
      0, wallH + 2.1, front + 0.1, 0);
    addShopSign(g, opts.sign || opts.name, Math.min(w - 1, 22), 3.1, opts.bg, opts.fg,
      0, wallH + 2.1, bz - l * 0.5 - 0.1, Math.PI);

    const lotBack = front + 1.9;
    const lotFront = q.h * 0.5 - 1.6;
    const lotDepth = Math.max(7, lotFront - lotBack);
    const lotCenter = (lotFront + lotBack) * 0.5;
    servicePad(g, q.w - 5, lotDepth, 0x424647, 0.07).position.z = lotCenter;
    const lineMat = getMat('svcLotLine', 0xe8e8df);
    const stalls = Math.max(3, Math.floor((q.w - 9) / 3.4));
    for (let i = 0; i <= stalls; i++) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.12, lotDepth - 1.6), lineMat);
      line.rotation.x = -Math.PI / 2;
      line.position.set((i - stalls * 0.5) * 3.4, 0.09, lotCenter);
      g.add(line);
    }
    // BAY LIQUOR keeps an open forecourt so nothing can jut into the street.
    if (opts.fence !== false) serviceFence(g, q.w - 3, q.h - 3, 4);
    serviceObstacle(site, 0, bz, Math.max(w, l) * 0.5);
    return { front: front, lotCenter: lotCenter, bz: bz, w: w, wallH: wallH };
  }

  const communityShops = [
    { zone: 'nightclub', name: 'THE CORAL CLUB', sign: 'CORAL CLUB', wall: 0x5c3365, roof: 0x271b34,
      bg: 0x321342, fg: 0xff77c4 },
    { zone: 'pawn', name: 'HARBOR PAWN', sign: 'PAWN & LOAN', wall: 0x8f8869, roof: 0x5b5036,
      bg: 0x4d432a, fg: 0xf2cf68 },
    { zone: 'liquor', name: 'BAY LIQUOR', sign: 'LIQUOR STORE', wall: 0x6d8a6e, roof: 0x34503b,
      bg: 0x21442e, fg: 0xeaf3d9, fence: false },
    { zone: 'postOffice', name: 'COASTAL POST OFFICE', sign: 'POST OFFICE', wall: 0xb27662, roof: 0x6d4640,
      bg: 0x234f73, fg: 0xffffff, w: 28 },
    { zone: 'massage', name: 'SERENITY MASSAGE', sign: 'MASSAGE', wall: 0x9c86a8, roof: 0x5d4a68,
      bg: 0x5b466c, fg: 0xffe1ad },
    { zone: 'gunStore', name: 'SHORE GUNS & AMMO', sign: 'GUNS & AMMO', wall: 0x747c78, roof: 0x3d4644,
      bg: 0x2f3a38, fg: 0xe7d8a8 },
    { zone: 'chinese', name: 'GOLDEN DRAGON', sign: 'GOLDEN DRAGON', wall: 0xa94b3f, roof: 0x7b241f,
      bg: 0x8f1f1a, fg: 0xffd469, w: 28 }
  ];

  function buildCommunityShops() {
    Details.nightlifeSpots.length = 0;
    communityShops.forEach(function (def) {
      const site = serviceSite(def.zone);
      if (!site) return;
      const s = storeShell(site, def);
      const fg = getMat('svcAccent' + def.zone, def.fg);
      if (def.zone === 'nightclub') {
        // Neon framing and flashing front lights.
        const neonMats = [];
        [-s.w * 0.48, s.w * 0.48].forEach(function (x) {
          const m = getMat('clubNeonSide' + (x < 0 ? 'L' : 'R'), 0xff6fbd, { emissive: 0xc42d84 });
          neonMats.push(m);
          site.g.add(box(0.16, 4.4, 0.16, m, x, 2.6, s.front + 0.2));
        });
        // Front neon strips above door
        [0xff44aa, 0x44ddff, 0xffd166, 0x7cff6b].forEach(function (c, i) {
          const m = mat(c, { emissive: c });
          neonMats.push(m);
          site.g.add(box(2.2, 0.12, 0.12, m, -3.3 + i * 2.2, 4.7, s.front + 0.22));
        });
        // Ground/front flashing beacons
        [-4, -2, 0, 2, 4].forEach(function (x, i) {
          const c = [0xff3f8e, 0x47e0ff, 0xffe066, 0x7dff70, 0xff7a3c][i];
          const m = mat(c, { emissive: c });
          neonMats.push(m);
          const b = box(0.35, 0.35, 0.35, m, x, 0.35, s.front + 1.8);
          site.g.add(b);
        });
        Details.clubNeon = Details.clubNeon || [];
        neonMats.forEach(function (m, i) { Details.clubNeon.push({ mat: m, phase: i * 0.7 }); });
        addShopSign(site.g, 'OPEN LATE', 8, 1.5, 0x24102e, 0xffd166, 0, 2.0, s.front + 1.0, 0);
        Details.nightlifeSpots.push({
          name: 'THE CORAL CLUB', x: site.q.x, z: site.q.z + site.q.h * 0.5 + 6, spread: 12
        });
        // Parking lot NPCs and entrance NPC spots for Coral Club.
        const lotZ1 = s.lotCenter;
        for (let i = 0; i < 6; i++) {
          const wx = site.q.x + ((i % 3) - 1) * 4.5;
          const wz = site.q.z + lotZ1 + (i < 3 ? -2.5 : 2.5);
          Details.clubParkingSpots.push({ x: wx, z: wz });
        }
        for (let i = 0; i < 3; i++) {
          Details.clubEntranceSpots.push({ x: site.q.x + (i - 1) * 1.8, z: site.q.z + s.front + 1.2 });
        }
        // 10 parked cars in the Coral Club lot.
        if (CC.VehicleFactory) {
          const carColors = [0xd9d6c9, 0x7d9ab5, 0xc67d6a, 0x9fb08b, 0xd6b45f, 0xe8e5dc, 0x25282d, 0x8d2f2f];
          const kinds = ['car', 'coupe', 'muscleCar', 'compact', 'truck'];
          for (let i = 0; i < 10; i++) {
            const row = i < 5 ? -1 : 1;
            const col = i % 5;
            const cx = (col - 2) * 3.4;
            const cz = s.lotCenter + row * 3.4;
            const car = CC.VehicleFactory.build(kinds[i % kinds.length], carColors[i % carColors.length]);
            car.group.position.set(cx, 0.1, cz);
            car.group.rotation.y = row > 0 ? Math.PI : 0;
            site.g.add(car.group);
            Details.parkedVehicles++;
          }
        }
      } else if (def.zone === 'pawn') {
        [-5.5, 5.5].forEach(function (x) {
          const ball = new THREE.Mesh(new THREE.SphereGeometry(0.65, 10, 8),
            getMat('pawnBall', 0xe4b84b));
          ball.position.set(x, 7.8, s.front);
          site.g.add(ball);
        });
      } else if (def.zone === 'liquor') {
        [-6, -3, 3, 6].forEach(function (x, i) {
          const bottle = getMat('liquorBottle' + i, [0x3f7d4d, 0x8e4b2e, 0x365d78, 0x8c7535][i]);
          site.g.add(cylinder(0.22, 0.28, 1.1, 8, bottle, x, 3.1, s.front + 0.25));
          site.g.add(cylinder(0.09, 0.09, 0.5, 8, bottle, x, 3.85, s.front + 0.25));
        });
      } else if (def.zone === 'postOffice') {
        const poleX = -s.w * 0.5 - 2.2, poleZ = s.bz + 2;
        beamBetween(site.g, poleX, 0, poleZ, poleX, 10, poleZ, 0.09, getMat('flagPole', 0xd6d8d2));
        const flag = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.8),
          mat(0xce4238, { side: THREE.DoubleSide }));
        flag.position.set(poleX + 1.7, 8.9, poleZ);
        site.g.add(flag);
        [-4, 4].forEach(function (x) {
          site.g.add(box(1.3, 1.6, 1.0, getMat('mailbox', 0x2f5f8d), x, 0.8, s.front + 3));
        });
        site.g.add(box(4.4, 3.4, 0.2, getMat('loadingDoor', 0x8b8f8a), s.w * 0.5 - 4, 1.7, s.bz - 5.1));
      } else if (def.zone === 'massage') {
        [-5, 0, 5].forEach(function (x) {
          site.g.add(cylinder(0.42, 0.5, 0.9, 8,
            getMat('lotus', 0xe9c2a4), x, 0.45, s.front + 4.5));
        });
      } else if (def.zone === 'gunStore') {
        for (let i = -2; i <= 2; i++) {
          if (!i) continue;
          site.g.add(box(0.1, 2.5, 0.12, getMat('securityBar', 0x343b3d),
            i * (s.w / 5.4), 2.7, s.front + 0.16));
        }
      } else if (def.zone === 'chinese') {
        [0, 1].forEach(function (tier) {
          site.g.add(box(s.w + 4 - tier * 5, 0.42, 14 - tier * 3,
            getMat('pagodaRoof' + tier, 0x8f241e), 0, s.wallH + 1.4 + tier * 1.5, s.bz - tier));
        });
        [-s.w * 0.4, s.w * 0.4].forEach(function (x) {
          site.g.add(cylinder(0.06, 0.06, 2.2, 6, getMat('lanternCord', 0x3a2b22),
            x, 4.4, s.front + 1.2));
          site.g.add(new THREE.Mesh(new THREE.SphereGeometry(0.62, 10, 8),
            getMat('lantern', 0xe34a35, { emissive: 0x8c1d14 })).translateX(x).translateY(3.2).translateZ(s.front + 1.2));
        });
      }
      serviceDone(site);
    });
  }

  function buildRealtyOffice(scene) {
    const site = serviceSite('realty');
    if (!site) return;
    const g = site.g, q = site.q;
    // The lot is north of Main Street, so turn the shared +Z frontage toward
    // the road (−Z in world space).
    g.rotation.y = Math.PI;
    servicePad(g, q.w - 3, q.h - 3, 0x747068, 0.06);

    const w = 21, l = 9, wallH = 4.8, bz = -5.5;
    const wall = facadeMat(0xd9d1be, 'stucco');
    const roof = getMat('realtyRoof', 0x27313a);
    const trim = getMat('realtyTrim', 0xf1ede2);
    const glass = getMat('realtyGlass', 0x9fc4d4, { emissive: 0x183440 });
    g.add(box(w, wallH, l, wall, 0, wallH * 0.5, bz));
    g.add(box(w + 1.2, 0.45, l + 1.2, roof, 0, wallH + 0.25, bz));
    const front = bz + l * 0.5 + 0.07;
    [-w * 0.5 + 0.6, w * 0.5 - 0.6].forEach(function (x) {
      g.add(box(0.8, wallH + 0.45, 0.8, roof, x, (wallH + 0.45) * 0.5, front - 0.3));
    });
    g.add(box(2.2, 3.0, 0.14, getMat('realtyDoor', 0x3d474c), 0, 1.5, front));
    [-w * 0.31, w * 0.31].forEach(function (x) {
      g.add(box(4.2, 2.1, 0.12, glass, x, 2.7, front));
    });
    g.add(box(w + 0.6, 0.18, 1.8, trim, 0, 3.95, front + 0.85));
    addHarberSign(g, 'office', 16, 2.5, 0, wallH + 1.8, front + 0.12, 0);

    // Asphalt drive runs from the office to the Main Street shoulder.
    const driveLen = q.h * 0.5 - front + 3;
    servicePad(g, 7.2, driveLen, 0x3e4243, 0.08).position.z = front + driveLen * 0.5 - 1;

    // Freestanding street sign, same black-and-white branding as the office.
    const signZ = q.h * 0.5 - 2.8;
    beamBetween(g, 0, 0, signZ, 0, 4.4, signZ, 0.18,
      getMat('realtySignPost', 0x33383b));
    Details.realtySign = addHarberSign(g, 'office', 9.5, 3.1, 0, 4.0, signZ, 0);

    // Large black SUV and a small golf cart parked side by side in the drive.
    const suv = CC.VehicleFactory.build('truck', 0x08090c);
    suv.group.scale.setScalar(1.08);
    suv.group.position.set(-3.6, 0.1, q.h * 0.5 - 6.4);
    suv.group.rotation.y = 0.04;
    g.add(suv.group);
    const cart = CC.VehicleFactory.build('cart', 0xe8e2cf);
    cart.group.position.set(4.1, 0.1, q.h * 0.5 - 8.1);
    cart.group.rotation.y = -0.12;
    g.add(cart.group);
    Details.realtyVehicles = 2;
    Details.realtyVehicleKinds = ['truck', 'cart'];

    CC.World.obstacles.push({ x: q.x, z: q.z - bz, r: Math.max(w, l) * 0.5, type: 'landmark' });
    Details.realty = true;
    Details.realtyName = HARBER_NAME;
    Details.realtyPhone = HARBER_PHONE;
    serviceDone(site);
  }

  function buildMotel(scene) {
    const site = serviceSite('motel');
    if (!site) return;
    const g = site.g, q = site.q;
    const asphalt = 0x4d4c4a;
    servicePad(g, q.w - 3, q.h - 3, 0x77706a, 0.06);
    serviceFence(g, q.w - 3, q.h - 3, 5.5);

    // Two-storey room block along the back of the lot.
    const blockW = 42, blockL = 10, bz = -9;
    const wall = facadeMat(0xb9a48f, 'stucco');
    const roof = getMat('motelRoof', 0x5c342f);
    const trim = getMat('motelTrim', 0xe8d9b8);
    const concrete = getMat('motelConcrete', 0x9d9489);
    g.add(box(blockW, 6.8, blockL, wall, 0, 3.4, bz));
    g.add(box(blockW + 1.6, 0.6, blockL + 1.6, roof, 0, 7.1, bz));
    g.add(box(blockW + 0.8, 0.25, 2.7, concrete, 0, 3.55, bz + blockL * 0.5 + 1.2));
    [-blockW * 0.5 + 1.5, blockW * 0.5 - 1.5].forEach(function (x) {
      g.add(box(2.6, 0.22, 2.7, concrete, x, 5.25, bz + blockL * 0.5 + 1.2));
      for (let st = 0; st < 6; st++) {
        g.add(box(2.6, 0.18, 0.5, concrete, x, 0.55 + st * 0.8, bz + blockL * 0.5 + 2.4 - st * 0.42));
      }
    });
    const doorMat = getMat('motelDoor', 0x4b3941);
    const glow = getMat('motelRoomGlow', 0xffd98c, { emissive: 0xffb64d, emissiveIntensity: 0.5 });
    const darkGlass = getMat('motelGlass', 0x284b58, { emissive: 0x0c222c });
    for (let i = 0; i < 10; i++) {
      const x = (i - 4.5) * 4.05;
      [1.35, 4.85].forEach(function (y, tier) {
        g.add(box(2.2, 2.9, 0.16, doorMat, x, y, bz + blockL * 0.5 + 0.12));
        g.add(box(1.35, 0.85, 0.1, (i + tier) % 3 === 0 ? glow : darkGlass,
          x + 0.25, y + 0.85, bz + blockL * 0.5 + 0.23));
        g.add(box(0.12, 0.12, 0.12, trim, x - 0.82, y, bz + blockL * 0.5 + 0.24));
        g.add(box(2.5, 0.16, 0.5, roof, x, y + 1.6, bz + blockL * 0.5 + 0.32));
      });
    }
    // Small office tucked beside the room block.
    g.add(box(9, 4.4, 7, wall, -q.w * 0.5 + 8, 2.2, 5));
    g.add(box(9.8, 0.4, 7.8, roof, -q.w * 0.5 + 8, 4.6, 5));
    g.add(box(1.8, 2.8, 0.14, glow, -q.w * 0.5 + 8, 1.4, 8.6));
    addShopSign(g, 'OFFICE', 5.5, 1.4, 0x3b2430, 0xffdf9a,
      -q.w * 0.5 + 8, 3.6, 8.75, 0);

    // Striped parking apron in front of the rooms.
    servicePad(g, q.w - 6, 23, asphalt, 0.07).position.z = 6;
    const lineMat = getMat('motelLotLine', 0xf0e5c5);
    for (let i = 0; i <= 11; i++) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 19), lineMat);
      line.rotation.x = -Math.PI / 2;
      line.position.set((i - 5.5) * 3.8, 0.09, 6);
      g.add(line);
    }
    const carColors = [0xc9c3b6, 0x6d889f, 0xb56d5e, 0x8ca178];
    [-3, 3].forEach(function (x, i) {
      const car = CC.VehicleFactory.build(i ? 'coupe' : 'compact', carColors[i]);
      car.group.position.set(x, 0.1, 7 + i * 2);
      car.group.rotation.y = Math.PI * (i ? 0.08 : 1.08);
      g.add(car.group);
    });

    // Road-facing pylon: both lines are large, bright and readable at night.
    const post = getMat('motelPylonPost', 0x3e4042);
    [-7.5, 7.5].forEach(function (x) {
      beamBetween(g, x, 0, 18.5, x, 11.5, 18.5, 0.32, post);
    });
    addShopSign(g, 'NO TELL MOTEL', 20, 4.6, 0x48112f, 0xff56a8, 0, 10.3, 18.55, 0);
    addShopSign(g, 'HOURLY RATES AVAILABLE', 20, 2.8, 0x17131f, 0xffd166, 0, 7.3, 18.55, 0);
    const bulbMat = getMat('motelBulb', 0xffe8a8, { emissive: 0xffb43c, emissiveIntensity: 0.9 });
    for (let i = 0; i < 18; i++) {
      const a = i / 18 * Math.PI * 2;
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), bulbMat);
      bulb.position.set(Math.cos(a) * 10.4, 10.3 + Math.sin(a) * 2.5, 18.7);
      g.add(bulb);
    }
    [-10.8, 10.8].forEach(function (x) {
      g.add(cylinder(0.16, 0.2, 5.5, 6, post, x, 2.75, 18.5));
      g.add(box(1.3, 0.5, 0.5, bulbMat, x, 5.6, 18.5));
    });

    serviceObstacle(site, 0, bz, 21);
    Details.motel = true;
    Details.motelSigns = 2;
    Details.motelSpots.push({
      name: 'NO TELL MOTEL', x: q.x, z: q.z + 6, spread: 12, motel: true
    });
    Details.nightlifeSpots.push({
      name: 'NO TELL MOTEL', x: q.x, z: q.z + 7, spread: 12, motel: true
    });
    serviceDone(site);
  }

  function buildWaterTreatment() {
    const site = serviceSite('treatment');
    if (!site) return;
    const g = site.g, q = site.q;
    servicePad(g, q.w - 4, q.h - 4, 0x9a9e9a, 0.06);
    serviceFence(g, q.w - 4, q.h - 4, 6);
    const concrete = getMat('treatConcrete', 0x929996);
    const water = getMat('treatWater', 0x3d8fb1, { emissive: 0x123c4f });
    // Four settling basins with low walls and a blue water surface.
    [-30, -2].forEach(function (x) {
      [-22, 8].forEach(function (z) {
        g.add(box(24, 1.8, 15, concrete, x, 0.9, z));
        const pool = new THREE.Mesh(new THREE.PlaneGeometry(21.5, 12.5), water);
        pool.rotation.x = -Math.PI / 2; pool.position.set(x, 1.84, z); g.add(pool);
        for (let i = -1; i <= 1; i++) {
          g.add(box(0.45, 0.35, 12.5, concrete, x + i * 6.4, 1.95, z));
        }
      });
    });
    // Two circular clarifiers with rotating scraper arms.
    [[27, -20, 13], [27, 19, 10]].forEach(function (t, i) {
      const x = t[0], z = t[1], r = t[2];
      g.add(cylinder(r, r, 1.7, 26, concrete, x, 0.85, z));
      const pool = new THREE.Mesh(new THREE.CircleGeometry(r - 1.1, 26), water);
      pool.rotation.x = -Math.PI / 2; pool.position.set(x, 1.76, z); g.add(pool);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(r - 0.2, 0.3, 6, 26), getMat('treatRim', 0xb9c0bc));
      rim.rotation.x = -Math.PI / 2; rim.position.set(x, 1.78, z); g.add(rim);
      g.add(cylinder(0.9, 0.9, 2.4, 10, concrete, x, 2.9, z));
      const arm = box(r * 1.75, 0.28, 0.5, getMat('treatArm', 0xd0d4cf), x, 3.7, z);
      arm.rotation.y = i ? 0.7 : -0.4; g.add(arm);
      serviceObstacle(site, x, z, r);
    });
    // Pipe runs and a small control house.
    [-28, 4, 34].forEach(function (x) {
      beamBetween(g, x, 2.2, -38, x, 2.2, 36, 0.42, getMat('treatPipe', 0x6f8b8e));
    });
    g.add(box(19, 5.2, 13, getMat('treatOffice', 0xd7d2c4), -31, 2.6, 32));
    g.add(box(20, 0.5, 14, concrete, -31, 5.4, 32));
    addShopSign(g, 'WATER TREATMENT', 15, 2.6, 0x22577a, 0xffffff, -31, 6.7, 38.7, 0);
    servicePylon(g, 'WATER WORKS', -42, 40, 0x22577a, 0xffffff, 9);
    serviceObstacle(site, -31, 32, 11);
    serviceDone(site);
  }

  function buildFuelStorage() {
    const site = serviceSite('fuelStorage');
    if (!site) return;
    const g = site.g, q = site.q;
    servicePad(g, q.w - 4, q.h - 4, 0xa09d94, 0.06);
    serviceFence(g, q.w - 4, q.h - 4, 5);
    const bund = getMat('fuelBund', 0xb2aca0);
    const tankMat = getMat('fuelTank', 0xd8d9d1);
    const bandMat = getMat('fuelBand', 0x9aa0a0);
    [[-22, -16], [8, -16], [-22, 14], [8, 14]].forEach(function (p) {
      const x = p[0], z = p[1];
      g.add(box(18, 0.9, 18, bund, x, 0.45, z));
      g.add(cylinder(6.4, 6.4, 10, 20, tankMat, x, 5.9, z));
      const dome = new THREE.Mesh(new THREE.SphereGeometry(6.4, 20, 8), tankMat);
      dome.scale.y = 0.32; dome.position.set(x, 10.9, z); g.add(dome);
      [3.2, 6.4, 9.4].forEach(function (y) {
        const band = new THREE.Mesh(new THREE.TorusGeometry(6.45, 0.16, 5, 20), bandMat);
        band.rotation.x = -Math.PI / 2; band.position.set(x, y, z); g.add(band);
      });
      serviceObstacle(site, x, z, 7);
    });
    beamBetween(g, -22, 3.4, -16, 8, 3.4, -16, 0.32, bandMat);
    beamBetween(g, -22, 3.4, 14, 8, 3.4, 14, 0.32, bandMat);
    beamBetween(g, -22, 3.4, -16, -22, 3.4, 14, 0.32, bandMat);
    beamBetween(g, 8, 3.4, -16, 8, 3.4, 14, 0.32, bandMat);
    const pumpMat = getMat('fuelPump', 0xd9b04b);
    g.add(box(11, 0.3, 6, getMat('fuelIsland', 0x8b8e8a), 29, 0.15, 0));
    [-3, 3].forEach(function (z) {
      g.add(box(1.6, 2.5, 1.2, pumpMat, 29, 1.55, z));
    });
    servicePylon(g, 'FUEL DEPOT', 32, 26, 0x8a6a24, 0xfff0bc, 8);
    serviceDone(site);
  }

  function airportPlane(site, x, z, yaw) {
    const p = new THREE.Group();
    const body = getMat('planeBody', 0xe9eae5);
    const trim = getMat('planeTrim', 0x3f6f96);
    const fus = cylinder(0.95, 0.95, 8.5, 12, body, 0, 0, 0);
    fus.rotation.x = Math.PI / 2; p.add(fus);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.95, 12, 8), body);
    nose.position.z = 4.25; p.add(nose);
    p.add(box(14, 0.28, 2.1, body, 0, 0.2, 0.4));
    p.add(box(5, 0.24, 1.5, body, 0, 1.1, -3.5));
    p.add(box(0.24, 2.6, 2.0, trim, 0, 1.8, -4.0));
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.72, 10, 7),
      getMat('planeGlass', 0x9fc4d4, { emissive: 0x183440 }));
    canopy.scale.set(0.85, 0.62, 1.6); canopy.position.set(0, 0.85, 1.45); p.add(canopy);
    const prop = new THREE.Group();
    prop.add(box(0.16, 3.1, 0.1, trim, 0, 0, 0));
    prop.add(box(3.1, 0.16, 0.1, trim, 0, 0, 0));
    prop.position.set(0, 0, 4.9); p.add(prop);
    [-3.6, 3.6].forEach(function (wx) {
      const wheel = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), getMat('planeWheel', 0x2d3133));
      wheel.position.set(wx, -0.85, 0.6); p.add(wheel);
    });
    p.position.set(x, 1.3, z); p.rotation.y = yaw;
    site.g.add(p);
    registerAircraftSpawn('plane', site, x, z, yaw, prop).model = p;
    return p;
  }

  function airportHelicopter(site, x, z, yaw) {
    const h = new THREE.Group();
    const body = getMat('heliBody', 0xd94f42);
    const glass = getMat('heliGlass', 0x9fc4d4, { emissive: 0x183440 });
    const trim = getMat('heliTrim', 0x3b4145);
    const shell = new THREE.Mesh(new THREE.SphereGeometry(1.5, 12, 8), body);
    shell.scale.set(1.05, 0.9, 1.8); shell.position.y = 0; h.add(shell);
    const bubble = new THREE.Mesh(new THREE.SphereGeometry(1.0, 12, 8), glass);
    bubble.scale.set(0.9, 0.8, 1.15); bubble.position.set(0, 0.2, 1.7); h.add(bubble);
    h.add(box(0.5, 0.5, 5.4, body, 0, 0.4, -3.4));
    h.add(box(0.14, 1.6, 0.9, body, 0, 1.05, -5.6));
    for (const s of [-1, 1]) {
      h.add(box(0.16, 0.16, 4.4, trim, s * 1.1, -1.35, 0));
      for (const zz of [-1.3, 1.3]) {
        h.add(box(0.12, 1.0, 0.12, trim, s * 1.1, -0.85, zz));
      }
    }
    const rotor = new THREE.Group();
    rotor.add(box(10.8, 0.12, 0.32, trim, 0, 0, 0));
    rotor.add(box(0.32, 0.12, 10.8, trim, 0, 0, 0));
    rotor.position.y = 1.9; h.add(rotor);
    const tailRotor = new THREE.Group();
    tailRotor.add(box(0.1, 1.9, 0.12, trim, 0, 0, 0));
    tailRotor.add(box(0.1, 0.12, 1.9, trim, 0, 0, 0));
    tailRotor.position.set(0.32, 1.05, -5.6); h.add(tailRotor);
    h.position.set(x, 2.2, z); h.rotation.y = yaw;
    site.g.add(h);
    registerAircraftSpawn('helicopter', site, x, z, yaw, rotor, tailRotor).model = h;
    Details.airportHelis = (Details.airportHelis || 0) + 1;
    return h;
  }

  // Launch pad for the player's FPV kamikaze quad. The little parked quad is
  // also the boarding marker used by pedestrians (and hidden while flying).
  function airportFpv(site, x, z, yaw) {
    const pad = new THREE.Group();
    const concrete = getMat('fpvPad', 0x4a5154);
    const trim = getMat('fpvTrim', 0xff6b3d);
    pad.add(box(5.6, 0.12, 5.6, concrete, 0, 0.06, 0));
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.15, 20),
      getMat('fpvRing', 0xffb35c, { emissive: 0x7a3300, emissiveIntensity: 0.6 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.13;
    pad.add(ring);
    // A wide glowing ring, mast and sign make the pad visible from the
    // terminal, the runway and the road — the quad itself is tiny.
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(3.0, 3.5, 32),
      getMat('fpHalo', 0xff8a3d, { emissive: 0xff5a00, emissiveIntensity: 0.9,
        side: THREE.DoubleSide })
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.14;
    pad.add(halo);
    beamBetween(pad, 0, 0.14, 0, 0, 8.2, 0, 0.1, getMat('fpvMast', 0x373d42));
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 8),
      getMat('fpvOrb', 0xffb35c, { emissive: 0xff7a1a, emissiveIntensity: 1.4 }));
    orb.position.y = 8.4;
    pad.add(orb);
    addShopSign(pad, 'FPV PAD', 7, 1.7, 0xff6b3d, 0x1a0e00, 0, 6.4, 0, 0);
    Details.fpvBeacon = orb;
    const quad = new THREE.Group();
    quad.add(box(0.85, 0.22, 1.05, trim, 0, 0.45, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const arm = box(0.09, 0.09, 1.35, trim, sx * 0.48, 0.45, sz * 0.48);
      arm.rotation.y = Math.atan2(sx, sz);
      quad.add(arm);
      const rotor = new THREE.Mesh(
        new THREE.TorusGeometry(0.34, 0.035, 5, 12),
        getMat('fpvRotor', 0x2b3034)
      );
      rotor.rotation.x = Math.PI / 2;
      rotor.position.set(sx * 0.95, 0.52, sz * 0.95);
      quad.add(rotor);
    }
    pad.add(quad);
    pad.position.set(x, 0, z);
    pad.rotation.y = yaw;
    site.g.add(pad);
    registerAircraftSpawn('fpv', site, x, z, yaw).model = pad;
    Details.airportFpvPad = pad;
    return pad;
  }

  function registerAircraftSpawn(key, site, ox, oz, heading, rotor, tailRotor) {
    const spawn = {
      key: key,
      x: site.q.x + ox,
      z: site.q.z + oz,
      heading: heading,
      altitude: key === 'helicopter' ? 2.2 : key === 'fpv' ? 6 : 1.3,
      model: null,
      rotor: rotor || null,
      tailRotor: tailRotor || null
    };
    CC.aircraftSpawns = CC.aircraftSpawns || [];
    spawn.index = CC.aircraftSpawns.length;
    CC.aircraftSpawns.push(spawn);
    return spawn;
  }

  // A rotating weather/surveillance dish stands beyond the east runway end.
  function buildAirportRadar(g) {
    const x = 82, z = -27;
    const steel = getMat('radarSteel', 0x8d9699);
    const concrete = getMat('radarConcrete', 0xa4aaa5);
    const dishMat = getMat('radarDish', 0xe2e5df, { side: THREE.DoubleSide });
    const rimMat = getMat('radarRim', 0xb0b8ba);
    const feedMat = getMat('radarFeed', 0x555e63);

    g.add(cylinder(3.4, 3.9, 0.9, 12, concrete, x, 0.45, z));
    [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]].forEach(function (p) {
      beamBetween(g, x + p[0], 0.8, z + p[1],
        x + p[0] * 0.42, 12.6, z + p[1] * 0.42, 0.22, steel);
    });
    [4, 8, 12].forEach(function (y) {
      const s = 2.2 - (y / 12.6) * 1.28;
      beamBetween(g, x - s, y, z - s, x + s, y, z - s, 0.1, steel);
      beamBetween(g, x - s, y, z + s, x + s, y, z + s, 0.1, steel);
      beamBetween(g, x - s, y, z - s, x - s, y, z + s, 0.1, steel);
      beamBetween(g, x + s, y, z - s, x + s, y, z + s, 0.1, steel);
    });
    beamBetween(g, x, 12.4, z, x, 13.4, z, 0.7, steel);

    const rotating = new THREE.Group();
    rotating.position.set(x, 13.4, z);
    rotating.rotation.y = 0.6;
    g.add(rotating);

    const radius = 7.5;
    const capStart = Math.PI * 0.62;
    const rimRadius = Math.sin(capStart) * radius;
    const bowlDrop = Math.cos(capStart) * radius;
    const face = new THREE.Group();
    face.rotation.x = Math.PI / 2 - 0.16;
    rotating.add(face);

    const bowl = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 22, 10, 0, Math.PI * 2, capStart, Math.PI - capStart),
      dishMat
    );
    bowl.position.y = -bowlDrop;
    bowl.castShadow = true; bowl.receiveShadow = true;
    face.add(bowl);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(rimRadius, 0.18, 6, 28), rimMat);
    rim.rotation.x = -Math.PI / 2;
    face.add(rim);
    face.add(cylinder(0.9, 0.9, 1.4, 10, steel, 0, -radius * 0.72, 0));

    const feedY = radius * 0.58;
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.2, 10), feedMat);
    horn.rotation.x = Math.PI;
    horn.position.y = feedY;
    face.add(horn);
    for (let i = 0; i < 3; i++) {
      const a = i * Math.PI * 2 / 3 + 0.4;
      beamBetween(face,
        Math.cos(a) * rimRadius * 0.8, -0.1, Math.sin(a) * rimRadius * 0.8,
        0, feedY - 0.45, 0, 0.09, steel);
    }

    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.36, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xb02016, emissive: 0xff2a14, emissiveIntensity: 0.3 }));
    beacon.position.set(x, 12.9, z);
    g.add(beacon);

    Details.airportRadar = rotating;
    Details.radarBeacon = beacon;
    Details.radarDishes = 1;
  }

  // Paired edge lights continue a little past both runway ends as lead-in
  // lights. The sequence starts white and sweeps blue from west to east.
  function buildRunwayLights(g) {
    Details.runwayLights = [];
    const postMat = getMat('runwayLightPost', 0x70787b);
    const white = 0xf6f3e4, blue = 0x3da9ff;
    let station = 0;
    for (let x = -96; x <= 96; x += 8) {
      [-18, 2].forEach(function (z) {
        g.add(cylinder(0.09, 0.12, 0.75, 6, postMat, x, 0.38, z));
        const bulbMat = new THREE.MeshStandardMaterial({
          color: white, emissive: white, emissiveIntensity: 0.9, roughness: 0.25
        });
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 6), bulbMat);
        bulb.position.set(x, 0.9, z);
        g.add(bulb);
        Details.runwayLights.push({
          mat: bulbMat, order: station, blue: false, white: white, blueColor: blue
        });
      });
      station++;
    }
    Details.runwayLightStations = station;
  }

  function buildAirport() {
    const site = serviceSite('airport');
    if (!site) return;
    CC.aircraftSpawns = [];
    const g = site.g, q = site.q;
    servicePad(g, q.w - 4, q.h - 4, 0x9b9f9a, 0.06);
    serviceFence(g, q.w - 4, q.h - 4, 7);
    const runway = getMat('runway', 0x3b3d40);
    const paintWhite = getMat('runwayPaint', 0xf0f0e8);
    g.add(box(170, 0.2, 16, runway, 0, 0.18, -8));
    for (let x = -78; x <= 78; x += 13) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(7, 0.55), paintWhite);
      dash.rotation.x = -Math.PI / 2; dash.position.set(x, 0.3, -8); g.add(dash);
    }
    [-79, 79].forEach(function (x) {
      [-5, -2.5, 2.5, 5].forEach(function (z) {
        const bar = new THREE.Mesh(new THREE.PlaneGeometry(5, 0.6), paintWhite);
        bar.rotation.x = -Math.PI / 2; bar.position.set(x, 0.31, -8 + z); g.add(bar);
      });
    });
    buildRunwayLights(g);
    buildAirportRadar(g);
    // Terminal, hangar and control tower sit beside, never on, the runway.
    g.add(box(27, 6, 12, getMat('terminal', 0xd9dedb), -58, 3, 19));
    g.add(box(28, 0.6, 13, getMat('terminalRoof', 0x4d6f88), -58, 6.3, 19));
    addShopSign(g, 'COASTAL AIR', 20, 3, 0x22577a, 0xffffff, -58, 7.4, 25.2, 0);
    g.add(box(31, 8, 15, getMat('hangar', 0xb9bec0), 48, 4, 18));
    g.add(box(32, 0.5, 16, getMat('hangarRoof', 0x6f777b), 48, 8.3, 18));
    // A full-height control tower with a glass cab and a rooftop beacon.
    const towerWall = getMat('towerShaft', 0xc6c9c6);
    const towerGlass = getMat('towerCab', 0x3f6d8b, { emissive: 0x18384b });
    const towerTrim = getMat('towerTrim', 0xe3e5df);
    g.add(box(8, 18, 8, towerWall, -4, 9, 20));
    g.add(box(9, 0.5, 9, towerTrim, -4, 18.2, 20));
    g.add(box(12, 3.8, 12, towerGlass, -4, 20.2, 20));
    g.add(box(13, 0.6, 13, towerTrim, -4, 22.4, 20));
    [14.1, 25.9].forEach(function (tz) {
      g.add(box(10.5, 2.4, 0.16, towerGlass, -4, 20.2, tz));
    });
    [-9.9, 1.9].forEach(function (tx) {
      g.add(box(0.16, 2.4, 10.5, towerGlass, tx, 20.2, 20));
    });
    const rail = getMat('towerRail', 0xb9c0c0);
    [-5.5, 5.5].forEach(function (dz) {
      beamBetween(g, -9.5, 22.9, 20 + dz, 1.5, 22.9, 20 + dz, 0.07, rail);
    });
    [-9.5, 1.5].forEach(function (dx) {
      beamBetween(g, dx, 22.9, 14.5, dx, 22.9, 25.5, 0.07, rail);
    });
    g.add(cylinder(0.12, 0.12, 6, 6, getMat('towerMast', 0x9aa0a2), -4, 25.7, 20));
    const towerLight = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xc6281c, emissive: 0xff2a14, emissiveIntensity: 0.5 }));
    towerLight.position.set(-4, 28.9, 20);
    g.add(towerLight);
    Details.controlTowerBeacon = towerLight;
    Details.controlTower = true;
    airportPlane(site, -20, 18, 0.15);
    airportPlane(site, 18, 18, -0.1);
    airportHelicopter(site, 72, 21, -0.35);
    airportHelicopter(site, -86, -24, 0.4);
    airportFpv(site, -68, 2, 0);
    const windX = 88, windZ = 21;
    beamBetween(g, windX, 0, windZ, windX, 7, windZ, 0.1, getMat('windPole', 0xc7cac6));
    const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.45, 2.6, 9, 1, true),
      mat(0xe46b3c, { side: THREE.DoubleSide }));
    sock.rotation.z = Math.PI / 2; sock.position.set(windX + 1.3, 6.7, windZ); g.add(sock);
    // Keep the airport sign beside the perimeter gate, clear of the Army
    // compound that occupies the north-west apron.
    servicePylon(g, 'AIRPORT', -80, 31, 0x22577a, 0xffffff, 9);
    serviceObstacle(site, -58, 19, 16);
    serviceObstacle(site, 48, 18, 18);
    serviceObstacle(site, -4, 20, 6);
    serviceObstacle(site, 82, -27, 6);
    Details.airport = true;
    serviceDone(site);
  }

  // Small fenced Army compound inside the airport apron. Marching platoons
  // muster just outside its gate; the flagpole and crates make the home base
  // easy to spot from the control tower.
  function buildMilitaryOutpost() {
    if (!CC.militaryOutpost) return;
    const site = serviceSite('airport');
    if (!site) return;
    const out = CC.militaryOutpost();
    const ox = out.x - site.q.x, oz = out.z - site.q.z;
    const g = site.g;
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(23, 18),
      getMat('outpostPad', 0x8e8a75, { side: THREE.DoubleSide }));
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(ox, 0.07, oz);
    pad.receiveShadow = true;
    g.add(pad);
    const fence = new THREE.Group();
    fence.position.set(ox, 0, oz);
    serviceFence(fence, 23, 18, 3.6);
    g.add(fence);

    const canvas = getMat('armyCanvas', 0x697449);
    const dark = getMat('armyDark', 0x35402e);
    function tent(dx, dz, r, h) {
      const t = new THREE.Mesh(new THREE.ConeGeometry(r, h, 4), canvas);
      t.rotation.y = Math.PI / 4;
      t.position.set(ox + dx, h * 0.5, oz + dz);
      g.add(t);
      const flap = new THREE.Mesh(new THREE.PlaneGeometry(r * 0.68, h * 0.72), dark);
      flap.position.set(ox + dx, h * 0.36, oz + dz + r * 0.72);
      flap.rotation.y = Math.PI;
      g.add(flap);
    }
    tent(0, 0, 4.5, 3.4);
    tent(-7, -5, 3.1, 2.5);
    tent(7, -5, 3.1, 2.5);

    const crateMat = getMat('armyCrate', 0x8a6a43);
    [[-8, 3], [-8, 4.4], [8.5, 3], [7, 4.2]].forEach(function (p, i) {
      g.add(box(1.7, 1.4, 1.7, crateMat, ox + p[0], 0.7 + (i === 1 || i === 3 ? 1.45 : 0), oz + p[1]));
    });

    // A utilitarian staff car parked beside the command tent.
    const car = new THREE.Group();
    car.position.set(ox + 8.5, 0, oz + 7);
    car.add(box(3.6, 0.9, 1.8, dark, 0, 0.85, 0));
    car.add(box(1.7, 0.85, 1.55, canvas, -0.3, 1.65, 0));
    car.add(box(0.12, 0.7, 1.7, getMat('armyWindshield', 0x87a9ad), 0.58, 1.65, 0));
    [[-1.25, 0.95], [1.25, 0.95], [-1.25, -0.95], [1.25, -0.95]].forEach(function (p) {
      const wheel = cylinder(0.48, 0.48, 0.24, 10, getMat('armyTyre', 0x242724), p[0], 0.48, p[1]);
      wheel.rotation.z = Math.PI / 2;
      car.add(wheel);
    });
    g.add(car);

    const poleMat = getMat('outpostFlagPole', 0xc8c9c2);
    beamBetween(g, ox - 9, 0, oz + 6, ox - 9, 8, oz + 6, 0.09, poleMat);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.36),
      new THREE.MeshLambertMaterial({ map: usFlagTexture(), side: THREE.DoubleSide }));
    flag.position.set(ox - 7.7, 7.1, oz + 6);
    g.add(flag);
    Details.outpostFlag = flag;
    servicePylon(g, 'MILITARY OUTPOST', ox, oz + 12, 0x3f4a32, 0xf3efdd, 8);
    serviceObstacle(site, ox, oz, 4.6);
    serviceObstacle(site, ox + 8.5, oz + 7, 2.4);
    Details.militaryOutpost = true;
    Details.outpostPos = { x: out.x, z: out.z, yaw: out.yaw };
  }

  function buildWaterTowerSite() {
    const site = serviceSite('waterTower');
    if (!site) return;
    const g = site.g;
    servicePad(g, 28, 28, 0xa4a8a2, 0.06);
    const leg = getMat('towerLeg', 0x8d9492);
    [[-5, -5], [5, -5], [-5, 5], [5, 5]].forEach(function (p) {
      beamBetween(g, p[0], 0, p[1], p[0] * 0.45, 15, p[1] * 0.45, 0.3, leg);
    });
    const tank = new THREE.Mesh(new THREE.SphereGeometry(7.2, 18, 12), getMat('towerTank', 0xc8ccc6));
    tank.scale.y = 0.72; tank.position.y = 20; g.add(tank);
    g.add(cylinder(1.1, 1.1, 3.2, 12, leg, 0, 25.6, 0));
    for (let y = 1.2; y < 18; y += 1.1) {
      g.add(box(1.6, 0.1, 0.1, leg, 0, y, 6.1 - y * 0.17));
    }
    function towerText(yaw) {
      const c = document.createElement('canvas');
      c.width = 512; c.height = 256;
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.fillStyle = '#22577a';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 72px Arial, sans-serif';
      ctx.fillText('The Harbor', 256, 96);
      ctx.font = 'bold 42px Arial, sans-serif';
      ctx.fillText('est.2026', 256, 168);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0.05 });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(8.8, 4.4), mat);
      mesh.position.set(Math.sin(yaw) * 7.05, 20.2, Math.cos(yaw) * 7.05);
      mesh.rotation.y = yaw;
      g.add(mesh);
    }
    towerText(0);
    towerText(Math.PI);
    serviceObstacle(site, 0, 0, 8);
    Details.waterTower = true;
    serviceDone(site);
  }

  function buildCemetery() {
    const site = serviceSite('cemetery');
    if (!site) return;
    const g = site.g, q = site.q;
    servicePad(g, q.w - 4, q.h - 4, 0x6f9a5f, 0.05);
    serviceFence(g, q.w - 4, q.h - 4, 5);
    servicePad(g, 5, q.h - 8, 0xc8bfaa, 0.08);
    servicePad(g, q.w - 8, 4, 0xc8bfaa, 0.09);
    const stone = getMat('gravestone', 0xc7c7bd);
    const stoneDark = getMat('gravestoneDark', 0xa8aaa0);
    const stoneMoss = getMat('gravestoneMoss', 0xb4b7a8);
    for (let row = 0; row < 14; row++) {
      for (let col = 0; col < 18; col++) {
        const x = -40 + col * 4.6 + (row % 2 ? 1.8 : 0);
        const z = -28 + row * 4.2;
        if (Math.abs(x) < 6 && Math.abs(z) < 5) continue;
        if (z > 20 && Math.abs(x) < 12) continue; // keep chapel front clear
        if ((row + col) % 7 === 0) continue; // slight randomness/gaps
        const mat = (row + col) % 3 === 0 ? stoneDark : (row + col) % 5 === 0 ? stoneMoss : stone;
        const h = 1.0 + ((row * 3 + col * 5) % 5) * 0.12;
        const w = 0.85 + ((row + col * 2) % 3) * 0.12;
        const thick = 0.24 + ((row + col) % 2) * 0.04;
        g.add(box(w, h, thick, mat, x, h * 0.5, z));
        if ((row + col) % 4 === 0) {
          const cap = new THREE.Mesh(new THREE.SphereGeometry(w * 0.45, 7, 5), mat);
          cap.scale.y = 0.45; cap.position.set(x, h, z); g.add(cap);
        } else if ((row + col) % 4 === 1) {
          g.add(box(w * 0.85, 0.2, thick + 0.02, mat, x, h + 0.1, z));
        } else if ((row + col) % 4 === 2) {
          const crossV = box(0.12, 0.55, 0.12, mat, x, h + 0.28, z);
          const crossH = box(0.42, 0.12, 0.12, mat, x, h + 0.38, z);
          g.add(crossV); g.add(crossH);
        }
      }
    }
    g.add(box(16, 5.5, 11, getMat('cemeteryChapel', 0xe0dbcd), 0, 2.75, 27));
    g.add(box(17, 0.5, 12, getMat('cemeteryChapelRoof', 0x6c5b57), 0, 5.7, 27));
    g.add(box(1.2, 5, 1.2, getMat('cemeteryCross', 0xcfcac0), 0, 8.3, 27));
    g.add(box(3.2, 1.1, 1.2, getMat('cemeteryCross', 0xcfcac0), 0, 9.4, 27));
    beamBetween(g, -32, 0, 32, -32, 8, 32, 0.08, getMat('cemeteryFlag', 0xc8cbc6));
    serviceObstacle(site, 0, 27, 10);
    Details.cemetery = true;
    serviceDone(site);
  }

  function buildChurch() {
    // Church removed per request.
    Details.church = false;
    Details.churchGraves = 0;
  }

  function buildHospital() {
    const site = serviceSite('hospital');
    if (!site) return;
    const g = site.g, q = site.q;
    servicePad(g, q.w - 4, q.h - 4, 0xb9bcb4, 0.06);
    serviceFence(g, q.w - 4, q.h - 4, 6);

    const wall = facadeMat(0xe8eae3, 'stucco');
    const roof = getMat('hospitalRoof', 0x4c7184);
    const trim = getMat('hospitalTrim', 0xd8d9d0);
    const glass = getMat('hospitalGlass', 0x9fc4d4, { emissive: 0x183440 });
    const red = getMat('hospitalRed', 0xd94f42);

    g.add(box(44, 9, 20, wall, 0, 4.5, -7));
    g.add(box(45, 0.6, 21, roof, 0, 9.3, -7));
    [-26, 26].forEach(function (x) {
      g.add(box(12, 6.2, 15, wall, x, 3.1, -6));
      g.add(box(13, 0.5, 16, roof, x, 6.45, -6));
    });
    for (let x = -18; x <= 18; x += 6) {
      g.add(box(3.4, 2.2, 0.14, glass, x, 5.2, 3.12));
      g.add(box(3.8, 0.18, 0.3, trim, x, 6.45, 3.2));
    }
    // Emergency entrance canopy and a clearly readable red cross.
    g.add(box(18, 4.2, 7, trim, 0, 2.1, 5.5));
    g.add(box(19, 0.4, 8, roof, 0, 4.4, 5.5));
    g.add(box(5, 3.1, 0.16, glass, 0, 1.6, 9.08));
    g.add(box(1.4, 6.2, 0.28, red, 0, 7.4, 3.3));
    g.add(box(6.2, 1.4, 0.28, red, 0, 7.4, 3.3));
    addShopSign(g, 'EMERGENCY', 13, 2.6, 0xb3352c, 0xffffff, 0, 5.3, 9.2, 0);
    addShopSign(g, 'COASTAL GENERAL', 20, 3.4, 0x22577a, 0xffffff, 0, 11.2, -7.2, 0);

    // Rooftop helipad.
    g.add(cylinder(7, 7, 0.3, 24, getMat('helipad', 0x3f4548), 0, 9.75, -7));
    const padH = getMat('helipadPaint', 0xf2efe4);
    [-2.4, 2.4].forEach(function (x) { g.add(box(0.65, 0.08, 5, padH, x, 9.96, -7)); });
    g.add(box(4.9, 0.08, 0.65, padH, 0, 9.96, -7));
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6),
      getMat('hospitalBeacon', 0xff6b5b, { emissive: 0xd92f22 }));
    beacon.position.set(0, 10.4, -13); g.add(beacon);

    // Parking apron, marked bays and a few waiting cars.
    servicePad(g, q.w - 9, 13, 0x4b4f4f, 0.08).position.z = 14;
    for (let x = -21; x <= 21; x += 4.2) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 10), getMat('hospitalLine', 0xf0eee2));
      line.rotation.x = -Math.PI / 2; line.position.set(x, 0.11, 14); g.add(line);
    }
    [-14, -5, 7].forEach(function (x, i) {
      const car = CC.VehicleFactory.build(rng() < 0.25 ? 'truck' : 'car',
        [0xd9d6c9, 0x7d9ab5, 0xc67d6a][i]);
      car.group.position.set(x, 0.13, 13 + (i % 2 ? 2.6 : -2.6));
      car.group.rotation.y = Math.PI + (rng() - 0.5) * 0.06;
      g.add(car.group);
      Details.parkedVehicles++;
    });
    // Ambulance by the emergency door.
    const ambulance = new THREE.Group();
    ambulance.position.set(17, 0, 16);
    ambulance.add(box(6, 3.1, 3.1, getMat('ambulanceWhite', 0xf1f1ea), 0, 1.65, 0));
    ambulance.add(box(6.1, 0.55, 3.2, red, 0, 1.2, 0));
    ambulance.add(box(2.2, 1.5, 0.12, glass, 2.1, 2.3, 1.6));
    ambulance.add(box(1.6, 0.4, 1.6, getMat('ambulanceLight', 0x5fc7ff, { emissive: 0x2a88c9 }), -0.8, 3.4, 0));
    [-2, 2].forEach(function (x) {
      [-1.5, 1.5].forEach(function (z) {
        const wheel = new THREE.Mesh(new THREE.SphereGeometry(0.62, 8, 6), getMat('ambulanceTyre', 0x2d3133));
        wheel.position.set(x, 0.55, z); ambulance.add(wheel);
      });
    });
    g.add(ambulance);
    servicePylon(g, 'COASTAL GENERAL', -25, 20, 0x22577a, 0xffffff, 9);
    serviceObstacle(site, 0, -7, 23);
    serviceObstacle(site, 26, -6, 8);
    serviceObstacle(site, 17, 16, 4);
    Details.hospital = true;
    serviceDone(site);
  }

  function policePatrolCar(x, z, yaw) {
    const car = CC.VehicleFactory.build('car', 0xf2f3ee);
    const blue = getMat('policeBlue', 0x244f8c);
    const dark = getMat('policeDark', 0x222a32);
    const red = getMat('policeRed', 0xd93c34, { emissive: 0x8a1712 });
    const lightBlue = getMat('policeLightBlue', 0x3e8fe0, { emissive: 0x1b5ea8 });
    // Door stripe and roof light bar make the parked cars read as patrol units.
    [-1.1, 1.1].forEach(function (sx) {
      car.group.add(box(0.09, 0.55, 3.4, blue, sx, 1.05, 0));
    });
    car.group.add(box(1.9, 0.18, 0.55, dark, 0, 2.05, -0.2));
    car.group.add(box(0.82, 0.24, 0.5, red, -0.48, 2.22, -0.2));
    car.group.add(box(0.82, 0.24, 0.5, lightBlue, 0.48, 2.22, -0.2));
    car.group.position.set(x, 0.13, z);
    car.group.rotation.y = yaw;
    return car.group;
  }

  function buildPoliceStation() {
    const site = serviceSite('police');
    if (!site) return;
    const g = site.g, q = site.q;
    // Rotate the whole site so its entrance and parking apron face the road
    // south of the zone, while the shared fence still gates the +z side.
    g.rotation.y = Math.PI;
    servicePad(g, q.w - 4, q.h - 4, 0xb7bbb6, 0.06);
    serviceFence(g, q.w - 4, q.h - 4, 5);

    const wall = facadeMat(0xdfe4e1, 'brick');
    const roof = getMat('policeRoof', 0x355a7d);
    const blue = getMat('policeBand', 0x204b7e);
    const glass = getMat('policeGlass', 0x9fc4d4, { emissive: 0x183440 });
    const dark = getMat('policeTrim', 0x30373d);
    const red = getMat('policeBadgeRed', 0xd0453c, { emissive: 0x721b16 });

    g.add(box(31, 8.2, 16, wall, 0, 4.1, -7));
    g.add(box(32, 0.6, 17, roof, 0, 8.5, -7));
    g.add(box(31.4, 1.1, 16.4, blue, 0, 7.5, -7));
    [-14, 14].forEach(function (x) {
      g.add(box(2.6, 9.4, 2.6, wall, x, 4.7, 0.4));
      g.add(box(3.1, 0.5, 3.1, roof, x, 9.65, 0.4));
    });
    // Front doors, dispatch windows and a blue-and-gold badge.
    [-4.2, 4.2].forEach(function (x) {
      g.add(box(3.4, 4.2, 0.18, glass, x, 3.2, 1.18));
      g.add(box(3.8, 0.22, 0.3, dark, x, 5.4, 1.25));
    });
    g.add(box(3.2, 4.6, 0.2, dark, 0, 2.3, 1.2));
    g.add(box(2.6, 4.0, 0.22, glass, 0, 2.4, 1.32));
    g.add(box(0.18, 0.18, 0.18, getMat('policeKnob', 0xe6c66b), 1.0, 2.2, 1.48));
    const shield = new THREE.Mesh(new THREE.CircleGeometry(1.1, 8), blue);
    shield.position.set(0, 6.1, 1.35);
    g.add(shield);
    g.add(box(0.34, 1.4, 0.12, getMat('policeBadgeGold', 0xe7c76a), 0, 6.1, 1.44));
    g.add(box(1.4, 0.34, 0.12, getMat('policeBadgeGold', 0xe7c76a), 0, 6.1, 1.44));
    addShopSign(g, 'POLICE', 17, 3.0, 0x1d3f68, 0xffffff, 0, 10.1, 1.3, 0);
    // Jail-cell bars on the side windows.
    [-1, 1].forEach(function (sx) {
      for (let i = -1; i <= 1; i++) {
        const z = -7 + i * 4.2;
        g.add(box(2.4, 1.8, 0.14, glass, sx * 15.6, 4.4, z));
        for (let b = -1; b <= 1; b++) {
          g.add(box(0.1, 2.1, 0.12, dark, sx * 15.72, 4.4, z + b * 0.7));
        }
      }
    });
    // Flag and a small emergency light above the entrance.
    beamBetween(g, -19, 0, -7, -19, 12, -7, 0.1, getMat('policeFlagPole', 0xd8dbd4));
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.7),
      mat(0x244f8c, { side: THREE.DoubleSide }));
    flag.position.set(-17.5, 11, -7);
    g.add(flag);
    const entryLight = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), red);
    entryLight.position.set(0, 5.9, 1.6);
    g.add(entryLight);

    // Parking apron and two marked patrol cars facing out toward the gate.
    servicePad(g, q.w - 9, 13, 0x4c5254, 0.08).position.z = 13;
    for (let x = -18; x <= 18; x += 4.5) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 10),
        getMat('policeLotLine', 0xf0eee2));
      line.rotation.x = -Math.PI / 2;
      line.position.set(x, 0.11, 13);
      g.add(line);
    }
    g.add(policePatrolCar(-8, 14, 0));
    g.add(policePatrolCar(8, 14, Math.PI));
    Details.parkedVehicles += 2;
    servicePylon(g, 'COASTAL POLICE', -20, 18, 0x1d3f68, 0xffffff, 9);

    // The fence gate opens at local +z, which the flipped group maps to the
    // north side of the zone. Run a asphalt spur from the parking apron through
    // that gate to the nearest paved road so cruisers can actually leave.

    // Connect the cruiser gate to the parallel river road on the west side,
    // keeping patrol cars away from the bridge approach.
    const gateZ = q.z - (q.h - 4) * 0.5;
    const lotZ = q.z - 12;
    const drivewayWidth = 9.4;
    // Connect to the road parallel to the river (Harbor Avenue) on the west side.
    const paved = (CC.roadDefs || []).filter(function (r) { return r.type === 'paved'; });
    let road = paved.filter(function (r) { return r.name === 'Harbor Avenue'; })[0] || null;
    if (!road) {
      let roadDist = Infinity;
      paved.forEach(function (r) {
        const p = CC.sampleRoad(r, U.clamp(r._length * 0.5, 0, r._length));
        const dist = Math.abs(p.x - q.x) + Math.abs(p.z - (gateZ - 18)) * 0.35;
        if (p.x < q.x - 6 && dist < roadDist) { road = r; roadDist = dist; }
      });
    }
    if (!road && CC.nearestRoad) road = CC.nearestRoad(q.x - 24, gateZ - 18, 'paved');
    let endX = q.x - 40, endZ = gateZ - 22;
    let path = [[q.x, lotZ], [q.x, gateZ], [endX, endZ]];
    if (road) {
      let best = null;
      for (let s = 10; s < road._length - 10; s += 6) {
        const p = CC.sampleRoad(road, s);
        if (p.x > q.x - 8) continue;
        const d = Math.hypot(p.x - q.x, p.z - gateZ);
        if (!best || d < best.d) best = { sample: p, d: d };
      }
      if (best) {
        const p = best.sample;
        const off = road.width * 0.5 + drivewayWidth * 0.5 + 0.8;
        endX = p.x + p.dz * off;
        endZ = p.z - p.dx * off;
        if (endX > q.x - 8) {
          endX = p.x - p.dz * off;
          endZ = p.z + p.dx * off;
        }
        path = [[q.x, lotZ], [q.x, gateZ], [endX, gateZ], [endX, endZ]];
      }
    }
    const driveMat = getMat('policeDrivewayAsphalt', 0x4c5254);
    const lineMat = getMat('policeDrivewayLine', 0xf0eee2);
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1];
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const len = Math.hypot(dx, dz) || 1;
      const yaw = Math.atan2(dx, dz);
      const midX = (a[0] + b[0]) * 0.5, midZ = (a[1] + b[1]) * 0.5;
      const seg = new THREE.Mesh(new THREE.BoxGeometry(drivewayWidth, 0.16, len + 2.2), driveMat);
      seg.position.set(midX, CC.heightAt(midX, midZ) + 0.08, midZ);
      seg.rotation.y = yaw;
      if (serviceScene) serviceScene.add(seg);
      for (let t = 0.18; t < 0.92; t += 0.22) {
        const lx = a[0] + dx * t, lz = a[1] + dz * t;
        const dash = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, len * 0.12), lineMat);
        dash.position.set(lx, CC.heightAt(lx, lz) + 0.18, lz);
        dash.rotation.y = yaw;
        if (serviceScene) serviceScene.add(dash);
      }
    }
    Details.policeDriveway = {
      from: { x: q.x, z: lotZ }, to: { x: endX, z: endZ },
      gateZ: gateZ, width: drivewayWidth, roadWidth: road ? road.width : 0,
      roadName: road ? road.name : ''
    };

    // Group is flipped, so local z = -7 maps to world z = q.z + 7.
    serviceObstacle(site, 0, 7, 18);
    Details.policeStation = true;
    Details.policeCars = 2;
    serviceDone(site);
  }

  function boatyardRackBoat(color) {
    const b = new THREE.Group();
    const hull = getMat('rackHull' + color, color);
    b.add(box(2.0, 0.55, 5.2, hull, 0, 0.4, 0));
    const bow = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 1.0, 1.6, 4), hull);
    bow.rotation.x = Math.PI / 2; bow.rotation.y = Math.PI / 4;
    bow.position.set(0, 0.4, 2.9); b.add(bow);
    b.add(box(1.5, 0.45, 1.5, getMat('rackCabin', 0xf1ede0), 0, 0.9, -0.7));
    b.add(box(1.7, 0.12, 4.4, getMat('rackDeck', 0xd7c59e), 0, 0.72, 0));
    return b;
  }

  function buildBoatyard() {
    const site = serviceSite('boatyard');
    if (!site) return;
    const g = site.g, q = site.q;
    // Only the dry yard gets a pad; the west edge stays as open water for the lift.
    servicePad(g, 32, q.h - 4, 0xa9a59a, 0.06).position.x = 4;
    const fence = getMat('boatyardFence', 0xa9afa7);
    function fenceRunLocal(ax, az, bx, bz) {
      const len = Math.hypot(bx - ax, bz - az) || 1;
      const yaw = Math.atan2(-(bz - az), bx - ax);
      const n = Math.max(2, Math.ceil(len / 2.6));
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        g.add(box(0.14, 1.7, 0.14, fence, U.lerp(ax, bx, t), 0.85, U.lerp(az, bz, t)));
      }
      [0.55, 1.35].forEach(function (ry) {
        const rail = box(len, 0.1, 0.1, fence, (ax + bx) * 0.5, ry, (az + bz) * 0.5);
        rail.rotation.y = yaw; g.add(rail);
      });
    }
    fenceRunLocal(-12, -28, 20, -28);
    fenceRunLocal(-12, 28, 20, 28);
    fenceRunLocal(20, -28, 20, 28);
    fenceRunLocal(-12, -28, -12, -8);
    fenceRunLocal(-12, 8, -12, 28);

    const steel = getMat('boatyardSteel', 0x6d7b80);
    const concrete = getMat('boatyardConcrete', 0x9b9d97);
    const sling = getMat('boatyardSling', 0xe0b64e);
    // Slipway slopes down to the sheltered west shore.
    const ramp = box(19, 0.5, 15, concrete, -21, -0.45, 0);
    ramp.rotation.z = 0.13; g.add(ramp);
    [-7.7, 7.7].forEach(function (z) {
      const curb = box(19, 0.7, 0.7, concrete, -21, 0.1, z);
      curb.rotation.z = 0.13; g.add(curb);
      beamBetween(g, -30, -1.7, z, -9, 1.0, z, 0.3, steel);
    });
    // Travel lift: rails, legs, top bridge and a boat held in slings.
    beamBetween(g, -21, 3.8, -7.4, -21, 3.8, 7.4, 0.5, steel);
    [-7.4, 7.4].forEach(function (z) {
      beamBetween(g, -21, 0.7, z, -21, 5.6, z, 0.5, steel);
      [-1.2, 1.2].forEach(function (dx) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.3, 10), steel);
        wheel.rotation.z = Math.PI / 2; wheel.position.set(-21 + dx, 0.55, z); g.add(wheel);
      });
    });
    beamBetween(g, -21, 3.6, -6, -21, 1.8, -6, 0.1, sling);
    beamBetween(g, -21, 3.6, 6, -21, 1.8, 6, 0.1, sling);
    beamBetween(g, -21, 1.9, -6, -21, 1.9, 6, 0.18, sling);
    const lifted = boatyardRackBoat(0x2f7f93);
    lifted.position.set(-21, 1.2, 0); lifted.rotation.y = Math.PI / 2; g.add(lifted);

    // Dry-stack racks: four bays, four rows and three tiers of boats.
    const colors = [0xe8e5dc, 0x4b8fb5, 0xd97c68, 0xe8b44f, 0x7fb08b, 0xb9d0d8];
    const rack = getMat('boatyardRack', 0x8e9894);
    let boats = 0;
    for (let row = 0; row < 4; row++) {
      const cz = -18 + row * 11;
      for (let bay = 0; bay < 4; bay++) {
        const cx = -4 + bay * 6.6;
        [-2.7, 2.7].forEach(function (dx) {
          [-3.2, 3.2].forEach(function (dz) {
            g.add(box(0.22, 8.4, 0.22, rack, cx + dx, 4.2, cz + dz));
          });
        });
        for (let level = 0; level < 3; level++) {
          const y = 0.8 + level * 2.6;
          [-3.2, 3.2].forEach(function (dz) {
            g.add(box(5.8, 0.22, 0.3, rack, cx, y, cz + dz));
          });
          g.add(box(5.8, 0.18, 6.8, rack, cx, y - 0.12, cz));
          const boat = boatyardRackBoat(colors[(row * 4 + bay + level) % colors.length]);
          boat.position.set(cx, y + 0.2, cz);
          boat.scale.setScalar(0.88);
          g.add(boat);
          boats++;
        }
        serviceObstacle(site, cx, cz, 3.2);
      }
    }
    // Yard office and a small parts shed.
    g.add(box(14, 5.4, 9, getMat('boatyardOffice', 0xd8d3c1), 12, 2.7, 21));
    g.add(box(15, 0.5, 10, getMat('boatyardOfficeRoof', 0x4f6f7a), 12, 5.65, 21));
    addShopSign(g, 'HARBOR BOATYARD', 13, 2.6, 0x22577a, 0xffffff, 12, 6.9, 25.6, 0);
    g.add(box(6, 3.2, 6, getMat('boatyardShed', 0xb0a99a), -5, 1.6, 21));
    servicePylon(g, 'BOATYARD', -11, 24, 0x22577a, 0xffffff, 8);
    serviceObstacle(site, -21, 0, 6);
    serviceObstacle(site, 12, 21, 8);
    Details.boatyard = true;
    Details.boatyardLift = true;
    Details.boatyardBoats = boats + 1;
    serviceDone(site);
  }

  function dogParkDog(coat) {
    const d = new THREE.Group();
    const fur = getMat('dogFur' + coat, coat);
    const dark = getMat('dogNose', 0x2d3133);
    d.add(box(0.95, 0.65, 1.8, fur, 0, 0.78, 0));
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.48, 10, 8), fur);
    head.position.set(0, 1.25, 1.05); d.add(head);
    d.add(box(0.42, 0.3, 0.45, dark, 0, 1.15, 1.48));
    [-0.32, 0.32].forEach(function (x) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.45, 5), fur);
      ear.position.set(x, 1.65, 1.0); ear.rotation.z = x < 0 ? 0.25 : -0.25; d.add(ear);
    });
    [-0.32, 0.32].forEach(function (x) {
      [-0.6, 0.6].forEach(function (z) {
        d.add(box(0.22, 0.62, 0.24, fur, x, 0.32, z));
      });
    });
    const tail = new THREE.Group();
    tail.position.set(0, 1.0, -0.9);
    tail.add(box(0.18, 0.18, 0.95, fur, 0, 0.22, -0.4));
    tail.rotation.x = -0.45; d.add(tail);
    d.userData.tail = tail;
    return d;
  }

  function buildDogPark() {
    const site = serviceSite('dogpark');
    if (!site) return;
    const g = site.g, q = site.q;
    servicePad(g, q.w - 3, q.h - 3, 0x9fc083, 0.06);
    const fence = getMat('dogFence', 0xd7dad0);
    const hw = q.w * 0.5 - 2, hd = q.h * 0.5 - 2;
    fenceRun(g, -hw, -hd, hw, -hd, 0, fence, 1.65, 2.0);
    fenceRun(g, -hw, -hd, -hw, hd, 0, fence, 1.65, 2.0);
    fenceRun(g, hw, -hd, hw, hd, 0, fence, 1.65, 2.0);
    fenceRun(g, -hw, hd, -3, hd, 0, fence, 1.65, 2.0);
    fenceRun(g, 3, hd, hw, hd, 0, fence, 1.65, 2.0);
    // Divider separates small and large dogs, with a gate at the front.
    fenceRun(g, 0, -hd, 0, hd - 4, 0, fence, 1.65, 2.0);
    addShopSign(g, 'DOG PARK', 14, 3.2, 0x2f6b45, 0xffffff, 0, 3.5, hd + 0.3, 0);
    addShopSign(g, 'SMALL DOGS', 9, 2.0, 0x3d7a4a, 0xffffff, -12, 2.0, -hd + 0.3, 0);
    addShopSign(g, 'LARGE DOGS', 9, 2.0, 0x3d7a4a, 0xffffff, 12, 2.0, -hd + 0.3, 0);

    // Houses, water bowls and benches in both runs.
    [-12, 12].forEach(function (x) {
      const house = new THREE.Group();
      house.position.set(x, 0, -10);
      house.add(box(3.2, 2.2, 3.0, getMat('dogHouse', 0xb18658), 0, 1.1, 0));
      const roof = new THREE.Mesh(new THREE.ConeGeometry(2.5, 1.5, 4), getMat('dogHouseRoof', 0x7c4f38));
      roof.rotation.y = Math.PI / 4; roof.position.y = 2.9; house.add(roof);
      g.add(house);
      g.add(cylinder(0.55, 0.62, 0.35, 10, getMat('dogBowl', 0x5fa9c4), x + 5, 0.2, 4));
      g.add(box(4, 0.22, 1.1, getMat('dogBench', 0xa98052), x - 5, 0.85, 8));
      g.add(box(4, 0.7, 0.18, getMat('dogBench', 0xa98052), x - 5, 1.2, 8.5));
      serviceObstacle(site, x, -10, 2.6);
    });
    // Agility tunnel, hurdles and a seesaw.
    const tunnel = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.28, 6, 14, Math.PI),
      getMat('dogTunnel', 0x4b8fb5, { side: THREE.DoubleSide }));
    tunnel.position.set(-10, 0, 6); g.add(tunnel);
    [8, 16].forEach(function (x) {
      g.add(box(5.5, 0.22, 0.5, getMat('dogHurdle', 0xe0b64e), x, 1.1, 2));
      [-2.6, 2.6].forEach(function (dz) {
        g.add(box(0.18, 1.1, 0.18, getMat('dogHurdle', 0xe0b64e), x + dz, 0.55, 2));
      });
    });
    const seesaw = box(6.5, 0.28, 0.9, getMat('dogSeesaw', 0xd9d3c1), 10, 0.95, -2);
    seesaw.rotation.z = 0.08; g.add(seesaw);
    g.add(box(0.6, 0.7, 1.2, getMat('dogSeesawBase', 0x8a8d86), 10, 0.35, -2));

    Details.dogParkDogs = Details.dogParkDogs || [];
    [[-15, 0, 0xb58257], [-8, 10, 0xe0d6c4], [10, -2, 0x4c4642], [17, 9, 0xd9b45f]].forEach(function (d, i) {
      const dog = dogParkDog(d[2]);
      dog.position.set(d[0], 0, d[1]);
      dog.rotation.y = i * 1.4 + 0.4;
      g.add(dog);
      Details.dogParkDogs.push({ group: dog, tail: dog.userData.tail, phase: rng() * 6.28, baseY: 0 });
    });
    Details.dogPark = true;
    serviceDone(site);
  }

  function buildPowerStation() {
    const site = serviceSite('powerStation');
    if (!site) return;
    const g = site.g, q = site.q;
    servicePad(g, q.w - 4, q.h - 4, 0x9ca19b, 0.06);
    serviceFence(g, q.w - 4, q.h - 4, 6);
    const steel = getMat('powerSteel', 0x8b9294);
    const concrete = getMat('powerConcrete', 0xa7aaa3);
    const copper = getMat('powerCopper', 0xb87345);
    const porcelain = getMat('powerPorcelain', 0xe2dfd2);
    const wireMat = getMat('powerWire', 0x3b4245);

    // Large transformer banks with cooling fins and porcelain bushings.
    [-24, -8, 8, 24].forEach(function (bx) {
      g.add(box(12, 0.8, 9, concrete, bx, 0.4, 9));
      for (let i = -1; i <= 1; i++) {
        const x = bx + i * 3.4;
        g.add(cylinder(1.35, 1.35, 4.6, 14, steel, x, 3.1, 9));
        g.add(cylinder(1.45, 1.45, 0.35, 14, copper, x, 5.3, 9));
        for (let f = 0; f < 4; f++) {
          g.add(box(0.18, 3.2, 1.6, steel, x + 1.5, 3.0, 6.5 + f * 1.7));
        }
        [0, 1, 2].forEach(function (j) {
          g.add(cylinder(0.3, 0.36, 1.5 - j * 0.25, 8, porcelain, x, 6.2 + j * 1.1, 9));
        });
        beamBetween(g, x, 7.4, 9, x, 8.6, 9, 0.12, copper);
      }
      serviceObstacle(site, bx, 9, 7);
    });

    function latticeTower(tx) {
      const tz = -18;
      [-2.2, 2.2].forEach(function (dx) {
        [-2.2, 2.2].forEach(function (dz) {
          beamBetween(g, tx + dx, 0, tz + dz, tx + dx * 0.28, 24, tz + dz * 0.28, 0.28, steel);
        });
      });
      [6, 12, 18, 24].forEach(function (y) {
        const s = 2.2 - y / 24 * 1.6;
        beamBetween(g, tx - s, y, tz - s, tx + s, y, tz - s, 0.12, steel);
        beamBetween(g, tx - s, y, tz + s, tx + s, y, tz + s, 0.12, steel);
        beamBetween(g, tx - s, y, tz - s, tx - s, y, tz + s, 0.12, steel);
        beamBetween(g, tx + s, y, tz - s, tx + s, y, tz + s, 0.12, steel);
      });
      [19.5, 23.5].forEach(function (y) {
        beamBetween(g, tx, y, tz - 7, tx, y, tz + 7, 0.32, steel);
        [-5, 0, 5].forEach(function (dz) {
          g.add(cylinder(0.14, 0.2, 1.4, 6, porcelain, tx, y - 0.9, tz + dz));
        });
      });
      serviceObstacle(site, tx, tz, 3.6);
    }
    [-30, 0, 30].forEach(latticeTower);
    function spanWires(x0, x1) {
      const tz = -18;
      [19.5, 23.5].forEach(function (y) {
        [-5, 0, 5].forEach(function (dz) {
          const steps = 12;
          for (let i = 0; i < steps; i++) {
            const t0 = i / steps, t1 = (i + 1) / steps;
            const sag = 1.9;
            const y0 = y - 1.6 - Math.sin(t0 * Math.PI) * sag;
            const y1 = y - 1.6 - Math.sin(t1 * Math.PI) * sag;
            beamBetween(g, U.lerp(x0, x1, t0), y0, tz + dz,
              U.lerp(x0, x1, t1), y1, tz + dz, 0.055, wireMat);
          }
        });
      });
    }
    spanWires(-30, 0);
    spanWires(0, 30);

    g.add(box(17, 5.2, 9, getMat('powerOffice', 0xd7d2c4), 0, 2.6, 24));
    g.add(box(18, 0.5, 10, concrete, 0, 5.45, 24));
    addShopSign(g, 'POWER STATION', 14, 2.8, 0x3b5668, 0xffe08a, 0, 6.8, 28.7, 0);
    servicePylon(g, 'HIGH VOLTAGE', -34, 27, 0xb08a24, 0x2d2b22, 9);
    serviceObstacle(site, 0, 24, 10);
    Details.powerStation = true;
    Details.powerTowers = 3;
    Details.powerTransformers = 12;
    serviceDone(site);
  }

  // Fenced missile battery on the eastern edge. Its rotating radar and
  // launcher head are driven by the air-defence controller in js/npcs.js.
  function buildAirDefense() {
    const site = serviceSite('airDefense');
    if (!site) return;
    const g = site.g, q = site.q;
    servicePad(g, q.w - 4, q.h - 4, 0x7a7e79, 0.06);
    serviceFence(g, q.w - 3, q.h - 3, 5);
    const olive = getMat('aaOlive', 0x59665a), dark = getMat('aaDark', 0x303835);
    const steel = getMat('aaSteel', 0x9aa29d);

    g.add(box(11, 4.2, 8, olive, -14, 2.1, -10));
    g.add(box(12, 0.45, 9, dark, -14, 4.4, -10));
    addShopSign(g, 'AIR DEFENSE', 10, 1.6, 0x2f3b34, 0xf0dc8a, -14, 5.1, -10, 0);
    g.add(box(3.2, 2.2, 0.12, getMat('aaScreen', 0x183b39, { emissive: 0x0d5c55 }), -14, 2.6, -5.92));

    const radarMast = new THREE.Group();
    radarMast.position.set(11, 7.5, -8);
    g.add(radarMast);
    beamBetween(g, 11, 0, -8, 11, 7.5, -8, 0.35, steel);
    const dishMat = mat(steel.color, { side: THREE.DoubleSide, flatShading: true });
    const dish = new THREE.Mesh(
      new THREE.SphereGeometry(5.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), dishMat);
    dish.rotation.x = -Math.PI / 2;
    dish.scale.set(1, 0.42, 1);
    radarMast.add(dish);
    radarMast.add(cylinder(0.16, 0.16, 2.4, 6, steel, 0, 0, -1.4).rotateX(Math.PI / 2));
    const feed = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6),
      getMat('aaFeed', 0xd8c46a, { emissive: 0x6a5418 }));
    feed.position.z = -2.6;
    radarMast.add(feed);

    const launcher = new THREE.Group();
    launcher.position.set(6, 0, 9);
    g.add(launcher);
    launcher.add(box(6.2, 1.1, 8.2, olive, 0, 0.7, 0));
    [-2.5, 2.5].forEach(function (wx) {
      const wheel = cylinder(0.75, 0.75, 0.4, 10, dark, wx, 0.65, 2.9);
      wheel.rotation.z = Math.PI / 2; launcher.add(wheel);
    });
    const head = new THREE.Group();
    head.position.y = 2.1;
    launcher.add(head);
    head.add(box(3.8, 1.8, 3.2, dark, 0, 0.55, 0));
    const tubeMat = getMat('aaTube', 0x747f77);
    [[-0.95, 0.85], [0.95, 0.85], [-0.95, -0.05], [0.95, -0.05]].forEach(function (p) {
      const tube = cylinder(0.36, 0.4, 4.6, 8, tubeMat, p[0], p[1], 1.8);
      tube.rotation.x = Math.PI / 2;
      head.add(tube);
    });
    const muzzleMat = new THREE.MeshBasicMaterial({
      color: 0xffd27a, transparent: true, opacity: 0
    });
    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.75, 8, 6), muzzleMat);
    muzzle.position.set(0, 0.4, 4.2);
    head.add(muzzle);
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff4b3c });
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), beaconMat);
    beacon.position.set(-14, 4.8, -10);
    g.add(beacon);

    serviceObstacle(site, 0, 0, 12);
    serviceDone(site);
    Details.airDefense = true;
    Details.aaLaunchers = 4;
    Details.aaVisuals = { radar: radarMast, launcher: head, muzzle: muzzleMat, beacon: beaconMat };
  }

  // Blue-and-white big-box frontage. The sign is painted on a canvas so the
  // logo and lettering stay crisp without any external image files.
  function walmartSignTexture() {
    const key = 'walmart-sign';
    if (shopTexCache[key]) return shopTexCache[key];
    const c = document.createElement('canvas');
    c.width = 512; c.height = 160;
    const g = c.getContext('2d');
    g.fillStyle = '#0757a6'; g.fillRect(0, 0, 512, 160);
    g.strokeStyle = '#ffffff'; g.lineWidth = 8; g.strokeRect(6, 6, 500, 148);
    g.strokeStyle = '#ffd414'; g.lineWidth = 15; g.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      g.beginPath();
      g.moveTo(76, 80);
      g.lineTo(76 + Math.cos(a) * 43, 80 + Math.sin(a) * 43);
      g.stroke();
    }
    g.fillStyle = '#ffffff'; g.textAlign = 'left'; g.textBaseline = 'middle';
    fitText(g, 'Walmart', 138, 84, 350, 78);
    const tex = new THREE.CanvasTexture(c);
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    shopTexCache[key] = tex;
    return tex;
  }

  function walmartSign(group, w, h, x, y, z, yaw) {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: walmartSignTexture(), side: THREE.DoubleSide }));
    sign.position.set(x, y, z);
    sign.rotation.y = yaw || 0;
    group.add(sign);
    return sign;
  }

  function buildWalmart() {
    const site = serviceSite('walmart');
    if (!site) return;
    const g = site.g, q = site.q;
    servicePad(g, q.w - 4, q.h - 4, 0x7c8386, 0.06);
    serviceFence(g, q.w - 3, q.h - 3, 12);

    const blue = getMat('walmartBlue', 0x0b5ca8);
    const white = getMat('walmartWhite', 0xf5f8fb);
    const roof = getMat('walmartRoof', 0x2b628f);
    const glass = getMat('walmartGlass', 0x9fc4d4, { emissive: 0x183440 });
    const yellow = getMat('walmartYellow', 0xffd414, { emissive: 0x6b4d00 });
    const poleMat = getMat('walmartPole', 0x555d63);

    // Store shell: blue walls, white parapet/pilasters and a broad glass front.
    const bw = 74, bd = 30, bz = -27, bh = 11.5;
    const front = bz + bd * 0.5 + 0.08;
    g.add(box(bw, bh, bd, blue, 0, bh * 0.5, bz));
    g.add(box(bw + 1.2, 0.8, bd + 1.2, roof, 0, bh + 0.4, bz));
    g.add(box(bw + 0.6, 1.3, bd + 0.6, white, 0, bh - 1.2, bz));
    g.add(box(bw + 0.6, 0.5, bd + 0.6, white, 0, 0.4, bz));
    for (let x = -32; x <= 32; x += 8) {
      g.add(box(1.0, bh - 1.0, 0.8, white, x, bh * 0.5 - 0.2, front + 0.2));
    }
    for (let i = -7; i <= 7; i++) {
      if (i >= -1 && i <= 1) continue;
      g.add(box(4.2, 3.2, 0.18, glass, i * 4.8, 3.3, front + 0.18));
    }
    [-2.6, 2.6].forEach(function (x) {
      g.add(box(3.4, 4.3, 0.22, glass, x, 2.4, front + 0.3));
      g.add(box(0.16, 0.16, 0.16, yellow, x + 0.9, 2.1, front + 0.46));
    });
    g.add(box(bw + 1.5, 0.5, 3.2, white, 0, 5.1, front + 1.6));
    g.add(box(2.4, 0.34, 0.22, yellow, 0, 6.9, front + 0.45));
    walmartSign(g, 43, 5.6, 0, 9.0, front + 0.35, 0);
    walmartSign(g, 43, 5.6, 0, 9.0, bz - bd * 0.5 - 0.35, Math.PI);

    // Wide asphalt apron with two rows of painted parking bays.
    servicePad(g, q.w - 6, 58, 0x3a4044, 0.07).position.z = 16.5;
    const lineMat = getMat('walmartLine', 0xf2f5f0);
    const stalls = 22, stallW = 3.8, rowDepth = 18, rowW = stalls * stallW;
    [-1.5, 28.5].forEach(function (rowZ) {
      for (let i = 0; i <= stalls; i++) {
        const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.16, rowDepth), lineMat);
        stripe.rotation.x = -Math.PI / 2;
        stripe.position.set((i - stalls * 0.5) * stallW, 0.09, rowZ);
        g.add(stripe);
      }
      [rowZ - rowDepth * 0.5, rowZ + rowDepth * 0.5].forEach(function (z) {
        const edge = new THREE.Mesh(new THREE.PlaneGeometry(rowW + 0.3, 0.16), lineMat);
        edge.rotation.x = -Math.PI / 2;
        edge.position.set(0, 0.09, z);
        g.add(edge);
      });
    });
    const carColors = [0xd9d6c9, 0x7d9ab5, 0xc67d6a, 0x9fb08b, 0xd6b45f, 0xe8e5dc];
    [[-4, -5], [4, -5], [8, 7], [-7, 7], [3, 25], [-8, 33]].forEach(function (p, i) {
      const car = CC.VehicleFactory.build(i % 4 === 0 ? 'truck' : 'car',
        carColors[i % carColors.length]);
      car.group.position.set(p[0], 0.1, p[1]);
      car.group.rotation.y = i % 2 ? Math.PI : 0;
      g.add(car.group);
      Details.parkedVehicles++;
    });

    // Lot lighting uses the shared lamp materials so it brightens at night.
    Details.walmartLights.length = 0;
    function addLotLamp(x, z) {
      const lamp = new THREE.Group();
      lamp.add(cylinder(0.14, 0.2, 8, 8, poleMat, 0, 4, 0));
      lamp.add(box(2.2, 0.22, 0.7, white, 0, 8.05, 0));
      const bulb = box(1.8, 0.16, 0.5, lampMat, 0, 7.9, 0);
      lamp.add(bulb);
      const glow = new THREE.Mesh(new THREE.SphereGeometry(1.5, 8, 6), lampGlowMat);
      glow.position.set(0, 7.7, 0);
      glow.scale.set(1.5, 0.5, 0.6);
      lamp.add(glow);
      const light = new THREE.PointLight(0xffe7b5, 0.08, 38, 2);
      light.position.set(0, 7.7, 0);
      lamp.add(light);
      Details.walmartLights.push(light);
      lamp.position.set(x, 0, z);
      g.add(lamp);
    }
    [-36, -18, 0, 18, 36].forEach(function (x) { addLotLamp(x, 14); });
    [-36, 36].forEach(function (x) { addLotLamp(x, 43); });

    // Double-sided roadside pylon beside the entrance gap.
    beamBetween(g, -39, 0, 44, -39, 11, 44, 0.28, poleMat);
    walmartSign(g, 18, 4.8, -39, 9.2, 44, 0);
    walmartSign(g, 18, 4.8, -39, 9.2, 44, Math.PI);
    serviceObstacle(site, 0, bz, 39);
    serviceObstacle(site, -39, 44, 2.6);
    serviceDone(site);
    Details.walmart = true;
    Details.walmartStalls = stalls * 2;
    Details.walmartPoles = 7;
    Details.walmartLampCount = Details.walmartLights.length;
  }

  // The club, diner, motel bar and liquor store are the town's nightlife frontage.
  function collectNightlifeSpots() {
    Details.businessCrowdSpots.length = 0;
    Details.clubParkingSpots = Details.clubParkingSpots || [];
    Details.clubParkingSpots.length = 0;
    Details.clubEntranceSpots = Details.clubEntranceSpots || [];
    Details.clubEntranceSpots.length = 0;
    const zones = (CC.ImageMap && CC.ImageMap.zones) || {};
    (Details.businessSites || []).forEach(function (b) {
      const fx = b.x - Math.sin(b.rot) * (b.fzFront + 3);
      const fz = b.z + Math.cos(b.rot) * (b.fzFront + 3);
      Details.businessCrowdSpots.push({ name: b.name, x: fx, z: fz, spread: 9 });
      if (!/GRILL|DINER|TAVERN|LOUNGE|MOTEL|BAR/i.test(b.name)) return;
      Details.nightlifeSpots.push({ name: b.name, x: fx, z: fz, spread: 9 });
    });
    const liquor = zones.liquor;
    if (liquor) {
      const spot = { name: 'BAY LIQUOR', x: liquor.x, z: liquor.z + liquor.h * 0.5 + 5, spread: 7 };
      Details.nightlifeSpots.push(spot);
      Details.businessCrowdSpots.push(spot);
    }
    // Retail and service storefronts get smaller clusters too, so every
    // business frontage has people moving around it instead of empty pavement.
    const retailZones = ['nightclub', 'pawn', 'postOffice', 'massage', 'gunStore',
      'chinese', 'beaconSeafood', 'motel', 'gas', 'fastfood', 'realty'];
    retailZones.forEach(function (name) {
      const q = zones[name];
      if (!q) return;
      // The realty office faces south toward Main Street, unlike the +Z
      // storefronts, so its little crowd belongs on the road side of the lot.
      const frontZ = name === 'realty' ? q.z - q.h * 0.5 - 5 : q.z + q.h * 0.5 + 5;
      Details.businessCrowdSpots.push({
        name: name === 'nightclub' ? 'CORAL CLUB' : name,
        x: q.x + U.randRange(rng, -q.w * 0.18, q.w * 0.18),
        z: frontZ,
        spread: Math.max(5, Math.min(q.w, q.h) * 0.3)
      });
    });
  }

  /* ---------- river coast ---------- */
  function buildDukeEnergyParking() {
    // Parking lot east of Palm Boulevard at the old Riverbend Loop crossing,
    // in front of Duke Energy. Entry-only gate faces Palm Blvd; single-lane
    // exit is Duke Lot Exit road.
    const cx = 334, cz = -92;
    const w = 56, d = 54;
    const g = new THREE.Group();
    g.position.set(cx, CC.heightAt(cx, cz), cz);
    const pad = box(w, 0.08, d, getMat('dukeLotPad', 0x7f8688), 0, 0.04, 0);
    pad.receiveShadow = true; g.add(pad);

    const lineMat = getMat('dukeLotLine', 0xe7e2d5);
    const stallW = 3.3, stallD = 6.2, rows = 4, cols = 12;
    const startX = -((cols - 1) * stallW) * 0.5;
    const rowZ = [-18, -10.5, 8.5, 16];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = startX + c * stallW;
        const z = rowZ[r];
        // stall lines
        g.add(box(0.08, 0.02, stallD, lineMat, x - stallW * 0.5, 0.09, z));
        if (c === cols - 1) g.add(box(0.08, 0.02, stallD, lineMat, x + stallW * 0.5, 0.09, z));
      }
    }
    // Drive aisles markings
    [-14.25, 12.5].forEach(function (z) {
      g.add(box(w - 6, 0.02, 0.12, lineMat, 0, 0.09, z));
    });

    // Parked cars
    const carColors = [0xd9d6c9, 0x7d9ab5, 0xc67d6a, 0x9fb08b, 0xd6b45f, 0xe8e5dc, 0x8b4a4a, 0x5f7f9a];
    let parked = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (rng() < 0.08) continue;
        const x = startX + c * stallW;
        const z = rowZ[r] + (rng() < 0.5 ? -0.3 : 0.3);
        const faceSouth = r < 2;
        const car = CC.VehicleFactory.build(rng() < 0.15 ? 'truck' : 'car',
          carColors[Math.floor(rng() * carColors.length)]);
        car.group.position.set(x, 0.08, z);
        car.group.rotation.y = (faceSouth ? Math.PI : 0) + (rng() - 0.5) * 0.06;
        g.add(car.group);
        parked++;
      }
    }
    Details.parkedVehicles = (Details.parkedVehicles || 0) + parked;

    // Fence around lot with entry gap on west side and exit gap on north side.
    const fx = w * 0.5, fz = d * 0.5;
    const fenceMat = getMat('dukeFence', 0xcfd3cb);
    function fenceRun(ax, az, bx, bz, gapA, gapB) {
      const len = Math.hypot(bx - ax, bz - az) || 1;
      const dx = (bx - ax) / len, dz = (bz - az) / len;
      const yaw = Math.atan2(-(bz - az), bx - ax);
      const n = Math.max(2, Math.floor(len / 2.4));
      for (let i = 0; i <= n; i++) {
        const t = i / n, s = t * len;
        if (gapA != null && s >= gapA && s <= gapB) continue;
        const px = ax + dx * s, pz = az + dz * s;
        const post = box(0.14, 1.8, 0.14, fenceMat, px, 0.9, pz);
        post.rotation.y = yaw; g.add(post);
      }
      const segs = [];
      if (gapA == null) segs.push([0, len]);
      else { if (gapA > 0.2) segs.push([0, gapA]); if (gapB < len - 0.2) segs.push([gapB, len]); }
      segs.forEach(function (seg) {
        const sMid = (seg[0] + seg[1]) * 0.5, sLen = seg[1] - seg[0];
        const mx = ax + dx * sMid, mz = az + dz * sMid;
        [0.65, 1.45].forEach(function (ry) {
          const rail = box(sLen, 0.1, 0.1, fenceMat, mx, ry, mz);
          rail.rotation.y = yaw; g.add(rail);
        });
      });
    }
    // west side: entry gate gap near middle (facing Palm Blvd)
    fenceRun(-fx, -fz, -fx, fz, d * 0.45, d * 0.45 + 8);
    fenceRun(fx, -fz, fx, fz); // east
    fenceRun(-fx, fz, fx, fz); // north
    fenceRun(-fx, -fz, fx, -fz, w * 0.72, w * 0.72 + 7); // south exit gap toward Duke Lot Exit

    // Entry gate system (entrance only) - boom arm on west gap
    const gateZ = -fz + d * 0.45 + 4;
    const gate = new THREE.Group();
    gate.position.set(-fx, 0, gateZ);
    const poleMat = getMat('dukeGatePole', 0x394447);
    gate.add(box(0.5, 3.8, 0.5, poleMat, 0, 1.9, -4));
    gate.add(box(0.5, 3.8, 0.5, poleMat, 0, 1.9, 4));
    const arm = box(8.2, 0.22, 0.5, getMat('dukeGateArm', 0xe9e5d9), 0, 3.2, 0);
    gate.add(arm);
    for (let i = 0; i < 5; i++) {
      gate.add(box(0.9, 0.24, 0.52, getMat('dukeGateStripe', 0xcf3b2f), -3 + i * 1.5, 3.2, 0));
    }
    const sign = box(3.2, 0.9, 0.12, getMat('dukeGateSign', 0x1f4f7a), 0, 4.5, -4);
    gate.add(sign);
    addShopSign(g, 'ENTRY ONLY', 5.5, 1.1, 0x1f4f7a, 0xffffff, -fx + 0.2, 4.5, gateZ - 4, Math.PI / 2);
    addShopSign(g, 'ENTRY ONLY', 5.5, 1.1, 0x1f4f7a, 0xffffff, -fx - 0.2, 4.5, gateZ - 4, -Math.PI / 2);
    // Gate arm stays down by default for visual? Entrance-only - keep it raised/open for entry
    arm.rotation.x = -Math.PI / 2.4;
    g.add(gate);

    // Exit sign
    addShopSign(g, 'EXIT ONLY', 4.8, 1.0, 0xb63b2b, 0xffffff, -fx + w * 0.72 + 3.5, 3.2, -fz + 0.2, 0);

    serviceScene.add(g);

    // Obstacles for fence; leave west entry and south exit gaps open.
    const obs = CC.World.obstacles;
    const worldX = function (lx, lz) { return cx + lx; };
    const worldZ = function (lx, lz) { return cz + lz; };
    function fenceObstacle(ax, az, bx, bz, gapA, gapB) {
      const len = Math.hypot(bx - ax, bz - az) || 1;
      const dx = (bx - ax) / len, dz = (bz - az) / len;
      const step = 4.5;
      for (let s = 0; s <= len; s += step) {
        if (gapA != null && s >= gapA - 1 && s <= gapB + 1) continue;
        const px = worldX(ax + dx * s, az + dz * s);
        const pz = worldZ(ax + dx * s, az + dz * s);
        obs.push({ x: px, z: pz, r: 1.1, type: 'fence' });
      }
    }
    fenceObstacle(-fx, -fz, -fx, fz, d * 0.45, d * 0.45 + 8);
    fenceObstacle(fx, -fz, fx, fz, null, null);
    fenceObstacle(-fx, fz, fx, fz, null, null);
    fenceObstacle(-fx, -fz, fx, -fz, w * 0.72, w * 0.72 + 7);
    Details.dukeParkingLot = { x: cx, z: cz, w: w, d: d, parked: parked, entryGapZ: gateZ, exitGapX: -fx + w * 0.72 + 3.5 };
  }

  function buildDukeEnergyPlant() {
    const site = serviceSite('nuclear');
    if (!site) return;
    const g = site.g, q = site.q;
    servicePad(g, q.w - 3, q.h - 3, 0xa2a7a2, 0.06);
    serviceFence(g, q.w - 3, q.h - 3, 5);
    const concrete = getMat('nukeConcrete', 0xb9bcb5);
    const steel = getMat('nukeSteel', 0x79858a);
    const domeMat = getMat('nukeDome', 0xd5d8d2);
    const glass = getMat('nukeGlass', 0x4d7f96, { emissive: 0x14364a });
    const accent = getMat('nukeAccent', 0x0d5c88);

    // Containment building and its rounded dome.
    g.add(box(17, 7, 15, concrete, -7, 3.5, -3));
    const dome = new THREE.Mesh(new THREE.SphereGeometry(8.6, 20, 12,
      0, Math.PI * 2, 0, Math.PI * 0.5), domeMat);
    dome.position.set(-7, 7, -3);
    g.add(dome);
    g.add(new THREE.Mesh(new THREE.TorusGeometry(8.6, 0.28, 6, 24), steel)
      .translateX(-7).translateY(7.05).translateZ(-3).rotateX(Math.PI / 2));

    // Hyperbolic cooling towers read as the classic nuclear-plant silhouette.
    [-14, 14].forEach(function (tx) {
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 5.2, 15, 18), concrete);
      tower.position.set(tx, 7.5, 10);
      g.add(tower);
      const lip = new THREE.Mesh(new THREE.TorusGeometry(3.45, 0.38, 6, 18), steel);
      lip.position.set(tx, 15.1, 10);
      lip.rotation.x = Math.PI / 2;
      g.add(lip);
      serviceObstacle(site, tx, 10, 5.4);
    });
    g.add(box(20, 6, 10, concrete, 13, 3, -8));
    g.add(box(20.4, 0.4, 10.4, accent, 13, 6.2, -8));
    for (let i = -3; i <= 3; i++) {
      g.add(box(1.2, 1.8, 0.16, glass, 13 + i * 2.5, 4.1, -2.9));
    }
    addShopSign(g, 'Duke Energy', 21, 3.2, 0x0b4b73, 0xffffff, 6, 10.5, -3.2, 0);
    serviceObstacle(site, -7, -3, 9);
    serviceObstacle(site, 13, -8, 10);

    // High-tension line following the east bank of the river. Pylons are only
    // placed on dry, road-free ground so nothing ends up in the channel.
    const wireMat = getMat('nukeWire', 0x3b4146);
    const towerMat = getMat('nukeLattice', 0x8d9597);
    const porcelain = getMat('nukePorcelain', 0xe6e2d4);
    const anchors = [
      [205, -178], [198, -120], [218, -62], [198, 4], [205, 62],
      [205, 122], [160, 176], [105, 222], [10, 232], [-90, 238]
    ];
    const placed = [];
    anchors.forEach(function (a) {
      const x = a[0], z = a[1];
      if (CC.coast.isWater(x, z) || CC.coast.inMarsh(x, z)) return;
      if (CC.roadClearance && CC.roadClearance(x, z, 2.5) < 3) return;
      const p = new THREE.Group();
      p.position.set(x, CC.heightAt(x, z), z);
      [-1.7, 1.7].forEach(function (dx) {
        [-1.7, 1.7].forEach(function (dz) {
          beamBetween(p, dx, 0, dz, dx * 0.25, 21, dz * 0.25, 0.24, towerMat);
        });
      });
      [6, 12, 17, 21].forEach(function (y) {
        const s = 1.7 - y / 21 * 1.25;
        beamBetween(p, -s, y, -s, s, y, -s, 0.11, towerMat);
        beamBetween(p, -s, y, s, s, y, s, 0.11, towerMat);
        beamBetween(p, -s, y, -s, -s, y, s, 0.11, towerMat);
        beamBetween(p, s, y, -s, s, y, s, 0.11, towerMat);
      });
      [-5.5, 0, 5.5].forEach(function (dz) {
        beamBetween(p, 0, 18.5, dz - 0.8, 0, 18.5, dz + 0.8, 0.22, towerMat);
        p.add(cylinder(0.13, 0.19, 1.3, 6, porcelain, 0, 17.8, dz));
      });
      serviceScene.add(p);
      placed.push({ x: x, z: z, base: p.position.y });
    });
    for (let i = 0; i < placed.length - 1; i++) {
      const a = placed[i], b = placed[i + 1];
      const span = Math.hypot(b.x - a.x, b.z - a.z);
      if (span > 125) continue;
      [-5.5, 0, 5.5].forEach(function (dz) {
        const wireA = { x: a.x, y: a.base + 17.8, z: a.z + dz };
        const wireB = { x: b.x, y: b.base + 17.8, z: b.z + dz };
        if (wireHitsBridge(wireA, wireB, 2.1, 1.5)) {
          Details.bridgeWiresSkipped = (Details.bridgeWiresSkipped || 0) + 1;
          return;
        }
        const steps = 10;
        for (let k = 0; k < steps; k++) {
          const t0 = k / steps, t1 = (k + 1) / steps;
          const sag = 2.1;
          const y0 = a.base + 17.8 - Math.sin(t0 * Math.PI) * sag;
          const y1 = b.base + 17.8 - Math.sin(t1 * Math.PI) * sag;
          beamBetween(serviceScene, U.lerp(a.x, b.x, t0), y0, a.z + dz,
            U.lerp(a.x, b.x, t1), y1, b.z + dz, 0.05, wireMat);
        }
      });
    }
    Details.nuclearPlant = true;
    Details.riverPylons = placed.length;
    serviceDone(site);
  }

  function buildWalkingStream() {
    const site = serviceSite('walkingStream');
    if (!site) return;
    const g = site.g, q = site.q;
    servicePad(g, q.w - 3, q.h - 3, 0x8fae7c, 0.06);
    serviceFence(g, q.w - 3, q.h - 3, 4.5);
    const lane = new THREE.Mesh(new THREE.PlaneGeometry(q.w - 7, 7),
      getMat('wsLane', 0x303438));
    lane.rotation.x = -Math.PI / 2;
    lane.position.y = 0.09;
    g.add(lane);
    const brick = facadeMat(0xcbb9a2, 'brick');
    const roof = getMat('wsRoof', 0x5b4f47);
    const trim = getMat('wsTrim', 0xf1ece0);
    [[-18, -12], [0, -12], [18, -12], [-18, 12], [0, 12], [18, 12]].forEach(function (p) {
      g.add(box(10, 3.6, 7.5, brick, p[0], 1.8, p[1]));
      g.add(box(10.8, 0.5, 8.2, roof, p[0], 3.85, p[1]));
      g.add(box(1.8, 2.4, 0.16, trim, p[0], 1.2, p[1] + 3.85));
      g.add(box(2.6, 1.2, 0.16, getMat('wsWindow', 0x8fb5c6, { emissive: 0x17303c }),
        p[0], 2.4, p[1] + 3.85));
      serviceObstacle(site, p[0], p[1], 5.5);
    });
    // Gated entry with a guard booth and a rising boom.
    const fenceMat = getMat('wsGate', 0x394b3f);
    [-5.4, 5.4].forEach(function (x) {
      g.add(box(1.2, 4.8, 1.2, fenceMat, x, 2.4, q.h * 0.5 - 2));
    });
    g.add(box(4.6, 2.6, 3.4, trim, 8.6, 1.3, q.h * 0.5 - 4));
    g.add(box(5.2, 0.35, 4, fenceMat, 8.6, 2.75, q.h * 0.5 - 4));
    beamBetween(g, -4.8, 1.2, q.h * 0.5 - 2, 4.8, 1.2, q.h * 0.5 - 2, 0.13, trim);
    addShopSign(g, 'WALKING STREAM', 18, 2.6, 0x244a32, 0xf4e9c8, 0, 6.4, q.h * 0.5 - 1.6, 0);
    serviceObstacle(site, 8.6, q.h * 0.5 - 4, 3);
    Details.walkingStream = true;
    Details.walkingStreamHomes = 6;
    serviceDone(site);
  }

  // Pixel-art materials shared by the PSX-style Beacon Seafood rebuild. The
  // textures themselves come from the harbor-wide cache above so every dock in
  // the game uses the same cutscene wood, tin and warm window palette.
  function beaconTexture(key, w, h, paint) {
    return pixelTexture('beacon:' + key, w, h, paint);
  }
  function beaconRand(seed) { return pixelRand(seed); }
  function beaconBasic(key, color, opts) {
    const cacheKey = 'beaconBasic:' + key;
    if (!tmpMat[cacheKey]) {
      tmpMat[cacheKey] = new THREE.MeshBasicMaterial(
        Object.assign({ color: color, fog: true }, opts || {}));
      tmpMat[cacheKey].name = key;
    }
    return tmpMat[cacheKey];
  }

  function buildBeaconSeafood() {
    const site = serviceSite('beaconSeafood');
    if (!site) return;
    const g = site.g, q = site.q;
    const bx = q.x, bz = q.z;
    const groundY = g.position.y;
    const waterY = C.SEA_LEVEL - groundY;
    const deckY = waterY + 1.05;
    g.name = 'Beacon Seafood PSX fish house';

    /* ---------- cutscene pixel textures ---------- */
    const woodTex = harborWoodTexture();
    const tinTex = harborTinTexture();
    const windowTex = harborWindowTexture();
    const signTex = beaconTexture('beaconSign', 256, 64, function (g2, w, h) {
      g2.fillStyle = '#4a3a26'; g2.fillRect(0, 0, w, h);
      g2.strokeStyle = '#2a1f14'; g2.lineWidth = 6; g2.strokeRect(3, 3, w - 6, h - 6);
      g2.fillStyle = '#f4d38a';
      g2.font = 'bold 30px "Courier New", monospace';
      g2.textAlign = 'center'; g2.textBaseline = 'middle';
      g2.fillText('BEACON SEAFOOD', w / 2, h / 2 + 2);
      const r = beaconRand(41);
      for (let i = 0; i < 40; i++) {
        g2.fillStyle = 'rgba(74,58,38,0.8)';
        g2.fillRect((r() * w) | 0, (r() * h) | 0, 2 + ((r() * 4) | 0), 2);
      }
    });

    /* ---------- shared PSX materials ---------- */
    const wallMat = getMat('beaconWallWood', 0xb08a60, { map: woodTex, side: THREE.DoubleSide });
    const darkWood = getMat('beaconDarkWood', 0x6d5138, { map: woodTex });
    const plankMat = getMat('beaconDockPlank', 0xa07d54, { map: woodTex });
    const tinMat = getMat('beaconTinRoof', 0xc0c4c6, { map: tinTex, side: THREE.DoubleSide });
    const rustMat = getMat('beaconRust', 0x8a5236);
    const metalMat = getMat('beaconMetal', 0x5b6166);
    const potMat = getMat('beaconCrabPot', 0x6b6a52);
    const glowMat = beaconBasic('beaconWindowGlow', 0xffc25a, { map: windowTex });
    const signMat = beaconBasic('beaconSignFace', 0xffffff, { map: signTex, side: THREE.DoubleSide });
    const lampMat = beaconBasic('beaconDeckLamp', 0xffd98a);
    const asphaltMat = getMat('beaconAsphalt', 0x3b3d3e);
    const lineMat = beaconBasic('beaconLotLine', 0xe6d9a8);
    const headMat = beaconBasic('beaconCarHead', 0xffe7a8);
    const tailMat = beaconBasic('beaconCarTail', 0xb8352c);
    const tireMat = getMat('beaconCarTire', 0x242629);
    const glassMat = getMat('beaconCarGlass', 0x3c5b68);

    function part(parent, w, h, d, material, x, y, z) {
      const m = box(w, h, d, material, x, y, z);
      parent.add(m);
      return m;
    }

    /* ---------- fish house, mirrored so the water is on +Z ---------- */
    const house = new THREE.Group();
    house.name = 'Beacon Seafood fish house';
    g.add(house);
    const houseZ = -7, houseW = 30, houseD = 13;
    part(house, houseW, 6.2, houseD, wallMat, 0, 3.5, houseZ);

    const roofL = part(house, 16.5, 0.35, 14.5, tinMat, -7.5, 7.7, houseZ);
    roofL.rotation.z = 0.36;
    const roofR = part(house, 16.5, 0.35, 14.5, tinMat, 7.5, 7.7, houseZ);
    roofR.rotation.z = -0.36;

    [houseZ - houseD / 2, houseZ + houseD / 2].forEach(function (z) {
      const gable = new THREE.BufferGeometry();
      gable.setAttribute('position', new THREE.Float32BufferAttribute([
        -15, 6.6, z, 15, 6.6, z, 0, 10.6, z
      ], 3));
      gable.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2));
      gable.computeVertexNormals();
      house.add(new THREE.Mesh(gable, wallMat));
    });

    [-10, -3.3, 3.3, 10].forEach(function (x) {
      part(house, 2.5, 2.2, 0.16, glowMat, x, 3.8, houseZ + houseD / 2 + 0.1);
      part(house, 2.5, 2.2, 0.16, glowMat, x, 3.8, houseZ - houseD / 2 - 0.1);
    });
    [-10.5, -3.5].forEach(function (z) {
      part(house, 0.16, 2.2, 2.5, glowMat, houseW / 2 + 0.1, 3.8, houseZ + z);
      part(house, 0.16, 2.2, 2.5, glowMat, -houseW / 2 - 0.1, 3.8, houseZ + z);
    });

    const frontSign = new THREE.Mesh(new THREE.PlaneGeometry(12, 2.8), signMat);
    frontSign.name = 'Beacon Seafood sign';
    frontSign.position.set(0, 7.4, houseZ + houseD / 2 + 0.12);
    house.add(frontSign);
    const backSign = new THREE.Mesh(new THREE.PlaneGeometry(12, 2.8), signMat);
    backSign.name = 'Beacon Seafood sign';
    backSign.position.set(0, 7.4, houseZ - houseD / 2 - 0.12);
    backSign.rotation.y = Math.PI;
    house.add(backSign);

    // Crab pots and drums stacked beside the land-facing door.
    const propRand = beaconRand(57);
    [[-12.5, 0.4, -2], [-12.5, 0.4, 0], [-12.5, 0.4, 2],
     [-12.5, 1.2, -1], [-12.5, 1.2, 1], [12.5, 0.4, -2], [12.5, 0.4, 0]
    ].forEach(function (p) {
      const pot = part(house, 1.8, 0.8, 1.5, potMat, p[0], p[1], houseZ + p[2]);
      pot.rotation.y = (propRand() - 0.5) * 0.3;
    });
    [[-11.5, 0.75, 5.5], [-9.8, 0.75, 5.8], [11.6, 0.75, 5.3]].forEach(function (p) {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.5, 7), rustMat);
      barrel.position.set(p[0], p[1], houseZ + p[2]);
      house.add(barrel);
    });

    serviceObstacle(site, 0, houseZ, 17);

    /* ---------- U-shaped commercial dock wrapped around the water side ---------- */
    const dock = new THREE.Group();
    dock.name = 'Beacon Seafood U-shaped dock';
    g.add(dock);
    part(dock, 34, 0.4, 6, plankMat, 0, deckY, 3.5);     // wharf along the shop
    part(dock, 5, 0.4, 28, plankMat, -14, deckY, 16);    // port walkway
    part(dock, 5, 0.4, 28, plankMat, 14, deckY, 16);     // starboard walkway
    part(dock, 33, 0.4, 4, plankMat, 0, deckY, 28);      // outer cross dock
    part(dock, 3, 0.4, 18, plankMat, -7, deckY, 38);     // port finger
    part(dock, 3, 0.4, 18, plankMat, 7, deckY, 38);      // starboard finger

    function dockPile(x, z) {
      const pile = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 2.2, 6), darkWood);
      pile.position.set(x, waterY + 0.35, z);
      dock.add(pile);
    }
    for (let px = -16; px <= 16; px += 4) dockPile(px, 6.5);
    [-2, 4, 10, 16, 22, 28].forEach(function (z) {
      dockPile(-16.2, z); dockPile(-11.8, z);
      dockPile(11.8, z); dockPile(16.2, z);
    });
    [-8.5, -5.5, 5.5, 8.5].forEach(function (x) {
      [29, 34, 39, 44].forEach(function (z) { dockPile(x, z); });
    });
    Details.riverDocks += 4;
    Details.beaconDockEnds = [{ x: bx - 7, z: bz + 47 }, { x: bx + 7, z: bz + 47 }];

    /* ---------- blocky shrimp trawlers, same silhouette as the cutscene ---------- */
    function makeTrawler(color) {
      const boat = new THREE.Group();
      const hullMat = getMat('beaconTrawlerHull' + color, color,
        { flatShading: true, side: THREE.DoubleSide });
      const deckMat = getMat('beaconTrawlerDeck', 0x8a7048, { map: woodTex });
      const cabinMat = getMat('beaconTrawlerCabin', 0xd8d6c8);

      part(boat, 4.4, 1.8, 12, hullMat, 0, 0.9, 0);
      const bow = new THREE.BufferGeometry();
      bow.setAttribute('position', new THREE.Float32BufferAttribute([
        -2.2, 0, 6, 2.2, 0, 6, 0, 0, 9.5,
        -2.2, 1.8, 6, 2.2, 1.8, 6, 0, 1.8, 9.5
      ], 3));
      bow.setIndex([0, 1, 2, 3, 5, 4, 0, 3, 4, 0, 4, 1,
                    1, 4, 5, 1, 5, 2, 2, 5, 3, 2, 3, 0]);
      bow.computeVertexNormals();
      boat.add(new THREE.Mesh(bow, hullMat));

      part(boat, 4.0, 0.2, 11, deckMat, 0, 1.85, 0);
      part(boat, 3.2, 2.6, 3.4, cabinMat, 0, 3.2, -2.2);
      part(boat, 3.6, 0.25, 3.8, hullMat, 0, 4.6, -2.2);
      [-1.1, 0, 1.1].forEach(function (wx) {
        part(boat, 0.85, 0.9, 0.1, glowMat, wx, 3.5, -0.42);
      });
      part(boat, 0.16, 5.5, 0.16, metalMat, 0, 4.6, 1.5);
      [-1, 1].forEach(function (side) {
        const outrigger = part(boat, 0.12, 0.12, 9, metalMat, side * 3.6, 3.6, 2.0);
        outrigger.rotation.x = -0.18;
        [[0, 6.8, 1.5, side * 3.6, 3.6, -1.5],
         [0, 6.8, 1.5, side * 3.6, 3.6, 6.5]].forEach(function (seg) {
          beamBetween(boat, seg[0], seg[1], seg[2], seg[3], seg[4], seg[5], 0.035, darkWood);
        });
      });
      [[-1.8, 2.4, 4], [1.8, 2.4, 4], [0, 2.4, -5]].forEach(function (p) {
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 4), lampMat);
        lamp.position.set(p[0], p[1], p[2]);
        boat.add(lamp);
      });
      [[-1.1, 2.25, 2.6], [1.1, 2.25, 2.6], [0, 2.95, 2.6]].forEach(function (p) {
        part(boat, 1.2, 0.55, 1.1, potMat, p[0], p[1], p[2]);
      });
      const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, 1.6, 8), metalMat);
      reel.rotation.z = Math.PI / 2;
      reel.position.set(0, 2.5, -4.4);
      boat.add(reel);
      return boat;
    }

    [
      { x: -9.5, z: 38, yaw: Math.PI + 0.05, color: 0x2f5d66, label: 'port finger trawler' },
      { x: 9.5, z: 38, yaw: Math.PI - 0.05, color: 0x7a4038, label: 'starboard finger trawler' },
      { x: -19, z: 16, yaw: Math.PI + 0.03, color: 0x3f5a75, label: 'port side trawler' },
      { x: 19, z: 16, yaw: Math.PI - 0.03, color: 0xc0a45c, label: 'starboard workboat' }
    ].forEach(function (spec) {
      const boat = makeTrawler(spec.color);
      boat.name = 'Beacon Seafood ' + spec.label;
      boat.position.set(spec.x, waterY + 0.4, spec.z);
      boat.rotation.y = spec.yaw;
      g.add(boat);
    });
    Details.fishingBoats += 4;

    /* ---------- game-style parking lot with parked cars ---------- */
    const lot = new THREE.Group();
    lot.name = 'Beacon Seafood parking lot';
    g.add(lot);
    const lotCx = 18, lotCz = -52, lotW = 46, lotD = 30;
    part(lot, lotW, 0.08, lotD, asphaltMat, lotCx, 0.08, lotCz);
    part(lot, 12, 0.06, 24, asphaltMat, lotCx, 0.06, lotCz - 28);
    const spotXs = [];
    for (let x = lotCx - 18; x <= lotCx + 18; x += 6) spotXs.push(x);
    spotXs.forEach(function (x) {
      part(lot, 0.18, 0.03, 5, lineMat, x, 0.15, -44);
      part(lot, 0.18, 0.03, 5, lineMat, x, 0.15, -60);
    });

    const parkSpots = []
      .concat(spotXs.map(function (x) { return { x: x, z: -60, h: 0 }; }))
      .concat(spotXs.map(function (x) { return { x: x, z: -44, h: Math.PI }; }));

    const carPalette = [0xb23b35, 0x2e5d8f, 0xd6c7a1, 0x4c6b46,
                        0x8d8d92, 0xe0d9c8, 0x2b2b2f, 0xd8a13a];
    const carKinds = ['car', 'coupe', 'compact', 'truck'];

    function fallbackParkedCar(color, truck) {
      const grp = new THREE.Group();
      const bodyMat = getMat('beaconParkedBody' + color, color);
      const len = truck ? 5 : 4.2;
      part(grp, 2.2, 0.72, len, bodyMat, 0, 0.72, 0);
      part(grp, 1.94, 0.72, truck ? 1.8 : 2, bodyMat, 0, 1.42, truck ? 0.9 : -0.2);
      part(grp, 1.98, 0.42, truck ? 1.9 : 2.1, glassMat, 0, 1.46, truck ? 0.9 : -0.2);
      [-1.12, 1.12].forEach(function (wx) {
        [-1.4, 1.4].forEach(function (wz) {
          const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.22, 7), tireMat);
          wheel.rotation.z = Math.PI / 2;
          wheel.position.set(wx, 0.32, wz);
          grp.add(wheel);
        });
      });
      [-0.72, 0.72].forEach(function (hx) {
        part(grp, 0.34, 0.18, 0.08, headMat, hx, 0.78, len / 2 + 0.04);
        part(grp, 0.34, 0.16, 0.08, tailMat, hx, 0.78, -len / 2 - 0.04);
      });
      return { group: grp, spec: { wheelRadius: truck ? 0.55 : 0.42 } };
    }

    let parkedCars = 0;
    parkSpots.forEach(function (spot, i) {
      // Leave two stalls open so the customer's car still has somewhere to park.
      if (i === 2 || i === 9) return;
      const color = carPalette[i % carPalette.length];
      const kind = carKinds[i % carKinds.length];
      let car = null;
      if (CC.VehicleFactory && CC.VehicleFactory.build && CC.vehicleSpecs[kind]) {
        car = CC.VehicleFactory.build(kind, color);
        (car.beams || []).forEach(function (beam) { beam.visible = false; });
      }
      if (!car || !car.group) car = fallbackParkedCar(color, kind === 'truck');
      car.group.name = 'Beacon parked car ' + (parkedCars + 1);
      const wy = CC.heightAt(bx + spot.x, bz + spot.z);
      car.group.position.set(spot.x, wy - groundY + car.spec.wheelRadius, spot.z);
      car.group.rotation.y = spot.h;
      lot.add(car.group);
      parkedCars++;
    });
    Details.beaconStaticCars = parkedCars;
    Details.beaconParkingLot = { x: bx + lotCx, z: bz + lotCz, w: lotW, h: lotD };
    Details.beaconTrawlers = 4;

    // Keep NPC boats clear of the new moorings.
    CC.World = CC.World || {};
    CC.World.noBoatZones = (CC.World.noBoatZones || []).filter(function (z) {
      return z.label !== 'Beacon Seafood Docks';
    });
    CC.World.noBoatZones.push({ x: bx, z: bz + 22, hw: 42, hz: 44, label: 'Beacon Seafood Docks' });

    /* ---------- worker spots on the new deck ---------- */
    Details.beaconDockSpots = Details.beaconDockSpots || [];
    Details.beaconDockSpots.length = 0;
    for (let x = -14; x <= 14; x += 4) {
      Details.beaconDockSpots.push({ x: bx + x, z: bz + 3.5 });
    }
    [-14, 14].forEach(function (x) {
      [8, 14, 20, 26].forEach(function (z) {
        Details.beaconDockSpots.push({ x: bx + x, z: bz + z });
      });
    });
    [-12, -6, 0, 6, 12].forEach(function (x) {
      Details.beaconDockSpots.push({ x: bx + x, z: bz + 28 });
    });
    [-7, 7].forEach(function (x) {
      [34, 40, 44].forEach(function (z) {
        Details.beaconDockSpots.push({ x: bx + x, z: bz + z });
      });
    });
    Details.businessCrowdSpots = (Details.businessCrowdSpots || []).filter(function (s) {
      return s.name !== 'BEACON SEAFOOD DOCK';
    });
    Details.businessCrowdSpots.push({
      name: 'BEACON SEAFOOD DOCK', x: bx, z: bz - 16, spread: 16
    });

    const openSpot = parkSpots[2];
    Details.beaconCustomerSpot = { x: bx + openSpot.x, z: bz + openSpot.z, yaw: openSpot.h };
    Details.beaconLotParkSpots = [2, 9].map(function (i) {
      const spot = parkSpots[i];
      return { x: bx + spot.x, z: bz + spot.z, h: spot.h };
    });
    Details.beaconSeafood = true;
    serviceDone(site);
  }

  function buildMarshReeds() {
    const river = CC.river;
    if (!river || !river.points || !serviceScene) return;
    const stalks = [];
    const tips = [];
    for (let i = 0; i < river.points.length - 1; i++) {
      const a = river.points[i], b = river.points[i + 1];
      const dx = b.x - a.x, dz = b.z - a.z;
      const len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len, nz = dx / len;
      for (let s = 0; s < len; s += 5) {
        const t = s / len;
        const w = U.lerp(a.w, b.w, t);
        [1, -1].forEach(function (side) {
          const off = w + U.randRange(rng, 2, 21);
          const x = a.x + dx * t + nx * off * side;
          const z = a.z + dz * t + nz * off * side;
          const d = CC.coast.riverDepth(x, z);
          if (d < 1 || d > CC.river.marshWidth - 2) return;
          if (CC.coast.onBridge && CC.coast.onBridge(x, z, 1)) return;
          if (CC.roadClearance && CC.roadClearance(x, z, 0.5) < 2) return;
          stalks.push({ x: x, z: z, s: U.randRange(rng, 0.7, 1.5), r: rng() * Math.PI });
          if (rng() < 0.32) tips.push({ x: x, z: z, s: U.randRange(rng, 0.7, 1.3) });
        });
      }
    }
    if (!stalks.length) return;
    const dummy = new THREE.Object3D();
    if (CC.AssetVegetation && CC.AssetVegetation.available !== false) {
      // The CC0 grass model makes much richer marsh edges than the old cylinders.
      stalks.forEach(function (p) {
        CC.AssetVegetation.queue('grass', p.x, CC.heightAt(p.x, p.z), p.z,
          p.s * 2.0, p.r);
      });
    } else {
      const reedMat = getMat('marshReed', 0x69884a, { side: THREE.DoubleSide });
      const reed = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(0.035, 0.09, 1.8, 4), reedMat, stalks.length);
      stalks.forEach(function (p, i) {
        dummy.position.set(p.x, CC.heightAt(p.x, p.z) + 0.85 * p.s, p.z);
        dummy.rotation.set(0, p.r, U.randRange(rng, -0.12, 0.12));
        dummy.scale.set(p.s, p.s, p.s);
        dummy.updateMatrix();
        reed.setMatrixAt(i, dummy.matrix);
      });
      reed.instanceMatrix.needsUpdate = true;
      reed.castShadow = false; reed.receiveShadow = true;
      serviceScene.add(reed);
    }
    if (tips.length) {
      const tip = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(0.11, 0.13, 0.55, 6),
        getMat('marshCattail', 0x6a4b2c), tips.length);
      tips.forEach(function (p, i) {
        dummy.position.set(p.x, CC.heightAt(p.x, p.z) + 1.75 * p.s, p.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(p.s);
        dummy.updateMatrix();
        tip.setMatrixAt(i, dummy.matrix);
      });
      tip.instanceMatrix.needsUpdate = true;
      tip.castShadow = false;
      serviceScene.add(tip);
    }
    Details.marshReeds = stalks.length;
  }

  // The baked map owns the water classification (so driving, swimming, the
  // minimap and the animated water shader all see these ponds). This pass only
  // adds the visible surface, a muddy bank and a tall reed fringe.
  function buildPonds(scene) {
    const ponds = (CC.ImageMap && CC.ImageMap.zones && CC.ImageMap.zones.ponds) || [];
    Details.ponds = ponds.slice();
    if (!ponds.length) return;
    Details.pondWater = 0;
    const dummy = new THREE.Object3D();
    const stalks = [], tips = [];
    ponds.forEach(function (p) {
      if (!p || !(p.r > 0)) return;
      const y = CC.heightAt(p.x, p.z);
      const bank = new THREE.Mesh(new THREE.RingGeometry(p.r, p.r + 2.6, 40),
        getMat('pondBank', 0x8b7955));
      bank.rotation.x = -Math.PI / 2;
      bank.position.set(p.x, y + 0.025, p.z);
      bank.receiveShadow = true;
      scene.add(bank);
      const waterMat = new THREE.MeshStandardMaterial({
        color: 0x3d9bb4, emissive: 0x123f4b, emissiveIntensity: 0.35,
        roughness: 0.18, metalness: 0.05,
        transparent: true, opacity: 0.92, depthWrite: false
      });
      waterMat.name = 'pondWater';
      const water = new THREE.Mesh(new THREE.CircleGeometry(p.r, 40), waterMat);
      water.rotation.x = -Math.PI / 2;
      water.position.set(p.x, y + 0.07, p.z);
      water.receiveShadow = false;
      scene.add(water);
      Details.pondWater++;

      const count = Math.max(28, Math.round(2 * Math.PI * p.r / 2.1));
      for (let i = 0; i < count; i++) {
        const a = (i + U.randRange(rng, -0.32, 0.32)) / count * Math.PI * 2;
        const radius = p.r + U.randRange(rng, 1.2, 4.8);
        const x = p.x + Math.cos(a) * radius;
        const z = p.z + Math.sin(a) * radius;
        if (CC.coast.isWater(x, z)) continue;
        if (CC.coast.inMarsh && CC.coast.inMarsh(x, z)) continue;
        if (isRoad(x, z) || inPlayZone(x, z)) continue;
        if (CC.roadClearance && CC.roadClearance(x, z, 0.5) < 1.5) continue;
        let blocked = false;
        const obstacles = CC.World.obstacles || [];
        for (let k = 0; k < obstacles.length; k++) {
          const o = obstacles[k];
          if (U.distance2D(x, z, o.x, o.z) < o.r + 0.5) { blocked = true; break; }
        }
        if (blocked) continue;
        const s = U.randRange(rng, 1.0, 1.9);
        stalks.push({ x: x, z: z, s: s, r: rng() * Math.PI * 2 });
        if (rng() < 0.3) tips.push({ x: x, z: z, s: s * 0.85 });
      }
    });
    if (stalks.length && CC.AssetVegetation && CC.AssetVegetation.available !== false) {
      stalks.forEach(function (p) {
        CC.AssetVegetation.queue('grass', p.x, CC.heightAt(p.x, p.z), p.z, p.s * 1.9, p.r);
      });
    } else if (stalks.length) {
      const reed = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(0.045, 0.1, 1.9, 4),
        getMat('pondReed', 0x6f8f4a, { side: THREE.DoubleSide }), stalks.length);
      stalks.forEach(function (p, i) {
        dummy.position.set(p.x, CC.heightAt(p.x, p.z) + 0.95 * p.s, p.z);
        dummy.rotation.set(0, p.r, U.randRange(rng, -0.14, 0.14));
        dummy.scale.setScalar(p.s);
        dummy.updateMatrix();
        reed.setMatrixAt(i, dummy.matrix);
      });
      reed.instanceMatrix.needsUpdate = true;
      reed.castShadow = false; reed.receiveShadow = true;
      scene.add(reed);
    }
    if (tips.length) {
      const tip = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(0.12, 0.14, 0.6, 6),
        getMat('pondCattail', 0x6a4b2c), tips.length);
      tips.forEach(function (p, i) {
        dummy.position.set(p.x, CC.heightAt(p.x, p.z) + 1.7 * p.s, p.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(p.s);
        dummy.updateMatrix();
        tip.setMatrixAt(i, dummy.matrix);
      });
      tip.instanceMatrix.needsUpdate = true;
      tip.castShadow = false;
      scene.add(tip);
    }
    Details.pondGrass = stalks.length;
  }

  /* ---------- river container terminal ---------- */
  function buildPort(scene) {
    const site = serviceSite('port');
    if (!site) return;
    const concrete = getMat('portConcrete', 0x8b9190,
      { map: CC.TextureGenerator ? CC.TextureGenerator.concrete() : null });
    const apronMat = getMat('portApron', 0x6f7678);
    const steel = getMat('portSteel', 0x4f575c);
    const crane = getMat('portCrane', 0xd6a63f);
    const dark = getMat('portDark', 0x30383c);
    const wall = facadeMat(0xd8d8cf, 'concrete');
    const containerColors = [0xb75043, 0x3f7f9c, 0xd0a94e, 0x6e8e63];

    // The quay follows the west bank; its rotation keeps the wall and cranes
    // parallel to the shipping lane instead of pointing across the river.
    const apron = new THREE.Group();
    apron.position.set(10, 0, 0);
    apron.rotation.y = -0.16;
    site.g.add(apron);
    apron.add(box(20, 0.5, 58, apronMat, 0, -0.25, 0));
    apron.add(box(1.3, 2.6, 58, concrete, 10, -0.4, 0));
    for (let z = -26; z <= 26; z += 8) {
      apron.add(cylinder(0.26, 0.3, 1.1, 6, dark, 8.6, 0.35, z));
    }

    // Two floating berths sit between the quay and the moored ship.
    [-14, 14].forEach(function (z) {
      apron.add(box(15, 0.5, 5.2, getMat('portDock', 0x8a6a49, { map: harborWoodTexture() }), 17, 0.1, z));
      [12, 24].forEach(function (x) {
        [-2.2, 2.2].forEach(function (oz) {
          apron.add(cylinder(0.22, 0.22, 3.2, 6, steel, x, -1.35, z + oz));
        });
      });
    });

    // Gantry cranes: a pair of portal frames, a boom over the ship and a hoist.
    [-14, 14].forEach(function (z) {
      const g = new THREE.Group();
      g.position.set(12, 0, z);
      apron.add(g);
      [-4, 4].forEach(function (oz) {
        beamBetween(g, -3, 0, oz, -3, 14, oz, 0.34, crane);
        beamBetween(g, 5, 0, oz, 5, 14, oz, 0.34, crane);
        beamBetween(g, -3, 14, oz, 5, 14, oz, 0.28, crane);
      });
      beamBetween(g, -3, 14, -4, -3, 14, 4, 0.24, crane);
      beamBetween(g, 5, 14, -4, 5, 14, 4, 0.24, crane);
      beamBetween(g, 5, 14, 0, 25, 12, 0, 0.3, crane);
      beamBetween(g, -3, 14, 0, -10, 12, 0, 0.22, crane);
      beamBetween(g, 16, 13.2, 0, 16, 4.6, 0, 0.06, dark);
      g.add(box(2.2, 0.6, 3.2, dark, 16, 4.2, 0));
    });

    // Stacked containers stay off the access lane at the apron centre.
    [-26, -16, 20, 28].forEach(function (z, i) {
      [-7, -2].forEach(function (x, row) {
        const levels = 2 + ((i + row) % 2);
        for (let level = 0; level < levels; level++) {
          const c = getMat('portContainer' + ((i + row + level) % 4),
            containerColors[(i + row + level) % 4]);
          apron.add(box(3.6, 2.2, 6, c, x, 1.1 + level * 2.2, z));
        }
      });
    });

    const shed = new THREE.Group();
    shed.position.set(-30, 0, -8);
    site.g.add(shed);
    shed.add(box(14, 7, 20, wall, 0, 3.5, 0));
    shed.add(box(15.5, 0.5, 21.5, concrete, 0, 7.25, 0));
    addShopSign(shed, 'RIVER PORT', 12, 2.6, 0x2f5d70, 0xffe9b0, 0, 5.2, 10.08, 0);
    servicePylon(site.g, 'RIVER PORT', -2, 17, 0x2f5d70, 0xffe9b0, 12);

    // A berthed ship makes the terminal read as a working cargo port. The
    // roaming cargo ships share the same lane and dock at these berths.
    const ship = new THREE.Group();
    // Parked at the south berth so inbound ships have the north berth free.
    ship.position.set(16, 0, -20);
    apron.add(ship);
    ship.add(box(5.6, 2.6, 34, getMat('portShipHull', 0x33424c), 0, 0.5, 0));
    const bow = new THREE.Mesh(new THREE.ConeGeometry(2.8, 5, 4),
      getMat('portShipHull', 0x33424c));
    bow.rotation.x = Math.PI / 2; bow.rotation.y = Math.PI / 4;
    bow.position.set(0, 0.5, 19);
    ship.add(bow);
    for (let i = 0; i < 8; i++) {
      const c = getMat('portShipContainer' + (i % 4), containerColors[i % 4]);
      const level = i < 4 ? 0 : 1;
      ship.add(box(2.4, 1.7, 3.4, c, i % 2 ? 1.2 : -1.2,
        2.1 + level * 1.7, -11 + Math.floor(i / 2) * 4));
    }
    ship.add(box(3, 2.4, 3, getMat('portShipCabin', 0xe6e2d6), 0, 3.2, 12));

    serviceObstacle(site, -30, -8, 12);
    serviceObstacle(site, -6, -22, 6);
    serviceObstacle(site, -6, 24, 6);
    serviceDone(site);
  }

  // Lit channel markers are instanced: four meshes for the whole river instead
  // of one object per buoy. Red sits on the right when returning to port.
  function buildPalmLoopPylons(scene) {
    // Road crosses river at grade here; add pylons for support with a center gap for boats.
    const pts = [[196,264],[192,266],[188,268]];
    const concrete = getMat('bridgeConcrete', 0x8d9290, { map: CC.TextureGenerator ? CC.TextureGenerator.concrete() : null });
    const steel = getMat('bridgeSteel', 0x535b60);
    pts.forEach(function (p, i) {
      const x = p[0], z = p[1];
      if (CC.coast && CC.coast.isWater && CC.coast.isWater(x, z)) return; // center gap for boat traffic
      const groundY = CC.groundHeightAt ? CC.groundHeightAt(x, z) : CC.heightAt(x, z);
      const roadY = CC.heightAt(x, z);
      const h = Math.max(1.2, roadY - groundY + 1.2);
      [-1, 1].forEach(function (side) {
        const px = x + side * 4.2;
        const pz = z;
        const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.48, h, 8), concrete);
        pylon.position.set(px, groundY + h * 0.5 - 0.1, pz);
        pylon.castShadow = false; pylon.receiveShadow = true;
        scene.add(pylon);
        scene.add(box(0.8, 0.25, 0.8, steel, px, roadY - 0.2, pz));
      });
      scene.add(box(8.8, 0.28, 0.7, steel, x, roadY - 0.28, z));
    });
  }

  function buildChannelMarkers(scene) {
    const markers = CC.channelMarkers || [];
    if (!markers.length) return;
    const dummy = new THREE.Object3D();
    const lightMats = { red: null, green: null };
    ['red', 'green'].forEach(function (color) {
      const group = markers.filter(function (m) { return m.color === color; });
      if (!group.length) return;
      const bodyMat = getMat('channelBuoy' + color,
        color === 'red' ? 0xc94138 : 0x2f9d63);
      const lightMat = mat(color === 'red' ? 0xff4b40 : 0x4dffa0, {
        emissive: color === 'red' ? 0xd21d14 : 0x0fbf62,
        emissiveIntensity: 0.4
      });
      lightMats[color] = lightMat;
      const bodies = new THREE.InstancedMesh(
        new THREE.ConeGeometry(0.85, 2.4, 7), bodyMat, group.length);
      const lights = new THREE.InstancedMesh(
        new THREE.SphereGeometry(0.42, 7, 5), lightMat, group.length);
      group.forEach(function (m, i) {
        dummy.position.set(m.x, C.SEA_LEVEL + 1.0, m.z);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        bodies.setMatrixAt(i, dummy.matrix);
        dummy.position.y = C.SEA_LEVEL + 2.5;
        dummy.updateMatrix();
        lights.setMatrixAt(i, dummy.matrix);
      });
      bodies.instanceMatrix.needsUpdate = true;
      lights.instanceMatrix.needsUpdate = true;
      bodies.frustumCulled = false;
      lights.frustumCulled = false;
      scene.add(bodies);
      scene.add(lights);
    });
    Details.channelLights = lightMats;
    Details.channelBuoys = markers.length;
  }

  function buildCommunityServices(scene) {
    serviceScene = scene;
    buildCommunityShops();
    buildMotel(scene);
    collectNightlifeSpots();
    buildWaterTreatment();
    buildFuelStorage();
    buildAirport();
    buildMilitaryOutpost();
    buildWaterTowerSite();
    buildCemetery();
    // buildChurch(); removed
    buildSpiritualSign(scene);
    buildHospital();
    buildPoliceStation();
    buildBoatyard();
    buildDogPark();
    buildPowerStation();
    buildSatelliteDishes();
    buildAirDefense();
    buildWalmart();
    buildDukeEnergyPlant();
    buildDukeEnergyParking();
    buildWalkingStream();
    buildBeaconSeafood();
    buildRealtyOffice(scene);
    buildPort(scene);
    buildPalmLoopPylons(scene);
    buildChannelMarkers(scene);
    buildMarshReeds();
    serviceScene = null;
  }

  function makeMooredBoat(color) {
    const g = new THREE.Group();
    const hull = getMat('marinaHull' + color, color);
    g.add(box(2.1, 0.65, 5.0, hull, 0, 0.35, 0));
    const bow = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 1.05, 2.2, 4), hull);
    bow.rotation.x = Math.PI / 2; bow.rotation.y = Math.PI / 4;
    bow.position.set(0, 0.35, 3.3);
    g.add(bow);
    g.add(box(1.7, 0.7, 1.6, getMat('marinaCabin', 0xf1ede0), 0, 1.0, -0.4));
    g.add(box(1.8, 0.12, 4.6, getMat('marinaDeck', 0xd7c59e), 0, 0.72, 0.2));
    return g;
  }

  function makeFishingTrawler(color, deckColor) {
    const g = new THREE.Group();
    const hull = getMat('trawlHull' + color, color);
    const deck = getMat('trawlDeck' + (deckColor||0), deckColor || 0xbfae8f);
    const cabin = getMat('trawlCabin', 0xe8e2d2);
    g.add(box(3.8, 1.2, 12.5, hull, 0, 0.55, 0));
    const bow = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 1.9, 3.2, 4), hull);
    bow.rotation.x = Math.PI / 2; bow.rotation.y = Math.PI / 4;
    bow.position.set(0, 0.55, 7.6);
    g.add(bow);
    g.add(box(4.0, 0.18, 12.8, deck, 0, 1.15, 0.2));
    g.add(box(2.8, 2.0, 3.0, cabin, 0, 2.2, -2.8));
    g.add(box(2.9, 0.14, 3.2, getMat('trawlCabRoof', 0x7a8a96), 0, 3.25, -2.8));
    // wheelhouse windows
    [-0.7, 0.7].forEach(function (x) {
      g.add(box(0.8, 0.6, 0.08, getMat('trawlGlass', 0x9fc4cd, { emissive: 0x183541 }), x, 2.45, -1.28));
    });
    g.add(box(1.4, 0.5, 0.08, getMat('trawlGlass', 0x9fc4cd, { emissive: 0x183541 }), 0, 2.45, -4.34));
    // mast/boom
    g.add(cylinder(0.12, 0.16, 6.5, 6, getMat('trawlMast', 0x6b6058), 0, 4.2, 0.5));
    g.add(box(0.12, 0.12, 5.5, getMat('trawlBoom', 0x7a6a5a), 0, 5.4, 2.8));
    // net/reel area
    g.add(box(2.2, 0.8, 2.2, getMat('trawlReel', 0x5f6770), 0, 1.55, 3.2));
    g.add(box(1.8, 0.5, 1.4, getMat('trawlNet', 0x6f7a5a), 0, 1.4, 5.0));
    return g;
  }

  function buildMarina(scene) {
    const launch = (CC.World.imageLandmarks || []).filter(function (l) { return l.type === 'launch'; })[0] ||
      { x: -291, z: 95 };
    const z0 = launch.z;
    let shoreX = launch.x - 40;
    for (let x = launch.x - 4; x > launch.x - 110; x -= 2) {
      if (CC.coast.isWater(x, z0)) { shoreX = x; break; }
    }
    const marinaWoodTex = harborWoodTexture();
    const woodMat = getMat('marinaWood', 0xa07d54, { map: marinaWoodTex });
    const darkWood = getMat('marinaWoodDark', 0x6d5138, { map: marinaWoodTex });
    const postMat = getMat('marinaPost', 0x6d5138, { map: marinaWoodTex });

    const pierStart = shoreX + 4, pierEnd = shoreX - 40;
    scene.add(box(pierStart - pierEnd, 0.32, 5.0, woodMat,
      (pierStart + pierEnd) * 0.5, 1.05, z0));
    for (let x = pierEnd + 2; x <= pierStart; x += 6) {
      [-2.3, 2.3].forEach(function (dz) {
        scene.add(cylinder(0.22, 0.26, 2.5, 6, postMat, x, 0.05, z0 + dz));
      });
    }
    const slipsX = [shoreX - 9, shoreX - 18, shoreX - 27, shoreX - 36];
    slipsX.forEach(function (x) {
      [-1, 1].forEach(function (side) {
        const zc = z0 + side * 8.5;
        scene.add(box(1.6, 0.28, 11, darkWood, x, 1.05, zc));
        [-5, 5].forEach(function (dz) {
          scene.add(cylinder(0.18, 0.22, 2.4, 6, postMat, x, 0.05, zc + dz));
        });
      });
    });
    const hullColors = [0xf2eee0, 0xdfe8ec, 0xe8d3b0, 0xbcd8d5];
    let n = 0;
    slipsX.forEach(function (x) {
      [-1, 1].forEach(function (side) {
        const boat = makeMooredBoat(hullColors[n % hullColors.length]);
        boat.position.set(x - 2.5, C.SEA_LEVEL + 0.12, z0 + side * 11.5);
        boat.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
        scene.add(boat);
        n++;
      });
    });
    const sign = new THREE.Group();
    sign.add(cylinder(0.1, 0.13, 3.2, 6, postMat, 0, 1.6, 0));
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 2),
      new THREE.MeshLambertMaterial({ map: signFaceTexture('MARINA', 'plain'), transparent: true, side: THREE.DoubleSide })
    );
    face.position.y = 3.3;
    sign.add(face);
    sign.position.set(pierStart - 2, CC.heightAt(pierStart - 2, z0 + 4.5), z0 + 4.5);
    sign.rotation.y = Math.PI / 2;
    scene.add(sign);

    let spawnX = shoreX - 22;
    while (spawnX > shoreX - 60 && !CC.coast.isWater(spawnX, z0 + 14)) spawnX -= 4;
    CC.marinaSpawn = { x: spawnX, z: z0 + 14, heading: -Math.PI / 2 };
    CC.launchSpawn = { x: launch.x + 5, z: z0, heading: Math.PI / 2 };
    Details.marina = { x: shoreX, z: z0, slips: n };
  }

  /* ---------- animated water overlay for the baked map ---------- */
  // The old noise-texture shader was removed. The shared retro-water module
  // builds two masked low-poly planes with pixelated canvas textures and the
  // same wave equation used by buoyancy.
  function buildAnimatedWater(scene) {
    if (!CC.World.imageMode || !CC.RetroWater) return;
    CC.RetroWater.createRetroWater(scene, {
      width: C.WORLD.maxX - C.WORLD.minX,
      height: C.WORLD.maxZ - C.WORLD.minZ,
      cx: (C.WORLD.minX + C.WORLD.maxX) * 0.5,
      cz: (C.WORLD.minZ + C.WORLD.maxZ) * 0.5,
      segments: 48
    });
    Details.waterWaves = true;
  }

  /* ---------- beachgoers, umbrellas and lifeguard stations ---------- */
  function beachX(z, offset) {
    const IM = CC.ImageMap;
    const shore = IM && IM.shoreLine ? IM.shoreLine(z) : C.WORLD.minX + 120;
    return shore + (offset == null ? 16 : offset);
  }
  function addBeachUmbrella(group, x, z, color) {
    const y = CC.heightAt(x, z);
    const pole = getMat('beachUmbrellaPole', 0xd9d4c6);
    beamBetween(group, x, y, z, x, y + 3.6, z, 0.07, pole);
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(2.8, 1.2, 10), getMat('umbrella' + color, color));
    canopy.position.set(x, y + 3.7, z);
    canopy.castShadow = true; group.add(canopy);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 5), pole);
    tip.position.set(x, y + 4.35, z); group.add(tip);
  }
  function addBeachChair(group, x, z, yaw, color) {
    const y = CC.heightAt(x, z);
    const chair = new THREE.Group();
    const fabric = getMat('chairFabric' + color, color);
    const frame = getMat('chairFrame', 0x9b8570);
    chair.add(box(1.25, 0.11, 1.25, fabric, 0, 0.42, 0));
    const back = box(1.25, 1.2, 0.1, fabric, 0, 1.0, -0.6);
    back.rotation.x = -0.28; chair.add(back);
    [-0.52, 0.52].forEach(function (lx) {
      chair.add(box(0.09, 0.5, 0.09, frame, lx, 0.25, 0));
      chair.add(box(0.09, 0.95, 0.09, frame, lx, 0.65, -0.62));
    });
    chair.position.set(x, y, z);
    chair.rotation.y = yaw || 0;
    group.add(chair);
  }
  function addBeachTowel(group, x, z, yaw, color) {
    const y = CC.heightAt(x, z);
    const towel = box(1.7, 0.06, 2.4, getMat('towel' + color, color), x, y + 0.05, z);
    towel.rotation.y = yaw || 0;
    group.add(towel);
  }
  function addLifeguardStation(scene, x, z) {
    const y = CC.heightAt(x, z);
    const g = new THREE.Group();
    const wood = getMat('lifeWood', 0xc28d58);
    const red = getMat('lifeRed', 0xd9503f);
    const white = getMat('lifeWhite', 0xf2ede0);
    [-2.2, 2.2].forEach(function (ox) {
      [-1.8, 1.8].forEach(function (oz) {
        beamBetween(g, x + ox, y - 0.2, z + oz, x + ox, y + 3.4, z + oz, 0.16, wood);
      });
    });
    g.add(box(5.6, 0.3, 4.4, wood, x, y + 3.5, z));
    g.add(box(4.4, 1.1, 0.16, wood, x, y + 4.3, z - 2.0));
    g.add(box(5.8, 0.28, 4.6, red, x, y + 5.0, z));
    g.add(box(3.4, 0.14, 0.5, white, x, y + 4.4, z + 2.15));
    addShopSign(g, 'LIFEGUARD', 4.6, 1.1, 0xd9503f, 0xffffff, x, y + 5.6, z + 2.25, 0);
    // Ladder and rescue board.
    [-0.55, 0.55].forEach(function (ox) {
      beamBetween(g, x + ox, y, z + 2.6, x + ox, y + 3.5, z + 2.6, 0.07, wood);
    });
    for (let i = 0; i < 5; i++) {
      g.add(box(1.2, 0.08, 0.12, wood, x, y + 0.6 + i * 0.65, z + 2.6));
    }
    const board = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 10), white);
    board.scale.set(0.7, 2.0, 0.12);
    board.position.set(x + 3.2, y + 1.0, z);
    board.rotation.z = Math.PI / 2;
    g.add(board);
    addBeachChair(g, x, z + 1.6, 0, 0xf2c14e);
    scene.add(g);
  }
  function addVolleyballNet(scene, x, z) {
    const y = CC.heightAt(x, z);
    const g = new THREE.Group();
    const post = getMat('volleyPost', 0xd7d1c2);
    [-4.5, 4.5].forEach(function (ox) {
      beamBetween(g, x + ox, y, z, x + ox, y + 2.6, z, 0.1, post);
    });
    const lines = [];
    for (let i = 0; i <= 12; i++) {
      const px = x - 4.5 + i * 0.75;
      lines.push(px, y + 1.1, z, px, y + 2.45, z);
    }
    for (let j = 0; j <= 6; j++) {
      const py = y + 1.1 + j * 0.225;
      lines.push(x - 4.5, py, z, x + 4.5, py, z);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    g.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xf5f2e8 })));
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8),
      getMat('volleyBall', 0xf2d66c));
    g.add(ball);
    scene.add(g);
    Details.beachBalls.push({ mesh: ball, base: new THREE.Vector3(x, y + 2.2, z), phase: rng() * 6.28 });
  }
  function addBeachPerson(scene, x, z, yaw, palette, wave) {
    const person = CC.CharacterFactory && CC.CharacterFactory.build ? CC.CharacterFactory.build({
      skin: U.pick(rng, [0xe8bd96, 0xc98f62, 0xf1c9a5, 0x9b6247]),
      shirt: palette, pants: U.pick(rng, [0xf0e3c2, 0x6f8fa8, 0xdc8a6a]),
      hair: U.pick(rng, [0x35291f, 0x5b3b20, 0x201a17]),
      hat: rng() < 0.45 ? U.pick(rng, [0xf3d98a, 0xe7745e, 0x5aa7bd]) : null
    }) : null;
    if (!person) return;
    person.group.position.set(x, CC.heightAt(x, z), z);
    person.group.rotation.y = yaw || 0;
    scene.add(person.group);
    if (wave) {
      Details.beachWavePeople.push({
        armL: person.armL, armR: person.armR,
        phase: rng() * 6.28, speed: U.randRange(rng, 1.6, 3.1)
      });
    }
  }
  function buildBeachRecreation(scene) {
    const IM = CC.ImageMap;
    const spots = [35, 70, 125, 165, 205];
    spots.forEach(function (z, i) {
      const bx = beachX(z, 14 + (i % 2) * 4);
      if (IM && IM.classify && IM.classify(bx, z) !== CLS.SAND) return;
      if (isRoad(bx, z) || !dry(bx, z)) return;
      const palettes = [0xe96f5a, 0x4ea5c4, 0xf3c34f, 0x8a72c6, 0x6fbb82];
      addBeachUmbrella(scene, bx, z, palettes[i % palettes.length]);
      addBeachChair(scene, bx + 2.4, z + 1.2, -0.4, 0xf3e6c7);
      addBeachChair(scene, bx - 2.6, z + 1.8, 0.3, 0xd9d2bb);
      addBeachTowel(scene, bx + 0.4, z + 4.0, 0.12, palettes[(i + 2) % palettes.length]);
      addBeachPerson(scene, bx + 2.4, z + 1.2, -0.4, palettes[i % palettes.length], false);
      addBeachPerson(scene, bx - 2.2, z + 3.4, 0.6, palettes[(i + 1) % palettes.length], i % 2 === 0);
      Details.beachGoers += 2;
    });
    const lifeZ = [95, 182];
    lifeZ.forEach(function (z) {
      const x = beachX(z, 20);
      if (IM && IM.classify && IM.classify(x, z) !== CLS.SAND) return;
      if (isRoad(x, z)) return;
      addLifeguardStation(scene, x, z);
      addBeachPerson(scene, x + 1.5, z + 3.2, Math.PI, 0xe45745, true);
      Details.beachGoers++;
    });
    const vz = 147;
    const vx = beachX(vz, 17);
    if ((!IM || !IM.classify || IM.classify(vx, vz) === CLS.SAND) && !isRoad(vx, vz)) {
      addVolleyballNet(scene, vx, vz);
      addBeachPerson(scene, vx - 5.6, vz + 2.5, 1.0, 0xf2c14e, true);
      addBeachPerson(scene, vx + 5.6, vz + 2.5, -1.0, 0x58a7c4, true);
      Details.beachGoers += 2;
    }
  }

  /* ---------- sea life on the bay floor ---------- */
  function makeFish(color) {
    const g = new THREE.Group();
    const skin = getMat('fish' + color, color);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 9, 7), skin);
    body.scale.set(0.55, 0.42, 1.5); g.add(body);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.65, 4), skin);
    tail.rotation.x = -Math.PI / 2; tail.position.z = -0.9; g.add(tail);
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 4), skin);
    fin.position.y = 0.42; fin.rotation.x = -0.5; g.add(fin);
    [-0.26, 0.26].forEach(function (ex) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.065, 5, 4), getMat('fishEye', 0x161a1c));
      eye.position.set(ex, 0.08, 0.62); g.add(eye);
    });
    g.userData.tail = tail;
    return g;
  }
  function makeCrab(color) {
    const g = new THREE.Group();
    const shell = getMat('crab' + color, color);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 9, 6), shell);
    body.scale.set(1.15, 0.45, 0.85); body.position.y = 0.3; g.add(body);
    [-0.5, 0.5].forEach(function (ex) {
      const claw = new THREE.Mesh(new THREE.SphereGeometry(0.24, 7, 5), shell);
      claw.position.set(ex * 2.1, 0.35, 0.5); g.add(claw);
      for (let i = 0; i < 3; i++) {
        const leg = box(0.5, 0.07, 0.08, shell, ex * 1.5, 0.18, -0.3 + i * 0.3);
        leg.rotation.y = ex * 0.5; g.add(leg);
      }
    });
    return g;
  }
  function makeLobster() {
    const g = new THREE.Group();
    const shell = getMat('lobsterShell', 0xc4513d);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 1.5, 7), shell);
    body.rotation.x = Math.PI / 2; body.position.y = 0.3; g.add(body);
    [-0.3, 0.3].forEach(function (ex) {
      const claw = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), shell);
      claw.scale.set(0.8, 0.6, 1.3); claw.position.set(ex, 0.35, 1.0); g.add(claw);
      beamBetween(g, ex, 0.3, 0.5, ex, 0.35, 0.9, 0.07, shell);
      beamBetween(g, ex * 0.7, 0.4, 0.7, ex * 1.6, 0.25, 2.0, 0.025, shell);
    });
    return g;
  }
  function makeClam() {
    const g = new THREE.Group();
    const shell = getMat('clamShell', 0xd8c7a3);
    const bottom = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 6, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5), shell);
    bottom.scale.set(1, 0.5, 1); g.add(bottom);
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), shell);
    top.scale.set(1, 0.45, 1); top.position.y = 0.05; g.add(top);
    g.userData.top = top;
    return g;
  }
  function makeStarfish() {
    const g = new THREE.Group();
    const skin = getMat('starfish', 0xe39a55);
    for (let i = 0; i < 5; i++) {
      const arm = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.1, 5), skin);
      const a = i / 5 * Math.PI * 2;
      arm.position.set(Math.cos(a) * 0.45, 0.05, Math.sin(a) * 0.45);
      arm.rotation.z = Math.PI / 2;
      arm.rotation.y = -a;
      g.add(arm);
    }
    return g;
  }
  function buildSeaLife(scene) {
    const colors = [0xf2c14e, 0x5fa8c9, 0xe9776a, 0x9fd0c1, 0xb28ad0];
    for (let i = 0; i < 18; i++) {
      const z = U.randRange(rng, -330, 250);
      const x = (CC.coast.westLine ? CC.coast.westLine(z) : -300) - U.randRange(rng, 12, 95);
      if (x < C.WORLD.minX + 3) continue;
      const fish = makeFish(U.pick(rng, colors));
      fish.userData = {
        kind: 'fish', cx: x, cz: z, rx: U.randRange(rng, 8, 22),
        rz: U.randRange(rng, 5, 14), speed: U.randRange(rng, 0.3, 0.7),
        phase: rng() * 6.28, depth: U.randRange(rng, 1.2, 3.8)
      };
      scene.add(fish); Details.seaLife.push(fish);
    }
    const floorTypes = [makeCrab, makeCrab, makeLobster, makeClam, makeStarfish];
    for (let i = 0; i < 30; i++) {
      const z = U.randRange(rng, -330, 250);
      const x = (CC.coast.westLine ? CC.coast.westLine(z) : -300) - U.randRange(rng, 8, 90);
      if (x < C.WORLD.minX + 3) continue;
      const kind = floorTypes[i % floorTypes.length];
      const creature = kind(0xc96f4f);
      creature.position.set(x, -5.7, z);
      creature.rotation.y = rng() * 6.28;
      creature.userData = { kind: i % floorTypes.length, phase: rng() * 6.28 };
      scene.add(creature); Details.seaLife.push(creature);
    }
  }

  /* ---------- beach plants, dunes, dense forest and trails ---------- */
  function buildBeachPlants(scene) {
    const IM = CC.ImageMap, W = C.WORLD;
    const dunes = [], seaGrass = [], weeds = [];
    let attempts = 0;
    while (dunes.length < 340 && attempts < 40000) {
      attempts++;
      const x = U.randRange(rng, W.minX + 6, W.maxX - 6);
      const z = U.randRange(rng, W.minZ + 6, W.maxZ - 6);
      if (CC.World.imageMode && IM && IM.classify) {
        if (IM.classify(x, z) !== CLS.SAND) continue;
      } else if (CC.surfaceAt(x, z) !== 'sand') continue;
      const dw = CC.coast.distanceToWater(x, z);
      if (dw < 2 || dw > 34) continue;
      if (isRoad(x, z)) continue;
      dunes.push([x, z, U.randRange(rng, 1.6, 4.2)]);
    }
    attempts = 0;
    while (seaGrass.length < 1500 && attempts < 50000) {
      attempts++;
      const x = U.randRange(rng, W.minX + 6, W.maxX - 6);
      const z = U.randRange(rng, W.minZ + 6, W.maxZ - 6);
      const sand = CC.World.imageMode && IM && IM.classify ?
        IM.classify(x, z) === CLS.SAND : CC.surfaceAt(x, z) === 'sand';
      if (!sand || isRoad(x, z)) continue;
      const dw = CC.coast.distanceToWater(x, z);
      if (dw < 1 || dw > 26) continue;
      (rng() < 0.72 ? seaGrass : weeds).push([x, z, U.randRange(rng, 0.7, 1.8)]);
    }

    function inst(geo, material, spots, placeFn, colors) {
      tiledInstances(scene, geo, material, spots, placeFn, colors, false);
    }
    inst(new THREE.IcosahedronGeometry(1, 0),
      getMat('duneSand', 0xd9c79a), dunes, function (d, s) {
        d.position.set(s[0], CC.heightAt(s[0], s[1]) + 0.15 * s[2], s[1]);
        d.rotation.set(0, rng() * 6.28, 0);
        d.scale.set(s[2] * 1.5, s[2] * 0.32, s[2]);
      }, [0xe0cfa4, 0xd2bd8e, 0xe8d8b2]);
    // Low rounded beach grasses instead of the old three-sided cones, which
    // read as sharp spikes sticking out of the sand (especially at the launch).
    inst(new THREE.IcosahedronGeometry(0.32, 0),
      getMat('seaGrass', 0x7f9b62), seaGrass, function (d, s) {
        d.position.set(s[0], CC.heightAt(s[0], s[1]) + 0.12 * s[2], s[1]);
        d.rotation.set(0, rng() * 6.28, 0);
        d.scale.set(s[2] * 1.2, s[2] * 0.26, s[2]);
      }, [0x6f8f54, 0x93a86c, 0xb0a86a]);
    inst(new THREE.IcosahedronGeometry(0.35, 0),
      getMat('beachWeed', 0x6d844f), weeds, function (d, s) {
        d.position.set(s[0], CC.heightAt(s[0], s[1]) + 0.25 * s[2], s[1]);
        d.rotation.set(0, rng() * 6.28, 0);
        d.scale.set(s[2], s[2] * 0.5, s[2]);
      });
    Details.dunes = dunes.length;
    Details.seaGrass = seaGrass.length + weeds.length;
  }

  function buildDenseForest(scene) {
    const IM = CC.ImageMap;
    const forests = (IM && IM.zones && IM.zones.forest) || [];
    if (!forests.length) return;
    const pines = [], broads = [];
    const trailPaths = CC.natureTrailPaths ? CC.natureTrailPaths() : [];
    const trailSegments = [];
    const trailBuf = { pos: [], idx: [], uv: [] };
    const skipZones = treeSkipZones();
    const inSkipZone = function (x, z) {
      return skipZones.some(function (name) { return IM && IM.inZone && IM.inZone(x, z, name); });
    };

    trailPaths.forEach(function (runs) {
      runs.forEach(function (path) {
        let along = 0;
        for (let i = 0; i < path.length - 1; i++) {
          const a = path[i], b = path[i + 1];
          const dx = b.x - a.x, dz = b.z - a.z;
          const len = Math.hypot(dx, dz) || 1;
          const mx = (a.x + b.x) * 0.5, mz = (a.z + b.z) * 0.5;
          trailSegments.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z });
          if (inSkipZone(mx, mz) || CC.roadClearance(mx, mz, 2.1) < 1.5) {
            along += len; continue;
          }
          const nx = -dz / len * 2.1, nz = dx / len * 2.1;
          const pts = [
            [a.x + nx, a.z + nz], [a.x - nx, a.z - nz],
            [b.x - nx, b.z - nz], [b.x + nx, b.z + nz]
          ];
          const q = pts.map(function (p) {
            return [p[0], CC.heightAt(p[0], p[1]) + 0.14, p[1]];
          });
          quadUV(trailBuf, q[0], q[1], q[2], q[3], along / 5, (along + len) / 5);
          along += len;
        }
      });
    });
    commitTrailBuffer(scene, trailBuf);

    forests.forEach(function (f, fi) {
      if (fi > 2) return; // densify up to three woods
      const cx = f.x, cz = f.z, r = f.r * 0.92;
      let placed = 0, attempts = 0;
      while (placed < 900 && attempts < 24000) {
        attempts++;
        const a = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * r;
        const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
        if (!dry(x, z) || isRoad(x, z) || inPlayZone(x, z)) continue;
        // Canopies overhang the dirt ribbon, so leave a generous green tunnel.
        if (CC.nearNatureTrail && CC.nearNatureTrail(x, z)) continue;
        if (!clearOfObstacles(x, z, 1.5)) continue;
        (rng() < 0.72 ? pines : broads).push([x, z, U.randRange(rng, 0.8, 1.5)]);
        placed++;
      }
    });

    const dummy = new THREE.Object3D();
    function inst(geo, material, spots, placeFn) {
      if (!spots.length) return;
      const mesh = new THREE.InstancedMesh(geo, material, spots.length);
      spots.forEach(function (s, i) {
        placeFn(dummy, s);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.castShadow = false; mesh.receiveShadow = true;
      scene.add(mesh);
    }
    inst(new THREE.CylinderGeometry(0.18, 0.26, 3.0, 5), getMat('extraTrunk', C.COLORS.trunk), pines,
      function (d, s) { d.position.set(s[0], CC.heightAt(s[0], s[1]) + 1.5 * s[2], s[1]); d.rotation.set(0, rng() * 6.28, 0); d.scale.setScalar(s[2]); });
    inst(new THREE.ConeGeometry(1.9, 5.4, 6), getMat('extraPine', C.COLORS.pine), pines,
      function (d, s) { d.position.set(s[0], CC.heightAt(s[0], s[1]) + 4.8 * s[2], s[1]); d.rotation.set(0, rng() * 6.28, 0); d.scale.setScalar(s[2]); });
    inst(new THREE.CylinderGeometry(0.22, 0.3, 3.4, 6), getMat('extraTrunk', C.COLORS.trunk), broads,
      function (d, s) { d.position.set(s[0], CC.heightAt(s[0], s[1]) + 1.7 * s[2], s[1]); d.rotation.set(0, rng() * 6.28, 0); d.scale.setScalar(s[2]); });
    inst(new THREE.IcosahedronGeometry(2.3, 0), getMat('extraBroad', 0x4e8c48), broads,
      function (d, s) { d.position.set(s[0], CC.heightAt(s[0], s[1]) + 4.6 * s[2], s[1]); d.rotation.set(0, rng() * 6.28, 0); d.scale.set(s[2], s[2] * 0.85, s[2]); });
    Details.denseTrees = pines.length + broads.length;
    Details.forestTrails = trailPaths.reduce(function (n, runs) { return n + runs.length; }, 0);
  }

  /* ---------- house detail: windows, fences, pools and gardens ---------- */
  let homeLitWindowMat = null;
  let homePorchMat = null;
  let homePorchGlowMat = null;

  function buildHomeDetails(scene) {
    const homes = CC.World.imageBuildings || [];
    if (!homes.length) return;
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    Details.safeHouses.length = 0;
    Details.deliveryAddresses.length = 0;
    Details.homeBoatTrailers = 0;
    Details.homeCampers = 0;
    function inAnyServiceZone(x, z) {
      return CC.serviceZoneNames().some(function (name) {
        return CC.ImageMap.inZone(x, z, name);
      });
    }
    const winXf = [], frameXf = [], doorXf = [], postXf = [], railXf = [], flowerXf = [];
    const winDarkXf = [], winLitXf = [], porchXf = [];
    // Parked driveway props are instanced so a whole neighbourhood of campers
    // and boat trailers still costs only a handful of draw calls.
    const camperBodyXf = [], camperRoofXf = [], camperCabXf = [], camperGlassXf = [];
    const camperWheelXf = [], boatHullXf = [], boatCabinXf = [], boatBeamXf = [], boatWheelXf = [];
    const flowerColors = [];
    const bloomPalette = [0xffd166, 0xff8fa3, 0xf3f0e6, 0xb69cff, 0xff9f45, 0xf25f5c];
    const mailPostXf = [], mailBoxXf = [], mailFlagXf = [];
    const salePostXf = [], saleBoardXf = [], saleCandidates = [];
    const mailBuf = { pos: [], uv: [], idx: [] };
    const frontPropSpots = [];
    const surnames = [
      'Bailey', 'Brooks', 'Carter', 'Chen', 'Collins', 'Diaz', 'Ellis', 'Foster',
      'Garcia', 'Harris', 'Hayes', 'Ibrahim', 'Jensen', 'Kowalski', 'Lopez', 'Morgan',
      'Nguyen', 'Ortiz', 'Patel', 'Quinn', 'Rivera', 'Sanders', 'Singh', 'Turner',
      'Vasquez', 'Walker', 'Yates', 'Zhang'
    ];
    // One small atlas holds every household label, so 130 mailboxes cost one
    // canvas texture and one merged label draw call instead of 130 signs.
    const MAIL_CELL_W = 128, MAIL_CELL_H = 64, MAIL_COLS = 16, MAIL_ROWS = 16;
    const mailCanvas = document.createElement('canvas');
    mailCanvas.width = MAIL_CELL_W * MAIL_COLS;
    mailCanvas.height = MAIL_CELL_H * MAIL_ROWS;
    const mailCtx = mailCanvas.getContext('2d');
    const mailCells = {};
    let mailSlot = 0;

    function mailboxCell(number, names) {
      const key = number + '|' + names.join('|');
      if (mailCells[key]) return mailCells[key];
      if (mailSlot >= MAIL_COLS * MAIL_ROWS) return null;
      const col = mailSlot % MAIL_COLS, row = Math.floor(mailSlot / MAIL_COLS);
      const x = col * MAIL_CELL_W, y = row * MAIL_CELL_H;
      mailCtx.fillStyle = '#204a6e';
      mailCtx.fillRect(x + 2, y + 2, MAIL_CELL_W - 4, MAIL_CELL_H - 4);
      mailCtx.strokeStyle = '#ece7d5';
      mailCtx.lineWidth = 3;
      mailCtx.strokeRect(x + 5, y + 5, MAIL_CELL_W - 10, MAIL_CELL_H - 10);
      mailCtx.textAlign = 'center';
      mailCtx.textBaseline = 'middle';
      mailCtx.fillStyle = '#ffffff';
      fitFont(mailCtx, String(number), MAIL_CELL_W - 20, 30);
      mailCtx.fillText(String(number), x + MAIL_CELL_W / 2, y + 21, MAIL_CELL_W - 20);
      const line = names.join(' & ');
      fitFont(mailCtx, line, MAIL_CELL_W - 14, 17, 'Arial', 'normal');
      mailCtx.fillText(line, x + MAIL_CELL_W / 2, y + 46, MAIL_CELL_W - 14);
      mailSlot++;
      return {
        u0: col / MAIL_COLS, u1: (col + 1) / MAIL_COLS,
        v0: 1 - (row + 1) / MAIL_ROWS, v1: 1 - row / MAIL_ROWS
      };
    }

    // Backyard features must stay clear of roads, other homes, trees and the
    // community sites. Sample the whole footprint, not just its centre.
    function yardSpotClear(x, z, halfX, halfZ, home) {
      const corners = [[0, 0], [-halfX, -halfZ], [halfX, -halfZ], [-halfX, halfZ], [halfX, halfZ]];
      for (let i = 0; i < corners.length; i++) {
        const px = x + corners[i][0], pz = z + corners[i][1];
        if (!dry(px, pz) || isRoad(px, pz) || inPlayZone(px, pz)) return false;
        if (CC.roadClearance && CC.roadClearance(px, pz, 1.2) < 1.2) return false;
        if (CC.nearNatureTrail && CC.nearNatureTrail(px, pz, Math.max(halfX, halfZ) + 1)) return false;
        const obstacles = CC.World.obstacles || [];
        for (let k = 0; k < obstacles.length; k++) {
          const o = obstacles[k];
          if (o === home || (Math.abs(o.x - home.x) < 0.01 && Math.abs(o.z - home.z) < 0.01)) continue;
          if (U.distance2D(px, pz, o.x, o.z) < o.r + 0.8) return false;
        }
      }
      return true;
    }

    function backyardCenter(b, sx, sz, alongX, gap, halfDepth, lateral) {
      const depth = (alongX ? b.l : b.w) * 0.5 + gap + halfDepth;
      const lx = alongX ? lateral : 0, lz = alongX ? 0 : lateral;
      return { x: b.x - sx * depth + lx, z: b.z - sz * depth + lz };
    }

    // A parked boat/camper is long and low. Check all four rotated corners so
    // it cannot poke into a road, a neighbour's tree or a fenced pool.
    function parkingSpotClear(cx, cz, yaw, halfLength, halfWidth, home) {
      const ax = Math.cos(yaw), az = -Math.sin(yaw);
      const bx = Math.sin(yaw), bz = Math.cos(yaw);
      for (let sideA = -1; sideA <= 1; sideA += 2) {
        for (let sideB = -1; sideB <= 1; sideB += 2) {
          const px = cx + sideA * halfLength * ax + sideB * halfWidth * bx;
          const pz = cz + sideA * halfLength * az + sideB * halfWidth * bz;
          if (!dry(px, pz) || isRoad(px, pz) || inPlayZone(px, pz)) return false;
          if (CC.roadClearance && CC.roadClearance(px, pz, 1.2) < 1.2) return false;
          if (CC.nearNatureTrail && CC.nearNatureTrail(px, pz, 3.2)) return false;
          const obstacles = CC.World.obstacles || [];
          for (let k = 0; k < obstacles.length; k++) {
            const o = obstacles[k];
            if (o === home || (Math.abs(o.x - home.x) < 0.01 && Math.abs(o.z - home.z) < 0.01)) continue;
            if (U.distance2D(px, pz, o.x, o.z) < o.r + 0.7) return false;
          }
        }
      }
      return true;
    }

    function parkedPoint(cx, cy, cz, yaw, localX, localZ, localY) {
      const c = Math.cos(yaw), s = Math.sin(yaw);
      return {
        x: cx + localX * c + localZ * s,
        y: cy + (localY || 0),
        z: cz - localX * s + localZ * c,
        ry: yaw
      };
    }

    function addCamper(cx, baseY, cz, yaw) {
      const L = 6.2, W = 2.35;
      camperBodyXf.push(parkedPoint(cx, baseY, cz, yaw, 0, 0, 1.55));
      camperRoofXf.push(parkedPoint(cx, baseY, cz, yaw, 0, 0, 2.86));
      camperCabXf.push(parkedPoint(cx, baseY, cz, yaw, L * 0.5 - 0.65, 0, 1.1));
      [-1.9, 0.1, 2.0].forEach(function (lx) {
        [-1, 1].forEach(function (side) {
          camperGlassXf.push(parkedPoint(cx, baseY, cz, yaw, lx, side * (W * 0.5 + 0.045), 1.95));
        });
      });
      [-2.05, 2.1].forEach(function (lx) {
        [-1, 1].forEach(function (side) {
          camperWheelXf.push(parkedPoint(cx, baseY, cz, yaw, lx, side * (W * 0.5 - 0.05), 0.43));
        });
      });
      frontPropSpots.push({ x: cx, z: cz });
      Details.homeCampers++;
    }

    function addBoatTrailer(cx, baseY, cz, yaw) {
      boatHullXf.push(parkedPoint(cx, baseY, cz, yaw, 0, 0, 0.78));
      boatCabinXf.push(parkedPoint(cx, baseY, cz, yaw, -0.45, 0, 1.34));
      [-1, 1].forEach(function (side) {
        boatBeamXf.push(parkedPoint(cx, baseY, cz, yaw, 0, side * 0.72, 0.34));
      });
      [0.35, -2.1].forEach(function (lx) {
        [-1, 1].forEach(function (side) {
          boatWheelXf.push(parkedPoint(cx, baseY, cz, yaw, lx, side * 0.82, 0.42));
        });
      });
      frontPropSpots.push({ x: cx, z: cz });
      Details.homeBoatTrailers++;
    }

    function poolFence(g, w, d) {
      const fence = getMat('poolFence', 0xe1e7e1);
      const h = 1.5;
      const nx = Math.max(3, Math.round(w / 1.7)), nz = Math.max(3, Math.round(d / 1.7));
      for (let i = 0; i <= nx; i++) {
        const x = -w * 0.5 + w * i / nx;
        [-d * 0.5, d * 0.5].forEach(function (z) { g.add(box(0.09, h, 0.09, fence, x, h * 0.5, z)); });
      }
      for (let i = 1; i < nz; i++) {
        const z = -d * 0.5 + d * i / nz;
        [-w * 0.5, w * 0.5].forEach(function (x) { g.add(box(0.09, h, 0.09, fence, x, h * 0.5, z)); });
      }
      [h * 0.42, h - 0.1].forEach(function (y) {
        g.add(box(w, 0.07, 0.07, fence, 0, y, -d * 0.5));
        g.add(box(w, 0.07, 0.07, fence, 0, y, d * 0.5));
        g.add(box(0.07, 0.07, d, fence, -w * 0.5, y, 0));
        g.add(box(0.07, 0.07, d, fence, w * 0.5, y, 0));
      });
    }

    function makePool(b, cx, cz, yaw, baseY, w, d) {
      const g = new THREE.Group();
      g.position.set(cx, baseY + 0.03, cz);
      g.rotation.y = yaw;
      scene.add(g);
      g.add(box(w + 0.8, 0.18, d + 0.8, getMat('poolCoping', 0xe6e1d2), 0, 0.09, 0));
      g.add(box(w, 0.24, d, getMat('poolLiner', 0x277f9b), 0, 0.16, 0));
      const waterMat = new THREE.MeshStandardMaterial({
        color: 0x45bcd8, emissive: 0x0d5368, emissiveIntensity: 0.35,
        roughness: 0.18, metalness: 0.05, transparent: true, opacity: 0.92
      });
      const surface = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.35, d - 0.35), waterMat);
      surface.rotation.x = -Math.PI / 2;
      surface.position.y = 0.3;
      g.add(surface);
      const ladder = getMat('poolLadder', 0xcbd3d4);
      [-0.65, 0.65].forEach(function (x) {
        beamBetween(g, x, 0.2, d * 0.5 + 0.1, x, 1.3, d * 0.5 + 0.1, 0.055, ladder);
      });
      beamBetween(g, -0.65, 1.3, d * 0.5 + 0.1, 0.65, 1.3, d * 0.5 + 0.1, 0.055, ladder);
      poolFence(g, w + 2.2, d + 2.2);
      CC.World.obstacles.push({ x: cx, z: cz, r: Math.max(w, d) * 0.5 + 1.1, type: 'landmark' });
      Details.homePools++;
    }

    function makeGazebo(b, cx, cz, yaw, baseY) {
      const g = new THREE.Group();
      g.position.set(cx, baseY + 0.03, cz);
      g.rotation.y = yaw;
      scene.add(g);
      const wood = getMat('gazeboWood', 0xb28c61);
      const roof = getMat('gazeboRoof', 0x536d76);
      const r = 2.7;
      const deck = cylinder(3.15, 3.15, 0.18, 8, wood, 0, 0.09, 0);
      deck.rotation.y = Math.PI / 8;
      g.add(deck);
      const posts = [];
      for (let i = 0; i < 8; i++) {
        const a = Math.PI / 8 + i * Math.PI / 4;
        const px = Math.cos(a) * r, pz = Math.sin(a) * r;
        g.add(cylinder(0.11, 0.13, 2.9, 6, wood, px, 1.55, pz));
        posts.push([px, pz]);
      }
      for (let i = 0; i < 8; i++) {
        const a = posts[i], n = posts[(i + 1) % 8];
        [0.78, 2.86].forEach(function (y) {
          beamBetween(g, a[0], y, a[1], n[0], y, n[1], 0.065, wood);
        });
      }
      g.add(box(3.7, 0.16, 0.5, wood, 0, 0.72, 2.35));
      const cap = new THREE.Mesh(new THREE.ConeGeometry(3.9, 1.9, 8), roof);
      cap.position.y = 3.55;
      cap.rotation.y = Math.PI / 8;
      cap.castShadow = true;
      g.add(cap);
      g.add(cylinder(0.12, 0.12, 0.65, 6, roof, 0, 4.75, 0));
      const finial = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6),
        getMat('gazeboFinial', 0xd8c477));
      finial.position.y = 5.12;
      g.add(finial);
      CC.World.obstacles.push({ x: cx, z: cz, r: 3.2, type: 'landmark' });
      Details.homeGazebos++;
    }

    function makeGarden(b, cx, cz, yaw, baseY) {
      const g = new THREE.Group();
      g.position.set(cx, baseY + 0.03, cz);
      g.rotation.y = yaw;
      scene.add(g);
      const soil = getMat('gardenSoil', 0x5d4a38);
      const stone = getMat('gardenStone', 0xd6cfba);
      const hedge = getMat('gardenHedge', 0x3f7e49);
      const w = 6.2, d = 5.2;
      g.add(box(w, 0.12, d, soil, 0, 0.06, 0));
      g.add(box(w + 0.45, 0.3, 0.24, stone, 0, 0.2, -d * 0.5));
      g.add(box(w + 0.45, 0.3, 0.24, stone, 0, 0.2, d * 0.5));
      g.add(box(0.24, 0.3, d, stone, -w * 0.5, 0.2, 0));
      g.add(box(0.24, 0.3, d, stone, w * 0.5, 0.2, 0));
      [-1, 1].forEach(function (sx2) {
        [-1, 1].forEach(function (sz2) {
          g.add(box(1.75, 0.6, 1.25, hedge, sx2 * 1.75, 0.42, sz2 * 1.35));
          const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 1), hedge);
          ball.position.set(sx2 * 2.75, 1.1, sz2 * 1.95);
          g.add(ball);
        });
      });
      const petalMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
      for (let i = 0; i < 28; i++) {
        const a = i * 2.399;
        const rr = 0.85 + (i % 4) * 0.42;
        const bloom = new THREE.Mesh(new THREE.IcosahedronGeometry(0.17, 0), petalMat);
        bloom.position.set(Math.cos(a) * rr, 0.32, Math.sin(a) * rr * 0.8);
        if (i % 4 === 0) bloom.material = getMat('gardenBloomGold', 0xffd166);
        else if (i % 4 === 1) bloom.material = getMat('gardenBloomPink', 0xff8fa3);
        else if (i % 4 === 2) bloom.material = getMat('gardenBloomWhite', 0xf3f0e6);
        else bloom.material = getMat('gardenBloomViolet', 0xb69cff);
        g.add(bloom);
      }
      g.add(cylinder(0.16, 0.22, 0.8, 8, stone, 0, 0.45, 0));
      g.add(cylinder(0.72, 0.62, 0.18, 10, stone, 0, 0.92, 0));
      g.add(cylinder(0.58, 0.58, 0.03, 10,
        getMat('gardenBirdbathWater', 0x5fc4d5, { emissive: 0x123f4b }), 0, 1.02, 0));
      CC.World.obstacles.push({ x: cx, z: cz, r: 3.1, type: 'landmark' });
      Details.homeGardens++;
    }

    homes.forEach(function (b, i) {
      const nr = CC.nearestRoad(b.x, b.z);
      if (!nr) return;
      let fx = nr.x - b.x, fz = nr.z - b.z;
      const fl = Math.hypot(fx, fz) || 1;
      fx /= fl; fz /= fl;
      // Snap the front to a cardinal direction because baked homes are axis-aligned.
      const sx = Math.abs(fx) >= Math.abs(fz) ? Math.sign(fx) : 0;
      const sz = sx === 0 ? Math.sign(fz) : 0;
      const h = b.h || 2.8;
      const frontX = sx * b.w * 0.5, frontZ = sz * b.l * 0.5;
      const alongX = sx === 0, alongZ = sz === 0;
      const baseY = CC.heightAt(b.x, b.z);
      const homeLit = rng() < 0.46;
      let litHere = 0;

      function addWindow(p) {
        winXf.push(p);
        if (homeLit && rng() < 0.72) { winLitXf.push(p); litHere++; }
        else winDarkXf.push(p);
      }

      function facePos(off, y, out) {
        return {
          x: b.x + (alongX ? off : frontX + sx * out),
          y: baseY + y,
          z: b.z + (alongZ ? off : frontZ + sz * out),
          ry: alongX ? 0 : Math.PI / 2
        };
      }
      // Windows on the front face.
      [-b.w * 0.27, b.w * 0.27].forEach(function (off) {
        if (alongZ) { /* front is along X, use b.w offset */ }
        const p = alongX ? facePos(off * (b.l / b.w), h * 0.55, 0.09) : facePos(off, h * 0.55, 0.09);
        addWindow(p);
        const fp = alongX ? facePos(off * (b.l / b.w), h * 0.55, 0.06) : facePos(off, h * 0.55, 0.06);
        frameXf.push(fp);
      });
      // Door.
      const doorPos = facePos(0, h * 0.38, 0.1);
      doorXf.push(doorPos);

      // A few ordinary homes double as safe houses: a teal plaque and soft glow
      // mark the door. They stay ordinary houses in every other respect.
      if (Details.safeHouses.length < 6 && i % 9 === 4 &&
          !inAnyServiceZone(b.x, b.z) &&
          CC.roadClearance(b.x, b.z, Math.max(b.w, b.l) * 0.5 + 2) > 3) {
        const entry = facePos(0, 0, 2.4);
        Details.safeHouses.push({
          name: 'SAFE HOUSE ' + (Details.safeHouses.length + 1),
          x: b.x, z: b.z,
          doorX: doorPos.x, doorY: doorPos.y, doorZ: doorPos.z,
          entryX: entry.x, entryZ: entry.z,
          heading: Math.atan2(sx, sz)
        });
        const marker = new THREE.Group();
        marker.position.set(doorPos.x + Math.sin(doorPos.ry) * 0.28,
          doorPos.y + 0.82, doorPos.z + Math.cos(doorPos.ry) * 0.28);
        marker.rotation.y = doorPos.ry;
        marker.add(box(1.05, 0.48, 0.08,
          getMat('safeHousePlaque', 0x1e6a66, { emissive: 0x12514d }), 0, 0, 0));
        const glow = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6),
          new THREE.MeshBasicMaterial({
            color: 0x68ffd2, transparent: true, opacity: 0.32,
            blending: THREE.AdditiveBlending, depthWrite: false
          }));
        glow.scale.set(1.6, 0.7, 0.4);
        marker.add(glow);
        scene.add(marker);
      }
      // Additional windows on the two side walls.
      if (alongX) {
        [-1, 1].forEach(function (side) {
          addWindow({ x: b.x + side * (b.w * 0.5 + 0.09), y: baseY + h * 0.55, z: b.z, ry: Math.PI / 2 });
          frameXf.push({ x: b.x + side * (b.w * 0.5 + 0.06), y: baseY + h * 0.55, z: b.z, ry: Math.PI / 2 });
        });
      } else {
        [-1, 1].forEach(function (side) {
          addWindow({ x: b.x, y: baseY + h * 0.55, z: b.z + side * (b.l * 0.5 + 0.09), ry: 0 });
          frameXf.push({ x: b.x, y: baseY + h * 0.55, z: b.z + side * (b.l * 0.5 + 0.06), ry: 0 });
        });
      }
      // A glowing porch lamp marks the homes that have lights on.
      if (homeLit && litHere) {
        porchXf.push(facePos(b.w * 0.3, h * 0.82, 0.18));
        Details.homeLitHomes++;
      }

      // Backyard upgrades: only a subset of homes get each feature, and every
      // footprint is checked against roads, water, trees and other buildings.
      const yawFront = Math.atan2(sx, sz);
      const featureRoll = rng();
      if (featureRoll < 0.2) {
        const w = 5.2, d = 7;
        const c = backyardCenter(b, sx, sz, alongX, 2, d * 0.5, U.randRange(rng, -1.2, 1.2));
        const halfX = (alongX ? w : d) * 0.5 + 1.1;
        const halfZ = (alongX ? d : w) * 0.5 + 1.1;
        if (yardSpotClear(c.x, c.z, halfX, halfZ, b)) {
          makePool(b, c.x, c.z, yawFront, CC.heightAt(c.x, c.z), w, d);
        }
      } else if (featureRoll < 0.34) {
        const c = backyardCenter(b, sx, sz, alongX, 2.4, 3.2, U.randRange(rng, -1, 1));
        if (yardSpotClear(c.x, c.z, 3.2, 3.2, b)) {
          makeGazebo(b, c.x, c.z, yawFront, CC.heightAt(c.x, c.z));
        }
      } else if (featureRoll < 0.58) {
        const c = backyardCenter(b, sx, sz, alongX, 1.9, 2.8, U.randRange(rng, -1, 1));
        const halfX = (alongX ? 3.3 : 2.8), halfZ = (alongX ? 2.8 : 3.3);
        if (yardSpotClear(c.x, c.z, halfX, halfZ, b)) {
          makeGarden(b, c.x, c.z, yawFront, CC.heightAt(c.x, c.z));
        }
      }

      // Driveway campers and boat trailers. They are parked parallel to the
      // road inside the front yard, so the narrow depth fits ordinary lots.
      const parkedRoll = rng();
      if (parkedRoll < 0.38 && !inAnyServiceZone(b.x, b.z)) {
        const isBoat = parkedRoll < 0.19;
        const halfLength = isBoat ? 3.5 : 3.35;
        const halfWidth = isBoat ? 1.25 : 1.3;
        const frontDepth = alongX ? b.l * 0.5 : b.w * 0.5;
        const frontage = alongX ? b.w * 0.5 : b.l * 0.5;
        const frontRoom = U.clamp(CC.roadClearance(b.x, b.z, frontDepth + 2) - 3, 0, 6.5);
        if (frontRoom > 1.9 + halfWidth * 2) {
          const lateral = (rng() < 0.5 ? -1 : 1) * frontage * U.randRange(rng, 0.25, 0.52);
          const forward = frontDepth + 1.9 + halfWidth;
          const cx = b.x + sx * forward + sz * lateral;
          const cz = b.z + sz * forward - sx * lateral;
          if (parkingSpotClear(cx, cz, yawFront, halfLength, halfWidth, b)) {
            if (isBoat) addBoatTrailer(cx, baseY, cz, yawFront);
            else addCamper(cx, baseY, cz, yawFront);
          }
        }
      }

      // Fence around the front yard, never crossing the neighbouring road.
      // Fence lines are built outward from the house, so size the yard from
      // the swept footprint (house half-width + side extension), not just the
      // centre-to-centre road distance. Skip the fence entirely if there is no
      // room; a short fence poking into the shoulder is worse than no fence.
      const extent = sx ? b.w * 0.5 + 2 : b.l * 0.5 + 2;
      const yard = U.clamp(CC.roadClearance(b.x, b.z, extent) - 3, 0, 6.5);

      // A numbered family mailbox just inside the front fence. The label is a
      // merged atlas quad so every home can have its own street number and
      // 2-3 surnames without hundreds of tiny textures.
      const frontDepth = alongX ? b.l * 0.5 : b.w * 0.5;
      const frontage = alongX ? b.w * 0.5 : b.l * 0.5;
      const sideX = sz, sideZ = -sx;
      const out = U.clamp(yard - 1, 0.7, 3.2);
      const lateral = U.randRange(rng, -Math.min(frontage * 0.5, 3.4), Math.min(frontage * 0.5, 3.4));
      const mx = b.x + sx * (frontDepth + out) + sideX * lateral;
      const mz = b.z + sz * (frontDepth + out) + sideZ * lateral;
      let mailboxClear = dry(mx, mz) && !isRoad(mx, mz) && !inPlayZone(mx, mz) &&
        CC.roadClearance(mx, mz, 0.5) > 0.8;
      if (mailboxClear) {
        const obstacles = CC.World.obstacles || [];
        for (let k = 0; k < obstacles.length; k++) {
          const o = obstacles[k];
          if (Math.abs(o.x - b.x) < 0.01 && Math.abs(o.z - b.z) < 0.01) continue;
          if (U.distance2D(mx, mz, o.x, o.z) < o.r + 0.5) { mailboxClear = false; break; }
        }
      }
      if (mailboxClear) {
        for (let k = 0; k < frontPropSpots.length; k++) {
          if (U.distance2D(mx, mz, frontPropSpots[k].x, frontPropSpots[k].z) < 3.2) {
            mailboxClear = false; break;
          }
        }
      }
      if (mailboxClear) {
        const yawMail = Math.atan2(sx, sz);
        mailPostXf.push({ x: mx, y: baseY + 0.68, z: mz, ry: yawMail });
        mailBoxXf.push({ x: mx, y: baseY + 1.5, z: mz, ry: yawMail });
        mailFlagXf.push(parkedPoint(mx, baseY, mz, yawMail, -0.4, 0.02, 1.66));
        const number = 100 + ((i * 37 + Math.floor(Math.abs(b.x * 3 + b.z))) % 899);
        const count = 2 + (rng() < 0.35 ? 1 : 0);
        const household = [];
        while (household.length < count) {
          const name = U.pick(rng, surnames);
          if (household.indexOf(name) < 0) household.push(name);
        }
        Details.deliveryAddresses.push({
          key: 'home-' + i,
          number: number,
          household: household.slice(),
          residentName: household[0],
          x: mx, z: mz,
          residentX: mx - sx * 1.2, residentZ: mz - sz * 1.2,
          homeX: b.x, homeZ: b.z,
          label: '#' + number + ' ' + household[0] + ' household'
        });
        const cell = mailboxCell(number, household);
        if (cell) {
          const lx = mx + sx * 0.31, lz = mz + sz * 0.31;
          const hw = 0.32, hh = 0.16, ly = baseY + 1.5;
          quadUVAtlas(mailBuf,
            [lx - sideX * hw, ly - hh, lz - sideZ * hw],
            [lx - sideX * hw, ly + hh, lz - sideZ * hw],
            [lx + sideX * hw, ly + hh, lz + sideZ * hw],
            [lx + sideX * hw, ly - hh, lz + sideZ * hw],
            cell.u0, cell.u1, cell.v0, cell.v1);
        }
      }

      // Collect safe kerbside spots for every home. The exact one-in-eight
      // selection happens after the loop so blocked frontages can be skipped
      // without shrinking the final sign count.
      if (!inAnyServiceZone(b.x, b.z)) {
        const saleOut = U.clamp(yard + 0.1, 1.1, 5.8);
        const saleSide = (lateral >= 0 ? -1 : 1) * Math.min(frontage * 0.5, 3.2);
        const px = b.x + sx * (frontDepth + saleOut) + sideX * saleSide;
        const pz = b.z + sz * (frontDepth + saleOut) + sideZ * saleSide;
        let saleClear = dry(px, pz) && !isRoad(px, pz) && !inPlayZone(px, pz) &&
          CC.roadClearance(px, pz, 0.65) > 0.7;
        if (saleClear) {
          const obstacles = CC.World.obstacles || [];
          for (let k = 0; k < obstacles.length; k++) {
            const o = obstacles[k];
            if (Math.abs(o.x - b.x) < 0.01 && Math.abs(o.z - b.z) < 0.01) continue;
            if (U.distance2D(px, pz, o.x, o.z) < o.r + 0.5) { saleClear = false; break; }
          }
        }
        if (saleClear) {
          saleCandidates.push({
            index: i, x: px, y: baseY, z: pz,
            ry: Math.atan2(sx, sz)
          });
        }
      }

      if (yard < 0.8) return;
      const fx0 = b.x + sx * (b.w * 0.5 + yard);
      const fz0 = b.z + sz * (b.l * 0.5 + yard);
      function addFenceLine(ax, az, bx2, bz2) {
        const len = Math.hypot(bx2 - ax, bz2 - az);
        const steps = Math.max(2, Math.ceil(len / 1.5));
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          if (CC.roadClearance(U.lerp(ax, bx2, t), U.lerp(az, bz2, t), 0.05) < 0) return;
        }
        const yaw = Math.atan2(-(bz2 - az), bx2 - ax);
        const count = Math.max(2, Math.floor(len / 2.2));
        for (let i = 0; i <= count; i++) {
          const t = i / count;
          postXf.push({ x: U.lerp(ax, bx2, t), y: baseY + 0.7, z: U.lerp(az, bz2, t), ry: yaw });
        }
        railXf.push({ x: (ax + bx2) / 2, y: baseY + 0.95, z: (az + bz2) / 2, ry: yaw, len: len });
        railXf.push({ x: (ax + bx2) / 2, y: baseY + 0.42, z: (az + bz2) / 2, ry: yaw, len: len });
      }
      if (alongX) {
        const half = b.w * 0.5 + 2;
        addFenceLine(b.x - half, fz0, b.x + half, fz0);
        addFenceLine(b.x - half, b.z - b.l * 0.5, b.x - half, fz0);
        addFenceLine(b.x + half, b.z - b.l * 0.5, b.x + half, fz0);
      } else {
        const half = b.l * 0.5 + 2;
        addFenceLine(fx0, b.z - half, fx0, b.z + half);
        addFenceLine(b.x - b.w * 0.5, b.z - half, fx0, b.z - half);
        addFenceLine(b.x - b.w * 0.5, b.z + half, fx0, b.z + half);
      }

      // Flower garden beds in front of the windows.
      const bedCount = 8 + Math.floor(rng() * 8);
      for (let i = 0; i < bedCount; i++) {
        const off = U.randRange(rng, -b.w * 0.42, b.w * 0.42);
        const out = U.randRange(rng, 1.4, 4.2);
        const px = alongX ? b.x + off : b.x + sx * (b.l * 0.5 + out);
        const pz = alongX ? b.z + sz * (b.l * 0.5 + out) : b.z + off;
        flowerXf.push({ x: px, y: baseY + 0.34, z: pz, ry: rng() * 6.28 });
        flowerColors.push(bloomPalette[Math.floor(rng() * bloomPalette.length)]);
      }
    });

    // Pick every eighth home from the safe candidates, spreading the signs
    // evenly across the neighbourhood instead of clustering them by index.
    const saleTarget = Math.floor(homes.length / 8);
    if (saleCandidates.length && saleTarget > 0) {
      const usedSale = new Set();
      for (let k = 0; k < saleTarget; k++) {
        const start = Math.min(saleCandidates.length - 1,
          Math.floor((k + 0.5) * saleCandidates.length / saleTarget));
        for (let j = 0; j < saleCandidates.length; j++) {
          const c = saleCandidates[(start + j) % saleCandidates.length];
          if (usedSale.has(c.index)) continue;
          let free = true;
          for (let m = 0; m < frontPropSpots.length; m++) {
            if (U.distance2D(c.x, c.z, frontPropSpots[m].x, frontPropSpots[m].z) < 2.6) {
              free = false; break;
            }
          }
          if (!free) continue;
          usedSale.add(c.index);
          frontPropSpots.push({ x: c.x, z: c.z });
          salePostXf.push({ x: c.x, y: c.y + 0.85, z: c.z, ry: c.ry });
          saleBoardXf.push({ x: c.x, y: c.y + 1.75, z: c.z, ry: c.ry });
          break;
        }
      }
    }

    function place(entries, geo, material, setter) {
      if (!entries.length) return;
      const mesh = new THREE.InstancedMesh(geo, material, entries.length);
      entries.forEach(function (e, i) {
        dummy.position.set(e.x, e.y, e.z);
        dummy.rotation.set(0, e.ry || 0, 0);
        dummy.scale.set(1, 1, 1);
        if (setter) setter(dummy, e);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.castShadow = false; mesh.receiveShadow = true;
      scene.add(mesh);
      return mesh;
    }
    const frameMat = getMat('homeFrame', 0xf2efe4);
    const darkGlassMat = new THREE.MeshStandardMaterial({
      color: 0x9dc6d8, emissive: 0x1b3540, emissiveIntensity: 0.25,
      metalness: 0.3, roughness: 0.2
    });
    homeLitWindowMat = new THREE.MeshStandardMaterial({
      color: 0xffe6a8, emissive: 0xffc466, emissiveIntensity: 0.08,
      metalness: 0.15, roughness: 0.35
    });
    homePorchMat = new THREE.MeshStandardMaterial({
      color: 0xffdf9e, emissive: 0xffc46a, emissiveIntensity: 0.08, flatShading: true
    });
    homePorchGlowMat = new THREE.MeshBasicMaterial({
      color: 0xffd28a, transparent: true, opacity: 0.02,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    const windowGeo = new THREE.BoxGeometry(1.6, 1.2, 0.13);
    place(frameXf, new THREE.BoxGeometry(1.95, 1.55, 0.1), frameMat);
    place(winDarkXf, windowGeo, darkGlassMat);
    place(winLitXf, windowGeo, homeLitWindowMat);
    place(doorXf, new THREE.BoxGeometry(1.3, 2.25, 0.14), getMat('homeDoor', 0x6b4a33));
    if (porchXf.length) {
      place(porchXf, new THREE.SphereGeometry(0.22, 8, 6), homePorchMat);
      place(porchXf, new THREE.SphereGeometry(0.72, 8, 6), homePorchGlowMat);
      Details.homePorchLights = porchXf.length;
    }

    // Mailbox posts, boxes and flags are instanced; the labels are one merged
    // geometry sampling the atlas painted while the homes were iterated.
    place(mailPostXf, new THREE.BoxGeometry(0.13, 1.35, 0.13),
      getMat('mailboxPost', 0x6d5138));
    place(mailBoxXf, new THREE.BoxGeometry(0.72, 0.44, 0.6),
      getMat('mailboxBody', 0x547187));
    place(mailFlagXf, new THREE.BoxGeometry(0.08, 0.3, 0.08),
      getMat('mailboxFlag', 0xd8443d));
    if (mailBuf.pos.length) {
      const labelGeo = new THREE.BufferGeometry();
      labelGeo.setAttribute('position', new THREE.Float32BufferAttribute(mailBuf.pos, 3));
      labelGeo.setAttribute('uv', new THREE.Float32BufferAttribute(mailBuf.uv, 2));
      labelGeo.setIndex(mailBuf.idx);
      labelGeo.computeVertexNormals();
      const labelTex = new THREE.CanvasTexture(mailCanvas);
      if (THREE.SRGBColorSpace) labelTex.colorSpace = THREE.SRGBColorSpace;
      labelTex.minFilter = THREE.LinearFilter;
      labelTex.magFilter = THREE.LinearFilter;
      labelTex.generateMipmaps = false;
      const labelMesh = new THREE.Mesh(labelGeo, new THREE.MeshLambertMaterial({
        map: labelTex, side: THREE.DoubleSide
      }));
      labelMesh.castShadow = false; labelMesh.receiveShadow = false;
      scene.add(labelMesh);
    }
    Details.mailboxes = mailPostXf.length;
    Details.mailboxLabels = mailSlot;

    place(salePostXf, new THREE.BoxGeometry(0.1, 1.7, 0.1),
      getMat('saleSignPost', 0x2a2d2f));
    place(saleBoardXf, new THREE.PlaneGeometry(1.7, 0.95),
      harberSignMaterial('sale'));
    Details.forSaleSigns = saleBoardXf.length;

    place(postXf, new THREE.BoxGeometry(0.14, 1.4, 0.14), getMat('homeFence', 0xd8d5c8));
    place(railXf, new THREE.BoxGeometry(1, 0.12, 0.1), getMat('homeFence', 0xd8d5c8), function (d, e) {
      d.scale.set(e.len, 1, 1);
    });
    const flowerMesh = place(flowerXf, new THREE.IcosahedronGeometry(0.22, 0),
      new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }));
    if (flowerMesh) {
      flowerColors.forEach(function (c, i) { col.setHex(c); flowerMesh.setColorAt(i, col); });
    }

    // Parked camper bodies and windows.
    const camperPalette = [0xd9d4c4, 0xe8e2d0, 0xb7c5c8, 0xd6c4a3];
    const camperBodyGeo = new THREE.BoxGeometry(6.2, 2.5, 2.35);
    const camperMesh = place(camperBodyXf, camperBodyGeo,
      getMat('camperBody', 0xd9d4c4));
    if (camperMesh) {
      camperBodyXf.forEach(function (e, i) {
        col.setHex(camperPalette[i % camperPalette.length]);
        camperMesh.setColorAt(i, col);
      });
      if (camperMesh.instanceColor) camperMesh.instanceColor.needsUpdate = true;
    }
    place(camperRoofXf, new THREE.BoxGeometry(6.45, 0.22, 2.55),
      getMat('camperRoof', 0x9aa5a5));
    place(camperCabXf, new THREE.BoxGeometry(1.6, 1.7, 2.2),
      getMat('camperCab', 0xb6bebb));
    place(camperGlassXf, new THREE.BoxGeometry(1.0, 0.62, 0.07),
      new THREE.MeshStandardMaterial({
        color: 0x8ab8c9, emissive: 0x19323c, metalness: 0.28, roughness: 0.24
      }));
    const tyreGeo = new THREE.CylinderGeometry(0.43, 0.43, 0.2, 10);
    tyreGeo.rotateX(Math.PI / 2);
    place(camperWheelXf, tyreGeo, getMat('camperTyre', 0x2a2d2f));

    // Tapered hull, trailer rails and wheels for the boats on trailers.
    const hullGeo = new THREE.CylinderGeometry(0.14, 1.0, 6.5, 6);
    hullGeo.rotateZ(Math.PI / 2);
    hullGeo.scale(1, 0.52, 1.0);
    place(boatHullXf, hullGeo, getMat('trailerBoatHull', 0xe9e6d7));
    place(boatCabinXf, new THREE.BoxGeometry(1.7, 0.8, 1.35),
      getMat('trailerBoatCabin', 0xb9d3d8));
    place(boatBeamXf, new THREE.BoxGeometry(7.3, 0.13, 0.13),
      getMat('boatTrailerSteel', 0x72797c));
    const trailerTyreGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.16, 10);
    trailerTyreGeo.rotateX(Math.PI / 2);
    place(boatWheelXf, trailerTyreGeo, getMat('boatTrailerTyre', 0x222628));

    Details.homeWindows = winXf.length;
    Details.homeLitWindows = winLitXf.length;
    Details.homeFences = postXf.length;
    Details.homeFlowers = flowerXf.length;
  }

  /* ---------- cell phone tower ---------- */
  let towerBeacon = null;

  function beam(a, b, radius, material) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const len = Math.hypot(dx, dy, dz) || 0.001;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 5), material);
    m.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(dx / len, dy / len, dz / len));
    m.castShadow = true;
    return m;
  }

  function buildCellTower(scene) {
    const x = 345, z = 120;
    const baseY = CC.heightAt(x, z);
    const g = new THREE.Group();
    const steel = getMat('towerSteel', 0xa8b0b3);
    const dark = getMat('towerDark', 0x646d71);
    const panelMat = getMat('towerPanel', 0xd8dcd6);
    const levels = 8, segH = 9, topW = 1.4, bottomW = 7;

    function corners(w, y) {
      return [[-w/2,y,-w/2],[-w/2,y,w/2],[w/2,y,-w/2],[w/2,y,w/2]];
    }
    for (let i = 0; i < levels; i++) {
      const y0 = i * segH, y1 = (i + 1) * segH;
      const w0 = bottomW + (topW - bottomW) * (i / levels);
      const w1 = bottomW + (topW - bottomW) * ((i + 1) / levels);
      const c0 = corners(w0, y0), c1 = corners(w1, y1);
      // Legs.
      for (let k = 0; k < 4; k++) g.add(beam(c0[k], c1[k], 0.18, steel));
      // Horizontal rings and X braces on each face.
      for (let k = 0; k < 4; k++) {
        const k2 = (k + 1) % 4;
        g.add(beam(c1[k], c1[k2], 0.09, dark));
        g.add(beam(c0[k], c1[k2], 0.07, dark));
        g.add(beam(c0[k2], c1[k], 0.07, dark));
      }
    }
    // Antenna arrays on three sides at three heights.
    [0.42, 0.62, 0.82].forEach(function (frac) {
      const y = frac * levels * segH;
      const w = bottomW + (topW - bottomW) * frac;
      for (let side = 0; side < 3; side++) {
        const a = side * Math.PI * 2 / 3;
        const px = Math.cos(a) * (w * 0.5 + 0.7), pz = Math.sin(a) * (w * 0.5 + 0.7);
        const panel = box(2.6, 1.9, 0.35, panelMat, px, y, pz);
        panel.rotation.y = -a + Math.PI / 2;
        g.add(panel);
      }
    });
    // Top beacon.
    towerBeacon = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0x8b1a12, emissive: 0xff2a14, emissiveIntensity: 0.2 }));
    towerBeacon.position.y = levels * segH + 1.2;
    g.add(towerBeacon);
    g.add(beam([0, levels * segH, 0], [0, levels * segH + 1.2, 0], 0.12, dark));

    // Fenced compound and equipment shed.
    const fenceMat = getMat('towerFence', 0x8d9496);
    for (let dx = -11; dx <= 11; dx += 2.2) {
      [-11, 11].forEach(function (dz) {
        g.add(cylinder(0.07, 0.07, 2.6, 4, fenceMat, dx, 1.3, dz));
        g.add(cylinder(0.07, 0.07, 2.6, 4, fenceMat, dz, 1.3, dx));
      });
    }
    [-11, 11].forEach(function (d) {
      g.add(box(22, 0.06, 0.06, fenceMat, 0, 2.5, d));
      g.add(box(0.06, 0.06, 22, fenceMat, d, 2.5, 0));
    });
    const shed = box(5, 3, 4, getMat('towerShed', 0x9fa39b), 8, 1.5, 8);
    g.add(shed);
    g.add(box(5.4, 0.3, 4.4, getMat('towerShedRoof', 0x6d746e), 8, 3.15, 8));

    g.position.set(x, baseY, z);
    scene.add(g);
    Details.cellTowers = (Details.cellTowers || 0) + 1;
  }

  // Two large parabolic dishes share a fenced pad immediately west of the
  // cell tower, so they read as part of the same communications site.
  function satelliteDish(g, x, z, rimY, radius, yaw, tilt) {
    const steel = getMat('satDishSteel', 0x929a9d);
    const shell = getMat('satDishShell', 0xe7e9e3, { side: THREE.DoubleSide });
    const rimMat = getMat('satDishRim', 0xa8b0b2);
    const feedMat = getMat('satDishFeed', 0x596166);
    const capStart = Math.PI * 0.62;
    const rimRadius = Math.sin(capStart) * radius;
    const bowlDrop = Math.cos(capStart) * radius;

    g.add(cylinder(1.25, 1.55, 0.55, 12, getMat('satDishBase', 0xa6aaa5), x, 0.28, z));
    beamBetween(g, x, 0.4, z, x, rimY - 0.25, z, 0.42, steel);
    // Diagonal braces keep the tall pedestal from looking like a bare pole.
    [-1, 1].forEach(function (s) {
      beamBetween(g, x, 1.1, z, x, rimY - 1.5, z + s * 1.7, 0.13, steel);
    });

    const mount = new THREE.Group();
    mount.position.set(x, rimY, z);
    mount.rotation.y = yaw;
    g.add(mount);
    const face = new THREE.Group();
    face.rotation.x = tilt;
    mount.add(face);

    const bowl = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 22, 10, 0, Math.PI * 2, capStart, Math.PI - capStart),
      shell
    );
    bowl.position.y = -bowlDrop;
    bowl.castShadow = true; bowl.receiveShadow = true;
    face.add(bowl);

    const rim = new THREE.Mesh(new THREE.TorusGeometry(rimRadius, 0.16, 6, 28), rimMat);
    rim.rotation.x = -Math.PI / 2;
    face.add(rim);

    const feedY = radius * 0.62;
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.38, 1.1, 10), feedMat);
    horn.rotation.x = Math.PI;
    horn.position.y = feedY;
    face.add(horn);
    for (let i = 0; i < 3; i++) {
      const a = i * Math.PI * 2 / 3 + 0.35;
      beamBetween(face,
        Math.cos(a) * rimRadius * 0.82, -0.1, Math.sin(a) * rimRadius * 0.82,
        0, feedY - 0.45, 0, 0.08, steel);
    }
    return face;
  }

  function buildSatelliteDishes() {
    const site = serviceSite('satellite');
    if (!site) return;
    const g = site.g, q = site.q;
    servicePad(g, q.w - 2, q.h - 4, 0xa1a59f, 0.06);
    serviceFence(g, q.w - 2, q.h - 4, 3);
    satelliteDish(g, 0, -10, 5.2, 5.6, 0.35, 0.16);
    satelliteDish(g, 0, 10, 4.6, 4.8, Math.PI + 0.45, 0.22);

    const cabinet = getMat('satCabinet', 0x9fa6a3);
    g.add(box(4.8, 3.2, 4.4, cabinet, 6, 1.6, 0));
    g.add(box(5.2, 0.35, 4.8, getMat('satCabinetRoof', 0x6d7475), 6, 3.35, 0));
    [-1.4, 0, 1.4].forEach(function (oz) {
      g.add(box(0.16, 1.5, 0.55, getMat('satVent', 0x60686b), 8.48, 1.8, oz));
    });
    servicePylon(g, 'SATELLITE LINK', 0, 17.5, 0x3b5668, 0xffe08a, 8);
    serviceObstacle(site, 0, -10, 5.4);
    serviceObstacle(site, 0, 10, 4.6);
    serviceObstacle(site, 6, 0, 2.7);
    Details.satelliteSite = true;
    Details.satelliteDishes = 2;
    serviceDone(site);
  }

  /* ---------- scenery ---------- */
  function clearOfObstacles(x, z, r) {
    for (let i = 0; i < CC.World.obstacles.length; i++) {
      const o = CC.World.obstacles[i];
      const min = r + o.r;
      if ((x - o.x) * (x - o.x) + (z - o.z) * (z - o.z) < min * min) return false;
    }
    return true;
  }

  function buildExtraVegetation(scene) {
    const IM = CC.ImageMap;
    const W = C.WORLD;
    const pines = [], broads = [], bushes = [];
    let attempts = 0;
    while (pines.length + broads.length < 1500 && attempts < 60000) {
      attempts++;
      const x = U.randRange(rng, W.minX + 10, W.maxX - 10);
      const z = U.randRange(rng, W.minZ + 10, W.maxZ - 10);
      if (!dry(x, z) || !isGreen(x, z) || isRoad(x, z) || inPlayZone(x, z)) continue;
      if (CC.nearNatureTrail && CC.nearNatureTrail(x, z)) continue;
      if (!clearOfObstacles(x, z, 2.6)) continue;
      (rng() < 0.62 ? pines : broads).push([x, z, U.randRange(rng, 0.75, 1.35)]);
    }
    attempts = 0;
    while (bushes.length < 2400 && attempts < 50000) {
      attempts++;
      const x = U.randRange(rng, W.minX + 8, W.maxX - 8);
      const z = U.randRange(rng, W.minZ + 8, W.maxZ - 8);
      if (inPlayZone(x, z)) continue;
      if (CC.nearNatureTrail && CC.nearNatureTrail(x, z, 4.8)) continue;
      if (!clearOfObstacles(x, z, 0.5)) continue;
      if (!dry(x, z) || !isGreen(x, z) || isRoad(x, z)) {
        if (!dry(x, z) || (CC.World.imageMode && IM && IM.classify(x, z) !== CLS.SAND)) continue;
      }
      bushes.push([x, z, U.randRange(rng, 0.55, 1.5)]);
    }

    function instanced(geo, material, spots, place) {
      return tiledInstances(scene, geo, material, spots, place, null, false);
    }
    const trunkMat = getMat('extraTrunk', C.COLORS.trunk);
    const pineMat = getMat('extraPine', C.COLORS.pine);
    const broadMat = getMat('extraBroad', 0x5d9a52);

    instanced(new THREE.CylinderGeometry(0.16, 0.23, 2.7, 5), trunkMat, pines, function (d, s) {
      d.position.set(s[0], CC.heightAt(s[0], s[1]) + 1.35 * s[2], s[1]);
      d.rotation.set(0, rng() * Math.PI * 2, 0);
      d.scale.setScalar(s[2]);
    });
    instanced(new THREE.ConeGeometry(1.7, 4.7, 6), pineMat, pines, function (d, s) {
      d.position.set(s[0], CC.heightAt(s[0], s[1]) + 4.2 * s[2], s[1]);
      d.rotation.set(0, rng() * Math.PI * 2, 0);
      d.scale.setScalar(s[2]);
    });
    instanced(new THREE.CylinderGeometry(0.2, 0.28, 3.2, 6), trunkMat, broads, function (d, s) {
      d.position.set(s[0], CC.heightAt(s[0], s[1]) + 1.6 * s[2], s[1]);
      d.rotation.set(0, rng() * Math.PI * 2, 0);
      d.scale.setScalar(s[2]);
    });
    instanced(new THREE.IcosahedronGeometry(2.1, 0), broadMat, broads, function (d, s) {
      d.position.set(s[0], CC.heightAt(s[0], s[1]) + 4.3 * s[2], s[1]);
      d.rotation.set(0, rng() * Math.PI * 2, 0);
      d.scale.set(s[2], s[2] * 0.85, s[2]);
    });

    const bushMesh = instanced(new THREE.IcosahedronGeometry(1, 0),
      getMat('bush', 0x4f8a49), bushes, function (d, s) {
        d.position.set(s[0], CC.heightAt(s[0], s[1]) + 0.55 * s[2], s[1]);
        d.rotation.set(0, rng() * Math.PI * 2, 0);
        d.scale.set(s[2], s[2] * 0.7, s[2]);
      });
    if (bushMesh) {
      const col = new THREE.Color();
      bushes.forEach(function (s, i) {
        col.setHSL(0.27 + rng() * 0.07, 0.34 + rng() * 0.16, 0.28 + rng() * 0.16);
        bushMesh.setColorAt(i, col);
      });
    }
    Details.extraTrees = pines.length + broads.length;
    Details.bushes = bushes.length;
  }

  // A small radial cluster of tapered blades, used as an instanced grass tuft.
  function grassTuftGeometry(blades, height, width) {
    const pos = [], idx = [];
    for (let b = 0; b < blades; b++) {
      const a = b / blades * Math.PI * 2 + 0.35;
      const dx = Math.cos(a), dz = Math.sin(a);
      const px = -dz * width * 0.5, pz = dx * width * 0.5;
      const bend = 0.22 * height;
      const o = pos.length / 3;
      pos.push(-px, 0, -pz, px, 0, pz,
        dx * bend + px * 0.2, height, dz * bend + pz * 0.2);
      idx.push(o, o + 1, o + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  function buildGroundCover(scene) {
    const W = C.WORLD;
    const grass = [], weeds = [], flowers = [];
    let attempts = 0;
    while (weeds.length < 1600 && attempts < 50000) {
      attempts++;
      const x = U.randRange(rng, W.minX + 6, W.maxX - 6);
      const z = U.randRange(rng, W.minZ + 6, W.maxZ - 6);
      if (!isGreen(x, z) || isRoad(x, z) || inPlayZone(x, z)) continue;
      weeds.push([x, z, U.randRange(rng, 0.7, 1.6)]);
    }
    attempts = 0;
    while (grass.length < 8500 && attempts < 110000) {
      attempts++;
      const x = U.randRange(rng, W.minX + 6, W.maxX - 6);
      const z = U.randRange(rng, W.minZ + 6, W.maxZ - 6);
      if (!isGreen(x, z) || isRoad(x, z) || inPlayZone(x, z)) continue;
      grass.push([x, z, U.randRange(rng, 0.5, 1.2)]);
    }
    attempts = 0;
    while (flowers.length < 1200 && attempts < 45000) {
      attempts++;
      const x = U.randRange(rng, W.minX + 6, W.maxX - 6);
      const z = U.randRange(rng, W.minZ + 6, W.maxZ - 6);
      if (!isGreen(x, z) || isRoad(x, z) || inPlayZone(x, z)) continue;
      flowers.push([x, z, U.randRange(rng, 0.7, 1.4), rng()]);
    }
    if (grass.length) {
      const grassColor = new THREE.Color();
      tiledInstances(scene, grassTuftGeometry(4, 0.3, 0.34),
        new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide, flatShading: true }),
        grass, function (d, s) {
          d.position.set(s[0], CC.heightAt(s[0], s[1]), s[1]);
          d.rotation.set(0, rng() * Math.PI * 2, rng() * 0.16 - 0.08);
          d.scale.set(s[2], s[2], s[2]);
        }, function () {
          return grassColor.setHSL(0.25 + rng() * 0.06, 0.32 + rng() * 0.18,
            0.31 + rng() * 0.15).getHex();
        }, false);
    }
    if (weeds.length) {
      tiledInstances(scene, new THREE.IcosahedronGeometry(0.34, 0), getMat('weed', 0x7b8a50),
        weeds, function (d, s) {
          d.position.set(s[0], CC.heightAt(s[0], s[1]) + 0.2 * s[2], s[1]);
          d.rotation.set(0, rng() * Math.PI * 2, 0);
          d.scale.set(s[2], s[2] * 0.55, s[2]);
        }, null, false);
    }
    if (flowers.length) {
      const palette = [0xffd166, 0xff8fa3, 0xf3f0e6, 0xb69cff, 0xff9f45];
      tiledInstances(scene, new THREE.CylinderGeometry(0.02, 0.02, 0.36, 4),
        getMat('flowerStem', 0x4f7f3f), flowers, function (d, s) {
          d.position.set(s[0], CC.heightAt(s[0], s[1]) + 0.18 * s[2], s[1]);
          d.rotation.set(0, rng() * Math.PI * 2, 0);
          d.scale.setScalar(s[2]);
        }, null, false);
      tiledInstances(scene, new THREE.IcosahedronGeometry(0.16, 0),
        new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }),
        flowers, function (d, s) {
          d.position.set(s[0], CC.heightAt(s[0], s[1]) + 0.4 * s[2], s[1]);
          d.rotation.set(0, rng() * Math.PI * 2, 0);
          d.scale.setScalar(s[2]);
        }, function (s) { return palette[Math.floor(s[3] * palette.length) % palette.length]; }, false);
    }
    Details.grassTufts = grass.length;
    Details.weeds = weeds.length;
    Details.flowers = flowers.length;
  }

  function buildHomeShrubs(scene) {
    const homes = CC.World.obstacles.filter(function (o) { return o.type === 'home'; });
    const spots = [];
    homes.forEach(function (h) {
      const count = 3 + Math.floor(rng() * 4);
      for (let i = 0; i < count; i++) {
        const a = rng() * Math.PI * 2;
        const r = h.r + U.randRange(rng, 1.4, 4.2);
        const x = h.x + Math.cos(a) * r, z = h.z + Math.sin(a) * r;
        if (!dry(x, z) || isRoad(x, z)) continue;
        if (!clearOfObstacles(x, z, 0.6)) continue;
        spots.push([x, z, U.randRange(rng, 0.55, 1.15), rng()]);
      }
    });
    if (!spots.length) return;
    const mesh = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.85, 0),
      new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), spots.length
    );
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    const greens = [0x4f8a49, 0x5f9c4e, 0x3f7a43, 0x79a75a];
    spots.forEach(function (s, i) {
      dummy.position.set(s[0], CC.heightAt(s[0], s[1]) + 0.5 * s[2], s[1]);
      dummy.rotation.set(0, rng() * Math.PI * 2, 0);
      dummy.scale.set(s[2], s[2] * 0.8, s[2]);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      col.setHex(greens[Math.floor(s[3] * greens.length) % greens.length]);
      mesh.setColorAt(i, col);
    });
    mesh.castShadow = false; mesh.receiveShadow = true;
    scene.add(mesh);
    Details.shrubs = spots.length;
  }

  function buildParkedVehicles(scene) {
    if (!CC.VehicleFactory) return;
    const buildings = (CC.World.imageBuildings && CC.World.imageBuildings.length) ?
      CC.World.imageBuildings :
      CC.World.obstacles.filter(function (o) { return o.type === 'home'; }).map(function (o) {
        return { x: o.x, z: o.z, w: o.r * 2.1, l: o.r * 2.1 };
      });
    const gravel = getMat('driveway', 0x8b8577);
    const colors = [0xd9d6c9, 0x7d9ab5, 0xc67d6a, 0x9fb08b, 0xd6b45f, 0xe8e5dc];
    const kinds = ['car', 'car', 'truck', 'coupe', 'muscleCar', 'taxi', 'limo', 'offroad', 'compact'];
    const spots = (CC.drivewayCarSpots = []);
    buildings.forEach(function (b) {
      if (rng() > 0.48) return;
      const nr = CC.nearestRoad(b.x, b.z, 'paved');
      if (!nr) return;
      const dx = nr.x - b.x, dz = nr.z - b.z;
      const d = Math.hypot(dx, dz) || 1;
      const ux = dx / d, uz = dz / d;
      // Start the driveway outside the building's actual footprint (no clipping).
      const hw = b.w * 0.5, hl = b.l * 0.5;
      const tx = Math.abs(ux) > 1e-4 ? hw / Math.abs(ux) : Infinity;
      const tz = Math.abs(uz) > 1e-4 ? hl / Math.abs(uz) : Infinity;
      const start = Math.min(tx, tz) + 0.9;
      const end = Math.min(d - nr.width * 0.5 - 1.5, start + 13);
      if (end - start < 4.5) return;
      const mid = (start + end) * 0.5;
      const cx = b.x + ux * mid, cz = b.z + uz * mid;
      if (!dry(cx, cz)) return;
      const len = end - start;
      const drive = box(3.6, 0.07, len, gravel, cx, CC.heightAt(cx, cz) + 0.05, cz);
      drive.rotation.y = Math.atan2(ux, uz);
      drive.castShadow = false;
      scene.add(drive);
      Details.driveways++;

      if (rng() < 0.82) {
        const vx = b.x + ux * (end - 2.6), vz = b.z + uz * (end - 2.6);
        if (!dry(vx, vz)) return;
        const kind = U.pick(rng, kinds);
        const color = colors[Math.floor(rng() * colors.length)];
        const heading = Math.atan2(ux, uz) + (rng() < 0.5 ? 0 : Math.PI);
        // NPCSystem turns these into real stealable ParkedCar instances after
        // the world is built, so every driveway car can be entered with E.
        spots.push({ x: vx, z: vz, h: heading, kind: kind, color: color });
        Details.parkedVehicles++;
      }
    });
  }

  /* ---------- public lifecycle ---------- */
  Details.init = function (scene) {
    const junctions = findJunctions();
    Details.junctions = junctions;
    buildRoadMarkings(scene, junctions);
    buildIntersectionFurniture(scene, junctions);
    buildDrawbridgeLights(scene);
    buildGuardRails(scene, junctions);
    buildRoadSigns(scene);
    buildTrailhead(scene);
    buildBusStops(scene);
    buildBusinesses(scene);
    buildCommunityServices(scene);
    buildStreetLamps(scene);
    buildTelephonePoles(scene);
    buildMarina(scene);
    buildCellTower(scene);
    buildAnimatedWater(scene);
    buildPonds(scene);
    buildPark(scene);
    buildFarm(scene);
    buildBoardwalk(scene);
    buildAmusementPark(scene);
    buildPier(scene);
    buildJetties(scene);
    buildDolphins(scene);
    buildGasStation(scene);
    buildFastFood(scene);
    buildBeachRecreation(scene);
    buildSeaLife(scene);
    // Home upgrades register obstacles first so later trees and shrubs are
    // kept out of the pools, gazebos and formal gardens.
    buildHomeDetails(scene);
    buildExtraVegetation(scene);
    buildGroundCover(scene);
    buildBeachPlants(scene);
    buildDenseForest(scene);
    buildHomeShrubs(scene);
    buildParkedVehicles(scene);
    Details.cleanupBridgeDebris(scene);
    Details.fencesRemoved = auditFenceClearance(scene);
    Details.polesRemoved = auditPoleClearance(scene);
  };

  Details.update = function (dt, time) {
    // The two approaches alternate green every 12 seconds, with a yellow change.
    const cycle = 12;
    const phase = (time / cycle) % 1;
    const greenAxis = phase < 0.5 ? 0 : 1;
    const local = (phase < 0.5 ? phase : phase - 0.5) / 0.5;
    const changing = local > 0.86;
    Details.signalStates[0] = greenAxis === 0 ? (changing ? 'yellow' : 'green') : 'red';
    Details.signalStates[1] = greenAxis === 1 ? (changing ? 'yellow' : 'green') : 'red';
    Details.signalStates[2] = CC.Drawbridges ? CC.Drawbridges.lightState() : 'green';
    for (let axis = 0; axis < bulbMats.length; axis++) {
      const state = Details.signalStates[axis], bulbs = bulbMats[axis];
      bulbs.red.emissiveIntensity = state === 'red' ? 2.2 : 0.05;
      bulbs.yellow.emissiveIntensity = state === 'yellow' ? 2.2 : 0.05;
      bulbs.green.emissiveIntensity = state === 'green' ? 2.0 : 0.05;
    }
    for (let i = 0; i < Details.signals.length; i++) {
      const sig = Details.signals[i];
      if (sig.drawbridge && sig.span && sig.span.bascule && CC.Drawbridges) {
        sig.state = CC.Drawbridges.lightState(sig.span);
      } else {
        sig.state = Details.signalStates[sig.axis];
      }
    }
    const player = CC.Game && CC.Game.vehicles ? CC.Game.vehicles[CC.Game.activeKey] : null;
    const px = player && player.pos ? player.pos.x : 0;
    const pz = player && player.pos ? player.pos.z : 0;
    const near = function (x, z, r) { const dx = x - px, dz = z - pz; return dx * dx + dz * dz < r * r; };
    const night = CC.Weather ? U.clamp(CC.Weather.night || 0, 0, 1) : 0;
    // No need to reassign every Walmart light every frame once it is dark;
    // only refresh when the night level actually moves a visible amount.
    if (Math.abs((Details._lastNight || -1) - night) > 0.01) {
      lampMat.emissiveIntensity = 0.08 + night * 2.1;
      lampGlowMat.opacity = 0.03 + night * 0.4;
      for (let i = 0; i < Details.walmartLights.length; i++) {
        Details.walmartLights[i].intensity = 0.05 + night * 1.35;
      }
      Details._lastNight = night;
    }
    if (homeLitWindowMat) homeLitWindowMat.emissiveIntensity = 0.08 + night * 2.6;
    if (homePorchMat) {
      homePorchMat.emissiveIntensity = (0.08 + night * 3.2) *
        (0.94 + 0.06 * Math.sin(time * 1.7));
    }
    if (homePorchGlowMat) homePorchGlowMat.opacity = 0.02 + night * 0.38;

    if (towerBeacon) {
      towerBeacon.material.emissiveIntensity = 0.25 + night * (Math.sin(time * 3.1) > 0.6 ? 4.5 : 0.2);
    }
    if (Details.airportRadar) Details.airportRadar.rotation.y += dt * 0.5;
    if (Details.outpostFlag) Details.outpostFlag.rotation.y = Math.sin(time * 2.1) * 0.12;
    if (Details.radarBeacon) {
      Details.radarBeacon.material.emissiveIntensity =
        0.3 + night * (Math.sin(time * 4.7) > 0.65 ? 4.2 : 0.2);
    }
    if (Details.controlTowerBeacon) {
      Details.controlTowerBeacon.material.emissiveIntensity =
        0.5 + night * (Math.sin(time * 3.6) > 0.7 ? 3.8 : 0.3);
    }
    if (Details.channelLights) {
      const lights = Details.channelLights;
      if (lights.red) lights.red.emissiveIntensity = 0.35 + night *
        (Math.sin(time * 2.4) > 0 ? 3.2 : 0.45);
      if (lights.green) lights.green.emissiveIntensity = 0.35 + night *
        (Math.sin(time * 2.4 + Math.PI) > 0 ? 3.2 : 0.45);
    }
    // Hold white briefly, sweep blue from one end to the other, hold, reset.
    if (Details.runwayLights.length) {
      const cycle = 8;
      const phase = (time % cycle) / cycle;
      const sweep = U.clamp((phase - 0.08) / 0.62, 0, 1);
      const reset = phase > 0.86;
      const last = Math.max(1, Details.runwayLightStations - 1);
      const litThrough = phase <= 0.08 ? -1 : Math.floor(sweep * last);
      for (let i = 0; i < Details.runwayLights.length; i++) {
        const light = Details.runwayLights[i];
        const blue = !reset && light.order <= litThrough;
        if (light.blue !== blue) {
          const color = blue ? light.blueColor : light.white;
          light.mat.color.setHex(color);
          light.mat.emissive.setHex(color);
          light.mat.emissiveIntensity = blue ? 2.8 : 0.9;
          light.blue = blue;
        }
      }
    }
    if (near(280, 320, 180)) for (let i = 0; i < Details.farmAnimals.length; i++) {
      const a = Details.farmAnimals[i];
      a.position.y = (a.userData.baseY || 0) + Math.sin(time * 1.8 + a.userData.phase) * 0.045;
      a.rotation.z = Math.sin(time * 1.3 + a.userData.phase) * 0.02;
    }
    if (Details.dogParkDogs && near(0, 0, 260)) {
      for (let i = 0; i < Details.dogParkDogs.length; i++) {
        const dog = Details.dogParkDogs[i];
        dog.group.position.y = dog.baseY + Math.sin(time * 2.1 + dog.phase) * 0.045;
        if (dog.tail) dog.tail.rotation.z = Math.sin(time * 7 + dog.phase) * 0.5;
      }
    }
    if (Details.windmillBlades && near(280, 320, 220)) Details.windmillBlades.rotation.z += dt * 0.55;

    // Colored midway bulbs chase each other around the rides, day and night.
    const nearAmusement = near(340, -300, 260);
    if (nearAmusement) for (let i = 0; i < Details.rideBulbMats.length; i++) {
      const bulb = Details.rideBulbMats[i];
      const flash = Math.max(0, Math.sin(time * 5.2 + bulb.phase));
      bulb.mat.emissiveIntensity = 0.35 + night * (0.9 + flash * 2.6) + flash * 0.8;
    }
    const club = (CC.ImageMap && CC.ImageMap.zones && CC.ImageMap.zones.nightclub) || null;
    const nearClub = club ? near(club.x, club.z, 140) : nearAmusement;
    if (nearClub) for (let i = 0; i < Details.clubNeon.length; i++) {
      const n = Details.clubNeon[i];
      const flash = Math.sin(time * (4.5 + (i % 3) * 0.8) + n.phase) > 0.1;
      const pulse = 0.6 + 0.4 * Math.max(0, Math.sin(time * 6.0 + n.phase));
      n.mat.emissiveIntensity = flash ? (1.2 + pulse * 2.2) : 0.08;
    }
    if (Details.ferrisWheel && nearAmusement) {
      Details.ferrisWheel.group.rotation.x += dt * 0.16;
      for (let i = 0; i < Details.ferrisWheel.cabins.length; i++) {
        Details.ferrisWheel.cabins[i].rotation.x = -Details.ferrisWheel.group.rotation.x;
      }
    }
    if (Details.carousel && nearAmusement) Details.carousel.rotation.y += dt * 0.35;
    if (nearAmusement) for (let i = 0; i < Details.carouselHorses.length; i++) {
      const h = Details.carouselHorses[i];
      h.group.position.y = 3 + Math.sin(time * 3.2 + h.phase) * 0.32;
      for (let j = 0; j < h.legs.length; j++) {
        h.legs[j].rotation.x = Math.sin(time * 4.4 + h.phase + j * Math.PI * 0.5) * 0.16;
      }
    }
    if (Details.coasterCurve && nearAmusement) {
      // A rider aboard makes the train run a full lap in about eighteen seconds.
      const racing = CC.Game && CC.Game.ride && CC.Game.ride.key === 'coaster';
      Details.coasterPhase = (Details.coasterPhase + dt * (racing ? 0.055 : 0.027)) % 1;
      for (let i = 0; i < Details.coasterCars.length; i++) {
        const car = Details.coasterCars[i];
        const t = (car.userData.offset + Details.coasterPhase) % 1;
        const p = Details.coasterCurve.getPointAt(t), tan = Details.coasterCurve.getTangentAt(t);
        car.position.copy(p);
        car.rotation.y = Math.atan2(tan.x, tan.z);
        car.rotation.x = -Math.asin(U.clamp(tan.y, -1, 1)) * 0.45;
      }
    }
    if (near(-220, 260, 220)) for (let i = 0; i < Details.fishingBobbers.length; i++) {
      const bob = Details.fishingBobbers[i];
      bob.position.y = (CC.RetroWater
        ? CC.RetroWater.waterYFor(bob.position.x, bob.position.z, time, 0.04) : C.SEA_LEVEL - 1.05)
        + Math.sin(time * 2.6 + i * 1.7) * 0.08;
    }
    if (near(-382, -250, 260)) for (let i = 0; i < Details.dolphins.length; i++) {
      const d = Details.dolphins[i], u = d.userData;
      const a = time * u.speed + u.phase;
      const x = -382 + Math.cos(a) * u.rx, z = -250 + Math.sin(a) * u.rz;
      const tx = -Math.sin(a) * u.rx, tz = Math.cos(a) * u.rz;
      const wy = CC.RetroWater
        ? CC.RetroWater.waterYFor(x, z, time, -0.4 + Math.max(0, Math.sin(time * 0.8 + u.phase)) * 1.5)
        : C.SEA_LEVEL - 0.4 + Math.max(0, Math.sin(time * 0.8 + u.phase)) * 1.5;
      d.position.set(x, wy + Math.sin(time * 2.1 + u.phase) * 0.12, z);
      d.rotation.y = Math.atan2(tx, tz);
      d.rotation.z = Math.sin(time * 3 + u.phase) * 0.07;
      u.tail.rotation.y = Math.sin(time * 11 + u.phase) * 0.45;
    }
    if (near(-180, -320, 220)) for (let i = 0; i < Details.beachWavePeople.length; i++) {
      const p = Details.beachWavePeople[i];
      const wave = Math.max(0, Math.sin(time * p.speed + p.phase));
      p.armL.rotation.z = -0.15 - wave * 2.1;
      p.armR.rotation.z = 0.15 + wave * 0.4;
    }
    if (near(-180, -320, 220)) for (let i = 0; i < Details.beachBalls.length; i++) {
      const b = Details.beachBalls[i], t = time * 2.4 + b.phase;
      b.mesh.position.set(b.base.x + Math.sin(t) * 3.2,
        b.base.y + Math.abs(Math.sin(t * 1.7)) * 2.2,
        b.base.z + Math.cos(t * 0.7) * 1.1);
    }
    if (near(-320, 40, 320)) for (let i = 0; i < Details.seaLife.length; i++) {
      const c = Details.seaLife[i], u = c.userData;
      if (u.kind === 'fish') {
        const a = time * u.speed + u.phase;
        const px = u.cx + Math.cos(a) * u.rx, pz = u.cz + Math.sin(a) * u.rz;
        c.position.set(px, CC.RetroWater
          ? CC.RetroWater.waterYFor(px, pz, time, -u.depth)
          : C.SEA_LEVEL - u.depth + Math.sin(time * 2 + u.phase) * 0.22, pz);
        c.rotation.y = Math.atan2(-Math.sin(a) * u.rx, Math.cos(a) * u.rz);
        if (u.tail) u.tail.rotation.y = Math.sin(time * 12 + u.phase) * 0.5;
      } else if (u.kind === 3 && u.top) {
        u.top.rotation.x = Math.sin(time * 1.8 + u.phase) * 0.28;
      } else if (u.kind === 0 || u.kind === 1) {
        c.rotation.y = Math.sin(time * 0.9 + u.phase) * 0.5;
      }
    }
  };

  // Used by NPC traffic so red lights actually make cars stop.
  Details.signalFor = function (x, z, fx, fz) {
    for (let i = 0; i < Details.signals.length; i++) {
      const s = Details.signals[i];
      const dx = s.x - x, dz = s.z - z;
      const along = dx * fx + dz * fz;
      if (along <= 0 || along > 28) continue;
      const lateral = Math.abs(dx * fz - dz * fx);
      if (lateral < 9) return s.state;
    }
    return null;
  };

  // Cleanup known problematic debris/beam artifacts under bridges.
  Details.cleanupBridgeDebris = function (scene) {
    if (Details._debrisCleaned) return;
    Details._debrisCleaned = true;
    const targets = [
      { x: 103, z: 175, r: 10 },
      { x: 141, z: 177, r: 8 },
      { x: 137, z: -39, r: 14 } // reported rectangles across river at bascule span
    ];
    const wp = new THREE.Vector3();
    scene.traverse(function (obj) {
      if (!obj || !obj.isMesh || !obj.geometry) return;
      if (obj.geometry.type !== 'BoxGeometry') return;
      const p = obj.geometry.parameters || {};
      const maxDim = Math.max(p.width || 0, p.height || 0, p.depth || 0);
      if (obj.getWorldPosition) obj.getWorldPosition(wp); else wp.copy(obj.position);
      for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        const dx = wp.x - t.x, dz = wp.z - t.z;
        if (dx * dx + dz * dz > t.r * t.r) continue;
        // hide thin/long or low beams/debris; keep large roadway/building pieces
        const looksBeam = maxDim >= 4 && (p.height || 0) <= 2.8;
        if (looksBeam || wp.y < 6) { obj.visible = false; break; }
      }
    });
    if (CC.World && CC.World.obstacles) {
      CC.World.obstacles = CC.World.obstacles.filter(function (o) {
        for (let i = 0; i < targets.length; i++) {
          const t = targets[i];
          const dx = o.x - t.x, dz = o.z - t.z;
          if (dx * dx + dz * dz < t.r * t.r && (o.type === 'debris' || o.type === 'beam' || !o.type)) return false;
        }
        return true;
      });
    }
  };
})();
