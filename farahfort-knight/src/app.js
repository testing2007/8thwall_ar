const onxrloaded = () => {
  XR8.XrController.configure({
    imageTargetData: [require("../image-targets/trigger-label.json")],
  });
};

window.XR8 ? onxrloaded() : window.addEventListener("xrloaded", onxrloaded);

const PLAY_ICON_SRC = "assets/play.png";

const ensurePlayButton = () => {
  let button = document.getElementById("ar-play-video-button");
  if (button) {
    return button;
  }

  button = document.createElement("button");
  button.id = "ar-play-video-button";
  button.type = "button";
  button.hidden = true;
  button.setAttribute("aria-label", "Play video");

  const icon = document.createElement("img");
  icon.src = PLAY_ICON_SRC;
  icon.alt = "";
  icon.decoding = "async";
  button.appendChild(icon);

  document.body.appendChild(button);
  return button;
};

const setVideoInline = (video) => {
  if (!video) {
    return;
  }

  video.playsInline = true;
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
};

const safeSeek = (video, time) => {
  try {
    video.currentTime = time;
  } catch (error) {
    console.warn("Video seek failed:", error);
  }
};

const parseHexColor = (hex) => {
  const value = hex.replace("#", "");
  const number = parseInt(
    value.length === 3
      ? value
          .split("")
          .map((part) => part + part)
          .join("")
      : value,
    16,
  );

  return {
    r: ((number >> 16) & 255) / 255,
    g: ((number >> 8) & 255) / 255,
    b: (number & 255) / 255,
  };
};

