---
name: 8thwall-initial-engine-template
description: Create or update a minimal 8th Wall Engine Image Target project from the local template. Use when the user asks for a basic 8th Wall image target project, Engine mode, no ECS, no A-Frame, target image recognition that displays a GLB, or a reusable project where only the recognition target and GLB model change.
---

# 8thwall Initial Engine Template

## Overview

Use the local template project at `D:\workspace\8thwall example\8thwall_ar\8thwall-engine-image-target-template` to create simple 8th Wall Engine image target projects. The template uses `XR8.XrController` and Three.js CameraPipelineModules, not ECS and not A-Frame.

## Workflow

1. Read `references/template-usage.md`.
2. Create the new project by copying the template directory, preferably with `scripts/create_project.ps1`.
3. Replace the GLB and image target data as requested.
4. Verify that no ECS/A-Frame files or references were introduced.
5. Run `npm install` if `node_modules` is missing.
6. Run `npm run build`.
7. For preview/testing with 8th Wall Desktop App, use `http://localhost:58000/` as the canonical local URL. If the user has ngrok running, use its forwarding URL to `http://localhost:58000` for phone testing. Do not report `8080` as the user-facing preview URL for these Desktop App projects.
8. Keep startup behavior explicit. The base template should not statically load `xr.js` or call `XR8.run()` at module load time, because that can immediately claim the Desktop/browser preview.

## Template Path

Use this template:

```text
D:\workspace\8thwall example\8thwall_ar\8thwall-engine-image-target-template
```

Default project root for new 8th Wall projects:

```text
D:\workspace\8thwall example\8thwall_ar
```

## Non-Negotiables

- Do not use `@8thwall/ecs`.
- Do not create or keep `src/.expanse.json`.
- Do not load `8frame` or A-Frame scripts.
- Use `external/xr/xr.js` with `data-preload-chunks="slam"` when dynamically injecting the runtime.
- Do not statically load `external/xr/xr.js` in `index.html` for the base template.
- Do not call `XR8.run()` from a top-level `xrloaded` listener or during module import for the base template.
- Use Engine pipeline modules: `XR8.GlTextureRenderer`, `XR8.Threejs`, and `XR8.XrController`.
- Use `XR8.XrController.configure({ imageTargetData: [...] })`.
- Listen for `reality.imagefound`, `reality.imageupdated`, and `reality.imagelost`.

## Startup Gate Patterns

Default Desktop-friendly template:

1. Render a simple start gate.
2. On trusted user `touchend`/`click`, dynamically inject `external/xr/xr.js` with `data-preload-chunks="slam"`.
3. Configure `XR8.XrController`, add pipeline modules, then call `XR8.run()`.
4. Hide the start gate only after the Engine starts.

Camera-permission-first projects:

1. Boot XR from app code to show the native camera authorization prompt.
2. Keep the camera canvas hidden until the user starts the AR experience.
3. Add a small pipeline module with `onCameraStatusChange`.
4. Show the branded poster/start button only when status is `hasStream` or `hasVideo`.
5. On the poster button, unlock media silently using `volume = 0`; do not make BGM audible yet.
6. Start audible BGM only after `reality.imagefound`/`reality.imageupdated` confirms the image target.
7. Pause and reset BGM before showing HTML overlay UI.

## Quick Commands

Create a project:

```powershell
.\scripts\create_project.ps1 -ProjectName my-project
```

If Windows blocks script execution, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\create_project.ps1 -ProjectName my-project
```

Create a project with a replacement GLB:

```powershell
.\scripts\create_project.ps1 -ProjectName my-project -GlbPath D:\assets\model.glb
```

Use custom target data only when the supplied path is a generated 8th Wall image target directory containing `target.json`.
