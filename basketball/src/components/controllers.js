const controllersComponent = {
  init() {
    // this.el.sceneEl.addEventListener('renderstart', () => {
    setTimeout(() => {
      const {renderer} = this.el.sceneEl
      console.log('Renderer:', renderer)  // Log the renderer to the console

      const controller1 = renderer.xr.getController(0)
      const controller2 = renderer.xr.getController(1)

      console.log('Controller 1:', controller1)  // Log controller 1 to the console
      console.log('Controller 2:', controller2)  // Log controller 2 to the console

      // Function to find and hide the 'tracer' object for a controller
      function hideTracer(controller) {
        const tracer = controller.children.find(child => child.name === 'tracer')
        if (tracer) {
          tracer.visible = false
          console.log('Tracer object hidden for', controller)
        } else {
          console.log('Tracer object not found for', controller)
        }
      }

      // Hide the 'tracer' object for both controllers
      hideTracer(controller1)
      hideTracer(controller2)
    }, 2000)  // Adjust the delay time as needed
    // })
  },
}

export {controllersComponent}
