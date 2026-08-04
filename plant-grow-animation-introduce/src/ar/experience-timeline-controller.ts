import {TIMING} from './config'
import {ARExperienceState, ExperienceStateMachine} from './experience-state-machine'
import {ParticleController} from './particle-controller'
import {PlantController} from './plant-controller'
import {VideoMenuController} from './video-menu-controller'
import {VideoPlayerController} from './video-player-controller'
import type {VideoItem} from './types'

// ---------------------------------------------------------------------------
// ExperienceTimelineController
// ---------------------------------------------------------------------------

export class ExperienceTimelineController {
  private targetPresent = false
  private runId = 0

  constructor(
    private readonly machine: ExperienceStateMachine,
    private readonly plant: PlantController,
    private readonly menu: VideoMenuController,
    private readonly player: VideoPlayerController,
    private readonly particles: ParticleController,
  ) {}

  // ─── Image target callbacks ─────────────────────────────────────────────

  async onTargetFound() {
    this.targetPresent = true
    await this.playIntro()
  }

  async onTargetLost() {
    this.targetPresent = false
    this.resetAfterTargetLost()
  }

  // ─── Intro sequence ─────────────────────────────────────────────────────

  async playIntro() {
    this.runId += 1
    const runId = this.runId

    // Synchronous hard-reset — must happen before any await.
    this.plant.reset()
    this.particles.reset()
    this.player.reset()
    this.menu.reset()
    this.machine.hardReset()   // → SCANNING

    try {
      await this.machine.transitionTo(ARExperienceState.TARGET_FOUND)
      if (!this.isActive(runId)) return

      await this.machine.transitionTo(ARExperienceState.INTRO_ENERGY)
      if (!this.isActive(runId)) return

      const energyPromise = this.particles.playIntroEnergy()

      await this.machine.transitionTo(ARExperienceState.PLANT_GROWING)
      if (!this.isActive(runId)) return

      // Plant growth + AR cards in parallel.
      const growthPromise = this.plant.playGrowth()
      void this.menu.showArCards()

      // Immediately allow video selection (state = PLANT_GROWING at this point)
      // openVideo will handle interrupting the growth if user taps early.

      await Promise.all([growthPromise, energyPromise])
      if (!this.isActive(runId)) return

      await this.machine.transitionTo(ARExperienceState.PLANT_IDLE)
      if (!this.isActive(runId)) return
      this.plant.playIdle()

      await this.machine.transitionTo(ARExperienceState.VIDEO_MENU_IDLE)
    } catch {
      // runId cancelled — normal exit
    }
  }

  // ─── Target lost ─────────────────────────────────────────────────────────

  /** Synchronous reset — no awaits so the state is updated immediately. */
  private resetAfterTargetLost() {
    // Cancel any in-flight plant-growth sequence.
    this.runId += 1

    this.menu.hideArCards()
    this.player.reset()
    this.plant.reset()
    this.particles.reset()

    // Go directly to VIDEO_MENU_IDLE (synchronous) so the drawer cards work
    // immediately without waiting for async transitions.
    this.machine.hardReset()   // → SCANNING synchronously

    // Kick off the two state transitions asynchronously.
    void this._transitionToMenuIdle()

    // Show drawer immediately.
    if (!this.menu.drawerIsVisible) {
      void this.menu.showDrawer()
    }
  }

  private async _transitionToMenuIdle() {
    await this.machine.transitionTo(ARExperienceState.VIDEO_MENU_IDLE)
  }

  // ─── Video open / close ──────────────────────────────────────────────────

  /**
   * Open a video. Accepts an optional pre-created video element so the caller
   * can call video.play() directly inside a user gesture (ensures audio on iOS).
   */
  async openVideo(item: VideoItem, preloadedVideoEl?: HTMLVideoElement) {
    // Allow opening from multiple states (including PLANT_GROWING so early taps work).
    const allowed = this.machine.canInteract(
      ARExperienceState.VIDEO_MENU_IDLE,
      ARExperienceState.PLANT_IDLE,
      ARExperienceState.PLANT_GROWING,
      ARExperienceState.SCANNING,     // drawer may fire before full transition
      ARExperienceState.VIDEO_MENU_ENTERING,
    )
    if (!allowed) return

    // Cancel any plant-growth in progress.
    this.runId += 1

    try {
      this.machine.hardReset()

      // Open video FIRST (before any await) to keep play() in the gesture chain.
      const playerOpenPromise = this.player.open(item, preloadedVideoEl)

      // Hide menu asynchronously (fire-and-forget).
      void this.menu.selectCard(item)

      await this.machine.transitionTo(ARExperienceState.VIDEO_OPENING, {videoId: item.id})
      await playerOpenPromise
      await this.machine.transitionTo(ARExperienceState.VIDEO_PLAYING, {videoId: item.id})
    } catch (e) {
      console.warn('[Timeline] openVideo failed:', e)
    }
  }

  async closeVideo() {
    if (!this.machine.canInteract(ARExperienceState.VIDEO_PLAYING)) return

    try {
      await this.machine.transitionTo(ARExperienceState.VIDEO_CLOSING)
      await this.player.close()

      if (this.targetPresent) {
        await this.menu.showArCards()
      } else {
        await this.menu.showDrawer()
      }

      await this.machine.transitionTo(ARExperienceState.VIDEO_MENU_IDLE)
    } catch (e) {
      console.warn('[Timeline] closeVideo failed:', e)
    }
  }

  async closeVideoAndDisappearPlant() {
    if (!this.machine.canInteract(ARExperienceState.VIDEO_PLAYING)) return

    try {
      await this.machine.transitionTo(ARExperienceState.VIDEO_CLOSING)
      await this.player.close()
      await this.disappearPlant()
    } catch (e) {
      console.warn('[Timeline] closeVideoAndDisappearPlant failed:', e)
    }
  }

  // ─── Plant disappear / full reset ────────────────────────────────────────

  async disappearPlant() {
    await this.machine.transitionTo(ARExperienceState.PLANT_DISAPPEARING)
    await this.menu.hide()
    await this.plant.disappearFromTopToBottom()
    await this.particles.hideEnergy()
    await this.reset()
  }

  async reset() {
    this.runId += 1
    this.menu.reset()
    this.player.reset()
    this.plant.reset()
    this.particles.reset()
    this.machine.hardReset()
  }

  // ─── Private ────────────────────────────────────────────────────────────

  private isActive(runId: number) {
    return this.runId === runId
  }
}
