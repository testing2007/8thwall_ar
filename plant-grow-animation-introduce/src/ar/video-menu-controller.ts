import gsap from 'gsap'
import {
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
} from 'three'

import {COLORS, LAYOUT, videos} from './config'
import {disposeObjectTree} from './resource-disposer'
import type {VideoItem} from './types'

// ─── Types ─────────────────────────────────────────────────────────────────

type ArVideoCard = {
  item: VideoItem
  root: Group
  hitArea: Mesh
  material: MeshBasicMaterial
  baseX: number
  baseY: number
}

// ─── VideoMenuController ────────────────────────────────────────────────────
//
// Dual-mode video menu:
//   • AR mode  — Three.js floating cards attached to the image-target anchor,
//                shown while the target is visible (on the bottle label).
//   • Drawer mode — HTML bottom-drawer, shown when the target is lost so the
//                   user can still choose and play a video.
// ---------------------------------------------------------------------------

export class VideoMenuController {
  readonly root = new Group()

  // ── AR (Three.js) state ──
  private arCards: ArVideoCard[] = []
  private arFloatTweens: gsap.core.Tween[] = []
  private arActiveTimeline: gsap.core.Timeline | null = null
  private arVisible = false

  // ── Drawer (HTML) state ──
  private drawer: HTMLDivElement | null = null
  private drawerCardEls: Map<string, HTMLElement> = new Map()
  private drawerVisible = false

  // ── Shared ──
  private onSelectCallback: ((item: VideoItem) => void) | null = null

