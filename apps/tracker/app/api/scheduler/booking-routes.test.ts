import { describe, expect, it } from "vitest";
import type { ClassException } from "../../../lib/domain/schedule/recurrence";
import { addDays } from "../../../lib/domain/schedule/wallclock";
import type { StaffRecord } from "../../../lib/notion/staff";
import type { StudentRecord } from "../../../lib/notion/students";
import type { SchedulerIdentity } from "../../../lib/scheduler/guard";
import {
  handleCancelOccurrence, handleCreateClass, handleEditOccurrence, handleOccurrences, type ScheduleDeps,
} from "../../../lib/scheduler/schedule-handlers";
import type { AvailabilityExceptionRecord, ScheduleStore, SeriesRecord, StoreResult, SummaryRecord, WindowRecord } from "../../../lib/scheduler/schedule-store";
import { seriesWrites } from "./series-writes.fake";

// The booking fixture of the REQ-7 design: today is Mon 2026-10-19.
const TODAY = "2026-10-19";
const ORG = "10000000-0000-4000-8000-000000000001";
const RYAN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const KUBY = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const MIA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const S1 = "11111111-1111-4111-8111-111111111111";
const S2 = "22222222-2222-4222-8222-222222222222";
const REQ = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const mk = (id: string, name: string): StaffRecord => ({ id, name, email: `${name}@example.com`, functions: ["Teacher"], status: "Active", subjects: ["MHF4U"] });
const staff = [mk(RYAN, "Ryan"), mk(KUBY, "Kuby"), mk(MIA, "Mia")];
const admin: SchedulerIdentity = { scope: "admin", orgId: ORG, staff: null };
const teacher: SchedulerIdentity = { scope: "teacher", orgId: ORG, staff: staff[0] };

const WRITES = ["createSeries", "upsertException", "split", "endSeries", "updateSeriesFields", "adoptStudent", "markSummary"] as const;

