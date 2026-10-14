import { describe, expect, it } from "vitest";
import { planCopy, type CopyWindow } from "./copy-day";

const TODAY = "2026-10-14";
const w = (id: string, weekday: number, startTime: string, endTime: string, over: Partial<CopyWindow> = {}): CopyWindow => ({
  id, weekday, startTime, endTime, effectiveFrom: "2026-01-05", effectiveUntil: null, ...over,
});
const monday = [w("m1", 1, "09:00", "12:00"), w("m2", 1, "13:00", "17:00")];

describe("planCopy (AC3)", () => {
  it("creates the source windows on each target day", () => {
    const plan = planCopy(monday, 1, [3, 5], { replace: false }, TODAY);
    expect(plan.deletes).toEqual([]);
    expect(plan.creates.map((c) => [c.weekday, c.startTime, c.endTime])).toEqual([
      [3, "09:00", "12:00"], [3, "13:00", "17:00"], [5, "09:00", "12:00"], [5, "13:00", "17:00"],
    ]);
  });
  it("add mode skips windows already identical on the target day", () => {
    const plan = planCopy([...monday, w("w1", 3, "09:00", "12:00")], 1, [3], { replace: false }, TODAY);
    expect(plan.creates.map((c) => [c.weekday, c.startTime])).toEqual([[3, "13:00"]]);
    expect(plan.deletes).toEqual([]);
  });
  it("replace mode deletes the target's current windows first", () => {
    const plan = planCopy([...monday, w("w1", 3, "08:00", "09:00"), w("f1", 5, "10:00", "11:00")], 1, [3], { replace: true }, TODAY);
    expect(plan.deletes).toEqual(["w1"]);
    expect(plan.creates).toHaveLength(2);
  });
  it("effectiveFrom is clamped to today, effectiveUntil carried over", () => {
    const plan = planCopy([w("m1", 1, "09:00", "10:00", { effectiveFrom: "2026-09-01", effectiveUntil: "2026-12-31" }),
      w("m2", 1, "11:00", "12:00", { effectiveFrom: "2026-11-02" })], 1, [3], { replace: false }, TODAY);
    expect(plan.creates.map((c) => [c.effectiveFrom, c.effectiveUntil])).toEqual([[TODAY, "2026-12-31"], ["2026-11-02", null]]);
  });
  it("the source day is never a target, and ended windows are not copied", () => {
    const plan = planCopy([...monday, w("old", 1, "07:00", "08:00", { effectiveUntil: "2026-10-01" })], 1, [1, 2], { replace: true }, TODAY);
    expect(plan.deletes).toEqual([]);
    expect(plan.creates.map((c) => c.weekday)).toEqual([2, 2]);
  });
});
