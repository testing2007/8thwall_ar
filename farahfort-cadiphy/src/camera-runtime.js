const DEFAULT_VIDEO_WIDTH = 960;
const DEFAULT_VIDEO_HEIGHT = 720;
const LOW_RESOLUTION_PIXEL_COUNT = 960 * 720;

const finitePositive = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
};

const roundSize = (value) => Math.max(1, Math.round(value));

const currentViewportSize = () => {
  const viewport = window.visualViewport;
  return {
    width: finitePositive(viewport?.width, window.innerWidth || document.documentElement.clientWidth || 1),
    height: finitePositive(viewport?.height, window.innerHeight || document.documentElement.clientHeight || 1),
  };
};

const orientVideoSize = ({ videoWidth, videoHeight, viewportWidth, viewportHeight }) => {
  const longSide = Math.max(
    finitePositive(videoWidth, DEFAULT_VIDEO_WIDTH),
    finitePositive(videoHeight, DEFAULT_VIDEO_HEIGHT),
  );
  const shortSide = Math.min(
    finitePositive(videoWidth, DEFAULT_VIDEO_WIDTH),
    finitePositive(videoHeight, DEFAULT_VIDEO_HEIGHT),
  );

  return viewportWidth > viewportHeight
    ? { width: longSide, height: shortSide }
    : { width: shortSide, height: longSide };
};

export const calculateContainedCanvasLayout = ({
  videoWidth,
  videoHeight,
  viewportWidth,
  viewportHeight,
}) => {
  const safeViewportWidth = finitePositive(viewportWidth, 1);
  const safeViewportHeight = finitePositive(viewportHeight, 1);
  const source = orientVideoSize({
    videoWidth,
    videoHeight,
    viewportWidth: safeViewportWidth,
    viewportHeight: safeViewportHeight,
  });
  const sourceAspect = source.width / source.height;
  const viewportAspect = safeViewportWidth / safeViewportHeight;

  let cssWidth;
  let cssHeight;
  if (sourceAspect > viewportAspect) {
    cssWidth = safeViewportWidth;
    cssHeight = cssWidth / sourceAspect;
  } else {
    cssHeight = safeViewportHeight;
    cssWidth = cssHeight * sourceAspect;
  }

  const legacyCropScale = Math.max(sourceAspect, viewportAspect) /
    Math.min(sourceAspect, viewportAspect);

  return {
    mode: "contain",
    sourceWidth: roundSize(source.width),
    sourceHeight: roundSize(source.height),
    cssWidth: roundSize(cssWidth),
    cssHeight: roundSize(cssHeight),
    bufferWidth: roundSize(source.width),
    bufferHeight: roundSize(source.height),
    viewportWidth: roundSize(safeViewportWidth),
    viewportHeight: roundSize(safeViewportHeight),
    screenWidth: roundSize(finitePositive(window.screen?.width, safeViewportWidth)),
    screenHeight: roundSize(finitePositive(window.screen?.height, safeViewportHeight)),
    orientation: safeViewportWidth > safeViewportHeight ? "landscape" : "portrait",
    screenOrientation: window.screen?.orientation?.type || null,
    legacyCropScale: Number(legacyCropScale.toFixed(3)),
    devicePixelRatio: finitePositive(window.devicePixelRatio, 1),
  };
};

// Cover (crop-to-fill) layout: the camera image is scaled up so that it
// completely covers the viewport with no letterboxing. The portion of the
// camera image that extends beyond the viewport edges is clipped by overflow:hidden.
export const calculateCoverCanvasLayout = ({
  videoWidth,
  videoHeight,
  viewportWidth,
  viewportHeight,
}) => {
  const safeViewportWidth = finitePositive(viewportWidth, 1);
  const safeViewportHeight = finitePositive(viewportHeight, 1);
  const source = orientVideoSize({
    videoWidth,
    videoHeight,
    viewportWidth: safeViewportWidth,
    viewportHeight: safeViewportHeight,
  });
  const sourceAspect = source.width / source.height;
  const viewportAspect = safeViewportWidth / safeViewportHeight;

  // Scale so that the camera COVERS the viewport (no black bars).
  let cssWidth;
  let cssHeight;
  if (sourceAspect > viewportAspect) {
    // Camera is wider than viewport: fit by height, clip sides
    cssHeight = safeViewportHeight;
    cssWidth = cssHeight * sourceAspect;
  } else {
    // Camera is taller than viewport: fit by width, clip top/bottom
    cssWidth = safeViewportWidth;
    cssHeight = cssWidth / sourceAspect;
  }

  const legacyCropScale = Math.max(sourceAspect, viewportAspect) /
    Math.min(sourceAspect, viewportAspect);

  return {
    mode: "cover",
    sourceWidth: roundSize(source.width),
    sourceHeight: roundSize(source.height),
    cssWidth: roundSize(cssWidth),
    cssHeight: roundSize(cssHeight),
    bufferWidth: roundSize(source.width),
    bufferHeight: roundSize(source.height),
    viewportWidth: roundSize(safeViewportWidth),
    viewportHeight: roundSize(safeViewportHeight),
    screenWidth: roundSize(finitePositive(window.screen?.width, safeViewportWidth)),
    screenHeight: roundSize(finitePositive(window.screen?.height, safeViewportHeight)),
    orientation: safeViewportWidth > safeViewportHeight ? "landscape" : "portrait",
    screenOrientation: window.screen?.orientation?.type || null,
    legacyCropScale: Number(legacyCropScale.toFixed(3)),
    devicePixelRatio: finitePositive(window.devicePixelRatio, 1),
  };
};

