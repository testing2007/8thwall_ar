const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const { CHARACTER_IDS, CHARACTERS, TARGET_TO_CHARACTER } = require("../src/characters");
const { IMAGE_TARGET_DATA } = require("../src/ar-controller");

const root = path.resolve(__dirname, "..");

test("all configured target packages and recognition images exist", () => {
  CHARACTER_IDS.forEach((id) => {
    const targetName = CHARACTERS[id].targetName;
    const jsonPath = path.join(root, "image-targets", `${targetName}.json`);
    assert.equal(fs.existsSync(jsonPath), true, jsonPath);
    ["cropped", "luminance", "original", "thumbnail"].forEach((variant) => {
      const candidates = ["png", "jpg"].map((extension) =>
        path.join(root, "image-targets", `${targetName}_${variant}.${extension}`));
      assert.equal(candidates.some((imagePath) => fs.existsSync(imagePath)), true, candidates.join(" or "));
    });
    assert.equal(JSON.parse(fs.readFileSync(jsonPath, "utf8")).name, targetName);
    assert.equal(TARGET_TO_CHARACTER[targetName], id);
  });
});

test("all three targets are registered in one controller configuration", () => {
  assert.deepEqual(IMAGE_TARGET_DATA.map((target) => target.name), [
    "young-santa",
    "adult-santa",
    "grandpa-santa",
  ]);
});

test("production source has no retired or unsupported runtime references", () => {
  const files = [
    "src/index.html",
    "src/app.js",
    "src/ar-controller.js",
    "src/characters.js",
    "src/model-manager.js",
    "config/webpack.config.js",
  ];
  const source = files.map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n");
  ["football", "a-frame", "aframe", "8frame", ".expanse", "ecs"].forEach((term) => {
    assert.equal(source.toLowerCase().includes(term), false, `found ${term}`);
  });
  assert.equal(source.includes(".glb"), false);
});
