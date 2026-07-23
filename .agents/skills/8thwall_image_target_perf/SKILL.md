---
name: 8thwall-image-target-perf
description: >
  8th Wall Image Target AR 项目在 Safari 移动端（无痕浏览）加载慢、
  XrController null 报错、视频音频无法自动解锁、视频播放中途停止等问题的
  诊断与修复模式。适用于使用 A-Frame + xrextras + xrweb 的 Image Target 场景。
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
