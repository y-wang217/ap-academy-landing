/** Six-course progress and target checks (ADRs 0010, 0022). Pure. */
import { TUNING } from "./tuning";

export type SixCourseInput = { inSixPlan: boolean; grade: number | null; targetGrade: number | null };

export type SixCourseProgress = {
  gradedCount: number;
  planCount: number;
  /** Average of the graded courses in the plan. null when none is graded. */
  averageOfGraded: number | null;
  target: number | null;
  /** True only when every planned course (and exactly six) has a grade. */
  complete: boolean;
  /** Label for averageOfGraded. Never calls a partial average the six-course average. */
  label: string;
  /** averageOfGraded minus target, when both exist. */
  gapToTarget: number | null;
};

export function sixCourseProgress(courses: readonly SixCourseInput[], target: number | null): SixCourseProgress {
  const planned = courses.filter((c) => c.inSixPlan);
  const graded = planned.filter((c) => c.grade !== null) as (SixCourseInput & { grade: number })[];
  const averageOfGraded = graded.length ? graded.reduce((s, c) => s + c.grade, 0) / graded.length : null;
  const complete = graded.length === TUNING.sixCourseCount && planned.length === TUNING.sixCourseCount;
  const label = complete
    ? "Six-course average"
    : `Average of ${graded.length} graded course${graded.length === 1 ? "" : "s"}`;
  return {
    gradedCount: graded.length,
    planCount: TUNING.sixCourseCount,
    averageOfGraded,
    target,
    complete,
    label,
    gapToTarget: averageOfGraded !== null && target !== null ? averageOfGraded - target : null,
  };
}

export type TargetsCheck =
  | { kind: "ok"; average: number }
  | { kind: "incomplete"; missing: number }
  | { kind: "mismatch"; average: number; target: number; difference: number };

/** Warn (never block) when the six course targets don't average to the goal. */
export function checkCourseTargets(courseTargets: readonly (number | null)[], sixTarget: number): TargetsCheck {
  const set = courseTargets.filter((t): t is number => t !== null);
  if (set.length < TUNING.sixCourseCount) return { kind: "incomplete", missing: TUNING.sixCourseCount - set.length };
  const average = set.reduce((s, t) => s + t, 0) / set.length;
  const difference = average - sixTarget;
  return Math.abs(difference) > TUNING.targetsTolerance
    ? { kind: "mismatch", average, target: sixTarget, difference }
    : { kind: "ok", average };
}
