"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonClass, inputClass, Notice, secondaryButtonClass } from "@/components/ui";
import { EVAL_TEXT, IRIS_TEXT, intentLabel } from "@/lib/view/iris-text";

// fetch does not add the Next basePath, so it is spelled out (as in mark-handled.tsx).
const API = "/tracker/api/iris/eval/labels";

export type LabelValue = { goldIntent: string | null; goldReplyType: string | null; goldEscalate: boolean | null; note: string | null };

/**
 * Gold labels for one imported message (REQ-45 AC5). Escalate yes needs reply
 * type None, checked here and refused by the server too. A failed save keeps
 * the input and shows the error line; success shows Saved.
 */
export function EvalLabelForm({ id, initial, intents, replyTypes }: { id: string; initial: LabelValue | null; intents: readonly string[]; replyTypes: readonly string[] }) {
  const router = useRouter();
  const [intent, setIntent] = useState(initial?.goldIntent ?? "");
  const [replyType, setReplyType] = useState(initial?.goldReplyType ?? "");
  const [escalate, setEscalate] = useState<boolean | null>(initial?.goldEscalate ?? null);
  const [note, setNote] = useState(initial?.note ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const conflict = escalate === true && replyType !== "";
  const ready = intent !== "" && escalate !== null && !conflict;

  async function save() {
    setState("saving");
    try {
      const res = await fetch(`${API}/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goldIntent: intent, goldReplyType: replyType || null, goldEscalate: escalate, ...(note.trim() ? { note: note.trim() } : {}) }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setState("saved");
      router.refresh();
    } catch {
      setState("error");
    }
  }

  return (
    <div className="flex flex-col gap-2" role="status" aria-live="polite" data-eval-label-form={id}>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          {EVAL_TEXT.goldIntent}
          <select className={inputClass} value={intent} onChange={(e) => setIntent(e.target.value)} data-gold-intent>
            <option value="">-</option>
            {intents.map((i) => <option key={i} value={i}>{intentLabel(i)}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {EVAL_TEXT.goldReplyType}
          <select className={inputClass} value={replyType} onChange={(e) => setReplyType(e.target.value)} data-gold-reply-type>
            <option value="">{EVAL_TEXT.none}</option>
            {replyTypes.map((t) => <option key={t} value={t}>{intentLabel(t)}</option>)}
          </select>
        </label>
      </div>
      <fieldset className="flex items-center gap-4 text-sm">
        <legend className="mb-1">{EVAL_TEXT.escalate}</legend>
        <label className="flex items-center gap-1">
          <input type="radio" name={`escalate-${id}`} checked={escalate === true} onChange={() => setEscalate(true)} data-gold-escalate="yes" /> {EVAL_TEXT.yes}
        </label>
        <label className="flex items-center gap-1">
          <input type="radio" name={`escalate-${id}`} checked={escalate === false} onChange={() => setEscalate(false)} data-gold-escalate="no" /> {EVAL_TEXT.no}
        </label>
      </fieldset>
      <label className="flex flex-col gap-1 text-sm">
        {EVAL_TEXT.note}
        <input className={inputClass} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} data-gold-note />
      </label>
      {conflict && <p className="text-sm text-error">{EVAL_TEXT.escalateWithType}</p>}
      <div>
        <button type="button" className={`${buttonClass} w-full sm:w-auto`} disabled={state === "saving" || !ready} onClick={save} data-eval-save-label>
          {state === "saving" ? IRIS_TEXT.saving : EVAL_TEXT.save}
        </button>
      </div>
      {state === "saved" && <p className="text-sm font-medium" data-eval-saved>{EVAL_TEXT.saved}</p>}
      {state === "error" && <Notice tone="error">{IRIS_TEXT.saveFailed}</Notice>}
    </div>
  );
}

/** A 1 to 5 rating of one eval draft (REQ-45 AC7), tied to its result id. */
export function EvalRating({ id, resultId, initial }: { id: string; resultId: string; initial: number | null }) {
  const router = useRouter();
  const [rating, setRating] = useState<number | null>(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function save() {
    setState("saving");
    try {
      const res = await fetch(`${API}/${encodeURIComponent(id)}/rating`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resultId, rating }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setState("saved");
      router.refresh();
    } catch {
      setState("error");
    }
  }

  return (
    <div className="flex flex-col gap-2" role="status" aria-live="polite" data-eval-rating={id}>
      <fieldset className="flex flex-wrap items-center gap-3 text-sm">
        <legend className="mb-1">{EVAL_TEXT.rating} <span className="text-text-muted">({EVAL_TEXT.ratingHint})</span></legend>
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="flex items-center gap-1">
            <input type="radio" name={`rating-${id}`} checked={rating === n} onChange={() => setRating(n)} data-rating={n} /> {n}
          </label>
        ))}
      </fieldset>
      <div>
        <button type="button" className={`${secondaryButtonClass} w-full sm:w-auto`} disabled={state === "saving" || rating === null} onClick={save} data-eval-save-rating>
          {state === "saving" ? IRIS_TEXT.saving : EVAL_TEXT.saveRating}
        </button>
      </div>
      {state === "saved" && <p className="text-sm font-medium" data-eval-rating-saved>{EVAL_TEXT.saved}</p>}
      {state === "error" && <Notice tone="error">{IRIS_TEXT.saveFailed}</Notice>}
    </div>
  );
}
