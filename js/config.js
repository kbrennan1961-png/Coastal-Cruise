/* Coastal Cruise - shared constants, deterministic world math and data tables. */
(function () {
  'use strict';

  const CC = (window.CC = window.CC || {});

  const C = (CC.C = {
    SEA_LEVEL: 0,
    WORLD: { minX: -430, maxX: 430, minZ: -360, maxZ: 380 },
    GRAVITY: 22,
    COLORS: {
      skyTop: 0x6fb7e8,
      skyBottom: 0xffd9a0,
      fog: 0xf6d6a8,
      grass: 0x8fae63,
      grassDark: 0x6f9250,
      sand: 0xe8d4a2,
      sandDark: 0xcbb180,
      road: 0x5b5f66,
      roadEdge: 0xe8e2cf,
      gravel: 0xa89a7f,
      boardwalk: 0xa87b4e,
      water: 0x2d8fb5,
      waterDeep: 0x145b7d,
      foam: 0xeaf7f5,
      palm: 0x4d8a4a,
      pine: 0x3d6b4a,
      trunk: 0x8a6342,
      metal: 0xb9c1c6,
      rust: 0xa4613f
    }
  });

  // All river crossings share one opening schedule: down for 15 minutes,
  // up for 5 minutes. Every span is a drawbridge now; the whole leaf lifts
  // during the opening window so cargo ships can pass any crossing.
  CC.BRIDGE = {
    // Deck height above sea level. Draw leaves lift another 13 m on top.
    deckHeight: 10.5,
    // Filled in by markDrawbridges() once the active spans are known.
    drawCount: 0,
    downSeconds: 15 * 60,
    upSeconds: 5 * 60,
    warningSeconds: 35,
    transitionSeconds: 10,
    drawLift: 13,
    // A long, smooth run-up keeps the elevated deck from looking like a step.
    approachLength: 28
  };

  // One place to tune the feel of the world. The specs keep their relative
  // hierarchy (bike quickest, bus slowest), while these multipliers set the
  // overall arcade pace for the player, traffic and people on foot.
  CC.pace = {
    vehicle: 1.62,
    pedestrian: 1.58,
    traffic: 1.28,
    walker: 1.35
  };

  /* ---------- small utilities ---------- */
  const util = (CC.util = {
    clamp(v, a, b) { return v < a ? a : v > b ? b : v; },
    lerp(a, b, t) { return a + (b - a) * t; },
    damp(a, b, lambda, dt) { return util.lerp(a, b, 1 - Math.exp(-lambda * dt)); },
    smoothstep(e0, e1, x) {
      const t = util.clamp((x - e0) / (e1 - e0), 0, 1);
      return t * t * (3 - 2 * t);
    },
    randRange(rng, a, b) { return a + rng() * (b - a); },
    pick(rng, arr) { return arr[Math.floor(rng() * arr.length) % arr.length]; },
    angleLerp(a, b, t) {
      let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
      if (d < -Math.PI) d += Math.PI * 2;
      return a + d * t;
    },
    distance2D(ax, az, bx, bz) { return Math.hypot(ax - bx, az - bz); },
    // `out` lets tight loops reuse a scratch object instead of allocating one
    // per segment. The default keeps the original allocating behaviour for
    // callers that hold on to the result.
    distanceToSegment(px, pz, ax, az, bx, bz, out) {
      const o = out || {};
      const dx = bx - ax, dz = bz - az;
      const l2 = dx * dx + dz * dz;
      if (l2 < 1e-6) {
        o.dist = Math.hypot(px - ax, pz - az);
        o.t = 0; o.x = ax; o.z = az; o.dx = 0; o.dz = 1;
        return o;
      }
      let t = ((px - ax) * dx + (pz - az) * dz) / l2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const x = ax + dx * t, z = az + dz * t;
      o.dist = Math.hypot(px - x, pz - z);
      o.t = t; o.x = x; o.z = z;
      const inv = 1 / Math.sqrt(l2);
      o.dx = dx * inv; o.dz = dz * inv;
      return o;
    },
    formatTime(sec) {
      if (sec == null) return '--:--.--';
      const m = Math.floor(sec / 60);
      const s = Math.floor(sec % 60);
      const cs = Math.floor((sec * 100) % 100);
      return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') + '.' + String(cs).padStart(2, '0');
    }
  });

  CC.rng = function (seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /* ---------- coastline ---------- */
  function westLine(z) {
    return -285 + 12 * Math.sin(z * 0.018) + 6 * Math.sin(z * 0.051 + 1.1);
  }
  function southLine(x) {
    return 275 + 10 * Math.sin(x * 0.021 + 2.0) + 5 * Math.sin(x * 0.047 + 0.6);
  }

  // The river is defined once here and consumed by both the procedural coast
  // and the baked image map. Widths are half-widths; the short north-south
  // reach at the mouth lets the relocated North Cross bridge meet the channel
  // at a right angle while the road itself stays clear of the airport apron.
  // The bend beside Bay Liquor sits west of the junction so the crossroads
  // itself stays on dry land while both roads still bridge the channel.
  CC.river = {
    marshWidth: 26,
    points: [
      { x: 180, z: -352, w: 13 }, { x: 196, z: -285, w: 14 },
      { x: 200, z: -250, w: 14 }, { x: 142, z: -210, w: 12 },
      { x: 132, z: -145, w: 13 }, { x: 152, z: -75, w: 14 },
      { x: 125, z: -10, w: 18 }, { x: 145, z: 60, w: 19 },
      { x: 145, z: 110, w: 20 }, { x: 110, z: 155, w: 21 },
      { x: 90, z: 210, w: 23 }, { x: 20, z: 225, w: 24 },
      { x: -100, z: 240, w: 26 }, { x: -175, z: 252, w: 28 },
      { x: -235, z: 264, w: 30 }, { x: -300, z: 272, w: 32 },
      { x: -360, z: 278, w: 34 }
    ]
  };
  const _riverScratch = { dist: 0, t: 0, x: 0, z: 0, dx: 0, dz: 0 };
  function riverDepth(x, z) {
    let best = Infinity;
    const pts = CC.river.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const r = util.distanceToSegment(x, z, a.x, a.z, b.x, b.z, _riverScratch);
      const w = util.lerp(a.w, b.w, r.t);
      if (r.dist - w < best) best = r.dist - w;
    }
    return best;
  }
  function inMarsh(x, z) {
    const d = riverDepth(x, z);
    return d >= 0 && d < CC.river.marshWidth;
  }
  const _bridgeScratch = { dist: 0, t: 0, x: 0, z: 0, dx: 0, dz: 0 };
  function onBridge(x, z, margin) {
    const segs = CC.bridgeSegments || [];
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      const r = util.distanceToSegment(x, z, s.ax, s.az, s.bx, s.bz, _bridgeScratch);
      if (r.dist <= s.width * 0.5 + (margin || 0)) return true;
    }
    return false;
  }
  CC.coast = {
    westLine,
    southLine,
    riverDepth,
    inMarsh,
    onBridge,
    isWater(x, z) { return x < westLine(z) || z > southLine(x) || riverDepth(x, z) < 0; },
    distanceToWater(x, z) {
      return Math.min(x - westLine(z), southLine(x) - z, riverDepth(x, z));
    }
  };

  // Broad east-side loop joining the relocated mouth crossing to Main Street.
  // These points are shared by the baked-road override and the vegetation
  // clearance zones, so the road, terrain paint and trees all agree.
  const riverLoopPoints = [];
  CC.riverLoopPoints = function () { return []; };
  CC.riverLoopZones = function () { return {}; };

  /* ---------- river port and shipping lane ----------
     Ships enter from the ocean at the west end and follow the river centreline
     up to a single container berth on the west bank. Buoys are precomputed here
     so the builder and the traffic system share one source of truth. */
  // The inbound berth sits at the north dock; the permanently berthed freighter
  // is moored further south so visiting ships do not overlap it.
  const berth = { x: 144, z: -185, w: 13 };
  const shipLane = [{ x: -410, z: 286, w: 40 }]
    .concat(CC.river.points.slice().reverse());
  let berthIndex = shipLane.length;
  for (let i = 2; i < shipLane.length; i++) {
    if (shipLane[i].z < berth.z) { berthIndex = i; break; }
  }
  shipLane.splice(berthIndex, 0, berth);
  CC.port = {
    x: 116, z: -196, w: 72, h: 80,
    berthX: berth.x, berthZ: berth.z,
    berthIndex: berthIndex,
    dwellSeconds: 14
  };
  CC.shipRoute = shipLane;
  CC.shipBerthIndex = berthIndex;

  const channelMarkers = [];
  const markerSpacing = 46;
  for (let i = 0; i < berthIndex; i++) {
    const a = shipLane[i], b = shipLane[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const dx = (b.x - a.x) / len, dz = (b.z - a.z) / len;
    // Returning ships travel from shipLane[0] toward the berth. Red is on
    // their right, green on their left (IALA red-right-returning).
    const rx = -dz, rz = dx;
    const offset = Math.max(7, Math.min(util.lerp(a.w, b.w, 0.5) * 0.72, 18));
    for (let d = 20; d < len - 4; d += markerSpacing) {
      const t = d / len;
      const cx = util.lerp(a.x, b.x, t), cz = util.lerp(a.z, b.z, t);
      channelMarkers.push({ x: cx + rx * offset, z: cz + rz * offset, color: 'red' });
      channelMarkers.push({ x: cx - rx * offset, z: cz - rz * offset, color: 'green' });
    }
  }
  CC.channelMarkers = channelMarkers;

  /* ---------- image map settings ----------
     When `map.png` loads successfully, js/imagemap.js uses these thresholds to
     classify pixels into water / grass / road / building, then generates the
     road network, obstacles and time trials from the picture. If the image is
     missing or fails to load, the original procedural coastal map is used. */
  CC.imageMapDef = {
    src: 'map.png',
    // Colour classification (tuned for a pastel top-down map; tweak to suit a new picture).
    waterBlue: 12,          // b - r above this, and b - g above waterGreen => water
    waterGreen: 8,
    grassRed: 2,            // g - r above this, and g - b above grassBlue => grass
    grassBlue: 2,
    roadMin: 215,           // all channels >= this and roughly neutral => road
    buildingMax: 205,       // neutral dark pixels => building
    sandRing: 7,            // pixels of "beach" around water
    // Road tracing
    roadProjection: 0.18,   // fraction of image width/height needed to call a row/column a road
    roadBandMax: 30,        // px; thicker bands are intersections/dense areas, skipped
    roadRunMin: 50,         // px; shortest usable road segment
    roadGap: 18,            // px; gaps bridged inside a road line
    roadSample: 36,         // px; spacing of generated road waypoints
    roadWidth: 8,           // world units
    // Buildings
    buildingCell: 4,        // px per downsample cell for building detection
    buildingMinArea: 6,     // cells
    buildingMaxArea: 900,
    buildingMaxSpan: 340,   // px (long dark strips are split into individual homes)
    buildingLimit: 240,
    homeSpacing: 13,        // world units between trailer homes along a block
    homeWidth: 5,           // short side of a small trailer home
    homeLength: 10,         // long side of a small trailer home
    homeHeightMin: 2.3,
    homeHeightMax: 3.4,
    lawnMargin: 3           // green grass surrounding each home
  };

  /* ---------- road network ---------- */
  CC.roadDefs = [
    {
      name: 'Coastal Highway', type: 'paved', width: 16, closed: false,
      points: [[-170, -250], [-150, -160], [-188, -60], [-162, 40], [-198, 130], [-165, 215], [-120, 255]]
    },
    {
      name: 'Palm Loop', type: 'paved', width: 14, closed: false,
      points: [[260, -310], [305, -225], [278, -130], [318, -35], [298, 60], [330, 150], [286, 234], [275, 230], [160, 265], [40, 250], [20, 180]]
    },
    {
      name: 'North Cross', type: 'paved', width: 12, closed: false,
      points: [[-150, -160], [-20, -178], [120, -150], [260, -310]]
    },
    {
      name: 'Main Street', type: 'paved', width: 13, closed: false,
      points: [[-188, -60], [-30, -30], [140, -60], [318, -35]]
    },
    {
      name: 'South Cross', type: 'paved', width: 13, closed: false,
      points: [[-198, 130], [-40, 110], [120, 140], [330, 150]]
    },
    {
      name: 'Cul-de-sac East', type: 'paved', width: 11, closed: false,
      points: [[140, -60], [172, -128]]
    },
    {
      name: 'Cul-de-sac South', type: 'paved', width: 11, closed: false,
      points: [[120, 140], [152, 202], [167, 183], [204, 218], [228, 200]]
    },
    {
      name: 'Gravel Shortcut', type: 'gravel', width: 9, closed: false,
      points: [[-120, 255], [-45, 205], [20, 180]]
    },
    {
      name: 'Dune Track', type: 'dirt', width: 8, closed: false,
      points: [[-162, 40], [-216, 78], [-252, 142], [-200, 202], [-120, 255]]
    },
    {
      name: 'Beach Boardwalk North', type: 'boardwalk', width: 5, closed: false,
      points: [[-188, -60], [-222, -68], [-262, -82], [-302, -92], [-332, -98]]
    },
    {
      name: 'Beach Boardwalk South', type: 'boardwalk', width: 5, closed: false,
      points: [[-198, 130], [-238, 148], [-278, 166], [-318, 176]]
    }
  ];

  // Precompute segment data; used for surface queries, flattening and NPCs.
  // Called again by the image map after it generates a new road network.
  CC.roadPointAt = function (road, i) {
    const n = road.points.length;
    if (!n) return null;
    return road.points[road.closed ? ((i % n) + n) % n : i];
  };

  CC.buildRoadSegments = function () {
    CC.roadSegments = [];
    CC.roadDefs.forEach(function (road, ri) {
      road._index = ri;
      road._cum = [0];
      const count = road.points.length - (road.closed ? 0 : 1);
      for (let i = 0; i < count; i++) {
        const a = CC.roadPointAt(road, i), b = CC.roadPointAt(road, i + 1);
        if (!a || !b) continue;
        const dx = b[0] - a[0], dz = b[1] - a[1];
        const len = Math.hypot(dx, dz) || 1;
        CC.roadSegments.push({
          ax: a[0], az: a[1], bx: b[0], bz: b[1],
          dx: dx / len, dz: dz / len, len,
          width: road.width, type: road.type, roadIndex: ri, segIndex: i,
          oneWay: road.oneWay || 0
        });
        road._cum.push(road._cum[i] + len);
      }
      road._length = road._cum[road._cum.length - 1];
    });
    CC.buildBridgeSegments();
    if (CC.clearChapelDrivewayCache) CC.clearChapelDrivewayCache();
  };

  // A bridge is generated wherever a drivable road crosses the river channel
  // (or its immediate bank). Deck spans extend past the water onto dry land.
  // Sampling in arc length and merging nearby wet runs keeps one continuous
  // crossing per road instead of restarting a ramp at every waypoint.
  CC.buildBridgeSegments = function () {
    const spans = [];
    const reach = CC.BRIDGE.approachLength || 46;
    const mergeGap = Math.min(reach * 0.6, 28);

    function roadPointAt(road, s) {
      const cum = road._cum;
      const pts = road.points;
      const length = road._length || cum[cum.length - 1];
      if (!cum || cum.length < 2) return { x: pts[0][0], z: pts[0][1] };
      s = util.clamp(s, 0, length);
      let i = 0;
      while (i < cum.length - 2 && cum[i + 1] < s) i++;
      const segLen = (cum[i + 1] - cum[i]) || 1;
      const t = util.clamp((s - cum[i]) / segLen, 0, 1);
      const a = pts[i], b = pts[i + 1];
      return {
        x: util.lerp(a[0], b[0], t),
        z: util.lerp(a[1], b[1], t)
      };
    }

    (CC.roadDefs || []).forEach(function (road, ri) {
      if (road.type === 'boardwalk' || !road.points || road.points.length < 2) return;
      const length = road._length || 0;
      if (length < 8) return;
      // Palm Loop crosses river at grade in this area; support with pylons, no bridge deck.
      if (road.name === 'Palm Loop') return;
      // North Cross is a fixed high bridge; give it a much longer approach so
      // vehicles climb gradually instead of hitting a steep ramp.
      const spanReach = road.name === 'North Cross' ? 120 : reach;
      const wet = [];
      for (let i = 0; i < road.points.length - 1; i++) {
        const a = road.points[i], b = road.points[i + 1];
        const segLen = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const startS = road._cum ? road._cum[i] : 0;
        for (let s = 0; s <= segLen; s += 3) {
          const x = util.lerp(a[0], b[0], s / segLen);
          const z = util.lerp(a[1], b[1], s / segLen);
          wet.push({ s: startS + s, crossing: riverDepth(x, z) < 5 });
        }
      }
      const endPt = road.points[road.points.length - 1];
      wet.push({ s: length, crossing: riverDepth(endPt[0], endPt[1]) < 5 });
      wet.sort(function (a, b) { return a.s - b.s; });

      const runs = [];
      let current = null;
      wet.forEach(function (sample) {
        if (!sample.crossing) return;
        if (!current) {
          current = { start: sample.s, end: sample.s };
          runs.push(current);
        } else if (sample.s - current.end <= mergeGap) {
          current.end = sample.s;
        } else {
          current = { start: sample.s, end: sample.s };
          runs.push(current);
        }
      });

      runs.forEach(function (run) {
        let s0 = Math.max(0, run.start - spanReach);
        let s1 = Math.min(length, run.end + spanReach);
        if (road.name === 'Main Street') s0 = Math.max(s0, 298);
        if (road.name === 'Main Street') s1 = Math.min(s1, 395);
        if (s1 - s0 <= 4) return;
        const a = roadPointAt(road, s0), b = roadPointAt(road, s1);
        const midZ = (a.z + b.z) * 0.5;
        // Remove every bridge and river crossing north of X122 Z-38, unless
        // the offline map editor explicitly placed a bridge there.
        const editorRoad = CC.roadDefs[ri] || {};
        if (editorRoad.forceBridge !== true && midZ < -38) return;
        spans.push({
          ax: a.x, az: a.z, bx: b.x, bz: b.z,
          width: road.width, type: road.type, roadIndex: ri,
          waterStart: run.start - s0, waterEnd: run.end - s0
        });
      });
    });
    spans.forEach(function (s) {
      const road = (CC.roadDefs && CC.roadDefs[s.roadIndex]) || {};
      if (road.name === 'North Cross') {
        const cx = (s.ax + s.bx) * 0.5, cz = (s.az + s.bz) * 0.5;
        // Crossing near requested coordinates: low road over water, no tall elevated bridge.
        if (Math.hypot(cx - 199, cz - (-268)) < 140) s.lowWaterCrossing = true;
      }
    });
    CC.bridgeSegments = spans;
    CC.markDrawbridges();
    // Mark requested bascule replacements early so world build uses them.
    const basculeTargets = [{x:138,z:-40},{x:96,z:180}];
    basculeTargets.forEach(function (t) {
      let best = null, bestD = Infinity;
      spans.forEach(function (s) {
        if (!s.drawbridge) return;
        const r = CC.util.distanceToSegment(t.x, t.z, s.ax, s.az, s.bx, s.bz);
        if (r.dist < bestD) { bestD = r.dist; best = s; }
      });
      if (best && bestD < 80) best.bascule = true;
    });
    return spans;
  };

  // River crossings are drawbridges except the northernmost North Cross
  // bridge, which stays fixed so ships do not travel to the top of the map.
  CC.markDrawbridges = function () {
    const spans = CC.bridgeSegments || [];
    spans.forEach(function (s) { s.drawbridge = false; s.drawbridgeIndex = -1; });
    const draw = spans.filter(function (s) {
      const road = (CC.roadDefs && CC.roadDefs[s.roadIndex]) || {};
      return road.name !== 'North Cross';
    }).sort(function (a, b) {
      return ((a.ax + a.bx) - (b.ax + b.bx)) * 0.5;
    });
    CC.BRIDGE.drawCount = draw.length;
    draw.forEach(function (s, i) {
      s.drawbridge = true;
      s.drawbridgeIndex = i;
      s.centerX = (s.ax + s.bx) * 0.5;
      s.centerZ = (s.az + s.bz) * 0.5;
    });
  };

  CC.buildRoadSegments();

  const _roadScratch = { dist: 0, t: 0, x: 0, z: 0, dx: 0, dz: 0 };
  const ROAD_CELL = 48;
  let roadIndex = null, roadIndexSegments = null, roadIndexCount = -1;
  let roadQueryStamp = 0;

  // Road lookups happen several times per vehicle and walker every frame, so
  // bucket segments into cells. A 5x5 cell search is enough for every road-side
  // query; sparse spots fall back to the full scan.
  function ensureRoadIndex() {
    const segs = CC.roadSegments || [];
    if (roadIndex && roadIndexSegments === segs && roadIndexCount === segs.length) {
      return roadIndex;
    }
    roadIndex = Object.create(null);
    roadIndexSegments = segs;
    roadIndexCount = segs.length;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      const pad = s.width * 0.5 + 2;
      const minX = Math.floor((Math.min(s.ax, s.bx) - pad) / ROAD_CELL);
      const maxX = Math.floor((Math.max(s.ax, s.bx) + pad) / ROAD_CELL);
      const minZ = Math.floor((Math.min(s.az, s.bz) - pad) / ROAD_CELL);
      const maxZ = Math.floor((Math.max(s.az, s.bz) + pad) / ROAD_CELL);
      for (let gx = minX; gx <= maxX; gx++) {
        for (let gz = minZ; gz <= maxZ; gz++) {
          const key = gx + ',' + gz;
          (roadIndex[key] || (roadIndex[key] = [])).push(s);
        }
      }
    }
    return roadIndex;
  }

  function scanRoadSegments(list, x, z, typeFilter, state) {
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (s._roadQueryStamp === state.stamp) continue;
      s._roadQueryStamp = state.stamp;
      if (typeFilter && s.type !== typeFilter) continue;
      const r = util.distanceToSegment(x, z, s.ax, s.az, s.bx, s.bz, _roadScratch);
      if (r.dist < state.bestDist) {
        state.bestDist = r.dist; state.bestSeg = s;
        state.bestX = r.x; state.bestZ = r.z;
      }
    }
  }

  CC.nearestRoad = function (x, z, typeFilter) {
    const segs = CC.roadSegments || [];
    if (!segs.length) return null;
    const index = ensureRoadIndex();
    const state = {
      stamp: ++roadQueryStamp, bestDist: Infinity, bestSeg: null,
      bestX: 0, bestZ: 0
    };
    const cx = Math.floor(x / ROAD_CELL), cz = Math.floor(z / ROAD_CELL);
    for (let ring = 0; ring <= 2; ring++) {
      for (let gx = cx - ring; gx <= cx + ring; gx++) {
        for (let gz = cz - ring; gz <= cz + ring; gz++) {
          if (ring > 0 && Math.abs(gx - cx) !== ring && Math.abs(gz - cz) !== ring) continue;
          const bucket = index[gx + ',' + gz];
          if (bucket) scanRoadSegments(bucket, x, z, typeFilter, state);
        }
      }
      if (state.bestSeg && state.bestDist <= ROAD_CELL) break;
    }
    if (!state.bestSeg || state.bestDist > ROAD_CELL) {
      scanRoadSegments(segs, x, z, typeFilter, state);
    }
    if (!state.bestSeg) return null;
    const seg = state.bestSeg;
    return {
      dist: state.bestDist, x: state.bestX, z: state.bestZ,
      dx: seg.dx, dz: seg.dz, width: seg.width, type: seg.type,
      roadIndex: seg.roadIndex, segIndex: seg.segIndex
    };
  };

  // Signed clearance from a footprint centred at (x,z) to the nearest road
  // surface. 1.8 m is the rendered shoulder width, so a positive result means
  // the footprint is clear of both asphalt and its dark verge.
  const _clearScratch = { dist: 0, t: 0, x: 0, z: 0, dx: 0, dz: 0 };
  CC.roadClearance = function (x, z, extent) {
    let best = Infinity;
    const segs = CC.roadSegments || [];
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      const r = util.distanceToSegment(x, z, s.ax, s.az, s.bx, s.bz, _clearScratch);
      const gap = r.dist - s.width * 0.5 - 1.8 - (extent || 0);
      if (gap < best) best = gap;
    }
    return best;
  };

  // Static scenery gets a small spatial index so walkers and drivers can test
  // only nearby objects instead of scanning every tree each frame.
  const OBSTACLE_CELL = 18;
  // Numeric keys avoid building a string for every bucket on every query.
  function obstacleKey(cx, cz) { return (cx + 512) * 4096 + (cz + 512); }
  let obstacleIndex = null;
  let obstacleListRef = null;
  let obstacleCount = -1;

  function ensureObstacleIndex() {
    const list = (CC.World && CC.World.obstacles) || [];
    if (obstacleIndex && obstacleListRef === list && obstacleCount === list.length) {
      return obstacleIndex;
    }
    obstacleIndex = Object.create(null);
    obstacleListRef = list;
    obstacleCount = list.length;
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (!o || !isFinite(o.x) || !isFinite(o.z) || !(o.r > 0)) continue;
      const minX = Math.floor((o.x - o.r) / OBSTACLE_CELL);
      const maxX = Math.floor((o.x + o.r) / OBSTACLE_CELL);
      const minZ = Math.floor((o.z - o.r) / OBSTACLE_CELL);
      const maxZ = Math.floor((o.z + o.r) / OBSTACLE_CELL);
      for (let cx = minX; cx <= maxX; cx++) {
        for (let cz = minZ; cz <= maxZ; cz++) {
          const key = obstacleKey(cx, cz);
          (obstacleIndex[key] || (obstacleIndex[key] = [])).push(o);
        }
      }
    }
    return obstacleIndex;
  }

  // Animals and pedestrians may push through brush; cars and people on the
  // boardwalk may not walk through buildings, rocks, signs or parked boats.
  CC.inWoods = function (x, z) {
    const IM = CC.ImageMap;
    const forests = (IM && IM.zones && IM.zones.forest) || [];
    for (let i = 0; i < forests.length; i++) {
      const f = forests[i];
      if (f && isFinite(f.x) && isFinite(f.z) && f.r > 0 &&
          Math.hypot(x - f.x, z - f.z) < f.r * 1.02) return true;
    }
    return !!(IM && IM.classify && IM.CLS && IM.classify(x, z) === IM.CLS.FOREST);
  };

  CC.forEachNearbyObstacle = function (x, z, range, fn) {
    const index = ensureObstacleIndex();
    const cells = Math.ceil((range || 6) / OBSTACLE_CELL) + 1;
    const cc = Math.floor(x / OBSTACLE_CELL);
    const cz = Math.floor(z / OBSTACLE_CELL);
    const seen = CC.forEachNearbyObstacle._seen ||
      (CC.forEachNearbyObstacle._seen = new Set());
    seen.clear();
    for (let ix = cc - cells; ix <= cc + cells; ix++) {
      for (let iz = cz - cells; iz <= cz + cells; iz++) {
        const bucket = index[obstacleKey(ix, iz)];
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) {
          const o = bucket[i];
          if (seen.has(o) || o.disabled) continue;
          seen.add(o);
          fn(o);
        }
      }
    }
  };

  // Move a point around static scenery while preserving the tangential part
  // of its intended step, so walkers and drivers slide past objects instead
  // of clipping straight through them. `allowWoods` lets pedestrians ignore
  // trees in forest zones only; every other object stays solid.
  CC.resolveObstacleSlide = function (pos, oldX, oldZ, radius, opts) {
    const options = opts || {};
    const padding = options.padding == null ? 0.08 : options.padding;
    const allowWoods = options.allowWoods !== false;
    let hit = null;
    for (let pass = 0; pass < 2; pass++) {
      let moved = false;
      CC.forEachNearbyObstacle(pos.x, pos.z, radius + 24, function (o) {
        if (o.type === 'tree') {
          // Trees never move, so the forest lookup is done once per object.
          if (o._inWoods == null) o._inWoods = CC.inWoods(o.x, o.z);
          if (allowWoods && o._inWoods) return;
        }
        const minD = o.r + radius + padding;
        let dx = pos.x - o.x, dz = pos.z - o.z;
        let d = Math.hypot(dx, dz);
        if (d >= minD) return;
        if (d < 0.0001) {
          dx = pos.x - oldX; dz = pos.z - oldZ;
          d = Math.hypot(dx, dz);
          if (d < 0.0001) { dx = 1; dz = 0; d = 1; }
        }
        const nx = dx / d, nz = dz / d;
        const vx = pos.x - oldX, vz = pos.z - oldZ;
        const inward = vx * nx + vz * nz;
        let slideX = 0, slideZ = 0;
        if (inward < 0) {
          slideX = vx - inward * nx;
          slideZ = vz - inward * nz;
          const slideLen = Math.hypot(slideX, slideZ);
          const maxSlide = Math.hypot(vx, vz);
          if (slideLen > maxSlide && slideLen > 0.0001) {
            slideX *= maxSlide / slideLen;
            slideZ *= maxSlide / slideLen;
          }
        }
        pos.x = o.x + nx * minD + slideX;
        pos.z = o.z + nz * minD + slideZ;
        moved = true;
        if (!hit) hit = { obstacle: o, nx: nx, nz: nz };
      });
      if (!moved) break;
    }
    return hit ? { hit: true, obstacle: hit.obstacle, nx: hit.nx, nz: hit.nz } : null;
  };

  // Small fenced trailhead beside the north woods. Kept in one place so the
  // terrain painter, tree placer and sign builders all use the same site.
  CC.trailheadZone = function () {
    return { x: -80, z: 305, w: 28, h: 22 };
  };

  // Cleared sites for the community buildings added to the baked town map.
  // Keeping them here means the terrain painter, tree/hill generators, nature
  // trails and 3D builders all use exactly the same footprints.
  let serviceZoneCache = null;
  let serviceZoneNameCache = null;
  CC.serviceZones = function () {
    if (!serviceZoneCache) {
      serviceZoneCache = Object.assign({
        nightclub: { x: -240, z: 30, w: 46, h: 36 },
        pawn: { x: -210, z: -120, w: 40, h: 32 },
        liquor: { x: 214, z: -176, w: 40, h: 32 },
        postOffice: { x: 0, z: 90, w: 46, h: 36 },
        police: { x: 200, z: 20, w: 52, h: 44 },
        massage: { x: -60, z: 100, w: 40, h: 32 },
        gunStore: { x: -10, z: -130, w: 40, h: 32 },
        chinese: { x: 70, z: 70, w: 46, h: 36 },
        waterTower: { x: 38, z: 136, w: 34, h: 34 },
        treatment: { x: 380, z: -180, w: 100, h: 90 },
        fuelStorage: { x: 380, z: 100, w: 90, h: 80 },
        airport: { x: 20, z: -320, w: 200, h: 70 },
        cemetery: { x: 130, z: 340, w: 90, h: 70 },
        // church removed per request
        hospital: { x: 220, z: 140, w: 60, h: 48 },
        boatyard: { x: -290, z: 20, w: 44, h: 60 },
        dogpark: { x: -112, z: 140, w: 48, h: 40 },
        powerStation: { x: 385, z: 190, w: 82, h: 66 },
        satellite: { x: 325, z: 120, w: 18, h: 42 },
        airDefense: { x: 328, z: 276, w: 56, h: 48 },
        walmart: { x: 385, z: -70, w: 90, h: 105 },
        nuclear: { x: 250, z: -70, w: 56, h: 50 },
        walkingStream: { x: 120, z: 280, w: 60, h: 40 },
        beaconSeafood: { x: -300, z: 216, w: 66, h: 42 },
        // Small realty office on the north side of Main Street. The frontage
        // faces south toward the road so the sign and driveway stay visible.
        realty: { x: -90, z: -18, w: 36, h: 30 },
        port: { x: CC.port.x, z: CC.port.z, w: CC.port.w, h: CC.port.h },
        motel: { x: -20, z: 140, w: 52, h: 42 }
      });
      serviceZoneNameCache = Object.freeze(Object.keys(serviceZoneCache));
    }
    return Object.assign({}, serviceZoneCache);
  };
  CC.serviceZoneNames = function () {
    if (!serviceZoneCache) CC.serviceZones();
    return serviceZoneNameCache;
  };

  // Permanent ponds layered onto the baked terrain. The first one sits just
  // east of the community park, close enough to walk the dogs but outside all
  // of its ball fields and playgrounds. Each pond is injected into the baked
  // zone list before terrain painting, so water, swimming and the animated
  // water mask all agree without shipping a new image map.
  const pondDefs = [
    { name: 'Willow Pond', x: 36, z: 307, r: 24, park: true },
    { name: 'Heron Pond', x: 224, z: 84, r: 24 },
    { name: 'East Pond', x: 396, z: 256, r: 24 }
  ];
  CC.pondDefs = function () {
    return pondDefs.map(function (p) { return Object.assign({}, p); });
  };

  // A compact Army compound tucked into the north-west corner of the airport
  // apron. It is the muster point for the marching platoons.
  CC.militaryOutpost = function () {
    const a = CC.serviceZones().airport;
    // The compound gate faces the airport's own +z gate, so yaw stays at zero.
    return { x: a.x - 86, z: a.z + 18, yaw: 0 };
  };

  // Parade destinations are spread across the whole island. Each platoon works
  // through this list in turn, walks the road graph to the site, pauses, then
  // follows the same streets back to the outpost.
  CC.platoonDestinations = function () {
    const z = CC.serviceZones();
    return [
      { name: 'Post Office', x: z.postOffice.x, z: z.postOffice.z },

      { name: 'Police Station', x: z.police.x, z: z.police.z },
      { name: 'Hospital', x: z.hospital.x, z: z.hospital.z },
      { name: 'Dog Park', x: z.dogpark.x, z: z.dogpark.z },
      { name: 'Walmart', x: z.walmart.x, z: z.walmart.z },
      { name: 'Beacon Seafood', x: z.beaconSeafood.x, z: z.beaconSeafood.z },
      { name: 'Boatyard', x: z.boatyard.x, z: z.boatyard.z },
      { name: 'Power Station', x: z.powerStation.x, z: z.powerStation.z },
      { name: 'Air Defense', x: z.airDefense.x, z: z.airDefense.z },
      { name: 'Cemetery', x: z.cemetery.x, z: z.cemetery.z },
      { name: 'Nightclub', x: z.nightclub.x, z: z.nightclub.z }
    ];
  };

  // Downtown transit loop. The legs meet at existing paved junctions, so buses
  // can circulate forever without teleporting or reversing at a dead end.
  function roadStation(road, x, z) {
    let best = { dist: Infinity, s: 0 };
    for (let i = 0; i < road.points.length - 1; i++) {
      const a = road.points[i], b = road.points[i + 1];
      const vx = b[0] - a[0], vz = b[1] - a[1];
      const len2 = vx * vx + vz * vz || 1;
      const t = util.clamp(((x - a[0]) * vx + (z - a[1]) * vz) / len2, 0, 1);
      const px = a[0] + vx * t, pz = a[1] + vz * t;
      const dist = Math.hypot(x - px, z - pz);
      if (dist < best.dist) best = { dist: dist, s: (road._cum[i] || 0) + t * Math.sqrt(len2) };
    }
    return best.s;
  }
  CC.busRouteLegs = function () {
    const r = CC.roadDefs;
    // Blank standalone maps have no baked bus loop.
    if (!r || r.length < 5) return [];
    return [
      { road: 3, from: 0, to: roadStation(r[3], 318, -35), dir: 1 },
      { road: 1, from: roadStation(r[1], 318, -35), to: roadStation(r[1], 330, 150), dir: 1 },
      { road: 4, from: roadStation(r[4], 330, 150), to: roadStation(r[4], -198, 130), dir: -1 },
      { road: 0, from: roadStation(r[0], -198, 130), to: roadStation(r[0], -188, -60), dir: -1 }
    ];
  };
  CC.busStopDefs = function () {
    return [
      { name: 'Harbor Gate', road: 3, s: 90, leg: 0 },
      { name: 'Main Street', road: 3, s: 240, leg: 0 },
      { name: 'Civic Center', road: 3, s: 420, leg: 0 },
      { name: 'Palm & Main', road: 1, s: 335, leg: 1 },
      { name: 'Palm Gardens', road: 1, s: 400, leg: 1 },
      { name: 'North Shops', road: 1, s: 465, leg: 1 },
      { name: 'Palm Junction', road: 4, s: 430, leg: 2 },
      { name: 'South Cross', road: 4, s: 320, leg: 2 },
      { name: 'Chapel Road', road: 4, s: 90, leg: 2 },
      { name: 'Hillcrest', road: 0, s: 455, leg: 3 },
      { name: 'Motel Row', road: 0, s: 395, leg: 3 },
      { name: 'Old Pier Road', road: 0, s: 330, leg: 3 }
    ];
  };
  // Shared by the builder and the vegetation passes so trees are never planted
  // through a shelter or its waiting area.
  CC.busStopPoints = function () {
    const legs = CC.busRouteLegs();
    return CC.busStopDefs().map(function (def) {
      const road = CC.roadDefs[def.road], leg = legs[def.leg];
      if (!road || !leg || !road._length) return null;
      const p = CC.sampleRoad(road, util.clamp(def.s, 0, road._length));
      const sx = -p.dz * leg.dir, sz = p.dx * leg.dir;
      const off = road.width * 0.5 + 4.2;
      return { x: p.x + sx * off, z: p.z + sz * off };
    }).filter(Boolean);
  };

  // Chapel removed.
  CC.clearChapelDrivewayCache = function () {};
  CC.chapelDriveway = function () { return null; };
  CC.chapelDrivewayClearance = 0;
  CC.nearChapelDriveway = function () { return false; };

  // Optional presentation media. All paths are relative local files, so they
  // work when index.html is double-clicked from file://. Missing files simply
  // leave the original splash/card flow in place.
  CC.mediaDef = {
    splashImage: 'media/splash.png',
    introVideos: ['media/intro.webm', 'media/intro.mp4']
  };

  // Respawn points used by the Busted and Wasted outcomes. Both sit inside a
  // cleared service-zone footprint so the pedestrian never appears in a tree.
  CC.policeSpawn = { x: 200, z: 2, heading: Math.PI };
  CC.hospitalSpawn = { x: 220, z: 160, heading: 0 };

  // Meandering nature trails, shared by the terrain painter and tree placer.
  // Each trail is split into runs so it stops before reaching any road, water
  // or built-up zone instead of cutting straight through the woods.
  let trailZoneCache = null;
  CC.natureTrailPaths = function () {
    const IM = CC.ImageMap;
    const forests = (IM && IM.zones && IM.zones.forest) || [];
    const result = [];
    if (!trailZoneCache) {
      trailZoneCache = Object.freeze(
        ['park', 'farm', 'boardwalk', 'amusement', 'pier', 'gas', 'fastfood']
          .concat(CC.serviceZoneNames ? CC.serviceZoneNames() : []));
    }
    const zones = trailZoneCache;
    const isWaterAt = function (x, z) {
      if (IM && IM.inWater) return IM.inWater(x, z);
      return !!(CC.coast && CC.coast.isWater(x, z));
    };
    for (let fi = 0; fi < Math.min(3, forests.length); fi++) {
      const f = forests[fi], cx = f.x, cz = f.z, r = f.r * 0.92;
      const raw = [];
      const steps = 180;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        raw.push({
          x: cx + (t * 2 - 1) * r,
          z: cz + Math.sin(t * Math.PI * 3 + fi * 1.3) * r * 0.42 +
            Math.sin(t * Math.PI * 7.5 + fi * 2.1) * r * 0.13
        });
      }
      const runs = [];
      let run = [];
      raw.forEach(function (p) {
        // Keep the whole path, not just its centre, well clear of asphalt,
        // shoulder and junctions so it never cuts across a road.
        let ok = CC.roadClearance(p.x, p.z, 5.5) >= 3.5;
        if (ok && isWaterAt(p.x, p.z)) ok = false;
        if (ok && IM && IM.inZone) {
          ok = !zones.some(function (name) { return IM.inZone(p.x, p.z, name); });
        }
        if (ok) run.push(p);
        else { if (run.length > 5) runs.push(run); run = []; }
      });
      if (run.length > 5) runs.push(run);
      // The second wood gets a short spur from the fenced trailhead car park.
      // It meets the meandering run and keeps the whole walk on one continuous
      // dirt path that terminates before the road at the far end.
      if (fi === 1 && runs.length) {
        const q = CC.trailheadZone();
        let bestRun = -1, bestEnd = -1, bestD = Infinity;
        runs.forEach(function (r, ri) {
          [0, r.length - 1].forEach(function (ei) {
            const d = util.distance2D(q.x, r[ei].x, q.z - q.h * 0.5, r[ei].z);
            if (d < bestD) { bestD = d; bestRun = ri; bestEnd = ei; }
          });
        });
        if (bestRun >= 0 && bestD < 90) {
          const target = runs[bestRun][bestEnd];
          const sx = q.x, sz = q.z - q.h * 0.5 + 0.5;
          const spur = [];
          for (let i = 0; i <= 20; i++) {
            const t = i / 20;
            const bend = Math.sin(t * Math.PI) * 2.4;
            spur.push({
              x: util.lerp(sx, target.x, t) + bend,
              z: util.lerp(sz, target.z, t) - bend * 0.35
            });
          }
          if (spur.every(function (p) {
            return CC.roadClearance(p.x, p.z, 5.5) >= 3.5 && !isWaterAt(p.x, p.z);
          })) {
            const run = runs[bestRun];
            if (bestEnd === 0) run.unshift.apply(run, spur.slice(0, -1).reverse());
            else run.push.apply(run, spur.slice(1));
          }
        }
      }
      result.push(runs);
    }

    // Riverside dirt trail: south riverbank, west of the nature trail sign,
    // across the river from the dog park sign; weaves west to the beach.
    (function addRiversideTrail() {
      const startX = -126, startZ = 286;
      const endZ = 304;
      const endX = CC.coast.westLine(endZ) + 10;
      const steps = 170;
      const pts = [];
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = util.lerp(startX, endX, t);
        const baseZ = util.lerp(startZ, endZ, t);
        const weave = Math.sin(t * Math.PI * 7.5) * 4.8 + Math.sin(t * Math.PI * 15 + 0.6) * 1.8;
        let z = baseZ + weave;
        // Nudge onto dry land while preserving a winding path.
        let ok = false;
        for (let dz = 0; dz <= 18; dz += 1) {
          for (const sign of [1, -1]) {
            const zz = z + dz * sign;
            const water = isWaterAt(x, zz);
            const nearWater = CC.coast && CC.coast.distanceToWater && CC.coast.distanceToWater(x, zz) < 2.4;
            if (!water && !nearWater && CC.roadClearance(x, zz, 4.2) >= 2.5) {
              z = zz; ok = true; break;
            }
          }
          if (ok) break;
        }
        if (ok) pts.push({ x: x, z: z });
      }
      const runs = [];
      let run = [];
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const prev = run[run.length - 1];
        if (prev && util.distance2D(prev.x, prev.z, p.x, p.z) > 12) {
          if (run.length > 6) runs.push(run);
          run = [];
        }
        run.push(p);
      }
      if (run.length > 6) runs.push(run);
      if (runs.length) result.push(runs);
    })();

    return result;
  };

  // Tree canopies overhang the middle of the dirt path if clearance is measured
  // only to the trunk. All scenery generators share this wider corridor, so the
  // trail stays visibly open rather than just technically unobstructed.
  let trailSegmentCache = null;
  CC.trailClearance = 8.5;
  CC.clearNatureTrailCache = function () { trailSegmentCache = null; };
  CC.nearNatureTrail = function (x, z, radius) {
    if (!trailSegmentCache) {
      trailSegmentCache = [];
      (CC.natureTrailPaths ? CC.natureTrailPaths() : []).forEach(function (runs) {
        runs.forEach(function (path) {
          for (let i = 0; i < path.length - 1; i++) {
            trailSegmentCache.push([path[i].x, path[i].z, path[i + 1].x, path[i + 1].z]);
          }
        });
      });
    }
    const r = radius == null ? CC.trailClearance : radius;
    for (let i = 0; i < trailSegmentCache.length; i++) {
      const s = trailSegmentCache[i];
      if (util.distanceToSegment(x, z, s[0], s[1], s[2], s[3]).dist < r) return true;
    }
    return false;
  };

  // Sample a road at arc-length distance s, returning position + unit tangent.
  CC.sampleRoad = function (road, s) {
    const n = road.points.length;
    if (n < 2) return { x: road.points[0][0], z: road.points[0][1], dx: 0, dz: 1 };
    s = ((s % road._length) + road._length) % road._length;
    let i = 0;
    while (i < road._cum.length - 2 && road._cum[i + 1] < s) i++;
    const t = (s - road._cum[i]) / (road._cum[i + 1] - road._cum[i]);
    const a = CC.roadPointAt(road, i), b = CC.roadPointAt(road, i + 1);
    return {
      x: util.lerp(a[0], b[0], t),
      z: util.lerp(a[1], b[1], t),
      dx: (b[0] - a[0]) / (road._cum[i + 1] - road._cum[i]),
      dz: (b[1] - a[1]) / (road._cum[i + 1] - road._cum[i])
    };
  };

  /* ---------- terrain height + surface ---------- */
  // `groundHeightAt` is the terrain under everything; `heightAt` is the
  // drivable surface and includes the bridge profile. Keeping them separate
  // stops the riverbed from bulging up under an elevated crossing.
  CC.groundHeightAt = function (x, z) {
    if (CC.coast.isWater(x, z)) return -6;
    let h = 0.42 * Math.sin(x * 0.013) * Math.cos(z * 0.011) +
            0.22 * Math.sin((x + z) * 0.027) +
            0.12 * Math.cos(x * 0.041 - z * 0.018);
    const d = CC.coast.distanceToWater(x, z);
    if (d < 52) {
      const f = 1 - d / 52;
      h += f * f * (2.1 + 1.1 * Math.sin(x * 0.06) * Math.cos(z * 0.052));
    }
    const nr = CC.nearestRoad(x, z);
    if (nr && nr.dist < nr.width * 0.5 + 4) {
      const f = 1 - nr.dist / (nr.width * 0.5 + 4);
      const target = nr.type === 'boardwalk' ? 1.15 : 0.42;
      h = h * (1 - f * 0.86) + target * (f * 0.86);
    }
    // Fixed level bridges: keep terrain low under deck so pylons/supports read clearly.
    const fixedBridge = (CC.bridgeSegments || []).find(function (s) {
      const road = (CC.roadDefs && CC.roadDefs[s.roadIndex]) || {};
      return road.name === 'North Cross' && !s.lowWaterCrossing &&
        U.distanceToSegment(x, z, s.ax, s.az, s.bx, s.bz).dist <= s.width * 0.5 + 2;
    });
    if (fixedBridge) h = Math.min(h, 0.35);
    return Math.max(-0.15, h);
  };

  // The drivable surface only exists over the deck and its narrow shoulders.
  // Keeping the lateral falloff tight stops trees, poles and parked cars in the
  // verge from being lifted into the air beside an elevated crossing.
  const _bridgeLiftScratch = { dist: 0, t: 0, x: 0, z: 0, dx: 0, dz: 0 };
  CC.bridgeLateral = function (span, dist) {
    const deckEdge = span.width * 0.5 + 0.45;
    const outer = deckEdge + 0.75;
    if (dist <= deckEdge) return 1;
    if (dist >= outer) return 0;
    return 1 - util.smoothstep(deckEdge, outer, dist);
  };

  // Profile of the strongest bridge surface under a point. Returns the span
  // and along-span position so drawbridge lift can use exactly the same span
  // instead of picking a different overlapping crossing.
  CC.bridgeProfileAt = function (x, z, ground) {
    const segs = CC.bridgeSegments || [];
    const deck = C.SEA_LEVEL + CC.BRIDGE.deckHeight;
    if (ground == null) ground = CC.groundHeightAt(x, z);
    let best = null;
    let bestLift = 0;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      const r = util.distanceToSegment(x, z, s.ax, s.az, s.bx, s.bz, _bridgeLiftScratch);
      const lateral = CC.bridgeLateral(s, r.dist);
      if (lateral <= 0) continue;
      const road = (CC.roadDefs && CC.roadDefs[s.roadIndex]) || {};
      const len = Math.hypot(s.bx - s.ax, s.bz - s.az) || 1;
      const along = r.t * len;
      let lift = 0, weight = lateral;
      if (road.name === 'North Cross') {
        const reach = s.lowWaterCrossing ? 34 : 120;
        const ws = s.waterStart == null ? 0 : s.waterStart;
        const we = s.waterEnd == null ? len : s.waterEnd;
        let influence = 1;
        if (along < ws) {
          influence = ws > 0.5
            ? util.smoothstep(ws - Math.min(reach, ws), ws, along) : 1;
        } else if (along > we) {
          influence = len - we > 0.5
            ? util.smoothstep(we + Math.min(reach, len - we), we, along) : 1;
        }
        weight = influence * lateral;
        if (weight <= 0) continue;
        const deckY = s.lowWaterCrossing
          ? Math.max(ground + 1.2, -4.2)
          : deck;
        lift = Math.max(0, deckY - ground) * weight;
      } else {
        const reach = CC.BRIDGE.approachLength || 46;
        const ws = s.waterStart == null ? 0 : s.waterStart;
        const we = s.waterEnd == null ? len : s.waterEnd;
        let influence = 1;
        if (along < ws) {
          influence = ws > 0.5
            ? util.smoothstep(ws - Math.min(reach, ws), ws, along) : 1;
        } else if (along > we) {
          influence = len - we > 0.5
            ? util.smoothstep(we + Math.min(reach, len - we), we, along) : 1;
        }
        weight = influence * lateral;
        if (weight <= 0) continue;
        lift = Math.max(0, deck - ground) * weight;
      }
      if (lift > bestLift) {
        bestLift = lift;
        best = { span: s, t: r.t, along: along, weight: weight, lift: lift };
      }
    }
    return best;
  };

  // Smooth ramps rise from dry land and give every crossing a flat, high
  // central span. The profile follows the bridge centreline instead of the
  // riverbank, so the run-up is long and there is no height jump at the ends.
  // Drawbridges add a second, timed lift on top of this.
  CC.bridgeLiftAt = function (x, z, ground) {
    if (ground == null) ground = CC.groundHeightAt(x, z);
    const profile = CC.bridgeProfileAt(x, z, ground);
    if (!profile) return 0;
    return profile.lift + (CC.drawbridgeLiftAt
      ? CC.drawbridgeLiftAt(x, z, profile.span, profile.t) : 0);
  };

  CC.heightAt = function (x, z) {
    const ground = CC.groundHeightAt(x, z);
    return ground + CC.bridgeLiftAt(x, z, ground);
  };

  /* ---------- Burger Bay grade-separated crossing ----------
     The north-south road east of the river passes beneath the Main Street
     bridge. Bridge traffic and scenery still use heightAt(), but vehicles on
     the underpass road use these helpers so they stay at ground level while
     the deck remains overhead. */
  CC.UNDERPASS = {
    roadIndex: 6,
    x: 175, z: -37,
    halfWidth: 8,
    halfLength: 34
  };
  CC.inUnderpassZone = function (x, z) {
    const u = CC.UNDERPASS;
    return !!u && Math.abs(x - u.x) <= u.halfWidth &&
      Math.abs(z - u.z) <= u.halfLength;
  };
  CC.underpassGroundAt = function (x, z) {
    return CC.inUnderpassZone(x, z) ? CC.groundHeightAt(x, z) : null;
  };
  CC.underpassVehicleHeightAt = function (x, z, heading, extra) {
    // North-south traffic is on the lower road; east-west traffic is on the
    // bridge above it.
    const lower = CC.inUnderpassZone(x, z) &&
      Math.abs(Math.sin(heading || 0)) < 0.45;
    const y = lower ? CC.groundHeightAt(x, z) : CC.heightAt(x, z);
    return y + (extra || 0);
  };
  CC.roadSurfaceHeightAt = function (x, z, road) {
    const ground = CC.groundHeightAt(x, z);
    let y = ground + CC.bridgeLiftAt(x, z, ground);
    if (road && CC.UNDERPASS && road._index === CC.UNDERPASS.roadIndex &&
        CC.inUnderpassZone(x, z)) {
      y = ground;
    }
    return y;
  };

  CC.surfaceAt = function (x, z) {
    const nr = CC.nearestRoad(x, z);
    if (nr && nr.dist <= nr.width * 0.5) return nr.type;
    if (CC.coast.onBridge && CC.coast.onBridge(x, z, 0)) return 'paved';
    if (CC.coast.isWater(x, z)) return 'water';
    if (CC.coast.inMarsh && CC.coast.inMarsh(x, z)) return 'marsh';
    if (CC.coast.distanceToWater(x, z) < 46) return 'sand';
    return 'grass';
  };

  /* ---------- vehicle tuning ---------- */
  CC.vehicleSpecs = {
    motorcycle: {
      key: '1', label: 'Motorcycle', maxSpeed: 47, accel: 35, brake: 42, turn: 2.75,
      grip: 6.2, driftGrip: 3.0, suspension: 1.15, sandFactor: 0.72, grassFactor: 0.78,
      boost: 1.32, radius: 1.05, wheelRadius: 0.38, lean: 0.55,
      audio: { wave: 'sawtooth', base: 78, mult: 5.4, gain: 0.16, filter: 1700 },
      color: 0xe4573f, desc: 'Nimble + fast, fragile in a crash'
    },
    atv: {
      key: '2', label: 'ATV Quad', maxSpeed: 31, accel: 27, brake: 34, turn: 3.35,
      grip: 8.2, driftGrip: 5.0, suspension: 1.75, sandFactor: 1.0, grassFactor: 1.0,
      boost: 1.22, radius: 1.25, wheelRadius: 0.55, lean: 0.26,
      audio: { wave: 'square', base: 62, mult: 4.6, gain: 0.14, filter: 1250 },
      color: 0xe8a12c, desc: 'No off-road penalty, bouncy ride'
    },
    cart: {
      key: '3', label: 'Golf Cart', maxSpeed: 19, accel: 19, brake: 24, turn: 4.5,
      grip: 9.5, driftGrip: 6.0, suspension: 0.85, sandFactor: 0.9, grassFactor: 0.94,
      boost: 1.18, radius: 1.15, wheelRadius: 0.34, lean: 0.08,
      audio: { wave: 'sine', base: 130, mult: 3.0, gain: 0.075, filter: 2600 },
      color: 0x4fbfa0, desc: 'Whisper-quiet, ultra tight turning'
    },
    car: {
      key: '4', label: 'Sedan Coupe', maxSpeed: 40, accel: 25, brake: 38, turn: 2.25,
      grip: 6.6, driftGrip: 2.3, suspension: 1.0, sandFactor: 0.66, grassFactor: 0.72,
      boost: 1.28, radius: 1.5, wheelRadius: 0.42, lean: 0.16,
      audio: { wave: 'sawtooth', base: 58, mult: 4.0, gain: 0.15, filter: 1450 },
      color: 0x4b8fd6, desc: 'Balanced, smooth handbrake drifts'
    },
    truck: {
      key: '5', label: 'Pickup Truck', maxSpeed: 36, accel: 22, brake: 32, turn: 1.8,
      grip: 5.4, driftGrip: 2.8, suspension: 1.35, sandFactor: 0.82, grassFactor: 0.86,
      boost: 1.24, radius: 1.75, wheelRadius: 0.55, lean: 0.12, bulldoze: true,
      audio: { wave: 'square', base: 48, mult: 3.4, gain: 0.17, filter: 1050 },
      color: 0xb6b9a8, desc: 'Heavy torque, bulldozes yard props'
    },
    pedestrian: {
      key: '6', label: 'On Foot', pedestrian: true, maxSpeed: 5.2, accel: 17, brake: 24,
      turn: 3.6, sandFactor: 0.82, grassFactor: 1, boost: 1.75,
      radius: 0.55, wheelRadius: 0, lean: 0,
      audio: { wave: 'sine', base: 0, mult: 0, gain: 0, filter: 900 },
      color: 0xf2b84b, desc: 'Run with Shift — stamina drains, then recovers; Space dives in the sea'
    },
    boat: {
      key: '7', label: 'Marina Boat', water: true, maxSpeed: 20, accel: 14, brake: 16,
      turn: 1.85, grip: 2.4, driftGrip: 1.7, suspension: 0.25, sandFactor: 0, grassFactor: 0,
      boost: 1.5, radius: 2.1, wheelRadius: 0, lean: 0.16,
      audio: { wave: 'sine', base: 38, mult: 1.6, gain: 0.055, filter: 520 },
      color: 0xf2eee0, desc: 'Putt around the bay — board at the marina'
    },
    plane: {
      key: '8', label: 'Coastal Plane', flying: true, maxSpeed: 62, accel: 19, brake: 24,
      turn: 1.65, climb: 14, minAltitude: 2.4, defaultAltitude: 3.2, ceiling: 700,
      radius: 5.2, wheelRadius: 0, lean: 0,
      audio: { wave: 'sawtooth', base: 72, mult: 2.2, gain: 0.09, filter: 900 },
      color: 0xe9edf0, desc: 'Fly the coast — left stick throttle, right stick pitch/roll'
    },
    helicopter: {
      key: '9', label: 'Harbor Helicopter', flying: true, hover: true, maxSpeed: 34, accel: 16,
      brake: 20, turn: 2.6, climb: 18, minAltitude: 1.6, defaultAltitude: 2.4, ceiling: 620,
      radius: 4.4, wheelRadius: 0, lean: 0,
      audio: { wave: 'square', base: 42, mult: 3.1, gain: 0.075, filter: 700 },
      color: 0xd94f42, desc: 'Hover over town — centred stick holds altitude'
    },
    fpv: {
      key: '0', label: 'FPV Kamikaze Quad', flying: true, hover: true, fpv: true,
      maxSpeed: 34, accel: 15, brake: 12, turn: 2.2, climb: 11,
      minAltitude: 0.8, defaultAltitude: 6, ceiling: 560, batterySeconds: 900,
      radius: 1.1, wheelRadius: 0, lean: 0,
      audio: { wave: 'sawtooth', base: 118, mult: 5.2, gain: 0.045, filter: 2100 },
      color: 0x22272b, desc: 'Goggles view — hunt Shahed drones over the harbor'
    },
    jetpack: {
      key: 'J', label: 'Jetpack', flying: true, hover: true, jetpack: true,
      maxSpeed: 28, accel: 18, brake: 14, turn: 3.1, climb: 16,
      minAltitude: 0.8, defaultAltitude: 2.2, ceiling: 520,
      radius: 0.75, wheelRadius: 0, lean: 0,
      audio: { wave: 'sawtooth', base: 96, mult: 4.2, gain: 0.06, filter: 1800 },
      color: 0x4a5560, desc: 'Jetpack'
    },
    coupe: {
      key: 'C', label: 'Sports Coupe', assetModel: 'sports', maxSpeed: 44, accel: 27, brake: 38,
      turn: 2.35, grip: 6.4, driftGrip: 2.1, suspension: 0.95, sandFactor: 0.66, grassFactor: 0.72,
      boost: 1.3, radius: 1.5, wheelRadius: 0.42, lean: 0.14,
      audio: { wave: 'sawtooth', base: 62, mult: 4.4, gain: 0.15, filter: 1680 },
      color: 0xd94f42, desc: 'Baked low-poly coupe — quick and balanced'
    },
    muscleCar: {
      key: 'M', label: 'Muscle Car', assetModel: 'muscle', maxSpeed: 42, accel: 29, brake: 34,
      turn: 2.05, grip: 5.8, driftGrip: 1.9, suspension: 0.92, sandFactor: 0.68, grassFactor: 0.74,
      boost: 1.34, radius: 1.55, wheelRadius: 0.44, lean: 0.13,
      audio: { wave: 'square', base: 52, mult: 3.9, gain: 0.17, filter: 1320 },
      color: 0x3f6fb8, desc: 'Baked low-poly muscle — torquey drifts'
    },
    taxi: {
      key: 'X', label: 'City Taxi', assetModel: 'taxi', maxSpeed: 38, accel: 24, brake: 36,
      turn: 2.3, grip: 6.5, driftGrip: 2.3, suspension: 1.0, sandFactor: 0.66, grassFactor: 0.72,
      boost: 1.26, radius: 1.5, wheelRadius: 0.42, lean: 0.14,
      audio: { wave: 'sawtooth', base: 56, mult: 4.0, gain: 0.14, filter: 1400 },
      color: 0xf0c23c, desc: 'Baked low-poly taxi — yellow cab'
    },
    limo: {
      key: 'L', label: 'Limousine', assetModel: 'limo', maxSpeed: 36, accel: 22, brake: 31,
      turn: 1.75, grip: 5.4, driftGrip: 2.6, suspension: 1.1, sandFactor: 0.64, grassFactor: 0.7,
      boost: 1.22, radius: 1.9, wheelRadius: 0.45, lean: 0.1,
      audio: { wave: 'sawtooth', base: 48, mult: 3.5, gain: 0.16, filter: 1100 },
      color: 0x252a33, desc: 'Baked low-poly limo — long, smooth ride'
    },
    bus: {
      key: 'U', label: 'City Bus', assetModel: 'bus', maxSpeed: 27, accel: 16, brake: 26,
      turn: 1.45, grip: 5.2, driftGrip: 2.4, suspension: 1.2, sandFactor: 0.6, grassFactor: 0.66,
      boost: 1.1, radius: 2.35, wheelRadius: 0.41, lean: 0.05,
      audio: { wave: 'sawtooth', base: 42, mult: 2.8, gain: 0.13, filter: 900 },
      color: 0x2f7f7a, desc: 'Baked low-poly city bus — serves every stop'
    },
    offroad: {
      key: 'O', label: 'Off-Road Pickup', assetModel: 'toyoyo', maxSpeed: 36, accel: 24, brake: 33,
      turn: 2.1, grip: 7.2, driftGrip: 3.2, suspension: 1.6, sandFactor: 0.95, grassFactor: 0.98,
      boost: 1.28, radius: 1.7, wheelRadius: 0.55, lean: 0.12, bulldoze: true,
      audio: { wave: 'square', base: 50, mult: 3.6, gain: 0.17, filter: 1150 },
      color: 0x8c6f45, desc: 'Baked Designersoup 4x4 — climbs rough ground'
    },
    compact: {
      key: 'H', label: 'Compact Hatch', assetModel: 'beatall', maxSpeed: 34, accel: 21, brake: 34,
      turn: 2.8, grip: 7.1, driftGrip: 2.8, suspension: 0.9, sandFactor: 0.7, grassFactor: 0.76,
      boost: 1.24, radius: 1.35, wheelRadius: 0.38, lean: 0.1,
      audio: { wave: 'sine', base: 70, mult: 4.2, gain: 0.12, filter: 1750 },
      color: 0x6fae84, desc: 'Baked Designersoup compact — tiny and nimble'
    }
  };
  CC.vehicleOrder = [
    'motorcycle', 'atv', 'cart', 'car', 'truck', 'pedestrian', 'boat', 'plane', 'helicopter',
    'fpv', 'jetpack', 'coupe', 'muscleCar', 'taxi', 'limo', 'bus', 'offroad', 'compact'
  ];
  // Set by CC.Details when the marina is built; used by the boat's spawn/reset.
  CC.marinaSpawn = { x: -318, z: 103, heading: -Math.PI / 2 };
  CC.launchSpawn = { x: -286, z: 95, heading: Math.PI / 2 };
  // Mid-river boarding point used when the Beacon Seafood dock is nearest.
  CC.riverBoatSpawn = { x: -275, z: 278, heading: Math.PI / 2 };
  // Set by CC.Details when the airport is built. Each parked craft doubles as a
  // boarding point for pedestrians and as that vehicle's reset position.
  CC.aircraftSpawns = [];
  CC.aircraftSpawn = function (key, index) {
    const matches = (CC.aircraftSpawns || []).filter(function (s) { return s.key === key; });
    if (matches.length) return matches[(index || 0) % matches.length];
    if (key === 'helicopter') return { x: 96, z: -302, heading: -0.35, altitude: 2.6 };
    if (key === 'fpv') return { x: -48, z: -318, heading: 0, altitude: 1.4 };
    if (key === 'jetpack') return { x: 74, z: -286, heading: 0.1, altitude: 2.2 };
    return { x: 0, z: -302, heading: 0.15, altitude: 3.2 };
  };

  /* ---------- time-trial challenges ---------- */
  CC.challengeDefs = [
    {
      id: 'boardwalk', name: 'Boardwalk Sprint', color: 0x62e0ff,
      gates: [[-188, -60], [-222, -68], [-262, -82], [-302, -92], [-332, -98]]
    },
    {
      id: 'slalom', name: 'Trailer Park Slalom', color: 0xffd166,
      gates: [[-30, -30], [40, -8], [112, -52], [156, 28], [92, 108], [18, 78], [-40, 110]]
    },
    {
      id: 'dune', name: 'Dune Run', color: 0xff8fb1,
      gates: [[-162, 40], [-216, 78], [-252, 142], [-200, 202], [-120, 255]]
    }
  ];
})();
