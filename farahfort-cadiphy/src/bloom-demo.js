import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'

window.THREE = THREE

const MODEL_URL = require('./assets/cadiphy_bloom_test.glb')
const TARGET_NAME = 'trigger-label'

// ── 选择性 Bloom 节点配置 ──────────────────────────────────────────────────
// 支持配置单个或多个节点名称数组。只有匹配到的节点（及其子节点）会产生 Bloom 光晕。
// 名称需与 Blender 中的 Object 名称完全一致（区分大小写）。
const BLOOM_NODE_NAMES = [
  'GLOW_Energy_Particle_L',
  'GLOW_Energy_Particle_R',
  // '20_PRODUCT_CADIPHY_Glow_Rig', // 如需包含文字，解开此行注释或加入数组
]

// ── AR 显示缩放 ──────────────────────────────────────────────────────────────
// Blender mm 单位导出：glTF 导出器自动 ×0.001，90mm → 0.09m，与 8th Wall 米制一致。
// 50cm 距离看 90mm 模型约占屏幕 10%；×4 后约占 40%，视觉效果较好。
const FIXED_MODEL_SCALE = 4.0

// ── Three.js Layer 分配 ──────────────────────────────────────────────────────
const BLOOM_LAYER = 1   // 只参与 bloomComposer
const BASE_LAYER = 0   // 默认层，所有物体都在这里

const COMMON_CHUNK_INCLUDE = '#include <common>'

// ── 加法混合 Shader：bloomTexture 叠加到正常帧 ───────────────────────────────
const AdditiveBlendShader = {
  uniforms: {
    baseTexture: { value: null },
    bloomTexture: { value: null },
  },
  vertexShader: [
    'varying vec2 vUv;',
    'void main() {',
    '  vUv = uv;',
    '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
    '}',
  ].join('\n'),
  fragmentShader: [
    'uniform sampler2D baseTexture;',
    'uniform sampler2D bloomTexture;',
    'varying vec2 vUv;',
    'void main() {',
    '  gl_FragColor = texture2D(baseTexture, vUv)',
    '               + vec4(texture2D(bloomTexture, vUv).rgb, 0.0);',
    '}',
  ].join('\n'),
}

// ── 轻量后处理合成器（兼容 iOS WebGL / 8th Wall，无 Timer 依赖）──────────────
class BloomComposer {
  constructor(renderer) {
    this.renderer = renderer
    this.passes = []
    this.renderToScreen = true
    this._pixelRatio = renderer.getPixelRatio()
    const size = renderer.getSize(new THREE.Vector2())
    this._width = size.width
    this._height = size.height
    this.renderTarget1 = this._makeRT('BloomComposer.rt1')
    this.renderTarget2 = this.renderTarget1.clone()
    this.renderTarget2.texture.name = 'BloomComposer.rt2'
    this.writeBuffer = this.renderTarget1
    this.readBuffer = this.renderTarget2
  }

  _makeRT(name) {
    const type = THREE.HalfFloatType || THREE.UnsignedByteType
    const rt = new THREE.WebGLRenderTarget(
      this._width * this._pixelRatio,
      this._height * this._pixelRatio,
      { type }
    )
    rt.texture.name = name
    return rt
  }

  _swap() {
    const tmp = this.readBuffer
    this.readBuffer = this.writeBuffer
    this.writeBuffer = tmp
  }

  addPass(pass) {
    this.passes.push(pass)
    pass.setSize(this._width * this._pixelRatio, this._height * this._pixelRatio)
  }

  _isLast(i) {
    for (let j = i + 1; j < this.passes.length; j++) {
      if (this.passes[j].enabled) return false
    }
    return true
  }

  render(dt = 0) {
    const saved = this.renderer.getRenderTarget()
    for (let i = 0; i < this.passes.length; i++) {
      const pass = this.passes[i]
      if (!pass.enabled) continue
      pass.renderToScreen = this.renderToScreen && this._isLast(i)
      pass.render(this.renderer, this.writeBuffer, this.readBuffer, dt, false)
      if (pass.needsSwap) this._swap()
    }
    this.renderer.setRenderTarget(saved)
  }

  setSize(w, h) {
    this._width = w
    this._height = h
    const ew = w * this._pixelRatio
    const eh = h * this._pixelRatio
    this.renderTarget1.setSize(ew, eh)
    this.renderTarget2.setSize(ew, eh)
    this.passes.forEach((p) => p.setSize(ew, eh))
  }

  setPixelRatio(pr) {
    this._pixelRatio = pr
    this.setSize(this._width, this._height)
  }
}

