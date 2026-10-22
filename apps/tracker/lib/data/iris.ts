import { z } from "zod";
import type { IrisReader } from "../iris/handlers";
import { ClassifiableRow, HistoryRow, InboxMessageRow, InboxThreadRow, MessageDetailRow, OwnerSettingsRow, PurgeCounts, RetryRow, RunRow, SettingsRow, ThreadRow, type InboxMessage } from "../iris/schemas";
import type { IrisStore, MessageInsert, MessagePatch, ThreadPatch } from "../iris/store";
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
      const { error } = await iris.from("events").insert({ org_id: orgId, kind: e.kind, message_id: e.messageId, actor: "iris", detail: e.detail });
      if (error) fail();
    },
    async insertRun(r) {
      const { data, error } = await iris
        .from("runs")
        .insert({
          org_id: orgId, started_at: r.startedAt, finished_at: r.finishedAt, result: r.result,
          seen: r.seen, stored: r.stored, matched: r.matched, classified: r.classified, escalated: r.escalated, skipped: r.skipped, failed: r.failed, purged: r.purged,
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
  };
}

/**
 * The owner's reads and writes (pause, Mark handled), on the owner's own
 * client. `uid` is the signed-in owner's auth id, read from the same session.
 */
export function createIrisReader(iris: IrisClient, orgId: string, uid: () => Promise<string | null> = async () => null): IrisReader {
  const inbox = async (limit: number, needsYou: boolean): Promise<InboxMessage[]> => {
    let q = iris
      .from("messages")
      .select("id, thread_id, from_email, snippet, received_at, state, escalation_reason, intent, flags")
      .eq("org_id", orgId)
      .eq("direction", "inbound");
    if (needsYou) q = q.eq("state", "escalated").is("handled_at", null);
    const { data, error } = await q.order("received_at", { ascending: false }).limit(limit);
    if (error) fail();
    const rows = z.array(InboxMessageRow).parse(data ?? []);
    const threadIds = [...new Set(rows.map((r) => r.thread_id))];
    const threads = new Map<string, z.infer<typeof InboxThreadRow>>();
    if (threadIds.length > 0) {
      const t = await iris.from("threads").select("id, gmail_thread_id, subject, notion_student_ids").in("id", threadIds);
      if (t.error) fail();
      for (const row of z.array(InboxThreadRow).parse(t.data ?? [])) threads.set(row.id, row);
    }
    return rows.map((r) => {
      const t = threads.get(r.thread_id);
      return {
        id: r.id, gmailThreadId: t?.gmail_thread_id ?? "", fromEmail: r.from_email, subject: t?.subject ?? null, snippet: r.snippet,
        receivedAt: r.received_at, state: r.state, escalationReason: r.escalation_reason, intent: r.intent, flags: r.flags, notionStudentIds: t?.notion_student_ids ?? [],
      };
    });
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
    listNeedsYou: (limit) => inbox(limit, true),
    listRecent: (limit) => inbox(limit, false),
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
