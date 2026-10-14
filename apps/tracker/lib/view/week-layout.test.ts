import { describe, expect, it } from "vitest";
import type { AvailabilityDay } from "../domain/schedule/availability";
import { expandOccurrences, type ClassSeries } from "../domain/schedule/recurrence";
import { gridBounds, layoutDay, rowOf } from "./week-layout";

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const S = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const one = (n: number, date: string, startTime: string, durationMinutes = 60): ClassSeries => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, staffId: T, studentId: S, subject: "MHF4U", kind: "one_off",
  startDate: date, startTime, durationMinutes, effectiveUntil: null,
});
const on = (list: ClassSeries[], range = { from: "2026-10-19", to: "2026-10-25" }) => expandOccurrences(list, [], range);

describe("layoutDay (AC13)", () => {
  it("overlapping classes get two lanes side by side", () => {
    const l = layoutDay(on([one(1, "2026-10-19", "10:00"), one(2, "2026-10-19", "10:30")]));
    expect(l.map((x) => [x.lane, x.laneCount])).toEqual([[0, 2], [1, 2]]);
  });
  it("back-to-back classes share a lane", () => {
    const l = layoutDay(on([one(1, "2026-10-19", "16:00"), one(2, "2026-10-19", "17:00")]));
    expect(l.map((x) => [x.lane, x.laneCount])).toEqual([[0, 1], [0, 1]]);
  });
  it("a separate later class is not squeezed by an earlier cluster", () => {
    const l = layoutDay(on([one(1, "2026-10-19", "10:00"), one(2, "2026-10-19", "10:30"), one(3, "2026-10-19", "15:00")]));
    expect(l.find((x) => x.occurrence.startTime === "15:00")).toMatchObject({ lane: 0, laneCount: 1 });
  });
  it("is empty for no classes", () => expect(layoutDay([])).toEqual([]));
});

describe("gridBounds and rowOf (AC11)", () => {
  const empty: AvailabilityDay[] = [];
  it("defaults to 08:00-21:00", () => expect(gridBounds([], empty)).toEqual({ startMinutes: 480, endMinutes: 1260 }));
  it("widens for a 07:30 class and a 21:30 class", () => {
    const b = gridBounds(on([one(1, "2026-10-19", "07:30"), one(2, "2026-10-19", "21:00", 30)]), empty);
    expect(b).toEqual({ startMinutes: 450, endMinutes: 1290 });
  });
  it("widens for availability outside the default hours", () => {
    const days: AvailabilityDay[] = [{ date: "2026-10-19", state: "available", intervals: [{ start: "06:00", end: "22:15" }], availableMinutes: 975 }];
    expect(gridBounds([], days)).toEqual({ startMinutes: 360, endMinutes: 1335 });
  });
  it("rowOf is the 15-minute index from midnight", () => {
    expect(rowOf("00:00")).toBe(0);
    expect(rowOf("17:00")).toBe(68);
    expect(rowOf("17:10")).toBe(68);
  });
  it("a Monday 17:00 weekly class sits on the 17:00 row either side of the DST change (AC16)", () => {
    const weekly: ClassSeries = { ...one(1, "2026-10-19", "17:00"), kind: "weekly" };
    for (const range of [{ from: "2026-10-26", to: "2026-11-01" }, { from: "2026-11-02", to: "2026-11-08" }]) {
      const [o] = expandOccurrences([weekly], [], range);
      expect(rowOf(o.startTime)).toBe(68);
    }
  });
});
