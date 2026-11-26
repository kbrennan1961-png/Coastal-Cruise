/* Convert INAV mission plans into trailer/cutscene camera shots.
 *
 * Usable from the browser (window.CC.MissionShots) and from Node
 * (require('./js/MissionShots.js')). The trailer harness consumes the returned
 * {shots: [...]} through tools/trailer.js --shots. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.CC = root.CC || {};
    root.CC.MissionShots = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function num(value, fallback) {
    if (value === undefined || value === null || value === '') return fallback;
    var n = Number(value);
    return isFinite(n) ? n : fallback;
  }

  function xz(value) {
    if (Array.isArray(value)) return { x: num(value[0], 0), z: num(value[1], 0) };
    if (value && typeof value === 'object') {
      return { x: num(value.x, 0), z: num(value.z, 0) };
    }
    return { x: 0, z: 0 };
  }

  function xyz(value, fallback) {
    if (Array.isArray(value)) {
      return { x: num(value[0], fallback.x), y: num(value[1], fallback.y), z: num(value[2], fallback.z) };
    }
    if (value && typeof value === 'object') {
      return {
        x: num(value.x, fallback.x),
        y: num(value.y != null ? value.y : value.h, fallback.y),
        z: num(value.z, fallback.z)
      };
    }
    return fallback;
  }

  function pointOf(wp) {
    var p = xz(wp || {});
    p.alt = num(wp && wp.altCm, 500) / 100;
    if (p.alt < 0.4) p.alt = 0.4;
    return p;
  }

  function copyPoint(p) {
    return { x: p.x, z: p.z, alt: p.alt };
  }

  function travelSeconds(a, b, speedCmS, minSeconds, maxSeconds) {
    var speed = Math.max(1, num(speedCmS, 1500)) / 100;
    var distance = Math.hypot(b.x - a.x, b.z - a.z) +
      Math.abs((b.alt || 0) - (a.alt || 0)) * 0.5;
    return Math.max(minSeconds, Math.min(maxSeconds, distance / speed));
  }

  function toShots(input, options) {
    options = options || {};
    var missions = Array.isArray(input) ? input
      : (input && Array.isArray(input.missions) ? input.missions : []);
    var index = Math.max(0, Math.min(missions.length - 1, num(options.missionIndex, 0)));
    var mission = missions[index];
    if (!mission) return { shots: [] };

    var vehicle = options.vehicle || 'fpv';
    var camera = num(options.camera, 1);
    var minSeconds = Math.max(0.2, num(options.minSeconds, 1));
    var maxSeconds = Math.max(minSeconds, num(options.maxSeconds, 20));
    var home = xz(mission.home || {});
    home.alt = 2;
    var actions = Array.isArray(mission.actions)
      ? mission.actions : (Array.isArray(mission.waypoints) ? mission.waypoints : []);
    var shots = [];
    // The aircraft starts at mission home, so the first leg is home -> WP1.
    var prev = copyPoint(home);

    function addShot(name, start, finish, seconds, wp, lookAt) {
      var shot = {
        name: name,
        mode: 'straight',
        vehicle: vehicle,
        camera: camera,
        durationSec: Math.round(seconds * 100) / 100,
        start: { x: start.x, z: start.z, alt: start.alt },
        finish: { x: finish.x, z: finish.z, alt: finish.alt, radius: 3 },
        action: wp && wp.action ? String(wp.action).toUpperCase() : 'WAYPOINT'
      };
      if (wp && wp.speedCmS != null) shot.speedCmS = num(wp.speedCmS, 1500);
      if (lookAt) shot.lookAt = lookAt;
      shots.push(shot);
    }

    for (var i = 0; i < actions.length; i++) {
      var wp = actions[i] || {};
      var action = String(wp.action || 'WAYPOINT').toUpperCase();
      var target = pointOf(wp);
      var seconds = travelSeconds(prev, target, wp.speedCmS, minSeconds, maxSeconds);
      var label = String(i + 1).padStart(2, '0') + ' ' + action;

      if (action === 'POSHOLD_TIME') {
        seconds = Math.max(minSeconds, Math.min(maxSeconds, num(wp.holdSec, 2)));
        addShot(label, prev, prev, seconds, wp);
      } else if (action === 'SET_POI') {
        var fallback = { x: prev.x, y: prev.alt, z: prev.z };
        addShot(label, prev, prev, Math.max(minSeconds, Math.min(maxSeconds, 2)), wp,
          xyz(wp.poi, fallback));
      } else if (action === 'JUMP') {
        var jumpTo = Math.max(1, Math.floor(num(wp.jumpTarget, 1)));
        var jumped = pointOf(actions[Math.min(actions.length - 1, jumpTo - 1)] || {});
        addShot(label + ' → ' + jumpTo, jumped, jumped, minSeconds, wp);
        prev = jumped;
      } else if (action === 'LAND') {
        var ground = { x: target.x, z: target.z, alt: 0.4 };
        addShot(label, target, ground, seconds, wp);
        prev = ground;
      } else {
        addShot(label, prev, target, seconds, wp);
        prev = target;
      }
    }

    var finalPoint = copyPoint(prev);
    var homePoint = { x: home.x, z: home.z, alt: 2 };
    addShot(String(shots.length + 1).padStart(2, '0') + ' RTH', finalPoint, homePoint,
      travelSeconds(finalPoint, homePoint, 1500, minSeconds, maxSeconds),
      { action: 'RTH', speedCmS: 1500 });

    return { shots: shots, mission: mission.name || 'INAV Mission' };
  }

  return { toShots: toShots, pointOf: pointOf };
});
