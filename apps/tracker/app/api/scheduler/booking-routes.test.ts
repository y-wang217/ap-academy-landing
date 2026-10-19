import { describe, expect, it } from "vitest";
import {
  handleCancelOccurrence, handleCreateClass, handleEditOccurrence, handleOccurrences, handleStudentCancellations,
} from "../../../lib/scheduler/schedule-handlers";
import type { LockedWrite, ScheduleStore, SeriesRecord } from "../../../lib/scheduler/schedule-store";
import { NotionError } from "../../../lib/notion/staff";
import { syncStudentSummary } from "../../../lib/scheduler/summary-sync";
import { fixture, KUBY, MIA, REQ, RYAN, S1, S2, teacher, WRITES } from "./booking-world.fake";

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
    deps.store = { ...f.store, readWriteContext: async () => { throw new Error("down"); } } as never;
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
  it("writes nothing to Notion for a this move, a this cancel, or a one-off edit once the summary is current", async () => {
    const f = await fixture();
    const one = await f.seed({ kind: "one_off", studentId: S2, startDate: "2026-10-22", startTime: "18:00" });
    // REQ-35: every class write delivers the summary, which reads Notion first and writes only when the weekly text changed.
    const d = f.deps();
    for (const id of [S1, S2]) await syncStudentSummary({ store: f.store, students: d.students!, fetchStaff: d.fetchStaff, today: d.today }, id);
    f.begin();
    await handleEditOccurrence(f.deps(), f.s1.id, "2026-10-26", edit(f.s1, { changes: { date: "2026-10-27", startTime: "16:00" } }));
    await handleCancelOccurrence(f.deps(), f.s1.id, "2026-11-02", { requestId: REQ(91), expectedUpdatedAt: f.s1.updatedAt, scope: "this" });
    await handleEditOccurrence(f.deps(), one.id, "2026-10-22", edit(one, { requestId: REQ(92), changes: { subject: "SCH4U" } }));
    expect(f.notionWrites).toEqual([]);
  });
});

// REQ-30: two conflicting bookings cannot both succeed (tracker ADR 0050). ------------------

/** The class writes of the design's call-sequence table, each from a fresh fixture. */
const OPS = {
  create: async (f: Awaited<ReturnType<typeof fixture>>) => handleCreateClass(f.deps(), create()),
  move: async (f: Awaited<ReturnType<typeof fixture>>) =>
    handleEditOccurrence(f.deps(), f.s1.id, "2026-10-26", edit(f.s1, { requestId: REQ(201), changes: { date: "2026-10-27", startTime: "16:00" } })),
  oneOff: async (f: Awaited<ReturnType<typeof fixture>>, one: SeriesRecord) =>
    handleEditOccurrence(f.deps(), one.id, "2026-10-22", edit(one, { requestId: REQ(202), changes: { staffId: KUBY, startTime: "19:00" } })),
  split: async (f: Awaited<ReturnType<typeof fixture>>) =>
    handleEditOccurrence(f.deps(), f.s1.id, "2026-11-09", edit(f.s1, { requestId: REQ(203), scope: "future", changes: { startTime: "17:00" } })),
  cancel: async (f: Awaited<ReturnType<typeof fixture>>) =>
    handleCancelOccurrence(f.deps(), f.s1.id, "2026-10-26", { requestId: REQ(204), expectedUpdatedAt: f.s1.updatedAt, scope: "this" }),
  endSeries: async (f: Awaited<ReturnType<typeof fixture>>) =>
    handleCancelOccurrence(f.deps(), f.s1.id, "2026-11-09", { requestId: REQ(205), expectedUpdatedAt: f.s1.updatedAt, scope: "future" }),
};
type Op = keyof typeof OPS;
async function run(op: Op) {
  const f = await fixture();
  const one = await f.seed({ kind: "one_off", studentId: S2, startDate: "2026-10-22", startTime: "18:00" });
  f.begin();
  const res = await OPS[op](f, one);
  return { f, one, res: await json(res), again: () => OPS[op](f, one) };
}

