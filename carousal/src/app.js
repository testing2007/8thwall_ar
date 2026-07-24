const TARGET_NAME = 'trigger-label'
const DETAIL_EVENT = 'show-product-detail'

const updateDebugStatus = (message) => {
  const debugEl = document.getElementById('ar-debug-status')
  if (!debugEl) return
  debugEl.textContent = message
}

const onxrloaded = () => {
  XR8.XrController.configure({
    imageTargetData: [
      require('../image-targets/trigger-label.json'),
    ],
  })
}

window.XR8 ? onxrloaded() : window.addEventListener('xrloaded', onxrloaded)

const parseEntityList = (value) => value
  .split(',')
  .map(item => item.trim())
  .filter(Boolean)

AFRAME.registerComponent('curved-image', {
  schema: {
    src: {type: 'selector'},
    radius: {default: 0.62},
    height: {default: 1.45},
    thetaStart: {default: 1.95},
    thetaLength: {default: 2.4},
    segments: {default: 24},
    opacity: {default: 0.95},
  },

  init() {
    const {THREE} = AFRAME
    const applyTexture = () => {
      const {data} = this
      const texture = new THREE.Texture(data.src)
      texture.needsUpdate = true
      texture.colorSpace = THREE.SRGBColorSpace || texture.colorSpace

      const geometry = new THREE.CylinderGeometry(
        data.radius,
        data.radius,
        data.height,
        data.segments,
        1,
        true,
        data.thetaStart,
        data.thetaLength
      )

      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: data.opacity,
        side: THREE.DoubleSide,
        depthWrite: false,
      })

      this.mesh = new THREE.Mesh(geometry, material)
      this.mesh.rotation.y = Math.PI
      this.el.setObject3D('mesh', this.mesh)
    }

    if (this.data.src && this.data.src.complete) {
      applyTexture()
    } else if (this.data.src) {
      this.data.src.addEventListener('load', applyTexture, {once: true})
    }
  },

  remove() {
    if (!this.mesh) return
    this.el.removeObject3D('mesh')
    this.mesh.geometry.dispose()
    this.mesh.material.map.dispose()
    this.mesh.material.dispose()
  },
})

