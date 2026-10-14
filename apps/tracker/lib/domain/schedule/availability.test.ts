import { describe, expect, it } from "vitest";
import { computeAvailability, type AvailabilityException, type AvailabilityWindow } from "./availability";

const w = (weekday: number, start: string, end: string, effectiveFrom = "2026-01-01", effectiveUntil: string | null = null): AvailabilityWindow => ({
  weekday, startTime: start, endTime: end, effectiveFrom, effectiveUntil,
});
const MON = { from: "2026-10-26", to: "2026-10-26" };
const day = (r: ReturnType<typeof computeAvailability>) => r[0];

describe("computeAvailability", () => {
  it("AC10: overlapping windows union (300 minutes, not 360)", () => {
    const d = day(computeAvailability([w(1, "09:00", "12:00"), w(1, "11:00", "14:00")], [], MON));
    expect(d).toEqual({ date: "2026-10-26", state: "available", intervals: [{ start: "09:00", end: "14:00" }], availableMinutes: 300 });
  });
  it("touching windows merge; separate windows stay sorted", () => {
    expect(day(computeAvailability([w(1, "12:00", "14:00"), w(1, "09:00", "12:00")], [], MON)).intervals).toEqual([{ start: "09:00", end: "14:00" }]);
    expect(day(computeAvailability([w(1, "15:00", "16:00"), w(1, "09:00", "10:00")], [], MON)).intervals).toEqual([
      { start: "09:00", end: "10:00" }, { start: "15:00", end: "16:00" },
    ]);
  });
  it("extra availability adds; partial time off subtracts", () => {
    const ex: AvailabilityException[] = [
      { onDate: "2026-10-26", kind: "extra", startTime: "18:00", endTime: "20:00" },
      { onDate: "2026-10-26", kind: "time_off", startTime: "10:00", endTime: "11:00" },
    ];
    const d = day(computeAvailability([w(1, "09:00", "12:00")], ex, MON));
    expect(d.intervals).toEqual([{ start: "09:00", end: "10:00" }, { start: "11:00", end: "12:00" }, { start: "18:00", end: "20:00" }]);
    expect(d.availableMinutes).toBe(240);
  });
  it("whole-day time off leaves the day unavailable", () => {
    const ex: AvailabilityException[] = [{ onDate: "2026-10-26", kind: "time_off", startTime: null, endTime: null }];
    expect(day(computeAvailability([w(1, "09:00", "12:00")], ex, MON))).toMatchObject({ state: "unavailable", intervals: [], availableMinutes: 0 });
  });
  it("AC10: no rows at all is not_entered; rows but nothing that day is unavailable", () => {
    expect(day(computeAvailability([], [], MON)).state).toBe("not_entered");
    expect(day(computeAvailability([w(2, "09:00", "12:00")], [], MON)).state).toBe("unavailable");
  });
  it("AC11: effective dates, until inclusive", () => {
    const win = w(1, "09:00", "12:00", "2026-11-02", "2026-11-09");
    const r = computeAvailability([win], [], { from: "2026-10-26", to: "2026-11-16" });
    expect(r.filter((d) => d.state === "available").map((d) => d.date)).toEqual(["2026-11-02", "2026-11-09"]);
  });
});
