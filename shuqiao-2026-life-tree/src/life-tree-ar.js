import * as THREE from "three";
import { GlbResourceManager } from "./animation/glb-resource-manager";
import { CONFIG } from "./config";
import { calibrationLayers } from "./data/energy-paths";
import {
  compileTimelineCues,
  normalizeTimelineData,
} from "./data/experience-timeline-data";
import { CalibrationEditor } from "./debug/calibration-editor";
import { TimelineEditor } from "./debug/timeline-editor";
import { BarkOcclusionEffect } from "./effects/bark-occlusion";
import { EnergyTreeEffect } from "./effects/energy-tree";
import { LifeCoreEffect } from "./effects/life-core";
import { LifeParticlesEffect } from "./effects/life-particles";
import { EXPERIENCE_STATE } from "./experience-state";
import { ExperienceTimeline } from "./timeline/experience-timeline";
import { applyImageTargetPose } from "./utils/coordinate";
import { resolveResourceUrl } from "./utils/resource-url";

export class LifeTreeAr {
  constructor(
    scene,
    camera,
    canvas,
    { standaloneDebug = false, audioController = null } = {},
  ) {
    this.scene = scene;
    this.camera = camera;
    this.canvas = canvas;
    this.audioController = audioController;
    this.activeShaderTracks = new Set();
    this.activeParticleTracks = new Set();
    this.previewMutedChannels = new Set();
    this.previewSoloChannels = new Set();
    this.previewOnlyChannels = null;
    this.previewOnlyTracks = null;
    this.previewBypassMute = false;
    this.resourceAdapters = new Map();
    this.timelineData = normalizeTimelineData(CONFIG.experienceTimeline.data);
    this.timelinePlayback = {
      enabled: standaloneDebug,
      playing: false,
      start: 0,
      end: this.timelineData.duration,
      loop: true,
    };
    this.root = new THREE.Group();
    this.root.name = "LifeTreeArRoot";
    this.root.visible = false;

    this.genericGlbGroup = new THREE.Group();
    this.genericGlbGroup.name = "TimelineGenericGlbResources";
    this.root.add(this.genericGlbGroup);
    this.glbResources = new GlbResourceManager(this.genericGlbGroup);

    this.core = new LifeCoreEffect();
    this.energy = new EnergyTreeEffect();
    const reliefResource = this.timelineData.resources.find(
      (resource) => resource.type === "glb" && resource.adapter === "life-tree-relief",
    );
    this.reliefResourceId = reliefResource?.id || null;
    this.barkOcclusion = new BarkOcclusionEffect({
      modelUrl: resolveResourceUrl(reliefResource?.src),
    });
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
    this.syncResources(this.timelineData);

    const timelineChannels = {
      experience: {
        enterAlive: () => {
          this.state = EXPERIENCE_STATE.ALIVE;
        },
      },
      shader: {
        wake: (cue) => {
          this.activeShaderTracks.add(cue.trackId);
          this.core.group.visible = true;
          this.energy.group.visible = true;
          if (this.state === EXPERIENCE_STATE.IDLE) {
            this.state = EXPERIENCE_STATE.AWAKENING;
          }
        },
        enterAlive: (cue) => {
          this.activeShaderTracks.add(cue.trackId);
          this.core.group.visible = true;
          this.energy.group.visible = true;
          this.state = EXPERIENCE_STATE.ALIVE;
        },
        sleep: (cue) => {
          this.activeShaderTracks.delete(cue.trackId);
          if (this.activeShaderTracks.size > 0) return;
          this.core.group.visible = false;
          this.energy.group.visible = false;
          this.core.reset();
          this.energy.reset();
          this.barkOcclusion.update(this.elapsed, EXPERIENCE_STATE.IDLE, 0);
        },
        update: (elapsed, deltaSeconds) => {
          const effectState = this.activeShaderTracks.size > 0
            ? this.state
            : EXPERIENCE_STATE.IDLE;
          this.core.update(elapsed, effectState, deltaSeconds);
          this.energy.update(elapsed, effectState, deltaSeconds);
          this.barkOcclusion.update(elapsed, effectState, deltaSeconds);
        },
        reset: () => {
          this.activeShaderTracks.clear();
          this.core.group.visible = false;
          this.energy.group.visible = false;
          this.core.reset();
          this.energy.reset();
          this.barkOcclusion.reset();
        },
      },
      particles: {
        wake: (cue) => {
          this.activeParticleTracks.add(cue.trackId);
          this.particles.group.visible = true;
          this.particles.wake(cue.at);
        },
        sleep: (cue) => {
          this.activeParticleTracks.delete(cue.trackId);
          if (this.activeParticleTracks.size === 0) {
            this.particles.group.visible = false;
            this.particles.reset();
          }
        },
        update: (elapsed, deltaSeconds) =>
          this.particles.update(elapsed, this.state, deltaSeconds),
        reset: () => {
          this.activeParticleTracks.clear();
          this.particles.group.visible = false;
          this.particles.reset();
        },
      },
      glb: {
        playAnimation: (resourceId, name, options = {}, cue) => {
          const animationOptions = {
            ...options,
            fadeDuration: cue.seeking ? 0 : options.fadeDuration,
            startTime:
              (Number(options.startTime) || 0) +
              Math.max(0, this.timeline?.elapsed - cue.at) *
                (Number(options.timeScale) || 1),
            issuedAt: this.elapsed,
          };
          if (resourceId === this.reliefResourceId) {
            return this.barkOcclusion.playAnimation(name, animationOptions);
          }
          return this.glbResources.playAnimation(resourceId, name, animationOptions);
        },
        stopAnimation: (resourceId, name, options = {}, cue) => {
          const stopOptions = {
            ...options,
            fadeDuration: cue.seeking ? 0 : options.fadeDuration,
          };
          if (resourceId === this.reliefResourceId) {
            this.barkOcclusion.stopAnimation(name, stopOptions);
          } else {
            this.glbResources.stopAnimation(resourceId, name, stopOptions);
          }
        },
        fadeAnimation: (name, duration, options) =>
          this.barkOcclusion.fadeAnimation(name, duration, options),
        update: (elapsed, deltaSeconds) =>
          this.glbResources.update(deltaSeconds, elapsed),
        reset: () => this.glbResources.reset(),
      },
    };
    timelineChannels.audio = {
      playAudio: (name, options = {}, cue) => audioController?.playAudio?.(name, {
        ...options,
        fadeDuration: cue.seeking ? 0 : options.fadeDuration,
        startTime:
          (Number(options.startTime) || 0) +
          Math.max(0, this.timeline?.elapsed - cue.at) *
            (Number(options.playbackRate) || 1),
      }),
      stopAudio: (name, options = {}, cue) => audioController?.stopAudio?.(name, {
        ...options,
        fadeDuration: cue.seeking ? 0 : options.fadeDuration,
      }),
      fadeAudio: (name, duration, volume, cue) => audioController?.fadeAudio?.(
        name,
        cue.seeking ? 0 : duration,
        volume,
      ),
      update: (...args) => audioController?.update?.(...args),
      pause: (...args) => audioController?.pauseAll?.(...args),
      resume: (...args) => audioController?.resumeAll?.(...args),
      reset: (...args) => audioController?.reset?.(...args),
    };
    this.timeline = new ExperienceTimeline({
      cues: compileTimelineCues(this.timelineData),
      channels: timelineChannels,
    });

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
    this.timelineCompleted = false;
    this.targetVisible = false;
    this.lostAt = null;
    this.disposed = false;
    this.standaloneDebug = standaloneDebug;
    scene.add(this.root);

    if (standaloneDebug) {
      this.root.visible = true;
      this.targetVisible = true;
      this.state = EXPERIENCE_STATE.AWAKENING;
      this.elapsed = 0;
      this.timeline.reset();
      this.timeline.update(this.elapsed, 0);
      this.calibrationEditor?.setTargetVisible(true);
    }
    this.timelineEditor =
      CONFIG.debug && standaloneDebug
        ? new TimelineEditor({ experience: this })
        : null;
  }

