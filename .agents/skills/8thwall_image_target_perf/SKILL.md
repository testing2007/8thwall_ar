---
name: 8thwall-image-target-perf
description: >
  8th Wall Image Target AR 项目在 Safari 移动端（无痕浏览）加载慢、
  XrController null 报错、视频音频无法自动解锁、视频播放中途停止等问题的
  诊断与修复模式。适用于：
  (1) A-Frame + xrextras + xrweb 的 Image Target 场景；
  (2) ECS + TypeScript + Three.js + GSAP 的自定义 AR 体验。
  包含：ECS GltfModel 动画重播、iOS 音频解锁双重方案、
  状态机点击灵敏度、Three.js 材质崩溃、视频编解码器兼容性等。
---

# 8th Wall Image Target AR — Safari 性能与音频优化

## 适用场景
- 8th Wall + A-Frame + xrextras 的 Image Target 识别视频项目
- 部署后真机 Safari（尤其无痕浏览）加载缓慢
- `XR8.XrController is null` 报错
- 视频有声播放需要额外点击才能解锁
- 视频播放在某个时间点（如第 8 秒）停止

---

## 关键约束 & 陷阱

### 1. slam chunk 是必须的（即使 disableWorldTracking: true）

`XR8.XrController` 属于 slam 模块。即使场景设置了 `disableWorldTracking: true`，
Image Target 识别仍然依赖 XrController.configure() 来注册离线 imageTargetData。

**动态注入 xr.js 时必须附带 `data-preload-chunks="slam"`**，否则：
```
TypeError: Cannot read properties of null (reading 'configure')
  at onxrloaded (app.js)
```

### 2. 懒加载架构：xr.js 必须在用户点击后才动态注入

页面加载时仅下载 8frame + xrextras + landing-page（约 1.5MB，无痕缓存压力小）。
xr.js + slam（约 6.4MB）只在用户点击 "Start AR" 后才动态注入 `<script>` 标签。

```js
function loadXrRuntime() {
  if (window.XR8) {
    return window.XR8.loadChunk ? window.XR8.loadChunk('slam') : Promise.resolve()
  }
  return new Promise(function (resolve, reject) {
    window.addEventListener('xrloaded', resolve, { once: true })
    if (document.getElementById('xr-runtime-script')) return
    var script = document.createElement('script')
    script.id = 'xr-runtime-script'
    script.async = true
    script.src = './external/xr/xr.js'
    script.setAttribute('data-preload-chunks', 'slam')  // 必须！XrController 依赖 slam
    script.crossOrigin = 'anonymous'
    script.onerror = function () { reject(new Error('XR runtime load failed')) }
    document.head.appendChild(script)
  })
}
```

### 3. `<a-scene>` 必须放在 `<template>` 中，用户点击后才克隆到 DOM

`<a-scene>` 直接写在 `<body>` 中会在页面加载时立即触发 WebGL 初始化 + 相机权限弹窗。

正确做法：`<a-scene>` 放在 `<template id="ar-scene-template">` 中，引擎就绪后克隆到 DOM：

```html
<template id="ar-scene-template">
  <a-scene xrweb="disableWorldTracking: true;" xrconfig="cameraDirection: back; allowedDevices: any;"
    xrextras-gesture-detector landing-page xrextras-loading xrextras-runtime-error renderer="colorManagement:true;">
    <a-assets timeout="10000">
      <!-- video 由 appendArScene() 移入 -->
    </a-assets>
    <xrextras-named-image-target name="your-target-name">
      <xrextras-target-video-fade video="#your-video-id"></xrextras-target-video-fade>
    </xrextras-named-image-target>
  </a-scene>
</template>
```

```js
function appendArScene() {
  if (document.querySelector('a-scene')) return
  var template = document.getElementById('ar-scene-template')
  document.body.appendChild(template.content.cloneNode(true))
  var assets = document.querySelector('a-scene a-assets')
  var video = document.getElementById('your-video-id')
  if (assets && video && video.parentNode !== assets) {
    assets.appendChild(video)
  }
}
```

### 4. Safari 音频解锁：必须在用户手势的同步调用栈中执行

Safari 要求 `video.play()`（带声音）必须在 click/tap 处理函数的**同步**调用栈内发起。
Promise `.then()` 内的调用不在用户手势上下文，会被拒绝。

