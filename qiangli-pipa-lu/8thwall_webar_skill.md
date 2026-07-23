# 8th Wall WebAR 核心开发指南 & 知识库 (Skill Document)

本指南总结了 8th Wall WebAR 的底层机制、Studio (ECS) 开发模式、Engine 基础渲染原理以及高频避坑实践，旨在为开发者提供一份全面、可操作的离线查阅技术手册。

---

## 1. WebAR 基础与追踪模式

8th Wall 是运行于移动端浏览器（Safari, Chrome 等）的高性能 WebAR 引擎，通过计算机视觉算法在轻量级环境中提供高精度的追踪服务。

### 1.1 核心追踪技术 (Tracking Types)

| 追踪模式 | 英文名称 | 适用场景 | 关键机制与限制 |
| :--- | :--- | :--- | :--- |
| **SLAM / 世界追踪** | World Tracking | 放置虚拟物体于地面/空间中 | 依赖环境纹理与光照，建议提供 Hider 材质地面进行阴影接收。 |
| **图像追踪** | Image Targets | 扫描特定卡片、海报触发 AR | 支持**平面 (Flat)**、**圆柱体 (Cylinder)** 和 **圆锥体 (Cone)** 追踪。圆柱追踪（如饮料罐）会自动提取曲面角度。 |
| **人脸追踪** | Face Tracking | 虚拟试戴眼镜、面具、彩妆 | 5点到数十点定位，提供面部网格（Face Mesh）映射。 |
| **天空追踪** | Sky Tracking | 替换背景天空、穹顶特效 | 自动分割天空区域，常用于天象模拟或宏大场景。 |

### 1.2 物理度量与尺度 (Scale & Space)
* **单位系统**：8th Wall 默认采用**米 (meters)** 作为物理世界单位。
* **圆柱体目标配置**：
  * 在配置圆柱图像目标（如王老吉罐子）时，输入单位通常为**毫米 (mm)**（例如：顶部周长 210mm，侧边长度 104mm）。
  * 引擎会自动根据这些物理尺寸估算真实物体的空间比例，并在运行时把 AR 场景自动缩放到真实大小。
* **默认旋转与坐标系**：
  * 遵守右手坐标系（Y轴向上，X轴向右，Z轴指向屏幕外）。
  * 平面图像追踪的中心为 `(0, 0, 0)`，其 Z 轴正方向垂直指向卡片前方。

---

## 2. 8th Wall Studio (ECS 架构)

