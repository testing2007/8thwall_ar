import * as THREE from "three";
import { CONFIG } from "../config";
import {
  cloneCalibrationLayout,
  createDefaultCalibrationLayout,
  mergeCalibrationLayout,
} from "../data/calibration-layout";
import { CalibrationDebugOverlay } from "../effects/debug-overlay";
import { imagePointToWorld, worldPointToImage } from "../utils/coordinate";

const STORAGE_KEYS = [
  "life-tree-calibration-v3",
  "life-tree-calibration-v2",
  "life-tree-calibration-v1",
];
const STYLE_ID = "life-tree-calibration-style";
const PANEL_POSITION_KEY = "life-tree-calibration-panel-position-v2";
const MIN_SIZE = 8;

const clamp = (value, max) =>
  Math.round(Math.min(max, Math.max(0, Number(value) || 0)));

const midpoint = (a, b) => [
  Math.round((a[0] + b[0]) * 0.5),
  Math.round((a[1] + b[1]) * 0.5),
];

const createStyle = () => {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #life-tree-calibration {
      position: fixed; z-index: 1200; left: 8px; top: 8px;
      width: min(348px, calc(100vw - 16px)); max-height: calc(100vh - 16px);
      overflow: auto; margin: 0 auto; box-sizing: border-box; padding: 10px;
      border: 1px solid rgba(91, 226, 255, .72); border-radius: 12px;
      background: rgba(5, 10, 18, .92); color: #f3f7fb;
      font: 12px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      box-shadow: 0 10px 28px rgba(0,0,0,.34); user-select: none;
      -webkit-user-select: none; pointer-events: auto;
    }
    #life-tree-calibration * { box-sizing: border-box; }
    #life-tree-calibration .lt-row { display:flex; align-items:center; gap:6px; margin-top:7px; flex-wrap:wrap; }
    #life-tree-calibration .lt-head { display:flex; align-items:center; justify-content:space-between; gap:8px; font-weight:700; }
    #life-tree-calibration .lt-drag-handle {
      flex:1 1 auto; min-width:120px; padding:7px 5px; cursor:grab;
      touch-action:none; color:#f3f7fb;
    }
    #life-tree-calibration .lt-drag-handle::before { content:"⠿"; margin-right:7px; color:#8eeaff; }
    #life-tree-calibration.is-dragging .lt-drag-handle { cursor:grabbing; }
    #life-tree-calibration .lt-status { color:#8eeaff; font-weight:500; }
    #life-tree-calibration button, #life-tree-calibration input, #life-tree-calibration select {
      min-height:34px; border:1px solid rgba(255,255,255,.18); border-radius:8px;
      background:rgba(255,255,255,.09); color:inherit; font:inherit;
    }
    #life-tree-calibration button { padding:6px 10px; touch-action:manipulation; }
    #life-tree-calibration button.is-active { border-color:#58e2ff; background:rgba(47,187,220,.3); }
    #life-tree-calibration button.is-danger { border-color:rgba(255,102,122,.62); color:#ffb4bf; }
    #life-tree-calibration button:disabled, #life-tree-calibration input:disabled,
    #life-tree-calibration select:disabled { opacity:.42; }
    #life-tree-calibration input[type=number] { width:72px; padding:5px 7px; }
    #life-tree-calibration input[type=range] { width:min(190px,32vw); min-height:28px; padding:0; }
    #life-tree-calibration select { padding:5px 28px 5px 8px; }
    #life-tree-calibration .lt-selected { flex:1 1 220px; color:#ffe977; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    #life-tree-calibration .lt-label { color:#aeb9c6; }
    #life-tree-calibration .lt-value { min-width:58px; color:#ffe977; font-variant-numeric:tabular-nums; }
    #life-tree-calibration .lt-spacer { flex:1 1 auto; }
    #life-tree-calibration.is-previewing .lt-edit-controls { display:none; }
    @media (max-width:900px) {
      #life-tree-calibration {
        top: 8px; left: 8px; right: 8px; bottom: auto;
        width: min(760px, calc(100vw - 16px)); max-height: min(34vh, 320px);
      }
    }
    @media (max-width:480px) {
      #life-tree-calibration { padding:8px; max-height:34vh; }
      #life-tree-calibration button { padding-inline:8px; }
      #life-tree-calibration .lt-secondary { display:none; }
    }
  `;
  document.head.appendChild(style);
};

const safeStorageRead = () => {
  try {
    for (const key of STORAGE_KEYS) {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw);
    }
  } catch (error) {
    console.warn("[Life Tree Calibration] Unable to read saved data:", error);
  }
  return null;
};

const safeStorageWrite = (layout) => {
  try {
    localStorage.setItem(STORAGE_KEYS[0], JSON.stringify(layout));
    return true;
  } catch (error) {
    console.warn("[Life Tree Calibration] Unable to save data:", error);
    return false;
  }
};

const safeStorageClear = () => {
  try {
    STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
  } catch (error) {
    console.warn("[Life Tree Calibration] Unable to clear saved data:", error);
  }
};

export class CalibrationEditor {
  constructor({ root, camera, canvas, energy, barkOcclusion, core, particles }) {
    this.root = root;
    this.camera = camera;
    this.canvas = canvas;
    this.energy = energy;
    this.barkOcclusion = barkOcclusion;
    this.core = core;
    this.particles = particles;
    this.defaults = createDefaultCalibrationLayout();
    this.layout = mergeCalibrationLayout(this.defaults, safeStorageRead());
    this.mode = "path";
    this.selection = null;
    this.creatingPath = null;
    this.targetVisible = false;
    this.previewMode = false;
    this.dragging = false;
    this.pointerId = null;
    this.pendingDragPoint = null;
    this.dragFrame = null;
    this.saveTimer = null;
    this.customPathCounter = 0;
    this.raycaster = new THREE.Raycaster();
    this.targetPlane = new THREE.Plane();
    this.worldPoint = new THREE.Vector3();
    this.worldNormal = new THREE.Vector3();
    this.worldQuaternion = new THREE.Quaternion();
    this.overlay = new CalibrationDebugOverlay(this.layout);
    this.root.add(this.overlay.group);

    createStyle();
    this.createPanel();
    this.previousTouchAction = this.canvas.style.touchAction;
    this.canvas.style.touchAction = "none";
    this.onPointerDown = this.handlePointerDown.bind(this);
    this.onPointerMove = this.handlePointerMove.bind(this);
    this.onPointerUp = this.handlePointerUp.bind(this);
    this.onPanelClick = this.handlePanelClick.bind(this);
    this.onCoordinateChange = this.handleCoordinateChange.bind(this);
    this.onDepthChange = this.handleDepthChange.bind(this);
    this.onWidthChange = this.handleWidthChange.bind(this);
    this.onGroupChange = this.handleGroupChange.bind(this);
    this.onPanelDragStart = this.handlePanelDragStart.bind(this);
    this.onPanelDragMove = this.handlePanelDragMove.bind(this);
    this.onPanelDragEnd = this.handlePanelDragEnd.bind(this);
    this.onWindowResize = this.handleWindowResize.bind(this);
    this.canvas.addEventListener("pointerdown", this.onPointerDown, { passive: false });
    this.canvas.addEventListener("pointermove", this.onPointerMove, { passive: false });
    this.canvas.addEventListener("pointerup", this.onPointerUp, { passive: false });
    this.canvas.addEventListener("pointercancel", this.onPointerUp, { passive: false });
    this.panel.addEventListener("click", this.onPanelClick);
    this.xInput.addEventListener("change", this.onCoordinateChange);
    this.yInput.addEventListener("change", this.onCoordinateChange);
    this.energyZInput.addEventListener("input", this.onDepthChange);
    this.barkZInput.addEventListener("input", this.onDepthChange);
    this.pathWidthInput.addEventListener("input", this.onWidthChange);
    this.pathGroupInput.addEventListener("change", this.onGroupChange);
    this.dragHandle.addEventListener("pointerdown", this.onPanelDragStart, { passive: false });
    this.dragHandle.addEventListener("pointermove", this.onPanelDragMove, { passive: false });
    this.dragHandle.addEventListener("pointerup", this.onPanelDragEnd, { passive: false });
    this.dragHandle.addEventListener("pointercancel", this.onPanelDragEnd, { passive: false });
    window.addEventListener("resize", this.onWindowResize, { passive: true });
    this.panelPositionFrame = requestAnimationFrame(() => this.restorePanelPosition());
    this.applyAllLayouts();
    this.overlay.setMode(this.mode);
    this.refreshPanel();
  }

  createPanel() {
    const widthRange = CONFIG.calibration.pathWidthRangeMm;
    this.panel = document.createElement("section");
    this.panel.id = "life-tree-calibration";
    this.panel.setAttribute("aria-label", "生命树路径校准");
    this.panel.innerHTML = `
      <div class="lt-head">
        <span class="lt-drag-handle" data-role="drag-handle" title="拖动面板">生命树路径校准</span>
        <span class="lt-status" data-role="status">等待目标</span>
        <button type="button" data-action="preview">纯效果预览</button>
      </div>
      <div class="lt-row lt-edit-controls">
        <button type="button" data-mode="path">路径</button>
        <button type="button" data-mode="core">核心</button>
        <button type="button" data-mode="zone">粒子区</button>
        <span class="lt-selected" data-role="selected">未选择</span>
      </div>
      <div class="lt-row lt-edit-controls">
        <span class="lt-label">X</span><input data-role="x" type="number" step="1">
        <span class="lt-label">Y</span><input data-role="y" type="number" step="1">
        <button type="button" data-nudge-x="-5">X−5</button>
        <button type="button" data-nudge-x="-1">X−1</button>
        <button type="button" data-nudge-x="1">X+1</button>
        <button type="button" data-nudge-x="5">X+5</button>
        <button type="button" data-nudge-y="-5">Y−5</button>
        <button type="button" data-nudge-y="-1">Y−1</button>
        <button type="button" data-nudge-y="1">Y+1</button>
        <button type="button" data-nudge-y="5">Y+5</button>
      </div>
      <div class="lt-row lt-edit-controls" data-role="path-controls">
        <button type="button" data-action="new-path">绘制新路径</button>
        <button type="button" data-action="finish-path">完成绘制</button>
        <button type="button" data-action="add-point">插入点</button>
        <button type="button" data-action="delete-point">删除点</button>
        <button type="button" class="is-danger" data-action="delete-path">删除整条路径</button>
      </div>
      <div class="lt-row lt-edit-controls" data-role="path-style">
        <span class="lt-label">阶段</span>
        <select data-role="path-group">
          <option value="root">树根</option><option value="trunk">树桩</option>
          <option value="main-branch">主枝</option><option value="side-branch">侧枝</option>
        </select>
        <span class="lt-label">发光宽度</span>
        <input data-role="path-width" type="range" min="${widthRange[0]}" max="${widthRange[1]}" step="${CONFIG.calibration.pathWidthStepMm}">
        <span class="lt-value" data-role="path-width-value"></span>
      </div>
      <div class="lt-row lt-edit-controls">
        <span class="lt-label">能量层 Z</span>
        <input data-role="energy-z" type="range" min="${CONFIG.barkOcclusion.energyZRangeMm[0]}" max="${CONFIG.barkOcclusion.energyZRangeMm[1]}" step="${CONFIG.barkOcclusion.zStepMm}">
        <span class="lt-value" data-role="energy-z-value"></span>
        <span class="lt-label">树皮层 Z</span>
        <input data-role="bark-z" type="range" min="${CONFIG.barkOcclusion.barkZRangeMm[0]}" max="${CONFIG.barkOcclusion.barkZRangeMm[1]}" step="${CONFIG.barkOcclusion.zStepMm}">
        <span class="lt-value" data-role="bark-z-value"></span>
      </div>
      <div class="lt-row lt-edit-controls">
        <button type="button" data-action="import">导入</button>
        <button type="button" data-action="copy">复制 JSON</button>
        <button type="button" data-action="download" class="lt-secondary">下载 path.json</button>
        <span class="lt-spacer"></span>
        <button type="button" data-action="reset">恢复源码默认值</button>
      </div>
    `;
    document.body.appendChild(this.panel);
    this.statusElement = this.panel.querySelector('[data-role="status"]');
    this.selectedElement = this.panel.querySelector('[data-role="selected"]');
    this.xInput = this.panel.querySelector('[data-role="x"]');
    this.yInput = this.panel.querySelector('[data-role="y"]');
    this.addPointButton = this.panel.querySelector('[data-action="add-point"]');
    this.deletePointButton = this.panel.querySelector('[data-action="delete-point"]');
    this.deletePathButton = this.panel.querySelector('[data-action="delete-path"]');
    this.finishPathButton = this.panel.querySelector('[data-action="finish-path"]');
    this.pathWidthInput = this.panel.querySelector('[data-role="path-width"]');
    this.pathWidthValue = this.panel.querySelector('[data-role="path-width-value"]');
    this.pathGroupInput = this.panel.querySelector('[data-role="path-group"]');
    this.energyZInput = this.panel.querySelector('[data-role="energy-z"]');
    this.barkZInput = this.panel.querySelector('[data-role="bark-z"]');
    this.energyZValue = this.panel.querySelector('[data-role="energy-z-value"]');
    this.barkZValue = this.panel.querySelector('[data-role="bark-z-value"]');
    this.previewButton = this.panel.querySelector('[data-action="preview"]');
    this.dragHandle = this.panel.querySelector('[data-role="drag-handle"]');
  }

  readPanelPosition() {
    try {
      const value = JSON.parse(localStorage.getItem(PANEL_POSITION_KEY) || "null");
      return Number.isFinite(value?.x) && Number.isFinite(value?.y) ? value : null;
    } catch (error) {
      return null;
    }
  }

  clampPanelPosition(x, y) {
    const rect = this.panel.getBoundingClientRect();
    const margin = 6;
    return {
      x: Math.min(window.innerWidth - rect.width - margin, Math.max(margin, x)),
      y: Math.min(window.innerHeight - rect.height - margin, Math.max(margin, y)),
    };
  }

  applyPanelPosition(x, y) {
    const position = this.clampPanelPosition(x, y);
    this.panel.style.left = `${position.x}px`;
    this.panel.style.top = `${position.y}px`;
    this.panel.style.right = "auto";
    this.panel.style.bottom = "auto";
    this.panel.style.margin = "0";
    this.panelPosition = position;
  }

  restorePanelPosition() {
    this.panelPositionFrame = null;
    const saved = this.readPanelPosition();
    if (saved) this.applyPanelPosition(saved.x, saved.y);
  }

  savePanelPosition() {
    if (!this.panelPosition) return;
    try {
      localStorage.setItem(PANEL_POSITION_KEY, JSON.stringify(this.panelPosition));
    } catch (error) {
      // Position persistence is optional; dragging still works without storage.
    }
  }

  handlePanelDragStart(event) {
    if (event.button > 0) return;
    event.preventDefault();
    const rect = this.panel.getBoundingClientRect();
    this.panelDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      panelX: rect.left,
      panelY: rect.top,
    };
    this.panel.classList.add("is-dragging");
    this.dragHandle.setPointerCapture?.(event.pointerId);
  }

  handlePanelDragMove(event) {
    if (!this.panelDrag || event.pointerId !== this.panelDrag.pointerId) return;
    event.preventDefault();
    this.applyPanelPosition(
      this.panelDrag.panelX + event.clientX - this.panelDrag.startX,
      this.panelDrag.panelY + event.clientY - this.panelDrag.startY,
    );
  }

  handlePanelDragEnd(event) {
    if (!this.panelDrag || event.pointerId !== this.panelDrag.pointerId) return;
    event.preventDefault();
    try { this.dragHandle.releasePointerCapture?.(event.pointerId); } catch (error) { /* already released */ }
    this.panelDrag = null;
    this.panel.classList.remove("is-dragging");
    this.savePanelPosition();
  }

  handleWindowResize() {
    if (!this.panelPosition) return;
    this.applyPanelPosition(this.panelPosition.x, this.panelPosition.y);
    this.savePanelPosition();
  }

  findPath(id) { return this.layout.paths.find((path) => path.id === id); }
  findCore(id) { return this.layout.cores.find((core) => core.id === id); }
  findZone(id) { return this.layout.particleZones.find((zone) => zone.id === id); }

  getSelectionPoint(selection = this.selection) {
    if (!selection) return null;
    if (selection.mode === "path") return this.findPath(selection.id)?.points[selection.index] || null;
    if (selection.mode === "core") {
      const core = this.findCore(selection.id);
      if (!core) return null;
      if (selection.handle === "width") return [core.center[0] + core.size[0] * CONFIG.core.sizeScale * .5, core.center[1]];
      if (selection.handle === "height") return [core.center[0], core.center[1] + core.size[1] * CONFIG.core.sizeScale * .5];
      return core.center;
    }
    const zone = this.findZone(selection.id);
    if (!zone) return null;
    if (selection.handle === "width") return [zone.center[0] + zone.width * .5, zone.center[1]];
    if (selection.handle === "height") return [zone.center[0], zone.center[1] + zone.height * .5];
    return zone.center;
  }

  getCandidates() {
    if (this.mode === "path") {
      return this.layout.paths.flatMap((path) => path.points.map((point, index) => ({
        selection: { mode: "path", id: path.id, index }, point,
      })));
    }
    if (this.mode === "core") {
      return this.layout.cores.flatMap((core) => [
        { selection: { mode: "core", id: core.id, handle: "center" }, point: core.center },
        { selection: { mode: "core", id: core.id, handle: "width" }, point: [core.center[0] + core.size[0] * CONFIG.core.sizeScale * .5, core.center[1]] },
        { selection: { mode: "core", id: core.id, handle: "height" }, point: [core.center[0], core.center[1] + core.size[1] * CONFIG.core.sizeScale * .5] },
      ]);
    }
    return this.layout.particleZones.flatMap((zone) => [
      { selection: { mode: "zone", id: zone.id, handle: "center" }, point: zone.center },
      { selection: { mode: "zone", id: zone.id, handle: "width" }, point: [zone.center[0] + zone.width * .5, zone.center[1]] },
      { selection: { mode: "zone", id: zone.id, handle: "height" }, point: [zone.center[0], zone.center[1] + zone.height * .5] },
    ]);
  }

  projectImagePoint(point) {
    const local = imagePointToWorld(point[0], point[1], CONFIG.layers.debug);
    this.root.updateWorldMatrix(true, false);
    this.camera.updateWorldMatrix(true, false);
    const projected = this.root.localToWorld(local).project(this.camera);
    if (projected.z < -1 || projected.z > 1) return null;
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: rect.left + (projected.x * .5 + .5) * rect.width,
      y: rect.top + (-projected.y * .5 + .5) * rect.height,
    };
  }

  pickSelection(event) {
    const threshold = event.pointerType === "mouse" ? 20 : 32;
    let nearest = null;
    let nearestDistance = threshold * threshold;
    this.getCandidates().forEach((candidate) => {
      const screen = this.projectImagePoint(candidate.point);
      if (!screen) return;
      const dx = screen.x - event.clientX;
      const dy = screen.y - event.clientY;
      const distance = dx * dx + dy * dy;
      if (distance <= nearestDistance) {
        nearest = candidate.selection;
        nearestDistance = distance;
      }
    });
    return nearest;
  }

  pointerToImage(event) {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const ndc = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.root.updateWorldMatrix(true, false);
    this.camera.updateWorldMatrix(true, false);
    this.raycaster.setFromCamera(ndc, this.camera);
    this.root.getWorldPosition(this.worldPoint);
    this.root.getWorldQuaternion(this.worldQuaternion);
    this.worldNormal.set(0, 0, 1).applyQuaternion(this.worldQuaternion).normalize();
    this.targetPlane.setFromNormalAndCoplanarPoint(this.worldNormal, this.worldPoint);
    const hit = this.raycaster.ray.intersectPlane(this.targetPlane, new THREE.Vector3());
    if (!hit) return null;
    const image = worldPointToImage(this.root.worldToLocal(hit));
    if (image.x < 0 || image.x > CONFIG.puzzle.imageWidth || image.y < 0 || image.y > CONFIG.puzzle.imageHeight) return null;
    return [clamp(image.x, CONFIG.puzzle.imageWidth), clamp(image.y, CONFIG.puzzle.imageHeight)];
  }

  handlePointerDown(event) {
    if (this.previewMode || !this.targetVisible || event.button > 0) return;
    if (this.creatingPath) {
      const point = this.pointerToImage(event);
      if (!point) return;
      event.preventDefault();
      const path = this.creatingPath;
      path.points.push(point);
      this.overlay.updatePath(path);
      if (path.points.length === 2) {
        this.energy.addPath(path);
        this.barkOcclusion.addPath(path);
      } else if (path.points.length > 2) {
        this.energy.setPathPoints(path.id, path.points);
        this.barkOcclusion.setPathPoints(path.id, path.points);
      }
      this.setSelection({ mode: "path", id: path.id, index: path.points.length - 1 });
      this.setStatus(`正在绘制 ${path.id}：${path.points.length} 个点`);
      this.scheduleSave();
      return;
    }
    const selection = this.pickSelection(event);
    if (!selection) return;
    event.preventDefault();
    this.setSelection(selection);
    this.dragging = true;
    this.pointerId = event.pointerId;
    this.canvas.setPointerCapture?.(event.pointerId);
  }

  handlePointerMove(event) {
    if (!this.dragging || event.pointerId !== this.pointerId) return;
    const point = this.pointerToImage(event);
    if (!point) return;
    event.preventDefault();
    this.pendingDragPoint = point;
    if (this.dragFrame !== null) return;
    this.dragFrame = requestAnimationFrame(() => {
      this.dragFrame = null;
      if (!this.pendingDragPoint) return;
      const pointToApply = this.pendingDragPoint;
      this.pendingDragPoint = null;
      this.applySelectionPoint(pointToApply);
    });
  }

  handlePointerUp(event) {
    if (!this.dragging || event.pointerId !== this.pointerId) return;
    event.preventDefault();
    if (this.dragFrame !== null) cancelAnimationFrame(this.dragFrame);
    this.dragFrame = null;
    if (this.pendingDragPoint) this.applySelectionPoint(this.pendingDragPoint);
    this.pendingDragPoint = null;
    try { this.canvas.releasePointerCapture?.(event.pointerId); } catch (error) { /* already released */ }
    this.dragging = false;
    this.pointerId = null;
    if (this.selection?.mode === "path") this.barkOcclusion.rebuildCoverage();
    this.saveNow();
  }

  cancelDrag() {
    if (this.dragFrame !== null) cancelAnimationFrame(this.dragFrame);
    this.dragFrame = null;
    this.pendingDragPoint = null;
    if (this.pointerId !== null) {
      try { this.canvas.releasePointerCapture?.(this.pointerId); } catch (error) { /* ignore */ }
    }
    this.dragging = false;
    this.pointerId = null;
  }

  setSelection(selection) {
    this.selection = selection;
    this.overlay.setSelectedImagePoint(this.getSelectionPoint());
    this.refreshPanel();
  }

  applySelectionPoint(point) {
    if (!this.selection) return;
    const selection = this.selection;
    if (selection.mode === "path") {
      const path = this.findPath(selection.id);
      if (!path?.points[selection.index]) return;
      path.points[selection.index] = [...point];
      this.energy.setPathPoints(path.id, path.points);
      this.barkOcclusion.setPathPoints(path.id, path.points);
      this.overlay.updatePath(path);
    } else if (selection.mode === "core") {
      const core = this.findCore(selection.id);
      if (!core) return;
      if (selection.handle === "center") core.center = [...point];
      if (selection.handle === "width") core.size[0] = Math.max(MIN_SIZE, Math.abs(point[0] - core.center[0]) * 2 / CONFIG.core.sizeScale);
      if (selection.handle === "height") core.size[1] = Math.max(MIN_SIZE, Math.abs(point[1] - core.center[1]) * 2 / CONFIG.core.sizeScale);
      this.core.setCoreLayout(core.id, core.center, core.size);
      this.overlay.updateCore(core);
    } else {
      const zone = this.findZone(selection.id);
      if (!zone) return;
      if (selection.handle === "center") zone.center = [...point];
      if (selection.handle === "width") zone.width = Math.max(MIN_SIZE, Math.abs(point[0] - zone.center[0]) * 2);
      if (selection.handle === "height") zone.height = Math.max(MIN_SIZE, Math.abs(point[1] - zone.center[1]) * 2);
      this.particles.setParticleZone(zone.id, zone);
      this.overlay.updateZone(zone);
    }
    this.overlay.setSelectedImagePoint(this.getSelectionPoint());
    this.refreshPanel();
    this.scheduleSave();
  }

  createPathId() {
    let id;
    do {
      this.customPathCounter += 1;
      id = `path-custom-${Date.now().toString(36)}-${this.customPathCounter}`;
    } while (this.findPath(id));
    return id;
  }

  beginNewPath() {
    if (this.creatingPath) return;
    this.setMode("path");
    const path = {
      id: this.createPathId(), group: CONFIG.calibration.newPathGroup,
      delay: 0, colors: ["#ffd05a", "#f2a845"],
      widthMm: CONFIG.calibration.newPathWidthMm, points: [],
    };
    this.layout.paths.push(path);
    this.creatingPath = path;
    this.overlay.addPath(path);
    this.selection = null;
    this.overlay.setSelectedImagePoint(null);
    this.setStatus("在图片上连续点击添加路径点，至少 2 个点");
    this.refreshPanel();
  }

  finishNewPath() {
    if (!this.creatingPath) return;
    if (this.creatingPath.points.length < 2) {
      this.setStatus("路径至少需要 2 个点；也可以删除整条路径取消");
      return;
    }
    const id = this.creatingPath.id;
    this.creatingPath = null;
    this.barkOcclusion.rebuildCoverage();
    this.saveNow();
    this.setStatus(`${id} 已完成，可继续拖动或调节宽度`);
    this.refreshPanel();
  }

  insertPoint() {
    if (this.selection?.mode !== "path") return;
    const path = this.findPath(this.selection.id);
    if (!path || path.points.length < 2) return;
    const index = this.selection.index;
    const before = index < path.points.length - 1 ? index : index - 1;
    const insertIndex = before + 1;
    path.points.splice(insertIndex, 0, midpoint(path.points[before], path.points[before + 1]));
    this.energy.setPathPoints(path.id, path.points);
    this.barkOcclusion.setPathPoints(path.id, path.points);
    this.overlay.updatePath(path);
    this.setSelection({ mode: "path", id: path.id, index: insertIndex });
    this.saveNow();
  }

  deletePoint() {
    if (this.selection?.mode !== "path") return;
    const path = this.findPath(this.selection.id);
    if (!path) return;
    if (path.points.length <= 2) {
      this.setStatus("两点是路径最小结构；点击“删除整条路径”可完全移除");
      return;
    }
    path.points.splice(this.selection.index, 1);
    this.energy.setPathPoints(path.id, path.points);
    this.barkOcclusion.setPathPoints(path.id, path.points);
    this.overlay.updatePath(path);
    this.setSelection({ mode: "path", id: path.id, index: Math.min(this.selection.index, path.points.length - 1) });
    this.saveNow();
  }

  deleteSelectedPath() {
    const id = this.selection?.mode === "path" ? this.selection.id : this.creatingPath?.id;
    if (!id) return;
    const path = this.findPath(id);
    if (!path || !window.confirm(`确定删除整条路径 ${id}？`)) return;
    this.layout.paths = this.layout.paths.filter((candidate) => candidate.id !== id);
    this.energy.removePath(id);
    this.barkOcclusion.removePath(id);
    this.overlay.removePath(id);
    if (this.creatingPath?.id === id) this.creatingPath = null;
    this.selection = null;
    this.overlay.setSelectedImagePoint(null);
    this.barkOcclusion.rebuildCoverage();
    this.saveNow();
    this.setStatus(`${id} 已删除`);
    this.refreshPanel();
  }

  handleWidthChange() {
    if (this.selection?.mode !== "path") return;
    const path = this.findPath(this.selection.id);
    if (!path) return;
    const range = CONFIG.calibration.pathWidthRangeMm;
    path.widthMm = Math.min(range[1], Math.max(range[0], Number(this.pathWidthInput.value)));
    this.energy.setPathWidth(path.id, path.widthMm);
    this.barkOcclusion.setPathWidth(path.id, path.widthMm);
    this.overlay.updatePath(path);
    this.pathWidthValue.textContent = `${path.widthMm.toFixed(2)} mm`;
    this.scheduleSave();
  }

  handleGroupChange() {
    if (this.selection?.mode !== "path") return;
    const path = this.findPath(this.selection.id);
    if (!path) return;
    path.group = this.pathGroupInput.value;
    this.energy.setPathGroup(path.id, path.group);
    this.barkOcclusion.addPath(path);
    this.overlay.updatePath(path);
    this.scheduleSave();
  }

  applyAllLayouts() {
    this.energy.syncPaths(this.layout.paths);
    this.barkOcclusion.syncPaths(this.layout.paths);
    this.layout.cores.forEach((core) => this.core.setCoreLayout(core.id, core.center, core.size));
    this.layout.particleZones.forEach((zone) => this.particles.setParticleZone(zone.id, zone));
    this.applyLayerDepths();
    this.barkOcclusion.rebuildCoverage();
  }

  scheduleSave() {
    if (this.saveTimer !== null) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveNow(), 140);
  }

  saveNow() {
    if (this.saveTimer !== null) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    const saved = safeStorageWrite(cloneCalibrationLayout(this.layout));
    if (!this.creatingPath) this.setStatus(saved ? "已自动保存" : "无法保存");
  }

  setMode(mode) {
    if (!["path", "core", "zone"].includes(mode)) return;
    if (this.creatingPath && mode !== "path") {
      this.setStatus("请先完成或删除正在绘制的路径");
      return;
    }
    this.mode = mode;
    this.selection = null;
    this.overlay.setMode(mode);
    this.overlay.setSelectedImagePoint(null);
    this.refreshPanel();
  }

  handleCoordinateChange() {
    if (!this.selection) return;
    const current = this.getSelectionPoint();
    const x = this.xInput.disabled ? current[0] : clamp(this.xInput.value, CONFIG.puzzle.imageWidth);
    const y = this.yInput.disabled ? current[1] : clamp(this.yInput.value, CONFIG.puzzle.imageHeight);
    this.applySelectionPoint([x, y]);
  }

  nudge(dx, dy) {
    const point = this.getSelectionPoint();
    if (!point) return;
    this.applySelectionPoint([
      clamp(point[0] + dx, CONFIG.puzzle.imageWidth),
      clamp(point[1] + dy, CONFIG.puzzle.imageHeight),
    ]);
  }

  applyLayerDepths() {
    this.energy.setLayerZ(this.layout.layers.energyZMm / 1000);
    this.barkOcclusion.setLayerZ(this.layout.layers.barkZMm / 1000);
  }

  handleDepthChange(event) {
    const energyRange = CONFIG.barkOcclusion.energyZRangeMm;
    const barkRange = CONFIG.barkOcclusion.barkZRangeMm;
    const gap = CONFIG.barkOcclusion.minLayerGapMm;
    const limit = (value, range) => Math.min(range[1], Math.max(range[0], Number(value) || 0));
    if (event.target === this.energyZInput) {
      this.layout.layers.energyZMm = limit(this.energyZInput.value, energyRange);
      this.layout.layers.barkZMm = Math.max(this.layout.layers.barkZMm, this.layout.layers.energyZMm + gap);
    } else {
      this.layout.layers.barkZMm = Math.max(limit(this.barkZInput.value, barkRange), this.layout.layers.energyZMm + gap);
    }
    this.layout.layers.barkZMm = Math.min(barkRange[1], this.layout.layers.barkZMm);
    this.applyLayerDepths();
    this.refreshPanel();
    this.scheduleSave();
  }

  togglePreview() {
    this.cancelDrag();
    this.previewMode = !this.previewMode;
    this.overlay.group.visible = !this.previewMode;
    this.panel.classList.toggle("is-previewing", this.previewMode);
    this.previewButton.textContent = this.previewMode ? "返回校准" : "纯效果预览";
    this.canvas.style.touchAction = this.previewMode ? this.previousTouchAction : "none";
    this.setStatus(this.previewMode ? "辅助线已隐藏" : "可直接编辑，无需识别 Target");
  }

  handlePanelClick(event) {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.mode) return this.setMode(button.dataset.mode);
    if (button.dataset.nudgeX) return this.nudge(Number(button.dataset.nudgeX), 0);
    if (button.dataset.nudgeY) return this.nudge(0, Number(button.dataset.nudgeY));
    const action = button.dataset.action;
    if (action === "new-path") this.beginNewPath();
    if (action === "finish-path") this.finishNewPath();
    if (action === "add-point") this.insertPoint();
    if (action === "delete-point") this.deletePoint();
    if (action === "delete-path") this.deleteSelectedPath();
    if (action === "copy") void this.copyJson();
    if (action === "download") this.downloadJson();
    if (action === "import") this.importJson();
    if (action === "reset") this.resetCalibration();
    if (action === "preview") this.togglePreview();
  }

  exportJson() { return JSON.stringify(cloneCalibrationLayout(this.layout), null, 2); }

  async copyJson() {
    const json = this.exportJson();
    try {
      await navigator.clipboard.writeText(json);
      this.setStatus("JSON 已复制");
    } catch (error) {
      const textarea = document.createElement("textarea");
      textarea.value = json;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand("copy");
      textarea.remove();
      this.setStatus(copied ? "JSON 已复制" : "复制失败，请使用下载");
    }
  }

  downloadJson() {
    const blob = new Blob([this.exportJson()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "path.json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    this.setStatus("JSON 已下载");
  }

  replaceLayout(layout) {
    this.layout = mergeCalibrationLayout(this.defaults, layout);
    this.creatingPath = null;
    this.applyAllLayouts();
    this.overlay.syncPaths(this.layout.paths);
    this.layout.cores.forEach((core) => this.overlay.updateCore(core));
    this.layout.particleZones.forEach((zone) => this.overlay.updateZone(zone));
    this.selection = null;
    this.overlay.setSelectedImagePoint(null);
    this.refreshPanel();
  }

  importJson() {
    const text = window.prompt("粘贴 life-tree-calibration JSON");
    if (!text) return;
    try {
      this.replaceLayout(JSON.parse(text));
      this.saveNow();
      this.setStatus("JSON 已导入");
    } catch (error) {
      console.warn("[Life Tree Calibration] Invalid import:", error);
      this.setStatus("JSON 格式无效");
    }
  }

  resetCalibration() {
    if (!window.confirm("恢复源码中的默认路径、核心和粒子区？")) return;
    safeStorageClear();
    this.replaceLayout(this.defaults);
    this.saveNow();
    this.setStatus("已恢复源码默认值");
  }

  selectionLabel() {
    if (!this.selection) return this.creatingPath ? `${this.creatingPath.id}（绘制中）` : "未选择";
    if (this.selection.mode === "path") return `${this.selection.id} · 点 ${this.selection.index + 1}`;
    const names = { center: "中心", width: "宽度", height: "高度" };
    return `${this.selection.id} · ${names[this.selection.handle]}`;
  }

  refreshPanel() {
    this.panel.querySelectorAll("[data-mode]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.mode === this.mode);
    });
    this.selectedElement.textContent = this.selectionLabel();
    const point = this.getSelectionPoint();
    const hasSelection = Boolean(point);
    this.xInput.value = point ? Math.round(point[0]) : "";
    this.yInput.value = point ? Math.round(point[1]) : "";
    this.xInput.disabled = !hasSelection || this.selection?.handle === "height";
    this.yInput.disabled = !hasSelection || this.selection?.handle === "width";
    this.panel.querySelectorAll("[data-nudge-x]").forEach((button) => { button.disabled = this.xInput.disabled; });
    this.panel.querySelectorAll("[data-nudge-y]").forEach((button) => { button.disabled = this.yInput.disabled; });
    const path = this.selection?.mode === "path" ? this.findPath(this.selection.id) : this.creatingPath;
    this.addPointButton.disabled = !path || path.points.length < 2 || Boolean(this.creatingPath);
    this.deletePointButton.disabled = !path || Boolean(this.creatingPath);
    this.deletePathButton.disabled = !path;
    this.finishPathButton.disabled = !this.creatingPath;
    this.pathWidthInput.disabled = !path;
    this.pathGroupInput.disabled = !path;
    if (path) {
      this.pathWidthInput.value = String(path.widthMm);
      this.pathWidthValue.textContent = `${Number(path.widthMm).toFixed(2)} mm`;
      this.pathGroupInput.value = path.group;
    } else {
      this.pathWidthValue.textContent = "—";
    }
    this.energyZInput.value = String(this.layout.layers.energyZMm);
    this.barkZInput.value = String(this.layout.layers.barkZMm);
    this.energyZValue.textContent = `${this.layout.layers.energyZMm.toFixed(2)} mm`;
    this.barkZValue.textContent = `${this.layout.layers.barkZMm.toFixed(2)} mm`;
  }

  setStatus(message) { this.statusElement.textContent = message; }

  setTargetVisible(visible) {
    this.targetVisible = visible;
    if (!visible) this.cancelDrag();
    if (this.previewMode) return this.setStatus("辅助线已隐藏");
    this.setStatus(visible ? "可拖动控制点；绘制新路径时点击图片添加点" : "等待识别 Target");
  }

  dispose() {
    this.cancelDrag();
    if (this.saveTimer !== null) this.saveNow();
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerUp);
    this.panel.removeEventListener("click", this.onPanelClick);
    this.xInput.removeEventListener("change", this.onCoordinateChange);
    this.yInput.removeEventListener("change", this.onCoordinateChange);
    this.energyZInput.removeEventListener("input", this.onDepthChange);
    this.barkZInput.removeEventListener("input", this.onDepthChange);
    this.pathWidthInput.removeEventListener("input", this.onWidthChange);
    this.pathGroupInput.removeEventListener("change", this.onGroupChange);
    this.dragHandle.removeEventListener("pointerdown", this.onPanelDragStart);
    this.dragHandle.removeEventListener("pointermove", this.onPanelDragMove);
    this.dragHandle.removeEventListener("pointerup", this.onPanelDragEnd);
    this.dragHandle.removeEventListener("pointercancel", this.onPanelDragEnd);
    window.removeEventListener("resize", this.onWindowResize);
    if (this.panelPositionFrame !== null) cancelAnimationFrame(this.panelPositionFrame);
    this.canvas.style.touchAction = this.previousTouchAction;
    this.panel.remove();
    document.getElementById(STYLE_ID)?.remove();
    this.overlay.dispose();
    this.root = null;
    this.camera = null;
    this.canvas = null;
    this.barkOcclusion = null;
  }
}
