/* Runtime loader for the downloaded animated characters.
 *
 * Three.js and GLTFLoader are vendored as classic scripts under js/vendor, so
 * everything runs from file:// with no network or CORS. All model/texture bytes
 * are embedded as data URIs by tools/import-downloaded-assets.js.
 */
(function () {
  'use strict';

  const CC = window.CC = window.CC || {};
  const U = CC.util || {};
  let loaderPromise = null;
  const templates = Object.create(null);

  function clamp(value, lo, hi) {
    return Math.max(lo, Math.min(hi, value));
  }

  function loader() {
    if (loaderPromise) return loaderPromise;
    if (!THREE.GLTFLoader) {
      loaderPromise = Promise.reject(new Error('GLTFLoader is not available'));
      return loaderPromise;
    }
    loaderPromise = Promise.resolve(new THREE.GLTFLoader());
    return loaderPromise;
  }

  function parse(glbUri) {
    return loader().then(function (gltfLoader) {
      // GLTFLoader.parse() expects decoded bytes for GLB; data URIs are read
      // through fetch so the embedded assets stay fetch-free from disk.
      return fetch(glbUri).then(function (r) { return r.arrayBuffer(); })
        .then(function (buffer) {
          return new Promise(function (resolve, reject) {
            gltfLoader.parse(buffer, '', resolve, reject);
          });
        });
    });
  }

  function horizontalBounds(object) {
    const box = new THREE.Box3().setFromObject(object);
    return { w: Math.max(0.5, box.max.x - box.min.x), h: Math.max(0.5, box.max.y - box.min.y) };
  }

  function templateFor(key) {
    if (templates[key]) return templates[key];
    const asset = CC.DownloadedAssets && CC.DownloadedAssets.villagers &&
      CC.DownloadedAssets.villagers[key];
    if (!asset) return Promise.resolve(null);
    const task = parse(asset.glb).then(function (gltf) {
      const scene = gltf.scene;
      scene.updateMatrixWorld(true);
      const size = horizontalBounds(scene);
      const targetHeight = 1.9;
      const scale = targetHeight / size.h;
      const clips = {};
      gltf.animations.forEach(function (clip) { clips[clip.name] = clip; });
      const width = size.w * scale;
      const firstClip = gltf.animations[0] && gltf.animations[0].name;
      return {
        source: scene,
        clips: clips,
        defaultClip: clips.Idle && 'Idle' || firstClip,
        walkClip: clips.Walk && 'Walk' || clips.Run && 'Run' || firstClip,
        scale: scale,
        radius: clamp(width * 0.45, 0.3, 0.8),
        pixelTextures: !!asset.pixelTextures,
        label: asset.label,
        kind: asset.kind
      };
    });
    templates[key] = task;
    return task;
  }

  function textureFor(uri, pixelated) {
    const cacheKey = (pixelated ? 'pixel:' : 'smooth:') + uri;
    if (!DownloadedCharacterLoader.textures[cacheKey]) {
      const texture = new THREE.TextureLoader().load(uri);
      texture.colorSpace = THREE.SRGBColorSpace;
      if (pixelated) {
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestMipmapNearestFilter;
      } else {
        texture.magFilter = THREE.LinearFilter;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
      }
      DownloadedCharacterLoader.textures[cacheKey] = texture;
    }
    return DownloadedCharacterLoader.textures[cacheKey];
  }

  function patchPlaceholderTextures(object, uri, pixelated) {
    const replacement = uri ? textureFor(uri, pixelated) : null;
    object.traverse(function (node) {
      if (!node.isMesh || !node.material) return;
      [].concat(node.material).forEach(function (mat) {
        if (mat.map && (!mat.map.image || mat.map.image.width <= 4)) {
          if (replacement) mat.map = replacement;
          mat.needsUpdate = true;
        }
      });
    });
  }

  function build(key, opts) {
    opts = opts || {};
    return templateFor(key).then(function (template) {
      if (!template) return null;
      const group = new THREE.Group();
      const model = template.source.clone(true);
      model.scale.setScalar(template.scale);
      patchPlaceholderTextures(model, opts.texture, template.pixelTextures);
      group.add(model);

      const mixer = new THREE.AnimationMixer(model);
      const clips = template.clips;
      const actions = {};
      for (const name in clips) actions[name] = mixer.clipAction(clips[name]);
      const preferred = (opts.moving ? template.walkClip : (opts.clip || template.defaultClip)) ||
        template.defaultClip || template.walkClip;
      if (preferred && actions[preferred]) {
        actions[preferred].reset().play();
      }
      return {
        group: group,
        mixer: mixer,
        actions: actions,
        radius: template.radius,
        clipNames: Object.keys(clips),
        setMoving: function (moving) {
          const a = actions[template.walkClip];
          const b = actions[template.defaultClip];
          if (a === b || (!a && !b)) return;
          const fade = 0.25;
          if (moving && a) {
            a.reset().play();
            if (b) b.fadeOut(fade);
          } else if (b) {
            b.reset().play();
            if (a) a.fadeOut(fade);
          }
        }
      };
    });
  }

  const DownloadedCharacterLoader = (CC.DownloadedCharacterLoader = {
    available: true,
    textures: Object.create(null),
    build: build,

    count: function () {
      const data = CC.DownloadedAssets;
      return (data ? Object.keys(data.villagers || {}).length : 0) +
        (data ? Object.keys(data.characters || {}).length : 0);
    }
  });

  // Higher-detail PSX citizens from Characters_psx.rar. These use 512px PNGs.
  Object.keys((CC.DownloadedAssets && CC.DownloadedAssets.characters) || {}).forEach(function (key) {
    const asset = CC.DownloadedAssets.characters[key];
    templates[key] = parse(asset.glb).then(function (gltf) {
      const scene = gltf.scene;
      scene.updateMatrixWorld(true);
      const size = horizontalBounds(scene);
      const scale = 1.9 / size.h;
      const clips = {};
      gltf.animations.forEach(function (clip) { clips[clip.name] = clip; });
      patchPlaceholderTextures(scene, asset.texture, false);
      const firstClip = gltf.animations[0] && gltf.animations[0].name;
      return {
        source: scene,
        clips: clips,
        defaultClip: clips.Idle && 'Idle' || firstClip,
        walkClip: clips.Walk && 'Walk' || clips.Run && 'Run' || firstClip,
        scale: scale,
        radius: clamp(size.w * scale * 0.45, 0.35, 0.85),
        pixelTextures: false,
        label: asset.label,
        kind: asset.kind,
        texture: asset.texture
      };
    });
  });

  // Expose a convenient list for NPCSystem without duplicating key definitions.
  DownloadedCharacterLoader.villagerKeys = Object.keys(
    (CC.DownloadedAssets && CC.DownloadedAssets.villagers) || {});
  DownloadedCharacterLoader.characterKeys = Object.keys(
    (CC.DownloadedAssets && CC.DownloadedAssets.characters) || {});
  DownloadedCharacterLoader.keys = DownloadedCharacterLoader.villagerKeys
    .concat(DownloadedCharacterLoader.characterKeys);
})();
