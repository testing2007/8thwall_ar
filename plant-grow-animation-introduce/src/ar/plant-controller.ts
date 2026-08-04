import gsap from 'gsap'
import {
  Box3,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Vector3,
} from 'three'

import {COLORS, LAYOUT, PLANT_GLB, TIMING} from './config'
import {PlantAnimationController} from './plant-animation-controller'
import type {TickableController} from './types'

type PlantPartKind = 'stem' | 'branch' | 'leaf' | 'flower' | 'berry' | 'other'

type PlantPart = {
  object: Object3D
  kind: PlantPartKind
  baseScale: Vector3
  basePosition: Vector3
  normalizedHeight: number
}

type AuthoredGrowthControls = {
  playGrowth(): void
  reset(): void
  pause(): void
  resume(): void
}

export class PlantController implements TickableController {
  readonly root: Group
  private parts: PlantPart[] = []
  private animation: PlantAnimationController
  private activeTimeline: gsap.core.Timeline | null = null
  private idleTimelines: gsap.core.Tween[] = []
  private readonly bounds = new Box3()
  private readonly tempPosition = new Vector3()
  private loaded = false

  constructor(
    root: Group,
    private readonly authoredGrowthControls?: AuthoredGrowthControls,
  ) {
    this.root = root
    this.root.name = 'Plant_Growth_Root'
    this.root.scale.setScalar(LAYOUT.plantScale)
    this.animation = new PlantAnimationController(this.root)
  }

  async load() {
    if (this.loaded) return

    this.prepareMaterials()
    this.prepareInteraction()
    this.collectParts()
    this.reset()
    this.loaded = true
  }

  async playGrowth() {
    await this.load()
    this.killActiveAnimation()
    this.root.visible = true

    if (PLANT_GLB.useAuthoredGrowthAnimation && this.authoredGrowthControls) {
      this.parts.forEach((part) => {
        part.object.visible = true
        part.object.position.copy(part.basePosition)
        part.object.scale.copy(part.baseScale)
        this.setOpacity(part.object, 1)
      })
      this.authoredGrowthControls.playGrowth()
      await wait(TIMING.plantGrowthDuration * 1000)
      return
    }

    this.animation.playGrowth()

    const timeline = gsap.timeline()
    this.activeTimeline = timeline

    this.parts.forEach((part, index) => {
      const delay = this.getGrowthDelay(part, index)
      timeline.to(part.object.scale, {
        x: part.baseScale.x,
        y: part.baseScale.y,
        z: part.baseScale.z,
        duration: part.kind === 'stem' || part.kind === 'branch' ? 0.55 : 0.38,
        ease: part.kind === 'leaf' ? 'back.out(1.5)' : 'power2.out',
      }, delay)
      timeline.to(part.object.position, {
        x: part.basePosition.x,
        y: part.basePosition.y,
        z: part.basePosition.z,
        duration: 0.45,
        ease: 'power2.out',
      }, delay)
      this.tweenOpacity(part.object, 1, 0.35, delay)
    })

    await timeline.then()
    this.activeTimeline = null
  }

  playIdle() {
    this.animation.playIdle()
    this.idleTimelines = this.parts
      .filter(part => part.kind === 'leaf' || part.kind === 'flower' || part.kind === 'stem')
      .map((part, index) => gsap.to(part.object.rotation, {
        z: part.object.rotation.z + this.idleAmplitude(part.kind, index),
        duration: 1.8 + (index % 5) * 0.17,
        delay: (index % 7) * 0.06,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
      }))
  }

  async disappearFromTopToBottom() {
    await this.load()
    this.killActiveAnimation()
    this.animation.playDisappear()

    const timeline = gsap.timeline()
    this.activeTimeline = timeline

    this.parts.forEach((part) => {
      const delay = (1 - part.normalizedHeight) * TIMING.disappearWaveDuration
      timeline.to(part.object.scale, {
        x: Math.max(part.baseScale.x * 0.05, 0.001),
        y: Math.max(part.baseScale.y * 0.05, 0.001),
        z: Math.max(part.baseScale.z * 0.05, 0.001),
        duration: part.kind === 'stem' || part.kind === 'branch' ? 0.5 : 0.35,
        ease: 'power2.in',
      }, delay)
      timeline.to(part.object.position, {
        [PLANT_GLB.growthAxis]: axisValue(part.basePosition) - 0.08,
        duration: 0.4,
        ease: 'power2.in',
      }, delay)
      this.tweenOpacity(part.object, 0, 0.35, delay)
    })

    timeline.to(this.root.scale, {
      x: LAYOUT.plantScale * 0.92,
      y: LAYOUT.plantScale * 0.92,
      z: LAYOUT.plantScale * 0.92,
      duration: 0.3,
      ease: 'power2.in',
    }, TIMING.disappearDuration - 0.35)

    await timeline.then()
    this.root.visible = false
    this.activeTimeline = null
  }

  pause() {
    this.animation.pause()
    this.authoredGrowthControls?.pause()
    this.idleTimelines.forEach(tween => tween.pause())
    this.activeTimeline?.pause()
  }

  resume() {
    this.animation.resume()
    this.authoredGrowthControls?.resume()
    this.idleTimelines.forEach(tween => tween.resume())
    this.activeTimeline?.resume()
  }