describe("REQ-30 AC4: a change between the check and the write", () => {
  it("re-reads, re-checks and returns the real clash as 422 booking_conflict", async () => {
    const f = await fixture();
    f.begin();
    // Another tab books Ryan at 16:30 on 2026-10-20 after this create was checked.
    f.raceNext(() => { void f.seed({ studentId: S1, kind: "one_off", startDate: "2026-10-20", startTime: "16:30" }); });
    const r = await json(await handleCreateClass(f.deps(), create()));
    expect(r).toMatchObject({ status: 422, body: { error: "booking_conflict", problems: [{ date: "2026-10-20", reason: "teacher_busy" }] } });
    expect(f.calls.filter((c) => c === "readWriteContext")).toHaveLength(2);
    expect(f.series.size).toBe(3); // s1, s2 and the other tab's class
  });
  it("a change that is not a clash: the second attempt writes", async () => {
    const f = await fixture();
    f.begin();
    f.raceNext(() => f.bump({ kind: "staff", id: RYAN }));
    expect((await json(await handleCreateClass(f.deps(), create()))).status).toBe(201);
    expect(f.calls.filter((c) => c === "lockedWrite")).toHaveLength(2);
  });
  it("a second change in a row is 409 stale and nothing is written", async () => {
    const f = await fixture();
    f.begin();
    f.raceNext(() => {
      f.bump({ kind: "staff", id: RYAN });
      f.raceNext(() => f.bump({ kind: "student", id: S2 }));
    });
    expect(await json(await handleCreateClass(f.deps(), create()))).toMatchObject({ status: 409, body: { error: "stale" } });
    expect(f.series.size).toBe(2);
  });
  it("AC8b: the same request landing first in another tab is 200 with that series", async () => {
    const f = await fixture();
    f.begin();
    const { requestId, ...fields } = create();
    f.raceNext(async () => {
      const ctx = await f.store.readWriteContext(requestId, [{ kind: "staff", id: RYAN }, { kind: "student", id: S2 }]);
      await f.store.lockedWrite({ op: "create", requestId, stamps: ctx.stamps, series: fields as never });
    });
    const r = await json(await handleCreateClass(f.deps(), create()));
    expect(r.status).toBe(200);
    expect(f.series.size).toBe(3);
    expect(r.body.series.id).toBe(f.log.get(requestId)!.result.id);
  });
});

describe("REQ-30 AC5: the locked write is the only class write", () => {
  it("the store's writes are exactly lockedWrite, adoptStudent and markSummary", () => {
    expect([...WRITES]).toEqual(["lockedWrite", "adoptStudent", "markSummary"]);
    type Has<K extends string> = K extends keyof ScheduleStore ? true : false;
    const removed: [Has<"createSeries">, Has<"upsertException">, Has<"split">, Has<"endSeries">, Has<"updateSeriesFields">, Has<"getSeriesByRequest">] =
      [false, false, false, false, false, false];
    expect(removed.every((x) => x === false)).toBe(true);
  });
});

describe("REQ-30 AC6 and AC12b: the write context comes first, and the call sequence", () => {
  const AFTER: Record<Op, string[]> = {
    create: ["readWriteContext", "listSeries", "listSeriesForStudent", "listWindows", "listAvailabilityExceptions", "getSummary", "lockedWrite"],
    move: ["getSeries", "readWriteContext", "listSeries", "listSeries", "listSeriesForStudent", "listWindows", "listAvailabilityExceptions", "lockedWrite"],
    oneOff: ["getSeries", "readWriteContext", "listSeries", "listSeries", "listSeriesForStudent", "listWindows", "listAvailabilityExceptions", "lockedWrite"],
    split: ["getSeries", "readWriteContext", "listSeries", "listSeriesForStudent", "listSeries", "listSeriesForStudent", "listWindows", "listAvailabilityExceptions", "lockedWrite"],
    cancel: ["getSeries", "readWriteContext", "listSeries", "lockedWrite"],
    endSeries: ["getSeries", "readWriteContext", "listSeries", "lockedWrite"],
  };
  const READS = ["listSeries", "listSeriesForStudent", "listWindows", "listAvailabilityExceptions"];
  for (const op of Object.keys(OPS) as Op[]) {
    it(`${op}: exact store calls up to the write, context before every read, its stamps passed unchanged`, async () => {
      const { f, res } = await run(op);
      expect(res.status).toBeLessThan(300);
      const upTo = f.calls.slice(0, f.calls.indexOf("lockedWrite") + 1);
      expect(upTo).toEqual(AFTER[op]);
      const ctx = upTo.indexOf("readWriteContext");
      upTo.forEach((c, i) => { if (READS.includes(c)) expect(i).toBeGreaterThan(ctx); });
      expect(f.stampsSeen.written).toEqual([f.stampsSeen.read[0]]);
    });
  }
});

