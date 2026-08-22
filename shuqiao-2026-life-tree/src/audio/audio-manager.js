const clamp01 = (value) => Math.min(1, Math.max(0, Number(value) || 0));

/** Dynamic HTMLAudio timeline adapter with Safari/WeChat-safe gesture unlocking. */
export class AudioManager {
  constructor(definitions = []) {
    this.tracks = new Map();
    this.unlocked = false;
    this.disposed = false;
    const entries = Array.isArray(definitions)
      ? definitions
      : Object.entries(definitions).map(([id, definition]) => ({ id, ...definition }));
    entries.forEach((definition) => this.registerResource(definition));
  }

  registerResource(definition, { userGesture = false } = {}) {
    const id = String(definition?.id || "").trim();
    if (!id || this.disposed) return null;
    const src = String(definition.url || definition.src || "");
    const existing = this.tracks.get(id);
    if (existing && existing.src === src) return existing;
    if (existing) this.unregisterResource(id);

    const audio = new Audio();
    const volume = clamp01(definition.volume ?? 1);
    const track = {
      id,
      name: id,
      label: String(definition.label || id),
      src,
      audio,
      volume,
      active: false,
      resumeAfterPause: false,
      fade: null,
      targetVolume: volume,
      playToken: 0,
      status: "loading",
      error: null,
      onMetadata: null,
      onError: null,
    };
    audio.src = track.src;
    audio.preload = definition.preload || "metadata";
    audio.loop = Boolean(definition.loop);
    audio.playsInline = true;
    audio.crossOrigin = "anonymous";
    audio.volume = volume;
    track.onMetadata = () => {
      track.status = "ready";
      track.error = null;
    };
    track.onError = () => {
      track.status = "error";
      track.error = audio.error?.message || `无法加载 ${track.src}`;
    };
    audio.addEventListener("loadedmetadata", track.onMetadata);
    audio.addEventListener("error", track.onError);
    this.tracks.set(id, track);
    if (this.unlocked && userGesture) this.unlockTrack(track);
    return track;
  }

