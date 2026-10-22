import { z } from "zod";
import { isUnseenDrift } from "../domain/schedule/drift-notice";
import { planImport, type ImportPlan, type StudentInput } from "../domain/schedule/import-plan";
import { monthlyReview, renderSummary } from "../domain/schedule/summary";
import type { StaffRecord } from "../notion/staff";
import type { StudentRecord } from "../notion/students";
import { requireScheduler, type Allowed, type Denial } from "./guard";
import { importRequestId } from "./request-id";
import type { ScheduleDeps } from "./schedule-handlers";
import { DriftSeenResponse, ImportPlanOut, ImportPreviewResponse, ImportRunResponse, MonthlyReviewResponse, SyncSummariesResponse } from "./schemas";
import { syncStudentSummary, type StudentsPort } from "./summary-sync";
import { deliverSummaries, type SummaryOutcome } from "./outbox-wiring";
import { summaryKey } from "./outbox-store";

/**
 * Admin-only endpoints for the Weekly Schedule import (REQ-4): preview and run
 * the import, retry the Notion write-back, mark replaced Notion edits as seen
 * (REQ-34), and the monthly review list. The
 * handlers hold no Notion or Supabase code: both arrive through ScheduleDeps.
 */
const HEADERS = { "Cache-Control": "no-store" };
const send = (status: number, body: unknown) => Response.json(body, { status, headers: HEADERS });
const deny = (d: Denial) => send(d.status, d.body);
const unavailable = () => send(503, { error: "scheduler_unavailable" });

async function gate(deps: ScheduleDeps): Promise<Allowed | Response> {
  const g = requireScheduler(await deps.identity(), ["admin"]);
  if (!g.ok) return deny(g);
  return deps.students ? g : unavailable();
}
const isResponse = (x: Allowed | Response): x is Response => x instanceof Response;
const studentsOf = (deps: ScheduleDeps): StudentsPort => deps.students!;

async function load(deps: ScheduleDeps): Promise<{ students: StudentRecord[]; staff: StaffRecord[] } | null> {
  try {
    const [students, staff] = await Promise.all([studentsOf(deps).list(), deps.fetchStaff()]);
    return { students, staff };
  } catch {
    return null;
  }
}

function planFor(deps: ScheduleDeps, students: StudentInput[], staff: StaffRecord[], adopted: Set<string>): ImportPlan {
  return planImport({ students, staff, today: deps.today(), adoptedStudentIds: adopted });
}
const planBody = (plan: ImportPlan) => ImportPlanOut.parse({
  ready: plan.adopt.map((a) => ({ studentId: a.studentId, name: a.name, lineCount: a.series.length })),
  repair: plan.repair,
  skipped: plan.skipped.map((s) => ({ studentId: s.studentId })),
});

/** GET: the dry-run plan, plus every adopted student with the state of their write-back. */
async function handleImportPreviewInner(deps: ScheduleDeps): Promise<Response> {
  const g = await gate(deps);
  if (isResponse(g)) return g;
  const data = await load(deps);
  if (!data) return unavailable();
  const summaries = await deps.store.listSummaries();
  const plan = planFor(deps, data.students, data.staff, new Set(summaries.map((s) => s.studentId)));
  const names = new Map(data.students.map((s) => [s.id, s.name]));
  return send(200, ImportPreviewResponse.parse({
    plan: planBody(plan),
    adopted: summaries.map((s) => ({
      studentId: s.studentId, name: names.get(s.studentId) ?? null, adoptedAt: s.adoptedAt, syncState: s.syncState,
      lastError: s.lastError, lastWrittenAt: s.lastWrittenAt, lastDriftText: s.lastDriftText,
      lastDriftAt: s.lastDriftAt, driftSeen: !isUnseenDrift(s),
    })),
  }));
}

const RunBody = z.strictObject({ dryRun: z.boolean().default(false) });

/** POST: plan, then adopt each clean student (one transaction each) and write their summary. */
async function handleImportRunInner(deps: ScheduleDeps, body: unknown): Promise<Response> {
  const g = await gate(deps);
  if (isResponse(g)) return g;
  const parsed = RunBody.safeParse(body ?? {});
  if (!parsed.success) return send(400, { error: "invalid_request" });
  const data = await load(deps);
  if (!data) return unavailable();
  const summaries = await deps.store.listSummaries();
  const plan = planFor(deps, data.students, data.staff, new Set(summaries.map((s) => s.studentId)));
  const results: { studentId: string; name: string; status: "adopted" | "failed"; summarySync: SummaryOutcome }[] = [];
  if (!parsed.data.dryRun) {
    const orgId = (g as Allowed).identity.orgId;
    for (const a of plan.adopt) {
      const r = await deps.store.adoptStudent({
        studentId: a.studentId,
        sourceText: a.sourceText,
        series: a.series.map((s) => ({
          requestId: importRequestId(orgId, s.requestSeed), staffId: s.staffId, studentId: a.studentId, subject: s.subject, kind: "weekly" as const,
          startDate: s.startDate, startTime: s.startTime, durationMinutes: s.durationMinutes, effectiveUntil: null,
        })),
      });
      if (!r.ok) {
        results.push({ studentId: a.studentId, name: a.name, status: "failed", summarySync: "skipped" });
        continue;
      }
      // With the outbox, adoption enqueued the summary (0021) and it is delivered below.
      const summarySync = deps.outbox ? "queued" : await syncStudentSummary(deps as Required<Pick<ScheduleDeps, "students">> & ScheduleDeps, a.studentId);
      results.push({ studentId: a.studentId, name: a.name, status: "adopted", summarySync });
    }
    const outbox = deps.outbox;
    const adopted = results.filter((r) => r.status === "adopted").map((r) => r.studentId);
    if (outbox && adopted.length > 0) {
      const rows = await outbox.findPending(adopted.map(summaryKey));
      const outcome = await deliverSummaries({ ...deps, outbox }, rows.map((r) => r.id));
      for (const r of results) if (r.status === "adopted") r.summarySync = outcome.get(r.studentId) ?? "queued";
    }
  }
  return send(200, ImportRunResponse.parse({ dryRun: parsed.data.dryRun, plan: planBody(plan), results }));
}

