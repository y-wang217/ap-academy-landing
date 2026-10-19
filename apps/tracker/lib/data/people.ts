import { z } from "zod";
import type { StaffRecord } from "../notion/staff";
import type { ApplyInput, SyncRun } from "../scheduler/people-sync";
import type { Db } from "./client";

/**
 * The local people copy (REQ-38, migration 0021) over any Supabase client: the
 * caller's own for requests (RLS decides which rows come back), the service
 * client for the scheduled run. Every row is parsed with Zod (ADR 0017), and
 * every read throws on a query error so a failed read never looks like "no
 * people".
 */
const uuid = z.guid();

const StaffRow = z.object({
  notion_staff_id: uuid, name: z.string(), subjects: z.array(z.string()), active: z.boolean(), archived_at: z.string().nullable(),
});
const StudentRow = z.object({ notion_student_id: uuid, name: z.string(), active: z.boolean(), archived_at: z.string().nullable() });
const LinkRow = z.object({ notion_staff_id: uuid, email: z.string() });
const RunRow = z.object({
  id: uuid, result: z.enum(["ok", "failed"]), started_at: z.string(), finished_at: z.string(), error: z.string().nullable(),
  staff_upserted: z.number(), staff_archived: z.number(), students_upserted: z.number(), students_archived: z.number(),
}).transform((r): SyncRun => ({
  id: r.id, result: r.result, startedAt: r.started_at, finishedAt: r.finished_at, error: r.error,
  staffUpserted: r.staff_upserted, staffArchived: r.staff_archived, studentsUpserted: r.students_upserted, studentsArchived: r.students_archived,
}));

/**
 * A local row as the StaffRecord every caller already takes. Active maps to
 * the Status and Function values isActiveTeachingStaff expects (Decision 5);
 * an archived row is never active. Email comes from a live staff link, never
 * from Notion (AC16).
 */
export function toStaffRecord(row: z.infer<typeof StaffRow>, email: string | null): StaffRecord {
  const active = row.active && row.archived_at === null;
  return {
    id: row.notion_staff_id,
    name: row.name,
    email,
    functions: active ? ["Teacher"] : [],
    status: active ? "Active" : "Inactive",
    subjects: row.subjects,
  };
}

export type PeopleRuns = { lastOk: SyncRun | null; lastFailure: SyncRun | null; latestStartedAt: string | null };

export type PeopleStore = {
  listStaff: () => Promise<StaffRecord[]>;
  getStaff: (id: string) => Promise<StaffRecord | null>;
  /** Every visible student, archived included, for names on existing classes. */
  studentNames: () => Promise<Map<string, string>>;
  /** Active, not archived students, for pickers. */
  activeStudents: () => Promise<{ id: string; name: string }[]>;
  /** The last good sync's finish time, or null when there has never been one. */
  syncedAt: () => Promise<string | null>;
  /** The owner's view of the latest runs. */
  lastRuns: () => Promise<PeopleRuns>;
  apply: (input: ApplyInput) => Promise<SyncRun>;
};

export function createPeopleStore(tracker: Db["tracker"], orgId: string): PeopleStore {
  async function emails(): Promise<Map<string, string>> {
    const { data, error } = await tracker.from("staff_links").select("notion_staff_id, email").eq("org_id", orgId).is("revoked_at", null);
    if (error) throw new Error("unavailable");
    return new Map(z.array(LinkRow).parse(data ?? []).map((l) => [l.notion_staff_id, l.email]));
  }
  async function staffRows(id?: string) {
    let q = tracker.from("staff").select("notion_staff_id, name, subjects, active, archived_at").eq("org_id", orgId);
    if (id) q = q.eq("notion_staff_id", id);
    const { data, error } = await q;
    if (error) throw new Error("unavailable");
    return z.array(StaffRow).parse(data ?? []);
  }
  async function studentRows() {
    const { data, error } = await tracker.from("student_people").select("notion_student_id, name, active, archived_at").eq("org_id", orgId);
    if (error) throw new Error("unavailable");
    return z.array(StudentRow).parse(data ?? []);
  }
  return {
    async listStaff() {
      const [rows, mail] = await Promise.all([staffRows(), emails()]);
      return rows.map((r) => toStaffRecord(r, mail.get(r.notion_staff_id) ?? null)).sort((a, b) => a.name.localeCompare(b.name));
    },
    async getStaff(id) {
      if (!uuid.safeParse(id).success) return null;
      const [rows, mail] = await Promise.all([staffRows(id), emails()]);
      return rows[0] ? toStaffRecord(rows[0], mail.get(id) ?? null) : null;
    },
    async studentNames() {
      return new Map((await studentRows()).map((r) => [r.notion_student_id, r.name]));
    },
    async activeStudents() {
      return (await studentRows())
        .filter((r) => r.active && r.archived_at === null)
        .map((r) => ({ id: r.notion_student_id, name: r.name }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    async syncedAt() {
      const { data, error } = await tracker.rpc("people_synced_at", { target_org: orgId });
      if (error) throw new Error("unavailable");
      return z.string().nullable().parse(data ?? null);
    },
    async lastRuns() {
      const latest = async (result: "ok" | "failed" | null) => {
        let q = tracker.from("sync_runs").select().eq("org_id", orgId).eq("kind", "people");
        if (result) q = q.eq("result", result);
        const { data, error } = await q.order("started_at", { ascending: false }).limit(1).maybeSingle();
        if (error) throw new Error("unavailable");
        return data ? RunRow.parse(data) : null;
      };
      const [lastOk, lastFailure, any] = await Promise.all([latest("ok"), latest("failed"), latest(null)]);
      return { lastOk, lastFailure, latestStartedAt: any?.startedAt ?? null };
    },
    async apply(input) {
      const { data, error } = await tracker.rpc("apply_people_sync", {
        p_org: orgId, p_trigger: input.trigger, p_started_at: input.startedAt, p_staff: input.staff, p_students: input.students, p_error: input.error,
      });
      if (error) throw new Error("unavailable");
      return RunRow.parse(data);
    },
  };
}
