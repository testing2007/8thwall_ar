const { CHARACTER_IDS, isCharacterId } = require("./characters");

const COLLECTION_KEY = "santa_christmas_collection";

const createFlags = (value = false) =>
  Object.fromEntries(CHARACTER_IDS.map((id) => [id, Boolean(value)]));

const createDefaultCollection = () => ({
  version: 1,
  owned: createFlags(),
  completed: createFlags(),
});

const normalizeFlags = (source) =>
  Object.fromEntries(
    CHARACTER_IDS.map((id) => [id, Boolean(source?.[id])]),
  );

const normalizeCollection = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return createDefaultCollection();
  }

  if (value.version === 1 && value.owned && value.completed) {
    return {
      version: 1,
      owned: normalizeFlags(value.owned),
      completed: normalizeFlags(value.completed),
    };
  }

  const isLegacy = CHARACTER_IDS.some((id) => id in value);
  if (isLegacy) {
    return {
      version: 1,
      owned: normalizeFlags(value),
      completed: createFlags(),
    };
  }

  return createDefaultCollection();
};

const readCollection = (storage = globalThis.localStorage) => {
  try {
    const raw = storage?.getItem(COLLECTION_KEY);
    if (!raw) return createDefaultCollection();
    return normalizeCollection(JSON.parse(raw));
  } catch (_error) {
    return createDefaultCollection();
  }
};

const writeCollection = (collection, storage = globalThis.localStorage) => {
  const normalized = normalizeCollection(collection);
  try {
    storage?.setItem(COLLECTION_KEY, JSON.stringify(normalized));
  } catch (_error) {
    // Safari private mode and restricted storage can reject writes.
  }
  return normalized;
};

const updateFlag = (collection, group, id) => {
  const normalized = normalizeCollection(collection);
  if (!isCharacterId(id)) return normalized;
  return {
    ...normalized,
    [group]: { ...normalized[group], [id]: true },
  };
};

const unlockCharacter = (collection, id) =>
  updateFlag(collection, "owned", id);

const completeCharacter = (collection, id) => {
  const normalized = normalizeCollection(collection);
  if (!isCharacterId(id) || !normalized.owned[id]) return normalized;
  return updateFlag(normalized, "completed", id);
};

const getCollectionCounts = (collection) => {
  const normalized = normalizeCollection(collection);
  return {
    owned: CHARACTER_IDS.filter((id) => normalized.owned[id]).length,
    completed: CHARACTER_IDS.filter((id) => normalized.completed[id]).length,
    total: CHARACTER_IDS.length,
  };
};

module.exports = {
  COLLECTION_KEY,
  createDefaultCollection,
  normalizeCollection,
  readCollection,
  writeCollection,
  unlockCharacter,
  completeCharacter,
  getCollectionCounts,
};
