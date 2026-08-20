你现在需要为一款 **500mm × 700mm 的实体生命树拼图**开发一个 WebAR 效果。

我会提供一张“拼图完成后的正面图”作为视觉与定位参考。请直接基于这张图完成第一版可运行 Demo，不要只提供思路或伪代码。

# 一、项目目标

实体拼图尺寸：

```text
宽：700mm
高：500mm
```

画面是一棵彩色马赛克风格生命树，主体包含：

- 左侧红 / 橙 / 紫色区域
- 中间橙黄暖色区域
- 右侧黄 / 蓝 / 青绿色区域
- 三棵相互连接的树
- 三个由树干围出的圆形暖色区域
- 大量彩色叶片
- 中央及周边存在天然暖光感

注意：

**画面中没有太阳。**

三个圆形区域应理解为：

> 生命能量、暖光、生命核心，而不是太阳。

AR 的核心概念为：

# 「生命树觉醒」

用户扫描完成后的实体拼图后，原本静止的拼图逐渐产生生命感：

```text
生命核心苏醒
↓
能量沿树根、树干、树枝流动
↓
整棵树逐渐被激活
↓
树冠出现少量漂浮生命粒子
↓
最终进入持续呼吸、流动的稳定状态
```

效果应该：

- 高级
- 梦幻
- 柔和
- 有生命感
- 有明显 AR 增强效果
- 不要游戏技能特效感
- 不要爆炸
- 不要夸张闪电
- 不要廉价霓虹灯效果

---

# 二、必须遵守的技术原则

这是实际准备部署到手机 WebAR 的项目，因此必须优先考虑：

- 加载速度
- Android / iPhone 性能
- 微信内置浏览器兼容性
- 文件大小
- 长时间运行稳定性

## 严禁以下实现

### 1. 禁止 PNG 序列帧

不要生成：

```text
frame_001.png
frame_002.png
frame_003.png
...
```

完全放弃序列帧动画。

原因：

文件数量多、总体积大、WebAR 不适合。

---

### 2. 不要使用整屏 MP4 / WebM 覆盖拼图

不要通过一段 700×500 比例的视频去覆盖整个实体拼图。

实体拼图本身应该继续作为主要视觉主体。

AR 只负责“增强”。

---

### 3. V1 不使用 GLB

本版本暂时：

```text
不需要 Blender
不需要 GLB
不需要 3D 树
不需要 3D 角色
```

主要使用：

```text
Three.js
Shader
Curve / Line / TubeGeometry
Particle System
```

实现。

---

### 4. 不出现任何 MENODI 元素

不要出现：

```text
MENODI
Logo
品牌文字
公司介绍
按钮
```

目前只做生命树本身。

---

# 三、整体技术架构

项目结构应该类似：

```text
8th Wall Image Target
        │
        ▼
Three.js Scene
        │
        ├── LifeCoreGroup
        │
        │   ├── CoreLeft
        │   ├── CoreCenter
        │   └── CoreRight
        │
        ├── EnergyTreeGroup
        │
        │   ├── RootEnergy
        │   ├── MainTrunks
        │   └── BranchEnergy
        │
        └── LifeParticleGroup
```

所有 AR 内容绑定到 Image Target。

实体拼图本身就是：

```text
700mm × 500mm
```

所有 AR 元素的位置和比例必须围绕这个真实尺寸建立。

不要通过肉眼随意设置几个 magic number。

应该建立统一的：

```text
图片像素坐标
→
归一化坐标
→
实体世界坐标
```

转换函数。

例如提供类似：

```javascript
imagePointToWorld(x, y);
```

以后只要修改坐标点即可快速调整 AR 特效位置。

---

# 四、坐标系统

请建立统一规则。

假设拼图正面尺寸：

```text
WIDTH = 0.7
HEIGHT = 0.5
```

单位：

```text
米
```

以拼图中心为：

```text
(0, 0)
```

左边：

```text
-WIDTH / 2
```

右边：

```text
+WIDTH / 2
```

顶部：

```text
+HEIGHT / 2
```

底部：

```text
-HEIGHT / 2
```

AR 发光层不要与实体平面完全共面，避免 Z-Fighting。

采用非常小的层级距离，例如：

```text
基础平面：0
暖光：2mm
能量线：3mm
粒子：5mm ～ 30mm
```

具体根据 8th Wall Image Target 的坐标方向做适配。

不要让 AR 主体明显漂浮几十厘米。

整体仍然应该感觉：

> 能量正在从这幅拼图内部生长出来。

---

# 五、V1 时间流程

完整觉醒过程建议：

```text
约 8 秒
```

完成以后进入持续循环状态。

不要 8 秒以后全部重新从头播放。

应该：

```text
第一次识别
→
播放觉醒动画
→
进入 Alive 状态
```

