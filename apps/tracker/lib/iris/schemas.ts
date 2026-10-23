import { z } from "zod";
import type { SendContext } from "./send";
import type { ClassifiableMessage, DraftableMessage, IrisSettings, MessageState, PollResult, PushDay, PushRecord, RetryableMessage, StoredThread, ThreadHistoryRow } from "./store";

/** Zod for every Iris row read and every Iris response (ADR 0017). */
const Result = z.enum(["ok", "busy", "failed", "paused"]);
const ts = z.string().min(1);
/** numeric columns: PostgREST sends a JSON number, but a string is accepted too. */
const numeric = z.union([z.number(), z.string()]).transform(Number).pipe(z.number().finite());
const States = z.enum(["received", "matched", "classified", "escalated", "drafted", "approved", "sent", "failed"]);

export const SettingsRow = z.object({
  id: z.guid(), org_id: z.guid(), paused: z.boolean(), retention_days: z.number().int(), confidence_threshold: numeric,
  sending_enabled: z.boolean(), quiet_start: z.string().regex(/^\d{2}:\d{2}/), quiet_end: z.string().regex(/^\d{2}:\d{2}/),
  last_poll_at: ts.nullable(), last_poll_result: Result.nullable(), last_error: z.string().nullable(),
}).transform((r): IrisSettings => ({
  id: r.id, orgId: r.org_id, paused: r.paused, retentionDays: r.retention_days, confidenceThreshold: r.confidence_threshold,
  sendingEnabled: r.sending_enabled, quietStart: r.quiet_start.slice(0, 5), quietEnd: r.quiet_end.slice(0, 5),
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

/** REQ-44: rows for drafting, the phone backup and the owner's review. */
export const DraftableRow = z.object({
  id: z.guid(), thread_id: z.guid(), received_at: ts, body_text: z.string().nullable(), retry_count: z.number().int(),
  state: z.enum(["classified", "escalated"]), intent: z.string().nullable(), notion_student_id: z.guid().nullable(),
  escalation_reason: z.string().nullable(), flags: z.array(z.string()),
}).transform((r): DraftableMessage => ({
  id: r.id, threadId: r.thread_id, receivedAt: r.received_at, bodyText: r.body_text, retryCount: r.retry_count, state: r.state, intent: r.intent, notionStudentId: r.notion_student_id,
  escalationReason: r.escalation_reason, flags: r.flags,
}));

export const PushRow = z.object({
  id: z.guid(), message_id: z.guid(), draft_id: z.guid().nullable(), day: z.string(), notion_block_id: z.string().nullable(), comment_done: z.boolean(),
  state: z.enum(["pending", "pushed", "failed"]), attempts: z.number().int(), last_error: z.string().nullable(), purge_at: ts,
}).transform((r): PushRecord => ({
  id: r.id, messageId: r.message_id, draftId: r.draft_id, day: r.day, notionBlockId: r.notion_block_id, commentDone: r.comment_done,
  state: r.state, attempts: r.attempts, lastError: r.last_error, purgeAt: r.purge_at,
}));

export const PushCandidateRow = z.object({
  id: z.guid(), thread_id: z.guid(), received_at: ts, state: States, escalation_reason: z.string().nullable(), intent: z.string().nullable(),
  notion_student_id: z.guid().nullable(), purge_at: ts,
});

export const PushDayRow = z.object({ day: z.string(), work_page_id: z.string().nullable(), log_entry_id: z.string().nullable() })
  .transform((r): PushDay => ({ day: r.day, workPageId: r.work_page_id, logEntryId: r.log_entry_id }));

/** What iris.approve_draft, save_draft_edit and reject_draft return. */
export const ReviewResult = z.object({ result: z.enum(["ok", "conflict", "not_found"]), draft_id: z.guid().optional() })
  .transform((r) => ({ result: r.result, draftId: r.draft_id ?? null }));

/** REQ-48: the send rows and what the send functions return. */
const SendState = z.enum(["sending", "sent", "failed"]);
export const SendContextRow = z.object({
  id: z.guid(), state: SendState, attempts: z.number().int(), rfc_message_id: z.string().min(1), mode: z.enum(["manual", "auto"]),
  draft: z.object({ body_text: z.string() }),
  message: z.object({ from_email: z.string(), rfc_message_id: z.string().nullable(), thread: z.object({ gmail_thread_id: z.string(), subject: z.string().nullable() }) }),
}).transform((r): SendContext => ({
  sendId: r.id, state: r.state, attempts: r.attempts, rfcMessageId: r.rfc_message_id, draftText: r.draft.body_text, to: r.message.from_email,
  subject: r.message.thread.subject, inReplyTo: r.message.rfc_message_id, gmailThreadId: r.message.thread.gmail_thread_id || null, mode: r.mode,
}));
export const ClaimResultValue = z.enum(["claimed", "busy", "done", "exhausted", "paused", "withdrawn", "not_found"]);
/** iris.auto_approve_draft (REQ-49). */
export const AutoApproveRow = z.union([
  z.object({ result: z.literal("ok"), send_id: z.guid() }).transform((r) => ({ result: "ok" as const, sendId: r.send_id })),
  z.object({ result: z.literal("skipped"), reason: z.string().max(64) }).transform((r) => ({ result: "skipped" as const, reason: r.reason })),
]);
/** iris.set_auto_send (REQ-49). */
export const SetAutoSendResult = z.object({ result: z.enum(["ok", "gate_failed", "not_found"]), failing: z.array(z.string()).optional() })
  .transform((r) => ({ result: r.result, failing: r.failing ?? [] }));
export type SetAutoSendOutcome = z.infer<typeof SetAutoSendResult>;
export const FinishResultValue = z.enum(["ok", "done", "not_found"]);
export const FailResultValue = z.enum(["retrying", "failed", "done", "not_found"]);
export const ApproveSendResult = z.object({
  result: z.enum(["ok", "existing", "conflict", "not_found", "paused"]), send_id: z.guid().optional(), state: SendState.optional(),
}).transform((r) => ({ result: r.result, sendId: r.send_id ?? null, state: r.state ?? null }));
export type ApproveSendOutcome = z.infer<typeof ApproveSendResult>;
export const RetrySendResult = z.object({ result: z.enum(["ok", "not_failed", "paused", "not_found"]), state: SendState.optional() })
  .transform((r) => ({ result: r.result, state: r.state ?? null }));
export type RetrySendOutcome = z.infer<typeof RetrySendResult>;

/** The latest send of a message, for its page (REQ-48). */
export type SendView = { id: string; state: "sending" | "sent" | "failed"; attempts: number; lastError: string | null; sentAt: string | null; leaseUntil: string | null };
export const SendViewRow = z.object({
  id: z.guid(), state: SendState, attempts: z.number().int(), last_error: z.string().nullable(), sent_at: ts.nullable(), lease_until: ts.nullable(),
}).transform((r): SendView => ({ id: r.id, state: r.state, attempts: r.attempts, lastError: r.last_error, sentAt: r.sent_at, leaseUntil: r.lease_until }));

export type DraftView = {
  id: string; version: number; replyType: string; bodyText: string; policyVersion: number;
  state: "proposed" | "approved" | "rejected" | "superseded" | "sent" | "failed"; createdBy: "iris" | "owner"; edited: boolean;
  approvedAt: string | null; rejectedReason: string | null; createdAt: string;
  /** REQ-49: auto for a gate approval; sendAfter while it waits for the end of quiet hours. */
  approvalMode: "manual" | "auto" | null; sendAfter: string | null;
};
export const DraftRow = z.object({
  id: z.guid(), version: z.number().int(), reply_type: z.string(), body_text: z.string(), policy_version: z.number().int(),
  state: z.enum(["proposed", "approved", "rejected", "superseded", "sent", "failed"]), created_by: z.enum(["iris", "owner"]), edited: z.boolean(),
  approved_at: ts.nullable(), rejected_reason: z.string().nullable(), created_at: ts,
  approval_mode: z.enum(["manual", "auto"]).nullable(), send_after: ts.nullable(),
}).transform((r): DraftView => ({
  id: r.id, version: r.version, replyType: r.reply_type, bodyText: r.body_text, policyVersion: r.policy_version, state: r.state, createdBy: r.created_by,
  edited: r.edited, approvedAt: r.approved_at, rejectedReason: r.rejected_reason, createdAt: r.created_at, approvalMode: r.approval_mode, sendAfter: r.send_after,
}));

/** Another message of the same thread, for the message page. */
export type ThreadMessage = { id: string; receivedAt: string; direction: "inbound" | "outbound"; source: string; text: string | null };
export const ThreadMessageRow = z.object({
  id: z.guid(), received_at: ts, direction: z.enum(["inbound", "outbound"]), source: z.string(), body_text: z.string().nullable(), snippet: z.string().nullable(),
}).transform((r): ThreadMessage => ({ id: r.id, receivedAt: r.received_at, direction: r.direction, source: r.source, text: r.body_text ?? r.snippet }));

export type ThreadView = { thread: ThreadMessage[]; drafts: DraftView[]; send: SendView | null };

/** What the owner sees: settings without the lease. */
export type OwnerSettings = {
  paused: boolean; mailbox: string | null; lastPollAt: string | null; lastPollResult: PollResult | null; lastError: string | null; confidenceThreshold: number;
  /** REQ-49: the global auto-send switch and quiet hours (read-only on the page). */
  sendingEnabled: boolean; quietStart: string; quietEnd: string;
};
export const OwnerSettingsRow = z.object({
  paused: z.boolean(), mailbox: z.string().nullable(), last_poll_at: ts.nullable(), last_poll_result: Result.nullable(), last_error: z.string().nullable(), confidence_threshold: numeric,
  sending_enabled: z.boolean(), quiet_start: z.string(), quiet_end: z.string(),
}).transform((r): OwnerSettings => ({
  paused: r.paused, mailbox: r.mailbox, lastPollAt: r.last_poll_at, lastPollResult: r.last_poll_result, lastError: r.last_error, confidenceThreshold: r.confidence_threshold,
  sendingEnabled: r.sending_enabled, quietStart: r.quiet_start.slice(0, 5), quietEnd: r.quiet_end.slice(0, 5),
}));

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
  confidence: number | null;
  flags: string[];
  notionStudentIds: string[];
  /** The chosen child (REQ-44). */
  notionStudentId: string | null;
  /** Its Notion phone copy failed (REQ-44 AC13). */
  pushFailed: boolean;
  /** The failed send behind a Failed row, for Retry (REQ-48). */
  sendId?: string | null;
};
export const InboxMessageRow = z.object({
  id: z.guid(), thread_id: z.guid(), from_email: z.string(), snippet: z.string().nullable(), received_at: ts,
  state: States, escalation_reason: z.string().nullable(), intent: z.string().nullable(), confidence: numeric.nullable(), flags: z.array(z.string()),
  notion_student_id: z.guid().nullable(),
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
  drafted: count.optional(),
  sent: count.optional(),
  escalated: count.optional(),
  skipped: count.optional(),
  failed: count.optional(),
  purged: count.optional(),
});
export type IrisRunResponse = z.infer<typeof IrisRunResponse>;
