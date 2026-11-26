"""Build a low-poly Coastal Cruise prop from a text prompt in Blender 3.6.

Run headless (normally through tools/blender-ai-asset.js):

  Blender -b --python tools/blender_prompt_asset.py -- job.json result.json

Blender 3.6 has no built-in text-to-3D and does not require MCP. This script is
the deterministic, offline ``bpy`` generator used by the map editor's new asset
dialog. It reads the detailed prompt, chooses a low-poly recipe, builds real
mesh objects, and exports baked geometry in the game's X/Y/Z convention.
"""
import base64
import json
import math
import os
import re
import struct
import sys

import bpy
from mathutils import Vector


argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if len(argv) < 2:
    raise SystemExit('usage: blender_prompt_asset.py <job.json> <result.json>')
job_path, out_path = argv[0], argv[1]

with open(job_path) as fh:
    job = json.load(fh)

name = str(job.get('name') or 'Generated asset')
prompt = str(job.get('prompt') or job.get('description') or name).strip()
lower = prompt.lower() + ' ' + name.lower()
key = str(job.get('key') or 'ai_generated_asset').strip() or 'ai_generated_asset'

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

COLOR_WORDS = {
    'red': 0xc13b32, 'crimson': 0xa92324, 'rust': 0x94513a,
    'orange': 0xe08a3c, 'amber': 0xe8a15c, 'yellow': 0xdfc15a,
    'green': 0x4d8a4a, 'pine': 0x3e7849, 'teal': 0x4d9d97,
    'cyan': 0x57b7c8, 'blue': 0x4b8fd6, 'navy': 0x274d72,
    'purple': 0x765b91, 'white': 0xd9d7cd, 'cream': 0xd9c7a8,
    'grey': 0x8d959c, 'gray': 0x8d959c, 'black': 0x202326,
    'brown': 0x6f5139, 'wood': 0x8a6745, 'stone': 0x9a958c,
    'sand': 0xc7b18b, 'gold': 0xd6b45a,
}

SHAPE_DEFAULTS = {
    'lighthouse': 13, 'stargate': 10, 'windmill': 11, 'boat': 6,
    'crane': 11, 'dock': 2, 'pine': 8, 'rock': 4, 'barrel': 2,
    'crate': 3, 'buoy': 3, 'sign': 4, 'building': 7,
}


def first_number(patterns, default):
    for pattern in patterns:
        match = re.search(pattern, lower)
        if match:
            try:
                value = float(match.group(1))
                if 0.2 <= value <= 200:
                    return value
            except (TypeError, ValueError):
                pass
    return default


def shape_kind():
    if any(w in lower for w in ('stargate', 'star gate', 'portal', 'ring gate')):
        return 'stargate'
    if any(w in lower for w in ('lighthouse', 'beacon', 'light house')):
        return 'lighthouse'
    if any(w in lower for w in ('windmill', 'wind mill', 'turbine')):
        return 'windmill'
    if any(w in lower for w in ('trawler', 'fishing boat', 'boat', 'ferry', 'ship', 'sailboat')):
        return 'boat'
    if 'crane' in lower or 'winch' in lower:
        return 'crane'
    if any(w in lower for w in ('pier', 'dock', 'jetty', 'boardwalk')):
        return 'dock'
    if any(w in lower for w in ('pine', 'spruce', 'fir tree', 'tree')):
        return 'pine'
    if any(w in lower for w in ('boulder', 'rock', 'stone cluster')):
        return 'rock'
    if 'barrel' in lower or 'oil drum' in lower:
        return 'barrel'
    if any(w in lower for w in ('crate', 'box', 'pallet')):
        return 'crate'
    if 'buoy' in lower:
        return 'buoy'
    if any(w in lower for w in ('signpost', 'sign post', 'signboard', 'sign')):
        return 'sign'
    return 'building'