function world() {
  const series = new Map<string, SeriesRecord>();
  const exceptions: (ClassException & { requestId: string })[] = [];
  const byRequest = new Map<string, string>();
  const writes: string[] = [];
  let n = 100;
  let tick = 0;
  const windows: WindowRecord[] = [RYAN, KUBY].flatMap((staffId) =>
    [1, 2, 3, 4, 5].map((weekday) => ({ id: REQ(++n), staffId, weekday, startTime: "15:00", endTime: "21:00", effectiveFrom: "2026-01-01", effectiveUntil: null, updatedAt: "x" })));
  const avEx: AvailabilityExceptionRecord[] = [{ id: REQ(++n), staffId: RYAN, onDate: "2026-11-02", kind: "time_off", startTime: null, endTime: null, updatedAt: "x" }];
  const summaries = new Map<string, SummaryRecord>(
    [S1, S2].map((studentId) => [studentId, { id: REQ(++n), studentId, adoptedAt: TODAY, adoptedFromText: "", lastWrittenText: "", lastWrittenAt: null, syncState: "synced", lastError: null, lastDriftText: null }]),
  );
  const notion = new Map<string, StudentRecord>([S1, S2].map((id) => [id, { id, name: id.slice(0, 2), stage: "Active", weeklySchedule: "" }]));
  const notionWrites: string[] = [];

  const base: ScheduleStore = {
    listWindows: async (staffId) => windows.filter((w) => !staffId || w.staffId === staffId),
    listAvailabilityExceptions: async (staffId, r) => avEx.filter((e) => (!staffId || e.staffId === staffId) && e.onDate >= r.from && e.onDate <= r.to),
    getWindow: async () => null, createWindow: async () => ({ ok: false, status: 503, error: "unavailable" }), updateWindow: async () => ({ ok: false, status: 503, error: "unavailable" }),
    deleteWindow: async () => false, getAvailabilityException: async () => null, createAvailabilityException: async () => ({ ok: false, status: 503, error: "unavailable" }),
    deleteAvailabilityException: async () => false,
    listSeries: async (_r, staffId) => ({ series: [...series.values()].filter((s) => !staffId || s.staffId === staffId), exceptions }),
    getSeries: async (id) => series.get(id) ?? null,
    getSeriesByRequest: async (r) => (byRequest.has(r) ? series.get(byRequest.get(r)!) ?? null : null),
    createSeries: async (input) => {
      const existing = byRequest.get(input.requestId);
      if (existing) return { ok: true, value: series.get(existing)!, created: false };
      const { requestId, ...fields } = input;
      const rec: SeriesRecord = { ...fields, id: REQ(++n), updatedAt: "2026-10-14T12:00:00.000Z", splitFrom: null };
      series.set(rec.id, rec);
      byRequest.set(requestId, rec.id);
      return { ok: true, value: rec, created: true };
    },
    upsertException: async (input) => {
      const i = exceptions.findIndex((e) => e.seriesId === input.seriesId && e.originalDate === input.originalDate);
      if (i >= 0) exceptions[i] = input;
      else exceptions.push(input);
      return { ok: true, value: input, created: i < 0 };
    },
    split: async (input): Promise<StoreResult<SeriesRecord>> => {
      const done = byRequest.get(input.requestId);
      if (done) return { ok: true, value: series.get(done)!, created: false };
      const old = series.get(input.seriesId)!;
      if (old.updatedAt !== input.expectedUpdatedAt) return { ok: false, status: 409, error: "stale" };
      const rec: SeriesRecord = { ...old, ...input.changes, id: REQ(++n), startDate: input.fromDate, splitFrom: old.id, updatedAt: "2026-10-14T14:00:00.000Z" };
      series.set(rec.id, rec);
      series.set(old.id, { ...old, effectiveUntil: addDays(input.fromDate, -1), updatedAt: `2026-10-14T15:00:${String(++tick).padStart(2, "0")}.000Z` });
      byRequest.set(input.requestId, rec.id);
      return { ok: true, value: rec, created: true };
    },
    ...seriesWrites(series, () => `2026-10-14T15:00:${String(++tick).padStart(2, "0")}.000Z`),
    listSeriesForStudent: async (studentId) => {
      const own = [...series.values()].filter((s) => s.studentId === studentId);
      return { series: own, exceptions: exceptions.filter((e) => own.some((s) => s.id === e.seriesId)) };
    },
    getSummary: async (studentId) => summaries.get(studentId) ?? null,
    listSummaries: async () => [...summaries.values()],
    adoptStudent: async () => ({ ok: false, status: 503, error: "unavailable" }),
    markSummary: async () => true,
  };
  // Every write method is spied: an attempt that is refused must leave this list empty.
  const store = new Proxy(base, {
    get(target, key: string) {
      const v = target[key as keyof ScheduleStore];
      return (WRITES as readonly string[]).includes(key) && typeof v === "function"
        ? (...args: unknown[]) => { writes.push(key); return (v as (...a: unknown[]) => unknown)(...args); }
        : v;
    },
  });
  const deps = (identity: SchedulerIdentity = admin): ScheduleDeps => ({
    identity: async () => identity, fetchStaff: async () => staff, store, today: () => TODAY,
    students: {
      list: async () => [...notion.values()], get: async (id) => notion.get(id) ?? null,
      write: async (id, text) => { notionWrites.push(id); notion.set(id, { ...notion.get(id)!, weeklySchedule: text }); },
    },
  });
  const seed = async (over: Record<string, unknown>) => {
    const r = await base.createSeries({ requestId: REQ(++n), staffId: RYAN, studentId: S1, subject: "MHF4U", kind: "weekly", startDate: "2026-10-19", startTime: "16:00", durationMinutes: 60, effectiveUntil: null, ...over } as never);
    if (!r.ok) throw new Error("seed failed");
    return r.value;
  };
  return { store, series, exceptions, writes, notionWrites, deps, seed };
}

