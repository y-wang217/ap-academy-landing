import { describe, expect, it, vi } from "vitest";
import type { Db } from "../data/client";
import type { ClassSeries } from "../domain/schedule/recurrence";
import type { OwnerViewer } from "./guard";
import { NO_STAFF_LINK, readFailedOutbox, readOwnerTeaching, SCHEDULE_UNAVAILABLE, settleOutbox, settleTeaching, TEACHING_UNAVAILABLE } from "./signals-read";

// REQ-62 AC2, AC5: the outbox and teaching-time reads.
const ORG = "10000000-0000-0000-0000-00000000aaaa";
const STAFF = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001";
// 14:30 Toronto on a Thursday.
const NOW = new Date("2026-10-22T18:30:00.000Z");

type Result = { data: unknown; error: unknown };
function fakeDb(results: Record<string, Result>) {
  const calls: { table: string; ops: [string, unknown[]][] }[] = [];
  const from = vi.fn((table: string) => {
    const call = { table, ops: [] as [string, unknown[]][] };
    calls.push(call);
    const chain: Record<string, unknown> = {};
    for (const op of ["select", "eq", "is", "order", "limit"]) chain[op] = (...args: unknown[]) => (call.ops.push([op, args]), chain);
    chain.maybeSingle = async () => results[table];
    chain.then = (resolve: (r: Result) => unknown) => resolve(results[table]);
    return chain;
  });
  const viewer = { kind: "staff", userId: "u-owner", email: "o@example.com", orgId: ORG, role: "owner", db: { tracker: { from } } as unknown as Db } as OwnerViewer;
  return { viewer, calls };
}

const series = (over: Partial<ClassSeries> = {}): ClassSeries => ({
  id: "c0000000-0000-4000-8000-000000000001", staffId: STAFF, studentId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0001", subject: "MHF4U", kind: "one_off",
  startDate: "2026-10-22", startTime: "14:00", durationMinutes: 60, effectiveUntil: null, purpose: null, makeupFor: null, ...over,
});
const LINK = { data: { notion_staff_id: STAFF.toUpperCase() }, error: null };

describe("readOwnerTeaching", () => {
  it("the owner's own class now is teaching, until its end", async () => {
    const { viewer, calls } = fakeDb({ staff_links: LINK });
    const t = await readOwnerTeaching(viewer, NOW, { schedule: async () => ({ series: [series()], exceptions: [] }) });
    expect(t).toEqual({ state: "teaching", until: "2026-10-22T19:00:00.000Z", title: "MHF4U class" });
    expect(calls[0].ops).toEqual([["select", ["notion_staff_id"]], ["eq", ["org_id", ORG]], ["eq", ["user_id", "u-owner"]], ["is", ["revoked_at", null]]]);
  });

  it("a cancelled class, another teacher's class or one that has ended is free", async () => {
    const { viewer } = fakeDb({ staff_links: LINK });
    const cancelled = { id: "e1", seriesId: series().id, originalDate: "2026-10-22", kind: "cancelled" as const, newDate: null, newStartTime: null };
    expect(await readOwnerTeaching(viewer, NOW, { schedule: async () => ({ series: [series()], exceptions: [cancelled] }) })).toEqual({ state: "free" });
    expect(await readOwnerTeaching(viewer, NOW, { schedule: async () => ({ series: [series({ staffId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0002" })], exceptions: [] }) })).toEqual({ state: "free" });
    expect(await readOwnerTeaching(viewer, NOW, { schedule: async () => ({ series: [series({ startTime: "13:00", durationMinutes: 30 })], exceptions: [] }) })).toEqual({ state: "free" });
  });

  it("no live link is unknown, never free", async () => {
    const { viewer } = fakeDb({ staff_links: { data: null, error: null } });
    const schedule = vi.fn();
    expect(await readOwnerTeaching(viewer, NOW, { schedule })).toEqual({ state: "unknown", reason: NO_STAFF_LINK });
    expect(schedule).not.toHaveBeenCalled();
  });

  it("a schedule error is unknown; a link query error throws, and settleTeaching makes it unknown", async () => {
    const { viewer } = fakeDb({ staff_links: LINK });
    expect(await readOwnerTeaching(viewer, NOW, { schedule: async () => Promise.reject(new Error("x")) })).toEqual({ state: "unknown", reason: SCHEDULE_UNAVAILABLE });
    const broken = fakeDb({ staff_links: { data: null, error: { message: "boom" } } });
    await expect(readOwnerTeaching(broken.viewer, NOW, { schedule: async () => ({ series: [], exceptions: [] }) })).rejects.toThrow();
    expect(await settleTeaching(broken.viewer, NOW, { schedule: async () => ({ series: [], exceptions: [] }) }, 8_000)).toEqual({ state: "unknown", reason: TEACHING_UNAVAILABLE });
  });
});

describe("readFailedOutbox", () => {
  it("selects failed rows of the org, newest first, capped, never last_error", async () => {
    const { viewer, calls } = fakeDb({ notion_outbox: { data: [{ id: "c0000000-0000-4000-8000-0000000000aa", kind: "summary", finished_at: null }], error: null } });
    expect(await readFailedOutbox(viewer)).toEqual([{ id: "c0000000-0000-4000-8000-0000000000aa", kind: "summary", finishedAt: null }]);
    expect(calls[0].ops).toEqual([["select", ["id, kind, finished_at"]], ["eq", ["org_id", ORG]], ["eq", ["status", "failed"]], ["order", ["finished_at", { ascending: false }]], ["limit", [100]]]);
  });

  it("a query error throws; settleOutbox turns it into a failed read", async () => {
    const { viewer } = fakeDb({ notion_outbox: { data: null, error: { message: "boom" } } });
    await expect(readFailedOutbox(viewer)).rejects.toThrow();
    expect(await settleOutbox(viewer, NOW, 8_000)).toEqual({ ok: false, checkedAt: NOW.toISOString(), message: "Read failed" });
  });
});
