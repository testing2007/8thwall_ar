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
//   • Drawer mode — HTML full-screen-style panel, shown when the target is
//                   lost so the user can still choose and play a video.
//
// Poster images are shown immediately (no video download). Videos are only
// downloaded when the user explicitly taps a card — the tap gesture itself
// unlocks audio on iOS/Android so audio plays without user friction.
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
  private onSelectCallback: ((item: VideoItem, videoEl: HTMLVideoElement) => void) | null = null

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

  setOnSelect(callback: (item: VideoItem, videoEl: HTMLVideoElement) => void) {
    this.onSelectCallback = callback
  }

  // ── AR menu (Three.js cards on bottle) ──────────────────────────────────

  async showArCards() {
    this.killArTimelines()
    this.root.visible = true

    const timeline = gsap.timeline()
    this.arActiveTimeline = timeline

    this.arCards.forEach((card, index) => {
      card.root.visible = true
      card.root.position.set(0, 0, 0)
      card.root.scale.setScalar(0.3)
      card.material.opacity = 0

      const delay = index * 0.14
      timeline.to(card.root.position, {
        x: card.baseX,
        y: card.baseY,
        duration: 0.45,
        ease: 'power2.out',
      }, delay)
      timeline.to(card.root.scale, {
        x: 1, y: 1, z: 1,
        duration: 0.45,
        ease: 'back.out(1.5)',
      }, delay)
      timeline.to(card.material, {
        opacity: 0.92,
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
      card.root.scale.setScalar(0.3)
      card.material.opacity = 0
    })
  }

  async selectArCard(item: VideoItem) {
    this.killArFloating()
    const timeline = gsap.timeline()
    this.arActiveTimeline = timeline

    this.arCards.forEach((card) => {
      if (card.item.id === item.id) {
        timeline.to(card.root.scale, {x: 1.12, y: 1.12, z: 1.12, duration: 0.22, yoyo: true, repeat: 1, ease: 'power2.inOut'}, 0)
      } else {
        timeline.to(card.root.scale, {x: 0.28, y: 0.28, z: 0.28, duration: 0.28, ease: 'power2.in'}, 0)
        timeline.to(card.material, {opacity: 0, duration: 0.24, ease: 'power2.in'}, 0)
      }
    })

    await timeline.then()
    this.arActiveTimeline = null
    this.hideArCards()
  }

  // ── Drawer (HTML panel) ─────────────────────────────────────────────────

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
    await waitMs(380)
    if (!this.drawerVisible) this.drawer.hidden = true
  }

  // ── Unified (called by timeline) ────────────────────────────────────────

  async showVideoMenu() {
    await this.showArCards()
  }

  /** Called when user taps a card (from either AR or drawer).
   *  Hides both menus — actual video open is handled by the onSelectCallback. */
  async selectCard(item: VideoItem) {
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
      card.root.scale.setScalar(0.3)
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

  getInteractiveObjects() {
    return this.arCards.map(card => card.hitArea)
  }

  getItemById(videoId: string) {
    return this.items.find(item => item.id === videoId)
  }

  // ─── AR card construction (Three.js) ────────────────────────────────────
  // Cards are laid out vertically (portrait stack), sized to match the
  // reference screenshot style — wide tiles with poster image texture.

  private createArCards() {
    const count = this.items.length
    // Vertical spacing between card centers
    const spacing = 0.32
    const totalHeight = (count - 1) * spacing
    const startY = totalHeight / 2

    this.arCards = this.items.map((item, index) => {
      const cardRoot = new Group()
      cardRoot.name = `VideoCard0${index + 1}`

      // Use a combined canvas texture: draws overlay immediately, poster loaded lazily.
      // No TextureLoader = no network request on startup → faster initialization.
      const material = new MeshBasicMaterial({
        map: this.createArCardCanvas(item, index),
        transparent: true,
        opacity: 0,
        depthWrite: false,
      })

      // Card width × height (16:9 wide tile, larger than before)
      const cardW = 0.58
      const cardH = 0.33

      const mesh = new Mesh(new PlaneGeometry(cardW, cardH), material)
      mesh.name = `${cardRoot.name}_Visual`

      // Load poster image lazily (after startup) and redraw into the existing canvas.
      if (item.thumbnailUrl) {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => {
          const tex = material.map as CanvasTexture
          const canvas = tex.image as HTMLCanvasElement
          const ctx = canvas.getContext('2d')
          if (!ctx) return
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
          this.drawArCardOverlayOnCtx(ctx, item, index, canvas.width, canvas.height)
          tex.needsUpdate = true
        }
        img.src = item.thumbnailUrl
      }

      const hitArea = new Mesh(
        new PlaneGeometry(cardW + 0.04, cardH + 0.04),
        new MeshBasicMaterial({transparent: true, opacity: 0, depthWrite: false}),
      )
      hitArea.name = `${cardRoot.name}_HitArea`
      hitArea.userData.interactionType = 'video-card'
      hitArea.userData.videoId = item.id
      hitArea.userData.videoItem = item
      hitArea.position.z = 0.005

      cardRoot.add(mesh, hitArea)

      const posX = 0
      const posY = startY - index * spacing

      cardRoot.position.set(posX, posY, 0)
      this.root.add(cardRoot)

      return {
        item,
        root: cardRoot,
        hitArea,
        material,
        baseX: posX,
        baseY: posY,
      }
    })
  }

  private startArFloating() {
    this.arFloatTweens = this.arCards.map((card, index) =>
      gsap.to(card.root.position, {
        y: card.baseY + 0.016,
        duration: 1.5 + index * 0.15,
        delay: index * 0.08,
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

  /** Create the initial canvas texture (dark bg + overlay). Poster draws into it later. */
  private createArCardCanvas(item: VideoItem, index: number) {
    const W = 580
    const H = 330
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')!

    // Dark background
    ctx.fillStyle = '#030a1a'
    ctx.fillRect(0, 0, W, H)

    this.drawArCardOverlayOnCtx(ctx, item, index, W, H)

    const texture = new CanvasTexture(canvas)
    texture.needsUpdate = true
    return texture
  }

  /** Draw the overlay elements (border, play button, title) onto a 2D context. */
  private drawArCardOverlayOnCtx(
    ctx: CanvasRenderingContext2D,
    item: VideoItem,
    index: number,
    W: number,
    H: number,
  ) {
    // Bottom gradient for title readability
    const grad = ctx.createLinearGradient(0, H * 0.45, 0, H)
    grad.addColorStop(0, 'rgba(0,0,0,0)')
    grad.addColorStop(1, 'rgba(0,0,20,0.82)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, W, H)

    // Glowing border
    ctx.strokeStyle = 'rgba(117,214,255,0.6)'
    ctx.lineWidth = 6
    ctx.strokeRect(4, 4, W - 8, H - 8)

    // Play circle
    const cx = W / 2
    const cy = H / 2 - 14
    ctx.beginPath()
    ctx.arc(cx, cy, 44, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(39,183,255,0.82)'
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(cx - 16, cy - 22)
    ctx.lineTo(cx - 16, cy + 22)
    ctx.lineTo(cx + 26, cy)
    ctx.closePath()
    ctx.fillStyle = '#fff'
    ctx.fill()

    // Title
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 36px Arial'
    ctx.shadowColor = 'rgba(0,0,0,0.8)'
    ctx.shadowBlur = 8
    ctx.fillText(item.title.toUpperCase(), 24, H - 52)

    // Index badge
    ctx.shadowBlur = 0
    ctx.fillStyle = 'rgba(39,183,255,0.9)'
    ctx.font = 'bold 22px Arial'
    ctx.fillText(`${String(index + 1).padStart(2, '0')}`, 24, 36)
  }


  // ─── HTML Drawer construction ────────────────────────────────────────────
  // Large vertical card list, poster images shown immediately.
  // Videos are NOT pre-loaded — only the onSelectCallback triggers download.

  private buildDrawer() {
    const drawer = document.createElement('div')
    drawer.className = 'ar-drawer'
    drawer.hidden = true
    drawer.setAttribute('role', 'dialog')
    drawer.setAttribute('aria-label', 'Video list')

    // Header
    const header = document.createElement('div')
    header.className = 'ar-drawer__header'

    const brand = document.createElement('p')
    brand.className = 'ar-drawer__brand'
    brand.textContent = 'BOMBAY SAPPHIRE'

    const title = document.createElement('p')
    title.className = 'ar-drawer__title'
    title.textContent = 'TAP TO WATCH RECIPE VIDEOS'

    header.append(brand, title)

    // Vertical card list
    const list = document.createElement('div')
    list.className = 'ar-drawer__list'

    this.items.forEach((item, index) => {
      const card = this.buildDrawerCard(item, index)
      list.appendChild(card)
    })

    drawer.append(header, list)
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

    // Poster image — shown immediately, no video download
    const poster = document.createElement('img')
    poster.className = 'ar-video-card__poster'
    if (item.thumbnailUrl) {
      poster.src = item.thumbnailUrl
      poster.alt = item.title
    }

    // Dark gradient overlay for text readability
    const overlay = document.createElement('div')
    overlay.className = 'ar-video-card__overlay'

    // Play button (center)
    const playBtn = document.createElement('div')
    playBtn.className = 'ar-video-card__play'
    playBtn.innerHTML = `
      <svg viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg" width="56" height="56">
        <circle cx="30" cy="30" r="29" fill="rgba(39,183,255,0.85)" stroke="rgba(255,255,255,0.5)" stroke-width="2"/>
        <path d="M23 18L47 30L23 42V18Z" fill="white"/>
      </svg>`

    // Title at bottom
    const info = document.createElement('div')
    info.className = 'ar-video-card__info'

    const brand = document.createElement('span')
    brand.className = 'ar-video-card__brand-badge'
    brand.innerHTML = `<img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='18'%3E%3Crect width='80' height='18' rx='3' fill='rgba(39,183,255,0.8)'/%3E%3Ctext x='4' y='13' font-family='Arial' font-size='9' font-weight='bold' fill='white'%3EBOMBAY SAPPHIRE%3C/text%3E%3C/svg%3E" alt="Bombay Sapphire" />`

    const titleEl = document.createElement('p')
    titleEl.className = 'ar-video-card__title'
    titleEl.textContent = item.title.toUpperCase()

    info.append(brand, titleEl)
    card.append(poster, overlay, playBtn, info)

    // Click handler: create & play video SYNCHRONOUSLY inside the user gesture.
    // This is the only reliable way to unlock audio on iOS Safari.
    const handleSelect = () => {
      card.classList.add('ar-video-card--active')
      setTimeout(() => card.classList.remove('ar-video-card--active'), 400)

      // Create video element + call play() HERE (inside gesture) before any async.
      const videoEl = document.createElement('video')
      videoEl.playsInline = true
      videoEl.muted = false
      videoEl.defaultMuted = false
      videoEl.volume = 1
      videoEl.preload = 'auto'
      videoEl.crossOrigin = 'anonymous'
      videoEl.src = item.videoUrl
      videoEl.setAttribute('playsinline', '')
      videoEl.setAttribute('webkit-playsinline', '')

      // Synchronous play() — browser considers this user-initiated.
      videoEl.play().catch(() => {
        videoEl.muted = true
        void videoEl.play().catch(() => undefined)
      })

      this.onSelectCallback?.(item, videoEl)
    }

    card.addEventListener('click', handleSelect)
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSelect() }
    })

    this.drawerCardEls.set(item.id, card)
    return card
  }

  // ─── Drawer styles ───────────────────────────────────────────────────────

  private ensureDrawerStyles() {
    if (document.getElementById('ar-drawer-style')) return

    const style = document.createElement('style')
    style.id = 'ar-drawer-style'
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

      /* ── Full-screen drawer panel ─────────────────────────── */
      .ar-drawer {
        position: fixed;
        inset: 0;
        z-index: 2147482000;
        display: flex;
        flex-direction: column;
        background: rgba(2, 6, 18, 0.96);
        backdrop-filter: blur(18px) saturate(1.3);
        -webkit-backdrop-filter: blur(18px) saturate(1.3);
        transform: translateY(100%);
        transition: transform 0.42s cubic-bezier(0.32, 0.94, 0.6, 1);
        will-change: transform;
        overflow: hidden;
        pointer-events: auto;
      }
      .ar-drawer--visible { transform: translateY(0%); }

      /* ── Header ───────────────────────────────────────────── */
      .ar-drawer__header {
        padding: 28px 24px 12px;
        text-align: center;
        flex-shrink: 0;
        border-bottom: 1px solid rgba(117,214,255,0.18);
      }
      .ar-drawer__brand {
        margin: 0 0 4px;
        font: 800 13px/1 'Inter', 'Helvetica Neue', sans-serif;
        letter-spacing: 0.22em;
        color: rgba(117,214,255,0.7);
        text-transform: uppercase;
      }
      .ar-drawer__title {
        margin: 0;
        font: 700 20px/1.2 'Inter', 'Helvetica Neue', sans-serif;
        letter-spacing: 0.04em;
        color: #d4af5a;
        text-transform: uppercase;
        text-shadow: 0 0 20px rgba(212,175,90,0.4);
      }

      /* ── Vertical card list ───────────────────────────────── */
      .ar-drawer__list {
        flex: 1;
        overflow-y: auto;
        overscroll-behavior-y: contain;
        -webkit-overflow-scrolling: touch;
        padding: 16px 20px 32px;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      /* ── Video card — large poster style ──────────────────── */
      .ar-video-card {
        position: relative;
        width: 100%;
        aspect-ratio: 16 / 9;
        border-radius: 10px;
        overflow: hidden;
        cursor: pointer;
        background: #030a1a;
        border: 2px solid rgba(117,214,255,0.3);
        box-shadow:
          0 4px 24px rgba(0,0,0,0.6),
          0 0 0 1px rgba(117,214,255,0.08) inset;
        flex-shrink: 0;
        -webkit-tap-highlight-color: transparent;
        user-select: none;
        transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
      }
      .ar-video-card:active,
      .ar-video-card--active {
        transform: scale(0.97);
        border-color: rgba(117,214,255,0.75);
        box-shadow: 0 0 28px rgba(39,183,255,0.5), 0 4px 24px rgba(0,0,0,0.6);
      }

      /* ── Poster image ─────────────────────────────────────── */
      .ar-video-card__poster {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }

      /* ── Dark gradient overlay ────────────────────────────── */
      .ar-video-card__overlay {
        position: absolute;
        inset: 0;
        background: linear-gradient(
          to bottom,
          rgba(0,0,0,0.1) 0%,
          rgba(0,0,0,0.0) 40%,
          rgba(0,0,20,0.72) 100%
        );
      }

      /* ── Play button (center) ─────────────────────────────── */
      .ar-video-card__play {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        display: flex;
        align-items: center;
        justify-content: center;
        filter: drop-shadow(0 2px 12px rgba(39,183,255,0.6));
        transition: filter 0.2s ease, transform 0.2s ease;
        pointer-events: none;
      }
      .ar-video-card:active .ar-video-card__play,
      .ar-video-card--active .ar-video-card__play {
        filter: drop-shadow(0 2px 24px rgba(39,183,255,0.9));
        transform: translate(-50%, -50%) scale(1.08);
      }

      /* ── Info (bottom) ────────────────────────────────────── */
      .ar-video-card__info {
        position: absolute;
        bottom: 0; left: 0; right: 0;
        padding: 10px 14px 12px;
        display: flex;
        flex-direction: column;
        gap: 5px;
      }
      .ar-video-card__brand-badge img {
        display: block;
        height: 18px;
        width: auto;
      }
      .ar-video-card__title {
        margin: 0;
        font: 700 16px/1.2 'Inter', 'Helvetica Neue', sans-serif;
        color: #ffffff;
        letter-spacing: 0.06em;
        text-shadow: 0 1px 8px rgba(0,0,0,0.9);
      }
    `
    document.head.appendChild(style)
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function waitMs(ms: number) {
  return new Promise<void>(resolve => window.setTimeout(resolve, ms))
}

function waitFrame() {
  return new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()))
}
