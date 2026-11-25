"""Export the CC0 Bus_stop shelter/sign from Elbolilloduro's Bus_stop pack.

Run with Blender 3.6+:
  /Applications/Blender.app/Contents/MacOS/Blender -b \
    --python tools/export-bus-stop.py -- <busstop-dir> <output-dir> [--inspect]

The source FBX is a whole diorama (roads, houses, trees and a bus). Only the
shelter, its concrete pad and the "bus stop" sign are kept, recentred on the
pad and placed on the ground, so the game can reuse it as a roadside prop.
"""
import bpy
import os
import sys
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if len(argv) not in (2, 3):
    raise SystemExit('usage: export-bus-stop.py <busstop-dir> <output-dir> [--inspect]')

src_root, dst_root = argv[0], argv[1]
inspect_only = len(argv) == 3 and argv[2] == '--inspect'
os.makedirs(dst_root, exist_ok=True)

source = os.path.join(src_root, 'Models', 'Stops', 'Stop_01.fbx')
if not os.path.exists(source):
    raise SystemExit('missing ' + source)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=source, use_image_search=True)

keep = {'Bus_stop.001', 'Bus_stop_sign', 'Concrete'}
for obj in list(bpy.context.scene.objects):
    if obj.type == 'MESH' and obj.name in keep:
        continue
    bpy.data.objects.remove(obj, do_unlink=True)

meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
if not meshes:
    raise SystemExit('Bus_stop shelter meshes were not found')

# The FBX keeps texture paths outside the archive, so the importer does not
# always link them. Bind the known CC0 textures explicitly to keep the GLB
# self-contained when tools/import-assets.js bakes it into GeneratedAssets.js.
texture_files = {
    'Concrete': 'Concrete.png',
    'Bus_stop': 'Bus_stop.png',
    'Bus_stop_sign': 'Bus_stop_sign.png',
    'Glass.001': 'Glass.png'
}
texture_dir = os.path.join(src_root, 'Texture')
for material in bpy.data.materials:
    filename = texture_files.get(material.name)
    if not filename or not material.use_nodes:
        continue
    image_path = os.path.join(texture_dir, filename)
    if not os.path.exists(image_path):
        continue
    image = bpy.data.images.load(image_path, check_existing=True)
    shader = next((n for n in material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if not shader:
        continue
    tex_node = next((n for n in material.node_tree.nodes if n.type == 'TEX_IMAGE'), None)
    if not tex_node:
        tex_node = material.node_tree.nodes.new('ShaderNodeTexImage')
    tex_node.image = image
    material.node_tree.links.new(tex_node.outputs['Color'], shader.inputs['Base Color'])

points = []
for obj in meshes:
    for corner in obj.bound_box:
        points.append(obj.matrix_world @ Vector(corner))
lo = [min(p[i] for p in points) for i in range(3)]
hi = [max(p[i] for p in points) for i in range(3)]
print('shelter bounds', [round(v, 3) for v in lo], [round(v, 3) for v in hi])
for obj in meshes:
    mats = [s.material.name if s.material else 'None' for s in obj.material_slots]
    print('kept', obj.name, mats[:5])

if inspect_only:
    raise SystemExit(0)

# Recentre on the pad and drop the pad base to y=0 in Blender (glTF ground).
cx = (lo[0] + hi[0]) * 0.5
cy = (lo[1] + hi[1]) * 0.5
offset = Matrix.Translation(Vector((-cx, -cy, -lo[2])))
for obj in meshes:
    obj.matrix_world = offset @ obj.matrix_world

bpy.ops.export_scene.gltf(
    filepath=os.path.join(dst_root, 'bus_stop.glb'),
    export_format='GLB',
    export_yup=True,
    export_materials='EXPORT',
    export_image_format='AUTO',
)
print('exported bus_stop.glb')
