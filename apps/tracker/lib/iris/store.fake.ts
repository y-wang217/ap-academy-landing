import { randomUUID } from "node:crypto";
import type { AiCallRecord, IrisSettings, IrisStore, MessageInsert, MessagePatch, PushDay, PushRecord, RunRecord, StoredThread, ThreadPatch } from "./store";

/** An in-memory IrisStore for the intake and handler tests. `fail` makes the named method throw. */
export function fakeIrisStore(init: Partial<IrisSettings> = {}) {
  const settings: IrisSettings & { leaseUntil: number | null } = {
    id: randomUUID(), orgId: "10000000-0000-0000-0000-00000000aaaa", paused: false, retentionDays: 90, confidenceThreshold: 0.85,
    lastPollAt: null, lastPollResult: null, lastError: null, leaseUntil: null, ...init,
  };
  const threads = new Map<string, StoredThread & ThreadPatch & { lastOutboundAt: string | null }>();
  const messages = new Map<string, MessageInsert & Partial<MessagePatch> & { id: string }>();
  const aiCalls: AiCallRecord[] = [];
  const events: { kind: string; messageId: string | null; draftId?: string | null; detail: Record<string, unknown> }[] = [];
  type FakeDraft = { id: string; messageId: string; version: number; replyType: string; bodyText: string; policyVersion: number; state: string; createdBy: "iris" | "owner"; edited: boolean };
  const drafts = new Map<string, FakeDraft>();
  const pushes = new Map<string, PushRecord & { id: string }>();
  const pushDays = new Map<string, PushDay>();
  const runs: (RunRecord & { id: string })[] = [];
  type FakeSend = { id: string; draftId: string; messageId: string; rfcMessageId: string; gmailMessageId: string | null; state: "sending" | "sent" | "failed"; attempts: number; leaseUntil: number | null; lastError: string | null; sentAt: string | null };
  const sends = new Map<string, FakeSend>();
  const calls: string[] = [];
  const fail = new Set<string>();
  let now = () => Date.now();
  const check = (name: string) => {
    calls.push(name);
    if (fail.has(name)) throw new Error(`${name} failed`);
  };
  const pub = (): IrisSettings => ({
    id: settings.id, orgId: settings.orgId, paused: settings.paused, retentionDays: settings.retentionDays, confidenceThreshold: settings.confidenceThreshold,
    lastPollAt: settings.lastPollAt, lastPollResult: settings.lastPollResult, lastError: settings.lastError,
  });

  const failSend = (x: FakeSend, error: string) => {
    Object.assign(x, { state: "failed", leaseUntil: null, lastError: error.slice(0, 300) });
    const d = drafts.get(x.draftId);
    if (d) d.state = "failed";
    const m = messages.get(x.messageId);
    if (m) Object.assign(m, { state: "failed", lastError: error.slice(0, 300) });
    events.push({ kind: "send_failed", messageId: x.messageId, draftId: x.draftId, detail: { send_id: x.id, attempts: x.attempts } });
  };

  const store: IrisStore = {
    async sendContext(sendId) {
      check("sendContext");
      const x = sends.get(sendId);
      if (!x) return null;
      const m = messages.get(x.messageId)!;
      const t = [...threads.values()].find((tt) => tt.id === m.threadId);
      return {
        sendId: x.id, state: x.state, attempts: x.attempts, rfcMessageId: x.rfcMessageId, draftText: drafts.get(x.draftId)!.bodyText, to: m.fromEmail,
        subject: t?.subject ?? null, inReplyTo: m.rfcMessageId, gmailThreadId: t?.gmailThreadId ?? null,
      };
    },
    async claimSend(sendId, leaseSeconds, maxAttempts) {
      check("claimSend");
      const x = sends.get(sendId);
      if (!x) return "not_found";
      if (x.state !== "sending") return "done";
      if (settings.paused) return "paused";
      if (x.leaseUntil !== null && x.leaseUntil > now()) return "busy";
      if (x.attempts >= maxAttempts) {
        failSend(x, x.lastError ?? "Send did not finish");
        return "exhausted";
      }
      x.attempts += 1;
      x.leaseUntil = now() + leaseSeconds * 1000;
      return "claimed";
    },
    async finishSend(sendId, r) {
      check("finishSend");
      const x = sends.get(sendId);
      if (!x) throw new Error("not_found");
      if (x.state === "sent") return;
      Object.assign(x, { state: "sent", gmailMessageId: r.gmailMessageId, sentAt: r.sentAt, leaseUntil: null, lastError: null });
      const d = drafts.get(x.draftId);
      if (d) d.state = "sent";
      const m = messages.get(x.messageId)!;
      Object.assign(m, { state: "sent", lastError: null });
      const copy = [...messages.values()].find((o) => o.gmailMessageId === r.gmailMessageId);
      if (copy) copy.source = "iris";
      else {
        const id = randomUUID();
        messages.set(id, {
          id, threadId: m.threadId, gmailMessageId: r.gmailMessageId, rfcMessageId: x.rfcMessageId, direction: "outbound", source: "iris",
          fromEmail: r.from, fromName: null, receivedAt: r.sentAt, bodyText: r.body, bodyTruncated: false, snippet: r.body.slice(0, 200), state: null, stateChangedAt: null,
          escalationReason: null, policyVersion: null, handledAt: null, retryCount: 0, lastError: null, purgeAt: m.purgeAt,
        });
      }
      for (const t of threads.values()) if (t.id === m.threadId) t.lastOutboundAt = r.sentAt;
      events.push({ kind: "sent", messageId: m.id, draftId: x.draftId, detail: { send_id: x.id, attempts: x.attempts } });
    },
    async failSendAttempt(sendId, error, maxAttempts) {
      check("failSendAttempt");
      const x = sends.get(sendId);
      if (!x) return "not_found";
      if (x.state !== "sending") return "done";
      if (x.attempts >= maxAttempts) {
        failSend(x, error);
        return "failed";
      }
      Object.assign(x, { leaseUntil: null, lastError: error.slice(0, 300) });
      events.push({ kind: "send_attempt_failed", messageId: x.messageId, draftId: x.draftId, detail: { send_id: x.id, attempt: x.attempts, error } });
      return "retrying";
    },
    async listStuckSends(limit) {
      check("listStuckSends");
      return [...sends.values()].filter((x) => x.state === "sending" && (x.leaseUntil === null || x.leaseUntil < now())).slice(0, limit).map((x) => x.id);
    },
    async getSettings() {
      check("getSettings");
      return pub();
    },
    async claimPoll(seconds) {
      check("claimPoll");
      if (settings.leaseUntil !== null && settings.leaseUntil > now()) return null;
      settings.leaseUntil = now() + seconds * 1000;
      return pub();
    },
    async releasePoll(p) {
      check("releasePoll");
      settings.lastPollAt = p.lastPollAt;
      settings.lastPollResult = p.lastPollResult;
      settings.lastError = p.lastError;
      settings.leaseUntil = null;
    },
    async knownGmailIds(ids) {
      check("knownGmailIds");
      const have = new Set([...messages.values()].map((m) => m.gmailMessageId));
      return new Set(ids.filter((i) => have.has(i)));
    },
    async findThread(gmailThreadId) {
      check("findThread");
      return threads.get(gmailThreadId) ?? null;
    },
    async saveThread(gmailThreadId, patch) {
      check("saveThread");
      const old = threads.get(gmailThreadId);
      const row = { id: old?.id ?? randomUUID(), gmailThreadId, lastOutboundAt: old?.lastOutboundAt ?? null, ...(old ?? {}), ...patch };
      threads.set(gmailThreadId, row);
      return row;
    },
    async setLastOutbound(threadId, at) {
      check("setLastOutbound");
      for (const t of threads.values()) if (t.id === threadId) t.lastOutboundAt = at;
    },
    async insertMessage(m) {
      check("insertMessage");
      if ([...messages.values()].some((x) => x.gmailMessageId === m.gmailMessageId)) return { inserted: false, id: null };
      const id = randomUUID();
      messages.set(id, { ...m, id });
      return { inserted: true, id };
    },
    async listRetryable(maxRetries, limit) {
      check("listRetryable");
      return [...messages.values()]
        .filter((m) => m.direction === "inbound" && m.state === "received" && m.retryCount < maxRetries)
        .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))
        .slice(0, limit)
        .map((m) => ({ id: m.id, gmailMessageId: m.gmailMessageId, threadId: m.threadId, retryCount: m.retryCount, lastError: m.lastError }));
    },
    async listClassifiable(maxRetries, limit) {
      check("listClassifiable");
      return [...messages.values()]
        .filter((m) => m.direction === "inbound" && m.state === "matched" && m.retryCount < maxRetries)
        .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))
        .slice(0, limit)
        .map((m) => ({ id: m.id, threadId: m.threadId, receivedAt: m.receivedAt, bodyText: m.bodyText, retryCount: m.retryCount }));
    },
    async threadContext(threadId, before, limit) {
      check("threadContext");
      const thread = [...threads.values()].find((t) => t.id === threadId);
      const history = [...messages.values()]
        .filter((m) => m.threadId === threadId && m.receivedAt < before)
        .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
        .slice(0, limit)
        .reverse()
        .map((m) => ({ receivedAt: m.receivedAt, direction: m.direction, intent: m.intent ?? null, snippet: m.snippet }));
      return { studentIds: thread?.notionStudentIds ?? [], history };
    },
    async insertAiCall(c) {
      check("insertAiCall");
      aiCalls.push(c);
    },
    async listDraftable(maxRetries, limit) {
      check("listDraftable");
      const hasDraft = new Set([...drafts.values()].map((d) => d.messageId));
      return [...messages.values()]
        .filter((m) => m.direction === "inbound" && m.retryCount < maxRetries && !hasDraft.has(m.id))
        .filter((m) => m.state === "classified" || (m.state === "escalated" && m.escalationReason === "escalate_only" && m.intent === "no_show" && !m.handledAt))
        .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))
        .slice(0, limit)
        .map((m) => ({ id: m.id, threadId: m.threadId, receivedAt: m.receivedAt, bodyText: m.bodyText, retryCount: m.retryCount, state: m.state as "classified" | "escalated", intent: m.intent ?? null, notionStudentId: m.notionStudentId ?? null }));
    },
    async insertDraft(d) {
      check("insertDraft");
      const id = randomUUID();
      drafts.set(id, { id, messageId: d.messageId, version: 1, replyType: d.replyType, bodyText: d.bodyText, policyVersion: d.policyVersion, state: "proposed", createdBy: "iris", edited: false });
      return id;
    },
    async supersedeThread(threadId, sentAt) {
      check("supersedeThread");
      const hit = [...messages.values()].filter(
        (m) => m.threadId === threadId && m.direction === "inbound" && m.receivedAt < sentAt && (m.state === "drafted" || (m.state === "escalated" && !m.handledAt)),
      );
      for (const m of hit) {
        Object.assign(m, { escalationReason: "answered_by_charlie", state: "escalated", handledAt: sentAt });
        for (const d of drafts.values()) if (d.messageId === m.id && d.state === "proposed") d.state = "superseded";
        events.push({ kind: "superseded", messageId: m.id, detail: { reason: "answered_by_charlie" } });
      }
      return hit.map((m) => m.id);
    },
    async listPushable(maxAttempts, limit) {
      check("listPushable");
      const pushOf = (id: string) => [...pushes.values()].find((p) => p.messageId === id) ?? null;
      return [...messages.values()]
        .filter((m) => m.direction === "inbound" && (m.state === "drafted" || (m.state === "escalated" && !m.handledAt && m.escalationReason !== "automated")))
        .filter((m) => {
          const p = pushOf(m.id);
          return !p || (p.state !== "pushed" && p.attempts < maxAttempts);
        })
        .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))
        .slice(0, limit)
        .map((m) => {
          const t = [...threads.values()].find((x) => x.id === m.threadId);
          const d = [...drafts.values()].filter((x) => x.messageId === m.id && (x.state === "proposed" || x.state === "approved")).sort((a, b) => b.version - a.version)[0];
          return {
            messageId: m.id, gmailThreadId: t?.gmailThreadId ?? "", receivedAt: m.receivedAt, state: m.state!, escalationReason: m.escalationReason, intent: m.intent ?? null,
            notionStudentIds: t?.notionStudentIds ?? [], notionStudentId: m.notionStudentId ?? null, purgeAt: m.purgeAt,
            draft: d ? { id: d.id, bodyText: d.bodyText } : null, push: pushOf(m.id),
          };
        });
    },
    async savePush(p) {
      check("savePush");
      const old = [...pushes.values()].find((x) => x.messageId === p.messageId);
      const id = old?.id ?? p.id ?? randomUUID();
      pushes.set(id, { ...p, id });
      return id;
    },
    async getPushDay(day) {
      check("getPushDay");
      return pushDays.get(day) ?? null;
    },
    async savePushDay(d) {
      check("savePushDay");
      pushDays.set(d.day, { ...d });
    },
    async listExpiringPushes(cutoff) {
      check("listExpiringPushes");
      return [...pushes.values()]
        .filter((p) => !messages.has(p.messageId) || p.purgeAt < cutoff)
        .map((p) => ({ id: p.id, notionBlockId: p.notionBlockId }));
    },
    async deletePush(id) {
      check("deletePush");
      pushes.delete(id);
    },
    async pushDayCounts(day) {
      check("pushDayCounts");
      const rows = [...pushes.values()].filter((p) => p.day === day);
      return { drafts: rows.filter((p) => p.draftId).length, escalations: rows.filter((p) => !p.draftId).length, failed: rows.filter((p) => p.state === "failed").length };
    },
    async updateMessage(id, patch) {
      check("updateMessage");
      const m = messages.get(id);
      if (m) Object.assign(m, patch);
    },
    async insertEvent(e) {
      check("insertEvent");
      events.push(e);
    },
    async insertRun(r) {
      check("insertRun");
      const id = randomUUID();
      runs.push({ ...r, id });
      return id;
    },
    async purge() {
      check("purge");
      return 0;
    },
  };

  return {
    store,
    settings,
    threads,
    messages,
    aiCalls,
    events,
    runs,
    drafts,
    sends,
    /**
     * An approved draft with its send, as iris.approve_draft_for_send leaves
     * them: the inbound message (from `from`, Message-ID `<in@x>`) in a thread
     * with a subject, the draft approved, the send at attempt 1 with a live
     * lease unless `leaseUntil` says otherwise.
     */
    approved(o: { body?: string; from?: string; subject?: string | null; gmailThreadId?: string; inReplyTo?: string | null; leaseUntil?: number | null; attempts?: number } = {}) {
      const threadId = randomUUID();
      const gmailThreadId = o.gmailThreadId ?? `gt-${threadId.slice(0, 8)}`;
      threads.set(gmailThreadId, {
        id: threadId, gmailThreadId, firstReceivedAt: "2026-10-20T10:00:00Z", lastInboundAt: "2026-10-20T10:00:00Z", purgeAt: "2027-01-01T00:00:00Z", lastOutboundAt: null,
        subject: o.subject === undefined ? "Sam is sick" : o.subject,
      });
      const messageId = randomUUID();
      messages.set(messageId, {
        id: messageId, threadId, gmailMessageId: `in-${messageId.slice(0, 8)}`, rfcMessageId: o.inReplyTo === undefined ? "<in@x>" : o.inReplyTo, direction: "inbound", source: "external",
        fromEmail: o.from ?? "ann@example.com", fromName: null, receivedAt: "2026-10-20T10:00:00Z", bodyText: "Sam is sick", bodyTruncated: false, snippet: "Sam is sick",
        state: "approved", stateChangedAt: null, escalationReason: null, policyVersion: 3, handledAt: null, retryCount: 0, lastError: null, purgeAt: "2027-01-01T00:00:00Z",
      });
      const draftId = randomUUID();
      drafts.set(draftId, { id: draftId, messageId, version: 1, replyType: "cancellation", bodyText: o.body ?? "Hi Ann,\n\nThanks for letting me know.", policyVersion: 3, state: "approved", createdBy: "iris", edited: false });
      const id = randomUUID();
      sends.set(id, {
        id, draftId, messageId, rfcMessageId: `<iris-${id}@apacademy.ca>`, gmailMessageId: null, state: "sending", attempts: o.attempts ?? 1,
        leaseUntil: o.leaseUntil === undefined ? now() + 60_000 : o.leaseUntil, lastError: null, sentAt: null,
      });
      return { sendId: id, draftId, messageId, threadId, gmailThreadId };
    },
    pushes,
    pushDays,
    calls,
    fail,
    setNow: (fn: () => number) => (now = fn),
    byGmailId: (gid: string) => [...messages.values()].find((m) => m.gmailMessageId === gid),
    threadOf: (gid: string) => {
      const m = [...messages.values()].find((x) => x.gmailMessageId === gid);
      return m ? [...threads.values()].find((t) => t.id === m.threadId) : undefined;
    },
  };
}
