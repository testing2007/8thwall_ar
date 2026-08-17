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

const applyCanvasStyle = (canvas, layout) => {
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
    const layout = calculateContainedCanvasLayout({
      videoWidth,
      videoHeight,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
    });

    applyCanvasStyle(canvas, layout);
    if (canvas.width !== layout.bufferWidth) canvas.width = layout.bufferWidth;
    if (canvas.height !== layout.bufferHeight) canvas.height = layout.bufferHeight;
    document.body.classList.add("cadiphy-camera-contain");
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
      if (canvas) {
        if (originalStyle === null) canvas.removeAttribute("style");
        else canvas.setAttribute("style", originalStyle);
      }
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
  if (camera.layout?.legacyCropScale >= 1.35) {
    warnings.push("legacy-full-window-crop");
  }
  return warnings;
};

export const createCameraDiagnosticsState = () => ({
  requestedDirection: "back",
  layoutMode: "contain",
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
