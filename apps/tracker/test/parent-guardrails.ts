/**
 * What no parent-facing file may contain (REQ-24, shared with the other Parent
 * cards). One list: add a card's files to the scan, not a second list.
 */
export const PARENT_FORBIDDEN: RegExp[] = [
  /lessons|payout|invoice|credit|billing/i,
  /6300f58a/,
  /weekly.?schedule/i,
  /api\.notion\.com/,
  /console\./,
  /\.(insert|update|upsert|delete|rpc)\(/,
  /service.?role|createServiceClient/i,
];

/** Calendar tab files (REQ-24), relative to apps/tracker. */
export const PARENT_CALENDAR_FILES = [
  "app/parent/[studentId]/calendar/page.tsx",
  "components/parent-calendar.tsx",
  "lib/domain/schedule/month.ts",
  "lib/view/calendar-text.ts",
  "lib/data/parent-calendar.ts",
];