describe("REQ-30 AC7: a stale position found under the lock", () => {
  it("is 409 stale and writes nothing", async () => {
    const f = await fixture();
    f.begin();
    // Another tab moved the occurrence without touching any stamp: only the position check under the lock sees it.
    f.raceNext(() => { f.exceptions.push({ seriesId: f.s1.id, originalDate: "2026-10-26", kind: "moved", newDate: "2026-10-28", newStartTime: "16:00", requestId: REQ(299) }); });
    const r = await json(await handleCancelOccurrence(f.deps(), f.s1.id, "2026-10-26", { requestId: REQ(206), expectedUpdatedAt: f.s1.updatedAt, scope: "this" }));
    expect(r).toMatchObject({ status: 409, body: { error: "stale" } });
    expect(f.log.has(REQ(206))).toBe(false);
  });
});

describe("REQ-30 AC8a and AC9: retries", () => {
  for (const op of Object.keys(OPS) as Op[]) {
    it(`${op}: a retry after it finished is 200 with the first series and writes nothing`, async () => {
      const { f, res, again } = await run(op);
      f.begin();
      const size = f.series.size;
      const exceptions = JSON.stringify(f.exceptions);
      const r = await json(await again());
      expect(r.status).toBe(200);
      expect(r.body.series.id).toBe(res.body.series.id);
      // A create's retry re-runs its summary sync (markSummary), as before; no class write happens.
      expect(f.writes.filter((w) => w !== "markSummary")).toEqual([]);
      expect(f.series.size).toBe(size);
      expect(JSON.stringify(f.exceptions)).toBe(exceptions);
    });
  }
  it("the same requestId for another operation or another series is 400 invalid_request", async () => {
    const { f } = await run("create");
    f.begin();
    const other = await json(await handleCancelOccurrence(f.deps(), f.s1.id, "2026-10-26", { requestId: REQ(1), expectedUpdatedAt: f.s1.updatedAt, scope: "this" }));
    expect(other).toMatchObject({ status: 400, body: { error: "invalid_request" } });
    await OPS.cancel(f);
    f.begin();
    const elsewhere = await json(await handleCancelOccurrence(f.deps(), f.s2.id, "2026-10-28", { requestId: REQ(204), expectedUpdatedAt: f.s2.updatedAt, scope: "this" }));
    expect(elsewhere).toMatchObject({ status: 400, body: { error: "invalid_request" } });
    expect(f.writes).toEqual([]);
  });
});

describe("REQ-30 AC14: storage refuses the write", () => {
  for (const op of Object.keys(OPS) as Op[]) {
    it(`${op}: 503 scheduler_unavailable and nothing written`, async () => {
      const f = await fixture();
      const one = await f.seed({ kind: "one_off", studentId: S2, startDate: "2026-10-22", startTime: "18:00" });
      const before = { series: JSON.stringify([...f.series.values()]), exceptions: f.exceptions.length };
      const down = { ...f.deps(), store: { ...f.store, lockedWrite: async () => ({ ok: false as const, status: 503 as const, error: "unavailable" as const }) } };
      const r = await json(await OPS[op]({ ...f, deps: () => down }, one));
      expect(r).toEqual({ status: 503, body: { error: "scheduler_unavailable" } });
      expect(JSON.stringify([...f.series.values()])).toBe(before.series);
      expect(f.exceptions).toHaveLength(before.exceptions);
    });
  }
});