const applyCanvasStyle = (canvas, layout) => {
  // In cover mode the canvas is larger than the viewport; centering via
  // translate(-50%,-50%) clips the overflow naturally when the parent has
  // overflow:hidden (the body already does via the global CSS).
  const style = {
    position: "fixed",
    left: "50%",
    top: "50%",
    width: `${layout.cssWidth}px`,
    height: `${layout.cssHeight}px`,
    maxWidth: "none",
    maxHeight: "none",
    margin: "0",
    padding: "0",
    border: "0",
    display: "block",
    overflow: "hidden",
    transform: "translate(-50%, -50%)",
  };

  Object.entries(style).forEach(([property, value]) => {
    if (canvas.style[property] !== value) canvas.style[property] = value;
  });
};

export const fitCameraCanvasPipelineModule = ({ onLayout } = {}) => {
  let canvas = null;
  let videoWidth = DEFAULT_VIDEO_WIDTH;
  let videoHeight = DEFAULT_VIDEO_HEIGHT;
  let resizeFrame = 0;
  let originalStyle = null;

  const applyLayout = () => {
    if (!canvas) return;
    const viewport = currentViewportSize();
    // Use cover layout so the camera feed fills the full viewport with no
    // black bars, matching iOS Safari behaviour and keeping AR scale correct.
    const layout = calculateCoverCanvasLayout({
      videoWidth,
      videoHeight,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
    });

    applyCanvasStyle(canvas, layout);
    if (canvas.width !== layout.bufferWidth) canvas.width = layout.bufferWidth;
    if (canvas.height !== layout.bufferHeight) canvas.height = layout.bufferHeight;
    document.body.classList.remove("cadiphy-camera-contain");
    document.body.classList.add("cadiphy-camera-cover");
    onLayout?.({
      ...layout,
      clientWidth: canvas.clientWidth,
      clientHeight: canvas.clientHeight,
    });
  };

  const scheduleLayout = () => {
    if (resizeFrame) cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      applyLayout();
    });
  };

  const updateVideoSize = (width, height) => {
    videoWidth = finitePositive(width, videoWidth);
    videoHeight = finitePositive(height, videoHeight);
    scheduleLayout();
  };

  const onWindowResize = () => scheduleLayout();

  return {
    name: "cadiphy-fit-camera-canvas",
    onAttach: ({ canvas: attachedCanvas, videoWidth: width, videoHeight: height }) => {
      canvas = attachedCanvas;
      originalStyle = canvas.getAttribute("style");
      videoWidth = finitePositive(width, videoWidth);
      videoHeight = finitePositive(height, videoHeight);
      window.addEventListener("resize", onWindowResize, { passive: true });
      window.addEventListener("orientationchange", onWindowResize, { passive: true });
      window.visualViewport?.addEventListener("resize", onWindowResize, { passive: true });
      applyLayout();
    },
    onCameraStatusChange: ({ status, video }) => {
      if (status === "hasVideo" && video) {
        updateVideoSize(video.videoWidth, video.videoHeight);
      }
    },
    onVideoSizeChange: ({ videoWidth: width, videoHeight: height }) => {
      updateVideoSize(width, height);
    },
    onDeviceOrientationChange: ({ videoWidth: width, videoHeight: height }) => {
      updateVideoSize(width, height);
    },
    onCanvasSizeChange: ({ videoWidth: width, videoHeight: height }) => {
      updateVideoSize(width, height);
    },
    onUpdate: () => {
      if (!canvas) return;
      const viewport = currentViewportSize();
      const expected = calculateContainedCanvasLayout({
        videoWidth,
        videoHeight,
        viewportWidth: viewport.width,
        viewportHeight: viewport.height,
      });
      if (
        canvas.style.width !== `${expected.cssWidth}px` ||
        canvas.style.height !== `${expected.cssHeight}px`
      ) {
        applyCanvasStyle(canvas, expected);
      }
    },
    onDetach: () => {
      if (resizeFrame) cancelAnimationFrame(resizeFrame);
      resizeFrame = 0;
      window.removeEventListener("resize", onWindowResize);
      window.removeEventListener("orientationchange", onWindowResize);
      window.visualViewport?.removeEventListener("resize", onWindowResize);
      document.body.classList.remove("cadiphy-camera-contain");
      document.body.classList.remove("cadiphy-camera-cover");
      if (canvas) {
        if (originalStyle === null) canvas.removeAttribute("style");
        else canvas.setAttribute("style", originalStyle);
      }
      canvas = null;
    },
  };
};
// FullWindowCanvas owns the canvas sizing. This module only records the final
// full-screen layout so diagnostics cannot accidentally change AR projection.
export const fullscreenCameraDiagnosticsPipelineModule = ({ onLayout } = {}) => {
  let canvas = null;
  let videoWidth = DEFAULT_VIDEO_WIDTH;
  let videoHeight = DEFAULT_VIDEO_HEIGHT;
  let resizeFrame = 0;
  let updateFramesRemaining = 0;

  const reportLayout = () => {
    if (!canvas) return;
    const viewport = currentViewportSize();
    const source = orientVideoSize({
      videoWidth,
      videoHeight,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
    });
    const sourceAspect = source.width / source.height;
    const viewportAspect = viewport.width / viewport.height;
    const fullscreenCropScale = Math.max(sourceAspect, viewportAspect) /
      Math.min(sourceAspect, viewportAspect);

    document.body.classList.remove("cadiphy-camera-contain", "cadiphy-camera-cover");
    onLayout?.({
      mode: "cover",
      sourceWidth: roundSize(source.width),
      sourceHeight: roundSize(source.height),
      cssWidth: roundSize(canvas.clientWidth || viewport.width),
      cssHeight: roundSize(canvas.clientHeight || viewport.height),
      bufferWidth: roundSize(canvas.width || source.width),
      bufferHeight: roundSize(canvas.height || source.height),
      viewportWidth: roundSize(viewport.width),
      viewportHeight: roundSize(viewport.height),
      screenWidth: roundSize(finitePositive(window.screen?.width, viewport.width)),
      screenHeight: roundSize(finitePositive(window.screen?.height, viewport.height)),
      orientation: viewport.width > viewport.height ? "landscape" : "portrait",
      screenOrientation: window.screen?.orientation?.type || null,
      fullscreenCropScale: Number(fullscreenCropScale.toFixed(3)),
      devicePixelRatio: finitePositive(window.devicePixelRatio, 1),
      clientWidth: canvas.clientWidth,
      clientHeight: canvas.clientHeight,
    });
  };

  const scheduleReport = () => {
    if (resizeFrame) cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      reportLayout();
    });
  };

  const updateVideoSize = (width, height) => {
    videoWidth = finitePositive(width, videoWidth);
    videoHeight = finitePositive(height, videoHeight);
    updateFramesRemaining = 4;
    scheduleReport();
  };

  return {
    name: "cadiphy-fullscreen-camera-diagnostics",
    onAttach: ({ canvas: attachedCanvas, videoWidth: width, videoHeight: height }) => {
      canvas = attachedCanvas;
      videoWidth = finitePositive(width, videoWidth);
      videoHeight = finitePositive(height, videoHeight);
      updateFramesRemaining = 4;
      window.addEventListener("resize", scheduleReport, { passive: true });
      window.addEventListener("orientationchange", scheduleReport, { passive: true });
      window.visualViewport?.addEventListener("resize", scheduleReport, { passive: true });
      scheduleReport();
    },
    onCameraStatusChange: ({ status, video }) => {
      if (status === "hasVideo" && video) updateVideoSize(video.videoWidth, video.videoHeight);
    },
    onVideoSizeChange: ({ videoWidth: width, videoHeight: height }) => {
      updateVideoSize(width, height);
    },
    onDeviceOrientationChange: ({ videoWidth: width, videoHeight: height }) => {
      updateVideoSize(width, height);
    },
    onCanvasSizeChange: ({ videoWidth: width, videoHeight: height }) => {
      updateVideoSize(width, height);
    },
    onUpdate: () => {
      if (updateFramesRemaining <= 0) return;
      updateFramesRemaining -= 1;
      reportLayout();
    },
    onDetach: () => {
      if (resizeFrame) cancelAnimationFrame(resizeFrame);
      resizeFrame = 0;
      window.removeEventListener("resize", scheduleReport);
      window.removeEventListener("orientationchange", scheduleReport);
      window.visualViewport?.removeEventListener("resize", scheduleReport);
      document.body.classList.remove("cadiphy-camera-contain", "cadiphy-camera-cover");
      canvas = null;
    },
  };
};
const cloneConstraintValue = (value) => {
  if (Array.isArray(value)) return value.slice(0, 12);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => typeof entry !== "object")
        .slice(0, 12),
    );
  }
  return value;
};

