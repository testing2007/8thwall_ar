import * as THREE from "three";

const PERFORMANCE_DURATION_SECONDS = 8;
const GOLD_PARTICLE_COUNT = 150;
const HELIX_POINT_COUNT = 96;
const SNOWFLAKE_COUNT = 20;
const STAR_BURST_COUNT = 10;

const clamp01 = value => Math.min(Math.max(value, 0), 1);
const rangeProgress = (time, start, end) => clamp01((time - start) / (end - start));
const easeOutCubic = value => 1 - ((1 - value) ** 3);
const smoothstep = value => value * value * (3 - (2 * value));

const createRandom = (seed = 814) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

const createCanvasTexture = (size, draw) => {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  draw(context, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
};

const createGlowTexture = () => createCanvasTexture(64, (context, size) => {
  const gradient = context.createRadialGradient(
    size / 2, size / 2, 0,
    size / 2, size / 2, size / 2,
  );
  gradient.addColorStop(0, "rgba(255,255,235,1)");
  gradient.addColorStop(0.16, "rgba(255,225,118,.95)");
  gradient.addColorStop(0.48, "rgba(255,179,35,.42)");
  gradient.addColorStop(1, "rgba(255,145,0,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
});

const createSnowTexture = () => createCanvasTexture(64, (context, size) => {
  context.translate(size / 2, size / 2);
  context.strokeStyle = "rgba(255,255,255,.96)";
  context.lineWidth = 3;
  context.lineCap = "round";
  for (let arm = 0; arm < 6; arm += 1) {
    context.save();
    context.rotate((arm * Math.PI) / 3);
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(0, -23);
    context.moveTo(0, -13);
    context.lineTo(-6, -18);
    context.moveTo(0, -13);
    context.lineTo(6, -18);
    context.stroke();
    context.restore();
  }
});

const createStarTexture = () => createCanvasTexture(128, (context, size) => {
  const center = size / 2;
  const gradient = context.createRadialGradient(center, center, 0, center, center, center);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.12, "rgba(255,229,143,.96)");
  gradient.addColorStop(0.42, "rgba(255,185,48,.34)");
  gradient.addColorStop(1, "rgba(255,160,0,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  context.save();
  context.translate(center, center);
  context.fillStyle = "rgba(255,250,220,.96)";
  context.beginPath();
  for (let i = 0; i < 16; i += 1) {
    const angle = (i * Math.PI) / 8;
    const radius = i % 2 === 0 ? 45 : 7;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
  context.fill();
  context.restore();
});

const createPoints = (positions, material) => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return new THREE.Points(geometry, material);
};

export const createSantaParticleFx = ({ bounds, onComplete }) => {
  const random = createRandom();
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const unit = Math.max(size.x, size.y, size.z);
  const bottom = bounds.min.y + (size.y * 0.05);
  const top = bounds.max.y - (size.y * 0.04);
  const front = bounds.max.z + (size.z * 0.08);
  const radius = Math.max(size.x * 0.34, unit * 0.12);

  const group = new THREE.Group();
  group.name = "santa-fx-group";
  group.visible = false;
  group.renderOrder = 20;

  const glowTexture = createGlowTexture();
  const snowTexture = createSnowTexture();
  const starTexture = createStarTexture();

  const helixPositions = [];
  for (let i = 0; i < HELIX_POINT_COUNT; i += 1) {
    const t = i / (HELIX_POINT_COUNT - 1);
    const angle = (t * Math.PI * 6.2) - (Math.PI / 2);
    const taper = 0.82 + (Math.sin(t * Math.PI) * 0.18);
    helixPositions.push(
      center.x + (Math.cos(angle) * radius * taper),
      bottom + ((top - bottom) * t),
      front + (Math.sin(angle) * radius * 0.24),
    );
  }
  const helixMaterial = new THREE.PointsMaterial({
    map: glowTexture,
    color: 0xffc94f,
    size: unit * 0.045,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const helix = createPoints(helixPositions, helixMaterial);
  helix.geometry.setDrawRange(0, 0);
  group.add(helix);

  const goldPositions = [];
  const goldSeeds = [];
  for (let i = 0; i < GOLD_PARTICLE_COUNT; i += 1) {
    const angle = random() * Math.PI * 2;
    const localRadius = radius * (0.18 + (random() * 1.05));
    const y = bottom + (random() * (top - bottom));
    goldPositions.push(
      center.x + (Math.cos(angle) * localRadius),
      y,
      front + (Math.sin(angle) * localRadius * 0.32),
    );
    goldSeeds.push(random(), random(), random());
  }
  const goldMaterial = helixMaterial.clone();
  goldMaterial.size = unit * 0.026;
  const goldParticles = createPoints(goldPositions, goldMaterial);
  group.add(goldParticles);

  const snowPositions = [];
  const snowSeeds = [];
  for (let i = 0; i < SNOWFLAKE_COUNT; i += 1) {
    snowPositions.push(center.x, center.y, front);
    snowSeeds.push(random(), random(), random(), random());
  }
  const snowMaterial = new THREE.PointsMaterial({
    map: snowTexture,
    color: 0xffffff,
    size: unit * 0.055,
    transparent: true,
    opacity: 0,
    alphaTest: 0.03,
    depthWrite: false,
  });
  const snowflakes = createPoints(snowPositions, snowMaterial);
  group.add(snowflakes);

  const baseGlowMaterial = new THREE.SpriteMaterial({
    map: glowTexture,
    color: 0xffb52d,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const baseGlow = new THREE.Sprite(baseGlowMaterial);
  baseGlow.position.set(center.x, bottom, front);
  baseGlow.scale.set(unit * 0.42, unit * 0.22, 1);
  group.add(baseGlow);

  const giftGlowMaterial = baseGlowMaterial.clone();
  const giftGlow = new THREE.Sprite(giftGlowMaterial);
  giftGlow.position.set(center.x, center.y + (size.y * 0.02), front + (size.z * 0.04));
  giftGlow.scale.setScalar(unit * 0.34);
  group.add(giftGlow);

  const starBursts = [];
  for (let i = 0; i < STAR_BURST_COUNT; i += 1) {
    const angle = ((i / STAR_BURST_COUNT) * Math.PI * 2) + (random() * 0.45);
    const starMaterial = new THREE.SpriteMaterial({
      map: starTexture,
      color: i % 3 === 0 ? 0xffffff : 0xffd16a,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const star = new THREE.Sprite(starMaterial);
    star.position.set(
      center.x + (Math.cos(angle) * radius * (0.75 + (random() * 0.48))),
      center.y + ((random() - 0.35) * size.y * 0.58),
      front + (random() * size.z * 0.1),
    );
    star.userData.phase = random();
    star.userData.baseScale = unit * (0.08 + (random() * 0.06));
    star.scale.setScalar(star.userData.baseScale);
    starBursts.push(star);
    group.add(star);
  }

  let elapsed = 0;
  let playing = false;
  let completed = false;

  const reset = () => {
    elapsed = 0;
    playing = false;
    completed = false;
    group.visible = false;
    helix.geometry.setDrawRange(0, 0);
    helixMaterial.opacity = 0;
    goldMaterial.opacity = 0;
    snowMaterial.opacity = 0;
    baseGlowMaterial.opacity = 0;
    giftGlowMaterial.opacity = 0;
    starBursts.forEach(star => { star.material.opacity = 0; });
  };

  const play = () => {
    reset();
    playing = true;
    group.visible = true;
  };

  const updateGoldParticles = (time) => {
    const positions = goldParticles.geometry.attributes.position.array;
    const rise = rangeProgress(time, 0, 5);
    for (let i = 0; i < GOLD_PARTICLE_COUNT; i += 1) {
      const offset = i * 3;
      const seedOffset = i * 3;
      const drift = Math.sin((time * 2.1) + (goldSeeds[seedOffset] * Math.PI * 2));
      positions[offset] += drift * unit * 0.0007;
      positions[offset + 1] += unit * (0.00045 + (goldSeeds[seedOffset + 1] * 0.00075));
      if (positions[offset + 1] > top) positions[offset + 1] = bottom;
      positions[offset + 2] += Math.cos((time * 1.7) + goldSeeds[seedOffset + 2]) * unit * 0.00025;
    }
    goldParticles.geometry.attributes.position.needsUpdate = true;
    goldMaterial.opacity = smoothstep(rangeProgress(time, 0, 0.8)) * (1 - (rangeProgress(time, 7.5, 8) * 0.55));
    goldParticles.rotation.y = rise * 0.22;
  };

  const updateSnow = (time) => {
    const positions = snowflakes.geometry.attributes.position.array;
    const spread = easeOutCubic(rangeProgress(time, 0.8, 1.8));
    const expansion = 1 + (easeOutCubic(rangeProgress(time, 3.5, 5)) * 0.85);
    for (let i = 0; i < SNOWFLAKE_COUNT; i += 1) {
      const offset = i * 3;
      const seedOffset = i * 4;
      const angle = (snowSeeds[seedOffset] * Math.PI * 2) + (time * (0.35 + snowSeeds[seedOffset + 1] * 0.45));
      const orbit = radius * (0.45 + snowSeeds[seedOffset + 2] * 0.95) * spread * expansion;
      const fall = ((snowSeeds[seedOffset + 3] + (time * 0.13)) % 1);
      positions[offset] = center.x + (Math.cos(angle) * orbit);
      positions[offset + 1] = top - (fall * (top - bottom));
      positions[offset + 2] = front + (Math.sin(angle) * orbit * 0.22);
    }
    snowflakes.geometry.attributes.position.needsUpdate = true;
    snowMaterial.opacity = smoothstep(rangeProgress(time, 0.8, 1.5)) * (1 - (rangeProgress(time, 7.5, 8) * 0.35));
    snowflakes.rotation.z = time * 0.08;
  };

  const update = (deltaSeconds) => {
    if (!playing) return;
    elapsed = Math.min(elapsed + deltaSeconds, PERFORMANCE_DURATION_SECONDS);

    const baseEntrance = easeOutCubic(rangeProgress(elapsed, 0, 0.8));
    baseGlowMaterial.opacity = baseEntrance * (0.62 + (Math.sin(elapsed * 9) * 0.12));
    baseGlow.scale.set(
      unit * (0.32 + (baseEntrance * 0.18)),
      unit * (0.16 + (baseEntrance * 0.1)),
      1,
    );

    const helixProgress = easeOutCubic(rangeProgress(elapsed, 0.8, 1.8));
    helix.geometry.setDrawRange(0, Math.ceil(HELIX_POINT_COUNT * helixProgress));
    helixMaterial.opacity = Math.min(helixProgress * 1.15, 0.95) * (1 - (rangeProgress(elapsed, 5, 7.5) * 0.55));
    helix.rotation.y = elapsed * 0.38;

    updateGoldParticles(elapsed);
    updateSnow(elapsed);

    const burstEnvelope = Math.sin(rangeProgress(elapsed, 2, 3.5) * Math.PI);
    const finalEnvelope = Math.sin(rangeProgress(elapsed, 7.5, 8) * Math.PI);
    starBursts.forEach((star, index) => {
      const twinkle = 0.35 + (Math.sin((elapsed * 10) + (star.userData.phase * Math.PI * 2)) * 0.35);
      const stagger = rangeProgress(elapsed, 2 + (index * 0.045), 2.45 + (index * 0.045));
      star.material.opacity = clamp01((burstEnvelope * stagger * (0.55 + twinkle)) + finalEnvelope);
      const scale = star.userData.baseScale * (0.75 + (star.material.opacity * 1.25));
      star.scale.setScalar(scale);
      star.material.rotation = elapsed * (index % 2 === 0 ? 0.45 : -0.38);
    });

    const giftPulse = Math.sin(rangeProgress(elapsed, 3.5, 5) * Math.PI);
    giftGlowMaterial.opacity = clamp01(giftPulse * 0.92);
    giftGlow.scale.setScalar(unit * (0.28 + (giftPulse * 0.2)));

    if (elapsed >= PERFORMANCE_DURATION_SECONDS && !completed) {
      completed = true;
      playing = false;
      onComplete?.();
    }
  };

  reset();
  return { group, play, reset, update };
};
