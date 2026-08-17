const test = require("node:test");
const assert = require("node:assert/strict");
const THREE = require("three");

const { createModelManager } = require("../src/model-manager");

test("model null exits without constructing or calling a loader", async () => {
  let loaderConstructed = 0;
  const manager = createModelManager({
    characters: { young: { model: null } },
    three: THREE,
    loaderFactory: () => {
      loaderConstructed += 1;
      return { load() {} };
    },
  });
  manager.attachScene(new THREE.Scene());
  await manager.prepareThree();
  assert.equal(await manager.loadFor("young"), null);
  assert.equal(loaderConstructed, 0);
  assert.equal(manager.getLoadedCount(), 0);
});

test("a configured model loads once and is reused after repeat recognition", async () => {
  let requests = 0;
  const manager = createModelManager({
    characters: {
      young: {
        model: { url: "test-model", widthRatio: 0.8, surfaceOffset: 0.01, animation: true },
      },
    },
    three: THREE,
    loaderFactory: () => ({
      load(_url, onLoad) {
        requests += 1;
        const model = new THREE.Mesh(
          new THREE.BoxGeometry(1, 2, 1),
          new THREE.MeshBasicMaterial(),
        );
        onLoad({ scene: model, animations: [] });
      },
    }),
  });
  manager.attachScene(new THREE.Scene());
  const pose = {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    scale: 1,
  };
  await manager.onFound("young", pose);
  await manager.onFound("young", pose);
  assert.equal(requests, 1);
  assert.equal(manager.getLoadedCount(), 1);
  manager.dispose();
});
