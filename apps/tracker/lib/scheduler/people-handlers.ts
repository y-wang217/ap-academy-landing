import { z } from "zod";
import type { PeopleRuns, PeopleStore } from "../data/people";
import { TUNING } from "../domain/tuning";
import { requireScheduler, type Denial } from "./guard";
import type { SchedulerIdentity } from "./identity";

/**
 * The owner's Sync now and sync status (REQ-38 AC8). The guard runs first, so
 * a teacher or a signed-out caller never causes a database or Notion read.
 */
export type PeopleDeps = {
  identity: () => Promise<SchedulerIdentity>;
  peopleStore: () => Promise<PeopleStore>;
  /** Runs one sync for the org with the owner's own client. */
  syncPeople: (orgId: string) => Promise<"ok" | "failed" | "not_configured">;
  now: () => Date;
};

const HEADERS = { "Cache-Control": "no-store" };
const send = (status: number, body: unknown) => Response.json(body, { status, headers: HEADERS });
const deny = (d: Denial) => send(d.status, d.body);

const RunView = z.strictObject({ finishedAt: z.string(), error: z.string().nullable() }).nullable();
export const PeopleSyncStatusResponse = z.strictObject({ lastOk: RunView, lastFailure: RunView });
export const PeopleSyncNowResponse = PeopleSyncStatusResponse.extend({ result: z.enum(["ok", "failed"]) });

const view = (runs: PeopleRuns) =>
  PeopleSyncStatusResponse.parse({
    lastOk: runs.lastOk ? { finishedAt: runs.lastOk.finishedAt, error: null } : null,
    lastFailure: runs.lastFailure ? { finishedAt: runs.lastFailure.finishedAt, error: runs.lastFailure.error } : null,
  });

export async function handlePeopleSyncStatus(deps: PeopleDeps): Promise<Response> {
  const gate = requireScheduler(await deps.identity(), ["admin"]);
  if (!gate.ok) return deny(gate);
  try {
    return send(200, view(await (await deps.peopleStore()).lastRuns()));
  } catch {
    return send(503, { error: "scheduler_unavailable" });
  }
}

export async function handlePeopleSyncNow(deps: PeopleDeps): Promise<Response> {
  const gate = requireScheduler(await deps.identity(), ["admin"]);
  if (!gate.ok) return deny(gate);
  let store: PeopleStore;
  let before: PeopleRuns;
  try {
    store = await deps.peopleStore();
    before = await store.lastRuns();
  } catch {
    return send(503, { error: "scheduler_unavailable" });
  }
  // Repeated taps within the cooldown never reach Notion.
  if (before.latestStartedAt && deps.now().getTime() - Date.parse(before.latestStartedAt) < TUNING.peopleSyncCooldownSeconds * 1000) {
    return send(429, { error: "too_soon" });
  }
  const result = await deps.syncPeople(gate.identity.orgId).catch(() => "failed" as const);
  if (result === "not_configured") return send(503, { error: "scheduler_not_configured" });
  let after: PeopleRuns = before;
  try {
    after = await store.lastRuns();
  } catch {
    // The result still tells the truth; the lines fall back to what was read before.
  }
  return send(200, PeopleSyncNowResponse.parse({ result, ...view(after) }));
}
