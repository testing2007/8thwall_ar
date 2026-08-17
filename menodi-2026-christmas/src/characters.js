const CHARACTER_IDS = Object.freeze(["young", "adult", "grandpa"]);

const CHARACTERS = Object.freeze({
  young: Object.freeze({
    id: "young",
    targetName: "young-santa",
    name: "Young Santa",
    era: "The beginning",
    chapter: 1,
    storyTitle: "The First Christmas",
    reward: "First Christmas Star",
    value: "Courage",
    cover: "./assets/ui/young-cover.webp",
    product: "./assets/ui/young-product.webp",
    model: null,
  }),
  adult: Object.freeze({
    id: "adult",
    targetName: "adult-santa",
    name: "Adult Santa",
    era: "The promise",
    chapter: 2,
    storyTitle: "The Busiest Night",
    reward: "Busiest Night Hero",
    value: "Responsibility",
    cover: "./assets/ui/adult-cover.webp",
    product: "./assets/ui/adult-product.webp",
    model: null,
  }),
  grandpa: Object.freeze({
    id: "grandpa",
    targetName: "grandpa-santa",
    name: "Grandpa Santa",
    era: "The secret",
    chapter: 3,
    storyTitle: "The Christmas Secret",
    reward: "Christmas Secret Keeper",
    value: "Wisdom",
    cover: "./assets/ui/grandpa-cover.webp",
    product: "./assets/ui/grandpa-product.webp",
    model: null,
  }),
});

const TARGET_TO_CHARACTER = Object.freeze(
  Object.fromEntries(
    CHARACTER_IDS.map((id) => [CHARACTERS[id].targetName, id]),
  ),
);

const isCharacterId = (value) => CHARACTER_IDS.includes(value);

module.exports = {
  CHARACTER_IDS,
  CHARACTERS,
  TARGET_TO_CHARACTER,
  isCharacterId,
};