如果 Target 短暂丢失再恢复，不要频繁重新从 0 播放。

可以设置合理状态管理。

---

# 六、阶段一：0 ～ 1.5 秒

## Life Core Awakening

首先不要让整棵树马上发光。

画面的三个圆形暖色区域开始发生非常微妙的变化。

注意：

这三个区域不是三个独立的“灯泡”。

要和原画融合。

### 效果

原画中的：

- 红橙色圆形区域
- 中央橙黄色圆形区域
- 右侧黄色圆形区域

逐渐出现：

```text
柔和径向暖光
+
非常轻微的呼吸变化
+
一点内部流动感
```

---

# 七、暖光 Shader

不要使用图片素材制作光晕。

使用：

```javascript
THREE.ShaderMaterial;
```

程序生成。

基本原理：

```text
UV中心距离
↓
径向渐变
↓
smoothstep
↓
alpha
```

至少加入：

```text
uTime
uOpacity
uIntensity
uColor
uPulse
```

暖光变化不要只是简单：

```javascript
sin(time);
```

造成机械闪烁。

可以组合：

```text
低频 sin
+
不同周期 sin
+
noise / pseudo noise
```

形成轻微的不规则生命呼吸。

例如：

```text
0.9 ～ 1.08
```

之间非常缓慢变化。

不要：

```text
0.5 → 1.5
```

这种夸张放大。

三个暖光核心不要完全同步。

例如：

```text
Core A：phase 0
Core B：phase 0.8
Core C：phase 1.5
```

形成自然生命节律。

---

# 八、暖光视觉要求

光晕颜色直接依据原画区域。

左：

```text
橙红暖色
```

中：

```text
橙黄 / 金色
```

右：

```text
黄色偏金
```

不要使用纯白。

不要盖住实体拼图纹理。

Shader 应该大量使用：

```javascript
AdditiveBlending;
transparent;
depthWrite = false;
```

但必须控制亮度。

目标是：

> 实体马赛克玻璃内部仿佛有光在流动。

而不是：

> 上面盖了一张黄色透明圆。

---

# 九、阶段二：1.5 ～ 4.5 秒

# Energy Flow

这是整个 V1 最重要的视觉效果。

生命能量从：

```text
根部
↓
主树干
↓
粗树枝
↓
主要分支
```

逐渐向上蔓延。

不要覆盖所有细小树枝。

V1 只需要选择：

```text
10 ～ 20 条关键路径
```

就足够产生：

> 整棵树正在被唤醒

的视觉错觉。

---

# 十、树干能量路径

请根据提供的生命树图片手工建立一组坐标。

不要尝试自动图像识别。

V1 直接建立类似：

```javascript
const energyPaths = [
    [
        [x1, y1],
        [x2, y2],
        [x3, y3],
        ...
    ],

    ...
]
```

然后：

```text
图片坐标
↓
imagePointToWorld()
↓
Three.js Curve
```

推荐使用：

```javascript
THREE.CatmullRomCurve3;
```

产生平滑曲线。

---

# 十一、能量线实现

不要简单使用普通：

```javascript
THREE.LineBasicMaterial;
```

因为视觉太廉价。

建议实现：

```text
Curve
+
TubeGeometry
+
ShaderMaterial
```

Tube 非常细。

视觉上接近：

```text
1 ～ 3mm
```

实际效果根据画面调整。

能量线内部存在：

```text
亮点
↓
沿路径向前移动
↓
后方留下微弱余辉
```

可以通过：

```text
UV.x
+
uTime
```

控制亮度在 Tube 表面移动。

类似：

```javascript
flow = smoothstep(...)
```

形成沿路径前进的能量。

---

# 十二、能量路径激活顺序

不能所有树枝同时亮。

建议：

```text
F1 根部
↓
F2 主树干
↓
F3 大枝
↓
F4 左右分叉
↓
F5 高处枝干
```

产生明确：

> 生命从下向上生长

的感觉。

时间可以做 stagger：

```javascript
pathDelay = index * 0.08;
```

但不要机械地一个接一个。

最好按照树结构组织：

```text
root
trunk
branchGroupA
branchGroupB
branchGroupC
```

---

# 十三、能量线颜色

不要统一纯黄色。

根据背景区域微调。

例如：

左区域：

```text
橙红 → 金色
```

中央：

```text
金黄
```

右：

```text
金色 → 淡青
```

但是整体仍然应该保持统一的“生命能量”。

不要变成彩虹跑马灯。

---

# 十四、阶段三：3.5 ～ 7 秒

# Life Particles

当树干能量到达树冠后：

开始出现少量生命粒子。

不要马上出现几百个粒子。

应该：

```text
0
↓
30
↓
80
↓
150 左右
```

渐进增加。

最终建议同时存在：

```text
约 100 ～ 250
```

