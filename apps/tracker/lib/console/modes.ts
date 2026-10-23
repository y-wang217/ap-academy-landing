import { weekOf } from "../domain/schedule/week";
import { addDays } from "../domain/schedule/wallclock";

/** The console's three modes (REQ-55 AC2). The URL's ?mode= picks one; anything else is Sales. */
export const CONSOLE_MODES = ["sales", "creation", "operations"] as const;
export type ConsoleMode = (typeof CONSOLE_MODES)[number];

export const MODE_LABELS: Record<ConsoleMode, string> = { sales: "Sales", creation: "Creation", operations: "Operations" };

export function parseMode(value: unknown): ConsoleMode {
  const first = Array.isArray(value) ? value[0] : value;
  return CONSOLE_MODES.find((m) => m === first) ?? "sales";
}

/** The tab a key moves to in a tablist of `count` tabs, or null when the key is not a move. */
export function tabKeyTarget(key: string, index: number, count: number): number | null {
  switch (key) {
    case "ArrowRight":
      return (index + 1) % count;
    case "ArrowLeft":
      return (index - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

/**
 * The Toronto week ?week= picks (REQ-56 AC9): the week of a valid YYYY-MM-DD date, or the current
 * week for anything missing, malformed or in the future.
 */
export function parseWeek(value: unknown, today: string): { from: string; to: string } {
  const first = Array.isArray(value) ? value[0] : value;
  const valid = typeof first === "string" && /^\d{4}-\d{2}-\d{2}$/.test(first) && addDays(first, 0) === first;
  return weekOf(valid && first <= today ? first : today);
}

/** The lesson-gap window ?gapDays= picks (REQ-58 AC8): a whole number from 1 to 31, else 14. */
export function parseGapDays(value: unknown): number {
  const first = Array.isArray(value) ? value[0] : value;
  if (typeof first !== "string" || !/^\d{1,2}$/.test(first)) return 14;
  const n = Number(first);
  return n >= 1 && n <= 31 ? n : 14;
}

/** The trial and cash window ?window= picks (REQ-59 AC6): 7, 30 or 90 days, else 30. */
export function parseWindow(value: unknown): 7 | 30 | 90 {
  const first = Array.isArray(value) ? value[0] : value;
  return first === "7" ? 7 : first === "90" ? 90 : 30;
}

/** A "?..." href with one parameter set and every other one kept. */
export function withParam(search: URLSearchParams, key: string, value: string): string {
  const next = new URLSearchParams(search);
  next.set(key, value);
  return `?${next}`;
}

/** The lead ?lead= preselects in Sales (REQ-62): a Notion page id, dashed or not, else null. */
export function parseLead(value: unknown): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "string" && /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(first) ? first : null;
}
