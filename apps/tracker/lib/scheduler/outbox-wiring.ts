import { drainOutbox, sleep, type Delivered, type DrainDeps } from "./outbox";
import type { OutboxStore } from "./outbox-store";
import type { ScheduleDeps } from "./schedule-handlers";
import type { SyncResult } from "./summary-sync";

/** The drain's ports from a request's ScheduleDeps (REQ-35). */
export function drainDepsOf(deps: ScheduleDeps & { outbox: OutboxStore }): DrainDeps {
  return {
    outbox: deps.outbox,
    summary: deps.students ? { store: deps.store, students: deps.students, fetchStaff: deps.fetchStaff, today: deps.today, siteUrl: deps.siteUrl } : undefined,
    dailyTask: deps.dailyTask,
    today: deps.today,
    now: () => new Date(),
    sleep: deps.sleep ?? sleep,
  };
}

export type SummaryOutcome = SyncResult | "queued";

/** One student's summary outcome from its delivery: anything not delivered yet is queued. */
export function summaryOutcome(d: Delivered | undefined): SummaryOutcome {
  if (!d || d.status === "pending") return "queued";
  if (d.status === "done") return d.result === "skipped" ? "skipped" : "synced";
  return "failed";
}

/**
 * Delivers the given summary rows (at most one drain's worth, AC5) and answers
 * per student. The import run and "Sync all" use it; a row past the drain's
 * limit stays queued for the next drain.
 */
export async function deliverSummaries(deps: ScheduleDeps & { outbox: OutboxStore }, rowIds: string[]): Promise<Map<string, SummaryOutcome>> {
  const delivered = await drainOutbox(drainDepsOf(deps), { ids: rowIds });
  return new Map(delivered.filter((d) => d.kind === "summary").map((d) => [d.targetId, summaryOutcome(d)]));
}
