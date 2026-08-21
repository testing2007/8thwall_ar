const hasDebugQuery = () => {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("debug") === "1";
};

export const CONFIG = Object.freeze({
  targetName: "target",
  debug: hasDebugQuery(),

  puzzle: Object.freeze({
    width: 0.7,
    height: 0.5,
    imageWidth: 894,
    imageHeight: 640,
    // Compiler crop expressed in the displayed 894 x 640 landscape artwork.
    // XR8 tracks this crop, while path.json is authored on the full image.
    crop: Object.freeze({ x: 20, y: 0, width: 853, height: 640 }),
  }),

  timeline: Object.freeze({
    coreEnd: 1.5,
    energyEnd: 4.5,
    particlesEnd: 7,
    awakeningEnd: 8,
    targetLostGraceMs: 3000,
  }),

  layers: Object.freeze({
    debug: 0.0016,
    core: 0.0003,
    energy: 0.00025,
    bark: 0.00055,
    particleMin: 0.002,
    particleMax: 0.012,
  }),

  core: Object.freeze({
    activationStart: 0.9,
    activationEnd: 2.15,
    intensity: 0.9,
    opacity: 0.78,
    aliveOpacity: 0.55,
    pulseSpeed: 0.72,
    sizeScale: 1.12,
    innerStrength: 1.25,
    middleStrength: 0.82,
    haloStrength: 0.42,
    ringStrength: 0.3,
    ringSpeed: 0.105,
    centers: Object.freeze([
      Object.freeze({
        id: "core-left",
        center: Object.freeze([350, 414]),
        size: Object.freeze([111, 89]),
        color: "#ff7a38",
        phase: 0,
      }),
      Object.freeze({
        id: "core-center",
        center: Object.freeze([522, 419]),
        size: Object.freeze([127, 118]),
        color: "#ffd34f",
        phase: 0.8,
      }),
      Object.freeze({
        id: "core-right",
        center: Object.freeze([674, 422]),
        size: Object.freeze([100, 98]),
        color: "#b9d95a",
        phase: 1.5,
      }),
    ]),
  }),

  energy: Object.freeze({
    outerWidth: 0.008,
    coreWidth: 0.0012,
    groupWidthScale: Object.freeze({
      root: 1,
      trunk: 1.35,
      "main-branch": 1.1,
      "side-branch": 0.8,
    }),
    speed: 0.16,
    filamentCount: 7,
    noiseStrength: 0.72,
    noiseFrequency: 18,
    headLength: 0.11,
    awakeningStrength: Object.freeze({
      core: 0.85,
      body: 0.48,
      halo: 0.08,
    }),
    aliveStrength: Object.freeze({
      core: 0.42,
      body: 0.22,
      halo: 0.04,
    }),
    pulseMinSeconds: 3,
    pulseMaxSeconds: 6,
    pulseDuration: 1.8,
    sequence: Object.freeze({
      root: Object.freeze({ start: 0.18, duration: 1.18 }),
      trunk: Object.freeze({ start: 1.05, duration: 1.42 }),
      "main-branch": Object.freeze({ start: 2.18, duration: 1.52 }),
      "side-branch": Object.freeze({ start: 3.08, duration: 1.32 }),
    }),
  }),

  internalFlow: Object.freeze({
    textureWidth: 512,
    maxArrivalSeconds: 5.2,
    corridorWidths: Object.freeze({
      root: 28,
      trunk: 34,
      "main-branch": 26,
      "side-branch": 20,
    }),
    veinWidths: Object.freeze({
      root: 8,
      trunk: 10,
      "main-branch": 7,
      "side-branch": 5,
    }),
    featherPixels: 7,
    headDuration: 0.62,
    awakeningIntensity: 1.05,
    aliveIntensity: 0.42,
    ridgeOpacity: 0.88,
    grooveOpacity: 0.24,
  }),

  barkOcclusion: Object.freeze({
    corridorWidths: Object.freeze({
      root: 30,
      trunk: 36,
      "main-branch": 28,
      "side-branch": 22,
    }),
    featherPixels: 6,
    grooveAlpha: 0.22,
    ridgeAlpha: 0.86,
    rebuildThrottleMs: 80,
    energyZRangeMm: Object.freeze([0, 1]),
    barkZRangeMm: Object.freeze([0.1, 1.5]),
    zStepMm: 0.05,
    minLayerGapMm: 0.1,
  }),

  calibration: Object.freeze({
    pathWidthRangeMm: Object.freeze([0.5, 30]),
    pathWidthStepMm: 0.25,
    newPathWidthMm: 6,
    newPathGroup: "side-branch",
    standalonePadding: 1.08,
  }),

  particles: Object.freeze({
    lowCount: 144,
    mediumCount: 280,
    highCount: 420,
    minSize: 8,
    maxSize: 20,
    highlightRatio: 0.2,
    highlightMinSize: 18,
    highlightMaxSize: 30,
    minScreenSize: 8,
    shapeRatios: Object.freeze({
      soft: 0.6,
      leaf: 0.22,
      streak: 0.18,
    }),
    minLife: 5.5,
    maxLife: 9.5,
    minRise: 0.012,
    maxRise: 0.028,
    opacity: 0.78,
  }),

  performance: Object.freeze({
    pixelRatioCap: 1.75,
    maxDeltaSeconds: 0.1,
  }),
});
