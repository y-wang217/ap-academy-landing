"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Notice, secondaryButtonClass } from "@/components/ui";
import { IRIS_TEXT } from "@/lib/view/iris-text";

// fetch does not add the Next basePath, so it is spelled out (as in draft-editor.tsx).
const API = "/tracker/api/iris/sends";

/**
 * Retry on a failed send (REQ-48 AC6). Shows Retrying..., then refreshes into
 * the state the row now holds; a failed request shows the error line and never
 * a success state (tracker rule 6).
 */
export function RetrySend({ sendId }: { sendId: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");

  async function retry() {
    setState("saving");
    try {
      const res = await fetch(`${API}/${encodeURIComponent(sendId)}/retry`, { method: "POST" });
      if (!res.ok) throw new Error(String(res.status));
      setState("idle");
      router.refresh();
    } catch {
      setState("error");
    }
  }

  return (
    <div className="flex flex-col gap-2" role="status" aria-live="polite">
      <div>
        <button type="button" className={`${secondaryButtonClass} w-full sm:w-auto`} disabled={state === "saving"} onClick={retry} data-retry-send={sendId}>
          {state === "saving" ? IRIS_TEXT.retrying : IRIS_TEXT.retry}
        </button>
      </div>
      {state === "error" && <Notice tone="error">{IRIS_TEXT.saveFailed}</Notice>}
    </div>
  );
}
