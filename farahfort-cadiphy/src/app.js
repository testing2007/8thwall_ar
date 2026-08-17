import { cadiphyBloomPipelineModule } from "./bloom.js";
import {
  createRearCameraController,
  createCameraDiagnosticsState,
  fullscreenCameraDiagnosticsPipelineModule,
  recordCameraLayout,
  recordCameraRuntimeStatus,
} from "./camera-runtime.js";

const IMAGE_TARGET_DATA = require("../image-targets/trigger-label.json");
const START_BUTTON_ID = "cadiphy-ar-start";
const START_SCREEN_ID = "cadiphy-start-screen";
const DIAGNOSTIC_OVERLAY_ID = "cadiphy-runtime-diagnostic";
const CAMERA_DEBUG_BUTTON_ID = "cadiphy-camera-debug";
const CAMERA_SWITCH_BUTTON_ID = "cadiphy-camera-switch";
const CAMERA_SWITCH_OVERLAY_ID = "cadiphy-camera-switch-overlay";
const CAMERA_TOAST_ID = "cadiphy-camera-toast";
const HUAWEI_BROWSER_BLOCK_ID = "cadiphy-huawei-browser-block";
const CAMERA_STREAM_TIMEOUT_MS = 14000;
const CAMERA_SWITCH_TIMEOUT_MS = 16000;
const CAMERA_DEBUG_ENABLED = new URLSearchParams(window.location.search).get("cameraDebug") === "1";

let xrRuntimeLoading = null;
let arStarted = false;
let xrStarted = false;
let cameraTimeoutId = null;
let cameraController = null;
let cameraSwitching = false;
let cameraSessionWaiter = null;
let cameraSwitchSequence = 0;
let toastTimeoutId = null;
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
const platform = navigator.platform || "";
const isHuaweiBrowser = /huaweibrowser/i.test(userAgent);
const deviceUserAgent = userAgent.replace(/huaweibrowser(?:\/[\w.-]+)?/ig, "");
const isHuaweiDevice = /huawei|honor|harmonyos|hmos/i.test(deviceUserAgent);
const isAppleDevice = /iphone|ipad|ipod/i.test(userAgent) ||
  (platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isAndroidDevice = /android/i.test(userAgent);
const isUnsupportedHuaweiBrowser = isHuaweiDevice && isHuaweiBrowser;
const cameraSwitchSupported = !isAppleDevice && !isUnsupportedHuaweiBrowser;

const cameraDiagnostics = createCameraDiagnosticsState();
const runtimeDiagnostics = {
  pageLoadedAt: new Date().toISOString(),
  userAgent,
  platform,
  deviceClassification: {
    isHuaweiDevice,
    isAppleDevice,
    isAndroidDevice,
  },
  browserClassification: {
    isHuaweiBrowser,
  },
  isLikelyHuawei: isHuaweiDevice,
  startupBlocked: isUnsupportedHuaweiBrowser,
  startupBlockedReason: isUnsupportedHuaweiBrowser ? "unsupported-huawei-browser" : null,
  cameraSwitchSupported,
  capabilities: getBrowserCapabilities(),
  cameraEvents: [],
  errors: [],
  lastCameraStatus: "not-started",
  xrRunStartedAt: null,
  streamReceivedAt: null,
  startGateShownAt: null,
  startedByUserAt: null,
  diagnosticReason: null,
  camera: cameraDiagnostics,
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

const getDiagnosticPayload = () => {
  const viewport = window.visualViewport;
  return JSON.stringify(
    {
      ...runtimeDiagnostics,
      platform,
      pageEnvironment: {
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
        },
        visualViewport: viewport ? {
          width: viewport.width,
          height: viewport.height,
          scale: viewport.scale,
          offsetLeft: viewport.offsetLeft,
          offsetTop: viewport.offsetTop,
        } : null,
        screen: {
          width: window.screen?.width || 0,
          height: window.screen?.height || 0,
          orientation: window.screen?.orientation?.type || null,
        },
        devicePixelRatio: window.devicePixelRatio || 1,
      },
      copiedAt: new Date().toISOString(),
    },
    null,
    2,
  );
};

const copyDiagnosticPayload = (button) => {
  const payload = getDiagnosticPayload();
  const done = () => {
    if (button) button.textContent = "已复制";
  };
  const copyWithTextarea = () => {
    const textarea = document.createElement("textarea");
    textarea.value = payload;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-1000px";
    document.body.append(textarea);
    textarea.select();
    try {
      if (document.execCommand("copy")) done();
    } catch {
      // Keep the diagnostics panel open so the customer can retry.
    }
    textarea.remove();
  };

  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(payload).then(done).catch(copyWithTextarea);
  } else {
    copyWithTextarea();
  }
};

