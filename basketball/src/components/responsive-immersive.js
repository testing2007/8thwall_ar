const skyPath = require('../assets/textures/sky.jpg')
// const envPath = require('../assets/models/environment.glb')
// const hmdArcadePath = require('../assets/models/hmd-arcade.glb')

const responsiveImmersiveComponent = {
  init() {
    const arcadeParent = document.getElementById('arcadeParent')
    const arcadeEl = document.getElementById('arcadeEl')
    const ground = document.getElementById('ground')

    const onAttach = ({sessionAttributes}) => {
      const s = sessionAttributes
      if (
        !s.cameraLinkedToViewer &&
        !s.controlsCamera &&
        !s.fillsCameraTexture &&
        !s.supportsHtmlEmbedded &&
        s.supportsHtmlOverlay &&
        !s.usesMediaDevices &&
        !s.usesWebXr
      ) {  // Desktop-specific behavior goes here
        console.log('desktop')
        ground.remove()
        // add environment
        this.el.sceneEl.insertAdjacentHTML('beforeend', `
          <a-entity
            reflections="type: static"
            position="0 -.1 0"
            scale="1.1 1.1 1.1"
            position="0 0 -2"
            shadow="cast: false"
            physics-object2="model: #environment; body: static; shape: mesh""></a-entity>

          <a-sky src="${skyPath}" rotation="0 -177.710 0"></a-sky>
        `)
      } else if (
        s.cameraLinkedToViewer &&
        s.controlsCamera &&
        !s.fillsCameraTexture &&
        s.supportsHtmlEmbedded &&
        !s.supportsHtmlOverlay &&
        !s.usesMediaDevices &&
        s.usesWebXr
      ) {  // HMD-specific behavior goes here
        console.log('hmd')
        this.el.sceneEl.addEventListener('realityready', () => {
          this.el.sceneEl.setAttribute('controller-handler', ' ')
        })
        if (this.el.sceneEl.xrSession.environmentBlendMode === 'opaque') {
          // VR HMD
          console.log('vr hmd')
          // add environment
          ground.remove()
          this.el.sceneEl.insertAdjacentHTML('beforeend', `
          <a-entity
            reflections="type: static"
            position="0 -.1 0"
            scale="1.1 1.1 1.1"
            position="0 0 -2"
            shadow="cast: false"
            physics-object2="model: #environment; body: static; shape: mesh""></a-entity>

          <a-sky src="${skyPath}" rotation="0 -177.710 0"></a-sky>

            <a-sphere
              id="basketball"
              position="0 2.2 -0.785"
              material="transparent: true; opacity: 0"
              radius="0.185"
              ammo-body="type: dynamic; gravity: 0 0 0"
              ammo-shape="type: sphere"
              proximity-trigger="range: 0.145">
              <a-entity gltf-model="#basketball-model" shadow scale=".58 .58 .58"></a-entity>
            </a-sphere>
          `)
        } else if (this.el.sceneEl.xrSession.environmentBlendMode === 'additive' || 'alpha-blend') {
          // AR HMD (i.e. Hololens) behavior goes here
          console.log('passthrough hmd')
          this.el.sceneEl.insertAdjacentHTML('beforeend', `
            <a-sphere
              id="basketball"
              position="0 2.2 -0.785"
              material="transparent: true; opacity: 0"
              radius="0.185"
              ammo-body="type: dynamic; gravity: 0 0 0"
              ammo-shape="type: sphere"
              proximity-trigger="range: 0.145">
              <a-entity gltf-model="#basketball-model" shadow scale=".58 .58 .58"></a-entity>
            </a-sphere>
          `)
        } else if (
          !s.cameraLinkedToViewer &&
        !s.controlsCamera &&
        s.fillsCameraTexture &&
        !s.supportsHtmlEmbedded &&
        s.supportsHtmlOverlay &&
        s.usesMediaDevices &&
        !s.usesWebXr
        ) {  // Mobile-specific behavior goes here
          console.log('mobile')
          // this.el.sceneEl.addEventListener('realityready', () => {
          //   arcadeParent.setAttribute('scale', '0.001 0.001 0.001')
          // })
        }
      }
    }

    const onxrloaded = () => {
      XR8.addCameraPipelineModules([{'name': 'responsiveImmersive', onAttach}])
    }
    window.XR8 ? onxrloaded() : window.addEventListener('xrloaded', onxrloaded)
  },
}

export {responsiveImmersiveComponent}
