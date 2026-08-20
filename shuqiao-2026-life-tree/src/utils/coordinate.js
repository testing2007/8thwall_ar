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

const cropCenter = imagePointToWorld(
  puzzle.crop.x + puzzle.crop.width * 0.5,
  puzzle.crop.y + puzzle.crop.height * 0.5,
);

// The effects use the full artwork centre, while XR8 tracks its cropped centre.
const fullArtworkOriginFromCrop = cropCenter.multiplyScalar(-1);
const cropWidthMetres =
  (puzzle.crop.width / puzzle.imageWidth) * puzzle.width;
const cropHeightMetres =
  (puzzle.crop.height / puzzle.imageHeight) * puzzle.height;

const positiveNumber = (value) =>
  Number.isFinite(value) && value > 0 ? value : null;

export const getTargetPoseScale = (detail) => {
  const widthScale = positiveNumber(detail?.scaledWidth)
    ? detail.scaledWidth / cropWidthMetres
    : null;
  const heightScale = positiveNumber(detail?.scaledHeight)
    ? detail.scaledHeight / cropHeightMetres
    : null;
  if (widthScale && heightScale) return (widthScale + heightScale) * 0.5;
  if (widthScale) return widthScale;
  if (heightScale) return heightScale;

  const detectedScale = positiveNumber(detail?.scale);
  return detectedScale ? detectedScale / cropWidthMetres : 1;
};

/** Apply XR8 pose while preserving the full-image coordinate origin. */
export const applyImageTargetPose = (root, detail) => {
  const { position, rotation } = detail;
  const scale = getTargetPoseScale(detail);
  const quaternion = new THREE.Quaternion(
    rotation.x,
    rotation.y,
    rotation.z,
    rotation.w,
  );
  const originCorrection = fullArtworkOriginFromCrop
    .clone()
    .multiplyScalar(scale)
    .applyQuaternion(quaternion);

  root.position
    .set(position.x, position.y, position.z)
    .add(originCorrection);
  root.quaternion.copy(quaternion);
  root.scale.setScalar(scale);
};

export const smooth01 = (value) => {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};
