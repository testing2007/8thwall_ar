import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

window.THREE = THREE

const MODEL_URL = require('./assets/farahfort-cadiphy.glb')
const TARGET_NAME = 'trigger-label'

// 模型在 Blender 导出后的原始 X 轴宽度 (约 87.98 单位)
const MODEL_RAW_WIDTH = 87.98

let modelRoot = null
let mixer = null
let actions = []
const clock = new THREE.Clock()

// ── 重置并播放全部动画 Clip ──────────────────────────────────────────────────
const playAnimationFromStart = () => {
  if (!mixer || !actions.length) return
  mixer.setTime(0)
  actions.forEach((action) => {
    action.reset()
    action.play()
  })
}

// ── Image Target 识别与位置姿态同步 ─────────────────────────────────────────
const applyImageTargetPose = ({ detail }) => {
  if (!modelRoot || detail.name !== TARGET_NAME) return
  const { position, rotation, scale = 0.11 } = detail
  const wasVisible = modelRoot.visible

  modelRoot.visible = true

  // 自动根据识别图物理宽度换算 1:1 物理缩放比例
  const finalScale = (scale > 0 ? scale : 0.11) / MODEL_RAW_WIDTH

  modelRoot.position.set(position.x, position.y, position.z + 0.002)
  modelRoot.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w)
  modelRoot.scale.setScalar(finalScale)

  // 当识别到酒标时，从头播放动画
  if (!wasVisible) {
    playAnimationFromStart()
  }
}

const hideImageTargetModel = ({ detail }) => {
  if (!modelRoot || detail.name !== TARGET_NAME) return
  modelRoot.visible = false
}

// ── 导出 8th Wall Pipeline Module ───────────────────────────────────────────
export const cadiphyFormalPipelineModule = () => ({
  name: 'cadiphy-formal-animated',

  listeners: [
    { event: 'reality.imagefound', process: applyImageTargetPose },
    { event: 'reality.imageupdated', process: applyImageTargetPose },
    { event: 'reality.imagelost', process: hideImageTargetModel },
  ],

  onStart: () => {
    const { scene } = XR8.Threejs.xrScene()

    // 1. 全方位多角度环境照明，保证所有部件清晰可见
    const ambientLight = new THREE.AmbientLight(0xffffff, 2.2)
    scene.add(ambientLight)

    const dirLightMain = new THREE.DirectionalLight(0xffffff, 2.5)
    dirLightMain.position.set(2, 4, 3)
    scene.add(dirLightMain)

    const dirLightSub = new THREE.DirectionalLight(0xffe0b2, 1.8)
    dirLightSub.position.set(-2, -2, 2)
    scene.add(dirLightSub)

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.5)
    scene.add(hemiLight)

    // 2. 加载模型并解析动画
    new GLTFLoader().load(MODEL_URL, (gltf) => {
      const model = gltf.scene
      model.name = 'farahfort_cadiphy'
      model.visible = false

      model.traverse((o) => {
        if (o.isMesh && o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material]
          mats.forEach((m) => {
            m.side = THREE.DoubleSide
            m.needsUpdate = true
          })
        }
      })

      actions = []
      if (gltf.animations && gltf.animations.length > 0) {
        mixer = new THREE.AnimationMixer(model)
        gltf.animations.forEach((clip) => {
          const action = mixer.clipAction(clip)
          action.setLoop(THREE.LoopRepeat, Infinity)
          action.play()
          actions.push(action)
        })
      }

      scene.add(model)
      modelRoot = model
    })
  },

  onUpdate: () => {
    if (mixer) {
      const delta = clock.getDelta()
      mixer.update(delta)
    }
  },
})

// 兼容导出别名
export const cadiphyBloomPipelineModule = cadiphyFormalPipelineModule