KIND = shape_kind()
HEIGHT = first_number([
    r'(\d+(?:\.\d+)?)\s*(?:m|meter|metre|meters|metres|units?|ft|feet)\s*(?:tall|high)',
    r'(?:height|tall|high)\s*(?:of|is|=|:)?\s*(\d+(?:\.\d+)?)',
    r'(\d+(?:\.\d+)?)\s*(?:m|meter|metre|units?|ft|feet)\b',
    r'(\d+(?:\.\d+)?)\s*x\s*\d+(?:\.\d+)?\s*x\s*(\d+(?:\.\d+)?)',
], float(job.get('height') or SHAPE_DEFAULTS[KIND]))
if 'x' in lower and re.search(r'\d+\s*x\s*\d+\s*x\s*\d+', lower):
    # A W x L x H description stores height in the last number.
    dims = re.search(r'(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)', lower)
    if dims:
        HEIGHT = float(dims.group(3))
HEIGHT = max(0.8, min(60.0, HEIGHT))

WIDTH = first_number([
    r'(?:width|wide)\s*(?:of|is|=|:)?\s*(\d+(?:\.\d+)?)',
    r'(\d+(?:\.\d+)?)\s*x\s*\d+(?:\.\d+)?\s*x\s*\d+(?:\.\d+)?',
], max(2.0, HEIGHT * 0.65))
WIDTH = max(1.2, min(50.0, WIDTH))

ACCENT_HEX = None
for word, color in COLOR_WORDS.items():
    if re.search(r'\b' + re.escape(word) + r'\b', lower):
        ACCENT_HEX = color
        break
if ACCENT_HEX is None:
    ACCENT_HEX = {
        'lighthouse': 0xc13b32, 'stargate': 0x4d9d97, 'windmill': 0xd9d7cd,
        'boat': 0xe08a3c, 'crane': 0xe8a15c, 'dock': 0x8a6745,
        'pine': 0x3e7849, 'rock': 0x9a958c, 'barrel': 0x4b8fd6,
        'crate': 0x8a6745, 'buoy': 0xe08a3c, 'sign': 0xe8a15c,
        'building': 0xd9c7a8,
    }[KIND]


def rgba(color):
    return (((color >> 16) & 255) / 255.0,
            ((color >> 8) & 255) / 255.0,
            (color & 255) / 255.0, 1.0)


def material(role, color):
    mat_name = 'AI_' + re.sub(r'[^A-Za-z0-9]+', '_', role).strip('_')
    mat = bpy.data.materials.get(mat_name) or bpy.data.materials.new(mat_name)
    mat.diffuse_color = rgba(color)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = nodes.get('Principled BSDF')
    if bsdf:
        bsdf.inputs['Base Color'].default_value = rgba(color)
        bsdf.inputs['Roughness'].default_value = 0.82
    mat['cc_color'] = color
    return mat


MAT_WALL = material('wall', ACCENT_HEX)
MAT_WOOD = material('wood', 0x8a6745)
MAT_STONE = material('stone', 0x9a958c)
MAT_TRIM = material('trim', 0xd9d7cd)
MAT_DARK = material('dark', 0x202326)
MAT_GLASS = material('glass', 0x9cc8d6)
MAT_METAL = material('metal', 0x8d959c)
MAT_GLOW = material('glow', ACCENT_HEX)


def finish(obj, mat, role=None):
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    obj.name = 'AI_' + re.sub(r'[^A-Za-z0-9]+', '_', role or mat.name).strip('_')
    return obj


def box(label, center, size, mat, rotation=(0, 0, 0), role=None):
    bpy.ops.mesh.primitive_cube_add(location=center, rotation=rotation)
    obj = bpy.context.object
    obj.scale = (size[0] * 0.5, size[1] * 0.5, size[2] * 0.5)
    return finish(obj, mat, role or label)


def cyl(label, center, radius1, radius2, depth, mat, vertices=10, rotation=(0, 0, 0), role=None):
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices, radius1=radius1, radius2=radius2,
        depth=depth, location=center, rotation=rotation)
    return finish(bpy.context.object, mat, role or label)


def cone(label, center, radius, depth, mat, vertices=8, rotation=(0, 0, 0), role=None):
    return cyl(label, center, radius, 0.0, depth, mat, vertices, rotation, role)


