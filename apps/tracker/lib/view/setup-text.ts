import type { DailyTaskCheck, RowKey, SetupRow, SetupState } from "../domain/setup-status";
import { notionTokenVariable } from "../notion/config";

/** Copy for the owner setup page (REQ-33). Pure strings; no em-dashes. */
export const ROW_LABELS: Record<RowKey, string> = {
  teachers: "Teachers approved",
  availability: "Teacher availability",
  schedules: "Student schedules adopted",
  parents: "Parent links",
  notionRecords: "Notion records on tracker students",
  dailyTask: "Daily task",
  guard: "Notion link guard (migration 0017)",
};

/** What a teacher, student or parent sees while the row is not done. */
export const WHILE_MISSING: Record<RowKey, string> = {
  teachers: "Teachers without a link cannot sign in to see their week.",
  availability: "Classes for a teacher with no hours are never checked for conflicts.",
  schedules: "Students not adopted have no classes here, so their teachers and parents see no calendar.",
  parents: "Parents without a link cannot sign in to see their child.",
  notionRecords: "A student without a Notion record shows their parent no calendar and no billing.",
  dailyTask: "Teachers get no daily text of their schedule.",
  guard: "Any teacher could point a student at another child's record.",
};

export const ADOPTION_FOOTNOTE = "Students with no Weekly Schedule are adopted by their first booking.";
export const COULD_NOT_READ_NOTION = "Could not read Notion";
export const COULD_NOT_CHECK = "Could not check";
export const BADGE: Record<SetupState, string> = { done: "Done", partial: "Partial", missing: "Missing", unknown: "Not checked" };
export const MISSING_PREFIX = "Missing:";
export const MAX_NAMES = 10;

/** The environment variable behind each daily task check. Names only, never values. */
export const CHECK_VARIABLE: Record<DailyTaskCheck["name"], string> = {
  notion_token: notionTokenVariable,
  cron_secret: "SCHEDULER_CRON_SECRET",
  org_id: "DAILY_TASK_ORG_ID",
};

const REPO = "https://github.com/y-wang217/ap-academy-landing/blob/main";
/** Where each row is fixed. `external` links leave /tracker and are plain <a> tags. */
export const ROW_LINKS: Record<RowKey, { label: string; href: string; external: boolean }> = {
  teachers: { label: "How to approve a teacher", href: `${REPO}/apps/tracker/docs/scheduler-operations.md#2-approve-or-revoke-a-teacher-login`, external: true },
  availability: { label: "Enter availability", href: "/schedule/availability", external: false },
  schedules: { label: "Adopt schedules", href: "/scheduler/schedules", external: false },
  parents: { label: "Open student list", href: "/", external: false },
  notionRecords: { label: "Open student list", href: "/", external: false },
  dailyTask: { label: "Open schedule", href: "/schedule", external: false },
  guard: { label: "Migration 0017 on GitHub", href: `${REPO}/supabase/migrations/0017_student_notion_link_owner_only.sql`, external: true },
};

/** "and N more" when a names list is cut at MAX_NAMES, else null. */
export function moreLine(total: number): string | null {
  return total > MAX_NAMES ? `and ${total - MAX_NAMES} more` : null;
}

/** The one count line under each row's label. */
export function countLine(row: SetupRow): string {
  if (row.failed === "notion") return COULD_NOT_READ_NOTION;
  if (row.failed === "db" || !row.facts) return COULD_NOT_CHECK;
  switch (row.key) {
    case "teachers": {
      const f = row.facts!;
      return f.total === 0 ? "No active teachers in Notion." : `${f.linked} of ${f.total} active teachers linked. ${f.signedIn} signed in.`;
    }
    case "availability": {
      const f = row.facts!;
      return f.linked === 0 ? "No teachers linked yet." : `${f.entered} of ${f.linked} linked teachers entered hours.`;
    }
    case "schedules": {
      const f = row.facts!;
      if (f.scheduled === 0) return "No active students have a Weekly Schedule yet.";
      return `${f.adopted} of ${f.scheduled} active students adopted.${f.failedSync > 0 ? ` ${f.failedSync} failed to sync.` : ""}`;
    }
    case "parents": {
      const f = row.facts!;
      return f.students === 0 ? "No students yet." : `${f.claimed} of ${f.students} students have a parent signed in. ${f.invitedOnly} invited, not signed in yet.`;
    }
    case "notionRecords": {
      const f = row.facts!;
      return f.students === 0 ? "No students yet." : `${f.linked} of ${f.students} students linked to Notion.`;
    }
    case "dailyTask": {
      const f = row.facts!;
      const unset = f.missingConfig.filter((c) => c.problem === "not_set").map((c) => CHECK_VARIABLE[c.name]);
      const parts: string[] = [];
      if (unset.length > 0) parts.push(`Not set: ${unset.join(", ")}.`);
      if (f.missingConfig.some((c) => c.problem === "other_org")) parts.push("DAILY_TASK_ORG_ID is set to another org.");
      if (parts.length > 0) return parts.join(" ");
      return row.state === "done" ? "Set up. A task is ready." : "Set up. No task is ready for today or yesterday.";
    }
    case "guard":
      return row.facts!.ok ? "Present." : "Not present, or turned off.";
  }
}
