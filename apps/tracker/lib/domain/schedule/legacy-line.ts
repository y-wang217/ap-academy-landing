import { timeOf } from "./wallclock";

/**
 * Parser for the legacy Weekly Schedule text on Students & Parents: one slot
 * per line, `Day HH:MM-HH:MM | Course | Teacher`. Pure: no Next, Supabase or
 * Notion imports. A rejected line carries exactly one reason code.
 */
export type RejectReason =
  | "unparseable_day"
  | "unparseable_time"
  | "no_fixed_time"
  | "invalid_duration"
  | "missing_course"
  | "missing_teacher"
  | "teacher_not_found"
  | "teacher_ambiguous"
  | "teacher_inactive"
  | "extra_fields"
  | "duplicate_line";

export type ParsedLine = { ok: true; weekday: number; startTime: string; durationMinutes: number; subject: string; teacherName: string };
export type ParseResult = ParsedLine | { ok: false; reason: RejectReason };

const DAYS: Record<string, number> = {
  mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6, sun: 7, sunday: 7,
};
export const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

/** Unescapes display escapes, turns `<br>` and CRLF into line breaks, drops blank lines. */
export function normaliseScheduleText(text: string): string[] {
  return text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/\r\n?/g, "\n")
    .replace(/\\([|:])/g, "$1")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "");
}

const TIME = String.raw`(\d{1,2}):(\d{2})\s*(am|pm)?`;
const RANGE = new RegExp(String.raw`^${TIME}\s*(?:-|–|—|to)\s*${TIME}$`, "i");
const HOURS_ONLY = /^\d+(?:\.\d+)?\s*(?:h|hr|hrs|hour|hours)$/i;

function toMinutes(h: string, m: string, suffix: string | undefined): number | null {
  let hour = Number(h);
  const min = Number(m);
  if (min > 59) return null;
  if (suffix) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (suffix.toLowerCase() === "pm" ? 12 : 0);
  } else if (hour > 23) return null;
  return hour * 60 + min;
}

export function parseScheduleLine(line: string): ParseResult {
  const fields = line.replace(/\\([|:])/g, "$1").split("|").map(squash);
  if (fields.length > 3) return { ok: false, reason: "extra_fields" };
  const slot = /^([A-Za-z]+)\.?\s+(.+)$/.exec(fields[0]);
  const weekday = slot ? DAYS[slot[1].toLowerCase()] : undefined;
  if (!slot || !weekday) return { ok: false, reason: "unparseable_day" };
  const rest = slot[2];
  if (HOURS_ONLY.test(rest)) return { ok: false, reason: "no_fixed_time" };
  const m = RANGE.exec(rest);
  if (!m) return { ok: false, reason: "unparseable_time" };
  // "5:30-6:30pm": a suffix on one side applies to the other.
  const startSuffix = m[3] ?? m[6];
  const endSuffix = m[6] ?? m[3];
  const start = toMinutes(m[1], m[2], startSuffix);
  const end = toMinutes(m[4], m[5], endSuffix);
  if (start === null || end === null) return { ok: false, reason: "unparseable_time" };
  const duration = end - start;
  if (duration < 15 || duration > 480 || duration % 5 !== 0 || start % 5 !== 0) return { ok: false, reason: "invalid_duration" };
  const subject = fields[1] ?? "";
  if (subject === "" || subject.length > 80) return { ok: false, reason: "missing_course" };
  const teacherName = fields[2] ?? "";
  if (teacherName === "") return { ok: false, reason: "missing_teacher" };
  return { ok: true, weekday, startTime: timeOf(start), durationMinutes: duration, subject, teacherName };
}

/** `Tue 17:30-18:30 | Math | Jane Doe`: the form the summary uses and the import hashes. */
export function canonicalLine(p: Pick<ParsedLine, "weekday" | "startTime" | "durationMinutes" | "subject" | "teacherName">): string {
  const [h, m] = p.startTime.split(":").map(Number);
  return `${DAY_NAMES[p.weekday - 1]} ${p.startTime}-${timeOf(h * 60 + m + p.durationMinutes)} | ${p.subject} | ${p.teacherName}`;
}
