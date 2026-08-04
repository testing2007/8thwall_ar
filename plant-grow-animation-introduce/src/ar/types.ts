import type {Object3D} from 'three'

export interface VideoItem {
  id: string
  title: string
  thumbnailUrl: string
  videoUrl: string
  posterUrl?: string
  duration?: number
}

export interface CloseOptions {
  fadeAudioDuration?: number
  shrinkDuration?: number
}

export type InteractionType =
  | 'close-button'
  | 'video-surface'
  | 'video-card'
  | 'plant-background'

export interface InteractiveObject extends Object3D {
  userData: Object3D['userData'] & {
    interactionType?: InteractionType
    videoId?: string
    videoItem?: VideoItem
  }
}

export interface TickableController {
  update(deltaSeconds: number, elapsedSeconds: number): void
}
