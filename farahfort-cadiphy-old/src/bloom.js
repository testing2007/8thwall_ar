import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { WineryStoryController } from "./winery-story.js";

window.THREE = THREE;

const MODEL_URL = require("./assets/farahfort-cadiphy.glb");
const AUDIO_URL = require("./assets/cadiphy_fullmix_10s.mp3");
const TARGET_NAME = "trigger-label";
const MODEL_RAW_WIDTH = 87.98;
const STORY_REVEAL_TIME = 9.2;

const STATE = Object.freeze({
  SCANNING: "SCANNING",
  AR_PLAYING: "AR_PLAYING",
  AR_COMPLETE: "AR_COMPLETE",
  WINERY_VIDEO: "WINERY_VIDEO",
});

let modelRoot = null;
let mixer = null;
let actions = [];
let animationDuration = 10;
let story = null;
let modelMaterials = [];
let mediaUnlocked = false;
let mediaUnlockPromise = null;
let pendingMainAudioStart = false;
let targetVisible = false;
let experienceState = STATE.SCANNING;
let fallbackTime = 0;
const clock = new THREE.Clock();

const audioEl = new Audio(AUDIO_URL);
audioEl.loop = false;
audioEl.preload = "auto";
audioEl.playsInline = true;
audioEl.muted = true;
audioEl.defaultMuted = true;
audioEl.volume = 1;

const unlockMedia = () => {
  if (mediaUnlocked) return Promise.resolve();
  if (mediaUnlockPromise) return mediaUnlockPromise;

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (AudioContextClass) {
    const context = new AudioContextClass();
    const buffer = context.createBuffer(1, 1, 22050);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.start(0);
    context
      .resume()
      .then(() => context.close())
      .catch(() => undefined);
  }

  audioEl.muted = false;
  audioEl.defaultMuted = false;
  audioEl.volume = 0;
  audioEl.currentTime = 0;
  const promise = audioEl.play();
  if (!promise) {
    audioEl.pause();
    audioEl.currentTime = 0;
    audioEl.volume = 1;
    mediaUnlocked = true;
    return Promise.resolve();
  }
  mediaUnlockPromise = promise
    .then(() => {
      audioEl.pause();
      audioEl.currentTime = 0;
      audioEl.volume = 1;
      audioEl.muted = false;
      audioEl.defaultMuted = false;
      mediaUnlocked = true;
      mediaUnlockPromise = null;
      if (pendingMainAudioStart && experienceState === STATE.AR_PLAYING) {
        pendingMainAudioStart = false;
        playMainAudio({ fromStart: false });
      }
    })
    .catch((error) => {
      console.warn("[CADIPHY Audio] Initial media unlock failed:", error);
      mediaUnlocked = false;
      mediaUnlockPromise = null;
      pendingMainAudioStart = false;
      audioEl.pause();
      audioEl.currentTime = 0;
      audioEl.volume = 1;
      audioEl.muted = true;
      audioEl.defaultMuted = true;
    });

  return mediaUnlockPromise;
};

window.CADIPHY_UNLOCK_MEDIA = unlockMedia;

const applyModelOpacity = (opacity) => {
  modelMaterials.forEach(({ material, opacity: baseOpacity, transparent }) => {
    material.opacity = baseOpacity * opacity;
    material.transparent =
      transparent || baseOpacity < 0.999 || opacity < 0.999;
    material.needsUpdate = true;
  });
};

const captureModelMaterials = (model) => {
  modelMaterials = [];
  model.traverse((object) => {
    if (!object.isMesh || !object.material) return;
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    materials.forEach((material) => {
      modelMaterials.push({
        material,
        opacity: material.opacity ?? 1,
        transparent: material.transparent,
      });
    });
  });
};

const restoreModelVisibility = () => {
  applyModelOpacity(1);
};

const pauseMainAudio = ({ reset = false } = {}) => {
  pendingMainAudioStart = false;
  audioEl.pause();
  if (reset) audioEl.currentTime = 0;
};

const playMainAudio = ({ fromStart = true } = {}) => {
  if (!mediaUnlocked && mediaUnlockPromise) {
    pendingMainAudioStart = true;
    return;
  }
  audioEl.currentTime = fromStart
    ? 0
    : Math.min(fallbackTime, Math.max(0, animationDuration - 0.03));
  audioEl.muted = !mediaUnlocked;
  audioEl.defaultMuted = !mediaUnlocked;
  audioEl.volume = 1;
  const promise = audioEl.play();
  if (promise) {
    promise.catch((error) => {
      console.warn(
        "[CADIPHY Audio] Playback failed; using animation clock fallback:",
        error,
      );
    });
  }
};

const resetAnimation = () => {
  fallbackTime = 0;
  story?.hide();
  if (!mixer) return;
  actions.forEach((action) => {
    action.enabled = true;
    action.paused = false;
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
  });
  mixer.setTime(0);
};

const hardResetExperience = () => {
  targetVisible = false;
  experienceState = STATE.SCANNING;
  pauseMainAudio({ reset: true });
  if (modelRoot) {
    applyModelOpacity(1);
    modelRoot.visible = false;
  }
  resetAnimation();
};

