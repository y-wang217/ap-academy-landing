import { z } from "zod";
import type { OutboxFinish, OutboxRow, OutboxStore } from "../scheduler/outbox-store";
import type { Db } from "./client";

/**
 * Storage for the Notion export outbox (migration 0021) over any Supabase
 * client: the signed-in owner's for requests (RLS applies), the service client
 * with an explicit org for the hourly run. Every row is parsed with Zod (ADR
 * 0017). Reads throw on any query error, so a failed read never looks like
 * "nothing owed".
 */
const uuid = z.guid();
const COLUMNS = "id, kind, target_id, dedupe_key, status, attempts, next_attempt_at, last_error, requested_at";

const Row = z.object({
  id: uuid, kind: z.enum(["summary", "daily_task"]), target_id: uuid, dedupe_key: z.string(),
  status: z.enum(["pending", "running", "done", "failed", "uncertain", "superseded"]), attempts: z.number(),
  next_attempt_at: z.string(), last_error: z.string().nullable(), requested_at: z.string(),
}).transform((r): OutboxRow => ({
  id: r.id, kind: r.kind, targetId: r.target_id, dedupeKey: r.dedupe_key, status: r.status, attempts: r.attempts,
  nextAttemptAt: r.next_attempt_at, lastError: r.last_error, requestedAt: r.requested_at,
}));
const Retried = z.object({ id: uuid, status: z.literal("pending"), superseded_by: uuid.nullable() });

const unavailable = () => new Error("unavailable");

export function createOutboxStore(tracker: Db["tracker"], orgId: string): OutboxStore {
  return {
    async claim(ids, limit, leaseSeconds) {
      const { data, error } = await tracker.rpc("claim_notion_outbox", { p_org_id: orgId, p_ids: ids, p_limit: limit, p_lease_seconds: leaseSeconds });
      if (error) throw unavailable();
      return z.array(Row).parse(data ?? []);
    },
    async finish(row, patch: OutboxFinish) {
      const terminal = patch.status !== "pending";
      const update: Record<string, unknown> = { status: patch.status, lease_until: null, finished_at: terminal ? new Date().toISOString() : null };
      if (patch.attempts !== undefined) update.attempts = patch.attempts;
      if (patch.nextAttemptAt !== undefined) update.next_attempt_at = patch.nextAttemptAt;
      if (patch.lastError !== undefined) update.last_error = patch.lastError === null ? null : patch.lastError.slice(0, 300);
      if (patch.payloadHash !== undefined) update.payload_hash = patch.payloadHash;
      const { error } = await tracker.from("notion_outbox").update(update).eq("id", row.id);
      if (error?.code === "23505") {
        // Back to pending while a newer change already has a pending row: that row renders the newer state, so it answers this one.
        const { data } = await tracker.from("notion_outbox").select("id").eq("org_id", orgId).eq("dedupe_key", row.dedupeKey).eq("status", "pending").maybeSingle();
        const pending = z.object({ id: uuid }).safeParse(data);
        if (!pending.success) throw unavailable();
        const handed = await tracker.from("notion_outbox")
          .update({ status: "superseded", superseded_by: pending.data.id, lease_until: null, finished_at: new Date().toISOString(), last_error: update.last_error ?? null })
          .eq("id", row.id);
        if (handed.error) throw unavailable();
        return;
      }
      if (error) throw unavailable();
      if (patch.status !== "done") return;
      // AC3: a delivery of current state answers every older failure for the same target.
      const older = await tracker.from("notion_outbox").update({ status: "superseded", superseded_by: row.id, finished_at: new Date().toISOString() })
        .eq("org_id", orgId).eq("dedupe_key", row.dedupeKey).in("status", ["failed", "uncertain"]).lt("requested_at", row.requestedAt);
      if (older.error) throw unavailable();
    },
    async findPending(keys) {
      if (keys.length === 0) return [];
      const { data, error } = await tracker.from("notion_outbox").select(COLUMNS).eq("org_id", orgId).eq("status", "pending").in("dedupe_key", keys);
      if (error) throw unavailable();
      return z.array(Row).parse(data ?? []).map((r) => ({ id: r.id, kind: r.kind, targetId: r.targetId }));
    },
    async listOpen(staleBefore) {
      const { data, error } = await tracker.from("notion_outbox").select(COLUMNS).eq("org_id", orgId)
        .or(`status.in.(failed,uncertain),and(status.in.(pending,running),requested_at.lt.${staleBefore})`)
        .order("requested_at", { ascending: true });
      if (error) throw unavailable();
      return z.array(Row).parse(data ?? []);
    },
    async retry(id) {
      const { data, error } = await tracker.rpc("retry_notion_outbox", { p_id: id });
      if (error) {
        if (error.code === "P0002") return "not_found";
        if (error.code === "P0001" && error.message === "not_retryable") return "not_retryable";
        // An id that is not a uuid cannot name a row the caller sees.
        if (error.code === "22P02") return "not_found";
        throw unavailable();
      }
      const rows = z.array(Retried).parse(data ?? []);
      if (rows.length === 0) return "not_found";
      return { id: rows[0].id, status: "pending", supersededBy: rows[0].superseded_by };
    },
    async enqueueSummaries(studentIds) {
      if (studentIds.length === 0) return [];
      const { data, error } = await tracker.rpc("enqueue_summary_sync", { p_org_id: orgId, p_students: studentIds });
      if (error) throw unavailable();
      return z.array(uuid).parse(data ?? []);
    },
  };
}
