const configureImageTargets = () => {
  if (!window.XR8 || !window.XR8.XrController) {
    console.warn('XR8 XrController is not ready; image target data was not configured.')
    return
  }

  window.XR8.XrController.configure({
    disableWorldTracking: true,
    imageTargetData: [
      require('../image-targets/qiangli-pipa-lu.json'),
    ],
  })
}

const onxrloaded = () => {
  if (window.XR8 && window.XR8.loadChunk) {
    window.XR8.loadChunk('slam').then(configureImageTargets).catch((error) => {
      console.warn('Failed to load XR slam chunk:', error)
    })
    return
  }

  configureImageTargets()
}

window.XR8 ? onxrloaded() : window.addEventListener('xrloaded', onxrloaded, {once: true})
