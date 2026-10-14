/**
 * Wall-clock helpers for the scheduler. Dates are `YYYY-MM-DD` strings and
 * times `HH:MM`, both local to the schedule zone. Only localToUtc touches
 * instants. Pure: no Next, Supabase or Notion.
 */
export const SCHEDULE_ZONE = "America/Toronto";

const DAY_MS = 86_400_000;
const parseDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const fmtDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const addDays = (iso: string, n: number) => fmtDate(parseDate(iso) + n * DAY_MS);
/** ISO weekday: 1 = Monday ... 7 = Sunday. */
export const isoWeekday = (iso: string) => ((new Date(parseDate(iso)).getUTCDay() + 6) % 7) + 1;
export const isoWeekStart = (iso: string) => addDays(iso, 1 - isoWeekday(iso));
export const daysBetween = (a: string, b: string) => Math.round((parseDate(b) - parseDate(a)) / DAY_MS);

export const minutesOf = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};
export const timeOf = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

const formatters = new Map<string, Intl.DateTimeFormat>();
function offsetAt(ms: number, zone: string): number {
  let f = formatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: zone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric",
    });
    formatters.set(zone, f);
  }
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, Number(x.value)]));
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/**
 * Local wall-clock to a UTC instant (ISO string). A time inside the spring
 * gap shifts forward by the gap; an ambiguous fall-back time takes the
 * earlier offset.
 */
export function localToUtc(date: string, time: string, zone: string = SCHEDULE_ZONE): string {
  const naive = parseDate(date) + minutesOf(time) * 60_000;
  const candidates = new Set<number>();
  for (const probe of [naive - 12 * 3_600_000, naive + 12 * 3_600_000]) {
    const off = offsetAt(probe, zone);
    if (offsetAt(naive - off, zone) === off) candidates.add(naive - off);
  }
  if (candidates.size > 0) return new Date(Math.min(...candidates)).toISOString();
  return new Date(naive - offsetAt(naive - 12 * 3_600_000, zone)).toISOString();
}
