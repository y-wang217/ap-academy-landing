import { addDays, isoWeekday, minutesOf, timeOf } from "./wallclock";

export type AvailabilityWindow = {
  weekday: number;
  startTime: string;
  endTime: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
};
export type AvailabilityException = {
  onDate: string;
  kind: "time_off" | "extra";
  startTime: string | null;
  endTime: string | null;
};
export type AvailabilityDay = {
  date: string;
  state: "available" | "unavailable" | "not_entered";
  intervals: { start: string; end: string }[];
  availableMinutes: number;
};

type Span = [number, number];

function union(spans: Span[]): Span[] {
  const sorted = [...spans].sort((a, b) => a[0] - b[0]);
  const out: Span[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]);
    else out.push([s[0], s[1]]);
  }
  return out;
}
function subtract(spans: Span[], cut: Span): Span[] {
  return spans.flatMap(([a, b]): Span[] => {
    if (cut[1] <= a || cut[0] >= b) return [[a, b]];
    const parts: Span[] = [];
    if (cut[0] > a) parts.push([a, cut[0]]);
    if (cut[1] < b) parts.push([cut[1], b]);
    return parts;
  });
}

/**
 * Per local date: windows effective that day plus extra availability, unioned
 * (no double-counted capacity), minus time off. A staff member with no rows at
 * all is "not_entered", which is different from "unavailable".
 */
export function computeAvailability(
  windows: AvailabilityWindow[],
  exceptions: AvailabilityException[],
  range: { from: string; to: string },
): AvailabilityDay[] {
  const nothingEntered = windows.length === 0 && exceptions.length === 0;
  const days: AvailabilityDay[] = [];
  for (let date = range.from; date <= range.to; date = addDays(date, 1)) {
    if (nothingEntered) {
      days.push({ date, state: "not_entered", intervals: [], availableMinutes: 0 });
      continue;
    }
    const wd = isoWeekday(date);
    let spans: Span[] = windows
      .filter((w) => w.weekday === wd && w.effectiveFrom <= date && (!w.effectiveUntil || date <= w.effectiveUntil))
      .map((w): Span => [minutesOf(w.startTime), minutesOf(w.endTime)]);
    const today = exceptions.filter((e) => e.onDate === date);
    for (const e of today) if (e.kind === "extra" && e.startTime && e.endTime) spans.push([minutesOf(e.startTime), minutesOf(e.endTime)]);
    spans = union(spans);
    for (const e of today) {
      if (e.kind !== "time_off") continue;
      spans = subtract(spans, e.startTime && e.endTime ? [minutesOf(e.startTime), minutesOf(e.endTime)] : [0, 1440]);
    }
    const availableMinutes = spans.reduce((n, [a, b]) => n + b - a, 0);
    days.push({
      date,
      state: spans.length > 0 ? "available" : "unavailable",
      intervals: spans.map(([a, b]) => ({ start: timeOf(a), end: timeOf(b) })),
      availableMinutes,
    });
  }
  return days;
}
