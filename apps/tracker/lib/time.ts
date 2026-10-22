/** "Today" for due dates, in the students' time zone. The domain takes it as input. */
export const SCHEDULE_TIME_ZONE = "America/Toronto";
const TIME_ZONE = SCHEDULE_TIME_ZONE;

export function todayIso(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(now);
}

/** Local wall-clock time as zero-padded HH:MM, for "is it past 06:00 yet" and "last updated" text. */
export function localHhmm(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("hour")}:${get("minute")}`;
}

/**
 * The local calendar date (YYYY-MM-DD) of a Notion date value (REQ-54). A
 * date-only value is already local and is returned as is; a datetime is an
 * instant, read in the students' time zone. Null for null or an unreadable value.
 */
export function localDateOf(iso: string | null): string | null {
  if (iso === null) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? null : todayIso(at);
}