8th Wall Studio 采用**实体组件系统 (Entity Component System, ECS)** 来组织场景。场景的所有状态和配置默认序列化存储在项目根目录的 [`.expanse.json`](file:///d:/workspace/8thwall%20example/example/studio-image-targets-example-main/src/.expanse.json) 中。

### 2.1 核心组件的 ECS Schema 规范
如果手动修改 `.expanse.json` 或添加属性，必须**严格对应组件注册的 Schema 字段类型与必填项**，否则编辑器属性面板解析时会出现 `toFixed` / `toUpperCase` 等未捕获的运行时崩溃（TypeError）。

#### 2.1.1 几何组件 (Geometry)
不同 `type` 的几何体拥有完全不同且**强校验**的参数集：
* **`plane`（平面）**：
  ```json
  "geometry": { "type": "plane", "width": 1, "height": 0.5625 }
  ```
* **`cylinder`（圆柱体）**：
  * ⚠️ *注意：8th Wall ECS 中的 cylinder 组件只接收以下两个参数，不支持 Three.js 原生的 `radiusTop` / `radialSegments` 等参数*：
  ```json
  "geometry": { "type": "cylinder", "radius": 0.5, "height": 1 }
  ```
* **`box`（立方体）**：
  ```json
  "geometry": { "type": "box", "width": 1, "height": 1, "depth": 1 }
  ```

#### 2.1.2 材质组件 (Material)
材质决定物体的外观与贴图，常用 `type` 包括 `unlit` (无光照限制)、`basic` (标准光照)、`hider` (隐形遮罩，用于遮挡真实物体) 以及 `shadow` (阴影接收)：
```json
"material": {
  "type": "unlit",
  "color": "#FFFFFF",
  "textureSrc": {
    "type": "url",  // 或 "asset" (本地资源引用)
    "url": "https://qphong.cn/statics/waves.mp4"
  }
}
```

#### 2.1.3 视频播放控制 (VideoControls)
用于配合视频材质的播放逻辑。其参数包括：
```json
"videoControls": {
  "paused": true,
  "loop": true,
  "positional": false,
  "volume": 0
}
```

### 2.2 自定义组件开发 (`registerComponent`)
8th Wall 允许通过 TypeScript 编写自定义组件逻辑：

```typescript
import * as ecs from '@8thwall/ecs'

ecs.registerComponent({
  name: 'ToggleVideoOnTarget',
  schema: {
    videoEntity: ecs.eid,         // 实体ID引用
    imageTargetName: ecs.string,  // 图像追踪目标名称
  },
  schemaDefaults: {
    imageTargetName: 'wanglaoji',
  },
  stateMachine: ({ world, eid, schemaAttribute }) => {
    
    const showAndPlay = () => {
      const { videoEntity } = schemaAttribute.get(eid)
      if (!videoEntity) return
      
      // 显示视频实体
      ecs.Hidden.remove(world, videoEntity)
      
      // 开启播放 (修改 VideoControls 状态)
      if (ecs.VideoControls.has(world, videoEntity)) {
        ecs.VideoControls.mutate(world, videoEntity, (c) => { c.paused = false })
      }
    }

    const pauseAndHide = () => {
      const { videoEntity } = schemaAttribute.get(eid)
      if (!videoEntity) return
      
      ecs.Hidden.set(world, videoEntity)
      if (ecs.VideoControls.has(world, videoEntity)) {
        ecs.VideoControls.mutate(world, videoEntity, (c) => { c.paused = true })
      }
    }

    ecs.defineState('default')
      .initial()
      .onEnter(() => {
        pauseAndHide()
      })
      // 监听全局图像寻获/丢失事件
      .listen(world.events.globalId, ecs.events.REALITY_IMAGE_FOUND, (event) => {
        const { name } = event.data as any
        const { imageTargetName } = schemaAttribute.get(eid)
        if (name === imageTargetName) showAndPlay()
      })
      .listen(world.events.globalId, ecs.events.REALITY_IMAGE_LOST, (event) => {
        const { name } = event.data as any
        const { imageTargetName } = schemaAttribute.get(eid)
        if (name === imageTargetName) pauseAndHide()
      })
  }
})
```

---

## 3. 8th Wall Engine 与渲染结合 (Three.js)

ECS 负责逻辑与结构，底层的实际 3D 渲染由绑定的三维渲染引擎（常用 Three.js）执行。

### 3.1 跨界互通：ECS 实体与 Three.js 对象的绑定
在运行时，8th Wall 内部会将实体映射为 Three.js 的 `Object3D`。你可以通过 `world.three` 提供的方法，直接在代码中获取底层的 Three.js 实例进行高阶矩阵变换或加载自定义纹理：

```typescript
// 1. 获取 ECS 实体对应的 Three.js 容器对象
const threeObject = world.three.entityToObject.get(eid); // 返回 THREE.Object3D

// 2. 修改底层材质参数（如 Three.js 自定义 VideoTexture）
const mesh = threeObject.getObjectByName('myMesh') as THREE.Mesh;
if (mesh) {
  mesh.material = new THREE.MeshBasicMaterial({ map: myVideoTexture });
}
```

### 3.2 自定义渲染管线 (Threejs Pipeline Module)
如果不使用 Studio (ECS)，可以直接使用原生 8th Wall Engine 配置网页渲染流程：
```javascript
XR8.addCameraPipelineModules([
  XR8.GlTextureRenderer.pipelineModule(),       // 渲染相机背景
  XR8.Threejs.pipelineModule(),                // 提供 Three.js 运行环境与相机矩阵
  XR8.XrController.pipelineModule(),           // 核心 AR 追踪模块
  myCustomARLogicPipelineModule(),             // 自定义 AR 业务模块
])
```

---

## 4. 常见问题排查与避坑指南 (Troubleshooting)

### 4.1 编辑器崩溃：`TypeError: Cannot read properties of undefined (reading 'toFixed')`
* **根因**：`.expanse.json` 中的组件（如 `geometry`）声明了不支持的非官方参数（例如 Three.js 专用的 `radiusTop`, `radialSegments`），而缺少了 8th Wall 规范内的必填数值参数（如 `radius`）。导致属性面板（Inspector）渲染输入组件时传入了 `undefined`，无法执行数字精度格式化。
* **解决**：严格遵守 `@8thwall/ecs` 的 `d.ts` 类型定义，删除所有不属于该类型的杂余属性，并补全缺少的必填属性。

### 4.2 移动端浏览器视频贴图不播放/黑屏
* **根因 1 (自动播放限制)**：iOS Safari 和 Android Chrome 严格限制带音轨的媒体自动播放。
* **根因 2 (网络跨域/协议限制)**：直接将外部 HTTPS URL 作为 `textureSrc` 传给 ECS 有时会因为 CORS 头缺失或移动端网络解析失败导致加载崩溃。
* **解决**：
  1. 保证视频处于静音状态（设置 `volume: 0`）。若需要声音，必须在页面中监听**用户手动触摸/点击手势 (User Gesture)**，并在事件回调中调用 `play()` 激活音频上下文。
  2. 优先将视频作为本地 Asset 放入工程目录（如 `assets/magic-photos/video.mp4`），并把材质配置为 `"type": "asset"`，由引擎自动生成离线 Blob 或正确处理本地缓存分发。

### 4.3 虚实贴合度差与画面剧烈抖动 (Jittering)
* **根因 1 (模型尺寸缩放过大)**：当模型的实际物理尺寸与在软件中设置的追踪目标大小差距悬殊时（例如：模型本身只有厘米级，但在组件属性中放大了十倍来匹配真实物体），会极大放大摄像机追踪带来的细微噪声，从而呈现明显的画面晃动。
* **根因 2 (圆柱体/平面追踪冲突)**：将复杂的 3D 软件导出的 GLB 模型直接硬盖在圆柱体目标上，因为模型顶点和真实目标不能 100% 重合，稍微转动就会穿帮。
* **解决**：
  1. 尽量使用 8th Wall 提供的原生几何体（如 `geometry: { type: "cylinder" }`）包裹视频，原生几何体会完美绑定到物理追踪曲面上，抗抖动效果最好。
  2. 保持 scale 大小接近 `[1, 1, 1]`，如有微调，应将三维软件中导出的 GLB 实体的实际物理长宽高度，做到与真实物体 `1:1` 精确一致，减少在引擎中因极端的 scale 放大导致的误差。
