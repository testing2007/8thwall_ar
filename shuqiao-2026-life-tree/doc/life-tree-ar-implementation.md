# 生命树 Image Target WebAR 实现与调参说明

本文档对应当前仓库代码，用于说明生命树 AR 的运行原理、数据流、可调参数和路径校准方式。

## 1. 当前实现概览

- 定位方式：8th Wall Engine Image Target。
- 渲染方式：Three.js。
- 正式坐标源：`src/data/path.json`。
- 当前数据：25 条能量路径、3 个生命核心、4 个粒子发射区。
- 树体：`src/assets/tree.glb`，保留少量真实厚度。
- 底图：`src/assets/target.jpg`，尺寸为 `894 × 640 px`。
- Target 物理设计尺寸：`0.7 × 0.5 m`。
- 不使用 Bloom、后处理、视频、序列帧或额外运行时依赖。
- 粒子使用一个实例化 Mesh；每条能量路径使用一个 Ribbon Mesh。

体验由四层效果组成：

1. 三个生命核心发光。
2. Ribbon 能量沿根、树桩和树枝依次传导。
3. GLB 树皮层对光进行遮挡和纹理切割，形成内部透光。
4. 四个树冠区域释放 GPU 粒子。

## 2. 主要文件职责

| 文件 | 作用 |
| --- | --- |
| `src/app.js` | 加载 XR8、注册 Image Target 事件、创建 AR 控制器 |
| `src/life-tree-ar.js` | 状态机、Target 生命周期、统一更新和销毁效果 |
| `src/config.js` | 时间、视觉、尺寸、性能和调试参数的统一入口 |
| `src/data/path.json` | 正式路径、核心、粒子区和 Z 层级数据 |
| `src/data/energy-paths.js` | 读取 `path.json`，补全颜色、阶段等缺省字段 |
| `src/data/calibration-layout.js` | V1/V2/V3 校准数据兼容、校验和合并 |
| `src/utils/coordinate.js` | 图片像素与 Target 局部坐标互转、XR8 姿态映射 |
| `src/utils/ribbon-geometry.js` | 根据样条曲线生成平面 Ribbon 几何 |
| `src/effects/energy-tree.js` | 路径揭示、流动亮点、丝线、噪声和 ALIVE 重播 |
| `src/effects/life-core.js` | 三个生命核心的呼吸、内核、外圈和扩散环 |
| `src/effects/bark-occlusion.js` | GLB 树皮覆盖、内部流动贴图和透光 Shader |
| `src/effects/life-particles.js` | 单 draw call 的 GPU 实例化粒子 |
| `src/debug/standalone-calibration-preview.js` | 无需识别 Target 的本地校准预览 |
| `src/debug/calibration-editor.js` | 路径、核心、粒子区和 Z 层编辑器 |
| `src/effects/debug-overlay.js` | 调试边界、控制点和辅助线 |

## 3. 启动与生命周期

页面先显示 `Start AR`。点击后才加载 XR/Slam 运行时并申请相机权限。

监听的事件：

- `reality.imagefound`：首次识别并进入 `AWAKENING`。
- `reality.imageupdated`：只更新位置、旋转和缩放，不重新启动动画。
- `reality.imagelost`：立即隐藏并暂停效果。

状态机固定为：

```text
IDLE → AWAKENING → ALIVE
```

- `IDLE`：效果隐藏，时间为 0。
- `AWAKENING`：播放根部到树冠的完整觉醒过程。
- `ALIVE`：保留低强度常亮，并随机重播主路径。
- Target 丢失不超过 3 秒：重新识别后从原时间继续。
- Target 丢失达到 3 秒：重置到 `IDLE`，下次从头播放。

所有效果模块统一提供：

```js
group
update(elapsed, state)
reset()
dispose()
```

## 4. 坐标系统与对齐原理

### 4.1 编辑坐标

`path.json` 中所有坐标都使用原图像素：

