import { createHash } from "node:crypto";
import type { Occurrence } from "./recurrence";

/**
 * The daily "Text teachers their schedules" task (REQ-8), as pure functions:
 * what each teacher's day looks like, and which blocks need rewriting on a
 * refresh. Nothing here touches Notion, Next or Supabase.
 */
export type StaffLite = { id: string; name: string; active: boolean };
export type TeacherLine = { text: string; cancelled: boolean; meetingLink: string | null };
export type TeacherDay = {
  staffId: string;
  name: string;
  notActive: boolean;
  /** The to-do text without any Resend label. */
  title: string;
  /** One line under the title: the class count, or "No classes scheduled today". */
  summary: string;
  lines: TeacherLine[];
  linkUrl: string;
  copyText: string;
  /** sha-256 hex of everything the block shows, so a change is a different string. */
  fingerprint: string;
};

export const NOT_ACTIVE = "(not active in Staff)";
export const RESEND_LABEL = "Resend: schedule changed after you texted.";
export const NO_CLASSES = "No classes scheduled today";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Mon Oct 19" for a YYYY-MM-DD date. */
export function shortDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${MONTHS[m - 1]} ${d}`;
}

export const dailyTaskTitle = (date: string) => `Text teachers their schedules — ${date}`;

/** Both arguments are zero-padded HH:MM, so string order is time order. */
export const isDue = (nowLocalTime: string, configured: string) => nowLocalTime >= configured;

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export function buildTeacherDays(input: {
  date: string;
  staff: StaffLite[];
  occurrences: Occurrence[];
  studentNames: Map<string, string>;
  scheduleUrl: (staffId: string, date: string) => string;
}): TeacherDay[] {
  const { date } = input;
  const today = input.occurrences.filter((o) => o.date === date);
  const byStaff = new Map<string, Occurrence[]>();
  for (const o of today) byStaff.set(o.staffId, [...(byStaff.get(o.staffId) ?? []), o]);

  const people = new Map<string, { name: string; notActive: boolean }>();
  for (const s of input.staff) {
    if (s.active) people.set(s.id, { name: s.name, notActive: false });
    else if (byStaff.has(s.id)) people.set(s.id, { name: s.name, notActive: true });
  }
  for (const id of byStaff.keys()) if (!people.has(id)) people.set(id, { name: "Unknown teacher", notActive: true });

  const days = [...people].map(([staffId, p]): TeacherDay => {
    const lines = (byStaff.get(staffId) ?? [])
      .slice()
      .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.occurrenceKey.localeCompare(b.occurrenceKey))
      .map((o): TeacherLine => {
        const student = input.studentNames.get(o.studentId) ?? "A student";
        const base = `${o.startTime}-${o.endTime} ${student}, ${o.subject}`;
        return { text: o.status === "cancelled" ? `Cancelled: ${base}` : base, cancelled: o.status === "cancelled", meetingLink: null };
      });
    const live = lines.filter((l) => !l.cancelled).length;
    const linkUrl = input.scheduleUrl(staffId, date);
    const first = p.name.split(/\s+/)[0] || p.name;
    const copyText =
      lines.length === 0
        ? `Hi ${first}, no classes scheduled for you today (${shortDate(date)}).`
        : [`Hi ${first}, your classes today (${shortDate(date)}):`, ...lines.map((l) => (l.meetingLink ? `${l.text} ${l.meetingLink}` : l.text)), `Your schedule: ${linkUrl}`].join("\n");
    const count = `${live} ${live === 1 ? "class" : "classes"}`;
    const summary = lines.length === 0 ? NO_CLASSES : count;
    const title = `${p.name}${p.notActive ? ` ${NOT_ACTIVE}` : ""}: ${lines.length === 0 ? NO_CLASSES : count}`;
    const fingerprint = sha(JSON.stringify([title, lines, linkUrl, copyText]));
    return { staffId, name: p.name, notActive: p.notActive, title, summary, lines, linkUrl, copyText, fingerprint };
  });
  return days.sort((a, b) => a.name.localeCompare(b.name) || a.staffId.localeCompare(b.staffId));
}

/** What `tracker.daily_task_teachers` remembers about one block. */
export type StoredTeacher = {
  staffId: string;
  blockId: string;
  writtenFingerprint: string;
  /** The block's last_edited_time Notion returned after our last write. */
  writtenAt: string;
  acknowledgedFingerprint: string | null;
  labelled: boolean;
};
export type NotionToDo = { checked: boolean; lastEditedTime: string };
export type TeacherPlan = {
  staffId: string;
  /** No block yet (or it was deleted): create one at the end. */
  isNew: boolean;
  write: boolean;
  label: boolean;
  acknowledged: string | null;
};

/**
 * Per teacher: rewrite the block, and show the Resend label? A tick Charlie
 * made after our last write acknowledges the version we wrote. A day that
 * differs from the acknowledged version, while ticked, is labelled. An
 * unticked block is never labelled.
 */
export function planRefresh(stored: StoredTeacher[], current: TeacherDay[], notion: Map<string, NotionToDo>): TeacherPlan[] {
  const byStaff = new Map(stored.map((s) => [s.staffId, s]));
  return current.map((day): TeacherPlan => {
    const prev = byStaff.get(day.staffId);
    const block = prev ? notion.get(prev.blockId) : undefined;
    if (!prev || !block) return { staffId: day.staffId, isNew: true, write: true, label: false, acknowledged: null };
    let acknowledged = prev.acknowledgedFingerprint;
    if (!block.checked) acknowledged = null;
    else if (acknowledged === null || block.lastEditedTime > prev.writtenAt) acknowledged = prev.writtenFingerprint;
    const label = block.checked && acknowledged !== day.fingerprint;
    return { staffId: day.staffId, isNew: false, write: day.fingerprint !== prev.writtenFingerprint || label !== prev.labelled, label, acknowledged };
  });
}
