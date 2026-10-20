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
  lastPollAt: string | null;
  lastPollResult: PollResult | null;
  lastError: string | null;
};

export type MessageState = "received" | "matched" | "escalated" | "failed";

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

export type MessagePatch = Partial<Pick<MessageInsert, "bodyText" | "bodyTruncated" | "state" | "stateChangedAt" | "escalationReason" | "handledAt" | "retryCount" | "lastError">>;

export type RetryableMessage = { id: string; gmailMessageId: string; threadId: string; retryCount: number; lastError: string | null };

export type RunRecord = {
  startedAt: string;
  finishedAt: string;
  result: "ok" | "failed";
  seen: number;
  stored: number;
  matched: number;
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
  updateMessage(id: string, patch: MessagePatch): Promise<void>;
  /** detail holds ids, states and reason codes only. */
  insertEvent(e: { kind: string; messageId: string | null; detail: Record<string, string | number | boolean | null> }): Promise<void>;
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
