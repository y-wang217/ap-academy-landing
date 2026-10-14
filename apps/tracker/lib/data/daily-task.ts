import { z } from "zod";
import type { StoredTeacher } from "../domain/schedule/daily-texts";
import type { DailyTaskPatch, DailyTaskRow, DailyTaskStore } from "../scheduler/daily-task-store";
import type { Db } from "./client";

/**
 * Storage for the daily teacher-texts task (migration 0012) over any Supabase
 * client: the signed-in owner's for admin requests, the service client for the
 * scheduled run. Every row is parsed with Zod (ADR 0017).
 */
const KIND = "teacher_texts";
const uuid = z.guid();

const TaskRow = z.object({
  id: uuid, local_date: z.string(), notion_page_id: uuid.nullable(), notion_page_url: z.string().nullable(), notion_log_id: uuid.nullable(),
  state: z.enum(["pending", "ready", "failed"]), last_error: z.string().nullable(), refresh_count: z.number(), updated_at: z.string(),
}).transform((r): DailyTaskRow => ({
  id: r.id, localDate: r.local_date, notionPageId: r.notion_page_id, notionPageUrl: r.notion_page_url, notionLogId: r.notion_log_id,
  state: r.state, lastError: r.last_error, refreshCount: r.refresh_count, updatedAt: r.updated_at,
}));
const TeacherRow = z.object({
  notion_staff_id: uuid, block_id: uuid, written_fingerprint: z.string(), written_at: z.string(), acknowledged_fingerprint: z.string().nullable(), labelled: z.boolean(),
}).transform((r): StoredTeacher => ({
  staffId: r.notion_staff_id, blockId: r.block_id, writtenFingerprint: r.written_fingerprint, writtenAt: r.written_at,
  acknowledgedFingerprint: r.acknowledged_fingerprint, labelled: r.labelled,
}));

/** Reads throw on any query error: an empty answer from a failed read must not look like "no task yet". */
export function createDailyTaskStore(tracker: Db["tracker"], orgId: string): DailyTaskStore {
  return {
    async get(date) {
      const { data, error } = await tracker.from("daily_tasks").select().eq("org_id", orgId).eq("kind", KIND).eq("local_date", date).maybeSingle();
      if (error) throw new Error("unavailable");
      return data ? TaskRow.parse(data) : null;
    },
    async claim(date, leaseSeconds) {
      const { data, error } = await tracker.rpc("claim_daily_task", { p_org: orgId, p_kind: KIND, p_date: date, p_lease_seconds: leaseSeconds });
      if (error) throw new Error("unavailable");
      const rows = z.array(z.unknown()).parse(data ?? []);
      return rows.length > 0 ? TaskRow.parse(rows[0]) : null;
    },
    async save(id, patch: DailyTaskPatch) {
      const update: Record<string, unknown> = {};
      if (patch.notionPageId !== undefined) update.notion_page_id = patch.notionPageId;
      if (patch.notionPageUrl !== undefined) update.notion_page_url = patch.notionPageUrl;
      if (patch.notionLogId !== undefined) update.notion_log_id = patch.notionLogId;
      if (patch.state !== undefined) update.state = patch.state;
      if (patch.lastError !== undefined) update.last_error = patch.lastError === null ? null : patch.lastError.slice(0, 300);
      if (patch.refreshCount !== undefined) update.refresh_count = patch.refreshCount;
      if (patch.releaseLease) update.lease_until = null;
      if (Object.keys(update).length === 0) return;
      const { error } = await tracker.from("daily_tasks").update(update).eq("id", id);
      if (error) throw new Error("unavailable");
    },
    async listTeachers(taskId) {
      const { data, error } = await tracker.from("daily_task_teachers").select().eq("task_id", taskId);
      if (error) throw new Error("unavailable");
      return z.array(TeacherRow).parse(data ?? []);
    },
    // Update, then insert if nothing matched. An upsert would also try to update the key columns, which are not granted (0012).
    async saveTeacher(taskId, t) {
      const fields = {
        block_id: t.blockId, written_fingerprint: t.writtenFingerprint, written_at: t.writtenAt,
        acknowledged_fingerprint: t.acknowledgedFingerprint, labelled: t.labelled,
      };
      const updated = await tracker.from("daily_task_teachers").update(fields).eq("task_id", taskId).eq("notion_staff_id", t.staffId).select("task_id");
      if (updated.error) throw new Error("unavailable");
      if (updated.data && updated.data.length > 0) return;
      const { error } = await tracker.from("daily_task_teachers").insert({ task_id: taskId, org_id: orgId, notion_staff_id: t.staffId, ...fields });
      if (error) throw new Error("unavailable");
    },
  };
}
