"""Export a Blender scene to the Coastal Cruise map editor's native JSON shape.

Run with Blender 3.6+:

  /Applications/Blender.app/Contents/MacOS/Blender -b scene.blend \
    --python tools/blender_map_export.py -- output.json

Object conventions (set as custom properties, prefix names also work):

  cc_type = road | building | bridge | tree | model | elevation |
            landmark | challenge
  cc_type = road      Curve or mesh polyline. cc_road_type, cc_width,
                      cc_closed, cc_force_bridge.
  cc_type = building  Mesh/empty; bounding box becomes w/l/h. cc_color.
  cc_type = bridge    Mesh/empty; bbox becomes w/l, cc_y sets deck height.
  cc_type = tree      Point object; cc_scale.
  cc_type = model     Point object; cc_model_key names a baked asset,
                      cc_scale, cc_y, cc_rot, cc_color.
  cc_type = elevation Point object; cc_h and cc_r.
  cc_type = landmark  Empty; cc_data holds the full JSON object (cc_id and
                      cc_name are a fallback when cc_data is absent).
  cc_type = challenge Empty; same convention as landmark.

Scene custom properties: cc_trailer_shots holds JSON text for patch
trailerShots, cc_missions holds JSON text for INAV flight plans, and
cc_patch_meta holds JSON text for other patch metadata (world, mapWidth,
mapHeight, newMap, gameName, standaloneGame, etc.).

Coordinate mapping matches the game's glTF convention:

  Blender X -> game X
  Blender Y -> game -Z
  Blender Z -> game height / Y
  Blender Z rotation -> game Y rotation (same numeric radians)
"""
import bpy
import json
import os
import sys
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if not argv:
    raise SystemExit('usage: blender_map_export.py <output.json>')
out_path = argv[0]

PREFIXES = (
    ('road_', 'road'),
    ('building_', 'building'),
    ('bridge_', 'bridge'),
    ('tree_', 'tree'),
    ('model_', 'model'),
    ('elev_', 'elevation'),
    ('landmark_', 'landmark'),
    ('challenge_', 'challenge'),
)

DATA_KEYS = {'roads', 'buildings', 'assets', 'elevation', 'landmarks',
             'challenges', 'trailerShots', 'missions'}


def prop(obj, name, default=None):
    return obj.get(name, default)


def json_value(value, default):
    """Parse JSON text from a custom property, falling back on bad data."""
    if value is None:
        return default
    try:
        return json.loads(str(value))
    except (TypeError, ValueError):
        return default


def json_object(value, default=None):
    parsed = json_value(value, default)
    return parsed if isinstance(parsed, dict) else default


def kind_of(obj):
    explicit = prop(obj, 'cc_type')
    if explicit:
        return str(explicit)
    lower = obj.name.lower()
    for prefix, kind in PREFIXES:
        if lower.startswith(prefix):
            return kind
    return None


def number(obj, name, default):
    try:
        return float(prop(obj, name, default))
    except (TypeError, ValueError):
        return float(default)


def parse_color(value, default):
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


def world_points(obj):
    return [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]


def bounds(obj):
    points = world_points(obj)
    return (
        min(p.x for p in points), max(p.x for p in points),
        min(p.y for p in points), max(p.y for p in points),
        min(p.z for p in points), max(p.z for p in points),
    )


def unrotated_bounds(obj):
    """Local bounds with object scale applied, but without world rotation.

    Map-editor buildings/bridges store w/l/h before rotation. Using the world
    bounding box would inflate those dimensions when an object is rotated in
    Blender, so axis-aligned local extents are the correct round-trip values.
    """
    sx, sy, sz = (abs(float(v)) for v in obj.scale)
    points = [Vector((c[0] * sx, c[1] * sy, c[2] * sz)) for c in obj.bound_box]
    return (
        min(p.x for p in points), max(p.x for p in points),
        min(p.y for p in points), max(p.y for p in points),
        min(p.z for p in points), max(p.z for p in points),
    )


