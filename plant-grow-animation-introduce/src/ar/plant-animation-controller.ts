import {
  AnimationAction,
  AnimationClip,
  AnimationMixer,
  Group,
  LoopOnce,
  LoopRepeat,
} from 'three'

import {PLANT_GLB} from './config'

export class PlantAnimationController {
  private mixer: AnimationMixer | null = null
  private actions = new Map<string, AnimationAction>()

  constructor(private readonly root: Group) {
    const clips = this.getClips()
    if (clips.length === 0) return

    this.mixer = new AnimationMixer(root)
    clips.forEach((clip) => {
      this.actions.set(clip.name, this.mixer!.clipAction(clip))
    })
  }

  get clipNames() {
    return [...this.actions.keys()]
  }

  playGrowth() {
    this.playClip('plant_grow', false) || this.playClip(PLANT_GLB.fallbackGrowClip, false)
  }

  playIdle() {
    this.playClip('plant_idle', true) || this.playClip('flower_idle', true)
  }

  playDisappear() {
    return this.playClip('plant_disappear_down', false)
  }

  update(deltaSeconds: number) {
    this.mixer?.update(deltaSeconds)
  }

  pause() {
    if (this.mixer) this.mixer.timeScale = 0
  }

  resume() {
    if (this.mixer) this.mixer.timeScale = 1
  }

  reset() {
    this.actions.forEach((action) => {
      action.stop()
      action.reset()
    })
  }

  private playClip(name: string, loop: boolean) {
    const action = this.actions.get(name)
    if (!action) return false

    action.reset()
    action.enabled = true
    action.clampWhenFinished = !loop
    action.setLoop(loop ? LoopRepeat : LoopOnce, loop ? Infinity : 1)
    action.fadeIn(0.08)
    action.play()
    return true
  }

  private getClips() {
    const clips = (this.root as Group & {animations?: AnimationClip[]}).animations
    return Array.isArray(clips) ? clips : []
  }
}
