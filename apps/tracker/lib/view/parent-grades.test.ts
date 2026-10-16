import { describe, expect, it, vi } from "vitest";
import { buildParentGrades, parentGradesState, recentMarks } from "./parent-grades";
import { buildStudentView } from "./student-view";
import { assessment, bundle, TODAY } from "./test-fixture";

describe("buildParentGrades", () => {
  it("gives the same numbers and story as the student view (AC1)", () => {
    const b = bundle();
    const parent = buildParentGrades(b, TODAY).view;
    const student = buildStudentView(b, TODAY);
    expect(parent.courses.map((c) => [c.result.grade, c.gapToTarget, c.markedWeight, c.trend, c.trendDelta]))
      .toEqual(student.courses.map((c) => [c.result.grade, c.gapToTarget, c.markedWeight, c.trend, c.trendDelta]));
    expect(parent.progress).toEqual(student.progress);
    expect(parent.story).toEqual(student.story);
  });

  it("ignores grade flags (AC2)", () => {
    const b = bundle();
    b.flags = [{ id: "f1", assessmentId: "t1", reason: "score_differs", createdAt: "2026-10-02T00:00:00Z", resolvedAt: null }];
    const { view } = buildParentGrades(b, TODAY);
    expect(view.flagged).toEqual([]);
    expect(view.courses.flatMap((c) => c.assessments).every((a) => a.openFlag === null)).toBe(true);
  });
});

describe("recentMarks", () => {
  const view = (assessments: ReturnType<typeof assessment>[]) => {
    const b = bundle();
    b.assessments = assessments;
    return buildStudentView(b, TODAY);
  };

  it("keeps the 5 newest scored, non-excused marks across courses (AC3)", () => {
    const v = view([
      assessment("a1", "mhf", "assign", 5, 10, "2026-09-01"),
      assessment("a2", "mhf", "assign", 5, 10, "2026-09-02"),
      assessment("a3", "sch", "all", 5, 10, "2026-09-03"),
      assessment("a4", "sch", "all", 5, 10, "2026-09-04"),
      assessment("a5", "mhf", "assign", 5, 10, "2026-09-05"),
      assessment("a6", "mhf", "assign", 5, 10, "2026-09-06"),
      assessment("a7", "sch", "all", 5, 10, "2026-09-07"),
      assessment("ex", "mhf", "assign", 5, 10, "2026-09-30", { excused: true }),
      assessment("un", "mhf", "assign", null, 10, "2026-09-29"),
    ]);
    expect(recentMarks(v).map((m) => m.id)).toEqual(["a7", "a6", "a5", "a4", "a3"]);
  });

  it("orders a test by held_on, an assignment by due date, never by the entry stamp", () => {
    const v = view([
      assessment("old", "mhf", "assign", 5, 10, "2026-09-01", { gradedAt: "2026-10-03T00:00:00Z" }),
      assessment("test", "mhf", "tests", 5, 10, null, { kind: "test", heldOn: "2026-09-20" }),
      assessment("new", "mhf", "assign", 5, 10, "2026-09-25", { gradedAt: "2026-09-26T00:00:00Z" }),
    ]);
    expect(recentMarks(v).map((m) => m.id)).toEqual(["new", "test", "old"]);
  });

  it("puts undated marks last and breaks ties by course code, then title", () => {
    const v = view([
      assessment("undated", "mhf", "assign", 5, 10, null),
      assessment("b", "sch", "all", 5, 10, "2026-09-01", { title: "B" }),
      assessment("a2", "mhf", "assign", 5, 10, "2026-09-01", { title: "Z" }),
      assessment("a1", "mhf", "assign", 5, 10, "2026-09-01", { title: "A" }),
    ]);
    expect(recentMarks(v).map((m) => m.id)).toEqual(["a1", "a2", "b", "undated"]);
  });

  it("is empty for an empty bundle", () => {
    expect(recentMarks(view([]))).toEqual([]);
  });

  it("words each row (AC4)", () => {
    const v = view([
      assessment("t2", "mhf", "tests", 41, 42, null, { kind: "test", heldOn: "2026-10-09", title: "Unit 2 test" }),
      assessment("bonus", "mhf", "assign", 11, 10, null, { title: "Bonus" }),
    ]);
    expect(recentMarks(v)).toEqual([
      { id: "t2", dateText: "Fri, Oct 9", courseCode: "MHF", title: "Unit 2 test", scoreText: "41 / 42", percentText: "97.6%" },
      { id: "bonus", dateText: "No date", courseCode: "MHF", title: "Bonus", scoreText: "11 / 10", percentText: "110.0%" },
    ]);
  });
});

describe("parentGradesState", () => {
  it("is not ready for an unpublished child and never loads (AC10)", async () => {
    const load = vi.fn();
    expect(await parentGradesState({ id: "s", published: false }, load, TODAY)).toEqual({ kind: "not_ready" });
    expect(load).toHaveBeenCalledTimes(0);
  });

  it("is not ready when the bundle is hidden, and ready otherwise (AC11)", async () => {
    expect(await parentGradesState({ id: "s", published: true }, async () => null, TODAY)).toEqual({ kind: "not_ready" });
    const load = vi.fn(async () => bundle());
    const state = await parentGradesState({ id: "s", published: true }, load, TODAY);
    expect(state.kind).toBe("ready");
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith("s");
  });
});
