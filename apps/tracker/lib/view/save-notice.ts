import { z } from "zod";
import type { ApiResult } from "../scheduler/api-client";
import { DailyTaskOutcome, ExportRef, ExportRetryResponse, SummarySync } from "../scheduler/schemas";

/**
 * What the week editor says after a class save (REQ-28). The save and each
 * Notion export are separate results: "Saved." alone only when no export
 * failed or was skipped. Pure and client safe; the week editor renders it.
 */
export type SummaryResult = z.infer<typeof SummarySync> | undefined;
export type DailyResult = z.infer<typeof DailyTaskOutcome> | undefined;
export type ExportRefT = z.infer<typeof ExportRef>;
export type SaveOutcome = {
  summarySync: SummaryResult;
  dailyTask: DailyResult;
  studentId: string | null;
  studentName: string | null;
  /** The outbox rows the save delivered or left owed (REQ-35); a Retry resends the row by id. */
  exports?: ExportRefT[];
  unreadable?: true;
  retryFailed?: { summary?: true; dailyTask?: true };
};
export type NoticeLine = { text: string; retry?: "summary" | "dailyTask" };
export type SaveNotice = { tone: "ok" | "warn"; lines: NoticeLine[] };

// Not strict: the rest of SeriesResponse passes through; only these fields are read.
const SavedBody = z.object({
  summarySync: SummarySync.optional(),
  dailyTask: DailyTaskOutcome.optional(),
  exports: z.array(ExportRef).optional(),
  series: z.object({ studentId: z.guid() }),
});

export function readSaveOutcome(data: unknown, studentName: string | null): SaveOutcome {
  const parsed = SavedBody.safeParse(data);
  if (!parsed.success) return { summarySync: undefined, dailyTask: undefined, studentId: null, studentName, unreadable: true };
  const { summarySync, dailyTask, exports, series } = parsed.data;
  return { summarySync, dailyTask, studentId: series.studentId, studentName, ...(exports ? { exports } : {}) };
}

const RETRY_FAILED = " Retry did not work.";

export function saveNotice(o: SaveOutcome): SaveNotice {
  if (o.unreadable) return { tone: "warn", lines: [{ text: "Saved. The Notion results could not be read." }] };
  const lines: NoticeLine[] = [{ text: "Saved." }];
  const prefix = `Weekly Schedule for ${o.studentName ?? "this student"}:`;
  if (o.summarySync === "synced") lines.push({ text: `${prefix} Synced.` });
  if (o.summarySync === "failed") lines.push({ text: `${prefix} Failed. The Notion save failed.${o.retryFailed?.summary ? RETRY_FAILED : ""}`, retry: "summary" });
  if (o.summarySync === "skipped") lines.push({ text: `${prefix} Not updated. Import this student on the Schedules page first.` });
  if (o.summarySync === "queued") lines.push({ text: `${prefix} Queued. It will be sent shortly.` });
  if (o.dailyTask === "updated") lines.push({ text: "Today's Notion task updated." });
  if (o.dailyTask === "failed") lines.push({ text: `Today's Notion task could not be updated.${o.retryFailed?.dailyTask ? RETRY_FAILED : ""}`, retry: "dailyTask" });
  if (o.dailyTask === "queued") lines.push({ text: "Today's Notion task: Queued. It will be updated shortly." });
  if (o.dailyTask === "uncertain") {
    lines.push({ text: `Today's Notion task may have been updated. Check it in Notion, then retry.${o.retryFailed?.dailyTask ? RETRY_FAILED : ""}`, retry: "dailyTask" });
  }
  const bad = o.summarySync === "failed" || o.summarySync === "skipped" || o.dailyTask === "failed" || o.dailyTask === "uncertain";
  return { tone: bad ? "warn" : "ok", lines };
}

const SyncResult = z.object({ results: z.array(z.object({ summarySync: SummarySync })).min(1) });

/** Fold the answer of POST /summaries/sync into the outcome. */
export function afterSummaryRetry(o: SaveOutcome, r: ApiResult<unknown>): SaveOutcome {
  const parsed = r.ok ? SyncResult.safeParse(r.data) : null;
  if (parsed?.success && parsed.data.results[0].summarySync === "synced") {
    return { ...o, summarySync: "synced", retryFailed: { ...o.retryFailed, summary: undefined } };
  }
  return { ...o, summarySync: "failed", retryFailed: { ...o.retryFailed, summary: true } };
}

const DailyRun = z.object({ result: z.enum(["created", "updated", "unchanged", "skipped", "busy", "failed"]) });

/** Fold the answer of POST /daily-task into the outcome. */
export function afterDailyRetry(o: SaveOutcome, r: ApiResult<unknown>): SaveOutcome {
  const parsed = r.ok ? DailyRun.safeParse(r.data) : null;
  const result = parsed?.success ? parsed.data.result : "failed";
  if (result === "created" || result === "updated") return { ...o, dailyTask: "updated", retryFailed: { ...o.retryFailed, dailyTask: undefined } };
  if (result === "unchanged" || result === "skipped") return { ...o, dailyTask: "unchanged", retryFailed: { ...o.retryFailed, dailyTask: undefined } };
  return { ...o, dailyTask: "failed", retryFailed: { ...o.retryFailed, dailyTask: true } };
}

/** The outbox row a Retry resends for this export, when the save reported one (REQ-35). */
export function exportToRetry(o: SaveOutcome, what: "summary" | "dailyTask"): string | null {
  const kind = what === "summary" ? "summary" : "daily_task";
  return o.exports?.find((e) => e.kind === kind && (e.status === "failed" || e.status === "uncertain"))?.id ?? null;
}

/** Fold the answer of POST /exports/retry into the outcome. */
export function afterExportRetry(o: SaveOutcome, what: "summary" | "dailyTask", sentId: string, r: ApiResult<unknown>): SaveOutcome {
  const parsed = r.ok ? ExportRetryResponse.safeParse(r.data) : null;
  const status = parsed?.success ? parsed.data.status : null;
  const kind: ExportRefT["kind"] = what === "summary" ? "summary" : "daily_task";
  // A pending row for the same target may have answered the retried one: track the row that was sent.
  const exports = (o.exports ?? []).map((e): ExportRefT => (e.id === sentId && parsed?.success ? { id: parsed.data.id, kind, status: parsed.data.status } : e));
  const failed = status === null || status === "failed" || status === "uncertain";
  const retryFailed = { ...o.retryFailed, [what]: failed ? true : undefined };
  if (what === "summary") {
    const summarySync = status === "done" ? "synced" : status === "pending" ? "queued" : "failed";
    return { ...o, exports, summarySync, retryFailed };
  }
  const dailyTask = status === "done" ? "updated" : status === "pending" ? "queued" : status === "uncertain" ? "uncertain" : "failed";
  return { ...o, exports, dailyTask, retryFailed };
}
