import * as THREE from 'three'

const POSTER_URL = require('./assets/video/1_poster.jpg')
const VIDEO_URL = require('./assets/video/1.mp4')

const CARD_WIDTH = 72
const CARD_HEIGHT = 46

const roundedRect = (ctx, x, y, width, height, radius) => {
  const r = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + width, y, x + width, y + height, r)
  ctx.arcTo(x + width, y + height, x, y + height, r)
  ctx.arcTo(x, y + height, x, y, r)
  ctx.arcTo(x, y, x + width, y, r)
  ctx.closePath()
}

const drawCoverImage = (ctx, image, x, y, width, height) => {
  const scale = Math.max(width / image.width, height / image.height)
  const sourceWidth = width / scale
  const sourceHeight = height / scale
  const sourceX = (image.width - sourceWidth) / 2
  const sourceY = (image.height - sourceHeight) / 2
  ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height)
}

const createPosterTexture = () => {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 654
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = '#101411'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#26342c'
  ctx.fillRect(0, 0, canvas.width, 576)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter

  const drawDetails = () => {
    ctx.fillStyle = 'rgba(12, 16, 13, 0.94)'
    ctx.fillRect(0, 576, canvas.width, 78)

    ctx.strokeStyle = '#d6b56d'
    ctx.lineWidth = 5
    roundedRect(ctx, 4, 4, canvas.width - 8, canvas.height - 8, 14)
    ctx.stroke()

    ctx.fillStyle = '#f8f4e9'
    ctx.font = '600 30px Arial, sans-serif'
    ctx.fillText('酒庄故事', 34, 625)
    ctx.fillStyle = '#d6b56d'
    ctx.font = '600 22px Arial, sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText('DISCOVER THE WINERY  >', canvas.width - 34, 624)
    ctx.textAlign = 'left'

    const cx = canvas.width / 2
    const cy = 288
    ctx.beginPath()
    ctx.arc(cx, cy, 62, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(12, 16, 13, 0.72)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.82)'
    ctx.lineWidth = 4
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(cx - 16, cy - 25)
    ctx.lineTo(cx - 16, cy + 25)
    ctx.lineTo(cx + 28, cy)
    ctx.closePath()
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    texture.needsUpdate = true
  }

  drawDetails()

  const image = new Image()
  image.onload = () => {
    drawCoverImage(ctx, image, 0, 0, canvas.width, 576)
    drawDetails()
  }
  image.src = POSTER_URL

  return texture
}

const createVideoElement = () => {
  const video = document.createElement('video')
  video.className = 'cadiphy-winery-video'
  video.src = VIDEO_URL
  video.poster = POSTER_URL
  video.playsInline = true
  video.controls = true
  video.preload = 'auto'
  video.muted = false
  video.defaultMuted = false
  video.volume = 1
  video.setAttribute('playsinline', '')
  video.setAttribute('webkit-playsinline', '')
  return video
}

const getEventPoint = (event) => {
  const touch = event.changedTouches?.[0] || event.touches?.[0]
  if (touch) {
    return {
      clientX: touch.clientX,
      clientY: touch.clientY,
    }
  }
  return {
    clientX: event.clientX,
    clientY: event.clientY,
  }
}

const triggerVideoHaptic = () => {
  try {
    return Boolean(navigator.vibrate?.([18, 28, 18]))
  } catch {
    // Haptics are optional and should never block video playback.
    return false
  }
}

const triggerVideoTapFallback = () => {
  document.body.classList.remove('cadiphy-video-tap-feedback')
  document.body.offsetWidth
  document.body.classList.add('cadiphy-video-tap-feedback')
  window.setTimeout(() => {
    document.body.classList.remove('cadiphy-video-tap-feedback')
  }, 260)
}