async function fixture() {
  const w = world();
  const s1 = await w.seed({}); // S1: weekly with Ryan, Mon 16:00-17:00
  const s2 = await w.seed({ staffId: KUBY, studentId: S2, startDate: "2026-10-21", startTime: "17:00" }); // S2: weekly with Kuby, Wed 17:00-18:00
  return { ...w, s1, s2, begin: () => { w.writes.length = 0; w.notionWrites.length = 0; } };
}
const json = async (r: Response) => ({ status: r.status, body: await r.json() });
const create = (over: Record<string, unknown> = {}) => ({
  requestId: REQ(1), staffId: RYAN, studentId: S2, subject: "MHF4U", kind: "one_off", startDate: "2026-10-20", startTime: "16:00", durationMinutes: 60, effectiveUntil: null, ...over,
});
const edit = (s: SeriesRecord, over: Record<string, unknown> = {}) => ({ requestId: REQ(50), expectedUpdatedAt: s.updatedAt, ...over });

describe("AC1: create", () => {
  it("201, then the same requestId is 200 and leaves one new series", async () => {
    const f = await fixture();
    expect((await json(await handleCreateClass(f.deps(), create()))).status).toBe(201);
    expect((await json(await handleCreateClass(f.deps(), create()))).status).toBe(200);
    expect(f.series.size).toBe(3);
  });
  it("a start date before today is 422 past_occurrence and writes nothing", async () => {
    const f = await fixture();
    f.begin();
    expect(await json(await handleCreateClass(f.deps(), create({ startDate: "2026-10-18" })))).toMatchObject({ status: 422, body: { error: "past_occurrence" } });
    expect(f.writes).toEqual([]);
  });
});

describe("AC2 to AC5: double-booking and availability", () => {
  it("AC2: Ryan already has S1 at 16:00-17:00, so S2 at 16:30 is teacher_busy and nothing is written", async () => {
    const f = await fixture();
    f.begin();
    const r = await json(await handleCreateClass(f.deps(), create({ startDate: "2026-10-19", startTime: "16:30" })));
    expect(r).toMatchObject({ status: 422, body: { error: "booking_conflict", more: 0, problems: [{ date: "2026-10-19", startTime: "16:30", endTime: "17:30", reason: "teacher_busy" }] } });
    expect(f.writes).toEqual([]);
  });
  it("AC3: S1 with Kuby on Mon 2026-10-26 16:00 is student_busy", async () => {
    const f = await fixture();
    const r = await json(await handleCreateClass(f.deps(), create({ studentId: S1, staffId: KUBY, startDate: "2026-10-26", startTime: "16:00" })));
    expect(r.body.problems.map((p: { reason: string }) => p.reason)).toEqual(["student_busy"]);
  });
  it("AC4: back-to-back with S1's class is allowed", async () => {
    const f = await fixture();
    expect((await json(await handleCreateClass(f.deps(), create({ startDate: "2026-10-19", startTime: "17:00" })))).status).toBe(201);
  });
  it("AC5: outside availability, time off, and no availability entered", async () => {
    const f = await fixture();
    const reason = async (over: Record<string, unknown>) => (await json(await handleCreateClass(f.deps(), create(over)))).body.problems?.[0]?.reason;
    expect(await reason({ startDate: "2026-10-20", startTime: "14:00" })).toBe("outside_availability");
    expect(await reason({ startDate: "2026-11-02", startTime: "18:00" })).toBe("time_off");
    expect(await reason({ startDate: "2026-10-20", staffId: MIA })).toBe("availability_not_entered");
  });
  it("AC5: an edit of only the subject skips the availability check, but double-booking is still checked", async () => {
    const f = await fixture();
    const flagged = await f.seed({ studentId: S2, kind: "one_off", startDate: "2026-10-26", startTime: "12:00" }); // already outside Ryan's hours
    const ok = await json(await handleEditOccurrence(f.deps(), flagged.id, "2026-10-26", edit(flagged, { changes: { subject: "SCH4U" } })));
    expect(ok.status).toBe(200);
    expect((await f.store.getSeries(flagged.id))!.subject).toBe("SCH4U");
  });
  it("AC5: a move or a teacher change must land inside availability", async () => {
    const f = await fixture();
    const r = await json(await handleEditOccurrence(f.deps(), f.s1.id, "2026-10-26", edit(f.s1, { changes: { startTime: "12:00" } })));
    expect(r).toMatchObject({ status: 422, body: { problems: [{ reason: "outside_availability" }] } });
  });
});

