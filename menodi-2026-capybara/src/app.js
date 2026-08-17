import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  CHARACTER_LIST,
  CHARACTERS_BY_TARGET_NAME,
} from "./characters.js";

window.THREE = THREE;

const SUBTITLE_CANVAS_WIDTH = 1024;
const SUBTITLE_CANVAS_HEIGHT = 256;
const characterResourceCache = new Map();
const clock = new THREE.Clock();

let arScene = null;
let activeCharacter = null;
let activeResource = null;
let activeTargetDetail = null;
let activeTargetVisible = false;
let targetFoundAfterStart = false;
let activationToken = 0;

let experienceEnabled = false;
let audioUnlocked = false;
let audioUnlocking = null;
let storyAudioContext = null;
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

const logPrefix = (character = activeCharacter) =>
  `[MENODI AR${character ? `:${character.id}` : ""}]`;

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
      const text = lines
        .slice(timingIndex + 1)
        .join(" ")
        .trim();
      return Number.isFinite(start) && Number.isFinite(end) && text
        ? { start, end, text }
        : null;
    })
    .filter(Boolean);

const fetchText = (url, label) =>
  fetch(url, { cache: "force-cache" }).then((response) => {
    if (!response.ok) {
      throw new Error(`${label} request failed with ${response.status}.`);
    }
    return response.text();
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

const drawSubtitle = (resource, text) => {
  const { subtitleContext: context, subtitleTexture: texture } = resource;
  context.clearRect(0, 0, SUBTITLE_CANVAS_WIDTH, SUBTITLE_CANVAS_HEIGHT);

  if (!text) {
    texture.needsUpdate = true;
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
  texture.needsUpdate = true;
};

const createSubtitleMesh = (character) => {
  const canvas = document.createElement("canvas");
  canvas.width = SUBTITLE_CANVAS_WIDTH;
  canvas.height = SUBTITLE_CANVAS_HEIGHT;

  const context = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 0.34), material);
  mesh.name = `${character.id}-3d-subtitles`;
  mesh.position.set(0, -0.62, 0.38);
  mesh.renderOrder = 1000;
  mesh.visible = false;

  return { mesh, context, texture };
};

const normalizeModelSize = (model, targetWidthRatio) => {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z, 0.0001);

  model.position.sub(center);
  model.scale.setScalar(targetWidthRatio / maxDimension);
};

const prepareModel = (model, character) => {
  model.name = `${character.id}-model`;
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
  normalizeModelSize(model, character.modelTargetWidthRatio);
};

const loadGltf = (url) =>
  new Promise((resolve, reject) => {
    new GLTFLoader().load(url, resolve, undefined, reject);
  });

const ensureStoryAudioContext = () => {
  if (storyAudioContext) return storyAudioContext;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  storyAudioContext = new AudioContextClass();
  return storyAudioContext;
};

const loadAudioBuffer = (url) => {
  const context = ensureStoryAudioContext();
  if (!context) {
    return Promise.reject(new Error("Web Audio API is unavailable."));
  }

  return fetch(url, { cache: "force-cache" })
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
    );
};

const createCharacterResource = (character, gltf, subtitleCues, audioBuffer) => {
  prepareModel(gltf.scene, character);

  const anchor = new THREE.Group();
  anchor.name = `${character.id}-image-target-anchor`;
  anchor.visible = false;
  anchor.add(gltf.scene);

  const subtitle = createSubtitleMesh(character);
  anchor.add(subtitle.mesh);

  const mixer = gltf.animations.length
    ? new THREE.AnimationMixer(gltf.scene)
    : null;
  const animationActions = mixer
    ? gltf.animations.map((clip) => {
        const action = mixer.clipAction(clip);
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        return action;
      })
    : [];

  const resource = {
    character,
    anchor,
    mixer,
    animationActions,
    subtitleMesh: subtitle.mesh,
    subtitleContext: subtitle.context,
    subtitleTexture: subtitle.texture,
    subtitleCues,
    activeSubtitleIndex: -1,
    audioBuffer,
  };

  arScene.add(anchor);
  return resource;
};

const loadCharacterResources = (character) => {
  const cached = characterResourceCache.get(character.id);
  if (cached) return cached;

  const loading = Promise.all([
    loadGltf(character.model),
    fetchText(character.subtitle, "Subtitle").then(parseSrt),
    loadAudioBuffer(character.audio),
  ])
    .then(([gltf, subtitleCues, audioBuffer]) =>
      createCharacterResource(character, gltf, subtitleCues, audioBuffer),
    )
    .catch((error) => {
      characterResourceCache.delete(character.id);
      throw error;
    });

  characterResourceCache.set(character.id, loading);
  return loading;
};

