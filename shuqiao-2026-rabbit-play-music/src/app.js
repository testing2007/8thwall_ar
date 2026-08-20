import * as THREE from 'three'
import {AudioEngine} from './audio-engine'
import {
  clearWork,
  createSegment,
  createWork,
  loadWork,
  saveWork,
} from './music-storage'
import {TimelinePlayer} from './timeline-player'
import {
  MAX_SEGMENT_MS,
  POSTER_IMAGE_URL,
  TONES,
} from './tones'
import {loadSharedTargetTexture, MoonRabbitVisual} from './visual-engine'

window.THREE = THREE

const IMAGE_TARGET_DATA = require('../image-targets/target.json')
const TARGET_NAME = IMAGE_TARGET_DATA.name || 'target'
const AUTO_COMPOSER_KEY = 'moon-rabbit-open-composer'
const BACK_POSITION_KEY = 'moon-rabbit-composer-back-position:v1'
const BACK_SIZE = 52
const BACK_EDGE_GAP = 10

const audio = new AudioEngine()
const player = new TimelinePlayer(audio)

let currentWork = null
let composerVisual = null
let arVisual = null
let arTexture = null
let xrRuntimeLoading = null
let xrSupportLoading = null
let xrStarted = false
let arStarting = false
let targetVisible = false
let targetPlaybackStarted = false
let toastTimer = 0

const draftMode = 'free'
let draftEvents = []
let draftElapsedMs = 0
let recording = false
let recordStartedAt = 0
let composerPlaying = false
let selectedTakeId = 'draft'
let playingTakeId = null
let viewportFrame = 0
let backPosition = {side: 'left', yRatio: 0.08}
let backButtonPoint = {x: 0, y: 0}

const $ = selector => document.querySelector(selector)
const $$ = selector => Array.from(document.querySelectorAll(selector))

const getViewportSize = () => ({
  width: window.visualViewport?.width || document.documentElement.clientWidth || window.innerWidth,
  height: window.visualViewport?.height || window.innerHeight,
})

const getSafeInsets = () => {
  const style = getComputedStyle($('#safe-area-probe'))
  return {
    top: parseFloat(style.paddingTop) || 0,
    right: parseFloat(style.paddingRight) || 0,
    bottom: parseFloat(style.paddingBottom) || 0,
    left: parseFloat(style.paddingLeft) || 0,
  }
}

const getBackBounds = () => {
  const viewport = getViewportSize()
  const safe = getSafeInsets()
  const minX = safe.left + BACK_EDGE_GAP
  const maxX = Math.max(minX, viewport.width - safe.right - BACK_SIZE - BACK_EDGE_GAP)
  const minY = safe.top + BACK_EDGE_GAP
  const maxY = Math.max(minY, viewport.height - safe.bottom - BACK_SIZE - BACK_EDGE_GAP)
  return {minX, maxX, minY, maxY}
}

const clampValue = (value, min, max) => Math.min(max, Math.max(min, value))

const placeBackButton = (point) => {
  const button = $('#composer-back')
  if (!button) return
  const bounds = getBackBounds()
  backButtonPoint = {
    x: clampValue(point.x, bounds.minX, bounds.maxX),
    y: clampValue(point.y, bounds.minY, bounds.maxY),
  }
  button.style.transform = `translate3d(${backButtonPoint.x}px, ${backButtonPoint.y}px, 0)`
}

const placeSavedBackButton = () => {
  const bounds = getBackBounds()
  const y = bounds.minY + clampValue(backPosition.yRatio, 0, 1) * (bounds.maxY - bounds.minY)
  placeBackButton({x: backPosition.side === 'right' ? bounds.maxX : bounds.minX, y})
}

const saveBackButtonPosition = () => {
  const bounds = getBackBounds()
  const availableY = Math.max(1, bounds.maxY - bounds.minY)
  backPosition = {
    side: backButtonPoint.x > (bounds.minX + bounds.maxX) / 2 ? 'right' : 'left',
    yRatio: clampValue((backButtonPoint.y - bounds.minY) / availableY, 0, 1),
  }
  try { localStorage.setItem(BACK_POSITION_KEY, JSON.stringify(backPosition)) } catch (_) { /* optional */ }
}

