import { z } from "zod";
import type { IrisReader } from "../iris/handlers";
import { ClassifiableRow, DraftRow, DraftableRow, HistoryRow, InboxMessageRow, InboxThreadRow, MessageDetailRow, OwnerSettingsRow, PurgeCounts, PushRow, PushCandidateRow, PushDayRow, ReviewResult, RetryRow, RunRow, SettingsRow, ThreadMessageRow, ThreadRow, type InboxMessage } from "../iris/schemas";
import { EventRow } from "../iris/eval-schemas";
import type { EvalPendingMessage, IrisStore, MessageInsert, MessagePatch, ThreadPatch } from "../iris/store";
import type { Db } from "./client";

/**
 * Storage for Iris (REQ-42, migration 0024) over a client scoped to the
 * `iris` schema. createIrisStore is for the bearer-protected run, which passes
 * the service client; createIrisReader is for the owner's pages and routes,
 * which pass the owner's own client so RLS decides. Every row is parsed with
 * Zod (ADR 0017), and every query error throws: an empty answer from a failed
 * read must not look like "no mail".
 */
export function irisSchema(supabase: Db["supabase"]) {
  return supabase.schema("iris");
}
export type IrisClient = ReturnType<typeof irisSchema>;

const fail = (): never => {
  throw new Error("iris unavailable");
};
const KNOWN_CHUNK = 100;

const messageColumns = (m: MessageInsert) => ({
  thread_id: m.threadId,
  gmail_message_id: m.gmailMessageId,
  rfc_message_id: m.rfcMessageId,
  direction: m.direction,
  source: m.source,
  from_email: m.fromEmail,
  from_name: m.fromName,
  received_at: m.receivedAt,
  body_text: m.bodyText,
  body_truncated: m.bodyTruncated,
  snippet: m.snippet,
  state: m.state,
  state_changed_at: m.stateChangedAt,
  escalation_reason: m.escalationReason,
  policy_version: m.policyVersion,
  handled_at: m.handledAt,
  retry_count: m.retryCount,
  last_error: m.lastError,
  purge_at: m.purgeAt,
});

function patchColumns(p: MessagePatch): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (p.bodyText !== undefined) out.body_text = p.bodyText;
  if (p.bodyTruncated !== undefined) out.body_truncated = p.bodyTruncated;
  if (p.state !== undefined) out.state = p.state;
  if (p.stateChangedAt !== undefined) out.state_changed_at = p.stateChangedAt;
  if (p.escalationReason !== undefined) out.escalation_reason = p.escalationReason;
  if (p.intent !== undefined) out.intent = p.intent;
  if (p.confidence !== undefined) out.confidence = p.confidence;
  if (p.flags !== undefined) out.flags = p.flags;
  if (p.policyVersion !== undefined) out.policy_version = p.policyVersion;
  if (p.handledAt !== undefined) out.handled_at = p.handledAt;
  if (p.notionStudentId !== undefined) out.notion_student_id = p.notionStudentId;
  if (p.retryCount !== undefined) out.retry_count = p.retryCount;
  if (p.lastError !== undefined) out.last_error = p.lastError === null ? null : p.lastError.slice(0, 300);
  return out;
}

function threadColumns(p: ThreadPatch): Record<string, unknown> {
  const out: Record<string, unknown> = { first_received_at: p.firstReceivedAt, last_inbound_at: p.lastInboundAt, purge_at: p.purgeAt };
  if (p.matchState !== undefined) out.match_state = p.matchState;
  if (p.notionStudentIds !== undefined) out.notion_student_ids = p.notionStudentIds;
  if (p.parentEmail !== undefined) out.parent_email = p.parentEmail;
  if (p.subject !== undefined) out.subject = p.subject;
  return out;
}

const THREAD_SELECT = "id, gmail_thread_id, first_received_at, last_inbound_at, purge_at";
const PUSH_SELECT = "id, message_id, draft_id, day, notion_block_id, comment_done, state, attempts, last_error, purge_at";
const DRAFT_SELECT = "id, version, reply_type, body_text, policy_version, state, created_by, edited, approved_at, rejected_reason, created_at";

