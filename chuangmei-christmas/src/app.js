import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createSantaParticleFx } from "./santa-particle-fx.js";
import { createSantaPerformanceSequence } from "./santa-performance-sequence.js";
import "./santa-wish-overlay.js";

window.THREE = THREE;

const IMAGE_TARGET_DATA = require("../image-targets/target.json");
const MODEL_URL = require("./assets/christmas.glb");
const PERFORMANCE_AUDIO_URL = require("./assets/html/christmas-bgm.mp3");
const TARGET_NAME = "target";
const MODEL_TARGET_WIDTH_RATIO = 1;
const MODEL_SURFACE_OFFSET_METERS = 0.002;
const PERFORMANCE_AUDIO_VOLUME = 0.3;

const EXPERIENCE_STATE = {
  SCANNING: "SCANNING",
  AR_TRACKING: "AR_TRACKING",
  WISH_OVERLAY: "WISH_OVERLAY",
};

let modelRoot = null;
let mixer = null;
let animationActions = [];
let santaFx = null;
let performanceSequence = null;
let normalizedModelScale = 1;
let xrStarted = false;
let animationStarted = false;
let experienceState = EXPERIENCE_STATE.SCANNING;
const clock = new THREE.Clock();
const performanceAudio = new Audio(PERFORMANCE_AUDIO_URL);

performanceAudio.loop = false;
performanceAudio.preload = "auto";
performanceAudio.playsInline = true;
performanceAudio.volume = PERFORMANCE_AUDIO_VOLUME;

const getCameraCanvas = () => {
  let canvas = document.getElementById("camerafeed");
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.id = "camerafeed";
    document.body.appendChild(canvas);
  }
  return canvas;
};

const optionalPipelineModule = (factory) =>
  factory?.pipelineModule ? [factory.pipelineModule()] : [];

const setExperienceState = (state) => {
  if (experienceState === state) return;
  experienceState = state;
  window.dispatchEvent(new CustomEvent("christmas-ar:state", { detail: { state } }));
};

const normalizeModelSize = (model) => {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z, 0.0001);

  model.position.sub(center);
  normalizedModelScale = MODEL_TARGET_WIDTH_RATIO / maxDimension;
};

const prepareModel = (model) => {
  model.name = "christmas";
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
  normalizeModelSize(model);
};

const applyImageTargetPose = ({ detail }) => {
  if (!modelRoot || detail.name !== TARGET_NAME) return;
  if (experienceState === EXPERIENCE_STATE.WISH_OVERLAY) return;

  const { position, rotation, scale = 1 } = detail;
  modelRoot.visible = true;
  modelRoot.position.set(position.x, position.y, position.z + MODEL_SURFACE_OFFSET_METERS);
  modelRoot.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
  modelRoot.scale.setScalar((scale > 0 ? scale : 1) * normalizedModelScale);

  if (experienceState !== EXPERIENCE_STATE.AR_TRACKING) {
    setExperienceState(EXPERIENCE_STATE.AR_TRACKING);
    startModelAnimation();
  }
};

const hideImageTargetModel = ({ detail }) => {
  if (!modelRoot || detail.name !== TARGET_NAME) return;
  if (experienceState === EXPERIENCE_STATE.WISH_OVERLAY) return;
  modelRoot.visible = false;
  animationStarted = false;
  santaFx?.reset();
  performanceSequence?.reset();
  performanceAudio.pause();
  performanceAudio.currentTime = 0;
  setExperienceState(EXPERIENCE_STATE.SCANNING);
};

const enterWishOverlay = () => {
  if (experienceState === EXPERIENCE_STATE.WISH_OVERLAY) return;
  setExperienceState(EXPERIENCE_STATE.WISH_OVERLAY);

  if (modelRoot) modelRoot.visible = false;
  if (mixer) mixer.timeScale = 0;
  santaFx?.reset();
  performanceSequence?.finishLetterFlight();
  performanceAudio.pause();

  window.SantaWishOverlay?.show({ from: "santa-gift", playAudio: false });
};

const startSantaVoice = () => {
  performanceAudio.volume = 0.1;
  performanceSequence?.playVoice();
};

const startWishLetterFlight = () => {
  performanceAudio.volume = 0.16;
  performanceSequence?.startLetterFlight();
};

const playPerformanceAudio = () => {
  performanceAudio.currentTime = 0;
  performanceAudio.volume = PERFORMANCE_AUDIO_VOLUME;
  const playPromise = performanceAudio.play();
  if (playPromise?.catch) playPromise.catch(() => undefined);
};