const playAnimationFromStart = () => {
  resetAnimation();
  experienceState = STATE.AR_PLAYING;
  playMainAudio();
};

const completeAnimation = () => {
  if (experienceState !== STATE.AR_PLAYING) return;
  experienceState = STATE.AR_COMPLETE;
  mixer?.setTime(animationDuration);
  pauseMainAudio();
  story?.show();
};

const applyImageTargetPose = ({ detail }) => {
  if (!modelRoot || detail.name !== TARGET_NAME) return;
  if (!window.CADIPHY_AR_STARTED) {
    targetVisible = false;
    if (modelRoot.visible) hardResetExperience();
    return;
  }
  const { position, rotation, scale = 0.11 } = detail;
  const shouldStart = experienceState === STATE.SCANNING;

  modelRoot.visible = true;
  targetVisible = true;
  restoreModelVisibility();
  const finalScale = (scale > 0 ? scale : 0.11) / MODEL_RAW_WIDTH;
  modelRoot.position.set(position.x, position.y, position.z + 0.002);
  modelRoot.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
  modelRoot.scale.setScalar(finalScale);

  if (shouldStart) playAnimationFromStart();
};

const hideImageTargetModel = ({ detail }) => {
  if (!modelRoot || detail.name !== TARGET_NAME) return;
  targetVisible = false;
  if (!window.CADIPHY_AR_STARTED) {
    if (modelRoot.visible) hardResetExperience();
    return;
  }

  // A winery video is screen-space content and must survive brief tracking loss.
  if (experienceState === STATE.WINERY_VIDEO) return;

  hardResetExperience();
};

const setupStory = (model, camera, canvas) => {
  story = new WineryStoryController({
    camera,
    canvas,
    onOpen: () => {
      experienceState = STATE.WINERY_VIDEO;
      pauseMainAudio();
    },
    onClose: () => {
      experienceState = STATE.AR_COMPLETE;
      modelRoot.visible = true;
      mixer?.setTime(animationDuration);
      story.show();
    },
  });

  const arRoot = model.getObjectByName("AR_ROOT");
  if (arRoot) {
    story.root.position.set(0, 0, 51);
    story.attachTo(arRoot);
  } else {
    story.root.position.set(0, 0, 51);
    story.attachTo(model);
    console.warn(
      "[CADIPHY Story] AR_ROOT was not found; using model-root placement.",
    );
  }
};

export const cadiphyFormalPipelineModule = () => ({
  name: "cadiphy-formal-animated",

  listeners: [
    { event: "reality.imagefound", process: applyImageTargetPose },
    { event: "reality.imageupdated", process: applyImageTargetPose },
    { event: "reality.imagelost", process: hideImageTargetModel },
  ],

  onStart: () => {
    const { scene, camera } = XR8.Threejs.xrScene();
    const canvas = document.getElementById("camerafeed");

    scene.add(new THREE.AmbientLight(0xffffff, 2.2));

    const dirLightMain = new THREE.DirectionalLight(0xffffff, 2.5);
    dirLightMain.position.set(2, 4, 3);
    scene.add(dirLightMain);

    const dirLightSub = new THREE.DirectionalLight(0xffe0b2, 1.8);
    dirLightSub.position.set(-2, -2, 2);
    scene.add(dirLightSub);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.5));

    new GLTFLoader().load(
      MODEL_URL,
      (gltf) => {
        const model = gltf.scene;
        model.name = "farahfort_cadiphy";
        model.visible = false;

        model.traverse((object) => {
          if (!object.isMesh || !object.material) return;
          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          materials.forEach((material) => {
            material.side = THREE.DoubleSide;
            material.needsUpdate = true;
          });
        });
        captureModelMaterials(model);

        actions = [];
        if (gltf.animations.length) {
          mixer = new THREE.AnimationMixer(model);
          animationDuration = Math.max(
            ...gltf.animations.map((clip) => clip.duration),
          );
          gltf.animations.forEach((clip) => {
            const action = mixer.clipAction(clip);
            action.setLoop(THREE.LoopOnce, 1);
            action.clampWhenFinished = true;
            action.play();
            actions.push(action);
          });
          mixer.setTime(0);
        }

        setupStory(model, camera, canvas);
        scene.add(model);
        modelRoot = model;
      },
      undefined,
      (error) => {
        console.error(
          "[CADIPHY Model] Failed to load farahfort-cadiphy.glb:",
          error,
        );
      },
    );
  },

  onUpdate: () => {
    const delta = Math.min(clock.getDelta(), 0.1);
    story?.update(delta);
    if (!mixer || experienceState !== STATE.AR_PLAYING) return;

    if (!audioEl.paused) {
      fallbackTime = Math.max(fallbackTime, audioEl.currentTime);
    } else {
      fallbackTime += delta;
    }

    const timelineTime = Math.min(fallbackTime, animationDuration);
    mixer.setTime(timelineTime);
    if (timelineTime >= STORY_REVEAL_TIME) story?.show();
    if (timelineTime >= animationDuration - 0.03 || audioEl.ended)
      completeAnimation();
  },
});

export const cadiphyBloomPipelineModule = cadiphyFormalPipelineModule;