describe("REQ-31 AC9: one-off purpose and makeup link on create", () => {
  const X = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1";
  /** S2's weekly class with Kuby, cancelled on Wed 2026-10-21, as exception X. */
  const withCancel = async () => {
    const f = await fixture();
    f.exceptions.push({ id: X, seriesId: f.s2.id, originalDate: "2026-10-21", kind: "cancelled", newDate: null, newStartTime: null, requestId: REQ(900) });
    return f;
  };
  it("stores each purpose, and null when none is sent", async () => {
    const f = await fixture();
    for (const [i, purpose] of (["makeup", "trial", "extra", null] as const).entries()) {
      const r = await json(await handleCreateClass(f.deps(), create({ requestId: REQ(200 + i), startDate: "2026-10-20", startTime: `1${5 + i}:00`, ...(purpose ? { purpose } : {}) })));
      expect(r.status).toBe(201);
      expect(r.body.series).toMatchObject({ purpose, makeupFor: null });
      expect((await f.store.getSeries(r.body.series.id))!.purpose ?? null).toBe(purpose);
    }
  });
  it("a purpose on a weekly class is 400 and writes nothing", async () => {
    const f = await fixture();
    f.begin();
    expect((await handleCreateClass(f.deps(), create({ kind: "weekly", purpose: "trial", startTime: "19:00" }))).status).toBe(400);
    expect(f.writes).toEqual([]);
  });
  it("a valid link to the student's cancellation is 201 and stored", async () => {
    const f = await withCancel();
    const r = await json(await handleCreateClass(f.deps(), create({ purpose: "makeup", makeupFor: X })));
    expect(r.status).toBe(201);
    expect(r.body.series).toMatchObject({ purpose: "makeup", makeupFor: X });
    expect((await f.store.getSeries(r.body.series.id))!.makeupFor).toBe(X);
  });
  it("a link with purpose trial is 422 invalid_makeup_for and writes nothing", async () => {
    const f = await withCancel();
    f.begin();
    expect(await json(await handleCreateClass(f.deps(), create({ purpose: "trial", makeupFor: X })))).toMatchObject({ status: 422, body: { error: "invalid_makeup_for" } });
    expect(await json(await handleCreateClass(f.deps(), create({ requestId: REQ(2), makeupFor: X })))).toMatchObject({ status: 422, body: { error: "invalid_makeup_for" } });
    expect(f.writes).toEqual([]);
  });
  it("a link to another student's cancellation is 422", async () => {
    const f = await withCancel();
    f.begin();
    // X is S2's; this makeup is for S1 (with Ryan on Tue).
    expect(await json(await handleCreateClass(f.deps(), create({ studentId: S1, purpose: "makeup", makeupFor: X })))).toMatchObject({ status: 422, body: { error: "invalid_makeup_for" } });
    expect(f.writes).toEqual([]);
  });
  it("a link to a moved exception, or to no exception, is 422", async () => {
    const f = await withCancel();
    f.exceptions[0] = { ...f.exceptions[0], kind: "moved", newDate: "2026-10-22", newStartTime: "17:00" };
    f.begin();
    expect(await json(await handleCreateClass(f.deps(), create({ purpose: "makeup", makeupFor: X })))).toMatchObject({ status: 422, body: { error: "invalid_makeup_for" } });
    expect(await json(await handleCreateClass(f.deps(), create({ requestId: REQ(3), purpose: "makeup", makeupFor: REQ(999) })))).toMatchObject({ status: 422, body: { error: "invalid_makeup_for" } });
    expect(f.writes).toEqual([]);
  });
});

