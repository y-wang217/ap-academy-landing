import { z } from "zod";
import type { IrisSettings, PollResult, RetryableMessage, StoredThread } from "./store";

/** Zod for every Iris row read and every Iris response (ADR 0017). */
const Result = z.enum(["ok", "busy", "failed", "paused"]);
const ts = z.string().min(1);

export const SettingsRow = z.object({
  id: z.guid(), org_id: z.guid(), paused: z.boolean(), retention_days: z.number().int(),
  last_poll_at: ts.nullable(), last_poll_result: Result.nullable(), last_error: z.string().nullable(),
}).transform((r): IrisSettings => ({
  id: r.id, orgId: r.org_id, paused: r.paused, retentionDays: r.retention_days,
  lastPollAt: r.last_poll_at, lastPollResult: r.last_poll_result as PollResult | null, lastError: r.last_error,
}));

export const ThreadRow = z.object({
  id: z.guid(), gmail_thread_id: z.string(), first_received_at: ts.nullable(), last_inbound_at: ts.nullable(), purge_at: ts,
}).transform((r): StoredThread => ({
  id: r.id, gmailThreadId: r.gmail_thread_id, firstReceivedAt: r.first_received_at, lastInboundAt: r.last_inbound_at, purgeAt: r.purge_at,
}));

export const RetryRow = z.object({
  id: z.guid(), gmail_message_id: z.string(), thread_id: z.guid(), retry_count: z.number().int(), last_error: z.string().nullable(),
}).transform((r): RetryableMessage => ({ id: r.id, gmailMessageId: r.gmail_message_id, threadId: r.thread_id, retryCount: r.retry_count, lastError: r.last_error }));

export const PurgeCounts = z.record(z.string(), z.number());

/** What the owner sees: settings without the lease. */
export type OwnerSettings = { paused: boolean; mailbox: string | null; lastPollAt: string | null; lastPollResult: PollResult | null; lastError: string | null };
export const OwnerSettingsRow = z.object({
  paused: z.boolean(), mailbox: z.string().nullable(), last_poll_at: ts.nullable(), last_poll_result: Result.nullable(), last_error: z.string().nullable(),
}).transform((r): OwnerSettings => ({ paused: r.paused, mailbox: r.mailbox, lastPollAt: r.last_poll_at, lastPollResult: r.last_poll_result, lastError: r.last_error }));

export type RunSummary = { startedAt: string; result: PollResult; stored: number; matched: number; escalated: number; failed: number; error: string | null };
export const RunRow = z.object({
  started_at: ts, result: Result, stored: z.number().int(), matched: z.number().int(), escalated: z.number().int(), failed: z.number().int(), error: z.string().nullable(),
}).transform((r): RunSummary => ({ startedAt: r.started_at, result: r.result, stored: r.stored, matched: r.matched, escalated: r.escalated, failed: r.failed, error: r.error }));

export type InboxMessage = {
  id: string;
  gmailThreadId: string;
  fromEmail: string;
  subject: string | null;
  snippet: string | null;
  receivedAt: string;
  state: "received" | "matched" | "escalated" | "failed";
  escalationReason: string | null;
  notionStudentIds: string[];
};
export const InboxMessageRow = z.object({
  id: z.guid(), thread_id: z.guid(), from_email: z.string(), snippet: z.string().nullable(), received_at: ts,
  state: z.enum(["received", "matched", "escalated", "failed"]), escalation_reason: z.string().nullable(),
});
export const InboxThreadRow = z.object({ id: z.guid(), gmail_thread_id: z.string(), subject: z.string().nullable(), notion_student_ids: z.array(z.guid()) });

/** The run's answer. No error text: that goes to settings.last_error and runs.error only. */
const count = z.number().int().nonnegative();
export const IrisRunResponse = z.strictObject({
  result: Result,
  runId: z.string().min(1).nullable().optional(),
  seen: count.optional(),
  stored: count.optional(),
  matched: count.optional(),
  escalated: count.optional(),
  skipped: count.optional(),
  failed: count.optional(),
  purged: count.optional(),
});
export type IrisRunResponse = z.infer<typeof IrisRunResponse>;
