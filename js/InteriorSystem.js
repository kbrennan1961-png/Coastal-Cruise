/* Coastal Cruise - walk-in interiors for the strip club, bars and restaurants.
   The overlay keeps the simulation cheap: only the HUD is swapped while the
   pedestrian is "inside", so the existing driving code never has to know about
   a second camera or a second physics scene. */
(function () {
  'use strict';

  const CC = window.CC;
  const U = CC.util;

  const MENUS = {
    club: [
      { name: 'Club soda', price: 8 },
      { name: 'House special', price: 14 },
      { name: 'Bottle service', price: 38 },
      { name: 'Private dance', price: 20 }
    ],
    bar: [
      { name: 'Draft beer', price: 7 },
      { name: 'House wine', price: 9 },
      { name: 'Well drink', price: 11 },
      { name: 'Pizza', price: 14 }
    ],
    restaurant: [
      { name: 'Clam chowder', price: 9 },
      { name: 'Grilled catch', price: 19 },
      { name: 'Cheeseburger', price: 13 },
      { name: 'Key lime pie', price: 7 }
    ]
  };

  const ORDERS = {
    club: ['Table 2 ordered bottle service', 'A regular ordered a house special',
      'The bartender poured another round', 'A guest headed to the private lounge'],
    bar: ['Table 1 ordered draft beers', 'Someone at the bar ordered a pizza',
      'The bartender poured house wine', 'A patron asked for the special'],
    restaurant: ['Table 3 ordered clam chowder', 'Table 5 ordered the grilled catch',
      'The kitchen sent out a cheeseburger', 'A guest ordered key lime pie']
  };

  const System = (CC.InteriorSystem = {
    venues: [],
    current: null,
    overlay: null,
    orders: 0,
    patrons: [],
    orderTimer: 0,
    orderIndex: 0,

    init: function () {
      this.venues = this.buildVenues();
      this.buildOverlay();
      this.bindInput();
      return this.venues;
    },

    buildVenues: function () {
      const zones = (CC.ImageMap && CC.ImageMap.zones) || {};
      const venues = [];
      function addVenue(venue) {
        if (!venue) return;
        const duplicate = venues.some(function (v) {
          return v.key === venue.key || v.name === venue.name ||
            U.distance2D(v.doorX, v.doorZ, venue.doorX, venue.doorZ) < 5;
        });
        if (duplicate) return;
        venues.push(venue);
      }
      function zoneVenue(name, type, label) {
        const q = zones[name];
        if (!q) return;
        const doorZ = q.z + q.h * 0.5 - 5;
        addVenue({
          key: name, name: label, type: type, x: q.x, z: q.z,
          doorX: q.x, doorZ: doorZ, exitX: q.x, exitZ: doorZ + 2
        });
      }
      zoneVenue('nightclub', 'club', 'THE CORAL CLUB');
      zoneVenue('chinese', 'restaurant', 'GOLDEN DRAGON');
      zoneVenue('liquor', 'bar', 'BAY LIQUOR');

      (CC.Details && CC.Details.businessSites || []).forEach(function (b) {
        const type = /DINER|GRILL|RESTAURANT/i.test(b.name) ? 'restaurant' : 'bar';
        const doorX = b.x - Math.sin(b.rot || 0) * (b.fzFront + 3);
        const doorZ = b.z + Math.cos(b.rot || 0) * (b.fzFront + 3);
        addVenue({
          key: 'business-' + b.name, name: b.name, type: type,
          x: b.x, z: b.z, doorX: doorX, doorZ: doorZ,
          exitX: doorX + Math.cos(b.rot || 0) * 2,
          exitZ: doorZ - Math.sin(b.rot || 0) * 2
        });
      });

      (CC.ImageMap && CC.ImageMap.landmarks || []).forEach(function (l) {
        if (l.type !== 'restaurant') return;
        addVenue({
          key: 'landmark-' + l.name, name: l.name, type: 'restaurant',
          x: l.x, z: l.z, doorX: l.x, doorZ: l.z + (l.l || 16) * 0.5 + 3.5,
          exitX: l.x, exitZ: l.z + (l.l || 16) * 0.5 + 5.5
        });
      });
      return venues;
    },

    nearestDoor: function (pos) {
      if (!pos) return null;
      let best = null, bestD = 6.2;
      for (let i = 0; i < this.venues.length; i++) {
        const v = this.venues[i];
        const d = U.distance2D(pos.x, pos.z, v.doorX, v.doorZ);
        if (d < bestD) { bestD = d; best = v; }
      }
      return best;
    },

    currentHint: function (pos) {
      if (this.current) return 'E / R3 &nbsp;•&nbsp; LEAVE ' + this.current.name;
      const door = this.nearestDoor(pos);
      if (!door) return '';
      const verb = door.type === 'club' ? 'ENTER STRIP CLUB'
        : door.type === 'bar' ? 'ENTER BAR' : 'ENTER RESTAURANT';
      return 'E / R3 &nbsp;•&nbsp; ' + verb;
    },

    enter: function (venue, ped) {
      if (!venue || this.current) return false;
      this.current = venue;
      this.orderTimer = 0;
      this.orderIndex = 0;
      this.orders = 0;
      this.patrons = [];
      if (ped) {
        ped.inInterior = true;
        if (ped.group) ped.group.visible = false;
      }
      if (CC.NPCSystem && CC.NPCSystem.clearWanted) CC.NPCSystem.clearWanted();
      const name = this.el('interiorName');
      if (name) name.textContent = venue.name;
      this.renderScene(venue);
      this.renderMenu(venue);
      this.setStatus('Welcome to ' + venue.name + '. Order at the counter, or press E to leave.');
      if (this.overlay) this.overlay.classList.add('show');
      if (CC.Game && CC.Game.showMessage) CC.Game.showMessage('Inside ' + venue.name, 2.5);
      return true;
    },

    exit: function (ped) {
      const venue = this.current;
      if (!venue) return false;
      if (ped) {
        if (ped.setPose) ped.setPose(venue.exitX, venue.exitZ, ped.heading || 0, 0);
        ped.inInterior = false;
        if (ped.group) ped.group.visible = true;
      }
      this.current = null;
      if (this.overlay) this.overlay.classList.remove('show');
      return true;
    },

    buildOverlay: function () {
      if (document.getElementById('interiorOverlay')) {
        this.overlay = document.getElementById('interiorOverlay');
        return;
      }
      const root = document.createElement('div');
      root.id = 'interiorOverlay';
      root.className = 'interiorOverlay';
      root.innerHTML =
        '<div class="interiorCard">' +
        '<div class="interiorHead"><b id="interiorName"></b>' +
        '<button id="interiorExitBtn" class="mapBtn">LEAVE (E / ESC)</button></div>' +
        '<div id="interiorScene" class="interiorScene"></div>' +
        '<div id="interiorMenu" class="interiorMenu"></div>' +
        '<div id="interiorStatus" class="interiorStatus"></div>' +
        '</div>';
      document.body.appendChild(root);
      this.overlay = root;
      const exitBtn = document.getElementById('interiorExitBtn');
      if (exitBtn) exitBtn.addEventListener('click', function () {
        System.exit(CC.Game && CC.Game.vehicles && CC.Game.vehicles.pedestrian);
      });
      const menu = document.getElementById('interiorMenu');
      if (menu) menu.addEventListener('click', function (e) {
        const btn = e.target.closest('button[data-order]');
        if (btn) System.order(Number(btn.dataset.order));
      });
      const scene = document.getElementById('interiorScene');
      if (scene) scene.addEventListener('click', function (e) {
        if (e.target.closest('[data-backroom]')) System.order(3);
      });
    },

    bindInput: function () {
      window.addEventListener('keydown', function (e) {
        if (!System.current) return;
        const k = e.key.toLowerCase();
        if (k === 'e' || k === 'escape') {
          e.preventDefault();
          e.stopImmediatePropagation();
          System.exit(CC.Game && CC.Game.vehicles && CC.Game.vehicles.pedestrian);
          return;
        }
        if (k >= '1' && k <= '4') {
          e.preventDefault();
          e.stopImmediatePropagation();
          System.order(Number(k) - 1);
        }
      }, true);
    },

    el: function (id) { return document.getElementById(id); },

    renderScene: function (venue) {
      const host = this.el('interiorScene');
      if (!host) return;
      if (venue.type === 'club') {
        host.className = 'interiorScene clubScene';
        host.innerHTML =
          '<div class="discoBeams"></div>' +
          '<div class="clubStage"><span class="stageLabel">LIVE STAGE</span>' +
          '<i class="pole p1"></i><i class="pole p2"></i><i class="pole p3"></i>' +
          '<b class="dancer d1"></b><b class="dancer d2"></b><b class="dancer d3"></b></div>' +
          '<div class="danceFloor"><i></i><i></i><i></i><i></i></div>' +
          '<div class="interiorBar barLeft"><span>MAIN BAR</span><em></em><em></em><em></em><em></em></div>' +
          '<div class="interiorBar barRight"><span>LOUNGE BAR</span><em></em><em></em><em></em></div>' +
          '<div class="backroom" data-backroom><span>PRIVATE LAP DANCE LOUNGE</span>' +
          '<small>Curtained booths • book a private dance</small></div>' +
          '<div class="clubPatron cp1"></div><div class="clubPatron cp2"></div>' +
          '<div class="clubPatron cp3"></div><div class="clubPatron cp4"></div>';
      } else {
        host.className = 'interiorScene diningScene';
        host.innerHTML =
          '<div class="venueBar"><span>' + (venue.type === 'bar' ? 'BAR' : 'DINING ROOM') + '</span>' +
          '<em></em><em></em><em></em><em></em><em></em></div>' +
          '<div class="kitchenPass">KITCHEN PASS</div>' +
          '<div class="diningTable t1"><i></i><b></b><small></small></div>' +
          '<div class="diningTable t2"><i></i><b></b><small></small></div>' +
          '<div class="diningTable t3"><i></i><b></b><small></small></div>' +
          '<div class="diningTable t4"><i></i><b></b><small></small></div>' +
          '<div class="diningTable t5"><i></i><b></b><small></small></div>' +
          '<div class="diningTable t6"><i></i><b></b><small></small></div>' +
          '<div class="barStool s1"></div><div class="barStool s2"></div>' +
          '<div class="barStool s3"></div>';
      }
    },

    renderMenu: function (venue) {
      const host = this.el('interiorMenu');
      if (!host) return;
      const items = MENUS[venue.type] || MENUS.restaurant;
      host.innerHTML = items.map(function (item, i) {
        return '<button data-order="' + i + '"><b>' + (i + 1) + '</b>' +
          '<span>' + item.name + '</span><em>$' + item.price + '</em></button>';
      }).join('');
    },

    setStatus: function (text) {
      const el = this.el('interiorStatus');
      if (el) el.textContent = text;
    },

    order: function (index) {
      if (!this.current) return false;
      const items = MENUS[this.current.type] || MENUS.restaurant;
      const item = items[index];
      if (!item) return false;
      const crime = CC.CrimeSystem;
      if (crime && !crime.spendMoney(item.price)) {
        this.setStatus('Not enough cash for ' + item.name + '.');
        return false;
      }
      this.orders++;
      this.setStatus('You ordered ' + item.name + ' for $' + item.price +
        '.' + (this.current.type === 'club' && index === 3
          ? ' The private dance starts in the backroom.' : ''));
      this.renderOrderBubble(item.name);
      return true;
    },

    renderOrderBubble: function (text) {
      const host = this.el('interiorScene');
      if (!host) return;
      const bubble = document.createElement('div');
      bubble.className = 'orderBubble';
      bubble.textContent = 'You: ' + text;
      host.appendChild(bubble);
      window.setTimeout(function () {
        if (bubble.parentNode) bubble.parentNode.removeChild(bubble);
      }, 2600);
    },

    update: function (dt) {
      if (!this.current) return;
      this.orderTimer -= dt;
      if (this.orderTimer > 0) return;
      this.orderTimer = 3.4;
      const lines = ORDERS[this.current.type] || ORDERS.restaurant;
      const line = lines[this.orderIndex++ % lines.length];
      const bubbles = this.el('interiorScene');
      if (!bubbles) return;
      const el = document.createElement('div');
      el.className = 'npcOrder';
      el.textContent = line;
      bubbles.appendChild(el);
      window.setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 3000);
    }
  });
})();
