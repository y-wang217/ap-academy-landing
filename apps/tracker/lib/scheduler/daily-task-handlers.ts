import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { isDue } from "../domain/schedule/daily-texts";
import { localHhmm, todayIso } from "../time";
import { ensureDailyTask, type DailyTaskDeps } from "./daily-task";
import { drainOutbox, type DrainDeps } from "./outbox";
import type { DailyTaskRow } from "./daily-task-store";
import { requireScheduler, type Denial } from "./guard";
import { DailyTaskRunResponse, DailyTaskStatusResponse } from "./schemas";
import type { ScheduleDeps } from "./schedule-handlers";

const HEADERS = { "Cache-Control": "no-store" };
const send = (status: number, body: unknown) => Response.json(body, { status, headers: HEADERS });
const deny = (d: Denial) => send(d.status, d.body);
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const statusOf = (row: DailyTaskRow | null) =>
  DailyTaskStatusResponse.parse(
    row && row.notionPageId
      ? { state: row.state, pageUrl: row.notionPageUrl, lastError: row.lastError, updatedAt: row.updatedAt }
      : row && row.state === "failed"
        ? { state: "failed", pageUrl: null, lastError: row.lastError, updatedAt: row.updatedAt }
        : { state: "none", pageUrl: null, lastError: null, updatedAt: null },
  );

/** Admin only. The guard runs first, so a teacher never causes a database or Notion read. */
export async function handleDailyTaskStatus(deps: ScheduleDeps, q: URLSearchParams): Promise<Response> {
  const gate = requireScheduler(await deps.identity(), ["admin"]);
  if (!gate.ok) return deny(gate);
  if (!deps.dailyTask) return send(200, statusOf(null));
  const date = IsoDate.safeParse(q.get("date") ?? deps.today());
  if (!date.success) return send(400, { error: "invalid_request" });
  try {
    return send(200, statusOf(await deps.dailyTask.store.get(date.data)));
  } catch {
    return send(503, { error: "scheduler_unavailable" });
  }
}

/** "Create now", "Refresh now" and "Retry": makes or refreshes today's task. Only today, never another date. */
export async function handleDailyTaskCreate(deps: ScheduleDeps, body: unknown): Promise<Response> {
  const gate = requireScheduler(await deps.identity(), ["admin"]);
  if (!gate.ok) return deny(gate);
  const parsed = z.strictObject({ date: IsoDate, requestId: z.guid().optional() }).safeParse(body);
  if (!parsed.success || parsed.data.date !== deps.today()) return send(400, { error: "invalid_request" });
  if (!deps.dailyTask) return send(503, { error: "scheduler_not_configured" });
  // The owner pressed it after seeing the task, so an uncertain task may be sent again.
  const result = await ensureDailyTask(deps.dailyTask, { date: parsed.data.date, mode: "create", ownerRetry: true });
  let row: DailyTaskRow | null = null;
  try {
    row = await deps.dailyTask.store.get(parsed.data.date);
  } catch {
    // The status below falls back to "none"; the result still tells the truth.
  }
  return send(200, DailyTaskRunResponse.parse({ result, status: statusOf(row) }));
}

export type RunEnv = { secret: string | undefined; orgId: string | undefined; time: string | undefined };

const digest = (s: string) => createHash("sha256").update(s).digest();
/** Constant-time compare of two secrets of any length. */
const sameSecret = (a: string, b: string) => timingSafeEqual(digest(a), digest(b));

/**
 * The scheduled entry point. It authenticates itself, so it runs before any
 * session, database or Notion call: no secret configured is 503, a missing or
 * wrong bearer is 401. Until DAILY_TASK_TIME local (default 06:00) it does
 * nothing, so an hourly caller covers any time of day and any DST shift.
 * The people sync (REQ-38) runs on every authorised call, before that check,
 * so it is hourly; its result goes in the body and never changes the status.
 */
export async function handleDailyTaskRun(input: {
  authorization: string | null;
  env: RunEnv;
  build: (orgId: string) => DailyTaskDeps | null;
  /** The org's outbox, drained on every authorised call before the time check (REQ-35 AC9). */
  drain?: (orgId: string) => DrainDeps | null;
  now?: () => Date;
  syncPeople?: (orgId: string) => Promise<"ok" | "failed" | "not_configured">;
}): Promise<Response> {
  const { secret, orgId } = input.env;
  if (!secret) return send(503, { error: "scheduler_not_configured" });
  const bearer = /^Bearer (.+)$/.exec(input.authorization ?? "")?.[1];
  if (!bearer || !sameSecret(bearer, secret)) return send(401, { error: "unauthenticated" });
  const configured = input.env.time && /^([01]\d|2[0-3]):[0-5]\d$/.test(input.env.time) ? input.env.time : "06:00";
  if (!orgId || !z.guid().safeParse(orgId).success) return send(503, { error: "scheduler_not_configured" });

  let people: "ok" | "failed" | "not_configured" | undefined;
  if (input.syncPeople) {
    try {
      people = await input.syncPeople(orgId);
    } catch {
      people = "failed";
    }
  }
  // The drain runs after the sync, so a delivery renders the newest names.
  const drainDeps = input.drain?.(orgId) ?? null;
  const drained = drainDeps ? countDrained(await drainOutbox(drainDeps)) : undefined;
  const extra = { ...(people ? { people } : {}), ...(drained ? { drained } : {}) };

  const now = (input.now ?? (() => new Date()))();
  if (!isDue(localHhmm(now), configured)) return send(200, { result: "not_yet", ...extra });
  const deps = input.build(orgId);
  if (!deps) return send(503, { error: "scheduler_not_configured" });
  const date = todayIso(now);
  const result = await ensureDailyTask(deps, { date, mode: "create" });
  let row: DailyTaskRow | null = null;
  try {
    row = await deps.store.get(date);
  } catch {
    // Reported without a status row.
  }
  // A failure is a 502 so the calling workflow shows red; the next hourly run retries.
  // Uncertain is a 502 too: it waits for the owner, so it must not look green.
  return send(result === "failed" || result === "uncertain" ? 502 : 200, DailyTaskRunResponse.parse({ result, status: statusOf(row), ...extra }));
}

function countDrained(rows: { status: "done" | "pending" | "failed" | "uncertain" }[]) {
  const out = { done: 0, pending: 0, failed: 0, uncertain: 0 };
  for (const r of rows) out[r.status] += 1;
  return out;
}