def sphere(label, center, radius, mat, subdivisions=1, role=None):
    bpy.ops.mesh.primitive_ico_sphere_add(
        subdivisions=subdivisions, radius=radius, location=center)
    obj = bpy.context.object
    return finish(obj, mat, role or label)


def torus(label, center, major, minor, mat, rotation=(0, 0, 0), role=None):
    bpy.ops.mesh.primitive_torus_add(
        major_segments=24, minor_segments=6,
        major_radius=major, minor_radius=minor,
        location=center, rotation=rotation)
    return finish(bpy.context.object, mat, role or label)


def build_lighthouse(h, w):
    cyl('tower', (0, 0, h * 0.38), w * 0.32, w * 0.22, h * 0.76, MAT_TRIM, 12, role='wall')
    for i in range(1, 4):
        z = h * 0.18 + i * h * 0.17
        r = w * (0.30 - i * 0.024)
        cyl('band', (0, 0, z), r, r, h * 0.055, MAT_WALL, 12, role='accent')
    box('lantern', (0, 0, h * 0.82), (w * 0.48, w * 0.48, h * 0.14), MAT_GLASS, role='glass')
    box('lanternFrame', (0, 0, h * 0.82), (w * 0.54, w * 0.54, h * 0.02), MAT_DARK, role='trimdark')
    cone('roof', (0, 0, h * 0.94), w * 0.38, h * 0.12, MAT_WALL, 10, role='accent')
    sphere('lamp', (0, 0, h * 0.82), w * 0.10, MAT_GLOW, 1, role='glow')
    box('door', (0, -w * 0.25, h * 0.09), (w * 0.18, w * 0.07, h * 0.18), MAT_WOOD, role='wood')


def build_stargate(h, w):
    r = min(w, h) * 0.46
    segments = 12
    for i in range(segments):
        a = (i + 0.5) * math.pi * 2.0 / segments
        x, z = math.cos(a) * r, r + math.sin(a) * r
        box('stone', (x, 0, z), (r * 0.55, w * 0.18, w * 0.24), MAT_STONE,
            rotation=(0, -a, 0), role='stone')
    torus('ring', (0, 0, r), r * 0.82, w * 0.035, MAT_GLOW,
          rotation=(math.pi * 0.5, 0, 0), role='glow')
    box('baseLeft', (-r * 0.72, 0, h * 0.05), (w * 0.22, w * 0.32, h * 0.10), MAT_STONE, role='stone')
    box('baseRight', (r * 0.72, 0, h * 0.05), (w * 0.22, w * 0.32, h * 0.10), MAT_STONE, role='stone')
    box('plinth', (0, 0, h * 0.025), (w * 1.05, w * 0.42, h * 0.05), MAT_DARK, role='dark')


def build_windmill(h, w):
    cyl('tower', (0, 0, h * 0.45), w * 0.34, w * 0.19, h * 0.90, MAT_TRIM, 10, role='wall')
    cone('cap', (0, 0, h * 0.95), w * 0.31, h * 0.14, MAT_WALL, 10, role='accent')
    cyl('hub', (0, -w * 0.22, h * 0.78), w * 0.10, w * 0.10, w * 0.16, MAT_METAL,
        8, rotation=(math.pi * 0.5, 0, 0), role='metal')
    for i in range(4):
        a = i * math.pi * 0.5
        blade = box('blade', (math.cos(a) * w * 0.33, -w * 0.26, h * 0.78 + math.sin(a) * w * 0.33),
                    (w * 0.12, w * 0.05, h * 0.46), MAT_WOOD,
                    rotation=(0, -a, 0), role='wood')
        blade.rotation_euler[1] = -a + math.pi * 0.5
    box('door', (0, -w * 0.30, h * 0.10), (w * 0.16, w * 0.06, h * 0.20), MAT_WOOD, role='wood')


