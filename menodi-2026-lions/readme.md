![image-20260815165316665](C:\Users\weizh\AppData\Roaming\Typora\typora-user-images\image-20260815165316665.png)



头部尺寸宽40mm * 高37mm



对，这样定位就非常清楚了：做一个统一的“MENODI Animal Storybook” AR 项目，每支动物笔对应一个独立故事包。识别不同笔头后，动态加载对应的 GLB、英文 MP3 和 SRT 字幕，不需要为每款笔复制一套代码。

## 整体体验

用户扫描任意动物笔：

1. 识别动物形象；
2. 动态加载对应角色 GLB；
3. 动物从实物笔头上“苏醒”；
4. 播放约 15～25 秒英文故事；
5. 3D 英文字幕跟随故事逐句出现；
6. 故事结束，出现一句角色格言；
7. MENODI 标记以“故事集印章”的形式短暂出现。

不出现公司介绍、联系方式或产品目录。

## 四个角色可以组成一个故事宇宙

暂时根据图片把四款称为：熊猫、蓝色小狗、狮子、浣熊。正式名称以后可以再调整。

| 角色      | 故事主题                               | 核心性格       | 结尾格言                        |
| --------- | -------------------------------------- | -------------- | ------------------------------- |
| 熊猫 Poko | 找不到灵感时，竹叶变成了文字           | 安静、善于观察 | `Small ideas can grow.`         |
| 小狗 Bobo | 把写错的字变成云朵，学会不怕犯错       | 乐观、好奇     | `Mistakes can become magic.`    |
| 狮子 Meno | 不会吼叫，于是用笔找到自己的声音       | 害羞、勇敢     | `Your words are your voice.`    |
| 浣熊 Riko | 夜晚收集被人遗忘的词语，把它们变成星星 | 聪明、神秘     | `No story should be forgotten.` |

四个故事可以发生在同一个世界：

> 每当有人拿起一支笔写下第一句话，动物故事森林里就会亮起一颗星。

这样未来增加兔子、狐狸、小熊等新款时，只需要继续增加故事章节。

## 狮子故事示例

英文旁白可以控制在20秒左右：

> Meno was a little lion who couldn’t roar.
> One night, he found a tiny pencil of light.
> He wrote down everything he wanted to say.
> With every word, his golden mane grew brighter.
> Meno finally discovered his own voice.

对应结尾3D文字：

> YOUR WORDS ARE YOUR VOICE.

画面表现：

- 第一段：狮子眨眼，尝试吼叫；
- 第二段：一个光点落到真实笔杆；
- 第三段：金色墨水沿笔杆流动；
- 第四段：空中写出发光单词；
- 第五段：文字化成星星，点亮鬃毛；
- 结尾：MENODI 印章轻轻盖下。

## 推荐的资源结构

每个动物都作为一个独立故事包：

```text
assets/
├── common/
│   ├── fonts/
│   │   └── story-font.woff2
│   ├── sounds/
│   │   └── page-turn.mp3
│   └── models/
│       └── magic-particles.glb
│
├── lion/
│   ├── lion.glb
│   ├── story-en.mp3
│   ├── story-en.srt
│   └── story.json
│
├── panda/
│   ├── panda.glb
│   ├── story-en.mp3
│   ├── story-en.srt
│   └── story.json
│
├── puppy/
│   ├── puppy.glb
│   ├── story-en.mp3
│   ├── story-en.srt
│   └── story.json
│
└── raccoon/
    ├── raccoon.glb
    ├── story-en.mp3
    ├── story-en.srt
    └── story.json
```

`story.json`负责把识别目标和资源对应起来：

```json
{
  "id": "lion",
  "targetName": "menodi-lion",
  "title": "Meno Finds His Voice",
  "model": "assets/lion/lion.glb",
  "audio": "assets/lion/story-en.mp3",
  "subtitles": "assets/lion/story-en.srt",
  "scale": 1,
  "position": [0, 0.004, 0],
  "rotation": [0, 0, 0],
  "finalMessage": "YOUR WORDS ARE YOUR VOICE",
  "brandMarkTime": 18.5
}
```

## SRT字幕示例

```srt
1
00:00:00,000 --> 00:00:03,100
Meno was a little lion who couldn't roar.

2
00:00:03,100 --> 00:00:06,600
One night, he found a tiny pencil of light.

3
00:00:06,600 --> 00:00:10,800
He wrote down everything he wanted to say.

4
00:00:10,800 --> 00:00:14,800
With every word, his golden mane grew brighter.

5
00:00:14,800 --> 00:00:18,500
Meno finally discovered his own voice.
```

## 3D字幕应该怎么做

字幕不建议直接做进 GLB，因为以后修改英文、增加俄语或西班牙语时，需要重新导出模型。

更合适的方式是：

- JavaScript 解析 SRT；
- 使用音频的 `audio.currentTime` 查找当前字幕；
- 把字幕绘制到透明 Canvas；
- Canvas 作为 Three.js `CanvasTexture`；
- 贴到一个始终朝向摄像机的3D字幕板上；
- 字幕板放在动物头部上方或左右两侧；
- 每句字幕使用淡入、轻微上浮、淡出动画。

字幕位置不建议压在真实动物脸上。可以采用“故事书纸条”的视觉形式：

```text
        3D故事字幕
    ┌────────────────┐
    │ Meno found a   │
    │ pencil of light.│
    └────────────────┘

          动物笔头
              │
            笔杆
```

长句应主动拆成两行，每行尽量不超过约26个英文字符。手机上比单行长字幕更容易阅读。

## 音画同步原则

整个时间轴应以 MP3 为主时钟：

```js
const storyTime = audio.currentTime
```

然后同时控制：

- 当前 SRT 字幕；
- GLB 动画片段；
- 粒子出现；
- 最终格言；
- MENODI 印章。

不要分别使用定时器控制音频、字幕和动画，否则手机卡顿或识别丢失后很容易不同步。

## 动态加载策略

最合适的是：

```text
启动应用
  ↓
只加载识别与公共资源
  ↓
识别 lion / panda / puppy / raccoon
  ↓
读取对应 story.json
  ↓
动态加载该动物的 GLB、MP3、SRT
  ↓
缓存资源并开始故事
```

不要把四只动物全部塞进一个大 GLB。一个应用、一个通用故事播放器，但每个角色一个小 GLB，这样后续增加新款时基本只需要添加一个目录和一条配置。

第一阶段最好只完成狮子故事，把动态加载、MP3同步、SRT解析、3D字幕和识别丢失恢复机制全部跑通。之后新增其他动物，主要工作就变成制作角色模型、故事音频和字幕，而不用重复开发程序。