export function createIrisStore(iris: IrisClient, orgId: string): IrisStore {
  return {
    async getSettings() {
      const { data, error } = await iris.from("settings").select().eq("org_id", orgId).maybeSingle();
      if (error) fail();
      return data ? SettingsRow.parse(data) : null;
    },
    async claimPoll(leaseSeconds) {
      const { data, error } = await iris.rpc("claim_poll", { p_org: orgId, p_lease_seconds: leaseSeconds });
      if (error) fail();
      const rows = z.array(z.unknown()).parse(data ?? []);
      return rows.length > 0 ? SettingsRow.parse(rows[0]) : null;
    },
    async releasePoll(p) {
      const { error } = await iris
        .from("settings")
        .update({ poll_lease_until: null, last_poll_at: p.lastPollAt, last_poll_result: p.lastPollResult, last_error: p.lastError?.slice(0, 300) ?? null })
        .eq("org_id", orgId);
      if (error) fail();
    },
    async knownGmailIds(ids) {
      const known = new Set<string>();
      for (let i = 0; i < ids.length; i += KNOWN_CHUNK) {
        const chunk = ids.slice(i, i + KNOWN_CHUNK);
        const { data, error } = await iris.from("messages").select("gmail_message_id").eq("org_id", orgId).in("gmail_message_id", chunk);
        if (error) fail();
        for (const r of z.array(z.object({ gmail_message_id: z.string() })).parse(data ?? [])) known.add(r.gmail_message_id);
      }
      return known;
    },
    async findThread(gmailThreadId) {
      const { data, error } = await iris.from("threads").select(THREAD_SELECT).eq("org_id", orgId).eq("gmail_thread_id", gmailThreadId).maybeSingle();
      if (error) fail();
      return data ? ThreadRow.parse(data) : null;
    },
    async saveThread(gmailThreadId, patch) {
      const { data, error } = await iris
        .from("threads")
        .upsert({ org_id: orgId, gmail_thread_id: gmailThreadId, ...threadColumns(patch) }, { onConflict: "org_id,gmail_thread_id" })
        .select(THREAD_SELECT)
        .single();
      if (error) fail();
      return ThreadRow.parse(data);
    },
    async setLastOutbound(threadId, at) {
      const { error } = await iris.from("threads").update({ last_outbound_at: at }).eq("org_id", orgId).eq("id", threadId);
      if (error) fail();
    },
    async insertMessage(m) {
      const { data, error } = await iris
        .from("messages")
        .upsert({ org_id: orgId, ...messageColumns(m) }, { onConflict: "org_id,gmail_message_id", ignoreDuplicates: true })
        .select("id");
      if (error) fail();
      const rows = z.array(z.object({ id: z.guid() })).parse(data ?? []);
      return rows.length > 0 ? { inserted: true, id: rows[0].id } : { inserted: false, id: null };
    },
    async listRetryable(maxRetries, limit) {
      const { data, error } = await iris
        .from("messages")
        .select("id, gmail_message_id, thread_id, retry_count, last_error")
        .eq("org_id", orgId)
        .eq("direction", "inbound")
        .eq("state", "received")
        .lt("retry_count", maxRetries)
        .order("received_at", { ascending: true })
        .limit(limit);
      if (error) fail();
      return z.array(RetryRow).parse(data ?? []);
    },
    async listClassifiable(maxRetries, limit) {
      const { data, error } = await iris
        .from("messages")
        .select("id, thread_id, received_at, body_text, retry_count")
        .eq("org_id", orgId)
        .eq("direction", "inbound")
        .eq("state", "matched")
        .lt("retry_count", maxRetries)
        .order("received_at", { ascending: true })
        .limit(limit);
      if (error) fail();
      return z.array(ClassifiableRow).parse(data ?? []);
    },
    async threadContext(threadId, before, limit) {
      const [t, m] = await Promise.all([
        iris.from("threads").select("notion_student_ids").eq("org_id", orgId).eq("id", threadId).maybeSingle(),
        iris
          .from("messages")
          .select("received_at, direction, intent, snippet")
          .eq("org_id", orgId)
          .eq("thread_id", threadId)
          .lt("received_at", before)
          .order("received_at", { ascending: false })
          .limit(limit),
      ]);
      if (t.error || m.error) fail();
      const studentIds = t.data ? z.object({ notion_student_ids: z.array(z.guid()) }).parse(t.data).notion_student_ids : [];
      return { studentIds, history: z.array(HistoryRow).parse(m.data ?? []).reverse() };
    },
    async insertAiCall(c) {
      const { error } = await iris.from("ai_calls").insert({
        org_id: orgId, message_id: c.messageId, purpose: c.purpose, model: c.model, input_tokens: c.inputTokens, output_tokens: c.outputTokens,
        policy_version: c.policyVersion, outcome: c.outcome, error: c.error?.slice(0, 300) ?? null,
      });
      if (error) fail();
    },
    async updateMessage(id, patch) {
      const columns = patchColumns(patch);
      if (Object.keys(columns).length === 0) return;
      const { error } = await iris.from("messages").update(columns).eq("org_id", orgId).eq("id", id);
      if (error) fail();
    },
    async insertEvent(e) {
      const { error } = await iris.from("events").insert({ org_id: orgId, kind: e.kind, message_id: e.messageId, draft_id: e.draftId ?? null, actor: "iris", detail: e.detail });
      if (error) fail();
    },
    async listDraftable(maxRetries, limit) {
      const { data, error } = await iris
        .from("messages")
        .select("id, thread_id, received_at, body_text, retry_count, state, intent, notion_student_id, escalation_reason, flags")
        .eq("org_id", orgId)
        .eq("direction", "inbound")
        .or("state.eq.classified,and(state.eq.escalated,escalation_reason.in.(escalate_only,schedule_no_show),intent.eq.no_show,handled_at.is.null)")
        .lt("retry_count", maxRetries)
        .order("received_at", { ascending: true })
        .limit(limit * 4);
      if (error) fail();
      const rows = z.array(DraftableRow).parse(data ?? []);
      if (rows.length === 0) return [];
      // A no-show stays escalated after its draft, so "no draft yet" is checked here.
      const d = await iris.from("drafts").select("message_id").eq("org_id", orgId).in("message_id", rows.map((r) => r.id));
      if (d.error) fail();
      const drafted = new Set(z.array(z.object({ message_id: z.guid() })).parse(d.data ?? []).map((r) => r.message_id));
      return rows.filter((r) => !drafted.has(r.id)).slice(0, limit);
    },
    async insertDraft(d) {
      const { data, error } = await iris
        .from("drafts")
        .insert({ org_id: orgId, message_id: d.messageId, version: 1, reply_type: d.replyType, body_text: d.bodyText, policy_version: d.policyVersion, state: "proposed", created_by: "iris", edited: false })
        .select("id")
        .single();
      if (error) fail();
      return z.object({ id: z.guid() }).parse(data).id;
    },
    async supersedeThread(threadId, sentAt) {
      const { data, error } = await iris
        .from("messages")
        .select("id")
        .eq("org_id", orgId)
        .eq("thread_id", threadId)
        .eq("direction", "inbound")
        .lt("received_at", sentAt)
        .or("state.eq.drafted,and(state.eq.escalated,handled_at.is.null)");
      if (error) fail();
      const ids = z.array(z.object({ id: z.guid() })).parse(data ?? []).map((r) => r.id);
      if (ids.length === 0) return [];
      const m = await iris
        .from("messages")
        .update({ state: "escalated", escalation_reason: "answered_by_charlie", handled_at: sentAt, state_changed_at: new Date().toISOString() })
        .eq("org_id", orgId)
        .in("id", ids);
      if (m.error) fail();
      const d = await iris.from("drafts").update({ state: "superseded" }).eq("org_id", orgId).in("message_id", ids).eq("state", "proposed");
      if (d.error) fail();
      const ev = await iris.from("events").insert(ids.map((id) => ({ org_id: orgId, kind: "superseded", message_id: id, actor: "iris", detail: { state: "escalated", reason: "answered_by_charlie" } })));
      if (ev.error) fail();
      return ids;
    },
    async listPushable(maxAttempts, limit) {
      const { data, error } = await iris
        .from("messages")
        .select("id, thread_id, received_at, state, escalation_reason, intent, notion_student_id, purge_at")
        .eq("org_id", orgId)
        .eq("direction", "inbound")
        .or("state.eq.drafted,and(state.eq.escalated,handled_at.is.null,escalation_reason.neq.automated)")
        .order("received_at", { ascending: true })
        .limit(200);
      if (error) fail();
      const rows = z.array(PushCandidateRow).parse(data ?? []);
      if (rows.length === 0) return [];
      const ids = rows.map((r) => r.id);
      const [p, d, t] = await Promise.all([
        iris.from("pushes").select(PUSH_SELECT).eq("org_id", orgId).in("message_id", ids),
        iris.from("drafts").select("id, message_id, version, body_text").eq("org_id", orgId).in("message_id", ids).in("state", ["proposed", "approved"]),
        iris.from("threads").select("id, gmail_thread_id, subject, notion_student_ids").in("id", [...new Set(rows.map((r) => r.thread_id))]),
      ]);
      if (p.error || d.error || t.error) fail();
      const pushes = new Map(z.array(PushRow).parse(p.data ?? []).map((r) => [r.messageId, r]));
      const drafts = new Map<string, { id: string; bodyText: string; version: number }>();
      for (const r of z.array(z.object({ id: z.guid(), message_id: z.guid(), version: z.number().int(), body_text: z.string() })).parse(d.data ?? [])) {
        if ((drafts.get(r.message_id)?.version ?? 0) < r.version) drafts.set(r.message_id, { id: r.id, bodyText: r.body_text, version: r.version });
      }
      const threads = new Map(z.array(InboxThreadRow).parse(t.data ?? []).map((r) => [r.id, r]));
      return rows
        .filter((r) => {
          const push = pushes.get(r.id);
          return !push || (push.state !== "pushed" && push.attempts < maxAttempts);
        })
        .slice(0, limit)
        .map((r) => {
          const draft = drafts.get(r.id);
          return {
            messageId: r.id, gmailThreadId: threads.get(r.thread_id)?.gmail_thread_id ?? "", receivedAt: r.received_at, state: r.state, escalationReason: r.escalation_reason,
            intent: r.intent, notionStudentIds: threads.get(r.thread_id)?.notion_student_ids ?? [], notionStudentId: r.notion_student_id, purgeAt: r.purge_at,
            draft: draft ? { id: draft.id, bodyText: draft.bodyText } : null, push: pushes.get(r.id) ?? null,
          };
        });
    },
    async savePush(row) {
      const { data, error } = await iris
        .from("pushes")
        .upsert({
          org_id: orgId, message_id: row.messageId, draft_id: row.draftId, day: row.day, notion_block_id: row.notionBlockId, comment_done: row.commentDone,
          state: row.state, attempts: row.attempts, last_error: row.lastError?.slice(0, 300) ?? null, purge_at: row.purgeAt,
        }, { onConflict: "message_id" })
        .select("id")
        .single();
      if (error) fail();
      return z.object({ id: z.guid() }).parse(data).id;
    },
    async getPushDay(day) {
      const { data, error } = await iris.from("push_days").select("day, work_page_id, log_entry_id").eq("org_id", orgId).eq("day", day).maybeSingle();
      if (error) fail();
      return data ? PushDayRow.parse(data) : null;
    },
    async savePushDay(d) {
      const { error } = await iris.from("push_days").upsert({ org_id: orgId, day: d.day, work_page_id: d.workPageId, log_entry_id: d.logEntryId }, { onConflict: "org_id,day" });
      if (error) fail();
    },
    async listExpiringPushes(cutoff) {
      const { data, error } = await iris.from("pushes").select("id, notion_block_id").eq("org_id", orgId).or(`message_id.is.null,purge_at.lt."${cutoff}"`);
      if (error) fail();
      return z.array(z.object({ id: z.guid(), notion_block_id: z.string().nullable() })).parse(data ?? []).map((r) => ({ id: r.id, notionBlockId: r.notion_block_id }));
    },
    async deletePush(id) {
      const { error } = await iris.from("pushes").delete().eq("org_id", orgId).eq("id", id);
      if (error) fail();
    },
    async pushDayCounts(day) {
      const { data, error } = await iris.from("pushes").select("draft_id, state").eq("org_id", orgId).eq("day", day);
      if (error) fail();
      const rows = z.array(z.object({ draft_id: z.guid().nullable(), state: z.string() })).parse(data ?? []);
      return { drafts: rows.filter((r) => r.draft_id).length, escalations: rows.filter((r) => !r.draft_id).length, failed: rows.filter((r) => r.state === "failed").length };
    },
    async insertRun(r) {
      const { data, error } = await iris
        .from("runs")
        .insert({
          org_id: orgId, started_at: r.startedAt, finished_at: r.finishedAt, result: r.result,
          seen: r.seen, stored: r.stored, matched: r.matched, classified: r.classified, drafted: r.drafted, escalated: r.escalated, skipped: r.skipped, failed: r.failed, purged: r.purged,
          error: r.error?.slice(0, 300) ?? null,
        })
        .select("id")
        .single();
      if (error) fail();
      return z.object({ id: z.guid() }).parse(data).id;
    },
    async purge() {
      const { data, error } = await iris.rpc("purge_expired", { p_org: orgId });
      if (error) fail();
      return Object.values(PurgeCounts.parse(data ?? {})).reduce((a, b) => a + b, 0);
    },
    async pendingRequest(kind) {
      const { data, error } = await iris.from("events").select("id, at, kind, detail").eq("org_id", orgId).eq("kind", kind).order("id", { ascending: false }).limit(1);
      if (error) fail();
      const newest = z.array(EventRow).parse(data ?? [])[0];
      if (!newest) return null;
      const done = await iris.from("events").select("id").eq("org_id", orgId).eq("kind", FINISHED_KIND[kind]).eq("detail->>request_id", String(newest.id)).limit(1);
      if (done.error) fail();
      return z.array(z.unknown()).parse(done.data ?? []).length > 0 ? null : { id: newest.id, at: newest.at, detail: newest.detail };
    },
    async requestBatches(requestId) {
      const { data, error } = await iris
        .from("events")
        .select("id, at, kind, detail")
        .eq("org_id", orgId)
        .eq("kind", "eval_import_batch")
        .eq("detail->>request_id", String(requestId))
        .order("id", { ascending: true });
      if (error) fail();
      return z.array(EventRow).parse(data ?? []).map((e) => BatchDetail.parse(e.detail));
    },
    async storedThreadIds(gmailThreadIds) {
      const out = new Map<string, string>();
      for (let i = 0; i < gmailThreadIds.length; i += KNOWN_CHUNK) {
        const { data, error } = await iris.from("threads").select("id, gmail_thread_id").eq("org_id", orgId).in("gmail_thread_id", gmailThreadIds.slice(i, i + KNOWN_CHUNK));
        if (error) fail();
        for (const r of z.array(z.object({ id: z.guid(), gmail_thread_id: z.string() })).parse(data ?? [])) out.set(r.gmail_thread_id, r.id);
      }
      return out;
    },
    async listEvalPending(requestId, limit) {
      const [l, r] = await Promise.all([
        iris.from("eval_labels").select("message_id").eq("org_id", orgId).not("gold_intent", "is", null).not("gold_escalate", "is", null),
        iris.from("eval_results").select("message_id").eq("org_id", orgId).eq("request_event_id", requestId),
      ]);
      if (l.error || r.error) fail();
      const done = new Set(z.array(z.object({ message_id: z.guid() })).parse(r.data ?? []).map((x) => x.message_id));
      const ids = z.array(z.object({ message_id: z.guid() })).parse(l.data ?? []).map((x) => x.message_id).filter((id) => !done.has(id));
      const rows: EvalPendingMessage[] = [];
      for (let i = 0; i < ids.length; i += KNOWN_CHUNK) {
        const { data, error } = await iris
          .from("messages")
          .select("id, thread_id, received_at, body_text")
          .eq("org_id", orgId)
          .eq("escalation_reason", "history_import")
          .in("id", ids.slice(i, i + KNOWN_CHUNK));
        if (error) fail();
        for (const m of z.array(z.object({ id: z.guid(), thread_id: z.guid(), received_at: z.string(), body_text: z.string().nullable() })).parse(data ?? [])) {
          rows.push({ id: m.id, threadId: m.thread_id, receivedAt: m.received_at, bodyText: m.body_text });
        }
      }
      return rows.sort((a, b) => a.receivedAt.localeCompare(b.receivedAt)).slice(0, limit);
    },
    async insertEvalResult(r) {
      const { error } = await iris.from("eval_results").upsert(
        {
          org_id: orgId, request_event_id: r.requestEventId, message_id: r.messageId, policy_version: r.policyVersion, model: r.model,
          predicted_intent: r.predictedIntent, predicted_reply_type: r.predictedReplyType, predicted_escalate: r.predictedEscalate,
          escalation_reason: r.escalationReason, flags: r.flags, draft_body: r.draftBody, outcome: r.outcome, error: r.error?.slice(0, 300) ?? null,
        },
        { onConflict: "request_event_id,message_id", ignoreDuplicates: true },
      );
      if (error) fail();
    },
    async evalResultCounts(requestId) {
      const { data, error } = await iris.from("eval_results").select("outcome").eq("org_id", orgId).eq("request_event_id", requestId);
      if (error) fail();
      const rows = z.array(z.object({ outcome: z.enum(["ok", "error"]) })).parse(data ?? []);
      return { ok: rows.filter((r) => r.outcome === "ok").length, error: rows.filter((r) => r.outcome === "error").length };
    },
  };
}