- 左上角：`(0, 0)`
- 右下角：`(894, 640)`
- X 向右增加
- Y 向下增加

像素到 Target 局部坐标的基础转换：

```text
worldX = (x / 894 - 0.5) × 0.7
worldY = (0.5 - y / 640) × 0.5
```

逆转换由 `worldPointToImage()` 完成。

### 4.2 Image Target 裁切

当前识别包中的有效裁切区，换算到横向原图后为：

```js
{ x: 20, y: 0, width: 853, height: 640 }
```

XR8 返回的是识别裁切区姿态，而路径是在完整 `894 × 640` 图片上编辑。因此运行时会：

1. 计算裁切区在完整图片局部坐标中的尺寸和中心。
2. 分别使用 `scaledWidth × scale` 与 `scaledHeight × scale` 计算 X/Y 缩放。
3. 补偿裁切中心与完整图片中心之间的差值。
4. 应用 XR8 的位置和四元数旋转。

X/Y 必须独立计算，不能取平均，否则不同摄像头画幅下可能出现方向不同的坐标漂移。

### 4.3 对齐排查原则

- 如果所有路径同方向、同距离偏移：检查 Target 姿态和裁切映射。
- 如果越靠边误差越大：检查 X/Y 缩放或原图尺寸。
- 如果换左右观察角度后偏移方向反转：检查效果层 Z 深度或模型厚度造成的视差。
- 只有单条路径不贴树枝：编辑该路径控制点。
- 不要通过拖动所有路径来掩盖全局姿态错误。

## 5. 能量路径原理

每条路径至少包含两个像素控制点。运行时使用：

```text
像素控制点
  → CatmullRomCurve3（centripetal）
  → 沿弧长采样
  → 平面法线扩展
  → Ribbon BufferGeometry
  → ShaderMaterial
```

Ribbon 几何包含路径方向 UV、横向坐标和累计距离。采样段数按控制点数量计算，并限制在约 `24–96`；几何工具本身保证至少 32 段。

路径 Shader 在同一个 Mesh 中合成：

- 白亮内核
- 彩色能量主体
- 柔光外圈
- 7 股流动丝线
- 两层程序噪声
- 柔和破边
- 移动能量头
- 能量头后的余波

AWAKENING 时按路径阶段和 `delay` 揭示。ALIVE 时路径保持低亮度，并每 3–6 秒从树桩或主枝中选择一条进行脉冲重播。

每条路径对应一个 draw call。当前 25 条路径即约 25 个路径 draw calls。

## 6. 树皮内部透光原理

仅改变 Z 不能让现实摄像头画面遮挡虚拟光，因此当前使用真实 GLB 树皮覆盖层。

### 6.1 流动数据纹理

`BarkOcclusionEffect` 根据所有路径在 Canvas 上生成一张打包纹理：

| 通道 | 内容 |
| --- | --- |
| R | 光到达当前像素的时间 |
| G | 路径周围的树皮覆盖走廊 |
| B | 较细的内部筋络 |
| A | 固定为不透明数据通道 |

路径拖动或修改宽度时会重新生成此纹理。拖动期间最多每 80 ms 重建一次，结束后生成最终结果。

### 6.2 树皮 Shader

GLB 材质读取：

- 模型原画纹理
- Canvas 流动数据纹理
- 原图当前像素亮度
- 四邻域平均亮度
- 局部对比度
- 模型表面法线和观察方向

树皮凸起区域保持较高不透明度，暗沟槽和高对比裂纹允许下层能量透出。Shader 还使用反向 Fresnel 约束：正面更容易看到内部光，侧面轮廓不形成明显霓虹边。

这层使用普通透明混合；下层 Ribbon 使用加法混合。最终效果不是把完整光带贴在树皮表面，而是让树皮纹理切割光带，形成根茎内部输送感。

## 7. 生命核心原理

三个核心各使用一个平面和一个 ShaderMaterial，在一个 Shader 中合成：

