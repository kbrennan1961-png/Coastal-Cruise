"""Import a Coastal Cruise MapEdits.js patch or native JSON into Blender 3.6+.

  /Applications/Blender.app/Contents/MacOS/Blender -b \
    --python tools/blender_map_import.py -- js/MapEdits.js --clear \
    --save /tmp/coastal-map.blend

Creates editable proxy objects with cc_* custom properties. Roads become curves;
buildings/bridges/trees become meshes; model placements become empties tagged
with cc_model_key so blender_map_export.py can round-trip them.

Coordinate mapping is the inverse of blender_map_export.py:

  game X -> Blender X
  game Z -> Blender -Y
  game Y/height -> Blender Z
  game Y rotation -> Blender Z rotation
"""
import bpy
import json
import os
import sys

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if not argv:
    raise SystemExit('usage: blender_map_import.py <MapEdits.js|patch.json> [--clear] [--save file.blend]')
src_path = argv[0]
flags = argv[1:]
clear_scene = '--clear' in flags
save_path = None
if '--save' in flags:
    idx = flags.index('--save')
    if idx + 1 >= len(flags):
        raise SystemExit('--save needs a path')
    save_path = flags[idx + 1]


def extract_json(text):
    marker = 'CC.mapEdits'
    start = text.find(marker)
    if start < 0:
        raise RuntimeError('not a MapEdits.js patch: missing CC.mapEdits')
    brace = text.find('{', start)
    if brace < 0:
        raise RuntimeError('not a MapEdits.js patch: missing object')
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
    raise RuntimeError('unterminated CC.mapEdits object')


def load_patch(path):
    with open(path) as fh:
        text = fh.read()
    stripped = text.lstrip()
    if stripped.startswith('{'):
        return json.loads(text)
    return json.loads(extract_json(text))


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
    link_to(obj, coll)
    set_props(obj, asset)
    obj['cc_type'] = kind
    if asset.get('color') is not None:
        obj['cc_color'] = int(asset['color'])


def make_tree(asset, coll):
    scale = max(0.5, float(asset.get('scale', 1)))
    bpy.ops.mesh.primitive_cone_add(
        location=(asset.get('x', 0), -asset.get('z', 0), 4.6 * scale),
        radius1=2.1 * scale, depth=6 * scale, vertices=7)
    obj = bpy.context.object
    obj.name = asset.get('name', 'Tree') or 'Tree'
    obj.rotation_euler.z = float(asset.get('rot', 0))
    link_to(obj, coll)
    set_props(obj, asset)
    obj['cc_type'] = 'tree'
    obj['cc_scale'] = scale
    if asset.get('color') is not None:
        obj['cc_color'] = int(asset['color'])


def make_model(asset, coll):
    bpy.ops.object.empty_add(
        type='SPHERE',
        location=(asset.get('x', 0), -asset.get('z', 0), float(asset.get('y', 0))))
    obj = bpy.context.object
    key = asset.get('model') or asset.get('modelKey') or 'unknown'
    obj.name = 'MODEL_' + str(key)
    link_to(obj, coll)
    set_props(obj, asset)
    obj['cc_type'] = 'model'
    obj['cc_model_key'] = str(key)
    obj['cc_scale'] = float(asset.get('scale', 1))
    obj['cc_rot'] = float(asset.get('rot', 0))
    obj.rotation_euler.z = float(asset.get('rot', 0))
    if asset.get('color') is not None:
        obj['cc_color'] = int(asset['color'])


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


def main():
    patch = load_patch(src_path)
    if clear_scene:
        bpy.ops.object.select_all(action='SELECT')
        bpy.ops.object.delete(use_global=False)
    roads_coll = collection('CC Roads')
    assets_coll = collection('CC Assets')
    elev_coll = collection('CC Elevation')

    for road in patch.get('roads') or []:
        make_road(road, roads_coll)
    for asset in patch.get('assets') or []:
        kind = asset.get('type')
        if kind in ('building', 'bridge'):
            make_shape(asset, assets_coll)
        elif kind == 'tree':
            make_tree(asset, assets_coll)
        elif kind in ('model', 'glb', 'gltf'):
            make_model(asset, assets_coll)
    elevation = patch.get('elevation') or {}
    for point in elevation.get('points') or []:
        make_elevation(point, elev_coll)

    if patch.get('mapName'):
        bpy.context.scene['cc_map_name'] = patch['mapName']

    if save_path:
        os.makedirs(os.path.dirname(os.path.abspath(save_path)), exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=save_path)
    print('Imported {} roads, {} assets from {}'.format(
        len(patch.get('roads') or []), len(patch.get('assets') or []), src_path))


main()
