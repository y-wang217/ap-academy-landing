"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/scheduler/api-client";
import { buttonClass, Notice, secondaryButtonClass } from "@/components/ui";

export type DailyTaskView = { state: "none" | "pending" | "ready" | "failed"; pageUrl: string | null };

/**
 * One line above Charlie's calendar: is today's "Text teachers their
 * schedules" task in Notion? Create now, Refresh now and Retry all post the
 * same request; the server decides what that means. The link to Notion is a
 * plain anchor (it leaves the app).
 */
export function DailyTaskStatus({ date, time, initial }: { date: string; time: string; initial: DailyTaskView }) {
  const router = useRouter();
  const [view, setView] = useState<DailyTaskView>(initial);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function run() {
    setBusy(true);
    setFailed(false);
    const r = await api.send<{ result: string; status: DailyTaskView }>("POST", "/daily-task", `daily-task:${date}`, { date });
    setBusy(false);
    if (!r.ok) return setFailed(true);
    setView(r.data.status);
    setFailed(r.data.result === "failed");
    router.refresh();
  }

  const bad = failed || view.state === "failed";
  return (
    <div className="flex flex-col gap-2" role="status" aria-live="polite">
      {bad ? (
        <Notice tone="error">Today&apos;s Notion task could not be updated.</Notice>
      ) : view.state === "ready" ? (
        <p className="text-sm">
          Today&apos;s Notion task is ready.{" "}
          {view.pageUrl && <a className="underline" href={view.pageUrl} target="_blank" rel="noreferrer">Open in Notion</a>}
        </p>
      ) : (
        <p className="text-sm">Today&apos;s Notion task is created at {time}.</p>
      )}
      <div>
        <button type="button" className={bad || view.state === "ready" ? secondaryButtonClass : buttonClass} disabled={busy} onClick={run}>
          {busy ? "Working…" : bad ? "Retry" : view.state === "ready" ? "Refresh now" : "Create now"}
        </button>
      </div>
    </div>
  );
}
