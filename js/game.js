/* Coastal Cruise - renderer, input, cameras, HUD, challenges, audio and main loop. */
(function () {
  'use strict';

  const CC = window.CC;
  const C = CC.C, U = CC.util;

  /* ---------- procedural audio ---------- */
  const Audio = (CC.Audio = {
    ctx: null,
    ready: false,
    init() {
      if (this.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = (this.ctx = new AC());
      this.master = ctx.createGain();
      this.master.gain.value = 0.85;
      this.master.connect(ctx.destination);

      this.filter = ctx.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.frequency.value = 1400;
      this.engineGain = ctx.createGain();
      this.engineGain.gain.value = 0;
      this.filter.connect(this.engineGain);
      this.engineGain.connect(this.master);

      this.osc = ctx.createOscillator();
      this.osc.type = 'sawtooth';
      this.osc.frequency.value = 70;
      this.sub = ctx.createOscillator();
      this.sub.type = 'sine';
      this.sub.frequency.value = 35;
      this.subGain = ctx.createGain();
      this.subGain.gain.value = 0.35;
      this.osc.connect(this.filter);
      this.sub.connect(this.subGain);
      this.subGain.connect(this.filter);
      this.osc.start(); this.sub.start();

      // Soft surf / wind bed.
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
      const src = ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'lowpass'; bp.frequency.value = 420;
      const ambGain = ctx.createGain();
      ambGain.gain.value = 0.028;
      src.connect(bp); bp.connect(ambGain); ambGain.connect(this.master);
      src.start();

      // Off-road rumble noise.
      const rough = ctx.createBufferSource();
      rough.buffer = buf; rough.loop = true;
      const rbp = ctx.createBiquadFilter();
      rbp.type = 'bandpass'; rbp.frequency.value = 260; rbp.Q.value = 0.7;
      this.roughGain = ctx.createGain();
      this.roughGain.gain.value = 0;
      rough.connect(rbp); rbp.connect(this.roughGain); this.roughGain.connect(this.master);
      rough.start();

      this.ready = true;
      this.setVehicle(CC.vehicleSpecs.motorcycle);
    },
    setVehicle(spec) {
      if (!this.ready) return;
      this.spec = spec;
      const a = spec.audio;
      this.osc.type = a.wave;
      this.base = a.base;
      this.mult = a.mult;
      this.targetGain = a.gain;
      this.filter.frequency.setTargetAtTime(a.filter, this.ctx.currentTime, 0.1);
    },
    update(speed, throttle, boost, surface) {
      if (!this.ready) return;
      const now = this.ctx.currentTime;
      const abs = Math.abs(speed);
      const freq = this.base + abs * this.mult + (boost ? 18 : 0);
      this.osc.frequency.setTargetAtTime(freq, now, 0.06);
      this.sub.frequency.setTargetAtTime(freq * 0.5, now, 0.06);
      const load = throttle > 0 ? 1 : throttle < 0 ? 0.35 : 0.55;
      const g = this.targetGain * (0.35 + load * 0.65) * U.clamp(0.35 + abs / 18, 0, 1.25);
      this.engineGain.gain.setTargetAtTime(g, now, 0.07);
      const rough = (surface === 'sand' || surface === 'grass' || surface === 'gravel') ?
        U.clamp(abs / 40, 0, 1) * 0.085 : 0;
      this.roughGain.gain.setTargetAtTime(rough, now, 0.1);
    },
    honk(vol) {
      if (!this.ready) return;
      const ctx = this.ctx, now = ctx.currentTime;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.11 * (vol || 1), now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
      gain.connect(this.master);
      [392, 494].forEach(function (f) {
        const o = ctx.createOscillator();
        o.type = 'square'; o.frequency.value = f;
        o.connect(gain); o.start(now); o.stop(now + 0.25);
      });
    },
    chime(up) {
      if (!this.ready) return;
      const ctx = this.ctx, now = ctx.currentTime;
      [0, 0.09, 0.18].forEach(function (delay, i) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = (up ? [660, 880, 1175] : [520, 660, 880])[i];
        g.gain.setValueAtTime(0.0001, now + delay);
        g.gain.exponentialRampToValueAtTime(0.09, now + delay + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.28);
        o.connect(g); g.connect(this.master);
        o.start(now + delay); o.stop(now + delay + 0.3);
      }, this);
    }
  });

  /* ---------- game ---------- */
  const Game = {
    keys: {},
    vehicles: {},
    activeKey: 'motorcycle',
    camMode: 0,
    camModes: ['Chase', 'Hood', 'Cinematic'],
    camTarget: new THREE.Vector3(),
    time: 0,
    activeChallenge: null,
    challengeElapsed: 0,
    gateIndex: 0,
    gateCooldown: 1.2,
    toastTimer: 0
  };
  CC.Game = Game;

  function $(id) { return document.getElementById(id); }

  function toast(msg, duration) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    Game.toastTimer = duration || 2.6;
  }

  /* ---------- input ---------- */
  function bindInput() {
    window.addEventListener('keydown', function (e) {
      Audio.init();
      const k = e.key.toLowerCase();
      Game.keys[k] = true;
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'shift'].includes(k)) e.preventDefault();
      if (k >= '1' && k <= '5') {
        const key = CC.vehicleOrder[Number(k) - 1];
        if (key && key !== Game.activeKey) selectVehicle(key);
      }
      if (k === 'c') {
        Game.camMode = (Game.camMode + 1) % Game.camModes.length;
        toast('Camera: ' + Game.camModes[Game.camMode], 1.4);
      }
      if (k === 'r') {
        Game.vehicles[Game.activeKey].reset(CC.World);
        toast('Vehicle reset', 1.2);
      }
      if (k === 'h') $('help').classList.toggle('hidden');
      if (k === 'm') $('minimapWrap').classList.toggle('collapsed');
    });
    window.addEventListener('keyup', function (e) { Game.keys[e.key.toLowerCase()] = false; });
    window.addEventListener('pointerdown', function () { Audio.init(); });
    window.addEventListener('blur', function () { Game.keys = {}; });
    document.querySelectorAll('.vehBtn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        Audio.init();
        if (btn.dataset.key !== Game.activeKey) selectVehicle(btn.dataset.key);
      });
    });
  }

  function readInput() {
    const k = Game.keys;
    return {
      throttle: (k['w'] || k['arrowup'] ? 1 : 0) - (k['s'] || k['arrowdown'] ? 1 : 0),
      steer: (k['d'] || k['arrowright'] ? 1 : 0) - (k['a'] || k['arrowleft'] ? 1 : 0),
      handbrake: !!k[' '],
      boost: !!(k['shift'])
    };
  }

  function selectVehicle(key) {
    const old = Game.vehicles[Game.activeKey];
    const next = Game.vehicles[key];
    if (!next) return;
    const pose = { x: old.pos.x, z: old.pos.z, h: old.heading, s: old.speed * 0.7 };
    old.setVisible(false);
    next.setPose(pose.x, pose.z, pose.h, pose.s);
    next.setVisible(true);
    Game.activeKey = key;
    Audio.setVehicle(next.spec);
    toast(next.spec.label + ' — ' + next.spec.desc, 2.4);
    updateVehicleHud();
  }

  function updateVehicleHud() {
    const v = Game.vehicles[Game.activeKey];
    $('vehicleName').textContent = v.spec.label;
    $('vehicleDesc').textContent = v.spec.desc;
    document.querySelectorAll('.vehBtn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.key === Game.activeKey);
    });
  }

  /* ---------- scene ---------- */
  function initScene() {
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    document.getElementById('game').appendChild(renderer.domElement);
    Game.renderer = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(C.COLORS.skyTop);
    scene.fog = new THREE.Fog(C.COLORS.fog, 230, 720);
    Game.scene = scene;

    const hemi = new THREE.HemisphereLight(0xffe4bb, 0x5c7a4d, 0.85);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffd2a0, 2.05);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -120;
    sun.shadow.camera.right = 120;
    sun.shadow.camera.top = 120;
    sun.shadow.camera.bottom = -120;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 420;
    sun.shadow.bias = -0.0006;
    scene.add(sun);
    scene.add(sun.target);
    Game.sun = sun;

    const camera = new THREE.PerspectiveCamera(66, window.innerWidth / window.innerHeight, 0.1, 1500);
    Game.camera = camera;

    CC.World.init(scene);

    // Spawn on Coastal Highway.
    const road = CC.roadDefs[0];
    const start = CC.sampleRoad(road, 52);
    const sx = start.x + start.dz * 3.0;
    const sz = start.z - start.dx * 3.0;
    const heading = Math.atan2(start.dx, start.dz);

    CC.vehicleOrder.forEach(function (key, i) {
      const v = new CC.Vehicle(key, scene);
      v.setPose(sx + i * 0.1, sz + i * 0.1, heading, 0);
      Game.vehicles[key] = v;
    });
    Game.vehicles[Game.activeKey].setVisible(true);
    Audio.setVehicle(Game.vehicles[Game.activeKey].spec);

    CC.NPCSystem.init(scene);

    window.addEventListener('resize', function () {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  /* ---------- camera ---------- */
  function updateCamera(dt, v) {
    const f = v.forward();
    const speed = Math.abs(v.speed);
    let desired, look;
    if (Game.camMode === 0) {
      const back = 10.5 + speed * 0.09;
      desired = new THREE.Vector3(v.pos.x - f.x * back, v.pos.y + 5.2 + speed * 0.012, v.pos.z - f.z * back);
      look = new THREE.Vector3(v.pos.x + f.x * 9, v.pos.y + 1.7, v.pos.z + f.z * 9);
    } else if (Game.camMode === 1) {
      desired = new THREE.Vector3(v.pos.x + f.x * 1.25, v.pos.y + 1.35, v.pos.z + f.z * 1.25);
      look = new THREE.Vector3(v.pos.x + f.x * 35, v.pos.y + 1.5, v.pos.z + f.z * 35);
    } else {
      const a = Game.time * 0.32;
      const r = 15 + speed * 0.05;
      desired = new THREE.Vector3(v.pos.x + Math.sin(a) * r, v.pos.y + 6.8, v.pos.z + Math.cos(a) * r);
      look = new THREE.Vector3(v.pos.x, v.pos.y + 1.2, v.pos.z);
    }
    const lerp = 1 - Math.exp(-(Game.camMode === 1 ? 14 : 5.5) * dt);
    Game.camera.position.lerp(desired, lerp);
    Game.camTarget.lerp(look, 1 - Math.exp(-8 * dt));
    Game.camera.lookAt(Game.camTarget);
    const fov = U.clamp(64 + speed * 0.22, 64, 80);
    if (Math.abs(Game.camera.fov - fov) > 0.05) {
      Game.camera.fov = U.damp(Game.camera.fov, fov, 4, dt);
      Game.camera.updateProjectionMatrix();
    }
  }

  /* ---------- challenges ---------- */
  function gateFor(ch, index) {
    for (let i = 0; i < CC.World.challengeGates.length; i++) {
      const g = CC.World.challengeGates[i];
      if (g.challenge === ch && g.index === index) return g;
    }
    return null;
  }

  function updateChallenges(dt, v) {
    const gates = CC.World.challengeGates;
    if (Game.activeChallenge) {
      Game.challengeElapsed += dt;
      const ch = Game.activeChallenge;
      const g = gateFor(ch, Game.gateIndex);
      if (g && U.distance2D(v.pos.x, v.pos.z, g.x, g.z) < 6.6) {
        Game.gateIndex++;
        Audio.chime(true);
        if (Game.gateIndex >= ch.gates.length) {
          const t = Game.challengeElapsed;
          const best = ch.best;
          if (best == null || t < best) {
            ch.best = t;
            try { localStorage.setItem('cc_best_' + ch.id, String(t)); } catch (e) { /* storage disabled */ }
          }
          toast(ch.name + ' complete — ' + U.formatTime(t) + (best == null || t < best ? '  NEW BEST!' : ''), 4);
          Game.activeChallenge = null;
          Game.gateIndex = 0;
          Game.gateCooldown = 2.5;
        } else {
          toast('Gate ' + Game.gateIndex + '/' + ch.gates.length, 1.1);
        }
      }
    } else {
      Game.gateCooldown -= dt;
      if (Game.gateCooldown <= 0) {
        for (let i = 0; i < CC.challengeDefs.length; i++) {
          const ch = CC.challengeDefs[i];
          const g = gateFor(ch, 0);
          if (g && U.distance2D(v.pos.x, v.pos.z, g.x, g.z) < 6.6) {
            Game.activeChallenge = ch;
            Game.challengeElapsed = 0;
            Game.gateIndex = 1;
            Audio.chime(true);
            toast(ch.name + ' started! Follow the glowing gates.', 2.8);
            break;
          }
        }
      }
    }
    // Highlight the next gate.
    for (let i = 0; i < gates.length; i++) {
      const g = gates[i];
      const isNext = Game.activeChallenge === g.challenge && g.index === Game.gateIndex;
      const s = isNext ? 1.14 + Math.sin(Game.time * 5) * 0.05 : 1;
      g.group.scale.setScalar(s);
    }
    updateChallengeHud(v);
  }

  function updateChallengeHud(v) {
    const el = $('challengeBody');
    if (Game.activeChallenge) {
      const ch = Game.activeChallenge;
      const g = gateFor(ch, Game.gateIndex);
      const dist = g ? Math.round(U.distance2D(v.pos.x, v.pos.z, g.x, g.z)) : 0;
      el.innerHTML =
        '<div class="challengeTitle">' + ch.name + '</div>' +
        '<div class="challengeTime">' + U.formatTime(Game.challengeElapsed) + '</div>' +
        '<div class="challengeSub">Gate ' + Game.gateIndex + '/' + ch.gates.length + ' &nbsp;•&nbsp; ' + dist + ' m</div>';
    } else {
      let html = '<div class="challengeSub hint">Drive through a glowing gate to start</div>';
      CC.challengeDefs.forEach(function (ch, i) {
        html += '<div class="challengeRow"><span style="color:#' + new THREE.Color(ch.color).getHexString() + '">◆</span> ' +
          ch.name + ' <b>' + (ch.best != null ? U.formatTime(ch.best) : '--:--.--') + '</b></div>';
      });
      el.innerHTML = html;
    }
  }

  /* ---------- HUD canvases ---------- */
  function drawGauge(v) {
    const c = $('gauge'), g = c.getContext('2d');
    const w = c.width, h = c.height, cx = w / 2, cy = h / 2 + 8, r = 56;
    g.clearRect(0, 0, w, h);
    const a0 = Math.PI * 0.78, a1 = Math.PI * 2.22;
    g.lineWidth = 9; g.lineCap = 'round';
    g.strokeStyle = 'rgba(255,255,255,0.16)';
    g.beginPath(); g.arc(cx, cy, r, a0, a1); g.stroke();
    const max = v.spec.maxSpeed * 2.237;
    const frac = U.clamp(Math.abs(v.speed) * 2.237 / max, 0, 1);
    const grad = g.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#62e0ff'); grad.addColorStop(0.6, '#ffd166'); grad.addColorStop(1, '#ff6b6b');
    g.strokeStyle = grad;
    g.beginPath(); g.arc(cx, cy, r, a0, a0 + (a1 - a0) * frac); g.stroke();
    const a = a0 + (a1 - a0) * frac;
    g.strokeStyle = '#fff'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * (r - 12), cy + Math.sin(a) * (r - 12)); g.stroke();
    g.fillStyle = '#fff'; g.font = 'bold 25px Arial'; g.textAlign = 'center';
    g.fillText(Math.round(Math.abs(v.speed) * 2.237), cx, cy + 4);
    g.font = '10px Arial'; g.fillStyle = 'rgba(255,255,255,0.7)';
    g.fillText('MPH', cx, cy + 20);
  }

  function mapPt(x, z) {
    const W = C.WORLD;
    return {
      x: (x - W.minX) / (W.maxX - W.minX) * 200,
      y: (z - W.minZ) / (W.maxZ - W.minZ) * 200
    };
  }

  function drawMinimap(v) {
    const c = $('minimap'), g = c.getContext('2d');
    g.clearRect(0, 0, 200, 200);
    g.fillStyle = '#7f9c62'; g.fillRect(0, 0, 200, 200);
    // Water on the west and south edges.
    g.fillStyle = '#2d8fb5';
    g.beginPath();
    let p = mapPt(C.WORLD.minX, C.WORLD.minZ);
    g.moveTo(p.x, p.y);
    for (let z = C.WORLD.minZ; z <= C.WORLD.maxZ; z += 12) {
      p = mapPt(CC.coast.westLine(z), z);
      g.lineTo(p.x, p.y);
    }
    g.lineTo(mapPt(C.WORLD.minX, C.WORLD.maxZ).x, mapPt(C.WORLD.minX, C.WORLD.maxZ).y);
    g.closePath(); g.fill();
    g.beginPath();
    p = mapPt(C.WORLD.minX, C.WORLD.maxZ);
    g.moveTo(p.x, p.y);
    for (let x = C.WORLD.minX; x <= C.WORLD.maxX; x += 12) {
      p = mapPt(x, CC.coast.southLine(x));
      g.lineTo(p.x, p.y);
    }
    g.lineTo(mapPt(C.WORLD.maxX, C.WORLD.maxZ).x, mapPt(C.WORLD.maxX, C.WORLD.maxZ).y);
    g.closePath(); g.fill();
    // Roads.
    CC.roadDefs.forEach(function (road) {
      g.beginPath();
      road.points.forEach(function (pt, i) {
        const q = mapPt(pt[0], pt[1]);
        if (i === 0) g.moveTo(q.x, q.y); else g.lineTo(q.x, q.y);
      });
      g.strokeStyle = road.type === 'paved' ? 'rgba(235,235,220,0.9)' :
        road.type === 'gravel' ? 'rgba(205,190,155,0.8)' : 'rgba(170,120,70,0.9)';
      g.lineWidth = Math.max(1.2, road.width * 200 / (C.WORLD.maxX - C.WORLD.minX));
      g.lineJoin = 'round';
      g.stroke();
    });
    // Gates.
    CC.World.challengeGates.forEach(function (gate) {
      const q = mapPt(gate.x, gate.z);
      const isNext = Game.activeChallenge === gate.challenge && gate.index === Game.gateIndex;
      g.fillStyle = '#' + gate.color.getHexString();
      g.globalAlpha = isNext ? 1 : 0.45;
      g.beginPath(); g.arc(q.x, q.y, isNext ? 3.6 : 2.2, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;
    });
    // Traffic + pedestrians.
    CC.NPCSystem.traffic.forEach(function (t) {
      const q = mapPt(t.group.position.x, t.group.position.z);
      g.fillStyle = 'rgba(40,50,60,0.75)';
      g.fillRect(q.x - 1.4, q.y - 1.4, 2.8, 2.8);
    });
    // Player arrow.
    const pq = mapPt(v.pos.x, v.pos.z);
    g.save();
    g.translate(pq.x, pq.y);
    g.rotate(-v.heading + Math.PI);
    g.fillStyle = '#ff5b4d';
    g.beginPath(); g.moveTo(0, -7); g.lineTo(5, 6); g.lineTo(0, 3); g.lineTo(-5, 6); g.closePath();
    g.fill();
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 1;
    g.strokeRect(0.5, 0.5, 199, 199);
  }

  /* ---------- main loop ---------- */
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    dt = U.clamp(dt, 0, 0.05);
    Game.time += dt;

    const v = Game.vehicles[Game.activeKey];
    const input = readInput();
    const surface = v.update(dt, input, CC.World, Game.time);
    CC.World.update(dt, Game.time);
    CC.NPCSystem.update(dt, v, CC.World, Audio);
    updateCamera(dt, v);
    updateChallenges(dt, v);
    Audio.update(v.speed, input.throttle, input.boost, surface);

    // Follow with the sun's shadow camera.
    Game.sun.position.set(v.pos.x - 95, v.pos.y + 145, v.pos.z + 65);
    Game.sun.target.position.set(v.pos.x, v.pos.y, v.pos.z);
    Game.sun.target.updateMatrixWorld();

    drawGauge(v);
    drawMinimap(v);
    $('surface').textContent = surface.charAt(0).toUpperCase() + surface.slice(1);
    $('camMode').textContent = Game.camModes[Game.camMode];

    if (Game.toastTimer > 0) {
      Game.toastTimer -= dt;
      if (Game.toastTimer <= 0) $('toast').classList.remove('show');
    }

    Game.renderer.render(Game.scene, Game.camera);
  }

  /* ---------- boot ---------- */
  window.addEventListener('DOMContentLoaded', function () {
    initScene();
    bindInput();
    updateVehicleHud();
    toast('Welcome to Coastal Cruise — press 1–5 to switch vehicles, H for controls', 5);
    requestAnimationFrame(frame);
  });
})();
