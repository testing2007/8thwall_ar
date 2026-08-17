const { isCharacterId } = require("./characters");

const parseRoute = (hash = "") => {
  const path = hash.replace(/^#/, "") || "/";
  const segments = path.split("/").filter(Boolean);

  if (segments.length === 0) return { name: "home" };
  if (segments[0] === "scan" && segments.length === 1) return { name: "scan" };
  if (segments[0] === "collection" && segments.length === 1) {
    return { name: "collection" };
  }
  if (segments[0] === "story" && segments.length === 2 && isCharacterId(segments[1])) {
    return { name: "story", id: segments[1] };
  }
  return { name: "not-found" };
};

const canAccessStory = (collection, id) =>
  Boolean(isCharacterId(id) && collection?.owned?.[id]);

module.exports = { parseRoute, canAccessStory };
