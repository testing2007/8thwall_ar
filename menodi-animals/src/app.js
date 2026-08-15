import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

window.THREE = THREE;

const IMAGE_TARGET_DATA = require("../image-targets/lion-meno.json");
const MODEL_URL = require("./assets/lion-meno.glb");
const AUDIO_URL = require("./assets/lion-meno-voice.mp3");
const SUBTITLE_URL = require("./assets/lion-meno-voice.srt");
const TARGET_NAME = "lion-meno";
const MODEL_TARGET_WIDTH_RATIO = 1;
const MODEL_SURFACE_OFFSET_METERS = 0.002;
const SUBTITLE_CANVAS_WIDTH = 1024;
const SUBTITLE_CANVAS_HEIGHT = 256;

let modelRoot = null;
let mixer = null;
let normalizedModelScale = 1;
let subtitleMesh = null;
let subtitleTexture = null;
let subtitleCanvas = null;
let subtitleContext = null;
let subtitleCues = [];
let activeSubtitleIndex = -1;
let subtitlesReady = false;
let targetVisible = false;
let targetFoundAfterStart = false;
let experienceEnabled = false;
let audioUnlocked = false;
let audioUnlocking = null;
let storyAudioContext = null;
let storyAudioBuffer = null;
let storyAudioLoadPromise = null;
let storyAudioSource = null;
let storyAudioGain = null;
let storyAudioStartedAt = 0;
let storyAudioOffset = 0;
let storyAudioPlaying = false;
let storyAudioEnded = false;
let storyAudioPlayToken = 0;
let xrRuntimeLoading = null;
let xrStarted = false;
let arStarting = false;
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

const parseSrtTime = (value) => {
  const [hours = "0", minutes = "0", seconds = "0"] = value
    .trim()
    .replace(",", ".")
    .split(":");
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
};

const parseSrt = (source) =>
  source
    .replace(/^\uFEFF/, "")
    .trim()
    .split(/\r?\n\s*\r?\n/)
    .map((block) => {
      const lines = block.split(/\r?\n/);
      const timingIndex = lines.findIndex((line) => line.includes("-->"));
      if (timingIndex < 0) return null;
      const [start, end] = lines[timingIndex].split("-->").map(parseSrtTime);
      const text = lines.slice(timingIndex + 1).join(" ").trim();
      return Number.isFinite(start) && Number.isFinite(end) && text
        ? { start, end, text }
        : null;
    })
    .filter(Boolean);