describe("AC6: every affected date", () => {
  it("a weekly class over Ryan's time off on 2026-11-02 is rejected and says which date", async () => {
    const f = await fixture();
    f.begin();
    const r = await json(await handleCreateClass(f.deps(), create({ kind: "weekly", startDate: "2026-10-19", startTime: "18:00" })));
    expect(r.status).toBe(422);
    expect(r.body.problems).toEqual([{ date: "2026-11-02", startTime: "18:00", endTime: "19:00", reason: "time_off" }]);
    expect(f.writes).toEqual([]);
  });
  it("lists at most 10 problems and counts the rest; never names another class's student", async () => {
    const f = await fixture();
    const r = await json(await handleCreateClass(f.deps(), create({ kind: "weekly", startDate: "2026-10-19", startTime: "03:00" })));
    expect(r.body.problems).toHaveLength(10);
    expect(r.body.more).toBe(27 - 10); // 27 Mondays from 2026-10-19 to the 182-day horizon
    expect(JSON.stringify(r.body)).not.toMatch(new RegExp(`${S1}|${S2}|MHF4U`));
  });
});

describe("AC7: a class never clashes with itself", () => {
  it("moving S1's 2026-10-19 class to 16:30 the same day succeeds", async () => {
    const f = await fixture();
    expect((await json(await handleEditOccurrence(f.deps(), f.s1.id, "2026-10-19", edit(f.s1, { changes: { startTime: "16:30" } })))).status).toBe(200);
  });
  it("moving a weekly occurrence to the same weekday of another week does not clash with that week's own class", async () => {
    const f = await fixture();
    const move = (startTime: string, n: number) => handleEditOccurrence(f.deps(), f.s1.id, "2026-10-19", edit(f.s1, { requestId: REQ(n), changes: { date: "2026-10-26", startTime } }));
    expect((await json(await move("18:00", 62))).status).toBe(200);
    f.begin();
    // The unmoved 2026-10-26 class (16:00-17:00) is a real class, so a real overlap with it is still refused.
    const clash = await json(await move("16:30", 63));
    expect(clash.status).toBe(422);
    expect(clash.body.problems.map((p: { date: string; reason: string }) => [p.date, p.reason])).toEqual([["2026-10-26", "teacher_busy"], ["2026-10-26", "student_busy"]]);
    expect(f.writes).toEqual([]);
  });
  it("a future split ignores the old series' later occurrences", async () => {
    const f = await fixture();
    // 16:30 overlaps the old series' own 16:00 slots from 2026-11-09 on; they must be ignored.
    const r = await json(await handleEditOccurrence(f.deps(), f.s1.id, "2026-11-09", edit(f.s1, { scope: "future", changes: { startTime: "16:30" } })));
    expect(r.status).toBe(200);
  });
});

