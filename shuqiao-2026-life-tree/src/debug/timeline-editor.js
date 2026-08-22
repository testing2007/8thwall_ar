import timelineSource from "../data/timeline.json";
import { normalizeTimelineData } from "../data/experience-timeline-data";

const STYLE_ID = "life-tree-timeline-style";
const DATA_KEY = "life-tree-timeline-v4";
const LEGACY_DATA_KEY = "life-tree-timeline-v1";
const UI_KEY = "life-tree-timeline-ui-v4";
const BASE_PPS = 56;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;
const LABEL_WIDTH = 268;
const WORKSPACE_SIDEBAR = 364;
const WORKSPACE_TIMELINE = 332;
const COLORS = {
  glb: "#73e0ff", audio: "#f3b65f", "audio-volume": "#ff7c9d",
  shader: "#b89cff", particles: "#81d58a", experience: "#f2e16d",
  metadata: "#79a8b6",
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round = (value) => Math.round(value * 100) / 100;
const clone = (value) => JSON.parse(JSON.stringify(value));
const escapeHtml = (value) => String(value ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const readJson = (key) => {
  try { return JSON.parse(localStorage.getItem(key) || "null"); }
  catch (error) { return null; }
};
const writeJson = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch (error) { console.warn("[Timeline Editor] Local storage failed:", error); }
};

const createStyle = () => {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #life-tree-timeline{--label:${LABEL_WIDTH}px;position:fixed;z-index:1210;left:${WORKSPACE_SIDEBAR + 12}px;right:8px;bottom:8px;width:auto;height:min(${WORKSPACE_TIMELINE}px,calc(100vh - 16px));min-width:min(520px,calc(100vw - 16px));min-height:min(260px,calc(100vh - 16px));display:flex;flex-direction:column;overflow:hidden;border:1px solid rgba(103,220,245,.55);border-radius:8px;background:rgba(7,11,18,.96);color:#eaf2f8;box-shadow:0 18px 48px rgba(0,0,0,.45);font:12px/1.35 system-ui,-apple-system,"Segoe UI",sans-serif;user-select:none}
    #life-tree-timeline *{box-sizing:border-box}#life-tree-timeline button,#life-tree-timeline input,#life-tree-timeline select{min-height:28px;border:1px solid rgba(255,255,255,.15);border-radius:5px;background:rgba(255,255,255,.07);color:inherit;font:inherit}#life-tree-timeline button{padding:4px 8px;cursor:pointer}#life-tree-timeline button:hover{background:rgba(115,224,255,.13)}#life-tree-timeline button.is-active{border-color:#73e0ff;color:#a9efff;background:rgba(115,224,255,.12)}#life-tree-timeline button:disabled{opacity:.35;cursor:not-allowed}
    #life-tree-timeline input[type=number]{width:66px;padding:3px 5px}#life-tree-timeline input[type=text]{width:148px;padding:3px 6px}#life-tree-timeline select{padding:3px 6px}
    .lte-head{display:flex;align-items:center;gap:6px;padding:6px 8px;border-bottom:1px solid rgba(255,255,255,.1);flex:none}.lte-drag{flex:1;font-weight:720;cursor:grab;touch-action:none}.lte-drag:before{content:"≡";color:#73e0ff;margin-right:7px}.lte-time{min-width:82px;text-align:right;color:#a9efff;font-variant-numeric:tabular-nums}.lte-head button{min-width:28px;padding:3px 6px}
    .lte-controls{display:flex;align-items:center;gap:5px;flex-wrap:wrap;padding:6px 8px;border-bottom:1px solid rgba(255,255,255,.08);flex:none}.lte-controls label,.lte-inspector label{display:flex;align-items:center;gap:4px;color:#aebbc7}.lte-spacer{flex:1}.lte-zoom{min-width:48px;text-align:center;color:#a9efff;font-variant-numeric:tabular-nums}
    .lte-resources{flex:none;max-height:154px;overflow:auto;padding:7px 8px;border-bottom:1px solid rgba(255,255,255,.09);background:rgba(3,7,12,.7)}.lte-resources[hidden]{display:none}.lte-resource-form{display:flex;gap:5px;align-items:center;flex-wrap:wrap;margin-bottom:6px}.lte-resource-list{display:grid;gap:4px}.lte-resource{display:grid;grid-template-columns:74px minmax(100px,1fr) minmax(160px,2fr) auto;gap:6px;align-items:center;padding:4px 0;border-top:1px solid rgba(255,255,255,.06)}.lte-resource-status{font-size:10px}.lte-resource-status.ready{color:#81d58a}.lte-resource-status.loading{color:#f2e16d}.lte-resource-status.error{color:#ff7c9d}.lte-resource-path{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#8fa0ad}
    .lte-scroll{position:relative;flex:1;min-height:80px;overflow:auto;scrollbar-color:#355260 #101721}.lte-grid{position:relative;min-height:100%}.lte-row{display:grid;grid-template-columns:var(--label) var(--stage);min-height:34px;border-bottom:1px solid rgba(255,255,255,.055)}.lte-label{position:sticky;left:0;z-index:5;display:flex;align-items:center;gap:4px;min-width:0;padding:4px 6px;border-right:1px solid rgba(255,255,255,.08);background:#0b111a;color:#bdc8d2}.lte-name{flex:1;min-width:68px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.lte-tools{display:flex;gap:2px;flex:none}.lte-tools button{min-height:24px;min-width:24px;padding:0 5px;border-radius:4px}.lte-tools button.is-previewing{border-color:#ffe977;color:#ffe977;background:rgba(255,233,119,.14)}.lte-stage{position:relative;width:var(--stage);background-image:linear-gradient(to right,rgba(255,255,255,.07) 1px,transparent 1px);background-size:var(--major-grid) 100%;touch-action:none}
    .lte-ruler{position:sticky;top:0;z-index:15;min-height:28px}.lte-ruler .lte-label{z-index:18;background:#101923;color:#7f909e}.lte-ruler .lte-stage{height:28px;background-color:#101923;cursor:crosshair}.lte-tick{position:absolute;top:5px;transform:translateX(-50%);color:#7f909e;font-size:10px;pointer-events:none}.lte-channel .lte-label{background:#101923;font-weight:700;color:#e4edf3}.lte-channel .lte-stage{background-color:rgba(255,255,255,.025)}
    .lte-segment{position:absolute;top:5px;height:24px;min-width:4px;padding:3px 11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left;border:0!important;border-radius:5px!important;color:#071018!important;font-weight:720;cursor:grab;touch-action:none;opacity:.9}.lte-segment.is-selected{outline:2px solid #fff;outline-offset:-2px;opacity:1}.lte-segment.is-previewing{outline:2px solid #ffe977;outline-offset:-2px;box-shadow:0 0 0 1px rgba(255,233,119,.35),0 0 14px rgba(255,233,119,.28);opacity:1}.lte-segment.is-disabled{opacity:.28}.lte-edge{position:absolute;top:2px;bottom:2px;width:7px;border-radius:3px;background:rgba(255,255,255,.75);z-index:2}.lte-edge-in{left:2px;cursor:w-resize}.lte-edge-out{right:2px;cursor:e-resize}.lte-meta{top:8px;height:18px;padding:1px 6px;border:1px dashed rgba(255,255,255,.45)!important;background:rgba(121,168,182,.36)!important;color:#dff8ff!important;cursor:default;font-size:10px}.lte-playhead{position:absolute;top:0;bottom:0;width:1px;background:#73e0ff;pointer-events:none;z-index:12;box-shadow:0 0 7px rgba(115,224,255,.8)}.lte-playhead:before{content:"";position:absolute;top:0;left:-4px;border-left:4px solid transparent;border-right:4px solid transparent;border-top:6px solid #73e0ff}
    .lte-inspector{display:flex;gap:6px;align-items:center;flex-wrap:wrap;max-height:92px;overflow:auto;min-height:42px;padding:6px 8px;border-top:1px solid rgba(255,255,255,.09);flex:none}.lte-note{color:#7f909e;font-variant-numeric:tabular-nums}
    .lte-resize{position:absolute;z-index:30;touch-action:none}.lte-resize-r{right:0;top:36px;bottom:10px;width:7px;cursor:e-resize}.lte-resize-b{left:36px;right:10px;bottom:0;height:7px;cursor:s-resize}.lte-resize-c{right:0;bottom:0;width:14px;height:14px;cursor:nwse-resize;background:linear-gradient(135deg,transparent 45%,rgba(115,224,255,.6) 46%,rgba(115,224,255,.6) 55%,transparent 56%)}
    #life-tree-timeline.is-collapsed{height:auto!important;min-height:0}#life-tree-timeline.is-collapsed .lte-controls,#life-tree-timeline.is-collapsed .lte-resources,#life-tree-timeline.is-collapsed .lte-scroll,#life-tree-timeline.is-collapsed .lte-inspector,#life-tree-timeline.is-collapsed .lte-resize{display:none}
    body.life-tree-standalone-debug #camerafeed{position:fixed!important;left:${WORKSPACE_SIDEBAR + 12}px!important;right:8px!important;top:8px!important;bottom:${WORKSPACE_TIMELINE + 16}px!important;width:auto!important;height:auto!important;max-width:none!important;max-height:none!important}
    @media(max-width:900px){#life-tree-timeline{left:8px;right:8px;bottom:8px;height:min(310px,45vh);--label:210px}body.life-tree-standalone-debug #camerafeed{left:8px!important;right:8px!important;top:min(336px,calc(34vh + 16px))!important;bottom:min(326px,calc(45vh + 16px))!important}}
    @media(max-width:600px){#life-tree-timeline{--label:190px;min-width:min(320px,calc(100vw - 16px))}.lte-secondary{display:none}.lte-resource{grid-template-columns:64px 1fr auto}.lte-resource-path{display:none}.lte-tools button{min-width:22px;padding:0 4px}}
  `;
  document.head.appendChild(style);
};

export class TimelineEditor {
  constructor({ experience }) {
    this.experience = experience;
    this.defaultData = normalizeTimelineData(timelineSource);
    this.data = normalizeTimelineData(readJson(DATA_KEY) || readJson(LEGACY_DATA_KEY) || experience.getTimelineData());
    this.selectedId = this.data.tracks[0]?.id || null;
    this.rangeStart = 0;
    this.rangeEnd = this.data.duration;
    this.zoom = 1;
    this.resourceOpen = false;
    this.drag = null;
    this.panelDrag = null;
    this.resizeDrag = null;
    this.restoreGeometry = null;
    this.maximizedWidth = false;
    this.maximizedHeight = false;
    this.disposed = false;
    this.metadataKey = "";
    createStyle();
    this.createPanel();
    this.restoreUi();
    this.installEvents();
    this.applyData(false);
    this.render();
    this.animate = this.animate.bind(this);
    this.frame = requestAnimationFrame(this.animate);
    this.metadataTimer = setInterval(() => this.refreshMetadata(), 500);
  }

  createPanel() {
    this.panel = document.createElement("section");
    this.panel.id = "life-tree-timeline";
    this.panel.innerHTML = `
      <div class="lte-head"><span class="lte-drag" data-role="panel-drag">Experience Timeline V3</span><span class="lte-time" data-role="time-label"></span><button data-action="max-width" title="最大宽度">↔</button><button data-action="max-height" title="最大高度">↕</button><button data-action="max-full" title="全窗口">⛶</button><button data-action="collapse">收起</button></div>
      <div class="lte-controls"><button data-action="play">播放</button><button data-action="pause">暂停</button><button data-action="stop">停止</button><button data-action="all">整体预览</button><button data-action="range">选区预览</button><label>时间 <input data-role="seek" type="number" min="0" step=".1"></label><label>总长 <input data-role="duration" type="number" min=".1" step=".1"></label><label>从 <input data-role="range-start" type="number" min="0" step=".1"></label><label>到 <input data-role="range-end" type="number" min=".05" step=".1"></label><label><input data-role="loop" type="checkbox" checked>循环</label><span class="lte-spacer"></span><button data-action="zoom-out">−</button><span class="lte-zoom" data-role="zoom">100%</span><button data-action="zoom-in">＋</button><button data-action="zoom-reset">1:1</button><button data-action="resources">资源库</button><button data-action="import" class="lte-secondary">导入</button><button data-action="download">下载 JSON</button><button data-action="reset" class="lte-secondary">重置</button></div>
      <div class="lte-resources" data-role="resources" hidden><div class="lte-resource-form"><select data-role="resource-type"><option value="audio">音频</option><option value="glb">GLB</option></select><input data-role="resource-id" type="text" placeholder="资源 ID"><input data-role="resource-label" type="text" placeholder="名称"><input data-role="resource-src" type="text" placeholder="assets/example.mp3"><button data-action="add-resource">添加资源</button></div><div class="lte-resource-list" data-role="resource-list"></div></div>
      <div class="lte-scroll" data-role="scroll"><div class="lte-grid" data-role="grid"></div></div>
      <div class="lte-inspector" data-role="inspector"></div>
      <i class="lte-resize lte-resize-r" data-resize="right"></i><i class="lte-resize lte-resize-b" data-resize="bottom"></i><i class="lte-resize lte-resize-c" data-resize="corner"></i>`;
    document.body.appendChild(this.panel);
    this.grid = this.panel.querySelector('[data-role="grid"]');
    this.scroll = this.panel.querySelector('[data-role="scroll"]');
    this.inspector = this.panel.querySelector('[data-role="inspector"]');
    this.resourcePanel = this.panel.querySelector('[data-role="resources"]');
    this.resourceList = this.panel.querySelector('[data-role="resource-list"]');
    this.timeLabel = this.panel.querySelector('[data-role="time-label"]');
    this.seekInput = this.panel.querySelector('[data-role="seek"]');
    this.durationInput = this.panel.querySelector('[data-role="duration"]');
    this.rangeStartInput = this.panel.querySelector('[data-role="range-start"]');
    this.rangeEndInput = this.panel.querySelector('[data-role="range-end"]');
    this.loopInput = this.panel.querySelector('[data-role="loop"]');
    this.zoomLabel = this.panel.querySelector('[data-role="zoom"]');
    this.panelDragHandle = this.panel.querySelector('[data-role="panel-drag"]');
  }

  restoreUi() {
    const ui = readJson(UI_KEY) || {};
    this.zoom = clamp(Number(ui.zoom) || 1, MIN_ZOOM, MAX_ZOOM);
    this.resourceOpen = Boolean(ui.resourceOpen);
    const maxWidth = Math.max(160, innerWidth - 16);
    const maxHeight = Math.max(120, innerHeight - 16);
    const workspaceLeft = innerWidth > 900 ? WORKSPACE_SIDEBAR + 12 : 8;
    const defaultWidth = Math.max(320, innerWidth - workspaceLeft - 8);
    const defaultHeight = Math.min(innerWidth > 900 ? WORKSPACE_TIMELINE : 310, maxHeight);
    const defaultTop = Math.max(8, innerHeight - defaultHeight - 8);
    const width = clamp(Number(ui.width) || defaultWidth, Math.min(520, maxWidth), maxWidth);
    const height = clamp(Number(ui.height) || defaultHeight, Math.min(260, maxHeight), maxHeight);
    this.panel.style.width = `${width}px`;
    this.panel.style.height = `${height}px`;
    this.panel.style.left = `${clamp(Number(ui.left) || workspaceLeft, 0, innerWidth - 80)}px`;
    this.panel.style.top = `${clamp(Number(ui.top) || defaultTop, 0, innerHeight - 40)}px`;
    this.panel.style.right = "auto";
    this.panel.style.bottom = "auto";
    this.resourcePanel.hidden = !this.resourceOpen;
  }

  saveUi() {
    const rect = this.panel.getBoundingClientRect();
    writeJson(UI_KEY, { left: rect.left, top: rect.top, width: rect.width, height: rect.height, zoom: this.zoom, resourceOpen: this.resourceOpen });
  }

  installEvents() {
    this.onClick = this.handleClick.bind(this); this.onChange = this.handleChange.bind(this);
    this.onPointerDown = this.handlePointerDown.bind(this); this.onPointerMove = this.handlePointerMove.bind(this); this.onPointerUp = this.handlePointerUp.bind(this);
    this.onWheel = this.handleWheel.bind(this); this.onResize = this.handleWindowResize.bind(this);
    this.panel.addEventListener("click", this.onClick); this.panel.addEventListener("change", this.onChange);
    this.panel.addEventListener("pointerdown", this.onPointerDown); this.scroll.addEventListener("wheel", this.onWheel, { passive: false });
    window.addEventListener("pointermove", this.onPointerMove, { passive: false }); window.addEventListener("pointerup", this.onPointerUp); window.addEventListener("resize", this.onResize, { passive: true });
  }

  metadata() { return this.experience.getTimelineMetadata(); }
  resourceMetadata(id) { return this.metadata().resources?.find((item) => item.id === id) || null; }
  trackMetadata(track) {
    const resource = this.resourceMetadata(track.resource);
    if (track.type === "glb") return resource?.animations?.find((item) => item.name === track.clip) || null;
    return resource;
  }

  tickInterval(pps) {
    return [0.1, .25, .5, 1, 2, 5].find((value) => value * pps >= 54) || 5;
  }

  metadataRows(track) {
    if (track.type !== "glb") return [];
    const clip = this.trackMetadata(track); const rate = track.playbackRate || 1; const sourceIn = track.sourceIn || 0;
    return (clip?.activity || []).map((activity) => {
      const start = clamp(track.start + (activity.start - sourceIn) / rate, track.start, track.end);
      const end = clamp(track.start + (activity.end - sourceIn) / rate, track.start, track.end);
      return end > start ? { id: `${track.id}:${activity.label}`, type: "metadata", label: `↳ ${activity.label}`, start, end, detail: `${start.toFixed(1)}–${end.toFixed(1)}s` } : null;
    }).filter(Boolean);
  }

  isTrackPreviewing(id) {
    const preview = this.experience.getPreviewState();
    return preview.playing && preview.onlyTracks.length === 1 && preview.onlyTracks[0] === id;
  }

  render() {
    const pps = BASE_PPS * this.zoom; const stageWidth = Math.max(240, this.data.duration * pps); const interval = this.tickInterval(pps);
    this.grid.style.setProperty("--stage", `${stageWidth}px`); this.grid.style.setProperty("--major-grid", `${interval * pps}px`); this.grid.style.width = `${LABEL_WIDTH + stageWidth}px`;
    this.zoomLabel.textContent = `${Math.round(this.zoom * 100)}%`; this.durationInput.value = this.data.duration; this.rangeStartInput.value = this.rangeStart; this.rangeEndInput.value = this.rangeEnd;
    const ticks = []; for (let time = 0; time <= this.data.duration + .0001; time += interval) ticks.push(`<span class="lte-tick" style="left:${time * pps}px">${round(time)}</span>`);
    let html = `<div class="lte-row lte-ruler"><div class="lte-label">秒</div><div class="lte-stage" data-role="ruler">${ticks.join("")}<i class="lte-playhead"></i></div></div>`;
    this.data.channels.forEach((channel, channelIndex) => {
      const preview = this.experience.getPreviewState(); const muted = preview.mutedChannels.includes(channel.id); const solo = preview.soloChannels.includes(channel.id);
      html += `<div class="lte-row lte-channel"><div class="lte-label"><button data-channel-enabled="${escapeHtml(channel.id)}" class="${channel.enabled ? "is-active" : ""}" title="正式启用">●</button><span class="lte-name">${escapeHtml(channel.label)}</span><span class="lte-tools"><button data-action="channel-mute" data-channel-id="${escapeHtml(channel.id)}" class="${muted ? "is-active" : ""}">M</button><button data-action="channel-solo" data-channel-id="${escapeHtml(channel.id)}" class="${solo ? "is-active" : ""}">S</button><button data-action="preview-channel" data-channel-id="${escapeHtml(channel.id)}">▶</button><button data-action="channel-up" data-channel-id="${escapeHtml(channel.id)}" ${channelIndex === 0 ? "disabled" : ""}>↑</button><button data-action="channel-down" data-channel-id="${escapeHtml(channel.id)}" ${channelIndex === this.data.channels.length - 1 ? "disabled" : ""}>↓</button></span></div><div class="lte-stage"><i class="lte-playhead"></i></div></div>`;
      const tracks = this.data.tracks.filter((track) => track.channel === channel.id);
      tracks.forEach((track, trackIndex) => {
        html += this.trackRow(track, pps, trackIndex, tracks.length);
        this.metadataRows(track).forEach((row) => { html += this.trackRow(row, pps, 0, 1, true); });
      });
    });
    this.grid.innerHTML = html; this.renderInspector(); this.renderResources(); this.updatePlayheads();
  }

  legacyTrackRow(track, pps, index, length, metadata = false) {
    const left = track.start * pps; const width = Math.max(4, (track.end - track.start) * pps); const selected = track.id === this.selectedId ? " is-selected" : "";
    const detail = metadata ? track.detail : track.type === "glb" ? `${track.clip || "GLB"} · ${(track.end - track.start).toFixed(1)}s` : track.type === "audio" ? `${track.resource || "Audio"} · ${Math.round((track.volume ?? 1) * 100)}%` : `${track.start.toFixed(1)}–${track.end.toFixed(1)}s`;
    const label = metadata ? `<span class="lte-name">${escapeHtml(track.label)}</span>` : `<button data-track-enabled="${escapeHtml(track.id)}" class="${track.enabled ? "is-active" : ""}" title="正式启用">●</button><span class="lte-name">${escapeHtml(track.label)}</span><span class="lte-tools"><button data-action="preview-track" data-track-id="${escapeHtml(track.id)}">▶</button><button data-action="track-up" data-track-id="${escapeHtml(track.id)}" ${index === 0 ? "disabled" : ""}>↑</button><button data-action="track-down" data-track-id="${escapeHtml(track.id)}" ${index === length - 1 ? "disabled" : ""}>↓</button></span>`;
    return `<div class="lte-row"><div class="lte-label">${label}</div><div class="lte-stage"><button class="lte-segment${metadata ? " lte-meta" : ""}${selected}${track.enabled === false ? " is-disabled" : ""}" data-segment-id="${escapeHtml(track.id)}" ${metadata ? "disabled" : ""} style="left:${left}px;width:${width}px;background:${COLORS[track.type] || "#9bacb5"}">${metadata ? "" : '<i class="lte-edge lte-edge-in" data-edge="start"></i>'}${escapeHtml(detail)}${metadata ? "" : '<i class="lte-edge lte-edge-out" data-edge="end"></i>'}</button><i class="lte-playhead"></i></div></div>`;
  }

  trackRow(track, pps, index, length, metadata = false) {
    const left = track.start * pps;
    const width = Math.max(4, (track.end - track.start) * pps);
    const selected = track.id === this.selectedId ? " is-selected" : "";
    const previewing = !metadata && this.isTrackPreviewing(track.id);
    const detail = metadata
      ? track.detail
      : track.type === "glb"
        ? `${track.clip || "GLB"} - ${(track.end - track.start).toFixed(1)}s`
        : track.type === "audio"
          ? `${track.resource || "Audio"} - ${Math.round((track.volume ?? 1) * 100)}%`
          : `${track.start.toFixed(1)}-${track.end.toFixed(1)}s`;
    const label = metadata
      ? `<span class="lte-name">${escapeHtml(track.label)}</span>`
      : `<button data-track-enabled="${escapeHtml(track.id)}" class="${track.enabled ? "is-active" : ""}" title="正式启用">●</button><span class="lte-name" title="${escapeHtml(track.label)}">${escapeHtml(track.label)}</span><span class="lte-tools"><button data-action="track-play" data-track-id="${escapeHtml(track.id)}" class="${previewing ? "is-previewing" : ""}" title="预览此轨道">▶</button><button data-action="track-pause" data-track-id="${escapeHtml(track.id)}" ${previewing ? "" : "disabled"} title="暂停此轨道">⏸</button><button data-action="track-up" data-track-id="${escapeHtml(track.id)}" ${index === 0 ? "disabled" : ""}>↑</button><button data-action="track-down" data-track-id="${escapeHtml(track.id)}" ${index === length - 1 ? "disabled" : ""}>↓</button></span>`;
    return `<div class="lte-row"><div class="lte-label">${label}</div><div class="lte-stage"><button class="lte-segment${metadata ? " lte-meta" : ""}${selected}${previewing ? " is-previewing" : ""}${track.enabled === false ? " is-disabled" : ""}" data-segment-id="${escapeHtml(track.id)}" ${metadata ? "disabled" : ""} style="left:${left}px;width:${width}px;background:${COLORS[track.type] || "#9bacb5"}">${metadata ? "" : '<i class="lte-edge lte-edge-in" data-edge="start"></i>'}${escapeHtml(detail)}${metadata ? "" : '<i class="lte-edge lte-edge-out" data-edge="end"></i>'}</button><i class="lte-playhead"></i></div></div>`;
  }

  renderResources() {
    const runtime = new Map((this.metadata().resources || []).map((item) => [item.id, item]));
    this.resourceList.innerHTML = this.data.resources.map((resource) => {
      const item = runtime.get(resource.id) || {}; const status = item.status || "loading"; const detail = resource.type === "audio" ? (item.duration ? `${item.duration.toFixed(2)}s · ${item.active && !item.paused ? `播放 ${Math.round((item.volume ?? 0) * 100)}%` : "待机"}` : "读取时长") : `${item.animations?.length || 0} Clips`;
      const clips = resource.type === "glb" && item.animations?.length ? `<select data-resource-clip="${escapeHtml(resource.id)}">${item.animations.map((clip) => `<option>${escapeHtml(clip.name)}</option>`).join("")}</select>` : "";
      const trackDisabled = status === "error" || (resource.type === "glb" && status === "loading");
      const audition = resource.type === "audio" ? `<button data-action="resource-audition" data-resource-id="${escapeHtml(resource.id)}" ${status === "error" ? "disabled" : ""}>试听</button>` : "";
      return `<div class="lte-resource"><span>${escapeHtml(resource.type.toUpperCase())}</span><span><b>${escapeHtml(resource.label)}</b> <small class="lte-resource-status ${status}" title="${escapeHtml(item.error || "")}">${escapeHtml(status)} · ${escapeHtml(detail)}</small></span><span class="lte-resource-path" title="${escapeHtml(item.resolvedUrl || resource.src)}">${escapeHtml(resource.src)}</span><span class="lte-tools">${clips}${audition}<button data-action="resource-track" data-resource-id="${escapeHtml(resource.id)}" ${trackDisabled ? "disabled" : ""}>建轨</button><button data-action="resource-delete" data-resource-id="${escapeHtml(resource.id)}" ${resource.adapter === "life-tree-relief" ? "disabled" : ""}>删</button></span></div>`;
    }).join("");
  }

  renderInspector() {
    const track = this.data.tracks.find((item) => item.id === this.selectedId);
    if (!track) { this.inspector.innerHTML = "<span class='lte-note'>选择时间片段后编辑精确参数</span>"; return; }
    const duration = track.end - track.start; const meta = this.trackMetadata(track); const max = Number(meta?.duration); let extras = "";
    if (track.type === "audio" || track.type === "audio-volume") extras += `<label>音量 <input data-field="volume" type="number" min="0" max="1" step=".01" value="${track.volume ?? 1}"></label>`;
    if (track.type === "audio-volume") extras += `<label>恢复 <input data-field="restoreVolume" type="number" min="0" max="1" step=".01" value="${track.restoreVolume ?? 1}"></label>`;
    if (track.type === "glb") { const resource = this.resourceMetadata(track.resource); extras += `<label>Clip <select data-field="clip">${(resource?.animations || []).map((clip) => `<option ${clip.name === track.clip ? "selected" : ""}>${escapeHtml(clip.name)}</option>`).join("") || `<option>${escapeHtml(track.clip || "等待 GLB")}</option>`}</select></label>`; }
    if (track.type === "audio" || track.type === "glb") { const sourceOut = track.sourceOut ?? (track.sourceIn || 0) + duration * (track.playbackRate || 1); extras += `<label>资源入 <input data-field="sourceIn" type="number" min="0" step=".01" value="${round(track.sourceIn || 0)}"></label><label>资源出 <input data-field="sourceOut" type="number" min=".01" ${Number.isFinite(max) ? `max="${max}"` : ""} step=".01" value="${round(sourceOut)}"></label><label>速度 <input data-field="playbackRate" type="number" min=".01" max="8" step=".05" value="${track.playbackRate || 1}"></label><label>淡入 <input data-field="fadeIn" type="number" min="0" step=".05" value="${track.fadeIn || 0}"></label><label>淡出 <input data-field="fadeOut" type="number" min="0" step=".05" value="${track.fadeOut || 0}"></label><label><input data-field="loop" type="checkbox" ${track.loop !== false && track.loop !== "once" ? "checked" : ""}>循环</label><span class="lte-note">资源 ${Number.isFinite(max) ? `${max.toFixed(2)}s` : "读取中"}</span>`; }
    this.inspector.innerHTML = `<b>${escapeHtml(track.label)}</b><label>名称 <input data-field="label" type="text" value="${escapeHtml(track.label)}"></label><label>出场 <input data-field="start" type="number" min="0" step=".01" value="${track.start}"></label><label>退场 <input data-field="end" type="number" min=".01" step=".01" value="${track.end}"></label><label>时长 <input data-field="duration" type="number" min=".05" step=".01" value="${round(duration)}"></label>${extras}`;
  }

  applyData(preserveTime = true) {
    this.data = normalizeTimelineData(this.data); this.experience.setTimelineData(this.data, { preserveTime }); writeJson(DATA_KEY, this.data);
  }

  moveChannel(id, delta) { const i = this.data.channels.findIndex((item) => item.id === id); const n = clamp(i + delta, 0, this.data.channels.length - 1); if (i < 0 || i === n) return; const [item] = this.data.channels.splice(i, 1); this.data.channels.splice(n, 0, item); this.applyData(); this.render(); }
  moveTrack(id, delta) { const track = this.data.tracks.find((item) => item.id === id); if (!track) return; const same = this.data.tracks.filter((item) => item.channel === track.channel); const i = same.findIndex((item) => item.id === id); const n = clamp(i + delta, 0, same.length - 1); if (i === n) return; const globalI = this.data.tracks.indexOf(track); this.data.tracks.splice(globalI, 1); const target = same[n]; const targetIndex = this.data.tracks.indexOf(target); this.data.tracks.splice(delta > 0 ? targetIndex + 1 : targetIndex, 0, track); this.applyData(); this.render(); }

  handleClick(event) {
    const action = event.target.closest("[data-action]")?.dataset.action; const segment = event.target.closest("[data-segment-id]")?.dataset.segmentId;
    if (segment) { this.selectedId = segment; this.render(); return; }
    const channelEnabled = event.target.dataset.channelEnabled; if (channelEnabled) { const channel = this.data.channels.find((item) => item.id === channelEnabled); channel.enabled = !channel.enabled; this.applyData(); this.render(); return; }
    const trackEnabled = event.target.dataset.trackEnabled; if (trackEnabled) { const track = this.data.tracks.find((item) => item.id === trackEnabled); track.enabled = !track.enabled; this.applyData(); this.render(); return; }
    if (!action) return;
    const channelId = event.target.dataset.channelId; const trackId = event.target.dataset.trackId; const resourceId = event.target.dataset.resourceId;
    if (action === "play") this.playRange(false); else if (action === "pause") this.experience.pauseTimeline(); else if (action === "stop") { this.experience.pauseTimeline(); this.experience.clearPreviewFilter({ preserveMuted: true, preserveTime: false }); this.experience.seekTimeline(this.rangeStart); }
    else if (action === "all") { this.rangeStart = 0; this.rangeEnd = this.data.duration; this.experience.previewEntireTimeline({ loop: this.loopInput.checked }); this.render(); }
    else if (action === "range") this.playRange(true); else if (action === "zoom-in") this.setZoom(this.zoom * 1.25); else if (action === "zoom-out") this.setZoom(this.zoom / 1.25); else if (action === "zoom-reset") this.setZoom(1);
    else if (action === "resources") { this.resourceOpen = !this.resourceOpen; this.resourcePanel.hidden = !this.resourceOpen; this.saveUi(); }
    else if (action === "channel-mute") { const active = this.experience.getPreviewState().mutedChannels.includes(channelId); this.experience.setChannelMuted(channelId, !active); this.render(); }
    else if (action === "channel-solo") { const active = this.experience.getPreviewState().soloChannels.includes(channelId); this.experience.setChannelSolo(channelId, !active); this.render(); }
    else if (action === "preview-channel") this.experience.previewChannel(channelId, { start: this.rangeStart, end: this.rangeEnd, loop: this.loopInput.checked });
    else if (action === "preview-track" || action === "track-play") { this.experience.playTrackPreview(trackId, { loop: this.loopInput.checked }); this.render(); }
    else if (action === "track-pause") { this.experience.pauseTrackPreview(trackId); this.render(); }
    else if (action === "channel-up") this.moveChannel(channelId, -1); else if (action === "channel-down") this.moveChannel(channelId, 1); else if (action === "track-up") this.moveTrack(trackId, -1); else if (action === "track-down") this.moveTrack(trackId, 1);
    else if (action === "add-resource") this.addResource(); else if (action === "resource-audition") this.experience.auditionAudioResource(resourceId); else if (action === "resource-track") this.addTrackForResource(resourceId); else if (action === "resource-delete") this.deleteResource(resourceId);
    else if (action === "download") this.download(); else if (action === "import") this.import(); else if (action === "reset") this.reset(); else if (action === "collapse") this.panel.classList.toggle("is-collapsed");
    else if (action === "max-width") this.maximize("width"); else if (action === "max-height") this.maximize("height"); else if (action === "max-full") this.maximize("full");
  }

  playRange(force) { const snap = this.experience.getTimelineSnapshot(); if (force || snap.elapsed < this.rangeStart || snap.elapsed >= this.rangeEnd) this.experience.previewTimelineRange(this.rangeStart, this.rangeEnd, { loop: this.loopInput.checked }); else { this.experience.timelinePlayback.start = this.rangeStart; this.experience.timelinePlayback.end = this.rangeEnd; this.experience.timelinePlayback.loop = this.loopInput.checked; this.experience.resumeTimeline(); } }

  addResource() {
    const type = this.panel.querySelector('[data-role="resource-type"]').value; const idInput = this.panel.querySelector('[data-role="resource-id"]'); const labelInput = this.panel.querySelector('[data-role="resource-label"]'); const srcInput = this.panel.querySelector('[data-role="resource-src"]');
    const definition = { id: idInput.value.trim(), type, label: labelInput.value.trim() || idInput.value.trim(), src: srcInput.value.trim(), preload: type === "audio" ? "metadata" : "auto" };
    if (!definition.id || !definition.src) { alert("资源 ID 和相对路径不能为空"); return; }
    try { this.experience.unlockAudio(); this.experience.registerResource(definition, { userGesture: true }); this.data = this.experience.getTimelineData(); writeJson(DATA_KEY, this.data); idInput.value = ""; labelInput.value = ""; srcInput.value = ""; this.render(); }
    catch (error) { alert(error.message); }
  }

  deleteResource(id) { try { this.experience.unregisterResource(id); this.data = this.experience.getTimelineData(); writeJson(DATA_KEY, this.data); this.render(); } catch (error) { alert(error.message); } }
  uniqueTrackId(base) { let id = base; let index = 2; while (this.data.tracks.some((track) => track.id === id)) id = `${base}-${index++}`; return id; }
  addTrackForResource(id) {
    const resource = this.data.resources.find((item) => item.id === id); const runtime = this.resourceMetadata(id); if (!resource) return;
    const start = clamp(this.experience.getTimelineSnapshot().elapsed, 0, this.data.duration - .05);
    const selector = [...this.panel.querySelectorAll("[data-resource-clip]")]
      .find((item) => item.dataset.resourceClip === id);
    const clip = selector?.value || runtime?.animations?.[0]?.name;
    const clipMeta = runtime?.animations?.find((item) => item.name === clip);
    const mediaDuration = resource.type === "audio" ? runtime?.duration : clipMeta?.duration;
    const length = Number.isFinite(mediaDuration) ? mediaDuration : 5;
    const end = Math.min(this.data.duration, start + Math.max(.05, length));
    const track = { id: this.uniqueTrackId(`${id}-track`), type: resource.type, channel: resource.type, resource: id, label: resource.label, enabled: true, start: round(start), end: round(end), sourceIn: 0, sourceOut: Number.isFinite(mediaDuration) ? round(Math.min(mediaDuration, end - start)) : undefined, playbackRate: 1, loop: false, fadeIn: 0, fadeOut: 0, volume: resource.type === "audio" ? 1 : undefined, clip };
    this.data.tracks.push(track); this.selectedId = track.id; this.applyData(); this.render();
  }

  handleChange(event) {
    const role = event.target.dataset.role;
    if (role === "seek") { this.experience.pauseTimeline(); this.experience.unlockAudio(); this.experience.seekTimeline(Number(event.target.value)); return; }
    if (role === "duration") { const old = this.data.duration; this.data.duration = Math.max(.1, Number(event.target.value) || old); if (Math.abs(this.rangeEnd - old) < .001) this.rangeEnd = this.data.duration; this.rangeEnd = clamp(this.rangeEnd, .05, this.data.duration); this.applyData(); this.render(); return; }
    if (role === "range-start") { this.rangeStart = clamp(Number(event.target.value) || 0, 0, this.rangeEnd - .05); return; } if (role === "range-end") { this.rangeEnd = clamp(Number(event.target.value) || this.data.duration, this.rangeStart + .05, this.data.duration); return; }
    const field = event.target.dataset.field; if (!field) return; const track = this.data.tracks.find((item) => item.id === this.selectedId); if (!track) return;
    if (field === "loop") track.loop = event.target.checked; else if (["start","end","duration","sourceIn","sourceOut","playbackRate","volume","restoreVolume","fadeIn","fadeOut"].includes(field)) track[field] = Number(event.target.value); else track[field] = event.target.value;
    if (field === "start") track.start = clamp(track.start, 0, track.end - .05); if (field === "end") track.end = clamp(track.end, track.start + .05, this.data.duration); if (field === "duration") { track.end = clamp(track.start + Math.max(.05, track.duration), track.start + .05, this.data.duration); delete track.duration; }
    if (field === "sourceIn") track.sourceIn = Math.max(0, track.sourceIn); if (field === "sourceOut") { track.sourceOut = Math.max((track.sourceIn || 0) + .01, track.sourceOut); track.end = Math.min(this.data.duration, track.start + (track.sourceOut - (track.sourceIn || 0)) / (track.playbackRate || 1)); }
    if (field === "playbackRate") track.playbackRate = clamp(track.playbackRate, .01, 8); if (field === "volume" || field === "restoreVolume") track[field] = clamp(track[field], 0, 1); if (field === "fadeIn" || field === "fadeOut") track[field] = clamp(track[field], 0, track.end - track.start);
    this.applyData(); this.render();
  }

  handlePointerDown(event) {
    const resize = event.target.dataset.resize; if (resize) { const rect = this.panel.getBoundingClientRect(); this.clearMaximizeState(); this.resizeDrag = { mode: resize, x: event.clientX, y: event.clientY, width: rect.width, height: rect.height }; event.preventDefault(); return; }
    if (event.target === this.panelDragHandle) { const rect = this.panel.getBoundingClientRect(); this.clearMaximizeState(); this.panelDrag = { x: event.clientX - rect.left, y: event.clientY - rect.top }; event.preventDefault(); return; }
    const ruler = event.target.closest('[data-role="ruler"]'); if (ruler) { this.experience.pauseTimeline(); this.experience.unlockAudio(); this.experience.seekTimeline(this.pointerTime(event, ruler)); this.drag = { mode: "scrub", stage: ruler }; event.preventDefault(); return; }
    const segment = event.target.closest("[data-segment-id]"); if (!segment || segment.disabled || event.button > 0) return; const track = this.data.tracks.find((item) => item.id === segment.dataset.segmentId); if (!track) return;
    const rect = segment.getBoundingClientRect(); const explicit = event.target.dataset.edge; const mode = explicit === "start" || event.clientX - rect.left < 9 ? "resize-start" : explicit === "end" || rect.right - event.clientX < 9 ? "resize-end" : "move";
    this.selectedId = track.id; this.drag = { mode, track, segment, x: event.clientX, start: track.start, end: track.end, sourceIn: track.sourceIn || 0, rate: track.playbackRate || 1, resourceDuration: Number(this.trackMetadata(track)?.duration) }; event.preventDefault();
  }

  handlePointerMove(event) {
    if (this.panelDrag) { this.panel.style.left = `${clamp(event.clientX - this.panelDrag.x, 0, innerWidth - 80)}px`; this.panel.style.top = `${clamp(event.clientY - this.panelDrag.y, 0, innerHeight - 40)}px`; event.preventDefault(); return; }
    if (this.resizeDrag) { const minW = Math.min(520, Math.max(160, innerWidth - 16)); const minH = Math.min(260, Math.max(120, innerHeight - 16)); const width = this.resizeDrag.mode === "bottom" ? this.resizeDrag.width : clamp(this.resizeDrag.width + event.clientX - this.resizeDrag.x, minW, Math.max(minW, innerWidth - this.panel.getBoundingClientRect().left - 8)); const height = this.resizeDrag.mode === "right" ? this.resizeDrag.height : clamp(this.resizeDrag.height + event.clientY - this.resizeDrag.y, minH, Math.max(minH, innerHeight - this.panel.getBoundingClientRect().top - 8)); this.panel.style.width = `${width}px`; this.panel.style.height = `${height}px`; event.preventDefault(); return; }
    if (!this.drag) return; if (this.drag.mode === "scrub") { this.experience.seekTimeline(this.pointerTime(event, this.drag.stage)); event.preventDefault(); return; }
    const delta = (event.clientX - this.drag.x) / (BASE_PPS * this.zoom); const length = this.drag.end - this.drag.start;
    if (this.drag.mode === "move") { this.drag.track.start = round(clamp(this.drag.start + delta, 0, this.data.duration - length)); this.drag.track.end = round(this.drag.track.start + length); }
    else if (this.drag.mode === "resize-start") { const media = this.drag.track.type === "audio" || this.drag.track.type === "glb"; const earliest = media ? Math.max(0, this.drag.start - this.drag.sourceIn / this.drag.rate) : 0; this.drag.track.start = round(clamp(this.drag.start + delta, earliest, this.drag.track.end - .05)); if (media) this.drag.track.sourceIn = round(this.drag.sourceIn + (this.drag.track.start - this.drag.start) * this.drag.rate); }
    else { this.drag.track.end = round(clamp(this.drag.end + delta, this.drag.track.start + .05, this.data.duration)); if (this.drag.track.type === "audio" || this.drag.track.type === "glb") { let out = (this.drag.track.sourceIn || 0) + (this.drag.track.end - this.drag.track.start) * this.drag.rate; if (Number.isFinite(this.drag.resourceDuration)) out = Math.min(out, this.drag.resourceDuration); this.drag.track.sourceOut = round(out); this.drag.track.end = round(Math.min(this.drag.track.end, this.drag.track.start + (out - (this.drag.track.sourceIn || 0)) / this.drag.rate)); } }
    this.drag.segment.style.left = `${this.drag.track.start * BASE_PPS * this.zoom}px`; this.drag.segment.style.width = `${Math.max(4, (this.drag.track.end - this.drag.track.start) * BASE_PPS * this.zoom)}px`; event.preventDefault();
  }

  handlePointerUp() { if (this.panelDrag || this.resizeDrag) { this.panelDrag = null; this.resizeDrag = null; this.saveUi(); return; } if (!this.drag) return; const scrub = this.drag.mode === "scrub"; this.drag = null; if (!scrub) { this.applyData(); this.render(); } }
  pointerTime(event, stage) { const rect = stage.getBoundingClientRect(); return round(clamp((event.clientX - rect.left) / (BASE_PPS * this.zoom), 0, this.data.duration)); }

  setZoom(value, clientX = null) { const oldPps = BASE_PPS * this.zoom; const rect = this.scroll.getBoundingClientRect(); const offset = clientX === null ? Math.max(0, rect.width - LABEL_WIDTH) * .5 : clamp(clientX - rect.left - LABEL_WIDTH, 0, rect.width - LABEL_WIDTH); const anchor = clientX === null ? this.experience.getTimelineSnapshot().elapsed : (this.scroll.scrollLeft + offset) / oldPps; this.zoom = clamp(value, MIN_ZOOM, MAX_ZOOM); this.render(); this.scroll.scrollLeft = Math.max(0, anchor * BASE_PPS * this.zoom - offset); this.saveUi(); }
  handleWheel(event) { if (!event.ctrlKey && !event.metaKey) return; event.preventDefault(); this.setZoom(this.zoom * Math.exp(-event.deltaY * .002), event.clientX); }
  clearMaximizeState() { this.restoreGeometry = null; this.maximizedWidth = false; this.maximizedHeight = false; }
  maximize(mode) {
    const rect = this.panel.getBoundingClientRect();
    if (!this.restoreGeometry) this.restoreGeometry = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    const restore = this.restoreGeometry;
    const toggleWidth = mode === "width" || mode === "full";
    const toggleHeight = mode === "height" || mode === "full";
    const restoreFull = mode === "full" && this.maximizedWidth && this.maximizedHeight;
    if (restoreFull) {
      this.panel.style.left = `${restore.left}px`; this.panel.style.top = `${restore.top}px`;
      this.panel.style.width = `${restore.width}px`; this.panel.style.height = `${restore.height}px`;
      this.clearMaximizeState(); this.saveUi(); return;
    }
    if (toggleWidth) {
      if (mode === "width" && this.maximizedWidth) { this.panel.style.left = `${restore.left}px`; this.panel.style.width = `${restore.width}px`; this.maximizedWidth = false; }
      else { this.panel.style.left = "8px"; this.panel.style.width = `${Math.max(160, innerWidth - 16)}px`; this.maximizedWidth = true; }
    }
    if (toggleHeight) {
      if (mode === "height" && this.maximizedHeight) { this.panel.style.top = `${restore.top}px`; this.panel.style.height = `${restore.height}px`; this.maximizedHeight = false; }
      else { this.panel.style.top = "8px"; this.panel.style.height = `${Math.max(120, innerHeight - 16)}px`; this.maximizedHeight = true; }
    }
    if (!this.maximizedWidth && !this.maximizedHeight) this.restoreGeometry = null;
    this.saveUi();
  }
  handleWindowResize() { const rect = this.panel.getBoundingClientRect(); const maxW = Math.max(160, innerWidth - 16); const maxH = Math.max(120, innerHeight - 16); const minW = Math.min(520, maxW); const minH = Math.min(260, maxH); const width = clamp(rect.width, minW, maxW); const height = clamp(rect.height, minH, maxH); this.panel.style.width = `${width}px`; this.panel.style.height = `${height}px`; this.panel.style.left = `${clamp(rect.left, 0, Math.max(0, innerWidth - 80))}px`; this.panel.style.top = `${clamp(rect.top, 0, Math.max(0, innerHeight - 40))}px`; if (this.maximizedWidth) { this.panel.style.left = "8px"; this.panel.style.width = `${maxW}px`; } if (this.maximizedHeight) { this.panel.style.top = "8px"; this.panel.style.height = `${maxH}px`; } this.saveUi(); }

  updatePlayheads() { const snap = this.experience.getTimelineSnapshot(); const left = snap.elapsed * BASE_PPS * this.zoom; this.grid.querySelectorAll(".lte-playhead").forEach((item) => { item.style.left = `${left}px`; }); this.timeLabel.textContent = `${snap.elapsed.toFixed(2)} / ${this.data.duration.toFixed(2)}s`; if (document.activeElement !== this.seekInput) { this.seekInput.value = snap.elapsed.toFixed(2); this.seekInput.max = this.data.duration; } }
  animate() { if (this.disposed) return; this.updatePlayheads(); this.frame = requestAnimationFrame(this.animate); }
  refreshMetadata() { const key = JSON.stringify(this.metadata()); if (key === this.metadataKey) return; this.metadataKey = key; this.render(); }
  download() { const blob = new Blob([JSON.stringify(this.data, null, 2)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "timeline.json"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 0); }
  import() { const text = prompt("粘贴 timeline.json 内容（支持 V2/V3）"); if (!text) return; try { this.data = normalizeTimelineData(JSON.parse(text)); this.selectedId = this.data.tracks[0]?.id || null; this.rangeStart = 0; this.rangeEnd = this.data.duration; this.applyData(false); this.render(); } catch (error) { alert(`Timeline JSON 无效：${error.message}`); } }
  reset() { if (!confirm("恢复源码 timeline.json？")) return; try { localStorage.removeItem(DATA_KEY); localStorage.removeItem(LEGACY_DATA_KEY); } catch (error) { /* optional */ } this.data = clone(this.defaultData); this.selectedId = this.data.tracks[0]?.id || null; this.rangeStart = 0; this.rangeEnd = this.data.duration; this.experience.clearPreviewFilter({ preserveMuted: false, preserveTime: false }); this.applyData(false); this.render(); }
  dispose() { if (this.disposed) return; this.disposed = true; cancelAnimationFrame(this.frame); clearInterval(this.metadataTimer); this.panel.removeEventListener("click", this.onClick); this.panel.removeEventListener("change", this.onChange); this.panel.removeEventListener("pointerdown", this.onPointerDown); this.scroll.removeEventListener("wheel", this.onWheel); window.removeEventListener("pointermove", this.onPointerMove); window.removeEventListener("pointerup", this.onPointerUp); window.removeEventListener("resize", this.onResize); this.panel.remove(); this.experience = null; }
}
