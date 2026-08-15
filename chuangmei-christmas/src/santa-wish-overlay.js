const BGM_URL = require("./assets/html/christmas-bgm.mp3");
const SANTA_URL = require("./assets/html/santa-waving.png");
const PAPER_URL = require("./assets/html/wish-parchment.png");
const NORTH_POLE_URL = require("./assets/html/north-pole-scene.jpg");

const OVERLAY_ACTIVE_CLASS = "santa-wish-overlay-active";
const BGM_VOLUME = 0.28;

const styles = `
  body.${OVERLAY_ACTIVE_CLASS} #camerafeed {
    filter: blur(8px) brightness(0.45);
    transform: scale(1.03);
  }

  #santa-wish-root,
  #santa-wish-root * {
    box-sizing: border-box;
  }

  #santa-wish-root {
    position: fixed;
    inset: 0;
    z-index: 2147483000;
    display: none;
    overflow: hidden;
    font-family: "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
    color: #5b2632;
    pointer-events: none;
  }

  #santa-wish-root.is-visible {
    display: block;
    pointer-events: auto;
  }

  .wish-backdrop {
    position: absolute;
    inset: 0;
    background:
      radial-gradient(circle at 50% 16%, rgba(255, 238, 195, 0.16), transparent 30%),
      linear-gradient(180deg, rgba(7, 18, 43, 0.54), rgba(3, 9, 23, 0.82));
  }

  .wish-snow {
    position: absolute;
    inset: -20%;
    opacity: 0.42;
    background-image: radial-gradient(#fff 1.1px, transparent 1.8px);
    background-size: 38px 38px;
    animation: wishSnow 9s linear infinite;
  }

  @keyframes wishSnow {
    to { transform: translate3d(36px, 120px, 0); }
  }

  .wish-flight {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 22px;
  }

  .wish-gift {
    position: absolute;
    left: 58%;
    top: 58%;
    width: 70px;
    height: 58px;
    transform: translate(-50%, -50%) scale(.72);
    border-radius: 10px 10px 14px 14px;
    background: linear-gradient(180deg, #d9293e, #9e1024);
    box-shadow: 0 18px 34px rgba(0, 0, 0, 0.34);
    animation: giftFromHand 620ms cubic-bezier(.18,.82,.24,1) forwards;
  }

  @keyframes giftFromHand {
    to { transform: translate(-50%, -50%) scale(1); }
  }

  .wish-gift::before {
    content: "";
    position: absolute;
    left: 50%;
    top: 0;
    width: 16px;
    height: 100%;
    transform: translateX(-50%);
    background: #f5c94f;
  }

  .wish-gift::after {
    content: "";
    position: absolute;
    left: -7px;
    right: -7px;
    top: -16px;
    height: 20px;
    border-radius: 8px;
    background: linear-gradient(180deg, #ef4155, #bd1c31);
    transform-origin: 18% 100%;
    animation: giftLidOpen 820ms ease-out forwards;
  }

  @keyframes giftLidOpen {
    to { transform: translate(-12px, -16px) rotate(-18deg); }
  }

  .wish-letter {
    width: min(420px, 86vw);
    min-height: 310px;
    padding: 38px 34px;
    border-radius: 18px;
    background-color: #fff8e8;
    background-image: var(--wish-paper-image);
    background-repeat: no-repeat;
    background-size: 100% 100%;
    box-shadow: 0 28px 70px rgba(0, 0, 0, 0.36);
    transform-origin: 50% 80%;
    animation: letterFlyUp 1800ms cubic-bezier(.16, .84, .22, 1) forwards;
  }

  @keyframes letterFlyUp {
    0% {
      opacity: 0;
      transform: translate3d(8vw, 12vh, 0) scale(0.14) rotate(-10deg);
    }
    34% {
      opacity: 1;
      transform: translate3d(7vw, 7vh, 0) scale(0.38) rotate(8deg);
    }
    100% {
      opacity: 1;
      transform: translate3d(0, 0, 0) scale(1) rotate(0deg);
    }
  }

  .wish-letter-intro {
    display: grid;
    min-height: 230px;
    place-items: center;
    text-align: center;
  }

  .wish-letter-intro img {
    width: 92px;
    height: 104px;
    object-fit: contain;
    margin-bottom: 6px;
    filter: drop-shadow(0 8px 12px rgba(143, 16, 34, 0.22));
  }

  .wish-letter h1,
  .wish-form h1,
  .wish-reply h1 {
    margin: 0 0 10px;
    color: #9d1728;
    font-size: 25px;
    line-height: 1.22;
    text-align: center;
  }

  .wish-letter p,
  .wish-form p {
    margin: 0;
    color: #7b5862;
    font-size: 15px;
    line-height: 1.7;
    text-align: center;
  }

  .wish-form,
  .wish-send,
  .wish-reply {
    position: absolute;
    inset: 0;
    display: none;
    align-items: center;
    justify-content: center;
    padding: max(20px, env(safe-area-inset-top)) 16px max(20px, env(safe-area-inset-bottom));
    overflow-y: auto;
  }

  #santa-wish-root.is-form .wish-flight {
    display: none;
  }

  #santa-wish-root.is-form .wish-form,
  #santa-wish-root.is-send .wish-send,
  #santa-wish-root.is-reply .wish-reply {
    display: flex;
  }

  #santa-wish-root.is-send .wish-flight,
  #santa-wish-root.is-send .wish-form,
  #santa-wish-root.is-reply .wish-flight,
  #santa-wish-root.is-reply .wish-form {
    display: none;
  }

  .wish-panel {
    width: min(440px, 100%);
    border-radius: 20px;
    padding: 32px 32px 28px;
    background-color: #fff8e8;
    background-image: var(--wish-paper-image);
    background-repeat: no-repeat;
    background-size: 100% 100%;
    box-shadow: 0 28px 80px rgba(0, 0, 0, 0.42);
  }

  .wish-field {
    display: block;
    margin: 15px 0;
  }

  .wish-field span {
    display: block;
    margin: 0 0 7px 4px;
    color: #6f3d48;
    font-size: 13px;
    font-weight: 700;
  }

  .wish-field input,
  .wish-field textarea {
    width: calc(100% - 20px);
    border: 1px solid #e9d5b9;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.88);
    color: #4b2530;
    font: inherit;
    font-size: 16px;
    outline: none;
    padding: 13px 14px;
    margin: 10px;

  }

  .wish-field textarea {
    min-height: 116px;
    line-height: 1.55;
    resize: vertical;
  }

  .wish-field input:focus,
  .wish-field textarea:focus {
    border-color: #f0be4d;
    box-shadow: 0 0 0 3px rgba(240, 190, 77, 0.24);
  }

  .wish-actions {
    display: grid;
    gap: 10px;
    margin: 4px 0 14px;
    padding-bottom: 8px;
  }

  .wish-button {
    min-height: 52px;
    margin: 10px;
    border: 0;
    border-radius: 999px;
    background: linear-gradient(180deg, #e83b4f, #b9182d);
    color: #fff;
    cursor: pointer;
    font: inherit;
    font-size: 17px;
    font-weight: 800;
    touch-action: manipulation;
    box-shadow: 0 12px 24px rgba(143, 16, 34, 0.28);
  }

  .wish-error {
    display: none;
    color: #b5142b;
    font-size: 13px;
    margin: 0 10px;
    text-align: center;
  }

  .wish-error:not(:empty) {
    display: block;
    margin: 6px 10px 0;
  }

  .wish-send {
    align-items: center;
    justify-content: center;
    background:
      radial-gradient(circle at 80% 12%, rgba(255, 255, 255, 0.18), transparent 9%),
      linear-gradient(180deg, #051942 0%, #09265d 48%, #04142f 100%);
    color: #fff;
    overflow: hidden;
  }

  .send-stars,
  .send-blizzard,
  .send-aurora,
  .send-trail,
  .send-sleigh {
    position: absolute;
    pointer-events: none;
  }

  .send-stars {
    inset: -10%;
    background-image:
      radial-gradient(#fff 1px, transparent 1.6px),
      radial-gradient(rgba(255,255,255,.72) 1px, transparent 1.8px);
    background-position: 0 0, 19px 26px;
    background-size: 46px 46px, 72px 72px;
    opacity: 0.72;
  }

  .send-aurora {
    left: -20%;
    right: -20%;
    top: 10%;
    height: 32vh;
    opacity: 0;
    background:
      radial-gradient(ellipse at 42% 50%, rgba(87, 212, 171, 0.28), transparent 58%),
      radial-gradient(ellipse at 62% 62%, rgba(249, 197, 90, 0.2), transparent 54%);
    filter: blur(14px);
    transform: translateY(14px);
    transition: opacity 900ms ease, transform 900ms ease;
  }

  .send-moon {
    position: absolute;
    right: 10vw;
    top: 8vh;
    width: 58px;
    height: 58px;
    border-radius: 50%;
    background: #fff7d5;
    box-shadow: 0 0 34px rgba(255, 247, 213, 0.42);
  }

  .send-moon::after {
    content: "";
    position: absolute;
    left: -10px;
    top: -4px;
    width: 58px;
    height: 58px;
    border-radius: 50%;
    background: #061b48;
  }

  .send-blizzard {
    inset: -24%;
    opacity: 0;
    background-image:
      radial-gradient(#fff 1.4px, transparent 2px),
      radial-gradient(rgba(255,255,255,.62) 1px, transparent 2px);
    background-size: 32px 32px, 54px 54px;
    animation: sendSnow 1300ms linear infinite;
    transition: opacity 500ms ease;
  }

  @keyframes sendSnow {
    to { transform: translate3d(-72px, 140px, 0); }
  }

  .send-envelope {
    position: relative;
    width: min(360px, 78vw);
    height: min(230px, 49vw);
    border-radius: 16px;
    background:
      linear-gradient(145deg, rgba(255,255,255,.2), transparent 35%),
      #f7dfb8;
    box-shadow: 0 28px 74px rgba(0, 0, 0, 0.44);
    transform: translate3d(0, 2vh, 0) scale(1);
    transition:
      transform 900ms cubic-bezier(.18,.82,.24,1),
      opacity 500ms ease;
  }

  .send-envelope::before,
  .send-envelope::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: 16px;
  }

  .send-envelope::before {
    clip-path: polygon(0 0, 50% 58%, 100% 0);
    background: #fff0cf;
    transform-origin: top center;
    animation: envelopeClose 900ms ease forwards;
  }

  .send-envelope::after {
    border: 8px solid transparent;
    border-image: repeating-linear-gradient(45deg, #c92034 0 14px, #fff6de 14px 27px, #1b5d42 27px 40px, #fff6de 40px 54px) 16;
    opacity: 0.95;
  }

  @keyframes envelopeClose {
    from { transform: rotateX(0deg); }
    to { transform: rotateX(180deg); }
  }

  .send-wax {
    position: absolute;
    left: 50%;
    top: 17%;
    z-index: 2;
    width: 72px;
    height: 72px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    transform: translate(-50%, -50%) scale(0);
    background:
      radial-gradient(circle at 34% 28%, #ff6a57, transparent 18%),
      radial-gradient(circle, #c7192e 0 58%, #8f1022 64% 100%);
    box-shadow:
      inset 0 0 0 4px rgba(255,255,255,.12),
      0 9px 18px rgba(80, 0, 13, 0.38);
    color: #ffd88e;
    font-size: 31px;
    transition: transform 560ms cubic-bezier(.14,1.34,.34,1);
  }

  .send-status {
    position: absolute;
    left: 24px;
    right: 24px;
    bottom: max(30px, env(safe-area-inset-bottom));
    margin: 0;
    color: rgba(255,255,255,.86);
    font-size: 17px;
    font-weight: 700;
    text-align: center;
    text-shadow: 0 2px 12px rgba(0,0,0,.45);
  }

  .send-trail {
    left: 8vw;
    right: 8vw;
    top: 28vh;
    height: 160px;
    opacity: 0;
    border-top: 4px solid rgba(255, 221, 130, .78);
    border-radius: 50%;
    filter: drop-shadow(0 0 12px rgba(255, 207, 91, .85));
    transform: rotate(-16deg) scaleX(.35);
    transform-origin: 82% 50%;
    transition: opacity 380ms ease, transform 900ms ease;
  }

  .send-sleigh {
    left: -34vw;
    top: 34vh;
    width: 148px;
    height: 58px;
    opacity: 0;
    transform: rotate(-10deg);
  }

  .send-sleigh::before {
    content: "";
    position: absolute;
    left: 50px;
    bottom: 7px;
    width: 86px;
    height: 26px;
    border-radius: 4px 22px 10px 16px;
    background: #22101a;
    box-shadow: inset 0 -6px 0 #c92034;
  }

  .send-sleigh::after {
    content: "";
    position: absolute;
    left: 8px;
    top: 13px;
    width: 42px;
    height: 25px;
    border-radius: 60% 45% 45% 45%;
    background: #1c1117;
    box-shadow:
      20px -8px 0 -12px #1c1117,
      30px 8px 0 -12px #1c1117,
      41px -7px 0 -15px #1c1117;
  }

  .send-sleigh-line {
    position: absolute;
    left: 34px;
    top: 31px;
    width: 54px;
    height: 1px;
    background: rgba(255,255,255,.54);
  }

  #santa-wish-root.send-sealed .send-wax {
    transform: translate(-50%, -50%) scale(1);
  }

  #santa-wish-root.send-snowing .send-blizzard {
    opacity: 0.76;
  }

  #santa-wish-root.send-sleighing .send-envelope {
    transform: translate3d(46vw, -34vh, 0) scale(.36) rotate(16deg);
    opacity: 0;
  }

  #santa-wish-root.send-sleighing .send-sleigh {
    opacity: 1;
    animation: sleighRide 1700ms cubic-bezier(.2,.72,.28,1) forwards;
  }

  #santa-wish-root.send-sleighing .send-trail {
    opacity: 1;
    transform: rotate(-16deg) scaleX(1);
  }

  #santa-wish-root.send-night .send-aurora {
    opacity: 1;
    transform: translateY(0);
  }

  @keyframes sleighRide {
    0% { transform: translate3d(0, 18vh, 0) rotate(-10deg); }
    100% { transform: translate3d(128vw, -32vh, 0) rotate(-13deg); }
  }

  .wish-reply .wish-panel {
    position: relative;
    width: min(500px, calc(100vw - 26px));
    padding: 96px 30px 28px;
    border: 8px solid transparent;
    border-image: repeating-linear-gradient(45deg, #c92034 0 16px, #fff6de 16px 31px, #1f7048 31px 46px, #fff6de 46px 61px) 18;
    background:
      linear-gradient(180deg, rgba(255, 248, 232, 0.96), rgba(255, 244, 220, 0.96)),
      var(--wish-paper-image);
    background-size: 100% 100%;
    box-shadow: 0 30px 90px rgba(0, 0, 0, 0.46);
  }

  .wish-reply {
    align-items: stretch;
    background:
      linear-gradient(180deg, rgba(4, 18, 48, 0.12), rgba(4, 18, 48, 0.5)),
      var(--wish-reply-image);
    background-position: center;
    background-size: cover;
  }

  .reply-layout {
    position: relative;
    z-index: 1;
    width: min(520px, 100%);
    margin: auto;
    padding: 8px 0 28px;
  }

  .reply-wax {
    position: absolute;
    left: 50%;
    top: -42px;
    width: 88px;
    height: 88px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    transform: translateX(-50%);
    background:
      radial-gradient(circle at 34% 28%, #ff6a57, transparent 18%),
      radial-gradient(circle, #c7192e 0 58%, #8f1022 64% 100%);
    color: #ffd88e;
    font-size: 38px;
    box-shadow: 0 12px 20px rgba(65, 0, 12, 0.34), inset 0 0 0 5px rgba(255,255,255,.12);
  }

  .reply-divider {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 12px;
    margin: 8px 0 18px;
    color: #a86822;
  }

  .reply-divider::before,
  .reply-divider::after {
    content: "";
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(168,104,34,.5), transparent);
  }

  .reply-blessing {
    margin: 16px 0 0;
    color: #9d1728;
    font-size: 16px;
    font-weight: 700;
    line-height: 1.6;
    text-align: center;
  }

  .reply-santa {
    position: absolute;
    right: 10px;
    bottom: 74px;
    width: 118px;
    height: 138px;
    object-fit: contain;
    filter: drop-shadow(0 14px 18px rgba(0,0,0,.36));
  }

  .wish-reply-text {
    margin: 18px 0 4px;
    padding: 16px;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.72);
    color: #164d7d;
    font-size: 18px;
    font-weight: 700;
    line-height: 1.65;
    overflow-wrap: anywhere;
    text-align: center;
  }

  @media (max-height: 650px) {
    .wish-panel { padding: 24px 28px; }
    .wish-field { margin: 10px 0; }
    .wish-field textarea { min-height: 82px; }
  }
`;

