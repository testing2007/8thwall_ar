const test = require("node:test");
const assert = require("node:assert/strict");

const {
  COLLECTION_KEY,
  createDefaultCollection,
  normalizeCollection,
  readCollection,
  unlockCharacter,
  completeCharacter,
} = require("../src/collection-store");

test("creates a locked version-one collection", () => {
  assert.deepEqual(createDefaultCollection(), {
    version: 1,
    owned: { young: false, adult: false, grandpa: false },
    completed: { young: false, adult: false, grandpa: false },
  });
});

test("migrates the legacy boolean map", () => {
  assert.deepEqual(normalizeCollection({ young: true, adult: false, grandpa: true }), {
    version: 1,
    owned: { young: true, adult: false, grandpa: true },
    completed: { young: false, adult: false, grandpa: false },
  });
});

test("recovers from corrupt storage", () => {
  const storage = { getItem: (key) => key === COLLECTION_KEY ? "{broken" : null };
  assert.deepEqual(readCollection(storage), createDefaultCollection());
});

test("unlock is idempotent and completion requires ownership", () => {
  const empty = createDefaultCollection();
  assert.equal(completeCharacter(empty, "young").completed.young, false);

  const first = unlockCharacter(empty, "young");
  const second = unlockCharacter(first, "young");
  assert.deepEqual(second, first);
  assert.equal(completeCharacter(second, "young").completed.young, true);
});

