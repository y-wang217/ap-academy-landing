import { findConflicts, type StaffAvailability } from "./conflicts";
import type { Occurrence } from "./recurrence";
import { addDays, minutesOf } from "./wallclock";

export const HORIZON_DAYS = 182;
export const MAX_PROBLEMS = 10;

export type BookingReason = "teacher_busy" | "student_busy" | "outside_availability" | "time_off" | "availability_not_entered";
/** Deliberately only a slot and a reason: never the other class's student, subject or teacher. */
export type BookingProblem = { date: string; startTime: string; endTime: string; reason: BookingReason };

/** Dates to check for a booking: from the later of the first date and today, to the earlier of the series end and today + 182 days. Null when nothing is left. */
export function bookingWindow(firstDate: string, today: string, effectiveUntil: string | null): { from: string; to: string } | null {
  const from = firstDate > today ? firstDate : today;
  const horizon = addDays(today, HORIZON_DAYS);
  const to = effectiveUntil && effectiveUntil < horizon ? effectiveUntil : horizon;
  return from > to ? null : { from, to };
}

/**
 * Problems for candidate occurrences, in date order. Two classes clash when
 * they share a teacher or a student, fall on the same date and overlap in
 * wall-clock minutes (touching is fine). `others` may include cancelled
 * occurrences and the candidate's own old self; cancelled ones are ignored and
 * `excludeKeys` drops the rest. Availability reuses findConflicts.
 */
export function checkBooking(input: {
  candidates: Occurrence[];
  others: Occurrence[];
  availability: Map<string, StaffAvailability>;
  checkAvailability: boolean;
  today: string;
  excludeKeys?: Set<string>;
}): BookingProblem[] {
  const { candidates, availability, checkAvailability, today, excludeKeys } = input;
  const live = input.others.filter((o) => o.status !== "cancelled" && !excludeKeys?.has(o.occurrenceKey));
  const problems: (BookingProblem & { order: number })[] = [];
  const slot = (c: Occurrence) => ({ date: c.date, startTime: c.startTime, endTime: c.endTime });
  const sortKey = (c: Occurrence) => c.date + c.startTime;
  const order = new Map(candidates.map((c, i) => [c, i]));

  for (const c of candidates) {
    const s = minutesOf(c.startTime);
    const e = minutesOf(c.endTime);
    const clash = (o: Occurrence) => o.date === c.date && s < minutesOf(o.endTime) && minutesOf(o.startTime) < e;
    if (live.some((o) => o.staffId === c.staffId && clash(o))) problems.push({ ...slot(c), reason: "teacher_busy", order: order.get(c)! });
    if (live.some((o) => o.studentId === c.studentId && clash(o))) problems.push({ ...slot(c), reason: "student_busy", order: order.get(c)! });
  }
  if (checkAvailability) {
    const { conflicts, notEntered } = findConflicts(candidates, availability, today);
    for (const x of conflicts) problems.push({ ...slot(x.occurrence), reason: x.reason, order: order.get(x.occurrence)! });
    const missing = new Set(notEntered);
    for (const c of candidates) if (missing.has(c.staffId) && c.status !== "cancelled" && c.date >= today) problems.push({ ...slot(c), reason: "availability_not_entered", order: order.get(c)! });
  }
  const byCandidate = new Map(candidates.map((c) => [order.get(c)!, sortKey(c)]));
  return problems
    .sort((a, b) => byCandidate.get(a.order)!.localeCompare(byCandidate.get(b.order)!))
    .map(({ order: _o, ...p }) => (void _o, p));
}
