import { z } from "zod";
import type { ApiResult } from "../scheduler/api-client";
import { DailyTaskOutcome, SummarySync } from "../scheduler/schemas";

/**
 * What the week editor says after a class save (REQ-28). The save and each
 * Notion export are separate results: "Saved." alone only when no export
 * failed or was skipped. Pure and client safe; the week editor renders it.
 */
export type SummaryResult = z.infer<typeof SummarySync> | undefined;
export type DailyResult = z.infer<typeof DailyTaskOutcome> | undefined;
export type SaveOutcome = {
  summarySync: SummaryResult;
  dailyTask: DailyResult;
  studentId: string | null;
  studentName: string | null;
  unreadable?: true;
  retryFailed?: { summary?: true; dailyTask?: true };
};
export type NoticeLine = { text: string; retry?: "summary" | "dailyTask" };
export type SaveNotice = { tone: "ok" | "warn"; lines: NoticeLine[] };

// Not strict: the rest of SeriesResponse passes through; only these fields are read.
const SavedBody = z.object({
  summarySync: SummarySync.optional(),
  dailyTask: DailyTaskOutcome.optional(),
  series: z.object({ studentId: z.guid() }),
});

export function readSaveOutcome(data: unknown, studentName: string | null): SaveOutcome {
  const parsed = SavedBody.safeParse(data);
  if (!parsed.success) return { summarySync: undefined, dailyTask: undefined, studentId: null, studentName, unreadable: true };
  const { summarySync, dailyTask, series } = parsed.data;
  return { summarySync, dailyTask, studentId: series.studentId, studentName };
}

const RETRY_FAILED = " Retry did not work.";

export function saveNotice(o: SaveOutcome): SaveNotice {
  if (o.unreadable) return { tone: "warn", lines: [{ text: "Saved. The Notion results could not be read." }] };
  const lines: NoticeLine[] = [{ text: "Saved." }];
  const prefix = `Weekly Schedule for ${o.studentName ?? "this student"}:`;
  if (o.summarySync === "synced") lines.push({ text: `${prefix} Synced.` });
  if (o.summarySync === "failed") lines.push({ text: `${prefix} Failed. The Notion save failed.${o.retryFailed?.summary ? RETRY_FAILED : ""}`, retry: "summary" });
  if (o.summarySync === "skipped") lines.push({ text: `${prefix} Not updated. Import this student on the Schedules page first.` });
  if (o.dailyTask === "updated") lines.push({ text: "Today's Notion task updated." });
  if (o.dailyTask === "failed") lines.push({ text: `Today's Notion task could not be updated.${o.retryFailed?.dailyTask ? RETRY_FAILED : ""}`, retry: "dailyTask" });
  const bad = o.summarySync === "failed" || o.summarySync === "skipped" || o.dailyTask === "failed";
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
