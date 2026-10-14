import { addDays, daysBetween, isoWeekStart, isoWeekday, localToUtc, minutesOf, timeOf } from "./wallclock";

/** A weekly or one-off class rule. Times are local wall-clock. */
export type ClassSeries = {
  id: string;
  staffId: string;
  studentId: string;
  subject: string;
  kind: "one_off" | "weekly";
  startDate: string;
  startTime: string;
  durationMinutes: number;
  effectiveUntil: string | null;
};
/** One change to one occurrence, keyed by (seriesId, originalDate). */
export type ClassException = {
  seriesId: string;
  originalDate: string;
  kind: "cancelled" | "moved";
  newDate: string | null;
  newStartTime: string | null;
};
export type Occurrence = {
  occurrenceKey: string;
  seriesId: string;
  originalDate: string;
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  startsAt: string;
  endsAt: string;
  staffId: string;
  studentId: string;
  subject: string;
  status: "scheduled" | "cancelled" | "moved";
  kind: "one_off" | "weekly";
};

const keyOf = (seriesId: string, originalDate: string) => `${seriesId}:${originalDate}`;

/** Does the series pattern itself produce an occurrence on this date? */
export function isPatternDate(s: ClassSeries, date: string): boolean {
  if (date < s.startDate) return false;
  if (s.kind === "one_off") return date === s.startDate;
  if (s.effectiveUntil && date > s.effectiveUntil) return false;
  return daysBetween(s.startDate, date) % 7 === 0;
}

function patternDates(s: ClassSeries, from: string, to: string): string[] {
  const last = s.kind === "weekly" && s.effectiveUntil && s.effectiveUntil < to ? s.effectiveUntil : to;
  if (s.kind === "one_off") return s.startDate >= from && s.startDate <= to ? [s.startDate] : [];
  const out: string[] = [];
  let d = s.startDate;
  if (d < from) d = addDays(d, Math.ceil(daysBetween(d, from) / 7) * 7);
  for (; d <= last; d = addDays(d, 7)) out.push(d);
  return out;
}

function build(s: ClassSeries, originalDate: string, date: string, startTime: string, status: Occurrence["status"]): Occurrence {
  const startsAt = localToUtc(date, startTime);
  return {
    occurrenceKey: keyOf(s.id, originalDate),
    seriesId: s.id,
    originalDate,
    date,
    startTime,
    endTime: timeOf(minutesOf(startTime) + s.durationMinutes),
    durationMinutes: s.durationMinutes,
    startsAt,
    endsAt: new Date(Date.parse(startsAt) + s.durationMinutes * 60_000).toISOString(),
    staffId: s.staffId,
    studentId: s.studentId,
    subject: s.subject,
    status,
    kind: s.kind,
  };
}

/**
 * Dated occurrences of every series inside [from, to] (inclusive), exceptions
 * applied. Occurrences are always recomputed, never stored, so a cancellation
 * survives any regeneration. Pass exceptions whose originalDate or newDate is
 * in range.
 */
export function expandOccurrences(
  series: ClassSeries[],
  exceptions: ClassException[],
  range: { from: string; to: string },
): Occurrence[] {
  const byKey = new Map(exceptions.map((e) => [keyOf(e.seriesId, e.originalDate), e]));
  const out: Occurrence[] = [];
  for (const s of series) {
    const originals = new Set(patternDates(s, range.from, range.to));
    for (const e of exceptions) {
      if (e.seriesId === s.id && e.kind === "moved" && e.newDate && e.newDate >= range.from && e.newDate <= range.to && isPatternDate(s, e.originalDate)) {
        originals.add(e.originalDate);
      }
    }
    for (const original of originals) {
      const e = byKey.get(keyOf(s.id, original));
      if (!e) out.push(build(s, original, original, s.startTime, "scheduled"));
      else if (e.kind === "cancelled") {
        if (original >= range.from && original <= range.to) out.push(build(s, original, original, s.startTime, "cancelled"));
      } else if (e.newDate && e.newStartTime && e.newDate >= range.from && e.newDate <= range.to) {
        out.push(build(s, original, e.newDate, e.newStartTime, "moved"));
      }
    }
  }
  return out.sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.occurrenceKey.localeCompare(b.occurrenceKey));
}

export type SplitChanges = Partial<Pick<ClassSeries, "staffId" | "studentId" | "subject" | "startTime" | "durationMinutes">> & { weekday?: number };
export type SplitPlan = { oldSeries: ClassSeries; newSeries: ClassSeries; exceptions: ClassException[] };

/**
 * "This class and future" at occurrence date D. The old series ends the day
 * before D; the new one starts on its (possibly new) weekday in D's week, or
 * the following week if that day is before D. Exceptions of the old series on
 * or after D move across: both kinds are re-keyed to the same ISO week's new
 * weekday, and a move keeps its absolute date and time. Exceptions that would
 * land before the new start are dropped. Mirrors tracker.split_class_series().
 */
export function planSplit(series: ClassSeries, exceptions: ClassException[], fromDate: string, changes: SplitChanges, newId: string): SplitPlan {
  const weekday = changes.weekday ?? isoWeekday(fromDate);
  let start = addDays(isoWeekStart(fromDate), weekday - 1);
  if (start < fromDate) start = addDays(start, 7);
  const newSeries: ClassSeries = { ...series, ...changes, id: newId, kind: "weekly", startDate: start };
  delete (newSeries as ClassSeries & { weekday?: number }).weekday;
  const moved: ClassException[] = [];
  for (const e of exceptions) {
    if (e.originalDate < fromDate) continue;
    const mapped = addDays(isoWeekStart(e.originalDate), weekday - 1);
    if (mapped >= start) moved.push({ ...e, seriesId: newId, originalDate: mapped });
  }
  return { oldSeries: { ...series, effectiveUntil: addDays(fromDate, -1) }, newSeries, exceptions: moved };
}
