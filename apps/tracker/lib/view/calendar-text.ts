import { greetingName } from "../domain/schedule/daily-texts";
import { sundayWeekOf, type CalendarClass, type ClassState, type MonthSummary } from "../domain/schedule/month";
import type { ClassPurpose } from "../domain/schedule/recurrence";

// Words and tones for the parent Calendar tab (REQ-24, ADR 0047, ADR 0051). Pure.

export const PURPOSE_LABEL: Record<ClassPurpose, string> = {
  makeup: "Makeup",
  trial: "Trial",
  extra: "Extra",
};

/** A one-off's word: its declared purpose, or "Class", never "Makeup" by default. */
export const oneOffLabel = (purpose: ClassPurpose | null | undefined) => (purpose ? PURPOSE_LABEL[purpose] : "Class");

export const STATE_LABEL: Record<ClassState, string> = {
  scheduled: "Scheduled",
  moved: "Moved",
  cancelled: "Cancelled",
  ...PURPOSE_LABEL,
  class: "Class",
};

/** Decision 5: every state also has its word, so colour is never the only signal. The one-off states share neutral. */
export const STATE_TONE: Record<ClassState, "ok" | "warn" | "neutral" | "error"> = {
  scheduled: "ok",
  moved: "warn",
  makeup: "neutral",
  trial: "neutral",
  extra: "neutral",
  class: "neutral",
  cancelled: "error",
};

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const parts = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return { y, m, d, wd: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
};

export function summaryLine(s: MonthSummary): string {
  if (s.total === 0) return "No classes this month.";
  return `${s.total} ${s.total === 1 ? "class" : "classes"} this month · ${s.past} past · ${s.upcoming} upcoming`;
}

/** "17:30" -> "5:30 PM". */
export function clock(time: string): string {
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** "2026-10" -> "October 2026". */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/** "2026-10-13" -> "Tue Oct 13". */
export function dayLabel(date: string): string {
  const p = parts(date);
  return `${WEEKDAYS[p.wd].slice(0, 3)} ${MONTHS[p.m - 1].slice(0, 3)} ${p.d}`;
}

/** "2026-10-13" -> "Tuesday October 13". */
export function fullDate(date: string): string {
  const p = parts(date);
  return `${WEEKDAYS[p.wd]} ${MONTHS[p.m - 1]} ${p.d}`;
}

/** AC5: weekday only when the original is in the same Sunday week as the new date. */
export function movedNote(c: CalendarClass): string {
  if (!c.original) return "";
  const sameWeek = sundayWeekOf(c.original.date).from === sundayWeekOf(c.date).from;
  const day = sameWeek ? dayLabel(c.original.date).slice(0, 3) : `${dayLabel(c.original.date)},`;
  return `Moved from ${day} ${clock(c.original.startTime)}`;
}

/** "Makeup for Tue Oct 13" when the makeup names the class it replaces. Only a label (ADR 0051). */
export function makeupNote(c: CalendarClass): string {
  return c.makeupFor ? `Makeup for ${dayLabel(c.makeupFor)}` : "";
}

export const teacherFirstName = (name: string) => greetingName(name);

const byStart = (classes: CalendarClass[]) => [...classes].sort((a, b) => a.startTime.localeCompare(b.startTime) || a.key.localeCompare(b.key));

/** At most three dots, by start time, then a count of the rest. */
export function dayDots(classes: CalendarClass[]): { dots: ClassState[]; more: number } {
  const sorted = byStart(classes);
  return { dots: sorted.slice(0, 3).map((c) => c.state), more: Math.max(0, sorted.length - 3) };
}

/** The day cell's accessible name: "Tuesday October 13: Scheduled, Cancelled". */
export function cellLabel(day: { date: string; classes: CalendarClass[] }): string {
  const words = byStart(day.classes).map((c) => STATE_LABEL[c.state]);
  return `${fullDate(day.date)}: ${words.length ? words.join(", ") : "no classes"}`;
}
