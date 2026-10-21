import { describe, expect, it } from "vitest";
import type { PeopleRuns, PeopleStore } from "../../../lib/data/people";
import type { SchedulerIdentity } from "../../../lib/scheduler/guard";
import { handlePeopleSyncNow, handlePeopleSyncStatus, type PeopleDeps } from "../../../lib/scheduler/people-handlers";
import type { SyncRun } from "../../../lib/scheduler/people-sync";

const ORG = "10000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-10-19T14:00:00Z");
const admin: SchedulerIdentity = { scope: "admin", orgId: ORG, staff: null };
const teacher: SchedulerIdentity = {
  scope: "teacher", orgId: ORG, staff: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Ryan", email: null, functions: ["Teacher"], status: "Active", subjects: [] },
};
const run = (result: "ok" | "failed", at: string): SyncRun => ({
  id: "r", result, startedAt: at, finishedAt: at, error: result === "failed" ? "notion_unavailable" : null,
  staffUpserted: 0, staffArchived: 0, studentsUpserted: 0, studentsArchived: 0,
});

function world(identity: SchedulerIdentity, runs: PeopleRuns = { lastOk: null, lastFailure: null, latestStartedAt: null }, result: "ok" | "failed" | "not_configured" = "ok") {
  const calls: string[] = [];
  let current = runs;
  const store = {
    lastRuns: async () => { calls.push("lastRuns"); return current; },
  } as unknown as PeopleStore;
  const deps: PeopleDeps = {
    identity: async () => identity,
    peopleStore: async () => { calls.push("store"); return store; },
    syncPeople: async (org) => {
      calls.push(`sync:${org}`);
      if (result !== "not_configured") {
        const r = run(result, NOW.toISOString());
        current = { ...current, latestStartedAt: r.startedAt, ...(result === "ok" ? { lastOk: r } : { lastFailure: r }) };
      }
      return result;
    },
    now: () => NOW,
  };
  return { deps, calls };
}

describe("people sync routes (REQ-38 AC8)", () => {
  it("owner POST runs the sync for the owner's org and returns the result and the last runs", async () => {
    const w = world(admin);
    const res = await handlePeopleSyncNow(w.deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ result: "ok", lastOk: { finishedAt: NOW.toISOString(), error: null }, lastFailure: null });
    expect(w.calls).toContain(`sync:${ORG}`);
  });
  it("a failed sync is reported as failed, never as success", async () => {
    const w = world(admin, undefined, "failed");
    const body = await (await handlePeopleSyncNow(w.deps)).json();
    expect(body.result).toBe("failed");
    expect(body.lastFailure).toEqual({ finishedAt: NOW.toISOString(), error: "notion_unavailable" });
  });
  it("teacher 403 and signed out 401, with no store or Notion call", async () => {
    for (const [identity, status] of [[teacher, 403], [{ scope: "signed_out" } as SchedulerIdentity, 401], [{ scope: "none" } as SchedulerIdentity, 403]] as const) {
      const w = world(identity);
      expect((await handlePeopleSyncNow(w.deps)).status).toBe(status);
      expect((await handlePeopleSyncStatus(w.deps)).status).toBe(status);
      expect(w.calls).toEqual([]);
    }
  });
  it("a second POST inside the cooldown is 429 too_soon and does not call Notion", async () => {
    const recent = new Date(NOW.getTime() - 30_000).toISOString();
    const w = world(admin, { lastOk: run("ok", recent), lastFailure: null, latestStartedAt: recent });
    const res = await handlePeopleSyncNow(w.deps);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "too_soon" });
    expect(w.calls.some((c) => c.startsWith("sync:"))).toBe(false);
    const later = new Date(NOW.getTime() - 61_000).toISOString();
    const w2 = world(admin, { lastOk: run("ok", later), lastFailure: null, latestStartedAt: later });
    expect((await handlePeopleSyncNow(w2.deps)).status).toBe(200);
  });
  it("not configured is 503", async () => {
    expect((await handlePeopleSyncNow(world(admin, undefined, "not_configured").deps)).status).toBe(503);
  });
  it("GET returns the last ok and the last failure to the owner", async () => {
    const w = world(admin, { lastOk: run("ok", "2026-10-19T11:00:00Z"), lastFailure: run("failed", "2026-10-19T13:55:00Z"), latestStartedAt: "2026-10-19T13:55:00Z" });
    const res = await handlePeopleSyncStatus(w.deps);
    expect(await res.json()).toEqual({
      lastOk: { finishedAt: "2026-10-19T11:00:00Z", error: null },
      lastFailure: { finishedAt: "2026-10-19T13:55:00Z", error: "notion_unavailable" },
    });
  });
});