  isExpectedTarget(detail) {
    return detail?.name === CONFIG.targetName;
  }

  playAnimation(name, options = {}) {
    return this.barkOcclusion.playAnimation(name, options);
  }

  stopAnimation(name = null, options = {}) {
    this.barkOcclusion.stopAnimation(name, options);
  }

  fadeAnimation(name = null, duration = 0.35, options = {}) {
    return this.barkOcclusion.fadeAnimation(name, duration, options);
  }

  registerTimelineChannel(name, channel) {
    this.timeline.registerChannel(name, channel);
    return this;
  }

  registerTimelineAdapter(name, adapter) {
    this.resourceAdapters.set(name, adapter);
    this.timeline.registerAdapter(name, adapter);
    this.timelineData.resources
      .filter((resource) => resource.type === name || resource.adapter === name)
      .forEach((resource) => adapter?.load?.({
        ...resource,
        url: resolveResourceUrl(resource.src),
      }));
    return this;
  }

  syncResources(data, { userGesture = false } = {}) {
    const resources = data?.resources || [];
    const audioIds = new Set();
    const genericGlbIds = new Set();
    resources.forEach((resource) => {
      const definition = {
        ...resource,
        url: resolveResourceUrl(resource.src),
      };
      if (resource.type === "audio") {
        audioIds.add(resource.id);
        this.audioController?.registerResource?.(definition, { userGesture });
      } else if (resource.type === "glb" && resource.adapter !== "life-tree-relief") {
        genericGlbIds.add(resource.id);
        this.glbResources.registerResource(definition);
      } else if (resource.type !== "glb") {
        const adapter = this.resourceAdapters.get(resource.adapter) ||
          this.resourceAdapters.get(resource.type);
        adapter?.load?.(definition);
      }
    });
    (this.audioController?.audioNames || []).forEach((id) => {
      if (!audioIds.has(id)) this.audioController.unregisterResource(id);
    });
    this.glbResources.metadata.forEach((resource) => {
      if (!genericGlbIds.has(resource.id)) this.glbResources.unregisterResource(resource.id);
    });
  }

