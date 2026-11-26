/* Coastal Cruise - renderer, input, cameras, HUD, challenges, audio and main loop. */
(function () {
  'use strict';

  const CC = window.CC;
  const C = CC.C, U = CC.util;

  /* ---------- audio: engine, weather, procedural + file-backed radio ---------- */
  const VOLUME_KEY = 'cc.audio.volumes';
  // Bundled MP3s are the only in-game radio. The old WebAudio chiptune fallback
  // stays in the file for reference but is never allowed to make sound.
  const SYNTH_RADIO_ENABLED = false;
  function storedVolumes() {
    try {
      const value = JSON.parse(localStorage.getItem(VOLUME_KEY) || 'null');
      return value && typeof value === 'object' ? value : {};
    } catch (e) { return {}; }
  }
  function normalizeVolume(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? U.clamp(n, 0, 1) : fallback;
  }

  const RADIO_DEFS = (CC.radioStationDefs && CC.radioStationDefs.length ? CC.radioStationDefs : [
    { name: 'COASTAL FM', files: [], fallback: 'chill' },
    { name: 'CRUISE 101', files: [], fallback: 'cruise' },
    { name: 'ISLAND WAVE', files: [], fallback: 'island' },
    { name: 'MOONLIGHT', files: [], fallback: 'night' }
  ]);

  // Legacy synth styles; ignored while SYNTH_RADIO_ENABLED is false.
  const MUSIC_STYLES = {
    chill: {
      chords: [[48, 52, 55, 59, 64, 67], [45, 48, 52, 55, 60, 64],
        [41, 45, 48, 52, 57, 60], [43, 47, 50, 55, 59, 62]],
      arp: [0, 2, 4, 3, 5, 4, 2, 3], tempo: 0.26,
      bass: -12, lead: 12, bassVol: 0.16, leadVol: 0.075, harmonyVol: 0.045,
      bassWave: 'triangle', leadWave: 'sine'
    },
    cruise: {
      chords: [[45, 48, 52, 55, 60, 64], [41, 45, 48, 52, 57, 60],
        [48, 52, 55, 59, 64, 67], [43, 47, 50, 55, 59, 62]],
      arp: [0, 2, 4, 5, 4, 2, 3, 4], tempo: 0.19,
      bass: -12, lead: 12, bassVol: 0.2, leadVol: 0.07, harmonyVol: 0.03,
      bassWave: 'square', leadWave: 'triangle'
    },
    island: {
      chords: [[50, 53, 57, 60, 65, 69], [43, 47, 50, 53, 59, 62],
        [48, 52, 55, 59, 64, 67], [45, 49, 52, 55, 61, 64]],
      arp: [0, 2, 3, 5, 3, 2, 4, 3], tempo: 0.22,
      bass: -12, lead: 24, bassVol: 0.13, leadVol: 0.06, harmonyVol: 0.04,
      bassWave: 'sine', leadWave: 'sine'
    },
    night: {
      chords: [[45, 48, 52, 55, 59, 64], [41, 45, 48, 52, 57, 60],
        [48, 52, 55, 59, 64, 67], [40, 43, 47, 50, 55, 59]],
      arp: [0, 3, 5, 4, 2, 3, 5, 4], tempo: 0.34,
      bass: -12, lead: 12, bassVol: 0.14, leadVol: 0.055, harmonyVol: 0.05,
      bassWave: 'sine', leadWave: 'triangle'
    },
    retro: {
      chords: [[43, 50, 55, 58, 62, 65], [39, 46, 51, 55, 58, 62],
        [41, 48, 53, 57, 60, 65], [38, 45, 50, 53, 57, 62]],
      arp: [0, 2, 3, 5, 4, 2, 3, 1], tempo: 0.28,
      bass: -12, lead: 24, bassVol: 0.22, leadVol: 0.06, harmonyVol: 0.04,
      bassWave: 'square', leadWave: 'triangle'
    },
    country: {
      chords: [[45, 49, 52, 57, 61, 64], [43, 47, 50, 55, 59, 62],
        [41, 45, 48, 53, 57, 60], [43, 47, 50, 57, 60, 64]],
      arp: [0, 2, 4, 3, 5, 4, 2, 4], tempo: 0.23,
      bass: -12, lead: 12, bassVol: 0.18, leadVol: 0.08, harmonyVol: 0.03,
      bassWave: 'triangle', leadWave: 'square'
    },
    pulse: {
      chords: [[40, 47, 52, 56, 59, 64], [36, 43, 48, 52, 55, 60],
        [38, 45, 50, 53, 57, 62], [35, 42, 47, 50, 54, 59]],
      arp: [0, 1, 2, 3, 4, 5, 4, 3], tempo: 0.15,
      bass: -12, lead: 24, bassVol: 0.2, leadVol: 0.07, harmonyVol: 0.03,
      bassWave: 'sawtooth', leadWave: 'sawtooth'
    },
    talk: {
      chords: [[40, 47, 52, 55], [38, 45, 50, 53], [36, 43, 48, 52], [38, 45, 50, 55]],
      arp: [0, 0, 2, 0, 3, 0, 1, 0], tempo: 0.42,
      bass: -12, lead: 12, bassVol: 0.11, leadVol: 0.025, harmonyVol: 0.02,
      bassWave: 'sine', leadWave: 'square'
    },
    sports: {
      chords: [[43, 47, 50, 55, 59, 62], [41, 45, 48, 53, 57, 60],
        [45, 49, 52, 57, 61, 64], [40, 43, 47, 52, 55, 59]],
      arp: [0, 2, 3, 2, 5, 4, 2, 1], tempo: 0.19,
      bass: -12, lead: 24, bassVol: 0.19, leadVol: 0.075, harmonyVol: 0.035,
      bassWave: 'square', leadWave: 'sawtooth'
    },
    oldies: {
      chords: [[48, 52, 55, 59, 64, 67], [45, 49, 52, 57, 61, 64],
        [43, 47, 50, 55, 59, 62], [45, 49, 52, 57, 61, 64]],
      arp: [0, 2, 4, 3, 5, 4, 2, 1], tempo: 0.22,
      bass: -12, lead: 12, bassVol: 0.17, leadVol: 0.085, harmonyVol: 0.045,
      bassWave: 'triangle', leadWave: 'sine'
    }
  };

  const Audio = (CC.Audio = {
    ctx: null,
    ready: false,
    volumes: Object.assign({ master: 0.85, music: 0.7, sfx: 0.85 }, storedVolumes()),
    radio: {
      index: 0, audio: null, source: 'silent', token: 0,
      suspendedForPedestrian: false
    },
    musicOn: false,
    musicStep: 0,
    musicNext: 0,
    musicTimer: null,

    init() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended' && this.ctx.resume) {
          this.ctx.resume().catch(function () {});
        }
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const saved = this.volumes;
      this.volumes = {
        master: normalizeVolume(saved.master, 0.85),
        music: normalizeVolume(saved.music, 0.7),
        sfx: normalizeVolume(saved.sfx, 0.85)
      };
      const ctx = (this.ctx = new AC());
      this.master = ctx.createGain();
      this.master.gain.value = this.volumes.master;
      this.master.connect(ctx.destination);

      // Game sounds (engine, surf, horns, weather) use their own volume bus.
      this.sfxGain = ctx.createGain();
      this.sfxGain.gain.value = this.volumes.sfx;
      this.sfxGain.connect(this.master);

      // Synthesized radio bus (works from file:// with no audio files).
      this.musicGain = ctx.createGain();
      this.musicGain.gain.value = 0;
      this.musicGain.connect(this.master);

      this.filter = ctx.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.frequency.value = 1400;
      this.engineGain = ctx.createGain();
      this.engineGain.gain.value = 0;
      this.filter.connect(this.engineGain);
      this.engineGain.connect(this.sfxGain);

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

      // Shared noise sample for surf, off-road rumble, rain and thunder.
      const len = ctx.sampleRate * 2;
      const buf = (this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate));
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * 0.5;

      const src = ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'lowpass'; bp.frequency.value = 420;
      const ambGain = ctx.createGain();
      ambGain.gain.value = 0.028;
      src.connect(bp); bp.connect(ambGain); ambGain.connect(this.sfxGain);
      src.start();

      const rough = ctx.createBufferSource();
      rough.buffer = buf; rough.loop = true;
      const rbp = ctx.createBiquadFilter();
      rbp.type = 'bandpass'; rbp.frequency.value = 260; rbp.Q.value = 0.7;
      this.roughGain = ctx.createGain();
      this.roughGain.gain.value = 0;
      rough.connect(rbp); rbp.connect(this.roughGain); this.roughGain.connect(this.sfxGain);
      rough.start();

      const rainSrc = ctx.createBufferSource();
      rainSrc.buffer = buf; rainSrc.loop = true;
      const rainFilter = ctx.createBiquadFilter();
      rainFilter.type = 'highpass'; rainFilter.frequency.value = 900;
      this.rainGain = ctx.createGain();
      this.rainGain.gain.value = 0;
      rainSrc.connect(rainFilter); rainFilter.connect(this.rainGain);
      this.rainGain.connect(this.sfxGain);
      rainSrc.start();

      // Low, whooshing wind bed that rises with the storm.
      const windSrc = ctx.createBufferSource();
      windSrc.buffer = buf; windSrc.loop = true;
      const windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass'; windFilter.frequency.value = 360; windFilter.Q.value = 0.55;
      this.windGain = ctx.createGain();
      this.windGain.gain.value = 0;
      windSrc.connect(windFilter); windFilter.connect(this.windGain);
      this.windGain.connect(this.sfxGain);
      windSrc.start();

      this.ready = true;
      this.setVehicle(CC.vehicleSpecs.motorcycle);
      this.applyRadioVolume();
    },

    /* ---------- volume settings ---------- */
    setMasterVolume(value) {
      this.volumes.master = U.clamp(Number(value) || 0, 0, 1);
      if (this.master) this.master.gain.setTargetAtTime(this.volumes.master, this.ctx.currentTime, 0.05);
      this.applyRadioVolume();
      this.saveVolumes();
      updateVolumeUI();
    },
    setMusicVolume(value) {
      this.volumes.music = U.clamp(Number(value) || 0, 0, 1);
      this.applyRadioVolume();
      if (SYNTH_RADIO_ENABLED && this.ready && this.musicOn && this.radio.source === 'procedural') {
        this.musicGain.gain.setTargetAtTime(0.42 * this.volumes.music, this.ctx.currentTime, 0.08);
      }
      this.saveVolumes();
      updateVolumeUI();
    },
    setSfxVolume(value) {
      this.volumes.sfx = U.clamp(Number(value) || 0, 0, 1);
      if (this.sfxGain) this.sfxGain.gain.setTargetAtTime(this.volumes.sfx, this.ctx.currentTime, 0.05);
      this.saveVolumes();
      updateVolumeUI();
    },
    saveVolumes() {
      try { localStorage.setItem(VOLUME_KEY, JSON.stringify(this.volumes)); } catch (e) {}
    },
    applyRadioVolume(audio) {
      const el = audio || (this.radio && this.radio.audio);
      if (!el) return;
      const station = RADIO_DEFS[this.radio.index] || {};
      el.volume = U.clamp(this.volumes.master * this.volumes.music * (station.volume || 1), 0, 1);
    },

    setVehicle(spec) {
      const wasPedestrian = !!(this.spec && this.spec.pedestrian);
      this.spec = spec;
      if (!this.ready) return;
      const now = this.ctx.currentTime;
      if (spec.pedestrian) {
        // On foot the engine and any chiptune radio tail must stop at once;
        // footsteps are the only locomotion sound while walking.
        this.targetGain = 0;
        this.engineGain.gain.cancelScheduledValues(now);
        this.engineGain.gain.setValueAtTime(0, now);
        this.roughGain.gain.cancelScheduledValues(now);
        this.roughGain.gain.setValueAtTime(0, now);
        this.musicGain.gain.cancelScheduledValues(now);
        this.musicGain.gain.setValueAtTime(0, now);
        this._lastWalkPhase = null;
        this._footSide = false;
        if (this.musicOn && !this.radio.suspendedForPedestrian) {
          this.radio.suspendedForPedestrian = true;
          this.pauseProcedural();
          this.stopRadioAudio();
          updateAudioUI();
        }
        return;
      }
      if (wasPedestrian && this.radio.suspendedForPedestrian) {
        this.radio.suspendedForPedestrian = false;
        if (this.musicOn) this.tryRadioStation(this.radio.index, false);
      }
      const a = spec.audio;
      this.osc.type = a.wave;
      this.base = a.base;
      this.mult = a.mult;
      this.targetGain = a.gain;
      this.filter.frequency.setTargetAtTime(a.filter, now, 0.1);
    },
    update(speed, throttle, boost, surface) {
      if (!this.ready) return;
      const now = this.ctx.currentTime;
      if (this.spec && this.spec.pedestrian) {
        this.engineGain.gain.setTargetAtTime(0, now, 0.08);
        this.roughGain.gain.setTargetAtTime(0, now, 0.08);
        return;
      }
      const abs = Math.abs(speed);
      const freq = this.base + abs * this.mult + (boost && !(this.spec && this.spec.water) ? 18 : 0);
      this.osc.frequency.setTargetAtTime(freq, now, 0.06);
      this.sub.frequency.setTargetAtTime(freq * 0.5, now, 0.06);
      const load = throttle > 0 ? 1 : throttle < 0 ? 0.35 : 0.55;
      const g = this.targetGain * (0.35 + load * 0.65) * U.clamp(0.35 + abs / 18, 0, 1.25);
      this.engineGain.gain.setTargetAtTime(g, now, 0.07);
      const rough = (surface === 'sand' || surface === 'grass' || surface === 'gravel' || surface === 'dirt') ?
        U.clamp(abs / 40, 0, 1) * 0.085 : 0;
      this.roughGain.gain.setTargetAtTime(rough, now, 0.1);
    },

    // A short filtered noise burst: soft thump on paving, scuffier on sand or
    // grass, brighter on boardwalk. Alternating the filter slightly gives the
    // two feet distinct sounds without needing any audio files.
    footstep(surface, strength) {
      if (!this.ready || !this.noiseBuffer || !this.spec || !this.spec.pedestrian) return;
      const ctx = this.ctx, now = ctx.currentTime;
      const s = String(surface || 'paved');
      let freq = 1500;
      if (s === 'sand') freq = 760;
      else if (s === 'grass' || s === 'marsh') freq = 620;
      else if (s === 'gravel' || s === 'dirt') freq = 1050;
      else if (s === 'boardwalk') freq = 1900;
      else if (s === 'water') freq = 2400;
      this._footSide = !this._footSide;
      freq *= this._footSide ? 1.06 : 0.95;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass'; band.frequency.value = freq; band.Q.value = 0.8;
      const g = ctx.createGain();
      const peak = 0.045 * U.clamp(strength, 0.15, 1.2) *
        (s === 'sand' || s === 'grass' || s === 'marsh' ? 0.7 : 1);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), now + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.095);
      src.connect(band); band.connect(g); g.connect(this.sfxGain);
      src.start(now); src.stop(now + 0.1);
    },

    // Called once per simulated frame. The walker's own walkPhase drives the
    // cadence, so steps line up with the leg animation and stop immediately
    // when the pedestrian stops, swims, or enters a vehicle.
    updateFootsteps(dt, walker, surface) {
      if (!this.ready || !this.spec || !this.spec.pedestrian) return;
      if (!walker || !walker.isPedestrian || walker.isSwimming ||
          surface === 'swimming' || surface === 'diving') return;
      const speed = Math.abs(walker.speed || 0);
      if (speed < 0.75) { this._lastWalkPhase = walker.walkPhase || 0; return; }
      const phase = walker.walkPhase || 0;
      const prev = this._lastWalkPhase == null ? phase : this._lastWalkPhase;
      this._lastWalkPhase = phase;
      if (Math.floor(phase / Math.PI) <= Math.floor(prev / Math.PI)) return;
      const top = this.spec.maxSpeed * (this.spec.boost || 1);
      this.footstep(surface, 0.5 + 0.5 * U.clamp(speed / top, 0, 1));
    },
    setRain(amount) {
      if (!this.ready || !this.rainGain) return;
      this.rainGain.gain.setTargetAtTime(U.clamp(Number(amount) || 0, 0, 1) * 0.075, this.ctx.currentTime, 0.2);
    },
    setWind(amount) {
      if (!this.ready || !this.windGain) return;
      this.windGain.gain.setTargetAtTime(U.clamp(Number(amount) || 0, 0, 1) * 0.08, this.ctx.currentTime, 0.35);
    },
    siren() {
      if (!this.ready || !this.noiseBuffer) return;
      const ctx = this.ctx, now = ctx.currentTime;
      const o = ctx.createOscillator();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(620, now);
      o.frequency.linearRampToValueAtTime(880, now + 0.35);
      o.frequency.linearRampToValueAtTime(620, now + 0.7);
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass'; filter.frequency.value = 900; filter.Q.value = 3;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.055, now + 0.08);
      g.gain.setValueAtTime(0.055, now + 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.78);
      o.connect(filter); filter.connect(g); g.connect(this.sfxGain);
      o.start(now); o.stop(now + 0.8);
    },
    gunshot() {
      if (!this.ready || !this.noiseBuffer) return;
      const ctx = this.ctx, now = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const high = ctx.createBiquadFilter();
      high.type = 'highpass'; high.frequency.value = 900;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.075, now + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);
      src.connect(high); high.connect(g); g.connect(this.sfxGain);
      src.start(now); src.stop(now + 0.15);
    },
    explosion() {
      if (!this.ready || !this.noiseBuffer) return;
      const ctx = this.ctx, now = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer; src.loop = true;
      const low = ctx.createBiquadFilter();
      low.type = 'lowpass'; low.frequency.setValueAtTime(1400, now);
      low.frequency.exponentialRampToValueAtTime(120, now + 0.9);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.34, now + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);
      src.connect(low); low.connect(g); g.connect(this.sfxGain);
      src.start(now); src.stop(now + 1.15);
      const boom = ctx.createOscillator();
      boom.type = 'sine';
      boom.frequency.setValueAtTime(95, now);
      boom.frequency.exponentialRampToValueAtTime(32, now + 0.55);
      const bg = ctx.createGain();
      bg.gain.setValueAtTime(0.0001, now);
      bg.gain.exponentialRampToValueAtTime(0.22, now + 0.02);
      bg.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
      boom.connect(bg); bg.connect(this.sfxGain);
      boom.start(now); boom.stop(now + 0.65);
    },
    thunder() {
      if (!this.ready || !this.noiseBuffer) return;
      const ctx = this.ctx, now = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer; src.loop = true;
      const low = ctx.createBiquadFilter();
      low.type = 'lowpass'; low.frequency.value = 180;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.2, now + 0.07);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 1.5);
      src.connect(low); low.connect(g); g.connect(this.sfxGain);
      src.start(now); src.stop(now + 1.55);
    },
    honk(vol) { /* beeps removed per request */ },
    radioStatic(duration) {
      if (!this.ready || !this.noiseBuffer) return;
      const ctx = this.ctx, now = ctx.currentTime;
      // Short tuning burst on station changes only. It rides the music volume,
      // not the SFX bus, so lowering effects cannot erase the radio handoff.
      const dur = Math.max(0.18, Number(duration) || 0.34);
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer; src.loop = true;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass'; band.frequency.value = 1900; band.Q.value = 0.6;
      const high = ctx.createBiquadFilter();
      high.type = 'highpass'; high.frequency.value = 450;
      const g = ctx.createGain();
      const level = 0.1 * (this.volumes.music || 1);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(level, now + 0.025);
      g.gain.setValueAtTime(level * 0.72, now + dur * 0.55);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      src.connect(high); high.connect(band); band.connect(g); g.connect(this.master);
      src.start(now); src.stop(now + dur + 0.05);
    },

    /* ---------- radio ---------- */
    radioAllowed() { return !(this.spec && this.spec.pedestrian); },
    station() { return RADIO_DEFS[this.radio.index] || { name: 'RADIO', fallback: 'chill' }; },
    stationName() { return this.station().name; },
    currentStyle() { return MUSIC_STYLES[this.station().fallback] || MUSIC_STYLES.chill; },

    stopRadioAudio(invalidate) {
      if (this.radio.audio) {
        const el = this.radio.audio;
        el.pause();
        try { el.currentTime = 0; } catch (e) {}
        el.src = '';
        this.radio.audio = null;
      }
      if (this.radio.pending) {
        this.radio.pending.pause();
        this.radio.pending.src = '';
        this.radio.pending = null;
      }
      if (invalidate !== false) this.radio.token++;
    },
    pauseProcedural() {
      if (this.musicTimer) { window.clearInterval(this.musicTimer); this.musicTimer = null; }
      if (this.ready) this.musicGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.12);
    },
    startProcedural() {
      // Silent compatibility shim: gameplay radio comes only from audio files.
      this.pauseProcedural();
      this.stopRadioAudio(false);
      this.radio.source = 'silent';
      updateAudioUI();
    },
    note(freq, when, dur, vol, type) {
      if (!SYNTH_RADIO_ENABLED || !this.radioAllowed()) return;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type || 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), when + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      o.connect(g); g.connect(this.musicGain);
      o.start(when); o.stop(when + dur + 0.05);
    },
    scheduleMusic() {
      if (!SYNTH_RADIO_ENABLED || !this.ready || !this.musicOn ||
          !this.radioAllowed() || this.radio.source !== 'procedural') return;
      const style = this.currentStyle();
      const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
      while (this.musicNext < this.ctx.currentTime + 0.35) {
        const chord = style.chords[Math.floor(this.musicStep / 8) % style.chords.length];
        const step = this.musicStep % 8;
        const when = this.musicNext;
        if (step % 4 === 0) {
          this.note(mtof(chord[0] + style.bass), when, style.tempo * 4, style.bassVol, style.bassWave);
        }
        this.note(mtof(chord[style.arp[step]] + style.lead), when, style.tempo * 1.6, style.leadVol, style.leadWave);
        if (step === 6) this.note(mtof(chord[4] + style.lead), when, style.tempo * 2.6, style.harmonyVol, 'triangle');
        this.musicStep++;
        this.musicNext += style.tempo;
      }
    },
    loadStationAudio(station, token) {
      const holder = this.radio;
      return new Promise(function (resolve, reject) {
        let i = 0;
        function attempt() {
          if (token !== Audio.radio.token || i >= station.files.length) {
            reject(new Error('unavailable'));
            return;
          }
          const src = station.files[i++];
          if (!src) { attempt(); return; }
          const el = new window.Audio();
          el.preload = 'auto';
          el.loop = true;
          holder.pending = el; // keep a live reference while the file loads
          let settled = false;
          const cleanup = function () {
            el.removeEventListener('canplay', ok);
            el.removeEventListener('loadedmetadata', ok);
            el.removeEventListener('error', bad);
            window.clearTimeout(timer);
            if (holder.pending === el) holder.pending = null;
          };
          const ok = function () {
            if (settled) return;
            settled = true; cleanup(); resolve(el);
          };
          const bad = function () {
            if (settled) return;
            settled = true; cleanup(); el.src = ''; attempt();
          };
          const timer = window.setTimeout(bad, 3500);
          el.addEventListener('canplay', ok);
          el.addEventListener('loadedmetadata', ok);
          el.addEventListener('error', bad);
          el.src = src;
          el.load();
        }
        attempt();
      });
    },
    tryRadioStation(index, announce) {
      this.init();
      if (!this.ready || !RADIO_DEFS.length) return;
      if (!this.radioAllowed()) {
        // Keep the chosen station and the music-on preference, but stay silent
        // until the player gets back into a vehicle.
        if (this.musicOn) this.radio.suspendedForPedestrian = true;
        this.pauseProcedural();
        this.stopRadioAudio();
        updateAudioUI();
        return;
      }
      const next = ((index % RADIO_DEFS.length) + RADIO_DEFS.length) % RADIO_DEFS.length;
      this.radio.index = next;
      const station = RADIO_DEFS[next];
      const token = ++this.radio.token;
      this.pauseProcedural();
      this.stopRadioAudio(false);

      const fallback = () => {
        if (token !== this.radio.token || !this.musicOn || !this.radioAllowed()) return;
        this.stopRadioAudio(false);
        this.pauseProcedural();
        this.radio.source = 'silent';
        if (announce) showStationBanner(station.name, 'audio unavailable');
        else toast(station.name + ' — audio unavailable', 2.4);
        updateAudioUI();
      };

      if (!station.files || !station.files.length) { fallback(); return; }
      this.loadStationAudio(station, token).then((el) => {
        if (token !== this.radio.token || !this.musicOn) { el.pause(); return; }
        this.applyRadioVolume(el);
        return Promise.resolve(el.play()).then(() => {
          if (token !== this.radio.token || !this.musicOn) { el.pause(); return; }
          el.loop = true;
          el.addEventListener('error', () => {
            if (this.radio.audio === el) fallback('playback error');
          });
          this.radio.audio = el;
          this.radio.source = 'file';
          if (announce) showStationBanner(station.name, 'now playing');
          else toast(station.name, 2.2);
          updateAudioUI();
        }).catch(() => fallback('audio blocked'));
      }).catch(() => fallback());
    },
    startMusic() {
      this.init();
      if (!this.ready || this.musicOn) return;
      this.musicOn = true;
      if (!this.radioAllowed()) {
        this.radio.suspendedForPedestrian = true;
        this.pauseProcedural();
        this.stopRadioAudio();
        updateAudioUI();
        return;
      }
      const station = this.station();
      if (station.files && station.files.length) this.tryRadioStation(this.radio.index, false);
      else {
        this.pauseProcedural();
        this.radio.source = 'silent';
      }
      updateAudioUI();
    },
    stopMusic() {
      this.musicOn = false;
      this.radio.suspendedForPedestrian = false;
      this.pauseProcedural();
      this.stopRadioAudio();
      updateAudioUI();
    },
    toggleMusic() { this.musicOn ? this.stopMusic() : this.startMusic(); },
    setStation(index, announce) {
      this.init();
      if (!RADIO_DEFS.length) return;
      const next = ((index % RADIO_DEFS.length) + RADIO_DEFS.length) % RADIO_DEFS.length;
      this.radio.index = next;
      const announced = announce !== false;
      if (announced) {
        showStationBanner(RADIO_DEFS[next].name,
          this.musicOn ? 'now playing' : 'selected · press N to play');
      }
      if (this.musicOn) {
        this.radioStatic(0.32);
        this.tryRadioStation(next, announce !== false);
      } else {
        this.pauseProcedural();
        this.stopRadioAudio();
        if (!announced) toast(RADIO_DEFS[next].name + ' selected — press N to play', 2.2);
        updateAudioUI();
      }
    },
    cycleStation(delta) { this.setStation(this.radio.index + (delta || 1), true); },

    chime(up) { /* beeps removed per request */ }
  });

  /* ---------- game ---------- */
  const Game = {
    keys: {},
    vehicles: {},
    activeKey: 'coupe',
    lastVehicle: 'pedestrian',
    pedSkin: 'default',
    started: false,
    bootMessage: '',
    freeRoam: false,
    camMode: 0,
    camModes: ['Chase', 'Hood', 'Cinematic'],
    camTarget: new THREE.Vector3(),
    // Right-stick free look offsets for non-FPV cameras (radians).
    lookYaw: 0,
    lookPitch: 0,
    lookSensitivity: 2.4,
    lookMaxYaw: 1.65,
    lookMaxPitch: 0.78,
    fpvActive: false,
    // Launch point captured from the pedestrian/car when FPV is chosen. The
    // pilot stays there; the quad and its respawn always return to this spot.
    fpvPilot: null,
    ride: null,
    rideStats: { boardings: 0, revenue: 0, coaster: 0, ferris: 0, carousel: 0 },
    fpvMessageTimer: 0,
    lastFpvHudDraw: -1,
    hudCanvasTimer: 0,
    hudTextTimer: 0,
    time: 0,
    activeChallenge: null,
    challengeElapsed: 0,
    gateIndex: 0,
    gateCooldown: 1.2,
    activeAircraftSpawn: null,
    activeStolenCar: null,
    hitMessageCooldown: 0,
    toastTimer: 0,
    bigMessageTimer: 0,
    privateMoment: null,
    safeHouse: null,
    mapOpen: false,
    mapCursor: null,
    mapDirty: true,
    mapDrawTimer: 0,
    mapRenderTimer: 0,
    mapZoom: 1,
    mapPanX: 0,
    mapPanZ: 0,
    mapFocus: 0,
    waypoint: null,
    waypointMode: 'roads',
    route: [],
    routeDistance: 0,
    routeTimer: 0,
    pendingFreeRoam: false, // legacy field; game always starts in free roam
  };
  CC.Game = Game;

  function $(id) { return document.getElementById(id); }

  // HUD text runs at 5-10 Hz; avoid style/layout invalidation when unchanged.
  const hudTextCache = Object.create(null);
  function setText(id, value) {
    if (hudTextCache[id] === value) return;
    hudTextCache[id] = value;
    const el = $(id);
    if (el) el.textContent = value;
  }

  function toast(msg, duration) {
    const el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    Game.toastTimer = duration || 2.6;
  }

  // Dedicated center-top card for radio station changes. It replaces the
  // generic toast when the boombox or a station hotkey is used, and clears any
  // toast already on screen so the station name reads cleanly.
  function showStationBanner(name, detail) {
    const el = $('stationBanner');
    if (!el) return;
    const toastEl = $('toast');
    if (toastEl) toastEl.classList.remove('show');
    el.textContent = '';
    const title = document.createElement('span');
    title.className = 'stationBannerTitle';
    title.textContent = name;
    el.appendChild(title);
    if (detail) {
      const sub = document.createElement('span');
      sub.className = 'stationBannerDetail';
      sub.textContent = detail;
      el.appendChild(sub);
    }
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    window.clearTimeout(Game.stationBannerTimer);
    Game.stationBannerTimer = window.setTimeout(function () {
      el.classList.remove('show');
    }, 2300);
  }
  Game.showStationBanner = showStationBanner;

  // Vehicle specs keep descriptive asset notes for menus, but the short
  // selection toast should read "Name — useful description", not repeat the
  // baked asset prefix between two dashes.
  function cleanVehicleToast(msg) {
    const parts = String(msg).split(/\s+[—–-]\s+/);
    if (parts.length < 3 || !/^baked\b/i.test(parts[1])) return msg;
    return parts[0] + ' — ' + parts.slice(2).join(' — ');
  }

  function bigMessage(text, kind, duration) {
    const el = $('bigMessage');
    if (!el) return;
    el.textContent = text;
    el.className = 'bigMessage show ' + (kind || '');
    Game.bigMessageTimer = duration || 3.2;
  }

  function updateArrestUI(active, escape, time, duration) {
    const el = $('arrestOverlay');
    if (!el) return;
    el.classList.toggle('show', !!active);
    if (!active) return;
    const bar = $('arrestProgressBar');
    if (bar) bar.style.width = Math.round(U.clamp(escape || 0, 0, 1) * 100) + '%';
    const left = $('arrestTimeLeft');
    if (left) left.textContent = Math.max(0, (duration || 0) - (time || 0)).toFixed(1) + 's';
  }

  Game.showMessage = toast;

  Game.resetCameraLook = function () {
    Game.lookYaw = 0;
    Game.lookPitch = 0;
  };

  Game.bigMessage = bigMessage;
  Game.updateArrestUI = updateArrestUI;
  Game.applySplashMedia = applySplashMedia;

  Game.fpvMessage = function (msg, duration) {
    const el = $('fpvMessage');
    if (!el) { toast(msg, duration); return; }
    el.textContent = msg;
    el.classList.add('show');
    Game.fpvMessageTimer = duration || 2.6;
  };

  function setFpvMode(on, drone) {
    Game.fpvActive = !!on;
    if (Game.fpvActive) Game.lastFpvHudDraw = -1;
    const hud = $('hud');
    const overlay = $('fpvOverlay');
    if (hud) hud.classList.toggle('fpvActive', Game.fpvActive);
    if (overlay) overlay.classList.toggle('hidden', !Game.fpvActive);
    if (drone && drone.isFpv) {
      if (Game.fpvActive) {
        // The quad is visible for a fraction of a second after launch, then
        // FpvDrone.endSpawnFlash() hides it so it cannot block the camera.
        if (!drone.spawnFlash) drone.setVisible(false);
      } else {
        drone.spawnFlash = 0;
        drone.setVisible(false);
      }
    }
    if (!Game.fpvActive) {
      const msg = $('fpvMessage');
      if (msg) msg.classList.remove('show');
      Game.fpvMessageTimer = 0;
    }
  }

  // Leaving the goggles puts the player back in whatever they were driving or
  // walking when FPV was chosen, at the exact same coordinates.
  function exitFpv() {
    if (!Game.fpvActive) return;
    const drone = Game.vehicles.fpv;
    if (drone) {
      drone.spawnFlash = 0;
      drone.setVisible(false);
    }
    const pilot = Game.fpvPilot;
    const key = pilot && Game.vehicles[pilot.key] ? pilot.key : 'pedestrian';
    const pose = pilot
      ? { x: pilot.x, z: pilot.z, h: pilot.h, s: 0, altitude: pilot.altitude }
      : null;
    const changed = selectVehicle(key, pose || undefined);
    if (!changed) setFpvMode(false, null);
    Game.fpvPilot = null;
    toast('FPV goggles off — back at the pilot', 2.2);
  }

  function setFreeRoam(on) {
    Game.freeRoam = true;

    const gates = CC.World && CC.World.challengeGates ? CC.World.challengeGates : [];
    for (let i = 0; i < gates.length; i++) gates[i].group.visible = false;
    Game.activeChallenge = null;
    Game.gateIndex = 0;
  }

  let loadingMediaUrl = null;
  function loadingVolume() { return U.clamp(Audio.volumes.master * 0.9, 0, 1); }

  function stopLoadingMedia() {
    ['loadingVideo', 'loadingAudio'].forEach(function (id) {
      const el = $(id);
      if (!el) return;
      el.pause();
      try { el.currentTime = 0; } catch (err) { /* not seekable */ }
      el.removeAttribute('src');
      if (el.load) el.load();
    });
    const video = $('loadingVideo'), splash = $('splash');
    if (video) video.classList.add('hidden');
    if (splash) splash.classList.remove('splashVideoOn');
    if (loadingMediaUrl && loadingMediaUrl.indexOf('blob:') === 0) {
      URL.revokeObjectURL(loadingMediaUrl);
    }
    loadingMediaUrl = null;
    Game.loadingMedia = null;
  }

  function startIntroMusic() {
    const el = $('introMusic');
    if (!el) return;
    if (!el.getAttribute('src')) el.src = 'media/base_211.m4a';
    el.loop = true;
    el.volume = loadingVolume();
    try { if (el.paused) { const p = el.play(); if (p && p.catch) p.catch(function () {}); } } catch (err) { /* ignore */ }
  }

  // Automatic fullscreen on first gesture removed; use the FULL SCREEN button.

  function primeIntroMusicOnLoad() {
    startIntroMusic();
    const resume = function () {
      startIntroMusic();
      window.removeEventListener('pointerdown', resume);
      window.removeEventListener('keydown', resume);
      window.removeEventListener('touchstart', resume);
    };
    window.addEventListener('pointerdown', resume);
    window.addEventListener('keydown', resume);
    window.addEventListener('touchstart', resume);
  }

  function stopIntroMusic() {
    const el = $('introMusic');
    if (!el) return;
    try { el.pause(); } catch (err) { /* ignore */ }
  }

  // file:// safe: the chosen file becomes an in-memory object URL and is never
  // uploaded. A string URL is also accepted so tests can pass a data URI.
  function playLoadingMedia(kind, file) {
    if (!file) return;
    stopLoadingMedia();
    stopIntroMusic();
    const isVideo = kind === 'video';
    const url = typeof file === 'string' ? file : URL.createObjectURL(file);
    loadingMediaUrl = url;
    Game.loadingMedia = {
      kind: kind,
      name: typeof file === 'string' ? 'custom media' : file.name
    };
    const el = $(isVideo ? 'loadingVideo' : 'loadingAudio');
    const other = $(isVideo ? 'loadingAudio' : 'loadingVideo');
    if (other) other.pause();
    if (!el) return;
    el.src = url;
    el.loop = true;
    el.volume = loadingVolume();
    el.muted = false;
    if (isVideo) {
      el.classList.remove('hidden');
      const splash = $('splash');
      if (splash) splash.classList.add('splashVideoOn');
    }
    const label = $('loadingMediaName');
    if (label) label.textContent = 'Playing: ' + Game.loadingMedia.name + ' — stops when the game starts';
    const attempt = el.play();
    if (attempt && attempt.catch) attempt.catch(function () {
      if (isVideo) {
        el.muted = true;
        const retry = el.play();
        if (retry && retry.catch) retry.catch(function () {});
      }
      const hint = $('loadingMediaName');
      if (hint) hint.textContent = 'Tap the splash card to allow playback';
    });
  }
  Game.playLoadingMedia = playLoadingMedia;
  Game.stopLoadingMedia = stopLoadingMedia;

  // Optional presentation media. Every path is local, so this still works from
  // file://. Missing images/videos quietly fall back to the built-in splash.
  function applySplashMedia() {
    const splash = $('splash');
    primeIntroMusicOnLoad();
    if (splash) splash.addEventListener('pointerdown', function () {
      startIntroMusic();
    });
  }

  function setSplashReady(on) {
    const splash = $('splash');
    if (splash) {
      splash.classList.toggle('splashReady', !!on);
      splash.classList.toggle('townReady', !!on);
    }
  }

  let autoStartTimer = null;
  function clearAutoStart() {
    if (autoStartTimer) { clearTimeout(autoStartTimer); autoStartTimer = null; }
  }

  function startOrSkip() {
    startIntroMusic();
    startGame();
  }

  function startGame() {
    if (Game.started || Game.townReadyScreen) return;
    Game.townReadyScreen = true;
    Game.pendingFreeRoam = true;
    Game.activeKey = 'coupe';
    const startBtn = $('startBtn');
    if (startBtn) { startBtn.disabled = true; startBtn.style.display = 'none'; }
    const startArea = $('splashStartArea');
    if (startArea) startArea.style.display = 'none';
    // Hide splash UI and show B&W loaded town while music plays, then auto-start.
    setSplashReady(true);
    clearAutoStart();
    autoStartTimer = setTimeout(function () { finishStart(); }, 10000);
  }

  function finishStart() {
    if (Game.started) return;
    clearAutoStart();
    Game.started = true;
    Game.keys = {};
    setFreeRoam(true);
    const splash = $('splash');
    if (splash) splash.classList.add('splashGone');
    stopLoadingMedia();
    stopIntroMusic();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    Audio.init();
    // Start with Cruise 101 playing when spawning in a vehicle.
    Audio.stopMusic();
    const cruiseIdx = (CC.radioStationDefs || []).findIndex(function (s) { return /cruise 101/i.test(s.name); });
    if (cruiseIdx >= 0) Audio.radio.index = cruiseIdx;
    if (Audio.radioAllowed()) Audio.startMusic();
    updateAudioUI();
    updateWorldUI();
    updateFullscreenUI();
    toast(Game.bootMessage || 'Welcome to Coastal Cruise', 5);
  }

  function nearestAircraftSpawn(pos) {
    let best = null, bestD = 8;
    (CC.aircraftSpawns || []).forEach(function (s) {
      const d = U.distance2D(pos.x, pos.z, s.x, s.z);
      if (d < bestD) { bestD = d; best = s; }
    });
    return best;
  }

  function nearestSafeHouse(pos) {
    const list = CC.Details && CC.Details.safeHouses || [];
    let best = null, bestD = 4.2;
    for (let i = 0; i < list.length; i++) {
      const d = U.distance2D(pos.x, pos.z, list[i].entryX, list[i].entryZ);
      if (d < bestD) { bestD = d; best = list[i]; }
    }
    return best;
  }

  function enterSafeHouse(house) {
    if (!house || Game.safeHouse) return;
    Game.safeHouse = house;
    Game.privateMoment = null;
    const fade = $('privateFade');
    if (fade) fade.classList.remove('show');
    selectVehicle('pedestrian', {
      x: house.x, z: house.z, h: house.heading, s: 0
    });
    const ped = Game.vehicles.pedestrian;
    if (ped) {
      ped.inSafeHouse = true;
      ped.group.visible = false;
    }
    if (CC.NPCSystem && CC.NPCSystem.clearWanted) CC.NPCSystem.clearWanted();
    const overlay = $('safeHouseOverlay');
    if (overlay) {
      const name = $('safeHouseName');
      if (name) name.textContent = house.name;
      overlay.classList.add('show');
    }
    bigMessage('Safe house', 'safe', 2.8);
    toast('You lie low inside. The police lose your trail.', 4);
  }

  function exitSafeHouse() {
    const house = Game.safeHouse;
    if (!house) return;
    Game.safeHouse = null;
    selectVehicle('pedestrian', {
      x: house.entryX, z: house.entryZ, h: house.heading, s: 0
    });
    const ped = Game.vehicles.pedestrian;
    if (ped) {
      ped.inSafeHouse = false;
      ped.group.visible = true;
    }
    const overlay = $('safeHouseOverlay');
    if (overlay) overlay.classList.remove('show');
    toast('Back on the street', 1.8);
  }
  Game.enterSafeHouse = enterSafeHouse;
  Game.exitSafeHouse = exitSafeHouse;
  Game.nearestSafeHouse = nearestSafeHouse;

  /* ---------- paid amusement-park rides ----------
     Rides are real moving platforms: the guest figure is parented to a car,
     gondola or horse, and the pedestrian camera follows that seat until the
     circuit finishes. All three stations use the same cash path. */
  const rideWorld = new THREE.Vector3();
  const rideQuat = new THREE.Quaternion();
  const rideFwd = new THREE.Vector3();
  function ridePrice(price) { return '$' + Number(price || 0).toFixed(2); }

  function nearestAmusementRide(pos, radius) {
    if (!pos || !CC.Details || !CC.Details.rideStations) return null;
    let best = null, bestD = radius || 5.5;
    for (let i = 0; i < CC.Details.rideStations.length; i++) {
      const station = CC.Details.rideStations[i];
      const d = U.distance2D(pos.x, pos.z, station.x, station.z);
      if (d < bestD) { bestD = d; best = station; }
    }
    return best;
  }

  function currentRideHint(pos) {
    if (Game.ride) return 'E / R3 &nbsp;•&nbsp; RIDE IN PROGRESS';
    const station = nearestAmusementRide(pos);
    if (!station) return '';
    return 'E / R3 &nbsp;•&nbsp; RIDE ' + station.name + ' ' + ridePrice(station.price);
  }

  function boardAmusementRide(station) {
    const ped = Game.vehicles.pedestrian;
    if (!station || !ped || !ped.isPedestrian || Game.activeKey !== 'pedestrian' || Game.ride) {
      return false;
    }
    const crime = CC.CrimeSystem;
    if (!crime || !crime.spendMoney(station.price)) {
      Game.showMessage('Not enough cash for ' + station.name + ' (' + ridePrice(station.price) + ')', 2.8);
      return false;
    }
    const seats = (CC.Details.rideSeats && CC.Details.rideSeats[station.key]) || [];
    if (!seats.length) {
      crime.addMoney(station.price);
      Game.showMessage(station.name + ' is not ready yet', 2.4);
      return false;
    }
    const slot = seats[Game.rideStats[station.key] % seats.length];
    let rider = new THREE.Group();
    if (CC.CharacterFactory) {
      rider = CC.CharacterFactory.build({
        skin: 0xe8bd96, shirt: 0xf2b84b, pants: 0x405466,
        hair: 0x35291f, hat: 0x2f7d88, bag: 0x8f5b45
      }).group;
    }
    rider.scale.setScalar(station.key === 'coaster' ? 0.42 : 0.52);
    rider.position.set(slot.offset.x, slot.offset.y, slot.offset.z);
    slot.host.add(rider);

    Game.ride = {
      key: station.key,
      station: station,
      slot: slot,
      rider: rider,
      returnPos: ped.pos.clone(),
      returnHeading: ped.heading,
      duration: { coaster: 20, ferris: 18, carousel: 14 }[station.key] || 16,
      remaining: 0,
      elapsed: 0
    };
    Game.ride.remaining = Game.ride.duration;
    Game.rideStats.boardings++;
    Game.rideStats[station.key] = (Game.rideStats[station.key] || 0) + 1;
    Game.rideStats.revenue += station.price;
    ped.speed = 0;
    ped.setVisible(false);
    Game.showMessage('Paid ' + ridePrice(station.price) + ' — ' + station.name + ' ride started', 3);
    return true;
  }

  function finishAmusementRide(ped) {
    const ride = Game.ride;
    if (!ride) return false;
    if (ride.rider && ride.slot && ride.slot.host) ride.slot.host.remove(ride.rider);
    Game.ride = null;
    const walker = ped || Game.vehicles.pedestrian;
    if (walker && walker.isPedestrian) {
      walker.setPose(ride.returnPos.x, ride.returnPos.z, ride.returnHeading, 0);
      walker.setVisible(Game.activeKey === 'pedestrian');
    }
    Game.showMessage(ride.station.name + ' ride complete', 2.4);
    return true;
  }

  function updateAmusementRide(dt, ped) {
    const ride = Game.ride;
    if (!ride || !ped || !ped.isPedestrian) return false;
    ride.remaining -= dt;
    ride.elapsed += dt;
    const host = ride.slot && ride.slot.host;
    if (host && Game.scene) {
      Game.scene.updateMatrixWorld(true);
      rideWorld.set(ride.slot.offset.x, ride.slot.offset.y, ride.slot.offset.z);
      host.localToWorld(rideWorld);
      ped.pos.copy(rideWorld);
      host.getWorldQuaternion(rideQuat);
      rideFwd.set(0, 0, 1).applyQuaternion(rideQuat);
      if (rideFwd.lengthSq() > 0.001) ped.heading = Math.atan2(rideFwd.x, rideFwd.z);
    }
    if (ride.remaining <= 0) return finishAmusementRide(ped);
    return true;
  }

  Game.nearestAmusementRide = nearestAmusementRide;
  Game.currentRideHint = currentRideHint;
  Game.boardAmusementRide = boardAmusementRide;
  Game.updateAmusementRide = updateAmusementRide;
  Game.finishAmusementRide = finishAmusementRide;

  function toggleOnFoot() {
    if (Game.ride) { Game.showMessage('Enjoy the ride — you get off at the station', 1.8); return; }
    if (Game.fpvActive) { exitFpv(); return; }
    if (CC.InteriorSystem && CC.InteriorSystem.current) {
      CC.InteriorSystem.exit(Game.vehicles.pedestrian);
      return;
    }
    if (Game.safeHouse) { exitSafeHouse(); return; }
    if (Game.activeKey === 'pedestrian') {
      const ped = Game.vehicles.pedestrian;
      const N = CC.NPCSystem;
      const door = CC.InteriorSystem && CC.InteriorSystem.nearestDoor(ped.pos);
      if (door) { CC.InteriorSystem.enter(door, ped); return; }
      if (CC.CrimeSystem && CC.CrimeSystem.canRob(ped.pos)) {
        CC.CrimeSystem.rob(ped.pos);
        return;
      }
      const safe = nearestSafeHouse(ped.pos);
      if (safe) { enterSafeHouse(safe); return; }
      const ride = nearestAmusementRide(ped.pos);
      if (ride) { boardAmusementRide(ride); return; }
      // Any nearby drivable vehicle can be hot-wired with E or R3: road cars,
      // buses, cruisers, gang cars, NPC boats and parked aircraft.
      if (N && N.nearestStealableCar && N.stealVehicle) {
        const target = N.nearestStealableCar(ped.pos);
        if (target) {
          const stolen = N.stealVehicle(target);
          if (stolen) {
            Game.activeStolenCar = stolen;
            // Aircraft keep their exact spawn so the right parked craft is
            // hidden and its altitude is applied when the player boards it.
            if (target.type === 'aircraft') selectVehicle(stolen.key, stolen.pose, target.source);
            else selectVehicle(stolen.key, stolen.pose);
            return;
          }
        }
      }
      // Legacy fallback for a parked car when the generic lookup is missing.
      if (N && N.stealNearest && N.nearestParkedCar(ped.pos)) {
        const car = N.stealNearest(ped.pos);
        if (car) {
          Game.activeStolenCar = car;
          selectVehicle(car.kind, {
            x: car.pose.x, z: car.pose.z, h: car.pose.h, s: 0
          });
          return;
        }
      }
      const target = Game.lastVehicle;
      if (target && Game.vehicles[target]) selectVehicle(target);
      return;
    }
    if (Game.vehicles.pedestrian) selectVehicle('pedestrian');
  }
  Game.toggleOnFoot = toggleOnFoot;

  function updateMusicButton() {
    const btn = $('musicBtn');
    if (!btn || !Audio) return;
    const pct = Math.round((Audio.volumes.music || 0) * 100);
    btn.classList.toggle('off', pct <= 0 || !Audio.musicOn);
    const label = 'Music volume · ' + pct + '%';
    btn.dataset.label = label;
    btn.setAttribute('aria-label', label);
  }

  function updateRadioButton() {
    if (!Audio) return;
    const onFoot = !Audio.radioAllowed();
    const stationBtn = $('stationBtn');
    if (stationBtn) {
      stationBtn.textContent = '📻 ' + Audio.stationName() + (onFoot ? ' · ON FOOT' : '');
      stationBtn.classList.toggle('file', !onFoot && Audio.radio.source === 'file');
      stationBtn.classList.toggle('off', onFoot);
    }
    const boombox = $('radioBtn');
    if (boombox) {
      const label = 'Next station · ' + Audio.stationName() + (onFoot ? ' · on foot' : '');
      boombox.dataset.label = label;
      boombox.setAttribute('aria-label', label);
      boombox.classList.toggle('off', onFoot);
    }
  }

  /* ---------- full-screen display option ---------- */
  function isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement ||
      document.msFullscreenElement);
  }
  function requestFullscreen() {
    const el = document.documentElement || document.body;
    try {
      if (el.requestFullscreen) return el.requestFullscreen();
      if (el.webkitRequestFullscreen) return el.webkitRequestFullscreen();
      if (el.msRequestFullscreen) return el.msRequestFullscreen();
    } catch (err) { /* browser refused */ }
    return null;
  }
  function exitFullscreen() {
    try {
      if (document.exitFullscreen) return document.exitFullscreen();
      if (document.webkitExitFullscreen) return document.webkitExitFullscreen();
      if (document.msExitFullscreen) return document.msExitFullscreen();
    } catch (err) { /* browser refused */ }
    return null;
  }
  function updateFullscreenUI() {
    const btn = $('fullscreenBtn');
    if (btn) btn.textContent = isFullscreen() ? '⛶ EXIT FULL SCREEN' : '⛶ FULL SCREEN';
  }
  function toggleFullscreen(force) {
    const want = force == null ? !isFullscreen() : !!force;
    if (want) {
      const p = requestFullscreen();
      if (p && p.catch) p.catch(function () {
        toast('Full screen was blocked — click the FULL SCREEN button again', 3);
      });
    } else {
      exitFullscreen();
    }
    updateFullscreenUI();
  }
  Game.toggleFullscreen = toggleFullscreen;
  Game.isFullscreen = isFullscreen;
  Game.requestFullscreen = requestFullscreen;

  function updateVolumeUI() {
    if (!Audio || !Audio.volumes) return;
    const rows = [
      ['masterVol', 'masterVal', Audio.volumes.master],
      ['musicVol', 'musicVal', Audio.volumes.music],
      ['sfxVol', 'sfxVal', Audio.volumes.sfx]
    ];
    rows.forEach(function (row) {
      const slider = $(row[0]), label = $(row[1]);
      const pct = Math.round(row[2] * 100);
      if (slider && document.activeElement !== slider) slider.value = pct;
      if (label) label.textContent = pct + '%';
    });
    const musicPct = Math.round((Audio.volumes.music || 0) * 100);
    const quick = $('quickMusicVol'), quickVal = $('quickMusicVal');
    if (quick && document.activeElement !== quick) quick.value = musicPct;
    if (quickVal) quickVal.textContent = String(musicPct);
    updateMusicButton();
    const loadVol = loadingVolume();
    ['loadingAudio', 'loadingVideo'].forEach(function (id) {
      const el = $(id);
      if (el) el.volume = loadVol;
    });
  }

  function updateAudioUI() {
    updateMusicButton();
    updateRadioButton();
    updateVolumeUI();
  }

  function clockText(timeOfDay) {
    const total = Math.floor(((timeOfDay % 1) + 1) % 1 * 24 * 60);
    const hh = Math.floor(total / 60), mm = total % 60;
    return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
  }

  function updateWorldUI() {
    const w = CC.Weather;
    if (!w) return;
    const clock = clockText(w.timeOfDay);
    const icon = w.night > 0.45 ? '☾' : w.rain > 0.35 ? '☂' : '☀';
    const weatherName = w.weather.toUpperCase();
    setText('worldStatus', icon + ' ' + clock + ' • ' + weatherName);
    setText('weatherBtn', weatherName);

    const timeSlider = $('timeSlider');
    const pct = Math.round(w.timeOfDay * 100);
    if (timeSlider && document.activeElement !== timeSlider && Number(timeSlider.value) !== pct) {
      timeSlider.value = pct;
    }
    setText('timeVal', clock);
  }

  function updateWantedHud() {
    const el = $('wantedBadge');
    if (!el) return;
    const N = CC.NPCSystem;
    const stars = N ? N.wantedStars || 0 : 0;
    el.classList.toggle('show', stars > 0);
    if (!stars) { el.textContent = ''; return; }
    const remaining = Math.max(0, (N.EVADE_SECONDS || 180) - (N.evadeTimer || 0));
    const mm = Math.floor(remaining / 60);
    const ss = Math.floor(remaining % 60);
    const timed = String(ss).padStart(2, '0');
    const html = '<span class="wantedStars">' + '★'.repeat(stars) +
      '<span class="wantedEmpty">' + '☆'.repeat(Math.max(0, 5 - stars)) + '</span>' +
      '</span><span class="wantedLabel">WANTED</span>' +
      '<span class="wantedTime">' + mm + ':' + timed + '</span>';
    if (el.innerHTML !== html) el.innerHTML = html;
  }

  function cycleWeather() {
    if (!CC.Weather) return;
    const order = ['clear', 'cloudy', 'rain'];
    const next = order[(order.indexOf(CC.Weather.weather) + 1) % order.length];
    CC.Weather.setWeather(next);
    toast('Weather: ' + next, 1.6);
    updateWorldUI();
  }

  function toggleSettings(force) {
    const panel = $('settings');
    if (!panel) return;
    const show = force == null ? panel.classList.contains('hidden') : !!force;
    panel.classList.toggle('hidden', !show);
    if (show) {
      updateAudioUI();
      updateWorldUI();
    }
  }

  function returnToMenu() {
    if (!Game.started) return;

    if (CC.InteriorSystem && CC.InteriorSystem.current) CC.InteriorSystem.leave();
    if (Game.fpvActive) exitFpv();
    if (Game.mapOpen) toggleFullMap(false);
    if (Game.safeHouse) {
      Game.safeHouse = null;
      const ped = Game.vehicles.pedestrian;
      if (ped) { ped.inSafeHouse = false; ped.group.visible = true; }
    }
    if (Game.privateMoment) {
      Game.privateMoment = null;
      const fade = $('privateFade');
      if (fade) fade.classList.remove('show');
    }
    if (Game.ride) { try { Game.ride.finish(); } catch (e) {} Game.ride = null; }
    toggleSettings(false);
    stopLoadingMedia();
    Game.started = false;
    Game.keys = {};
    Game.pendingFreeRoam = false;
    if (Audio && Audio.stopMusic) Audio.stopMusic();
    stopIntroMusic();
    startIntroMusic();
    Game.townReadyScreen = false;
    Game.activeKey = 'coupe';
    setSplashReady(false);
    const splash = $('splash');
    if (splash) splash.classList.remove('splashGone');
    const startBtn = $('startBtn');
    if (startBtn) { startBtn.disabled = false; startBtn.style.display = ''; }
    const startArea = $('splashStartArea');
    if (startArea) startArea.style.display = '';
    const status = $('splashStatusText');
    if (status) status.textContent = 'Town loaded — press START';
    updateSplashFocus();
    toast('Returned to menu', 1.6);
  }

  /* ---------- input ---------- */
  function bindInput() {
    window.addEventListener('keydown', function (e) {
      const k = e.key.toLowerCase();
      if (k === 'escape') {
        if (Game.mapOpen) { toggleFullMap(false); return; }
        if (Game.fpvActive) { exitFpv(); return; }
        if (CC.InteriorSystem && CC.InteriorSystem.current) { CC.InteriorSystem.leave(); return; }
        const settings = $('settings');
        if (settings && !settings.classList.contains('hidden')) { toggleSettings(false); return; }
        returnToMenu();
        return;
      }
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && k !== 'p') return;
      if (!Game.started) {
        if (k === 'arrowleft' || k === 'arrowright') {
          e.preventDefault();
          // single start button
          updateSplashFocus();
          return;
        }
        if (k === 'enter' || k === ' ') { e.preventDefault(); startOrSkip(); }
        return;
      }
      Audio.init();
      Game.keys[k] = true;
      if (Game.mapOpen) {
        const step = e.shiftKey ? 30 : 10;
        if (k === 'arrowleft' || k === 'a') { moveMapCursor(-step, 0); return; }
        if (k === 'arrowright' || k === 'd') { moveMapCursor(step, 0); return; }
        if (k === 'arrowup' || k === 'w') { moveMapCursor(0, -step); return; }
        if (k === 'arrowdown' || k === 's') { moveMapCursor(0, step); return; }
        if (k === '=' || k === '+' ) { setMapZoom((Game.mapZoom || 1) * 1.2, mapCursor()); return; }
        if (k === '-' || k === '_' ) { setMapZoom((Game.mapZoom || 1) / 1.2, mapCursor()); return; }
        if (k === 'tab') { e.preventDefault(); Game.mapFocus = (Game.mapFocus || 0) + (e.shiftKey ? -1 : 1); updateMapFocus(); return; }
        if (k === 'enter' || k === ' ') {
          e.preventDefault();
          const btns = mapActionButtons(); const btn = btns[Game.mapFocus || 0];
          if (btn) runMapAction(btn.dataset.mapAction);
          return;
        }
        if (k === 'n') { runMapAction('navigate'); return; }
        if (k === 'g' || k === 't') { spawnAtWaypoint(mapCursor()); return; }
        if (k === 'm') { toggleFullMap(false); return; }
        if (k === 'q' && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); returnToMenu(); return; }
        return;
      }
      if (k === 'f' || k === 'tab') {
        if (k === 'tab') e.preventDefault();
        // Street Racing mode removed; keep as no-op/free roam.
        setFreeRoam(true);
      }
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'shift', 'q', 'z'].includes(k)) e.preventDefault();
      if (k === '0') {
        if (Game.activeKey === 'fpv') exitFpv();
        else selectVehicle('fpv');
      }
      if (k === 'j') selectVehicle('jetpack');
      if (k >= '1' && k <= '9') {
        const key = CC.vehicleOrder[Number(k) - 1];
        if (key && key !== Game.activeKey) selectVehicle(key);
      }
      if (k === 'e') toggleOnFoot();
      if (k === 'u') selectVehicle('bus');
      if (k === 'x') Game.horn();
      if (k === 'n') Audio.toggleMusic();
      if (k === 'b') Audio.cycleStation(1);
      if (k === 'p') toggleSettings();
      if (k === 'q' && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); returnToMenu(); }
      if (k === 'v') cycleWeather();
      if (k === 'c') {
        Game.camMode = (Game.camMode + 1) % Game.camModes.length;
        toast('Camera: ' + Game.camModes[Game.camMode], 1.4);
      }
      if (k === 'r') {
        Game.vehicles[Game.activeKey].reset(CC.World);
        toast('Vehicle reset', 1.2);
      }
      if (k === 'h') $('help').classList.toggle('hidden');
      if (k === 'm') toggleFullMap();
      if (k === 'g') spawnAtWaypoint();
    });
    window.addEventListener('keyup', function (e) { Game.keys[e.key.toLowerCase()] = false; });
    window.addEventListener('pointerdown', function () { Audio.init(); });
    window.addEventListener('blur', function () { Game.keys = {}; });
    document.querySelectorAll('.vehBtn:not(.skinBtn)').forEach(function (btn) {
      btn.addEventListener('click', function () {
        Audio.init();
        if (btn.dataset.key !== Game.activeKey) selectVehicle(btn.dataset.key);
        const panel = $('vehiclePanel');
        if (panel) panel.classList.add('hidden');
        btn.blur();
      });
    });
    document.querySelectorAll('.skinBtn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        Audio.init();
        if (Game.activeKey !== 'pedestrian' && !selectVehicle('pedestrian')) return;
        setPedestrianSkin(btn.dataset.skin);
        const panel = $('vehiclePanel');
        if (panel) panel.classList.add('hidden');
        btn.blur();
      });
    });
    function closeVolumePopup() {
      const pop = $('volumePopup'), btn = $('musicBtn');
      if (pop) pop.classList.add('hidden');
      if (btn) {
        btn.classList.remove('active');
        btn.setAttribute('aria-expanded', 'false');
      }
    }

    const startBtn = $('startBtn');
    if (startBtn) startBtn.addEventListener('click', function () { startOrSkip(); });
    const musicBtn = $('musicBtn');
    if (musicBtn) musicBtn.addEventListener('click', function () {
      Audio.init();
      const pop = $('volumePopup');
      if (pop) {
        const open = !pop.classList.toggle('hidden');
        musicBtn.classList.toggle('active', open);
        musicBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) {
          const quick = $('quickMusicVol');
          if (quick) quick.value = Math.round((Audio.volumes.music || 0) * 100);
          updateVolumeUI();
        }
      }
      musicBtn.blur();
    });
    const quickMusicVol = $('quickMusicVol');
    if (quickMusicVol) {
      quickMusicVol.addEventListener('input', function () {
        Audio.init();
        Audio.setMusicVolume(Number(quickMusicVol.value) / 100);
      });
      quickMusicVol.addEventListener('change', function () { quickMusicVol.blur(); });
    }
    const radioBtn = $('radioBtn');
    if (radioBtn) radioBtn.addEventListener('click', function () {
      Audio.init();
      closeVolumePopup();
      Audio.cycleStation(1);
      radioBtn.blur();
    });
    const vehiclesBtn = $('vehiclesBtn');
    if (vehiclesBtn) vehiclesBtn.addEventListener('click', function () {
      closeVolumePopup();
      const panel = $('vehiclePanel');
      if (panel) panel.classList.toggle('hidden');
      vehiclesBtn.blur();
    });
    const settingsBtn = $('settingsBtn');
    if (settingsBtn) settingsBtn.addEventListener('click', function () {
      closeVolumePopup();
      toggleSettings();
      settingsBtn.blur();
    });
    const settingsClose = $('settingsClose');
    if (settingsClose) settingsClose.addEventListener('click', function () { toggleSettings(false); });
    const menuBtn = $('menuBtn');
    if (menuBtn) menuBtn.addEventListener('click', function () { returnToMenu(); menuBtn.blur(); });
    const weatherBtn = $('weatherBtn');
    if (weatherBtn) weatherBtn.addEventListener('click', function () { cycleWeather(); weatherBtn.blur(); });

    const fullscreenBtn = $('fullscreenBtn');
    if (fullscreenBtn) fullscreenBtn.addEventListener('click', function () {
      toggleFullscreen();
      fullscreenBtn.blur();
    });
    // Full screen is manual via the FULL SCREEN button.
    if (document.addEventListener) {
      document.addEventListener('fullscreenchange', updateFullscreenUI);
      document.addEventListener('webkitfullscreenchange', updateFullscreenUI);
    }
    updateFullscreenUI();

    [['masterVol', 'setMasterVolume'], ['musicVol', 'setMusicVolume'], ['sfxVol', 'setSfxVolume']].forEach(function (row) {
      const slider = $(row[0]);
      if (!slider) return;
      slider.addEventListener('input', function () {
        Audio.init();
        Audio[row[1]](Number(slider.value) / 100);
      });
    });
    const timeSlider = $('timeSlider');
    if (timeSlider && CC.Weather) {
      timeSlider.addEventListener('input', function () {
        CC.Weather.timeOfDay = Number(timeSlider.value) / 100;
        updateWorldUI();
      });
      timeSlider.addEventListener('change', function () { timeSlider.blur(); });
    }
    bindFullMapUI();
    updateAudioUI();
  }

  function readInput(pad, v) {
    if (!Game.started) {
      // Only the pre-start splash needs this object; do not allocate it on
      // every gameplay frame.
      return {
        throttle: 0, steer: 0, yaw: 0, lift: 0, pitch: 0, roll: 0,
        handbrake: false, boost: false, dive: false, climb: false, descend: false,
        fpvPitch: 0, fpvRoll: 0, fpvYaw: 0
      };
    }
    const k = Game.keys;
    const p = pad || {};
    const isAircraft = !!(v && v.isAircraft);
    const isHover = isAircraft && (v.key === 'fpv' || !!v.spec.hover);
    const keyThrottle = (k['w'] || k['arrowup'] ? 1 : 0) - (k['s'] || k['arrowdown'] ? 1 : 0);
    const keySteer = (k['d'] || k['arrowright'] ? 1 : 0) - (k['a'] || k['arrowleft'] ? 1 : 0);
    const keyYaw = (k['z'] ? 1 : 0) - (k['q'] ? 1 : 0);
    const keyLift = (k['shift'] ? 1 : 0) - (k[' '] ? 1 : 0);
    // Dedicated analog flight axes from Gamepad.read(); the generic aliases are
    // kept for keyboard-driven tests and older callers.
    const padYaw = p.flightYaw != null ? p.flightYaw : (p.yaw || 0);
    const padPitch = p.flightPitch != null ? p.flightPitch : (p.pitch || 0);
    const padRoll = p.flightRoll != null ? p.flightRoll : (p.roll || 0);

    let throttle = keyThrottle + (p.throttle || 0);
    let steer = -(keySteer + (p.steer || 0)); // ground steering is visually inverted
    let pitch = padPitch;
    let roll = padRoll;
    let yaw = keyYaw + padYaw;
    let lift = keyLift + (p.lift || 0);

    if (isHover) {
      // Helicopters and the quad use Mode 2: left stick up/down is collective
      // lift with a centred hold, left X is yaw, right X/Y is roll and pitch.
      // The keyboard mirrors that with W/S, A/D, Q/Z and Shift/Space.
      pitch = keyThrottle + padPitch;
      roll = keySteer + padRoll;
      // FPV and jetpack share the same left/right mapping: A/D strafe in the
      // direction the player expects instead of the drone's old inverted acro roll.
      if (v && v.spec && (v.spec.jetpack || v.spec.fpv)) roll = -roll;
      throttle = p.throttle || 0;
      steer = 0;
    } else if (isAircraft) {
      // A plane's left stick is airspeed; right-stick pitch climbs or dives and
      // right-stick roll banks into a turn. Left X adds rudder yaw. Keyboard
      // Shift/Space stay as a climb/dive fallback when the stick is centred.
      roll = keySteer + padRoll;
      if (Math.abs(pitch) < 0.02 && keyLift) pitch = -keyLift;
    }

    return {
      throttle: U.clamp(throttle, -1, 1),
      steer: U.clamp(steer, -1, 1),
      yaw: U.clamp(yaw, -1, 1),
      lift: U.clamp(lift, -1, 1),
      pitch: U.clamp(pitch, -1, 1),
      roll: U.clamp(roll, -1, 1),
      handbrake: !!k[' '] || !!p.handbrake,
      // Space / A doubles as the pedestrian dive button and the aircraft descend button.
      dive: !!k[' '] || !!p.handbrake,
      boost: !!k['shift'] || !!p.boost,
      // Explicit aircraft vertical axes; boost/handbrake remain keyboard fallbacks.
      climb: !!k['shift'] || !!p.boost,
      descend: !!k[' '] || !!p.handbrake,
      // Legacy acro aliases kept for the drone and older callers.
      fpvPitch: U.clamp(pitch, -1, 1),
      fpvRoll: U.clamp(roll, -1, 1),
      fpvYaw: U.clamp(yaw, -1, 1)
    };
  }

  function selectVehicleByDelta(delta) {
    const i = CC.vehicleOrder.indexOf(Game.activeKey);
    const next = CC.vehicleOrder[(i + delta + CC.vehicleOrder.length) % CC.vehicleOrder.length];
    if (next && next !== Game.activeKey) selectVehicle(next);
  }

  // single start button; no splashFocus needed
  function updateSplashFocus() {
    const btn = $('startBtn');
    if (btn) { btn.classList.add('focused'); btn.focus({ preventScroll: true }); }
  }

  function handleGamepadActions(pad) {
    if (!Game.started) {
      if (pad.start || pad.camera) startOrSkip();
      return;
    }
    // A gamepad button counts as a user gesture on browsers that allow it.
    if (pad.camera || pad.reset || pad.prevVehicle || pad.nextVehicle || pad.help || pad.spawn || pad.map || pad.music || pad.radio || pad.horn || pad.exit) Audio.init();
    if (pad.music) Audio.toggleMusic();
    if (pad.radio) Audio.cycleStation(1);
    if (pad.horn) Game.horn();
    if (pad.exit) toggleOnFoot();
    if (pad.camera) {
      Game.camMode = (Game.camMode + 1) % Game.camModes.length;
      toast('Camera: ' + Game.camModes[Game.camMode], 1.4);
    }
    if (pad.reset) {
      Game.vehicles[Game.activeKey].reset(CC.World);
      toast('Vehicle reset', 1.2);
    }
    if (pad.prevVehicle) selectVehicleByDelta(-1);
    if (pad.nextVehicle) selectVehicleByDelta(1);
    if (Game.mapOpen) {
      const now = Game.time || 0;
      const step = (pad.boost ? 30 : 10);
      if (!Game.mapMoveAt || now - Game.mapMoveAt > 0.11) {
        let moved = false;
        if (pad.menuLeft) { moveMapCursor(-step, 0); moved = true; }
        if (pad.menuRight) { moveMapCursor(step, 0); moved = true; }
        if (pad.menuUp) { moveMapCursor(0, -step); moved = true; }
        if (pad.menuDown) { moveMapCursor(0, step); moved = true; }
        if (moved) Game.mapMoveAt = now;
      }
      const rx = pad.flightRoll || pad.lookX || 0;
      if (!Game.mapUiMoveAt || now - Game.mapUiMoveAt > 0.22) {
        if (rx < -0.55) { Game.mapFocus = (Game.mapFocus || 0) - 1; updateMapFocus(); Game.mapUiMoveAt = now; }
        else if (rx > 0.55) { Game.mapFocus = (Game.mapFocus || 0) + 1; updateMapFocus(); Game.mapUiMoveAt = now; }
      }
      if (pad.confirm) {
        const btns = mapActionButtons();
        const btn = btns[Game.mapFocus || 0];
        if (btn) runMapAction(btn.dataset.mapAction);
      }
      if (pad.help || pad.spawn) spawnAtWaypoint(mapCursor());
      if (pad.map) toggleFullMap(false);
      return;
    }
    if (pad.help) {
      const settings = $('settings');
      const settingsOpen = settings && !settings.classList.contains('hidden');
      if (pad.spawn && Game.waypoint && !settingsOpen) spawnAtWaypoint();
      else toggleSettings();
    }
    if (pad.map) {
      const settings = $('settings');
      if (settings && !settings.classList.contains('hidden')) toggleSettings(false);
      else toggleFullMap();
    }
  }

  function showAirportDisplays(usedSpawn) {
    (CC.aircraftSpawns || []).forEach(function (s) {
      if (s.model) s.model.visible = !s.stolen && s !== usedSpawn;
    });
  }

  function selectVehicle(key, poseOverride, aircraftSpawn) {
    if (CC.InteriorSystem && CC.InteriorSystem.current) {
      toast('Leave the venue first', 1.8);
      return false;
    }
    if (Game.safeHouse && key !== 'pedestrian') {
      toast('Leave the safe house first', 1.8);
      return false;
    }
    if (Game.ride && key !== 'pedestrian') {
      toast('Finish the ride first', 1.8);
      return false;
    }
    const old = Game.vehicles[Game.activeKey];
    const next = Game.vehicles[key];
    if (!next) return false;
    let pose = { x: old.pos.x, z: old.pos.z, h: old.heading, s: old.speed * 0.7 };
    let usedSpawn = null;
    let fpvLaunch = null;
    // FPV launches from the on-foot pedestrian or car the player is using.
    // The pilot stays behind at these coordinates; the airport pad is unused.
    if (key === 'fpv' && old !== next && !aircraftSpawn) {
      const ground = CC.heightAt(old.pos.x, old.pos.z);
      const altitude = old.isAircraft
        ? Math.max(next.spec.minAltitude || 0.8, old.pos.y - ground)
        : (next.spec.defaultAltitude || 2.2);
      fpvLaunch = {
        key: old.key, x: old.pos.x, z: old.pos.z, h: old.heading,
        s: old.speed * 0.7, altitude: altitude,
        aircraftSpawn: Game.activeAircraftSpawn || null
      };
      if (next.claimPilotPose) next.claimPilotPose(fpvLaunch.x, fpvLaunch.z, fpvLaunch.h, altitude);
      else next.setPose(fpvLaunch.x, fpvLaunch.z, fpvLaunch.h, 0, altitude);
      pose = { x: fpvLaunch.x, z: fpvLaunch.z, h: fpvLaunch.h, s: 0, altitude: altitude };
    } else if (poseOverride) {
      pose = poseOverride;
    } else if (old.isAircraft && key === 'pedestrian') {
      // Stepping out of an aircraft in flight returns you to its airport spot;
      // otherwise step to one side of the landed craft, not through its mesh.
      const airborne = old.pos.y - CC.heightAt(old.pos.x, old.pos.z) > 5;
      const spawn = airborne
        ? (Game.activeAircraftSpawn || CC.aircraftSpawn(old.key, old.spawnIndex || 0))
        : null;
      pose = spawn
        ? { x: spawn.x + 7, z: spawn.z, h: spawn.heading, s: 0 }
        : {
          x: old.pos.x + Math.cos(old.heading) * 7,
          z: old.pos.z - Math.sin(old.heading) * 7,
          h: old.heading,
          s: 0
        };
    } else if ((key === 'boat' && (!old.spec.water || old.isAircraft)) && CC.marinaSpawn) {
      // The boat starts from its marina slip.
      pose = { x: CC.marinaSpawn.x, z: CC.marinaSpawn.z, h: CC.marinaSpawn.heading, s: 0 };
    } else if (old.spec.water && key !== 'boat' && !next.isAircraft && CC.launchSpawn) {
      // Stepping off a boat puts you on the launch ramp.
      pose = { x: CC.launchSpawn.x, z: CC.launchSpawn.z, h: CC.launchSpawn.heading, s: 0 };
    } else if (next.spec && next.spec.jetpack) {
      // Jetpack equips at the player's current location.
      pose = {
        x: old.pos.x, z: old.pos.z, h: old.heading, s: 0,
        altitude: next.spec.defaultAltitude || 2.2
      };
    } else if (next.isAircraft) {
      const matches = (CC.aircraftSpawns || []).filter(function (s) { return s.key === key; });
      usedSpawn = aircraftSpawn || (matches.length
        ? matches[next.spawnIndex % matches.length]
        : CC.aircraftSpawn(key, 0));
      const idx = (CC.aircraftSpawns || []).indexOf(usedSpawn);
      if (idx >= 0) next.spawnIndex = idx;
      pose = {
        x: usedSpawn.x, z: usedSpawn.z, h: usedSpawn.heading, s: 0,
        altitude: usedSpawn.altitude
      };
    }
    // A stolen car stays where the player abandons it instead of vanishing.
    if (Game.activeStolenCar && old === Game.vehicles[Game.activeStolenCar.kind] &&
        key !== Game.activeKey && CC.NPCSystem && CC.NPCSystem.releaseStolenCar) {
      CC.NPCSystem.releaseStolenCar({ x: old.pos.x, z: old.pos.z, h: old.heading });
      Game.activeStolenCar = null;
    }
    // The pilot vehicle/pedestrian remains visible at the launch point; FPV is
    // a remote drone, not a body swap into the quad.
    if (!fpvLaunch) old.setVisible(false);
    Game.resetCameraLook();
    if (next.isAircraft && pose.altitude != null) {
      next.setPose(pose.x, pose.z, pose.h, pose.s, pose.altitude);
    } else {
      next.setPose(pose.x, pose.z, pose.h, pose.s);
    }
    next.setVisible(true);
    // Entering a ground vehicle always returns to the chase view, so the car
    // or pedestrian stays on screen instead of vanishing behind a hood cam.
    if (!next.isAircraft && old !== next && key !== 'pedestrian') Game.camMode = 0;
    Game.activeKey = key;
    Game.activeAircraftSpawn = next.isAircraft ? usedSpawn : null;
    showAirportDisplays(Game.activeAircraftSpawn);
    if (next.isFpv && old !== next) {
      Game.fpvPilot = fpvLaunch || Game.fpvPilot;
      next.newSortie();
      next.beginSpawnFlash();
      setFpvMode(true, next);
      Game.fpvMessage('FPV LAUNCHED FROM PILOT — ' + next.name, 2.8);
    } else {
      if (old && old.isFpv) {
        old.spawnFlash = 0;
        old.setVisible(false);
      }
      if (!fpvLaunch) Game.fpvPilot = null;
      setFpvMode(false, null);
    }
    // Keep the last *land* vehicle remembered so E returns to it after a trip.
    if (key !== 'pedestrian' && key !== 'boat' && !next.isAircraft) Game.lastVehicle = key;
    Audio.setVehicle(next.spec);
    toast(cleanVehicleToast(next.spec.label + ' — ' + next.spec.desc), 2.4);
    updateVehicleHud();
    return true;
  }

  function respawnPedestrian(spawn, title, kind, detail) {
    if (!spawn || !Game.vehicles.pedestrian) return;
    if (Game.ride) finishAmusementRide(Game.vehicles.pedestrian);
    selectVehicle('pedestrian', { x: spawn.x, z: spawn.z, h: spawn.heading, s: 0 });
    if (CC.NPCSystem && CC.NPCSystem.clearWanted) CC.NPCSystem.clearWanted();
    bigMessage(title, kind, 3.4);
    toast(detail, 4.2);
  }

  Game.busted = function () {
    // Final safety rail: booking can never yank someone out of a moving car.
    const active = Game.vehicles[Game.activeKey];
    if (active && !active.isPedestrian) return;
    respawnPedestrian(CC.policeSpawn, 'Busted', 'busted',
      'Busted — the cops caught you on foot and booked you outside the station.');
  };

  // Only a vehicle that actually catches fire and explodes may call this.
  // Ordinary crash damage just smokes, slows and eventually immobilizes it.
  Game.wasted = function (reason) {
    // Ordinary crashes only damage the car. Only an actual fire that reaches
    // the explosion sends the driver to the hospital.
    if (!/explosion/i.test(String(reason || ''))) return;
    respawnPedestrian(CC.hospitalSpawn, 'Wasted', 'wasted',
      'Wasted — your car caught fire and exploded. The medics patched you up at Coastal General.');
  };

  Game.selectVehicle = selectVehicle;
  Game.setPedestrianSkin = setPedestrianSkin;
  Game.exitFpv = exitFpv;

  Game.horn = function () {
    if (!Game.started) return;
    Audio.init();
    const v = Game.vehicles[Game.activeKey];
    if (!v) return;
    if (v.isPedestrian) {
      if (v.downloaded && v.downloaded.trigger) v.downloaded.trigger('Attack');
      if (CC.CrimeSystem && CC.CrimeSystem.attack(v.pos)) return;
    }
    Audio.honk(1);
    if (v.isPedestrian || v.isAircraft || (v.spec && v.spec.water)) return;
    if (Game.privateMoment) return;
    const npc = CC.NPCSystem;
    if (npc.companion) {
      if (npc.companionReady(v.pos)) {
        Game.privateMoment = { timer: 4.5, duration: 4.5 };
        const fade = $('privateFade');
        if (fade) fade.classList.add('show');
        toast('Pulling into a quiet spot…', 2.2);
      } else {
        toast('Too public — drive well away from roads, cars and buildings', 3);
      }
      return;
    }
    if (!npc.tryPickupEscort(v)) {
      toast('No one nearby to pick up — try outside a bar or in a neighborhood', 3);
    }
  };

  function updatePrivateMoment(dt, v) {
    if (!Game.privateMoment) return;
    const npc = CC.NPCSystem;
    if (!npc.companion) {
      Game.privateMoment = null;
      const fade = $('privateFade');
      if (fade) fade.classList.remove('show');
      return;
    }
    Game.privateMoment.timer -= dt;
    if (Game.privateMoment.timer > 0) return;
    npc.completePrivateMoment(v.pos, v.heading);
    Game.privateMoment = null;
    const fade = $('privateFade');
    if (fade) fade.classList.remove('show');
    bigMessage('Private moment', 'private', 2.8);
  }

  Game.bulletHit = function () {
    if (Game.hitMessageCooldown > 0) return;
    Game.hitMessageCooldown = 1.2;
    toast('Police gunfire!', 1.1);
  };

  function updateVehicleHud() {
    const v = Game.vehicles[Game.activeKey];
    $('vehicleName').textContent = v.spec.label;
    $('vehicleDesc').textContent = v.spec.desc;
    document.querySelectorAll('.vehBtn:not(.skinBtn)').forEach(function (b) {
      b.classList.toggle('active', b.dataset.key === Game.activeKey);
    });
    document.querySelectorAll('.skinBtn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.skin === (Game.pedSkin || 'default'));
    });
  }

  // Swapping the on-foot body keeps activeKey === 'pedestrian', so every
  // existing on-foot rule (rescue, safe houses, crimes, swimming) still works.
  function setPedestrianSkin(key) {
    const wanted = key && key !== 'default' ? key : 'default';
    Game.pedSkin = wanted;
    const ped = Game.vehicles && Game.vehicles.pedestrian;
    if (!ped || !ped.setSkin) return Promise.resolve(null);
    return ped.setSkin(wanted).then(function (rig) {
      updateVehicleHud();
      if (wanted === 'default') toast('On foot: classic pedestrian', 2);
      else if (rig) toast('On foot: ' + (CC.DownloadedCharacterLoader.label(wanted) || wanted), 2.2);
      else toast('That character could not be loaded', 2.4);
      return rig;
    });
  }

  /* ---------- scene ---------- */
  function initScene() {
    const mark = function (name) {
      CC.bootStage = name;
      document.documentElement.setAttribute('data-boot-stage', name);
    };
    mark('scene/renderer');
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    // Retina screens can quadruple the fill cost for very little visual gain
    // in this flat-shaded world. 1.25 keeps the image crisp without the stall.
    // Adaptive resolution can lower this at runtime if frames get expensive.
    const basePixelRatio = Math.min(window.devicePixelRatio || 1, 1.25);
    Game.basePixelRatio = basePixelRatio;
    renderer.setPixelRatio(basePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    // Real shadow maps are intentionally off: the world uses cheap baked blob
    // shadows. Keeping this explicit avoids a 2048² shadow pass over 16k casters.
    renderer.shadowMap.enabled = false;
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
    sun.castShadow = false;
    scene.add(sun);
    scene.add(sun.target);
    Game.sun = sun;
    Game.hemi = hemi;
    mark('scene/lighting');
    CC.Weather.init(scene, sun, hemi);
    CC.EnvironmentManager.init(scene, renderer);
    CC.LightingSystem.init(scene, { sun: sun, hemi: hemi, renderer: renderer });

    const camera = new THREE.PerspectiveCamera(66, window.innerWidth / window.innerHeight, 0.1, 950);
    Game.camera = camera;

    mark('scene/world');
    if (CC.Drawbridges) CC.Drawbridges.init();
    CC.World.init(scene);
    mark('scene/environment');
    CC.EnvironmentManager.build();
    mark('scene/batching');
    CC.StaticBatcher.run(scene);

    // Spawn on the main road (the longest one on a traced picture map).
    // Standalone blank maps have no roads, so fall back to the map centre.
    const road = CC.roadDefs[0];
    let sx = (C.WORLD.minX + C.WORLD.maxX) * 0.5;
    let sz = (C.WORLD.minZ + C.WORLD.maxZ) * 0.5;
    let heading = 0;
    if (road && road._length > 4) {
      const start = CC.sampleRoad(road, Math.min(52, road._length * 0.25));
      sx = start.x + start.dz * 3.0;
      sz = start.z - start.dx * 3.0;
      heading = Math.atan2(start.dx, start.dz);
    }

    mark('scene/vehicles');
    CC.vehicleOrder.forEach(function (key, i) {
      let v;
      if (key === 'pedestrian') v = new CC.PlayerPed(key, scene);
      else if (CC.vehicleSpecs[key].fpv) v = new CC.FpvDrone(key, scene);
      else if (CC.vehicleSpecs[key].flying) v = new CC.FlyingVehicle(key, scene);
      else v = new CC.Vehicle(key, scene);
      if (key === 'pedestrian') {
        v.setPose(-285, -259, heading, 0);
      } else if (key === 'coupe') {
        const nr = CC.nearestRoad(-106, -35);
        const ch = nr ? Math.atan2(nr.dx, nr.dz) + Math.PI : heading;
        v.setPose(-106, -35, ch, 0);
      } else if (key === 'boat' && CC.marinaSpawn) {
        v.setPose(CC.marinaSpawn.x, CC.marinaSpawn.z, CC.marinaSpawn.heading, 0);
      } else if (v.isAircraft) {
        const spawn = CC.aircraftSpawn(key, 0);
        v.spawnIndex = (CC.aircraftSpawns || []).indexOf(spawn);
        v.setPose(spawn.x, spawn.z, spawn.heading, 0, spawn.altitude);
      } else {
        v.setPose(sx + i * 0.1, sz + i * 0.1, heading, 0);
      }
      Game.vehicles[key] = v;
    });
    Game.vehicles[Game.activeKey].setVisible(true);
    Audio.setVehicle(Game.vehicles[Game.activeKey].spec);
    // Cull far static batches before the one splash render. The gameplay loop
    // widens the radius again once START is pressed.
    if (CC.StaticBatcher && CC.StaticBatcher.update) {
      CC.StaticBatcher.update(Game.vehicles[Game.activeKey].pos, 1, 420);
    }

    mark('scene/npcs');
    CC.NPCSystem.init(scene);
    if (CC.AnimalSystem) CC.AnimalSystem.init(scene);
    if (CC.FishSystem) CC.FishSystem.init(scene);
    if (CC.UFOSystem) CC.UFOSystem.init(scene);
    if (CC.TeenGangSystem) CC.TeenGangSystem.init(scene);
    mark('scene/interior');
    CC.InteriorSystem.init();
    mark('scene/crime');
    CC.CrimeSystem.init();
    if (CC.DeliverySystem) CC.DeliverySystem.init(scene);
    mark('scene/done');

    window.addEventListener('resize', function () {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      if (Game.invalidateSplashFrame) Game.invalidateSplashFrame();
    });
  }

  /* ---------- camera ---------- */
  // The follow camera runs every frame; reusing these two vectors avoids two
  // THREE.Vector3 allocations (and their GC pressure) per frame.
  const camDesired = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  const camEuler = new THREE.Euler(0, 0, 0, 'YXZ');

  function updateCamera(dt, v, pad, snap) {
    const f = v.forward();
    const speed = Math.abs(v.speed);
    const ped = !!v.isPedestrian;
    const flying = !!v.isAircraft;
    if (v.isFpv && Game.activeKey === v.key) {
      // Forward windshield-style view with the telemetry overlay on top. The
      // camera sits just ahead of the quad and looks along its heading, with a
      // little nose pitch but no camera roll; drone roll lives on the HUD ball.
      const ahead = 0.9;
      camDesired.set(v.pos.x + f.x * ahead, v.pos.y + 0.28, v.pos.z + f.z * ahead);
      camLook.set(v.pos.x + f.x * 38,
        v.pos.y + 0.2 - (v.pitch || 0) * 14,
        v.pos.z + f.z * 38);
      Game.camera.position.lerp(camDesired, snap ? 1 : 1 - Math.exp(-14 * dt));
      Game.camTarget.lerp(camLook, snap ? 1 : 1 - Math.exp(-10 * dt));
      Game.camera.lookAt(Game.camTarget);
      const fov = U.clamp(66 + Math.abs(v.speed) * 0.16, 66, 82);
      if (Math.abs(Game.camera.fov - fov) > 0.05) {
        Game.camera.fov = fov;
        Game.camera.updateProjectionMatrix();
      }
      return;
    }
    // Right stick = free look on foot and in ground vehicles. Aircraft use it
    // for roll/pitch instead, so their look offsets ease back to centre.
    const gp = pad || {};
    const lookX = flying ? 0 : (gp.lookX || 0);
    const lookY = flying ? 0 : (gp.lookY || 0);
    if (Math.abs(lookX) > 0.02) {
      Game.lookYaw = U.clamp(Game.lookYaw + lookX * Game.lookSensitivity * dt,
        -Game.lookMaxYaw, Game.lookMaxYaw);
    } else {
      Game.lookYaw = U.damp(Game.lookYaw, 0, 2.4, dt);
    }
    if (Math.abs(lookY) > 0.02) {
      Game.lookPitch = U.clamp(Game.lookPitch - lookY * Game.lookSensitivity * 0.8 * dt,
        -Game.lookMaxPitch, Game.lookMaxPitch);
    } else {
      Game.lookPitch = U.damp(Game.lookPitch, 0, 2.4, dt);
    }
    const desired = camDesired, look = camLook;
    if (flying) {
      if (Game.camMode === 0) {
        const back = 18 + speed * 0.08;
        const up = 7.5 + speed * 0.02;
        desired.set(v.pos.x - f.x * back, v.pos.y + up, v.pos.z - f.z * back);
        look.set(v.pos.x + f.x * 18, v.pos.y + 2, v.pos.z + f.z * 18);
      } else if (Game.camMode === 1) {
        desired.set(v.pos.x + f.x * 2.2, v.pos.y + 1.6, v.pos.z + f.z * 2.2);
        look.set(v.pos.x + f.x * 45, v.pos.y + 1.2, v.pos.z + f.z * 45);
      } else {
        const a = Game.time * 0.22;
        desired.set(v.pos.x + Math.sin(a) * 28, v.pos.y + 10, v.pos.z + Math.cos(a) * 28);
        look.set(v.pos.x, v.pos.y + 1, v.pos.z);
      }
    } else if (Game.camMode === 0) {
      // Keep the chase camera close and responsive: a long, lagging trailer
      // makes the vehicle drift out of frame and read like a windshield view.
      const back = ped ? 4.8 : 9.5 + speed * 0.05;
      const up = ped ? 2.5 : 4.8 + speed * 0.008;
      desired.set(v.pos.x - f.x * back, v.pos.y + up, v.pos.z - f.z * back);
      look.set(v.pos.x + f.x * (ped ? 3.2 : 5.5), v.pos.y + (ped ? 1.45 : 1.55),
        v.pos.z + f.z * (ped ? 3.2 : 5.5));
    } else if (Game.camMode === 1) {
      const ahead = ped ? 0.6 : 1.25;
      desired.set(v.pos.x + f.x * ahead, v.pos.y + (ped ? 1.62 : 1.35), v.pos.z + f.z * ahead);
      look.set(v.pos.x + f.x * (ped ? 18 : 35), v.pos.y + (ped ? 1.55 : 1.5), v.pos.z + f.z * (ped ? 18 : 35));
    } else {
      const a = Game.time * 0.32;
      const r = ped ? 8 : 15 + speed * 0.05;
      desired.set(v.pos.x + Math.sin(a) * r, v.pos.y + (ped ? 3.4 : 6.8), v.pos.z + Math.cos(a) * r);
      look.set(v.pos.x, v.pos.y + (ped ? 1.3 : 1.2), v.pos.z);
    }
    const camLambda = flying ? (Game.camMode === 1 ? 10 : 4.5) : (Game.camMode === 1 ? 14 : 11);
    const lerp = snap ? 1 : 1 - Math.exp(-camLambda * dt);
    Game.camera.position.lerp(desired, lerp);
    // Rotate the focus point around the camera, not the vehicle: the stick
    // sweeps the view left/right and tilts it up/down without steering.
    if (Math.abs(Game.lookYaw) > 0.001 || Math.abs(Game.lookPitch) > 0.001) {
      const dx = look.x - Game.camera.position.x;
      const dz = look.z - Game.camera.position.z;
      const dy = look.y - Game.camera.position.y;
      const horizontal = Math.hypot(dx, dz) || 1;
      const c = Math.cos(Game.lookYaw), s = Math.sin(Game.lookYaw);
      look.x = Game.camera.position.x + dx * c + dz * s;
      look.z = Game.camera.position.z - dx * s + dz * c;
      look.y = Game.camera.position.y + dy + Game.lookPitch * Math.max(10, horizontal);
    }
    Game.camTarget.lerp(look, snap ? 1 : 1 - Math.exp(-8 * dt));
    Game.camera.lookAt(Game.camTarget);
    const fov = flying ? U.clamp(66 + speed * 0.16, 66, 82)
      : ped ? U.clamp(62 + speed * 0.6 + (v.sprinting ? 3 : 0), 62, 76)
        : U.clamp(64 + speed * 0.22, 64, 80);
    if (snap) {
      if (Math.abs(Game.camera.fov - fov) > 0.05) Game.camera.fov = fov;
      Game.camera.updateProjectionMatrix();
    } else if (Math.abs(Game.camera.fov - fov) > 0.05) {
      Game.camera.fov = U.damp(Game.camera.fov, fov, 4, dt);
      Game.camera.updateProjectionMatrix();
    }
  }

  /* ---------- FPV kamikaze collision + interception ---------- */
  // Every confirmed drone, aircraft or hostile UFO intercepted by an FPV pilot
  // pays a flat bounty through the same cash HUD used by robberies and deliveries.
  const FPV_KILL_BONUS = 5000;
  function fpvPayKill() {
    if (CC.CrimeSystem && CC.CrimeSystem.addMoney) CC.CrimeSystem.addMoney(FPV_KILL_BONUS);
  }

  function fpvEntityPos(e) {
    if (!e) return null;
    if (e.pos && typeof e.pos.x === 'number') return e.pos;
    if (e.position && typeof e.position.x === 'number') return e.position;
    if (e.group && e.group.position) return e.group.position;
    return null;
  }

  function fpvEntityRadius(e) {
    if (!e) return 2;
    if (e.spec && typeof e.spec.radius === 'number') return e.spec.radius;
    // NPC aircraft/birds use `radius` for their circular flight path, not
    // their physical size, so use a compact hit box for those entities.
    if (e.kind === 'plane') return 5;
    if (e.kind === 'helicopter' || e.index != null && e.visual) return 4;
    if (e.kind === 'gull' || e.kind === 'song') return 1.4;
    if (typeof e.radius === 'number' && e.radius <= 12) return e.radius;
    return 2;
  }

  // Distance in XZ from a point to the drone's movement this frame. Returning
  // the segment hit ratio also gives us the interpolated altitude at impact.
  const fpvSweepScratch = { dist: 0, t: 0, x: 0, z: 0, dx: 0, dz: 0 };
  function fpvSweep(v, x, z, radius) {
    const hit = U.distanceToSegment(x, z, v.prevPos.x, v.prevPos.z, v.pos.x, v.pos.z, fpvSweepScratch);
    return hit.dist <= radius ? hit : null;
  }

  function fpvSweepEntity(v, e, radius) {
    const p = fpvEntityPos(e);
    if (!p) return false;
    const hit = fpvSweep(v, p.x, p.z, radius);
    if (!hit) return false;
    const y = U.lerp(v.prevPos.y, v.pos.y, hit.t);
    return Math.abs(y - p.y) <= radius + 1.4;
  }

  const FPV_GROUND_SAMPLES = [0, 0.5, 1];
  function fpvGroundHit(v) {
    const r = (v.radius || 1.1) * 0.7;
    for (let s = 0; s < FPV_GROUND_SAMPLES.length; s++) {
      const t = FPV_GROUND_SAMPLES[s];
      const x = U.lerp(v.prevPos.x, v.pos.x, t);
      const z = U.lerp(v.prevPos.z, v.pos.z, t);
      const y = U.lerp(v.prevPos.y, v.pos.y, t);
      if (y - CC.heightAt(x, z) <= r) return true;
    }
    return false;
  }

  function fpvWorldHit(v, world) {
    const r = v.radius || 1.1;
    const agl = v.pos.y - CC.heightAt(v.pos.x, v.pos.z);
    const buildings = (world && world.imageBuildings) || CC.World.imageBuildings || [];
    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i];
      if (!b) continue;
      // Cheap XZ reject before the segment sweep; buildings can number in the
      // hundreds and this runs every frame at low altitude.
      if (Math.abs(b.x - v.pos.x) > 70 || Math.abs(b.z - v.pos.z) > 70) continue;
      const hit = fpvSweep(v, b.x, b.z, Math.max(b.w || 0, b.l || 0) * 0.72 + r);
      if (!hit) continue;
      const y = U.lerp(v.prevPos.y, v.pos.y, hit.t);
      const rot = b.rot || 0, cos = Math.cos(rot), sin = Math.sin(rot);
      const dx = hit.x - b.x, dz = hit.z - b.z;
      const lx = dx * cos - dz * sin, lz = dx * sin + dz * cos;
      if (Math.abs(lx) <= (b.w || 0) * 0.5 + r &&
          Math.abs(lz) <= (b.l || 0) * 0.5 + r &&
          y <= CC.heightAt(b.x, b.z) + (b.h || 10) + r) return true;
    }

    const obstacles = (world && world.obstacles) || [];
    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i];
      if (!o || Math.abs(o.x - v.pos.x) > 40 || Math.abs(o.z - v.pos.z) > 40) continue;
      const height = o.type === 'tree' ? 12 :
        o.type === 'home' || o.type === 'landmark' ? 10 : 3;
      const hit = fpvSweep(v, o.x, o.z, (o.r || 1) + r);
      if (!hit) continue;
      const y = U.lerp(v.prevPos.y, v.pos.y, hit.t);
      if (y <= CC.heightAt(o.x, o.z) + height + r) return true;
    }

    if (agl < 6) {
      const props = (world && world.destructibles) || [];
      for (let i = 0; i < props.length; i++) {
        const p = props[i];
        if (!p || !p.alive || Math.abs(p.x - v.pos.x) > 25 || Math.abs(p.z - v.pos.z) > 25) continue;
        fpvPropEntity.pos.set(p.x, CC.heightAt(p.x, p.z) + 1, p.z);
        if (fpvSweepEntity(v, fpvPropEntity, (p.r || 0.7) + r)) return true;
      }
    }
    return false;
  }
  const fpvPropEntity = { pos: new THREE.Vector3() };

  const FPV_AIR_GROUPS = ['birds', 'aircraft', 'policeHelicopters'];
  const FPV_GROUND_GROUPS = [
    'traffic', 'parkedCars', 'policeCars', 'buses', 'gangCars',
    'pedestrians', 'soldiers', 'ducks', 'watercraft'
  ];
  function fpvNpcHit(v, agl) {
    const N = CC.NPCSystem;
    if (!N) return null;
    const drones = N.drones || [];
    for (let i = 0; i < drones.length; i++) {
      const d = drones[i];
      if (!d || d.disabled || d.state === 'crashed' || !d.pos) continue;
      if (fpvSweepEntity(v, d, 4.2 + (v.radius || 1.1))) return { type: 'shahed', entity: d };
    }
    const ufos = CC.UFOSystem && CC.UFOSystem.ufos;
    if (ufos) for (let i = 0; i < ufos.length; i++) {
      const u = ufos[i];
      if (!u || u.disabled || u.state !== 'cruise' || !u.group || !u.group.visible || !u.pos) continue;
      if (fpvSweepEntity(v, u, fpvEntityRadius(u) + (v.radius || 1.1) + 0.4)) {
        return { type: 'ufo', entity: u };
      }
    }
    // Ground crowds only matter near the deck; birds, aircraft and missiles
    // are still checked up at Shahed-hunting altitude.
    for (let g = 0; g < FPV_AIR_GROUPS.length; g++) {
      const list = N[FPV_AIR_GROUPS[g]];
      if (!list) continue;
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (!e || e === v || e.disabled) continue;
        if (fpvSweepEntity(v, e, fpvEntityRadius(e) + (v.radius || 1.1) + 0.4)) {
          return { type: 'npc', entity: e };
        }
      }
    }
    const missiles = N.airDefense && N.airDefense.missiles;
    if (missiles) for (let i = 0; i < missiles.length; i++) {
      const m = missiles[i];
      if (m && !m.disabled && m.life > 0 &&
          fpvSweepEntity(v, m, fpvEntityRadius(m) + (v.radius || 1.1) + 0.4)) {
        return { type: 'npc', entity: m };
      }
    }
    if (agl < 12) for (let g = 0; g < FPV_GROUND_GROUPS.length; g++) {
      const key = FPV_GROUND_GROUPS[g];
      const list = N[key];
      if (!list) continue;
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (!e || e === v || e.disabled) continue;
        if (fpvSweepEntity(v, e, fpvEntityRadius(e) + (v.radius || 1.1) + 0.4)) {
          return { type: 'npc', entity: e };
        }
      }
    }
    return null;
  }

  function fpvPlayerHit(v, agl) {
    const all = Game.vehicles || {};
    const pilotKey = Game.fpvPilot && Game.fpvPilot.key;
    for (const key in all) {
      const other = all[key];
      if (!other || other === v || !other.group || !other.group.visible) continue;
      // The parked pedestrian/car is the remote pilot and shares the launch
      // coordinates. It must never count as an impact target on launch.
      if (key === pilotKey) continue;
      if (agl >= 20 && !other.isAircraft) continue;
      if (fpvSweepEntity(v, other, fpvEntityRadius(other) + (v.radius || 1.1) + 0.4)) return true;
    }
    return false;
  }

  // Remove an intercepted NPC from the world. Shahed drones and UFOs have their
  // own state machines; aircraft, birds, helicopters and missiles are disabled
  // and hidden so their update loops leave the wreck alone.
  function fpvDestroyEntity(e) {
    if (!e || e.disabled) return false;
    if (typeof e.shootDown === 'function') {
      return e.shootDown({ silentExplosion: true, silentMessage: true });
    }
    if (typeof e.vanish === 'function') {
      e.vanish();
      return true;
    }
    e.disabled = true;
    if (e.group) e.group.visible = false;
    if (e.mesh) e.mesh.visible = false;
    if (e.trail) e.trail.visible = false;
    if (e.active != null) e.active = false;
    if (e.life != null) e.life = 0;
    return true;
  }

  function updateFpvCombat(v, world) {
    if (!v || !v.isFpv || v.state === 'destroyed') return;
    // Give the brief launch/respawn animation a moment before impacts count.
    if (v.spawnFlash > 0) return;
    const agl = v.pos.y - CC.heightAt(v.pos.x, v.pos.z);
    const target = fpvNpcHit(v, agl);
    if (target && target.type === 'ufo') {
      fpvDestroyEntity(target.entity);
      v.kills++;
      fpvPayKill();
      v.explode(world, 'KAMIKAZE STRIKE — UFO DESTROYED', { kamikaze: true });
      Game.fpvMessage('UFO DESTROYED — +$5,000 — ' + v.kills +
        (v.kills === 1 ? ' KILL' : ' KILLS'), 3.4);
      return;
    }
    if (target && target.type === 'shahed') {
      fpvDestroyEntity(target.entity);
      v.kills++;
      fpvPayKill();
      v.explode(world, 'KAMIKAZE STRIKE — SHAHED DESTROYED', { kamikaze: true });
      Game.fpvMessage('SHAHED-136 INTERCEPTED — +$5,000 — ' + v.kills +
        (v.kills === 1 ? ' KILL' : ' KILLS'), 3.2);
      return;
    }
    if (target) {
      const label = String(target.entity.kind || target.entity.type || 'AIR TARGET').toUpperCase();
      fpvDestroyEntity(target.entity);
      v.kills++;
      fpvPayKill();
      v.explode(world, 'KAMIKAZE STRIKE — ' + label + ' DESTROYED', { kamikaze: true });
      Game.fpvMessage(label + ' INTERCEPTED — +$5,000 — ' + v.kills +
        (v.kills === 1 ? ' KILL' : ' KILLS'), 3.2);
      return;
    }
    if (fpvGroundHit(v) ||
        (agl < 34 && fpvWorldHit(v, world)) ||
        fpvPlayerHit(v, agl)) {
      v.explode(world, 'IMPACT — ' + (v.name || 'FPV'), { kamikaze: true });
    }
  }

  /* ---------- challenges ---------- */
  // Gates are created once at startup. Index them lazily by challenge object
  // so lookups do not rescan the full gate list several times per frame.
  const gateLookup = new Map();
  let highlightedGate = null;
  function gateFor(ch, index) {
    let byIndex = gateLookup.get(ch);
    if (!byIndex) {
      byIndex = new Map();
      const gates = CC.World.challengeGates || [];
      for (let i = 0; i < gates.length; i++) {
        const g = gates[i];
        if (g.challenge === ch && !byIndex.has(g.index)) byIndex.set(g.index, g);
      }
      gateLookup.set(ch, byIndex);
    }
    return byIndex.get(index) || null;
  }

  function updateChallenges(dt, v) {
    if (Game.freeRoam) return;
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
    // Only the outgoing and incoming gate need scale changes; previously this
    // wrote to every gate in the world on every frame.
    const nextGate = Game.activeChallenge ? gateFor(Game.activeChallenge, Game.gateIndex) : null;
    if (highlightedGate && highlightedGate !== nextGate) highlightedGate.group.scale.setScalar(1);
    if (nextGate) nextGate.group.scale.setScalar(1.14 + Math.sin(Game.time * 5) * 0.05);
    highlightedGate = nextGate;
    Game.challengeHudTimer = (Game.challengeHudTimer || 0) - dt;
    if (Game.challengeHudTimer <= 0) {
      Game.challengeHudTimer = 0.1;
      updateChallengeHud(v);
    }
  }

  const challengeColors = (CC.challengeDefs || []).map(function (ch) {
    return new THREE.Color(ch.color).getHexString();
  });
  function updateChallengeHud(v) { /* street racing/challenge UI removed */ }

  /* ---------- HUD canvases ---------- */
  function drawGauge(v) {
    const c = $('gauge'), g = c.getContext('2d');
    const w = c.width, h = c.height, cx = w / 2, cy = h / 2 + 8, r = 56;
    g.clearRect(0, 0, w, h);
    const a0 = Math.PI * 0.78, a1 = Math.PI * 2.22;
    g.lineWidth = 9; g.lineCap = 'round';
    g.strokeStyle = 'rgba(255,255,255,0.16)';
    g.beginPath(); g.arc(cx, cy, r, a0, a1); g.stroke();
    const topSpeed = v.spec.maxSpeed * (v.isPedestrian ? (v.spec.boost || 1) : 1);
    const max = topSpeed * 2.237;
    const frac = U.clamp(Math.abs(v.speed) * 2.237 / max, 0, 1);
    const gradKey = w + 'x' + h;
    if (!c._ccGaugeGradient || c._ccGaugeKey !== gradKey) {
      const grad = g.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, '#62e0ff'); grad.addColorStop(0.6, '#ffd166'); grad.addColorStop(1, '#ff6b6b');
      c._ccGaugeGradient = grad;
      c._ccGaugeKey = gradKey;
    }
    g.strokeStyle = c._ccGaugeGradient;
    g.beginPath(); g.arc(cx, cy, r, a0, a0 + (a1 - a0) * frac); g.stroke();
    const a = a0 + (a1 - a0) * frac;
    g.strokeStyle = '#fff'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * (r - 12), cy + Math.sin(a) * (r - 12)); g.stroke();
    g.fillStyle = '#fff'; g.font = 'bold 25px Arial'; g.textAlign = 'center';
    g.fillText(Math.round(Math.abs(v.speed) * 2.237), cx, cy + 4);
    g.font = '10px Arial'; g.fillStyle = 'rgba(255,255,255,0.7)';
    g.fillText('MPH', cx, cy + 20);
    if (v.isPedestrian) {
      const stamina = U.clamp(v.stamina == null ? 1 : v.stamina, 0, 1);
      const bx = cx - 46, by = h - 15, bw = 92;
      g.fillStyle = 'rgba(3,12,17,0.72)';
      g.fillRect(bx - 2, by - 2, bw + 4, 10);
      g.fillStyle = v.exhausted ? '#ff6b6b' : v.sprinting ? '#ffd166' : '#7dffd0';
      g.fillRect(bx, by, bw * stamina, 6);
      g.font = '9px Arial'; g.fillStyle = 'rgba(255,255,255,0.75)';
      g.fillText(v.exhausted ? 'CATCH YOUR BREATH' : 'SPRINT', cx, by - 6);
    }
  }

  function drawFpvHud(v) {
    const c = $('fpvHud');
    const overlay = $('fpvOverlay');
    if (!c || !overlay || overlay.classList.contains('hidden')) return;
    const g = c.getContext('2d');
    if (!g) return;
    const w = c.width, h = c.height, cx = w / 2, cy = h / 2;
    g.clearRect(0, 0, w, h);

    // Artificial horizon. High-contrast blue/brown ball, numbered pitch ladder
    // and a roll scale — all driven live by the drone's pitch and roll.
    const pitch = U.clamp(v.pitch || 0, -1.4, 1.4);
    const roll = U.clamp(v.roll || 0, -1.4, 1.4);
    const horizonY = -pitch * h * 0.36;
    const far = Math.max(w, h) * 1.6;
    g.save();
    g.translate(cx, cy);
    g.rotate(-roll);
    g.beginPath(); g.rect(-far, -far, far * 2, far * 2); g.clip();

    const sky = g.createLinearGradient(0, -h * 0.7, 0, horizonY);
    sky.addColorStop(0, 'rgba(18, 86, 140, 0.88)');
    sky.addColorStop(1, 'rgba(78, 178, 220, 0.66)');
    g.fillStyle = sky;
    g.fillRect(-far, -far, far * 2, horizonY + far);
    const ground = g.createLinearGradient(0, horizonY, 0, h * 0.7);
    ground.addColorStop(0, 'rgba(140, 96, 42, 0.84)');
    ground.addColorStop(1, 'rgba(58, 38, 16, 0.92)');
    g.fillStyle = ground;
    g.fillRect(-far, horizonY, far * 2, far * 2);

    g.strokeStyle = 'rgba(232, 255, 244, 0.98)';
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(-far, horizonY); g.lineTo(far, horizonY); g.stroke();

    g.font = 'bold 15px Arial';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let deg = -60; deg <= 60; deg += 10) {
      if (!deg) continue;
      const y = horizonY - (deg * Math.PI / 180) * (h * 0.66);
      if (Math.abs(y) > h * 0.78) continue;
      const half = deg % 20 === 0 ? 92 : 52;
      g.strokeStyle = 'rgba(232, 255, 244, 0.78)';
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(-half, y); g.lineTo(half, y); g.stroke();
      const label = Math.abs(deg) + '';
      g.lineWidth = 3.5; g.strokeStyle = 'rgba(3, 12, 17, 0.92)';
      g.strokeText(label, -half - 28, y); g.strokeText(label, half + 28, y);
      g.fillStyle = 'rgba(238, 255, 246, 0.95)';
      g.fillText(label, -half - 28, y); g.fillText(label, half + 28, y);
    }
    // Roll scale rides with the ball; the fixed pointer below reads against it.
    g.strokeStyle = 'rgba(232, 255, 244, 0.62)'; g.lineWidth = 2;
    g.beginPath(); g.arc(0, 0, h * 0.3, -Math.PI * 0.78, -Math.PI * 0.22); g.stroke();
    g.restore();

    // Fixed aircraft symbol and roll pointer never rotate with the horizon.
    g.save();
    g.translate(cx, cy);
    g.strokeStyle = '#ffd166'; g.lineWidth = 4; g.lineCap = 'round';
    g.beginPath();
    g.moveTo(-58, 0); g.lineTo(-18, 0);
    g.moveTo(18, 0); g.lineTo(58, 0);
    g.moveTo(0, -12); g.lineTo(0, 12);
    g.stroke();
    g.fillStyle = '#ffd166';
    g.beginPath();
    g.moveTo(0, -h * 0.3 - 12);
    g.lineTo(-11, -h * 0.3 - 30);
    g.lineTo(11, -h * 0.3 - 30);
    g.closePath(); g.fill();
    g.restore();

    // Fixed crosshairs and center reticle (goggles reticle does not roll).
    g.save();
    g.strokeStyle = 'rgba(175, 255, 212, 0.92)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, cy); g.lineTo(cx - 52, cy);
    g.moveTo(cx + 52, cy); g.lineTo(w, cy);
    g.moveTo(cx, 0); g.lineTo(cx, cy - 52);
    g.moveTo(cx, cy + 52); g.lineTo(cx, h);
    g.stroke();
    g.strokeStyle = '#ffd166';
    g.lineWidth = 2.5;
    g.beginPath(); g.arc(cx, cy, 20, 0, Math.PI * 2); g.stroke();
    g.beginPath();
    g.moveTo(cx - 34, cy); g.lineTo(cx - 24, cy);
    g.moveTo(cx + 24, cy); g.lineTo(cx + 34, cy);
    g.moveTo(cx, cy - 34); g.lineTo(cx, cy - 24);
    g.moveTo(cx, cy + 24); g.lineTo(cx, cy + 34);
    g.stroke();
    g.restore();

    // Fictional but stable map coordinates so the numbers move with the drone.
    const W = C.WORLD;
    const fx = U.clamp((v.pos.x - W.minX) / (W.maxX - W.minX), 0, 1);
    const fz = U.clamp((v.pos.z - W.minZ) / (W.maxZ - W.minZ), 0, 1);
    const lat = 34.09 - fz * 0.07;
    const lon = -118.30 + fx * 0.12;
    const coords = $('fpvCoords');
    if (coords) {
      coords.textContent = 'LAT ' + lat.toFixed(4) + ' N   LON ' + Math.abs(lon).toFixed(4) + ' W';
    }

    const hx = v.home.x - v.pos.x, hz = v.home.z - v.pos.z;
    const homeDist = Math.hypot(hx, hz);
    const bearing = Math.atan2(hx, hz);
    let rel = bearing - v.heading;
    while (rel > Math.PI) rel -= Math.PI * 2;
    while (rel < -Math.PI) rel += Math.PI * 2;
    const arrow = $('fpvHomeArrow');
    if (arrow) arrow.style.transform = 'rotate(' + rel.toFixed(3) + 'rad)';
    const homeLabel = $('fpvHomeLabel');
    if (homeLabel) {
      const deg = Math.round(((bearing * 180 / Math.PI) + 360) % 360);
      homeLabel.textContent = 'HOME ' + String(deg).padStart(3, '0') + '°  ' + Math.round(homeDist) + ' m';
    }

    const agl = Math.max(0, v.pos.y - CC.heightAt(v.pos.x, v.pos.z));
    setText('fpvSats', (v.sats || 12) + ' SAT');
    setText('fpvAlt', agl.toFixed(0) + ' m');
    setText('fpvSpd', Math.round(v.speed * 3.6) + ' km/h');
    setText('fpvName', v.name || 'NIGHT WASP');
    const battery = Math.max(0, Math.ceil(v.battery));
    const secondsLeft = Math.max(0, Math.round((v.battery / 100) * (v.spec.batterySeconds || 900)));
    const mm = Math.floor(secondsLeft / 60);
    const ss = String(secondsLeft % 60).padStart(2, '0');
    const batteryEl = $('fpvBattery');
    if (batteryEl) {
      batteryEl.textContent = battery + '% · ' + mm + ':' + ss;
      batteryEl.style.color = v.powerLoss || battery <= 5 ? '#ff6b6b' :
        battery <= 20 ? '#ffd166' : '';
    }
    const modeEl = $('fpvMode');
    if (modeEl) {
      modeEl.textContent = v.powerLoss ? 'POWER LOSS — LAND OR FIND TARGET' :
        battery <= 20 ? 'LOW BATTERY — RETURN TO PILOT' : 'FLIGHT MODE JETPACK';
      modeEl.style.color = v.powerLoss || battery <= 20 ? '#ff6b6b' : '';
    }
  }

  function roadWeight(type) { return type === 'paved' ? 1 : (type === 'gravel' || type === 'dirt') ? 1.35 : 1.8; }

  // The baked road graph is static after map load, so building it every 0.5 s
  // (and again for each platoon leg) was the main source of periodic hitches.
  const routeCache = {
    segments: null, count: -1, graph: null, nearest: new Map(),
    invalidate() {
      const segs = CC.roadSegments || [];
      if (this.segments === segs && this.count === segs.length) return;
      this.segments = segs; this.count = segs.length;
      this.graph = null; this.nearest.clear();
    }
  };
  const dijkstraScratch = { dist: [], prev: [], used: [] };

  function nearestRoadPoint(x, z) {
    routeCache.invalidate();
    const key = Math.round(x * 2) + ',' + Math.round(z * 2);
    const cached = routeCache.nearest.get(key);
    if (cached) return cached;
    let best = null;
    const segs = CC.roadSegments || [];
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      const r = U.distanceToSegment(x, z, seg.ax, seg.az, seg.bx, seg.bz);
      const cost = r.dist * roadWeight(seg.type);
      if (!best || cost < best.cost) {
        best = { x: r.x, z: r.z, t: r.t, dist: r.dist, seg: seg, cost: cost };
      }
    }
    if (best && routeCache.nearest.size < 4000) routeCache.nearest.set(key, best);
    return best;
  }

  // A tiny road graph makes the GPS route follow streets instead of drawing a
  // straight line through woods and buildings. Shared road endpoints are merged.
  function buildRoadGraph() {
    routeCache.invalidate();
    if (routeCache.graph) return routeCache.graph;
    const nodes = [];
    const mergeDistance = 9;
    function addNode(x, z) {
      for (let i = 0; i < nodes.length; i++) {
        if (U.distance2D(x, z, nodes[i].x, nodes[i].z) < mergeDistance) return i;
      }
      nodes.push({ x: x, z: z, edges: [] });
      return nodes.length - 1;
    }
    function addEdge(a, b, cost) {
      if (a === b || !isFinite(cost)) return;
      nodes[a].edges.push({ to: b, cost: cost });
      nodes[b].edges.push({ to: a, cost: cost });
    }
    const segs = CC.roadSegments || [];
    segs.forEach(function (seg) {
      const a = addNode(seg.ax, seg.az), b = addNode(seg.bx, seg.bz);
      addEdge(a, b, seg.len * roadWeight(seg.type));
    });
    // Link nodes that sit in the middle of another street (T junctions) and
    // short gaps between separate baked fragments.
    nodes.slice().forEach(function (node) {
      let best = null;
      segs.forEach(function (seg) {
        const r = U.distanceToSegment(node.x, node.z, seg.ax, seg.az, seg.bx, seg.bz);
        if (!best || r.dist < best.dist) best = { r: r, seg: seg };
      });
      if (!best || best.r.dist > 10) return;
      const a = addNode(best.seg.ax, best.seg.az), b = addNode(best.seg.bx, best.seg.bz);
      const w = roadWeight(best.seg.type);
      const self = nodes.indexOf(node);
      if (U.distance2D(node.x, node.z, best.seg.ax, best.seg.az) > 2) {
        addEdge(self, a, best.r.t * best.seg.len * w);
      }
      if (U.distance2D(node.x, node.z, best.seg.bx, best.seg.bz) > 2) {
        addEdge(self, b, (1 - best.r.t) * best.seg.len * w);
      }
    });
    // Bridge disconnected baked components over the shortest dry gap.
    const component = new Array(nodes.length).fill(-1);
    let componentCount = 0;
    for (let i = 0; i < nodes.length; i++) {
      if (component[i] >= 0) continue;
      const queue = [i];
      let head = 0;
      component[i] = componentCount;
      while (head < queue.length) {
        const u = queue[head++];
        nodes[u].edges.forEach(function (e) {
          if (component[e.to] < 0) { component[e.to] = componentCount; queue.push(e.to); }
        });
      }
      componentCount++;
    }
    const linked = new Set([0]);
    while (linked.size < componentCount) {
      let bridge = null;
      for (let i = 0; i < nodes.length; i++) {
        if (!linked.has(component[i])) continue;
        for (let j = 0; j < nodes.length; j++) {
          if (linked.has(component[j])) continue;
          const d = U.distance2D(nodes[i].x, nodes[i].z, nodes[j].x, nodes[j].z);
          if (d > 70 || (bridge && d >= bridge.d)) continue;
          let wet = false;
          for (let k = 1; k <= 3; k++) {
            const t = k * 0.25;
            const px = U.lerp(nodes[i].x, nodes[j].x, t);
            const pz = U.lerp(nodes[i].z, nodes[j].z, t);
            if (CC.coast.isWater(px, pz)) { wet = true; break; }
          }
          if (!wet) bridge = { i: i, j: j, d: d };
        }
      }
      if (!bridge) break;
      addEdge(bridge.i, bridge.j, bridge.d * 2.2);
      linked.add(component[bridge.j]);
    }
    routeCache.graph = { nodes: nodes };
    return routeCache.graph;
  }

  function computeRoute(from, to) {
    const direct = { distance: U.distance2D(from.x, from.z, to.x, to.z),
      points: [{ x: from.x, z: from.z }, { x: to.x, z: to.z }] };
    const a = nearestRoadPoint(from.x, from.z), b = nearestRoadPoint(to.x, to.z);
    if (!a || !b) return direct;
    const graph = buildRoadGraph();
    if (!graph.nodes.length) return direct;
    // Clone the small cached graph so temporary start/end nodes never mutate it.
    const nodes = graph.nodes.map(function (node) {
      return { x: node.x, z: node.z, edges: node.edges.slice() };
    });
    function addNode(x, z) {
      for (let i = 0; i < nodes.length; i++) {
        if (U.distance2D(x, z, nodes[i].x, nodes[i].z) < 9) return i;
      }
      nodes.push({ x: x, z: z, edges: [] });
      return nodes.length - 1;
    }
    function addEdge(i, j, cost) {
      if (i === j || !isFinite(cost)) return;
      nodes[i].edges.push({ to: j, cost: cost });
      nodes[j].edges.push({ to: i, cost: cost });
    }
    const start = addNode(a.x, a.z), end = addNode(b.x, b.z);
    const a0 = addNode(a.seg.ax, a.seg.az), a1 = addNode(a.seg.bx, a.seg.bz);
    const b0 = addNode(b.seg.ax, b.seg.az), b1 = addNode(b.seg.bx, b.seg.bz);
    const aw = roadWeight(a.seg.type), bw = roadWeight(b.seg.type);
    addEdge(start, a0, a.seg.len * a.t * aw);
    addEdge(start, a1, a.seg.len * (1 - a.t) * aw);
    addEdge(end, b0, b.seg.len * b.t * bw);
    addEdge(end, b1, b.seg.len * (1 - b.t) * bw);

    const n = nodes.length;
    if (dijkstraScratch.dist.length < n) {
      dijkstraScratch.dist = new Array(n);
      dijkstraScratch.prev = new Array(n);
      dijkstraScratch.used = new Array(n);
    }
    const dist = dijkstraScratch.dist, prev = dijkstraScratch.prev, used = dijkstraScratch.used;
    dist.fill(Infinity, 0, n); prev.fill(-1, 0, n); used.fill(false, 0, n);
    dist[start] = 0;
    for (let k = 0; k < n; k++) {
      let u = -1;
      for (let i = 0; i < n; i++) {
        if (!used[i] && (u < 0 || dist[i] < dist[u])) u = i;
      }
      if (u < 0 || u === end || dist[u] === Infinity) break;
      used[u] = true;
      nodes[u].edges.forEach(function (e) {
        const nd = dist[u] + e.cost;
        if (nd < dist[e.to]) { dist[e.to] = nd; prev[e.to] = u; }
      });
    }
    let points = [];
    if (dist[end] !== Infinity) {
      for (let at = end; at >= 0; at = prev[at]) {
        points.push({ x: nodes[at].x, z: nodes[at].z });
      }
      points.reverse();
    }
    if (points.length < 2) return direct;
    if (U.distance2D(from.x, from.z, points[0].x, points[0].z) > 1.5) {
      points.unshift({ x: from.x, z: from.z });
    }
    const last = points[points.length - 1];
    if (U.distance2D(to.x, to.z, last.x, last.z) > 1.5) {
      points.push({ x: to.x, z: to.z });
    }
    let distance = 0;
    for (let i = 1; i < points.length; i++) {
      distance += U.distance2D(points[i - 1].x, points[i - 1].z, points[i].x, points[i].z);
    }
    return { points: points, distance: distance };
  }
  // Shared with NPC patrols so marching platoons follow the same real streets
  // as the full-screen GPS route instead of cutting through buildings.
  CC.computeRoute = computeRoute;

  function rebuildRoute() {
    const v = Game.vehicles[Game.activeKey];
    if (!v || !Game.waypoint) { Game.route = []; Game.routeDistance = 0; updateNavInfo(v); return; }
    // Aircraft fly direct. Roads, bridges and street weights are irrelevant in
    // the air, and curving the guide around them sends pilots the wrong way.
    const useDirect = v.isAircraft || Game.waypointMode === 'straight';
    const result = useDirect ? {
      distance: U.distance2D(v.pos.x, v.pos.z, Game.waypoint.x, Game.waypoint.z),
      points: [{ x: v.pos.x, z: v.pos.z }, { x: Game.waypoint.x, z: Game.waypoint.z }]
    } : computeRoute(v.pos, Game.waypoint);
    Game.route = result.points;
    Game.routeDistance = result.distance;
    Game.routeTimer = 0.5;
    updateNavInfo(v);
  }

  function directionTo(x, z, tx, tz) {
    const bearing = Math.atan2(tx - x, z - tz);
    const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return names[(Math.round(bearing / (Math.PI / 4)) + 8) % 8];
  }

  function updateNavInfo(v) {
    const el = $('navInfo');
    if (!el) return;
    if (!Game.waypoint) { el.classList.add('hidden'); return; }
    const route = Game.route || [];
    const next = route.length > 1 ? route[1] : Game.waypoint;
    const dir = directionTo(v.pos.x, v.pos.z, next.x, next.z);
    const metres = Math.round(Game.routeDistance);
    const eta = Math.max(1, Math.round(Game.routeDistance / 13.4));
    const dist = metres >= 1000 ? (metres / 1000).toFixed(1) + ' km' : metres + ' m';
    const html = '<b>◈ WAYPOINT</b> ' + dir + ' · ' + dist + ' · ' + eta + 's';
    if (el.innerHTML !== html) el.innerHTML = html;
    el.classList.remove('hidden');
  }

  // The map follows where the player is actually going, not just where the
  // model is pointing. That matters in reverse, while drifting, and for a
  // pedestrian backpedalling or strafing through water.
  let mapMotion = { key: null, heading: 0, time: -Infinity, x: 0, z: 0 };
  function angleDelta(to, from) {
    return Math.atan2(Math.sin(to - from), Math.cos(to - from));
  }

  function mapHeading(v) {
    if (!v) return 0;
    const facing = typeof v.heading === 'number' ? v.heading :
      (v.group && typeof v.group.rotation.y === 'number' ? v.group.rotation.y : 0);
    const now = Game.time || 0;
    let travel = null;

    // Cars and pedestrians expose speed and a forward vector. Multiplying by
    // signed speed makes reversing flip the map immediately; adding latVel
    // keeps a handbrake drift aligned with the sliding car.
    const speed = Number(v.speed) || 0;
    if (Math.abs(speed) > 0.35 && typeof v.forward === 'function') {
      const f = v.forward();
      const lat = Number(v.latVel) || 0;
      const rx = Math.cos(facing), rz = -Math.sin(facing);
      const mx = f.x * speed + rx * lat;
      const mz = f.z * speed + rz * lat;
      if (Math.hypot(mx, mz) > 0.35) travel = Math.atan2(mx, mz);
    }

    // Fallback for scripted craft that move without reporting a useful speed.
    if (travel === null && v.pos && now > mapMotion.time) {
      const dx = v.pos.x - mapMotion.x, dz = v.pos.z - mapMotion.z;
      if (Math.hypot(dx, dz) > 0.08 && now - mapMotion.time < 0.5) {
        travel = Math.atan2(dx, dz);
      }
    }
    if (v.pos) { mapMotion.x = v.pos.x; mapMotion.z = v.pos.z; }

    if (travel === null) travel = facing;
    if (mapMotion.key !== v.key || now - mapMotion.time > 0.75) {
      mapMotion.key = v.key;
      mapMotion.heading = travel;
      mapMotion.time = now;
      return travel;
    }
    const dt = U.clamp(now - mapMotion.time, 0, 0.25);
    mapMotion.heading += angleDelta(travel, mapMotion.heading) * (1 - Math.exp(-9 * dt));
    mapMotion.time = now;
    return mapMotion.heading;
  }

  // The round HUD is heading-up; the enlarged planner is a north-up view of
  // the same painted ground canvas the 3D world drives on. Both share one
  // projection object so marker drawing and click-to-waypoint stay in sync.
  function mapProjection(v, w, h, compact) {
    const heading = mapHeading(v);
    const facing = typeof v?.heading === 'number' ? v.heading :
      (v?.group && typeof v.group.rotation.y === 'number' ? v.group.rotation.y : heading);
    const world = C.WORLD;
    const theta = compact ? heading - Math.PI : 0;
    const zoom = compact ? 1 : U.clamp(Game.mapZoom || 1, 1, 5);
    const fullSpanX = (world.maxX - world.minX) / zoom;
    const fullSpanZ = (world.maxZ - world.minZ) / zoom;
    const pos = compact
      ? ((v && v.pos) || { x: 0, z: 0 })
      : {
        x: U.clamp((world.minX + world.maxX) * 0.5 + (Game.mapPanX || 0), world.minX + fullSpanX * 0.5, world.maxX - fullSpanX * 0.5),
        z: U.clamp((world.minZ + world.maxZ) * 0.5 + (Game.mapPanZ || 0), world.minZ + fullSpanZ * 0.5, world.maxZ - fullSpanZ * 0.5)
      };
    const flying = !!(v && (v.isAircraft || v.isFpv));
    const span = compact ? (flying ? 540 : 250) : fullSpanX;
    const scaleX = compact ? w / span : (w - 18) / fullSpanX;
    const scaleY = compact ? w / span : (h - 18) / fullSpanZ;
    const scale = Math.min(scaleX, scaleY);
    const cx = w * 0.5, cy = h * 0.5;
    const cos = Math.cos(theta), sin = Math.sin(theta);

    function pt(x, z) {
      return { x: cx + (x - pos.x) * scaleX, y: cy + (z - pos.z) * scaleY };
    }
    function screen(x, z) {
      const q = pt(x, z);
      const dx = q.x - cx, dy = q.y - cy;
      return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
    }
    function apply(g) {
      g.save();
      g.translate(cx, cy);
      g.rotate(theta);
      g.translate(-cx, -cy);
    }
    function restore(g) { g.restore(); }
    function invert(px, py) {
      const dx = px - cx, dy = py - cy;
      const ux = dx * cos + dy * sin;
      const uy = -dx * sin + dy * cos;
      return { x: pos.x + ux / scaleX, z: pos.z + uy / scaleY };
    }
    return {
      heading: heading, facing: facing, theta: theta, pos: pos, scale: scale,
      scaleX: scaleX, scaleY: scaleY, zoom: zoom,
      span: span, cx: cx, cy: cy, compact: !!compact, pt: pt, screen: screen,
      apply: apply, restore: restore, invert: invert
    };
  }

  function drawRoute(g, w, h, proj, label) {
    const route = Game.route || [];
    if (!Game.waypoint || route.length < 2) return;
    const scale = w / 200, pulse = 0.5 + 0.5 * Math.sin(Game.time * 4);
    g.save();
    g.lineJoin = 'round'; g.lineCap = 'round';
    g.beginPath();
    route.forEach(function (p, i) {
      const q = proj.pt(p.x, p.z);
      if (i === 0) g.moveTo(q.x, q.y); else g.lineTo(q.x, q.y);
    });
    g.strokeStyle = 'rgba(3,20,28,0.9)'; g.lineWidth = 7 * scale; g.stroke();
    g.strokeStyle = '#28d9ff'; g.lineWidth = 4 * scale; g.stroke();
    g.setLineDash([5 * scale, 5 * scale]);
    g.strokeStyle = 'rgba(255,255,255,0.92)'; g.lineWidth = 1.3 * scale; g.stroke();
    g.setLineDash([]);
    const q = proj.pt(Game.waypoint.x, Game.waypoint.z);
    g.beginPath(); g.arc(q.x, q.y, (4 + pulse * 3) * scale, 0, Math.PI * 2);
    g.strokeStyle = '#ffe066'; g.lineWidth = 2 * scale; g.stroke();
    g.beginPath(); g.arc(q.x, q.y, 2.4 * scale, 0, Math.PI * 2);
    g.fillStyle = '#ffe066'; g.fill();
    if (label) label('WAYPOINT', Game.waypoint.x, Game.waypoint.z, '#ffe9a8', -9 * scale);
    g.restore();
  }

  // Canvas label with an optional collision list. The round radar keeps the
  // original single-label behaviour; the planner uses `placed` so a dense
  // town centre does not turn into a pile of overlapping business names.
  function drawMapLabel(g, text, x, y, color, w, placed, fontSize) {
    const size = fontSize || (w > 400 ? 12 : 9);
    g.save();
    g.font = 'bold ' + size + 'px Arial';
    g.textAlign = 'left'; g.textBaseline = 'middle';
    const tw = g.measureText(text).width;
    const half = size * 0.75 + 3;
    const h = g.canvas.height;
    const maxX = Math.max(2, w - tw - 8);
    const candidates = [
      [x + 7, y - 6], [x - tw - 7, y - 6],
      [x + 7, y + 10], [x - tw - 7, y + 10],
      [x - tw * 0.5, y - size - 7], [x - tw * 0.5, y + size + 7]
    ];
    let px = 0, py = 0, rect = null;
    for (let i = 0; i < candidates.length; i++) {
      const cx = U.clamp(candidates[i][0], 2, maxX);
      const cy = U.clamp(candidates[i][1], half + 2, h - half - 2);
      const r = { x: cx - 3, y: cy - half, w: tw + 7, h: half * 2 };
      const clear = !placed || !placed.some(function (o) {
        return r.x < o.x + o.w + 3 && r.x + r.w + 3 > o.x &&
          r.y < o.y + o.h + 2 && r.y + r.h + 2 > o.y;
      });
      if (clear) { px = cx; py = cy; rect = r; break; }
    }
    if (!rect) { g.restore(); return false; }
    if (placed) placed.push(rect);
    g.fillStyle = 'rgba(3,12,17,0.82)';
    g.fillRect(rect.x, rect.y, rect.w, rect.h);
    g.fillStyle = color; g.fillText(text, px, py + 1);
    g.restore();
    return true;
  }

  function mapLabel(g, text, x, y, color, w) {
    drawMapLabel(g, text, x, y, color, w, null, w > 400 ? 12 : 9);
  }

  // Internal zone keys and baked uppercase sign text are both converted to
  // readable map names. The aliases keep the planner in step with the signs
  // the player actually sees in the 3D world.
  const mapLabelAliases = {
    nightclub: 'The Coral Club', pawn: 'Harbor Pawn', liquor: 'Bay Liquor',
    postOffice: 'Coastal Post Office', police: 'Coastal Police',
    massage: 'Serenity Massage', gunStore: 'Shore Guns & Ammo',
    chinese: 'Golden Dragon', waterTower: 'Water Tower',
    treatment: 'Water Treatment', fuelStorage: 'Fuel Depot', airport: 'Airport',
    cemetery: 'Cemetery',
    hospital: 'Coastal General', boatyard: 'Harbor Boatyard', dogpark: 'Dog Park',
    powerStation: 'Power Station', satellite: 'Satellite Link',
    airDefense: 'Air Defense', walmart: 'Walmart', nuclear: 'Nuclear Plant',
    walkingStream: 'Walking Stream', beaconSeafood: 'Beacon Seafood',
    port: 'River Container Port',
    motel: 'No Tell Motel', park: 'Park', farm: 'Farm', boardwalk: 'Boardwalk',
    amusement: 'Harbor Amusement Park', pier: 'Fishing Pier',
    gas: 'Coastal Fuel', fastfood: 'Seaside Diner', trailhead: 'Trailhead',
    marina: 'Marina', beach: 'Beach', 'boat launch': 'Boat Launch'
  };

  function prettyMapName(raw) {
    let s = String(raw == null ? '' : raw).trim();
    if (!s) return '';
    if (/^[A-Z0-9 &'\-]+$/.test(s) && s.length > 3) {
      s = s.toLowerCase().replace(/(^|[\s&\-'])([a-z])/g, function (_, lead, ch) {
        return lead + ch.toUpperCase();
      });
    }
    s = s.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, function (c) {
      return c.toUpperCase();
    });
    return s;
  }

  function mapLabelName(raw) {
    const key = String(raw == null ? '' : raw);
    return prettyMapName(mapLabelAliases[key] || key);
  }

  function drawNorthMarker(g, x, y, theta, radius) {
    g.save();
    g.translate(x, y);
    g.beginPath(); g.arc(0, 0, radius, 0, Math.PI * 2);
    g.fillStyle = 'rgba(5,20,27,0.88)'; g.fill();
    g.strokeStyle = 'rgba(159,230,255,0.75)'; g.lineWidth = 1.5; g.stroke();
    g.rotate(theta);
    g.beginPath();
    g.moveTo(0, -radius * 0.62);
    g.lineTo(radius * 0.28, radius * 0.26);
    g.lineTo(0, radius * 0.06);
    g.lineTo(-radius * 0.28, radius * 0.26);
    g.closePath();
    g.fillStyle = '#ffd166'; g.fill();
    g.restore();

    // Keep the letter upright and put it on the compass circle's north edge.
    const nx = x + Math.sin(theta) * radius * 0.82;
    const ny = y - Math.cos(theta) * radius * 0.82;
    g.save();
    g.font = 'bold ' + Math.round(radius * 0.78) + 'px Arial';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 2.5; g.strokeStyle = 'rgba(3,12,17,0.9)';
    g.strokeText('N', nx, ny);
    g.fillStyle = '#ffd166'; g.fillText('N', nx, ny);
    g.restore();
  }

  function drawMapCanvas(g, w, h, v, compact) {
    const proj = mapProjection(v, w, h, compact);
    Game.mapDebug = {
      heading: proj.heading, facing: proj.facing, theta: proj.theta,
      north: proj.theta, compact: !!compact, span: proj.span,
      x: proj.pos.x, z: proj.pos.z
    };
    if (!compact) {
      Game.lastFullMapProjection = proj;
      Game.mapDebug.fullMapSource = null;
    }
    g.clearRect(0, 0, w, h);
    g.save();
    // Only the small HUD map is circular; the enlarged planner uses the full
    // rectangular canvas for waypoint picking.
    if (compact) {
      g.beginPath();
      g.arc(w * 0.5, h * 0.5, Math.min(w, h) * 0.5 - 1, 0, Math.PI * 2);
      g.clip();
    }
    const labels = [];
    const poiLabels = [];
    const addLabel = function (text, x, z, color, dy) {
      const p = proj.screen(x, z);
      labels.push({ text: text, x: p.x, y: p.y + (dy || 0), color: color });
    };
    const addPoi = function (raw, x, z, color, priority) {
      const text = mapLabelName(raw);
      if (!text || !isFinite(x) || !isFinite(z)) return;
      const p = proj.screen(x, z);
      poiLabels.push({ text: text, x: p.x, y: p.y, color: color, priority: priority || 50 });
    };
    const W = C.WORLD;

    proj.apply(g);
    const mapW = (W.maxX - W.minX) * proj.scaleX;
    const mapH = (W.maxZ - W.minZ) * proj.scaleY;
    const origin = proj.pt(W.minX, W.minZ);
    // Use the canvas that feeds the 3D terrain material, not the discarded
    // reference picture. It already includes runtime zones, ponds and roads.
    const ground = CC.ImageMap && CC.ImageMap.groundCanvas;
    let drewGround = !!(CC.World.imageMode && ground && ground.width && ground.height);
    if (drewGround) {
      g.drawImage(ground, origin.x, origin.y, mapW, mapH);
      if (!compact) Game.mapDebug.fullMapSource = 'ImageMap.groundCanvas';
    } else {
      g.fillStyle = '#7f9c62';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#2d8fb5';
      g.beginPath();
      let p = proj.pt(W.minX, W.minZ);
      g.moveTo(p.x, p.y);
      for (let z = W.minZ; z <= W.maxZ; z += 12) {
        p = proj.pt(CC.coast.westLine(z), z);
        g.lineTo(p.x, p.y);
      }
      const end = proj.pt(W.minX, W.maxZ);
      g.lineTo(end.x, end.y);
      g.closePath(); g.fill();
    }

    // Both maps trace the same road definitions that drive traffic and GPS.
    // The enlarged map keeps them visible over the painted ground texture.
    const roadScale = compact ? proj.scale : (proj.scaleX + proj.scaleY) * 0.5;
    CC.roadDefs.forEach(function (road) {
      g.beginPath();
      road.points.forEach(function (pt, i) {
        const q = proj.pt(pt[0], pt[1]);
        if (i === 0) g.moveTo(q.x, q.y); else g.lineTo(q.x, q.y);
      });
      g.strokeStyle = road.type === 'paved'
        ? 'rgba(10,10,10,0.92)' :
        (road.type === 'gravel' || road.type === 'dirt') ? 'rgba(205,190,155,0.8)' : 'rgba(170,120,70,0.9)';
      g.lineWidth = Math.max(1.2, road.width * roadScale);
      g.lineJoin = 'round';
      g.stroke();
      if (!compact && road.name) {
        const mid = CC.sampleRoad ? CC.sampleRoad(road, (road._length || 0) * 0.5) : null;
        if (mid) addPoi(road.name, mid.x, mid.z, road.type === 'paved' ? '#eef7ff' : '#f2dfb0', 45);
      }
    });

    // Gameplay POIs stay visible on the full map. These are live objects from
    // the same world, not labels baked into an unrelated picture.
    if (!compact) {
      (CC.World.imageBuildings || []).forEach(function (b) {
        const q = proj.pt(b.x, b.z);
        const bw = Math.max(2, (b.w || 6) * proj.scaleX);
        const bl = Math.max(2, (b.l || 6) * proj.scaleY);
        g.fillStyle = 'rgba(220,214,196,0.88)';
        g.strokeStyle = 'rgba(70,62,52,0.55)';
        g.lineWidth = 1;
        g.fillRect(q.x - bw * 0.5, q.y - bl * 0.5, bw, bl);
        g.strokeRect(q.x - bw * 0.5, q.y - bl * 0.5, bw, bl);
      });
      (CC.World.obstacles || []).forEach(function (o) {
        if (!o || !isFinite(o.x) || !isFinite(o.z)) return;
        if (o.type === 'tree') return;
        if (o.type === 'home' || o.type === 'building') {
          const q = proj.pt(o.x, o.z);
          const bw = Math.max(2, (o.w || o.width || 8) * proj.scaleX);
          const bl = Math.max(2, (o.l || o.length || o.depth || 8) * proj.scaleY);
          g.fillStyle = 'rgba(220,214,196,0.84)';
          g.strokeStyle = 'rgba(70,62,52,0.45)';
          g.lineWidth = 1;
          g.fillRect(q.x - bw * 0.5, q.y - bl * 0.5, bw, bl);
          g.strokeRect(q.x - bw * 0.5, q.y - bl * 0.5, bw, bl);
          return;
        }
        if ((Game.mapZoom || 1) >= 2.2 && o.name && o.type !== 'prop') {
          addPoi(o.name, o.x, o.z, '#d7e6c2', 18);
        }
      });
      if (!drewGround) {
        const zoneNames = (CC.serviceZoneNames ? CC.serviceZoneNames() : [])
          .concat(['park', 'farm', 'boardwalk', 'amusement', 'pier', 'gas', 'fastfood', 'trailhead']);
        zoneNames.forEach(function (name) {
          const q = CC.ImageMap && CC.ImageMap.zones && CC.ImageMap.zones[name];
          if (!q) return;
          const p = proj.pt(q.x, q.z);
          const zw = q.w * proj.scaleX, zh = q.h * proj.scaleY;
          g.strokeStyle = 'rgba(120,220,255,0.55)'; g.lineWidth = 1.5;
          g.strokeRect(p.x - zw * 0.5, p.y - zh * 0.5, zw, zh);
        });
        (((CC.ImageMap && CC.ImageMap.zones && CC.ImageMap.zones.ponds) || [])).forEach(function (pond) {
          const p = proj.pt(pond.x, pond.z);
          g.fillStyle = 'rgba(80,205,235,0.9)';
          g.beginPath();
          g.arc(p.x, p.y, Math.max(3, pond.r * roadScale), 0, Math.PI * 2);
          g.fill();
        });
      }
      if (CC.Details && CC.Details.outpostPos) {
        const o = proj.pt(CC.Details.outpostPos.x, CC.Details.outpostPos.z);
        g.fillStyle = '#d4c66d';
        g.fillRect(o.x - 5, o.y - 5, 10, 10);
      }
      (CC.World.imageLandmarks || []).forEach(function (l) {
        const q = proj.pt(l.x, l.z);
        g.fillStyle = '#d7a4ff';
        g.beginPath(); g.moveTo(q.x, q.y - 6); g.lineTo(q.x + 6, q.y + 5);
        g.lineTo(q.x - 6, q.y + 5); g.closePath(); g.fill();
      });
      (CC.Details && CC.Details.businessSites || []).forEach(function (b) {
        const q = proj.pt(b.x, b.z);
        g.fillStyle = '#ffbd66'; g.fillRect(q.x - 5, q.y - 5, 10, 10);
      });
      (CC.Details && CC.Details.safeHouses || []).forEach(function (s) {
        const q = proj.pt(s.x, s.z);
        g.fillStyle = '#68ffd2'; g.fillRect(q.x - 4, q.y - 4, 8, 8);
      });
      (CC.Details && CC.Details.busStops || []).forEach(function (b) {
        const q = proj.pt(b.x, b.z);
        g.fillStyle = '#ff8ad2'; g.fillRect(q.x - 3, q.y - 3, 6, 6);
      });

      // Named places for waypoint navigation. Everything comes from the live
      // world data, so renames and relocated sites show up here automatically.
      const zones = (CC.ImageMap && CC.ImageMap.zones) || {};
      const civics = (CC.serviceZoneNames ? CC.serviceZoneNames() : [])
        .concat(['park', 'farm', 'boardwalk', 'amusement', 'pier', 'gas', 'fastfood', 'trailhead']);
      civics.forEach(function (name) {
        const q = zones[name];
        if (q) addPoi(name, q.x, q.z, '#ffe0a0', 100);
      });
      (CC.Details && CC.Details.businessSites || []).forEach(function (b) {
        addPoi(b.name, b.x, b.z, '#ffc47d', 96);
      });
      (CC.World && CC.World.imageLandmarks || []).forEach(function (l) {
        addPoi(l.name, l.x, l.z, '#c9b6ff', 88);
      });
      (CC.Details && CC.Details.rideStations || []).forEach(function (r) {
        addPoi(r.name, r.x, r.z, '#9fe9ff', 84);
      });
      (CC.pondDefs ? CC.pondDefs() : []).forEach(function (p) {
        addPoi(p.name, p.x, p.z, '#a7e6ff', 62);
      });
      if (CC.Details && CC.Details.marina) {
        addPoi('Marina', CC.Details.marina.x, CC.Details.marina.z, '#9fe9ff', 78);
      }
      (CC.Details && CC.Details.safeHouses || []).forEach(function (s) {
        addPoi(s.name, s.x, s.z, '#7dffd0', 34);
      });
      (CC.Details && CC.Details.busStops || []).forEach(function (b) {
        addPoi(b.name, b.x, b.z, '#ff9ed8', 32);
      });
    }

    if (!Game.freeRoam) (CC.World.challengeGates || []).forEach(function (gate) {
      const q = proj.pt(gate.x, gate.z);
      const isNext = Game.activeChallenge === gate.challenge && gate.index === Game.gateIndex;
      g.fillStyle = '#' + gate.color.getHexString();
      g.globalAlpha = isNext ? 1 : 0.45;
      g.beginPath(); g.arc(q.x, q.y, (isNext ? 3.6 : 2.2) * w / 200, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;
    });

    drawRoute(g, w, h, proj, addLabel);

    (CC.NPCSystem && CC.NPCSystem.traffic || []).forEach(function (t) {
      const q = proj.pt(t.group.position.x, t.group.position.z);
      const s = Math.max(2, 2.8 * w / 200);
      g.fillStyle = 'rgba(40,50,60,0.75)'; g.fillRect(q.x - s * 0.5, q.y - s * 0.5, s, s);
    });
    (CC.NPCSystem && CC.NPCSystem.policeCars || []).forEach(function (p) {
      const q = proj.pt(p.group.position.x, p.group.position.z);
      const s = 4 * w / 200;
      g.fillStyle = p.mode === 'chase' ? '#ff5b4d' : '#4d9bff';
      g.fillRect(q.x - s * 0.5, q.y - s * 0.5, s, s);
    });
    (CC.NPCSystem && CC.NPCSystem.aircraft || []).forEach(function (a) {
      const q = proj.pt(a.group.position.x, a.group.position.z);
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.beginPath(); g.arc(q.x, q.y, 1.9 * w / 200, 0, Math.PI * 2); g.fill();
    });
    (CC.UFOSystem && CC.UFOSystem.ufos || []).forEach(function (u) {
      if (!u.group || !u.group.visible || !u.pos) return;
      const q = proj.pt(u.pos.x, u.pos.z);
      const r = (compact ? 4 : 8) * (u.radius || 12) / 12;
      g.fillStyle = u.state === 'ascending' ? '#ffffff' : '#9fe9ff';
      g.beginPath();
      g.moveTo(q.x, q.y - r);
      g.lineTo(q.x + r * 0.9, q.y + r * 0.8);
      g.lineTo(q.x - r * 0.9, q.y + r * 0.8);
      g.closePath(); g.fill();
    });
    (CC.NPCSystem && CC.NPCSystem.watercraft || []).forEach(function (watercraft) {
      const q = proj.pt(watercraft.group.position.x, watercraft.group.position.z);
      const s = 3.2 * w / 200;
      g.fillStyle = watercraft.kind === 'ship' ? 'rgba(230,190,90,0.85)' : 'rgba(180,225,235,0.85)';
      g.fillRect(q.x - s * 0.5, q.y - s * 0.5, s, s);
    });
    (CC.TeenGangSystem && CC.TeenGangSystem.bikes || []).forEach(function (t) {
      if (!t.pos || (t.caught && !t.vehicle)) return;
      const q = proj.pt(t.pos.x, t.pos.z);
      const s = (t.wanted ? 4.4 : 3.2) * w / 200;
      g.fillStyle = t.wanted ? '#ff4fa3' : '#ff9de0';
      g.fillRect(q.x - s * 0.5, q.y - s * 0.5, s, s);
    });
    // FPV is piloted from wherever the player launched, so mark that pilot
    // point instead of an airport pad. It is also the post-explosion respawn.
    const fpvDrone = Game.vehicles && Game.vehicles.fpv;
    const fpvPilot = Game.fpvPilot || (fpvDrone && fpvDrone.pilotLocked
      ? { x: fpvDrone.home.x, z: fpvDrone.home.z } : null);
    if (fpvPilot) {
      const q = proj.pt(fpvPilot.x, fpvPilot.z);
      const s = compact ? 5.5 : 10;
      g.save();
      g.translate(q.x, q.y);
      g.rotate(Math.PI / 4);
      g.fillStyle = '#ff8a3d';
      g.shadowColor = '#ffb35c';
      g.shadowBlur = compact ? 6 : 14;
      g.fillRect(-s * 0.5, -s * 0.5, s, s);
      g.restore();
      if (compact) addLabel('FPV PILOT', fpvPilot.x, fpvPilot.z, '#ffcf8a', -11);
    }

    proj.restore(g);

    if (!compact) {
      // Highest-priority places claim space first. The small collision list
      // keeps labels readable without hiding the painted map underneath.
      poiLabels.sort(function (a, b) {
        return b.priority - a.priority || a.text.localeCompare(b.text);
      });
      const seen = Object.create(null);
      const placed = [];
      const drawn = [];
      const fontSize = U.clamp(Math.round(Math.min(w, h) / 34), 10, 17);
      poiLabels.forEach(function (l) {
        const key = l.text.toLowerCase();
        const prev = seen[key];
        if (prev && Math.hypot(prev.x - l.x, prev.y - l.y) < 28) return;
        if (drawMapLabel(g, l.text, l.x, l.y, l.color, w, placed, fontSize)) {
          seen[key] = l;
          drawn.push(l.text);
        }
      });
      Game.mapDebug.fullMapLabels = drawn;
    }

    labels.forEach(function (l) { mapLabel(g, l.text, l.x, l.y, l.color, w); });

    // The radar keeps the player centered; the north-up planner shows the
    // actual map position and rotates the arrow to the player's heading.
    const markerScale = compact ? w / 200 : w / 500;
    const playerPos = v && v.pos ? v.pos : null;
    const playerPoint = compact
      ? { x: proj.cx, y: proj.cy }
      : (playerPos
        ? proj.screen(playerPos.x, playerPos.z)
        : { x: proj.cx, y: proj.cy });
    g.save();
    g.translate(playerPoint.x, playerPoint.y);
    g.scale(markerScale, markerScale);
    if (!compact) g.rotate(Math.PI - (proj.facing || 0));
    g.beginPath(); g.arc(0, 0, 9.5, 0, Math.PI * 2);
    g.fillStyle = 'rgba(3,20,28,0.55)'; g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1; g.stroke();
    g.beginPath(); g.moveTo(0, -7); g.lineTo(5, 6); g.lineTo(0, 3); g.lineTo(-5, 6); g.closePath();
    g.fillStyle = '#ff5b4d'; g.fill();
    g.restore();

    // On the round minimap the gold N rides the rim. The large planner keeps
    // the same compass badge in its top-right corner.
    const compassR = compact ? 17 : 26;
    let compassX = w - compassR - 14;
    let compassY = compassR + 14;
    if (compact) {
      const rim = Math.min(w, h) * 0.5 - 1;
      const offset = Math.max(0, rim - compassR - 2);
      compassX = proj.cx + Math.sin(proj.theta) * offset;
      compassY = proj.cy - Math.cos(proj.theta) * offset;
    }
    drawNorthMarker(g, compassX, compassY, proj.theta, compassR);
    Game.mapDebug.northMarker = {
      x: compassX, y: compassY, radius: compassR, label: 'N', bearing: proj.theta
    };

    if (!compact) {
      const cursor = Game.mapOpen ? mapCursor() : null;
      if (cursor) {
        const cpt = proj.screen(cursor.x, cursor.z);
        g.save();
        g.strokeStyle = 'rgba(255, 225, 120, 0.95)';
        g.lineWidth = Math.max(1.5, w * 0.0016);
        g.beginPath(); g.moveTo(cpt.x, 0); g.lineTo(cpt.x, h); g.stroke();
        g.beginPath(); g.moveTo(0, cpt.y); g.lineTo(w, cpt.y); g.stroke();
        g.fillStyle = '#ffe066';
        g.beginPath(); g.arc(cpt.x, cpt.y, Math.max(4, w * 0.004), 0, Math.PI * 2); g.fill();
        g.strokeStyle = 'rgba(3,12,17,0.95)';
        g.lineWidth = Math.max(2, w * 0.0022);
        g.stroke();
        const coord = 'X ' + Math.round(cursor.x) + '  Z ' + Math.round(cursor.z);
        g.font = 'bold ' + Math.max(12, Math.round(w * 0.012)) + 'px Arial';
        g.textAlign = 'left'; g.textBaseline = 'bottom';
        const tw = g.measureText(coord).width;
        const bx = U.clamp(cpt.x + 12, 8, w - tw - 18);
        const by = U.clamp(cpt.y - 10, 28, h - 34);
        g.fillStyle = 'rgba(3,12,17,0.86)';
        g.fillRect(bx - 6, by - 22, tw + 12, 26);
        g.strokeStyle = 'rgba(255, 225, 120, 0.75)';
        g.strokeRect(bx - 6, by - 22, tw + 12, 26);
        g.fillStyle = '#ffe9a8';
        g.fillText(coord, bx, by);
        g.restore();
      }
      const capW = 560, capX = 12, capY = h - 28;
      g.fillStyle = 'rgba(3,12,17,0.78)';
      g.fillRect(capX, capY, capW, 20);
      g.font = 'bold 11px Arial'; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillStyle = '#cdefff';
      g.fillText('NORTH UP · CROSSHAIRS MOVE WITH D-PAD/ARROWS · RIGHT STICK SELECTS BUTTON · MODE: ' + String(Game.waypointMode || 'roads').toUpperCase(), capX + 6, capY + 10);
    } else {
      g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 1;
      g.beginPath();
      g.arc(proj.cx, proj.cy, Math.min(w, h) * 0.5 - 1, 0, Math.PI * 2); g.stroke();
    }
    g.restore();
  }

  function drawMinimap(v) {
    const c = $('minimap');
    if (!c) return;
    drawMapCanvas(c.getContext('2d'), c.width, c.height, v, true);
    updateNavInfo(v);
  }

  function resizeFullMapCanvas() {
    const c = $('fullMap');
    if (!c) return;
    const rect = c.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pw = Math.max(640, Math.round(rect.width * dpr));
    const ph = Math.max(420, Math.round(rect.height * dpr));
    if (c.width !== pw || c.height !== ph) {
      c.width = pw;
      c.height = ph;
    }
  }

  function drawFullMap(v) {
    const c = $('fullMap');
    if (!c) return;
    Game.mapDirty = false;
    Game.mapDrawTimer = 1 / 30;
    resizeFullMapCanvas();
    drawMapCanvas(c.getContext('2d'), c.width, c.height, v, false);
  }

  function mapCursor() {
    if (Game.mapCursor) return Game.mapCursor;
    if (Game.waypoint) return { x: Game.waypoint.x, z: Game.waypoint.z };
    const v = Game.vehicles[Game.activeKey];
    const pos = v && v.pos ? v.pos : { x: 0, z: 0 };
    return { x: U.clamp(pos.x, C.WORLD.minX, C.WORLD.maxX), z: U.clamp(pos.z, C.WORLD.minZ, C.WORLD.maxZ) };
  }

  function setMapCursor(x, z) {
    Game.mapCursor = {
      x: U.clamp(x, C.WORLD.minX, C.WORLD.maxX),
      z: U.clamp(z, C.WORLD.minZ, C.WORLD.maxZ)
    };
    return Game.mapCursor;
  }

  function moveMapCursor(dx, dz) {
    const c = mapCursor();
    setMapCursor(c.x + dx, c.z + dz);
    // Pointer/key events can fire far faster than the 30 Hz map redraw budget.
    if (Game.mapOpen) Game.mapDirty = true;
  }

  function mapActionButtons() {
    return ['mapSetRoadBtn','mapSetStraightBtn','mapNavigateBtn','mapTeleportBtn','mapClearBtn']
      .map(function(id){ return $(id); }).filter(Boolean);
  }
  function updateMapFocus() {
    const btns = mapActionButtons();
    if (!btns.length) return;
    Game.mapFocus = ((Game.mapFocus || 0) % btns.length + btns.length) % btns.length;
    btns.forEach(function (b, i) {
      const on = i === Game.mapFocus;
      b.classList.toggle('focused', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }
  function runMapAction(action) {
    const c = mapCursor();
    if (action === 'setRoad') {
      setWaypoint(c.x, c.z, { keepMapOpen: true, mode: 'roads' });
      toast('Road waypoint set at ' + Math.round(c.x) + ', ' + Math.round(c.z), 2.2);
    } else if (action === 'setStraight') {
      setWaypoint(c.x, c.z, { keepMapOpen: true, mode: 'straight' });
      toast('Straight waypoint set at ' + Math.round(c.x) + ', ' + Math.round(c.z), 2.2);
    } else if (action === 'navigate') {
      setWaypoint(c.x, c.z, { keepMapOpen: false, mode: Game.waypointMode || 'roads' });
    } else if (action === 'teleport') {
      spawnAtWaypoint(c);
    } else if (action === 'clear') {
      clearWaypoint();
    }
    updateMapFocus();
  }

  function clampMapPan() {
    const world = C.WORLD;
    const zoom = U.clamp(Game.mapZoom || 1, 1, 5);
    const spanX = (world.maxX - world.minX) / zoom;
    const spanZ = (world.maxZ - world.minZ) / zoom;
    const maxX = (world.maxX - world.minX - spanX) * 0.5;
    const maxZ = (world.maxZ - world.minZ - spanZ) * 0.5;
    Game.mapPanX = U.clamp(Game.mapPanX || 0, -maxX, maxX);
    Game.mapPanZ = U.clamp(Game.mapPanZ || 0, -maxZ, maxZ);
  }

  function setMapZoom(next, center) {
    const prev = U.clamp(Game.mapZoom || 1, 1, 5);
    Game.mapZoom = U.clamp(next, 1, 5);
    if (center) {
      const world = C.WORLD;
      const cx = (world.minX + world.maxX) * 0.5;
      const cz = (world.minZ + world.maxZ) * 0.5;
      Game.mapPanX = (Game.mapPanX || 0) + (center.x - (cx + (Game.mapPanX || 0))) * (1 - prev / Game.mapZoom);
      Game.mapPanZ = (Game.mapPanZ || 0) + (center.z - (cz + (Game.mapPanZ || 0))) * (1 - prev / Game.mapZoom);
    }
    clampMapPan();
    if (Game.mapOpen) Game.mapDirty = true;
  }

  function toggleFullMap(force) {
    if (!Game.started) return;
    const show = force == null ? !Game.mapOpen : !!force;
    Game.mapOpen = show;
    Game.keys = {};
    if (show) {
      Game.mapDirty = true;
      Game.mapDrawTimer = 0;
      Game.mapRenderTimer = 0;
    }
    const overlay = $('mapOverlay');
    if (overlay) overlay.classList.toggle('hidden', !show);
    if (show) {
      setMapCursor((Game.waypoint || mapCursor()).x, (Game.waypoint || mapCursor()).z);
      clampMapPan();
      drawFullMap(Game.vehicles[Game.activeKey]);
      const hint = $('mapHint');
      if (hint) hint.textContent = 'D-pad/arrows move crosshairs · right stick selects button · A/Enter activate · wheel/+/- zoom · drag pan';
    } else if (Game.waypoint) {
      rebuildRoute();
      toast('Route active — follow the blue line on the minimap', 2.6);
    }
  }

  function setWaypoint(x, z, opts) {
    opts = opts || {};
    if (opts.mode) Game.waypointMode = opts.mode;
    Game.waypoint = { x: U.clamp(x, C.WORLD.minX, C.WORLD.maxX),
      z: U.clamp(z, C.WORLD.minZ, C.WORLD.maxZ) };
    setMapCursor(Game.waypoint.x, Game.waypoint.z);
    rebuildRoute();
    if (!opts.keepMapOpen) toggleFullMap(false);
    if (opts.keepMapOpen && Game.mapOpen) drawFullMap(Game.vehicles[Game.activeKey]);
  }

  // Teleport pedestrian to a waypoint/crosshair target.
  function spawnAtWaypoint(target) {
    if (!Game.started) return false;
    const wp = target || Game.waypoint || (Game.mapOpen ? mapCursor() : null);
    if (!wp) {
      toast('No waypoint — press M and click the map first', 2.4);
      return false;
    }
    const old = Game.vehicles[Game.activeKey];
    const heading = old && old.heading != null ? old.heading : 0;
    const dest = { x: U.clamp(wp.x, C.WORLD.minX, C.WORLD.maxX), z: U.clamp(wp.z, C.WORLD.minZ, C.WORLD.maxZ) };
    if (!selectVehicle('pedestrian', { x: dest.x, z: dest.z, h: heading, s: 0 })) return false;
    if (Game.mapOpen) toggleFullMap(false);
    clearWaypoint(true);
    Game.camMode = 0;
    toast('On foot at ' + Math.round(dest.x) + ', ' + Math.round(dest.z), 2.6);
    return true;
  }

  function clearWaypoint(silent) {
    Game.waypoint = null;
    Game.route = [];
    Game.routeDistance = 0;
    updateNavInfo(Game.vehicles[Game.activeKey]);
    if (Game.mapOpen) drawFullMap(Game.vehicles[Game.activeKey]);
    if (!silent) toast('Waypoint cleared', 1.6);
  }

  function bindFullMapUI() {
    const small = $('minimap');
    if (small) small.addEventListener('click', function () { toggleFullMap(true); });
    const c = $('fullMap');
    if (c) {
      let dragging = false, moved = false, lastX = 0, lastY = 0;
      c.addEventListener('pointerdown', function (e) {
        dragging = true; moved = false; lastX = e.clientX; lastY = e.clientY;
        try { c.setPointerCapture(e.pointerId); } catch (err) {}
      });
      c.addEventListener('pointermove', function (e) {
        if (!dragging) return;
        const dx = e.clientX - lastX, dy = e.clientY - lastY;
        if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
        lastX = e.clientX; lastY = e.clientY;
        const proj = Game.lastFullMapProjection;
        if (!proj) return;
        Game.mapPanX -= dx / proj.scaleX;
        Game.mapPanZ -= dy / proj.scaleY;
        clampMapPan();
        Game.mapDirty = true;
      });
      c.addEventListener('pointerup', function (e) {
        dragging = false;
        if (moved) return;
        const r = c.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width * c.width;
        const py = (e.clientY - r.top) / r.height * c.height;
        const proj = Game.lastFullMapProjection;
        if (!proj) return;
        const world = proj.invert(px, py);
        setMapCursor(world.x, world.z);
        Game.mapDirty = true;
      });
      c.addEventListener('wheel', function (e) {
        if (!Game.mapOpen) return;
        e.preventDefault();
        const r = c.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width * c.width;
        const py = (e.clientY - r.top) / r.height * c.height;
        const proj = Game.lastFullMapProjection;
        const world = proj ? proj.invert(px, py) : mapCursor();
        setMapZoom((Game.mapZoom || 1) * (e.deltaY < 0 ? 1.18 : 0.85), world);
      }, { passive: false });
    }
    const close = $('mapCloseBtn');
    if (close) close.addEventListener('click', function () { toggleFullMap(false); });
    const actions = mapActionButtons();
    actions.forEach(function (btn, i) {
      btn.addEventListener('click', function () { runMapAction(btn.dataset.mapAction); });
      btn.addEventListener('focus', function () { Game.mapFocus = i; updateMapFocus(); });
    });
    updateMapFocus();
    window.addEventListener('resize', function () {
      if (Game.mapOpen) Game.mapDirty = true;
    });
  }
  Game.toggleFullMap = toggleFullMap;
  Game.setWaypoint = setWaypoint;
  Game.spawnAtWaypoint = spawnAtWaypoint;
  Game.clearWaypoint = clearWaypoint;
  Game.mapHeading = mapHeading;
  Game.mapProjection = mapProjection;
  Game.drawMinimap = drawMinimap;
  Game.drawFpvHud = drawFpvHud;
  Game.updateCamera = updateCamera;
  Game.readInput = readInput;
  Game.startOrSkip = startOrSkip;
  Game.finishStart = finishStart;
  Game.cleanVehicleToast = cleanVehicleToast;

  /* ---------- main loop ---------- */
  let last = performance.now();
  Game.manualFrame = false;
  let splashFramePending = false;

  // The town is already built when the splash appears. Running the full
  // simulation and WebGL render loop behind it makes slow/software GL machines
  // look hung before START is even clickable, so draw one static follow-camera
  // frame and leave the splash responsive until the player begins.
  function renderSplashFrame() {
    if (!Game.renderer || !Game.vehicles[Game.activeKey]) return;
    Game.updateCamera(0, Game.vehicles[Game.activeKey], {}, true);
    Game.renderer.render(Game.scene, Game.camera);
    splashFramePending = false;
  }
  Game.invalidateSplashFrame = function () { splashFramePending = true; };

  function frame(now) {
    requestAnimationFrame(frame);
    if (Game.manualFrame) { last = now; return; }
    if (!Game.started) {
      last = now;
      if (splashFramePending) renderSplashFrame();
      return;
    }
    tick(now);
  }
  function tick(now) {
    const rawDt = (now - last) / 1000;
    let dt = rawDt;
    last = now;
    dt = U.clamp(dt, 0, 0.05);
    Game.time += dt;
    // The full-screen planner freezes gameplay, so its WebGL background and
    // full-map canvas only need occasional refreshes. Input marks the map
    // dirty; these budgets cap repaints when events arrive faster than 30 Hz.
    Game.mapDrawTimer = Math.max(0, Game.mapDrawTimer - dt);
    Game.mapRenderTimer = Math.max(0, Game.mapRenderTimer - dt);
    const renderWorld = !Game.mapOpen || Game.mapRenderTimer <= 0;
    if (renderWorld) Game.mapRenderTimer = Game.mapOpen ? 1 / 15 : 0;

    // Keep the frame rate smooth on slower GPUs by trading a little resolution
    // for time. The shift is gradual and hysteretic so it never oscillates.
    if (!Game.mapOpen && rawDt > 0 && rawDt < 0.25) {
      Game.frameAvg = Game.frameAvg ? Game.frameAvg * 0.92 + rawDt * 0.08 : rawDt;
      Game.resCooldown = (Game.resCooldown || 0) - dt;
      if (Game.resCooldown <= 0) {
        Game.resCooldown = 0.75;
        if (!Game.renderer) return;
        const ratio = Game.renderer.getPixelRatio();
        let next = ratio;
        if (Game.frameAvg > 0.0195 && ratio > 0.7) next = Math.max(0.7, ratio - 0.1);
        else if (Game.frameAvg < 0.0135 && ratio < Game.basePixelRatio) {
          next = Math.min(Game.basePixelRatio, ratio + 0.05);
        }
        if (next !== ratio) {
          Game.renderer.setPixelRatio(next);
          Game.renderer.setSize(window.innerWidth, window.innerHeight, false);
        }
      }
    }
    if (renderWorld && CC.Drawbridges) CC.Drawbridges.update(dt, Game.time);

    const v = Game.vehicles[Game.activeKey];
    const pad = CC.Gamepad.read();
    handleGamepadActions(pad);
    // Aircraft get the dedicated analog flight axes from readInput; the right
    // stick no longer drives camera free-look while flying.
    // Route through Game.readInput so scripted camera/trailer modes can supply
    // deterministic analog input without patching the game loop itself.
    const input = Game.readInput(pad, v);
    // During a struggle the movement keys are used to fight the officer, not
    // to walk away; the raw keys/pad axes are read by NPCSystem separately.
    if (CC.NPCSystem && CC.NPCSystem.arrest && CC.NPCSystem.arrest.active && v.isPedestrian) {
      input.throttle = 0;
      input.steer = 0;
      input.boost = false;
      input.handbrake = false;
      input.dive = false;
    }
    if (Game.privateMoment || (CC.InteriorSystem && CC.InteriorSystem.current)) {
      input.throttle = 0;
      input.steer = 0;
      input.handbrake = true;
    }
    if (Game.ride && v.isPedestrian) {
      input.throttle = 0; input.steer = 0;
      input.boost = false; input.handbrake = false; input.dive = false;
    }
    let surface = 'paved';
    if (Game.mapOpen) {
      // The full-screen planner pauses the simulation so choosing a waypoint
      // does not let traffic, police or the player drift away from the map.
      input.throttle = 0; input.steer = 0; input.handbrake = true; input.boost = false;
      Audio.update(0, 0, false, surface);
    } else {
      surface = v.update(dt, input, CC.World, Game.time);
      if (Game.ride && v.isPedestrian) updateAmusementRide(dt, v);
      CC.World.update(dt, Game.time);
      if (CC.updateMapEditAnimations) CC.updateMapEditAnimations(dt);
      CC.NPCSystem.update(dt, v, CC.World, Audio);
      if (CC.AnimalSystem) CC.AnimalSystem.update(dt, v.pos);
      if (CC.FishSystem) CC.FishSystem.update(dt, v.pos, CC.NPCSystem);
      if (CC.UFOSystem) CC.UFOSystem.update(dt, Game.time);
      if (CC.TeenGangSystem) CC.TeenGangSystem.update(dt, v);
      if (v.isFpv && Game.activeKey === v.key) {
        if (v.landAtHome(CC.World)) Audio.chime(true);
        updateFpvCombat(v, CC.World);
      }
      CC.EnvironmentManager.update(dt, Game.time, v);
      CC.InteriorSystem.update(dt, Game.time);
      CC.CrimeSystem.update(dt);
      if (CC.DeliverySystem) CC.DeliverySystem.update(dt, v);
      updatePrivateMoment(dt, v);
      updateCamera(dt, v, pad);
      updateChallenges(dt, v);
      Audio.update(v.speed, input.throttle, input.boost, surface);
      if (v.isPedestrian) Audio.updateFootsteps(dt, v, surface);
      if (Game.waypoint) {
        Game.routeTimer -= dt;
        if (Game.routeTimer <= 0 || Game.route.length < 2) rebuildRoute();
      }
    }

    // Drifting clouds, rain and the moving sun/moon all follow the player.
    // While the map is open the scene is frozen, so update it only when the
    // throttled WebGL refresh actually renders a frame.
    if (renderWorld) {
      CC.Weather.update(dt, Game.time, v);
      CC.LightingSystem.update(dt, Game.time, v, CC.Weather);
      if (CC.StaticBatcher && CC.StaticBatcher.update) {
        CC.StaticBatcher.update(v.pos, dt, 560);
      }
    }

    // The HUD canvases redraw the whole map and the DOM hints scan every NPC
    // array. 10 Hz / 5 Hz reduces DOM/canvas churn while staying responsive.
    Game.hudCanvasTimer -= dt;
    const refreshCanvas = Game.hudCanvasTimer <= 0;
    if (refreshCanvas) Game.hudCanvasTimer = 0.1;
    Game.hudTextTimer -= dt;
    const refreshText = Game.hudTextTimer <= 0;
    if (refreshText) Game.hudTextTimer = 0.2;

    Game.hitMessageCooldown = Math.max(0, Game.hitMessageCooldown - dt);

    // CSS hides the normal HUD while the goggles or full map are on, so skip
    // its DOM and NPC scans entirely; only the relevant overlay updates below.
    const hudActive = !Game.fpvActive && !Game.mapOpen;
    if (refreshText && hudActive) {
      updateWorldUI();
      updateWantedHud();
      const actionEl = $('actionHint');
      if (actionEl) {
        let action = '';
        if (CC.InteriorSystem && CC.InteriorSystem.current) {
          action = CC.InteriorSystem.currentHint(v.pos);
        } else if (Game.safeHouse) action = 'E / R3 &nbsp;•&nbsp; LEAVE SAFE HOUSE';
        else if (CC.DeliverySystem && CC.DeliverySystem.active) {
          action = CC.DeliverySystem.currentHint(v.pos, v);
        } else if (v.isPedestrian) {
          const car = CC.NPCSystem && CC.NPCSystem.nearestStealableCar &&
            CC.NPCSystem.nearestStealableCar(v.pos);
          const spawn = nearestAircraftSpawn(v.pos);
          const safe = nearestSafeHouse(v.pos);
          const door = CC.InteriorSystem && CC.InteriorSystem.nearestDoor(v.pos);
          const crime = CC.CrimeSystem && CC.CrimeSystem.currentHint(v.pos);
          const rideHint = currentRideHint(v.pos);
          if (rideHint) action = rideHint;
          else if (door) action = CC.InteriorSystem.currentHint(v.pos);
          else if (crime) action = crime;
          else if (safe) action = 'E / R3 &nbsp;•&nbsp; ENTER SAFE HOUSE';
          else if (spawn) action = 'E / R3 &nbsp;•&nbsp; BOARD AIRCRAFT';
          else if (car) action = 'E / R3 &nbsp;•&nbsp; STEAL ' + car.label.toUpperCase();
          else if (Game.lastVehicle && Game.vehicles[Game.lastVehicle]) {
            action = 'E / R3 &nbsp;•&nbsp; ENTER ' + Game.vehicles[Game.lastVehicle].spec.label.toUpperCase();
          }
        } else if (CC.NPCSystem && CC.NPCSystem.companion) {
          action = CC.NPCSystem.companionReady(v.pos)
            ? 'X / D-pad ↓ &nbsp;•&nbsp; PRIVATE MOMENT'
            : 'Drive off-road to a quiet spot';
        } else if (!v.isAircraft && !(v.spec && v.spec.water)) {
          const nearby = (CC.NPCSystem.pedestrians || []).some(function (p) {
            return p.isEscort && !p.inVehicle &&
              U.distance2D(p.position.x, p.position.z, v.pos.x, v.pos.z) < 5.2;
          });
          if (nearby) action = 'X / D-pad ↓ &nbsp;•&nbsp; BEEP HORN';
        }
        if (!action && CC.DeliverySystem && CC.DeliverySystem.currentHint) {
          action = CC.DeliverySystem.currentHint(v.pos, v);
        }
        if (actionEl.innerHTML !== action) actionEl.innerHTML = action;
        actionEl.classList.toggle('show', !!action);
      }
    } // refreshText

    if (refreshCanvas && hudActive) {
      drawGauge(v);
      drawMinimap(v);
    }
    if (refreshCanvas && v.isFpv && Game.fpvActive && !Game.mapOpen) {
      drawFpvHud(v);
      Game.lastFpvHudDraw = Game.time;
    }
    if (Game.mapOpen && Game.mapDirty && Game.mapDrawTimer <= 0) drawFullMap(v);
    if (refreshText && !Game.fpvActive) {
      $('surface').textContent = Game.mapOpen ? 'Paused' :
        surface.charAt(0).toUpperCase() + surface.slice(1);
      $('camMode').textContent = Game.camModes[Game.camMode];
      const padEl = $('padStatus');
      if (padEl) {
        const on = CC.Gamepad.connected;
        padEl.classList.toggle('on', on);
        const label = String(CC.Gamepad.name || '').split('(')[0].trim().slice(0, 24);
        padEl.textContent = on ? 'GAMEPAD: ' + (label || 'Connected') : 'GAMEPAD: connect a controller';
      }
    } // refreshText

    if (Game.toastTimer > 0) {
      Game.toastTimer -= dt;
      if (Game.toastTimer <= 0) {
        const toastEl = $('toast');
        if (toastEl) toastEl.classList.remove('show');
      }
    }
    if (Game.bigMessageTimer > 0) {
      Game.bigMessageTimer -= dt;
      if (Game.bigMessageTimer <= 0) {
        const bigEl = $('bigMessage');
        if (bigEl) bigEl.className = 'bigMessage';
      }
    }
    if (Game.fpvMessageTimer > 0) {
      Game.fpvMessageTimer -= dt;
      if (Game.fpvMessageTimer <= 0) {
        const fpvMsg = $('fpvMessage');
        if (fpvMsg) fpvMsg.classList.remove('show');
      }
    }
    if (renderWorld) Game.renderer.render(Game.scene, Game.camera);
  }

  // Deterministic stepping hook used by the trailer harness. While manualFrame
  // is set, the normal requestAnimationFrame loop skips simulation and render,
  // so a capture can advance both at a fixed rate regardless of browser
  // throttling.
  Game.stepFrame = function (dt) {
    if (!Game.manualFrame) return false;
    const seconds = Number(dt);
    if (!Number.isFinite(seconds) || seconds <= 0) return false;
    tick(last + seconds * 1000);
    return true;
  };

  /* ---------- boot ---------- */
  window.addEventListener('DOMContentLoaded', async function () {
    const stage = function (name) {
      CC.bootStage = name;
      document.documentElement.setAttribute('data-boot-stage', name);
      const status = $('splashStatus');
      if (status && !Game.started) status.textContent = 'Loading the town… (' + name + ')';
    };
    const fail = function (err) {
      console.error('[Coastal Cruise] Startup failed at ' + (CC.bootStage || 'boot') + ':', err);
      document.documentElement.setAttribute('data-boot-error', String((err && err.stack) || err));
      const loading = $('loading');
      if (loading) loading.classList.add('hidden');
      const status = $('splashStatus');
      if (status) status.textContent = 'Startup failed: ' + ((err && err.message) || err);
    };
    window.addEventListener('error', function (e) {
      if (!CC.Game || !CC.Game.started) fail(e.error || e.message || e);
    });
    window.addEventListener('unhandledrejection', function (e) {
      if (!CC.Game || !CC.Game.started) fail(e.reason || e);
    });
    try {
      stage('input');
      bindInput();
      CC.Gamepad.init();
      stage('map');
      let usingImage = await CC.ImageMap.load(CC.imageMapDef.src);
      if (usingImage) usingImage = CC.ImageMap.apply();
      const loading = $('loading');
      if (loading) loading.classList.add('hidden');
      stage('scene');
      initScene();
      stage('hud');
      applySplashMedia();
      updateVehicleHud();
      let bootMessage;
      if (usingImage) {
        bootMessage = 'Town map loaded — drive the streets, or press E to explore on foot';
      } else if (location.protocol === 'file:') {
        bootMessage = 'Offline map unavailable — run python3 -m http.server 8080';
      } else {
        bootMessage = 'Welcome to Coastal Cruise — press 6 to explore on foot, H for controls';
      }
      Game.bootMessage = bootMessage;
      const statusText = $('splashStatusText');
      if (statusText) statusText.textContent = 'Town loaded — press START';
      const startBtn = $('startBtn');
      if (startBtn) { startBtn.disabled = false; startBtn.style.display = ''; }
      const startArea = $('splashStartArea');
      if (startArea) startArea.style.display = '';
      updateSplashFocus();
      stage('ready');
      splashFramePending = true;
      requestAnimationFrame(frame);
    } catch (err) {
      fail(err);
    }
  });
})();