- 白亮内核
- 彩色中层
- 柔光外圈
- 缓慢扩散环
- 低频呼吸
- 伪噪声形变

三个核心拥有不同颜色和相位，避免完全同步呼吸。核心在 `0.9–2.15 s` 逐渐激活，ALIVE 时降低透明度但继续呼吸。

## 8. 粒子原理

所有粒子使用一个 `InstancedBufferGeometry` 四边形 Mesh，因此无论实例数量多少都只有一个粒子 draw call。

每个实例保存：

- 初始位置
- 漂移量
- 颜色
- 生命周期
- 屏幕尺寸
- 相位
- 揭示顺序
- 形状
- 是否为高亮粒子

顶点 Shader 计算上浮、横向摆动、轻微 Z 漂移、旋转和屏幕像素尺寸。片元 Shader 生成三种轮廓：

- 柔光球
- 叶片光屑
- 细长流光

粒子在 `3.5–7 s` 逐渐出现。粒子数量按设备内存和 CPU 核心数分档，低等级设备只减少实例数，不更换视觉体系。

## 9. 时间线参数

位于 `CONFIG.timeline`、`CONFIG.core` 和 `CONFIG.energy.sequence`。

| 参数 | 当前值 | 作用 |
| --- | ---: | --- |
| `timeline.awakeningEnd` | 8 s | AWAKENING 转入 ALIVE |
| `timeline.targetLostGraceMs` | 3000 ms | Target 丢失续播宽限期 |
| `timeline.energyEnd` | 4.5 s | Ribbon 从觉醒强度向 ALIVE 强度过渡的起点 |
| `timeline.particlesEnd` | 7 s | 粒子完全显示时间 |
| `timeline.coreEnd` | 1.5 s | 当前为保留字段，核心实际不读取此值 |
| `core.activationStart` | 0.9 s | 核心开始出现 |
| `core.activationEnd` | 2.15 s | 核心完成出现 |

路径阶段时间：

| 分组 | start | duration | 含义 |
| --- | ---: | ---: | --- |
| `root` | 0.18 s | 1.18 s | 泥土、树根 |
| `trunk` | 1.05 s | 1.42 s | 树桩、主干 |
| `main-branch` | 2.18 s | 1.52 s | 主枝 |
| `side-branch` | 3.08 s | 1.32 s | 侧枝、末端枝 |

单条路径实际开始时间为：

```text
group.start + path.delay
```

## 10. CONFIG 可调参数

### 10.1 Target 与坐标

| 参数 | 当前值 | 作用 |
| --- | --- | --- |
| `targetName` | `target` | 只响应同名 Image Target |
| `puzzle.width/height` | `0.7 / 0.5` m | 编辑平面的设计物理尺寸 |
| `puzzle.imageWidth/imageHeight` | `894 / 640` px | `path.json` 坐标范围 |
| `puzzle.crop` | `20,0,853,640` | 识别裁切在横向完整图中的范围 |

除非重新生成 Image Target 或更换正式图片，不应修改这一组参数。

### 10.2 Z 层级

| 参数 | 当前值 | 作用 |
| --- | ---: | --- |
| `layers.core` | 0.30 mm | 核心层 |
| `layers.energy` | 0.25 mm | Ribbon 默认层 |
| `layers.bark` | 0.55 mm | 树皮覆盖层默认值 |
| `layers.particleMin/Max` | 2–12 mm | 粒子初始纵深范围 |
| `layers.debug` | 1.60 mm | 强制可见的辅助线层 |

正式运行时，`path.json.layers` 会覆盖能量层和树皮层。当前文件保存的是：

```json
{
  "energyZMm": 0,
  "barkZMm": 0.1
}
```

注意：当前加载器对 `energyZMm` 使用数值后再做 `||` 回退，所以值为 `0` 时实际会回退到 `CONFIG.layers.energy = 0.25 mm`；如果需要从 JSON 明确覆盖，请暂时使用大于 0 的值。

