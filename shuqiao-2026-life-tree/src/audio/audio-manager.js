const clamp01 = (value) => Math.min(1, Math.max(0, Number(value) || 0));

const AudioContextClass = () =>
  window.AudioContext || window.webkitAudioContext || null;

/**
 * WebAudio timeline adapter.
 *
 * Start AR only resumes a silent AudioContext. Real resources are fetched and
 * decoded, but no real BGM source is created until the timeline calls playAudio
 * after Image Target recognition.
 */
export class AudioManager {
  constructor(definitions = []) {
    this.tracks = new Map();
    this.context = null;
    this.masterGain = null;
    this.unlocked = false;
    this.disposed = false;
    const entries = Array.isArray(definitions)
      ? definitions
      : Object.entries(definitions).map(([id, definition]) => ({ id, ...definition }));
    entries.forEach((definition) => this.registerResource(definition));
  }

  ensureContext() {
    if (this.context || this.disposed) return this.context;
    const Ctor = AudioContextClass();
    if (!Ctor) return null;
    this.context = new Ctor();
    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = 1;
    this.masterGain.connect(this.context.destination);
    return this.context;
  }

  registerResource(definition) {
    const id = String(definition?.id || "").trim();
    if (!id || this.disposed) return null;
    const src = String(definition.url || definition.src || "");
    const existing = this.tracks.get(id);
    if (existing && existing.src === src) return existing;
    if (existing) this.unregisterResource(id);

    const volume = clamp01(definition.volume ?? 1);
    const track = {
      id,
      name: id,
      label: String(definition.label || id),
      src,
      volume,
      targetVolume: volume,
      active: false,
      paused: true,
      resumeAfterPause: false,
      offset: 0,
      source: null,
      gain: null,
      sourceStartedAt: 0,
      playbackRate: 1,
      loop: false,
      fade: null,
      playToken: 0,
      buffer: null,
      loadPromise: null,
      status: "loading",
      error: null,
    };
    this.tracks.set(id, track);
    this.loadTrack(track);
    return track;
  }

