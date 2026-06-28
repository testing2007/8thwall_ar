const onxrloaded = () => {
  XR8.XrController.configure({
    imageTargetData: [
      require('../image-targets/model-target.json'),
      require('../image-targets/video-target.json'),
      require('../image-targets/wine-label.json'),
      require('../image-targets/coffee-cat.json')
    ],
  })
}

window.XR8 ? onxrloaded() : window.addEventListener('xrloaded', onxrloaded)
