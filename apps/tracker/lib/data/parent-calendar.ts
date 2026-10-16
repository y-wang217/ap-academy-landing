import "server-only";
import { z } from "zod";
import { greetingName } from "../domain/schedule/daily-texts";
import type { ClassException, ClassSeries } from "../domain/schedule/recurrence";
import type { ScheduleStore } from "../scheduler/schedule-store";
import type { Db } from "./client";

/**
 * The parent Calendar tab's reads (REQ-24, ADR 0047). Everything runs on the
 * parent's own client, so the 0016 parent policies decide what comes back.
 * Read-only; the store type admits only listSeriesForStudent.
 */
export type ChildHeader = { firstName: string; lastInitial: string; gradeLevel: number | null };
export type ChildCalendar =
  | { kind: "not_available" }
  | { kind: "error" }
  | { kind: "ok"; series: ClassSeries[]; exceptions: ClassException[]; header: ChildHeader };

const ChildRow = z.object({
  notion_student_id: z.guid().nullable(),
  first_name: z.string(),
  last_initial: z.string(),
  grade_level: z.number().nullable(),
});

export async function loadChildCalendar(
  viewer: { db: Db },
  child: { id: string },
  store: Pick<ScheduleStore, "listSeriesForStudent">,
): Promise<ChildCalendar> {
  try {
    const { data, error } = await viewer.db.tracker
      .from("students").select("notion_student_id, first_name, last_initial, grade_level").eq("id", child.id).maybeSingle();
    if (error || !data) return { kind: "error" };
    const row = ChildRow.parse(data);
    // Decision 4: not adopted means no scheduler link or no class rows. The legacy text is never read.
    if (!row.notion_student_id) return { kind: "not_available" };
    const { series, exceptions } = await store.listSeriesForStudent(row.notion_student_id);
    if (series.length === 0) return { kind: "not_available" };
    return { kind: "ok", series, exceptions, header: { firstName: row.first_name, lastInitial: row.last_initial, gradeLevel: row.grade_level } };
  } catch {
    return { kind: "error" };
  }
}

/** First names for exactly these staff IDs. A failed Staff list drops names; the page still renders. */
export async function teacherNames(
  staffIds: string[],
  loadStaff: () => Promise<{ id: string; name: string }[]>,
): Promise<{ names: Record<string, string>; failed: boolean }> {
  const wanted = new Set(staffIds);
  try {
    const staff = await loadStaff();
    const names: Record<string, string> = {};
    for (const s of staff) if (wanted.has(s.id)) names[s.id] = greetingName(s.name);
    return { names, failed: false };
  } catch {
    return { names: {}, failed: true };
  }
}
