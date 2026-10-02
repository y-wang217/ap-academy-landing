"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { POS_LABEL, WORDS, randomWord, type SatWord } from "./words";
import { useHydrated } from "./use-hydrated";

export default function Flashcards() {
  const hydrated = useHydrated();
  const [randomised, setWord] = useState<SatWord>(randomWord);
  // Before hydration, render a fixed word so the static HTML shows a real card
  // and the first client render matches it. The random draw takes over after.
  const word = hydrated ? randomised : WORDS[0];
  const [flipped, setFlipped] = useState(false);
  const [instant, setInstant] = useState(false);
  const [seen, setSeen] = useState(1);
  const cardRef = useRef<HTMLDivElement>(null);

  const nextWord = useCallback(() => {
    // Snap the card back to its front face with no animation, so the previous
    // definition never flashes while the new word swaps in.
    setInstant(true);
    setFlipped(false);
    setWord((current) => randomWord(current));
    setSeen((count) => count + 1);
  }, []);

  // Re-enable the flip transition once the instant reset has painted.
  useEffect(() => {
    if (!instant) return;
    const frame = requestAnimationFrame(() => setInstant(false));
    return () => cancelAnimationFrame(frame);
  }, [instant]);

  const flip = useCallback(() => setFlipped((f) => !f), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      // Let the card and buttons handle their own Space/Enter activation.
      if (target && (target === cardRef.current || target.tagName === "BUTTON")) {
        return;
      }
      if (event.key === " ") {
        event.preventDefault();
        flip();
      } else if (event.key.toLowerCase() === "n") {
        nextWord();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [flip, nextWord]);

  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-1 flex-col items-center justify-center gap-7 px-5 py-10">
      <header className="text-center">
        <h1 className="font-sat-display text-[clamp(1.4rem,3vw,1.8rem)] font-semibold tracking-[0.02em]">
          SAT Flashcards
        </h1>
        <p className="mt-1.5 text-[13px] tracking-[0.04em] text-sat-chalk-dim">
          Tap the card to flip · {WORDS.length} SAT words · free, no sign-up
        </p>
      </header>

      <div className="sat-scene w-full max-w-[560px]">
        <div
          ref={cardRef}
          role="button"
          tabIndex={0}
          aria-pressed={flipped}
          aria-label={
            flipped
              ? `Definition of ${word.word}. Activate to hide.`
              : `Flashcard: ${word.word}. Activate to reveal the definition.`
          }
          onClick={flip}
          onKeyDown={(event) => {
            if (event.key === " " || event.key === "Enter") {
              event.preventDefault();
              flip();
            }
          }}
          className={`sat-card aspect-[5/3] w-full cursor-pointer rounded-[10px] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sat-chalk ${
            flipped ? "is-flipped" : ""
          } ${instant ? "is-instant" : ""}`}
        >
          <div className="sat-face flex flex-col items-center justify-center rounded-[10px] px-10 pb-8 pt-12 text-center text-sat-ink shadow-[0_18px_40px_rgba(0,0,0,0.4),0_2px_6px_rgba(0,0,0,0.25)]">
            <span className="absolute right-[18px] top-[14px] text-[11px] font-semibold uppercase tracking-[0.14em] text-sat-ink-faint">
              Word
            </span>
            <div className="font-sat-display text-[clamp(2.2rem,7vw,3.6rem)] font-bold leading-[1.05]">
              {word.word}
            </div>
            <div className="mt-3.5 text-[12px] uppercase tracking-[0.1em] text-sat-ink-faint">
              click to reveal
            </div>
          </div>

          <div className="sat-face sat-face-back flex flex-col items-center justify-center rounded-[10px] px-10 pb-8 pt-12 text-center text-sat-ink shadow-[0_18px_40px_rgba(0,0,0,0.4),0_2px_6px_rgba(0,0,0,0.25)]">
            <span className="absolute right-[18px] top-[14px] text-[11px] font-semibold uppercase tracking-[0.14em] text-sat-ink-faint">
              Definition
            </span>
            <div className="font-sat-display mb-3.5 text-[1.1rem] font-semibold text-sat-ink-soft">
              {word.word}
            </div>
            <p className="max-w-[44ch] text-[clamp(1.05rem,2.6vw,1.35rem)] leading-[1.55]">
              <span className="mr-[0.4em] font-semibold italic text-sat-accent">
                ({POS_LABEL[word.pos]})
              </span>
              {word.definition}
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-5">
        <button
          type="button"
          onClick={nextWord}
          className="rounded-full border-[1.5px] border-sat-chalk-dim px-7 py-3 text-[13px] font-semibold uppercase tracking-[0.06em] text-sat-chalk transition-colors hover:border-sat-chalk hover:bg-sat-chalk/10 focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-sat-chalk"
        >
          New word
        </button>
        <span className="text-[12px] tracking-[0.05em] text-sat-chalk-dim">
          {seen} seen
        </span>
      </div>

      <p className="text-center text-[11.5px] tracking-[0.04em] text-sat-chalk-dim">
        <kbd className="rounded border border-sat-chalk-dim px-1.5 py-px">Space</kbd>{" "}
        flip ·{" "}
        <kbd className="rounded border border-sat-chalk-dim px-1.5 py-px">N</kbd>{" "}
        new word
      </p>

      <Link
        href="/sat/quiz"
        className="rounded-full bg-sat-accent px-7 py-3 text-[13px] font-semibold uppercase tracking-[0.06em] text-sat-card transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-sat-chalk"
      >
        Test yourself →
      </Link>
    </div>
  );
}
