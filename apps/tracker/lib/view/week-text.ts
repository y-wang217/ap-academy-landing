import type { AvailabilityDay } from "../domain/schedule/availability";
import type { ClassPurpose } from "../domain/schedule/recurrence";
import { formatDayHeading } from "./availability-text";
import { oneOffLabel } from "./calendar-text";

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
type CardLike = {
  date?: string; status: "scheduled" | "cancelled" | "moved"; conflict: "outside_availability" | "time_off" | null; originalDate: string;
  kind?: "one_off" | "weekly"; purpose?: ClassPurpose | null;
};

/**
 * Every state a class card can be in, each with an icon and words. A moved class can also carry a conflict badge.
 * A scheduled one-off shows its purpose word, "Class" when none is set (ADR 0051).
 */
export function cardStatus(o: CardLike): Badge[] {
  if (o.status === "cancelled") return [{ icon: "✕", label: "Cancelled" }];
  const badges: Badge[] = [];
  if (o.status === "moved") badges.push({ icon: "↪", label: `Moved from ${formatDayHeading(o.originalDate)}` });
  else if (o.kind === "one_off") badges.push({ icon: "◆", label: oneOffLabel(o.purpose) });
  if (o.conflict) badges.push({ icon: "⚠", label: o.conflict === "time_off" ? "Time off" : "Outside hours" });
  return badges.length > 0 ? badges : [{ icon: "●", label: "Scheduled" }];
}

/** The class dialog's Purpose row: one-offs only. */
export function purposeRow(card: { kind: "one_off" | "weekly"; purpose?: ClassPurpose | null }): { term: string; value: string } | null {
  return card.kind === "one_off" ? { term: "Purpose", value: oneOffLabel(card.purpose) } : null;
}

/** The student's Notion page. Notion's own sharing decides whether it opens. */
export const notionStudentUrl = (id: string) => `https://www.notion.so/${id.replaceAll("-", "")}`;
