/* Coastal Cruise - low-poly vehicle factory + arcade driving physics. */
(function () {
  'use strict';

  const CC = window.CC;
  const C = CC.C, U = CC.util;
  const tyreMat = new THREE.MeshLambertMaterial({ color: 0x24282b, flatShading: true });
  const hubMat = new THREE.MeshLambertMaterial({ color: 0xc6ccd0, flatShading: true });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x2e566b, emissive: 0x0b1a22, flatShading: true });
  const chromeMat = new THREE.MeshLambertMaterial({ color: 0xd9dfe2, flatShading: true });

  function box(w, h, d, m, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x || 0, y || 0, z || 0);
    mesh.castShadow = true; mesh.receiveShadow = true;
    return mesh;
  }

  function addWheel(parent, x, y, z, radius, width) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    pivot.rotation.z = Math.PI / 2;
    const tyre = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 10), tyreMat);
    tyre.castShadow = true;
    pivot.add(tyre);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.48, radius * 0.48, width + 0.03, 8), hubMat);
    pivot.add(hub);
    parent.add(pivot);
    return tyre;
  }

  function paint(hex) { return new THREE.MeshLambertMaterial({ color: hex, flatShading: true }); }

  const Factory = (CC.VehicleFactory = {
    build(key, colorOverride) {
      const spec = CC.vehicleSpecs[key];
      const color = colorOverride == null ? spec.color : colorOverride;
      const bodyMat = paint(color);
      const darkMat = paint(new THREE.Color(color).offsetHSL(0, 0, -0.18).getHex());
      const group = new THREE.Group();
      const tilt = new THREE.Group();
      group.add(tilt);
      const wheels = [];
      const brakeMat = new THREE.MeshStandardMaterial({ color: 0x7a2018, emissive: 0x000000, roughness: 0.4 });
      const headMat = new THREE.MeshStandardMaterial({ color: 0xfff3c4, emissive: 0xffdf9a, emissiveIntensity: 0.8 });

      function lights(w, y, z) {
        for (const s of [-1, 1]) {
          const rear = box(0.28, 0.2, 0.09, brakeMat, s * w * 0.32, y, -z);
          tilt.add(rear);
          const front = box(0.26, 0.2, 0.09, headMat, s * w * 0.32, y, z);
          tilt.add(front);
        }
      }

      if (key === 'motorcycle') {
        tilt.add(box(0.28, 0.28, 1.7, darkMat, 0, 0.72, 0));
        const tank = new THREE.Mesh(new THREE.SphereGeometry(0.46, 8, 6), bodyMat);
        tank.scale.set(0.9, 0.7, 1.35);
        tank.position.set(0, 0.98, 0.2); tank.castShadow = true;
        tilt.add(tank);
        tilt.add(box(0.5, 0.12, 0.65, tyreMat, 0, 1.12, -0.35));
        tilt.add(box(0.9, 0.08, 0.08, chromeMat, 0, 1.28, 0.62));
        tilt.add(box(0.12, 0.42, 0.12, darkMat, 0, 1.05, 0.72));
        tilt.add(box(0.72, 0.06, 0.06, chromeMat, 0, 0.28, 1.05));
        wheels.push(addWheel(tilt, 0, 0.38, 0.86, 0.38, 0.18));
        wheels.push(addWheel(tilt, 0, 0.38, -0.86, 0.38, 0.18));
        lights(0.5, 0.95, 0.96);
      } else if (key === 'atv') {
        tilt.add(box(1.45, 0.55, 2.0, bodyMat, 0, 0.95, 0));
        tilt.add(box(1.2, 0.22, 0.9, tyreMat, 0, 1.32, -0.25));
        tilt.add(box(1.25, 0.16, 0.7, bodyMat, 0, 1.18, 0.72));
        tilt.add(box(1.5, 0.09, 0.09, chromeMat, 0, 1.55, 0.6));
        for (const x of [-0.72, 0.72]) {
          wheels.push(addWheel(tilt, x, 0.55, 0.82, 0.55, 0.42));
          wheels.push(addWheel(tilt, x, 0.55, -0.82, 0.55, 0.42));
          tilt.add(box(0.1, 0.5, 0.1, chromeMat, x * 0.9, 1.28, 0.6));
        }
        lights(1.3, 1.05, 1.02);
      } else if (key === 'cart') {
        tilt.add(box(1.45, 0.72, 2.25, bodyMat, 0, 0.82, 0));
        tilt.add(box(1.35, 0.12, 1.1, tyreMat, 0, 1.24, -0.3));
        tilt.add(box(1.35, 0.12, 0.7, tyreMat, 0, 1.24, 0.72));
        for (const x of [-0.68, 0.68]) {
          tilt.add(box(0.09, 0.85, 0.09, chromeMat, x, 1.55, 0.75));
          tilt.add(box(0.09, 0.85, 0.09, chromeMat, x, 1.55, -0.75));
        }
        tilt.add(box(1.65, 0.12, 2.3, darkMat, 0, 2.0, 0));
        const glass = box(1.4, 0.55, 0.06, glassMat, 0, 1.6, 1.02);
        tilt.add(glass);
        for (const x of [-0.76, 0.76]) for (const z of [-0.78, 0.78]) {
          wheels.push(addWheel(tilt, x, 0.34, z, 0.34, 0.22));
        }
        lights(1.2, 0.95, 1.14);
      } else if (key === 'car') {
        tilt.add(box(1.9, 0.62, 4.3, bodyMat, 0, 0.78, 0));
        tilt.add(box(1.68, 0.72, 2.15, darkMat, 0, 1.42, -0.25));
        const wind = box(1.55, 0.62, 0.08, glassMat, 0, 1.48, 0.86);
        wind.rotation.x = -0.3;
        tilt.add(wind);
        const rearGlass = box(1.5, 0.5, 0.08, glassMat, 0, 1.48, -1.32);
        rearGlass.rotation.x = 0.25;
        tilt.add(rearGlass);
        tilt.add(box(1.95, 0.14, 0.22, chromeMat, 0, 0.7, 2.16));
        tilt.add(box(1.95, 0.14, 0.22, chromeMat, 0, 0.7, -2.16));
        for (const x of [-0.96, 0.96]) for (const z of [-1.45, 1.45]) {
          wheels.push(addWheel(tilt, x, 0.42, z, 0.42, 0.3));
        }
        lights(1.7, 0.95, 2.18);
      } else {
        // Truck.
        tilt.add(box(2.1, 0.78, 5.3, bodyMat, 0, 1.08, 0));
        tilt.add(box(1.95, 1.05, 1.85, bodyMat, 0, 1.95, 1.5));
        const wind = box(1.75, 0.72, 0.08, glassMat, 0, 2.1, 2.44);
        wind.rotation.x = -0.22;
        tilt.add(wind);
        tilt.add(box(1.85, 0.55, 0.09, glassMat, 0, 2.1, -2.65));
        tilt.add(box(2.15, 0.16, 0.25, chromeMat, 0, 0.95, 2.7));
        for (const x of [-1.04, 1.04]) {
          tilt.add(box(0.12, 0.65, 2.9, darkMat, x, 1.62, -1.15));
          wheels.push(addWheel(tilt, x, 0.55, 1.75, 0.55, 0.36));
          wheels.push(addWheel(tilt, x, 0.55, -1.75, 0.55, 0.36));
        }
        tilt.add(box(1.9, 0.12, 2.9, darkMat, 0, 1.48, -1.15));
        lights(1.85, 1.32, 2.72);
      }

      return { group, tilt, wheels, brakeMat, headMat, spec, key };
    }
  });

  /* ---------- player vehicle ---------- */
  class Vehicle {
    constructor(key, scene) {
      this.key = key;
      this.spec = CC.vehicleSpecs[key];
      this.visual = Factory.build(key);
      this.group = this.visual.group;
      this.tilt = this.visual.tilt;
      this.wheels = this.visual.wheels;
      this.brakeMat = this.visual.brakeMat;
      scene.add(this.group);

      this.pos = new THREE.Vector3();
      this.heading = 0;
      this.speed = 0;
      this.latVel = 0;
      this.vy = 0;
      this.airborne = false;
      this.steerSmoothed = 0;
      this.bob = 0;
      this.dustTimer = 0;
      this.lastSafe = new THREE.Vector3();
      this.needReset = false;
      this.crashFlash = 0;
      this.setVisible(false);
    }

    setVisible(v) { this.group.visible = v; }

    setPose(x, z, heading, speed) {
      this.pos.set(x, CC.heightAt(x, z) + this.spec.wheelRadius, z);
      this.heading = heading || 0;
      this.speed = speed || 0;
      this.latVel = 0; this.vy = 0; this.airborne = false;
      this.lastSafe.copy(this.pos);
      this.syncMesh(0);
    }

    forward() { return { x: Math.sin(this.heading), z: Math.cos(this.heading) }; }

    reset(world) {
      const nr = CC.nearestRoad(this.pos.x, this.pos.z, 'paved') || CC.nearestRoad(this.pos.x, this.pos.z);
      if (nr) {
        const x = nr.x + nr.dx * 0, z = nr.z + nr.dz * 0;
        this.setPose(x, z, Math.atan2(nr.dx, nr.dz), 0);
      } else {
        this.setPose(0, 0, 0, 0);
      }
      if (world && world.particles) {
        world.particles.spawn(this.pos.x, this.pos.y, this.pos.z, 18, 0xf2e2bd, 1.2);
      }
      this.crashFlash = 0.8;
    }

    update(dt, input, world, time) {
      const spec = this.spec;
      const surface = CC.surfaceAt(this.pos.x, this.pos.z);
      let offFactor = 1;
      if (surface === 'sand') offFactor = spec.sandFactor;
      else if (surface === 'grass') offFactor = spec.grassFactor;
      else if (surface === 'water') offFactor = 0.35;
      else if (surface === 'boardwalk') offFactor = Math.min(1, spec.grassFactor + 0.1);

      const boost = !!input.boost;
      const maxSpeed = spec.maxSpeed * offFactor * (boost ? spec.boost : 1);
      const accel = spec.accel * offFactor * (boost ? 1.55 : 1);
      const brakeForce = spec.brake * offFactor;

      if (input.throttle > 0) this.speed += accel * dt;
      else if (input.throttle < 0) {
        if (this.speed > 0.5) this.speed -= brakeForce * dt;
        else this.speed -= accel * 0.5 * dt;
      } else {
        this.speed -= this.speed * Math.min(1, 0.9 * dt);
      }
      // Air/rolling drag.
      this.speed -= this.speed * Math.abs(this.speed) * 0.0016 * dt;
      this.speed = U.clamp(this.speed, -maxSpeed * 0.38, maxSpeed);

      const speedAbs = Math.abs(this.speed);
      const speedFactor = U.clamp(speedAbs / 7, 0, 1);
      const steerRate = spec.turn * speedFactor * (this.speed < -0.2 ? -1 : 1);
      this.steerSmoothed = U.damp(this.steerSmoothed, input.steer, 9, dt);
      this.heading += this.steerSmoothed * steerRate * dt * (input.handbrake ? 1.18 : 1);

      // Lateral slip / drift model.
      const grip = input.handbrake ? spec.driftGrip : spec.grip;
      this.latVel -= this.latVel * Math.min(1, grip * dt);
      if (input.handbrake && speedAbs > 5) {
        this.latVel += this.steerSmoothed * this.speed * 0.85 * dt;
      }
      this.latVel = U.clamp(this.latVel, -14, 14);

      const fwd = this.forward();
      const right = { x: Math.cos(this.heading), z: -Math.sin(this.heading) };
      this.pos.x += (fwd.x * this.speed + right.x * this.latVel) * dt;
      this.pos.z += (fwd.z * this.speed + right.z * this.latVel) * dt;

      // Ground, suspension and jumps.
      const ground = CC.heightAt(this.pos.x, this.pos.z) + spec.wheelRadius;
      if (this.pos.y <= ground + 0.06) {
        if (this.airborne && this.vy < -6 && world && world.particles) {
          world.particles.spawn(this.pos.x, ground, this.pos.z, 8, 0xe8d4a2, 0.7);
        }
        this.pos.y = ground;
        this.vy = 0;
        this.airborne = false;
      } else {
        this.vy -= C.GRAVITY * dt;
        this.pos.y += this.vy * dt;
        this.airborne = true;
      }

      // Cresting a dune at speed launches the vehicle a little.
      if (!this.airborne && speedAbs > 10 && surface !== 'paved') {
        const ahead = CC.heightAt(this.pos.x + fwd.x * 2.5, this.pos.z + fwd.z * 2.5);
        const here = CC.heightAt(this.pos.x, this.pos.z);
        if (here - ahead > 0.55) { this.vy = (here - ahead) * 2.6; this.airborne = true; }
      }

      this.handleCollisions(world, speedAbs, surface);
      if (this.needReset) { this.reset(world); this.needReset = false; }

      if (surface === 'paved' || surface === 'gravel') {
        this.lastSafe.copy(this.pos);
      }
      if (CC.coast.distanceToWater(this.pos.x, this.pos.z) < -10) {
        this.pos.copy(this.lastSafe);
        this.speed *= 0.2;
        if (world && world.particles) world.particles.spawn(this.pos.x, this.pos.y + 0.5, this.pos.z, 16, 0xeaf7f5, 1.1);
      }

      // Dust / spray.
      this.dustTimer -= dt;
      if (this.dustTimer <= 0 && speedAbs > 5 && world && world.particles) {
        const rough = surface === 'sand' || surface === 'grass' || surface === 'gravel';
        const sliding = input.handbrake && speedAbs > 9;
        if (rough || sliding) {
          const back = { x: -fwd.x * spec.wheelRadius * 2.2, z: -fwd.z * spec.wheelRadius * 2.2 };
          const color = surface === 'water' ? 0xeaf7f5 : surface === 'gravel' ? 0xb9a98b : C.COLORS.sand;
          world.particles.spawn(
            this.pos.x + back.x, this.pos.y - spec.wheelRadius * 0.5, this.pos.z + back.z,
            sliding ? 4 : 3, color, rough ? 0.8 + speedAbs * 0.018 : 0.7
          );
          this.dustTimer = 0.045;
        }
      }

      this.syncMesh(dt, input, speedAbs, surface);
      return surface;
    }

    handleCollisions(world, impact, surface) {
      if (!world) return;
      const r = this.spec.radius;
      const obstacles = world.obstacles;
      for (let i = 0; i < obstacles.length; i++) {
        const o = obstacles[i];
        const dx = this.pos.x - o.x, dz = this.pos.z - o.z;
        const minD = o.r + r;
        const d2 = dx * dx + dz * dz;
        if (d2 >= minD * minD) continue;
        const d = Math.sqrt(d2) || 0.001;
        const nx = dx / d, nz = dz / d;
        this.pos.x = o.x + nx * minD;
        this.pos.z = o.z + nz * minD;
        const loss = this.key === 'motorcycle' ? 0.28 : 0.5;
        this.speed *= loss;
        this.latVel *= 0.3;
        if (this.key === 'motorcycle' && impact > 21) this.needReset = true;
        if (world.particles && impact > 8) {
          world.particles.spawn(this.pos.x - nx * 0.5, this.pos.y + 0.2, this.pos.z - nz * 0.5, 6, 0xd8c9a5, 0.8);
        }
      }

      const props = world.destructibles;
      for (let i = 0; i < props.length; i++) {
        const p = props[i];
        if (!p.alive) continue;
        const dx = this.pos.x - p.x, dz = this.pos.z - p.z;
        const minD = p.r + r;
        if (dx * dx + dz * dz >= minD * minD) continue;
        const d = Math.hypot(dx, dz) || 0.001;
        world.knockDown(p, -dx / d, -dz / d, U.clamp(impact / 14, 0.4, 1.4));
        if (this.spec.bulldoze) this.speed *= 0.94;
        else if (this.key === 'motorcycle') this.speed *= 0.6;
        else this.speed *= 0.78;
      }
    }

    syncMesh(dt, input, speedAbs, surface) {
      const spec = this.spec;
      this.bob += dt * (7 + (speedAbs || 0) * 0.5);
      const bounce = this.airborne ? 0 : Math.sin(this.bob) * 0.055 * spec.suspension * U.clamp((speedAbs || 0) / 12, 0, 1) *
        (surface === 'sand' || surface === 'grass' ? 2.2 : 1);
      this.group.position.set(this.pos.x, this.pos.y + bounce, this.pos.z);
      this.group.rotation.y = this.heading;
      const leanTarget = -(this.steerSmoothed || 0) * spec.lean * U.clamp((speedAbs || 0) / 16, 0, 1);
      this.tilt.rotation.z = U.damp(this.tilt.rotation.z, leanTarget, 8, dt);
      const pitch = input && input.throttle < 0 ? 0.04 : input && input.throttle > 0 ? -0.025 : 0;
      this.tilt.rotation.x = U.damp(this.tilt.rotation.x, pitch, 6, dt);
      const spin = ((speedAbs || 0) / spec.wheelRadius) * dt;
      for (let i = 0; i < this.wheels.length; i++) this.wheels[i].rotation.y += spin;
      const braking = (input && input.throttle < 0) || (input && input.handbrake);
      this.brakeMat.emissive.setHex(braking ? 0xff2a14 : 0x000000);
      this.brakeMat.emissiveIntensity = braking ? 1.6 : 0;
      if (this.crashFlash > 0) this.crashFlash = Math.max(0, this.crashFlash - dt);
    }
  }

  CC.Vehicle = Vehicle;
})();
