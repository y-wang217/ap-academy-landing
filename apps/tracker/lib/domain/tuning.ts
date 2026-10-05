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
  /** Suggest priorities for a course at least this many points below its target (ADR 0024). */
  suggestGapPoints: 2,
  /** Upcoming work due within this many days counts as "due soon" for a suggestion. */
  suggestSoonDays: 7,
  /** Suggestions shown to the teacher per student. */
  suggestionsLimit: 5,
  /** AI drafts per org per day (ADR 0026). */
  aiDailyDraftsPerOrg: 50,
  /** Longest paste sent for an AI draft, in characters. */
  aiMaxPasteChars: 20000,
} as const;
