import gsap from 'gsap'
import {Group} from 'three'

import {LAYOUT, TIMING} from './config'
import type {CloseOptions, VideoItem} from './types'

type RequestClose = () => Promise<void>

export class VideoPlayerController {
  readonly root = new Group()
  private overlay: HTMLDivElement | null = null
  private shell: HTMLDivElement | null = null
  private loading: HTMLDivElement | null = null
  private video: HTMLVideoElement | null = null
  private activeTimeline: gsap.core.Timeline | null = null
  private requestClose: RequestClose | null = null
  private readonly onResize = () => this.fitShellToVideo()

  constructor() {
    this.root.name = 'VideoPlayerRoot'
    this.root.visible = false
    ensureScreenVideoStyles()
  }

  setRequestClose(callback: RequestClose) {
    this.requestClose = callback
  }

  async open(item: VideoItem) {
    this.releaseVideo()
    this.ensureOverlay()

    if (!this.overlay || !this.shell || !this.loading) return

    this.overlay.hidden = false
    this.shell.dataset.loading = 'true'
    this.shell.style.opacity = '0'
    this.shell.style.transform = 'translate(-50%, -50%) scale(0.86)'
    this.loading.hidden = false

    const video = document.createElement('video')
    video.className = 'ar-screen-video'
    video.playsInline = true
    video.muted = false
    video.defaultMuted = false
    video.crossOrigin = 'anonymous'
    video.preload = 'metadata'
    video.volume = 1
    video.src = item.videoUrl
    video.setAttribute('playsinline', '')
    video.setAttribute('webkit-playsinline', '')
    video.addEventListener('click', (event) => {
      event.stopPropagation()
      this.togglePlayback()
    })

    this.video = video
    this.shell.insertBefore(video, this.loading)

    // This play request is intentionally issued before any await, so mobile Safari
    // still treats it as part of the user's card tap gesture.
    const playPromise = video.play().catch((error) => {
      console.warn('[ARExperience] Screen video play failed:', error)
      video.muted = true
      return video.play().catch((mutedError) => {
        console.warn('[ARExperience] Muted screen video fallback failed:', mutedError)
      })
    })

    await Promise.race([
      this.waitForVideoReady(video),
      wait(1200),
    ])

    this.fitShellToVideo()
    this.loading.hidden = true
    this.activeTimeline = gsap.timeline()
      .to(this.shell, {
        opacity: 1,
        scale: 1,
        duration: 0.32,
        ease: 'back.out(1.35)',
      }, 0)

    await this.activeTimeline.then()
    this.activeTimeline = null
    await playPromise
  }

  async play() {
    if (!this.video) return
    this.video.volume = 1
    await this.video.play()
  }

  pause() {
    this.video?.pause()
  }

  togglePlayback() {
    if (!this.video) return

    if (this.video.paused) {
      void this.video.play()
    } else {
      this.video.pause()
    }
  }

  async close(options: CloseOptions = {}) {
    this.activeTimeline?.kill()

    const fadeAudioDuration = options.fadeAudioDuration ?? TIMING.videoCloseAudioFade
    const shrinkDuration = options.shrinkDuration ?? TIMING.videoCloseShrink

    if (this.video && fadeAudioDuration > 0) {
      gsap.to(this.video, {
        volume: 0,
        duration: fadeAudioDuration,
        ease: 'power1.out',
      })
    }

    if (this.shell && !this.overlay?.hidden && shrinkDuration > 0) {
      this.activeTimeline = gsap.timeline()
        .to(this.shell, {
          opacity: 0,
          scale: 0.82,
          duration: shrinkDuration,
          ease: 'power2.in',
        }, 0)

      await this.activeTimeline.then()
      this.activeTimeline = null
    }

    this.releaseVideo()
    this.reset()
  }

  reset() {
    this.activeTimeline?.kill()
    this.activeTimeline = null
    if (this.overlay) this.overlay.hidden = true
    if (this.shell) {
      this.shell.style.opacity = '0'
      this.shell.style.transform = 'translate(-50%, -50%) scale(0.86)'
      this.shell.dataset.loading = ''
    }
    if (this.loading) this.loading.hidden = true
  }

  dispose() {
    this.releaseVideo()
    window.removeEventListener('resize', this.onResize)
    this.overlay?.remove()
    this.overlay = null
    this.shell = null
    this.loading = null
  }

  getInteractiveObjects() {
    return []
  }