const pickProperties = (source, properties) => {
  if (!source) return {};
  return Object.fromEntries(
    properties
      .filter((property) => source[property] !== undefined)
      .map((property) => [property, cloneConstraintValue(source[property])]),
  );
};

const callTrackMethod = (track, method) => {
  try {
    return track?.[method]?.call(track) || {};
  } catch {
    return {};
  }
};

const cameraWarnings = (camera) => {
  const warnings = [];
  const settings = camera.track?.settings || {};
  const capabilities = camera.track?.capabilities || {};
  const label = String(camera.track?.label || "").toLowerCase();
  const pixelCount = finitePositive(settings.width, 0) * finitePositive(settings.height, 0);

  if (pixelCount > 0 && pixelCount <= LOW_RESOLUTION_PIXEL_COUNT) {
    warnings.push("low-camera-resolution");
  }
  if (settings.facingMode === "user" || /front|selfie|user|前置/.test(label)) {
    warnings.push("unexpected-front-camera");
  }
  if (/tele|macro|ultra[ -]?wide|长焦|微距|超广角/.test(label)) {
    warnings.push("possible-non-main-rear-camera");
  }

  const zoom = Number(settings.zoom);
  const minimumZoom = Number(capabilities.zoom?.min ?? 1);
  if (Number.isFinite(zoom) && Number.isFinite(minimumZoom) && zoom > minimumZoom + 0.05) {
    warnings.push("non-default-camera-zoom");
  }
  if (camera.layout?.fullscreenCropScale >= 1.35) {
    warnings.push("high-fullscreen-crop");
  }
  return warnings;
};

