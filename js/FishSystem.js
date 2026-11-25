/* Fish schools and piranha swarms from CC.FishAssets (embedded GLBs). */
(function () {
  'use strict';
  const CC = window.CC = window.CC || {};
  const U = CC.util;
  const C = CC.config || CC.C || {};

  let _templates = null;
  let _loading = null;

  function parseGlb(base64) {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }

  function loadTemplates() {
    if (_templates) return Promise.resolve(_templates);
    if (_loading) return _loading;
    const assets = CC.FishAssets || {};
    const keys = Object.keys(assets);
    if (!keys.length || !THREE.GLTFLoader) {
      _templates = {};
      return Promise.resolve(_templates);
    }
    const loader = new THREE.GLTFLoader();
    _loading = Promise.all(keys.map(function (key) {
      return new Promise(function (resolve) {
        loader.parse(parseGlb(assets[key]), '', function (gltf) {
          const scene = gltf.scene || new THREE.Group();
          scene.traverse(function (obj) {
            if (obj.isMesh) {
              obj.castShadow = false;
              obj.receiveShadow = false;
              if (obj.material) {
                const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                mats.forEach(function (m) { m.side = THREE.DoubleSide; m.needsUpdate = true; });
              }
            }
          });
          const box = new THREE.Box3().setFromObject(scene);
          const size = new THREE.Vector3(); box.getSize(size);
          const center = new THREE.Vector3(); box.getCenter(center);
          scene.position.sub(center);
          resolve({ key: key, scene: scene, size: size });
        }, function () { resolve(null); });
      });
    })).then(function (items) {
      _templates = {};
      items.forEach(function (it) { if (it) _templates[it.key] = it; });
      return _templates;
    }).catch(function () { _templates = {}; return _templates; });
    return _loading;
  }

  function cloneTemplate(tpl) {
    const root = tpl.scene.clone(true);
    root.traverse(function (obj) {
      if (obj.isMesh && obj.material) {
        obj.material = Array.isArray(obj.material) ? obj.material.map(function (m) { return m.clone(); }) : obj.material.clone();
      }
    });
    return root;
  }

  function randomWaterPoint(rng) {
    const W = C.WORLD;
    for (let i = 0; i < 220; i++) {
      const x = U.randRange(rng, W.minX + 12, W.maxX - 12);
      const z = U.randRange(rng, W.minZ + 12, W.maxZ - 12);
      if (CC.coast.isWater(x, z)) return { x: x, z: z };
    }
    // Fallback to open ocean
    return { x: U.randRange(rng, W.minX + 20, -60), z: U.randRange(rng, -120, 200) };
  }

  function fishY(phase, t) {
    return (C.SEA_LEVEL || 0) - 0.55 + Math.sin(t * 0.8 + phase) * 0.08;
  }

  function makeFish(tpl, opts) {
    const group = new THREE.Group();
    const model = cloneTemplate(tpl);
    const targetLen = opts.length || 1.2;
    const len = Math.max(tpl.size.x, tpl.size.y, tpl.size.z, 0.001);
    model.scale.setScalar(targetLen / len);
    group.add(model);
    group.position.copy(opts.pos);
    group.rotation.y = opts.heading || 0;
    return {
      kind: opts.kind,
      group: group,
      pos: group.position,
      heading: opts.heading || 0,
      speed: opts.speed || 1.4,
      phase: Math.random() * Math.PI * 2,
      school: opts.school || null,
      targetOffset: new THREE.Vector3(opts.ox || 0, 0, opts.oz || 0),
      swarmTarget: null
    };
  }

  function pickSchoolTarget(school, rng) {
    const p = randomWaterPoint(rng);
    school.target.set(p.x, 0, p.z);
    school.timer = 5 + rng() * 8;
  }

  const FishSystem = {
    fish: [],
    schools: [],
    ready: false,

    init: function (scene) {
      this.scene = scene;
      this.fish.length = 0;
      this.schools.length = 0;
      this.ready = false;
      const self = this;
      loadTemplates().then(function (templates) {
        const rng = (CC.rng || U.rng)(0xF15A0001);
        const defs = [
          { key: 'GoblinShark', count: 20, schoolSize: 5, length: 1.8, speed: 1.3 },
          { key: 'ParrotFish', count: 20, schoolSize: 5, length: 1.0, speed: 1.6 },
          { key: 'RedSnapper', count: 20, schoolSize: 5, length: 1.1, speed: 1.5 },
          { key: 'Shark', count: 20, schoolSize: 5, length: 2.2, speed: 1.7 },
          { key: 'Piranha', count: 20, schoolSize: 20, length: 0.8, speed: 2.2, piranha: true }
        ];

        defs.forEach(function (def) {
          const tpl = templates[def.key];
          if (!tpl) return;
          const schoolsCount = def.piranha ? 1 : Math.ceil(def.count / def.schoolSize);
          for (let s = 0; s < schoolsCount; s++) {
            const center = randomWaterPoint(rng);
            const school = {
              kind: def.key,
              center: new THREE.Vector3(center.x, 0, center.z),
              target: new THREE.Vector3(center.x, 0, center.z),
              timer: rng() * 4,
              speed: def.speed,
              piranha: !!def.piranha,
              members: []
            };
            self.schools.push(school);
            pickSchoolTarget(school, rng);
            const n = def.piranha ? def.count : def.schoolSize;
            for (let i = 0; i < n; i++) {
              const ox = U.randRange(rng, -2.5, 2.5);
              const oz = U.randRange(rng, -2.5, 2.5);
              const px = center.x + ox;
              const pz = center.z + oz;
              const pos = new THREE.Vector3(px, fishY(i, 0), pz);
              const fish = makeFish(tpl, {
                kind: def.key, length: def.length, speed: def.speed + U.randRange(rng, -0.15, 0.15),
                heading: rng() * Math.PI * 2, pos: pos, ox: ox, oz: oz, school: school
              });
              scene.add(fish.group);
              school.members.push(fish);
              self.fish.push(fish);
            }
          }
        });
        self.ready = true;
      });
    },

    update: function (dt, playerPos, npcs) {
      if (!this.ready) return;
      const rng = Math.random;
      const t = performance.now() * 0.001;
      const px = playerPos ? playerPos.x : 0;
      const pz = playerPos ? playerPos.z : 0;

      // Update school centers
      for (let i = 0; i < this.schools.length; i++) {
        const school = this.schools[i];
        if (school.piranha) {
          // Swarm nearest contact: player in/near water or any NPC in water
          let target = null;
          let bestD = 80;
          if (CC.coast.isWater(px, pz) || CC.coast.distanceToWater(px, pz) < 6) {
            const d = Math.hypot(px - school.center.x, pz - school.center.z);
            if (d < bestD) { bestD = d; target = { x: px, z: pz }; }
          }
          if (npcs) {
            const list = npcs.pedestrians || npcs;
            for (let j = 0; j < list.length; j++) {
              const p = list[j];
              const pos = p.position || p.pos;
              if (!pos) continue;
              if (!CC.coast.isWater(pos.x, pos.z) && CC.coast.distanceToWater(pos.x, pos.z) > 4) continue;
              const d = Math.hypot(pos.x - school.center.x, pos.z - school.center.z);
              if (d < bestD) { bestD = d; target = { x: pos.x, z: pos.z }; }
            }
          }
          if (target) {
            school.target.set(target.x, 0, target.z);
            school.timer = 2;
          } else {
            school.timer -= dt;
            if (school.timer <= 0 || Math.hypot(school.target.x - school.center.x, school.target.z - school.center.z) < 2.5) {
              pickSchoolTarget(school, rng);
            }
          }
        } else {
          school.timer -= dt;
          if (school.timer <= 0 || Math.hypot(school.target.x - school.center.x, school.target.z - school.center.z) < 2.5) {
            pickSchoolTarget(school, rng);
          }
        }

        const dx = school.target.x - school.center.x;
        const dz = school.target.z - school.center.z;
        const dist = Math.hypot(dx, dz) || 1;
        const sp = school.piranha && dist < 40 ? school.speed * 1.8 : school.speed;
        const step = Math.min(dist, sp * dt);
        const nx = school.center.x + dx / dist * step;
        const nz = school.center.z + dz / dist * step;
        // Fish can swim through all water on the map; only avoid going far onto land by steering.
        if (CC.coast.isWater(nx, nz) || dist > 1) {
          school.center.x = nx; school.center.z = nz;
        } else {
          pickSchoolTarget(school, rng);
        }
        if (!CC.coast.isWater(school.center.x, school.center.z)) {
          // Nudge back toward nearest water by sampling around.
          for (let k = 0; k < 12; k++) {
            const a = (k / 12) * Math.PI * 2;
            const wx = school.center.x + Math.cos(a) * 3;
            const wz = school.center.z + Math.sin(a) * 3;
            if (CC.coast.isWater(wx, wz)) { school.center.x = wx; school.center.z = wz; break; }
          }
        }
      }

      for (let i = 0; i < this.fish.length; i++) {
        const f = this.fish[i];
        const school = f.school;
        if (!school) continue;
        const dPlayer = Math.hypot(f.pos.x - px, f.pos.z - pz);
        f.group.visible = dPlayer < 280;
        if (!f.group.visible) continue;

        // Target around school center with individual offset; piranhas swarm tighter.
        const spread = school.piranha ? 1.4 : 2.4;
        const ox = Math.sin(f.phase + t * 0.7 + i * 0.3) * spread + f.targetOffset.x * 0.35;
        const oz = Math.cos(f.phase + t * 0.6 + i * 0.4) * spread + f.targetOffset.z * 0.35;
        const tx = school.center.x + ox;
        const tz = school.center.z + oz;
        const dx = tx - f.pos.x;
        const dz = tz - f.pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.05) {
          const sp = f.speed * (school.piranha ? 1.2 : 1.0);
          const step = Math.min(dist, sp * dt * (dist > 4 ? 2.2 : 1.0));
          const nx = f.pos.x + dx / dist * step;
          const nz = f.pos.z + dz / dist * step;
          if (CC.coast.isWater(nx, nz)) {
            f.pos.x = nx; f.pos.z = nz;
          } else {
            // Keep fish in water: slide toward school center if offset pushes onto land.
            const sx = school.center.x - f.pos.x;
            const sz = school.center.z - f.pos.z;
            const sd = Math.hypot(sx, sz) || 1;
            f.pos.x += sx / sd * Math.min(sd, sp * dt);
            f.pos.z += sz / sd * Math.min(sd, sp * dt);
          }
          f.heading = Math.atan2(dx / dist, dz / dist);
        }
        if (!CC.coast.isWater(f.pos.x, f.pos.z)) {
          f.pos.x = school.center.x;
          f.pos.z = school.center.z;
        }
        const y = fishY(f.phase, t);
        f.pos.y = y;
        f.group.position.copy(f.pos);
        const cur = f.group.rotation.y;
        let delta = f.heading - cur;
        delta = ((delta + Math.PI) % (Math.PI * 2)) - Math.PI;
        if (delta < -Math.PI) delta += Math.PI * 2;
        f.group.rotation.y = cur + delta * Math.min(1, dt * 3.5);
        f.group.rotation.z = Math.sin(t * 1.4 + f.phase) * 0.04;
      }
    }
  };

  CC.FishSystem = FishSystem;
})();
