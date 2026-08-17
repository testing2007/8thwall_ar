# Android/Huawei 相机兼容

## 目录

- [使用边界](#使用边界)
- [先诊断再修改](#先诊断再修改)
- [全屏显示与裁切](#全屏显示与裁切)
- [平台分流](#平台分流)
- [Android 后摄分类与主摄优选](#android-后摄分类与主摄优选)
- [媒体请求代理与失败回退](#媒体请求代理与失败回退)
- [后摄切换](#后摄切换)
- [本地诊断](#本地诊断)
- [验收矩阵](#验收矩阵)
- [禁止做法](#禁止做法)

## 使用边界

将本方案用于 8th Wall Image Target 项目出现以下问题时：

- Huawei/Honor/HarmonyOS 设备在华为浏览器中无法稳定启动 XR。
- Android 多摄设备选中长焦、微距、超广角或非默认 zoom，导致画面异常放大或模糊。
- 需要允许用户在多枚确认后摄之间切换，但不得暴露前摄或未知朝向设备。
- 需要全屏相机、稳定的 AR 投影和只在本机复制的诊断信息。

保持 `XR8.XrConfig.camera().BACK`、`XrController`、SLAM preload、Image Target 配置和既有媒体解锁链路。不要修改受许可约束的第三方 `external/xr/xr.js`。

## 先诊断再修改

1. 查找 XR8 启动入口、`XR8.run()` 参数、CameraPipelineModule 注册顺序、canvas 样式和所有 `getUserMedia` 包装。
2. 确认黑边是否来自自定义 contain 管线。不要把裁切倍数误当作镜头类型。
3. 在权限通过后读取实际 track、视频尺寸和设备标签；权限前的空标签不用于分类或选镜头。
4. 记录现有音频用户手势和目标识别状态，确保相机改造不会在进入页面时触发声音。
5. 保留可回退路径：指定镜头失败时必须回到 XR8 的浏览器默认后摄。

## 全屏显示与裁切

全屏无黑边与完整 4:3 视野无法同时满足。用户要求全屏时：

- 注册 `XRExtras.FullWindowCanvas.pipelineModule()`，让 XR8 管理 canvas 和投影。
- 使用 `cover` 语义显示，不注册会在 `onUpdate` 中重写 canvas 尺寸的 contain 管线。
- 仅使用诊断模块观察 CSS 尺寸、buffer 尺寸和 viewport；诊断模块不得修改 canvas。
- 响应 `resize`、`orientationchange` 和 `visualViewport.resize`，但只重新采集诊断。
- 将裁切指标命名为 `fullscreenCropScale`。它只表示源宽高比与 viewport 宽高比的差异，不表示是否为主摄，也不参与镜头选择。

```js
const fullscreenCropScale = Math.max(sourceAspect, viewportAspect) /
  Math.min(sourceAspect, viewportAspect)
```

长屏设备出现 `fullscreenCropScale > 1` 是正常的中心裁切结果；不能据此切换 contain 或更换摄像头。

## 平台分流

在安装相机代理、动态加载 XR8 和调用 `XR8.run()` 之前完成平台判断。

```js
const ua = navigator.userAgent || ''
const platform = navigator.platform || ''
const isHuaweiBrowser = /huaweibrowser/i.test(ua)
// 避免仅因浏览器名称含 Huawei 就把非华为设备算作华为设备。
const deviceUa = ua.replace(/huaweibrowser(?:\/[\w.-]+)?/ig, '')
const isHuaweiDevice = /huawei|honor|harmonyos|hmos/i.test(deviceUa)
const isAppleDevice = /iphone|ipad|ipod/i.test(ua) ||
  (platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const blockHuaweiBrowser = isHuaweiDevice && isHuaweiBrowser
const cameraSwitchSupported = !isAppleDevice && !blockHuaweiBrowser
```

执行以下分流：

- Huawei/Honor/HarmonyOS + `HuaweiBrowser`：硬阻断。显示“华为浏览器暂不支持，请使用 Chrome”及 Chrome Intent，不安装媒体代理、不加载 XR core、不请求相机、不提供继续入口。
- 华为设备 + Chrome/微信 WebView：不要拦截，保持 Android 流程。
- iPhone/iPad/iPod，包括 `MacIntel + maxTouchPoints > 1` 的桌面 UA iPad：使用 XR8 默认 `BACK`，不要安装镜头选择代理，不创建或刷新切换 UI。
- 其他 Android：保持多后摄策略。

Chrome Intent 保留当前 host、path 和 query：

```js
const url = new URL(location.href)
const scheme = url.protocol === 'http:' ? 'http' : 'https'
const chromeIntent = `intent://${url.host}${url.pathname}${url.search}` +
  `#Intent;scheme=${scheme};package=com.android.chrome;end`
```

同时显示当前链接和本地“复制链接”按钮，覆盖 Chrome 未安装的情况。不要添加“仍然继续”。

## Android 后摄分类与主摄优选

### 分类规则

先排除前摄，再确认后摄：

- `front`、`user`、`selfie`、`前置`：分类为 `front`，始终排除。
- `back`、`rear`、`environment`、`后置`：分类为 `rear`。
- 当前 track 只有在 `getSettings().facingMode === 'environment'` 时才可作为后摄证据。
- 空标签、仅有通用编号且无朝向词的设备：分类为 `unknown`，不自动选择、不进入切换列表。
- 按规范化标签去重，但保留浏览器枚举的原始顺序作为固定显示序号。

不要在权限前把空标签摄像头当作后摄。此错误会在 Huawei 等多摄设备上选中错误物理镜头，甚至导致相机会话持续等待。

### 主摄优选顺序

1. 使用用户保存且仍被重新确认为后摄的标签。
2. 排除包含 `tele`、`zoom`、`长焦`、`macro`、`微距`、`ultra wide`、`超广角`、`depth`、`tof` 等非主摄词的默认候选。
3. 优先 `main`、`primary`、`default`、普通 `wide` 等主摄词；先排除 `ultra wide`，再判断 `wide`。
4. Android 通用标签优先精确的 `camera 0` 或 `camera2 0`，不要用 `/0|1/` 这类会误中 `camera 10` 的正则。
5. 没有可靠主摄提示时，不强行指定第一枚后摄；保留浏览器 `facingMode: environment` 提供的默认后摄。

用户保存只使用原始镜头标签，不保存 `deviceId` 或 `groupId`。保存的镜头只影响选中项，不改变列表顺序和“后置摄像头 1/2/3”序号。

## 媒体请求代理与失败回退

仅在需要 Android 镜头选择时安装 `getUserMedia` 代理，并满足以下约束：

- 保存原始 bound `getUserMedia`，卸载时恢复。
- 只在 XR8 即将 `run()` 到取得 `hasStream`/失败之间打开 managed request window。
- 仅修改该窗口内的视频请求，不劫持页面其他媒体请求。
- 保留 XR8 原有分辨率、帧率等 video constraints，只用 `deviceId: {exact}` 补充目标镜头。
- 精确镜头请求失败时记录错误，并用原始 constraints 再请求一次浏览器默认后摄。
- 首次权限前没有标签时不要指定镜头；先让 XR8 正常获得默认 `BACK` 流。

```js
try {
  return await originalGetUserMedia(exactDeviceConstraints)
} catch (error) {
  recordCameraEvent({phase: 'exact-request-failed', error, fallback: 'browser-default-rear'})
  return originalGetUserMedia(originalConstraints)
}
```

禁止全局长期注入某个 `deviceId`，也不要修改 XR8 内部分辨率或相机运行时代码。

## 后摄切换

- 只有两枚及以上确认、去重且可用的后摄时显示“切换后摄”。一枚或零枚时不要创建操作入口。
- Apple 设备从 UI 创建、控制器安装、状态刷新和切换函数四层同时退出，防止异步相机回调重新生成按钮。
- 列表只显示确认后摄，使用稳定枚举顺序生成固定序号；选中第 3 枚后刷新，仍显示为第 3 枚。
- 显示原始标签以及“当前”“推荐”状态；长标签使用 `minmax(0, 1fr)`、`min-width: 0` 和省略号，避免右侧徽标溢出。
- 切换操作串行化并禁用重复点击。只注册一次 CameraPipelineModule；切换时复用原 `XR8.run()` 配置，依次执行 `XR8.stop()`、等待旧流释放、设置目标、`XR8.run()`。
- 等待 `hasVideo` 后才报告成功并保存标签。失败时恢复上一枚可用后摄；恢复也失败时显示非阻塞错误并保留诊断。
- 相机数量降为一枚时立即关闭列表并移除/隐藏入口。

## 本地诊断

仅在页面内存和用户剪贴板生成 JSON；不要新增接口、埋点、网络上传或服务端存储。限制事件列表条数。

记录：

- UA、platform、Huawei/Apple/Android 分类、华为浏览器分类、启动是否被阻断、阻断原因、是否支持镜头切换。
- XR8 `run`、`stop`、重新运行和 `requesting`、`hasStream`、`hasVideo`、失败时间线。
- 当前 track 标签、序号、facingMode、readyState、muted、宽高、帧率、focusMode、resizeMode、zoom 当前值与范围。
- canvas CSS/buffer、viewport、visualViewport、DPR、方向和 `fullscreenCropScale`。
- 所有相机的序号、标签、`rear/front/unknown` 分类和理由；确认后摄、前摄和未知数量。
- 主摄推荐、选择来源、保存标签是否命中、最终标签、切换阶段、耗时、失败和回退。
- 低分辨率、异常 zoom、疑似前摄/非主后摄、主摄无法确认、保存镜头失效、精确请求回退和高裁切告警。

不要记录 `deviceId`、`groupId`、图像帧、相机画面、识别内容或业务数据。使用 `?cameraDebug=1` 提供本地复制入口；华为浏览器阻断页也要能打开或复制诊断。

## 验收矩阵

- Huawei/Honor + HuaweiBrowser：立即阻断；无 XR core 动态加载、无 `XR8.run()`、无相机权限；Chrome 按钮和复制链接可用。
- Huawei/Honor + Chrome：不阻断；正常全屏 AR；多后摄逻辑可用。
- Huawei/Honor + 微信 WebView：不因设备品牌被误判为华为浏览器。
- iPhone/iPad Safari 和桌面 UA iPad：正常使用 XR8 默认后摄；不存在切换按钮、列表或媒体代理。
- Android 单后摄：不存在切换入口。
- Android 多后摄：固定序号、主摄优选、手动选择、连续点击保护、偏好恢复和失败回退正确。
- 20:9 竖屏、横竖屏旋转和地址栏伸缩：全屏无黑边，AR 锚定和点击坐标正常。
- 首次进入无声音；只有 Image Target found 后才播放业务音频。
- 诊断 JSON 和 localStorage 不包含 `deviceId`、`groupId`；复制诊断不产生网络请求。
- 执行生产构建并检查无新增编译错误。

## 禁止做法

- 不要用 `fullscreenCropScale`、旧 `legacyCropScale` 或分辨率判断主摄。
- 不要为消除裁切切回 contain；全屏要求接受中心裁切。
- 不要将所有非前摄、空标签或通用 `camera N` 自动认定为后摄。
- 不要因 UA 出现 `HuaweiBrowser` 就单独判定设备品牌；先从设备 UA 判断中剔除浏览器 token，再做双条件拦截。
- 不要在 Apple 设备仅靠 CSS 隐藏按钮；同时禁止代理安装、UI 创建、刷新和切换执行。
- 不要在首次进入或媒体解锁时播放业务音频；解锁输出必须保持静音，目标未识别时拒绝播放。
- 不要重复注册 XR8 管线模块，不要并发执行 `XR8.stop()`/`XR8.run()`。

## 参考实现

- `farahfort-cadiphy/src/app.js`：平台分流、华为浏览器阻断、Apple 切换禁用和 XR8 会话切换。
- `farahfort-cadiphy/src/camera-runtime.js`：全屏诊断、后摄分类、主摄优选、媒体请求代理和本地相机诊断。
- `farahfort-cadiphy/src/assets/cadiphy-ui.css`：全屏画布、后摄列表防溢出和阻断提示样式。
