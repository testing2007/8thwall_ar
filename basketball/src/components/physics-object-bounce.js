const gltfPhysicsObjectComponent2 = {
  schema: {
    model: {default: ''},  // id of glb model
    body: {type: 'string', default: 'static'},  // dynamic, kinematic or static
    shape: {type: 'string', default: 'mesh'},  // hull or mesh (mesh will only work for static body)
    mass: {type: 'number', default: 1},
    bounce: {type: 'number', default: 0.45},
  },
  init() {
    // GLB models only - we need to wait for model-loaded event before adding physics body/shape
    this.el.setAttribute('gltf-model', this.data.model)

    this.el.addEventListener('model-loaded', () => {
      setTimeout(() => {
        this.el.setAttribute('ammo-body', {
          type: this.data.body,
          mass: this.data.mass,
        })
        this.el.setAttribute('ammo-shape', {type: this.data.shape})
        setTimeout(() => {
          if (this.el.body && typeof this.el.body.setRestitution === 'function') {
            this.el.body.setRestitution(this.data.bounce)
          } else {
            console.error('Physics body not accessible or setRestitution method not available.')
          }
        }, 400)
      }, 100)
    })
  },
}
export {gltfPhysicsObjectComponent2}
