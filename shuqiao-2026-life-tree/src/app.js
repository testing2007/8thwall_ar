import * as THREE from "three";
import { AudioManager } from "./audio/audio-manager";
import { CONFIG } from "./config";
import { StandaloneCalibrationPreview } from "./debug/standalone-calibration-preview";
import { LifeTreeAr } from "./life-tree-ar";
import { resolveResourceUrl } from "./utils/resource-url";

window.THREE = THREE;

const IMAGE_TARGET_DATA = require("../image-targets/target.json");
let experience = null;
let xrRuntimeLoading = null;
let xrStarted = false;
let arStarting = false;
let debugPreview = null;
const clock = new THREE.Clock(false);
const audioManager = new AudioManager(
  CONFIG.experienceTimeline.data.resources
    .filter((resource) => resource.type === "audio")
    .map((resource) => ({
      ...resource,
      url: resolveResourceUrl(resource.src),
    })),
);

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

const lifeTreePipelineModule = () => ({
  name: "life-tree-image-target",

  listeners: [
    {
      event: "reality.imagefound",
      process: ({ detail }) => experience?.onTargetFound(detail),
    },
    {
      event: "reality.imageupdated",
      process: ({ detail }) => experience?.onTargetUpdated(detail),
    },
    {
      event: "reality.imagelost",
      process: ({ detail }) => experience?.onTargetLost(detail),
    },
  ],

  onStart: () => {
    debugPreview?.dispose();
    debugPreview = null;
    const { scene, camera } = XR8.Threejs.xrScene();
    experience?.dispose();
    experience = new LifeTreeAr(scene, camera, getCameraCanvas(), {
      audioController: audioManager,
    });
    clock.start();
  },

  onUpdate: () => {
    if (!experience) return;
    const delta = Math.min(
      clock.getDelta(),
      CONFIG.performance.maxDeltaSeconds,
    );
    experience.update(delta);
  },

  onDetach: () => {
    clock.stop();
    experience?.dispose();
    experience = null;
  },
});

const ensureXrController = () => {
  if (window.XR8?.XrController) return Promise.resolve();
  if (window.XR8?.loadChunk) return window.XR8.loadChunk("slam");
  return Promise.reject(new Error("XR8.XrController is not available."));
};

const loadXrRuntime = () => {
  if (window.XR8) {
    return window.XR8.loadChunk
      ? window.XR8.loadChunk("slam")
      : Promise.resolve();
  }
  if (xrRuntimeLoading) return xrRuntimeLoading;

  xrRuntimeLoading = new Promise((resolve, reject) => {
    const existingScript = document.getElementById("xr-runtime-script");
    if (existingScript) {
      window.addEventListener("xrloaded", resolve, { once: true });
      existingScript.addEventListener("error", reject, { once: true });
      return;
    }

    window.addEventListener("xrloaded", resolve, { once: true });
    const script = document.createElement("script");
    script.id = "xr-runtime-script";
    script.async = true;
    script.crossOrigin = "anonymous";
    script.src = "./external/xr/xr.js";
    script.setAttribute("data-preload-chunks", "slam");
    script.addEventListener(
      "error",
      () => reject(new Error("XR runtime failed to load.")),
      { once: true },
    );
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
        lifeTreePipelineModule(),
      ]);

      XR8.run({
        canvas: getCameraCanvas(),
        allowedDevices: XR8.XrConfig.device().ANY,
      });
    })
    .catch((error) => {
      xrStarted = false;
      console.error("[Life Tree AR] Failed to start 8th Wall Engine:", error);
      throw error;
    });
};

const setStartButtonLoading = (loading) => {
  const button = document.getElementById("template-start-button");
  if (!button) return;
  button.disabled = loading;
  button.textContent = loading ? "Starting..." : "Start AR";
};

const hideStartScreen = () => {
  document.getElementById("template-start-screen")?.classList.add("is-hidden");
};

const startArFromButton = () => {
  if (arStarting || xrStarted) return;
  arStarting = true;
  setStartButtonLoading(true);
  audioManager.unlock();
  startEngine()
    .then(() => {
      arStarting = false;
      hideStartScreen();
    })
    .catch(() => {
      arStarting = false;
      setStartButtonLoading(false);
    });
};

const installStartButton = () => {
  const button = document.getElementById("template-start-button");
  if (!button) return;
  button.addEventListener("click", startArFromButton, { passive: true });
};

const startStandaloneCalibration = () => {
  if (!CONFIG.debug || debugPreview) return;
  hideStartScreen();
  debugPreview = new StandaloneCalibrationPreview(
    getCameraCanvas(),
    audioManager,
  );
};

const bootstrap = () => {
  installStartButton();
  startStandaloneCalibration();
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap, {
    once: true,
  });
} else {
  bootstrap();
}
