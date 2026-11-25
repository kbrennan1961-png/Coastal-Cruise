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
    assetErase: 'Erase asset: click a building, landmark or custom asset to remove it.',
    model: 'Model: click to place a baked Blender/baked model from the brush list.',
    pan: 'Pan: drag the map. Middle mouse or Space+drag also pans.'
  };

  const MODEL_RECORDS = (CC.AssetLoader && CC.AssetLoader.models) || {};
  const MODEL_KEYS = Object.keys(MODEL_RECORDS).sort();

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

  function modelFootprint(a) {
    const key = a && (a.model || a.modelKey || a.key);
    const model = key && MODEL_RECORDS[key];
    if (!model || !model.bounds || !CC.AssetLoader || !CC.AssetLoader.footprint) return null;
    const fp = CC.AssetLoader.footprint(key);
    if (!fp) return null;
    const scale = (Number(a.scale) || 1) * (Number(model.scale) || 1);
    return { w: fp.w * scale, l: fp.l * scale, h: fp.h * scale };
  }

  const state = {
    world: Object.assign({}, DEFAULT_WORLD),
    newMap: false,
    standaloneGame: false,
    gameName: '',
    mapName: 'Coastal Cruise',
    roads: [], buildings: [], landmarks: [], challenges: [], assets: [],
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

  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  function bounds() { return state.world; }

  function currentPatch() {
    return CC.mapEdits && CC.mapEdits.active ? CC.mapEdits : null;
  }

  function initData() {
    const baked = CC.bakedMap || {};
    const patch = currentPatch();
    const bakedRoads = baked.roads || [];
    state.world = patch && patch.world ? clone(patch.world) : clone(DEFAULT_WORLD);
    state.newMap = !!(patch && patch.newMap);
    state.standaloneGame = !!(patch && patch.standaloneGame);
    state.gameName = patch && patch.gameName ? patch.gameName : '';
    state.mapName = patch && patch.mapName ? patch.mapName : 'Coastal Cruise';
    state.roads = clone(patch && Array.isArray(patch.roads)
      ? patch.roads
      : (CC.simplifyRoads ? CC.simplifyRoads(clone(bakedRoads)) : bakedRoads));
    state.buildings = clone(patch && Array.isArray(patch.buildings) ? patch.buildings : (baked.buildings || []));
    state.landmarks = clone(patch && Array.isArray(patch.landmarks) ? patch.landmarks : (baked.landmarks || []));
    state.challenges = clone(patch && Array.isArray(patch.challenges) ? patch.challenges : (baked.challenges || []));
    state.assets = clone(patch && patch.assets ? patch.assets : []);
    state.elevation = clone(patch && patch.elevation
      ? patch.elevation : { hills: [], points: [], grid: null });
    updateApplyButton();
  }

  /* ---------- terrain preview ---------- */
  let terrainCanvas = null;
  function buildTerrain() {
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
    drawSelection();
    drawCursor();
    updateCounts();
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
      assets: clone(state.assets), elevation: clone(state.elevation)
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
    state.elevation = clone(s.elevation || { hills: [], points: [], grid: null });
    state.selection = null;
    state.draft = null;
    state.drag = null;
    $('draftHint').hidden = true;
    updateSelectionForm();
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
      $('selectionForm').hidden = true;
      $('selModelRow').hidden = true;
      $('selScaleRow').hidden = true;
      return;
    }
    $('selectionEmpty').hidden = true;
    $('selectionForm').hidden = false;
    const s = state.selection;
    const isRoad = s.kind === 'road';
    const isModel = obj.type === 'model' || obj.type === 'glb' || obj.type === 'gltf';
    $('selModelRow').hidden = !isModel;
    $('selScaleRow').hidden = !isModel;
    if (isModel) {
      fillModelSelect($('selModel'), obj.model || obj.modelKey || obj.key);
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
    document.querySelectorAll('#tools .tool').forEach(function (b) {
      b.classList.toggle('active', b.dataset.tool === tool);
    });
    $('toolHint').textContent = HINTS[tool] || '';
    canvas.style.cursor = tool === 'pan' ? 'grab' : 'crosshair';
    render();
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
      assets: clone(state.assets)
    };
  }

  function patchText() {
    return '/* Generated by map-editor.html - do not edit by hand.\n' +
      '   Save this file as js/MapEdits.js, then hard-refresh index.html. */\n' +
      '(function () {\n  \'use strict\';\n  var CC = window.CC = window.CC || {};\n' +
      '  CC.mapEdits = ' + JSON.stringify(patchData(), null, 2) + ';\n' +
      '})();\n';
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
      btn.title = 'Export the patch the game will load';
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
          assets: patch.assets || [], elevation: patch.elevation || null
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

  function parseEditorJSON(obj) {
    const data = {};
    if (obj.world) data.world = clone(obj.world);
    ['roads', 'buildings', 'landmarks', 'assets', 'challenges'].forEach(function (k) {
      if (Array.isArray(obj[k])) data[k] = clone(obj[k]);
    });
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
    ['roads', 'buildings', 'landmarks', 'assets', 'challenges'].forEach(function (k) {
      if (Array.isArray(data[k])) state[k] = clone(data[k]);
    });
    if (data.elevation) state.elevation = normalizeElevation(data.elevation);
    if (data.mapName) state.mapName = data.mapName;
    state.selection = null;
    state.draft = null;
    $('draftHint').hidden = true;
    updateSelectionForm();
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
        if (/\.(osm|xml)$/i.test(file.name) || /^\s*</.test(text)) {
          data = parseOSM(text);
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
    closeAssetDialog({
      name: $('assetName').value.trim() || assetDialogDefault,
      description: $('assetDesc').value.trim(),
      model: $('assetModel').value || MODEL_KEYS[0]
    });
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
    state.elevation = { hills: [], points: [], grid: null };
    state.selection = null;
    state.draft = null;
    $('draftHint').hidden = true;
    $('newMapDialog').hidden = true;
    updateApplyButton();
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
      (state.buildings.length + state.landmarks.length + state.assets.length) + ' assets';
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

    if (state.tool === 'building' || state.tool === 'bridge') {
      state.drag = { type: 'shape', tool: state.tool, anchor: world, current: world };
      render();
      return;
    }

    if (state.tool === 'tree') {
      const at = { x: world.x, z: world.z };
      askAssetDetails('tree', 'Editor Tree').then(function (info) {
        if (!info) { setMessage('Asset creation cancelled.'); return; }
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
      } else if (d.type === 'shape') {
        d.current = world;
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
    if (shape) shape.current = snap(screenToWorld(pos.sx, pos.sy));
    state.drag = null;
    canvas.classList.remove('panning');
    updateSelectionForm();
    render();
    if (shape) {
      askAssetDetails(shape.tool, 'Editor ' + (ASSET_LABELS[shape.tool] || 'Asset')).then(function (info) {
        if (!info) { setMessage('Asset creation cancelled.'); return; }
        commitShape(shape, info);
      });
    }
  });

  canvas.addEventListener('dblclick', function () {
    if (state.tool === 'road' && state.draft && state.draft.length >= 2) finishRoad();
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
    if (!$('assetDialog').hidden) {
      if (e.key === 'Escape') { e.preventDefault(); closeAssetDialog(null); }
      return;
    }
    const tag = (e.target && e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea' || tag === 'button') return;
    if (e.code === 'Space') { state.spaceDown = true; canvas.style.cursor = 'grab'; e.preventDefault(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (e.key === 'Enter' && state.tool === 'road') { finishRoad(); return; }
    if (e.key === 'Escape') {
      state.draft = null; state.selection = null;
      $('draftHint').hidden = true;
      updateSelectionForm(); render();
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') { deleteSelection(); return; }
    if (e.key === '+' || e.key === '=') { zoomAt(1.2, canvas.clientWidth / 2, canvas.clientHeight / 2); return; }
    if (e.key === '-') { zoomAt(1 / 1.2, canvas.clientWidth / 2, canvas.clientHeight / 2); return; }
    if (e.key === '0') { fitView(); render(); return; }
    const shortcuts = { v: 'select', b: 'road', e: 'roadErase', r: 'building', g: 'bridge', t: 'tree', m: 'model', x: 'assetErase', h: 'pan' };
    const k = e.key.toLowerCase();
    if (shortcuts[k]) setTool(shortcuts[k]);
  });

  window.addEventListener('keyup', function (e) {
    if (e.code === 'Space') {
      state.spaceDown = false;
      canvas.style.cursor = state.tool === 'pan' ? 'grab' : 'crosshair';
    }
  });

  document.querySelectorAll('#tools .tool').forEach(function (b) {
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
  $('roadWidth').addEventListener('input', function () { $('roadWidthOut').textContent = $('roadWidth').value; render(); });
  $('treeScale').addEventListener('input', function () { $('treeScaleOut').textContent = Number($('treeScale').value).toFixed(1); });
  $('modelScale').addEventListener('input', function () { $('modelScaleOut').textContent = Number($('modelScale').value).toFixed(2); });
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
  $('applyBtn').addEventListener('click', function () {
    return state.standaloneGame ? saveGameProject() : savePatch();
  });
  $('copyBtn').addEventListener('click', copyPatch);
  $('resetBtn').addEventListener('click', function () {
    pushUndo();
    const baked = CC.bakedMap || {};
    const fresh = CC.simplifyRoads ? CC.simplifyRoads(clone(baked.roads || [])) : clone(baked.roads || []);
    restore({
      world: clone(DEFAULT_WORLD),
      newMap: false,
      standaloneGame: false,
      gameName: '',
      mapName: 'Coastal Cruise',
      roads: fresh,
      buildings: clone(baked.buildings || []),
      landmarks: clone(baked.landmarks || []),
      challenges: clone(baked.challenges || []),
      assets: [],
      elevation: { hills: [], points: [], grid: null }
    });
    setMessage('Reloaded the baked map (runtime roads reapplied).');
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
  window.addEventListener('resize', resize);

  /* ---------- boot ---------- */
  fillModelSelect($('modelKey'), MODEL_KEYS[0]);
  fillModelSelect($('assetModel'), MODEL_KEYS[0]);
  fillModelSelect($('selModel'), MODEL_KEYS[0]);
  initData();
  buildTerrain();
  resize();
  fitView();
  if (currentPatch()) setMessage('Editing the patch in js/MapEdits.js.');
  setTool('select');
  updateSelectionForm();
  updateHistoryButtons();
  render();
})();
