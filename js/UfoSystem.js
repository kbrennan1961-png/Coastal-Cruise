/* Coastal Cruise - a squadron of three low-flying triangular craft.
   Everything is generated in code, so the squadron works from file:// with no
   downloaded assets. The craft drift over the map, abduct people and animals,
   strike harbour infrastructure, and climb away when attacked. */
(function () {
  'use strict';

  const CC = window.CC;
  const U = CC.util;
  const rng = CC.rng ? CC.rng(20261121) : Math.random;

  const FORMATION = [
    { x: 0, z: 0 },
    { x: -36, z: 30 },
    { x: 36, z: 30 }
  ];
  const PATROL = [
    { x: -330, z: -230 },
    { x: -120, z: -310 },
    { x: 150, z: -280 },
    { x: 340, z: -120 },
    { x: 330, z: 170 },
    { x: 110, z: 305 },
    { x: -170, z: 265 },
    { x: -350, z: 60 }
  ];

  let scene = null;
  let effects = null;
  let bodyGeo = null;
  let flagTex = null;
  let glowTex = null;
  const up = new THREE.Vector3(0, 1, 0);

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function rand(a, b) { return a + (b - a) * rng(); }
  function angleDelta(target, current) {
    let d = target - current;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  function glowTexture() {
    if (glowTex) return glowTex;
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 1, 32, 32, 31);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.22, 'rgba(255,255,255,0.72)');
    grad.addColorStop(0.55, 'rgba(255,255,255,0.18)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    glowTex = new THREE.CanvasTexture(c);
    if (THREE.SRGBColorSpace) glowTex.colorSpace = THREE.SRGBColorSpace;
    return glowTex;
  }

  function glowSprite(color, size) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color: color, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false
    }));
    s.scale.set(size, size, 1);
    return s;
  }

  // Simplified national flag of Iran: green/white/red bands, repeated Takbir
  // strokes along the white band and a red central emblem.
  function iranFlagTexture() {
    if (flagTex) return flagTex;
    const c = document.createElement('canvas');
    c.width = 256; c.height = 144;
    const g = c.getContext('2d');
    const band = 48;
    g.fillStyle = '#239f4a'; g.fillRect(0, 0, 256, band);
    g.fillStyle = '#ffffff'; g.fillRect(0, band, 256, band);
    g.fillStyle = '#da0000'; g.fillRect(0, band * 2, 256, band);
    g.strokeStyle = '#da0000'; g.lineWidth = 3; g.strokeRect(0.5, 0.5, 255, 143);

    g.fillStyle = '#da0000';
    for (let side = 0; side < 2; side++) {
      const y = band + 5 + side * 33;
      for (let i = 0; i < 11; i++) {
        const x = 8 + i * 23;
        g.fillRect(x, y, 4, 9);
        g.fillRect(x + 4, y + 7, 8, 3);
        g.fillRect(x + 12, y - 2, 4, 11);
        g.fillRect(x + 16, y + 3, 4, 6);
      }
    }
    g.save();
    g.translate(128, band + band * 0.5);
    g.fillStyle = '#da0000';
    g.beginPath(); g.arc(0, 0, 18, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(0, 0, 12, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#da0000';
    g.beginPath();
    g.moveTo(0, -15); g.bezierCurveTo(-9, -5, -7, 8, 0, 16);
    g.bezierCurveTo(7, 8, 9, -5, 0, -15); g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(0, -9); g.bezierCurveTo(-4, -2, -3, 5, 0, 10);
    g.bezierCurveTo(3, 5, 4, -2, 0, -9); g.fill();
    g.fillRect(-2, 10, 4, 13);
    g.restore();

    flagTex = new THREE.CanvasTexture(c);
    if (THREE.SRGBColorSpace) flagTex.colorSpace = THREE.SRGBColorSpace;
    return flagTex;
  }

  // Flat triangular prism: nose at local +Z, port corner -X, starboard +X.
  function triangleBodyGeometry() {
    const top = 0.85, bottom = -0.85;
    const nose = [0, top, 14], left = [-12, top, -9], right = [12, top, -9];
    const noseB = [0, bottom, 14], leftB = [-12, bottom, -9], rightB = [12, bottom, -9];
    const verts = [];
    function tri(a, b, c) { verts.push.apply(verts, a); verts.push.apply(verts, b); verts.push.apply(verts, c); }
    tri(nose, left, right);
    tri(noseB, rightB, leftB);
    tri(nose, noseB, leftB); tri(nose, leftB, left);
    tri(nose, right, rightB); tri(nose, rightB, noseB);
    tri(left, leftB, rightB); tri(left, rightB, right);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.computeVertexNormals();
    return geo;
  }

  class Ufo {
    constructor(index) {
      this.index = index;
      this.pos = new THREE.Vector3();
      this.heading = 0;
      this.bank = 0;
      this.radius = 13;
      this.state = 'hidden';
      this.actionTimer = rand(8, 18) + index * 3;
      this.searchTimer = rand(2, 8) + index * 1.5;
      this.pathIndex = 0;
      this.phase = rng() * Math.PI * 2;
      this.ascent = 0;
      this.departure = 0;
      this.beam = null;
      this.group = new THREE.Group();
      this.group.name = 'TR3B-' + (index + 1);
      this.group.visible = false;
      this.build();
    }

    build() {
      const bodyMat = new THREE.MeshPhongMaterial({
        color: 0x1d2730, specular: 0x8fa6b5, shininess: 76,
        flatShading: true, side: THREE.DoubleSide
      });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.castShadow = false;
      this.group.add(body);

      const bellyMat = new THREE.MeshPhongMaterial({
        color: 0x0d141a, specular: 0x536a78, shininess: 50, flatShading: true
      });
      const belly = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 5.5, 0.55, 18), bellyMat);
      belly.position.y = -1.08;
      this.group.add(belly);

      const rimMat = new THREE.MeshBasicMaterial({
        color: 0x5fd0ff, transparent: true, opacity: 0.5,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false
      });
      const rim = new THREE.Mesh(new THREE.TorusGeometry(5.2, 0.18, 6, 28), rimMat);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = -1.45;
      this.group.add(rim);
      this.rimMat = rimMat;

      this.navLights = [];
      const addNav = function (x, z, color, size) {
        const mat = new THREE.MeshBasicMaterial({
          color: color, transparent: true, opacity: 1, fog: false
        });
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.65, 8, 6), mat);
        bulb.position.set(x, 0.75, z);
        this.group.add(bulb);
        const glow = glowSprite(color, size);
        glow.position.copy(bulb.position);
        this.group.add(glow);
        this.navLights.push({ mat: mat, glow: glow, color: color, nose: z > 10 });
      }.bind(this);
      addNav(-12, -9, 0xff2f2f, 7);   // port / left
      addNav(12, -9, 0x38ff67, 7);    // starboard / right
      addNav(0, 14, 0xffffff, 9);      // flashing nose

      this.blueLights = [];
      // One pivot at the centre carries all three lamps, so spinning it sweeps
      // the blue spots around the belly instead of merely rotating each bulb.
      const blueSpots = [{ x: -4.2, z: -3.2 }, { x: 4.2, z: -3.2 }, { x: 0, z: 5 }];
      const bluePivot = new THREE.Group();
      bluePivot.position.set(0, -1.5, 0);
      this.group.add(bluePivot);
      this.bluePivot = bluePivot;
      for (let i = 0; i < blueSpots.length; i++) {
        const spot = blueSpots[i];
        const mat = new THREE.MeshBasicMaterial({
          color: 0x3b7bff, transparent: true, opacity: 1, fog: false
        });
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), mat);
        bulb.position.set(spot.x, 0, spot.z);
        bluePivot.add(bulb);
        const glow = glowSprite(0x4f8bff, 6);
        glow.position.set(spot.x, -0.2, spot.z);
        bluePivot.add(glow);
        const coneMat = new THREE.MeshBasicMaterial({
          color: 0x337bff, transparent: true, opacity: 0.2,
          blending: THREE.AdditiveBlending, depthWrite: false,
          side: THREE.DoubleSide, fog: false
        });
        const cone = new THREE.Mesh(new THREE.ConeGeometry(1.35, 8, 10, 1, true), coneMat);
        cone.position.set(spot.x, -4, spot.z);
        bluePivot.add(cone);
        this.blueLights.push({
          pivot: bluePivot, cone: cone, spot: spot,
          mat: mat, glow: glow, coneMat: coneMat,
          offset: i * Math.PI * 2 / 3
        });
      }
      this.bluePoint = new THREE.PointLight(0x2f6bff, 2.4, 55, 2);
      this.bluePoint.position.set(0, -2.2, 0);
      this.group.add(this.bluePoint);

      const flagMat = new THREE.MeshBasicMaterial({
        map: iranFlagTexture(), side: THREE.DoubleSide, fog: false
      });
      const topFlag = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 3.6), flagMat);
      topFlag.rotation.x = -Math.PI / 2;
      topFlag.position.set(0, 0.92, -2.4);
      this.group.add(topFlag);
      const rearFlag = new THREE.Mesh(new THREE.PlaneGeometry(7, 3.9), flagMat);
      rearFlag.position.set(0, 0.55, -9.12);
      rearFlag.rotation.y = Math.PI;
      this.group.add(rearFlag);
      this.flag = topFlag;
      this.flagMaterial = flagMat;
    }

    setPose(x, y, z, heading) {
      this.pos.set(x, y, z);
      this.heading = heading || 0;
      this.group.position.copy(this.pos);
      this.group.rotation.set(0, this.heading, 0);
    }

    animateLights(time) {
      for (let i = 0; i < this.navLights.length; i++) {
        const l = this.navLights[i];
        const pulse = l.nose
          ? (Math.sin(time * 12 + this.phase) > 0.15 ? 1 : 0.12)
          : 0.78 + 0.22 * (0.5 + 0.5 * Math.sin(time * 4 + this.phase + i));
        l.mat.opacity = pulse;
        l.glow.material.opacity = pulse * 0.95;
      }
      // Sweep the whole three-lamp rig around the belly.
      if (this.bluePivot) this.bluePivot.rotation.y = time * 3.4 + this.phase;
      for (let i = 0; i < this.blueLights.length; i++) {
        const b = this.blueLights[i];
        const beat = 0.55 + 0.45 * Math.sin(time * 6 + b.offset);
        // Fan the little under-lights outward and nod them as the rig turns so
        // they read as searchlights feeling across the ground.
        b.cone.rotation.x = (b.spot.z > 0 ? 0.2 : -0.16) +
          0.3 * Math.sin(time * 2.1 + b.offset);
        b.cone.rotation.z = (b.spot.x > 0 ? 0.22 : -0.22) +
          0.28 * Math.cos(time * 1.7 + b.offset);
        b.mat.opacity = 0.7 + 0.3 * beat;
        b.glow.material.opacity = 0.65 + 0.35 * beat;
        b.coneMat.opacity = 0.12 + 0.16 * beat;
      }
      this.bluePoint.intensity = 1.8 + 1.2 * (0.5 + 0.5 * Math.sin(time * 6 + this.phase));
      this.rimMat.opacity = 0.35 + 0.25 * (0.5 + 0.5 * Math.sin(time * 3 + this.phase));
    }

    moveToward(target, dt) {
      if (!target) return;
      const dx = target.x - this.pos.x;
      const dz = target.z - this.pos.z;
      const dy = target.y - this.pos.y;
      const desired = Math.atan2(dx, dz);
      const diff = angleDelta(desired, this.heading);
      this.heading += clamp(diff, -1.35 * dt, 1.35 * dt);
      const speed = this.index === 0 ? 26 : 30;
      this.pos.x += Math.sin(this.heading) * speed * dt;
      this.pos.z += Math.cos(this.heading) * speed * dt;
      this.pos.y += clamp(dy, -18 * dt, 18 * dt);
      const wantedBank = clamp(-diff * 1.6, -0.55, 0.55);
      this.bank += (wantedBank - this.bank) * (1 - Math.exp(-4 * dt));
      this.group.position.copy(this.pos);
      this.group.rotation.set(clamp(-dy * 0.004, -0.12, 0.12), this.heading, this.bank);
    }

    createBeamMeshes(width) {
      const w = width == null ? 1 : width;
      const outerMat = new THREE.MeshBasicMaterial({
        color: 0xf4fbff, transparent: true, opacity: 0.6,
        blending: THREE.AdditiveBlending, depthWrite: false,
        side: THREE.DoubleSide, fog: false
      });
      const coreMat = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.95,
        blending: THREE.AdditiveBlending, depthWrite: false,
        side: THREE.DoubleSide, fog: false
      });
      const outer = new THREE.Mesh(
        new THREE.CylinderGeometry(3.2 * w, 0.3 * w, 1, 14, 1, true), outerMat);
      const core = new THREE.Mesh(
        new THREE.CylinderGeometry(1.1 * w, 0.14 * w, 1, 10, 1, true), coreMat);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.85,
        blending: THREE.AdditiveBlending, depthWrite: false,
        side: THREE.DoubleSide, fog: false
      });
      const ring = new THREE.Mesh(new THREE.RingGeometry(1, 1.45, 28), ringMat);
      ring.rotation.x = -Math.PI / 2;
      const light = new THREE.PointLight(0xffffff, 9, 100, 2);
      effects.add(outer); effects.add(core); effects.add(ring); effects.add(light);
      return {
        outer: outer, core: core, ring: ring, light: light,
        outerMat: outerMat, coreMat: coreMat, ringMat: ringMat
      };
    }

    setBeamVisible(b, visible) {
      b.outer.visible = visible;
      b.core.visible = visible;
      b.ring.visible = visible;
      b.light.visible = visible;
    }

    // A wide, flickering searchlight that wanders over the ground looking for
    // somebody to snatch. It only stays locked once it finds a target.
    startSearch() {
      if (this.beam || !effects || this.state !== 'cruise') return false;
      const dest = new THREE.Vector3(
        this.pos.x + rand(-40, 40), 0, this.pos.z + rand(-40, 40));
      dest.y = CC.heightAt(dest.x, dest.z);
      const parts = this.createBeamMeshes(0.7);
      this.beam = Object.assign({
        mode: 'search', target: null, name: 'SEARCH', dest: dest,
        t: 0, duration: rand(10, 16), phase: rng() * Math.PI * 2,
        sweepRadius: rand(36, 62), sweepSpeed: rand(0.42, 0.78),
        onWindow: 1.3, offWindow: 0.55, acquire: 0, lit: false,
        finished: false
      }, parts);
      return true;
    }

    armAbduction(b, entity) {
      b.mode = 'abduct';
      b.target = entity;
      b.name = 'ABDUCTION';
      b.restore = entity.position.clone();
      b.liftFrom = b.restore.y;
      b.liftTo = this.pos.y - 3.2;
      b.t = 0;
      b.duration = 3.8;
      b.finished = false;
      b.lit = true;
      entity.abducted = true;
      if (entity.group) entity.group.visible = true;
      this.setBeamVisible(b, true);
    }

    startBeam(target, mode, name) {
      if (this.beam || !effects || this.state !== 'cruise') return false;
      const strike = mode === 'strike';
      if (!target || target.position == null &&
          (target.x == null || target.z == null)) return false;
      const px = target.x != null ? target.x : target.position.x;
      const pz = target.z != null ? target.z : target.position.z;
      const dest = new THREE.Vector3(px, 0, pz);
      dest.y = strike || !target.position
        ? CC.heightAt(px, pz) : target.position.y;
      const parts = this.createBeamMeshes(1);
      this.beam = Object.assign({
        target: target, mode: mode, name: name || '', dest: dest,
        t: 0, duration: strike ? 1.35 : 3.8,
        phase: rng() * Math.PI * 2, lit: true, finished: false
      }, parts);
      if (mode === 'abduct' && target.position) this.armAbduction(this.beam, target);
      return true;
    }

    beginAbduction(entity, name) {
      if (!entity || !entity.position || !this.startBeam(entity, 'abduct', name)) return false;
      return true;
    }

    placeBeam(b, time, strength) {
      const from = this.pos.clone().add(new THREE.Vector3(0, -1.6, 0));
      const dir = b.dest.clone().sub(from);
      const len = Math.max(1, dir.length());
      dir.normalize();
      const mid = from.clone().addScaledVector(dir, len * 0.5);
      const q = new THREE.Quaternion().setFromUnitVectors(up, dir);
      b.outer.position.copy(mid);
      b.core.position.copy(mid);
      b.outer.quaternion.copy(q);
      b.core.quaternion.copy(q);
      b.outer.scale.set(1, len, 1);
      b.core.scale.set(1, len, 1);
      b.ring.position.set(b.dest.x, b.dest.y + 0.25, b.dest.z);
      b.ring.scale.setScalar(1 + 0.35 * Math.sin(time * 18 + b.phase));
      b.light.position.copy(mid);
      const flash = Math.abs(Math.sin(time * 17 + b.phase));
      b.outerMat.opacity = (0.28 + 0.55 * flash) * strength;
      b.coreMat.opacity = (0.55 + 0.45 * flash) * strength;
      b.ringMat.opacity = (0.45 + 0.5 * flash) * strength;
      b.light.intensity = (5 + 10 * flash) * strength;
    }

    updateBeam(dt, time) {
      const b = this.beam;
      if (!b) return;
      b.t += dt;

      if (b.mode === 'search') {
        const cycle = b.onWindow + b.offWindow;
        const lit = (b.t % cycle) < b.onWindow;
        if (lit !== b.lit) {
          b.lit = lit;
          this.setBeamVisible(b, lit);
        }
        if (lit) {
          // Sweep the ground in a slow ellipse with a small wobble, like a
          // searchlight feeling across fields and rooftops.
          const a = time * b.sweepSpeed + b.phase;
          b.dest.x = this.pos.x + Math.cos(a) * b.sweepRadius +
            Math.sin(a * 2.3) * 9;
          b.dest.z = this.pos.z + Math.sin(a) * b.sweepRadius +
            Math.cos(a * 1.7) * 7;
          b.dest.y = CC.heightAt(b.dest.x, b.dest.z);
          b.acquire -= dt;
          if (b.acquire <= 0) {
            b.acquire = 0.26;
            const found = UFOSystem.pickAbductionTarget(this, b.dest, 15);
            if (found) {
              this.armAbduction(b, found);
              return;
            }
          }
          this.placeBeam(b, time, 1);
        }
        if (b.t >= b.duration) this.finishBeam();
        return;
      }

      if (b.mode === 'abduct' && b.target && b.target.position && b.restore) {
        const k = clamp(b.t / b.duration, 0, 1);
        const ease = k * k * (3 - 2 * k);
        const t = b.target;
        t.position.x = b.restore.x + (this.pos.x - b.restore.x) * ease * 0.82;
        t.position.z = b.restore.z + (this.pos.z - b.restore.z) * ease * 0.82;
        t.position.y = b.liftFrom + (b.liftTo - b.liftFrom) * ease;
        if (t.group) {
          t.group.position.copy(t.position);
          t.group.rotation.y += 0.08;
        }
        b.dest.copy(t.position);
      }
      this.setBeamVisible(b, true);
      this.placeBeam(b, time, 1);
      if (b.t >= b.duration) this.finishBeam();
    }

    finishBeam() {
      const b = this.beam;
      if (!b) return;
      if (b.mode === 'abduct' && b.target && b.restore) {
        const entity = b.target;
        if (entity.group) entity.group.visible = false;
        entity.abducted = true;
        b.finished = true;
        UFOSystem.abductions++;
        UFOSystem.abducted.push({
          entity: entity, pos: b.restore.clone(), timer: rand(70, 110)
        });
        if (CC.Game && CC.Game.showMessage) {
          CC.Game.showMessage('A UFO Took Someone', 3.2);
        }
      } else if (b.mode === 'strike') {
        if (CC.World && CC.World.createExplosion) {
          CC.World.createExplosion(b.dest.x, b.dest.z, {
            y: b.dest.y + 1, scale: 1.9, duration: 26
          });
        }
        UFOSystem.infrastructureHits++;
        if (CC.Game && CC.Game.showMessage) {
          CC.Game.showMessage('UFO STRIKE — ' + b.name.toUpperCase(), 3.4);
        }
      }
      this.clearBeam();
    }

    clearBeam() {
      const b = this.beam;
      if (!b || !effects) { this.beam = null; return; }
      // If a shot interrupts the tractor beam, put the victim back before the
      // craft climbs away. A completed abduction keeps them hidden for respawn.
      if (b.mode === 'abduct' && !b.finished && b.target && b.restore) {
        b.target.position.copy(b.restore);
        b.target.abducted = false;
        if (b.target.group) {
          b.target.group.position.copy(b.restore);
          b.target.group.visible = true;
        }
      }
      effects.remove(b.outer); effects.remove(b.core);
      effects.remove(b.ring); effects.remove(b.light);
      b.outer.geometry.dispose(); b.outerMat.dispose();
      b.core.geometry.dispose(); b.coreMat.dispose();
      b.ring.geometry.dispose(); b.ringMat.dispose();
      this.beam = null;
    }

    hit() {
      if (this.state !== 'cruise') return false;
      this.clearBeam();
      this.state = 'ascending';
      this.ascent = 0;
      return true;
    }

    shootDown() { return this.hit(); }

    vanish() {
      this.state = 'gone';
      this.group.visible = false;
      this.clearBeam();
      UFOSystem.spawnFlash(this.pos);
    }

    update(dt, time, target) {
      if (this.state === 'hidden' || this.state === 'gone') return;
      this.animateLights(time);
      if (this.state === 'ascending') {
        this.ascent += dt;
        this.pos.y += 125 * dt;
        this.pos.x += Math.sin(this.heading) * 6 * dt;
        this.pos.z += Math.cos(this.heading) * 6 * dt;
        this.group.position.copy(this.pos);
        this.group.rotation.set(0, this.heading, 0);
        if (this.ascent > 4.5 || this.pos.y > 820) this.vanish();
        return;
      }
      if (this.state === 'departing') {
        this.departure += dt;
        this.pos.y += 34 * dt;
        this.pos.x += Math.sin(this.heading) * 30 * dt;
        this.pos.z += Math.cos(this.heading) * 30 * dt;
        this.group.position.copy(this.pos);
        if (this.departure > 4) {
          this.state = 'gone';
          this.group.visible = false;
        }
        return;
      }
      this.moveToward(target, dt);
      if (!this.beam) {
        this.searchTimer -= dt;
        if (this.searchTimer <= 0) {
          this.startSearch();
          this.searchTimer = rand(6, 12);
        }
      }
      this.updateBeam(dt, time);
    }
  }

  const UFOSystem = {
    ready: false,
    ufos: [],
    active: false,
    nextArrival: 20,
    activeTimer: 0,
    idleTimer: 0,
    abductions: 0,
    infrastructureHits: 0,
    flashes: 0,
    abducted: [],
    activeFlashes: [],
    lastStrike: '',

    init: function (gameScene) {
      if (this.ready) return;
      scene = gameScene;
      if (!scene) return;
      effects = new THREE.Group();
      effects.name = 'UFO effects';
      scene.add(effects);
      bodyGeo = triangleBodyGeometry();
      this.ufos = [new Ufo(0), new Ufo(1), new Ufo(2)];
      for (let i = 0; i < this.ufos.length; i++) scene.add(this.ufos[i].group);
      this.ready = true;
    },

    activate: function () {
      if (!this.ready) return false;
      const leader = this.ufos[0];
      const start = PATROL[0];
      leader.pathIndex = 1;
      leader.setPose(start.x, 108, start.z,
        Math.atan2(PATROL[1].x - start.x, PATROL[1].z - start.z));
      leader.state = 'cruise';
      leader.group.visible = true;
      leader.actionTimer = rand(7, 13);
      for (let i = 1; i < this.ufos.length; i++) {
        const u = this.ufos[i];
        const o = FORMATION[i];
        u.setPose(leader.pos.x + o.x, leader.pos.y, leader.pos.z + o.z, leader.heading);
        u.pathIndex = leader.pathIndex;
        u.state = 'cruise';
        u.group.visible = true;
        u.actionTimer = rand(12, 24);
      }
      this.active = true;
      this.activeTimer = rand(95, 145);
      if (CC.Game && CC.Game.showMessage) {
        CC.Game.showMessage('RADAR CONTACT — THREE UNIDENTIFIED CRAFT', 3.4);
      }
      return true;
    },

    deactivate: function () {
      if (!this.active) return;
      for (let i = 0; i < this.ufos.length; i++) {
        const u = this.ufos[i];
        u.clearBeam();
        if (u.state === 'cruise') u.state = 'departing';
        u.departure = 0;
      }
      this.active = false;
      this.idleTimer = rand(70, 120);
    },

    activeBeams: function () {
      let n = 0;
      for (let i = 0; i < this.ufos.length; i++) if (this.ufos[i].beam) n++;
      return n;
    },

    harborSites: function () {
      const zones = (CC.ImageMap && CC.ImageMap.zones) || {};
      const sites = [];
      const add = function (name, zone) {
        if (zone && typeof zone.x === 'number' && typeof zone.z === 'number') {
          sites.push({ name: name, x: zone.x, z: zone.z });
        }
      };
      add('Boatyard', zones.boatyard);
      add('Beacon Seafood', zones.beaconSeafood);
      add('Power station', zones.powerStation);
      if (CC.Details && CC.Details.marina) {
        add('Marina', CC.Details.marina);
      }
      (CC.World && CC.World.imageLandmarks || []).forEach(function (l) {
        if (/harbor|boat|launch|marina/i.test(l.name || l.text || '')) {
          sites.push({ name: String(l.name || l.text || 'Harbour facility'), x: l.x, z: l.z });
        }
      });
      if (!sites.length) sites.push({ name: 'Harbour', x: -300, z: 20 });
      return sites;
    },

    pickAbductionTarget: function (ufo, point, radius) {
      const N = CC.NPCSystem || {};
      const lists = [
        N.pedestrians || [], N.dogs || [], N.critters || [],
        N.birds || [], N.ducks || [], N.alligators || []
      ];
      let best = null, bestD = radius || 105;
      const cx = point ? point.x : ufo.pos.x;
      const cz = point ? point.z : ufo.pos.z;
      for (let g = 0; g < lists.length; g++) {
        const list = lists[g];
        for (let i = 0; i < list.length; i++) {
          const e = list[i];
          if (!e || e.abducted || e.disabled || e.dead || !e.position) continue;
          if (!e.group || !e.group.visible) continue;
          if (e.position.y > ufo.pos.y - 18) continue;
          const d = U.distance2D(cx, cz, e.position.x, e.position.z);
          if (d < bestD) { bestD = d; best = e; }
        }
      }
      return best;
    },

    forceAbduction: function (index, target) {
      if (!this.ready) return false;
      const u = this.ufos[clamp(index | 0, 0, this.ufos.length - 1)];
      if (!u) return false;
      if (u.state === 'hidden' || u.state === 'gone') this.activate();
      if (u.state !== 'cruise') return false;
      const e = target || this.pickAbductionTarget(u);
      if (!e) return false;
      u.clearBeam();
      return u.beginAbduction(e, 'ABDUCTION');
    },

    forceStrike: function (index, site) {
      if (!this.ready) return false;
      const u = this.ufos[clamp(index | 0, 0, this.ufos.length - 1)];
      if (!u) return false;
      if (u.state === 'hidden' || u.state === 'gone') this.activate();
      if (u.state !== 'cruise') return false;
      const sites = this.harborSites();
      let target = site;
      if (!target) {
        for (let i = 0; i < 12 && !target; i++) {
          const pick = sites[Math.floor(rng() * sites.length)];
          if (pick.name !== this.lastStrike || sites.length === 1) target = pick;
        }
        target = target || sites[0];
      }
      u.clearBeam();
      this.lastStrike = target.name;
      return u.startBeam(target, 'strike', target.name);
    },

    hit: function (index) {
      if (!this.ready) return false;
      const u = this.ufos[clamp(index | 0, 0, this.ufos.length - 1)];
      return !!(u && u.hit());
    },

    spawnFlash: function (position) {
      if (!effects) return;
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 1,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false
      });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), mat);
      mesh.position.copy(position);
      effects.add(mesh);
      const light = new THREE.PointLight(0xeaf7ff, 42, 250, 2);
      light.position.copy(position);
      effects.add(light);
      if (CC.World && CC.World.particles) {
        CC.World.particles.spawn(position.x, position.y, position.z, 54, 0xffffff, 3.1);
      }
      this.flashes++;
      this.activeFlashes.push({ mesh: mesh, mat: mat, light: light, t: 0, duration: 0.85 });
    },

    updateFlashes: function (dt) {
      for (let i = this.activeFlashes.length - 1; i >= 0; i--) {
        const f = this.activeFlashes[i];
        f.t += dt;
        const k = clamp(f.t / f.duration, 0, 1);
        f.mesh.scale.setScalar(1 + k * 22);
        f.mat.opacity = 1 - k;
        f.light.intensity = 42 * (1 - k);
        if (k >= 1) {
          effects.remove(f.mesh); effects.remove(f.light);
          f.mesh.geometry.dispose(); f.mat.dispose();
          this.activeFlashes.splice(i, 1);
        }
      }
    },

    updateRespawns: function (dt) {
      for (let i = this.abducted.length - 1; i >= 0; i--) {
        const a = this.abducted[i];
        a.timer -= dt;
        if (a.timer > 0) continue;
        if (a.entity && a.entity.group && a.entity.position) {
          a.entity.position.copy(a.pos);
          a.entity.group.position.copy(a.pos);
          a.entity.group.visible = true;
          a.entity.abducted = false;
        }
        this.abducted.splice(i, 1);
      }
    },

    update: function (dt, time) {
      if (!this.ready || !effects) return;
      this.updateFlashes(dt);
      this.updateRespawns(dt);

      if (!this.active) {
        this.nextArrival -= dt;
        if (this.nextArrival <= 0) this.activate();
      } else {
        this.activeTimer -= dt;
        if (this.activeTimer <= 0) this.deactivate();
      }

      let cruising = 0;
      for (let i = 0; i < this.ufos.length; i++) {
        if (this.ufos[i].state === 'cruise') cruising++;
      }
      if (this.active && cruising === 0 && this.activeTimer > 0) {
        this.active = false;
        this.idleTimer = Math.min(this.idleTimer || 60, 60);
      }
      if (!this.active && this.idleTimer > 0) {
        this.idleTimer -= dt;
        if (this.idleTimer <= 0) this.nextArrival = 0;
      }

      const leader = this.ufos[0];
      if (leader.state === 'cruise') {
        const dest = PATROL[leader.pathIndex];
        if (dest) {
          if (U.distance2D(leader.pos.x, leader.pos.z, dest.x, dest.z) < 38) {
            leader.pathIndex = (leader.pathIndex + 1) % PATROL.length;
          }
          const next = PATROL[leader.pathIndex];
          leader._target = {
            x: next.x, z: next.z,
            y: 106 + Math.sin(time * 0.18) * 12
          };
        }
      }
      for (let i = 0; i < this.ufos.length; i++) {
        const u = this.ufos[i];
        let target = u._target;
        if (i > 0 && leader.state === 'cruise' && u.state === 'cruise') {
          const o = FORMATION[i];
          const c = Math.cos(leader.heading), s = Math.sin(leader.heading);
          target = {
            x: leader.pos.x + o.x * c + o.z * s,
            z: leader.pos.z - o.x * s + o.z * c,
            y: leader.pos.y + Math.sin(time * 0.5 + i) * 4
          };
        }
        u.update(dt, time, target);
      }

      if (!this.active || this.activeBeams() >= 2) return;
      for (let i = 0; i < this.ufos.length; i++) {
        const u = this.ufos[i];
        if (u.state !== 'cruise' || u.beam) continue;
        u.actionTimer -= dt;
        if (u.actionTimer > 0) continue;
        if (rng() < 0.34) {
          this.forceStrike(i);
          u.actionTimer = rand(36, 62);
        } else {
          this.forceAbduction(i);
          u.actionTimer = rand(17, 32);
        }
      }
    }
  };

  CC.UFOSystem = UFOSystem;
})();
