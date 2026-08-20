import * as THREE from "three";
import { CONFIG } from "./config";
import {
  createDebugOverlay,
  disposeDebugOverlay,
} from "./effects/debug-overlay";
import { EnergyTreeEffect } from "./effects/energy-tree";
import { LifeCoreEffect } from "./effects/life-core";
import { LifeParticlesEffect } from "./effects/life-particles";
import { EXPERIENCE_STATE } from "./experience-state";
import { applyImageTargetPose } from "./utils/coordinate";

export class LifeTreeAr {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = "LifeTreeArRoot";
    this.root.visible = false;

    this.core = new LifeCoreEffect();
    this.energy = new EnergyTreeEffect();
    this.particles = new LifeParticlesEffect();
    this.effects = [this.core, this.energy, this.particles];
    this.effects.forEach((effect) => this.root.add(effect.group));

    this.debugOverlay = CONFIG.debug ? createDebugOverlay() : null;
    if (this.debugOverlay) this.root.add(this.debugOverlay);

    this.state = EXPERIENCE_STATE.IDLE;
    this.elapsed = 0;
    this.targetVisible = false;
    this.lostAt = null;
    this.disposed = false;
    scene.add(this.root);
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
    this.root.visible = false;
    this.effects.forEach((effect) => effect.reset());
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.effects.forEach((effect) => effect.dispose());
    if (this.debugOverlay) disposeDebugOverlay(this.debugOverlay);
    this.root.removeFromParent();
    this.scene = null;
  }
}