const loadBackButtonPosition = () => {
  try {
    const value = JSON.parse(localStorage.getItem(BACK_POSITION_KEY) || 'null')
    if (value && (value.side === 'left' || value.side === 'right') && Number.isFinite(Number(value.yRatio))) {
      backPosition = {side: value.side, yRatio: clampValue(Number(value.yRatio), 0, 1)}
    }
  } catch (_) { /* optional */ }
}

const resetHorizontalPosition = () => {
  document.documentElement.scrollLeft = 0
  document.body.scrollLeft = 0
  const composer = $('#composer-view')
  if (composer) composer.scrollLeft = 0
}

const syncVisualViewport = () => {
  cancelAnimationFrame(viewportFrame)
  viewportFrame = requestAnimationFrame(() => {
    const viewport = getViewportSize()
    document.documentElement.style.setProperty('--app-width', `${viewport.width}px`)
    document.documentElement.style.setProperty('--app-height', `${viewport.height}px`)
    resetHorizontalPosition()
    placeSavedBackButton()
  })
}

const showView = (view) => {
  document.body.dataset.view = view
  if (view === 'composer') requestAnimationFrame(() => {
    resetHorizontalPosition()
    placeSavedBackButton()
  })
}

const setLoading = (visible, copy = 'Preparing the moon palace') => {
  $('#loading-text').textContent = copy
  $('#loading-layer').classList.toggle('show', visible)
}

const showToast = (message) => {
  const toast = $('#toast')
  toast.textContent = message
  toast.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600)
}

const refreshSavedWork = () => {
  const result = loadWork()
  currentWork = result.work
  if (result.error) showToast(result.error)
  renderHome()
  renderSegments()
}

const renderHome = () => {
  const hasWork = Boolean(currentWork?.segments?.length)
  $('#home-ar-button').classList.toggle('hidden', !hasWork)
  $('#home-create-button').textContent = hasWork ? 'Continue Creating' : 'Create Music'
  $('#home-create-button').classList.toggle('primary', !hasWork)
  $('#home-create-button').classList.toggle('secondary', hasWork)
  $('#home-save-note').textContent = hasWork
    ? `${currentWork.segments.length} saved ${currentWork.segments.length === 1 ? 'take' : 'takes'} on this device.`
    : 'Your music will be saved on this device.'
}

const getDraftElapsed = () => {
  const running = recording ? performance.now() - recordStartedAt : 0
  return Math.min(MAX_SEGMENT_MS, draftElapsedMs + running)
}

const formatTime = value => `${(Math.max(0, value) / 1000).toFixed(1).padStart(4, '0')} / 30.0`

const setComposerStatus = status => {
  $('#composer-status').textContent = status
  $('#record-dot').classList.toggle('on', status === 'RECORDING')
}

const renderDraft = () => {
  $('#event-count').textContent = `${draftEvents.length} ${draftEvents.length === 1 ? 'note' : 'notes'}`
  $('#take-mode').textContent = `TAKE ${String((currentWork?.segments?.length || 0) + 1).padStart(2, '0')}`
  $('#record-button').textContent = recording ? 'Pause' : draftElapsedMs > 0 ? 'Resume' : 'Record'

  const draftCard = $('[data-take-id="draft"]')
  if (draftCard) {
    draftCard.querySelector('.take-card-state').textContent = recording ? 'Recording' : draftEvents.length ? 'Unsaved' : 'Current'
    draftCard.querySelector('.take-card-meta').textContent = `${draftEvents.length} ${draftEvents.length === 1 ? 'note' : 'notes'}`
    const listen = draftCard.querySelector('[data-listen-take]')
    const clear = draftCard.querySelector('[data-delete-take]')
    if (listen) {
      listen.disabled = !draftEvents.length
      listen.textContent = composerPlaying && playingTakeId === 'draft' ? 'Stop' : 'Listen'
    }
    if (clear) clear.disabled = !draftEvents.length && draftElapsedMs === 0
  }
}

const scrollTakeIntoView = (behavior = 'smooth') => {
  const list = $('#segment-list')
  const card = list?.querySelector('.take-card.selected')
  if (!list || !card) return
  const target = card.offsetLeft - (list.clientWidth - card.offsetWidth) / 2
  const left = clampValue(target, 0, Math.max(0, list.scrollWidth - list.clientWidth))
  list.scrollTo({left, behavior})
}

