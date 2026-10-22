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

export type MessageState = "received" | "matched" | "classified" | "escalated" | "drafted" | "approved" | "sent" | "failed";

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
    /** The chosen child, a Notion Students & Parents page id (REQ-44). */
    notionStudentId: string | null;
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
  purpose: "classify" | "draft";
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
  drafted: number;
  escalated: number;
  skipped: number;
  failed: number;
  purged: number;
  error: string | null;
};

/** A message waiting for a draft (REQ-44): classified, or an unhandled no-show escalation, with no draft yet. */
export type DraftableMessage = {
  id: string;
  threadId: string;
  receivedAt: string;
  bodyText: string | null;
  retryCount: number;
  state: "classified" | "escalated";
  intent: string | null;
  notionStudentId: string | null;
};

/** Version 1 of an Iris draft: proposed, created_by iris, edited false. The body has no signature. */
export type DraftInsert = { messageId: string; replyType: string; bodyText: string; policyVersion: number };

/** One row of iris.pushes (REQ-44): ids and codes only. */
export type PushRecord = {
  id: string | null;
  messageId: string;
  draftId: string | null;
  day: string;
  notionBlockId: string | null;
  commentDone: boolean;
  state: "pending" | "pushed" | "failed";
  attempts: number;
  lastError: string | null;
  purgeAt: string;
};

/** What the phone backup needs about one message. No body: the parent's text never goes to Notion. */
export type PushCandidate = {
  messageId: string;
  gmailThreadId: string;
  receivedAt: string;
  state: MessageState;
  escalationReason: string | null;
  intent: string | null;
  notionStudentIds: string[];
  notionStudentId: string | null;
  purgeAt: string;
  /** The latest proposed or approved draft, if any. */
  draft: { id: string; bodyText: string } | null;
  push: PushRecord | null;
};

export type PushDay = { day: string; workPageId: string | null; logEntryId: string | null };

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
  /** Messages waiting for a draft with retry_count below the cap, oldest first (REQ-44). */
  listDraftable(maxRetries: number, limit: number): Promise<DraftableMessage[]>;
  insertDraft(d: DraftInsert): Promise<string>;
  /**
   * Charlie answered in Gmail at `sentAt`: every inbound message of the thread
   * received before it and still drafted, or escalated and unhandled, gets
   * reason answered_by_charlie and handled_at; their proposed drafts become
   * superseded; one superseded event each. Returns the message ids.
   */
  supersedeThread(threadId: string, sentAt: string): Promise<string[]>;
  /** Drafted, or escalated and unhandled (not automated), with no push or a failed one under the cap, oldest first. */
  listPushable(maxAttempts: number, limit: number): Promise<PushCandidate[]>;
  /** Inserts or updates the push row for its message; returns the row id. */
  savePush(p: PushRecord): Promise<string>;
  getPushDay(day: string): Promise<PushDay | null>;
  savePushDay(d: PushDay): Promise<void>;
  /** Push rows whose message is gone or purges before `cutoff`, with their Notion block if any. */
  listExpiringPushes(cutoff: string): Promise<{ id: string; notionBlockId: string | null }[]>;
  deletePush(id: string): Promise<void>;
  /** For the day's Work Log line. */
  pushDayCounts(day: string): Promise<{ drafts: number; escalations: number; failed: number }>;
  updateMessage(id: string, patch: MessagePatch): Promise<void>;
  /** detail holds ids, states and reason codes only. */
  insertEvent(e: { kind: string; messageId: string | null; draftId?: string | null; detail: EventDetail }): Promise<void>;
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
