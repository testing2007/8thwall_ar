question: 发现在有些手机上不能出现摄像头授权请求，显示的是全黑的，用户是通过链接在微信客户端打开的情况，浏览器行不行不知道，微信版本也不清楚;

answer: 是的，这个问题我基本能定位了。**现在最主要的不是 GLB、识别图或 Three.js，而是你的“启动/摄像头授权流程”本身存在一个明显的死锁式 UI 问题。**

我检查了 `menodi-2026-lions` 当前代码。

### 目前代码为什么会出现“全黑”

你的 `index.html` 初始状态是：

```html
<body class="ar-camera-hidden"></body>
```

同时：

```css
body.ar-camera-hidden #camerafeed {
  visibility: hidden;
}

#ar-intro-screen {
  visibility: hidden;
  opacity: 0;
}
```

也就是说，**页面刚打开时：摄像头 Canvas 隐藏，封面也隐藏，只剩下 `body` 的黑色背景。**

然后你现在只有在：

```js
onCameraStatusChange: ({ status }) => {
  if (status === "hasStream" || status === "hasVideo") {
    showIntroScreen();
  }
};
```

才显示封面。

但 8th Wall 官方定义的摄像头状态流程实际上是：

```text
requesting
   ↓
hasStream
   ↓
hasVideo

或者

requesting
   ↓
failed
```

`requesting` 正是应该显示“请允许摄像头权限”的阶段，而 `failed` 应该显示重新授权/更换浏览器提示。([8th Wall][1])

所以你现在实际上写成了：

```text
打开网页
 ↓
黑屏
 ↓
自动 XR8.run()
 ↓
等待摄像头权限

如果成功弹窗并授权
 ↓
hasStream
 ↓
这时候才显示你的 MENODI 封面

如果微信没有弹摄像头授权
 ↓
永远到不了 hasStream
 ↓
封面永远不显示
 ↓
用户看到永久黑屏
```

这和你描述的现象完全吻合。

另外，现在 `bootstrap()` 里面直接执行：

```js
startEngine();
```

也就是说用户**根本还没点击“开启AR体验”，程序已经开始启动摄像头了**。

你页面上的：

```text
开启AR体验
```

目前主要做的是解锁 Web Audio，然后把封面隐藏掉，并不是它触发摄像头权限。

这套逻辑在 Safari/Chrome 可能看起来没问题，但放到微信这种 App 内置 WebView，容错性就明显不够。

---

## 我建议直接把流程改掉

正确流程应该是：

```text
用户打开链接
        ↓
永远先看到 poster.jpg
        ↓
     开启AR体验
        ↓
用户主动点击
        ↓
 ┌─────────────┐
 │ 解锁 Audio  │
 │ 启动 XR8    │
 │ 请求 Camera │
 └─────────────┘
        ↓
 requesting
        ↓
封面继续显示
“请允许摄像头访问”
        ↓
 hasStream
        ↓
“正在启动 AR...”
        ↓
 hasVideo
        ↓
隐藏封面
显示摄像头
        ↓
开始识别 lion-meno
```

如果失败：

```text
failed
 ↓
绝对不能黑屏

显示：

无法访问摄像头

[再次尝试]

微信内打开：
请点击右上角菜单，
选择“在浏览器中打开”

建议：
iPhone → Safari
Android → Chrome / Edge / Samsung Internet
```

8th Wall 官方要求 WebAR 环境至少要具备 HTTPS、`getUserMedia`、WebGL、WebAssembly；当前官方文档明确列出的常见浏览器包括 iOS Safari，以及 Android Chrome、Firefox、Samsung Internet、Edge。([8th Wall][2])

所以你问：

> 浏览器行不行不知道

**浏览器反而应该作为你的标准测试基准。**

建议至少测试：

```text
iPhone
├── 微信
└── Safari        ← 基准

Android
├── 微信
├── Chrome        ← 基准
├── Edge
└── Samsung Internet
```

不要只用微信测试。

---

## 微信本身不要当作“必定可以直接运行”

WebAR 最关键的是：

```js
navigator.mediaDevices.getUserMedia();
```

如果宿主 WebView 没有把摄像头能力正确开放给网页，甚至可能连权限询问都不会出现。浏览器标准也明确说明，`getUserMedia()` 必须处在符合要求的安全环境和权限上下文中。([MDN Web Docs][3])