// ── 模块级状态 ───────────────────────────────────────────────────────────────
let bloomComposer   // Pass 1：只渲染指定的 Bloom 节点 → UnrealBloomPass → bloomRT
let finalComposer   // Pass 2：正常渲染全部 → 叠加 bloomRT → 屏幕
let bloomPass
let mixer
let modelRoot
let bloomEnabled = true
const clock = new THREE.Clock()
// bloomCamera 与主相机姿态相同，但 layers 只开 BLOOM_LAYER
const bloomCamera = new THREE.PerspectiveCamera()

// ── UI 开关按钮 ───────────────────────────────────────────────────────────────
const addBloomToggle = () => {
  if (document.getElementById('bloom-toggle')) return
  const btn = document.createElement('button')
  btn.id = 'bloom-toggle'
  const sync = () => {
    btn.textContent = bloomEnabled ? 'Bloom：开' : 'Bloom：关'
    btn.classList.toggle('off', !bloomEnabled)
  }
  btn.onclick = () => {
    bloomEnabled = !bloomEnabled
    if (bloomPass) bloomPass.enabled = bloomEnabled
    sync()
  }
  sync()
  document.body.appendChild(btn)
}

// ── Image Target 位置更新 ────────────────────────────────────────────────────
const applyImageTargetPose = ({ detail }) => {
  if (!modelRoot || detail.name !== TARGET_NAME) return
  const { position, rotation, scale = 1 } = detail
  console.log('[BloomTest] imagefound  scale =', scale, ' pos =', position)
  modelRoot.visible = true
  modelRoot.position.set(position.x, position.y, position.z + 0.002)
  modelRoot.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w)
  modelRoot.scale.setScalar(FIXED_MODEL_SCALE)
}

const hideImageTargetModel = ({ detail }) => {
  if (!modelRoot || detail.name !== TARGET_NAME) return
  modelRoot.visible = false
}

// ── iOS WebGL1 Bloom Shader 兼容修补 ─────────────────────────────────────────
const patchBloomShaderCompatibility = (pass) => {
  const mat = pass.materialHighPassFilter
  if (!mat || mat.fragmentShader.includes(COMMON_CHUNK_INCLUDE)) return
  mat.fragmentShader = COMMON_CHUNK_INCLUDE + '\n' + mat.fragmentShader
  mat.needsUpdate = true
}

// ── 递归把所有子节点设到指定 layer ───────────────────────────────────────────
const setLayerAll = (obj, layer) => obj.traverse((o) => o.layers.set(layer))

// ── GLB 加载完：按节点名分配 Layer ───────────────────────────────────────────
const setupModelLayers = (model) => {
  // Step 1：全部节点先放到 BASE_LAYER（普通渲染层）
  setLayerAll(model, BASE_LAYER)

  const targets = Array.isArray(BLOOM_NODE_NAMES) ? BLOOM_NODE_NAMES : [BLOOM_NODE_NAMES]
  let matchedCount = 0

  // Step 2：找到指定的 Bloom 节点
  targets.forEach((nodeName) => {
    const node = model.getObjectByName(nodeName)
    if (node) {
      matchedCount++
      console.log('[BloomTest] OK 找到 Bloom 节点:', nodeName)
      node.traverse((o) => {
        // 同时加入 BLOOM_LAYER，bloomCamera 就能渲染它
        o.layers.enable(BLOOM_LAYER)
        if (!o.isMesh) return

        const mats = Array.isArray(o.material) ? o.material : [o.material]
        mats.forEach((mat) => {
          if (!mat) return
          // 仅禁用 toneMapping，避免色调映射压缩发光效果；保留 Blender 原生的 emissive 颜色与强度设置
          mat.toneMapped = false
          // mat.emissive.setHex(0xffaa22)
          // mat.emissiveIntensity = Math.max(mat.emissiveIntensity || 1, 6)
          mat.needsUpdate = true
          console.log(`[BloomTest] Bloom Mesh [${o.name}] 使用 Blender 材质 [${mat.name}] | Emissive:`, mat.emissive, '| Intensity:', mat.emissiveIntensity)
        })
      })
    } else {
      console.warn('[BloomTest] WARN 未找到节点:', nodeName)
    }
  })

  if (matchedCount === 0) {
    console.warn('[BloomTest] 未匹配到任何指定 Bloom 节点，请检查 Blender Object 名称。GLB 中的所有节点：')
    model.traverse((o) => console.log('  >', o.type, '|', o.name))
  }
}

