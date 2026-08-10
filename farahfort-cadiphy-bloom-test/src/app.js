import {cadiphyBloomPipelineModule} from './bloom-demo.js'

const IMAGE_TARGET_DATA = require('../image-targets/trigger-label.json')

const getCameraCanvas = () => {
  let canvas = document.getElementById('camerafeed')
  if (!canvas) {
    canvas = document.createElement('canvas')
    canvas.id = 'camerafeed'
    document.body.appendChild(canvas)
  }
  return canvas
}

const optionalPipelineModule = (factory) => (
  factory?.pipelineModule ? [factory.pipelineModule()] : []
)

const onxrloaded = () => {
  XR8.XrController.configure({
    imageTargetData: [IMAGE_TARGET_DATA],
    disableWorldTracking: true,
  })

  XR8.addCameraPipelineModules([
    XR8.GlTextureRenderer.pipelineModule(),
    XR8.Threejs.pipelineModule(),
    XR8.XrController.pipelineModule(),
    ...optionalPipelineModule(window.LandingPage),
    ...optionalPipelineModule(window.XRExtras?.FullWindowCanvas),
    ...optionalPipelineModule(window.XRExtras?.Loading),
    ...optionalPipelineModule(window.XRExtras?.RuntimeError),
    cadiphyBloomPipelineModule(),
  ])

  XR8.run({
    canvas: getCameraCanvas(),
    allowedDevices: XR8.XrConfig.device().ANY,
  })
}

window.XR8 ? onxrloaded() : window.addEventListener('xrloaded', onxrloaded)
