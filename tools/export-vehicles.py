"""Export the CC0 Rgsdev FBX car pack to GLB for tools/import-assets.js.

Run with Blender 3.6+:
  /Applications/Blender.app/Contents/MacOS/Blender -b \
    --python tools/export-vehicles.py -- <source-dir> <output-dir>

The FBX pack imports with image-based normal maps that are not needed for the
game's flat-shaded materials, so those nodes are dropped before export.
"""
import bpy
import os
import sys

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if len(argv) != 2:
    raise SystemExit('usage: export-vehicles.py <source-dir> <output-dir>')

src_root, dst_root = argv
mapping = {
    'Sedan/Sedan.fbx': 'vehicle_sedan.glb',
    'Hatchback/Hatchback.fbx': 'vehicle_hatchback.glb',
    'Muscle/Muscle.fbx': 'vehicle_muscle.glb',
    'Sports/Sports.fbx': 'vehicle_sports.glb',
    'Roadster/Roadster.fbx': 'vehicle_roadster.glb',
    'Pickup/Pickup.fbx': 'vehicle_pickup.glb',
    'Truck/Truck.fbx': 'vehicle_truck.glb',
    'SUV/SUV.fbx': 'vehicle_suv.glb',
    'Van/Van.fbx': 'vehicle_van.glb',
    'Police Sedan/Police Sedan.fbx': 'vehicle_police.glb',
}
os.makedirs(dst_root, exist_ok=True)

for rel, out_name in mapping.items():
    src = os.path.join(src_root, rel)
    dst = os.path.join(dst_root, out_name)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=src)
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        for node in list(mat.node_tree.nodes):
            if node.type in {'TEX_IMAGE', 'NORMAL_MAP'}:
                mat.node_tree.nodes.remove(node)
    bpy.ops.export_scene.gltf(
        filepath=dst,
        export_format='GLB',
        export_yup=True,
        export_apply=True,
        export_materials='EXPORT',
        export_image_format='NONE',
    )
    print('exported', out_name)
