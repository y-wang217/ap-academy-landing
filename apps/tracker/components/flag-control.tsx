"use client";

import { useState, useTransition } from "react";
import { setAssessmentFlag } from "@/app/actions/student";
import type { AssessmentState } from "@/lib/domain/assessment-state";
import type { FlagReason } from "@/lib/data/schemas";
import { FLAG_LABEL, flagChoices } from "@/lib/view/flags";

const choice = "rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium disabled:opacity-50";

/**
 * A student's flag on one of their grades (ADR 0025). Fixed choices, no
 * typing. Shown as flagged only after the server confirms (non-negotiable 6).
 */
export function FlagControl({ assessmentId, state, reason, label }: { assessmentId: string; state: AssessmentState; reason: FlagReason | null; label: string }) {
  const [saved, setSaved] = useState<FlagReason | null>(reason);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const choices = flagChoices(state);
  if (choices.length === 0 && saved === null) return null;

  function save(next: FlagReason | null) {
    setError(null);
    startTransition(async () => {
      try {
        const r = await setAssessmentFlag(assessmentId, next);
        if (r.ok) {
          setSaved(next);
          setOpen(false);
        } else setError(r.error);
      } catch {
        setError("Not saved. Check your connection and try again.");
      }
    });
  }

  return (
    <span className="mt-1 flex flex-col gap-1">
      {saved !== null ? (
        <span className="text-xs text-warn">
          Flagged: {FLAG_LABEL[saved]}. Your tutor will check.{" "}
          <button type="button" disabled={pending} onClick={() => save(null)} className="font-medium underline underline-offset-2" aria-label={`Withdraw flag on ${label}`}>
            {pending ? "Saving..." : "Withdraw"}
          </button>
        </span>
      ) : open ? (
        <span className="flex flex-wrap items-center gap-2" role="group" aria-label={`Flag ${label}`}>
          {choices.map((c) => (
            <button key={c} type="button" disabled={pending} onClick={() => save(c)} className={choice}>
              {FLAG_LABEL[c]}
            </button>
          ))}
          <button type="button" disabled={pending} onClick={() => setOpen(false)} className="text-xs text-text-muted underline underline-offset-2">
            Cancel
          </button>
        </span>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="self-start text-xs text-text-muted underline underline-offset-2" aria-label={`Flag ${label}`}>
          Flag this
        </button>
      )}
      {error && (
        <span role="alert" className="text-xs text-error">
          {error}
        </span>
      )}
    </span>
  );
}
