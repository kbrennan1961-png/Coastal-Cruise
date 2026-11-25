/* StaticBatcher - collapses thousands of static decorative meshes into a
 * handful of merged meshes at boot time. The procedural world builds each
 * plank, post, frond and window as its own THREE.Mesh, which leaves the game
 * with >20k scene nodes and >3000 draw calls. Materials are shared, so all
 * meshes using the same material in the same part of the world can be baked
 * into a single buffer without changing how the scene looks.
 *
 * Anything that an animation system holds a reference to (lamps, animals,
 * gates, clouds, vehicle shadows, ...) is detected and left alone.
 */
(function () {
  const CC = window.CC;
  const THREE = window.THREE;
  if (!CC || !THREE) return;

  const Batcher = {};
  CC.StaticBatcher = Batcher;

  const TILE = 200;       // world units per spatial bucket (keeps culling useful)
  const MIN_GROUP = 5;    // don't bother merging tiny groups

  const HOLDER_KEYS = [
    'group', 'mesh', 'object', 'line', 'ring', 'inner', 'beam', 'light',
    'tail', 'top', 'armL', 'armR', 'head', 'body', 'node', 'target', 'prop'
  ];

  function isObj(o) {
    return !!(o && typeof o === 'object' && o.isObject3D);
  }

  // Walk the module-level state of every system that animates objects and
  // collect the Object3Ds it keeps references to. Those (and their whole
  // ancestor/descendant chains) must not be merged away.
  function collectDynamicRoots() {
    const roots = new Set();
    const seen = new Set();

    function scan(value, depth) {
      if (!value || typeof value !== 'object' || depth > 4 || seen.has(value)) return;
      if (value.nodeType) return; // DOM node
      if (isObj(value)) {
        if (!value.isScene) roots.add(value);
        return;
      }
      seen.add(value);
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) scan(value[i], depth + 1);
        return;
      }
      for (let k = 0; k < HOLDER_KEYS.length; k++) {
        const child = value[HOLDER_KEYS[k]];
        if (isObj(child)) roots.add(child);
      }
      if (depth < 3) {
        for (const key in value) {
          const child = value[key];
          if (child && typeof child === 'object' && !isObj(child)) scan(child, depth + 1);
        }
      }
    }

    const modules = [CC.Details, CC.World, CC.Drawbridges, CC.EnvironmentManager,
      CC.Weather, CC.LightingSystem, CC.RetroWater];
    for (let i = 0; i < modules.length; i++) {
      const mod = modules[i];
      if (!mod) continue;
      for (const key in mod) {
        if (key === 'scene' || key === 'renderer' || key === 'camera') continue;
        scan(mod[key], 0);
      }
    }
    return roots;
  }

  function mergeGroup(items, material) {
    let vertexCount = 0;
    const parts = [];
    for (let i = 0; i < items.length; i++) {
      const mesh = items[i];
      const source = mesh.geometry;
      const geo = source.index ? source.toNonIndexed() : source;
      parts.push({ geo: geo, source: source, matrix: mesh.matrixWorld });
      vertexCount += geo.attributes.position.count;
    }

    const position = new Float32Array(vertexCount * 3);
    const normal = new Float32Array(vertexCount * 3);
    const uv = new Float32Array(vertexCount * 2);
    const normalMatrix = new THREE.Matrix3();
    const v = new THREE.Vector3();
    let offset = 0;

    for (let p = 0; p < parts.length; p++) {
      const part = parts[p];
      const pa = part.geo.attributes.position.array;
      const na = part.geo.attributes.normal.array;
      const ua = part.geo.attributes.uv.array;
      const count = part.geo.attributes.position.count;
      normalMatrix.getNormalMatrix(part.matrix);
      for (let i = 0; i < count; i++) {
        const o = i * 3, t = (offset + i) * 3, q = (offset + i) * 2;
        v.set(pa[o], pa[o + 1], pa[o + 2]).applyMatrix4(part.matrix);
        position[t] = v.x; position[t + 1] = v.y; position[t + 2] = v.z;
        v.set(na[o], na[o + 1], na[o + 2]).applyMatrix3(normalMatrix).normalize();
        normal[t] = v.x; normal[t + 1] = v.y; normal[t + 2] = v.z;
        uv[q] = ua[i * 2]; uv[q + 1] = ua[i * 2 + 1];
      }
      offset += count;
      if (part.geo !== part.source) part.geo.dispose();
    }

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(position, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
    merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    merged.computeBoundingSphere();
    return merged;
  }

  Batcher.run = function (scene) {
    if (!scene || Batcher.done) return Batcher.stats;
    Batcher.done = true;
    Batcher.merged = [];
    Batcher._gridTimer = 0;
    const stats = Batcher.stats = {
      candidates: 0, mergedMeshes: 0, batches: 0, skippedDynamic: 0, savedDraws: 0
    };
    const roots = collectDynamicRoots();
    const dynamic = new Set();
    roots.forEach(function (root) {
      root.traverse(function (o) { dynamic.add(o); });
      let ancestor = root.parent;
      while (ancestor) { dynamic.add(ancestor); ancestor = ancestor.parent; }
    });

    scene.updateMatrixWorld(true);
    const groups = new Map();
    scene.traverse(function (mesh) {
      if (!mesh.isMesh || mesh.isInstancedMesh || mesh.isSkinnedMesh || mesh.isScene) return;
      // Animated surfaces (retro water) must keep their live BufferGeometry.
      if (mesh.userData && mesh.userData.dynamic) { stats.skippedDynamic++; return; }
      if (dynamic.has(mesh)) { stats.skippedDynamic++; return; }
      const mat = mesh.material;
      if (!mat || Array.isArray(mat) || mat.transparent || mat.isShaderMaterial) return;
      const geo = mesh.geometry;
      if (!geo || !geo.attributes.position || !geo.attributes.normal || !geo.attributes.uv) return;
      for (const name in geo.attributes) {
        if (name !== 'position' && name !== 'normal' && name !== 'uv') return;
      }
      if (mesh.morphTargetInfluences) return;
      stats.candidates++;
      const e = mesh.matrixWorld.elements;
      const tileX = Math.floor(e[12] / TILE), tileZ = Math.floor(e[14] / TILE);
      const key = mat.uuid + '|' + tileX + '|' + tileZ + '|' +
        (mesh.castShadow ? 1 : 0) + '|' + (mesh.receiveShadow ? 1 : 0) + '|' + mesh.renderOrder;
      let group = groups.get(key);
      if (!group) {
        group = { material: mat, items: [], castShadow: mesh.castShadow,
          receiveShadow: mesh.receiveShadow, renderOrder: mesh.renderOrder };
        groups.set(key, group);
      }
      group.items.push(mesh);
    });

    groups.forEach(function (group) {
      if (group.items.length < MIN_GROUP) return;
      let mergedGeo;
      try {
        mergedGeo = mergeGroup(group.items, group.material);
      } catch (e) {
        return; // leave the originals in place if a mesh has an odd geometry
      }
      const merged = new THREE.Mesh(mergedGeo, group.material);
      merged.castShadow = group.castShadow;
      merged.receiveShadow = group.receiveShadow;
      merged.renderOrder = group.renderOrder;
      merged.matrixAutoUpdate = false;
      merged.updateMatrix();
      scene.add(merged);
      Batcher.merged.push(merged);
      for (let i = 0; i < group.items.length; i++) {
        const mesh = group.items[i];
        if (mesh.parent) mesh.parent.remove(mesh);
      }
      stats.batches++;
      stats.mergedMeshes += group.items.length;
      stats.savedDraws += group.items.length - 1;
    });
    return stats;
  };

  // Distance-cull merged static chunks to current + surrounding grid area.
  // Frustum culling handles off-screen; this reduces far in-frustum draws on old laptops.
  Batcher.update = function (playerPos, dt, radius) {
    if (!playerPos || !Batcher.merged || !Batcher.merged.length) return;
    Batcher._gridTimer = (Batcher._gridTimer || 0) - (dt || 0);
    if (Batcher._gridTimer > 0) return;
    Batcher._gridTimer = 0.25;
    const r = radius || 520;
    for (let i = 0; i < Batcher.merged.length; i++) {
      const m = Batcher.merged[i];
      const bs = m.geometry && m.geometry.boundingSphere;
      if (!bs) continue;
      const dx = bs.center.x - playerPos.x;
      const dz = bs.center.z - playerPos.z;
      const rr = r + bs.radius;
      m.visible = (dx * dx + dz * dz) < rr * rr;
    }
  };
})();