const markup = `
  <div class="wish-backdrop"></div>
  <div class="wish-snow" aria-hidden="true"></div>

  <section class="wish-flight" aria-live="polite">
    <div class="wish-gift" aria-hidden="true"></div>
    <div class="wish-letter">
      <div class="wish-letter-intro">
        <div>
          <img src="${SANTA_URL}" alt="">
          <h1>圣诞信纸飞来啦</h1>
          <p>现在可以移开手机，用魔法笔写下你的愿望。</p>
        </div>
      </div>
    </div>
  </section>

  <form class="wish-form" id="wish-form" novalidate>
    <div class="wish-panel">
      <h1>写下你的圣诞愿望</h1>
      <p>不需要继续对准圣诞老人图像。相机画面会留在背景里，愿望会在这台设备上完成。</p>

      <label class="wish-field">
        <span>你的名字</span>
        <input id="wish-name" maxlength="16" placeholder="例如：小朋友">
      </label>

      <label class="wish-field">
        <span>我的愿望</span>
        <textarea id="wish-text" maxlength="120" placeholder="希望圣诞老人帮我实现..."></textarea>
      </label>

      <div id="wish-error" class="wish-error" role="alert"></div>

      <div class="wish-actions">
        <button class="wish-button" type="submit">寄给圣诞老人</button>
      </div>
    </div>
  </form>

  <section class="wish-send" aria-live="polite">
    <div class="send-stars" aria-hidden="true"></div>
    <div class="send-aurora" aria-hidden="true"></div>
    <div class="send-moon" aria-hidden="true"></div>
    <div class="send-blizzard" aria-hidden="true"></div>
    <div class="send-trail" aria-hidden="true"></div>
    <div class="send-sleigh" aria-hidden="true"><i class="send-sleigh-line"></i></div>
    <div class="send-envelope" aria-hidden="true">
      <div class="send-wax">✦</div>
    </div>
    <p id="send-status" class="send-status">信封正在合拢...</p>
  </section>

  <section class="wish-reply" aria-live="polite">
    <div class="reply-layout">
      <div class="wish-panel">
        <div class="reply-wax">✦</div>
        <h1>圣诞老人回信</h1>
        <div class="reply-divider">★</div>
        <p id="wish-reply-greeting">你的愿望我已经收到啦！</p>
        <div id="wish-reply-text" class="wish-reply-text"></div>
        <div class="reply-blessing">愿你的圣诞节充满温暖和惊喜</div>
      </div>
      <img class="reply-santa" src="${SANTA_URL}" alt="">
    </div>
  </section>
`;

