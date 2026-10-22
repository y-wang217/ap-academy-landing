import { textMonthSessions, type TextSession } from "../schedule/legacy-count";
import type { ClassException, ClassSeries } from "../schedule/recurrence";
import { isoWeekday } from "../schedule/wallclock";
import type { BillingOccurrence } from "./month-input";

/**
 * The count the Weekly Schedule text method would produce next to the
 * structured count, with every difference explained (REQ-40 AC9). Pure. The
 * structured count is every class that is not cancelled and not a makeup,
 * which is what the text method tries to approximate.
 */
export type DifferenceReason =
  | "cancelled" | "moved_out" | "moved_in" | "one_off" | "before_from" | "after_until" | "duration_changed" | "no_class" | "not_in_text";
export type Difference = {
  date: string;
  subject: string;
  side: "text_only" | "structured_only";
  reason: DifferenceReason;
  /** moved_out: the date it moved to. moved_in: the date it came from. Otherwise null. */
  other: string | null;
};
export type Count = { count: number; hours: number };
export type StudentReconciliation = { unparseable: boolean; text: Count | null; structured: Count; differences: Difference[] };

// The same cleaning renderSummary applies to a subject before writing it.
const clean = (s: string) => s.replace(/[|\r\n]+/g, " ").replace(/\s+/g, " ").trim();
const round = (n: number) => Math.round(n * 100) / 100;
const total = (hours: number[]): Count => ({ count: hours.length, hours: round(hours.reduce((a, b) => a + b, 0)) });
const hoursOf = (o: BillingOccurrence) => o.durationMinutes / 60;

export function reconcileMonth(input: {
  month: string;
  /** The last written Weekly Schedule text; null when it was never written (counts as empty). */
  text: string | null;
  occurrences: BillingOccurrence[];
  series: ClassSeries[];
  exceptions: ClassException[];
}): StudentReconciliation {
  const structured = input.occurrences.filter((o) => o.schedulerState !== "cancelled" && o.purpose !== "makeup");
  const structuredCount = total(structured.map(hoursOf));
  let sessions: TextSession[];
  try {
    sessions = textMonthSessions(input.text ?? "", input.month);
  } catch {
    return { unparseable: true, text: null, structured: structuredCount, differences: [] };
  }

  const subjectOf = new Map(input.series.map((s) => [s.id, clean(s.subject)]));
  const differences: Difference[] = [];
  const byKey = new Map<string, { text: TextSession[]; structured: BillingOccurrence[] }>();
  const slot = (k: string) => byKey.get(k) ?? byKey.set(k, { text: [], structured: [] }).get(k)!;
  for (const s of sessions) slot(`${s.date}|${s.course}`).text.push(s);
  for (const o of structured) slot(`${o.date}|${clean(o.subject)}`).structured.push(o);

  const textReason = (s: TextSession): Pick<Difference, "reason" | "other"> => {
    const own = (e: ClassException) => e.originalDate === s.date && subjectOf.get(e.seriesId) === s.course;
    if (input.exceptions.some((e) => e.kind === "cancelled" && own(e))) return { reason: "cancelled", other: null };
    const moved = input.exceptions.find((e) => e.kind === "moved" && own(e));
    if (moved) return { reason: "moved_out", other: moved.newDate };
    const line = input.series.filter((x) => x.kind === "weekly" && clean(x.subject) === s.course && isoWeekday(x.startDate) === isoWeekday(s.date));
    if (line.some((x) => x.startDate > s.date)) return { reason: "before_from", other: null };
    if (line.some((x) => x.effectiveUntil !== null && x.effectiveUntil < s.date)) return { reason: "after_until", other: null };
    return { reason: "no_class", other: null };
  };
  const structuredReason = (o: BillingOccurrence): Pick<Difference, "reason" | "other"> => {
    if (o.schedulerState === "moved") return { reason: "moved_in", other: o.movedFrom };
    if (o.schedulerState === "one_off") return { reason: "one_off", other: null };
    return { reason: "not_in_text", other: null };
  };

  for (const { text, structured: occ } of byKey.values()) {
    const sorted = [...occ].sort((a, b) => a.startTime.localeCompare(b.startTime));
    const paired = Math.min(text.length, sorted.length);
    for (let i = 0; i < paired; i++) {
      if (Math.abs(text[i].hours - hoursOf(sorted[i])) > 1e-9) {
        differences.push({ date: sorted[i].date, subject: sorted[i].subject, side: "structured_only", reason: "duration_changed", other: null });
      }
    }
    for (const s of text.slice(paired)) differences.push({ date: s.date, subject: s.course, side: "text_only", ...textReason(s) });
    for (const o of sorted.slice(paired)) differences.push({ date: o.date, subject: o.subject, side: "structured_only", ...structuredReason(o) });
  }
  differences.sort((a, b) => a.date.localeCompare(b.date) || a.subject.localeCompare(b.subject) || a.side.localeCompare(b.side));
  return { unparseable: false, text: total(sessions.map((s) => s.hours)), structured: structuredCount, differences };
}
