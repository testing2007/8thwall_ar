import video01Url from '../assets/video/1.mp4'
import video01Poster from '../assets/video/1_poster.jpg'
import video02Url from '../assets/video/2.mp4'
import video02Poster from '../assets/video/2_poster.jpg'

import type {VideoItem} from './types'

export const PLANT_GLB = {
  rootName: 'Plant_Growth_Root',
  fallbackGrowClip: 'Plant_Grow_8_seconds',
  growthAxis: 'z' as const,
  useAuthoredGrowthAnimation: true,
  requiredClipNames: [
    'plant_grow',
    'plant_idle',
    'plant_disappear_down',
    'plant_reset',
    'flower_idle',
  ],
}

export const TIMING = {
  targetLostTolerance: 0.3,
  introEnergyStart: 0.1,
  plantGrowthDuration: 4.2,
  videoMenuStart: 4.5,
  disappearDuration: 2.2,
  disappearWaveDuration: 1.35,
  videoCloseAudioFade: 0.25,
  videoCloseShrink: 0.4,
}

export const COLORS = {
  sapphire: 0x27b7ff,
  deepBlue: 0x0d2d66,
  leaf: 0x1f7d4b,
  stem: 0x104f35,
  flower: 0xb9e7ff,
  berry: 0x1a5acb,
  glass: 0x75d6ff,
}

export const LAYOUT = {
  anchorScale: 1,
  plantScale: 0.92,
  videoMenuY: 0.22,
  videoMenuZ: 0.045,
  videoPlayerY: 0.1,
  videoPlayerZ: 0.09,
  videoPlayerWidth: 0.82,
  videoPlayerHeight: 0.46,
  screenVideoMaxWidth: 'min(92vw, 920px)',
  screenVideoMaxHeight: '72vh',
}

export const videos: VideoItem[] = [
  {
    id: 'video-01',
    title: 'Orange & Peppercorn Twist',
    duration: 30,
    thumbnailUrl: video01Poster,
    videoUrl: video01Url,
  },
  {
    id: 'video-02',
    title: 'Lemon & Thyme Twist',
    duration: 45,
    thumbnailUrl: video02Poster,
    videoUrl: video02Url,
  },
]

export const INTRO_TIMELINE_NOTES = [
  '0.00s target locked',
  '0.10s sapphire glow appears',
  '0.30s energy ring expands',
  '0.45s main stem growth begins',
  '1.10s left branch growth begins',
  '1.40s right branch growth begins',
  '1.70s first leaves unfold',
  '2.20s second branch and leaf wave',
  '2.80s first flower blooms',
  '3.20s second and third flowers bloom',
  '3.60s berries, pollen, dew and particles appear',
  '4.20s plant idle begins',
  '4.50s video cards enter',
]
