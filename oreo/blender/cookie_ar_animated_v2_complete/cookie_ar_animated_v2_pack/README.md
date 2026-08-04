# 8th Wall 包装 AR 动画资产 v2

这版改为 **GLB/Blender 动画主导**：包装扫描、正面激活、信息舱展开、说明内容逐项显示、主饼干下沉翻转、多片饼干堆叠，均已写入 GLB 的 Animation Clip。8th Wall 不再逐节点计算位置、旋转和延迟，只负责在识别到 Image Target 后播放 `MASTER_FULL_6S`。

![动画关键帧预览](preview/animated_glb_contact_sheet.jpg)

## 样板尺寸

| 项目 | 数值 |
|---|---:|
| 包装正面 | 75 × 150 mm |
| 包装厚度 | 38 mm |
| GLB 单位 | 米 |
| 原点 | 包装正面中心 |
| 坐标 | X 向右、Y 向上、Z 朝摄像头 |
| 总时长 | 6 秒 / 180 帧 / 30 fps |

正式项目中请把 Image Target 替换为实际包装正面原始设计稿，并按实物尺寸调整模型。当前包装图和文字是无商标演示素材。

## 主要交付文件

| 文件 | 用途 |
|---|---|
| `cookie_ar_animated_v2.glb` | 可直接导入 8th Wall 的动画 GLB |
| `cookie_ar_animated_v2_preview.mp4` | 不依赖 AR 跟踪的模型动画预览 |
| `animation_manifest.json` | 尺寸、坐标、Clip 名称和时段清单 |
| `blender/build_editable_source.bat` | Windows 一键生成可编辑 `.blend` |
| `blender/prepare_editable_source.py` | 导入 GLB、整理集合、添加时间标记并保存 `.blend` |
| `blender/export_8thwall_glb.py` | 将编辑后的 Blender 文件重新导出为 GLB |
| `8thwall/cookie-ar-glb-controller.ts` | 仅负责识别触发、暂停和恢复的最小控制代码 |
| `assets/` | 可独立替换的包装、发光、饼干和信息面板贴图 |

## 模型层级

```text
AR_ROOT
├── 00_OCCLUSION_GUIDE
│   └── OCC_PACKAGE_BOX
├── 10_FRONT_FX
│   ├── FX_FRONT_GLOW
│   ├── FX_SCAN_SWEEP
│   ├── FX_TRACE_FRAME
│   │   ├── FX_TRACE_TOP
│   │   ├── FX_TRACE_RIGHT
│   │   ├── FX_TRACE_BOTTOM
│   │   └── FX_TRACE_LEFT
│   ├── FX_LOGO_RING
│   └── FX_SPARKS
├── 20_INFO_PANEL
│   └── PANEL_DEPLOY_ROOT
│       ├── PANEL_GLASS_FRONT / BACK
│       ├── PANEL_EDGE_*
│       └── PANEL_HUD_ROOT
│           ├── PANEL_TITLE
│           ├── PANEL_STEP_01
│           ├── PANEL_STEP_02
│           ├── PANEL_STEP_03
│           └── PANEL_STATUS
└── 30_COOKIE_ANIMATION
    └── COOKIE_STACK_ROOT
        ├── COOKIE_01_HERO
        └── COOKIE_02 ～ COOKIE_07
```

7 片饼干共用 `MESH_SANDWICH_COOKIE`，因此不会重复存储几何体；每片仍保留自己的 Transform 动画，方便单独调整位置和旋转。

## 动画 Clip

| Clip | 主时间轴 | 内容 | 生产用途 |
|---|---:|---|---|
| `MASTER_FULL_6S` | 0.00～6.00 s | 完整动画，56 条通道 | 8th Wall 播放此 Clip |
| `A01_SCAN_TRACE` | 0.00～1.85 s | 扫描光带、边框描线、火花 | 分段检查/修改 |
| `A02_FRONT_ACTIVATE` | 1.20～2.55 s | 正面发光、主饼干出现 | 分段检查/修改 |
| `A03_PANEL_DEPLOY` | 2.35～3.75 s | 信息舱展开、5 个内容节点依次出现 | 分段检查/修改 |
| `A04_COOKIE_DROP` | 3.65～4.35 s | 主饼干下沉并翻转 | 分段检查/修改 |
| `A05_COOKIE_STACK` | 4.05～5.35 s | 其余 6 片饼干逐片升起堆叠 | 分段检查/修改 |
| `A06_IDLE_LOOP` | 5.35～6.00 s | 最终状态轻微呼吸 | 可单独循环 |

