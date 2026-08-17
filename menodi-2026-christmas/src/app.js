const { CHARACTER_IDS, CHARACTERS } = require("./characters");
const {
  readCollection,
  writeCollection,
  unlockCharacter,
  completeCharacter,
  getCollectionCounts,
} = require("./collection-store");
const { parseRoute, canAccessStory } = require("./router");
const { createArController } = require("./ar-controller");

const STORY_LOADERS = {
  young: () =>
    import(/* webpackChunkName: "story-young" */ "./stories/young.js"),
  adult: () =>
    import(/* webpackChunkName: "story-adult" */ "./stories/adult.js"),
  grandpa: () =>
    import(/* webpackChunkName: "story-grandpa" */ "./stories/grandpa.js"),
};

const app = document.getElementById("app");
let collection = readCollection();
let currentRoute = null;
let renderToken = 0;
let revealObserver = null;
let discovery = null;
let scanStatus = "idle";
let scanStatusCharacter = null;

const icons = {
  book: "./assets/icons/book.svg",
  gift: "./assets/icons/gift.svg",
  lock: "./assets/icons/lock.svg",
  scan: "./assets/icons/scan.svg",
  snow: "./assets/icons/snow.svg",
  star: "./assets/icons/star.svg",
};

const routeTo = (path) => {
  const nextHash = `#${path}`;
  if (globalThis.location.hash === nextHash) {
    void handleRouteChange();
  } else {
    globalThis.location.hash = nextHash;
  }
};

const icon = (name, alt = "") =>
  `<img class="icon" src="${icons[name]}" alt="${alt}" />`;

const statusText = (id) => {
  if (collection.completed[id]) return "Badge earned";
  if (collection.owned[id]) return "Chapter unlocked";
  return "Waiting to be discovered";
};

const topBar = ({ light = false, back = null } = {}) => {
  const counts = getCollectionCounts(collection);
  return `
    <header class="topbar ${light ? "topbar--light" : ""}">
      ${
        back
          ? `<a class="topbar__back" href="${back}" aria-label="Go back">←</a>`
          : `<a class="brand-mark" href="#/" aria-label="Santa's Christmas Journey home">
            <span class="brand-mark__star">${icon("star")}</span>
            <span><strong>Santa's Journey</strong><small>Three stages · One story</small></span>
          </a>`
      }
      <a class="collection-count" href="#/collection" aria-label="Open collection">
        <span>${counts.owned}</span> / ${counts.total}
      </a>
    </header>`;
};

const bottomNav = (active) => `
  <nav class="bottom-nav" aria-label="Primary navigation">
    <a class="${active === "home" ? "is-active" : ""}" href="#/">
      ${icon("book")}<small>Journey</small>
    </a>
    <a class="${active === "scan" ? "is-active" : ""}" href="#/scan" data-action="start-scan">
      ${icon("scan")}<small>Scan</small>
    </a>
    <a class="${active === "collection" ? "is-active" : ""}" href="#/collection">
      ${icon("star")}<small>Collection</small>
    </a>
  </nav>`;

const journeyRows = ({ compact = false } = {}) => `
  <ol class="journey-list ${compact ? "journey-list--compact" : ""}">
    ${CHARACTER_IDS.map((id, index) => {
      const character = CHARACTERS[id];
      const owned = collection.owned[id];
      const completed = collection.completed[id];
      return `
        <li class="journey-stage ${owned ? "is-owned" : "is-locked"}">
          <a href="#/story/${id}" aria-label="${character.name}: ${statusText(id)}">
            <span class="journey-stage__number">0${index + 1}</span>
            <span class="journey-stage__copy">
              <small>${character.name}</small>
              <strong>${character.storyTitle}</strong>
              <em>${statusText(id)}</em>
            </span>
            <span class="journey-stage__state" aria-hidden="true">
              ${completed ? icon("star") : owned ? icon("book") : icon("lock")}
            </span>
          </a>
        </li>`;
    }).join("")}
  </ol>`;

const renderHome = () => {
  document.title = "Santa's Christmas Journey";
  document.body.dataset.page = "home";
  app.innerHTML = `
    <main class="page page--home">
      <section class="poster-hero" aria-label="Santa's Christmas Journey">
        <img class="poster-hero__image" src="./assets/ui/poster.webp" alt="Young Santa, Adult Santa and Grandpa Santa pens together in a snowy Christmas village" />
        <div class="poster-hero__actions">
          <a class="button button--gold poster-hero__scan" href="#/scan" data-action="start-scan">
            ${icon("scan")} Scan a Santa Pen
          </a>
        </div>
      </section>
    </main>`;
};

