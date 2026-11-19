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
    distanceToSegment(px, pz, ax, az, bx, bz) {
      const dx = bx - ax, dz = bz - az;
      const l2 = dx * dx + dz * dz;
      if (l2 < 1e-6) return { dist: Math.hypot(px - ax, pz - az), t: 0, x: ax, z: az, dx: 0, dz: 1 };
      let t = ((px - ax) * dx + (pz - az) * dz) / l2;
      t = util.clamp(t, 0, 1);
      const x = ax + dx * t, z = az + dz * t;
      return { dist: Math.hypot(px - x, pz - z), t, x, z, dx: dx / Math.sqrt(l2), dz: dz / Math.sqrt(l2) };
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
  CC.coast = {
    westLine,
    southLine,
    isWater(x, z) { return x < westLine(z) || z > southLine(x); },
    distanceToWater(x, z) { return Math.min(x - westLine(z), southLine(x) - z); }
  };

  /* ---------- road network ---------- */
  CC.roadDefs = [
    {
      name: 'Coastal Highway', type: 'paved', width: 16, closed: false,
      points: [[-150, -330], [-172, -250], [-150, -160], [-188, -60], [-162, 40], [-198, 130], [-165, 215], [-120, 255]]
    },
    {
      name: 'Palm Loop', type: 'paved', width: 14, closed: false,
      points: [[260, -310], [305, -225], [278, -130], [318, -35], [298, 60], [330, 150], [275, 230], [160, 265], [40, 250], [20, 180]]
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
      points: [[140, -60], [172, -128], [214, -152], [240, -140]]
    },
    {
      name: 'Cul-de-sac South', type: 'paved', width: 11, closed: false,
      points: [[120, 140], [152, 202], [204, 218], [228, 200]]
    },
    {
      name: 'Gravel Shortcut', type: 'gravel', width: 9, closed: false,
      points: [[-120, 255], [-45, 205], [20, 180]]
    },
    {
      name: 'Dune Track', type: 'gravel', width: 8, closed: false,
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

  // Precompute segment data once; used for surface queries, road flattening and minimap.
  CC.roadSegments = [];
  CC.roadDefs.forEach(function (road, ri) {
    road._index = ri;
    road._cum = [0];
    for (let i = 0; i < road.points.length - 1; i++) {
      const a = road.points[i], b = road.points[i + 1];
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const len = Math.hypot(dx, dz);
      CC.roadSegments.push({
        ax: a[0], az: a[1], bx: b[0], bz: b[1],
        dx: dx / len, dz: dz / len, len,
        width: road.width, type: road.type, roadIndex: ri, segIndex: i
      });
      road._cum.push(road._cum[i] + len);
    }
    road._length = road._cum[road._cum.length - 1];
  });

  CC.nearestRoad = function (x, z, typeFilter) {
    let best = null;
    const segs = CC.roadSegments;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      if (typeFilter && s.type !== typeFilter) continue;
      const r = util.distanceToSegment(x, z, s.ax, s.az, s.bx, s.bz);
      if (!best || r.dist < best.dist) {
        best = {
          dist: r.dist, x: r.x, z: r.z, dx: s.dx, dz: s.dz,
          width: s.width, type: s.type, roadIndex: s.roadIndex, segIndex: s.segIndex
        };
      }
    }
    return best;
  };

  // Sample a road at arc-length distance s, returning position + unit tangent.
  CC.sampleRoad = function (road, s) {
    const n = road.points.length;
    if (n < 2) return { x: road.points[0][0], z: road.points[0][1], dx: 0, dz: 1 };
    s = ((s % road._length) + road._length) % road._length;
    let i = 0;
    while (i < road._cum.length - 2 && road._cum[i + 1] < s) i++;
    const t = (s - road._cum[i]) / (road._cum[i + 1] - road._cum[i]);
    const a = road.points[i], b = road.points[i + 1];
    return {
      x: util.lerp(a[0], b[0], t),
      z: util.lerp(a[1], b[1], t),
      dx: (b[0] - a[0]) / (road._cum[i + 1] - road._cum[i]),
      dz: (b[1] - a[1]) / (road._cum[i + 1] - road._cum[i])
    };
  };

  /* ---------- terrain height + surface ---------- */
  CC.heightAt = function (x, z) {
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
    return Math.max(-0.15, h);
  };

  CC.surfaceAt = function (x, z) {
    const nr = CC.nearestRoad(x, z);
    if (nr && nr.dist <= nr.width * 0.5) return nr.type;
    if (CC.coast.isWater(x, z)) return 'water';
    if (CC.coast.distanceToWater(x, z) < 46) return 'sand';
    return 'grass';
  };

  /* ---------- vehicle tuning ---------- */
  CC.vehicleSpecs = {
    motorcycle: {
      key: '1', label: 'Motorcycle', maxSpeed: 46, accel: 34, brake: 42, turn: 2.75,
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
      key: '3', label: 'Golf Cart', maxSpeed: 16, accel: 15, brake: 24, turn: 4.5,
      grip: 9.5, driftGrip: 6.0, suspension: 0.85, sandFactor: 0.9, grassFactor: 0.94,
      boost: 1.18, radius: 1.15, wheelRadius: 0.34, lean: 0.08,
      audio: { wave: 'sine', base: 130, mult: 3.0, gain: 0.075, filter: 2600 },
      color: 0x4fbfa0, desc: 'Whisper-quiet, ultra tight turning'
    },
    car: {
      key: '4', label: 'Sedan Coupe', maxSpeed: 39, accel: 23, brake: 38, turn: 2.25,
      grip: 6.6, driftGrip: 2.3, suspension: 1.0, sandFactor: 0.66, grassFactor: 0.72,
      boost: 1.28, radius: 1.5, wheelRadius: 0.42, lean: 0.16,
      audio: { wave: 'sawtooth', base: 58, mult: 4.0, gain: 0.15, filter: 1450 },
      color: 0x4b8fd6, desc: 'Balanced, smooth handbrake drifts'
    },
    truck: {
      key: '5', label: 'Pickup Truck', maxSpeed: 34, accel: 19, brake: 32, turn: 1.8,
      grip: 5.4, driftGrip: 2.8, suspension: 1.35, sandFactor: 0.82, grassFactor: 0.86,
      boost: 1.24, radius: 1.75, wheelRadius: 0.55, lean: 0.12, bulldoze: true,
      audio: { wave: 'square', base: 48, mult: 3.4, gain: 0.17, filter: 1050 },
      color: 0xb6b9a8, desc: 'Heavy torque, bulldozes yard props'
    }
  };
  CC.vehicleOrder = ['motorcycle', 'atv', 'cart', 'car', 'truck'];

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
