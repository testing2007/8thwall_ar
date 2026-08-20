import * as THREE from "three";
import { CONFIG } from "../config";
import { particleZones } from "../data/energy-paths";
import { EXPERIENCE_STATE } from "../experience-state";
import { imagePointToWorld, smooth01 } from "../utils/coordinate";

const vertexShader = `
  attribute vec3 aBase;
  attribute vec3 aMotion;
  attribute vec3 aColor;
  attribute float aLife;
  attribute float aSize;
  attribute float aPhase;
  attribute float aOrder;
  attribute float aShape;
  attribute float aHighlight;

  uniform float uTime;
  uniform float uReveal;
  uniform float uOpacity;
  uniform float uPixelRatio;
  uniform float uMinScreenSize;
  uniform vec2 uViewport;

  varying vec2 vUv;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vShape;
  varying float vHighlight;

  void main() {
    float age = fract(uTime / aLife + aPhase);
    float visibleByOrder = step(aOrder, uReveal);
    float lifeFade = smoothstep(0.0, 0.12, age)
      * (1.0 - smoothstep(0.72, 1.0, age));

    vec3 animated = aBase;
    animated.y += age * aMotion.y;
    animated.x += sin(age * 6.2831853 + aPhase * 13.0) * aMotion.x;
    animated.z += sin(age * 6.2831853 + aPhase * 19.0) * aMotion.z;

    vec4 viewPosition = modelViewMatrix * vec4(animated, 1.0);
    vec4 clipPosition = projectionMatrix * viewPosition;
    float perspectiveScale = clamp(0.48 / max(0.12, -viewPosition.z), 1.0, 1.35);
    float pixelSize = max(aSize, uMinScreenSize) * uPixelRatio * perspectiveScale;

    vec2 shapeScale = vec2(1.0);
    if (aShape > 1.5) {
      shapeScale = vec2(0.42, 1.55);
    } else if (aShape > 0.5) {
      shapeScale = vec2(0.72, 1.15);
    }
    float rotation = aPhase * 12.0 + age * mix(0.55, 1.8, aHighlight);
    float c = cos(rotation);
    float s = sin(rotation);
    vec2 corner = position.xy * shapeScale;
    corner = mat2(c, -s, s, c) * corner;
    vec2 clipOffset = corner * pixelSize * 2.0 / max(uViewport, vec2(1.0));
    clipPosition.xy += clipOffset * clipPosition.w;

    gl_Position = clipPosition;
    vUv = uv;
    vColor = aColor;
    vAlpha = lifeFade * visibleByOrder * uOpacity;
    vShape = aShape;
    vHighlight = aHighlight;
  }
`;

