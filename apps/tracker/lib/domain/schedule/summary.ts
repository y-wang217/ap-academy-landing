import { DAY_NAMES } from "./legacy-line";
import type { ClassException, ClassSeries } from "./recurrence";
import { addDays, isoWeekday, minutesOf, timeOf } from "./wallclock";

/**
 * The generated Weekly Schedule text, and the monthly review list. Pure: no
 * Next, Supabase or Notion imports. The summary holds only slot lines (no
 * headers or notes) because the monthly admin parser raises on any non-empty
 * line it cannot read, and it ignores every field after the course.
 */
type WithSplit = ClassSeries & { splitFrom?: string | null };

const clean = (s: string) => s.replace(/[|\r\n]+/g, " ").replace(/\s+/g, " ").trim();

export function renderSummary(series: ClassSeries[], staffNames: ReadonlyMap<string, string>, today: string): string {
  const rows = series
    .filter((s) => s.kind === "weekly" && !(s.effectiveUntil && s.effectiveUntil < today))
    .map((s) => ({ s, weekday: isoWeekday(s.startDate) }))
    .sort((a, b) => a.weekday - b.weekday || a.s.startTime.localeCompare(b.s.startTime) || a.s.subject.localeCompare(b.s.subject));
  return rows.map(({ s, weekday }) => {
    const name = staffNames.get(s.staffId);
    if (name === undefined) throw new Error("unknown_staff");
    const end = timeOf(minutesOf(s.startTime) + s.durationMinutes);
    const fields = [`${DAY_NAMES[weekday - 1]} ${s.startTime}-${end}`, clean(s.subject), clean(name)];
    if (s.startDate > today) fields.push(`from ${s.startDate}`);
    if (s.effectiveUntil) fields.push(`until ${s.effectiveUntil}`);
    return fields.join(" | ");
  }).join("\n");
}

export type ReviewSummaryInput = {
  studentId: string;
  syncState: "pending" | "synced" | "failed";
  lastWrittenText: string | null;
  freshText: string;
  adoptedOn: string;
};
export type ReviewItem = { date: string; startTime: string; subject: string };
export type StudentReview = {
  studentId: string;
  needsReview: boolean;
  cancelled: ReviewItem[];
  moved: { originalDate: string; date: string; startTime: string; subject: string }[];
  oneOff: ReviewItem[];
  from: ReviewItem[];
  until: ReviewItem[];
  sync: { state: ReviewSummaryInput["syncState"]; stale: boolean };
};

const inMonth = (date: string, month: string) => date.startsWith(`${month}-`);

/**
 * What Charlie should look at before the monthly run: changes the text field
 * cannot express (cancelled or moved classes, one-offs), future-effective
 * `from`/`until` dates that the current script counts for the whole month,
 * and a summary that is not synced or differs from a fresh render. `series`
 * must hold every series (ended ones too) of the adopted students.
 */
export function monthlyReview(input: { month: string; series: WithSplit[]; exceptions: ClassException[]; summaries: ReviewSummaryInput[] }): StudentReview[] {
  return input.summaries.map((sum) => {
    const own = input.series.filter((s) => s.studentId === sum.studentId);
    const byId = new Map(own.map((s) => [s.id, s]));
    const item = (s: ClassSeries, date: string, startTime = s.startTime): ReviewItem => ({ date, startTime, subject: s.subject });
    const cancelled: ReviewItem[] = [];
    const moved: StudentReview["moved"] = [];
    for (const e of input.exceptions) {
      const s = byId.get(e.seriesId);
      if (!s) continue;
      if (e.kind === "cancelled" && inMonth(e.originalDate, input.month)) cancelled.push(item(s, e.originalDate));
      if (e.kind === "moved" && e.newDate && e.newStartTime && (inMonth(e.originalDate, input.month) || inMonth(e.newDate, input.month))) {
        moved.push({ originalDate: e.originalDate, date: e.newDate, startTime: e.newStartTime, subject: s.subject });
      }
    }
    const oneOff = own.filter((s) => s.kind === "one_off" && inMonth(s.startDate, input.month)).map((s) => item(s, s.startDate));
    // A series that starts within a week of adoption is the import itself, not a later change.
    const from = own
      .filter((s) => s.kind === "weekly" && inMonth(s.startDate, input.month) && (s.splitFrom != null || s.startDate > addDays(sum.adoptedOn, 6)))
      .map((s) => item(s, s.startDate));
    const until = own.filter((s) => s.kind === "weekly" && s.effectiveUntil && inMonth(s.effectiveUntil, input.month)).map((s) => item(s, s.effectiveUntil!));
    const stale = sum.lastWrittenText !== sum.freshText;
    const needsReview = cancelled.length + moved.length + oneOff.length + from.length + until.length > 0 || sum.syncState !== "synced" || stale;
    return { studentId: sum.studentId, needsReview, cancelled, moved, oneOff, from, until, sync: { state: sum.syncState, stale } };
  });
}
