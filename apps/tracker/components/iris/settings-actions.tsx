"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonClass, Notice, secondaryButtonClass } from "@/components/ui";
import { IRIS_TEXT, runSummaryText } from "@/lib/view/iris-text";

// fetch does not add the Next basePath, so it is spelled out (as in lib/scheduler/api-client.ts).
const API = "/tracker/api/iris";

type RunAnswer = { result: string; stored?: number; matched?: number; escalated?: number };

/**
 * Pause, Unpause and Run now on /iris/settings (REQ-42 AC27). Unpause stays
 * disabled until the tick; the server refuses it without the tick too. A
 * failed call shows the error line and keeps the old state.
 */
export function IrisSettingsActions({ paused }: { paused: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [ticked, setTicked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<RunAnswer | null>(null);

  async function save(next: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next ? { paused: true } : { paused: false, confirmed: true }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setTicked(false);
      router.refresh();
    } catch {
      setError(IRIS_TEXT.saveFailed);
    } finally {
      setBusy(false);
    }
  }

  async function runNow() {
    setBusy(true);
    setError(null);
    setRun(null);
    try {
      const res = await fetch(`${API}/run-now`, { method: "POST" });
      const body = (await res.json().catch(() => null)) as RunAnswer | null;
      if (!body?.result) throw new Error(String(res.status));
      setRun(body);
      router.refresh();
    } catch {
      setError(IRIS_TEXT.saveFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3" role="status" aria-live="polite">
      {paused ? (
        <div className="flex flex-col gap-2">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={ticked} onChange={(e) => setTicked(e.target.checked)} disabled={busy} />
            <span>{IRIS_TEXT.unpauseTick}</span>
          </label>
          <div>
            <button type="button" className={buttonClass} disabled={busy || !ticked} onClick={() => save(false)}>
              {IRIS_TEXT.unpause}
            </button>
          </div>
        </div>
      ) : (
        <div>
          <button type="button" className={secondaryButtonClass} disabled={busy} onClick={() => save(true)}>
            {IRIS_TEXT.pause}
          </button>
        </div>
      )}
      <div>
        <button type="button" className={secondaryButtonClass} disabled={busy} onClick={runNow}>
          {IRIS_TEXT.runNow}
        </button>
      </div>
      {run && (
        <p className="text-sm" data-run-result={run.result}>
          {run.result === "failed" ? IRIS_TEXT.runFailed : run.result === "ok" ? runSummaryText({ result: "ok", stored: run.stored ?? 0, matched: run.matched ?? 0, escalated: run.escalated ?? 0 }) : run.result}
        </p>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}