const loadSubtitles = () =>
  fetch(SUBTITLE_URL)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Subtitle request failed with ${response.status}.`);
      }
      return response.text();
    })
    .then((source) => {
      subtitleCues = parseSrt(source);
    })
    .catch((error) => {
      console.error("[Meno AR] Failed to load subtitles:", error);
      subtitleCues = [];
    })
    .finally(() => {
      subtitlesReady = true;
      tryStartStory();
    });

const wrapSubtitleText = (context, text, maxWidth) => {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";

  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  });
  if (line) lines.push(line);
  return lines.slice(0, 3);
};

const drawRoundedRect = (context, x, y, width, height, radius) => {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(
    x + width,
    y + height,
    x + width - radius,
    y + height,
  );
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
  context.fill();
  context.stroke();
};

const drawSubtitle = (text) => {
  if (!subtitleContext || !subtitleTexture) return;

  const context = subtitleContext;
  context.clearRect(0, 0, SUBTITLE_CANVAS_WIDTH, SUBTITLE_CANVAS_HEIGHT);
  if (!text) {
    subtitleTexture.needsUpdate = true;
    return;
  }

  context.fillStyle = "rgba(12, 9, 24, 0.84)";
  context.strokeStyle = "rgba(255, 211, 98, 0.9)";
  context.lineWidth = 5;
  drawRoundedRect(context, 24, 22, 976, 212, 38);

  context.font = '700 58px "Arial Rounded MT Bold", Arial, sans-serif';
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "#fffaf0";
  context.shadowColor = "rgba(0, 0, 0, 0.75)";
  context.shadowBlur = 12;
  const lines = wrapSubtitleText(context, text, 880);
  const lineHeight = 68;
  const firstLineY =
    SUBTITLE_CANVAS_HEIGHT / 2 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, index) => {
    context.fillText(
      line,
      SUBTITLE_CANVAS_WIDTH / 2,
      firstLineY + index * lineHeight,
    );
  });
  context.shadowBlur = 0;
  subtitleTexture.needsUpdate = true;
};

const createSubtitleMesh = () => {
  subtitleCanvas = document.createElement("canvas");
  subtitleCanvas.width = SUBTITLE_CANVAS_WIDTH;
  subtitleCanvas.height = SUBTITLE_CANVAS_HEIGHT;
  subtitleContext = subtitleCanvas.getContext("2d");
  subtitleTexture = new THREE.CanvasTexture(subtitleCanvas);
  subtitleTexture.colorSpace = THREE.SRGBColorSpace;
  subtitleTexture.minFilter = THREE.LinearFilter;
  subtitleTexture.generateMipmaps = false;

  const material = new THREE.MeshBasicMaterial({
    map: subtitleTexture,
    transparent: true,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 0.34), material);
  mesh.name = "meno-3d-subtitles";
  mesh.position.set(0, -0.62, 0.38);
  mesh.renderOrder = 1000;
  mesh.visible = false;
  return mesh;
};

const setSubtitle = (index) => {
  if (index === activeSubtitleIndex) return;
  activeSubtitleIndex = index;
  const cue = index >= 0 ? subtitleCues[index] : null;
  drawSubtitle(cue?.text || "");
  if (subtitleMesh) subtitleMesh.visible = Boolean(cue && targetVisible);
};

const updateSubtitleFromAudio = () => {
  if (!subtitleMesh || !targetVisible || !storyAudioPlaying) {
    if (subtitleMesh) subtitleMesh.visible = false;
    return;
  }

  const time = getStoryAudioTime();
  const cueIndex = subtitleCues.findIndex(
    (cue) => time >= cue.start && time < cue.end,
  );
  setSubtitle(cueIndex);
  subtitleMesh.visible = cueIndex >= 0;
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
  model.name = "meno-lion";
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
  model.scale.setScalar(normalizedModelScale);
};

const playStory = () => {
  if (
    !audioUnlocked ||
    !targetVisible ||
    storyAudioEnded ||
    storyAudioPlaying
  ) {
    return;
  }

  if (!storyAudioBuffer) {
    void loadStoryAudioBuffer()
      .then(() => tryStartStory())
      .catch((error) => {
        console.warn("[Meno AR] Failed to load story audio:", error);
      });
    return;
  }

  const context = ensureStoryAudioContext();
  if (!context) return;
  if (context.state === "suspended") {
    void context.resume().then(() => tryStartStory()).catch(() => undefined);
    return;
  }

  const source = context.createBufferSource();
  const gain = context.createGain();
  const playToken = ++storyAudioPlayToken;
  source.buffer = storyAudioBuffer;
  gain.gain.value = 1;
  source.connect(gain);
  gain.connect(context.destination);
  source.onended = () => {
    if (playToken !== storyAudioPlayToken || storyAudioSource !== source) return;
    storyAudioPlaying = false;
    storyAudioEnded = true;
    storyAudioOffset = storyAudioBuffer.duration;
    storyAudioSource = null;
    storyAudioGain = null;
    source.disconnect();
    gain.disconnect();
    setSubtitle(-1);
  };

  storyAudioSource = source;
  storyAudioGain = gain;
  storyAudioPlaying = true;
  storyAudioEnded = false;
  storyAudioStartedAt = context.currentTime;
  source.start(0, Math.min(storyAudioOffset, storyAudioBuffer.duration - 0.001));
};

function tryStartStory() {
  if (
    !experienceEnabled ||
    !targetVisible ||
    !modelRoot ||
    !subtitlesReady
  ) {
    return;
  }
  playStory();
}

const pauseStory = () => {
  if (storyAudioPlaying) {
    storyAudioOffset = getStoryAudioTime();
    storyAudioPlaying = false;
    storyAudioPlayToken += 1;
    const source = storyAudioSource;
    const gain = storyAudioGain;
    storyAudioSource = null;
    storyAudioGain = null;
    if (source) {
      source.onended = null;
      try {
        source.stop(0);
      } catch {
        // The source may already have ended.
      }
      source.disconnect();
    }
    gain?.disconnect();
  }
  setSubtitle(-1);
  if (subtitleMesh) subtitleMesh.visible = false;
};

const applyImageTargetPose = ({ detail }) => {
  if (detail.name !== TARGET_NAME) return;
  targetVisible = true;

  if (modelRoot) {
    const { position, rotation, scale = 1 } = detail;
    modelRoot.visible = experienceEnabled;
    modelRoot.position.set(
      position.x,
      position.y,
      position.z + MODEL_SURFACE_OFFSET_METERS,
    );
    modelRoot.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
    modelRoot.scale.setScalar(scale > 0 ? scale : 1);
  }

  tryStartStory();
};

const handleImageTargetFound = (event) => {
  if (event.detail.name !== TARGET_NAME) return;
  if (!experienceEnabled) {
    targetVisible = false;
    targetFoundAfterStart = false;
    if (modelRoot) modelRoot.visible = false;
    return;
  }
  targetFoundAfterStart = true;
  if (storyAudioEnded) {
    storyAudioOffset = 0;
    storyAudioEnded = false;
    setSubtitle(-1);
  }
  applyImageTargetPose(event);
};

const handleImageTargetUpdated = (event) => {
  if (!targetFoundAfterStart) return;
  applyImageTargetPose(event);
};

const hideImageTargetModel = ({ detail }) => {
  if (detail.name !== TARGET_NAME) return;
  targetFoundAfterStart = false;
  targetVisible = false;
  if (modelRoot) modelRoot.visible = false;
  pauseStory();
};

const showIntroScreen = () => {
  document.getElementById("ar-intro-screen")?.classList.add("is-visible");
};

const startGatePipelineModule = () => ({
  name: "menodi-lion-start-gate",
  onCameraStatusChange: ({ status }) => {
    if (status === "hasStream" || status === "hasVideo") showIntroScreen();
  },
});

const engineImageTargetPipelineModule = () => ({
  name: "menodi-lion-image-target",

  listeners: [
    { event: "reality.imagefound", process: handleImageTargetFound },
    { event: "reality.imageupdated", process: handleImageTargetUpdated },
    { event: "reality.imagelost", process: hideImageTargetModel },
  ],

  onStart: () => {
    const { scene } = XR8.Threejs.xrScene();

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
        anchor.name = "image-target-anchor";
        anchor.visible = false;
        anchor.add(gltf.scene);
        subtitleMesh = createSubtitleMesh();
        anchor.add(subtitleMesh);

        if (gltf.animations.length) {
          mixer = new THREE.AnimationMixer(gltf.scene);
          gltf.animations.forEach((clip) => {
            const action = mixer.clipAction(clip);
            action.play();
          });
        }

        scene.add(anchor);
        modelRoot = anchor;
        tryStartStory();
      },
      undefined,
      (error) => {
        console.error("[Meno AR] Failed to load GLB model:", error);
      },
    );
  },

  onUpdate: () => {
    const delta = Math.min(clock.getDelta(), 0.1);
    if (mixer && modelRoot?.visible) mixer.update(delta);
    if (subtitleMesh && modelRoot?.visible) {
      const { camera } = XR8.Threejs.xrScene();
      subtitleMesh.lookAt(camera.position);
      subtitleMesh.rotateZ(Math.PI);
    }
    updateSubtitleFromAudio();
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
        startGatePipelineModule(),
        engineImageTargetPipelineModule(),
      ]);

      XR8.run({
        canvas: getCameraCanvas(),
        allowedDevices: XR8.XrConfig.device().ANY,
      });
    })
    .catch((error) => {
      xrStarted = false;
      console.error("[Meno AR] Failed to start 8th Wall Engine:", error);
      throw error;
    });
};

const ensureStoryAudioContext = () => {
  if (storyAudioContext) return storyAudioContext;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  storyAudioContext = new AudioContextClass();
  return storyAudioContext;
};

const loadStoryAudioBuffer = () => {
  if (storyAudioBuffer) return Promise.resolve(storyAudioBuffer);
  if (storyAudioLoadPromise) return storyAudioLoadPromise;

  const context = ensureStoryAudioContext();
  if (!context) return Promise.reject(new Error("Web Audio API is unavailable."));

  storyAudioLoadPromise = fetch(AUDIO_URL, { cache: "force-cache" })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Story audio request failed with ${response.status}.`);
      }
      return response.arrayBuffer();
    })
    .then(
      (arrayBuffer) =>
        new Promise((resolve, reject) => {
          const result = context.decodeAudioData(
            arrayBuffer.slice(0),
            resolve,
            reject,
          );
          if (result?.then) result.then(resolve, reject);
        }),
    )
    .then((audioBuffer) => {
      storyAudioBuffer = audioBuffer;
      return audioBuffer;
    })
    .catch((error) => {
      storyAudioLoadPromise = null;
      throw error;
    });

  return storyAudioLoadPromise;
};

