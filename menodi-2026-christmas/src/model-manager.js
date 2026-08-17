const asArray = (value) => (Array.isArray(value) ? value : [value]);

const disposeObject = (root) => {
  root?.traverse?.((object) => {
    object.geometry?.dispose?.();
    asArray(object.material || []).forEach((material) => {
      if (!material) return;
      Object.values(material).forEach((value) => value?.isTexture && value.dispose());
      material.dispose?.();
    });
  });
};

const normalizeModel = (model, targetWidthRatio, THREE) => {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z, 0.0001);
  model.position.sub(center);
  return targetWidthRatio / maxDimension;
};

const createModelManager = ({
  characters,
  three = null,
  loaderFactory = null,
  onError = (error) => console.error("[Santa GLB]", error),
} = {}) => {
  const records = new Map();
  const pendingPoses = new Map();
  let THREE = three;
  let createLoader = loaderFactory;
  let threePromise = null;
  let loaderPromise = null;
  let scene = null;
  let generation = 0;
  let lastFrameTime = null;

  const ensureThree = () => {
    if (THREE) {
      globalThis.THREE = THREE;
      return Promise.resolve();
    }
    if (!threePromise) {
      threePromise = import(/* webpackChunkName: "three-runtime" */ "three")
        .then((threeModule) => {
          THREE = threeModule;
          globalThis.THREE = THREE;
        });
    }
    return threePromise;
  };

  const ensureLoader = () => {
    if (createLoader) return ensureThree();
    if (!loaderPromise) {
      loaderPromise = ensureThree()
        .then(() => import(/* webpackChunkName: "glb-loader" */ "three/addons/loaders/GLTFLoader.js"))
        .then((loaderModule) => {
          createLoader = () => new loaderModule.GLTFLoader();
        });
    }
    return loaderPromise;
  };

  const attachScene = (nextScene) => {
    scene = nextScene;
    generation += 1;
    lastFrameTime = null;
  };

  const ensureLights = () => {
    if (!scene || scene.userData.santaJourneyLights) return;
    scene.add(new THREE.AmbientLight(0xffffff, 1.8));
    const mainLight = new THREE.DirectionalLight(0xffffff, 2.2);
    mainLight.position.set(2, 4, 3);
    scene.add(mainLight);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x35415b, 1.2));
    scene.userData.santaJourneyLights = true;
  };

  const createMixer = (gltf, config) => {
    if (!gltf.animations?.length || config.animation === false) return null;
    const mixer = new THREE.AnimationMixer(gltf.scene);
    const clips = typeof config.animation === "string"
      ? gltf.animations.filter((clip) => clip.name === config.animation)
      : gltf.animations;
    clips.forEach((clip) => mixer.clipAction(clip).play());
    return mixer;
  };

  const loadFor = (id) => {
    const character = characters?.[id];
    const config = character?.model;
    if (!config?.url) return Promise.resolve(null);
    if (records.has(id)) return records.get(id).promise;

    const loadGeneration = generation;
    const record = { root: null, mixer: null, promise: null, config };
    record.promise = ensureLoader()
      .then(() => new Promise((resolve, reject) => {
        createLoader().load(
          config.url,
          (gltf) => {
            if (!scene || generation !== loadGeneration) {
              disposeObject(gltf.scene);
              records.delete(id);
              resolve(null);
              return;
            }

            ensureLights();
            gltf.scene.traverse((object) => {
              if (!object.isMesh || !object.material) return;
              asArray(object.material).forEach((material) => {
                material.side = THREE.DoubleSide;
                material.needsUpdate = true;
              });
            });

            const normalizedScale = normalizeModel(gltf.scene, config.widthRatio ?? 1, THREE);
            const root = new THREE.Group();
            root.name = `santa-model-${id}`;
            root.visible = false;
            root.userData.normalizedScale = normalizedScale;
            root.add(gltf.scene);
            scene.add(root);

            record.root = root;
            record.mixer = createMixer(gltf, config);
            if (pendingPoses.has(id)) applyPose(id, pendingPoses.get(id));
            resolve(record);
          },
          undefined,
          reject,
        );
      }))
      .catch((error) => {
        records.delete(id);
        onError(error, id);
        throw error;
      });
    records.set(id, record);
    return record.promise;
  };

  function applyPose(id, detail) {
    pendingPoses.set(id, detail);
    const record = records.get(id);
    if (!record?.root || !detail?.position || !detail?.rotation) return;

    const { root, config } = record;
    root.visible = true;
    root.position.set(
      detail.position.x,
      detail.position.y,
      detail.position.z + (config.surfaceOffset ?? 0.002),
    );
    root.quaternion.set(
      detail.rotation.x,
      detail.rotation.y,
      detail.rotation.z,
      detail.rotation.w,
    );

    const scale = config.scaleMode === "target-relative"
      ? (detail.scale > 0 ? detail.scale : 1) * root.userData.normalizedScale
      : (config.fixedScale ?? root.userData.normalizedScale);
    root.scale.setScalar(scale);
  }

  const onFound = (id, detail) => {
    pendingPoses.set(id, detail);
    return loadFor(id)
      .then(() => applyPose(id, detail))
      .catch(() => null);
  };

  const onUpdated = (id, detail) => applyPose(id, detail);

  const onLost = (id) => {
    pendingPoses.delete(id);
    const record = records.get(id);
    if (record?.root) record.root.visible = false;
  };

  const update = () => {
    if (!records.size) return;
    const now = globalThis.performance?.now?.() ?? Date.now();
    const delta = lastFrameTime === null ? 0 : Math.min((now - lastFrameTime) / 1000, 0.1);
    lastFrameTime = now;
    records.forEach((record) => {
      if (record.root?.visible) record.mixer?.update(delta);
    });
  };

  const dispose = () => {
    generation += 1;
    pendingPoses.clear();
    records.forEach((record) => {
      record.mixer?.stopAllAction?.();
      if (record.root) {
        scene?.remove(record.root);
        disposeObject(record.root);
      }
    });
    records.clear();
    scene = null;
    lastFrameTime = null;
  };

  return {
    prepareThree: ensureThree,
    attachScene,
    loadFor,
    onFound,
    onUpdated,
    onLost,
    update,
    dispose,
    getLoadedCount: () => records.size,
  };
};

module.exports = { createModelManager, normalizeModel };
