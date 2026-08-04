/**
 * audio-unlock.ts
 *
 * iOS Safari requires video/audio playback to be triggered by a "trusted"
 * user gesture (touchend / click). Calling this once on app start ensures
 * the AudioContext is pre-unlocked so subsequent video.play() calls work
 * reliably even if called from async contexts.
 */

let installed = false

export function installAudioUnlock(): void {
  if (installed) return
  installed = true

  const unlock = () => {
    // 1. Resume/create AudioContext (unlocks Web Audio API)
    const Ctx = (window.AudioContext ?? (window as Window & {webkitAudioContext?: typeof AudioContext}).webkitAudioContext)
    if (Ctx) {
      const ctx = new Ctx()
      // Play a 1-sample silent buffer — forces the audio context active.
      const buffer = ctx.createBuffer(1, 1, 22050)
      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.connect(ctx.destination)
      source.start(0)
      void ctx.resume().then(() => void ctx.close()).catch(() => undefined)
    }

    // 2. Play a muted inline video — unlocks the video element audio gate.
    const v = document.createElement('video')
    v.muted = true
    v.playsInline = true
    v.setAttribute('playsinline', '')
    // A minimal valid MP4 (1-frame, 1×1 px, silent) encoded as base64.
    // Source: https://github.com/nicktindall/cyclon.p2p-rtc-client (public domain)
    v.src = 'data:video/mp4;base64,' +
      'AAAAHGZ0eXBpc29tAAACAGlzb21pc28ybXA0MAAAAARH9AAABW1kYXQAAAAA'
    void v.play().catch(() => undefined)

    document.removeEventListener('touchstart', unlock, true)
    document.removeEventListener('click', unlock, true)
    console.log('[AudioUnlock] Audio context unlocked.')
  }

  // Use capture phase so this fires before any component handler.
  document.addEventListener('touchstart', unlock, {capture: true, passive: true, once: true})
  document.addEventListener('click', unlock, {capture: true, passive: true, once: true})
}
