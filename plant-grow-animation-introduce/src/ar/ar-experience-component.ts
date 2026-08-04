import * as ecs from '@8thwall/ecs'
import type {Camera, Object3D} from 'three'

import {AssetLoader} from './asset-loader'
import {installAudioUnlock} from './audio-unlock'
import {ExperienceStateMachine} from './experience-state-machine'
import {ExperienceTimelineController} from './experience-timeline-controller'
import {ImageTargetController} from './image-target-controller'
import {InteractionController} from './interaction-controller'
import {ParticleController} from './particle-controller'
import {PlantController} from './plant-controller'
import {VideoMenuController} from './video-menu-controller'
import {VideoPlayerController} from './video-player-controller'

// Pre-unlock audio on first user touch — must run before any component setup.
installAudioUnlock()

type ExperienceInstance = {
  timeline: ExperienceTimelineController
  imageTarget: ImageTargetController
  interaction: InteractionController
  plant: PlantController
  menu: VideoMenuController
  player: VideoPlayerController
  particles: ParticleController
}

const instances = new Map<ecs.Eid, ExperienceInstance>()
const creatingInstances = new Set<ecs.Eid>()
const pendingTargetFoundAt = new Map<ecs.Eid, number>()
const earlyTargetListeners = new Map<ecs.Eid, () => void>()

ecs.registerComponent({
  name: 'plant-grow-ar-experience',
  add: (world, cursor) => {
    attachEarlyTargetListeners(world, cursor.eid)
    void createExperience(world, cursor.eid)
  },
  tick: (world, cursor) => {
    const instance = instances.get(cursor.eid)
    if (!instance && !creatingInstances.has(cursor.eid)) {
      void createExperience(world, cursor.eid)
      return
    }

    if (!instance) return

    const deltaSeconds = Math.min(world.time.delta / 1000, 0.05)
    const elapsedSeconds = world.time.elapsed / 1000
    instance.plant.update(deltaSeconds)
    instance.particles.update(deltaSeconds, elapsedSeconds)
  },
  remove: (_world, cursor) => {
    const instance = instances.get(cursor.eid)
    if (!instance) return

    instance.imageTarget.dispose()
    instance.interaction.dispose()
    instance.plant.dispose()
    instance.menu.dispose()
    instance.player.dispose()
    instance.particles.dispose()
    instances.delete(cursor.eid)
    earlyTargetListeners.get(cursor.eid)?.()
    earlyTargetListeners.delete(cursor.eid)
    pendingTargetFoundAt.delete(cursor.eid)
  },
})

async function createExperience(world: ecs.World, anchorEid: ecs.Eid) {
  if (instances.has(anchorEid) || creatingInstances.has(anchorEid)) return
  creatingInstances.add(anchorEid)

  try {
    const anchorObject = world.three.entityToObject.get(anchorEid)
    if (!anchorObject) return

    world.three.setMatrixUpdateMode('auto')

    const assetLoader = new AssetLoader(world, anchorEid, anchorObject)
    assetLoader.pauseStudioGltfAnimation()
    const plantRoot = await assetLoader.waitForPlantRoot()

    const plant = new PlantController(plantRoot, {
      playGrowth: () => assetLoader.playStudioGrowthAnimation(),
      reset: () => assetLoader.resetStudioGrowthAnimation(),
      pause: () => assetLoader.pauseStudioGrowthAnimation(),
      resume: () => assetLoader.resumeStudioGrowthAnimation(),
    })
    await plant.load()

    const particles = new ParticleController()
    const menu = new VideoMenuController()
    const player = new VideoPlayerController()
    const machine = new ExperienceStateMachine()
    const timeline = new ExperienceTimelineController(machine, plant, menu, player, particles)

    anchorObject.add(particles.energyRoot)
    anchorObject.add(menu.root)
    anchorObject.add(player.root)
    anchorObject.add(particles.ambientRoot)

    const imageTarget = new ImageTargetController(world, anchorEid, {
      onFound: () => void timeline.onTargetFound(),
      onLostStable: () => void timeline.onTargetLost(),
    })

    const interaction = new InteractionController(
      world.three.activeCamera as unknown as Camera,
      plant,
      menu,
      player,
      machine,
      {
        openVideo: (item, videoEl) => timeline.openVideo(item, videoEl),
        closeVideo: () => timeline.closeVideo(),
        closeVideoAndDisappearPlant: () => timeline.closeVideoAndDisappearPlant(),
      },
    )

    player.setRequestClose(() => void timeline.closeVideo())

    // Wire drawer card taps → timeline.openVideo (with pre-played video for audio unlock)
    menu.setOnSelect((item, videoEl) => void timeline.openVideo(item, videoEl))

    instances.set(anchorEid, {
      timeline,
      imageTarget,
      interaction,
      plant,
      menu,
      player,
      particles,
    })

    earlyTargetListeners.get(anchorEid)?.()
    earlyTargetListeners.delete(anchorEid)

    const foundAt = pendingTargetFoundAt.get(anchorEid)
    if (foundAt && Date.now() - foundAt < 2000) {
      window.requestAnimationFrame(() => void timeline.onTargetFound())
    }

    notifyChanged(world, anchorObject)
  } catch (error) {
    console.warn('[ARExperience] Failed to create experience:', error)
  } finally {
    creatingInstances.delete(anchorEid)
  }
}

function attachEarlyTargetListeners(world: ecs.World, targetEid: ecs.Eid) {
  if (earlyTargetListeners.has(targetEid)) return

  const markFound = () => pendingTargetFoundAt.set(targetEid, Date.now())
  const markLost = () => pendingTargetFoundAt.delete(targetEid)

  world.events.addListener(targetEid, ecs.events.REALITY_IMAGE_FOUND, markFound)
  world.events.addListener(targetEid, ecs.events.REALITY_IMAGE_UPDATED, markFound)
  world.events.addListener(targetEid, ecs.events.REALITY_IMAGE_LOST, markLost)
  world.events.addListener(world.events.globalId, ecs.events.REALITY_IMAGE_FOUND, markFound)
  world.events.addListener(world.events.globalId, ecs.events.REALITY_IMAGE_UPDATED, markFound)
  world.events.addListener(world.events.globalId, ecs.events.REALITY_IMAGE_LOST, markLost)

  earlyTargetListeners.set(targetEid, () => {
    world.events.removeListener(targetEid, ecs.events.REALITY_IMAGE_FOUND, markFound)
    world.events.removeListener(targetEid, ecs.events.REALITY_IMAGE_UPDATED, markFound)
    world.events.removeListener(targetEid, ecs.events.REALITY_IMAGE_LOST, markLost)
    world.events.removeListener(world.events.globalId, ecs.events.REALITY_IMAGE_FOUND, markFound)
    world.events.removeListener(world.events.globalId, ecs.events.REALITY_IMAGE_UPDATED, markFound)
    world.events.removeListener(world.events.globalId, ecs.events.REALITY_IMAGE_LOST, markLost)
  })
}

function notifyChanged(world: ecs.World, object: Object3D) {
  try {
    world.three.notifyChanged(object)
  } catch {
    // Auto matrix mode may make this unnecessary in local dev.
  }
}
