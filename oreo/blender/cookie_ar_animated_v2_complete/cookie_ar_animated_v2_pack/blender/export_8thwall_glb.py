"""Export the currently-open editable Blender source as an 8th Wall GLB.

Run from Blender's Scripting workspace, or from the command line:
  blender.exe cookie_ar_animated_v2_editable.blend --background \
    --python export_8thwall_glb.py -- --output cookie_ar_edited.glb
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import bpy


def arguments() -> argparse.Namespace:
    raw = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args(raw)


def supported_export_arguments(output: Path) -> dict:
    available = {item.identifier for item in bpy.ops.export_scene.gltf.get_rna_type().properties}
    candidates = {
        "filepath": str(output),
        "export_format": "GLB",
        "export_extras": True,
        "export_animations": True,
        "export_animation_mode": "ACTIONS",
        "export_force_sampling": True,
        "export_frame_range": False,
        "export_yup": True,
        "export_cameras": False,
        "export_lights": False,
        "export_apply": False,
    }
    return {key: value for key, value in candidates.items() if key in available}


def main() -> None:
    output = arguments().output.expanduser().resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(**supported_export_arguments(output))
    print(f"Exported 8th Wall GLB: {output}")


if __name__ == "__main__":
    main()
