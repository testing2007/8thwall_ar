# Template Usage

## Architecture

The template is a minimal 8th Wall Engine Image Target project.

- Runtime: `external/xr/xr.js`
- Required preload: `data-preload-chunks="slam"`
- Rendering: Three.js through `XR8.Threejs.pipelineModule()`
- Tracking: `XR8.XrController.pipelineModule()`
- Image target config: `image-targets/target.json`
- Model: `src/assets/christmas.glb`
- Canvas: `canvas#camerafeed`

The template intentionally avoids:

- `@8thwall/ecs`
- `src/.expanse.json`
- A-Frame
- `8frame-*.js`
- `external/runtime/runtime.js`

## Replace The GLB

Preferred simplest flow:

1. Copy the new model over `src/assets/christmas.glb`.
2. Keep `src/app.js` unchanged.
3. Run `npm run build`.

If the user wants a different filename:

1. Put the new file in `src/assets/`.
2. Edit `src/app.js`:

```js
const MODEL_URL = require("./assets/your-model.glb");
```

## Replace The Image Target

The recognition target is not just `src/assets/target.png`. The real recognition package is the generated data in `image-targets/`.

To replace the target:

1. Obtain a generated 8th Wall image target package for the new image.
2. Replace the entire `image-targets/` directory.
3. Confirm `image-targets/target.json` exists.
4. Confirm the JSON `name` matches `TARGET_NAME` in `src/app.js`.
5. Optionally replace `src/assets/target.png` for preview/reference only.

If the target JSON uses another name, change:

```js
const TARGET_NAME = "target";
```

## Verification

Run these checks after creating or updating a project:

```powershell
rg -n --hidden --glob '!node_modules/**' --glob '!dist/**' "@8thwall/ecs|external/runtime|runtime\.js|8frame|AFRAME|\.expanse|initScene" .
npm run build
```

The `rg` command should have no project-source hits. `xrextras.js` may contain internal strings such as `xrextras-old-style`; do not treat those as project A-Frame usage unless the page loads A-Frame or 8frame.

## Local Serve

```powershell
npm run serve -- --host 0.0.0.0
```

Use `http://localhost:8080/` unless that port is already occupied.

8th Wall Desktop App may use `localhost:58000`; if it shows stale ECS errors, close and reopen the Desktop project so its internal dev server respawns with the current config.

After creating a new project from the template, run `npm install` inside the new project. This updates `package-lock.json` metadata for the new project name if needed.

## Script Execution Policy

If Windows blocks `create_project.ps1`, run it through:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\create_project.ps1 -ProjectName my-project
```
