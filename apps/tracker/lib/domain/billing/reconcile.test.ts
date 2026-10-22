import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ClassException, ClassSeries } from "../schedule/recurrence";
import { buildBillingInput } from "./month-input";
import { reconcileMonth } from "./reconcile";

// REQ-40 AC9: the text-based count next to the structured one, every difference explained.
const fixture = JSON.parse(readFileSync(join(__dirname, "../../../test/fixtures/billing-input/2026-11.input.json"), "utf8"));
const input = buildBillingInput(fixture.input);
const [A, B, C, D] = fixture.input.students.map((s: { studentId: string }) => s.studentId);

function forStudent(studentId: string) {
  const series = (fixture.input.series as ClassSeries[]).filter((s) => s.studentId === studentId);
  const exceptions = (fixture.input.exceptions as ClassException[]).filter((e) => series.some((s) => s.id === e.seriesId));
  const occurrences = input.students.find((s) => s.studentId === studentId)!.occurrences;
  return reconcileMonth({ month: "2026-11", text: fixture.texts[studentId], occurrences, series, exceptions });
}
const diffs = (r: ReturnType<typeof reconcileMonth>) => r.differences.map((d) => [d.date, d.side, d.reason, d.other]);

describe("reconcileMonth", () => {
  it("a cancellation, a move both ways and a trial (student A)", () => {
    const r = forStudent(A);
    expect(r.unparseable).toBe(false);
    expect(r.text).toEqual({ count: 4, hours: 4 });
    expect(r.structured).toEqual({ count: 4, hours: 4 });
    expect(diffs(r)).toEqual([
      ["2026-11-06", "structured_only", "one_off", null],
      ["2026-11-10", "text_only", "cancelled", null],
      ["2026-11-17", "text_only", "moved_out", "2026-11-19"],
      ["2026-11-19", "structured_only", "moved_in", "2026-11-17"],
    ]);
  });

  it("a makeup is never in the structured count", () => {
    expect(forStudent(A).differences.some((d) => d.date === "2026-11-12")).toBe(false);
  });

  it("a split with a new length, and a cancellation with no makeup (student B)", () => {
    const r = forStudent(B);
    expect(r.text).toEqual({ count: 5, hours: 7.5 });
    expect(r.structured).toEqual({ count: 4, hours: 5.5 });
    expect(diffs(r)).toEqual([
      ["2026-11-02", "structured_only", "duration_changed", null],
      ["2026-11-09", "text_only", "cancelled", null],
    ]);
  });

  it("from, until, a line with no class and a class missing from the text (student C)", () => {
    const r = forStudent(C);
    expect(r.text).toEqual({ count: 12, hours: 12 });
    expect(r.structured).toEqual({ count: 8, hours: 8 });
    const byReason = (reason: string) => r.differences.filter((d) => d.reason === reason).map((d) => d.date);
    expect(byReason("before_from")).toEqual(["2026-11-04", "2026-11-11"]);
    expect(byReason("after_until")).toEqual(["2026-11-20", "2026-11-27"]);
    expect(byReason("no_class")).toEqual(["2026-11-07", "2026-11-14", "2026-11-21", "2026-11-28"]);
    expect(byReason("not_in_text")).toEqual(["2026-11-05", "2026-11-12", "2026-11-19", "2026-11-26"]);
    expect(r.differences.filter((d) => d.reason === "not_in_text").every((d) => d.side === "structured_only" && d.subject === "ENG4U English")).toBe(true);
    expect(r.differences.map((d) => d.date)).toEqual([...r.differences.map((d) => d.date)].sort());
  });

  it("a text the monthly run cannot read is unparseable, with no differences (student D)", () => {
    const r = forStudent(D);
    expect(r).toEqual({ unparseable: true, text: null, structured: { count: 0, hours: 0 }, differences: [] });
  });

  it("a student never synced counts as an empty text", () => {
    const series = (fixture.input.series as ClassSeries[]).filter((s) => s.studentId === A);
    const occurrences = input.students.find((s) => s.studentId === A)!.occurrences;
    const r = reconcileMonth({ month: "2026-11", text: null, occurrences, series, exceptions: [] });
    expect(r.text).toEqual({ count: 0, hours: 0 });
    expect(r.differences.every((d) => d.side === "structured_only")).toBe(true);
  });

  it("every reason the design names is produced by the fixture month", () => {
    const all = new Set([A, B, C].flatMap((id) => forStudent(id).differences.map((d) => d.reason)));
    expect([...all].sort()).toEqual(["after_until", "before_from", "cancelled", "duration_changed", "moved_in", "moved_out", "no_class", "not_in_text", "one_off"]);
  });
});
