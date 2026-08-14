# 8th Wall Engine Image Target Template

This is a minimal 8th Wall Engine image target project. It does not use ECS or A-Frame.

## What It Does

- Loads 8th Wall Engine from `external/xr/xr.js`.
- Preloads the required `slam` chunk for `XR8.XrController`.
- Registers `image-targets/target.json` through `XR8.XrController.configure({ imageTargetData })`.
- Listens to `reality.imagefound`, `reality.imageupdated`, and `reality.imagelost`.
- Shows `src/assets/christmas.glb` when the image target named `target` is detected.

## Replace The GLB

Simple path:

1. Replace `src/assets/christmas.glb` with another `.glb` file using the same filename.
2. Run `npm install` if dependencies are missing.
3. Run `npm run build` or `npm run serve`.

Custom filename path:

1. Put the new model in `src/assets/`, for example `product.glb`.
2. Edit `src/app.js`:

```js
const MODEL_URL = require("./assets/product.glb");
```

## Replace The Image Target

Do not only replace `src/assets/target.png`. 8th Wall recognition uses the generated image target data in `image-targets/target.json`.

Correct replacement flow:

1. Create or generate a new 8th Wall image target package for the new recognition image.
2. Replace all files in `image-targets/` with the generated files, including `target.json`, cropped image, luminance image, original image, and thumbnail image.
3. Make sure `image-targets/target.json` contains:

```json
"name": "target"
```

4. Optionally replace `src/assets/target.png` so the social preview/sample file matches the new target.

If the target name is not `target`, edit `src/app.js`:

```js
const TARGET_NAME = "your-target-name";
```

## Start

```bash
npm install
npm run serve -- --host 0.0.0.0
```

Open:

```text
http://localhost:8080/
```

## Build

```bash
npm run build
```

## Important Constraints

- Do not add `@8thwall/ecs`.
- Do not add `src/.expanse.json`.
- Do not load `8frame` or A-Frame scripts.
- Keep `data-preload-chunks="slam"` on the `xr.js` script tag.
- Keep `XR8.GlTextureRenderer.pipelineModule()`, `XR8.Threejs.pipelineModule()`, and `XR8.XrController.pipelineModule()` in the pipeline.