`MASTER_FULL_6S` 是生产源。分段 Clip 用于快速定位和预览；如果直接在 Blender 中修改最终交付动画，应修改名称包含 `MASTER_FULL_6S` 的 Action/NLA 数据，避免只改分段预览而没有同步到生产 Clip。

## 在 Blender 5.1 中维护

### 方式一：双击脚本生成 `.blend`

1. 确认 Blender 安装路径为：

   `C:\Program Files\Blender Foundation\Blender 5.1\blender.exe`

2. 双击 `blender/build_editable_source.bat`。
3. 生成文件：`cookie_ar_animated_v2_editable.blend`。
4. 打开后，在 Outliner 中按 `10_FRONT_FX`、`20_INFO_PANEL`、`30_COOKIE_ANIMATION` 分组修改。

如果 Blender 安装路径不同，只需修改 BAT 文件顶部的 `BLENDER_EXE`。

### 方式二：手工导入

在 Blender 中执行：

`File → Import → glTF 2.0 → cookie_ar_animated_v2.glb`

GLB 已包含全部节点、材质、贴图和动画。进入 `Dope Sheet → Action Editor` 或 `NLA Editor`，按 Clip 名称查找动画。

### 常见修改位置

- 改信息舱整体展开距离：`PANEL_DEPLOY_ROOT`。
- 改某条说明出现时机：`PANEL_STEP_01/02/03` 的 Scale 和 Location 关键帧。
- 替换说明内容：替换对应 `assets/panel_*.png`，或在 Blender 中重新指定该节点材质贴图。
- 改主饼干下沉：`COOKIE_01_HERO`。
- 改最终堆叠造型：`COOKIE_02`～`COOKIE_07` 的 Location/Rotation。
- 改整体堆叠呼吸：`COOKIE_STACK_ROOT`。

### 重新导出

可以在 Blender 的导出界面选择 glTF 2.0 / GLB，并确保：

- Include Animations：开启；
- Animation Mode：Actions；
- Export all actions/clips：开启；
- Apply Modifiers：按需要；
- Y Up：开启；
- 单位保持米。

也可以运行 `blender/export_8thwall_glb.py`。脚本会检测当前 Blender 版本实际支持的导出参数。

## 在 8th Wall Studio 中使用

1. 将 `cookie_ar_animated_v2.glb` 导入 Assets。
2. 创建包装正面的 Image Target Entity。
3. 把 GLB Model Entity 放到 Image Target 下方。
4. GltfModel 设置：

   - `animationClip`: `MASTER_FULL_6S`
   - `loop`: `false`
   - `paused`: `true`
   - `time`: `0`
   - `timeScale`: `1`

5. 加入 `8thwall/cookie-ar-glb-controller.ts`，在 Inspector 中填写：

   - `targetName`: Image Target 的准确名称；
   - `modelEntity`: GLB Model Entity。

控制代码只做三件事：首次识别后播放、丢失目标时暂停、重新识别时从暂停位置继续。包装说明和饼干动画不再由代码维护。

官方接口参考：

- GltfModel Animation Clip：<https://8thwall.org/docs/api/studio/ecs/gltf-model>
- Image Target Found/Lost Events：<https://8thwall.org/docs/api/studio/events/xr/image-targets>

## 资产替换表

| 贴图 | 节点/用途 |
|---|---|
| `image_target_front_1024x2048.jpg` | 识别图和本地预览包装正面 |
| `front_glow_mask_1024x2048.png` | `FX_FRONT_GLOW` |
| `scan_strip_512x128.png` | `FX_SCAN_SWEEP` |
| `cookie_albedo_1024.png` | 饼干正反面颜色 |
| `cookie_normal_1024.png` | 饼干表面法线细节 |
| `panel_title_1024x256.png` | `PANEL_TITLE` |
| `panel_step_01/02/03_1024x256.png` | 三条包装说明 |
| `panel_status_512x256.png` | `PANEL_STATUS` |

## 校验结果

- 1 Scene；
- 50 Nodes；
- 18 Meshes；
- 748 个唯一三角面；
- 15 Materials；
- 10 内嵌贴图；
- 7 Animation Clips；
- GLB 约 3.2 MB；
- Khronos glTF Validator：0 errors、0 warnings。

`00_OCCLUSION_GUIDE` 默认缩放到近乎不可见，只作为尺寸参考。若确实需要真实盒体遮挡，应在 8th Wall 中给它配置 depth-only 材质；当前动画效果本身不依赖遮挡代码。