  registerResource(definition, { userGesture = false } = {}) {
    const id = String(definition?.id || "").trim();
    if (!id) throw new Error("资源 ID 不能为空");
    if (this.timelineData.resources.some((resource) => resource.id === id)) {
      throw new Error(`资源 ID 已存在：${id}`);
    }
    const source = {
      ...this.timelineData,
      resources: [...this.timelineData.resources, {
        ...definition,
        id,
        label: definition.label || id,
      }],
    };
    this.timelineData = normalizeTimelineData(source);
    this.syncResources(this.timelineData, { userGesture });
    return this.getResourceMetadata().find((resource) => resource.id === id) || null;
  }

  unregisterResource(id) {
    const references = this.timelineData.tracks
      .filter((track) => track.resource === id)
      .map((track) => track.id);
    if (references.length) {
      throw new Error(`资源仍被轨道引用：${references.join(", ")}`);
    }
    const resource = this.timelineData.resources.find((item) => item.id === id);
    if (!resource) return false;
    if (resource.adapter === "life-tree-relief") {
      throw new Error("生命树主体资源不能在运行中删除");
    }
    this.timelineData = normalizeTimelineData({
      ...this.timelineData,
      resources: this.timelineData.resources.filter((item) => item.id !== id),
    });
    if (resource.type === "audio") this.audioController?.unregisterResource?.(id);
    if (resource.type === "glb") this.glbResources.unregisterResource(id);
    if (resource.type !== "audio" && resource.type !== "glb") {
      const adapter = this.resourceAdapters.get(resource.adapter) ||
        this.resourceAdapters.get(resource.type);
      if (typeof adapter?.unregisterResource === "function") {
        adapter.unregisterResource(id);
      } else {
        adapter?.unload?.(id);
      }
    }
    return true;
  }

  getResourceMetadata() {
    const audio = new Map(
      (this.audioController?.audioMetadata || []).map((item) => [item.id, item]),
    );
    const glb = new Map(this.glbResources.metadata.map((item) => [item.id, item]));
    return this.timelineData.resources.map((resource) => {
      if (resource.id === this.reliefResourceId) {
        return {
          ...resource,
          ...this.barkOcclusion.resourceMetadata,
          animations: this.barkOcclusion.animationMetadata,
          resolvedUrl: resolveResourceUrl(resource.src),
        };
      }
      let runtime = null;
      if (resource.type === "audio") runtime = audio.get(resource.id);
      else if (resource.type === "glb") runtime = glb.get(resource.id);
      else {
        const adapter = this.resourceAdapters.get(resource.adapter) ||
          this.resourceAdapters.get(resource.type);
        runtime = adapter?.getMetadata?.(resource.id) || null;
      }
      return {
        ...resource,
        ...runtime,
        resolvedUrl: resolveResourceUrl(resource.src),
        status: runtime?.status ||
          (resource.type === "audio" || resource.type === "glb" ? "loading" : "registered"),
      };
    });
  }

