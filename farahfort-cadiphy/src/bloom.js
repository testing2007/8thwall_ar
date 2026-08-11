import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

window.THREE = THREE

const MODEL_URL = require('./assets/farahfort-cadiphy.glb')
const AUDIO_URL = require('./assets/cadiphy_fullmix_10s.mp3')
const TARGET_NAME = 'trigger-label'

// 模型在 Blender 导出后的原始 X 轴宽度 (约 87.98 单位)
const MODEL_RAW_WIDTH = 87.98

let modelRoot = null
let mixer = null
let actions = []
const clock = new THREE.Clock()

// ── 音频播放器 (iOS 必须在按钮 click 手势内解除静音) ─────────────────────────
let audioEl = null
let soundEnabled = false
let targetVisible = false
let soundButton = null

const updateSoundButton = () => {
  if (!soundButton) return
  soundButton.textContent = soundEnabled ? '声音：开' : '声音：关'
  soundButton.setAttribute('aria-pressed', String(soundEnabled))
  soundButton.classList.toggle('is-on', soundEnabled)
  soundButton.style.background = soundEnabled
    ? 'rgba(21, 105, 82, .88)'
    : 'rgba(0, 0, 0, .72)'
  soundButton.style.borderColor = soundEnabled
    ? 'rgba(160, 255, 219, .9)'
    : 'rgba(255, 255, 255, .72)'
}

const initAudio = () => {
  if (audioEl) return
  audioEl = new Audio(AUDIO_URL)
  audioEl.loop = true
  audioEl.volume = 1.0
  audioEl.muted = true
  audioEl.defaultMuted = true
  audioEl.preload = 'auto'
}

const enableSound = () => {
  initAudio()
  soundEnabled = true
  audioEl.muted = false
  audioEl.defaultMuted = false
  audioEl.volume = targetVisible ? 1 : 0
  updateSoundButton()

  // play() 在按钮 click 的同步调用栈内发起，满足 iOS Safari 的手势要求。
  const promise = audioEl.play()
  if (!promise) return

  promise.then(() => {
    audioEl.volume = 1
    if (!targetVisible) {
      audioEl.pause()
      audioEl.currentTime = 0
    }
  }).catch((error) => {
    console.warn('[CADIPHY Audio] Sound unlock failed:', error)
    soundEnabled = false
    audioEl.muted = true
    audioEl.volume = 1
    updateSoundButton()
  })
}

const disableSound = () => {
  soundEnabled = false
  if (audioEl) {
    audioEl.muted = true
    audioEl.defaultMuted = true
    audioEl.volume = 1
  }
  updateSoundButton()
}

const addSoundButton = () => {
  if (document.getElementById('cadiphy-sound-toggle')) return

  soundButton = document.createElement('button')
  soundButton.id = 'cadiphy-sound-toggle'
  soundButton.type = 'button'
  soundButton.setAttribute('aria-label', '开启或关闭声音')
  soundButton.style.cssText = [
    'position:fixed',
    'left:50%',
    'bottom:calc(env(safe-area-inset-bottom, 0px) + 18px)',
    'transform:translateX(-50%)',
    'z-index:10000',
    'min-width:112px',
    'height:44px',
    'padding:0 18px',
    'border:1px solid rgba(255,255,255,.72)',
    'border-radius:8px',
    'background:rgba(0,0,0,.72)',
    'color:#fff',
    'font:600 14px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    'letter-spacing:0',
    'box-shadow:0 4px 14px rgba(0,0,0,.28)',
    'cursor:pointer',
    '-webkit-tap-highlight-color:transparent',
    'touch-action:manipulation',
  ].join(';')

  soundButton.addEventListener('click', () => {
    if (soundEnabled) disableSound()
    else enableSound()
  })

  document.body.appendChild(soundButton)
  updateSoundButton()
}

const playAudio = () => {
  if (!audioEl) return
  audioEl.currentTime = 0
  audioEl.muted = !soundEnabled
  audioEl.defaultMuted = !soundEnabled
  audioEl.volume = 1
  const promise = audioEl.play()
  if (promise) {
    promise.catch((error) => {
      console.warn('[CADIPHY Audio] Playback failed:', error)
    })
  }
}

const pauseAudio = () => {
  if (!audioEl) return
  audioEl.pause()
  audioEl.currentTime = 0
}

// ── 重置并播放全部动画 Clip + 音频 ──────────────────────────────────────────
const playAnimationFromStart = () => {
  if (mixer && actions.length) {
    mixer.setTime(0)
    actions.forEach((action) => {
      action.reset()
      action.play()
    })
  }
  playAudio()
}

// ── Image Target 识别与位置姿态同步 ─────────────────────────────────────────
const applyImageTargetPose = ({ detail }) => {
  if (!modelRoot || detail.name !== TARGET_NAME) return
  const { position, rotation, scale = 0.11 } = detail
  const wasVisible = modelRoot.visible

  modelRoot.visible = true
  targetVisible = true

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
  targetVisible = false
  pauseAudio()
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
    initAudio()
    addSoundButton()

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
