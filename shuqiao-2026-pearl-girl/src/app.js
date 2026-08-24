import * as THREE from "three";

window.THREE = THREE;

const IMAGE_TARGET_DATA = require("../image-targets/target.json");
const TARGET_VIDEO_URL = require("./assets/output.mp4");
const TARGET_NAME = "target";
const TARGET_PROPERTIES = IMAGE_TARGET_DATA.properties;
const TARGET_ASPECT = 5 / 7;
const TRACKED_TARGET_HEIGHT = TARGET_PROPERTIES.height;
const VIDEO_PLANE_WIDTH_PX = TARGET_PROPERTIES.width;
const VIDEO_PLANE_HEIGHT_PX = VIDEO_PLANE_WIDTH_PX / TARGET_ASPECT;

// detail.scale is the tracked target's longest edge. For this portrait target,
// that is the cropped recognition height (666), not its width (500).
const TRACKED_CENTER_X = TARGET_PROPERTIES.left + TARGET_PROPERTIES.width / 2;
const TRACKED_CENTER_Y = TARGET_PROPERTIES.top + TARGET_PROPERTIES.height / 2;
const FULL_CENTER_X = VIDEO_PLANE_WIDTH_PX / 2;
const FULL_CENTER_Y = VIDEO_PLANE_HEIGHT_PX / 2;
const FULL_PLANE_CENTER_X =
  (FULL_CENTER_X - TRACKED_CENTER_X) / TRACKED_TARGET_HEIGHT;
const FULL_PLANE_CENTER_Y =
  -(FULL_CENTER_Y - TRACKED_CENTER_Y) / TRACKED_TARGET_HEIGHT;

let videoRoot = null;
let targetVideo = null;
let targetVisible = false;
let xrRuntimeLoading = null;
let xrStarted = false;
let arStarting = false;

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

const prepareTargetVideo = () => {
  if (targetVideo) return targetVideo;

  const video = document.createElement("video");
  video.src = TARGET_VIDEO_URL;
  video.loop = true;
  video.preload = "none";
  video.crossOrigin = "anonymous";
  video.playsInline = true;
  video.muted = false;
  video.defaultMuted = false;
  video.volume = 1;
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");

  targetVideo = video;
  return video;
};

// The Start AR tap gives Safari permission to play the video's audio later.
const unlockTargetVideoAudio = () => {
  const video = prepareTargetVideo();
  if (video.dataset.audioUnlocked === "true") return;

  video.muted = false;
  video.defaultMuted = false;
  video.volume = 0;

  const playPromise = video.play();
  if (!playPromise?.then) {
    video.pause();
    video.currentTime = 0;
    video.volume = 1;
    video.dataset.audioUnlocked = "true";
    return;
  }

  playPromise
    .then(() => {
      if (!targetVisible) {
        video.pause();
        video.currentTime = 0;
      }
      video.volume = 1;
      video.dataset.audioUnlocked = "true";
    })
    .catch((error) => {
      video.muted = true;
      video.volume = 1;
      console.warn(
        "[Image Target AR] Audio unlock failed; video will play muted.",
        error,
      );
    });
};

const createVideoPlane = () => {
  const video = prepareTargetVideo();
  const texture = new THREE.VideoTexture(video);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;

  const geometry = new THREE.PlaneGeometry(
    VIDEO_PLANE_WIDTH_PX / TRACKED_TARGET_HEIGHT,
    VIDEO_PLANE_HEIGHT_PX / TRACKED_TARGET_HEIGHT,
  );
  geometry.translate(FULL_PLANE_CENTER_X, FULL_PLANE_CENTER_Y, 0);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.DoubleSide,
    toneMapped: false,
  });

  videoRoot = new THREE.Mesh(geometry, material);
  videoRoot.name = "target-video-plane";
  videoRoot.visible = false;
  return videoRoot;
};

const playTargetVideo = () => {
  const video = prepareTargetVideo();
  const playPromise = video.play();
  if (!playPromise?.catch) return;

  playPromise.catch(() => {
    video.muted = true;
    void video.play().catch((error) => {
      console.warn("[Image Target AR] Video playback failed.", error);
    });
  });
};

const applyImageTargetPose = ({ detail }) => {
  if (!videoRoot || detail.name !== TARGET_NAME) return;

  const { position, rotation, scale = 1 } = detail;
  videoRoot.visible = true;
  videoRoot.position.set(position.x, position.y, position.z);
  videoRoot.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
  videoRoot.scale.setScalar(scale > 0 ? scale : 1);

  if (!targetVisible) {
    targetVisible = true;
    playTargetVideo();
  }
};

const hideTargetVideo = ({ detail }) => {
  if (!videoRoot || detail.name !== TARGET_NAME) return;
  targetVisible = false;
  videoRoot.visible = false;
  targetVideo?.pause();
};

const engineImageTargetPipelineModule = () => ({
  name: "engine-image-target-video",

  listeners: [
    { event: "reality.imagefound", process: applyImageTargetPose },
    { event: "reality.imageupdated", process: applyImageTargetPose },
    { event: "reality.imagelost", process: hideTargetVideo },
  ],

  onStart: () => {
    const { scene } = XR8.Threejs.xrScene();
    scene.add(createVideoPlane());
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
        engineImageTargetPipelineModule(),
      ]);

      XR8.run({
        canvas: getCameraCanvas(),
        allowedDevices: XR8.XrConfig.device().ANY,
      });
    })
    .catch((error) => {
      xrStarted = false;
      console.error(
        "[Image Target AR] Failed to start 8th Wall Engine:",
        error,
      );
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
  unlockTargetVideoAudio();
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

  button.addEventListener("touchend", startArFromButton, { passive: true });
  button.addEventListener("click", startArFromButton, { passive: true });
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", installStartButton, {
    once: true,
  });
} else {
  installStartButton();
}
