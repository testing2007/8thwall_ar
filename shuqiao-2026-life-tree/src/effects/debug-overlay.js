import * as THREE from "three";
import { CONFIG } from "../config";
import { energyPaths, particleZones } from "../data/energy-paths";
import { imagePointToWorld, imageSizeToWorld } from "../utils/coordinate";

const addLine = (group, points, color, loop = false) => {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.85,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const line = loop
    ? new THREE.LineLoop(geometry, material)
    : new THREE.Line(geometry, material);
  line.renderOrder = 20;
  group.add(line);
};

const rectanglePoints = (center, width, height, z) => {
  const halfWidth = width * 0.5;
  const halfHeight = height * 0.5;
  return [
    imagePointToWorld(center[0] - halfWidth, center[1] - halfHeight, z),
    imagePointToWorld(center[0] + halfWidth, center[1] - halfHeight, z),
    imagePointToWorld(center[0] + halfWidth, center[1] + halfHeight, z),
    imagePointToWorld(center[0] - halfWidth, center[1] + halfHeight, z),
  ];
};

const ribbonBoundaryPoints = (curve, width, segments = 48) => {
  const left = [];
  const right = [];
  const halfWidth = width * 0.5;
  const point = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const normal = new THREE.Vector3();
  for (let index = 0; index <= segments; index += 1) {
    const t = index / segments;
    curve.getPointAt(t, point);
    curve.getTangentAt(t, tangent).normalize();
    normal.set(-tangent.y, tangent.x, 0).normalize();
    left.push(point.clone().addScaledVector(normal, halfWidth));
    right.push(point.clone().addScaledVector(normal, -halfWidth));
  }
  return { left, right };
};

export const createDebugOverlay = () => {
  const group = new THREE.Group();
  group.name = "LifeTreeDebugOverlay";
  const z = CONFIG.layers.debug;
  const halfWidth = CONFIG.puzzle.width * 0.5;
  const halfHeight = CONFIG.puzzle.height * 0.5;
  addLine(
    group,
    [
      new THREE.Vector3(-halfWidth, halfHeight, z),
      new THREE.Vector3(halfWidth, halfHeight, z),
      new THREE.Vector3(halfWidth, -halfHeight, z),
      new THREE.Vector3(-halfWidth, -halfHeight, z),
    ],
    0x35d8ff,
    true,
  );

  CONFIG.core.centers.forEach((core) => {
    const centre = imagePointToWorld(core.center[0], core.center[1], z);
    const size = imageSizeToWorld(core.size[0], core.size[1]);
    const dx = size.width * 0.08;
    const dy = size.height * 0.08;
    addLine(
      group,
      [
        centre.clone().add(new THREE.Vector3(-dx, 0, 0)),
        centre.clone().add(new THREE.Vector3(dx, 0, 0)),
      ],
      0xffef62,
    );
    addLine(
      group,
      [
        centre.clone().add(new THREE.Vector3(0, -dy, 0)),
        centre.clone().add(new THREE.Vector3(0, dy, 0)),
      ],
      0xffef62,
    );
  });

  const controlPositions = [];
  energyPaths.forEach((path) => {
    const points = path.points.map(([x, y]) => imagePointToWorld(x, y, z));
    controlPositions.push(...points);
    const curve = new THREE.CatmullRomCurve3(points, false, "centripetal", 0.4);
    addLine(group, curve.getPoints(48), 0x58ff9a);
    const widthScale = CONFIG.energy.groupWidthScale[path.group] || 1;
    const outerEdges = ribbonBoundaryPoints(
      curve,
      CONFIG.energy.outerWidth * widthScale,
    );
    addLine(group, outerEdges.left, 0x35d8ff);
    addLine(group, outerEdges.right, 0x35d8ff);
    const coreEdges = ribbonBoundaryPoints(curve, CONFIG.energy.coreWidth);
    addLine(group, coreEdges.left, 0xffef92);
    addLine(group, coreEdges.right, 0xffef92);
  });
  const pointGeometry = new THREE.BufferGeometry().setFromPoints(controlPositions);
  const pointMaterial = new THREE.PointsMaterial({
    color: 0xff4bd1,
    size: 0.007,
    sizeAttenuation: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const controls = new THREE.Points(pointGeometry, pointMaterial);
  controls.renderOrder = 21;
  group.add(controls);

  particleZones.forEach((zone) => {
    addLine(
      group,
      rectanglePoints(zone.center, zone.width, zone.height, z),
      0x8a77ff,
      true,
    );
  });
  return group;
};

export const disposeDebugOverlay = (group) => {
  group.traverse((object) => {
    object.geometry?.dispose();
    if (Array.isArray(object.material)) {
      object.material.forEach((material) => material.dispose());
    } else {
      object.material?.dispose();
    }
  });
  group.removeFromParent();
};
