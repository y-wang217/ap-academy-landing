/**
 * Derived assessment display state (ADR 0008). Never stored. "today" is an
 * ISO date (YYYY-MM-DD) in the student's time zone, supplied by the caller.
 */
export type AssessmentState = "upcoming" | "done" | "awaiting_result" | "graded" | "excused";

export type StateInput = {
  dueDate: string | null;
  studentDoneAt: string | null;
  scoreEarned: number | null;
  excused: boolean;
};

export function assessmentState(a: StateInput, today: string): AssessmentState {
  if (a.excused) return "excused";
  if (a.scoreEarned !== null) return "graded";
  if (a.dueDate !== null && a.dueDate < today) return "awaiting_result";
  if (a.studentDoneAt !== null) return "done";
  return "upcoming";
}

export const STATE_LABEL: Record<AssessmentState, string> = {
  upcoming: "Upcoming",
  done: "Done",
  awaiting_result: "Awaiting result",
  graded: "Graded",
  excused: "Excused",
};
