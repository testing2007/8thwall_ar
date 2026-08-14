import { cadiphyBloomPipelineModule } from "./bloom.js";

const IMAGE_TARGET_DATA = require("../image-targets/trigger-label.json");
const START_BUTTON_ID = "cadiphy-ar-start";
const START_SCREEN_ID = "cadiphy-start-screen";
const DIAGNOSTIC_OVERLAY_ID = "cadiphy-runtime-diagnostic";
const CAMERA_STREAM_TIMEOUT_MS = 14000;

let xrRuntimeLoading = null;
let arStarted = false;
let xrStarted = false;
let cameraTimeoutId = null;
window.CADIPHY_AR_STARTED = false;

const detectWebGl = () => {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      canvas.getContext("webgl") || canvas.getContext("experimental-webgl") || canvas.getContext("webgl2"),
    );
  } catch {
    return false;
  }
};

const detectWasmSimd = () => {
  try {
    if (!window.WebAssembly?.validate) return false;
    return WebAssembly.validate(
      new Uint8Array([
        0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10,
        10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11,
      ]),
    );
  } catch {
    return false;
  }
};

const getBrowserCapabilities = () => ({
  webgl: detectWebGl(),
  getUserMedia: Boolean(navigator.mediaDevices?.getUserMedia),
  deviceOrientation: Boolean(window.DeviceOrientationEvent),
  webAssembly: Boolean(window.WebAssembly),
  webAssemblySimd: detectWasmSimd(),
  vibrate: Boolean(navigator.vibrate),
});

const userAgent = navigator.userAgent || "";
const runtimeDiagnostics = {
  pageLoadedAt: new Date().toISOString(),
  userAgent,
  isLikelyHuawei: /huawei|honor|harmonyos|hmos|huaweibrowser|arkweb/i.test(userAgent),
  capabilities: getBrowserCapabilities(),
  cameraEvents: [],
  errors: [],
  lastCameraStatus: "not-started",
  xrRunStartedAt: null,
  streamReceivedAt: null,
  startGateShownAt: null,
  startedByUserAt: null,
  diagnosticReason: null,
};

window.CADIPHY_RUNTIME_DIAGNOSTICS = runtimeDiagnostics;

const formatBool = (value) => (value ? "是" : "否");

const serializeError = (error) => {
  if (!error) return null;
  if (typeof error === "string") return { message: error };
  return {
    name: error.name || "Error",
    message: error.message || String(error),
    stack: error.stack ? String(error.stack).split("\n").slice(0, 8).join("\n") : "",
  };
};

const recordError = (source, error) => {
  runtimeDiagnostics.errors.push({
    time: new Date().toISOString(),
    source,
    error: serializeError(error),
  });
  runtimeDiagnostics.errors = runtimeDiagnostics.errors.slice(-8);
};

const getDiagnosticPayload = () =>
  JSON.stringify(
    {
      ...runtimeDiagnostics,
      copiedAt: new Date().toISOString(),
    },
    null,
    2,
  );

const copyDiagnosticPayload = (button) => {
  const payload = getDiagnosticPayload();
  const done = () => {
    if (button) button.textContent = "已复制";
  };
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(payload).then(done).catch(() => undefined);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = payload;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-1000px";
  document.body.append(textarea);
  textarea.select();
  try {
    document.execCommand("copy");
    done();
  } catch {
    // The diagnostic text remains visible in the panel if copy is blocked.
  }
  textarea.remove();
};

const getDiagnosticSummary = () => {
  const caps = runtimeDiagnostics.capabilities;
  const latestError = runtimeDiagnostics.errors[runtimeDiagnostics.errors.length - 1]?.error;
  return [
    `疑似华为/HarmonyOS：${formatBool(runtimeDiagnostics.isLikelyHuawei)}`,
    `WebGL：${formatBool(caps.webgl)}，摄像头 API：${formatBool(caps.getUserMedia)}`,
    `WebAssembly：${formatBool(caps.webAssembly)}，WASM SIMD：${formatBool(caps.webAssemblySimd)}`,
    `DeviceOrientation：${formatBool(caps.deviceOrientation)}，振动 API：${formatBool(caps.vibrate)}`,
    `最近摄像机状态：${runtimeDiagnostics.lastCameraStatus}`,
    latestError ? `最近错误：${latestError.name || ""} ${latestError.message || ""}`.trim() : "最近错误：无",
    "",
    "如果当前是华为浏览器，可以先点“重新尝试”。若仍失败，建议用 Chrome、Edge 或 Firefox 打开同一链接。",
    "",
    `UA：${runtimeDiagnostics.userAgent}`,
  ].join("\n");
};

