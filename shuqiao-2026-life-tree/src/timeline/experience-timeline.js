const callChannel = (channel, action, args, cue) => {
  if (!channel) return false;
  if (typeof channel === "function") {
    channel(action, ...args, cue);
    return true;
  }
  const handler = channel[action];
  if (typeof handler !== "function") return false;
  handler(...args, cue);
  return true;
};

/**
 * Shared deterministic timeline for discrete cues and continuous channel tracks.
 * Channels can represent GLB animation, shaders, particles, audio, or UI.
 */
export class ExperienceTimeline {
  constructor({ cues = [], channels = {} } = {}) {
    this.cues = [];
    this.setCues(cues);
    this.channels = new Map(Object.entries(channels));
    this.cursor = 0;
    this.elapsed = 0;
    this.cueFilter = null;
    this.disposed = false;
  }

  setCues(cues = []) {
    this.cues = [...cues]
      .map((cue, index) => ({ ...cue, order: index }))
      .sort((a, b) => Number(a.at) - Number(b.at) || a.order - b.order);
    this.cursor = 0;
    return this;
  }

  registerChannel(name, channel) {
    if (!this.disposed) this.channels.set(name, channel);
    return this;
  }

  registerAdapter(name, adapter) {
    return this.registerChannel(name, adapter);
  }

  unregisterChannel(name) {
    this.channels.delete(name);
  }

  setCueFilter(filter = null) {
    this.cueFilter = typeof filter === "function" ? filter : null;
    return this;
  }

  clearCueFilter() {
    this.cueFilter = null;
    return this;
  }

  dispatch(cue) {
    if (this.cueFilter && !this.cueFilter(cue)) return;
    const channel = this.channels.get(cue.channel);
    const handled = callChannel(channel, cue.action, cue.args || [], cue);
    if (!handled) {
      console.warn(
        `[Experience Timeline] No handler for ${cue.channel}.${cue.action}`,
      );
    }
  }

  update(elapsed, deltaSeconds = 0, context = {}) {
    if (this.disposed) return;
    this.elapsed = Math.max(0, Number(elapsed) || 0);
    while (
      this.cursor < this.cues.length &&
      Number(this.cues[this.cursor].at) <= this.elapsed
    ) {
      this.dispatch({
        ...this.cues[this.cursor],
        timelineElapsed: this.elapsed,
        seeking: Boolean(context.seeking),
      });
      this.cursor += 1;
    }
    this.channels.forEach((channel) => {
      if (typeof channel?.update === "function") {
        channel.update(this.elapsed, deltaSeconds, context);
      }
    });
  }

  reset(context = {}) {
    if (this.disposed) return;
    this.cursor = 0;
    this.elapsed = 0;
    this.channels.forEach((channel) => {
      if (typeof channel?.reset === "function") channel.reset(context);
    });
  }

  seek(elapsed, context = {}) {
    if (this.disposed) return;
    this.reset({ ...context, seeking: true });
    this.update(elapsed, 0, { ...context, seeking: true });
    this.channels.forEach((channel) => {
      if (typeof channel?.seek === "function") channel.seek(elapsed, context);
    });
  }

  pause(context = {}) {
    if (this.disposed) return;
    this.channels.forEach((channel) => {
      if (typeof channel?.pause === "function") channel.pause(context);
    });
  }

  resume(context = {}) {
    if (this.disposed) return;
    this.channels.forEach((channel) => {
      if (typeof channel?.resume === "function") channel.resume(context);
    });
  }

  dispose() {
    if (this.disposed) return;
    this.channels.clear();
    this.cueFilter = null;
    this.cues.length = 0;
    this.cursor = 0;
    this.disposed = true;
  }
}
