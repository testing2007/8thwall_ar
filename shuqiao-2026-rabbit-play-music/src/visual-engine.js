import * as THREE from 'three'
import {TARGET_IMAGE_URL, TONES, TONE_ORDER, clamp} from './tones'

const MAX_PARTICLES = 220
const MAX_RINGS = 12
let sharedTexturePromise = null

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uTexture;
  uniform float uTime;
  uniform vec3 uImpulseA;
  uniform vec2 uImpulseB;
  uniform vec3 uWorldA;
  uniform vec2 uWorldB;
  uniform float uHarmony;

  float gauss(vec2 p, vec2 c, float r) {
    vec2 d = p - c;
    return exp(-dot(d, d) / (r * r));
  }

  float ring(vec2 p, vec2 c, float radius, float width) {
    return smoothstep(width, 0.0, abs(length(p - c) - radius));
  }

  void main() {
    vec2 p = vUv;
    vec2 uv = p;
    float gong = uImpulseA.x + uWorldA.x * 0.16;
    float shang = uImpulseA.y + uWorldA.y * 0.14;
    float jue = uImpulseA.z + uWorldA.z * 0.14;
    float zhi = uImpulseB.x + uWorldB.x * 0.13;
    float yu = uImpulseB.y + uWorldB.y * 0.15;
    vec2 rabbitCenter = vec2(0.43, 0.50);
    float rabbitMask = gauss(p, rabbitCenter, 0.28);

    uv.y += gong * rabbitMask * 0.035;
    uv.x = mix(
      uv.x,
      rabbitCenter.x + (uv.x - rabbitCenter.x) * (0.965 + 0.035 * (1.0 - gong)),
      clamp(gong * rabbitMask, 0.0, 1.0)
    );
    uv.x += shang * rabbitMask * (0.025 * sin((p.y - rabbitCenter.y) * 46.0 + uTime * 17.0) + 0.014);

    vec2 jueDelta = p - rabbitCenter;
    float jueAngle = jue * rabbitMask * 0.12;
    float jueCos = cos(jueAngle);
    float jueSin = sin(jueAngle);
    vec2 jueRotated = mat2(jueCos, -jueSin, jueSin, jueCos) * jueDelta;
    uv += jueRotated - jueDelta;
    uv.y -= jue * rabbitMask * 0.038;

    vec2 zhiDelta = p - rabbitCenter;
    float zhiLength = length(zhiDelta) + 0.0001;
    uv += zhi * rabbitMask * (zhiDelta / zhiLength) * (0.035 + 0.012 * sin(uTime * 28.0));

    float lowerClouds = smoothstep(0.36, 0.92, p.y);
    uv.x += yu * (0.005 + 0.010 * lowerClouds) * sin(p.y * 34.0 - uTime * 5.0);
    uv.y += yu * 0.006 * sin(p.x * 28.0 + uTime * 3.5);

    float cloudMask = smoothstep(0.42, 0.98, p.y) * (1.0 - gauss(p, rabbitCenter, 0.18));
    uv.x += cloudMask * (
      gong * 0.004 * sin(uTime * 2.0 + p.y * 18.0) +
      shang * 0.018 +
      jue * 0.006 * sin(uTime * 3.0) +
      zhi * 0.025 * sin(uTime * 8.0 + p.y * 20.0) +
      yu * 0.018 * sin(uTime * 2.3 + p.y * 14.0)
    );
    uv.y += cloudMask * (gong * 0.010 - jue * 0.010 - zhi * 0.012 * sin(uTime * 6.0 + p.x * 14.0));
    uv = clamp(uv, vec2(0.002), vec2(0.998));

    vec3 color = texture2D(uTexture, uv).rgb;
    float halo = gauss(p, vec2(0.39, 0.48), 0.40);
    color += halo * (
      gong * vec3(0.12, 0.075, 0.015) +
      shang * vec3(0.11) +
      jue * vec3(0.015, 0.10, 0.045) +
      zhi * vec3(0.22, 0.025, 0.006) +
      yu * vec3(0.012, 0.06, 0.13)
    );

    float radius = fract(uTime * 0.22);
    float wave = ring(p, rabbitCenter, radius * 0.70, 0.018);
    color += wave * (
      shang * 0.45 * vec3(1.0, 0.92, 0.68) +
      zhi * 0.33 * vec3(1.0, 0.16, 0.04) +
      yu * 0.20 * vec3(0.20, 0.60, 1.0)
    );

    float harmonyPulse = 0.72 + 0.28 * sin(uTime * 3.2);
    float harmonyHalo = gauss(p, rabbitCenter, 0.52);
    float harmonyRing = ring(p, rabbitCenter, 0.30 + 0.035 * sin(uTime * 2.4), 0.018);
    color += uHarmony * harmonyPulse * harmonyHalo * vec3(0.18, 0.105, 0.025);
    color += uHarmony * harmonyRing * vec3(0.72, 0.43, 0.12);

    color *= 1.0 + gong * 0.05 + shang * 0.04 + jue * 0.04 + zhi * 0.13 + yu * 0.03;
    color += jue * vec3(-0.018, 0.025, 0.005) + zhi * vec3(0.035, -0.008, -0.012) + yu * vec3(-0.012, 0.005, 0.026);

    float edgeX = smoothstep(0.0, 0.018, p.x) * smoothstep(0.0, 0.018, 1.0 - p.x);
    float edgeY = smoothstep(0.0, 0.018, p.y) * smoothstep(0.0, 0.018, 1.0 - p.y);
    gl_FragColor = vec4(color, edgeX * edgeY);
  }