const scanStatusCopy = () => {
  const character = scanStatusCharacter
    ? CHARACTERS[scanStatusCharacter]
    : null;
  const copy = {
    idle: ["Ready when you are", "Tap the button to open your camera."],
    loading: ["Opening the magic", "Preparing the Christmas scanner…"],
    searching: [
      "Find a Santa Pen",
      "Keep the character inside the golden frame.",
    ],
    holding: [
      "Hold steady",
      character
        ? `Discovering ${character.name}…`
        : "The image is almost clear.",
    ],
    found: [
      "Character discovered!",
      character
        ? `${character.name} has joined your journey.`
        : "A new chapter is unlocked.",
    ],
    error: [
      "The camera needs help",
      "Check camera permission, then try again.",
    ],
  };
  return copy[scanStatus] || copy.idle;
};

const renderScan = () => {
  document.title = "Scan a Santa Pen · Santa's Journey";
  document.body.dataset.page = "scan";
  const [title, detail] = scanStatusCopy();
  app.innerHTML = `
    <main class="scanner-page">
      ${topBar({ light: true, back: "#/" })}
      <div class="scanner-frame" aria-hidden="true">
        <span></span><span></span><span></span><span></span>
        <div class="scanner-spark">${icon("snow")}</div>
      </div>
      <section class="scanner-copy" aria-live="assertive">
        <p class="eyebrow">Image Target Scanner</p>
        <h1 id="scan-status-title">${title}</h1>
        <p id="scan-status-detail">${detail}</p>
      </section>
      <div class="scanner-targets" aria-label="Supported Santa pens">
        ${CHARACTER_IDS.map((id) => `<span class="${collection.owned[id] ? "is-owned" : ""}">${collection.owned[id] ? "Owned" : "Find"} · ${CHARACTERS[id].name}</span>`).join("")}
      </div>
    </main>`;

  //     <button class="button button--gold" id="scan-retry-button" type="button" data-action="start-camera" hidden>
  //   ${icon("scan")} Try Camera Again
  // </button>
  updateScannerUi();
};

const updateScannerUi = () => {
  if (currentRoute?.name !== "scan") return;
  const [title, detail] = scanStatusCopy();
  const titleNode = document.getElementById("scan-status-title");
  const detailNode = document.getElementById("scan-status-detail");
  const retryButton = document.getElementById("scan-retry-button");
  if (titleNode) titleNode.textContent = title;
  if (detailNode) detailNode.textContent = detail;
  if (retryButton) retryButton.hidden = scanStatus !== "error";
};

const renderLockedStory = (id) => {
  const character = CHARACTERS[id];
  document.title = `Story Locked · ${character.name}`;
  document.body.dataset.page = "locked";
  app.innerHTML = `
    <main class="page page--locked">
      ${topBar({ back: "#/" })}
      <section class="locked-hero">
        <div class="locked-hero__art">
          <img src="${character.product}" alt="${character.name} pen" />
          <span class="locked-hero__lock">${icon("lock", "Locked")}</span>
        </div>
        <p class="eyebrow">Chapter ${character.chapter}</p>
        <h1>Story locked</h1>
        <p>This chapter hasn't been discovered yet. Scan the ${character.name} Pen to unlock <em>${character.storyTitle}</em>.</p>
        <a class="button button--red" href="#/scan" data-action="start-scan">${icon("scan")} Scan this pen</a>
        <a class="text-link text-link--dark" href="#/collection">Return to collection</a>
      </section>
      ${bottomNav("collection")}
    </main>`;
};

