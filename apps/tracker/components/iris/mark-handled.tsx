"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonClass, Notice } from "@/components/ui";
import { IRIS_TEXT } from "@/lib/view/iris-text";

// fetch does not add the Next basePath, so it is spelled out (as in settings-actions.tsx).
const API = "/tracker/api/iris/messages";

/**
 * Mark handled on an escalated message (REQ-43 AC15). Shows Saving..., then
 * Handled; a failed save shows the error line and never shows success. A 409
 * means it was already handled, which is the state the owner wanted.
 */
export function MarkHandled({ id }: { id: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");

  async function save() {
    setState("saving");
    try {
      const res = await fetch(`${API}/${encodeURIComponent(id)}/handled`, { method: "POST" });
      if (!res.ok && res.status !== 409) throw new Error(String(res.status));
      setState("done");
      router.refresh();
    } catch {
      setState("error");
    }
  }

  return (
    <div className="flex flex-col gap-2" role="status" aria-live="polite">
      {state === "done" ? (
        <p className="text-sm font-medium" data-handled>{IRIS_TEXT.handled}</p>
      ) : (
        <div>
          <button type="button" className={buttonClass} disabled={state === "saving"} onClick={save}>
            {state === "saving" ? IRIS_TEXT.saving : IRIS_TEXT.markHandled}
          </button>
        </div>
      )}
      {state === "error" && <Notice tone="error">{IRIS_TEXT.saveFailed}</Notice>}
    </div>
  );
}
