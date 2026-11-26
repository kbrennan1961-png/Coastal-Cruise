/* Coastal Cruise - runtime support for edits exported by map-editor.html.
   Loaded after js/MapEdits.js and before the world/game builders. */
(function () {
  'use strict';

  const CC = (window.CC = window.CC || {});
  const EMPTY = {
    version: 1,
    generated: null,
    active: false,
    newMap: false,
    mapName: null,
    world: null,
    mapWidth: null,
    mapHeight: null,
    elevation: null,
    roads: null,
    buildings: null,
    landmarks: null,
    challenges: null,
    assets: [],
    trailerShots: [],
    missions: []
  };
  CC.mapEdits = Object.assign({}, EMPTY, CC.mapEdits || {});

  // Mission patches are additive (version 1). The editor exports them through
  // patchData(); the runtime keeps a stable array for console-driven filming.
  CC.missions = Array.isArray(CC.mapEdits.missions) ? CC.mapEdits.missions : [];

  function clonePoint(p) { return [p[0], p[1]]; }

  function cloneRoad(r) {
    return Object.assign({}, r, {
      points: (r.points || []).map(clonePoint)
    });
  }

  function cloneAsset(a) {
    return Object.assign({}, a);
  }

  // A patch created with "New map" replaces the baked town completely, using
  // a fresh blank canvas and the exported world dimensions. This runs at
  // script load, before ImageMap.loadBaked() captures CC.bakedMap.
  function applyNewMapBase() {
    const e = CC.mapEdits;
    if (!e || !e.newMap || !e.world) return;
    const world = {
      minX: Number(e.world.minX), maxX: Number(e.world.maxX),
      minZ: Number(e.world.minZ), maxZ: Number(e.world.maxZ)
    };
    if (![world.minX, world.maxX, world.minZ, world.maxZ].every(isFinite)) return;
    if (world.maxX <= world.minX || world.maxZ <= world.minZ) return;
    CC.C.WORLD = world;

    const spanX = world.maxX - world.minX;
    const spanZ = world.maxZ - world.minZ;
    const pxW = Math.max(256, Math.min(1200, Math.round(spanX)));
    const pxH = Math.max(256, Math.min(1200, Math.round(pxW * spanZ / spanX)));
    CC.bakedMap = {
      width: pxW,
      height: pxH,
      zones: {
        shore: { base: world.minX - 100000, amp1: 0, amp2: 0, freq1: 0, freq2: 0, phase2: 0 },
        beachWidth: 0,
        ponds: [],
        ramps: [],
        forest: [],
        riverFill: []
      },
      landmarks: [],
      roads: [],
      buildings: [],
      challenges: []
    };
    if (CC.river) CC.river.points = [];
    if (CC.coast) {
      CC.coast.riverDepth = function () { return 1000; };
      CC.coast.inMarsh = function () { return false; };
      CC.coast.isWater = function () { return false; };
      CC.coast.distanceToWater = function () { return 1000; };
    }
    if (CC.pondDefs) CC.pondDefs = function () { return []; };
  }
  applyNewMapBase();

  // Called from ImageMap.loadBaked() after simplifyBurgerBayRoads(), so the
  // exported view wins over the older baked/runtime road overrides.
  CC.applyMapEdits = function (IM) {
    const edits = CC.mapEdits;
    if (!edits || !edits.active) return false;
    if (Array.isArray(edits.roads)) IM.roads = edits.roads.map(cloneRoad);
    if (Array.isArray(edits.buildings)) IM.buildings = edits.buildings.map(cloneAsset);
    if (Array.isArray(edits.landmarks)) IM.landmarks = edits.landmarks.map(cloneAsset);
    if (Array.isArray(edits.challenges)) {
      IM.challenges = edits.challenges.map(function (ch) {
        return Object.assign({}, ch, {
          gates: (ch.gates || []).map(clonePoint)
        });
      });
      CC.challengeDefs = IM.challenges;
    }
    CC.roadDefs = IM.roads;
    // Trailer shots are consumed by tools/trailer.js, not the gameplay loop,
    // but expose them here so the patch is queryable from the game console.
    CC.trailerShots = Array.isArray(edits.trailerShots) ? edits.trailerShots : [];
    CC.missions = Array.isArray(edits.missions) ? edits.missions : [];
    return true;
  };

  // Elevation imported by the editor is added on top of the painted terrain.
  // Called at the end of ImageMap.apply(), once CC.heightAt is final.
  CC.applyMapElevation = function () {
    if (CC._mapElevationApplied) return;
    const e = CC.mapEdits && CC.mapEdits.elevation;
    if (!e) return;
    const hills = Array.isArray(e.hills) ? e.hills : [];
    const points = Array.isArray(e.points) ? e.points : [];
    const grid = e.grid || null;
    if (!hills.length && !points.length && !grid) return;

    function bump(x, z, hx, hz, height, radius) {
      const r = Math.max(1, Number(radius) || 25);
      const d = Math.hypot(x - hx, z - hz);
      if (d >= r) return 0;
      const t = 1 - d / r;
      return (Number(height) || 0) * t * t;
    }

    function extra(x, z) {
      let add = 0;
      hills.forEach(function (h) { add += bump(x, z, h.x, h.z, h.h, h.r); });
      points.forEach(function (h) { add += bump(x, z, h.x, h.z, h.h, h.r || 25); });
      if (grid && Array.isArray(grid.values) && grid.width > 0 && grid.height > 0 &&
          x >= grid.minX && z >= grid.minZ &&
          x <= grid.minX + (grid.width - 1) * (Number(grid.cell) || 1) &&
          z <= grid.minZ + (grid.height - 1) * (Number(grid.cell) || 1)) {
        const cell = Number(grid.cell) || 1;
        const gx = Math.min(grid.width - 1, Math.max(0, (x - grid.minX) / cell));
        const gz = Math.min(grid.height - 1, Math.max(0, (z - grid.minZ) / cell));
        const x0 = Math.floor(gx), z0 = Math.floor(gz);
        const x1 = Math.min(grid.width - 1, x0 + 1), z1 = Math.min(grid.height - 1, z0 + 1);
        const tx = gx - x0, tz = gz - z0;
        const v = function (ix, iz) { return Number(grid.values[iz * grid.width + ix]) || 0; };
        add += (1 - tx) * (1 - tz) * v(x0, z0) + tx * (1 - tz) * v(x1, z0) +
          (1 - tx) * tz * v(x0, z1) + tx * tz * v(x1, z1);
      }
      return add;
    }

    const baseHeight = CC.heightAt;
    CC.heightAt = function (x, z) { return baseHeight(x, z) + extra(x, z); };
    if (CC.groundHeightAt) {
      const baseGround = CC.groundHeightAt;
      CC.groundHeightAt = function (x, z) { return baseGround(x, z) + extra(x, z); };
    }
    CC._mapElevationApplied = true;
  };

  /* ---------- INAV-style mission planner ----------
     Missions are data only until CC.MissionPlanner.start(index) is called. The
     planner never patches Game.readInput(); game.js calls applyInput() right
     after that function returns and we mutate the analog axes in place. This
     keeps trailer/scripted camera overrides on the original hook. */
  const MISSION_ACTIONS = ['WAYPOINT', 'POSHOLD_TIME', 'JUMP', 'SET_POI', 'LAND'];
  const CM_PER_UNIT = 100;

  function missionNum(value, fallback) {
    const n = Number(value);
    return isFinite(n) ? n : fallback;
  }

  function missionClamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function missionGroundY(x, z) {
    return CC.heightAt ? CC.heightAt(x, z) : 0;
  }

  function wrapAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  function finalizeMissionInput(input) {
    input.throttle = 0;
    input.steer = 0;
    input.handbrake = false;
    input.boost = false;
    input.dive = false;
    input.climb = false;
    input.descend = false;
    input.pitch = missionClamp(missionNum(input.pitch, 0), -1, 1);
    input.roll = missionClamp(missionNum(input.roll, 0), -1, 1);
    input.yaw = missionClamp(missionNum(input.yaw, 0), -1, 1);
    input.lift = missionClamp(missionNum(input.lift, 0), -1, 1);
    // Legacy aliases are read by older drones; keep them in sync.
    input.fpvPitch = input.pitch;
    input.fpvRoll = input.roll;
    input.fpvYaw = input.yaw;
  }

  // Fly toward a ground-plane target. Higher speedCmS gives more forward
  // authority (via a larger commanded airspeed), capped by the drone's spec.
  function commandNavigate(input, v, spec, x, z, targetY, speedCmS, radius, enforceAltitude) {
    const dx = x - v.pos.x, dz = z - v.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist <= radius) return true;
    const headingError = wrapAngle(Math.atan2(dx, dz) - missionNum(v.heading, 0));
    input.yaw = missionClamp(headingError / 0.55, -1, 1);
    const maxSpeed = Math.max(2, missionNum(spec.maxSpeed, 28));
    let desiredSpeed = Math.max(0, missionNum(speedCmS, 1500) / CM_PER_UNIT);
    desiredSpeed = Math.min(desiredSpeed, maxSpeed * 0.9);
    desiredSpeed *= Math.min(1, dist / (radius * 3 + 1));
    const speedError = (desiredSpeed - missionNum(v.speed, 0)) / Math.max(2, maxSpeed * 0.45);
    input.pitch = missionClamp(speedError, -0.2, 1) * Math.max(0.12, Math.cos(headingError));
    input.roll = 0;
    const dy = targetY - v.pos.y;
    // INAV's enforce-altitude keeps the vehicle from sinking toward a lower
    // waypoint while still en route; LAND/RTH call commandHover instead.
    input.lift = (enforceAltitude && dy < 0) ? 0 : missionClamp(dy / 2.5, -0.85, 0.85);
    return false;
  }

  // Damp out drift and hold altitude. Also used by LAND with a downward bias.
  function commandHover(input, v, spec, targetY, landing) {
    const h = missionNum(v.heading, 0);
    const fx = Math.sin(h), fz = Math.cos(h);
    const rx = Math.cos(h), rz = -Math.sin(h);
    const vx = v.velocity ? missionNum(v.velocity.x, 0) : 0;
    const vz = v.velocity ? missionNum(v.velocity.z, 0) : 0;
    const scale = Math.max(2, missionNum(spec.maxSpeed, 28) * 0.4);
    input.pitch = missionClamp(-(vx * fx + vz * fz) / scale, -1, 1);
    input.roll = missionClamp(-(vx * rx + vz * rz) / scale, -1, 1);
    input.yaw = 0;
    const dy = targetY - v.pos.y;
    input.lift = missionClamp(dy / 2.5, -0.85, 0.85);
    if (landing && dy < 0) input.lift = Math.min(input.lift, -0.28);
  }

  const MissionPlanner = (CC.MissionPlanner = {
    active: false,
    missionIndex: -1,
    mission: null,
    waypoint: 0,
    phase: 'idle',
    holdRemaining: 0,
    jumps: 0,
    home: null,
    homeGround: 0,
    poi: null,
    warning: null,
    statusText: 'idle',
    lastInput: null,

    start(index) {
      const list = CC.missions || [];
      if (!list.length) {
        this.statusText = 'no missions in CC.mapEdits.missions';
        return false;
      }
      const i = missionClamp(Math.floor(missionNum(index, 0)), 0, list.length - 1);
      const m = list[i] || {};
      const radiusCm = missionNum(m.nav_wp_radius != null ? m.nav_wp_radius : m.safeRadius, 200);
      const safeCm = missionNum(m.nav_wp_safe_distance != null ? m.nav_wp_safe_distance : m.safeDistance, 500);
      this.active = true;
      this.missionIndex = i;
      this.mission = m;
      this.waypoint = 0;
      this.phase = 'nav';
      this.holdRemaining = 0;
      this.jumps = 0;
      this.home = null;
      this.homeGround = 0;
      this.poi = null;
      this.warning = null;
      this.statusText = 'running';
      this.radius = Math.max(0.5, radiusCm / CM_PER_UNIT);
      this.safeDistance = Math.max(0, safeCm / CM_PER_UNIT);
      this.enforceAltitude = m.nav_wp_enforce_altitude != null
        ? !!m.nav_wp_enforce_altitude : !!m.enforceAltitude;
      this.finalAction = m.finalAction === 'LAND' ? 'LAND' : 'RTH';
      const G = CC.Game;
      if (G && G.started && G.activeKey !== 'fpv' && G.selectVehicle) G.selectVehicle('fpv');
      return true;
    },

    stop() {
      this.active = false;
      this.statusText = 'stopped';
      this.phase = 'idle';
      this.holdRemaining = 0;
      this.lastInput = null;
    },

    // Called from game.js tick() directly after Game.readInput(). Returning
    // without touching input when inactive keeps normal play byte-for-byte.
    applyInput(input, v, dt) {
      if (!this.active || !input || !v || !v.isAircraft || !v.pos) return;
      const step = missionClamp(missionNum(dt, 0), 0, 0.05);
      const spec = v.spec || {};
      if (!this.home) {
        const h = this.mission && this.mission.home;
        const source = h && isFinite(Number(h.x)) && isFinite(Number(h.z))
          ? h : (v.home || v.pos);
        const hx = missionNum(source.x, 0), hz = missionNum(source.z, 0);
        const ground = missionGroundY(hx, hz);
        // RTH approaches at a safe home-relative altitude. Preserve an
        // explicitly exported altCm, otherwise keep at least 2 m AGL.
        const currentCm = Math.round((missionNum(v.pos.y, ground) - ground) * CM_PER_UNIT);
        this.home = {
          x: hx, z: hz,
          altCm: Math.max(200, h && h.altCm != null
            ? missionNum(h.altCm, 200) : currentCm)
        };
        this.homeGround = h && isFinite(Number(h.y))
          ? Number(h.y) : ground;
      }
      const actions = (this.mission && (this.mission.actions || this.mission.waypoints)) || [];
      let guard = 0;
      while (this.active && guard++ < 64) {
        const phase = this.phase;
        if (phase === 'rth') {
          const alt = missionNum(this.home.altCm, 200);
          const targetY = this.homeGround + alt / CM_PER_UNIT;
          const done = commandNavigate(input, v, spec, this.home.x, this.home.z,
            targetY, 1200, this.radius, false);
          this.statusText = 'returning to home';
          if (done) this.phase = 'land';
          break;
        }
        if (phase === 'land' || phase === 'done') {
          const landY = missionGroundY(v.pos.x, v.pos.z) +
            Math.max(0.4, missionNum(spec.minAltitude, 0.8)) - 0.2;
          commandHover(input, v, spec, landY, true);
          const agl = v.pos.y - missionGroundY(v.pos.x, v.pos.z);
          if (agl <= Math.max(1, missionNum(spec.minAltitude, 0.8)) + 0.3) {
            this.stop();
            this.statusText = 'landed';
            break;
          }
          this.statusText = 'landing';
          break;
        }
        if (phase === 'hold') {
          const wp = actions[this.waypoint] || {};
          const targetY = this.homeGround + missionNum(wp.altCm, 0) / CM_PER_UNIT;
          commandHover(input, v, spec, targetY, false);
          this.holdRemaining = Math.max(0, this.holdRemaining - step);
          this.statusText = 'position hold ' + this.holdRemaining.toFixed(1) + 's';
          if (this.holdRemaining > 0) break;
          this.advance(actions);
          continue;
        }
        if (this.waypoint >= actions.length) {
          this.phase = this.finalAction === 'LAND' ? 'land' : 'rth';
          continue;
        }
        const wp = actions[this.waypoint] || {};
        const action = MISSION_ACTIONS.indexOf(wp.action) >= 0 ? wp.action : 'WAYPOINT';
        if (action === 'JUMP') {
          // jumpTarget is 1-based in the editor and in exported missions.
          const target = Math.floor(missionNum(wp.jumpTarget, 1)) - 1;
          if (target < 0 || target >= actions.length || ++this.jumps > 128) {
            this.warning = 'Invalid JUMP target at waypoint ' + (this.waypoint + 1);
            this.advance(actions);
          } else {
            this.waypoint = target;
          }
          continue;
        }
        if (action === 'SET_POI') {
          const p = wp.poi || {};
          this.poi = {
            x: missionNum(p.x, missionNum(wp.x, v.pos.x)),
            z: missionNum(p.z, missionNum(wp.z, v.pos.z)),
            y: missionNum(p.y, missionGroundY(v.pos.x, v.pos.z) + 5)
          };
          this.advance(actions);
          continue;
        }
        const x = missionNum(wp.x, this.home.x), z = missionNum(wp.z, this.home.z);
        const targetY = this.homeGround + missionNum(wp.altCm, 0) / CM_PER_UNIT;
        const dist = Math.hypot(x - v.pos.x, z - v.pos.z);
        if (action !== 'LAND' && this.safeDistance > 0 && dist < this.safeDistance &&
            this.warning !== 'Waypoint ' + (this.waypoint + 1) + ' is inside nav_wp_safe_distance') {
          this.warning = 'Waypoint ' + (this.waypoint + 1) + ' is inside nav_wp_safe_distance';
        }
        const speedCmS = action === 'LAND'
          ? Math.min(missionNum(wp.speedCmS, 800), 800) : wp.speedCmS;
        const arrived = commandNavigate(input, v, spec, x, z, targetY,
          speedCmS, this.radius, this.enforceAltitude && action !== 'LAND');
        this.statusText = (action === 'LAND' ? 'landing at waypoint ' : 'navigating to waypoint ') +
          (this.waypoint + 1);
        if (!arrived) break;
        if (action === 'POSHOLD_TIME') {
          this.phase = 'hold';
          this.holdRemaining = Math.max(0, missionNum(wp.holdSec, 0));
        } else if (action === 'LAND') {
          this.phase = 'land';
        } else {
          this.advance(actions);
        }
        continue;
      }
      if (this.active) {
        finalizeMissionInput(input);
        this.lastInput = {
          throttle: input.throttle, steer: input.steer, yaw: input.yaw,
          lift: input.lift, pitch: input.pitch, roll: input.roll
        };
      }
    },

    advance(actions) {
      this.waypoint++;
      this.phase = 'nav';
      this.holdRemaining = 0;
      if (this.waypoint >= (actions || []).length) {
        this.waypoint = (actions || []).length;
        this.phase = this.finalAction === 'LAND' ? 'land' : 'rth';
      }
    },

    status() {
      const actions = (this.mission && (this.mission.actions || this.mission.waypoints)) || [];
      const wp = actions[this.waypoint] || null;
      return {
        active: this.active,
        mission: this.missionIndex,
        waypoint: this.waypoint,
        action: wp ? wp.action : this.phase,
        phase: this.phase,
        holdRemaining: this.holdRemaining,
        home: this.home,
        poi: this.poi,
        warning: this.warning,
        status: this.statusText
      };
    }
  });

  function groundY(x, z) {
    return CC.heightAt ? CC.heightAt(x, z) : 0;
  }

  function material(color, opts) {
    return new THREE.MeshLambertMaterial(Object.assign({ color: color, flatShading: true }, opts || {}));
  }

  function addBox(group, w, h, d, color, x, y, z, rot) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material(color));
    mesh.position.set(x, y, z);
    mesh.rotation.y = rot || 0;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  function buildBuilding(group, a) {
    const w = Math.max(2, Number(a.w) || 10);
    const l = Math.max(2, Number(a.l) || 8);
    const h = Math.max(1, Number(a.h) || 4);
    const y = groundY(a.x, a.z) + h * 0.5;
    addBox(group, w, h, l, a.color || 0xd9c7a8, a.x, y, a.z, a.rot || 0);
    addBox(group, w + 0.8, 0.45, l + 0.8, a.roofColor || 0x8d5b48,
      a.x, y + h * 0.5 + 0.18, a.z, a.rot || 0);
    if (CC.World && CC.World.obstacles) {
      CC.World.obstacles.push({ x: a.x, z: a.z, r: Math.max(w, l) * 0.45, type: 'map edit building' });
    }
  }

  function buildBridge(group, a) {
    const w = Math.max(4, Number(a.w) || 24);
    const l = Math.max(4, Number(a.l) || 10);
    const rot = a.rot || 0;
    const y = Number(a.y) || Math.max(3.5, CC.BRIDGE ? CC.BRIDGE.deckHeight : 8);
    addBox(group, w, 0.75, l, a.color || 0x5b5f66, a.x, y, a.z, rot);
    // Rails on both long edges, aligned to the bridge's local X axis.
    for (const side of [-1, 1]) {
      const ox = Math.sin(rot) * side * l * 0.5;
      const oz = Math.cos(rot) * side * l * 0.5;
      addBox(group, w, 0.32, 0.32, a.railColor || 0xb9c1c6,
        a.x + ox, y + 1.25, a.z + oz, rot);
    }
  }

  function buildTree(group, a) {
    const s = Math.max(0.5, Number(a.scale) || 1);
    const base = groundY(a.x, a.z);
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24 * s, 0.34 * s, 2.4 * s, 6),
      material(a.trunkColor || 0x8a6342));
    trunk.position.set(a.x, base + 1.2 * s, a.z);
    group.add(trunk);
    const leaves = new THREE.Mesh(
      new THREE.ConeGeometry(2.1 * s, 6 * s, 7),
      material(a.color || 0x4d8a4a));
    leaves.position.set(a.x, base + 4.6 * s, a.z);
    leaves.castShadow = true;
    group.add(leaves);
    if (CC.World && CC.World.obstacles) {
      CC.World.obstacles.push({ x: a.x, z: a.z, r: 0.8 * s, type: 'map edit tree' });
    }
  }

  const mapEditRigs = [];

  // Animated character models are baked GLBs, not static baked geometry. Build
  // them through the same loader as the on-foot characters and tick their
  // mixers from the main loop so map-placed people/creatures stay alive.
  CC.updateMapEditAnimations = function (dt) {
    for (let i = 0; i < mapEditRigs.length; i++) mapEditRigs[i].update(dt);
  };

  function buildAnimatedModel(group, a, record) {
    const DL = CC.DownloadedCharacterLoader;
    if (!DL || !DL.build) return;
    const key = record.characterKey || a.characterKey || a.model || a.key;
    const scale = Math.max(0.05, Number(a.scale) || 1);
    DL.build(key, { clip: a.clip || 'Idle', scale: scale }).then(function (rig) {
      if (!rig) return;
      const x = Number(a.x) || 0, z = Number(a.z) || 0;
      rig.group.position.set(x, groundY(x, z) + (Number(a.y) || 0), z);
      rig.group.rotation.y = Number(a.rot) || 0;
      group.add(rig.group);
      mapEditRigs.push(rig);
    }).catch(function (e) {
      if (DL) DL.lastError = String((e && (e.stack || e)) || e);
    });
  }

  function buildModel(group, a) {
    const loader = CC.AssetLoader;
    const key = a.model || a.modelKey || a.key;
    if (!loader || !loader.available || !loader.models || !loader.models[key]) return;
    const record = loader.models[key];
    if (record && record.kind === 'character') {
      buildAnimatedModel(group, a, record);
      return;
    }
    const scale = Math.max(0.05, Number(a.scale) || 1);
    let color = a.color;
    if (typeof color === 'string' && color.charAt(0) === '#') color = parseInt(color.slice(1), 16);
    const obj = loader.buildModel(key, {
      scale: scale,
      color: color == null ? undefined : color
    });
    if (!obj) return;
    obj.position.set(Number(a.x) || 0,
      groundY(Number(a.x) || 0, Number(a.z) || 0) + (Number(a.y) || 0),
      Number(a.z) || 0);
    obj.rotation.y = Number(a.rot) || 0;
    group.add(obj);

    const fp = loader.footprint(key);
    const baseScale = Number(loader.models[key].scale) || 1;
    if (fp && CC.World && CC.World.obstacles) {
      const size = Math.max(fp.w, fp.l) * baseScale * scale;
      if (size >= 1.4) {
        CC.World.obstacles.push({
          x: Number(a.x) || 0, z: Number(a.z) || 0,
          r: size * 0.45, type: 'map edit model'
        });
      }
    }
  }

  // Called from World.init() once the scene and world arrays exist.
  CC.buildMapEdits = function (scene) {
    const assets = CC.mapEdits && CC.mapEdits.assets;
    mapEditRigs.length = 0;
    if (!scene || !Array.isArray(assets) || assets.length === 0) return null;
    const group = new THREE.Group();
    group.name = 'Map editor assets';
    assets.forEach(function (a) {
      if (!a || a.hidden) return;
      if (a.type === 'building') buildBuilding(group, a);
      else if (a.type === 'bridge') buildBridge(group, a);
      else if (a.type === 'tree') buildTree(group, a);
      else if (a.type === 'model' || a.type === 'glb' || a.type === 'gltf') buildModel(group, a);
    });
    scene.add(group);
    CC.World.mapEditGroup = group;
    return group;
  };
})();
