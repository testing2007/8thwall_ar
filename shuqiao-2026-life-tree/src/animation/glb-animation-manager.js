import * as THREE from "three";

const resolveLoop = (loop) => {
  if (loop === "once" || loop === THREE.LoopOnce) return THREE.LoopOnce;
  if (loop === "ping-pong" || loop === THREE.LoopPingPong) {
    return THREE.LoopPingPong;
  }
  return THREE.LoopRepeat;
};

const getActivityGroup = (trackName) => {
  const lower = trackName.toLowerCase();
  if (lower.includes("butterfly")) return "Butterflies";
  if (lower.includes("bird")) return "Birds";
  return null;
};

const deriveClipActivity = (clip) => {
  const ranges = new Map();
  clip.tracks.forEach((track) => {
    if (!track.name.endsWith(".scale")) return;
    const group = getActivityGroup(track.name);
    if (!group) return;
    const stride = Math.max(1, track.getValueSize());
    for (let index = 0; index < track.times.length; index += 1) {
      let visible = false;
      for (let component = 0; component < stride; component += 1) {
        if (Math.abs(track.values[index * stride + component]) > 0.05) {
          visible = true;
          break;
        }
      }
      if (!visible) continue;
      const time = track.times[index];
      const range = ranges.get(group) || { label: group, start: time, end: time };
      range.start = Math.min(range.start, time);
      range.end = Math.max(range.end, time);
      ranges.set(group, range);
    }
  });
  return [...ranges.values()];
};

/** Reusable AnimationMixer facade for animated GLB experiences. */
export class GlbAnimationManager {
  constructor(root, clips = []) {
    this.root = root;
    this.clips = new Map(
      clips.filter((clip) => clip?.name).map((clip) => [clip.name, clip]),
    );
    this.mixer = new THREE.AnimationMixer(root);
    this.actions = new Map();
    this.activeByLayer = new Map();
    this.disposed = false;
  }

  get animationNames() {
    return [...this.clips.keys()];
  }

  get animationMetadata() {
    return [...this.clips.values()].map((clip) => ({
      name: clip.name,
      duration: clip.duration,
      trackCount: clip.tracks.length,
      nodeNames: [...new Set(
        clip.tracks.map((track) => track.name.split(".")[0]),
      )],
      activity: deriveClipActivity(clip),
    }));
  }

  hasAnimation(name) {
    return this.clips.has(name);
  }

  getAction(name) {
    if (this.actions.has(name)) return this.actions.get(name);
    const clip = this.clips.get(name);
    if (!clip) return null;
    const action = this.mixer.clipAction(clip, this.root);
    this.actions.set(name, action);
    return action;
  }

  playAnimation(name, options = {}) {
    if (this.disposed) return null;
    const action = this.getAction(name);
    if (!action) {
      console.warn(
        `[GLB Animation] Clip "${name}" not found. Available: ${this.animationNames.join(", ") || "none"}`,
      );
      return null;
    }

    const layer = options.layer || "default";
    const fadeDuration = Math.max(0, Number(options.fadeDuration) || 0);
    const repetitions = Number.isFinite(options.repetitions)
      ? Math.max(0, options.repetitions)
      : Infinity;
    const loop = resolveLoop(options.loop);
    const previous = this.activeByLayer.get(layer);

    action.enabled = true;
    action.paused = false;
    action.clampWhenFinished = options.clampWhenFinished ?? loop === THREE.LoopOnce;
    action.setEffectiveTimeScale(Number(options.timeScale) || 1);
    action.setEffectiveWeight(1);
    action.setLoop(loop, repetitions);
    action.reset();

    const startTime = Math.max(0, Number(options.startTime) || 0);
    if (action.getClip().duration > 0 && startTime > 0) {
      action.time = loop === THREE.LoopOnce
        ? Math.min(startTime, action.getClip().duration)
        : startTime % action.getClip().duration;
    }

    if (previous && previous !== action) {
      if (fadeDuration > 0) previous.crossFadeTo(action, fadeDuration, false);
      else previous.stop();
    }
    if (fadeDuration > 0 && previous !== action) action.fadeIn(fadeDuration);
    action.play();
    this.activeByLayer.set(layer, action);
    return action;
  }

  stopAnimation(name = null, options = {}) {
    if (this.disposed) return;
    const fadeDuration = Math.max(0, Number(options.fadeDuration) || 0);
    const targets = name
      ? [this.actions.get(name)].filter(Boolean)
      : [...new Set(this.activeByLayer.values())];
    targets.forEach((action) => {
      if (fadeDuration > 0) action.fadeOut(fadeDuration);
      else action.stop();
    });
    this.activeByLayer.forEach((action, layer) => {
      if (!name || action === this.actions.get(name)) this.activeByLayer.delete(layer);
    });
  }

  /** Crossfade to a named clip, or fade all active clips out when name is omitted. */
  fadeAnimation(name = null, duration = 0.35, options = {}) {
    if (typeof name === "number") {
      this.stopAnimation(null, { fadeDuration: name });
      return null;
    }
    if (!name) {
      this.stopAnimation(null, { fadeDuration: duration });
      return null;
    }
    return this.playAnimation(name, {
      ...options,
      fadeDuration: duration,
    });
  }

  update(deltaSeconds) {
    if (this.disposed || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
      return;
    }
    this.mixer.update(deltaSeconds);
  }

  reset() {
    if (this.disposed) return;
    this.mixer.stopAllAction();
    this.mixer.setTime(0);
    this.activeByLayer.clear();
  }

  dispose() {
    if (this.disposed) return;
    this.reset();
    this.actions.forEach((action) => this.mixer.uncacheAction(action.getClip(), this.root));
    this.clips.forEach((clip) => this.mixer.uncacheClip(clip));
    this.mixer.uncacheRoot(this.root);
    this.actions.clear();
    this.clips.clear();
    this.root = null;
    this.mixer = null;
    this.disposed = true;
  }
}
