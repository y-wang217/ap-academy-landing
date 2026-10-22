"use client";

import { syncLabel, type SyncState } from "../../../lib/console/sync";
import { useSync } from "./sync-provider";

export const syncTone = (state: SyncState) => (state.kind === "ok" ? "ok" : state.kind === "checking" ? "muted" : "bad");

/** The header's sync status: what the health check answered, never a default all-clear (REQ-55 AC9). */
export function SyncLine() {
  const sync = useSync();
  return (
    <p data-sync-line="" className="console-sync">
      <span className="console-dot" data-tone={syncTone(sync)} aria-hidden="true" />
      {syncLabel(sync)}
    </p>
  );
}