export const createCameraDiagnosticsState = () => ({
  requestedDirection: "back",
  layoutMode: "cover",
  status: "not-started",
  track: null,
  video: null,
  layout: null,
  availableCameras: [],
  selectedCameraIndex: null,
  warnings: [],
});

const refreshCameraList = (camera, selectedDeviceId, onChange) => {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  navigator.mediaDevices.enumerateDevices()
    .then((devices) => {
      const cameras = devices.filter((device) => device.kind === "videoinput");
      camera.availableCameras = cameras.map((device, index) => ({
        index,
        label: device.label || `camera-${index + 1}`,
      }));
      const selectedIndex = cameras.findIndex((device) => device.deviceId === selectedDeviceId);
      camera.selectedCameraIndex = selectedIndex >= 0 ? selectedIndex : null;
      camera.warnings = cameraWarnings(camera);
      onChange?.(camera);
    })
    .catch((error) => {
      camera.deviceEnumerationError = {
        name: error?.name || "Error",
        message: error?.message || String(error),
      };
      onChange?.(camera);
    });
};

export const recordCameraRuntimeStatus = (camera, event = {}, onChange) => {
  const { status, stream, video } = event;
  camera.status = status || camera.status || "unknown";

  if (status === "hasStream" && stream) {
    const track = stream.getVideoTracks?.()[0];
    if (track) {
      const settings = callTrackMethod(track, "getSettings");
      const capabilities = callTrackMethod(track, "getCapabilities");
      camera.track = {
        label: track.label || "",
        readyState: track.readyState,
        muted: track.muted,
        settings: pickProperties(settings, [
          "width", "height", "aspectRatio", "frameRate", "facingMode", "resizeMode",
          "zoom", "focusMode", "torch",
        ]),
        capabilities: pickProperties(capabilities, [
          "width", "height", "aspectRatio", "frameRate", "facingMode", "resizeMode",
          "zoom", "focusMode", "torch",
        ]),
      };
      refreshCameraList(camera, settings.deviceId, onChange);
    }
  }

  if (status === "hasVideo" && video) {
    camera.video = {
      width: video.videoWidth || 0,
      height: video.videoHeight || 0,
      readyState: video.readyState,
    };
  }

  camera.warnings = cameraWarnings(camera);
  onChange?.(camera);
};