```js
function startBaroneAr() {
  var button = document.getElementById('ar-start-button')
  if (!button || button.dataset.starting) return
  button.dataset.starting = 'true'
  button.disabled = true
  button.textContent = 'Loading AR...'

  var video = prepareTargetVideo()
  unlockVideoAudio(video)      // 必须在 loadXrRuntime() Promise 之前同步调用！

  loadXrRuntime().then(function () {
    appendArScene()
    button.classList.add('hidden')
  }).catch(function (error) {
    button.disabled = false
    button.dataset.starting = ''
    button.textContent = 'Tap Again'
  })
}
```

### 5. 音频解锁：volume=0（非 muted=true），且禁止调用 video.load()

**volume=0 vs muted=true**：
- `muted=true`：浏览器视为静音模式，未来 `play()` 可能不允许有声
- `volume=0`：浏览器视为有声模式（音量为零），正确解锁未来的有声播放

**禁止在解锁时调用 `video.load()`**：
- `video.load()` + `play()` + `pause()` 会预缓冲约 8 秒视频数据
- 若服务器不支持 HTTP Range Request（断点续传），后续播放会在缓冲边界停止
- 现代 iOS Safari 可在 `preload="none"` 状态下直接调用 `play()`，无需先 `load()`

```js
function unlockVideoAudio(video) {
  if (!video || video.dataset.audioUnlocked) return
  video.muted = false
  video.defaultMuted = false
  video.volume = 0            // 静音解锁，用户完全听不到

  // ❌ 不要调用 video.load()，会预缓冲数据导致播放在缓冲边界停止
  var p = video.play()
  if (p && p.then) {
    p.then(function () {
      video.pause()
      video.currentTime = 0
      video.volume = 1        // 恢复音量，等待 xrextras 触发有声播放
      video.dataset.audioUnlocked = 'true'
    }).catch(function (err) {
      // play() 失败（极少数旧 iOS）→ 降级静音播放
      video.muted = true
      video.volume = 1
      console.warn('Audio unlock failed, fallback to muted:', err)
    })
  } else {
    video.volume = 1
    video.dataset.audioUnlocked = 'true'
  }
}
```

### 6. 视频属性配置

```html
<!-- preload=none：首屏零下载；muted 是 HTML 初始属性，运行时由 prepareTargetVideo 覆盖 -->
<video id="your-video-id"
  muted playsinline webkit-playsinline
  preload="none" crossorigin="anonymous"
  loop="true"
  src="assets/Media/your-video.mp4">
</video>
```

```js
function prepareTargetVideo() {
  var video = document.getElementById('your-video-id')
  if (!video) return null
  video.muted = false         // 覆盖 HTML muted 属性，为后续有声播放做准备
  video.defaultMuted = false
  video.preload = 'none'
  video.volume = 1
  video.playsInline = true
  video.setAttribute('playsinline', '')
  video.setAttribute('webkit-playsinline', '')
  return video
}
```

---

## 完整加载流程

```
页面打开（立即显示）
  → 同步下载：8frame.js + xrextras.js + landing-page.js  (~1.5MB)
  → 显示 [Start AR] 按钮

用户点击 Start AR（用户手势窗口）
  → [同步] prepareTargetVideo() + unlockVideoAudio()  ← 音频权限解锁
  → [异步] 动态插入 xr.js（data-preload-chunks=slam）
  → xrloaded 触发（XrController 就绪）
  → appendArScene()：克隆 <template> → A-Frame 初始化
  → 相机权限弹窗 → AR 开始

用户对准 Image Target
  → xrextras 检测到目标 → video.play()（有声，无需额外点击）
  → 视频完整播放 → loop 循环

用户移开相机
  → xrextras 目标丢失 → video.pause()
```

---

## 服务器配置要求

| 配置项 | 说明 | 优先级 |
|--------|------|--------|
| `Accept-Ranges: bytes` | 支持视频断点续传，防止播放在缓冲边界停止 | **必须** |
| Gzip/Brotli 压缩 JS | xr.js 995KB → ~350KB，8frame.js 1.36MB → ~480KB | 强烈推荐 |
| 长期缓存 | `Cache-Control: public, max-age=2592000` for JS/MP4/IMG | 推荐 |
| 视频 faststart | FFmpeg `-movflags +faststart`，moov atom 在文件头，Safari 可边下边播 | 推荐 |