### 10.3 核心

| 参数 | 当前值 | 调大后的效果 |
| --- | ---: | --- |
| `intensity` | 0.9 | 整体更亮 |
| `opacity` | 0.78 | 觉醒期更明显 |
| `aliveOpacity` | 0.55 | 常驻状态更明显 |
| `pulseSpeed` | 0.72 | 呼吸更快 |
| `sizeScale` | 1.12 | 三个核心整体变大 |
| `innerStrength` | 1.25 | 白亮内核增强 |
| `middleStrength` | 0.82 | 彩色中层增强 |
| `haloStrength` | 0.42 | 外圈增强，过大会像贴纸光晕 |
| `ringStrength` | 0.30 | 扩散环增强 |
| `ringSpeed` | 0.105 | 扩散环移动更快 |

核心的中心和尺寸优先从 `path.json.cores` 读取，而不是直接修改 `CONFIG.core.centers`。

### 10.4 Ribbon 能量

| 参数 | 当前值 | 作用 |
| --- | ---: | --- |
| `outerWidth` | 8 mm | 未在路径中指定 `widthMm` 时的基础宽度 |
| `coreWidth` | 1.2 mm | 白亮核心宽度 |
| `speed` | 0.16 | Shader 内部流动速度 |
| `filamentCount` | 7 | 光带中的丝线数量 |
| `noiseStrength` | 0.72 | 破边和扰动幅度 |
| `noiseFrequency` | 18 | 噪声细密程度 |
| `headLength` | 0.11 | 移动能量头长度，使用路径归一化比例 |
| `pulseMinSeconds` | 3 s | ALIVE 重播最短间隔 |
| `pulseMaxSeconds` | 6 s | ALIVE 重播最长间隔 |
| `pulseDuration` | 1.8 s | 单次重播增强时长 |

默认分组宽度倍率：

| 分组 | 倍率 |
| --- | ---: |
| `root` | 1.0 |
| `trunk` | 1.35 |
| `main-branch` | 1.1 |
| `side-branch` | 0.8 |

如果某条路径存在 `widthMm`，以该路径的值为准。

觉醒强度：

```js
{ core: 0.85, body: 0.48, halo: 0.08 }
```

ALIVE 强度：

```js
{ core: 0.42, body: 0.22, halo: 0.04 }
```

如果画面像表面霓虹线，优先降低 `halo` 和 `body`，不要只调整 Z。

### 10.5 内部流动与树皮遮挡

| 参数 | 当前值 | 作用 |
| --- | ---: | --- |
| `internalFlow.textureWidth` | 512 px | 打包流动纹理宽度 |
| `maxArrivalSeconds` | 5.2 s | R 通道可编码的最大到达时间 |
| `featherPixels` | 7 px | 内部流动区域羽化 |
| `headDuration` | 0.62 s | 树皮层移动光头持续时间 |
| `awakeningIntensity` | 1.05 | 树皮内部觉醒亮度 |
| `aliveIntensity` | 0.42 | 树皮内部常驻亮度 |
| `ridgeOpacity` | 0.88 | 树皮凸起遮挡强度 |
| `grooveOpacity` | 0.24 | 暗沟槽遮挡强度，越低越透光 |
| `rebuildThrottleMs` | 80 ms | Debug 拖动时遮罩重建节流 |

内部走廊宽度，单位为原图像素：

| 分组 | corridor | vein |
| --- | ---: | ---: |
| `root` | 28 | 8 |
| `trunk` | 34 | 10 |
| `main-branch` | 26 | 7 |
| `side-branch` | 20 | 5 |

`corridor` 控制影响树皮的宽区域，`vein` 控制内部较细的筋络。单条路径的 `widthMm` 还会同比调整对应走廊。

### 10.6 粒子

