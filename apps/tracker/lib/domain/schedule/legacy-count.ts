import { monthRange } from "./month";
import { addDays, isoWeekday } from "./wallclock";

/**
 * How the text-based monthly run counts a month (REQ-40). `parseSlot` is a
 * line-for-line TypeScript port of `parse_slot` in the ap-academy-monthly-admin
 * skill's build_month.py (the skill lives outside this repo; compared against
 * its published source on 2026-10-14):
 *
 *   left, _, course = line.partition("|"); course = course.split("|")[0].strip() or "Tutoring"
 *   re.match(r"(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})", left.strip())
 *   re.match(r"(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+([\d.]+)\s*h", left.strip())   # "Tue 1h | ENG4U English"
 *   otherwise: raise ValueError (which stops the whole monthly run)
 *
 * If the skill's parser changes, recheck this port: it is what keeps a
 * generated summary from stopping a billing run.
 */
export type Slot = { day: string; start: string | null; end: string | null; hours: number; course: string };

export function parseSlot(text: string): Slot[] {
  const out: Slot[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const bar = line.indexOf("|");
    const left = (bar < 0 ? line : line.slice(0, bar)).trim();
    const course = (bar < 0 ? "" : line.slice(bar + 1).split("|")[0].trim()) || "Tutoring";
    const range = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/.exec(left);
    if (range) {
      const [, day, h1, m1, h2, m2] = range;
      const hours = (Number(h2) * 60 + Number(m2) - (Number(h1) * 60 + Number(m1))) / 60;
      out.push({ day, start: `${h1.padStart(2, "0")}:${m1}`, end: `${h2.padStart(2, "0")}:${m2}`, hours, course });
      continue;
    }
    const hoursOnly = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+([\d.]+)\s*h/.exec(left);
    if (hoursOnly) {
      out.push({ day: hoursOnly[1], start: null, end: null, hours: Number(hoursOnly[2]), course });
      continue;
    }
    throw new Error(`Cannot parse schedule line: ${line}`);
  }
  return out;
}

const WEEKDAY: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
export type TextSession = { date: string; hours: number; course: string };

/**
 * One session per slot per date in the month on the slot's weekday, as the run
 * bills it (Decision 2: every matching weekday counts). `from` and `until` are
 * ignored, as the run ignores them. Throws when a line cannot be read.
 */
export function textMonthSessions(text: string, month: string): TextSession[] {
  const slots = parseSlot(text);
  const { from, to } = monthRange(month);
  const out: TextSession[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    for (const s of slots) if (WEEKDAY[s.day] === isoWeekday(d)) out.push({ date: d, hours: s.hours, course: s.course });
  }
  return out;
}
