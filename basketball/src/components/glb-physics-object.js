const gltfPhysicsObjectComponent = {
  schema: {
    model: {default: ''},  // id of glb model
    body: {type: 'string', default: 'static'},  // dynamic, kinematic or static
    shape: {type: 'string', default: 'mesh'},  // hull or mesh (mesh will only work for static body)
    mass: {type: 'number', default: 1},
  },
  init() {
    this.el.setAttribute('gltf-model', this.data.model)
    // GLB models only - we need to wait for model-loaded event before adding physics body/shape
    this.el.addEventListener('model-loaded', () => {
      setTimeout(() => {
        this.el.setAttribute('ammo-body', {
          type: this.data.body,
          mass: this.data.mass,
        })
        this.el.setAttribute('ammo-shape', {type: this.data.shape})
      }, 100)
    })
  },
}
export {gltfPhysicsObjectComponent}
