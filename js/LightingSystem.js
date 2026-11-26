/* Coastal Cruise - PS2-era atmosphere: exponential fog, gradient sky dome and
 * smoothly blended morning / golden-hour / dusk / night lighting.
 *
 * The existing Weather module still owns the clock, sun orbit and rain state.
 * This system runs immediately after Weather.update() and only adjusts the
 * colour/atmosphere side of that state, so the P/settings controls keep working.
 */
(function () {
  'use strict';

  const CC = window.CC;
  const C = CC.C;
  const U = CC.util;

  const SKY_VERT = [
    'varying vec3 vWorld;',
    'varying vec2 vUv;',
    'void main() {',
    '  vUv = uv;',
    '  vec4 world = modelMatrix * vec4(position, 1.0);',
    '  vWorld = world.xyz;',
    '  gl_Position = projectionMatrix * viewMatrix * world;',
    '}'
  ].join('\n');

  // Three baked CraftPix backgrounds (day / golden / night) replace the flat
  // gradient. The original gradient is still mixed in at dusk and in rain so
  // the existing Weather palette keeps control of the mood.
  const SKY_FRAG = [
    'uniform sampler2D uDay;',
    'uniform sampler2D uGolden;',
    'uniform sampler2D uNight;',
    'uniform vec3 uWeights;',
    'uniform vec3 uTint;',
    'uniform float uArt;',
    'uniform vec3 uTop;',
    'uniform vec3 uHorizon;',
    'uniform vec3 uBottom;',
    'uniform float uHaze;',
    'varying vec3 vWorld;',
    'varying vec2 vUv;',
    'void main() {',
    '  vec3 art = texture2D(uDay, vUv).rgb * uWeights.x;',
    '  art += texture2D(uGolden, vUv).rgb * uWeights.y;',
    '  art += texture2D(uNight, vUv).rgb * uWeights.z;',
    '  art *= uTint;',
    '  vec3 dir = normalize(vWorld - cameraPosition);',
    '  float h = dir.y;',
    '  float upper = smoothstep(-0.03, 0.78, h);',
    '  vec3 col = mix(uHorizon, uTop, pow(upper, 0.72));',
    '  float lower = smoothstep(0.02, -0.32, h);',
    '  col = mix(col, uBottom, lower * 0.92);',
    '  col = mix(col, art, uArt);',
    '  float band = exp(-abs(h) * 16.0) * uHaze;',
    '  col = mix(col, uHorizon, band * 0.72);',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  // Warm pre-sunset palette sampled from the approved harbor intro. The light
  // is amber but not yet orange, with a rose-violet fill, so buildings keep the
  // video's warm windows without turning the whole town red.
  const sunBase = new THREE.Color(0xffd39a);
  const sunGolden = new THREE.Color(0xffc178);
  const sunDusk = new THREE.Color(0xff714d);
  const sunNight = new THREE.Color(0xa8c8ff);
  const hemiBase = new THREE.Color(0xffd9b6);
  const hemiGolden = new THREE.Color(0xffd0a0);
  const hemiDusk = new THREE.Color(0xc99ac1);
  const hemiNight = new THREE.Color(0x7897c2);
  const groundBase = new THREE.Color(0x5c7a4d);
  const groundNight = new THREE.Color(0x243a34);
  const accent = new THREE.Color(0xe8ad72);
  const tmpTop = new THREE.Color();
  const tmpHorizon = new THREE.Color();
  const tmpBottom = new THREE.Color();
  const tmpTint = new THREE.Color();
  const rainTint = new THREE.Color(0x8296a0);

  function pulse(t, start, peak, end) {
    if (t <= start || t >= end) return 0;
    return t < peak ? (t - start) / (peak - start) : (end - t) / (end - peak);
  }

  function skyTexture(key, fallback) {
    const uri = CC.GeneratedAssets && CC.GeneratedAssets.textures &&
      CC.GeneratedAssets.textures[key];
    if (!uri) return fallback || null;
    const tex = new THREE.TextureLoader().load(uri);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = 1;
    return tex;
  }

  const LightingSystem = (CC.LightingSystem = {
    ready: false,
    phase: 'Morning',
    dome: null,

    init(scene, opts) {
      if (this.ready || !scene) return this;
      opts = opts || {};
      const weather = CC.Weather;
      const renderer = opts.renderer || (CC.Game && CC.Game.renderer);

      // Blob shadows replace the 2048px cascaded sun map. Keeping those flags
      // on object meshes is harmless once the renderer pass is disabled.
      if (renderer && renderer.shadowMap) renderer.shadowMap.enabled = false;
      if (opts.sun) opts.sun.castShadow = false;

      const fogColor = (weather && weather.fog && weather.fog.color) ||
        new THREE.Color(C.COLORS.fog);
      const fog = new THREE.FogExp2(fogColor.clone(), 0.00125);
      scene.fog = fog;
      if (weather) weather.fog = fog; // Weather.update() writes fog.color here.

      const fallbackSky = CC.TextureGenerator && CC.TextureGenerator.sky
        ? CC.TextureGenerator.sky() : null;
      const dayMap = skyTexture('craftSkyDay', fallbackSky);
      const goldenMap = skyTexture('craftSkyGolden', fallbackSky);
      const nightMap = skyTexture('craftSkyNight', fallbackSky);
      this.hasSkyArt = !!(dayMap && goldenMap && nightMap);

      const geometry = new THREE.SphereGeometry(680, 36, 20);
      const material = new THREE.ShaderMaterial({
        uniforms: {
          uDay: { value: dayMap },
          uGolden: { value: goldenMap },
          uNight: { value: nightMap },
          uWeights: { value: new THREE.Vector3(1, 0, 0) },
          uTint: { value: new THREE.Color(0xffffff) },
          uArt: { value: this.hasSkyArt ? 0.92 : 0 },
          uTop: { value: new THREE.Color(C.COLORS.skyTop) },
          uHorizon: { value: fogColor.clone() },
          uBottom: { value: fogColor.clone().multiplyScalar(0.7) },
          uHaze: { value: 0.5 }
        },
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: true,
        fog: false
      });
      const dome = new THREE.Mesh(geometry, material);
      dome.renderOrder = -1000;
      dome.frustumCulled = false;
      scene.add(dome);
      this.dome = dome;
      this.scene = scene;
      this.sun = opts.sun || null;
      this.hemi = opts.hemi || null;
      this.weather = weather || null;
      this.ready = true;
      this.update(0, 0, { pos: new THREE.Vector3() }, weather);
      return this;
    },

    update(dt, time, player, weather) {
      if (!this.ready) return;
      const w = weather || this.weather;
      if (!w) return;
      const tod = w.timeOfDay;
      const morning = pulse(tod, 0.17, 0.28, 0.44);
      const golden = pulse(tod, 0.61, 0.71, 0.80);
      const dusk = pulse(tod, 0.73, 0.81, 0.90);
      const night = U.clamp(w.night || 0, 0, 1);
      const rain = U.clamp(w.rain || 0, 0, 1);

      this.phase = night > 0.6 ? 'Night' : dusk > golden ? 'Dusk' :
        golden > morning ? 'Golden Hour' : morning > 0.15 ? 'Morning' : 'Day';

      // Exponential haze thickens at golden hour, dusk, night and during rain.
      this.scene.fog.density = 0.00112 + golden * 0.00024 + dusk * 0.00036 +
        night * 0.00044 + rain * 0.0004;

      // Weather supplies the base palette each frame. Phase colours simply
      // tint it so slider scrubbing and automatic time both transition smoothly.
      tmpHorizon.copy(w.fog ? w.fog.color : new THREE.Color(C.COLORS.fog));
      accent.setHex(golden > dusk ? 0xffc178 : 0xd7788f);
      tmpHorizon.lerp(accent, Math.max(golden * 0.5, dusk * 0.36, 0.08));
      tmpTop.copy(w.sky || new THREE.Color(C.COLORS.skyTop));
      tmpBottom.copy(tmpHorizon).multiplyScalar(0.74);

      const uniforms = this.dome.material.uniforms;
      uniforms.uTop.value.copy(tmpTop);
      uniforms.uHorizon.value.copy(tmpHorizon);
      uniforms.uBottom.value.copy(tmpBottom);
      uniforms.uHaze.value = 0.36 + golden * 0.35 + dusk * 0.3 + rain * 0.18;

      // Blend the three baked sky paintings so the time-of-day sliders and the
      // automatic clock still cross-fade instead of hard-cutting at a phase.
      const goldenWeight = Math.max(golden, dusk * 0.82);
      const nightWeight = U.clamp(night + dusk * 0.3, 0, 1);
      const dayWeight = Math.max(0, 1 - goldenWeight - nightWeight);
      const weightSum = dayWeight + goldenWeight + nightWeight || 1;
      uniforms.uWeights.value.set(
        dayWeight / weightSum, goldenWeight / weightSum, nightWeight / weightSum
      );
      tmpTint.setHex(0xffffff)
        .lerp(sunGolden, goldenWeight * 0.16)
        .lerp(hemiNight, nightWeight * 0.38)
        .lerp(rainTint, rain * 0.42);
      uniforms.uTint.value.copy(tmpTint);
      uniforms.uArt.value = this.hasSkyArt
        ? U.clamp(0.93 - rain * 0.24 - night * 0.05, 0.58, 0.95) : 0;
      if (player && player.pos) this.dome.position.set(player.pos.x, 0, player.pos.z);

      if (this.sun) {
        this.sun.color.copy(sunBase)
          .lerp(sunGolden, golden * 0.8)
          .lerp(sunDusk, dusk * 0.85)
          .lerp(sunNight, night * 0.72);
        this.sun.intensity *= 1 + golden * 0.12 - night * 0.12;
      }
      if (this.hemi) {
        this.hemi.color.copy(hemiBase)
          .lerp(hemiGolden, golden * 0.75)
          .lerp(hemiDusk, dusk * 0.7)
          .lerp(hemiNight, night * 0.85);
        this.hemi.groundColor.copy(groundBase).lerp(groundNight, night * 0.8);
        this.hemi.intensity *= 0.92 + golden * 0.14;
      }
      if (w.moonLight) w.moonLight.color.setHex(0xb9d3ff);

      if (CC.TextureGenerator) CC.TextureGenerator.setNight(night);
      if (CC.EnvironmentManager) CC.EnvironmentManager.setNight(night);
    }
  });
})();
