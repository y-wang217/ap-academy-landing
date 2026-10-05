import { describe, expect, it } from "vitest";
import { daysBetween, suggestPriorities, type SuggestionAssessment, type SuggestionCourse } from "./suggestions";
import { TUNING } from "./tuning";

const TODAY = "2026-10-05";

const course = (over: Partial<SuggestionCourse> = {}): SuggestionCourse => ({
  id: "c1",
  code: "SCH4U",
  status: "active",
  grade: 84,
  targetGrade: 90,
  categories: [
    { name: "Tests", percent: 71 },
    { name: "Labs", percent: 95 },
    { name: "Final", percent: null },
  ],
  ...over,
});

const item = (over: Partial<SuggestionAssessment> = {}): SuggestionAssessment => ({
  id: "a1",
  courseId: "c1",
  title: "Unit 3 Test",
  dueDate: "2026-10-09",
  state: "upcoming",
  ...over,
});

describe("daysBetween", () => {
  it("counts calendar days between ISO dates", () => {
    expect(daysBetween("2026-10-05", "2026-10-05")).toBe(0);
    expect(daysBetween("2026-10-05", "2026-10-09")).toBe(4);
    expect(daysBetween("2026-10-30", "2026-11-02")).toBe(3);
    expect(daysBetween("2026-10-05", "2026-10-01")).toBe(-4);
  });
});

describe("suggestPriorities", () => {
  it("prepare: below target with work due soon (the plan's own example)", () => {
    const out = suggestPriorities([course()], [item()], TODAY, new Set());
    expect(out).toEqual([
      { key: "prepare:a1", courseId: "c1", kind: "prepare", title: "Prepare for Unit 3 Test", gap: 6, assessmentTitle: "Unit 3 Test", daysUntil: 4 },
    ]);
  });

  it("review: below target with nothing due soon names the lowest category", () => {
    const out = suggestPriorities([course()], [item({ dueDate: "2026-11-30" })], TODAY, new Set());
    expect(out).toEqual([
      { key: "review:c1", courseId: "c1", kind: "review", title: "Review Tests in SCH4U", gap: 6, categoryName: "Tests", categoryPercent: 71 },
    ]);
  });

  it("suggests nothing for a course on or above target, or within the gap threshold", () => {
    expect(suggestPriorities([course({ grade: 90 })], [item()], TODAY, new Set())).toEqual([]);
    expect(suggestPriorities([course({ grade: 95 })], [item()], TODAY, new Set())).toEqual([]);
    const justInside = 90 - TUNING.suggestGapPoints + 0.01;
    expect(suggestPriorities([course({ grade: justInside })], [item()], TODAY, new Set())).toEqual([]);
    const atThreshold = 90 - TUNING.suggestGapPoints;
    expect(suggestPriorities([course({ grade: atThreshold })], [item()], TODAY, new Set())).toHaveLength(1);
  });

  it("never guesses: no grade, no target, or an inactive course suggests nothing", () => {
    expect(suggestPriorities([course({ grade: null })], [item()], TODAY, new Set())).toEqual([]);
    expect(suggestPriorities([course({ targetGrade: null })], [item()], TODAY, new Set())).toEqual([]);
    expect(suggestPriorities([course({ status: "completed" })], [item()], TODAY, new Set())).toEqual([]);
    expect(suggestPriorities([course({ status: "planned" })], [item()], TODAY, new Set())).toEqual([]);
  });

  it("only upcoming work, not yet done, inside the window counts as due soon", () => {
    const window = TUNING.suggestSoonDays;
    const due = (days: number) => `2026-10-${String(5 + days).padStart(2, "0")}`;
    const kinds = (a: SuggestionAssessment) => suggestPriorities([course()], [a], TODAY, new Set()).map((s) => s.kind);
    expect(kinds(item({ dueDate: due(0) }))).toEqual(["prepare"]);
    expect(kinds(item({ dueDate: due(window) }))).toEqual(["prepare"]);
    expect(kinds(item({ dueDate: due(window + 1) }))).toEqual(["review"]);
    expect(kinds(item({ state: "done" }))).toEqual(["review"]);
    expect(kinds(item({ state: "graded" }))).toEqual(["review"]);
    expect(kinds(item({ dueDate: null }))).toEqual(["review"]);
    expect(kinds(item({ courseId: "other" }))).toEqual(["review"]);
  });

  it("hides a suggestion whose key matches an open task", () => {
    expect(suggestPriorities([course()], [item()], TODAY, new Set(["prepare:a1"]))).toEqual([]);
    expect(suggestPriorities([course()], [item({ dueDate: null })], TODAY, new Set(["review:c1"]))).toEqual([]);
  });

  it("orders soonest preparation first, then reviews by the largest gap, and caps the list", () => {
    const courses = [
      course({ id: "c1", code: "SCH4U", grade: 84 }),
      course({ id: "c2", code: "MHF4U", grade: 80 }),
      course({ id: "c3", code: "ENG4U", grade: 70, targetGrade: 85 }),
    ];
    const items = [
      item({ id: "a1", courseId: "c1", title: "Unit 3 Test", dueDate: "2026-10-09" }),
      item({ id: "a2", courseId: "c1", title: "Lab report", dueDate: "2026-10-06" }),
    ];
    const keys = suggestPriorities(courses, items, TODAY, new Set()).map((s) => s.key);
    expect(keys).toEqual(["prepare:a2", "prepare:a1", "review:c3", "review:c2"]);
    expect(suggestPriorities(courses, items, TODAY, new Set(), 2).map((s) => s.key)).toEqual(["prepare:a2", "prepare:a1"]);
  });

  it("is deterministic for the same input", () => {
    const a = suggestPriorities([course()], [item()], TODAY, new Set());
    const b = suggestPriorities([course()], [item()], TODAY, new Set());
    expect(a).toEqual(b);
  });
});
