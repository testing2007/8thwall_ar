"""OREO AR — transparent box static poses and rightward move.

Build version: 2026-08-02-transparent-box-static-poses-v11

Run this patch only after the v8 base scene has been built and the user's
Front_Cover_Mesh UV correction has been saved.

Physical shot specification (metres)
------------------------------------
Coordinate system: X left/right, Y front/back, Z up; front camera faces -Y.

F83 start pose:
    OREO_MOVE_TransparentBox_Rig.location = (0, 0, 0)
    The complete 12-edge transparent box overlaps the original package area.

F98 end pose:
    OREO_MOVE_TransparentBox_Rig.location = (0.099, 0, 0)
    The whole transparent box is to the right of the original package.

One new transform channel only:
    OREO_MOVE_TransparentBox_Rig.location.x

The existing Front_Wire_Edge_* objects retain their F60-F82 local Y/scale
assembly keys and become children of the moving rig. No transparent face is
added yet because it would be visible before F82 and alter the approved wire
assembly shot. No information graphics or print animation are created in this
approval build.
"""

import bpy
from mathutils import Vector


BUILD_VERSION = "2026-08-02-transparent-box-static-poses-v11"

PREFIX = "OREO_MOVE_"
WIRE_PREFIX = "Front_Wire_Edge_"
WRONG_PREFIXES = ("OREO_INFO_", "OREO_PRINT_")

PRODUCT_COLLECTION = "20_PRODUCT"
HELPERS_COLLECTION = "90_HELPERS"

FRAME_START = 83
FRAME_END = 98
FRAME_HOLD = 150

BOX_W = 0.095
BOX_D = 0.046
BOX_H = 0.180
TARGET_X = 0.099
EPSILON = 1.0e-7


def ensure_collection(name):
    collection = bpy.data.collections.get(name)
    if collection is None:
        collection = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(collection)
    return collection


def link_only(obj, collection):
    for old_collection in list(obj.users_collection):
        old_collection.objects.unlink(obj)
    collection.objects.link(obj)


def preserve_world_unparent(obj):
    world = obj.matrix_world.copy()
    obj.parent = None
    obj.matrix_world = world


def clear_only_this_patch():
    """Make reruns safe without touching v8 product meshes or user UV edits."""
    # On a rerun, release the approved v8 wires before deleting our old rig.
    for obj in list(bpy.data.objects):
        if obj.name.startswith(WIRE_PREFIX) and obj.parent is not None:
            if obj.parent.name.startswith(PREFIX):
                preserve_world_unparent(obj)

    for obj in list(bpy.data.objects):
        if obj.name.startswith(PREFIX):
            bpy.data.objects.remove(obj, do_unlink=True)

    # Remove only the two known-wrong auto-generated information patches.
    for obj in list(bpy.data.objects):
        if obj.name.startswith(WRONG_PREFIXES):
            bpy.data.objects.remove(obj, do_unlink=True)


