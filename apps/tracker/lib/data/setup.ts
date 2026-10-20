import { z } from "zod";
import { dailyTaskConfig, type Facts, type Failure, type SetupInput } from "../domain/setup-status";
import { isActiveTeachingStaff } from "../domain/staff";
import { addDays } from "../domain/schedule/wallclock";
import { studentName } from "../format";
import type { StaffRecord } from "../notion/staff";
import type { Db } from "./client";

/**
 * Reads for the owner setup page (REQ-33). Selects only, through the owner's
 * own client under RLS, plus the read-only tracker.setup_checks function. Each
 * read marks only the rows that need it as failed, and a failed read is never
 * a zero. Every row is parsed with Zod (ADR 0017). Environment variables are
 * read by the caller and arrive here as booleans or a compare.
 */
export type SetupReaders = {
  staff: () => Promise<StaffRecord[]>;
  scheduledStudents: () => Promise<[string, string][]>;
};
export type SetupEnv = { workConfigured: boolean; cronSecretSet: boolean; orgIdEnv: string | undefined };

const uuid = z.guid();
const LinkRow = z.object({ notion_staff_id: uuid, user_id: uuid.nullable() });
const WindowRow = z.object({ notion_staff_id: uuid });
const SummaryRow = z.object({ notion_student_id: uuid, sync_state: z.string() });
const StudentRow = z.object({ id: uuid, first_name: z.string(), last_initial: z.string(), notion_student_id: uuid.nullable() });
const ParentRow = z.object({ student_id: uuid, claimed_at: z.string().nullable() });
const TaskRow = z.object({ local_date: z.string(), state: z.string() });
const CheckRow = z.object({ check_name: z.string(), ok: z.boolean() });

const DB: Failure = { failed: "db" };
const NOTION: Failure = { failed: "notion" };

/** A query result, parsed, or null when the read failed or a row did not parse. */
async function rows<T>(query: PromiseLike<{ data: unknown; error: unknown }>, schema: z.ZodType<T>): Promise<T[] | null> {
  try {
    const { data, error } = await query;
    if (error) return null;
    const parsed = z.array(schema).safeParse(data ?? []);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
async function notion<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch {
    return null;
  }
}

export async function loadSetupInput(db: Db, orgId: string, today: string, readers: SetupReaders, env: SetupEnv): Promise<SetupInput> {
  const t = db.tracker;
  const [links, windows, summaries, students, parents, tasks, checks, staff, scheduled] = await Promise.all([
    rows(t.from("staff_links").select("notion_staff_id, user_id").eq("org_id", orgId).is("revoked_at", null), LinkRow),
    rows(t.from("availability_windows").select("notion_staff_id").eq("org_id", orgId).or(`effective_until.is.null,effective_until.gte.${today}`), WindowRow),
    rows(t.from("schedule_summaries").select("notion_student_id, sync_state").eq("org_id", orgId), SummaryRow),
    rows(t.from("students").select("id, first_name, last_initial, notion_student_id").eq("org_id", orgId).neq("status", "archived"), StudentRow),
    rows(t.from("parent_links").select("student_id, claimed_at").eq("org_id", orgId), ParentRow),
    rows(t.from("daily_tasks").select("local_date, state").eq("org_id", orgId).eq("kind", "teacher_texts").in("local_date", [today, addDays(today, -1)]), TaskRow),
    rows(t.rpc("setup_checks", { target_org: orgId }), CheckRow),
    notion(readers.staff),
    notion(readers.scheduledStudents),
  ]);

  const linkedIds = links ? new Set(links.map((l) => l.notion_staff_id)) : null;

  let teachers: Facts["teachers"] | Failure = DB;
  if (!staff) teachers = NOTION;
  else if (links && linkedIds) {
    const active = staff.filter(isActiveTeachingStaff);
    const unlinked = active.filter((s) => !linkedIds.has(s.id));
    teachers = {
      linked: active.length - unlinked.length,
      total: active.length,
      signedIn: links.filter((l) => l.user_id !== null).length,
      missing: unlinked.map((s) => s.name).sort((a, b) => a.localeCompare(b)),
    };
  }

  const availability: Facts["availability"] | Failure =
    linkedIds && windows ? { entered: new Set(windows.map((w) => w.notion_staff_id).filter((id) => linkedIds.has(id))).size, linked: linkedIds.size } : DB;

  let schedules: Facts["schedules"] | Failure = DB;
  if (!scheduled) schedules = NOTION;
  else if (summaries) {
    const byStudent = new Map(summaries.map((s) => [s.notion_student_id, s.sync_state]));
    const adopted = scheduled.filter(([id]) => byStudent.has(id));
    schedules = { adopted: adopted.length, scheduled: scheduled.length, failedSync: adopted.filter(([id]) => byStudent.get(id) === "failed").length };
  }

  const named = (s: z.infer<typeof StudentRow>) => ({ id: s.id, name: studentName({ firstName: s.first_name, lastInitial: s.last_initial }) });
  let parentFacts: Facts["parents"] | Failure = DB;
  if (students && parents) {
    const claimed = new Set(parents.filter((p) => p.claimed_at !== null).map((p) => p.student_id));
    const invited = new Set(parents.map((p) => p.student_id));
    const ids = new Set(students.map((s) => s.id));
    parentFacts = {
      students: students.length,
      claimed: students.filter((s) => claimed.has(s.id)).length,
      invitedOnly: students.filter((s) => invited.has(s.id) && !claimed.has(s.id)).length,
      anyLink: parents.some((p) => ids.has(p.student_id)),
      missing: students.filter((s) => !claimed.has(s.id)).map(named),
    };
  }

  const notionRecords: Facts["notionRecords"] | Failure = students
    ? { students: students.length, linked: students.filter((s) => s.notion_student_id !== null).length, missing: students.filter((s) => s.notion_student_id === null).map(named) }
    : DB;

  const dailyTask: Facts["dailyTask"] | Failure = tasks
    ? { missingConfig: dailyTaskConfig(env, orgId), readyDates: tasks.filter((r) => r.state === "ready").map((r) => r.local_date) }
    : DB;

  const guardRow = checks?.find((c) => c.check_name === "notion_link_guard");
  const guard: Facts["guard"] | Failure = guardRow ? { ok: guardRow.ok } : DB;

  return { teachers, availability, schedules, parents: parentFacts, notionRecords, dailyTask, guard };
}
