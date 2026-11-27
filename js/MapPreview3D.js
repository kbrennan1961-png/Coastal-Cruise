/* Coastal Cruise - optional 3D preview for map-editor.html.
   Uses the same baked model loader as the game, so placed models look like
   their in-game versions. Loaded before MapEditor.js; no network access.
   Selection and Blender-style move/rotate/scale gizmos are data-driven: the
   host owns state and receives changes through the handler setters below. */
(function () {
  'use strict';

  const CC = (window.CC = window.CC || {});
  const BASE_HINT = '3D preview: click to select; use move/rotate/scale modes to drag gizmo handles; left-drag to orbit in view mode; right/middle/Shift+drag to pan; wheel to zoom; double-click to fit. Press P to return to 2D.';
  const STYLE_HINTS = {
    game: BASE_HINT,
    realistic: BASE_HINT + ' Realistic mode uses softer PBR lighting, shadows and detailed facades; the game itself keeps its PS2 style.'
  };
  const Preview = (CC.MapPreview3D = {
    available: false,
    active: false,
    editMode: 'view',
    styleMode: 'game',
    hintText: BASE_HINT
  });

  let container = null;
  let hint = null;
  let getState = null;
  let renderer = null;
  let scene = null;
  let camera = null;
  let root = null;
  let lastSignature = '';
  let controls = null;
  let texture = null;
  let sun = null;
  let fillLight = null;
  let environment = null;
  const facadeCache = new Map();

  let selectHandler = null;
  let transformHandler = null;
  let editMode = 'view';
  let raycaster = null;
  let gizmo = null;
  let gizmoMove = null;
  let gizmoRotate = null;
  let gizmoScale = null;
  let drag = null;
  let localPick = null;
  let lastHostSelection = null;
  let hostSelectionSeen = false;

  const orbit = {
    target: new THREE.Vector3(0, 0, 0),
    distance: 600,
    yaw: -Math.PI * 0.25,
    pitch: 0.92
  };
  const ORBIT_MIN = 0.12;
  const ORBIT_MAX = Math.PI * 0.49;

  function worldOf(state) {
    return state.world || CC.C.WORLD;
  }

  function centreOf(state) {
    const w = worldOf(state);
    return {
      x: (Number(w.minX) + Number(w.maxX)) * 0.5,
      z: (Number(w.minZ) + Number(w.maxZ)) * 0.5,
      w: Math.max(1, Number(w.maxX) - Number(w.minX)),
      h: Math.max(1, Number(w.maxZ) - Number(w.minZ))
    };
  }

  function elevationExtra(state, x, z) {
    const e = state.elevation || {};
    const hills = Array.isArray(e.hills) ? e.hills : [];
    const points = Array.isArray(e.points) ? e.points : [];
    const grid = e.grid || null;
    let add = 0;

    function bump(p) {
      const r = Math.max(1, Number(p.r) || 25);
      const d = Math.hypot(x - Number(p.x || 0), z - Number(p.z || 0));
      if (d >= r) return 0;
      const t = 1 - d / r;
      return (Number(p.h) || 0) * t * t;
    }
    hills.forEach(bump);
    points.forEach(bump);

    if (grid && Array.isArray(grid.values) && grid.width > 0 && grid.height > 0) {
      const cell = Number(grid.cell) || 1;
      const gx = (x - Number(grid.minX || 0)) / cell;
      const gz = (z - Number(grid.minZ || 0)) / cell;
      if (gx >= 0 && gz >= 0 && gx <= grid.width - 1 && gz <= grid.height - 1) {
        const x0 = Math.floor(gx), z0 = Math.floor(gz);
        const x1 = Math.min(grid.width - 1, x0 + 1);
        const z1 = Math.min(grid.height - 1, z0 + 1);
        const tx = gx - x0, tz = gz - z0;
        const at = function (ix, iz) { return Number(grid.values[iz * grid.width + ix]) || 0; };
        add += (1 - tx) * (1 - tz) * at(x0, z0) + tx * (1 - tz) * at(x1, z0) +
          (1 - tx) * tz * at(x0, z1) + tx * tz * at(x1, z1);
      }
    }
    return add;
  }

  function heightAt(state, x, z) {
    let base = 0;
    if (!state.newMap && typeof CC.heightAt === 'function') {
      const h = CC.heightAt(x, z);
      if (Number.isFinite(h)) base = h;
    }
    return base + elevationExtra(state, x, z);
  }

  function own(mesh) {
    mesh.userData.previewOwned = true;
    return mesh;
  }

  // Material ownership is tracked separately: baked loader geometries and
  // facade-cache materials are shared, but per-preview material upgrades are
  // safe to dispose when the map is rebuilt.
  function ownMaterial(material) {
    if (material && material.userData) material.userData.previewOwned = true;
    return material;
  }

  function disposeRoot() {
    if (!root) return;
    const materials = new Set();
    function collect(material) {
      if (Array.isArray(material)) material.forEach(collect);
      else if (material && material.userData && material.userData.previewOwned) materials.add(material);
    }
    root.traverse(function (obj) {
      if (!obj.userData) return;
      if (obj.userData.previewOwned && obj.geometry) obj.geometry.dispose();
      collect(obj.material);
      collect(obj.userData.previewMaterial);
    });
    materials.forEach(function (m) { m.dispose(); });
    scene.remove(root);
    root = null;
    if (texture) { texture.dispose(); texture = null; }
  }

  function signatureOf(state) {
    return JSON.stringify([
      worldOf(state), state.newMap, state.layers, state.selection,
      state.roads, state.buildings, state.landmarks, state.assets,
      state.elevation, Preview.styleMode,
      state.terrainCanvas ? state.terrainCanvas.width : 0,
      state.terrainCanvas ? state.terrainCanvas.height : 0
    ]);
  }

  function isRealistic() {
    return Preview.styleMode === 'realistic';
  }

  // Editor-only material upgrade. The game keeps its cheap Lambert/PS2 look;
  // this preview gets smoother normals, standard PBR shading and soft shadows.
  function upgradeMaterial(src) {
    if (!isRealistic() || !src) return src;
    if (src.isMeshStandardMaterial || src.isMeshPhysicalMaterial) {
      const m = src.clone();
      m.flatShading = false;
      if (!m.transparent || m.opacity >= 1) {
        m.roughness = Math.max(0.28, Number.isFinite(m.roughness) ? m.roughness : 0.5);
        m.envMapIntensity = Number.isFinite(m.envMapIntensity) ? m.envMapIntensity : 0.9;
      }
      return m;
    }
    return new THREE.MeshStandardMaterial({
      color: src.color ? src.color.clone() : 0xffffff,
      map: src.map || null,
      emissive: src.emissive ? src.emissive.clone() : 0x000000,
      emissiveIntensity: Number.isFinite(src.emissiveIntensity) ? src.emissiveIntensity : 1,
      transparent: !!src.transparent,
      opacity: Number.isFinite(src.opacity) ? src.opacity : 1,
      alphaTest: src.alphaTest || 0,
      side: src.side || THREE.FrontSide,
      depthWrite: src.depthWrite !== false,
      vertexColors: !!src.vertexColors,
      roughness: 0.78,
      metalness: 0.02
    });
  }

  function styledMaterial(src) {
    return ownMaterial(upgradeMaterial(src));
  }

  function upgradeObjectMaterials(obj) {
    if (!isRealistic() || !obj) return;
    obj.traverse(function (o) {
      if (!o.material) return;
      function convert(m) {
        const upgraded = styledMaterial(m);
        return upgraded;
      }
      o.material = Array.isArray(o.material) ? o.material.map(convert) : convert(o.material);
      o.userData.previewMaterial = o.material;
    });
  }

  function makeMaterial(color, opts) {
    return styledMaterial(new THREE.MeshLambertMaterial(Object.assign({
      color: color, side: THREE.DoubleSide, flatShading: true
    }, opts || {})));
  }

  function materialHex(value, fallback) {
    if (typeof value === 'string' && value.charAt(0) === '#') {
      const n = parseInt(value.slice(1), 16);
      return Number.isFinite(n) ? n >>> 0 : fallback;
    }
    if (value && value.isColor) return value.getHex();
    const n = Number(value);
    return Number.isFinite(n) ? n >>> 0 : fallback;
  }

  // Procedural facade used only by the editor's realistic view. It gives plain
  // Building map entries windows, siding and roof detail without changing the
  // map data or adding any runtime asset.
  function facadeMaterials(color) {
    const hex = materialHex(color, 0xd9c7a8);
    if (facadeCache.has(hex)) return facadeCache.get(hex);
    const base = new THREE.Color(hex);
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#' + base.getHexString();
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = 'rgba(255,255,255,0.075)';
    for (let x = 0; x < 256; x += 16) g.fillRect(x, 0, 2, 256);
    g.fillStyle = 'rgba(0,0,0,0.10)';
    for (let y = 0; y < 256; y += 32) g.fillRect(0, y, 256, 2);
    g.fillStyle = 'rgba(30,48,58,0.94)';
    g.strokeStyle = 'rgba(228,240,246,0.55)';
    g.lineWidth = 3;
    for (let y = 28; y < 235; y += 64) {
      for (let x = 22; x < 235; x += 64) {
        g.fillRect(x, y, 34, 34);
        g.strokeRect(x, y, 34, 34);
        g.fillStyle = 'rgba(155,205,225,0.32)';
        g.fillRect(x + 3, y + 3, 12, 13);
        g.fillStyle = 'rgba(30,48,58,0.94)';
      }
    }
    g.fillStyle = 'rgba(48,38,30,0.78)';
    g.fillRect(109, 206, 38, 50);
    g.fillStyle = 'rgba(240,210,130,0.85)';
    g.fillRect(137, 230, 4, 4);

    const tex = new THREE.CanvasTexture(c);
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    const roofHex = base.clone().multiplyScalar(0.58).getHex();
    const trimHex = base.clone().multiplyScalar(0.42).getHex();
    const wall = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.84, metalness: 0.02 });
    const roof = new THREE.MeshStandardMaterial({ color: roofHex, roughness: 0.92, metalness: 0.03 });
    const trim = new THREE.MeshStandardMaterial({ color: trimHex, roughness: 0.9, metalness: 0.02 });
    const mats = [wall, wall, roof, trim, wall, wall];
    facadeCache.set(hex, mats);
    return mats;
  }

  function addBox(parent, state, o) {
    const w = Math.max(1, Number(o.w) || 10);
    const l = Math.max(1, Number(o.l) || 8);
    const h = Math.max(0.5, Number(o.h) || 4);
    const base = heightAt(state, o.x, o.z);
    const y = base + (Number(o.yOffset) || 0) + h * 0.5;
    const detailed = isRealistic() && !!o.detailedBuilding;
    const color = o.color == null ? 0xd9c7a8 : o.color;
    const material = detailed
      ? facadeMaterials(color)
      : makeMaterial(color);
    const mesh = own(new THREE.Mesh(new THREE.BoxGeometry(w, h, l), material));
    mesh.position.set(Number(o.x) || 0, y, Number(o.z) || 0);
    mesh.rotation.y = Number(o.rot) || 0;
    mesh.castShadow = mesh.receiveShadow = true;
    if (o.pick) mesh.userData.pick = o.pick;
    if (detailed) {
      const hex = materialHex(color, 0xd9c7a8);
      const shade = new THREE.Color(hex).multiplyScalar(0.52).getHex();
      const cap = own(new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, 0.5, l + 0.8),
        makeMaterial(shade)));
      cap.position.y = h * 0.5 + 0.25;
      cap.castShadow = cap.receiveShadow = true;
      mesh.add(cap);
      const foundation = own(new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.5, l + 0.5),
        makeMaterial(0x8b8378)));
      foundation.position.y = -h * 0.5 + 0.25;
      foundation.receiveShadow = true;
      mesh.add(foundation);
    }
    parent.add(mesh);
    return mesh;
  }

  function addRoad(parent, state, road, index) {
    const pts = road.points || [];
    if (pts.length < 2) return;
    const width = Math.max(2, Number(road.width) || 12);
    const colors = {
      paved: 0x25292e, gravel: 0x9b8d70, dirt: 0x8b6b4b, boardwalk: 0x705139
    };
    const positions = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const ax = Number(pts[i][0]) || 0, az = Number(pts[i][1]) || 0;
      const bx = Number(pts[i + 1][0]) || 0, bz = Number(pts[i + 1][1]) || 0;
      const dx = bx - ax, dz = bz - az;
      const len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len * width * 0.5;
      const nz = dx / len * width * 0.5;
      const a1 = [ax + nx, heightAt(state, ax + nx, az + nz) + 0.18, az + nz];
      const a2 = [ax - nx, heightAt(state, ax - nx, az - nz) + 0.18, az - nz];
      const b1 = [bx + nx, heightAt(state, bx + nx, bz + nz) + 0.18, bz + nz];
      const b2 = [bx - nx, heightAt(state, bx - nx, bz - nz) + 0.18, bz - nz];
      positions.push.apply(positions, a1.concat(a2, b1, b1, a2, b2));
    }
    const geo = own(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.computeVertexNormals();
    const mesh = own(new THREE.Mesh(geo,
      makeMaterial(colors[road.type] || colors.paved)));
    mesh.userData.pick = { kind: 'road', index: index };
    mesh.receiveShadow = true;
    parent.add(mesh);
  }

  function addTree(parent, state, a, pick) {
    const scale = Math.max(0.4, Number(a.scale) || 1);
    let obj = null;
    if (CC.AssetLoader && CC.AssetLoader.buildModel) {
      obj = CC.AssetLoader.buildModel('pine', { scale: scale });
    }
    if (!obj) {
      obj = new THREE.Group();
      const trunk = own(new THREE.Mesh(
        new THREE.CylinderGeometry(0.24 * scale, 0.34 * scale, 2.4 * scale, 6),
        makeMaterial(0x8a6342)));
      trunk.position.y = 1.2 * scale;
      const leaves = own(new THREE.Mesh(
        new THREE.ConeGeometry(2.1 * scale, 6 * scale, 7),
        makeMaterial(a.color == null ? 0x4d8a4a : a.color)));
      leaves.position.y = 4.6 * scale;
      obj.add(trunk, leaves);
    } else {
      upgradeObjectMaterials(obj);
    }
    obj.position.set(Number(a.x) || 0, heightAt(state, a.x, a.z) + (Number(a.y) || 0), Number(a.z) || 0);
    obj.rotation.y = Number(a.rot) || 0;
    obj.userData.pick = pick;
    parent.add(obj);
  }

  function addModel(parent, state, a, pick) {
    const loader = CC.AssetLoader;
    const key = a.model || a.modelKey || a.key;
    if (!loader || !loader.buildModel || !loader.models || !loader.models[key]) return;
    let color = a.color;
    if (typeof color === 'string' && color.charAt(0) === '#') color = parseInt(color.slice(1), 16);
    const obj = loader.buildModel(key, {
      scale: Math.max(0.05, Number(a.scale) || 1),
      color: color == null ? undefined : color,
      texture: a.texture || null
    });
    if (!obj) return;
    upgradeObjectMaterials(obj);
    obj.position.set(Number(a.x) || 0,
      heightAt(state, a.x, a.z) + (Number(a.y) || 0), Number(a.z) || 0);
    obj.rotation.y = Number(a.rot) || 0;
    obj.userData.pick = pick;
    parent.add(obj);
  }

  function addGround(parent, state) {
    const c = centreOf(state);
    const segX = Math.min(96, Math.max(24, Math.round(c.w / 12)));
    const segZ = Math.min(96, Math.max(24, Math.round(c.h / 12)));
    const geo = own(new THREE.PlaneGeometry(c.w, c.h, segX, segZ));
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = c.x + pos.getX(i), z = c.z + pos.getZ(i);
      pos.setY(i, heightAt(state, x, z) - 0.08);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();

    let material;
    if (state.terrainCanvas) {
      texture = new THREE.CanvasTexture(state.terrainCanvas);
      if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
      texture.magFilter = THREE.LinearFilter;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      material = styledMaterial(isRealistic()
        ? new THREE.MeshStandardMaterial({ map: texture, side: THREE.DoubleSide, roughness: 0.94, metalness: 0 })
        : new THREE.MeshLambertMaterial({ map: texture, side: THREE.DoubleSide }));
    } else {
      material = makeMaterial(0x8fae63);
    }
    const ground = own(new THREE.Mesh(geo, material));
    ground.position.set(c.x, 0, c.z);
    ground.receiveShadow = true;
    ground.name = 'Preview ground';
    parent.add(ground);

    const gridSize = Math.max(c.w, c.h);
    const grid = new THREE.GridHelper(gridSize, Math.max(20, Math.round(gridSize / 40)),
      0x4c6a78, 0x39515c);
    grid.position.set(c.x, 0.12, c.z);
    grid.material.transparent = true;
    grid.material.opacity = 0.28;
    ownMaterial(grid.material);
    grid.userData.previewOwned = true;
    parent.add(grid);
  }

  function addHighlight(parent, state) {
    const sel = state.selection;
    if (!sel) return;
    let found = null;
    parent.traverse(function (obj) {
      if (found || !obj.userData || !obj.userData.pick) return;
      const p = obj.userData.pick;
      if (p.kind === sel.kind && p.index === sel.index) found = obj;
    });
    if (found) {
      const helper = new THREE.BoxHelper(found, 0xf2b35c);
      helper.material.depthTest = false;
      helper.material.transparent = true;
      ownMaterial(helper.material);
      helper.userData.previewOwned = true;
      parent.add(helper);
    }
    if (sel.kind === 'road' && sel.vertex != null) {
      const road = state.roads[sel.index];
      const p = road && road.points && road.points[sel.vertex];
      if (p) {
        const dot = own(new THREE.Mesh(new THREE.SphereGeometry(2.2, 8, 6),
          makeMaterial(0xf2b35c)));
        dot.position.set(Number(p[0]) || 0, heightAt(state, p[0], p[1]) + 2.2, Number(p[1]) || 0);
        parent.add(dot);
      }
    }
  }

  // ----- selection / transform helpers ------------------------------------

  function samePick(a, b) {
    return !!a && !!b && a.kind === b.kind && a.index === b.index && a.vertex === b.vertex;
  }

  function syncPickFromState(state) {
    const sel = state && state.selection ? state.selection : null;
    if (!hostSelectionSeen || !samePick(sel, lastHostSelection)) {
      hostSelectionSeen = true;
      lastHostSelection = sel;
      localPick = sel;
    }
  }

  function currentPick() {
    if (localPick) return localPick;
    const state = getState && getState();
    return state && state.selection ? state.selection : null;
  }

  function objectData(pick) {
    const state = getState && getState();
    if (!state || !pick) return null;
    if (pick.kind === 'building') return (state.buildings || [])[pick.index] || null;
    if (pick.kind === 'landmark') return (state.landmarks || [])[pick.index] || null;
    if (pick.kind === 'asset') return (state.assets || [])[pick.index] || null;
    return null;
  }

  function isTransformable(pick) {
    if (!pick || (pick.kind !== 'building' && pick.kind !== 'landmark' && pick.kind !== 'asset')) return false;
    const d = objectData(pick);
    return !!(d && Number.isFinite(Number(d.x)) && Number.isFinite(Number(d.z)));
  }

  function findObject(pick) {
    if (!root || !pick) return null;
    let found = null;
    root.traverse(function (obj) {
      if (found || !obj.userData || !obj.userData.pick) return;
      const p = obj.userData.pick;
      if (p.kind === pick.kind && p.index === pick.index) found = obj;
    });
    return found;
  }

  function gizmoMaterial(color) {
    return new THREE.MeshBasicMaterial({
      color: color, depthTest: false, depthWrite: false,
      transparent: true, opacity: 0.96, side: THREE.DoubleSide
    });
  }

  function addArrow(parent, axis, color, handle) {
    const mat = gizmoMaterial(color);
    const shaftGeo = new THREE.CylinderGeometry(0.9, 0.9, 18, 8);
    const tipGeo = new THREE.ConeGeometry(2.6, 6, 10);
    if (axis === 'x') {
      shaftGeo.rotateZ(-Math.PI / 2);
      tipGeo.rotateZ(-Math.PI / 2);
      shaftGeo.translate(9, 0, 0);
      tipGeo.translate(21, 0, 0);
    } else {
      shaftGeo.rotateX(Math.PI / 2);
      tipGeo.rotateX(Math.PI / 2);
      shaftGeo.translate(0, 0, 9);
      tipGeo.translate(0, 0, 21);
    }
    [shaftGeo, tipGeo].forEach(function (geo) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData.gizmoHandle = handle;
      mesh.renderOrder = 1000;
      parent.add(mesh);
    });
  }

  function buildGizmo() {
    const group = new THREE.Group();
    group.name = 'Preview transform gizmo';

    gizmoMove = new THREE.Group();
    addArrow(gizmoMove, 'x', 0xe8503a, 'moveX');
    addArrow(gizmoMove, 'z', 0x3c78e8, 'moveZ');
    group.add(gizmoMove);

    const ringGeo = new THREE.TorusGeometry(18, 1.4, 8, 48);
    ringGeo.rotateX(Math.PI / 2);
    gizmoRotate = new THREE.Mesh(ringGeo, gizmoMaterial(0xf2c53d));
    gizmoRotate.userData.gizmoHandle = 'rotate';
    gizmoRotate.renderOrder = 1000;
    group.add(gizmoRotate);

    gizmoScale = new THREE.Group();
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(5.5, 14, 10), gizmoMaterial(0x49c46b));
    sphere.userData.gizmoHandle = 'scale';
    sphere.renderOrder = 1000;
    const box = new THREE.Mesh(new THREE.BoxGeometry(7, 7, 7), gizmoMaterial(0x49c46b));
    box.position.y = 8;
    box.userData.gizmoHandle = 'scale';
    box.renderOrder = 1000;
    gizmoScale.add(sphere, box);
    group.add(gizmoScale);

    return group;
  }

  function updateGizmo() {
    if (!gizmo) return;
    const pick = currentPick();
    if (editMode === 'view' || !pick || !isTransformable(pick)) {
      gizmo.visible = false;
      return;
    }
    if (scene) scene.updateMatrixWorld(true);

    const obj = findObject(pick);
    let pos = null;
    if (obj) {
      const b = new THREE.Box3().setFromObject(obj);
      if (!b.isEmpty()) {
        const c = b.getCenter(new THREE.Vector3());
        pos = new THREE.Vector3(c.x, b.max.y + 6, c.z);
      } else {
        pos = obj.position.clone();
        pos.y += 6;
      }
    } else {
      const d = objectData(pick);
      const state = getState && getState();
      pos = new THREE.Vector3(Number(d.x) || 0,
        heightAt(state, d.x, d.z) + Math.max(0.5, Number(d.h) || 4) + 6,
        Number(d.z) || 0);
    }
    gizmo.position.copy(pos);
    gizmo.visible = true;
    gizmoMove.visible = editMode === 'move';
    gizmoRotate.visible = editMode === 'rotate';
    gizmoScale.visible = editMode === 'scale';
  }

  function setRay(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    raycaster.setFromCamera(ndc, camera);
  }

  function pointerOnPlane(e, y) {
    setRay(e);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y);
    const out = new THREE.Vector3();
    return raycaster.ray.intersectPlane(plane, out) ? out : null;
  }

  function planeAngle(e, centre) {
    const p = pointerOnPlane(e, centre.y);
    if (!p) return null;
    return Math.atan2(p.z - centre.z, p.x - centre.x);
  }

  function projectToScreen(v) {
    const rect = renderer.domElement.getBoundingClientRect();
    const p = v.clone().project(camera);
    return {
      x: rect.left + (p.x + 1) * 0.5 * rect.width,
      y: rect.top + (1 - p.y) * 0.5 * rect.height
    };
  }

  function isVisibleChain(obj) {
    while (obj) {
      if (obj.visible === false) return false;
      obj = obj.parent;
    }
    return true;
  }

  function raycastGizmo(e) {
    if (!gizmo || !gizmo.visible || editMode === 'view') return null;
    setRay(e);
    const hits = raycaster.intersectObjects(gizmo.children, true);
    for (let i = 0; i < hits.length; i++) {
      let o = hits[i].object;
      while (o) {
        if (o.userData && o.userData.gizmoHandle && isVisibleChain(o)) return o.userData.gizmoHandle;
        o = o.parent;
      }
    }
    return null;
  }

  function raycastPick(e) {
    if (!root) return null;
    setRay(e);
    const targets = [];
    root.traverse(function (o) {
      if (o.userData && o.userData.pick) targets.push(o);
    });
    if (!targets.length) return null;
    const hits = raycaster.intersectObjects(targets, true);
    for (let i = 0; i < hits.length; i++) {
      let o = hits[i].object;
      while (o) {
        if (o.userData && o.userData.pick) return o.userData.pick;
        o = o.parent;
      }
    }
    return null;
  }

  function scaledDimensions(data, mult) {
    const out = {};
    ['w', 'l', 'h'].forEach(function (k) {
      const v = Number(data[k]);
      if (data[k] != null && Number.isFinite(v)) out[k] = Math.max(0.1, v * mult);
    });
    return out;
  }

  function initialValues(d) {
    if (d.handle === 'moveX' || d.handle === 'moveZ') return { x: d.startX, z: d.startZ };
    if (d.handle === 'rotate') return { rot: d.startRot };
    return Object.assign({ scale: 1 }, scaledDimensions(d.data, 1));
  }

  function beginTransform(e, handle) {
    const pick = currentPick();
    const data = objectData(pick);
    if (!data) return false;
    const d = {
      pick: pick,
      handle: handle,
      data: Object.assign({}, data),
      obj: findObject(pick),
      startX: Number(data.x) || 0,
      startZ: Number(data.z) || 0,
      startRot: Number(data.rot) || 0,
      startScale: null,
      startPoint: null,
      centre: null,
      centreScreen: null,
      startAngle: 0,
      startDist: 1,
      last: null
    };
    d.startScale = d.obj ? d.obj.scale.clone() : new THREE.Vector3(1, 1, 1);

    if (handle === 'moveX' || handle === 'moveZ') {
      d.startPoint = pointerOnPlane(e, gizmo ? gizmo.position.y : 0);
      if (!d.startPoint) return false;
    } else if (handle === 'rotate') {
      d.centre = gizmo ? gizmo.position.clone() : new THREE.Vector3();
      const a = planeAngle(e, d.centre);
      if (a == null) return false;
      d.startAngle = a;
    } else {
      d.centreScreen = projectToScreen(gizmo ? gizmo.position : new THREE.Vector3());
      d.startDist = Math.max(12, Math.hypot(e.clientX - d.centreScreen.x, e.clientY - d.centreScreen.y));
    }

    d.last = initialValues(d);
    drag = d;
    if (transformHandler) transformHandler(d.pick, d.last, 'start');
    return true;
  }

  function applyVisual(d, values) {
    if (!d.obj) return;
    if (values.x != null) d.obj.position.x = values.x;
    if (values.z != null) d.obj.position.z = values.z;
    if (values.rot != null) d.obj.rotation.y = values.rot;
    if (values.scale != null) d.obj.scale.copy(d.startScale).multiplyScalar(values.scale);
  }

  function updateTransform(e) {
    if (!drag) return;
    const d = drag;
    const values = {};

    if (d.handle === 'moveX' || d.handle === 'moveZ') {
      const p = pointerOnPlane(e, gizmo ? gizmo.position.y : 0);
      if (!p) return;
      const dx = p.x - d.startPoint.x, dz = p.z - d.startPoint.z;
      values.x = d.startX + (d.handle === 'moveX' ? dx : 0);
      values.z = d.startZ + (d.handle === 'moveZ' ? dz : 0);
    } else if (d.handle === 'rotate') {
      const a = planeAngle(e, d.centre);
      if (a == null) return;
      let delta = a - d.startAngle;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      values.rot = d.startRot - delta;
    } else {
      const dist = Math.hypot(e.clientX - d.centreScreen.x, e.clientY - d.centreScreen.y);
      const mult = Math.max(0.05, Math.min(20, dist / d.startDist));
      values.scale = mult;
      Object.assign(values, scaledDimensions(d.data, mult));
    }

    applyVisual(d, values);
    d.last = values;
    if (transformHandler) transformHandler(d.pick, values, 'change');
    updateGizmo();
    renderNow();
  }

  function endTransform() {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.last && transformHandler) transformHandler(d.pick, d.last, 'end');
    renderNow();
  }

  function rebuild(state, force) {
    if (!renderer || !scene || !state) return;
    const sig = signatureOf(state);
    if (!force && sig === lastSignature) return;
    lastSignature = sig;
    syncPickFromState(state);
    if (drag) endTransform();
    disposeRoot();

    const group = new THREE.Group();
    group.name = '3D map preview';
    root = group;
    scene.add(group);

    addGround(group, state);

    if (state.layers.roads) {
      state.roads.forEach(function (road, i) { addRoad(group, state, road, i); });
    }
    if (state.layers.buildings) {
      state.buildings.forEach(function (a, i) {
        addBox(group, state, Object.assign({}, a, {
          yOffset: Number(a.y) || 0,
          detailedBuilding: true,
          pick: { kind: 'building', index: i }
        }));
      });
    }
    if (state.layers.landmarks) {
      state.landmarks.forEach(function (a, i) {
        addBox(group, state, Object.assign({}, a, {
          color: a.color == null ? 0x8fb4c7 : a.color,
          yOffset: Number(a.y) || 0,
          pick: { kind: 'landmark', index: i }
        }));
      });
    }
    if (state.layers.custom) {
      state.assets.forEach(function (a, i) {
        if (!a || a.hidden) return;
        const pick = { kind: 'asset', index: i };
        if (a.type === 'tree') addTree(group, state, a, pick);
        else if (a.type === 'model' || a.type === 'glb' || a.type === 'gltf') addModel(group, state, a, pick);
        else if (a.type === 'bridge') {
          addBox(group, state, Object.assign({}, a, {
            h: 0.75, yOffset: Number(a.y) || 7,
            color: a.color == null ? 0x5b5f66 : a.color, pick: pick
          }));
        } else if (a.type === 'building') {
          addBox(group, state, Object.assign({}, a, {
            yOffset: Number(a.y) || 0, detailedBuilding: true, pick: pick
          }));
        } else {
          addBox(group, state, Object.assign({}, a, {
            h: Math.max(0.5, Number(a.h) || 3), yOffset: Number(a.y) || 0, pick: pick
          }));
        }
      });
    }

    addHighlight(group, state);
    renderNow();
  }

  function updateCamera() {
    if (!camera) return;
    orbit.pitch = Math.max(ORBIT_MIN, Math.min(ORBIT_MAX, orbit.pitch));
    orbit.distance = Math.max(8, orbit.distance);
    const flat = Math.sin(orbit.pitch) * orbit.distance;
    camera.position.set(
      orbit.target.x + Math.sin(orbit.yaw) * flat,
      orbit.target.y + Math.cos(orbit.pitch) * orbit.distance,
      orbit.target.z + Math.cos(orbit.yaw) * flat
    );
    camera.lookAt(orbit.target);
    if (gizmo) gizmo.scale.setScalar(Math.max(0.35, orbit.distance * 0.004));
  }

  function renderNow() {
    if (!renderer || !scene || !camera || !Preview.active) return;
    updateCamera();
    updateGizmo();
    renderer.render(scene, camera);
  }

  function resetView() {
    if (!getState) return;
    const c = centreOf(getState());
    orbit.target.set(c.x, 0, c.z);
    orbit.distance = Math.max(c.w, c.h) * 0.92;
    orbit.yaw = -Math.PI * 0.25;
    orbit.pitch = 0.92;
    renderNow();
  }

  function selectAt(e) {
    const pick = raycastPick(e);
    if (!pick) return;
    localPick = pick;
    if (selectHandler) selectHandler(pick);
    updateGizmo();
    renderNow();
  }

  function bindControls() {
    const el = renderer.domElement;
    let pointer = null;

    el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    el.addEventListener('pointerdown', function (e) {
      if (!Preview.active) return;
      e.preventDefault();
      el.setPointerCapture(e.pointerId);

      if (e.button !== 0 || e.shiftKey) {
        pointer = { id: e.pointerId, x: e.clientX, y: e.clientY,
          startX: e.clientX, startY: e.clientY, mode: 'pan' };
        return;
      }
      if (editMode === 'view') {
        pointer = { id: e.pointerId, x: e.clientX, y: e.clientY,
          startX: e.clientX, startY: e.clientY, mode: 'orbit' };
        return;
      }

      const handle = raycastGizmo(e);
      if (handle && isTransformable(currentPick()) && beginTransform(e, handle)) {
        pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, mode: 'transform' };
        return;
      }
      selectAt(e);
      pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, mode: 'select' };
    });

    el.addEventListener('pointermove', function (e) {
      if (!pointer || pointer.id !== e.pointerId || !Preview.active) return;
      if (pointer.mode === 'transform') {
        pointer.x = e.clientX; pointer.y = e.clientY;
        updateTransform(e);
        return;
      }
      const dx = e.clientX - pointer.x, dy = e.clientY - pointer.y;
      pointer.x = e.clientX; pointer.y = e.clientY;
      if (pointer.mode === 'orbit') {
        orbit.yaw -= dx * 0.006;
        orbit.pitch += dy * 0.005;
      } else if (pointer.mode === 'pan') {
        const scale = Math.max(0.2, orbit.distance * 0.0016);
        const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
        const forward = new THREE.Vector3().subVectors(orbit.target, camera.position);
        right.y = 0; forward.y = 0;
        if (right.lengthSq()) right.normalize();
        if (forward.lengthSq()) forward.normalize();
        orbit.target.addScaledVector(right, -dx * scale);
        orbit.target.addScaledVector(forward, dy * scale);
      }
      renderNow();
    });

    function endPointer(e) {
      if (!pointer || pointer.id !== e.pointerId) return;
      if (pointer.mode === 'orbit' && e.type === 'pointerup' &&
          Math.hypot(e.clientX - pointer.startX, e.clientY - pointer.startY) < 4) {
        selectAt(e);
      }
      if (pointer.mode === 'transform') endTransform();
      pointer = null;
    }
    el.addEventListener('pointerup', endPointer);
    el.addEventListener('pointercancel', endPointer);
    el.addEventListener('wheel', function (e) {
      if (!Preview.active) return;
      e.preventDefault();
      orbit.distance *= Math.exp(e.deltaY * 0.0012);
      renderNow();
    }, { passive: false });
    el.addEventListener('dblclick', function () { resetView(); });
  }

  function buildEnvironment() {
    const faces = [];
    for (let i = 0; i < 6; i++) {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const g = c.getContext('2d');
      let grad;
      if (i === 2) {
        grad = g.createLinearGradient(0, 0, 0, 128);
        grad.addColorStop(0, '#eaf7ff');
        grad.addColorStop(1, '#b8dcee');
      } else if (i === 3) {
        grad = g.createLinearGradient(0, 0, 0, 128);
        grad.addColorStop(0, '#a5ad8a');
        grad.addColorStop(1, '#5f6b52');
      } else {
        grad = g.createLinearGradient(0, 0, 0, 128);
        grad.addColorStop(0, '#d9effc');
        grad.addColorStop(0.58, '#f4e4c5');
        grad.addColorStop(1, '#7a8264');
      }
      g.fillStyle = grad;
      g.fillRect(0, 0, 128, 128);
      if (i === 0 || i === 4) {
        const glow = g.createRadialGradient(88, 40, 2, 88, 40, 54);
        glow.addColorStop(0, 'rgba(255,248,225,0.95)');
        glow.addColorStop(1, 'rgba(255,248,225,0)');
        g.fillStyle = glow;
        g.fillRect(0, 0, 128, 128);
      }
      faces.push(c);
    }
    const tex = new THREE.CubeTexture(faces);
    tex.needsUpdate = true;
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function applyStyle() {
    if (!scene || !renderer) return;
    const realistic = isRealistic();
    const mode = STYLE_HINTS[Preview.styleMode] ? Preview.styleMode : 'game';
    Preview.styleMode = mode;
    Preview.hintText = STYLE_HINTS[mode];
    if (hint && Preview.active) hint.textContent = Preview.hintText;
    renderer.shadowMap.enabled = realistic;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMappingExposure = realistic ? 1.18 : 1.05;
    scene.background = new THREE.Color(realistic ? 0x9fc6dd : 0x6fb7e8);
    scene.fog = realistic
      ? new THREE.Fog(0xa9c9d8, 900, 2600)
      : new THREE.Fog(0xf6d6a8, 700, 2200);
    scene.environment = realistic ? environment : null;
    if (sun) {
      sun.color.setHex(realistic ? 0xfff4dd : 0xffd2a0);
      sun.intensity = realistic ? 2.2 : 1.65;
      sun.position.set(realistic ? -320 : -240, realistic ? 520 : 360, realistic ? 280 : 180);
      sun.castShadow = realistic;
      sun.shadow.mapSize.set(2048, 2048);
      const s = 650;
      sun.shadow.camera.left = -s;
      sun.shadow.camera.right = s;
      sun.shadow.camera.top = s;
      sun.shadow.camera.bottom = -s;
      sun.shadow.camera.near = 1;
      sun.shadow.camera.far = 1800;
      sun.shadow.bias = -0.00035;
      sun.shadow.normalBias = 0.6;
    }
    if (fillLight) {
      fillLight.color.setHex(realistic ? 0xbcd8ff : 0xffffff);
      fillLight.intensity = realistic ? 0.55 : 0;
      fillLight.position.set(320, 180, -240);
    }
    renderer.shadowMap.needsUpdate = true;
  }

  Preview.init = function (wrap, hintEl, stateGetter) {
    container = wrap;
    hint = hintEl;
    getState = stateGetter;
    if (!container || !window.THREE || !THREE.WebGLRenderer) {
      Preview.available = false;
      if (hint) hint.textContent = '3D preview is unavailable in this browser.';
      return false;
    }
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch (e) {
      Preview.available = false;
      if (hint) hint.textContent = '3D preview could not create a WebGL renderer.';
      return false;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.cursor = 'grab';
    renderer.domElement.style.touchAction = 'none';
    container.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffe4bb, 0x58774d, 0.95));
    sun = new THREE.DirectionalLight(0xffd2a0, 1.65);
    scene.add(sun);
    fillLight = new THREE.DirectionalLight(0xffffff, 0);
    scene.add(fillLight);
    environment = buildEnvironment();
    applyStyle();

    camera = new THREE.PerspectiveCamera(55, 1, 0.5, 5000);
    raycaster = new THREE.Raycaster();
    gizmo = buildGizmo();
    gizmo.visible = false;
    scene.add(gizmo);
    bindControls();
    Preview.available = true;
    if (hint) hint.textContent = Preview.hintText;
    return true;
  };

  Preview.setActive = function (on) {
    Preview.active = !!on && Preview.available;
    if (!renderer) return false;
    if (Preview.active) {
      Preview.resize();
      rebuild(getState && getState(), true);
      resetView();
    } else {
      endTransform();
    }
    return Preview.active;
  };

  Preview.refresh = function (force) {
    if (!Preview.active) return;
    rebuild(getState && getState(), !!force);
  };

  Preview.resize = function () {
    if (!renderer || !container) return;
    const w = container.clientWidth || 800;
    const h = container.clientHeight || 600;
    renderer.setSize(w, h, false);
    if (camera) { camera.aspect = w / h; camera.updateProjectionMatrix(); }
    renderNow();
  };

  Preview.focus = function () { resetView(); };

  // ----- data-driven editing API ------------------------------------------

  Preview.setSelectHandler = function (fn) {
    selectHandler = typeof fn === 'function' ? fn : null;
  };

  Preview.setTransformHandler = function (fn) {
    transformHandler = typeof fn === 'function' ? fn : null;
  };

  Preview.setEditMode = function (mode) {
    if (['view', 'move', 'rotate', 'scale'].indexOf(mode) < 0) mode = 'view';
    if (editMode !== mode) endTransform();
    editMode = mode;
    Preview.editMode = mode;
    if (renderer) renderer.domElement.style.cursor = mode === 'view' ? 'grab' : 'default';
    updateGizmo();
    renderNow();
    return mode;
  };

  Preview.setStyleMode = function (mode) {
    mode = mode === 'realistic' ? 'realistic' : 'game';
    if (Preview.styleMode !== mode) {
      Preview.styleMode = mode;
      applyStyle();
      lastSignature = '';
      if (Preview.active) rebuild(getState && getState(), true);
    } else {
      applyStyle();
    }
    renderNow();
    return Preview.styleMode;
  };
})();
