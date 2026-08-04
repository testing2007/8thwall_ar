"""OREO AR — large information face row-print patch.

Build version: 2026-08-03-large-face-row-print-v12

Run after blender_add_transparent_box_move_v11.py in the user's adjusted
Blender scene.  This patch preserves F0-F98 and adds only the large information
face print from F99-F122.  The narrow adjacent face remains intentionally blank.

Physical shot specification (metres)
------------------------------------
Coordinate system: X left/right, Y front/back, Z up; front camera faces -Y.

Existing approved motion:
    OREO_MOVE_TransparentBox_Rig.location.x
    F83: 0.000 m; F98 and later: +0.099 m.

This patch:
    F99:  large face completely blank.
    F99-F122: each row prints left -> right; rows advance top -> bottom.
    F122-F150: large face remains complete.

The information face is parented to OREO_MOVE_TransparentBox_Rig.  It receives
no object-transform animation.  The reveal uses small GLB morph cells with
fixed UVs so the full row is not stretched across a partially printed width.
No alpha animation, procedural shader, Geometry Nodes, or scale=0.001 hiding is
used.  The first delivery omits the moving scan highlight so the two key poses
can be inspected without adding another motion cue.
"""

import bpy
import os


BUILD_VERSION = "2026-08-03-large-face-row-print-v12"

PREFIX = "OREO_LARGEPRINT_"
WRONG_PREFIXES = ("OREO_INFO_", "OREO_PRINT_")
MOVE_RIG_NAME = "OREO_MOVE_TransparentBox_Rig"
WIRE_PREFIX = "Front_Wire_Edge_"
COLLECTION_NAME = "30_INFO"

FRAME_BLANK = 99
FRAME_END = 122
FRAME_HOLD = 150

ROWS = 12
COLS = 8

BOX_TARGET_X = 0.099
BOX_DEPTH_Y = 0.046
PRINT_WIDTH_X = 0.086
PRINT_BOTTOM_Z = 0.005
PRINT_TOP_Z = 0.175
PRINT_HEIGHT_Z = PRINT_TOP_Z - PRINT_BOTTOM_Z
FRONT_SURFACE_LOCAL_Y = -BOX_DEPTH_Y / 2.0 - 0.00015

ASSET_RELATIVE_PATH = "oreo_print_reveal_assets/info_front.png"
EPSILON = 1.0e-6


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


def asset_path(relative_name):
    candidates = [bpy.path.abspath("//" + relative_name)]
    script_path = globals().get("__file__")
    if script_path:
        candidates.append(os.path.join(
            os.path.dirname(os.path.abspath(script_path)), relative_name))
    for candidate in candidates:
        if os.path.isfile(candidate):
            return candidate
    raise RuntimeError(
        "Missing approved information texture: {} (checked {})".format(
            relative_name, ", ".join(candidates)))


def remove_generated_prefix(prefix):
    for obj in list(bpy.data.objects):
        if obj.name.startswith(prefix):
            bpy.data.objects.remove(obj, do_unlink=True)


def iter_fcurves(id_block):
    animation = getattr(id_block, "animation_data", None)
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


def inspect_existing_scene():
    """Inspect the v11 hierarchy and motion before mutating this patch."""
    failures = []
    rig = bpy.data.objects.get(MOVE_RIG_NAME)
    front_cover = bpy.data.objects.get("Front_Cover_Mesh")
    wires = [obj for obj in bpy.data.objects
             if obj.name.startswith(WIRE_PREFIX)]

    if rig is None:
        failures.append("{} is missing; run v11 first".format(MOVE_RIG_NAME))
    if front_cover is None:
        failures.append("Front_Cover_Mesh is missing")
    elif (not getattr(front_cover.data, "uv_layers", None)
          or len(front_cover.data.uv_layers) == 0):
        failures.append("Front_Cover_Mesh has no UV map")
    if len(wires) != 12:
        failures.append("expected 12 wire edges; got {}".format(len(wires)))
    if rig is not None:
        for wire in wires:
            if wire.parent is not rig:
                failures.append(wire.name + " is not parented to the v11 move rig")
                break

        paths = {(curve.data_path, curve.array_index)
                 for curve in iter_fcurves(rig)}
        if paths and paths != {("location", 0)}:
            failures.append("move rig may animate location.x only; got " + repr(paths))

        scene = bpy.context.scene
        old_frame = scene.frame_current
        scene.frame_set(98)
        if abs(rig.location.x - BOX_TARGET_X) > EPSILON:
            failures.append("F98 move rig X is not {:.3f} m".format(BOX_TARGET_X))
        scene.frame_set(FRAME_BLANK)
        if abs(rig.location.x - BOX_TARGET_X) > EPSILON:
            failures.append("F99 move rig must remain at {:.3f} m".format(BOX_TARGET_X))
        if abs(rig.location.y) > EPSILON or abs(rig.location.z) > EPSILON:
            failures.append("move rig Y/Z must remain zero")
        scene.frame_set(old_frame)

    if failures:
        raise RuntimeError("v12 pre-inspection failed: " + "; ".join(failures))

    print("PRE-INSPECTION OK")
    print("  Preserving Front_Cover_Mesh UV/material and F0-F98 animation")
    print("  Existing move rig:", rig.name)
    print("  Existing move-rig children:", len(rig.children))
    print("  Existing materials:", len(bpy.data.materials))
    print("  Existing images:", len(bpy.data.images))
    return rig


