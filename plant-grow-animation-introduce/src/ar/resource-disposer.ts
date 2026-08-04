import {
  BufferGeometry,
  Material,
  Object3D,
  Texture,
} from 'three'

export function disposeMaterial(material: Material | Material[] | null | undefined) {
  if (!material) return

  const materials = Array.isArray(material) ? material : [material]
  materials.forEach((item) => {
    Object.values(item as unknown as Record<string, unknown>).forEach((value) => {
      if (value instanceof Texture) {
        ;(value as Texture).dispose()
      }
    })
    item.dispose()
  })
}

export function disposeObjectTree(root: Object3D) {
  root.traverse((object) => {
    const maybeMesh = object as Object3D & {
      geometry?: BufferGeometry
      material?: Material | Material[]
    }

    maybeMesh.geometry?.dispose()
    disposeMaterial(maybeMesh.material)
  })
}

export function resetVideoElement(video: HTMLVideoElement | null | undefined) {
  if (!video) return

  video.pause()
  video.removeAttribute('src')
  video.load()
}