  constructor(private readonly items = videos) {
    this.root.name = 'VideoMenuRoot'
    this.root.position.set(0, LAYOUT.videoMenuY, LAYOUT.videoMenuZ)

    this.createArCards()
    this.ensureDrawerStyles()
    this.buildDrawer()
    this.reset()
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  get isVisible() {
    return this.arVisible || this.drawerVisible
  }

  get arIsVisible() { return this.arVisible }
  get drawerIsVisible() { return this.drawerVisible }

  setOnSelect(callback: (item: VideoItem) => void) {
    this.onSelectCallback = callback
  }

  // ── AR menu (Three.js cards) ────────────────────────────────────────────

  async showArCards() {
    this.killArTimelines()
    this.root.visible = true

    const timeline = gsap.timeline()
    this.arActiveTimeline = timeline

    this.arCards.forEach((card, index) => {
      card.root.visible = true
      card.root.position.set(0, 0.05, 0)
      card.root.scale.setScalar(0.4)
      card.material.opacity = 0

      const delay = index * 0.1
      timeline.to(card.root.position, {
        x: card.baseX,
        y: card.baseY,
        duration: 0.45,
        ease: 'power2.out',
      }, delay)
      timeline.to(card.root.scale, {
        x: 1, y: 1, z: 1,
        duration: 0.45,
        ease: 'back.out(1.6)',
      }, delay)
      timeline.to(card.material, {
        opacity: 0.88,
        duration: 0.35,
        ease: 'power2.out',
      }, delay)
    })

    await timeline.then()
    this.arActiveTimeline = null
    this.arVisible = true
    this.startArFloating()
  }

  hideArCards() {
    this.killArTimelines()
    this.root.visible = false
    this.arVisible = false
    this.arCards.forEach((card) => {
      card.root.visible = false
      card.root.position.set(card.baseX, card.baseY, 0)
      card.root.scale.setScalar(0.4)
      card.material.opacity = 0
    })
  }

  async selectArCard(item: VideoItem) {
    this.killArFloating()
    const timeline = gsap.timeline()
    this.arActiveTimeline = timeline

    this.arCards.forEach((card) => {
      if (card.item.id === item.id) {
        timeline.to(card.root.position, {x: 0, y: 0, z: 0.045, duration: 0.38, ease: 'power2.inOut'}, 0)
        timeline.to(card.root.scale, {x: 1.16, y: 1.16, z: 1.16, duration: 0.28, yoyo: true, repeat: 1, ease: 'power2.inOut'}, 0)
      } else {
        timeline.to(card.root.scale, {x: 0.35, y: 0.35, z: 0.35, duration: 0.32, ease: 'power2.in'}, 0)
        timeline.to(card.material, {opacity: 0, duration: 0.28, ease: 'power2.in'}, 0)
      }
    })

    await timeline.then()
    this.arActiveTimeline = null
    this.hideArCards()
  }

  // ── Drawer (HTML) ──────────────────────────────────────────────────────

  async showDrawer() {
    if (!this.drawer || this.drawerVisible) return
    this.drawer.hidden = false
    void this.drawer.offsetHeight  // force reflow
    this.drawer.classList.add('ar-drawer--visible')
    this.drawerVisible = true
    return waitFrame()
  }

  async hideDrawer() {
    if (!this.drawer || !this.drawerVisible) return
    this.drawer.classList.remove('ar-drawer--visible')
    this.drawerVisible = false
    await waitMs(340)
    if (!this.drawerVisible) this.drawer.hidden = true
  }

  // ── Unified (called by timeline) ───────────────────────────────────────

  /** Used by timeline for backward compat. Call showArCards() or showDrawer() directly instead. */
  async showVideoMenu() {
    await this.showArCards()
  }

  /** Called when user taps a card (from either AR or drawer). */
  async selectCard(item: VideoItem) {
    // Hide both menus.
    void this.selectArCard(item)
    void this.hideDrawer()
    await waitMs(380)
  }

  async hide() {
    this.hideArCards()
    await this.hideDrawer()
  }

  reset() {
    this.killArTimelines()
    this.root.visible = false
    this.arVisible = false
    this.arCards.forEach((card) => {
      card.root.visible = false
      card.root.position.set(card.baseX, card.baseY, 0)
      card.root.scale.setScalar(0.4)
      card.material.opacity = 0
    })

    if (this.drawer) {
      this.drawer.classList.remove('ar-drawer--visible')
      this.drawerVisible = false
      this.drawer.hidden = true
      this.drawerCardEls.forEach((card) => card.classList.remove('ar-video-card--active'))
    }
  }

  dispose() {
    this.killArTimelines()
    disposeObjectTree(this.root)
    this.drawer?.remove()
    this.drawer = null
    this.drawerCardEls.clear()
  }

  /** Returns AR hit areas so InteractionController raycasting still works. */
  getInteractiveObjects() {
    return this.arCards.map(card => card.hitArea)
  }

  getItemById(videoId: string) {
    return this.items.find(item => item.id === videoId)
  }

  // ─── Three.js AR card construction ──────────────────────────────────────

  private createArCards() {
    const positions = [
      {x: -0.42, y: -0.1},
      {x: 0, y: 0.05},
      {x: 0.42, y: -0.1},
    ]

    this.arCards = this.items.map((item, index) => {
      const cardRoot = new Group()
      cardRoot.name = `VideoCard0${index + 1}`

      const material = new MeshBasicMaterial({
        map: this.createArCardTexture(item, index),
        transparent: true,
        opacity: 0,
        depthWrite: false,
      })

      const mesh = new Mesh(new PlaneGeometry(0.28, 0.18), material)
      mesh.name = `${cardRoot.name}_Visual`

      const hitArea = new Mesh(
        new PlaneGeometry(0.32, 0.22),
        new MeshBasicMaterial({transparent: true, opacity: 0, depthWrite: false}),
      )
      hitArea.name = `${cardRoot.name}_HitArea`
      hitArea.userData.interactionType = 'video-card'
      hitArea.userData.videoId = item.id
      hitArea.userData.videoItem = item
      hitArea.position.z = 0.004

      cardRoot.add(mesh, hitArea)
      cardRoot.position.set(positions[index].x, positions[index].y, 0)
      this.root.add(cardRoot)

      return {
        item,
        root: cardRoot,
        hitArea,
        material,
        baseX: positions[index].x,
        baseY: positions[index].y,
      }
    })
  }

  private startArFloating() {
    this.arFloatTweens = this.arCards.map((card, index) =>
      gsap.to(card.root.position, {
        y: card.baseY + 0.018,
        duration: 1.4 + index * 0.12,
        delay: index * 0.05,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
      }),
    )
  }

  private killArTimelines() {
    this.arActiveTimeline?.kill()
    this.arActiveTimeline = null
    this.killArFloating()
  }

  private killArFloating() {
    this.arFloatTweens.forEach(t => t.kill())
    this.arFloatTweens = []
  }

  private createArCardTexture(item: VideoItem, index: number) {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 320
    const ctx = canvas.getContext('2d')!

    const gradient = ctx.createLinearGradient(0, 0, 512, 320)
    gradient.addColorStop(0, 'rgba(10, 47, 87, 0.78)')
    gradient.addColorStop(1, 'rgba(53, 190, 255, 0.38)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 512, 320)

    ctx.strokeStyle = '#75d6ff'
    ctx.lineWidth = 8
    ctx.strokeRect(12, 12, 488, 296)

    ctx.fillStyle = '#d9f7ff'
    ctx.font = '600 46px Arial'
    ctx.fillText(item.title, 42, 92)
    ctx.font = '400 30px Arial'
    ctx.fillText(formatDuration(item.duration), 42, 142)

    ctx.fillStyle = `#${COLORS.sapphire.toString(16).padStart(6, '0')}`
    ctx.beginPath()
    ctx.arc(390, 210, 58, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.moveTo(374, 178)
    ctx.lineTo(374, 242)
    ctx.lineTo(424, 210)
    ctx.closePath()
    ctx.fill()

    ctx.fillStyle = '#d9f7ff'
    ctx.font = '500 22px Arial'
    ctx.fillText(`0${index + 1}`, 42, 260)

    const texture = new CanvasTexture(canvas)
    texture.needsUpdate = true
    return texture
  }

  // ─── HTML Drawer construction ────────────────────────────────────────────

  private buildDrawer() {
    const drawer = document.createElement('div')
    drawer.className = 'ar-drawer'
    drawer.hidden = true
    drawer.setAttribute('role', 'dialog')
    drawer.setAttribute('aria-label', 'Video list')

    const handle = document.createElement('div')
    handle.className = 'ar-drawer__handle'

    const header = document.createElement('div')
    header.className = 'ar-drawer__header'
    const title = document.createElement('p')
    title.className = 'ar-drawer__title'
    title.textContent = 'Choose a video'
    header.appendChild(title)

    const track = document.createElement('div')
    track.className = 'ar-drawer__track'

    this.items.forEach((item, index) => {
      const card = this.buildDrawerCard(item, index)
      track.appendChild(card)
    })

    drawer.append(handle, header, track)
    document.body.appendChild(drawer)
    this.drawer = drawer
  }

  private buildDrawerCard(item: VideoItem, index: number) {
    const card = document.createElement('div')
    card.className = 'ar-video-card'
    card.id = `ar-video-card-${item.id}`
    card.setAttribute('role', 'button')
    card.setAttribute('tabindex', '0')
    card.setAttribute('aria-label', `Play ${item.title}`)

    const thumb = document.createElement('div')
    thumb.className = 'ar-video-card__thumb'
    const canvas = document.createElement('canvas')
    canvas.className = 'ar-video-card__canvas'
    thumb.appendChild(canvas)

    const badge = document.createElement('span')
    badge.className = 'ar-video-card__badge'
    badge.textContent = String(index + 1).padStart(2, '0')

    const playIcon = document.createElement('div')
    playIcon.className = 'ar-video-card__play'
    playIcon.innerHTML = `<svg viewBox="0 0 24 24" fill="white" width="28" height="28"><path d="M8 5v14l11-7z"/></svg>`

    const info = document.createElement('div')
    info.className = 'ar-video-card__info'
    const titleEl = document.createElement('p')
    titleEl.className = 'ar-video-card__title'
    titleEl.textContent = item.title
    const dur = document.createElement('p')
    dur.className = 'ar-video-card__duration'
    dur.textContent = formatDuration(item.duration)
    info.append(titleEl, dur)

    card.append(thumb, badge, playIcon, info)
    card.addEventListener('click', () => this.onSelectCallback?.(item))
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.onSelectCallback?.(item) }
    })

    this.drawerCardEls.set(item.id, card)
    void this.extractFirstFrame(item.videoUrl, canvas)
    return card
  }

