import { describe, expect, it } from "vitest";
import { computeAvailability, type AvailabilityException, type AvailabilityWindow } from "./availability";
import { findConflicts } from "./conflicts";
import type { Occurrence } from "./recurrence";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TODAY = "2026-10-14"; // Wednesday
const MON = "2026-10-19";
const RANGE = { from: TODAY, to: "2026-11-30" };

const win = (weekday: number, startTime: string, endTime: string): AvailabilityWindow => ({
  weekday, startTime, endTime, effectiveFrom: "2026-01-01", effectiveUntil: null,
});
const occ = (date: string, startTime: string, endTime: string, over: Partial<Occurrence> = {}): Occurrence => ({
  occurrenceKey: `k-${date}-${startTime}`, seriesId: "s", originalDate: date, date, startTime, endTime, durationMinutes: 60,
  startsAt: "", endsAt: "", staffId: A, studentId: "st", subject: "MHF4U", status: "scheduled", kind: "weekly", ...over,
});
const avail = (staff: string, windows: AvailabilityWindow[], exceptions: AvailabilityException[] = []) =>
  new Map([[staff, { days: computeAvailability(windows, exceptions, RANGE), exceptions }]]);

describe("findConflicts (AC7)", () => {
  it("a class that exactly fills an interval fits", () => {
    const r = findConflicts([occ(MON, "09:00", "12:00")], avail(A, [win(1, "09:00", "12:00")]), TODAY);
    expect(r.conflicts).toEqual([]);
  });
  it("back-to-back classes across touching windows fit", () => {
    const w = [win(1, "09:00", "12:00"), win(1, "12:00", "14:00")];
    expect(findConflicts([occ(MON, "11:00", "13:00")], avail(A, w), TODAY).conflicts).toEqual([]);
  });
  it("a partial overlap is outside_availability", () => {
    const r = findConflicts([occ(MON, "11:30", "12:30")], avail(A, [win(1, "09:00", "12:00")]), TODAY);
    expect(r.conflicts.map((c) => c.reason)).toEqual(["outside_availability"]);
  });
  it("a day with no window is outside_availability", () => {
    const r = findConflicts([occ("2026-10-20", "10:00", "11:00")], avail(A, [win(1, "09:00", "12:00")]), TODAY);
    expect(r.conflicts).toHaveLength(1);
  });
  it("time off over part of the class gives reason time_off", () => {
    const off: AvailabilityException = { onDate: MON, kind: "time_off", startTime: "10:30", endTime: "11:30" };
    const r = findConflicts([occ(MON, "10:00", "11:00")], avail(A, [win(1, "09:00", "12:00")], [off]), TODAY);
    expect(r.conflicts.map((c) => c.reason)).toEqual(["time_off"]);
  });
  it("an all-day time off gives reason time_off", () => {
    const off: AvailabilityException = { onDate: MON, kind: "time_off", startTime: null, endTime: null };
    const r = findConflicts([occ(MON, "10:00", "11:00")], avail(A, [win(1, "09:00", "12:00")], [off]), TODAY);
    expect(r.conflicts.map((c) => c.reason)).toEqual(["time_off"]);
  });
  it("time off elsewhere on the day does not change the reason", () => {
    const off: AvailabilityException = { onDate: MON, kind: "time_off", startTime: "08:00", endTime: "08:30" };
    const r = findConflicts([occ(MON, "13:00", "14:00")], avail(A, [win(1, "09:00", "12:00")], [off]), TODAY);
    expect(r.conflicts.map((c) => c.reason)).toEqual(["outside_availability"]);
  });
  it("extra availability makes a class fit on its date only", () => {
    const extra: AvailabilityException = { onDate: MON, kind: "extra", startTime: "13:00", endTime: "15:00" };
    const a = avail(A, [win(1, "09:00", "12:00")], [extra]);
    expect(findConflicts([occ(MON, "13:00", "14:00")], a, TODAY).conflicts).toEqual([]);
    expect(findConflicts([occ("2026-10-26", "13:00", "14:00")], a, TODAY).conflicts).toHaveLength(1);
  });
  it("cancelled classes are ignored; moved classes are checked at their new date", () => {
    const a = avail(A, [win(1, "09:00", "12:00")]);
    expect(findConflicts([occ(MON, "15:00", "16:00", { status: "cancelled" })], a, TODAY).conflicts).toEqual([]);
    expect(findConflicts([occ("2026-10-20", "10:00", "11:00", { status: "moved", originalDate: MON })], a, TODAY).conflicts).toHaveLength(1);
    expect(findConflicts([occ(MON, "10:00", "11:00", { status: "moved", originalDate: "2026-10-20" })], a, TODAY).conflicts).toEqual([]);
  });
  it("past dates are ignored, today counts", () => {
    const a = avail(A, [win(1, "09:00", "12:00")]);
    expect(findConflicts([occ("2026-10-13", "15:00", "16:00")], a, TODAY).conflicts).toEqual([]);
    expect(findConflicts([occ(TODAY, "15:00", "16:00")], a, TODAY).conflicts).toHaveLength(1);
  });
  it("not_entered teachers are listed, never flagged", () => {
    const m = new Map([...avail(A, [win(1, "09:00", "12:00")]), ...avail(B, [])]);
    const r = findConflicts([occ(MON, "10:00", "11:00", { staffId: B })], m, TODAY);
    expect(r.conflicts).toEqual([]);
    expect(r.notEntered).toEqual([B]);
  });
});
