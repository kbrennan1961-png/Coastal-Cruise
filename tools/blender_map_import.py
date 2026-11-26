"""Import a Coastal Cruise MapEdits.js patch or native JSON into Blender 3.6+.

  /Applications/Blender.app/Contents/MacOS/Blender -b \
    --python tools/blender_map_import.py -- js/MapEdits.js --clear \
    --save /tmp/coastal-map.blend

By default this builds real meshes from the baked model bundles in
js/GeneratedAssets.js and js/DownloadedAssets.js, so placed vehicles, houses,
pines and rocks are visible in Blender. Every placement gets a tagged parent
empty so blender_map_export.py can round-trip it. Use --proxies for the old
lightweight empties/cones instead.

Tagged objects carry cc_type values road, building, bridge, tree, model,
elevation, landmark and challenge. Landmarks/challenges are empties whose
cc_data JSON string holds the full original object (cc_id/cc_name are also
set for readability). Scene custom properties cc_trailer_shots and
cc_patch_meta hold JSON text for patch trailerShots and other patch metadata
so blender_map_export.py can restore them verbatim.

Options:
  --clear            Delete current objects before importing.
  --save FILE        Save the result as a .blend file.
  --proxies          Skip baked meshes and import lightweight proxies.

Coordinate mapping is the inverse of blender_map_export.py:

  game X -> Blender X
  game Z -> Blender -Y
  game Y/height -> Blender Z
  game Y rotation -> Blender Z rotation
"""
import array
import base64
import bpy
import json
import math
import os
import re
import sys


argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if not argv:
    raise SystemExit('usage: blender_map_import.py <MapEdits.js|patch.json> '
                     '[--clear] [--save file.blend] [--proxies]')
src_path = argv[0]
flags = argv[1:]
clear_scene = '--clear' in flags
use_proxies = '--proxies' in flags
save_path = None
if '--save' in flags:
    idx = flags.index('--save')
    if idx + 1 >= len(flags):
        raise SystemExit('--save needs a path')
    save_path = flags[idx + 1]

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUNDLES = (
    (os.path.join(ROOT, 'js', 'GeneratedAssets.js'), 'CC.GeneratedAssets ='),
    (os.path.join(ROOT, 'js', 'DownloadedAssets.js'), 'const data ='),
)
PART_CACHE = {}
MATERIAL_CACHE = {}

ROLE_COLORS = {
    'body': 0x4b8fd6, 'paint': 0x4b8fd6, 'car': 0x4b8fd6,
    'glass': 0x9cc8d6, 'window': 0x9cc8d6, 'windshield': 0x9cc8d6,
    'door': 0x6f5139, 'wood': 0x8a6745, 'wooden': 0x8a6745,
    'roof': 0xb8b0a2, 'wall': 0xd9c7a8, 'wallpaper': 0xd9c7a8,
    'stone': 0x9a958c, 'rock': 0x8d8a82, 'concrete': 0xa8a49b,
    'metal': 0x8d959c, 'trim': 0xbec5c9, 'chrome': 0xd6dadd,
    'tyre': 0x202326, 'tire': 0x202326, 'wheel': 0x202326,
    'head': 0xfff2c0, 'light': 0xfff2c0, 'brake': 0xa52b24,
    'sirenred': 0xd03434, 'sirenblue': 0x3d7fe0,
    'leaf': 0x4d8a4a, 'leaves': 0x4d8a4a, 'pine': 0x3e7849,
    'grass': 0x6a9a54, 'flower': 0xd99ac2, 'trunk': 0x8a6342,
    'default': 0xb6b9b5,
}
COLOR_OVERRIDE_ROLES = {
    'body', 'paint', 'car', 'wall', 'wallpaper', 'stone', 'rock',
    'wood', 'wooden', 'default', 'roof', 'trim', 'metal',
}


def extract_json(text):
    marker = 'CC.mapEdits'
    start = text.find(marker)
    if start < 0:
        raise RuntimeError('not a MapEdits.js patch: missing CC.mapEdits')
    brace = text.find('{', start)
    if brace < 0:
        raise RuntimeError('not a MapEdits.js patch: missing object')
    return extract_braced(text, brace)


def extract_braced(text, brace):
    depth = 0
    in_string = False
    escaped = False
    for i in range(brace, len(text)):
        ch = text[i]
        if in_string:
            if escaped:
                escaped = False
            elif ch == '\\':
                escaped = True
            elif ch == '"':
                in_string = False
            continue
        if ch == '"':
            in_string = True
        elif ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                return text[brace:i + 1]
    raise RuntimeError('unterminated object')


