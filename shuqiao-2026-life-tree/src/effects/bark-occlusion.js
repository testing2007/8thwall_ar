import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import treeModelUrl from "../assets/tree.glb";
import { CONFIG } from "../config";
import { energyPaths } from "../data/energy-paths";
import { EXPERIENCE_STATE } from "../experience-state";

const vertexShader = `
  varying vec2 vUv;
  varying vec3 vViewNormal;
  varying vec3 vViewDirection;

  void main() {
    vUv = uv;
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vViewNormal = normalize(normalMatrix * normal);
    vViewDirection = normalize(-viewPosition.xyz);
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const fragmentShader = `
  precision mediump float;

  uniform sampler2D uArtwork;
  uniform sampler2D uFlowMap;
  uniform vec2 uArtworkTexel;
  uniform float uElapsed;
  uniform float uState;
  uniform float uMaxArrival;
  uniform float uHeadDuration;
  uniform float uAwakeningIntensity;
  uniform float uAliveIntensity;
  uniform float uRidgeOpacity;
  uniform float uGrooveOpacity;

  varying vec2 vUv;
  varying vec3 vViewNormal;
  varying vec3 vViewDirection;

  float luminance(vec3 color) {
    return dot(color, vec3(0.2126, 0.7152, 0.0722));
  }

  void main() {
    vec4 flow = texture2D(uFlowMap, vUv);
    float corridor = flow.g;
    if (corridor < 0.004 || uState < 0.5) discard;

    float arrival = flow.r * uMaxArrival;
    float vein = flow.b;
    vec4 artwork = texture2D(uArtwork, vUv);
    float centre = luminance(artwork.rgb);
    float localMean = (
      luminance(texture2D(uArtwork, vUv + vec2(uArtworkTexel.x, 0.0)).rgb)
      + luminance(texture2D(uArtwork, vUv - vec2(uArtworkTexel.x, 0.0)).rgb)
      + luminance(texture2D(uArtwork, vUv + vec2(0.0, uArtworkTexel.y)).rgb)
      + luminance(texture2D(uArtwork, vUv - vec2(0.0, uArtworkTexel.y)).rgb)
    ) * 0.25;
    float contrast = clamp(abs(centre - localMean) * 6.5, 0.0, 1.0);

    float awakening = 1.0 - step(1.5, uState);
    float alive = step(1.5, uState);
    float revealed = smoothstep(arrival - 0.10, arrival + 0.08, uElapsed);
    revealed = mix(revealed, 1.0, alive);
    float head = 1.0 - smoothstep(
      0.0,
      uHeadDuration,
      abs(uElapsed - arrival)
    );
    head *= head * awakening;
    float aliveWave = pow(
      0.5 + 0.5 * sin(uElapsed * 2.05 - arrival * 5.2),
      5.0
    ) * alive;

    // Convex bark remains opaque. Dark grooves and high local contrast let the
    // lower Ribbon layer show through, creating a subsurface rather than decal look.
    float ridge = smoothstep(0.13, 0.62, centre);
    ridge = clamp(ridge * 0.82 + contrast * 0.20, 0.0, 1.0);
    float surfaceOpacity = mix(uGrooveOpacity, uRidgeOpacity, ridge);

    // Inverse Fresnel: front-facing relief transmits light, grazing silhouettes do not glow.
    float facing = abs(dot(normalize(vViewNormal), normalize(vViewDirection)));
    float interiorFacing = smoothstep(0.18, 0.88, facing);
    float organicBreakup = 0.54 + contrast * 0.50 + (1.0 - ridge) * 0.24;
    float veinStructure = clamp(vein * 0.82 + corridor * 0.18, 0.0, 1.0);
    float intensity = mix(uAwakeningIntensity, uAliveIntensity, alive);
    float transmission = revealed * (
      0.23 + head * 1.25 + aliveWave * 0.48
    );
    transmission *= veinStructure * organicBreakup * interiorFacing * intensity;

    vec3 amber = vec3(1.0, 0.56, 0.16);
    vec3 nutrientGold = vec3(1.0, 0.90, 0.53);
    vec3 lightColor = mix(amber, nutrientGold, clamp(vein + head * 0.45, 0.0, 1.0));
    vec3 surfaceColor = artwork.rgb + lightColor * transmission;
    float alpha = corridor * max(surfaceOpacity, transmission * 0.32);

    if (alpha < 0.004) discard;
    gl_FragColor = vec4(surfaceColor, clamp(alpha, 0.0, 0.96));
    #include <colorspace_fragment>
  }
