const onxrloaded = () => {
  XR8.XrController.configure({
    imageTargetData: [
      require('../image-targets/barone-56-label.json'),
      require('../image-targets/barone-castello-label.json'),
      require('../image-targets/cat-label.json')

    ],
  })
}

window.XR8 ? onxrloaded() : window.addEventListener('xrloaded', onxrloaded)