根据手机性能动态调整。

---

# 十五、粒子不要做成烟花

粒子视觉目标：

```text
花粉
微尘
生命光点
细小叶片光斑
```

运动速度很慢。

轨迹类似：

```text
缓慢向上
+
轻微左右漂移
+
非常弱的前后浮动
```

不要：

```text
高速喷射
爆炸
圆周疯狂旋转
```

---

# 十六、粒子分区

不同粒子应该从树冠附近生成。

不要整个 700×500 区域随机。

建立几个 emission zones：

```text
LeftCanopy
CenterCanopy
RightCanopy
UpperCanopy
```

每个区域拥有：

```text
中心
宽度
高度
颜色范围
```

左侧粒子：

```text
红
橙
粉
少量金
```

中央：

```text
橙
黄
金
```

右侧：

```text
黄
青
蓝
少量白
```

但是降低饱和度。

不要盖住原图。

---

# 十七、粒子实现方式

优先：

```javascript
THREE.Points + BufferGeometry + ShaderMaterial;
```

不要：

```text
一个粒子一个 Mesh
```

避免 draw call。

粒子数据使用：

```text
position
velocity
life
size
phase
color
```

Shader 中控制：

```text
透明度
尺寸
轻微闪烁
```

粒子数最好根据设备进行等级调整：

```javascript
LOW = 80;
MEDIUM = 150;
HIGH = 250;
```

不要一开始就 1000+。

---

# 十八、阶段四：7秒以后

# Alive State

7～8 秒以后动画不要停止。

进入：

```text
ALIVE
```

状态。

这个状态长期维持：

### 三个生命核心

继续：

```text
轻微呼吸
```

### 能量线

绝大部分降低亮度：

```text
100%
↓
20～35%
```

偶尔有一股新的微弱能量沿树干流过。

例如：

```text
每 3～6 秒
随机一条主路径
重新流动一次
```

### 粒子

持续：

```text
缓慢产生
缓慢漂浮
缓慢消失
```

整体效果：

> 树已经醒了，现在它正在呼吸。

---

# 十九、可选空间感

虽然拼图本身是平面，但粒子可以稍微离开平面。

范围：

```text
5mm ～ 30mm
```

这样用户轻微移动手机时：

能看到一点空间视差。

但是：

暖光与树干能量必须基本贴合在画面上。

不要把发光树枝浮到画面前方。

---

# 二十、Bloom

如果当前 8th Wall / Three.js 项目允许稳定使用后处理，可以尝试：

```text
Selective Bloom
```

只让：

```text
LifeCore
EnergyLine
Particles
```

参与 Bloom。

不要让真实 Camera Background Bloom。

Bloom 强度必须低。

如果 Bloom 会明显增加：

```text
兼容性问题
性能问题
微信浏览器问题
```

那么：

**宁可不用 Bloom。**

Shader 本身的：

```text
中心亮 + 外围透明
```

应该已经可以制造发光感。

项目优先级：

```text
稳定 > 文件小 > 流畅 > 特效复杂度
```

---

# 二十一、性能目标

这个 Demo 最终面向手机。

至少考虑：

```text
iPhone
主流 Android
微信 WebView
Chrome
Safari
```

目标：

中端手机：

```text
≥ 30FPS
```

较好手机：

```text
接近 60FPS
```

尽量：

```text
draw calls < 30
```

避免：

```text
大量 Mesh
大量透明层叠
大量高分辨率纹理
实时阴影
复杂 PBR
```

本项目不需要：

```text
灯光
环境贴图
阴影
反射
```

---

# 二十二、资源大小目标

整个 AR 动效额外资源：

优先：

```text
< 1MB
```

最好主要就是 JS。

禁止为了视觉效果引入：

```text
20MB视频
几十MB GLB
几十张 PNG
```

生命树实体拼图本身负责绝大部分高清视觉细节。

AR 只是动态增强。

这是整个技术方向的核心。

---

# 二十三、Image Target 行为

Image Target 为这张完整生命树拼图。

实体尺寸：

```text
700mm × 500mm
```

请保证 AR Root：

```text
与拼图比例完全一致
```

Target Found：

如果第一次识别：

```text
AWAKENING
```

Target Lost：

不要立刻清空状态。

例如：

```text
短暂丢失 < 2～3 秒
```

保留当前状态。

重新识别以后继续。

如果用户长时间离开：

可以重新进入：

```text
IDLE
```

但是不要因为 Tracking 抖动不断：

```text
播放
停止
播放
停止
```

---

# 二十四、状态管理

建议明确建立：

```javascript
STATE_IDLE;
STATE_AWAKENING;
STATE_ALIVE;
```

流程：

```text
IDLE

target found
↓

AWAKENING

8秒
↓

ALIVE
```

避免所有逻辑散落在 render loop。

---

