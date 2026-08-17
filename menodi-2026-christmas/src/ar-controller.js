const YOUNG_TARGET = require("../image-targets/young-santa.json");
const ADULT_TARGET = require("../image-targets/adult-santa.json");
const GRANDPA_TARGET = require("../image-targets/grandpa-santa.json");
const { CHARACTERS, TARGET_TO_CHARACTER } = require("./characters");
const { createModelManager } = require("./model-manager");

const IMAGE_TARGET_DATA = Object.freeze([
  YOUNG_TARGET,
  ADULT_TARGET,
  GRANDPA_TARGET,
]);

const optionalPipelineModule = (factory) =>
  factory?.pipelineModule ? [factory.pipelineModule()] : [];

const createArController = ({ onStatus, onDiscovered, onError } = {}) => {
  const modelManager = createModelManager({
    characters: CHARACTERS,
    onError: (error, id) => onError?.(error, `model:${id}`),
  });
  const handledTargets = new Set();
  let runtimePromise = null;
  let startPromise = null;
  let running = false;

  const getCanvas = () => document.getElementById("camerafeed");

  const ensureXrController = () => {
    if (globalThis.XR8?.XrController) return Promise.resolve();
    if (globalThis.XR8?.loadChunk) return globalThis.XR8.loadChunk("slam");
    return Promise.reject(new Error("XR8.XrController is not available."));
  };

  const loadRuntime = () => {
    if (globalThis.XR8) return ensureXrController();
    if (runtimePromise) return runtimePromise;

    runtimePromise = new Promise((resolve, reject) => {
      const existing = document.getElementById("xr-runtime-script");
      const onLoaded = () => resolve();
      globalThis.addEventListener("xrloaded", onLoaded, { once: true });

      if (existing) {
        existing.addEventListener("error", reject, { once: true });
        return;
      }

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
    }).then(ensureXrController).catch((error) => {
      runtimePromise = null;
      throw error;
    });

    return runtimePromise;
  };

  const resolveCharacter = (detail) => TARGET_TO_CHARACTER[detail?.name] || null;

  const onImageFound = ({ detail }) => {
    const id = resolveCharacter(detail);
    if (!id) return;
    void modelManager.onFound(id, detail);
    if (handledTargets.has(detail.name)) return;
    handledTargets.add(detail.name);
    onStatus?.("found", id);
    onDiscovered?.(id);
  };

  const onImageUpdated = ({ detail }) => {
    const id = resolveCharacter(detail);
    if (!id) return;
    modelManager.onUpdated(id, detail);
    if (!handledTargets.has(detail.name)) onStatus?.("holding", id);
  };

  const onImageLost = ({ detail }) => {
    const id = resolveCharacter(detail);
    if (!id) return;
    modelManager.onLost(id);
    if (!handledTargets.has(detail.name)) onStatus?.("searching");
  };

  const pipelineModule = () => ({
    name: "santa-journey-image-targets",
    listeners: [
      { event: "reality.imagefound", process: onImageFound },
      { event: "reality.imageupdated", process: onImageUpdated },
      { event: "reality.imagelost", process: onImageLost },
    ],
    onStart: () => {
      const { scene } = globalThis.XR8.Threejs.xrScene();
      modelManager.attachScene(scene);
      onStatus?.("searching");
    },
    onCameraStatusChange: ({ status }) => {
      if (status === "hasStream" || status === "hasVideo") onStatus?.("searching");
      if (status === "failed" || status === "cameraError") {
        onError?.(new Error("Camera permission or camera startup failed."), "camera");
      }
    },
    onUpdate: () => modelManager.update(),
    onDetach: () => modelManager.dispose(),
  });

  const start = () => {
    if (running) return Promise.resolve();
    if (startPromise) return startPromise;
    handledTargets.clear();
    onStatus?.("loading");

    startPromise = loadRuntime()
      .then(() => modelManager.prepareThree())
      .then(() => {
        globalThis.XR8.XrController.configure({
          imageTargetData: IMAGE_TARGET_DATA,
          disableWorldTracking: true,
        });

        globalThis.XR8.addCameraPipelineModules([
          globalThis.XR8.GlTextureRenderer.pipelineModule(),
          globalThis.XR8.Threejs.pipelineModule(),
          globalThis.XR8.XrController.pipelineModule(),
          ...optionalPipelineModule(globalThis.LandingPage),
          ...optionalPipelineModule(globalThis.XRExtras?.FullWindowCanvas),
          ...optionalPipelineModule(globalThis.XRExtras?.Loading),
          ...optionalPipelineModule(globalThis.XRExtras?.RuntimeError),
          pipelineModule(),
        ]);

        const canvas = getCanvas();
        if (!canvas) throw new Error("Camera canvas is missing.");
        canvas.classList.add("is-active");
        globalThis.XR8.run({
          canvas,
          allowedDevices: globalThis.XR8.XrConfig.device().ANY,
        });
        running = true;
      })
      .catch((error) => {
        running = false;
        getCanvas()?.classList.remove("is-active");
        onError?.(error, "runtime");
        throw error;
      })
      .finally(() => {
        startPromise = null;
      });

    return startPromise;
  };

  const stop = async () => {
    if (startPromise) {
      try { await startPromise; } catch (_error) { /* handled by start */ }
    }
    if (!running) {
      getCanvas()?.classList.remove("is-active");
      return;
    }

    running = false;
    try {
      await Promise.resolve(globalThis.XR8?.stop?.());
    } finally {
      globalThis.XR8?.clearCameraPipelineModules?.();
      modelManager.dispose();
      getCanvas()?.classList.remove("is-active");
      onStatus?.("idle");
    }
  };

  return {
    start,
    stop,
    isRunning: () => running,
    getHandledTargets: () => new Set(handledTargets),
  };
};

module.exports = { IMAGE_TARGET_DATA, createArController };
