import gsap from 'gsap'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  RingGeometry,
  SphereGeometry,
} from 'three'

import {COLORS} from './config'
import {disposeObjectTree} from './resource-disposer'
import type {TickableController} from './types'

export class ParticleController implements TickableController {
  readonly energyRoot = new Group()
  readonly ambientRoot = new Group()
  private glow: Mesh
  private ring: Mesh
  private particles: Points
  private timeline: gsap.core.Timeline | null = null

  constructor() {
    this.energyRoot.name = 'EnergyEffectRoot'
    this.ambientRoot.name = 'AmbientParticles'

    this.glow = this.createGlow()
    this.ring = this.createRing()
    this.particles = this.createParticles()

    this.energyRoot.add(this.glow, this.ring)
    this.ambientRoot.add(this.particles)
    this.reset()
  }

  async playIntroEnergy() {
    this.timeline?.kill()
    this.energyRoot.visible = true
    this.ambientRoot.visible = true

    this.timeline = gsap.timeline()
    this.timeline
      .to(this.glow.scale, {x: 1, y: 1, z: 1, duration: 0.45, ease: 'power2.out'}, 0.1)
      .to((this.glow.material as MeshBasicMaterial), {opacity: 0.78, duration: 0.3}, 0.1)
      .to(this.ring.scale, {x: 2.2, y: 2.2, z: 2.2, duration: 0.9, ease: 'power2.out'}, 0.3)
      .to((this.ring.material as MeshBasicMaterial), {opacity: 0, duration: 0.85, ease: 'power1.out'}, 0.35)
      .to((this.particles.material as PointsMaterial), {opacity: 0.8, duration: 0.8}, 0.65)

    await this.timeline.then()
    this.timeline = null
  }

  async hideEnergy() {
    this.timeline?.kill()
    this.timeline = gsap.timeline()
      .to((this.glow.material as MeshBasicMaterial), {opacity: 0, duration: 0.3, ease: 'power2.in'}, 0)
      .to((this.particles.material as PointsMaterial), {opacity: 0, duration: 0.3, ease: 'power2.in'}, 0)

    await this.timeline.then()
    this.reset()
  }

  pause() {
    this.timeline?.pause()
  }

  resume() {
    this.timeline?.resume()
  }

  reset() {
    this.energyRoot.visible = false
    this.ambientRoot.visible = false
    this.glow.scale.setScalar(0.001)
    this.ring.scale.setScalar(0.001)
    ;(this.glow.material as MeshBasicMaterial).opacity = 0
    ;(this.ring.material as MeshBasicMaterial).opacity = 0.9
    ;(this.particles.material as PointsMaterial).opacity = 0
  }

  update(deltaSeconds: number, elapsedSeconds: number) {
    if (!this.ambientRoot.visible) return

    this.particles.rotation.z += deltaSeconds * 0.08
    this.particles.position.y = 0.05 + Math.sin(elapsedSeconds * 0.9) * 0.01
  }

  dispose() {
    this.timeline?.kill()
    disposeObjectTree(this.energyRoot)
    disposeObjectTree(this.ambientRoot)
  }

  private createGlow() {
    const geometry = new SphereGeometry(0.12, 24, 12)
    const material = new MeshBasicMaterial({
      color: COLORS.sapphire,
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false,
    })
    const mesh = new Mesh(geometry, material)
    mesh.name = 'SapphireGlow'
    mesh.position.set(0, 0.02, 0.01)
    mesh.scale.setScalar(0.001)
    return mesh
  }

  private createRing() {
    const geometry = new RingGeometry(0.08, 0.085, 48)
    const material = new MeshBasicMaterial({
      color: COLORS.sapphire,
      transparent: true,
      opacity: 0.9,
      blending: AdditiveBlending,
      side: 2,
      depthWrite: false,
    })
    const mesh = new Mesh(geometry, material)
    mesh.name = 'EnergyRing'
    mesh.position.set(0, 0.02, 0.018)
    return mesh
  }

  private createParticles() {
    const count = 96
    const positions = new Float32Array(count * 3)
    const color = new Color(COLORS.sapphire)

    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2
      const radius = 0.08 + ((i * 17) % 100) / 100 * 0.36
      positions[i * 3] = Math.cos(angle) * radius
      positions[i * 3 + 1] = ((i * 29) % 100) / 100 * 0.9
      positions[i * 3 + 2] = Math.sin(angle) * radius * 0.12 + 0.02
    }

    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(positions, 3))
    const material = new PointsMaterial({
      color,
      size: 0.012,
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false,
    })
    const points = new Points(geometry, material)
    points.name = 'PlantParticles'
    return points
  }
}
