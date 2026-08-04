"""Import the animated GLB into Blender and save an organised editable .blend.

Recommended command (Windows):
  blender.exe --background --factory-startup --python prepare_editable_source.py -- \
    --glb ..\\cookie_ar_animated_v2.glb \
    --output ..\\cookie_ar_animated_v2_editable.blend \
    --force-clear

The script refuses to clear a non-empty scene unless --force-clear is supplied.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import bpy


CLIP_NAMES = [
    "MASTER_FULL_6S",
    "A01_SCAN_TRACE",
    "A02_FRONT_ACTIVATE",
    "A03_PANEL_DEPLOY",
    "A04_COOKIE_DROP",
    "A05_COOKIE_STACK",
    "A06_IDLE_LOOP",
]

COLLECTION_NAMES = [
    "00_OCCLUSION_GUIDE",
    "10_FRONT_FX",
    "20_INFO_PANEL",
    "30_COOKIE_ANIMATION",
    "90_EXPORT_ROOT",
]


def arguments() -> argparse.Namespace:
    raw = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    default_root = Path(__file__).resolve().parents[1]
    parser.add_argument("--glb", type=Path, default=default_root / "cookie_ar_animated_v2.glb")
    parser.add_argument("--output", type=Path, default=default_root / "cookie_ar_animated_v2_editable.blend")
    parser.add_argument("--force-clear", action="store_true")
    return parser.parse_args(raw)


def clear_scene(force: bool) -> None:
    existing = list(bpy.context.scene.objects)
    if existing and not force:
        raise RuntimeError(
            "The current Blender scene is not empty. Run with --factory-startup and "
            "--force-clear, or open a new empty file first."
        )
    if not existing:
        return
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def ensure_collection(name: str) -> bpy.types.Collection:
    collection = bpy.data.collections.get(name)
    if collection is None:
        collection = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(collection)
    return collection


def ancestor_names(obj: bpy.types.Object) -> set[str]:
    names: set[str] = set()
    current = obj
    while current is not None:
        names.add(current.name)
        current = current.parent
    return names


def destination_collection(obj: bpy.types.Object) -> str:
    names = ancestor_names(obj)
    if any(name.startswith("OCC_") or name == "00_OCCLUSION_GUIDE" for name in names):
        return "00_OCCLUSION_GUIDE"
    if any(name.startswith("FX_") or name == "10_FRONT_FX" for name in names):
        return "10_FRONT_FX"
    if any(name.startswith("PANEL_") or name == "20_INFO_PANEL" for name in names):
        return "20_INFO_PANEL"
    if any(name.startswith("COOKIE_") or name == "30_COOKIE_ANIMATION" for name in names):
        return "30_COOKIE_ANIMATION"
    return "90_EXPORT_ROOT"


def organise_objects() -> None:
    collections = {name: ensure_collection(name) for name in COLLECTION_NAMES}
    for obj in list(bpy.context.scene.objects):
        destination = collections[destination_collection(obj)]
        if obj.name not in destination.objects:
            destination.objects.link(obj)
        for source in list(obj.users_collection):
            if source != destination:
                source.objects.unlink(obj)


def annotate_scene() -> None:
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.length_unit = "METERS"
    scene.render.fps = 30
    scene.frame_start = 1
    scene.frame_end = 180
    scene.use_preview_range = True
    scene.frame_preview_start = 1
    scene.frame_preview_end = 180

    markers = [
        (1, "A01_SCAN_TRACE"),
        (37, "A02_FRONT_ACTIVATE"),
        (72, "A03_PANEL_DEPLOY"),
        (111, "A04_COOKIE_DROP"),
        (123, "A05_COOKIE_STACK"),
        (162, "A06_IDLE_LOOP"),
        (180, "END"),
    ]
    scene.timeline_markers.clear()
    for frame, name in markers:
        scene.timeline_markers.new(name, frame=frame)

    root = bpy.data.objects.get("AR_ROOT")
    if root is not None:
        root["asset_version"] = "2.0.0"
        root["target_width_mm"] = 75
        root["target_height_mm"] = 150
        root["target_depth_mm"] = 38
        root["production_clip"] = "MASTER_FULL_6S"
        root["animation_clips"] = ", ".join(CLIP_NAMES)
        root.empty_display_type = "CUBE"
        root.empty_display_size = 0.01

    guide = bpy.data.objects.get("00_OCCLUSION_GUIDE")
    if guide is not None:
        guide["disabled_for_runtime"] = True
        guide["note"] = "Keep disabled unless you configure a depth-only material in 8th Wall."

    for action in bpy.data.actions:
        action["imported_from"] = "cookie_ar_animated_v2.glb"
        for clip in CLIP_NAMES:
            if clip in action.name:
                action["source_clip"] = clip
                break


def main() -> None:
    args = arguments()
    glb = args.glb.expanduser().resolve()
    output = args.output.expanduser().resolve()
    if not glb.exists():
        raise FileNotFoundError(glb)

    clear_scene(args.force_clear)
    bpy.ops.import_scene.gltf(filepath=str(glb))
    organise_objects()
    annotate_scene()
    bpy.context.scene.frame_set(1)

    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output))
    print(f"Saved editable Blender source: {output}")
    print("Imported actions:")
    for action in bpy.data.actions:
        print(f"  - {action.name}")


if __name__ == "__main__":
    main()
