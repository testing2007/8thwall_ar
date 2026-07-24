import * as ecs from '@8thwall/ecs'

ecs.registerComponent({
  name: 'Business Card Animations',
  schema: {
    model: ecs.eid,  // The 3D model of the business card
    emailButton: ecs.eid,  // The entity for the email button
    linkedInButton: ecs.eid,  // The entity for the LinkedIn button
  },

  stateMachine: ({world, eid, schemaAttribute}) => {
    const delay = 400
    let revealTimeouts: number[] = []

    const clearRevealTimeouts = () => {
      revealTimeouts.forEach(timeoutId => world.time.clearTimeout(timeoutId))
      revealTimeouts = []
    }

    const getTargets = () => {
      const {model, emailButton, linkedInButton} = schemaAttribute.get(eid)
      return [model, emailButton, linkedInButton]
    }

    const hideTargets = () => {
      clearRevealTimeouts()
      getTargets().forEach((target) => {
        ecs.Hidden.set(world, target)
        ecs.ScaleAnimation.remove(world, target)
      })
    }

    const animateIn = (target: ecs.Eid) => {
      ecs.Hidden.remove(world, target)
      ecs.ScaleAnimation.set(world, target, {
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
    }

    ecs.defineState('default')
      .initial()
      .onEnter(() => {
        hideTargets()
      })
      .listen(world.events.globalId, ecs.events.REALITY_IMAGE_FOUND, () => {
        const {model, emailButton, linkedInButton} = schemaAttribute.get(eid)

        hideTargets()
        animateIn(model)

        revealTimeouts.push(world.time.setTimeout(() => {
          animateIn(emailButton)
        }, delay))

        revealTimeouts.push(world.time.setTimeout(() => {
          animateIn(linkedInButton)
        }, delay * 2))
      })
      .listen(world.events.globalId, ecs.events.REALITY_IMAGE_LOST, () => {
        hideTargets()
      })
  },
})
