"use client";
import { useState, useEffect, useRef } from "react";

interface Options {
  phrases:          string[];
  typingSpeed?:     number; // ms per character
  deleteSpeed?:     number;
  pauseAfter?:      number; // pause after full phrase typed
  pauseAfterDelete?: number; // pause before typing next phrase
}

export function useTypewriter({
  phrases,
  typingSpeed      = 85,
  deleteSpeed      = 42,
  pauseAfter       = 2600,
  pauseAfterDelete = 480,
}: Options) {
  const [displayText, setDisplayText] = useState("");

  const state = useRef({
    phraseIdx:  0,
    charIdx:    0,
    isDeleting: false,
  });

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      const { phraseIdx, charIdx, isDeleting } = state.current;
      const current = phrases[phraseIdx];

      if (!isDeleting) {
        // ── Typing forward ──────────────────────────────────────────────
        const next = current.slice(0, charIdx + 1);
        setDisplayText(next);

        if (charIdx + 1 >= current.length) {
          // Fully typed — pause, then start deleting
          state.current = { ...state.current, charIdx: current.length };
          timer = setTimeout(() => {
            state.current = { ...state.current, isDeleting: true };
            tick();
          }, pauseAfter);
        } else {
          state.current = { ...state.current, charIdx: charIdx + 1 };
          timer = setTimeout(tick, typingSpeed);
        }
      } else {
        // ── Deleting ────────────────────────────────────────────────────
        const next = current.slice(0, charIdx - 1);
        setDisplayText(next);

        if (charIdx - 1 <= 0) {
          // Fully deleted — move to next phrase, pause, then type
          const nextIdx = (phraseIdx + 1) % phrases.length;
          state.current = { phraseIdx: nextIdx, charIdx: 0, isDeleting: false };
          timer = setTimeout(tick, pauseAfterDelete);
        } else {
          state.current = { ...state.current, charIdx: charIdx - 1 };
          timer = setTimeout(tick, deleteSpeed);
        }
      }
    };

    // Kick off after a short initial delay
    timer = setTimeout(tick, 400);
    return () => clearTimeout(timer);
  }, []); // intentionally empty — loop is self-managed via refs

  return { displayText };
}