export class WineryStoryController {
  constructor({ camera, canvas, onOpen, onClose }) {
    this.camera = camera
    this.canvas = canvas
    this.onOpen = onOpen
    this.onClose = onClose
    this.raycaster = new THREE.Raycaster()
    this.pointer = new THREE.Vector2()
    this.root = new THREE.Group()
    this.root.name = 'CAD_Winery_Story_Card'
    this.root.position.set(0, 0, 51)
    this.root.scale.setScalar(0.82)
    this.root.visible = false
    this.visible = false
    this.interactive = false
    this.revealProgress = 0
    this.video = null
    this.lastTouchTime = 0

    const posterMaterial = new THREE.MeshBasicMaterial({
      map: createPosterTexture(),
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    })
    const poster = new THREE.Mesh(
      new THREE.PlaneGeometry(CARD_WIDTH, CARD_HEIGHT),
      posterMaterial
    )
    poster.renderOrder = 200
    this.root.add(poster)
    this.posterMaterial = posterMaterial

    const hitMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
    })
    this.hitArea = new THREE.Mesh(
      new THREE.PlaneGeometry(CARD_WIDTH + 5, CARD_HEIGHT + 5),
      hitMaterial
    )
    this.hitArea.position.z = 0.5
    this.hitArea.userData.interactionType = 'winery-story'
    this.root.add(this.hitArea)

    this.handleWindowTap = this.handleWindowTap.bind(this)
    this.handleHitButtonTap = this.handleHitButtonTap.bind(this)
    this.buildOverlay()
    this.buildHitButton()
    window.addEventListener('touchend', this.handleWindowTap, {
      capture: true,
      passive: true,
    })
    window.addEventListener('click', this.handleWindowTap, {
      capture: true,
      passive: true,
    })
  }

  attachTo(parent) {
    parent.add(this.root)
  }

  show() {
    if (this.visible) return
    this.visible = true
    this.interactive = true
    this.revealProgress = 0
    this.root.visible = true
    this.root.scale.setScalar(0.82)
    this.posterMaterial.opacity = 0
    this.updateHitButton()
  }

  hide() {
    this.visible = false
    this.interactive = false
    this.root.visible = false
    this.revealProgress = 0
    this.posterMaterial.opacity = 0
    this.updateHitButton()
  }

  update(delta) {
    this.updateHitButton()
    if (!this.visible || this.revealProgress >= 1) return
    this.revealProgress = Math.min(1, this.revealProgress + delta / 0.48)
    const eased = 1 - Math.pow(1 - this.revealProgress, 3)
    this.root.scale.setScalar(0.82 + eased * 0.18)
    this.posterMaterial.opacity = eased
    this.updateHitButton()
  }

  handleWindowTap(event) {
    if (!this.interactive || this.video) return
    if (event.target instanceof Element && event.target.closest('.cadiphy-ui')) return
    if (event.type === 'touchend') {
      this.lastTouchTime = performance.now()
    } else if (performance.now() - this.lastTouchTime < 650) {
      return
    }

    const rect = this.canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const point = getEventPoint(event)
    if (point.clientX === undefined || point.clientY === undefined) return
    this.pointer.x = ((point.clientX - rect.left) / rect.width) * 2 - 1
    this.pointer.y = -((point.clientY - rect.top) / rect.height) * 2 + 1
    this.camera.updateMatrixWorld()
    this.root.updateWorldMatrix(true, true)
    this.raycaster.setFromCamera(this.pointer, this.camera)
    if (!this.raycaster.intersectObject(this.hitArea, false).length &&
        !this.isInsideProjectedCard(point.clientX, point.clientY, rect)) return

    this.openVideoFromGesture()
  }

  handleHitButtonTap(event) {
    if (!this.interactive || this.video) return
    if (event.type === 'touchend') {
      this.lastTouchTime = performance.now()
    } else if (performance.now() - this.lastTouchTime < 650) {
      return
    }
    event.preventDefault?.()
    event.stopPropagation?.()
    this.openVideoFromGesture()
  }

  openVideoFromGesture() {
    this.interactive = false
    this.updateHitButton()
    if (!triggerVideoHaptic()) triggerVideoTapFallback()

    // Keep creation and play() in the trusted tap stack for iOS Safari.
    const video = createVideoElement()
    const playPromise = video.play()
    if (playPromise) {
      playPromise.catch(() => {
        video.muted = true
        return video.play().catch(() => undefined)
      })
    }
    this.openVideo(video)
  }

  getProjectedCardBounds(rect) {
    if (!this.visible || !this.camera || !rect.width || !rect.height) return null
    this.camera.updateMatrixWorld()
    this.root.updateWorldMatrix(true, true)
    const points = [
      new THREE.Vector3(-CARD_WIDTH / 2, -CARD_HEIGHT / 2, 0),
      new THREE.Vector3(CARD_WIDTH / 2, -CARD_HEIGHT / 2, 0),
      new THREE.Vector3(CARD_WIDTH / 2, CARD_HEIGHT / 2, 0),
      new THREE.Vector3(-CARD_WIDTH / 2, CARD_HEIGHT / 2, 0),
    ].map((point) => {
      this.root.localToWorld(point)
      point.project(this.camera)
      return {
        x: rect.left + (point.x + 1) * rect.width / 2,
        y: rect.top + (1 - point.y) * rect.height / 2,
      }
    })
    const xs = points.map((point) => point.x)
    const ys = points.map((point) => point.y)
    return {
      left: Math.min(...xs),
      right: Math.max(...xs),
      top: Math.min(...ys),
      bottom: Math.max(...ys),
    }
  }

  updateHitButton() {
    if (!this.hitButton || !this.canvas) return
    const shouldShow = this.visible && this.interactive && !this.video
    if (!shouldShow) {
      this.hitButton.hidden = true
      return
    }
    const bounds = this.getProjectedCardBounds(this.canvas.getBoundingClientRect())
    if (!bounds) {
      this.hitButton.hidden = true
      return
    }
    const padding = 18
    this.hitButton.hidden = false
    this.hitButton.style.left = `${Math.max(0, bounds.left - padding)}px`
    this.hitButton.style.top = `${Math.max(0, bounds.top - padding)}px`
    this.hitButton.style.width = `${Math.max(44, bounds.right - bounds.left + padding * 2)}px`
    this.hitButton.style.height = `${Math.max(44, bounds.bottom - bounds.top + padding * 2)}px`
  }

  isInsideProjectedCard(clientX, clientY, rect) {
    const corners = [
      new THREE.Vector3(-CARD_WIDTH / 2, -CARD_HEIGHT / 2, 0),
      new THREE.Vector3(CARD_WIDTH / 2, -CARD_HEIGHT / 2, 0),
      new THREE.Vector3(CARD_WIDTH / 2, CARD_HEIGHT / 2, 0),
      new THREE.Vector3(-CARD_WIDTH / 2, CARD_HEIGHT / 2, 0),
    ].map((point) => {
      this.root.localToWorld(point)
      point.project(this.camera)
      return new THREE.Vector2(
        rect.left + (point.x + 1) * rect.width / 2,
        rect.top + (1 - point.y) * rect.height / 2
      )
    })

    const point = new THREE.Vector2(clientX, clientY)
    return this.isInsideTriangle(point, corners[0], corners[1], corners[2]) ||
      this.isInsideTriangle(point, corners[0], corners[2], corners[3])
  }

  isInsideTriangle(point, a, b, c) {
    const sign = (p1, p2, p3) =>
      (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y)
    const d1 = sign(point, a, b)
    const d2 = sign(point, b, c)
    const d3 = sign(point, c, a)
    const hasNegative = d1 < 0 || d2 < 0 || d3 < 0
    const hasPositive = d1 > 0 || d2 > 0 || d3 > 0
    return !(hasNegative && hasPositive)
  }

  openVideo(video) {
    this.video = video
    this.updateHitButton()
    this.videoShell.insertBefore(video, this.closeButton)
    this.overlay.hidden = false
    requestAnimationFrame(() => this.overlay.classList.add('is-visible'))
    document.body.classList.add('cadiphy-video-open')
    this.onOpen?.()
  }

  closeVideo() {
    if (!this.video) return
    const video = this.video
    this.video = null
    video.pause()
    video.removeAttribute('src')
    video.load()
    video.remove()
    this.overlay.classList.remove('is-visible')
    this.overlay.hidden = true
    document.body.classList.remove('cadiphy-video-open')
    this.interactive = this.visible
    this.updateHitButton()
    this.onClose?.()
  }

  buildHitButton() {
    const button = document.createElement('button')
    button.className = 'cadiphy-winery-hit-button cadiphy-ui'
    button.type = 'button'
    button.hidden = true
    button.setAttribute('aria-label', '播放酒庄故事视频')
    button.addEventListener('touchend', this.handleHitButtonTap, {
      capture: true,
      passive: false,
    })
    button.addEventListener('click', this.handleHitButtonTap, {
      capture: true,
      passive: false,
    })
    document.body.append(button)
    this.hitButton = button
  }

  buildOverlay() {
    const overlay = document.createElement('div')
    overlay.className = 'cadiphy-winery-overlay cadiphy-ui'
    overlay.hidden = true
    overlay.setAttribute('role', 'dialog')
    overlay.setAttribute('aria-label', '酒庄故事视频')

    const shell = document.createElement('div')
    shell.className = 'cadiphy-winery-shell'

    const closeButton = document.createElement('button')
    closeButton.className = 'cadiphy-winery-close'
    closeButton.type = 'button'
    closeButton.setAttribute('aria-label', '关闭酒庄故事视频')
    closeButton.textContent = '×'
    closeButton.addEventListener('click', () => this.closeVideo())

    shell.append(closeButton)
    overlay.append(shell)
    document.body.append(overlay)
    this.overlay = overlay
    this.videoShell = shell
    this.closeButton = closeButton
  }
}