const hideRuntimeDiagnostic = () => {
  const overlay = document.getElementById(DIAGNOSTIC_OVERLAY_ID);
  if (!overlay) return;
  overlay.hidden = true;
  overlay.classList.remove("is-visible");
};

const ensureRuntimeDiagnosticOverlay = () => {
  let overlay = document.getElementById(DIAGNOSTIC_OVERLAY_ID);
  if (overlay) return overlay;

  overlay = document.createElement("div");
  overlay.id = DIAGNOSTIC_OVERLAY_ID;
  overlay.className = "cadiphy-diagnostic-overlay cadiphy-ui";
  overlay.hidden = true;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-label", "AR 兼容性诊断");

  const shell = document.createElement("div");
  shell.className = "cadiphy-diagnostic-shell";

  const title = document.createElement("h2");
  title.textContent = "AR 暂时无法启动";

  const message = document.createElement("p");
  message.textContent = "已记录当前浏览器和摄像机状态。华为浏览器兼容性不稳定，可以先重试。";

  const details = document.createElement("pre");
  details.className = "cadiphy-diagnostic-details";

  const actions = document.createElement("div");
  actions.className = "cadiphy-diagnostic-actions";

  const retryButton = document.createElement("button");
  retryButton.type = "button";
  retryButton.textContent = "重新尝试";
  retryButton.addEventListener("click", () => window.location.reload());

  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.textContent = "复制诊断信息";
  copyButton.addEventListener("click", () => copyDiagnosticPayload(copyButton));

  actions.append(retryButton, copyButton);
  shell.append(title, message, details, actions);
  overlay.append(shell);
  document.body.append(overlay);
  return overlay;
};

const showRuntimeDiagnostic = (reason, error) => {
  runtimeDiagnostics.diagnosticReason = reason;
  if (error) recordError(reason, error);
  const overlay = ensureRuntimeDiagnosticOverlay();
  const details = overlay.querySelector(".cadiphy-diagnostic-details");
  if (details) details.textContent = getDiagnosticSummary();
  overlay.hidden = false;
  requestAnimationFrame(() => overlay.classList.add("is-visible"));
};

const clearCameraTimeout = () => {
  if (!cameraTimeoutId) return;
  clearTimeout(cameraTimeoutId);
  cameraTimeoutId = null;
};

const scheduleCameraTimeout = () => {
  clearCameraTimeout();
  cameraTimeoutId = setTimeout(() => {
    if (!runtimeDiagnostics.streamReceivedAt) showRuntimeDiagnostic("camera-timeout");
  }, CAMERA_STREAM_TIMEOUT_MS);
};

const recordCameraStatus = ({ status, reason } = {}) => {
  runtimeDiagnostics.lastCameraStatus = status || "unknown";
  runtimeDiagnostics.cameraEvents.push({
    time: new Date().toISOString(),
    status: runtimeDiagnostics.lastCameraStatus,
    reason: reason || "",
  });
  runtimeDiagnostics.cameraEvents = runtimeDiagnostics.cameraEvents.slice(-12);

  if (status === "requesting") scheduleCameraTimeout();
  if (status === "hasStream" || status === "hasVideo") {
    runtimeDiagnostics.streamReceivedAt = runtimeDiagnostics.streamReceivedAt || new Date().toISOString();
    clearCameraTimeout();
    hideRuntimeDiagnostic();
  }
};

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

const ensureXrController = () => {
  if (window.XR8?.XrController) return Promise.resolve();
  if (window.XR8?.loadChunk) return window.XR8.loadChunk("slam");
  return Promise.reject(new Error("XR8.XrController is not available."));
};