def euler_z(obj):
    try:
        return float(obj.matrix_world.to_euler().z)
    except Exception:
        return float(getattr(obj.rotation_euler, 'z', 0.0))


def spline_points(spline):
    points = getattr(spline, 'points', None)
    if points is not None:
        return [p.co.copy() for p in points]
    return [p.co.copy() for p in getattr(spline, 'bezier_points', [])]


def trace_mesh_path(obj):
    """Return ordered world-space (x, z) paths from a mesh's edges."""
    mesh = obj.data
    verts = [obj.matrix_world @ v.co for v in mesh.vertices]
    if not verts:
        return []
    adjacency = {i: [] for i in range(len(verts))}
    for edge in mesh.edges:
        a, b = edge.vertices
        adjacency.setdefault(a, []).append(b)
        adjacency.setdefault(b, []).append(a)
    if not any(adjacency.values()):
        return [[[v.x, -v.y] for v in verts]]

    paths = []
    seen_edges = set()
    starts = [i for i, adj in adjacency.items() if len(adj) == 1]
    starts += [i for i in range(len(verts)) if i not in starts]

    for start in starts:
        path = []
        current = start
        while current is not None and len(path) <= len(verts):
            path.append(verts[current])
            choices = [n for n in adjacency.get(current, [])
                       if tuple(sorted((current, n))) not in seen_edges]
            if not choices:
                break
            nxt = choices[0]
            seen_edges.add(tuple(sorted((current, nxt))))
            current = nxt
        if len(path) >= 2:
            paths.append([[v.x, -v.y] for v in path])
        if len(seen_edges) == len(mesh.edges):
            break
    return paths


def road_entries(obj):
    closed = bool(prop(obj, 'cc_closed', False))
    common = {
        'name': prop(obj, 'cc_name', obj.name),
        'type': prop(obj, 'cc_road_type', 'paved'),
        'width': number(obj, 'cc_width', 12),
        'closed': closed,
    }
    if prop(obj, 'cc_force_bridge', False):
        common['forceBridge'] = True

    entries = []
    if obj.type == 'CURVE' and obj.data.splines:
        for spline in obj.data.splines:
            local = spline_points(spline)
            if len(local) < 2:
                continue
            world = [obj.matrix_world @ p for p in local]
            entry = dict(common)
            entry['points'] = [[p.x, -p.y] for p in world]
            entry['closed'] = closed or bool(spline.use_cyclic_u)
            entries.append(entry)
        return entries

    for path in trace_mesh_path(obj):
        entry = dict(common)
        entry['points'] = path
        entries.append(entry)
    return entries


def shape_asset(obj, kind):
    wxmin, wxmax, wymin, wymax, _, _ = bounds(obj)
    minx, maxx, miny, maxy, minz, maxz = unrotated_bounds(obj)
    asset = {
        'id': prop(obj, 'cc_id', 'blend_' + obj.name),
        'type': kind,
        'name': prop(obj, 'cc_name', obj.name),
        'description': prop(obj, 'cc_description', ''),
        'x': (wxmin + wxmax) * 0.5,
        'z': -(wymin + wymax) * 0.5,
        'w': max(2.0, maxx - minx),
        'l': max(2.0, maxy - miny),
        'h': max(1.0, maxz - minz),
        'rot': euler_z(obj),
        'color': parse_color(prop(obj, 'cc_color'), 0xd9c7a8),
    }
    if kind == 'bridge':
        asset['y'] = number(obj, 'cc_y', obj.matrix_world.translation.z)
        asset['color'] = parse_color(prop(obj, 'cc_color'), 0x5b5f66)
    if obj.hide_get():
        asset['hidden'] = True
    return asset


