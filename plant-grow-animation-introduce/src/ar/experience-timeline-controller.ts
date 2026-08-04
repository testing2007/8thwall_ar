import {TIMING} from './config'
import {ARExperienceState, ExperienceStateMachine} from './experience-state-machine'
import {ParticleController} from './particle-controller'
import {PlantController} from './plant-controller'
import {VideoMenuController} from './video-menu-controller'
import {VideoPlayerController} from './video-player-controller'
import type {VideoItem} from './types'

// ---------------------------------------------------------------------------
// ExperienceTimelineController
//
// Orchestrates:
//   • Plant growth animation
//   • AR 3D video cards (shown when image target is FOUND)
//   • HTML bottom drawer (shown when image target is LOST)
//   • Full-screen video playback
//
// The dual-mode menu logic:
//   targetPresent = true  → use menu.showArCards()   (3D cards on bottle)
//   targetPresent = false → use menu.showDrawer()    (HTML bottom panel)
// ---------------------------------------------------------------------------

export class ExperienceTimelineController {
  /** Whether the image target is currently visible */
  private targetPresent = false

  /** Monotonically increasing. Incrementing it cancels all in-flight awaits. */
  private runId = 0

  /** True while an async intro/video-open/close sequence is running. */
  private busy = false

  constructor(
    private readonly machine: ExperienceStateMachine,
    private readonly plant: PlantController,
    private readonly menu: VideoMenuController,
    private readonly player: VideoPlayerController,
    private readonly particles: ParticleController,
  ) {}

  // ─── Image target callbacks ─────────────────────────────────────────────

  /** Called by ImageTargetController when the target becomes visible. */
  async onTargetFound() {
    this.targetPresent = true
    await this.playIntro()
  }

  /** Called by ImageTargetController when the target has been stably lost. */
  async onTargetLost() {
    this.targetPresent = false
    await this.resetAfterTargetLost()
  }

  // ─── Intro sequence ─────────────────────────────────────────────────────

  /** Starts (or restarts) the plant-growth intro sequence.
   *  Safely aborts any currently running sequence via runId. */
  async playIntro() {
    // ── 1. Synchronous hard-reset ─────────────────────────────────────────
    // Capture our runId BEFORE any await so no concurrent call can race us.
    this.runId += 1
    const runId = this.runId
    this.busy = false

    // Synchronously reset everything to a clean slate.
    this.plant.reset()
    this.particles.reset()
    this.player.reset()           // sync: kills GSAP, hides overlay
    this.menu.reset()             // sync: hides AR cards + drawer immediately
    this.machine.hardReset()      // sync: sets state to SCANNING

    // ── 2. Async intro sequence ───────────────────────────────────────────
    this.busy = true
    try {
      await this.machine.transitionTo(ARExperienceState.TARGET_FOUND)
      if (!this.isActive(runId)) return

      await this.machine.transitionTo(ARExperienceState.INTRO_ENERGY)
      if (!this.isActive(runId)) return

      const energyPromise = this.particles.playIntroEnergy()

      await this.machine.transitionTo(ARExperienceState.PLANT_GROWING)
      if (!this.isActive(runId)) return

      // ── Plant growth + AR cards in PARALLEL ───────────────────────────
      const growthPromise = this.plant.playGrowth()

      // Show 3D cards immediately alongside plant growth (don't wait for growth to finish)
      void this.menu.showArCards()

      // Wait for both to complete
      await Promise.all([growthPromise, energyPromise])
      if (!this.isActive(runId)) return

      await this.machine.transitionTo(ARExperienceState.PLANT_IDLE)
      if (!this.isActive(runId)) return
      this.plant.playIdle()

      await this.machine.transitionTo(ARExperienceState.VIDEO_MENU_ENTERING)
      if (!this.isActive(runId)) return
      await this.machine.transitionTo(ARExperienceState.VIDEO_MENU_IDLE)
    } finally {
      if (this.isActive(runId)) this.busy = false
    }
  }

  // ─── Target lost ─────────────────────────────────────────────────────────

  private async resetAfterTargetLost() {
    const runId = ++this.runId
    this.busy = false

    // Hide AR cards immediately, show the drawer so user can still pick videos.
    this.menu.hideArCards()
    void this.player.close({fadeAudioDuration: 0, shrinkDuration: 0})

    this.plant.reset()
    this.particles.reset()

    if (!this.isActive(runId)) return

    // Show drawer (if not already visible)
    if (!this.menu.drawerIsVisible) {
      void this.menu.showDrawer()
    }

    // Keep state at VIDEO_MENU_IDLE so openVideo works from the drawer.
    await this.machine.forceTransitionTo(ARExperienceState.RESETTING)
    if (!this.isActive(runId)) return
    await this.machine.forceTransitionTo(ARExperienceState.VIDEO_MENU_IDLE)
  }

  // ─── Video open / close ──────────────────────────────────────────────────

  async openVideo(item: VideoItem) {
    if (this.busy) return
    if (!this.machine.canInteract(
      ARExperienceState.VIDEO_MENU_IDLE,
      ARExperienceState.PLANT_IDLE,
    )) return

    this.busy = true
    try {
      await this.machine.transitionTo(ARExperienceState.VIDEO_OPENING, {videoId: item.id})
      await this.menu.selectCard(item)     // hides both AR cards and drawer
      await this.player.open(item)
      await this.machine.transitionTo(ARExperienceState.VIDEO_PLAYING, {videoId: item.id})
    } finally {
      this.busy = false
    }
  }

  async closeVideo() {
    if (this.busy || !this.machine.canInteract(ARExperienceState.VIDEO_PLAYING)) return
    this.busy = true

    try {
      await this.machine.transitionTo(ARExperienceState.VIDEO_CLOSING)
      await this.player.close()

      // After video closes, show whichever menu is appropriate.
      if (this.targetPresent) {
        await this.menu.showArCards()
      } else {
        await this.menu.showDrawer()
      }

      await this.machine.transitionTo(ARExperienceState.VIDEO_MENU_IDLE)
    } finally {
      this.busy = false
    }
  }

  async closeVideoAndDisappearPlant() {
    if (this.busy || !this.machine.canInteract(ARExperienceState.VIDEO_PLAYING)) return
    this.busy = true

    try {
      await this.machine.transitionTo(ARExperienceState.VIDEO_CLOSING)
      await this.player.close()
      await this.disappearPlant()
    } finally {
      this.busy = false
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
    this.busy = false
    this.menu.reset()
    this.player.reset()
    this.plant.reset()
    this.particles.reset()
    await this.machine.transitionTo(ARExperienceState.RESETTING)
    await this.machine.transitionTo(ARExperienceState.SCANNING)
  }

  // ─── Pause / resume (for future use) ────────────────────────────────────

  pauseForTargetLost() {
    this.runId += 1
    this.busy = false
    this.plant.pause()
    this.player.pause()
    this.particles.pause()
  }

  resumeFromTargetFound() {
    this.plant.resume()
    this.particles.resume()
  }

  // ─── Private ────────────────────────────────────────────────────────────

  private isActive(runId: number) {
    return this.runId === runId
  }
}
