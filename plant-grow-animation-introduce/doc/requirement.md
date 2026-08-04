你是一名资深 WebAR、Three.js、8th Wall、Blender 动画和移动端图形开发工程师。

请在现有 8th Wall 项目中，实现一套参考“Bombay Sapphire AR 包装体验”的酒瓶植物生长交互。参考它的交互逻辑和视觉节奏，不直接复制品牌 Logo、视频、贴图或其他受版权保护素材。

## 一、技术环境

默认技术栈：

- 8th Wall Image Target：识别酒瓶正面酒标。
- Three.js：渲染 GLB 植物、粒子、视频平面和交互对象。
- GLTFLoader + AnimationMixer：加载并播放 Blender 导出的动画。
- Raycaster / Pointer Events：处理视频卡片、关闭按钮、植物背景点击。
- GSAP：组织 UI、透明度、位移和补间动画。
- HTMLVideoElement + THREE.VideoTexture：播放视频。
- JavaScript 或 TypeScript，代码模块化。
- 移动端优先，兼容 iOS Safari 和 Android Chrome。

如果项目当前使用 A-Frame/8Frame，应封装为组件，但底层动画仍使用 Three.js AnimationMixer。

## 二、最终体验目标

参见效果：https://vimeo.com/241917484?utm_source=chatgpt.com 里面的视频

用户扫描酒标后，以酒标中心为植物生长起点：

1. 酒标出现蓝色能量光晕。
2. 主藤蔓从酒标向上生长。
3. 分枝沿酒瓶两侧扩散。
4. 叶片按照藤蔓生长进度依次展开。
5. 花苞出现并绽放。
6. 产生微光、花粉、露珠和漂浮粒子。
7. 植物完成生长后进入轻微呼吸摆动状态。
8. 视频入口依次出现(我准备的视频资源在 src/assets/video )，显示在酒瓶上。
9. 用户选择视频，曲线运动动画形式从酒瓶上手机屏幕中间，视频上下部分透明。
10. 视频在手机屏幕中间播放，右上角有一个关闭按钮，关闭视频，视频回到酒瓶上，多个视频列表显示。
11. 用户点击植物背景，附着在酒瓶上的植物，视频列表等全部消失。
12. 花朵、叶片和藤蔓按照从上到下的顺序向下收缩、消失。
13. 场景回到可重新触发或重新选择视频的状态。

整个过程不能表现成简单的模型淡入，而要产生“真正从酒标中长出来”的感觉。

## 三、状态机设计

实现显式状态机，不要使用大量互相独立的 `setTimeout`。

```ts
enum ARExperienceState {
  SCANNING,
  TARGET_FOUND,
  INTRO_ENERGY,
  PLANT_GROWING,
  PLANT_IDLE,
  VIDEO_MENU_ENTERING,
  VIDEO_MENU_IDLE,
  VIDEO_OPENING,
  VIDEO_PLAYING,
  VIDEO_CLOSING,
  PLANT_DISAPPEARING,
  RESETTING,
}
```

所有交互必须先检查当前状态，防止重复点击、动画重入和状态冲突。

建议实现：

```ts
transitionTo(nextState: ARExperienceState, payload?: unknown): Promise<void>
```

每次状态切换必须支持：

- 清理旧状态监听器。
- 停止或淡出旧动画。
- 取消未完成的 GSAP Timeline。
- 防止多次创建 VideoTexture。
- 正确暂停、释放视频资源。
- Target Lost 后暂停动画。
- Target Found 后从合理位置恢复。

## 四、场景节点结构

```text
ARAnchor
├── BottleOccluder
├── EnergyEffectRoot
├── PlantRoot
│   ├── MainStem
│   ├── Branches
│   ├── Leaves
│   ├── Flowers
│   ├── Berries
│   └── PlantParticles
├── VideoMenuRoot
│   ├── VideoCard01
│   ├── VideoCard02
│   └── VideoCard03
├── VideoPlayerRoot
│   ├── VideoFrame
│   ├── VideoSurface
│   ├── CloseButton
│   └── LoadingIndicator
└── AmbientParticles
```

