/* Coastal Cruise - drifting clouds, storms, rain, lightning and day/night light. */
(function () {
  'use strict';

  const CC = window.CC;
  const U = CC.util;

  // t, sky, fog, hemisphere, sun. Colours are 0xRRGGBB.
  const PALETTE = [
    { t: 0.00, sky: 0x0a1424, fog: 0x101e30, hemi: 0.16, sun: 0.00 },
    { t: 0.20, sky: 0x7d7fa8, fog: 0x9b8fa0, hemi: 0.40, sun: 0.25 },
    { t: 0.27, sky: 0xf0a878, fog: 0xe3b18d, hemi: 0.62, sun: 0.85 },
    { t: 0.36, sky: 0x9fd9ef, fog: 0xf3d8ae, hemi: 0.90, sun: 1.75 },
    { t: 0.55, sky: 0x74c8f0, fog: 0xd8e6d9, hemi: 1.00, sun: 2.10 },
    { t: 0.72, sky: 0xf2ad74, fog: 0xe3aa82, hemi: 0.68, sun: 1.10 },
    { t: 0.80, sky: 0x8c6f8f, fog: 0x8f7b8c, hemi: 0.38, sun: 0.20 },
    { t: 0.88, sky: 0x0a1424, fog: 0x101e30, hemi: 0.16, sun: 0.00 },
    { t: 1.00, sky: 0x0a1424, fog: 0x101e30, hemi: 0.16, sun: 0.00 }
  ];

  const UP = new THREE.Vector3(0, 1, 0);
  const A = new THREE.Vector3();
  const B = new THREE.Vector3();
  const DIR = new THREE.Vector3();

  function lerpColor(a, b, t) {
    const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
    const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
    return [
      (ar + (br - ar) * t) / 255,
      (ag + (bg - ag) * t) / 255,
      (ab + (bb - ab) * t) / 255
    ];
  }

  function placeBeam(mesh, a, b, radius) {
    DIR.subVectors(b, a);
    const len = DIR.length() || 0.001;
    mesh.position.copy(a).addScaledVector(DIR, 0.5);
    mesh.scale.set(radius, len, radius);
    DIR.multiplyScalar(1 / len);
    mesh.quaternion.setFromUnitVectors(UP, DIR);
  }

  function writeRainLine(array, i, drop, windX, windZ) {
    const dx = windX * 0.85, dy = -1, dz = windZ * 0.85;
    const len = Math.hypot(dx, dy, dz) || 1;
    const o = i * 6;
    array[o] = drop.x;
    array[o + 1] = drop.y;
    array[o + 2] = drop.z;
    array[o + 3] = drop.x - dx / len * drop.len;
    array[o + 4] = drop.y - dy / len * drop.len;
    array[o + 5] = drop.z - dz / len * drop.len;
  }

  const Weather = (CC.Weather = {
    ready: false,
    timeOfDay: 0.34,          // 0 = midnight, 0.5 = noon
    dayLength: 480,           // seconds for a full day/night cycle
    weather: 'clear',
    rain: 0,
    rainTarget: 0,
    weatherTimer: 70,
    flash: 0,
    night: 0,
    wind: 0,
    windX: 0,
    windZ: 0,
    lightningStrikes: 0,

    init(scene, sun, hemi) {
      if (this.ready) return;
      this.scene = scene;
      this.sun = sun;
      this.hemi = hemi;
      this.sky = scene.background;
      this.fog = scene.fog;

      // Warm sun disc and cool moon; both orbit the player's position.
      this.sunDisc = new THREE.Mesh(
        new THREE.SphereGeometry(15, 12, 10),
        new THREE.MeshBasicMaterial({ color: 0xfff2c2, fog: false })
      );
      this.moonDisc = new THREE.Mesh(
        new THREE.SphereGeometry(11, 12, 10),
        new THREE.MeshBasicMaterial({ color: 0xe8f1ff, fog: false })
      );
      scene.add(this.sunDisc, this.moonDisc);

      this.moonLight = new THREE.DirectionalLight(0x9fc6ff, 0);
      this.moonLight.target = sun.target;
      scene.add(this.moonLight);

      // Stars (only visible at night).
      const starCount = 260;
      const starPos = new Float32Array(starCount * 3);
      for (let i = 0; i < starCount; i++) {
        const a = Math.random() * Math.PI * 2;
        const y = 0.15 + Math.random() * 0.85;
        const r = Math.sqrt(1 - y * y) * 520;
        starPos[i * 3] = Math.cos(a) * r;
        starPos[i * 3 + 1] = y * 520;
        starPos[i * 3 + 2] = Math.sin(a) * r;
      }
      const starGeo = new THREE.BufferGeometry();
      starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
      this.starMat = new THREE.PointsMaterial({
        color: 0xeaf4ff, size: 1.8, sizeAttenuation: false,
        transparent: true, opacity: 0, depthWrite: false, fog: false
      });
      this.stars = new THREE.Points(starGeo, this.starMat);
      scene.add(this.stars);

      // Big bright low-poly clouds. A gentle emissive term keeps them from
      // turning into dark grey blobs as the sun drops or a storm rolls in.
      this.cloudMat = new THREE.MeshLambertMaterial({
        color: 0xf8fbff, emissive: 0xaebdc8, emissiveIntensity: 0.55,
        flatShading: true, fog: false
      });
      this.clouds = new THREE.Group();
      this.cloudParts = [];
      for (let i = 0; i < 18; i++) {
        const cloud = new THREE.Group();
        const puffs = 6 + Math.floor(Math.random() * 4);
        for (let j = 0; j < puffs; j++) {
          const puff = new THREE.Mesh(
            new THREE.IcosahedronGeometry(U.randRange(Math.random, 32, 50), 0),
            this.cloudMat
          );
          puff.position.set((j - puffs / 2) * 30 + U.randRange(Math.random, -10, 10),
            U.randRange(Math.random, -8, 8), U.randRange(Math.random, -18, 18));
          puff.scale.set(3.1, 1.35, 2.3);
          cloud.add(puff);
        }
        cloud.position.set(U.randRange(Math.random, -780, 780),
          U.randRange(Math.random, 285, 400), U.randRange(Math.random, -780, 780));
        cloud.rotation.y = Math.random() * Math.PI;
        this.clouds.add(cloud);
        this.cloudParts.push({ group: cloud, speed: U.randRange(Math.random, 2.5, 7) });
      }
      scene.add(this.clouds);

      // A branching bolt made of reusable cylinder segments. It is regenerated
      // in a new place for every strike so the flash has a visible source.
      this.boltCoreMat = new THREE.MeshBasicMaterial({
        color: 0xf5faff, transparent: true, opacity: 0,
        depthTest: false, depthWrite: false, fog: false
      });
      this.boltGlowMat = new THREE.MeshBasicMaterial({
        color: 0x8ec3ff, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, fog: false
      });
      this.lightning = new THREE.Group();
      this.lightning.visible = false;
      this.lightningSegments = [];
      for (let i = 0; i < 12; i++) {
        const glow = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 6), this.boltGlowMat);
        const core = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 6), this.boltCoreMat);
        glow.renderOrder = 20; core.renderOrder = 21;
        this.lightning.add(glow, core);
        this.lightningSegments.push({ core: core, glow: glow });
      }
      scene.add(this.lightning);
      this.strikeBolt(0, 0);

      // Rain is drawn as short slanted line segments: the slant is the wind.
      const drops = 1800;
      const rainPos = new Float32Array(drops * 6);
      this.rainDrops = [];
      for (let i = 0; i < drops; i++) {
        const drop = {
          x: U.randRange(Math.random, -85, 85),
          y: U.randRange(Math.random, 0, 58),
          z: U.randRange(Math.random, -85, 85),
          len: U.randRange(Math.random, 2.4, 4.8)
        };
        this.rainDrops.push(drop);
        writeRainLine(rainPos, i, drop, 0, 0);
      }
      const rainGeo = new THREE.BufferGeometry();
      rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
      this.rainMat = new THREE.LineBasicMaterial({
        color: 0xcfe4f2, transparent: true, opacity: 0,
        depthWrite: false, fog: false
      });
      this.rainField = new THREE.LineSegments(rainGeo, this.rainMat);
      this.rainField.visible = false;
      this.rainPos = rainPos;
      scene.add(this.rainField);

      this.ready = true;
      this.update(0, 0, { pos: new THREE.Vector3() });
    },

    setWeather(name) {
      if (!['clear', 'cloudy', 'rain'].includes(name)) return;
      this.weather = name;
      this.rainTarget = name === 'rain' ? 0.8 : name === 'cloudy' ? 0.12 : 0;
      this.weatherTimer = name === 'rain' ? U.randRange(Math.random, 28, 65) :
        name === 'cloudy' ? U.randRange(Math.random, 35, 80) : U.randRange(Math.random, 60, 140);
    },

    strikeBolt(px, pz) {
      if (!this.lightningSegments) return;
      let sx = U.randRange(Math.random, -210, 210);
      let sz = U.randRange(Math.random, -210, 210);
      if (Math.hypot(sx, sz) < 75) sx += sx < 0 ? -110 : 110;
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const t = i / 9;
        pts.push(new THREE.Vector3(
          sx + U.randRange(Math.random, -17, 17) * (1 - t) + Math.sin(t * 11) * 7,
          U.lerp(250, 9, t),
          sz + U.randRange(Math.random, -14, 14) * (1 - t) + Math.cos(t * 8) * 6
        ));
      }
      let n = 0;
      for (let i = 0; i < pts.length - 1 && n < this.lightningSegments.length; i++) {
        const seg = this.lightningSegments[n++];
        placeBeam(seg.core, pts[i], pts[i + 1], 0.55);
        placeBeam(seg.glow, pts[i], pts[i + 1], 2.6);
      }
      // Three short forks branching off the lower half of the main bolt.
      for (let i = 0; i < 3 && n < this.lightningSegments.length; i++) {
        const from = pts[5 + i];
        const to = new THREE.Vector3(
          from.x + U.randRange(Math.random, -42, 42),
          from.y - U.randRange(Math.random, 22, 52),
          from.z + U.randRange(Math.random, -30, 30)
        );
        const seg = this.lightningSegments[n++];
        placeBeam(seg.core, from, to, 0.3);
        placeBeam(seg.glow, from, to, 1.5);
      }
      this.lightning.position.set(px, 0, pz);
      this.lightningStrikes = (this.lightningStrikes || 0) + 1;
    },

    update(dt, time, player) {
      if (!this.ready) return;
      this.timeOfDay = (this.timeOfDay + dt / this.dayLength) % 1;

      const px = player.pos.x, py = player.pos.y, pz = player.pos.z;

      // Weather changes on its own every minute or so.
      this.weatherTimer -= dt;
      if (this.weatherTimer <= 0) {
        const next = this.weather === 'clear' ? (Math.random() < 0.75 ? 'cloudy' : 'clear') :
          this.weather === 'cloudy' ? (Math.random() < 0.55 ? 'rain' : 'clear') :
            (Math.random() < 0.7 ? 'cloudy' : 'clear');
        this.setWeather(next);
      }
      this.rain = U.damp(this.rain, this.rainTarget, 0.5, dt);
      if (this.rain > 0.25 && Math.random() < dt * 0.11) {
        this.flash = 1;
        this.strikeBolt(px, pz);
        if (CC.Audio && CC.Audio.thunder) CC.Audio.thunder();
      }
      this.flash = Math.max(0, this.flash - dt * 2.6);

      // Wind ramps up with the rain and slowly veers around the compass.
      const windTarget = this.rain > 0.05
        ? 0.45 + this.rain * 0.7 + Math.sin(time * 0.63) * 0.16
        : 0.05;
      this.wind = U.damp(this.wind, Math.max(0, windTarget), 0.7, dt);
      const windAngle = Math.sin(time * 0.19) * 0.7 + Math.sin(time * 0.071) * 0.5;
      this.windX = Math.cos(windAngle) * this.wind;
      this.windZ = Math.sin(windAngle) * this.wind;
      if (CC.Audio && CC.Audio.setWind) CC.Audio.setWind(this.wind);

      const tod = this.timeOfDay;
      let k = 0;
      while (k < PALETTE.length - 2 && PALETTE[k + 1].t < tod) k++;
      const a = PALETTE[k], b = PALETTE[k + 1];
      const f = U.clamp((tod - a.t) / (b.t - a.t), 0, 1);
      const sky = lerpColor(a.sky, b.sky, f);
      const fogCol = lerpColor(a.fog, b.fog, f);
      const dim = 1 - this.rain * 0.32 + this.flash * 0.5;
      this.sky.setRGB(sky[0] * dim, sky[1] * dim, sky[2] * dim);
      this.fog.color.setRGB(fogCol[0] * dim, fogCol[1] * dim, fogCol[2] * dim);
      this.hemi.intensity = U.lerp(a.hemi, b.hemi, f) * (1 - this.rain * 0.25) + this.flash * 0.5;

      // Sun and moon travel in opposite arcs around the town.
      const angle = (tod - 0.25) * Math.PI * 2;
      const sunY = Math.sin(angle);
      this.sun.position.set(px + Math.cos(angle) * 190, py + Math.max(20, sunY * 220), pz + 70);
      this.sun.target.position.set(px, py, pz);
      this.sun.target.updateMatrixWorld();
      this.sun.intensity = U.lerp(a.sun, b.sun, f) * (1 - this.rain * 0.55);

      this.night = U.clamp((-sunY - 0.02) / 0.35, 0, 1);
      const mx = px - Math.cos(angle) * 210, my = py - sunY * 210, mz = pz - 50;
      this.moonDisc.position.set(mx, my, mz);
      this.moonDisc.visible = this.night > 0.02;
      this.moonLight.position.copy(this.moonDisc.position);
      this.moonLight.intensity = this.night * 0.42;
      this.sunDisc.position.set(px + Math.cos(angle) * 300, py + sunY * 300, pz + 110);
      this.sunDisc.visible = sunY > -0.05;

      this.stars.position.set(px, 0, pz);
      this.starMat.opacity = this.night * (1 - this.rain * 0.8);
      this.stars.visible = this.starMat.opacity > 0.02;

      // Clouds drift overhead, blown along a little faster during a storm.
      this.clouds.position.set(px, 0, pz);
      for (let i = 0; i < this.cloudParts.length; i++) {
        const c = this.cloudParts[i];
        c.group.position.x += (c.speed + this.wind * 8) * dt;
        if (c.group.position.x > 800) c.group.position.x = -800;
      }
      const cloudShade = U.clamp(1.04 - this.rain * 0.2 - this.night * 0.22 + this.flash * 0.45, 0.62, 1.2);
      this.cloudMat.color.setRGB(cloudShade, cloudShade, Math.min(1.2, cloudShade * 1.02));
      this.cloudMat.emissiveIntensity = 0.4 + this.night * 0.3 + this.rain * 0.16;

      this.lightning.visible = this.flash > 0.02;
      if (this.lightning.visible) {
        this.boltCoreMat.opacity = U.clamp(this.flash * 1.5, 0, 1);
        this.boltGlowMat.opacity = U.clamp(this.flash * 0.5, 0, 1);
      }

      this.rainField.position.set(px, py, pz);
      this.rainField.visible = this.rain > 0.02;
      this.rainMat.opacity = this.rain * 0.72;
      if (this.rainField.visible) {
        const fall = (42 + this.rain * 28) * dt;
        const blow = (15 + this.rain * 18) * dt;
        for (let i = 0; i < this.rainDrops.length; i++) {
          const drop = this.rainDrops[i];
          drop.y -= fall;
          drop.x += this.windX * blow;
          drop.z += this.windZ * blow;
          if (drop.y < 0 || drop.x < -95 || drop.x > 95 || drop.z < -95 || drop.z > 95) {
            drop.y = U.randRange(Math.random, 42, 58);
            drop.x = U.randRange(Math.random, -85, 85);
            drop.z = U.randRange(Math.random, -85, 85);
          }
          writeRainLine(this.rainPos, i, drop, this.windX, this.windZ);
        }
        this.rainField.geometry.attributes.position.needsUpdate = true;
      }
      if (CC.Audio && CC.Audio.setRain) CC.Audio.setRain(this.rain);
    }
  });
})();
