"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { ConsoleMode } from "../../../lib/console/modes";
import { CHECKING, type SyncState } from "../../../lib/console/sync";
import { startSyncPoller, type Visibility } from "../../../lib/console/sync-poller";
import { ModeProvider } from "./mode-context";

const SyncContext = createContext<SyncState>(CHECKING);
export const useSync = () => useContext(SyncContext);

const documentVisibility: Visibility = {
  get hidden() {
    return document.visibilityState === "hidden";
  },
  subscribe(cb) {
    document.addEventListener("visibilitychange", cb);
    return () => document.removeEventListener("visibilitychange", cb);
  },
};

async function fetchHealth() {
  // basePath spelled out: a client fetch is not prefixed with /tracker.
  const res = await fetch("/tracker/api/console/health", { cache: "no-store" });
  const body: unknown = await res.json().catch(() => null);
  return { status: res.status, body };
}

/**
 * The console root (REQ-55 AC9): a thin wrapper around the pure poller in
 * lib/console/sync-poller.ts. It shares the sync state with the sync line and
 * the rail, and marks the root data-hidden while the tab is hidden so CSS
 * pauses the animations.
 */
export function ConsoleRoot({ initialMode, children }: { initialMode: ConsoleMode; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const [sync, setSync] = useState<SyncState>(CHECKING);
  useEffect(
    () =>
      startSyncPoller({
        fetchHealth,
        visibility: documentVisibility,
        onState: setSync,
        onHidden: (hidden) => root.current?.toggleAttribute("data-hidden", hidden),
      }),
    [],
  );
  return (
    <div ref={root} data-console="" className="console-root">
      <SyncContext.Provider value={sync}>
        <ModeProvider initial={initialMode}>{children}</ModeProvider>
      </SyncContext.Provider>
    </div>
  );
}