const renderSegments = ({scrollToSelection = false} = {}) => {
  const segments = currentWork?.segments || []
  const list = $('#segment-list')
  const previousScroll = list.scrollLeft
  $('#segment-count').textContent = String(segments.length)
  const savedCards = segments.map((segment, index) => {
    const selected = selectedTakeId === segment.id
    const listening = composerPlaying && playingTakeId === segment.id
    return `<div class="take-card${selected ? ' selected' : ''}" data-take-id="${segment.id}" role="option" aria-selected="${selected}">
      <button class="take-card-select" data-select-take="${segment.id}" type="button" aria-label="Select Take ${index + 1}"></button>
      <span class="take-card-copy"><span class="take-card-number">Take ${String(index + 1).padStart(2, '0')}</span><strong class="take-card-state">Saved</strong><span class="take-card-meta">${segment.events.length} ${segment.events.length === 1 ? 'note' : 'notes'} · ${(segment.durationMs / 1000).toFixed(1)}s</span></span>
      <span class="take-card-actions"><button class="take-inline-action" data-listen-take="${segment.id}" type="button">${listening ? 'Stop' : 'Listen'}</button><button class="take-inline-action danger" data-delete-take="${segment.id}" type="button">Delete</button></span>
    </div>`
  }).join('')
  const draftSelected = selectedTakeId === 'draft'
  const draftNumber = String(segments.length + 1).padStart(2, '0')
  const draftListening = composerPlaying && playingTakeId === 'draft'
  list.innerHTML = `${savedCards}<div class="take-card current${draftSelected ? ' selected' : ''}" data-take-id="draft" role="option" aria-selected="${draftSelected}">
    <button class="take-card-select" data-select-take="draft" type="button" aria-label="Select current Take ${draftNumber}"></button>
    <span class="take-card-copy"><span class="take-card-number">Take ${draftNumber}</span><strong class="take-card-state">${recording ? 'Recording' : draftEvents.length ? 'Unsaved' : 'Current'}</strong><span class="take-card-meta">${draftEvents.length} ${draftEvents.length === 1 ? 'note' : 'notes'}</span></span>
    <span class="take-card-actions"><button class="take-inline-action" data-listen-take="draft" type="button" ${draftEvents.length ? '' : 'disabled'}>${draftListening ? 'Stop' : 'Listen'}</button><button class="take-inline-action danger" data-delete-take="draft" type="button" ${draftEvents.length || draftElapsedMs > 0 ? '' : 'disabled'}>Clear</button></span>
  </div>`

  if (scrollToSelection) requestAnimationFrame(() => scrollTakeIntoView())
  else list.scrollLeft = previousScroll
}

const resetDraft = ({resetVisual = true} = {}) => {
  recording = false
  recordStartedAt = 0
  draftElapsedMs = 0
  draftEvents = []
  selectedTakeId = 'draft'
  if (resetVisual) composerVisual?.reset()
  setComposerStatus('READY')
  renderDraft()
  renderSegments({scrollToSelection: true})
}

const pauseRecording = () => {
  if (!recording) return
  draftElapsedMs = getDraftElapsed()
  recording = false
  setComposerStatus(draftEvents.length ? 'TAKE PAUSED' : 'PAUSED')
  renderDraft()
}

const stopComposerPlayback = ({resetVisual = false} = {}) => {
  player.stop({resetVisual, visual: composerVisual})
  composerPlaying = false
  playingTakeId = null
  setComposerStatus('READY')
  $('#play-all-button').textContent = 'Play full song'
  renderSegments()
}

const toggleRecording = () => {
  if (composerPlaying) stopComposerPlayback()
  if (recording) {
    pauseRecording()
    return
  }
  if (getDraftElapsed() >= MAX_SEGMENT_MS) {
    showToast('This take has reached 30 seconds.')
    return
  }
  audio.unlock()
  selectedTakeId = 'draft'
  recording = true
  recordStartedAt = performance.now()
  setComposerStatus('RECORDING')
  renderDraft()
  renderSegments({scrollToSelection: true})
}