  unregisterResource(id) {
    const track = this.tracks.get(id);
    if (!track) return false;
    this.stopTrack(track);
    track.audio.removeEventListener("loadedmetadata", track.onMetadata);
    track.audio.removeEventListener("error", track.onError);
    track.audio.removeAttribute("src");
    track.audio.load();
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
      duration: Number.isFinite(track.audio.duration) ? track.audio.duration : null,
      ready: track.audio.readyState >= 1,
      active: track.active,
      paused: track.audio.paused,
      muted: track.audio.muted,
      volume: track.audio.volume,
      targetVolume: track.targetVolume,
    }));
  }

  invalidateTrack(track) {
    track.playToken += 1;
    track.fade = null;
  }

  prepareAudible(track) {
    track.audio.muted = false;
    track.audio.defaultMuted = false;
  }

  unlockTrack(track) {
    const { audio } = track;
    const token = ++track.playToken;
    audio.muted = true;
    audio.defaultMuted = true;
    audio.volume = 0;
    const finish = () => {
      if (track.playToken !== token) return;
      if (this.disposed) {
        audio.pause();
        return;
      }
      audio.pause();
      try { audio.currentTime = 0; } catch (error) { /* metadata pending */ }
      this.prepareAudible(track);
      audio.volume = track.active ? track.targetVolume : track.volume;
    };
    const promise = audio.play();
    if (promise?.then) {
      promise.then(finish).catch((error) => {
        track.error = error?.message || String(error);
        this.prepareAudible(track);
        audio.volume = track.volume;
        console.warn(`[Audio] Unlock failed for "${track.id}":`, error);
      });
    } else {
      finish();
    }
  }

  /** Must be called synchronously from Start AR or a Timeline editor click. */
  unlock({ prewarmTracks = true } = {}) {
    if (this.disposed || this.unlocked) return;
    this.unlocked = true;
    if (!prewarmTracks) return;
    this.tracks.forEach((track) => this.unlockTrack(track));
  }

  guardedPlay(track, token, idForLog = track.id) {
    const promise = track.audio.play();
    if (!promise?.then) {
      if (track.playToken === token && (!track.active || this.disposed)) {
        track.audio.pause();
      }
      return;
    }
    void promise.then(() => {
      if (track.playToken !== token) return;
      if (!track.active || this.disposed) {
        track.audio.pause();
      }
    }).catch((error) => {
      if (track.playToken !== token || !track.active || this.disposed) return;
      track.error = error?.message || String(error);
      console.warn(`[Audio] Playback failed for "${idForLog}":`, error);
    });
  }

  playAudio(id, options = {}) {
    const track = this.tracks.get(id);
    if (!track || this.disposed) {
      console.warn(`[Audio] Resource "${id}" not found.`);
      return null;
    }
    const targetVolume = clamp01(options.volume ?? track.volume);
    const fadeDuration = Math.max(0, Number(options.fadeDuration) || 0);
    track.active = true;
    track.targetVolume = targetVolume;
    track.resumeAfterPause = false;
    track.audio.loop = options.loop ?? track.audio.loop;
    track.audio.playbackRate = Math.max(0.01, Number(options.playbackRate) || 1);
    this.prepareAudible(track);
    const startTime = Math.max(0, Number(options.startTime) || 0);
    try {
      if (Number.isFinite(track.audio.duration) && track.audio.duration > 0) {
        track.audio.currentTime = track.audio.loop
          ? startTime % track.audio.duration
          : Math.min(startTime, Math.max(0, track.audio.duration - 0.01));
      } else {
        track.audio.currentTime = startTime;
      }
    } catch (error) {
      track.error = error?.message || String(error);
    }
    track.audio.volume = fadeDuration > 0 ? 0 : targetVolume;
    track.fade = fadeDuration > 0
      ? { from: 0, to: targetVolume, duration: fadeDuration, elapsed: 0 }
      : null;
    if (this.unlocked) {
      this.guardedPlay(track, ++track.playToken, id);
    }
    return track.audio;
  }

  stopAudio(id = null, options = {}) {
    const fadeDuration = Math.max(0, Number(options.fadeDuration) || 0);
    const targets = id
      ? [this.tracks.get(id)].filter(Boolean)
      : [...this.tracks.values()];
    targets.forEach((track) => {
      if (fadeDuration > 0 && !track.audio.paused) {
        track.fade = {
          from: track.audio.volume,
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
    if (Number(duration) <= 0) {
      track.fade = null;
      track.audio.volume = track.targetVolume;
      return;
    }
    track.fade = {
      from: track.audio.volume,
      to: track.targetVolume,
      duration: Math.max(0.001, Number(duration) || 0.5),
      elapsed: 0,
    };
  }

  stopTrack(track) {
    this.invalidateTrack(track);
    track.active = false;
    track.resumeAfterPause = false;
    this.prepareAudible(track);
    track.audio.pause();
    try { track.audio.currentTime = 0; } catch (error) { /* metadata pending */ }
    track.audio.volume = track.volume;
  }

  pauseAll() {
    this.tracks.forEach((track) => {
      track.resumeAfterPause = track.active && !track.audio.paused;
      if (track.active || !track.audio.paused) {
        this.invalidateTrack(track);
        this.prepareAudible(track);
        track.audio.pause();
      }
    });
  }

  resumeAll() {
    this.tracks.forEach((track) => {
      if (!track.active || !track.resumeAfterPause) return;
      track.resumeAfterPause = false;
      this.prepareAudible(track);
      this.guardedPlay(track, ++track.playToken);
    });
  }

  update(_elapsed, deltaSeconds = 0) {
    if (this.disposed || deltaSeconds <= 0) return;
    this.tracks.forEach((track) => {
      if (!track.fade) return;
      track.fade.elapsed += deltaSeconds;
      const progress = Math.min(1, track.fade.elapsed / track.fade.duration);
      const eased = progress * progress * (3 - 2 * progress);
      track.audio.volume = track.fade.from + (track.fade.to - track.fade.from) * eased;
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
    this.disposed = true;
  }
}
