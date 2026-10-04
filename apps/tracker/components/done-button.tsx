"use client";

import { useOptimistic, useState, useTransition } from "react";
import { setAssessmentDone, setTaskDone } from "@/app/actions/student";

/**
 * The student's one control. Optimistic, but a failed save rolls back and says
 * so (non-negotiable 6). Done never awards marks.
 */
export function DoneButton({ kind, id, done, label }: { kind: "assessment" | "task"; id: string; done: boolean; label: string }) {
  const [saved, setSaved] = useState(done);
  const [shown, setShown] = useOptimistic(saved);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function toggle() {
    const next = !shown;
    setError(null);
    startTransition(async () => {
      setShown(next);
      try {
        const r = await (kind === "assessment" ? setAssessmentDone(id, next) : setTaskDone(id, next));
        if (r.ok) setSaved(next);
        else setError(r.error);
      } catch {
        setError("Not saved. Check your connection and try again.");
      }
    });
  }

  return (
    <span className="flex shrink-0 flex-col items-end gap-1">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={shown}
        aria-label={`${shown ? "Done" : "Mark done"}: ${label}`}
        className={
          shown
            ? "min-w-[84px] rounded-full bg-ok px-4 py-2 text-sm font-semibold text-surface"
            : "min-w-[84px] rounded-full border border-border bg-surface px-4 py-2 text-sm font-semibold text-text-primary"
        }
      >
        {shown ? "Done" : "Mark done"}
      </button>
      {error && (
        <span role="alert" className="max-w-[180px] text-right text-xs text-error">
          {error}
        </span>
      )}
    </span>
  );
}
