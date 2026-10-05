/**
 * Rule-based priority suggestions (ADR 0024). Pure: the same rows always give
 * the same suggestions. Returns facts, not sentences; lib/view words them.
 * Suggestions go to the teacher, who adds the ones that make sense as tasks.
 */
import type { AssessmentState } from "./assessment-state";
import { TUNING } from "./tuning";

export type SuggestionCourse = {
  id: string;
  code: string;
  status: "planned" | "active" | "completed";
  grade: number | null;
  targetGrade: number | null;
  categories: readonly { name: string; percent: number | null }[];
};

export type SuggestionAssessment = {
  id: string;
  courseId: string;
  title: string;
  dueDate: string | null;
  state: AssessmentState;
};

type Base = { key: string; courseId: string; title: string; gap: number };
export type Suggestion =
  | (Base & { kind: "prepare"; assessmentTitle: string; daysUntil: number })
  | (Base & { kind: "review"; categoryName: string; categoryPercent: number });

/** Whole days from one ISO date (YYYY-MM-DD) to another. */
export function daysBetween(from: string, to: string): number {
  const utc = (iso: string) => {
    const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(to) - utc(from)) / 86_400_000);
}

export function suggestPriorities(
  courses: readonly SuggestionCourse[],
  assessments: readonly SuggestionAssessment[],
  today: string,
  openKeys: ReadonlySet<string>,
  limit: number = TUNING.suggestionsLimit,
): Suggestion[] {
  const prepare: Extract<Suggestion, { kind: "prepare" }>[] = [];
  const review: Extract<Suggestion, { kind: "review" }>[] = [];

  for (const course of courses) {
    if (course.status !== "active" || course.grade === null || course.targetGrade === null) continue;
    const gap = course.targetGrade - course.grade;
    if (gap < TUNING.suggestGapPoints) continue;

    const soon = assessments
      .filter((a) => a.courseId === course.id && a.state === "upcoming" && a.dueDate !== null)
      .map((a) => ({ a, days: daysBetween(today, a.dueDate as string) }))
      .filter(({ days }) => days >= 0 && days <= TUNING.suggestSoonDays);

    if (soon.length > 0) {
      for (const { a, days } of soon) {
        prepare.push({
          key: `prepare:${a.id}`, courseId: course.id, kind: "prepare", title: `Prepare for ${a.title}`,
          gap, assessmentTitle: a.title, daysUntil: days,
        });
      }
      continue;
    }

    const lowest = course.categories
      .filter((c): c is { name: string; percent: number } => c.percent !== null)
      .reduce<{ name: string; percent: number } | null>((low, c) => (low === null || c.percent < low.percent ? c : low), null);
    if (!lowest) continue;
    review.push({
      key: `review:${course.id}`, courseId: course.id, kind: "review", title: `Review ${lowest.name} in ${course.code}`,
      gap, categoryName: lowest.name, categoryPercent: lowest.percent,
    });
  }

  prepare.sort((x, y) => x.daysUntil - y.daysUntil || y.gap - x.gap || x.key.localeCompare(y.key));
  review.sort((x, y) => y.gap - x.gap || x.key.localeCompare(y.key));
  return [...prepare, ...review].filter((s) => !openKeys.has(s.key)).slice(0, limit);
}