const flashTone = tone => {
  const data = TONES[tone]
  const button = $(`.note-key[data-note="${tone}"]`)
  button?.classList.add('active')
  setTimeout(() => button?.classList.remove('active'), 170)

  const flash = $('#tone-flash')
  flash.textContent = data.char
  flash.style.color = `#${data.color.toString(16).padStart(6, '0')}`
  flash.animate([
    {opacity: 0, transform: 'translate(-50%, -50%) scale(.65)'},
    {opacity: .9, offset: .2, transform: 'translate(-50%, -50%) scale(1.04)'},
    {opacity: 0, transform: 'translate(-50%, -50%) scale(1.28)'},
  ], {duration: 760, easing: 'ease-out'})
}

const playLiveTone = async tone => {
  try {
    audio.unlock()
    await audio.load()
    audio.play(tone)
    composerVisual?.trigger(tone)
    flashTone(tone)
    if (recording) {
      selectedTakeId = 'draft'
      const t = Math.min(MAX_SEGMENT_MS, Math.max(0, Math.round(getDraftElapsed())))
      draftEvents.push({t: Math.round(t), note: tone})
      draftEvents.sort((a, b) => a.t - b.t)
      renderDraft()
    }
  } catch (error) {
    console.error('[Moon Rabbit] Tone playback failed:', error)
    showToast('The instrument samples could not be loaded.')
  }
}

const persistWork = () => {
  try {
    currentWork = saveWork(currentWork)
    renderHome()
    renderSegments()
    return true
  } catch (error) {
    showToast(error.message)
    return false
  }
}

const saveCurrentSegment = ({quiet = false} = {}) => {
  if (composerPlaying) stopComposerPlayback()
  pauseRecording()
  if (!draftEvents.length) {
    if (!quiet) showToast('Play at least one tone before saving.')
    return false
  }
  let durationMs = Math.max(draftElapsedMs, draftEvents[draftEvents.length - 1].t + 120)
  durationMs = Math.min(MAX_SEGMENT_MS, Math.round(durationMs))
  const work = currentWork || createWork()
  const candidate = {...work, segments: [...work.segments]}
  candidate.segments.push(createSegment({
    index: candidate.segments.length,
    mode: draftMode,
    durationMs,
    events: draftEvents,
  }))
  const previousWork = currentWork
  currentWork = candidate
  if (!persistWork()) {
    currentWork = previousWork
    return false
  }
  resetDraft()
  if (!quiet) showToast('Take saved. A new take is ready.')
  return true
}

const getSelectedSegment = () => {
  if (selectedTakeId !== 'draft') {
    return currentWork?.segments?.find(segment => segment.id === selectedTakeId) || null
  }
  if (!draftEvents.length) return null
  return {
    id: 'draft',
    name: 'Current take',
    mode: 'free',
    bpm: 90,
    durationMs: Math.min(MAX_SEGMENT_MS, Math.max(draftElapsedMs, draftEvents[draftEvents.length - 1].t + 120)),
    events: draftEvents.map(event => ({...event})),
  }
}

const playSelectedTake = async () => {
  if (composerPlaying) {
    const wasSameTake = playingTakeId === selectedTakeId
    stopComposerPlayback()
    if (wasSameTake) return
  }
  pauseRecording()
  const segment = getSelectedSegment()
  if (!segment) {
    showToast('Select a recorded take first.')
    return
  }
  try {
    audio.unlock()
    await audio.load()
    composerPlaying = true
    playingTakeId = selectedTakeId
    setComposerStatus('LISTENING')
    renderSegments()
    player.play([segment], {
      visual: composerVisual,
      onTone: tone => flashTone(tone),
      onComplete: () => {
        composerPlaying = false
        playingTakeId = null
        setComposerStatus('READY')
        renderSegments()
      },
    })
  } catch (error) {
    console.error('[Moon Rabbit] Take playback failed:', error)
    composerPlaying = false
    playingTakeId = null
    renderSegments()
    showToast('This take could not be played.')
  }
}

