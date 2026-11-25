/* Coastal Cruise - shared drawbridge schedule and moving-span visuals.
   Default drawbridges use 15-minutes-down / 5-minutes-up cycle. Selected
   crossings can be bascule bridges with boat-triggered state machines. */
(function () {
  'use strict';

  const CC = window.CC;
  const U = CC.util;
  const _slide = { dist: 0, t: 0, x: 0, z: 0, dx: 0, dz: 0 };

  const BASCULE_TARGETS = [
    { x: 138, z: -40 },
    { x: 96, z: 180 }
  ];

  function spanCenter(s) { return { x: (s.ax + s.bx) * 0.5, z: (s.az + s.bz) * 0.5 }; }
  function spanLen(s) { return Math.hypot(s.bx - s.ax, s.bz - s.az) || 1; }
  function spanDir(s) { const l = spanLen(s); return { x: (s.bx - s.ax) / l, z: (s.bz - s.az) / l, l: l }; }

  const Drawbridges = (CC.Drawbridges = {
    spans: [],
    visuals: [],
    gates: [],
    beacons: [],
    barrierClosed: false,
    openAmount: 0,
    open: false,
    warning: false,
    phase: 0,

    init() {
      this.spans = (CC.bridgeSegments || []).filter(function (s) { return s.drawbridge; });
      this.visuals.length = 0;
      this.gates.length = 0;
      this.beacons.length = 0;
      this.barrierClosed = false;
      this.bascule = [];
      this._initBascule();
    },

    _initBascule() {
      this.bascule.length = 0;
      const self = this;
      BASCULE_TARGETS.forEach(function (target) {
        let best = null, bestD = Infinity;
        self.spans.forEach(function (s) {
          const r = U.distanceToSegment(target.x, target.z, s.ax, s.az, s.bx, s.bz, _slide);
          if (r.dist < bestD) { bestD = r.dist; best = s; }
        });
        if (best && bestD < 80) {
          best.bascule = true;
          best.basculeState = 'CLOSED';
          best.basculeTimer = 0;
          best.basculeAmount = 0; // 0 closed, 1 open
          best.basculeGate = 0;   // 0 up/open road, 1 down/blocking
          best.basculeWarn = 0;
          best.basculeMarineGreen = false;
          best.basculeClearDelay = 0;
          self.bascule.push(best);
        }
      });
    },

    isBascule(span) { return !!(span && span.bascule); },

    isChannelClear(span) {
      // Used by boats: true when span is fully open and clear to pass.
      if (!span || !span.bascule) return !this.open;
      return span.basculeState === 'OPEN' && span.basculeAmount >= 0.99;
    },

    // Register one moving deck slice. `weight` matches the taper used by
    // liftAt() so the visible deck and the drivable surface stay together.
    registerVisual(object, baseY, weight, span) {
      this.visuals.push({ object: object, baseY: baseY, weight: weight, span: span || null });
    },

    registerBasculeLeaf(group, span, side) {
      // side: -1 = leaf hinged at span start (ax,az), +1 = hinged at span end
      this.visuals.push({ object: group, baseY: 0, weight: 1, span: span || null, basculeLeaf: true, side: side });
    },

    // Gate arms are animated here so the collision obstacle and the mesh
    // always agree about whether the crossing is open.
    registerGate(group, arm, obstacle, span) {
      this.gates.push({ group: group, arm: arm, obstacle: obstacle, amount: 0, span: span || null });
    },

    registerBeacon(object, span) {
      if (object && span) object.userData = object.userData || {}, object.userData.span = span;
      this.beacons.push(object);
    },

    project(s, x, z) {
      const r = U.distanceToSegment(x, z, s.ax, s.az, s.bx, s.bz, _slide);
      // Match the drivable deck exactly so scenery beside a bridge never jumps
      // with an opening leaf.
      const lateral = CC.bridgeLateral ? CC.bridgeLateral(s, r.dist) : 0;
      if (lateral <= 0) return null;
      r.lateral = lateral;
      return r;
    },

    // Taper the raised leaf into the fixed approach spans at both ends. Using
    // the recorded water interval keeps the moving leaf over the channel even
    // though each bridge now has a long land approach.
    weightAt(t, span) {
      if (!span) {
        const centre = 1 - Math.abs(t - 0.5) * 2;
        return U.smoothstep(0.08, 0.4, centre);
      }
      const len = Math.hypot(span.bx - span.ax, span.bz - span.az) || 1;
      const along = t * len;
      const reach = CC.BRIDGE.approachLength || 46;
      const ws = span.waterStart == null ? 0 : span.waterStart;
      const we = span.waterEnd == null ? len : span.waterEnd;
      const leftReach = Math.min(reach, ws), rightReach = Math.min(reach, len - we);
      if (along < ws) {
        return ws > 0.5 ? U.smoothstep(ws - leftReach, ws, along) : 1;
      }
      if (along > we) {
        return len - we > 0.5 ? U.smoothstep(we + rightReach, we, along) : 1;
      }
      return 1;
    },

    spanOpenAmount(span) {
      if (!span) return this.openAmount;
      return span.bascule ? (span.basculeAmount || 0) : this.openAmount;
    },

    liftAt(x, z, span, t) {
      if (!this.spans.length) return 0;
      if (span && span.drawbridge) {
        const amt = this.spanOpenAmount(span);
        if (amt <= 0) return 0;
        const r = this.project(span, x, z);
        if (!r) return 0;
        return CC.BRIDGE.drawLift * amt * this.weightAt(t == null ? r.t : t, span) *
          (r.lateral == null ? 1 : r.lateral);
      }
      let lift = 0;
      for (let i = 0; i < this.spans.length; i++) {
        const s = this.spans[i];
        const amt = this.spanOpenAmount(s);
        if (amt <= 0) continue;
        const r = this.project(s, x, z);
        if (!r) continue;
        lift = Math.max(lift, CC.BRIDGE.drawLift * amt *
          this.weightAt(r.t, s) * r.lateral);
      }
      return lift;
    },

    near(x, z, margin) {
      for (let i = 0; i < this.spans.length; i++) {
        const s = this.spans[i];
        const r = U.distanceToSegment(x, z, s.ax, s.az, s.bx, s.bz, _slide);
        if (r.dist <= s.width * 0.5 + (margin || 6)) return true;
      }
      return false;
    },

    // Traffic lights sit just outside each approach. This is used when the
    // signal is placed; the schedule itself is global, not per bridge.
    isApproach(x, z) {
      for (let i = 0; i < this.spans.length; i++) {
        const s = this.spans[i];
        const r = U.distanceToSegment(x, z, s.ax, s.az, s.bx, s.bz, _slide);
        const endDistance = Math.min(r.t, 1 - r.t) *
          Math.hypot(s.bx - s.ax, s.bz - s.az);
        if (r.dist <= s.width * 0.5 + 10 && endDistance <= 14) return true;
      }
      return false;
    },

    lightState(span) {
      if (span && span.bascule) {
        return (span.basculeState === 'CLOSED') ? 'green' : 'red';
      }
      return this.warning || this.open ? 'red' : 'green';
    },

    _spanHasBoat(span) {
      const ships = (CC.NPCSystem && CC.NPCSystem.watercraft) || [];
      const c = spanCenter(span), d = spanDir(span);
      for (let i = 0; i < ships.length; i++) {
        const v = ships[i];
        if (!v || !v.group || !v.group.visible) continue;
        const p = v.group.position;
        const dx = p.x - c.x, dz = p.z - c.z;
        const along = dx * d.x + dz * d.z;
        const across = Math.abs(-dx * d.z + dz * d.x);
        // approach zones upstream/downstream + under-bridge clearance zone
        if (across < 26 && Math.abs(along) < 70) return true;
      }
      return false;
    },

    _updateBascule(span, dt, time) {
      const st = span.basculeState || 'CLOSED';
      const boatNear = this._spanHasBoat(span);
      span.basculeTimer = (span.basculeTimer || 0) + dt;
      if (st === 'CLOSED') {
        span.basculeAmount = Math.max(0, (span.basculeAmount || 0) - dt * 0.35);
        span.basculeGate = Math.max(0, (span.basculeGate || 0) - dt * 0.45);
        span.basculeMarineGreen = false;
        span.basculeWarn = 0;
        if (boatNear) { span.basculeState = 'WARNING'; span.basculeTimer = 0; }
      } else if (st === 'WARNING') {
        span.basculeWarn = 1;
        span.basculeMarineGreen = false;
        // yellow/red already represented by red lightState; lower gates
        span.basculeGate = Math.min(1, (span.basculeGate || 0) + dt * 0.5);
        if (span.basculeGate >= 0.99 && span.basculeTimer > 1.2) { span.basculeState = 'OPENING'; span.basculeTimer = 0; }
      } else if (st === 'OPENING') {
        span.basculeGate = 1;
        span.basculeWarn = 1;
        span.basculeAmount = Math.min(1, (span.basculeAmount || 0) + dt * 0.25);
        if (span.basculeAmount >= 0.995) { span.basculeAmount = 1; span.basculeState = 'OPEN'; span.basculeTimer = 0; span.basculeMarineGreen = true; }
      } else if (st === 'OPEN') {
        span.basculeGate = 1; span.basculeAmount = 1; span.basculeWarn = 1; span.basculeMarineGreen = true;
        if (boatNear) span.basculeClearDelay = 1.8;
        else span.basculeClearDelay = Math.max(0, (span.basculeClearDelay || 0) - dt);
        if (!boatNear && (span.basculeClearDelay || 0) <= 0) { span.basculeState = 'CLOSING'; span.basculeTimer = 0; span.basculeMarineGreen = false; }
      } else if (st === 'CLOSING') {
        span.basculeGate = 1; span.basculeWarn = 1; span.basculeMarineGreen = false;
        span.basculeAmount = Math.max(0, (span.basculeAmount || 0) - dt * 0.25);
        if (boatNear) { span.basculeState = 'OPENING'; span.basculeTimer = 0; }
        else if (span.basculeAmount <= 0.005) { span.basculeAmount = 0; span.basculeState = 'CLOSED'; span.basculeTimer = 0; span.basculeGate = 0; span.basculeWarn = 0; }
      }
      this.barrierClosed = this.barrierClosed || span.basculeState !== 'CLOSED' || span.basculeGate > 0.1;
      // update marine beacons
      if (span._marineLights) {
        const green = !!span.basculeMarineGreen;
        for (let i = 0; i < span._marineLights.length; i++) {
          span._marineLights[i].red.visible = !green;
          span._marineLights[i].green.visible = green;
        }
      }
    },

    update(dt, time) {
      const B = CC.BRIDGE;
      const period = B.downSeconds + B.upSeconds;
      const phase = ((time % period) + period) % period;
      this.phase = phase;
      let amount = 0;
      let warning = false;
      let open = false;
      if (phase >= B.downSeconds - B.warningSeconds && phase < B.downSeconds) {
        warning = true;
      }
      if (phase >= B.downSeconds) {
        open = true;
        const t = B.transitionSeconds;
        if (phase < B.downSeconds + t) {
          amount = U.smoothstep(0, 1, (phase - B.downSeconds) / t);
        } else if (phase > period - t) {
          amount = U.smoothstep(0, 1, (period - phase) / t);
        } else {
          amount = 1;
        }
      }
      this.openAmount = amount;
      this.open = open && amount > 0.02;
      this.warning = warning || (open && amount < 1);

      this.barrierClosed = false;
      for (let i = 0; i < (this.bascule || []).length; i++) this._updateBascule(this.bascule[i], dt, time);

      for (let i = 0; i < this.visuals.length; i++) {
        const v = this.visuals[i];
        const amt = (v.span && v.span.bascule) ? (v.span.basculeAmount || 0) : amount;
        if (v.basculeLeaf) {
          const maxAng = 70 * Math.PI / 180;
          // Positive rotation lifts leaf tip upward for both hinge sides.
          v.object.rotation.x = v.side * maxAng * amt;
        } else {
          v.object.position.y = v.baseY + CC.BRIDGE.drawLift * amt * v.weight;
        }
      }

      // Signals are red for the whole warning/open window for timed drawbridges.
      const globalClosed = this.warning || this.open;
      this.barrierClosed = this.barrierClosed || globalClosed;
      const step = dt > 0 ? Math.min(1, dt / 2.5) : 1;
      for (let i = 0; i < this.gates.length; i++) {
        const g = this.gates[i];
        const spanClosed = g.span && g.span.bascule ? (g.span.basculeState !== 'CLOSED' || (g.span.basculeGate || 0) > 0.02) : globalClosed;
        const target = spanClosed ? 1 : 0;
        g.amount += (target - g.amount) * step;
        if (Math.abs(g.amount - target) < 0.01) g.amount = target;
        if (g.arm) g.arm.rotation.z = -1.18 * (1 - g.amount);
        if (g.obstacle) g.obstacle.disabled = g.amount < 0.5;
      }
      const flash = Math.sin(time * 9) > 0;
      for (let i = 0; i < this.beacons.length; i++) {
        const b = this.beacons[i];
        const span = b.userData ? b.userData.span : null;
        if (span && span.bascule) b.visible = span.basculeState !== 'CLOSED' && flash;
        else b.visible = globalClosed && flash;
      }
    }
  });

  CC.drawbridgeLiftAt = function (x, z, span, t) {
    return Drawbridges.liftAt(x, z, span, t);
  };
})();
