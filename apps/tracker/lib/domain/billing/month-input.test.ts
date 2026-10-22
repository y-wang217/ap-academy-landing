import { describe, expect, it } from "vitest";
import type { ClassException, ClassSeries } from "../schedule/recurrence";
import { buildBillingInput, type OutcomeInput } from "./month-input";

// REQ-40 AC2, AC3 and the occurrence fields of the export.
const T1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const S1 = "11111111-1111-4111-8111-111111111111";
const S2 = "22222222-2222-4222-8222-222222222222";
const id = (n: number) => `50000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const synced = (studentId: string) => ({ studentId, sync: { state: "synced" as const, stale: false } });
const weekly = (over: Partial<ClassSeries>): ClassSeries => ({
  id: id(1), staffId: T1, studentId: S1, subject: "MPM2D Math", kind: "weekly", startDate: "2026-09-01", startTime: "17:00", durationMinutes: 60, effectiveUntil: null, ...over,
});
const build = (series: ClassSeries[], exceptions: ClassException[] = [], outcomes: OutcomeInput[] = [], month = "2026-11", now = "2026-11-20T12:00:00.000Z") =>
  buildBillingInput({ month, now, students: [synced(S1), synced(S2)], series, exceptions, outcomes });

describe("buildBillingInput", () => {
  it("carries the versions, the month and one entry per adopted student, an empty one included", () => {
    const out = build([weekly({})]);
    expect(out).toMatchObject({ schemaVersion: 1, rulesVersion: 1, month: "2026-11", asOf: "2026-11-20T12:00:00.000Z" });
    expect(out.students.map((s) => s.studentId)).toEqual([S1, S2]);
    expect(out.students[1].occurrences).toEqual([]);
  });

  it("an occurrence carries its ref, teacher, state, outcome and charge state", () => {
    const out = build([weekly({})], [], [{ seriesId: id(1), originalDate: "2026-11-03", outcome: "delivered", pending: false }]);
    expect(out.students[0].occurrences[0]).toEqual({
      occurrenceRef: `sched:${id(1)}:2026-11-03`, seriesId: id(1), originalDate: "2026-11-03", date: "2026-11-03", startTime: "17:00", durationMinutes: 60,
      subject: "MPM2D Math", teacherId: T1, schedulerState: "scheduled", purpose: null, movedFrom: null, makeupFor: null, unlinkedMakeup: false,
      outcome: "delivered", chargeState: "chargeable", unconfirmed: false,
    });
    expect(out.students[0].occurrences.map((o) => [o.date, o.chargeState, o.unconfirmed])).toEqual([
      ["2026-11-03", "chargeable", false], ["2026-11-10", "chargeable", true], ["2026-11-17", "chargeable", true], ["2026-11-24", "not_charged", false],
    ]);
  });

  it("a moved class keys its outcome on the original date and says where it came from", () => {
    const moved: ClassException = { id: id(90), seriesId: id(1), originalDate: "2026-11-17", kind: "moved", newDate: "2026-11-19", newStartTime: "18:00" };
    const o = build([weekly({})], [moved], [{ seriesId: id(1), originalDate: "2026-11-17", outcome: "no_show", pending: false }]).students[0].occurrences.find((x) => x.originalDate === "2026-11-17")!;
    expect(o).toMatchObject({ date: "2026-11-19", startTime: "18:00", schedulerState: "moved", movedFrom: "2026-11-17", outcome: "no_show", chargeState: "forfeit_pending" });
  });

  it("AC2: a makeup next month for a cancellation this month, before and after it is delivered", () => {
    const cancel: ClassException = { id: id(91), seriesId: id(1), originalDate: "2026-11-24", kind: "cancelled", newDate: null, newStartTime: null };
    const makeup = weekly({ id: id(2), kind: "one_off", startDate: "2026-12-03", purpose: "makeup", makeupFor: id(91) });
    const before = build([weekly({}), makeup], [cancel], [], "2026-11", "2026-11-25T12:00:00.000Z");
    expect(before.students[0].occurrences.find((o) => o.date === "2026-11-24")).toMatchObject({ schedulerState: "cancelled", chargeState: "credit_owed" });
    const delivered: OutcomeInput[] = [{ seriesId: id(2), originalDate: "2026-12-03", outcome: "delivered", pending: false }];
    const nov = build([weekly({}), makeup], [cancel], delivered, "2026-11", "2026-12-04T12:00:00.000Z");
    expect(nov.students[0].occurrences.find((o) => o.date === "2026-11-24")).toMatchObject({ chargeState: "not_charged" });
    const dec = build([weekly({}), makeup], [cancel], delivered, "2026-12", "2026-12-04T12:00:00.000Z");
    const m = dec.students[0].occurrences.find((o) => o.seriesId === id(2))!;
    expect(m).toMatchObject({ schedulerState: "one_off", purpose: "makeup", makeupFor: "2026-11-24", unlinkedMakeup: false, chargeState: "made_up" });
    for (const out of [before, nov, dec]) {
      expect(out.students[0].occurrences.filter((o) => o.seriesId === id(2) || o.date === "2026-11-24").every((o) => o.chargeState !== "chargeable")).toBe(true);
    }
  });

  it("a makeup with no link, or a link to an exception that is gone, is flagged and never charged", () => {
    const lone = weekly({ id: id(3), kind: "one_off", startDate: "2026-11-14", startTime: "10:00", purpose: "makeup", makeupFor: null });
    const stale = weekly({ id: id(4), kind: "one_off", startDate: "2026-11-15", startTime: "10:00", purpose: "makeup", makeupFor: id(99) });
    const outcomes: OutcomeInput[] = [{ seriesId: id(4), originalDate: "2026-11-15", outcome: "delivered", pending: false }];
    const occ = build([lone, stale], [], outcomes).students[0].occurrences;
    expect(occ.map((o) => [o.unlinkedMakeup, o.makeupFor, o.chargeState])).toEqual([[true, null, "not_charged"], [true, null, "made_up"]]);
  });

  it("AC3: a weekly series split on the 15th yields each line only on its own dates, and every Monday once", () => {
    const old = weekly({ id: id(5), startDate: "2026-09-07", startTime: "16:00", effectiveUntil: "2026-11-15" });
    const next = weekly({ id: id(6), startDate: "2026-11-16", startTime: "18:00", durationMinutes: 90 });
    const occ = build([old, next]).students[0].occurrences;
    expect(occ.filter((o) => o.seriesId === id(5)).map((o) => o.date)).toEqual(["2026-11-02", "2026-11-09"]);
    expect(occ.filter((o) => o.seriesId === id(6)).map((o) => o.date)).toEqual(["2026-11-16", "2026-11-23", "2026-11-30"]);
    const mondays = ["2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23", "2026-11-30"];
    expect(occ.map((o) => o.date)).toEqual(mondays);
    expect(new Set(occ.map((o) => o.date)).size).toBe(occ.length);
  });

  it("sorts each student's classes by date, then start time", () => {
    const a = weekly({ id: id(7), startDate: "2026-11-02", startTime: "18:00" });
    const b = weekly({ id: id(8), startDate: "2026-11-02", startTime: "09:00" });
    const occ = build([a, b]).students[0].occurrences;
    expect(occ.slice(0, 2).map((o) => o.startTime)).toEqual(["09:00", "18:00"]);
  });

  it("only the student's own series reach their entry", () => {
    const out = build([weekly({}), weekly({ id: id(9), studentId: S2 })]);
    expect(out.students[1].occurrences.every((o) => o.seriesId === id(9))).toBe(true);
    expect(out.students[0].occurrences.every((o) => o.seriesId === id(1))).toBe(true);
  });
});