let root = null;
let introTimer = null;
let sendTimers = [];
let bgm = null;
let bgmUnlocked = false;
let lastWishData = { name: "", text: "" };

const getRoot = () => root;

const ensureBgm = () => {
  if (bgm) return bgm;
  bgm = new Audio(BGM_URL);
  bgm.loop = true;
  bgm.volume = BGM_VOLUME;
  bgm.preload = "auto";
  return bgm;
};

const clearIntroTimer = () => {
  if (introTimer) {
    window.clearTimeout(introTimer);
    introTimer = null;
  }
};

const clearSendTimers = () => {
  sendTimers.forEach((timer) => window.clearTimeout(timer));
  sendTimers = [];
};

const setSendStatus = (message) => {
  const status = root?.querySelector("#send-status");
  if (status) status.textContent = message;
};

const resetSendClasses = () => {
  if (!root) return;
  root.classList.remove(
    "send-sealed",
    "send-snowing",
    "send-sleighing",
    "send-night",
  );
};

const showReply = (data) => {
  const name = data.name || "小宇";
  const greeting = root.querySelector("#wish-reply-greeting");
  const reply = root.querySelector("#wish-reply-text");

  if (greeting) greeting.textContent = `${name}，你的愿望我已经收到啦！`;
  if (reply) reply.textContent = `“${data.text}”`;

  resetSendClasses();
  root.classList.remove("is-send");
  root.classList.add("is-reply");
  window.dispatchEvent(new CustomEvent("santa:reply-shown", { detail: data }));
};

