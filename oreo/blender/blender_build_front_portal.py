"""Build the OREO front-cover extraction / portal sequence (F58-F145).

Run in the existing .blend.  It deliberately does not create AR_ROOT.
All objects made by this script live in collection 20_FRONT; 10_SCAN is not
touched.  Re-running it replaces only objects whose names start with Front_
or Portal_.  The script uses transform keys only, which are GLB-safe.
"""

import bpy
import math
import os

# Set this only when the asset folder is not beside the .blend file.
ASSET_DIR = ""

BOX_W, BOX_D, BOX_H = 0.095, 0.045, 0.180
FRONT_Y = -BOX_D / 2 - 0.0012
FRONT_COL = "20_FRONT"


def asset(name):
    root = ASSET_DIR or bpy.path.abspath("//oreo_animation_assets")
    path = os.path.join(root, name)
    if not os.path.isfile(path):
        raise RuntimeError(
            "Cannot find " + path + "\n"
            "Unzip oreo_animation_assets beside this .blend, or set ASSET_DIR."
        )
    return path


def collection(name):
    col = bpy.data.collections.get(name)
    if col is None:
        col = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(col)
    return col


def clear_previous():
    for obj in list(bpy.data.objects):
        if obj.name.startswith(("Front_", "Portal_")):
            bpy.data.objects.remove(obj, do_unlink=True)


def only_in(obj, col):
    for old in list(obj.users_collection):
        old.objects.unlink(obj)
    col.objects.link(obj)


def image_material(name, file_name, emission_strength=0.0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(asset(file_name), check_existing=True)
    links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    if "Emission Color" in bsdf.inputs:
        links.new(tex.outputs["Color"], bsdf.inputs["Emission Color"])
    if "Emission Strength" in bsdf.inputs:
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    if "Roughness" in bsdf.inputs:
        bsdf.inputs["Roughness"].default_value = 0.42
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def color_material(name, color, emission_strength=0.0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = 0.32
    if "Emission Color" in bsdf.inputs:
        bsdf.inputs["Emission Color"].default_value = color
    if "Emission Strength" in bsdf.inputs:
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    return mat


def plane(name, width, height, y, z, material, col):
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, y, z), rotation=(math.pi / 2, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = (width, height, 1)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    only_in(obj, col)
    return obj


def rounded_box(name, width, height, depth, y, z, material, col, bevel=0.004):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, y, z))
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = (width, depth, height)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    mod = obj.modifiers.new("Rounded_Corners", "BEVEL")
    mod.width, mod.segments = bevel, 4
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)
    obj.data.materials.append(material)
    only_in(obj, col)
    return obj


def key_loc_scale(obj, frame, loc, scale=(1, 1, 1)):
    bpy.context.scene.frame_set(frame)
    obj.location = loc
    obj.scale = scale
    obj.keyframe_insert(data_path="location", frame=frame)
    obj.keyframe_insert(data_path="scale", frame=frame)


def key_loc_rot_scale(obj, frame, loc, rot, scale=(1, 1, 1)):
    bpy.context.scene.frame_set(frame)
    obj.location = loc
    obj.rotation_euler = rot
    obj.scale = scale
    obj.keyframe_insert(data_path="location", frame=frame)
    obj.keyframe_insert(data_path="rotation_euler", frame=frame)
    obj.keyframe_insert(data_path="scale", frame=frame)


def linear(obj):
    action = getattr(getattr(obj, "animation_data", None), "action", None)
    if not action:
        return
    curves = list(getattr(action, "fcurves", []))
    for layer in getattr(action, "layers", []):
        for strip in getattr(layer, "strips", []):
            for bag in getattr(strip, "channelbags", []):
                curves += list(getattr(bag, "fcurves", []))
    for curve in curves:
        for point in curve.keyframe_points:
            point.interpolation = "LINEAR"


