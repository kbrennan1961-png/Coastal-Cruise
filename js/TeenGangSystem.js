/* Coastal Cruise - teen motorcycle crews.
 *
 * By day three crews tear donuts through parks, bus stops and home lawns,
 * leaving skid marks and trampled grass. After dark they burglarize houses and
 * steal parked cars. Cruisers pursue the suspects until contact = a bust.
 * Everything is spawned from the existing baked road, home and vehicle data.
 */
(function () {
  'use strict';

  const CC = window.CC;
  const C = CC.C;
  const U = CC.util;
  const rng = CC.rng ? CC.rng(0x7EA5C0) : Math.random;

  const jacketColors = [0xd94f67, 0x3f7fc4, 0x3da17a, 0xd88c37, 0x8a5cc4, 0x2f9fa8];
  const helmetColors = [0x23262d, 0x9d2c34, 0xe0c660, 0x2c4d78, 0x4c3a62];

  function safeSpot(x, z, margin) {
    margin = margin || 2.5;
    const W = C.WORLD;
    if (x < W.minX + 8 || x > W.maxX - 8 || z < W.minZ + 8 || z > W.maxZ - 8) return false;
    if (CC.coast.isWater(x, z) || CC.coast.distanceToWater(x, z) < margin) return false;
    let blocked = false;
    const hits = function (o) {
      if (U.distance2D(x, z, o.x, o.z) < (o.r || 4) + 1.2) blocked = true;
    };
    // Bikes call this while moving; the shared obstacle grid avoids scanning
    // every tree/building on the map each time.
    if (CC.forEachNearbyObstacle) CC.forEachNearbyObstacle(x, z, 8, hits);
    else {
      const obstacles = (CC.World && CC.World.obstacles) || [];
      for (let i = 0; i < obstacles.length; i++) {
        hits(obstacles[i]);
        if (blocked) break;
      }
    }
    return !blocked;
  }

  function roadPose(attempts) {
    attempts = attempts || 0;
    const roads = (CC.roadDefs || []).filter(function (r) {
      return r.type === 'paved' && r._length > 60;
    });
    if (!roads.length || attempts > 12) return { x: 0, z: 0, h: 0 };
    const road = U.pick(rng, roads);
    const s = U.randRange(rng, 18, road._length - 18);
    const p = CC.sampleRoad(road, s);
    const side = rng() < 0.5 ? 1 : -1;
    const off = road.width * 0.5 + 2.6;
    const x = p.x + p.dz * side * off;
    const z = p.z - p.dx * side * off;
    if (!safeSpot(x, z)) return roadPose(attempts + 1);
    return { x: x, z: z, h: Math.atan2(p.dx, p.dz) + (side < 0 ? Math.PI : 0) };
  }

  function homeList() {
    const list = (CC.Details && CC.Details.deliveryAddresses) || [];
    return list.filter(function (a) {
      const x = a.homeX == null ? a.x : a.homeX;
      const z = a.homeZ == null ? a.z : a.homeZ;
      return x != null && z != null && safeSpot(x + 6, z + 6, 2);
    });
  }

  function publicSpot() {
    const zones = CC.ImageMap && CC.ImageMap.zones || {};
    const names = ['park', 'boardwalk', 'amusement', 'pier', 'farm'];
    const stops = (CC.Details && CC.Details.busStops) || [];
    if (stops.length && rng() < 0.45) {
      const stop = U.pick(rng, stops);
      return { x: stop.x, z: stop.z, name: 'BUS STOP' };
    }
    for (let i = 0; i < 8; i++) {
      const name = U.pick(rng, names);
      const q = zones[name];
      if (!q) continue;
      const x = q.x + U.randRange(rng, -q.w * 0.35, q.w * 0.35);
      const z = q.z + U.randRange(rng, -q.h * 0.35, q.h * 0.35);
      if (safeSpot(x, z, 3)) return { x: x, z: z, name: name.toUpperCase() };
    }
    const p = roadPose();
    return { x: p.x, z: p.z, name: 'DOWNTOWN' };
  }

  class TeenBike {
    constructor(scene, index, system) {
      this.index = index;
      this.system = system;
      this.crew = Math.floor(index / 3) + 1;
      this.caught = false;
      this.wanted = false;
      this.mode = 'ride';
      this.timer = U.randRange(rng, 1.5, 6);
      this.speed = 0;
      this.heading = 0;
      this.radius = 0.95;
      this.spec = { radius: 0.95 };
      this.skidTimer = 0;
      this.vehicle = null;
      this.respawnTimer = 0;
      this.orbitAngle = 0;
      this.orbitRadius = 6;
      this.cruiseSpeed = U.randRange(rng, 13, 18);

      const pose = roadPose();
      this.pos = new THREE.Vector3(pose.x, CC.heightAt(pose.x, pose.z) + 0.38, pose.z);
      this.heading = pose.h;
      this.target = { x: pose.x, z: pose.z, name: 'CRUISING', kind: 'road' };

      this.group = new THREE.Group();
      const visual = CC.VehicleFactory.build('motorcycle', jacketColors[index % jacketColors.length]);
      this.group.add(visual.group);
      this.wheels = visual.wheels || [];

      const rider = CC.CharacterFactory.build({
        skin: U.pick(rng, [0xe8bd96, 0xc98d68, 0x9b6a4a, 0xf0c8a4]),
        shirt: jacketColors[index % jacketColors.length],
        pants: 0x222731,
        shoes: 0x15171b,
        hair: U.pick(rng, [0x2b211c, 0x4a3325, 0x16181c]),
        hat: helmetColors[index % helmetColors.length]
      });
      rider.group.scale.setScalar(0.78);
      rider.group.position.set(0, 0.42, -0.08);
      this.group.add(rider.group);
      this.rider = rider;

      this.group.position.copy(this.pos);
      this.group.rotation.y = this.heading;
      scene.add(this.group);
      this.chooseTarget();
    }

    chooseTarget() {
      const night = !!(CC.Weather && CC.Weather.night > 0.45);
      const homes = homeList();
      if (homes.length && (night || rng() < 0.55)) {
        const a = U.pick(rng, homes);
        const x = a.homeX == null ? a.x : a.homeX;
        const z = a.homeZ == null ? a.z : a.homeZ;
        this.target = {
          x: x + U.randRange(rng, -2, 2), z: z + U.randRange(rng, -2, 2),
          name: a.label || a.household || 'HOME', kind: 'home'
        };
      } else {
        const p = publicSpot();
        this.target = { x: p.x, z: p.z, name: p.name, kind: 'public' };
      }
      this.mode = 'ride';
      this.timer = U.randRange(rng, 5, 13);
      this.cruiseSpeed = U.randRange(rng, 13, 18);
    }

    farTarget() {
      const p = roadPose();
      this.target = { x: p.x, z: p.z, name: 'OUT OF TOWN', kind: 'road' };
      this.mode = 'flee';
      this.timer = U.randRange(rng, 24, 45);
    }

    syncVisual(dt) {
      this.group.position.copy(this.pos);
      this.group.rotation.y = this.heading;
      // Lean into donuts so a stationary orbit still reads as riding.
      this.group.rotation.z = this.mode === 'donut' ? -0.22 : 0;
      const spin = (this.speed / 0.38) * dt;
      for (let i = 0; i < this.wheels.length; i++) this.wheels[i].rotation.y += spin;
    }

    moveToward(dt, cruise) {
      let dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z;
      const d = Math.hypot(dx, dz) || 0.001;
      const desired = Math.atan2(dx, dz);
      this.heading = U.angleLerp(this.heading, desired, 1 - Math.exp(-4.5 * dt));
      this.speed = U.damp(this.speed, cruise, 1.6, dt);
      const step = this.speed * dt;
      let nx = this.pos.x + Math.sin(this.heading) * step;
      let nz = this.pos.z + Math.cos(this.heading) * step;
      if (!safeSpot(nx, nz, 1.8)) {
        this.heading += (rng() < 0.5 ? -1 : 1) * 1.9 * dt;
        nx = this.pos.x + Math.sin(this.heading) * step;
        nz = this.pos.z + Math.cos(this.heading) * step;
        if (!safeSpot(nx, nz, 1.8)) { nx = this.pos.x; nz = this.pos.z; }
      }
      this.pos.set(nx, CC.heightAt(nx, nz) + 0.38, nz);
      return d;
    }

    update(dt) {
      if (this.respawnTimer > 0) {
        this.respawnTimer -= dt;
        if (this.respawnTimer <= 0) this.respawn();
        return;
      }
      if (this.caught) return;
      this.timer -= dt;

      if (this.mode === 'donut') this.updateDonut(dt);
      else if (this.mode === 'burglary') this.updateBurglary(dt);
      else if (this.mode === 'flee') this.updateFlee(dt);
      else {
        // Hold one cruising speed per target instead of re-rolling it every
        // frame, which otherwise makes the throttle visibly jitter.
        const d = this.moveToward(dt, this.cruiseSpeed);
        if (d < 9) {
          const night = !!(CC.Weather && CC.Weather.night > 0.45);
          if (night) {
            this.mode = 'burglary';
            this.timer = U.randRange(rng, 1.6, 3.2);
            this.speed = 0;
          } else {
            this.mode = 'donut';
            this.timer = U.randRange(rng, 7, 11);
            this.orbitAngle = Math.atan2(this.pos.z - this.target.z, this.pos.x - this.target.x);
            this.orbitRadius = U.randRange(rng, 5.5, 8);
          }
        }
      }
      this.syncVisual(dt);
    }

    updateDonut(dt) {
      this.orbitAngle += dt * 1.55;
      const x = this.target.x + Math.cos(this.orbitAngle) * this.orbitRadius;
      const z = this.target.z + Math.sin(this.orbitAngle) * this.orbitRadius;
      this.heading = Math.atan2(-Math.sin(this.orbitAngle), Math.cos(this.orbitAngle));
      this.speed = this.orbitRadius * 1.55;
      if (safeSpot(x, z, 1)) this.pos.set(x, CC.heightAt(x, z) + 0.38, z);
      this.skidTimer -= dt;
      if (this.skidTimer <= 0) {
        this.skidTimer = 0.16;
        this.system.addDecal('skid', this.pos.x, this.pos.z, this.heading, 2.1, 0.34);
      }
      if (this.timer <= 0) {
        this.system.teenDonuts++;
        this.system.teenVandalism++;
        if (this.target.kind === 'home') {
          this.system.addDecal('lawn', this.target.x, this.target.z, 0, 7, 7);
          this.system.message('Teen crew tore up a lawn on ' + this.target.name);
        } else {
          this.system.message('Teen crew is doing donuts at ' + this.target.name);
        }
        this.chooseTarget();
      }
    }

    updateBurglary(dt) {
      this.speed = 0;
      this.heading = U.angleLerp(this.heading,
        Math.atan2(this.target.x - this.pos.x, this.target.z - this.pos.z), 1 - Math.exp(-3 * dt));
      if (this.timer > 0) return;
      this.system.teenBurglaries++;
      this.wanted = true;
      const stolen = this.stealCar();
      this.system.message(stolen
        ? 'Home burglary and car theft reported on ' + this.target.name + ' — cruisers dispatched'
        : 'Home burglary reported on ' + this.target.name + ' — cruisers dispatched');
      this.farTarget();
    }

    stealCar() {
      const N = CC.NPCSystem;
      if (!N || !N.nearestParkedCar || !N.spawnGangCar) return false;
      const car = N.nearestParkedCar({ x: this.target.x, z: this.target.z }, 13);
      if (!car) return false;
      car.setStolen(true);
      const driven = N.spawnGangCar(car);
      if (!driven) return false;
      driven.teenOwner = this;
      this.vehicle = driven;
      this.group.visible = false;
      this.pos.copy(driven.pos);
      this.system.teenCarThefts++;
      return true;
    }

    updateFlee(dt) {
      if (this.vehicle) {
        if (this.vehicle.disabled || !this.vehicle.group.visible) {
          this.vehicle = null;
          this.group.visible = true;
          this.pos.set(this.pos.x, CC.heightAt(this.pos.x, this.pos.z) + 0.38, this.pos.z);
        } else {
          this.pos.copy(this.vehicle.pos);
          this.heading = this.vehicle.heading || this.heading;
          this.speed = this.vehicle.speed || 0;
          this.syncVisual(dt);
          return;
        }
      }
      const d = this.moveToward(dt, 22 + (this.crew * 1.5));
      if (d < 12 || this.timer <= 0) this.farTarget();
    }

    respawn() {
      const pose = roadPose();
      this.caught = false;
      this.wanted = false;
      this.vehicle = null;
      this.pos.set(pose.x, CC.heightAt(pose.x, pose.z) + 0.38, pose.z);
      this.heading = pose.h;
      this.group.visible = true;
      this.speed = 0;
      this.chooseTarget();
      this.system.message('Another teen crew is out looking for trouble');
    }
  }

  const TeenGangSystem = (CC.TeenGangSystem = {
    ready: false,
    bikes: [],
    decals: [],
    scene: null,
    teenGangs: 3,
    teenBikes: 0,
    teenVandalism: 0,
    teenDonuts: 0,
    teenBurglaries: 0,
    teenCarThefts: 0,
    teenArrests: 0,
    messageCooldown: 0,
    policeAssignTimer: 0,
    _decalGeo: null,
    _skidMat: null,
    _lawnMat: null,

    init(scene) {
      if (this.ready || !scene) return this;
      this.scene = scene;
      this._decalGeo = new THREE.PlaneGeometry(1, 1);
      this._skidMat = new THREE.MeshBasicMaterial({
        color: 0x272a2a, transparent: true, opacity: 0.55, depthWrite: false
      });
      this._lawnMat = new THREE.MeshBasicMaterial({
        color: 0x55703e, transparent: true, opacity: 0.62, depthWrite: false
      });
      for (let i = 0; i < 9; i++) this.bikes.push(new TeenBike(scene, i, this));
      this.teenBikes = this.bikes.length;
      this.ready = true;
      return this;
    },

    addDecal(kind, x, z, heading, w, l) {
      if (!this.scene || !this._decalGeo) return;
      const mesh = new THREE.Mesh(this._decalGeo,
        kind === 'lawn' ? this._lawnMat : this._skidMat);
      mesh.position.set(x, CC.heightAt(x, z) + 0.04, z);
      mesh.rotation.set(-Math.PI / 2, 0, -(heading || 0));
      mesh.scale.set(w || 2, l || 0.4, 1);
      mesh.renderOrder = 1;
      this.scene.add(mesh);
      this.decals.push(mesh);
      if (this.decals.length > 90) {
        const old = this.decals.shift();
        this.scene.remove(old);
      }
    },

    message(text) {
      if (this.messageCooldown > 0) return;
      this.messageCooldown = 7;
      if (CC.Game && CC.Game.showMessage) CC.Game.showMessage(text, 3);
    },

    // Called from NPCSystem.update before the cruisers are stepped. Ranking
    // cruisers against suspects several times a second is indistinguishable
    // from doing it every frame, so the expensive pass is throttled.
    assignPolice(dt, N) {
      const step = Number(dt) > 0 ? Number(dt) : 1 / 60;
      this.policeAssignTimer -= step;
      const cars = (N && N.policeCars) || [];
      const suspects = this.bikes.filter(function (t) {
        return t.wanted && !t.caught && t.pos;
      });
      cars.forEach(function (p) {
        if (!p.teenSuspect) return;
        if (!p.teenSuspect.wanted || p.teenSuspect.caught ||
            suspects.indexOf(p.teenSuspect) < 0) {
          p.teenSuspect = null;
          if (!N.wanted) { p.chase = false; p.mode = 'patrol'; }
        }
      });
      if (!suspects.length || this.policeAssignTimer > 0) return;
      this.policeAssignTimer = 0.25;
      const playerWanted = !!(N && N.wanted && N.wantedStars > 0);
      suspects.forEach(function (suspect) {
        const ranked = cars.filter(function (p) {
          return !p.disabled && (!playerWanted || !p.chase);
        }).sort(function (a, b) {
          return U.distance2D(a.pos.x, a.pos.z, suspect.pos.x, suspect.pos.z) -
            U.distance2D(b.pos.x, b.pos.z, suspect.pos.x, suspect.pos.z);
        });
        const count = Math.min(ranked.length, playerWanted ? 1 : 2);
        for (let i = 0; i < count; i++) {
          ranked[i].teenSuspect = suspect;
          ranked[i].chase = true;
        }
      });
    },

    arrest(teen, car) {
      if (!teen || teen.caught) return;
      teen.caught = true;
      teen.wanted = false;
      teen.speed = 0;
      teen.group.visible = false;
      if (teen.vehicle) {
        teen.vehicle.disabled = true;
        teen.vehicle.group.visible = false;
        teen.vehicle = null;
      }
      this.teenArrests++;
      const N = CC.NPCSystem;
      (N && N.policeCars || []).forEach(function (p) {
        if (p.teenSuspect === teen) {
          p.teenSuspect = null;
          p.chase = false;
          p.mode = 'patrol';
        }
      });
      teen.respawnTimer = U.randRange(rng, 18, 32);
      this.message('Teen crew busted — ' + this.teenArrests + ' caught so far');
      if (CC.Audio && CC.Audio.siren) CC.Audio.siren();
    },

    update(dt) {
      if (!this.ready) return;
      this.messageCooldown = Math.max(0, this.messageCooldown - dt);
      for (let i = 0; i < this.bikes.length; i++) this.bikes[i].update(dt);
    }
  });
})();
