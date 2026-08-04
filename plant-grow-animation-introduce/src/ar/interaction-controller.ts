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
  openVideo(item: VideoItem, videoEl: HTMLVideoElement): Promise<void>
  closeVideo(): Promise<void>
  closeVideoAndDisappearPlant(): Promise<void>
}

export class InteractionController {
  private readonly raycaster = new Raycaster()
  private readonly pointer = new Vector2()
  private enabled = true
  // Use 'click' (not 'pointerdown') so iOS Safari recognises it as a trusted
  // user gesture for audio playback. Click fires after touchend.
  private readonly onClick = (event: MouseEvent) => void this.handleClick(event)

  constructor(
    private readonly camera: Camera,
    private readonly plant: PlantController,
    private readonly menu: VideoMenuController,
    private readonly player: VideoPlayerController,
    private readonly machine: ExperienceStateMachine,
    private readonly callbacks: InteractionCallbacks,
  ) {
    window.addEventListener('click', this.onClick, {passive: true})
  }

  pause() { this.enabled = false }
  resume() { this.enabled = true }

  dispose() {
    window.removeEventListener('click', this.onClick)
  }

  private async handleClick(event: MouseEvent) {
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

    if (interactionType === 'video-card') {
      const item = hit.userData.videoItem as VideoItem | undefined
      if (!item) return

      // ── Create & play the video HERE, inside the synchronous gesture chain ──
      // This is the ONLY reliable way to get audio on iOS Safari:
      // video.play() must be called with no microtask/macrotask gap from the touch event.
      const videoEl = createAndPlayVideo(item.videoUrl)

      await this.callbacks.openVideo(item, videoEl)
      return
    }

    if (interactionType === 'plant-background' && this.machine.canInteract(ARExperienceState.VIDEO_PLAYING)) {
      await this.callbacks.closeVideoAndDisappearPlant()
    }
  }

  private getPriorityHit() {
    const buckets = [
      this.player.getInteractiveObjects().filter(o => o.userData.interactionType === 'close-button'),
      this.player.getInteractiveObjects().filter(o => o.userData.interactionType === 'video-surface'),
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

// ─── Helper ─────────────────────────────────────────────────────────────────

/**
 * Creates a <video> element and synchronously calls play() — must be called
 * directly inside a user gesture handler with no await before it.
 * Returns the element so it can be passed to VideoPlayerController.open().
 */
function createAndPlayVideo(src: string): HTMLVideoElement {
  const video = document.createElement('video')
  video.playsInline = true
  video.muted = false
  video.defaultMuted = false
  video.volume = 1
  video.preload = 'auto'
  video.crossOrigin = 'anonymous'
  video.src = src
  video.setAttribute('playsinline', '')
  video.setAttribute('webkit-playsinline', '')

  // Synchronous play() inside the gesture → audio allowed by browser.
  video.play().catch(() => {
    // If unmuted play fails (gesture check passed but policy still blocks),
    // fall back to muted. VideoPlayerController.open() will retry unmuted.
    video.muted = true
    void video.play().catch(() => undefined)
  })

  return video
}
