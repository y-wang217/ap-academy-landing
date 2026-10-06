/**
 * A course's grade over time (ADR 0031). Pure: the grade on any past day is
 * the engine run over the marks from work held or due by that day, so every
 * chart point is reproducible from the rows. Points sit on the assessment's
 * own date, never on the entry stamp.
 */
import { assessmentDate, type DatedInput } from "./assessment-date";
import { computeCourseGrade, type GradeAssessment, type GradeCategory } from "./grades";

export type HistoryAssessment = GradeAssessment & DatedInput & { id: string };

export type HistoryPoint = {
  /** ISO date (YYYY-MM-DD). */
  date: string;
  grade: number;
  /** The scored marks that happened on this date, for tap-to-reveal. */
  assessmentIds: string[];
};

function counts(a: GradeAssessment): boolean {
  return !a.excused && a.scoreEarned !== null && a.scorePossible > 0;
}

/**
 * One point per date with a scored mark, oldest first. Undated scored marks
 * have no place in time, so they count at every point; the last point then
 * always equals the headline grade. A course whose marks are all undated has
 * no points.
 */
/**
 * Each assessment's rough share of the course grade, 0 to 100: its
 * category's weight split evenly across the category's non-excused items.
 * A fact about the syllabus, not a forecast of the mark.
 */
export function assessmentShares(
  categories: readonly Pick<GradeCategory, "id" | "weight">[],
  assessments: readonly { id: string; categoryId: string; excused: boolean }[],
): Map<string, number> {
  const count = new Map<string, number>();
  for (const a of assessments) if (!a.excused) count.set(a.categoryId, (count.get(a.categoryId) ?? 0) + 1);
  const weight = new Map(categories.map((c) => [c.id, c.weight]));
  const shares = new Map<string, number>();
  for (const a of assessments) {
    const w = weight.get(a.categoryId);
    if (w === undefined || a.excused) continue;
    shares.set(a.id, w / Math.max(1, count.get(a.categoryId) ?? 1));
  }
  return shares;
}

export function gradeHistory(categories: readonly GradeCategory[], assessments: readonly HistoryAssessment[]): HistoryPoint[] {
  const scored = assessments.filter(counts);
  const undated = scored.filter((a) => assessmentDate(a) === null);
  const dated = scored
    .map((a) => ({ a, date: assessmentDate(a) }))
    .filter((x): x is { a: HistoryAssessment; date: string } => x.date !== null);
  const dates = [...new Set(dated.map((x) => x.date))].sort();
  const points: HistoryPoint[] = [];
  for (const date of dates) {
    const upTo = dated.filter((x) => x.date <= date).map((x) => x.a);
    const { grade } = computeCourseGrade(categories, [...upTo, ...undated]);
    if (grade === null) continue;
    points.push({ date, grade, assessmentIds: dated.filter((x) => x.date === date).map((x) => x.a.id) });
  }
  return points;
}
