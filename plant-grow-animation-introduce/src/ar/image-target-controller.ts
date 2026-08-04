import * as ecs from '@8thwall/ecs'
import type {World} from '@8thwall/ecs'

import {TIMING} from './config'

type TargetCallbacks = {
  onFound(): void
  onLostStable(): void
}

export class ImageTargetController {
  private lostTimer = 0
  private visible = false
  private readonly onFound = () => this.handleFound()
  private readonly onUpdated = () => this.handleFound()
  private readonly onLost = () => this.handleLost()

  constructor(
    private readonly world: World,
    private readonly targetEid: ecs.Eid,
    private readonly callbacks: TargetCallbacks,
  ) {
    this.world.events.addListener(this.targetEid, ecs.events.REALITY_IMAGE_FOUND, this.onFound)
    this.world.events.addListener(this.targetEid, ecs.events.REALITY_IMAGE_UPDATED, this.onUpdated)
    this.world.events.addListener(this.targetEid, ecs.events.REALITY_IMAGE_LOST, this.onLost)
    this.world.events.addListener(this.world.events.globalId, ecs.events.REALITY_IMAGE_FOUND, this.onFound)
    this.world.events.addListener(this.world.events.globalId, ecs.events.REALITY_IMAGE_UPDATED, this.onUpdated)
    this.world.events.addListener(this.world.events.globalId, ecs.events.REALITY_IMAGE_LOST, this.onLost)
  }

  dispose() {
    this.world.events.removeListener(this.targetEid, ecs.events.REALITY_IMAGE_FOUND, this.onFound)
    this.world.events.removeListener(this.targetEid, ecs.events.REALITY_IMAGE_UPDATED, this.onUpdated)
    this.world.events.removeListener(this.targetEid, ecs.events.REALITY_IMAGE_LOST, this.onLost)
    this.world.events.removeListener(this.world.events.globalId, ecs.events.REALITY_IMAGE_FOUND, this.onFound)
    this.world.events.removeListener(this.world.events.globalId, ecs.events.REALITY_IMAGE_UPDATED, this.onUpdated)
    this.world.events.removeListener(this.world.events.globalId, ecs.events.REALITY_IMAGE_LOST, this.onLost)
    window.clearTimeout(this.lostTimer)
  }

  private handleFound() {
    window.clearTimeout(this.lostTimer)

    if (this.visible) return
    this.visible = true
    this.callbacks.onFound()
  }

  private handleLost() {
    this.visible = false
    window.clearTimeout(this.lostTimer)
    this.lostTimer = window.setTimeout(() => {
      if (this.visible) return
      this.callbacks.onLostStable()
    }, TIMING.targetLostTolerance * 1000)
  }
}