def js_object_to_json(text):
    # Bundles are plain object literals: unquoted keys are the only difference
    # from JSON. Base64 payloads never contain braces, commas or identifiers.
    text = re.sub(r'([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)\s*:', r'\1"\2":', text)
    text = re.sub(r',(\s*[}\]])', r'\1', text)
    return json.loads(text)


def load_patch(path):
    with open(path) as fh:
        text = fh.read()
    stripped = text.lstrip()
    if stripped.startswith('{'):
        return json.loads(text)
    return json.loads(extract_json(text))


def load_model_catalog():
    models = {}
    for path, marker in BUNDLES:
        if not os.path.isfile(path):
            continue
        with open(path) as fh:
            text = fh.read()
        start = text.find(marker)
        if start < 0:
            continue
        brace = text.find('{', start)
        if brace < 0:
            continue
        try:
            bundle = js_object_to_json(extract_braced(text, brace))
        except (ValueError, RuntimeError) as exc:
            print('Warning: could not read {}: {}'.format(path, exc))
            continue
        models.update(bundle.get('models') or {})
    return models


def collection(name):
    found = bpy.data.collections.get(name)
    if found:
        return found
    created = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(created)
    return created


def link_to(obj, coll):
    for old in list(obj.users_collection):
        old.objects.unlink(obj)
    coll.objects.link(obj)


def set_props(obj, data):
    obj['cc_id'] = data.get('id', '')
    obj['cc_name'] = data.get('name', obj.name)
    obj['cc_description'] = data.get('description', '')
    if data.get('hidden'):
        obj['cc_hidden'] = True


def json_text(value):
    """Deterministic JSON text for Blender custom properties."""
    return json.dumps(value, sort_keys=True, ensure_ascii=True,
                      separators=(',', ':'))


def readable_prop(data, *names):
    for name in names:
        value = data.get(name)
        if value is not None:
            return str(value)
    return ''


