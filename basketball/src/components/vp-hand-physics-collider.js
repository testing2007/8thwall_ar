const handJointPositionComponent = {
  schema: {
    hand: {type: 'string'},
    joint: {type: 'string'},
  },
  update() {
    const hands = document.querySelectorAll('[hand-tracking-controls]')
    const hand = Array.from(hands).find(h => h.components['hand-tracking-controls'].data.hand === this.data.hand)

    if (!hand) {
      console.warn(`hand-joint-position: Unable to find hand-tracking-controls for ${this.data.hand}`)
      return
    }

    hand.addEventListener('model-loaded', () => {
      setTimeout(() => {
        const {bones} = hand.components['hand-tracking-controls']
        this.bone = bones.find(b => b.name === this.data.joint)
        if (this.bone) {
          this.updateSpherePosition()
        }
      })
    })
  },
  tick() {
    if (this.bone) {
      this.updateSpherePosition()
    }
  },
  updateSpherePosition() {
    // Assuming _position is a THREE.Vector3 defined earlier within the component for holding position values
    if (!this._position) this._position = new THREE.Vector3()

    // Get the world position of the joint
    this.bone.updateWorldMatrix(true, false)
    this.bone.getWorldPosition(this._position)

    // Directly set the sphere's world position
    this.el.object3D.position.copy(this._position)
  },
}

// Exporting the component
export {handJointPositionComponent}