---

## 参考实现

[barone-video/src/index.html](file:///d:/workspace/8thwall%20example/8thwall_ar/barone-video/src/index.html)

---

---

# ECS + TypeScript + Three.js 架构专项经验

> 以下章节适用于使用 **8th Wall ECS + TypeScript + Three.js + GSAP** 的自定义 AR 体验，
> 区别于上方 A-Frame 方案。来源项目：`plant-grow-animation-introduce`。

---

## A. ECS GltfModel 动画重播问题

**症状**：通过 `ecs.GltfModel.mutate` 控制的 GLTF 动画只有首次能播放，第二次扫描不触发。

**根因**：ECS 采用 **diff 机制**，只有值**发生变化**时才更新 WebGL 状态。
第一次播放完，reset 时 `time` 从某值设为 0；第二次再 reset 时 `time` 已经是 0，设 0 → **无变化 → seek 被跳过**，动画不重播。

**修复：双帧策略**——第一帧停在极小非零值，第二帧再归零触发真实 diff：

```ts
playStudioGrowthAnimation() {
  const modelEid = this.getGltfModelEid()
  if (!modelEid) return

  // Step 1 (sync): 停在极小非零 time，让 ECS 在下次 reset 时注册真实 delta
  ecs.GltfModel.mutate(this.world, modelEid, (cursor) => {
    cursor.animationClip = PLANT_GLB.fallbackGrowClip
    cursor.loop = false
    cursor.timeScale = 0.001   // 极小非零 → ECS 认为 timeScale 有变化
    cursor.time = 0.0001       // 极小非零 → 第二次 reset 归 0 时才能产生 diff
  })

  // Step 2 (next frame): 真正从头播放
  requestAnimationFrame(() => {
    ecs.GltfModel.mutate(this.world, modelEid, (cursor) => {
      cursor.timeScale = 1
      cursor.time = 0
    })
  })
}
```

**经验**：凡是 ECS mutate 驱动的状态，若需要重置到"之前的值"，必须先 mutate 到一个中间值，再 mutate 回目标值，否则 diff 系统认为没有变化。

---

## B. Three.js 材质崩溃 — `onBeforeCompile = undefined`

**错误信息**：
```
TypeError: Cannot read properties of undefined (reading 'toString')
  at MeshBasicMaterial.customProgramCacheKey (three.module.js:9611)
  at Object.getParameters (runtime.js:13:216177)
```

**根因**：Three.js 内部 `customProgramCacheKey()` 会调用 `this.onBeforeCompile.toString()`。
若代码中出现 `material.onBeforeCompile = undefined`，Three.js 渲染器在下次 draw call 时必然崩溃。

**修复**：
```ts
// ❌ 错误 — 会导致渲染崩溃
material.onBeforeCompile = undefined

// ✅ 正确（若要清除）
material.onBeforeCompile = () => {}

// ✅ 最好：直接删除该行，不设置此属性
```

**诊断**：错误栈出现 `customProgramCacheKey` 时，立即检查所有 `MeshBasicMaterial` /
`MeshStandardMaterial` 是否被手动设置了 `onBeforeCompile = null/undefined`。

---

## C. iOS Safari 视频音频解锁 — ECS/TypeScript 架构下的可靠方案

**症状**：点击 Three.js 3D 卡片（通过 raycasting 交互）**有时**无声音，
点击 HTML 抽屉卡片（click 事件）**总是**有声音。

**根因**：
- iOS Safari 只信任 `touchend`/`click` 事件为可信用户手势（trusted user gesture）
- `pointerdown` 不完全信任：raycasting 消耗几毫秒后，手势信任窗口可能已过期
- 手势链中任何 `await`（即使是微任务）都可能在老版 iOS Safari 上打断信任

**三层修复方案**（缺一不可）：

### C-1. 全局音频预解锁（首次触摸时）

```ts
// audio-unlock.ts
let installed = false

export function installAudioUnlock(): void {
  if (installed) return
  installed = true

  const unlock = () => {
    // 解锁 Web Audio API（AudioContext）
    const Ctx = window.AudioContext ?? (window as any).webkitAudioContext
    if (Ctx) {
      const ctx = new Ctx()
      const buffer = ctx.createBuffer(1, 1, 22050)
      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.connect(ctx.destination)
      source.start(0)
      void ctx.resume().then(() => ctx.close()).catch(() => undefined)
    }

    // 解锁 video 音频门（静音短视频）
    const v = document.createElement('video')
    v.muted = true
    v.playsInline = true
    v.setAttribute('playsinline', '')
    // 最小有效 MP4（1帧 1×1px 无声）的 base64
    v.src = 'data:video/mp4;base64,' +
      'AAAAHGZ0eXBpc29tAAACAGlzb21pc28ybXA0MAAAAARH9AAABW1kYXQAAAAA'
    void v.play().catch(() => undefined)
  }

  // capture 阶段确保在任何组件 handler 之前触发；once 只执行一次
  document.addEventListener('touchstart', unlock, {capture: true, passive: true, once: true})
  document.addEventListener('click', unlock, {capture: true, passive: true, once: true})
}
```

在主组件模块顶层（非函数内）调用：
```ts
// ar-experience-component.ts 顶层
import {installAudioUnlock} from './audio-unlock'
installAudioUnlock()   // 模块加载时立即注册，早于任何 ECS 实例化
```

### C-2. 使用 `click` 替代 `pointerdown` 处理 Three.js 交互

```ts
// ❌ pointerdown — iOS 不完全信任
window.addEventListener('pointerdown', handler, {passive: true})

// ✅ click — 等同 touchend，iOS 100% 信任，与 HTML 抽屉 click 行为完全一致
window.addEventListener('click', handler, {passive: true})
```

验证：用 click 事件后，3D 卡片与 HTML 抽屉行为保持一致，都 100% 有声音。

### C-3. 在 click 处理函数最前端（所有 await 之前）同步创建 video + play()

```ts
// interaction-controller.ts
private async handleClick(event: MouseEvent) {
  if (!this.enabled) return
  // ... 同步计算 raycaster 坐标 ...
  const hit = this.getPriorityHit()
  if (!hit) return

  if (hit.userData.interactionType === 'video-card') {
    const item = hit.userData.videoItem as VideoItem
    // ⬇ 必须在所有 await 之前，处于手势链同步部分
    const videoEl = createAndPlayVideo(item.videoUrl)
    await this.callbacks.openVideo(item, videoEl)
  }
}

// 辅助函数：在手势同步上下文内创建并启动播放
function createAndPlayVideo(src: string): HTMLVideoElement {
  const video = document.createElement('video')
  video.playsInline = true
  video.muted = false
  video.defaultMuted = false
  video.volume = 1
  video.preload = 'auto'
  video.crossOrigin = 'anonymous'
  video.src = src   // 设置正确的 src（防止多视频混淆）
  video.setAttribute('playsinline', '')
  video.setAttribute('webkit-playsinline', '')
  // 同步 play()，失败时降级静音
  video.play().catch(() => {
    video.muted = true
    void video.play().catch(() => undefined)
  })
  return video
}
```

### C-4. HTML 抽屉卡片同样需要在 click 内同步创建 video

```ts
// video-menu-controller.ts — 抽屉卡片点击处理
card.addEventListener('click', () => {
  // 同步创建 video + play() — 保持在 click 手势链内
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
  videoEl.play().catch(() => {
    videoEl.muted = true
    void videoEl.play().catch(() => undefined)
  })
  // 将预播放的 video 元素传给回调，避免再次 play()
  this.onSelectCallback?.(item, videoEl)
})
```

### C-5. VideoPlayerController.open() 接收预创建的 video 元素

```ts
// video-player-controller.ts
async open(item: VideoItem, preloadedVideoEl?: HTMLVideoElement) {
  this.releaseVideo()
  this.ensureOverlay()

  let video: HTMLVideoElement
  let playPromise: Promise<void>

  if (preloadedVideoEl) {
    // 直接使用已在手势内启动的 video 元素（音频已解锁）
    video = preloadedVideoEl
    video.className = 'ar-screen-video'
    // 若调用方因 play() 失败而静音，尝试恢复有声
    if (video.muted) {
      video.muted = false
      playPromise = video.play().catch(() => {
        video.muted = true
        return video.play().catch(() => undefined)
      })
    } else {
      playPromise = Promise.resolve()
    }
  } else {
    // 降级：自行创建（可能无声）
    video = document.createElement('video')
    // ... 设置属性 + play() ...
  }

  this.video = video
  this.shell.insertBefore(video, this.loading)
  // ... 等待 loadedmetadata + 播放动画 ...
}
```

---

## D. 状态机设计 — 点击灵敏度与并发控制

### D-1. 用状态机状态替代 `busy` 标志

**问题**：`busy = true` 期间（如植物生长），用户点击视频卡片无响应；
`busy` 标志也容易与异步状态机产生竞态。

**修复**：完全移除 `busy`，改由状态机状态控制：
```ts
async openVideo(item: VideoItem, preloadedVideoEl?: HTMLVideoElement) {
  // 允许从多个状态触发（包括植物生长中）
  const allowed = this.machine.canInteract(
    ARExperienceState.VIDEO_MENU_IDLE,
    ARExperienceState.PLANT_IDLE,
    ARExperienceState.PLANT_GROWING,    // 植物生长中也可点击
    ARExperienceState.SCANNING,         // 抽屉出现前的瞬间
    ARExperienceState.VIDEO_MENU_ENTERING,
  )
  if (!allowed) return

  // 通过 runId 取消正在进行的生长动画
  this.runId += 1
  this.machine.hardReset()
  // ...
}
```

### D-2. `resetAfterTargetLost` 必须同步更新状态

**问题**：目标丢失后，经过多次 `await forceTransitionTo` 才到达 `VIDEO_MENU_IDLE`，
用户在此期间点击抽屉卡片时状态还未就绪，`canInteract` 失败。

**修复**：目标丢失时**同步**调用 `hardReset()`，状态立即生效：
```ts
// ✅ 同步重置 — 抽屉卡片立即可点击
private resetAfterTargetLost() {
  this.runId += 1
  this.menu.hideArCards()
  this.player.reset()
  this.plant.reset()
  this.particles.reset()
  this.machine.hardReset()           // 同步：state → SCANNING，立即生效
  void this._transitionToMenuIdle()  // 异步：触发状态事件，不阻塞点击
  if (!this.menu.drawerIsVisible) void this.menu.showDrawer()
}

// ExperienceStateMachine.hardReset()
hardReset() {
  this.flushCleanups()
  this.transitionToken += 1
  this.currentState = ARExperienceState.SCANNING  // 同步赋值，无 await
}
```

### D-3. runId 模式取消 in-flight 异步序列

```ts
// 用单调递增 runId 取消所有 in-flight await
private runId = 0

async playIntro() {
  this.runId += 1
  const runId = this.runId

  // ... async 操作中每个 await 后检查 ...
  await someAsyncOp()
  if (this.runId !== runId) return  // 被新的 onTargetFound 取消了
}
```

---

## E. Three.js AR 3D 卡片性能优化

### E-1. 避免 TextureLoader 在构造时发起网络请求

```ts
// ❌ 慢：TextureLoader 在构造时立即发起 HTTP 请求
const loader = new TextureLoader()
loader.load(item.thumbnailUrl, (texture) => {
  material.map = texture
  material.needsUpdate = true
})

// ✅ 快：new Image() 懒加载 + canvas 合并纹理
private createArCardCanvas(item: VideoItem, index: number): CanvasTexture {
  const W = 580, H = 330
  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')!

  // 立即绘制深色背景 + overlay（标题 + 播放按钮）
  ctx.fillStyle = '#030a1a'
  ctx.fillRect(0, 0, W, H)
  this.drawCardOverlay(ctx, item, index, W, H)

  // 构造器返回后才懒加载封面图
  if (item.thumbnailUrl) {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      ctx.drawImage(img, 0, 0, W, H)          // 绘制封面
      this.drawCardOverlay(ctx, item, index, W, H)  // 重绘 overlay 在封面上
      texture.needsUpdate = true
    }
    img.src = item.thumbnailUrl               // 异步加载，不阻塞初始化
  }

  const texture = new CanvasTexture(canvas)
  texture.needsUpdate = true
  return texture
}
```

### E-2. 单 Mesh 替代双 Mesh（background + overlay）

每个 AR 卡片使用两层 Mesh（底图 + overlay）会增加 draw call 和材质管理复杂度。
将底图和 overlay 合并到同一个 canvas 纹理，单 Mesh 即可，减少 Three.js 渲染开销。

---

## F. 视频编解码器兼容性

### F-1. iOS Safari 不支持 H.265（HEVC）

**症状**：视频播放显示黑屏，无错误提示。

**根因**：iOS Safari 对 H.265 支持有限（需要 iOS 11+ 且特定条件），
在部分 Safari 版本中 H.265 MP4 直接显示黑屏。

**解决**：视频必须使用 **H.264（AVC）** 编码：
```bash
# ✅ 正确：H.264 编码，Safari 全版本兼容
ffmpeg -i input.mp4 \
  -c:v libx264 -preset slow -crf 23 \
  -c:a aac -b:a 128k \
  -movflags +faststart \
  output_h264.mp4

# ❌ 错误：H.265 → iOS Safari 黑屏
ffmpeg -i input.mp4 -c:v libx265 output_h265.mp4
```

### F-2. `-movflags +faststart` 确保边下边播

moov atom（视频元数据）默认在文件末尾，Safari 必须下载完整文件才能播放。
`-movflags +faststart` 将 moov atom 移到文件头，支持边下边播。

---

## 参考实现

- [barone-video/src/index.html](file:///d:/workspace/8thwall%20example/8thwall_ar/barone-video/src/index.html)（A-Frame 方案）
- [plant-grow-animation-introduce/src/ar/](file:///d:/workspace/8thwall%20example/8thwall_ar/plant-grow-animation-introduce/src/ar/)（ECS + TypeScript 方案）
  - [audio-unlock.ts](file:///d:/workspace/8thwall%20example/8thwall_ar/plant-grow-animation-introduce/src/ar/audio-unlock.ts)
  - [interaction-controller.ts](file:///d:/workspace/8thwall%20example/8thwall_ar/plant-grow-animation-introduce/src/ar/interaction-controller.ts)
  - [experience-timeline-controller.ts](file:///d:/workspace/8thwall%20example/8thwall_ar/plant-grow-animation-introduce/src/ar/experience-timeline-controller.ts)
  - [video-menu-controller.ts](file:///d:/workspace/8thwall%20example/8thwall_ar/plant-grow-animation-introduce/src/ar/video-menu-controller.ts)
  - [video-player-controller.ts](file:///d:/workspace/8thwall%20example/8thwall_ar/plant-grow-animation-introduce/src/ar/video-player-controller.ts)

---

## G. Three.js 选择性 Bloom (Selective Bloom) 与 8th Wall 物理尺寸调优专项

> 适用于 8th Wall + Three.js 手动注册 CameraPipelineModule 场景下的现代 AR 特效开发（如辉光、光晕、局部高光能量线段等）。

---

### G-1. 8th Wall 米制物理单位与 AR 视距透视换算

**问题 1：模型被二次缩小 10 倍（变 12mm 极小点）**
- **根因**：Blender mm 导出 / glTF 规范默认单位均是 **米（Metres）**（例如：90mm 模型在 glTF 中导出为 `0.09m`）。
- `XR8` 的 `imagefound` 事件返回的 `detail.scale` 实际上代表摄像头在世界坐标中检测到的物理标签宽度（单位：米，如 `~0.11m`）。
- 如果在代码中再执行 `model.scale.setScalar(detail.scale)`，相当于对原本就是米制尺寸的模型再乘一次 `0.11`，导致模型缩小近 10 倍（变成 12mm）。
- **修复**：对物理米制模型，设置固定物理缩放（例如 `FIXED_MODEL_SCALE = 1.0` 或放大的 `4.0`），不要盲目将 `imagefound.scale` 传入 `setScalar()`。

**问题 2：50cm 视距下模型看起来极小（~14mm）**
- **根因**：物理透视现象。在 50cm 手持视距下，看 90mm 物理标签时，在手机屏幕上的表观像素大小只有 ~14mm，这属于真实 AR 透视。
- **调优**：若需让特效具备较强视觉冲击力，可设置统一放大显示系数（如 `FIXED_MODEL_SCALE = 4.0`），使模型在 50cm 距离下占屏幕约 40%-50%。

---

### G-2. 选择性 Bloom (Selective Bloom) 双通道离屏合成架构

为避免场景中所有物体（包含摄像头现实底图和普通暗色底板）均被全屏 `UnrealBloomPass` 触发泛光，必须采用基于 `THREE.Layers` 的选择性 Bloom：

```
┌────────────────────────────────────────────────────────┐
│ Pass 1：bloomComposer                                  │
│  bloomCamera（仅开启 BLOOM_LAYER = 1）                 │
│  → 渲染选中的发光 Node 到黑色背景                      │
│  → UnrealBloomPass 生成光晕 → 写入离屏 renderTarget2    │
└────────────────────────────────────────────────────────┘
          ↓ bloomComposer.renderTarget2.texture
┌────────────────────────────────────────────────────────┐
│ Pass 2：finalComposer                                  │
│  主相机（BASE_LAYER = 0，全部场景）                    │
│  → 正常渲染 AR 帧                                       │
│  → AdditiveBlendShader 叠加光晕纹理 → 输出到屏幕       │
└────────────────────────────────────────────────────────┘
```

#### 关键坑点：Render Target 交换机制与纹理引用
`BloomComposer` 内执行 `RenderPass` 渲染完 Pass 0 后会触发缓冲区交换 (`needsSwap = true`)：
- 交换前：`writeBuffer = bloomRT`, `readBuffer = renderTarget2`
- 交换后：`writeBuffer = renderTarget2`, `readBuffer = bloomRT`

随后的 `UnrealBloomPass` 从 `readBuffer`（`bloomRT`，含场景图）读取内容，并将处理后的**最终光晕结果写入 `writeBuffer`（`renderTarget2`）**。

❌ **错误**：混合 Shader 中使用 `bloomRT.texture` → 拿到的是未后处理的原始图形，无 Bloom。  
✅ **正确**：混合 Shader 中必须使用 **`bloomComposer.renderTarget2.texture`** 才能成功拿到后处理光晕！

```js
const blendPass = new ShaderPass(
  new THREE.ShaderMaterial({
    uniforms: {
      baseTexture:  { value: null },
      // 必须指向 renderTarget2，UnrealBloomPass 在 Buffer 交换后将输出写入 renderTarget2
      bloomTexture: { value: bloomComposer.renderTarget2.texture },
    },
    vertexShader:   AdditiveBlendShader.vertexShader,
    fragmentShader: AdditiveBlendShader.fragmentShader,
  }),
  'baseTexture'
)
```

---

### G-3. Bloom 节点多目标参数化与 Blender 材质解耦

**设计原则**：
1. **多节点数组配置**：允许配置 `BLOOM_NODE_NAMES = ['GLOW_Energy_Particle_L', 'GLOW_Energy_Particle_R']`，遍历匹配模型中指定的 Blender Object 名。
2. **材质属性解耦**：不应在 JS 中强行用 `emissive.setHex()` 覆盖 Blender 设置。保留 Blender 导出的原生 `emissive` 颜色和 `emissiveIntensity`。
3. **防止亮度压缩**：在遍历节点材质时，仅需将 Bloom 物件材质设置 `mat.toneMapped = false`，防止 Three.js 的 `ACESFilmicToneMapping` 将高亮发光压缩而导致 threshold 无法正常触发。

```js
// 示例：多节点选择性 Bloom 材质层配置
const setupModelLayers = (model) => {
  setLayerAll(model, BASE_LAYER) // 默认均加入 BASE_LAYER (0)

  const targets = Array.isArray(BLOOM_NODE_NAMES) ? BLOOM_NODE_NAMES : [BLOOM_NODE_NAMES]
  targets.forEach((nodeName) => {
    const node = model.getObjectByName(nodeName)
    if (node) {
      node.traverse((o) => {
        o.layers.enable(BLOOM_LAYER) // 开启 BLOOM_LAYER (1)
        if (!o.isMesh) return
        const mats = Array.isArray(o.material) ? o.material : [o.material]
        mats.forEach((mat) => {
          if (!mat) return
          mat.toneMapped = false // 仅禁用 toneMapping，保持 Blender 原生发光材质与颜色
          mat.needsUpdate = true
        })
      })
    }
  })
}
```

---

## 参考实现

- [farahfort-cadiphy/src/bloom-demo.js](file:///d:/workspace/8thwall%20example/8thwall_ar/farahfort-cadiphy/src/bloom-demo.js)（选择性 Bloom + 8th Wall CameraPipelineModule 方案）

