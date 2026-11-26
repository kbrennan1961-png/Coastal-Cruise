/* Coastal Cruise - runtime support for edits exported by map-editor.html.
   Loaded after js/MapEdits.js and before the world/game builders. */
(function () {
  'use strict';

  const CC = (window.CC = window.CC || {});
  const EMPTY = {
    version: 1,
    generated: null,
    active: false,
    newMap: false,
    mapName: null,
    world: null,
    mapWidth: null,
    mapHeight: null,
    elevation: null,
    roads: null,
    buildings: null,
    landmarks: null,
    challenges: null,
    assets: [],
    trailerShots: []
  };
  CC.mapEdits = Object.assign({}, EMPTY, CC.mapEdits || {});

  function clonePoint(p) { return [p[0], p[1]]; }

  function cloneRoad(r) {
    return Object.assign({}, r, {
      points: (r.points || []).map(clonePoint)
    });
  }

  function cloneAsset(a) {
    return Object.assign({}, a);
  }

  // A patch created with "New map" replaces the baked town completely, using
  // a fresh blank canvas and the exported world dimensions. This runs at
  // script load, before ImageMap.loadBaked() captures CC.bakedMap.
  function applyNewMapBase() {
    const e = CC.mapEdits;
    if (!e || !e.newMap || !e.world) return;
    const world = {
      minX: Number(e.world.minX), maxX: Number(e.world.maxX),
      minZ: Number(e.world.minZ), maxZ: Number(e.world.maxZ)
    };
    if (![world.minX, world.maxX, world.minZ, world.maxZ].every(isFinite)) return;
    if (world.maxX <= world.minX || world.maxZ <= world.minZ) return;
    CC.C.WORLD = world;

    const spanX = world.maxX - world.minX;
    const spanZ = world.maxZ - world.minZ;
    const pxW = Math.max(256, Math.min(1200, Math.round(spanX)));
    const pxH = Math.max(256, Math.min(1200, Math.round(pxW * spanZ / spanX)));
    CC.bakedMap = {
      width: pxW,
      height: pxH,
      zones: {
        shore: { base: world.minX - 100000, amp1: 0, amp2: 0, freq1: 0, freq2: 0, phase2: 0 },
        beachWidth: 0,
        ponds: [],
        ramps: [],
        forest: [],
        riverFill: []
      },
      landmarks: [],
      roads: [],
      buildings: [],
      challenges: []
    };
    if (CC.river) CC.river.points = [];
    if (CC.coast) {
      CC.coast.riverDepth = function () { return 1000; };
      CC.coast.inMarsh = function () { return false; };
      CC.coast.isWater = function () { return false; };
      CC.coast.distanceToWater = function () { return 1000; };
    }
    if (CC.pondDefs) CC.pondDefs = function () { return []; };
  }
  applyNewMapBase();

  // Called from ImageMap.loadBaked() after simplifyBurgerBayRoads(), so the
  // exported view wins over the older baked/runtime road overrides.
  CC.applyMapEdits = function (IM) {
    const edits = CC.mapEdits;
    if (!edits || !edits.active) return false;
    if (Array.isArray(edits.roads)) IM.roads = edits.roads.map(cloneRoad);
    if (Array.isArray(edits.buildings)) IM.buildings = edits.buildings.map(cloneAsset);
    if (Array.isArray(edits.landmarks)) IM.landmarks = edits.landmarks.map(cloneAsset);
    if (Array.isArray(edits.challenges)) {
      IM.challenges = edits.challenges.map(function (ch) {
        return Object.assign({}, ch, {
          gates: (ch.gates || []).map(clonePoint)
        });
      });
      CC.challengeDefs = IM.challenges;
    }
    CC.roadDefs = IM.roads;
    // Trailer shots are consumed by tools/trailer.js, not the gameplay loop,
    // but expose them here so the patch is queryable from the game console.
    CC.trailerShots = Array.isArray(edits.trailerShots) ? edits.trailerShots : [];
    return true;
  };

  // Elevation imported by the editor is added on top of the painted terrain.
  // Called at the end of ImageMap.apply(), once CC.heightAt is final.
  CC.applyMapElevation = function () {
    if (CC._mapElevationApplied) return;
    const e = CC.mapEdits && CC.mapEdits.elevation;
    if (!e) return;
    const hills = Array.isArray(e.hills) ? e.hills : [];
    const points = Array.isArray(e.points) ? e.points : [];
    const grid = e.grid || null;
    if (!hills.length && !points.length && !grid) return;

    function bump(x, z, hx, hz, height, radius) {
      const r = Math.max(1, Number(radius) || 25);
      const d = Math.hypot(x - hx, z - hz);
      if (d >= r) return 0;
      const t = 1 - d / r;
      return (Number(height) || 0) * t * t;
    }

    function extra(x, z) {
      let add = 0;
      hills.forEach(function (h) { add += bump(x, z, h.x, h.z, h.h, h.r); });
      points.forEach(function (h) { add += bump(x, z, h.x, h.z, h.h, h.r || 25); });
      if (grid && Array.isArray(grid.values) && grid.width > 0 && grid.height > 0 &&
          x >= grid.minX && z >= grid.minZ &&
          x <= grid.minX + (grid.width - 1) * (Number(grid.cell) || 1) &&
          z <= grid.minZ + (grid.height - 1) * (Number(grid.cell) || 1)) {
        const cell = Number(grid.cell) || 1;
        const gx = Math.min(grid.width - 1, Math.max(0, (x - grid.minX) / cell));
        const gz = Math.min(grid.height - 1, Math.max(0, (z - grid.minZ) / cell));
        const x0 = Math.floor(gx), z0 = Math.floor(gz);
        const x1 = Math.min(grid.width - 1, x0 + 1), z1 = Math.min(grid.height - 1, z0 + 1);
        const tx = gx - x0, tz = gz - z0;
        const v = function (ix, iz) { return Number(grid.values[iz * grid.width + ix]) || 0; };
        add += (1 - tx) * (1 - tz) * v(x0, z0) + tx * (1 - tz) * v(x1, z0) +
          (1 - tx) * tz * v(x0, z1) + tx * tz * v(x1, z1);
      }
      return add;
    }

    const baseHeight = CC.heightAt;
    CC.heightAt = function (x, z) { return baseHeight(x, z) + extra(x, z); };
    if (CC.groundHeightAt) {
      const baseGround = CC.groundHeightAt;
      CC.groundHeightAt = function (x, z) { return baseGround(x, z) + extra(x, z); };
    }
    CC._mapElevationApplied = true;
  };

  function groundY(x, z) {
    return CC.heightAt ? CC.heightAt(x, z) : 0;
  }

  function material(color, opts) {
    return new THREE.MeshLambertMaterial(Object.assign({ color: color, flatShading: true }, opts || {}));
  }

  function addBox(group, w, h, d, color, x, y, z, rot) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material(color));
    mesh.position.set(x, y, z);
    mesh.rotation.y = rot || 0;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  function buildBuilding(group, a) {
    const w = Math.max(2, Number(a.w) || 10);
    const l = Math.max(2, Number(a.l) || 8);
    const h = Math.max(1, Number(a.h) || 4);
    const y = groundY(a.x, a.z) + h * 0.5;
    addBox(group, w, h, l, a.color || 0xd9c7a8, a.x, y, a.z, a.rot || 0);
    addBox(group, w + 0.8, 0.45, l + 0.8, a.roofColor || 0x8d5b48,
      a.x, y + h * 0.5 + 0.18, a.z, a.rot || 0);
    if (CC.World && CC.World.obstacles) {
      CC.World.obstacles.push({ x: a.x, z: a.z, r: Math.max(w, l) * 0.45, type: 'map edit building' });
    }
  }

  function buildBridge(group, a) {
    const w = Math.max(4, Number(a.w) || 24);
    const l = Math.max(4, Number(a.l) || 10);
    const rot = a.rot || 0;
    const y = Number(a.y) || Math.max(3.5, CC.BRIDGE ? CC.BRIDGE.deckHeight : 8);
    addBox(group, w, 0.75, l, a.color || 0x5b5f66, a.x, y, a.z, rot);
    // Rails on both long edges, aligned to the bridge's local X axis.
    for (const side of [-1, 1]) {
      const ox = Math.sin(rot) * side * l * 0.5;
      const oz = Math.cos(rot) * side * l * 0.5;
      addBox(group, w, 0.32, 0.32, a.railColor || 0xb9c1c6,
        a.x + ox, y + 1.25, a.z + oz, rot);
    }
  }

  function buildTree(group, a) {
    const s = Math.max(0.5, Number(a.scale) || 1);
    const base = groundY(a.x, a.z);
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24 * s, 0.34 * s, 2.4 * s, 6),
      material(a.trunkColor || 0x8a6342));
    trunk.position.set(a.x, base + 1.2 * s, a.z);
    group.add(trunk);
    const leaves = new THREE.Mesh(
      new THREE.ConeGeometry(2.1 * s, 6 * s, 7),
      material(a.color || 0x4d8a4a));
    leaves.position.set(a.x, base + 4.6 * s, a.z);
    leaves.castShadow = true;
    group.add(leaves);
    if (CC.World && CC.World.obstacles) {
      CC.World.obstacles.push({ x: a.x, z: a.z, r: 0.8 * s, type: 'map edit tree' });
    }
  }

  function buildModel(group, a) {
    const loader = CC.AssetLoader;
    const key = a.model || a.modelKey || a.key;
    if (!loader || !loader.available || !loader.models || !loader.models[key]) return;
    const scale = Math.max(0.05, Number(a.scale) || 1);
    let color = a.color;
    if (typeof color === 'string' && color.charAt(0) === '#') color = parseInt(color.slice(1), 16);
    const obj = loader.buildModel(key, {
      scale: scale,
      color: color == null ? undefined : color
    });
    if (!obj) return;
    obj.position.set(Number(a.x) || 0,
      groundY(Number(a.x) || 0, Number(a.z) || 0) + (Number(a.y) || 0),
      Number(a.z) || 0);
    obj.rotation.y = Number(a.rot) || 0;
    group.add(obj);

    const fp = loader.footprint(key);
    const baseScale = Number(loader.models[key].scale) || 1;
    if (fp && CC.World && CC.World.obstacles) {
      const size = Math.max(fp.w, fp.l) * baseScale * scale;
      if (size >= 1.4) {
        CC.World.obstacles.push({
          x: Number(a.x) || 0, z: Number(a.z) || 0,
          r: size * 0.45, type: 'map edit model'
        });
      }
    }
  }

  // Called from World.init() once the scene and world arrays exist.
  CC.buildMapEdits = function (scene) {
    const assets = CC.mapEdits && CC.mapEdits.assets;
    if (!scene || !Array.isArray(assets) || assets.length === 0) return null;
    const group = new THREE.Group();
    group.name = 'Map editor assets';
    assets.forEach(function (a) {
      if (!a || a.hidden) return;
      if (a.type === 'building') buildBuilding(group, a);
      else if (a.type === 'bridge') buildBridge(group, a);
      else if (a.type === 'tree') buildTree(group, a);
      else if (a.type === 'model' || a.type === 'glb' || a.type === 'gltf') buildModel(group, a);
    });
    scene.add(group);
    CC.World.mapEditGroup = group;
    return group;
  };
})();
