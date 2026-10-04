import { describe, expect, it } from "vitest";
import {
  computeCourseGrade,
  validateAssessment,
  validateSyllabus,
  type GradeAssessment,
  type GradeCategory,
} from "./grades";

// The brief's reference example (CLAUDE.md, "Required tests").
function referenceCategories(testsMethod: GradeCategory["aggregationMethod"] = "mean_of_percentages") {
  const categories: GradeCategory[] = [
    { id: "tests", name: "Tests", weight: 50, aggregationMethod: testsMethod, needsReview: false },
    { id: "assign", name: "Assignments", weight: 20, aggregationMethod: "mean_of_percentages", needsReview: false },
    { id: "final", name: "Final", weight: 20, aggregationMethod: "mean_of_percentages", needsReview: false },
    { id: "part", name: "Participation", weight: 10, aggregationMethod: "mean_of_percentages", needsReview: false },
  ];
  return categories;
}

function scored(categoryId: string, earned: number | null, possible: number, excused = false): GradeAssessment {
  return { categoryId, scoreEarned: earned, scorePossible: possible, excused };
}

const referenceAssessments: GradeAssessment[] = [
  scored("tests", 30, 32),
  scored("tests", 41, 42),
  scored("assign", 10, 10),
  scored("assign", 9, 10),
  scored("assign", 10, 10),
  scored("part", 3, 3),
];

describe("computeCourseGrade", () => {
  it("matches the brief's reference example: 96.47%", () => {
    const result = computeCourseGrade(referenceCategories(), referenceAssessments);
    // Exact value at full precision (ADR 0019). The brief's "approximately
    // 96.4709" comes from rounding the category percentages first.
    const exact = ((((30 / 32 + 41 / 42) / 2) * 50 + (2.9 / 3) * 20 + 1 * 10) / 80) * 100;
    expect(result.grade).toBeCloseTo(exact, 10);
    expect(result.grade!.toFixed(2)).toBe("96.47");
    expect(result.grade!.toFixed(1)).toBe("96.5");
  });

  it("uses 71/74 for Tests when Tests pools points", () => {
    const result = computeCourseGrade(referenceCategories("pooled_points"), referenceAssessments);
    const tests = result.categories.find((c) => c.categoryId === "tests")!;
    expect(tests.percent).toBeCloseTo((71 / 74) * 100, 10);
    const expected = (((71 / 74) * 50 + (2.9 / 3) * 20 + 10) / 80) * 100;
    expect(result.grade).toBeCloseTo(expected, 10);
  });

  it("counts a real zero and lowers the grade", () => {
    const withZero = computeCourseGrade(referenceCategories(), [...referenceAssessments, scored("part", 0, 3)]);
    const base = computeCourseGrade(referenceCategories(), referenceAssessments);
    expect(withZero.grade!).toBeLessThan(base.grade!);
  });

  it("ignores an unmarked (null) score", () => {
    const withNull = computeCourseGrade(referenceCategories(), [...referenceAssessments, scored("part", null, 3)]);
    const base = computeCourseGrade(referenceCategories(), referenceAssessments);
    expect(withNull.grade).toBe(base.grade);
  });

  it("returns null, never 0, when no category has scores", () => {
    const result = computeCourseGrade(referenceCategories(), [scored("tests", null, 32)]);
    expect(result.grade).toBeNull();
    expect(computeCourseGrade(referenceCategories(), []).grade).toBeNull();
  });

  it("ignores an excused assessment, even a scored one", () => {
    const withExcused = computeCourseGrade(referenceCategories(), [...referenceAssessments, scored("part", 0, 3, true)]);
    const base = computeCourseGrade(referenceCategories(), referenceAssessments);
    expect(withExcused.grade).toBe(base.grade);
  });

  it("normalizes over scored categories only", () => {
    const result = computeCourseGrade(referenceCategories(), [scored("tests", 40, 50)]);
    expect(result.grade).toBeCloseTo(80, 10);
    const final = result.categories.find((c) => c.categoryId === "final")!;
    expect(final.percent).toBeNull();
    expect(final.scoredCount).toBe(0);
  });

  it("still computes with needs_review, and warns", () => {
    const categories = referenceCategories();
    categories[1] = { ...categories[1], needsReview: true };
    const result = computeCourseGrade(categories, referenceAssessments);
    expect(result.grade).not.toBeNull();
    expect(result.warnings).toContainEqual({ kind: "needs_review", categoryId: "assign", categoryName: "Assignments" });
  });

  it("allows bonus over 100% and warns", () => {
    const result = computeCourseGrade(referenceCategories(), [scored("part", 4, 3)]);
    expect(result.grade).toBeCloseTo((4 / 3) * 100, 10);
    expect(result.warnings.some((w) => w.kind === "over_100")).toBe(true);
  });

  it("ignores assessments whose category is not in the syllabus, and warns", () => {
    const result = computeCourseGrade(referenceCategories(), [...referenceAssessments, scored("ghost", 0, 10)]);
    expect(result.grade).toBe(computeCourseGrade(referenceCategories(), referenceAssessments).grade);
    expect(result.warnings.some((w) => w.kind === "unknown_category")).toBe(true);
  });
});

describe("validateSyllabus", () => {
  it("accepts weights summing to 100 within 0.001", () => {
    expect(validateSyllabus(referenceCategories())).toEqual([]);
    const near = referenceCategories();
    near[0] = { ...near[0], weight: 50.0005 };
    expect(validateSyllabus(near)).toEqual([]);
  });

  it("rejects weights not summing to 100", () => {
    const off = referenceCategories();
    off[0] = { ...off[0], weight: 45 };
    expect(validateSyllabus(off)).toContainEqual({ kind: "weights_not_100", total: 95 });
  });

  it("rejects an empty syllabus, negative weights and blank names", () => {
    expect(validateSyllabus([])).toContainEqual({ kind: "no_categories" });
    const bad = referenceCategories();
    bad[0] = { ...bad[0], weight: -10, name: " " };
    bad[1] = { ...bad[1], weight: 80 };
    const errors = validateSyllabus(bad).map((e) => e.kind);
    expect(errors).toContain("negative_weight");
    expect(errors).toContain("blank_name");
  });
});

describe("validateAssessment", () => {
  it("requires score_possible > 0 and score_earned >= 0", () => {
    expect(validateAssessment({ scoreEarned: 5, scorePossible: 10 })).toEqual([]);
    expect(validateAssessment({ scoreEarned: null, scorePossible: 10 })).toEqual([]);
    expect(validateAssessment({ scoreEarned: 5, scorePossible: 0 })).toContainEqual({ kind: "possible_not_positive" });
    expect(validateAssessment({ scoreEarned: -1, scorePossible: 10 })).toContainEqual({ kind: "earned_negative" });
  });

  it("allows bonus but flags it", () => {
    expect(validateAssessment({ scoreEarned: 11, scorePossible: 10 })).toEqual([{ kind: "over_100", severity: "warning" }]);
  });
});