describe("REQ-31 AC10: purpose and link on a one-off edit", () => {
  const X = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1";
  /** S2's Wed 2026-10-21 cancellation X, and a Thu 18:00 one-off makeup for S2 linked to it. */
  const linked = async () => {
    const f = await fixture();
    f.exceptions.push({ id: X, seriesId: f.s2.id, originalDate: "2026-10-21", kind: "cancelled", newDate: null, newStartTime: null, requestId: REQ(900) });
    const one = await f.seed({ kind: "one_off", studentId: S2, startDate: "2026-10-22", startTime: "18:00", purpose: "makeup", makeupFor: X });
    const sent: LockedWrite[] = [];
    const deps = f.deps();
    deps.store = { ...f.store, lockedWrite: async (w: LockedWrite) => { sent.push(w); return f.store.lockedWrite(w); } } as ScheduleStore;
    return { ...f, one, sent, d: deps };
  };
  it("saves a purpose and a link through the one-off write", async () => {
    const f = await fixture();
    f.exceptions.push({ id: X, seriesId: f.s2.id, originalDate: "2026-10-21", kind: "cancelled", newDate: null, newStartTime: null, requestId: REQ(900) });
    const one = await f.seed({ kind: "one_off", studentId: S2, startDate: "2026-10-22", startTime: "18:00" });
    const r = await json(await handleEditOccurrence(f.deps(), one.id, "2026-10-22", edit(one, { changes: { purpose: "makeup", makeupFor: X } })));
    expect(r.status).toBe(200);
    expect(r.body.series).toMatchObject({ purpose: "makeup", makeupFor: X });
    expect(await f.store.getSeries(one.id)).toMatchObject({ purpose: "makeup", makeupFor: X });
  });
  it("is stale-checked", async () => {
    const f = await fixture();
    const one = await f.seed({ kind: "one_off", studentId: S2, startDate: "2026-10-22", startTime: "18:00" });
    f.begin();
    expect(await json(await handleEditOccurrence(f.deps(), one.id, "2026-10-22", { requestId: REQ(55), expectedUpdatedAt: "2020-01-01T00:00:00.000Z", changes: { purpose: "trial" } })))
      .toMatchObject({ status: 409, body: { error: "stale" } });
    expect(f.writes).toEqual([]);
  });
  it("either field on a weekly series is 400", async () => {
    const f = await fixture();
    f.begin();
    for (const changes of [{ purpose: "trial" }, { purpose: null }, { makeupFor: X }]) {
      expect(await json(await handleEditOccurrence(f.deps(), f.s1.id, "2026-10-26", edit(f.s1, { changes })))).toMatchObject({ status: 400, body: { error: "one_off_only" } });
      expect(await json(await handleEditOccurrence(f.deps(), f.s1.id, "2026-10-26", edit(f.s1, { scope: "future", changes })))).toMatchObject({ status: 400, body: { error: "one_off_only" } });
    }
    expect(f.writes).toEqual([]);
  });
  it("purpose null on a linked makeup clears the link in the same single write", async () => {
    const f = await linked();
    const r = await json(await handleEditOccurrence(f.d, f.one.id, "2026-10-22", edit(f.one, { changes: { purpose: null } })));
    expect(r.status).toBe(200);
    expect(f.sent).toHaveLength(1);
    expect(f.sent[0]).toMatchObject({ op: "edit_one_off", fields: { purpose: null, makeupFor: null } });
    expect(await f.store.getSeries(f.one.id)).toMatchObject({ purpose: null, makeupFor: null });
  });
  it("purpose trial on a linked makeup clears the link in the same single write", async () => {
    const f = await linked();
    const r = await json(await handleEditOccurrence(f.d, f.one.id, "2026-10-22", edit(f.one, { changes: { purpose: "trial" } })));
    expect(r.status).toBe(200);
    expect(f.sent).toHaveLength(1);
    expect(f.sent[0]).toMatchObject({ op: "edit_one_off", fields: { purpose: "trial", makeupFor: null } });
  });
  it("purpose extra with a link is 422 and writes nothing", async () => {
    const f = await linked();
    f.begin();
    expect(await json(await handleEditOccurrence(f.d, f.one.id, "2026-10-22", edit(f.one, { changes: { purpose: "extra", makeupFor: X } }))))
      .toMatchObject({ status: 422, body: { error: "invalid_makeup_for" } });
    expect(f.sent).toEqual([]);
  });
  it("a link on a series whose purpose is not makeup is 422", async () => {
    const f = await fixture();
    f.exceptions.push({ id: X, seriesId: f.s2.id, originalDate: "2026-10-21", kind: "cancelled", newDate: null, newStartTime: null, requestId: REQ(900) });
    const one = await f.seed({ kind: "one_off", studentId: S2, startDate: "2026-10-22", startTime: "18:00", purpose: "trial" });
    f.begin();
    expect(await json(await handleEditOccurrence(f.deps(), one.id, "2026-10-22", edit(one, { changes: { makeupFor: X } }))))
      .toMatchObject({ status: 422, body: { error: "invalid_makeup_for" } });
    expect(f.writes).toEqual([]);
  });
});

