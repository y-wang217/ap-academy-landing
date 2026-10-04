/** Every tunable number in the tracker's domain logic (ADR 0022). */
export const TUNING = {
  /** Category weights in one syllabus version must sum to 100, within this. */
  weightSumTolerance: 0.001,
  /** Warn when course targets average further than this from the six-course target. */
  targetsTolerance: 0.5,
  /** Courses in the admission average. */
  sixCourseCount: 6,
  /** Upcoming work shown on the student dashboard. */
  upcomingLimit: 5,
  /** Priorities shown on the student dashboard. */
  prioritiesLimit: 5,
} as const;
