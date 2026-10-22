import { z } from "zod";
import { normalId } from "../domain/billing";
import { TUNING } from "../domain/tuning";
import { PAGE_CAP_PREFIX, type ConsolePanels, type LeadRow, type PanelResult, type TouchGroup, type TrialLessonRow } from "./contracts";
import type { PanelView } from "./panel-view";
import { rankSalesQueue, type Bucket, type QueueEntry } from "./sales-queue";

/**
 * The Sales queue and radar the owner's page and GET /api/console/sales send
 * (REQ-57, tracker ADR 0071). Built from the facade's panels; the returned
 * view is parsed with SalesViewSchema, so the dedupe key and every other
 * server-only key are dropped before it leaves the server.
 */
const str = z.string().nullable();
const bucket = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]);
export const SALES_FILTERS = ["new", "due", "postTrial", "later"] as const;
export type SalesFilter = (typeof SALES_FILTERS)[number];

const TrialLesson = z.discriminatedUnion("state", [
  z.object({ state: z.literal("found"), pageUrl: z.string(), date: str, diagnosis: str, preferredDays: z.array(z.string()) }),
  z.object({ state: z.literal("none") }),
  z.object({ state: z.literal("unavailable") }),
]);
const LastTouch = z.discriminatedUnion("state", [
  z.object({ state: z.literal("found"), type: str, outcome: str, note: z.string(), when: str, staffName: str, pageUrl: z.string() }),
  z.object({ state: z.literal("none") }),
  z.object({ state: z.literal("unavailable") }),
]);
const SalesLead = z.object({
  id: z.string(), pageUrl: z.string(), name: z.string(), stage: z.string(), bucket, effectiveBucket: bucket, filter: z.enum(SALES_FILTERS),
  priorityReason: z.string(), nextAction: str, nextActionDue: str, attempts: z.number().nullable(),
  ownerName: str, ownerState: z.enum(["named", "unassigned", "unknown"]), grade: str, subjects: z.array(z.string()),
  source: str, createdAt: str, lastContact: str, contactedAt: str, trialBookedAt: str, trialAttendedAt: str, closedAt: str,
  trial: z.object({
    trialTime: str, trialTeacherName: str, level: str, majorGaps: str, recommendedPlan: str, trialSummary: str, lesson: TrialLesson,
  }).nullable(),
  lastTouch: LastTouch,
});
const QueueException = z.object({ id: z.string(), pageUrl: z.string(), name: z.string(), stage: str, reason: z.enum(["No Next Action Due", "No Stage"]) });
const SalesQueue = z.object({ items: z.array(SalesLead), exceptions: z.array(QueueException), mergedDuplicates: z.number(), truncated: z.boolean(), windowDays: z.number() });
const RadarStage = z.object({ key: z.string(), label: z.string(), count: z.number() });
const Evidence = z.object({ source: z.string(), sourceId: z.string(), sourceUrl: str, observedAt: z.string() });
const view = <T extends z.ZodType>(data: T) =>
  z.object({
    panel: z.string(), status: z.enum(["ready", "empty", "loading", "stale", "error", "unverifiable"]), data: data.nullable(), count: z.number().nullable(),
    lastCheckedAt: str, lastSuccessfulFetchAt: str, staleReason: str, errorMessage: str, sourceEvidence: z.array(Evidence),
  });
export const SalesViewSchema = z.object({ queue: view(SalesQueue), radar: view(z.array(RadarStage)) });

export type SalesLead = z.infer<typeof SalesLead>;
type TrialLesson = z.infer<typeof TrialLesson>;
export type SalesQueue = z.infer<typeof SalesQueue>;
export type SalesRadarStage = z.infer<typeof RadarStage>;
export type SalesView = { queue: PanelView<SalesQueue>; radar: PanelView<SalesRadarStage[]> };

export const TRIAL_UNAVAILABLE = "Trial lessons unavailable; post-trial order may be incomplete";
const FILTER_OF: Record<Bucket, SalesFilter> = { 1: "new", 2: "due", 3: "postTrial", 4: "due", 5: "later" };
const RADAR: { key: string; label: string }[] = [
  { key: "new", label: "New" }, { key: "callback", label: "Callback due" }, { key: "postTrial", label: "Post-trial" },
  { key: "followUp", label: "Follow-up due" }, { key: "later", label: "Later" },
];

const capped = (r: PanelResult<unknown>) => r.status === "stale" && (r.staleReason ?? "").startsWith(PAGE_CAP_PREFIX);
/** A read the ranking can trust: not failed and not stopped at the page cap. */
const usable = (r: PanelResult<unknown>) => r.data !== null && r.status !== "error" && !capped(r);

