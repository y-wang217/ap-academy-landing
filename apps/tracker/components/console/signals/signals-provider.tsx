"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from "react";
import { shouldRefreshOnSync } from "../../../lib/console/sales-state";
import { SignalsViewSchema, type HealthEntry, type Signal, type SignalsView } from "../../../lib/console/signals";
import {
  bandOf, deferredOf, exceptionsOf, healthOf, initialSignalsState, isProtected, memoryKey, readMemory, signalsReducer, snoozeOptions, writeMemory,
  type SignalsState, type StorageLike,
} from "../../../lib/console/signals-state";
import { useSync } from "../shell/sync-provider";

type SignalsContextValue = {
  state: SignalsState;
  now: string;
  protectedNow: boolean;
  band: Signal[];
  deferred: (Signal & { until: string | null })[];
  exceptions: Signal[];
  health: HealthEntry[];
  snoozeOptions: { label: string; until: string }[];
  memoryOnly: boolean;
  ack(signalKey: string): void;
  snooze(signalKey: string, until: string): void;
  dismiss(signalKey: string): void;
  showNow(signalKey: string): void;
  setQuiet(quiet: boolean): void;
};
const SignalsContext = createContext<SignalsContextValue | null>(null);

/** The signals context when the console has a signals view, else null. */
export const useOptionalSignals = (): SignalsContextValue | null => useContext(SignalsContext);
export function useSignals(): SignalsContextValue {
  const value = useContext(SignalsContext);
  if (!value) throw new Error("useSignals outside SignalsProvider");
  return value;
}

const EMPTY_MEMORY = { local: { watermark: null, acked: {}, announced: [], snoozed: {} }, session: { quiet: false, dismissed: {} }, memoryOnly: false };
const local = (): StorageLike => window.localStorage;
const session = (): StorageLike => window.sessionStorage;
const PULSE_MS = 1_500;
const CLOCK_MS = 30_000;

/**
 * The console's signals (REQ-62, tracker ADR 0077), seeded with the server's
 * view. It refreshes from GET /api/console/signals in step with the health
 * poll, one request at a time, and keeps the last good view on a failure. The
 * browser memory (watermark, acks, snoozes, quiet, dismissals) is read after
 * the first render and written on every change; storage that throws leaves it
 * in this tab only. It never writes to Notion or Supabase.
 */
export function SignalsProvider({ initial, orgId, children }: { initial: SignalsView; orgId: string; children: ReactNode }) {
  const [state, dispatch] = useReducer(signalsReducer, initial, (view) => initialSignalsState(view, EMPTY_MEMORY, view.checkedAt));
  const sync = useSync();
  const seen = useRef<string | null>(null);
  const busy = useRef(false);
  const key = memoryKey(orgId);

  useEffect(() => {
    dispatch({ type: "hydrate", memory: readMemory(local, session, key), now: new Date().toISOString() });
    const timer = setInterval(() => dispatch({ type: "tick", now: new Date().toISOString() }), CLOCK_MS);
    return () => clearInterval(timer);
  }, [key]);

  // Written only after hydrate, so the defaults never overwrite what the browser held.
  const { hydrated, watermark, acked, announced, snoozed, quiet, dismissed } = state;
  useEffect(() => {
    if (!hydrated) return;
    if (!writeMemory(local, session, key, { ...state, watermark, acked, announced, snoozed, quiet, dismissed })) dispatch({ type: "memoryLost" });
  }, [hydrated, watermark, acked, announced, snoozed, quiet, dismissed, key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (state.pulsing.length === 0) return;
    const timer = setTimeout(() => dispatch({ type: "pulseEnd" }), PULSE_MS);
    return () => clearTimeout(timer);
  }, [state.pulsing]);

  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    const failed = (message: string) => dispatch({ type: "refreshFailed", message, now: new Date().toISOString() });
    try {
      // basePath spelled out: a client fetch is not prefixed with /tracker.
      const res = await fetch("/tracker/api/console/signals", { cache: "no-store" });
      if (!res.ok) return failed(`HTTP ${res.status}`);
      const parsed = SignalsViewSchema.safeParse(await res.json().catch(() => null));
      if (!parsed.success) return failed("Unexpected response");
      dispatch({ type: "refreshOk", view: parsed.data, now: new Date().toISOString() });
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

  const value = useMemo((): SignalsContextValue => {
    const now = state.clock;
    const at = () => new Date().toISOString();
    return {
      state, now,
      protectedNow: isProtected(state, now),
      band: bandOf(state, now),
      deferred: deferredOf(state, now),
      exceptions: exceptionsOf(state, now),
      health: healthOf(state),
      snoozeOptions: snoozeOptions(state, now),
      memoryOnly: state.memoryOnly,
      ack: (signalKey) => dispatch({ type: "ack", signalKey, now: at() }),
      snooze: (signalKey, until) => dispatch({ type: "snooze", signalKey, until, now: at() }),
      dismiss: (signalKey) => dispatch({ type: "dismiss", signalKey, now: at() }),
      showNow: (signalKey) => dispatch({ type: "showNow", signalKey, now: at() }),
      setQuiet: (quiet) => dispatch({ type: "setQuiet", quiet, now: at() }),
    };
  }, [state]);
  return <SignalsContext.Provider value={value}>{children}</SignalsContext.Provider>;
}