const registerTapToPlayVideoWithSound = () => {
  if (!window.AFRAME || AFRAME.components["tap-to-play-video-with-sound"]) {
    return;
  }

  AFRAME.registerComponent("tap-to-play-video-with-sound", {
    schema: {
      video: { type: "selector" },
      poster: { type: "selector" },
      keyColor: { type: "color", default: "#37723e" },
      similarity: { type: "number", default: 0.06 },
      smoothness: { type: "number", default: 0.02 },
      spill: { type: "number", default: 0.18 },
      width: { type: "number", default: 0 },
      height: { type: "number", default: 0 },
    },

    init() {
      this.video = this.data.video;
      this.poster = this.data.poster;
      this.mesh = null;
      this.videoTexture = null;
      this.posterTexture = null;
      this.videoMaterial = null;
      this.posterMaterial = null;
      this.isTargetVisible = false;
      this.isPlaying = false;
      this.button = ensurePlayButton();

      this.onImageGeometry = this.onImageGeometry.bind(this);
      this.onFound = this.onFound.bind(this);
      this.onLost = this.onLost.bind(this);
      this.onPlayTap = this.onPlayTap.bind(this);
      this.showVideoMesh = this.showVideoMesh.bind(this);

      setVideoInline(this.video);
      this.el.object3D.visible = false;

      this.targetEl = this.el.parentNode;
      this.targetEl.addEventListener(
        "xrextrasimagegeometry",
        this.onImageGeometry,
      );
      this.targetEl.addEventListener("xrextrasfound", this.onFound);
      this.targetEl.addEventListener("xrextraslost", this.onLost);
      this.button.addEventListener("click", this.onPlayTap);
      this.button.addEventListener("touchend", this.onPlayTap);
    },

    onImageGeometry(event) {
      const THREE = AFRAME.THREE;
      const geometry = XRExtras.ThreeExtras.createTargetGeometry(
        event.detail,
        false,
        this.data.height || undefined,
        this.data.width || undefined,
      );

      this.ensureMaterials();

      if (this.mesh) {
        this.el.removeObject3D("mesh");
        this.mesh.geometry.dispose();
      }

      this.mesh = new THREE.Mesh(
        geometry,
        this.posterMaterial || this.videoMaterial,
      );
      this.mesh.visible = false;
      this.el.setObject3D("mesh", this.mesh);
    },

    ensureMaterials() {
      this.ensurePosterMaterial();
      this.ensureVideoMaterial();
    },

    ensurePosterMaterial() {
      if (this.posterMaterial || !this.poster) {
        return;
      }

      const THREE = AFRAME.THREE;
      this.posterTexture = new THREE.Texture(this.poster);
      this.posterTexture.minFilter = THREE.LinearFilter;
      this.posterTexture.magFilter = THREE.LinearFilter;
      this.posterTexture.generateMipmaps = false;

      if ("colorSpace" in this.posterTexture && THREE.SRGBColorSpace) {
        this.posterTexture.colorSpace = THREE.SRGBColorSpace;
      } else if ("encoding" in this.posterTexture && THREE.sRGBEncoding) {
        this.posterTexture.encoding = THREE.sRGBEncoding;
      }

      const updatePoster = () => {
        this.posterTexture.needsUpdate = true;
      };

      if (this.poster.complete) {
        updatePoster();
      } else {
        this.poster.addEventListener("load", updatePoster, { once: true });
      }

      this.posterMaterial = new THREE.MeshBasicMaterial({
        map: this.posterTexture,
        side: THREE.DoubleSide,
        transparent: true,
        toneMapped: false,
      });
    },

    ensureVideoMaterial() {
      if (this.videoMaterial || !this.video) {
        return;
      }

      const THREE = AFRAME.THREE;
      const keyColor = parseHexColor(this.data.keyColor);

      this.videoTexture = new THREE.VideoTexture(this.video);
      this.videoTexture.minFilter = THREE.LinearFilter;
      this.videoTexture.magFilter = THREE.LinearFilter;
      this.videoTexture.generateMipmaps = false;

      if ("colorSpace" in this.videoTexture && THREE.SRGBColorSpace) {
        this.videoTexture.colorSpace = THREE.SRGBColorSpace;
      } else if ("encoding" in this.videoTexture && THREE.sRGBEncoding) {
        this.videoTexture.encoding = THREE.sRGBEncoding;
      }

      this.videoMaterial = new THREE.ShaderMaterial({
        uniforms: {
          map: { value: this.videoTexture },
          keyColor: {
            value: new THREE.Vector3(keyColor.r, keyColor.g, keyColor.b),
          },
          similarity: { value: this.data.similarity },
          smoothness: { value: this.data.smoothness },
          spill: { value: this.data.spill },
        },
        vertexShader: `
          varying vec2 vUv;

          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          precision mediump float;

          uniform sampler2D map;
          uniform vec3 keyColor;
          uniform float similarity;
          uniform float smoothness;
          uniform float spill;

          varying vec2 vUv;

          vec3 rgbToYCrCb(vec3 color) {
            float y = dot(color, vec3(0.2989, 0.5866, 0.1145));
            float cr = color.r - y;
            float cb = color.b - y;
            return vec3(y, cr, cb);
          }

          void main() {
            vec4 texel = texture2D(map, vUv);
            vec3 source = rgbToYCrCb(texel.rgb);
            vec3 key = rgbToYCrCb(keyColor);
            float chromaDist = distance(source.yz, key.yz);
            float alpha = smoothstep(similarity, similarity + smoothness, chromaDist);

            vec3 color = texel.rgb;
            float greenSpill = smoothstep(similarity + spill, similarity, chromaDist);
            color.g = mix(color.g, min(color.g, max(color.r, color.b)), greenSpill * 0.5);

            if (alpha < 0.02) {
              discard;
            }

            gl_FragColor = vec4(color, texel.a * alpha);
          }
        `,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      });
    },

    onFound() {
      this.isTargetVisible = true;
      this.isPlaying = false;
      safeSeek(this.video, 0);
      this.showPosterMesh();
      this.setButtonLoading(false);
      this.button.hidden = false;
    },

    onLost() {
      this.isTargetVisible = false;
      this.isPlaying = false;
      this.button.hidden = true;
      this.setButtonLoading(false);
      this.hideMesh();

      if (this.video) {
        this.video.pause();
        safeSeek(this.video, 0);
      }
    },

    onPlayTap(event) {
      if (!this.isTargetVisible || this.button.hidden || !this.video) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      this.setButtonLoading(true);
      setVideoInline(this.video);
      this.video.muted = false;
      this.video.defaultMuted = false;
      this.video.removeAttribute("muted");
      this.video.volume = 1;
      safeSeek(this.video, 0);

      const playPromise = this.video.play();
      if (playPromise && playPromise.then) {
        playPromise
          .then(() => this.showWhenFrameReady())
          .catch((error) => {
            console.warn(
              "Video with sound play failed, falling back to muted:",
              error,
            );
            this.video.muted = true;
            this.video
              .play()
              .then(() => this.showWhenFrameReady())
              .catch(() => {
                this.setButtonLoading(false);
              });
          });
        return;
      }

      this.showWhenFrameReady();
    },

    showWhenFrameReady() {
      if (!this.video) {
        return;
      }

      if (this.video.requestVideoFrameCallback) {
        this.video.requestVideoFrameCallback(this.showVideoMesh);
        return;
      }

      if (this.video.readyState >= this.video.HAVE_CURRENT_DATA) {
        requestAnimationFrame(this.showVideoMesh);
        return;
      }

      this.video.addEventListener("loadeddata", this.showVideoMesh, {
        once: true,
      });
    },

    showPosterMesh() {
      if (!this.mesh || !this.posterMaterial) {
        return;
      }

      this.mesh.material = this.posterMaterial;
      this.mesh.visible = true;
      this.el.object3D.visible = true;
    },

    showVideoMesh() {
      if (!this.isTargetVisible || !this.mesh || !this.videoMaterial) {
        return;
      }

      this.isPlaying = true;
      this.setButtonLoading(false);
      this.button.hidden = true;
      this.videoTexture.needsUpdate = true;
      this.mesh.material = this.videoMaterial;
      this.mesh.visible = true;
      this.el.object3D.visible = true;
    },

    hideMesh() {
      if (this.mesh) {
        this.mesh.visible = false;
      }
      this.el.object3D.visible = false;
    },

    setButtonLoading(isLoading) {
      this.button.classList.toggle("is-loading", isLoading);
      this.button.disabled = isLoading;
    },

    tick() {
      if (
        !this.videoTexture ||
        !this.video ||
        this.video.paused ||
        !this.isPlaying
      ) {
        return;
      }

      if (this.video.readyState >= this.video.HAVE_CURRENT_DATA) {
        this.videoTexture.needsUpdate = true;
      }
    },

    remove() {
      this.targetEl.removeEventListener(
        "xrextrasimagegeometry",
        this.onImageGeometry,
      );
      this.targetEl.removeEventListener("xrextrasfound", this.onFound);
      this.targetEl.removeEventListener("xrextraslost", this.onLost);
      this.button.removeEventListener("click", this.onPlayTap);
      this.button.removeEventListener("touchend", this.onPlayTap);

      if (this.videoTexture) {
        this.videoTexture.dispose();
      }
      if (this.posterTexture) {
        this.posterTexture.dispose();
      }
      if (this.videoMaterial) {
        this.videoMaterial.dispose();
      }
      if (this.posterMaterial) {
        this.posterMaterial.dispose();
      }
      if (this.mesh && this.mesh.geometry) {
        this.mesh.geometry.dispose();
      }
    },
  });
};

registerTapToPlayVideoWithSound();
