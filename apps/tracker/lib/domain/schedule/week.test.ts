import { describe, expect, it } from "vitest";
import { computeAvailability, type AvailabilityException, type AvailabilityWindow } from "./availability";
import { expandOccurrences, type ClassException, type ClassSeries } from "./recurrence";
import { weekOf, weekTotals } from "./week";

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const S = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const WEEK = weekOf("2026-10-19");

const win = (weekday: number, startTime: string, endTime: string): AvailabilityWindow => ({ weekday, startTime, endTime, effectiveFrom: "2026-01-05", effectiveUntil: null });
const series = (id: string, kind: "weekly" | "one_off", startDate: string, startTime: string, durationMinutes = 60): ClassSeries => ({
  id, staffId: T, studentId: S, subject: "MHF4U", kind, startDate, startTime, durationMinutes, effectiveUntil: null,
});
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// The fixture week from the design (REQ-6), teacher T, Mon 2026-10-19.
const windows = [win(1, "09:00", "12:00"), win(1, "11:00", "14:00"), win(3, "16:00", "20:00")];
const availExceptions: AvailabilityException[] = [
  { onDate: "2026-10-21", kind: "time_off", startTime: "18:00", endTime: "20:00" },
  { onDate: "2026-10-24", kind: "extra", startTime: "10:00", endTime: "12:00" },
];
const fixtureSeries = [
  series(ID(1), "weekly", "2026-10-12", "10:00"),
  series(ID(2), "one_off", "2026-10-19", "13:30"),
  series(ID(3), "weekly", "2026-10-14", "16:00"),
  series(ID(4), "weekly", "2026-10-15", "17:00"),
  series(ID(5), "weekly", "2026-10-16", "15:00"),
];
const classExceptions: ClassException[] = [
  { seriesId: ID(4), originalDate: "2026-10-22", kind: "cancelled", newDate: null, newStartTime: null },
  { seriesId: ID(5), originalDate: "2026-10-23", kind: "moved", newDate: "2026-10-24", newStartTime: "10:30" },
];

describe("weekOf", () => {
  it("returns Monday to Sunday for a Wednesday", () => expect(weekOf("2026-10-21")).toEqual({ from: "2026-10-19", to: "2026-10-25" }));
  it("a Sunday belongs to the week that started the Monday before", () => expect(weekOf("2026-10-25")).toEqual({ from: "2026-10-19", to: "2026-10-25" }));
  it("a Monday starts its own week", () => expect(weekOf("2026-10-19")).toEqual({ from: "2026-10-19", to: "2026-10-25" }));
});

describe("weekTotals (AC5, AC6)", () => {
  const days = computeAvailability(windows, availExceptions, WEEK);
  const occs = expandOccurrences(fixtureSeries, classExceptions, WEEK);

  it("the fixture week is 240 scheduled, 540 available, 330 remaining", () => {
    expect(weekTotals(occs, days)).toEqual({ scheduledMinutes: 240, availableMinutes: 540, remainingMinutes: 330 });
  });
  it("overlapping windows count 300 minutes on Monday, not 360", () => {
    expect(days.find((d) => d.date === "2026-10-19")?.availableMinutes).toBe(300);
  });
  it("cancelled occurrences add nothing", () => {
    expect(occs.some((o) => o.status === "cancelled")).toBe(true);
    expect(weekTotals(occs, days).scheduledMinutes).toBe(240);
  });
  it("two overlapping classes are subtracted from availability once", () => {
    const two = expandOccurrences([series(ID(6), "one_off", "2026-10-19", "10:00"), series(ID(7), "one_off", "2026-10-19", "10:30")], [], WEEK);
    const t = weekTotals(two, days);
    expect(t.scheduledMinutes).toBe(120);
    expect(t.remainingMinutes).toBe(540 - 90);
  });
  it("remaining never goes below zero", () => {
    const small = computeAvailability([win(1, "10:00", "11:00")], [], WEEK);
    const t = weekTotals(expandOccurrences([series(ID(6), "one_off", "2026-10-19", "10:00")], [], WEEK), small);
    expect(t.remainingMinutes).toBe(0);
  });
  it("a class outside availability does not reduce what is left", () => {
    const out = expandOccurrences([series(ID(6), "one_off", "2026-10-20", "10:00")], [], WEEK);
    expect(weekTotals(out, days)).toEqual({ scheduledMinutes: 60, availableMinutes: 540, remainingMinutes: 540 });
  });
  it("not_entered gives null available and remaining", () => {
    const none = computeAvailability([], [], WEEK);
    expect(weekTotals(occs, none)).toEqual({ scheduledMinutes: 240, availableMinutes: null, remainingMinutes: null });
  });
});
