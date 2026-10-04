/**
 * The grade engine (ADR 0005). Pure and deterministic: no React, Next or
 * Supabase, no clock, no rounding. Percentages are on a 0 to 100 scale at full
 * precision; the UI rounds to 1 decimal place.
 */
import { TUNING } from "./tuning";

export type AggregationMethod = "mean_of_percentages" | "pooled_points";

export type GradeCategory = {
  id: string;
  name: string;
  weight: number;
  aggregationMethod: AggregationMethod;
  needsReview: boolean;
};

export type GradeAssessment = {
  categoryId: string;
  /** null means unmarked and is excluded; 0 is a real zero (ADR 0007). */
  scoreEarned: number | null;
  scorePossible: number;
  excused: boolean;
};

export type CategoryResult = {
  categoryId: string;
  name: string;
  weight: number;
  aggregationMethod: AggregationMethod;
  /** null when nothing in the category is scored. */
  percent: number | null;
  scoredCount: number;
};

export type GradeWarning =
  | { kind: "needs_review"; categoryId: string; categoryName: string }
  | { kind: "over_100"; categoryId: string }
  | { kind: "unknown_category"; categoryId: string };

export type CourseGradeResult = {
  /** null means "No grades yet", never 0. */
  grade: number | null;
  categories: CategoryResult[];
  warnings: GradeWarning[];
};

function counts(a: GradeAssessment): boolean {
  return !a.excused && a.scoreEarned !== null && a.scorePossible > 0;
}

function aggregate(method: AggregationMethod, items: GradeAssessment[]): number | null {
  if (items.length === 0) return null;
  if (method === "pooled_points") {
    const earned = items.reduce((sum, a) => sum + (a.scoreEarned as number), 0);
    const possible = items.reduce((sum, a) => sum + a.scorePossible, 0);
    return (earned / possible) * 100;
  }
  const mean = items.reduce((sum, a) => sum + (a.scoreEarned as number) / a.scorePossible, 0) / items.length;
  return mean * 100;
}

/**
 * Course grade = sum(category_pct x weight) / sum(weights of categories that
 * have scores). Categories without scores drop out of both sums.
 */
export function computeCourseGrade(
  categories: readonly GradeCategory[],
  assessments: readonly GradeAssessment[],
): CourseGradeResult {
  const warnings: GradeWarning[] = [];
  const known = new Set(categories.map((c) => c.id));

  for (const a of assessments) {
    if (!known.has(a.categoryId)) {
      if (!warnings.some((w) => w.kind === "unknown_category" && w.categoryId === a.categoryId)) {
        warnings.push({ kind: "unknown_category", categoryId: a.categoryId });
      }
    } else if (counts(a) && (a.scoreEarned as number) > a.scorePossible) {
      if (!warnings.some((w) => w.kind === "over_100" && w.categoryId === a.categoryId)) {
        warnings.push({ kind: "over_100", categoryId: a.categoryId });
      }
    }
  }

  let weighted = 0;
  let weightTotal = 0;
  const results: CategoryResult[] = categories.map((category) => {
    if (category.needsReview) {
      warnings.push({ kind: "needs_review", categoryId: category.id, categoryName: category.name });
    }
    const items = assessments.filter((a) => a.categoryId === category.id && counts(a));
    const percent = aggregate(category.aggregationMethod, items);
    if (percent !== null) {
      weighted += percent * category.weight;
      weightTotal += category.weight;
    }
    return {
      categoryId: category.id,
      name: category.name,
      weight: category.weight,
      aggregationMethod: category.aggregationMethod,
      percent,
      scoredCount: items.length,
    };
  });

  return { grade: weightTotal > 0 ? weighted / weightTotal : null, categories: results, warnings };
}

export type SyllabusError =
  | { kind: "no_categories" }
  | { kind: "weights_not_100"; total: number }
  | { kind: "negative_weight"; categoryId: string }
  | { kind: "blank_name"; categoryId: string };

/** Errors that must block saving a syllabus version. Empty means valid. */
export function validateSyllabus(categories: readonly Pick<GradeCategory, "id" | "name" | "weight">[]): SyllabusError[] {
  if (categories.length === 0) return [{ kind: "no_categories" }];
  const errors: SyllabusError[] = [];
  for (const c of categories) {
    if (c.weight < 0) errors.push({ kind: "negative_weight", categoryId: c.id });
    if (c.name.trim() === "") errors.push({ kind: "blank_name", categoryId: c.id });
  }
  const total = categories.reduce((sum, c) => sum + c.weight, 0);
  if (Math.abs(total - 100) > TUNING.weightSumTolerance) errors.push({ kind: "weights_not_100", total });
  return errors;
}

export type AssessmentIssue =
  | { kind: "possible_not_positive" }
  | { kind: "earned_negative" }
  | { kind: "over_100"; severity: "warning" };

/** Errors block saving; the over-100 bonus case is a warning only. */
export function validateAssessment(a: { scoreEarned: number | null; scorePossible: number }): AssessmentIssue[] {
  const issues: AssessmentIssue[] = [];
  if (!(a.scorePossible > 0)) issues.push({ kind: "possible_not_positive" });
  if (a.scoreEarned !== null && a.scoreEarned < 0) issues.push({ kind: "earned_negative" });
  if (issues.length === 0 && a.scoreEarned !== null && a.scoreEarned > a.scorePossible) {
    issues.push({ kind: "over_100", severity: "warning" });
  }
  return issues;
}
