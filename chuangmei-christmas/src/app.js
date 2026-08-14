import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import "./santa-wish-overlay.js";

window.THREE = THREE;

const IMAGE_TARGET_DATA = require("../image-targets/target.json");
const MODEL_URL = require("./assets/christmas.glb");
const TARGET_NAME = "target";
const MODEL_TARGET_WIDTH_RATIO = 1;
const MODEL_SURFACE_OFFSET_METERS = 0.002;
const DEFAULT_WISH_OVERLAY_DELAY_MS = 1500;
const MIN_WISH_OVERLAY_DELAY_MS = 600;
const MAX_WISH_OVERLAY_DELAY_MS = 1800;
const WISH_OVERLAY_AFTER_ANIMATION_EXTRA_MS = 80;

const EXPERIENCE_STATE = {
  SCANNING: "SCANNING",
  AR_TRACKING: "AR_TRACKING",
  WISH_OVERLAY: "WISH_OVERLAY",
};

let modelRoot = null;
let mixer = null;
let animationActions = [];
let wishOverlayDelayMs = DEFAULT_WISH_OVERLAY_DELAY_MS;
let normalizedModelScale = 1;
let xrStarted = false;
let animationStarted = false;
let wishOverlayTimer = null;
let experienceState = EXPERIENCE_STATE.SCANNING;
const clock = new THREE.Clock();

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

const clearWishOverlayTimer = () => {
  if (!wishOverlayTimer) return;
  window.clearTimeout(wishOverlayTimer);
  wishOverlayTimer = null;
};

const clampWishOverlayDelay = delayMs => Math.min(
  Math.max(delayMs, MIN_WISH_OVERLAY_DELAY_MS),
  MAX_WISH_OVERLAY_DELAY_MS,
);

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
  clearWishOverlayTimer();
  setExperienceState(EXPERIENCE_STATE.SCANNING);
};

const enterWishOverlay = () => {
  if (experienceState === EXPERIENCE_STATE.WISH_OVERLAY) return;
  clearWishOverlayTimer();
  setExperienceState(EXPERIENCE_STATE.WISH_OVERLAY);

  if (modelRoot) modelRoot.visible = false;
  if (mixer) mixer.timeScale = 0;

  window.SantaWishOverlay?.show({ from: "santa-gift" });
};

const startModelAnimation = () => {
  if (animationStarted) return;
  animationStarted = true;
  clearWishOverlayTimer();

  if (mixer) {
    mixer.timeScale = 1;
    mixer.setTime(0);
  }

  animationActions.forEach((action) => {
    action.reset();
    action.play();
  });

  wishOverlayTimer = window.setTimeout(
    enterWishOverlay,
    wishOverlayDelayMs + WISH_OVERLAY_AFTER_ANIMATION_EXTRA_MS,
  );
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

        if (gltf.animations.length) {
          mixer = new THREE.AnimationMixer(gltf.scene);
          animationActions = gltf.animations.map((clip) => {
            const action = mixer.clipAction(clip);
            action.setLoop(THREE.LoopOnce, 1);
            action.clampWhenFinished = true;
            return action;
          });
          const animationDurationMs = Math.max(
            ...gltf.animations.map(clip => clip.duration * 1000),
          );
          wishOverlayDelayMs = Number.isFinite(animationDurationMs)
            ? clampWishOverlayDelay(animationDurationMs)
            : DEFAULT_WISH_OVERLAY_DELAY_MS;
        } else {
          animationActions = [];
          wishOverlayDelayMs = DEFAULT_WISH_OVERLAY_DELAY_MS;
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
    if (!mixer || !modelRoot?.visible) return;
    mixer.update(Math.min(clock.getDelta(), 0.1));
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