function leadOf(entry: QueueEntry, trials: Map<string, TrialLessonRow> | null, touches: TouchGroup[] | null): SalesLead {
  const l: LeadRow = entry.lead;
  const t = trials && entry.trialLessonId ? trials.get(entry.trialLessonId) : undefined;
  const lesson: TrialLesson = trials === null
    ? { state: "unavailable" }
    : t ? { state: "found", pageUrl: t.pageUrl, date: t.date, diagnosis: t.diagnosis, preferredDays: t.preferredDays } : { state: "none" };
  const hasTrialField = [l.trialTime, l.trialTeacherId, l.level, l.majorGaps, l.recommendedPlan, l.trialSummary].some((v) => v !== null);
  const group = touches?.find((g) => normalId(g.studentId) === normalId(l.id));
  const newest = group ? [...group.touches].sort((a, b) => (b.when ?? "").localeCompare(a.when ?? ""))[0] : undefined;
  return {
    id: l.id, pageUrl: l.pageUrl, name: l.name, stage: l.stage ?? "", bucket: entry.bucket, effectiveBucket: entry.effectiveBucket,
    filter: FILTER_OF[entry.bucket], priorityReason: entry.priorityReason, nextAction: l.nextAction, nextActionDue: l.nextActionDue,
    attempts: l.attempts, ownerName: l.ownerName, ownerState: l.ownerStaffId === null ? "unassigned" : l.ownerName === null ? "unknown" : "named",
    grade: l.grade, subjects: l.subjects, source: l.source, createdAt: l.createdAt, lastContact: l.lastContact, contactedAt: l.contactedAt,
    trialBookedAt: l.trialBookedAt, trialAttendedAt: l.trialAttendedAt, closedAt: l.closedAt,
    trial: hasTrialField || lesson.state !== "none"
      ? { trialTime: l.trialTime, trialTeacherName: l.trialTeacherName, level: l.level, majorGaps: l.majorGaps, recommendedPlan: l.recommendedPlan, trialSummary: l.trialSummary, lesson }
      : null,
    lastTouch: touches === null
      ? { state: "unavailable" }
      : newest
        ? { state: "found", type: newest.type, outcome: newest.outcome, note: newest.note, when: newest.when, staffName: newest.staffName, pageUrl: newest.pageUrl }
        : { state: "none" },
  };
}

export function buildSalesView(panels: ConsolePanels, now: Date): SalesView {
  const windowDays = TUNING.consoleTouchesWindowDays;
  const leads = panels.leads;
  const trialsUsable = usable(panels.trialLessons);
  const trialRows = trialsUsable ? panels.trialLessons.data! : null;
  const touches = panels.touches.status === "error" ? null : panels.touches.data ?? null;
  const evidence = [...leads.sourceEvidence, ...panels.touches.sourceEvidence, ...panels.trialLessons.sourceEvidence];
  const base = { lastCheckedAt: leads.lastCheckedAt, lastSuccessfulFetchAt: leads.lastSuccessfulFetchAt, sourceEvidence: evidence };

  if (leads.status === "error" || leads.data === null) {
    const failed = { ...base, status: "error" as const, data: null, count: null, staleReason: null, errorMessage: leads.errorMessage ?? "Read failed" };
    return SalesViewSchema.parse({ queue: { ...failed, panel: "next" }, radar: { ...failed, panel: "radar" } }) as SalesView;
  }

  const ranked = rankSalesQueue({ leads: leads.data, trialLessons: trialRows, now });
  const trialsById = trialRows === null ? null : new Map(trialRows.map((t) => [t.id, t] as const));
  const items = ranked.items.map((e) => leadOf(e, trialsById, touches));
  const truncated = capped(leads);
  const anyClaim = leads.data.some((l) => l.stage === "Trial Claimed");

  let status: SalesView["queue"]["status"];
  let staleReason: string | null = null;
  if (leads.status === "stale") {
    status = "stale";
    staleReason = leads.staleReason;
  } else if (!trialsUsable && anyClaim) {
    status = "stale";
    staleReason = TRIAL_UNAVAILABLE;
  } else {
    status = items.length === 0 ? "empty" : "ready";
  }

  const counts = [1, 2, 3, 4, 5].map((b) => items.filter((i) => i.bucket === b).length);
  const radarStatus = leads.status === "stale" ? "stale" : items.length === 0 ? "empty" : "ready";
  return SalesViewSchema.parse({
    queue: {
      ...base, panel: "next", status, count: items.length, staleReason, errorMessage: null,
      data: { items, exceptions: ranked.exceptions, mergedDuplicates: ranked.mergedDuplicates, truncated, windowDays },
    },
    radar: {
      ...base, panel: "radar", status: radarStatus, count: items.length, staleReason: radarStatus === "stale" ? leads.staleReason : null, errorMessage: null,
      data: RADAR.map((r, i) => ({ ...r, count: counts[i] })),
    },
  }) as SalesView;
}
