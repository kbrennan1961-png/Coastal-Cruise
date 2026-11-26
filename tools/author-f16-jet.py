#!/usr/bin/env python3
"""
Author a low-poly PSX-style Israeli F-16C Barak / F-16I Sufa fighter jet.
Run with Blender 3.6+:
  blender --background --factory-startup --python tools/author-f16-jet.py -- output.glb
"""
import bpy
import math
import os
import sys
from mathutils import Vector

# ---------------------------------------------------------------------------
# Args
# ---------------------------------------------------------------------------
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else os.path.join(os.path.dirname(__file__), '..', 'assets', 'downloaded_src', 'f16_barak.glb')
OUT = os.path.abspath(OUT)
os.makedirs(os.path.dirname(OUT), exist_ok=True)

# ---------------------------------------------------------------------------
# Reset scene
# ---------------------------------------------------------------------------
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for d in list(bpy.data.meshes):
    bpy.data.meshes.remove(d)
for m in list(bpy.data.materials):
    bpy.data.materials.remove(m)

# ---------------------------------------------------------------------------
# Palette - desert camo, PSX flat shading
# ---------------------------------------------------------------------------
def mat(name, rgb, rough=0.9):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (rgb[0], rgb[1], rgb[2], 1.0)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    if bsdf:
        bsdf.inputs['Base Color'].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
        bsdf.inputs['Roughness'].default_value = rough
        bsdf.inputs['Metallic'].default_value = 0.05
    return m

TAN      = mat('DesertTan',      (0.72, 0.63, 0.44))
SAND     = mat('Sand',           (0.83, 0.76, 0.57))
OLIVE    = mat('OliveDrab',      (0.36, 0.39, 0.27))
DARK     = mat('PanelDark',      (0.22, 0.22, 0.20))
CANOPY   = mat('Canopy',         (0.14, 0.22, 0.28))
METAL    = mat('Metal',          (0.45, 0.46, 0.48))
BURNER   = mat('Afterburner',    (0.95, 0.55, 0.18))
BLUE     = mat('StarOfDavidBlue',(0.10, 0.22, 0.60))
WHITE    = mat('StarOfDavidWhite',(0.92, 0.93, 0.94))
INTAKE   = mat('IntakeDark',     (0.16, 0.16, 0.17))
RAIL     = mat('MissileRail',    (0.30, 0.30, 0.28))

# ---------------------------------------------------------------------------
# Mesh helpers - all flat-shaded, minimal polygons
# ---------------------------------------------------------------------------
def mesh_obj(name, verts, faces, material, parent=None):
    me = bpy.data.meshes.new(name + 'Mesh')
    me.from_pydata(verts, [], faces)
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    ob.data.materials.append(material)
    if parent:
        ob.parent = parent
    # Flat shading for the PSX faceted look.
    for poly in ob.data.polygons:
        poly.use_smooth = False
    return ob

