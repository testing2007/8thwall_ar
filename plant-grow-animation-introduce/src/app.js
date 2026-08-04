const triggerLabelTarget = require('../image-targets/trigger-label.json')

const configureImageTarget = () => {
  XR8.XrController.configure({
    imageTargetData: [triggerLabelTarget],
  })

  if (window.LandingPage) {
    XR8.addCameraPipelineModule(LandingPage.pipelineModule())
  }
}

const onxrloaded = () => {
  if (XR8.XrController) {
    configureImageTarget()
    return
  }

  if (XR8.loadChunk) {
    XR8.loadChunk('slam').then(configureImageTarget).catch((error) => {
      console.warn('[ARExperience] Failed to load slam chunk:', error)
    })
    return
  }

  console.warn('[ARExperience] XR8.XrController is not ready; check xr.js data-preload-chunks="slam".')
}

window.XR8 ? onxrloaded() : window.addEventListener('xrloaded', onxrloaded)