const renderStory = async (id) => {
  const character = CHARACTERS[id];
  if (!canAccessStory(collection, id)) {
    renderLockedStory(id);
    return;
  }

  const token = ++renderToken;
  document.body.dataset.page = "story";
  app.innerHTML = `<main class="loading-page"><span>${icon("snow")}</span><p>Opening Chapter ${character.chapter}…</p></main>`;
  const storyModule = await STORY_LOADERS[id]();
  if (token !== renderToken || currentRoute?.id !== id) return;
  const story = storyModule.default || storyModule;
  const completed = collection.completed[id];
  document.title = `${character.storyTitle} · Santa's Journey`;

  app.innerHTML = `
    <main class="page page--story page--story-${id}">
      <section class="story-hero">
        <img src="${character.cover}" alt="${character.name}: ${character.storyTitle}" />
        <div class="story-hero__shade"></div>
        ${topBar({ light: true, back: "#/" })}
        <div class="story-hero__copy">
          <p class="eyebrow">${character.name} · Chapter ${character.chapter}</p>
          <h1>${character.storyTitle}</h1>
          <p>${story.intro}</p>
          <a class="story-scroll" href="#story-begins">Begin the story <span>↓</span></a>
        </div>
      </section>

      <section id="story-begins" class="paper-section character-intro reveal">
        <div class="character-intro__image"><img src="${character.product}" alt="${character.name} physical pen" /></div>
        <div>
          <p class="eyebrow">${character.era}</p>
          <h2>${character.name}</h2>
          <p>${story.characterIntro}</p>
          <span class="value-seal">${character.value}</span>
        </div>
      </section>

      <section class="story-scenes" aria-label="Story scenes">
        ${story.scenes
          .map(
            (scene, index) => `
          <article class="story-scene reveal">
            <figure>
              <img src="${scene.image}" alt="Scene ${index + 1}: ${scene.title}" loading="lazy" decoding="async" />
              <figcaption>Scene 0${index + 1}</figcaption>
            </figure>
            <div class="story-scene__copy">
              <p class="eyebrow">Chapter ${character.chapter} · Scene ${index + 1}</p>
              <h2>${scene.title}</h2>
              <p>${scene.text}</p>
            </div>
          </article>`,
          )
          .join("")}
      </section>

      <blockquote class="story-quote reveal">“${story.quote}”</blockquote>

      <section class="reward-section reveal ${completed ? "is-earned" : ""}">
        <div class="reward-medal">${icon("star", "Star badge")}</div>
        <p class="eyebrow">Chapter reward</p>
        <h2>${character.reward}</h2>
        <p>${
          completed
            ? "This badge is part of your Santa collection."
            : "You reached the end of this chapter. Add its lesson to your collection."
        }</p>
        <button class="button ${completed ? "button--earned" : "button--gold"}" type="button" data-action="claim-badge" data-character="${id}" ${completed ? "disabled" : ""}>
          ${completed ? `${icon("star")} Badge Earned` : "Claim Badge"}
        </button>
      </section>

      <section class="paper-section other-chapters reveal">
        <p class="eyebrow">Continue the journey</p>
        <h2>Other chapters</h2>
        ${journeyRows({ compact: true })}
      </section>
      ${bottomNav("")}
    </main>`;
  installRevealObserver();
};

const renderCollection = () => {
  const counts = getCollectionCounts(collection);
  const allDiscovered = counts.owned === counts.total;
  const journeyComplete = counts.completed === counts.total;
  document.title = "My Santa Collection";
  document.body.dataset.page = "collection";
  app.innerHTML = `
    <main class="page page--collection">
      ${topBar({ back: "#/" })}
      <header class="collection-hero">
        <p class="eyebrow">My Santa Collection</p>
        <h1>${counts.owned} / ${counts.total}<br /><span>discovered</span></h1>
        <p>${
          journeyComplete
            ? "Three stages. One Santa. Your Christmas journey is complete."
            : allDiscovered
              ? "All three stages are here. Finish each story and claim every badge to complete the journey."
              : "Every physical Santa Pen holds one chapter. Find the missing stages to continue the journey."
        }</p>
        <div class="collection-progress"><span style="width:${(counts.owned / counts.total) * 100}%"></span></div>
      </header>

      <section class="collection-characters">
        ${CHARACTER_IDS.map((id) => {
          const character = CHARACTERS[id];
          const owned = collection.owned[id];
          const completed = collection.completed[id];
          return `
            <article class="collection-character reveal ${owned ? "is-owned" : "is-locked"}">
              <div class="collection-character__image">
                <img src="${owned ? character.product : icons.lock}" alt="${owned ? `${character.name} pen` : `${character.name} locked`}" />
              </div>
              <div class="collection-character__copy">
                <p class="eyebrow">Chapter ${character.chapter}</p>
                <h2>${character.name}</h2>
                <p>${character.storyTitle}</p>
                <span>${completed ? "Badge earned" : owned ? "Story unlocked" : "Locked"}</span>
              </div>
              <a href="${owned ? `#/story/${id}` : "#/scan"}" ${owned ? "" : 'data-action="start-scan"'} aria-label="${owned ? `Read ${character.storyTitle}` : `Scan ${character.name}`}">→</a>
            </article>`;
        }).join("")}
      </section>

      <section class="collection-finale reveal ${journeyComplete ? "is-complete" : ""}">
        <span>${icon("snow")}</span>
        <p class="eyebrow">${journeyComplete ? "Complete journey" : "The journey continues"}</p>
        <h2>${journeyComplete ? "Three stages. One Santa." : "One chapter at a time."}</h2>
        <p>${counts.completed} of ${counts.total} story badges earned.</p>
        <a class="button button--red" href="#/scan" data-action="start-scan">${icon("scan")} Scan another pen</a>
      </section>
      ${bottomNav("collection")}
    </main>`;
  installRevealObserver();
};

