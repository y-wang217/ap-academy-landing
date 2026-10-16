import { describe, expect, it } from "vitest";
import type { Db } from "./client";
import { createScheduleStore } from "./schedule";

/** A Supabase-like query chain whose every call returns the given result when awaited. */
function chain(result: { data: unknown; error: unknown }) {
  const handler: ProxyHandler<object> = {
    get(_t, prop) {
      if (prop === "then") return (resolve: (v: unknown) => void) => resolve(result);
      return () => new Proxy({}, handler);
    },
  };
  return new Proxy({}, handler);
}
const store = (result: { data: unknown; error: unknown }) =>
  createScheduleStore(async () => ({
    db: { tracker: { from: () => chain(result), rpc: () => chain(result) } } as unknown as Db,
    orgId: "10000000-0000-4000-8000-000000000001",
    userId: "20000000-0000-4000-8000-000000000001",
  }));
const FAIL = { data: null, error: { message: "boom" } };

describe("review: a failed read is never an empty answer", () => {
  it("listSeriesForStudent, getSummary and listSummaries throw on a query error", async () => {
    const s = store(FAIL);
    await expect(s.listSeriesForStudent("11111111-1111-4111-8111-111111111111")).rejects.toThrow("unavailable");
    await expect(s.getSummary("11111111-1111-4111-8111-111111111111")).rejects.toThrow("unavailable");
    await expect(s.listSummaries()).rejects.toThrow("unavailable");
  });
  it("a successful empty read is still empty", async () => {
    const s = store({ data: [], error: null });
    expect(await s.listSeriesForStudent("11111111-1111-4111-8111-111111111111")).toEqual({ series: [], exceptions: [] });
    expect(await s.listSummaries()).toEqual([]);
    expect(await store({ data: null, error: null }).getSummary("11111111-1111-4111-8111-111111111111")).toBeNull();
  });
});

// REQ-30: tracker.schedule_write and schedule_write_context (migration 0018). ------------------

const ROW = {
  id: "50000000-0000-4000-8000-000000000001", org_id: "10000000-0000-4000-8000-000000000001", notion_staff_id: "e0000000-0000-4000-8000-000000000001",
  notion_student_id: "f0000000-0000-4000-8000-000000000001", subject: "MHF4U", kind: "weekly", start_date: "2030-01-07", start_time: "17:00:00",
  duration_minutes: 60, effective_until: null, split_from: null, updated_at: "2026-10-16T12:00:00.123456+00:00", created_at: "x", created_by: "y", request_id: "z",
};
const REQ = "a0000000-0000-4000-8000-000000000001";
const CREATE = {
  op: "create" as const, requestId: REQ, stamps: [],
  series: { staffId: ROW.notion_staff_id, studentId: ROW.notion_student_id, subject: "MHF4U", kind: "weekly" as const, startDate: "2030-01-07", startTime: "17:00", durationMinutes: 60, effectiveUntil: null },
};
/** rpc answers by function name, and records what it was called with. */
function rpcStore(answers: Record<string, { data: unknown; error: unknown }[]>) {
  const called: { fn: string; args: Record<string, unknown> }[] = [];
  const s = createScheduleStore(async () => ({
    db: {
      tracker: {
        from: () => chain({ data: null, error: null }),
        rpc: (fn: string, args: Record<string, unknown>) => { called.push({ fn, args }); return chain(answers[fn].shift()!); },
      },
    } as unknown as Db,
    orgId: "10000000-0000-4000-8000-000000000001",
    userId: "20000000-0000-4000-8000-000000000001",
  }));
  return { s, called };
}

