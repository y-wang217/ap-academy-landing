import { randomUUID } from "node:crypto";
import type { AiCallRecord, EvalResultInsert, IrisSettings, IrisStore, MessageInsert, MessagePatch, PushDay, PushRecord, RunRecord, StoredThread, ThreadPatch } from "./store";

/** An in-memory IrisStore for the intake and handler tests. `fail` makes the named method throw. */
export function fakeIrisStore(init: Partial<IrisSettings> = {}) {
  const settings: IrisSettings & { leaseUntil: number | null } = {
    id: randomUUID(), orgId: "10000000-0000-0000-0000-00000000aaaa", paused: false, retentionDays: 90, confidenceThreshold: 0.85,
    lastPollAt: null, lastPollResult: null, lastError: null, leaseUntil: null, ...init,
  };
  const threads = new Map<string, StoredThread & ThreadPatch & { lastOutboundAt: string | null }>();
  const messages = new Map<string, MessageInsert & Partial<MessagePatch> & { id: string }>();
  const aiCalls: AiCallRecord[] = [];
  type FakeEvent = { kind: string; messageId: string | null; draftId?: string | null; detail: Record<string, unknown> };
  const events: FakeEvent[] = [];
  // The identity id, time and actor, kept apart so the events read as the tests expect.
  const eventMeta = new WeakMap<FakeEvent, { id: number; at: string; actor: string }>();
  let eventSeq = 0;
  const pushEvent = (e: FakeEvent, actor = "iris") => {
    const row = { ...e };
    const meta = { id: ++eventSeq, at: new Date(now()).toISOString(), actor };
    eventMeta.set(row, meta);
    events.push(row);
    return meta;
  };
  const idOf = (e: FakeEvent) => eventMeta.get(e)!.id;
  /** REQ-45: owner labels and the run's eval results. */
  const labels = new Map<string, { goldIntent: string | null; goldReplyType: string | null; goldEscalate: boolean | null }>();
  const evalResults: (EvalResultInsert & { id: string })[] = [];
  const FINISHED: Record<string, string> = { eval_import_requested: "eval_import_finished", eval_run_requested: "eval_run_finished" };
  type FakeDraft = { id: string; messageId: string; version: number; replyType: string; bodyText: string; policyVersion: number; state: string; createdBy: "iris" | "owner"; edited: boolean };
  const drafts = new Map<string, FakeDraft>();
  const pushes = new Map<string, PushRecord & { id: string }>();
  const pushDays = new Map<string, PushDay>();
  const runs: (RunRecord & { id: string })[] = [];
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

  const store: IrisStore = {
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
        .filter((m) => m.state === "classified" || (m.state === "escalated" && (m.escalationReason === "escalate_only" || m.escalationReason === "schedule_no_show") && m.intent === "no_show" && !m.handledAt))
        .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))
        .slice(0, limit)
        .map((m) => ({ id: m.id, threadId: m.threadId, receivedAt: m.receivedAt, bodyText: m.bodyText, retryCount: m.retryCount, state: m.state as "classified" | "escalated", intent: m.intent ?? null, notionStudentId: m.notionStudentId ?? null, escalationReason: m.escalationReason ?? null, flags: m.flags ?? [] }));
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
        pushEvent({ kind: "superseded", messageId: m.id, detail: { reason: "answered_by_charlie" } });
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
      pushEvent(e);
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
    async pendingRequest(kind) {
      check("pendingRequest");
      const newest = events.filter((e) => e.kind === kind).at(-1);
      if (!newest) return null;
      const meta = eventMeta.get(newest)!;
      if (events.some((e) => e.kind === FINISHED[kind] && e.detail.request_id === meta.id)) return null;
      return { id: meta.id, at: meta.at, detail: newest.detail };
    },
    async requestBatches(requestId) {
      check("requestBatches");
      return events
        .filter((e) => e.kind === "eval_import_batch" && e.detail.request_id === requestId)
        .map((e) => ({
          storedInbound: Number(e.detail.stored_inbound ?? 0), storedReplies: Number(e.detail.stored_replies ?? 0),
          skipped: (e.detail.skipped as string[] | undefined) ?? [], capped: e.detail.capped === true,
        }));
    },
    async storedThreadIds(gmailThreadIds) {
      check("storedThreadIds");
      const out = new Map<string, string>();
      for (const g of gmailThreadIds) {
        const t = threads.get(g);
        if (t) out.set(g, t.id);
      }
      return out;
    },
    async listEvalPending(requestId, limit) {
      check("listEvalPending");
      const done = new Set(evalResults.filter((r) => r.requestEventId === requestId).map((r) => r.messageId));
      return [...messages.values()]
        .filter((m) => m.escalationReason === "history_import" && !done.has(m.id))
        .filter((m) => {
          const l = labels.get(m.id);
          return l && l.goldIntent !== null && l.goldEscalate !== null;
        })
        .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))
        .slice(0, limit)
        .map((m) => ({ id: m.id, threadId: m.threadId, receivedAt: m.receivedAt, bodyText: m.bodyText }));
    },
    async insertEvalResult(r) {
      check("insertEvalResult");
      if (evalResults.some((x) => x.requestEventId === r.requestEventId && x.messageId === r.messageId)) return;
      evalResults.push({ ...r, id: randomUUID() });
    },
    async evalResultCounts(requestId) {
      check("evalResultCounts");
      const rows = evalResults.filter((r) => r.requestEventId === requestId);
      return { ok: rows.filter((r) => r.outcome === "ok").length, error: rows.filter((r) => r.outcome === "error").length };
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
    pushes,
    pushDays,
    calls,
    fail,
    labels,
    evalResults,
    eventId: idOf,
    /** An owner request event, as the eval routes insert it (REQ-45). */
    request: (kind: "eval_import_requested" | "eval_run_requested", detail: Record<string, unknown> = {}) =>
      pushEvent({ kind, messageId: null, detail }, "a0000000-0000-0000-0000-000000000001").id,
    setNow: (fn: () => number) => (now = fn),
    byGmailId: (gid: string) => [...messages.values()].find((m) => m.gmailMessageId === gid),
    threadOf: (gid: string) => {
      const m = [...messages.values()].find((x) => x.gmailMessageId === gid);
      return m ? [...threads.values()].find((t) => t.id === m.threadId) : undefined;
    },
  };
}