const playAllInComposer = async () => {
  if (composerPlaying) {
    stopComposerPlayback()
    return
  }
  if (draftEvents.length) {
    showToast('Save the current take before playing the full song.')
    return
  }
  if (!currentWork?.segments?.length) {
    showToast('Save a take first.')
    return
  }
  pauseRecording()
  try {
    audio.unlock()
    await audio.load()
    composerPlaying = true
    playingTakeId = 'all'
    $('#play-all-button').textContent = 'Stop playback'
    renderSegments()
    setComposerStatus('PLAYING')
    player.play(currentWork.segments, {
      visual: composerVisual,
      onTone: tone => flashTone(tone),
      onHarmony: () => setComposerStatus('FIVE TONES IN HARMONY'),
      onComplete: () => {
        composerPlaying = false
        playingTakeId = null
        setComposerStatus('READY')
        $('#play-all-button').textContent = 'Play full song'
        renderSegments()
      },
    })
  } catch (error) {
    console.error('[Moon Rabbit] Composer playback failed:', error)
    composerPlaying = false
    playingTakeId = null
    $('#play-all-button').textContent = 'Play full song'
    renderSegments()
    showToast('Your song could not be played.')
  }
}

const destroyComposerVisual = () => {
  player.stop()
  composerPlaying = false
  playingTakeId = null
  composerVisual?.dispose()
  composerVisual = null
}

const openComposer = async ({unlock = true} = {}) => {
  if (unlock) audio.unlock()
  syncVisualViewport()
  showView('composer')
  setLoading(true, 'Tuning the five tones')
  $$('.note-key').forEach(button => { button.disabled = true })
  try {
    const [, texture] = await Promise.all([audio.load(), loadSharedTargetTexture()])
    if (!composerVisual) {
      composerVisual = new MoonRabbitVisual({texture, targetData: IMAGE_TARGET_DATA})
      composerVisual.mount($('#composer-canvas'))
    }
    renderDraft()
    renderSegments({scrollToSelection: true})
    resetHorizontalPosition()
  } catch (error) {
    console.error('[Moon Rabbit] Composer failed to initialize:', error)
    showToast('The composer could not be opened on this device.')
  } finally {
    $$('.note-key').forEach(button => { button.disabled = false })
    setLoading(false)
  }
}

const closeComposer = () => {
  pauseRecording()
  if (draftEvents.length && !window.confirm('Discard this unsaved take?')) return
  resetDraft({resetVisual: false})
  destroyComposerVisual()
  refreshSavedWork()
  showView('home')
}

const startOver = () => {
  if (!currentWork?.segments?.length && !draftEvents.length && draftElapsedMs === 0) return
  if (!window.confirm('Delete your saved song and start over?')) return
  if (composerPlaying) stopComposerPlayback()
  else player.stop()
  clearWork()
  currentWork = null
  resetDraft()
  renderSegments()
  renderHome()
  showToast('Your saved song was removed.')
}

const deleteSegment = id => {
  const segment = currentWork?.segments?.find(item => item.id === id)
  const takeIndex = currentWork?.segments?.findIndex(item => item.id === id) ?? -1
  if (!segment || !window.confirm(`Delete Take ${String(takeIndex + 1).padStart(2, '0')}?`)) return
  currentWork.segments = currentWork.segments.filter(item => item.id !== id)
  if (!currentWork.segments.length) {
    clearWork()
    currentWork = null
  } else {
    persistWork()
  }
  selectedTakeId = 'draft'
  renderSegments()
  renderHome()
}

const deleteSelectedTake = () => {
  if (selectedTakeId === 'draft') {
    if (!draftEvents.length && draftElapsedMs === 0) return
    if (!window.confirm('Clear the current unsaved take?')) return
    resetDraft()
    return
  }
  deleteSegment(selectedTakeId)
}

const selectTake = id => {
  if (id !== 'draft' && !currentWork?.segments?.some(segment => segment.id === id)) return
  if (composerPlaying) stopComposerPlayback()
  pauseRecording()
  selectedTakeId = id
  setComposerStatus(id === 'draft' ? (draftEvents.length ? 'TAKE PAUSED' : 'READY') : 'TAKE SELECTED')
  renderSegments({scrollToSelection: true})
}