const setSubtitle = (resource, index) => {
  if (!resource || index === resource.activeSubtitleIndex) return;
  resource.activeSubtitleIndex = index;
  const cue = index >= 0 ? resource.subtitleCues[index] : null;
  drawSubtitle(resource, cue?.text || "");
  resource.subtitleMesh.visible = Boolean(cue && activeTargetVisible);
};

const getStoryAudioTime = () => {
  if (!activeResource?.audioBuffer) return storyAudioOffset;
  if (!storyAudioPlaying || !storyAudioContext) return storyAudioOffset;
  return Math.min(
    activeResource.audioBuffer.duration,
    storyAudioOffset + (storyAudioContext.currentTime - storyAudioStartedAt),
  );
};

const updateSubtitleFromAudio = () => {
  if (!activeResource) return;
  const { subtitleMesh, subtitleCues } = activeResource;
  if (!activeTargetVisible || !storyAudioPlaying) {
    subtitleMesh.visible = false;
    return;
  }

  const time = getStoryAudioTime();
  const cueIndex = subtitleCues.findIndex(
    (cue) => time >= cue.start && time < cue.end,
  );
  setSubtitle(activeResource, cueIndex);
  subtitleMesh.visible = cueIndex >= 0;
};

const resetModelAnimation = (resource) => {
  if (!resource?.mixer) return;
  resource.mixer.stopAllAction();
  resource.mixer.timeScale = 0;
};

const resumeModelAnimation = () => {
  if (!activeResource?.mixer || !activeResource.animationActions.length) return;
  activeResource.mixer.timeScale = 1;
  if (storyAudioOffset <= 0.001) {
    activeResource.animationActions.forEach((action) => {
      action.reset();
      action.play();
    });
  }
};

const stopModelAnimation = () => {
  if (activeResource?.mixer) activeResource.mixer.timeScale = 0;
};

const disconnectStorySource = () => {
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
};

const pauseStory = () => {
  if (storyAudioPlaying) storyAudioOffset = getStoryAudioTime();
  storyAudioPlaying = false;
  disconnectStorySource();
  stopModelAnimation();
  setSubtitle(activeResource, -1);
  if (activeResource) activeResource.subtitleMesh.visible = false;
};

const resetStory = (resource = activeResource) => {
  pauseStory();
  storyAudioOffset = 0;
  storyAudioEnded = false;
  resetModelAnimation(resource);
};

const playStory = () => {
  if (
    !audioUnlocked ||
    !activeTargetVisible ||
    !activeResource ||
    storyAudioEnded ||
    storyAudioPlaying
  ) {
    return;
  }

  const context = ensureStoryAudioContext();
  if (!context) return;
  if (context.state === "suspended") {
    void context
      .resume()
      .then(() => tryStartStory())
      .catch(() => undefined);
    return;
  }

  const { audioBuffer } = activeResource;
  const source = context.createBufferSource();
  const gain = context.createGain();
  const playToken = ++storyAudioPlayToken;
  source.buffer = audioBuffer;
  gain.gain.value = 1;
  source.connect(gain);
  gain.connect(context.destination);
  source.onended = () => {
    if (playToken !== storyAudioPlayToken || storyAudioSource !== source) return;
    storyAudioPlaying = false;
    storyAudioEnded = true;
    storyAudioOffset = audioBuffer.duration;
    storyAudioSource = null;
    storyAudioGain = null;
    source.disconnect();
    gain.disconnect();
    stopModelAnimation();
    setSubtitle(activeResource, -1);
  };

  storyAudioSource = source;
  storyAudioGain = gain;
  storyAudioPlaying = true;
  storyAudioEnded = false;
  storyAudioStartedAt = context.currentTime;
  resumeModelAnimation();
  source.start(0, Math.min(storyAudioOffset, audioBuffer.duration - 0.001));
};

function tryStartStory() {
  if (
    !experienceEnabled ||
    !activeTargetVisible ||
    !targetFoundAfterStart ||
    !activeResource
  ) {
    return;
  }
  playStory();
}

const applyActiveTargetPose = () => {
  if (!activeResource || !activeTargetDetail || !activeCharacter) return;
  const { position, rotation, scale = 1 } = activeTargetDetail;
  const { anchor } = activeResource;

  anchor.visible = experienceEnabled && activeTargetVisible;
  anchor.position.set(
    position.x,
    position.y,
    position.z + activeCharacter.modelSurfaceOffsetMeters,
  );
  anchor.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
  anchor.scale.setScalar(scale > 0 ? scale : 1);
};

