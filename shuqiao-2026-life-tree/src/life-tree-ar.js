import * as THREE from "three";
import { CONFIG } from "./config";
import { calibrationLayers } from "./data/energy-paths";
import { CalibrationEditor } from "./debug/calibration-editor";
import { BarkOcclusionEffect } from "./effects/bark-occlusion";
import { EnergyTreeEffect } from "./effects/energy-tree";
import { LifeCoreEffect } from "./effects/life-core";
import { LifeParticlesEffect } from "./effects/life-particles";
import { EXPERIENCE_STATE } from "./experience-state";
import { applyImageTargetPose } from "./utils/coordinate";

export class LifeTreeAr {
  constructor(scene, camera, canvas, { standaloneDebug = false } = {}) {
    this.scene = scene;
    this.camera = camera;
    this.canvas = canvas;
    this.root = new THREE.Group();
    this.root.name = "LifeTreeArRoot";
    this.root.visible = false;

    this.core = new LifeCoreEffect();
    this.energy = new EnergyTreeEffect();
    this.barkOcclusion = new BarkOcclusionEffect();
    this.particles = new LifeParticlesEffect();
    this.energy.setLayerZ(calibrationLayers.energyZMm / 1000);
    this.barkOcclusion.setLayerZ(calibrationLayers.barkZMm / 1000);
    this.effects = [
      this.core,
      this.energy,
      this.barkOcclusion,
      this.particles,
    ];
    this.effects.forEach((effect) => this.root.add(effect.group));

    this.calibrationEditor =
      CONFIG.debug && camera && canvas
        ? new CalibrationEditor({
            root: this.root,
            camera,
            canvas,
            energy: this.energy,
            barkOcclusion: this.barkOcclusion,
            core: this.core,
            particles: this.particles,
          })
        : null;

    this.state = EXPERIENCE_STATE.IDLE;
    this.elapsed = 0;
    this.targetVisible = false;
    this.lostAt = null;
    this.disposed = false;
    this.standaloneDebug = standaloneDebug;
    scene.add(this.root);

    if (standaloneDebug) {
      this.root.visible = true;
      this.targetVisible = true;
      this.state = EXPERIENCE_STATE.ALIVE;
      this.elapsed = CONFIG.timeline.awakeningEnd;
      this.effects.forEach((effect) => effect.update(this.elapsed, this.state));
      this.calibrationEditor?.setTargetVisible(true);
    }
  }

  isExpectedTarget(detail) {
    return detail?.name === CONFIG.targetName;
  }

  beginAwakening() {
    this.state = EXPERIENCE_STATE.AWAKENING;
    this.elapsed = 0;
    this.effects.forEach((effect) => effect.reset());
  }

  onTargetFound(detail) {
    if (this.disposed || !this.isExpectedTarget(detail)) return;
    const now = performance.now();
    const lossExpired =
      this.lostAt !== null &&
      now - this.lostAt >= CONFIG.timeline.targetLostGraceMs;
    if (lossExpired) this.reset();

    applyImageTargetPose(this.root, detail);
    this.targetVisible = true;
    this.lostAt = null;
    this.root.visible = true;
    this.calibrationEditor?.setTargetVisible(true);

    if (this.state === EXPERIENCE_STATE.IDLE) this.beginAwakening();
  }

  onTargetUpdated(detail) {
    if (this.disposed || !this.isExpectedTarget(detail)) return;
    if (!this.targetVisible) {
      this.onTargetFound(detail);
      return;
    }
    applyImageTargetPose(this.root, detail);
  }

  onTargetLost(detail) {
    if (
      this.disposed ||
      !this.isExpectedTarget(detail) ||
      !this.targetVisible
    ) {
      return;
    }
    this.targetVisible = false;
    this.calibrationEditor?.setTargetVisible(false);
    this.root.visible = false;
    this.lostAt = performance.now();
  }

  update(deltaSeconds, now = performance.now()) {
    if (this.disposed) return;
    if (!this.targetVisible) {
      if (
        this.lostAt !== null &&
        now - this.lostAt >= CONFIG.timeline.targetLostGraceMs
      ) {
        this.reset();
      }
      return;
    }

    if (this.state === EXPERIENCE_STATE.AWAKENING) {
      this.elapsed += deltaSeconds;
      if (this.elapsed >= CONFIG.timeline.awakeningEnd) {
        this.elapsed = CONFIG.timeline.awakeningEnd;
        this.state = EXPERIENCE_STATE.ALIVE;
      }
    } else if (this.state === EXPERIENCE_STATE.ALIVE) {
      this.elapsed += deltaSeconds;
    }

    this.effects.forEach((effect) => effect.update(this.elapsed, this.state));
  }

  reset() {
    this.state = EXPERIENCE_STATE.IDLE;
    this.elapsed = 0;
    this.targetVisible = false;
    this.lostAt = null;
    this.calibrationEditor?.setTargetVisible(false);
    this.root.visible = false;
    this.effects.forEach((effect) => effect.reset());
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.calibrationEditor?.dispose();
    this.calibrationEditor = null;
    this.effects.forEach((effect) => effect.dispose());
    this.root.removeFromParent();
    this.scene = null;
    this.camera = null;
    this.canvas = null;
  }
}