def build_boat(h, w):
    length = w * 1.8
    box('hull', (0, 0, h * 0.30), (w, length, h * 0.42), MAT_WALL, role='wall')
    cone('bow', (0, -length * 0.56, h * 0.30), w * 0.5, length * 0.32, MAT_WALL, 8,
         rotation=(math.pi * 0.5, 0, 0), role='wall')
    box('deck', (0, 0, h * 0.53), (w * 0.92, length * 0.92, h * 0.06), MAT_WOOD, role='wood')
    box('cabin', (0, length * 0.16, h * 0.72), (w * 0.62, length * 0.34, h * 0.36), MAT_TRIM, role='wall')
    box('roof', (0, length * 0.16, h * 0.93), (w * 0.72, length * 0.40, h * 0.05), MAT_WALL, role='accent')
    box('stripe', (0, 0, h * 0.47), (w * 1.01, length * 0.96, h * 0.035), MAT_GLOW, role='accent')
    cyl('mast', (0, -length * 0.12, h * 0.78), w * 0.025, w * 0.02, h * 0.58, MAT_METAL, 8, role='metal')
    cyl('stack', (w * 0.22, length * 0.28, h * 0.99), w * 0.07, w * 0.09, h * 0.24, MAT_DARK, 8, role='dark')
    for i in (-1, 1):
        box('rail', (i * w * 0.42, 0, h * 0.61), (w * 0.03, length * 0.88, h * 0.03), MAT_METAL, role='metal')


def build_crane(h, w):
    span = w * 1.5
    for sx in (-1, 1):
        for sy in (-1, 1):
            box('leg', (sx * w * 0.36, sy * w * 0.26, h * 0.34),
                (w * 0.10, w * 0.10, h * 0.68), MAT_WALL, role='accent')
    box('crossbeam', (0, 0, h * 0.70), (w * 0.95, w * 0.58, h * 0.07), MAT_METAL, role='metal')
    box('boom', (span * 0.22, 0, h * 0.83), (span, w * 0.14, h * 0.08), MAT_GLOW, role='accent')
    cyl('cable', (span * 0.62, 0, h * 0.63), w * 0.012, w * 0.012, h * 0.34, MAT_DARK, 6, role='dark')
    box('hook', (span * 0.62, 0, h * 0.45), (w * 0.10, w * 0.10, h * 0.08), MAT_METAL, role='metal')


def build_dock(h, w):
    length = w * 2.2
    box('deck', (0, 0, h * 0.72), (w, length, h * 0.28), MAT_WOOD, role='wood')
    for sy in (-0.42, 0, 0.42):
        for sx in (-0.40, 0.40):
            cyl('post', (sx * w, sy * length, h * 0.36), w * 0.055, w * 0.055, h * 0.72,
                MAT_WOOD, 8, role='wood')
    for sx in (-0.40, 0.40):
        box('rope', (sx * w, 0, h * 1.02), (w * 0.025, length * 0.92, h * 0.025), MAT_TRIM, role='trim')


def build_pine(h, w):
    cyl('trunk', (0, 0, h * 0.18), w * 0.09, w * 0.11, h * 0.36, MAT_WOOD, 8, role='wood')
    for i in range(3):
        z = h * (0.34 + i * 0.22)
        cone('leaves', (0, 0, z), w * (0.62 - i * 0.13), h * 0.36, MAT_WALL, 8,
             rotation=(0, math.pi * 0.125, 0), role='pine')


def build_rock(h, w):
    a = sphere('boulder', (0, 0, h * 0.42), h * 0.42, MAT_STONE, 1, role='stone')
    a.scale = (w * 0.55 / max(h * 0.42, 0.001), w * 0.42 / max(h * 0.42, 0.001), 1.0)
    b = sphere('chip', (w * 0.32, -w * 0.18, h * 0.20), h * 0.20, MAT_WALL, 1, role='stone')
    b.scale = (1.2, 0.9, 0.8)


def build_barrel(h, w):
    cyl('barrel', (0, 0, h * 0.5), w * 0.42, w * 0.42, h, MAT_WALL, 12, role='accent')
    for z in (h * 0.18, h * 0.50, h * 0.82):
        torus('band', (0, 0, z), w * 0.425, w * 0.025, MAT_METAL, role='metal')


