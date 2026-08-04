import fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {Document, NodeIO} from '@gltf-transform/core'
import {KHRMaterialsUnlit} from '@gltf-transform/extensions'


const ROOT = path.dirname(fileURLToPath(import.meta.url))
const ASSETS = path.join(ROOT, 'assets')
const OUTPUT = path.join(ROOT, 'cookie_ar_animated_v2.glb')

const doc = new Document()
const buffer = doc.createBuffer('COOKIE_AR_ANIMATED_BUFFER')
const unlitExtension = doc.createExtension(KHRMaterialsUnlit).setRequired(false)

const registry = new Map()


function accessor(name, type, array) {
  return doc.createAccessor(name).setType(type).setArray(array).setBuffer(buffer)
}


function primitive(name, positions, normals, uvs, indices, material, tangents = null) {
  const created = doc.createPrimitive(name)
    .setAttribute('POSITION', accessor(`${name}_POSITION`, 'VEC3', new Float32Array(positions)))
    .setAttribute('NORMAL', accessor(`${name}_NORMAL`, 'VEC3', new Float32Array(normals)))
    .setAttribute('TEXCOORD_0', accessor(`${name}_UV0`, 'VEC2', new Float32Array(uvs)))
    .setIndices(accessor(`${name}_INDICES`, 'SCALAR', new Uint16Array(indices)))
    .setMaterial(material)
  if (tangents) created.setAttribute('TANGENT', accessor(`${name}_TANGENT`, 'VEC4', new Float32Array(tangents)))
  return created
}


