import { z } from "zod";
import { hhmm } from "./format";

/**
 * The console's sync line (REQ-55 AC9). It reports what GET /api/console/health
 * answered and never assumes a healthy default. Extra keys (REQ-54's providers)
 * are allowed.
 */
export type SyncState = { kind: "checking" | "ok" | "degraded" | "unavailable"; checkedAt: string | null; lastGoodAt: string | null };

export const CHECKING: SyncState = { kind: "checking", checkedAt: null, lastGoodAt: null };

const Health = z.object({ status: z.string(), checkedAt: z.string() });

/** `status` is the HTTP status, or null for a network error. */
export function syncFromResponse(status: number | null, body: unknown, prev: SyncState): SyncState {
  const parsed = status === 200 ? Health.safeParse(body) : null;
  if (!parsed?.success) return { kind: "unavailable", checkedAt: null, lastGoodAt: prev.lastGoodAt };
  const { checkedAt } = parsed.data;
  return { kind: parsed.data.status === "ok" ? "ok" : "degraded", checkedAt, lastGoodAt: checkedAt };
}

export function syncLabel(state: SyncState): string {
  switch (state.kind) {
    case "checking":
      return "Checking sources";
    case "ok":
      return `Sources checked ${hhmm(state.checkedAt!)}`;
    case "degraded":
      return `Some sources failing, checked ${hhmm(state.checkedAt!)}`;
    case "unavailable":
      return state.lastGoodAt ? `Sync unavailable, last good ${hhmm(state.lastGoodAt)}` : "Sync unavailable";
  }
}