def as_float(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def color_int(value, default):
    if value is None or value == '':
        return default
    if isinstance(value, int):
        return value
    text = str(value).strip()
    try:
        if text.startswith('#'):
            return int(text[1:], 16)
        if text.lower().startswith('0x'):
            return int(text, 16)
        return int(text)
    except ValueError:
        return default


def role_color(role, override):
    key = str(role or 'default').lower()
    if override is not None and any(part in key for part in COLOR_OVERRIDE_ROLES):
        return int(override) & 0xffffff
    for candidate, color in ROLE_COLORS.items():
        if candidate in key:
            return color
    return ROLE_COLORS['default']


def material(role, override):
    color = role_color(role, override)
    name = 'CC_mat_{}_{:06x}'.format(re.sub(r'[^a-z0-9]+', '_', str(role).lower()), color)
    found = MATERIAL_CACHE.get(name)
    if found:
        return found
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = False
    mat.diffuse_color = (
        ((color >> 16) & 255) / 255.0,
        ((color >> 8) & 255) / 255.0,
        (color & 255) / 255.0,
        1.0,
    )
    MATERIAL_CACHE[name] = mat
    return mat


def decode_values(part, field, typecode):
    raw = base64.b64decode(part.get(field, ''))
    values = array.array(typecode)
    if not raw:
        return values
    values.frombytes(raw[:len(raw) - (len(raw) % values.itemsize)])
    if sys.byteorder != 'little':
        values.byteswap()
    return values


def build_part_meshes(key, model):
    cached = PART_CACHE.get(key)
    if cached is not None:
        return cached

    model_scale = float(model.get('scale') or 1.0)
    bounds = model.get('bounds') or {}
    min_y = float((bounds.get('min') or [0, 0, 0])[1] or 0)
    base_z = 0.0 if model.get('wheels') else -min_y * model_scale
    meshes = []

    for index, part in enumerate(model.get('parts') or []):
        positions = decode_values(part, 'position', 'f')
        indices = decode_values(
            part, 'index', 'I' if part.get('indexType') == 5125 else 'H')
        vertices = []
        for i in range(0, len(positions) - 2, 3):
            # Game local (x, y=up, z) -> Blender local (x, -z, y).
            vertices.append((
                float(positions[i]) * model_scale,
                -float(positions[i + 2]) * model_scale,
                float(positions[i + 1]) * model_scale + base_z,
            ))
        faces = []
        for i in range(0, len(indices) - 2, 3):
            face = (int(indices[i]), int(indices[i + 1]), int(indices[i + 2]))
            if all(0 <= v < len(vertices) for v in face):
                faces.append(face)
        if not vertices or not faces:
            continue
        role = part.get('role') or part.get('texture') or 'default'
        mesh = bpy.data.meshes.new('CC_{}_part_{}'.format(key, index))
        mesh.from_pydata(vertices, [], faces)
        mesh.update()
        mesh.materials.append(material(role, None))
        meshes.append((mesh, role))

    PART_CACHE[key] = meshes
    return meshes


def add_wheels(parent, coll, model, model_scale, override):
    for index, wheel in enumerate(model.get('wheels') or []):
        radius = max(0.15, float(wheel.get('y') or 0.4) * model_scale)
        depth = radius * 0.72
        location = (
            float(wheel.get('x') or 0) * model_scale,
            -float(wheel.get('z') or 0) * model_scale,
            float(wheel.get('y') or 0.4) * model_scale,
        )
        bpy.ops.mesh.primitive_cylinder_add(
            vertices=10, radius=radius, depth=depth, location=location)
        obj = bpy.context.object
        obj.name = 'part_wheel_{}'.format(index)
        obj.rotation_euler.y = math.pi * 0.5
        obj.data.materials.append(material('tyre', override))
        link_to(obj, coll)
        obj.parent = parent
        obj['cc_model_part'] = parent.get('cc_model_key', '')


def make_road(road, coll):
    curve = bpy.data.curves.new(road.get('name', 'Road'), 'CURVE')
    curve.dimensions = '3D'
    points = road.get('points') or []
    if len(points) < 2:
        return
    spline = curve.splines.new('POLY')
    spline.points.add(len(points) - 1)
    for point, pair in zip(spline.points, points):
        point.co = (float(pair[0]), -float(pair[1]), 0.0, 1.0)
    spline.use_cyclic_u = bool(road.get('closed'))
    obj = bpy.data.objects.new(road.get('name', 'Road'), curve)
    coll.objects.link(obj)
    obj['cc_type'] = 'road'
    obj['cc_road_type'] = road.get('type', 'paved')
    obj['cc_width'] = float(road.get('width', 12))
    obj['cc_closed'] = bool(road.get('closed'))
    if road.get('forceBridge'):
        obj['cc_force_bridge'] = True


def make_shape(asset, coll):
    kind = asset['type']
    w = max(2.0, float(asset.get('w', 10)))
    l = max(2.0, float(asset.get('l', 8)))
    h = max(1.0, float(asset.get('h', 4))) if kind == 'building' else 0.75
    z = float(asset.get('y', h * 0.5 if kind == 'building' else 5))
    bpy.ops.mesh.primitive_cube_add(location=(asset.get('x', 0), -asset.get('z', 0), z))
    obj = bpy.context.object
    obj.name = asset.get('name', kind) or kind
    obj.scale = (w * 0.5, l * 0.5, h * 0.5)
    obj.rotation_euler.z = float(asset.get('rot', 0))
    obj.data.materials.append(material(kind, color_int(asset.get('color'), None)))
    link_to(obj, coll)
    set_props(obj, asset)
    obj['cc_type'] = kind
    if asset.get('color') is not None:
        obj['cc_color'] = int(asset['color'])


def make_model_node(asset, coll, key, kind, models, parent_name=None):
    model = models.get(key)
    scale = max(0.05, float(asset.get('scale') or 1.0))
    color = color_int(asset.get('color'), None)
    parent = bpy.data.objects.new(parent_name or 'MODEL_' + str(key), None)
    parent.empty_display_type = 'PLAIN_AXES'
    parent.location = (
        float(asset.get('x') or 0),
        -float(asset.get('z') or 0),
        float(asset.get('y') or 0),
    )
    parent.rotation_euler.z = float(asset.get('rot') or 0)
    parent.scale = (scale, scale, scale)
    coll.objects.link(parent)
    set_props(parent, asset)
    parent['cc_type'] = kind
    parent['cc_scale'] = scale
    parent['cc_rot'] = float(asset.get('rot') or 0)
    parent['cc_y'] = float(asset.get('y') or 0)
    if kind == 'model':
        parent['cc_model_key'] = str(key)
    if color is not None:
        parent['cc_color'] = int(color)

    if use_proxies or not model:
        parent.empty_display_type = 'SPHERE'
        return parent

    for index, (mesh, role) in enumerate(build_part_meshes(str(key), model)):
        obj = bpy.data.objects.new('part_{}_{}'.format(key, index), mesh)
        link_to(obj, coll)
        obj.parent = parent
        obj['cc_model_part'] = str(key)
        if color is not None and obj.material_slots:
            slot = obj.material_slots[0]
            slot.link = 'OBJECT'
            slot.material = material(role, color)
    add_wheels(parent, coll, model, float(model.get('scale') or 1.0), color)
    return parent


def make_tree(asset, coll, models):
    if not use_proxies and 'pine' in models:
        node = make_model_node(asset, coll, 'pine', 'tree', models,
                               parent_name='TREE_pine')
        node['cc_color'] = color_int(asset.get('color'), 0x4d8a4a)
        return node
    scale = max(0.5, float(asset.get('scale', 1)))
    bpy.ops.mesh.primitive_cone_add(
        location=(asset.get('x', 0), -asset.get('z', 0), 4.6 * scale),
        radius1=2.1 * scale, depth=6 * scale, vertices=7)
    obj = bpy.context.object
    obj.name = asset.get('name', 'Tree') or 'Tree'
    obj.rotation_euler.z = float(asset.get('rot', 0))
    obj.data.materials.append(material('pine', color_int(asset.get('color'), None)))
    link_to(obj, coll)
    set_props(obj, asset)
    obj['cc_type'] = 'tree'
    obj['cc_scale'] = scale
    if asset.get('color') is not None:
        obj['cc_color'] = int(asset['color'])
    return obj


def make_model(asset, coll, models):
    key = asset.get('model') or asset.get('modelKey') or asset.get('key') or 'unknown'
    return make_model_node(asset, coll, str(key), 'model', models)


def make_elevation(point, coll):
    bpy.ops.object.empty_add(
        type='PLAIN_AXES',
        location=(point.get('x', 0), -point.get('z', 0), float(point.get('h', 0))))
    obj = bpy.context.object
    obj.name = 'ELEV_' + (point.get('name') or 'point')
    link_to(obj, coll)
    set_props(obj, point)
    obj['cc_type'] = 'elevation'
    obj['cc_h'] = float(point.get('h', 0))
    obj['cc_r'] = float(point.get('r', 25))


def make_info_empty(data, kind, index, coll):
    """Keep an arbitrary landmark/challenge object intact for export."""
    obj = bpy.data.objects.new('{}_{:04d}'.format(kind.upper(), index), None)
    obj.empty_display_type = 'PLAIN_AXES'
    obj.location = (
        as_float(data.get('x')),
        -as_float(data.get('z')),
        as_float(data.get('y')),
    )
    coll.objects.link(obj)
    obj['cc_type'] = kind
    obj['cc_index'] = int(index)
    obj['cc_data'] = json_text(data)
    obj['cc_id'] = readable_prop(data, 'id', 'key') or 'blend_' + obj.name
    obj['cc_name'] = readable_prop(data, 'name', 'title', 'label') or obj.name
    if data.get('hidden'):
        obj['cc_hidden'] = True
    return obj


def main():
    patch = load_patch(src_path)
    models = {} if use_proxies else load_model_catalog()
    if clear_scene:
        bpy.ops.object.select_all(action='SELECT')
        bpy.ops.object.delete(use_global=False)
    roads_coll = collection('CC Roads')
    assets_coll = collection('CC Assets')
    elev_coll = collection('CC Elevation')
    landmarks_coll = collection('CC Landmarks')
    challenges_coll = collection('CC Challenges')

    for road in patch.get('roads') or []:
        make_road(road, roads_coll)
    for asset in patch.get('assets') or []:
        kind = asset.get('type')
        if kind in ('building', 'bridge'):
            make_shape(asset, assets_coll)
        elif kind == 'tree':
            make_tree(asset, assets_coll, models)
        elif kind in ('model', 'glb', 'gltf'):
            make_model(asset, assets_coll, models)
    elevation = patch.get('elevation') or {}
    for point in elevation.get('points') or []:
        make_elevation(point, elev_coll)
    for index, landmark in enumerate(patch.get('landmarks') or []):
        make_info_empty(landmark, 'landmark', index, landmarks_coll)
    for index, challenge in enumerate(patch.get('challenges') or []):
        make_info_empty(challenge, 'challenge', index, challenges_coll)

    scene = bpy.context.scene
    if patch.get('mapName'):
        scene['cc_map_name'] = patch['mapName']
    if 'trailerShots' in patch:
        scene['cc_trailer_shots'] = json_text(patch['trailerShots'])
    elif 'cc_trailer_shots' in scene.keys():
        del scene['cc_trailer_shots']

    data_keys = {'roads', 'buildings', 'assets', 'elevation', 'landmarks',
                 'challenges', 'trailerShots'}
    meta = {key: value for key, value in patch.items() if key not in data_keys}
    if meta:
        scene['cc_patch_meta'] = json_text(meta)
    elif 'cc_patch_meta' in scene.keys():
        del scene['cc_patch_meta']

    if save_path:
        os.makedirs(os.path.dirname(os.path.abspath(save_path)), exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=save_path)
    print('Imported {} roads, {} assets, {} landmarks, {} challenges from {} '
          '({} baked models{})'.format(
              len(patch.get('roads') or []), len(patch.get('assets') or []),
              len(patch.get('landmarks') or []), len(patch.get('challenges') or []),
              src_path, len(models), ' — proxies' if use_proxies else ''))


main()
