import { describe, expect, it } from "vitest";
import { monthlyReview, renderSummary } from "./summary";
import type { ClassException, ClassSeries } from "./recurrence";

const T1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const T2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const S1 = "11111111-1111-4111-8111-111111111111";
const NAMES = new Map([[T1, "Jane Doe"], [T2, "Ryan Lee"]]);
const TODAY = "2026-10-14";

let n = 0;
const series = (over: Partial<ClassSeries> & { splitFrom?: string | null } = {}): ClassSeries & { splitFrom: string | null } => ({
  id: `5000000${++n}-0000-4000-8000-000000000000`, staffId: T1, studentId: S1, subject: "MPM2D Math", kind: "weekly",
  startDate: "2026-10-13", startTime: "17:30", durationMinutes: 60, effectiveUntil: null, splitFrom: null, ...over,
});

describe("renderSummary", () => {
  it("AC10: one line per weekly series, Monday to Sunday, then time, then subject", () => {
    const text = renderSummary([
      series({ startDate: "2026-10-16", startTime: "09:00", subject: "Z" }),
      series({ startDate: "2026-10-13", startTime: "17:30", subject: "B" }),
      series({ startDate: "2026-10-13", startTime: "17:30", subject: "A" }),
      series({ startDate: "2026-10-18", startTime: "08:00", subject: "Sun" }),
      series({ startDate: "2026-10-13", startTime: "08:15", durationMinutes: 45, subject: "Early" }),
    ], NAMES, TODAY);
    expect(text.split("\n")).toEqual([
      "Tue 08:15-09:00 | Early | Jane Doe",
      "Tue 17:30-18:30 | A | Jane Doe",
      "Tue 17:30-18:30 | B | Jane Doe",
      "Fri 09:00-10:00 | Z | Jane Doe",
      "Sun 08:00-09:00 | Sun | Jane Doe",
    ]);
  });

  it("AC10: leaves out one-offs and series that ended before today; keeps one ending today", () => {
    const text = renderSummary([
      series({ kind: "one_off", subject: "Once" }),
      series({ subject: "Ended", effectiveUntil: "2026-10-13" }),
      series({ subject: "EndsToday", startDate: "2026-10-07", effectiveUntil: TODAY }),
    ], NAMES, TODAY);
    expect(text).toBe("Wed 17:30-18:30 | EndsToday | Jane Doe | until 2026-10-14");
  });

  it("AC10: from and until fields", () => {
    expect(renderSummary([series({ startDate: "2026-10-20" })], NAMES, TODAY)).toBe("Tue 17:30-18:30 | MPM2D Math | Jane Doe | from 2026-10-20");
    expect(renderSummary([series({ startDate: "2026-10-20", effectiveUntil: "2026-12-01" })], NAMES, TODAY))
      .toBe("Tue 17:30-18:30 | MPM2D Math | Jane Doe | from 2026-10-20 | until 2026-12-01");
    expect(renderSummary([series({ effectiveUntil: "2026-12-01" })], NAMES, TODAY)).toBe("Tue 17:30-18:30 | MPM2D Math | Jane Doe | until 2026-12-01");
  });

  it("AC10: strips | and line breaks from subjects and names", () => {
    const names = new Map([[T1, "Jane | Doe\nJr"]]);
    expect(renderSummary([series({ subject: "Math | Phys\r\nics" })], names, TODAY)).toBe("Tue 17:30-18:30 | Math Phys ics | Jane Doe Jr");
  });

  it("is empty with no weekly series, and throws on a staff ID it cannot name", () => {
    expect(renderSummary([], NAMES, TODAY)).toBe("");
    expect(() => renderSummary([series({ staffId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" })], NAMES, TODAY)).toThrow("unknown_staff");
  });
});

describe("monthlyReview", () => {
  const base = series({ id: "50000000-0000-4000-8000-0000000000aa", startDate: "2026-09-01" });
  const quiet = { studentId: S1, syncState: "synced" as const, lastWrittenText: "x", freshText: "x", adoptedOn: "2026-09-01" };
  const review = (over: { series?: (ClassSeries & { splitFrom: string | null })[]; exceptions?: ClassException[]; summary?: Partial<typeof quiet> } = {}) =>
    monthlyReview({ month: "2026-11", series: over.series ?? [base], exceptions: over.exceptions ?? [], summaries: [{ ...quiet, ...over.summary }] })[0];

  it("AC17: a quiet student has needsReview false", () => {
    const r = review();
    expect(r).toMatchObject({ studentId: S1, needsReview: false, cancelled: [], moved: [], oneOff: [], from: [], until: [] });
  });

  it("AC17: cancelled and moved occurrences in the month", () => {
    const r = review({ exceptions: [
      { seriesId: base.id, originalDate: "2026-11-03", kind: "cancelled", newDate: null, newStartTime: null },
      { seriesId: base.id, originalDate: "2026-11-10", kind: "moved", newDate: "2026-11-12", newStartTime: "10:00" },
      { seriesId: base.id, originalDate: "2026-10-27", kind: "cancelled", newDate: null, newStartTime: null },
    ] });
    expect(r.needsReview).toBe(true);
    expect(r.cancelled.map((c) => c.date)).toEqual(["2026-11-03"]);
    expect(r.moved).toEqual([{ originalDate: "2026-11-10", date: "2026-11-12", startTime: "10:00", subject: "MPM2D Math" }]);
  });

  it("AC17: one-off classes, from dates, until dates", () => {
    const r = review({ series: [
      base,
      series({ kind: "one_off", startDate: "2026-11-09", subject: "Extra" }),
      series({ startDate: "2026-11-17", splitFrom: base.id, subject: "Moved time" }),
      series({ startDate: "2026-09-01", effectiveUntil: "2026-11-16", subject: "Old time" }),
    ] });
    expect(r.oneOff.map((o) => o.subject)).toEqual(["Extra"]);
    expect(r.from.map((o) => o.subject)).toEqual(["Moved time"]);
    expect(r.until.map((o) => o.subject)).toEqual(["Old time"]);
    expect(r.needsReview).toBe(true);
  });

  it("AC17: a weekly series starting within a week of adoption is not flagged as a future-effective change", () => {
    const r = review({ series: [series({ startDate: "2026-11-03" })], summary: { adoptedOn: "2026-11-01" } });
    expect(r.from).toEqual([]);
    expect(r.needsReview).toBe(false);
  });

  it("AC17: a sync state that is not synced, or a stored summary that differs from a fresh render, is flagged", () => {
    expect(review({ summary: { syncState: "failed" } })).toMatchObject({ needsReview: true, sync: { state: "failed", stale: false } });
    expect(review({ summary: { freshText: "y" } })).toMatchObject({ needsReview: true, sync: { state: "synced", stale: true } });
  });
});
