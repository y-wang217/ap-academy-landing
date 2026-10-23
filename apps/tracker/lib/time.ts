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

/** Minutes the time zone is ahead of UTC at `at` (negative in Toronto). */
function zoneOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  const wall = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return Math.round((wall - Math.floor(at.getTime() / 60_000) * 60_000) / 60_000);
}

/**
 * A local wall time (YYYY-MM-DD and HH:MM in the students' time zone) as an
 * ISO datetime with that zone's offset, e.g. "2026-10-26T15:00:00-04:00"
 * (REQ-61). The offset is the one in force at that wall time, so both sides
 * of a DST change are right.
 */
export function zonedIso(dateIso: string, hhmm: string): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, h, mi);
  let offset = zoneOffsetMinutes(new Date(wall));
  offset = zoneOffsetMinutes(new Date(wall - offset * 60_000));
  const sign = offset < 0 ? "-" : "+";
  const abs = Math.abs(offset);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dateIso}T${pad(h)}:${pad(mi)}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}
