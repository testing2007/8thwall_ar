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
    // target.json is stored portrait and marked isRotated. In the displayed
    // landscape artwork this is an almost centred 853 x 640 crop.
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
    debug: 0.001,
    core: 0.002,
    energy: 0.003,
    particleMin: 0.005,
    particleMax: 0.03,
  }),

  core: Object.freeze({
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
        center: Object.freeze([305, 471]),
        size: Object.freeze([194, 194]),
        color: "#ff7a38",
        phase: 0,
      }),
      Object.freeze({
        id: "core-center",
        center: Object.freeze([566, 486]),
        size: Object.freeze([190, 186]),
        color: "#ffd34f",
        phase: 0.8,
      }),
      Object.freeze({
        id: "core-right",
        center: Object.freeze([782, 510]),
        size: Object.freeze([170, 160]),
        color: "#b9d95a",
        phase: 1.5,
      }),
    ]),
  }),

  energy: Object.freeze({
    outerWidth: 0.01,
    coreWidth: 0.0024,
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
      core: 0.95,
      body: 0.55,
      halo: 0.2,
    }),
    aliveStrength: Object.freeze({
      core: 0.55,
      body: 0.28,
      halo: 0.12,
    }),
    pulseMinSeconds: 3,
    pulseMaxSeconds: 6,
    pulseDuration: 1.8,
  }),

  particles: Object.freeze({
    lowCount: 96,
    mediumCount: 180,
    highCount: 280,
    minSize: 5,
    maxSize: 14,
    highlightRatio: 0.15,
    highlightMinSize: 12,
    highlightMaxSize: 20,
    minScreenSize: 5,
    shapeRatios: Object.freeze({
      soft: 0.6,
      leaf: 0.22,
      streak: 0.18,
    }),
    minLife: 5.5,
    maxLife: 9.5,
    minRise: 0.025,
    maxRise: 0.065,
    opacity: 0.78,
  }),

  performance: Object.freeze({
    pixelRatioCap: 1.75,
    maxDeltaSeconds: 0.1,
  }),
});
