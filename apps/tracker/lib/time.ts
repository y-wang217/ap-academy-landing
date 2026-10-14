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
