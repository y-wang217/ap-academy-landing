import { describe, expect, it } from "vitest";
import { computeAvailability, type AvailabilityException, type AvailabilityWindow } from "../domain/schedule/availability";
import { checkBooking } from "../domain/schedule/booking";
import { expandOccurrences, type ClassException, type ClassSeries, type Occurrence } from "../domain/schedule/recurrence";
import { fillOptions, findMakeupSlots, formatSlot, makeupRange, resolveRescheduleTarget, type Slot, type TeacherCalendar } from "./makeup";
import { MAKEUP_LEAD_HOURS, MAKEUP_MAX_SLOTS, OPTIONS_TOKEN } from "./policy";

// REQ-47 AC1 to AC3, AC5: which class is moved, the make-up slots and the option lines. Pure.
const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0009";
const OTHER_T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0010";
const NINA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0005";
const OMAR = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0006";
// Mon 26 October 2026, 12:00 in Toronto (EDT). Nina's class is every Wednesday at 17:00 for 60 minutes.
const RECEIVED = "2026-10-26T16:00:00Z";
const NOW = new Date(RECEIVED);
const series = (o: Partial<ClassSeries> = {}): ClassSeries => ({
  id: "s-nina", staffId: T, studentId: NINA, subject: "MPM2D", kind: "weekly", startDate: "2026-10-07", startTime: "17:00", durationMinutes: 60, effectiveUntil: null, ...o,
});
const win = (weekday: number, startTime = "15:00", endTime = "19:00"): AvailabilityWindow => ({ weekday, startTime, endTime, effectiveFrom: "2026-01-01", effectiveUntil: null });
const WEEKDAYS = [1, 2, 3, 4, 5].map((d) => win(d));
const off = (onDate: string, startTime: string | null = null, endTime: string | null = null): AvailabilityException => ({ onDate, kind: "time_off", startTime, endTime });

function setup(o: { student?: ClassSeries[]; exceptions?: ClassException[]; teacher?: Partial<TeacherCalendar>; now?: Date; receivedAt?: string } = {}) {
  const student = { series: o.student ?? [series()], exceptions: o.exceptions ?? [] };
  const resolved = resolveRescheduleTarget({ receivedAt: o.receivedAt ?? RECEIVED, ...student });
  if (!resolved) throw new Error("no target");
  const teacher: TeacherCalendar = { series: student.series.filter((s) => s.staffId === T), exceptions: student.exceptions, windows: WEEKDAYS, availabilityExceptions: [], ...o.teacher };
  const result = findMakeupSlots({ ...resolved, student, teacher, now: o.now ?? NOW });
  return { ...resolved, student, teacher, result };
}
const starts = (r: ReturnType<typeof findMakeupSlots>) => (r.kind === "slots" ? r.slots.map((s) => `${s.date} ${s.startTime}-${s.endTime}`) : r.kind);

describe("resolveRescheduleTarget (AC1)", () => {
  it("is the next class to start after the message, with the one after it", () => {
    const r = resolveRescheduleTarget({ receivedAt: RECEIVED, series: [series()], exceptions: [] })!;
    expect([r.target.date, r.target.startTime, r.next?.date]).toEqual(["2026-10-28", "17:00", "2026-11-04"]);
  });

  it("a class that already started today is not the target", () => {
    const r = resolveRescheduleTarget({ receivedAt: "2026-10-28T21:30:00Z", series: [series()], exceptions: [] })!;
    expect([r.target.date, r.next?.date]).toEqual(["2026-11-04", "2026-11-11"]);
  });

  it("skips cancelled occurrences, for the target and for next", () => {
    const r = resolveRescheduleTarget({ receivedAt: RECEIVED, series: [series()], exceptions: [{ seriesId: "s-nina", originalDate: "2026-10-28", kind: "cancelled", newDate: null, newStartTime: null }] })!;
    expect([r.target.date, r.next?.date]).toEqual(["2026-11-04", "2026-11-11"]);
    const n = resolveRescheduleTarget({ receivedAt: RECEIVED, series: [series()], exceptions: [{ seriesId: "s-nina", originalDate: "2026-11-04", kind: "cancelled", newDate: null, newStartTime: null }] })!;
    expect([n.target.date, n.next?.date]).toEqual(["2026-10-28", "2026-11-11"]);
  });

  it("a moved occurrence counts at its new date and time", () => {
    const r = resolveRescheduleTarget({ receivedAt: RECEIVED, series: [series()], exceptions: [{ seriesId: "s-nina", originalDate: "2026-10-28", kind: "moved", newDate: "2026-10-29", newStartTime: "16:00" }] })!;
    expect([r.target.date, r.target.startTime]).toEqual(["2026-10-29", "16:00"]);
  });

  it("next is null when nothing follows the target", () => {
    const r = resolveRescheduleTarget({ receivedAt: RECEIVED, series: [series({ kind: "one_off", startDate: "2026-10-28" })], exceptions: [] })!;
    expect([r.target.date, r.next]).toEqual(["2026-10-28", null]);
  });

  it("no series, or no class in the next 42 days, gives null", () => {
    expect(resolveRescheduleTarget({ receivedAt: RECEIVED, series: [], exceptions: [] })).toBeNull();
    expect(resolveRescheduleTarget({ receivedAt: RECEIVED, series: [series({ kind: "one_off", startDate: "2026-10-20" })], exceptions: [] })).toBeNull();
    expect(resolveRescheduleTarget({ receivedAt: RECEIVED, series: [series({ kind: "one_off", startDate: "2026-12-10" })], exceptions: [] })).toBeNull();
  });
});

