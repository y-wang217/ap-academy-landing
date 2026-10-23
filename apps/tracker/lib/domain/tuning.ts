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
  /** No new classify call starts this long after the run started, so the run ends inside its 120 s (REQ-44). */
  irisClassifyBudgetMs: 35_000,
  /** Draft calls Iris starts in one run, oldest first (REQ-44). */
  irisMaxDraftPerRun: 6,
  /** No new draft call starts this long after the run started. */
  irisDraftBudgetMs: 70_000,
  /** The phone backup starts only before this long after the run started. */
  irisPushBudgetMs: 95_000,
  /** Messages the phone backup writes to Notion in one run. */
  irisMaxPushPerRun: 20,
  /** Tries per message before its phone copy stays failed. */
  irisMaxPushAttempts: 5,
  /** Unedited approvals in a row that make a reply type auto-send eligible. Mirrored as a constant in migration 0025. */
  irisAutoSendStreak: 20,
  /** How far back the eval history import reads (REQ-45). It reads only mail older than irisPollWindowDays. */
  irisHistoryDays: 365,
  /** Gmail messages.get calls the history import makes in one run. */
  irisMaxImportPerRun: 50,
  /** The history import starts only before this long after the run started. */
  irisImportBudgetMs: 100_000,
  /** Labelled messages one run classifies and drafts for an eval request. */
  irisMaxEvalPerRun: 4,
  /** No new eval call starts this long after the run started; each call is aborted then. */
  irisEvalBudgetMs: 105_000,
  /** The auto-send gate (spec decision 21): labelled examples of the type in the latest run. */
  irisGateMinLabelled: 20,
  /** The gate's per-type precision floor. */
  irisGateMinPrecision: 0.95,
  /** The gate's sensitive recall floor, across the whole labelled set. */
  irisGateMinSensitiveRecall: 1,
  /** The gate's mean draft rating floor, per type. */
  irisGateMinMeanRating: 4,
  /** Gmail attempts per send before it is failed and waits for Retry (REQ-48). Each Retry allows this many again. */
  irisSendMaxAttempts: 3,
  /** An attempt holds its send this long; a crash frees it, and the next attempt checks Gmail first. */
  irisSendLeaseSeconds: 60,
  /** Stuck sends one run tries, oldest first. */
  irisMaxSendsPerRun: 3,
  /** No new send starts this long after the run's send step began. */
  irisSendBudgetMs: 30_000,
  /** Founder Console (REQ-54): each provider read is abandoned after this long. */
  consoleProviderTimeoutMs: 8_000,
  /** Notion pages of 100 rows one console panel reads before it reports stale. */
  consoleNotionMaxPages: 10,
  /** Touches kept per student in the console's touch history. */
  consoleTouchesPerStudent: 5,
  /** Touches read back this many days. */
  consoleTouchesWindowDays: 90,
  /** Rows an Operations list (lesson gaps, no-shows, upcoming classes) shows before an "N more" link (REQ-58). */
  consoleOperationsListCap: 25,
  /** Rows a console detail list (trial funnel, cash pulse) shows before an "N more in Notion" link (REQ-59). */
  consoleDetailListCap: 25,
} as const;
