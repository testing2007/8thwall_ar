import * as THREE from "three";
import { CONFIG } from "../config";
import { imagePointToWorld, imageSizeToWorld } from "../utils/coordinate";

const createLineMaterial = (color, opacity = 0.9) =>
  new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });

const createPointMaterial = (color, size) =>
  new THREE.PointsMaterial({
    color,
    size,
    sizeAttenuation: false,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });

const setPoints = (object, points) => {
  object.geometry.dispose();
  object.geometry = new THREE.BufferGeometry().setFromPoints(points);
};

const createLine = (material, loop = false) => {
  const geometry = new THREE.BufferGeometry();
  const line = loop
    ? new THREE.LineLoop(geometry, material)
    : new THREE.Line(geometry, material);
  line.renderOrder = 20;
  return line;
};

const createPoints = (material) => {
  const points = new THREE.Points(new THREE.BufferGeometry(), material);
  points.renderOrder = 22;
  points.frustumCulled = false;
  return points;
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

const pathHandlePoints = (path, z) =>
  path.points.map(([x, y]) => imagePointToWorld(x, y, z));

const coreHandlePoints = (core, z) => {
  const displayWidth = core.size[0] * CONFIG.core.sizeScale;
  const displayHeight = core.size[1] * CONFIG.core.sizeScale;
  return [
    imagePointToWorld(core.center[0], core.center[1], z),
    imagePointToWorld(core.center[0] + displayWidth * 0.5, core.center[1], z),
    imagePointToWorld(core.center[0], core.center[1] + displayHeight * 0.5, z),
  ];
};

const zoneHandlePoints = (zone, z) => [
  imagePointToWorld(zone.center[0], zone.center[1], z),
  imagePointToWorld(zone.center[0] + zone.width * 0.5, zone.center[1], z),
  imagePointToWorld(zone.center[0], zone.center[1] + zone.height * 0.5, z),
];

export class CalibrationDebugOverlay {
  constructor(layout) {
    this.group = new THREE.Group();
    this.group.name = "LifeTreeCalibrationOverlay";
    this.z = CONFIG.layers.debug;
    this.materials = {
      border: createLineMaterial(0x35d8ff),
      curve: createLineMaterial(0x58ff9a),
      outer: createLineMaterial(0x35d8ff),
      ribbonCore: createLineMaterial(0xffef92),
      core: createLineMaterial(0xffef62),
      zone: createLineMaterial(0x8a77ff),
      pathHandle: createPointMaterial(0xff4bd1, 9),
      coreHandle: createPointMaterial(0xffef62, 10),
      zoneHandle: createPointMaterial(0x9a83ff, 10),
      selected: createPointMaterial(0xffffff, 15),
    };
    this.pathEntries = new Map();
    this.coreEntries = new Map();
    this.zoneEntries = new Map();

    const halfWidth = CONFIG.puzzle.width * 0.5;
    const halfHeight = CONFIG.puzzle.height * 0.5;
    this.border = createLine(this.materials.border, true);
    setPoints(this.border, [
      new THREE.Vector3(-halfWidth, halfHeight, this.z),
      new THREE.Vector3(halfWidth, halfHeight, this.z),
      new THREE.Vector3(halfWidth, -halfHeight, this.z),
      new THREE.Vector3(-halfWidth, -halfHeight, this.z),
    ]);
    this.group.add(this.border);

    layout.paths.forEach((path) => this.addPath(path));

    layout.cores.forEach((core) => {
      const entry = {
        horizontal: createLine(this.materials.core),
        vertical: createLine(this.materials.core),
        box: createLine(this.materials.core, true),
        handles: createPoints(this.materials.coreHandle),
      };
      Object.values(entry).forEach((object) => this.group.add(object));
      this.coreEntries.set(core.id, entry);
      this.updateCore(core);
    });

    layout.particleZones.forEach((zone) => {
      const entry = {
        box: createLine(this.materials.zone, true),
        handles: createPoints(this.materials.zoneHandle),
      };
      Object.values(entry).forEach((object) => this.group.add(object));
      this.zoneEntries.set(zone.id, entry);
      this.updateZone(zone);
    });

    this.selectedPoint = createPoints(this.materials.selected);
    this.selectedPoint.renderOrder = 23;
    this.selectedPoint.visible = false;
    this.group.add(this.selectedPoint);
    this.setMode("path");
  }

  updatePath(path) {
    const entry = this.pathEntries.get(path.id);
    if (!entry) return;
    const points = pathHandlePoints(path, this.z);
    setPoints(entry.handles, points);
    if (points.length < 2) {
      [entry.center, entry.outerLeft, entry.outerRight, entry.coreLeft, entry.coreRight]
        .forEach((object) => setPoints(object, []));
      return;
    }
    const curve = new THREE.CatmullRomCurve3(points, false, "centripetal", 0.4);
    const widthScale = CONFIG.energy.groupWidthScale[path.group] || 1;
    const outerWidth = Number.isFinite(Number(path.widthMm))
      ? Number(path.widthMm) / 1000
      : CONFIG.energy.outerWidth * widthScale;
    const outer = ribbonBoundaryPoints(
      curve,
      outerWidth,
    );
    const core = ribbonBoundaryPoints(curve, CONFIG.energy.coreWidth);
    setPoints(entry.center, curve.getPoints(48));
    setPoints(entry.outerLeft, outer.left);
    setPoints(entry.outerRight, outer.right);
    setPoints(entry.coreLeft, core.left);
    setPoints(entry.coreRight, core.right);
  }

  addPath(path) {
    if (!path?.id || this.pathEntries.has(path.id)) {
      if (path?.id) this.updatePath(path);
      return;
    }
    const entry = {
      center: createLine(this.materials.curve),
      outerLeft: createLine(this.materials.outer),
      outerRight: createLine(this.materials.outer),
      coreLeft: createLine(this.materials.ribbonCore),
      coreRight: createLine(this.materials.ribbonCore),
      handles: createPoints(this.materials.pathHandle),
    };
    Object.values(entry).forEach((object) => this.group.add(object));
    entry.handles.visible = this.mode ? this.mode === "path" : true;
    this.pathEntries.set(path.id, entry);
    this.updatePath(path);
  }

  removePath(id) {
    const entry = this.pathEntries.get(id);
    if (!entry) return;
    Object.values(entry).forEach((object) => {
      object.geometry.dispose();
      object.removeFromParent();
    });
    this.pathEntries.delete(id);
  }

  syncPaths(paths) {
    const ids = new Set(paths.map((path) => path.id));
    [...this.pathEntries.keys()].forEach((id) => {
      if (!ids.has(id)) this.removePath(id);
    });
    paths.forEach((path) => {
      this.addPath(path);
      this.updatePath(path);
    });
  }

  updateCore(core) {
    const entry = this.coreEntries.get(core.id);
    if (!entry) return;
    const displayWidth = core.size[0] * CONFIG.core.sizeScale;
    const displayHeight = core.size[1] * CONFIG.core.sizeScale;
    const worldSize = imageSizeToWorld(displayWidth, displayHeight);
    const center = imagePointToWorld(core.center[0], core.center[1], this.z);
    const dx = worldSize.width * 0.08;
    const dy = worldSize.height * 0.08;
    setPoints(entry.horizontal, [
      center.clone().add(new THREE.Vector3(-dx, 0, 0)),
      center.clone().add(new THREE.Vector3(dx, 0, 0)),
    ]);
    setPoints(entry.vertical, [
      center.clone().add(new THREE.Vector3(0, -dy, 0)),
      center.clone().add(new THREE.Vector3(0, dy, 0)),
    ]);
    setPoints(
      entry.box,
      rectanglePoints(core.center, displayWidth, displayHeight, this.z),
    );
    setPoints(entry.handles, coreHandlePoints(core, this.z));
  }

  updateZone(zone) {
    const entry = this.zoneEntries.get(zone.id);
    if (!entry) return;
    setPoints(
      entry.box,
      rectanglePoints(zone.center, zone.width, zone.height, this.z),
    );
    setPoints(entry.handles, zoneHandlePoints(zone, this.z));
  }

  setMode(mode) {
    this.mode = mode;
    this.pathEntries.forEach((entry) => {
      entry.handles.visible = mode === "path";
    });
    this.coreEntries.forEach((entry) => {
      entry.handles.visible = mode === "core";
    });
    this.zoneEntries.forEach((entry) => {
      entry.handles.visible = mode === "zone";
    });
  }

  setSelectedImagePoint(point) {
    if (!point) {
      this.selectedPoint.visible = false;
      return;
    }
    setPoints(
      this.selectedPoint,
      [imagePointToWorld(point[0], point[1], this.z)],
    );
    this.selectedPoint.visible = true;
  }

  dispose() {
    this.group.traverse((object) => object.geometry?.dispose());
    Object.values(this.materials).forEach((material) => material.dispose());
    this.group.removeFromParent();
  }
}
