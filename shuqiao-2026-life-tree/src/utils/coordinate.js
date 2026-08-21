import * as THREE from "three";
import { CONFIG } from "../config";

const { puzzle } = CONFIG;

/** Convert editable source-image pixel coordinates to puzzle-local metres. */
export const imagePointToWorld = (x, y, z = 0) =>
  new THREE.Vector3(
    (x / puzzle.imageWidth - 0.5) * puzzle.width,
    (0.5 - y / puzzle.imageHeight) * puzzle.height,
    z,
  );

export const imageSizeToWorld = (width, height) => ({
  width: (width / puzzle.imageWidth) * puzzle.width,
  height: (height / puzzle.imageHeight) * puzzle.height,
});

/** Convert a puzzle-local metre position back to editable source pixels. */
export const worldPointToImage = (point) => ({
  x: (point.x / puzzle.width + 0.5) * puzzle.imageWidth,
  y: (0.5 - point.y / puzzle.height) * puzzle.imageHeight,
});

const positiveNumber = (value) =>
  Number.isFinite(value) && value > 0 ? value : null;

const cropWidthMetres =
  (puzzle.crop.width / puzzle.imageWidth) * puzzle.width;
const cropHeightMetres =
  (puzzle.crop.height / puzzle.imageHeight) * puzzle.height;
const cropCenter = imagePointToWorld(
  puzzle.crop.x + puzzle.crop.width * 0.5,
  puzzle.crop.y + puzzle.crop.height * 0.5,
);

/**
 * XR8's flat-target dimensions describe the compiled crop before detail.scale
 * is applied. Map that crop to the matching portion of the editable full image
 * independently on X/Y; averaging the axes causes device-dependent drift.
 */
export const getTargetPoseScale = (detail) => {
  const detectedScale = positiveNumber(detail?.scale) || 1;
  const scaledWidth = positiveNumber(detail?.scaledWidth);
  const scaledHeight = positiveNumber(detail?.scaledHeight);
  const x = scaledWidth
    ? (scaledWidth * detectedScale) / cropWidthMetres
    : detectedScale;
  const y = scaledHeight
    ? (scaledHeight * detectedScale) / cropHeightMetres
    : detectedScale;
  return { x, y, z: (x + y) * 0.5 };
};

/** Apply the XR8 crop-centre pose to content authored on the full source image. */
export const applyImageTargetPose = (root, detail) => {
  const { position, rotation } = detail;
  const scale = getTargetPoseScale(detail);
  const quaternion = new THREE.Quaternion(
    rotation.x,
    rotation.y,
    rotation.z,
    rotation.w,
  );
  const cropOffset = cropCenter
    .clone()
    .multiply(new THREE.Vector3(scale.x, scale.y, scale.z))
    .applyQuaternion(quaternion);
  root.position
    .set(position.x, position.y, position.z)
    .sub(cropOffset);
  root.quaternion.copy(quaternion);
  root.scale.set(scale.x, scale.y, scale.z);
};

export const smooth01 = (value) => {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};
