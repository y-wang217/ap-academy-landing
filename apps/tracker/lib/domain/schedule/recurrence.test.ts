import { describe, expect, it } from "vitest";
import { expandOccurrences, planSplit, type ClassException, type ClassSeries } from "./recurrence";

const weekly: ClassSeries = {
  id: "s1", staffId: "t1", studentId: "st1", subject: "MHF4U", kind: "weekly",
  startDate: "2026-10-19", startTime: "17:00", durationMinutes: 60, effectiveUntil: null,
};
const range = { from: "2026-10-19", to: "2026-11-09" };

describe("expandOccurrences", () => {
  it("AC1: weekly Monday 17:00 stays 17:00 local across DST end", () => {
    const occ = expandOccurrences([weekly], [], range);
    expect(occ.map((o) => o.date)).toEqual(["2026-10-19", "2026-10-26", "2026-11-02", "2026-11-09"]);
    expect(occ.every((o) => o.startTime === "17:00" && o.endTime === "18:00")).toBe(true);
    expect(occ.map((o) => o.startsAt)).toEqual([
      "2026-10-19T21:00:00.000Z", "2026-10-26T21:00:00.000Z", "2026-11-02T22:00:00.000Z", "2026-11-09T22:00:00.000Z",
    ]);
    expect(occ[0].endsAt).toBe("2026-10-19T22:00:00.000Z");
  });
  it("AC1: also across the spring change", () => {
    const occ = expandOccurrences([weekly], [], { from: "2027-03-08", to: "2027-03-15" });
    expect(occ.map((o) => o.startsAt)).toEqual(["2027-03-08T22:00:00.000Z", "2027-03-15T21:00:00.000Z"]);
  });
  it("AC2: keys are seriesId:originalDate and stable across calls, moves and cancels", () => {
    const a = expandOccurrences([weekly], [], range).map((o) => o.occurrenceKey);
    expect(a[0]).toBe("s1:2026-10-19");
    expect(expandOccurrences([weekly], [], range).map((o) => o.occurrenceKey)).toEqual(a);
    const ex: ClassException[] = [
      { seriesId: "s1", originalDate: "2026-10-26", kind: "cancelled", newDate: null, newStartTime: null },
      { seriesId: "s1", originalDate: "2026-11-02", kind: "moved", newDate: "2026-11-04", newStartTime: "18:30" },
    ];
    expect(expandOccurrences([weekly], ex, range).map((o) => o.occurrenceKey).sort()).toEqual([...a].sort());
  });
  it("AC3: a cancelled occurrence is returned with status cancelled", () => {
    const ex: ClassException[] = [{ seriesId: "s1", originalDate: "2026-10-26", kind: "cancelled", newDate: null, newStartTime: null }];
    const occ = expandOccurrences([weekly], ex, range);
    expect(occ).toHaveLength(4);
    expect(occ.find((o) => o.date === "2026-10-26")?.status).toBe("cancelled");
    expect(occ.filter((o) => o.status === "scheduled")).toHaveLength(3);
  });
  it("AC4: a moved occurrence appears at the new time, with the same key and duration", () => {
    const ex: ClassException[] = [{ seriesId: "s1", originalDate: "2026-10-26", kind: "moved", newDate: "2026-10-28", newStartTime: "18:30" }];
    const occ = expandOccurrences([weekly], ex, range);
    const m = occ.find((o) => o.occurrenceKey === "s1:2026-10-26")!;
    expect(m).toMatchObject({ status: "moved", date: "2026-10-28", startTime: "18:30", endTime: "19:30", durationMinutes: 60, originalDate: "2026-10-26", studentId: "st1", staffId: "t1" });
    expect(occ).toHaveLength(4);
  });
  it("AC4: moved out of range is dropped, moved into range from outside is added", () => {
    const out: ClassException[] = [{ seriesId: "s1", originalDate: "2026-11-09", kind: "moved", newDate: "2026-11-12", newStartTime: "17:00" }];
    expect(expandOccurrences([weekly], out, range)).toHaveLength(3);
    const into: ClassException[] = [{ seriesId: "s1", originalDate: "2026-11-16", kind: "moved", newDate: "2026-11-09", newStartTime: "12:00" }];
    const occ = expandOccurrences([weekly], into, range);
    expect(occ.map((o) => o.occurrenceKey)).toContain("s1:2026-11-16");
    expect(occ).toHaveLength(5);
  });
  it("one-off and effective dates", () => {
    const oneOff: ClassSeries = { ...weekly, id: "o1", kind: "one_off", startDate: "2026-10-21" };
    expect(expandOccurrences([oneOff], [], range).map((o) => o.date)).toEqual(["2026-10-21"]);
    const ended: ClassSeries = { ...weekly, effectiveUntil: "2026-10-26" };
    expect(expandOccurrences([ended], [], range).map((o) => o.date)).toEqual(["2026-10-19", "2026-10-26"]);
  });
  it("is sorted by start", () => {
    const b: ClassSeries = { ...weekly, id: "s0", startTime: "09:00" };
    const occ = expandOccurrences([weekly, b], [], { from: "2026-10-19", to: "2026-10-19" });
    expect(occ.map((o) => o.seriesId)).toEqual(["s0", "s1"]);
  });
});

describe("planSplit", () => {
  const ex: ClassException[] = [
    { seriesId: "s1", originalDate: "2026-10-26", kind: "cancelled", newDate: null, newStartTime: null },
    { seriesId: "s1", originalDate: "2026-11-09", kind: "cancelled", newDate: null, newStartTime: null },
    { seriesId: "s1", originalDate: "2026-11-16", kind: "moved", newDate: "2026-11-17", newStartTime: "10:00" },
  ];
  it("AC5: occurrences before D are unchanged", () => {
    const plan = planSplit(weekly, ex, "2026-11-09", { startTime: "16:00" }, "s2");
    const before = expandOccurrences([weekly], ex, { from: "2026-10-19", to: "2026-11-08" });
    const after = expandOccurrences(
      [plan.oldSeries, plan.newSeries],
      [...ex.filter((e) => e.originalDate < "2026-11-09"), ...plan.exceptions],
      { from: "2026-10-19", to: "2026-11-08" },
    );
    expect(after).toEqual(before);
    expect(plan.oldSeries.effectiveUntil).toBe("2026-11-08");
    expect(plan.newSeries).toMatchObject({ id: "s2", startDate: "2026-11-09", startTime: "16:00", effectiveUntil: null });
  });
  it("AC5: new series keeps the old effectiveUntil", () => {
    const plan = planSplit({ ...weekly, effectiveUntil: "2027-01-04" }, [], "2026-11-09", {}, "s2");
    expect(plan.newSeries.effectiveUntil).toBe("2027-01-04");
  });
  it("AC6: cancellations map by ISO week to the new weekday; moves keep absolute time", () => {
    const plan = planSplit(weekly, ex, "2026-11-09", { weekday: 3 }, "s2");
    expect(plan.newSeries.startDate).toBe("2026-11-11");
    expect(plan.exceptions).toEqual([
      { seriesId: "s2", originalDate: "2026-11-11", kind: "cancelled", newDate: null, newStartTime: null },
      { seriesId: "s2", originalDate: "2026-11-18", kind: "moved", newDate: "2026-11-17", newStartTime: "10:00" },
    ]);
  });
});