def box(name, size, loc, material, parent=None, rot=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    ob = bpy.context.object
    ob.name = name
    ob.scale = size
    if rot:
        ob.rotation_euler = rot
    ob.data.materials.append(material)
    for poly in ob.data.polygons:
        poly.use_smooth = False
    if parent:
        ob.parent = parent
    return ob

def hex_prism(name, radius, length, loc, material, axis='Y', parent=None, sides=8, taper=1.0):
    """Low-sided prism for fuselage / nozzle."""
    verts = []
    r2 = radius * taper
    for i in range(sides):
        a = i * 2 * math.pi / sides
        c, s = math.cos(a), math.sin(a)
        if axis == 'Y':
            verts.append((c * radius, -length / 2, s * radius))
            verts.append((c * r2, length / 2, s * r2))
        elif axis == 'Z':
            verts.append((c * radius, s * radius, -length / 2))
            verts.append((c * r2, s * r2, length / 2))
        else:  # X
            verts.append((-length / 2, c * radius, s * radius))
            verts.append((length / 2, c * r2, s * r2))
    faces = []
    for i in range(sides):
        j = (i + 1) % sides
        faces.append((i * 2, j * 2, j * 2 + 1, i * 2 + 1))
    faces.append(tuple(i * 2 for i in reversed(range(sides))))
    faces.append(tuple(i * 2 + 1 for i in range(sides)))
    ob = mesh_obj(name, verts, faces, material, parent)
    ob.location = loc
    return ob

def tapered_wing(name, root_lead, root_trail, tip_lead, tip_trail,
                 root_span, tip_span, thickness, material, parent=None,
                 y=0.0, side=1):
    """Angular swept wing with sharp leading/trailing edges."""
    # Coordinates: X = span, Y = up, Z = length (nose +Z, tail -Z)
    xr = root_span * side
    xt = tip_span * side
    v = [
        (0, y, root_lead),
        (0, y, root_trail),
        (xr, y, root_trail - (root_trail - tip_trail) * 0.15),
        (xt, y, tip_trail),
        (xt, y, tip_lead),
        (xr, y, root_lead - (root_lead - tip_lead) * 0.15),
    ]
    top = [tuple(p) for p in v]
    bot = [(p[0], p[1] - thickness, p[2]) for p in v]
    verts = top + bot
    faces = [
        (0, 1, 2, 3, 4, 5),
        tuple(range(11, 5, -1)),
    ]
    for i in range(6):
        j = (i + 1) % 6
        faces.append((i, j, j + 6, i + 6))
    ob = mesh_obj(name, verts, faces, material, parent)
    return ob

# ---------------------------------------------------------------------------
# Root group
# ---------------------------------------------------------------------------
root = bpy.data.objects.new('F16_Barak', None)
bpy.context.collection.objects.link(root)

FRONT = 6.0   # nose direction (+Z)
BACK  = -5.5

# Fuselage: faceted 8-sided tapered body
fus = hex_prism('Fuselage', 0.62, 10.5, (0, 0, 0.25), TAN, axis='Z', sides=8, taper=0.62, parent=root)
# Nose cone - sharp pointed tip
nose_verts = [
    (0, 0, FRONT + 1.6),
    (-0.38, -0.30, FRONT - 0.5),
    (0.38, -0.30, FRONT - 0.5),
    (0.38, 0.30, FRONT - 0.5),
    (-0.38, 0.30, FRONT - 0.5),
    (0, 0, FRONT - 0.5),  # underside point
]
nose_faces = [
    (0, 1, 2), (0, 2, 3), (0, 3, 4), (0, 4, 1),
    (1, 5, 2), (2, 5, 3), (3, 5, 4), (4, 5, 1),
]
nose = mesh_obj('Nose', nose_verts, nose_faces, SAND, root)

# Dorsal spine
box('DorsalSpine', (0.30, 0.22, 6.5), (0, 0.62, -0.5), OLIVE, root)
# Ventral intake (single, under belly)
intake = box('VentralIntake', (0.85, 0.48, 2.6), (0, -0.78, 0.4), INTAKE, root)
# Intake lip
box('IntakeLip', (0.95, 0.12, 0.35), (0, -0.80, 1.55), DARK, root)

# Bubble canopy - faceted teardrop using low-sided prism
canopy_verts = []
sides = 8
for i in range(sides):
    a = i * 2 * math.pi / sides
    canopy_verts.append((math.cos(a) * 0.42, 0.62 + math.sin(a) * 0.38, 1.7))
for i in range(sides):
    a = i * 2 * math.pi / sides
    canopy_verts.append((math.cos(a) * 0.30, 0.45 + math.sin(a) * 0.26, 3.9))
canopy_faces = []
for i in range(sides):
    j = (i + 1) % sides
    canopy_faces.append((i, j, sides + j, sides + i))
canopy_faces.append(tuple(range(sides - 1, -1, -1)))
canopy_faces.append(tuple(range(sides, sides * 2)))
canopy = mesh_obj('BubbleCanopy', canopy_verts, canopy_faces, CANOPY, root)

# Wings - swept trapezoids, twin vertical stabilizers (Sufa style)
for side, sname in [(-1, 'L'), (1, 'R')]:
    wing = tapered_wing('MainWing' + sname, 2.0, -3.0, -0.8, -2.2,
                        0.6, 4.8, 0.18, SAND, root, y=0.05, side=side)
    # Horizontal stabilizer
    stab = tapered_wing('HorizontalStab' + sname, -2.6, -4.8, -3.6, -5.2,
                        0.5, 2.6, 0.14, OLIVE, root, y=0.0, side=side)
    # Wingtip missile rail
    tip_x = 4.8 * side
    rail = box('WingtipRail' + sname, (0.16, 0.12, 1.4),
               (tip_x, 0.20, -1.5), RAIL, root)
    # Small missile on rail
    box('WingtipMissile' + sname, (0.10, 0.10, 1.0),
        (tip_x, 0.30, -1.5), METAL, root)
    # Twin canted vertical stabilizers (F-16I Sufa)
    vs = box('VerticalStab' + sname, (0.14, 1.9, 1.6),
             (1.5 * side, 1.25, -4.0), OLIVE, root)
    vs.rotation_euler = (math.radians(-8), 0, side * math.radians(20))

# Afterburner nozzle at tail
nozzle = hex_prism('AfterburnerNozzle', 0.52, 1.2, (0, 0, BACK - 0.1),
                   METAL, axis='Z', sides=8, taper=0.85, parent=root)
box('AfterburnerGlow', (0.55, 0.55, 0.08), (0, 0, BACK - 0.75), BURNER, root)

# Panel line accents - darker strips
box('PanelLine1', (0.03, 0.02, 2.2), (-0.30, 0.62, 1.0), DARK, root)
box('PanelLine2', (0.03, 0.02, 2.2), (0.30, 0.62, 1.0), DARK, root)

# ---------------------------------------------------------------------------
# Star of David roundels - blue/white on wings and tail
# ---------------------------------------------------------------------------
def star_roundel(name, center, size, normal='Y', parent=None):
    """Simple six-pointed star made from two overlapping triangles + disc."""
    g = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(g)
    g.parent = parent
    g.location = center
    if normal == 'Y':
        g.rotation_euler = (0, 0, 0)
    elif normal == '-Y':
        g.rotation_euler = (math.pi, 0, 0)
    elif normal == 'X':
        g.rotation_euler = (0, math.pi / 2, 0)
    elif normal == '-X':
        g.rotation_euler = (0, -math.pi / 2, 0)
    # Blue disc background
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=size, depth=0.02, location=(0, 0, 0))
    disc = bpy.context.object
    disc.name = name + '_Disc'
    disc.parent = g
    disc.data.materials.append(BLUE)
    disc.rotation_euler = (math.pi / 2, 0, 0)
    # Two white triangles (Star of David)
    for tri_i, rot in enumerate([0, math.pi / 3]):
        pts = []
        r = size * 0.85
        for k in range(3):
            a = rot + k * 2 * math.pi / 3 - math.pi / 2
            pts.append((math.cos(a) * r, math.sin(a) * r, 0.03))
        verts = pts
        faces = [(0, 1, 2)]
        m = mesh_obj(name + '_Star' + str(tri_i), verts, faces, WHITE, g)
    return g