| 参数 | 当前值 | 作用 |
| --- | ---: | --- |
| `lowCount` | 144 | 低档设备实例数 |
| `mediumCount` | 280 | 中档设备实例数 |
| `highCount` | 420 | 高档设备实例数 |
| `minSize/maxSize` | 8–20 px | 普通粒子屏幕尺寸 |
| `highlightRatio` | 0.20 | 高亮粒子比例 |
| `highlightMinSize/MaxSize` | 18–30 px | 高亮粒子屏幕尺寸 |
| `minScreenSize` | 8 px | 远距离最小尺寸 |
| `minLife/maxLife` | 5.5–9.5 s | 生命周期范围 |
| `minRise/maxRise` | 12–28 mm | 单生命周期上浮距离 |
| `opacity` | 0.78 | 粒子总透明度 |

形状比例：

```js
{ soft: 0.60, leaf: 0.22, streak: 0.18 }
```

粒子过弱时优先增加 `minScreenSize`、尺寸和 `opacity`；增加数量会提高片元填充压力，但不会增加 draw call。

### 10.7 性能

| 参数 | 当前值 | 作用 |
| --- | ---: | --- |
| `pixelRatioCap` | 1.75 | WebGL 最大设备像素比 |
| `maxDeltaSeconds` | 0.1 s | 单帧最大动画步长，避免切后台后跳帧 |

当前 draw call 估算：

```text
路径数量 N
+ 3 个核心
+ 1 个实例化粒子 Mesh
+ tree.glb 的可见材质/primitive 数量
```

当前 N 为 25。如果 GLB 只有一个可见 primitive，总数约为 30。新增路径会一条增加一个 draw call。

## 11. path.json 数据结构

当前正式格式为 V3：