def build_crate(h, w):
    box('crate', (0, 0, h * 0.5), (w, w, h), MAT_WOOD, role='wood')
    for sx in (-1, 1):
        box('slatV', (sx * w * 0.44, -w * 0.51, h * 0.5), (w * 0.07, w * 0.03, h * 0.92), MAT_TRIM, role='trim')
    for sz in (0.16, 0.84):
        box('slatH', (0, -w * 0.51, h * sz), (w * 0.96, w * 0.03, h * 0.07), MAT_TRIM, role='trim')


def build_buoy(h, w):
    sphere('float', (0, 0, h * 0.42), w * 0.42, MAT_WALL, 1, role='accent')
    cone('skirt', (0, 0, h * 0.18), w * 0.36, h * 0.30, MAT_DARK, 10,
         rotation=(math.pi, 0, 0), role='dark')
    cyl('pole', (0, 0, h * 0.76), w * 0.035, w * 0.035, h * 0.42, MAT_METAL, 8, role='metal')
    sphere('lamp', (0, 0, h * 0.98), w * 0.09, MAT_GLOW, 1, role='glow')


def build_sign(h, w):
    cyl('postLeft', (-w * 0.31, 0, h * 0.45), w * 0.035, w * 0.035, h * 0.90, MAT_WOOD, 8, role='wood')
    cyl('postRight', (w * 0.31, 0, h * 0.45), w * 0.035, w * 0.035, h * 0.90, MAT_WOOD, 8, role='wood')
    box('board', (0, 0, h * 0.74), (w, w * 0.07, h * 0.28), MAT_WALL, role='accent')
    box('stripe', (0, -w * 0.05, h * 0.58), (w * 0.94, w * 0.04, h * 0.035), MAT_GLOW, role='glow')


def build_building(h, w):
    depth = w * 0.78
    box('walls', (0, 0, h * 0.48), (w, depth, h * 0.88), MAT_WALL, role='wall')
    cone('roof', (0, 0, h * 0.99), w * 0.79, h * 0.24, MAT_WOOD, 4,
         rotation=(0, math.pi * 0.25, 0), role='roof')
    box('door', (0, -depth * 0.51, h * 0.21), (w * 0.18, w * 0.04, h * 0.42), MAT_WOOD, role='wood')
    for sx in (-0.29, 0.29):
        box('window', (sx * w, -depth * 0.51, h * 0.58),
            (w * 0.16, w * 0.04, h * 0.18), MAT_GLASS, role='glass')
        box('shutter', (sx * w, -depth * 0.54, h * 0.58),
            (w * 0.19, w * 0.03, h * 0.025), MAT_TRIM, role='trim')
    if any(word in lower for word in ('shop', 'market', 'store', 'seafood', 'stall', 'cafe')):
        box('sign', (0, -depth * 0.56, h * 0.82), (w * 0.72, w * 0.05, h * 0.14), MAT_GLOW, role='accent')
        box('awning', (0, -depth * 0.66, h * 0.56), (w * 0.94, w * 0.28, h * 0.035), MAT_WALL,
            rotation=(math.radians(12), 0, 0), role='accent')
    for sx in (-1, 1):
        box('corner', (sx * w * 0.49, -depth * 0.50, h * 0.48),
            (w * 0.035, w * 0.035, h * 0.88), MAT_TRIM, role='trim')


BUILDERS = {
    'lighthouse': build_lighthouse, 'stargate': build_stargate,
    'windmill': build_windmill, 'boat': build_boat, 'crane': build_crane,
    'dock': build_dock, 'pine': build_pine, 'rock': build_rock,
    'barrel': build_barrel, 'crate': build_crate, 'buoy': build_buoy,
    'sign': build_sign, 'building': build_building,
}
BUILDERS[KIND](HEIGHT, WIDTH)


def b64_floats(values):
    return base64.b64encode(struct.pack('<' + str(len(values)) + 'f', *values)).decode('ascii')


