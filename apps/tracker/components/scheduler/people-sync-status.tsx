"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/scheduler/api-client";
import { Notice, secondaryButtonClass } from "@/components/ui";
import { peopleSyncLine, type SyncRunsView } from "@/lib/view/people-freshness";

type SyncNowReply = SyncRunsView & { result: "ok" | "failed" };

/**
 * Charlie's line under the daily task status (REQ-38 AC15): when names were
 * last synced, and Sync now. A failed tap shows an error and never claims
 * success; a success refreshes the page so every name follows.
 */
export function PeopleSyncStatus({ initial }: { initial: SyncRunsView }) {
  const router = useRouter();
  const [runs, setRuns] = useState<SyncRunsView>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function syncNow() {
    setBusy(true);
    setError(null);
    const r = await api.send<SyncNowReply>("POST", "/people/sync", "people-sync");
    setBusy(false);
    if (!r.ok) {
      return setError(r.error === "too_soon" ? "A sync just ran. Try again in a minute." : "Names could not be synced. Try again.");
    }
    setRuns({ lastOk: r.data.lastOk, lastFailure: r.data.lastFailure });
    if (r.data.result === "failed") return setError("Names could not be synced. Try again.");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2" role="status" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm">{peopleSyncLine(runs, new Date())}</p>
        <button type="button" className={secondaryButtonClass} disabled={busy} onClick={syncNow}>
          {busy ? "Syncing…" : "Sync now"}
        </button>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}
