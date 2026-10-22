/**
 * What every console instrument renders (REQ-55, tracker ADR 0066). The field
 * names copy REQ-54's PanelResult one for one, so a facade result can be passed
 * straight in. Components print staleReason and errorMessage verbatim.
 */
export const PANEL_STATUSES = ["ready", "empty", "loading", "stale", "error", "unverifiable"] as const;
export type PanelStatus = (typeof PANEL_STATUSES)[number];

export type SourceEvidence = { source: string; sourceId: string; sourceUrl: string | null; observedAt: string };

export type PanelView<T> = {
  panel: string;
  status: PanelStatus;
  data: T | null;
  count: number | null;
  lastCheckedAt: string | null;
  lastSuccessfulFetchAt: string | null;
  staleReason: string | null;
  errorMessage: string | null;
  sourceEvidence: SourceEvidence[];
};

export const NOT_CONNECTED = "Not connected yet";

/** A panel no card has wired yet: unverifiable, no value, and it says so. */
export function notConnected(panel: string, now: Date): PanelView<never> {
  return {
    panel,
    status: "unverifiable",
    data: null,
    count: null,
    lastCheckedAt: now.toISOString(),
    lastSuccessfulFetchAt: null,
    staleReason: NOT_CONNECTED,
    errorMessage: null,
    sourceEvidence: [],
  };
}

/** Only ready and stale results carry a value worth showing. */
export const showsValue = (status: PanelStatus) => status === "ready" || status === "stale";
