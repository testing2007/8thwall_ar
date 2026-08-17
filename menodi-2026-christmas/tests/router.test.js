const test = require("node:test");
const assert = require("node:assert/strict");

const { parseRoute, canAccessStory } = require("../src/router");

test("parses every supported hash route", () => {
  assert.deepEqual(parseRoute("#/"), { name: "home" });
  assert.deepEqual(parseRoute("#/scan"), { name: "scan" });
  assert.deepEqual(parseRoute("#/collection"), { name: "collection" });
  assert.deepEqual(parseRoute("#/story/adult"), { name: "story", id: "adult" });
  assert.deepEqual(parseRoute("#/story/missing"), { name: "not-found" });
});

test("story access is based on owned, not completed", () => {
  const state = {
    owned: { young: true, adult: false, grandpa: false },
    completed: { young: false, adult: true, grandpa: false },
  };
  assert.equal(canAccessStory(state, "young"), true);
  assert.equal(canAccessStory(state, "adult"), false);
});

