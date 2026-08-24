# Image Target coordinates and calibration

## Coordinate contract

Author every editable point in the complete source image, not in the compiler crop:

- origin: top-left `(0, 0)`;
- X grows rightward;
- Y grows downward;
- valid range: `0..imageWidth`, `0..imageHeight`.

For physical target size `targetWidth x targetHeight` metres:

```js
const imagePointToWorld = (x, y, z = 0) => new THREE.Vector3(
  (x / imageWidth - 0.5) * targetWidth,
  (0.5 - y / imageHeight) * targetHeight,
  z,
)

const worldPointToImage = point => ({
  x: (point.x / targetWidth + 0.5) * imageWidth,
  y: (0.5 - point.y / targetHeight) * imageHeight,
})
```

These functions operate in the authored target-local plane. Apply the XR image-target pose to a common root Group, rather than baking pose values into every point.

## Compiler crop mapping

The XR event can describe the compiled/cropped recognition region while editing happens on the full artwork. Store the crop in full-image pixels:

```js
{ x, y, width, height }
```

Compute the crop's physical width, height, and center in the authored plane. When applying an event pose:

1. prefer positive `scaledWidth` and `scaledHeight`;
2. calculate X and Y scale independently;
3. fall back to the event `scale` when scaled dimensions are unavailable;
4. rotate the scaled crop-center offset by the event quaternion;
5. subtract that offset from the event position so the root represents the full artwork;
6. apply quaternion and non-uniform X/Y scale to the root.

Do not average X/Y scale. Different camera aspect/crop behavior can turn that shortcut into device-dependent drift.

## Rotation and crop verification

Do not guess the target's rotation or crop from how the printed image looks. Inspect the compiler/target metadata and express its crop in the displayed source-image orientation. If the compiler used a rotated source, convert the crop back to the editor's landscape/portrait orientation before applying it.

Test at least these source points:

```text
(0, 0), (W, 0), (W, H), (0, H), (W/2, H/2)
```

Round-trip each point through image -> local world -> image. Pure conversion error should be below 0.5 px.

## Ray picking for the editor

1. Convert pointer client coordinates to canvas NDC using `getBoundingClientRect()`.
2. Call `raycaster.setFromCamera(ndc, camera)`.
3. Construct the target plane from the root's world position and its local `+Z` normal transformed by the root world quaternion.
4. Intersect the ray with the plane.
5. Convert the hit to root-local coordinates with `root.worldToLocal()`.
6. Convert with `worldPointToImage()` and clamp to the source bounds.

Release pointer capture and cancel the active drag on target loss, preview-mode changes, editor disposal, or `pointercancel`.

## Symptom diagnosis

| Symptom | Likely cause | Check first |
| --- | --- | --- |
| Every path shifts equally | pose origin or crop-center offset | target boundary and crop center |
| Error grows near the edges | wrong physical/source dimensions or X/Y scale | corners and independent scale |
| PC and phone shift differently | averaged scale, wrong event fields, stale asset/JSON | `scaledWidth/Height`, cache, loaded JSON URL |
| Offset reverses when viewed obliquely | excessive Z or relief thickness/parallax | energy/shell depth and model transform |
| Only one branch is wrong | authored path points | edit that path only |
| Standalone editor aligns, AR does not | XR pose/crop mapping | `applyImageTargetPose()` |
| Debug image is cropped | camera fit uses cover instead of contain | orthographic bounds and viewport aspect |

For standalone fitting, use contain semantics. If viewport aspect is wider than the target, fix view height from target height; otherwise fix view width from target width. Multiply by a small padding factor such as `1.05..1.10`.

## Asset and cache checks

- Confirm the runtime imports the replaceable path JSON rather than a fallback array or stale localStorage entry.
- Log the loaded path count, first path ID, and a few control points in Debug mode.
- Production must ignore Debug localStorage.
- Replacing JSON under a dev server should not require a production build, but the module dev server/browser cache may still need refresh or a cache-busting URL.
- On phone/ngrok, verify the requested JSON URL and response contents rather than assuming the local file was served.
