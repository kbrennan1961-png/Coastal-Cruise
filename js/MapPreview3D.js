/* Coastal Cruise - optional 3D preview for map-editor.html.
   Uses the same baked model loader as the game, so placed models look like
   their in-game versions. Loaded before MapEditor.js; no network access. */
(function () {
  'use strict';

  const CC = (window.CC = window.CC || {});
  const Preview = (CC.MapPreview3D = {
    available: false,
    active: false,
    hintText: '3D preview: drag to orbit, right/middle/Shift+drag to pan, wheel to zoom, double-click to fit. Press P to return to 2D.'
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

  function disposeRoot() {
    if (!root) return;
    root.traverse(function (obj) {
      if (!obj.userData || !obj.userData.previewOwned) return;
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(function (m) { m.dispose(); });
        else obj.material.dispose();
      }
    });
    scene.remove(root);
    root = null;
    if (texture) { texture.dispose(); texture = null; }
  }

  function signatureOf(state) {
    return JSON.stringify([
      worldOf(state), state.newMap, state.layers, state.selection,
      state.roads, state.buildings, state.landmarks, state.assets,
      state.elevation, state.terrainCanvas ? state.terrainCanvas.width : 0,
      state.terrainCanvas ? state.terrainCanvas.height : 0
    ]);
  }

  function makeMaterial(color, opts) {
    return new THREE.MeshLambertMaterial(Object.assign({
      color: color, side: THREE.DoubleSide, flatShading: true
    }, opts || {}));
  }

  function addBox(parent, state, o) {
    const w = Math.max(1, Number(o.w) || 10);
    const l = Math.max(1, Number(o.l) || 8);
    const h = Math.max(0.5, Number(o.h) || 4);
    const base = heightAt(state, o.x, o.z);
    const y = base + (Number(o.yOffset) || 0) + h * 0.5;
    const mesh = own(new THREE.Mesh(new THREE.BoxGeometry(w, h, l),
      makeMaterial(o.color == null ? 0xd9c7a8 : o.color)));
    mesh.position.set(Number(o.x) || 0, y, Number(o.z) || 0);
    mesh.rotation.y = Number(o.rot) || 0;
    mesh.castShadow = mesh.receiveShadow = true;
    if (o.pick) mesh.userData.pick = o.pick;
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
      color: color == null ? undefined : color
    });
    if (!obj) return;
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
      material = new THREE.MeshLambertMaterial({ map: texture, side: THREE.DoubleSide });
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

  function rebuild(state, force) {
    if (!renderer || !scene || !state) return;
    const sig = signatureOf(state);
    if (!force && sig === lastSignature) return;
    lastSignature = sig;
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
            yOffset: Number(a.y) || 0, pick: pick
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
  }

  function renderNow() {
    if (!renderer || !scene || !camera || !Preview.active) return;
    updateCamera();
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

  function bindControls() {
    const el = renderer.domElement;
    let pointer = null;

    el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    el.addEventListener('pointerdown', function (e) {
      if (!Preview.active) return;
      pointer = {
        id: e.pointerId, x: e.clientX, y: e.clientY,
        mode: (e.button === 0 && !e.shiftKey) ? 'orbit' : 'pan'
      };
      el.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    el.addEventListener('pointermove', function (e) {
      if (!pointer || pointer.id !== e.pointerId || !Preview.active) return;
      const dx = e.clientX - pointer.x, dy = e.clientY - pointer.y;
      pointer.x = e.clientX; pointer.y = e.clientY;
      if (pointer.mode === 'orbit') {
        orbit.yaw -= dx * 0.006;
        orbit.pitch += dy * 0.005;
      } else {
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
      if (pointer && pointer.id === e.pointerId) pointer = null;
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
    scene.background = new THREE.Color(0x6fb7e8);
    scene.fog = new THREE.Fog(0xf6d6a8, 700, 2200);
    scene.add(new THREE.HemisphereLight(0xffe4bb, 0x58774d, 0.95));
    const sun = new THREE.DirectionalLight(0xffd2a0, 1.65);
    sun.position.set(-240, 360, 180);
    scene.add(sun);

    camera = new THREE.PerspectiveCamera(55, 1, 0.5, 5000);
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
})();
