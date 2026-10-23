import { randomUUID } from "node:crypto";
import { NEVER_AUTO_SEND } from "./policy";
import type { AiCallRecord, EvalResultInsert, IrisSettings, IrisStore, MessageInsert, MessagePatch, PushDay, PushRecord, RunRecord, StoredThread, ThreadPatch } from "./store";

/** An in-memory IrisStore for the intake and handler tests. `fail` makes the named method throw. */
export function fakeIrisStore(init: Partial<IrisSettings> = {}) {
  const settings: IrisSettings & { leaseUntil: number | null } = {
    id: randomUUID(), orgId: "10000000-0000-0000-0000-00000000aaaa", paused: false, retentionDays: 90, confidenceThreshold: 0.85,
    sendingEnabled: false, quietStart: "21:00", quietEnd: "07:00", lastPollAt: null, lastPollResult: null, lastError: null, leaseUntil: null, ...init,
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
  type FakeDraft = {
    id: string; messageId: string; version: number; replyType: string; bodyText: string; policyVersion: number; state: string; createdBy: "iris" | "owner"; edited: boolean;
    approvalMode?: "manual" | "auto" | null; sendAfter?: string | null;
  };
  /** REQ-49: iris.reply_types, by type. The fake mirrors the SQL switch rules (0031). */
  type FakeReplyType = { autoSendEnabled: boolean; autoSendEligible: boolean; uneditedStreak: number; streakPolicyVersion: number | null; disabledReason: string | null };
  const replyTypes = new Map<string, FakeReplyType>();
  const switchOff = (type: string, reason: string, opts: { resetStreak: boolean; messageId?: string | null; draftId?: string | null }) => {
    const rt = replyTypes.get(type);
    if (opts.resetStreak && rt) Object.assign(rt, { uneditedStreak: 0, autoSendEligible: false });
    if (!rt?.autoSendEnabled) return;
    Object.assign(rt, { autoSendEnabled: false, disabledReason: reason });
    pushEvent({ kind: "auto_send_disabled", messageId: opts.messageId ?? null, draftId: opts.draftId ?? null, detail: { reply_type: type, reason } });
  };
  const drafts = new Map<string, FakeDraft>();
  const pushes = new Map<string, PushRecord & { id: string }>();
  const pushDays = new Map<string, PushDay>();
  const runs: (RunRecord & { id: string })[] = [];
  type FakeSend = {
    id: string; draftId: string; messageId: string; rfcMessageId: string; gmailMessageId: string | null; state: "sending" | "sent" | "failed"; attempts: number;
    leaseUntil: number | null; lastError: string | null; sentAt: string | null; mode: "manual" | "auto";
  };
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
    sendingEnabled: settings.sendingEnabled, quietStart: settings.quietStart, quietEnd: settings.quietEnd,
    lastPollAt: settings.lastPollAt, lastPollResult: settings.lastPollResult, lastError: settings.lastError,
  });

  const failSend = (x: FakeSend, error: string) => {
    Object.assign(x, { state: "failed", leaseUntil: null, lastError: error.slice(0, 300) });
    const d = drafts.get(x.draftId);
    if (d) d.state = "failed";
    const m = messages.get(x.messageId);
    if (m) Object.assign(m, { state: "failed", lastError: error.slice(0, 300) });
    events.push({ kind: "send_failed", messageId: x.messageId, draftId: x.draftId, detail: { send_id: x.id, attempts: x.attempts } });
    // REQ-49: a failed auto send switches its type off and keeps the streak.
    if (x.mode === "auto" && d) switchOff(d.replyType, "send_failed", { resetStreak: false, messageId: x.messageId, draftId: x.draftId });
  };

  const store: IrisStore = {
    async resetForPolicy(version) {
      check("resetForPolicy");
      let n = 0;
      for (const [type, rt] of replyTypes) {
        if (rt.streakPolicyVersion === null || rt.streakPolicyVersion === version) continue;
        const wasOn = rt.autoSendEnabled;
        Object.assign(rt, { autoSendEnabled: false, autoSendEligible: false, uneditedStreak: 0, streakPolicyVersion: version });
        if (wasOn) {
          rt.disabledReason = "policy_changed";
          pushEvent({ kind: "auto_send_disabled", messageId: null, detail: { reply_type: type, reason: "policy_changed", policy_version: version } });
        }
        n += 1;
      }
      return n;
    },
    async autoSendCandidates(draftIds) {
      check("autoSendCandidates");
      return draftIds.flatMap((id) => {
        const d = drafts.get(id);
        if (!d) return [];
        const m = messages.get(d.messageId)!;
        const t = [...threads.values()].find((tt) => tt.id === m.threadId);
        const rt = replyTypes.get(d.replyType);
        return [{
          draftId: d.id, messageId: d.messageId, replyType: d.replyType, version: d.version, createdBy: d.createdBy, edited: d.edited, policyVersion: d.policyVersion,
          message: { state: m.state, intent: m.intent ?? null, flags: m.flags ?? [], confidence: m.confidence ?? null, notionStudentId: m.notionStudentId ?? null, notionStudentIds: t?.notionStudentIds ?? [] },
          typeSwitch: rt ? { autoSendEnabled: rt.autoSendEnabled, streakPolicyVersion: rt.streakPolicyVersion } : null,
        }];
      });
    },
    async autoApprove(draftId, sendAfter) {
      check("autoApprove");
      const d = drafts.get(draftId);
      if (!d) return { result: "skipped", reason: "not_found" };
      const m = messages.get(d.messageId)!;
      const rt = replyTypes.get(d.replyType);
      const reason =
        [...sends.values()].some((x) => x.draftId === d.id) || d.state !== "proposed" ? "conflict"
        : settings.paused ? "paused"
        : !settings.sendingEnabled ? "sending_disabled"
        : (NEVER_AUTO_SEND as readonly string[]).includes(d.replyType) ? "never_auto_send"
        : !rt?.autoSendEnabled ? "type_disabled"
        : d.version !== 1 || d.createdBy !== "iris" || d.edited ? "edited"
        : d.policyVersion !== rt.streakPolicyVersion ? "policy_version"
        : m.state !== "drafted" ? "needs_charlie"
        : null;
      if (reason) return { result: "skipped", reason };
      Object.assign(d, { state: "approved", approvalMode: "auto", sendAfter });
      m.state = "approved";
      pushEvent({ kind: "auto_approved", messageId: m.id, draftId: d.id, detail: { reply_type: d.replyType, send_after: sendAfter } }, "gate");
      const id = randomUUID();
      sends.set(id, {
        id, draftId: d.id, messageId: m.id, rfcMessageId: `<iris-${id}@apacademy.ca>`, gmailMessageId: null, state: "sending", attempts: 0,
        leaseUntil: sendAfter === null ? null : Date.parse(sendAfter), lastError: null, sentAt: null, mode: "auto",
      });
      return { result: "ok", sendId: id };
    },
    async sendContext(sendId) {
      check("sendContext");
      const x = sends.get(sendId);
      if (!x) return null;
      const m = messages.get(x.messageId)!;
      const t = [...threads.values()].find((tt) => tt.id === m.threadId);
      return {
        sendId: x.id, state: x.state, attempts: x.attempts, rfcMessageId: x.rfcMessageId, draftText: drafts.get(x.draftId)!.bodyText, to: m.fromEmail,
        subject: t?.subject ?? null, inReplyTo: m.rfcMessageId, gmailThreadId: t?.gmailThreadId ?? null, mode: x.mode,
      };
    },
    async claimSend(sendId, leaseSeconds, maxAttempts) {
      check("claimSend");
      const x = sends.get(sendId);
      if (!x) return "not_found";
      if (x.state !== "sending") return "done";
      if (settings.paused) return "paused";
      if (x.mode === "auto" && x.attempts === 0) {
        const d = drafts.get(x.draftId)!;
        if (!settings.sendingEnabled || !replyTypes.get(d.replyType)?.autoSendEnabled) {
          sends.delete(x.id);
          Object.assign(d, { state: "proposed", approvalMode: null, sendAfter: null });
          const m = messages.get(x.messageId);
          if (m) m.state = "drafted";
          pushEvent({ kind: "auto_send_withdrawn", messageId: x.messageId, draftId: x.draftId, detail: { send_id: x.id, reply_type: d.replyType } });
          return "withdrawn";
        }
      }
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
    sends,
    /**
     * An approved draft with its send, as iris.approve_draft_for_send leaves
     * them: the inbound message (from `from`, Message-ID `<in@x>`) in a thread
     * with a subject, the draft approved, the send at attempt 1 with a live
     * lease unless `leaseUntil` says otherwise.
     */
    approved(o: { body?: string; from?: string; subject?: string | null; gmailThreadId?: string; inReplyTo?: string | null; leaseUntil?: number | null; attempts?: number; mode?: "manual" | "auto" } = {}) {
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
        leaseUntil: o.leaseUntil === undefined ? now() + 60_000 : o.leaseUntil, lastError: null, sentAt: null, mode: o.mode ?? "manual",
      });
      return { sendId: id, draftId, messageId, threadId, gmailThreadId };
    },
    replyTypes,
    /** REQ-49: a reply type row, switched on with a full streak at `policyVersion` unless the patch says otherwise. */
    replyType(type: string, patch: Partial<FakeReplyType> = {}, policyVersion = 5) {
      replyTypes.set(type, { autoSendEnabled: true, autoSendEligible: true, uneditedStreak: 20, streakPolicyVersion: policyVersion, disabledReason: null, ...patch });
    },
    /**
     * A drafted inbound message with its proposed version-1 Iris draft, as
     * runDraft leaves it: one intent, confident, one child, no flags.
     */
    drafted(o: { replyType?: string; intent?: string | null; confidence?: number | null; flags?: string[]; studentId?: string | null; policyVersion?: number; state?: "drafted" | "escalated" } = {}) {
      const threadId = randomUUID();
      const gmailThreadId = `gt-${threadId.slice(0, 8)}`;
      threads.set(gmailThreadId, {
        id: threadId, gmailThreadId, firstReceivedAt: "2026-10-20T10:00:00Z", lastInboundAt: "2026-10-20T10:00:00Z", purgeAt: "2027-01-01T00:00:00Z", lastOutboundAt: null,
        subject: "Sam is sick", notionStudentIds: o.studentId === null ? [] : [o.studentId ?? "11111111-1111-4111-8111-111111111111"],
      });
      const messageId = randomUUID();
      messages.set(messageId, {
        id: messageId, threadId, gmailMessageId: `in-${messageId.slice(0, 8)}`, rfcMessageId: "<in@x>", direction: "inbound", source: "external",
        fromEmail: "ann@example.com", fromName: null, receivedAt: "2026-10-20T10:00:00Z", bodyText: "Sam is sick", bodyTruncated: false, snippet: "Sam is sick",
        state: o.state ?? "drafted", stateChangedAt: null, escalationReason: null, policyVersion: 5, handledAt: null, retryCount: 0, lastError: null, purgeAt: "2027-01-01T00:00:00Z",
        intent: o.intent === undefined ? "cancellation" : o.intent, confidence: o.confidence === undefined ? 0.95 : o.confidence, flags: o.flags ?? [],
        notionStudentId: o.studentId === undefined ? "11111111-1111-4111-8111-111111111111" : o.studentId,
      });
      const draftId = randomUUID();
      drafts.set(draftId, {
        id: draftId, messageId, version: 1, replyType: o.replyType ?? "late_cancel", bodyText: "Hi Ann,\n\nThanks for letting me know.", policyVersion: o.policyVersion ?? 5,
        state: "proposed", createdBy: "iris", edited: false,
      });
      return { messageId, draftId };
    },
    /** REQ-49: the owner's edit or reject of a draft, as iris.count_review now treats an enabled type. */
    review(draftId: string, kind: "edit" | "reject") {
      const d = drafts.get(draftId)!;
      d.state = kind === "edit" ? "superseded" : "rejected";
      switchOff(d.replyType, "edited_after_enable", { resetStreak: true, messageId: d.messageId, draftId: d.id });
    },
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
