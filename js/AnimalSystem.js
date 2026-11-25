/* Wild/roaming animal models from CC.AnimalAssets (embedded GLBs). */
(function () {
  'use strict';
  const CC = window.CC = window.CC || {};
  const U = CC.util;

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
    const assets = CC.AnimalAssets || {};
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
              obj.castShadow = true;
              obj.receiveShadow = true;
              if (obj.material) {
                const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                mats.forEach(function (m) { m.side = THREE.FrontSide; m.needsUpdate = true; });
              }
            }
          });
          // Normalize to roughly target size by bounding box height.
          const box = new THREE.Box3().setFromObject(scene);
          const size = new THREE.Vector3(); box.getSize(size);
          const center = new THREE.Vector3(); box.getCenter(center);
          scene.position.sub(center);
          scene.position.y += size.y * 0.5;
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

  function findLandSpot(rng, minX, maxX, minZ, maxZ, tries) {
    for (let i = 0; i < (tries || 80); i++) {
      const x = U.randRange(rng, minX, maxX);
      const z = U.randRange(rng, minZ, maxZ);
      if (CC.coast.isWater(x, z) || CC.coast.distanceToWater(x, z) < 3) continue;
      const nr = CC.nearestRoad(x, z);
      if (nr && nr.dist < nr.width * 0.5 + 2.5) continue;
      let bad = false;
      const obs = CC.World.obstacles || [];
      for (let j = 0; j < obs.length; j++) {
        const o = obs[j];
        if (Math.hypot(x - o.x, z - o.z) < (o.r || 1) + 2.2) { bad = true; break; }
      }
      if (bad) continue;
      const y = CC.heightAt(x, z);
      if (y < -0.5) continue;
      return { x: x, y: y, z: z };
    }
    return null;
  }

  function cloneTemplate(tpl) {
    const root = tpl.scene.clone(true);
    // clone materials to avoid shared-state issues
    root.traverse(function (obj) {
      if (obj.isMesh && obj.material) {
        obj.material = Array.isArray(obj.material) ? obj.material.map(function (m) { return m.clone(); }) : obj.material.clone();
      }
    });
    return root;
  }

  function makeAnimal(kind, tpl, pos, opts) {
    opts = opts || {};
    const group = new THREE.Group();
    const model = cloneTemplate(tpl);
    const targetH = opts.height || 1.2;
    const s = targetH / Math.max(0.001, tpl.size.y || 1);
    model.scale.setScalar(s);
    group.add(model);
    group.position.set(pos.x, pos.y, pos.z);
    group.rotation.y = opts.heading || Math.random() * Math.PI * 2;
    return {
      kind: kind,
      group: group,
      pos: group.position,
      heading: group.rotation.y,
      baseSpeed: opts.baseSpeed || 1.2,
      wanderR: opts.wanderR || 18,
      home: new THREE.Vector3(pos.x, pos.y, pos.z),
      target: new THREE.Vector3(pos.x, pos.y, pos.z),
      timer: Math.random() * 2,
      phase: Math.random() * Math.PI * 2,
      pack: opts.pack || null,
      alive: true
    };
  }

  function pickTarget(animal, rng) {
    const home = animal.pack ? animal.pack.center : animal.home;
    const r = animal.pack ? animal.pack.wanderR : animal.wanderR;
    for (let i = 0; i < 20; i++) {
      const a = rng() * Math.PI * 2;
      const d = rng() * r;
      const x = home.x + Math.cos(a) * d;
      const z = home.z + Math.sin(a) * d;
      if (CC.coast.isWater(x, z)) continue;
      const nr = CC.nearestRoad(x, z);
      if (nr && nr.dist < nr.width * 0.5 + 2.0) continue;
      animal.target.set(x, CC.heightAt(x, z), z);
      return;
    }
    animal.target.copy(home);
  }

  const AnimalSystem = {
    animals: [],
    packs: [],
    ready: false,

    init: function (scene) {
      this.scene = scene;
      this.animals.length = 0;
      this.packs.length = 0;
      this.ready = false;
      const self = this;
      loadTemplates().then(function (templates) {
        const rng = (CC.rng || CC.util.rng)(0x414e494d); // "ANIM"
        const defs = [
          { key: 'Fox', count: 7, height: 1.1, speed: 2.0, wanderR: 22 },
          { key: 'Horse', count: 7, height: 2.4, speed: 1.7, wanderR: 26 },
          { key: 'ShibaInu', count: 7, height: 0.85, speed: 1.8, wanderR: 20 },
          { key: 'Husky', count: 7, height: 1.0, speed: 1.9, wanderR: 22 },
          { key: 'Stag', count: 7, height: 2.2, speed: 1.8, wanderR: 24 }
        ];
        defs.forEach(function (def) {
          const tpl = templates[def.key];
          if (!tpl) return;
          for (let i = 0; i < def.count; i++) {
            const pos = findLandSpot(rng, -320, 320, -320, 320, 140);
            if (!pos) continue;
            const a = makeAnimal(def.key, tpl, pos, {
              height: def.height, baseSpeed: def.speed, wanderR: def.wanderR, heading: rng() * Math.PI * 2
            });
            scene.add(a.group);
            self.animals.push(a);
            pickTarget(a, rng);
          }
        });

        // Wolf pack: 6 wolves roaming together.
        const wtpl = templates.Wolf;
        if (wtpl) {
          const centerPos = findLandSpot(rng, -220, 220, -220, 220, 160) || { x: 120, y: CC.heightAt(120, 120), z: 120 };
          const pack = {
            center: new THREE.Vector3(centerPos.x, centerPos.y, centerPos.z),
            target: new THREE.Vector3(centerPos.x, centerPos.y, centerPos.z),
            timer: 0,
            wanderR: 65,
            speed: 2.6
          };
          self.packs.push(pack);
          for (let i = 0; i < 6; i++) {
            const a = rng() * Math.PI * 2;
            const d = 1.8 + i * 0.9;
            const x = centerPos.x + Math.cos(a) * d;
            const z = centerPos.z + Math.sin(a) * d;
            const y = CC.heightAt(x, z);
            const wolf = makeAnimal('Wolf', wtpl, { x: x, y: y, z: z }, {
              height: 1.15, baseSpeed: 2.6, wanderR: 12, heading: rng() * Math.PI * 2, pack: pack
            });
            scene.add(wolf.group);
            self.animals.push(wolf);
          }
        }
        self.ready = true;
      });
    },

    update: function (dt, playerPos) {
      if (!this.ready) return;
      const rng = Math.random;
      // Update pack centers
      for (let p = 0; p < this.packs.length; p++) {
        const pack = this.packs[p];
        pack.timer -= dt;
        if (pack.timer <= 0 || pack.center.distanceTo(pack.target) < 2.5) {
          pickTarget({ pack: pack, home: pack.center, target: pack.target, wanderR: pack.wanderR }, rng);
          pack.target.y = CC.heightAt(pack.target.x, pack.target.z);
          pack.timer = 4 + rng() * 6;
        }
        const dx = pack.target.x - pack.center.x;
        const dz = pack.target.z - pack.center.z;
        const dist = Math.hypot(dx, dz) || 1;
        const step = Math.min(dist, pack.speed * dt);
        pack.center.x += dx / dist * step;
        pack.center.z += dz / dist * step;
        pack.center.y = CC.heightAt(pack.center.x, pack.center.z);
      }

      const px = playerPos ? playerPos.x : 0;
      const pz = playerPos ? playerPos.z : 0;
      for (let i = 0; i < this.animals.length; i++) {
        const a = this.animals[i];
        if (!a.alive) continue;
        const dPlayer = Math.hypot(a.pos.x - px, a.pos.z - pz);
        const visible = dPlayer < 260;
        a.group.visible = visible;
        if (!visible) continue;

        a.timer -= dt;
        const home = a.pack ? a.pack.center : a.home;
        const target = a.pack ? new THREE.Vector3(
          home.x + Math.cos(a.phase + i * 0.9) * (1.8 + (i % 3) * 0.9),
          0,
          home.z + Math.sin(a.phase + i * 1.7) * (1.8 + (i % 3) * 0.9)
        ) : a.target;
        if (a.pack) target.y = CC.heightAt(target.x, target.z);
        else if (a.timer <= 0 || a.pos.distanceTo(a.target) < 1.2) {
          pickTarget(a, rng);
          a.timer = 2 + rng() * 5;
        }

        const dx = target.x - a.pos.x;
        const dz = target.z - a.pos.z;
        const dist = Math.hypot(dx, dz);
        let moving = false;
        if (dist > 0.25) {
          moving = true;
          const sp = a.baseSpeed;
          const step = Math.min(dist, sp * dt);
          const nx = a.pos.x + dx / dist * step;
          const nz = a.pos.z + dz / dist * step;
          if (!CC.coast.isWater(nx, nz)) {
            const nr = CC.nearestRoad(nx, nz);
            if (!(nr && nr.dist < nr.width * 0.5 + 1.8)) {
              a.pos.x = nx; a.pos.z = nz;
              a.heading = Math.atan2(dx / dist, dz / dist);
            } else if (!a.pack) {
              pickTarget(a, rng); a.timer = 0.4;
            }
          } else if (!a.pack) {
            pickTarget(a, rng);
            a.timer = 0.5;
          }
        }
        a.pos.y = CC.heightAt(a.pos.x, a.pos.z);
        a.group.position.copy(a.pos);
        const cur = a.group.rotation.y;
        let delta = a.heading - cur;
        delta = ((delta + Math.PI) % (Math.PI * 2)) - Math.PI;
        if (delta < -Math.PI) delta += Math.PI * 2;
        a.group.rotation.y = cur + delta * Math.min(1, dt * 4);
        const bob = moving ? Math.sin(performance.now() * 0.008 + a.phase) * 0.03 : 0;
        a.group.position.y += bob;
      }
    }
  };

  CC.AnimalSystem = AnimalSystem;
})();