const getDiagnosticSummary = () => {
  const caps = runtimeDiagnostics.capabilities;
  const camera = runtimeDiagnostics.camera;
  const cameraSettings = camera.track?.settings || {};
  const cameraLayout = camera.layout || {};
  const latestError = runtimeDiagnostics.errors[runtimeDiagnostics.errors.length - 1]?.error;
  return [
    `疑似华为/HarmonyOS：${formatBool(runtimeDiagnostics.isLikelyHuawei)}`,
    `苹果设备：${formatBool(isAppleDevice)}，Android：${formatBool(isAndroidDevice)}`,
    `华为浏览器：${formatBool(isHuaweiBrowser)}，启动拦截：${formatBool(isUnsupportedHuaweiBrowser)}`,
    `支持后摄切换：${formatBool(cameraSwitchSupported)}`,
    `WebGL：${formatBool(caps.webgl)}，摄像头 API：${formatBool(caps.getUserMedia)}`,
    `WebAssembly：${formatBool(caps.webAssembly)}，WASM SIMD：${formatBool(caps.webAssemblySimd)}`,
    `DeviceOrientation：${formatBool(caps.deviceOrientation)}，振动 API：${formatBool(caps.vibrate)}`,
    `最近摄像机状态：${runtimeDiagnostics.lastCameraStatus}`,
    `实际视频：${camera.video?.width || cameraSettings.width || "未知"} × ${camera.video?.height || cameraSettings.height || "未知"}`,
    `摄像头：${camera.track?.label || "未知"}（序号：${camera.selectedCameraIndex ?? "未知"}）`,
    `朝向：${cameraSettings.facingMode || "未知"}，zoom：${cameraSettings.zoom ?? "未知"}`,
    `画布：${cameraLayout.bufferWidth || "未知"} × ${cameraLayout.bufferHeight || "未知"}，显示模式：${camera.layoutMode}`,
    `全屏裁切倍数：${cameraLayout.fullscreenCropScale || "未知"}`,
    `相机告警：${camera.warnings.length ? camera.warnings.join(", ") : "无"}`,
    latestError ? `最近错误：${latestError.name || ""} ${latestError.message || ""}`.trim() : "最近错误：无",
    "",
    isUnsupportedHuaweiBrowser
      ? "当前华为浏览器不受支持，请使用 Chrome 打开同一链接。"
      : "如相机启动失败，可以先点“重新尝试”并复制诊断信息。",
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
  title.className = "cadiphy-diagnostic-title";
  title.textContent = "AR 暂时无法启动";

  const message = document.createElement("p");
  message.className = "cadiphy-diagnostic-message";
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

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.textContent = "关闭";
  closeButton.addEventListener("click", hideRuntimeDiagnostic);

  actions.append(retryButton, copyButton, closeButton);
  shell.append(title, message, details, actions);
  overlay.append(shell);
  document.body.append(overlay);
  return overlay;
};

const showRuntimeDiagnostic = (reason, error) => {
  runtimeDiagnostics.diagnosticReason = reason;
  if (error) recordError(reason, error);
  const overlay = ensureRuntimeDiagnosticOverlay();
  const debugMode = reason === "camera-debug";
  const title = overlay.querySelector(".cadiphy-diagnostic-title");
  const message = overlay.querySelector(".cadiphy-diagnostic-message");
  const details = overlay.querySelector(".cadiphy-diagnostic-details");
  if (title) title.textContent = debugMode ? "相机诊断" : "AR 暂时无法启动";
  if (message) {
    message.textContent = debugMode
      ? "请等待相机启动完成后复制诊断信息，并将完整内容发给开发人员。"
      : "已记录当前浏览器和摄像机状态。华为浏览器兼容性不稳定，可以先重试。";
  }
  if (details) details.textContent = getDiagnosticSummary();
  overlay.hidden = false;
  requestAnimationFrame(() => overlay.classList.add("is-visible"));
};

const refreshVisibleDiagnostic = () => {
  const overlay = document.getElementById(DIAGNOSTIC_OVERLAY_ID);
  if (!overlay || overlay.hidden) return;
  const details = overlay.querySelector(".cadiphy-diagnostic-details");
  if (details) details.textContent = getDiagnosticSummary();
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

const settleCameraSessionWaiter = (error) => {
  if (!cameraSessionWaiter) return;
  const waiter = cameraSessionWaiter;
  cameraSessionWaiter = null;
  clearTimeout(waiter.timeoutId);
  if (error) waiter.reject(error);
  else waiter.resolve();
};

const waitForCameraSession = (expectedLabel) => new Promise((resolve, reject) => {
  settleCameraSessionWaiter(new Error("Camera session was superseded."));
  const timeoutId = setTimeout(() => {
    if (!cameraSessionWaiter) return;
    cameraSessionWaiter = null;
    reject(new Error("Camera switch timed out before video became available."));
  }, CAMERA_SWITCH_TIMEOUT_MS);
  cameraSessionWaiter = {
    expectedLabel: String(expectedLabel || "").trim().toLowerCase(),
    resolve,
    reject,
    timeoutId,
  };
});

const recordCameraStatus = (event = {}) => {
  const { status, reason } = event;
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
  if (status === "hasStream" || status === "failed") {
    cameraController?.endManagedRequestWindow();
  }
  recordCameraRuntimeStatus(cameraDiagnostics, event, refreshVisibleDiagnostic);
  if (status === "hasStream" && event.stream) {
    void cameraController?.observeStream(event.stream);
  }
  if (status === "hasVideo") settleCameraSessionWaiter();
  if (status === "failed") {
    settleCameraSessionWaiter(new Error(reason || "Camera session failed."));
  }
  refreshCameraSwitchUi();
};

const installCameraDebugEntry = () => {
  if (!CAMERA_DEBUG_ENABLED || document.getElementById(CAMERA_DEBUG_BUTTON_ID)) return;
  const button = document.createElement("button");
  button.id = CAMERA_DEBUG_BUTTON_ID;
  button.className = "cadiphy-camera-debug-button";
  button.type = "button";
  button.textContent = "Camera Debug";
  button.addEventListener("click", () => showRuntimeDiagnostic("camera-debug"));
  document.body.append(button);
};

const clearElement = (element) => {
  while (element?.firstChild) element.removeChild(element.firstChild);
};

const showCameraToast = (message, isError = false) => {
  let toast = document.getElementById(CAMERA_TOAST_ID);
  if (!toast) {
    toast = document.createElement("div");
    toast.id = CAMERA_TOAST_ID;
    toast.className = "cadiphy-camera-toast";
    toast.setAttribute("role", "status");
    document.body.append(toast);
  }
  if (toastTimeoutId) clearTimeout(toastTimeoutId);
  toast.textContent = message;
  toast.classList.toggle("is-error", isError);
  toast.classList.add("is-visible");
  toastTimeoutId = setTimeout(() => toast.classList.remove("is-visible"), 2600);
};

const closeCameraSwitchOverlay = () => {
  const overlay = document.getElementById(CAMERA_SWITCH_OVERLAY_ID);
  if (!overlay) return;
  overlay.hidden = true;
  overlay.classList.remove("is-visible");
};

const removeCameraSwitchUi = () => {
  document.getElementById(CAMERA_SWITCH_BUTTON_ID)?.remove();
  document.getElementById(CAMERA_SWITCH_OVERLAY_ID)?.remove();
};

const ensureCameraSwitchUi = () => {
  if (!cameraSwitchSupported) return null;
  let button = document.getElementById(CAMERA_SWITCH_BUTTON_ID);
  if (!button) {
    button = document.createElement("button");
    button.id = CAMERA_SWITCH_BUTTON_ID;
    button.className = "cadiphy-camera-switch-button";
    button.type = "button";
    button.hidden = true;
    button.textContent = "切换后摄";
    button.addEventListener("click", () => {
      if (!cameraSwitchSupported || cameraSwitching ||
        (cameraController?.getRearCameras().length || 0) < 2) return;
      const overlay = ensureCameraSwitchUi()?.overlay;
      if (!overlay) return;
      refreshCameraSwitchUi();
      overlay.hidden = false;
      requestAnimationFrame(() => overlay.classList.add("is-visible"));
    });
    document.body.append(button);
  }

  let overlay = document.getElementById(CAMERA_SWITCH_OVERLAY_ID);
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = CAMERA_SWITCH_OVERLAY_ID;
    overlay.className = "cadiphy-camera-switch-overlay cadiphy-ui";
    overlay.hidden = true;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "选择后置摄像头");
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay && !cameraSwitching) closeCameraSwitchOverlay();
    });

    const panel = document.createElement("div");
    panel.className = "cadiphy-camera-switch-panel";

    const header = document.createElement("div");
    header.className = "cadiphy-camera-switch-header";
    const title = document.createElement("h2");
    title.textContent = "选择后置摄像头";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "cadiphy-camera-switch-close";
    close.textContent = "关闭";
    close.addEventListener("click", () => {
      if (!cameraSwitching) closeCameraSwitchOverlay();
    });
    header.append(title, close);

    const hint = document.createElement("p");
    hint.className = "cadiphy-camera-switch-hint";
    hint.textContent = "如果画面异常放大或模糊，可切换至其他主摄镜头。";
    const list = document.createElement("div");
    list.className = "cadiphy-camera-switch-list";
    panel.append(header, hint, list);
    overlay.append(panel);
    document.body.append(overlay);
  }
  return { button, overlay };
};

