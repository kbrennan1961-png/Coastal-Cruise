/* Coastal Cruise - offline companion map editor.
   Runs from file:// next to index.html. Exports js/MapEdits.js patches. */
(function () {
  'use strict';

  const CC = window.CC;
  const C = CC.C;
  const DEFAULT_WORLD = C.WORLD;
  const canvas = document.getElementById('mapCanvas');
  const ctx = canvas.getContext('2d');
  const $ = function (id) { return document.getElementById(id); };

  const HINTS = {
    select: 'Select: click an asset or road point, then drag to move it.',
    road: 'Road: click to add points; double-click or Enter to finish; Esc cancels.',
    roadErase: 'Erase road: click a segment to split it; Shift+click deletes the whole road.',
    building: 'Building: drag to size a rectangle, or click for the default size.',
    bridge: 'Bridge: drag across the water; adds a road plus a bridge deck.',
    tree: 'Tree: click to place one at the current brush scale.',
    paint: 'Paint brush: drag to stamp trees or baked models. Adjust size, spacing, scatter and scale in the Brush panel.',
    assetErase: 'Erase asset: click a building, landmark or custom asset to remove it.',
    model: 'Model: click to place a baked Blender/baked model from the brush list.',
    trailer: 'Trailer: click a start point, then a finish point to script a road-following or straight-flight shot.',
    mission: 'Mission: click to add an INAV waypoint; drag an existing waypoint to move it. Double-click to edit.',
    pan: 'Pan: drag the map. Middle mouse or Space+drag also pans.'
  };

  const MODEL_RECORDS = (CC.AssetLoader && CC.AssetLoader.models) || {};
  let MODEL_KEYS = Object.keys(MODEL_RECORDS).sort();

  const GTA_TYPES = [
    { key: 'textures', label: 'Textures' },
    { key: 'buildings', label: 'Buildings' },
    { key: 'roads', label: 'Roads' },
    { key: 'characters', label: 'Characters' },
    { key: 'vehicles', label: 'Vehicles' },
    { key: 'trees', label: 'Trees' },
    { key: 'props', label: 'Props' },
    { key: 'models', label: 'Models' }
  ];
  const GTA = (CC.GTAImport = CC.GTAImport || { version: 1, assets: [], categories: GTA_TYPES });
  if (!Array.isArray(GTA.assets)) GTA.assets = [];
  if (!Array.isArray(GTA.categories)) GTA.categories = GTA_TYPES;
  if (!GTA.models || typeof GTA.models !== 'object' || Array.isArray(GTA.models)) GTA.models = {};
  if (!GTA.textures || typeof GTA.textures !== 'object' || Array.isArray(GTA.textures)) GTA.textures = {};
  // A converter-generated CommunityAssets.js may already hold models/textures
  // without listing them on GTAImport. Keep those in the writable registry too
  // so "Apply to game" never drops assets that the editor can already see.
  Object.keys(MODEL_RECORDS).forEach(function (key) {
    if (MODEL_RECORDS[key] && MODEL_RECORDS[key].gtaType && !GTA.models[key]) {
      GTA.models[key] = MODEL_RECORDS[key];
    }
  });
  GTA.communityAssetsText = communityAssetsText;

  function refreshModelKeys() {
    MODEL_KEYS = Object.keys(MODEL_RECORDS).sort();
  }

  function modelLabel(key) {
    return String(key)
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
      .replace(/([a-z])(\d)/g, '$1 $2')
      .replace(/^./, function (c) { return c.toUpperCase(); });
  }

  function modelGroup(key) {
    const m = MODEL_RECORDS[key] || {};
    if (m.kind === 'downloadedRock') return 'Rocks';
    if (m.gtaType) {
      const found = GTA.categories.find(function (c) { return c.key === m.gtaType; });
      return found ? 'GTA · ' + found.label : 'GTA assets';
    }
    if (m.kind) return modelLabel(m.kind) + 's';
    if (m.wheels) return 'Vehicles';
    return 'Baked scenery';
  }

  function fillModelSelect(select, selected) {
    if (!select) return;
    select.textContent = '';
    const groups = new Map();
    MODEL_KEYS.forEach(function (key) {
      const name = modelGroup(key);
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(key);
    });
    groups.forEach(function (keys, name) {
      const group = document.createElement('optgroup');
      group.label = name;
      keys.forEach(function (key) {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = modelLabel(key);
        group.appendChild(option);
      });
      select.appendChild(group);
    });
    if (selected && MODEL_RECORDS[selected]) select.value = selected;
  }

  function textureLabel(key) {
    const found = GTA.assets.find(function (a) { return a.texture === key || a.key === key; });
    if (found && found.label) return String(found.label);
    return String(key).replace(/^gtaTex_/, '').replace(/_/g, ' ');
  }

  function fillTextureSelect(select, selected) {
    if (!select) return;
    const textures = (CC.GeneratedAssets && CC.GeneratedAssets.textures) || {};
    select.textContent = '';
    const none = document.createElement('option');
    none.value = '';
    none.textContent = 'None';
    select.appendChild(none);
    Object.keys(textures).sort(function (a, b) {
      return textureLabel(a).localeCompare(textureLabel(b));
    }).forEach(function (key) {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = textureLabel(key);
      select.appendChild(option);
    });
    select.value = selected || '';
  }

  function gtaTypeLabel(type) {
    const found = GTA.categories.find(function (c) { return c.key === type; });
    return found ? found.label : modelLabel(type || 'asset');
  }

  function modelFootprint(a) {
    const key = a && (a.model || a.modelKey || a.key);
    const model = key && MODEL_RECORDS[key];
    if (!model || !model.bounds || !CC.AssetLoader || !CC.AssetLoader.footprint) return null;
    const fp = CC.AssetLoader.footprint(key);
    if (!fp) return null;
    const scale = (Number(a.scale) || 1) * (Number(model.scale) || 1);
    return { w: fp.w * scale, l: fp.l * scale, h: fp.h * scale };
  }

  let paintSerial = 0;
  function brushSettings() {
    const num = function (id, fallback) {
      const el = $(id);
      const v = el ? Number(el.value) : NaN;
      return Number.isFinite(v) ? v : fallback;
    };
    const checked = function (id) {
      const el = $(id);
      return !!(el && el.checked);
    };
    return {
      kind: ($('paintKind') && $('paintKind').value) || 'tree',
      model: ($('paintModel') && $('paintModel').value) || MODEL_KEYS[0],
      size: Math.max(2, num('paintSize', 14)),
      spacing: Math.max(2, num('paintSpacing', 10)),
      scatter: Math.max(0, Math.min(1, num('paintJitter', 35) / 100)),
      scale: Math.max(0.05, num('paintScale', 1)),
      randomRot: checked('paintRandomRot'),
      varyScale: checked('paintVaryScale')
    };
  }

  // Deterministic scatter keeps a painted stroke reproducible after export.
  function brushNoise(seed, salt) {
    const n = Math.sin((seed + 1) * 127.1 + salt * 311.7) * 43758.5453;
    return n - Math.floor(n);
  }

  function stampBrushAt(x, z, stampIndex) {
    const b = brushSettings();
    const radius = b.size * b.scatter;
    const angle = brushNoise(stampIndex, 1) * Math.PI * 2;
    const offset = radius ? Math.sqrt(brushNoise(stampIndex, 2)) * radius : 0;
    const px = x + Math.cos(angle) * offset;
    const pz = z + Math.sin(angle) * offset;
    const scale = b.scale * (b.varyScale ? 0.82 + brushNoise(stampIndex, 3) * 0.36 : 1);
    const asset = {
      id: 'paint_' + Date.now().toString(36) + '_' + (paintSerial++),
      x: px, z: pz, y: 0, scale: scale,
      rot: b.randomRot ? brushNoise(stampIndex, 4) * Math.PI * 2 : 0,
      description: ''
    };
    if (b.kind === 'model' && MODEL_RECORDS[b.model]) {
      asset.type = 'model';
      asset.model = b.model;
      asset.name = 'Painted ' + modelLabel(b.model);
      const fp = modelFootprint(asset);
      if (fp) { asset.w = fp.w; asset.l = fp.l; asset.h = fp.h; }
    } else {
      asset.type = 'tree';
      asset.name = 'Painted tree';
    }
    state.assets.push(asset);
    return asset;
  }

  const state = {
    world: Object.assign({}, DEFAULT_WORLD),
    newMap: false,
    standaloneGame: false,
    gameName: '',
    mapName: 'Coastal Cruise',
    roads: [], buildings: [], landmarks: [], challenges: [], assets: [], trailerShots: [],
    missions: [], missionEditIndex: -1, wpEditIndex: -1,
    trailerDraft: null, shotEditIndex: -1, transformMode: 'view', transformBase: null,
    elevation: { hills: [], points: [], grid: null },
    view: { scale: 1, tx: 0, ty: 0 },
    tool: 'select',
    grid: true,
    layers: { roads: true, buildings: true, landmarks: true, custom: true, elevation: true },
    selection: null,
    draft: null,
    drag: null,
    mouse: { sx: 0, sy: 0, wx: 0, wz: 0, inside: false },
    spaceDown: false,
    undo: [], redo: [],
    didFit: false
  };

  let assetDialogResolve = null;
  let assetDialogDefault = '';
  let blenderGenerateCommand = '';

  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  function bounds() { return state.world; }

  function currentPatch() {
    return CC.mapEdits && CC.mapEdits.active ? CC.mapEdits : null;
  }

  /* ---------- mission model ----------
     INAV units throughout: altCm/speedCmS/nav_wp_* are centimetres (and cm/s),
     100 cm = 1 game world unit. Jump targets are 1-based waypoint numbers. */
  const MISSION_ACTIONS = ['WAYPOINT', 'POSHOLD_TIME', 'JUMP', 'SET_POI', 'LAND'];
  const ACTION_LABELS = {
    WAYPOINT: 'WP', POSHOLD_TIME: 'HOLD', JUMP: 'JUMP', SET_POI: 'POI', LAND: 'LAND'
  };
  const ACTION_COLORS = {
    WAYPOINT: '#8fd3ff', POSHOLD_TIME: '#f2b35c', JUMP: '#c792ea',
    SET_POI: '#ff8fb1', LAND: '#ff5c5c'
  };

  function missionNumber(value, fallback) {
    if (value == null || String(value).trim() === '') return fallback;
    const n = Number(value);
    return isFinite(n) ? n : fallback;
  }

  function normalizeMission(m) {
    m = m || {};
    m.version = 1;
    m.name = m.name || 'Mission';
    m.actions = Array.isArray(m.actions) ? m.actions
      : (Array.isArray(m.waypoints) ? m.waypoints : []);
    m.nav_wp_radius = Math.max(50, missionNumber(
      m.nav_wp_radius != null ? m.nav_wp_radius : m.safeRadius, 200));
    m.nav_wp_safe_distance = Math.max(0, missionNumber(
      m.nav_wp_safe_distance != null ? m.nav_wp_safe_distance : m.safeDistance, 500));
    m.nav_wp_enforce_altitude = m.nav_wp_enforce_altitude != null
      ? !!m.nav_wp_enforce_altitude : !!m.enforceAltitude;
    m.finalAction = 'RTH';
    // Runtime aliases keep hand-edited patches readable in both naming styles.
    m.safeRadius = m.nav_wp_radius;
    m.safeDistance = m.nav_wp_safe_distance;
    m.enforceAltitude = m.nav_wp_enforce_altitude;
    if (m.home && (!isFinite(Number(m.home.x)) || !isFinite(Number(m.home.z)))) m.home = null;
    return m;
  }

  function newMission(name) {
    return normalizeMission({
      version: 1,
      name: name || ('Mission ' + (state.missions.length + 1)),
      home: null,
      actions: [],
      nav_wp_radius: 200,
      nav_wp_safe_distance: 500,
      nav_wp_enforce_altitude: true,
      finalAction: 'RTH'
    });
  }

  function newWaypoint(x, z, index) {
    return {
      action: 'WAYPOINT',
      name: '',
      x: x, z: z,
      altCm: 500,
      speedCmS: 1500,
      holdSec: 2,
      jumpTarget: index || 1,
      poi: { x: x, z: z, y: 0 }
    };
  }

  function activeMission() {
    if (!state.missions.length) return null;
    if (state.missionEditIndex < 0 || state.missionEditIndex >= state.missions.length) {
      state.missionEditIndex = 0;
    }
    return state.missions[state.missionEditIndex];
  }

  // Editing enforces nav_wp_safe_distance as a minimum spacing between points.
  function clampMissionPoint(m, wp, ignoreIndex) {
    const min = m ? missionNumber(m.nav_wp_safe_distance, 500) / 100 : 0;
    if (!(min > 0) || !wp) return;
    const actions = m.actions || [];
    for (let i = 0; i < actions.length; i++) {
      if (i === ignoreIndex || actions[i] === wp) continue;
      const other = actions[i];
      let dx = wp.x - other.x, dz = wp.z - other.z;
      let d = Math.hypot(dx, dz);
      if (d >= min) continue;
      if (d < 1e-6) { dx = 1; dz = 0; d = 1; }
      wp.x = other.x + dx / d * min;
      wp.z = other.z + dz / d * min;
    }
  }

  function gameMapData() {
    const baked = CC.bakedMap || {};
    const IM = CC.ImageMap;
    const active = IM && IM.ready ? IM : null;
    return {
      roads: active && active.roads && active.roads.length ? active.roads : (baked.roads || []),
      buildings: active && active.buildings ? active.buildings : (baked.buildings || []),
      landmarks: active && active.landmarks ? active.landmarks : (baked.landmarks || []),
      challenges: active && active.challenges ? active.challenges : (baked.challenges || [])
    };
  }

  function gameBaseRoads() {
    const IM = CC.ImageMap;
    if (IM && IM.ready && IM.roads && IM.roads.length) return clone(IM.roads);
    const bakedRoads = (CC.bakedMap && CC.bakedMap.roads) || [];
    return CC.simplifyRoads ? CC.simplifyRoads(clone(bakedRoads)) : clone(bakedRoads);
  }

  function initData() {
    const patch = currentPatch();
    const baked = gameMapData();
    state.world = patch && patch.world ? clone(patch.world) : clone(DEFAULT_WORLD);
    state.newMap = !!(patch && patch.newMap);
    state.standaloneGame = !!(patch && patch.standaloneGame);
    state.gameName = patch && patch.gameName ? patch.gameName : '';
    state.mapName = patch && patch.mapName ? patch.mapName : 'Coastal Cruise';
    state.roads = clone(patch && Array.isArray(patch.roads)
      ? patch.roads
      : gameBaseRoads());
    state.buildings = clone(patch && Array.isArray(patch.buildings) ? patch.buildings : baked.buildings);
    state.landmarks = clone(patch && Array.isArray(patch.landmarks) ? patch.landmarks : baked.landmarks);
    state.challenges = clone(patch && Array.isArray(patch.challenges) ? patch.challenges : baked.challenges);
    state.trailerShots = clone(patch && Array.isArray(patch.trailerShots) ? patch.trailerShots : []);
    state.missions = clone(patch && Array.isArray(patch.missions)
      ? patch.missions : (CC.missions || []));
    state.missions.forEach(normalizeMission);
    state.missionEditIndex = state.missions.length ? 0 : -1;
    state.assets = clone(patch && patch.assets ? patch.assets : []);
    state.elevation = clone(patch && patch.elevation
      ? patch.elevation : { hills: [], points: [], grid: null });
    updateApplyButton();
  }

  /* ---------- terrain preview ----------
     The game paints its playable ground into ImageMap.groundCanvas. Use that
     exact canvas as the editor backdrop so the 2D map, full-screen planner and
     3D preview all show the same shoreline, river, zones and road corridor. */
  let terrainCanvas = null;
  function buildTerrain() {
    state.terrainCanvas = null;
    const IM = CC.ImageMap;
    if (IM && IM.groundCanvas && !state.newMap) {
      terrainCanvas = IM.groundCanvas;
      state.terrainCanvas = terrainCanvas;
      return;
    }
    const cell = 3;
    const w = Math.ceil((bounds().maxX - bounds().minX) / cell);
    const h = Math.ceil((bounds().maxZ - bounds().minZ) / cell);
    terrainCanvas = document.createElement('canvas');
    terrainCanvas.width = w;
    terrainCanvas.height = h;
    const tctx = terrainCanvas.getContext('2d');
    const img = tctx.createImageData(w, h);
    const d = img.data;
    for (let j = 0; j < h; j++) {
      const z = bounds().minZ + (j + 0.5) * cell;
      for (let i = 0; i < w; i++) {
        const x = bounds().minX + (i + 0.5) * cell;
        let r = 143, g = 174, b = 99;
        if (state.newMap) {
          const shade = ((i + j) % 7) - 3;
          r += shade; g += shade; b += shade;
        } else if (CC.coast && CC.coast.isWater(x, z)) {
          r = 45; g = 143; b = 181;
        } else if (CC.coast) {
          const dist = CC.coast.distanceToWater(x, z);
          if (dist < 10) { r = 232; g = 212; b = 162; }
          else if (CC.coast.inMarsh(x, z)) { r = 127; g = 160; b = 106; }
        }
        const p = (j * w + i) * 4;
        d[p] = r; d[p + 1] = g; d[p + 2] = b; d[p + 3] = 255;
      }
    }
    tctx.putImageData(img, 0, 0);
    state.terrainCanvas = terrainCanvas;
  }

  /* ---------- coordinate helpers ---------- */
  const worldW = function () { return bounds().maxX - bounds().minX; };
  const worldH = function () { return bounds().maxZ - bounds().minZ; };

  function worldToScreen(x, z) {
    const v = state.view;
    return { x: (x - bounds().minX) * v.scale + v.tx, y: (z - bounds().minZ) * v.scale + v.ty };
  }

  function screenToWorld(sx, sy) {
    const v = state.view;
    return { x: (sx - v.tx) / v.scale + bounds().minX, z: (sy - v.ty) / v.scale + bounds().minZ };
  }

  function fitView() {
    const vw = canvas.clientWidth || 800;
    const vh = canvas.clientHeight || 600;
    state.view.scale = Math.min(vw / worldW(), vh / worldH()) * 0.94;
    state.view.tx = (vw - worldW() * state.view.scale) * 0.5;
    state.view.ty = (vh - worldH() * state.view.scale) * 0.5;
    state.didFit = true;
    updateZoomLabel();
  }

  function zoomAt(factor, sx, sy) {
    const before = screenToWorld(sx, sy);
    state.view.scale = Math.max(0.12, Math.min(8, state.view.scale * factor));
    const after = screenToWorld(sx, sy);
    state.view.tx += (after.x - before.x) * state.view.scale;
    state.view.ty += (after.z - before.z) * state.view.scale;
    updateZoomLabel();
    render();
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!state.didFit) fitView();
    render();
    if (CC.MapPreview3D) CC.MapPreview3D.resize();
  }

  /* ---------- drawing ---------- */
  function roadColor(type) {
    return ({ paved: '#3f454c', gravel: '#9b8e75', dirt: '#8a6b4a', boardwalk: '#a87b4e' })[type] || '#3f454c';
  }

  function drawGrid() {
    if (!state.grid) return;
    const vw = canvas.clientWidth, vh = canvas.clientHeight;
    const tl = screenToWorld(0, 0), br = screenToWorld(vw, vh);
    ctx.save();
    ctx.font = '10px Arial';
    ctx.textBaseline = 'top';

    for (let x = Math.ceil(tl.x / 25) * 25; x <= br.x; x += 25) {
      const sx = worldToScreen(x, 0).x;
      const major = Math.abs(x % 100) < 0.01;
      ctx.strokeStyle = major ? 'rgba(180,220,235,0.30)' : 'rgba(150,190,210,0.10)';
      ctx.lineWidth = major ? 1 : 0.6;
      ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, vh); ctx.stroke();
      if (major) {
        ctx.fillStyle = 'rgba(210,235,245,0.72)';
        ctx.fillText('x' + x, sx + 3, 3);
      }
    }
    for (let z = Math.ceil(tl.z / 25) * 25; z <= br.z; z += 25) {
      const sy = worldToScreen(0, z).y;
      const major = Math.abs(z % 100) < 0.01;
      ctx.strokeStyle = major ? 'rgba(180,220,235,0.30)' : 'rgba(150,190,210,0.10)';
      ctx.lineWidth = major ? 1 : 0.6;
      ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(vw, sy); ctx.stroke();
      if (major) {
        ctx.fillStyle = 'rgba(210,235,245,0.72)';
        ctx.fillText('z' + z, 3, sy + 3);
      }
    }
    // Axes.
    ctx.strokeStyle = 'rgba(245,190,90,0.5)';
    ctx.lineWidth = 1.2;
    const ox = worldToScreen(0, 0).x, oy = worldToScreen(0, 0).y;
    ctx.beginPath(); ctx.moveTo(ox, 0); ctx.lineTo(ox, vh); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, oy); ctx.lineTo(vw, oy); ctx.stroke();
    ctx.restore();
  }

  function drawElevation() {
    if (!state.layers.elevation || !state.elevation) return;
    const items = (state.elevation.hills || []).concat(state.elevation.points || []);
    if (!items.length) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(242,179,92,0.42)';
    ctx.lineWidth = 1;
    items.forEach(function (h) {
      const p = worldToScreen(h.x, h.z);
      const r = Math.max(3, (h.r || 25) * state.view.scale);
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * i / 3, 0, Math.PI * 2);
        ctx.stroke();
      }
    });
    ctx.restore();
  }

  function roadSegments(road) {
    const pts = road.points || [];
    if (pts.length < 2) return [];
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) out.push({ a: pts[i], b: pts[i + 1], i: i });
    if (road.closed) out.push({ a: pts[pts.length - 1], b: pts[0], i: pts.length - 1 });
    return out;
  }

  function drawRoads() {
    const scale = state.view.scale;
    state.roads.forEach(function (road) {
      const pts = road.points || [];
      if (pts.length < 2) return;
      ctx.beginPath();
      pts.forEach(function (p, i) {
        const s = worldToScreen(p[0], p[1]);
        if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
      });
      if (road.closed) ctx.closePath();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = roadColor(road.type);
      ctx.lineWidth = Math.max(2, (road.width || 10) * scale);
      ctx.stroke();
      if (scale > 0.55) {
        ctx.save();
        ctx.setLineDash([5, 7]);
        ctx.strokeStyle = 'rgba(255,255,255,0.38)';
        ctx.lineWidth = Math.max(0.6, (road.width || 10) * scale * 0.07);
        ctx.stroke();
        ctx.restore();
      }
      if (scale > 0.42 && road.name) {
        const a = pts[Math.floor((pts.length - 1) / 2)];
        const b = pts[Math.floor((pts.length - 1) / 2) + 1] || a;
        const s = worldToScreen((a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5);
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillText(road.name, s.x, s.y - Math.max(4, (road.width || 10) * scale * 0.5) - 3);
        ctx.textAlign = 'left';
      }
    });
  }

  function assetColor(a, kind) {
    if (a.color != null) {
      if (typeof a.color === 'string') return a.color;
      return '#' + (a.color >>> 0).toString(16).padStart(6, '0');
    }
    if (kind === 'landmark') {
      return ({ store: '#e6d6ad', restaurant: '#d9c7a8', launch: '#8db8c9', pavilion: '#b6a37c' })[a.type] || '#c9b79a';
    }
    if (a.type === 'tree') return '#4d8a4a';
    if (a.type === 'model' || a.type === 'glb' || a.type === 'gltf') return '#57b7c8';
    if (a.type === 'bridge') return '#5b5f66';
    return '#d9c7a8';
  }

  function drawRectAsset(a, kind, dashed) {
    const p = worldToScreen(a.x, a.z);
    const w = Math.max(1, (a.w || 10) * state.view.scale);
    const l = Math.max(1, (a.l || 8) * state.view.scale);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(-(a.rot || 0));
    ctx.fillStyle = assetColor(a, kind);
    ctx.globalAlpha = 0.88;
    ctx.fillRect(-w / 2, -l / 2, w, l);
    ctx.globalAlpha = 1;
    ctx.lineWidth = dashed ? 2 : 1;
    ctx.strokeStyle = dashed ? '#35c6d8' : 'rgba(20,28,34,0.8)';
    if (dashed) ctx.setLineDash([4, 3]);
    ctx.strokeRect(-w / 2, -l / 2, w, l);
    ctx.setLineDash([]);
    ctx.restore();
    if ((a.name || a.type) && state.view.scale > 0.36) {
      ctx.font = '10px Arial';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillText(a.name || a.type, p.x, p.y + l * 0.5 + 11);
      ctx.textAlign = 'left';
    }
  }

  function drawTree(a, dashed) {
    const p = worldToScreen(a.x, a.z);
    const r = Math.max(3, 2.2 * (a.scale || 1) * state.view.scale);
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = assetColor(a, 'asset');
    ctx.globalAlpha = 0.9;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = dashed ? '#35c6d8' : '#2d5c34';
    ctx.lineWidth = dashed ? 2 : 1;
    if (dashed) ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawModel(a, dashed) {
    const fp = modelFootprint(a);
    const proxy = Object.assign({}, a, {
      w: fp ? fp.w : (a.w || 4),
      l: fp ? fp.l : (a.l || 4),
      color: a.color != null ? a.color : 0x57b7c8,
      name: a.name || modelLabel(a.model || a.key || 'Model') + ' · model'
    });
    drawRectAsset(proxy, 'asset', dashed);
  }

  function drawAssets() {
    if (state.layers.buildings) state.buildings.forEach(function (a) { drawRectAsset(a, 'building', false); });
    if (state.layers.landmarks) state.landmarks.forEach(function (a) { drawRectAsset(a, 'landmark', false); });
    if (!state.layers.custom) return;
    state.assets.forEach(function (a) {
      if (a.type === 'tree') drawTree(a, false);
      else if (a.type === 'model' || a.type === 'glb' || a.type === 'gltf') drawModel(a, false);
      else drawRectAsset(a, 'asset', false);
    });
  }

  function drawTrailerShots() {
    const pending = state.trailerDraft;
    const entries = state.trailerShots.map(function (s, i) { return { shot: s, index: i, pending: false }; });
    if (pending) entries.push({ shot: pending, index: -1, pending: true });
    if (!entries.length) return;
    ctx.save();
    ctx.font = '10px Arial';
    entries.forEach(function (entry) {
      const shot = entry.shot || {};
      const start = shot.start || {};
      const finish = shot.finish || {};
      if (!isFinite(Number(start.x)) || !isFinite(Number(start.z))) return;
      const a = worldToScreen(Number(start.x), Number(start.z));
      const mode = shot.mode || (isAirVehicle(shot.vehicle) ? 'straight' : 'road');
      const color = mode === 'straight' ? '#f2b35c' : '#35c6d8';
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = entry.pending ? 1.5 : 2;
      ctx.setLineDash(entry.pending ? [5, 4] : [9, 5]);
      if (isFinite(Number(finish.x)) && isFinite(Number(finish.z))) {
        const b = worldToScreen(Number(finish.x), Number(finish.z));
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillRect(b.x - 4, b.y - 4, 8, 8);
      } else {
        const b = worldToScreen(state.mouse.wx, state.mouse.wz);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.beginPath(); ctx.arc(a.x, a.y, 5, 0, Math.PI * 2); ctx.fill();
      const label = entry.pending ? 'PICK FINISH' : ((entry.index + 1) + ' · ' + (shot.name || shot.vehicle || 'shot'));
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillText(label, a.x + 8, a.y - 6);
    });
    ctx.restore();
  }

  function drawMissions() {
    if (!state.missions.length) return;
    ctx.save();
    ctx.font = '10px Arial';
    ctx.textBaseline = 'middle';
    state.missions.forEach(function (m, mi) {
      const actions = m.actions || [];
      if (!actions.length) return;
      const home = m.home;
      if (home && isFinite(Number(home.x)) && isFinite(Number(home.z))) {
        const hp = worldToScreen(Number(home.x), Number(home.z));
        ctx.strokeStyle = '#f2b35c';
        ctx.fillStyle = 'rgba(242,179,92,0.35)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(hp.x, hp.y - 6); ctx.lineTo(hp.x + 6, hp.y);
        ctx.lineTo(hp.x, hp.y + 6); ctx.lineTo(hp.x - 6, hp.y);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ffe2a8';
        ctx.fillText('HOME', hp.x + 9, hp.y);
      }
      const first = actions[0];
      const fp = worldToScreen(missionNumber(first.x, 0), missionNumber(first.z, 0));
      const radius = missionNumber(m.nav_wp_radius, 200) / 100 * state.view.scale;
      if (radius > 3 && radius < canvas.clientWidth) {
        ctx.strokeStyle = 'rgba(143,211,255,0.28)';
        ctx.setLineDash([3, 5]);
        ctx.beginPath(); ctx.arc(fp.x, fp.y, radius, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.beginPath();
      actions.forEach(function (wp, i) {
        const p = worldToScreen(missionNumber(wp.x, 0), missionNumber(wp.z, 0));
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      });
      ctx.strokeStyle = 'rgba(143,211,255,0.65)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([7, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      actions.forEach(function (wp, i) {
        const p = worldToScreen(missionNumber(wp.x, 0), missionNumber(wp.z, 0));
        if (!isFinite(p.x) || !isFinite(p.y)) return;
        const action = MISSION_ACTIONS.indexOf(wp.action) >= 0 ? wp.action : 'WAYPOINT';
        const color = ACTION_COLORS[action];
        const sel = state.selection && state.selection.kind === 'mission' &&
          state.selection.mission === mi && state.selection.index === i;
        ctx.fillStyle = color;
        ctx.strokeStyle = sel ? '#ffffff' : 'rgba(12,20,26,0.9)';
        ctx.lineWidth = sel ? 2.5 : 1;
        ctx.beginPath(); ctx.arc(p.x, p.y, sel ? 7 : 5, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.fillText((i + 1) + ' ' + ACTION_LABELS[action], p.x + 9, p.y - 7);
        if (state.view.scale > 0.5) {
          ctx.fillStyle = 'rgba(220,240,250,0.72)';
          ctx.fillText(Math.round(missionNumber(wp.altCm, 0)) + 'cm', p.x + 9, p.y + 6);
        }
        if (action === 'SET_POI' && wp.poi && isFinite(Number(wp.poi.x)) && isFinite(Number(wp.poi.z))) {
          const q = worldToScreen(Number(wp.poi.x), Number(wp.poi.z));
          ctx.strokeStyle = '#ff8fb1';
          ctx.setLineDash([3, 3]);
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
          ctx.setLineDash([]);
          ctx.strokeRect(q.x - 4, q.y - 4, 8, 8);
        }
      });
    });
    ctx.restore();
  }

  function isAirVehicle(vehicle) {
    return vehicle === 'jetpack' || vehicle === 'plane' || vehicle === 'helicopter' || vehicle === 'fpv';
  }

  function drawDraft() {
    if (!state.draft || state.draft.length === 0) return;
    const pts = state.draft.concat([[state.mouse.wx, state.mouse.wz]]);
    ctx.save();
    ctx.strokeStyle = '#f2b35c';
    ctx.lineWidth = Math.max(1.5, Number($('roadWidth').value) * state.view.scale);
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    pts.forEach(function (p, i) {
      const s = worldToScreen(p[0], p[1]);
      if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#f2b35c';
    state.draft.forEach(function (p) {
      const s = worldToScreen(p[0], p[1]);
      ctx.fillRect(s.x - 3, s.y - 3, 6, 6);
    });
    ctx.restore();
  }

  function drawShapePreview() {
    const d = state.drag;
    if (!d || d.type !== 'shape') return;
    const a = d.anchor, b = d.current;
    ctx.save();
    ctx.strokeStyle = '#35c6d8';
    ctx.fillStyle = 'rgba(53,198,216,0.18)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    if (d.tool === 'building') {
      const p1 = worldToScreen(a.x, a.z), p2 = worldToScreen(b.x, b.z);
      const x = Math.min(p1.x, p2.x), y = Math.min(p1.y, p2.y);
      ctx.fillRect(x, y, Math.abs(p2.x - p1.x), Math.abs(p2.y - p1.y));
      ctx.strokeRect(x, y, Math.abs(p2.x - p1.x), Math.abs(p2.y - p1.y));
    } else if (d.tool === 'bridge') {
      const p1 = worldToScreen(a.x, a.z), p2 = worldToScreen(b.x, b.z);
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    }
    ctx.restore();
  }

  function getSelectedObject() {
    const s = state.selection;
    if (!s) return null;
    if (s.kind === 'road') return state.roads[s.index] || null;
    if (s.kind === 'mission') {
      const m = state.missions[s.mission];
      return m && (m.actions || [])[s.index] || null;
    }
    const arr = s.kind === 'asset' ? state.assets : s.kind === 'landmark' ? state.landmarks : state.buildings;
    return arr[s.index] || null;
  }

  function drawSelection() {
    const s = state.selection;
    if (!s) return;
    ctx.save();
    ctx.strokeStyle = '#35c6d8';
    ctx.lineWidth = 2;
    if (s.kind === 'road') {
      const road = state.roads[s.index];
      if (!road) return;
      (road.points || []).forEach(function (p, i) {
        const sp = worldToScreen(p[0], p[1]);
        ctx.fillStyle = i === s.vertex ? '#f2b35c' : '#35c6d8';
        ctx.fillRect(sp.x - 4, sp.y - 4, 8, 8);
      });
    } else {
      const a = getSelectedObject();
      if (!a) return;
      if (a.type === 'tree') drawTree(a, true);
      else if (a.type === 'model' || a.type === 'glb' || a.type === 'gltf') drawModel(a, true);
      else drawRectAsset(a, s.kind, true);
    }
    ctx.restore();
  }

  function drawCursor() {
    if (!state.mouse.inside) return;
    const s = worldToScreen(state.mouse.wx, state.mouse.wz);
    ctx.save();
    if (state.tool === 'paint') {
      const b = brushSettings();
      const r = Math.max(4, b.size * state.view.scale);
      ctx.strokeStyle = 'rgba(53,198,216,0.95)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(53,198,216,0.95)';
      ctx.fillRect(s.x - 2, s.y - 2, 4, 4);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(s.x - 9, s.y); ctx.lineTo(s.x - 3, s.y);
    ctx.moveTo(s.x + 3, s.y); ctx.lineTo(s.x + 9, s.y);
    ctx.moveTo(s.x, s.y - 9); ctx.lineTo(s.x, s.y - 3);
    ctx.moveTo(s.x, s.y + 3); ctx.lineTo(s.x, s.y + 9);
    ctx.stroke();
    ctx.restore();
  }

  function render() {
    const vw = canvas.clientWidth, vh = canvas.clientHeight;
    ctx.clearRect(0, 0, vw, vh);
    ctx.fillStyle = '#0d1216';
    ctx.fillRect(0, 0, vw, vh);
    if (terrainCanvas) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(terrainCanvas, state.view.tx, state.view.ty, worldW() * state.view.scale, worldH() * state.view.scale);
    }
    drawGrid();
    drawElevation();
    if (state.layers.roads) drawRoads();
    drawAssets();
    drawShapePreview();
    drawDraft();
    drawTrailerShots();
    drawMissions();
    drawSelection();
    drawCursor();
    updateCounts();
    if (CC.MapPreview3D && CC.MapPreview3D.active) CC.MapPreview3D.refresh();
  }

  /* ---------- hit testing ---------- */
  function hitAsset(sx, sy) {
    const p = screenToWorld(sx, sy);
    const groups = [
      { kind: 'asset', arr: state.assets },
      { kind: 'landmark', arr: state.landmarks },
      { kind: 'building', arr: state.buildings }
    ];
    const pad = 3 / state.view.scale;
    for (let g = groups.length - 1; g >= 0; g--) {
      const group = groups[g];
      if (group.kind === 'asset' && !state.layers.custom) continue;
      if (group.kind === 'landmark' && !state.layers.landmarks) continue;
      if (group.kind === 'building' && !state.layers.buildings) continue;
      for (let i = group.arr.length - 1; i >= 0; i--) {
        const a = group.arr[i];
        if (!a || a.hidden) continue;
        if (a.type === 'tree' && group.kind === 'asset') {
          if (Math.hypot(p.x - a.x, p.z - a.z) <= 2.6 * (a.scale || 1) + pad) {
            return { kind: group.kind, index: i };
          }
          continue;
        }
        const fp = (a.type === 'model' || a.type === 'glb' || a.type === 'gltf')
          ? modelFootprint(a) : null;
        const hitW = fp ? fp.w : (a.w || 10);
        const hitL = fp ? fp.l : (a.l || 8);
        const dx = p.x - a.x, dz = p.z - a.z;
        const c = Math.cos(a.rot || 0), s = Math.sin(a.rot || 0);
        const lx = dx * c - dz * s;
        const ly = dx * s + dz * c;
        if (Math.abs(lx) <= hitW * 0.5 + pad && Math.abs(ly) <= hitL * 0.5 + pad) {
          return { kind: group.kind, index: i };
        }
      }
    }
    return null;
  }

  function hitRoadVertex(sx, sy) {
    if (!state.layers.roads) return null;
    const radius = 7;
    let best = null, bestD = radius;
    state.roads.forEach(function (road, ri) {
      (road.points || []).forEach(function (p, pi) {
        const s = worldToScreen(p[0], p[1]);
        const d = Math.hypot(s.x - sx, s.y - sy);
        if (d < bestD) { bestD = d; best = { kind: 'road', index: ri, vertex: pi }; }
      });
    });
    return best;
  }

  function hitMissionWaypoint(sx, sy) {
    let best = null, bestD = 10;
    state.missions.forEach(function (m, mi) {
      (m.actions || []).forEach(function (wp, wi) {
        const s = worldToScreen(missionNumber(wp.x, 0), missionNumber(wp.z, 0));
        const d = Math.hypot(s.x - sx, s.y - sy);
        if (d < bestD) { bestD = d; best = { kind: 'mission', mission: mi, index: wi }; }
      });
    });
    return best;
  }

  function hitRoadSegment(sx, sy) {
    const p = screenToWorld(sx, sy);
    let best = null, bestD = Infinity;
    state.roads.forEach(function (road, ri) {
      roadSegments(road).forEach(function (seg) {
        const r = CC.util.distanceToSegment(p.x, p.z, seg.a[0], seg.a[1], seg.b[0], seg.b[1]);
        const tol = (road.width || 10) * 0.5 + 5 / state.view.scale;
        if (r.dist <= tol && r.dist < bestD) {
          bestD = r.dist;
          best = { kind: 'road', index: ri, seg: seg.i, t: r.t };
        }
      });
    });
    return best;
  }

  /* ---------- history ---------- */
  function snapshot() {
    return {
      world: clone(state.world), newMap: state.newMap,
      standaloneGame: state.standaloneGame, gameName: state.gameName,
      mapName: state.mapName,
      roads: clone(state.roads), buildings: clone(state.buildings),
      landmarks: clone(state.landmarks), challenges: clone(state.challenges),
      assets: clone(state.assets), trailerShots: clone(state.trailerShots),
      missions: clone(state.missions),
      elevation: clone(state.elevation)
    };
  }

  function restore(s) {
    if (s.world) state.world = clone(s.world);
    state.newMap = !!s.newMap;
    state.standaloneGame = !!s.standaloneGame;
    state.gameName = s.gameName || '';
    state.mapName = s.mapName || state.mapName;
    buildTerrain();
    state.roads = clone(s.roads);
    state.buildings = clone(s.buildings);
    state.landmarks = clone(s.landmarks);
    state.challenges = clone(s.challenges);
    state.assets = clone(s.assets || []);
    state.trailerShots = clone(s.trailerShots || []);
    state.missions = clone(s.missions || []);
    state.missions.forEach(normalizeMission);
    state.missionEditIndex = state.missions.length ? Math.min(
      Math.max(0, state.missionEditIndex), state.missions.length - 1) : -1;
    state.elevation = clone(s.elevation || { hills: [], points: [], grid: null });
    state.selection = null;
    state.draft = null;
    state.drag = null;
    $('draftHint').hidden = true;
    updateSelectionForm();
    renderMissionList();
    renderMissionWaypointList();
    updateHistoryButtons();
    updateApplyButton();
    render();
  }

  function pushUndo() {
    state.undo.push(snapshot());
    if (state.undo.length > 40) state.undo.shift();
    state.redo.length = 0;
    updateHistoryButtons();
  }

  function undo() {
    if (!state.undo.length) return;
    state.redo.push(snapshot());
    restore(state.undo.pop());
    setMessage('Undo.');
  }

  function redo() {
    if (!state.redo.length) return;
    state.undo.push(snapshot());
    restore(state.redo.pop());
    setMessage('Redo.');
  }

  function updateHistoryButtons() {
    $('undoBtn').disabled = state.undo.length === 0;
    $('redoBtn').disabled = state.redo.length === 0;
  }

  /* ---------- selection inspector ---------- */
  function updateSelectionForm() {
    const obj = getSelectedObject();
    if (!obj) {
      $('selectionEmpty').hidden = false;
      $('selectionEmpty').textContent = state.selection && state.selection.kind === 'mission'
        ? 'Mission waypoint selected — drag to move, Delete to remove, or edit it in the INAV MISSIONS panel.'
        : 'Nothing selected.';
      $('selectionForm').hidden = true;
      $('selModelRow').hidden = true;
      $('selTextureRow').hidden = true;
      $('selScaleRow').hidden = true;
      return;
    }
    $('selectionEmpty').textContent = 'Nothing selected.';
    $('selectionEmpty').hidden = true;
    $('selectionForm').hidden = false;
    const s = state.selection;
    const isRoad = s.kind === 'road';
    const isModel = obj.type === 'model' || obj.type === 'glb' || obj.type === 'gltf';
    $('selModelRow').hidden = !isModel;
    $('selTextureRow').hidden = !isModel;
    $('selScaleRow').hidden = !isModel;
    if (isModel) {
      fillModelSelect($('selModel'), obj.model || obj.modelKey || obj.key);
      fillTextureSelect($('selTexture'), obj.texture || '');
      $('selScale').value = Number(obj.scale) || 1;
    }
    $('selType').value = isRoad ? (obj.type || 'road') : (obj.type || s.kind);
    $('selName').value = obj.name || '';
    if (isRoad && s.vertex != null) {
      const p = obj.points[s.vertex];
      $('selX').value = p ? p[0].toFixed(1) : 0;
      $('selZ').value = p ? p[1].toFixed(1) : 0;
    } else {
      $('selX').value = Number(obj.x || 0).toFixed(1);
      $('selZ').value = Number(obj.z || 0).toFixed(1);
    }
    $('selW').value = Number(obj.w || obj.width || 0);
    $('selL').value = Number(obj.l || 0);
    $('selRot').value = Number(obj.rot || 0).toFixed(2);
    $('selH').value = Number(obj.h || 0);
    $('selColor').value = obj.color != null ? String(obj.color) : '';
    $('selDesc').value = obj.description || '';
  }

  function parseColor(v) {
    const s = String(v || '').trim();
    if (!s) return null;
    if (s.charAt(0) === '#') return parseInt(s.slice(1), 16);
    const n = Number(s);
    return isFinite(n) ? n : s;
  }

  function applySelection() {
    const obj = getSelectedObject();
    if (!obj) return;
    pushUndo();
    const s = state.selection;
    if (s.kind === 'road') {
      if ($('selName').value) obj.name = $('selName').value;
      obj.description = $('selDesc').value;
      obj.width = Math.max(2, Number($('selW').value) || 10);
      if (s.vertex != null && obj.points[s.vertex]) {
        obj.points[s.vertex] = [Number($('selX').value) || 0, Number($('selZ').value) || 0];
      }
    } else {
      if ($('selName').value) obj.name = $('selName').value;
      obj.description = $('selDesc').value;
      obj.x = Number($('selX').value) || 0;
      obj.z = Number($('selZ').value) || 0;
      if ($('selW').value !== '') obj.w = Number($('selW').value);
      if ($('selL').value !== '') obj.l = Number($('selL').value);
      obj.rot = Number($('selRot').value) || 0;
      if ($('selH').value !== '') obj.h = Number($('selH').value);
      const c = parseColor($('selColor').value);
      if (c != null) obj.color = c;
      if (obj.type === 'model' || obj.type === 'glb' || obj.type === 'gltf') {
        obj.model = $('selModel').value || obj.model || obj.key;
        obj.scale = Math.max(0.05, Number($('selScale').value) || 1);
        const texture = $('selTexture') ? $('selTexture').value : '';
        if (texture) obj.texture = texture;
        else delete obj.texture;
        const fp = modelFootprint(obj);
        if (fp) {
          obj.w = fp.w;
          obj.l = fp.l;
          obj.h = fp.h;
        }
      }
    }
    updateSelectionForm();
    render();
    setMessage('Selection updated.');
  }

  function deleteSelection() {
    const s = state.selection;
    if (!s) return;
    pushUndo();
    if (s.kind === 'mission') {
      const m = state.missions[s.mission];
      if (!m || !(m.actions || [])[s.index]) return;
      m.actions.splice(s.index, 1);
      state.selection = null;
      renderMissionList(); renderMissionWaypointList();
      updateSelectionForm();
      render();
      setMessage('Mission waypoint deleted.');
      return;
    }
    const arr = s.kind === 'road' ? state.roads
      : s.kind === 'asset' ? state.assets
        : s.kind === 'landmark' ? state.landmarks : state.buildings;
    arr.splice(s.index, 1);
    state.selection = null;
    updateSelectionForm();
    render();
    setMessage('Deleted.');
  }

  /* ---------- tools ---------- */
  function uniqueRoadName(base) {
    let name = base, n = 2;
    const names = state.roads.map(function (r) { return r.name; });
    while (names.indexOf(name) !== -1) name = base + ' ' + (n++);
    return name;
  }

  function finishRoad() {
    if (!state.draft || state.draft.length < 2) {
      state.draft = null;
      $('draftHint').hidden = true;
      render();
      return;
    }
    pushUndo();
    const road = {
      name: uniqueRoadName('Editor Road'),
      type: $('roadType').value,
      width: Number($('roadWidth').value) || 12,
      closed: false,
      points: clone(state.draft)
    };
    state.roads.push(road);
    state.selection = { kind: 'road', index: state.roads.length - 1 };
    state.draft = null;
    $('draftHint').hidden = true;
    updateSelectionForm();
    render();
    setMessage('Road added.');
  }

  function splitRoad(hit) {
    const road = state.roads[hit.index];
    if (!road || road.closed) return;
    const a = road.points[hit.seg], b = road.points[hit.seg + 1];
    const p = [a[0] + (b[0] - a[0]) * hit.t, a[1] + (b[1] - a[1]) * hit.t];
    pushUndo();
    const left = Object.assign({}, road, { name: uniqueRoadName((road.name || 'Road') + ' A'), points: road.points.slice(0, hit.seg + 1).concat([p]) });
    const right = Object.assign({}, road, { name: uniqueRoadName((road.name || 'Road') + ' B'), points: [p].concat(road.points.slice(hit.seg + 1)) });
    state.roads.splice(hit.index, 1, left, right);
    state.selection = null;
    render();
    setMessage('Road split.');
  }

  function commitShape(d, info) {
    pushUndo();
    const a = d.anchor, b = d.current;
    const name = info && info.name ? info.name : 'Editor Asset';
    const description = info && info.description ? info.description : '';
    const dx = b.x - a.x, dz = b.z - a.z;
    if (d.tool === 'building') {
      const w = Math.abs(dx) < 4 ? 12 : Math.abs(dx);
      const l = Math.abs(dz) < 4 ? 8 : Math.abs(dz);
      state.assets.push({
        id: 'edit_' + Date.now(), type: 'building', name: name, description: description,
        x: Math.abs(dx) < 4 ? a.x : (a.x + b.x) * 0.5,
        z: Math.abs(dz) < 4 ? a.z : (a.z + b.z) * 0.5,
        w: w, l: l, h: 4.5, rot: 0, color: 0xd9c7a8
      });
      state.selection = { kind: 'asset', index: state.assets.length - 1 };
      setMessage('Building added.');
    } else if (d.tool === 'bridge') {
      const len = Math.hypot(dx, dz);
      const ax = a.x, az = a.z;
      const bx = len < 8 ? a.x + 24 : b.x;
      const bz = len < 8 ? a.z : b.z;
      const width = Number($('roadWidth').value) || 10;
      const rot = Math.atan2(-(bz - az), bx - ax);
      state.assets.push({
        id: 'edit_' + Date.now(), type: 'bridge', name: name, description: description,
        x: (ax + bx) * 0.5, z: (az + bz) * 0.5,
        w: Math.hypot(bx - ax, bz - az), l: width, rot: rot, y: 10.5, color: 0x5b5f66
      });
      state.roads.push({
        name: uniqueRoadName('Editor Bridge Road'),
        type: 'paved', width: width, closed: false, forceBridge: true,
        points: [[ax, az], [bx, bz]]
      });
      state.selection = { kind: 'asset', index: state.assets.length - 1 };
      setMessage('Bridge and road added.');
    }
    updateSelectionForm();
    render();
  }

  function setTool(tool) {
    state.tool = tool;
    state.draft = null;
    $('draftHint').hidden = true;
    document.querySelectorAll('.tool').forEach(function (b) {
      b.classList.toggle('active', b.dataset.tool === tool);
    });
    $('toolHint').textContent = HINTS[tool] || '';
    canvas.style.cursor = tool === 'pan' ? 'grab' : 'crosshair';
    render();
  }

  let previewMode = false;
  function setPreviewMode(on) {
    const p = CC.MapPreview3D;
    if (on && (!p || !p.available)) {
      setMessage(p && p.hintText ? '3D preview unavailable in this browser.' : '3D preview script did not load.');
      return;
    }
    previewMode = !!on;
    $('canvasWrap').classList.toggle('preview', previewMode);
    $('mapCanvas').hidden = previewMode;
    $('previewWrap').hidden = !previewMode;
    $('view2DBtn').classList.toggle('on', !previewMode);
    $('preview3DBtn').classList.toggle('on', previewMode);
    $('previewFitBtn').hidden = !previewMode;
    $('renderTools').hidden = !previewMode;
    $('transformTools').hidden = !previewMode;
    if (p) {
      p.setActive(previewMode);
      if (previewMode) {
        p.resize();
        if (p.setEditMode) p.setEditMode(state.transformMode || 'view');
      }
    }
    if (previewMode) {
      $('toolHint').textContent = p ? p.hintText : '';
      setMessage('3D preview active — press P for the 2D editor.');
    } else {
      setTool(state.tool);
      setMessage('2D editor active.');
    }
  }

  function setStyleMode(mode) {
    mode = mode === 'realistic' ? 'realistic' : 'game';
    document.querySelectorAll('#renderTools .style').forEach(function (b) {
      b.classList.toggle('active', b.dataset.style === mode);
    });
    const p = CC.MapPreview3D;
    if (p && p.setStyleMode) p.setStyleMode(mode);
    if (p) $('toolHint').textContent = p.hintText || '';
    setMessage(mode === 'realistic'
      ? 'Realistic preview: PBR lighting, shadows and building facades.'
      : 'Game-style preview active.');
  }

  function setTransformMode(mode) {
    state.transformMode = mode || 'view';
    document.querySelectorAll('#transformTools .transform').forEach(function (b) {
      b.classList.toggle('active', b.dataset.transform === state.transformMode);
    });
    if (CC.MapPreview3D && CC.MapPreview3D.setEditMode) CC.MapPreview3D.setEditMode(state.transformMode);
    if (CC.MapPreview3D) $('toolHint').textContent = CC.MapPreview3D.hintText || '';
    setMessage('3D tool: ' + state.transformMode + '.');
  }

  function apply3DTransform(pick, values, phase) {
    if (!pick || pick.kind === 'road') return;
    const obj = getSelectedObject();
    if (!obj) return;
    if (phase === 'start') {
      state.transformBase = clone(obj);
      pushUndo();
      return;
    }
    if (phase === 'end') {
      state.transformBase = null;
      updateSelectionForm();
      render();
      setMessage('3D transform applied.');
      return;
    }
    const base = state.transformBase || obj;
    if (values.x != null) obj.x = shotNumber(values.x, obj.x);
    if (values.z != null) obj.z = shotNumber(values.z, obj.z);
    if (values.rot != null) obj.rot = shotNumber(values.rot, obj.rot);
    if (values.scale != null) {
      const factor = Math.max(0.05, shotNumber(values.scale, 1));
      if (obj.type === 'model' || obj.type === 'glb' || obj.type === 'gltf') {
        obj.scale = Math.max(0.05, shotNumber(base.scale, 1) * factor);
        const fp = modelFootprint(obj);
        if (fp) { obj.w = fp.w; obj.l = fp.l; obj.h = fp.h; }
      } else {
        if (base.w != null) obj.w = Math.max(0.5, base.w * factor);
        if (base.l != null) obj.l = Math.max(0.5, base.l * factor);
        if (base.h != null) obj.h = Math.max(0.5, base.h * factor);
      }
    }
  }

  /* ---------- export / import ---------- */
  function patchData() {
    return {
      version: 1,
      generated: new Date().toISOString(),
      active: true,
      newMap: state.newMap,
      standaloneGame: state.standaloneGame,
      gameName: state.gameName,
      mapName: state.mapName,
      world: clone(state.world),
      mapWidth: worldW(),
      mapHeight: worldH(),
      elevation: clone(state.elevation),
      roads: clone(state.roads),
      buildings: clone(state.buildings),
      landmarks: clone(state.landmarks),
      challenges: clone(state.challenges),
      assets: clone(state.assets),
      trailerShots: clone(state.trailerShots),
      missions: clone(state.missions)
    };
  }

  function patchText(data) {
    const patch = data || patchData();
    return '/* Generated by map-editor.html - do not edit by hand.\n' +
      '   Save this file as js/MapEdits.js, then hard-refresh index.html. */\n' +
      '(function () {\n  \'use strict\';\n  var CC = window.CC = window.CC || {};\n' +
      '  CC.mapEdits = ' + JSON.stringify(patch, null, 2) + ';\n' +
      '})();\n';
  }

  /* Imported GLB/image assets live in CC.GeneratedAssets for the open editor
     session only. Apply to game also writes them into CommunityAssets.js so a
     placed model still exists after the game page reloads. */
  function communityAssetsText() {
    const models = {};
    const textures = {};
    const bakedModels = (CC.GeneratedAssets && CC.GeneratedAssets.models) || {};
    const bakedTextures = (CC.GeneratedAssets && CC.GeneratedAssets.textures) || {};

    Object.keys(GTA.models).forEach(function (key) {
      models[key] = bakedModels[key] || GTA.models[key];
    });
    GTA.assets.forEach(function (a) {
      const key = a.model || a.modelKey || a.key;
      if (key && bakedModels[key] && !models[key]) models[key] = bakedModels[key];
      if (a.texture && bakedTextures[a.texture]) textures[a.texture] = bakedTextures[a.texture];
    });
    Object.keys(models).forEach(function (key) {
      const parts = models[key].parts || [];
      parts.forEach(function (part) {
        if (part.texture && bakedTextures[part.texture]) {
          textures[part.texture] = bakedTextures[part.texture];
        }
      });
    });
    Object.keys(GTA.textures).forEach(function (key) {
      if (bakedTextures[key]) textures[key] = bakedTextures[key];
    });

    if (!Object.keys(models).length && !Object.keys(textures).length && !GTA.assets.length) return '';
    const registry = {
      version: 1,
      generated: new Date().toISOString(),
      categories: GTA.categories,
      assets: GTA.assets,
      models: models,
      textures: textures
    };
    return '/* Generated by map-editor.html - locally imported assets. Do not commit GTA-derived data. */\n' +
      '(function () {\n  \'use strict\';\n  var CC = window.CC = window.CC || {};\n' +
      '  CC.GeneratedAssets = Object.assign({ textures: {}, models: {} }, CC.GeneratedAssets || {});\n' +
      '  Object.assign(CC.GeneratedAssets.models, ' + JSON.stringify(models, null, 2) + ');\n' +
      '  Object.assign(CC.GeneratedAssets.textures, ' + JSON.stringify(textures, null, 2) + ');\n' +
      '  CC.GTAImport = Object.assign({}, CC.GTAImport || {}, ' + JSON.stringify(registry, null, 2) + ');\n' +
      '})();\n';
  }

  /* Direct-to-disk apply. Chrome/Edge can remember a project folder by storing
     its FileSystemDirectoryHandle in IndexedDB. One picker on first use, then
     Apply to game writes js/MapEdits.js with no save dialog. */
  const PROJECT_DB = 'coastal-cruise-map-editor';
  const PROJECT_STORE = 'settings';
  const GAME_FOLDER_KEY = 'gameFolderHandle';

  function openProjectDb() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) { reject(new Error('IndexedDB unavailable')); return; }
      const req = indexedDB.open(PROJECT_DB, 1);
      req.onupgradeneeded = function () {
        const db = req.result;
        if (!db.objectStoreNames.contains(PROJECT_STORE)) db.createObjectStore(PROJECT_STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('Could not open editor settings')); };
    });
  }

  async function getProjectSetting(key) {
    const db = await openProjectDb();
    try {
      return await new Promise(function (resolve, reject) {
        const req = db.transaction(PROJECT_STORE, 'readonly').objectStore(PROJECT_STORE).get(key);
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
    } finally {
      db.close();
    }
  }

  async function setProjectSetting(key, value) {
    const db = await openProjectDb();
    try {
      await new Promise(function (resolve, reject) {
        const tx = db.transaction(PROJECT_STORE, 'readwrite');
        tx.objectStore(PROJECT_STORE).put(value, key);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    } finally {
      db.close();
    }
  }

  async function ensureWritePermission(handle) {
    if (!handle) return false;
    if (!handle.queryPermission) return true;
    const opts = { mode: 'readwrite' };
    let permission = await handle.queryPermission(opts);
    if (permission === 'granted') return true;
    if (permission === 'prompt' && handle.requestPermission) {
      permission = await handle.requestPermission(opts);
    }
    return permission === 'granted';
  }

  async function chooseGameFolder() {
    if (!window.showDirectoryPicker) {
      setMessage('Direct write is not available in this browser — MapEdits.js will be downloaded.');
      return null;
    }
    try {
      const handle = await window.showDirectoryPicker({
        id: 'coastal-cruise-game-folder',
        mode: 'readwrite'
      });
      let hasIndex = false;
      try {
        for await (const entry of handle.values()) {
          if (entry.kind === 'file' && entry.name === 'index.html') { hasIndex = true; break; }
        }
      } catch (e) { /* Some browsers hide directory iteration until permission is granted. */ }
      if (!hasIndex) {
        setMessage('Choose the Coastal Cruise folder that contains index.html, then try again.');
        return null;
      }
      await setProjectSetting(GAME_FOLDER_KEY, handle);
      setMessage('Game folder connected: ' + handle.name + '. Apply to game will write there from now on.');
      return handle;
    } catch (e) {
      if (e && e.name === 'AbortError') return null;
      setMessage('Could not connect that folder: ' + String((e && e.message) || e));
      return null;
    }
  }

  // Static hosts often cache generated JS for hours, so changing MapEdits.js
  // alone can leave the game reading yesterday's roads. Rewrite the two page
  // script URLs with a fresh version each time we apply.
  function cacheBustScriptUrls(text, version) {
    return String(text).replace(
      /(src=["'])js\/(MapEdits|CommunityAssets)\.js(?:\?v=[^"']*)?(["'])/g,
      function (_match, open, name, close) {
        return open + 'js/' + name + '.js?v=' + version + close;
      });
  }

  async function writeTextFile(dir, name, text) {
    const fileHandle = await dir.getFileHandle(name, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(text);
    await writable.close();
  }

  async function refreshScriptUrls(handle, version) {
    const pages = ['index.html', 'map-editor.html'];
    const notes = [];
    for (const name of pages) {
      try {
        const fileHandle = await handle.getFileHandle(name);
        const original = await (await fileHandle.getFile()).text();
        const updated = cacheBustScriptUrls(original, version);
        if (updated !== original) await writeTextFile(handle, name, updated);
        notes.push(name);
      } catch (e) {
        // The patch itself is already written; a missing/read-only page just
        // means the user must clear the browser cache or add ?v= manually.
      }
    }
    return notes;
  }

  async function applyPatchToGame() {
    if (!window.showDirectoryPicker) return false;
    let handle = null;
    try { handle = await getProjectSetting(GAME_FOLDER_KEY); } catch (e) { handle = null; }
    if (handle && !(await ensureWritePermission(handle))) handle = null;
    if (!handle) handle = await chooseGameFolder();
    if (!handle) return false;
    try {
      const data = patchData();
      const version = String(Date.parse(data.generated) || Date.now());
      const jsDir = await handle.getDirectoryHandle('js', { create: true });
      await writeTextFile(jsDir, 'MapEdits.js', patchText(data));
      const importedAssets = communityAssetsText();
      let assetNote = '';
      if (importedAssets) {
        try {
          await writeTextFile(jsDir, 'CommunityAssets.js', importedAssets);
          assetNote = ' and js/CommunityAssets.js';
        } catch (e) {
          setMessage('Map applied, but imported assets could not be written: ' +
            String((e && e.message) || e));
          return true;
        }
      }
      const pages = await refreshScriptUrls(handle, version);
      const pageNote = pages.length
        ? ' (refreshed script URLs in ' + pages.join(' and ') + ')'
        : ' (could not refresh script URLs — clear your browser cache if roads look old)';
      setMessage('Applied to game map: js/MapEdits.js' + assetNote + ' in “' +
        handle.name + '”' + pageNote + '. Hard-refresh index.html to play it.');
      return true;
    } catch (e) {
      setMessage('Direct write failed (' + String((e && e.message) || e) +
        ') — falling back to download.');
      return false;
    }
  }

  async function savePatch() {
    const text = patchText();
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: 'MapEdits.js',
          types: [{ description: 'JavaScript', accept: { 'text/javascript': ['.js'] } }]
        });
        const writable = await handle.createWritable();
        await writable.write(text);
        await writable.close();
        setMessage('Saved patch. Hard-refresh index.html to play it.');
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return;
      }
    }
    const blob = new Blob([text], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'MapEdits.js';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    setMessage('Downloaded MapEdits.js — save it over js/MapEdits.js and refresh the game.');
  }

  async function copyPatch() {
    const text = patchText();
    try {
      await navigator.clipboard.writeText(text);
      setMessage('Patch JS copied to clipboard.');
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); setMessage('Patch JS copied to clipboard.'); }
      catch (err) { setMessage('Clipboard unavailable — use Apply to game instead.'); }
      ta.remove();
    }
  }

  /* ---------- standalone new-game project export ----------
     The normal export patches the existing game. A standalone project copies
     the engine into a new folder, rewrites the branding and installs the new
     map as js/MapEdits.js. Large optional radio MP3s are intentionally skipped:
     the game falls back to its built-in synth stations. */
  let sourceFileCache = null;
  const UTF8 = new TextEncoder();

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function slugify(value) {
    return String(value || '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'new-game';
  }

  function textBytes(text) { return UTF8.encode(String(text)); }

  function updateApplyButton() {
    const btn = $('applyBtn');
    if (!btn) return;
    if (state.standaloneGame) {
      btn.innerHTML = '✔ <span>Create game folder</span>';
      btn.title = 'Write a standalone game project for ' + (state.gameName || 'this map');
    } else {
      btn.innerHTML = '✔ <span>Apply to game</span>';
      btn.title = 'Write the patch directly to js/MapEdits.js in the game folder';
    }
    const menuItem = document.querySelector('#menuBar .menuItem[data-target="#applyBtn"]');
    if (menuItem && menuItem.childNodes[0] && menuItem.childNodes[0].nodeType === 3) {
      menuItem.childNodes[0].textContent = state.standaloneGame ? 'Create game folder ' : 'Apply to game ';
    }
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function pickTemplateFolder() {
    if (sourceFileCache) return Promise.resolve(sourceFileCache);
    return new Promise(function (resolve) {
      const input = $('sourceFolderInput');
      function done(files) {
        input.onchange = null;
        input.oncancel = null;
        input.value = '';
        sourceFileCache = files && files.length ? files : null;
        resolve(sourceFileCache);
      }
      input.onchange = function () { done(Array.prototype.slice.call(input.files || [])); };
      input.oncancel = function () { done(null); };
      setMessage('Select the current Coastal Cruise folder as the project template.');
      input.click();
    });
  }

  function includeTemplatePath(path) {
    if (path.startsWith('audio/') || path.startsWith('assets/') || path.startsWith('tools/')) return false;
    if (path.startsWith('.tmp')) return false;
    if (path.startsWith('js/')) return path.endsWith('.js');
    if (path === 'index.html' || path === 'style.css' || path === 'README.md' ||
        path === 'MEDIA-GUIDE.md' || path === 'map-editor.html' || path === 'map-editor.css') return true;
    if (path.startsWith('media/')) {
      return path !== 'media/intro.mp4' && path !== 'media/intro.webm' &&
        path !== 'media/intro-start.mp3';
    }
    return false;
  }

  function brandGameFiles(indexText, editorText, name) {
    const esc = escapeHtml(name);
    const upper = escapeHtml(name.toUpperCase());
    indexText = indexText.replace(/<title>[\s\S]*?<\/title>/i, '<title>' + esc + ' — Arcade Driving</title>');
    indexText = indexText.replace('A COASTAL DRIVING PLAYGROUND', upper + ' — ARCADE DRIVING');
    indexText = indexText.replace(/<h1 class="splashTitle">[\s\S]*?<\/h1>/i,
      '<h1 class="splashTitle"><span>' + esc + '</span></h1>');
    indexText = indexText.replace('COASTAL CRUISE MAP', upper + ' MAP');
    editorText = editorText.replace(/<title>[\s\S]*?<\/title>/i, '<title>' + esc + ' — Map Editor</title>');
    editorText = editorText.replace('COASTAL CRUISE <span>MAP EDITOR</span>',
      upper + ' <span>MAP EDITOR</span>');
    return { index: indexText, editor: editorText };
  }

  async function buildGameEntries(files, name) {
    const byPath = new Map();
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const rel = file.webkitRelativePath || file.name;
      const slash = rel.indexOf('/');
      const path = slash >= 0 ? rel.slice(slash + 1) : rel;
      if (path && !byPath.has(path)) byPath.set(path, file);
    }
    const indexFile = byPath.get('index.html');
    const editorFile = byPath.get('map-editor.html');
    if (!indexFile || !editorFile) throw new Error('The selected folder is not a game template.');
    const indexText = await indexFile.text();
    const required = [];
    const refs = indexText.matchAll(/(?:src|href)="([^"]+)"/g);
    for (const ref of refs) {
      const p = ref[1];
      if (p && !/^(?:https?:|data:|#)/.test(p) && required.indexOf(p) < 0) required.push(p);
    }
    const missing = required.filter(function (p) { return !byPath.has(p); });
    if (missing.length) {
      throw new Error('Template is missing: ' + missing.slice(0, 4).join(', '));
    }

    const branded = brandGameFiles(indexText, await editorFile.text(), name);
    const entries = [];
    for (const pair of byPath) {
      const path = pair[0];
      if (!includeTemplatePath(path)) continue;
      if (path === 'index.html' || path === 'map-editor.html' || path === 'js/MapEdits.js') continue;
      entries.push({ path: path, data: new Uint8Array(await pair[1].arrayBuffer()) });
    }
    entries.push({ path: 'index.html', data: textBytes(branded.index) });
    entries.push({ path: 'map-editor.html', data: textBytes(branded.editor) });
    entries.push({ path: 'js/MapEdits.js', data: textBytes(patchText()) });
    return entries;
  }

  /* Minimal store-only ZIP writer. No external library and no compression, so
     it works from file:// and keeps already-compressed JS/data URIs intact. */
  const CRC_TABLE = (function () {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function makeZip(entries) {
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const dosDate = ((Math.max(1980, now.getFullYear()) - 1980) << 9) |
      ((now.getMonth() + 1) << 5) | now.getDate();
    const local = [], central = [];
    let offset = 0, centralSize = 0;

    for (let i = 0; i < entries.length; i++) {
      const name = UTF8.encode(entries[i].path.replace(/\\/g, '/'));
      const data = entries[i].data;
      const crc = crc32(data);
      const localOffset = offset;

      const lh = new Uint8Array(30), lv = new DataView(lh.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0x0800, true);
      lv.setUint16(8, 0, true);
      lv.setUint16(10, dosTime, true);
      lv.setUint16(12, dosDate, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, data.length, true);
      lv.setUint32(22, data.length, true);
      lv.setUint16(26, name.length, true);
      lv.setUint16(28, 0, true);
      local.push(lh, name, data);
      offset += 30 + name.length + data.length;

      const ch = new Uint8Array(46), cv = new DataView(ch.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, dosTime, true);
      cv.setUint16(14, dosDate, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, name.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, localOffset, true);
      central.push(ch, name);
      centralSize += 46 + name.length;
    }

    const end = new Uint8Array(22), ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, entries.length, true);
    ev.setUint16(10, entries.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);
    ev.setUint16(20, 0, true);

    const chunks = local.concat(central, [end]);
    let total = 0;
    for (let i = 0; i < chunks.length; i++) total += chunks[i].length;
    const out = new Uint8Array(total);
    let pos = 0;
    for (let i = 0; i < chunks.length; i++) {
      out.set(chunks[i], pos);
      pos += chunks[i].length;
    }
    return new Blob([out], { type: 'application/zip' });
  }

  async function writeEntriesToDirectory(entries, root) {
    for (let i = 0; i < entries.length; i++) {
      const parts = entries[i].path.split('/');
      let dir = root;
      for (let p = 0; p < parts.length - 1; p++) {
        dir = await dir.getDirectoryHandle(parts[p], { create: true });
      }
      const handle = await dir.getFileHandle(parts[parts.length - 1], { create: true });
      const writable = await handle.createWritable();
      await writable.write(entries[i].data);
      await writable.close();
    }
  }

  async function saveGameProject() {
    const files = await pickTemplateFolder();
    if (!files) { setMessage('Template folder selection cancelled.'); return; }
    const name = state.gameName || state.mapName || 'New Game';
    setMessage('Building standalone game project "' + name + '"…');
    let entries;
    try {
      entries = await buildGameEntries(files, name);
    } catch (e) {
      sourceFileCache = null;
      setMessage('Could not build game folder: ' + (e.message || e));
      return;
    }

    if (window.showDirectoryPicker) {
      let dir = null;
      try {
        dir = await window.showDirectoryPicker({ id: 'cc-new-game', mode: 'readwrite' });
      } catch (e) {
        if (e && e.name === 'AbortError') { setMessage('Game folder creation cancelled.'); return; }
      }
      if (dir) {
        try {
          let empty = true;
          if (dir.keys) {
            for await (const _key of dir.keys()) { empty = false; break; }
          }
          if (!empty && !window.confirm('Write the game into this folder and overwrite existing files?')) {
            setMessage('Game folder creation cancelled.');
            return;
          }
          await writeEntriesToDirectory(entries, dir);
          setMessage('Created "' + name + '" in the selected folder. Open its index.html to play.');
          return;
        } catch (e) {
          setMessage('Could not write game folder: ' + (e.message || e));
          return;
        }
      }
    }

    downloadBlob(makeZip(entries), slugify(name) + '.zip');
    setMessage('Downloaded ' + slugify(name) + '.zip — unzip it into a new folder and open index.html.');
  }

  function loadPatchFile(file) {
    const reader = new FileReader();
    reader.onload = function () {
      try {
        const text = String(reader.result || '');
        const start = text.indexOf('CC.mapEdits =');
        if (start < 0) throw new Error('No CC.mapEdits assignment found.');
        const brace = text.indexOf('{', start);
        const end = text.lastIndexOf('}');
        const patch = JSON.parse(text.slice(brace, end + 1));
        if (!patch || patch.version !== 1) throw new Error('Unsupported patch version.');
        restore({
          world: patch.world || clone(DEFAULT_WORLD),
          newMap: !!patch.newMap,
          standaloneGame: !!patch.standaloneGame,
          gameName: patch.gameName || '',
          mapName: patch.mapName || 'Coastal Cruise',
          roads: patch.roads || [], buildings: patch.buildings || [],
          landmarks: patch.landmarks || [], challenges: patch.challenges || [],
          assets: patch.assets || [], trailerShots: patch.trailerShots || [],
          missions: patch.missions || [],
          elevation: patch.elevation || null
        });
        setMessage('Loaded patch from ' + file.name + '.');
      } catch (e) {
        setMessage('Could not load patch: ' + (e.message || e));
      }
    };
    reader.readAsText(file);
  }

  /* ---------- map data import ---------- */
  function tagMap(el) {
    const out = {};
    if (!el || !el.querySelectorAll) return out;
    el.querySelectorAll('tag').forEach(function (t) {
      out[t.getAttribute('k')] = t.getAttribute('v');
    });
    return out;
  }

  function latLonMapper(bounds) {
    const spanLon = (bounds.maxLon - bounds.minLon) || 1;
    const spanLat = (bounds.maxLat - bounds.minLat) || 1;
    const world = clone(state.world);
    return function (lon, lat) {
      return {
        x: world.minX + ((lon - bounds.minLon) / spanLon) * worldW(),
        z: world.maxZ - ((lat - bounds.minLat) / spanLat) * worldH()
      };
    };
  }

  function osmRoadType(tags) {
    const h = tags.highway || '';
    if (/^(footway|pedestrian|steps|path)$/.test(h)) return 'boardwalk';
    if (/^(track|bridleway|cycleway)$/.test(h)) return 'dirt';
    return 'paved';
  }

  function osmRoadWidth(tags, type) {
    const w = parseFloat(tags.width);
    if (isFinite(w) && w > 0) return Math.max(3, Math.min(40, w));
    return type === 'paved' ? 12 : type === 'dirt' ? 7 : 4;
  }

  function normalizeElevation(e) {
    if (Array.isArray(e)) return { hills: clone(e), points: [], grid: null };
    e = e || {};
    return {
      hills: clone(e.hills || []),
      points: clone(e.points || []),
      grid: e.grid ? clone(e.grid) : null
    };
  }

  function parseOSM(text) {
    const doc = new DOMParser().parseFromString(text, 'text/xml');
    if (doc.querySelector('parsererror')) throw new Error('Invalid OSM XML.');
    const nodes = new Map();
    doc.querySelectorAll('node').forEach(function (n) {
      const lat = parseFloat(n.getAttribute('lat'));
      const lon = parseFloat(n.getAttribute('lon'));
      if (!isFinite(lat) || !isFinite(lon)) return;
      nodes.set(n.getAttribute('id'), { lat: lat, lon: lon, tags: tagMap(n) });
    });
    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    nodes.forEach(function (n) {
      minLat = Math.min(minLat, n.lat); maxLat = Math.max(maxLat, n.lat);
      minLon = Math.min(minLon, n.lon); maxLon = Math.max(maxLon, n.lon);
    });
    const b = doc.querySelector('bounds');
    if (b) {
      minLat = parseFloat(b.getAttribute('minlat')) || minLat;
      maxLat = parseFloat(b.getAttribute('maxlat')) || maxLat;
      minLon = parseFloat(b.getAttribute('minlon')) || minLon;
      maxLon = parseFloat(b.getAttribute('maxlon')) || maxLon;
    }
    if (!isFinite(minLat)) { minLat = -1; maxLat = 1; minLon = -1; maxLon = 1; }
    const map = latLonMapper({ minLat, maxLat, minLon, maxLon });
    const roads = [], buildings = [], assets = [], elevationPoints = [];

    doc.querySelectorAll('way').forEach(function (w) {
      const tags = tagMap(w);
      const pts = [];
      w.querySelectorAll('nd').forEach(function (nd) {
        const n = nodes.get(nd.getAttribute('ref'));
        if (!n) return;
        const p = map(n.lon, n.lat);
        pts.push([p.x, p.z]);
      });
      if (pts.length < 2) return;
      if (tags.highway) {
        const type = osmRoadType(tags);
        roads.push({
          name: tags.name || 'Imported Road', type: type,
          width: osmRoadWidth(tags, type),
          closed: pts.length > 2 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1],
          oneWay: tags.oneway === 'yes' ? 1 : 0,
          points: pts
        });
      } else if (tags.building) {
        const xs = pts.map(function (p) { return p[0]; });
        const zs = pts.map(function (p) { return p[1]; });
        const minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
        const minZ = Math.min.apply(null, zs), maxZ = Math.max.apply(null, zs);
        const levels = parseFloat(tags['building:levels']);
        const h = parseFloat(tags.height) || (isFinite(levels) ? levels * 3 : 5);
        buildings.push({
          name: tags.name || tags['addr:housenumber'] || 'Imported Building',
          description: 'Imported from OSM (' + tags.building + ')',
          x: (minX + maxX) * 0.5, z: (minZ + maxZ) * 0.5,
          w: Math.max(3, maxX - minX), l: Math.max(3, maxZ - minZ),
          h: h, rot: 0, color: 0xd9c7a8
        });
      }
    });

    nodes.forEach(function (n) {
      const p = map(n.lon, n.lat);
      if (n.tags.natural === 'tree') {
        assets.push({ type: 'tree', name: 'Imported Tree', x: p.x, z: p.z, scale: 1 });
      }
      if (n.tags.ele != null) {
        const h = parseFloat(n.tags.ele);
        if (isFinite(h)) elevationPoints.push({ x: p.x, z: p.z, h: h, r: 25 });
      }
    });

    return {
      roads: roads, buildings: buildings, assets: assets,
      elevation: { hills: [], points: elevationPoints, grid: null }
    };
  }

  function collectGeoCoords(value, out) {
    if (Array.isArray(value)) {
      if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
        out.push([value[0], value[1]]);
      } else {
        value.forEach(function (v) { collectGeoCoords(v, out); });
      }
    } else if (value && typeof value === 'object') {
      Object.keys(value).forEach(function (k) { collectGeoCoords(value[k], out); });
    }
  }

  function parseGeoJSON(obj) {
    const features = obj.type === 'FeatureCollection' ? obj.features : [obj];
    const coords = [];
    collectGeoCoords(features.map(function (f) { return f.geometry || f; }), coords);
    if (!coords.length) throw new Error('GeoJSON has no coordinates.');
    let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
    coords.forEach(function (c) {
      minLon = Math.min(minLon, c[0]); maxLon = Math.max(maxLon, c[0]);
      minLat = Math.min(minLat, c[1]); maxLat = Math.max(maxLat, c[1]);
    });
    const map = latLonMapper({ minLon, maxLon, minLat, maxLat });
    const roads = [], buildings = [], assets = [], elevationPoints = [];

    function addLine(line, props) {
      const pts = line.map(function (c) { const p = map(c[0], c[1]); return [p.x, p.z]; });
      if (pts.length < 2) return;
      const h = props.highway || (props.road ? 'road' : '');
      if (!h) return;
      const type = osmRoadType({ highway: h });
      roads.push({
        name: props.name || 'Imported Road', type: type,
        width: osmRoadWidth(props, type), closed: false,
        oneWay: props.oneway === 'yes' ? 1 : 0, points: pts
      });
    }

    function addPolygon(ring, props) {
      const pts = ring.map(function (c) { const p = map(c[0], c[1]); return [p.x, p.z]; });
      if (pts.length < 3) return;
      const xs = pts.map(function (p) { return p[0]; });
      const zs = pts.map(function (p) { return p[1]; });
      const minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
      const minZ = Math.min.apply(null, zs), maxZ = Math.max.apply(null, zs);
      const levels = parseFloat(props['building:levels']);
      const h = parseFloat(props.height) || (isFinite(levels) ? levels * 3 : 5);
      buildings.push({
        name: props.name || 'Imported Building',
        description: 'Imported from GeoJSON',
        x: (minX + maxX) * 0.5, z: (minZ + maxZ) * 0.5,
        w: Math.max(3, maxX - minX), l: Math.max(3, maxZ - minZ),
        h: h, rot: 0, color: 0xd9c7a8
      });
    }

    features.forEach(function (f) {
      const props = f.properties || {};
      const g = f.geometry || f;
      if (!g || !g.type) return;
      if (g.type === 'LineString') addLine(g.coordinates, props);
      else if (g.type === 'MultiLineString') g.coordinates.forEach(function (l) { addLine(l, props); });
      else if (g.type === 'Polygon') addPolygon(g.coordinates[0], props);
      else if (g.type === 'MultiPolygon') g.coordinates.forEach(function (p) { addPolygon(p[0], props); });
      else if (g.type === 'Point') {
        const p = map(g.coordinates[0], g.coordinates[1]);
        if (props.natural === 'tree' || props.tree) assets.push({ type: 'tree', name: 'Imported Tree', x: p.x, z: p.z, scale: 1 });
        if (props.ele != null) {
          const h = parseFloat(props.ele);
          if (isFinite(h)) elevationPoints.push({ x: p.x, z: p.z, h: h, r: 25 });
        }
      }
    });

    return {
      roads: roads, buildings: buildings, assets: assets,
      elevation: { hills: [], points: elevationPoints, grid: null }
    };
  }

  /* ---------- KML flight plans ---------- */
  function kmlNodes(root, localName) {
    if (!root || !root.querySelectorAll) return [];
    const out = [];
    const all = root.querySelectorAll('*');
    for (let i = 0; i < all.length; i++) {
      if (all[i].localName === localName || all[i].nodeName === localName) out.push(all[i]);
    }
    return out;
  }

  function kmlText(root, localName) {
    const node = kmlNodes(root, localName)[0];
    return node ? String(node.textContent || '').trim() : '';
  }

  function kmlMeta(text, fallbackAltCm, x, z) {
    const meta = String(text || '');
    const actionMatch = meta.match(/\b(WAYPOINT|POSHOLD_TIME|JUMP|SET_POI|LAND)\b/i);
    const action = actionMatch ? actionMatch[1].toUpperCase() : 'WAYPOINT';
    let altCm = fallbackAltCm;
    const altMatch = meta.match(/(?:alt(?:itude)?|AMSL)\s*[:=]?\s*(-?\d+(?:\.\d+)?)\s*(cm|ft|m)?/i);
    if (altMatch) {
      const unit = (altMatch[2] || 'm').toLowerCase();
      const factor = unit === 'cm' ? 1 : unit === 'ft' ? 30.48 : 100;
      altCm = Math.round(Number(altMatch[1]) * factor);
    }
    let speedCmS = 1500;
    const speedMatch = meta.match(/(?:speed|vel(?:ocity)?)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(cm\/s|m\/s|km\/h)?/i);
    if (speedMatch) {
      const unit = (speedMatch[2] || 'cm/s').toLowerCase();
      const factor = unit === 'm/s' ? 100 : unit === 'km/h' ? 100 / 3.6 : 1;
      speedCmS = Number(speedMatch[1]) * factor;
    }
    let holdSec = 2;
    const holdMatch = meta.match(/(?:hold|duration)\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
    if (holdMatch) holdSec = Number(holdMatch[1]);
    let jumpTarget = 1;
    const jumpMatch = meta.match(/jump(?:Target|To)?\s*(?:waypoint|#)?\s*[:=]?\s*(\d+)/i);
    if (jumpMatch) jumpTarget = Number(jumpMatch[1]);
    let poi = { x: x, z: z, y: 0 };
    const poiMatch = meta.match(/poi\s*[:=]?\s*(-?\d+(?:\.\d+)?)\s*[,;\s]+\s*(-?\d+(?:\.\d+)?)\s*[,;\s]+\s*(-?\d+(?:\.\d+)?)/i);
    if (poiMatch) poi = { x: Number(poiMatch[1]), z: Number(poiMatch[2]), y: Number(poiMatch[3]) };
    return { action: action, altCm: altCm, speedCmS: speedCmS, holdSec: holdSec, jumpTarget: jumpTarget, poi: poi };
  }

  function parseKML(text) {
    const doc = new DOMParser().parseFromString(text, 'text/xml');
    if (doc.querySelector('parsererror')) throw new Error('Invalid KML XML.');
    const places = [];
    let nodes = kmlNodes(doc, 'Placemark');
    if (!nodes.length) nodes = kmlNodes(doc, 'coordinates');
    nodes.forEach(function (placemark) {
      const coordText = placemark.localName === 'coordinates'
        ? String(placemark.textContent || '') : kmlText(placemark, 'coordinates');
      const rawTuples = coordText.trim().split(/\s+/).filter(Boolean);
      const name = placemark.localName === 'coordinates' ? '' : kmlText(placemark, 'name');
      const description = placemark.localName === 'coordinates' ? '' : kmlText(placemark, 'description');
      // A LineString/Polygon Placemark holds a whole path. KML polygons close
      // their ring by repeating the first point; drop that duplicate before
      // turning every vertex into a waypoint.
      const tuples = rawTuples.slice();
      if (tuples.length > 2) {
        const first = tuples[0], last = tuples[tuples.length - 1];
        if (first === last) tuples.pop();
      }
      tuples.forEach(function (tuple, index) {
        const parts = tuple.split(',');
        const lon = Number(parts[0]), lat = Number(parts[1]);
        if (!isFinite(lon) || !isFinite(lat)) return;
        const alt = parts.length > 2 && isFinite(Number(parts[2])) ? Number(parts[2]) : null;
        places.push({
          lon: lon, lat: lat, alt: alt,
          name: tuples.length > 1 && name ? name + ' #' + (index + 1) : name,
          description: description
        });
      });
    });
    if (!places.length) throw new Error('No Placemark coordinates found in the KML.');
    let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
    places.forEach(function (p) {
      minLon = Math.min(minLon, p.lon); maxLon = Math.max(maxLon, p.lon);
      minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat);
    });
    const map = latLonMapper({ minLon: minLon, maxLon: maxLon, minLat: minLat, maxLat: maxLat });
    const baseAlt = places[0].alt != null ? places[0].alt : 0;
    const points = places.map(function (p) {
      const world = map(p.lon, p.lat);
      const fallbackAltCm = Math.round(((p.alt != null ? p.alt : baseAlt) - baseAlt) * 100);
      const info = kmlMeta(p.name + '\n' + p.description, fallbackAltCm, world.x, world.z);
      const wp = newWaypoint(world.x, world.z, 1);
      wp.action = info.action;
      wp.name = p.name || '';
      wp.altCm = info.altCm;
      wp.speedCmS = info.speedCmS;
      wp.holdSec = info.holdSec;
      wp.jumpTarget = info.jumpTarget;
      wp.poi = info.poi;
      return { world: world, wp: wp };
    });
    const home = points[0].world;
    const mission = newMission(kmlText(doc, 'name') || 'KML Mission');
    mission.home = { x: home.x, z: home.z };
    mission.actions = points.map(function (p) { return p.wp; });
    return { missions: [normalizeMission(mission)] };
  }

  function parseEditorJSON(obj) {
    const data = {};
    if (obj.world) data.world = clone(obj.world);
    ['roads', 'buildings', 'landmarks', 'assets', 'challenges', 'trailerShots', 'missions'].forEach(function (k) {
      if (Array.isArray(obj[k])) data[k] = clone(obj[k]);
    });
    if (Array.isArray(data.missions)) data.missions.forEach(normalizeMission);
    if (obj.elevation) data.elevation = normalizeElevation(obj.elevation);
    if (obj.mapName) data.mapName = obj.mapName;
    return data;
  }

  function applyImportedData(data, name) {
    pushUndo();
    if (data.world) {
      state.world = clone(data.world);
      buildTerrain();
      fitView();
    }
    ['roads', 'buildings', 'landmarks', 'assets', 'challenges', 'trailerShots', 'missions'].forEach(function (k) {
      if (Array.isArray(data[k])) state[k] = clone(data[k]);
    });
    state.missions.forEach(normalizeMission);
    state.missionEditIndex = state.missions.length ? 0 : -1;
    if (data.elevation) state.elevation = normalizeElevation(data.elevation);
    if (data.mapName) state.mapName = data.mapName;
    state.selection = null;
    state.draft = null;
    $('draftHint').hidden = true;
    updateSelectionForm();
    renderMissionList(); renderMissionWaypointList();
    render();
    setMessage('Imported ' + (data.roads || []).length + ' roads, ' +
      (data.buildings || []).length + ' buildings, ' + (data.assets || []).length +
      ' assets from ' + name + '.');
  }

  function importMapFile(file) {
    const reader = new FileReader();
    reader.onload = function () {
      try {
        const text = String(reader.result || '');
        let data;
        if (/\.kml$/i.test(file.name)) {
          data = parseKML(text);
        } else if (/\.(osm|xml)$/i.test(file.name) || /^\s*</.test(text)) {
          if (/<Placemark|<kml:/i.test(text)) data = parseKML(text);
          else data = parseOSM(text);
        } else {
          const obj = JSON.parse(text);
          data = (obj.type === 'FeatureCollection' || obj.type === 'Feature')
            ? parseGeoJSON(obj) : parseEditorJSON(obj);
        }
        if (!Object.keys(data).length) throw new Error('No supported map data in the file.');
        applyImportedData(data, file.name);
      } catch (e) {
        setMessage('Import failed: ' + (e.message || e));
      }
    };
    reader.readAsText(file);
  }

  /* ---------- trailer shot dialog ---------- */
  function shotNumber(value, fallback) {
    const n = Number(value);
    return isFinite(n) ? n : fallback;
  }

  function renderShotList() {
    const host = $('shotList');
    if (!host) return;
    host.textContent = '';
    if (!state.trailerShots.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'No trailer shots yet.';
      host.appendChild(empty);
      return;
    }
    state.trailerShots.forEach(function (shot, i) {
      const row = document.createElement('div');
      row.className = 'shotEntry';
      const label = document.createElement('span');
      label.textContent = shotNumber(i + 1, 0) + ' · ' + (shot.name || shot.vehicle || 'Shot') +
        ' · ' + (shot.mode === 'straight' ? 'straight' : 'road');
      row.appendChild(label);
      const edit = document.createElement('button');
      edit.textContent = 'Edit';
      edit.addEventListener('click', function () { openShotDialog(i); });
      row.appendChild(edit);
      const del = document.createElement('button');
      del.className = 'danger';
      del.textContent = '✕';
      del.title = 'Delete shot';
      del.addEventListener('click', function () {
        pushUndo();
        state.trailerShots.splice(i, 1);
        renderShotList(); render();
        setMessage('Trailer shot deleted.');
      });
      row.appendChild(del);
      host.appendChild(row);
    });
  }

  /* ---------- mission list + dialogs ---------- */
  function renderMissionList() {
    const host = $('missionList');
    if (!host) return;
    host.textContent = '';
    if (!state.missions.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'No missions yet.';
      host.appendChild(empty);
      return;
    }
    state.missions.forEach(function (m, i) {
      const row = document.createElement('div');
      row.className = 'shotEntry';
      const label = document.createElement('span');
      label.textContent = (i + 1) + ' · ' + (m.name || 'Mission') + ' · ' +
        (m.actions || []).length + ' wp · ' + (m.finalAction || 'RTH');
      row.appendChild(label);
      const edit = document.createElement('button');
      edit.textContent = 'Edit';
      edit.addEventListener('click', function () { openMissionDialog(i); });
      row.appendChild(edit);
      const del = document.createElement('button');
      del.className = 'danger';
      del.textContent = '✕';
      del.title = 'Delete mission';
      del.addEventListener('click', function () {
        pushUndo();
        state.missions.splice(i, 1);
        if (state.missionEditIndex >= state.missions.length) {
          state.missionEditIndex = state.missions.length - 1;
        }
        state.selection = null;
        renderMissionList(); renderMissionWaypointList();
        updateSelectionForm(); render();
        setMessage('Mission deleted.');
      });
      row.appendChild(del);
      host.appendChild(row);
    });
  }

  function renderMissionWaypointList() {
    const host = $('missionWaypointList');
    if (!host) return;
    host.textContent = '';
    const m = state.missions[state.missionEditIndex];
    const actions = m ? (m.actions || []) : [];
    if (!actions.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'No waypoints yet. Use Add on map (J), then click the map.';
      host.appendChild(empty);
      return;
    }
    actions.forEach(function (wp, i) {
      const row = document.createElement('div');
      row.className = 'shotEntry';
      const label = document.createElement('span');
      const action = MISSION_ACTIONS.indexOf(wp.action) >= 0 ? wp.action : 'WAYPOINT';
      label.textContent = (i + 1) + ' · ' + action + ' · ' +
        Math.round(missionNumber(wp.altCm, 0)) + 'cm · ' +
        Math.round(missionNumber(wp.speedCmS, 0)) + 'cm/s';
      row.appendChild(label);
      const edit = document.createElement('button');
      edit.textContent = 'Edit';
      edit.addEventListener('click', function () { openWaypointDialog(state.missionEditIndex, i); });
      row.appendChild(edit);
      if (i > 0) {
        const up = document.createElement('button');
        up.textContent = '▲';
        up.title = 'Move waypoint earlier';
        up.addEventListener('click', function () {
          pushUndo();
          const list = state.missions[state.missionEditIndex].actions;
          const tmp = list[i - 1]; list[i - 1] = list[i]; list[i] = tmp;
          renderMissionWaypointList(); render();
        });
        row.appendChild(up);
      }
      if (i < actions.length - 1) {
        const down = document.createElement('button');
        down.textContent = '▼';
        down.title = 'Move waypoint later';
        down.addEventListener('click', function () {
          pushUndo();
          const list = state.missions[state.missionEditIndex].actions;
          const tmp = list[i + 1]; list[i + 1] = list[i]; list[i] = tmp;
          renderMissionWaypointList(); render();
        });
        row.appendChild(down);
      }
      const del = document.createElement('button');
      del.className = 'danger';
      del.textContent = '✕';
      del.title = 'Delete waypoint';
      del.addEventListener('click', function () {
        pushUndo();
        const list = state.missions[state.missionEditIndex].actions;
        list.splice(i, 1);
        state.selection = null;
        renderMissionList(); renderMissionWaypointList();
        updateSelectionForm(); render();
        setMessage('Waypoint deleted.');
      });
      row.appendChild(del);
      host.appendChild(row);
    });
  }

  function openMissionDialog(index) {
    if (!state.missions[index]) {
      pushUndo();
      state.missions.push(newMission());
      index = state.missions.length - 1;
      renderMissionList();
    }
    state.missionEditIndex = index;
    const m = state.missions[index];
    $('missionName').value = m.name || ('Mission ' + (index + 1));
    $('missionHomeX').value = m.home && isFinite(Number(m.home.x)) ? Number(m.home.x).toFixed(1) : '';
    $('missionHomeZ').value = m.home && isFinite(Number(m.home.z)) ? Number(m.home.z).toFixed(1) : '';
    $('missionRadius').value = missionNumber(m.nav_wp_radius, 200);
    $('missionSafeDistance').value = missionNumber(m.nav_wp_safe_distance, 500);
    $('missionEnforceAltitude').checked = !!m.nav_wp_enforce_altitude;
    $('missionFinalAction').value = 'RTH';
    renderMissionWaypointList();
    $('missionDialog').hidden = false;
    setTimeout(function () { $('missionName').focus(); $('missionName').select(); }, 0);
  }

  function closeMissionDialog() {
    $('missionDialog').hidden = true;
    render();
  }

  function saveMission() {
    const m = state.missions[state.missionEditIndex];
    if (!m) { closeMissionDialog(); return; }
    pushUndo();
    m.name = $('missionName').value.trim() || ('Mission ' + (state.missionEditIndex + 1));
    const hx = Number($('missionHomeX').value), hz = Number($('missionHomeZ').value);
    m.home = isFinite(hx) && isFinite(hz) && $('missionHomeX').value !== '' && $('missionHomeZ').value !== ''
      ? { x: hx, z: hz } : null;
    m.nav_wp_radius = Math.max(50, missionNumber($('missionRadius').value, 200));
    m.nav_wp_safe_distance = Math.max(0, missionNumber($('missionSafeDistance').value, 500));
    m.nav_wp_enforce_altitude = !!$('missionEnforceAltitude').checked;
    m.finalAction = 'RTH';
    normalizeMission(m);
    (m.actions || []).forEach(function (wp, i) { clampMissionPoint(m, wp, i); });
    closeMissionDialog();
    renderMissionList(); renderMissionWaypointList(); render();
    setMessage('Mission saved: ' + m.name + '.');
  }

  /* Turn the active INAV plan into trailer shots. Saving first makes sure the
     exported camera path matches any edits still open in the dialog. */
  function downloadMissionShots() {
    if (!CC.MissionShots) {
      setMessage('MissionShots.js is not loaded.');
      return;
    }
    if ($('missionDialog').hidden === false) saveMission();
    const result = CC.MissionShots.toShots({ missions: state.missions },
      { missionIndex: state.missionEditIndex });
    if (!result || !result.shots.length) {
      setMessage('Add waypoints to the mission before exporting trailer shots.');
      return;
    }
    const file = (slugify(result.mission) || 'mission') + '-shots.json';
    downloadBlob(new Blob([JSON.stringify(result, null, 2)],
      { type: 'application/json' }), file);
    setMessage('Downloaded ' + file + ' — render with npm run trailer -- --shots ' + file);
  }

  function deleteActiveMission() {
    const i = state.missionEditIndex;
    if (i < 0 || !state.missions[i]) { closeMissionDialog(); return; }
    pushUndo();
    state.missions.splice(i, 1);
    state.missionEditIndex = state.missions.length ? Math.min(i, state.missions.length - 1) : -1;
    state.selection = null;
    closeMissionDialog();
    renderMissionList(); renderMissionWaypointList();
    updateSelectionForm(); render();
    setMessage('Mission deleted.');
  }

  function updateWaypointDialogFields() {
    const action = $('wpAction').value;
    $('wpHoldRow').hidden = action !== 'POSHOLD_TIME';
    $('wpJumpRow').hidden = action !== 'JUMP';
    $('wpPoiRow').hidden = action !== 'SET_POI';
    $('wpAltRow').hidden = action === 'JUMP' || action === 'SET_POI';
  }

  function openWaypointDialog(missionIndex, wpIndex) {
    const m = state.missions[missionIndex];
    const wp = m && (m.actions || [])[wpIndex];
    if (!wp) return;
    state.missionEditIndex = missionIndex;
    state.wpEditIndex = wpIndex;
    $('wpAction').value = MISSION_ACTIONS.indexOf(wp.action) >= 0 ? wp.action : 'WAYPOINT';
    $('wpName').value = wp.name || '';
    $('wpX').value = missionNumber(wp.x, 0).toFixed(1);
    $('wpZ').value = missionNumber(wp.z, 0).toFixed(1);
    $('wpAltCm').value = missionNumber(wp.altCm, 500);
    $('wpSpeedCmS').value = missionNumber(wp.speedCmS, 1500);
    $('wpHoldSec').value = missionNumber(wp.holdSec, 2);
    $('wpJumpTarget').value = Math.max(1, Math.floor(missionNumber(wp.jumpTarget, 1)));
    const poi = wp.poi || {};
    $('wpPoiX').value = missionNumber(poi.x, wp.x);
    $('wpPoiZ').value = missionNumber(poi.z, wp.z);
    $('wpPoiY').value = missionNumber(poi.y, 0);
    updateWaypointDialogFields();
    $('wpDeleteBtn').hidden = false;
    $('wpDialog').hidden = false;
    setTimeout(function () { $('wpAction').focus(); }, 0);
  }

  function closeWaypointDialog() {
    $('wpDialog').hidden = true;
    state.wpEditIndex = -1;
    render();
  }

  function saveWaypoint() {
    const m = state.missions[state.missionEditIndex];
    const wp = m && (m.actions || [])[state.wpEditIndex];
    if (!wp) { closeWaypointDialog(); return; }
    pushUndo();
    const action = $('wpAction').value;
    wp.action = MISSION_ACTIONS.indexOf(action) >= 0 ? action : 'WAYPOINT';
    wp.name = $('wpName').value.trim();
    wp.x = missionNumber($('wpX').value, 0);
    wp.z = missionNumber($('wpZ').value, 0);
    wp.altCm = missionNumber($('wpAltCm').value, 500);
    wp.speedCmS = Math.max(0, missionNumber($('wpSpeedCmS').value, 1500));
    wp.holdSec = Math.max(0, missionNumber($('wpHoldSec').value, 2));
    wp.jumpTarget = Math.max(1, Math.floor(missionNumber($('wpJumpTarget').value, 1)));
    wp.poi = {
      x: missionNumber($('wpPoiX').value, wp.x),
      z: missionNumber($('wpPoiZ').value, wp.z),
      y: missionNumber($('wpPoiY').value, 0)
    };
    clampMissionPoint(m, wp, state.wpEditIndex);
    closeWaypointDialog();
    renderMissionList(); renderMissionWaypointList(); render();
    setMessage('Waypoint saved: ' + wp.action + '.');
  }

  function deleteActiveWaypoint() {
    const m = state.missions[state.missionEditIndex];
    const i = state.wpEditIndex;
    if (!m || !m.actions || !m.actions[i]) { closeWaypointDialog(); return; }
    pushUndo();
    m.actions.splice(i, 1);
    state.selection = null;
    closeWaypointDialog();
    renderMissionList(); renderMissionWaypointList();
    updateSelectionForm(); render();
    setMessage('Waypoint deleted.');
  }

  function addMissionWaypoint(x, z) {
    pushUndo();
    let m = activeMission();
    if (!m) {
      m = newMission();
      state.missions.push(m);
      state.missionEditIndex = state.missions.length - 1;
      renderMissionList();
    }
    const wp = newWaypoint(x, z, m.actions.length + 1);
    clampMissionPoint(m, wp, -1);
    m.actions.push(wp);
    state.selection = { kind: 'mission', mission: state.missionEditIndex, index: m.actions.length - 1 };
    renderMissionList(); renderMissionWaypointList();
    updateSelectionForm(); render();
    setMessage('Waypoint ' + m.actions.length + ' added — edit its action, altitude and speed in INAV MISSIONS.');
  }

  function openShotDialog(index) {
    const editing = Number(index) >= 0 && !!state.trailerShots[index];
    const shot = editing ? state.trailerShots[index] : (state.trailerDraft || {});
    state.shotEditIndex = editing ? index : -1;
    const start = shot.start || {};
    const finish = shot.finish || {};
    $('shotName').value = shot.name || ('Shot ' + (state.trailerShots.length + 1));
    $('shotVehicle').value = shot.vehicle || 'coupe';
    $('shotMode').value = shot.mode || (isAirVehicle(shot.vehicle) ? 'straight' : 'road');
    $('shotCamera').value = shotNumber(shot.camera, 0);
    $('shotStartX').value = shotNumber(start.x, 0);
    $('shotStartZ').value = shotNumber(start.z, 0);
    $('shotStartAlt').value = shotNumber(start.alt, 0);
    $('shotStartH').value = shotNumber(start.h, 0);
    $('shotStartS').value = shotNumber(start.s, 0);
    $('shotSpeed').value = shotNumber(shot.speed, 28);
    $('shotFinishX').value = shotNumber(finish.x, 0);
    $('shotFinishZ').value = shotNumber(finish.z, 0);
    $('shotFinishAlt').value = shotNumber(finish.alt, isAirVehicle(shot.vehicle) ? 35 : 0);
    $('shotDuration').value = shotNumber(shot.durationSec, 6);
    $('shotBoost').value = shot.boost ? 'true' : 'false';
    $('shotAudio').value = shot.audio || '';
    $('shotNote').value = shot.note || '';
    $('shotDeleteBtn').hidden = !editing;
    $('shotDialog').hidden = false;
    setTimeout(function () { $('shotName').focus(); $('shotName').select(); }, 0);
  }

  function closeShotDialog() {
    $('shotDialog').hidden = true;
    state.trailerDraft = null;
    state.shotEditIndex = -1;
    render();
  }

  function saveShot() {
    const vehicle = $('shotVehicle').value || 'coupe';
    let mode = $('shotMode').value || 'road';
    if (isAirVehicle(vehicle)) mode = 'straight';
    const shot = {
      name: $('shotName').value.trim() || ('Shot ' + (state.trailerShots.length + 1)),
      vehicle: vehicle,
      mode: mode,
      start: {
        x: shotNumber($('shotStartX').value, 0), z: shotNumber($('shotStartZ').value, 0),
        alt: shotNumber($('shotStartAlt').value, 0),
        h: shotNumber($('shotStartH').value, 0), s: shotNumber($('shotStartS').value, 0)
      },
      finish: {
        x: shotNumber($('shotFinishX').value, 0), z: shotNumber($('shotFinishZ').value, 0),
        alt: shotNumber($('shotFinishAlt').value, 0)
      },
      speed: Math.max(1, shotNumber($('shotSpeed').value, 28)),
      camera: shotNumber($('shotCamera').value, 0),
      durationSec: Math.max(0.5, shotNumber($('shotDuration').value, 6)),
      boost: $('shotBoost').value === 'true',
      audio: $('shotAudio').value.trim() || null,
      note: $('shotNote').value.trim() || ''
    };
    pushUndo();
    if (state.shotEditIndex >= 0 && state.trailerShots[state.shotEditIndex]) {
      state.trailerShots[state.shotEditIndex] = shot;
    } else {
      state.trailerShots.push(shot);
    }
    closeShotDialog();
    renderShotList();
    setMessage('Trailer shot saved: ' + shot.name + ' (' + mode + ').');
  }

  function deleteActiveShot() {
    const i = state.shotEditIndex;
    if (i < 0 || !state.trailerShots[i]) return;
    pushUndo();
    state.trailerShots.splice(i, 1);
    closeShotDialog();
    renderShotList();
    setMessage('Trailer shot deleted.');
  }

  function exportTrailerShots() {
    const blob = new Blob([JSON.stringify({ shots: state.trailerShots }, null, 2)], { type: 'application/json' });
    downloadBlob(blob, 'trailer-shots.json');
    setMessage('Downloaded trailer-shots.json — render with npm run trailer -- --shots trailer-shots.json');
  }

  function showRenderCommand() {
    setMessage('Render: npm run trailer -- --shots trailer-shots.json');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText('npm run trailer -- --shots trailer-shots.json').catch(function () {});
    }
  }

  function openBlenderDialog() {
    $('blenderToCode').textContent = 'node tools/blender-map-bridge.js to-blender js/MapEdits.js map.blend';
    $('blenderFromCode').textContent = 'node tools/blender-map-bridge.js to-editor map.blend patch.json';
    const generateRow = $('blenderGenerateRow');
    if (generateRow) {
      generateRow.hidden = !blenderGenerateCommand;
      $('blenderGenerateCode').textContent = blenderGenerateCommand || '';
    }
    $('blenderDialog').hidden = false;
  }

  function downloadCurrentPatchJSON() {
    const blob = new Blob([JSON.stringify(patchData(), null, 2)], { type: 'application/json' });
    downloadBlob(blob, 'map-patch.json');
    setMessage('Downloaded map-patch.json for Blender.');
  }

  /* ---------- GTA / community asset import ---------- */
  function gtaEl(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = String(text);
    return node;
  }

  function refreshGtaCategoryFilter() {
    const select = $('gtaCategoryFilter');
    if (!select) return;
    const current = select.value;
    select.textContent = '';
    const all = document.createElement('option');
    all.value = '';
    all.textContent = 'All types';
    select.appendChild(all);
    GTA.categories.forEach(function (cat) {
      const option = document.createElement('option');
      option.value = cat.key;
      option.textContent = cat.label;
      select.appendChild(option);
    });
    select.value = current || '';
  }

  function renderGtaAssets() {
    const list = $('gtaAssetList');
    if (!list) return;
    list.textContent = '';
    const filter = $('gtaCategoryFilter') ? $('gtaCategoryFilter').value : '';
    const byType = {};
    GTA.assets.forEach(function (asset) {
      const type = asset.type || 'models';
      if (!byType[type]) byType[type] = [];
      byType[type].push(asset);
    });
    let shown = 0;
    GTA.categories.forEach(function (cat) {
      if (filter && filter !== cat.key) return;
      const entries = byType[cat.key] || [];
      if (!entries.length) return;
      entries.sort(function (a, b) {
        return String(a.label || a.key || '').localeCompare(String(b.label || b.key || ''));
      });
      shown += entries.length;
      const section = gtaEl('div', 'gtaAssetSection');
      section.appendChild(gtaEl('div', 'gtaAssetHeading', cat.label + ' (' + entries.length + ')'));
      entries.forEach(function (asset) {
        const row = gtaEl('div', 'gtaAssetRow');
        const isTexture = asset.type === 'textures' || (!asset.model && !!asset.texture);
        const uri = (CC.GeneratedAssets && CC.GeneratedAssets.textures || {})[asset.texture || asset.key];
        if (isTexture && uri) {
          const thumb = gtaEl('img', 'gtaAssetThumb');
          thumb.src = uri;
          thumb.alt = '';
          row.appendChild(thumb);
        }
        row.appendChild(gtaEl('span', 'gtaAssetName', asset.label || asset.key || 'Asset'));
        const available = !isTexture && !!MODEL_RECORDS[asset.key];
        row.appendChild(gtaEl('span', 'gtaAssetMeta',
          (isTexture ? 'texture' : available ? gtaTypeLabel(asset.type) : 'unavailable') +
          (asset.source ? ' · ' + asset.source : '')));
        const action = gtaEl('button', '', isTexture ? 'Apply' : 'Place');
        action.disabled = !isTexture && !available;
        action.addEventListener('click', function () {
          if (isTexture) applyTextureToSelection(asset.texture || asset.key);
          else placeGtaAsset(asset);
        });
        row.appendChild(action);
        section.appendChild(row);
      });
      list.appendChild(section);
    });
    if (!shown) {
      list.appendChild(gtaEl('div', 'gtaEmpty',
        'No assets yet. Import generated JSON / GLB / PNG files, or run the DFF/TXD converter.'));
    }
  }

  function openGtaImportDialog() {
    refreshGtaCategoryFilter();
    renderGtaAssets();
    $('gtaImportDialog').hidden = false;
  }

  function applyGtaImport(data) {
    if (!data) return false;
    const counts = { models: 0, textures: 0, assets: 0 };
    const selectedTexture = state.selection && state.selection.kind === 'asset'
      ? (getSelectedObject() || {}).texture : null;
    const selectedModels = {};
    [ $('modelKey'), $('assetModel'), $('paintModel'), $('selModel') ].forEach(function (select) {
      if (select) selectedModels[select.id] = select.value;
    });

    if (data.textures && Object.keys(data.textures).length) {
      if (CC.AssetLoader && CC.AssetLoader.registerTextures) {
        CC.AssetLoader.registerTextures(data.textures);
      } else {
        Object.assign(CC.GeneratedAssets.textures, data.textures);
      }
      Object.assign(GTA.textures, data.textures);
      counts.textures = Object.keys(data.textures).length;
    }
    if (data.models && Object.keys(data.models).length) {
      if (CC.AssetLoader && CC.AssetLoader.registerModels) {
        CC.AssetLoader.registerModels(data.models);
      } else {
        Object.assign(MODEL_RECORDS, data.models);
      }
      Object.assign(GTA.models, data.models);
      counts.models = Object.keys(data.models).length;
    }
    if (Array.isArray(data.assets) && data.assets.length) {
      if (Array.isArray(data.categories) && data.categories.length) GTA.categories = data.categories;
      const seen = {};
      GTA.assets.forEach(function (asset) {
        seen[(asset.type || '') + '|' + (asset.key || asset.label || '')] = true;
      });
      data.assets.forEach(function (asset) {
        const id = (asset.type || '') + '|' + (asset.key || asset.label || '');
        if (seen[id]) return;
        seen[id] = true;
        GTA.assets.push(asset);
        counts.assets++;
      });
      const order = {};
      GTA.categories.forEach(function (cat, i) { order[cat.key] = i; });
      GTA.assets.sort(function (a, b) {
        const d = (order[a.type] == null ? 99 : order[a.type]) - (order[b.type] == null ? 99 : order[b.type]);
        return d || String(a.label || a.key || '').localeCompare(String(b.label || b.key || ''));
      });
    }
    if (counts.models) {
      refreshModelKeys();
      [ $('modelKey'), $('assetModel'), $('paintModel'), $('selModel') ].forEach(function (select) {
        if (!select) return;
        const previous = selectedModels[select.id];
        fillModelSelect(select, MODEL_RECORDS[previous] ? previous : MODEL_KEYS[0]);
      });
    }
    fillTextureSelect($('selTexture'), selectedTexture);
    refreshGtaCategoryFilter();
    renderGtaAssets();
    updateSelectionForm();
    if (CC.MapPreview3D && CC.MapPreview3D.refresh) CC.MapPreview3D.refresh();
    const parts = [];
    if (counts.models) parts.push(counts.models + ' models');
    if (counts.textures) parts.push(counts.textures + ' textures');
    if (counts.assets) parts.push(counts.assets + ' entries');
    const notice = data.notices && data.notices.length ? ' — ' + data.notices[0] : '';
    setMessage(parts.length ? 'Asset import: ' + parts.join(', ') + '.' + notice : 'No importable assets found.' + notice);
    return counts.models + counts.textures + counts.assets > 0;
  }

  function placeGtaAsset(asset) {
    const key = asset.key || asset.model;
    if (!MODEL_RECORDS[key]) {
      setMessage('That model is not registered in this session.');
      return;
    }
    $('gtaImportDialog').hidden = true;
    $('modelKey').value = key;
    $('modelScale').value = '1';
    setTool('model');
    setMessage('Click the map to place ' + (asset.label || modelLabel(key)) +
      ' (' + gtaTypeLabel(asset.type) + ').');
  }

  function applyTextureToSelection(textureKey) {
    const obj = getSelectedObject();
    const s = state.selection;
    if (!s || s.kind !== 'asset' || !obj ||
        !(obj.type === 'model' || obj.type === 'glb' || obj.type === 'gltf')) {
      setMessage('Select a placed model first, then apply this texture.');
      return;
    }
    if (!textureKey || !(CC.GeneratedAssets.textures || {})[textureKey]) {
      setMessage('That texture is not registered in this session.');
      return;
    }
    pushUndo();
    obj.texture = textureKey;
    updateSelectionForm();
    render();
    if (CC.MapPreview3D && CC.MapPreview3D.refresh) CC.MapPreview3D.refresh();
    setMessage('Applied texture "' + textureLabel(textureKey) + '" to ' + (obj.name || 'selected model') + '.');
  }

  /* ---------- new asset dialog ---------- */
  const ASSET_LABELS = { building: 'Building', bridge: 'Bridge', tree: 'Tree', model: 'Model' };

  function askAssetDetails(type, defaultName, defaultModel) {
    return new Promise(function (resolve) {
      const dialog = $('assetDialog');
      const isModel = type === 'model';
      $('assetDialogType').textContent = (ASSET_LABELS[type] || 'Asset') + ' — describe what you are adding to the map.';
      assetDialogDefault = defaultName || ('Editor ' + (ASSET_LABELS[type] || 'Asset'));
      $('assetName').value = assetDialogDefault;
      $('assetDesc').value = '';
      $('assetGenerate').checked = false;
      $('assetPrompt').value = '';
      $('assetPromptRow').hidden = true;
      $('assetGenerateHint').hidden = true;
      $('assetGenerate').onchange = function () {
        const on = !!$('assetGenerate').checked;
        $('assetPromptRow').hidden = !on;
        $('assetGenerateHint').hidden = !on;
        if (on && !$('assetPrompt').value.trim()) {
          $('assetPrompt').value = $('assetDesc').value.trim();
        }
        if (on) setTimeout(function () { $('assetPrompt').focus(); }, 0);
      };
      $('assetModelRow').hidden = !isModel;
      if (isModel) fillModelSelect($('assetModel'), defaultModel || MODEL_KEYS[0]);
      dialog.hidden = false;
      assetDialogResolve = resolve;
      setTimeout(function () { $('assetName').focus(); $('assetName').select(); }, 0);
    });
  }

  function closeAssetDialog(result) {
    $('assetDialog').hidden = true;
    const resolve = assetDialogResolve;
    assetDialogResolve = null;
    if (resolve) resolve(result);
  }

  function submitAssetDialog() {
    const name = $('assetName').value.trim() || assetDialogDefault;
    const generate = !!$('assetGenerate').checked;
    const prompt = ($('assetPrompt').value || $('assetDesc').value).trim();
    if (generate && !prompt) {
      setMessage('Enter a detailed prompt before generating with Blender.');
      $('assetPrompt').focus();
      return;
    }
    closeAssetDialog({
      name: name,
      description: $('assetDesc').value.trim(),
      model: $('assetModel').value || MODEL_KEYS[0],
      generate: generate,
      prompt: generate ? prompt : '',
      key: 'ai_' + (slugify(name) || 'generated-asset')
    });
  }

  /* Place a pending generated model at the click position, download the prompt
     job, and show the exact local Blender 3.6 command needed to bake it. */
  function placeGeneratedAsset(info, at) {
    pushUndo();
    const asset = {
      id: 'edit_' + Date.now(), type: 'model', model: info.key,
      name: info.name, description: info.description || info.prompt,
      prompt: info.prompt, x: at.x, z: at.z, y: 0, scale: 1, rot: 0,
      w: 8, l: 8, h: 6, generated: true
    };
    state.assets.push(asset);
    state.selection = { kind: 'asset', index: state.assets.length - 1 };
    updateSelectionForm();
    render();

    const file = slugify(info.name || info.key) + '.aiasset.json';
    const out = 'capture/generated-' + slugify(info.key) + '.json';
    const job = { version: 1, key: info.key, name: info.name,
      description: info.description || '', prompt: info.prompt, asset: clone(asset) };
    downloadBlob(new Blob([JSON.stringify(job, null, 2)],
      { type: 'application/json' }), file);
    blenderGenerateCommand = 'node tools/blender-ai-asset.js generate ~/Downloads/' +
      file + ' --out ' + out;
    openBlenderDialog();
    setMessage('Placed "' + info.name + '" at X ' + at.x.toFixed(1) +
      ' / Z ' + at.z.toFixed(1) + '. Bake it with Blender, then import the result JSON.');
  }

  /* Import the JSON written by tools/blender-ai-asset.js. Registering the model
     makes it visible immediately in the 2D/3D preview without a page reload. */
  function applyGeneratedAsset(data) {
    if (!data || !data.models) {
      setMessage('That file is not a generated-model result.');
      return false;
    }
    const keys = Object.keys(data.models);
    if (!keys.length) {
      setMessage('Generated result contains no models.');
      return false;
    }
    if (CC.AssetLoader && CC.AssetLoader.registerModels) {
      CC.AssetLoader.registerModels(data.models);
    } else {
      Object.keys(data.models).forEach(function (key) { MODEL_RECORDS[key] = data.models[key]; });
    }
    refreshModelKeys();
    [ $('modelKey'), $('assetModel'), $('paintModel'), $('selModel') ].forEach(function (select) {
      if (select) fillModelSelect(select, keys[0]);
    });

    const asset = data.asset || (data.job && data.job.asset) || null;
    if (asset) {
      pushUndo();
      let index = -1;
      if (asset.id) index = state.assets.findIndex(function (a) { return a.id === asset.id; });
      if (index < 0 && asset.model) {
        index = state.assets.findIndex(function (a) { return a.model === asset.model && a.generated; });
      }
      const placed = clone(asset);
      placed.generated = true;
      placed.model = placed.model || keys[0];
      if (index >= 0) state.assets[index] = placed;
      else { index = state.assets.length; state.assets.push(placed); }
      state.selection = { kind: 'asset', index: index };
      updateSelectionForm();
      render();
    }
    setMessage('Imported generated model: ' + modelLabel(keys[0]) + '. Drag it to fine-tune its position.');
    return true;
  }

  function syncNewGameMode() {
    const on = !!$('newGameMode').checked;
    $('gameNameRow').hidden = !on;
    $('newMapCreateBtn').textContent = on ? 'Create game project' : 'Create map';
    if (on && !$('gameName').value.trim()) {
      $('gameName').value = $('newMapName').value.trim() || 'New Game';
    }
  }

  function openNewMapDialog(standalone) {
    $('newMapName').value = state.gameName || 'New Map';
    $('newMapWidth').value = 860;
    $('newMapHeight').value = 740;
    $('newGameMode').checked = !!standalone;
    $('gameName').value = state.gameName || $('newMapName').value || 'New Game';
    syncNewGameMode();
    $('newMapDialog').hidden = false;
    setTimeout(function () {
      const field = standalone ? $('gameName') : $('newMapName');
      field.focus(); field.select();
    }, 0);
  }

  function createNewMap() {
    const width = Number($('newMapWidth').value);
    const height = Number($('newMapHeight').value);
    if (!isFinite(width) || !isFinite(height) || width < 100 || height < 100 || width > 4000 || height > 4000) {
      setMessage('Map size must be between 100 and 4000 world units.');
      return;
    }
    pushUndo();
    state.world = {
      minX: -width * 0.5, maxX: width * 0.5,
      minZ: -height * 0.5, maxZ: height * 0.5
    };
    state.newMap = true;
    state.standaloneGame = !!$('newGameMode').checked;
    state.gameName = state.standaloneGame
      ? ($('gameName').value.trim() || $('newMapName').value.trim() || 'New Game') : '';
    state.mapName = state.standaloneGame ? state.gameName : ($('newMapName').value.trim() || 'New Map');
    state.roads = [];
    state.buildings = [];
    state.landmarks = [];
    state.challenges = [];
    state.assets = [];
    state.missions = [];
    state.missionEditIndex = -1;
    state.elevation = { hills: [], points: [], grid: null };
    state.selection = null;
    state.draft = null;
    $('draftHint').hidden = true;
    $('newMapDialog').hidden = true;
    updateApplyButton();
    renderMissionList(); renderMissionWaypointList();
    buildTerrain();
    fitView();
    updateSelectionForm();
    render();
    setMessage(state.standaloneGame
      ? 'New game "' + state.gameName + '" created — ' + width + ' × ' + height + '. Use Create game folder to export it.'
      : 'New blank map "' + state.mapName + '" created — ' + width + ' × ' + height + '.');
  }

  /* ---------- UI plumbing ---------- */
  function setMessage(text) { $('message').textContent = text; }
  function updateZoomLabel() { $('zoomLabel').textContent = Math.round(state.view.scale * 100) + '%'; }
  function updateCounts() {
    $('counts').textContent = state.roads.length + ' roads · ' +
      (state.buildings.length + state.landmarks.length + state.assets.length) + ' assets · ' +
      state.trailerShots.length + ' shots';
  }

  function pointerPos(e) {
    const rect = canvas.getBoundingClientRect();
    return { sx: e.clientX - rect.left, sy: e.clientY - rect.top };
  }

  function snap(p) {
    if (!state.spaceDown) return p;
    return { x: Math.round(p.x / 5) * 5, z: Math.round(p.z / 5) * 5 };
  }

  canvas.addEventListener('pointerdown', function (e) {
    const pos = pointerPos(e);
    const world = snap(screenToWorld(pos.sx, pos.sy));
    state.mouse.sx = pos.sx; state.mouse.sy = pos.sy;
    state.mouse.wx = world.x; state.mouse.wz = world.z;
    state.mouse.inside = true;
    canvas.setPointerCapture(e.pointerId);

    if (e.button === 1 || state.spaceDown || state.tool === 'pan') {
      state.drag = { type: 'pan', sx: pos.sx, sy: pos.sy, tx: state.view.tx, ty: state.view.ty };
      canvas.classList.add('panning');
      return;
    }
    if (e.button !== 0) return;

    if (state.tool === 'select') {
      const mh = hitMissionWaypoint(pos.sx, pos.sy);
      if (mh) {
        const wp = (state.missions[mh.mission].actions || [])[mh.index];
        state.selection = mh;
        pushUndo();
        state.drag = { type: 'mission', world: world, ox: wp.x, oz: wp.z,
          mission: mh.mission, index: mh.index };
        updateSelectionForm(); render();
        return;
      }
      const v = hitRoadVertex(pos.sx, pos.sy);
      if (v) {
        state.selection = v;
        pushUndo();
        state.drag = { type: 'vertex', world: world };
        updateSelectionForm(); render();
        return;
      }
      const a = hitAsset(pos.sx, pos.sy);
      state.selection = a;
      if (a) {
        pushUndo();
        const obj = getSelectedObject();
        state.drag = { type: 'asset', world: world, ox: obj.x || 0, oz: obj.z || 0 };
      }
      updateSelectionForm(); render();
      return;
    }

    if (state.tool === 'road') {
      if (!state.draft) state.draft = [];
      const last = state.draft[state.draft.length - 1];
      if (!last || Math.hypot(last[0] - world.x, last[1] - world.z) > 2) {
        state.draft.push([world.x, world.z]);
      }
      $('draftHint').hidden = false;
      $('draftHint').textContent = state.draft.length + ' point(s) — double-click or Enter to finish';
      render();
      return;
    }

    if (state.tool === 'roadErase') {
      const hit = hitRoadSegment(pos.sx, pos.sy);
      if (!hit) { setMessage('No road under the cursor.'); return; }
      if (e.shiftKey || state.roads[hit.index].closed) {
        pushUndo();
        state.roads.splice(hit.index, 1);
        state.selection = null;
        setMessage('Road deleted.');
      } else {
        splitRoad(hit);
      }
      updateSelectionForm(); render();
      return;
    }

    if (state.tool === 'mission') {
      const hit = hitMissionWaypoint(pos.sx, pos.sy);
      if (hit) {
        const wp = (state.missions[hit.mission].actions || [])[hit.index];
        state.selection = hit;
        state.missionEditIndex = hit.mission;
        pushUndo();
        state.drag = { type: 'mission', world: world, ox: wp.x, oz: wp.z,
          mission: hit.mission, index: hit.index };
        updateSelectionForm(); render();
        return;
      }
      addMissionWaypoint(world.x, world.z);
      return;
    }

    if (state.tool === 'trailer') {
      if (!state.trailerDraft || state.trailerDraft.finish) {
        state.trailerDraft = { start: { x: world.x, z: world.z }, finish: null, vehicle: 'coupe', mode: 'road' };
        setMessage('Trailer start set — click the finish point.');
      } else {
        state.trailerDraft.finish = { x: world.x, z: world.z };
        openShotDialog(-1);
        return;
      }
      render();
      return;
    }

    if (state.tool === 'building' || state.tool === 'bridge') {
      state.drag = { type: 'shape', tool: state.tool, anchor: world, current: world };
      render();
      return;
    }

    if (state.tool === 'paint') {
      pushUndo();
      state.drag = { type: 'paint', last: { x: world.x, z: world.z }, count: 0, index: 1 };
      stampBrushAt(world.x, world.z, state.drag.index++);
      state.drag.count++;
      render();
      return;
    }

    if (state.tool === 'tree') {
      const at = { x: world.x, z: world.z };
      askAssetDetails('tree', 'Editor Tree').then(function (info) {
        if (!info) { setMessage('Asset creation cancelled.'); return; }
        if (info.generate) { placeGeneratedAsset(info, at); return; }
        pushUndo();
        state.assets.push({
          id: 'edit_' + Date.now(), type: 'tree', name: info.name,
          description: info.description, x: at.x, z: at.z,
          scale: Number($('treeScale').value) || 1
        });
        state.selection = { kind: 'asset', index: state.assets.length - 1 };
        updateSelectionForm(); render();
        setMessage('Tree placed.');
      });
      return;
    }

    if (state.tool === 'model') {
      const at = { x: world.x, z: world.z };
      const key = $('modelKey').value || MODEL_KEYS[0];
      askAssetDetails('model', 'Editor ' + modelLabel(key), key).then(function (info) {
        if (!info) { setMessage('Asset creation cancelled.'); return; }
        if (info.generate) { placeGeneratedAsset(info, at); return; }
        pushUndo();
        const chosen = info.model || key;
        const scale = Math.max(0.05, Number($('modelScale').value) || 1);
        const asset = {
          id: 'edit_' + Date.now(), type: 'model', model: chosen,
          name: info.name, description: info.description,
          x: at.x, z: at.z, y: 0, scale: scale, rot: 0
        };
        const fp = modelFootprint(asset);
        if (fp) { asset.w = fp.w; asset.l = fp.l; asset.h = fp.h; }
        if (info.color != null) asset.color = info.color;
        state.assets.push(asset);
        state.selection = { kind: 'asset', index: state.assets.length - 1 };
        updateSelectionForm(); render();
        setMessage('Model placed: ' + modelLabel(chosen) + '.');
      });
      return;
    }

    if (state.tool === 'assetErase') {
      const a = hitAsset(pos.sx, pos.sy);
      if (!a) { setMessage('No asset under the cursor.'); return; }
      state.selection = a;
      deleteSelection();
    }
  });

  canvas.addEventListener('pointermove', function (e) {
    const pos = pointerPos(e);
    const world = snap(screenToWorld(pos.sx, pos.sy));
    state.mouse.sx = pos.sx; state.mouse.sy = pos.sy;
    state.mouse.wx = world.x; state.mouse.wz = world.z;
    state.mouse.inside = true;
    $('coord').textContent = 'X ' + world.x.toFixed(1) + '   Z ' + world.z.toFixed(1);

    const d = state.drag;
    if (d) {
      if (d.type === 'pan') {
        state.view.tx = d.tx + (pos.sx - d.sx);
        state.view.ty = d.ty + (pos.sy - d.sy);
      } else if (d.type === 'vertex') {
        const obj = getSelectedObject();
        if (obj && obj.points && state.selection.vertex != null) {
          obj.points[state.selection.vertex] = [world.x, world.z];
        }
      } else if (d.type === 'asset') {
        const obj = getSelectedObject();
        if (obj) {
          obj.x = d.ox + (world.x - d.world.x);
          obj.z = d.oz + (world.z - d.world.z);
        }
      } else if (d.type === 'mission') {
        const m = state.missions[d.mission];
        const wp = m && (m.actions || [])[d.index];
        if (wp) {
          wp.x = d.ox + (world.x - d.world.x);
          wp.z = d.oz + (world.z - d.world.z);
          clampMissionPoint(m, wp, d.index);
        }
      } else if (d.type === 'shape') {
        d.current = world;
      } else if (d.type === 'paint') {
        const step = brushSettings().spacing;
        const dx = world.x - d.last.x, dz = world.z - d.last.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.01) {
          const n = Math.min(200, Math.floor(dist / step));
          for (let i = 1; i <= n; i++) {
            const t = (i * step) / dist;
            stampBrushAt(d.last.x + dx * t, d.last.z + dz * t, d.index++);
            d.count++;
          }
          if (n) {
            const t = (n * step) / dist;
            d.last.x += dx * t;
            d.last.z += dz * t;
          }
        }
      }
    }
    render();
  });

  canvas.addEventListener('pointerleave', function () {
    state.mouse.inside = false;
    render();
  });

  canvas.addEventListener('pointerup', function (e) {
    const pos = pointerPos(e);
    const d = state.drag;
    const shape = d && d.type === 'shape' ? d : null;
    const painted = d && d.type === 'paint' ? d.count : 0;
    if (shape) shape.current = snap(screenToWorld(pos.sx, pos.sy));
    state.drag = null;
    canvas.classList.remove('panning');
    updateSelectionForm();
    render();
    if (painted) setMessage('Painted ' + painted + ' brush stamp' + (painted === 1 ? '' : 's') + '.');
    if (shape) {
      askAssetDetails(shape.tool, 'Editor ' + (ASSET_LABELS[shape.tool] || 'Asset')).then(function (info) {
        if (!info) { setMessage('Asset creation cancelled.'); return; }
        if (info.generate) {
          const a = shape.anchor || {}, b = shape.current || a;
          placeGeneratedAsset(info, { x: (Number(a.x) + Number(b.x)) * 0.5,
            z: (Number(a.z) + Number(b.z)) * 0.5 });
        } else commitShape(shape, info);
      });
    }
  });

  canvas.addEventListener('dblclick', function (e) {
    if (state.tool === 'road' && state.draft && state.draft.length >= 2) { finishRoad(); return; }
    if (state.tool === 'mission' || state.tool === 'select') {
      const pos = pointerPos(e);
      const hit = hitMissionWaypoint(pos.sx, pos.sy);
      if (hit) openWaypointDialog(hit.mission, hit.index);
    }
  });

  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    const pos = pointerPos(e);
    zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, pos.sx, pos.sy);
  }, { passive: false });

  window.addEventListener('keydown', function (e) {
    if (!$('newMapDialog').hidden) {
      if (e.key === 'Escape') { e.preventDefault(); $('newMapDialog').hidden = true; }
      else if (e.key === 'Enter' && (e.target === $('newMapName') || e.target === $('gameName') || e.target === $('newMapWidth') || e.target === $('newMapHeight'))) {
        e.preventDefault(); createNewMap();
      }
      return;
    }
    if (!$('gtaImportDialog').hidden) {
      if (e.key === 'Escape') { e.preventDefault(); $('gtaImportDialog').hidden = true; }
      return;
    }
    if (!$('assetDialog').hidden) {
      if (e.key === 'Escape') { e.preventDefault(); closeAssetDialog(null); }
      return;
    }
    if (!$('shotDialog').hidden) {
      if (e.key === 'Escape') { e.preventDefault(); closeShotDialog(); }
      else if (e.key === 'Enter' && e.target === $('shotName')) { e.preventDefault(); saveShot(); }
      return;
    }
    if (!$('missionDialog').hidden) {
      if (e.key === 'Escape') { e.preventDefault(); closeMissionDialog(); }
      else if (e.key === 'Enter' && e.target === $('missionName')) { e.preventDefault(); saveMission(); }
      return;
    }
    if (!$('wpDialog').hidden) {
      if (e.key === 'Escape') { e.preventDefault(); closeWaypointDialog(); }
      else if (e.key === 'Enter' && e.target === $('wpName')) { e.preventDefault(); saveWaypoint(); }
      return;
    }
    if (!$('blenderDialog').hidden) {
      if (e.key === 'Escape') { e.preventDefault(); $('blenderDialog').hidden = true; }
      return;
    }
    const tag = (e.target && e.target.tagName || '').toLowerCase();
    const typing = tag === 'input' || tag === 'select' || tag === 'textarea';
    if (!typing && e.key.toLowerCase() === 'p' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault(); setPreviewMode(!previewMode); return;
    }
    if (!typing && previewMode && ['1', '2', '3', '4'].indexOf(e.key) !== -1) {
      e.preventDefault();
      setTransformMode({ '1': 'view', '2': 'move', '3': 'rotate', '4': 'scale' }[e.key]);
      return;
    }
    if (typing || tag === 'button') return;
    if (e.code === 'Space') { state.spaceDown = true; canvas.style.cursor = 'grab'; e.preventDefault(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (e.key === 'Enter' && state.tool === 'road') { finishRoad(); return; }
    if (e.key === 'Escape') {
      state.draft = null; state.selection = null; state.trailerDraft = null;
      $('draftHint').hidden = true;
      updateSelectionForm(); render();
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') { deleteSelection(); return; }
    if (e.key === '+' || e.key === '=') { zoomAt(1.2, canvas.clientWidth / 2, canvas.clientHeight / 2); return; }
    if (e.key === '-') { zoomAt(1 / 1.2, canvas.clientWidth / 2, canvas.clientHeight / 2); return; }
    if (e.key === '0') {
      if (previewMode && CC.MapPreview3D) CC.MapPreview3D.focus();
      else { fitView(); render(); }
      return;
    }
    const shortcuts = { v: 'select', b: 'road', e: 'roadErase', r: 'building', g: 'bridge', t: 'tree', w: 'paint', m: 'model', k: 'trailer', j: 'mission', x: 'assetErase', h: 'pan' };
    const k = e.key.toLowerCase();
    if (shortcuts[k]) {
      if (previewMode) setPreviewMode(false);
      setTool(shortcuts[k]);
    }
  });

  window.addEventListener('keyup', function (e) {
    if (e.code === 'Space') {
      state.spaceDown = false;
      canvas.style.cursor = state.tool === 'pan' ? 'grab' : 'crosshair';
    }
  });

  document.querySelectorAll('.tool').forEach(function (b) {
    b.addEventListener('click', function () { setTool(b.dataset.tool); });
  });
  $('undoBtn').addEventListener('click', undo);
  $('redoBtn').addEventListener('click', redo);
  $('gridBtn').addEventListener('click', function () {
    state.grid = !state.grid;
    $('gridBtn').classList.toggle('on', state.grid);
    render();
  });
  $('zoomInBtn').addEventListener('click', function () { zoomAt(1.2, canvas.clientWidth / 2, canvas.clientHeight / 2); });
  $('zoomOutBtn').addEventListener('click', function () { zoomAt(1 / 1.2, canvas.clientWidth / 2, canvas.clientHeight / 2); });
  $('zoomFitBtn').addEventListener('click', function () { fitView(); render(); });
  // This is the primary view toggle: clicking it while already in 2D enters
  // 3D, and clicking it in 3D returns to the 2D editor. The dedicated 3D
  // button below still jumps straight to 3D.
  $('view2DBtn').addEventListener('click', function () { setPreviewMode(!previewMode); });
  $('preview3DBtn').addEventListener('click', function () { setPreviewMode(true); });
  $('previewFitBtn').addEventListener('click', function () {
    if (CC.MapPreview3D) CC.MapPreview3D.focus();
  });
  document.querySelectorAll('#renderTools .style').forEach(function (b) {
    b.addEventListener('click', function () {
      if (!previewMode) setPreviewMode(true);
      setStyleMode(b.dataset.style);
    });
  });
  document.querySelectorAll('#transformTools .transform').forEach(function (b) {
    b.addEventListener('click', function () {
      if (!previewMode) setPreviewMode(true);
      setTransformMode(b.dataset.transform);
    });
  });
  $('addShotBtn').addEventListener('click', function () {
    if (previewMode) setPreviewMode(false);
    setTool('trailer');
    state.trailerDraft = null;
    setMessage('Click a start point, then a finish point on the map.');
  });
  $('exportShotsBtn').addEventListener('click', exportTrailerShots);
  $('renderShotsBtn').addEventListener('click', showRenderCommand);
  $('shotCancelBtn').addEventListener('click', closeShotDialog);
  $('shotSaveBtn').addEventListener('click', saveShot);
  $('shotDeleteBtn').addEventListener('click', deleteActiveShot);
  $('missionNewBtn').addEventListener('click', function () { openMissionDialog(-1); });
  $('missionToolBtn').addEventListener('click', function () {
    if (previewMode) setPreviewMode(false);
    setTool('mission');
    setMessage('Click the map to add waypoints; double-click a waypoint to edit it.');
  });
  $('missionKmlBtn').addEventListener('click', function () { $('kmlInput').click(); });
  $('kmlInput').addEventListener('change', function () {
    if ($('kmlInput').files && $('kmlInput').files[0]) importMapFile($('kmlInput').files[0]);
    $('kmlInput').value = '';
  });
  $('missionCancelBtn').addEventListener('click', closeMissionDialog);
  $('missionSaveBtn').addEventListener('click', saveMission);
  $('missionShotsBtn').addEventListener('click', downloadMissionShots);
  $('missionDeleteBtn').addEventListener('click', deleteActiveMission);
  $('missionAddWpBtn').addEventListener('click', function () {
    closeMissionDialog();
    setTool('mission');
    setMessage('Click the map to add a waypoint.');
  });
  $('wpAction').addEventListener('change', updateWaypointDialogFields);
  $('wpCancelBtn').addEventListener('click', closeWaypointDialog);
  $('wpSaveBtn').addEventListener('click', saveWaypoint);
  $('wpDeleteBtn').addEventListener('click', deleteActiveWaypoint);
  $('blenderSendBtn').addEventListener('click', openBlenderDialog);
  $('blenderCloseBtn').addEventListener('click', function () { $('blenderDialog').hidden = true; });
  $('blenderPatchBtn').addEventListener('click', downloadCurrentPatchJSON);
  $('blenderImportBtn').addEventListener('click', function () {
    $('blenderDialog').hidden = true;
    $('importInput').click();
  });
  $('generatedModelBtn').addEventListener('click', function () {
    $('generatedModelInput').click();
  });
  $('generatedModelInput').addEventListener('change', async function () {
    const file = this.files && this.files[0];
    this.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      $('blenderDialog').hidden = true;
      applyGeneratedAsset(data);
    } catch (e) {
      setMessage('Could not read generated model JSON: ' + (e && e.message ? e.message : e));
    }
  });
  $('roadWidth').addEventListener('input', function () { $('roadWidthOut').textContent = $('roadWidth').value; render(); });
  $('treeScale').addEventListener('input', function () { $('treeScaleOut').textContent = Number($('treeScale').value).toFixed(1); });
  $('modelScale').addEventListener('input', function () { $('modelScaleOut').textContent = Number($('modelScale').value).toFixed(2); });
  $('paintKind').addEventListener('change', function () {
    $('paintModelRow').hidden = $('paintKind').value !== 'model';
  });
  $('paintSize').addEventListener('input', function () {
    $('paintSizeOut').textContent = $('paintSize').value;
    render();
  });
  $('paintSpacing').addEventListener('input', function () {
    $('paintSpacingOut').textContent = $('paintSpacing').value;
  });
  $('paintJitter').addEventListener('input', function () {
    $('paintJitterOut').textContent = $('paintJitter').value + '%';
  });
  $('paintScale').addEventListener('input', function () {
    $('paintScaleOut').textContent = Number($('paintScale').value).toFixed(2);
  });
  ['showRoads', 'showBuildings', 'showLandmarks', 'showCustom'].forEach(function (id) {
    $(id).addEventListener('change', function () {
      state.layers[id.replace('show', '').toLowerCase()] = $(id).checked;
      render();
    });
  });
  $('applySelectionBtn').addEventListener('click', applySelection);
  $('deleteSelectionBtn').addEventListener('click', deleteSelection);
  $('newMapBtn').addEventListener('click', function () { openNewMapDialog(false); });
  $('newGameBtn').addEventListener('click', function () { openNewMapDialog(true); });
  $('newGameMode').addEventListener('change', syncNewGameMode);
  $('newMapImportBtn').addEventListener('click', function () {
    createNewMap();
    if ($('newMapDialog').hidden) $('importInput').click();
  });
  $('newMapCancelBtn').addEventListener('click', function () { $('newMapDialog').hidden = true; });
  $('newMapCreateBtn').addEventListener('click', createNewMap);
  $('assetCreateBtn').addEventListener('click', submitAssetDialog);
  $('assetCancelBtn').addEventListener('click', function () { closeAssetDialog(null); });
  $('assetName').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); submitAssetDialog(); }
  });
  $('applyBtn').addEventListener('click', async function () {
    if (state.standaloneGame) return saveGameProject();
    const applied = await applyPatchToGame();
    if (!applied) return savePatch();
  });
  $('chooseGameFolderBtn').addEventListener('click', function () {
    return chooseGameFolder();
  });
  $('copyBtn').addEventListener('click', copyPatch);
  $('resetBtn').addEventListener('click', function () {
    pushUndo();
    const baked = gameMapData();
    const fresh = gameBaseRoads();
    restore({
      world: clone(DEFAULT_WORLD),
      newMap: false,
      standaloneGame: false,
      gameName: '',
      mapName: 'Coastal Cruise',
      roads: fresh,
      buildings: clone(baked.buildings),
      landmarks: clone(baked.landmarks),
      challenges: clone(baked.challenges),
      assets: [],
      trailerShots: [],
      missions: [],
      elevation: { hills: [], points: [], grid: null }
    });
    buildTerrain();
    if (CC.MapPreview3D) CC.MapPreview3D.refresh();
    setMessage('Reloaded the current game map.');
  });
  $('loadBtn').addEventListener('click', function () { $('loadInput').click(); });
  $('loadInput').addEventListener('change', function () {
    if ($('loadInput').files && $('loadInput').files[0]) loadPatchFile($('loadInput').files[0]);
    $('loadInput').value = '';
  });
  $('importBtn').addEventListener('click', function () { $('importInput').click(); });
  $('importInput').addEventListener('change', function () {
    if ($('importInput').files && $('importInput').files[0]) importMapFile($('importInput').files[0]);
    $('importInput').value = '';
  });
  $('gtaImportBtn').addEventListener('click', openGtaImportDialog);
  $('gtaImportCloseBtn').addEventListener('click', function () {
    $('gtaImportDialog').hidden = true;
  });
  $('gtaImportFileBtn').addEventListener('click', function () {
    $('gtaImportInput').click();
  });
  $('gtaImportInput').addEventListener('change', async function () {
    const files = Array.prototype.slice.call(this.files || []);
    this.value = '';
    if (!files.length) return;
    if (!CC.GtaImporter || !CC.GtaImporter.importFiles) {
      setMessage('BrowserGtaImport.js did not load.');
      return;
    }
    try {
      const data = await CC.GtaImporter.importFiles(files);
      applyGtaImport(data);
    } catch (e) {
      setMessage('Asset import failed: ' + (e && e.message ? e.message : e));
    }
  });
  window.addEventListener('resize', resize);

  /* ---------- application menu ---------- */
  function initMenuBar() {
    const bar = $('menuBar');
    if (!bar) return;
    const menus = Array.prototype.slice.call(bar.querySelectorAll('.menu'));

    function setOpen(menu, open) {
      menu.classList.toggle('open', open);
      const title = menu.querySelector('.menuTitle');
      if (title) title.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    function closeAll() {
      menus.forEach(function (menu) { setOpen(menu, false); });
    }

    menus.forEach(function (menu) {
      const title = menu.querySelector('.menuTitle');
      title.addEventListener('click', function (e) {
        e.stopPropagation();
        const wasOpen = menu.classList.contains('open');
        closeAll();
        if (!wasOpen) setOpen(menu, true);
      });
    });

    function runItem(item) {
      closeAll();
      if (item.dataset.target) {
        const target = document.querySelector(item.dataset.target);
        if (target) target.click();
        return;
      }
      if (item.dataset.menuTool) {
        const toolBtn = document.querySelector('.tool[data-tool="' + item.dataset.menuTool + '"]');
        if (toolBtn) toolBtn.click();
        return;
      }
      if (item.dataset.key) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: item.dataset.key, bubbles: true }));
        return;
      }
      if (item.dataset.menuStyle) {
        if (!previewMode) setPreviewMode(true);
        const styleBtn = document.querySelector('#renderTools .style[data-style="' + item.dataset.menuStyle + '"]');
        if (styleBtn) styleBtn.click();
        return;
      }
      if (item.dataset.menuTransform) {
        if (!previewMode) setPreviewMode(true);
        setTransformMode(item.dataset.menuTransform);
        return;
      }
      const action = item.dataset.action;
      if (action === 'fullscreen') toggleFullscreen();
      else if (action === 'help') {
        const help = document.querySelector('#sidebar section.help');
        if (help && help.scrollIntoView) help.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setMessage('Editor guide shown in the sidebar.');
      } else if (action === 'open-game') {
        window.open('index.html', '_blank');
      }
    }

    bar.querySelectorAll('.menuItem').forEach(function (item) {
      item.addEventListener('click', function (e) {
        e.stopPropagation();
        runItem(item);
      });
    });
    document.addEventListener('click', closeAll);
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && bar.querySelector('.menu.open')) {
        e.stopImmediatePropagation();
        closeAll();
      }
    }, true);
    document.addEventListener('fullscreenchange', function () {
      const item = $('fullscreenItem');
      if (!item) return;
      const label = item.childNodes[0];
      if (label && label.nodeType === 3) {
        label.textContent = document.fullscreenElement ? 'Exit full screen ' : 'Enter full screen ';
      }
    });
  }

  function toggleFullscreen() {
    const root = document.documentElement;
    if (document.fullscreenElement) {
      if (document.exitFullscreen) document.exitFullscreen();
      return;
    }
    if (!root.requestFullscreen) {
      setMessage('This browser does not support element full screen — use F11.');
      return;
    }
    root.requestFullscreen().catch(function () {
      setMessage('Full screen was blocked by the browser — press F11.');
    });
  }

  /* ---------- boot ---------- */
  function boot() {
    initMenuBar();
    fillModelSelect($('modelKey'), MODEL_KEYS[0]);
    fillModelSelect($('assetModel'), MODEL_KEYS[0]);
    fillModelSelect($('selModel'), MODEL_KEYS[0]);
    fillModelSelect($('paintModel'), MODEL_KEYS[0]);
    fillTextureSelect($('selTexture'), '');
    initData();
    buildTerrain();
    if (CC.MapPreview3D) {
      CC.MapPreview3D.init($('previewWrap'), null, function () { return state; });
      if (CC.MapPreview3D.setSelectHandler) {
        CC.MapPreview3D.setSelectHandler(function (pick) {
          if (pick && (pick.kind === 'road' || pick.kind === 'asset' || pick.kind === 'building' || pick.kind === 'landmark')) {
            state.selection = pick;
            updateSelectionForm();
            render();
            setMessage(pick.kind === 'road' ? 'Road selected in 3D.' : 'Object selected in 3D.');
          } else {
            state.selection = null;
            updateSelectionForm();
            render();
          }
        });
      }
      if (CC.MapPreview3D.setTransformHandler) CC.MapPreview3D.setTransformHandler(apply3DTransform);
      if (CC.MapPreview3D.setEditMode) CC.MapPreview3D.setEditMode(state.transformMode);
      if (CC.MapPreview3D.setStyleMode) CC.MapPreview3D.setStyleMode('game');
    }
    renderShotList();
    renderMissionList();
    renderMissionWaypointList();
    resize();
    fitView();
    if (currentPatch()) setMessage('Editing the patch in js/MapEdits.js.');
    else setMessage('Editing the current game map.');
    setTool('select');
    updateSelectionForm();
    updateHistoryButtons();
    render();
  }

  // Load the same baked image map the game uses before reading any map data.
  // ImageMap.apply() installs the game's coastal/height/surface functions and
  // paints the ground canvas, so the editor never drifts to procedural data.
  if (CC.ImageMap && CC.ImageMap.load) {
    CC.ImageMap.load(CC.imageMapDef && CC.imageMapDef.src).then(function (ok) {
      if (ok && CC.ImageMap.apply) CC.ImageMap.apply();
      boot();
    }).catch(function (err) {
      console.warn('[MapEditor] Could not load the game map:', err);
      boot();
    });
  } else {
    boot();
  }
})();