const listenToTake = (id) => {
  if (id !== 'draft' && !currentWork?.segments?.some(segment => segment.id === id)) return
  if (composerPlaying && playingTakeId === id) {
    stopComposerPlayback()
    return
  }
  if (composerPlaying) stopComposerPlayback()
  pauseRecording()
  selectedTakeId = id
  renderSegments({scrollToSelection: true})
  playSelectedTake()
}

const deleteTake = (id) => {
  if (composerPlaying) stopComposerPlayback()
  selectedTakeId = id
  deleteSelectedTake()
}

const optionalPipelineModule = factory => factory?.pipelineModule ? [factory.pipelineModule()] : []

const ensureXrController = () => {
  if (window.XR8?.XrController) return Promise.resolve()
  if (window.XR8?.loadChunk) return window.XR8.loadChunk('slam')
  return Promise.reject(new Error('XR8.XrController is not available.'))
}

const loadExternalScript = ({id, src, ready}) => {
  if (ready()) return Promise.resolve()
  return new Promise((resolve, reject) => {
    let script = document.getElementById(id)
    let created = false
    const onLoad = () => {
      script.dataset.loaded = 'true'
      if (ready()) resolve()
      else reject(new Error(`${src} loaded without its expected global.`))
    }
    const onError = () => reject(new Error(`${src} failed to load.`))
    if (!script) {
      script = document.createElement('script')
      created = true
      script.id = id
      script.async = true
      script.crossOrigin = 'anonymous'
      script.src = src
    }
    if (script.dataset.loaded === 'true') {
      reject(new Error(`${src} loaded without its expected global.`))
      return
    }
    script.addEventListener('load', onLoad, {once: true})
    script.addEventListener('error', onError, {once: true})
    if (created) document.head.appendChild(script)
  })
}

const loadXrSupport = () => {
  if (window.XRExtras && window.LandingPage) return Promise.resolve()
  if (xrSupportLoading) return xrSupportLoading
  xrSupportLoading = Promise.all([
    loadExternalScript({
      id: 'xrextras-runtime-script',
      src: './external/xrextras/xrextras.js',
      ready: () => Boolean(window.XRExtras),
    }),
    loadExternalScript({
      id: 'landing-page-runtime-script',
      src: './external/landing-page/landing-page.js',
      ready: () => Boolean(window.LandingPage),
    }),
  ]).catch((error) => {
    xrSupportLoading = null
    throw error
  })
  return xrSupportLoading
}

const loadXrRuntime = () => {
  if (window.XR8) return window.XR8.loadChunk ? window.XR8.loadChunk('slam') : Promise.resolve()
  if (xrRuntimeLoading) return xrRuntimeLoading
  xrRuntimeLoading = new Promise((resolve, reject) => {
    window.addEventListener('xrloaded', resolve, {once: true})
    const existing = document.getElementById('xr-runtime-script')
    if (existing) {
      existing.addEventListener('error', reject, {once: true})
      return
    }
    const script = document.createElement('script')
    script.id = 'xr-runtime-script'
    script.async = true
    script.crossOrigin = 'anonymous'
    script.src = './external/xr/xr.js'
    script.setAttribute('data-preload-chunks', 'slam')
    script.addEventListener('error', () => reject(new Error('XR runtime failed to load.')), {once: true})
    document.head.appendChild(script)
  }).catch((error) => {
    xrRuntimeLoading = null
    throw error
  })
  return xrRuntimeLoading
}

const applyTargetPose = detail => {
  if (!arVisual || detail.name !== TARGET_NAME) return
  const {position, rotation, scale = 1} = detail
  arVisual.root.visible = true
  arVisual.root.position.set(position.x, position.y, position.z)
  arVisual.root.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w)
  arVisual.root.scale.setScalar(scale > 0 ? scale : 1)
}

const resetArTarget = () => {
  targetVisible = false
  targetPlaybackStarted = false
  player.stop({resetVisual: true, visual: arVisual})
  if (arVisual) arVisual.root.visible = false
}

const playWorkInAr = () => {
  if (!currentWork?.segments?.length || !arVisual || targetPlaybackStarted) return
  targetPlaybackStarted = true
  player.play(currentWork.segments, {
    visual: arVisual,
  })
}