def inspect_existing_scene():
    """Read and validate the current adjusted scene before any v11 mutation."""
    failures = []
    front = bpy.data.objects.get("Front_Cover_Mesh")
    outer_rig = bpy.data.objects.get("Front_Extracted_Cover")
    wires = sorted(
        (obj for obj in bpy.data.objects if obj.name.startswith(WIRE_PREFIX)),
        key=lambda obj: obj.name,
    )

    if front is None:
        failures.append("Front_Cover_Mesh is missing")
    elif not getattr(front.data, "uv_layers", None) or len(front.data.uv_layers) == 0:
        failures.append("Front_Cover_Mesh has no UV map; save the corrected UV first")

    if outer_rig is None:
        failures.append("Front_Extracted_Cover is missing")
    if len(wires) != 12:
        failures.append("expected exactly 12 Front_Wire_Edge_* objects, got {}".format(len(wires)))

    scene = bpy.context.scene
    old_frame = scene.frame_current
    scene.frame_set(82)
    for wire in wires:
        if wire.parent is not None and not wire.parent.name.startswith(PREFIX):
            failures.append(wire.name + " has unexpected parent " + wire.parent.name)
        if wire.name.startswith(WIRE_PREFIX + "Front_"):
            if abs(wire.location.y + 0.023) > EPSILON:
                failures.append(wire.name + " is not at final front Y=-0.023 on F82")
        elif wire.name.startswith(WIRE_PREFIX + "Back_"):
            if abs(wire.location.y - 0.023) > EPSILON:
                failures.append(wire.name + " is not at final back Y=+0.023 on F82")
        elif wire.name.startswith(WIRE_PREFIX + "Depth_"):
            if abs(wire.location.y) > EPSILON or abs(wire.scale.y - 1.0) > EPSILON:
                failures.append(wire.name + " does not span the complete depth on F82")
        else:
            failures.append("unexpected wire name: " + wire.name)
    scene.frame_set(old_frame)

    if failures:
        raise RuntimeError("v11 pre-inspection failed: " + "; ".join(failures))

    print("PRE-INSPECTION OK")
    print("  Front_Cover_Mesh UV layers:", len(front.data.uv_layers))
    print("  Existing transparent-box wires:", len(wires))
    print("  Preserving materials, image paths and existing wire actions")
    return wires


def make_rig(collection):
    rig = bpy.data.objects.new(PREFIX + "TransparentBox_Rig", None)
    rig.empty_display_type = 'CUBE'
    rig.empty_display_size = 0.025
    link_only(rig, collection)
    rig.parent = None
    rig.location = (0.0, 0.0, 0.0)
    rig.rotation_mode = 'XYZ'
    rig.rotation_euler = (0.0, 0.0, 0.0)
    rig.scale = (1.0, 1.0, 1.0)
    rig.lock_location = (False, True, True)
    rig.lock_rotation = (True, True, True)
    rig.lock_scale = (True, True, True)
    return rig


def parent_existing_wires(wires, rig, product_collection):
    # Rig is identity at this point, so existing local animation values remain
    # unchanged and their world transforms are identical on F0-F82.
    for wire in wires:
        world = wire.matrix_world.copy()
        # The wire box is a physical product part, so keep it in 20_PRODUCT.
        link_only(wire, product_collection)
        wire.parent = rig
        wire.matrix_parent_inverse.identity()
        wire.matrix_world = world


def look_at(obj, target):
    obj.rotation_euler = (
        Vector(target) - obj.location
    ).to_track_quat('-Z', 'Y').to_euler()


def make_validation_cameras(collection):
    """Provide the four required inspection views without changing scene camera."""
    target = (TARGET_X / 2.0, 0.0, BOX_H / 2.0)
    positions = (
        ("Validation_Front", (TARGET_X / 2.0, -0.50, 0.11)),
        ("Validation_Right", (0.56, 0.0, 0.11)),
        ("Validation_Top", (TARGET_X / 2.0, 0.0, 0.56)),
        ("Validation_ThreeQuarter", (0.40, -0.40, 0.22)),
    )
    cameras = []
    for suffix, position in positions:
        data = bpy.data.cameras.new(PREFIX + suffix + "_Data")
        data.lens = 55
        camera = bpy.data.objects.new(PREFIX + suffix, data)
        link_only(camera, collection)
        camera.location = position
        look_at(camera, target)
        cameras.append(camera)
    return cameras


def key_rightward_move(rig):
    rig.animation_data_clear()
    for frame, x_value in (
        (0, 0.0),
        (FRAME_START, 0.0),
        (FRAME_END, TARGET_X),
        (FRAME_HOLD, TARGET_X),
    ):
        rig.location = (x_value, 0.0, 0.0)
        rig.keyframe_insert(data_path="location", index=0, frame=frame)


