const ecs = require("@8thwall/ecs");
const musicSrc = require("./assets/play-time-fun-upbeat-gaming-birthday-music-259703.mp3");

const targetName = "trigger-label";
const sheepAnimationClip = "mouse.003动作";
const AudioContextClass = window.AudioContext || window.webkitAudioContext;

let audioContext;
let musicBufferPromise;
let musicBuffer;
let musicSource;
let musicGain;
let targetVisible = false;
let sheepModelEid;

const decodeAudioData = (context, arrayBuffer) =>
  new Promise((resolve, reject) => {
    const promise = context.decodeAudioData(arrayBuffer, resolve, reject);
    if (promise && promise.then) {
      promise.then(resolve).catch(reject);
    }
  });

const getAudioContext = () => {
  if (!AudioContextClass) {
    return null;
  }

  if (!audioContext) {
    audioContext = new AudioContextClass();
  }

  return audioContext;
};

const loadMusicBuffer = () => {
  const context = getAudioContext();
  if (!context) {
    return Promise.reject(new Error("Web Audio is not supported."));
  }

  if (musicBuffer) {
    return Promise.resolve(musicBuffer);
  }

  if (!musicBufferPromise) {
    musicBufferPromise = fetch(musicSrc)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Music request failed: ${response.status}`);
        }
        return response.arrayBuffer();
      })
      .then((arrayBuffer) => decodeAudioData(context, arrayBuffer))
      .then((decodedBuffer) => {
        musicBuffer = decodedBuffer;
        return decodedBuffer;
      });
  }

  return musicBufferPromise;
};

const unlockAudio = () => {
  const context = getAudioContext();
  if (!context) {
    return;
  }

  // Resume the audio graph inside the user's tap, but do not play the mp3 here.
  if (context.state !== "running") {
    context.resume().catch((error) => {
      console.warn("Audio context unlock failed:", error);
    });
  }

  loadMusicBuffer().catch((error) => {
    console.warn("Music preload failed:", error);
  });
};

["pointerdown", "touchend", "click"].forEach((eventName) => {
  window.addEventListener(eventName, unlockAudio, {
    once: true,
    passive: true,
    capture: true,
  });
});

const stopMusic = () => {
  if (!musicSource) {
    return;
  }

  try {
    musicSource.stop();
  } catch (error) {
    // Source may already have ended or been stopped by the browser.
  }

  musicSource.disconnect();
  musicSource = null;

  if (musicGain) {
    musicGain.disconnect();
    musicGain = null;
  }
};

const startMusicFromBuffer = (buffer) => {
  const context = getAudioContext();
  if (!context || !targetVisible || musicSource) {
    return;
  }

  if (context.state !== "running") {
    context.resume().catch((error) => {
      console.warn("Audio context resume failed:", error);
    });
  }

  musicGain = context.createGain();
  musicGain.gain.value = 1;
  musicGain.connect(context.destination);

  musicSource = context.createBufferSource();
  musicSource.buffer = buffer;
  musicSource.loop = true;
  musicSource.connect(musicGain);
  musicSource.start(0);
};

const playMusic = () => {
  targetVisible = true;

  loadMusicBuffer()
    .then(startMusicFromBuffer)
    .catch((error) => {
      console.warn("Music playback failed:", error);
    });
};

const pauseMusic = () => {
  targetVisible = false;
  stopMusic();
};

const findGltfModelChild = (world, eid) => {
  if (ecs.GltfModel.has(world, eid)) {
    return eid;
  }

  for (const childEid of world.transform.getChildren(eid)) {
    const found = findGltfModelChild(world, childEid);
    if (found) {
      return found;
    }
  }

  return null;
};

const getSheepModelEid = (world, targetEid) => {
  if (sheepModelEid && ecs.GltfModel.has(world, sheepModelEid)) {
    return sheepModelEid;
  }

  sheepModelEid = findGltfModelChild(world, targetEid);
  return sheepModelEid;
};

const playSheepAnimation = (world, targetEid) => {
  const modelEid = getSheepModelEid(world, targetEid);
  if (!modelEid) {
    return;
  }

  ecs.GltfModel.mutate(world, modelEid, (model) => {
    model.animationClip = sheepAnimationClip;
    model.loop = true;
    model.paused = false;
    model.time = 0;
  });
};

const pauseSheepAnimation = (world, targetEid) => {
  const modelEid = getSheepModelEid(world, targetEid);
  if (!modelEid) {
    return;
  }

  ecs.GltfModel.mutate(world, modelEid, (model) => {
    model.animationClip = sheepAnimationClip;
    model.paused = true;
    model.time = 0;
  });
};

const isTargetEvent = (event) => {
  const data = event && event.data ? event.data : {};
  const eventTargetName = data.name || data.imageTargetName || data.targetName;
  return !eventTargetName || eventTargetName === targetName;
};

ecs.registerComponent({
  name: "play-music-on-image-target",
  add: (world, component) => {
    const onFound = (event) => {
      if (!isTargetEvent(event) || targetVisible) {
        return;
      }

      playMusic();
      // playSheepAnimation(world, component.eid);
    };

    const onLost = (event) => {
      if (!isTargetEvent(event) || !targetVisible) {
        return;
      }

      pauseMusic();
      // pauseSheepAnimation(world, component.eid);
    };

    world.events.addListener(
      component.eid,
      ecs.events.REALITY_IMAGE_FOUND,
      onFound,
    );
    world.events.addListener(
      component.eid,
      ecs.events.REALITY_IMAGE_LOST,
      onLost,
    );
    world.events.addListener(
      world.events.globalId,
      ecs.events.REALITY_IMAGE_FOUND,
      onFound,
    );
    world.events.addListener(
      world.events.globalId,
      ecs.events.REALITY_IMAGE_LOST,
      onLost,
    );
  },
});

const onxrloaded = () => {
  XR8.XrController.configure({
    imageTargetData: [require("../image-targets/trigger-label.json")],
  });
  XR8.addCameraPipelineModule(LandingPage.pipelineModule());
};

window.XR8 ? onxrloaded() : window.addEventListener("xrloaded", onxrloaded);
