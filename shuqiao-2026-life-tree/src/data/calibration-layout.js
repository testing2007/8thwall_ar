import { CONFIG } from "../config";
import {
  calibrationLayers,
  coreLayouts,
  energyPaths,
  particleZones,
} from "./energy-paths";

const PATH_GROUPS = new Set(["root", "trunk", "main-branch", "side-branch"]);
const clonePoint = (point) => [Number(point[0]), Number(point[1])];

const defaultLayerLayout = () => ({
  energyZMm: calibrationLayers.energyZMm,
  barkZMm: calibrationLayers.barkZMm,
});

const defaultPathWidthMm = (path) =>
  CONFIG.energy.outerWidth *
  (CONFIG.energy.groupWidthScale[path.group] || 1) *
  1000;

const clonePath = (path) => ({
  id: String(path.id),
  group: PATH_GROUPS.has(path.group)
    ? path.group
    : CONFIG.calibration.newPathGroup,
  delay: Number(path.delay) || 0,
  colors: Array.isArray(path.colors) && path.colors.length >= 2
    ? [String(path.colors[0]), String(path.colors[1])]
    : ["#ffd05a", "#f2a845"],
  widthMm: Number(path.widthMm ?? defaultPathWidthMm(path)),
  points: path.points.map(clonePoint),
});

export const cloneCalibrationLayout = (layout) => ({
  version: 3,
  paths: layout.paths.map(clonePath),
  cores: layout.cores.map((core) => ({
    id: core.id,
    center: clonePoint(core.center),
    size: clonePoint(core.size),
  })),
  particleZones: layout.particleZones.map((zone) => ({
    id: zone.id,
    center: clonePoint(zone.center),
    width: Number(zone.width),
    height: Number(zone.height),
  })),
  layers: {
    energyZMm: Number(
      layout.layers?.energyZMm ?? defaultLayerLayout().energyZMm,
    ),
    barkZMm: Number(
      layout.layers?.barkZMm ?? defaultLayerLayout().barkZMm,
    ),
  },
});

export const createDefaultCalibrationLayout = () =>
  cloneCalibrationLayout({
    paths: energyPaths,
    cores: coreLayouts,
    particleZones,
    layers: defaultLayerLayout(),
  });

const finitePoint = (value) =>
  Array.isArray(value) &&
  value.length === 2 &&
  value.every((coordinate) => Number.isFinite(Number(coordinate)));

const clampPoint = (point) => [
  Math.round(Math.min(CONFIG.puzzle.imageWidth, Math.max(0, Number(point[0])))),
  Math.round(Math.min(CONFIG.puzzle.imageHeight, Math.max(0, Number(point[1])))),
];

const positiveSize = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
};

const clampNumber = (value, fallback, minimum, maximum) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, number));
};

const normalizePath = (candidate, fallback = null) => {
  if (
    !candidate ||
    !candidate.id ||
    !Array.isArray(candidate.points) ||
    candidate.points.length < 2 ||
    !candidate.points.every(finitePoint)
  ) {
    return null;
  }
  const basis = fallback || {
    id: candidate.id,
    group: CONFIG.calibration.newPathGroup,
    delay: 0,
    colors: ["#ffd05a", "#f2a845"],
    widthMm: CONFIG.calibration.newPathWidthMm,
  };
  const range = CONFIG.calibration.pathWidthRangeMm;
  return {
    id: String(candidate.id),
    group: PATH_GROUPS.has(candidate.group) ? candidate.group : basis.group,
    delay: Math.max(0, Number(candidate.delay ?? basis.delay) || 0),
    colors:
      Array.isArray(candidate.colors) && candidate.colors.length >= 2
        ? [String(candidate.colors[0]), String(candidate.colors[1])]
        : [...basis.colors],
    widthMm: clampNumber(
      candidate.widthMm,
      basis.widthMm ?? defaultPathWidthMm(basis),
      range[0],
      range[1],
    ),
    points: candidate.points.map(clampPoint),
  };
};

/** V3 paths are authoritative, so added/deleted paths survive local import/export. */
export const mergeCalibrationLayout = (defaults, override) => {
  const merged = cloneCalibrationLayout(defaults);
  if (!override || typeof override !== "object") return merged;

  const defaultsById = new Map(merged.paths.map((path) => [path.id, path]));
  const overridePaths = Array.isArray(override.paths) ? override.paths : [];
  if (Number(override.version) >= 3) {
    const ids = new Set();
    merged.paths = overridePaths
      .map((candidate) => normalizePath(candidate, defaultsById.get(candidate?.id)))
      .filter((path) => path && !ids.has(path.id) && ids.add(path.id));
  } else {
    const pathOverrides = new Map(
      overridePaths.map((item) => [item?.id, item]),
    );
    merged.paths = merged.paths.map((path) =>
      normalizePath(pathOverrides.get(path.id) || path, path),
    );
  }

  const coreOverrides = new Map(
    (Array.isArray(override.cores) ? override.cores : []).map((item) => [item?.id, item]),
  );
  merged.cores.forEach((core) => {
    const candidate = coreOverrides.get(core.id);
    if (candidate && finitePoint(candidate.center)) core.center = clampPoint(candidate.center);
    if (candidate && finitePoint(candidate.size)) {
      core.size = [
        positiveSize(candidate.size[0], core.size[0]),
        positiveSize(candidate.size[1], core.size[1]),
      ];
    }
  });

  const zoneOverrides = new Map(
    (Array.isArray(override.particleZones) ? override.particleZones : []).map(
      (item) => [item?.id, item],
    ),
  );
  merged.particleZones.forEach((zone) => {
    const candidate = zoneOverrides.get(zone.id);
    if (candidate && finitePoint(candidate.center)) zone.center = clampPoint(candidate.center);
    if (candidate) {
      zone.width = positiveSize(candidate.width, zone.width);
      zone.height = positiveSize(candidate.height, zone.height);
    }
  });

  const energyRange = CONFIG.barkOcclusion.energyZRangeMm;
  const barkRange = CONFIG.barkOcclusion.barkZRangeMm;
  const candidateLayers = override.layers || {};
  merged.layers.energyZMm = clampNumber(
    candidateLayers.energyZMm,
    merged.layers.energyZMm,
    energyRange[0],
    energyRange[1],
  );
  merged.layers.barkZMm = clampNumber(
    candidateLayers.barkZMm,
    merged.layers.barkZMm,
    barkRange[0],
    barkRange[1],
  );
  merged.layers.barkZMm = Math.max(
    merged.layers.barkZMm,
    merged.layers.energyZMm + CONFIG.barkOcclusion.minLayerGapMm,
  );
  return merged;
};