describe("REQ-31 AC11: the student's cancellations", () => {
  // Today is 2026-10-19: the window is 2026-08-24 (day -56) to 2026-11-16 (day +28).
  const seedCancels = async () => {
    const f = await fixture();
    const id = (n: number) => `eeeeeeee-eeee-4eee-8eee-${String(n).padStart(12, "0")}`;
    const at = (n: number, seriesId: string, date: string, kind: "cancelled" | "moved" = "cancelled") =>
      f.exceptions.push({ id: id(n), seriesId, originalDate: date, kind, newDate: kind === "moved" ? "2026-10-30" : null, newStartTime: kind === "moved" ? "18:00" : null, requestId: REQ(900 + n) });
    // S1's weekly class is Mondays from 2026-10-19; an older S1 series gives the past dates.
    const old = await f.seed({ startDate: "2026-08-03", effectiveUntil: "2026-10-12", subject: "SCH4U", startTime: "15:00" });
    at(1, old.id, "2026-08-24"); // day -56: in
    at(2, old.id, "2026-08-17"); // day -63 (-57 is not a Monday): out
    at(3, f.s1.id, "2026-11-16"); // day +28: in
    at(4, f.s1.id, "2026-11-23"); // day +35 (+29 is not a Monday): out
    at(5, f.s1.id, "2026-10-26", "moved"); // a move: never listed
    at(6, f.s2.id, "2026-10-21"); // S2's: never in S1's list
    return { f, id };
  };
  const ask = (deps: Parameters<typeof handleStudentCancellations>[0], studentId: string) =>
    handleStudentCancellations(deps, new URLSearchParams({ studentId }));
  it("returns the window's cancellations, newest first, with date, start time and subject", async () => {
    const { f, id } = await seedCancels();
    const r = await json(await ask(f.deps(), S1));
    expect(r.status).toBe(200);
    expect(r.body.cancellations).toEqual([
      { exceptionId: id(3), date: "2026-11-16", startTime: "16:00", subject: "MHF4U" },
      { exceptionId: id(1), date: "2026-08-24", startTime: "15:00", subject: "SCH4U" },
    ]);
  });
  it("keeps the edges exactly: day -56 and +28 in, -57 and +29 out", async () => {
    const f = await fixture();
    const one = (date: string) => f.seed({ kind: "one_off", startDate: date, startTime: "09:00" });
    const dates = ["2026-08-23", "2026-08-24", "2026-11-16", "2026-11-17"];
    for (const [i, date] of dates.entries()) {
      const s = await one(date);
      f.exceptions.push({ id: `eeeeeeee-eeee-4eee-8eee-00000000010${i}`, seriesId: s.id, originalDate: date, kind: "cancelled", newDate: null, newStartTime: null, requestId: REQ(950 + i) });
    }
    const got = (await json(await ask(f.deps(), S1))).body.cancellations.map((c: { date: string }) => c.date);
    expect(got).toEqual(["2026-11-16", "2026-08-24"]);
  });
  it("is admin only: a teacher gets 403", async () => {
    const { f } = await seedCancels();
    expect((await ask(f.deps(teacher), S1)).status).toBe(403);
  });
  it("a bad studentId is 400", async () => {
    const { f } = await seedCancels();
    expect((await ask(f.deps(), "nope")).status).toBe(400);
    expect((await handleStudentCancellations(f.deps(), new URLSearchParams())).status).toBe(400);
  });
});

