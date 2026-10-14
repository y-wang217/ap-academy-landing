import type { AvailabilityDay } from "../domain/schedule/availability";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** "Mon Oct 19" from an ISO date. Calendar arithmetic only, no time zone involved. */
export function formatDayHeading(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const wd = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  return `${WEEKDAYS[wd]} ${MONTHS[m - 1]} ${d}`;
}

/** Text plus icon for a day, so state is never carried by colour alone. */
export function dayLabel(day: AvailabilityDay, hasTimeOff: boolean): { icon: string; text: string } {
  const hours = day.intervals.map((i) => `${i.start}-${i.end}`).join(", ");
  if (day.state === "available") return { icon: "✓", text: hasTimeOff ? `Time off, available ${hours}` : `Available ${hours}` };
  if (day.state === "unavailable") return { icon: "✕", text: hasTimeOff ? "Time off" : "Unavailable" };
  return { icon: "○", text: "Not entered" };
}

export function conflictReasonText(reason: "time_off" | "outside_availability"): string {
  return reason === "time_off" ? "Time off" : "Outside available hours";
}
