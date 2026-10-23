import { z } from "zod";

/**
 * The Founder Console's panel contract (REQ-54, tracker ADR 0065, spec
 * docs/spec/founder-console/02-data-contracts.md section 2). Pure: Zod and
 * types only. Every panel read returns a PanelResult, so "unknown" always has
 * a status and is never shown as zero or an empty list.
 */
export const PANEL_STATUSES = ["ready", "empty", "loading", "stale", "error", "unverifiable"] as const;
export type PanelStatus = (typeof PANEL_STATUSES)[number];

export const NOTION_PANELS = ["leads", "touches", "trialLessons", "work", "invoices"] as const;
export type NotionPanel = (typeof NOTION_PANELS)[number];
export type PanelId = NotionPanel | "people";

export type SourceEvidence = { source: "notion" | "supabase"; sourceId: string; sourceUrl: string | null; observedAt: string };

export type PanelResult<T> = {
  panel: PanelId;
  status: PanelStatus;
  data: T | null;
  count: number | null;
  lastCheckedAt: string;
  lastSuccessfulFetchAt: string | null;
  staleReason: string | null;
  errorMessage: string | null;
  sourceEvidence: SourceEvidence[];
};

/** How a read stopped at the page cap begins its stale reason (REQ-57 reads it to tell truncation apart). */
export const PAGE_CAP_PREFIX = "Stopped after ";

/** A Notion page or data source link, which opens only for a Notion member. */
export const notionPageUrl = (id: string) => `https://www.notion.so/${id.replaceAll("-", "")}`;

// What each reader returns, before names are joined. Notion ids as Notion sends them.
export type LeadSource = {
  id: string; createdAt: string | null; name: string; stage: string | null; ownerStaffId: string | null; nextAction: string | null;
  nextActionDue: string | null; attempts: number | null; lastContact: string | null; source: string | null; lostReason: string | null;
  contactedAt: string | null; trialBookedAt: string | null; trialAttendedAt: string | null; closedAt: string | null; trialTime: string | null;
  trialTeacherId: string | null; level: string | null; hasMajorGaps: boolean; recommendedPlan: string | null; hasTrialSummary: boolean;
  parentName: string | null;
  /** REQ-57: Lead ID trimmed and lowercased, empty to null. Server-side only: the dedupe key. */
  leadId: string | null; grade: string | null; subjects: string[]; majorGaps: string | null; trialSummary: string | null;
};
export type TouchSource = { id: string; when: string | null; type: string | null; outcome: string | null; studentId: string | null; staffId: string | null; note: string };
export type TrialLessonSource = {
  id: string; date: string | null; studentId: string | null; teacherId: string | null; durationHours: number | null; hasTopic: boolean;
  hasDiagnosis: boolean; preferredDays: string[]; diagnosis: string | null;
};
export type TaskTypeRef = { id: string; name: string | null };
export type WorkSource = {
  id: string; name: string; area: string | null; state: string | null; type: string | null; dueReview: string | null; owner: string | null;
  taskTypes: TaskTypeRef[]; parentProjectIds: string[]; expectedResult: string | null;
};
export type InvoiceSource = {
  id: string; status: string | null; paidOn: string | null; amount: number | null; creditApplied: number | null; issued: string | null;
  due: string | null; month: string | null; studentIds: string[];
};
/** One reader's answer: `complete` is false when it stopped at the page cap with more rows left. */
export type ReadResult<T> = { rows: T[]; complete: boolean; skipped: number; pages: number };

// Row schemas leave the server. Plain z.object (Zod's default strip mode, never .strict() or
// .passthrough()): parsing drops any key not listed here and keeps the row (Decision 16).
const str = z.string().nullable();
const num = z.number().nullable();
const longText = z.string().max(1000).nullable();

export const LeadRow = z.object({
  id: z.string(), pageUrl: z.string(), createdAt: str, name: z.string(), stage: str, ownerStaffId: str, ownerName: str, nextAction: str,
  nextActionDue: str, nextActionDueDate: str, attempts: num, lastContact: str, source: str, lostReason: str, contactedAt: str,
  trialBookedAt: str, trialAttendedAt: str, closedAt: str, trialTime: str, trialTimeDate: str, trialTeacherId: str, trialTeacherName: str,
  level: str, hasMajorGaps: z.boolean(), recommendedPlan: str, hasTrialSummary: z.boolean(), parentName: str, inPeopleCopy: z.boolean(),
  // REQ-57: dedupeKey stays in server-side panels; the sales view schema has no such key.
  dedupeKey: str, grade: str, subjects: z.array(z.string()), majorGaps: longText, trialSummary: longText,
});
export const TouchRow = z.object({
  id: z.string(), pageUrl: z.string(), when: str, whenDate: str, type: str, outcome: str, studentId: str, staffId: str, staffName: str,
  note: z.string().max(280),
});
export const TouchGroup = z.object({ studentId: z.string(), studentName: str, touches: z.array(TouchRow) });
export const TrialLessonRow = z.object({
  id: z.string(), pageUrl: z.string(), date: str, studentId: str, studentName: str, teacherId: str, teacherName: str, durationHours: num,
  hasTopic: z.boolean(), hasDiagnosis: z.boolean(), preferredDays: z.array(z.string()), diagnosis: longText,
});
export const WorkRow = z.object({
  id: z.string(), pageUrl: z.string(), name: z.string(), area: str, state: str, type: str, dueReview: str, dueReviewDate: str, owner: str,
  taskTypes: z.array(z.object({ id: z.string(), name: str })), parentProjectIds: z.array(z.string()), expectedResult: z.string().max(500).nullable(),
});
export const InvoiceRow = z.object({
  id: z.string(), pageUrl: z.string(), status: str, paidOn: str, amount: num, creditApplied: num, issued: str, due: str, month: str,
  studentIds: z.array(z.string()), studentName: str,
});
export const PeopleData = z.object({ syncedAt: str, students: z.number(), staff: z.number() });

export type LeadRow = z.infer<typeof LeadRow>;
export type TouchRow = z.infer<typeof TouchRow>;
export type TouchGroup = z.infer<typeof TouchGroup>;
export type TrialLessonRow = z.infer<typeof TrialLessonRow>;
export type WorkRow = z.infer<typeof WorkRow>;
export type InvoiceRow = z.infer<typeof InvoiceRow>;
export type PeopleData = z.infer<typeof PeopleData>;

export type ConsolePanels = {
  leads: PanelResult<LeadRow[]>;
  touches: PanelResult<TouchGroup[]>;
  trialLessons: PanelResult<TrialLessonRow[]>;
  work: PanelResult<WorkRow[]>;
  invoices: PanelResult<InvoiceRow[]>;
  people: PanelResult<PeopleData>;
};

/** What the health route says about one provider (AC9): status and times, never rows or counts. */
export const HEALTH_PROVIDER_KEYS = ["status", "lastCheckedAt", "lastSuccessfulFetchAt", "staleReason", "errorMessage"] as const;
export type HealthProvider = Pick<PanelResult<unknown>, (typeof HEALTH_PROVIDER_KEYS)[number]>;

export function healthOf(r: PanelResult<unknown>): HealthProvider {
  return { status: r.status, lastCheckedAt: r.lastCheckedAt, lastSuccessfulFetchAt: r.lastSuccessfulFetchAt, staleReason: r.staleReason, errorMessage: r.errorMessage };
}