// REQ-35: a save delivers the exports its own write enqueued (tracker ADR 0053). ------------

describe("REQ-35 AC8: a save delivers its own exports", () => {
  const ORG_KEY = `daily_task:${"10000000-0000-4000-8000-000000000001"}`;
  const failingWrite = (f: Awaited<ReturnType<typeof fixture>>, error: Error) => {
    const d = f.deps();
    return { ...d, students: { ...d.students!, write: async () => { throw error; } } };
  };

  it("create, move and cancel responses carry exports, and findPending is asked for the touched student and today's task", async () => {
    const f = await fixture();
    const created = await json(await handleCreateClass(f.deps(), create()));
    expect(created.body.exports).toEqual([
      expect.objectContaining({ kind: "summary", status: "done" }),
      expect.objectContaining({ kind: "daily_task", status: "done" }),
    ]);
    expect(created.body.summarySync).toBe("synced");
    expect(f.outbox.asked.at(-1)).toEqual([ORG_KEY, `summary:${S2}`].sort());
    const moved = await json(await handleEditOccurrence(f.deps(), f.s1.id, "2026-10-26", edit(f.s1, { requestId: REQ(60), changes: { date: "2026-10-27", startTime: "16:00" } })));
    expect(moved.body.exports).toHaveLength(2);
    expect(f.outbox.asked.at(-1)).toEqual([ORG_KEY, `summary:${S1}`].sort());
    const cancelled = await json(await handleCancelOccurrence(f.deps(), f.s2.id, "2026-10-28", { requestId: REQ(61), expectedUpdatedAt: f.s2.updatedAt, scope: "this" }));
    expect(cancelled.body.exports).toHaveLength(2);
    expect(f.outbox.rows.every((r) => r.status === "done")).toBe(true);
  });

  it("a future edit that moves a class to another student passes both students' keys", async () => {
    const f = await fixture();
    const r = await json(await handleEditOccurrence(f.deps(), f.s1.id, "2026-11-09", edit(f.s1, { scope: "future", changes: { studentId: S2 } })));
    expect(r.status).toBe(200);
    expect(f.outbox.asked.at(-1)).toEqual([ORG_KEY, `summary:${S1}`, `summary:${S2}`].sort());
    expect(r.body.exports.filter((e: { kind: string }) => e.kind === "summary")).toHaveLength(2);
  });

  it("a Notion 500 on the first attempt answers summarySync queued and leaves the row pending", async () => {
    const f = await fixture();
    const r = await json(await handleCreateClass(failingWrite(f, new NotionError("Notion returned 500", 500)), create()));
    expect(r.status).toBe(201);
    expect(r.body.summarySync).toBe("queued");
    expect(f.outbox.rows.find((x) => x.kind === "summary")).toMatchObject({ status: "pending", attempts: 1 });
  });

  it("a Notion 404 answers summarySync failed", async () => {
    const f = await fixture();
    const r = await json(await handleCreateClass(failingWrite(f, new NotionError("Notion returned 404", 404)), create()));
    expect(r.body.summarySync).toBe("failed");
    expect(r.body.exports).toContainEqual(expect.objectContaining({ kind: "summary", status: "failed" }));
  });

  it("the retry branch of create delivers a row that is still pending", async () => {
    const f = await fixture();
    await handleCreateClass(failingWrite(f, new NotionError("Notion returned 500", 500)), create());
    const row = f.outbox.rows.find((x) => x.kind === "summary")!;
    row.nextAttemptAt = new Date(0).toISOString(); // due again
    f.begin();
    const again = await json(await handleCreateClass(f.deps(), create()));
    expect(again.status).toBe(200);
    expect(again.body.summarySync).toBe("synced");
    expect(row.status).toBe("done");
    expect(f.notionWrites).toEqual([S2]);
  });

  it("a save whose rows a concurrent drain already took reports queued", async () => {
    const f = await fixture();
    const d = f.deps();
    const r = await json(await handleCreateClass({ ...d, outbox: { ...d.outbox!, findPending: async () => [] } }, create()));
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ summarySync: "queued", exports: [] });
  });
});
