const number = (value, fallback = 0) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;

const DEFAULT_CHANNELS = Object.freeze([
  { id: "shader", type: "shader", label: "Shader", enabled: true },
  { id: "glb", type: "glb", label: "GLB 动画", enabled: true },
  { id: "audio", type: "audio", label: "声音", enabled: true },
  { id: "particles", type: "particles", label: "粒子", enabled: true },
]);

const LEGACY_AUDIO_PATHS = Object.freeze({
  "bgm": "assets/bgm.mp3",
  "life-tree-awaken": "assets/bgm.mp3",
  "bird-event": "assets/bgm.mp3",
  "forest-spring-loop": "assets/bgm.mp3",
});

const defaultChannelForType = (type) => {
  if (type === "audio-volume") return "audio";
  if (type === "experience") return "shader";
  return String(type || "experience");
};

const migrateResources = (source, tracks) => {
  if (Array.isArray(source?.resources)) return source.resources;
  const resources = [];
  const ids = new Set();
  const add = (resource) => {
    if (!resource?.id || ids.has(resource.id)) return;
    ids.add(resource.id);
    resources.push(resource);
  };
  tracks.forEach((track) => {
    if (track.type === "audio" || track.type === "audio-volume") {
      const id = String(track.audio || track.resource || "");
      if (!id) return;
      add({
        id,
        type: "audio",
        label: id,
        src: LEGACY_AUDIO_PATHS[id] || `assets/${id}.mp3`,
        preload: "metadata",
      });
    }
    if (track.type === "glb") {
      add({
        id: "tree-and-animals",
        type: "glb",
        label: "生命树与动物",
        src: "assets/tree-and-animals.glb",
        preload: "auto",
        adapter: "life-tree-relief",
      });
    }
  });
  return resources;
};

const normalizeResources = (source, tracks) => {
  const ids = new Set();
  return migrateResources(source, tracks)
    .filter((resource) => resource?.id && resource?.type && !ids.has(String(resource.id)))
    .map((resource) => {
      ids.add(String(resource.id));
      return {
        ...resource,
        id: String(resource.id),
        type: String(resource.type),
        label: String(resource.label || resource.id),
        src: String(resource.src || ""),
        preload: String(resource.preload || (resource.type === "audio" ? "metadata" : "auto")),
        adapter: resource.adapter ? String(resource.adapter) : undefined,
      };
    });
};

const normalizeChannels = (source, tracks) => {
  const supplied = Array.isArray(source?.channels) ? source.channels : [];
  const channelIds = new Set(tracks.map((track) =>
    String(track.channel || defaultChannelForType(track.type)),
  ));
  const candidates = supplied.length
    ? supplied
    : DEFAULT_CHANNELS.filter((channel) => channelIds.has(channel.id));
  const ids = new Set();
  const channels = candidates
    .filter((channel) => channel?.id && !ids.has(String(channel.id)))
    .map((channel) => {
      ids.add(String(channel.id));
      return {
        ...channel,
        id: String(channel.id),
        type: String(channel.type || channel.id),
        label: String(channel.label || channel.id),
        enabled: channel.enabled !== false,
      };
    });
  channelIds.forEach((id) => {
    if (ids.has(id)) return;
    const fallback = DEFAULT_CHANNELS.find((channel) => channel.id === id);
    channels.push({
      id,
      type: fallback?.type || id,
      label: fallback?.label || id,
      enabled: true,
    });
  });
  return channels;
};

export const normalizeTimelineData = (source) => {
  const duration = Math.max(0.1, number(source?.duration, 15));
  const inputTracks = Array.isArray(source?.tracks) ? source.tracks : [];
  const resources = normalizeResources(source, inputTracks);
  const resourceIds = new Set(resources.map((resource) => resource.id));
  const ids = new Set();
  const tracks = inputTracks
    .filter((track) => track?.id && track?.type && !ids.has(String(track.id)))
    .map((track) => {
      ids.add(String(track.id));
      const start = Math.min(
        Math.max(0, duration - 0.01),
        Math.max(0, number(track.start)),
      );
      let end = Math.min(
        duration,
        Math.max(start + 0.01, number(track.end, duration)),
      );
      const sourceIn = Math.max(0, number(track.sourceIn));
      const sourceOut = track.sourceOut === undefined
        ? undefined
        : Math.max(sourceIn + 0.01, number(track.sourceOut, sourceIn + 0.01));
      const playbackRate = Math.max(0.01, number(track.playbackRate, 1));
      if (
        sourceOut !== undefined &&
        (track.type === "glb" || track.type === "audio" || track.type === "video")
      ) {
        end = Math.min(
          duration,
          Math.max(
            start + 0.01,
            Math.min(end, start + (sourceOut - sourceIn) / playbackRate),
          ),
        );
      }
      const legacyResource = track.type === "glb"
        ? "tree-and-animals"
        : track.audio;
      const resource = String(track.resource || legacyResource || "");
      return {
        ...track,
        id: String(track.id),
        type: String(track.type),
        channel: String(track.channel || defaultChannelForType(track.type)),
        resource: resourceIds.has(resource) ? resource : resource || undefined,
        label: String(track.label || track.id),
        enabled: track.enabled !== false,
        start,
        end,
        sourceIn,
        sourceOut,
        playbackRate,
        volume: track.volume === undefined
          ? undefined
          : Math.min(1, Math.max(0, number(track.volume))),
        restoreVolume: track.restoreVolume === undefined
          ? undefined
          : Math.min(1, Math.max(0, number(track.restoreVolume))),
        fadeIn: Math.min(end - start, Math.max(0, number(track.fadeIn))),
        fadeOut: Math.min(end - start, Math.max(0, number(track.fadeOut))),
      };
    });
  const channels = normalizeChannels(source, tracks);
  return { version: 3, duration, resources, channels, tracks };
};