所有对象挂载在同一个 Image Target Anchor 下，避免跟踪坐标不一致。

植物整体根节点必须命名为：

```text
Plant_Growth_Root
```

## 五、植物 GLB 动画规范

Blender 模型应提供以下动画 Clip：

```text
plant_grow
plant_idle
plant_disappear_down
plant_reset
flower_idle
```

如果 GLB 当前只有一条完整生长动画，需要在代码中通过时间区间控制，但优先在 Blender 中拆成独立 Action。

### plant_grow

生长顺序：

1. 主藤蔓。
2. 一级分枝。
3. 二级分枝。
4. 叶片展开。
5. 花苞放大。
6. 花瓣绽放。
7. 果实出现。
8. 微粒和高光出现。

藤蔓不能使用整个对象从零缩放到一，否则会产生“模型突然拉长”的效果。

可选实现：

- Blender 中使用骨骼逐节缩放。
- 使用多段独立藤蔓网格逐段播放。
- 使用 Curve Bevel Factor 制作生长，再烘焙为 Shape Keys 或骨骼动画。
- 使用沿路径移动的遮罩模型。
- 如果需要导出 GLB，避免只依赖无法导出的 Geometry Nodes 或 Curve Mapping。

### plant_idle

完成生长后循环播放：

- 主藤蔓轻微左右摆动：幅度约 1°～2°。
- 叶片不同步摆动：幅度约 2°～5°。
- 花朵轻微呼吸：缩放范围 0.98～1.02。
- 粒子缓慢漂浮。
- 所有循环必须加入不同相位，避免机械同步。

### plant_disappear_down

用户点击植物背景后播放，不允许直接执行：

```js
plantRoot.visible = false;
```

消失顺序必须由顶部向底部传播：

1. 顶部花朵向内合拢。
2. 顶部叶片缩小并降低透明度。
3. 顶部枝条反向收缩。
4. 消失波向下传播。
5. 主藤蔓从顶部向酒标方向回缩。
6. 最后一个光点落回酒标中心。
7. 酒标能量光晕收缩并熄灭。

建议总时长为 1.8～2.6 秒。

每个植物部件设置归一化高度：

```ts
normalizedHeight = (worldY - plantMinY) / (plantMaxY - plantMinY);
```

顶部对象先消失：

```ts
delay = (1 - normalizedHeight) * disappearWaveDuration;
```

单个叶片消失参数：

```ts
gsap.to(leaf.scale, {
  x: 0.05,
  y: 0.05,
  z: 0.05,
  duration: 0.35,
  delay,
  ease: "power2.in",
});
```

同时让叶片沿局部方向向下移动，而不是只缩放：

```ts
gsap.to(leaf.position, {
  y: leaf.position.y - 0.08,
  duration: 0.4,
  delay,
  ease: "power2.in",
});
```

材质透明度需要独立实例，避免多个叶片共享材质时一起消失。

## 六、扫描成功动画时间轴

建议时间线：

```text
0.00s  酒标识别稳定
0.00s  锁定 AR Anchor
0.10s  酒标中心出现蓝色光晕
0.30s  圆形能量波向外扩散
0.45s  主藤蔓开始生长
1.10s  左侧一级分枝生长
1.40s  右侧一级分枝生长
1.70s  第一批叶片展开
2.20s  第二批分枝和叶片出现
2.80s  第一朵花绽放
3.20s  第二、第三朵花绽放
3.60s  果实、花粉和露珠出现
4.20s  植物进入 idle
4.50s  视频选择卡片出现
```

时间轴由一个统一控制器管理：

```ts
class ExperienceTimelineController {
  playIntro(): Promise<void>;
  showVideoMenu(): Promise<void>;
  openVideo(videoId: string): Promise<void>;
  closeVideo(): Promise<void>;
  disappearPlant(): Promise<void>;
  reset(): Promise<void>;
}
```

## 七、视频选择界面

植物完全生长后，显示三个视频入口。

视频卡片可以排列在植物中间或酒瓶两侧，但不能遮挡主要花朵。

每个视频卡片包含：

