const proximityTriggerComponent = {
  schema: {
    range: {type: 'number', default: 0.25},  // Proximity range for triggering
  },

  init() {
    this.isInside = true
    this.referencePosition = this.el.object3D.position.clone()
  },

  tick() {
    const currentPosition = this.el.object3D.position
    const {range} = this.data

    if (Math.abs(currentPosition.x - this.referencePosition.x) > range || Math.abs(currentPosition.z - this.referencePosition.z) > range) {
      if (this.isInside) {
        this.el.setAttribute('ammo-body', {
          type: 'dynamic',
          gravity: '0 -9.8 0',
          activationState: 'disableDeactivation',
        })
        console.log('Exited the proximity.')
        this.isInside = false  // Update state to outside
        setTimeout(() => this.createBasketball(), 2000)  // Delay creation of a new basketball

        setTimeout(() => {
          // Ensure the element is still part of the document
          if (this.el.parentNode) {
            this.el.parentNode.removeChild(this.el)
            console.log('Entity removed from the scene after 8 seconds.')
          }
        }, 8000)  // 8 seconds delay for removal
      }
    } else if (!this.isInside) {
      console.log('Re-entered the proximity.')
      this.isInside = true  // Update state to inside
    }
  },

  createBasketball() {
    // Create a new basketball entity with initial kinematic body
    const newBasketball = document.createElement('a-sphere')
    newBasketball.setAttribute('id', 'basketball')
    newBasketball.setAttribute('position', '0 0.583 -0.785')  // Initial position
    newBasketball.setAttribute('radius', '.185')
    newBasketball.setAttribute('material', 'transparent: true; opacity: 0')
    newBasketball.setAttribute('proximity-trigger', 'range: 0.145')
    newBasketball.setAttribute('proximity-score', '')

    // Create and append the glTF model entity as a child
    const modelEntity = document.createElement('a-entity')
    modelEntity.setAttribute('gltf-model', '#basketball-model')
    modelEntity.setAttribute('shadow', '')
    modelEntity.setAttribute('scale', '.58 .58 .58')
    newBasketball.appendChild(modelEntity)

    // Add the animation component to animate the position
    newBasketball.setAttribute('animation', {
      property: 'position',
      to: '0 2.2 -0.785',
      dur: 1500,  // Duration of the animation in milliseconds (1 second)
      easing: 'easeOutSine',
    })

    // Use setTimeout to wait for the animation to complete
    setTimeout(() => {
      // Change the body to dynamic after the animation (assumed to be 1 second) completes
      newBasketball.setAttribute('ammo-body', 'type: dynamic; gravity: 0 0 0; activationState: disableDeactivation')
      newBasketball.setAttribute('ammo-shape', 'type: sphere')
      console.log('ended')
    }, 1500)  // Corresponding to the duration of the animation

    // Add the new basketball to the scene
    this.el.sceneEl.appendChild(newBasketball)
  },
}

// Exporting the component
export {proximityTriggerComponent}