`

export const loadSharedTargetTexture = () => {
  if (sharedTexturePromise) return sharedTexturePromise
  sharedTexturePromise = new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(
      TARGET_IMAGE_URL,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace
        texture.minFilter = THREE.LinearFilter
        texture.magFilter = THREE.LinearFilter
        texture.generateMipmaps = true
        resolve(texture)
      },
      undefined,
      reject,
    )
  }).catch((error) => {
    sharedTexturePromise = null
    throw error
  })
  return sharedTexturePromise
}

export const getTargetLayout = (targetData) => {
  const p = targetData?.properties || {}
  const rotated = Boolean(p.isRotated)
  const fullWidthPx = rotated ? p.originalHeight : p.originalWidth
  const fullHeightPx = rotated ? p.originalWidth : p.originalHeight
  const cropWidthPx = rotated ? p.height : p.width
  const cropHeightPx = rotated ? p.width : p.height
  const cropLeftPx = rotated ? p.top : p.left
  const cropTopPx = rotated ? p.left : p.top
  const safeCropWidth = Math.max(1, cropWidthPx || fullWidthPx || 722)
  const safeFullWidth = Math.max(1, fullWidthPx || 722)
  const safeFullHeight = Math.max(1, fullHeightPx || 514)
  const safeCropHeight = Math.max(1, cropHeightPx || safeFullHeight)
  const cropLeft = Number(cropLeftPx) || 0
  const cropTop = Number(cropTopPx) || 0

  return {
    width: safeFullWidth / safeCropWidth,
    height: safeFullHeight / safeCropWidth,
    offsetX: (safeFullWidth / 2 - (cropLeft + safeCropWidth / 2)) / safeCropWidth,
    offsetY: -(safeFullHeight / 2 - (cropTop + safeCropHeight / 2)) / safeCropWidth,
  }
}

const makeUniforms = texture => ({
  uTexture: {value: texture},
  uTime: {value: 0},
  uImpulseA: {value: new THREE.Vector3()},
  uImpulseB: {value: new THREE.Vector2()},
  uWorldA: {value: new THREE.Vector3()},
  uWorldB: {value: new THREE.Vector2()},
  uHarmony: {value: 0},
})

export class MoonRabbitVisual {
  constructor({texture, targetData}) {
    this.layout = getTargetLayout(targetData)
    this.texture = texture.clone()
    this.texture.needsUpdate = true
    this.root = new THREE.Group()
    this.root.name = 'moon-rabbit-target-visual'
    this.content = new THREE.Group()
    this.content.position.set(this.layout.offsetX, this.layout.offsetY, 0.0015)
    this.root.add(this.content)

    this.uniforms = makeUniforms(this.texture)
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    })
    this.planeGeometry = new THREE.PlaneGeometry(this.layout.width, this.layout.height, 1, 1)
    this.plane = new THREE.Mesh(this.planeGeometry, this.material)
    this.plane.renderOrder = 1
    this.content.add(this.plane)

    this.impulses = Object.fromEntries(TONE_ORDER.map(tone => [tone, []]))
    this.world = Object.fromEntries(TONE_ORDER.map(tone => [tone, 0]))
    this.harmonyTarget = 0
    this.particles = []
    this.ringCursor = 0
    this.lastUpdateTime = performance.now() / 1000

    this.createParticles()
    this.createRings()

    this.renderer = null
    this.camera = null
    this.scene = null
    this.canvas = null
    this.animationFrame = 0
    this.resizeObserver = null
  }

  createParticles() {
    this.particlePositions = new Float32Array(MAX_PARTICLES * 3)
    this.particleColors = new Float32Array(MAX_PARTICLES * 3)
    this.particleGeometry = new THREE.BufferGeometry()
    this.particleGeometry.setAttribute('position', new THREE.BufferAttribute(this.particlePositions, 3))
    this.particleGeometry.setAttribute('color', new THREE.BufferAttribute(this.particleColors, 3))
    this.particleGeometry.setDrawRange(0, 0)
    this.particleMaterial = new THREE.PointsMaterial({
      size: 0.018,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.82,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    })
    this.particlePoints = new THREE.Points(this.particleGeometry, this.particleMaterial)
    this.particlePoints.position.z = 0.004
    this.particlePoints.renderOrder = 3
    this.content.add(this.particlePoints)
  }

  createRings() {
    this.rings = []
    const geometry = new THREE.RingGeometry(0.94, 1, 64)
    for (let index = 0; index < MAX_RINGS; index += 1) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.visible = false
      mesh.position.set(this.rabbitX, this.rabbitY, 0.003)
      mesh.renderOrder = 2
      this.content.add(mesh)
      this.rings.push({mesh, life: 0, max: 0, speed: 0})
    }
    this.ringGeometry = geometry
  }

  get rabbitX() {
    return (0.43 - 0.5) * this.layout.width
  }

  get rabbitY() {
    return (0.5 - 0.50) * this.layout.height
  }

  trigger(tone) {
    if (!TONES[tone]) return
    const now = performance.now() / 1000
    this.impulses[tone].push(now)
    this.world[tone] = clamp(this.world[tone] + 0.22, 0, 1)
    this.spawnRing(tone)
    this.spawnParticles(tone)
  }

  spawnRing(tone) {
    const ring = this.rings[this.ringCursor % this.rings.length]
    this.ringCursor += 1
    ring.life = 0
    ring.max = tone === 'zhi' ? 1 : 0.78
    ring.speed = tone === 'zhi' ? 0.34 : 0.25
    ring.mesh.visible = true
    ring.mesh.scale.setScalar(0.012)
    ring.mesh.position.set(this.rabbitX, this.rabbitY, 0.003)
    ring.mesh.material.color.setHex(TONES[tone].color)
    ring.mesh.material.opacity = 0.72
  }

  spawnParticles(tone) {
    const count = tone === 'zhi' ? 76 : tone === 'jue' ? 42 : tone === 'shang' ? 30 : 24
    const baseSpeed = tone === 'zhi' ? 0.18 : tone === 'jue' ? 0.12 : 0.085
    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * Math.PI * 2
      const speed = baseSpeed * (0.35 + Math.random())
      let vx = Math.cos(angle) * speed
      let vy = Math.sin(angle) * speed
      if (tone === 'gong') { vy = -Math.abs(vy) * 0.7; vx *= 0.45 }
      if (tone === 'jue') { vy = Math.abs(vy) * 1.2; vx *= 0.55 }
      if (tone === 'shang') { vx = (Math.random() > 0.5 ? 1 : -1) * (0.10 + Math.random() * 0.12); vy *= 0.25 }
      if (tone === 'yu') { vx = 0.04 + Math.random() * 0.09; vy *= 0.3 }
      const particle = {
        x: this.rabbitX + (Math.random() - 0.5) * 0.10,
        y: this.rabbitY + (Math.random() - 0.5) * 0.07,
        vx,
        vy,
        life: 0,
        max: 0.55 + Math.random() * 0.7,
        tone,
      }
      if (this.particles.length >= MAX_PARTICLES) this.particles.shift()
      this.particles.push(particle)
    }
  }

  setHarmony(active) {
    this.harmonyTarget = active ? 1 : 0
    if (active) {
      for (const tone of TONE_ORDER) this.spawnParticles(tone)
      this.spawnRing('gong')
      this.spawnRing('zhi')
    }
  }

  reset() {
    for (const tone of TONE_ORDER) {
      this.impulses[tone] = []
      this.world[tone] = 0
    }
    this.particles = []
    this.harmonyTarget = 0
    this.uniforms.uHarmony.value = 0
    for (const ring of this.rings) ring.mesh.visible = false
    this.particleGeometry.setDrawRange(0, 0)
    this.updateWorldUniforms()
  }

  updateWorldUniforms() {
    this.uniforms.uWorldA.value.set(this.world.gong, this.world.shang, this.world.jue)
    this.uniforms.uWorldB.value.set(this.world.zhi, this.world.yu)
  }

  update(timeSeconds = performance.now() / 1000) {
    const dt = Math.min(0.05, Math.max(0, timeSeconds - this.lastUpdateTime))
    this.lastUpdateTime = timeSeconds
    this.uniforms.uTime.value = timeSeconds

    const values = {}
    for (const tone of TONE_ORDER) {
      const duration = TONES[tone].duration
      let value = 0
      this.impulses[tone] = this.impulses[tone].filter(start => timeSeconds - start < duration + 0.1)
      for (const start of this.impulses[tone]) {
        const x = (timeSeconds - start) / duration
        if (x < 0 || x > 1) continue
        const envelope = x < 0.1 ? x / 0.1 : Math.pow(1 - (x - 0.1) / 0.9, 2)
        value = Math.min(1.35, value + envelope)
      }
      values[tone] = value
    }
    this.uniforms.uImpulseA.value.set(values.gong, values.shang, values.jue)
    this.uniforms.uImpulseB.value.set(values.zhi, values.yu)
    this.updateWorldUniforms()
    this.uniforms.uHarmony.value += (this.harmonyTarget - this.uniforms.uHarmony.value) * Math.min(1, dt * 3.2)

    this.updateParticles(dt)
    this.updateRings(dt)
  }

  updateParticles(dt) {
    this.particles = this.particles.filter(particle => {
      particle.life += dt
      return particle.life < particle.max
    })
    for (let index = 0; index < this.particles.length; index += 1) {
      const particle = this.particles[index]
      const fade = 1 - particle.life / particle.max
      particle.x += particle.vx * dt
      particle.y += particle.vy * dt
      particle.vx *= 0.985
      particle.vy *= 0.985
      if (particle.tone === 'gong') particle.vy -= 0.05 * dt
      if (particle.tone === 'jue') particle.vy += 0.02 * dt
      const offset = index * 3
      const rgb = TONES[particle.tone].rgb
      this.particlePositions[offset] = particle.x
      this.particlePositions[offset + 1] = particle.y
      this.particlePositions[offset + 2] = 0
      this.particleColors[offset] = rgb[0] * fade
      this.particleColors[offset + 1] = rgb[1] * fade
      this.particleColors[offset + 2] = rgb[2] * fade
    }
    this.particleGeometry.setDrawRange(0, this.particles.length)
    this.particleGeometry.attributes.position.needsUpdate = true
    this.particleGeometry.attributes.color.needsUpdate = true
  }

  updateRings(dt) {
    for (const ring of this.rings) {
      if (!ring.mesh.visible) continue
      ring.life += dt
      if (ring.life >= ring.max) {
        ring.mesh.visible = false
        continue
      }
      const fade = 1 - ring.life / ring.max
      const radius = 0.012 + ring.life * ring.speed
      ring.mesh.scale.setScalar(radius)
      ring.mesh.material.opacity = fade * 0.62
    }
  }

  mount(canvas) {
    this.canvas = canvas
    this.scene = new THREE.Scene()
    this.scene.add(this.root)
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 10)
    this.camera.position.z = 2
    this.renderer = new THREE.WebGLRenderer({canvas, alpha: true, antialias: true, powerPreference: 'high-performance'})
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    const resize = () => this.resizeStandalone()
    if (window.ResizeObserver) {
      this.resizeObserver = new ResizeObserver(resize)
      this.resizeObserver.observe(canvas)
    } else {
      this.resizeFallback = resize
      window.addEventListener('resize', resize)
    }
    resize()

    const loop = (timeMs) => {
      if (!this.renderer) return
      this.update(timeMs / 1000)
      this.renderer.render(this.scene, this.camera)
      this.animationFrame = requestAnimationFrame(loop)
    }
    this.animationFrame = requestAnimationFrame(loop)
  }

  resizeStandalone() {
    if (!this.renderer || !this.camera || !this.canvas) return
    const rect = this.canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    this.renderer.setSize(rect.width, rect.height, false)
    const canvasAspect = rect.width / rect.height
    const imageAspect = this.layout.width / this.layout.height
    let viewWidth = this.layout.width
    let viewHeight = this.layout.height
    if (canvasAspect > imageAspect) viewWidth = viewHeight * canvasAspect
    else viewHeight = viewWidth / canvasAspect
    this.camera.left = -viewWidth / 2
    this.camera.right = viewWidth / 2
    this.camera.top = viewHeight / 2
    this.camera.bottom = -viewHeight / 2
    this.camera.updateProjectionMatrix()
  }

  dispose() {
    cancelAnimationFrame(this.animationFrame)
    this.resizeObserver?.disconnect()
    if (this.resizeFallback) window.removeEventListener('resize', this.resizeFallback)
    this.renderer?.dispose()
    this.renderer?.forceContextLoss?.()
    this.material.dispose()
    this.texture.dispose()
    this.planeGeometry.dispose()
    this.particleGeometry.dispose()
    this.particleMaterial.dispose()
    this.ringGeometry.dispose()
    for (const ring of this.rings) ring.mesh.material.dispose()
    this.root.removeFromParent()
    this.renderer = null
  }
}
