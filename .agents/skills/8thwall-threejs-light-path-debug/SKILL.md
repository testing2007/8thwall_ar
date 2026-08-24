---
name: 8thwall-threejs-light-path-debug
description: Implement, tune, or diagnose Three.js light-flow effects and editable pixel-path calibration for 8th Wall Engine Image Targets. Use for Ribbon/vein energy, subsurface bark transmission, image-to-world alignment, standalone path editors, path JSON import/export, camera-dependent drift, and debug overlays; do not use for generic Three.js scenes without Image Target coordinate mapping.
---

# 8th Wall Three.js Light and Path Debug

Build effects that remain aligned to an 8th Wall Image Target and can be calibrated against the source artwork without repeatedly scanning the target.

## Start by identifying the failure layer

Do not compensate for a global mapping error by dragging every path.

1. Verify the cyan/debug target boundary against the physical artwork.
2. Verify source image dimensions, physical target dimensions, and compiler crop/rotation metadata.
3. Test source-image corners and center through `imagePointToWorld()` and `worldPointToImage()`.
4. Compare front-on and oblique views on at least two cameras.
5. Edit individual control points only after the full-image mapping is correct.

Read [coordinates-and-calibration.md](references/coordinates-and-calibration.md) whenever the task involves offset, scale drift, crop, rotation, camera differences, ray picking, or path JSON.

## Choose the visual structure deliberately

- For a visible flowing line, use one planar Ribbon mesh per path with `CatmullRomCurve3`, arc-length sampling, and a ShaderMaterial.
- For a plant-internal nutrient flow, put energy beneath a textured relief/shell and let grooves or a generated flow mask transmit it. Z separation alone cannot make the camera image occlude virtual light.
- Use a packed Canvas texture when path arrival time, corridor coverage, and thin vein structure must share one low-cost texture.
- Keep particles in one instanced mesh; do not create one Mesh per particle.
- Prefer a single-pass fake halo over Bloom/post-processing on mobile WebAR unless the user explicitly accepts the cost.

Read [light-effects.md](references/light-effects.md) for the rendering layers, shader roles, animation timing, and performance rules.

## Preserve editable data as the source of truth

Keep path coordinates in full source-image pixels: origin at top-left, X rightward, Y downward. Runtime code should load a replaceable JSON file and merge only visual defaults that are absent. Do not require code edits after calibration.

The editor should support:

- standalone preview of the complete source image before target recognition;
- pointer/touch ray intersection with the authored target plane;
- selecting, dragging, inserting, deleting, creating, and fully removing paths;
- per-path group and width controls;
- core and particle-zone center/size handles when those objects exist;
- global energy/shell Z controls with a minimum separation constraint;
- draggable panels, uncluttered effect-only preview, reset, import, copy, and JSON download;
- localStorage only in Debug mode; production must ignore Debug cache.

Apply geometry rebuilds at most once per animation frame. Throttle Canvas mask rebuilds during drag and force a final rebuild on pointer-up.

Read [path-data-and-editor.md](references/path-data-and-editor.md) when creating or changing the editor, JSON schema, live update interfaces, or import/export behavior.

## Tune in this order

1. Alignment and crop mapping.
2. Path topology and group timing (`root -> trunk -> main branch -> side branch`).
3. Ribbon/corridor width and internal vein width.
4. Energy/shell depth relationship.
5. awakening/alive strength and moving-head duration.
6. particles, cores, and decorative polish.

Changing intensity before alignment and occlusion are correct usually produces brighter decals rather than convincing internal light.

## Verification

- Check pixel/world corner and center round trips; target less than 0.5 px error.
- Confirm the full source image is visible in standalone Debug at every viewport aspect ratio.
- Test localhost and a secure phone URL; use the same JSON and source artwork in both.
- Confirm front-on and angled views do not reverse the offset direction.
- Verify target lost/found does not duplicate effects or leave Debug dragging active.
- Run the project build and inspect runtime draw calls and disposed geometries/materials.
- On mobile, cap pixel ratio and delta time; test sustained operation, not only first recognition.

When reporting a fix, distinguish whether it changed authored path data, coordinate mapping, visual layering, or only tuning. This makes later calibration JSON portable and prevents regressions.
