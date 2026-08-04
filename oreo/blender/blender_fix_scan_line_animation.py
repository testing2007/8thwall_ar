import math
import bpy


# Blender script: rebuild the Oreo AR scan-line animation.
# Usage:
# 1. Open your .blend file, or import oreo_ar_01_base.glb first.
# 2. Blender > Scripting > New > paste/run this script.
# 3. Export GLB with animations enabled.
#
# This script fixes the earlier manual-keyframe issue:
# - Adds the missing left-top corner keyframe before moving to top middle.
# - Uses Rotation Y = 90 at frame 34 for the horizontal top scan line.
# - Uses scale 0.001 for hide/show, avoiding visibility keyframes.


# -----------------------------
# Adjustable package dimensions
# -----------------------------
BOX_WIDTH_X = 0.095
BOX_DEPTH_Y = 0.045
BOX_HEIGHT_Z = 0.180

FRONT_Y = -(BOX_DEPTH_Y / 2.0) - 0.0007
HALF_X = BOX_WIDTH_X / 2.0
TOP_Z = BOX_HEIGHT_Z
BOTTOM_Z = 0.0

LINE_THICKNESS_X = 0.002
LINE_THICKNESS_Y = 0.001
LINE_LENGTH_Z = 0.030

ROOT_NAME = "AR_ROOT"
COLLECTION_NAME = "10_SCAN"
MAIN_LINE_NAME = "Scan_Line"


def ensure_collection(name):
    col = bpy.data.collections.get(name)
    if col is None:
        col = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(col)
    return col


def ensure_root(name):
    root = bpy.data.objects.get(name)
    if root is None:
        root = bpy.data.objects.new(name, None)
        bpy.context.scene.collection.objects.link(root)
        root.empty_display_type = "PLAIN_AXES"
        root.empty_display_size = 0.05
    root.location = (0, 0, 0)
    root.rotation_euler = (0, 0, 0)
    root.scale = (1, 1, 1)
    return root


def remove_old_objects():
    prefixes = (MAIN_LINE_NAME, "Scan_Comet_01", "Scan_Comet_02")
    for obj in list(bpy.data.objects):
        if obj.name.startswith(prefixes):
            bpy.data.objects.remove(obj, do_unlink=True)


def make_emission_material(name, color, strength):
    mat = bpy.data.materials.get(name)
    if mat is None:
        mat = bpy.data.materials.new(name)
    mat.use_nodes = True

    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        if "Base Color" in bsdf.inputs:
            bsdf.inputs["Base Color"].default_value = color
        if "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = color
        if "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = strength
        if "Roughness" in bsdf.inputs:
            bsdf.inputs["Roughness"].default_value = 0.25
        if "Metallic" in bsdf.inputs:
            bsdf.inputs["Metallic"].default_value = 0.0
    return mat


def link_to_collection(obj, collection):
    for col in list(obj.users_collection):
        col.objects.unlink(obj)
    collection.objects.link(obj)


def create_scan_line(name, material, collection, root, scale_factor=1.0):
    bpy.ops.mesh.primitive_cube_add(size=1)
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name + "_Mesh"
    obj.dimensions = (
        LINE_THICKNESS_X * scale_factor,
        LINE_THICKNESS_Y,
        LINE_LENGTH_Z * scale_factor,
    )
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    obj.parent = root
    link_to_collection(obj, collection)
    return obj


def set_lrs_key(obj, frame, loc, rot_deg, scale):
    bpy.context.scene.frame_set(frame)
    obj.location = loc
    obj.rotation_euler = tuple(math.radians(v) for v in rot_deg)
    obj.scale = (scale, scale, scale)
    obj.keyframe_insert(data_path="location", frame=frame)
    obj.keyframe_insert(data_path="rotation_euler", frame=frame)
    obj.keyframe_insert(data_path="scale", frame=frame)


def set_linear_interpolation(obj):
    if not obj.animation_data or not obj.animation_data.action:
        return
    for fcurve in obj.animation_data.action.fcurves:
        for key in fcurve.keyframe_points:
            key.interpolation = "LINEAR"


def build_scan_animation(obj, frame_offset=0):
    # Position notes:
    # F32 is intentionally kept on the left-top corner. Without this key,
    # Blender interpolates directly from the left edge to top middle, causing
    # the jump you noticed between frames 30 and 34.
    keys = [
        # frame, location, rotation XYZ degrees, uniform scale
        (29, (-HALF_X, FRONT_Y, TOP_Z - 0.030), (0, 0, 0), 0.001),
        (30, (-HALF_X, FRONT_Y, TOP_Z - 0.030), (0, 0, 0), 1.0),
        (32, (-HALF_X, FRONT_Y, TOP_Z - 0.002), (0, 0, 0), 1.0),
        (34, (0.0000, FRONT_Y, TOP_Z - 0.002), (0, 90, 0), 1.0),
        (38, (HALF_X, FRONT_Y, TOP_Z - 0.075), (0, 0, 0), 1.0),
        (42, (0.0000, FRONT_Y, BOTTOM_Z + 0.025), (0, 90, 0), 1.0),
        (44, (0.0000, FRONT_Y, BOTTOM_Z + 0.025), (0, 90, 0), 0.001),
    ]

    for frame, loc, rot, scale in keys:
        set_lrs_key(obj, frame + frame_offset, loc, rot, scale)
    set_linear_interpolation(obj)


def main():
    scene = bpy.context.scene
    scene.frame_start = 0
    scene.frame_end = 179
    scene.render.fps = 30

    root = ensure_root(ROOT_NAME)
    scan_collection = ensure_collection(COLLECTION_NAME)
    remove_old_objects()

    mat_main = make_emission_material("MAT_Scan_White", (1, 1, 1, 1), 6.0)
    mat_tail = make_emission_material("MAT_Scan_Tail_Cyan", (0.70, 0.94, 1.0, 1), 3.0)

    main_line = create_scan_line(MAIN_LINE_NAME, mat_main, scan_collection, root, 1.0)
    build_scan_animation(main_line, frame_offset=0)

    # Optional comet tails. Delete or comment these two blocks if you only want
    # the single white scan line.
    comet_01 = create_scan_line("Scan_Comet_01", mat_tail, scan_collection, root, 0.70)
    build_scan_animation(comet_01, frame_offset=1)

    comet_02 = create_scan_line("Scan_Comet_02", mat_tail, scan_collection, root, 0.45)
    build_scan_animation(comet_02, frame_offset=2)

    scene.frame_set(30)
    print("Done: rebuilt Scan_Line animation with F32 left-top key and F34 Rotation Y = 90.")


main()
