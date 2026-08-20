import * as THREE from "three";
import { CONFIG } from "../config";
import { EXPERIENCE_STATE } from "../experience-state";
import {
  imagePointToWorld,
  imageSizeToWorld,
  smooth01,
} from "../utils/coordinate";

const vertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  precision mediump float;

  uniform float uTime;
  uniform float uOpacity;
  uniform float uIntensity;
  uniform float uPulse;
  uniform float uPhase;
  uniform float uInnerStrength;
  uniform float uMiddleStrength;
  uniform float uHaloStrength;
  uniform float uRingStrength;
  uniform float uRingSpeed;
  uniform vec3 uColor;
  varying vec2 vUv;

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
    vec2 p = (vUv - 0.5) * 2.0;
    float radius = length(p);
    float angle = atan(p.y, p.x);
    float slow = sin(uTime * 0.55 * uPulse + uPhase);
    float slower = sin(uTime * 0.21 + uPhase * 1.73);
    float breath = 1.0 + slow * 0.045 + slower * 0.025;
    float noise = valueNoise(
      vUv * 5.0 + vec2(uTime * 0.035 + uPhase, -uTime * 0.025)
    );
    float swirl = 0.5 + 0.5 * sin(
      angle * 3.0 - uTime * 0.28 + radius * 8.0 + uPhase
    );
    float shapedRadius = radius / breath + (noise - 0.5) * 0.035;

    float inner = 1.0 - smoothstep(0.0, 0.23, shapedRadius);
    inner *= inner;
    float middle = 1.0 - smoothstep(0.12, 0.58, shapedRadius);
    float halo = 1.0 - smoothstep(0.26, 1.0, shapedRadius);
    halo *= halo;

    float ringAge = fract(uTime * uRingSpeed + uPhase * 0.17);
    float ringRadius = mix(0.22, 0.92, ringAge);
    float ringWidth = mix(0.09, 0.035, ringAge);
    float ring = 1.0 - smoothstep(
      ringWidth,
      ringWidth + 0.025,
      abs(shapedRadius - ringRadius)
    );
    ring *= (1.0 - ringAge) * (1.0 - ringAge);

    float textureLight = 0.88 + swirl * 0.06 + noise * 0.1;
    float alpha = (
      inner * uInnerStrength
      + middle * uMiddleStrength
      + halo * uHaloStrength
      + ring * uRingStrength
    ) * textureLight * uOpacity;
    alpha *= 1.0 - smoothstep(0.9, 1.0, radius);

    vec3 warmWhite = vec3(1.0, 0.97, 0.84);
    vec3 color = uColor * (
      middle * uMiddleStrength
      + halo * uHaloStrength
      + ring * uRingStrength * 1.25
    );
    color += warmWhite * inner * uInnerStrength;
    color *= uIntensity * (0.96 + slow * 0.04);

    if (alpha < 0.003) discard;
    gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
  }
`;

export class LifeCoreEffect {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = "LifeCoreGroup";
    this.geometry = new THREE.PlaneGeometry(1, 1);
    this.entries = CONFIG.core.centers.map((definition) => {
      const material = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uOpacity: { value: 0 },
          uIntensity: { value: CONFIG.core.intensity },
          uPulse: { value: CONFIG.core.pulseSpeed },
          uPhase: { value: definition.phase },
          uInnerStrength: { value: CONFIG.core.innerStrength },
          uMiddleStrength: { value: CONFIG.core.middleStrength },
          uHaloStrength: { value: CONFIG.core.haloStrength },
          uRingStrength: { value: CONFIG.core.ringStrength },
          uRingSpeed: { value: CONFIG.core.ringSpeed },
          uColor: { value: new THREE.Color(definition.color) },
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
      const mesh = new THREE.Mesh(this.geometry, material);
      const position = imagePointToWorld(
        definition.center[0],
        definition.center[1],
        CONFIG.layers.core,
      );
      const size = imageSizeToWorld(definition.size[0], definition.size[1]);
      mesh.name = definition.id;
      mesh.position.copy(position);
      mesh.scale.set(
        size.width * CONFIG.core.sizeScale,
        size.height * CONFIG.core.sizeScale,
        1,
      );
      mesh.renderOrder = 2;
      this.group.add(mesh);
      return { material, mesh };
    });
  }

  update(elapsed, state) {
    let opacity = 0;
    let intensity = CONFIG.core.intensity;

    if (state === EXPERIENCE_STATE.AWAKENING) {
      const reveal = smooth01(elapsed / CONFIG.timeline.coreEnd);
      opacity = CONFIG.core.opacity * reveal;
      intensity *= 0.72 + reveal * 0.28;
    } else if (state === EXPERIENCE_STATE.ALIVE) {
      opacity = CONFIG.core.aliveOpacity;
    }

    this.entries.forEach(({ material }) => {
      material.uniforms.uTime.value = elapsed;
      material.uniforms.uOpacity.value = opacity;
      material.uniforms.uIntensity.value = intensity;
    });
  }

  reset() {
    this.update(0, EXPERIENCE_STATE.IDLE);
  }

  dispose() {
    this.entries.forEach(({ material }) => material.dispose());
    this.geometry.dispose();
    this.group.removeFromParent();
  }
}
