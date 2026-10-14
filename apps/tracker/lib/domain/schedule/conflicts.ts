import type { AvailabilityDay, AvailabilityException } from "./availability";
import type { Occurrence } from "./recurrence";
import { minutesOf } from "./wallclock";

export type ConflictReason = "time_off" | "outside_availability";
export type Conflict = { occurrence: Occurrence; reason: ConflictReason };
export type StaffAvailability = { days: AvailabilityDay[]; exceptions: AvailabilityException[] };

/**
 * Upcoming classes that do not fit wholly inside one available interval.
 * Wall-clock on both sides, so DST never enters. Cancelled classes and past
 * dates are skipped. A teacher with nothing entered is listed in `notEntered`
 * rather than flagged class by class.
 */
export function findConflicts(
  occurrences: Occurrence[],
  availability: Map<string, StaffAvailability>,
  today: string,
): { conflicts: Conflict[]; notEntered: string[] } {
  const conflicts: Conflict[] = [];
  const notEntered = new Set<string>();
  for (const o of occurrences) {
    if (o.status === "cancelled" || o.date < today) continue;
    const a = availability.get(o.staffId);
    const day = a?.days.find((d) => d.date === o.date);
    if (day?.state === "not_entered") {
      notEntered.add(o.staffId);
      continue;
    }
    const s = minutesOf(o.startTime);
    const e = minutesOf(o.endTime);
    if (day?.intervals.some((i) => minutesOf(i.start) <= s && e <= minutesOf(i.end))) continue;
    const hit = (a?.exceptions ?? []).some((x) => {
      if (x.kind !== "time_off" || x.onDate !== o.date) return false;
      if (!x.startTime || !x.endTime) return true;
      return minutesOf(x.startTime) < e && s < minutesOf(x.endTime);
    });
    conflicts.push({ occurrence: o, reason: hit ? "time_off" : "outside_availability" });
  }
  return { conflicts, notEntered: [...notEntered] };
}
