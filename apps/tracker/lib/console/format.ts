import { localHhmm, SCHEDULE_TIME_ZONE } from "../time";

/** The header clock, Toronto wall time: "Wed 22 Oct, 14:05". */
export function bridgeClock(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: SCHEDULE_TIME_ZONE, weekday: "short", day: "numeric", month: "short" }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("weekday")} ${get("day")} ${get("month")}, ${localHhmm(date)}`;
}

/** An ISO instant as Toronto HH:MM. */
export const hhmm = (iso: string) => localHhmm(new Date(iso));

/** A readout value, en-CA grouping; CAD has no cents, a unit follows the number. */
export function formatReadout(value: number, { unit, currency }: { unit?: string; currency?: "CAD" }): string {
  if (currency) return new Intl.NumberFormat("en-CA", { style: "currency", currency, currencyDisplay: "narrowSymbol", maximumFractionDigits: 0 }).format(value);
  const n = new Intl.NumberFormat("en-CA", { maximumFractionDigits: 1 }).format(value);
  return unit ? `${n} ${unit}` : n;
}
