import { describe, expect, it } from "vitest";
import { computeAvailability, type AvailabilityException, type AvailabilityWindow } from "./availability";
import { bookingWindow, checkBooking, MAX_PROBLEMS } from "./booking";
import type { StaffAvailability } from "./conflicts";
import type { Occurrence } from "./recurrence";

const RYAN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const KUBY = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const S1 = "11111111-1111-4111-8111-111111111111";
const S2 = "22222222-2222-4222-8222-222222222222";
const TODAY = "2026-10-19";
const RANGE = { from: TODAY, to: "2027-06-30" };

const win = (weekday: number, startTime = "15:00", endTime = "21:00"): AvailabilityWindow => ({ weekday, startTime, endTime, effectiveFrom: "2026-01-01", effectiveUntil: null });
const week = [1, 2, 3, 4, 5].map((d) => win(d));
const avail = (staff: string, windows: AvailabilityWindow[], exceptions: AvailabilityException[] = []): Map<string, StaffAvailability> =>
  new Map([[staff, { days: computeAvailability(windows, exceptions, RANGE), exceptions }]]);
const occ = (date: string, startTime: string, endTime: string, over: Partial<Occurrence> = {}): Occurrence => ({
  occurrenceKey: `k-${over.staffId ?? RYAN}-${date}-${startTime}`, seriesId: "s", originalDate: date, date, startTime, endTime,
  durationMinutes: 60, startsAt: "", endsAt: "", staffId: RYAN, studentId: S1, subject: "MHF4U", status: "scheduled", kind: "weekly", ...over,
});
const base = { checkAvailability: true, today: TODAY };

describe("bookingWindow (AC6)", () => {
  it("starts at the later of first date and today, ends at the earlier of effectiveUntil and today + 182", () => {
    expect(bookingWindow("2026-10-01", TODAY, null)).toEqual({ from: TODAY, to: "2027-04-19" });
    expect(bookingWindow("2026-11-02", TODAY, "2026-11-30")).toEqual({ from: "2026-11-02", to: "2026-11-30" });
  });
  it("is null when nothing is left to check", () => {
    expect(bookingWindow("2026-10-01", TODAY, "2026-10-10")).toBeNull();
    expect(bookingWindow("2028-01-01", TODAY, null)).toBeNull();
  });
});

describe("checkBooking", () => {
  const ryanWeek = avail(RYAN, week);
  it("AC2: overlap with the same teacher is teacher_busy", () => {
    const others = [occ("2026-10-19", "16:00", "17:00")];
    const r = checkBooking({ ...base, candidates: [occ("2026-10-19", "16:30", "17:30", { studentId: S2 })], others, availability: ryanWeek });
    expect(r).toEqual([{ date: "2026-10-19", startTime: "16:30", endTime: "17:30", reason: "teacher_busy" }]);
  });
  it("AC3: overlap for the same student with another teacher is student_busy", () => {
    const others = [occ("2026-10-26", "16:00", "17:00")];
    const r = checkBooking({ ...base, candidates: [occ("2026-10-26", "16:00", "17:00", { staffId: KUBY })], others, availability: avail(KUBY, week) });
    expect(r.map((p) => p.reason)).toEqual(["student_busy"]);
  });
  it("AC4: back-to-back is allowed", () => {
    const r = checkBooking({ ...base, candidates: [occ("2026-10-19", "17:00", "18:00", { studentId: S2 })], others: [occ("2026-10-19", "16:00", "17:00")], availability: ryanWeek });
    expect(r).toEqual([]);
  });
  it("cancelled occurrences and other dates do not clash", () => {
    const others = [occ("2026-10-19", "16:00", "17:00", { status: "cancelled" }), occ("2026-10-20", "16:00", "17:00")];
    expect(checkBooking({ ...base, candidates: [occ("2026-10-19", "16:00", "17:00", { studentId: S2 })], others, availability: ryanWeek })).toEqual([]);
  });
  it("AC7: excluded keys (the class itself) never clash", () => {
    const self = occ("2026-10-19", "16:00", "17:00");
    const moved = occ("2026-10-19", "16:30", "17:30", { occurrenceKey: self.occurrenceKey });
    expect(checkBooking({ ...base, candidates: [moved], others: [self], excludeKeys: new Set([self.occurrenceKey]), availability: ryanWeek })).toEqual([]);
    expect(checkBooking({ ...base, candidates: [moved], others: [self], availability: ryanWeek }).map((p) => p.reason)).toEqual(["teacher_busy", "student_busy"]);
  });
  it("AC5: outside availability, time off and not entered", () => {
    const off: AvailabilityException = { onDate: "2026-11-02", kind: "time_off", startTime: null, endTime: null };
    const a = avail(RYAN, week, [off]);
    expect(checkBooking({ ...base, candidates: [occ("2026-10-19", "14:30", "15:30")], others: [], availability: a })[0].reason).toBe("outside_availability");
    expect(checkBooking({ ...base, candidates: [occ("2026-11-02", "16:00", "17:00")], others: [], availability: a })[0].reason).toBe("time_off");
    expect(checkBooking({ ...base, candidates: [occ("2026-10-19", "16:00", "17:00")], others: [], availability: avail(RYAN, []) })[0].reason).toBe("availability_not_entered");
  });
  it("AC5: checkAvailability false skips only the availability rule", () => {
    const r = checkBooking({ ...base, checkAvailability: false, candidates: [occ("2026-10-19", "06:00", "07:00")], others: [], availability: ryanWeek });
    expect(r).toEqual([]);
    const busy = checkBooking({ ...base, checkAvailability: false, candidates: [occ("2026-10-19", "06:00", "07:00", { studentId: S2 })], others: [occ("2026-10-19", "06:30", "07:30")], availability: ryanWeek });
    expect(busy.map((p) => p.reason)).toEqual(["teacher_busy"]);
  });
  it("AC6: reports every affected date in order and counts what the caller trims", () => {
    const candidates = Array.from({ length: 12 }, (_, i) => occ(`2026-${i < 6 ? "10" : "11"}-${String(i < 6 ? 19 + i : i - 5).padStart(2, "0")}`, "08:00", "09:00"));
    const r = checkBooking({ ...base, candidates, others: [], availability: ryanWeek });
    expect(r).toHaveLength(12);
    expect(r.map((p) => p.date)).toEqual([...r.map((p) => p.date)].sort());
    expect(MAX_PROBLEMS).toBe(10);
  });
  it("problems carry no student or subject data", () => {
    const [p] = checkBooking({ ...base, candidates: [occ("2026-10-19", "16:30", "17:30", { studentId: S2 })], others: [occ("2026-10-19", "16:00", "17:00", { subject: "SECRET" })], availability: ryanWeek });
    expect(Object.keys(p).sort()).toEqual(["date", "endTime", "reason", "startTime"]);
  });
  it("DST: a weekly 17:00 class across 2026-11-01 is still compared on wall-clock", () => {
    const r = checkBooking({ ...base, candidates: [occ("2026-11-02", "17:00", "18:00", { studentId: S2 })], others: [occ("2026-11-02", "16:00", "17:00")], availability: ryanWeek });
    expect(r).toEqual([]);
  });
});
