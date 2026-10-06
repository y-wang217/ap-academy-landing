import { describe, expect, it } from "vitest";
import { computeCourseGrade, type GradeCategory } from "./grades";
import { gradeHistory, type HistoryAssessment } from "./history";
import { courseTrend, trendDelta } from "./trend";
import { TUNING } from "./tuning";

// The brief's reference example, spread over four dates.
const categories: GradeCategory[] = [
  { id: "tests", name: "Tests", weight: 50, aggregationMethod: "mean_of_percentages", needsReview: false },
  { id: "assign", name: "Assignments", weight: 20, aggregationMethod: "mean_of_percentages", needsReview: false },
  { id: "final", name: "Final", weight: 20, aggregationMethod: "mean_of_percentages", needsReview: false },
  { id: "part", name: "Participation", weight: 10, aggregationMethod: "mean_of_percentages", needsReview: false },
];

// Tests carry the date as heldOn, the rest as dueDate, so both paths are covered.
const mark = (id: string, categoryId: string, earned: number | null, possible: number, date: string | null, o: Partial<HistoryAssessment> = {}): HistoryAssessment => {
  const isTest = categoryId === "tests";
  return {
    id, categoryId, scoreEarned: earned, scorePossible: possible, excused: false,
    dueDate: !isTest ? date : null, heldOn: isTest ? date : null,
    ...o,
  };
};

const marks = [
  mark("t1", "tests", 30, 32, "2026-09-10"),
  mark("a1", "assign", 10, 10, "2026-09-11"),
  mark("a2", "assign", 9, 10, "2026-09-11"),
  mark("t2", "tests", 41, 42, "2026-09-20"),
  mark("a3", "assign", 10, 10, "2026-09-25"),
  mark("p1", "part", 3, 3, "2026-09-25"),
];

describe("gradeHistory", () => {
  it("replays the engine on each date and ends at the headline grade", () => {
    const points = gradeHistory(categories, marks);
    expect(points.map((p) => p.date)).toEqual(["2026-09-10", "2026-09-11", "2026-09-20", "2026-09-25"]);
    expect(points[0].grade).toBeCloseTo((30 / 32) * 100, 10);
    expect(points[1].grade).toBeCloseTo((((30 / 32) * 50 + ((10 / 10 + 9 / 10) / 2) * 20) / 70) * 100, 10);
    expect(points.at(-1)?.grade).toBeCloseTo(computeCourseGrade(categories, marks).grade as number, 10);
    expect(points[1].assessmentIds).toEqual(["a1", "a2"]);
    expect(points[3].assessmentIds).toEqual(["a3", "p1"]);
  });

  it("counts an undated mark at every point, so the last point still matches the headline", () => {
    const withUndated = [...marks, mark("x", "final", 40, 50, null)];
    const points = gradeHistory(categories, withUndated);
    expect(points).toHaveLength(4);
    expect(points[0].grade).toBeCloseTo((((30 / 32) * 50 + (40 / 50) * 20) / 70) * 100, 10);
    expect(points.at(-1)?.grade).toBeCloseTo(computeCourseGrade(categories, withUndated).grade as number, 10);
    expect(points.flatMap((p) => p.assessmentIds)).not.toContain("x");
  });

  it("ignores excused and unmarked work, and reads a held date like a due date", () => {
    const points = gradeHistory(categories, [
      ...marks,
      mark("ex", "tests", 0, 10, "2026-09-30", { excused: true }),
      mark("un", "tests", null, 10, "2026-10-01"),
      mark("later", "tests", 50, 50, "2026-10-02", { heldOn: null, dueDate: "2026-10-02" }),
    ]);
    expect(points.map((p) => p.date)).toEqual(["2026-09-10", "2026-09-11", "2026-09-20", "2026-09-25", "2026-10-02"]);
  });

  it("has no points without a dated mark", () => {
    expect(gradeHistory(categories, [])).toEqual([]);
    expect(gradeHistory(categories, [mark("x", "tests", 9, 10, null)])).toEqual([]);
  });
});

describe("courseTrend", () => {
  const pts = (...grades: number[]) => grades.map((grade) => ({ grade }));

  it("reproduces the mock's six pills", () => {
    // Needs focus wins over a rise: Physics is climbing but 6 below its target.
    expect(courseTrend({ grade: 86, targetGrade: 92, history: pts(78, 81, 74, 81, 82, 86) })).toBe("needs_focus");
    expect(courseTrend({ grade: 96.5, targetGrade: 95, history: pts(81, 85, 87, 92, 93, 96.5) })).toBe("improving");
    expect(courseTrend({ grade: 89.3, targetGrade: 91, history: pts(75, 78, 82, 85, 86, 89.3) })).toBe("improving");
    // Calculus: 1 below target (inside the 2-point line) and flat over the last three marks.
    expect(courseTrend({ grade: 93, targetGrade: 94, history: pts(82, 85, 92.6, 92.8, 92.9, 93) })).toBe("stable");
    expect(courseTrend({ grade: null, targetGrade: 92, history: [] })).toBe("no_grades");
    expect(courseTrend({ grade: null, targetGrade: null, history: [] })).toBe("no_grades");
  });

  it("uses the tuning thresholds exactly", () => {
    expect(courseTrend({ grade: 90 - TUNING.focusGapPoints, targetGrade: 90, history: [] })).toBe("needs_focus");
    expect(courseTrend({ grade: 90 - TUNING.focusGapPoints + 0.01, targetGrade: 90, history: pts(80, 80) })).toBe("stable");
    expect(courseTrend({ grade: 90, targetGrade: null, history: pts(89, 89 + TUNING.trendRisePoints) })).toBe("improving");
    expect(courseTrend({ grade: 90, targetGrade: null, history: pts(89, 89 + TUNING.trendRisePoints - 0.01) })).toBe("stable");
  });

  it("looks back over the trend window, or to the first mark when there are fewer", () => {
    expect(trendDelta(pts(80))).toBeNull();
    expect(trendDelta(pts(80, 82))).toBe(2);
    expect(trendDelta(pts(70, 80, 80, 80, 81))).toBeCloseTo(1, 10);
    expect(trendDelta(pts(70, 70, 80, 80, 80, 81))).toBeCloseTo(1, 10);
    expect(courseTrend({ grade: 85, targetGrade: null, history: pts(85) })).toBe("stable");
  });
});
