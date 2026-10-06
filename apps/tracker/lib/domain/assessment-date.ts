/**
 * When an assessment happens (ADR 0030). An assignment has a due date and a
 * test has the day it is held; a row never carries both. This is the only
 * place the two columns are merged. `graded_at` is the entry stamp, kept for
 * internal use, and is never read for anything a student sees.
 */
export type AssessmentKind = "assignment" | "test";

export type DatedInput = { dueDate: string | null; heldOn?: string | null };

/** The ISO date (YYYY-MM-DD) the work is due or the test is held, or null when undated. */
export function assessmentDate(a: DatedInput): string | null {
  return a.heldOn ?? a.dueDate;
}
