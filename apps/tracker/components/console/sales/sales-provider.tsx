"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type Dispatch, type ReactNode } from "react";
import type { FormInput, FormStatus } from "../../../lib/console/outcome-client";
import { initialSalesState, salesReducer, shouldRefreshOnSync, type SalesAction, type SalesState } from "../../../lib/console/sales-state";
import { SalesViewSchema, type SalesView } from "../../../lib/console/sales-view";
import { useSync } from "../shell/sync-provider";

/** One lead's outcome form between renders (REQ-61): kept in memory so an unconfirmed save survives selecting another lead. */
export type OutcomeDraft = { input: FormInput; requestId: string | null; status: FormStatus };
type SalesContextValue = {
  state: SalesState;
  dispatch: Dispatch<SalesAction>;
  retry: () => void;
  /** Re-reads the queue; resolves when the read is done. */
  refresh: () => Promise<void>;
  /** After a logged outcome: re-read, then select the next lead (REQ-61 AC11). */
  advance: (loggedId: string) => Promise<void>;
  drafts: Map<string, OutcomeDraft>;
};
const SalesContext = createContext<SalesContextValue | null>(null);

/** The sales context when the console has a sales view, else null (REQ-62: the signal band works without one). */
export const useOptionalSales = (): SalesContextValue | null => useContext(SalesContext);

export function useSales(): SalesContextValue {
  const value = useContext(SalesContext);
  if (!value) throw new Error("useSales outside SalesProvider");
  return value;
}

/**
 * The Sales queue's state (REQ-57, tracker ADR 0071), seeded with the
 * server's view. It refreshes from GET /api/console/sales in step with the
 * existing health poll, or on Retry, one request at a time. The last good
 * queue lives only in this React state: no browser storage, no server cache.
 * `lead` is ?lead= (REQ-62), preselected when it is in the queue.
 */
export function SalesProvider({ initial, lead = null, children }: { initial: SalesView; lead?: string | null; children: ReactNode }) {
  const [state, dispatch] = useReducer(salesReducer, initial, (view) => initialSalesState(view, lead));
  const sync = useSync();
  const seen = useRef<string | null>(null);
  const busy = useRef(false);
  // One Map for the provider's life, written by the forms' event handlers only.
  const [drafts] = useState(() => new Map<string, OutcomeDraft>());

  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    dispatch({ type: "refreshStart" });
    const failed = (message: string) => dispatch({ type: "refreshFailed", message, at: new Date().toISOString() });
    try {
      // basePath spelled out: a client fetch is not prefixed with /tracker.
      const res = await fetch("/tracker/api/console/sales", { cache: "no-store" });
      if (!res.ok) return failed(`HTTP ${res.status}`);
      const parsed = SalesViewSchema.safeParse(await res.json().catch(() => null));
      if (!parsed.success) return failed("Unexpected response");
      dispatch({ type: "refreshOk", view: parsed.data as SalesView, at: new Date().toISOString() });
    } catch {
      failed("Network error");
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    const next = shouldRefreshOnSync(seen.current, sync);
    seen.current = next.seen;
    if (next.refresh) void refresh();
  }, [sync, refresh]);

  const advance = useCallback(async (loggedId: string) => {
    await refresh();
    dispatch({ type: "advance", loggedId });
  }, [refresh]);

  const value = useMemo(() => ({ state, dispatch, retry: () => void refresh(), refresh, advance, drafts }), [state, refresh, advance, drafts]);
  return <SalesContext.Provider value={value}>{children}</SalesContext.Provider>;
}
