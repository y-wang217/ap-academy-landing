"use client";

import { useCallback, useEffect, useState } from "react";
import { POS_LABEL, buildQuestion, type QuizQuestion } from "../words";
import { useHydrated } from "../use-hydrated";
import { useSatUser } from "../use-sat-user";
import { logAttempt } from "./log-attempt";

type Score = { correct: number; answered: number };

export default function Quiz() {
  const hydrated = useHydrated();
  const { user } = useSatUser();
  // Lazy initialiser: the random question is picked once, on the client,
  // without a setState-in-effect cascade. Nothing derived from it is rendered
  // until `hydrated` flips true.
  const [question, setQuestion] = useState<QuizQuestion>(() => buildQuestion());
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState<Score>({ correct: 0, answered: 0 });

  const answer = useCallback(
    (id: number) => {
      if (picked !== null) return;
      setPicked(id);
      const wasCorrect = id === question.word.id;
      setScore((s) => ({
        correct: s.correct + (wasCorrect ? 1 : 0),
        answered: s.answered + 1,
      }));
      if (user) {
        logAttempt(user.id, question.word.id, wasCorrect);
      }
    },
    [picked, question, user]
  );

  const advance = useCallback(() => {
    if (picked === null) return;
    setPicked(null);
    setQuestion((current) => buildQuestion(current.word));
  }, [picked]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!hydrated) return;
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "BUTTON" && event.key !== "Enter") return;

      if (picked === null) {
        const index = Number.parseInt(event.key, 10);
        if (index >= 1 && index <= question.options.length) {
          event.preventDefault();
          answer(question.options[index - 1].id);
        }
        return;
      }
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        advance();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [answer, advance, hydrated, picked, question]);

  // The question is randomised per client, so it can't be part of the static
  // HTML without a hydration mismatch. Hold the frame until hydration lands.
  if (!hydrated) {
    return (
      <div
        aria-hidden="true"
        className="mx-auto flex w-full max-w-[640px] flex-1 flex-col justify-center gap-6 px-5 py-10"
      >
        <div className="h-[104px] rounded-xl border border-sat-chalk-faint bg-sat-chalk/[0.04]" />
        <div className="flex flex-col gap-2.5">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-[52px] rounded-lg border border-sat-chalk-faint"
            />
          ))}
        </div>
      </div>
    );
  }

  const progress =
    score.answered > 0 ? `${score.correct}/${score.answered} correct` : "";

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-1 flex-col justify-center gap-6 px-5 py-10">
      <header className="text-center">
        <h1 className="font-sat-display text-[clamp(1.3rem,3vw,1.7rem)] font-semibold tracking-[0.02em]">
          Quiz
        </h1>
        <p className="mt-1.5 text-[12.5px] tracking-[0.04em] text-sat-chalk-dim">
          {user
            ? progress || "Your answers are being saved"
            : progress || "Four definitions, one word"}
        </p>
      </header>

      <div className="rounded-xl border border-sat-chalk-faint bg-sat-chalk/[0.04] px-6 py-7 text-center">
        <p className="text-[11px] uppercase tracking-[0.14em] text-sat-chalk-dim">
          {POS_LABEL[question.word.pos]}
        </p>
        <p className="font-sat-display mt-2 text-[clamp(1.9rem,6vw,2.8rem)] font-bold leading-[1.1]">
          {question.word.word}
        </p>
      </div>

      <ul className="flex flex-col gap-2.5">
        {question.options.map((option, index) => {
          const isCorrect = option.id === question.word.id;
          const isPicked = option.id === picked;
          const revealed = picked !== null;

          let tone = "border-sat-chalk-faint hover:border-sat-chalk-dim";
          if (revealed && isCorrect) {
            tone = "border-sat-correct bg-sat-correct/15";
          } else if (revealed && isPicked) {
            tone = "border-sat-accent bg-sat-accent/15";
          } else if (revealed) {
            tone = "border-sat-chalk-faint opacity-55";
          }

          return (
            <li key={option.id}>
              <button
                type="button"
                onClick={() => answer(option.id)}
                disabled={revealed}
                className={`flex w-full items-start gap-3 rounded-lg border px-4 py-3.5 text-left text-[15px] leading-snug transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sat-chalk disabled:cursor-default ${tone}`}
              >
                <span className="mt-px shrink-0 text-[12px] font-semibold tabular-nums text-sat-chalk-dim">
                  {index + 1}
                </span>
                <span>{option.definition}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="flex min-h-[52px] items-center justify-center gap-4">
        {picked !== null && (
          <>
            <span
              role="status"
              className={`text-[13px] font-semibold uppercase tracking-[0.08em] ${
                picked === question.word.id ? "text-sat-correct" : "text-sat-accent"
              }`}
            >
              {picked === question.word.id ? "Correct" : "Not quite"}
            </span>
            <button
              type="button"
              onClick={advance}
              autoFocus
              className="rounded-full border-[1.5px] border-sat-chalk-dim px-6 py-2.5 text-[13px] font-semibold uppercase tracking-[0.06em] text-sat-chalk transition-colors hover:border-sat-chalk hover:bg-sat-chalk/10 focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-sat-chalk"
            >
              Next →
            </button>
          </>
        )}
      </div>

      <p className="text-center text-[11.5px] tracking-[0.04em] text-sat-chalk-dim">
        <kbd className="rounded border border-sat-chalk-dim px-1.5 py-px">1</kbd>–
        <kbd className="rounded border border-sat-chalk-dim px-1.5 py-px">4</kbd>{" "}
        answer ·{" "}
        <kbd className="rounded border border-sat-chalk-dim px-1.5 py-px">Space</kbd>{" "}
        next
      </p>
    </div>
  );
}
