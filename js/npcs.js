/* Coastal Cruise - civilian traffic and reactive pedestrians. */
(function () {
  'use strict';

  const CC = window.CC;
  const C = CC.C, U = CC.util;
  const rng = CC.rng(77713);
  // Separate stream keeps the new reckless-driver rolls from changing the
  // original deterministic traffic/pedestrian layout.
  const recklessRng = CC.rng(20261120);
  const RECKLESS_BEHAVIORS = ['cutoff', 'tailgate', 'passRight', 'ramCar', 'chasePed', 'runLight'];
  // The giant roach GLB ships two flight clips. Both are used: the kidnapping
  // pose for the takeoff/landing beat and the straight pose for level cruising.
  const ROACH_FLY_LAUNCH = 'giant_cockroach_armature|flying_kidnapping';
  const ROACH_FLY_CRUISE = 'giant_cockroach_armature|flying_straight';

  function pace(kind) { return (CC.pace && CC.pace[kind]) || 1; }

  function mat(hex) { return new THREE.MeshLambertMaterial({ color: hex, flatShading: true }); }
  function box(w, h, d, m, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x || 0, y || 0, z || 0);
    mesh.castShadow = true;
    return mesh;
  }
  function cylinder(rt, rb, h, segs, m, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, segs), m);
    mesh.position.set(x || 0, y || 0, z || 0);
    mesh.castShadow = true;
    return mesh;
  }

  // Shared soldier geometry/materials. One template character is cloned for
  // every platoon member, so the marching platoons do not multiply hundreds of
  // tiny MeshLambertMaterials and BoxGeometries.
  let soldierAssetsCache = null;
  function flagCanvasTexture() {
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
        const x = 7 + col * 13 + (row % 2) * 6, y = 6 + row * 10;
        g.beginPath();
        for (let k = 0; k < 10; k++) {
          const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 1.5 : 3.2;
          if (k === 0) g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
          else g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        }
        g.closePath(); g.fill();
      }
    }
    const tex = new THREE.CanvasTexture(c);
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  function soldierAssets() {
    if (soldierAssetsCache) return soldierAssetsCache;
    const olive = mat(0x4c5a3b), oliveDark = mat(0x35402d), oliveVest = mat(0x606d49);
    const webbing = mat(0x8a7953), rifleDark = mat(0x242a28), rifleMetal = mat(0x5c6467);
    const skin = mat(0xc98d68);
    const template = CC.CharacterFactory.build({
      skin: 0xc98d68, shirt: 0x4c5a3b, pants: 0x343d2c,
      shoes: 0x242722, hair: 0x2d2721
    });
    template.group.name = 'soldierTemplate';
    template.legL.name = 'soldierLegL';
    template.legR.name = 'soldierLegR';
    template.armL.name = 'soldierArmL';
    template.armR.name = 'soldierArmR';
    const helmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.29, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.62), oliveDark);
    helmet.position.y = 2.03;
    helmet.castShadow = true;
    template.group.add(helmet);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.04, 10), oliveDark);
    brim.position.set(0, 1.99, 0.1);
    template.group.add(brim);
    template.group.add(box(0.62, 0.66, 0.1, oliveVest, 0, 1.16, 0.31));
    [-0.2, 0.2].forEach(function (x) {
      template.group.add(box(0.16, 0.18, 0.1, webbing, x, 1.02, 0.38));
    });
    template.group.add(box(0.12, 0.5, 0.12, webbing, -0.29, 1.22, -0.02));

    soldierAssetsCache = {
      template: template,
      mats: { olive: olive, oliveDark: oliveDark, rifleDark: rifleDark, rifleMetal: rifleMetal, skin: skin },
      geo: {
        stock: new THREE.BoxGeometry(0.12, 0.92, 0.12),
        barrel: new THREE.CylinderGeometry(0.035, 0.035, 1.35, 6),
        magazine: new THREE.BoxGeometry(0.1, 0.3, 0.09),
        pole: new THREE.CylinderGeometry(0.045, 0.055, 3.4, 7),
        finial: new THREE.SphereGeometry(0.09, 6, 5),
        flag: new THREE.PlaneGeometry(1.7, 0.9)
      },
      flagMat: new THREE.MeshLambertMaterial({ map: flagCanvasTexture(), side: THREE.DoubleSide })
    };
    return soldierAssetsCache;
  }

  /* ---------- traffic ---------- */
  const trafficKinds = ['car', 'car', 'truck', 'car', 'cart'];
  const trafficColors = [0xd9d6c9, 0x7d9ab5, 0xc67d6a, 0x9fb08b, 0xd6b45f, 0x6f7f8c, 0xe0e3e6];

  // A road end deep in the woods with no connecting street is not a useful
  // place for traffic to appear or vanish. Mark those ends once so spawning
  // can avoid them and cars already on the road can turn around instead.
  function terminalHidden(road, atEnd) {
    const pt = atEnd ? road.points[road.points.length - 1] : road.points[0];
    const x = pt[0], z = pt[1];
    const forests = (CC.ImageMap && CC.ImageMap.zones && CC.ImageMap.zones.forest) || [];
    for (let i = 0; i < forests.length; i++) {
      const f = forests[i];
      if (Math.hypot(x - f.x, z - f.z) < f.r * 0.95) return true;
    }
    let nearest = Infinity;
    const segs = CC.roadSegments || [];
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      if (s.roadIndex === road._index) continue;
      nearest = Math.min(nearest, U.distanceToSegment(x, z, s.ax, s.az, s.bx, s.bz).dist);
    }
    return nearest > 22;
  }
  function cacheTrafficEndpoints() {
    CC.roadDefs.forEach(function (road) {
      road._hiddenStart = terminalHidden(road, false);
      road._hiddenEnd = terminalHidden(road, true);
    });
  }

  // Where an open road meets another street, traffic turns onto that street
  // instead of wrapping to the far end of its own road. This is what makes the
  // north Dune/Harbor hairpin a sharp on-road turn rather than a spawn point.
  function roadConnection(road, atEnd) {
    const pt = atEnd ? road.points[road.points.length - 1] : road.points[0];
    const x = pt[0], z = pt[1];
    const tangent = CC.sampleRoad(road, atEnd ? Math.max(0, road._length - 0.5) : 0.5);
    const inX = atEnd ? tangent.dx : -tangent.dx;
    const inZ = atEnd ? tangent.dz : -tangent.dz;
    let best = null;
    const segs = CC.roadSegments || [];
    CC.roadDefs.forEach(function (other) {
      if (other === road || other.type !== 'paved' || !other._cum) return;
      for (let i = 0; i < segs.length; i++) {
        const seg = segs[i];
        if (seg.roadIndex !== other._index) continue;
        const r = U.distanceToSegment(x, z, seg.ax, seg.az, seg.bx, seg.bz);
        if (r.dist > 18 || (best && r.dist >= best.dist)) continue;
        const s = (other._cum[seg.segIndex] || 0) + r.t * seg.len;
        let dir;
        if (other.oneWay) dir = other.oneWay;
        else if (s < 4) dir = 1;
        else if (other._length - s < 4) dir = -1;
        else {
          const p = CC.sampleRoad(other, s);
          dir = p.dx * inX + p.dz * inZ >= 0 ? 1 : -1;
        }
        // Don't connect into the wrong end of a one-way road.
        if (other.oneWay === 1 && s > other._length - 4) continue;
        if (other.oneWay === -1 && s < 4) continue;
        best = { road: other, s: s, dir: dir, dist: r.dist };
      }
    });
    return best;
  }
  function cacheRoadConnections() {
    CC.roadDefs.forEach(function (road) {
      road._startConnection = roadConnection(road, false);
      road._endConnection = roadConnection(road, true);
    });
  }

  /* Buses follow a closed loop of paved streets. The path is sampled at a
     fixed spacing and already includes the near-curb lane offset, so the bus
     never needs to steer across oncoming traffic. */
  function buildBusPath(legs, stops) {
    const points = [];
    legs.forEach(function (leg) {
      const road = CC.roadDefs[leg.road];
      if (!road || !road._length) return;
      const span = Math.abs(leg.to - leg.from);
      const endS = Math.min(leg.to, road._length - 0.02);
      const steps = Math.max(2, Math.ceil(span / 4));
      for (let i = 0; i <= steps; i++) {
        const s = leg.from + (endS - leg.from) * (i / steps);
        const p = CC.sampleRoad(road, s);
        const tx = p.dx * leg.dir, tz = p.dz * leg.dir;
        const nx = -tz, nz = tx;
        const lane = road.width * 0.5 - 1.2;
        points.push({
          x: p.x + nx * lane, z: p.z + nz * lane,
          dx: tx, dz: tz, s: s, roadIndex: leg.road, stopIndex: -1
        });
      }
    });
    if (points.length < 3) return null;
    let length = 0;
    points.forEach(function (p, i) {
      p.pathS = length;
      const next = points[(i + 1) % points.length];
      length += Math.hypot(next.x - p.x, next.z - p.z);
    });
    (stops || []).forEach(function (stop, stopIndex) {
      let best = Infinity, bestPoint = null;
      points.forEach(function (p) {
        if (p.roadIndex !== stop.roadIndex) return;
        const d = Math.abs(p.s - stop.s);
        if (d < best) { best = d; bestPoint = p; }
      });
      if (bestPoint && best < 8) {
        bestPoint.stopIndex = stopIndex;
        stop.pathS = bestPoint.pathS;
      } else {
        stop.pathS = 0;
      }
    });
    return { points: points, length: length };
  }
  function forwardDistance(from, to, length) {
    let d = to - from;
    while (d < 0) d += length;
    while (d >= length) d -= length;
    return d;
  }

  class TransitBus {
    constructor(scene, route, startOffset, busIndex) {
      this.route = route;
      this.pathPos = startOffset % route.length;
      this.visual = CC.VehicleFactory.build('bus', 0x2f7f7a);
      this.group = this.visual.group;
      scene.add(this.group);
      this.baseSpeed = U.randRange(rng, 12, 15) * pace('traffic');
      this.speed = this.baseSpeed;
      this.target = this.baseSpeed;
      this.radius = this.visual.spec.radius;
      this.dwell = 0;
      this.activeStop = -1;
      this.riders = [];
      this.hornCooldown = 0;
      this.busIndex = busIndex;
      this.exhaustTimer = Math.random() * 0.25;
      this.heavySmoker = false;
      this.update(0, { pos: { x: 0, z: 0 }, forward: function () { return { x: 0, z: 0 }; } }, null, null);
    }

    sampleRoute() {
      const pts = this.route.points, n = pts.length;
      const pos = ((this.pathPos % this.route.length) + this.route.length) % this.route.length;
      let i = 0;
      while (i < n - 1 && pts[i + 1].pathS <= pos) i++;
      const a = pts[i], b = pts[(i + 1) % n];
      const s1 = i === n - 1 ? this.route.length : b.pathS;
      const t = U.clamp((pos - a.pathS) / Math.max(0.001, s1 - a.pathS), 0, 1);
      const dx = a.dx + (b.dx - a.dx) * t;
      const dz = a.dz + (b.dz - a.dz) * t;
      const l = Math.hypot(dx, dz) || 1;
      return {
        x: a.x + (b.x - a.x) * t,
        z: a.z + (b.z - a.z) * t,
        dx: dx / l, dz: dz / l
      };
    }

    boardOrAlight(stopIndex) {
      const stops = CC.Details && CC.Details.busStops || [];
      const stop = stops[stopIndex];
      if (!stop) return;
      this.activeStop = stopIndex;
      this.dwell = U.randRange(rng, 3.2, 4.6);
      this.speed = 0;
      if (!NPCSystem) return;
      NPCSystem.busStopsServed++;
      let dropped = 0;
      for (let i = this.riders.length - 1; i >= 0 && dropped < 2; i--) {
        const rider = this.riders.splice(i, 1)[0];
        NPCSystem.releaseBusPassenger(rider, stop);
        NPCSystem.busAlightings++;
        dropped++;
      }
      let boarded = 0;
      while (stop.waiting.length && this.riders.length < 8 && boarded < 4) {
        const rider = stop.waiting.shift();
        rider.inVehicle = true;
        rider.group.visible = false;
        rider.pickupCooldown = 10;
        this.riders.push(rider);
        NPCSystem.busBoardings++;
        boarded++;
      }
      NPCSystem.topUpBusStop(stop, 1);
      const player = NPCSystem.currentPlayer;
      if (player && U.distance2D(player.pos.x, player.pos.z, stop.x, stop.z) < 48 &&
          CC.Game && CC.Game.showMessage) {
        CC.Game.showMessage('Bus ' + (this.busIndex + 1) + ' — ' + stop.name, 1.8);
      }
    }

    update(dt, player, all, world, audio) {
      if (this.disabled) return;
      const stops = (CC.Details && CC.Details.busStops) || [];
      let nextStop = -1, nextDist = Infinity;
      for (let i = 0; i < stops.length; i++) {
        const stop = stops[i];
        if (stop.pathS == null) continue;
        const d = forwardDistance(this.pathPos, stop.pathS, this.route.length);
        if (d < nextDist) { nextDist = d; nextStop = i; }
      }
      this.dwell = Math.max(0, this.dwell - dt);
      let target = this.baseSpeed;
      if (nextDist < 45 && nextStop >= 0) {
        target = Math.min(target, U.clamp((nextDist - 5) / 40, 0, 1) * this.baseSpeed);
      }
      if (this.dwell > 0) target = 0;
      this.target = target;
      this.speed = U.damp(this.speed, target, target < this.speed ? 3.6 : 1.4, dt);
      this.pathPos = (this.pathPos + this.speed * dt) % this.route.length;

      const arrivalRadius = Math.max(2.2, this.speed * dt + 1.8);
      for (let i = 0; i < stops.length; i++) {
        const stop = stops[i];
        if (stop.pathS == null || this.activeStop === i) continue;
        if (forwardDistance(this.pathPos, stop.pathS, this.route.length) < arrivalRadius) {
          this.boardOrAlight(i);
          break;
        }
      }
      // activeStop stays set until a different stop is served, so the same
      // platform cannot board/alight twice while the bus is dwelling there.

      const p = this.sampleRoute();
      this.group.position.set(p.x, CC.heightAt(p.x, p.z) + this.visual.spec.wheelRadius, p.z);
      this.group.rotation.y = U.angleLerp(this.group.rotation.y, Math.atan2(p.dx, p.dz), 1 - Math.exp(-7 * dt));
      const spin = (this.speed / this.visual.spec.wheelRadius) * dt;
      for (let i = 0; i < this.visual.wheels.length; i++) this.visual.wheels[i].rotation.y += spin;
      const braking = this.target < this.speed - 1.2;
      if (CC.EnvironmentManager) {
        const night = CC.Weather ? U.clamp(CC.Weather.night || 0, 0, 1) : 0;
        CC.EnvironmentManager.updateVehicleLights(this.visual, braking, night);
      }
      this.emitExhaust(dt);

      this.hornCooldown = Math.max(0, this.hornCooldown - dt);
      if (!player || !player.pos) return;
      const ddx = player.pos.x - p.x, ddz = player.pos.z - p.z;
      const dist = Math.hypot(ddx, ddz);
      const minD = this.radius + ((player.spec && player.spec.radius) || 0.8);
      if (dist < minD && dist > 0.01) {
        const nx = ddx / dist, nz = ddz / dist;
        player.pos.x = p.x + nx * minD;
        player.pos.z = p.z + nz * minD;
        const impact = Math.abs(player.speed || 0);
        player.speed *= 0.55;
        if (player.latVel != null) player.latVel += (Math.random() - 0.5) * 3;
        if (player.registerCrash && impact > 8) player.registerCrash(impact);
        if (this.hornCooldown <= 0) {
          this.hornCooldown = 2.5;
          if (audio) audio.honk(0.8);
        }
      }
    }

    emitExhaust(dt) {
      const world = CC.World;
      if (!world || !world.particles || this.disabled) return;
      this.exhaustTimer -= dt;
      const heavy = !!this.heavySmoker;
      const interval = heavy ? 0.12 : 0.28;
      if (this.exhaustTimer > 0) return;
      this.exhaustTimer = interval;
      const x = this.group.position.x, z = this.group.position.z;
      const h = this.group.rotation.y;
      const fx = Math.sin(h), fz = Math.cos(h);
      const rx = Math.cos(h), rz = -Math.sin(h);
      const spec = this.visual.spec || {};
      const len = spec.length || 9.5;
      const width = spec.width || 2.6;
      const ex = x - fx * len * 0.53 + rx * width * 0.22;
      const ey = this.group.position.y + 0.45;
      const ez = z - fz * len * 0.53 + rz * width * 0.22;
      const moving = Math.abs(this.speed || 0) > 0.4;
      const color = heavy ? 0xc9cfd3 : 0xdfe4e7;
      const strength = heavy ? 0.16 : 0.07;
      const opts = { spread: 0.06, rise: 0.1, vy: 0.22, vxz: 0.1, life: heavy ? 0.6 : 0.38, vx: -fx * 0.45, vz: -fz * 0.45, baseVy: 0.02 };
      world.particles.spawn(ex, ey, ez, 1, color, strength, opts);
      if (heavy && moving && Math.random() < 0.3) world.particles.spawn(ex - fx * 0.05, ey + 0.02, ez - fz * 0.05, 1, 0xd2d8dc, strength * 0.55, opts);
    }
  }

  class TrafficCar {
    constructor(scene, road, s, dir, kind) {
      this.road = road;
      this.s = s;
      this.dir = dir;
      this.kind = kind;
      this.visual = CC.VehicleFactory.build(kind, U.pick(rng, trafficColors));
      this.group = this.visual.group;
      scene.add(this.group);
      this.baseSpeed = pace('traffic') * (kind === 'cart' ? U.randRange(rng, 8, 11) :
        kind === 'truck' ? U.randRange(rng, 12, 16) : U.randRange(rng, 13, 19));
      this.cruiseSpeed = this.baseSpeed;
      this.speed = this.baseSpeed;
      this.target = this.baseSpeed;
      this.radius = this.visual.spec.radius;
      const laneMax = Math.max(0.8, road.width * 0.5 - this.radius - 0.35);
      this.baseLane = Math.min(2.7, laneMax);
      this.lane = this.baseLane;
      this.laneOffset = this.baseLane;
      this.laneTarget = this.baseLane;
      this.reckless = recklessRng() < 0.18;
      this.behavior = 'normal';
      this.behaviorTimer = U.randRange(recklessRng, 5, 16);
      this.avoidTimer = 0;
      this.avoidingSoldiers = false;
      this.recklessCrashCooldown = 0;
      this.hornCooldown = 0;
      this.yieldingPed = false;
      this.exhaustTimer = Math.random() * 0.25;
      this.heavySmoker = false;
      this.group.rotation.y = 0;
    }

    leaveRoad(atEnd) {
      const road = this.road;
      const conn = atEnd ? road._endConnection : road._startConnection;
      if (conn && conn.road) {
        this.road = conn.road;
        this.dir = conn.dir;
        this.s = U.clamp(conn.s + this.dir * 6, 6, conn.road._length - 6);
        this.speed *= 0.78;
      } else {
        // No connecting street: make a tight U-turn short of the woods.
        this.dir = atEnd ? -1 : 1;
        this.s = atEnd ? road._length - 8 : 8;
        this.speed *= 0.6;
      }
    }

    update(dt, player, all, world, audio, ctx) {
      if (this.disabled) return;
      const sys = CC.NPCSystem || {};
      ctx = ctx || {};
      const drivers = ctx.drivers || all || [];
      const soldiers = ctx.soldiers || sys.soldiers || [];
      const peds = ctx.pedestrians || sys.pedestrians || [];
      let road = this.road;
      const roadCars = (ctx.trafficByRoad && ctx.trafficByRoad.get(road)) || all;
      const startLaneMax = Math.max(0.8, road.width * 0.5 - this.radius - 0.35);
      this.baseLane = Math.min(2.7, startLaneMax);

      // Reckless impulses rotate on their own RNG stream. Normal drivers stay
      // normal; roughly one car in five cycles through the bad behaviors.
      this.behaviorTimer -= dt;
      if (this.behaviorTimer <= 0) {
        this.behaviorTimer = U.randRange(recklessRng, 6, 14);
        const next = this.reckless ? U.pick(recklessRng, RECKLESS_BEHAVIORS) : 'normal';
        if (next !== 'normal' && next !== this.behavior && sys.recklessEvents != null) sys.recklessEvents++;
        this.behavior = next;
      }
      this.avoidTimer = Math.max(0, this.avoidTimer - dt);
      this.recklessCrashCooldown = Math.max(0, this.recklessCrashCooldown - dt);

      const rp0 = CC.sampleRoad(road, this.s);
      const fx0 = rp0.dx * this.dir, fz0 = rp0.dz * this.dir;
      const rx0 = -fz0, rz0 = fx0;

      let gap = Infinity, lead = null;
      // Only cars sharing this road can be the next car ahead. The per-frame
      // bucket keeps this linear in cars-per-road instead of all town traffic.
      for (let i = 0; i < roadCars.length; i++) {
        const o = roadCars[i];
        if (o === this || o.disabled || o.road !== road || o.dir !== this.dir) continue;
        let ds = (o.s - this.s) * this.dir;
        if (ds < 0) ds += road._length;
        if (ds < gap) { gap = ds; lead = o; }
      }
      this.target = this.baseSpeed;
      const tailgating = this.behavior === 'tailgate';
      const ramming = this.behavior === 'ramCar';
      const gapLimit = tailgating ? 8 : ramming ? 5 : 24;
      const gapMin = tailgating ? 1.8 : ramming ? 1.0 : 5;
      if (gap < gapLimit && !ramming) {
        const room = U.clamp((gap - gapMin) / (gapLimit - gapMin), 0, 1);
        this.target = Math.min(this.target, room * this.baseSpeed);
      }

      // Red/amber signals stop ordinary drivers; red-light runners blow through.
      if (this.behavior !== 'runLight' && CC.Details && CC.Details.signalFor) {
        const signal = CC.Details.signalFor(this.group.position.x, this.group.position.z, fx0, fz0);
        if (signal === 'red' || signal === 'yellow') this.target = Math.min(this.target, 0);
      }

      // React to a player cutting in front.
      const pdx = player.pos.x - this.group.position.x;
      const pdz = player.pos.z - this.group.position.z;
      const pDist = Math.hypot(pdx, pdz);
      const pfx = Math.sin(player.heading), pfz = Math.cos(player.heading);
      const aheadDot = pDist > 0 ? (pdx * pfx + pdz * pfz) / pDist : 0;
      if (pDist < 15 && aheadDot < -0.35 && player.speed > 9) {
        this.target = Math.min(this.target, tailgating || ramming ? 6 : 2.5);
        if (this.hornCooldown <= 0) {
          this.hornCooldown = 2.4;
          if (audio) audio.honk(U.clamp(1 - pDist / 20, 0, 1));
        }
      }
      this.hornCooldown -= dt;

      // Default lane target, then let the active reckless impulse override it.
      this.laneTarget = this.baseLane;
      if (this.reckless && lead && lead.laneOffset != null) {
        let lds = (lead.s - this.s) * this.dir;
        if (lds < 0) lds += road._length;
        if (lds > 0 && lds < 20) {
          if (this.behavior === 'passRight') {
            this.laneTarget = Math.min(startLaneMax, this.baseLane + 3.0);
          } else if (this.behavior === 'cutoff' || this.behavior === 'ramCar') {
            this.laneTarget = lead.laneOffset;
          }
        }
      }
      const alongPlayer = pdx * fx0 + pdz * fz0;
      if (pDist < 20 && alongPlayer > 0) {
        const playerLane = (player.pos.x - rp0.x) * rx0 + (player.pos.z - rp0.z) * rz0;
        if (this.behavior === 'cutoff' || this.behavior === 'ramCar') {
          this.laneTarget = U.clamp(playerLane, -startLaneMax, startLaneMax);
          if (ramming) this.target = Math.max(this.target, this.baseSpeed);
        }
      }
      if (this.behavior === 'chasePed') {
        let chased = null, chasedLat = 0, chasedAlong = Infinity;
        for (let i = 0; i < peds.length; i++) {
          const ped = peds[i];
          if (!ped || !ped.position || ped.inVehicle) continue;
          const ax = ped.position.x - rp0.x, az = ped.position.z - rp0.z;
          // along <= 18 and lane offset <= 5, so anything farther than 25 m
          // from the road sample cannot be a chase target.
          if (ax * ax + az * az > 25 * 25) continue;
          const along = ax * fx0 + az * fz0;
          if (along < 2 || along > 18 || along >= chasedAlong) continue;
          const lat = ax * rx0 + az * rz0;
          if (Math.abs(lat - this.laneTarget) > 5) continue;
          chased = ped; chasedLat = lat; chasedAlong = along;
        }
        if (chased) this.laneTarget = U.clamp(chasedLat, -startLaneMax, startLaneMax);
      }

      // Marching soldiers are moving obstacles. They publish x/z every frame;
      // when a column is ahead in our lane, swap to the clear side of the road.
      const carX = this.group.position.x, carZ = this.group.position.z;
      let avoidLane = null;
      for (let i = 0; i < soldiers.length; i++) {
        const so = soldiers[i];
        if (!so || so.x == null || so.z == null) continue;
        const sx = so.x - carX, sz = so.z - carZ;
        // Along is capped at 26 m and lane comparisons stay near the road.
        if (sx * sx + sz * sz > 34 * 34) continue;
        const along = sx * fx0 + sz * fz0;
        if (along < -2 || along > 26) continue;
        // Lane offsets are measured from the road centre, so compare there too.
        const roadLat = (so.x - rp0.x) * rx0 + (so.z - rp0.z) * rz0;
        if (Math.abs(roadLat - this.laneTarget) > 3.2) continue;
        avoidLane = roadLat >= 0 ? -this.baseLane : this.baseLane;
        if (Math.abs(roadLat) < 1.5) {
          avoidLane = Math.abs(this.laneTarget) > 0.5 ? -this.laneTarget : -this.baseLane;
        }
        break;
      }
      if (avoidLane !== null) {
        this.laneTarget = U.clamp(avoidLane, -startLaneMax, startLaneMax);
        this.avoidTimer = 2.2;
        this.target = Math.min(this.target, this.baseSpeed * 0.72);
        if (!this.avoidingSoldiers) {
          this.avoidingSoldiers = true;
          if (sys.soldierAvoidances != null) sys.soldierAvoidances++;
        }
      } else if (this.avoidTimer <= 0) {
        this.avoidingSoldiers = false;
      }
      this.laneTarget = U.clamp(this.laneTarget, -startLaneMax, startLaneMax);

      // Ordinary traffic treats a person in the lane ahead as a stop sign.
      // Reckless "chasePed" drivers are the one deliberate exception: they keep
      // the old shoulder-clipping behaviour instead of braking.
      this.yieldingPed = false;
      if (this.behavior !== 'chasePed') {
        const carX = this.group.position.x, carZ = this.group.position.z;
        const yieldLane = U.clamp(this.laneTarget, -startLaneMax, startLaneMax);
        let stopDist = Infinity;
        const considerWalker = function (wx, wz) {
          const ax = wx - carX, az = wz - carZ;
          // Yield checks only care about walkers within 18 m ahead; reject the
          // rest before the dot products and road-lane projection.
          if (ax * ax + az * az > 26 * 26) return;
          const along = ax * fx0 + az * fz0;
          if (along <= 0.5 || along > 18 || along >= stopDist) return;
          // yieldLane is measured from the road centre, so do the same for the
          // walker instead of comparing against the car's already-offset pose.
          const roadLat = (wx - rp0.x) * rx0 + (wz - rp0.z) * rz0;
          if (Math.abs(roadLat - yieldLane) > 2.4) return;
          stopDist = along;
        };
        if (player && player.isPedestrian && player.pos) {
          considerWalker(player.pos.x, player.pos.z);
        }
        for (let i = 0; i < peds.length; i++) {
          const ped = peds[i];
          if (!ped || !ped.position || ped.inVehicle) continue;
          considerWalker(ped.position.x, ped.position.z);
        }
        if (stopDist < Infinity) {
          this.yieldingPed = true;
          this.target = 0;
          // Brake hard enough to actually stop before the crossing, and crawl
          // the last couple of metres instead of coasting through the person.
          if (stopDist < 5) this.speed = Math.min(this.speed, Math.max(0, (stopDist - 1) * 1.4));
        }
      }

      const brakeLambda = this.yieldingPed ? 5.5 : 3.4;
      this.speed = U.damp(this.speed, this.target, this.target < this.speed ? brakeLambda : 1.6, dt);
      if (this.yieldingPed && this.speed < 0.05) this.speed = 0;
      this.s += this.speed * this.dir * dt;
      // Open roads hand traffic to a connecting street (a sharp on-road turn)
      // or turn it around before a dead end. Closed loops still wrap normally.
      if (road.oneWay) this.dir = road.oneWay;
      if (!road.closed) {
        if (this.dir > 0 && this.s > road._length - 4) this.leaveRoad(true);
        else if (this.dir < 0 && this.s < 4) this.leaveRoad(false);
        road = this.road;
      } else if (road.oneWay) {
        this.dir = road.oneWay;
      }
      if (this.s > road._length) this.s -= road._length;
      if (this.s < 0) this.s += road._length;

      const prevLane = this.laneOffset;
      const laneMax = Math.max(0.8, road.width * 0.5 - this.radius - 0.35);
      this.laneOffset = U.damp(this.laneOffset, U.clamp(this.laneTarget, -laneMax, laneMax), 3.2, dt);
      this.laneOffset = U.clamp(this.laneOffset, -laneMax, laneMax);
      this.lane = this.laneOffset;
      const p = CC.sampleRoad(road, this.s);
      const tx = p.dx * this.dir, tz = p.dz * this.dir;
      const rx = -tz, rz = tx;
      const x = p.x + rx * this.laneOffset, z = p.z + rz * this.laneOffset;
      const roadHeading = Math.atan2(tx, tz);
      const y = CC.underpassVehicleHeightAt
        ? CC.underpassVehicleHeightAt(x, z, roadHeading, this.visual.spec.wheelRadius)
        : CC.heightAt(x, z) + this.visual.spec.wheelRadius;
      this.group.position.set(x, y, z);
      const latRate = (this.laneOffset - prevLane) / Math.max(dt, 1e-4);
      const vLat = U.clamp(latRate / Math.max(this.speed, 2), -0.55, 0.55);
      this.group.rotation.y = U.angleLerp(this.group.rotation.y,
        Math.atan2(tx + rx * vLat, tz + rz * vLat), 1 - Math.exp(-9 * dt));
      const spin = (this.speed / this.visual.spec.wheelRadius) * dt;
      for (let i = 0; i < this.visual.wheels.length; i++) this.visual.wheels[i].rotation.y += spin;
      const braking = this.target < this.speed - 1.2;
      if (CC.EnvironmentManager) {
        const night = CC.Weather ? U.clamp(CC.Weather.night || 0, 0, 1) : 0;
        CC.EnvironmentManager.updateVehicleLights(this.visual, braking, night);
      } else {
        this.visual.brakeMat.emissive.setHex(braking ? 0xff2a14 : 0x000000);
        this.visual.brakeMat.emissiveIntensity = braking ? 1.6 : 0;
      }

      // Contact with the player.
      const ddx = player.pos.x - x, ddz = player.pos.z - z;
      const dist = Math.hypot(ddx, ddz);
      const minD = this.radius + ((player.spec && player.spec.radius) || 0.8);
      if (dist < minD && dist > 0.01) {
        const nx = ddx / dist, nz = ddz / dist;
        player.pos.x = x + nx * minD;
        player.pos.z = z + nz * minD;
        const impactSpeed = Math.abs(player.speed);
        player.speed *= 0.62;
        player.latVel += (Math.random() - 0.5) * 3;
        if (player.registerCrash && impactSpeed > 8) {
          player.registerCrash(impactSpeed);
        }
        if (this.hornCooldown <= 0) {
          this.hornCooldown = 2;
          if (audio) audio.honk(1);
        }
      }

      // NPC car-to-car contact. Ordinary drivers separate quietly; reckless
      // ones keep their foot down long enough to actually clip the other car.
      let hit = null, hitDist = Infinity;
      for (let i = 0; i < drivers.length; i++) {
        const o = drivers[i];
        if (o === this || o === player || o.disabled || !o.group) continue;
        const q = o.group.position;
        // Cheap AABB reject: contact radii are only a few metres.
        if (Math.abs(q.x - x) > 8 || Math.abs(q.z - z) > 8) continue;
        const d = U.distance2D(x, z, q.x, q.z);
        const contactD = this.radius + (o.radius || 1.0);
        if (d < contactD && d < hitDist) { hit = o; hitDist = d; }
      }
      if (hit) {
        const q = hit.group.position;
        this.s -= this.dir * (ramming ? 0.5 : 1.1);
        if (hit.s != null && hit.dir != null) hit.s -= hit.dir * (ramming ? 0.8 : 0.5);
        this.speed *= ramming ? 0.84 : 0.62;
        if (hit.speed != null) hit.speed *= 0.82;
        if (world && world.particles && world.particles.spawn) {
          const mx = (x + q.x) * 0.5, mz = (z + q.z) * 0.5;
          world.particles.spawn(mx, CC.heightAt(mx, mz) + 0.8, mz, 12, 0xffc36b, 0.9);
        }
        if (this.recklessCrashCooldown <= 0) {
          if (sys.recklessCrashes != null) sys.recklessCrashes++;
          this.recklessCrashCooldown = 1.8;
        }
        if (audio && this.hornCooldown <= 0) {
          this.hornCooldown = 1.5;
          audio.honk(1);
        }
      }

      // Reckless drivers clip pedestrians near the shoulder and shove them
      // off the road using the same flee fields the gang robberies use.
      if (this.speed > 5 && peds.length && !this.yieldingPed) {
        let victim = null, victimDist = Infinity;
        const hitR = this.radius + 1.2, hitR2 = hitR * hitR;
        for (let i = 0; i < peds.length; i++) {
          const ped = peds[i];
          if (!ped || !ped.position || ped.inVehicle || ped.hitCooldown > 0) continue;
          const vx = ped.position.x - x, vz = ped.position.z - z;
          const pd2 = vx * vx + vz * vz;
          if (pd2 < hitR2 && pd2 < victimDist) { victim = ped; victimDist = pd2; }
        }
        if (victim && typeof sys.knockPedestrian === 'function') {
          const lx = victim.position.x - x, lz = victim.position.z - z;
          const side = (lx * rx + lz * rz) >= 0 ? 1 : -1;
          sys.knockPedestrian(victim, rx * side, rz * side, this.speed);
        }
      }

      this.emitExhaust(dt);
    }

    emitExhaust(dt) {
      const world = CC.World;
      if (!world || !world.particles || this.disabled || this.kind === 'boat') return;
      this.exhaustTimer -= dt;
      const heavy = !!this.heavySmoker;
      const interval = heavy ? 0.12 : 0.28;
      if (this.exhaustTimer > 0) return;
      this.exhaustTimer = interval;
      const x = this.group.position.x, z = this.group.position.z;
      const h = this.group.rotation.y;
      const fx = Math.sin(h), fz = Math.cos(h);
      const rx = Math.cos(h), rz = -Math.sin(h);
      const spec = this.visual.spec || {};
      const len = spec.length || 4.2;
      const width = spec.width || 1.8;
      const ex = x - fx * len * 0.52 + rx * width * 0.18;
      const ey = this.group.position.y + Math.max(0.16, (spec.wheelRadius || 0.34) * 0.55);
      const ez = z - fz * len * 0.52 + rz * width * 0.18;
      const moving = Math.abs(this.speed || 0) > 0.4;
      const color = heavy ? 0xc9cfd3 : 0xdfe4e7;
      const strength = heavy ? 0.16 : 0.07;
      const opts = { spread: 0.06, rise: 0.1, vy: 0.22, vxz: 0.1, life: heavy ? 0.6 : 0.38, vx: -fx * 0.45, vz: -fz * 0.45, baseVy: 0.02 };
      world.particles.spawn(ex, ey, ez, 1, color, strength, opts);
      if (heavy && moving && Math.random() < 0.3) world.particles.spawn(ex - fx * 0.05, ey + 0.02, ez - fz * 0.05, 1, 0xd2d8dc, strength * 0.55, opts);
    }
  }

  /* ---------- stealable parked cars ---------- */
  class ParkedCar {
    constructor(scene, x, z, heading, kind, color) {
      this.kind = kind;
      this.groupHome = { x: x, z: z, h: heading };
      this.visual = CC.VehicleFactory.build(kind, color);
      this.group = this.visual.group;
      this.radius = this.visual.spec.radius;
      this.stolen = false;
      scene.add(this.group);
      this.placeAt(x, z, heading);
    }

    placeAt(x, z, heading) {
      this.home = { x: x, z: z, h: heading };
      this.group.position.set(x, CC.heightAt(x, z) + this.visual.spec.wheelRadius, z);
      this.group.rotation.y = heading;
    }

    setStolen(stolen) {
      this.stolen = !!stolen;
      this.group.visible = !this.stolen;
    }

    get pos() { return this.group.position; }
  }

  /* ---------- police ---------- */
  class PoliceCar {
    constructor(scene, road, s, dir) {
      this.road = road;
      this.s = s;
      this.dir = dir;
      this.lane = 2.7;
      this.visual = CC.VehicleFactory.build('car', 0xf3f4f0, 'police');
      this.group = this.visual.group;
      scene.add(this.group);
      this.radius = this.visual.spec.radius;
      this.pos = new THREE.Vector3();
      this.heading = 0;
      this.speed = 13 * pace('traffic');
      this.patrolSpeed = U.randRange(rng, 16, 20) * pace('traffic');
      this.chaseSpeed = U.randRange(rng, 30, 35) * pace('traffic');
      this.mode = 'patrol';
      this.chase = false;
      this.chaseDelay = 0;
      this.phase = rng() * Math.PI * 2;
      this.sirenTimer = 0;
      this.crashCooldown = 0;
      this.fireCooldown = U.randRange(rng, 0.4, 1.5);
      this.exhaustTimer = Math.random() * 0.25;
      this.heavySmoker = false;

      const blue = mat(0x204c86);
      [-1.05, 1.05].forEach(function (x) {
        this.group.add(box(0.1, 0.46, 3.2, blue, x, 1.0, 0));
      }, this);
      this.group.add(box(1.85, 0.16, 0.5, mat(0x252c31), 0, 2.05, -0.2));
      this.redMat = new THREE.MeshStandardMaterial({
        color: 0xd84035, emissive: 0xff2a14, emissiveIntensity: 0.05, flatShading: true
      });
      this.blueMat = new THREE.MeshStandardMaterial({
        color: 0x3d8fe0, emissive: 0x2a7ee8, emissiveIntensity: 0.05, flatShading: true
      });
      this.group.add(box(0.8, 0.25, 0.48, this.redMat, -0.46, 2.24, -0.2));
      this.group.add(box(0.8, 0.25, 0.48, this.blueMat, 0.46, 2.24, -0.2));
      this.setRoadPose();
    }

    setRoadPose() {
      const p = CC.sampleRoad(this.road, this.s);
      const tx = p.dx * this.dir, tz = p.dz * this.dir;
      const rx = -tz, rz = tx;
      const x = p.x + rx * this.lane, z = p.z + rz * this.lane;
      const roadHeading = Math.atan2(tx, tz);
      const y = CC.underpassVehicleHeightAt
        ? CC.underpassVehicleHeightAt(x, z, roadHeading, this.visual.spec.wheelRadius)
        : CC.heightAt(x, z) + this.visual.spec.wheelRadius;
      this.pos.set(x, y, z);
      this.heading = U.angleLerp(this.heading, roadHeading, 1);
      this.group.position.copy(this.pos);
      this.group.rotation.y = this.heading;
    }

    leaveRoad(atEnd) {
      const road = this.road;
      const conn = atEnd ? road._endConnection : road._startConnection;
      if (conn && conn.road) {
        this.road = conn.road;
        this.dir = conn.dir;
        this.s = U.clamp(conn.s + this.dir * 6, 6, conn.road._length - 6);
      } else {
        this.dir = atEnd ? -1 : 1;
        this.s = atEnd ? road._length - 8 : 8;
      }
    }

    isSafe(x, z) {
      const W = C.WORLD;
      if (x < W.minX + 6 || x > W.maxX - 6 || z < W.minZ + 6 || z > W.maxZ - 6) return false;
      if (CC.coast.isWater(x, z) || CC.coast.distanceToWater(x, z) < 3) return false;
      let safe = true;
      const reach = this.radius * 0.4 + 6;
      CC.forEachNearbyObstacle(x, z, reach, function (o) {
        const minD = o.r + reach;
        if ((x - o.x) * (x - o.x) + (z - o.z) * (z - o.z) < minD * minD) safe = false;
      });
      return safe;
    }

    update(dt, player, world, audio) {
      if (this.disabled) return;
      this.sirenTimer = Math.max(0, this.sirenTimer - dt);
      this.crashCooldown = Math.max(0, this.crashCooldown - dt);
      this.fireCooldown = Math.max(0, this.fireCooldown - dt);
      // A cruiser can be assigned to a teen motorcycle crew instead of the
      // player. The chase target is then the suspect, not the player.
      const target = (this.teenSuspect && !this.teenSuspect.caught && this.teenSuspect.pos)
        ? this.teenSuspect : player;
      const isTeen = target !== player;
      const dx = target.pos.x - this.pos.x, dz = target.pos.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      this.chaseDelay = Math.max(0, this.chaseDelay - dt);
      const canChase = !!this.chase && this.chaseDelay <= 0 &&
        !target.isAircraft && !(target.spec && target.spec.water);
      this.mode = canChase && dist < 320 ? 'chase' : 'patrol';

      if (this.mode === 'patrol') {
        this.speed = U.damp(this.speed, this.patrolSpeed, 1.2, dt);
        this.s += this.speed * this.dir * dt;
        const road = this.road;
        if (!road.closed) {
          if (this.dir > 0 && this.s > road._length - 4) this.leaveRoad(true);
          else if (this.dir < 0 && this.s < 4) this.leaveRoad(false);
        }
        if (this.s > this.road._length) this.s -= this.road._length;
        if (this.s < 0) this.s += this.road._length;
        this.setRoadPose();
      } else {
        this.heading = U.angleLerp(this.heading, Math.atan2(dx, dz), 1 - Math.exp(-3.4 * dt));
        const targetSpeed = dist < 9 ? Math.max(9, dist * 1.8) : this.chaseSpeed;
        this.speed = U.damp(this.speed, targetSpeed, 1.8, dt);
        const f = { x: Math.sin(this.heading), z: Math.cos(this.heading) };
        const right = { x: Math.cos(this.heading), z: -Math.sin(this.heading) };
        const step = this.speed * dt;
        let nx = this.pos.x + f.x * step, nz = this.pos.z + f.z * step;
        if (!this.isSafe(nx, nz)) {
          const a = { x: nx + right.x * step * 0.9, z: nz + right.z * step * 0.9 };
          const b = { x: nx - right.x * step * 0.9, z: nz - right.z * step * 0.9 };
          if (this.isSafe(a.x, a.z)) { nx = a.x; nz = a.z; }
          else if (this.isSafe(b.x, b.z)) { nx = b.x; nz = b.z; }
          else { nx = this.pos.x; nz = this.pos.z; this.heading += Math.PI * 0.5 * dt * 4; }
        }
        const y = CC.underpassVehicleHeightAt
          ? CC.underpassVehicleHeightAt(nx, nz, this.heading, this.visual.spec.wheelRadius)
          : CC.heightAt(nx, nz) + this.visual.spec.wheelRadius;
        this.pos.set(nx, y, nz);
        this.group.position.copy(this.pos);
        this.group.rotation.y = this.heading;
      }
      const spin = (this.speed / this.visual.spec.wheelRadius) * dt;
      for (let i = 0; i < this.visual.wheels.length; i++) this.visual.wheels[i].rotation.y += spin;

      const pulse = Math.sin(performance.now() * 0.014 + this.phase) > 0;
      this.redMat.emissiveIntensity = pulse ? 2.8 : 0.05;
      this.blueMat.emissiveIntensity = pulse ? 0.05 : 2.8;
      const siren = this.visual.sirenMats;
      if (siren && siren.red && siren.blue) {
        siren.red.emissiveIntensity = pulse ? 2.8 : 0.05;
        siren.blue.emissiveIntensity = pulse ? 0.05 : 2.8;
      }
      this.emitExhaust(dt);
      if (this.mode === 'chase' && this.sirenTimer <= 0 && audio && audio.siren) {
        this.sirenTimer = 2.3;
        audio.siren();
      }
      if (!isTeen && this.mode === 'chase' && dist < 130 && CC.NPCSystem.policeSeen) {
        CC.NPCSystem.policeSeen();
        if (dist < 70 && this.fireCooldown <= 0 && CC.NPCSystem.policeFire) {
          this.fireCooldown = U.randRange(rng, 0.9, 1.8);
          const f = { x: Math.sin(this.heading), z: Math.cos(this.heading) };
          CC.NPCSystem.policeFire(
            this.pos.x + f.x * 1.6, this.pos.y + 1.3, this.pos.z + f.z * 1.6,
            player.pos.x, player.pos.y + 0.9, player.pos.z,
            U.clamp(0.5 - dist / 260, 0.16, 0.5)
          );
        }
      }

      // Contact: a cruiser that reaches a teen suspect arrests them; contact
      // with the player follows the existing wanted/arrest rules.
      const pdx = target.pos.x - this.pos.x, pdz = target.pos.z - this.pos.z;
      const pDist = Math.hypot(pdx, pdz);
      const minD = this.radius + ((target.spec && target.spec.radius) || 0.8);
      if (pDist < minD + 0.4 && pDist > 0.001) {
        const nx = pdx / pDist, nz = pdz / pDist;
        const impactSpeed = Math.abs(target.speed || 0);
        if (isTeen) {
          if (this.mode === 'chase' && CC.TeenGangSystem && CC.TeenGangSystem.arrest) {
            CC.TeenGangSystem.arrest(target, this);
          }
        } else {
          // A cruiser can ram and damage a wanted car, but it cannot book the
          // player. Arrests only happen after bailing out onto the sidewalk.
          target.pos.x = this.pos.x + nx * (minD + 0.4);
          target.pos.z = this.pos.z + nz * (minD + 0.4);
          target.speed *= 0.7;
          // Walking into a parked cruiser is not a crime. Only a driven car
          // that rams one earns the extra wanted star.
          if (!target.isPedestrian && impactSpeed > 7 && this.crashCooldown <= 0) {
            this.crashCooldown = 1.6;
            if (target.registerCrash) target.registerCrash(impactSpeed);
            if (CC.NPCSystem && CC.NPCSystem.reportCrime) {
              CC.NPCSystem.reportCrime('Hit a police car');
            }
          }
        }
      }
    }

    emitExhaust(dt) {
      const world = CC.World;
      if (!world || !world.particles || this.disabled) return;
      this.exhaustTimer -= dt;
      const heavy = !!this.heavySmoker;
      const interval = heavy ? 0.12 : 0.28;
      if (this.exhaustTimer > 0) return;
      this.exhaustTimer = interval;
      const x = this.pos.x, z = this.pos.z;
      const h = this.heading;
      const fx = Math.sin(h), fz = Math.cos(h);
      const rx = Math.cos(h), rz = -Math.sin(h);
      const spec = this.visual.spec || {};
      const len = spec.length || 4.8;
      const width = spec.width || 2.0;
      const ex = x - fx * len * 0.52 + rx * width * 0.18;
      const ey = this.pos.y + Math.max(0.16, (spec.wheelRadius || 0.36) * 0.55);
      const ez = z - fz * len * 0.52 + rz * width * 0.18;
      const moving = Math.abs(this.speed || 0) > 0.4;
      const color = heavy ? 0xc9cfd3 : 0xdfe4e7;
      const strength = heavy ? 0.16 : 0.07;
      const opts = { spread: 0.06, rise: 0.1, vy: 0.22, vxz: 0.1, life: heavy ? 0.6 : 0.38, vx: -fx * 0.45, vz: -fz * 0.45, baseVy: 0.02 };
      world.particles.spawn(ex, ey, ez, 1, color, strength, opts);
      if (heavy && moving && Math.random() < 0.3) world.particles.spawn(ex - fx * 0.05, ey + 0.02, ez - fz * 0.05, 1, 0xd2d8dc, strength * 0.55, opts);
    }
  }

  // Four-star backup: a pair of hovering helicopters with searchlights. They
  // stay parked and invisible until the wanted level earns their dispatch.
  class PoliceHelicopter {
    constructor(scene, index) {
      this.index = index;
      this.visual = CC.VehicleFactory.build('helicopter', 0xf2f4f6);
      this.group = this.visual.group;
      scene.add(this.group);
      const blue = mat(0x24528c);
      this.group.add(box(1.7, 0.45, 6.2, blue, 0, 0.65, 0));
      this.group.add(box(0.7, 0.26, 3.2, blue, 0, 0.95, 0));
      this.redMat = new THREE.MeshStandardMaterial({
        color: 0xd84035, emissive: 0xff2a14, emissiveIntensity: 0.05, flatShading: true
      });
      this.blueMat = new THREE.MeshStandardMaterial({
        color: 0x3d8fe0, emissive: 0x2a7ee8, emissiveIntensity: 0.05, flatShading: true
      });
      this.group.add(box(0.5, 0.25, 0.55, this.redMat, -0.4, 1.0, -2.3));
      this.group.add(box(0.5, 0.25, 0.55, this.blueMat, 0.4, 1.0, -2.3));
      const beam = new THREE.Mesh(
        new THREE.ConeGeometry(7, 24, 14, 1, true),
        new THREE.MeshBasicMaterial({
          color: 0xdcecff, transparent: true, opacity: 0.12,
          blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false
        })
      );
      beam.position.y = -12;
      this.group.add(beam);
      this.pos = new THREE.Vector3(index * 30 - 15, 80, 0);
      this.heading = 0;
      this.t = index * 2.4;
      this.fireCooldown = U.randRange(rng, 0.6, 1.6);
      this.active = false;
      this.setVisible(false);
    }

    setVisible(v) { this.group.visible = v; }

    update(dt, player, world, audio) {
      const active = !!(CC.NPCSystem && CC.NPCSystem.wantedStars >= 4 && !player.exploded);
      this.active = active;
      this.setVisible(active);
      if (!active) return;
      this.t += dt;
      this.fireCooldown = Math.max(0, this.fireCooldown - dt);

      const px = player.pos.x, pz = player.pos.z;
      const orbit = this.t * 0.34 + this.index * Math.PI;
      const side = this.index ? -1 : 1;
      const tx = px + Math.cos(orbit) * 38 + side * 18;
      const tz = pz + Math.sin(orbit) * 38 - 12;
      const ground = CC.heightAt(px, pz);
      const ty = Math.max(ground + 58 + this.index * 9, (player.pos.y || ground) + 38);
      const k = 1 - Math.exp(-0.85 * dt);
      this.pos.x += (tx - this.pos.x) * k;
      this.pos.y += (ty - this.pos.y) * k;
      this.pos.z += (tz - this.pos.z) * k;
      this.heading = U.angleLerp(this.heading, Math.atan2(px - this.pos.x, pz - this.pos.z), 1 - Math.exp(-2.6 * dt));
      this.group.position.copy(this.pos);
      this.group.rotation.y = this.heading;
      this.group.rotation.z = Math.sin(this.t * 1.3) * 0.08;
      if (this.visual.spin.rotor) this.visual.spin.rotor.rotation.y += dt * 26;
      if (this.visual.spin.tailRotor) this.visual.spin.tailRotor.rotation.x += dt * 32;
      const pulse = Math.sin(performance.now() * 0.015 + this.index) > 0;
      this.redMat.emissiveIntensity = pulse ? 3 : 0.05;
      this.blueMat.emissiveIntensity = pulse ? 0.05 : 3;

      const dist = U.distance2D(this.pos.x, this.pos.z, px, pz);
      if (dist < 190) CC.NPCSystem.policeSeen();
      if (dist < 120 && this.fireCooldown <= 0 && CC.NPCSystem.policeFire) {
        this.fireCooldown = U.randRange(rng, 0.65, 1.25);
        const f = { x: Math.sin(this.heading), z: Math.cos(this.heading) };
        CC.NPCSystem.policeFire(
          this.pos.x + f.x * 2, this.pos.y - 1.2, this.pos.z + f.z * 2,
          player.pos.x, player.pos.y + 0.9, player.pos.z,
          U.clamp(0.62 - dist / 500, 0.3, 0.62)
        );
      }
    }
  }

  /* ---------- pedestrians ---------- */
  const shirtColors = [0xe4796a, 0x6fa7c4, 0xe3c165, 0x8fb782, 0xc48fb5, 0xe4e0d2, 0x5b7890];
  const skinColors = [0xe8bd96, 0xc98d63, 0x8d5c3f, 0xf0c9a8, 0x6f4a33];

  class Pedestrian {
    constructor(scene, x, z, role, owner) {
      this.role = role || 'walk';
      this.owner = owner || null;
      this.group = new THREE.Group();
      this.isWorker = this.role === 'worker' || this.role === 'vendor';
      this.isEscort = this.role === 'escort';
      this.isMotel = this.isEscort && !!(owner && owner.motel);
      this.motelSlot = owner && typeof owner.slot === 'number' ? owner.slot : 0;
      this.motelHailing = false;
      this.isGang = this.role === 'gang';
      this.isPatron = this.role === 'patron';
      this.isRoach = this.role === 'roach';
      this.isBoardwalker = this.role === 'boardwalk' || this.role === 'pierwalk' || this.role === 'pierfish';
      this.path = owner && owner.path ? owner.path : null;
      this.deckOffset = owner && typeof owner.deckOffset === 'number' ? owner.deckOffset : 0;
      this.deckY = owner && typeof owner.deckY === 'number' ? owner.deckY : null;
      const standingY = this.deckY != null ? this.deckY : CC.heightAt(x, z) + this.deckOffset;
      this.position = new THREE.Vector3(x, standingY, z);
      this.gang = owner && owner.gang || null;
      this.inVehicle = false;
      this.pickupCooldown = 0;
      this.crimeTimer = U.randRange(rng, 2, 8);
      this.crimeCooldown = U.randRange(rng, 1, 4);
      this.crimeTarget = null;
      this.homeRadius = (this.isEscort || this.isPatron) ?
        (owner && owner.spread ? owner.spread : 26) : 2;
      this.workHome = owner && typeof owner.x === 'number' && typeof owner.z === 'number' ?
        new THREE.Vector2(owner.x, owner.z) : new THREE.Vector2(x, z);
      this.workTarget = this.workHome.clone();
      this.workFacing = owner && typeof owner.yaw === 'number' ? owner.yaw : -Math.PI / 2;
      this.workTimer = U.randRange(rng, 0.5, 3);
      this.heading = rng() * Math.PI * 2;
      this.speed = this.isRoach ? U.randRange(rng, 2.2, 3.4) :
        pace('walker') * (this.role === 'cop' ? U.randRange(rng, 1.7, 2.4) :
          this.isGang ? U.randRange(rng, 2.0, 2.9) : U.randRange(rng, 0.9, 1.6));
      this.target = new THREE.Vector2(x, z);
      this.idleTimer = U.randRange(rng, 1, 5);
      this.fleeTimer = 0;
      this.hitCooldown = 0;
      this.fireCooldown = U.randRange(rng, 0.5, 2.5);
      this.vy = 0;
      this.fleeX = 0; this.fleeZ = 0;
      this.walkPhase = rng() * Math.PI * 2;
      if (this.isRoach) {
        // A flight is a relocation, not a lap: it ends at a new piece of town
        // with a fresh ground perimeter centred on the landing spot.
        this.homeRadius = U.randRange(rng, 5, 9);
        this.flyTimer = 0;
        this.flyDuration = 0;
        this.flyAltitude = 0;
        this.inFlight = false;
        this.flyCooldown = U.randRange(rng, 5, 12);
        this.flyTarget = new THREE.Vector2(x, z);
        this.roachClipName = '';
      }

      const cop = this.role === 'cop';
      const worker = this.isWorker;
      const escort = this.isEscort;
      const gang = this.isGang;
      const shopColor = owner && owner.color ? owner.color : 0x2f95ad;
      const escortColor = U.pick(rng, [0xc04478, 0x7c4bb0, 0xd07c3a, 0x2f8f99, 0x9b3b4c]);
      const character = CC.CharacterFactory.build({
        skin: U.pick(rng, skinColors),
        shirt: cop ? 0x254f86 : gang ? U.pick(rng, [0x23262d, 0x33262e, 0x28342f]) :
          escort ? escortColor : worker ? shopColor : U.pick(rng, shirtColors),
        pants: cop ? 0x1d2733 : gang ? 0x16191e :
          escort ? U.pick(rng, [0x272b30, 0x46343d, 0x4a3f34]) :
            worker ? U.pick(rng, [0x3f4a5a, 0x4a4b48, 0x5b5147]) :
              U.pick(rng, [0x4a5b68, 0x6b5f4d, 0x3f4a5a]),
        hair: U.pick(rng, [0x3b2c24, 0x1f1b18, 0x7a4b2a, 0x111111]),
        hat: cop ? 0x172e4c : gang ? 0x111318 : escort ? 0 :
          worker ? U.pick(rng, [0xf0e8d5, 0x2f7d88, shopColor]) :
            (rng() < 0.28 ? U.pick(rng, [0x2f7d88, 0x9a4c3f, 0xd7c9a3]) : 0),
        bag: cop ? 0x2b3138 : gang ? 0 : escort ? 0x2b2429 : worker ? 0xf2ead8 : (rng() < 0.2 ? 0x8f5b45 : 0)
      });
      this.group = character.group;
      this.head = character.head;
      this.legL = character.legL; this.legR = character.legR;
      this.armL = character.armL; this.armR = character.armR;

      if (cop) {
        const badge = new THREE.Mesh(new THREE.CircleGeometry(0.11, 6), mat(0xe7c76a));
        badge.position.set(-0.22, 1.42, 0.28);
        this.group.add(badge);
        this.group.add(box(0.72, 0.11, 0.42, mat(0x161b20), 0, 1.12, 0.02));
      }
      if (gang) {
        const gun = box(0.12, 0.12, 0.62, mat(0x24282c), 0.38, 1.06, 0.34);
        this.group.add(gun);
        this.gunMesh = gun;
      }
      if (worker) {
        // Apron and name tag make boardwalk clerks and cart vendors readable
        // from the walkway without needing a separate character model.
        this.group.add(box(0.72, 0.95, 0.08, mat(shopColor), 0, 1.02, 0.3));
        this.group.add(box(0.46, 0.09, 0.06, mat(0xf6f1e3), 0.18, 1.2, 0.36));
      }
      if (this.role === 'fish' || this.role === 'pierfish') {
        const rod = box(0.04, 2.2, 0.04, mat(0x8a704b), 0.42, 1.8, 0.5);
        rod.rotation.x = -0.6;
        this.group.add(rod);
      }
      if (this.isPatron) {
        // Park guests carry balloons or little cameras so the midway reads as
        // a crowd rather than generic sidewalk traffic.
        if (rng() < 0.55) {
          const color = U.pick(rng, [0xe45745, 0x4e9bd0, 0xf2c94c, 0x62a878]);
          this.group.add(box(0.035, 1.9, 0.035, mat(0xd8d2c4), 0.42, 1.65, 0));
          const balloon = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), mat(color));
          balloon.position.set(0.42, 2.75, 0);
          balloon.scale.y = 1.2;
          this.group.add(balloon);
        } else {
          this.group.add(box(0.28, 0.2, 0.16, mat(0x30353a), 0.36, 1.28, 0.3));
        }
      }
      if (this.role === 'dog') {
        this.dog = new THREE.Group();
        const dogMat = mat(U.pick(rng, [0x9a744d, 0x5d5147, 0xd2c0a0]));
        this.dog.add(box(0.42, 0.35, 0.8, dogMat, 0, 0.38, 0));
        const dh = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 5), dogMat);
        dh.position.set(0, 0.48, 0.48);
        this.dog.add(dh);
        for (const x of [-0.16, 0.16]) for (const z of [-0.28, 0.28]) {
          this.dog.add(box(0.09, 0.32, 0.09, dogMat, x, 0.16, z));
        }
        this.dog.position.set(0.9, 0, -0.3);
        this.group.add(this.dog);
      }
      this.group.position.copy(this.position);
      scene.add(this.group);
    }

    // Swap the procedural body for one of the downloaded animated characters.
    // The original rig is kept (just hidden) so all existing AI/animation code
    // can keep running unchanged.
    attachDownloaded(key, opts) {
      const ped = this;
      if (!CC.DownloadedCharacterLoader || !CC.DownloadedCharacterLoader.build) return;
      CC.DownloadedCharacterLoader.build(key, opts || {}).then(function (rig) {
        if (!rig || ped.downloaded) return;
        ped.group.children.forEach(function (child) { child.visible = false; });
        ped.group.add(rig.group);
        ped.downloaded = rig;
        ped.downloadedKey = key;
        if (opts && opts.radius != null) ped.radius = opts.radius;
        else if (rig.radius) ped.radius = rig.radius;
      }).catch(function (e) {
        // Keep the procedural pedestrian if the optional GLB loader is unavailable.
        if (CC.DownloadedCharacterLoader) {
          CC.DownloadedCharacterLoader.lastError = String((e && (e.stack || e)) || e);
        }
      });
    }

    // Switch the downloaded roach rig without restarting an identical clip,
    // and force the ground clips back after a flight (setMoving alone can miss
    // a transition when the walk state did not change during the sortie).
    roachPlayClip(name) {
      const rig = this.downloaded;
      if (!rig || this.roachClipName === name) return;
      if (!rig.setClip(name, true)) rig.setClip('Fly', true);
      this.roachClipName = name;
    }

    roachGroundClip(moving) {
      if (!this.downloaded) return;
      const name = moving ? 'Walk' : 'Idle';
      this.downloaded.setMoving(moving);
      if (this.roachClipName !== name) {
        this.downloaded.setClip(name, true);
        this.roachClipName = name;
      }
    }

    roachLandingSpot() {
      const obstacles = (CC.World && CC.World.obstacles) || [];
      const clear = function (x, z) {
        for (let i = 0; i < obstacles.length; i++) {
          const o = obstacles[i];
          if (U.distance2D(x, z, o.x, o.z) < (o.r || 1) + 3) return false;
        }
        return true;
      };
      // Prefer a fresh patch 18-52 units away; widen the search if the town is
      // crowded. Always end on land, never in the surf.
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < 24; i++) {
          const a = rng() * Math.PI * 2;
          const r = pass === 0 ? U.randRange(rng, 18, 52) : U.randRange(rng, 55, 90);
          const nx = this.position.x + Math.cos(a) * r;
          const nz = this.position.z + Math.sin(a) * r;
          if (CC.coast.isWater(nx, nz) || CC.coast.distanceToWater(nx, nz) < 2) continue;
          if (!clear(nx, nz)) continue;
          return new THREE.Vector2(nx, nz);
        }
      }
      return new THREE.Vector2(
        this.position.x + U.randRange(rng, -8, 8),
        this.position.z + U.randRange(rng, -8, 8)
      );
    }

    startRoachFlight() {
      this.flyTarget.copy(this.roachLandingSpot());
      this.flyDuration = U.randRange(rng, 5, 8);
      this.flyTimer = this.flyDuration;
      this.flyAltitude = U.randRange(rng, 6, 13);
      this.inFlight = true;
      this.flyCooldown = 0;
      this.idleTimer = 0;
      this.roachPlayClip(ROACH_FLY_LAUNCH);
    }

    endRoachFlight(relocate) {
      if (!this.inFlight) return;
      this.inFlight = false;
      this.flyTimer = 0;
      if (relocate) {
        this.workHome.copy(this.flyTarget);
        this.homeRadius = U.randRange(rng, 5, 9);
        this.position.x = this.flyTarget.x;
        this.position.z = this.flyTarget.y;
        this.position.y = CC.heightAt(this.position.x, this.position.z);
        this.target.set(
          this.workHome.x + U.randRange(rng, -this.homeRadius, this.homeRadius),
          this.workHome.y + U.randRange(rng, -this.homeRadius, this.homeRadius)
        );
        this.flyCooldown = U.randRange(rng, 10, 18);
      } else {
        this.flyCooldown = U.randRange(rng, 6, 12);
      }
      this.idleTimer = U.randRange(rng, 0.6, 2.2);
      this.roachGroundClip(false);
    }

    chooseTarget() {
      for (let i = 0; i < 8; i++) {
        const a = rng() * Math.PI * 2;
        const d = U.randRange(rng, 6, 24);
        const x = this.position.x + Math.cos(a) * d;
        const z = this.position.z + Math.sin(a) * d;
        if (!CC.coast.isWater(x, z) && CC.coast.distanceToWater(x, z) > 3) {
          const nr = CC.nearestRoad(x, z);
          if (!nr || nr.dist > 2) { this.target.set(x, z); return; }
        }
      }
      this.target.set(this.position.x + U.randRange(rng, -5, 5), this.position.z + U.randRange(rng, -5, 5));
    }

    choosePathTarget() {
      const p = this.path;
      if (!p) { this.chooseTarget(); return; }
      const alongZ = typeof p.minZ === 'number' && typeof p.maxZ === 'number';
      if (alongZ) {
        const z = U.randRange(rng, p.minZ, p.maxZ);
        const x = p.xAt ? p.xAt(z, p.offset || 0) : (p.x || this.position.x);
        this.target.set(x, z);
      } else {
        const x = U.randRange(rng, p.minX, p.maxX);
        const z = (p.z || 0) + U.randRange(rng, -(p.halfZ || 0), (p.halfZ || 0));
        this.target.set(x, z);
      }
    }

    chooseEscortTarget() {
      const home = this.workHome;
      for (let i = 0; i < 12; i++) {
        const a = rng() * Math.PI * 2;
        const d = U.randRange(rng, 3, this.homeRadius);
        const x = home.x + Math.cos(a) * d;
        const z = home.y + Math.sin(a) * d;
        if (CC.coast.isWater(x, z) || CC.coast.distanceToWater(x, z) < 2) continue;
        this.target.set(x, z);
        return;
      }
      this.target.set(home.x, home.y);
    }

    // Motel companions work the parking lot and drift toward any car that
    // actually stops nearby. Everything stays non-explicit: they wave, then
    // the existing horn/pickup interaction handles the rest.
    findStoppedCar() {
      // Several motel regulars call this every frame. Refreshing a few times a
      // second is plenty for a pedestrian wandering a parking lot.
      const now = CC.Game ? CC.Game.time : performance.now() * 0.001;
      if (this._stoppedScanAt != null && now - this._stoppedScanAt < 0.25) {
        return this._stoppedCar;
      }
      this._stoppedScanAt = now;
      const home = this.workHome;
      const stopped = [];
      const player = CC.Game && CC.Game.vehicles && CC.Game.vehicles[CC.Game.activeKey];
      if (player && !player.isPedestrian && !player.isAircraft &&
          !(player.spec && player.spec.water) && Math.abs(player.speed) < 2.2 &&
          U.distance2D(player.pos.x, player.pos.z, home.x, home.y) < 30) {
        stopped.push({ pos: player.pos, priority: 0 });
      }
      (NPCSystem.traffic || []).forEach(function (car) {
        if (Math.abs(car.speed) >= 1.6 || !car.group) return;
        if (U.distance2D(car.group.position.x, car.group.position.z, home.x, home.y) < 26) {
          stopped.push({ pos: car.group.position, priority: 1 });
        }
      }, this);
      if (!stopped.length) { this._stoppedCar = null; return null; }
      stopped.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return U.distance2D(a.pos.x, a.pos.z, this.position.x, this.position.z) -
          U.distance2D(b.pos.x, b.pos.z, this.position.x, this.position.z);
      });
      // Keep the lot from swarming: only the first two regulars work the player.
      const chosen = stopped[0];
      this._stoppedCar = (!chosen || (chosen.priority === 0 && this.motelSlot > 1))
        ? null : chosen;
      return this._stoppedCar;
    }

    chooseGangTarget() {
      const people = NPCSystem.pedestrians.filter(function (p) {
        return p !== this && !p.isGang && !p.isRoach && p.role !== 'cop' && !p.inVehicle &&
          U.distance2D(p.position.x, p.position.z, this.position.x, this.position.z) < 55;
      }, this);
      const cars = NPCSystem.parkedCars.filter(function (c) {
        return !c.stolen && !c.disabled &&
          U.distance2D(c.pos.x, c.pos.z, this.position.x, this.position.z) < 45;
      }, this);
      if (cars.length && (!people.length || rng() < 0.42)) {
        this.crimeTarget = { type: 'car', ref: cars[Math.floor(rng() * cars.length)] };
      } else if (people.length) {
        this.crimeTarget = { type: 'person', ref: people[Math.floor(rng() * people.length)] };
      } else {
        this.crimeTarget = null;
        this.chooseTarget();
      }
    }

    update(dt, player, world) {
      if (this.inVehicle || this.abducted) return;
      const startX = this.position.x, startZ = this.position.z;
      this.pickupCooldown = Math.max(0, this.pickupCooldown - dt);
      const dx = this.position.x - player.pos.x;
      const dz = this.position.z - player.pos.z;
      const dist = Math.hypot(dx, dz);
      const pfx = Math.sin(player.heading), pfz = Math.cos(player.heading);
      const approach = dist > 0.01 ? (dx * pfx + dz * pfz) / dist : 0;
      this.hitCooldown = Math.max(0, this.hitCooldown - dt);

      if (this.role === 'cop' && CC.NPCSystem.wanted) {
        this.fireCooldown = Math.max(0, this.fireCooldown - dt);
        if (dist < 60) {
          CC.NPCSystem.policeSeen();
          if (dist < 42 && this.fireCooldown <= 0 && CC.NPCSystem.policeFire) {
            this.fireCooldown = U.randRange(rng, 1.0, 2.1);
            CC.NPCSystem.policeFire(
              this.position.x, this.position.y + 1.25, this.position.z,
              player.pos.x, player.pos.y + 0.9, player.pos.z,
              U.clamp(0.42 - dist / 180, 0.12, 0.42)
            );
          }
        }
      }
      if (this.role === 'cop' && CC.NPCSystem.wanted &&
          CC.NPCSystem.arrestCooldown <= 0 && player.isPedestrian && dist < 2.4) {
        CC.NPCSystem.beginArrest(player, this);
      }
      // A vehicle clipping a pedestrian is a crime, and the victim is flung.
      const groundVehicle = !player.isPedestrian && !player.isAircraft &&
        !(player.spec && player.spec.water) && !player.exploded;
      if (groundVehicle && this.hitCooldown <= 0 && dist < 1.7 + (player.spec.radius || 1) * 0.3 &&
          Math.abs(player.speed) > 5.5) {
        this.hitCooldown = 4;
        this.fleeTimer = U.randRange(rng, 2.4, 3.6);
        const len = dist || 1;
        const side = rng() < 0.5 ? -1 : 1;
        this.fleeX = dx / len * 0.5 + (-dz / len) * side * 1.4;
        this.fleeZ = dz / len * 0.5 + (dx / len) * side * 1.4;
        const fl = Math.hypot(this.fleeX, this.fleeZ) || 1;
        this.fleeX = this.fleeX / fl * 8;
        this.fleeZ = this.fleeZ / fl * 8;
        this.vy = 5;
        if (world && world.particles) {
          world.particles.spawn(this.position.x, this.position.y + 0.5, this.position.z, 5, 0xe8d4a2, 0.5);
        }
        if (CC.NPCSystem && CC.NPCSystem.reportCrime) {
          CC.NPCSystem.reportCrime(this.role === 'cop' ? 'Hit a police officer' : 'Hit a pedestrian');
        }
      }

      if (this.fleeTimer <= 0 && dist < 19 && player.speed > 8 && approach > 0.5) {
        this.fleeTimer = U.randRange(rng, 1.8, 3.0);
        const side = rng() < 0.5 ? -1 : 1;
        const len = dist || 1;
        this.fleeX = (dx / len) * 0.45 + (-dz / len) * side * 1.5;
        this.fleeZ = (dz / len) * 0.45 + (dx / len) * side * 1.5;
        const fl = Math.hypot(this.fleeX, this.fleeZ) || 1;
        this.fleeX = this.fleeX / fl * 7.5;
        this.fleeZ = this.fleeZ / fl * 7.5;
        this.vy = 4.2;
        if (world && world.particles) world.particles.spawn(this.position.x, this.position.y + 0.4, this.position.z, 4, 0xe8d4a2, 0.45);
      }

      let moving = false;
      let roachFlying = false;
      if (this.fleeTimer > 0) {
        this.fleeTimer -= dt;
        this.position.x += this.fleeX * dt;
        this.position.z += this.fleeZ * dt;
        this.vy -= C.GRAVITY * dt;
        this.position.y += this.vy * dt;
        const ground = CC.heightAt(this.position.x, this.position.z);
        if (this.position.y <= ground) { this.position.y = ground; this.vy = 0; }
        this.heading = Math.atan2(this.fleeX, this.fleeZ);
        moving = true;
        this.walkPhase += dt * 18;
      } else if (this.isPatron) {
        // Amusement guests stroll between rides, concessions and the midway,
        // but always drift back toward their part of the park.
        this.workTimer -= dt;
        if (this.workTimer <= 0 || this.idleTimer <= 0) {
          this.chooseEscortTarget();
          this.workTimer = U.randRange(rng, 3, 7);
          this.idleTimer = U.randRange(rng, 4, 9);
        }
        const tx = this.target.x - this.position.x;
        const tz = this.target.y - this.position.z;
        const d = Math.hypot(tx, tz);
        if (d < 0.8) {
          this.heading = U.angleLerp(this.heading, this.workFacing, 1 - Math.exp(-2 * dt));
        } else {
          const step = Math.min(d, this.speed * 0.85 * dt);
          this.position.x += tx / d * step;
          this.position.z += tz / d * step;
          this.heading = U.angleLerp(this.heading, Math.atan2(tx, tz), 1 - Math.exp(-4 * dt));
          moving = true;
          this.walkPhase += dt * 7;
        }
      } else if (this.isWorker) {
        // Store staff keep to a small patch in front of their own shop, then
        // turn back to face the boardwalk between errands.
        this.workTimer -= dt;
        if (this.workTimer <= 0) {
          const spread = this.role === 'vendor' ? 1.1 : 1.8;
          const wx = this.workHome.x + U.randRange(rng, -spread, spread);
          const wz = this.workHome.y + U.randRange(rng, -spread, spread);
          if (!CC.coast.isWater(wx, wz)) this.workTarget.set(wx, wz);
          this.workTimer = U.randRange(rng, 2.2, 5.5);
        }
        const tx = this.workTarget.x - this.position.x;
        const tz = this.workTarget.y - this.position.z;
        const d = Math.hypot(tx, tz);
        if (d > 0.22) {
          const step = Math.min(d, this.speed * 0.7 * dt);
          this.position.x += tx / d * step;
          this.position.z += tz / d * step;
          this.heading = U.angleLerp(this.heading, Math.atan2(tx, tz), 1 - Math.exp(-4 * dt));
          moving = true;
          this.walkPhase += dt * 6;
        } else {
          this.heading = U.angleLerp(this.heading, this.workFacing, 1 - Math.exp(-2 * dt));
        }
      } else if (this.isBoardwalker) {
        // Boardwalk strollers and pier anglers stay on the wooden deck instead
        // of wandering off into the surf or across the shops.
        this.workTimer -= dt;
        this.idleTimer -= dt;
        let tx = this.target.x - this.position.x;
        let tz = this.target.y - this.position.z;
        let d = Math.hypot(tx, tz);
        if (this.workTimer <= 0 || this.idleTimer <= 0 || d < 0.7) {
          this.choosePathTarget();
          this.workTimer = U.randRange(rng, 4, 9);
          this.idleTimer = U.randRange(rng, 4, 9);
          tx = this.target.x - this.position.x;
          tz = this.target.y - this.position.z;
          d = Math.hypot(tx, tz);
        }
        if (this.role === 'pierfish') {
          // Fishers shuffle to a new rail spot, then settle facing the water.
          const step = Math.min(d, this.speed * 0.45 * dt);
          if (step > 0.01) {
            this.position.x += tx / d * step;
            this.position.z += tz / d * step;
            moving = true;
          }
          this.heading = U.angleLerp(this.heading, -Math.PI / 2,
            1 - Math.exp(-2 * dt));
        } else if (d > 0.35) {
          const step = Math.min(d, this.speed * 0.85 * dt);
          this.position.x += tx / d * step;
          this.position.z += tz / d * step;
          this.heading = U.angleLerp(this.heading, Math.atan2(tx, tz),
            1 - Math.exp(-4 * dt));
          moving = true;
          this.walkPhase += dt * 7;
        } else {
          this.heading = U.angleLerp(this.heading, this.workFacing,
            1 - Math.exp(-1.5 * dt));
        }
      } else if (this.isRoach) {
        // Roaches scurry around a small perimeter, then occasionally fly to a
        // fresh patch of town and adopt a new perimeter around the landing.
        if (this.fleeTimer > 0) {
          // A car or a wanted player interrupted the sortie; the ballistic flee
          // code above owns the rest of this frame.
          if (this.inFlight) this.endRoachFlight(false);
        } else {
          this.idleTimer -= dt;
          this.flyCooldown -= dt;
          if (!this.inFlight && this.flyCooldown <= 0) this.startRoachFlight();

          if (this.inFlight) {
            roachFlying = true;
            this.flyTimer -= dt;
            const progress = U.clamp(1 - Math.max(0, this.flyTimer) / this.flyDuration, 0, 1);
            const tx = this.flyTarget.x - this.position.x;
            const tz = this.flyTarget.y - this.position.z;
            const d = Math.hypot(tx, tz);
            if (d > 0.01) {
              const step = Math.min(d, Math.max(8, d / this.flyDuration) * dt);
              this.position.x += tx / d * step;
              this.position.z += tz / d * step;
              this.heading = U.angleLerp(this.heading, Math.atan2(tx, tz), 1 - Math.exp(-6 * dt));
            }
            // Climb at takeoff, level out, then settle onto the new ground.
            const climb = U.clamp(progress / 0.25, 0, 1);
            const descent = U.clamp((progress - 0.78) / 0.22, 0, 1);
            const wantedY = CC.heightAt(this.position.x, this.position.z) +
              this.flyAltitude * climb * (1 - descent);
            this.position.y += (wantedY - this.position.y) * (1 - Math.exp(-5 * dt));
            moving = true;
            this.walkPhase += dt * 14;
            this.roachPlayClip(progress < 0.25 || progress > 0.84
              ? ROACH_FLY_LAUNCH : ROACH_FLY_CRUISE);
            if (this.flyTimer <= 0) {
              this.endRoachFlight(true);
              roachFlying = false;
            }
          } else {
            const tx = this.target.x - this.position.x;
            const tz = this.target.y - this.position.z;
            const d = Math.hypot(tx, tz);
            if (d < 0.45 || this.idleTimer <= 0) {
              const a = rng() * Math.PI * 2;
              const radius = this.homeRadius || 8;
              const r = U.randRange(rng, Math.min(1.5, radius), radius);
              let nx = this.workHome.x + Math.cos(a) * r;
              let nz = this.workHome.y + Math.sin(a) * r;
              if (CC.coast.isWater(nx, nz)) { nx = this.workHome.x; nz = this.workHome.y; }
              this.target.set(nx, nz);
              this.idleTimer = U.randRange(rng, 0.6, 2.2);
            } else {
              const step = Math.min(d, this.speed * dt);
              this.position.x += tx / d * step;
              this.position.z += tz / d * step;
              this.heading = U.angleLerp(this.heading, Math.atan2(tx, tz), 1 - Math.exp(-9 * dt));
              moving = true;
              this.walkPhase += dt * 22;
            }
            // Ending a flight can leave the rig on Idle even though the roach
            // immediately scurries in its new perimeter, so keep this in sync.
            this.roachGroundClip(moving);
          }
        }
      } else if (this.role === 'cop' && CC.NPCSystem && CC.NPCSystem.arrest.active &&
                 CC.NPCSystem.arrest.officer === this) {
        // Hold the suspect while the struggle plays out.
        this.speed = 0;
        this.heading = U.angleLerp(this.heading, Math.atan2(dx, dz), 1 - Math.exp(-6 * dt));
        moving = false;
      } else if (this.role === 'walk' || this.role === 'cop') {
        let tx = this.target.x - this.position.x;
        let tz = this.target.y - this.position.z;
        if (this.role === 'cop' && CC.NPCSystem.wanted && dist < 85 &&
            CC.coast.distanceToWater(player.pos.x, player.pos.z) > 2) {
          tx = player.pos.x - this.position.x;
          tz = player.pos.z - this.position.z;
        }
        const d = Math.hypot(tx, tz);
        if (d < 1.2 || this.idleTimer <= 0) {
          this.chooseTarget();
          this.idleTimer = U.randRange(rng, 3, 8);
          tx = this.target.x - this.position.x;
          tz = this.target.y - this.position.z;
        }
        const l = Math.hypot(tx, tz) || 1;
        this.position.x += tx / l * this.speed * dt;
        this.position.z += tz / l * this.speed * dt;
        this.heading = U.angleLerp(this.heading, Math.atan2(tx, tz), 1 - Math.exp(-5 * dt));
        this.idleTimer -= dt;
        moving = true;
        this.walkPhase += dt * 8;
      } else if (this.isGang) {
        this.crimeTimer -= dt;
        this.crimeCooldown = Math.max(0, this.crimeCooldown - dt);
        if (!this.crimeTarget || !this.crimeTarget.ref || this.crimeTarget.ref.inVehicle ||
            (this.crimeTarget.ref.stolen) || this.crimeTimer <= 0) {
          this.chooseGangTarget();
          this.crimeTimer = U.randRange(rng, 8, 16);
        }
        let gx = this.target.x, gz = this.target.y;
        if (this.crimeTarget && this.crimeTarget.ref) {
          const ref = this.crimeTarget.ref;
          const rp = this.crimeTarget.type === 'car' ? ref.pos : ref.position;
          gx = rp.x; gz = rp.z;
          const gd = Math.hypot(gx - this.position.x, gz - this.position.z);
          if (this.crimeTarget.type === 'person' && gd < 18 && this.crimeCooldown <= 0) {
            this.crimeCooldown = U.randRange(rng, 2.2, 4.5);
            if (NPCSystem.gangFire) {
              NPCSystem.gangFire(this.position.x, this.position.y + 1.1, this.position.z,
                rp.x, rp.y + 1.1, rp.z);
            }
            ref.fleeTimer = U.randRange(rng, 2.5, 4);
            ref.fleeX = (rp.x - this.position.x) / (gd || 1) * 7;
            ref.fleeZ = (rp.z - this.position.z) / (gd || 1) * 7;
          }
          if (gd < (this.crimeTarget.type === 'car' ? 3.4 : 2.4)) {
            if (this.crimeTarget.type === 'car' && NPCSystem.gangCarjack) {
              NPCSystem.gangCarjack(this, ref);
            } else if (this.crimeTarget.type === 'person' && NPCSystem.gangRobbery) {
              NPCSystem.gangRobbery(this, ref);
            }
            this.crimeTarget = null;
            this.crimeTimer = U.randRange(rng, 5, 11);
          }
        }
        let ex = gx - this.position.x, ez = gz - this.position.z;
        const ed = Math.hypot(ex, ez);
        if (ed > 0.7) {
          const step = Math.min(ed, this.speed * 1.15 * dt);
          this.position.x += ex / ed * step;
          this.position.z += ez / ed * step;
          this.heading = U.angleLerp(this.heading, Math.atan2(ex, ez), 1 - Math.exp(-5 * dt));
          moving = true;
          this.walkPhase += dt * 9;
        }
      } else if (this.isEscort) {
        let car = null;
        if (this.isMotel) {
          // Motel regulars wander the apron until a car stops, then approach
          // the driver's side and wait for the horn interaction.
          car = this.findStoppedCar();
          this.motelHailing = false;
          if (car) {
            const ox = this.position.x - car.pos.x;
            const oz = this.position.z - car.pos.z;
            const len = Math.hypot(ox, oz) || 1;
            this.target.set(car.pos.x + ox / len * 2.3, car.pos.z + oz / len * 2.3);
            this.workTimer = 1.5;
          }
        }
        // Nightlife companions work a small patch around the bar or neighborhood
        // corner instead of drifting across the whole town.
        this.workTimer -= dt;
        if (!car && (this.workTimer <= 0 || this.idleTimer <= 0)) {
          this.chooseEscortTarget();
          this.workTimer = U.randRange(rng, 2.5, 6);
          this.idleTimer = U.randRange(rng, 4, 9);
        }
        let ex = this.target.x - this.position.x;
        let ez = this.target.y - this.position.z;
        const ed = Math.hypot(ex, ez);
        if (ed < 0.7) {
          if (car) this.motelHailing = true;
          this.heading = U.angleLerp(this.heading,
            car ? Math.atan2(car.pos.x - this.position.x, car.pos.z - this.position.z) : this.workFacing,
            1 - Math.exp(-2 * dt));
        } else {
          const step = Math.min(ed, this.speed * (car ? 1.1 : 0.85) * dt);
          this.position.x += ex / ed * step;
          this.position.z += ez / ed * step;
          this.heading = U.angleLerp(this.heading, Math.atan2(ex, ez), 1 - Math.exp(-4 * dt));
          moving = true;
          this.walkPhase += dt * 7;
        }
        this.idleTimer -= dt;
      } else if (this.role === 'dog' && this.owner) {
        const ox = this.owner.position.x - this.position.x;
        const oz = this.owner.position.z - this.position.z;
        const d = Math.hypot(ox, oz);
        if (d > 2.2) {
          this.position.x += ox / d * (this.speed + 0.7) * dt;
          this.position.z += oz / d * (this.speed + 0.7) * dt;
          this.heading = Math.atan2(ox, oz);
          moving = true;
          this.walkPhase += dt * 12;
        }
      } else {
        this.idleTimer -= dt;
        if (this.role === 'fish') this.heading = U.angleLerp(this.heading, Math.atan2(-1, 0), 0.01);
      }

      // Sidewalks and grass are full of solid props. Slide around them; only
      // trees inside the forest zones may be walked through.
      if (!roachFlying && this.deckY == null && CC.resolveObstacleSlide) {
        const slide = CC.resolveObstacleSlide(
          this.position, startX, startZ, 0.52, { allowWoods: true, padding: 0.12 }
        );
        if (slide && moving) {
          const mx = this.position.x - startX, mz = this.position.z - startZ;
          if (Math.hypot(mx, mz) > 0.02) {
            this.heading = U.angleLerp(this.heading, Math.atan2(mx, mz), 0.3);
          }
        }
      }

      const groundY = this.deckY != null ? this.deckY :
        CC.heightAt(this.position.x, this.position.z) + this.deckOffset;
      if (roachFlying) {
        // The flight arc above owns altitude until the roach lands.
      } else if (this.fleeTimer <= 0) this.position.y = groundY;
      else this.position.y = Math.max(this.position.y, groundY);
      this.group.position.copy(this.position);
      this.group.rotation.y = this.heading;

      const swing = moving ? Math.sin(this.walkPhase) * (this.fleeTimer > 0 ? 0.9 : 0.45) : Math.sin(performance.now() * 0.002) * 0.03;
      this.legL.rotation.x = swing;
      this.legR.rotation.x = -swing;
      this.armL.rotation.x = -swing * 0.8;
      this.armR.rotation.x = swing * 0.8;
      this.group.rotation.z = this.fleeTimer > 0 ? Math.sin(this.walkPhase) * 0.18 : 0;
      if (this.downloaded) {
        this.downloaded.setMoving(moving);
        this.downloaded.update(dt);
      }
    }
  }

  // Exposed so gig systems can place a short-lived resident at an address.
  CC.Pedestrian = Pedestrian;

  /* ---------- wildlife ---------- */
  const dogFurs = [0x9a744d, 0x5d5147, 0xd2c0a0, 0x8b6a52, 0x3b3733, 0xc99b63];
  const rabbitFurs = [0xb9a48b, 0xd9cfc0, 0x8c7b68, 0x6f6256];
  const squirrelFurs = [0xa4643f, 0x8b5a3c, 0xc08a58];
  const gullColors = [0xf2f5f2, 0xdfe6e8, 0xb9c6cc];
  const songColors = [0x4f8fc4, 0xe3b95c, 0xd76f62, 0x7fb46a, 0x9d7fc0];
  const pondAnimalMats = {
    duckBody: mat(0x667b46), duckDrake: mat(0x2e4a35),
    duckPale: mat(0xe8e5d7), duckHead: mat(0x22412e),
    beak: mat(0xe0a23c), eye: mat(0x141414),
    gator: mat(0x52613d), gatorBelly: mat(0x8c9562),
    gatorEye: mat(0xd9d45a), gatorTooth: mat(0xf1ead4)
  };

  function findLandSpot(margin) {
    margin = margin || 3;
    for (let i = 0; i < 50; i++) {
      const x = U.randRange(rng, C.WORLD.minX + 16, C.WORLD.maxX - 16);
      const z = U.randRange(rng, C.WORLD.minZ + 16, C.WORLD.maxZ - 16);
      if (CC.coast.isWater(x, z) || CC.coast.distanceToWater(x, z) < margin) continue;
      const nr = CC.nearestRoad(x, z);
      if (nr && nr.dist < nr.width * 0.5 + 1.5) continue;
      return { x: x, z: z };
    }
    return { x: 0, z: 0 };
  }

  // Pick a roadside shoulder wide enough for a car, clear of scenery and any
  // other stealable car. These are deliberately separate from the decorative
  // parked cars in business lots so the interactable ones are easy to spot.
  function findParkSpot(parked) {
    const roads = CC.roadDefs.filter(function (r) { return r.type === 'paved' && r._length > 80; });
    for (let i = 0; i < 400 && roads.length; i++) {
      const road = U.pick(rng, roads);
      const s = U.randRange(rng, 24, road._length - 24);
      const p = CC.sampleRoad(road, s);
      const side = rng() < 0.5 ? 1 : -1;
      const off = road.width * 0.5 + 3.4;
      const x = p.x + p.dz * side * off;
      const z = p.z - p.dx * side * off;
      if (CC.coast.isWater(x, z) || CC.coast.distanceToWater(x, z) < 6) continue;
      let blocked = false;
      const obstacles = CC.World.obstacles;
      for (let j = 0; j < obstacles.length; j++) {
        const o = obstacles[j];
        if (Math.hypot(x - o.x, z - o.z) < o.r + 3.5) { blocked = true; break; }
      }
      if (blocked) continue;
      for (let j = 0; j < parked.length; j++) {
        if (U.distance2D(x, z, parked[j].pos.x, parked[j].pos.z) < 9) { blocked = true; break; }
      }
      if (blocked) continue;
      return { x: x, z: z, h: Math.atan2(p.dx, p.dz) + (side < 0 ? Math.PI : 0) };
    }
    return null;
  }

  function fleeDir(pos, player, radius, minSpeed) {
    const dx = pos.x - player.pos.x, dz = pos.z - player.pos.z;
    const d = Math.hypot(dx, dz) || 0.001;
    if (d > radius || Math.abs(player.speed) < minSpeed) return null;
    const side = rng() < 0.5 ? -1 : 1;
    const fx = dx / d + (-dz / d) * side * 1.1;
    const fz = dz / d + (dx / d) * side * 1.1;
    const len = Math.hypot(fx, fz) || 1;
    return { x: fx / len, z: fz / len };
  }

  // Free-roaming dogs: they trot between sniffing spots, then sprint off if a
  // vehicle or a running player comes too close.
  class Dog {
    constructor(scene, x, z, home) {
      this.position = new THREE.Vector3(x, CC.heightAt(x, z), z);
      this.home = home ? new THREE.Vector2(home.x, home.z) : null;
      this.spread = home && home.spread ? home.spread : 26;
      this.lastSafe = this.position.clone();
      this.heading = rng() * Math.PI * 2;
      this.speed = U.randRange(rng, 2.4, 4.4);
      this.target = new THREE.Vector2(x, z);
      this.idleTimer = U.randRange(rng, 0.5, 3);
      this.fleeTimer = 0;
      this.fleeX = 0; this.fleeZ = 0;
      this.phase = rng() * Math.PI * 2;
      this.vy = 0;

      this.group = new THREE.Group();
      const fur = mat(U.pick(rng, dogFurs));
      this.group.add(box(0.48, 0.4, 0.88, fur, 0, 0.44, 0));
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 7, 5), fur);
      head.position.set(0, 0.6, 0.52); head.castShadow = true;
      this.group.add(head);
      this.group.add(box(0.16, 0.12, 0.2, mat(0x3a312a), 0, 0.55, 0.7));
      for (const s of [-1, 1]) {
        const ear = box(0.09, 0.19, 0.08, fur, s * 0.14, 0.79, 0.5);
        ear.rotation.z = s * 0.25;
        this.group.add(ear);
      }
      this.tail = box(0.09, 0.09, 0.42, fur, 0, 0.62, -0.5);
      this.tail.rotation.x = -0.6;
      this.group.add(this.tail);
      this.legs = [];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const leg = box(0.12, 0.36, 0.12, fur, sx * 0.17, 0.18, sz * 0.28);
        this.group.add(leg);
        this.legs.push(leg);
      }
      this.group.position.copy(this.position);
      scene.add(this.group);
      this.chooseTarget();
    }

    chooseTarget() {
      const origin = this.home || this.position;
      for (let i = 0; i < 10; i++) {
        const a = rng() * Math.PI * 2;
        const d = U.randRange(rng, this.home ? 4 : 8, this.spread);
        const x = (this.home ? origin.x : this.position.x) + Math.cos(a) * d;
        const z = (this.home ? origin.y : this.position.z) + Math.sin(a) * d;
        if (!CC.coast.isWater(x, z) && CC.coast.distanceToWater(x, z) > 2) {
          this.target.set(x, z);
          return;
        }
      }
      this.target.set(this.position.x + U.randRange(rng, -8, 8), this.position.z + U.randRange(rng, -8, 8));
    }

    update(dt, player) {
      const flee = fleeDir(this.position, player, 17, 6);
      if (flee) {
        this.fleeTimer = U.randRange(rng, 1.2, 2.4);
        this.fleeX = flee.x; this.fleeZ = flee.z;
        this.vy = 3.4;
      }

      let moving = false, sprint = false;
      if (this.fleeTimer > 0) {
        this.fleeTimer -= dt;
        const sp = this.speed * 2.3;
        this.position.x += this.fleeX * sp * dt;
        this.position.z += this.fleeZ * sp * dt;
        this.heading = U.angleLerp(this.heading, Math.atan2(this.fleeX, this.fleeZ), 1 - Math.exp(-12 * dt));
        this.vy -= C.GRAVITY * dt;
        this.position.y += this.vy * dt;
        const ground = CC.heightAt(this.position.x, this.position.z);
        if (this.position.y <= ground) { this.position.y = ground; this.vy = 0; }
        moving = true; sprint = true;
        this.phase += dt * 20;
      } else {
        let tx = this.target.x - this.position.x;
        let tz = this.target.y - this.position.z;
        const d = Math.hypot(tx, tz);
        if (d < 1.2 || this.idleTimer <= 0) {
          this.chooseTarget();
          this.idleTimer = U.randRange(rng, 2, 6);
          tx = this.target.x - this.position.x;
          tz = this.target.y - this.position.z;
        }
        const dash = Math.sin(this.phase * 0.7) > 0.82;
        const sp = this.speed * (dash ? 2 : 0.55);
        if (Math.hypot(tx, tz) > 1) {
          this.position.x += tx / (Math.hypot(tx, tz)) * sp * dt;
          this.position.z += tz / (Math.hypot(tx, tz)) * sp * dt;
          this.heading = U.angleLerp(this.heading, Math.atan2(tx, tz), 1 - Math.exp(-6 * dt));
          moving = true;
        }
        this.idleTimer -= dt;
        sprint = dash;
        this.phase += dt * (dash ? 16 : 9);
      }

      const wd = CC.coast.distanceToWater(this.position.x, this.position.z);
      if (CC.coast.isWater(this.position.x, this.position.z) || wd < 1) {
        this.position.copy(this.lastSafe);
        this.fleeTimer = 0;
        this.chooseTarget();
      } else if (wd > 2) {
        this.lastSafe.copy(this.position);
      }
      this.position.y = Math.max(this.position.y, CC.heightAt(this.position.x, this.position.z));
      this.group.position.copy(this.position);
      this.group.rotation.y = this.heading;
      for (let i = 0; i < this.legs.length; i++) {
        this.legs[i].rotation.x = Math.sin(this.phase + (i % 2 ? Math.PI : 0)) * (sprint ? 0.9 : 0.42) * (moving ? 1 : 0.1);
      }
      this.tail.rotation.y = Math.sin(this.phase * 1.7) * 0.55;
    }
  }

  // Rabbits and squirrels: short hopping bursts with frequent freezes.
  class Critter {
    constructor(scene, x, z, kind) {
      this.kind = kind;
      this.position = new THREE.Vector3(x, CC.heightAt(x, z), z);
      this.lastSafe = this.position.clone();
      this.heading = rng() * Math.PI * 2;
      this.speed = kind === 'rabbit' ? 3.4 : 4.4;
      this.target = new THREE.Vector2(x, z);
      this.idleTimer = U.randRange(rng, 0.3, 2);
      this.fleeTimer = 0;
      this.fleeX = 0; this.fleeZ = 0;
      this.hopPhase = rng() * Math.PI * 2;

      this.group = new THREE.Group();
      const rabbit = kind === 'rabbit';
      const fur = mat(U.pick(rng, rabbit ? rabbitFurs : squirrelFurs));
      const body = new THREE.Mesh(new THREE.SphereGeometry(rabbit ? 0.23 : 0.19, 7, 5), fur);
      body.scale.set(1, 0.85, rabbit ? 1.35 : 1.2);
      body.position.y = rabbit ? 0.24 : 0.26;
      body.castShadow = true;
      this.group.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 5), fur);
      head.position.set(0, rabbit ? 0.38 : 0.42, rabbit ? 0.28 : 0.24);
      this.group.add(head);
      for (const s of [-1, 1]) {
        if (rabbit) {
          const ear = box(0.08, 0.3, 0.07, fur, s * 0.08, 0.62, 0.26);
          ear.rotation.z = s * 0.18;
          this.group.add(ear);
        } else {
          const ear = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.14, 4), fur);
          ear.position.set(s * 0.09, 0.53, 0.24);
          this.group.add(ear);
        }
      }
      if (rabbit) {
        const tail = new THREE.Mesh(new THREE.SphereGeometry(0.1, 5, 4), mat(0xf0ece2));
        tail.position.set(0, 0.27, -0.3);
        this.group.add(tail);
      } else {
        for (let i = 0; i < 3; i++) {
          const t = new THREE.Mesh(new THREE.SphereGeometry(0.14 - i * 0.025, 6, 5), fur);
          t.position.set(0, 0.42 + i * 0.13, -0.28 - i * 0.1);
          this.group.add(t);
        }
      }
      this.legs = [];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const leg = box(0.07, 0.16, 0.07, fur, sx * 0.12, 0.08, sz * 0.14);
        this.group.add(leg);
        this.legs.push(leg);
      }
      this.group.position.copy(this.position);
      scene.add(this.group);
      this.chooseTarget();
    }

    chooseTarget() {
      for (let i = 0; i < 8; i++) {
        const a = rng() * Math.PI * 2;
        const d = U.randRange(rng, 3, 12);
        const x = this.position.x + Math.cos(a) * d;
        const z = this.position.z + Math.sin(a) * d;
        if (!CC.coast.isWater(x, z) && CC.coast.distanceToWater(x, z) > 1.5) {
          this.target.set(x, z);
          return;
        }
      }
      this.target.set(this.position.x + U.randRange(rng, -4, 4), this.position.z + U.randRange(rng, -4, 4));
    }

    update(dt, player) {
      const flee = fleeDir(this.position, player, 12, 4);
      if (flee) {
        this.fleeTimer = U.randRange(rng, 0.8, 1.7);
        this.fleeX = flee.x; this.fleeZ = flee.z;
        this.idleTimer = 0;
      }
      let moving = false;
      if (this.fleeTimer > 0) {
        this.fleeTimer -= dt;
        const sp = this.speed * 2.1;
        this.position.x += this.fleeX * sp * dt;
        this.position.z += this.fleeZ * sp * dt;
        this.heading = U.angleLerp(this.heading, Math.atan2(this.fleeX, this.fleeZ), 1 - Math.exp(-14 * dt));
        moving = true;
      } else {
        let tx = this.target.x - this.position.x;
        let tz = this.target.y - this.position.z;
        const d = Math.hypot(tx, tz);
        if (d < 0.8 || this.idleTimer <= 0) {
          this.chooseTarget();
          this.idleTimer = U.randRange(rng, 1, 3.5);
          tx = this.target.x - this.position.x;
          tz = this.target.y - this.position.z;
        }
        if (Math.hypot(tx, tz) > 0.8) {
          const l = Math.hypot(tx, tz);
          this.position.x += tx / l * this.speed * 0.5 * dt;
          this.position.z += tz / l * this.speed * 0.5 * dt;
          this.heading = U.angleLerp(this.heading, Math.atan2(tx, tz), 1 - Math.exp(-10 * dt));
          moving = true;
        }
        this.idleTimer -= dt;
      }

      const wd = CC.coast.distanceToWater(this.position.x, this.position.z);
      if (CC.coast.isWater(this.position.x, this.position.z) || wd < 1) {
        this.position.copy(this.lastSafe);
        this.fleeTimer = 0;
        this.chooseTarget();
      } else if (wd > 1.5) {
        this.lastSafe.copy(this.position);
      }
      this.hopPhase += dt * (moving ? 13 : 2);
      const hop = Math.abs(Math.sin(this.hopPhase)) * (moving ? 0.22 : 0.015);
      this.position.y = CC.heightAt(this.position.x, this.position.z) + hop;
      this.group.position.copy(this.position);
      this.group.rotation.y = this.heading;
      for (let i = 0; i < this.legs.length; i++) {
        this.legs[i].rotation.x = moving ? Math.sin(this.hopPhase + i) * 0.5 : 0;
      }
    }
  }

  // Circling birds: gulls over the bay and small songbirds over the town.
  class Bird {
    constructor(scene, kind, cx, cz) {
      this.kind = kind;
      this.cx = cx; this.cz = cz;
      this.radius = U.randRange(rng, kind === 'gull' ? 24 : 16, kind === 'gull' ? 95 : 70);
      this.angle = rng() * Math.PI * 2;
      this.rate = (kind === 'gull' ? 0.19 : 0.31) * U.randRange(rng, 0.7, 1.5) * (rng() < 0.5 ? -1 : 1);
      this.altitude = U.randRange(rng, kind === 'gull' ? 14 : 9, kind === 'gull' ? 30 : 22);
      this.flapPhase = rng() * Math.PI * 2;
      this.flapRate = kind === 'gull' ? 4.5 : 9;

      this.group = new THREE.Group();
      const gull = kind === 'gull';
      const color = mat(U.pick(rng, gull ? gullColors : songColors));
      const body = new THREE.Mesh(new THREE.SphereGeometry(gull ? 0.38 : 0.24, 7, 5), color);
      body.scale.set(1, 0.75, gull ? 1.7 : 1.4);
      this.group.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(gull ? 0.2 : 0.14, 6, 5), color);
      head.position.set(0, 0.1, gull ? 0.5 : 0.32);
      this.group.add(head);
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.07, gull ? 0.32 : 0.22, 4), mat(0xf0a83c));
      beak.rotation.x = Math.PI / 2;
      beak.position.set(0, 0.08, gull ? 0.72 : 0.46);
      this.group.add(beak);

      this.wings = [];
      const span = gull ? 1.55 : 0.95;
      for (const s of [-1, 1]) {
        const wing = new THREE.Mesh(new THREE.BoxGeometry(span, 0.05, gull ? 0.6 : 0.42), color);
        wing.position.set(s * span * 0.5, 0.06, 0);
        this.wings.push(wing);
        this.group.add(wing);
      }
      scene.add(this.group);
      this.update(0);
    }

    update(dt) {
      this.angle += this.rate * dt;
      const x = this.cx + Math.cos(this.angle) * this.radius;
      const z = this.cz + Math.sin(this.angle) * this.radius;
      const y = CC.heightAt(x, z) + this.altitude + Math.sin(this.angle * 3 + this.flapPhase) * 0.7;
      this.group.position.set(x, y, z);
      const dir = Math.sign(this.rate) || 1;
      this.group.rotation.y = Math.atan2(-Math.sin(this.angle) * dir, Math.cos(this.angle) * dir);
      this.flapPhase += dt * this.flapRate;
      const flap = Math.sin(this.flapPhase) * 0.55;
      this.wings[0].rotation.z = flap;
      this.wings[1].rotation.z = -flap;
      this.group.rotation.z = Math.sin(this.angle * 2) * 0.12;
    }
  }

  // Pond waterfowl. Ducks paddle a small orbit and speed up if a vehicle comes
  // too close; they are decorative, so they never enter the collision list.
  class Duck {
    constructor(scene, pond, index) {
      this.pond = pond;
      this.radius = pond.r * U.randRange(rng, 0.28, 0.72);
      this.angle = (index / 5) * Math.PI * 2 + rng() * 0.7;
      this.rate = U.randRange(rng, 0.12, 0.24) * (rng() < 0.5 ? -1 : 1);
      this.phase = rng() * Math.PI * 2;
      const pale = rng() < 0.28;
      const bodyMat = pale ? pondAnimalMats.duckPale : pondAnimalMats.duckBody;
      this.group = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), bodyMat);
      body.scale.set(1, 0.72, 1.55);
      this.group.add(body);
      const headMat = pale ? pondAnimalMats.duckPale : pondAnimalMats.duckHead;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 7, 6), headMat);
      head.position.set(0, 0.34, 0.52);
      this.group.add(head);
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.28, 5), pondAnimalMats.beak);
      beak.rotation.x = Math.PI / 2;
      beak.position.set(0, 0.3, 0.78);
      this.group.add(beak);
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.38, 5), bodyMat);
      tail.rotation.x = -Math.PI / 2;
      tail.position.set(0, 0.08, -0.7);
      this.group.add(tail);
      this.wings = [];
      for (const s of [-1, 1]) {
        const wing = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.55), bodyMat);
        wing.position.set(s * 0.34, 0.1, -0.05);
        this.wings.push(wing);
        this.group.add(wing);
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 5, 4), pondAnimalMats.eye);
        eye.position.set(s * 0.16, 0.39, 0.66);
        this.group.add(eye);
      }
      scene.add(this.group);
      this.update(0);
    }

    update(dt, player) {
      let rate = this.rate;
      if (player && player.pos && Math.abs(player.speed || 0) > 2.5) {
        const d = U.distance2D(player.pos.x, player.pos.z, this.group.position.x, this.group.position.z);
        if (d < 12) rate *= 2.6;
      }
      this.angle += rate * dt;
      const x = this.pond.x + Math.cos(this.angle) * this.radius;
      const z = this.pond.z + Math.sin(this.angle) * this.radius;
      this.phase += dt * 2.4;
      this.group.position.set(x, CC.heightAt(x, z) + 0.19 + Math.sin(this.phase) * 0.035, z);
      this.group.rotation.y = Math.atan2(-Math.sin(this.angle) * Math.sign(rate), Math.cos(this.angle) * Math.sign(rate));
      const flap = Math.sin(this.phase * 0.6) * 0.12;
      this.wings[0].rotation.z = flap;
      this.wings[1].rotation.z = -flap;
    }
  }

  // A low, mostly lazy alligator with a swaying tail. One lives in each of the
  // larger ponds, including the one beside the community park.
  class Alligator {
    constructor(scene, pond) {
      this.pond = pond;
      this.angle = rng() * Math.PI * 2;
      this.radius = pond.r * U.randRange(rng, 0.5, 0.72);
      this.x = pond.x + Math.cos(this.angle) * this.radius;
      this.z = pond.z + Math.sin(this.angle) * this.radius;
      this.phase = rng() * Math.PI * 2;
      this.group = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.42, 3.2), pondAnimalMats.gator);
      body.position.y = 0.24;
      this.group.add(body);
      const belly = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.16, 2.7), pondAnimalMats.gatorBelly);
      belly.position.set(0, 0.08, 0.1);
      this.group.add(belly);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.32, 1.0), pondAnimalMats.gator);
      head.position.set(0, 0.3, 1.75);
      this.group.add(head);
      const snout = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.22, 1.1), pondAnimalMats.gator);
      snout.position.set(0, 0.24, 2.62);
      this.group.add(snout);
      for (const s of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 5), pondAnimalMats.gatorEye);
        eye.position.set(s * 0.32, 0.5, 1.8);
        this.group.add(eye);
        for (let i = 0; i < 4; i++) {
          const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.12, 4), pondAnimalMats.gatorTooth);
          tooth.position.set(s * 0.3, 0.12, 2.25 + i * 0.22);
          this.group.add(tooth);
        }
      }
      for (let i = 0; i < 5; i++) {
        const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.2), pondAnimalMats.gatorBelly);
        ridge.position.set(0, 0.47, -1.2 + i * 0.6);
        this.group.add(ridge);
      }
      this.tail = new THREE.Group();
      this.tail.position.z = -1.6;
      for (let i = 0; i < 4; i++) {
        const seg = new THREE.Mesh(new THREE.BoxGeometry(0.84 - i * 0.17, 0.26 - i * 0.04, 0.85), pondAnimalMats.gator);
        seg.position.z = -0.45 - i * 0.75;
        this.tail.add(seg);
      }
      this.group.add(this.tail);
      this.group.rotation.y = this.angle + Math.PI;
      scene.add(this.group);
      this.update(0);
    }

    update(dt, player) {
      this.phase += dt * 0.9;
      this.tail.rotation.y = Math.sin(this.phase) * 0.26;
      let yaw = this.angle + Math.PI;
      if (player && player.pos) {
        const d = U.distance2D(player.pos.x, player.pos.z, this.x, this.z);
        if (d < 24) yaw = Math.atan2(player.pos.x - this.x, player.pos.z - this.z);
      }
      this.group.rotation.y += (yaw - this.group.rotation.y) * Math.min(1, dt * 1.4);
      this.group.position.set(this.x,
        CC.heightAt(this.x, this.z) + 0.08 + Math.sin(this.phase * 0.5) * 0.018, this.z);
    }
  }

  /* ---------- military platoons ---------- */
  class Soldier {
    constructor(scene, slot, lead) {
      const a = soldierAssets();
      this.slot = slot;
      this.lead = lead;
      this.group = a.template.group.clone(true);
      this.legL = this.group.getObjectByName('soldierLegL');
      this.legR = this.group.getObjectByName('soldierLegR');
      this.armL = this.group.getObjectByName('soldierArmL');
      this.armR = this.group.getObjectByName('soldierArmR');
      this.heading = 0;
      this.walkPhase = slot * 1.7;
      this.x = 0; this.z = 0;
      if (lead) {
        const pole = new THREE.Mesh(a.geo.pole, a.mats.rifleMetal);
        pole.position.set(-0.62, 2.55, 0.18);
        pole.castShadow = true;
        this.group.add(pole);
        const finial = new THREE.Mesh(a.geo.finial, a.mats.rifleMetal);
        finial.position.set(-0.62, 4.28, 0.18);
        this.group.add(finial);
        this.flag = new THREE.Mesh(a.geo.flag, a.flagMat);
        this.flag.position.set(0.23, 3.78, 0.18);
        this.flag.castShadow = true;
        this.group.add(this.flag);
      } else {
        const rifle = new THREE.Group();
        const stock = new THREE.Mesh(a.geo.stock, a.mats.rifleDark);
        stock.position.y = -0.36;
        rifle.add(stock);
        const barrel = new THREE.Mesh(a.geo.barrel, a.mats.rifleMetal);
        barrel.position.y = 0.48;
        rifle.add(barrel);
        const magazine = new THREE.Mesh(a.geo.magazine, a.mats.rifleDark);
        magazine.position.set(0.11, -0.42, 0);
        rifle.add(magazine);
        rifle.position.set(0.22, 1.46, -0.28);
        rifle.rotation.set(-0.14, 0, -0.74);
        rifle.castShadow = true;
        this.group.add(rifle);
      }
      scene.add(this.group);
    }

    update(dt, x, z, yaw, moving, time) {
      this.x = x; this.z = z;
      const bob = moving ? Math.abs(Math.sin(this.walkPhase)) * 0.035 : 0;
      this.group.position.set(x, CC.heightAt(x, z) + bob, z);
      this.heading = U.angleLerp(this.heading, yaw, dt > 0 ? 1 - Math.exp(-7 * dt) : 1);
      this.group.rotation.y = this.heading;
      const swing = moving ? Math.sin(this.walkPhase) * 0.44 : 0;
      if (this.legL) this.legL.rotation.x = swing;
      if (this.legR) this.legR.rotation.x = -swing;
      if (this.lead) {
        if (this.armL) this.armL.rotation.x = -2.24;
        if (this.armR) this.armR.rotation.x = 0.12 + swing * 0.16;
        if (this.flag) {
          this.flag.rotation.y = Math.sin(time * 3.1 + this.slot) * 0.18;
          this.flag.rotation.z = Math.sin(time * 2.3 + this.slot) * 0.035;
        }
      } else {
        if (this.armL) this.armL.rotation.x = -swing * 0.32;
        if (this.armR) this.armR.rotation.x = swing * 0.32;
      }
      if (moving) this.walkPhase += dt * 8.5;
    }
  }

  function makeMarchPath(points) {
    const cum = [0];
    for (let i = 1; i < points.length; i++) {
      cum[i] = cum[i - 1] + U.distance2D(points[i - 1].x, points[i - 1].z, points[i].x, points[i].z);
    }
    return { points: points, cum: cum, total: cum[cum.length - 1] || 0 };
  }
  function sampleMarchPath(path, s) {
    const pts = path.points;
    if (pts.length < 2) return { x: 0, z: 0, dx: 0, dz: 1 };
    s = U.clamp(s, 0, path.total);
    let i = 0;
    while (i < pts.length - 2 && path.cum[i + 1] < s) i++;
    const a = pts[i], b = pts[i + 1];
    const span = path.cum[i + 1] - path.cum[i] || 1;
    const t = U.clamp((s - path.cum[i]) / span, 0, 1);
    let dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len;
    return { x: U.lerp(a.x, b.x, t), z: U.lerp(a.z, b.z, t), dx: dx, dz: dz };
  }
  // GPS routes run along the road centre. Nudge interior junctions onto the
  // right-hand shoulder so marching columns do not block traffic lanes.
  function shoulderRoute(points, side) {
    if (!points || points.length < 2) return points || [];
    return points.map(function (p, i) {
      const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
      let dx = b.x - a.x, dz = b.z - a.z;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len; dz /= len;
      const off = (i > 0 && i < points.length - 1) ? side * 5.2 : 0;
      return { x: p.x - dz * off, z: p.z + dx * off };
    });
  }

  class Platoon {
    constructor(scene, id, home, destinations) {
      this.id = id;
      this.home = { x: home.x, z: home.z };
      this.destinations = destinations && destinations.length ? destinations : [this.home];
      this.destIndex = id % this.destinations.length;
      this.phase = 'atBase';
      this.rest = 1.2 + id * 0.9;
      this.speed = (2.25 + id * 0.08) * pace('walker');
      this.s = 0;
      this.time = 0;
      this.side = id % 2 === 0 ? 1 : -1;
      this.path = makeMarchPath([{ x: home.x, z: home.z }, { x: home.x + 1, z: home.z }]);
      const formation = [
        { trail: 0, lane: 0, lead: true },
        { trail: 2.8, lane: 1.35, lead: false },
        { trail: 2.8, lane: -1.35, lead: false },
        { trail: 5.6, lane: 1.35, lead: false },
        { trail: 5.6, lane: -1.35, lead: false }
      ];
      this.members = formation.map(function (slot, i) {
        const soldier = new Soldier(scene, i, slot.lead);
        soldier.trail = slot.trail;
        soldier.lane = slot.lane;
        return soldier;
      });
      this.placeMembers(0, false);
      this.beginMarch(this.destinations[this.destIndex], true);
    }

    beginMarch(destination, outbound) {
      const lead = this.members[0];
      const from = lead ? { x: lead.x, z: lead.z } : this.home;
      const to = outbound ? destination : this.home;
      if (!to) return;
      let points = null;
      if (CC.computeRoute) {
        const route = CC.computeRoute(from, to);
        if (route && route.points && route.points.length >= 2) points = route.points;
      }
      if (!points || points.length < 2) {
        points = [{ x: from.x, z: from.z }, { x: to.x, z: to.z }];
      }
      this.path = makeMarchPath(shoulderRoute(points, this.side));
      this.s = Math.min(7, this.path.total * 0.45);
      this.phase = outbound ? 'marchingOut' : 'marchingBack';
      this.destination = to;
      this.placeMembers(0, true);
      if (outbound) NPCSystem.platoonDepartures++;
      else NPCSystem.platoonReturns++;
    }

    placeMembers(dt, moving) {
      for (let i = 0; i < this.members.length; i++) {
        const m = this.members[i];
        const p = sampleMarchPath(this.path, this.s - m.trail);
        const nx = -p.dz, nz = p.dx;
        let x = p.x + nx * m.lane, z = p.z + nz * m.lane;
        if (CC.coast.isWater(x, z)) { x = p.x; z = p.z; }
        m.update(dt, x, z, Math.atan2(p.dx, p.dz), moving, this.time);
      }
    }

    update(dt, player, world) {
      this.time += dt;
      if (this.phase === 'atBase' || this.phase === 'holding') {
        this.rest -= dt;
        this.placeMembers(dt, false);
        if (this.rest > 0) return;
        if (this.phase === 'atBase') {
          this.destIndex = (this.destIndex + 1) % this.destinations.length;
          this.beginMarch(this.destinations[this.destIndex], true);
        } else {
          this.beginMarch(null, false);
        }
        return;
      }
      this.s += this.speed * dt;
      if (this.s >= this.path.total) {
        this.s = this.path.total;
        this.placeMembers(dt, false);
        if (this.phase === 'marchingOut') {
          this.phase = 'holding';
          this.rest = U.randRange(rng, 5, 9);
        } else {
          this.phase = 'atBase';
          this.side = -this.side;
          this.rest = U.randRange(rng, 6, 11);
        }
        return;
      }
      this.placeMembers(dt, true);
    }
  }

  // Low, random Shahed-style delta drones. Most of the time they simply cross
  // the map; when the timer runs out one picks a building, landmark or car and
  // dives into it. The resulting blast uses the shared world explosion/fire.
  function droneFlightPoint() {
    const W = C.WORLD;
    for (let i = 0; i < 80; i++) {
      const x = U.randRange(rng, W.minX + 45, W.maxX - 45);
      const z = U.randRange(rng, W.minZ + 45, W.maxZ - 45);
      if (!CC.coast.isWater(x, z) && CC.coast.distanceToWater(x, z) > 8) return { x: x, z: z };
    }
    return { x: 0, z: 0 };
  }

  // Shaheds are launched from the harbor water, then fly inland toward the
  // town. Keeping a dedicated launch function makes the threat readable from
  // the airport: the FPV pilot knows where to look for them.
  function harborLaunchPoint() {
    const marina = CC.marinaSpawn;
    const candidates = [
      { x: -374, z: -252 },
      { x: -384, z: -268 },
      { x: -366, z: -232 },
      marina ? { x: marina.x - 26, z: marina.z - 18 } : null
    ];
    for (const p of candidates) {
      if (p && CC.coast.isWater(p.x, p.z)) return p;
    }
    const z = U.randRange(rng, -290, -210);
    const x = CC.coast.westLine ? CC.coast.westLine(z) - 18 : -380;
    return { x: x, z: z };
  }

  function pickDroneTarget() {
    const cars = [], structures = [];
    const player = NPCSystem.currentPlayer;
    function tryCar(v, label) {
      if (!v || v.disabled || !v.group || !v.group.visible) return;
      const p = v.group.position || v.pos;
      if (!p || !isFinite(p.x) || !isFinite(p.z)) return;
      if (player && U.distance2D(p.x, p.z, player.pos.x, player.pos.z) < 45) return;
      cars.push({ x: p.x, y: p.y + 1.3, z: p.z, kind: 'car', label: label, vehicle: v });
    }
    NPCSystem.traffic.forEach(function (v) { tryCar(v, 'car'); });
    NPCSystem.parkedCars.forEach(function (v) { tryCar(v, 'parked car'); });
    NPCSystem.policeCars.forEach(function (v) { tryCar(v, 'police car'); });

    (CC.World.obstacles || []).forEach(function (o) {
      if (o.type !== 'home' && o.type !== 'landmark') return;
      if (CC.coast.isWater(o.x, o.z)) return;
      structures.push({
        x: o.x, z: o.z, y: CC.heightAt(o.x, o.z) + (o.type === 'home' ? 4.5 : 8),
        kind: o.type, label: o.type
      });
    });
    (CC.World.imageLandmarks || []).forEach(function (l) {
      if (!isFinite(l.x) || !isFinite(l.z) || CC.coast.isWater(l.x, l.z)) return;
      structures.push({
        x: l.x, z: l.z, y: CC.heightAt(l.x, l.z) + 8,
        kind: 'landmark', label: l.name || 'landmark'
      });
    });
    const list = cars.length && (rng() < 0.38 || !structures.length) ? cars : structures;
    return list.length ? U.pick(rng, list) : null;
  }

  function disableNpcVehicle(v) {
    if (!v || v.disabled) return false;
    v.disabled = true;
    if (v.group) v.group.visible = false;
    return true;
  }

  class ShahedDrone {
    constructor(scene, index) {
      this.index = index;
      this.group = new THREE.Group();
      const body = mat(0x3f484a), trim = mat(0x242b2d);
      const wingGeo = new THREE.BufferGeometry();
      wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([
        -3.4, 0, -2.5, 3.4, 0, -2.5, 0, 0, 3.6
      ], 3));
      wingGeo.setIndex([0, 1, 2]);
      wingGeo.computeVertexNormals();
      const wing = new THREE.Mesh(wingGeo, new THREE.MeshLambertMaterial({
        color: 0x70797a, side: THREE.DoubleSide, flatShading: true
      }));
      wing.castShadow = true;
      this.group.add(wing);
      this.group.add(box(0.62, 0.38, 4.8, body, 0, 0.08, 0.15));
      this.group.add(box(0.28, 0.16, 2.2, mat(0x9a8f72), 0, 0.3, 0.55));
      const engine = cylinder(0.36, 0.42, 1.2, 8, trim, 0, 0.02, -2.35);
      engine.rotation.x = Math.PI / 2;
      this.group.add(engine);
      if (!ShahedDrone.flagTex) {
        const fc = document.createElement('canvas');
        fc.width = 96; fc.height = 64;
        const fx = fc.getContext('2d');
        fx.fillStyle = '#ffffff'; fx.fillRect(0, 0, 96, 22);
        fx.fillStyle = '#0039a6'; fx.fillRect(0, 21, 96, 22);
        fx.fillStyle = '#d52b1e'; fx.fillRect(0, 43, 96, 21);
        ShahedDrone.flagTex = new THREE.CanvasTexture(fc);
        ShahedDrone.flagTex.colorSpace = THREE.SRGBColorSpace;
      }
      const flagMat = new THREE.MeshBasicMaterial({ map: ShahedDrone.flagTex, side: THREE.DoubleSide });
      [-1, 1].forEach(function (s) {
        const fin = box(0.1, 0.85, 1.1, body, s * 1.15, 0.42, -1.95);
        fin.rotation.z = s * 0.16;
        this.group.add(fin);
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 5),
          new THREE.MeshBasicMaterial({ color: s < 0 ? 0xe64b43 : 0x66dd88 }));
        lamp.position.set(s * 3.0, 0.08, -1.9);
        this.group.add(lamp);
        const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 0.82), flagMat);
        flag.position.set(s * 1.55, 0.03, -0.35);
        flag.rotation.x = -Math.PI / 2;
        flag.rotation.z = s * 0.08;
        this.group.add(flag);
      }, this);
      this.prop = new THREE.Group();
      this.prop.add(box(0.1, 2.1, 0.08, trim, 0, 0, 0));
      this.prop.add(box(2.1, 0.1, 0.08, trim, 0, 0, 0));
      this.prop.position.z = -3.0;
      this.group.add(this.prop);
      this.group.scale.setScalar(1.2);
      scene.add(this.group);
      this.reset(true);
    }

    reset(initial) {
      const p = harborLaunchPoint();
      this.pos = new THREE.Vector3(p.x, CC.heightAt(p.x, p.z) + U.randRange(rng, 26, 40), p.z);
      const inland = Math.atan2(-p.x, -p.z) + U.randRange(rng, -0.45, 0.45);
      this.heading = inland;
      this.cruiseAlt = U.randRange(rng, 26, 40);
      this.speed = U.randRange(rng, 20, 29);
      this.waypoint = droneFlightPoint();
      this.state = 'cruise';
      this.target = null;
      this.crashTimer = initial ? U.randRange(rng, 22, 75) : U.randRange(rng, 45, 110);
      this.respawnTimer = 0;
      this.group.visible = true;
      this.sync(0, 0);
    }

    beginDive() {
      const target = pickDroneTarget();
      if (!target) { this.crashTimer = U.randRange(rng, 12, 24); return; }
      this.target = target;
      this.state = 'dive';
    }

    crash() {
      const t = this.target || { x: this.pos.x, z: this.pos.z, y: this.pos.y };
      if (t.vehicle) disableNpcVehicle(t.vehicle);
      CC.World.createExplosion(t.x, t.z, {
        scale: 2.6, y: Math.max(t.y || 0, CC.heightAt(t.x, t.z) + 1.5), duration: 30
      });
      NPCSystem.droneCrashes++;
      if (CC.Game && CC.Game.showMessage) {
        CC.Game.showMessage('Drone impact! — ' + (t.label || 'explosion'), 2.4);
      }
      this.state = 'crashed';
      this.respawnTimer = U.randRange(rng, 10, 22);
      this.group.visible = false;
    }

    shootDown(opts) {
      if (this.state === 'crashed') return false;
      const o = opts || {};
      if (!o.silentExplosion) {
        CC.World.createExplosion(this.pos.x, this.pos.z, {
          scale: o.scale || 1.35, y: this.pos.y, duration: o.duration || 8
        });
      }
      NPCSystem.dronesShotDown++;
      this.state = 'crashed';
      this.target = null;
      this.respawnTimer = U.randRange(rng, 14, 28);
      this.group.visible = false;
      if (o.message && CC.Game && CC.Game.fpvMessage) {
        CC.Game.fpvMessage(o.message, 3);
      } else if (!o.silentMessage && CC.Game && CC.Game.showMessage) {
        CC.Game.showMessage('Air defense intercepted a drone', 2.4);
      }
      return true;
    }

    sync(dt, diff) {
      this.group.position.copy(this.pos);
      this.group.rotation.y = this.heading;
      this.group.rotation.z = U.damp(this.group.rotation.z,
        U.clamp(-diff * 0.65, -0.42, 0.42), 4, dt);
      this.group.rotation.x = U.damp(this.group.rotation.x,
        this.state === 'dive' ? 0.18 : 0, 3, dt);
      if (this.prop) this.prop.rotation.z += dt * 38;
    }

    update(dt) {
      if (this.state === 'crashed') {
        this.respawnTimer -= dt;
        if (this.respawnTimer <= 0) this.reset(false);
        return;
      }
      if (this.state === 'cruise') {
        this.crashTimer -= dt;
        if (this.crashTimer <= 0) this.beginDive();
      }

      let tx = this.waypoint.x, tz = this.waypoint.z, ty = 0;
      const diving = this.state === 'dive' && this.target;
      if (diving) {
        const t = this.target;
        if (t.vehicle && t.vehicle.group) {
          t.x = t.vehicle.group.position.x;
          t.y = t.vehicle.group.position.y + 1.3;
          t.z = t.vehicle.group.position.z;
        }
        tx = t.x; tz = t.z; ty = t.y;
        if (U.distance2D(this.pos.x, this.pos.z, tx, tz) < 5.5 || this.pos.y <= ty + 2.5) {
          this.crash();
          return;
        }
      }
      const desired = Math.atan2(tx - this.pos.x, tz - this.pos.z);
      let diff = desired - this.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const turn = (diving ? 1.2 : 0.65) * dt;
      this.heading += U.clamp(diff, -turn, turn);
      const speed = this.speed * (diving ? 1.5 : 1);
      this.pos.x += Math.sin(this.heading) * speed * dt;
      this.pos.z += Math.cos(this.heading) * speed * dt;
      const ground = CC.heightAt(this.pos.x, this.pos.z);
      const targetY = diving ? Math.max(ty + 2, ground + 2.5) :
        ground + this.cruiseAlt + Math.sin((CC.Game ? CC.Game.time : 0) * 0.7 + this.index) * 2.5;
      this.pos.y += (targetY - this.pos.y) * (1 - Math.exp(-(diving ? 1.7 : 0.8) * dt));
      if (!diving && U.distance2D(this.pos.x, this.pos.z, tx, tz) < 30) {
        this.waypoint = droneFlightPoint();
      }
      this.sync(dt, diff);
    }
  }

  // Fenced battery on the eastern edge. It tracks the low drones and fires
  // homing interceptor missiles whenever one enters its range.
  class AirDefenseBattery {
    constructor(scene, effects) {
      this.effects = effects;
      const zone = CC.ImageMap && CC.ImageMap.zones && CC.ImageMap.zones.airDefense;
      this.origin = new THREE.Vector3(
        zone ? zone.x : 300,
        zone ? CC.heightAt(zone.x, zone.z) : 0,
        zone ? zone.z : 260
      );
      this.visuals = CC.Details && CC.Details.aaVisuals;
      this.radarYaw = 0;
      this.launchYaw = 0;
      this.launchPitch = 0;
      this.cooldown = U.randRange(rng, 1, 3);
      this.target = null;
      this.missiles = [];
      this.flash = 0;
      this.beaconPhase = 0;
    }

    pickTarget() {
      let best = null, bestD = 340;
      const targets = NPCSystem.drones.slice();
      if (CC.UFOSystem && CC.UFOSystem.ufos) {
        for (let i = 0; i < CC.UFOSystem.ufos.length; i++) {
          const u = CC.UFOSystem.ufos[i];
          if (u && u.state === 'cruise') targets.push(u);
        }
      }
      for (let i = 0; i < targets.length; i++) {
        const d = targets[i];
        if (!d || d.state === 'crashed' || !d.group || !d.group.visible || !d.pos) continue;
        const d2D = U.distance2D(this.origin.x, this.origin.z, d.pos.x, d.pos.z);
        if (d2D < bestD) { bestD = d2D; best = d; }
      }
      return best;
    }

    aim(dt, target) {
      if (!target) return;
      const dx = target.pos.x - this.origin.x;
      const dz = target.pos.z - this.origin.z;
      const desiredYaw = Math.atan2(dx, dz);
      let yawDiff = desiredYaw - this.launchYaw;
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
      this.launchYaw += U.clamp(yawDiff, -dt * 1.5, dt * 1.5);
      this.radarYaw += U.clamp(desiredYaw - this.radarYaw, -dt * 1.9, dt * 1.9);
      const flat = Math.hypot(dx, dz) || 1;
      const desiredPitch = U.clamp(Math.atan2(target.pos.y - this.origin.y - 4, flat), 0.1, 1.1);
      this.launchPitch += (desiredPitch - this.launchPitch) * (1 - Math.exp(-3 * dt));
      const v = this.visuals;
      if (!v) return;
      if (v.radar) v.radar.rotation.y = this.radarYaw;
      if (v.launcher) {
        v.launcher.rotation.y = this.launchYaw;
        v.launcher.rotation.x = -this.launchPitch;
      }
    }

    fire(target) {
      const v = this.visuals;
      const muzzleOffset = new THREE.Vector3(0, 0.4 * Math.cos(this.launchPitch), 4.2 * Math.cos(this.launchPitch));
      muzzleOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.launchYaw);
      const start = this.origin.clone().add(new THREE.Vector3(0, 3.4 + 4.2 * Math.sin(this.launchPitch), 0)).add(muzzleOffset);
      const mesh = new THREE.Mesh(
        new THREE.ConeGeometry(0.16, 0.95, 6),
        new THREE.MeshBasicMaterial({ color: 0xffe2a0 })
      );
      mesh.position.copy(start);
      this.effects.add(mesh);
      const trailGeo = new THREE.BufferGeometry().setFromPoints([start.clone(), start.clone()]);
      const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({
        color: 0xffd39b, transparent: true, opacity: 0.8, depthWrite: false
      }));
      this.effects.add(trail);
      this.missiles.push({ mesh: mesh, trail: trail, target: target, pos: start, life: 5, smokeTimer: 0 });
      this.flash = 0.18;
      if (v && v.muzzle) v.muzzle.opacity = 0.9;
      if (CC.Audio && CC.Audio.gunshot) CC.Audio.gunshot();
    }

    updateMissiles(dt) {
      const up = new THREE.Vector3(0, 1, 0);
      for (let i = this.missiles.length - 1; i >= 0; i--) {
        const m = this.missiles[i];
        m.life -= dt;
        const target = m.target;
        if (m.life <= 0 || !target || target.state === 'crashed' ||
            target.state === 'ascending' || target.state === 'gone') {
          this.disposeMissile(m, i);
          continue;
        }
        const goal = new THREE.Vector3(target.pos.x, target.pos.y, target.pos.z);
        const dir = goal.sub(m.pos);
        const dist = dir.length();
        const hitRadius = target.radius ? Math.max(3.2, target.radius * 0.55) : 3.2;
        if (dist < hitRadius) {
          target.shootDown();
          this.disposeMissile(m, i);
          continue;
        }
        dir.normalize();
        m.pos.addScaledVector(dir, U.clamp(90 * dt, 0, dist));
        m.mesh.position.copy(m.pos);
        m.mesh.quaternion.setFromUnitVectors(up, dir);
        const arr = m.trail.geometry.attributes.position.array;
        arr[0] = m.pos.x; arr[1] = m.pos.y; arr[2] = m.pos.z;
        arr[3] = m.pos.x - dir.x * 2.6;
        arr[4] = m.pos.y - dir.y * 2.6;
        arr[5] = m.pos.z - dir.z * 2.6;
        m.trail.geometry.attributes.position.needsUpdate = true;
        m.smokeTimer -= dt;
        if (m.smokeTimer <= 0 && CC.World.particles) {
          m.smokeTimer = 0.07;
          CC.World.particles.spawn(m.pos.x, m.pos.y, m.pos.z, 1, 0xb9b6ad, 0.25);
        }
      }
    }

    disposeMissile(m, index) {
      this.effects.remove(m.mesh);
      this.effects.remove(m.trail);
      m.mesh.geometry.dispose();
      m.mesh.material.dispose();
      m.trail.geometry.dispose();
      m.trail.material.dispose();
      this.missiles.splice(index, 1);
    }

    update(dt) {
      this.cooldown -= dt;
      this.target = this.pickTarget();
      if (this.target) {
        this.aim(dt, this.target);
        if (this.cooldown <= 0) {
          this.fire(this.target);
          this.cooldown = U.randRange(rng, 3.2, 5.5);
        }
      } else {
        this.radarYaw += dt * 0.25;
        if (this.visuals && this.visuals.radar) this.visuals.radar.rotation.y = this.radarYaw;
      }
      this.flash = Math.max(0, this.flash - dt);
      if (this.visuals && this.visuals.muzzle) this.visuals.muzzle.opacity = this.flash > 0 ? 0.9 : 0;
      this.beaconPhase += dt;
      if (this.visuals && this.visuals.beacon) {
        this.visuals.beacon.color.setHex(Math.sin(this.beaconPhase * 5) > 0 ? 0xff4b3c : 0x401512);
      }
      this.updateMissiles(dt);
    }
  }

  // Planes and helicopters on slow circuits high above the map.
  class Aircraft {
    constructor(scene, kind) {
      this.kind = kind;
      this.cx = U.randRange(rng, -45, 45);
      this.cz = U.randRange(rng, -35, 35);
      this.radius = U.randRange(rng, 220, 370);
      this.angle = rng() * Math.PI * 2;
      this.rate = (kind === 'plane' ? 0.055 : 0.085) * U.randRange(rng, 0.75, 1.35) * (rng() < 0.5 ? -1 : 1);
      this.altitude = kind === 'plane' ? U.randRange(rng, 68, 118) : U.randRange(rng, 44, 82);
      this.group = new THREE.Group();

      if (kind === 'plane') {
        const white = mat(0xe8edf0), accent = mat(0xc75040);
        const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.34, 5.6, 8), white);
        fuse.rotation.x = Math.PI / 2; fuse.castShadow = true;
        this.group.add(fuse);
        const nose = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.1, 8), accent);
        nose.rotation.x = Math.PI / 2; nose.position.z = 3.25;
        this.group.add(nose);
        this.group.add(box(9.8, 0.18, 1.55, white, 0, 0, 0.1));
        this.group.add(box(3.9, 0.14, 0.95, white, 0, 0.1, -2.45));
        this.group.add(box(0.14, 1.5, 1.15, accent, 0, 0.75, -2.45));
        for (const s of [-1, 1]) this.group.add(box(0.12, 0.7, 0.6, accent, s * 4.4, 0.05, 0.1));
        this.prop = new THREE.Group();
        this.prop.add(box(0.16, 2.5, 0.08, mat(0x4a5155), 0, 0, 0));
        this.prop.add(box(2.5, 0.16, 0.08, mat(0x4a5155), 0, 0, 0));
        this.prop.position.z = 3.85;
        this.group.add(this.prop);
      } else {
        const bodyColor = mat(U.pick(rng, [0xd94f42, 0x2f6e8e, 0xe0b845]));
        const body = new THREE.Mesh(new THREE.SphereGeometry(1, 9, 7), bodyColor);
        body.scale.set(1.1, 0.85, 2.0); body.castShadow = true;
        this.group.add(body);
        const bubble = new THREE.Mesh(new THREE.SphereGeometry(0.72, 8, 6), mat(0x2e566b));
        bubble.position.set(0, 0.3, 1.15);
        this.group.add(bubble);
        this.group.add(box(0.38, 0.38, 3.6, bodyColor, 0, 0.05, -2.6));
        this.group.add(box(0.1, 1.1, 0.7, bodyColor, 0, 0.5, -4.2));
        const metal = mat(0x8d979c);
        for (const s of [-1, 1]) {
          this.group.add(box(0.12, 0.12, 3.2, metal, s * 0.95, -1.25, 0));
          for (const z of [-0.9, 0.9]) this.group.add(box(0.1, 0.75, 0.1, metal, s * 0.95, -0.9, z));
        }
        this.rotor = new THREE.Group();
        this.rotor.add(box(7.4, 0.1, 0.3, mat(0x3c4448), 0, 0, 0));
        this.rotor.add(box(0.3, 0.1, 7.4, mat(0x3c4448), 0, 0, 0));
        this.rotor.position.y = 1.05;
        this.group.add(this.rotor);
        this.tailRotor = new THREE.Group();
        this.tailRotor.add(box(0.1, 1.5, 0.12, mat(0x3c4448), 0, 0, 0));
        this.tailRotor.add(box(0.1, 0.12, 1.5, mat(0x3c4448), 0, 0, 0));
        this.tailRotor.position.set(0.3, 0.55, -4.2);
        this.group.add(this.tailRotor);
      }
      scene.add(this.group);
      this.update(0);
    }

    update(dt) {
      this.angle += this.rate * dt;
      const x = this.cx + Math.cos(this.angle) * this.radius;
      const z = this.cz + Math.sin(this.angle) * this.radius;
      const y = this.altitude + Math.sin(this.angle * 2.2) * 3.5;
      this.group.position.set(x, y, z);
      const dir = Math.sign(this.rate) || 1;
      this.group.rotation.y = Math.atan2(-Math.sin(this.angle) * dir, Math.cos(this.angle) * dir);
      this.group.rotation.z = -dir * 0.17;
      if (this.rotor) this.rotor.rotation.y += dt * 22;
      if (this.tailRotor) this.tailRotor.rotation.x += dt * 28;
      if (this.prop) this.prop.rotation.z += dt * 26;
    }
  }

  function findWaterSpot() {
    for (let i = 0; i < 300; i++) {
      const x = U.randRange(rng, C.WORLD.minX + 12, -300);
      const z = U.randRange(rng, -60, 300);
      if (CC.coast.isWater(x, z) && CC.coast.distanceToWater(x, z) < -10) return { x, z };
    }
    return { x: C.WORLD.minX + 28, z: 100 };
  }

  // Cargo ships and small motor boats drifting around the bay.
  class Watercraft {
    constructor(scene, kind) {
      this.kind = kind;
      const route = CC.shipRoute || [];
      const berthIndex = CC.shipBerthIndex == null ? route.length - 1 : CC.shipBerthIndex;
      if (kind === 'ship' && berthIndex > 2) {
        // Stagger the fleet along the lane so they arrive at the terminal at
        // different times instead of stacking on one waypoint.
        this.routeIndex = 1 + Math.floor(rng() * Math.max(1, berthIndex - 3));
        this.routeDir = 1;
        this.shipState = 'inbound';
        this.dockTimer = 0;
        const start = route[this.routeIndex];
        const next = route[Math.min(this.routeIndex + 1, route.length - 1)];
        this.pos = { x: start.x, z: start.z };
        this.heading = Math.atan2(next.x - start.x, next.z - start.z);
      } else {
        const p = findWaterSpot();
        this.pos = { x: p.x, z: p.z };
        this.heading = rng() * Math.PI * 2;
      }
      this.stolen = false;
      this.speed = kind === 'ship' ? U.randRange(rng, 5, 7) : U.randRange(rng, 4, 9);
      this.phase = rng() * Math.PI * 2;
      this.t = rng() * 10;
      this.pierAvoid = null;
      this.group = new THREE.Group();

      if (kind === 'ship') {
        const hull = mat(U.pick(rng, [0x33424c, 0x4a3c3a, 0x2f4a52]));
        this.group.add(box(5.0, 2.4, 15, hull, 0, 0.5, 0));
        const bow = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 2.5, 4.2, 4), hull);
        bow.rotation.x = Math.PI / 2; bow.rotation.y = Math.PI / 4;
        bow.position.set(0, 0.5, 9.3);
        this.group.add(bow);
        this.group.add(box(4.6, 0.2, 14, mat(0x7b7466), 0, 1.8, 0));
        const containerColors = [0xb75043, 0x3f7f9c, 0xd0a94e, 0x6e8e63];
        for (let i = 0; i < 7; i++) {
          const c = mat(containerColors[i % containerColors.length]);
          const z = -5.2 + Math.floor(i / 2) * 3.2;
          this.group.add(box(3.6, 1.5, 2.8, c, (i % 2 ? 1 : -1) * 0.95, 2.65, z));
          if (i < 4) this.group.add(box(3.6, 1.5, 2.8, mat(containerColors[(i + 2) % 4]), (i % 2 ? 1 : -1) * 0.95, 4.15, z));
        }
        this.group.add(box(3.8, 2.5, 2.6, mat(0xe6e2d6), 0, 3.2, 6.0));
        this.group.add(cylinder(0.4, 0.5, 2.4, 8, mat(0x3b4145), 0, 5.1, 6.0));
        this.group.add(cylinder(0.07, 0.07, 4, 5, mat(0xcfd4d2), 0, 6.8, 6.0));
      } else {
        const color = mat(U.pick(rng, [0xe8e3d4, 0x9fc3c9, 0xd7b27f, 0xd18f78]));
        this.group.add(box(2.0, 0.75, 4.8, color, 0, 0.3, 0));
        const bow = new THREE.Mesh(new THREE.ConeGeometry(1.0, 2.1, 4), color);
        bow.rotation.x = Math.PI / 2; bow.rotation.y = Math.PI / 4;
        bow.position.set(0, 0.3, 3.35);
        this.group.add(bow);
        this.group.add(box(1.7, 0.1, 4.4, mat(0xd9c8a4), 0, 0.72, 0));
        this.group.add(box(1.35, 0.85, 1.6, mat(0xf1eee2), 0, 1.15, -0.6));
        this.group.add(box(1.4, 0.5, 0.06, mat(0x2e566b), 0, 1.3, 0.25));
        this.group.add(cylinder(0.05, 0.05, 2.3, 5, mat(0xb9c1c6), 0, 2.0, -1.6));
      }
      scene.add(this.group);
      this.update(0);
    }

    insidePier(x, z, pad) {
      const p = CC.Details && CC.Details.pierRect;
      if (p && x > p.endX - pad && x < p.startX + pad &&
        Math.abs(z - p.z) < p.halfZ + pad) return true;
      const zones = (CC.World && CC.World.noBoatZones) || [];
      for (let i = 0; i < zones.length; i++) {
        const z0 = zones[i];
        if (Math.abs(x - z0.x) < (z0.hw || 20) + pad && Math.abs(z - z0.z) < (z0.hz || 20) + pad) return true;
      }
      return false;
    }

    // Cargo ships run a precomputed lane from the ocean to the container
    // berth, dwell while cranes work, then sail back out and loop. They do not
    // travel north of the berth (no top-of-map / North Cross passage).
    updateShip(dt) {
      const route = CC.shipRoute || [];
      if (route.length < 2) return false;
      const berthIndex = CC.shipBerthIndex == null ? route.length - 1 : CC.shipBerthIndex;
      if (this.shipState === 'docked') {
        this.dockTimer -= dt;
        this.speed = 0;
        if (this.dockTimer <= 0) {
          this.shipState = 'outbound';
          this.routeDir = -1;
          this.routeIndex = Math.max(0, berthIndex - 1);
          this.speed = 6;
        }
        return true;
      }
      const targetIndex = U.clamp(this.routeIndex, 0, route.length - 1);
      const target = route[targetIndex];
      const dx = target.x - this.pos.x, dz = target.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.01) {
        const desired = Math.atan2(dx, dz);
        this.heading = U.angleLerp(this.heading, desired,
          1 - Math.exp(-2.2 * Math.max(dt, 0.016)));
        // Hold outside bascule drawbridges until channel is clear.
        let hold = false;
        const lookX = this.pos.x + Math.sin(this.heading) * 24;
        const lookZ = this.pos.z + Math.cos(this.heading) * 24;
        const spans = (CC.Drawbridges && CC.Drawbridges.spans) || [];
        for (let i = 0; i < spans.length; i++) {
          const s = spans[i];
          if (!s.bascule) continue;
          const r = U.distanceToSegment(lookX, lookZ, s.ax, s.az, s.bx, s.bz);
          if (r.dist < 20 && Math.min(r.t, 1 - r.t) * Math.hypot(s.bx-s.ax,s.bz-s.az) < 18) {
            if (!CC.Drawbridges.isChannelClear(s)) { hold = true; break; }
          }
        }
        if (!hold) {
          const step = Math.min(this.speed * dt, dist);
          this.pos.x += Math.sin(this.heading) * step;
          this.pos.z += Math.cos(this.heading) * step;
        }
      }
      if (dist < 7) {
        if (this.routeDir > 0 && targetIndex >= berthIndex) {
          this.shipState = 'docked';
          this.dockTimer = (CC.port && CC.port.dwellSeconds) || 14;
          this.speed = 0;
        } else {
          this.routeIndex += this.routeDir;
          if (this.routeIndex < 0) {
            this.routeIndex = 1;
            this.routeDir = 1;
            this.shipState = 'inbound';
            this.speed = U.randRange(rng, 5, 7);
          } else if (this.routeIndex > berthIndex) {
            this.routeIndex = berthIndex;
            this.routeDir = -1;
            this.shipState = 'docked';
            this.dockTimer = (CC.port && CC.port.dwellSeconds) || 14;
            this.speed = 0;
          } else if (this.routeIndex >= route.length) {
            this.routeIndex = Math.max(0, route.length - 2);
            this.routeDir = -1;
          }
        }
      }
      return true;
    }

    update(dt) {
      if (this.stolen) return;
      this.t += dt;
      if (this.kind === 'ship' && this.updateShip(dt)) {
        this.group.position.set(
          this.pos.x,
          CC.RetroWater
            ? CC.RetroWater.waterYFor(this.pos.x, this.pos.z, this.t, 0.22)
            : C.SEA_LEVEL + 0.22 + Math.sin(this.t * 1.5 + this.phase) * 0.12,
          this.pos.z
        );
        this.group.rotation.y = this.heading;
        this.group.rotation.z = Math.sin(this.t * 0.8 + this.phase) * 0.035;
        return;
      }
      // Look ahead and peel off toward open water before reaching the pier.
      // The detour is kept until the craft is past the obstacle, so it follows
      // a lane around the spur rather than bouncing off the pilings.
      const f0 = { x: Math.sin(this.heading), z: Math.cos(this.heading) };
      const pier = CC.Details && CC.Details.pierRect;
      if (pier && !this.pierAvoid) {
        const lx = this.pos.x + f0.x * 15, lz = this.pos.z + f0.z * 15;
        if (this.insidePier(lx, lz, 12) || this.insidePier(this.pos.x, this.pos.z, 9)) {
          this.pierAvoid = { side: this.pos.z <= pier.z ? -1 : 1, resume: this.heading };
          NPCSystem.pierAvoidances++;
        }
      }
      let heading = this.heading;
      if (this.pierAvoid && pier) {
        const resumeFx = Math.sin(this.pierAvoid.resume);
        const xDir = Math.abs(resumeFx) > 0.15 ? Math.sign(resumeFx)
          : (this.pos.x < pier.startX ? -1 : 1);
        const target = Math.atan2(xDir, this.pierAvoid.side);
        heading = U.angleLerp(heading, target,
          1 - Math.exp(-3.2 * Math.max(dt, 0.016)));
      }
      const f = { x: Math.sin(heading), z: Math.cos(heading) };
      const nx = this.pos.x + f.x * this.speed * dt;
      const nz = this.pos.z + f.z * this.speed * dt;
      const W = C.WORLD;
      const ok = nx > W.minX + 6 && nx < W.maxX - 6 && nz > W.minZ + 6 && nz < W.maxZ - 6 &&
        CC.coast.isWater(nx, nz) && CC.coast.distanceToWater(nx, nz) < -6 &&
        !this.insidePier(nx, nz, 4);
      if (ok) {
        this.pos.x = nx; this.pos.z = nz;
        if (this.pierAvoid && pier) {
          const resumeFx = Math.sin(this.pierAvoid.resume);
          const clearZ = Math.abs(this.pos.z - pier.z) > pier.halfZ + 16;
          const movingAway = (resumeFx > 0.15 && this.pos.x > pier.startX + 14) ||
            (resumeFx < -0.15 && this.pos.x < pier.endX - 14) ||
            (Math.abs(resumeFx) <= 0.15 && (this.pos.x < pier.endX - 14 ||
              this.pos.x > pier.startX + 14));
          if (clearZ || movingAway) {
            this.heading = this.pierAvoid.resume;
            this.pierAvoid = null;
          } else {
            this.heading = heading;
          }
        } else {
          this.heading = heading;
        }
      } else {
        if (this.pierAvoid && this.insidePier(nx, nz, 10)) {
          this.heading = Math.atan2(Math.sin(heading), this.pierAvoid.side);
        } else {
          this.heading += U.randRange(rng, 1.9, 4.3) * (rng() < 0.5 ? -1 : 1);
        }
      }
      this.group.position.set(
        this.pos.x,
        CC.RetroWater
          ? CC.RetroWater.waterYFor(this.pos.x, this.pos.z, this.t, 0.22)
          : C.SEA_LEVEL + 0.22 + Math.sin(this.t * 1.5 + this.phase) * (this.kind === 'ship' ? 0.12 : 0.2),
        this.pos.z
      );
      this.group.rotation.y = this.heading;
      this.group.rotation.z = Math.sin(this.t * 0.8 + this.phase) * (this.kind === 'ship' ? 0.035 : 0.07);
    }

    setStolen(stolen) {
      this.stolen = !!stolen;
      this.group.visible = !this.stolen;
    }

    placeAt(x, z, heading) {
      this.pos.x = x; this.pos.z = z;
      this.heading = heading == null ? this.heading : heading;
      this.group.position.set(x, CC.RetroWater ? CC.RetroWater.waterYFor(x, z, this.t, 0.22) : C.SEA_LEVEL + 0.22, z);
      this.group.rotation.y = this.heading;
    }
  }

  /* ---------- system ---------- */
  const NPCSystem = (CC.NPCSystem = {
    traffic: [],
    buses: [],
    busRoute: null,
    busStopsServed: 0,
    busBoardings: 0,
    busAlightings: 0,
    amusementPatrons: 0,
    businessPatrons: 0,
    beaconCustomer: null,
    amusementWorkers: 0,
    amusementDogs: 0,
    boardwalkWalkers: 0,
    pierWalkers: 0,
    pierFishers: 0,
    policeCars: [],
    policeHelicopters: [],
    parkedCars: [],
    pedestrians: [],
    dogs: [],
    critters: [],
    birds: [],
    ducks: [],
    alligators: [],
    platoons: [],
    soldiers: [],
    platoonDepartures: 0,
    platoonReturns: 0,
    recklessEvents: 0,
    soldierAvoidances: 0,
    recklessCrashes: 0,
    pedestriansRunOff: 0,
    recklessMessageCooldown: 0,
    aircraft: [],
    watercraft: [],
    pierAvoidances: 0,
    drones: [],
    droneCrashes: 0,
    dronesShotDown: 0,
    airDefense: null,
    escortPickups: 0,
    privateMoments: 0,
    companion: null,
    gangCars: [],
    _trafficCtx: { drivers: [], soldiers: [], pedestrians: [] },
    _chaseTimer: 0,
    gangCrimes: 0,
    gangCarJackings: 0,
    gangMessageCooldown: 0,
    shots: [],
    stolenCar: null,
    currentPlayer: null,
    wanted: false,
    wantedStars: 0,
    wantedGainCooldown: 0,
    STAR_COOLDOWN: 12,
    arrestCooldown: 0,
    // Walking cops start a short struggle instead of booking someone instantly.
    arrest: {
      active: false, time: 0, duration: 0, escape: 0, progress: 0,
      required: 1, cooldown: 0, officer: null, player: null,
      lastDir: 0, lastPush: 0
    },
    arrestAttempts: 0,
    arrestEscapes: 0,
    crimeTimer: 0,
    evadeTimer: 0,
    policeSighting: false,
    MAX_WANTED_STARS: 5,
    EVADE_SECONDS: 180,

    setWantedStars(stars) {
      const next = U.clamp(Math.round(stars), 0, this.MAX_WANTED_STARS);
      const changed = next !== this.wantedStars;
      this.wantedStars = next;
      this.wanted = next > 0;
      if (next > 0) {
        this.evadeTimer = 0;
        this.crimeTimer = this.EVADE_SECONDS;
      } else {
        this.crimeTimer = 0;
        this.evadeTimer = 0;
        this.wantedGainCooldown = 0;
      }
      if (changed && CC.Game && CC.Game.updateWantedHud) CC.Game.updateWantedHud();
      return changed;
    },

    reportCrime(reason) {
      if (!reason || this.arrestCooldown > 0) return;
      // Every crime opens the first star. While already wanted, further stars
      // need a breather so one collision chain does not jump to five stars.
      let stars = this.wantedStars > 0 ? this.wantedStars : 1;
      if (this.wantedStars > 0 && this.wantedGainCooldown <= 0) stars += 1;
      if (stars > this.wantedStars) {
        this.setWantedStars(stars);
        this.wantedGainCooldown = this.STAR_COOLDOWN + (stars - 1) * 3;
      }
      this.evadeTimer = 0;
      if (CC.Game && CC.Game.showMessage) {
        CC.Game.showMessage(reason + ' — ' + this.wantedStars + '★ wanted', 3);
      }
    },

    policeSeen() {
      if (!this.wanted) return;
      this.policeSighting = true;
      this.evadeTimer = 0;
    },

    policeFire(x, y, z, tx, ty, tz, chance) {
      if (!this.effects || !this.wanted) return;
      const spread = 2.2;
      const ex = tx + (Math.random() - 0.5) * spread;
      const ey = ty + (Math.random() - 0.5) * spread * 0.8;
      const ez = tz + (Math.random() - 0.5) * spread;
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, y, z), new THREE.Vector3(ex, ey, ez)
      ]);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
        color: 0xffe9a8, transparent: true, opacity: 0.95,
        depthWrite: false, fog: false
      }));
      line.renderOrder = 12;
      this.effects.add(line);
      this.shots.push({ line: line, life: 0.12, max: 0.12 });
      if (CC.Audio && CC.Audio.gunshot) CC.Audio.gunshot();

      const player = this.currentPlayer;
      if (player && Math.random() < (chance == null ? 0.3 : chance)) {
        if (player.registerCrash && player.spec && !player.spec.water && !player.isAircraft) {
          player.registerCrash(12);
        }
        if (CC.Game && CC.Game.bulletHit) CC.Game.bulletHit();
      }
    },

    nearestParkedCar(pos, radius) {
      let best = null, bestD = radius == null ? 4.8 : radius;
      for (let i = 0; i < this.parkedCars.length; i++) {
        const car = this.parkedCars[i];
        if (car.stolen) continue;
        const d = U.distance2D(pos.x, pos.z, car.pos.x, car.pos.z);
        if (d < bestD) { bestD = d; best = car; }
      }
      return best;
    },

    // Any drivable vehicle can be stolen on foot: parked and moving road
    // traffic, buses, cruisers, gang cars, NPC boats and parked aircraft.
    nearestStealableCar(pos, radius) {
      let best = null, bestD = radius == null ? 6.4 : radius;
      const self = this;
      function consider(source, type, key, label, crime, range, extraPose) {
        if (!source || source.disabled || source.stolen || source.abducted) return;
        const group = source.group || source.model;
        if (!group || !group.visible) return;
        const p = source.pos || group.position || source;
        if (!p || !isFinite(p.x) || !isFinite(p.z)) return;
        const limit = radius == null ? (range || 6.4) : radius;
        const d = U.distance2D(pos.x, pos.z, p.x, p.z);
        if (d >= limit) return;
        bestD = d;
        const heading = source.heading == null ? group.rotation.y : source.heading;
        const pose = { x: p.x, z: p.z, h: heading, s: 0 };
        if (extraPose) {
          for (const k in extraPose) if (Object.prototype.hasOwnProperty.call(extraPose, k)) pose[k] = extraPose[k];
        }
        best = {
          source: source, type: type, key: key, kind: key,
          label: label || (CC.vehicleSpecs[key] && CC.vehicleSpecs[key].label) || 'Car',
          crime: crime || 'Car theft', heading: heading, pose: pose
        };
      }
      this.parkedCars.forEach(function (car) {
        consider(car, 'parked', car.kind, null, 'Car theft');
      });
      this.traffic.forEach(function (car) { self._considerTraffic(car, consider); });
      this.gangCars.forEach(function (car) { self._considerTraffic(car, consider); });
      this.buses.forEach(function (bus) {
        consider(bus, 'bus', 'bus', 'City Bus', 'Steal bus');
      });
      this.policeCars.forEach(function (car) {
        consider(car, 'police', 'car', 'Police Cruiser', 'Steal police car');
      });
      this.watercraft.forEach(function (craft) {
        const ship = craft.kind === 'ship';
        consider(craft, 'watercraft', 'boat',
          ship ? 'Cargo Ship' : 'Motor Boat',
          ship ? 'Steal cargo ship' : 'Steal motor boat', 9);
      });
      (CC.aircraftSpawns || []).forEach(function (spawn) {
        const spec = CC.vehicleSpecs[spawn.key];
        const crime = spawn.key === 'fpv' ? 'Steal FPV quad'
          : spawn.key === 'helicopter' ? 'Steal helicopter' : 'Steal plane';
        consider(spawn, 'aircraft', spawn.key, spec && spec.label, crime, 11,
          { altitude: spawn.altitude });
      });
      return best;
    },

    nearestStealableVehicle(pos, radius) {
      return this.nearestStealableCar(pos, radius);
    },

    _considerTraffic(car, consider) {
      if (car.isGang) return consider(car, 'gang', car.kind, 'Gang Car', 'Steal car');
      const key = car.kind || 'car';
      const label = CC.vehicleSpecs[key] && CC.vehicleSpecs[key].label;
      consider(car, 'traffic', key, label, key === 'cart' ? 'Steal golf cart' : 'Car theft');
    },

    stealCar(target) { return this.stealVehicle(target); },

    stealVehicle(target) {
      if (!target) return null;
      const source = target.source || target;
      const key = target.key || source.kind || (source.visual && source.visual.key) || 'car';
      if (!CC.vehicleSpecs[key] || source.disabled || source.stolen) return null;
      const pose = target.pose || (function () {
        const group = source.group || source.model;
        const p = source.pos || (group && group.position) || source;
        return {
          x: p.x, z: p.z,
          h: source.heading == null ? (group && group.rotation.y) : source.heading,
          s: 0
        };
      })();
      const type = target.type || 'parked';
      if (typeof source.setStolen === 'function') source.setStolen(true);
      else {
        source.disabled = true;
        const group = source.group || source.model;
        if (group) group.visible = false;
      }
      source.stolen = true;
      source._stealType = type;
      this.stolenCar = source;
      this.reportCrime(target.crime || 'Car theft');
      return {
        source: source, type: type, key: key, kind: key,
        label: target.label || CC.vehicleSpecs[key].label, pose: pose
      };
    },

    stealNearest(pos) {
      const car = this.nearestParkedCar(pos);
      if (!car) return null;
      return this.stealVehicle({
        source: car, type: 'parked', key: car.kind, kind: car.kind,
        crime: 'Car theft'
      });
    },

    releaseStolenCar(pose) { return this.releaseStolenVehicle(pose); },

    releaseStolenVehicle(pose) {
      const car = this.stolenCar;
      if (!car) return;
      const heading = pose ? (pose.h == null ? pose.heading : pose.h) : null;
      if (car._stealType === 'aircraft') {
        // Parked aircraft keep their airport pose; only the stolen copy moves.
        car.stolen = false;
        car.disabled = false;
        if (car.model) car.model.visible = true;
      } else if (typeof car.setStolen === 'function') {
        // Parked cars and NPC watercraft return to a drivable pose.
        if (pose && typeof car.placeAt === 'function') car.placeAt(pose.x, pose.z, heading);
        car.setStolen(false);
      } else {
        // A hijacked moving vehicle stays as a harmless abandoned wreck where
        // the player left it; its AI road position is no longer meaningful.
        if (pose && car.group) {
          const y = CC.heightAt(pose.x, pose.z) +
            ((car.visual && car.visual.spec && car.visual.spec.wheelRadius) || 0);
          car.group.position.set(pose.x, y, pose.z);
          car.group.rotation.y = heading;
        }
        car.group.visible = true;
        car.disabled = true;
      }
      car.stolen = false;
      car._stealType = null;
      this.stolenCar = null;
    },

    // Horn pickup: only from a road-going player vehicle and only for a nearby
    // adult NPC who is currently working the bars or a neighborhood corner.
    tryPickupEscort(player) {
      if (!player || player.isPedestrian || player.isAircraft || (player.spec && player.spec.water)) return null;
      if (this.companion || Math.abs(player.speed || 0) > 14) return null;
      let best = null, bestD = 5.2;
      for (let i = 0; i < this.pedestrians.length; i++) {
        const p = this.pedestrians[i];
        if (!p.isEscort || p.inVehicle || p.pickupCooldown > 0) continue;
        const d = U.distance2D(p.position.x, p.position.z, player.pos.x, player.pos.z);
        if (d < bestD) { bestD = d; best = p; }
      }
      if (!best) return null;
      best.inVehicle = true;
      best.group.visible = false;
      best.pickupCooldown = 20;
      this.companion = best;
      this.escortPickups++;
      if (CC.Game && CC.Game.showMessage) {
        CC.Game.showMessage('Companion aboard — find a quiet spot off the road', 3);
      }
      return best;
    },

    isSecluded(pos) {
      if (!pos || CC.coast.isWater(pos.x, pos.z) || CC.coast.distanceToWater(pos.x, pos.z) < 4) return false;
      const nr = CC.nearestRoad && CC.nearestRoad(pos.x, pos.z);
      if (nr && nr.dist < 26) return false;
      if (CC.roadClearance && CC.roadClearance(pos.x, pos.z, 1.8) < 22) return false;
      const zones = CC.ImageMap && CC.ImageMap.zones || {};
      for (const name in zones) {
        const q = zones[name];
        if (Math.abs(pos.x - q.x) < q.w * 0.5 + 10 && Math.abs(pos.z - q.z) < q.h * 0.5 + 10) return false;
      }
      const structures = CC.World.obstacles || [];
      for (let i = 0; i < structures.length; i++) {
        const o = structures[i];
        if (U.distance2D(pos.x, pos.z, o.x, o.z) < (o.r || 6) + 10) return false;
      }
      for (let i = 0; i < this.pedestrians.length; i++) {
        const p = this.pedestrians[i];
        if (p === this.companion || p.inVehicle) continue;
        if (U.distance2D(pos.x, pos.z, p.position.x, p.position.z) < 20) return false;
      }
      const cars = this.policeCars.concat(this.traffic, this.parkedCars);
      for (let i = 0; i < cars.length; i++) {
        const c = cars[i];
        if (!c || c.disabled || !c.pos) continue;
        if (U.distance2D(pos.x, pos.z, c.pos.x, c.pos.z) < 22) return false;
      }
      return true;
    },

    companionReady(pos) { return !!this.companion && this.isSecluded(pos); },

    completePrivateMoment(pos, heading) {
      const p = this.companion;
      if (!p || !pos) return null;
      let spot = null;
      for (let i = 0; i < 18 && !spot; i++) {
        const a = (heading || 0) + (i % 2 ? 1 : -1) * Math.ceil((i + 1) / 2) * 0.55;
        const d = 4.5 + Math.floor(i / 6) * 1.3;
        const x = pos.x + Math.cos(a) * d;
        const z = pos.z + Math.sin(a) * d;
        if (CC.coast.isWater(x, z) || CC.coast.distanceToWater(x, z) < 2) continue;
        if (CC.roadClearance && CC.roadClearance(x, z, 1.2) < 1.5) continue;
        spot = { x: x, z: z };
      }
      if (!spot) spot = { x: pos.x + 4, z: pos.z + 4 };
      p.position.set(spot.x, CC.heightAt(spot.x, spot.z), spot.z);
      p.group.position.copy(p.position);
      p.group.visible = true;
      p.inVehicle = false;
      p.pickupCooldown = 25;
      p.workHome.set(spot.x, spot.z);
      p.workTarget.set(spot.x, spot.z);
      p.heading = (heading || 0) + Math.PI * 0.5;
      p.chooseEscortTarget();
      this.companion = null;
      this.privateMoments++;
      if (CC.Game && CC.Game.showMessage) {
        CC.Game.showMessage('Your companion slips away and heads back toward town', 3);
      }
      return p;
    },

    gangFire(x, y, z, tx, ty, tz) {
      if (!this.effects) return;
      const spread = 1.6;
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, y, z),
        new THREE.Vector3(tx + (Math.random() - 0.5) * spread,
          ty + (Math.random() - 0.5) * spread, tz + (Math.random() - 0.5) * spread)
      ]);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
        color: 0xffd9a0, transparent: true, opacity: 0.9, depthWrite: false, fog: false
      }));
      line.renderOrder = 12;
      this.effects.add(line);
      this.shots.push({ line: line, life: 0.09, max: 0.09 });
      if (CC.Audio && CC.Audio.gunshot) CC.Audio.gunshot();
    },

    knockPedestrian(ped, awayX, awayZ, speed) {
      if (!ped || !ped.position || ped.inVehicle || ped.hitCooldown > 0) return;
      const len = Math.hypot(awayX, awayZ) || 1;
      const push = U.clamp(speed / 8, 0.7, 1.5);
      ped.hitCooldown = 3.2;
      ped.fleeTimer = U.randRange(recklessRng, 2.2, 3.4);
      ped.fleeX = awayX / len * 8 * push;
      ped.fleeZ = awayZ / len * 8 * push;
      ped.vy = 3.4;
      this.pedestriansRunOff++;
      if (this.recklessMessageCooldown <= 0 && CC.Game && CC.Game.showMessage) {
        this.recklessMessageCooldown = 14;
        CC.Game.showMessage('Reckless driver ran someone off the road', 2.4);
      }
    },

    gangRobbery(gang, victim) {
      this.gangCrimes++;
      if (victim && !victim.fleeTimer) {
        const dx = victim.position.x - gang.position.x;
        const dz = victim.position.z - gang.position.z;
        const d = Math.hypot(dx, dz) || 1;
        victim.fleeTimer = U.randRange(rng, 3, 5);
        victim.fleeX = dx / d * 7.5;
        victim.fleeZ = dz / d * 7.5;
        victim.vy = 2.5;
      }
      if (this.gangMessageCooldown <= 0 && CC.Game && CC.Game.showMessage) {
        this.gangMessageCooldown = 7;
        CC.Game.showMessage('Armed robbery reported nearby', 2.6);
      }
    },

    gangCarjack(gang, car) {
      if (!car || car.stolen || car.disabled) return;
      car.setStolen(true);
      gang.inVehicle = true;
      gang.pickupCooldown = U.randRange(rng, 24, 40);
      gang.group.visible = false;
      gang.crimeTarget = null;
      this.gangCarJackings++;
      const driven = this.spawnGangCar(car);
      if (driven && this.gangMessageCooldown <= 0 && CC.Game && CC.Game.showMessage) {
        this.gangMessageCooldown = 7;
        CC.Game.showMessage('Carjacking reported — gang fleeing the scene', 2.8);
      }
    },

    spawnGangCar(car) {
      if (!this.scene) return null;
      const nr = CC.nearestRoad(car.pos.x, car.pos.z, 'paved');
      if (!nr) return null;
      const road = CC.roadDefs[nr.roadIndex];
      if (!road || !road._length) return null;
      const s = U.clamp((road._cum && road._cum[nr.segIndex] || 0) + 12, 6, road._length - 6);
      const p = CC.sampleRoad(road, s);
      const dir = p.dx * nr.dx + p.dz * nr.dz >= 0 ? 1 : -1;
      const driven = new TrafficCar(this.scene, road, s, dir, car.kind);
      driven.baseSpeed = U.randRange(rng, 18, 26) * pace('traffic');
      driven.speed = driven.target = driven.baseSpeed;
      driven.isGang = true;
      driven.reckless = true;
      driven.behavior = 'cutoff';
      driven.behaviorTimer = U.randRange(recklessRng, 5, 10);
      this.gangCars.push(driven);
      if (this.currentPlayer) {
        driven.update(0, this.currentPlayer, this.gangCars, CC.World, null);
      }
      return driven;
    },

    clearWanted() {
      this.setWantedStars(0);
      this.policeSighting = false;
      this.arrestCooldown = 2.5;
      this.wantedGainCooldown = 0;
      (this.policeCars || []).forEach(function (p) {
        p.mode = 'patrol'; p.chase = false; p.chaseDelay = 0;
      });
      (this.policeHelicopters || []).forEach(function (h) { h.active = false; h.setVisible(false); });
    },
    // Immediate booking is only valid for a suspect who is already on foot.
    // Keeping this as a separate method preserves the old public hook while
    // making the vehicle case a no-op.
    onArrest(player) {
      if (!player || !player.isPedestrian || this.arrest.active) return false;
      if (this.arrestCooldown > 0) return false;
      return this.completeArrest();
    },

    completeArrest() {
      this.arrestCooldown = 5;
      this.clearWanted();
      this.arrestCooldown = 5;
      if (CC.Audio && CC.Audio.siren) CC.Audio.siren();
      if (CC.Game && CC.Game.busted) CC.Game.busted();
      return true;
    },

    // Read raw keys and stick axes without consuming Gamepad.edge() state,
    // which the main loop still needs for vehicle switching and menus.
    arrestStruggleInput() {
      const keys = (CC.Game && CC.Game.keys) || {};
      let dir = ((keys.d || keys.arrowright) ? 1 : 0) -
        ((keys.a || keys.arrowleft) ? 1 : 0);
      let push = ((keys.w || keys.arrowup) ? 1 : 0) -
        ((keys.s || keys.arrowdown) ? 1 : 0);
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (let i = 0; i < pads.length; i++) {
        const pad = pads[i];
        if (!pad || !pad.connected) continue;
        const axis = CC.Gamepad ? CC.Gamepad.axis(pad.axes[0], 0.13) : 0;
        if (Math.abs(axis) > Math.abs(dir)) dir = axis;
        const stickY = CC.Gamepad ? CC.Gamepad.axis(pad.axes[1], 0.14) : 0;
        const trigger = (pad.buttons[7] ? (pad.buttons[7].value || 0) : 0) -
          (pad.buttons[6] ? (pad.buttons[6].value || 0) : 0);
        const vertical = Math.abs(trigger) > 0.2 ? trigger : -stickY;
        if (Math.abs(vertical) > Math.abs(push)) push = vertical;
        break;
      }
      return { dir: dir, push: push };
    },

    beginArrest(player, officer) {
      if (!player || !player.isPedestrian || !this.wanted) return false;
      if (this.arrest.active || this.arrestCooldown > 0 || this.arrest.cooldown > 0) return false;
      const a = this.arrest;
      a.active = true;
      a.time = 0;
      a.duration = 3.4 + Math.min(1.6, this.wantedStars * 0.3);
      a.escape = 0;
      a.progress = 0;
      a.cooldown = 0;
      a.officer = officer || null;
      a.player = player;
      a.lastDir = 0;
      a.lastPush = 0;
      this.arrestAttempts++;
      if (officer) officer.speed = 0;
      if (CC.Game && CC.Game.showMessage) {
        CC.Game.showMessage('Resisting arrest — mash A/D or W/S to break free!', 2.6);
      }
      if (CC.Game && CC.Game.updateArrestUI) CC.Game.updateArrestUI(true, 0, 0, a.duration);
      return true;
    },

    endArrest(escaped) {
      const a = this.arrest;
      if (!a.active) return;
      const officer = a.officer;
      a.active = false;
      a.time = 0;
      a.escape = 0;
      a.progress = 0;
      a.cooldown = escaped ? 3.4 : 4.5;
      a.officer = null;
      a.player = null;
      a.lastDir = 0;
      a.lastPush = 0;
      if (officer) {
        officer.speed = 0;
        officer.fireCooldown = Math.max(officer.fireCooldown || 0, 1.2);
      }
      if (CC.Game && CC.Game.updateArrestUI) CC.Game.updateArrestUI(false, 0, 0, 0);
    },

    escapeArrest() {
      const a = this.arrest;
      if (!a.active) return;
      const player = a.player;
      this.endArrest(true);
      this.arrestEscapes++;
      if (player) player.speed = Math.max(player.speed || 0, 3.2);
      if (CC.Game && CC.Game.showMessage) {
        CC.Game.showMessage('You broke free — lose the cops before they grab you again!', 3);
      }
    },

    updateBeaconCustomer(dt) {
      const D = CC.Details;
      const spot = D && D.beaconCustomerSpot;
      const parkSpots = (D && D.beaconLotParkSpots) || [];
      if (!spot || !parkSpots.length || !this.scene) return;
      const bc = this.beaconCustomer || (this.beaconCustomer = { state: 'idle', timer: 8 + rng() * 12 });
      bc.timer -= dt;
      // Idle is the common case; don't build the four state-machine helpers.
      if (bc.state === 'idle' && bc.timer > 0) return;
      const makeCar = () => {
        const kind = U.pick(rng, ['car', 'coupe', 'compact', 'pickup']);
        const color = U.pick(rng, [0xb9b6aa, 0x6d889f, 0xb56d5e, 0x8ca178, 0xc7a755, 0x707b84]);
        const visual = CC.VehicleFactory.build(kind, color);
        this.scene.add(visual.group);
        return { kind, color, visual, group: visual.group, spec: visual.spec };
      };
      const setCarPose = (car, x, z, h) => {
        car.group.position.set(x, CC.heightAt(x, z) + car.spec.wheelRadius, z);
        car.group.rotation.y = h;
      };
      const removeCar = () => {
        if (bc.car && bc.car.group) { this.scene.remove(bc.car.group); }
        bc.car = null;
      };
      const spawnPed = (x, z) => {
        const ped = new Pedestrian(this.scene, x, z, 'patron', { x: x, z: z, spread: 8 });
        ped.chooseEscortTarget = function() {
          const bx = -300, bz = 216;
          for (let i=0;i<10;i++) {
            const a = rng()*Math.PI*2, d = 2 + rng()*8;
            const tx = bx + Math.cos(a)*d, tz = bz + Math.sin(a)*d;
            if (!CC.coast.isWater(tx,tz)) { this.target.set(tx,tz); return; }
          }
          this.target.set(bx, bz + 14);
        };
        ped.chooseEscortTarget();
        this.pedestrians.push(ped);
        return ped;
      };

      if (bc.state === 'idle') {
        if (bc.timer > 0) return;
        bc.park = parkSpots[Math.floor(rng() * parkSpots.length)];
        bc.car = makeCar();
        bc.from = { x: -200, z: 202 };
        bc.to = { x: bc.park.x, z: bc.park.z + 8 };
        bc.t = 0;
        bc.state = 'arriving';
        bc.timer = 0;
      } else if (bc.state === 'arriving') {
        bc.t += dt * 0.18;
        const t = Math.min(1, bc.t);
        const x = U.lerp(bc.from.x, bc.to.x, t);
        const z = U.lerp(bc.from.z, bc.to.z, t);
        const h = Math.atan2(bc.to.x - bc.from.x, bc.to.z - bc.from.z);
        setCarPose(bc.car, x, z, h);
        if (t >= 1) { bc.state = 'parking'; bc.t = 0; }
      } else if (bc.state === 'parking') {
        bc.t += dt * 0.35;
        const t = Math.min(1, bc.t);
        const x = U.lerp(bc.to.x, bc.park.x, t);
        const z = U.lerp(bc.to.z, bc.park.z, t);
        const h = Math.atan2(bc.park.x - bc.to.x, bc.park.z - bc.to.z);
        setCarPose(bc.car, x, z, h);
        if (t >= 1) {
          setCarPose(bc.car, bc.park.x, bc.park.z, bc.park.h || 0);
          bc.state = 'parked';
          bc.timer = 1.2 + rng() * 1.5;
        }
      } else if (bc.state === 'parked') {
        if (bc.timer > 0) return;
        bc.ped = spawnPed(bc.park.x + 1.2, bc.park.z + 2.5);
        if (bc.ped) this.businessPatrons++;
        bc.state = 'visiting';
        bc.timer = 18 + rng() * 18;
      } else if (bc.state === 'visiting') {
        if (bc.ped && bc.ped.position) {
          // keep patron near beacon
          const d = U.distance2D(bc.ped.position.x, bc.ped.position.z, -300, 216);
          if (d > 28) bc.ped.chooseEscortTarget();
        }
        if (bc.timer > 0) return;
        if (bc.ped) { bc.ped.target.set(bc.park.x + 1.2, bc.park.z + 2.5); bc.ped.speed = Math.max(bc.ped.speed, 1.4); }
        bc.state = 'returning';
        bc.timer = 12;
      } else if (bc.state === 'returning') {
        if (bc.ped) {
          const d = U.distance2D(bc.ped.position.x, bc.ped.position.z, bc.park.x + 1.2, bc.park.z + 2.5);
          if (d < 1.8 || bc.timer <= 0) {
            if (bc.ped.group) this.scene.remove(bc.ped.group);
            const idx = this.pedestrians.indexOf(bc.ped);
            if (idx >= 0) this.pedestrians.splice(idx, 1);
            bc.ped = null;
            bc.state = 'leaving';
            bc.t = 0;
            bc.from = { x: bc.park.x, z: bc.park.z };
            bc.to = { x: -200, z: 202 };
          }
        } else {
          bc.state = 'leaving'; bc.t = 0; bc.from = { x: bc.park.x, z: bc.park.z }; bc.to = { x: -200, z: 202 };
        }
      } else if (bc.state === 'leaving') {
        bc.t += dt * 0.2;
        const t = Math.min(1, bc.t);
        const x = U.lerp(bc.from.x, bc.to.x, t);
        const z = U.lerp(bc.from.z, bc.to.z, t);
        const h = Math.atan2(bc.to.x - bc.from.x, bc.to.z - bc.from.z);
        setCarPose(bc.car, x, z, h);
        if (t >= 1) {
          removeCar();
          bc.state = 'idle';
          bc.timer = 20 + rng() * 35;
        }
      }
    },

    updateArrest(dt, player) {
      const a = this.arrest;
      a.cooldown = Math.max(0, a.cooldown - dt);
      if (!a.active) return;
      if (!player || !player.isPedestrian || !this.wanted || (a.player && a.player !== player)) {
        this.endArrest(true);
        return;
      }

      const officer = a.officer;
      if (officer && officer.position) {
        const d = U.distance2D(officer.position.x, officer.position.z, player.pos.x, player.pos.z);
        if (d > 4.5) {
          this.endArrest(true);
          if (CC.Game && CC.Game.showMessage) CC.Game.showMessage('You slipped away from the officer', 2);
          return;
        }
        officer.speed = 0;
        if (d > 1.35) {
          const nx = (player.pos.x - officer.position.x) / d;
          const nz = (player.pos.z - officer.position.z) / d;
          const pull = d - 1.35;
          officer.position.x += nx * pull;
          officer.position.z += nz * pull;
        }
      }

      const input = this.arrestStruggleInput();
      const sign = function (v) { return v > 0.25 ? 1 : v < -0.25 ? -1 : 0; };
      const ds = sign(input.dir), ps = sign(input.push);
      let gain = (Math.abs(input.dir) + Math.abs(input.push) * 0.65) * dt * 0.18;
      if (ds && a.lastDir && ds !== a.lastDir) gain += 0.16;
      if (ps && a.lastPush && ps !== a.lastPush) gain += 0.12;
      if (ds) a.lastDir = ds;
      if (ps) a.lastPush = ps;
      a.escape = U.clamp(a.escape + gain - dt * 0.05, 0, 1);
      a.progress = a.escape;
      if (CC.Game && CC.Game.updateArrestUI) {
        CC.Game.updateArrestUI(true, a.escape, a.time, a.duration);
      }
      if (a.escape >= a.required) { this.escapeArrest(); return; }

      a.time += dt;
      if (a.time >= a.duration) {
        const suspect = a.player;
        this.endArrest(false);
        // Final foot check: entering a car mid-struggle cancels the booking.
        if (suspect && suspect.isPedestrian) this.completeArrest();
      }
    },

    // Keep a small crowd waiting at each platform so every bus has someone to
    // pick up. Riders stay in the pedestrian list (hidden while aboard), which
    // lets the normal pedestrian update keep their animation state consistent.
    topUpBusStop(stop, wanted) {
      if (!stop || !this.scene) return;
      stop.waiting = stop.waiting || [];
      const target = wanted == null ? 3 : wanted;
      while (stop.waiting.length < target) {
        const offset = (stop.waiting.length - 1) * 0.85;
        const owner = {
          x: stop.waitX + offset * Math.cos(stop.yaw + Math.PI / 2),
          z: stop.waitZ + offset * Math.sin(stop.yaw + Math.PI / 2),
          yaw: stop.yaw + Math.PI,
          spread: 2.4
        };
        const rider = new Pedestrian(this.scene, owner.x, owner.z, 'worker', owner);
        rider.isBusRider = true;
        rider.busStop = stop;
        this.pedestrians.push(rider);
        stop.waiting.push(rider);
      }
    },

    releaseBusPassenger(rider, stop) {
      if (!rider || !stop) return;
      const side = (rider.motelSlot % 3 - 1) * 0.7;
      const x = stop.waitX + Math.cos(stop.yaw) * side;
      const z = stop.waitZ + Math.sin(stop.yaw) * side;
      rider.position.set(x, CC.heightAt(x, z), z);
      rider.group.position.copy(rider.position);
      rider.group.visible = true;
      rider.inVehicle = false;
      rider.pickupCooldown = 8;
      rider.workHome.set(stop.waitX, stop.waitZ);
      rider.workTarget.set(stop.waitX, stop.waitZ);
      rider.workFacing = stop.yaw + Math.PI;
      rider.heading = rider.workFacing;
      stop.waiting.push(rider);
    },

    init(scene) {
      cacheTrafficEndpoints();
      cacheRoadConnections();
      this.scene = scene;
      this.buses.length = 0;
      this.ducks.length = 0;
      this.alligators.length = 0;
      this.platoons.length = 0;
      this.soldiers.length = 0;
      this.platoonDepartures = 0;
      this.platoonReturns = 0;
      this.recklessEvents = 0;
      this.soldierAvoidances = 0;
      this.recklessCrashes = 0;
      this.pedestriansRunOff = 0;
      this.recklessMessageCooldown = 0;
      this.busStopsServed = 0;
      this.busBoardings = 0;
      this.busAlightings = 0;
      this.amusementPatrons = 0;
      this.businessPatrons = 0;
      this.amusementWorkers = 0;
      this.amusementDogs = 0;
      this.boardwalkWalkers = 0;
      this.pierWalkers = 0;
      this.pierFishers = 0;
      this.pierAvoidances = 0;
      this.gangCars.length = 0;
      this.gangCrimes = 0;
      this.gangCarJackings = 0;
      this.gangMessageCooldown = 0;
      this.escortPickups = 0;
      this.privateMoments = 0;
      this.companion = null;
      if (this.beaconCustomer && this.beaconCustomer.car && this.beaconCustomer.car.group && this.scene) {
      this.scene.remove(this.beaconCustomer.car.group);
    }
    if (this.beaconCustomer && this.beaconCustomer.ped && this.beaconCustomer.ped.group && this.scene) {
      this.scene.remove(this.beaconCustomer.ped.group);
    }
    this.beaconCustomer = null;
      this.effects = new THREE.Group();
      scene.add(this.effects);
      // Keep traffic on the paved streets; gravel launch/parking roads stay quiet.
      const npcTrafficRoads = CC.roadDefs.filter(function (r) {
        return r.type === 'paved' && r.name !== 'Harbor Avenue' && !r.noTraffic && !r.noNpcCars;
      });
      const roads = npcTrafficRoads
        .slice().sort((a, b) => b._length - a._length).slice(0, 14);
      roads.forEach(function (road) {
        const count = 3;
        for (let i = 0; i < count; i++) {
          let dir = road.oneWay ? road.oneWay : (rng() < 0.5 ? 1 : -1);
          const s = (i + 0.35 + rng() * 0.3) / count * road._length;
          // Never start a car heading out of a wooded dead end.
          if (!road.oneWay) {
            if (dir > 0 && road._hiddenEnd && s > road._length - 24) dir = -1;
            if (dir < 0 && road._hiddenStart && s < 24) dir = 1;
          }
          const kind = U.pick(rng, trafficKinds);
          const car = new TrafficCar(scene, road, s, dir, kind);
          NPCSystem.traffic.push(car);
          // Exactly one ordinary traffic car is the heavy smoker.
          if (NPCSystem.traffic.length === 1) car.heavySmoker = true;
        }
      });

      // Transit runs a fixed loop through every painted bus stop. Waiting
      // riders are ordinary pedestrians parked on the platform until boarding.
      const busStops = (CC.Details && CC.Details.busStops) || [];
      const busLegs = CC.busRouteLegs ? CC.busRouteLegs() : [];
      this.busRoute = buildBusPath(busLegs, busStops);
      if (this.busRoute && busStops.length) {
        busStops.forEach(function (stop) { NPCSystem.topUpBusStop(stop, 2); });
        for (let i = 0; i < 3; i++) {
          const bus = new TransitBus(scene, this.busRoute,
            i * this.busRoute.length / 3, i);
          NPCSystem.buses.push(bus);
          bus.update(0, NPCSystem.currentPlayer || null, NPCSystem.buses, null, null);
        }
      }

      // Patrol cruisers share the same street network, but only patrol the
      // longer open roads so none of them get stuck at a wooded dead end.
      const patrolRoads = roads.filter(function (r) {
        return r._length > 180 && !r._hiddenStart && !r._hiddenEnd;
      });
      if (!patrolRoads.length) patrolRoads.push.apply(patrolRoads, roads);
      for (let i = 0; i < 6 && patrolRoads.length; i++) {
        const road = patrolRoads[i % patrolRoads.length];
        const dir = i % 2 ? -1 : 1;
        const s = U.randRange(rng, 18, road._length - 18);
        NPCSystem.policeCars.push(new PoliceCar(scene, road, s, dir));
      }
      for (let i = 0; i < 2; i++) {
        NPCSystem.policeHelicopters.push(new PoliceHelicopter(scene, i));
      }

      const makePedAt = function (x, z, role, owner) {
        if (CC.coast.isWater(x, z)) return null;
        const p = new Pedestrian(scene, x, z, role, owner);
        NPCSystem.pedestrians.push(p);
        return p;
      };
      const homes = CC.World.obstacles.filter(o => o.type === 'home');
      // Roadside cars that can be stolen by walking up and pressing E.
      const paved = CC.roadDefs.filter(r => r.type === 'paved' && r._length > 4);
      const carColors = [0xb9b6aa, 0x6d889f, 0xb56d5e, 0x8ca178, 0xc7a755, 0x707b84, 0xd9dde0];
      const parkedKinds = ['car', 'car', 'truck', 'coupe', 'muscleCar', 'taxi', 'limo', 'offroad', 'compact'];
      for (let i = 0; i < 20; i++) {
        const spot = findParkSpot(NPCSystem.parkedCars);
        if (!spot) break;
        const kind = U.pick(rng, parkedKinds);
        const color = U.pick(rng, carColors);
        NPCSystem.parkedCars.push(new ParkedCar(scene, spot.x, spot.z, spot.h, kind, color));
      }
      // Driveway cars are collected by Details.buildParkedVehicles so they can
      // share the same stealable ParkedCar path as the roadside cars.
      (CC.drivewayCarSpots || []).forEach(function (spot) {
        NPCSystem.parkedCars.push(new ParkedCar(scene, spot.x, spot.z, spot.h, spot.kind, spot.color));
      });

      // Clerks and vendors outside the boardwalk storefronts.
      const workerAnchors = (CC.Details && CC.Details.boardwalkWorkerAnchors) || [];
      workerAnchors.forEach(function (a, i) {
        const ped = makePedAt(a.x + ((i % 3) - 1) * 0.35, a.z + (i % 2 ? 0.3 : -0.3),
          a.role || 'worker', a);
        if (!ped) return;
        ped.heading = a.yaw == null ? -Math.PI / 2 : a.yaw;
        ped.workHome.set(a.x, a.z);
        ped.workTarget.set(a.x, a.z);
        ped.workFacing = ped.heading;
        const az = CC.ImageMap && CC.ImageMap.zones && CC.ImageMap.zones.amusement;
        if (az && CC.ImageMap.inZone(a.x, a.z, 'amusement')) this.amusementWorkers++;
      }, this);

      // A dense midway crowd: guests circle the rides, queue at the food carts
      // and drift between the game stalls without leaving the amusement zone.
      const az = CC.ImageMap && CC.ImageMap.zones && CC.ImageMap.zones.amusement;
      if (az) {
        const guestColors = [0x2f95ad, 0xd45f3f, 0x7b4fbf, 0x4f9a6b, 0xd9a23c];
        for (let i = 0; i < 28; i++) {
          const a = rng() * Math.PI * 2;
          const d = U.randRange(rng, 8, Math.min(az.w, az.h) * 0.44);
          const x = az.x + Math.cos(a) * d;
          const z = az.z + Math.sin(a) * d;
          const anchor = { x: x, z: z, spread: U.randRange(rng, 16, 30), yaw: a,
            color: guestColors[i % guestColors.length] };
          const guest = makePedAt(x, z, 'patron', anchor);
          if (!guest) continue;
          guest.chooseEscortTarget();
          this.amusementPatrons++;
        }
      }

      // Companions outside the night spots and wandering the neighborhoods.
      const nightlife = (CC.Details && CC.Details.nightlifeSpots) || [];
      nightlife.forEach(function (spot) {
        // The bar and the club have the liveliest pavements; keep their crowd
        // dense without filling every storefront with the same number.
        const count = /CORAL CLUB/i.test(spot.name) ? 8 : 5;
        for (let i = 0; i < count; i++) {
          const anchor = {
            x: spot.x + U.randRange(rng, -spot.spread * 0.7, spot.spread * 0.7),
            z: spot.z + U.randRange(rng, -spot.spread * 0.5, spot.spread * 0.5),
            spread: spot.spread, yaw: Math.PI
          };
          makePedAt(anchor.x, anchor.z, 'escort', anchor);
        }
      });
      // Coral Club parking lot and entrance NPCs/prostitutes.
      ((CC.Details && CC.Details.clubParkingSpots) || []).forEach(function (p, i) {
        const anchor = { x: p.x, z: p.z, spread: 3.5, yaw: Math.PI };
        makePedAt(p.x, p.z, i % 2 ? 'escort' : 'patron', anchor);
      });
      ((CC.Details && CC.Details.clubEntranceSpots) || []).forEach(function (p) {
        const anchor = { x: p.x, z: p.z, spread: 2.5, yaw: Math.PI };
        makePedAt(p.x, p.z, 'escort', anchor);
      });
      // Beacon Seafood dock workers/loiterers.
      ((CC.Details && CC.Details.beaconDockSpots) || []).forEach(function (p, i) {
        const anchor = { x: p.x, z: p.z, spread: 2.8, yaw: Math.PI };
        const ped = makePedAt(p.x, p.z, 'worker', anchor);
        if (ped) NPCSystem.businessPatrons++;
      });
      // Ordinary shoppers and loiterers outside every business frontage.
      ((CC.Details && CC.Details.businessCrowdSpots) || []).forEach(function (spot) {
        const busy = /CORAL CLUB|TAVERN|BAR|LOUNGE|DINER|MOTEL|LIQUOR/i.test(spot.name);
        const count = busy ? 3 : 2;
        for (let i = 0; i < count; i++) {
          const anchor = {
            x: spot.x + U.randRange(rng, -spot.spread * 0.8, spot.spread * 0.8),
            z: spot.z + U.randRange(rng, -spot.spread * 0.5, spot.spread * 0.5),
            spread: spot.spread, yaw: Math.PI
          };
          const ped = makePedAt(anchor.x, anchor.z, 'patron', anchor);
          if (!ped) continue;
          ped.chooseEscortTarget();
          NPCSystem.businessPatrons++;
        }
      });
      // No Tell Motel regulars work the parking apron and approach stopped cars.
      ((CC.Details && CC.Details.motelSpots) || []).forEach(function (spot) {
        for (let i = 0; i < 5; i++) {
          const anchor = {
            x: spot.x + U.randRange(rng, -15, 15),
            z: spot.z + U.randRange(rng, -5, 6),
            spread: spot.spread, yaw: Math.PI, motel: true, slot: i
          };
          makePedAt(anchor.x, anchor.z, 'escort', anchor);
        }
      });

      const homeCount = Math.min(8, Math.floor(homes.length * 0.12));
      for (let i = 0; i < homeCount; i++) {
        const h = homes[Math.floor(rng() * homes.length)];
        const a = rng() * Math.PI * 2;
        const anchor = {
          x: h.x + Math.cos(a) * 14,
          z: h.z + Math.sin(a) * 14,
          spread: 16,
          yaw: a
        };
        makePedAt(anchor.x, anchor.z, 'escort', anchor);
      }

      // Sidewalk strollers.
      for (let i = 0; i < 18 && paved.length; i++) {
        const road = U.pick(rng, paved);
        const p = CC.sampleRoad(road, rng() * road._length);
        const side = rng() < 0.5 ? 1 : -1;
        const x = p.x + p.dz * side * (road.width * 0.5 + U.randRange(rng, 3, 7));
        const z = p.z - p.dx * side * (road.width * 0.5 + U.randRange(rng, 3, 7));
        makePedAt(x, z, rng() < 0.4 ? 'walk' : 'idle');
      }
      // Beat cops walking the streets and guarding the station entrance.
      for (let i = 0; i < 12 && paved.length; i++) {
        const road = U.pick(rng, paved);
        const p = CC.sampleRoad(road, rng() * road._length);
        const side = rng() < 0.5 ? 1 : -1;
        const off = road.width * 0.5 + U.randRange(rng, 2.5, 5.5);
        const cop = makePedAt(p.x + p.dz * side * off, p.z - p.dx * side * off, 'cop');
        if (cop) cop.chooseTarget();
      }
      const station = CC.policeSpawn || { x: 200, z: 2 };
      [[-6, -2], [6, -2]].forEach(function (o) {
        const cop = makePedAt(station.x + o[0], station.z + o[1], 'cop');
        if (cop) cop.chooseTarget();
      });
      // Roving crews work the streets: they wave guns at pedestrians and grab
      // parked cars, then cruise off in the stolen ride.
      for (let g = 0; g < 3 && paved.length; g++) {
        const gang = { id: g };
        const road = U.pick(rng, paved);
        const p = CC.sampleRoad(road, U.randRange(rng, 30, Math.max(40, road._length - 30)));
        const side = rng() < 0.5 ? 1 : -1;
        const off = road.width * 0.5 + U.randRange(rng, 5, 9);
        for (let m = 0; m < 3; m++) {
          const ped = makePedAt(
            p.x + p.dz * side * off + U.randRange(rng, -2, 2),
            p.z - p.dx * side * off + U.randRange(rng, -2, 2),
            'gang', { gang: gang, spread: 45 }
          );
          if (ped) ped.chooseGangTarget();
        }
      }

      // Beach walkers and fishers.
      for (let i = 0; i < 10; i++) {
        const south = rng() < 0.55;
        let x, z;
        if (south) {
          x = U.randRange(rng, -270, 320);
          z = CC.coast.southLine(x) - U.randRange(rng, 5, 18);
        } else {
          z = U.randRange(rng, -320, 250);
          x = CC.coast.westLine(z) + U.randRange(rng, 5, 18);
        }
        const ped = makePedAt(x, z, rng() < 0.4 ? 'fish' : 'walk');
        if (ped && ped.role === 'walk') ped.chooseTarget();
      }
      // Boardwalk strollers keep to the wooden planks between the shops.
      const bwx = CC.Details && CC.Details.boardwalkPath;
      if (bwx) {
        const bwPath = { minZ: -338, maxZ: -204, xAt: bwx, offset: 0 };
        for (let i = 0; i < 14; i++) {
          const z = U.randRange(rng, bwPath.minZ, bwPath.maxZ);
          const owner = {
            path: { minZ: bwPath.minZ, maxZ: bwPath.maxZ, xAt: bwx,
              offset: U.randRange(rng, -2.4, 2.4) },
            deckOffset: CC.Details.boardwalkDeckOffset,
            yaw: Math.PI * 0.5
          };
          const walker = new Pedestrian(scene, bwx(z, owner.path.offset), z,
            'boardwalk', owner);
          NPCSystem.pedestrians.push(walker);
          walker.choosePathTarget();
          this.boardwalkWalkers++;
        }
      }
      // Pier walkers and anglers sit on the deck itself, so they are created
      // directly instead of going through the land-only makePedAt helper.
      const pierPath = CC.Details && CC.Details.pierPath;
      if (pierPath && typeof CC.Details.pierDeckY === 'number') {
        for (let i = 0; i < 6; i++) {
          const x = U.randRange(rng, pierPath.minX, pierPath.maxX);
          const z = pierPath.z + U.randRange(rng, -2, 2);
          const walker = new Pedestrian(scene, x, z, 'pierwalk', {
            path: pierPath, deckY: CC.Details.pierDeckY, yaw: -Math.PI / 2
          });
          NPCSystem.pedestrians.push(walker);
          walker.choosePathTarget();
          this.pierWalkers++;
        }
        for (let i = 0; i < 5; i++) {
          const x = U.randRange(rng, pierPath.minX, pierPath.maxX);
          const z = pierPath.z + U.randRange(rng, -3, 3);
          const fisher = new Pedestrian(scene, x, z, 'pierfish', {
            path: pierPath, deckY: CC.Details.pierDeckY, yaw: -Math.PI / 2
          });
          NPCSystem.pedestrians.push(fisher);
          fisher.choosePathTarget();
          this.pierFishers++;
        }
      }
      // Dog walkers near homes.
      for (let i = 0; i < 5 && i < homes.length; i++) {
        const h = homes[Math.floor(rng() * homes.length)];
        const a = rng() * Math.PI * 2;
        const owner = makePedAt(h.x + Math.cos(a) * 9, h.z + Math.sin(a) * 9, 'walk');
        if (owner) makePedAt(owner.position.x + 1, owner.position.z - 1, 'dog', owner);
      }
      // Plenty of free-roaming dogs, with a few more near the homes.
      for (let i = 0; i < 26; i++) {
        if (i < 8 && homes.length) {
          const h = homes[Math.floor(rng() * homes.length)];
          const a = rng() * Math.PI * 2;
          let s = { x: h.x + Math.cos(a) * U.randRange(rng, 5, 16), z: h.z + Math.sin(a) * U.randRange(rng, 5, 16) };
          if (CC.coast.isWater(s.x, s.z)) s = findLandSpot(2);
          NPCSystem.dogs.push(new Dog(scene, s.x, s.z));
        } else {
          const s = findLandSpot(2);
          NPCSystem.dogs.push(new Dog(scene, s.x, s.z));
        }
      }
      // Loose stray dogs work the amusement park midway. They stay inside the
      // fenced-in guest area instead of wandering off into traffic.
      const dogZone = CC.ImageMap && CC.ImageMap.zones && CC.ImageMap.zones.amusement;
      if (dogZone) {
        const home = { x: dogZone.x, z: dogZone.z, spread: Math.min(dogZone.w, dogZone.h) * 0.42 };
        for (let i = 0; i < 12; i++) {
          const a = rng() * Math.PI * 2;
          const d = U.randRange(rng, 6, home.spread);
          const x = dogZone.x + Math.cos(a) * d;
          const z = dogZone.z + Math.sin(a) * d;
          if (CC.coast.isWater(x, z)) continue;
          NPCSystem.dogs.push(new Dog(scene, x, z, home));
          this.amusementDogs++;
        }
      }
      // Rabbits and squirrels dart through the grass and the edge of the woods.
      for (let i = 0; i < 44; i++) {
        const s = findLandSpot(2);
        NPCSystem.critters.push(new Critter(scene, s.x, s.z, i % 2 ? 'rabbit' : 'squirrel'));
      }
      // Gulls over the water, songbirds over the town and the trees.
      for (let i = 0; i < 30; i++) {
        const z = U.randRange(rng, C.WORLD.minZ + 20, C.WORLD.maxZ - 20);
        const x = CC.coast.westLine(z) + U.randRange(rng, 12, 150);
        NPCSystem.birds.push(new Bird(scene, 'gull', x, z));
      }
      for (let i = 0; i < 34; i++) {
        const s = findLandSpot(8);
        NPCSystem.birds.push(new Bird(scene, 'song', s.x, s.z));
      }
      // Ponds: ducks paddle every pool, with an alligator patrolling each of
      // the larger ones (including Willow Pond beside the community park).
      const ponds = (CC.ImageMap && CC.ImageMap.zones && CC.ImageMap.zones.ponds) || [];
      ponds.forEach(function (pond) {
        if (!(pond && pond.r > 0)) return;
        const duckCount = pond.park ? 6 : 4;
        for (let i = 0; i < duckCount; i++) {
          NPCSystem.ducks.push(new Duck(scene, pond, i));
        }
        if (pond.r >= 20) NPCSystem.alligators.push(new Alligator(scene, pond));
      });
      // Army platoons muster at the airport compound, march a road route to a
      // community site, then turn around and come home before the next detail.
      const outpost = (CC.Details && CC.Details.outpostPos) ||
        (CC.militaryOutpost ? CC.militaryOutpost() : null);
      if (outpost) {
        const destinations = CC.platoonDestinations ? CC.platoonDestinations() : [];
        for (let i = 0; i < 3; i++) {
          const platoon = new Platoon(scene, i, outpost, destinations);
          NPCSystem.platoons.push(platoon);
          NPCSystem.soldiers.push.apply(NPCSystem.soldiers, platoon.members);
        }
      }
      // Aircraft circling overhead and boats plying the bay.
      for (let i = 0; i < 4; i++) NPCSystem.aircraft.push(new Aircraft(scene, 'plane'));
      for (let i = 0; i < 3; i++) NPCSystem.aircraft.push(new Aircraft(scene, 'helicopter'));
      // A handful of low-altitude drones cross the town on random routes.
      NPCSystem.droneCrashes = 0;
      NPCSystem.dronesShotDown = 0;
      for (let i = 0; i < 4; i++) NPCSystem.drones.push(new ShahedDrone(scene, i));
      NPCSystem.airDefense = new AirDefenseBattery(scene, this.effects);
      for (let i = 0; i < 3; i++) NPCSystem.watercraft.push(new Watercraft(scene, 'ship'));
      for (let i = 0; i < 9; i++) NPCSystem.watercraft.push(new Watercraft(scene, 'boat'));

      // Add the downloaded animated villagers and higher-resolution PSX
      // citizens to a spread of ordinary townsfolk already placed across the
      // boardwalk, roads, trailer park and beaches. If the optional GLB loader
      // cannot run, those pedestrians simply keep their procedural bodies.
      const DL = CC.DownloadedCharacterLoader;
      NPCSystem.downloadedPedestrians = [];
      if (DL && DL.keys && DL.keys.length) {
        const eligible = this.pedestrians.filter(function (p) {
          return !p.inVehicle && p.role !== 'cop' && p.role !== 'gang' && p.role !== 'dog';
        });
        // Each baked rig owns dozens of skinned meshes. Keep a small, varied
        // sample instead of one per key: the procedural townsfolk still fill
        // the world, and the renderer no longer pays thousands of skinned draws.
        const count = Math.min(DL.keys.length, eligible.length, 4);
        for (let i = 0; i < count; i++) {
          const ped = eligible[Math.floor((i + 0.5) * eligible.length / count)];
          const key = DL.keys[i % DL.keys.length];
          ped.attachDownloaded(key, { moving: false });
          NPCSystem.downloadedPedestrians.push(ped);
        }
      }

      // Roaming cockroaches: oversized pests that scurry around buildings and
      // roadside lots. They opt in to the baked animated "giant cockroach" GLB
      // so the town feels alive without touching ordinary townsfolk.
      NPCSystem.roaches = [];
      const roachCount = DL && DL.creatureKeys && DL.creatureKeys.indexOf('roach') >= 0 ? 4 : 0;
      // Giant, easy-to-spot pests. The old 0.9 scale at 80+ units away made
      // them effectively invisible to a player just starting on the road.
      const ROACH_SCALE = 2;
      const ROACH_RADIUS = 1.4;
      const roachObstacles = CC.World.obstacles || [];
      const roachSpotClear = function (x, z) {
        for (let i = 0; i < roachObstacles.length; i++) {
          const o = roachObstacles[i];
          if (U.distance2D(x, z, o.x, o.z) < (o.r || 1) + 2) return false;
        }
        return true;
      };
      const placedRoaches = [];
      for (let i = 0; i < roachCount; i++) {
        let spot = null;
        let bestNear = null;
        let bestDistance = Infinity;
        const nearStart = i < roachCount / 2;
        const attempts = nearStart ? 160 : 60;
        for (let attempt = 0; attempt < attempts && !spot; attempt++) {
          const candidate = findLandSpot(4);
          if (!roachSpotClear(candidate.x, candidate.z)) continue;
          if (placedRoaches.some(function (p) {
            return U.distance2D(candidate.x, candidate.z, p.x, p.z) < 16;
          })) continue;
          const nr = CC.nearestRoad(candidate.x, candidate.z);
          const roadDistance = nr ? nr.dist : 0;
          // Half the roaches stay close to the starting road so players meet
          // them early; the rest scatter across the wider town.
          const fromStart = U.distance2D(candidate.x, candidate.z, -106, -35);
          if (nearStart) {
            if (roadDistance > 35) continue;
            if (fromStart >= 18 && fromStart <= 70) { spot = candidate; break; }
            // Keep the closest clear roadside spot even if the tight ring missed.
            if (fromStart >= 18 && fromStart < bestDistance) {
              bestNear = candidate;
              bestDistance = fromStart;
            }
          } else {
            if (roadDistance > 22) continue;
            spot = candidate;
          }
        }
        if (!spot && nearStart && bestNear) spot = bestNear;
        if (!spot) spot = findLandSpot(4);
        placedRoaches.push(spot);
        const roach = new Pedestrian(scene, spot.x, spot.z, 'roach');
        roach.homeRadius = 8;
        roach.radius = ROACH_RADIUS;
        roach.target.set(spot.x + U.randRange(rng, -4, 4), spot.z + U.randRange(rng, -4, 4));
        roach.attachDownloaded('roach', {
          scale: ROACH_SCALE, radius: ROACH_RADIUS, moving: true, clip: 'Run'
        });
        NPCSystem.pedestrians.push(roach);
        NPCSystem.roaches.push(roach);
      }
    },
    update(dt, player, world, audio) {
      this.currentPlayer = player;
      this.policeSighting = false;
      this.arrestCooldown = Math.max(0, this.arrestCooldown - dt);
      this.wantedGainCooldown = Math.max(0, this.wantedGainCooldown - dt);
      this._animBudget = (this._animBudget || 0) + dt;
      const doAnim = this._animBudget >= 0.05;
      if (doAnim) this._animBudget = 0;
      this._doAnim = doAnim;
      if (this.companion && player &&
          (player.isPedestrian || player.isAircraft || (player.spec && player.spec.water))) {
        this.completePrivateMoment(player.pos, player.heading);
      }

      // More stars put more cruisers on the chase, starting with the closest.
      // Ranking a dozen cars every frame during a chase is wasted work; a
      // quarter-second refresh is visually identical and much smoother.
      // Time trials suspend police pursuit so the course stays completable.
      const inTimeTrial = !!(CC.Game && CC.Game.activeChallenge && !CC.Game.freeRoam);
      const chaseable = !inTimeTrial && this.wanted && !player.isAircraft && !(player.spec && player.spec.water);
      this._chaseTimer -= dt;
      if (chaseable && this._chaseTimer <= 0) {
        const ranked = this.policeCars.filter(function (p) { return !p.disabled; }).sort(function (a, b) {
          return U.distance2D(a.pos.x, a.pos.z, player.pos.x, player.pos.z) -
            U.distance2D(b.pos.x, b.pos.z, player.pos.x, player.pos.z);
        });
        // Roll the pursuit in gradually instead of turning every nearby cruiser
        // loose in the same quarter-second.
        const activeCars = Math.min(this.policeCars.length, Math.min(4, 1 + this.wantedStars));
        ranked.forEach(function (p, i) {
          const shouldChase = i < activeCars;
          if (shouldChase && !p.chase) p.chaseDelay = 1.5 + i * 2;
          if (!shouldChase) p.chaseDelay = 0;
          p.chase = shouldChase;
        });
        this._chaseTimer = 0.25;
      } else if (!chaseable) {
        this.policeCars.forEach(function (p) { p.chase = false; p.chaseDelay = 0; });
        this._chaseTimer = 0;
      }
      if (CC.TeenGangSystem && CC.TeenGangSystem.assignPolice) {
        CC.TeenGangSystem.assignPolice(dt, this);
      }

      // Marching columns move first so traffic avoids their current positions.
      for (let i = 0; i < this.platoons.length; i++) this.platoons[i].update(dt, player, world);
      const trafficCtx = this._trafficCtx;
      trafficCtx.drivers.length = 0;
      trafficCtx.drivers.push.apply(trafficCtx.drivers, this.traffic);
      trafficCtx.drivers.push.apply(trafficCtx.drivers, this.buses);
      trafficCtx.drivers.push.apply(trafficCtx.drivers, this.policeCars);
      trafficCtx.drivers.push.apply(trafficCtx.drivers, this.gangCars);
      trafficCtx.soldiers = this.soldiers;
      trafficCtx.pedestrians = this.pedestrians;
      // Lead-car checks only need cars on the same road. Rebuild this small
      // index once per frame instead of scanning every car from every car.
      const byRoad = trafficCtx.trafficByRoad ||
        (trafficCtx.trafficByRoad = new Map());
      byRoad.clear();
      for (let i = 0; i < this.traffic.length; i++) {
        const car = this.traffic[i];
        if (car.disabled || !car.road) continue;
        let bucket = byRoad.get(car.road);
        if (!bucket) byRoad.set(car.road, bucket = []);
        bucket.push(car);
      }
      for (let i = 0; i < this.traffic.length; i++) {
        if (this.traffic[i].disabled) continue;
        this.traffic[i].update(dt, player, this.traffic, world, audio, trafficCtx);
      }
      for (let i = 0; i < this.buses.length; i++) {
        if (!this.buses[i].disabled) this.buses[i].update(dt, player, this.buses, world, audio);
      }
      for (let i = 0; i < this.policeCars.length; i++) {
        if (!this.policeCars[i].disabled) this.policeCars[i].update(dt, player, world, audio);
      }
      for (let i = 0; i < this.policeHelicopters.length; i++) {
        const h = this.policeHelicopters[i];
        if (h.disabled) continue;
        h.update(dt, player, world, audio);
      }
      this.gangMessageCooldown = Math.max(0, this.gangMessageCooldown - dt);
      this.recklessMessageCooldown = Math.max(0, this.recklessMessageCooldown - dt);
      this.updateBeaconCustomer(dt);
      // Cached once instead of filtering every road on every gang pickup tick.
      if (!NPCSystem._pickupRoads) {
        NPCSystem._pickupRoads = CC.roadDefs.filter(function (r) {
          return r.type === 'paved' && r._length > 60 && !r.noNpcCars;
        });
      }
      const roads = NPCSystem._pickupRoads;
      for (let i = 0; i < this.pedestrians.length; i++) {
        const ped = this.pedestrians[i];
        if (!ped.isGang || !ped.inVehicle) continue;
        ped.pickupCooldown -= dt;
        if (ped.pickupCooldown > 0) continue;
        if (roads.length) {
          const road = U.pick(rng, roads);
          const p = CC.sampleRoad(road, U.randRange(rng, 20, road._length - 20));
          const side = rng() < 0.5 ? 1 : -1;
          const off = road.width * 0.5 + U.randRange(rng, 4, 8);
          ped.position.set(p.x + p.dz * side * off, CC.heightAt(p.x, p.z), p.z - p.dx * side * off);
        }
        ped.inVehicle = false;
        ped.group.visible = true;
        ped.crimeTimer = 1;
        ped.crimeTarget = null;
      }
      // Resolve an active struggle before the walking cops take their turn so
      // the grabbing officer can be held still and the UI reflects this frame.
      this.updateArrest(dt, player);
      const px = player.pos.x, pz = player.pos.z;
      for (let i = 0; i < this.pedestrians.length; i++) {
        const ped = this.pedestrians[i];
        const dx = ped.position.x - px, dz = ped.position.z - pz;
        const d2 = dx*dx + dz*dz;
        const vis = d2 < 170*170;
        ped.group.visible = vis;
        if (!vis) continue;
        if (d2 < 65*65 || this._doAnim || ped.isGang || ped.alerted || ped.fleeing) ped.update(dt, player, world);
      }
      for (let i = 0; i < this.gangCars.length; i++) {
        if (this.gangCars[i].disabled) continue;
        this.gangCars[i].update(dt, player, this.gangCars, world, audio);
      }
      for (let i = 0; i < this.dogs.length; i++) {
        const a = this.dogs[i];
        const dx = a.position.x - px, dz = a.position.z - pz;
        const far = dx*dx + dz*dz > 180*180;
        a.group.visible = !far;
        if (far) continue;
        const ox = a.position.x, oz = a.position.z;
        a.update(dt, player);
        if (CC.resolveObstacleSlide) {
          CC.resolveObstacleSlide(a.position, ox, oz, 0.42,
            { allowWoods: true, padding: 0.1 });
        }
      }
      for (let i = 0; i < this.critters.length; i++) {
        const a = this.critters[i];
        const dx = a.position.x - px, dz = a.position.z - pz;
        const far = dx*dx + dz*dz > 160*160;
        a.group.visible = !far;
        if (far) continue;
        const ox = a.position.x, oz = a.position.z;
        a.update(dt, player);
        if (CC.resolveObstacleSlide) {
          CC.resolveObstacleSlide(a.position, ox, oz, 0.34,
            { allowWoods: true, padding: 0.08 });
        }
      }
      for (let i = 0; i < this.birds.length; i++) {
        const b = this.birds[i];
        if (b.disabled) continue;
        const dx = b.group.position.x - px, dz = b.group.position.z - pz;
        const vis = dx*dx + dz*dz < 260*260;
        b.group.visible = vis;
        if (vis) b.update(dt);
      }
      for (let i = 0; i < this.ducks.length; i++) {
        const d = this.ducks[i];
        const dx = d.group.position.x - px, dz = d.group.position.z - pz;
        const vis = dx*dx + dz*dz < 220*220;
        d.group.visible = vis; if (vis) d.update(dt, player);
      }
      for (let i = 0; i < this.alligators.length; i++) {
        const g = this.alligators[i];
        const dx = g.group.position.x - px, dz = g.group.position.z - pz;
        const vis = dx*dx + dz*dz < 220*220;
        g.group.visible = vis; if (vis) g.update(dt, player);
      }
      for (let i = 0; i < this.aircraft.length; i++) {
        if (!this.aircraft[i].disabled) this.aircraft[i].update(dt);
      }
      for (let i = 0; i < this.drones.length; i++) {
        if (!this.drones[i].disabled) this.drones[i].update(dt);
      }
      if (this.airDefense) this.airDefense.update(dt);
      for (let i = 0; i < this.watercraft.length; i++) {
        const w = this.watercraft[i];
        if (w.disabled) continue;
        const dx = w.group.position.x - px, dz = w.group.position.z - pz;
        const vis = dx*dx + dz*dz < 450*450;
        w.group.visible = vis; if (vis) w.update(dt);
      }

      for (let i = this.shots.length - 1; i >= 0; i--) {
        const shot = this.shots[i];
        shot.life -= dt;
        shot.line.material.opacity = Math.max(0, shot.life / shot.max) * 0.95;
        if (shot.life <= 0) {
          this.effects.remove(shot.line);
          shot.line.geometry.dispose();
          shot.line.material.dispose();
          this.shots.splice(i, 1);
        }
      }

      // Three full minutes without a sighting clears the whole wanted level.
      // During a time trial, pause the evade timer so the suspension doesn't
      // accidentally clear wanted stars the player still needs to deal with.
      const trialActive = !!(CC.Game && CC.Game.activeChallenge && !CC.Game.freeRoam);
      if (this.wanted) {
        if (!this.policeSighting && !trialActive) this.evadeTimer += dt;
        this.crimeTimer = Math.max(0, this.EVADE_SECONDS - this.evadeTimer);
        if (!trialActive && this.evadeTimer >= this.EVADE_SECONDS) {
          this.clearWanted();
          if (CC.Game && CC.Game.showMessage) CC.Game.showMessage('You lost the police — wanted level cleared', 3);
        }
      }
    }
  });
})();