  unlockAudio() {
    this.audioController?.unlock?.();
  }

  auditionAudioResource(id) {
    const resource = this.timelineData.resources.find(
      (item) => item.id === id && item.type === "audio",
    );
    if (!resource) return false;
    this.timelinePlayback.playing = false;
    this.timeline.reset({ reason: "resource-audition" });
    this.audioController?.playAudio?.(id, {
      volume: 1,
      loop: false,
      startTime: 0,
      fadeDuration: 0,
    });
    // If this is the first audio gesture, the selected resource is already
    // active, so unlockTrack starts it once at full audition volume.
    this.unlockAudio();
    return true;
  }

  getTimelineData() {
    return JSON.parse(JSON.stringify(this.timelineData));
  }

  getTimelineMetadata() {
    const resources = this.getResourceMetadata();
    return {
      resources,
      animations: resources
        .filter((resource) => resource.type === "glb")
        .flatMap((resource) => (resource.animations || []).map((animation) => ({
          ...animation,
          resourceId: resource.id,
        }))),
      audio: this.audioController?.audioMetadata || [],
    };
  }

  cueAllowed(cue) {
    if (this.previewOnlyTracks && !this.previewOnlyTracks.has(cue.trackId)) return false;
    if (this.previewOnlyChannels && !this.previewOnlyChannels.has(cue.channelId)) return false;
    if (!this.previewBypassMute && this.previewMutedChannels.has(cue.channelId)) return false;
    if (
      this.previewSoloChannels.size > 0 &&
      !this.previewSoloChannels.has(cue.channelId)
    ) return false;
    return true;
  }

  rebuildPreviewState({ preserveTime = true } = {}) {
    this.timeline.setCues(compileTimelineCues(this.timelineData, {
      includeDisabled: Boolean(this.previewOnlyChannels || this.previewOnlyTracks),
    }));
    this.timeline.setCueFilter((cue) => this.cueAllowed(cue));
    if (preserveTime) this.seekTimeline(this.elapsed);
  }

  setPreviewFilter(
    { channelIds = null, trackIds = null, bypassMute = false } = {},
    { preserveTime = true } = {},
  ) {
    this.previewOnlyChannels = channelIds ? new Set(channelIds) : null;
    this.previewOnlyTracks = trackIds ? new Set(trackIds) : null;
    this.previewBypassMute = Boolean(bypassMute);
    this.rebuildPreviewState({ preserveTime });
  }

  clearPreviewFilter({ preserveMuted = true, preserveTime = true } = {}) {
    this.previewOnlyChannels = null;
    this.previewOnlyTracks = null;
    this.previewBypassMute = false;
    this.previewSoloChannels.clear();
    if (!preserveMuted) this.previewMutedChannels.clear();
    this.rebuildPreviewState({ preserveTime });
  }

  setChannelMuted(id, muted) {
    if (muted) this.previewMutedChannels.add(id);
    else this.previewMutedChannels.delete(id);
    this.rebuildPreviewState();
  }

  setChannelSolo(id, solo) {
    if (solo) this.previewSoloChannels.add(id);
    else this.previewSoloChannels.delete(id);
    this.rebuildPreviewState();
  }

  getPreviewState() {
    return {
      mutedChannels: [...this.previewMutedChannels],
      soloChannels: [...this.previewSoloChannels],
      onlyChannels: this.previewOnlyChannels ? [...this.previewOnlyChannels] : [],
      onlyTracks: this.previewOnlyTracks ? [...this.previewOnlyTracks] : [],
      playing: this.timelinePlayback.playing,
    };
  }

