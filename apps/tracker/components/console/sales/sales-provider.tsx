"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type Dispatch, type ReactNode } from "react";
import { initialSalesState, salesReducer, shouldRefreshOnSync, type SalesAction, type SalesState } from "../../../lib/console/sales-state";
import { SalesViewSchema, type SalesView } from "../../../lib/console/sales-view";
import { useSync } from "../shell/sync-provider";

type SalesContextValue = { state: SalesState; dispatch: Dispatch<SalesAction>; retry: () => void };
const SalesContext = createContext<SalesContextValue | null>(null);

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
 */
export function SalesProvider({ initial, children }: { initial: SalesView; children: ReactNode }) {
  const [state, dispatch] = useReducer(salesReducer, initial, initialSalesState);
  const sync = useSync();
  const seen = useRef<string | null>(null);
  const busy = useRef(false);

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

  const value = useMemo(() => ({ state, dispatch, retry: () => void refresh() }), [state, refresh]);
  return <SalesContext.Provider value={value}>{children}</SalesContext.Provider>;
}
