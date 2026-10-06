/**
 * The status pill on a course row (ADR 0031), in the owner's words:
 *   Needs focus: 2 or more points below the course target (the overall average).
 *   Improving: otherwise, the grade rose about 1 point or more over the last few marks.
 *   Stable: anything else.
 *   No grades yet: no marks.
 * Pure. Every number is in tuning.ts.
 */
import type { HistoryPoint } from "./history";
import { TUNING } from "./tuning";

export type Trend = "no_grades" | "needs_focus" | "improving" | "stable";

export type TrendInput = {
  grade: number | null;
  targetGrade: number | null;
  history: readonly Pick<HistoryPoint, "grade">[];
};

/** Latest grade minus the grade trendWindowMarks dated marks earlier (or the first). null with fewer than two points. */
export function trendDelta(history: TrendInput["history"]): number | null {
  if (history.length < 2) return null;
  const last = history[history.length - 1].grade;
  const from = history[Math.max(0, history.length - 1 - TUNING.trendWindowMarks)].grade;
  return last - from;
}

export function courseTrend({ grade, targetGrade, history }: TrendInput): Trend {
  if (grade === null) return "no_grades";
  if (targetGrade !== null && targetGrade - grade >= TUNING.focusGapPoints) return "needs_focus";
  const delta = trendDelta(history);
  if (delta !== null && delta >= TUNING.trendRisePoints) return "improving";
  return "stable";
}