const cue = (track, suffix, at, runtimeChannel, action, args = []) => ({
  id: `${track.id}:${suffix}`,
  trackId: track.id,
  channelId: track.channel,
  at,
  channel: runtimeChannel,
  action,
  args,
});

export const compileTimelineCues = (source, { includeDisabled = false } = {}) => {
  const data = normalizeTimelineData(source);
  const enabledChannels = new Map(
    data.channels.map((channel) => [channel.id, channel.enabled !== false]),
  );
  const channelOrder = new Map(
    data.channels.map((channel, index) => [channel.id, index]),
  );
  const cues = [];
  [...data.tracks]
    .map((track, index) => ({ track, index }))
    .sort((a, b) =>
      (channelOrder.get(a.track.channel) ?? 999) -
        (channelOrder.get(b.track.channel) ?? 999) ||
      a.index - b.index,
    )
    .forEach(({ track }) => {
    if (
      !includeDisabled &&
      (track.enabled === false || enabledChannels.get(track.channel) === false)
    ) return;
    if (track.type === "glb") {
      cues.push(cue(track, "play", track.start, "glb", "playAnimation", [
        track.resource,
        track.clip,
        {
          loop: track.loop === false || track.loop === "once" ? "once" : track.loop || "repeat",
          fadeDuration: track.fadeIn,
          layer: track.layer || "default",
          startTime: track.sourceIn,
          timeScale: track.playbackRate,
          trackId: track.id,
        },
      ]));
      cues.push(cue(track, "stop", Math.max(track.start, track.end - track.fadeOut), "glb", "stopAnimation", [
        track.resource,
        track.clip,
        { fadeDuration: track.fadeOut, trackId: track.id },
      ]));
      return;
    }
    if (track.type === "audio") {
      cues.push(cue(track, "play", track.start, "audio", "playAudio", [
        track.resource,
        {
          loop: Boolean(track.loop),
          volume: track.volume ?? 1,
          fadeDuration: track.fadeIn,
          startTime: track.sourceIn,
          playbackRate: track.playbackRate,
        },
      ]));
      cues.push(cue(track, "stop", Math.max(track.start, track.end - track.fadeOut), "audio", "stopAudio", [
        track.resource,
        { fadeDuration: track.fadeOut },
      ]));
      return;
    }
    if (track.type === "audio-volume") {
      cues.push(cue(track, "duck", track.start, "audio", "fadeAudio", [track.resource, track.fadeIn, track.volume ?? 0]));
      cues.push(cue(track, "restore", track.end, "audio", "fadeAudio", [track.resource, track.fadeOut, track.restoreVolume ?? 1]));
      return;
    }
    if (!["shader", "particles", "experience"].includes(track.type)) {
      const mediaOptions = {
        sourceIn: track.sourceIn,
        sourceOut: track.sourceOut,
        playbackRate: track.playbackRate,
        loop: Boolean(track.loop),
        fadeIn: track.fadeIn,
        fadeOut: track.fadeOut,
        trackId: track.id,
      };
      cues.push(cue(track, "start", track.start, track.channel, "start", [
        track.resource,
        mediaOptions,
      ]));
      cues.push(cue(track, "stop", track.end, track.channel, "stop", [
        track.resource,
        { trackId: track.id, fadeOut: track.fadeOut },
      ]));
      return;
    }
    const runtimeChannel = track.type === "shader"
      ? "shader"
      : track.type === "particles"
        ? "particles"
        : "experience";
    cues.push(cue(track, "start", track.start, runtimeChannel, track.action || "wake"));
    if (track.type === "shader" || track.type === "particles") {
      cues.push(cue(track, "stop", track.end, runtimeChannel, "sleep"));
    }
    });
  return cues;
};