```json
{
  "version": 3,
  "paths": [
    {
      "id": "root-left",
      "group": "root",
      "delay": 0,
      "colors": ["#f06848", "#f7ba50"],
      "widthMm": 8,
      "points": [[16, 605], [84, 596], [128, 581]]
    }
  ],
  "cores": [
    {
      "id": "core-left",
      "center": [350, 414],
      "size": [111, 89]
    }
  ],
  "particleZones": [
    {
      "id": "left-canopy",
      "center": [226, 198],
      "width": 164,
      "height": 160
    }
  ],
  "layers": {
    "energyZMm": 0.25,
    "barkZMm": 0.55
  }
}
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| `id` | 唯一 ID；不可重复 |
| `group` | `root`、`trunk`、`main-branch`、`side-branch` |
| `delay` | 相对该分组开始时间的附加延迟，单位秒 |
| `colors` | 路径起止渐变颜色 |
| `widthMm` | 单条路径外层 Ribbon 宽度，单位毫米 |
| `points` | `894 × 640` 原图上的控制点，至少两个 |
| `center` | 核心或粒子区中心，单位像素 |
| `size` | 核心宽高，单位像素 |
| `width/height` | 粒子区宽高，单位像素 |
| `energyZMm/barkZMm` | 全局层级，单位毫米 |

V3 的 `paths` 是权威列表：增加和删除路径都会保留。V1/V2 导入采用按 ID 覆盖旧默认路径的兼容方式。

## 12. Debug 校准工具

打开：

```text
http://localhost:58000/?debug=1
```

该模式直接显示完整 `target.jpg`，无需摄像头识别。预览相机居中并为图片保留约 8% 留白。

### 12.1 面板操作

- 拖动面板标题可移动整个面板，位置会单独保存。
- 路径模式：选择或拖动控制点、插入点、删除点、新建路径、删除整条路径。
- 核心模式：拖动中心和尺寸手柄。
- 粒子区模式：拖动中心和边缘手柄。
- X/Y 输入框和 `±1/±5 px` 按钮用于精调。
- 路径宽度范围：`0.5–30 mm`，步长 `0.25 mm`。
- 新路径默认宽度：`6 mm`。
- 新路径默认分组：`side-branch`。
- “纯效果预览”会隐藏控制点和辅助线，并暂停编辑。
- “复制 JSON”复制当前 V3 数据。
- “下载 path.json”得到可直接替换源码的文件。
- “导入”支持粘贴 V1/V2/V3 JSON。
- “恢复源码默认值”清除调试缓存并重新读取源码默认数据。

### 12.2 Debug 缓存与正式数据

Debug 修改自动保存到：

```text
localStorage: life-tree-calibration-v3
```

旧的 V2/V1 Key 也可读取。面板位置保存到：

```text
life-tree-calibration-panel-position-v1
```

普通 URL 不创建编辑器，也不读取这些调试缓存。正式坐标只来自：

```text
src/data/path.json
```

推荐流程：

1. 使用 `?debug=1` 完成编辑。
2. 点击“下载 path.json”。
3. 用下载文件替换 `src/data/path.json`。
4. 刷新普通 URL 进行实际识别测试。
5. 发布前执行生产构建。

## 13. 常用调参方案

### 13.1 光仍像附着在表面

按顺序调整：

1. 降低 `energy.awakeningStrength.halo/body`。
2. 降低 `energy.aliveStrength.halo/body`。
3. 提高 `internalFlow.ridgeOpacity`。
4. 降低 `internalFlow.grooveOpacity`，让光集中从沟槽透出。
5. 缩小 `internalFlow.veinWidths`，形成更细的筋络。
6. 确认树皮 Z 大于能量 Z，且至少相差 `0.1 mm`。

### 13.2 光流不够明显

按顺序调整：

1. 提高 `internalFlow.awakeningIntensity`。
2. 提高路径 `widthMm` 或 `veinWidths`。
3. 提高 `energy.awakeningStrength.core`。
4. 适量提高 `headDuration` 或 `energy.headLength`。
5. 最后再提高 halo，避免回到霓虹描边。

### 13.3 传导顺序不自然

- 先修改路径 `group`。
- 再修改单条路径 `delay`。
- 只有整体节奏不合适时才修改 `energy.sequence`。
- 路径控制点数组方向必须是“供能起点 → 树枝末端”。反向数组会反向传导。

### 13.4 粒子仍不明显

- 放大 `minScreenSize`。
- 放大普通/高亮尺寸。
- 提高 `opacity` 或 `highlightRatio`。
- 增加 Count 只会增加实例和像素填充，不会增加 draw call。
- 避免同时大幅增加数量、尺寸和透明度，以免产生烟花感或移动端过度填充。

### 13.5 近看对齐、斜看偏移

这通常是 Z 深度或 GLB 厚度造成的视差，不是路径像素坐标问题：

- 先把能量 Z 调低。
- 保证树皮仅比能量靠近相机少量距离。
- 检查 GLB 的 Solidify/Displace 是否仍有过大厚度。
- 使用正对 Target 的画面完成二维坐标校准。

## 14. 本地运行与构建

开发服务器：

```bash
npm run serve
```

开发服务器会监听源码变化并重新编译，通常无需手动执行 build。

生产构建：

```bash
npm run build
```

`npm run build` 用于发布前检查和生成生产 bundle，不负责决定运行时读取哪份路径。只要开发服务已经重新编译，localhost 和 ngrok 都会读取同一个 `src/data/path.json`。

手机通过 ngrok 测试时，如果怀疑缓存，可在 URL 后追加版本参数：

```text
https://example.ngrok.app/?v=4
```

## 15. 修改后的检查清单

- `path.json` 是合法 JSON，版本为 3。
- 每条路径 ID 唯一且至少两个点。
- 点坐标位于 `0–894 × 0–640`。
- 路径点顺序符合根部到末端的传导方向。
- 树皮 Z 高于能量 Z，间隔不小于 0.1 mm。
- 普通 URL 不带 `?debug=1`。
- Target 丢失 3 秒内能够续播，超过 3 秒会重置。
- PC 和手机均尽量正对 Target 检查二维对齐。
- 斜视偏移应通过 Z/模型厚度处理，而不是整体拖动路径。
- 发布前执行 `npm run build`。