const startSendSequence = (data) => {
  clearIntroTimer();
  clearSendTimers();
  resetSendClasses();
  lastWishData = data;

  root.classList.remove("is-form", "is-reply");
  root.classList.add("is-send");
  setSendStatus("信封正在合拢...");

  sendTimers.push(
    window.setTimeout(() => {
      root.classList.add("send-sealed");
      setSendStatus("盖上北极火漆印章...");
    }, 620),
  );

  sendTimers.push(
    window.setTimeout(() => {
      root.classList.add("send-snowing");
      setSendStatus("风雪正在打开去北极的路...");
    }, 1250),
  );

  sendTimers.push(
    window.setTimeout(() => {
      root.classList.add("send-sleighing");
      setSendStatus("雪橇已经接走信封...");
    }, 2150),
  );

  sendTimers.push(
    window.setTimeout(() => {
      root.classList.add("send-night");
      setSendStatus("夜空转场中...");
    }, 3300),
  );

  sendTimers.push(
    window.setTimeout(() => {
      showReply(data);
    }, 4500),
  );
};

const makeReplyCardBlob = async () => {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext("2d");

  const loadImage = (src) =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = src;
    });

  const cover = (image, x, y, w, h) => {
    const ratio = Math.max(w / image.width, h / image.height);
    const dw = image.width * ratio;
    const dh = image.height * ratio;
    ctx.drawImage(image, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  };

  const roundRect = (x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  try {
    const background = await loadImage(NORTH_POLE_URL);
    cover(background, 0, 0, canvas.width, canvas.height);
  } catch {
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, "#06183a");
    gradient.addColorStop(1, "#0b4770");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  ctx.fillStyle = "rgba(3, 12, 32, 0.28)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#fff8e8";
  roundRect(86, 138, 908, 690, 44);
  ctx.fill();
  ctx.lineWidth = 14;
  ctx.strokeStyle = "#c92034";
  ctx.stroke();

  ctx.fillStyle = "#b9182d";
  ctx.beginPath();
  ctx.arc(540, 138, 76, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffd88e";
  ctx.font = "700 54px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("✦", 540, 157);

  ctx.fillStyle = "#9d1728";
  ctx.font = "700 82px sans-serif";
  ctx.fillText("圣诞老人回信", 540, 325);

  ctx.fillStyle = "#7d3f28";
  ctx.font = "42px sans-serif";
  ctx.fillText(
    `${lastWishData.name || "小宇"}，你的愿望我已经收到啦！`,
    540,
    440,
  );

  ctx.fillStyle = "#164d7d";
  ctx.font = "700 54px sans-serif";
  roundRect(172, 508, 736, 174, 24);
  ctx.strokeStyle = "#e6c792";
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.fillText(`“${lastWishData.text || "希望全家人每天都开心"}”`, 540, 616);

  ctx.fillStyle = "#9d1728";
  ctx.font = "700 40px sans-serif";
  ctx.fillText("愿你的圣诞节充满温暖和惊喜", 540, 752);

  try {
    const santa = await loadImage(SANTA_URL);
    const ratio = Math.min(310 / santa.width, 380 / santa.height);
    const w = santa.width * ratio;
    const h = santa.height * ratio;
    ctx.drawImage(santa, 620, 1110, w, h);
  } catch {
    // Asset is optional for saving the card.
  }

  return new Promise((resolve) => canvas.toBlob(resolve, "image/png", 0.94));
};

const saveReplyCard = async () => {
  const blob = await makeReplyCardBlob();
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "santa-reply-card.png";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const ensureRoot = () => {
  if (root) return root;

  const style = document.createElement("style");
  style.id = "santa-wish-overlay-styles";
  style.textContent = styles;
  document.head.appendChild(style);

  root = document.createElement("div");
  root.id = "santa-wish-root";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.style.setProperty("--wish-paper-image", `url("${PAPER_URL}")`);
  root.style.setProperty("--wish-reply-image", `url("${NORTH_POLE_URL}")`);
  root.innerHTML = markup;
  document.body.appendChild(root);

  const form = root.querySelector("#wish-form");
  const wishText = root.querySelector("#wish-text");
  const wishName = root.querySelector("#wish-name");
  const error = root.querySelector("#wish-error");
  const reply = root.querySelector("#wish-reply-text");

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = wishText.value.trim();
    const name = wishName.value.trim() || "亲爱的小朋友";

    if (!text) {
      error.textContent = "请先写下你的愿望。";
      wishText.focus();
      return;
    }

    error.textContent = "";
    startSendSequence({ name, text });
    window.dispatchEvent(
      new CustomEvent("santa:wish-submitted", { detail: { name, text } }),
    );
  });

  ensureBgm();

  return root;
};

const unlockAudio = () => {
  const audio = ensureBgm();
  if (bgmUnlocked) return;

  const intendedVolume = audio.volume || BGM_VOLUME;
  audio.volume = 0;
  const playPromise = audio.play();
  if (!playPromise?.then) {
    audio.volume = intendedVolume;
    bgmUnlocked = true;
    return;
  }

  playPromise.then(() => {
    audio.pause();
    audio.currentTime = 0;
    audio.volume = intendedVolume;
    bgmUnlocked = true;
  }).catch(() => {
    audio.volume = intendedVolume;
  });
};

const show = ({ playAudio = true } = {}) => {
  const element = ensureRoot();
  clearIntroTimer();
  clearSendTimers();
  resetSendClasses();
  document.body.classList.add(OVERLAY_ACTIVE_CLASS);
  element.classList.remove("is-form", "is-send", "is-reply");
  element.classList.add("is-visible");

  if (playAudio) {
    const audio = ensureBgm();
    audio.volume = BGM_VOLUME;
    const playPromise = audio.play();
    if (playPromise?.catch) {
      playPromise.catch(() => undefined);
    }
  }

  introTimer = window.setTimeout(() => {
    element.classList.add("is-form");
    const wishText = element.querySelector("#wish-text");
    if (wishText) {
      window.setTimeout(() => wishText.focus({ preventScroll: true }), 120);
    }
  }, 1900);

  window.dispatchEvent(new CustomEvent("santa:wish-overlay-shown"));
};

const hide = () => {
  if (!root) return;
  clearIntroTimer();
  clearSendTimers();
  resetSendClasses();
  root.classList.remove("is-visible", "is-form", "is-send", "is-reply");
  document.body.classList.remove(OVERLAY_ACTIVE_CLASS);
  if (bgm) bgm.pause();
};

window.SantaWishOverlay = {
  init: ensureRoot,
  unlockAudio,
  show,
  hide,
  getRoot,
};
