const LETTER_TRANSITION_MS = 500;
const STYLE_ID = "santa-performance-sequence-style";
const LETTER_ID = "santa-letter-transition";

const installStyles = () => {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${LETTER_ID} {
      position: fixed;
      inset: 0;
      z-index: 998;
      overflow: hidden;
      pointer-events: none;
    }

    #${LETTER_ID} .santa-letter-paper {
      position: absolute;
      left: 50%;
      top: 58%;
      width: min(32vw, 132px);
      aspect-ratio: .72;
      border: 2px solid rgba(137, 72, 24, .48);
      border-radius: 8px;
      opacity: 0;
      background:
        linear-gradient(135deg, transparent 48%, rgba(146, 91, 38, .16) 49% 51%, transparent 52%),
        linear-gradient(45deg, transparent 48%, rgba(146, 91, 38, .13) 49% 51%, transparent 52%),
        linear-gradient(155deg, #fff8d9, #eed39c);
      box-shadow:
        0 0 24px rgba(255, 203, 77, .95),
        0 14px 34px rgba(40, 12, 0, .36);
      transform: translate(-50%, -50%) scale(.12) rotate(-13deg);
      transform-origin: center;
      transition:
        transform ${LETTER_TRANSITION_MS}ms cubic-bezier(.18, .86, .27, 1),
        opacity 80ms linear;
      will-change: transform, opacity;
    }

    #${LETTER_ID} .santa-letter-paper::before,
    #${LETTER_ID} .santa-letter-paper::after {
      content: "";
      position: absolute;
      left: 14%;
      right: 14%;
      height: 2px;
      border-radius: 2px;
      background: rgba(139, 76, 32, .32);
      box-shadow:
        0 10px rgba(139, 76, 32, .24),
        0 20px rgba(139, 76, 32, .18);
    }

    #${LETTER_ID} .santa-letter-paper::before {
      top: 30%;
    }

    #${LETTER_ID} .santa-letter-paper::after {
      top: 62%;
      right: 36%;
    }

    #${LETTER_ID}.is-flying .santa-letter-paper {
      opacity: 1;
      transform: translate(-50%, -50%) translate(7vw, -13vh) scale(1) rotate(2deg);
    }

    #${LETTER_ID}.is-handoff {
      opacity: 0;
      transition: opacity 160ms ease-out;
    }

    @media (prefers-reduced-motion: reduce) {
      #${LETTER_ID} .santa-letter-paper {
        transition-duration: 1ms;
      }
    }
  `;
  document.head.appendChild(style);
};

export const createSantaPerformanceSequence = () => {
  installStyles();

  let letterElement = null;
  const removeLetter = () => {
    letterElement?.remove();
    letterElement = null;
  };

  const startLetterFlight = () => {
    removeLetter();

    letterElement = document.createElement("div");
    letterElement.id = LETTER_ID;
    letterElement.setAttribute("aria-hidden", "true");
    letterElement.innerHTML = '<div class="santa-letter-paper"></div>';
    document.body.appendChild(letterElement);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => letterElement?.classList.add("is-flying"));
    });

    window.dispatchEvent(new CustomEvent("christmas-ar:letter-start"));
  };

  const finishLetterFlight = () => {
    if (!letterElement) return;
    letterElement.classList.add("is-handoff");
    window.setTimeout(removeLetter, 180);
  };

  const reset = () => {
    removeLetter();
  };

  return {
    startLetterFlight,
    finishLetterFlight,
    reset,
  };
};
