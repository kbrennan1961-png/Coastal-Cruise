"""Headless DFF + TXD -> GLB conversion for the map editor's asset importer.

Usage:
  blender -b --python tools/blender_gta_convert.py -- \
    --addon-dir tools/vendor --dff input.dff [--txd input.txd] \
    --out output.glb --height 4 --name asset-key

DragonFF is vendored in tools/vendor/DragonFF so this runs offline. The script
centres the imported geometry on X/Y, puts its lowest point on the ground, and
optionally scales it to a target height before exporting a Y-up GLB with
embedded PNG textures.
"""
import argparse
import json
import os
import sys

import bpy
from mathutils import Matrix


def parse_args():
    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1:]
    else:
        argv = []
    p = argparse.ArgumentParser()
    p.add_argument("--addon-dir", required=True)
    p.add_argument("--dff", required=True)
    p.add_argument("--txd", default="")
    p.add_argument("--out", required=True)
    p.add_argument("--height", type=float, default=0)
    p.add_argument("--name", default="")
    return p.parse_args(argv)


def bake_world_vertices():
    """Flatten every mesh into world space and clear transforms/parenting."""
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    for obj in meshes:
        world = obj.matrix_world.copy()
        obj.parent = None
        obj.matrix_world = Matrix.Identity(4)
        for vertex in obj.data.vertices:
            vertex.co = world @ vertex.co
        obj.location = (0, 0, 0)
        obj.rotation_euler = (0, 0, 0)
        obj.scale = (1, 1, 1)
    return meshes


def normalize(meshes, target_height):
    points = [v.co for obj in meshes for v in obj.data.vertices]
    if not points:
        raise RuntimeError("DFF contained no mesh vertices")

    mins = [min(p[i] for p in points) for i in range(3)]
    maxs = [max(p[i] for p in points) for i in range(3)]
    cx = (mins[0] + maxs[0]) * 0.5
    cy = (mins[1] + maxs[1]) * 0.5
    z0 = mins[2]
    height = max(1e-5, maxs[2] - mins[2])
    scale = target_height / height if target_height > 0 else 1.0

    for obj in meshes:
        for vertex in obj.data.vertices:
            vertex.co.x = (vertex.co.x - cx) * scale
            vertex.co.y = (vertex.co.y - cy) * scale
            vertex.co.z = (vertex.co.z - z0) * scale
        obj.data.update()

    # glTF is Y-up: Blender (x, y, z) becomes glTF (x, z, -y).
    bounds = {
        "min": [(mins[0] - cx) * scale, 0, -(maxs[1] - cy) * scale],
        "max": [(maxs[0] - cx) * scale, height * scale, -(mins[1] - cy) * scale]
    }
    return bounds


def main():
    args = parse_args()
    sys.path.insert(0, os.path.abspath(args.addon_dir))
    bpy.ops.preferences.addon_enable(module="DragonFF")

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

    dff = os.path.abspath(args.dff)
    src_dir = os.path.dirname(dff)
    files = [{"name": os.path.basename(dff)}]
    if args.txd and os.path.isfile(args.txd):
        files.append({"name": os.path.basename(args.txd)})
    bpy.ops.import_scene.dff(
        filepath=dff,
        directory=src_dir,
        files=files,
        txd_skip_mipmaps=True,
        txd_pack=True,
        txd_apply_to_objects=True
    )

    meshes = bake_world_vertices()
    if not meshes:
        raise RuntimeError("DragonFF imported no mesh objects")
    bounds = normalize(meshes, args.height)

    for obj in list(bpy.context.scene.objects):
        if obj.type != "MESH":
            bpy.data.objects.remove(obj, do_unlink=True)

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=os.path.abspath(args.out),
        export_format="GLB",
        export_image_format="AUTO",
        export_yup=True,
        export_apply=True,
        export_cameras=False,
        export_lights=False,
        export_extras=True
    )

    sidecar = {
        "name": args.name or os.path.splitext(os.path.basename(dff))[0],
        "bounds": bounds,
        "meshes": len(meshes),
        "textures": sorted({
            image.name for image in bpy.data.images
            if image.source == "FILE" or image.packed_file
        })
    }
    with open(args.out + ".json", "w", encoding="utf-8") as handle:
        json.dump(sidecar, handle, indent=2)
    print("GTA_ASSET_OK", args.out, bounds)


if __name__ == "__main__":
    main()
