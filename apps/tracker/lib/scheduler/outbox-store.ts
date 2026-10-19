/**
 * The Notion export outbox (REQ-35, tracker ADR 0053): one row per export a
 * class write still owes, written by a database trigger in the same
 * transaction as the write. The app claims rows, delivers them from current
 * state, and records how each attempt ended. Rows are never deleted.
 */
export type OutboxKind = "summary" | "daily_task";
export type OutboxStatus = "pending" | "running" | "done" | "failed" | "uncertain" | "superseded";
export type OutboxRow = {
  id: string;
  kind: OutboxKind;
  /** The Notion student page for `summary`, the org for `daily_task`. */
  targetId: string;
  dedupeKey: string;
  status: OutboxStatus;
  attempts: number;
  nextAttemptAt: string;
  lastError: string | null;
  requestedAt: string;
};
/**
 * How one delivery ended. `done` also supersedes older failed or uncertain rows
 * for the same target. `pending` while a newer pending row exists for the
 * target supersedes this row by that one instead (one pending row per target).
 */
export type OutboxFinish = {
  status: "done" | "pending" | "failed" | "uncertain";
  attempts?: number;
  nextAttemptAt?: string;
  lastError?: string | null;
  payloadHash?: string | null;
};
export type OutboxRetry = { id: string; status: "pending"; supersededBy: string | null } | "not_retryable" | "not_found";

export const summaryKey = (studentId: string) => `summary:${studentId}`;
export const dailyTaskKey = (orgId: string) => `daily_task:${orgId}`;

/** Bound to one org. The real one (lib/data/outbox.ts) runs as the owner (RLS) or, for the hourly run, as the service role. */
export type OutboxStore = {
  /** Sets due rows running with a lease. `ids` limits the claim to those rows. */
  claim(ids: string[] | null, limit: number, leaseSeconds: number): Promise<OutboxRow[]>;
  finish(row: OutboxRow, patch: OutboxFinish): Promise<void>;
  /** The pending rows for these keys: what a save just enqueued. */
  findPending(dedupeKeys: string[]): Promise<Pick<OutboxRow, "id" | "kind" | "targetId">[]>;
  /** Failed, uncertain, and pending or running rows requested before `staleBefore`. */
  listOpen(staleBefore: string): Promise<OutboxRow[]>;
  retry(id: string): Promise<OutboxRetry>;
  /** "Sync all": one pending summary row per adopted student given; returns the row ids. */
  enqueueSummaries(studentIds: string[]): Promise<string[]>;
};
