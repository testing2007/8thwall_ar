import * as ecs from '@8thwall/ecs'

ecs.registerComponent({
  name: 'Business Card Animations',
  schema: {
    model: ecs.eid,  // The 3D model of the business card
    emailButton: ecs.eid,  // The entity for the email button
    linkedInButton: ecs.eid,  // The entity for the LinkedIn button
  },

  stateMachine: ({world, eid, schemaAttribute}) => {
    // Use a state machine for simple event listening
    ecs.defineState('default')
      .initial()
      .listen(world.events.globalId, 'reality.imagefound', () => {
        // Define a value for the animations to appear sequentially
        const delay = 400

        // Destructure references to the UI entities from the schema
        const {model, emailButton, linkedInButton} = schemaAttribute.get(eid)

        // Show the main model and animate it using scale animation
        ecs.Hidden.remove(world, model)
        ecs.ScaleAnimation.set(world, model, {
          fromX: 0.5,
          fromY: 0.5,
          fromZ: 0.5,
          toX: 1,
          toY: 1,
          toZ: 1,
          loop: false,
          easeOut: true,
          easingFunction: 'Elastic',
          duration: 1200,
        })

        // After a short delay, show and animate the email button

        world.time.setTimeout(() => {
          ecs.Hidden.remove(world, emailButton)
          ecs.ScaleAnimation.set(world, emailButton, {
            fromX: 0.5,
            fromY: 0.5,
            fromZ: 0.5,
            toX: 1,
            toY: 1,
            toZ: 1,
            loop: false,
            easeOut: true,
            easingFunction: 'Elastic',
            duration: 1200,
          })
        }, delay)  // 400 ms delay

        // After a longer delay, show and animate the LinkedIn button
        world.time.setTimeout(() => {
          ecs.Hidden.remove(world, linkedInButton)
          ecs.ScaleAnimation.set(world, linkedInButton, {
            fromX: 0.5,
            fromY: 0.5,
            fromZ: 0.5,
            toX: 1,
            toY: 1,
            toZ: 1,
            loop: false,
            easeOut: true,
            easingFunction: 'Elastic',
            duration: 1200,
          })
        }, delay * 2)  // 800 ms delay
      })
  },
})
