# 8th Wall Engine Image Target Template

This is a minimal 8th Wall Engine image target project. It does not use ECS or A-Frame.

## What It Does

- Loads 8th Wall Engine from `external/xr/xr.js`.
- Loads `external/xr/xr.js` only after the user presses `Start AR`, with `data-preload-chunks="slam"`.
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
http://localhost:58000/
```

When using the 8th Wall Desktop App, treat `http://localhost:58000/` as the user-facing preview URL. The underlying webpack server may expose another internal port, but Desktop projects should be tested through `58000`.

## Desktop Preview Startup

This template intentionally avoids static `<script src="./external/xr/xr.js">` loading and avoids `xrloaded => XR8.run()` at module load time. That keeps the 8th Wall Desktop simulator/viewport/hierarchy UI from being claimed immediately when the project opens.

Default flow:

1. Page renders a small `Start AR` gate.
2. User taps/clicks the button.
3. `src/app.js` dynamically injects `external/xr/xr.js` with `data-preload-chunks="slam"`.
4. After `XR8.XrController` is ready, the app configures image target tracking and calls `XR8.run()`.

For projects that need the native camera permission prompt before a branded poster/start gate, boot XR from app code, keep the camera canvas hidden, and show the poster only from a pipeline module when `onCameraStatusChange` reports `hasStream` or `hasVideo`. The poster button should only unlock media silently; start audible BGM from `reality.imagefound`/`reality.imageupdated`, and pause/reset it before showing any HTML overlay.

## Build

```bash
npm run build
```

## Important Constraints

- Do not add `@8thwall/ecs`.
- Do not add `src/.expanse.json`.
- Do not load `8frame` or A-Frame scripts.
- Do not statically load `external/xr/xr.js` in `index.html` unless a project explicitly needs the native camera permission prompt before the start gate.
- Keep `data-preload-chunks="slam"` when dynamically injecting `external/xr/xr.js`.
- Keep `XR8.GlTextureRenderer.pipelineModule()`, `XR8.Threejs.pipelineModule()`, and `XR8.XrController.pipelineModule()` in the pipeline.
