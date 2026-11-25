"""Isolate the six mobile homes from the CC0 Trailer Park FBX scene.

The archive ships one large FBX containing the whole park: terrain, fences,
props and six furnished homes. This script relinks the broken Windows texture
paths to the extracted 256px texture folder, keeps only each home's exterior
shell and a few attached fixtures, and exports one GLB per home for
tools/import-assets.js.

Usage:
  Blender -b --python tools/export-trailer-park.py -- <scene.fbx> <textures> <out-dir>
"""
import bpy
import os
import sys

args = sys.argv[sys.argv.index('--') + 1:]
if len(args) != 3:
    raise SystemExit('usage: export-trailer-park.py <scene.fbx> <textures> <out-dir>')
src, texdir, outdir = args

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=src)

# FBX stores absolute Windows paths. Relink every image to the extracted set.
files = {}
for name in os.listdir(texdir):
    files.setdefault(name.lower(), os.path.join(texdir, name))
for im in bpy.data.images:
    if im.source != 'FILE':
        continue
    base = os.path.basename(im.filepath.replace('\\', '/'))
    path = files.get(base.lower())
    if not path:
        path = files.get((base.split('.')[0] + os.path.splitext(base)[1]).lower())
    if path:
        im.filepath = path
        im.reload()
    if im.has_data and max(im.size) > 256:
        im.scale(256, 256)

# Exterior parts worth keeping around each home. Everything else is furniture,
# terrain, fencing or utility props and would bloat the baked geometry.
keep = ('Home', 'air-conditioning', 'Antenna', 'railing', 'RoofingPlates',
        'FabricPlain', 'spotlight', 'Lamp_01', 'lamppost_01', 'Covered', 'Covered1')
exclude = ('Terrain', 'Background', 'Trees', 'Fence.', 'cable', 'Cables',
           'Electric_pole', 'Bed', 'Book', 'Chair', 'Couch', 'Table', 'TV',
           'Stove', 'Refrigerator')

os.makedirs(outdir, exist_ok=True)
roots = [o for o in bpy.data.objects
         if o.name in ('Home', 'Home_01', 'Home_02', 'Home_03', 'Home_04', 'Home_05')]
for root in roots:
    bpy.ops.object.select_all(action='DESELECT')
    rx, ry = root.location.x, root.location.y
    chosen = []
    for obj in bpy.data.objects:
        if obj.type != 'MESH':
            continue
        name = obj.name
        if name == root.name:
            ok = True
        elif name.startswith(root.name + '.') and name != 'Home.001':
            ok = True
        elif any(name.startswith(prefix) for prefix in keep):
            ok = abs(obj.location.x - rx) < 8.5 and abs(obj.location.y - ry) < 9.5
        else:
            ok = False
        if any(name.startswith(prefix) for prefix in exclude):
            ok = False
        if ok:
            obj.select_set(True)
            chosen.append(obj)
    bpy.context.view_layer.objects.active = root
    out = os.path.join(outdir, root.name.lower().replace('_', '') + '.glb')
    bpy.ops.export_scene.gltf(
        filepath=out, export_format='GLB', export_yup=True, export_apply=True,
        use_selection=True, export_image_format='AUTO', export_materials='EXPORT')
    materials = set()
    for obj in chosen:
        for mat in obj.data.materials:
            if mat:
                materials.add(mat.name)
    print('EXPORT', os.path.basename(out), 'objects', len(chosen),
          'materials', len(materials), sorted(materials))