const renderNotFound = () => {
  document.title = "Page Not Found · Santa's Journey";
  document.body.dataset.page = "not-found";
  app.innerHTML = `
    <main class="page page--locked">
      ${topBar({ back: "#/" })}
      <section class="locked-hero">
        <div class="locked-hero__art locked-hero__art--star">${icon("snow")}</div>
        <p class="eyebrow">Lost in the snow</p>
        <h1>Page not found</h1>
        <p>This path is not part of Santa's journey.</p>
        <a class="button button--red" href="#/">Return home</a>
      </section>
    </main>`;
};

const installRevealObserver = () => {
  revealObserver?.disconnect();
  const nodes = [...document.querySelectorAll(".reveal")];
  if (!nodes.length) return;
  if (
    !("IntersectionObserver" in globalThis) ||
    globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    nodes.forEach((node) => node.classList.add("is-visible"));
    return;
  }
  revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      });
    },
    { threshold: 0.14 },
  );
  nodes.forEach((node) => revealObserver.observe(node));
};

const renderDiscovery = () => {
  document.getElementById("discovery-overlay")?.remove();
  if (!discovery || currentRoute?.name !== "scan") return;
  const character = CHARACTERS[discovery.id];
  const overlay = document.createElement("section");
  overlay.id = "discovery-overlay";
  overlay.className = "discovery-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "discovery-title");
  overlay.innerHTML = `
    <div class="discovery-card">
      <div class="discovery-card__seal">${icon("star")}</div>
      <p class="eyebrow">${discovery.isNew ? "Character discovered!" : "Welcome back"}</p>
      <h2 id="discovery-title">${character.name}</h2>
      <p>Chapter ${character.chapter} · ${character.storyTitle}</p>
      <div class="discovery-card__actions">
        <button class="button button--gold" type="button" data-action="read-discovered">Read Chapter</button>
        <button class="text-button" type="button" data-action="scan-another">Scan another pen</button>
      </div>
    </div>`;
  app.appendChild(overlay);
  overlay.querySelector("[data-action=read-discovered]")?.focus();
};

const setScanStatus = (status, id = null) => {
  scanStatus = status;
  scanStatusCharacter = id;
  updateScannerUi();
};

const ar = createArController({
  onStatus: setScanStatus,
  onDiscovered: (id) => {
    const isNew = !collection.owned[id];
    collection = writeCollection(unlockCharacter(collection, id));
    discovery = { id, isNew };
    setScanStatus("found", id);
    renderDiscovery();
    void ar.stop();
  },
  onError: (error, area) => {
    console.error(`[Santa Journey:${area}]`, error);
    setScanStatus("error");
  },
});

const startScanner = async () => {
  discovery = null;
  document.getElementById("discovery-overlay")?.remove();
  try {
    await ar.start();
  } catch (_error) {
    setScanStatus("error");
  }
};

async function handleRouteChange() {
  const nextRoute = parseRoute(globalThis.location.hash);
  const previousRoute = currentRoute;
  currentRoute = nextRoute;
  renderToken += 1;
  revealObserver?.disconnect();

  if (previousRoute?.name === "scan" && nextRoute.name !== "scan") {
    discovery = null;
    await ar.stop();
  }

  if (nextRoute.name === "home") renderHome();
  else if (nextRoute.name === "scan") renderScan();
  else if (nextRoute.name === "story") await renderStory(nextRoute.id);
  else if (nextRoute.name === "collection") renderCollection();
  else renderNotFound();

  globalThis.scrollTo({ top: 0, behavior: "auto" });
  installRevealObserver();

  if (nextRoute.name === "scan" && !ar.isRunning()) {
    void startScanner();
  }
}

document.addEventListener("click", (event) => {
  const actionNode = event.target.closest("[data-action]");
  if (!actionNode) return;
  const action = actionNode.dataset.action;

  if (action === "start-scan") {
    event.preventDefault();
    routeTo("/scan");
  } else if (action === "start-camera") {
    void startScanner();
  } else if (action === "claim-badge") {
    const id = actionNode.dataset.character;
    collection = writeCollection(completeCharacter(collection, id));
    void renderStory(id);
  } else if (action === "read-discovered") {
    const id = discovery?.id;
    discovery = null;
    if (id) routeTo(`/story/${id}`);
  } else if (action === "scan-another") {
    discovery = null;
    void startScanner();
  }
});

globalThis.addEventListener("hashchange", () => {
  void handleRouteChange();
});
globalThis.addEventListener("pagehide", () => {
  void ar.stop();
});

if (!globalThis.location.hash) globalThis.history.replaceState(null, "", "#/");
void handleRouteChange();