const getStoryAudioTime = () => {
  if (!storyAudioBuffer) return storyAudioOffset;
  if (!storyAudioPlaying || !storyAudioContext) return storyAudioOffset;
  return Math.min(
    storyAudioBuffer.duration,
    storyAudioOffset + (storyAudioContext.currentTime - storyAudioStartedAt),
  );
};

const unlockStoryAudio = () => {
  if (audioUnlocked) return Promise.resolve();
  if (audioUnlocking) return audioUnlocking;

  const context = ensureStoryAudioContext();
  if (!context) return Promise.reject(new Error("Web Audio API is unavailable."));

  // Only unlock Web Audio here. The story MP3 is never played before imagefound.
  const resumePromise = context.resume();
  const silentSource = context.createBufferSource();
  const silentGain = context.createGain();
  silentSource.buffer = context.createBuffer(1, 1, 22050);
  silentGain.gain.value = 0;
  silentSource.connect(silentGain);
  silentGain.connect(context.destination);
  silentSource.onended = () => {
    silentSource.disconnect();
    silentGain.disconnect();
  };
  silentSource.start(0);

  audioUnlocking = Promise.resolve(resumePromise)
    .then(() => {
      audioUnlocked = true;
      void loadStoryAudioBuffer().catch((error) => {
        console.warn("[Meno AR] Failed to preload story audio:", error);
      });
    })
    .catch((error) => {
      audioUnlocking = null;
      throw error;
    });
  return audioUnlocking;
};