describe("AC8 and AC9: drag Monday to Wednesday, stale positions", () => {
  const week = "from=2026-10-19&to=2026-10-25";
  it("persists the move with the same key and duration; the series count is unchanged", async () => {
    const f = await fixture();
    const r = await json(await handleEditOccurrence(f.deps(), f.s1.id, "2026-10-19", edit(f.s1, {
      expectedDate: "2026-10-19", expectedStartTime: "16:00", changes: { date: "2026-10-21", startTime: "16:00" },
    })));
    expect(r.status).toBe(200);
    const occ = (await json(await handleOccurrences(f.deps(), new URLSearchParams(`${week}&staffId=${RYAN}`)))).body.occurrences;
    expect(occ).toHaveLength(1);
    expect(occ[0]).toMatchObject({ occurrenceKey: `${f.s1.id}:2026-10-19`, date: "2026-10-21", startTime: "16:00", endTime: "17:00", durationMinutes: 60, status: "moved", studentId: S1, staffId: RYAN });
    expect(f.series.size).toBe(2);
  });
  it("a second tab moving the same occurrence gets 409 and writes nothing", async () => {
    const f = await fixture();
    const move = (date: string) => handleEditOccurrence(f.deps(), f.s1.id, "2026-10-19", edit(f.s1, {
      requestId: REQ(date === "2026-10-21" ? 51 : 52), expectedDate: "2026-10-19", expectedStartTime: "16:00", changes: { date, startTime: "16:00" },
    }));
    expect((await json(await move("2026-10-21"))).status).toBe(200);
    f.begin();
    expect(await json(await move("2026-10-22"))).toMatchObject({ status: 409, body: { error: "stale" } });
    expect(f.writes).toEqual([]);
  });
  it("a cancel from a stale position is 409 too", async () => {
    const f = await fixture();
    const r = await json(await handleCancelOccurrence(f.deps(), f.s1.id, "2026-10-26", { requestId: REQ(53), expectedUpdatedAt: f.s1.updatedAt, expectedDate: "2026-10-27", expectedStartTime: "16:00" }));
    expect(r.status).toBe(409);
  });
  it("the existing expectedUpdatedAt check is unchanged", async () => {
    const f = await fixture();
    expect((await json(await handleEditOccurrence(f.deps(), f.s1.id, "2026-10-26", { requestId: REQ(54), expectedUpdatedAt: "2020-01-01T00:00:00.000Z", changes: { startTime: "16:30" } }))).status).toBe(409);
  });
});

describe("a store outage on a retried split", () => {
  it("is 503 scheduler_unavailable, not a thrown error", async () => {
    const f = await fixture();
    const deps = f.deps();
    deps.store = { ...f.store, getSeriesByRequest: async () => { throw new Error("down"); } } as never;
    expect((await json(await handleEditOccurrence(deps, f.s1.id, "2026-11-09", edit(f.s1, { scope: "future", changes: { startTime: "17:00" } })))).status).toBe(503);
  });
});

describe("AC10: this class and future", () => {
  it("keeps the split behaviour: the old series ends the day before", async () => {
    const f = await fixture();
    const r = await json(await handleEditOccurrence(f.deps(), f.s1.id, "2026-11-09", edit(f.s1, { scope: "future", changes: { startTime: "17:00" } })));
    expect(r.status).toBe(200);
    expect(r.body.series).toMatchObject({ splitFrom: f.s1.id, startDate: "2026-11-09", startTime: "17:00" });
    expect((await f.store.getSeries(f.s1.id))!.effectiveUntil).toBe("2026-11-08");
  });
  it("is 422 moved_occurrence on an occurrence that was already moved", async () => {
    const f = await fixture();
    await handleEditOccurrence(f.deps(), f.s1.id, "2026-10-26", edit(f.s1, { changes: { date: "2026-10-27", startTime: "16:00" } }));
    f.begin();
    expect(await json(await handleEditOccurrence(f.deps(), f.s1.id, "2026-10-26", edit(f.s1, { requestId: REQ(60), scope: "future", changes: { startTime: "17:00" } })))).toMatchObject({ status: 422, body: { error: "moved_occurrence" } });
    expect(f.writes).toEqual([]);
  });
});

