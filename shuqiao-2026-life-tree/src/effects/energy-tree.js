import * as THREE from "three";
import { CONFIG } from "../config";
import { energyPaths } from "../data/energy-paths";
import { EXPERIENCE_STATE } from "../experience-state";
import { imagePointToWorld, smooth01 } from "../utils/coordinate";
import { createPlanarRibbonGeometry } from "../utils/ribbon-geometry";

const groupTimings = Object.freeze({
  root: { start: 1.5, duration: 0.8 },
  trunk: { start: 1.95, duration: 1.0 },
  "main-branch": { start: 2.55, duration: 1.25 },
  "side-branch": { start: 3.25, duration: 1.25 },
});

const vertexShader = `
  attribute float aSide;
  attribute float aDistance;

  varying float vAcross;
  varying float vAlong;
  varying float vDistance;

  void main() {
    vAcross = aSide;
    vAlong = uv.x;
    vDistance = aDistance;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  precision mediump float;

  uniform float uTime;
  uniform float uReveal;
  uniform float uSpeed;
  uniform float uSeed;
  uniform float uBoost;
  uniform float uCoreRatio;
  uniform float uCoreStrength;
  uniform float uBodyStrength;
  uniform float uHaloStrength;
  uniform float uFilamentCount;
  uniform float uNoiseStrength;
  uniform float uNoiseFrequency;
  uniform float uHeadLength;
  uniform vec3 uColorA;
  uniform vec3 uColorB;

  varying float vAcross;
  varying float vAlong;
  varying float vDistance;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }

  void main() {
    float across = abs(vAcross);
    float edgeAa = max(fwidth(across), 0.003);
    float flow = uTime * uSpeed;
    float coarse = valueNoise(vec2(
      vDistance * uNoiseFrequency - flow * 1.8,
      uSeed * 19.0 + uTime * 0.08
    ));
    float detail = valueNoise(vec2(
      vDistance * uNoiseFrequency * 2.17 + flow * 2.4,
      vAcross * 2.7 + uSeed * 37.0
    ));
    float noise = coarse * 0.68 + detail * 0.32;
    float warpedAcross = across + (noise - 0.5) * 0.1 * uNoiseStrength * (0.3 + across);

    float coreMask = 1.0 - smoothstep(
      uCoreRatio - edgeAa,
      uCoreRatio + edgeAa,
      warpedAcross
    );
    float bodyEdge = 0.54 + (coarse - 0.5) * 0.12 * uNoiseStrength;
    float bodyMask = 1.0 - smoothstep(bodyEdge - edgeAa, bodyEdge + edgeAa, warpedAcross);
    float haloMask = 1.0 - smoothstep(0.42, 1.0, warpedAcross);
    haloMask *= haloMask;

    float lane = (vAcross * 0.5 + 0.5) * uFilamentCount;
    lane += sin(vDistance * 38.0 - flow * 8.0 + uSeed * 6.2831853) * 0.18;
    float laneDistance = abs(fract(lane) - 0.5) * 2.0;
    float laneFootprint = fwidth(lane);
    float resolvedFilament = 1.0 - smoothstep(
      0.12 + laneFootprint,
      0.38 + laneFootprint,
      laneDistance
    );
    float resolve = 1.0 - smoothstep(0.12, 0.7, laneFootprint);
    float filaments = mix(0.28, resolvedFilament, resolve) * bodyMask;
    filaments *= 0.55 + noise * 0.65;

    float headPosition = fract(flow + uSeed);
    float headDistance = abs(vAlong - headPosition);
    headDistance = min(headDistance, 1.0 - headDistance);
    float head = 1.0 - smoothstep(0.0, uHeadLength, headDistance);
    head *= head;
    float echoPosition = fract(headPosition - 0.17);
    float echoDistance = abs(vAlong - echoPosition);
    echoDistance = min(echoDistance, 1.0 - echoDistance);
    float echo = 1.0 - smoothstep(0.0, uHeadLength * 1.8, echoDistance);

    float reveal = 1.0 - smoothstep(uReveal, uReveal + 0.025, vAlong);
    float caps = smoothstep(0.0, 0.035, vAlong)
      * (1.0 - smoothstep(0.965, 1.0, vAlong));
    float visible = reveal * caps;

    float replay = uBoost * (0.55 + head * 0.75);
    float coreAlpha = coreMask * (uCoreStrength + head * 0.36 + replay * 0.45);
    float bodyAlpha = bodyMask * (uBodyStrength + replay * 0.22);
    float filamentAlpha = filaments * (uBodyStrength * 0.72 + replay * 0.24);
    float haloAlpha = haloMask * (uHaloStrength + head * 0.08 + replay * 0.12);
    float alpha = clamp(
      (coreAlpha + bodyAlpha + filamentAlpha + haloAlpha) * visible,
      0.0,
      1.0
    );

    vec3 pathColor = mix(uColorA, uColorB, smoothstep(0.0, 1.0, vAlong));
    vec3 hotColor = mix(pathColor, vec3(1.0, 0.97, 0.82), 0.86);
    vec3 color = pathColor * (0.55 + haloMask * 0.3 + bodyMask * 0.35);
    color = mix(color, hotColor, clamp(coreMask * 0.9 + filaments * 0.24, 0.0, 1.0));
    color *= 0.92 + head * 1.35 + echo * 0.32 + replay * 0.75;

    if (alpha < 0.003) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

const seededValue = (index) => {
  const value = Math.sin(index * 91.733 + 17.171) * 43758.5453;
  return value - Math.floor(value);
};

const getLayerStrengths = (settle) => {
  const awakening = CONFIG.energy.awakeningStrength;
  const alive = CONFIG.energy.aliveStrength;
  return {
    core: THREE.MathUtils.lerp(awakening.core, alive.core, settle),
    body: THREE.MathUtils.lerp(awakening.body, alive.body, settle),
    halo: THREE.MathUtils.lerp(awakening.halo, alive.halo, settle),
  };
};

export class EnergyTreeEffect {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = "EnergyTreeGroup";
    this.entries = energyPaths.map((definition, index) => {
      const points = definition.points.map(([x, y]) =>
        imagePointToWorld(x, y, CONFIG.layers.energy),
      );
      const curve = new THREE.CatmullRomCurve3(points, false, "centripetal", 0.4);
      const widthScale = CONFIG.energy.groupWidthScale[definition.group] || 1;
      const outerWidth = CONFIG.energy.outerWidth * widthScale;
      const segments = THREE.MathUtils.clamp(points.length * 10, 40, 72);
      const geometry = createPlanarRibbonGeometry(curve, outerWidth, segments);
      const material = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uReveal: { value: 0 },
          uSpeed: { value: CONFIG.energy.speed * (0.88 + seededValue(index) * 0.24) },
          uSeed: { value: seededValue(index + 31) },
          uBoost: { value: 0 },
          uCoreRatio: {
            value: THREE.MathUtils.clamp(CONFIG.energy.coreWidth / outerWidth, 0.08, 0.42),
          },
          uCoreStrength: { value: 0 },
          uBodyStrength: { value: 0 },
          uHaloStrength: { value: 0 },
          uFilamentCount: { value: CONFIG.energy.filamentCount },
          uNoiseStrength: { value: CONFIG.energy.noiseStrength },
          uNoiseFrequency: { value: CONFIG.energy.noiseFrequency },
          uHeadLength: { value: CONFIG.energy.headLength },
          uColorA: { value: new THREE.Color(definition.colors[0]) },
          uColorB: { value: new THREE.Color(definition.colors[1]) },
        },
        vertexShader,
        fragmentShader,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthTest: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
        extensions: { derivatives: true },
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = definition.id;
      mesh.renderOrder = 3;
      this.group.add(mesh);
      return { definition, curve, geometry, material, mesh };
    });

    this.mainEntryIndices = this.entries
      .map(({ definition }, index) =>
        definition.group === "trunk" || definition.group === "main-branch"
          ? index
          : -1,
      )
      .filter((index) => index >= 0);
    this.pulseCounter = 0;
    this.pulseIndex = -1;
    this.pulseStartedAt = -Infinity;
    this.nextPulseAt = null;
  }

  schedulePulse(elapsed) {
    const random = seededValue(this.pulseCounter + 101);
    const mainIndex = Math.floor(random * this.mainEntryIndices.length)
      % this.mainEntryIndices.length;
    this.pulseIndex = this.mainEntryIndices[mainIndex];
    this.pulseStartedAt = elapsed;
    this.pulseCounter += 1;
    const intervalRandom = seededValue(this.pulseCounter + 211);
    this.nextPulseAt =
      elapsed +
      THREE.MathUtils.lerp(
        CONFIG.energy.pulseMinSeconds,
        CONFIG.energy.pulseMaxSeconds,
        intervalRandom,
      );
  }

  update(elapsed, state) {
    const isAlive = state === EXPERIENCE_STATE.ALIVE;
    if (isAlive && this.nextPulseAt === null) {
      this.nextPulseAt = elapsed + CONFIG.energy.pulseMinSeconds;
    }
    if (isAlive && elapsed >= this.nextPulseAt) this.schedulePulse(elapsed);

    const pulseAge = elapsed - this.pulseStartedAt;
    const pulseAmount =
      pulseAge >= 0 && pulseAge < CONFIG.energy.pulseDuration
        ? Math.sin((pulseAge / CONFIG.energy.pulseDuration) * Math.PI) * 0.86
        : 0;

    this.entries.forEach((entry, index) => {
      const { definition, material } = entry;
      let reveal = 0;
      let strengths = { core: 0, body: 0, halo: 0 };

      if (state === EXPERIENCE_STATE.AWAKENING) {
        const timing = groupTimings[definition.group];
        reveal = smooth01((elapsed - timing.start - definition.delay) / timing.duration);
        const settle = smooth01(
          (elapsed - CONFIG.timeline.energyEnd) /
            (CONFIG.timeline.awakeningEnd - CONFIG.timeline.energyEnd),
        );
        strengths = getLayerStrengths(settle);
      } else if (isAlive) {
        reveal = 1;
        strengths = CONFIG.energy.aliveStrength;
      }

      material.uniforms.uTime.value = elapsed;
      material.uniforms.uReveal.value = reveal;
      material.uniforms.uCoreStrength.value = strengths.core;
      material.uniforms.uBodyStrength.value = strengths.body;
      material.uniforms.uHaloStrength.value = strengths.halo;
      material.uniforms.uBoost.value = index === this.pulseIndex ? pulseAmount : 0;
    });
  }

  reset() {
    this.pulseCounter = 0;
    this.pulseIndex = -1;
    this.pulseStartedAt = -Infinity;
    this.nextPulseAt = null;
    this.update(0, EXPERIENCE_STATE.IDLE);
  }

  dispose() {
    this.entries.forEach(({ geometry, material }) => {
      geometry.dispose();
      material.dispose();
    });
    this.group.removeFromParent();
  }
}