// ── 导出：8th Wall Pipeline Module ───────────────────────────────────────────
export const cadiphyBloomPipelineModule = () => ({
  name: 'cadiphy-bloom-demo',

  listeners: [
    { event: 'reality.imagefound', process: applyImageTargetPose },
    { event: 'reality.imageupdated', process: applyImageTargetPose },
    { event: 'reality.imagelost', process: hideImageTargetModel },
  ],

  onStart: () => {
    const { scene, camera, renderer } = XR8.Threejs.xrScene()
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05

    const pr = Math.min(window.devicePixelRatio, 1.5)

    // ── Pass 1：bloomComposer ─────────────────────────────────────────────
    // 用独立 bloomCamera（仅 BLOOM_LAYER）渲染 CADIPHY 文字到离屏 bloomRT
    bloomCamera.copy(camera)
    bloomCamera.layers.set(BLOOM_LAYER)

    const bloomRT = new THREE.WebGLRenderTarget(
      window.innerWidth * pr,
      window.innerHeight * pr,
      { type: THREE.HalfFloatType || THREE.UnsignedByteType }
    )
    bloomRT.texture.name = 'bloom.rt'

    bloomComposer = new BloomComposer(renderer)
    bloomComposer.renderToScreen = false
    bloomComposer.setPixelRatio(pr)
    bloomComposer.addPass(
      new RenderPass(scene, bloomCamera, null, new THREE.Color(0, 0, 0), 0)
    )

    bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.09,   // strength  — 光晕强度
      0.05,   // radius    — 光晕扩散半径
      0.30   // threshold — 亮度阈值（黑色背景上低阈值不会影响其他物体）
    )
    bloomPass.enabled = bloomEnabled
    patchBloomShaderCompatibility(bloomPass)
    bloomComposer.addPass(bloomPass)

    // ── RT 链路说明 ─────────────────────────────────────────────────────────
    // RenderPass 把 CADIPHY 场景渲染到 writeBuffer(=bloomRT)，然后交换：
    //   writeBuffer = rt2_clone,  readBuffer = bloomRT
    // UnrealBloomPass 读 readBuffer(bloomRT)，把光晕写入 writeBuffer(rt2_clone)
    // 所以 Bloom 最终像素在 bloomComposer.renderTarget2.texture，不是 bloomRT！
    bloomComposer.renderTarget1 = bloomRT
    bloomComposer.writeBuffer = bloomRT   // Pass 0 的目标

    // ── Pass 2：finalComposer ─────────────────────────────────────────────
    // 主相机正常渲染全部物体，然后 ShaderPass 把 Bloom 光晕叠加上去
    finalComposer = new BloomComposer(renderer)
    finalComposer.setPixelRatio(pr)
    finalComposer.addPass(
      new RenderPass(scene, camera, null, new THREE.Color(0, 0, 0), 0)
    )

    const blendPass = new ShaderPass(
      new THREE.ShaderMaterial({
        uniforms: {
          baseTexture: { value: null },
          // 正确引用：UnrealBloomPass 把光晕写到 renderTarget2（rt2_clone）
          bloomTexture: { value: bloomComposer.renderTarget2.texture },
        },
        vertexShader: AdditiveBlendShader.vertexShader,
        fragmentShader: AdditiveBlendShader.fragmentShader,
        defines: {},
      }),
      'baseTexture'
    )
    blendPass.needsSwap = true
    finalComposer.addPass(blendPass)

    // ── 加载 Blender 导出的 GLB ──────────────────────────────────────────
    new GLTFLoader().load(MODEL_URL, (gltf) => {
      const model = gltf.scene
      model.name = 'CADIPHY_Bloom_Test'
      model.visible = false
      model.position.set(0, 0, 0.004)
      setupModelLayers(model)
      scene.add(model)
      modelRoot = model
      if (gltf.animations.length) {
        mixer = new THREE.AnimationMixer(model)
        mixer.clipAction(gltf.animations[0]).setLoop(THREE.LoopRepeat).play()
      }
    })

    addBloomToggle()
  },

  onUpdate: () => {
    // 每帧同步 bloomCamera 与主相机（姿态相同，layer 不同）
    const { camera } = XR8.Threejs.xrScene()
    bloomCamera.copy(camera)
    bloomCamera.layers.set(BLOOM_LAYER)
    mixer?.update(clock.getDelta())
  },

  onRender: () => {
    // 顺序固定：先生成光晕纹理，再合成到最终画面
    bloomComposer?.render()
    finalComposer?.render()
  },

  onCanvasSizeChange: ({ canvasWidth, canvasHeight }) => {
    bloomComposer?.setSize(canvasWidth, canvasHeight)
    finalComposer?.setSize(canvasWidth, canvasHeight)
  },
})
