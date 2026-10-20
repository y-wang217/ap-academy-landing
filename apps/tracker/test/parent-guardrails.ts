/**
 * What no parent-facing file may contain (REQ-24, shared with the other Parent
 * cards). One list: add a card's files to the scan, not a second list.
 */
export const PARENT_FORBIDDEN: RegExp[] = [
  /lessons|payout|invoice|credit|billing/i,
  /6300f58a/,
  // REQ-39: class outcomes (delivered, no-show) stay out of parent views until Charlie opens them.
  /occurrence_outcomes/,
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

/**
 * What no Billing tab file may contain (REQ-25, AC12). PARENT_FORBIDDEN stays
 * calendar-only because it bans the billing words themselves. Case-sensitive
 * and word-bounded, so a property name is caught but ordinary prose is not.
 */
export const BILLING_FORBIDDEN: RegExp[] = [
  /\bParent (Phone|Email|Name)\b/,
  /\bSales Notes\b/,
  /\bNotes\b/,
  /\bDiscounts\b/,
  /\bLast Invoice\b/,
  /\bLessons\b/,
  /\bPayouts\b/,
  /\bReason\b/,
  /\bBilled Month\b/,
  /6300f58a/,
  // REQ-39: class outcomes (delivered, no-show) stay out of parent views until Charlie opens them.
  /occurrence_outcomes/,
  /unstable_cache/,
  /\.(insert|update|upsert|delete|rpc)\(/,
  /service.?role|createServiceClient/i,
  /PATCH/,
  /console\./,
];

/** Billing tab files (REQ-25), relative to apps/tracker. */
export const PARENT_BILLING_FILES = [
  "lib/notion/billing.ts",
  "lib/domain/billing.ts",
  "lib/view/parent-billing.ts",
  "lib/data/parent-billing.ts",
  "app/parent/[studentId]/billing/page.tsx",
  "app/parent/[studentId]/billing/invoices/[invoiceId]/route.ts",
  "components/parent-billing.tsx",
];
