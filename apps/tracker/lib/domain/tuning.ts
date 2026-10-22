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
  /** "Needs focus" pill: a course at least this far below its target (ADR 0031). Deliberately equal to suggestGapPoints. */
  focusGapPoints: 2,
  /** "Improving" pill: compare the latest grade with the one this many dated marks earlier. */
  trendWindowMarks: 3,
  /** "Improving" pill: the grade rose at least this much over that window. */
  trendRisePoints: 1,
  /** Story line: an upcoming item within this many days is "soon" (ADR 0032). */
  storySoonDays: 7,
  /** Story line: an item worth at least this share of its course grade is "big". */
  storyBigShare: 10,
  /** Story line: one course is "the biggest gap" when its gap is this many times the next. */
  storyDominantRatio: 2,
  /** Story line: this many results waiting to be entered is worth saying. */
  storyAwaitingMany: 2,
  /** AI drafts per org per day (ADR 0026). */
  aiDailyDraftsPerOrg: 50,
  /** Longest text sent for an AI draft, in characters: a 90-minute transcript fits (ADR 0028). */
  aiMaxTextChars: 150000,
  /** Attachments (photos, PDFs, transcript files) per AI draft. */
  aiMaxFiles: 6,
  /** Largest attachment, in bytes, after the browser has downscaled a photo. */
  aiMaxFileBytes: 8 * 1024 * 1024,
  /** Longest edge of a photo sent to the model, in pixels. The API downscales past this anyway. */
  aiImageMaxEdge: 1568,
  /** People copy (REQ-38): names older than this show "Names last updated ...". */
  peopleStaleMinutes: 120,
  /** Sync now is refused this soon after the last run started, so taps do not hammer Notion. */
  peopleSyncCooldownSeconds: 60,
  /** Iris reads mail this many days back on every poll (REQ-42). */
  irisPollWindowDays: 3,
  /** New messages Iris fetches in one poll, oldest first. */
  irisMaxMessagesPerRun: 50,
  /** Longest message body Iris stores, in characters. */
  irisBodyMaxChars: 20000,
  /** Longest snippet Iris stores. */
  irisSnippetChars: 200,
  /** Polls that may fail to read the family directory before a message is marked failed. */
  irisMaxRetries: 3,
  /** The poll lease: a crashed run frees it after this long. */
  irisPollLeaseSeconds: 300,
  /** Messages Iris classifies in one run, oldest first (REQ-43). */
  irisMaxClassifyPerRun: 10,
  /** No new classify call starts this long after the run started, so the run ends inside its 60 s. */
  irisClassifyBudgetMs: 35_000,
} as const;
