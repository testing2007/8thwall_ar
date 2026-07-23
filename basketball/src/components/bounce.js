const restitutionValue = 0.9  // Initialize restitution value

const restitutionComponent = {
  schema: {
    restitution: {type: 'number', default: 0.9},
  },
  init() {
    this.applyRestitution()
  },
  applyRestitution() {
    // Attempt to access the physics body directly
    const physicsBody = this.el.body

    if (physicsBody && typeof physicsBody.setRestitution === 'function') {
      // Apply the restitution value from the schema
      physicsBody.setRestitution(this.data.restitution)
    } else {
      console.warn('Physics body not immediately available, restitution not applied. Consider using a delay or an event listener for body-loaded.')
    }
  },
}

export {restitutionComponent}
