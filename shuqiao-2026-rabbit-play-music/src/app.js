import * as THREE from "three";

window.THREE = THREE;

const IMAGE_TARGET_DATA = require("../image-targets/target.json");
const TARGET_NAME = "target";
const VIDEO_ASPECT_RATIO = 722 / 514;
const VIDEO_SURFACE_OFFSET_METERS = 0.002;

let videoAnchor = null;
let targetVisible = false;
let mediaUnlockPromise = null;
let soundRetryInstalled = false;
let xrRuntimeLoading = null;
let xrStarted = false;
let arStarting = false;

const getTargetVideo = () => document.getElementById("target-video");

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

const setScanStatus = (message, visible = true) => {
  const status = document.getElementById("scan-status");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("is-visible", visible);
};

const prepareTargetVideo = () => {
  const video = getTargetVideo();
  if (!video) return null;

  video.muted = false;
  video.defaultMuted = false;
  video.preload = "none";
  video.volume = 1;
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  return video;
};

const installSoundRetry = () => {
  if (soundRetryInstalled) return;
  soundRetryInstalled = true;

  document.addEventListener(
    "click",
    () => {
      soundRetryInstalled = false;
      const video = prepareTargetVideo();
      if (!video || !targetVisible) return;

      const playPromise = video.play();
      if (playPromise?.then) {
        playPromise
          .then(() => {
            video.dataset.audioUnlocked = "true";
            setScanStatus("", false);
          })
          .catch((error) => {
            console.warn(
              "[Image Target AR] Sound retry was blocked:",
              error,
            );
            setScanStatus("Tap the screen to enable sound.");
            installSoundRetry();
          });
      }
    },
    { once: true, passive: true },
  );
};

const playTargetVideo = () => {
  const video = getTargetVideo();
  if (!video || !targetVisible) return;

  if (video.ended) video.currentTime = 0;
  video.muted = false;
  video.defaultMuted = false;
  video.volume = 1;

  const playPromise = video.play();
  if (playPromise?.then) {
    playPromise
      .then(() => setScanStatus("", false))
      .catch((error) => {
        console.warn("[Image Target AR] Video playback was blocked:", error);
        setScanStatus("Tap the screen to enable sound.");
        installSoundRetry();
      });
  }
};

const unlockVideoAudio = (video) => {
  if (!video || video.dataset.audioUnlocked === "true") {
    return Promise.resolve();
  }
  if (mediaUnlockPromise) return mediaUnlockPromise;

  video.muted = false;
  video.defaultMuted = false;
  video.volume = 0;

  try {
    const playPromise = video.play();
    mediaUnlockPromise = Promise.resolve(playPromise)
      .then(() => {
        video.pause();
        video.currentTime = 0;
        video.volume = 1;
        video.dataset.audioUnlocked = "true";
        if (targetVisible) playTargetVideo();
      })
      .catch((error) => {
        video.muted = true;
        video.defaultMuted = true;
        video.volume = 1;
        console.warn(
          "[Image Target AR] Audio unlock failed; using muted playback:",
          error,
        );
      });
  } catch (error) {
    video.muted = true;
    video.defaultMuted = true;
    video.volume = 1;
    console.warn(
      "[Image Target AR] Audio unlock failed; using muted playback:",
      error,
    );
    mediaUnlockPromise = Promise.resolve();
  }

  return mediaUnlockPromise;
};

const applyImageTargetPose = ({ detail }) => {
  if (!videoAnchor || detail.name !== TARGET_NAME) return;

  const { position, rotation, scale = 1 } = detail;
  videoAnchor.visible = true;
  videoAnchor.position.set(
    position.x,
    position.y,
    position.z + VIDEO_SURFACE_OFFSET_METERS,
  );
  videoAnchor.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
  videoAnchor.scale.setScalar(scale > 0 ? scale : 1);
};

const handleImageFound = (event) => {
  if (event.detail.name !== TARGET_NAME) return;
  targetVisible = true;
  applyImageTargetPose(event);
  playTargetVideo();
};

const handleImageLost = ({ detail }) => {
  if (detail.name !== TARGET_NAME) return;
  targetVisible = false;
  if (videoAnchor) videoAnchor.visible = false;
  getTargetVideo()?.pause();
  setScanStatus("Point your camera at the artwork.");
};

const createVideoAnchor = (scene) => {
  const video = prepareTargetVideo();
  if (!video) throw new Error("Target video element was not found.");

  const texture = new THREE.VideoTexture(video);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const geometry = new THREE.PlaneGeometry(1, 1 / VIDEO_ASPECT_RATIO);
  const plane = new THREE.Mesh(geometry, material);
  plane.name = "target-video-plane";

  videoAnchor = new THREE.Group();
  videoAnchor.name = "image-target-video-anchor";
  videoAnchor.visible = false;
  videoAnchor.add(plane);
  scene.add(videoAnchor);
};

const engineImageTargetPipelineModule = () => ({
  name: "engine-image-target-video",

  listeners: [
    { event: "reality.imagefound", process: handleImageFound },
    { event: "reality.imageupdated", process: applyImageTargetPose },
    { event: "reality.imagelost", process: handleImageLost },
  ],

  onStart: () => {
    const { scene } = XR8.Threejs.xrScene();
    createVideoAnchor(scene);
    setScanStatus("Point your camera at the artwork.");
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

  const video = prepareTargetVideo();
  unlockVideoAudio(video);

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
