import { normaliseScheduleText, parseScheduleLine, type RejectReason } from "./legacy-line";
import { addDays, isoWeekday } from "./wallclock";

/**
 * Turns the legacy Weekly Schedule text of many students into an import plan.
 * Pure: no Next, Supabase or Notion imports. Per student it is all or
 * nothing: one rejected line holds back every line of that student, so the
 * generated summary can never silently drop a billed slot.
 */
export type StaffLike = { id: string; name: string; status: string | null; functions: readonly string[] };
export type StudentInput = { id: string; name: string; stage: string; weeklySchedule: string };

export type PlannedSeries = {
  /** Hashed with the org ID by the data layer into the series' request_id. */
  requestSeed: string;
  staffId: string;
  subject: string;
  weekday: number;
  startDate: string;
  startTime: string;
  durationMinutes: number;
};
export type RepairLine = { text: string; status: "ok" | RejectReason; hint?: string };
export type ImportPlan = {
  adopt: { studentId: string; name: string; sourceText: string; series: PlannedSeries[] }[];
  repair: { studentId: string; name: string; lines: RepairLine[] }[];
  skipped: { studentId: string; reason: "adopted" }[];
};

const IN_SCOPE_STAGES = ["Active", "Onboarding"];
const ACTIVE_STATUSES = ["Active", "Onboarding"];
const TEACHING_FUNCTIONS = ["Teacher", "Trial Teacher"];

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
const isActiveTeaching = (s: StaffLike) =>
  !!s.status && ACTIVE_STATUSES.includes(s.status) && s.functions.some((f) => TEACHING_FUNCTIONS.includes(f));

function resolveTeacher(name: string, staff: StaffLike[]): { staffId: string } | { reason: RejectReason; hint?: string } {
  const key = norm(name);
  const matches = staff.filter((s) => norm(s.name) === key);
  const active = matches.filter(isActiveTeaching);
  if (active.length === 1) return { staffId: active[0].id };
  if (active.length > 1) return { reason: "teacher_ambiguous" };
  if (matches.length > 0) return { reason: "teacher_inactive" };
  const first = key.split(" ")[0];
  const similar = staff.filter((s) => isActiveTeaching(s) && norm(s.name).split(" ")[0] === first).map((s) => s.name);
  return { reason: "teacher_not_found", ...(similar.length ? { hint: `Same first name in Staff: ${similar.join(", ")}` } : {}) };
}

/** First date on this ISO weekday on or after `today`. */
function nextOnOrAfter(today: string, weekday: number): string {
  return addDays(today, (weekday - isoWeekday(today) + 7) % 7);
}

export function planImport(input: { students: StudentInput[]; staff: StaffLike[]; today: string; adoptedStudentIds: ReadonlySet<string> }): ImportPlan {
  const plan: ImportPlan = { adopt: [], repair: [], skipped: [] };
  for (const st of input.students) {
    if (!IN_SCOPE_STAGES.includes(st.stage)) continue;
    const lines = normaliseScheduleText(st.weeklySchedule);
    if (lines.length === 0) continue;
    if (input.adoptedStudentIds.has(st.id)) {
      plan.skipped.push({ studentId: st.id, reason: "adopted" });
      continue;
    }
    const seen = new Set<string>();
    const series: PlannedSeries[] = [];
    const out: RepairLine[] = [];
    for (const text of lines) {
      const parsed = parseScheduleLine(text);
      if (!parsed.ok) {
        out.push({ text, status: parsed.reason });
        continue;
      }
      const teacher = resolveTeacher(parsed.teacherName, input.staff);
      if ("reason" in teacher) {
        out.push({ text, status: teacher.reason, ...(teacher.hint ? { hint: teacher.hint } : {}) });
        continue;
      }
      const lineKey = `${parsed.weekday}|${parsed.startTime}|${parsed.durationMinutes}|${norm(parsed.subject)}|${teacher.staffId}`;
      if (seen.has(lineKey)) {
        out.push({ text, status: "duplicate_line" });
        continue;
      }
      seen.add(lineKey);
      out.push({ text, status: "ok" });
      series.push({
        requestSeed: `import:${st.id}:${lineKey}`,
        staffId: teacher.staffId,
        subject: parsed.subject,
        weekday: parsed.weekday,
        startDate: nextOnOrAfter(input.today, parsed.weekday),
        startTime: parsed.startTime,
        durationMinutes: parsed.durationMinutes,
      });
    }
    if (out.every((l) => l.status === "ok")) plan.adopt.push({ studentId: st.id, name: st.name, sourceText: st.weeklySchedule, series });
    else plan.repair.push({ studentId: st.id, name: st.name, lines: out });
  }
  return plan;
}