# 二十五、代码组织

请不要把所有内容写在一个巨大文件里。

可以拆成：

```text
src/
    life-tree-ar.js

    effects/
        life-core.js
        energy-tree.js
        life-particles.js

    data/
        energy-paths.js

    utils/
        coordinate.js
```

如果当前项目结构不适合，可以调整，但至少逻辑要清楚。

---

# 二十六、必须把可调参数集中

建立类似：

```javascript
const CONFIG = {
    puzzleWidth: 0.7,
    puzzleHeight: 0.5,

    awakeningDuration: 8,

    core: {
        intensity: ...,
        pulseSpeed: ...,
        opacity: ...
    },

    energy: {
        width: ...,
        speed: ...,
        intensity: ...
    },

    particles: {
        count: ...,
        size: ...,
        speed: ...
    }
}
```

不要让我为了：

```text
粒子大一点
光弱一点
能量走快一点
```

到代码十几个地方修改。

---

# 二十七、必须提供调试模式

非常重要。

开发阶段增加：

```javascript
DEBUG = true;
```

打开以后可以显示：

### 1. 拼图边界

```text
700 × 500
```

### 2. 三个 Life Core 中心

### 3. 所有 Energy Path 控制点

### 4. Curve 曲线

### 5. Particle emission zone

这样我真机看到位置偏差以后，可以很快修改坐标。

DEBUG = false：

所有辅助元素消失。

---

# 二十八、树干路径不要追求第一次就百分百准确

根据提供的拼图图片：

先人工定义：

```text
约 10～20 条主路径
```

覆盖：

- 根部
- 左侧主干
- 中央主干
- 右侧主干
- 几条明显的大树枝

第一目标不是：

```text
覆盖所有树枝
```

而是：

> 手机上第一眼让人感觉能量真的沿着原画中的树在运动。

如果后续需要，我可以继续人工调整 energy-paths.js。

因此坐标必须：

```text
清晰
集中
容易修改
```

---

# 二十九、视觉上必须和原画融合

这是本项目非常重要的验收标准。

错误效果：

```text
真实拼图
+
一层明显的电脑特效
```

正确效果：

```text
真实拼图本身开始发光和呼吸
```

所以：

- 暖光透明度不要太高
- 能量线不要太粗
- 粒子不要太多
- 动画不要太快
- 不要遮挡树干纹理
- 不要遮挡马赛克纹理

用户应该仍然能清晰看到：

```text
实体拼图原本的艺术细节
```

---

# 三十、不要加入这些东西

V1 不要：

```text
文字
标题
Logo
UI按钮
音乐播放器
人物
动物
蝴蝶模型
3D精灵
故事字幕
语音
HTML Overlay
烟雾
闪电
火焰
大面积视频
复杂交互
点击玩法
```

先把：

> 静态生命树 → 活起来

这一件事情做好。

---

# 三十一、最终希望看到的效果

用户拿手机对准已经完成的生命树拼图。

最开始：

它就是实体拼图。

随后：

### 0～1.5 秒

三个暖光核心像心跳一样逐渐苏醒。

### 1.5～4.5 秒

金色生命能量从根部开始，顺着真实树干向上流动。

### 3.5～7 秒

树冠开始出现红、橙、金、青、蓝色生命微粒。

### 7 秒以后

整棵生命树进入稳定生命状态：

```text
核心缓慢呼吸
树干偶尔有能量经过
树冠持续漂浮少量生命粒子
```

用户轻微移动手机：

粒子拥有一点空间纵深。

但主体仍牢牢贴合真实拼图。

最终感觉应该接近：

> “我不是在实体拼图上播放了一段视频，而是这幅画本身真的被唤醒了。”

---

# 三十二、开发输出要求

请直接完成代码，不要只告诉我“可以怎么做”。

最终需要：

1. 完整可运行代码
2. 文件目录
3. 所有新增文件
4. Image Target 生命周期处理
5. Life Core Shader
6. Energy Flow
7. Particle System
8. 状态机
9. DEBUG 定位模式
10. 可统一调节的 CONFIG
11. 清楚标注 energy-paths.js 中哪些坐标可以后续人工微调
12. 必要的注释
13. 不引入无意义第三方库
14. 不使用 PNG 序列帧
15. 不使用整屏视频
16. 不使用 GLB

优先先把 **真正能在手机运行的 V1 Demo** 做出来，而不是继续扩展功能。

如果某项视觉效果和移动端稳定性冲突：

```text
优先保证稳定性。
```

如果 Bloom 与兼容性冲突：

```text
去掉 Bloom。
```

如果复杂 Shader 与性能冲突：

```text
简化 Shader。
```

核心目标始终只有一个：

# 用极小的额外资源，让 700mm × 500mm 的实体生命树拼图在 AR 中真正“活起来”。