- 视频缩略图。
- 标题。
- 时长。
- 播放图标。
- 透明玻璃或蓝宝石边框。
- 独立 Raycaster 点击区域。

卡片入场动画：

1. 从植物中心向外展开。
2. 缩放从 0.4 到 1。
3. 透明度从 0 到 1。
4. 三个卡片相差 80～120ms。
5. 入场结束后轻微上下漂浮。

点击卡片后：

1. 禁止其他卡片响应。
2. 被选中的卡片向屏幕中心移动。
3. 其他卡片缩小并淡出。
4. 被选中卡片的边框产生蓝色能量扩散。
5. 预加载视频。
6. 加载完成后卡片转换为视频播放平面。
7. 视频开始播放。

不要在扫描完成时加载所有高清视频，只预加载缩略图。选中后再加载对应视频。

视频配置采用数据驱动：

```ts
interface VideoItem {
  id: string;
  title: string;
  thumbnailUrl: string;
  videoUrl: string;
  posterUrl?: string;
  duration?: number;
}

const videos: VideoItem[] = [
  {
    id: "video-01",
    title: "视频一",
    thumbnailUrl: "/assets/video/video-01-thumb.webp",
    videoUrl: "/assets/video/video-01.mp4",
  },
];
```

## 八、视频播放

优先采用：

```ts
const video = document.createElement("video");

video.playsInline = true;
video.muted = false;
video.crossOrigin = "anonymous";
video.preload = "metadata";
```

用户点击视频卡片属于有效手势，可在该事件回调中调用：

```ts
await video.play();
```

避免 iOS 自动播放限制。

创建视频纹理：

```ts
const texture = new THREE.VideoTexture(video);

texture.colorSpace = THREE.SRGBColorSpace;
texture.minFilter = THREE.LinearFilter;
texture.magFilter = THREE.LinearFilter;
texture.generateMipmaps = false;
```

视频播放平面需要：

- 保持原始视频宽高比。
- 适当朝向相机，但仍锚定酒瓶位置。
- 可使用圆角遮罩材质。
- 显示缓冲加载状态。
- 显示关闭按钮。
- 播放结束后可以返回视频菜单。
- Target Lost 时暂停视频。
- Target Found 时不自动恢复声音，除非用户重新确认。

## 九、点击植物背景退出

用户要求：点击视频外部的背景植物，植物向下消失。

点击优先级：

```text
关闭按钮
> 视频控制区域
> 视频卡片
> 植物可交互区域
> 空白区域
```

使用 Raycaster 检测：

```ts
const hits = raycaster.intersectObjects(interactiveObjects, true);
```

当状态为 `VIDEO_PLAYING` 时：

- 点击视频平面：播放或暂停。
- 点击关闭按钮：关闭视频并返回视频菜单。
- 点击植物对象：关闭视频，然后执行植物向下消失。
- 点击空白区域：不触发植物消失，避免误触。

植物对象需要设置：

```ts
object.userData.interactionType = "plant-background";
```

处理逻辑：

```ts
async function handlePlantBackgroundClick() {
  if (state !== ARExperienceState.VIDEO_PLAYING) return;

  transitionTo(ARExperienceState.VIDEO_CLOSING);
  await videoController.close({
    fadeAudioDuration: 0.25,
    shrinkDuration: 0.4,
  });

  transitionTo(ARExperienceState.PLANT_DISAPPEARING);
  await plantController.disappearFromTopToBottom();

  transitionTo(ARExperienceState.RESETTING);
  await resetExperience();
}
```

## 十、视频关闭动画

视频不能突然消失。

关闭过程：

1. 音量在 250ms 内降低到 0。
2. 视频边框光效向中心收缩。
3. 视频平面缩放到 0.75。
4. 视频透明度降低到 0。
5. 停止视频。
6. 将 `currentTime` 重置为 0。
7. 释放 VideoTexture。
8. 再播放植物向下消失动画。

资源释放：

```ts
video.pause();
video.removeAttribute("src");
video.load();

videoTexture.dispose();
videoMaterial.dispose();
```

## 十一、视觉效果

实现以下效果，但必须控制移动端开销：

### 酒标能量

