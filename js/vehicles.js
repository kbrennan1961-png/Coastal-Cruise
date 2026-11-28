/* Coastal Cruise - low-poly vehicle factory + arcade driving physics. */
(function () {
  'use strict';

  const CC = window.CC;
  const C = CC.C, U = CC.util;
  const tyreMat = new THREE.MeshLambertMaterial({ color: 0x24282b, flatShading: true });
  const hubMat = new THREE.MeshLambertMaterial({ color: 0xc6ccd0, flatShading: true });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x3a6b83, emissive: 0x0b1a22, metalness: 0.18, roughness: 0.22,
    transparent: true, opacity: 0.78, side: THREE.DoubleSide
  });
  const chromeMat = new THREE.MeshLambertMaterial({ color: 0xd9dfe2, flatShading: true });
  const trimMat = new THREE.MeshLambertMaterial({ color: 0x303437, flatShading: true });
  const amberMat = new THREE.MeshStandardMaterial({
    color: 0xffb347, emissive: 0xff8c1a, emissiveIntensity: 0.7, flatShading: true
  });

  function box(w, h, d, m, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x || 0, y || 0, z || 0);
    mesh.castShadow = true; mesh.receiveShadow = true;
    return mesh;
  }

  const wheelGeoCache = new Map();
  function wheelGeometries(radius, width) {
    const key = radius.toFixed(3) + '|' + width.toFixed(3);
    let pair = wheelGeoCache.get(key);
    if (!pair) {
      pair = {
        tyre: new THREE.CylinderGeometry(radius, radius, width, 10),
        hub: new THREE.CylinderGeometry(radius * 0.48, radius * 0.48, width + 0.03, 8)
      };
      wheelGeoCache.set(key, pair);
    }
    return pair;
  }

  function addWheel(parent, x, y, z, radius, width) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    pivot.rotation.z = Math.PI / 2;
    const geos = wheelGeometries(radius, width);
    const tyre = new THREE.Mesh(geos.tyre, tyreMat);
    tyre.castShadow = true;
    pivot.add(tyre);
    const hub = new THREE.Mesh(geos.hub, hubMat);
    pivot.add(hub);
    parent.add(pivot);
    return tyre;
  }

  const paintCache = {};
  function paint(hex) {
    const key = Number(hex) >>> 0;
    if (paintCache[key]) return paintCache[key];
    // One lazy PMREM sky reflection shared by every body panel. Flat shading
    // keeps the low-poly silhouette while roughness gives a clearcoat glint.
    const env = CC.TextureGenerator && CC.TextureGenerator.environmentMap();
    if (env && !glassMat.envMap) {
      glassMat.envMap = env;
      glassMat.envMapIntensity = 0.85;
      glassMat.needsUpdate = true;
    }
    paintCache[key] = new THREE.MeshStandardMaterial({
      color: hex, metalness: 0.34, roughness: 0.26,
      envMap: env || null, envMapIntensity: 0.95, flatShading: true
    });
    return paintCache[key];
  }

  // Local smoke and flame puffs ride with the vehicle as its damage climbs.
  function buildDamageFx(group) {
    const fx = new THREE.Group();
    const smoke = [], flames = [];
    const smokeGeo = new THREE.SphereGeometry(0.8, 7, 6);
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(smokeGeo, new THREE.MeshBasicMaterial({
        color: i % 3 === 0 ? 0x777a78 : 0x3d4042,
        transparent: true, opacity: 0, depthWrite: false
      }));
      const data = {
        bx: U.randRange(Math.random, -1.1, 1.1),
        bz: U.randRange(Math.random, -1.6, 1.6),
        phase: Math.random() * Math.PI * 2,
        base: U.randRange(Math.random, 0.75, 1.25)
      };
      m.position.set(data.bx, 1.2, data.bz);
      m.userData = data;
      fx.add(m);
      smoke.push(m);
    }
    const flameGeo = new THREE.ConeGeometry(0.48, 1.5, 6);
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(flameGeo, new THREE.MeshBasicMaterial({
        color: i % 2 ? 0xffb02e : 0xff5a1e,
        transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false
      }));
      const data = {
        bx: U.randRange(Math.random, -0.9, 0.9),
        bz: U.randRange(Math.random, -1.3, 1.3),
        phase: Math.random() * Math.PI * 2,
        base: U.randRange(Math.random, 0.8, 1.2)
      };
      m.position.set(data.bx, 1.1, data.bz);
      m.rotation.z = U.randRange(Math.random, -0.35, 0.35);
      m.userData = data;
      fx.add(m);
      flames.push(m);
    }
    // Undamaged cars are the norm; keep all sixteen transparent meshes out of
    // the render list until damage actually appears.
    fx.visible = false;
    group.add(fx);
    return { group: fx, smoke: smoke, flames: flames };
  }

  // Combines many small boxes into one mesh, so extra trim does not add a
  // draw call per part on every NPC vehicle.
  function mergedBoxes(parts, material) {
    const src = new THREE.BoxGeometry(1, 1, 1);
    const sp = src.attributes.position.array, sn = src.attributes.normal.array, si = src.index.array;
    const pos = [], norm = [], idx = [];
    const v = new THREE.Vector3(), n = new THREE.Vector3();
    const nm = new THREE.Matrix3();
    parts.forEach(function (p) {
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(p[3], p[4], p[5]),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(p[6] || 0, p[7] || 0, p[8] || 0)),
        new THREE.Vector3(p[0], p[1], p[2])
      );
      nm.getNormalMatrix(m);
      const off = pos.length / 3;
      for (let i = 0; i < sp.length; i += 3) {
        v.set(sp[i], sp[i + 1], sp[i + 2]).applyMatrix4(m);
        n.set(sn[i], sn[i + 1], sn[i + 2]).applyMatrix3(nm).normalize();
        pos.push(v.x, v.y, v.z); norm.push(n.x, n.y, n.z);
      }
      for (let i = 0; i < si.length; i++) idx.push(off + si[i]);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
    g.setIndex(idx);
    const mesh = new THREE.Mesh(g, material);
    mesh.castShadow = true; mesh.receiveShadow = true;
    return mesh;
  }

  /* ---------- detailed low-poly character ---------- */
  // Every character used to allocate its own six or seven materials. Hundreds
  // of townsfolk and ride riders meant thousands of unique materials, which
  // shows up as shader/uniform churn in the renderer. Share by colour instead.
  const characterMatCache = Object.create(null);
  function sharedCharacterMat(color) {
    const hex = (color && color.isColor ? color.getHex() : Number(color)) >>> 0;
    let material = characterMatCache[hex];
    if (!material) {
      material = new THREE.MeshLambertMaterial({ color: hex, flatShading: true });
      characterMatCache[hex] = material;
    }
    return material;
  }

  // Static riders (ferris wheel, coaster, carousel) never animate their arms
  // or legs. Collapse their parts by material so each rider costs a handful of
  // draw calls instead of twenty-something, while keeping the group transform
  // that the ride animates.
  function mergeStaticCharacter(group) {
    if (!group || !group.children.length) return;
    group.updateMatrixWorld(true);
    const inverse = new THREE.Matrix4().copy(group.matrixWorld).invert();
    const buckets = new Map();
    group.traverse(function (object) {
      if (!object.isMesh || object.isSkinnedMesh || Array.isArray(object.material)) return;
      const geo = object.geometry;
      if (!geo || !geo.attributes.position || !geo.attributes.normal || !geo.attributes.uv) return;
      if (!object.material || object.material.transparent || object.material.isShaderMaterial) return;
      let items = buckets.get(object.material);
      if (!items) {
        items = [];
        buckets.set(object.material, items);
      }
      items.push({
        mesh: object,
        matrix: new THREE.Matrix4().multiplyMatrices(inverse, object.matrixWorld)
      });
    });
    buckets.forEach(function (items, material) {
      if (items.length < 2) return;
      let count = 0;
      const parts = items.map(function (item) {
        const source = item.mesh.geometry;
        const geo = source.index ? source.toNonIndexed() : source;
        count += geo.attributes.position.count;
        return { geo: geo, source: source, matrix: item.matrix };
      });
      const position = new Float32Array(count * 3);
      const normal = new Float32Array(count * 3);
      const uv = new Float32Array(count * 2);
      const normalMatrix = new THREE.Matrix3();
      const v = new THREE.Vector3();
      let offset = 0;
      parts.forEach(function (part) {
        const pa = part.geo.attributes.position.array;
        const na = part.geo.attributes.normal.array;
        const ua = part.geo.attributes.uv.array;
        normalMatrix.getNormalMatrix(part.matrix);
        for (let i = 0; i < part.geo.attributes.position.count; i++) {
          const s3 = i * 3, d3 = (offset + i) * 3, d2 = (offset + i) * 2;
          v.set(pa[s3], pa[s3 + 1], pa[s3 + 2]).applyMatrix4(part.matrix);
          position[d3] = v.x; position[d3 + 1] = v.y; position[d3 + 2] = v.z;
          v.set(na[s3], na[s3 + 1], na[s3 + 2]).applyMatrix3(normalMatrix).normalize();
          normal[d3] = v.x; normal[d3 + 1] = v.y; normal[d3 + 2] = v.z;
          uv[d2] = ua[i * 2]; uv[d2 + 1] = ua[i * 2 + 1];
        }
        offset += part.geo.attributes.position.count;
        if (part.geo !== part.source) part.geo.dispose();
      });
      const mergedGeo = new THREE.BufferGeometry();
      mergedGeo.setAttribute('position', new THREE.BufferAttribute(position, 3));
      mergedGeo.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
      mergedGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      mergedGeo.computeBoundingSphere();
      const merged = new THREE.Mesh(mergedGeo, material);
      merged.castShadow = items[0].mesh.castShadow;
      merged.receiveShadow = items[0].mesh.receiveShadow;
      group.add(merged);
      items.forEach(function (item) {
        if (item.mesh.parent) item.mesh.parent.remove(item.mesh);
      });
    });
  }

  CC.CharacterFactory = {
    build(opts) {
      const o = opts || {};
      const lam = sharedCharacterMat;
      const skin = lam(o.skin || 0xe8bd96), shirt = lam(o.shirt || 0xf2b84b);
      const pants = lam(o.pants || 0x405466), shoes = lam(o.shoes || 0x37342f);
      const hair = lam(o.hair || 0x3b2c24), dark = lam(0x2b2c2e);
      const group = new THREE.Group();
      // Static body parts never animate; merge them by material so a walking
      // ped costs a few draws instead of twenty.
      const staticGroup = new THREE.Group();
      group.add(staticGroup);

      // Torso, belt and collar.
      const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.32, 0.92, 8), shirt);
      torso.position.y = 1.16; torso.castShadow = true;
      staticGroup.add(torso);
      staticGroup.add(box(0.6, 0.09, 0.36, dark, 0, 0.76, 0));
      staticGroup.add(box(0.34, 0.07, 0.3, lam(new THREE.Color(o.shirt || 0xf2b84b).offsetHSL(0, 0, -0.12).getHex()), 0, 1.58, 0));

      // Neck, head, ears, hair and simple face.
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.11, 0.18, 6), skin);
      neck.position.y = 1.64; staticGroup.add(neck);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 7), skin);
      head.position.y = 1.85; head.castShadow = true;
      staticGroup.add(head);
      [-0.23, 0.23].forEach(function (x) {
        const ear = new THREE.Mesh(new THREE.SphereGeometry(0.065, 6, 5), skin);
        ear.position.set(x, 1.84, 0); staticGroup.add(ear);
      });
      const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.258, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.58), hair);
      hairCap.position.y = 1.87; staticGroup.add(hairCap);
      [-0.095, 0.095].forEach(function (x) {
        staticGroup.add(box(0.055, 0.045, 0.02, dark, x, 1.88, 0.222));
        staticGroup.add(box(0.075, 0.022, 0.02, hair, x, 1.95, 0.222));
      });
      staticGroup.add(box(0.07, 0.09, 0.09, skin, 0, 1.8, 0.24));
      staticGroup.add(box(0.13, 0.022, 0.02, lam(0x8c5a4c), 0, 1.71, 0.235));

      // Limbs are groups pivoting at shoulder / hip so walking looks natural.
      function arm(side) {
        const g = new THREE.Group();
        g.position.set(side * 0.36, 1.52, 0);
        g.add(box(0.16, 0.4, 0.18, shirt, 0, -0.2, 0));
        g.add(box(0.14, 0.32, 0.16, skin, 0, -0.55, 0));
        g.add(box(0.16, 0.16, 0.18, skin, 0, -0.78, 0.02));
        return g;
      }
      function leg(side) {
        const g = new THREE.Group();
        g.position.set(side * 0.145, 0.76, 0);
        g.add(box(0.2, 0.4, 0.22, pants, 0, -0.2, 0));
        g.add(box(0.18, 0.32, 0.2, pants, 0, -0.55, 0));
        g.add(box(0.21, 0.13, 0.36, shoes, 0, -0.77, 0.07));
        return g;
      }
      const legL = leg(-1), legR = leg(1), armL = arm(-1), armR = arm(1);
      group.add(legL, legR, armL, armR);

      if (o.hat) {
        const hat = lam(o.hat);
        const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.27, 0.15, 10), hat);
        crown.position.y = 2.09; staticGroup.add(crown);
        const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.035, 10), hat);
        brim.position.set(0, 2.01, 0.14); staticGroup.add(brim);
      }
      if (o.bag) staticGroup.add(box(0.45, 0.6, 0.26, lam(o.bag), 0, 1.19, -0.36));

      mergeStaticCharacter(staticGroup);

      const blob = CC.EnvironmentManager
        ? CC.EnvironmentManager.attachBlobShadow(group, 1.15, 0.028, 1.05) : null;
      return { group: group, head: head, legL: legL, legR: legR, armL: armL, armR: armR, blob: blob };
    }
  };

  const carAssetModels = ['sedan', 'hatchback', 'muscle', 'sports', 'roadster'];
  const truckAssetModels = ['pickup', 'pickup', 'boxTruck', 'suv', 'van'];
  function chooseAssetVehicle(key, colorOverride, variant) {
    const spec = CC.vehicleSpecs[key];
    if (spec && spec.assetModel && CC.AssetLoader && CC.AssetLoader.models[spec.assetModel]) {
      return spec.assetModel;
    }
    if (variant === 'police' || colorOverride === 0xf3f4f0) return 'police';
    if (key !== 'car' && key !== 'truck') return null;
    if (colorOverride == null) return key === 'car' ? 'sedan' : 'pickup';
    const c = Number(colorOverride) >>> 0;
    const hash = ((c >> 16) ^ (c >> 8) ^ c) >>> 0;
    const list = key === 'car' ? carAssetModels : truckAssetModels;
    return list[hash % list.length];
  }

  const Factory = (CC.VehicleFactory = {
    builtAssets: 0,
    assetNames: {},

    build(key, colorOverride, variant) {
      const spec = CC.vehicleSpecs[key];
      const color = colorOverride == null ? spec.color : colorOverride;
      const bodyMat = paint(color);
      const darkMat = paint(new THREE.Color(color).offsetHSL(0, 0, -0.18).getHex());
      const group = new THREE.Group();
      const tilt = new THREE.Group();
      group.add(tilt);
      const wheels = [];
      const spin = {};
      const beams = [];
      let brakeMat, headMat;

      const assetName = chooseAssetVehicle(key, colorOverride, variant);
      if (assetName && CC.AssetLoader && CC.AssetLoader.available) {
        const av = CC.AssetLoader.buildVehicle(assetName, color, spec);
        if (av) {
          tilt.add(av.group);
          av.wheels.forEach(function (w) {
            wheels.push(addWheel(tilt, w.x, w.y, w.z, spec.wheelRadius, spec.wheelRadius * 0.72));
          });
          brakeMat = av.brakeMat;
          headMat = av.headMat;
          const beamY = Math.max(0.75, spec.wheelRadius + 0.45);
          if (CC.EnvironmentManager) {
            [-1, 1].forEach(function (s) {
              const beam = CC.EnvironmentManager.createHeadlightBeam(
                s * av.width * 0.32, beamY, av.frontZ - 0.05);
              tilt.add(beam);
              beams.push(beam);
            });
          }
          const blob = (CC.EnvironmentManager && !spec.flying)
            ? CC.EnvironmentManager.attachBlobShadow(
              group, spec.radius * 2.35, -spec.wheelRadius + 0.035, spec.radius * 3.1)
            : null;
          Factory.builtAssets++;
          Factory.assetNames[assetName] = (Factory.assetNames[assetName] || 0) + 1;
          return {
            group: group, tilt: tilt, wheels: wheels, brakeMat: brakeMat,
            headMat: headMat, beams: beams, blob: blob, spec: spec, key: key,
            spin: spin, assetModel: assetName, sirenMats: av.sirenMats
          };
        }
      }

      brakeMat = new THREE.MeshStandardMaterial({ color: 0x7a2018, emissive: 0x000000, roughness: 0.4 });
      headMat = new THREE.MeshStandardMaterial({ color: 0xfff3c4, emissive: 0xffdf9a, emissiveIntensity: 0.8 });

      function lights(w, y, z) {
        for (const s of [-1, 1]) {
          const rear = box(0.28, 0.2, 0.09, brakeMat, s * w * 0.32, y, -z);
          tilt.add(rear);
          const front = box(0.26, 0.2, 0.09, headMat, s * w * 0.32, y, z);
          tilt.add(front);
          if (CC.EnvironmentManager) {
            const beam = CC.EnvironmentManager.createHeadlightBeam(s * w * 0.32, y, z);
            tilt.add(beam);
            beams.push(beam);
          }
        }
      }

      if (key === 'motorcycle') {
        tilt.add(box(0.28, 0.28, 1.7, darkMat, 0, 0.72, 0));
        const tank = new THREE.Mesh(new THREE.SphereGeometry(0.46, 8, 6), bodyMat);
        tank.scale.set(0.9, 0.7, 1.35);
        tank.position.set(0, 0.98, 0.2); tank.castShadow = true;
        tilt.add(tank);
        tilt.add(box(0.5, 0.12, 0.65, tyreMat, 0, 1.12, -0.35));
        tilt.add(box(0.9, 0.08, 0.08, chromeMat, 0, 1.28, 0.62));
        tilt.add(box(0.12, 0.42, 0.12, darkMat, 0, 1.05, 0.72));
        tilt.add(box(0.72, 0.06, 0.06, chromeMat, 0, 0.28, 1.05));
        wheels.push(addWheel(tilt, 0, 0.38, 0.86, 0.38, 0.18));
        wheels.push(addWheel(tilt, 0, 0.38, -0.86, 0.38, 0.18));
        lights(0.5, 0.95, 0.96);
        tilt.add(mergedBoxes([
          [0.07, 0.07, 0.9, -0.12, 0.85, 1.28, 0.28], [0.07, 0.07, 0.9, 0.12, 0.85, 1.28, 0.28],
          [0.5, 0.22, 0.5, 0, 0.62, 0.1],
          [0.42, 0.16, 0.7, 0, 1.12, -0.45],
          [0.07, 0.5, 0.07, -0.52, 1.45, 0.62], [0.07, 0.5, 0.07, 0.52, 1.45, 0.62],
          [0.07, 0.55, 0.07, -0.55, 1.35, -0.7], [0.07, 0.55, 0.07, 0.55, 1.35, -0.7],
          [0.8, 0.06, 0.1, 0, 0.25, -1.0]
        ], trimMat));
        tilt.add(mergedBoxes([
          [0.06, 0.9, 0.06, -0.14, 0.9, 1.25, 0.28], [0.06, 0.9, 0.06, 0.14, 0.9, 1.25, 0.28],
          [0.05, 0.05, 0.7, -0.4, 1.06, -0.9], [0.05, 0.05, 0.7, 0.4, 1.06, -0.9],
          [0.18, 0.12, 0.12, -0.62, 1.72, 0.62], [0.18, 0.12, 0.12, 0.62, 1.72, 0.62],
          [0.1, 0.1, 0.45, -0.62, 1.78, 0.72], [0.1, 0.1, 0.45, 0.62, 1.78, 0.72],
          [0.35, 0.25, 0.35, 0, 0.98, 1.0]
        ], chromeMat));
      } else if (key === 'atv') {
        tilt.add(box(1.45, 0.55, 2.0, bodyMat, 0, 0.95, 0));
        tilt.add(box(1.2, 0.22, 0.9, tyreMat, 0, 1.32, -0.25));
        tilt.add(box(1.25, 0.16, 0.7, bodyMat, 0, 1.18, 0.72));
        tilt.add(box(1.5, 0.09, 0.09, chromeMat, 0, 1.55, 0.6));
        for (const x of [-0.72, 0.72]) {
          wheels.push(addWheel(tilt, x, 0.55, 0.82, 0.55, 0.42));
          wheels.push(addWheel(tilt, x, 0.55, -0.82, 0.55, 0.42));
          tilt.add(box(0.1, 0.5, 0.1, chromeMat, x * 0.9, 1.28, 0.6));
        }
        lights(1.3, 1.05, 1.02);
      } else if (key === 'cart') {
        tilt.add(box(1.45, 0.72, 2.25, bodyMat, 0, 0.82, 0));
        tilt.add(box(1.35, 0.12, 1.1, tyreMat, 0, 1.24, -0.3));
        tilt.add(box(1.35, 0.12, 0.7, tyreMat, 0, 1.24, 0.72));
        for (const x of [-0.68, 0.68]) {
          tilt.add(box(0.09, 0.85, 0.09, chromeMat, x, 1.55, 0.75));
          tilt.add(box(0.09, 0.85, 0.09, chromeMat, x, 1.55, -0.75));
        }
        tilt.add(box(1.65, 0.12, 2.3, darkMat, 0, 2.0, 0));
        const glass = box(1.4, 0.55, 0.06, glassMat, 0, 1.6, 1.02);
        tilt.add(glass);
        for (const x of [-0.76, 0.76]) for (const z of [-0.78, 0.78]) {
          wheels.push(addWheel(tilt, x, 0.34, z, 0.34, 0.22));
        }
        lights(1.2, 0.95, 1.14);
        tilt.add(mergedBoxes([
          [1.3, 0.12, 0.5, 0, 1.16, -0.35], [1.3, 0.12, 0.5, 0, 1.16, 0.72],
          [0.5, 0.16, 0.35, 0, 0.98, 0.2], [1.2, 0.1, 0.4, 0, 0.9, -1.0]
        ], trimMat));
        tilt.add(mergedBoxes([
          [0.07, 0.9, 0.07, -0.75, 1.65, 1.02], [0.07, 0.9, 0.07, 0.75, 1.65, 1.02],
          [1.6, 0.08, 0.08, 0, 2.06, 1.02],
          [0.35, 0.3, 0.1, -0.36, 1.3, 0.28], [0.1, 0.1, 0.45, -0.36, 1.3, 0.5],
          [0.5, 0.2, 0.45, 0, 1.35, -1.0]
        ], chromeMat));
        const cartWheel = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.03, 5, 12), trimMat);
        cartWheel.position.set(-0.36, 1.35, 0.58); cartWheel.rotation.y = 0.5; tilt.add(cartWheel);
      } else if (key === 'car') {
        tilt.add(box(1.9, 0.62, 4.3, bodyMat, 0, 0.78, 0));
        tilt.add(box(1.68, 0.72, 2.15, darkMat, 0, 1.42, -0.25));
        const wind = box(1.55, 0.62, 0.08, glassMat, 0, 1.48, 0.86);
        wind.rotation.x = -0.3;
        tilt.add(wind);
        const rearGlass = box(1.5, 0.5, 0.08, glassMat, 0, 1.48, -1.32);
        rearGlass.rotation.x = 0.25;
        tilt.add(rearGlass);
        tilt.add(box(1.95, 0.14, 0.22, chromeMat, 0, 0.7, 2.16));
        tilt.add(box(1.95, 0.14, 0.22, chromeMat, 0, 0.7, -2.16));
        for (const x of [-0.96, 0.96]) for (const z of [-1.45, 1.45]) {
          wheels.push(addWheel(tilt, x, 0.42, z, 0.42, 0.3));
        }
        lights(1.7, 0.95, 2.18);
        // Side glass, pillars, seams, arches and lamps.
        tilt.add(mergedBoxes([
          [0.05, 0.46, 0.95, -0.94, 1.5, 0.35], [0.05, 0.46, 0.95, 0.94, 1.5, 0.35],
          [0.05, 0.5, 0.9, -0.94, 1.5, -0.72], [0.05, 0.5, 0.9, 0.94, 1.5, -0.72]
        ], glassMat));
        tilt.add(mergedBoxes([
          [0.07, 0.68, 0.11, -0.94, 1.45, 0.9, -0.3], [0.07, 0.68, 0.11, 0.94, 1.45, 0.9, -0.3],
          [0.07, 0.62, 0.11, -0.94, 1.45, -0.2], [0.07, 0.62, 0.11, 0.94, 1.45, -0.2],
          [0.04, 0.58, 0.05, -0.97, 0.86, -0.28], [0.04, 0.58, 0.05, 0.97, 0.86, -0.28],
          [0.12, 0.16, 1.14, -0.99, 0.79, 1.45], [0.12, 0.16, 1.14, 0.99, 0.79, 1.45],
          [0.12, 0.16, 1.14, -0.99, 0.79, -1.45], [0.12, 0.16, 1.14, 0.99, 0.79, -1.45],
          [1.3, 0.3, 0.08, 0, 0.74, 2.19],
          [1.0, 0.035, 0.05, -0.32, 1.18, 0.91, 0, 0.16],
          [1.0, 0.035, 0.05, 0.32, 1.18, 0.91, 0, -0.16],
          [0.6, 0.16, 0.5, -0.48, 0.95, -0.5], [0.6, 0.16, 0.5, 0.48, 0.95, -0.5],
          [1.5, 0.18, 0.45, 0, 1.0, 0.62]
        ], trimMat));
        tilt.add(mergedBoxes([
          [1.15, 0.045, 0.07, 0, 0.84, 2.24], [1.15, 0.045, 0.07, 0, 0.7, 2.24],
          [1.15, 0.045, 0.07, 0, 0.58, 2.24],
          [0.06, 0.06, 0.85, -0.99, 0.7, 0], [0.06, 0.06, 0.85, 0.99, 0.7, 0],
          [0.24, 0.07, 0.09, -0.98, 0.94, 0.24], [0.24, 0.07, 0.09, 0.98, 0.94, 0.24],
          [0.24, 0.07, 0.09, -0.98, 0.94, -0.72], [0.24, 0.07, 0.09, 0.98, 0.94, -0.72],
          [0.07, 0.07, 0.26, -1.06, 1.36, 0.72], [0.07, 0.07, 0.26, 1.06, 1.36, 0.72],
          [0.26, 0.17, 0.1, -1.16, 1.4, 0.78], [0.26, 0.17, 0.1, 1.16, 1.4, 0.78],
          [0.55, 0.24, 0.04, 0, 0.58, 2.26],
          [0.18, 0.18, 0.35, -0.72, 0.42, -2.25]
        ], chromeMat));
        tilt.add(mergedBoxes([
          [0.16, 0.12, 0.08, -0.68, 0.94, 2.2], [0.16, 0.12, 0.08, 0.68, 0.94, 2.2],
          [0.16, 0.1, 0.08, -0.68, 0.9, -2.2], [0.16, 0.1, 0.08, 0.68, 0.9, -2.2]
        ], amberMat));
        const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.035, 5, 12), trimMat);
        wheel.position.set(-0.48, 1.16, 0.62); wheel.rotation.y = 0.5; tilt.add(wheel);
      } else if (key === 'truck') {
        // Truck.
        tilt.add(box(2.1, 0.78, 5.3, bodyMat, 0, 1.08, 0));
        tilt.add(box(1.95, 1.05, 1.85, bodyMat, 0, 1.95, 1.5));
        const wind = box(1.75, 0.72, 0.08, glassMat, 0, 2.1, 2.44);
        wind.rotation.x = -0.22;
        tilt.add(wind);
        tilt.add(box(1.85, 0.55, 0.09, glassMat, 0, 2.1, -2.65));
        tilt.add(box(2.15, 0.16, 0.25, chromeMat, 0, 0.95, 2.7));
        for (const x of [-1.04, 1.04]) {
          tilt.add(box(0.12, 0.65, 2.9, darkMat, x, 1.62, -1.15));
          wheels.push(addWheel(tilt, x, 0.55, 1.75, 0.55, 0.36));
          wheels.push(addWheel(tilt, x, 0.55, -1.75, 0.55, 0.36));
        }
        tilt.add(box(1.9, 0.12, 2.9, darkMat, 0, 1.48, -1.15));
        lights(1.85, 1.32, 2.72);
        // Cab glass, bed rails, mirrors, grille and work-truck extras.
        tilt.add(mergedBoxes([
          [0.05, 0.55, 1.1, -1.0, 2.12, 1.5], [0.05, 0.55, 1.1, 1.0, 2.12, 1.5]
        ], glassMat));
        tilt.add(mergedBoxes([
          [0.08, 0.8, 0.12, -1.0, 2.05, 2.42, -0.22], [0.08, 0.8, 0.12, 1.0, 2.05, 2.42, -0.22],
          [0.06, 0.7, 0.06, -1.06, 1.6, -1.15], [0.06, 0.7, 0.06, 1.06, 1.6, -1.15],
          [1.5, 0.28, 0.08, 0, 1.12, 2.73],
          [0.75, 0.16, 0.5, -0.55, 1.62, 1.45], [0.75, 0.16, 0.5, 0.55, 1.62, 1.45],
          [2.1, 0.2, 0.12, 0, 2.1, 0.55]
        ], trimMat));
        tilt.add(mergedBoxes([
          [1.5, 0.05, 0.08, 0, 1.2, 2.78], [1.5, 0.05, 0.08, 0, 1.04, 2.78],
          [0.28, 0.08, 0.1, -1.02, 1.66, 1.65], [0.28, 0.08, 0.1, 1.02, 1.66, 1.65],
          [0.1, 0.1, 0.42, -1.2, 1.78, 1.7], [0.1, 0.1, 0.42, 1.2, 1.78, 1.7],
          [0.42, 0.34, 0.12, -1.32, 1.9, 1.72], [0.42, 0.34, 0.12, 1.32, 1.9, 1.72],
          [2.4, 0.12, 0.14, -1.12, 0.72, 0.4], [2.4, 0.12, 0.14, 1.12, 0.72, 0.4],
          [0.6, 0.26, 0.05, 0, 1.0, 2.78],
          [0.22, 0.22, 0.4, 0.86, 1.85, -2.3]
        ], chromeMat));
        tilt.add(mergedBoxes([
          [0.2, 0.14, 0.08, -0.78, 1.4, 2.76], [0.2, 0.14, 0.08, 0.78, 1.4, 2.76],
          [0.2, 0.12, 0.08, -0.78, 1.3, -2.7], [0.2, 0.12, 0.08, 0.78, 1.3, -2.7],
          [0.18, 0.12, 0.1, -0.6, 2.36, 2.3], [0.18, 0.12, 0.1, 0.6, 2.36, 2.3]
        ], amberMat));
      } else if (key === 'boat') {
        // Small outboard runabout — no wheels, a pointed bow and an open deck.
        const deckMat = paint(0xd9c8a2);
        const trimMat = paint(0x3c7fa5);
        tilt.add(box(2.35, 0.72, 5.0, bodyMat, 0, 0.42, 0));
        const bow = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 1.18, 2.6, 4), bodyMat);
        bow.rotation.x = Math.PI / 2;
        bow.rotation.y = Math.PI / 4;
        bow.position.set(0, 0.42, 3.55);
        bow.castShadow = true; bow.receiveShadow = true;
        tilt.add(bow);
        tilt.add(box(2.05, 0.12, 5.5, deckMat, 0, 0.83, 0.25));
        // Console, windscreen and bench seats.
        tilt.add(box(1.5, 0.5, 0.65, darkMat, 0, 1.2, 0.25));
        const screen = box(1.62, 0.72, 0.07, glassMat, 0, 1.65, 0.62);
        screen.rotation.x = -0.22;
        tilt.add(screen);
        for (const z of [-0.6, -1.55]) tilt.add(box(1.55, 0.2, 0.68, trimMat, 0, 1.02, z));
        // Stern motor and propeller.
        tilt.add(box(1.5, 0.65, 0.22, darkMat, 0, 1.0, -2.6));
        tilt.add(box(0.55, 0.8, 0.55, darkMat, 0, 0.62, -2.95));
        const prop = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.07, 8), chromeMat);
        prop.rotation.x = Math.PI / 2;
        prop.position.set(0, 0.44, -3.3);
        tilt.add(prop);
        // Rails and navigation lights.
        for (const s of [-1, 1]) {
          tilt.add(box(0.07, 0.07, 4.7, chromeMat, s * 1.16, 1.18, 0.3));
          for (const z of [-1.9, 0.1, 2.0]) tilt.add(box(0.07, 0.58, 0.07, chromeMat, s * 1.16, 0.92, z));
        }
        const navMat = new THREE.MeshStandardMaterial({
          color: 0xff5a44, emissive: 0xff3b22, emissiveIntensity: 1.4, flatShading: true
        });
        tilt.add(box(0.14, 0.14, 0.14, navMat, -0.95, 1.06, 2.3));
        tilt.add(box(0.14, 0.14, 0.14, navMat, 0.95, 1.06, 2.3));
      } else if (key === 'jetpack') {
        // GTA-style jetpack: backpack, twin nozzles, straps, and a small pilot silhouette.
        const packMat = paint(0x55616d);
        const nozzleMat = paint(0x2b333b);
        const flameMat = new THREE.MeshBasicMaterial({ color: 0xff7a2d, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
        tilt.add(box(0.72, 0.82, 0.42, packMat, 0, 1.18, -0.12));
        tilt.add(box(0.54, 0.18, 0.28, chromeMat, 0, 1.62, -0.08));
        for (const s of [-1, 1]) {
          tilt.add(box(0.18, 0.72, 0.18, nozzleMat, s * 0.22, 0.72, -0.16));
          const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.16, 0.22, 8), chromeMat);
          nozzle.position.set(s * 0.22, 0.34, -0.16);
          tilt.add(nozzle);
          const flame = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.55, 7), flameMat.clone());
          flame.rotation.x = Math.PI;
          flame.position.set(s * 0.22, 0.02, -0.16);
          flame.visible = false;
          tilt.add(flame);
          (spin.flames || (spin.flames = [])).push(flame);
        }
        tilt.add(box(0.18, 0.08, 0.42, chromeMat, -0.26, 1.08, 0.12));
        tilt.add(box(0.18, 0.08, 0.42, chromeMat, 0.26, 1.08, 0.12));
        tilt.add(box(0.34, 0.36, 0.28, paint(0x3f6fb8), 0, 1.16, 0.14));
        tilt.add(box(0.26, 0.26, 0.24, paint(0xe6c7a8), 0, 1.52, 0.12));
        tilt.add(box(0.18, 0.34, 0.18, paint(0x2d353d), -0.16, 0.78, 0.08));
        tilt.add(box(0.18, 0.34, 0.18, paint(0x2d353d), 0.16, 0.78, 0.08));
        tilt.add(box(0.14, 0.38, 0.14, paint(0x3f6fb8), -0.34, 1.0, 0.08));
        tilt.add(box(0.14, 0.38, 0.14, paint(0x3f6fb8), 0.34, 1.0, 0.08));
      } else if (key === 'plane') {
        // Parked/player light aircraft: broad wings, tail fin and a spinning prop.
        const accent = paint(0xc75040);
        const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.38, 9.2, 10), bodyMat);
        fuse.rotation.x = Math.PI / 2; fuse.position.y = 0.25; fuse.castShadow = true;
        tilt.add(fuse);
        const nose = new THREE.Mesh(new THREE.ConeGeometry(0.46, 1.4, 10), accent);
        nose.rotation.x = Math.PI / 2; nose.position.set(0, 0.25, 5.25); tilt.add(nose);
        tilt.add(box(13.4, 0.22, 1.9, bodyMat, 0, 0.08, 0.5));
        tilt.add(box(4.8, 0.18, 1.3, bodyMat, 0, 0.12, -4.0));
        tilt.add(box(0.18, 2.0, 1.45, accent, 0, 1.12, -4.25));
        const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.72, 10, 7), glassMat);
        canopy.scale.set(0.85, 0.62, 1.6); canopy.position.set(0, 0.85, 1.45); tilt.add(canopy);
        for (const s of [-1, 1]) {
          tilt.add(box(0.16, 0.7, 0.45, accent, s * 6.3, 0.12, 0.5));
          const wheel = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 6), tyreMat);
          wheel.position.set(s * 1.5, -0.3, 1.1); tilt.add(wheel);
        }
        const tailWheel = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), tyreMat);
        tailWheel.position.set(0, -0.2, -4.6); tilt.add(tailWheel);
        spin.prop = new THREE.Group();
        spin.prop.add(box(0.16, 3.1, 0.1, trimMat, 0, 0, 0));
        spin.prop.add(box(3.1, 0.16, 0.1, trimMat, 0, 0, 0));
        spin.prop.position.set(0, 0.25, 6.05); tilt.add(spin.prop);
      } else if (key === 'helicopter') {
        const body = new THREE.Mesh(new THREE.SphereGeometry(1.25, 12, 8), bodyMat);
        body.scale.set(1.05, 0.86, 1.9); body.position.y = 0.3; body.castShadow = true;
        tilt.add(body);
        const bubble = new THREE.Mesh(new THREE.SphereGeometry(0.85, 12, 8), glassMat);
        bubble.scale.set(0.9, 0.8, 1.15); bubble.position.set(0, 0.5, 1.55); tilt.add(bubble);
        tilt.add(box(0.44, 0.44, 5.0, bodyMat, 0, 0.45, -3.0));
        tilt.add(box(0.14, 1.5, 0.85, bodyMat, 0, 1.1, -5.1));
        for (const s of [-1, 1]) {
          tilt.add(box(0.14, 0.14, 4.2, chromeMat, s * 1.05, -1.15, 0));
          for (const z of [-1.2, 1.2]) tilt.add(box(0.12, 0.95, 0.12, chromeMat, s * 1.05, -0.7, z));
        }
        spin.rotor = new THREE.Group();
        spin.rotor.add(box(10.5, 0.12, 0.32, trimMat, 0, 0, 0));
        spin.rotor.add(box(0.32, 0.12, 10.5, trimMat, 0, 0, 0));
        spin.rotor.position.y = 1.75; tilt.add(spin.rotor);
        spin.tailRotor = new THREE.Group();
        spin.tailRotor.add(box(0.1, 1.9, 0.12, trimMat, 0, 0, 0));
        spin.tailRotor.add(box(0.1, 0.12, 1.9, trimMat, 0, 0, 0));
        spin.tailRotor.position.set(0.3, 1.1, -5.15); tilt.add(spin.tailRotor);
      } else if (key === 'fpv') {
        // Small FPV racing quad. The player normally hides this body while in
        // goggles, but it still provides a shadow and a visible drone for NPCs.
        const accent = paint(0xff6b3d);
        const shell = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.24, 1.05), bodyMat);
        shell.castShadow = true; tilt.add(shell);
        const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), glassMat);
        canopy.scale.set(1, 0.7, 1.35); canopy.position.set(0, 0.2, 0.34); tilt.add(canopy);
        tilt.add(box(0.18, 0.12, 0.32, accent, 0, 0.02, 0.72));
        spin.rotors = [];
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          const arm = box(0.11, 0.1, 1.35, trimMat, sx * 0.475, 0, sz * 0.475);
          arm.rotation.y = Math.atan2(sx, sz);
          tilt.add(arm);
          const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.2, 8), bodyMat);
          pod.position.set(sx * 0.95, 0.06, sz * 0.95); tilt.add(pod);
          const rotor = new THREE.Group();
          rotor.add(box(0.9, 0.035, 0.075, trimMat, 0, 0.14, 0));
          rotor.add(box(0.075, 0.035, 0.9, trimMat, 0, 0.14, 0));
          rotor.position.set(sx * 0.95, 0.06, sz * 0.95);
          tilt.add(rotor);
          spin.rotors.push(rotor);
          const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5),
            new THREE.MeshStandardMaterial({
              color: sz > 0 ? 0x7dffb2 : 0xff4d5e,
              emissive: sz > 0 ? 0x35ff8a : 0xff2038,
              emissiveIntensity: 1.8
            }));
          lamp.position.set(sx * 0.95, 0.06, sz * 1.22); tilt.add(lamp);
        }
      }

      const blob = (CC.EnvironmentManager && !spec.flying && key !== 'boat')
        ? CC.EnvironmentManager.attachBlobShadow(
          group, spec.radius * 2.35, -spec.wheelRadius + 0.035, spec.radius * 3.1)
        : null;
      return { group, tilt, wheels, brakeMat, headMat, beams, blob, spec, key, spin };
    }
  });

  /* ---------- player vehicle ---------- */
  class Vehicle {
    constructor(key, scene) {
      this.key = key;
      this.spec = CC.vehicleSpecs[key];
      this.visual = Factory.build(key);
      this.assetModel = this.visual.assetModel || null;
      this.group = this.visual.group;
      this.tilt = this.visual.tilt;
      this.wheels = this.visual.wheels;
      this.brakeMat = this.visual.brakeMat;
      scene.add(this.group);

      this.pos = new THREE.Vector3();
      this.heading = 0;
      this.speed = 0;
      this.latVel = 0;
      this.vy = 0;
      this.airborne = false;
      this.steerSmoothed = 0;
      this.bob = 0;
      this.dustTimer = 0;
      this.lastSafe = new THREE.Vector3();
      this.needReset = false;
      this.crashFlash = 0;
      this.damage = 0;
      this.damageStage = 0;
      // A few impacts only dent the car; later ones smoke, burn and blow.
      this.crashCount = 0;
      this.crashCooldown = 0;
      this.fuse = 0;
      this.exploded = false;
      this.damageFx = buildDamageFx(this.group);
      this.exhaustTimer = Math.random() * 0.2;
      this.heavySmoker = false;
      this.setVisible(false);
    }

    setVisible(v) { this.group.visible = v; }

    clearDamage() {
      this.damage = 0;
      this.damageStage = 0;
      this.crashCount = 0;
      this.crashCooldown = 0;
      this.fuse = 0;
      this.exploded = false;
      this.damageFx.smoke.forEach(function (m) { m.material.opacity = 0; });
      this.damageFx.flames.forEach(function (m) { m.material.opacity = 0; });
      this.damageFx.group.visible = false;
    }

    registerCrash(impact) {
      if (this.exploded || this.spec.water || this.crashCooldown > 0) return;
      const amount = U.clamp((impact - 8) / 45, 0.04, 0.18);
      this.damage = U.clamp(this.damage + amount, 0, 1);
      this.crashCount++;
      this.crashCooldown = 0.7;
      // The first couple of knocks only hurt performance. Eight knocks — or a
      // pile of very hard hits — light the engine and start the short fuse.
      if ((this.crashCount >= 8 || this.damage >= 1) && this.fuse <= 0) {
        this.fuse = 6;
        this.damageStage = 3;
        if (CC.Game && CC.Game.showMessage) {
          CC.Game.showMessage('Engine fire — get out before it blows!', 3.4);
        }
      }
    }

    explode(world) {
      if (this.exploded) return;
      this.exploded = true;
      if (world && world.particles) {
        world.particles.spawn(this.pos.x, this.pos.y + 1.1, this.pos.z, 34, 0xff8a24, 1.8);
        world.particles.spawn(this.pos.x, this.pos.y + 1.5, this.pos.z, 22, 0x3c3e3e, 1.3);
        world.particles.spawn(this.pos.x, this.pos.y + 0.8, this.pos.z, 14, 0xffefc2, 1.1);
      }
      if (CC.Audio && CC.Audio.explosion) CC.Audio.explosion();
      const active = CC.Game && CC.Game.vehicles && CC.Game.vehicles[CC.Game.activeKey] === this;
      this.setVisible(false);
      if (active && CC.Game && CC.Game.wasted) CC.Game.wasted('crash fire explosion');
    }

    updateDamage(dt, world, time) {
      if (this.exploded) return;
      this.crashCooldown = Math.max(0, this.crashCooldown - dt);
      const smoking = this.crashCount >= 3 || this.damage >= 0.4;
      const burning = this.crashCount >= 5 || this.damage >= 0.7;
      const stage = this.fuse > 0 ? 3 : burning ? 2 : smoking ? 1 : 0;
      if (stage > this.damageStage && CC.Game && CC.Game.showMessage) {
        if (stage === 1) CC.Game.showMessage('Smoke pouring from the engine — find a repair soon', 2.6);
        else if (stage === 2) CC.Game.showMessage('Engine fire! Bail out now', 2.6);
      }
      const prevStage = this.damageStage;
      this.damageStage = stage;
      if (this.fuse > 0) {
        this.fuse -= dt;
        if (this.fuse <= 0) { this.explode(world); return; }
      }
      // Undamaged cars are the norm. Their smoke/flame meshes are already at
      // zero opacity, so skip sixteen transform and material writes per frame.
      if (stage === 0) {
        if (prevStage > 0) {
          this.damageFx.smoke.forEach(function (m) { m.material.opacity = 0; });
          this.damageFx.flames.forEach(function (m) { m.material.opacity = 0; });
          this.damageFx.group.visible = false;
        }
        return;
      }
      this.damageFx.group.visible = true;
      const smokeAmt = this.fuse > 0 ? 1 : burning ? 0.95
        : U.clamp(0.45 + (this.damage - 0.4) * 1.4, 0.45, 0.85);
      const fireAmt = (stage >= 2 || this.fuse > 0)
        ? U.clamp(0.7 + (this.damage - 0.7) * 1.2, 0.55, 1) : 0;
      const showSmoke = smokeAmt > 0;
      this.damageFx.smoke.forEach(function (m) {
        const d = m.userData;
        const rise = (time * 0.5 + d.phase) % 2;
        m.visible = showSmoke;
        if (!showSmoke) return;
        m.position.set(d.bx + Math.sin(time * 1.4 + d.phase) * 0.25,
          1.05 + rise * 1.8, d.bz + Math.cos(time * 1.1 + d.phase) * 0.2);
        m.scale.setScalar(d.base * (0.6 + rise * 0.9));
        m.material.opacity = smokeAmt * Math.max(0, 0.42 - rise * 0.18);
      });
      const showFlames = fireAmt > 0;
      this.damageFx.flames.forEach(function (m) {
        const d = m.userData;
        const flick = 0.55 + 0.45 * Math.sin(time * 12 + d.phase);
        m.visible = showFlames;
        if (!showFlames) return;
        m.scale.set(d.base, d.base * (0.7 + flick * 0.7), d.base);
        m.material.opacity = fireAmt * (0.45 + flick * 0.45);
      });
      // Occasional damaged vehicles belch extra smoke.
      if (world && world.particles && stage > 0 && this.heavySmoker) {
        this.exhaustTimer -= dt;
        if (this.exhaustTimer <= 0) {
          this.exhaustTimer = 0.06 + Math.random() * 0.08;
          const f = this.forward();
          world.particles.spawn(
            this.pos.x - f.x * this.spec.length * 0.55,
            this.pos.y + 0.5, this.pos.z - f.z * this.spec.length * 0.55,
            1, stage >= 2 ? 0x2a2c2d : 0x666a6d, 0.7
          );
        }
      }
    }

    setPose(x, z, heading, speed) {
      const y = this.spec.water
        ? (CC.RetroWater ? CC.RetroWater.waterYFor(x, z, 0, 0.25) : C.SEA_LEVEL + 0.25)
        : CC.heightAt(x, z) + this.spec.wheelRadius;
      this.pos.set(x, y, z);
      this.heading = heading || 0;
      this.speed = speed || 0;
      this.latVel = 0; this.vy = 0; this.airborne = false;
      this.lastSafe.copy(this.pos);
      this.syncMesh(0);
    }

    forward() {
      const f = this._fwd || (this._fwd = { x: 0, z: 0 });
      f.x = Math.sin(this.heading); f.z = Math.cos(this.heading);
      return f;
    }

    reset(world) {
      this.clearDamage();
      if (this.spec.water) {
        const marina = CC.marinaSpawn || { x: -318, z: 103, heading: -Math.PI / 2 };
        const river = CC.riverBoatSpawn || { x: -275, z: 278, heading: Math.PI / 2 };
        const riverD = U.distance2D(this.pos.x, this.pos.z, river.x, river.z);
        const marinaD = U.distance2D(this.pos.x, this.pos.z, marina.x, marina.z);
        const spawn = riverD < marinaD ? river : marina;
        this.setPose(spawn.x, spawn.z, spawn.heading, 0);
        if (world && world.particles) {
          world.particles.spawn(spawn.x, CC.RetroWater ? CC.RetroWater.waterYFor(spawn.x, spawn.z, (CC.Game && CC.Game.time) || 0, 0.3) : C.SEA_LEVEL + 0.3, spawn.z, 14, C.COLORS.foam, 0.9);
        }
        this.crashFlash = 0.5;
        return;
      }
      const nr = CC.nearestRoad(this.pos.x, this.pos.z, 'paved') || CC.nearestRoad(this.pos.x, this.pos.z);
      if (nr) {
        const x = nr.x + nr.dx * 0, z = nr.z + nr.dz * 0;
        this.setPose(x, z, Math.atan2(nr.dx, nr.dz), 0);
      } else {
        this.setPose(0, 0, 0, 0);
      }
      if (world && world.particles) {
        world.particles.spawn(this.pos.x, this.pos.y, this.pos.z, 18, 0xf2e2bd, 1.2);
      }
      this.crashFlash = 0.8;
    }

    update(dt, input, world, time) {
      const spec = this.spec;
      const boat = !!spec.water;
      const surface = boat ? 'water' : CC.surfaceAt(this.pos.x, this.pos.z);
      this.inWater = boat;
      let offFactor = 1;
      if (!boat) {
        if (surface === 'sand') offFactor = spec.sandFactor;
        else if (surface === 'grass') offFactor = spec.grassFactor;
        else if (surface === 'marsh') offFactor = Math.min(1, spec.grassFactor * 0.75);
        else if (surface === 'water') offFactor = 0.35;
        else if (surface === 'boardwalk') offFactor = Math.min(1, spec.grassFactor + 0.1);
      }

      const boost = !!input.boost;
      const pace = CC.pace ? CC.pace.vehicle : 1;
      const maxSpeed = spec.maxSpeed * pace * offFactor * (boost ? spec.boost : 1);
      const accel = spec.accel * pace * offFactor * (boost ? 1.55 : 1);
      const brakeForce = spec.brake * pace * offFactor;

      if (input.throttle > 0) this.speed += accel * dt;
      else if (input.throttle < 0) {
        if (this.speed > 0.5) this.speed -= brakeForce * dt;
        else this.speed -= accel * 0.75 * dt;
      } else {
        this.speed -= this.speed * Math.min(1, 0.9 * dt);
      }
      // Air/rolling drag.
      this.speed -= this.speed * Math.abs(this.speed) * 0.0016 * dt;
      // Reverse still reads as a lower gear, but close enough to forward that
      // backing down the map no longer looks half speed.
      this.speed = U.clamp(this.speed, -maxSpeed * 0.72, maxSpeed);

      const speedAbs = Math.abs(this.speed);
      const speedFactor = U.clamp(speedAbs / 7, 0, 1);
      // A small steering boost keeps the same turning feel now that everyone
      // covers more ground, without making the bikes twitchy at low speed.
      const turnPace = 1 + (pace - 1) * 0.45;
      const steerRate = spec.turn * turnPace * speedFactor * (this.speed < -0.2 ? -1 : 1);
      this.steerSmoothed = U.damp(this.steerSmoothed, input.steer, 9, dt);
      this.heading += this.steerSmoothed * steerRate * dt * (input.handbrake ? 1.18 : 1);

      // Lateral slip / drift model.
      const grip = input.handbrake ? spec.driftGrip : spec.grip;
      this.latVel -= this.latVel * Math.min(1, grip * dt);
      if (input.handbrake && speedAbs > 5) {
        this.latVel += this.steerSmoothed * this.speed * 0.85 * dt;
      }
      this.latVel = U.clamp(this.latVel, -14, 14);

      const fwd = this.forward();
      const right = this._right || (this._right = { x: 0, z: 0 });
      right.x = Math.cos(this.heading); right.z = -Math.sin(this.heading);
      const prevX = this.pos.x, prevZ = this.pos.z;
      this.pos.x += (fwd.x * this.speed + right.x * this.latVel) * dt;
      this.pos.z += (fwd.z * this.speed + right.z * this.latVel) * dt;

      if (boat) {
        // Boats stay on the waterline and bounce off the shore instead of
        // falling through the terrain or being teleported by the land safety net.
        // Keep a few metres of depth under the hull so boats cannot beach
        // themselves on the sand at the waterline.
        const inWater = CC.coast.isWater(this.pos.x, this.pos.z) &&
          CC.coast.distanceToWater(this.pos.x, this.pos.z) < -8 &&
          this.pos.x > C.WORLD.minX + 3 && this.pos.x < C.WORLD.maxX - 3 &&
          this.pos.z > C.WORLD.minZ + 3 && this.pos.z < C.WORLD.maxZ - 3;
        if (!inWater) {
          this.pos.x = prevX; this.pos.z = prevZ;
          this.speed *= -0.25;
          this.latVel *= -0.3;
          if (world && world.particles) world.particles.spawn(
            this.pos.x, CC.RetroWater ? CC.RetroWater.waterYFor(this.pos.x, this.pos.z, time, 0.4) : C.SEA_LEVEL + 0.4,
            this.pos.z, 8, C.COLORS.foam, 0.8);
        } else {
          this.lastSafe.copy(this.pos);
        }
        this.applyWaterBuoyancy(dt, time, true);
        this.airborne = false;
      } else {
        // Ground, suspension and jumps.
        const ground = CC.underpassVehicleHeightAt
          ? CC.underpassVehicleHeightAt(this.pos.x, this.pos.z, this.heading, spec.wheelRadius)
          : CC.heightAt(this.pos.x, this.pos.z) + spec.wheelRadius;
        if (this.pos.y <= ground + 0.06) {
          if (this.airborne && this.vy < -6 && world && world.particles) {
            world.particles.spawn(this.pos.x, ground, this.pos.z, 8, 0xe8d4a2, 0.7);
          }
          this.pos.y = ground;
          this.vy = 0;
          this.airborne = false;
        } else {
          this.vy -= C.GRAVITY * dt;
          this.pos.y += this.vy * dt;
          this.airborne = true;
        }

        // Cresting a dune at speed launches the vehicle a little.
        if (!this.airborne && speedAbs > 10 && surface !== 'paved') {
          const ahead = CC.heightAt(this.pos.x + fwd.x * 2.5, this.pos.z + fwd.z * 2.5);
          const here = CC.heightAt(this.pos.x, this.pos.z);
          if (here - ahead > 0.55) { this.vy = (here - ahead) * 2.6; this.airborne = true; }
        }

        this.handleCollisions(world, speedAbs, surface);
        if (this.needReset) { this.reset(world); this.needReset = false; }

        if (surface === 'paved' || surface === 'gravel' || surface === 'dirt') this.lastSafe.copy(this.pos);
        const bridge = CC.coast.onBridge && CC.coast.onBridge(this.pos.x, this.pos.z, 1);
        const waterDepth = bridge ? 1 : CC.coast.distanceToWater(this.pos.x, this.pos.z);
        if (!bridge && surface === 'water') {
          // Let the car wallow in the shared wave field briefly before the
          // deep-water safety net recovers it, so entering a river reads as a
          // splash and sink rather than an instant teleport.
          this.waterTime = (this.waterTime || 0) + dt;
          this.applyWaterBuoyancy(dt, time, false);
        } else {
          this.waterTime = 0;
          if (this._buoyAng) { this._buoyAng.x *= 0.9; this._buoyAng.z *= 0.9; }
        }
        if (!bridge && waterDepth < -14 && this.waterTime > 1.1) {
          this.pos.copy(this.lastSafe);
          this.speed *= 0.2;
          this.waterTime = 0;
          if (this._buoyAng) { this._buoyAng.x = 0; this._buoyAng.z = 0; }
          if (world && world.particles) world.particles.spawn(this.pos.x, this.pos.y + 0.5, this.pos.z, 16, 0xeaf7f5, 1.1);
        }
      }

      // Dust / spray.
      this.dustTimer -= dt;
      if (this.dustTimer <= 0 && speedAbs > 4 && world && world.particles) {
        if (boat) {
          const back = this._back || (this._back = { x: 0, z: 0 });
          back.x = -fwd.x * 3.0; back.z = -fwd.z * 3.0;
          const sx = this.pos.x + back.x, sz = this.pos.z + back.z;
          world.particles.spawn(
            sx, CC.RetroWater ? CC.RetroWater.waterYFor(sx, sz, time, 0.15) : C.SEA_LEVEL + 0.15,
            sz, 4, C.COLORS.foam, 0.55 + speedAbs * 0.02
          );
          this.dustTimer = 0.05;
        } else {
          const rough = surface === 'sand' || surface === 'grass' || surface === 'gravel' || surface === 'dirt';
          const sliding = input.handbrake && speedAbs > 9;
          if (rough || sliding) {
            const back = this._back || (this._back = { x: 0, z: 0 });
            back.x = -fwd.x * spec.wheelRadius * 2.2;
            back.z = -fwd.z * spec.wheelRadius * 2.2;
            const color = surface === 'gravel' ? 0xb9a98b : C.COLORS.sand;
            world.particles.spawn(
              this.pos.x + back.x, this.pos.y - spec.wheelRadius * 0.5, this.pos.z + back.z,
              sliding ? 4 : 3, color, rough ? 0.8 + speedAbs * 0.018 : 0.7
            );
            this.dustTimer = 0.045;
          }
        }
      }

      this.updateDamage(dt, world, time);
      if (this.exploded) return surface;
      this.syncMesh(dt, input, speedAbs, surface);
      return surface;
    }

    handleCollisions(world, impact, surface) {
      if (!world) return;
      const r = this.spec.radius;
      const oldX = this.pos.x, oldZ = this.pos.z;
      // Cars never pass through scenery, even in the woods; slide along the
      // surface so they steer around buildings, rocks, signs and trees.
      const slide = CC.resolveObstacleSlide && CC.resolveObstacleSlide(
        this.pos, oldX, oldZ, r, { allowWoods: false, padding: 0 }
      );
      if (slide) {
        const loss = this.key === 'motorcycle' ? 0.28 : 0.5;
        this.speed *= loss;
        this.latVel *= 0.3;
        const mx = this.pos.x - oldX, mz = this.pos.z - oldZ;
        if (Math.hypot(mx, mz) > 0.05) {
          this.heading = U.angleLerp(this.heading, Math.atan2(mx, mz), 0.28);
        }
        if (this.key === 'motorcycle' && impact > 21) this.needReset = true;
        if (impact > 8) this.registerCrash(impact);
        if (world.particles && impact > 8) {
          world.particles.spawn(this.pos.x - slide.nx * 0.5, this.pos.y + 0.2,
            this.pos.z - slide.nz * 0.5, 6, 0xd8c9a5, 0.8);
        }
      }

      const props = world.destructibles;
      for (let i = 0; i < props.length; i++) {
        const p = props[i];
        if (!p.alive) continue;
        const dx = this.pos.x - p.x, dz = this.pos.z - p.z;
        const minD = p.r + r;
        if (dx * dx + dz * dz >= minD * minD) continue;
        const d = Math.hypot(dx, dz) || 0.001;
        world.knockDown(p, -dx / d, -dz / d, U.clamp(impact / 14, 0.4, 1.4));
        if (impact > 14) this.registerCrash(impact);
        if (this.spec.bulldoze) this.speed *= 0.94;
        else if (this.key === 'motorcycle') this.speed *= 0.6;
        else this.speed *= 0.78;
      }
    }

    // 4-point pontoon buoyancy. Boats float on the exact visual wave surface;
    // cars use a lower buoyancyFactor so they wallow and sink before the deep
    // water safety reset pulls them back to dry land.
    applyWaterBuoyancy(dt, time, boat) {
      if (!CC.RetroWater) {
        this.pos.y = C.SEA_LEVEL + 0.25 + Math.sin(time * 2.1 + this.pos.x * 0.08) * 0.09;
        this.vy = 0;
        this.inWater = true;
        return;
      }
      const spec = this.spec;
      const fwd = this.forward();
      const right = this._right || (this._right = { x: 0, z: 0 });
      right.x = Math.cos(this.heading); right.z = -Math.sin(this.heading);
      const vel = this._buoyVel || (this._buoyVel = { x: 0, y: 0, z: 0 });
      vel.x = fwd.x * this.speed + right.x * this.latVel;
      vel.y = this.vy || 0;
      vel.z = fwd.z * this.speed + right.z * this.latVel;
      const ang = this._buoyAng || (this._buoyAng = { x: 0, y: 0, z: 0 });
      // Reuse the vehicle's existing tilt group so pitch/roll show up directly.
      const body = this._buoyBody || (this._buoyBody = {
        position: this.pos, rotation: this.tilt.rotation
      });
      const st = this._buoyState || (this._buoyState = {});
      st.velocity = vel; st.angularVelocity = ang; st.yaw = this.heading;
      st.halfLength = boat ? 2.9 : Math.max(1.6, (spec.radius || 1) * 1.6);
      st.halfWidth = boat ? 1.25 : Math.max(0.8, (spec.radius || 1) * 0.8);
      st.centerOffsetY = boat ? 0.32 : (spec.wheelRadius || 0.45);
      st.buoyancyFactor = boat ? 2.6 : 0.62;
      st.stiffness = boat ? 40 : 12;
      st.gravity = C.GRAVITY;
      st.maxDepth = boat ? 0.8 : 2.2;
      st.verticalDamping = boat ? 5.5 : 2.6;
      st.forwardDrag = boat ? 0.45 : 2.6;
      st.lateralDrag = boat ? 1.9 : 3.2;
      st.pitchStiffness = boat ? 10 : 5;
      st.rollStiffness = boat ? 10 : 5;
      st.angularDamping = 4.5;
      CC.RetroWater.applyBuoyancy(body, st, time, dt);
      this.vy = vel.y;
      this.speed = vel.x * fwd.x + vel.z * fwd.z;
      this.latVel = vel.x * right.x + vel.z * right.z;
      this.inWater = true;
    }

    syncMesh(dt, input, speedAbs, surface) {
      const spec = this.spec;
      this.bob += dt * (7 + (speedAbs || 0) * 0.5);
      const bounce = this.airborne ? 0 : Math.sin(this.bob) * 0.055 * spec.suspension * U.clamp((speedAbs || 0) / 12, 0, 1) *
        (surface === 'sand' || surface === 'grass' ? 2.2 : 1);
      this.group.position.set(this.pos.x, this.pos.y + bounce, this.pos.z);
      this.group.rotation.y = this.heading;
      if (!this.inWater) {
        const leanTarget = -(this.steerSmoothed || 0) * spec.lean * U.clamp((speedAbs || 0) / 16, 0, 1);
        this.tilt.rotation.z = U.damp(this.tilt.rotation.z, leanTarget, 8, dt);
        const pitch = input && input.throttle < 0 ? 0.04 : input && input.throttle > 0 ? -0.025 : 0;
        this.tilt.rotation.x = U.damp(this.tilt.rotation.x, pitch, 6, dt);
      }
      const spin = ((speedAbs || 0) / spec.wheelRadius) * dt;
      for (let i = 0; i < this.wheels.length; i++) this.wheels[i].rotation.y += spin;
      const braking = (input && input.throttle < 0) || (input && input.handbrake);
      const night = CC.Weather ? U.clamp(CC.Weather.night || 0, 0, 1) : 0;
      if (CC.EnvironmentManager) {
        CC.EnvironmentManager.updateVehicleLights(this.visual || this, braking, night);
      } else {
        this.brakeMat.emissive.setHex(braking ? 0xff2a14 : 0x000000);
        this.brakeMat.emissiveIntensity = braking ? 1.6 : 0;
      }
      if (this.crashFlash > 0) this.crashFlash = Math.max(0, this.crashFlash - dt);
      this.emitExhaust(dt, speedAbs, input);
    }

    emitExhaust(dt, speedAbs, input) {
      const world = CC.World;
      if (!world || !world.particles || this.exploded || this.spec.water) return;
      this.exhaustTimer -= dt;
      const heavy = !!this.heavySmoker;
      const interval = heavy ? 0.12 : 0.28;
      if (this.exhaustTimer > 0) return;
      this.exhaustTimer = interval;
      const f = this.forward();
      const right = { x: Math.cos(this.heading), z: -Math.sin(this.heading) };
      const moving = Math.abs(this.speed || 0) > 0.5;
      const throttle = (input && input.throttle > 0) ? 1.15 : 1;
      const count = 1;
      const strength = (heavy ? 0.16 : 0.07) * throttle;
      const color = heavy ? 0xc9cfd3 : 0xdfe4e7;
      // Tailpipe: rear center-low, slightly offset to avoid spawning inside bumper.
      const bx = this.pos.x - f.x * (this.spec.length * 0.52) + right.x * (this.spec.width * 0.18);
      const by = this.pos.y + Math.max(0.18, this.spec.wheelRadius * 0.55);
      const bz = this.pos.z - f.z * (this.spec.length * 0.52) + right.z * (this.spec.width * 0.18);
      const backVel = -0.45 - Math.min(1.2, Math.abs(this.speed || 0) * 0.04);
      const opts = { spread: 0.06, rise: 0.1, vy: 0.22, vxz: 0.1, life: heavy ? 0.6 : 0.38, vx: f.x * backVel, vz: f.z * backVel, baseVy: 0.02 };
      world.particles.spawn(bx, by, bz, count, color, strength, opts);
      if (heavy && moving && Math.random() < 0.3) {
        world.particles.spawn(bx - f.x * 0.05, by + 0.02, bz - f.z * 0.05, 1, 0xd2d8dc, strength * 0.55, opts);
      }
    }
  }

  CC.Vehicle = Vehicle;

  /* ---------- player aircraft ----------
     Same public API as Vehicle, with altitude controlled by boost/handbrake.
     Planes need airspeed to stay up; helicopters can hover in place. */
  class FlyingVehicle {
    constructor(key, scene) {
      this.key = key;
      this.spec = CC.vehicleSpecs[key];
      this.isAircraft = true;
      this.visual = Factory.build(key);
      this.group = this.visual.group;
      this.tilt = this.visual.tilt;
      this.spin = this.visual.spin || {};
      scene.add(this.group);
      this.pos = new THREE.Vector3();
      this.heading = 0;
      this.speed = 0;
      this.vy = 0;
      this.vx = 0;
      this.vz = 0;
      this.pitchSmoothed = 0;
      this.rollSmoothed = 0;
      this.steerSmoothed = 0;
      this.spawnIndex = key === 'plane' ? 0 : 0;
      this.needReset = false;
      this.dustTimer = 0;
      this.exhaustTimer = Math.random() * 0.2;
      this.heavySmoker = false;
      this.setVisible(false);
    }

    setVisible(v) { this.group.visible = v; }

    setPose(x, z, heading, speed, altitude) {
      const alt = altitude == null ? (this.spec.defaultAltitude || 3) : altitude;
      this.pos.set(x, CC.heightAt(x, z) + alt, z);
      this.heading = heading || 0;
      this.speed = speed || 0;
      this.vy = 0;
      this.vx = 0;
      this.vz = 0;
      this.pitchSmoothed = 0;
      this.rollSmoothed = 0;
      this.steerSmoothed = 0;
      this.tilt.rotation.set(0, 0, 0);
      this.syncMesh(0, 0, 0);
    }

    forward() {
      const f = this._fwd || (this._fwd = { x: 0, z: 0 });
      f.x = Math.sin(this.heading); f.z = Math.cos(this.heading);
      return f;
    }

    reset(world) {
      const spawn = CC.aircraftSpawn ? CC.aircraftSpawn(this.key, this.spawnIndex) : null;
      if (spawn) this.setPose(spawn.x, spawn.z, spawn.heading, 0, spawn.altitude);
      if (world && world.particles) {
        world.particles.spawn(this.pos.x, this.pos.y, this.pos.z, 14, C.COLORS.foam, 1.2);
      }
    }

    update(dt, input, world, time) {
      const spec = this.spec;
      const heli = !!spec.hover;
      const pitchIn = U.clamp(input.pitch != null ? input.pitch :
        (input.fpvPitch || 0), -1, 1);
      const rollIn = U.clamp(input.roll != null ? input.roll :
        (input.fpvRoll != null ? input.fpvRoll : (input.steer || 0)), -1, 1);
      const yawIn = U.clamp(input.yaw != null ? input.yaw :
        (input.fpvYaw || 0), -1, 1);
      const boost = !!input.boost;
      const rawLift = input.lift != null ? input.lift :
        ((input.climb || boost) ? 1 : 0) -
        ((input.descend || input.handbrake || input.dive) ? 1 : 0);
      const liftIn = U.clamp(rawLift, -1, 1);

      if (heli) {
        // Mode 2 helicopter: right stick tilts the rotor, left stick yaws and
        // sets collective. Neutral collective holds the current altitude.
        this.pitchSmoothed = U.damp(this.pitchSmoothed, pitchIn * 0.52, 4.5, dt);
        this.rollSmoothed = U.damp(this.rollSmoothed, rollIn * 0.66, 5.5, dt);
        this.heading += yawIn * spec.turn * dt;
        this.steerSmoothed = this.rollSmoothed;
        const f = this.forward();
        const rx = Math.cos(this.heading), rz = -Math.sin(this.heading);
        const targetVx = (f.x * this.pitchSmoothed + rx * this.rollSmoothed * 0.72) * spec.maxSpeed;
        const targetVz = (f.z * this.pitchSmoothed + rz * this.rollSmoothed * 0.72) * spec.maxSpeed;
        this.vx = U.damp(this.vx, targetVx, 3.2, dt);
        this.vz = U.damp(this.vz, targetVz, 3.2, dt);
        this.speed = Math.hypot(this.vx, this.vz);
        this.pos.x += this.vx * dt;
        this.pos.z += this.vz * dt;
        this.vy = U.damp(this.vy, liftIn * spec.climb, 5, dt);
        this.pos.y += this.vy * dt;
      } else {
        // Planes use left stick Y for airspeed. Right-stick pitch flies the
        // nose up/down, roll banks the wings and left-stick X adds rudder yaw.
        const maxSpeed = spec.maxSpeed * (boost ? 1.18 : 1);
        if (input.throttle > 0) this.speed += spec.accel * dt;
        else if (input.throttle < 0) {
          this.speed -= (this.speed > 0.5 ? spec.brake : spec.accel * 0.45) * dt;
        } else this.speed -= this.speed * Math.min(1, 0.35 * dt);
        this.speed -= this.speed * Math.abs(this.speed) * 0.0009 * dt;
        this.speed = U.clamp(this.speed, -maxSpeed * 0.22, maxSpeed);

        this.pitchSmoothed = U.damp(this.pitchSmoothed, pitchIn, 4.5, dt);
        this.steerSmoothed = U.damp(this.steerSmoothed, rollIn, 6, dt);
        this.rollSmoothed = this.steerSmoothed;
        const authority = U.clamp(Math.abs(this.speed) / 16, 0.15, 1);
        this.heading += (yawIn * 0.7 + rollIn * authority * 0.55) * spec.turn * dt;

        const f = this.forward();
        this.vx = f.x * this.speed;
        this.vz = f.z * this.speed;
        this.pos.x += this.vx * dt;
        this.pos.z += this.vz * dt;

        const air = U.clamp(Math.abs(this.speed) / 12, 0, 1);
        const levelLift = air * 1.2 - (1 - air) * 3.6;
        const targetVy = -this.pitchSmoothed * spec.climb * (0.35 + 0.65 * air) + levelLift;
        this.vy = U.damp(this.vy, targetVy, 2.8, dt);
        this.pos.y += this.vy * dt;
      }

      const floor = CC.heightAt(this.pos.x, this.pos.z) + spec.minAltitude;
      if (this.pos.y < floor) {
        this.pos.y = floor;
        this.vy = Math.max(0, this.vy);
        this.speed *= 0.94;
        this.dustTimer -= dt;
        if (this.dustTimer <= 0 && world && world.particles && Math.abs(this.speed) > 6) {
          world.particles.spawn(this.pos.x, floor, this.pos.z, 5, 0xe8d4a2, 0.8);
          this.dustTimer = 0.35;
        }
      }
      const ceiling = spec.ceiling || (heli ? 620 : 700);
      if (this.pos.y > ceiling) {
        this.pos.y = ceiling;
        this.vy = Math.min(0, this.vy);
      }

      const W = C.WORLD, m = 40;
      if (this.pos.x > W.maxX + m) this.pos.x = W.minX - m;
      if (this.pos.x < W.minX - m) this.pos.x = W.maxX + m;
      if (this.pos.z > W.maxZ + m) this.pos.z = W.minZ - m;
      if (this.pos.z < W.minZ - m) this.pos.z = W.maxZ + m;

      this.syncMesh(dt, liftIn, Math.abs(this.speed));
      return 'air';
    }

    emitExhaust(dt, speed) {
      const world = CC.World;
      if (!world || !world.particles || this.spec.jetpack) return;
      this.exhaustTimer -= dt;
      const heavy = !!this.heavySmoker;
      const interval = heavy ? 0.1 : 0.22;
      if (this.exhaustTimer > 0) return;
      this.exhaustTimer = interval;
      const f = this.forward();
      const moving = Math.abs(speed || this.speed || 0) > 0.5;
      const count = 1;
      const strength = heavy ? 0.28 : 0.14;
      const color = heavy ? 0xc9cfd3 : 0xdfe4e7;
      const bx = this.pos.x - f.x * (this.spec.length || 6) * 0.45;
      const by = this.pos.y + (this.spec.hover ? 0.1 : 0.35);
      const bz = this.pos.z - f.z * (this.spec.length || 6) * 0.45;
      const opts = { spread: 0.12, rise: 0.14, vy: 0.35, vxz: 0.18, life: heavy ? 0.8 : 0.55, vx: -f.x * 1.2, vz: -f.z * 1.2, baseVy: 0.02 };
      world.particles.spawn(bx, by, bz, count, color, strength, opts);
      if (heavy && moving && Math.random() < 0.5) world.particles.spawn(bx - f.x * 0.12, by + 0.04, bz - f.z * 0.12, 1, 0xd2d8dc, strength * 0.6, opts);
    }

    syncMesh(dt, climb, speed) {
      this.group.position.copy(this.pos);
      this.group.rotation.y = this.heading;
      if (this.spec.jetpack) {
        this.tilt.rotation.z = U.damp(this.tilt.rotation.z, -this.rollSmoothed * 0.28, 7, dt);
        this.tilt.rotation.x = U.damp(this.tilt.rotation.x, this.pitchSmoothed * 0.22, 7, dt);
        const flameOn = Math.abs(climb || 0) > 0.05 || Math.abs(speed) > 0.5 || Math.abs(this.vy || 0) > 0.2;
        // Keep the flame flicker on simulation time so pause and slow motion
        // affect it like everything else.
        this.flamePhase = (this.flamePhase || 0) + (dt || 0) * 20;
        const flames = this.spin.flames || [];
        for (let i = 0; i < flames.length; i++) {
          const f = flames[i];
          f.visible = flameOn;
          if (flameOn) {
            const s = 0.75 + Math.sin(this.flamePhase + i * 1.7) * 0.2 + Math.abs(climb || 0) * 0.25;
            f.scale.set(1, s, 1);
            f.material.opacity = 0.55 + Math.random() * 0.3;
          }
        }
      } else if (this.spec.hover) {
        // Positive roll/pitch move right/forward, so the model must lean that
        // way too: a right bank is a negative Z rotation and a forward pitch
        // is a positive X rotation for a nose pointing along +Z.
        this.tilt.rotation.z = U.damp(this.tilt.rotation.z, -this.rollSmoothed * 0.55, 6, dt);
        this.tilt.rotation.x = U.damp(this.tilt.rotation.x, this.pitchSmoothed * 0.38, 6, dt);
      } else {
        this.tilt.rotation.z = U.damp(this.tilt.rotation.z,
          -(this.steerSmoothed || 0) * 0.48, 6, dt);
        this.tilt.rotation.x = U.damp(this.tilt.rotation.x,
          (this.pitchSmoothed || 0) * 0.18 - 0.02, 5, dt);
      }
      const rotorBoost = 1 + Math.abs(climb || 0) * 0.08;
      if (this.spin.prop) this.spin.prop.rotation.z += dt * (20 + speed * 0.8) * rotorBoost;
      if (this.spin.rotor) this.spin.rotor.rotation.y += dt * (24 + speed * 0.35) * rotorBoost;
      if (this.spin.tailRotor) this.spin.tailRotor.rotation.x += dt * (30 + speed * 0.4) * rotorBoost;
      this.emitExhaust(dt, speed);
    }
  }

  CC.FlyingVehicle = FlyingVehicle;

  /* ---------- player FPV kamikaze quad ----------
     Deliberately separate from FlyingVehicle: an acro quad is controlled by
     pitch/roll/yaw axes instead of a throttle + steering heading, and it has a
     15-minute sortie battery that is swapped after a safe airport landing. */
  const FPV_NAMES = [
    'NIGHT WASP', 'SAND DEVIL', 'IRON HORNET', 'GHOST LANCER', 'REAPER 7',
    'STORM VULTURE', 'SUNSET STRIKE', 'THUNDER MOTH', 'SCORPION 9',
    'RED KITE', 'DUNE FALCON', 'HELLCAT 12', 'SILENT ARROW', 'EMBER WRAITH'
  ];

  class FpvDrone {
    constructor(key, scene) {
      this.key = key;
      this.spec = CC.vehicleSpecs[key];
      this.isAircraft = true;
      this.isFpv = true;
      this.visual = Factory.build(key);
      this.group = this.visual.group;
      this.tilt = this.visual.tilt;
      this.rotors = (this.visual.spin && this.visual.spin.rotors) || [];
      scene.add(this.group);
      this.pos = new THREE.Vector3();
      this.prevPos = new THREE.Vector3();
      this.home = new THREE.Vector3();
      this.homeHeading = 0;
      this.pilotLocked = false;
      this.spawnFlash = 0;
      this.velocity = new THREE.Vector3();
      this.heading = 0;
      this.pitch = 0;
      this.roll = 0;
      this.vy = 0;
      this.speed = 0;
      this.radius = this.spec.radius;
      this.battery = 100;
      this.powerLoss = false;
      this.lowBatteryWarned = false;
      this.batteryAlertUntil = 0;
      this.sats = 12;
      this.sortie = 0;
      this.kills = 0;
      this.name = FPV_NAMES[Math.floor(Math.random() * FPV_NAMES.length)];
      this.state = 'ready';
      this.respawnTimer = 0;
      this.landCooldown = 0;
      this.setVisible(false);
    }

    setVisible(v) { this.group.visible = !!v; }

    setPose(x, z, heading, speed, altitude) {
      const alt = altitude == null ? (this.spec.defaultAltitude || 1.4) : altitude;
      this.pos.set(x, CC.heightAt(x, z) + alt, z);
      this.prevPos.copy(this.pos);
      this.home.copy(this.pos);
      this.heading = heading || 0;
      this.pitch = 0;
      this.roll = 0;
      this.vy = 0;
      this.speed = 0;
      this.velocity.set(0, 0, 0);
      this.groundImpact = false;
      this.landCooldown = 0;
      this.powerLoss = false;
      this.syncMesh(0);
    }

    // The launch point is the on-foot pedestrian or car the player was using,
    // never an airport pad. Keeping it on the drone also gives HUD home arrow
    // and post-explosion respawn a single source of truth.
    claimPilotPose(x, z, heading, altitude) {
      const alt = altitude == null ? (this.spec.defaultAltitude || 2.2) : altitude;
      this.setPose(x, z, heading, 0, alt);
      this.homeHeading = heading || 0;
      this.pilotLocked = true;
      this.beginSpawnFlash();
    }

    // Show the airframe for a moment at the pilot's position before the
    // goggles take over. The game loop hides it when the flash expires.
    beginSpawnFlash() {
      this.spawnFlash = 0.42;
      this.setVisible(true);
    }

    endSpawnFlash() {
      // Called exactly once when the launch flash timer reaches zero.
      this.spawnFlash = 0;
      const active = CC.Game && CC.Game.activeKey === this.key && CC.Game.fpvActive;
      // Goggles are on: hide the airframe so it never sits in the camera.
      // Otherwise (a parked/patrol respawn) leave it visible.
      this.setVisible(!active);
    }

    forward() {
      const f = this._fwd || (this._fwd = { x: 0, z: 0 });
      f.x = Math.sin(this.heading); f.z = Math.cos(this.heading);
      return f;
    }

    reset(world) {
      if (this.pilotLocked) {
        const alt = this.home.y - CC.heightAt(this.home.x, this.home.z);
        this.setPose(this.home.x, this.home.z, this.homeHeading, 0, alt);
      } else {
        const spawn = CC.aircraftSpawn ? CC.aircraftSpawn(this.key, this.spawnIndex || 0) : null;
        if (spawn) this.setPose(spawn.x, spawn.z, spawn.heading, 0, spawn.altitude);
      }
      this.battery = 100;
      this.powerLoss = false;
      this.lowBatteryWarned = false;
      this.batteryAlertUntil = 0;
      this.state = 'ready';
      this.name = FPV_NAMES[Math.floor(Math.random() * FPV_NAMES.length)];
      if (world && world.particles) {
        world.particles.spawn(this.pos.x, this.pos.y, this.pos.z, 12, 0x9fe6ff, 1);
      }
    }

    newSortie() {
      this.sortie++;
      this.battery = 100;
      this.powerLoss = false;
      this.lowBatteryWarned = false;
      this.batteryAlertUntil = 0;
      this.sats = 11 + Math.floor(Math.random() * 5);
      this.name = FPV_NAMES[Math.floor(Math.random() * FPV_NAMES.length)];
    }

    update(dt, input, world, time) {
      if (this.spawnFlash > 0) {
        this.spawnFlash = Math.max(0, this.spawnFlash - dt);
        if (this.spawnFlash === 0) this.endSpawnFlash();
      }
      if (this.state === 'destroyed') {
        this.respawnTimer -= dt;
        if (this.respawnTimer <= 0) this.respawn(world);
        return 'air';
      }

      this.prevPos.copy(this.pos);
      this.groundImpact = false;
      this.landCooldown = Math.max(0, (this.landCooldown || 0) - dt);
      const spec = this.spec;
      // 15-minute sortie. At empty the motors quit and the quad falls; the
      // player can still guide it onto a target before the impact fireball.
      this.battery = Math.max(0, this.battery - dt / (spec.batterySeconds || 900) * 100);
      if (this.battery <= 0 && !this.powerLoss) {
        this.powerLoss = true;
        this.vy = Math.min(this.vy, 0);
        if (CC.Game && CC.Game.fpvMessage) {
          CC.Game.fpvMessage('BATTERY DEPLETED — LAND OR FIND A TARGET', 3.4);
        }
      }

      const pitchIn = U.clamp(input.pitch != null ? input.pitch :
        (input.fpvPitch || 0), -1, 1);
      const rollIn = U.clamp(input.roll != null ? input.roll :
        (input.fpvRoll || 0), -1, 1);
      const yawIn = U.clamp(input.yaw != null ? input.yaw :
        (input.fpvYaw || 0), -1, 1);
      // Identical mapping and damping to the jetpack. Game.readInput flips the
      // A/D axis for both vehicles, so W/S, A/D, Q/Z and Shift/Space behave the
      // same way whichever one the player has equipped.
      this.pitch = U.damp(this.pitch, pitchIn * 0.52, 4.5, dt);
      this.roll = U.damp(this.roll, rollIn * 0.66, 5.5, dt);
      this.heading += yawIn * spec.turn * dt;

      const rawLift = input.lift != null ? input.lift :
        ((input.climb || input.boost) ? 1 : 0) -
        ((input.descend || input.handbrake || input.dive) ? 1 : 0);
      const climbInput = this.powerLoss ? -1 : U.clamp(rawLift, -1, 1);
      this.vy = U.damp(this.vy, climbInput * spec.climb, 5, dt);
      if (this.powerLoss) this.vy = Math.max(-22, this.vy - 9.8 * dt);

      const f = this.forward();
      const rx = Math.cos(this.heading), rz = -Math.sin(this.heading);
      const authority = this.powerLoss ? 0 : 1;
      const targetVx = (f.x * this.pitch + rx * this.roll * 0.72) * spec.maxSpeed * authority;
      const targetVz = (f.z * this.pitch + rz * this.roll * 0.72) * spec.maxSpeed * authority;
      this.velocity.x = U.damp(this.velocity.x, targetVx, 3.2, dt);
      this.velocity.z = U.damp(this.velocity.z, targetVz, 3.2, dt);
      this.speed = Math.hypot(this.velocity.x, this.velocity.z);

      this.pos.x += this.velocity.x * dt;
      this.pos.z += this.velocity.z * dt;
      this.pos.y += this.vy * dt;
      const floor = CC.heightAt(this.pos.x, this.pos.z) + spec.minAltitude;
      if (this.pos.y < floor) {
        // Record the impact before the clamp erases the vertical speed. A
        // hard landing or a fast low pass detonates the explosive payload;
        // a gentle hover at the minimum altitude stays safe.
        if (this.vy < -2.5 || this.speed > 12) this.groundImpact = true;
        this.pos.y = floor;
        this.vy = Math.max(0, this.vy);
        this.velocity.x *= 0.94;
        this.velocity.z *= 0.94;
        this.speed *= 0.94;
      }
      const ceiling = spec.ceiling || 620;
      if (this.pos.y > ceiling) { this.pos.y = ceiling; this.vy = Math.min(0, this.vy); }
      const W = C.WORLD, margin = 40;
      if (this.pos.x > W.maxX + margin) this.pos.x = W.minX - margin;
      if (this.pos.x < W.minX - margin) this.pos.x = W.maxX + margin;
      if (this.pos.z > W.maxZ + margin) this.pos.z = W.minZ - margin;
      if (this.pos.z < W.minZ - margin) this.pos.z = W.maxZ + margin;
      if (time && Math.random() < dt * 0.08) this.sats = 11 + Math.floor(Math.random() * 5);
      this.syncMesh(dt, time);
      return 'air';
    }

    syncMesh(dt, time) {
      this.group.position.copy(this.pos);
      this.group.rotation.y = this.heading;
      // Match the goggles: right roll banks the body right, forward pitch tips
      // the nose down, so both signs are the reverse of the old visual tilt.
      this.tilt.rotation.z = U.damp(this.tilt.rotation.z, -this.roll * 0.7, 8, dt || 0.016);
      this.tilt.rotation.x = U.damp(this.tilt.rotation.x, this.pitch * 0.55, 8, dt || 0.016);
      const rate = 46 + this.speed * 1.3;
      for (let i = 0; i < this.rotors.length; i++) {
        this.rotors[i].rotation.y += (dt || 0) * rate * (i % 2 ? -1 : 1);
      }
    }

    cameraEuler(out) {
      // Kept for callers that still ask for a drone orientation. The gameplay
      // camera is now a forward windshield view; roll is shown on the HUD.
      const e = out || new THREE.Euler(0, 0, 0, 'YXZ');
      e.set(-this.pitch, this.heading + Math.PI, 0, 'YXZ');
      return e;
    }

    landAtHome(world) {
      if (this.state !== 'ready' || this.landCooldown > 0) return false;
      const d = U.distance2D(this.pos.x, this.pos.z, this.home.x, this.home.z);
      const agl = this.pos.y - CC.heightAt(this.pos.x, this.pos.z);
      if (d > 7 || agl > 1.6 || this.speed > 4) return false;
      this.velocity.set(0, 0, 0);
      this.vy = 0;
      this.pitch = 0;
      this.roll = 0;
      this.landCooldown = 3;
      this.newSortie();
      if (world && world.particles) {
        world.particles.spawn(this.pos.x, this.pos.y, this.pos.z, 22, 0x62e0ff, 1.4);
      }
      if (CC.Game && CC.Game.fpvMessage) CC.Game.fpvMessage('BATTERY SWAPPED — SORTIE ' + this.sortie, 2.4);
      return true;
    }

    explode(world, reason, opts) {
      if (this.state === 'destroyed') return;
      const kamikaze = !!(opts && opts.kamikaze);
      this.state = 'destroyed';
      this.respawnTimer = kamikaze ? 2.6 : 1.8;
      this.spawnFlash = 0;
      this.setVisible(false);
      const x = this.pos.x, y = this.pos.y, z = this.pos.z;
      if (world && world.createExplosion) {
        world.createExplosion(x, z, {
          scale: kamikaze ? 16 : 5.5, y: y, duration: kamikaze ? 44 : 26
        });
        if (kamikaze) {
          // The airframe is packed with explosives: a huge primary fireball,
          // two secondary blasts and a tall smoke column make every impact —
          // target or terrain — unmistakable from an ordinary crash.
          world.createExplosion(x + 2.6, z - 1.9, { scale: 9, y: y + 1.5, duration: 34 });
          world.createExplosion(x - 3.0, z + 2.5, { scale: 8, y: y + 0.8, duration: 32 });
          world.createExplosion(x + 0.7, z + 0.6, { scale: 7, y: y + 6, duration: 30 });
        }
      } else if (world && world.particles) {
        world.particles.spawn(x, y, z, kamikaze ? 620 : 240, 0xffb347, kamikaze ? 12 : 6);
        if (kamikaze) world.particles.spawn(x, y + 4, z, 260, 0x3a3b3c, 17);
      }
      if (CC.Game && CC.Game.fpvMessage) {
        CC.Game.fpvMessage(reason || 'DRONE DOWN', kamikaze ? 3.6 : 3);
      }
    }

    respawn(world) {
      // A replacement quad appears at the pilot, not the airport. home is
      // captured when FPV is chosen from the pedestrian or car, so this is the
      // exact spot the first drone launched from.
      if (this.pilotLocked) {
        const alt = this.home.y - CC.heightAt(this.home.x, this.home.z);
        this.setPose(this.home.x, this.home.z, this.homeHeading, 0, alt);
      } else {
        const spawn = CC.aircraftSpawn ? CC.aircraftSpawn(this.key, this.spawnIndex || 0) : null;
        if (spawn) this.setPose(spawn.x, spawn.z, spawn.heading, 0, spawn.altitude);
      }
      this.battery = 100;
      this.powerLoss = false;
      this.lowBatteryWarned = false;
      this.batteryAlertUntil = 0;
      this.sats = 11 + Math.floor(Math.random() * 5);
      this.state = 'ready';
      this.landCooldown = 0;
      this.beginSpawnFlash();
      if (world && world.particles) {
        world.particles.spawn(this.pos.x, this.pos.y, this.pos.z, 18, 0x9fe6ff, 1.2);
      }
      if (CC.Game && CC.Game.fpvMessage) {
        CC.Game.fpvMessage('NEW AIRFRAME AT PILOT — SORTIE ' + this.sortie, 2.2);
      }
    }
  }

  CC.FpvDrone = FpvDrone;

  /* ---------- player pedestrian ----------
     Exposes the same API as Vehicle, so the game can swap between driving and
     walking without special-casing the main loop. */
  class PlayerPed {
    constructor(key, scene) {
      this.key = key;
      this.spec = CC.vehicleSpecs[key];
      this.isPedestrian = true;
      this.group = new THREE.Group();

      const character = CC.CharacterFactory.build({
        skin: 0xe8bd96, shirt: 0xf2b84b, pants: 0x405466,
        hair: 0x35291f, hat: 0x2f7d88, bag: 0x8f5b45
      });
      this.group = character.group;
      this.proceduralChildren = this.group.children.slice();
      this.downloaded = null;
      this.downloadedKey = 'default';
      // Yaw first, then pitch: swimming must tilt along the travel direction
      // instead of rolling the character onto its side when heading east/west.
      this.group.rotation.order = 'YXZ';
      this.head = character.head;
      this.legL = character.legL; this.legR = character.legR;
      this.armL = character.armL; this.armR = character.armR;
      scene.add(this.group);

      this.pos = new THREE.Vector3();
      this.heading = 0;
      this.speed = 0;
      this.walkPhase = 0;
      this.stamina = 1;
      this.exhausted = false;
      this.sprinting = false;
      this.lastSafe = new THREE.Vector3();
      this.needReset = false;
      this.isSwimming = false;
      this.swimDepth = 0;
      this.setVisible(false);
    }

    setVisible(v) { this.group.visible = v; }

    // Swap the on-foot body for one of the baked animated GLB characters.
    // Passing null/'default' restores the original procedural pedestrian.
    setSkin(key) {
      const wanted = key && key !== 'default' ? key : 'default';
      if (this.downloaded) {
        this.group.remove(this.downloaded.group);
        this.downloaded = null;
      }
      this.downloadedKey = 'default';
      this.proceduralChildren.forEach(function (child) { child.visible = true; });
      this._skinRequest = wanted;
      if (wanted === 'default') return Promise.resolve(null);
      const DL = CC.DownloadedCharacterLoader;
      if (!DL || !DL.build) return Promise.resolve(null);
      const ped = this;
      return DL.build(wanted, { clip: 'Idle' }).then(function (rig) {
        if (!rig || ped._skinRequest !== wanted) return null;
        ped.proceduralChildren.forEach(function (child) { child.visible = false; });
        ped.group.add(rig.group);
        ped.downloaded = rig;
        ped.downloadedKey = wanted;
        return rig;
      }).catch(function (e) {
        if (DL) DL.lastError = String((e && (e.stack || e)) || e);
        return null;
      });
    }

    setPose(x, z, heading, speed) {
      this.pos.set(x, CC.heightAt(x, z), z);
      this.heading = heading || 0;
      this.speed = speed || 0;
      this.lastSafe.copy(this.pos);
      this.isSwimming = CC.coast.isWater(x, z);
      this.swimDepth = this.isSwimming ? 0.45 : 0;
      if (this.isSwimming) this.pos.y = C.SEA_LEVEL - this.swimDepth;
      this.syncMesh(0, false);
    }

    forward() {
      const f = this._fwd || (this._fwd = { x: 0, z: 0 });
      f.x = Math.sin(this.heading); f.z = Math.cos(this.heading);
      return f;
    }

    reset(world) {
      const nr = CC.nearestRoad(this.pos.x, this.pos.z, 'paved') || CC.nearestRoad(this.pos.x, this.pos.z);
      if (nr) this.setPose(nr.x, nr.z, Math.atan2(nr.dx, nr.dz), 0);
      else this.setPose(0, 0, 0, 0);
      if (world && world.particles) world.particles.spawn(this.pos.x, this.pos.y + 0.5, this.pos.z, 10, 0xf2e2bd, 0.7);
    }

    update(dt, input, world, time) {
      const spec = this.spec;
      const onBridge = !!(CC.coast.onBridge && CC.coast.onBridge(this.pos.x, this.pos.z, 1.5));
      const waterDist = CC.coast.distanceToWater(this.pos.x, this.pos.z);
      const inWater = !onBridge && waterDist < -0.6;
      if (inWater) this.isSwimming = true;
      else if (!onBridge && waterDist > 0.8 && this.swimDepth < 0.9) this.isSwimming = false;

      const surface = CC.surfaceAt(this.pos.x, this.pos.z);
      const offFactor = this.isSwimming ? 0.62 : surface === 'sand' ? spec.sandFactor : 1;
      // Shift sprints like GTA San Andreas: a faster stride that burns a
      // stamina bar, then forces a short breather before sprinting again.
      const wantsRun = !!input.boost;
      const running = wantsRun && !this.exhausted && this.stamina > 0.01 && !this.isSwimming;
      if (running) this.stamina -= dt * 0.21;
      else this.stamina += dt * (this.exhausted ? 0.13 : 0.17);
      this.stamina = U.clamp(this.stamina, 0, 1);
      if (this.stamina <= 0) this.exhausted = true;
      else if (this.exhausted && this.stamina >= 0.35) this.exhausted = false;
      this.sprinting = running;
      const pace = CC.pace ? CC.pace.pedestrian : 1;
      const maxSpeed = spec.maxSpeed * pace * (running ? spec.boost : 1) * offFactor;

      if (input.throttle > 0) this.speed += spec.accel * pace * (running ? 1.9 : 1) * dt;
      else if (input.throttle < 0) {
        if (this.speed > 0.3) this.speed -= spec.brake * pace * dt;
        else this.speed -= spec.accel * pace * 0.8 * dt;
      } else this.speed -= this.speed * Math.min(1, 8 * dt);
      this.speed -= this.speed * Math.abs(this.speed) * 0.02 * dt;
      // Walking backward should not feel like wading compared with forward.
      this.speed = U.clamp(this.speed, -maxSpeed * 0.8, maxSpeed);

      // Walkers can pivot gently on the spot, like the wandering townsfolk.
      const turnScale = 0.35 + 0.65 * U.clamp(Math.abs(this.speed) / 3, 0, 1);
      this.heading += input.steer * spec.turn * turnScale * (running ? 0.85 : 1) * dt;
      const fwd = this.forward();
      const oldX = this.pos.x, oldZ = this.pos.z;
      this.pos.x += fwd.x * this.speed * dt;
      this.pos.z += fwd.z * this.speed * dt;

      // A bridge deck is solid ground even though the river is below it. A
      // pedestrian who is already diving can still pass underneath.
      const bridgeNow = !!(CC.coast.onBridge && CC.coast.onBridge(this.pos.x, this.pos.z, 1.5));
      if (bridgeNow && this.isSwimming && this.swimDepth < 1.2) {
        this.isSwimming = false;
        this.swimDepth = 0;
      }
      const waterDistNow = bridgeNow ? 1 : CC.coast.distanceToWater(this.pos.x, this.pos.z);

      // Solid buildings, trees and landmarks cannot be walked through. Water
      // has no land obstacles, so swimmers pass under piers and jetties.
      if (!this.isSwimming && world && CC.resolveObstacleSlide) {
        // The old full-array scan tested every tree in town for every walker.
        // The shared spatial index checks only nearby scenery and keeps the
        // same speed penalty when someone bumps into something solid.
        const bump = CC.resolveObstacleSlide(
          this.pos, oldX, oldZ, spec.radius, { allowWoods: true }
        );
        if (bump) this.speed *= 0.4;
      }

      const dive = !!(input.dive || input.handbrake);
      if (this.isSwimming) {
        // Holding Space/A paddles down; releasing floats back to the surface.
        const targetDepth = dive ? 4.6 : 0.42;
        this.swimDepth = U.damp(this.swimDepth, targetDepth, dive ? 2.1 : 3.0, dt);
        this.pos.y = C.SEA_LEVEL - this.swimDepth;
        if (waterDistNow > 0.8 && this.swimDepth < 0.9) {
          this.isSwimming = false;
          this.swimDepth = 0;
          const lower = CC.underpassGroundAt && CC.underpassGroundAt(this.pos.x, this.pos.z);
          this.pos.y = lower == null ? CC.heightAt(this.pos.x, this.pos.z) : lower;
        }
      } else {
        this.swimDepth = U.damp(this.swimDepth, 0, 6, dt);
        const lower = CC.underpassGroundAt && CC.underpassGroundAt(this.pos.x, this.pos.z);
        this.pos.y = lower == null ? CC.heightAt(this.pos.x, this.pos.z) : lower;
        if (waterDistNow > 1.5) this.lastSafe.copy(this.pos);
      }

      this.syncMesh(dt, running);
      if (this.isSwimming) return this.swimDepth > 1.3 ? 'diving' : 'swimming';
      return bridgeNow ? 'paved' : surface;
    }

    syncMesh(dt, running) {
      const moving = U.clamp(Math.abs(this.speed) / 2.5, 0, 1);
      this.walkPhase += dt * (this.isSwimming ? 8 :
        (running ? 8.5 : 5) + Math.abs(this.speed) * (running ? 1.8 : 1.5));
      const swing = Math.sin(this.walkPhase) * (0.18 + moving * 0.5) * (running ? 1.3 : 1);
      this.legL.rotation.x = swing;
      this.legR.rotation.x = -swing;
      this.armL.rotation.x = -swing * 0.85;
      this.armR.rotation.x = swing * 0.85;
      this.group.position.set(this.pos.x, this.pos.y, this.pos.z);
      this.group.rotation.y = this.heading;
      if (this.isSwimming) {
        // Face-down breaststroke aligned with heading; deeper dives flatten
        // out a little more. Keep the roll tiny so it never reads as side-swim.
        const diveTilt = U.clamp(this.swimDepth / 4.6, 0, 1);
        this.group.rotation.x = U.damp(this.group.rotation.x, 1.35 - diveTilt * 0.3, 7, dt);
        this.group.rotation.z = Math.sin(this.walkPhase * 0.7) * 0.04;
        this.armL.rotation.x = Math.sin(this.walkPhase) * 1.05;
        this.armR.rotation.x = -Math.sin(this.walkPhase) * 1.05;
        this.legL.rotation.x = -Math.sin(this.walkPhase * 0.8) * 0.55;
        this.legR.rotation.x = Math.sin(this.walkPhase * 0.8) * 0.55;
      } else {
        this.group.position.y += Math.abs(Math.sin(this.walkPhase)) * 0.045 * moving;
        this.group.rotation.x = U.damp(this.group.rotation.x, (running ? 0.12 : 0.03) * moving, 8, dt);
        this.group.rotation.z = Math.sin(this.walkPhase) * 0.03 * moving;
      }
      if (this.downloaded) {
        this.downloaded.setMoving(!this.isSwimming && (moving > 0.05 || running));
        this.downloaded.update(dt);
      }
      if (this.visual && this.visual.blob) {
        this.visual.blob.userData.forceHidden = this.isSwimming;
      }
    }
  }

  CC.PlayerPed = PlayerPed;
})();