const setStartButtonLoading = (loading, failed = false) => {
  const button = document.getElementById("ar-start-button");
  if (!button) return;
  button.disabled = loading;
  button.textContent = loading
    ? "正在开启…"
    : failed
      ? "再次点击开启"
      : "开启AR体验";
};

const hideIntroScreen = () => {
  document.getElementById("ar-intro-screen")?.classList.remove("is-visible");
};

const startArExperience = () => {
  if (arStarting || experienceEnabled) return;
  arStarting = true;
  setStartButtonLoading(true);

  // This call starts synchronously in the click stack to unlock audible playback on iOS.
  unlockStoryAudio()
    .then(() => {
      experienceEnabled = true;
      targetFoundAfterStart = false;
      targetVisible = false;
      arStarting = false;
      document.body.classList.remove("ar-camera-hidden");
      hideIntroScreen();
      if (modelRoot) modelRoot.visible = false;
      pauseStory();
    })
    .catch((error) => {
      arStarting = false;
      console.warn("[Meno AR] Audio unlock failed:", error);
      setStartButtonLoading(false, true);
    });
};

const bootstrap = () => {
  const button = document.getElementById("ar-start-button");
  button?.addEventListener("click", startArExperience, { passive: true });
  loadSubtitles();
  startEngine().catch(() => undefined);
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
} else {
  bootstrap();
}