const refreshCameraSwitchUi = () => {
  if (!cameraSwitchSupported) {
    closeCameraSwitchOverlay();
    removeCameraSwitchUi();
    return;
  }
  if (!cameraController) return;
  const cameraSwitchUi = ensureCameraSwitchUi();
  if (!cameraSwitchUi) return;
  const { button, overlay } = cameraSwitchUi;
  const list = overlay.querySelector(".cadiphy-camera-switch-list");
  const cameras = cameraController.getRearCameras();
  const currentCamera = cameraController.getCurrentRearCamera();
  const recommendedCamera = cameraController.getRecommendedRearCamera();
  const cameraReady = cameraDiagnostics.status === "hasStream" || cameraDiagnostics.status === "hasVideo";
  const canSwitch = cameraReady && cameras.length >= 2 && cameraController.isInstalled();
  button.hidden = !canSwitch;
  button.disabled = cameraSwitching;
  button.textContent = cameraSwitching ? "正在切换..." : "切换后摄";
  if (!canSwitch) closeCameraSwitchOverlay();
  if (!list) return;
  clearElement(list);

  cameras.forEach((camera, index) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "cadiphy-camera-switch-option";
    option.disabled = cameraSwitching;
    const isCurrent = camera.deviceId === currentCamera?.deviceId;
    const isRecommended = camera.deviceId === recommendedCamera?.deviceId;
    if (isCurrent) option.classList.add("is-current");

    const content = document.createElement("span");
    content.className = "cadiphy-camera-option-content";
    const name = document.createElement("strong");
    name.textContent = `后置摄像头 ${index + 1}`;
    const rawLabel = document.createElement("small");
    rawLabel.textContent = camera.label || "系统未提供镜头名称";
    content.append(name, rawLabel);

    const badges = document.createElement("span");
    badges.className = "cadiphy-camera-option-badges";
    if (isRecommended) {
      const badge = document.createElement("span");
      badge.textContent = "推荐";
      badges.append(badge);
    }
    if (isCurrent) {
      const badge = document.createElement("span");
      badge.textContent = "当前";
      badges.append(badge);
    }
    option.append(content, badges);
    option.addEventListener("click", () => {
      if (!isCurrent) void switchRearCamera(camera, index);
      else closeCameraSwitchOverlay();
    });
    list.append(option);
  });
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

