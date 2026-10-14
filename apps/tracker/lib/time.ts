/** "Today" for due dates, in the students' time zone. The domain takes it as input. */
export const SCHEDULE_TIME_ZONE = "America/Toronto";
const TIME_ZONE = SCHEDULE_TIME_ZONE;

export function todayIso(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(now);
}
