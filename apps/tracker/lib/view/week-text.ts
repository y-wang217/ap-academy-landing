import type { AvailabilityDay } from "../domain/schedule/availability";
import { formatDayHeading } from "./availability-text";

/** "4 h", "5.5 h", "45 min". */
export function formatHours(minutes: number): string {
  if (minutes > 0 && minutes < 60) return `${minutes} min`;
  const h = Math.round((minutes / 60) * 10) / 10;
  return `${h} h`;
}

/** Text for a day's availability, so the state never rests on colour alone. */
export function weekDayLabel(day: AvailabilityDay): string {
  if (day.state === "not_entered") return "No availability entered";
  if (day.state === "unavailable") return "Unavailable";
  return `Available ${day.intervals.map((i) => `${i.start}-${i.end}`).join(", ")}`;
}

export type Badge = { icon: string; label: string };
type CardLike = { date?: string; status: "scheduled" | "cancelled" | "moved"; conflict: "outside_availability" | "time_off" | null; originalDate: string };

/** Every state a class card can be in, each with an icon and words. A moved class can also carry a conflict badge. */
export function cardStatus(o: CardLike): Badge[] {
  if (o.status === "cancelled") return [{ icon: "✕", label: "Cancelled" }];
  const badges: Badge[] = [];
  if (o.status === "moved") badges.push({ icon: "↪", label: `Moved from ${formatDayHeading(o.originalDate)}` });
  if (o.conflict) badges.push({ icon: "⚠", label: o.conflict === "time_off" ? "Time off" : "Outside hours" });
  return badges.length > 0 ? badges : [{ icon: "●", label: "Scheduled" }];
}

/** The student's Notion page. Notion's own sharing decides whether it opens. */
export const notionStudentUrl = (id: string) => `https://www.notion.so/${id.replaceAll("-", "")}`;