describe("makeupRange", () => {
  it("runs from the target to next, or 7 days when there is no next", () => {
    const { target, next } = setup();
    expect(makeupRange(target, next)).toEqual({ from: "2026-10-28", to: "2026-11-04" });
    expect(makeupRange(target, null)).toEqual({ from: "2026-10-28", to: "2026-11-04" });
  });
});

describe("findMakeupSlots (AC2)", () => {
  it("gives the earliest slot per date, three at most, after the target's end", () => {
    const { result } = setup();
    expect(starts(result)).toEqual(["2026-10-28 18:00-19:00", "2026-10-29 15:00-16:00", "2026-10-30 15:00-16:00"]);
    expect(MAKEUP_MAX_SLOTS).toBe(3);
    if (result.kind === "slots") expect(result.slots[0]).toEqual({ date: "2026-10-28", startTime: "18:00", endTime: "19:00", startsAt: "2026-10-28T22:00:00.000Z", endsAt: "2026-10-28T23:00:00.000Z" });
  });

  it("the teacher's other student excludes overlapping starts; a touching end is allowed", () => {
    const touching = series({ id: "s-omar", studentId: OMAR, startDate: "2026-10-08", startTime: "15:00" });
    expect(starts(setup({ teacher: { series: [series(), touching] } }).result)[1]).toBe("2026-10-29 16:00-17:00");
    const overlapping = series({ id: "s-omar", studentId: OMAR, kind: "one_off", startDate: "2026-10-29", startTime: "15:30" });
    expect(starts(setup({ teacher: { series: [series(), overlapping] } }).result)[1]).toBe("2026-10-29 16:30-17:30");
  });

  it("the student's own class with another teacher excludes its time", () => {
    // resolveRescheduleTarget would make this class next; the slot rule is checked on its own with Nina's next MPM2D class.
    const { target, next, teacher } = setup();
    const chem = series({ id: "s-chem", staffId: OTHER_T, subject: "SCH4U", kind: "one_off", startDate: "2026-10-30", startTime: "15:00", durationMinutes: 90 });
    const r = findMakeupSlots({ target, next, student: { series: [series(), chem], exceptions: [] }, teacher, now: NOW });
    expect(starts(r)[2]).toBe("2026-10-30 16:30-17:30");
  });

  it("full-day time off removes a date; partial time off cuts an interval", () => {
    expect(starts(setup({ teacher: { availabilityExceptions: [off("2026-10-29")] } }).result)).toEqual(["2026-10-28 18:00-19:00", "2026-10-30 15:00-16:00", "2026-11-02 15:00-16:00"]);
    expect(starts(setup({ teacher: { availabilityExceptions: [off("2026-10-29", "15:00", "17:00")] } }).result)[1]).toBe("2026-10-29 17:00-18:00");
  });

  it("an extra exception adds a slot, and a slot crossing next's start is dropped", () => {
    const extra: AvailabilityException = { onDate: "2026-10-31", kind: "extra", startTime: "10:00", endTime: "12:00" };
    expect(starts(setup({ teacher: { windows: [win(3)], availabilityExceptions: [extra] } }).result)).toEqual(["2026-10-28 18:00-19:00", "2026-10-31 10:00-11:00", "2026-11-04 15:00-16:00"]);
    expect(starts(setup({ teacher: { windows: [win(3, "16:30", "19:00")] } }).result)).toEqual(["2026-10-28 18:00-19:00"]);
  });

  it(`offers nothing within ${MAKEUP_LEAD_HOURS} hours of now`, () => {
    expect(starts(setup({ now: new Date("2026-10-27T22:00:00Z") }).result)[0]).toBe("2026-10-28 18:00-19:00");
    expect(starts(setup({ now: new Date("2026-10-27T22:30:00Z") }).result)[0]).toBe("2026-10-29 15:00-16:00");
  });

  it("starts on the 30-minute grid: a 15:45 interval gives a 16:00 first slot", () => {
    expect(starts(setup({ teacher: { windows: [win(3), win(4, "15:45", "19:00")] } }).result)[1]).toBe("2026-10-29 16:00-17:00");
  });

  it("a 90-minute class needs a 90-minute fit", () => {
    expect(starts(setup({ student: [series({ durationMinutes: 90 })] }).result)).toEqual(["2026-10-29 15:00-16:30", "2026-10-30 15:00-16:30", "2026-11-02 15:00-16:30"]);
  });

  it("with no next class the range ends at the target's date plus 7 days", () => {
    expect(starts(setup({ student: [series({ kind: "one_off", startDate: "2026-10-28" })], teacher: { windows: [win(3)] } }).result)).toEqual(["2026-10-28 18:00-19:00", "2026-11-04 15:00-16:00"]);
  });

  it("gets the instant right across the DST change", () => {
    const { result } = setup({ teacher: { availabilityExceptions: [off("2026-10-29"), off("2026-10-30")] } });
    expect(result.kind === "slots" && result.slots.map((s) => s.startsAt)).toEqual(["2026-10-28T22:00:00.000Z", "2026-11-02T20:00:00.000Z", "2026-11-03T20:00:00.000Z"]);
  });

  it("availability entered but nothing free is none_free", () => {
    expect(setup({ teacher: { windows: [win(3, "17:00", "18:00")] } }).result).toEqual({ kind: "none_free" });
  });

  it("no rows at all is not_entered; one time-off row outside the range is none_free", () => {
    expect(setup({ teacher: { windows: [] } }).result).toEqual({ kind: "not_entered" });
    expect(setup({ teacher: { windows: [], availabilityExceptions: [off("2027-06-01")] } }).result).toEqual({ kind: "none_free" });
  });

  it("is deterministic, and every slot passes computeAvailability and checkBooking", () => {
    const busy = series({ id: "s-omar", studentId: OMAR, startDate: "2026-10-08", startTime: "15:00" });
    const s = setup({ teacher: { series: [series(), busy], availabilityExceptions: [off("2026-10-30", "15:00", "16:00")] } });
    expect(findMakeupSlots({ target: s.target, next: s.next, student: s.student, teacher: s.teacher, now: NOW })).toEqual(s.result);
    if (s.result.kind !== "slots") throw new Error("want slots");
    const range = makeupRange(s.target, s.next);
    const days = computeAvailability(s.teacher.windows, s.teacher.availabilityExceptions, range);
    const others = expandOccurrences([...s.teacher.series, ...s.student.series], s.student.exceptions, range);
    for (const slot of s.result.slots) {
      const day = days.find((d) => d.date === slot.date)!;
      expect(day.intervals.some((i) => i.start <= slot.startTime && slot.endTime <= i.end), slot.date).toBe(true);
      const occ: Occurrence = { ...s.target, occurrenceKey: `offer:${slot.date}`, seriesId: "offer", originalDate: slot.date, date: slot.date, startTime: slot.startTime, endTime: slot.endTime, startsAt: slot.startsAt, endsAt: slot.endsAt, status: "scheduled", kind: "one_off" };
      const problems = checkBooking({ candidates: [occ], others, availability: new Map([[T, { days, exceptions: s.teacher.availabilityExceptions }]]), checkAvailability: true, today: "2026-10-26" });
      expect(problems, slot.date).toEqual([]);
    }
  });
});

