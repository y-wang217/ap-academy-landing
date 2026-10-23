"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonClass, Notice, secondaryButtonClass } from "@/components/ui";
import { EVAL_TEXT, IRIS_TEXT } from "@/lib/view/iris-text";

// fetch does not add the Next basePath, so it is spelled out (as in settings-actions.tsx).
const API = "/tracker/api/iris";

type Action = "import" | "run" | "record" | "run-now";

/**
 * Import history, Run evaluation, Record results and Run now on /iris/eval
 * (REQ-45 AC4, AC6, AC8). A request only records an event; the next poll run
 * does the work, and Run now starts one. A failed call shows the error line
 * and never a success state.
 */
export function EvalActions({ canImport, canRun, recordRequestId }: { canImport: boolean; canRun: boolean; recordRequestId: number | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState(false);
  const [done, setDone] = useState<Action | null>(null);

  async function call(action: Action) {
    setBusy(action);
    setError(false);
    setDone(null);
    try {
      const path = action === "import" ? "eval/import" : action === "run" ? "eval/run" : action === "record" ? "eval/record" : "run-now";
      const res = await fetch(`${API}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: action === "record" ? JSON.stringify({ requestId: recordRequestId }) : undefined,
      });
      if (!res.ok) throw new Error(String(res.status));
      setDone(action);
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(null);
    }
  }

  const label = (a: Action, text: string) => (busy === a ? IRIS_TEXT.saving : text);
  return (
    <div className="flex flex-col gap-2" role="status" aria-live="polite">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <button type="button" className={`${buttonClass} w-full sm:w-auto`} disabled={busy !== null || !canImport} onClick={() => call("import")} data-eval-import>
          {label("import", EVAL_TEXT.importHistory)}
        </button>
        <button type="button" className={`${buttonClass} w-full sm:w-auto`} disabled={busy !== null || !canRun} onClick={() => call("run")} data-eval-run>
          {label("run", EVAL_TEXT.runEvaluation)}
        </button>
        <button type="button" className={`${secondaryButtonClass} w-full sm:w-auto`} disabled={busy !== null || recordRequestId === null} onClick={() => call("record")} data-eval-record>
          {label("record", EVAL_TEXT.recordResults)}
        </button>
        <button type="button" className={`${secondaryButtonClass} w-full sm:w-auto`} disabled={busy !== null} onClick={() => call("run-now")} data-eval-run-now>
          {label("run-now", EVAL_TEXT.runNow)}
        </button>
      </div>
      {(done === "import" || done === "run") && <p className="text-sm" data-eval-requested>{EVAL_TEXT.requested}</p>}
      {error && <Notice tone="error">{IRIS_TEXT.saveFailed}</Notice>}
    </div>
  );
}
