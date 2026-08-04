import * as THREE from '../node_modules/three/build/three.module.js'
import {GLTFLoader} from '../node_modules/three/examples/jsm/loaders/GLTFLoader.js'


const scene = new THREE.Scene()
scene.background = new THREE.Color(0x071420)

const camera = new THREE.PerspectiveCamera(28, innerWidth / innerHeight, 0.001, 10)
camera.position.set(0.015, 0.004, 0.42)
camera.lookAt(0.030, 0, 0)

const renderer = new THREE.WebGLRenderer({antialias: true, preserveDrawingBuffer: true})
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.setSize(innerWidth, innerHeight)
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.shadowMap.enabled = true
document.body.appendChild(renderer.domElement)

scene.add(new THREE.HemisphereLight(0xbfeeff, 0x1a1c28, 2.1))
const key = new THREE.DirectionalLight(0xffffff, 4.2)
key.position.set(-0.12, 0.20, 0.35)
scene.add(key)
const rim = new THREE.DirectionalLight(0x59dfff, 2.2)
rim.position.set(0.24, 0.04, 0.10)
scene.add(rim)

const textureLoader = new THREE.TextureLoader()
const targetTexture = await textureLoader.loadAsync('../assets/image_target_front_1024x2048.jpg')
targetTexture.colorSpace = THREE.SRGBColorSpace
targetTexture.anisotropy = renderer.capabilities.getMaxAnisotropy()

const front = new THREE.MeshStandardMaterial({map: targetTexture, roughness: 0.58, metalness: 0})
const side = new THREE.MeshStandardMaterial({color: 0x123f94, roughness: 0.62, metalness: 0})
const packageMesh = new THREE.Mesh(
  new THREE.BoxGeometry(0.075, 0.150, 0.038),
  [side, side, side, side, front, side],
)
packageMesh.position.z = -0.019
scene.add(packageMesh)

const loader = new GLTFLoader()
const gltf = await loader.loadAsync('../cookie_ar_animated_v2.glb')
gltf.scene.traverse((object) => {
  if (object.name === '00_OCCLUSION_GUIDE' || object.name.startsWith('OCC_')) object.visible = false
  if (object.isMesh) {
    object.frustumCulled = false
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    for (const material of materials) {
      if (material.transparent) {
        material.depthWrite = !object.name.startsWith('PANEL_')
        material.side = THREE.DoubleSide
      }
    }
  }
})
scene.add(gltf.scene)

const master = THREE.AnimationClip.findByName(gltf.animations, 'MASTER_FULL_6S')
if (!master) throw new Error('MASTER_FULL_6S not found')
const mixer = new THREE.AnimationMixer(gltf.scene)
const action = mixer.clipAction(master)
action.setLoop(THREE.LoopOnce, 1)
action.clampWhenFinished = true
action.play()

function renderAt(seconds) {
  const time = THREE.MathUtils.clamp(Number(seconds), 0, master.duration)
  mixer.setTime(time)
  document.querySelector('#time').textContent = time.toFixed(2)
  renderer.render(scene, camera)
}

window.setAnimationTime = renderAt
window.previewReady = true
renderAt(0)

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight)
  renderer.render(scene, camera)
})