  reset() {
    this.killActiveAnimation()
    this.animation.reset()
    this.authoredGrowthControls?.reset()
    this.root.visible = false
    this.root.scale.setScalar(LAYOUT.plantScale)

    this.parts.forEach((part) => {
      part.object.visible = true
      part.object.position.copy(part.basePosition)
      if (PLANT_GLB.useAuthoredGrowthAnimation && this.authoredGrowthControls) {
        part.object.scale.copy(part.baseScale)
        this.setOpacity(part.object, 1)
      } else {
        part.object.scale.setScalar(0.001)
        this.setOpacity(part.object, 0)
      }
    })
  }

  update(deltaSeconds: number) {
    this.animation.update(deltaSeconds)
  }

  dispose() {
    this.killActiveAnimation()
  }

  getInteractiveObjects() {
    return this.parts.map(part => part.object)
  }

  getAnimationClipNames() {
    return this.animation.clipNames
  }

  private collectParts() {
    this.parts = []
    this.root.updateWorldMatrix(true, true)
    this.bounds.setFromObject(this.root)
    const minY = axisValue(this.bounds.min)
    const height = Math.max(axisValue(this.bounds.max) - minY, 0.0001)

    this.root.traverse((object) => {
      const mesh = object as Mesh
      if (!mesh.isMesh) return

      object.getWorldPosition(this.tempPosition)
      this.parts.push({
        object,
        kind: this.classifyPart(object.name),
        baseScale: object.scale.clone(),
        basePosition: object.position.clone(),
        normalizedHeight: (axisValue(this.tempPosition) - minY) / height,
      })
    })
  }

  private prepareMaterials() {
    this.root.traverse((object) => {
      const mesh = object as Mesh
      if (!mesh.isMesh) return

      const material = this.clonePlantMaterial(mesh.material, this.classifyPart(object.name))
      material.transparent = true
      material.depthWrite = false
      mesh.material = material
    })
  }

  private prepareInteraction() {
    this.root.traverse((object) => {
      const mesh = object as Mesh
      if (!mesh.isMesh) return
      object.userData.interactionType = 'plant-background'
    })
  }

  private clonePlantMaterial(source: Material | Material[], kind: PlantPartKind) {
    const material = Array.isArray(source) ? source[0]?.clone() : source?.clone()
    if (material instanceof MeshStandardMaterial) {
      material.color.setHex(this.colorForKind(kind))
      material.emissive.setHex(kind === 'flower' ? COLORS.deepBlue : 0x001a12)
      material.emissiveIntensity = kind === 'flower' ? 0.16 : 0.08
      return material
    }

    return new MeshStandardMaterial({
      color: this.colorForKind(kind),
      roughness: 0.74,
      metalness: 0.05,
      transparent: true,
    })
  }

  private getGrowthDelay(part: PlantPart, index: number) {
    if (part.kind === 'stem') return 0.45 + part.normalizedHeight * 0.9
    if (part.kind === 'branch') return 1.1 + part.normalizedHeight * 0.95
    if (part.kind === 'leaf') return 1.7 + (index % 8) * 0.08 + part.normalizedHeight * 0.35
    if (part.kind === 'flower') return 2.8 + (index % 21) * 0.035
    if (part.kind === 'berry') return 3.6 + (index % 8) * 0.045
    return 2 + index * 0.02
  }

  private tweenOpacity(object: Object3D, opacity: number, duration: number, delay: number) {
    const mesh = object as Mesh
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    materials.filter(Boolean).forEach((material) => {
      this.activeTimeline?.to(material, {
        opacity,
        duration,
        ease: opacity > 0 ? 'power2.out' : 'power2.in',
      }, delay)
    })
  }

  private setOpacity(object: Object3D, opacity: number) {
    const mesh = object as Mesh
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    materials.filter(Boolean).forEach((material) => {
      material.opacity = opacity
    })
  }

  private killActiveAnimation() {
    this.activeTimeline?.kill()
    this.activeTimeline = null
    this.idleTimelines.forEach(tween => tween.kill())
    this.idleTimelines = []
  }

  private classifyPart(name: string): PlantPartKind {
    if (name.startsWith('Main_Stem')) return 'stem'
    if (name.startsWith('Branch')) return 'branch'
    if (name.startsWith('Leaf')) return 'leaf'
    if (name.startsWith('Flower')) return 'flower'
    if (name.startsWith('Berry')) return 'berry'
    return 'other'
  }

  private colorForKind(kind: PlantPartKind) {
    if (kind === 'stem' || kind === 'branch') return COLORS.stem
    if (kind === 'leaf') return COLORS.leaf
    if (kind === 'flower') return COLORS.flower
    if (kind === 'berry') return COLORS.berry
    return COLORS.sapphire
  }

  private idleAmplitude(kind: PlantPartKind, index: number) {
    const sign = index % 2 === 0 ? 1 : -1
    if (kind === 'flower') return sign * 0.018
    if (kind === 'leaf') return sign * 0.045
    return sign * 0.02
  }
}

function axisValue(vector: Vector3) {
  return vector[PLANT_GLB.growthAxis]
}

function wait(ms: number) {
  return new Promise<void>(resolve => window.setTimeout(resolve, ms))
}