8th Wall 本身也会把：

```text
MISSING_USER_MEDIA
UNSUPPORTED_BROWSER
```

作为正式的浏览器不兼容原因。([8th Wall][4])

因此生产环境不能设计成：

> 微信失败 → 黑屏 → 用户自己猜发生了什么

而应该：

> 微信能运行最好；运行不了立即告诉用户用系统浏览器打开。

---

## 你的代码还应该增加一个“保险”

除了监听：

```js
requesting;
hasStream;
hasVideo;
failed;
```

我还建议加一个大约 8～10 秒的启动超时。

原因很简单：某些 WebView 可能不是干净利落地进入：

```text
failed
```

而是卡在某个初始化阶段。

所以：

```text
点击开启AR
↓
开始计时

8秒后仍没有 hasVideo
↓
显示兼容性提示
```

不要再让用户看到黑屏。

同时把这些信息打印出来：

```js
console.log({
  userAgent: navigator.userAgent,
  secureContext: window.isSecureContext,
  mediaDevices: !!navigator.mediaDevices,
  getUserMedia: !!navigator.mediaDevices?.getUserMedia,
  webAssembly: !!window.WebAssembly,
  isWechat: /MicroMessenger/i.test(navigator.userAgent),
});
```

这样以后客户发来手机型号和截图，你就很好判断到底是：

```text
设备问题
微信版本问题
权限问题
WebView问题
8th Wall兼容问题
```

---

## 我认为现在应该改 3 个核心地方

你现在：

```text
bootstrap()
 ├─ loadSubtitles()
 └─ startEngine()       ❌ 立即启动摄像头

camera hasStream
 └─ showIntroScreen()   ❌ 摄像头成功后才显示启动页

点击开启AR
 └─ unlockStoryAudio()  ❌ 按钮没有真正承担启动AR
```

建议改成：

```text
bootstrap()
 ├─ showIntroScreen()   ✅
 ├─ loadSubtitles()
 └─ preload XR Runtime  ✅ 只加载，不开摄像头

点击开启AR
 ├─ unlockStoryAudio()
 └─ XR8.run()           ✅ 用户主动开始

requesting
 └─ 显示“请允许摄像头”

hasVideo
 ├─ ar-camera-hidden 移除
 └─ hideIntroScreen()

failed
 └─ 显示权限/浏览器切换页面
```

这样还正好符合你之前的设计目标：**用户只点一次“开启AR体验”，这一点同时负责音频解锁 + 摄像头授权 + 进入 AR。**

而且你现在已经用了：

```js
disableWorldTracking: true;
```

这是 Image Target 项目，不需要为了这个功能额外依赖世界追踪。

### 结论

我认为你这次遇到的“部分手机微信打开全黑”，**至少代码层面的第一责任点已经找到了**：

> `ar-intro-screen` 默认隐藏，却只有摄像头成功后才显示。

这会把任何摄像头权限异常直接表现成“永久黑屏”。

微信 WebView 本身可能是触发问题的环境，但**即便微信真有兼容问题，你现在的程序也不应该黑屏**。应该始终有封面、状态提示和 Safari/Chrome fallback。

下一步我建议直接把 `menodi-2026-lions/src/app.js + index.html` 这套启动逻辑改掉，同时加入 **微信检测、camera failed、8 秒超时、系统浏览器打开提示和调试信息**。这样这一套启动模块后面也能直接复制给你的 MENODI 其他动物 AR 项目。

[1]: https://www.8thwall.com/docs/api/engine/camerapipelinemodule/oncamerastatuschange/?utm_source=chatgpt.com "onCameraStatusChange() | 8th Wall"
[2]: https://www.8thwall.com/docs/de/quickstart/getting-started/requirements/?utm_source=chatgpt.com "Anforderungen | 8th Wall"
[3]: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia.?utm_source=chatgpt.com "MediaDevices: getUserMedia() method - Web APIs | MDN"
[4]: https://www.8thwall.com/docs/legacy/api/xrdevice/incompatibilityreasons/?utm_source=chatgpt.com "XR8.XrDevice.IncompatibilityReasons | 8th Wall"
