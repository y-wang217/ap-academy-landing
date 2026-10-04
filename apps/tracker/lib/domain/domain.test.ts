import { describe, expect, it } from "vitest";
import { assessmentState } from "./assessment-state";
import { nextPriorities, orderTasks, upcomingWork, type TaskInput } from "./priorities";
import { checkCourseTargets, sixCourseProgress } from "./progress";

describe("sixCourseProgress", () => {
  const course = (grade: number | null, inSixPlan = true) => ({ inSixPlan, grade, targetGrade: 90 });

  it("reports graded count and never calls a partial average the six-course average", () => {
    const p = sixCourseProgress([course(90), course(80), course(null), course(null), course(null), course(null)], 88);
    expect(p.gradedCount).toBe(2);
    expect(p.planCount).toBe(6);
    expect(p.averageOfGraded).toBe(85);
    expect(p.complete).toBe(false);
    expect(p.label).toBe("Average of 2 graded courses");
    expect(p.label).not.toMatch(/six/i);
    expect(p.gapToTarget).toBe(-3);
  });

  it("labels the full six as the six-course average", () => {
    const p = sixCourseProgress([90, 91, 92, 93, 94, 95].map((g) => course(g)), 90);
    expect(p.complete).toBe(true);
    expect(p.label).toBe("Six-course average");
    expect(p.averageOfGraded).toBe(92.5);
  });

  it("ignores courses outside the plan and handles nothing graded", () => {
    const p = sixCourseProgress([course(50, false), course(null)], null);
    expect(p.gradedCount).toBe(0);
    expect(p.averageOfGraded).toBeNull();
    expect(p.label).toBe("Average of 0 graded courses");
    expect(p.gapToTarget).toBeNull();
  });
});

describe("checkCourseTargets", () => {
  it("is ok within 0.5 points, warns beyond", () => {
    expect(checkCourseTargets([90, 90, 90, 90, 90, 92], 90).kind).toBe("ok");
    const m = checkCourseTargets([85, 85, 85, 85, 85, 85], 90);
    expect(m).toEqual({ kind: "mismatch", average: 85, target: 90, difference: -5 });
  });

  it("reports missing targets", () => {
    expect(checkCourseTargets([90, null, 90], 90)).toEqual({ kind: "incomplete", missing: 4 });
  });
});

describe("assessmentState", () => {
  const today = "2026-10-04";
  const base = { dueDate: "2026-10-10", studentDoneAt: null, scoreEarned: null, excused: false };
  it("walks upcoming, done, awaiting result, graded", () => {
    expect(assessmentState(base, today)).toBe("upcoming");
    expect(assessmentState({ ...base, studentDoneAt: "2026-10-03T12:00:00Z" }, today)).toBe("done");
    expect(assessmentState({ ...base, dueDate: "2026-10-01", studentDoneAt: "x" }, today)).toBe("awaiting_result");
    expect(assessmentState({ ...base, dueDate: "2026-10-01" }, today)).toBe("awaiting_result");
    expect(assessmentState({ ...base, scoreEarned: 0 }, today)).toBe("graded");
  });
  it("treats due today as not yet passed, and excused as its own state", () => {
    expect(assessmentState({ ...base, dueDate: today }, today)).toBe("upcoming");
    expect(assessmentState({ ...base, excused: true, scoreEarned: 5 }, today)).toBe("excused");
  });
  it("done never awards marks: a done item has no grade state", () => {
    expect(assessmentState({ ...base, studentDoneAt: "x" }, today)).not.toBe("graded");
  });
});

describe("priorities", () => {
  const t = (id: string, o: Partial<TaskInput> = {}): TaskInput => ({
    id, kind: "school", pinned: false, rank: 0, doneAt: null, createdAt: "2026-10-01T00:00:00Z", ...o,
  });
  it("puts pinned first, then rank, and hides done tasks", () => {
    const ordered = orderTasks([t("a", { rank: 1 }), t("b", { pinned: true, rank: 5 }), t("c", { rank: 0 }), t("d", { doneAt: "x" })]);
    expect(ordered.map((x) => x.id)).toEqual(["b", "c", "a"]);
  });
  it("keeps supplemental work out of next priorities", () => {
    expect(nextPriorities([t("s", { kind: "supplemental", pinned: true }), t("a")]).map((x) => x.id)).toEqual(["a"]);
  });
  it("lists ungraded work due today or later, soonest first", () => {
    const items = [
      { id: 1, dueDate: "2026-10-09", scoreEarned: null, excused: false },
      { id: 2, dueDate: "2026-10-04", scoreEarned: null, excused: false },
      { id: 3, dueDate: "2026-10-01", scoreEarned: null, excused: false },
      { id: 4, dueDate: "2026-10-05", scoreEarned: 8, excused: false },
      { id: 5, dueDate: null, scoreEarned: null, excused: false },
    ];
    expect(upcomingWork(items, "2026-10-04").map((x) => x.id)).toEqual([2, 1]);
  });
});