  setChannelEnabled(id, enabled) {
    const channel = this.timelineData.channels.find((item) => item.id === id);
    if (!channel) return false;
    channel.enabled = Boolean(enabled);
    this.setTimelineData(this.timelineData, { preserveTime: true });
    return true;
  }

  setTrackEnabled(id, enabled) {
    const track = this.timelineData.tracks.find((item) => item.id === id);
    if (!track) return false;
    track.enabled = Boolean(enabled);
    this.setTimelineData(this.timelineData, { preserveTime: true });
    return true;
  }

  setTimelineData(source, { preserveTime = true } = {}) {
    const currentTime = preserveTime ? this.elapsed : 0;
    this.timelineData = normalizeTimelineData(source);
    this.syncResources(this.timelineData);
    this.timeline.setCues(compileTimelineCues(this.timelineData, {
      includeDisabled: Boolean(this.previewOnlyChannels || this.previewOnlyTracks),
    }));
    this.timeline.setCueFilter((cue) => this.cueAllowed(cue));
    this.timelinePlayback.end = Math.min(
      this.timelinePlayback.end,
      this.timelineData.duration,
    );
    this.seekTimeline(Math.min(currentTime, this.timelineData.duration));
    return this.getTimelineData();
  }

  seekTimeline(seconds) {
    const time = Math.min(
      this.timelineData.duration,
      Math.max(0, Number(seconds) || 0),
    );
    this.state = EXPERIENCE_STATE.AWAKENING;
    this.elapsed = time;
    this.timeline.seek(time, { preview: this.standaloneDebug });
    if (this.standaloneDebug && !this.timelinePlayback.playing) {
      this.timeline.pause({ reason: "seek-paused" });
    }
    return time;
  }

  previewTimelineRange(start, end, { loop = true } = {}) {
    const rangeStart = Math.max(0, Number(start) || 0);
    const rangeEnd = Math.min(
      this.timelineData.duration,
      Math.max(rangeStart + 0.05, Number(end) || this.timelineData.duration),
    );
    this.timelinePlayback = {
      enabled: true,
      playing: true,
      start: rangeStart,
      end: rangeEnd,
      loop: Boolean(loop),
    };
    // On the first Debug preview, build the active media state before
    // unlocking. The gesture then starts only the selected active element,
    // avoiding an unlock play that is immediately interrupted by seek/reset.
    this.seekTimeline(rangeStart);
    this.unlockAudio();
  }

  previewChannel(id, range = {}) {
    // previewTimelineRange() immediately seeks to the range start. Do not seek
    // once here while paused, otherwise media receives play -> pause -> play
    // inside the same user gesture and some browsers abort the final play().
    this.setPreviewFilter(
      { channelIds: [id], bypassMute: true },
      { preserveTime: false },
    );
    this.previewTimelineRange(
      range.start ?? this.timelinePlayback.start ?? 0,
      range.end ?? this.timelinePlayback.end ?? this.timelineData.duration,
      { loop: range.loop ?? true },
    );
  }

  previewTrack(id, { loop = true } = {}) {
    const track = this.timelineData.tracks.find((item) => item.id === id);
    if (!track) return false;
    this.setPreviewFilter(
      { trackIds: [id], bypassMute: true },
      { preserveTime: false },
    );
    this.previewTimelineRange(track.start, track.end, { loop });
    return true;
  }

  playTrackPreview(id, { loop = true } = {}) {
    const track = this.timelineData.tracks.find((item) => item.id === id);
    if (!track) return false;
    const onlyThisTrack =
      this.previewOnlyTracks?.size === 1 && this.previewOnlyTracks.has(id);
    if (
      onlyThisTrack &&
      !this.timelinePlayback.playing &&
      this.elapsed >= track.start &&
      this.elapsed < track.end
    ) {
      this.timelinePlayback.start = track.start;
      this.timelinePlayback.end = track.end;
      this.timelinePlayback.loop = Boolean(loop);
      this.resumeTimeline();
      return true;
    }
    return this.previewTrack(id, { loop });
  }

  pauseTrackPreview(id) {
    const onlyThisTrack =
      this.previewOnlyTracks?.size === 1 && this.previewOnlyTracks.has(id);
    if (!onlyThisTrack) return false;
    this.pauseTimeline();
    return true;
  }

