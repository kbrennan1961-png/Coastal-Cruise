/* Runtime loader for the downloaded animated characters.
 *
 * Three.js and GLTFLoader are vendored as classic scripts under js/vendor, so
 * everything runs from file:// with no network or CORS. All model/texture bytes
 * are embedded as data URIs by tools/import-downloaded-assets.js and decoded
 * locally here. This module never makes a network request; GLTFLoader may use
 * in-memory blob: URLs for embedded textures, which stay inside the browser.
 */
(function () {
  'use strict';

  const CC = window.CC = window.CC || {};
  const U = CC.util || {};
  let loaderPromise = null;
  const templates = Object.create(null);
  const actionsByClip = typeof WeakMap === 'function' ? new WeakMap() : null;

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

  // Decode data URIs here instead of fetching them. GLTFLoader.parse() wants
  // raw GLB bytes, and atob() is available in every browser the game supports.
  function glbBytes(uri) {
    if (typeof uri !== 'string' || uri.slice(0, 5) !== 'data:') {
      return Promise.reject(new Error('Only embedded character data URIs are supported'));
    }
    try {
      const comma = uri.indexOf(',');
      const meta = uri.slice(5, comma);
      const body = uri.slice(comma + 1);
      let binary;
      if (/;base64/i.test(meta)) {
        const raw = atob(body);
        binary = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) binary[i] = raw.charCodeAt(i);
      } else {
        const raw = decodeURIComponent(body);
        binary = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) binary[i] = raw.charCodeAt(i) & 0xff;
      }
      return Promise.resolve(binary.buffer);
    } catch (err) {
      return Promise.reject(err);
    }
  }

  function parse(glbUri) {
    return Promise.all([loader(), glbBytes(glbUri)]).then(function (parts) {
      return new Promise(function (resolve, reject) {
        parts[0].parse(parts[1], '', resolve, reject);
      });
    });
  }

  function canonicalClip(name) {
    const base = String(name || '').split('|').pop().toLowerCase();
    if (/idle|stand/.test(base)) return 'Idle';
    if (/walk/.test(base)) return 'Walk';
    if (/run|sprint/.test(base)) return 'Run';
    if (/attack|punch|strike/.test(base)) return 'Attack';
    if (/hit|hurt|damage|flinch/.test(base)) return 'Hit';
    if (/death|die|dead|down/.test(base)) return 'Death';
    if (/fly|flight|kidnap/.test(base)) return 'Fly';
    return null;
  }

  function collectClips(gltf) {
    const clips = {};
    (gltf.animations || []).forEach(function (clip) {
      clips[clip.name] = clip;
      const alias = canonicalClip(clip.name);
      if (alias && !clips[alias]) clips[alias] = clip;
    });
    return clips;
  }

  function assetFor(key) {
    const data = CC.DownloadedAssets || {};
    return (data.villagers && data.villagers[key]) ||
      (data.characters && data.characters[key]) ||
      (data.creatures && data.creatures[key]) || null;
  }

  function boundsOf(object) {
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    return {
      box: box,
      w: Math.max(0.5, size.x),
      h: Math.max(0.5, size.y),
      d: Math.max(0.5, size.z)
    };
  }

  function templateFor(key) {
    if (templates[key]) return templates[key];
    const asset = assetFor(key);
    if (!asset) {
      const missing = Promise.resolve(null);
      templates[key] = missing;
      return missing;
    }
    const task = parse(asset.glb).then(function (gltf) {
      const scene = gltf.scene;
      scene.updateMatrixWorld(true);
      const bounds = boundsOf(scene);
      const scale = 1.9 / bounds.h;
      const clips = collectClips(gltf);
      patchPlaceholderTextures(scene, asset.texture, !!asset.pixelTextures);
      const names = Object.keys(clips);
      const first = names[0];
      return {
        source: scene,
        clips: clips,
        defaultClip: clips.Idle && 'Idle' || first,
        walkClip: clips.Walk && 'Walk' || clips.Run && 'Run' || first,
        scale: scale,
        offsetY: -bounds.box.min.y * scale,
        radius: clamp(Math.max(bounds.w, bounds.d) * scale * 0.45, 0.3, 1.2),
        pixelTextures: !!asset.pixelTextures,
        label: asset.label,
        kind: asset.kind,
        texture: asset.texture
      };
    }).catch(function (err) {
      DownloadedCharacterLoader.lastError = String((err && (err.stack || err)) || err);
      return null;
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
      model.scale.setScalar(template.scale * (Number(opts.scale) || 1));
      model.position.y = template.offsetY * (Number(opts.scale) || 1);
      group.add(model);
      patchPlaceholderTextures(model, opts.texture || template.texture, template.pixelTextures);

      const mixer = new THREE.AnimationMixer(model);
      const clips = template.clips;
      const actions = {};
      for (const name in clips) {
        let action = actionsByClip && actionsByClip.get(clips[name]);
        if (!action) {
          action = mixer.clipAction(clips[name]);
          if (actionsByClip) actionsByClip.set(clips[name], action);
        }
        actions[name] = action;
      }

      let current = null;
      let moving = !!opts.moving;
      let lock = 0;
      let lastWalk = false;

      function play(name, loop, fade) {
        const action = actions[name];
        if (!action) return false;
        const seen = new Set();
        for (const otherName in actions) {
          const other = actions[otherName];
          if (seen.has(other)) continue;
          seen.add(other);
          if (other !== action && other.isRunning()) other.fadeOut(fade);
        }
        action.enabled = true;
        action.setEffectiveWeight(1);
        action.reset();
        action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
        action.clampWhenFinished = !loop;
        action.fadeIn(fade).play();
        current = action;
        return true;
      }

      const preferred = (opts.clip && actions[opts.clip] && opts.clip) ||
        (opts.moving ? template.walkClip : template.defaultClip) ||
        template.defaultClip || template.walkClip;
      if (preferred) play(preferred, true, 0);

      function resume() {
        play(moving ? template.walkClip : template.defaultClip, true, 0.22);
      }

      return {
        group: group,
        mixer: mixer,
        actions: actions,
        radius: template.radius,
        clipNames: Object.keys(clips),
        label: template.label,
        kind: template.kind,
        setMoving: function (next) {
          moving = !!next;
          if (lock <= 0 && moving !== lastWalk) {
            lastWalk = moving;
            resume();
          } else if (lock <= 0 && !current) {
            resume();
          }
        },
        setClip: function (name, loop) {
          if (!actions[name]) return false;
          lock = 0;
          return play(name, loop !== false, 0.2);
        },
        trigger: function (name, triggerOpts) {
          if (!actions[name]) return false;
          const action = actions[name];
          const loop = !!(triggerOpts && triggerOpts.loop);
          const clip = action.getClip();
          lock = triggerOpts && triggerOpts.duration != null
            ? Number(triggerOpts.duration)
            : (clip && clip.duration) || 0.6;
          return play(name, loop, triggerOpts && triggerOpts.fade != null ? triggerOpts.fade : 0.12);
        },
        update: function (dt) {
          mixer.update(dt);
          if (lock > 0) {
            lock -= dt;
            if (lock <= 0) {
              lock = 0;
              lastWalk = moving;
              resume();
            }
          }
        }
      };
    });
  }

  const DownloadedCharacterLoader = (CC.DownloadedCharacterLoader = {
    available: true,
    lastError: '',
    textures: Object.create(null),
    build: build,
    count: function () {
      const data = CC.DownloadedAssets;
      if (!data) return 0;
      return Object.keys(data.villagers || {}).length +
        Object.keys(data.characters || {}).length +
        Object.keys(data.creatures || {}).length;
    },
    label: function (key) {
      const asset = assetFor(key);
      return asset && asset.label || key;
    },
    clipNames: function (key) {
      const asset = assetFor(key);
      if (asset) {
        const names = [];
        (asset.animations || []).forEach(function (name) {
          names.push(name);
          const alias = canonicalClip(name);
          if (alias && names.indexOf(alias) < 0) names.push(alias);
        });
        return names;
      }
      const template = templates[key];
      return template && template.then
        ? template.then(function (t) { return t ? Object.keys(t.clips) : []; })
        : [];
    }
  });

  const data = CC.DownloadedAssets || {};
  DownloadedCharacterLoader.villagerKeys = Object.keys(data.villagers || {});
  DownloadedCharacterLoader.characterKeys = Object.keys(data.characters || {});
  DownloadedCharacterLoader.creatureKeys = Object.keys(data.creatures || {});
  // NPCSystem keeps using `keys` for ordinary townsfolk. The new creature keys
  // are opt-in via the vehicle menu and the map editor, not random pedestrians.
  DownloadedCharacterLoader.keys = DownloadedCharacterLoader.villagerKeys
    .concat(DownloadedCharacterLoader.characterKeys);
  DownloadedCharacterLoader.allKeys = DownloadedCharacterLoader.keys
    .concat(DownloadedCharacterLoader.creatureKeys);
})();
