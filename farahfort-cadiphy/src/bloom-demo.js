import * as THREE from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js'
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js'

window.THREE = THREE

const MODEL_URL = require('./assets/cadiphy_bloom_test.glb')
const TARGET_NAME = 'trigger-label'
const COMMON_CHUNK_INCLUDE = '#include <common>'

class BloomComposer {
  constructor(renderer) {
    this.renderer = renderer
    this.passes = []
    this.renderToScreen = true
    this._pixelRatio = renderer.getPixelRatio()

    const size = renderer.getSize(new THREE.Vector2())
    this._width = size.width
    this._height = size.height

    this.renderTarget1 = this.createRenderTarget('BloomComposer.rt1')
    this.renderTarget2 = this.renderTarget1.clone()
    this.renderTarget2.texture.name = 'BloomComposer.rt2'
    this.writeBuffer = this.renderTarget1
    this.readBuffer = this.renderTarget2
  }

  createRenderTarget(name) {
    const type = THREE.HalfFloatType || THREE.UnsignedByteType
    const target = new THREE.WebGLRenderTarget(
      this._width * this._pixelRatio,
      this._height * this._pixelRatio,
      {type}
    )
    target.texture.name = name
    return target
  }

  swapBuffers() {
    const tmp = this.readBuffer
    this.readBuffer = this.writeBuffer
    this.writeBuffer = tmp
  }

  addPass(pass) {
    this.passes.push(pass)
    pass.setSize(this._width * this._pixelRatio, this._height * this._pixelRatio)
  }

  isLastEnabledPass(index) {
    for (let i = index + 1; i < this.passes.length; i++) {
      if (this.passes[i].enabled) return false
    }
    return true
  }

  render(deltaTime = 0) {
    const currentRenderTarget = this.renderer.getRenderTarget()

    for (let i = 0; i < this.passes.length; i++) {
      const pass = this.passes[i]
      if (pass.enabled === false) continue

      pass.renderToScreen = this.renderToScreen && this.isLastEnabledPass(i)
      pass.render(this.renderer, this.writeBuffer, this.readBuffer, deltaTime, false)

      if (pass.needsSwap) {
        this.swapBuffers()
      }
    }

    this.renderer.setRenderTarget(currentRenderTarget)
  }

  setSize(width, height) {
    this._width = width
    this._height = height

    const effectiveWidth = this._width * this._pixelRatio
    const effectiveHeight = this._height * this._pixelRatio
    this.renderTarget1.setSize(effectiveWidth, effectiveHeight)
    this.renderTarget2.setSize(effectiveWidth, effectiveHeight)

    this.passes.forEach((pass) => pass.setSize(effectiveWidth, effectiveHeight))
  }

  setPixelRatio(pixelRatio) {
    this._pixelRatio = pixelRatio
    this.setSize(this._width, this._height)
  }
}

let composer
let bloomPass
let mixer
let modelRoot
let bloomEnabled = true
const clock = new THREE.Clock()

const addBloomToggle = () => {
  if (document.getElementById('bloom-toggle')) return

  const button = document.createElement('button')
  button.id = 'bloom-toggle'
  const refresh = () => {
    button.textContent = bloomEnabled ? 'Bloom：开' : 'Bloom：关'
    button.classList.toggle('off', !bloomEnabled)
  }
  button.onclick = () => {
    bloomEnabled = !bloomEnabled
    if (bloomPass) {
      bloomPass.enabled = bloomEnabled
    }
    refresh()
  }
  refresh()
  document.body.appendChild(button)
}

const applyImageTargetPose = ({detail}) => {
  if (!modelRoot || detail.name !== TARGET_NAME) return

  const {position, rotation, scale = 1} = detail
  modelRoot.visible = true
  modelRoot.position.set(position.x, position.y, position.z)
  modelRoot.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w)
  modelRoot.scale.setScalar(scale)
}

const hideImageTargetModel = ({detail}) => {
  if (!modelRoot || detail.name !== TARGET_NAME) return
  modelRoot.visible = false
}

const patchBloomShaderCompatibility = (pass) => {
  const material = pass.materialHighPassFilter
  if (!material || material.fragmentShader.includes(COMMON_CHUNK_INCLUDE)) return

  // Some mobile/WebGL1 paths do not inject luminance() for ShaderMaterial.
  material.fragmentShader = `${COMMON_CHUNK_INCLUDE}\n${material.fragmentShader}`
  material.needsUpdate = true
}

export const cadiphyBloomPipelineModule = () => ({
  name: 'cadiphy-bloom-demo',

  listeners: [
    {event: 'reality.imagefound', process: applyImageTargetPose},
    {event: 'reality.imageupdated', process: applyImageTargetPose},
    {event: 'reality.imagelost', process: hideImageTargetModel},
  ],

  onStart: () => {
    const {scene, camera, renderer} = XR8.Threejs.xrScene()

    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05

    composer = new BloomComposer(renderer)
    composer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    composer.addPass(new RenderPass(scene, camera, null, new THREE.Color(0, 0, 0), 0))

    bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      1.35,
      0.42,
      0.72
    )
    bloomPass.enabled = bloomEnabled
    patchBloomShaderCompatibility(bloomPass)
    composer.addPass(bloomPass)

    new GLTFLoader().load(MODEL_URL, (gltf) => {
      const model = gltf.scene
      model.name = 'CADIPHY_Bloom_Test'
      model.visible = false
      model.position.set(0, 0, 0.004)

      model.traverse((object) => {
        if (!object.isMesh) return
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        materials.forEach((material) => {
          if (!material?.name?.startsWith('GLOW_')) return
          material.toneMapped = false
          material.emissiveIntensity = Math.max(material.emissiveIntensity || 1, 5)
        })
      })

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
    mixer?.update(clock.getDelta())
  },

  onRender: () => {
    composer?.render()
  },

  onCanvasSizeChange: ({canvasWidth, canvasHeight}) => {
    composer?.setSize(canvasWidth, canvasHeight)
  },
})