const onTargetFound = ({detail}) => {
  if (detail.name !== TARGET_NAME) return
  const isNewAcquisition = !targetVisible
  targetVisible = true
  applyTargetPose(detail)
  if (isNewAcquisition) {
    targetPlaybackStarted = false
    arVisual?.reset()
    playWorkInAr()
  }
}

const onTargetUpdated = ({detail}) => {
  if (detail.name !== TARGET_NAME) return
  if (!targetVisible) return
  applyTargetPose(detail)
}

const onTargetLost = ({detail}) => {
  if (detail.name !== TARGET_NAME) return
  resetArTarget()
}

const arPipelineModule = () => ({
  name: 'moon-rabbit-five-tones',
  listeners: [
    {event: 'reality.imagefound', process: onTargetFound},
    {event: 'reality.imageupdated', process: onTargetUpdated},
    {event: 'reality.imagelost', process: onTargetLost},
  ],
  onStart: () => {
    const {scene} = XR8.Threejs.xrScene()
    arVisual = new MoonRabbitVisual({texture: arTexture, targetData: IMAGE_TARGET_DATA})
    arVisual.root.visible = false
    scene.add(arVisual.root)
  },
  onUpdate: () => arVisual?.update(performance.now() / 1000),
  onDetach: () => {
    arVisual?.dispose()
    arVisual = null
  },
})

const startXrEngine = async () => {
  if (xrStarted) return
  await ensureXrController()
  XR8.XrController.configure({
    imageTargetData: [IMAGE_TARGET_DATA],
    disableWorldTracking: true,
  })
  XR8.addCameraPipelineModules([
    XR8.GlTextureRenderer.pipelineModule(),
    XR8.Threejs.pipelineModule(),
    XR8.XrController.pipelineModule(),
    ...optionalPipelineModule(window.LandingPage),
    ...optionalPipelineModule(window.XRExtras?.FullWindowCanvas),
    ...optionalPipelineModule(window.XRExtras?.Loading),
    ...optionalPipelineModule(window.XRExtras?.RuntimeError),
    arPipelineModule(),
  ])
  xrStarted = true
  XR8.run({
    canvas: $('#camerafeed'),
    allowedDevices: XR8.XrConfig.device().ANY,
  })
}

const startAr = async () => {
  if (arStarting || !currentWork?.segments?.length) {
    if (!currentWork?.segments?.length) showToast('Create and save a take first.')
    return
  }
  arStarting = true
  audio.unlock()
  pauseRecording()
  destroyComposerVisual()
  showView('ar')
  setLoading(true, 'Opening the camera')
  try {
    const [, texture] = await Promise.all([
      audio.load(),
      loadSharedTargetTexture(),
      loadXrSupport(),
      loadXrRuntime(),
    ])
    arTexture = texture
    await startXrEngine()
  } catch (error) {
    console.error('[Moon Rabbit] AR failed to start:', error)
    showView('home')
    showToast('AR could not start. Check camera permission and try again.')
    xrStarted = false
  } finally {
    arStarting = false
    setLoading(false)
  }
}

const saveAndStartAr = () => {
  audio.unlock()
  if (draftEvents.length && !saveCurrentSegment({quiet: true})) return
  if (!currentWork?.segments?.length) {
    showToast('Create and save a take first.')
    return
  }
  startAr()
}

const leaveArForComposer = () => {
  player.stop({resetVisual: true, visual: arVisual})
  try { window.XR8?.stop?.() } catch (error) { console.warn('[Moon Rabbit] XR stop failed:', error) }
  try { sessionStorage.setItem(AUTO_COMPOSER_KEY, '1') } catch (_) { /* optional */ }
  window.location.reload()
}