const unlockPerformanceAudio = () => {
  performanceSequence?.unlockVoice();
  if (experienceState === EXPERIENCE_STATE.AR_TRACKING) {
    playPerformanceAudio();
    return;
  }

  performanceAudio.volume = 0.001;
  const playPromise = performanceAudio.play();
  if (!playPromise?.then) return;
  playPromise.then(() => {
    performanceAudio.pause();
    performanceAudio.currentTime = 0;
    performanceAudio.volume = PERFORMANCE_AUDIO_VOLUME;
  }).catch(() => undefined);
};

window.addEventListener("pointerdown", unlockPerformanceAudio, {
  once: true,
  passive: true,
});

const startModelAnimation = () => {
  if (animationStarted) return;
  animationStarted = true;

  if (mixer) {
    mixer.timeScale = 1;
    mixer.setTime(0);
  }

  animationActions.forEach((action) => {
    action.reset();
    action.play();
  });
  performanceSequence?.reset();
  santaFx?.play();
  playPerformanceAudio();
};

const christmasImageTargetPipelineModule = () => ({
  name: "chuangmei-christmas-image-target",

  listeners: [
    { event: "reality.imagefound", process: applyImageTargetPose },
    { event: "reality.imageupdated", process: applyImageTargetPose },
    { event: "reality.imagelost", process: hideImageTargetModel },
  ],

  onStart: () => {
    const { scene } = XR8.Threejs.xrScene();
    window.SantaWishOverlay?.init();
    performanceSequence = createSantaPerformanceSequence();

    scene.add(new THREE.AmbientLight(0xffffff, 1.8));

    const mainLight = new THREE.DirectionalLight(0xffffff, 2.2);
    mainLight.position.set(2, 4, 3);
    scene.add(mainLight);

    const fillLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
    scene.add(fillLight);

    new GLTFLoader().load(
      MODEL_URL,
      (gltf) => {
        prepareModel(gltf.scene);
        const anchor = new THREE.Group();
        anchor.name = "christmas-target-anchor";
        anchor.visible = false;
        anchor.add(gltf.scene);

        const modelBounds = new THREE.Box3().setFromObject(gltf.scene);
        santaFx = createSantaParticleFx({
          bounds: modelBounds,
          onVoiceStart: startSantaVoice,
          onLetterStart: startWishLetterFlight,
          onComplete: enterWishOverlay,
        });
        anchor.add(santaFx.group);

        if (gltf.animations.length) {
          mixer = new THREE.AnimationMixer(gltf.scene);
          animationActions = gltf.animations.map((clip) => {
            const action = mixer.clipAction(clip);
            action.setLoop(THREE.LoopOnce, 1);
            action.clampWhenFinished = true;
            return action;
          });
        } else {
          animationActions = [];
        }

        scene.add(anchor);
        modelRoot = anchor;
      },
      undefined,
      (error) => {
        console.error("[Christmas AR] Failed to load christmas.glb:", error);
      },
    );
  },

  onUpdate: () => {
    if (experienceState === EXPERIENCE_STATE.WISH_OVERLAY) return;
    if (!modelRoot?.visible) return;
    const deltaSeconds = Math.min(clock.getDelta(), 0.1);
    mixer?.update(deltaSeconds);
    santaFx?.update(deltaSeconds);
  },
});

const ensureXrController = () => {
  if (window.XR8?.XrController) return Promise.resolve();
  if (window.XR8?.loadChunk) return window.XR8.loadChunk("slam");
  return Promise.reject(new Error("XR8.XrController is not available."));
};

const startEngine = () => {
  if (xrStarted) return;
  xrStarted = true;

  ensureXrController()
    .then(() => {
      XR8.XrController.configure({
        imageTargetData: [IMAGE_TARGET_DATA],
        disableWorldTracking: true,
      });

      XR8.addCameraPipelineModules([
        XR8.GlTextureRenderer.pipelineModule(),
        XR8.Threejs.pipelineModule(),
        XR8.XrController.pipelineModule(),
        ...optionalPipelineModule(window.LandingPage),
        ...optionalPipelineModule(window.XRExtras?.FullWindowCanvas),
        ...optionalPipelineModule(window.XRExtras?.Loading),
        ...optionalPipelineModule(window.XRExtras?.RuntimeError),
        christmasImageTargetPipelineModule(),
      ]);

      XR8.run({
        canvas: getCameraCanvas(),
        allowedDevices: XR8.XrConfig.device().ANY,
      });
    })
    .catch((error) => {
      xrStarted = false;
      console.error("[Christmas AR] Failed to start 8th Wall Engine:", error);
    });
};

if (window.XR8) {
  startEngine();
} else {
  window.addEventListener("xrloaded", startEngine, { once: true });
}