  private async extractFirstFrame(src: string, canvas: HTMLCanvasElement) {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.preload = 'metadata'
    video.crossOrigin = 'anonymous'
    video.src = src

    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error('timeout')), 4000)
        video.addEventListener('loadedmetadata', () => { video.currentTime = 0.001 }, {once: true})
        video.addEventListener('seeked', () => { window.clearTimeout(timeout); resolve() }, {once: true})
        video.addEventListener('error', () => { window.clearTimeout(timeout); reject(new Error('video error')) }, {once: true})
        video.load()
      })

      const ctx = canvas.getContext('2d')
      if (!ctx) return
      canvas.width = video.videoWidth || 320
      canvas.height = video.videoHeight || 180
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      canvas.classList.add('ar-video-card__canvas--loaded')
    } catch {
      this.drawPlaceholder(canvas)
    } finally {
      video.removeAttribute('src')
      video.load()
    }
  }

  private drawPlaceholder(canvas: HTMLCanvasElement) {
    canvas.width = 320
    canvas.height = 180
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const grad = ctx.createLinearGradient(0, 0, 320, 180)
    grad.addColorStop(0, 'rgba(10,30,60,1)')
    grad.addColorStop(1, 'rgba(0,80,120,1)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 320, 180)
    canvas.classList.add('ar-video-card__canvas--loaded')
  }

  // ─── Drawer styles ───────────────────────────────────────────────────────

  private ensureDrawerStyles() {
    if (document.getElementById('ar-drawer-style')) return

    const style = document.createElement('style')
    style.id = 'ar-drawer-style'
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

      .ar-drawer {
        position: fixed;
        bottom: 0; left: 0; right: 0;
        z-index: 2147482000;
        padding: 0 0 env(safe-area-inset-bottom, 12px);
        background: rgba(4, 12, 26, 0.82);
        backdrop-filter: blur(22px) saturate(1.4);
        -webkit-backdrop-filter: blur(22px) saturate(1.4);
        border-top: 1px solid rgba(117, 214, 255, 0.3);
        border-radius: 20px 20px 0 0;
        box-shadow: 0 -4px 32px rgba(0,0,0,0.55), 0 -1px 0 rgba(117,214,255,0.1) inset;
        transform: translateY(100%);
        transition: transform 0.38s cubic-bezier(0.32, 0.94, 0.6, 1);
        will-change: transform;
        touch-action: pan-y;
        pointer-events: auto;
      }
      .ar-drawer--visible { transform: translateY(0%); }

      .ar-drawer__handle {
        width: 36px; height: 4px;
        background: rgba(117,214,255,0.35);
        border-radius: 2px;
        margin: 10px auto 0;
      }
      .ar-drawer__header {
        display: flex; align-items: center;
        padding: 10px 18px 4px;
      }
      .ar-drawer__title {
        margin: 0;
        font: 600 13px/1 'Inter','Helvetica Neue',sans-serif;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: rgba(117,214,255,0.75);
      }
      .ar-drawer__track {
        display: flex; gap: 12px;
        padding: 12px 18px 18px;
        overflow-x: auto;
        overscroll-behavior-x: contain;
        -webkit-overflow-scrolling: touch;
        scroll-snap-type: x mandatory;
        scrollbar-width: none;
      }
      .ar-drawer__track::-webkit-scrollbar { display: none; }

      .ar-video-card {
        position: relative; flex: 0 0 172px;
        border-radius: 12px; overflow: hidden; cursor: pointer;
        background: rgba(8,22,44,0.9);
        border: 1px solid rgba(117,214,255,0.18);
        box-shadow: 0 2px 16px rgba(0,0,0,0.45);
        scroll-snap-align: start;
        transition: transform 0.22s cubic-bezier(0.34,1.56,0.64,1), border-color 0.2s, box-shadow 0.2s;
        -webkit-tap-highlight-color: transparent; user-select: none;
      }
      .ar-video-card:active, .ar-video-card--active {
        transform: scale(0.96);
        border-color: rgba(117,214,255,0.6);
        box-shadow: 0 0 18px rgba(39,183,255,0.45);
      }
      .ar-video-card__thumb {
        width: 100%; aspect-ratio: 16/9; overflow: hidden; background: #020c1e;
      }
      .ar-video-card__canvas {
        display: block; width: 100%; height: 100%; object-fit: cover;
        opacity: 0; transition: opacity 0.4s;
      }
      .ar-video-card__canvas--loaded { opacity: 1; }
      .ar-video-card__play {
        position: absolute; top: 0; left: 0; right: 0; bottom: 50%;
        display: flex; align-items: center; justify-content: center;
        background: rgba(0,0,0,0.22); opacity: 0;
        transition: opacity 0.2s; pointer-events: none;
      }
      .ar-video-card:hover .ar-video-card__play,
      .ar-video-card:active .ar-video-card__play { opacity: 1; }
      .ar-video-card__badge {
        position: absolute; top: 8px; left: 8px;
        font: 700 10px/1 'Inter',monospace; letter-spacing: 0.04em;
        color: rgba(117,214,255,0.85);
        background: rgba(4,12,26,0.72);
        border: 1px solid rgba(117,214,255,0.22);
        border-radius: 4px; padding: 2px 5px;
      }
      .ar-video-card__info { padding: 8px 10px 10px; }
      .ar-video-card__title {
        margin: 0 0 2px;
        font: 600 12px/1.3 'Inter','Helvetica Neue',sans-serif;
        color: rgba(255,255,255,0.92);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .ar-video-card__duration {
        margin: 0;
        font: 400 10px/1 'Inter',monospace;
        color: rgba(117,214,255,0.6); letter-spacing: 0.04em;
      }
    `
    document.head.appendChild(style)
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDuration(seconds?: number) {
  if (!seconds) return '--:--'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

function waitMs(ms: number) {
  return new Promise<void>(resolve => window.setTimeout(resolve, ms))
}

function waitFrame() {
  return new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()))
}