/** Each eval request kind and the event that finishes it (REQ-45). */
export const FINISHED_KIND = { eval_import_requested: "eval_import_finished", eval_run_requested: "eval_run_finished" } as const;

const BatchDetail = z
  .object({ stored_inbound: z.number().int().default(0), stored_replies: z.number().int().default(0), skipped: z.array(z.string()).default([]), capped: z.boolean().default(false) })
  .transform((d) => ({ storedInbound: d.stored_inbound, storedReplies: d.stored_replies, skipped: d.skipped, capped: d.capped }));

/**
 * The owner's reads and writes (pause, Mark handled), on the owner's own
 * client. `uid` is the signed-in owner's auth id, read from the same session.
 */
export function createIrisReader(iris: IrisClient, orgId: string, uid: () => Promise<string | null> = async () => null): IrisReader {
  type Section = "needs_you" | "recent" | "drafts" | "sent_today" | "failed";
  const inbox = async (limit: number, section: Section, since?: string): Promise<InboxMessage[]> => {
    let q = iris
      .from("messages")
      .select("id, thread_id, from_email, snippet, received_at, state, escalation_reason, intent, confidence, flags, notion_student_id")
      .eq("org_id", orgId)
      .eq("direction", "inbound");
    if (section === "needs_you") q = q.eq("state", "escalated").is("handled_at", null);
    if (section === "drafts") q = q.eq("state", "drafted");
    if (section === "sent_today") q = q.in("state", ["approved", "sent"]).gte("state_changed_at", since ?? new Date().toISOString());
    if (section === "failed") q = q.eq("state", "failed");
    // History imported for the eval (REQ-45) is never part of the inbox.
    if (section === "recent") q = q.or("escalation_reason.is.null,escalation_reason.neq.history_import");
    const { data, error } = await q.order("received_at", { ascending: false }).limit(limit);
    if (error) fail();
    const rows = z.array(InboxMessageRow).parse(data ?? []);
    const threadIds = [...new Set(rows.map((r) => r.thread_id))];
    const threads = new Map<string, z.infer<typeof InboxThreadRow>>();
    const failedPush = new Set<string>();
    if (threadIds.length > 0) {
      const [t, p] = await Promise.all([
        iris.from("threads").select("id, gmail_thread_id, subject, notion_student_ids").in("id", threadIds),
        iris.from("pushes").select("message_id").eq("org_id", orgId).eq("state", "failed").in("message_id", rows.map((r) => r.id)),
      ]);
      if (t.error || p.error) fail();
      for (const row of z.array(InboxThreadRow).parse(t.data ?? [])) threads.set(row.id, row);
      for (const row of z.array(z.object({ message_id: z.guid() })).parse(p.data ?? [])) failedPush.add(row.message_id);
    }
    return rows.map((r) => {
      const t = threads.get(r.thread_id);
      return {
        id: r.id, gmailThreadId: t?.gmail_thread_id ?? "", fromEmail: r.from_email, subject: t?.subject ?? null, snippet: r.snippet,
        receivedAt: r.received_at, state: r.state, escalationReason: r.escalation_reason, intent: r.intent, confidence: r.confidence, flags: r.flags,
        notionStudentIds: t?.notion_student_ids ?? [], notionStudentId: r.notion_student_id, pushFailed: failedPush.has(r.id),
      };
    });
  };
  const review = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await iris.rpc(fn, args);
    if (error) fail();
    return ReviewResult.parse(data);
  };
  return {
    async getSettings() {
      const { data, error } = await iris.from("settings").select("paused, mailbox, last_poll_at, last_poll_result, last_error, confidence_threshold").eq("org_id", orgId).maybeSingle();
      if (error) fail();
      return data ? OwnerSettingsRow.parse(data) : null;
    },
    async lastRun() {
      const { data, error } = await iris
        .from("runs")
        .select("started_at, result, stored, matched, escalated, failed, error")
        .eq("org_id", orgId)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) fail();
      return data ? RunRow.parse(data) : null;
    },
    listNeedsYou: (limit) => inbox(limit, "needs_you"),
    listRecent: (limit) => inbox(limit, "recent"),
    listDraftsWaiting: (limit) => inbox(limit, "drafts"),
    listSentToday: (since, limit) => inbox(limit, "sent_today", since),
    listFailed: (limit) => inbox(limit, "failed"),
    async getThreadView(id) {
      const m = await iris.from("messages").select("thread_id, received_at").eq("org_id", orgId).eq("id", id).maybeSingle();
      if (m.error) fail();
      if (!m.data) return null;
      const msg = z.object({ thread_id: z.guid(), received_at: z.string() }).parse(m.data);
      const [t, d] = await Promise.all([
        iris
          .from("messages")
          .select("id, received_at, direction, source, body_text, snippet")
          .eq("org_id", orgId)
          .eq("thread_id", msg.thread_id)
          .neq("id", id)
          .order("received_at", { ascending: true })
          .limit(50),
        iris.from("drafts").select(DRAFT_SELECT).eq("org_id", orgId).eq("message_id", id).order("version", { ascending: false }),
      ]);
      if (t.error || d.error) fail();
      return { thread: z.array(ThreadMessageRow).parse(t.data ?? []), drafts: z.array(DraftRow).parse(d.data ?? []) };
    },
    async approveDraft(id, version) {
      return (await review("approve_draft", { p_draft: id, p_version: version })).result;
    },
    async saveDraftEdit(id, version, body) {
      return review("save_draft_edit", { p_draft: id, p_version: version, p_body: body });
    },
    async rejectDraft(id, reason) {
      return (await review("reject_draft", { p_draft: id, p_reason: reason })).result;
    },
    async updatePaused(paused) {
      const { data, error } = await iris.from("settings").update({ paused }).eq("org_id", orgId).select("id");
      if (error) fail();
      return z.array(z.unknown()).parse(data ?? []).length;
    },
    async getMessage(id) {
      const { data, error } = await iris
        .from("messages")
        .select("id, from_email, from_name, received_at, body_text, state, intent, confidence, flags, escalation_reason, policy_version, handled_at, thread:threads(gmail_thread_id, subject, notion_student_ids)")
        .eq("org_id", orgId)
        .eq("id", id)
        .eq("direction", "inbound")
        .maybeSingle();
      if (error) fail();
      return data ? MessageDetailRow.parse(data) : null;
    },
    async markHandled(id) {
      const actor = await uid();
      if (!actor) fail();
      // Guarded by handled_at is null, so a double click writes once.
      const { data, error } = await iris
        .from("messages")
        .update({ handled_at: new Date().toISOString(), handled_by: actor })
        .eq("org_id", orgId)
        .eq("id", id)
        .eq("state", "escalated")
        .is("handled_at", null)
        .select("id");
      if (error) fail();
      if (z.array(z.unknown()).parse(data ?? []).length === 0) {
        const again = await iris.from("messages").select("state, handled_at").eq("org_id", orgId).eq("id", id).maybeSingle();
        if (again.error) fail();
        const row = again.data ? z.object({ state: z.string().nullable(), handled_at: z.string().nullable() }).parse(again.data) : null;
        return row?.state === "escalated" && row.handled_at !== null ? "conflict" : "not_found";
      }
      const ev = await iris.from("events").insert({ org_id: orgId, kind: "handled", message_id: id, actor, detail: { state: "escalated", by: "owner" } });
      if (ev.error) fail();
      return "ok";
    },
  };
}
