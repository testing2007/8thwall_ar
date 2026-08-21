import * as THREE from "three";
import targetImageUrl from "../assets/target.jpg";
import { CONFIG } from "../config";
import { LifeTreeAr } from "../life-tree-ar";

export class StandaloneCalibrationPreview {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x090b10);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 4);
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setPixelRatio(
      Math.min(globalThis.devicePixelRatio || 1, CONFIG.performance.pixelRatioCap),
    );

    this.targetGeometry = new THREE.PlaneGeometry(CONFIG.puzzle.width, CONFIG.puzzle.height);
    this.targetTexture = new THREE.TextureLoader().load(targetImageUrl);
    this.targetTexture.colorSpace = THREE.SRGBColorSpace;
    this.targetTexture.minFilter = THREE.LinearMipmapLinearFilter;
    this.targetMaterial = new THREE.MeshBasicMaterial({
      map: this.targetTexture,
      toneMapped: false,
    });
    this.targetMesh = new THREE.Mesh(this.targetGeometry, this.targetMaterial);
    this.targetMesh.name = "StandaloneCalibrationArtwork";
    this.targetMesh.position.z = -0.006;
    this.targetMesh.renderOrder = 0;
    this.scene.add(this.targetMesh);

    this.experience = new LifeTreeAr(this.scene, this.camera, canvas, {
      standaloneDebug: true,
    });
    this.clock = new THREE.Clock();
    this.disposed = false;
    this.onResize = this.resize.bind(this);
    window.addEventListener("resize", this.onResize, { passive: true });
    this.resize();
    this.animate = this.animate.bind(this);
    this.frame = requestAnimationFrame(this.animate);
  }

  resize() {
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    this.renderer.setSize(width, height, false);
    const aspect = width / height;
    const targetAspect = CONFIG.puzzle.width / CONFIG.puzzle.height;
    const padding = CONFIG.calibration.standalonePadding;
    let viewWidth;
    let viewHeight;
    if (aspect >= targetAspect) {
      viewHeight = CONFIG.puzzle.height * padding;
      viewWidth = viewHeight * aspect;
    } else {
      viewWidth = CONFIG.puzzle.width * padding;
      viewHeight = viewWidth / aspect;
    }
    this.camera.left = -viewWidth * 0.5;
    this.camera.right = viewWidth * 0.5;
    this.camera.top = viewHeight * 0.5;
    this.camera.bottom = -viewHeight * 0.5;
    const verticalShift = -viewHeight * 0.1;
    this.camera.position.set(0, verticalShift, 1);
    this.camera.lookAt(0, verticalShift, 0);
    this.camera.updateProjectionMatrix();
  }

  animate() {
    if (this.disposed) return;
    const delta = Math.min(this.clock.getDelta(), CONFIG.performance.maxDeltaSeconds);
    this.experience.update(delta);
    this.renderer.render(this.scene, this.camera);
    this.frame = requestAnimationFrame(this.animate);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    window.removeEventListener("resize", this.onResize);
    this.experience.dispose();
    this.targetMesh.removeFromParent();
    this.targetGeometry.dispose();
    this.targetMaterial.dispose();
    this.targetTexture.dispose();
    this.renderer.dispose();
    this.scene = null;
    this.camera = null;
    this.canvas = null;
  }
}
