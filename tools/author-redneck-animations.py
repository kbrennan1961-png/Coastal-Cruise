"""Author idle/walk/run/attack/hit/death clips for the redneck GLB.

This script runs in Blender 3.6+ (headless is fine). It imports the supplied
Sketchfab GLB, keeps its 26-bone skin and textures, and adds six pose actions
that the glTF exporter turns into named animation clips.

Usage:
  Blender --background --factory-startup --python tools/author-redneck-animations.py \
    -- assets/downloaded_src/redneck_source.glb assets/downloaded_src/redneck_animated.glb
"""
import math
import os
import sys

import bpy
from mathutils import Euler


def args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    source = argv[0] if len(argv) > 0 else 'assets/downloaded_src/redneck_source.glb'
    output = argv[1] if len(argv) > 1 else 'assets/downloaded_src/redneck_animated.glb'
    return os.path.abspath(source), os.path.abspath(output)


def reset_pose(arm):
    for bone in arm.pose.bones:
        bone.rotation_mode = 'QUATERNION'
        bone.rotation_quaternion = (1.0, 0.0, 0.0, 0.0)
        bone.location = (0.0, 0.0, 0.0)
        bone.scale = (1.0, 1.0, 1.0)


def apply_pose(arm, pose):
    for name, values in pose.items():
        bone = arm.pose.bones.get(name)
        if not bone:
            raise RuntimeError('missing bone ' + name)
        rot = values.get('rot', (0.0, 0.0, 0.0))
        bone.rotation_quaternion = Euler(
            tuple(math.radians(v) for v in rot), 'XYZ').to_quaternion()
        if 'loc' in values:
            bone.location = values['loc']
        if 'scale' in values:
            bone.scale = values['scale']


def make_action(arm, name, frames):
    action = bpy.data.actions.new(name)
    arm.animation_data_create()
    arm.animation_data.action = action
    scene = bpy.context.scene
    for frame, pose in frames:
        scene.frame_set(frame)
        reset_pose(arm)
        apply_pose(arm, pose)
        for bone_name in pose:
            bone = arm.pose.bones[bone_name]
            bone.keyframe_insert(data_path='rotation_quaternion', frame=frame, group=bone_name)
            if 'loc' in pose[bone_name]:
                bone.keyframe_insert(data_path='location', frame=frame, group=bone_name)
            if 'scale' in pose[bone_name]:
                bone.keyframe_insert(data_path='scale', frame=frame, group=bone_name)
    action.name = name
    return action


def cycle(name, count, fn, step=4):
    frames = []
    for frame in range(1, count + 1, step):
        frames.append((frame, fn((frame - 1) / (count - 1) * math.pi * 2)))
    if frames[-1][0] != count:
        frames.append((count, fn(math.pi * 2)))
    return frames


def idle_frames():
    return [
        (1, {}),
        (13, {'chest_03': {'rot': (1.4, 0, 0)},
              'head_05': {'rot': (-2.2, 2.5, 0)},
              'upper_arm_l_07': {'rot': (2.5, 0, 0)},
              'forearm_l_08': {'rot': (-4, 0, 0)},
              'upper_arm_r_011': {'rot': (-2, 0, 0)}}),
        (25, {}),
        (37, {'chest_03': {'rot': (0.8, 0, 0)},
              'head_05': {'rot': (2.0, -2.5, 0)},
              'upper_arm_l_07': {'rot': (1.5, 0, 0)},
              'upper_arm_r_011': {'rot': (-3, 0, 0)},
              'forearm_r_012': {'rot': (3, 0, 0)}}),
        (49, {})
    ]


def walk_frames(run=False):
    count = 16 if run else 24
    swing = 42.0 if run else 28.0
    arm_swing = 36.0 if run else 22.0
    lean = -8.0 if run else -2.0
    bob = 0.055 if run else 0.03

    def pose(phase):
        s = math.sin(phase)
        left = swing * s
        right = -left
        return {
            'hips_00': {'rot': (0, 0, 3 * math.sin(phase * 2)),
                        'loc': (0, bob * abs(s), 0)},
            'spine_01': {'rot': (lean * 0.35, 0, 0)},
            'chest_03': {'rot': (lean * 0.65, 0, -2.5 * s)},
            'thigh_l_014': {'rot': (left, 0, 0)},
            'thigh_r_017': {'rot': (right, 0, 0)},
            'calf_l_015': {'rot': (max(0.0, -left) * 0.85, 0, 0)},
            'calf_r_018': {'rot': (max(0.0, -right) * 0.85, 0, 0)},
            'foot_l_016': {'rot': (-left * 0.18, 0, 0)},
            'foot_r_019': {'rot': (-right * 0.18, 0, 0)},
            'upper_arm_l_07': {'rot': (-arm_swing * s, 0, 0)},
            'upper_arm_r_011': {'rot': (arm_swing * s, 0, 0)},
            'forearm_l_08': {'rot': (-8 - max(0.0, s) * 14, 0, 0)},
            'forearm_r_012': {'rot': (-8 - max(0.0, -s) * 14, 0, 0)}
        }

    return cycle('Walk', count, pose, 4)