- 蓝色径向光晕。
- 扩散圆环。
- 向上流动的光点。
- 轻微 Bloom，不要造成整个画面泛白。

### 藤蔓

- 深绿色主体。
- 边缘蓝绿色高光。
- 生长前端附带一个移动光点。
- 生长结束后高光逐渐减弱。

### 叶片

- 展开时包含缩放、旋转和轻微回弹。
- 不同叶片错开 50～150ms。
- 法线方向正确，避免背面全黑。
- 材质使用 MeshStandardMaterial。

### 花朵

- 花苞先放大。
- 外层花瓣先展开。
- 内层花瓣延迟展开。
- 花心最后出现。
- 花朵绽放时释放少量粒子。

### 粒子

- 使用 InstancedMesh 或 Points。
- 总数量控制在 80～150。
- 粒子不使用高分辨率透明贴图。
- 不要每帧创建新对象。

## 十二、跟踪丢失处理

Image Target 丢失时：

```ts
animationMixer.timeScale = 0;
video.pause();
gsap.globalTimeline.pause();
```

重新识别后：

```ts
animationMixer.timeScale = 1;
gsap.globalTimeline.resume();
```

增加短暂丢失容错：

- 丢失少于 300ms：保持当前画面。
- 丢失超过 300ms：逐渐降低植物透明度。
- 重新识别后平滑恢复。
- 不要每次短暂丢失都重新播放完整生长动画。

## 十三、性能限制

面向中端手机：

- GLB 压缩后建议小于 8MB。
- 总三角面建议小于 80,000。
- 单张纹理最大 2048×2048。
- 优先 WebP、KTX2。
- 视频优先 H.264 MP4。
- 同屏 Draw Call 尽量控制在 60 以下。
- 相同叶片使用 InstancedMesh 或复用 Geometry。
- 不在渲染循环中创建 Vector3、Material、Texture。
- 粒子和植物动画在 Target Lost 后停止更新。
- 避免实时阴影，使用烘焙 AO 或简单 Blob Shadow。

## 十四、模块划分

至少拆分为：

```text
src/ar/
├── experience-state-machine.ts
├── image-target-controller.ts
├── plant-controller.ts
├── plant-animation-controller.ts
├── video-menu-controller.ts
├── video-player-controller.ts
├── interaction-controller.ts
├── particle-controller.ts
├── asset-loader.ts
└── resource-disposer.ts
```

核心接口：

```ts
interface PlantController {
  load(): Promise<void>;
  playGrowth(): Promise<void>;
  playIdle(): void;
  disappearFromTopToBottom(): Promise<void>;
  pause(): void;
  resume(): void;
  reset(): void;
  dispose(): void;
}

interface VideoPlayerController {
  open(item: VideoItem): Promise<void>;
  play(): Promise<void>;
  pause(): void;
  close(options?: CloseOptions): Promise<void>;
  dispose(): void;
}
```

## 十五、验收标准

必须满足：

1. 扫描酒标后植物确实沿路径逐段生长。
2. 叶片和花朵不会同时机械出现。
3. 植物完成生长后才显示视频入口。
4. 点击不同视频卡片能播放对应视频。
5. iPhone 上视频可正常播放。
6. 点击视频不会误触植物退出。
7. 点击背景植物后，视频先关闭，植物再从上到下消失。
8. 消失过程不是简单淡出或直接隐藏。
9. Target 短暂丢失不会从头播放。
10. 多次进入、退出、重新扫描不会产生重复模型、重复声音或内存泄漏。
11. 动画运行期间不出现明显掉帧。
12. 所有关键时长、颜色、缩放比例和资源路径集中配置，不散落在业务代码中。

请先读取并分析现有项目目录、8th Wall 初始化代码、GLB 文件结构和现有事件系统，再实施修改。

不要擅自替换现有 Image Target、跟踪系统或项目构建方式。

实施完成后输出：

1. 修改过的文件列表。
2. 状态机说明。
3. 动画时间轴。
4. Blender/GLB 需要满足的动画命名。
5. 本地测试方法。
6. 真机测试方法。
7. 已知限制。
