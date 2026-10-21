/**
 * The Iris storage port (REQ-42). lib/data/iris.ts implements it over the
 * service client for the bearer-protected run; store.fake.ts implements it in
 * memory for the tests. Parent data passes through here only for the `iris`
 * schema, never for an event's detail.
 */
export type PollResult = "ok" | "busy" | "failed" | "paused";

export type IrisSettings = {
  id: string;
  orgId: string;
  paused: boolean;
  retentionDays: number;
  /** Under this confidence a classification escalates (REQ-43). */
  confidenceThreshold: number;
  lastPollAt: string | null;
  lastPollResult: PollResult | null;
  lastError: string | null;
};

export type MessageState = "received" | "matched" | "classified" | "escalated" | "failed";

export type StoredThread = {
  id: string;
  gmailThreadId: string;
  firstReceivedAt: string | null;
  lastInboundAt: string | null;
  purgeAt: string;
};

/** What one inbound message says about its thread. */
export type ThreadInput = {
  gmailThreadId: string;
  matchState: "matched" | "unknown";
  notionStudentIds: string[];
  parentEmail: string | null;
  subject: string | null;
  receivedAt: string;
  purgeAt: string;
};

/** The columns a thread upsert writes. */
export type ThreadPatch = {
  matchState?: "matched" | "unknown";
  notionStudentIds?: string[];
  parentEmail?: string | null;
  subject?: string | null;
  firstReceivedAt: string;
  lastInboundAt: string;
  purgeAt: string;
};

export type MessageInsert = {
  threadId: string;
  gmailMessageId: string;
  rfcMessageId: string | null;
  direction: "inbound" | "outbound";
  source: "external" | "charlie_manual";
  fromEmail: string;
  fromName: string | null;
  receivedAt: string;
  bodyText: string | null;
  bodyTruncated: boolean;
  snippet: string | null;
  state: MessageState | null;
  stateChangedAt: string | null;
  escalationReason: string | null;
  policyVersion: number | null;
  handledAt: string | null;
  retryCount: number;
  lastError: string | null;
  purgeAt: string;
};

export type MessagePatch = Partial<
  Pick<MessageInsert, "bodyText" | "bodyTruncated" | "state" | "stateChangedAt" | "escalationReason" | "policyVersion" | "handledAt" | "retryCount" | "lastError"> & {
    intent: string | null;
    confidence: number | null;
    flags: string[];
  }
>;

export type RetryableMessage = { id: string; gmailMessageId: string; threadId: string; retryCount: number; lastError: string | null };

/** A matched inbound message waiting for the classifier (REQ-43). */
export type ClassifiableMessage = { id: string; threadId: string; receivedAt: string; bodyText: string | null; retryCount: number };

/** One earlier row of a thread, as the classifier's history line is built from it. */
export type ThreadHistoryRow = { receivedAt: string; direction: "inbound" | "outbound"; intent: string | null; snippet: string | null };

/** One iris.ai_calls row: tokens and outcome, never prompt or answer text. */
export type AiCallRecord = {
  messageId: string | null;
  purpose: "classify";
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  policyVersion: number;
  outcome: "ok" | "refused" | "error";
  error: string | null;
};

/** Event detail: ids, states, reason codes and code lists only. */
export type EventDetail = Record<string, string | number | boolean | null | string[]>;

export type RunRecord = {
  startedAt: string;
  finishedAt: string;
  result: "ok" | "failed";
  seen: number;
  stored: number;
  matched: number;
  classified: number;
  escalated: number;
  skipped: number;
  failed: number;
  purged: number;
  error: string | null;
};

export interface IrisStore {
  getSettings(): Promise<IrisSettings | null>;
  /** iris.claim_poll: the row to the first caller, null while another run holds the lease. */
  claimPoll(leaseSeconds: number): Promise<IrisSettings | null>;
  /** Writes the last-run columns and clears the lease. */
  releasePoll(patch: { lastPollAt: string; lastPollResult: PollResult; lastError: string | null }): Promise<void>;
  /** The subset of these Gmail message ids already stored. */
  knownGmailIds(ids: string[]): Promise<Set<string>>;
  findThread(gmailThreadId: string): Promise<StoredThread | null>;
  /** Inserts the thread, or updates the stored one, and returns it. */
  saveThread(gmailThreadId: string, patch: ThreadPatch): Promise<StoredThread>;
  setLastOutbound(threadId: string, at: string): Promise<void>;
  /** `on conflict (org_id, gmail_message_id) do nothing`: inserted is false for a repeat. */
  insertMessage(m: MessageInsert): Promise<{ inserted: boolean; id: string | null }>;
  /** Inbound messages at `received` with retry_count below the cap, oldest first. */
  listRetryable(maxRetries: number, limit: number): Promise<RetryableMessage[]>;
  /** Inbound messages at `matched` with retry_count below the cap, oldest first (REQ-43). */
  listClassifiable(maxRetries: number, limit: number): Promise<ClassifiableMessage[]>;
  /** The thread's student ids, and up to `limit` of its messages received before `before`, oldest first. */
  threadContext(threadId: string, before: string, limit: number): Promise<{ studentIds: string[]; history: ThreadHistoryRow[] }>;
  insertAiCall(c: AiCallRecord): Promise<void>;
  updateMessage(id: string, patch: MessagePatch): Promise<void>;
  /** detail holds ids, states and reason codes only. */
  insertEvent(e: { kind: string; messageId: string | null; detail: EventDetail }): Promise<void>;
  insertRun(r: RunRecord): Promise<string>;
  /** iris.purge_expired: the number of rows deleted. */
  purge(): Promise<number>;
}

/**
 * How one inbound message changes its thread: the time span widens, the
 * purge date follows the latest message, and the match fields follow the
 * latest inbound message (REQ-42 design, Risks).
 */
export function mergeThread(existing: StoredThread | null, input: ThreadInput): ThreadPatch {
  const first = existing?.firstReceivedAt && existing.firstReceivedAt < input.receivedAt ? existing.firstReceivedAt : input.receivedAt;
  const latest = !existing?.lastInboundAt || input.receivedAt >= existing.lastInboundAt;
  const purgeAt = existing && existing.purgeAt > input.purgeAt ? existing.purgeAt : input.purgeAt;
  const base = { firstReceivedAt: first, lastInboundAt: latest ? input.receivedAt : existing!.lastInboundAt!, purgeAt };
  if (!latest) return base;
  return { ...base, matchState: input.matchState, notionStudentIds: input.notionStudentIds, parentEmail: input.parentEmail, subject: input.subject };
}
