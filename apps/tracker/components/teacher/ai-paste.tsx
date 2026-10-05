"use client";

import { useRef, useState, useTransition } from "react";
import { confirmDraft, discardDraft, draftFromPaste, type DraftPreview } from "@/app/actions/ai";
import { buttonClass, inputClass, secondaryButtonClass } from "../ui";

type Preview = Extract<DraftPreview, { ok: true }>;

/**
 * AI paste, preview, confirm, save (ADR 0026). The draft changes nothing;
 * only "Save selected" writes, and only the ticked items. Success is shown
 * only after the server confirms (non-negotiable 6).
 */
export function AiPastePanel({ courseId, maxChars }: { courseId: string; maxChars: number }) {
  const [draft, setDraft] = useState<Preview | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function run(work: () => Promise<void>) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        await work();
      } catch {
        setError("Could not reach the server. Check your connection and try again.");
      }
    });
  }

  if (draft) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm">Check each change. Only ticked changes are saved. Nothing has been saved yet.</p>
        {draft.items.length === 0 ? (
          <p className="text-sm text-text-muted">No changes found in that text.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {draft.items.map((item) => (
              <li key={item.index} className="py-2">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 accent-accent"
                    checked={selected.has(item.index)}
                    onChange={(e) => {
                      const next = new Set(selected);
                      if (e.target.checked) next.add(item.index);
                      else next.delete(item.index);
                      setSelected(next);
                    }}
                  />
                  <span className="min-w-0">
                    <span className="block font-medium">{item.title}</span>
                    <span className="block text-sm text-text-muted">{item.detail}</span>
                    <span className="block text-sm">
                      {item.before !== null ? `${item.before} → ${item.after}` : item.after}
                    </span>
                    {item.source && <span className="block text-xs text-text-muted">From: &ldquo;{item.source}&rdquo;</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {draft.notes.length > 0 && (
          <div className="text-sm">
            <p className="font-medium">Not matched. Enter these by hand if they matter:</p>
            <ul className="list-disc pl-5 text-text-muted">
              {draft.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          {draft.items.length > 0 && (
            <button
              type="button"
              disabled={pending || selected.size === 0}
              className={buttonClass}
              onClick={() =>
                run(async () => {
                  const r = await confirmDraft(draft.draftId, [...selected]);
                  if (r.ok) {
                    setDraft(null);
                    setMessage(r.message ?? "Saved");
                    formRef.current?.reset();
                  } else setError(r.error);
                })
              }
            >
              {pending ? "Saving..." : `Save selected (${selected.size})`}
            </button>
          )}
          <button
            type="button"
            disabled={pending}
            className={secondaryButtonClass}
            onClick={() =>
              run(async () => {
                const r = await discardDraft(draft.draftId);
                if (r.ok) setDraft(null);
                else setError(r.error);
              })
            }
          >
            Discard
          </button>
          {error && <span role="alert" className="text-sm text-error">{error}</span>}
        </div>
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        run(async () => {
          const r = await draftFromPaste(courseId, form);
          if (r.ok) {
            setDraft(r);
            setSelected(new Set(r.items.map((i) => i.index)));
          } else setError(r.error);
        });
      }}
    >
      <label htmlFor={`paste-${courseId}`} className="text-sm">
        Paste marks or upcoming work from the school portal or an email. The AI drafts the changes; you check them before anything is saved.
      </label>
      <textarea id={`paste-${courseId}`} name="text" rows={6} maxLength={maxChars} className={`${inputClass} text-sm`} />
      <p className="text-xs text-text-muted">The student&apos;s name and email addresses are removed before the text is sent.</p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={secondaryButtonClass}>
          {pending ? "Drafting. This can take a minute..." : "Draft changes"}
        </button>
        <span aria-live="polite" className="text-sm">
          {message && <span className="text-ok">{message}</span>}
          {error && <span role="alert" className="text-error">{error}</span>}
        </span>
      </div>
    </form>
  );
}
