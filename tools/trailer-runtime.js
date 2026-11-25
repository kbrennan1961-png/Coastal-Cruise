/* Browser-side trailer driver. Loaded by tools/trailer.js after the game boots.
 * It drives CC.Game through its public hooks and captures the WebGL canvas with
 * MediaRecorder, so the recording starts after loading and contains no HUD. */
(function () {
  'use strict';

  var CC = window.CC;
  var G = CC && CC.Game;
  if (!G) {
    window.CCTrailer = {
      error: 'CC.Game is not available; load index.html before trailer-runtime.js'
    };
    return;
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function angleDiff(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  function makeInput(overrides) {
    var out = {
      throttle: 0, steer: 0, yaw: 0, lift: 0, pitch: 0, roll: 0,
      handbrake: false, boost: false, dive: false, climb: false, descend: false,
      fpvPitch: 0, fpvRoll: 0, fpvYaw: 0
    };
    if (overrides) {
      Object.keys(out).forEach(function (key) {
        if (overrides[key] !== undefined) out[key] = overrides[key];
      });
    }
    return out;
  }

  var T = {
    active: false,
    mode: 'manual',
    manual: makeInput(),
    path: null,
    pathIndex: 0,
    speed: 0,
    boost: false
  };

  var originalRead = null;
  var capture = { recorder: null, chunks: [], chain: Promise.resolve(), mime: '', inline: [] };

  function groundInput(v) {
    var path = T.path;
    if (!path || !path.length) return makeInput();
    var target = path[Math.min(T.pathIndex, path.length - 1)];
    var dx = target.x - v.pos.x;
    var dz = target.z - v.pos.z;
    var distance = Math.hypot(dx, dz);
    var arrive = target.radius || 8;
    if (distance < arrive && T.pathIndex < path.length - 1) {
      T.pathIndex += 1;
      target = path[T.pathIndex];
      dx = target.x - v.pos.x;
      dz = target.z - v.pos.z;
      distance = Math.hypot(dx, dz);
    }
    var desired = Math.atan2(dx, dz);
    var diff = angleDiff(desired - (v.heading || 0));
    var steer = clamp(diff * 2.5, -1, 1);
    var throttle = 1;
    if ((v.speed || 0) > T.speed) throttle = -0.45;
    else if (Math.abs(diff) > 0.95) throttle = 0.3;
    return makeInput({
      throttle: throttle,
      steer: steer,
      boost: T.boost,
      handbrake: false,
      dive: false
    });
  }

  function airInput(v) {
    var path = T.path;
    if (!path || !path.length) return makeInput();
    var target = path[Math.min(T.pathIndex, path.length - 1)];
    var dx = target.x - v.pos.x;
    var dz = target.z - v.pos.z;
    var distance = Math.hypot(dx, dz);
    var arrive = target.radius || 12;
    if (distance < arrive && T.pathIndex < path.length - 1) {
      T.pathIndex += 1;
      target = path[T.pathIndex];
      dx = target.x - v.pos.x;
      dz = target.z - v.pos.z;
      distance = Math.hypot(dx, dz);
    }
    var desired = Math.atan2(dx, dz);
    var diff = angleDiff(desired - (v.heading || 0));
    var ground = CC.heightAt ? CC.heightAt(target.x, target.z) : 0;
    var targetY = ground + (target.alt || 35);
    var lift = clamp((targetY - v.pos.y) * 0.14, -1, 1);
    var pitch = clamp(distance * 0.09, 0.35, 1);
    var roll = clamp(diff * 0.75, -0.8, 0.8);
    return makeInput({
      throttle: pitch,
      steer: 0,
      yaw: clamp(diff * 1.8, -1, 1),
      lift: lift,
      pitch: pitch,
      roll: roll,
      boost: false,
      climb: lift > 0.05,
      descend: lift < -0.05,
      fpvPitch: pitch,
      fpvRoll: roll,
      fpvYaw: clamp(diff * 1.8, -1, 1)
    });
  }

  function inputFor(v) {
    if (!T.active) return originalRead ? originalRead({}, v) : makeInput();
    if (T.mode === 'ground') return groundInput(v);
    if (T.mode === 'air') return airInput(v);
    return makeInput(T.manual);
  }

  function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function hideUi() {
    ['hud', 'splash', 'loading', 'mapOverlay'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
  }

  function snapCamera() {
    var v = G.vehicles[G.activeKey];
    if (v && G.updateCamera) G.updateCamera(1, v, {});
  }

  function prepare() {
    if (!originalRead) {
      originalRead = G.readInput;
      G.readInput = function (pad, v) { return inputFor(v); };
    }
    T.active = true;
    G.keys = {};
    G.mapOpen = false;
    if (!G.started && G.finishStart) G.finishStart();
    if (CC.Audio && CC.Audio.stopMusic) CC.Audio.stopMusic();
    if (CC.Weather) {
      CC.Weather.timeOfDay = 0.34;
      CC.Weather.dayLength = 100000;
      if (CC.Weather.setWeather) CC.Weather.setWeather('clear');
    }
    if (G.renderer) {
      G.renderer.setPixelRatio(1);
      G.renderer.setSize(window.innerWidth, window.innerHeight, false);
    }
    G.basePixelRatio = 1;
    G.resCooldown = 1000000;
    hideUi();
  }

  function setGround(key, pose, path, speed, camMode, boost) {
    G.selectVehicle(key, pose);
    G.camMode = camMode;
    G.resetCameraLook();
    T.mode = 'ground';
    T.path = path;
    T.pathIndex = 0;
    T.speed = speed;
    T.boost = !!boost;
    snapCamera();
  }

  function setAir(key, pose, path, camMode) {
    if (pose) G.selectVehicle(key, pose);
    else G.selectVehicle(key);
    G.camMode = camMode;
    G.resetCameraLook();
    T.mode = 'air';
    T.path = path;
    T.pathIndex = 0;
    T.boost = false;
    snapCamera();
  }

  async function run(options) {
    options = options || {};
    var units = options.units === undefined ? 1 : options.units;
    prepare();

    // 1. Coupe sweep along Main Street and toward the bridge approach.
    setGround('coupe', { x: -188, z: -60, h: 1.4, s: 0 }, [
      { x: -120, z: -48 }, { x: -30, z: -30, radius: 10 },
      { x: 45, z: -42 }, { x: 125, z: -58 },
      { x: 210, z: -45 }, { x: 295, z: -36 }
    ], 30, 0, false);
    await wait(12000 * units);

    // 2. On foot along the northern beach boardwalk.
    setGround('pedestrian', { x: -190, z: -62, h: -1.76, s: 0 }, [
      { x: -222, z: -68, radius: 4 }, { x: -262, z: -82, radius: 4 },
      { x: -302, z: -92, radius: 4 }, { x: -332, z: -98, radius: 4 }
    ], 6, 2, true);
    await wait(10000 * units);

    // 3. Jetpack launched from the current spot, then a rising harbor arc.
    setAir('jetpack', null, [
      { x: -285, z: -125, alt: 24, radius: 18 },
      { x: -210, z: -155, alt: 46, radius: 18 },
      { x: -110, z: -140, alt: 64, radius: 18 },
      { x: 0, z: -95, alt: 58, radius: 18 },
      { x: 105, z: -48, alt: 42, radius: 18 }
    ], 2);
    await wait(14000 * units);

    // 4. Final low chase across the Main Street bridge.
    setGround('coupe', { x: 95, z: -58, h: 1.46, s: 18 }, [
      { x: 130, z: -54, radius: 8 }, { x: 175, z: -40, radius: 8 },
      { x: 225, z: -35, radius: 8 }, { x: 290, z: -34, radius: 8 }
    ], 28, 0, true);
    await wait(8000 * units);

    T.active = false;
    T.mode = 'manual';
    T.manual = makeInput();
    if (originalRead) G.readInput = originalRead;
    return { ok: true, durationMs: 44000 * units };
  }

  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result).split(',')[1]); };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function startCapture(options) {
    options = options || {};
    var canvas = G.renderer && G.renderer.domElement;
    if (!canvas || !canvas.captureStream) {
      throw new Error('This browser cannot capture the WebGL canvas stream');
    }
    // Adaptive resolution normally lowers the drawing buffer on software GL.
    // Pin it for the capture so MediaRecorder sees the requested viewport size.
    G.basePixelRatio = 1;
    G.resCooldown = Number.POSITIVE_INFINITY;
    G.renderer.setPixelRatio(1);
    G.renderer.setSize(window.innerWidth, window.innerHeight, false);
    var types = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm'
    ];
    var mime = types.find(function (t) { return window.MediaRecorder && MediaRecorder.isTypeSupported(t); });
    if (!mime) throw new Error('MediaRecorder WebM is not supported');
    var stream = canvas.captureStream(options.fps || 60);
    var recorder = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: options.bitrate || 8000000
    });
    capture.chunks = [];
    capture.inline = [];
    capture.chain = Promise.resolve();
    capture.mime = mime;
    recorder.ondataavailable = function (e) {
      if (!e.data || !e.data.size) return;
      capture.chain = capture.chain
        .then(function () { return blobToBase64(e.data); })
        .then(function (b64) {
          if (typeof window.__ccTrailerChunk === 'function') return window.__ccTrailerChunk(b64);
          capture.inline.push(b64);
        });
    };
    recorder.start(1000);
    capture.recorder = recorder;
    return { ok: true, mime: mime };
  }

  function stopCapture() {
    return new Promise(function (resolve, reject) {
      var recorder = capture.recorder;
      if (!recorder) { resolve({ ok: false, reason: 'not recording' }); return; }
      recorder.onerror = function (e) { reject(e.error || new Error('MediaRecorder failed')); };
      recorder.onstop = function () {
        capture.chain.then(function () {
          resolve({ ok: true, mime: capture.mime, inline: capture.inline });
        }, reject);
      };
      recorder.stop();
    });
  }

  window.CCTrailer = {
    run: run,
    startCapture: startCapture,
    stopCapture: stopCapture,
    setInput: function (patch) { T.manual = makeInput(patch); T.mode = 'manual'; },
    getState: function () {
      var v = G.vehicles[G.activeKey];
      return {
        started: G.started,
        activeKey: G.activeKey,
        mode: T.mode,
        pathIndex: T.pathIndex,
        pos: v ? { x: v.pos.x, y: v.pos.y, z: v.pos.z } : null,
        speed: v ? v.speed : 0,
        heading: v ? v.heading : 0
      };
    }
  };
})();