def wire_box(col, material):
    # 12 physical edges of the translucent packaging proxy.
    specs = []
    for z in (0, BOX_H):
        for y in (-BOX_D / 2, BOX_D / 2):
            specs.append(((BOX_W, .0010, .0010), (0, y, z)))
    for x in (-BOX_W / 2, BOX_W / 2):
        for y in (-BOX_D / 2, BOX_D / 2):
            specs.append(((.0010, .0010, BOX_H), (x, y, BOX_H / 2)))
    for x in (-BOX_W / 2, BOX_W / 2):
        for z in (0, BOX_H):
            specs.append(((.0010, BOX_D, .0010), (x, 0, z)))

    edges = []
    for i, (dimensions, location) in enumerate(specs):
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0.25, -0.20))
        obj = bpy.context.object
        obj.name = f"Front_Wire_Edge_{i:02d}"
        obj.dimensions = dimensions
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        obj.data.materials.append(material)
        only_in(obj, col)
        # Keep full-scale at all times: before F100 it is simply parked behind
        # the physical package, never shrunk to 0.001.
        key_loc_scale(obj, 99, (0, 0.25, -0.20))
        key_loc_scale(obj, 112, location)
        key_loc_scale(obj, 145, location)
        linear(obj)
        edges.append(obj)
    return edges


def main():
    scene = bpy.context.scene
    scene.frame_start, scene.frame_end, scene.render.fps = 0, 179, 30
    col = collection(FRONT_COL)
    clear_previous()

    cover_mat = image_material("MAT_Front_Original_Cover", "00_reference_box_front.png", 0.15)
    cookie_mat = image_material("MAT_Portal_Cookie", "40_cookie_hero.png", 0.25)
    dark_mat = color_material("MAT_Portal_Interior", (0.006, 0.012, 0.040, 1), 0.05)
    rim_mat = color_material("MAT_Portal_Electric_Blue", (0.02, 0.26, 1.0, 1), 3.0)
    wire_mat = color_material("MAT_Front_Transparent_Wire", (0.12, 0.72, 1.0, 1), 2.0)

    # F58-82: a precise virtual copy of the actual printed cover lifts out.
    cover = plane("Front_Extracted_Cover", BOX_W, BOX_H, FRONT_Y - .0004, BOX_H / 2, cover_mat, col)
    key_loc_rot_scale(cover, 58, (0, FRONT_Y - .0004, BOX_H / 2), (math.pi / 2, 0, 0))
    key_loc_rot_scale(cover, 63, (0, FRONT_Y - .008, BOX_H / 2 + .002), (math.pi / 2, 0, 0))
    key_loc_rot_scale(cover, 72, (.014, FRONT_Y - .042, BOX_H / 2 + .012), (math.pi / 2, math.radians(-8), math.radians(-4)), (.92, .92, .92))
    key_loc_rot_scale(cover, 82, (.080, FRONT_Y - .065, BOX_H / 2 + .022), (math.pi / 2, math.radians(-13), math.radians(-8)), (.74, .74, .74))
    key_loc_rot_scale(cover, 145, (.080, FRONT_Y - .065, BOX_H / 2 + .022), (math.pi / 2, math.radians(-13), math.radians(-8)), (.74, .74, .74))
    linear(cover)

    # The portal sits on the real front.  The dark rounded plate masks the
    # printed image and makes the cookie read as being inside the carton.
    rim = rounded_box("Portal_Rim", .053, .060, .0022, FRONT_Y - .0016, .074, rim_mat, col)
    inside = rounded_box("Portal_Interior", .0475, .0545, .0024, FRONT_Y - .0028, .074, dark_mat, col)
    cookie = plane("Portal_Cookie_Inside", .042, .042, FRONT_Y - .0042, .073, cookie_mat, col)

    parked = (0, .25, -.20)
    for obj in (rim, inside, cookie):
        key_loc_scale(obj, 58, parked)
        key_loc_scale(obj, 66, parked)
    key_loc_scale(rim, 72, (0, FRONT_Y - .0016, .074), (.86, 1, .86))
    key_loc_scale(inside, 72, (0, FRONT_Y - .0028, .074), (.86, 1, .86))
    key_loc_scale(cookie, 72, (0, FRONT_Y - .0042, .073), (.78, 1, .78))
    key_loc_scale(rim, 78, (0, FRONT_Y - .0016, .074))
    key_loc_scale(inside, 78, (0, FRONT_Y - .0028, .074))
    key_loc_scale(cookie, 82, (0, FRONT_Y - .0042, .073))
    for obj in (rim, inside, cookie):
        key_loc_scale(obj, 145, obj.location)
        linear(obj)

    # F100-112: AR wireframe/proxy expands around the real pack.
    wire_box(col, wire_mat)
    scene.frame_set(58)
    print("Done: 20_FRONT now contains cover extraction, interior portal and wireframe.")


main()
