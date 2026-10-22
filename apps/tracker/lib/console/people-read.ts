import { z } from "zod";
import type { Db } from "../data/client";

/**
 * The local people copy as the Founder Console reads it (REQ-54, migration
 * 0022): student and staff names by Notion page id, and when the copy was
 * last refreshed. Select-only, on the owner's own client, so RLS
 * (is_org_owner) decides what comes back. Every row is parsed with Zod (ADR
 * 0017) and a query error throws, so a failed read never looks like "no people".
 */
export type PeopleSnapshot = {
  students: { id: string; name: string; stage: string; active: boolean }[];
  staff: { id: string; name: string; active: boolean }[];
  syncedAt: string | null;
};

const StudentRow = z.object({ notion_student_id: z.guid(), name: z.string(), stage: z.string(), active: z.boolean(), archived_at: z.string().nullable() });
const StaffRow = z.object({ notion_staff_id: z.guid(), name: z.string(), active: z.boolean(), archived_at: z.string().nullable() });

export function createConsolePeopleReader(tracker: Db["tracker"], orgId: string): () => Promise<PeopleSnapshot> {
  return async () => {
    const [students, staff, synced] = await Promise.all([
      tracker.from("student_people").select("notion_student_id, name, stage, active, archived_at").eq("org_id", orgId),
      tracker.from("staff").select("notion_staff_id, name, active, archived_at").eq("org_id", orgId),
      tracker.rpc("people_synced_at", { target_org: orgId }),
    ]);
    if (students.error || staff.error || synced.error) throw new Error("unavailable");
    return {
      students: z.array(StudentRow).parse(students.data ?? []).map((r) => ({
        id: r.notion_student_id, name: r.name, stage: r.stage, active: r.active && r.archived_at === null,
      })),
      staff: z.array(StaffRow).parse(staff.data ?? []).map((r) => ({ id: r.notion_staff_id, name: r.name, active: r.active && r.archived_at === null })),
      syncedAt: z.string().nullable().parse(synced.data ?? null),
    };
  };
}
