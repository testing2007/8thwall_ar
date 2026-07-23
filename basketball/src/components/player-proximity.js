const cameraProximityComponent = {
  schema: {
    targetId: {type: 'string', default: 'arcadeProximity'},
    radius: {type: 'number', default: 1.75},
  },
  init() {
    this.target = document.getElementById(this.data.targetId)
    if (!this.target) {
      console.error(`Element with id "${this.data.targetId}" not found.`)
      return
    }
    this.targetPos = new THREE.Vector3()
    this.inside = false  // Track whether the camera is inside the proximity radius

    this.overlay = document.getElementById('orientationOverlay')
  },
  tick() {
    if (!this.target || !this.overlay) return

    // Update the target position in case it moves.
    this.target.object3D.getWorldPosition(this.targetPos)

    // Get the camera position.
    const cameraEl = this.el.sceneEl.camera.el
    const cameraPos = new THREE.Vector3()
    cameraEl.object3D.getWorldPosition(cameraPos)

    // Calculate the distance between the target and the camera.
    const distance = this.targetPos.distanceTo(cameraPos)
    const wasInside = this.inside
    this.inside = distance <= this.data.radius

    // Determine whether the camera has entered or exited the proximity radius.
    if (this.inside && !wasInside) {
      // Camera has entered the proximity radius.
      this.overlay.style.display = 'flex'  // Make the overlay visible.
      this.el.emit('entered')  // Optionally, emit an 'entered' event.
    } else if (!this.inside && wasInside) {
      // Camera has exited the proximity radius.
      this.overlay.style.display = 'none'  // Hide the overlay.
      this.el.emit('exited')  // Optionally, emit an 'exited' event.
    }
  },
}

export {cameraProximityComponent}
