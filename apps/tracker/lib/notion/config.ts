/**
 * Scheduler's Notion settings. The feature is off unless NOTION_TOKEN is set
 * (same pattern as lib/ai/config.ts). This folder is the only place that reads
 * the token, and only server modules import it.
 */
export const NOTION_VERSION = "2025-09-03";
export const DEFAULT_STAFF_DATA_SOURCE_ID = "eaf8e9be-9ec3-4e0d-9442-f2c2ce111925";
export const DEFAULT_STUDENTS_DATA_SOURCE_ID = "fe3d651a-70c6-4d1e-8a38-656163d6bc63";

/** The token variable's name, for messages that say a setting is missing (REQ-33). Never its value. */
export const notionTokenVariable = "NOTION_TOKEN";

export type NotionConfig = { token: string; dataSourceId: string };

export function readNotionConfig(): NotionConfig | null {
  const token = process.env.NOTION_TOKEN;
  if (!token) return null;
  return { token, dataSourceId: process.env.NOTION_STAFF_DATA_SOURCE_ID || DEFAULT_STAFF_DATA_SOURCE_ID };
}

export function notionConfigured(): boolean {
  return readNotionConfig() !== null;
}

/** Same token, pointed at Students & Parents (REQ-4). Needs read and update access on that database. */
export function readStudentsConfig(): NotionConfig | null {
  const token = process.env.NOTION_TOKEN;
  if (!token) return null;
  return { token, dataSourceId: process.env.NOTION_STUDENTS_DATA_SOURCE_ID || DEFAULT_STUDENTS_DATA_SOURCE_ID };
}

/**
 * Override for where Notion's API lives, or null for the real one (the default
 * stays in staff.ts). Server env only. The e2e stack points it at a local mock
 * so the scheduler runs without a token that can reach Notion. Never read from
 * a request.
 */
export function notionApiBaseOverride(): string | null {
  const v = process.env.NOTION_API_BASE;
  return v ? v.replace(/\/$/, "") : null;
}

export const DEFAULT_WORK_DATA_SOURCE_ID = "3031b455-9be0-4f8d-b200-70fcfcf1a0b8";
export const DEFAULT_WORK_LOG_DATA_SOURCE_ID = "03257601-dfe2-42dd-affb-49dcfe1d2dcf";
export type WorkConfig = { token: string; workId: string; logId: string };

/** Same token, pointed at Work and Work Log (REQ-8). The integration must be shared with both databases. */
export function readWorkConfig(): WorkConfig | null {
  const token = process.env.NOTION_TOKEN;
  if (!token) return null;
  return {
    token,
    workId: process.env.NOTION_WORK_DATA_SOURCE_ID || DEFAULT_WORK_DATA_SOURCE_ID,
    logId: process.env.NOTION_WORK_LOG_DATA_SOURCE_ID || DEFAULT_WORK_LOG_DATA_SOURCE_ID,
  };
}

export const DEFAULT_INVOICES_DATA_SOURCE_ID = "be0f91e4-f054-4055-9ca6-c4e1a22c4f27";
export const DEFAULT_CREDITS_DATA_SOURCE_ID = "38cdcded-9bef-4e68-bceb-a56920f098bd";
export type BillingConfig = { token: string; invoicesId: string; creditsId: string; studentsId: string };

/**
 * Same token, pointed at Invoices, Missed Sessions & Credits and Students &
 * Parents (REQ-25, ADR 0049). Read access only; the integration must be shared
 * with Invoices and Missed Sessions & Credits before the parent Billing tab works.
 */
export function readBillingConfig(): BillingConfig | null {
  const token = process.env.NOTION_TOKEN;
  if (!token) return null;
  return {
    token,
    invoicesId: process.env.NOTION_INVOICES_DATA_SOURCE_ID || DEFAULT_INVOICES_DATA_SOURCE_ID,
    creditsId: process.env.NOTION_CREDITS_DATA_SOURCE_ID || DEFAULT_CREDITS_DATA_SOURCE_ID,
    studentsId: process.env.NOTION_STUDENTS_DATA_SOURCE_ID || DEFAULT_STUDENTS_DATA_SOURCE_ID,
  };
}
