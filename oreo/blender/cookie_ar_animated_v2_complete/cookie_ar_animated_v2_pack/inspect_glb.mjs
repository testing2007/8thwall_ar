import fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

import {NodeIO} from '@gltf-transform/core'
import {KHRMaterialsUnlit} from '@gltf-transform/extensions'


const ROOT = path.dirname(fileURLToPath(import.meta.url))
const FILE = path.join(ROOT, 'cookie_ar_animated_v2.glb')
const io = new NodeIO().registerExtensions([KHRMaterialsUnlit])
const document = await io.read(FILE)
const root = document.getRoot()

function duration(animation) {
  return Math.max(...animation.listSamplers().flatMap((sampler) => {
    const array = sampler.getInput()?.getArray()
    return array ? Array.from(array) : [0]
  }))
}

function tree(node, depth = 0) {
  const lines = [`${'  '.repeat(depth)}${node.getName()}`]
  for (const child of node.listChildren()) lines.push(...tree(child, depth + 1))
  return lines
}

let triangles = 0
for (const mesh of root.listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    const indices = prim.getIndices()
    triangles += indices ? indices.getCount() / 3 : prim.getAttribute('POSITION').getCount() / 3
  }
}

const animations = root.listAnimations().map((animation) => {
  const targets = new Set()
  const duplicates = []
  for (const channel of animation.listChannels()) {
    const key = `${channel.getTargetNode()?.getName()}|${channel.getTargetPath()}`
    if (targets.has(key)) duplicates.push(key)
    targets.add(key)
  }
  return {
    name: animation.getName(),
    durationSeconds: Number(duration(animation).toFixed(3)),
    channels: animation.listChannels().length,
    samplers: animation.listSamplers().length,
    duplicateTargets: duplicates,
  }
})

const stat = await fs.stat(FILE)
const report = {
  file: path.basename(FILE),
  sizeBytes: stat.size,
  sceneCount: root.listScenes().length,
  nodeCount: root.listNodes().length,
  meshCount: root.listMeshes().length,
  materialCount: root.listMaterials().length,
  textureCount: root.listTextures().length,
  triangleCount: Math.round(triangles),
  animations,
  hierarchy: root.listScenes().flatMap((scene) => scene.listChildren().flatMap((child) => tree(child))),
}

await fs.writeFile(path.join(ROOT, 'structure_report.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
