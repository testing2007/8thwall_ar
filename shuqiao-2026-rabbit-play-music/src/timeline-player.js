import {SEGMENT_GAP_MS, TONE_ORDER} from './tones'

export const flattenSegments = (segments) => {
  const events = []
  let cursor = 0
  for (const segment of segments || []) {
    for (const event of segment.events || []) {
      events.push({t: cursor + event.t, note: event.note})
    }
    cursor += Math.max(0, segment.durationMs || 0) + SEGMENT_GAP_MS
  }
  return {
    events: events.sort((a, b) => a.t - b.t),
    durationMs: Math.max(0, cursor - (segments?.length ? SEGMENT_GAP_MS : 0)),
  }
}

export class TimelinePlayer {
  constructor(audioEngine) {
    this.audio = audioEngine
    this.raf = 0
    this.runId = 0
  }

  stop({resetVisual = false, visual = null} = {}) {
    this.runId += 1
    cancelAnimationFrame(this.raf)
    this.raf = 0
    this.audio.stopAll()
    if (resetVisual) visual?.reset()
  }

  play(segments, options = {}) {
    const {visual, onTone, onHarmony, onComplete} = options
    this.stop()
    const timeline = flattenSegments(segments)
    if (!timeline.events.length || !this.audio.context) return false

    const runId = this.runId
    const startAt = this.audio.currentTime + 0.08
    const seen = new Set()
    let visualIndex = 0
    let harmonyTriggered = false

    visual?.reset()
    for (const event of timeline.events) {
      this.audio.play(event.note, startAt + event.t / 1000)
    }

    const tick = () => {
      if (this.runId !== runId) return
      const elapsedMs = (this.audio.currentTime - startAt) * 1000
      while (visualIndex < timeline.events.length && timeline.events[visualIndex].t <= elapsedMs + 12) {
        const event = timeline.events[visualIndex++]
        visual?.trigger(event.note)
        seen.add(event.note)
        onTone?.(event.note, event)
        if (!harmonyTriggered && TONE_ORDER.every(tone => seen.has(tone))) {
          harmonyTriggered = true
          visual?.setHarmony(true)
          onHarmony?.()
        }
      }

      const tailMs = 1850
      if (elapsedMs < timeline.durationMs + tailMs) {
        this.raf = requestAnimationFrame(tick)
      } else {
        this.raf = 0
        onComplete?.({harmonyTriggered})
      }
    }

    this.raf = requestAnimationFrame(tick)
    return true
  }
}