describe("AC11: cancel", () => {
  it("this: one cancelled exception that stays after a reload", async () => {
    const f = await fixture();
    expect((await json(await handleCancelOccurrence(f.deps(), f.s1.id, "2026-10-26", { requestId: REQ(70), expectedUpdatedAt: f.s1.updatedAt, scope: "this" }))).status).toBe(200);
    const occ = (await json(await handleOccurrences(f.deps(), new URLSearchParams(`from=2026-10-26&to=2026-10-26&staffId=${RYAN}`)))).body.occurrences;
    expect(occ[0].status).toBe("cancelled");
  });
  it("future on a weekly series ends it the day before; a retry changes nothing", async () => {
    const f = await fixture();
    const send = () => handleCancelOccurrence(f.deps(), f.s1.id, "2026-11-09", { requestId: REQ(71), expectedUpdatedAt: f.s1.updatedAt, scope: "future" });
    expect((await json(await send())).status).toBe(200);
    expect((await f.store.getSeries(f.s1.id))!.effectiveUntil).toBe("2026-11-08");
    f.begin();
    expect((await json(await send())).status).toBe(200);
    expect(f.writes).toEqual([]);
  });
  it("future on a one-off behaves as this", async () => {
    const f = await fixture();
    const one = await f.seed({ kind: "one_off", studentId: S2, startDate: "2026-10-22", startTime: "18:00" });
    expect((await json(await handleCancelOccurrence(f.deps(), one.id, "2026-10-22", { requestId: REQ(72), expectedUpdatedAt: one.updatedAt, scope: "future" }))).status).toBe(200);
    expect(f.exceptions[0]).toMatchObject({ seriesId: one.id, kind: "cancelled" });
    expect((await f.store.getSeries(one.id))!.effectiveUntil).toBeNull();
  });
  it("a past occurrence is 422", async () => {
    const f = await fixture();
    const older = await f.seed({ startDate: "2026-10-05", startTime: "19:00" });
    for (const scope of ["this", "future"]) {
      expect((await json(await handleCancelOccurrence(f.deps(), older.id, "2026-10-12", { requestId: REQ(73), expectedUpdatedAt: older.updatedAt, scope }))).status).toBe(422);
    }
  });
});

describe("AC12: one-off edits", () => {
  it("scope this may change teacher, subject and duration of a one-off", async () => {
    const f = await fixture();
    const one = await f.seed({ kind: "one_off", studentId: S2, startDate: "2026-10-22", startTime: "18:00" });
    const r = await json(await handleEditOccurrence(f.deps(), one.id, "2026-10-22", edit(one, { changes: { staffId: KUBY, subject: "SCH4U", durationMinutes: 90 } })));
    expect(r.status).toBe(200);
    expect(await f.store.getSeries(one.id)).toMatchObject({ staffId: KUBY, subject: "SCH4U", durationMinutes: 90 });
  });
  it("a teacher change that clashes is rejected before any write", async () => {
    const f = await fixture();
    const one = await f.seed({ kind: "one_off", studentId: S2, startDate: "2026-10-21", startTime: "17:00", staffId: RYAN });
    f.begin();
    // Kuby already teaches S2 on Wed 17:00-18:00 (the student is busy), so the change is refused.
    const r = await json(await handleEditOccurrence(f.deps(), one.id, "2026-10-21", edit(one, { changes: { staffId: KUBY } })));
    expect(r.status).toBe(422);
    expect(f.writes).toEqual([]);
  });
  it("a one-off that was already moved is checked where it now sits when its duration or teacher changes", async () => {
    const f = await fixture();
    const one = await f.seed({ kind: "one_off", studentId: S2, startDate: "2026-10-22", startTime: "18:00" });
    expect((await json(await handleEditOccurrence(f.deps(), one.id, "2026-10-22", edit(one, { changes: { date: "2026-10-23", startTime: "16:00" } })))).status).toBe(200);
    await f.seed({ studentId: S1, kind: "one_off", startDate: "2026-10-23", startTime: "17:00" }); // Ryan, right after the moved class
    f.begin();
    const r = await json(await handleEditOccurrence(f.deps(), one.id, "2026-10-22", edit(one, { requestId: REQ(61), changes: { durationMinutes: 90 } })));
    expect(r).toMatchObject({ status: 422, body: { error: "booking_conflict", problems: [{ date: "2026-10-23", startTime: "16:00", endTime: "17:30", reason: "teacher_busy" }] } });
    expect(f.writes).toEqual([]);
  });
  it("a weekly class with scope this and a teacher, student, subject or duration is 400 use_scope_future", async () => {
    const f = await fixture();
    for (const changes of [{ staffId: KUBY }, { studentId: S2 }, { subject: "X" }, { durationMinutes: 90 }]) {
      expect(await json(await handleEditOccurrence(f.deps(), f.s1.id, "2026-10-26", edit(f.s1, { changes })))).toMatchObject({ status: 400, body: { error: "use_scope_future" } });
    }
  });
});