cameraController = createRearCameraController({
  diagnostics: cameraDiagnostics,
  onChange: () => {
    refreshCameraSwitchUi();
    refreshVisibleDiagnostic();
  },
});

const getXrRunConfig = () => ({
  canvas: getCameraCanvas(),
  cameraConfig: {
    direction: XR8.XrConfig.camera().BACK,
  },
  allowedDevices: XR8.XrConfig.device().ANY,
});

const runXrSession = () => {
  runtimeDiagnostics.xrRunStartedAt = new Date().toISOString();
  if (cameraSwitchSupported) cameraController?.beginManagedRequestWindow();
  XR8.run(getXrRunConfig());
};

const waitForCameraRelease = () => new Promise((resolve) => {
  requestAnimationFrame(() => setTimeout(resolve, 60));
});

const stopXrSession = async () => {
  if (cameraSwitchSupported) cameraController?.endManagedRequestWindow();
  await Promise.resolve(XR8.stop());
  await waitForCameraRelease();
};

const restartCameraSession = async ({ expectedLabel } = {}) => {
  await stopXrSession();
  const ready = waitForCameraSession(expectedLabel);
  try {
    runXrSession();
  } catch (error) {
    settleCameraSessionWaiter(error);
  }
  await ready;
};

const switchRearCamera = async (targetCamera, listIndex) => {
  if (!cameraSwitchSupported || cameraSwitching || !cameraController?.isInstalled()) return;
  const previousCamera = cameraController.getCurrentRearCamera();
  const switchId = ++cameraSwitchSequence;
  const switchStartedAt = performance.now();
  cameraSwitching = true;
  closeCameraSwitchOverlay();
  refreshCameraSwitchUi();
  showCameraToast("正在切换后置摄像头...");
  cameraController.recordSwitchEvent({
    switchId,
    phase: "started",
    requestedListIndex: listIndex,
    requestedLabel: targetCamera.label,
  });

  try {
    if (!cameraController.setRequestedCamera(targetCamera, "user")) {
      throw new Error("所选后置摄像头暂不可用。");
    }
    await restartCameraSession({
      expectedLabel: targetCamera.label,
    });
    cameraController.rememberCamera(targetCamera.label);
    cameraController.recordSwitchEvent({
      switchId,
      phase: "completed",
      selectedLabel: cameraDiagnostics.track?.label || targetCamera.label,
      elapsedMs: Math.round(performance.now() - switchStartedAt),
    });
    showCameraToast(`已切换到后置摄像头 ${listIndex + 1}`);
  } catch (error) {
    recordError("camera-switch", error);
    cameraController.recordSwitchEvent({
      switchId,
      phase: "failed",
      requestedLabel: targetCamera.label,
      error: serializeError(error),
    });

    try {
      if (previousCamera) cameraController.setRequestedCamera(previousCamera, "previous");
      else cameraController.clearRequestedCamera();
      await restartCameraSession({
        expectedLabel: previousCamera?.label || "",
      });
    } catch (fallbackError) {
      recordError("camera-switch-fallback", fallbackError);
      showRuntimeDiagnostic("camera-switch-fallback", fallbackError);
    }
    showCameraToast("切换失败，已尝试恢复原后摄", true);
  } finally {
    cameraSwitching = false;
    refreshCameraSwitchUi();
    refreshVisibleDiagnostic();
  }
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

  return ensureXrController().then(async () => {
    try {
      if (cameraSwitchSupported) await cameraController?.primeInventory();
    } catch (e) {
      // Ignore enumeration errors
    }
    XR8.XrController.configure({
      imageTargetData: [IMAGE_TARGET_DATA],
      disableWorldTracking: true,
    });

    XR8.addCameraPipelineModules([
      XR8.GlTextureRenderer.pipelineModule(),
      XR8.Threejs.pipelineModule(),
      XR8.XrController.pipelineModule(),
      ...optionalPipelineModule(window.XRExtras?.FullWindowCanvas),
      fullscreenCameraDiagnosticsPipelineModule({
        onLayout: (layout) => {
          recordCameraLayout(cameraDiagnostics, layout, refreshVisibleDiagnostic);
        },
      }),
      ...optionalPipelineModule(window.XRExtras?.Loading),
      ...optionalPipelineModule(window.XRExtras?.RuntimeError),
      cadiphyRuntimeDiagnosticsPipelineModule(),
      cadiphyStartGatePipelineModule(),
      cadiphyBloomPipelineModule(),
    ]);

    runXrSession();
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

const copyCurrentPageUrl = (button) => {
  const pageUrl = window.location.href;
  const done = () => {
    button.textContent = "链接已复制";
  };
  const fallbackCopy = () => {
    const textarea = document.createElement("textarea");
    textarea.value = pageUrl;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-1000px";
    document.body.append(textarea);
    textarea.select();
    try {
      if (document.execCommand("copy")) done();
    } catch {
      // The visible URL remains available for long-press copy.
    }
    textarea.remove();
  };

  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(pageUrl).then(done).catch(fallbackCopy);
  } else {
    fallbackCopy();
  }
};

const getChromeIntentUrl = () => {
  const pageUrl = new URL(window.location.href);
  const scheme = pageUrl.protocol === "http:" ? "http" : "https";
  return `intent://${pageUrl.host}${pageUrl.pathname}${pageUrl.search}` +
    `#Intent;scheme=${scheme};package=com.android.chrome;end`;
};

const showUnsupportedHuaweiBrowser = () => {
  if (document.getElementById(HUAWEI_BROWSER_BLOCK_ID)) return;
  document.body.classList.add("cadiphy-browser-blocked");

  const overlay = document.createElement("section");
  overlay.id = HUAWEI_BROWSER_BLOCK_ID;
  overlay.className = "cadiphy-browser-block cadiphy-ui";
  overlay.setAttribute("role", "alertdialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "cadiphy-browser-block-title");

  const shell = document.createElement("div");
  shell.className = "cadiphy-browser-block-shell";

  const mark = document.createElement("div");
  mark.className = "cadiphy-browser-block-mark";
  mark.setAttribute("aria-hidden", "true");
  mark.textContent = "!";

  const title = document.createElement("h1");
  title.id = "cadiphy-browser-block-title";
  title.textContent = "请使用 Chrome 浏览器";

  const message = document.createElement("p");
  message.textContent = "华为浏览器暂不支持此 AR 体验。请切换到 Chrome 浏览器后重新打开当前页面。";

  const chromeLink = document.createElement("a");
  chromeLink.className = "cadiphy-browser-block-primary";
  chromeLink.href = getChromeIntentUrl();
  chromeLink.textContent = "在 Chrome 中打开";

  const manualHint = document.createElement("p");
  manualHint.className = "cadiphy-browser-block-hint";
  manualHint.textContent = "如果未安装 Chrome，可复制下面的链接，安装后在 Chrome 中打开。";

  const urlRow = document.createElement("div");
  urlRow.className = "cadiphy-browser-block-url-row";
  const urlText = document.createElement("code");
  urlText.textContent = window.location.href;
  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.textContent = "复制链接";
  copyButton.addEventListener("click", () => copyCurrentPageUrl(copyButton));
  urlRow.append(urlText, copyButton);

  shell.append(mark, title, message, chromeLink, manualHint, urlRow);
  if (CAMERA_DEBUG_ENABLED) {
    const diagnosticButton = document.createElement("button");
    diagnosticButton.type = "button";
    diagnosticButton.className = "cadiphy-browser-block-diagnostic";
    diagnosticButton.textContent = "查看诊断信息";
    diagnosticButton.addEventListener("click", () => {
      showRuntimeDiagnostic("unsupported-huawei-browser");
    });
    shell.append(diagnosticButton);
  }
  overlay.append(shell);
  document.body.append(overlay);
};

const installStartScreen = () => {
  installCameraDebugEntry();

  if (isUnsupportedHuaweiBrowser) {
    runtimeDiagnostics.startupBlockedAt = new Date().toISOString();
    showUnsupportedHuaweiBrowser();
    return;
  }

  if (cameraSwitchSupported) {
    cameraController?.install();
    ensureCameraSwitchUi();
  } else {
    removeCameraSwitchUi();
  }

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
