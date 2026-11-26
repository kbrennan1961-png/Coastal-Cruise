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
  var patchedRead = null;
  var capture = {
    recorder: null, chunks: [], chain: Promise.resolve(), mime: '', inline: [],
    track: null, originalRender: null, renderPatched: false,
    manual: false, fps: 24, frames: 0, width: 0, height: 0
  };

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
    if (capture.manual && typeof G.stepFrame === 'function') {
      var steps = Math.max(1, Math.round(ms / 1000 * capture.fps));
      var dt = 1 / capture.fps;
      var sequential = Promise.resolve();
      for (var i = 0; i < steps; i++) {
        sequential = sequential.then(function () {
          G.stepFrame(dt);
          return captureFrame();
        });
      }
      return sequential;
    }
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function captureFrame() {
    var canvas = G.renderer && G.renderer.domElement;
    if (!canvas) return Promise.resolve();
    var dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    var comma = dataUrl.indexOf(',');
    var b64 = comma >= 0 ? dataUrl.slice(comma + 1) : '';
    if (!b64) return Promise.resolve();
    capture.frames += 1;
    if (typeof window.__ccTrailerFrame === 'function') {
      capture.chain = capture.chain.then(function () {
        return window.__ccTrailerFrame(b64);
      });
      return capture.chain;
    }
    capture.inline.push(b64);
    return Promise.resolve();
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
    if (!originalRead) originalRead = G.readInput;
    if (!patchedRead) patchedRead = function (pad, v) { return inputFor(v); };
    // A previous shot restores the original reader, so re-arm it every time.
    if (G.readInput !== patchedRead) G.readInput = patchedRead;
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
      G.renderer.setSize(capture.width || window.innerWidth,
        capture.height || window.innerHeight, false);
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

  function numberOr(value, fallback) {
    var n = Number(value);
    return value === undefined || value === null || !isFinite(n) ? fallback : n;
  }

  function pointXZ(value) {
    if (Array.isArray(value)) return { x: Number(value[0]), z: Number(value[1]) };
    if (value && typeof value === 'object') return { x: Number(value.x), z: Number(value.z) };
    return null;
  }

  function validPoint(value) {
    var p = pointXZ(value);
    return p && isFinite(p.x) && isFinite(p.z) ? p : null;
  }

  function shotPoint(shot, key, name) {
    var p = validPoint(shot[key]);
    if (!p) throw new Error('Shot "' + name + '" has an invalid ' + key + ' point');
    return p;
  }

  function headingBetween(a, b) {
    var dx = b.x - a.x;
    var dz = b.z - a.z;
    return Math.hypot(dx, dz) > 0.001 ? Math.atan2(dx, dz) : 0;
  }

  function poseFrom(value, computedHeading) {
    var raw = Array.isArray(value) ? { x: value[0], z: value[1] } : (value || {});
    var alt = raw.alt !== undefined && raw.alt !== null ? raw.alt : raw.altitude;
    var pose = {
      x: numberOr(raw.x, 0),
      z: numberOr(raw.z, 0),
      h: numberOr(raw.h, computedHeading || 0),
      s: numberOr(raw.s, 0)
    };
    if (alt !== undefined && alt !== null && isFinite(Number(alt))) {
      pose.alt = pose.altitude = Number(alt);
    }
    return pose;
  }

  function isFlying(key) {
    var v = G.vehicles && G.vehicles[key];
    return !!(v && (v.isAircraft || (v.spec && v.spec.flying)));
  }

  function roadPath(shot, start, finish, name) {
    if (typeof CC.computeRoute !== 'function') {
      throw new Error('CC.computeRoute is unavailable; cannot render road shot "' + name + '"');
    }
    var route;
    try {
      route = CC.computeRoute({ x: start.x, z: start.z }, { x: finish.x, z: finish.z });
    } catch (err) {
      throw new Error('Road routing failed for shot "' + name + '": ' + (err && err.message ? err.message : err));
    }
    var raw = route && Array.isArray(route.points)
      ? route.points.map(pointXZ).filter(function (p) { return p && isFinite(p.x) && isFinite(p.z); })
      : [];
    // computeRoute falls back to a bare start/finish line when no street path
    // exists. Never turn that fallback into a drivable waypoint list.
    if (raw.length < 3) {
      throw new Error('No road route found for shot "' + name +
        '" (computeRoute returned no street path; refusing a direct start-to-finish line)');
    }
    var heading = 0;
    for (var h = 1; h < raw.length; h++) {
      if (Math.hypot(raw[h].x - raw[0].x, raw[h].z - raw[0].z) > 0.01) {
        heading = headingBetween(raw[0], raw[h]);
        break;
      }
    }
    var waypoints = [];
    var spacing = 8;
    var radius = 5;
    for (var i = 1; i < raw.length; i++) {
      var a = raw[i - 1];
      var b = raw[i];
      var dx = b.x - a.x;
      var dz = b.z - a.z;
      var len = Math.hypot(dx, dz);
      if (len < 0.01) continue;
      var steps = Math.max(1, Math.ceil(len / spacing));
      for (var j = 1; j <= steps; j++) {
        var t = j / steps;
        var wp = { x: a.x + dx * t, z: a.z + dz * t, radius: radius };
        if (Math.hypot(wp.x - start.x, wp.z - start.z) < 2) continue;
        var last = waypoints[waypoints.length - 1];
        if (last && Math.hypot(last.x - wp.x, last.z - wp.z) < 1) continue;
        waypoints.push(wp);
      }
    }
    if (!waypoints.length) {
      throw new Error('No usable road waypoints for shot "' + name + '"');
    }
    var tail = waypoints[waypoints.length - 1];
    if (Math.hypot(tail.x - finish.x, tail.z - finish.z) > 1) {
      waypoints.push({ x: finish.x, z: finish.z, radius: radius });
    } else {
      tail.x = finish.x;
      tail.z = finish.z;
    }
    return { waypoints: waypoints, heading: heading };
  }

  async function runShot(shot, options) {
    shot = shot || {};
    options = options || {};
    var name = shot.name || 'shot';
    var mode = shot.mode;
    if (mode !== 'road' && mode !== 'straight') {
      throw new Error('Shot "' + name + '" has invalid mode "' + mode + '" (expected road or straight)');
    }
    var vehicle = shot.vehicle;
    if (!vehicle || !G.vehicles || !G.vehicles[vehicle]) {
      throw new Error('Shot "' + name + '" has unknown vehicle "' + vehicle + '"');
    }
    var startRaw = shot.start;
    var finishRaw = shot.finish;
    var start = shotPoint(shot, 'start', name);
    var finish = shotPoint(shot, 'finish', name);
    var durationSec = numberOr(shot.durationSec, NaN);
    if (!isFinite(durationSec) || durationSec < 0) {
      throw new Error('Shot "' + name + '" has invalid durationSec');
    }
    var units = numberOr(options.units, 1);
    if (units <= 0) units = 1;

    prepare();
    try {
      if (mode === 'road') {
        var road = roadPath(shot, start, finish, name);
        setGround(vehicle, poseFrom(startRaw, road.heading), road.waypoints,
          numberOr(shot.speed, 28), numberOr(shot.camera, 0), !!shot.boost);
      } else {
        var straightHeading = headingBetween(start, finish);
        var pose = poseFrom(startRaw, straightHeading);
        var camMode = numberOr(shot.camera, isFlying(vehicle) ? 2 : 0);
        if (isFlying(vehicle)) {
          var rawAlt = finishRaw && (finishRaw.alt !== undefined ? finishRaw.alt : finishRaw.altitude);
          var target = {
            x: finish.x,
            z: finish.z,
            alt: numberOr(rawAlt, 35),
            radius: numberOr(finishRaw && finishRaw.radius, 12)
          };
          setAir(vehicle, pose, [target], camMode);
        } else {
          setGround(vehicle, pose, [{ x: finish.x, z: finish.z, radius: 8 }],
            numberOr(shot.speed, 28), camMode, !!shot.boost);
        }
      }
      var durationMs = durationSec * 1000 * units;
      if (durationMs > 0) await wait(durationMs);
      return {
        ok: true, name: name, vehicle: vehicle, mode: mode, durationMs: durationMs
      };
    } finally {
      T.active = false;
      T.mode = 'manual';
      T.manual = makeInput();
      if (originalRead && G.readInput === patchedRead) G.readInput = originalRead;
    }
  }

  async function run(options) {
    options = options || {};
    if (options.shots) {
      var list = Array.isArray(options.shots) ? options.shots
        : (Array.isArray(options.shots.shots) ? options.shots.shots : null);
      if (!list) throw new Error('options.shots must be an array or {shots: []}');
      var results = [];
      for (var s = 0; s < list.length; s++) {
        results.push(await runShot(list[s], options));
      }
      return results;
    }
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
    if (!canvas) throw new Error('The game has no WebGL canvas to capture');
    // Adaptive resolution normally lowers the drawing buffer on software GL.
    // Pin it for the capture so every frame has the requested dimensions.
    G.basePixelRatio = 1;
    G.resCooldown = Number.POSITIVE_INFINITY;
    capture.fps = options.fps || 24;
    capture.width = options.width || canvas.width || window.innerWidth;
    capture.height = options.height || canvas.height || window.innerHeight;
    capture.frames = 0;
    capture.inline = [];
    capture.chain = Promise.resolve();

    // Preferred path: step simulation and rendering ourselves, then export each
    // canvas frame. Headless browsers throttle animation frames severely, which
    // makes MediaRecorder produce a nearly static clip even though the game
    // state changes.
    if (typeof G.stepFrame === 'function' && options.manual !== false) {
      capture.manual = true;
      G.manualFrame = true;
      G.renderer.setPixelRatio(1);
      G.renderer.setSize(capture.width, capture.height, false);
      return {
        ok: true, mode: 'frames', mime: 'image/jpeg', fps: capture.fps,
        width: capture.width, height: capture.height
      };
    }

    if (!canvas.captureStream) {
      throw new Error('This browser cannot capture the WebGL canvas stream');
    }
    var types = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm'
    ];
    var mime = types.find(function (t) { return window.MediaRecorder && MediaRecorder.isTypeSupported(t); });
    if (!mime) throw new Error('MediaRecorder WebM is not supported');
    var stream = canvas.captureStream(0);
    capture.track = stream.getVideoTracks()[0] || null;
    var recorder = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: options.bitrate || 8000000
    });
    capture.chunks = [];
    capture.mime = mime;
    if (capture.track && typeof capture.track.requestFrame === 'function' && G.renderer) {
      var renderer = G.renderer;
      var originalRender = renderer.render;
      renderer.render = function () {
        var result = originalRender.apply(renderer, arguments);
        try { capture.track.requestFrame(); } catch (ignored) {}
        return result;
      };
      capture.originalRender = originalRender;
      capture.renderPatched = true;
    }
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
    return { ok: true, mode: 'recorder', mime: mime };
  }

  function stopCapture() {
    if (capture.manual) {
      capture.manual = false;
      G.manualFrame = false;
      return capture.chain.then(function () {
        return { ok: true, mode: 'frames', frames: capture.frames, inline: capture.inline };
      });
    }
    return new Promise(function (resolve, reject) {
      var recorder = capture.recorder;
      if (!recorder) { resolve({ ok: false, reason: 'not recording' }); return; }
      recorder.onerror = function (e) { reject(e.error || new Error('MediaRecorder failed')); };
      recorder.onstop = function () {
        capture.chain.then(function () {
          if (capture.renderPatched && G && G.renderer && capture.originalRender) {
            G.renderer.render = capture.originalRender;
            capture.renderPatched = false;
            capture.originalRender = null;
          }
          if (capture.track && typeof capture.track.stop === 'function') capture.track.stop();
          resolve({ ok: true, mode: 'recorder', mime: capture.mime, inline: capture.inline });
        }, reject);
      };
      recorder.stop();
    });
  }

  window.CCTrailer = {
    run: run,
    runShot: runShot,
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
