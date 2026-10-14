import { renderSummary } from "../domain/schedule/summary";
import type { StaffRecord } from "../notion/staff";
import type { StudentRecord } from "../notion/students";
import type { ScheduleStore } from "./schedule-store";

/** The Notion side of the Weekly Schedule summary, injected so tests never touch Notion. */
export type StudentsPort = {
  list(): Promise<StudentRecord[]>;
  get(pageId: string): Promise<StudentRecord | null>;
  write(pageId: string, text: string): Promise<void>;
};
export type SyncDeps = { store: ScheduleStore; students: StudentsPort; fetchStaff: () => Promise<StaffRecord[]>; today: () => string };
export type SyncResult = "synced" | "failed" | "skipped";

const MAX_ERROR = 300;
const errorText = (e: unknown) => (e instanceof Error ? e.message : "sync failed").slice(0, MAX_ERROR);

/**
 * Regenerates one adopted student's Weekly Schedule from their series and
 * writes it to Notion if it differs. Never throws: a failure is recorded on
 * the summary row (state `failed`, short error, no Notion payloads) and the
 * caller's own write stands. If the Notion text no longer matches what the
 * scheduler last wrote, it is overwritten and the replaced text is kept.
 */
export async function syncStudentSummary(deps: SyncDeps, studentId: string): Promise<SyncResult> {
  let summary;
  try {
    summary = await deps.store.getSummary(studentId);
  } catch {
    return "failed"; // Cannot tell whether the student is adopted, so write nothing.
  }
  if (!summary) return "skipped";
  const fail = async (message: string, drift?: string): Promise<SyncResult> => {
    await deps.store.markSummary(studentId, { syncState: "failed", lastError: message.slice(0, MAX_ERROR), ...(drift !== undefined ? { lastDriftText: drift } : {}) });
    return "failed";
  };
  let text: string;
  let seriesCount = 0;
  try {
    const [{ series }, staff] = await Promise.all([deps.store.listSeriesForStudent(studentId), deps.fetchStaff()]);
    seriesCount = series.length;
    text = renderSummary(series, new Map(staff.map((s) => [s.id, s.name])), deps.today());
  } catch (e) {
    return fail(e instanceof Error && e.message === "unknown_staff" ? "A teacher on this schedule is not in Staff" : "Could not build the summary");
  }
  let current: StudentRecord | null;
  try {
    current = await deps.students.get(studentId);
  } catch (e) {
    return fail(errorText(e));
  }
  if (!current) return fail("Student not found in Notion");

  const notionText = current.weeklySchedule.trim();
  // An adopted student with no series at all is a read problem, not a schedule: never blank their text.
  if (seriesCount === 0 && notionText !== "") return fail("No classes found for this student, so the Weekly Schedule was left as it is");
  const baseline = (summary.lastWrittenText ?? summary.adoptedFromText).trim();
  const drift = notionText !== baseline && notionText !== text ? current.weeklySchedule : undefined;
  if (notionText === text) {
    await deps.store.markSummary(studentId, { syncState: "synced", lastWrittenText: text, lastError: null });
    return "synced";
  }
  try {
    await deps.students.write(studentId, text);
  } catch (e) {
    return fail(errorText(e), drift);
  }
  await deps.store.markSummary(studentId, { syncState: "synced", lastWrittenText: text, lastError: null, ...(drift !== undefined ? { lastDriftText: drift } : {}) });
  return "synced";
}