def iter_object_fcurves(obj):
    animation = obj.animation_data
    action = animation.action if animation else None
    if action is None:
        return
    curves = getattr(action, "fcurves", None)
    if curves is not None:
        yield from curves
        return
    slot = getattr(animation, "action_slot", None)
    for layer in getattr(action, "layers", ()):
        for strip in getattr(layer, "strips", ()):
            channelbag = None
            if slot is not None and hasattr(strip, "channelbag"):
                try:
                    channelbag = strip.channelbag(slot)
                except (RuntimeError, TypeError):
                    channelbag = None
            if channelbag is not None:
                yield from getattr(channelbag, "fcurves", ())


def validate_static_poses(rig, wires):
    failures = []
    if rig.parent is not None:
        failures.append("TransparentBox_Rig must have no parent")
    if any(abs(value) > EPSILON for value in rig.rotation_euler):
        failures.append("TransparentBox_Rig rotation must stay zero")
    if any(abs(value - 1.0) > EPSILON for value in rig.scale):
        failures.append("TransparentBox_Rig scale must stay one")

    paths = {(curve.data_path, curve.array_index)
             for curve in iter_object_fcurves(rig)}
    if paths and paths != {("location", 0)}:
        failures.append("rig may animate location.x only; got " + repr(paths))

    if len(rig.children) != 12:
        failures.append("rig must have exactly 12 wire children; got {}".format(len(rig.children)))
    for wire in wires:
        if wire.parent is not rig:
            failures.append(wire.name + " is not parented to TransparentBox_Rig")

    scene = bpy.context.scene
    scene.frame_set(FRAME_START)
    if any(abs(value) > EPSILON for value in rig.location):
        failures.append("F83 rig pose must be (0, 0, 0)")
    start_world_x = [wire.matrix_world.translation.x for wire in wires]

    scene.frame_set(FRAME_END)
    if abs(rig.location.x - TARGET_X) > EPSILON:
        failures.append("F98 rig X must be {:.3f}".format(TARGET_X))
    if abs(rig.location.y) > EPSILON or abs(rig.location.z) > EPSILON:
        failures.append("rig Y/Z must stay zero")
    end_world_x = [wire.matrix_world.translation.x for wire in wires]
    for wire, start_x, end_x in zip(wires, start_world_x, end_world_x):
        if abs((end_x - start_x) - TARGET_X) > EPSILON:
            failures.append(wire.name + " did not inherit the complete +X move")
            break

    if failures:
        raise RuntimeError("v11 static-pose validation failed: " + "; ".join(failures))


def main():
    print("Running OREO AR patch:", BUILD_VERSION)
    scene = bpy.context.scene

    # Inspect before mutation, as required.  A rerun may already have our rig;
    # inspect the v8 wire content after evaluating it at F82.
    wires = inspect_existing_scene()
    scene.frame_set(82)
    clear_only_this_patch()

    # Recollect after safe cleanup in case this is a v11 rerun.
    wires = sorted(
        (obj for obj in bpy.data.objects if obj.name.startswith(WIRE_PREFIX)),
        key=lambda obj: obj.name,
    )
    product_collection = ensure_collection(PRODUCT_COLLECTION)
    helpers_collection = ensure_collection(HELPERS_COLLECTION)
    rig = make_rig(product_collection)
    parent_existing_wires(wires, rig, product_collection)
    make_validation_cameras(helpers_collection)
    key_rightward_move(rig)

    scene.frame_end = max(scene.frame_end, FRAME_HOLD)
    validate_static_poses(rig, wires)
    scene.frame_set(FRAME_END)

    print("PATCH OK")
    print("  Preserved: Front_Cover_Mesh UV/material and all v8 F0-F82 animation")
    print("  Removed: wrong v9 OREO_INFO_* and wrong v10 OREO_PRINT_* objects")
    print("  Rig: OREO_MOVE_TransparentBox_Rig")
    print("  Children: 12 existing wire edges (no early transparent-face visibility hack)")
    print("  F83: rig location = (0.000, 0.000, 0.000)")
    print("  F98: rig location = ({:.3f}, 0.000, 0.000)".format(TARGET_X))
    print("  Animation channel: location.x ONLY")
    print("  Printing intentionally deferred until F83/F98 are visually approved")


main()