const installBackButtonDrag = () => {
  const button = $('#composer-back')
  let drag = null
  let suppressClick = false

  button.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: backButtonPoint.x,
      originY: backButtonPoint.y,
      moved: false,
    }
    try { button.setPointerCapture(event.pointerId) } catch (_) { /* optional */ }
  })

  button.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (!drag.moved && Math.hypot(dx, dy) < 6) return
    drag.moved = true
    button.classList.add('dragging')
    placeBackButton({x: drag.originX + dx, y: drag.originY + dy})
    event.preventDefault()
  })

  const finishDrag = (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return
    if (drag.moved) {
      const bounds = getBackBounds()
      const side = backButtonPoint.x > (bounds.minX + bounds.maxX) / 2 ? 'right' : 'left'
      placeBackButton({x: side === 'right' ? bounds.maxX : bounds.minX, y: backButtonPoint.y})
      saveBackButtonPosition()
      suppressClick = true
      setTimeout(() => { suppressClick = false }, 500)
    }
    button.classList.remove('dragging')
    try { button.releasePointerCapture(event.pointerId) } catch (_) { /* optional */ }
    drag = null
  }

  button.addEventListener('pointerup', finishDrag)
  button.addEventListener('pointercancel', finishDrag)
  button.addEventListener('click', (event) => {
    if (suppressClick) {
      suppressClick = false
      event.preventDefault()
      return
    }
    closeComposer()
  })
}

const installViewportSync = () => {
  loadBackButtonPosition()
  syncVisualViewport()
  window.addEventListener('resize', syncVisualViewport, {passive: true})
  window.addEventListener('orientationchange', syncVisualViewport, {passive: true})
  window.visualViewport?.addEventListener('resize', syncVisualViewport, {passive: true})
  window.visualViewport?.addEventListener('scroll', syncVisualViewport, {passive: true})
}

const installBrowserMenuGuards = () => {
  const preventBrowserMenu = event => event.preventDefault()
  document.addEventListener('contextmenu', preventBrowserMenu)
  document.addEventListener('selectstart', preventBrowserMenu)
  document.addEventListener('dragstart', preventBrowserMenu)
}

const installEvents = () => {
  $('#home-create-button').addEventListener('click', () => {
    audio.unlock()
    openComposer({unlock: false})
  })
  $('#home-ar-button').addEventListener('click', () => {
    audio.unlock()
    startAr()
  })
  $('#start-over-button').addEventListener('click', startOver)
  $('#record-button').addEventListener('click', toggleRecording)
  $('#save-segment-button').addEventListener('click', () => saveCurrentSegment())
  $('#play-all-button').addEventListener('click', playAllInComposer)
  $('#save-and-ar-button').addEventListener('click', saveAndStartAr)
  $('#ar-edit-button').addEventListener('click', leaveArForComposer)

  $$('.note-key').forEach(button => button.addEventListener('click', () => playLiveTone(button.dataset.note)))
  $('#segment-list').addEventListener('click', event => {
    const listenButton = event.target.closest('[data-listen-take]')
    if (listenButton) {
      listenToTake(listenButton.dataset.listenTake)
      return
    }
    const deleteButton = event.target.closest('[data-delete-take]')
    if (deleteButton) {
      deleteTake(deleteButton.dataset.deleteTake)
      return
    }
    const selectButton = event.target.closest('[data-select-take]')
    if (selectButton) selectTake(selectButton.dataset.selectTake)
  })
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return
    pauseRecording()
    if (composerPlaying && document.body.dataset.view === 'composer') stopComposerPlayback()
    else player.stop()
    if (document.body.dataset.view === 'ar') resetArTarget()
  })

  installBackButtonDrag()
  installViewportSync()
  installBrowserMenuGuards()
}

const updateComposerClock = () => {
  if (recording && getDraftElapsed() >= MAX_SEGMENT_MS) {
    draftElapsedMs = MAX_SEGMENT_MS
    recording = false
    setComposerStatus('30 SECOND LIMIT')
    renderDraft()
  }
  $('#take-time').textContent = formatTime(getDraftElapsed())
  requestAnimationFrame(updateComposerClock)
}

const init = () => {
  document.documentElement.style.setProperty('--poster-image', `url("${POSTER_IMAGE_URL}")`)
  const result = loadWork()
  currentWork = result.work
  installEvents()
  renderHome()
  renderDraft()
  renderSegments()
  requestAnimationFrame(updateComposerClock)
  if (result.error) showToast(result.error)

  let openComposerAfterAr = false
  try {
    openComposerAfterAr = sessionStorage.getItem(AUTO_COMPOSER_KEY) === '1'
    sessionStorage.removeItem(AUTO_COMPOSER_KEY)
  } catch (_) { /* optional */ }
  if (openComposerAfterAr) openComposer({unlock: false})
}

init()