describe("REQ-30: the locked write over RPC", () => {
  it("maps each database refusal to its store error", async () => {
    const cases: [string, unknown][] = [
      ["booking_changed", { ok: false, status: 409, error: "booking_changed" }],
      ["stale", { ok: false, status: 409, error: "stale" }],
      ["not_found", { ok: false, status: 404, error: "not_found" }],
      ["past_occurrence", { ok: false, status: 422, error: "past_occurrence" }],
      ["not_weekly", { ok: false, status: 422, error: "not_weekly" }],
      ["request_reused", { ok: false, status: 400, error: "request_reused" }],
      ["forbidden", { ok: false, status: 403, error: "forbidden" }],
      ["something else", { ok: false, status: 503, error: "unavailable" }],
    ];
    for (const [message, expected] of cases) {
      const { s } = rpcStore({ schedule_write: [{ data: null, error: { code: "P0001", message } }] });
      expect(await s.lockedWrite(CREATE)).toEqual(expected);
    }
  });
  it("AC14: a lock timeout (55P03) or a deadlock (40P01) is the one 503", async () => {
    for (const code of ["55P03", "40P01"]) {
      const { s } = rpcStore({ schedule_write: [{ data: null, error: { code, message: "canceling statement due to lock timeout" } }] });
      expect(await s.lockedWrite(CREATE)).toEqual({ ok: false, status: 503, error: "unavailable" });
    }
  });
  it("AC8b: a unique violation (23505) re-reads the context once and returns its replay", async () => {
    const { s, called } = rpcStore({
      schedule_write: [{ data: null, error: { code: "23505", message: "duplicate key" } }],
      schedule_write_context: [{ data: { stamps: [], replay: { op: "create", series_id: ROW.id, result: ROW } }, error: null }],
    });
    const r = await s.lockedWrite(CREATE);
    expect(r).toMatchObject({ ok: true, created: false, value: { id: ROW.id, startTime: "17:00" } });
    expect(called.map((c) => c.fn)).toEqual(["schedule_write", "schedule_write_context"]);
    const none = rpcStore({
      schedule_write: [{ data: null, error: { code: "23505", message: "duplicate key" } }],
      schedule_write_context: [{ data: { stamps: [], replay: null }, error: null }],
    });
    expect(await none.s.lockedWrite(CREATE)).toEqual({ ok: false, status: 503, error: "unavailable" });
  });
  it("a write returns the parsed series; replay sets created false", async () => {
    const { s, called } = rpcStore({ schedule_write: [{ data: { replay: false, result: ROW }, error: null }, { data: { replay: true, result: ROW }, error: null }] });
    expect(await s.lockedWrite(CREATE)).toMatchObject({ ok: true, created: true, value: { id: ROW.id, staffId: ROW.notion_staff_id, updatedAt: ROW.updated_at } });
    expect(await s.lockedWrite(CREATE)).toMatchObject({ ok: true, created: false });
    expect(called[0].args).toMatchObject({
      p_org_id: "10000000-0000-4000-8000-000000000001", p_request_id: REQ, p_op: "create", p_stamps: [],
      p_args: { staff_id: ROW.notion_staff_id, student_id: ROW.notion_student_id, start_time: "17:00", duration_minutes: 60, effective_until: null },
    });
  });
  it("sends the position and one-off fields in the database's names", async () => {
    const { s, called } = rpcStore({ schedule_write: [{ data: { replay: false, result: ROW }, error: null }] });
    await s.lockedWrite({
      op: "edit_one_off", requestId: REQ, stamps: [{ kind: "staff", id: ROW.notion_staff_id, version: 3 }], seriesId: ROW.id, expectedUpdatedAt: ROW.updated_at,
      originalDate: "2030-01-07", move: { newDate: "2030-01-08", newStartTime: "10:00" }, fields: { durationMinutes: 90 },
      expectedPosition: { status: "scheduled", date: "2030-01-07", startTime: "17:00" },
    });
    expect(called[0].args).toEqual({
      p_org_id: "10000000-0000-4000-8000-000000000001", p_request_id: REQ, p_op: "edit_one_off",
      p_stamps: [{ kind: "staff", id: ROW.notion_staff_id, version: 3 }],
      p_args: {
        series_id: ROW.id, original_date: "2030-01-07", new_date: "2030-01-08", new_start_time: "10:00", fields: { duration_minutes: 90 },
        expected_updated_at: ROW.updated_at, expected_position: { status: "scheduled", date: "2030-01-07", start_time: "17:00" },
      },
    });
  });
  it("the write context parses, and a failed read throws rather than looking empty", async () => {
    const { s } = rpcStore({
      schedule_write_context: [
        { data: { stamps: [{ kind: "staff", id: ROW.notion_staff_id, version: 2 }], replay: { op: "split", series_id: ROW.id, result: ROW } }, error: null },
        { data: null, error: { message: "forbidden" } },
      ],
    });
    expect(await s.readWriteContext(REQ, [{ kind: "staff", id: ROW.notion_staff_id }])).toMatchObject({
      stamps: [{ kind: "staff", id: ROW.notion_staff_id, version: 2 }], replay: { op: "split", seriesId: ROW.id, result: { id: ROW.id } },
    });
    await expect(s.readWriteContext(REQ, [])).rejects.toThrow("unavailable");
  });
});
