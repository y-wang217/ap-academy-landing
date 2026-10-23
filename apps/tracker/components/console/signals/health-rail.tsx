"use client";

import { hhmm } from "../../../lib/console/format";
import { healthSlotView, NOT_CHECKED, type HealthEntry } from "../../../lib/console/signals";
import { InstrumentPanel, type PanelFrame } from "../kit/instrument-panel";
import { useOptionalSignals, useSignals } from "./signals-provider";

const STATUS_TEXT: Record<HealthEntry["status"], string> = { ready: "ok", empty: "ok", loading: "checking", stale: "stale", error: "error", unverifiable: "unverified" };
const TONE: Record<HealthEntry["status"], string> = { ready: "ok", empty: "ok", loading: "muted", stale: "amber", error: "bad", unverifiable: "muted" };

const statusText = (h: HealthEntry) => (h.status === "unverifiable" && h.staleReason === NOT_CHECKED ? NOT_CHECKED : STATUS_TEXT[h.status]);
const reasonOf = (h: HealthEntry) => h.errorMessage ?? (h.status === "ready" || h.status === "empty" || h.staleReason === NOT_CHECKED ? null : h.staleReason);

/** The seven providers' entries: a dot, the status in text, last ok and, when not ok, the reason. Colour is never the only cue. */
function Entries({ health, detailed }: { health: HealthEntry[]; detailed: boolean }) {
  return (
    <ul className="console-health" data-health-list="" data-panel-value={detailed ? "" : undefined}>
      {health.map((h) => {
        const reason = reasonOf(h);
        return (
          <li key={h.key} data-health={h.key} data-status={h.status} className="console-health-entry">
            <span className="console-dot" data-tone={TONE[h.status]} aria-hidden="true" />
            <span className="console-health-label">{h.label}</span>
            <span data-health-status="">{statusText(h)}</span>
            <span className="console-health-time">{h.lastSuccessfulFetchAt ? `last ok ${hhmm(h.lastSuccessfulFetchAt)}` : "no successful read yet"}</span>
            {detailed && h.lastCheckedAt && <span className="console-health-time">{`checked ${hhmm(h.lastCheckedAt)}`}</span>}
            {reason && <span className="console-health-reason">{reason}</span>}
          </li>
        );
      })}
    </ul>
  );
}

/** The bottom rail's health strip (REQ-62 AC7). Nothing without a signals view. */
export function HealthRail() {
  const signals = useOptionalSignals();
  if (!signals) return null;
  return (
    <nav className="console-health-rail" aria-label="Integration health" data-health-rail="">
      <Entries health={signals.health} detailed={false} />
    </nav>
  );
}

/** The Operations integrations slot: the same entries with check times, in a panel frame. */
export function HealthPanel(frame: PanelFrame) {
  const { state, health } = useSignals();
  return (
    <InstrumentPanel {...frame} result={healthSlotView(state.view, health)}>
      {(entries) => <Entries health={entries} detailed />}
    </InstrumentPanel>
  );
}