def input_by_names(node, names):
    for name in names:
        socket = node.inputs.get(name)
        if socket is not None:
            return socket
    return None


def make_texture_material():
    name = PREFIX + "Mat_LargeFace"
    material = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()

    output = nodes.new(type="ShaderNodeOutputMaterial")
    principled = nodes.new(type="ShaderNodeBsdfPrincipled")
    texture = nodes.new(type="ShaderNodeTexImage")
    texture.image = bpy.data.images.load(
        asset_path(ASSET_RELATIVE_PATH), check_existing=True)

    base_color = input_by_names(principled, ("Base Color",))
    alpha = input_by_names(principled, ("Alpha",))
    emission = input_by_names(principled, ("Emission Color", "Emission"))
    emission_strength = input_by_names(principled, ("Emission Strength",))
    roughness = input_by_names(principled, ("Roughness",))

    if base_color is not None:
        links.new(texture.outputs["Color"], base_color)
    if alpha is not None and texture.outputs.get("Alpha") is not None:
        links.new(texture.outputs["Alpha"], alpha)
    if emission is not None:
        links.new(texture.outputs["Color"], emission)
    if emission_strength is not None:
        emission_strength.default_value = 1.8
    if roughness is not None:
        roughness.default_value = 0.30
    links.new(principled.outputs["BSDF"], output.inputs["Surface"])

    if hasattr(material, "surface_render_method"):
        try:
            material.surface_render_method = 'DITHERED'
        except (TypeError, ValueError):
            pass
    if hasattr(material, "blend_method"):
        try:
            material.blend_method = 'BLEND'
        except (TypeError, ValueError):
            pass
    material.use_backface_culling = False
    return material


def reveal_frame_for_cell(row, col):
    """Map 96 ordered cells onto F100-F122, preserving row/column order."""
    slot = row * COLS + col
    total_slots = ROWS * COLS
    return 100 + round(slot * (FRAME_END - 100) / (total_slots - 1))


def make_cell(row, col, material, collection, parent):
    cell_w = PRINT_WIDTH_X / COLS
    cell_h = PRINT_HEIGHT_Z / ROWS

    x_left = -PRINT_WIDTH_X / 2.0 + col * cell_w
    x_right = x_left + cell_w
    z_top = PRINT_TOP_Z - row * cell_h
    z_bottom = z_top - cell_h
    y = FRONT_SURFACE_LOCAL_Y

    # Winding gives an outward -Y normal for the front-facing information plane.
    vertices = (
        (x_left,  y, z_bottom),
        (x_right, y, z_bottom),
        (x_right, y, z_top),
        (x_left,  y, z_top),
    )
    mesh_name = PREFIX + "R{:02d}_C{:02d}_MeshData".format(row, col)
    mesh = bpy.data.meshes.new(mesh_name)
    mesh.from_pydata(vertices, (), ((0, 1, 2, 3),))
    mesh.update()

    uv_layer = mesh.uv_layers.new(name="UVMap")
    u_left = col / COLS
    u_right = (col + 1) / COLS
    v_top = 1.0 - row / ROWS
    v_bottom = 1.0 - (row + 1) / ROWS
    uv_by_vertex = {
        0: (u_left, v_bottom),
        1: (u_right, v_bottom),
        2: (u_right, v_top),
        3: (u_left, v_top),
    }
    for loop in mesh.loops:
        uv_layer.data[loop.index].uv = uv_by_vertex[loop.vertex_index]

    name = PREFIX + "R{:02d}_C{:02d}".format(row, col)
    obj = bpy.data.objects.new(name, mesh)
    link_only(obj, collection)
    obj.parent = parent
    obj.matrix_parent_inverse.identity()
    obj.location = (0.0, 0.0, 0.0)
    obj.rotation_euler = (0.0, 0.0, 0.0)
    obj.scale = (1.0, 1.0, 1.0)
    mesh.materials.append(material)

    obj.shape_key_add(name="Basis", from_mix=False)
    hidden = obj.shape_key_add(name="Hidden", from_mix=False)
    # Collapse only this cell's right edge onto its left edge.  UVs stay tied
    # to this small cell, avoiding full-row texture stretching.
    hidden.data[1].co.x = hidden.data[0].co.x
    hidden.data[2].co.x = hidden.data[3].co.x

    reveal_frame = reveal_frame_for_cell(row, col)
    hidden.value = 1.0
    hidden.keyframe_insert(data_path="value", frame=FRAME_BLANK)
    hidden.keyframe_insert(data_path="value", frame=reveal_frame - 1)
    hidden.value = 0.0
    hidden.keyframe_insert(data_path="value", frame=reveal_frame)
    hidden.keyframe_insert(data_path="value", frame=FRAME_HOLD)
    return obj


