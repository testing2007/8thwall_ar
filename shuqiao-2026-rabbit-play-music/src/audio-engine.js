import {AUDIO_URLS, TONE_ORDER} from './tones'

export class AudioEngine {
  constructor() {
    this.context = null
    this.master = null
    this.buffers = new Map()
    this.loading = null
    this.activeSources = new Set()
  }

  ensureContext() {
    if (this.context) return this.context
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!AudioContextClass) throw new Error('Web Audio is not supported on this device.')
    this.context = new AudioContextClass()
    this.master = this.context.createGain()
    this.master.gain.value = 0.9
    this.master.connect(this.context.destination)
    return this.context
  }

  unlock() {
    const context = this.ensureContext()
    const silent = context.createBuffer(1, 1, context.sampleRate)
    const source = context.createBufferSource()
    source.buffer = silent
    source.connect(this.master)
    source.start(0)
    const promise = context.resume()
    if (promise?.catch) promise.catch(() => undefined)
    return promise
  }

  async load() {
    if (this.buffers.size === TONE_ORDER.length) return this.buffers
    if (this.loading) return this.loading
    const context = this.ensureContext()
    this.loading = Promise.all(TONE_ORDER.map(async (tone) => {
      const response = await fetch(AUDIO_URLS[tone])
      if (!response.ok) throw new Error(`Failed to load ${tone} sample.`)
      const data = await response.arrayBuffer()
      const buffer = await context.decodeAudioData(data)
      this.buffers.set(tone, buffer)
    })).then(() => this.buffers).catch((error) => {
      this.loading = null
      throw error
    })
    return this.loading
  }

  play(tone, when = null) {
    const buffer = this.buffers.get(tone)
    if (!buffer || !this.context) return null
    const source = this.context.createBufferSource()
    const gain = this.context.createGain()
    source.buffer = buffer
    gain.gain.value = 0.88
    source.connect(gain)
    gain.connect(this.master)
    const startAt = when == null ? this.context.currentTime : Math.max(when, this.context.currentTime)
    source.start(startAt)
    this.activeSources.add(source)
    source.addEventListener('ended', () => this.activeSources.delete(source), {once: true})
    return source
  }

  stopAll() {
    for (const source of this.activeSources) {
      try { source.stop() } catch (_) { /* already stopped */ }
    }
    this.activeSources.clear()
  }

  get currentTime() {
    return this.context?.currentTime || 0
  }
}

