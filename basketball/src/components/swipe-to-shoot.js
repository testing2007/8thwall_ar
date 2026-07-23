const swipeToShootComponent = {
  schema: {
    sphereRadius: {type: 'number', default: 0.185},
    maxForce: {type: 'number', default: 5},
    maxVelocity: {type: 'number', default: 5},
    upwardForceMax: {type: 'number', default: 6.5},
    upwardForceRatio: {type: 'number', default: 0.1},
    swipeScaleFactor: {type: 'number', default: 0.35},
  },

  init() {
    this.startX = 0
    this.startY = 0
    // Create the initial basketball without physics attributes
    this.createBasketball()
    this.el.sceneEl.addEventListener('touchstart', this.onTouchStart.bind(this))
    this.el.sceneEl.addEventListener('touchend', this.onTouchEnd.bind(this))
  },

  onTouchStart(evt) {
    this.startX = evt.touches[0].clientX
    this.startY = evt.touches[0].clientY
    this.startTime = Date.now()
  },

  onTouchEnd(evt) {
    const endX = evt.changedTouches[0].clientX
    const endY = evt.changedTouches[0].clientY
    const swipeDuration = Date.now() - this.startTime
    const swipeDistance = Math.sqrt(Math.pow(endX - this.startX, 2) + Math.pow(endY - this.startY, 2))
    const scaledSwipeDistance = swipeDistance * this.data.swipeScaleFactor
    const swipeStrength = Math.min(scaledSwipeDistance / swipeDuration, 1)

    let forceMagnitude = swipeStrength * this.data.maxForce
    forceMagnitude = Math.min(forceMagnitude, this.data.maxVelocity)

    // Use upwardForceMax to cap the upward force
    const upwardForce = Math.min(scaledSwipeDistance * this.data.upwardForceRatio, this.data.upwardForceMax)

    this.shootBasketball(this.basketballEl, forceMagnitude, upwardForce, swipeDistance)
  },

  createBasketball() {
    const cameraEl = this.el.parentEl  // Assuming this component is attached to an entity that's a child of the camera.

    // Initial position
    const initialPosition = {x: 0, y: -1, z: -0.5}

    const basketballEl = document.createElement('a-sphere')
    basketballEl.setAttribute('position', AFRAME.utils.coordinates.stringify(initialPosition))
    basketballEl.setAttribute('radius', this.data.sphereRadius)
    basketballEl.setAttribute('material', 'transparent: true; opacity: 0; depthWrite: false')

    // Create and append the glTF model entity as a child
    const modelEntity = document.createElement('a-entity')
    modelEntity.setAttribute('gltf-model', '#basketball-model')
    modelEntity.setAttribute('shadow', '')
    modelEntity.setAttribute('scale', '.58 .58 .58')
    basketballEl.appendChild(modelEntity)

    // Add an animation to move the basketball to its ready position
    basketballEl.setAttribute('animation', {
      property: 'position',
      to: '0 -0.35 -0.5',
      dur: 1000,  // Duration in milliseconds
      easing: 'easeInOutQuad',
    })

    cameraEl.appendChild(basketballEl)
    this.basketballEl = basketballEl  // Keep reference to the current basketball
  },

  shootBasketball(basketballEl, forceMagnitude, upwardForce, swipeDistance) {
    basketballEl.setAttribute('proximity-score', '')
    basketballEl.setAttribute('ammo-body', 'type: dynamic')
    basketballEl.setAttribute('ammo-shape', 'type: sphere')
    basketballEl.setAttribute('set-restitution', 'restitution: 0.75')

    setTimeout(() => {
      const cameraEl = this.el.sceneEl.camera.el
      const direction = new THREE.Vector3()
      cameraEl.object3D.getWorldDirection(direction)
      direction.negate().multiplyScalar(forceMagnitude)
      direction.y += upwardForce

      const velocity = new Ammo.btVector3(direction.x, direction.y, direction.z)
      basketballEl.body.setLinearVelocity(velocity)

      // Here, you might adjust the calculation based on the swipe distance to fit your needs
      const torqueMagnitude = swipeDistance * 0.05  // Example calculation, adjust as needed
      const torqueDirection = new Ammo.btVector3(torqueMagnitude, 0, 0)  // Assuming a simple spin around the Y-axis
      basketballEl.body.setAngularVelocity(torqueDirection)

      Ammo.destroy(velocity)
      Ammo.destroy(torqueDirection)

      // Immediately prepare a new basketball for the next shot
      this.createBasketball()

      // Schedule the removal of the current basketball entity after 5 seconds
      setTimeout(() => {
        if (basketballEl.parentNode) {
          basketballEl.parentNode.removeChild(basketballEl)
        }
      }, 5000)
    }, 0)
  },
}

// Exporting the component
export {swipeToShootComponent}
