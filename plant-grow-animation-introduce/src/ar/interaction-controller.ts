import {
  Camera,
  Object3D,
  Raycaster,
  Vector2,
} from 'three'

import {ARExperienceState, ExperienceStateMachine} from './experience-state-machine'
import {PlantController} from './plant-controller'
import {VideoMenuController} from './video-menu-controller'
import {VideoPlayerController} from './video-player-controller'
import type {InteractiveObject, VideoItem} from './types'

type InteractionCallbacks = {
  openVideo(item: VideoItem): Promise<void>
  closeVideo(): Promise<void>
  closeVideoAndDisappearPlant(): Promise<void>
}

export class InteractionController {
  private readonly raycaster = new Raycaster()
  private readonly pointer = new Vector2()
  private enabled = true
  private readonly onPointerDown = (event: PointerEvent) => void this.handlePointerDown(event)

  constructor(
    private readonly camera: Camera,
    private readonly plant: PlantController,
    private readonly menu: VideoMenuController,
    private readonly player: VideoPlayerController,
    private readonly machine: ExperienceStateMachine,
    private readonly callbacks: InteractionCallbacks,
  ) {
    window.addEventListener('pointerdown', this.onPointerDown, {passive: true})
  }

  pause() {
    this.enabled = false
  }

  resume() {
    this.enabled = true
  }

  dispose() {
    window.removeEventListener('pointerdown', this.onPointerDown)
  }

  private async handlePointerDown(event: PointerEvent) {
    if (!this.enabled) return

    this.pointer.x = (event.clientX / window.innerWidth) * 2 - 1
    this.pointer.y = -(event.clientY / window.innerHeight) * 2 + 1
    this.raycaster.setFromCamera(this.pointer, this.camera)

    const hit = this.getPriorityHit()
    if (!hit) return

    const interactionType = hit.userData.interactionType
    if (interactionType === 'close-button' && this.machine.canInteract(ARExperienceState.VIDEO_PLAYING)) {
      await this.callbacks.closeVideo()
      return
    }

    if (interactionType === 'video-surface' && this.machine.canInteract(ARExperienceState.VIDEO_PLAYING)) {
      this.player.togglePlayback()
      return
    }

    if (interactionType === 'video-card' && this.machine.canInteract(ARExperienceState.VIDEO_MENU_IDLE)) {
      const item = hit.userData.videoItem
      if (item) await this.callbacks.openVideo(item)
      return
    }

    if (interactionType === 'plant-background' && this.machine.canInteract(ARExperienceState.VIDEO_PLAYING)) {
      await this.callbacks.closeVideoAndDisappearPlant()
    }
  }

  private getPriorityHit() {
    const buckets = [
      this.player.getInteractiveObjects().filter(object => object.userData.interactionType === 'close-button'),
      this.player.getInteractiveObjects().filter(object => object.userData.interactionType === 'video-surface'),
      this.menu.getInteractiveObjects(),
      this.plant.getInteractiveObjects(),
    ]

    for (const bucket of buckets) {
      const hit = this.intersect(bucket)
      if (hit) return hit
    }

    return null
  }

  private intersect(objects: Object3D[]) {
    const hits = this.raycaster.intersectObjects(objects, true)
    return (hits[0]?.object as InteractiveObject | undefined) ?? null
  }
}
