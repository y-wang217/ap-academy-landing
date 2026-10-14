/**
 * Scheduler's Notion settings. The feature is off unless NOTION_TOKEN is set
 * (same pattern as lib/ai/config.ts). This folder is the only place that reads
 * the token, and only server modules import it.
 */
export const NOTION_VERSION = "2025-09-03";
export const DEFAULT_STAFF_DATA_SOURCE_ID = "eaf8e9be-9ec3-4e0d-9442-f2c2ce111925";
export const DEFAULT_STUDENTS_DATA_SOURCE_ID = "fe3d651a-70c6-4d1e-8a38-656163d6bc63";

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