AFRAME.registerComponent('carousel-target', {
  schema: {
    items: {default: '#item-1,#item-2'},
    swipeThreshold: {default: 36},
  },

  init() {
    this.activeIndex = 0
    this.isFound = false
    this.dragStartX = null
    this.itemSelectors = parseEntityList(this.data.items)
    this.items = []
    this.targetEl = this.el.closest('xrextras-named-image-target') || this.el.parentEl
    this.sceneEl = this.el.sceneEl

    this.onFound = this.onFound.bind(this)
    this.onLost = this.onLost.bind(this)
    this.onImageFound = this.onImageFound.bind(this)
    this.onImageLost = this.onImageLost.bind(this)
    this.onImageScanning = this.onImageScanning.bind(this)
    this.onPointerDown = this.onPointerDown.bind(this)
    this.onPointerMove = this.onPointerMove.bind(this)
    this.onPointerUp = this.onPointerUp.bind(this)

    this.el.setAttribute('visible', false)

    this.el.addEventListener('loaded', () => {
      this.items = this.itemSelectors
        .map(selector => this.el.querySelector(selector))
        .filter(Boolean)
      this.layoutItems(false)
    })

    if (this.sceneEl) {
      this.sceneEl.addEventListener('xrimagescanning', this.onImageScanning)
      this.sceneEl.addEventListener('xrimagefound', this.onImageFound)
      this.sceneEl.addEventListener('xrimageupdated', this.onImageFound)
      this.sceneEl.addEventListener('xrimagelost', this.onImageLost)
    }

    window.addEventListener('pointerdown', this.onPointerDown, {passive: true})
    window.addEventListener('pointermove', this.onPointerMove, {passive: true})
    window.addEventListener('pointerup', this.onPointerUp, {passive: true})
    window.addEventListener('touchstart', this.onPointerDown, {passive: true})
    window.addEventListener('touchmove', this.onPointerMove, {passive: true})
    window.addEventListener('touchend', this.onPointerUp, {passive: true})
  },

  onFound() {
    this.isFound = true
    this.el.setAttribute('visible', true)
    updateDebugStatus('target found: ' + TARGET_NAME)
    this.el.setAttribute('animation__show', {
      property: 'scale',
      from: '0.82 0.82 0.82',
      to: '1 1 1',
      dur: 380,
      easing: 'easeOutCubic',
    })
    this.layoutItems(true)
  },

  onLost() {
    this.isFound = false
    this.el.setAttribute('visible', false)
    this.dragStartX = null
    updateDebugStatus('target lost: ' + TARGET_NAME)
  },

  onImageFound(event) {
    if (!event.detail || event.detail.name === TARGET_NAME) {
      this.onFound()
    }
  },

  onImageLost(event) {
    if (!event.detail || event.detail.name === TARGET_NAME) {
      this.onLost()
    }
  },

  onImageScanning(event) {
    const targets = event.detail && event.detail.imageTargets
      ? event.detail.imageTargets.map(target => target.name).join(', ')
      : TARGET_NAME
    updateDebugStatus('scanning: ' + targets)
  },

  getPointerX(event) {
    const touch = event.changedTouches && event.changedTouches[0]
    return touch ? touch.clientX : event.clientX
  },

  onPointerDown(event) {
    if (!this.isFound || document.body.dataset.detailOpen === 'true') return
    this.dragStartX = this.getPointerX(event)
  },

  onPointerMove(event) {
    if (this.dragStartX === null || !this.isFound) return
    const delta = this.getPointerX(event) - this.dragStartX
    if (Math.abs(delta) > this.data.swipeThreshold) {
      window.__carouselLastSwipeAt = Date.now()
      this.setActive(delta < 0 ? this.activeIndex + 1 : this.activeIndex - 1)
      this.dragStartX = null
    }
  },

  onPointerUp() {
    this.dragStartX = null
  },

  setActive(index) {
    if (!this.items.length) return
    const next = (index + this.items.length) % this.items.length
    if (next === this.activeIndex) return
    this.activeIndex = next
    this.layoutItems(true)
  },

  layoutItems(animated) {
    if (!this.items.length) return
    this.items.forEach((item, index) => {
      const relative = index - this.activeIndex
      const wrapped = relative > 1 ? relative - this.items.length : relative < -1 ? relative + this.items.length : relative
      const isActive = wrapped === 0
      const position = `${wrapped * 0.44} -0.08 ${isActive ? 0.22 : 0.12}`
      const scale = isActive ? '0.38 0.58 1' : '0.27 0.41 1'
      const opacity = isActive ? 1 : 0.42

      if (animated) {
        item.setAttribute('animation__pos', {
          property: 'position',
          to: position,
          dur: 240,
          easing: 'easeOutCubic',
        })
        item.setAttribute('animation__scale', {
          property: 'scale',
          to: scale,
          dur: 240,
          easing: 'easeOutCubic',
        })
        item.setAttribute('animation__opacity', {
          property: 'material.opacity',
          to: opacity,
          dur: 180,
          easing: 'linear',
        })
      } else {
        item.setAttribute('position', position)
        item.setAttribute('scale', scale)
        item.setAttribute('material', 'opacity', opacity)
      }

      item.setAttribute('data-active', isActive ? 'true' : 'false')
    })
  },

  remove() {
    if (this.sceneEl) {
      this.sceneEl.removeEventListener('xrimagescanning', this.onImageScanning)
      this.sceneEl.removeEventListener('xrimagefound', this.onImageFound)
      this.sceneEl.removeEventListener('xrimageupdated', this.onImageFound)
      this.sceneEl.removeEventListener('xrimagelost', this.onImageLost)
    }
    window.removeEventListener('pointerdown', this.onPointerDown)
    window.removeEventListener('pointermove', this.onPointerMove)
    window.removeEventListener('pointerup', this.onPointerUp)
    window.removeEventListener('touchstart', this.onPointerDown)
    window.removeEventListener('touchmove', this.onPointerMove)
    window.removeEventListener('touchend', this.onPointerUp)
  },
})

AFRAME.registerComponent('detail-opener', {
  schema: {
    id: {default: ''},
  },

  init() {
    this.onClick = this.onClick.bind(this)
    this.el.addEventListener('click', this.onClick)
  },

  onClick() {
    if (Date.now() - (window.__carouselLastSwipeAt || 0) < 260) return
    if (this.el.getAttribute('data-active') !== 'true') return
    window.dispatchEvent(new CustomEvent(DETAIL_EVENT, {
      detail: {id: this.data.id},
    }))
  },

  remove() {
    this.el.removeEventListener('click', this.onClick)
  },
})
