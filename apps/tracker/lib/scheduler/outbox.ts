import { ensureDailyTaskDetail, type DailyTaskDeps, type DailyTaskResult } from "./daily-task";
import { isRateLimited, isRetryable, retryAfterOf } from "./notion-errors";
import type { OutboxFinish, OutboxKind, OutboxRow, OutboxStore } from "./outbox-store";
import { syncStudentSummaryDetail, type SyncDeps, type SyncResult } from "./summary-sync";

/**
 * Delivers the Notion exports the outbox says are owed (REQ-35, tracker ADR
 * 0053). Every delivery renders from current state, so an older delivery can
 * never carry stale text, and the summary write reads Notion first, so a retry
 * after a write that landed writes nothing. Injected ports only.
 */
export const LEASE_SECONDS = 60;
export const MAX_ATTEMPTS = 8;
/** Notion's documented average is three requests a second. */
export const SPACING_MS = 350;
export const DRAIN_LIMIT = 10;
export const DRAIN_BUDGET_MS = 20_000;
const BASE_DELAY_S = 30;
const MAX_DELAY_S = 3600;
const BUSY_DELAY_S = 30;
/** A pending or running row older than this is shown as stale. */
export const STALE_MINUTES = 10;
const MAX_ERROR = 300;

/** 30 s after the first failed attempt, doubling to 1 h; Notion's Retry-After when that is longer. */
export function nextAttemptAt(attempts: number, now: Date, retryAfterSeconds?: number): string {
  const backoff = Math.min(BASE_DELAY_S * 2 ** Math.max(attempts - 1, 0), MAX_DELAY_S);
  const wait = Math.max(backoff, retryAfterSeconds ?? 0);
  return new Date(now.getTime() + wait * 1000).toISOString();
}

export type DrainDeps = {
  outbox: OutboxStore;
  /** Absent when Notion's Students & Parents database is not wired in: summary rows are closed with nothing to send. */
  summary?: SyncDeps;
  /** Absent when Notion's Work database is not wired in: daily-task rows are closed with nothing to send. */
  dailyTask?: DailyTaskDeps;
  today: () => string;
  now: () => Date;
  sleep: (ms: number) => Promise<void>;
};
export type Delivered = {
  id: string;
  kind: OutboxKind;
  targetId: string;
  status: OutboxFinish["status"];
  /** What the delivery itself reported, for the save response. */
  result: SyncResult | DailyTaskResult | "not_configured";
};

const errorText = (e: unknown, fallback: string) =>
  (e instanceof Error && e.name === "NotionError" ? e.message : fallback).slice(0, MAX_ERROR);

/** Maps one delivery attempt to the row's next state. */
function afterFailure(row: OutboxRow, error: unknown, now: Date, fallback: string): OutboxFinish {
  const lastError = errorText(error, fallback);
  if (!isRetryable(error) || row.attempts >= MAX_ATTEMPTS) return { status: "failed", lastError };
  return { status: "pending", lastError, nextAttemptAt: nextAttemptAt(row.attempts, now, retryAfterOf(error)) };
}

const FALLBACK: Record<OutboxKind, string> = { summary: "The Weekly Schedule could not be sent", daily_task: "Today's task could not be updated" };

type Delivery = { finish: OutboxFinish; result: Delivered["result"]; error?: unknown };

/** A delivery that throws (a storage call outside the port's own guards) is a failed attempt, never a thrown drain. */
async function deliverSafely(deps: DrainDeps, row: OutboxRow, ownerRetry: boolean): Promise<Delivery> {
  try {
    return await deliver(deps, row, ownerRetry);
  } catch (e) {
    return { finish: afterFailure(row, e, deps.now(), FALLBACK[row.kind]), result: "failed", error: e };
  }
}

async function deliver(deps: DrainDeps, row: OutboxRow, ownerRetry: boolean): Promise<Delivery> {
  const now = deps.now();
  if (row.kind === "summary") {
    if (!deps.summary) return { finish: { status: "done", lastError: null }, result: "not_configured" };
    const r = await syncStudentSummaryDetail(deps.summary, row.targetId);
    if (r.result === "failed") return { finish: afterFailure(row, r.error, now, FALLBACK.summary), result: r.result, error: r.error };
    return { finish: { status: "done", lastError: null, payloadHash: r.payloadHash }, result: r.result };
  }
  if (!deps.dailyTask) return { finish: { status: "done", lastError: null }, result: "not_configured" };
  const r = await ensureDailyTaskDetail(deps.dailyTask, { date: deps.today(), mode: "refresh_only", ownerRetry });
  switch (r.result) {
    case "busy":
      // Another run holds today's task: not an attempt, try again shortly.
      return {
        finish: { status: "pending", attempts: Math.max(row.attempts - 1, 0), nextAttemptAt: new Date(now.getTime() + BUSY_DELAY_S * 1000).toISOString() },
        result: r.result,
      };
    case "uncertain":
      return { finish: { status: "uncertain", lastError: "Notion may have saved this. Check today's task, then retry." }, result: r.result, error: r.error };
    case "failed":
      return { finish: afterFailure(row, r.error, now, FALLBACK.daily_task), result: r.result, error: r.error };
    default:
      return { finish: { status: "done", lastError: null }, result: r.result };
  }
}

/**
 * Claims and delivers due rows one at a time: at least SPACING_MS apart, at
 * most `limit` rows or `budgetMs`, and stops at the first 429. `ids` limits it
 * to those rows (a save's own exports); without it any due row of the org.
 * `ownerRetry` is the owner's Retry: it may re-send a daily task that is
 * uncertain, after they checked Notion (AC7). Never throws: a storage error
 * ends the drain early and the rows stay owed.
 */
export async function drainOutbox(deps: DrainDeps, opts: { ids?: string[]; limit?: number; budgetMs?: number; ownerRetry?: boolean } = {}): Promise<Delivered[]> {
  const limit = opts.limit ?? DRAIN_LIMIT;
  const budget = opts.budgetMs ?? DRAIN_BUDGET_MS;
  const ids = opts.ids ?? null;
  if (ids && ids.length === 0) return [];
  const started = deps.now().getTime();
  const out: Delivered[] = [];
  for (let i = 0; i < limit; i++) {
    if (deps.now().getTime() - started >= budget) break;
    let row: OutboxRow | undefined;
    try {
      [row] = await deps.outbox.claim(ids, 1, LEASE_SECONDS);
    } catch {
      break;
    }
    if (!row) break;
    if (i > 0) await deps.sleep(SPACING_MS);
    const { finish, result, error } = await deliverSafely(deps, row, opts.ownerRetry ?? false);
    try {
      await deps.outbox.finish(row, finish);
    } catch {
      // The lease runs out and a later drain picks the row up (a daily task becomes uncertain).
    }
    out.push({ id: row.id, kind: row.kind, targetId: row.targetId, status: finish.status, result });
    if (isRateLimited(error)) break;
  }
  return out;
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
