import { CONFIG } from "../config";
import pathData from "./path.json";

// All points use the editable 894 x 640 source image coordinate system.
// Adjust only these arrays when a real-device alignment pass is needed.
const pathFallbacks = Object.freeze([
  {
    id: "root-left",
    group: "root",
    delay: 0,
    colors: ["#f06848", "#f7ba50"],
    points: [[171, 517], [219, 508], [258, 473], [252, 477], [328, 321]],
  },
  {
    id: "root-center-left",
    group: "root",
    delay: 0.08,
    colors: ["#e98742", "#ffd05a"],
    points: [[294, 514], [377, 478], [413, 452]],
  },
  {
    id: "root-center-right",
    group: "root",
    delay: 0.16,
    colors: ["#f4b64a", "#e4d65a"],
    points: [[458, 500], [542, 483], [586, 462], [603, 399], [530, 296]],
  },
  {
    id: "root-right",
    group: "root",
    delay: 0.24,
    colors: ["#d3cb51", "#7fbe86"],
    points: [[638, 286], [599, 405], [606, 458], [664, 501], [722, 521]],
  },
  {
    id: "trunk-left",
    group: "trunk",
    delay: 0,
    colors: ["#f1a145", "#f06a4b"],
    points: [[252, 518], [302, 441], [292, 388], [290, 365], [248, 347], [207, 347]],
  },
  {
    id: "trunk-center",
    group: "trunk",
    delay: 0.1,
    colors: ["#ffd057", "#f2a845"],
    points: [[326, 522], [397, 502], [433, 470], [440, 414], [439, 355], [426, 276], [378, 222]],
  },
  {
    id: "trunk-right",
    group: "trunk",
    delay: 0.2,
    colors: ["#e4cf55", "#74b98e"],
    points: [[473, 519], [534, 520], [558, 510], [609, 472], [604, 450], [613, 328]],
  },
  {
    id: "branch-center-left",
    group: "main-branch",
    delay: 0,
    colors: ["#f4ad49", "#ee6e52"],
    points: [[435, 430], [392, 398], [351, 370], [311, 337], [272, 296], [229, 253]],
  },
  {
    id: "branch-center-upper-left",
    group: "main-branch",
    delay: 0.1,
    colors: ["#f2a647", "#f28a62"],
    points: [[439, 368], [407, 319], [397, 311], [376, 259], [323, 207], [298, 184]],
  },
  {
    id: "branch-center-upper",
    group: "main-branch",
    delay: 0.18,
    colors: ["#f6bd4a", "#ffe57a"],
    points: [[442, 354], [458, 306], [476, 246], [488, 193], [523, 121], [524, 108]],
  },
  {
    id: "branch-center-right",
    group: "main-branch",
    delay: 0.26,
    colors: ["#f4c84d", "#c5d46a"],
    points: [[445, 420], [469, 358], [497, 329], [523, 307], [547, 279], [578, 260]],
  },
  {
    id: "branch-right-left",
    group: "main-branch",
    delay: 0.34,
    colors: ["#e2d354", "#8dc68c"],
    points: [[718, 433], [683, 393], [649, 354], [619, 315], [590, 271]],
  },
  {
    id: "branch-right-upper",
    group: "main-branch",
    delay: 0.42,
    colors: ["#c8d466", "#6db4a3"],
    points: [[466, 305], [506, 270], [584, 196]],
  },
  {
    id: "branch-left-canopy",
    group: "side-branch",
    delay: 0,
    colors: ["#e96d55", "#d75f7f"],
    points: [[306, 400], [327, 361], [308, 321]],
  },
  {
    id: "branch-mid-left-canopy",
    group: "side-branch",
    delay: 0.13,
    colors: ["#ef8755", "#e57374"],
    points: [[429, 373], [381, 332], [347, 315], [312, 288], [288, 272], [251, 220]],
  },
  {
    id: "branch-upper-right-canopy",
    group: "side-branch",
    delay: 0.26,
    colors: ["#ddd55d", "#67b6a4"],
    points: [[639, 501], [616, 456], [617, 382], [647, 347], [675, 331], [709, 322]],
  },
]);

const particleZoneFallbacks = Object.freeze([
  {
    id: "left-canopy",
    center: [218, 183],
    width: 355,
    height: 238,
    colors: ["#ee6b65", "#f09a68", "#d784a1", "#e7b85b"],
  },
  {
    id: "center-canopy",
    center: [463, 142],
    width: 330,
    height: 242,
    colors: ["#f09a62", "#f5c257", "#e5b858"],
  },
  {
    id: "right-canopy",
    center: [710, 184],
    width: 340,
    height: 260,
    colors: ["#d7d66c", "#72bba5", "#69aeca", "#b9dbe0"],
  },
  {
    id: "upper-canopy",
    center: [469, 78],
    width: 570,
    height: 130,
    colors: ["#ee8b78", "#f3bb68", "#a3c4b2", "#78aec9"],
  },
]);

const pathFallbackById = new Map(pathFallbacks.map((path) => [path.id, path]));
const zoneFallbackById = new Map(
  particleZoneFallbacks.map((zone) => [zone.id, zone]),
);
const coreFallbackById = new Map(
  CONFIG.core.centers.map((core) => [core.id, core]),
);

const clonePoints = (points) =>
  (Array.isArray(points) ? points : []).map(([x, y]) => [Number(x), Number(y)]);

const sourcePaths = Array.isArray(pathData.paths) ? pathData.paths : pathFallbacks;
export const energyPaths = Object.freeze(sourcePaths.map((path) => {
  const fallback = pathFallbackById.get(path.id) || {};
  const group = path.group || fallback.group || CONFIG.calibration.newPathGroup;
  const widthScale = CONFIG.energy.groupWidthScale[group] || 1;
  return Object.freeze({
    id: String(path.id),
    group,
    delay: Number(path.delay ?? fallback.delay) || 0,
    colors: Array.isArray(path.colors) && path.colors.length >= 2
      ? [String(path.colors[0]), String(path.colors[1])]
      : [...(fallback.colors || ["#ffd05a", "#f2a845"])],
    widthMm: Number(path.widthMm) ||
      CONFIG.energy.outerWidth * widthScale * 1000,
    points: clonePoints(path.points),
  });
}));

const sourceCores = Array.isArray(pathData.cores)
  ? pathData.cores
  : CONFIG.core.centers;
export const coreLayouts = Object.freeze(sourceCores.map((core) => {
  const fallback = coreFallbackById.get(core.id) || {};
  return Object.freeze({
    ...fallback,
    ...core,
    id: String(core.id),
    center: clonePoints([core.center || fallback.center])[0],
    size: clonePoints([core.size || fallback.size])[0],
  });
}));

const sourceZones = Array.isArray(pathData.particleZones)
  ? pathData.particleZones
  : particleZoneFallbacks;
export const particleZones = Object.freeze(sourceZones.map((zone) => {
  const fallback = zoneFallbackById.get(zone.id) || {};
  return Object.freeze({
    ...fallback,
    ...zone,
    id: String(zone.id),
    center: clonePoints([zone.center || fallback.center])[0],
    width: Number(zone.width ?? fallback.width),
    height: Number(zone.height ?? fallback.height),
    colors: Array.isArray(zone.colors) && zone.colors.length
      ? [...zone.colors]
      : [...(fallback.colors || ["#f5c257", "#e5b858"])],
  });
}));

export const calibrationLayers = Object.freeze({
  energyZMm: Number(pathData.layers?.energyZMm) || CONFIG.layers.energy * 1000,
  barkZMm: Number(pathData.layers?.barkZMm) || CONFIG.layers.bark * 1000,
});
