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
