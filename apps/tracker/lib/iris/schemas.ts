import { z } from "zod";
import type { ClassifiableMessage, IrisSettings, MessageState, PollResult, RetryableMessage, StoredThread, ThreadHistoryRow } from "./store";

/** Zod for every Iris row read and every Iris response (ADR 0017). */
const Result = z.enum(["ok", "busy", "failed", "paused"]);
const ts = z.string().min(1);
/** numeric columns: PostgREST sends a JSON number, but a string is accepted too. */
const numeric = z.union([z.number(), z.string()]).transform(Number).pipe(z.number().finite());
const States = z.enum(["received", "matched", "classified", "escalated", "failed"]);

export const SettingsRow = z.object({
  id: z.guid(), org_id: z.guid(), paused: z.boolean(), retention_days: z.number().int(), confidence_threshold: numeric,
  last_poll_at: ts.nullable(), last_poll_result: Result.nullable(), last_error: z.string().nullable(),
}).transform((r): IrisSettings => ({
  id: r.id, orgId: r.org_id, paused: r.paused, retentionDays: r.retention_days, confidenceThreshold: r.confidence_threshold,
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

export const ClassifiableRow = z.object({
  id: z.guid(), thread_id: z.guid(), received_at: ts, body_text: z.string().nullable(), retry_count: z.number().int(),
}).transform((r): ClassifiableMessage => ({ id: r.id, threadId: r.thread_id, receivedAt: r.received_at, bodyText: r.body_text, retryCount: r.retry_count }));

export const HistoryRow = z.object({
  received_at: ts, direction: z.enum(["inbound", "outbound"]), intent: z.string().nullable(), snippet: z.string().nullable(),
}).transform((r): ThreadHistoryRow => ({ receivedAt: r.received_at, direction: r.direction, intent: r.intent, snippet: r.snippet }));

export const PurgeCounts = z.record(z.string(), z.number());

/** What the owner sees: settings without the lease. */
export type OwnerSettings = { paused: boolean; mailbox: string | null; lastPollAt: string | null; lastPollResult: PollResult | null; lastError: string | null; confidenceThreshold: number };
export const OwnerSettingsRow = z.object({
  paused: z.boolean(), mailbox: z.string().nullable(), last_poll_at: ts.nullable(), last_poll_result: Result.nullable(), last_error: z.string().nullable(), confidence_threshold: numeric,
}).transform((r): OwnerSettings => ({ paused: r.paused, mailbox: r.mailbox, lastPollAt: r.last_poll_at, lastPollResult: r.last_poll_result, lastError: r.last_error, confidenceThreshold: r.confidence_threshold }));

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
  state: MessageState;
  escalationReason: string | null;
  intent: string | null;
  flags: string[];
  notionStudentIds: string[];
};
export const InboxMessageRow = z.object({
  id: z.guid(), thread_id: z.guid(), from_email: z.string(), snippet: z.string().nullable(), received_at: ts,
  state: States, escalation_reason: z.string().nullable(), intent: z.string().nullable(), flags: z.array(z.string()),
});
export const InboxThreadRow = z.object({ id: z.guid(), gmail_thread_id: z.string(), subject: z.string().nullable(), notion_student_ids: z.array(z.guid()) });

/** One message for its page (REQ-43 AC14). */
export type MessageDetail = {
  id: string;
  gmailThreadId: string;
  fromEmail: string;
  fromName: string | null;
  subject: string | null;
  receivedAt: string;
  bodyText: string | null;
  state: MessageState;
  intent: string | null;
  confidence: number | null;
  flags: string[];
  escalationReason: string | null;
  policyVersion: number | null;
  handledAt: string | null;
  notionStudentIds: string[];
};
export const MessageDetailRow = z.object({
  id: z.guid(), from_email: z.string(), from_name: z.string().nullable(), received_at: ts, body_text: z.string().nullable(), state: States,
  intent: z.string().nullable(), confidence: numeric.nullable(), flags: z.array(z.string()), escalation_reason: z.string().nullable(),
  policy_version: z.number().int().nullable(), handled_at: ts.nullable(),
  thread: z.object({ gmail_thread_id: z.string(), subject: z.string().nullable(), notion_student_ids: z.array(z.guid()) }),
}).transform((r): MessageDetail => ({
  id: r.id, gmailThreadId: r.thread.gmail_thread_id, fromEmail: r.from_email, fromName: r.from_name, subject: r.thread.subject, receivedAt: r.received_at,
  bodyText: r.body_text, state: r.state, intent: r.intent, confidence: r.confidence, flags: r.flags, escalationReason: r.escalation_reason,
  policyVersion: r.policy_version, handledAt: r.handled_at, notionStudentIds: r.thread.notion_student_ids,
}));

/** The run's answer. No error text: that goes to settings.last_error and runs.error only. */
const count = z.number().int().nonnegative();
export const IrisRunResponse = z.strictObject({
  result: Result,
  runId: z.string().min(1).nullable().optional(),
  seen: count.optional(),
  stored: count.optional(),
  matched: count.optional(),
  classified: count.optional(),
  escalated: count.optional(),
  skipped: count.optional(),
  failed: count.optional(),
  purged: count.optional(),
});
export type IrisRunResponse = z.infer<typeof IrisRunResponse>;
