import { z } from "zod";
import { drainOutbox, STALE_MINUTES } from "./outbox";
import { drainDepsOf } from "./outbox-wiring";
import { requireScheduler, type Denial } from "./guard";
import type { ScheduleDeps } from "./schedule-handlers";
import { ExportRetryResponse, ExportsResponse } from "./schemas";

/**
 * The owner's view of Notion exports that are not done (REQ-35 AC11, AC12).
 * The guard runs first, so a teacher causes no database or Notion read.
 */
const HEADERS = { "Cache-Control": "no-store" };
const send = (status: number, body: unknown) => Response.json(body, { status, headers: HEADERS });
const deny = (d: Denial) => send(d.status, d.body);
const unavailable = () => send(503, { error: "scheduler_unavailable" });

/** GET: failed, uncertain, and pending or running rows older than STALE_MINUTES, with student names. */
export async function handleExportsList(deps: ScheduleDeps, now: () => Date = () => new Date()): Promise<Response> {
  const gate = requireScheduler(await deps.identity(), ["admin"]);
  if (!gate.ok) return deny(gate);
  if (!deps.outbox) return send(200, ExportsResponse.parse({ exports: [] }));
  let rows;
  try {
    rows = await deps.outbox.listOpen(new Date(now().getTime() - STALE_MINUTES * 60_000).toISOString());
  } catch {
    return unavailable();
  }
  let names = new Map<string, string>();
  if (rows.some((r) => r.kind === "summary") && deps.studentNames) {
    try {
      names = await deps.studentNames();
    } catch {
      // Names are a convenience: the strip falls back to "a student".
    }
  }
  const exports = rows
    .filter((r) => r.status === "pending" || r.status === "running" || r.status === "failed" || r.status === "uncertain")
    .map((r) => ({
      id: r.id, kind: r.kind, targetId: r.targetId, name: r.kind === "summary" ? (names.get(r.targetId) ?? null) : null,
      status: r.status, attempts: r.attempts, nextAttemptAt: r.nextAttemptAt, requestedAt: r.requestedAt, lastError: r.lastError,
    }));
  return send(200, ExportsResponse.parse({ exports }));
}

const RetryBody = z.strictObject({ id: z.guid(), requestId: z.guid().optional() });

/** POST { id }: send a failed, uncertain or waiting export again, now. */
export async function handleExportsRetry(deps: ScheduleDeps, body: unknown): Promise<Response> {
  const gate = requireScheduler(await deps.identity(), ["admin"]);
  if (!gate.ok) return deny(gate);
  const parsed = RetryBody.safeParse(body);
  if (!parsed.success) return send(400, { error: "invalid_request" });
  const outbox = deps.outbox;
  if (!outbox) return unavailable();
  let r;
  try {
    r = await outbox.retry(parsed.data.id);
  } catch {
    return unavailable();
  }
  if (r === "not_found") return send(404, { error: "not_found" });
  if (r === "not_retryable") return send(409, { error: "not_retryable" });
  const [delivered] = await drainOutbox(drainDepsOf({ ...deps, outbox }), { ids: [r.id], limit: 1, ownerRetry: true });
  return send(200, ExportRetryResponse.parse({ id: r.id, status: delivered?.status ?? "pending", supersededBy: r.supersededBy }));
}