export const recordCameraLayout = (camera, layout, onChange) => {
  camera.layout = layout;
  camera.warnings = cameraWarnings(camera);
  onChange?.(camera);
};

const STORAGE_KEY_REAR_CAMERA = "CADIPHY_REAR_CAMERA_LABEL";

const isFrontCamera = (device) => {
  const label = String(device.label || "").toLowerCase();
  return /front|selfie|user|前置/.test(label);
};

const isRearCamera = (device) => {
  if (device.kind !== "videoinput") return false;
  if (isFrontCamera(device)) return false;
  const label = String(device.label || "").toLowerCase();
  return /back|rear|environment|后置/.test(label);
};

const classifyCamera = (device) => {
  if (isFrontCamera(device)) return { classification: "front", reason: "label-front" };
  if (isRearCamera(device)) return { classification: "rear", reason: "label-facing-back" };
  return { classification: "unknown", reason: "unconfirmed" };
};

const scoreRearCameraRecommendation = (device) => {
  const label = String(device.label || "").toLowerCase();
  let score = 100;
  // Penalize non-main cameras
  if (/tele|长焦|zoom/.test(label)) score -= 60;
  if (/ultra[ -]?wide|super[ -]?wide|超广角|广角/.test(label)) score -= 40;
  if (/macro|微距/.test(label)) score -= 50;
  if (/depth|tof|3d/.test(label)) score -= 80;
  if (/main|primary|default|wide/.test(label)) score += 20;
  if (/camera2?\s*0(?:\D|$)/.test(label)) score += 25;
  return score;
};

const hasReliableMainCameraHint = (device) => {
  const label = String(device?.label || "").toLowerCase();
  if (/tele|长焦|zoom|ultra[ -]?wide|super[ -]?wide|超广角|macro|微距|depth|tof|3d/.test(label)) {
    return false;
  }
  return /main|primary|default|wide/.test(label) || /camera2?\s*0(?:\D|$)/.test(label);
};