describe("formatSlot and fillOptions (AC3, AC5)", () => {
  const slot = (date: string, startTime: string, endTime: string): Slot => ({ date, startTime, endTime, startsAt: "", endsAt: "" });
  it("writes one line per slot", () => {
    expect(formatSlot(slot("2026-10-29", "16:00", "17:00"))).toBe("Thursday 29 October, 4:00 pm to 5:00 pm");
    expect(formatSlot(slot("2026-10-31", "10:00", "11:30"))).toBe("Saturday 31 October, 10:00 am to 11:30 am");
    expect(formatSlot(slot("2026-11-02", "11:30", "12:30"))).toBe("Monday 2 November, 11:30 am to 12:30 pm");
  });

  it("fills exactly one placeholder line, else null", () => {
    const slots = [slot("2026-10-29", "16:00", "17:00"), slot("2026-10-30", "17:30", "18:30")];
    expect(fillOptions(`Hi Ann,\n\nThese times work:\n${OPTIONS_TOKEN}\nLet me know.`, slots)).toBe(
      "Hi Ann,\n\nThese times work:\n- Thursday 29 October, 4:00 pm to 5:00 pm\n- Friday 30 October, 5:30 pm to 6:30 pm\nLet me know.",
    );
    expect(fillOptions(`These times work:\n  ${OPTIONS_TOKEN}  \nThanks`, slots)).toContain("- Thursday 29 October");
    expect(fillOptions("No placeholder here.", slots)).toBeNull();
    expect(fillOptions(`${OPTIONS_TOKEN}\n${OPTIONS_TOKEN}`, slots)).toBeNull();
    expect(fillOptions(`Times: ${OPTIONS_TOKEN}`, slots)).toBeNull();
  });
});
