# Three.js light-flow effects

## Planar Ribbon layer

Build each path as:

```text
source-image points
  -> imagePointToWorld(x, y, 0)
  -> CatmullRomCurve3(..., "centripetal")
  -> arc-length samples and in-plane normals
  -> BufferGeometry ribbon
  -> one ShaderMaterial / one draw call
```

The geometry should expose:

- along-path UV/progress;
- signed across-path coordinate;
- accumulated path distance;
- soft or rounded end-cap coverage.

Use centripetal Catmull-Rom to reduce loops and overshoot around uneven control points. Choose segment count from path complexity and clamp it; rebuilding hundreds of segments per drag is unnecessary.

One fragment shader can combine:

- white-hot narrow core;
- colored body;
- low-alpha soft halo;
- multiple moving filaments;
- two inexpensive value-noise scales;
- a moving head and weaker echo;
- reveal progress and soft edge/cap antialiasing.

Use derivatives (`fwidth`) so fine filaments merge into a continuous light band at distance instead of aliasing or disappearing.

## Awakening topology

Treat path groups as topology, not merely vertical image height:

```text
soil/root -> trunk -> main branches -> side/upper branches
```

For path `p`, its reveal begins at:

```text
groupTiming[p.group].start + p.delay
```

Reveal along the path with a smooth transition. In the alive state, keep a restrained baseline and periodically boost one trunk/main path rather than replaying every path simultaneously.

## Internal-transmission layer

Z ordering alone changes parallax and z-fighting; it cannot make real camera pixels occlude Three.js content. For convincing internal light, use two virtual layers:

```text
camera
  -> textured relief/shell (normal blending, closer)
  -> Ribbon energy (additive, slightly farther)
  -> target artwork/camera image
```

The shell may be a thin GLB relief with artwork UVs or a target-sized textured mesh. It must align with the same authored coordinate system as the paths.

Generate a packed flow texture from all paths with Canvas 2D:

| Channel | Meaning |
| --- | --- |
| R | normalized arrival time along topology |
| G | feathered path corridor/coverage |
| B | narrow internal vein structure |
| A | opaque data channel |

Paint later arrival segments first so earlier feeding routes win at branch junctions. Use round caps/joins. Convert per-path millimetre width into a scale relative to the group's default corridor width.

In the shell shader:

- discard pixels outside the flow corridor;
- derive revealed/head intensity from the R arrival channel and elapsed time;
- sample the original artwork and its four-neighbour local mean;
- keep bright/convex bark relatively opaque;
- transmit more through dark grooves and local-contrast cracks;
- multiply transmission by the B vein structure;
- use an inverse-facing/Fresnel term so grazing silhouettes do not become neon outlines;
- blend normally and preserve visible bark texture.

The shell is the surface. The Ribbon is the energy reservoir beneath it. If the complete Ribbon outline remains clearly visible, reduce Ribbon halo/body first, then increase ridge opacity or narrow the corridor; do not only push the energy farther back.

## Z and render order

Keep local Ribbon vertices at `z=0` and move the whole energy Group. Do the same for the shell Group. Store global layer values, not per-path Z.

Typical separation is sub-millimetre to a few millimetres depending on physical target scale. Enforce:

```text
shellZ >= energyZ + minimumGap
```

Excessive separation causes camera-dependent parallax. A relief model's own thickness and displacement also contribute; inspect its exported transform and bounds before tuning group Z.

Use explicit render order only as a transparency aid; depth geometry and material blending still need to be coherent.

## Cores and particles

For cores, one plane and one shader per core can combine radial inner kernel, colored middle layer, halo, slow diffusion ring, low-frequency breathing, and phase offset.

For particles, use one `InstancedBufferGeometry` quad mesh. Store initial position, drift, lifetime, phase, color, size, shape, and highlight flag as instance attributes. Compute rise, sway, light Z drift, rotation, screen-size floor, and flicker on the GPU.

## Performance invariants

- Expected draw calls: one per Ribbon path, one per core, one particle mesh, plus shell/model meshes.
- Dispose replaced path geometries immediately after swapping them.
- Rebuild changed Ribbon geometry at most once per animation frame.
- Throttle packed Canvas texture rebuilding during drag (roughly 50-100 ms) and rebuild once on drag end.
- Do not enable shadows, lighting, environment maps, Bloom, or post-processing unless specifically required.
- Cap renderer pixel ratio and frame delta on mobile.
- Test fragment shader precision and derivatives on actual iOS/Android browsers.

## Tuning order and symptoms

| Symptom | Adjustment |
| --- | --- |
| Looks like a neon decal | lower halo/body; strengthen shell ridge opacity; narrow corridor |
| Flow is invisible at distance | widen outer Ribbon/corridor; retain screen-resolved core/head; modestly raise head intensity |
| Thick hard outline nearby | soften body edge; narrow white core; reduce additive halo |
| Glow floats when camera angle changes | reduce total Z/model thickness; fix pose before path points |
| Light ignores branch direction | correct group/delay and arrival map rather than using image Y |
| Junction flashes unnaturally | ensure earlier arrival wins and smooth head timing |
| Mobile fill-rate drops | reduce corridor pixel coverage, shader samples, pixel ratio; particle count is often not the first bottleneck |