const setStartScreenLoading = (loading) => {
  const screen = document.getElementById(START_SCREEN_ID);
  const button = document.getElementById(START_BUTTON_ID);
  if (screen) screen.classList.toggle("is-loading", loading);
  if (button) {
    button.disabled = loading;
    button.textContent = loading ? "正在启动..." : "开启 AR 体验";
  }
};

const showStartScreen = () => {
  if (arStarted) return;
  const screen = document.getElementById(START_SCREEN_ID);
  if (!screen) return;
  runtimeDiagnostics.startGateShownAt = runtimeDiagnostics.startGateShownAt || new Date().toISOString();
  screen.classList.remove("is-hidden");
  screen.setAttribute("aria-hidden", "false");
};

const hideStartScreen = () => {
  const screen = document.getElementById(START_SCREEN_ID);
  if (!screen) return;
  screen.classList.add("is-hidden");
  screen.setAttribute("aria-hidden", "true");
};

const loadXrRuntime = () => {
  if (window.XR8) return Promise.resolve();
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

const cadiphyStartGatePipelineModule = () => ({
  name: "cadiphy-start-gate",
  onCameraStatusChange: ({ status }) => {
    if (status === "hasStream" || status === "hasVideo") showStartScreen();
  },
});

const cadiphyRuntimeDiagnosticsPipelineModule = () => ({
  name: "cadiphy-runtime-diagnostics",
  onBeforeRun: () => {
    runtimeDiagnostics.xrRunStartedAt = new Date().toISOString();
  },
  onCameraStatusChange: (event) => {
    recordCameraStatus(event);
  },
  onException: (error) => {
    showRuntimeDiagnostic("xr-exception", error);
  },
  onRemove: () => {
    clearCameraTimeout();
  },
});

const onxrloaded = () => {
  if (xrStarted) return Promise.resolve();
  xrStarted = true;

  return ensureXrController().then(() => {
    XR8.XrController.configure({
      imageTargetData: [IMAGE_TARGET_DATA],
      disableWorldTracking: true,
    });

    XR8.addCameraPipelineModules([
      XR8.GlTextureRenderer.pipelineModule(),
      XR8.Threejs.pipelineModule(),
      XR8.XrController.pipelineModule(),
      ...optionalPipelineModule(window.XRExtras?.FullWindowCanvas),
      ...optionalPipelineModule(window.XRExtras?.Loading),
      ...optionalPipelineModule(window.XRExtras?.RuntimeError),
      cadiphyRuntimeDiagnosticsPipelineModule(),
      cadiphyStartGatePipelineModule(),
      cadiphyBloomPipelineModule(),
    ]);

    XR8.run({
      canvas: getCameraCanvas(),
      allowedDevices: XR8.XrConfig.device().ANY,
    });
  });
};

const startAr = () => {
  if (arStarted) return;
  arStarted = true;
  runtimeDiagnostics.startedByUserAt = new Date().toISOString();
  setStartScreenLoading(true);
  window.CADIPHY_AR_STARTED = true;
  window.CADIPHY_UNLOCK_MEDIA?.();
  loadXrRuntime()
    .then(() => {
      setStartScreenLoading(false);
      hideStartScreen();
      window.dispatchEvent(new CustomEvent("cadiphy-ar-started"));
    })
    .catch((error) => {
      console.error("[CADIPHY AR] Failed to enter AR experience:", error);
      arStarted = false;
      window.CADIPHY_AR_STARTED = false;
      setStartScreenLoading(false);
      showStartScreen();
      showRuntimeDiagnostic("start-ar", error);
    });
};

const bootXr = () => {
  loadXrRuntime()
    .then(() => onxrloaded())
    .then(() => {
      setStartScreenLoading(false);
    })
    .catch((error) => {
      console.error("[CADIPHY AR] Failed to start XR runtime:", error);
      setStartScreenLoading(false);
      showRuntimeDiagnostic("boot-xr", error);
    });
};

const installStartScreen = () => {
  const button = document.getElementById(START_BUTTON_ID);
  if (button) {
    button.addEventListener("touchend", startAr, { passive: true });
    button.addEventListener("click", startAr, { passive: true });
  }
  bootXr();
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", installStartScreen, { once: true });
} else {
  installStartScreen();
}
