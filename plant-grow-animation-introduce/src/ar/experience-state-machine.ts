export enum ARExperienceState {
  SCANNING = 'SCANNING',
  TARGET_FOUND = 'TARGET_FOUND',
  INTRO_ENERGY = 'INTRO_ENERGY',
  PLANT_GROWING = 'PLANT_GROWING',
  PLANT_IDLE = 'PLANT_IDLE',
  VIDEO_MENU_ENTERING = 'VIDEO_MENU_ENTERING',
  VIDEO_MENU_IDLE = 'VIDEO_MENU_IDLE',
  VIDEO_OPENING = 'VIDEO_OPENING',
  VIDEO_PLAYING = 'VIDEO_PLAYING',
  VIDEO_CLOSING = 'VIDEO_CLOSING',
  PLANT_DISAPPEARING = 'PLANT_DISAPPEARING',
  RESETTING = 'RESETTING',
}

type Cleanup = () => void

export class ExperienceStateMachine {
  private currentState = ARExperienceState.SCANNING
  private transitionToken = 0
  private cleanups: Cleanup[] = []

  get state() {
    return this.currentState
  }

  canInteract(...allowedStates: ARExperienceState[]) {
    return allowedStates.includes(this.currentState)
  }

  addCleanup(cleanup: Cleanup) {
    this.cleanups.push(cleanup)
  }

  /** Synchronous hard-reset: sets state directly without dispatching events.
   *  Use only in playIntro before any await to prevent race conditions. */
  hardReset() {
    this.flushCleanups()
    this.transitionToken += 1
    this.currentState = ARExperienceState.SCANNING
  }

  async transitionTo(nextState: ARExperienceState, payload?: unknown) {
    if (this.currentState === nextState) return
    await this.applyTransition(nextState, payload)
  }

  /** Like transitionTo but works even when already in that state. Use for hard resets. */
  async forceTransitionTo(nextState: ARExperienceState, payload?: unknown) {
    await this.applyTransition(nextState, payload)
  }

  private async applyTransition(nextState: ARExperienceState, payload?: unknown) {
    this.transitionToken += 1
    this.flushCleanups()
    this.currentState = nextState

    window.dispatchEvent(new CustomEvent('ar-experience-state', {
      detail: {
        state: this.currentState,
        payload,
      },
    }))
  }

  isCurrentToken(token: number) {
    return token === this.transitionToken
  }

  createToken() {
    this.transitionToken += 1
    return this.transitionToken
  }

  private flushCleanups() {
    const cleanups = this.cleanups.splice(0)
    cleanups.forEach((cleanup) => {
      try {
        cleanup()
      } catch (err) {
        console.warn('[ARExperience] cleanup failed', err)
      }
    })
  }
}