def validate_build(cells, move_rig):
    failures = []
    expected_count = ROWS * COLS
    if len(cells) != expected_count:
        failures.append("expected {} cells; got {}".format(expected_count, len(cells)))

    previous_reveal = FRAME_BLANK
    for row in range(ROWS):
        for col in range(COLS):
            obj = cells[row * COLS + col]
            if obj.parent is not move_rig:
                failures.append(obj.name + " is not parented to the move rig")
            if obj.animation_data and obj.animation_data.action:
                failures.append(obj.name + " must not have object-transform keys")
            if not obj.data.uv_layers:
                failures.append(obj.name + " has no UV map")
            if (obj.data.shape_keys is None
                    or obj.data.shape_keys.key_blocks.get("Hidden") is None):
                failures.append(obj.name + " has no Hidden shape key")
            current_reveal = reveal_frame_for_cell(row, col)
            if current_reveal < previous_reveal:
                failures.append("cell reveal order is not monotonic")
            previous_reveal = current_reveal

    scene = bpy.context.scene
    scene.frame_set(FRAME_BLANK)
    for obj in cells:
        hidden = obj.data.shape_keys.key_blocks["Hidden"]
        if abs(hidden.value - 1.0) > EPSILON:
            failures.append(obj.name + " is not blank at F99")
            break

    scene.frame_set(FRAME_END)
    for obj in cells:
        hidden = obj.data.shape_keys.key_blocks["Hidden"]
        if abs(hidden.value) > EPSILON:
            failures.append(obj.name + " is not fully printed at F122")
            break

    if abs(move_rig.location.x - BOX_TARGET_X) > EPSILON:
        failures.append("move rig shifted during F99-F122")
    if abs(move_rig.location.y) > EPSILON or abs(move_rig.location.z) > EPSILON:
        failures.append("move rig Y/Z changed")

    if failures:
        raise RuntimeError("v12 validation failed: " + "; ".join(failures))


def main():
    print("Running OREO AR patch:", BUILD_VERSION)

    move_rig = inspect_existing_scene()

    # Reruns remove only this patch plus the two superseded generated attempts.
    remove_generated_prefix(PREFIX)
    for wrong_prefix in WRONG_PREFIXES:
        remove_generated_prefix(wrong_prefix)

    info_collection = ensure_collection(COLLECTION_NAME)
    material = make_texture_material()
    cells = []
    for row in range(ROWS):
        for col in range(COLS):
            cells.append(make_cell(
                row, col, material, info_collection, move_rig))

    scene = bpy.context.scene
    scene.frame_end = max(scene.frame_end, FRAME_HOLD)
    validate_build(cells, move_rig)
    scene.frame_set(FRAME_END)

    print("PATCH OK")
    print("  Collection:", COLLECTION_NAME)
    print("  Created: {} large-face morph cells ({} rows x {} columns)".format(
        len(cells), ROWS, COLS))
    print("  Parent:", MOVE_RIG_NAME)
    print("  F99: large information face blank")
    print("  F99-F122: cells reveal left-to-right, rows top-to-bottom")
    print("  F122-F150: complete large information face held")
    print("  Preserved: F0-F98, Front_Cover_Mesh UV, v11 move-rig animation")
    print("  Deferred: narrow-face F123+ print and scan highlight")
    print("  Required export test: GLB export + clean-scene re-import")


main()
