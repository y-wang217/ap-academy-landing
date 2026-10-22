"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonClass, inputClass, Notice, secondaryButtonClass } from "@/components/ui";
import { IRIS_TEXT } from "@/lib/view/iris-text";

// fetch does not add the Next basePath, so it is spelled out (as in mark-handled.tsx).
const API = "/tracker/api/iris/drafts";

/**
 * The editor on the latest proposed draft (REQ-44 AC14): the body in a
 * textarea with the signature shown read-only below it, then Save edit,
 * Approve and Reject with a reason. Shows Saving..., then refreshes into the
 * new state; a failed save shows the error line and never a success state.
 */
export function DraftEditor({ id, version, body, signature }: { id: string; version: number; body: string; signature: string }) {
  const router = useRouter();
  const [text, setText] = useState(body);
  const [reason, setReason] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const changed = text.trim() !== body.trim();

  async function post(action: "approve" | "edit" | "reject", payload: unknown) {
    setState("saving");
    try {
      const res = await fetch(`${API}/${encodeURIComponent(id)}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(String(res.status));
      setState("idle");
      router.refresh();
    } catch {
      setState("error");
    }
  }

  const saving = state === "saving";
  return (
    <div className="flex flex-col gap-3" role="status" aria-live="polite" data-draft-editor={version}>
      <textarea
        rows={8}
        className={`${inputClass} text-sm`}
        value={text}
        maxLength={5000}
        onChange={(e) => setText(e.target.value)}
        aria-label={IRIS_TEXT.draft}
        data-draft-body
      />
      <div className="text-sm text-text-muted">
        <p>{IRIS_TEXT.signatureNote}</p>
        <pre className="whitespace-pre-wrap font-sans" data-signature>{signature}</pre>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" className={`${secondaryButtonClass} w-full sm:w-auto`} disabled={saving || !changed || text.trim().length === 0} onClick={() => post("edit", { version, body: text })}>
          {IRIS_TEXT.saveEdit}
        </button>
        <button type="button" className={`${buttonClass} w-full sm:w-auto`} disabled={saving || changed} onClick={() => post("approve", { version })}>
          {saving ? IRIS_TEXT.saving : IRIS_TEXT.approve}
        </button>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        {IRIS_TEXT.rejectReason}
        <input className={inputClass} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} data-reject-reason />
      </label>
      <button type="button" className={`${secondaryButtonClass} w-full sm:w-auto`} disabled={saving || reason.trim().length === 0} onClick={() => post("reject", { reason })}>
        {IRIS_TEXT.reject}
      </button>
      {state === "error" && <Notice tone="error">{IRIS_TEXT.saveFailed}</Notice>}
    </div>
  );
}
