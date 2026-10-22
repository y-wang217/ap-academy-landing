import { randomUUID } from "node:crypto";
import type { AiCallRecord, IrisSettings, IrisStore, MessageInsert, MessagePatch, RunRecord, StoredThread, ThreadPatch } from "./store";

/** An in-memory IrisStore for the intake and handler tests. `fail` makes the named method throw. */
export function fakeIrisStore(init: Partial<IrisSettings> = {}) {
  const settings: IrisSettings & { leaseUntil: number | null } = {
    id: randomUUID(), orgId: "10000000-0000-0000-0000-00000000aaaa", paused: false, retentionDays: 90, confidenceThreshold: 0.85,
    lastPollAt: null, lastPollResult: null, lastError: null, leaseUntil: null, ...init,
  };
  const threads = new Map<string, StoredThread & ThreadPatch & { lastOutboundAt: string | null }>();
  const messages = new Map<string, MessageInsert & Partial<MessagePatch> & { id: string }>();
  const aiCalls: AiCallRecord[] = [];
  const events: { kind: string; messageId: string | null; detail: Record<string, unknown> }[] = [];
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
