import * as ecs from '@8thwall/ecs'
import type {Group, Object3D} from 'three'
import type {World} from '@8thwall/ecs'

import {PLANT_GLB} from './config'

export class AssetLoader {
  constructor(
    private readonly world: World,
    private readonly anchorEid: ecs.Eid,
    private readonly anchorObject: Object3D,
  ) {}

  pauseStudioGltfAnimation() {
    const modelEid = this.getGltfModelEid()
    if (!modelEid) return

    ecs.GltfModel.mutate(this.world, modelEid, (cursor) => {
      cursor.paused = true
      cursor.loop = false
      cursor.animationClip = PLANT_GLB.fallbackGrowClip
      cursor.time = 0
      cursor.timeScale = 1
    })
  }

  playStudioGrowthAnimation() {
    const modelEid = this.getGltfModelEid()
    if (!modelEid) return

    // Step 1 (sync): park at a tiny non-zero time so the ECS component
    // registers a real delta when we seek back to 0 on step 2.
    // Without this, the ECS diff system may skip the time=0 write on replay
    // because it sees no change from the previous reset value.
    ecs.GltfModel.mutate(this.world, modelEid, (cursor) => {
      cursor.paused = true
      cursor.loop = false
      cursor.animationClip = PLANT_GLB.fallbackGrowClip
      cursor.timeScale = 1
      cursor.time = 0.001
    })

    // Step 2 (next frame): seek to true start and begin playing.
    window.requestAnimationFrame(() => {
      const mid = this.getGltfModelEid()
      if (!mid) return
      ecs.GltfModel.mutate(this.world, mid, (cursor) => {
        cursor.time = 0
        cursor.paused = false
      })
    })
  }

  resetStudioGrowthAnimation() {
    const modelEid = this.getGltfModelEid()
    if (!modelEid) return

    // Reset to time=0 in a paused state so the NEXT play() sees a real delta.
    ecs.GltfModel.mutate(this.world, modelEid, (cursor) => {
      cursor.paused = true
      cursor.loop = false
      cursor.animationClip = PLANT_GLB.fallbackGrowClip
      cursor.timeScale = 0   // ← deliberately 0 so next reset to 1 is a change
      cursor.time = 0
    })
  }

  pauseStudioGrowthAnimation() {
    const modelEid = this.getGltfModelEid()
    if (!modelEid) return

    ecs.GltfModel.mutate(this.world, modelEid, (cursor) => {
      cursor.paused = true
    })
  }

  resumeStudioGrowthAnimation() {
    const modelEid = this.getGltfModelEid()
    if (!modelEid) return

    ecs.GltfModel.mutate(this.world, modelEid, (cursor) => {
      cursor.paused = false
    })
  }

  async waitForPlantRoot(timeoutMs = 5000): Promise<Group> {
    const immediate = this.findPlantRoot()
    if (immediate) return immediate

    return new Promise((resolve, reject) => {
      let settled = false
      let animationFrame = 0
      const timeout = window.setTimeout(() => {
        if (settled) return
        settled = true
        cleanup()
        reject(new Error(`Unable to find ${PLANT_GLB.rootName} under Image Target`))
      }, timeoutMs)

      const tryResolve = () => {
        const root = this.findPlantRoot()
        if (!root || settled) return
        settled = true
        cleanup()
        resolve(root)
      }

      const poll = () => {
        tryResolve()
        if (!settled) animationFrame = window.requestAnimationFrame(poll)
      }

      const cleanup = () => {
        window.clearTimeout(timeout)
        window.cancelAnimationFrame(animationFrame)
        this.world.events.removeListener(this.world.events.globalId, ecs.events.GLTF_MODEL_LOADED, tryResolve)
      }

      this.world.events.addListener(this.world.events.globalId, ecs.events.GLTF_MODEL_LOADED, tryResolve)
      poll()
    })
  }

  private findPlantRoot() {
    let root: Group | null = null

    this.anchorObject.traverse((object) => {
      if (root) return
      if (object.name === PLANT_GLB.rootName) {
        root = object as Group
      }
    })

    return root
  }

  private getGltfModelEid() {
    return this.findGltfModelChild(this.anchorEid)
  }

  private findGltfModelChild(eid: ecs.Eid): ecs.Eid | null {
    if (ecs.GltfModel.has(this.world, eid)) return eid

    for (const childEid of this.world.getChildren(eid)) {
      const found = this.findGltfModelChild(childEid)
      if (found) return found
    }

    return null
  }
}