def attack_frames():
    return [
        (1, {}),
        (5, {'chest_03': {'rot': (0, 0, -12)},
             'upper_arm_r_011': {'rot': (-45, 0, -12)},
             'forearm_r_012': {'rot': (-72, 0, 0)},
             'upper_arm_l_07': {'rot': (18, 0, 8)},
             'forearm_l_08': {'rot': (-28, 0, 0)}}),
        (10, {'hips_00': {'rot': (0, 0, 8)},
              'chest_03': {'rot': (-8, 0, 14)},
              'upper_arm_r_011': {'rot': (78, 0, 6)},
              'forearm_r_012': {'rot': (6, 0, 0)},
              'upper_arm_l_07': {'rot': (14, 0, 10)},
              'forearm_l_08': {'rot': (-34, 0, 0)}}),
        (14, {'chest_03': {'rot': (-5, 0, 10)},
              'upper_arm_r_011': {'rot': (70, 0, 4)},
              'forearm_r_012': {'rot': (10, 0, 0)}}),
        (20, {'chest_03': {'rot': (0, 0, 4)},
              'upper_arm_r_011': {'rot': (22, 0, 0)},
              'forearm_r_012': {'rot': (-22, 0, 0)}}),
        (26, {})
    ]


def hit_frames():
    return [
        (1, {}),
        (4, {'hips_00': {'rot': (-6, 0, 0)},
             'chest_03': {'rot': (-16, 0, 6)},
             'head_05': {'rot': (-14, 0, -6)},
             'upper_arm_l_07': {'rot': (34, 0, 12)},
             'upper_arm_r_011': {'rot': (26, 0, -12)},
             'forearm_l_08': {'rot': (-42, 0, 0)},
             'forearm_r_012': {'rot': (-38, 0, 0)}}),
        (9, {'chest_03': {'rot': (-8, 0, 3)},
             'head_05': {'rot': (-6, 0, 0)},
             'upper_arm_l_07': {'rot': (12, 0, 0)},
             'upper_arm_r_011': {'rot': (10, 0, 0)}}),
        (16, {})
    ]


def death_frames():
    return [
        (1, {}),
        (8, {'_rootJoint': {'rot': (-24, 0, 0)},
             'chest_03': {'rot': (-8, 0, 0)},
             'upper_arm_l_07': {'rot': (45, 0, 22)},
             'upper_arm_r_011': {'rot': (40, 0, -22)},
             'thigh_l_014': {'rot': (24, 0, 0)},
             'thigh_r_017': {'rot': (-16, 0, 0)}}),
        (18, {'_rootJoint': {'rot': (-68, 0, 0), 'loc': (0, -0.18, 0)},
              'head_05': {'rot': (-14, 0, 0)},
              'upper_arm_l_07': {'rot': (72, 0, 34)},
              'upper_arm_r_011': {'rot': (66, 0, -34)},
              'thigh_l_014': {'rot': (42, 0, 0)},
              'thigh_r_017': {'rot': (24, 0, 0)},
              'calf_l_015': {'rot': (32, 0, 0)},
              'calf_r_018': {'rot': (26, 0, 0)}}),
        (30, {'_rootJoint': {'rot': (-82, 0, 0), 'loc': (0, -0.28, 0)},
              'upper_arm_l_07': {'rot': (80, 0, 40)},
              'upper_arm_r_011': {'rot': (76, 0, -40)},
              'thigh_l_014': {'rot': (48, 0, 0)},
              'thigh_r_017': {'rot': (30, 0, 0)}})
    ]


def main():
    source, output = args()
    bpy.ops.import_scene.gltf(filepath=source)
    armatures = [o for o in bpy.data.objects if o.type == 'ARMATURE']
    if not armatures:
        raise RuntimeError('GLB has no armature: ' + source)
    arm = armatures[0]
    arm.animation_data_clear()
    reset_pose(arm)

    make_action(arm, 'Idle', idle_frames())
    make_action(arm, 'Walk', walk_frames(False))
    make_action(arm, 'Run', walk_frames(True))
    make_action(arm, 'Attack', attack_frames())
    make_action(arm, 'Hit', hit_frames())
    make_action(arm, 'Death', death_frames())
    arm.animation_data.action = None
    bpy.context.scene.frame_set(1)

    bpy.ops.export_scene.gltf(
        filepath=output,
        export_format='GLB',
        export_animations=True,
        export_animation_mode='ACTIONS',
        export_frame_range=True,
        export_frame_step=1,
        export_force_sampling=True,
        export_anim_slide_to_zero=True,
        export_apply=False,
        export_yup=True,
        use_selection=False
    )
    print('wrote', output, 'clips:', [a.name for a in bpy.data.actions])


if __name__ == '__main__':
    main()
