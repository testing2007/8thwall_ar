import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

window.THREE = THREE;

const IMAGE_TARGET_DATA = require("../image-targets/target.json");
const MODEL_URL = require("./assets/christmas.glb");
const TARGET_NAME = "target";
const MODEL_TARGET_WIDTH_RATIO = 0.7;

let modelRoot = null;
let mixer = null;
let normalizedModelScale = 1;
let xrStarted = false;
const clock = new THREE.Clock();

const getCameraCanvas = () => {
  let canvas = document.getElementById("camerafeed");
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.id = "camerafeed";
    document.body.appendChild(canvas);
  }
  return canvas;
};

const optionalPipelineModule = factory =>
  factory?.pipelineModule ? [factory.pipelineModule()] : [];

const normalizeModelSize = (model) => {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z, 0.0001);

  model.position.sub(center);
  normalizedModelScale = MODEL_TARGET_WIDTH_RATIO / maxDimension;
};

const prepareModel = (model) => {
  model.name = "christmas";
  model.visible = false;
  model.traverse((object) => {
    if (!object.isMesh || !object.material) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      material.side = THREE.DoubleSide;
      material.needsUpdate = true;
    });
  });
  normalizeModelSize(model);
};

const applyImageTargetPose = ({ detail }) => {
  if (!modelRoot || detail.name !== TARGET_NAME) return;

  const { position, rotation, scale = 1 } = detail;
  modelRoot.visible = true;
  modelRoot.position.set(position.x, position.y, position.z + 0.002);
  modelRoot.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
  modelRoot.scale.setScalar((scale > 0 ? scale : 1) * normalizedModelScale);
};

const hideImageTargetModel = ({ detail }) => {
  if (!modelRoot || detail.name !== TARGET_NAME) return;
  modelRoot.visible = false;
};

const engineImageTargetPipelineModule = () => ({
  name: "engine-image-target-template",

  listeners: [
    { event: "reality.imagefound", process: applyImageTargetPose },
    { event: "reality.imageupdated", process: applyImageTargetPose },
    { event: "reality.imagelost", process: hideImageTargetModel },
  ],

  onStart: () => {
    const { scene } = XR8.Threejs.xrScene();

    scene.add(new THREE.AmbientLight(0xffffff, 1.8));

    const mainLight = new THREE.DirectionalLight(0xffffff, 2.2);
    mainLight.position.set(2, 4, 3);
    scene.add(mainLight);

    const fillLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
    scene.add(fillLight);

    new GLTFLoader().load(
      MODEL_URL,
      (gltf) => {
        prepareModel(gltf.scene);

        if (gltf.animations.length) {
          mixer = new THREE.AnimationMixer(gltf.scene);
          gltf.animations.forEach((clip) => {
            const action = mixer.clipAction(clip);
            action.play();
          });
        }

        scene.add(gltf.scene);
        modelRoot = gltf.scene;
      },
      undefined,
      (error) => {
        console.error("[Image Target AR] Failed to load GLB model:", error);
      },
    );
  },

  onUpdate: () => {
    if (!mixer || !modelRoot?.visible) return;
    mixer.update(Math.min(clock.getDelta(), 0.1));
  },
});

const ensureXrController = () => {
  if (window.XR8?.XrController) return Promise.resolve();
  if (window.XR8?.loadChunk) return window.XR8.loadChunk("slam");
  return Promise.reject(new Error("XR8.XrController is not available."));
};

const startEngine = () => {
  if (xrStarted) return;
  xrStarted = true;

  ensureXrController()
    .then(() => {
      XR8.XrController.configure({
        imageTargetData: [IMAGE_TARGET_DATA],
        disableWorldTracking: true,
      });

      XR8.addCameraPipelineModules([
        XR8.GlTextureRenderer.pipelineModule(),
        XR8.Threejs.pipelineModule(),
        XR8.XrController.pipelineModule(),
        ...optionalPipelineModule(window.LandingPage),
        ...optionalPipelineModule(window.XRExtras?.FullWindowCanvas),
        ...optionalPipelineModule(window.XRExtras?.Loading),
        ...optionalPipelineModule(window.XRExtras?.RuntimeError),
        engineImageTargetPipelineModule(),
      ]);

      XR8.run({
        canvas: getCameraCanvas(),
        allowedDevices: XR8.XrConfig.device().ANY,
      });
    })
    .catch((error) => {
      xrStarted = false;
      console.error("[Image Target AR] Failed to start 8th Wall Engine:", error);
    });
};

if (window.XR8) {
  startEngine();
} else {
  window.addEventListener("xrloaded", startEngine, { once: true });
}
