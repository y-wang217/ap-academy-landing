import { expandOccurrences, type ClassException, type ClassSeries, type Occurrence } from "./recurrence";
import { addDays, isoWeekday } from "./wallclock";

/**
 * One month of a child's classes for the parent Calendar tab (REQ-24, ADR 0047).
 * Pure: `today` (YYYY-MM-DD, Toronto) and `now` (an ISO instant) are arguments.
 * Months are `YYYY-MM`. Weeks run Sunday to Saturday.
 */
export type ClassState = "scheduled" | "moved" | "cancelled" | "makeup";
export type CalendarClass = {
  key: string;
  date: string;
  startTime: string;
  endTime: string;
  subject: string;
  staffId: string;
  state: ClassState;
  /** Where a moved class came from; null for every other state. */
  original: { date: string; startTime: string } | null;
  /** The end time has passed. */
  done: boolean;
};
export type Day = { date: string; inMonth: boolean; isToday: boolean; classes: CalendarClass[] };
export type MonthSummary = { total: number; done: number; upcoming: number };
export type MonthView = {
  month: string;
  prev: string;
  next: string;
  today: string;
  weeks: Day[][];
  summary: MonthSummary;
  thisWeek: CalendarClass[];
};

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function monthRange(month: string): { from: string; to: string } {
  const from = `${month}-01`;
  return { from, to: addDays(`${shiftMonth(month, 1)}-01`, -1) };
}

export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/** `?month=` when it is a real month in 2000 to 2100, else today's month. */
export function parseMonth(value: string | undefined, today: string): string {
  const m = value ? MONTH_RE.exec(value) : null;
  if (m && Number(m[1]) >= 2000 && Number(m[1]) <= 2100) return value!;
  return today.slice(0, 7);
}

export function sundayWeekOf(date: string): { from: string; to: string } {
  const from = addDays(date, -(isoWeekday(date) % 7));
  return { from, to: addDays(from, 6) };
}

/** Decision 3: a scheduled occurrence of a one-off series is a makeup; a moved one stays Moved. */
export function classState(o: Pick<Occurrence, "status" | "kind">): ClassState {
  if (o.status === "cancelled") return "cancelled";
  if (o.status === "moved") return "moved";
  return o.kind === "one_off" ? "makeup" : "scheduled";
}

export function buildMonth(input: { series: ClassSeries[]; exceptions: ClassException[]; month: string; today: string; now: string }): MonthView {
  const { series, exceptions, month, today, now } = input;
  const startOf = new Map(series.map((s) => [s.id, s.startTime]));
  const nowMs = Date.parse(now);
  const toClass = (o: Occurrence): CalendarClass => {
    const state = classState(o);
    return {
      key: o.occurrenceKey,
      date: o.date,
      startTime: o.startTime,
      endTime: o.endTime,
      subject: o.subject,
      staffId: o.staffId,
      state,
      original: state === "moved" ? { date: o.originalDate, startTime: startOf.get(o.seriesId) ?? o.startTime } : null,
      done: Date.parse(o.endsAt) <= nowMs,
    };
  };
  const byTime = (a: CalendarClass, b: CalendarClass) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || a.key.localeCompare(b.key);

  const range = monthRange(month);
  const classes = expandOccurrences(series, exceptions, range).map(toClass).sort(byTime);
  const byDate = new Map<string, CalendarClass[]>();
  for (const c of classes) byDate.set(c.date, [...(byDate.get(c.date) ?? []), c]);

  const weeks: Day[][] = [];
  const last = sundayWeekOf(range.to).to;
  for (let d = sundayWeekOf(range.from).from; d <= last; d = addDays(d, 1)) {
    if (isoWeekday(d) === 7) weeks.push([]);
    const inMonth = d >= range.from && d <= range.to;
    weeks[weeks.length - 1].push({ date: d, inMonth, isToday: d === today, classes: inMonth ? (byDate.get(d) ?? []) : [] });
  }

  const live = classes.filter((c) => c.state !== "cancelled");
  const done = live.filter((c) => c.done).length;
  const thisWeek = expandOccurrences(series, exceptions, sundayWeekOf(today)).map(toClass).sort(byTime);

  return {
    month,
    prev: shiftMonth(month, -1),
    next: shiftMonth(month, 1),
    today,
    weeks,
    summary: { total: live.length, done, upcoming: live.length - done },
    thisWeek,
  };
}