`;

const clonePath = (path) => ({
  id: path.id,
  group: path.group,
  delay: Number(path.delay) || 0,
  widthMm: Number(path.widthMm) || null,
  points: path.points.map(([x, y]) => [Number(x), Number(y)]),
});

const createCanvas = (width, height) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

const createPixelCurve = (path, scaleX, scaleY) => {
  const points = path.points.map(
    ([x, y]) => new THREE.Vector3(x * scaleX, y * scaleY, 0),
  );
  return new THREE.CatmullRomCurve3(points, false, "centripetal", 0.4);
};

const strokeCurve = (context, curve, width, alpha) => {
  const samples = curve.getPoints(96);
  context.beginPath();
  context.moveTo(samples[0].x, samples[0].y);
  for (let index = 1; index < samples.length; index += 1) {
    context.lineTo(samples[index].x, samples[index].y);
  }
  context.lineWidth = width;
  context.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
  context.stroke();
};

const disposeMaterial = (material, retainedTextures = new Set()) => {
  if (!material) return;
  Object.values(material).forEach((value) => {
    if (value?.isTexture && !retainedTextures.has(value)) value.dispose();
  });
  material.dispose();
};

/**
 * Packed flow texture: R = arrival time, G = bark corridor, B = nutrient vein.
 * The GLB relief acts as a real shell over the lower Ribbon energy layer.
 */
export class BarkOcclusionEffect {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = "TreeReliefOcclusionGroup";
    this.group.position.z = CONFIG.layers.bark;
    this.paths = new Map(
      energyPaths.map((path) => [path.id, clonePath(path)]),
    );
    this.materials = [];
    this.geometries = new Set();
    this.artworkTextures = new Set();
    this.lastRebuildAt = -Infinity;
    this.rebuildTimer = null;
    this.disposed = false;
    this.elapsed = 0;
    this.state = EXPERIENCE_STATE.IDLE;

    const width = CONFIG.internalFlow.textureWidth;
    const height = Math.round(
      width * CONFIG.puzzle.imageHeight / CONFIG.puzzle.imageWidth,
    );
    this.flowCanvas = createCanvas(width, height);
    this.arrivalCanvas = createCanvas(width, height);
    this.coverageCanvas = createCanvas(width, height);
    this.veinCanvas = createCanvas(width, height);
    this.flowTexture = new THREE.CanvasTexture(this.flowCanvas);
    this.flowTexture.name = "LifeTreePackedInternalFlow";
    this.flowTexture.colorSpace = THREE.NoColorSpace;
    this.flowTexture.flipY = false;
    this.flowTexture.generateMipmaps = false;
    this.flowTexture.minFilter = THREE.LinearFilter;
    this.flowTexture.magFilter = THREE.LinearFilter;
    this.flowTexture.wrapS = THREE.ClampToEdgeWrapping;
    this.flowTexture.wrapT = THREE.ClampToEdgeWrapping;
    this.rebuildCoverage();
    this.loadModel();
  }

  loadModel() {
    this.loader = new GLTFLoader();
    this.loader.load(
      treeModelUrl,
      (gltf) => this.installModel(gltf.scene),
      undefined,
      (error) => {
        if (this.disposed) return;
        console.warn("[Life Tree] Relief GLB failed to load:", error);
      },
    );
  }

  installModel(model) {
    if (this.disposed) {
      model.traverse((child) => {
        if (!child.isMesh) return;
        child.geometry?.dispose();
        const materials = Array.isArray(child.material)
          ? child.material
          : [child.material];
        materials.forEach((material) => disposeMaterial(material));
      });
      return;
    }

    model.name = "LifeTreeReliefModel";
    model.traverse((child) => {
      if (!child.isMesh) return;
      const sourceMaterials = Array.isArray(child.material)
        ? child.material
        : [child.material];
      const sourceMaterial = sourceMaterials[0];
      const artwork = sourceMaterial?.map;
      if (!artwork) {
        child.visible = false;
        console.warn("[Life Tree] Relief mesh has no artwork texture:", child.name);
        return;
      }
      artwork.colorSpace = THREE.SRGBColorSpace;
      this.artworkTextures.add(artwork);
      const material = this.createReliefMaterial(artwork);
      sourceMaterials.forEach((item) => disposeMaterial(item, this.artworkTextures));
      child.material = material;
      child.renderOrder = 4;
      this.materials.push(material);
      this.geometries.add(child.geometry);
    });
    this.model = model;
    this.group.add(model);
    this.update(this.elapsed, this.state);
  }

  createReliefMaterial(artwork) {
    const imageWidth = artwork.image?.width || CONFIG.puzzle.imageWidth;
    const imageHeight = artwork.image?.height || CONFIG.puzzle.imageHeight;
    return new THREE.ShaderMaterial({
      uniforms: {
        uArtwork: { value: artwork },
        uFlowMap: { value: this.flowTexture },
        uArtworkTexel: {
          value: new THREE.Vector2(1 / imageWidth, 1 / imageHeight),
        },
        uElapsed: { value: this.elapsed },
        uState: { value: 0 },
        uMaxArrival: { value: CONFIG.internalFlow.maxArrivalSeconds },
        uHeadDuration: { value: CONFIG.internalFlow.headDuration },
        uAwakeningIntensity: {
          value: CONFIG.internalFlow.awakeningIntensity,
        },
        uAliveIntensity: { value: CONFIG.internalFlow.aliveIntensity },
        uRidgeOpacity: { value: CONFIG.internalFlow.ridgeOpacity },
        uGrooveOpacity: { value: CONFIG.internalFlow.grooveOpacity },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      blending: THREE.NormalBlending,
      depthTest: true,
      depthWrite: false,
      side: THREE.FrontSide,
      toneMapped: false,
    });
  }

  setPathPoints(id, points) {
    const path = this.paths.get(id);
    if (!path || !Array.isArray(points) || points.length < 2) return;
    path.points = points.map(([x, y]) => [Number(x), Number(y)]);
    this.scheduleCoverageRebuild();
  }

  addPath(definition) {
    if (!definition?.id || !Array.isArray(definition.points) || definition.points.length < 2) {
      return;
    }
    const path = clonePath(definition);
    this.paths.set(path.id, path);
    this.scheduleCoverageRebuild();
  }

  removePath(id) {
    if (!this.paths.delete(id)) return;
    this.scheduleCoverageRebuild();
  }

  syncPaths(paths) {
    const ids = new Set(paths.map((path) => String(path.id)));
    [...this.paths.keys()].forEach((id) => {
      if (!ids.has(id)) this.paths.delete(id);
    });
    paths.forEach((path) => {
      if (Array.isArray(path.points) && path.points.length >= 2) {
        this.paths.set(String(path.id), clonePath(path));
      }
    });
    this.scheduleCoverageRebuild();
  }

  setPathWidth(id, widthMm) {
    const path = this.paths.get(id);
    const width = Number(widthMm);
    if (!path || !Number.isFinite(width) || width <= 0) return;
    path.widthMm = width;
    this.scheduleCoverageRebuild();
  }

  setLayerZ(zMetres) {
    if (!Number.isFinite(zMetres)) return;
    this.group.position.z = zMetres;
  }

  scheduleCoverageRebuild() {
    if (this.disposed) return;
    const now = performance.now();
    const throttle = CONFIG.barkOcclusion.rebuildThrottleMs;
    const remaining = throttle - (now - this.lastRebuildAt);
    if (remaining <= 0) {
      this.rebuildCoverage();
      return;
    }
    if (this.rebuildTimer !== null) return;
    this.rebuildTimer = setTimeout(() => {
      this.rebuildTimer = null;
      this.rebuildCoverage();
    }, remaining);
  }

  rebuildCoverage() {
    if (this.disposed || !this.flowCanvas) return;
    if (this.rebuildTimer !== null) clearTimeout(this.rebuildTimer);
    this.rebuildTimer = null;
    const width = this.flowCanvas.width;
    const height = this.flowCanvas.height;
    const scaleX = width / CONFIG.puzzle.imageWidth;
    const scaleY = height / CONFIG.puzzle.imageHeight;
    const widthScale = (scaleX + scaleY) * 0.5;
    const arrivalContext = this.arrivalCanvas.getContext("2d");
    const coverageContext = this.coverageCanvas.getContext("2d");
    const veinContext = this.veinCanvas.getContext("2d");
    [arrivalContext, coverageContext, veinContext].forEach((context) => {
      context.clearRect(0, 0, width, height);
      context.lineCap = "round";
      context.lineJoin = "round";
    });

    const segments = [];
    this.paths.forEach((path) => {
      const curve = createPixelCurve(path, scaleX, scaleY);
      const groupScale = CONFIG.energy.groupWidthScale[path.group] || 1;
      const defaultWidthMm = CONFIG.energy.outerWidth * groupScale * 1000;
      const customScale = Number.isFinite(path.widthMm)
        ? path.widthMm / defaultWidthMm
        : 1;
      const corridor =
        (CONFIG.internalFlow.corridorWidths[path.group] || 22) *
        customScale * widthScale;
      const vein =
        (CONFIG.internalFlow.veinWidths[path.group] || 6) *
        Math.sqrt(customScale) * widthScale;
      const feather = CONFIG.internalFlow.featherPixels * widthScale;
      strokeCurve(coverageContext, curve, corridor + feather * 2, 0.18);
      strokeCurve(coverageContext, curve, corridor + feather, 0.48);
      strokeCurve(coverageContext, curve, corridor, 1);
      strokeCurve(veinContext, curve, vein + feather * 0.7, 0.24);
      strokeCurve(veinContext, curve, vein, 1);

      const points = curve.getPoints(112);
      const timing = CONFIG.energy.sequence[path.group];
      for (let index = 1; index < points.length; index += 1) {
        const progress = index / (points.length - 1);
        segments.push({
          from: points[index - 1],
          to: points[index],
          width: corridor + feather * 2.2,
          arrival: timing.start + path.delay + timing.duration * progress,
        });
      }
    });

    // Paint late arrivals first so the earlier feeding path wins at junctions.
    segments.sort((a, b) => b.arrival - a.arrival);
    segments.forEach((segment) => {
      const encoded = Math.max(
        1,
        Math.min(
          255,
          Math.round(
            segment.arrival / CONFIG.internalFlow.maxArrivalSeconds * 255,
          ),
        ),
      );
      arrivalContext.beginPath();
      arrivalContext.moveTo(segment.from.x, segment.from.y);
      arrivalContext.lineTo(segment.to.x, segment.to.y);
      arrivalContext.lineWidth = segment.width;
      arrivalContext.strokeStyle = `rgb(${encoded}, ${encoded}, ${encoded})`;
      arrivalContext.stroke();
    });

    const arrivalPixels = arrivalContext.getImageData(0, 0, width, height).data;
    const coveragePixels = coverageContext.getImageData(0, 0, width, height).data;
    const veinPixels = veinContext.getImageData(0, 0, width, height).data;
    const flowContext = this.flowCanvas.getContext("2d");
    const packed = flowContext.createImageData(width, height);
    for (let offset = 0; offset < packed.data.length; offset += 4) {
      packed.data[offset] = arrivalPixels[offset + 3]
        ? arrivalPixels[offset]
        : 255;
      packed.data[offset + 1] = coveragePixels[offset + 3];
      packed.data[offset + 2] = veinPixels[offset + 3];
      packed.data[offset + 3] = 255;
    }
    flowContext.putImageData(packed, 0, 0);
    this.flowTexture.needsUpdate = true;
    this.lastRebuildAt = performance.now();
  }

  update(elapsed, state) {
    this.elapsed = elapsed;
    this.state = state;
    const stateValue = state === EXPERIENCE_STATE.AWAKENING
      ? 1
      : state === EXPERIENCE_STATE.ALIVE
        ? 2
        : 0;
    this.materials.forEach((material) => {
      material.uniforms.uElapsed.value = elapsed;
      material.uniforms.uState.value = stateValue;
    });
  }

  reset() {
    this.update(0, EXPERIENCE_STATE.IDLE);
  }

  dispose() {
    this.disposed = true;
    if (this.rebuildTimer !== null) clearTimeout(this.rebuildTimer);
    this.rebuildTimer = null;
    this.materials.forEach((material) => material.dispose());
    this.geometries.forEach((geometry) => geometry.dispose());
    this.artworkTextures.forEach((texture) => texture.dispose());
    this.flowTexture.dispose();
    this.group.removeFromParent();
    this.materials.length = 0;
    this.geometries.clear();
    this.artworkTextures.clear();
    this.model = null;
    this.loader = null;
    this.flowCanvas = null;
    this.arrivalCanvas = null;
    this.coverageCanvas = null;
    this.veinCanvas = null;
  }
}
