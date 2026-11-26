/* Coastal Cruise - pedestrian crime and cash. Kept separate from the vehicle
   and pedestrian physics; it only reads positions and calls the existing
   wanted-system hooks. */
(function () {
  'use strict';

  const CC = window.CC;
  const U = CC.util;

  const System = (CC.CrimeSystem = {
    money: 120,
    inventory: [],
    assaults: 0,
    robberies: 0,
    lastVictim: null,
    hud: null,

    init: function () {
      this.ensureHud();
      this.updateHud();
      return this;
    },

    ensureHud: function () {
      this.hud = document.getElementById('moneyHud');
      if (!this.hud) {
        this.hud = document.createElement('div');
        this.hud.id = 'moneyHud';
        this.hud.className = 'moneyHud';
        const hudRoot = document.getElementById('hud');
        (hudRoot || document.body).appendChild(this.hud);
      }
      this.updateHud();
    },

    updateHud: function () {
      if (!this.hud) this.ensureHud();
      if (this.hud) this.hud.textContent = '$' + Math.max(0, Math.round(this.money));
    },

    addMoney: function (amount) {
      this.money = Math.max(0, this.money + Math.round(amount));
      this.updateHud();
    },

    spendMoney: function (amount) {
      if (this.money < amount) return false;
      this.money -= amount;
      this.updateHud();
      return true;
    },

    message: function (text) {
      if (CC.Game && CC.Game.showMessage) CC.Game.showMessage(text, 3);
    },

    isVictim: function (p) {
      return !!p && !!p.position && !p.isPlayer && p.role !== 'cop' &&
        !p.inVehicle && p._crimeRobbed !== true;
    },

    nearestVictim: function (pos, radius, predicate) {
      const people = (CC.NPCSystem && CC.NPCSystem.pedestrians) || [];
      let best = null, bestD = radius || 3.6;
      for (let i = 0; i < people.length; i++) {
        const p = people[i];
        if (!this.isVictim(p)) continue;
        if (predicate && !predicate(p)) continue;
        const d = U.distance2D(pos.x, pos.z, p.position.x, p.position.z);
        if (d < bestD) { bestD = d; best = p; }
      }
      return best;
    },

    canRob: function (pos) {
      return !!this.nearestVictim(pos, 3.6, function (p) {
        return p._crimeHealth <= 0;
      });
    },

    attack: function (pos) {
      if (!pos) return false;
      const victim = this.nearestVictim(pos, 3.6);
      if (!victim) return false;
      victim._crimeHealth = (victim._crimeHealth == null ? 2 : victim._crimeHealth) - 1;
      victim._crimeHitAt = (CC.Game && CC.Game.time) || 0;
      if (victim.downloaded && victim.downloaded.trigger) {
        victim.downloaded.trigger(victim._crimeHealth <= 0 ? 'Death' : 'Hit');
      }
      this.lastVictim = victim;
      this.assaults++;
      if (CC.NPCSystem && CC.NPCSystem.reportCrime && !victim._crimeReported) {
        victim._crimeReported = true;
        CC.NPCSystem.reportCrime('Beat up pedestrian');
      }
      if (victim._crimeHealth <= 0) {
        this.message('The pedestrian is down — press E to steal their cash');
      } else {
        this.message('You beat up a pedestrian. Hit them again.');
      }
      return true;
    },

    rob: function (pos) {
      if (!pos) return false;
      const victim = this.nearestVictim(pos, 3.6, function (p) {
        return p._crimeHealth <= 0;
      });
      if (!victim) return false;
      const cash = 24 + Math.floor(Math.random() * 71);
      victim._crimeRobbed = true;
      victim._crimeHealth = 0;
      this.lastVictim = victim;
      this.robberies++;
      this.addMoney(cash);
      if (CC.NPCSystem && CC.NPCSystem.reportCrime) {
        CC.NPCSystem.reportCrime('Steal money from pedestrian');
      }
      this.message('Stole $' + cash + ' — cash on hand $' + this.money);
      return true;
    },

    currentHint: function (pos) {
      if (this.canRob(pos)) return 'E / R3 &nbsp;•&nbsp; STEAL CASH';
      if (this.nearestVictim(pos, 3.6)) return 'X / D-pad ↓ &nbsp;•&nbsp; BEAT UP PEDESTRIAN';
      return '';
    },

    update: function (dt) {
      const people = (CC.NPCSystem && CC.NPCSystem.pedestrians) || [];
      const now = (CC.Game && CC.Game.time) || 0;
      for (let i = 0; i < people.length; i++) {
        const p = people[i];
        if (p._crimeHealth > 0 && p._crimeHitAt != null &&
            now - p._crimeHitAt > 30) {
          p._crimeHealth = 2;
          p._crimeReported = false;
          p._crimeHitAt = null;
        }
      }
    }
  });
})();