  previewEntireTimeline({ loop = true } = {}) {
    this.clearPreviewFilter({ preserveMuted: true, preserveTime: false });
    this.previewTimelineRange(0, this.timelineData.duration, { loop });
  }

  pauseTimeline() {
    this.timelinePlayback.playing = false;
    this.timeline.pause({ reason: "timeline" });
  }

  resumeTimeline() {
    this.timelinePlayback.enabled = true;
    this.timelinePlayback.playing = true;
    this.unlockAudio();
    this.timeline.resume({ reason: "timeline" });
  }

  getTimelineSnapshot() {
    return {
      elapsed: this.elapsed,
      state: this.state,
      ...this.timelinePlayback,
      duration: this.timelineData.duration,
    };
  }

  beginAwakening() {
    this.state = EXPERIENCE_STATE.AWAKENING;
    this.elapsed = 0;
    this.timelineCompleted = false;
    this.timeline.reset();
    this.timeline.update(0, 0);
  }

  onTargetFound(detail) {
    if (this.disposed || !this.isExpectedTarget(detail)) return;
    const now = performance.now();
    const lossExpired =
      this.lostAt !== null &&
      now - this.lostAt >= CONFIG.timeline.targetLostGraceMs;
    const shouldResume = this.lostAt !== null && !lossExpired;
    if (lossExpired) this.reset();

    applyImageTargetPose(this.root, detail);
    this.targetVisible = true;
    this.lostAt = null;
    this.root.visible = true;
    this.calibrationEditor?.setTargetVisible(true);
    if (shouldResume && !this.timelineCompleted) {
      this.timeline.resume({ reason: "target-found" });
    }

    if (this.state === EXPERIENCE_STATE.IDLE || this.timelineCompleted) {
      this.beginAwakening();
    }
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
    this.timeline.pause({ reason: "target-lost" });
    if (this.timelineCompleted) {
      this.reset();
      return;
    }
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

    if (this.standaloneDebug && this.timelinePlayback.enabled) {
      if (!this.timelinePlayback.playing) return;
      const next = this.elapsed + deltaSeconds;
      if (next >= this.timelinePlayback.end) {
        if (this.timelinePlayback.loop) {
          this.seekTimeline(this.timelinePlayback.start);
        } else {
          this.seekTimeline(this.timelinePlayback.end);
          this.pauseTimeline();
          if (this.previewOnlyChannels || this.previewOnlyTracks) {
            // Rebuild all non-muted channels at the final playhead after a
            // filtered preview, instead of leaving the preview-only state live.
            this.clearPreviewFilter({ preserveMuted: true, preserveTime: true });
          }
        }
        return;
      }
      this.elapsed = next;
    } else if (this.state === EXPERIENCE_STATE.AWAKENING) {
      this.elapsed = Math.min(this.timelineData.duration, this.elapsed + deltaSeconds);
    } else if (this.state === EXPERIENCE_STATE.ALIVE) {
      this.elapsed = Math.min(this.timelineData.duration, this.elapsed + deltaSeconds);
    }

    this.timeline.update(this.elapsed, deltaSeconds);
    if (
      !this.standaloneDebug &&
      !this.timelineCompleted &&
      this.elapsed >= this.timelineData.duration
    ) {
      this.timelineCompleted = true;
      this.timeline.pause({ reason: "timeline-complete" });
    }
  }

  reset() {
    this.state = EXPERIENCE_STATE.IDLE;
    this.elapsed = 0;
    this.timelineCompleted = false;
    this.targetVisible = false;
    this.lostAt = null;
    this.calibrationEditor?.setTargetVisible(false);
    this.root.visible = false;
    this.timeline.reset();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.calibrationEditor?.dispose();
    this.calibrationEditor = null;
    this.timelineEditor?.dispose();
    this.timelineEditor = null;
    this.timeline?.reset();
    this.timeline?.dispose();
    this.timeline = null;
    this.effects.forEach((effect) => effect.dispose());
    this.glbResources?.dispose();
    this.glbResources = null;
    this.resourceAdapters.forEach((adapter) => adapter?.dispose?.());
    this.resourceAdapters.clear();
    this.root.removeFromParent();
    this.scene = null;
    this.camera = null;
    this.canvas = null;
    this.audioController = null;
  }
}