function planeMesh(name, width, height, material, {pivot = 'center', flipUVY = false} = {}) {
  const x0 = pivot === 'left' ? 0 : -width / 2
  const x1 = pivot === 'left' ? width : width / 2
  const y0 = pivot === 'bottom' ? 0 : -height / 2
  const y1 = pivot === 'bottom' ? height : height / 2
  const uv = flipUVY ? [0, 1, 1, 1, 1, 0, 0, 0] : [0, 0, 1, 0, 1, 1, 0, 1]
  return doc.createMesh(name).addPrimitive(primitive(
    `${name}_PRIM`,
    [x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y1, 0],
    [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
    uv,
    [0, 1, 2, 0, 2, 3],
    material,
  ))
}


function boxMesh(name, width, height, depth, material) {
  const x = width / 2
  const y = height / 2
  const z = depth / 2
  const faces = [
    [[-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z], [0, 0, 1]],
    [[x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z], [0, 0, -1]],
    [[x, -y, z], [x, -y, -z], [x, y, -z], [x, y, z], [1, 0, 0]],
    [[-x, -y, -z], [-x, -y, z], [-x, y, z], [-x, y, -z], [-1, 0, 0]],
    [[-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z], [0, 1, 0]],
    [[-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z], [0, -1, 0]],
  ]
  const positions = []
  const normals = []
  const uvs = []
  const indices = []
  faces.forEach((face, faceIndex) => {
    const base = faceIndex * 4
    for (let i = 0; i < 4; i += 1) {
      positions.push(...face[i])
      normals.push(...face[4])
      uvs.push(i === 1 || i === 2 ? 1 : 0, i >= 2 ? 1 : 0)
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
  })
  return doc.createMesh(name).addPrimitive(primitive(
    `${name}_PRIM`, positions, normals, uvs, indices, material,
  ))
}


function ringMesh(name, outerRadius, innerRadius, material, segments = 72) {
  const positions = []
  const normals = []
  const uvs = []
  const indices = []
  for (let i = 0; i <= segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2
    const c = Math.cos(angle)
    const s = Math.sin(angle)
    for (const radius of [innerRadius, outerRadius]) {
      positions.push(c * radius, s * radius, 0)
      normals.push(0, 0, 1)
      uvs.push(0.5 + c * 0.5, 0.5 + s * 0.5)
    }
  }
  for (let i = 0; i < segments; i += 1) {
    const base = i * 2
    indices.push(base, base + 1, base + 3, base, base + 3, base + 2)
  }
  return doc.createMesh(name).addPrimitive(primitive(
    `${name}_PRIM`, positions, normals, uvs, indices, material,
  ))
}


function cylinderSidePrimitive(name, radius, zMin, zMax, material, segments = 64) {
  const positions = []
  const normals = []
  const uvs = []
  const indices = []
  for (let i = 0; i <= segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2
    const c = Math.cos(angle)
    const s = Math.sin(angle)
    positions.push(c * radius, s * radius, zMin, c * radius, s * radius, zMax)
    normals.push(c, s, 0, c, s, 0)
    uvs.push(i / segments, 0, i / segments, 1)
  }
  for (let i = 0; i < segments; i += 1) {
    const base = i * 2
    indices.push(base, base + 1, base + 3, base, base + 3, base + 2)
  }
  return primitive(name, positions, normals, uvs, indices, material)
}


function discPrimitive(name, radius, z, facing, material, segments = 64) {
  const positions = [0, 0, z]
  const normals = [0, 0, facing]
  const uvs = [0.5, 0.5]
  const tangents = [1, 0, 0, facing > 0 ? 1 : -1]
  const indices = []
  for (let i = 0; i <= segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2
    const c = Math.cos(angle)
    const s = Math.sin(angle)
    positions.push(c * radius, s * radius, z)
    normals.push(0, 0, facing)
    uvs.push(0.5 + c * 0.5, 0.5 + s * 0.5)
    tangents.push(1, 0, 0, facing > 0 ? 1 : -1)
  }
  for (let i = 1; i <= segments; i += 1) {
    if (facing > 0) indices.push(0, i, i + 1)
    else indices.push(0, i + 1, i)
  }
  return primitive(name, positions, normals, uvs, indices, material, tangents)
}


function sandwichCookieMesh(name, materials) {
  const radius = 0.018
  const halfDepth = 0.0027
  const creamHalf = 0.00055
  return doc.createMesh(name)
    .addPrimitive(cylinderSidePrimitive(`${name}_TOP_SIDE`, radius, creamHalf, halfDepth, materials.side))
    .addPrimitive(cylinderSidePrimitive(`${name}_CREAM`, radius * 0.94, -creamHalf, creamHalf, materials.cream))
    .addPrimitive(cylinderSidePrimitive(`${name}_BOTTOM_SIDE`, radius, -halfDepth, -creamHalf, materials.side))
    .addPrimitive(discPrimitive(`${name}_TOP_FACE`, radius, halfDepth + 0.00003, 1, materials.face))
    .addPrimitive(discPrimitive(`${name}_BOTTOM_FACE`, radius, -halfDepth - 0.00003, -1, materials.face))
}


async function texture(name, filename) {
  const extension = path.extname(filename).toLowerCase()
  const mime = extension === '.jpg' || extension === '.jpeg' ? 'image/jpeg' : 'image/png'
  return doc.createTexture(name)
    .setImage(await fs.readFile(path.join(ASSETS, filename)))
    .setMimeType(mime)
}


function makeUnlit(material) {
  material.setExtension('KHR_materials_unlit', unlitExtension.createUnlit())
  return material
}


function quatFromEulerXYZ(x, y, z) {
  const cx = Math.cos(x / 2)
  const sx = Math.sin(x / 2)
  const cy = Math.cos(y / 2)
  const sy = Math.sin(y / 2)
  const cz = Math.cos(z / 2)
  const sz = Math.sin(z / 2)
  return [
    sx * cy * cz + cx * sy * sz,
    cx * sy * cz - sx * cy * sz,
    cx * cy * sz + sx * sy * cz,
    cx * cy * cz - sx * sy * sz,
  ]
}


function deg(value) {
  return value * Math.PI / 180
}


function node(name, parent, options = {}) {
  const created = doc.createNode(name)
  if (options.mesh) created.setMesh(options.mesh)
  if (options.translation) created.setTranslation(options.translation)
  if (options.rotation) created.setRotation(options.rotation)
  if (options.scale) created.setScale(options.scale)
  if (options.extras) created.setExtras(options.extras)
  if (parent) parent.addChild(created)
  registry.set(name, created)
  return created
}


function valuesType(pathName) {
  return pathName === 'rotation' ? 'VEC4' : 'VEC3'
}


function flatten(values) {
  return values.flatMap((value) => value)
}


function addTrack(animation, track, suffix = '') {
  const target = registry.get(track.node)
  if (!target) throw new Error(`Unknown animation target: ${track.node}`)
  const samples = []
  track.times.forEach((time, index) => {
    const previous = samples[samples.length - 1]
    if (previous && Math.abs(previous.time - time) < 1e-6) previous.value = track.values[index]
    else samples.push({time, value: track.values[index]})
  })
  const safeName = `${animation.getName()}_${track.node}_${track.path}${suffix}`
  const input = accessor(`${safeName}_TIME`, 'SCALAR', new Float32Array(samples.map((sample) => sample.time)))
  const output = accessor(`${safeName}_VALUE`, valuesType(track.path), new Float32Array(flatten(samples.map((sample) => sample.value))))
  const sampler = doc.createAnimationSampler()
    .setInput(input)
    .setOutput(output)
    .setInterpolation(track.interpolation || 'LINEAR')
  const channel = doc.createAnimationChannel()
    .setTargetNode(target)
    .setTargetPath(track.path)
    .setSampler(sampler)
  animation.addSampler(sampler).addChannel(channel)
}


function createPhase(name, masterStart, masterEnd, tracks) {
  return {name, masterStart, masterEnd, tracks}
}


function createAnimationFromPhase(phase) {
  const animation = doc.createAnimation(phase.name).setExtras({
    masterRange: [phase.masterStart, phase.masterEnd],
    localDuration: phase.masterEnd - phase.masterStart,
  })
  phase.tracks.forEach((track, index) => addTrack(animation, track, `_${index}`))
  return animation
}


function createMasterAnimation(phases) {
  const merged = new Map()
  for (const phase of phases) {
    for (const track of phase.tracks) {
      const key = `${track.node}|${track.path}`
      if (!merged.has(key)) {
        merged.set(key, {
          node: track.node,
          path: track.path,
          interpolation: track.interpolation || 'LINEAR',
          samples: [],
        })
      }
      const target = merged.get(key)
      track.times.forEach((time, index) => {
        target.samples.push({time: time + phase.masterStart, value: track.values[index]})
      })
    }
  }

  const animation = doc.createAnimation('MASTER_FULL_6S').setExtras({
    production: true,
    duration: 6,
    policy: 'play once; pause when image target is lost; resume when found',
  })

  for (const target of merged.values()) {
    target.samples.sort((a, b) => a.time - b.time)
    const deduped = []
    for (const sample of target.samples) {
      const previous = deduped[deduped.length - 1]
      if (previous && Math.abs(previous.time - sample.time) < 1e-6) previous.value = sample.value
      else deduped.push(sample)
    }
    addTrack(animation, {
      node: target.node,
      path: target.path,
      interpolation: target.interpolation,
      times: deduped.map((sample) => sample.time),
      values: deduped.map((sample) => sample.value),
    })
  }
  return animation
}


const cookieAlbedo = await texture('TEX_COOKIE_ALBEDO', 'cookie_albedo_1024.png')
const cookieNormal = await texture('TEX_COOKIE_NORMAL', 'cookie_normal_1024.png')
const glowTexture = await texture('TEX_FRONT_GLOW', 'front_glow_mask_1024x2048.png')
const scanTexture = await texture('TEX_SCAN_STRIP', 'scan_strip_512x128.png')
const sparkleTexture = await texture('TEX_SPARKLE', 'sparkle_128.png')
const titleTexture = await texture('TEX_PANEL_TITLE', 'panel_title_1024x256.png')
const step01Texture = await texture('TEX_PANEL_STEP_01', 'panel_step_01_1024x256.png')
const step02Texture = await texture('TEX_PANEL_STEP_02', 'panel_step_02_1024x256.png')
const step03Texture = await texture('TEX_PANEL_STEP_03', 'panel_step_03_1024x256.png')
const statusTexture = await texture('TEX_PANEL_STATUS', 'panel_status_512x256.png')

const cookieFaceMaterial = doc.createMaterial('MAT_COOKIE_FACE')
  .setBaseColorTexture(cookieAlbedo)
  .setNormalTexture(cookieNormal)
  .setEmissiveTexture(cookieAlbedo)
  .setEmissiveFactor([0.13, 0.13, 0.13])
  .setMetallicFactor(0)
  .setRoughnessFactor(0.84)
const cookieSideMaterial = doc.createMaterial('MAT_COOKIE_SIDE')
  .setBaseColorFactor([0.075, 0.018, 0.009, 1])
  .setEmissiveFactor([0.018, 0.004, 0.002])
  .setMetallicFactor(0)
  .setRoughnessFactor(0.9)
const creamMaterial = doc.createMaterial('MAT_CREAM')
  .setBaseColorFactor([0.93, 0.90, 0.80, 1])
  .setMetallicFactor(0)
  .setRoughnessFactor(0.76)
const cyanMaterial = makeUnlit(doc.createMaterial('MAT_CYAN_EMISSIVE')
  .setBaseColorFactor([0.16, 0.82, 1, 1])
  .setDoubleSided(true))
const cyanSoftMaterial = makeUnlit(doc.createMaterial('MAT_CYAN_SOFT')
  .setBaseColorFactor([0.19, 0.75, 1, 0.72])
  .setAlphaMode('BLEND')
  .setDoubleSided(true))
const glassMaterial = doc.createMaterial('MAT_PANEL_GLASS')
  .setBaseColorFactor([0.05, 0.38, 0.72, 0.13])
  .setMetallicFactor(0)
  .setRoughnessFactor(0.18)
  .setAlphaMode('BLEND')
  .setDoubleSided(true)
const glowMaterial = makeUnlit(doc.createMaterial('MAT_FRONT_GLOW')
  .setBaseColorTexture(glowTexture)
  .setBaseColorFactor([1, 1, 1, 0.42])
  .setAlphaMode('BLEND')
  .setDoubleSided(true))
const scanMaterial = makeUnlit(doc.createMaterial('MAT_SCAN_STRIP')
  .setBaseColorTexture(scanTexture)
  .setAlphaMode('BLEND')
  .setDoubleSided(true))
const sparkleMaterial = makeUnlit(doc.createMaterial('MAT_SPARKLE')
  .setBaseColorTexture(sparkleTexture)
  .setAlphaMode('BLEND')
  .setDoubleSided(true))
const occluderMaterial = doc.createMaterial('MAT_OCCLUDER_GUIDE_DISABLED')
  .setBaseColorFactor([0, 0, 0, 0])
  .setAlphaMode('BLEND')
  .setDoubleSided(true)

function cardMaterial(name, cardTexture) {
  return makeUnlit(doc.createMaterial(name)
    .setBaseColorTexture(cardTexture)
    .setAlphaMode('BLEND')
    .setDoubleSided(true))
}

const titleMaterial = cardMaterial('MAT_PANEL_TITLE', titleTexture)
const step01Material = cardMaterial('MAT_PANEL_STEP_01', step01Texture)
const step02Material = cardMaterial('MAT_PANEL_STEP_02', step02Texture)
const step03Material = cardMaterial('MAT_PANEL_STEP_03', step03Texture)
const statusMaterial = cardMaterial('MAT_PANEL_STATUS', statusTexture)

const cookieMesh = sandwichCookieMesh('MESH_SANDWICH_COOKIE', {
  face: cookieFaceMaterial,
  side: cookieSideMaterial,
  cream: creamMaterial,
})

const scene = doc.createScene('COOKIE_AR_ANIMATED_SCENE')
const arRoot = node('AR_ROOT', null, {
  extras: {
    assetVersion: '2.0.0',
    units: 'meters',
    targetSizeMM: [75, 150, 38],
    origin: 'package front face centre',
    axes: {x: 'right', y: 'up', z: 'toward camera'},
    productionClip: 'MASTER_FULL_6S',
  },
})
scene.addChild(arRoot)

const occlusionGroup = node('00_OCCLUSION_GUIDE', arRoot, {
  scale: [0.001, 0.001, 0.001],
  extras: {
    disabledByDefault: true,
    note: 'Guide only. Enable and configure colorWrite=false/depthWrite=true if occlusion is needed.',
  },
})
node('OCC_PACKAGE_BOX', occlusionGroup, {
  mesh: boxMesh('MESH_OCC_PACKAGE', 0.075, 0.150, 0.038, occluderMaterial),
  translation: [0, 0, -0.019],
})

const frontGroup = node('10_FRONT_FX', arRoot, {extras: {collection: 'Front scan and activation'}})
node('FX_FRONT_GLOW', frontGroup, {
  mesh: planeMesh('MESH_FRONT_GLOW', 0.077, 0.154, glowMaterial),
  translation: [0, 0, 0.0010],
  scale: [0.001, 0.001, 0.001],
})
node('FX_SCAN_SWEEP', frontGroup, {
  mesh: planeMesh('MESH_SCAN_SWEEP', 0.082, 0.020, scanMaterial),
  translation: [0, -0.075, 0.0022],
  scale: [1, 0.001, 1],
})

const frameGroup = node('FX_TRACE_FRAME', frontGroup)
const barHorizontal = boxMesh('MESH_TRACE_HORIZONTAL', 0.078, 0.0013, 0.0007, cyanMaterial)
const barVertical = boxMesh('MESH_TRACE_VERTICAL', 0.0013, 0.153, 0.0007, cyanMaterial)
node('FX_TRACE_TOP', frameGroup, {mesh: barHorizontal, translation: [0, 0.0765, 0.0020], scale: [0.001, 1, 1]})
node('FX_TRACE_RIGHT', frameGroup, {mesh: barVertical, translation: [0.039, 0, 0.0020], scale: [1, 0.001, 1]})
node('FX_TRACE_BOTTOM', frameGroup, {mesh: barHorizontal, translation: [0, -0.0765, 0.0020], scale: [0.001, 1, 1]})
node('FX_TRACE_LEFT', frameGroup, {mesh: barVertical, translation: [-0.039, 0, 0.0020], scale: [1, 0.001, 1]})
node('FX_LOGO_RING', frontGroup, {
  mesh: ringMesh('MESH_LOGO_RING', 0.0275, 0.0260, cyanMaterial),
  translation: [0, 0.036, 0.0026],
  scale: [0.001, 0.001, 0.001],
})

const sparkGroup = node('FX_SPARKS', frontGroup)
const sparkleMesh = planeMesh('MESH_SPARKLE', 0.006, 0.006, sparkleMaterial)
const sparkStarts = [
  [-0.033, -0.057, 0.003], [0.032, -0.022, 0.0032], [-0.028, 0.019, 0.0034],
  [0.029, 0.052, 0.0036], [-0.007, 0.069, 0.0038], [0.009, -0.068, 0.004],
]
sparkStarts.forEach((position, index) => {
  node(`FX_SPARK_${String(index + 1).padStart(2, '0')}`, sparkGroup, {
    mesh: sparkleMesh,
    translation: position,
    scale: [0.001, 0.001, 0.001],
  })
})

const panelGroup = node('20_INFO_PANEL', arRoot, {extras: {collection: 'Deploying 3D information cage'}})
const panelRoot = node('PANEL_DEPLOY_ROOT', panelGroup, {
  translation: [0.0375, 0, -0.006],
  scale: [0.001, 1, 1],
  extras: {pivot: 'left edge of real package', editablePhase: 'A03_PANEL_DEPLOY'},
})

const panelWidth = 0.072
const panelHeight = 0.122
const panelDepth = 0.030
const panelCentreX = panelWidth / 2
node('PANEL_GLASS_FRONT', panelRoot, {
  mesh: planeMesh('MESH_PANEL_GLASS_FRONT', panelWidth, panelHeight, glassMaterial),
  translation: [panelCentreX, 0, 0.006],
})
node('PANEL_GLASS_BACK', panelRoot, {
  mesh: planeMesh('MESH_PANEL_GLASS_BACK', panelWidth, panelHeight, glassMaterial),
  translation: [panelCentreX, 0, 0.006 - panelDepth],
})

const edgeThickness = 0.0012
const horizontalEdge = boxMesh('MESH_PANEL_EDGE_HORIZONTAL', panelWidth, edgeThickness, edgeThickness, cyanMaterial)
const verticalEdge = boxMesh('MESH_PANEL_EDGE_VERTICAL', edgeThickness, panelHeight, edgeThickness, cyanMaterial)
const depthEdge = boxMesh('MESH_PANEL_EDGE_DEPTH', edgeThickness, edgeThickness, panelDepth, cyanMaterial)
for (const z of [0.006, 0.006 - panelDepth]) {
  node(`PANEL_EDGE_TOP_${z > 0 ? 'FRONT' : 'BACK'}`, panelRoot, {mesh: horizontalEdge, translation: [panelCentreX, panelHeight / 2, z]})
  node(`PANEL_EDGE_BOTTOM_${z > 0 ? 'FRONT' : 'BACK'}`, panelRoot, {mesh: horizontalEdge, translation: [panelCentreX, -panelHeight / 2, z]})
  node(`PANEL_EDGE_LEFT_${z > 0 ? 'FRONT' : 'BACK'}`, panelRoot, {mesh: verticalEdge, translation: [0, 0, z]})
  node(`PANEL_EDGE_RIGHT_${z > 0 ? 'FRONT' : 'BACK'}`, panelRoot, {mesh: verticalEdge, translation: [panelWidth, 0, z]})
}
for (const [suffix, x, y] of [
  ['LT', 0, panelHeight / 2], ['RT', panelWidth, panelHeight / 2],
  ['LB', 0, -panelHeight / 2], ['RB', panelWidth, -panelHeight / 2],
]) {
  node(`PANEL_EDGE_DEPTH_${suffix}`, panelRoot, {
    mesh: depthEdge,
    translation: [x, y, 0.006 - panelDepth / 2],
  })
}

const hudRoot = node('PANEL_HUD_ROOT', panelRoot, {
  translation: [panelCentreX, 0, 0.0072],
  extras: {editableContent: true},
})
const cardDefs = [
  ['PANEL_TITLE', 0.064, 0.016, 0.047, titleMaterial],
  ['PANEL_STEP_01', 0.064, 0.016, 0.021, step01Material],
  ['PANEL_STEP_02', 0.064, 0.016, -0.006, step02Material],
  ['PANEL_STEP_03', 0.064, 0.016, -0.033, step03Material],
  ['PANEL_STATUS', 0.036, 0.0135, -0.0525, statusMaterial],
]
for (const [name, width, height, y, material] of cardDefs) {
  node(name, hudRoot, {
    mesh: planeMesh(`MESH_${name}`, width, height, material, {flipUVY: true}),
    translation: [0, y, 0],
    scale: [0.001, 0.001, 0.001],
    extras: {replaceableTexture: true},
  })
}

const cookieGroup = node('30_COOKIE_ANIMATION', arRoot, {extras: {collection: 'Hero drop and stacked cookies'}})
const cookieStackRoot = node('COOKIE_STACK_ROOT', cookieGroup, {translation: [0, 0, 0]})
const cookieInitial = [0, 0.031, 0.012]
const cookieFinals = [
  [-0.004, -0.058, 0.015],
  [-0.009, -0.043, 0.017],
  [-0.012, -0.028, 0.019],
  [-0.010, -0.013, 0.021],
  [-0.005, 0.002, 0.023],
  [0.001, 0.017, 0.025],
  [0.007, 0.032, 0.027],
]
const cookieRotations = [
  [52, 0, -8], [55, 4, 6], [50, -3, -5], [57, 2, 7], [51, -4, -6], [56, 3, 5], [53, -2, -4],
]
for (let index = 0; index < 7; index += 1) {
  node(`COOKIE_${String(index + 1).padStart(2, '0')}${index === 0 ? '_HERO' : ''}`, cookieStackRoot, {
    mesh: cookieMesh,
    translation: index === 0 ? cookieInitial : [0, -0.070, 0.011 + index * 0.0002],
    rotation: index === 0 ? [0, 0, 0, 1] : quatFromEulerXYZ(deg(88), 0, deg(index % 2 ? 9 : -9)),
    scale: [0.001, 0.001, 0.001],
    extras: {sharedMesh: 'MESH_SANDWICH_COOKIE', stackIndex: index + 1},
  })
}

const phases = []

const scanTracks = [
  {
    node: 'FX_SCAN_SWEEP', path: 'translation',
    times: [0, 0.52, 0.62, 1.55, 1.72, 1.85],
    values: [[0, -0.075, 0.0022], [0, -0.075, 0.0022], [0, -0.070, 0.0022], [0, 0.071, 0.0022], [0, 0.075, 0.0022], [0, 0.075, 0.0022]],
  },
  {
    node: 'FX_SCAN_SWEEP', path: 'scale',
    times: [0, 0.52, 0.62, 1.55, 1.70, 1.85],
    values: [[1, 0.001, 1], [1, 0.001, 1], [1, 1, 1], [1, 1, 1], [1, 0.001, 1], [1, 0.001, 1]],
  },
  {node: 'FX_TRACE_LEFT', path: 'scale', times: [0, 0.20, 0.68, 1.85], values: [[1, 0.001, 1], [1, 0.001, 1], [1, 1, 1], [1, 1, 1]]},
  {node: 'FX_TRACE_TOP', path: 'scale', times: [0, 0.48, 0.96, 1.85], values: [[0.001, 1, 1], [0.001, 1, 1], [1, 1, 1], [1, 1, 1]]},
  {node: 'FX_TRACE_RIGHT', path: 'scale', times: [0, 0.73, 1.22, 1.85], values: [[1, 0.001, 1], [1, 0.001, 1], [1, 1, 1], [1, 1, 1]]},
  {node: 'FX_TRACE_BOTTOM', path: 'scale', times: [0, 0.95, 1.43, 1.85], values: [[0.001, 1, 1], [0.001, 1, 1], [1, 1, 1], [1, 1, 1]]},
  {node: 'FX_LOGO_RING', path: 'scale', times: [0, 0.75, 1.02, 1.20, 1.85], values: [[0.001, 0.001, 0.001], [0.001, 0.001, 0.001], [1.18, 1.18, 1.18], [1, 1, 1], [1, 1, 1]]},
]
sparkStarts.forEach((start, index) => {
  const enter = 0.33 + index * 0.16
  scanTracks.push({
    node: `FX_SPARK_${String(index + 1).padStart(2, '0')}`,
    path: 'scale',
    times: [0, enter, enter + 0.12, enter + 0.28, 1.85],
    values: [[0.001, 0.001, 0.001], [0.001, 0.001, 0.001], [1.45, 1.45, 1.45], [0.001, 0.001, 0.001], [0.001, 0.001, 0.001]],
  })
  scanTracks.push({
    node: `FX_SPARK_${String(index + 1).padStart(2, '0')}`,
    path: 'translation',
    times: [0, enter, enter + 0.28, 1.85],
    values: [start, start, [start[0] + (index % 2 ? 0.004 : -0.004), start[1] + 0.010, start[2]], [start[0], start[1] + 0.010, start[2]]],
  })
})
phases.push(createPhase('A01_SCAN_TRACE', 0, 1.85, scanTracks))

phases.push(createPhase('A02_FRONT_ACTIVATE', 1.2, 2.55, [
  {node: 'FX_FRONT_GLOW', path: 'scale', times: [0, 0.10, 0.42, 0.62, 1.35], values: [[0.001, 0.001, 0.001], [0.001, 0.001, 0.001], [1.08, 1.08, 1.08], [1, 1, 1], [1, 1, 1]]},
  {node: 'FX_LOGO_RING', path: 'scale', times: [0, 0.20, 0.48, 0.70, 1.35], values: [[1, 1, 1], [1, 1, 1], [1.16, 1.16, 1.16], [1, 1, 1], [1, 1, 1]]},
  {node: 'COOKIE_01_HERO', path: 'scale', times: [0, 0.76, 1.05, 1.22, 1.35], values: [[0.001, 0.001, 0.001], [0.001, 0.001, 0.001], [1.16, 1.16, 1.16], [0.96, 0.96, 0.96], [1, 1, 1]]},
  {node: 'COOKIE_01_HERO', path: 'rotation', times: [0, 0.76, 1.12, 1.35], values: [[0, 0, 0, 1], [0, 0, 0, 1], quatFromEulerXYZ(0, 0, deg(12)), [0, 0, 0, 1]]},
]))

const panelCardNames = ['PANEL_TITLE', 'PANEL_STEP_01', 'PANEL_STEP_02', 'PANEL_STEP_03', 'PANEL_STATUS']
const panelCardPositions = cardDefs.map(([, , , y]) => [0, y, 0])
const panelTracks = [
  {node: 'PANEL_DEPLOY_ROOT', path: 'scale', times: [0, 0.16, 0.48, 0.76, 1.40], values: [[0.001, 1, 1], [0.03, 1, 1], [0.72, 1, 1], [1.05, 1, 1], [1, 1, 1]]},
  {node: 'PANEL_DEPLOY_ROOT', path: 'translation', times: [0, 0.20, 0.70, 1.40], values: [[0.0375, 0, -0.006], [0.038, 0, -0.004], [0.040, 0, 0], [0.040, 0, 0]]},
]
panelCardNames.forEach((name, index) => {
  const reveal = 0.44 + index * 0.15
  const finalPosition = panelCardPositions[index]
  panelTracks.push({
    node: name,
    path: 'scale',
    times: [0, reveal, reveal + 0.16, reveal + 0.28, 1.40],
    values: [[0.001, 0.001, 0.001], [0.001, 0.001, 0.001], [1.10, 1.10, 1.10], [1, 1, 1], [1, 1, 1]],
  })
  panelTracks.push({
    node: name,
    path: 'translation',
    times: [0, reveal, reveal + 0.28, 1.40],
    values: [[finalPosition[0] - 0.010, finalPosition[1], finalPosition[2]], [finalPosition[0] - 0.010, finalPosition[1], finalPosition[2]], finalPosition, finalPosition],
  })
})
phases.push(createPhase('A03_PANEL_DEPLOY', 2.35, 3.75, panelTracks))

const heroFinalRotation = quatFromEulerXYZ(...cookieRotations[0].map(deg))
phases.push(createPhase('A04_COOKIE_DROP', 3.65, 4.35, [
  {node: 'COOKIE_01_HERO', path: 'scale', times: [0, 0.16, 0.42, 0.70], values: [[1, 1, 1], [1.08, 1.08, 1.08], [1.02, 1.02, 1.02], [1, 1, 1]]},
  {node: 'COOKIE_01_HERO', path: 'translation', times: [0, 0.14, 0.48, 0.62, 0.70], values: [cookieInitial, [0, 0.037, 0.020], [-0.004, -0.064, 0.017], [-0.004, -0.060, 0.015], cookieFinals[0]]},
  {node: 'COOKIE_01_HERO', path: 'rotation', times: [0, 0.16, 0.48, 0.70], values: [[0, 0, 0, 1], quatFromEulerXYZ(deg(18), 0, deg(-3)), quatFromEulerXYZ(deg(78), 0, deg(-11)), heroFinalRotation]},
]))

const stackTracks = []
for (let index = 1; index < 7; index += 1) {
  const nodeName = `COOKIE_${String(index + 1).padStart(2, '0')}`
  const start = (index - 1) * 0.14
  const finalPosition = cookieFinals[index]
  const finalRotation = quatFromEulerXYZ(...cookieRotations[index].map(deg))
  stackTracks.push({
    node: nodeName,
    path: 'scale',
    times: [0, start, start + 0.16, start + 0.38, start + 0.58, 1.30],
    values: [[0.001, 0.001, 0.001], [0.001, 0.001, 0.001], [0.92, 0.92, 0.92], [1.11, 1.11, 1.11], [1, 1, 1], [1, 1, 1]],
  })
  stackTracks.push({
    node: nodeName,
    path: 'translation',
    times: [0, start, start + 0.20, start + 0.42, start + 0.58, 1.30],
    values: [[0, -0.070, 0.011 + index * 0.0002], [0, -0.070, 0.011 + index * 0.0002], [finalPosition[0] * 0.35, finalPosition[1] - 0.020, finalPosition[2] + 0.010], [finalPosition[0], finalPosition[1] + 0.007, finalPosition[2]], finalPosition, finalPosition],
  })
  stackTracks.push({
    node: nodeName,
    path: 'rotation',
    times: [0, start, start + 0.24, start + 0.44, start + 0.58, 1.30],
    values: [quatFromEulerXYZ(deg(88), 0, deg(index % 2 ? 9 : -9)), quatFromEulerXYZ(deg(88), 0, deg(index % 2 ? 9 : -9)), quatFromEulerXYZ(deg(78), 0, deg(index % 2 ? -13 : 13)), quatFromEulerXYZ(deg(cookieRotations[index][0] - 5), deg(cookieRotations[index][1]), deg(cookieRotations[index][2] * 1.25)), finalRotation, finalRotation],
  })
}
phases.push(createPhase('A05_COOKIE_STACK', 4.05, 5.35, stackTracks))

phases.push(createPhase('A06_IDLE_LOOP', 5.35, 6.0, [
  {node: 'COOKIE_STACK_ROOT', path: 'translation', times: [0, 0.325, 0.65], values: [[0, 0, 0], [0, 0.0012, 0.0015], [0, 0, 0]]},
  {node: 'COOKIE_STACK_ROOT', path: 'rotation', times: [0, 0.325, 0.65], values: [quatFromEulerXYZ(0, 0, deg(-0.8)), quatFromEulerXYZ(0, 0, deg(0.8)), quatFromEulerXYZ(0, 0, deg(-0.8))]},
  {node: 'PANEL_HUD_ROOT', path: 'translation', times: [0, 0.325, 0.65], values: [[panelCentreX, 0, 0.0072], [panelCentreX, 0, 0.0080], [panelCentreX, 0, 0.0072]]},
]))

createMasterAnimation(phases)
phases.forEach(createAnimationFromPhase)

const io = new NodeIO().registerExtensions([KHRMaterialsUnlit])
await io.write(OUTPUT, doc)

console.log(`Wrote ${OUTPUT}`)
console.log(`Nodes: ${doc.getRoot().listNodes().length}`)
console.log(`Meshes: ${doc.getRoot().listMeshes().length}`)
console.log(`Animations: ${doc.getRoot().listAnimations().map((animation) => animation.getName()).join(', ')}`)
