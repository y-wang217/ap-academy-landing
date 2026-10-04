/** "Today" for due dates, in the students' time zone. The domain takes it as input. */
const TIME_ZONE = "America/Toronto";

export function todayIso(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(now);
}
