/* Coastal Cruise - standard-mapping gamepad input.
   Works with Xbox / PlayStation / generic controllers that expose the browser's
   standard gamepad layout. Keyboard controls stay active at the same time. */
(function () {
  'use strict';

  const CC = window.CC;
  const U = CC.util;

  const Gamepad = (CC.Gamepad = {
    connected: false,
    name: '',
    _prev: {},

    init() {
      window.addEventListener('gamepadconnected', function (e) {
        Gamepad.connected = true;
        Gamepad.name = e.gamepad.id || 'Controller';
      });
      window.addEventListener('gamepaddisconnected', function () {
        Gamepad.connected = false;
        Gamepad.name = '';
        Gamepad._prev = {};
      });
    },

    pressed(pad, i) { return !!(pad && pad.buttons[i] && pad.buttons[i].pressed); },
    value(pad, i) {
      if (!pad || !pad.buttons[i]) return 0;
      const b = pad.buttons[i];
      return typeof b.value === 'number' ? b.value : (b.pressed ? 1 : 0);
    },
    axis(v, dead) {
      if (v == null || Math.abs(v) < (dead || 0.12)) return 0;
      return U.clamp((v - Math.sign(v) * (dead || 0.12)) / (1 - (dead || 0.12)), -1, 1);
    },
    edge(pad, i) {
      const now = Gamepad.pressed(pad, i);
      const was = !!Gamepad._prev[i];
      Gamepad._prev[i] = now;
      return now && !was;
    },

    read() {
      const out = {
        throttle: 0, steer: 0, yaw: 0, lift: 0, roll: 0, pitch: 0,
        flightYaw: 0, flightRoll: 0, flightPitch: 0,
        lookX: 0, lookY: 0, handbrake: false, boost: false,
        camera: false, reset: false, prevVehicle: false, nextVehicle: false,
        help: false, map: false, music: false, radio: false, exit: false, start: false, horn: false,
        spawn: false, menuLeft: false, menuRight: false, menuUp: false, menuDown: false
      };
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      let pad = null;
      for (let i = 0; i < pads.length; i++) {
        if (pads[i] && pads[i].connected) { pad = pads[i]; break; }
      }
      Gamepad.connected = !!pad;
      Gamepad.name = pad ? (pad.id || 'Controller') : '';
      if (!pad) { Gamepad._prev = {}; return out; }

      // Left stick: steering on X, lift (aircraft) or drive throttle on Y.
      const stickX = Gamepad.axis(pad.axes[0], 0.13);
      const stickY = Gamepad.axis(pad.axes[1], 0.14); // browsers report up as -1
      out.steer = stickX;
      // Aircraft yaw uses the opposite sign to driving so pushing the stick
      // right turns the nose right instead of mirroring the on-screen world.
      out.yaw = -stickX;
      out.lift = -stickY; // pushing up is positive climb / forward throttle

      // Right stick: roll/pitch for every aircraft, camera free-look on the ground.
      // Keep dedicated flight aliases so the camera look path can never consume
      // or dilute the analog axes while flying.
      out.roll = Gamepad.axis(pad.axes[2], 0.14);
      out.pitch = -Gamepad.axis(pad.axes[3], 0.14); // pushing forward pitches forward
      out.flightYaw = out.yaw;
      out.flightRoll = out.roll;
      out.flightPitch = out.pitch;
      out.lookX = out.roll;
      out.lookY = -out.pitch; // raw browser Y for the ground camera

      let throttle = Gamepad.value(pad, 7) - Gamepad.value(pad, 6); // RT - LT
      if (Math.abs(throttle) < 0.06 && out.lift !== 0) throttle = out.lift;
      out.throttle = U.clamp(throttle, -1, 1);

      out.handbrake = Gamepad.pressed(pad, 0) || Gamepad.pressed(pad, 13); // A / D-down
      out.boost = Gamepad.pressed(pad, 1);                                 // B / Circle

      out.camera = Gamepad.edge(pad, 2);  // X / Square
      out.reset = Gamepad.edge(pad, 3);   // Y / Triangle
      const lb = Gamepad.edge(pad, 4), dLeft = Gamepad.edge(pad, 14);
      const rb = Gamepad.edge(pad, 5), dRight = Gamepad.edge(pad, 15);
      out.prevVehicle = lb || dLeft;
      out.nextVehicle = rb || dRight;
      const menuLeft = dLeft || Gamepad.axis(pad.axes[0], 0.45) < -0.5;
      const menuRight = dRight || Gamepad.axis(pad.axes[0], 0.45) > 0.5;
      const menuUp = Gamepad.edge(pad, 12) || Gamepad.axis(pad.axes[1], 0.45) < -0.5;
      const menuDown = Gamepad.edge(pad, 13) || Gamepad.axis(pad.axes[1], 0.45) > 0.5;
      out.menuLeft = menuLeft;
      out.menuRight = menuRight;
      out.menuUp = menuUp;
      out.menuDown = menuDown;
      out.help = Gamepad.edge(pad, 9);    // Start / Options
      out.spawn = out.help;               // Start also confirms a waypoint spawn
      out.confirm = Gamepad.edge(pad, 0); // A / Cross
      out.start = out.confirm || out.help; // A / Start begins the game
      out.map = Gamepad.edge(pad, 8);     // Back / Select
      out.music = Gamepad.edge(pad, 10);  // L3 - toggle music
      out.radio = Gamepad.edge(pad, 12);  // D-pad up - next radio station
      out.exit = Gamepad.edge(pad, 11);   // R3 - get out / get in
      out.horn = Gamepad.edge(pad, 13);   // D-pad down - horn / pick up
      return out;
    }
  });
})();