  loadTrack(track) {
    if (track.loadPromise || track.buffer || !track.src) return track.loadPromise;
    track.status = "loading";
    track.loadPromise = fetch(track.src, { mode: "cors" })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.arrayBuffer();
      })
      .then((arrayBuffer) => {
        const context = this.ensureContext();
        if (!context) throw new Error("WebAudio is not available.");
        return context.decodeAudioData(arrayBuffer);
      })
      .then((buffer) => {
        if (this.disposed || !this.tracks.has(track.id)) return null;
        track.buffer = buffer;
        track.status = "ready";
        track.error = null;
        if (track.active && track.paused && this.unlocked) {
          this.startTrack(track, track.offset, ++track.playToken);
        }
        return buffer;
      })
      .catch((error) => {
        if (!this.tracks.has(track.id)) return null;
        track.status = "error";
        track.error = error?.message || String(error);
        console.warn(`[Audio] Failed to load "${track.id}":`, error);
        return null;
      });
    return track.loadPromise;
  }

  unregisterResource(id) {
    const track = this.tracks.get(id);
    if (!track) return false;
    this.stopTrack(track);
    this.tracks.delete(id);
    return true;
  }

  get audioNames() {
    return [...this.tracks.keys()];
  }

  get audioMetadata() {
    return [...this.tracks.values()].map((track) => ({
      id: track.id,
      name: track.id,
      label: track.label,
      type: "audio",
      src: track.src,
      status: track.status,
      error: track.error,
      duration: track.buffer?.duration || null,
      ready: Boolean(track.buffer),
      active: track.active,
      paused: track.paused,
      muted: false,
      volume: track.gain?.gain.value ?? track.targetVolume,
      targetVolume: track.targetVolume,
    }));
  }

  unlock() {
    if (this.disposed || this.unlocked) return;
    const context = this.ensureContext();
    this.unlocked = true;
    if (!context) return;
    const silentGain = context.createGain();
    silentGain.gain.value = 0;
    silentGain.connect(this.masterGain);
    const silent = context.createBufferSource();
    silent.buffer = context.createBuffer(1, 1, Math.max(8000, context.sampleRate));
    silent.connect(silentGain);
    try { silent.start(0); } catch (error) { /* already started */ }
    if (context.state === "suspended") {
      void context.resume().catch((error) => {
        console.warn("[Audio] AudioContext resume failed:", error);
      });
    }
  }

  stopSource(track) {
    if (!track.source) return;
    try { track.source.stop(0); } catch (error) { /* already stopped */ }
    track.source.disconnect();
    track.source = null;
  }

  normalizeOffset(track, offset) {
    const duration = track.buffer?.duration || 0;
    const value = Math.max(0, Number(offset) || 0);
    if (track.loop && duration > 0) return value % duration;
    if (duration > 0) return Math.min(value, Math.max(0, duration - 0.01));
    return value;
  }

  currentOffset(track) {
    if (!track.source || !this.context) return track.offset;
    const elapsed = (this.context.currentTime - track.sourceStartedAt) * track.playbackRate;
    return this.normalizeOffset(track, track.offset + elapsed);
  }

  startTrack(track, offset = 0, token = ++track.playToken) {
    const context = this.ensureContext();
    if (!context || !track.buffer || this.disposed || !track.active) return null;
    this.stopSource(track);
    if (!track.gain) {
      track.gain = context.createGain();
      track.gain.connect(this.masterGain);
    }
    const source = context.createBufferSource();
    source.buffer = track.buffer;
    source.loop = Boolean(track.loop);
    source.playbackRate.value = track.playbackRate;
    source.connect(track.gain);
    track.offset = this.normalizeOffset(track, offset);
    track.sourceStartedAt = context.currentTime;
    track.source = source;
    track.paused = false;
    source.onended = () => {
      if (track.playToken !== token || track.source !== source) return;
      track.source = null;
      if (!track.loop && track.active) {
        track.active = false;
        track.paused = true;
        track.offset = 0;
      }
    };
    try {
      source.start(0, track.offset);
    } catch (error) {
      track.error = error?.message || String(error);
      track.active = false;
      track.paused = true;
      track.source = null;
      console.warn(`[Audio] Playback failed for "${track.id}":`, error);
    }
    return source;
  }

  playAudio(id, options = {}) {
    const track = this.tracks.get(id);
    if (!track || this.disposed) {
      console.warn(`[Audio] Resource "${id}" not found.`);
      return null;
    }
    const context = this.ensureContext();
    if (context?.state === "suspended" && this.unlocked) {
      void context.resume().catch(() => undefined);
    }
    track.active = true;
    track.paused = true;
    track.resumeAfterPause = false;
    track.loop = Boolean(options.loop);
    track.playbackRate = Math.max(0.01, Number(options.playbackRate) || 1);
    track.offset = Math.max(0, Number(options.startTime) || 0);
    track.targetVolume = clamp01(options.volume ?? track.volume);
    const fadeDuration = Math.max(0, Number(options.fadeDuration) || 0);
    if (!track.gain && context) {
      track.gain = context.createGain();
      track.gain.connect(this.masterGain);
    }
    if (track.gain) track.gain.gain.value = fadeDuration > 0 ? 0 : track.targetVolume;
    track.fade = fadeDuration > 0
      ? {
          from: 0,
          to: track.targetVolume,
          duration: fadeDuration,
          elapsed: 0,
        }
      : null;

    const token = ++track.playToken;
    if (track.buffer && this.unlocked) {
      return this.startTrack(track, track.offset, token);
    }
    this.loadTrack(track)?.then(() => {
      if (track.playToken !== token || !track.active || this.disposed || !this.unlocked) return;
      this.startTrack(track, track.offset, token);
    });
    return null;
  }

  stopAudio(id = null, options = {}) {
    const fadeDuration = Math.max(0, Number(options.fadeDuration) || 0);
    const targets = id
      ? [this.tracks.get(id)].filter(Boolean)
      : [...this.tracks.values()];
    targets.forEach((track) => {
      if (fadeDuration > 0 && track.source && track.gain) {
        track.fade = {
          from: track.gain.gain.value,
          to: 0,
          duration: fadeDuration,
          elapsed: 0,
          stopAtEnd: true,
        };
      } else {
        this.stopTrack(track);
      }
    });
  }

  fadeAudio(id, duration = 0.5, targetVolume = 0) {
    const track = this.tracks.get(id);
    if (!track || this.disposed) return;
    track.targetVolume = clamp01(targetVolume);
    if (!track.gain) return;
    if (Number(duration) <= 0) {
      track.fade = null;
      track.gain.gain.value = track.targetVolume;
      return;
    }
    track.fade = {
      from: track.gain.gain.value,
      to: track.targetVolume,
      duration: Math.max(0.001, Number(duration) || 0.5),
      elapsed: 0,
    };
  }

  stopTrack(track) {
    track.playToken += 1;
    track.active = false;
    track.paused = true;
    track.resumeAfterPause = false;
    track.fade = null;
    track.offset = 0;
    this.stopSource(track);
    if (track.gain) track.gain.gain.value = track.volume;
  }

  pauseAll() {
    this.tracks.forEach((track) => {
      track.resumeAfterPause = track.active && !track.paused;
      if (!track.active && track.paused) return;
      track.playToken += 1;
      track.offset = this.currentOffset(track);
      track.paused = true;
      track.fade = null;
      this.stopSource(track);
    });
  }

  resumeAll() {
    this.tracks.forEach((track) => {
      if (!track.active || !track.resumeAfterPause) return;
      track.resumeAfterPause = false;
      if (track.buffer && this.unlocked) {
        this.startTrack(track, track.offset, ++track.playToken);
      }
    });
  }

  update(_elapsed, deltaSeconds = 0) {
    if (this.disposed || deltaSeconds <= 0) return;
    this.tracks.forEach((track) => {
      if (!track.fade || !track.gain) return;
      track.fade.elapsed += deltaSeconds;
      const progress = Math.min(1, track.fade.elapsed / track.fade.duration);
      const eased = progress * progress * (3 - 2 * progress);
      track.gain.gain.value = track.fade.from + (track.fade.to - track.fade.from) * eased;
      if (progress < 1) return;
      const stopAtEnd = track.fade.stopAtEnd;
      track.fade = null;
      if (stopAtEnd) this.stopTrack(track);
    });
  }

  reset() {
    this.stopAudio();
  }

  dispose() {
    if (this.disposed) return;
    [...this.tracks.keys()].forEach((id) => this.unregisterResource(id));
    this.masterGain?.disconnect();
    if (this.context && this.context.state !== "closed") {
      void this.context.close().catch(() => undefined);
    }
    this.disposed = true;
  }
}