def point_asset(obj, kind):
    loc = obj.matrix_world.translation
    asset = {
        'id': prop(obj, 'cc_id', 'blend_' + obj.name),
        'type': kind,
        'name': prop(obj, 'cc_name', obj.name),
        'description': prop(obj, 'cc_description', ''),
        'x': loc.x,
        'z': -loc.y,
    }
    if kind != 'elevation':
        asset['rot'] = number(obj, 'cc_rot', euler_z(obj))
    if kind == 'tree':
        asset['scale'] = number(obj, 'cc_scale', obj.scale.x)
        asset['color'] = parse_color(prop(obj, 'cc_color'), 0x4d8a4a)
    elif kind == 'model':
        key = prop(obj, 'cc_model_key', prop(obj, 'cc_model', None))
        if not key:
            raise RuntimeError('model object %s has no cc_model_key' % obj.name)
        asset['model'] = str(key)
        asset['y'] = number(obj, 'cc_y', loc.z)
        asset['scale'] = number(obj, 'cc_scale', obj.scale.x)
        if prop(obj, 'cc_color') is not None:
            asset['color'] = parse_color(prop(obj, 'cc_color'), 0xffffff)
    elif kind == 'elevation':
        asset['h'] = number(obj, 'cc_h', loc.z)
        asset['r'] = number(obj, 'cc_r', 25)
    if obj.hide_get():
        asset['hidden'] = True
    return asset


def info_asset(obj):
    """Restore a landmark/challenge from cc_data, or basic custom props."""
    data = json_object(prop(obj, 'cc_data'), None)
    if data is not None:
        return dict(data)
    loc = obj.matrix_world.translation
    asset = {
        'id': prop(obj, 'cc_id', 'blend_' + obj.name),
        'name': prop(obj, 'cc_name', obj.name),
        'x': loc.x,
        'z': -loc.y,
    }
    if prop(obj, 'cc_description') is not None:
        asset['description'] = prop(obj, 'cc_description')
    if prop(obj, 'cc_hidden', False):
        asset['hidden'] = True
    return asset


def main():
    scene = bpy.context.scene
    data = {
        'version': 1,
        'generated': __import__('datetime').datetime.utcnow().isoformat() + 'Z',
        'mapName': prop(scene, 'cc_map_name', scene.name),
        'roads': [],
        'landmarks': [],
        'challenges': [],
        'assets': [],
        'elevation': {'hills': [], 'points': [], 'grid': None},
    }
    trailer_text = prop(scene, 'cc_trailer_shots')
    if trailer_text is not None:
        data['trailerShots'] = json_value(trailer_text, [])
    missions_text = prop(scene, 'cc_missions')
    if missions_text is not None:
        data['missions'] = json_value(missions_text, [])
    for key, value in json_object(prop(scene, 'cc_patch_meta'), {}).items():
        if key not in DATA_KEYS:
            data[key] = value

    info_items = {'landmark': [], 'challenge': []}
    for obj in scene.objects:
        kind = kind_of(obj)
        if not kind:
            continue
        if kind == 'road':
            data['roads'].extend(road_entries(obj))
        elif kind in ('building', 'bridge'):
            data['assets'].append(shape_asset(obj, kind))
        elif kind in ('tree', 'model'):
            data['assets'].append(point_asset(obj, kind))
        elif kind == 'elevation':
            data['elevation']['points'].append(point_asset(obj, 'elevation'))
        elif kind in ('landmark', 'challenge'):
            try:
                order = int(prop(obj, 'cc_index', 0))
            except (TypeError, ValueError):
                order = 0
            info_items[kind].append((order, obj.name, obj))
    for kind, items in info_items.items():
        for _, _, obj in sorted(items, key=lambda item: (item[0], item[1])):
            data[kind + 's'].append(info_asset(obj))
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    with open(out_path, 'w') as fh:
        json.dump(data, fh, indent=2)
    print('Wrote {} roads, {} assets, {} landmarks, {} challenges, '
          '{} elevation points, {} trailer shots to {}'.format(
              len(data['roads']), len(data['assets']),
              len(data['landmarks']), len(data['challenges']),
              len(data['elevation']['points']),
              len(data.get('trailerShots') or []), out_path))


main()
