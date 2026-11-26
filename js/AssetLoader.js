/* Offline loader for the baked CC0 model pack. It builds plain BufferGeometry
   objects from the base64 payload in GeneratedAssets.js - no fetch, no CORS,
   and no extra loader scripts. */
(function () {
  'use strict';

  const CC = window.CC;
  if (!CC.GeneratedAssets) {
    CC.AssetLoader = { available: false };
    return;
  }

  const assets = CC.GeneratedAssets || { textures: {}, models: {} };
  const paletteMaterials = {};
  const paletteTextures = {};
  const bodyMaterials = {};
  const texturedMaterials = {};
  const houseMaterials = {};

  function decode(part, field, Ctor) {
    if (!part._decoded) part._decoded = {};
    if (part._decoded[field]) return part._decoded[field];
    const str = part[field];
    const bin = atob(str);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const value = Ctor === Uint16Array || Ctor === Uint32Array
      ? new Ctor(bytes.buffer, 0, Math.floor(bytes.length / Ctor.BYTES_PER_ELEMENT))
      : new Ctor(bytes.buffer);
    part._decoded[field] = value;
    return value;
  }

  function geometry(part) {
    if (part._geometry) return part._geometry;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(decode(part, 'position', Float32Array), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(decode(part, 'normal', Float32Array), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(decode(part, 'uv', Float32Array), 2));
    const idx = decode(part, 'index', part.indexType === 5125 ? Uint32Array : Uint16Array);
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    part._geometry = g;
    return g;
  }

  function textureFor(cache, key, uri, nearest) {
    if (cache[key]) return cache[key];
    const tex = new THREE.TextureLoader().load(uri);
    tex.flipY = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = nearest ? THREE.NearestFilter : THREE.LinearFilter;
    tex.minFilter = nearest ? THREE.NearestFilter : THREE.LinearMipmapLinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.generateMipmaps = !nearest;
    tex.anisotropy = CC.TextureGenerator && CC.TextureGenerator.anisotropy
      ? CC.TextureGenerator.anisotropy() : 1;
    cache[key] = tex;
    return tex;
  }

  function paletteTexture(key) {
    return textureFor(paletteTextures, 'palette_' + key, assets.textures[key], true);
  }

  function paletteMaterial(key) {
    if (paletteMaterials[key]) return paletteMaterials[key];
    const mat = new THREE.MeshLambertMaterial({
      map: paletteTexture(key), side: THREE.DoubleSide, flatShading: true
    });
    paletteMaterials[key] = mat;
    return mat;
  }

  function texturedMaterial(key) {
    if (texturedMaterials[key]) return texturedMaterials[key];
    const uri = assets.textures[key];
    if (!uri) return null;
    const mat = new THREE.MeshLambertMaterial({
      map: textureFor(texturedMaterials, 'tex_' + key, uri, false),
      side: THREE.DoubleSide, flatShading: true
    });
    texturedMaterials[key] = mat;
    return mat;
  }

  const propMaterials = {};
  function propMaterial(part) {
    const key = part.texture || part.role || 'default';
    if (propMaterials[key]) return propMaterials[key];
    const mapped = part.texture ? texturedMaterial(part.texture) : null;
    propMaterials[key] = mapped || new THREE.MeshLambertMaterial({
      color: 0xd6d2c6, side: THREE.DoubleSide, flatShading: true
    });
    return propMaterials[key];
  }

  function houseMaterial(role) {
    if (houseMaterials[role]) return houseMaterials[role];
    let mat;
    if (role === 'glass') {
      mat = new THREE.MeshStandardMaterial({
        color: 0x9cc8d6, emissive: 0x102832, emissiveIntensity: 0.12,
        roughness: 0.22, metalness: 0.05, side: THREE.DoubleSide
      });
    } else if (role === 'door') {
      mat = new THREE.MeshLambertMaterial({
        color: 0x6f5139, side: THREE.DoubleSide, flatShading: true
      });
    } else {
      mat = new THREE.MeshLambertMaterial({
        color: 0xffffff, side: THREE.DoubleSide, flatShading: true
      });
    }
    houseMaterials[role] = mat;
    return mat;
  }

  function bodyMaterial(color) {
    const key = Number(color) >>> 0;
    if (bodyMaterials[key]) return bodyMaterials[key];
    const env = CC.TextureGenerator && CC.TextureGenerator.environmentMap();
    bodyMaterials[key] = new THREE.MeshStandardMaterial({
      color: key, metalness: 0.3, roughness: 0.32,
      envMap: env || null, envMapIntensity: 0.85, flatShading: true
    });
    return bodyMaterials[key];
  }

  const staticRoleMaterials = {};
  function staticRoleMaterial(role, color) {
    const c = color == null ? 0x4b8fd6 : Number(color) >>> 0;
    const key = role + '|' + c;
    if (staticRoleMaterials[key]) return staticRoleMaterials[key];
    let mat;
    if (role === 'body') {
      mat = bodyMaterial(c);
    } else if (role === 'bodyAccent') {
      const accent = new THREE.Color(c).lerp(new THREE.Color(0xffffff), 0.62).getHex();
      mat = bodyMaterial(accent);
    } else if (role === 'glass') {
      mat = new THREE.MeshStandardMaterial({
        color: 0x3a6b83, emissive: 0x0b1a22, metalness: 0.18, roughness: 0.22,
        transparent: true, opacity: 0.78, side: THREE.DoubleSide
      });
    } else if (role === 'head') {
      mat = new THREE.MeshStandardMaterial({
        color: 0xfff3c4, emissive: 0xffdf9a, emissiveIntensity: 0.8
      });
    } else if (role === 'brake') {
      mat = new THREE.MeshStandardMaterial({ color: 0x7a2018, roughness: 0.4 });
    } else if (role === 'sirenRed') {
      mat = new THREE.MeshStandardMaterial({
        color: 0xd84035, emissive: 0xff2a14, emissiveIntensity: 0.05, flatShading: true
      });
    } else if (role === 'sirenBlue') {
      mat = new THREE.MeshStandardMaterial({
        color: 0x3d8fe0, emissive: 0x2a7ee8, emissiveIntensity: 0.05, flatShading: true
      });
    } else {
      mat = propMaterial({ role: role });
    }
    staticRoleMaterials[key] = mat;
    return mat;
  }

  function staticPartMaterial(model, part, color) {
    if (part.texture) return texturedMaterial(part.texture);
    // Baked props can carry their own material colour (e.g. the F-16's desert
    // camo) instead of sharing the generic map-edit body colour.
    if (part.color != null) return bodyMaterial(Number(part.color) >>> 0);
    if (model.kind === 'house') return houseMaterial(part.role);
    if (model.texture) return paletteMaterial(model.texture);
    return staticRoleMaterial(part.role || 'default', color);
  }

  let staticWheelMats = null;
  function getStaticWheelMats() {
    if (staticWheelMats) return staticWheelMats;
    staticWheelMats = {
      tyre: new THREE.MeshLambertMaterial({ color: 0x24282b, flatShading: true }),
      hub: new THREE.MeshLambertMaterial({ color: 0x777d80, flatShading: true })
    };
    return staticWheelMats;
  }

  const Loader = (CC.AssetLoader = {
    available: true,
    models: assets.models,

    geometry: geometry,
    paletteMaterial: paletteMaterial,

    /* Runtime registration for models baked by the Blender prompt workflow.
       The map editor calls this when a generated result JSON is imported, so
       the new prop appears in the open session without a page reload. */
    registerModels: function (models) {
      if (!models) return false;
      Object.keys(models).forEach(function (key) {
        assets.models[key] = models[key];
        if (CC.GeneratedAssets && CC.GeneratedAssets.models) {
          CC.GeneratedAssets.models[key] = models[key];
        }
        if (CC.CustomModels && CC.CustomModels.models) {
          CC.CustomModels.models[key] = models[key];
        }
      });
      return true;
    },

    footprint: function (name) {
      const model = CC.GeneratedAssets && CC.GeneratedAssets.models &&
        CC.GeneratedAssets.models[name] || assets.models[name];
      if (!model || !model.bounds) return null;
      const b = model.bounds;
      return {
        w: Math.max(0.01, b.max[0] - b.min[0]),
        l: Math.max(0.01, b.max[2] - b.min[2]),
        h: Math.max(0.01, b.max[1] - b.min[1])
      };
    },

    /* Build the painted body of one vehicle. Callers add their own wheels,
       headlight beams and blob shadow so the physics still owns those. */
    buildVehicle: function (name, colorOverride, spec) {
      const model = assets.models[name];
      if (!model) return null;
      const color = colorOverride == null ? (spec && spec.color) || 0x4b8fd6 : colorOverride;
      const base = new THREE.Color(color);
      const accent = base.clone().lerp(new THREE.Color(0xffffff), 0.62).getHex();
      const group = new THREE.Group();
      const scale = model.scale || 1;
      const wheel = (model.wheels && model.wheels[0]) || { y: 0.4 };
      const wheelY = (spec && spec.wheelRadius) || wheel.y * scale;
      const yOffset = wheelY - wheel.y * scale;

      const materials = {
        body: bodyMaterial(color),
        bodyAccent: bodyMaterial(accent),
        trimDark: new THREE.MeshLambertMaterial({ color: 0x252a2d, flatShading: true }),
        trim: new THREE.MeshLambertMaterial({ color: 0x777d80, flatShading: true }),
        tire: new THREE.MeshLambertMaterial({ color: 0x24282b, flatShading: true }),
        glass: new THREE.MeshStandardMaterial({
          color: 0x3a6b83, emissive: 0x0b1a22, metalness: 0.18, roughness: 0.22,
          transparent: true, opacity: 0.78, side: THREE.DoubleSide
        })
      };
      const brakeMat = new THREE.MeshStandardMaterial({
        color: 0x7a2018, emissive: 0x000000, roughness: 0.4
      });
      const headMat = new THREE.MeshStandardMaterial({
        color: 0xfff3c4, emissive: 0xffdf9a, emissiveIntensity: 0.8
      });
      const sirenMats = {};
      if (model.parts.some(function (p) { return p.role === 'sirenRed'; })) {
        sirenMats.red = new THREE.MeshStandardMaterial({
          color: 0xd84035, emissive: 0xff2a14, emissiveIntensity: 0.05, flatShading: true
        });
        sirenMats.blue = new THREE.MeshStandardMaterial({
          color: 0x3d8fe0, emissive: 0x2a7ee8, emissiveIntensity: 0.05, flatShading: true
        });
        materials.sirenRed = sirenMats.red;
        materials.sirenBlue = sirenMats.blue;
      }
      materials.head = headMat;
      materials.brake = brakeMat;

      model.parts.forEach(function (part) {
        const mat = materials[part.role];
        if (!mat) return;
        const mesh = new THREE.Mesh(geometry(part), mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
      });
      group.scale.setScalar(scale);
      group.position.y = yOffset;

      const wheels = (model.wheels || []).map(function (w) {
        return { x: w.x * scale, y: wheelY, z: w.z * scale };
      });
      return {
        group: group, wheels: wheels, brakeMat: brakeMat, headMat: headMat,
        sirenMats: sirenMats, scale: scale, yOffset: yOffset,
        frontZ: model.bounds.max[2] * scale,
        rearZ: model.bounds.min[2] * scale,
        width: (model.bounds.max[0] - model.bounds.min[0]) * scale
      };
    },

    /* Render a baked roadside prop (the CC0 bus shelter) with its own
       embedded textures. Unlike vehicles, props need no physics rig. */
    buildProp: function (name, scale) {
      const model = assets.models[name];
      if (!model || !model.parts) return null;
      const group = new THREE.Group();
      model.parts.forEach(function (part) {
        const mesh = new THREE.Mesh(geometry(part), propMaterial(part));
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
      });
      group.scale.setScalar(scale || 1);
      return group;
    },

    /* One-off static instance of any baked model. Map-editor placements use
       this for houses, trailers, vehicles, vegetation, rocks and props. */
    buildModel: function (name, opts) {
      const model = assets.models[name];
      if (!model || !model.parts) return null;
      opts = opts || {};
      const scale = (Number(model.scale) || 1) * (Number(opts.scale) || 1);
      const color = opts.color == null ? 0x4b8fd6 : Number(opts.color) >>> 0;
      const group = new THREE.Group();
      group.name = 'Map model: ' + name;

      model.parts.forEach(function (part) {
        const mat = staticPartMaterial(model, part, color);
        if (!mat) return;
        const mesh = new THREE.Mesh(geometry(part), mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
      });

      group.scale.setScalar(scale);
      const wheels = model.wheels && opts.wheels !== false ? model.wheels : null;
      const minY = model.bounds ? Number(model.bounds.min[1]) || 0 : 0;
      group.position.y = wheels && wheels.length ? 0 : -minY * scale;

      if (wheels && wheels.length) {
        const mats = getStaticWheelMats();
        wheels.forEach(function (w) {
          const radius = Math.max(0.15, Number(w.y) || 0.4);
          const pivot = new THREE.Group();
          pivot.position.set(w.x || 0, w.y || 0.4, w.z || 0);
          pivot.rotation.z = Math.PI / 2;
          const tyre = new THREE.Mesh(
            new THREE.CylinderGeometry(radius, radius, radius * 0.72, 10), mats.tyre);
          tyre.castShadow = true;
          pivot.add(tyre);
          const hub = new THREE.Mesh(
            new THREE.CylinderGeometry(radius * 0.48, radius * 0.48, radius * 0.75, 8), mats.hub);
          pivot.add(hub);
          group.add(pivot);
        });
      }
      return group;
    }
  });

  /* Tree, bush and flower models are queued during world generation, then
     flushed as one InstancedMesh per model to keep the draw call count low. */
  const Vegetation = (CC.AssetVegetation = {
    queues: {},
    counts: {},

    queue: function (name, x, y, z, scale, rotation) {
      if (!assets.models[name]) return false;
      if (!this.queues[name]) this.queues[name] = [];
      this.queues[name].push({
        x: x, y: y, z: z, scale: scale || 1, rotation: rotation || 0
      });
      return true;
    },

    flush: function (scene) {
      let total = 0;
      for (const name in this.queues) {
        const items = this.queues[name];
        if (!items.length) continue;
        const model = assets.models[name];
        const part = model.parts[0];
        if (!part) continue;
        const minY = model.bounds ? model.bounds.min[1] : 0;
        total += flushTiled(scene, geometry(part), paletteMaterial(model.texture), items,
          function (it, d) {
            d.position.set(it.x, it.y - minY * it.scale, it.z);
            d.rotation.set(0, it.rotation, 0);
            d.scale.setScalar(it.scale);
          }, null, false);
        this.counts[name] = items.length;
      }
      this.queues = {};
      CC.World = CC.World || {};
      CC.World.assetVegetation = total;
      return total;
    }
  });

  // Split a world-wide instance pool into spatial tiles. A single InstancedMesh
  // with instances on both sides of the map has a bounding sphere that always
  // intersects the camera, so none of it is ever culled. Tiles give the renderer
  // real culling granularity while keeping one draw call per model per tile.
  const INSTANCE_TILE = 160;
  const _tileDummy = new THREE.Object3D();
  const _tileTint = new THREE.Color();
  function flushTiled(scene, geo, mat, items, makeMatrix, colorFor, castShadow) {
    if (!geo || !mat || !items || !items.length) return 0;
    const buckets = new Map();
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const key = Math.floor(it.x / INSTANCE_TILE) + '|' + Math.floor(it.z / INSTANCE_TILE);
      let bucket = buckets.get(key);
      if (!bucket) { bucket = []; buckets.set(key, bucket); }
      bucket.push(it);
    }
    let count = 0;
    buckets.forEach(function (bucket) {
      const mesh = new THREE.InstancedMesh(geo, mat, bucket.length);
      for (let i = 0; i < bucket.length; i++) {
        const it = bucket[i];
        makeMatrix(it, _tileDummy);
        _tileDummy.updateMatrix();
        mesh.setMatrixAt(i, _tileDummy.matrix);
        if (colorFor) mesh.setColorAt(i, _tileTint.setHex(colorFor(it)));
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = !!castShadow;
      mesh.receiveShadow = true;
      mesh.frustumCulled = true;
      mesh.computeBoundingSphere();
      scene.add(mesh);
      count += bucket.length;
    });
    return count;
  }

  /* Downloaded rock pack. These models have their own 128px textures, so they
     are batched with the smooth textured material instead of the nearest-
     filtered palette material used for nature billboards. */
  const Rocks = (CC.AssetRocks = {
    queues: {},
    counts: {},

    queue: function (name, x, y, z, scale, rotation) {
      if (!assets.models[name]) return false;
      if (!this.queues[name]) this.queues[name] = [];
      this.queues[name].push({
        x: x, y: y, z: z, scale: scale || 1, rotation: rotation || 0
      });
      return true;
    },

    flush: function (scene) {
      let total = 0;
      for (const name in this.queues) {
        const items = this.queues[name];
        if (!items.length) continue;
        const model = assets.models[name];
        model.parts.forEach(function (part) {
          const mat = texturedMaterial(part.texture || model.texture);
          if (!mat) return;
          flushTiled(scene, geometry(part), mat, items, function (it, d) {
            d.position.set(it.x, it.y, it.z);
            d.rotation.set(0, it.rotation, 0);
            d.scale.setScalar(it.scale);
          }, null, true);
        });
        total += items.length;
        this.counts[name] = items.length;
      }
      this.queues = {};
      if (CC.World) CC.World.assetDownloadedRocks = total;
      return total;
    }
  });

  /* Baked homes are queued by World, then flushed as one InstancedMesh per
     model/role. That keeps the detailed CC0 houses and trailers cheap enough
     to scatter across the entire park. */
  const Buildings = (CC.AssetBuildings = {
    houses: {},
    trailers: {},
    counts: {},

    queueHouse: function (name, x, y, z, rotation, scale, color) {
      if (!assets.models[name] || assets.models[name].kind !== 'house') return false;
      if (!this.houses[name]) this.houses[name] = [];
      this.houses[name].push({
        x: x, y: y, z: z, rotation: rotation || 0, scale: scale,
        color: color == null ? 0xffffff : color
      });
      return true;
    },

    queueTrailer: function (name, x, y, z, rotation, scale) {
      if (!assets.models[name] || assets.models[name].kind !== 'trailer') return false;
      if (!this.trailers[name]) this.trailers[name] = [];
      this.trailers[name].push({
        x: x, y: y, z: z, rotation: rotation || 0, scale: scale
      });
      return true;
    },

    _flushGroup: function (scene, queue, kind) {
      const counts = this.counts;
      let total = 0;
      for (const name in queue) {
        const items = queue[name];
        if (!items.length) continue;
        const model = assets.models[name];
        model.parts.forEach(function (part) {
          const mat = kind === 'house' ? houseMaterial(part.role) : texturedMaterial(part.texture);
          if (!mat) return;
          flushTiled(scene, geometry(part), mat, items, function (it, d) {
            d.position.set(it.x, it.y, it.z);
            d.rotation.set(0, it.rotation, 0);
            d.scale.set(it.scale.x, it.scale.y, it.scale.z);
          }, kind === 'house' && part.role === 'body' ? function (it) { return it.color; } : null, false);
        });
        total += items.length;
        counts[name] = items.length;
      }
      return total;
    },

    flush: function (scene) {
      const total = this._flushGroup(scene, this.houses, 'house') +
        this._flushGroup(scene, this.trailers, 'trailer');
      this.houses = {};
      this.trailers = {};
      CC.World = CC.World || {};
      CC.World.assetBuildings = total;
      return total;
    }
  });
})();
