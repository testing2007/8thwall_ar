import * as THREE from "three";

const MIN_SEGMENTS = 32;

/**
 * Build a target-plane ribbon sampled by arc length. The cumulative-distance
 * attribute keeps procedural motion visually uniform through tight bends.
 */
export const createPlanarRibbonGeometry = (curve, width, segments = 48) => {
  const segmentCount = Math.max(MIN_SEGMENTS, Math.floor(segments));
  const vertexCount = (segmentCount + 1) * 2;
  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const sides = new Float32Array(vertexCount);
  const distances = new Float32Array(vertexCount);
  const indices = new Uint16Array(segmentCount * 6);
  const halfWidth = width * 0.5;
  const length = Math.max(curve.getLength(), 0.0001);
  const point = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const normal = new THREE.Vector3();

  for (let index = 0; index <= segmentCount; index += 1) {
    const t = index / segmentCount;
    curve.getPointAt(t, point);
    curve.getTangentAt(t, tangent).normalize();
    normal.set(-tangent.y, tangent.x, 0).normalize();

    for (let sideIndex = 0; sideIndex < 2; sideIndex += 1) {
      const side = sideIndex === 0 ? -1 : 1;
      const vertexIndex = index * 2 + sideIndex;
      const positionOffset = vertexIndex * 3;
      const uvOffset = vertexIndex * 2;
      positions[positionOffset] = point.x + normal.x * halfWidth * side;
      positions[positionOffset + 1] = point.y + normal.y * halfWidth * side;
      positions[positionOffset + 2] = point.z;
      uvs[uvOffset] = t;
      uvs[uvOffset + 1] = sideIndex;
      sides[vertexIndex] = side;
      distances[vertexIndex] = length * t;
    }
  }

  for (let index = 0; index < segmentCount; index += 1) {
    const vertex = index * 2;
    const indexOffset = index * 6;
    indices.set(
      [vertex, vertex + 1, vertex + 2, vertex + 1, vertex + 3, vertex + 2],
      indexOffset,
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute("aSide", new THREE.BufferAttribute(sides, 1));
  geometry.setAttribute("aDistance", new THREE.BufferAttribute(distances, 1));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
};