export const createRearCameraController = ({ diagnostics, onChange } = {}) => {
  let installed = false;
  let managedWindow = false;
  let originalGUM = null;
  let allDevices = [];
  let rearCameras = [];
  let currentRearCamera = null;
  let requestedCamera = null;
  let requestedSource = "auto";
  let switchHistory = [];

  const readStoredLabel = () => {
    try {
      return localStorage.getItem(STORAGE_KEY_REAR_CAMERA) || "";
    } catch {
      return "";
    }
  };

  const writeStoredLabel = (label) => {
    try {
      if (label) localStorage.setItem(STORAGE_KEY_REAR_CAMERA, label);
      else localStorage.removeItem(STORAGE_KEY_REAR_CAMERA);
    } catch {
      // Ignore storage errors
    }
  };

  const getRecommendedRearCamera = () => {
    if (!rearCameras.length) return null;
    const scored = rearCameras
      .map((cam) => ({ cam, score: scoreRearCameraRecommendation(cam) }))
      .sort((a, b) => b.score - a.score);
    return scored[0]?.cam || rearCameras[0];
  };

  const updateCameraLists = (devices) => {
    allDevices = devices.filter((d) => d.kind === "videoinput");
    const seenRearLabels = new Set();
    rearCameras = allDevices.filter((device) => {
      if (!isRearCamera(device)) return false;
      const key = String(device.label || "").trim().toLowerCase();
      if (key && seenRearLabels.has(key)) return false;
      if (key) seenRearLabels.add(key);
      return true;
    });

    const rememberedLabel = readStoredLabel();
    if (rememberedLabel && !requestedCamera) {
      const match = rearCameras.find((c) => c.label === rememberedLabel);
      if (match) {
        requestedCamera = match;
        requestedSource = "saved";
      }
    }

    if (diagnostics) {
      const classified = allDevices.map((device, index) => ({
        index,
        label: device.label || `camera-${index + 1}`,
        ...classifyCamera(device),
      }));
      diagnostics.cameraCounts = {
        total: allDevices.length,
        rear: rearCameras.length,
        front: classified.filter((camera) => camera.classification === "front").length,
        unknown: classified.filter((camera) => camera.classification === "unknown").length,
      };
      diagnostics.cameraClassification = classified;
      diagnostics.selection = {
        ...(diagnostics.selection || {}),
        source: requestedSource,
        savedLabelMatched: Boolean(rememberedLabel && rearCameras.some((c) => c.label === rememberedLabel)),
        recommendedLabel: getRecommendedRearCamera()?.label || "",
        requestedLabel: requestedCamera?.label || "",
        automaticSelection: requestedCamera
          ? requestedSource
          : (hasReliableMainCameraHint(getRecommendedRearCamera()) ? "main-label" : "browser-default"),
      };
    }
    onChange?.();
  };

  const primeInventory = async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      updateCameraLists(devices);
      return rearCameras;
    } catch (e) {
      return [];
    }
  };

  const install = () => {
    if (installed || !navigator.mediaDevices?.getUserMedia) return;
    installed = true;
    originalGUM = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);

    navigator.mediaDevices.getUserMedia = async function (constraints) {
      const videoConstraints = constraints?.video;
      if (videoConstraints && typeof videoConstraints === "object") {
        const recommendedCamera = getRecommendedRearCamera();
        const targetCam = requestedCamera ||
          (hasReliableMainCameraHint(recommendedCamera) ? recommendedCamera : null);
        if (managedWindow && targetCam?.deviceId) {
          const modified = { ...constraints };
          const modifiedVideo = typeof videoConstraints === "boolean" ? {} : { ...videoConstraints };
          delete modifiedVideo.facingMode;
          modifiedVideo.deviceId = { exact: targetCam.deviceId };
          modified.video = modifiedVideo;
          try {
            return await originalGUM(modified);
          } catch (error) {
            recordSwitchEvent({
              phase: "exact-request-failed",
              requestedLabel: targetCam.label || "",
              fallback: "browser-default-rear",
              error: {
                name: error?.name || "Error",
                message: error?.message || String(error),
              },
            });
            return originalGUM(constraints);
          }
        }
      }
      return originalGUM(constraints);
    };

    void primeInventory();
  };

  const uninstall = () => {
    if (!installed) return;
    if (originalGUM && navigator.mediaDevices) {
      navigator.mediaDevices.getUserMedia = originalGUM;
    }
    installed = false;
    originalGUM = null;
  };

  const setRequestedCamera = (camera, source = "user") => {
    if (!camera) return false;
    const exists = rearCameras.some((c) => c.deviceId === camera.deviceId || (camera.label && c.label === camera.label));
    if (!exists) return false;
    requestedCamera = camera;
    requestedSource = source;
    if (diagnostics) {
      diagnostics.selection = {
        ...(diagnostics.selection || {}),
        source: requestedSource,
        recommendedLabel: getRecommendedRearCamera()?.label || "",
        requestedLabel: requestedCamera?.label || "",
      };
    }
    onChange?.();
    return exists;
  };

  const clearRequestedCamera = () => {
    requestedCamera = null;
    requestedSource = "auto";
    onChange?.();
  };

  const rememberCamera = (label) => {
    writeStoredLabel(label);
  };

  const observeStream = async (stream) => {
    const track = stream.getVideoTracks?.()[0];
    if (!track) return;
    const settings = track.getSettings?.() || {};
    const label = track.label || "";
    await primeInventory();
    currentRearCamera = rearCameras.find((c) => c.deviceId === settings.deviceId || (label && c.label === label)) || {
      deviceId: settings.deviceId || "",
      label,
    };
    if (diagnostics) {
      diagnostics.selection = {
        ...(diagnostics.selection || {}),
        finalLabel: label,
      };
    }
    onChange?.();
  };

  const recordSwitchEvent = (event) => {
    switchHistory.push({ time: new Date().toISOString(), ...event });
    if (switchHistory.length > 20) switchHistory.shift();
    if (diagnostics) diagnostics.switchHistory = switchHistory.slice();
  };

  return {
    install,
    uninstall,
    isInstalled: () => installed,
    primeInventory,
    getRearCameras: () => rearCameras,
    getCurrentRearCamera: () => currentRearCamera,
    getRecommendedRearCamera,
    setRequestedCamera,
    clearRequestedCamera,
    rememberCamera,
    observeStream,
    beginManagedRequestWindow: () => { managedWindow = true; },
    endManagedRequestWindow: () => { managedWindow = false; },
    recordSwitchEvent,
  };
};