const activateCharacter = (character, detail) => {
  const isSwitch = activeCharacter?.targetName !== character.targetName;
  if (isSwitch) {
    if (activeResource) activeResource.anchor.visible = false;
    resetStory(activeResource);
    activeCharacter = character;
    activeResource = null;
    storyAudioOffset = 0;
    storyAudioEnded = false;
  } else if (storyAudioEnded) {
    resetStory(activeResource);
  }

  activeTargetDetail = detail;
  activeTargetVisible = true;
  targetFoundAfterStart = true;
  applyActiveTargetPose();

  const token = isSwitch ? ++activationToken : activationToken;
  loadCharacterResources(character)
    .then((resource) => {
      if (
        token !== activationToken ||
        activeCharacter?.targetName !== character.targetName
      ) {
        return;
      }
      activeResource = resource;
      applyActiveTargetPose();
      tryStartStory();
    })
    .catch((error) => {
      if (token !== activationToken) return;
      console.error(`${logPrefix(character)} Failed to load resources:`, error);
    });
};

const handleImageTargetFound = ({ detail }) => {
  const character = CHARACTERS_BY_TARGET_NAME.get(detail.name);
  if (!character || !experienceEnabled) return;
  activateCharacter(character, detail);
};

const handleImageTargetUpdated = ({ detail }) => {
  if (!targetFoundAfterStart || detail.name !== activeCharacter?.targetName) {
    return;
  }
  activeTargetDetail = detail;
  activeTargetVisible = true;
  applyActiveTargetPose();
  tryStartStory();
};

const handleImageTargetLost = ({ detail }) => {
  if (detail.name !== activeCharacter?.targetName) return;
  targetFoundAfterStart = false;
  activeTargetVisible = false;
  activeTargetDetail = null;
  if (activeResource) activeResource.anchor.visible = false;
  pauseStory();
};

const showIntroScreen = () => {
  document.getElementById("ar-intro-screen")?.classList.add("is-visible");
};

const startGatePipelineModule = () => ({
  name: "menodi-start-gate",
  onCameraStatusChange: ({ status }) => {
    if (status === "hasStream" || status === "hasVideo") showIntroScreen();
  },
});

const engineImageTargetPipelineModule = () => ({
  name: "menodi-dynamic-image-targets",

  listeners: [
    { event: "reality.imagefound", process: handleImageTargetFound },
    { event: "reality.imageupdated", process: handleImageTargetUpdated },
    { event: "reality.imagelost", process: handleImageTargetLost },
  ],

  onStart: () => {
    arScene = XR8.Threejs.xrScene().scene;
    arScene.add(new THREE.AmbientLight(0xffffff, 1.8));

    const mainLight = new THREE.DirectionalLight(0xffffff, 2.2);
    mainLight.position.set(2, 4, 3);
    arScene.add(mainLight);

    const fillLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
    arScene.add(fillLight);
  },

  onUpdate: () => {
    const delta = Math.min(clock.getDelta(), 0.1);
    if (activeResource?.mixer && activeResource.anchor.visible) {
      activeResource.mixer.update(delta);
    }
    if (activeResource?.subtitleMesh && activeResource.anchor.visible) {
      const { camera } = XR8.Threejs.xrScene();
      activeResource.subtitleMesh.lookAt(camera.position);
      activeResource.subtitleMesh.rotateZ(Math.PI);
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
        imageTargetData: CHARACTER_LIST.map((character) => character.target),
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
      console.error(`${logPrefix()} Failed to start 8th Wall Engine:`, error);
      throw error;
    });
};

const unlockStoryAudio = () => {
  if (audioUnlocked) return Promise.resolve();
  if (audioUnlocking) return audioUnlocking;

  const context = ensureStoryAudioContext();
  if (!context) {
    return Promise.reject(new Error("Web Audio API is unavailable."));
  }

  // Start this synchronously in the trusted click stack for iOS Safari.
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
      : "开启 AR 体验";
};

const hideIntroScreen = () => {
  document.getElementById("ar-intro-screen")?.classList.remove("is-visible");
};

const startArExperience = () => {
  if (arStarting || experienceEnabled) return;
  arStarting = true;
  setStartButtonLoading(true);

  unlockStoryAudio()
    .then(() => {
      experienceEnabled = true;
      targetFoundAfterStart = false;
      activeTargetVisible = false;
      activeTargetDetail = null;
      arStarting = false;
      document.body.classList.remove("ar-camera-hidden");
      hideIntroScreen();
      if (activeResource) activeResource.anchor.visible = false;
      pauseStory();
    })
    .catch((error) => {
      arStarting = false;
      console.warn(`${logPrefix()} Audio unlock failed:`, error);
      setStartButtonLoading(false, true);
    });
};

const bootstrap = () => {
  const button = document.getElementById("ar-start-button");
  button?.addEventListener("click", startArExperience, { passive: true });
  startEngine().catch(() => undefined);
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
} else {
  bootstrap();
}
