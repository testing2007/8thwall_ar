import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createSantaParticleFx } from "./santa-particle-fx.js";
import { createSantaPerformanceSequence } from "./santa-performance-sequence.js";
import "./santa-wish-overlay.js";

window.THREE = THREE;

const IMAGE_TARGET_DATA = require("../image-targets/target.json");
const MODEL_URL = require("./assets/christmas.glb");
const PERFORMANCE_AUDIO_URL = require("./assets/santa-bg-and-voice.mp3");
const POSTER_URL = require("./assets/poster.jpg");
const TARGET_NAME = "target";
const MODEL_TARGET_WIDTH_RATIO = 1;
const MODEL_SURFACE_OFFSET_METERS = 0.002;
const PERFORMANCE_AUDIO_VOLUME = 1;
const MODEL_ANIMATION_DURATION_MS = 5000;
const LETTER_FLIGHT_DURATION_MS = 500;

const EXPERIENCE_STATE = {
  SCANNING: "SCANNING",
  AR_TRACKING: "AR_TRACKING",
  WISH_OVERLAY: "WISH_OVERLAY",
};

const START_COVER_ID = "christmas-ar-start-cover";
const START_COVER_STYLE_ID = "christmas-ar-start-cover-style";

let modelRoot = null;
let mixer = null;
let animationActions = [];
let santaFx = null;
const performanceSequence = createSantaPerformanceSequence();
let normalizedModelScale = 1;
let xrRuntimeLoading = null;
let xrStarted = false;
let animationStarted = false;
let performanceAudioPlaying = false;
let animStartTimer = null; // 600 ms stabilisation before starting the performance
let performanceAudioUnlocked = false;
let performanceAudioUnlockPending = null;
let arStarting = false;
let performanceTimer = null;
let performanceRunId = 0;
let startCoverDismissed = false;
let startCoverRoot = null;
let pendingTargetDetail = null;
let experienceState = EXPERIENCE_STATE.SCANNING;
const clock = new THREE.Clock();
const performanceAudio = new Audio(PERFORMANCE_AUDIO_URL);

performanceAudio.loop = false;
performanceAudio.preload = "auto";
performanceAudio.playsInline = true;
performanceAudio.volume = 0;

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

const clearPerformanceTimer = () => {
  if (!performanceTimer) return;
  window.clearTimeout(performanceTimer);
  performanceTimer = null;
};

const cancelPerformanceTimeline = () => {
  performanceRunId += 1;
  clearPerformanceTimer();
};

