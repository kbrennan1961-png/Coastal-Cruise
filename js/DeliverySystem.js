/* Coastal Cruise - food delivery gigs. Stop at a restaurant to pick up an
   order, follow the GPS marker to a numbered home, then stop at the porch to
   hand it to the resident and get paid. No new keys or fetch calls: it reuses
   the existing waypoint router, the cash HUD and the ordinary pedestrian NPC. */
(function () {
  'use strict';

  const CC = window.CC;
  const U = CC.util;

  const FIRST_NAMES = [
    'Alex', 'Bailey', 'Casey', 'Dana', 'Emery', 'Frankie', 'Harper', 'Indigo',
    'Jamie', 'Kai', 'Logan', 'Morgan', 'Noel', 'Parker', 'Quinn', 'Riley',
    'Sam', 'Taylor', 'Unity', 'Val', 'Wren', 'Yara'
  ];

  function markerTexture(text, color) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(8, 24, 30, 0.88)';
    g.fillRect(8, 18, 240, 92);
    g.strokeStyle = color;
    g.lineWidth = 5;
    g.strokeRect(8, 18, 240, 92);
    g.fillStyle = color;
    g.font = 'bold 46px Arial';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 128, 64, 224);
    const tex = new THREE.CanvasTexture(c);
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  const System = (CC.DeliverySystem = {
    ready: false,
    restaurants: [],
    addresses: [],
    active: null,
    resident: null,
    marker: null,
    pickupSprite: null,
    deliverySprite: null,
    cooldowns: {},
    pickupCandidate: null,
    pickupDwell: 0,
    deliveryDwell: 0,
    lastAddressKey: null,
    deliveriesStarted: 0,
    deliveries: 0,
    earnings: 0,

    init: function (scene) {
      this.scene = scene || (CC.Game && CC.Game.scene) || null;
      this.restaurants = this.buildRestaurants();
      this.addresses = ((CC.Details && CC.Details.deliveryAddresses) || []).filter(function (a) {
        return a && isFinite(a.x) && isFinite(a.z) && a.label;
      });
      this.buildMarker();
      this.ready = !!(this.scene && this.restaurants.length && this.addresses.length);
      return this;
    },

    buildRestaurants: function () {
      const list = [];
      const seen = {};
      function add(r) {
        if (!r || !isFinite(r.x) || !isFinite(r.z) || seen[r.key]) return;
        seen[r.key] = true;
        list.push(r);
      }
      const venues = (CC.InteriorSystem && CC.InteriorSystem.venues) || [];
      venues.forEach(function (v) {
        if (v.type !== 'restaurant') return;
        add({ key: 'venue-' + v.key, name: v.name, x: v.doorX, z: v.doorZ });
      });
      ((CC.Details && CC.Details.foodPickupSites) || []).forEach(function (r) {
        add({ key: 'boardwalk-' + r.key, name: r.name, x: r.x, z: r.z });
      });
      const fast = CC.ImageMap && CC.ImageMap.zones && CC.ImageMap.zones.fastfood;
      if (fast) {
        // The drag-bay pickup window sits just east of the Burger Bay kitchen.
        add({ key: 'fastfood', name: 'BURGER BAY', x: fast.x + 11, z: fast.z - 3 });
      }
      return list;
    },

    buildMarker: function () {
      if (!this.scene || this.marker) return;
      const group = new THREE.Group();
      const pickupMap = markerTexture('PICKUP', '#7cf0c6');
      const deliveryMap = markerTexture('DELIVER', '#ffd166');
      const pickup = new THREE.Sprite(new THREE.SpriteMaterial({
        map: pickupMap, transparent: true, depthTest: false, depthWrite: false
      }));
      pickup.scale.set(10, 5, 1);
      pickup.position.y = 6.2;
      const delivery = new THREE.Sprite(new THREE.SpriteMaterial({
        map: deliveryMap, transparent: true, depthTest: false, depthWrite: false
      }));
      delivery.scale.set(10, 5, 1);
      delivery.position.y = 6.2;
      delivery.visible = false;
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.1, 5.4, 6),
        new THREE.MeshBasicMaterial({ color: 0x8ff5ce, transparent: true, opacity: 0.5, depthWrite: false })
      );
      beam.position.y = 2.7;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(1.5, 2.1, 24),
        new THREE.MeshBasicMaterial({
          color: 0x8ff5ce, transparent: true, opacity: 0.55,
          side: THREE.DoubleSide, depthWrite: false
        })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.12;
      group.add(pickup, delivery, beam, ring);
      group.visible = false;
      this.scene.add(group);
      this.marker = group;
      this.pickupSprite = pickup;
      this.deliverySprite = delivery;
      this.markerBeam = beam;
      this.markerRing = ring;
    },

    canUse: function (v) {
      return !!(v && v.pos && !v.isFpv && !v.isAircraft &&
        !(v.spec && v.spec.water));
    },

    nearestRestaurant: function (pos, radius, ignoreCooldown) {
      if (!pos) return null;
      let best = null, bestD = radius || 10;
      const now = (CC.Game && CC.Game.time) || 0;
      for (let i = 0; i < this.restaurants.length; i++) {
        const r = this.restaurants[i];
        if (!ignoreCooldown && now < (this.cooldowns[r.key] || 0)) continue;
        const d = U.distance2D(pos.x, pos.z, r.x, r.z);
        if (d < bestD) { bestD = d; best = r; }
      }
      return best;
    },

    startOrder: function (restaurant) {
      if (!restaurant || this.active) return false;
      let pool = this.addresses.filter(function (a) {
        return a.key !== this.lastAddressKey &&
          U.distance2D(restaurant.x, restaurant.z, a.x, a.z) > 55;
      }, this);
      if (!pool.length) pool = this.addresses;
      const address = U.pick(Math.random, pool);
      if (!address) return false;
      const route = U.distance2D(restaurant.x, restaurant.z, address.x, address.z);
      const payout = Math.round(20 + route * 0.14 + Math.random() * 14);
      this.active = {
        restaurant: restaurant,
        address: address,
        payout: payout,
        route: route,
        startedAt: (CC.Game && CC.Game.time) || 0
      };
      this.lastAddressKey = address.key;
      this.cooldowns[restaurant.key] = ((CC.Game && CC.Game.time) || 0) + 25;
      this.deliveriesStarted++;
      this.pickupCandidate = null;
      this.pickupDwell = 0;
      this.deliveryDwell = 0;
      this.spawnResident(address);
      if (CC.Game && CC.Game.setWaypoint) CC.Game.setWaypoint(address.x, address.z);
      if (CC.Game && CC.Game.showMessage) {
        CC.Game.showMessage('Order picked up — deliver to ' + address.label +
          ' · $' + payout, 4);
      }
      return true;
    },

    spawnResident: function (address) {
      this.removeResident();
      if (!this.scene || !CC.Pedestrian || !CC.NPCSystem) return;
      const p = new CC.Pedestrian(this.scene, address.residentX, address.residentZ,
        'resident', { x: address.homeX, z: address.homeZ, spread: 1.2 });
      p.isDeliveryResident = true;
      p.residentName = U.pick(Math.random, FIRST_NAMES) + ' ' + address.residentName;
      p.speed = 0;
      p.idleTimer = 9999;
      p.homeRadius = 1.2;
      p.target.set(address.residentX, address.residentZ);
      p.heading = Math.random() * Math.PI * 2;
      CC.NPCSystem.pedestrians.push(p);
      this.resident = p;
    },

    removeResident: function () {
      const p = this.resident;
      this.resident = null;
      if (!p) return;
      const list = (CC.NPCSystem && CC.NPCSystem.pedestrians) || [];
      const i = list.indexOf(p);
      if (i >= 0) list.splice(i, 1);
      if (p.group && p.group.parent) p.group.parent.remove(p.group);
    },

    completeOrder: function () {
      const order = this.active;
      if (!order) return;
      if (CC.CrimeSystem && CC.CrimeSystem.addMoney) CC.CrimeSystem.addMoney(order.payout);
      this.deliveries++;
      this.earnings += order.payout;
      this.removeResident();
      this.active = null;
      this.deliveryDwell = 0;
      if (CC.Game && CC.Game.clearWaypoint) CC.Game.clearWaypoint(true);
      if (CC.Game && CC.Game.showMessage) {
        const cash = CC.CrimeSystem ? CC.CrimeSystem.money : this.earnings;
        CC.Game.showMessage('Delivered to ' + order.address.label + ' — +$' +
          order.payout + ' · cash $' + cash, 4);
      }
    },

    updateMarker: function (x, z, kind, time) {
      if (!this.marker) return;
      this.marker.visible = true;
      this.marker.position.set(x, CC.heightAt ? CC.heightAt(x, z) : 0, z);
      const pickup = kind === 'pickup';
      if (this.pickupSprite.visible !== pickup) {
        this.pickupSprite.visible = pickup;
        this.deliverySprite.visible = !pickup;
        const color = pickup ? 0x8ff5ce : 0xffd166;
        this.markerBeam.material.color.setHex(color);
        this.markerRing.material.color.setHex(color);
      }
      const bob = Math.sin(time * 3.2) * 0.28;
      this.pickupSprite.position.y = 6.2 + bob;
      this.deliverySprite.position.y = 6.2 + bob;
      const pulse = 1 + Math.sin(time * 4.4) * 0.12;
      this.markerRing.scale.set(pulse, pulse, 1);
    },

    update: function (dt, v) {
      if (!this.ready || !v || !v.pos) return;
      const Game = CC.Game;
      const time = (Game && Game.time) || 0;
      const pos = v.pos;
      const speed = Math.abs(v.speed || 0);
      const paused = !!(Game && (Game.mapOpen || Game.safeHouse ||
        (CC.InteriorSystem && CC.InteriorSystem.current)));
      if (!this.canUse(v) || paused) {
        if (this.marker) this.marker.visible = false;
        return;
      }

      if (this.active) {
        const address = this.active.address;
        const d = U.distance2D(pos.x, pos.z, address.x, address.z);
        this.updateMarker(address.x, address.z, 'delivery', time);
        if (d < 9 && speed < 4.2) {
          this.deliveryDwell += dt;
          if (this.deliveryDwell >= 0.9) this.completeOrder();
        } else {
          this.deliveryDwell = Math.max(0, this.deliveryDwell - dt * 0.6);
        }
        return;
      }

      const nearby = this.nearestRestaurant(pos, 10, false);
      if (nearby && speed < 3.6) {
        if (this.pickupCandidate !== nearby.key) {
          this.pickupCandidate = nearby.key;
          this.pickupDwell = 0;
        }
        this.pickupDwell += dt;
        if (this.pickupDwell >= 1.1) this.startOrder(nearby);
      } else {
        this.pickupCandidate = null;
        this.pickupDwell = 0;
      }
      const sign = this.nearestRestaurant(pos, 130, true);
      if (sign) this.updateMarker(sign.x, sign.z, 'pickup', time);
      else if (this.marker) this.marker.visible = false;
    },

    currentHint: function (pos, v) {
      if (!this.ready || !pos) return '';
      const Game = CC.Game;
      if (Game && (Game.mapOpen || Game.safeHouse ||
        (CC.InteriorSystem && CC.InteriorSystem.current))) return '';
      const speed = Math.abs((v && v.speed) || 0);
      if (this.active) {
        const d = U.distance2D(pos.x, pos.z, this.active.address.x, this.active.address.z);
        if (d < 12) {
          return speed < 4.2
            ? 'AT THE PORCH &nbsp;•&nbsp; HANDING OVER THE ORDER'
            : 'SLOW DOWN TO DELIVER &nbsp;•&nbsp; ' + this.active.address.label;
        }
        return 'FOOD DELIVERY &nbsp;•&nbsp; ' + this.active.address.label +
          ' &nbsp;·&nbsp; ' + Math.round(d) + 'm';
      }
      const r = this.nearestRestaurant(pos, 10, false);
      if (!r) return '';
      return speed < 3.6
        ? 'STOP TO PICK UP A FOOD DELIVERY'
        : 'SLOW DOWN FOR FOOD DELIVERY';
    }
  });
})();
