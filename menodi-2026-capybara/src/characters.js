const menoTarget = require("../image-targets/meno.json");
const pokoTarget = require("../image-targets/poko.json");
const boboTarget = require("../image-targets/bobo.json");
const rikoTarget = require("../image-targets/riko.json");

const createCharacter = (id, target, assets) =>
  Object.freeze({
    id,
    target,
    targetName: target.name,
    modelTargetWidthRatio: 1,
    modelSurfaceOffsetMeters: 0.002,
    ...assets,
  });

// Only add a character after its image target, GLB, MP3, and SRT all exist.
// Static require() calls let webpack validate and copy every configured asset.
export const CHARACTERS = Object.freeze({
  meno: createCharacter("meno", menoTarget, {
    model: require("./assets/meno.glb"),
    audio: require("./assets/meno-voice.mp3"),
    subtitle: require("./assets/meno-voice.srt"),
  }),

  poko: createCharacter("poko", pokoTarget, {
    model: require("./assets/poko.glb"),
    audio: require("./assets/poko-voice.mp3"),
    subtitle: require("./assets/poko-voice.srt"),
  }),

  bobo: createCharacter("bobo", boboTarget, {
    model: require("./assets/bobo.glb"),
    audio: require("./assets/bobo-voice.mp3"),
    subtitle: require("./assets/bobo-voice.srt"),
  }),

  riko: createCharacter("riko", rikoTarget, {
    model: require("./assets/riko.glb"),
    audio: require("./assets/riko-voice.mp3"),
    subtitle: require("./assets/riko-voice.srt"),
  }),
  // Add bobo and riko here after their four files are ready. See README.md.
});

export const CHARACTER_LIST = Object.freeze(Object.values(CHARACTERS));

export const CHARACTERS_BY_TARGET_NAME = new Map(
  CHARACTER_LIST.map((character) => [character.targetName, character]),
);

if (CHARACTERS_BY_TARGET_NAME.size !== CHARACTER_LIST.length) {
  throw new Error("Every configured image target must have a unique name.");
}
