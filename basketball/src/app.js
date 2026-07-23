import {responsiveImmersiveComponent} from './components/responsive-immersive'
AFRAME.registerComponent('responsive-immersive', responsiveImmersiveComponent)

import {gltfPhysicsObjectComponent} from './components/glb-physics-object'
AFRAME.registerComponent('physics-object', gltfPhysicsObjectComponent)

import {swipeToShootComponent} from './components/swipe-to-shoot'
AFRAME.registerComponent('swipe-to-shoot', swipeToShootComponent)

import {proximityTriggerComponent} from './components/basketball-proximity'
AFRAME.registerComponent('proximity-trigger', proximityTriggerComponent)

import {handJointPositionComponent} from './components/vp-hand-physics-collider'
AFRAME.registerComponent('hand-joint-position', handJointPositionComponent)

import {onboardingComponent} from './components/onboarding'
AFRAME.registerComponent('onboarding', onboardingComponent)

import {scoreComponent} from './components/score'
AFRAME.registerComponent('proximity-score', scoreComponent)

import {autoplayVideoComponent} from './components/autoplay-video'
AFRAME.registerComponent('auto-play-video', autoplayVideoComponent)

import {controllersComponent} from './components/controllers'
AFRAME.registerComponent('controller-handler', controllersComponent)

import {cameraProximityComponent} from './components/player-proximity'
AFRAME.registerComponent('camera-proximity-trigger', cameraProximityComponent)

import {restitutionComponent} from './components/bounce'
AFRAME.registerComponent('set-restitution', restitutionComponent)

import {gltfPhysicsObjectComponent2} from './components/physics-object-bounce'
AFRAME.registerComponent('physics-object2', gltfPhysicsObjectComponent2)
