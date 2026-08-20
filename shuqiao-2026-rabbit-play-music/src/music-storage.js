import {isTone, MAX_SEGMENT_MS, RHYTHM_BPM} from './tones'

export const STORAGE_KEY = 'moon-rabbit-five-tones:v1'

const makeId = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `segment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

const sanitizeEvent = event => {
  if (!event || !isTone(event.note) || !Number.isFinite(Number(event.t))) return null
  return {
    t: Math.round(Math.min(MAX_SEGMENT_MS, Math.max(0, Number(event.t)))),
    note: event.note,
  }
}

const sanitizeSegment = (segment, index) => {
  if (!segment || !Array.isArray(segment.events)) return null
  const events = segment.events
    .map(sanitizeEvent)
    .filter(Boolean)
    .sort((a, b) => a.t - b.t)
  if (!events.length) return null
  const lastEvent = events[events.length - 1].t
  return {
    id: typeof segment.id === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(segment.id) ? segment.id : makeId(),
    name: typeof segment.name === 'string' && segment.name
      ? segment.name.slice(0, 48)
      : `Segment ${String(index + 1).padStart(2, '0')}`,
    mode: segment.mode === 'rhythm' ? 'rhythm' : 'free',
    bpm: RHYTHM_BPM,
    durationMs: Math.round(Math.min(
      MAX_SEGMENT_MS,
      Math.max(lastEvent + 120, Number(segment.durationMs) || 0),
    )),
    events,
  }
}

const sanitizeWork = work => {
  if (!work || work.version !== 1 || !Array.isArray(work.segments)) return null
  const segments = work.segments.map(sanitizeSegment).filter(Boolean)
  if (!segments.length) return null
  const now = Date.now()
  return {
    version: 1,
    createdAt: Number.isFinite(Number(work.createdAt)) ? Number(work.createdAt) : now,
    updatedAt: Number.isFinite(Number(work.updatedAt)) ? Number(work.updatedAt) : now,
    segments,
  }
}

export const createWork = () => {
  const now = Date.now()
  return {version: 1, createdAt: now, updatedAt: now, segments: []}
}

export const createSegment = ({index, mode, durationMs, events}) => ({
  id: makeId(),
  name: `Segment ${String(index + 1).padStart(2, '0')}`,
  mode: mode === 'rhythm' ? 'rhythm' : 'free',
  bpm: RHYTHM_BPM,
  durationMs,
  events: events.map(event => ({t: event.t, note: event.note})),
})

export const loadWork = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {work: null, error: null}
    const work = sanitizeWork(JSON.parse(raw))
    if (!work) {
      localStorage.removeItem(STORAGE_KEY)
      return {work: null, error: 'Saved work could not be loaded and was removed.'}
    }
    return {work, error: null}
  } catch (error) {
    console.warn('[Moon Rabbit] Failed to load saved work:', error)
    try { localStorage.removeItem(STORAGE_KEY) } catch (_) { /* optional */ }
    return {work: null, error: 'Saved work could not be loaded and was removed.'}
  }
}

export const saveWork = work => {
  try {
    const segments = (work?.segments || []).map(sanitizeSegment).filter(Boolean)
    if (!segments.length) {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
    const saved = {
      version: 1,
      createdAt: work.createdAt || Date.now(),
      updatedAt: Date.now(),
      segments,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))
    return saved
  } catch (error) {
    console.error('[Moon Rabbit] Failed to save work:', error)
    throw new Error('This browser could not save your work.')
  }
}

export const clearWork = () => {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch (error) {
    console.warn('[Moon Rabbit] Failed to clear work:', error)
  }
}
