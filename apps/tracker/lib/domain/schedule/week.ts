import type { AvailabilityDay } from "./availability";
import type { Occurrence } from "./recurrence";
import { addDays, isoWeekStart, minutesOf } from "./wallclock";

export type WeekTotals = { scheduledMinutes: number; availableMinutes: number | null; remainingMinutes: number | null };
type Span = [number, number];

/** The Monday-to-Sunday week that contains a local date. */
export function weekOf(date: string): { from: string; to: string } {
  const from = isoWeekStart(date);
  return { from, to: addDays(from, 6) };
}

function union(spans: Span[]): Span[] {
  const sorted = [...spans].sort((a, b) => a[0] - b[0]);
  const out: Span[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]);
    else out.push([s[0], s[1]]);
  }
  return out;
}
const overlap = (a: Span, b: Span) => Math.max(0, Math.min(a[1], b[1]) - Math.max(a[0], b[0]));

/**
 * Scheduled = scheduled and moved class minutes. Remaining = available minutes
 * minus the booked minutes that fall inside availability, so a class outside
 * hours does not shrink what is left (ADR 0037). Class spans are unioned per
 * day before they are intersected, so two overlapping classes subtract once.
 * Cancelled classes add nothing. A week where every day is not_entered has
 * null availability and null remaining, never 0.
 */
export function weekTotals(occurrences: Occurrence[], days: AvailabilityDay[]): WeekTotals {
  const live = occurrences.filter((o) => o.status !== "cancelled");
  const scheduledMinutes = live.reduce((n, o) => n + o.durationMinutes, 0);
  if (days.length === 0 || days.every((d) => d.state === "not_entered")) return { scheduledMinutes, availableMinutes: null, remainingMinutes: null };

  const availableMinutes = days.reduce((n, d) => n + d.availableMinutes, 0);
  let inside = 0;
  for (const day of days) {
    const spans = union(live.filter((o) => o.date === day.date).map((o): Span => [minutesOf(o.startTime), minutesOf(o.endTime)]));
    for (const s of spans) for (const i of day.intervals) inside += overlap(s, [minutesOf(i.start), minutesOf(i.end)]);
  }
  return { scheduledMinutes, availableMinutes, remainingMinutes: Math.max(0, availableMinutes - inside) };
}