describe("AC13: teachers cannot book or reschedule", () => {
  it("403 on create, move, and both cancel scopes, and no store write is attempted", async () => {
    const f = await fixture();
    f.begin();
    const t = f.deps(teacher);
    const results = [
      await handleCreateClass(t, create()),
      await handleEditOccurrence(t, f.s1.id, "2026-10-26", edit(f.s1, { changes: { startTime: "16:30" } })),
      await handleEditOccurrence(t, f.s1.id, "2026-10-26", edit(f.s1, { scope: "future", changes: { startTime: "16:30" } })),
      await handleCancelOccurrence(t, f.s1.id, "2026-10-26", { requestId: REQ(80), expectedUpdatedAt: f.s1.updatedAt, scope: "this" }),
      await handleCancelOccurrence(t, f.s1.id, "2026-10-26", { requestId: REQ(81), expectedUpdatedAt: f.s1.updatedAt, scope: "future" }),
    ];
    expect(results.map((r) => r.status)).toEqual([403, 403, 403, 403, 403]);
    expect(f.writes).toEqual([]);
  });
});

describe("AC14: the Weekly Schedule summary", () => {
  it("regenerates for a weekly create, a future split and a future cancel", async () => {
    const f = await fixture();
    f.begin();
    await handleCreateClass(f.deps(), create({ kind: "weekly", startDate: "2026-10-20", startTime: "19:00" }));
    expect(f.notionWrites).toEqual([S2]);
    f.begin();
    await handleEditOccurrence(f.deps(), f.s1.id, "2026-11-09", edit(f.s1, { scope: "future", changes: { startTime: "17:00" } }));
    expect(f.notionWrites).toContain(S1);
    f.begin();
    const next = (await f.store.getSeries(f.s1.id))!;
    const cx = await json(await handleCancelOccurrence(f.deps(), f.s1.id, "2026-11-02", { requestId: REQ(90), expectedUpdatedAt: next.updatedAt, scope: "future" }));
    expect(cx).toMatchObject({ status: 200 });
    expect(f.notionWrites).toContain(S1);
  });
  it("makes no Notion call for a this move, a this cancel, or a one-off edit", async () => {
    const f = await fixture();
    const one = await f.seed({ kind: "one_off", studentId: S2, startDate: "2026-10-22", startTime: "18:00" });
    f.begin();
    await handleEditOccurrence(f.deps(), f.s1.id, "2026-10-26", edit(f.s1, { changes: { date: "2026-10-27", startTime: "16:00" } }));
    await handleCancelOccurrence(f.deps(), f.s1.id, "2026-11-02", { requestId: REQ(91), expectedUpdatedAt: f.s1.updatedAt, scope: "this" });
    await handleEditOccurrence(f.deps(), one.id, "2026-10-22", edit(one, { requestId: REQ(92), changes: { subject: "SCH4U" } }));
    expect(f.notionWrites).toEqual([]);
  });
});
