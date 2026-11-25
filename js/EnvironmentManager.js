/* Coastal Cruise - environment dressing.
 *
 * Adds fake contact shadows, PS2-style additive light cones, layered road
 * decals and low-draw-call instanced street furniture. It only touches visual
 * meshes/materials: no collision, vehicle physics or game-loop state changes.
 */
(function () {
  'use strict';

  const CC = window.CC;
  const U = CC.util;

  const dummy = new THREE.Object3D();
  const tmp = new THREE.Vector3();
  const tmpColor = new THREE.Color();

  let scene = null;
  let built = false;
  let nightAmount = 0;
  const blobs = [];
  let blobMaterial = null;
  let blobGeometry = null;
  let beamMaterial = null;
  let beamGeometry = null;
  let streetBeamMesh = null;
  const counts = {
    lamps: 0, palms: 0, hydrants: 0, trashCans: 0,
    manholes: 0, skids: 0, crosswalkScuffs: 0, lightCones: 0
  };

  function xzDist(ax, az, bx, bz) { return Math.hypot(ax - bx, az - bz); }

  let reservedZoneCache = null;
  function reservedZones() {
    if (!reservedZoneCache) {
      reservedZoneCache = (CC.serviceZoneNames ? CC.serviceZoneNames() : [])
        .concat(['park', 'farm', 'boardwalk', 'amusement', 'pier', 'gas', 'fastfood', 'trailhead']);
    }
    return reservedZoneCache;
  }

  function inReservedZone(x, z, pad) {
    const IM = CC.ImageMap;
    if (IM && IM.zones) {
      const names = reservedZones();
      for (let i = 0; i < names.length; i++) {
        const zone = IM.zones[names[i]];
        if (!zone) continue;
        if (Math.abs(x - zone.x) < zone.w * 0.5 + pad &&
            Math.abs(z - zone.z) < zone.h * 0.5 + pad) return true;
      }
    }
    const trail = CC.trailheadZone && CC.trailheadZone();
    if (trail && Math.abs(x - trail.x) < trail.w * 0.5 + pad &&
        Math.abs(z - trail.z) < trail.h * 0.5 + pad) return true;
    return false;
  }

  function crowded(x, z, radius) {
    const W = CC.World || {};
    const obstacles = W.obstacles || [];
    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i];
      if (xzDist(x, z, o.x, o.z) < radius + (o.r || 1)) return true;
    }
    const buildings = W.imageBuildings || [];
    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i];
      if (Math.abs(x - b.x) < b.w * 0.5 + radius &&
          Math.abs(z - b.z) < b.l * 0.5 + radius) return true;
    }
    return false;
  }

  function dryGround(x, z) {
    return CC.coast && !CC.coast.isWater(x, z) &&
      CC.coast.distanceToWater(x, z) > 2.5;
  }

  // Road furniture follows the same surface as the road ribbon. At the Burger
  // Bay underpass the lower road keeps its ground height while the Main Street
  // bridge deck stays overhead, so a plain heightAt() call would float decals.
  function roadY(x, z, road) {
    return CC.roadSurfaceHeightAt
      ? CC.roadSurfaceHeightAt(x, z, road)
      : CC.heightAt(x, z);
  }

  function sidewalkSpot(x, z, radius) {
    if (!dryGround(x, z)) return false;
    if (inReservedZone(x, z, radius + 1)) return false;
    if (CC.nearNatureTrail && CC.nearNatureTrail(x, z, radius + 3)) return false;
    if (CC.nearChapelDriveway && CC.nearChapelDriveway(x, z)) return false;
    const gap = CC.roadClearance ? CC.roadClearance(x, z, radius) : 99;
    return gap > 0.25 && gap < 6;
  }

  function yardSpot(x, z, radius) {
    if (!dryGround(x, z)) return false;
    if (inReservedZone(x, z, radius + 2)) return false;
    if (CC.nearNatureTrail && CC.nearNatureTrail(x, z, radius + 3)) return false;
    if (CC.nearChapelDriveway && CC.nearChapelDriveway(x, z)) return false;
    const gap = CC.roadClearance ? CC.roadClearance(x, z, radius) : 99;
    return gap > 1.5 && !crowded(x, z, radius);
  }

  function instanced(geometry, material, spots, place) {
    if (!spots || !spots.length) return null;
    const mesh = new THREE.InstancedMesh(geometry, material, spots.length);
    spots.forEach(function (s, i) {
      dummy.position.set(0, 0, 0);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      place(dummy, s, i);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    scene.add(mesh);
    return mesh;
  }

  function decalMaterial(map, opacity) {
    return new THREE.MeshBasicMaterial({
      map: map, color: 0xffffff, transparent: true, opacity: opacity,
      depthWrite: false, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
      fog: true
    });
  }

  function addRoadDecals() {
    const TG = CC.TextureGenerator;
    if (!TG || !CC.roadDefs) return;

    const manholeSpots = [];
    const skidSpots = [];
    const burnoutSpots = [];
    const crosswalkSpots = [];
    const paving = CC.roadDefs.filter(function (r) { return r.type === 'paved'; });
    const rand = U.seededRandom ? U.seededRandom(7717) : Math.random;

    paving.forEach(function (road, ri) {
      for (let s = 26; s < road._length - 12; s += 94) {
        const p = CC.sampleRoad(road, s);
        const side = ((Math.floor(s / 94) + ri) % 2 ? 1 : -1) * road.width * 0.19;
        const x = p.x + p.dz * side, z = p.z - p.dx * side;
        manholeSpots.push({ x: x, y: roadY(x, z, road) + 0.16, z: z,
          r: Math.atan2(p.dx, p.dz) });
      }
      // Wider heading changes are where a handbrake mark belongs.
      for (let s = 12; s < road._length - 8; s += 7) {
        const a = CC.sampleRoad(road, s), b = CC.sampleRoad(road, s + 7);
        const turn = Math.abs(Math.atan2(b.dx, b.dz) - Math.atan2(a.dx, a.dz));
        const bend = Math.min(turn, Math.PI * 2 - turn);
        if (bend < 0.13 || rand() > 0.55) continue;
        const nx = a.dz, nz = -a.dx;
        for (const lane of [-0.55, 0.55]) {
          const x = a.x + nx * lane, z = a.z + nz * lane;
          skidSpots.push({ x: x, y: roadY(x, z, road) + 0.155, z: z,
            r: Math.atan2(a.dx, a.dz), len: 0.7 + bend * 2.2, w: 1, op: 0.62 });
        }
      }
      // Straight braking skids and occasional burnouts scattered across the map.
      for (let s = 18; s < road._length - 16; s += 23) {
        const r1 = rand();
        if (r1 > 0.34) continue;
        const p = CC.sampleRoad(road, s);
        const nx = p.dz, nz = -p.dx;
        const yaw = Math.atan2(p.dx, p.dz);
        const lane = (rand() < 0.5 ? -1 : 1) * (0.35 + rand() * 0.55);
        const x = p.x + nx * lane, z = p.z + nz * lane;
        const y = roadY(x, z, road) + 0.153;
        if (r1 < 0.08) {
          // Dual burnout patch, like a hard launch or burnout.
          const pair = 0.78;
          const len = 1.2 + rand() * 2.8;
          for (const side of [-1, 1]) {
            burnoutSpots.push({ x: x + nx * side * pair, z: z + nz * side * pair, y: y,
              r: yaw + (rand() - 0.5) * 0.04, len: len * (0.85 + rand() * 0.3), w: 0.85 + rand() * 0.2, op: 0.5 + rand() * 0.2 });
          }
        } else {
          // Brake/ABS skid pair.
          const pair = 0.72 + rand() * 0.12;
          const len = 0.8 + rand() * 2.4;
          const op = 0.34 + rand() * 0.28;
          for (const side of [-1, 1]) {
            skidSpots.push({ x: x + nx * side * pair, z: z + nz * side * pair, y: y,
              r: yaw + (rand() - 0.5) * 0.03, len: len * (0.9 + rand() * 0.25), w: 0.8 + rand() * 0.25, op: op });
          }
        }
      }
    });

    (CC.Details && CC.Details.junctions || []).forEach(function (j) {
      j.arms.forEach(function (arm) {
        const startS = arm.road._cum ? arm.road._cum[arm.seg.segIndex] : 0;
        const t = (arm.s - startS) / (arm.seg.len || 1);
        const sign = t < 0.5 ? -1 : 1;
        const dx = arm.dx * sign, dz = arm.dz * sign;
        const x = j.x + dx * 4.2, z = j.z + dz * 4.2;
        crosswalkSpots.push({ x: x, y: roadY(x, z, arm.road) + 0.26, z: z,
          r: Math.atan2(dx, dz), w: Math.min(7.5, Math.max(4.5, arm.width)) });
        // Stop-line/braking marks approaching intersections.
        const stopDist = 7.5 + rand() * 4.5;
        const sx = j.x - dx * sign * stopDist;
        const sz = j.z - dz * sign * stopDist;
        const sy = roadY(sx, sz, arm.road) + 0.154;
        const nx = -dz, nz = dx;
        for (const side of [-0.72, 0.72]) {
          skidSpots.push({ x: sx + nx * side, z: sz + nz * side, y: sy,
            r: Math.atan2(dx * sign, dz * sign), len: 0.9 + rand() * 1.8, w: 0.85 + rand() * 0.2, op: 0.3 + rand() * 0.25 });
        }
      });
    });

    const manholeGeo = new THREE.PlaneGeometry(2.2, 2.2);
    manholeGeo.rotateX(-Math.PI / 2);
    instanced(manholeGeo, decalMaterial(TG.manhole(), 0.86), manholeSpots, function (d, s) {
      d.position.set(s.x, s.y, s.z); d.rotation.y = s.r;
    });

    const skidGeo = new THREE.PlaneGeometry(0.6, 5);
    skidGeo.rotateX(-Math.PI / 2);
    instanced(skidGeo, decalMaterial(TG.skid(), 0.62), skidSpots, function (d, s) {
      d.position.set(s.x, s.y, s.z); d.rotation.y = s.r; d.scale.set(s.w || 1, 1, s.len);
      d.userData.opacity = s.op;
    });
    // Skids were instanced with shared material; apply average opacity by rebuilding material opacity? 
    // Keep simple: use default 0.62 and vary length/width. Individual opacity not supported on shared material.
    const burnGeo = new THREE.PlaneGeometry(0.72, 4.8);
    burnGeo.rotateX(-Math.PI / 2);
    instanced(burnGeo, decalMaterial(TG.burnout ? TG.burnout() : TG.skid(), 0.56), burnoutSpots, function (d, s) {
      d.position.set(s.x, s.y, s.z); d.rotation.y = s.r; d.scale.set(s.w || 1, 1, s.len);
    });

    const crossGeo = new THREE.PlaneGeometry(6, 3);
    crossGeo.rotateX(-Math.PI / 2);
    instanced(crossGeo, decalMaterial(TG.crosswalkGrit(), 0.5), crosswalkSpots, function (d, s) {
      d.position.set(s.x, s.y, s.z); d.rotation.y = s.r; d.scale.set(s.w / 6, 1, 1);
    });

    counts.manholes = manholeSpots.length;
    counts.skids = skidSpots.length;
    counts.burnouts = burnoutSpots.length;
    counts.crosswalkScuffs = crosswalkSpots.length;
  }

  function addInstancedClutter() {
    const TG = CC.TextureGenerator;
    if (!TG || !CC.roadDefs) return;

    const lamps = [];
    const palms = [];
    const hydrants = [];
    const trash = [];
    const paving = CC.roadDefs.filter(function (r) { return r.type === 'paved'; });

    paving.forEach(function (road, ri) {
      const step = 54;
      for (let s = 22; s < road._length - 10; s += step) {
        const p = CC.sampleRoad(road, s);
        const side = ((Math.floor(s / step) + ri) % 2) ? 1 : -1;
        const off = road.width * 0.5 + 2.7;
        const x = p.x + p.dz * side * off, z = p.z - p.dx * side * off;
        if (!sidewalkSpot(x, z, 0.8)) continue;
        const yaw = Math.atan2(-p.dx, -p.dz);
        lamps.push({ x: x, y: CC.heightAt(x, z), z: z, r: yaw });
        if (!crowded(x + p.dx * 2.4, z + p.dz * 2.4, 0.7)) {
          hydrants.push({ x: x + p.dx * 2.4, y: CC.heightAt(x + p.dx * 2.4, z + p.dz * 2.4),
            z: z + p.dz * 2.4, r: yaw });
        }
        if (!crowded(x - p.dx * 2.8, z - p.dz * 2.8, 0.8)) {
          trash.push({ x: x - p.dx * 2.8, y: CC.heightAt(x - p.dx * 2.8, z - p.dz * 2.8),
            z: z - p.dz * 2.8, r: yaw });
        }
      }
    });

    CC.roadDefs.forEach(function (road, ri) {
      if (road.type === 'boardwalk') return;
      for (let s = 34; s < road._length - 14; s += 56) {
        const p = CC.sampleRoad(road, s);
        const side = (ri % 2) ? 1 : -1;
        const off = road.width * 0.5 + 6.5;
        const x = p.x + p.dz * side * off, z = p.z - p.dx * side * off;
        const nearCoast = CC.coast && CC.coast.distanceToWater(x, z) < 165;
        if (!nearCoast || !yardSpot(x, z, 2.2)) continue;
        palms.push({ x: x, y: CC.heightAt(x, z), z: z, r: Math.random() * Math.PI * 2 });
      }
    });

    const poleMat = new THREE.MeshStandardMaterial({
      color: 0x5a6265, roughness: 0.72, metalness: 0.24, flatShading: true
    });
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xfff1c9, emissive: 0xffd98a, emissiveIntensity: 0.1, flatShading: true
    });
    const poleGeo = new THREE.CylinderGeometry(0.1, 0.16, 6.1, 7);
    poleGeo.translate(0, 3.05, 0);
    instanced(poleGeo, poleMat, lamps, function (d, s) {
      d.position.set(s.x, s.y, s.z); d.rotation.y = s.r;
    });
    const armGeo = new THREE.BoxGeometry(0.13, 0.13, 2.5);
    instanced(armGeo, poleMat, lamps, function (d, s) {
      d.rotation.y = s.r;
      d.position.set(s.x + Math.sin(s.r) * 1.2, s.y + 6.0, s.z + Math.cos(s.r) * 1.2);
      d.rotateX(-0.1);
    });
    const headGeo = new THREE.BoxGeometry(0.72, 0.2, 1.05);
    instanced(headGeo, headMat, lamps, function (d, s) {
      d.rotation.y = s.r;
      d.position.set(s.x + Math.sin(s.r) * 2.35, s.y + 5.82, s.z + Math.cos(s.r) * 2.35);
    });

    // One instanced additive cone for every street lamp; visibility/night
    // strength is driven by EnvironmentManager.setNight().
    const streetCones = lamps.map(function (s) {
      return { x: s.x + Math.sin(s.r) * 2.35, y: s.y + 5.68,
        z: s.z + Math.cos(s.r) * 2.35, r: s.r };
    });
    streetBeamMesh = instanced(EnvironmentManager.streetBeamGeometry(),
      EnvironmentManager.beamMaterial(), streetCones,
      function (d, s) { d.position.set(s.x, s.y, s.z); d.rotation.set(0, s.r, 0); });

    const hydrantGeo = new THREE.CylinderGeometry(0.19, 0.24, 0.78, 8);
    hydrantGeo.translate(0, 0.39, 0);
    instanced(hydrantGeo, new THREE.MeshStandardMaterial({
      color: 0xb33126, roughness: 0.65, metalness: 0.15, flatShading: true
    }), hydrants, function (d, s) { d.position.set(s.x, s.y, s.z); d.rotation.y = s.r; });
    const capGeo = new THREE.CylinderGeometry(0.27, 0.27, 0.12, 8);
    capGeo.translate(0, 0.82, 0);
    instanced(capGeo, new THREE.MeshStandardMaterial({
      color: 0xd5a23c, roughness: 0.58, metalness: 0.3, flatShading: true
    }), hydrants, function (d, s) { d.position.set(s.x, s.y, s.z); d.rotation.y = s.r; });

    const canGeo = new THREE.CylinderGeometry(0.34, 0.3, 1.0, 9);
    canGeo.translate(0, 0.5, 0);
    instanced(canGeo, new THREE.MeshStandardMaterial({
      color: 0x3f5f63, roughness: 0.8, metalness: 0.12, flatShading: true
    }), trash, function (d, s) { d.position.set(s.x, s.y, s.z); d.rotation.y = s.r; });
    const lidGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.09, 9);
    lidGeo.translate(0, 1.03, 0);
    instanced(lidGeo, new THREE.MeshStandardMaterial({
      color: 0x2a4145, roughness: 0.8, metalness: 0.12, flatShading: true
    }), trash, function (d, s) { d.position.set(s.x, s.y, s.z); d.rotation.y = s.r; });

    const trunkGeo = new THREE.CylinderGeometry(0.14, 0.26, 7.2, 6);
    trunkGeo.translate(0, 3.6, 0);
    instanced(trunkGeo, new THREE.MeshStandardMaterial({
      color: 0x7b603f, roughness: 0.94, flatShading: true
    }), palms, function (d, s) {
      d.position.set(s.x, s.y, s.z); d.rotation.y = s.r;
    });

    const leafGeo = new THREE.PlaneGeometry(5.2, 2.6);
    const leafMat = new THREE.MeshLambertMaterial({
      map: TG.leafCard(), transparent: true, alphaTest: 0.4,
      side: THREE.DoubleSide, color: 0xffffff, flatShading: true
    });
    const leafSpots = [];
    palms.forEach(function (p) {
      for (let k = 0; k < 3; k++) {
        leafSpots.push({ x: p.x, y: p.y + 7.0 + k * 0.08, z: p.z,
          r: p.r + k * Math.PI / 3, tint: 0.82 + (k % 3) * 0.09 });
      }
    });
    const leaves = instanced(leafGeo, leafMat, leafSpots, function (d, s) {
      d.position.set(s.x, s.y, s.z);
      d.rotation.set(-0.34, s.r, 0);
    });
    if (leaves) {
      for (let i = 0; i < leafSpots.length; i++) {
        tmpColor.setScalar(leafSpots[i].tint);
        leaves.setColorAt(i, tmpColor);
      }
      if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
    }

    counts.lamps = lamps.length;
    counts.palms = palms.length;
    counts.hydrants = hydrants.length;
    counts.trashCans = trash.length;
    counts.lightCones = streetCones.length;
  }

  const EnvironmentManager = (CC.EnvironmentManager = {
    counts: counts,

    shadowCount() { return blobs.length; },

    init(targetScene, renderer) {
      scene = targetScene;
      built = false;
      if (CC.TextureGenerator) CC.TextureGenerator.init(renderer);
      blobGeometry = new THREE.PlaneGeometry(1, 1);
      blobGeometry.rotateX(-Math.PI / 2);
      blobMaterial = new THREE.MeshBasicMaterial({
        map: CC.TextureGenerator.shadow(), transparent: true, opacity: 0.46,
        depthWrite: false, color: 0xffffff, side: THREE.DoubleSide,
        polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
      });
      beamMaterial = this.beamMaterial();
      beamGeometry = this.headlightBeamGeometry();
      return this;
    },

    build() {
      if (built || !scene) return this;
      built = true;
      addRoadDecals();
      addInstancedClutter();
      this.setNight(nightAmount);
      return this;
    },

    beamMaterial() {
      if (beamMaterial) return beamMaterial;
      beamMaterial = new THREE.MeshBasicMaterial({
        color: 0xffefbc,
        transparent: true,
        opacity: 0.015 + nightAmount * 0.1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false
      });
      return beamMaterial;
    },

    // Cone apex at the bulb, base 13 m ahead along local +Z.
    headlightBeamGeometry() {
      if (beamGeometry) return beamGeometry;
      beamGeometry = new THREE.ConeGeometry(2.3, 13, 14, 1, true);
      beamGeometry.rotateX(-Math.PI / 2);
      beamGeometry.translate(0, 0, 6.5);
      return beamGeometry;
    },

    // Apex at the lamp, base pointing straight down.
    streetBeamGeometry() {
      if (!this._streetBeamGeometry) {
        const g = new THREE.ConeGeometry(4.2, 10, 12, 1, true);
        g.translate(0, -5, 0);
        this._streetBeamGeometry = g;
      }
      return this._streetBeamGeometry;
    },

    createHeadlightBeam(x, y, z) {
      const beam = new THREE.Mesh(this.headlightBeamGeometry(), this.beamMaterial());
      beam.position.set(x || 0, y || 1, (z || 2) + 0.1);
      beam.castShadow = false;
      beam.receiveShadow = false;
      beam.visible = nightAmount > 0.12;
      beam.renderOrder = 3;
      return beam;
    },

    attachBlobShadow(parent, width, localY, length) {
      if (!parent || !blobGeometry) return null;
      const mesh = new THREE.Mesh(blobGeometry, blobMaterial);
      mesh.position.y = localY || 0.03;
      mesh.scale.set(width || 2, 1, length || width || 2);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.renderOrder = 1;
      parent.add(mesh);
      blobs.push({ mesh: mesh, parent: parent, localY: mesh.position.y });
      return mesh;
    },

    updateVehicleLights(visual, braking, night) {
      if (!visual) return;
      const n = U.clamp(night == null ? nightAmount : night, 0, 1);
      if (visual.headMat) visual.headMat.emissiveIntensity = 0.34 + n * 1.9;
      if (visual.brakeMat) {
        visual.brakeMat.emissive.setHex(braking ? 0xff2a14 : 0x62120d);
        visual.brakeMat.emissiveIntensity = braking ? 1.7 + n * 1.1 : 0.04 + n * 0.3;
      }
      (visual.beams || []).forEach(function (beam) { beam.visible = n > 0.12; });
    },

    setNight(value) {
      nightAmount = U.clamp(value || 0, 0, 1);
      if (beamMaterial) beamMaterial.opacity = 0.012 + nightAmount * 0.105;
      if (streetBeamMesh) streetBeamMesh.visible = nightAmount > 0.12;
      return nightAmount;
    },

    update(dt, time, player) {
      if (!blobs.length) return;
      for (let i = 0; i < blobs.length; i++) {
        const b = blobs[i];
        if (!b.parent || !b.mesh.parent) continue;
        // Keep the gradient flat even when a pedestrian leans or a car tilts.
        b.mesh.quaternion.copy(b.parent.quaternion).invert();
        b.parent.getWorldPosition(tmp);
        // Buildings never move, so their ground height only needs sampling
        // once. Vehicles/pedestrians re-sample when they actually change cell.
        if (b.ground == null || b.lastX !== tmp.x || b.lastZ !== tmp.z) {
          b.ground = CC.heightAt ? CC.heightAt(tmp.x, tmp.z) : 0;
          b.lastX = tmp.x; b.lastZ = tmp.z;
        }
        const height = tmp.y - b.ground;
        b.mesh.visible = height < 9 && b.parent.visible !== false &&
          !b.mesh.userData.forceHidden;
      }
    }
  });
})();
