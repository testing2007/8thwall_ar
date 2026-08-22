import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { GlbAnimationManager } from "./glb-animation-manager";

const disposeObject = (root) => {
  const textures = new Set();
  root?.traverse((object) => {
    if (!object.isMesh) return;
    object.geometry?.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      if (!material) return;
      Object.values(material).forEach((value) => {
        if (value?.isTexture) textures.add(value);
      });
      material.dispose();
    });
  });
  textures.forEach((texture) => texture.dispose());
};

const makeUnlit = (model) => {
  const converted = new Map();
  model.traverse((object) => {
    if (!object.isMesh) return;
    const source = Array.isArray(object.material) ? object.material : [object.material];
    const materials = source.map((material) => {
      if (converted.has(material)) return converted.get(material);
      const next = new THREE.MeshBasicMaterial({
        name: material?.name || "TimelineGlbMaterial",
        color: material?.color?.clone() || new THREE.Color(0xffffff),
        map: material?.map || null,
        opacity: material?.opacity ?? 1,
        transparent: material?.transparent || (material?.opacity ?? 1) < 1,
        alphaTest: material?.alphaTest || 0,
        side: material?.side ?? THREE.FrontSide,
        vertexColors: material?.vertexColors || false,
        toneMapped: false,
      });
      converted.set(material, next);
      material?.dispose();
      return next;
    });
    object.material = Array.isArray(object.material) ? materials : materials[0];
  });
};

/** Loads and controls generic target-root GLB resources authored in metres. */
export class GlbResourceManager {
  constructor(group) {
    this.group = group;
    this.loader = new GLTFLoader();
    this.resources = new Map();
    this.elapsed = 0;
    this.disposed = false;
  }

  registerResource(definition) {
    const id = String(definition?.id || "").trim();
    if (!id || this.disposed) return Promise.resolve(null);
    const current = this.resources.get(id);
    if (current?.src === definition.url) return current.promise;
    if (current) this.unregisterResource(id);
    const entry = {
      id,
      label: String(definition.label || id),
      src: String(definition.url || definition.src || ""),
      status: "loading",
      error: null,
      model: null,
      animation: null,
      desired: new Map(),
      active: new Set(),
      hideIn: null,
      promise: null,
    };
    entry.promise = new Promise((resolve) => {
      this.loader.load(
        entry.src,
        (gltf) => {
          if (this.disposed || this.resources.get(id) !== entry) {
            disposeObject(gltf.scene);
            resolve(null);
            return;
          }
          makeUnlit(gltf.scene);
          gltf.scene.name = `TimelineGlb:${id}`;
          gltf.scene.visible = false;
          entry.model = gltf.scene;
          entry.animation = new GlbAnimationManager(gltf.scene, gltf.animations);
          entry.status = "ready";
          this.group.add(gltf.scene);
          [...entry.desired.values()].forEach((command) => {
            const delay = Math.max(0, this.elapsed - command.issuedAt);
            this.startEntry(entry, command.clip, {
              ...command.options,
              startTime: (Number(command.options.startTime) || 0) +
                delay * (Number(command.options.timeScale) || 1),
            });
          });
          resolve(entry);
        },
        undefined,
        (error) => {
          if (this.resources.get(id) !== entry) return;
          entry.status = "error";
          entry.error = error?.message || String(error);
          console.warn(`[GLB Resource] Failed to load "${id}":`, error);
          resolve(entry);
        },
      );
    });
    this.resources.set(id, entry);
    return entry.promise;
  }

  unregisterResource(id) {
    const entry = this.resources.get(id);
    if (!entry) return false;
    entry.animation?.dispose();
    entry.model?.removeFromParent();
    disposeObject(entry.model);
    entry.desired.clear();
    entry.active.clear();
    this.resources.delete(id);
    return true;
  }

  startEntry(entry, clip, options = {}) {
    entry.hideIn = null;
    entry.model.visible = true;
    const trackId = options.trackId || clip || "default";
    entry.active.add(trackId);
    if (clip) entry.animation?.playAnimation(clip, options);
  }

  playAnimation(resourceId, clip, options = {}) {
    const entry = this.resources.get(resourceId);
    if (!entry) return null;
    const trackId = options.trackId || clip || "default";
    entry.desired.set(trackId, {
      clip,
      options,
      issuedAt: Number(options.issuedAt) || this.elapsed,
    });
    if (entry.status === "ready") this.startEntry(entry, clip, options);
    return entry.animation;
  }

  stopAnimation(resourceId, clip = null, options = {}) {
    const entry = this.resources.get(resourceId);
    if (!entry) return;
    const trackId = options.trackId || clip || "default";
    entry.desired.delete(trackId);
    entry.active.delete(trackId);
    entry.animation?.stopAnimation(clip, options);
    if (entry.active.size > 0) return;
    const fade = Math.max(0, Number(options.fadeDuration) || 0);
    if (fade > 0) entry.hideIn = fade;
    else if (entry.model) entry.model.visible = false;
  }

  get metadata() {
    return [...this.resources.values()].map((entry) => ({
      id: entry.id,
      name: entry.id,
      label: entry.label,
      type: "glb",
      src: entry.src,
      status: entry.status,
      error: entry.error,
      animations: entry.animation?.animationMetadata || [],
    }));
  }

  update(deltaSeconds, elapsed) {
    this.elapsed = Math.max(0, Number(elapsed) || 0);
    this.resources.forEach((entry) => {
      entry.animation?.update(deltaSeconds);
      if (entry.hideIn === null) return;
      entry.hideIn -= deltaSeconds;
      if (entry.hideIn > 0) return;
      entry.hideIn = null;
      if (entry.active.size === 0 && entry.model) entry.model.visible = false;
    });
  }

  reset() {
    this.resources.forEach((entry) => {
      entry.animation?.reset();
      entry.desired.clear();
      entry.active.clear();
      entry.hideIn = null;
      if (entry.model) entry.model.visible = false;
    });
  }

  dispose() {
    if (this.disposed) return;
    [...this.resources.keys()].forEach((id) => this.unregisterResource(id));
    this.group = null;
    this.loader = null;
    this.disposed = true;
  }
}