const installStartCoverStyles = () => {
  if (document.getElementById(START_COVER_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = START_COVER_STYLE_ID;
  style.textContent = `
    #${START_COVER_ID} {
      position: fixed;
      inset: 0;
      z-index: 2147482000;
      display: grid;
      place-items: end center;
      padding: max(24px, env(safe-area-inset-top)) 22px max(44px, env(safe-area-inset-bottom));
      background:
        linear-gradient(180deg, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.16) 44%, rgba(0,0,0,0.62) 100%),
        var(--christmas-ar-poster);
      background-position: center;
      background-size: cover;
      color: #fff;
      font-family: "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
      opacity: 0;
      transition: opacity 220ms ease;
    }

    #${START_COVER_ID}.is-visible {
      opacity: 1;
    }

    #${START_COVER_ID}.is-hiding {
      opacity: 0;
      pointer-events: none;
    }

    #${START_COVER_ID} .ar-start-button {
      width: min(320px, 82vw);
      min-height: 54px;
      border: 0;
      border-radius: 999px;
      background: linear-gradient(180deg, #f7d46d, #d7223a 58%, #9b1426);
      color: #fff;
      cursor: pointer;
      font: inherit;
      font-size: 18px;
      font-weight: 800;
      letter-spacing: 0;
      touch-action: manipulation;
      box-shadow:
        0 18px 34px rgba(64, 0, 12, 0.38),
        inset 0 1px 0 rgba(255,255,255,0.38);
    }

    #${START_COVER_ID} .ar-start-button:active {
      transform: translateY(1px);
    }
  `;
  document.head.appendChild(style);
};

const removeStartCover = () => {
  if (!startCoverRoot) return;
  const cover = startCoverRoot;
  startCoverRoot = null;
  cover.classList.add("is-hiding");
  window.setTimeout(() => cover.remove(), 240);
};

const setStartCoverLoading = (loading) => {
  const button = startCoverRoot?.querySelector(".ar-start-button");
  if (!button) return;
  button.disabled = loading;
  button.textContent = loading ? "正在启动..." : "开始AR体验";
};

const finishStartCover = () => {
  startCoverDismissed = true;
  pendingTargetDetail = null;
  document.body.classList.remove("ar-camera-hidden");
  removeStartCover();
  window.dispatchEvent(new CustomEvent("christmas-ar:start-cover-dismissed"));
};

const startArFromCover = () => {
  if (arStarting || startCoverDismissed) return;
  arStarting = true;
  setStartCoverLoading(true);
  // Unlock the single merged track inside the user gesture so iOS can play it
  // later when the image target is found.
  if (!performanceAudioUnlocked && !performanceAudioUnlockPending) {
    performanceAudio.volume = 0;
    performanceAudioUnlockPending = performanceAudio.play().then(() => {
      performanceAudio.pause();
      performanceAudio.currentTime = 0;
      performanceAudio.volume = 0;
      performanceAudioUnlocked = true;
      performanceAudioUnlockPending = null;
    }).catch(() => {
      performanceAudioUnlocked = true;
      performanceAudioUnlockPending = null;
    });
  }

  finishStartCover();
  arStarting = false;
};

const showStartCover = () => {
  if (startCoverDismissed || startCoverRoot) return;
  installStartCoverStyles();

  const cover = document.createElement("div");
  cover.id = START_COVER_ID;
  cover.style.setProperty("--christmas-ar-poster", `url("${POSTER_URL}")`);
  cover.innerHTML = '<button class="ar-start-button" type="button">开始AR体验</button>';
  const button = cover.querySelector(".ar-start-button");
  button?.addEventListener("touchend", startArFromCover, { passive: true });
  button?.addEventListener("click", startArFromCover, { passive: true });
  document.body.appendChild(cover);
  startCoverRoot = cover;
  requestAnimationFrame(() => cover.classList.add("is-visible"));
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
  if (detail.name !== TARGET_NAME) return;
  if (!startCoverDismissed) {
    if (modelRoot) modelRoot.visible = false;
    return;
  }

  pendingTargetDetail = detail;
  if (!modelRoot) return;
  if (experienceState === EXPERIENCE_STATE.WISH_OVERLAY) return;

  const { position, rotation, scale = 1 } = detail;
  modelRoot.visible = true;
  modelRoot.position.set(position.x, position.y, position.z + MODEL_SURFACE_OFFSET_METERS);
  modelRoot.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
  modelRoot.scale.setScalar((scale > 0 ? scale : 1) * normalizedModelScale);

  if (experienceState !== EXPERIENCE_STATE.AR_TRACKING) {
    setExperienceState(EXPERIENCE_STATE.AR_TRACKING);
    // Require the target to be continuously tracked for 600 ms before starting
    // the performance sequence (animation + merged audio). This filters out:
    //   • 8th Wall's inertial tracking that keeps firing after the target leaves
    //     the frame (the engine fires imagelost ~2 s later, not immediately)
    //   • Accidental / brief detections when the camera sweeps past the target
    if (!animStartTimer && !animationStarted) {
      animStartTimer = window.setTimeout(() => {
        animStartTimer = null;
        if (experienceState === EXPERIENCE_STATE.AR_TRACKING && !animationStarted) {
          startModelAnimation();
        }
      }, 600);
    }
  }
};

const hideImageTargetModel = ({ detail }) => {
  if (detail.name !== TARGET_NAME) return;
  pendingTargetDetail = null;
  // Cancel the stabilisation timer BEFORE the modelRoot guard so that a brief
  // detection that fires imagelost before the model even loads never leaks.
  if (animStartTimer) { clearTimeout(animStartTimer); animStartTimer = null; }
  if (!modelRoot) return;
  if (experienceState === EXPERIENCE_STATE.WISH_OVERLAY) return;
  modelRoot.visible = false;
  animationStarted = false;
  cancelPerformanceTimeline();
  santaFx?.reset();
  performanceSequence?.reset();
  stopPerformanceAudio();
  setExperienceState(EXPERIENCE_STATE.SCANNING);
};

const enterWishOverlay = () => {
  if (experienceState === EXPERIENCE_STATE.WISH_OVERLAY) return;
  setExperienceState(EXPERIENCE_STATE.WISH_OVERLAY);

  if (modelRoot) modelRoot.visible = false;
  if (mixer) mixer.timeScale = 0;
  if (animStartTimer) { clearTimeout(animStartTimer); animStartTimer = null; }
  cancelPerformanceTimeline();
  santaFx?.reset();
  performanceSequence?.finishLetterFlight();
  stopPerformanceAudio();

  window.SantaWishOverlay?.show();
};

const startWishLetterFlight = (runId) => {
  if (runId !== performanceRunId || experienceState !== EXPERIENCE_STATE.AR_TRACKING) return;
  stopPerformanceAudio();
  performanceSequence?.startLetterFlight();
  clearPerformanceTimer();
  performanceTimer = window.setTimeout(() => {
    performanceTimer = null;
    if (runId === performanceRunId) enterWishOverlay();
  }, LETTER_FLIGHT_DURATION_MS);
};

const watchModelAnimationEnd = (runId) => {
  performanceTimer = window.setTimeout(() => {
    performanceTimer = null;
    if (runId !== performanceRunId) return;
    if (mixer) {
      mixer.setTime(MODEL_ANIMATION_DURATION_MS / 1000);
      mixer.timeScale = 0;
    }
    startWishLetterFlight(runId);
  }, MODEL_ANIMATION_DURATION_MS);
};

/** Start the merged background-and-voice track from the beginning. */
const startPerformanceAudio = () => {
  if (performanceAudioPlaying) {
    performanceAudio.volume = PERFORMANCE_AUDIO_VOLUME;
    return;
  }
  performanceAudioPlaying = true;

  const doPlay = () => {
    if (!performanceAudioPlaying) return;
    performanceAudio.currentTime = 0;
    performanceAudio.volume = PERFORMANCE_AUDIO_VOLUME;
    performanceAudio.play().catch(() => {
      performanceAudioPlaying = false;
    });
  };

  if (performanceAudioUnlockPending) {
    performanceAudioUnlockPending.then(doPlay);
  } else {
    doPlay();
  }
};

/** Stop all experience audio when tracking ends or before the HTML overlay. */
const stopPerformanceAudio = () => {
  performanceAudioPlaying = false;
  performanceAudio.pause();
  performanceAudio.currentTime = 0;
  performanceAudio.volume = 0;
};

const startModelAnimation = () => {
  if (animationStarted) return;
  animationStarted = true;
  cancelPerformanceTimeline();
  const runId = performanceRunId;

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
  startPerformanceAudio();
  watchModelAnimationEnd(runId);
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

        const modelBounds = new THREE.Box3().setFromObject(gltf.scene);
        santaFx = createSantaParticleFx({ bounds: modelBounds });
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
        if (startCoverDismissed && pendingTargetDetail) {
          applyImageTargetPose({ detail: pendingTargetDetail });
        }
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

const christmasStartGatePipelineModule = () => ({
  name: "chuangmei-christmas-start-gate",
  onCameraStatusChange: ({ status }) => {
    if (status === "hasStream" || status === "hasVideo") showStartCover();
  },
});

const ensureXrController = () => {
  if (window.XR8?.XrController) return Promise.resolve();
  if (window.XR8?.loadChunk) return window.XR8.loadChunk("slam");
  return Promise.reject(new Error("XR8.XrController is not available."));
};

const loadXrRuntime = () => {
  if (window.XR8) {
    return window.XR8.loadChunk ? window.XR8.loadChunk("slam") : Promise.resolve();
  }
  if (xrRuntimeLoading) return xrRuntimeLoading;

  xrRuntimeLoading = new Promise((resolve, reject) => {
    const existingScript = document.getElementById("xr-runtime-script");
    if (existingScript) {
      window.addEventListener("xrloaded", () => resolve(), { once: true });
      existingScript.addEventListener("error", reject, { once: true });
      return;
    }

    window.addEventListener("xrloaded", () => resolve(), { once: true });
    const script = document.createElement("script");
    script.id = "xr-runtime-script";
    script.async = true;
    script.crossOrigin = "anonymous";
    script.src = "./external/xr/xr.js";
    script.setAttribute("data-preload-chunks", "slam");
    script.addEventListener("error", () => reject(new Error("XR runtime failed to load.")), {
      once: true,
    });
    document.head.appendChild(script);
  });

  return xrRuntimeLoading;
};

const startEngine = () => {
  if (xrStarted) return Promise.resolve();
  xrStarted = true;

  return loadXrRuntime()
    .then(ensureXrController)
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
        christmasStartGatePipelineModule(),
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
      throw error;
    });
};

const bootExperience = () => {
  window.SantaWishOverlay?.init();
  startEngine().catch(() => undefined);
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootExperience, { once: true });
} else {
  bootExperience();
}
