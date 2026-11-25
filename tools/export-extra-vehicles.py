"""Export the extra CC0 vehicle packs to GLB for tools/import-assets.js.

Run with Blender 3.6+:
  /Applications/Blender.app/Contents/MacOS/Blender -b \
    --python tools/export-extra-vehicles.py -- \
    <designersoup-dir> <rgsdev-dir> <output-dir>

Rgsdev vehicles are already oriented with their noses toward -Y in Blender,
which becomes +Z in the game's glTF exports. Designersoup cars face -X, so the
whole import is parented to an empty rotated +90 degrees around Z. Their
gradient material names are renamed to the roles AssetLoader understands.
"""
import bpy
import math
import os
import sys

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if len(argv) != 3:
    raise SystemExit('usage: export-extra-vehicles.py <designersoup-dir> <rgsdev-dir> <output-dir>')

designersoup_dir, rgsdev_dir, dst_root = argv
os.makedirs(dst_root, exist_ok=True)

designersoup = {
    'Beatall.fbx': 'vehicle_beatall.glb',
    'Landyroamer.fbx': 'vehicle_landyroamer.glb',
    'Toyoyo Highlight.fbx': 'vehicle_toyoyo.glb',
    'Tristar Racer.fbx': 'vehicle_tristar.glb',
    'docLorean.fbx': 'vehicle_dlorean.glb',
}
rgsdev = {
    'Ambulance/Ambulance.fbx': 'vehicle_ambulance.glb',
    'Bus/Bus.fbx': 'vehicle_bus.glb',
    'Firetruck/Firetruck.fbx': 'vehicle_firetruck.glb',
    'Limousine/Limousine.fbx': 'vehicle_limo.glb',
    'Monster Truck/Monster Truck.fbx': 'vehicle_monster.glb',
    'Muscle 2/Muscle 2.fbx': 'vehicle_muscle2.glb',
    'Taxi/Taxi.fbx': 'vehicle_taxi.glb',
    'Truck with trailer/Truck with trailer.fbx': 'vehicle_trailertruck.glb',
}


def strip_image_nodes():
    for material in bpy.data.materials:
        if not material.use_nodes:
            continue
        for node in list(material.node_tree.nodes):
            if node.type in {'TEX_IMAGE', 'NORMAL_MAP'}:
                material.node_tree.nodes.remove(node)


def rotate_whole_scene_z(angle):
    bpy.ops.object.empty_add(type='PLAIN_AXES', location=(0, 0, 0))
    pivot = bpy.context.object
    for obj in list(bpy.context.scene.objects):
        if obj is pivot or obj.parent is not None:
            continue
        obj.parent = pivot
        obj.matrix_parent_inverse = pivot.matrix_world.inverted()
    pivot.rotation_euler.z = angle


def export(path):
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        export_yup=True,
        export_materials='EXPORT',
        export_image_format='NONE',
    )


for rel, out_name in designersoup.items():
    src = os.path.join(designersoup_dir, rel)
    if not os.path.exists(src):
        print('skip missing', src)
        continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=src)
    for material in bpy.data.materials:
        n = material.name.lower()
        if 'blackglass' in n:
            material.name = 'glass'
        elif 'emmisive' in n:
            material.name = 'head'
        elif 'flatblack' in n:
            material.name = 'trimDark'
        elif 'impgradient' in n:
            material.name = 'bodyAccent'
        elif 'basegradient' in n:
            material.name = 'body'
    strip_image_nodes()
    rotate_whole_scene_z(math.pi / 2)
    export(os.path.join(dst_root, out_name))
    print('exported', out_name)

for rel, out_name in rgsdev.items():
    src = os.path.join(rgsdev_dir, rel)
    if not os.path.exists(src):
        print('skip missing', src)
        continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=src)
    strip_image_nodes()
    export(os.path.join(dst_root, out_name))
    print('exported', out_name)
