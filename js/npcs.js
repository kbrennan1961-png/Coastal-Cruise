/* Coastal Cruise - civilian traffic and reactive pedestrians. */
(function () {
  'use strict';

  const CC = window.CC;
  const C = CC.C, U = CC.util;
  const rng = CC.rng(77713);

  function mat(hex) { return new THREE.MeshLambertMaterial({ color: hex, flatShading: true }); }
  function box(w, h, d, m, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x || 0, y || 0, z || 0);
    mesh.castShadow = true;
    return mesh;
  }

  /* ---------- traffic ---------- */
  const trafficKinds = ['car', 'car', 'truck', 'car', 'cart'];
  const trafficColors = [0xd9d6c9, 0x7d9ab5, 0xc67d6a, 0x9fb08b, 0xd6b45f, 0x6f7f8c, 0xe0e3e6];

  class TrafficCar {
    constructor(scene, road, s, dir, kind) {
      this.road = road;
      this.s = s;
      this.dir = dir;
      this.kind = kind;
      this.visual = CC.VehicleFactory.build(kind, U.pick(rng, trafficColors));
      this.group = this.visual.group;
      scene.add(this.group);
      this.baseSpeed = kind === 'cart' ? U.randRange(rng, 6, 9) :
        kind === 'truck' ? U.randRange(rng, 10, 14) : U.randRange(rng, 11, 17);
      this.speed = this.baseSpeed;
      this.target = this.baseSpeed;
      this.lane = 2.7;
      this.hornCooldown = 0;
      this.flash = 0;
      this.radius = this.visual.spec.radius;

      // Small "!" sprite shown when honking.
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d');
      g.fillStyle = 'rgba(0,0,0,0)'; g.fillRect(0, 0, 64, 64);
      g.fillStyle = '#ffd34d'; g.font = 'bold 52px Arial';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('!', 32, 32);
      this.alert = new THREE.Sprite(new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(c), transparent: true, depthTest: false
      }));
      this.alert.scale.set(2.2, 2.2, 1);
      this.alert.visible = false;
      this.group.add(this.alert);
      this.alert.position.set(0, this.kind === 'truck' ? 4.2 : 3.2, 0);
      this.group.rotation.y = 0;
    }

    update(dt, player, all, world, audio) {
      const road = this.road;
      let gap = Infinity;
      for (let i = 0; i < all.length; i++) {
        const o = all[i];
        if (o === this || o.road !== road || o.dir !== this.dir) continue;
        let ds = (o.s - this.s) * this.dir;
        if (ds < 0) ds += road._length;
        if (ds < gap) gap = ds;
      }
      this.target = this.baseSpeed;
      if (gap < 24) this.target = Math.min(this.target, U.clamp((gap - 5) / 14, 0, 1) * this.baseSpeed);

      // React to a player cutting in front.
      const pdx = player.pos.x - this.group.position.x;
      const pdz = player.pos.z - this.group.position.z;
      const pDist = Math.hypot(pdx, pdz);
      const pf = player.forward();
      const aheadDot = pDist > 0 ? (pdx * pf.x + pdz * pf.z) / pDist : 0;
      if (pDist < 15 && aheadDot < -0.35 && player.speed > 9) {
        this.target = Math.min(this.target, 2.5);
        if (this.hornCooldown <= 0) {
          this.hornCooldown = 2.4;
          this.flash = 1.4;
          if (audio) audio.honk(U.clamp(1 - pDist / 20, 0, 1));
        }
      }
      this.hornCooldown -= dt;
      this.flash = Math.max(0, this.flash - dt);
      this.alert.visible = this.flash > 0;
      if (this.alert.visible) this.alert.position.y += Math.sin(performance.now() * 0.01) * 0.01;

      this.speed = U.damp(this.speed, this.target, this.target < this.speed ? 3.4 : 1.6, dt);
      this.s += this.speed * this.dir * dt;
      if (this.s > road._length) this.s -= road._length;
      if (this.s < 0) this.s += road._length;

      const p = CC.sampleRoad(road, this.s);
      const tx = p.dx * this.dir, tz = p.dz * this.dir;
      const rx = tz, rz = -tx;
      const x = p.x + rx * this.lane;
      const z = p.z + rz * this.lane;
      this.group.position.set(x, CC.heightAt(x, z) + this.visual.spec.wheelRadius, z);
      this.group.rotation.y = U.angleLerp(this.group.rotation.y, Math.atan2(tx, tz), 1 - Math.exp(-9 * dt));
      const spin = (this.speed / this.visual.spec.wheelRadius) * dt;
      for (let i = 0; i < this.visual.wheels.length; i++) this.visual.wheels[i].rotation.y += spin;
      const braking = this.target < this.speed - 1.2;
      this.visual.brakeMat.emissive.setHex(braking ? 0xff2a14 : 0x000000);
      this.visual.brakeMat.emissiveIntensity = braking ? 1.6 : 0;

      // Contact with the player.
      const ddx = player.pos.x - x, ddz = player.pos.z - z;
      const dist = Math.hypot(ddx, ddz);
      const minD = this.radius + player.spec.radius;
      if (dist < minD && dist > 0.01) {
        const nx = ddx / dist, nz = ddz / dist;
        player.pos.x = x + nx * minD;
        player.pos.z = z + nz * minD;
        player.speed *= 0.62;
        player.latVel += (Math.random() - 0.5) * 3;
        if (this.hornCooldown <= 0) {
          this.hornCooldown = 2;
          if (audio) audio.honk(1);
        }
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
      this.position = new THREE.Vector3(x, CC.heightAt(x, z), z);
      this.heading = rng() * Math.PI * 2;
      this.speed = U.randRange(rng, 0.9, 1.6);
      this.target = new THREE.Vector2(x, z);
      this.idleTimer = U.randRange(rng, 1, 5);
      this.fleeTimer = 0;
      this.vy = 0;
      this.fleeX = 0; this.fleeZ = 0;
      this.walkPhase = rng() * Math.PI * 2;

      const skin = mat(U.pick(rng, skinColors));
      const shirt = mat(U.pick(rng, shirtColors));
      const pants = mat(U.pick(rng, [0x4a5b68, 0x6b5f4d, 0x3f4a5a]));
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.9, 6), shirt);
      body.position.y = 1.15; body.castShadow = true;
      this.group.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 7, 5), skin);
      head.position.y = 1.82; head.castShadow = true;
      this.group.add(head);
      this.legL = box(0.18, 0.72, 0.2, pants, -0.13, 0.36, 0);
      this.legR = box(0.18, 0.72, 0.2, pants, 0.13, 0.36, 0);
      this.armL = box(0.14, 0.7, 0.16, shirt, -0.36, 1.16, 0);
      this.armR = box(0.14, 0.7, 0.16, shirt, 0.36, 1.16, 0);
      this.group.add(this.legL, this.legR, this.armL, this.armR);

      if (this.role === 'fish') {
        const rod = box(0.04, 2.2, 0.04, mat(0x8a704b), 0.42, 1.8, 0.5);
        rod.rotation.x = -0.6;
        this.group.add(rod);
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

    update(dt, player, world) {
      const dx = this.position.x - player.pos.x;
      const dz = this.position.z - player.pos.z;
      const dist = Math.hypot(dx, dz);
      const pf = player.forward();
      const approach = dist > 0.01 ? (dx * pf.x + dz * pf.z) / dist : 0;

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
      } else if (this.role === 'walk') {
        let tx = this.target.x - this.position.x;
        let tz = this.target.y - this.position.z;
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

      const groundY = CC.heightAt(this.position.x, this.position.z);
      if (this.fleeTimer <= 0) this.position.y = groundY;
      else this.position.y = Math.max(this.position.y, groundY);
      this.group.position.copy(this.position);
      this.group.rotation.y = this.heading;

      const swing = moving ? Math.sin(this.walkPhase) * (this.fleeTimer > 0 ? 0.9 : 0.45) : Math.sin(performance.now() * 0.002) * 0.03;
      this.legL.rotation.x = swing;
      this.legR.rotation.x = -swing;
      this.armL.rotation.x = -swing * 0.8;
      this.armR.rotation.x = swing * 0.8;
      this.group.rotation.z = this.fleeTimer > 0 ? Math.sin(this.walkPhase) * 0.18 : 0;
    }
  }

  /* ---------- system ---------- */
  const NPCSystem = (CC.NPCSystem = {
    traffic: [],
    pedestrians: [],
    init(scene) {
      const roads = CC.roadDefs.filter(r => r.type === 'paved' || r.type === 'gravel');
      roads.forEach(function (road, ri) {
        const count = road.type === 'paved' ? 3 : 1;
        for (let i = 0; i < count; i++) {
          const dir = rng() < 0.5 ? 1 : -1;
          const s = (i + 0.35 + rng() * 0.3) / count * road._length;
          const kind = U.pick(rng, trafficKinds);
          NPCSystem.traffic.push(new TrafficCar(scene, road, s, dir, kind));
        }
      });

      const makePedAt = function (x, z, role, owner) {
        if (CC.coast.isWater(x, z)) return null;
        const p = new Pedestrian(scene, x, z, role, owner);
        NPCSystem.pedestrians.push(p);
        return p;
      };
      // Sidewalk strollers.
      const paved = CC.roadDefs.filter(r => r.type === 'paved');
      for (let i = 0; i < 18; i++) {
        const road = U.pick(rng, paved);
        const p = CC.sampleRoad(road, rng() * road._length);
        const side = rng() < 0.5 ? 1 : -1;
        const x = p.x + p.dz * side * (road.width * 0.5 + U.randRange(rng, 3, 7));
        const z = p.z - p.dx * side * (road.width * 0.5 + U.randRange(rng, 3, 7));
        makePedAt(x, z, rng() < 0.4 ? 'walk' : 'idle');
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
      // Dog walkers near homes.
      const homes = CC.World.obstacles.filter(o => o.type === 'home');
      for (let i = 0; i < 5 && i < homes.length; i++) {
        const h = homes[Math.floor(rng() * homes.length)];
        const a = rng() * Math.PI * 2;
        const owner = makePedAt(h.x + Math.cos(a) * 9, h.z + Math.sin(a) * 9, 'walk');
        if (owner) makePedAt(owner.position.x + 1, owner.position.z - 1, 'dog', owner);
      }
    },
    update(dt, player, world, audio) {
      for (let i = 0; i < this.traffic.length; i++) this.traffic[i].update(dt, player, this.traffic, world, audio);
      for (let i = 0; i < this.pedestrians.length; i++) this.pedestrians[i].update(dt, player, world);
    }
  });
})();
