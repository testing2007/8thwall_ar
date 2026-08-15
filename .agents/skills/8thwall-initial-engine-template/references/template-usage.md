# Template Usage

## Architecture

The template is a minimal 8th Wall Engine Image Target project.

- Runtime: `external/xr/xr.js`, dynamically injected by `src/app.js`
- Required preload: `data-preload-chunks="slam"` on the dynamic script element
- Rendering: Three.js through `XR8.Threejs.pipelineModule()`
- Tracking: `XR8.XrController.pipelineModule()`
- Image target config: `image-targets/target.json`
- Model: `src/assets/christmas.glb`
- Canvas: `canvas#camerafeed`
- Startup gate: `#template-start-screen` / `#template-start-button`

The template intentionally avoids:

- `@8thwall/ecs`
- `src/.expanse.json`
- A-Frame
- `8frame-*.js`
- `external/runtime/runtime.js`

The template intentionally avoids static `xr.js` loading and avoids calling `XR8.run()` from a top-level `xrloaded` listener. This prevents a project from immediately claiming the 8th Wall Desktop/browser preview when it is opened.

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

## Startup And Audio Gates

Default template flow:

1. Render a small start screen without loading `external/xr/xr.js`.
2. On the user's click/touch, dynamically inject `external/xr/xr.js` with `data-preload-chunks="slam"`.
3. Configure `XR8.XrController` and call `XR8.run()`.
4. Hide the start screen after the Engine starts.

For projects that need the native browser camera permission prompt before a branded poster/start gate:

1. Boot XR from app code so the browser can request camera permission.
2. Keep the camera canvas hidden while permission is being requested.
3. Add a small pipeline module with `onCameraStatusChange`.
4. Show the poster/start button only when status is `hasStream` or `hasVideo`.
5. On the poster button's trusted `touchend`/`click`, unlock audio silently. Use `volume = 0` instead of `muted` for media that must later become audible on iOS.
6. Start audible BGM only when the image target is recognized.
7. Pause and reset BGM before entering any HTML overlay.

## Local Preview

8th Wall Desktop App exposes the active project at:

```text
http://localhost:58000/
```

Treat `58000` as the canonical preview URL for these local Engine Image Target projects. The underlying webpack/dev server may use another internal port, but do not present that internal port as the user-facing URL.

For phone testing, the user commonly runs ngrok to forward the Desktop App port:

```text
https://<ngrok-domain> -> http://localhost:58000
```

Use the current ngrok forwarding URL when the user provides one. Do not substitute `8080` for 8th Wall Desktop App testing.

If `localhost:58000` shows stale ECS errors, close and reopen the Desktop project so its internal dev server respawns with the current config.

If Chrome reports camera access is blocked even after the browser permission is set to Allow, reset the site permission for `http://localhost:58000`, make sure the selected camera is not in use by another app/tab, then reload the Desktop App preview or restart the Desktop App.

After creating a new project from the template, run `npm install` inside the new project. This updates `package-lock.json` metadata for the new project name if needed.

## Script Execution Policy

If Windows blocks `create_project.ps1`, run it through:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\create_project.ps1 -ProjectName my-project
```