# Upper & lower wings
star_roundel('RoundelWingL_Top', (-2.4, 0.16, -0.6), 0.42, 'Y', root)
star_roundel('RoundelWingR_Top', (2.4, 0.16, -0.6), 0.42, 'Y', root)
star_roundel('RoundelWingL_Bot', (-2.4, -0.14, -0.6), 0.42, '-Y', root)
star_roundel('RoundelWingR_Bot', (2.4, -0.14, -0.6), 0.42, '-Y', root)
# Rear fuselage sides
star_roundel('RoundelTailL', (-0.63, 0.0, -3.2), 0.32, '-X', root)
star_roundel('RoundelTailR', (0.63, 0.0, -3.2), 0.32, 'X', root)

# ---------------------------------------------------------------------------
# Bounds / origin: center model on ground
# ---------------------------------------------------------------------------
bpy.context.view_layer.update()
all_verts = []
for ob in root.children_recursive:
    if ob.type == 'MESH':
        for v in ob.data.vertices:
            all_verts.append(ob.matrix_world @ v.co)
if all_verts:
    min_y = min(v.y for v in all_verts)
    for ob in root.children:
        ob.location.y -= min_y

# ---------------------------------------------------------------------------
# Export GLB. Axis fix-up (Y/Z swap) is applied by the baker, not here, so the
# authored geometry stays simple and existing child rotations remain intact.
# ---------------------------------------------------------------------------
bpy.ops.object.select_all(action='DESELECT')
root.select_set(True)
for ch in root.children_recursive:
    ch.select_set(True)
bpy.context.view_layer.objects.active = root
bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format='GLB',
    use_selection=True,
    export_apply=True,
    export_materials='EXPORT',
    export_yup=True,
)
print('F16 jet exported to', OUT)