def b64_indices(values):
    if max(values) > 65535:
        return base64.b64encode(struct.pack('<' + str(len(values)) + 'I', *values)).decode('ascii'), 5125
    return base64.b64encode(struct.pack('<' + str(len(values)) + 'H', *values)).decode('ascii'), 5123


bpy.context.view_layer.update()
groups = {}
raw_bounds = [[float('inf')] * 3, [float('-inf')] * 3]

for obj in bpy.data.objects:
    if obj.type != 'MESH':
        continue
    mesh = obj.data
    mesh.calc_loop_triangles()
    matrix = obj.matrix_world.copy()
    normal_matrix = matrix.to_3x3().inverted().transposed()
    for tri in mesh.loop_triangles:
        mat = mesh.materials[tri.material_index] if mesh.materials else None
        color = int(mat.get('cc_color', 0xb6b9b5)) if mat else 0xb6b9b5
        role = re.sub(r'[^A-Za-z0-9]+', '', mat.name.replace('AI_', '')) if mat else 'default'
        group_key = (role, color)
        group = groups.setdefault(group_key, {'pos': [], 'norm': [], 'idx': [], 'count': 0})
        for li in tri.loops:
            p = matrix @ mesh.vertices[mesh.loops[li].vertex_index].co
            # Blender X/Y/Z -> game X/Y(height)/Z.
            pos = [float(p.x), float(p.z), float(-p.y)]
            n = normal_matrix @ mesh.loops[li].normal
            norm = [float(n.x), float(n.z), float(-n.y)]
            group['pos'].extend(pos)
            group['norm'].extend(norm)
            for axis in range(3):
                raw_bounds[0][axis] = min(raw_bounds[0][axis], pos[axis])
                raw_bounds[1][axis] = max(raw_bounds[1][axis], pos[axis])
        group['idx'].extend([group['count'], group['count'] + 1, group['count'] + 2])
        group['count'] += 3

if not groups:
    raise RuntimeError('prompt generated no mesh geometry')

raw_h = max(0.0001, raw_bounds[1][1] - raw_bounds[0][1])
scale = HEIGHT / raw_h
cx = (raw_bounds[0][0] + raw_bounds[1][0]) * 0.5
cz = (raw_bounds[0][2] + raw_bounds[1][2]) * 0.5
y0 = raw_bounds[0][1]

parts = []
bounds = [[float('inf')] * 3, [float('-inf')] * 3]
for (role, color), group in groups.items():
    pos = group['pos']
    scaled_pos = []
    for i in range(0, len(pos), 3):
        p = [(pos[i] - cx) * scale, (pos[i + 1] - y0) * scale, (pos[i + 2] - cz) * scale]
        scaled_pos.extend(p)
        for axis in range(3):
            bounds[0][axis] = min(bounds[0][axis], p[axis])
            bounds[1][axis] = max(bounds[1][axis], p[axis])
    index_b64, index_type = b64_indices(group['idx'])
    parts.append({
        'role': role,
        'color': color,
        'position': b64_floats(scaled_pos),
        'normal': b64_floats(group['norm']),
        'uv': b64_floats([0.0] * (len(group['pos']) // 3 * 2)),
        'indexType': index_type,
        'index': index_b64,
    })

record = {
    'source': prompt,
    'kind': 'generated',
    'generator': 'Blender 3.6 prompt asset',
    'parts': parts,
    'bounds': {'min': bounds[0], 'max': bounds[1]},
    'prompt': prompt,
}

asset = dict(job.get('asset') or {})
asset['type'] = 'model'
asset['model'] = key
asset.setdefault('name', name)
asset.setdefault('description', job.get('description') or '')
asset['w'] = round(bounds[1][0] - bounds[0][0], 3)
asset['l'] = round(bounds[1][2] - bounds[0][2], 3)
asset['h'] = round(bounds[1][1] - bounds[0][1], 3)
if 'prompt' not in asset:
    asset['prompt'] = prompt

result = {'models': {key: record}, 'asset': asset, 'job': job}
with open(out_path, 'w') as fh:
    json.dump(result, fh, indent=2)
print('Blender generated', key, 'from prompt:', prompt[:80])