// requestId: the week editor's API client always sends one (REQ-28). The sync is idempotent, so it is ignored.
const SyncBody = z.strictObject({ studentId: z.guid().optional(), requestId: z.guid().optional() });

/** POST: retry the Notion write-back for one adopted student, or all of them. */
async function handleSyncSummariesInner(deps: ScheduleDeps, body: unknown): Promise<Response> {
  const g = await gate(deps);
  if (isResponse(g)) return g;
  const parsed = SyncBody.safeParse(body ?? {});
  if (!parsed.success) return send(400, { error: "invalid_request" });
  const ids = parsed.data.studentId
    ? [parsed.data.studentId]
    : (await deps.store.listSummaries()).map((s) => s.studentId);
  if (parsed.data.studentId && !(await deps.store.getSummary(parsed.data.studentId))) return send(404, { error: "not_found" });
  const outbox = deps.outbox;
  if (outbox) {
    // REQ-35: "Sync all" goes through the outbox, so a failure is retried and shown like any other export.
    const outcome = await deliverSummaries({ ...deps, outbox }, await outbox.enqueueSummaries(ids));
    return send(200, SyncSummariesResponse.parse({ results: ids.map((studentId) => ({ studentId, summarySync: outcome.get(studentId) ?? "queued" })) }));
  }
  const results: { studentId: string; summarySync: SummaryOutcome }[] = [];
  for (const studentId of ids) results.push({ studentId, summarySync: await syncStudentSummary(deps as ScheduleDeps & { students: StudentsPort }, studentId) });
  return send(200, SyncSummariesResponse.parse({ results }));
}

const DriftSeenBody = z.strictObject({
  items: z.array(z.strictObject({ studentId: z.guid(), lastDriftAt: z.string().max(40).nullable() })).min(1).max(200),
});

/**
 * POST: mark replaced Notion edits as seen (REQ-34 AC10). Each item carries the
 * drift time the page showed; a row whose drift moved since is left unseen.
 * An id that is not adopted matches no row and is ignored.
 */
async function handleDriftSeenInner(deps: ScheduleDeps, body: unknown): Promise<Response> {
  const g = requireScheduler(await deps.identity(), ["admin"]);
  if (!g.ok) return deny(g);
  const parsed = DriftSeenBody.safeParse(body);
  if (!parsed.success) return send(400, { error: "invalid_request" });
  const ids = parsed.data.items.map((i) => i.studentId);
  if (new Set(ids).size !== ids.length) return send(400, { error: "invalid_request" });
  const updated = await deps.store.markDriftSeen(parsed.data.items);
  return send(200, DriftSeenResponse.parse({ updated }));
}

const Month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

/** GET ?month=YYYY-MM: what Charlie should check before the monthly run. */
async function handleMonthlyReviewInner(deps: ScheduleDeps, q: URLSearchParams): Promise<Response> {
  const g = await gate(deps);
  if (isResponse(g)) return g;
  const month = Month.safeParse(q.get("month"));
  if (!month.success) return send(400, { error: "invalid_request" });
  let staff: StaffRecord[];
  try {
    staff = await deps.fetchStaff();
  } catch {
    return unavailable();
  }
  let names = new Map<string, string>();
  try {
    names = new Map((await studentsOf(deps).list()).map((s) => [s.id, s.name]));
  } catch {
    // Names are a convenience: the review still works without them.
  }
  const staffNames = new Map(staff.map((s) => [s.id, s.name]));
  const summaries = await deps.store.listSummaries();
  const perStudent = await Promise.all(summaries.map(async (s) => ({ s, ...(await deps.store.listSeriesForStudent(s.studentId)) })));
  const inputs = perStudent.map(({ s, series }) => {
    let freshText: string;
    try {
      freshText = renderSummary(series, staffNames, deps.today());
    } catch {
      freshText = "\u0000unrenderable";
    }
    return { studentId: s.studentId, syncState: s.syncState, lastWrittenText: s.lastWrittenText, freshText, adoptedOn: s.adoptedAt.slice(0, 10) };
  });
  const review = monthlyReview({
    month: month.data,
    series: perStudent.flatMap((p) => p.series),
    exceptions: perStudent.flatMap((p) => p.exceptions),
    summaries: inputs,
  });
  return send(200, MonthlyReviewResponse.parse({ month: month.data, students: review.map((r) => ({ ...r, name: names.get(r.studentId) ?? null })) }));
}

// A store read that fails throws (lib/data/schedule.ts); that is a 503, never an empty answer.
async function guarded(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch {
    return unavailable();
  }
}
export const handleImportPreview = (...args: Parameters<typeof handleImportPreviewInner>) => guarded(() => handleImportPreviewInner(...args));
export const handleImportRun = (...args: Parameters<typeof handleImportRunInner>) => guarded(() => handleImportRunInner(...args));
export const handleSyncSummaries = (...args: Parameters<typeof handleSyncSummariesInner>) => guarded(() => handleSyncSummariesInner(...args));
export const handleDriftSeen = (...args: Parameters<typeof handleDriftSeenInner>) => guarded(() => handleDriftSeenInner(...args));
export const handleMonthlyReview = (...args: Parameters<typeof handleMonthlyReviewInner>) => guarded(() => handleMonthlyReviewInner(...args));