const fragmentShader = `
  precision mediump float;

  varying vec2 vUv;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vShape;
  varying float vHighlight;

  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float radius = length(p);
    float softMask = 1.0 - smoothstep(0.08, 1.0, radius);
    softMask *= softMask;

    float leafWidth = pow(max(0.0, 1.0 - p.y * p.y), 0.72);
    float leafMask = 1.0 - smoothstep(
      leafWidth * 0.46,
      leafWidth * 0.76 + 0.02,
      abs(p.x)
    );
    leafMask *= 1.0 - smoothstep(0.82, 1.0, abs(p.y));

    float streakCore = 1.0 - smoothstep(0.08, 0.72, abs(p.x));
    float streakLength = 1.0 - smoothstep(0.55, 1.0, abs(p.y));
    float streakMask = streakCore * streakLength;

    float mask = softMask;
    if (vShape > 1.5) {
      mask = streakMask;
    } else if (vShape > 0.5) {
      mask = leafMask;
    }

    float centre = 1.0 - smoothstep(0.0, 0.34, radius);
    float alpha = mask * vAlpha * mix(0.84, 1.0, vHighlight);
    vec3 warmWhite = vec3(1.0, 0.97, 0.86);
    vec3 color = mix(vColor, warmWhite, centre * (0.34 + vHighlight * 0.36));
    color *= 0.9 + centre * 0.45 + vHighlight * 0.28;

    if (alpha < 0.003) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

const createRandom = (seed = 0x4c494645) => {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
};

const getParticleCount = () => {
  const memory = Number(globalThis.navigator?.deviceMemory || 0);
  const cores = Number(globalThis.navigator?.hardwareConcurrency || 0);
  if ((memory > 0 && memory <= 4) || (cores > 0 && cores <= 4)) {
    return CONFIG.particles.lowCount;
  }
  if (memory >= 8 && cores >= 8) return CONFIG.particles.highCount;
  return CONFIG.particles.mediumCount;
};

const getPixelRatio = () =>
  Math.min(
    globalThis.devicePixelRatio || 1,
    CONFIG.performance.pixelRatioCap,
  );

const updateViewportUniforms = (uniforms) => {
  const pixelRatio = getPixelRatio();
  const width = Math.max(1, globalThis.innerWidth || 1) * pixelRatio;
  const height = Math.max(1, globalThis.innerHeight || 1) * pixelRatio;
  uniforms.uPixelRatio.value = pixelRatio;
  uniforms.uViewport.value.set(width, height);
};

const pickShape = (sample) => {
  const { soft, leaf } = CONFIG.particles.shapeRatios;
  if (sample < soft) return 0;
  if (sample < soft + leaf) return 1;
  return 2;
};

export class LifeParticlesEffect {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = "LifeParticleGroup";
    const count = getParticleCount();
    const random = createRandom();
    const bases = new Float32Array(count * 3);
    const motions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const lives = new Float32Array(count);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);
    const orders = new Float32Array(count);
    const shapes = new Float32Array(count);
    const highlights = new Float32Array(count);

    for (let index = 0; index < count; index += 1) {
      const zone = particleZones[index % particleZones.length];
      const angle = random() * Math.PI * 2;
      const radius = Math.sqrt(random()) * 0.5;
      const imageX = zone.center[0] + Math.cos(angle) * zone.width * radius;
      const imageY = zone.center[1] + Math.sin(angle) * zone.height * radius;
      const z = THREE.MathUtils.lerp(
        CONFIG.layers.particleMin,
        CONFIG.layers.particleMax,
        random(),
      );
      const base = imagePointToWorld(imageX, imageY, z);
      const color = new THREE.Color(
        zone.colors[Math.floor(random() * zone.colors.length)],
      );
      const highlight = random() < CONFIG.particles.highlightRatio ? 1 : 0;
      const offset = index * 3;
      bases.set([base.x, base.y, base.z], offset);
      motions.set(
        [
          THREE.MathUtils.lerp(0.0025, 0.009, random()),
          THREE.MathUtils.lerp(CONFIG.particles.minRise, CONFIG.particles.maxRise, random()),
          THREE.MathUtils.lerp(0.0015, 0.008, random()),
        ],
        offset,
      );
      colors.set([color.r, color.g, color.b], offset);
      lives[index] = THREE.MathUtils.lerp(
        CONFIG.particles.minLife,
        CONFIG.particles.maxLife,
        random(),
      );
      sizes[index] = highlight
        ? THREE.MathUtils.lerp(
            CONFIG.particles.highlightMinSize,
            CONFIG.particles.highlightMaxSize,
            random(),
          )
        : THREE.MathUtils.lerp(
            CONFIG.particles.minSize,
            CONFIG.particles.maxSize,
            random(),
          );
      phases[index] = random();
      orders[index] = index / Math.max(1, count - 1);
      shapes[index] = pickShape(random());
      highlights[index] = highlight;
    }

    this.geometry = new THREE.InstancedBufferGeometry();
    this.geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(
        new Float32Array([
          -0.5, -0.5, 0,
          0.5, -0.5, 0,
          0.5, 0.5, 0,
          -0.5, 0.5, 0,
        ]),
        3,
      ),
    );
    this.geometry.setAttribute(
      "uv",
      new THREE.BufferAttribute(
        new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
        2,
      ),
    );
    this.geometry.setIndex([0, 1, 2, 0, 2, 3]);
    this.geometry.setAttribute("aBase", new THREE.InstancedBufferAttribute(bases, 3));
    this.geometry.setAttribute("aMotion", new THREE.InstancedBufferAttribute(motions, 3));
    this.geometry.setAttribute("aColor", new THREE.InstancedBufferAttribute(colors, 3));
    this.geometry.setAttribute("aLife", new THREE.InstancedBufferAttribute(lives, 1));
    this.geometry.setAttribute("aSize", new THREE.InstancedBufferAttribute(sizes, 1));
    this.geometry.setAttribute("aPhase", new THREE.InstancedBufferAttribute(phases, 1));
    this.geometry.setAttribute("aOrder", new THREE.InstancedBufferAttribute(orders, 1));
    this.geometry.setAttribute("aShape", new THREE.InstancedBufferAttribute(shapes, 1));
    this.geometry.setAttribute(
      "aHighlight",
      new THREE.InstancedBufferAttribute(highlights, 1),
    );
    this.geometry.instanceCount = count;

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uReveal: { value: 0 },
        uOpacity: { value: 0 },
        uPixelRatio: { value: getPixelRatio() },
        uMinScreenSize: { value: CONFIG.particles.minScreenSize },
        uViewport: { value: new THREE.Vector2(1, 1) },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    updateViewportUniforms(this.material.uniforms);
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.name = "LifeParticleInstances";
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    this.group.add(this.mesh);
  }

  update(elapsed, state) {
    let reveal = 0;
    let opacity = 0;
    if (state === EXPERIENCE_STATE.AWAKENING) {
      reveal = smooth01(
        (elapsed - 3.5) / (CONFIG.timeline.particlesEnd - 3.5),
      );
      opacity = CONFIG.particles.opacity * reveal;
    } else if (state === EXPERIENCE_STATE.ALIVE) {
      reveal = 1;
      opacity = CONFIG.particles.opacity;
    }
    this.material.uniforms.uTime.value = elapsed;
    this.material.uniforms.uReveal.value = reveal;
    this.material.uniforms.uOpacity.value = opacity;
    updateViewportUniforms(this.material.uniforms);
  }

  reset() {
    this.update(0, EXPERIENCE_STATE.IDLE);
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.group.removeFromParent();
  }
}
