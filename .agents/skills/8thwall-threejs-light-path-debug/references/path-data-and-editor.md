# Path data and Debug editor

## Replaceable JSON schema

Use a versioned, ID-based structure. Version 3 makes the `paths` array authoritative so additions and full deletions survive import/export.

```json
{
  "version": 3,
  "paths": [
    {
      "id": "root-left-01",
      "group": "root",
      "delay": 0.1,
      "colors": ["#ffd05a", "#f2a845"],
      "widthMm": 8,
      "points": [[42, 610], [160, 578], [286, 520]]
    }
  ],
  "cores": [
    { "id": "core-left", "center": [350, 414], "size": [111, 89] }
  ],
  "particleZones": [
    { "id": "crown-left", "center": [250, 160], "width": 300, "height": 190 }
  ],
  "layers": {
    "energyZMm": 0.25,
    "barkZMm": 0.55
  }
}
```

Rules:

- Path IDs must be unique and stable.
- A renderable path needs at least two finite points.
- Points are full source-image pixels and should be clamped to its bounds.
- `widthMm` is visual physical width, independent from point coordinates.
- Valid groups should match the runtime timing table.
- Missing colors, delays, or group values may use defaults; do not silently replace valid points.
- V1/V2 import may merge by ID for backward compatibility. V3 paths should replace the entire default path set.
- Enforce `barkZMm >= energyZMm + minLayerGapMm`.

The production data module should import this JSON directly. It may enrich each path with default colors/timing, but must not keep an unrelated hard-coded coordinate array as the actual source.

## Runtime editing interfaces

Effects should expose focused Debug mutation methods while retaining their normal lifecycle:

```js
group
update(elapsed, state)
reset()
dispose()

setPathPoints(id, points)
setPathWidth(id, widthMm)
addPath(definition)
removePath(id)
syncPaths(paths)
setLayerZ(zMetres)
```

Core and particle effects can expose:

```js
setCoreLayout(id, center, size)
setParticleZone(id, zone)
```

The shell/occlusion effect should also expose `rebuildCoverage()` and schedule it whenever paths or widths change.

## Standalone preview

Debug mode should be usable without recognizing the target:

1. create a standalone Three.js scene and orthographic camera;
2. show the complete source artwork on a target-sized plane;
3. place the artwork slightly behind the authored effect plane;
4. fit the orthographic bounds with contain semantics and small padding;
5. instantiate the same effect/controller classes used by AR;
6. disable XR pose updates but keep the same local coordinate conversion;
7. render with the same pixel-ratio and delta caps as the experience.

Avoid maintaining separate preview-only effect implementations; they drift from production.

## Editor interaction

Path mode should allow:

- clicking a handle to select and drag it;
- inserting after the selected point or on the nearest segment;
- deleting a point, including reducing the path below renderable size if the UX then offers completion/cancel;
- deleting the entire path with no minimum-point restriction;
- creating an arbitrary number of paths;
- changing group and `widthMm` live.

For a newly created path, collect points until the user confirms. Do not send it to Ribbon/shell rendering until it has at least two points. Cancel should remove the incomplete draft.

Core/zone modes use a center handle plus independent width/height handles. Display the selected object ID, point index/handle, and exact source pixel coordinates. Provide +/-1 and +/-5 px nudges.

The panel must be draggable and constrained to the viewport. It should not permanently cover the artwork. A pure-effect preview switch should hide handles and boundaries and pause editing until overlays return.

## State, persistence, and export

- Save Debug edits to a versioned localStorage key after successful normalization.
- Read that cache only in Debug mode.
- Reset removes Debug cache and restores the imported JSON defaults.
- Import should accept older supported versions, normalize once, refresh all effects, and report invalid entries.
- Copy/download should serialize normalized V3 JSON with stable IDs and readable indentation.
- Download as `path.json` so deployment is a direct file replacement.
- After a drag, flush the final Ribbon geometry and shell flow texture before exporting.

## Debug overlay

Useful overlay layers include:

- cyan full-target boundary;
- magenta path control points and curve;
- outer Ribbon boundary and narrow core boundary;
- yellow core center/size handles;
- purple particle-zone rectangle/handles;
- selected-point highlight.

Use non-attenuating point sizes for handles and a dedicated Debug Z/render order so controls remain selectable. Overlays must not exist on a normal URL.

## Validation checklist

- JSON loaded path count matches the editor and runtime.
- Add/delete/full-delete survives export and reload.
- Width/group changes update Ribbon and shell coverage.
- Drag rebuild is frame-limited; pointer-up produces the final geometry/texture.
- Panel remains visible and draggable after resize/orientation change.
- Full artwork remains visible at wide and tall viewport ratios.
- Target loss cancels active dragging and hides/disables handles.
- `dispose()` releases DOM listeners, pointer capture, geometries, materials, textures, and timers.
