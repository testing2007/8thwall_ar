import * as ecs from '@8thwall/ecs'

ecs.registerComponent({
  name: 'Call To Action',
  schema: {
    link: ecs.string,
  },
  schemaDefaults: {
    link: 'https://www.8thwall.com/get-started',
  },
  data: {
  },
  stateMachine: ({world, eid, schemaAttribute}) => {
    ecs.defineState('default')
      .initial()
      .listen(eid, ecs.input.UI_CLICK, () => {
        const {link} = schemaAttribute.get(eid)
        window.location.assign(`${link}`)
      })
  },
})
