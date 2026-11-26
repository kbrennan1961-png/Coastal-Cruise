/* Coastal Cruise - build the playable 3D world from a top-down picture.
   The picture becomes the ground texture; its colours are classified into
   water / grass / road / building, then converted into road data, obstacles,
   surface rules and time trials. Falls back to the original procedural map. */
(function () {
  'use strict';

  const CC = window.CC;
  const C = CC.C;
  const U = CC.util;

  const CLS = { NONE: 0, WATER: 1, GRASS: 2, ROAD: 3, BUILDING: 4, SAND: 5, FOREST: 6, MARSH: 7 };

  // Zone lists used by the startup filters never change after the service
  // zones are registered, so build them once instead of on every candidate.
  let buildingZoneCache = null, homeZoneCache = null;
  function serviceNames() { return CC.serviceZoneNames ? CC.serviceZoneNames() : []; }
  function buildingZones() {
    if (!buildingZoneCache) {
      buildingZoneCache = Object.freeze(
        ['boardwalk', 'amusement', 'pier', 'gas', 'fastfood', 'trailhead'].concat(serviceNames()));
    }
    return buildingZoneCache;
  }
  function homeZones() {
    if (!homeZoneCache) {
      homeZoneCache = Object.freeze(
        ['park', 'farm', 'boardwalk', 'amusement', 'pier', 'gas', 'fastfood', 'trailhead']
          .concat(serviceNames()));
    }
    return homeZoneCache;
  }

  function canvasFromRGBA(rgba, W, H) {
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const image = ctx.createImageData(W, H);
    image.data.set(rgba);
    ctx.putImageData(image, 0, 0);
    return canvas;
  }

  // Deterministic value noise for fine ground texture (no random state).
  function noise2(x, y) {
    let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }

  function chamfer(mask, w, h) {
    const INF = 1e9;
    const d = new Float32Array(w * h);
    for (let i = 0; i < d.length; i++) d[i] = mask[i] ? 0 : INF;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        let v = d[i];
        if (x > 0) v = Math.min(v, d[i - 1] + 1);
        if (y > 0) {
          v = Math.min(v, d[i - w] + 1);
          if (x > 0) v = Math.min(v, d[i - w - 1] + 1.4142);
          if (x < w - 1) v = Math.min(v, d[i - w + 1] + 1.4142);
        }
        d[i] = v;
      }
    }
    for (let y = h - 1; y >= 0; y--) {
      for (let x = w - 1; x >= 0; x--) {
        const i = y * w + x;
        let v = d[i];
        if (x < w - 1) v = Math.min(v, d[i + 1] + 1);
        if (y < h - 1) {
          v = Math.min(v, d[i + w] + 1);
          if (x > 0) v = Math.min(v, d[i + w - 1] + 1.4142);
          if (x < w - 1) v = Math.min(v, d[i + w + 1] + 1.4142);
        }
        d[i] = v;
      }
    }
    return d;
  }

  // Runtime road corrections for the baked town map. The Burger Bay loop stays
  // dry, the East Cul-de-sac passes under Main Street, and the mouth crossing
  // is moved onto the river's short north-south reach so it meets the channel
  // squarely. A broad east-side loop then joins that crossing to Main Street.
  function riverAtZ(z) {
    const pts = [
      { x: 90, z: -320, w: 14 }, { x: 92, z: -260, w: 15 }, { x: 108, z: -200, w: 17 },
      { x: 125, z: -120, w: 18 }, { x: 125, z: -10, w: 18 }, { x: 145, z: 60, w: 19 },
      { x: 155, z: 135, w: 19 }, { x: 160, z: 210, w: 19 }, { x: 150, z: 290, w: 17 },
      { x: 140, z: 360, w: 14 }
    ];
    if (z <= pts[0].z) return pts[0];
    if (z >= pts[pts.length - 1].z) return pts[pts.length - 1];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (z >= a.z && z <= b.z) {
        const t = (z - a.z) / (b.z - a.z || 1);
        return { x: a.x + (b.x - a.x) * t, w: a.w + (b.w - a.w) * t };
      }
    }
    return pts[0];
  }
  function riverCrossingPoint(a, b) {
    const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 4));
    let best = null;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = a[0] + (b[0] - a[0]) * t;
      const z = a[1] + (b[1] - a[1]) * t;
      const r = riverAtZ(z);
      if (Math.abs(x - r.x) < r.w + 5) {
        const d = Math.hypot(x - 101, z - 177);
        if (!best || d < best.d) best = { d: d, z: z, x: x, t: t };
      }
    }
    return best;
  }
  function trimRoadsAtRiver(list) {
    const out = [];
    list.forEach(function (road) {
      if (!road || !road.points || road.points.length < 2) { out.push(road); return; }
      const pts = road.points.map(function (p) { return [p[0], p[1]]; });
      let cur = [pts[0]];
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const cross = riverCrossingPoint(a, b);
        // Remove every river crossing north of X122 Z-38.
        if (cross && cross.z < -38) {
          const last = cur[cur.length - 1];
          if (!last || last[0] !== a[0] || last[1] !== a[1]) cur.push(a.slice());
          if (cur.length >= 2) out.push(Object.assign({}, road, { points: cur, closed: false }));
          cur = [b.slice()];
        } else {
          if (cur[cur.length - 1][0] !== b[0] || cur[cur.length - 1][1] !== b[1]) cur.push(b.slice());
        }
      }
      if (cur.length >= 2) out.push(Object.assign({}, road, { points: cur, closed: false }));
    });
    return out;
  }

  function simplifyBurgerBayRoads(roads) {
    const list = (roads || []).slice();
    // Removed: runtime North Cross override created an unintended river crossing. Use baked road.
    if (list[0]) {
      // Trim north of x-176 z-262 and add a gentle curve at that corner.
      list[0] = Object.assign({}, list[0], {
        points: [[-170, -250], [-160, -150], [-168, -40], [-150, 70], [-160, 180], [-190, 200], [-230, 205], [-270, 210], [-295, 214]]
      });
    }
    const harborAve = list.find(function (r) { return r && r.name === 'Harbor Avenue'; });
    if (harborAve) {
      Object.assign(harborAve, {
        points: [[-170, -250], [-160, -150], [-168, -40], [-150, 70], [-160, 180], [-190, 200], [-230, 205], [-270, 210], [-295, 214]]
      });
    }
    // Remove East Cul-de-sac as requested.
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i] && list[i].name === 'East Cul-de-sac') list.splice(i, 1);
    }
    // Baked roads are used; trimRoadsAtRiver() below removes crossings north of X122 Z-38.
    const southCul = list.find(function (r) { return r && r.name === 'South Cul-de-sac'; });
    if (southCul) {
      // Moved end from x134 z184 area to x167 z183 for T intersection with Cul-de-sac South.
      // Removed road segment x249 z231 to x271 z274 area.
      Object.assign(southCul, {
        points: [[167, 183], [155, 240], [215, 260], [245, 225], [272, 282], [269, 294], [265, 300]]
      });
    }
    if (list[8]) {
      // Dune Road stays on the west side of the river and connects into the
      // rerouted Harbor Avenue west-bank segment instead of crossing.
      list[8] = Object.assign({}, list[8], {
        points: [[-150, 70], [-235, 95], [-270, 165], [-250, 195], [-230, 205]]
      });
    }
    // Connector from Park Loop area to North Cross, large curve at x-36 z-255.
    if (!list.find(function (r) { return r && r.name === 'Park North Connector'; })) {
      list.push({
        name: 'Park North Connector', type: 'paved', width: 10, closed: false,
        points: [[-61, -181], [-58, -198], [-53, -216], [-47, -232], [-42, -244], [-39, -250], [-37, -253], [-36, -255], [-38, -256], [-40, -255]]
      });
    } else {
      const pnc = list.find(function (r) { return r && r.name === 'Park North Connector'; });
      Object.assign(pnc, { points: [[-61, -181], [-58, -198], [-53, -216], [-47, -232], [-42, -244], [-39, -250], [-37, -253], [-36, -255], [-38, -256], [-40, -255]] });
    }
    // Port Access removed: no river crossings except the allowed South Cross bridge at x101 z177.
    // Single-lane exit from Duke Energy parking lot, crossing Palm Boulevard
    // where the old Riverbend Loop used to cross.
    list.push({
      name: 'Duke Lot Exit', type: 'paved', width: 8, closed: false,
      points: [[298, -90], [298.2, -82], [298.5, -74], [299.5, -60]]
    });
    // Connector from x245 z226 to Palm Loop T intersection at x286 z234.
    list.push({
      name: 'Palm Connector', type: 'paved', width: 9, closed: false,
      points: [[245, 226], [286, 234]]
    });
    // Connector requested: x88 z22 to x88 z-41.
    if (!list.find(function (r) { return r && r.name === 'Park West Connector'; })) {
      list.push({
        name: 'Park West Connector', type: 'paved', width: 10, closed: false,
        points: [[88, 22], [88, -41]]
      });
    }
    // Single-lane turnaround loops at known NPC jam points.
    // Each road splits into two one-way paths that form a loop and return
    // traffic in the opposite direction. Cars cannot continuously circulate.
    const circles = [];
    // Remove requested circles/feeds/returns.
    for (let i = list.length - 1; i >= 0; i--) {
      const name = list[i] && list[i].name || '';
      if (/^Palm North Circle( Feed| Return)?$/.test(name)) list.splice(i, 1);
    }
    // No NPC car routing for dead ends / requested restricted roads.
    list.forEach(function (road) {
      if (!road || !road.points) return;
      if (road.name === 'Beach Boardwalk South') road.noNpcCars = true;
      if (road.name === 'Dune Track') road.noNpcCars = true;
      // Requested: do not route NPC car traffic down road near x-266 z204.
      const near266204 = road.points.some(function (pt) {
        return Math.hypot(pt[0] - (-266), pt[1] - 204) < 45;
      });
      if (near266204) road.noNpcCars = true;
    });
    const consumedEndpoints = new Set();
    circles.forEach(function (c) {
      const near = [];
      list.forEach(function (road) {
        if (!road || road.closed || !road.points || road.points.length < 2) return;
        if (/Circle$/.test(road.name) || /Circle (Feed|Return|Loop|In|Out)$/.test(road.name)) return;
        [0, road.points.length - 1].forEach(function (idx) {
          const key = road.name + ':' + idx;
          if (consumedEndpoints.has(key)) return;
          const p = road.points[idx];
          const d = Math.hypot(p[0] - c.cx, p[1] - c.cz);
          if (d < c.r + 50) near.push({ road: road, idx: idx, d: d, key: key });
        });
      });
      near.sort(function (a, b) { return a.d - b.d; });
      const picks = [];
      const used = new Set();
      for (let i = 0; i < near.length && picks.length < 2; i++) {
        const hit = near[i];
        if (used.has(hit.key) || consumedEndpoints.has(hit.key)) continue;
        picks.push(hit);
        used.add(hit.key);
      }
      if (picks.length < 1) return;

      const addLoop = function (feedConn, retConn, startA, endA) {
        const feedOuter = [c.cx + Math.cos(startA) * (c.r + 8), c.cz + Math.sin(startA) * (c.r + 8)];
        const retOuter = [c.cx + Math.cos(endA) * (c.r + 8), c.cz + Math.sin(endA) * (c.r + 8)];
        const feedIn = [c.cx + Math.cos(startA) * (c.r + 0.5), c.cz + Math.sin(startA) * (c.r + 0.5)];
        const retOut = [c.cx + Math.cos(endA) * (c.r + 0.5), c.cz + Math.sin(endA) * (c.r + 0.5)];
        // Connectors are single-lane one-way roads; original roads keep width.
        feedConn.points[feedConn.points.length - 1] = feedOuter;
        retConn.points[0] = retOuter;
        let delta = endA - startA;
        while (delta <= 0) delta += Math.PI * 2;
        while (delta > Math.PI * 2) delta -= Math.PI * 2;
        if (delta < Math.PI * 0.6) delta += Math.PI * 2;
        const steps = 18;
        const loopPts = [feedOuter.slice(), feedIn.slice()];
        for (let i = 1; i < steps; i++) {
          const t = i / steps;
          const a = startA + delta * t;
          loopPts.push([c.cx + Math.cos(a) * c.r, c.cz + Math.sin(a) * c.r]);
        }
        loopPts.push(retOut.slice(), retOuter.slice());
        list.push(feedConn, retConn, {
          name: c.name + ' Loop', type: 'paved', width: 6, closed: false, oneWay: 1,
          points: loopPts
        });
      };

      const makeConnector = function (road, idx, dirOut) {
        // dirOut true: connector leaves road toward loop; false: returns to road.
        const atStart = idx === 0;
        const junctionIdx = atStart ? 1 : road.points.length - 2;
        const junction = road.points[junctionIdx];
        if (!junction) return null;
        // Truncate original road so no two-lane segment leads into the loop.
        if (atStart) road.points.splice(0, 1);
        else road.points.splice(road.points.length - 1, 1);
        if (road.points.length < 2) return null;
        const pts = dirOut ? [junction.slice(), [0, 0]] : [[0, 0], junction.slice()];
        return {
          name: c.name + (dirOut ? ' Feed' : ' Return'),
          type: road.type || 'paved', width: 6, closed: false, oneWay: dirOut ? 1 : -1,
          points: pts
        };
      };

      if (picks.length === 1) {
        const hit = picks[0];
        const road = hit.road;
        const idx = hit.idx;
        const p = road.points[idx];
        const baseA = Math.atan2(p[1] - c.cz, p[0] - c.cx);
        const a1 = baseA - 0.45;
        const a2 = baseA + 0.45;
        const atStart = idx === 0;
        const junctionIdx = atStart ? 1 : road.points.length - 2;
        const junction = road.points[junctionIdx] && road.points[junctionIdx].slice();
        if (!junction) return;
        if (atStart) road.points.splice(0, 1);
        else road.points.splice(road.points.length - 1, 1);
        if (road.points.length < 2) return;
        // Single-lane connectors: feed leaves road toward loop, return comes back.
        const feedConn = {
          name: c.name + ' Feed', type: road.type || 'paved', width: 6, closed: false, oneWay: 1,
          points: [junction.slice(), [0, 0]]
        };
        const retConn = {
          name: c.name + ' Return', type: road.type || 'paved', width: 6, closed: false, oneWay: 1,
          points: [[0, 0], junction.slice()]
        };
        consumedEndpoints.add(hit.key);
        addLoop(feedConn, retConn, a1, a2);
        return;
      }

      const feedHit = picks[0];
      const returnHit = picks[1];
      const fp = feedHit.road.points[feedHit.idx];
      const rp = returnHit.road.points[returnHit.idx];
      const fa = Math.atan2(fp[1] - c.cz, fp[0] - c.cx);
      const ra = Math.atan2(rp[1] - c.cz, rp[0] - c.cx);
      const feedConn = makeConnector(feedHit.road, feedHit.idx, feedHit.idx !== 0);
      const retConn = makeConnector(returnHit.road, returnHit.idx, returnHit.idx === 0);
      if (feedConn && retConn) {
        consumedEndpoints.add(feedHit.key);
        consumedEndpoints.add(returnHit.key);
        addLoop(feedConn, retConn, fa, ra);
      }
    });
    return trimRoadsAtRiver(list);
  }

  // Exposed so the offline map editor can show exactly the road network the
  // game will drive on (baked roads plus all runtime overrides/trims).
  CC.simplifyRoads = simplifyBurgerBayRoads;

  const ImageMap = (CC.ImageMap = {
    CLS: CLS,
    ready: false,
    active: false,
    image: null,
    groundCanvas: null,
    texture: null,
    roadMask: null,
    bridgeMask: null,
    W: 0,
    H: 0,
    classes: null,
    distWater: null,
    distLand: null,
    roads: [],
    buildings: [],
    challenges: [],
    zones: null,
    landmarks: [],
    def: null,

    load(src) {
      this.def = CC.imageMapDef;
      // The baked map needs no pixel reads, so it also works from file://.
      if (CC.bakedMap) return this.loadBaked();
      // No baked data: build the designed network directly (no image needed).
      return new Promise(function (resolve) {
        try {
          ImageMap.buildDesignedMap();
          ImageMap.ready = true;
          resolve(true);
        } catch (err) {
          console.warn('[Coastal Cruise] Could not build the street map:', err);
          resolve(false);
        }
      });
    },

    /* Legacy path kept for custom pictures served over HTTP. */
    loadPicture(src) {
      return new Promise(function (resolve) {
        const img = new Image();
        img.onload = function () {
          ImageMap.image = img;
          try {
            ImageMap.build();
            ImageMap.ready = true;
            resolve(true);
          } catch (err) {
            console.warn('[Coastal Cruise] Could not process image map:', err);
            resolve(false);
          }
        };
        img.onerror = function () {
          console.warn('[Coastal Cruise] Map image not found:', src, '- using the original coastal map.');
          resolve(false);
        };
        img.crossOrigin = 'anonymous';
        img.src = src;
      });
    },

    loadBaked() {
      const baked = CC.bakedMap;
      return new Promise(function (resolve) {
        try {
          const IM = ImageMap;
          IM.W = baked.width;
          IM.H = baked.height;
          IM.roads = simplifyBurgerBayRoads(baked.roads);
          IM.buildings = baked.buildings;
          IM.challenges = baked.challenges || [];
          IM.zones = baked.zones || null;
          // Edits exported by map-editor.html replace the baked/runtime views.
          const patchedMap = CC.applyMapEdits ? CC.applyMapEdits(IM) : false;
          if (IM.zones) {
            IM.zones.park = IM.zones.park || { x: -60, z: 315, w: 110, h: 90 };
            IM.zones.farm = IM.zones.farm || { x: -300, z: -115, w: 110, h: 110 };
            IM.zones.boardwalk = IM.zones.boardwalk || { x: -340, z: -270, w: 60, h: 160 };
            IM.zones.amusement = IM.zones.amusement || { x: -260, z: -250, w: 100, h: 110 };
            IM.zones.pier = IM.zones.pier || { x: -390, z: -250, w: 90, h: 28 };
            // The old baked site had the East Cul-de-sac running through it.
            IM.zones.gas = { x: 235, z: -180, w: 80, h: 70 };
            IM.zones.fastfood = { x: 55, z: -90, w: 54, h: 44 };
            IM.zones.trailhead = CC.trailheadZone();
            Object.assign(IM.zones, CC.serviceZones());
            // Runtime ponds keep the baked map file unchanged while still
            // feeding the terrain painter, water rules and animated overlay.
            IM.zones.ponds = ((baked.zones && baked.zones.ponds) || [])
              .concat(CC.pondDefs());
            IM.zones.riverFill = (IM.zones.riverFill || []).concat([
              { minX: 245, maxX: 300, minZ: 284, maxZ: 320 }
            ]);
          }
          // The entertainment district replaces a handful of scattered homes
          // on this otherwise empty stretch of coast. Exported edits keep
          // their exact positions, so this cleanup only runs without a patch.
          if (!patchedMap) {
            IM.buildings = (baked.buildings || []).filter(function (b) {
              return buildingZones().every(function (name) {
                return !IM.inZone(b.x, b.z, name);
              });
            });
          }
          if (!patchedMap) IM.landmarks = baked.landmarks || [];
          CC.roadDefs = IM.roads;
          CC.buildRoadSegments();
          // Everything is generated from the baked numbers, so no image file
          // (and no pixel read) is needed - this also works from file://.
          // paintTerrain() reads riverDepth; install a temporary fill-aware
          // coast so the ground canvas and water mask stay in sync with the
          // runtime land fill.
          const baseRiverDepth = CC.coast && CC.coast.riverDepth;
          if (baseRiverDepth) {
            CC.coast.riverDepth = function (x, z) {
              const d = baseRiverDepth(x, z);
              return IM.inRiverFill(x, z) ? Math.max(0.5, d) : d;
            };
            CC.coast.inMarsh = function (x, z) {
              const d = CC.coast.riverDepth(x, z);
              return d >= 0 && d < CC.river.marshWidth;
            };
          }
          IM.paintTerrain(IM.roads, IM.zones, IM.W, IM.H);
          // Move any baked home whose footprint (or front-yard fence) would
          // touch the asphalt, then drop the ones that cannot be moved safely.
          // Patched edits are already final, so leave them exactly as drawn.
          if (!patchedMap) IM.clearHomesFromRoads();
          // This is the exact painted canvas used by the 3D terrain material,
          // so the full-screen planner shows the map the game is played on.
          // No separate reference picture or runtime fetch is involved.
          const ground = (IM.groundCanvas = canvasFromRGBA(IM.ground, IM.W, IM.H));
          const tex = (IM.texture = new THREE.Texture(ground));
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.needsUpdate = true;
          IM.ready = true;
          resolve(true);
        } catch (err) {
          console.warn('[Coastal Cruise] Baked map failed to load:', err);
          resolve(false);
        }
      });
    },

    build() {
      const def = this.def;
      const img = this.image;
      const canvas = document.createElement('canvas');
      canvas.width = this.W = img.naturalWidth || img.width;
      canvas.height = this.H = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, this.W, this.H).data;
      const n = this.W * this.H;
      const cls = (this.classes = new Uint8Array(n));
      const waterMask = new Uint8Array(n);
      const landMask = new Uint8Array(n);

      for (let i = 0, p = 0; i < n; i++, p += 4) {
        const r = data[p], g = data[p + 1], b = data[p + 2];
        let c = CLS.NONE;
        if (b > r + def.waterBlue && b > g + def.waterGreen) {
          c = CLS.WATER;
        } else if (g > r + def.grassRed && g > b + def.grassBlue) {
          c = CLS.GRASS;
        } else {
          const neutral = Math.abs(r - g) < 16;
          if (r >= def.roadMin && g >= def.roadMin && b >= def.roadMin - 5 && neutral) {
            c = CLS.ROAD;
          } else if (r <= def.buildingMax && Math.abs(r - g) < 12 && Math.abs(r - b) < 14) {
            c = CLS.BUILDING;
          }
        }
        cls[i] = c;
        waterMask[i] = c === CLS.WATER ? 1 : 0;
        landMask[i] = c === CLS.WATER ? 0 : 1;
      }

      this.distWater = chamfer(waterMask, this.W, this.H);
      this.distLand = chamfer(landMask, this.W, this.H);
      // A thin sandy rim around the shoreline.
      for (let i = 0; i < n; i++) {
        if (cls[i] === CLS.GRASS && this.distWater[i] <= def.sandRing) cls[i] = CLS.SAND;
      }

      // Repaint the picture for driving: black asphalt, grass green
      // everywhere else. The original pixels above still drive the road and
      // home-site detection, so only the visible ground changes.
      const ground = (this.groundCanvas = document.createElement('canvas'));
      ground.width = this.W; ground.height = this.H;
      const gctx = ground.getContext('2d');
      const painted = gctx.createImageData(this.W, this.H);
      const out = painted.data;
      for (let i = 0, p = 0; i < n; i++, p += 4) {
        if (cls[i] === CLS.ROAD) {
          out[p] = 20; out[p + 1] = 20; out[p + 2] = 20;
        } else {
          const jitter = ((i * 7 + ((i / this.W) | 0) * 13) % 11) - 5;
          out[p] = 111 + jitter;
          out[p + 1] = 158 + jitter;
          out[p + 2] = 74 + jitter;
        }
        out[p + 3] = 255;
      }
      gctx.putImageData(painted, 0, 0);

      const tex = (this.texture = new THREE.Texture(ground));
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;

      this.roads = this.findRoads();
      this.buildings = this.findBuildings();
      this.challenges = [];
    },

    /* ---------- a clean, hand-defined trailer-park map ----------
       Straight, well-defined streets plus a shoreline, sandy beach, woods and
       a pond. The texture, driving surface and minimap are all painted from
       the same data, so they always agree. */
    shoreLine(z) {
      const s = this.zones && this.zones.shore;
      if (!s) return C.WORLD.minX;
      return s.base + s.amp1 * Math.sin(z * s.freq1) + s.amp2 * Math.sin(z * s.freq2 + s.phase2);
    },

    inRiverFill(x, z) {
      const fills = (this.zones && this.zones.riverFill) || [];
      for (let i = 0; i < fills.length; i++) {
        const f = fills[i];
        if (x >= f.minX && x <= f.maxX && z >= f.minZ && z <= f.maxZ) return true;
      }
      return false;
    },

    inWater(x, z) {
      if (!this.zones || !this.zones.shore) return false;
      if (x < this.shoreLine(z)) return true;
      if (!this.inRiverFill(x, z) && CC.coast && CC.coast.riverDepth && CC.coast.riverDepth(x, z) < 0) return true;
      const ponds = this.zones.ponds || [];
      for (let i = 0; i < ponds.length; i++) {
        const dx = x - ponds[i].x, dz = z - ponds[i].z;
        if (dx * dx + dz * dz < ponds[i].r * ponds[i].r) return true;
      }
      return false;
    },

    paintTerrain(roads, zones, W, H) {
      const sx = W / (C.WORLD.maxX - C.WORLD.minX);
      const sy = H / (C.WORLD.maxZ - C.WORLD.minZ);
      const n = W * H;
      const classes = (this.classes = new Uint8Array(n));
      const waterMask = new Uint8Array(n);
      const landMask = new Uint8Array(n);
      const ponds = (zones && zones.ponds) || [];
      const woods = (zones && zones.forest) || [];
      const fills = (zones && zones.riverFill) || [];
      for (let y = 0; y < H; y++) {
        const wz = C.WORLD.minZ + (y + 0.5) / sy;
        const shore = zones && zones.shore ? this.shoreLine(wz) : C.WORLD.minX - 1000;
        for (let x = 0; x < W; x++) {
          const wx = C.WORLD.minX + (x + 0.5) / sx;
          const i = y * W + x;
          let filled = false;
          for (let f = 0; f < fills.length && !filled; f++) {
            const zf = fills[f];
            if (wx >= zf.minX && wx <= zf.maxX && wz >= zf.minZ && wz <= zf.maxZ) filled = true;
          }
          let water = wx < shore ||
            (!filled && !!(CC.coast && CC.coast.riverDepth && CC.coast.riverDepth(wx, wz) < 0));
          for (let k = 0; k < ponds.length && !water; k++) {
            const dx = wx - ponds[k].x, dz = wz - ponds[k].z;
            if (dx * dx + dz * dz < ponds[k].r * ponds[k].r) water = true;
          }
          waterMask[i] = water ? 1 : 0;
          landMask[i] = water ? 0 : 1;
          classes[i] = water ? CLS.WATER : CLS.GRASS;
        }
      }
      const distWater = (this.distWater = chamfer(waterMask, W, H));
      const distLand = (this.distLand = chamfer(landMask, W, H));
      const ramps = (zones && zones.ramps) || [];
      const beachPx = ((zones && zones.beachWidth) || 16) * 0.5 * (sx + sy);
      const rgba = (this.ground = new Uint8ClampedArray(n * 4));
      for (let y = 0; y < H; y++) {
        const wz = C.WORLD.minZ + (y + 0.5) / sy;
        for (let x = 0; x < W; x++) {
          const i = y * W + x, p = i * 4;
          const wx = C.WORLD.minX + (x + 0.5) / sx;
          const jitter = ((i * 7 + y * 13) % 11) - 5;
          let c = classes[i];
          if (c === CLS.WATER) {
            const shallow = U.clamp(1 - distLand[i] / (beachPx * 2.5), 0, 1);
            rgba[p] = 30 + shallow * 44 + jitter * 0.4;
            rgba[p + 1] = 88 + shallow * 60 + jitter * 0.4;
            rgba[p + 2] = 126 + shallow * 48 + jitter * 0.4;
          } else if (CC.coast && CC.coast.inMarsh && CC.coast.inMarsh(wx, wz)) {
            // Saturated reeds: darker, cooler ground than the dry lawn.
            c = classes[i] = CLS.MARSH;
            const wet = noise2(x >> 2, y >> 2) * 22;
            rgba[p] = 76 + jitter + wet * 0.3;
            rgba[p + 1] = 108 + jitter + wet * 0.5;
            rgba[p + 2] = 68 + jitter + wet * 0.25;
          } else if (distWater[i] <= beachPx) {
            c = classes[i] = CLS.SAND;
            rgba[p] = 214 + jitter; rgba[p + 1] = 194 + jitter; rgba[p + 2] = 146 + jitter;
          } else {
            let forest = false;
            for (let k = 0; k < woods.length; k++) {
              const dx = wx - woods[k].x, dz = wz - woods[k].z;
              if (dx * dx + dz * dz < woods[k].r * woods[k].r) { forest = true; break; }
            }
            // Three scales of noise plus sparse bright/dark blades give the
            // lawn a mottled, grassy look instead of a flat green fill.
            const fine = noise2(x, y), mid = noise2(x >> 2, y >> 2), broad = noise2(x >> 4, y >> 4);
            const blade = fine > 0.93 ? 24 : (fine < 0.08 ? -20 : 0);
            const shade = (mid - 0.5) * 30 + (broad - 0.5) * 24 + jitter * 0.7 + blade;
            if (forest) {
              c = classes[i] = CLS.FOREST;
              rgba[p] = 62 + shade * 0.8; rgba[p + 1] = 106 + shade * 0.9; rgba[p + 2] = 55 + shade * 0.6;
            } else {
              rgba[p] = 96 + shade; rgba[p + 1] = 149 + shade * 0.9; rgba[p + 2] = 61 + shade * 0.55;
            }
          }
          rgba[p + 3] = 255;
        }
      }
      // Concrete launch ramps are drivable sand over the water.
      ramps.forEach(function (r) {
        const half = r.w * 0.5;
        const x0 = U.clamp(Math.floor((Math.min(r.ax, r.bx) - half - 2 - C.WORLD.minX) * sx), 0, W - 1);
        const x1 = U.clamp(Math.ceil((Math.max(r.ax, r.bx) + half + 2 - C.WORLD.minX) * sx), 0, W - 1);
        const y0 = U.clamp(Math.floor((Math.min(r.az, r.bz) - half - 2 - C.WORLD.minZ) * sy), 0, H - 1);
        const y1 = U.clamp(Math.ceil((Math.max(r.az, r.bz) + half + 2 - C.WORLD.minZ) * sy), 0, H - 1);
        for (let y = y0; y <= y1; y++) {
          const wz = C.WORLD.minZ + (y + 0.5) / sy;
          for (let x = x0; x <= x1; x++) {
            const wx = C.WORLD.minX + (x + 0.5) / sx;
            if (U.distanceToSegment(wx, wz, r.ax, r.az, r.bx, r.bz).dist > half) continue;
            const i = y * W + x, p = i * 4;
            const jitter = ((i * 7 + y * 13) % 11) - 5;
            classes[i] = CLS.SAND;
            rgba[p] = 186 + jitter; rgba[p + 1] = 190 + jitter; rgba[p + 2] = 183 + jitter;
          }
        }
      });

      const mask = (this.roadMask = new Uint8Array(n));
      const bridges = (this.bridgeMask = new Uint8Array(n));
      roads.forEach(function (road) {
        const half = road.width * 0.5;
        for (let s = 0; s < road.points.length - 1; s++) {
          const a = road.points[s], b = road.points[s + 1];
          const x0 = U.clamp(Math.floor((Math.min(a[0], b[0]) - half - 2 - C.WORLD.minX) * sx), 0, W - 1);
          const x1 = U.clamp(Math.ceil((Math.max(a[0], b[0]) + half + 2 - C.WORLD.minX) * sx), 0, W - 1);
          const y0 = U.clamp(Math.floor((Math.min(a[1], b[1]) - half - 2 - C.WORLD.minZ) * sy), 0, H - 1);
          const y1 = U.clamp(Math.ceil((Math.max(a[1], b[1]) + half + 2 - C.WORLD.minZ) * sy), 0, H - 1);
          for (let y = y0; y <= y1; y++) {
            const wz = C.WORLD.minZ + (y + 0.5) / sy;
            for (let x = x0; x <= x1; x++) {
              const wx = C.WORLD.minX + (x + 0.5) / sx;
              if (U.distanceToSegment(wx, wz, a[0], a[1], b[0], b[1]).dist > half) continue;
              const i = y * W + x, p = i * 4;
              const bridge = CC.coast && CC.coast.onBridge &&
                CC.coast.onBridge(wx, wz, 0);
              // Keep the water class under a deck for boat depth queries, but
              // still paint and classify the deck as road for driving/scenery.
              if (classes[i] === CLS.WATER && !bridge) continue;
              if (bridge && classes[i] === CLS.WATER) bridges[i] = 1;
              mask[i] = 1;
              if (!bridge) classes[i] = CLS.ROAD;
              rgba[p] = 20; rgba[p + 1] = 20; rgba[p + 2] = 20;
            }
          }
        }
      });
      // Park and farm sites are cleared lawn/pasture, not forest, so the
      // scattered tree generators leave room for fields and buildings.
      const servicePaint = {
        nightclub: [106, 90, 116], pawn: [134, 128, 114], liquor: [122, 134, 116],
        postOffice: [144, 132, 112], massage: [126, 112, 134], gunStore: [118, 122, 112],
        chinese: [150, 122, 96], waterTower: [126, 134, 130], treatment: [116, 128, 130],
        fuelStorage: [130, 126, 118], airport: [138, 138, 136], cemetery: [104, 148, 94],
        hospital: [176, 176, 168], boatyard: [150, 145, 130], dogpark: [138, 162, 112],
        powerStation: [126, 130, 126], satellite: [140, 142, 138],
        walmart: [118, 122, 124], nuclear: [132, 138, 134],
        walkingStream: [124, 152, 118], beaconSeafood: [142, 136, 120],
        port: [124, 130, 130],
        church: [150, 146, 133], motel: [116, 104, 104]
      };
      [
        { q: zones && zones.park, rgb: [112, 164, 84] },
        { q: zones && zones.farm, rgb: [146, 154, 88] },
        { q: zones && zones.boardwalk, rgb: [178, 158, 119], sand: true },
        { q: zones && zones.amusement, rgb: [164, 162, 150], sand: true },
        { q: zones && zones.pier, rgb: [178, 158, 119], sand: true },
        { q: zones && zones.gas, rgb: [122, 124, 122], sand: true },
        { q: zones && zones.fastfood, rgb: [156, 152, 140], sand: true },
        { q: zones && zones.trailhead, rgb: [140, 128, 104], sand: true }
      ].concat(Object.keys(servicePaint).map(function (name) {
        return { q: zones && zones[name], rgb: servicePaint[name], sand: true };
      })).forEach(function (entry) {
        const q = entry.q;
        if (!q) return;
        const x0 = U.clamp(Math.floor((q.x - q.w * 0.5 - C.WORLD.minX) * sx), 0, W - 1);
        const x1 = U.clamp(Math.ceil((q.x + q.w * 0.5 - C.WORLD.minX) * sx), 0, W - 1);
        const y0 = U.clamp(Math.floor((q.z - q.h * 0.5 - C.WORLD.minZ) * sy), 0, H - 1);
        const y1 = U.clamp(Math.ceil((q.z + q.h * 0.5 - C.WORLD.minZ) * sy), 0, H - 1);
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            const i = y * W + x, p = i * 4;
            if (classes[i] === CLS.WATER || classes[i] === CLS.ROAD || classes[i] === CLS.MARSH) continue;
            if (classes[i] === CLS.SAND && !entry.sand) continue;
            classes[i] = entry.sand ? CLS.SAND : CLS.GRASS;
            const jitter = ((i * 7 + y * 13) % 11) - 5;
            const shade = (noise2(x >> 1, y >> 1) - 0.5) * 26 + (noise2(x >> 3, y >> 3) - 0.5) * 22 + jitter * 0.7;
            rgba[p] = entry.rgb[0] + shade;
            rgba[p + 1] = entry.rgb[1] + shade;
            rgba[p + 2] = entry.rgb[2] + shade * 0.6;
          }
        }
      });

      // Dirt nature trails. These are painted last so the brown, slightly
      // speckled path sits on top of the forest floor but never covers a road
      // or the shoreline. The same paths drive the 3D quads and tree clearance.
      (CC.natureTrailPaths ? CC.natureTrailPaths() : []).forEach(function (runs) {
        runs.forEach(function (path) {
          for (let i = 0; i < path.length - 1; i++) {
            const a = path[i], b = path[i + 1];
            const half = 2.6;
            const x0 = U.clamp(Math.floor((Math.min(a.x, b.x) - half - C.WORLD.minX) * sx), 0, W - 1);
            const x1 = U.clamp(Math.ceil((Math.max(a.x, b.x) + half - C.WORLD.minX) * sx), 0, W - 1);
            const y0 = U.clamp(Math.floor((Math.min(a.z, b.z) - half - C.WORLD.minZ) * sy), 0, H - 1);
            const y1 = U.clamp(Math.ceil((Math.max(a.z, b.z) + half - C.WORLD.minZ) * sy), 0, H - 1);
            for (let y = y0; y <= y1; y++) {
              const wz = C.WORLD.minZ + (y + 0.5) / sy;
              for (let x = x0; x <= x1; x++) {
                const wx = C.WORLD.minX + (x + 0.5) / sx;
                const idx = y * W + x;
                if (classes[idx] === CLS.WATER || classes[idx] === CLS.MARSH || mask[idx]) continue;
                const d = U.distanceToSegment(wx, wz, a.x, a.z, b.x, b.z).dist;
                if (d > half) continue;
                const grain = noise2(x, y) * 22 + noise2(x >> 1, y >> 1) * 12;
                const edge = d > half - 0.7 ? -12 : 0;
                const p = idx * 4;
                rgba[p] = 138 + grain + edge;
                rgba[p + 1] = 109 + grain * 0.8 + edge;
                rgba[p + 2] = 72 + grain * 0.55 + edge;
              }
            }
          }
        });
      });
      return { rgba: rgba, mask: mask, classes: classes, distWater: distWater, distLand: distLand };
    },

    scatterHomes(limit) {
      const rng = CC.rng(920417);
      const palette = [0xe8e3d5, 0xd9e2e4, 0xe5d8c8, 0xcdd8d0, 0xf0eadc, 0xd7d2c8];
      const out = [];
      const W = C.WORLD;
      let attempts = 0;
      while (out.length < limit && attempts < 40000) {
        attempts++;
        const x = U.randRange(rng, W.minX + 22, W.maxX - 22);
        const z = U.randRange(rng, W.minZ + 22, W.maxZ - 22);
        // Homes go on open grass: not in the water, on the beach or in the woods.
        if (this.classify(x, z) !== CLS.GRASS) continue;
        const nr = CC.nearestRoad(x, z);
        // Keep a healthy margin so no home ends up sitting on the asphalt.
        if (!nr || nr.dist < nr.width * 0.5 + 6) continue;
        let clear = true;
        for (let i = 0; i < this.landmarks.length; i++) {
          const l = this.landmarks[i];
          if (U.distance2D(x, z, l.x, l.z) < Math.max(l.w, l.l) * 0.5 + 12) { clear = false; break; }
        }
        for (let i = 0; i < out.length && clear; i++) {
          if (U.distance2D(x, z, out[i].x, out[i].z) < 17) clear = false;
        }
        if (!clear) continue;
        out.push({
          x: x, z: z,
          w: 10, l: 5,
          h: U.randRange(rng, 2.3, 3.3),
          color: U.pick(rng, palette),
          rot: Math.atan2(nr.dz, nr.dx)
        });
      }
      return out;
    },

    buildDesignedMap() {
      this.W = 904; this.H = 908;
      this.roads = [
        { name: 'Harbor Avenue', type: 'paved', width: 14, closed: false,
          points: [[-170,-250],[-160,-150],[-168,-40],[-150,70],[-160,180],[-190,200],[-230,205],[-270,210],[-295,214]] },
        { name: 'Palm Boulevard', type: 'paved', width: 14, closed: false,
          points: [[285,-330],[300,-235],[290,-130],[305,-25],[290,85],[300,190],[265,300]] },
        { name: 'North Cross', type: 'paved', width: 12, closed: false,
          points: [[-170,-250],[-40,-255],[100,-245],[300,-235]] },
        { name: 'Main Street', type: 'paved', width: 13, closed: false,
          points: [[-168,-40],[-30,-45],[100,-40],[305,-25]] },
        { name: 'South Cross', type: 'paved', width: 12, closed: false,
          points: [[-160,180],[-20,175],[130,180],[300,190]] },
        { name: 'Park Loop', type: 'paved', width: 10, closed: false,
          points: [[120,-185],[175,-100]] },
        { name: 'Park Loop South', type: 'paved', width: 10, closed: false,
          points: [[-35,25],[-95,-85],[-66,-184]] },
        { name: 'Park Loop Cul-de-sac', type: 'paved', width: 9, closed: true,
          points: [[-66,-184],[-74,-192],[-84,-184],[-74,-176],[-66,-184]] },
        { name: 'South Cul-de-sac', type: 'paved', width: 9, closed: false,
          points: [[167,183],[155,240],[215,260],[245,225]] },
        { name: 'Dune Road', type: 'paved', width: 10, closed: false,
          points: [[-150,70],[-235,95],[-270,165],[-250,195],[-230,205]] },
        { name: 'Park North Connector', type: 'paved', width: 10, closed: false,
          points: [[-61,-181],[-58,-198],[-53,-216],[-47,-232],[-42,-244],[-39,-250],[-37,-253],[-36,-255],[-38,-256],[-40,-255]] },
        { name: 'Boat Launch Road', type: 'gravel', width: 9, closed: false,
          points: [[-235,95],[-262,94],[-290,95]] }
      ];
      // A sheltered bay on the west, a pond in the park and a handful of woods.
      this.zones = {
        shore: { base: -330, amp1: 45, freq1: 0.009, amp2: 18, freq2: 0.023, phase2: 1 },
        beachWidth: 17,
        ponds: [{ x: 55, z: -140, r: 24 }].concat(CC.pondDefs()),
        ramps: [{ ax: -291, az: 95, bx: -330, bz: 95, w: 12 }],
        forest: [
          { x: -295, z: -135, r: 92 },
          { x: -90, z: 285, r: 88 },
          { x: 170, z: 265, r: 105 },
          { x: 360, z: -185, r: 82 },
          { x: 10, z: -300, r: 78 },
          { x: -235, z: 340, r: 66 }
        ],
        // Local land fill so Palm Blvd can connect south without ending in water.
        riverFill: [
          { minX: 245, maxX: 300, minZ: 284, maxZ: 320 }
        ],
        // Cleared, level sites for the community park, farm and coastal district.
        park: { x: -60, z: 315, w: 110, h: 90 },
        farm: { x: -300, z: -115, w: 110, h: 110 },
        boardwalk: { x: -340, z: -270, w: 60, h: 160 },
        amusement: { x: -260, z: -250, w: 100, h: 110 },
        pier: { x: -390, z: -250, w: 90, h: 28 },
        gas: { x: 235, z: -180, w: 80, h: 70 },
        fastfood: { x: 55, z: -90, w: 54, h: 44 },
        trailhead: CC.trailheadZone(),
        ...CC.serviceZones()
      };
      this.landmarks = [
        { type: 'store', name: 'PINE MARKET', x: 220, z: -72, w: 30, l: 20, rot: Math.PI / 2 },
        { type: 'restaurant', name: 'HARBOR GRILL', x: -118, z: -292, w: 28, l: 19, rot: 0 },
        { type: 'church', name: 'CHAPEL', x: 215, z: 62, w: 24, l: 30, rot: Math.PI / 2 },
        { type: 'launch', name: 'BOAT LAUNCH', x: -291, z: 95, w: 12, l: 16, rot: -Math.PI / 2 },
        { type: 'pavilion', name: 'PICNIC AREA', x: 20, z: -72, w: 18, l: 16, rot: 0 }
      ];
      CC.roadDefs = this.roads;
      CC.buildRoadSegments();

      const painted = this.paintTerrain(this.roads, this.zones, this.W, this.H);
      const ground = (this.groundCanvas = canvasFromRGBA(painted.rgba, this.W, this.H));
      const tex = (this.texture = new THREE.Texture(ground));
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;

      this.buildings = this.scatterHomes(130);
      this.challenges = [];
    },

    /* ---------- world <-> pixel helpers ---------- */
    toPixelX(x) { return Math.floor((x - C.WORLD.minX) / (C.WORLD.maxX - C.WORLD.minX) * this.W); },
    toPixelZ(z) { return Math.floor((z - C.WORLD.minZ) / (C.WORLD.maxZ - C.WORLD.minZ) * this.H); },
    toWorldX(px) { return C.WORLD.minX + px / this.W * (C.WORLD.maxX - C.WORLD.minX); },
    toWorldZ(py) { return C.WORLD.minZ + py / this.H * (C.WORLD.maxZ - C.WORLD.minZ); },
    at(px, py) {
      if (px < 0 || py < 0 || px >= this.W || py >= this.H) return CLS.WATER;
      const i = py * this.W + px;
      if (this.bridgeMask && this.bridgeMask[i]) return CLS.ROAD;
      if (this.classes) return this.classes[i];
      if (this.roadMask) return this.roadMask[py * this.W + px] ? CLS.ROAD : CLS.GRASS;
      return CLS.GRASS;
    },

    classify(x, z) { return this.at(this.toPixelX(x), this.toPixelZ(z)); },

    inZone(x, z, name) {
      const q = this.zones && this.zones[name];
      return !!q && Math.abs(x - q.x) < q.w * 0.5 && Math.abs(z - q.z) < q.h * 0.5;
    },

    // Give every mobile home a real setback from the road edge. The baked map
    // has older sites that were checked only at their centres, so nudge those
    // away from the asphalt after the terrain classes are available.
    clearHomesFromRoads() {
      const self = this;
      const playZones = homeZones();
      this.buildings = (this.buildings || []).map(function (b) {
        const extent = Math.max(b.w || 10, b.l || 5) * 0.5 + 2;
        for (let pass = 0; pass < 10; pass++) {
          const gap = CC.roadClearance(b.x, b.z, extent);
          if (!isFinite(gap) || gap >= 6.5) break;
          const nr = CC.nearestRoad(b.x, b.z);
          if (!nr) break;
          let ux = (b.x - nr.x) / (nr.dist || 1), uz = (b.z - nr.z) / (nr.dist || 1);
          if (nr.dist < 0.1) { ux = -nr.dz; uz = nr.dx; }
          const push = 6.5 - gap + 0.8;
          b.x += ux * push; b.z += uz * push;
        }
        return b;
      }).filter(function (b) {
        if (self.inWater(b.x, b.z)) return false;
        const cls = self.classify(b.x, b.z);
        if (cls === CLS.WATER || cls === CLS.MARSH || cls === CLS.SAND || cls === CLS.ROAD) return false;
        if (CC.roadClearance(b.x, b.z, Math.max(b.w || 10, b.l || 5) * 0.5 + 2) < 5.5) return false;
        return !playZones.some(function (name) { return self.inZone(b.x, b.z, name); });
      });
      return this.buildings;
    },

    distanceToWater(x, z) {
      if (!this.distWater) return 1000;
      const px = this.toPixelX(x), py = this.toPixelZ(z);
      if (px < 0 || py < 0 || px >= this.W || py >= this.H) return -30;
      const i = py * this.W + px;
      const scale = 0.5 * ((C.WORLD.maxX - C.WORLD.minX) / this.W + (C.WORLD.maxZ - C.WORLD.minZ) / this.H);
      return (this.classes[i] === CLS.WATER ? -this.distLand[i] : this.distWater[i]) * scale;
    },

    // Small rolling hills, sited only where there are no homes, roads or water.
    buildHills() {
      if (this.hills) return this.hills;
      const hills = [];
      const rand = CC.rng(713377);
      const W = C.WORLD;
      const self = this;
      function nearZone(name, x, z, r) {
        const q = self.zones && self.zones[name];
        if (!q) return false;
        const nx = U.clamp(x, q.x - q.w * 0.5, q.x + q.w * 0.5);
        const nz = U.clamp(z, q.z - q.h * 0.5, q.z + q.h * 0.5);
        return U.distance2D(x, z, nx, nz) < r + 6;
      }
      let attempts = 0;
      while (hills.length < 18 && attempts < 800) {
        attempts++;
        const x = U.randRange(rand, W.minX + 50, W.maxX - 50);
        const z = U.randRange(rand, W.minZ + 50, W.maxZ - 50);
        if (this.inWater(x, z)) continue;
        const cls = this.classify(x, z);
        if (cls === CLS.WATER || cls === CLS.MARSH || cls === CLS.SAND || cls === CLS.ROAD || cls === CLS.BUILDING) continue;
        const r = U.randRange(rand, 26, 54);
        const h = U.randRange(rand, 2.3, 6.2);
        if (nearZone('park', x, z, r) || nearZone('farm', x, z, r) ||
            nearZone('boardwalk', x, z, r) || nearZone('amusement', x, z, r) ||
            nearZone('gas', x, z, r) ||
            CC.serviceZoneNames().some(function (name) { return nearZone(name, x, z, r); })) continue;
        const nr = CC.nearestRoad(x, z);
        if (nr && nr.dist < r * 0.5 + nr.width * 0.5 + 6) continue;
        let ok = true;
        const buildings = this.buildings || [];
        for (let i = 0; i < buildings.length && ok; i++) {
          if (U.distance2D(x, z, buildings[i].x, buildings[i].z) < r + 14) ok = false;
        }
        const landmarks = this.landmarks || [];
        for (let i = 0; i < landmarks.length && ok; i++) {
          if (U.distance2D(x, z, landmarks[i].x, landmarks[i].z) < r + 20) ok = false;
        }
        for (let i = 0; i < hills.length && ok; i++) {
          if (U.distance2D(x, z, hills[i].x, hills[i].z) < (r + hills[i].r) * 0.78) ok = false;
        }
        if (ok) hills.push({ x: x, z: z, r: r, h: h });
      }
      this.hills = hills;
      return hills;
    },

    heightAt(x, z) {
      let h = 0.05 * Math.sin(x * 0.021) * Math.cos(z * 0.018) + 0.035 * Math.sin((x + z) * 0.05);
      const hills = this.hills;
      if (hills && hills.length) {
        let bump = 0;
        for (let i = 0; i < hills.length; i++) {
          const hill = hills[i];
          const dx = x - hill.x, dz = z - hill.z;
          const d2 = dx * dx + dz * dz;
          if (d2 < hill.r * hill.r) {
            const f = 1 - d2 / (hill.r * hill.r);
            bump += hill.h * f * f;
          }
        }
        if (bump > 0.001) {
          // Ease the climb away to nothing before it reaches the pavement.
          const nr = CC.nearestRoad(x, z);
          if (nr && nr.dist < nr.width * 0.5 + 6) {
            const f = U.clamp((nr.dist - nr.width * 0.5) / 6, 0, 1);
            bump *= f * f * (3 - 2 * f);
          }
          h += bump;
        }
      }
      return h;
    },

    surfaceAt(x, z) {
      const c = this.classify(x, z);
      if (c === CLS.ROAD) return 'paved';
      if (c === CLS.WATER) return 'water';
      if (c === CLS.SAND) return 'sand';
      return 'grass';
    },

    /* ---------- road tracing ---------- */
    findBands(profile, threshold, maxThickness) {
      const out = [];
      let start = -1;
      for (let i = 0; i < profile.length; i++) {
        if (profile[i] > threshold) {
          if (start < 0) start = i;
        } else if (start >= 0) {
          if (i - start <= maxThickness) out.push([start, i - 1]);
          start = -1;
        }
      }
      if (start >= 0 && profile.length - start <= maxThickness) out.push([start, profile.length - 1]);
      return out;
    },

    lineRuns(getClass, length, minLen, gap) {
      const runs = [];
      let start = -1, last = -1;
      for (let i = 0; i < length; i++) {
        if (getClass(i) === CLS.ROAD) {
          if (start < 0) start = i;
          last = i;
        } else if (start >= 0 && i - last > gap) {
          if (last - start + 1 >= minLen) runs.push([start, last]);
          start = -1;
        }
      }
      if (start >= 0 && last - start + 1 >= minLen) runs.push([start, last]);
      return runs;
    },

    findRoads() {
      const def = this.def, W = this.W, H = this.H;
      const cls = this.classes;
      const roads = [];
      const rowProfile = new Uint16Array(H);
      const colProfile = new Uint16Array(W);
      for (let y = 0; y < H; y++) {
        let count = 0;
        for (let x = 0; x < W; x++) if (cls[y * W + x] === CLS.ROAD) count++;
        rowProfile[y] = count;
      }
      for (let x = 0; x < W; x++) {
        let count = 0;
        for (let y = 0; y < H; y++) if (cls[y * W + x] === CLS.ROAD) count++;
        colProfile[x] = count;
      }

      const addRoad = function (points, name) {
        if (points.length < 2) return;
        roads.push({ name: name, type: 'paved', width: def.roadWidth, closed: false, points: points });
      };

      const rowThresh = Math.max(50, def.roadProjection * W);
      this.findBands(rowProfile, rowThresh, def.roadBandMax).forEach(function (band, bi) {
        const y = Math.round((band[0] + band[1]) * 0.5);
        const runs = this.lineRuns(function (x) { return cls[y * W + x]; }, W, def.roadRunMin, def.roadGap);
        runs.forEach(function (run, ri) {
          const pts = [];
          for (let x = run[0]; x <= run[1]; x += def.roadSample) pts.push([this.toWorldX(x), this.toWorldZ(y)]);
          if (pts[pts.length - 1][0] < this.toWorldX(run[1])) pts.push([this.toWorldX(run[1]), this.toWorldZ(y)]);
          addRoad(pts, 'Map Avenue ' + (bi + 1) + '.' + (ri + 1));
        }, this);
      }, this);

      const colThresh = Math.max(50, def.roadProjection * H);
      this.findBands(colProfile, colThresh, def.roadBandMax).forEach(function (band, bi) {
        const x = Math.round((band[0] + band[1]) * 0.5);
        const runs = this.lineRuns(function (y) { return cls[y * W + x]; }, H, def.roadRunMin, def.roadGap);
        runs.forEach(function (run, ri) {
          const pts = [];
          for (let y = run[0]; y <= run[1]; y += def.roadSample) pts.push([this.toWorldX(x), this.toWorldZ(y)]);
          if (pts[pts.length - 1][1] < this.toWorldZ(run[1])) pts.push([this.toWorldX(x), this.toWorldZ(run[1])]);
          addRoad(pts, 'Map Street ' + (bi + 1) + '.' + (ri + 1));
        }, this);
      }, this);

      // Longest first, so the spawn point and traffic use the main roads.
      // Cache the length once: the old comparator recomputed every point sum
      // O(n log n) times during startup.
      roads.forEach(function (road) {
        let len = 0;
        for (let i = 1; i < road.points.length; i++) {
          len += U.distance2D(road.points[i][0], road.points[i][1],
            road.points[i - 1][0], road.points[i - 1][1]);
        }
        road._length = len;
      });
      roads.sort(function (a, b) { return b._length - a._length; });
      return roads;
    },

    /* ---------- dark blocks -> rows of small trailer homes ---------- */
    findBuildings() {
      const def = this.def, W = this.W, H = this.H;
      const cell = def.buildingCell;
      const cols = Math.floor(W / cell), rows = Math.floor(H / cell);
      const mask = new Uint8Array(cols * rows);
      const cls = this.classes;
      for (let cy = 0; cy < rows; cy++) {
        for (let cx = 0; cx < cols; cx++) {
          let dark = 0;
          for (let y = 0; y < cell; y++) {
            for (let x = 0; x < cell; x++) {
              if (cls[(cy * cell + y) * W + cx * cell + x] === CLS.BUILDING) dark++;
            }
          }
          mask[cy * cols + cx] = dark / (cell * cell) > 0.28 ? 1 : 0;
        }
      }

      // Find the dark strips, then split each one into individual homes.
      const seen = new Uint8Array(mask.length);
      const blocks = [];
      const worldXPerPx = (C.WORLD.maxX - C.WORLD.minX) / W;
      const worldZPerPx = (C.WORLD.maxZ - C.WORLD.minZ) / H;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const idx = y * cols + x;
          if (!mask[idx] || seen[idx]) continue;
          const queue = [idx];
          seen[idx] = 1;
          let area = 0, minX = x, maxX = x, minY = y, maxY = y;
          for (let qi = 0; qi < queue.length; qi++) {
            const cur = queue[qi], cx = cur % cols, cy = (cur / cols) | 0;
            area++;
            if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
            if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
            const neigh = [cx > 0 ? cur - 1 : -1, cx < cols - 1 ? cur + 1 : -1, cy > 0 ? cur - cols : -1, cy < rows - 1 ? cur + cols : -1];
            for (let k = 0; k < 4; k++) {
              const ni = neigh[k];
              if (ni >= 0 && mask[ni] && !seen[ni]) { seen[ni] = 1; queue.push(ni); }
            }
          }
          if (area < def.buildingMinArea || area > def.buildingMaxArea) continue;
          const spanX = (maxX - minX + 1) * cell * worldXPerPx;
          const spanZ = (maxY - minY + 1) * cell * worldZPerPx;
          if (spanX > def.buildingMaxSpan * worldXPerPx || spanZ > def.buildingMaxSpan * worldZPerPx) continue;
          const cx = this.toWorldX((minX + maxX + 1) * 0.5 * cell);
          const cz = this.toWorldZ((minY + maxY + 1) * 0.5 * cell);
          if (this.classify(cx, cz) === CLS.WATER) continue;
          const alongX = spanX >= spanZ;
          const longSpan = alongX ? spanX : spanZ;
          const shortSpan = alongX ? spanZ : spanX;
          blocks.push({
            x: cx, z: cz, alongX: alongX, longSpan: longSpan, shortSpan: shortSpan,
            count: Math.max(1, Math.round(longSpan / def.homeSpacing)),
            rowCount: U.clamp(Math.floor(shortSpan / (def.homeWidth + 3)), 1, 3)
          });
        }
      }

      // Share the home budget across the whole park instead of filling only
      // the first few blocks.
      let estimated = 0;
      blocks.forEach(function (b) { estimated += b.count * b.rowCount; });
      const scale = estimated > def.buildingLimit ? def.buildingLimit / estimated : 1;

      const out = [];
      const rng = CC.rng(4816);
      const palette = [0xe8e3d5, 0xd9e2e4, 0xe5d8c8, 0xcdd8d0, 0xf0eadc, 0xd7d2c8];
      blocks.forEach(function (b) {
        const count = Math.max(1, Math.round(b.count * scale));
        const rowCount = Math.max(1, Math.round(b.rowCount * Math.min(1, Math.sqrt(scale))));
        for (let r = 0; r < rowCount; r++) {
          const rowOffset = b.shortSpan * ((r + 0.5) / rowCount - 0.5);
          for (let k = 0; k < count; k++) {
            const along = b.longSpan * ((k + 0.5) / count - 0.5) + (r % 2 ? def.homeSpacing * 0.5 : 0);
            const jx = U.randRange(rng, -0.7, 0.7);
            const jz = U.randRange(rng, -0.7, 0.7);
            const hx = b.x + (b.alongX ? along + jx : rowOffset + jx);
            const hz = b.z + (b.alongX ? rowOffset + jz : along + jz);
            // Roads are checked in apply(), once the picture's own network
            // has replaced the procedural roads.
            if (this.classify(hx, hz) === CLS.WATER) continue;
            out.push({
              x: hx, z: hz,
              w: b.alongX ? def.homeLength : def.homeWidth,
              l: b.alongX ? def.homeWidth : def.homeLength,
              h: U.randRange(rng, def.homeHeightMin, def.homeHeightMax),
              color: U.pick(rng, palette)
            });
            if (out.length >= def.buildingLimit) return;
          }
        }
      }, this);
      return out;
    },

    /* ---------- time trials traced along the detected roads ---------- */
    makeChallenges() {
      const candidates = CC.roadDefs
        .filter(function (r) { return r.type === 'paved' && r._length > 70; })
        .slice().sort(function (a, b) { return b._length - a._length; }).slice(0, 28);
      const picked = [];
      candidates.forEach(function (road) {
        if (picked.length >= 3) return;
        const mid = CC.sampleRoad(road, road._length * 0.5);
        const far = picked.every(function (p) { return U.distance2D(mid.x, mid.z, p.x, p.z) > 150; });
        if (far) picked.push({ road: road, x: mid.x, z: mid.z });
      });
      candidates.forEach(function (road) {
        if (picked.length >= 3 || picked.some(function (p) { return p.road === road; })) return;
        const mid = CC.sampleRoad(road, road._length * 0.5);
        picked.push({ road: road, x: mid.x, z: mid.z });
      });
      const roads = picked.map(function (p) { return p.road; });
      const names = ['Town Centre Sprint', 'Waterfront Run', 'Parkside Dash'];
      const colors = [0x62e0ff, 0xffd166, 0xff8fb1];
      this.challenges = roads.map(function (road, i) {
        const count = 5;
        const gates = [];
        for (let k = 0; k < count; k++) {
          const p = CC.sampleRoad(road, road._length * (0.1 + 0.8 * k / (count - 1)));
          gates.push([p.x, p.z]);
        }
        return { id: 'map' + i, name: names[i] || ('Map Trial ' + (i + 1)), color: colors[i], gates: gates };
      });
      return this.challenges;
    },

    /* ---------- install the overrides ---------- */
    apply() {
      if (!this.ready || this.active) return false;
      if (this.roads.length < 2) {
        console.warn('[Coastal Cruise] No roads found in the picture - using the original coastal map.');
        return false;
      }
      this.active = true;
      this.buildHills();
      const map = this;
      const riverDepthFn = CC.coast.riverDepth;
      const marshFn = CC.coast.inMarsh;
      const bridgeFn = CC.coast.onBridge;
      const riverFillDepth = function (x, z) {
        const d = riverDepthFn(x, z);
        return map.inRiverFill(x, z) ? Math.max(0.5, d) : d;
      };
      CC.coast = {
        westLine: function (z) { return map.shoreLine(z); },
        southLine: function () { return C.WORLD.maxZ; },
        riverDepth: riverFillDepth,
        inMarsh: function (x, z) {
          const d = riverFillDepth(x, z);
          return d >= 0 && d < CC.river.marshWidth;
        },
        onBridge: bridgeFn,
        isWater: function (x, z) {
          return x < map.shoreLine(z) || z > C.WORLD.maxZ || riverFillDepth(x, z) < 0;
        },
        distanceToWater: function (x, z) {
          return Math.min(x - map.shoreLine(z), C.WORLD.maxZ - z, riverFillDepth(x, z));
        }
      };
      CC.groundHeightAt = function (x, z) { return map.heightAt(x, z); };
      CC.heightAt = function (x, z) {
        return map.heightAt(x, z) + (CC.bridgeLiftAt ? CC.bridgeLiftAt(x, z) : 0);
      };
      CC.surfaceAt = function (x, z) { return map.surfaceAt(x, z); };
      if (CC.applyMapElevation) CC.applyMapElevation();
      CC.roadDefs = this.roads;
      CC.buildRoadSegments();
      // Bridge spans are derived from the active road graph. Rebuild them so
      // the enlarged map's crossings, ramps and rails line up with its roads.
      if (CC.buildBridgeSegments) CC.buildBridgeSegments();
      if (CC.clearNatureTrailCache) CC.clearNatureTrailCache();
      if (!CC.bakedMap) {
        // Keep homes off the asphalt: at build time only the original roads
        // existed, so re-check against the network traced from the picture.
        this.buildings = this.buildings.filter(function (b) {
          return CC.roadClearance(b.x, b.z, Math.max(b.w, b.l) * 0.5 + 2) >= 5.5;
        });
        CC.challengeDefs = this.makeChallenges();
      } else {
        CC.challengeDefs = this.challenges;
      }
      if (CC.World) {
        CC.World.imageMode = true;
        CC.World.imageBuildings = this.buildings;
        CC.World.imageLandmarks = this.landmarks;
        CC.World.imageTexture = this.texture;
      }
      return true;
    }
  });
})();