  private ensureOverlay() {
    if (this.overlay) return

    const overlay = document.createElement('div')
    overlay.className = 'ar-screen-video-overlay'
    overlay.hidden = true

    const shell = document.createElement('div')
    shell.className = 'ar-screen-video-shell'

    const closeButton = document.createElement('button')
    closeButton.className = 'ar-screen-video-close'
    closeButton.type = 'button'
    closeButton.setAttribute('aria-label', 'Close video')
    closeButton.textContent = '×'
    closeButton.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      if (this.requestClose) void this.requestClose()
    })

    const loading = document.createElement('div')
    loading.className = 'ar-screen-video-loading'
    loading.textContent = 'Loading'

    shell.append(closeButton, loading)
    overlay.append(shell)
    document.body.append(overlay)
    window.addEventListener('resize', this.onResize)

    this.overlay = overlay
    this.shell = shell
    this.loading = loading
  }

  private waitForVideoReady(video: HTMLVideoElement) {
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) return Promise.resolve()

    return new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(resolve, 2500)
      const cleanup = () => {
        window.clearTimeout(timeout)
        video.removeEventListener('loadedmetadata', onReady)
        video.removeEventListener('canplay', onReady)
        video.removeEventListener('error', onError)
      }
      const onReady = () => {
        cleanup()
        resolve()
      }
      const onError = () => {
        cleanup()
        reject(new Error(`Video failed to load: ${video.src}`))
      }

      video.addEventListener('loadedmetadata', onReady, {once: true})
      video.addEventListener('canplay', onReady, {once: true})
      video.addEventListener('error', onError, {once: true})
    })
  }

  private fitShellToVideo() {
    if (!this.video || !this.shell || !this.video.videoWidth || !this.video.videoHeight) return

    const maxWidth = Math.min(window.innerWidth * 0.92, 920)
    const maxHeight = window.innerHeight * 0.72
    const videoAspect = this.video.videoWidth / this.video.videoHeight
    const availableAspect = maxWidth / maxHeight

    let width = maxWidth
    let height = width / videoAspect

    if (availableAspect > videoAspect) {
      height = maxHeight
      width = height * videoAspect
    }

    this.shell.style.width = `${Math.round(width)}px`
    this.shell.style.height = `${Math.round(height)}px`
    this.video.style.width = '100%'
    this.video.style.height = '100%'
  }

  private releaseVideo() {
    if (!this.video) return

    this.video.pause()
    try {
      this.video.currentTime = 0
    } catch {
      // Some mobile browsers reject currentTime changes while metadata is missing.
    }
    this.video.removeAttribute('src')
    this.video.load()
    this.video.remove()
    this.video = null
  }
}

function ensureScreenVideoStyles() {
  if (document.getElementById('ar-screen-video-style')) return

  const style = document.createElement('style')
  style.id = 'ar-screen-video-style'
  style.textContent = `
    .ar-screen-video-overlay {
      position: fixed;
      inset: 0;
      z-index: 2147483000;
      background: rgba(2, 8, 20, 0.62);
      backdrop-filter: blur(12px) saturate(1.3);
      -webkit-backdrop-filter: blur(12px) saturate(1.3);
      pointer-events: none;
    }

    .ar-screen-video-shell {
      position: fixed;
      left: 50%;
      top: 50%;
      width: ${LAYOUT.screenVideoMaxWidth};
      height: auto;
      max-height: ${LAYOUT.screenVideoMaxHeight};
      transform: translate(-50%, -50%) scale(0.86);
      opacity: 0;
      pointer-events: auto;
      border: 1px solid rgba(117, 214, 255, 0.35);
      border-radius: 16px;
      background: rgba(4, 12, 26, 0.9);
      box-shadow:
        0 0 0 1px rgba(117, 214, 255, 0.08) inset,
        0 8px 48px rgba(0, 0, 0, 0.72),
        0 0 32px rgba(39, 183, 255, 0.18);
      overflow: hidden;
      touch-action: manipulation;
    }

    .ar-screen-video {
      display: block;
      width: 100%;
      height: auto;
      max-height: ${LAYOUT.screenVideoMaxHeight};
      background: #020812;
      object-fit: fill;
    }

    .ar-screen-video-close {
      position: absolute;
      top: 10px;
      right: 10px;
      width: 36px;
      height: 36px;
      border: 1px solid rgba(117, 214, 255, 0.4);
      border-radius: 50%;
      background: rgba(4, 12, 26, 0.82);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      color: rgba(255, 255, 255, 0.9);
      font: 400 26px/34px Arial, sans-serif;
      z-index: 2;
      padding: 0;
      cursor: pointer;
      transition: background 0.18s ease, border-color 0.18s ease;
    }
    .ar-screen-video-close:hover,
    .ar-screen-video-close:active {
      background: rgba(39, 183, 255, 0.18);
      border-color: rgba(117, 214, 255, 0.75);
    }

    .ar-screen-video-loading {
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      color: rgba(255, 255, 255, 0.85);
      background: rgba(4, 12, 26, 0.78);
      border: 1px solid rgba(117, 214, 255, 0.3);
      border-radius: 10px;
      padding: 9px 16px;
      font: 500 13px/1.3 'Inter', Arial, sans-serif;
      letter-spacing: 0.04em;
    }
  `
  document.head.append(style)
}

function wait(ms: number) {
  return new Promise<void>(resolve => window.setTimeout(resolve, ms))
}
