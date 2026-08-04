import * as ecs from '@8thwall/ecs'


const PRODUCTION_CLIP = 'MASTER_FULL_6S'

ecs.registerComponent({
  name: 'cookie-ar-glb-controller',

  schema: {
    targetName: ecs.string,
    modelEntity: ecs.eid,
  },

  stateMachine: ({world, eid, schemaAttribute}) => {
    let started = false
    let pausedByTracking = false

    const settings = () => schemaAttribute.get(eid)
    const modelEid = () => settings().modelEntity || eid
    const matchesTarget = (event) => event.data.name === settings().targetName

    const initialisePaused = () => {
      if (!ecs.GltfModel.has(world, modelEid())) return
      ecs.GltfModel.mutate(world, modelEid(), (cursor) => {
        cursor.animationClip = PRODUCTION_CLIP
        cursor.loop = false
        cursor.paused = true
        cursor.time = 0
        cursor.timeScale = 1
        return false
      })
    }

    const playFromStart = () => {
      ecs.GltfModel.mutate(world, modelEid(), (cursor) => {
        cursor.animationClip = PRODUCTION_CLIP
        cursor.loop = false
        cursor.paused = false
        cursor.time = 0
        cursor.timeScale = 1
        return false
      })
      started = true
      pausedByTracking = false
    }

    const resume = () => {
      ecs.GltfModel.mutate(world, modelEid(), (cursor) => {
        cursor.paused = false
        return false
      })
      pausedByTracking = false
    }

    const pause = () => {
      ecs.GltfModel.mutate(world, modelEid(), (cursor) => {
        cursor.paused = true
        return false
      })
      pausedByTracking = true
    }

    ecs.defineState('default')
      .initial()
      .onEnter(initialisePaused)
      .listen(world.events.globalId, ecs.events.REALITY_IMAGE_FOUND, (event) => {
        if (!matchesTarget(event)) return
        if (!started) playFromStart()
        else if (pausedByTracking) resume()
      })
      .listen(world.events.globalId, ecs.events.REALITY_IMAGE_LOST, (event) => {
        if (!matchesTarget(event) || !started) return
        pause()
      })
  },
})
