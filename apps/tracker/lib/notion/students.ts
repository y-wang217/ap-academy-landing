import "server-only";
import { z } from "zod";
import { NOTION_VERSION, type NotionConfig } from "./config";
import { NotionError } from "./staff";

/**
 * Students & Parents from Notion, read and written with plain fetch (no SDK).
 * That database holds parent contact and billing fields, so this file asks
 * Notion for three properties only (Student Name, Stage, Weekly Schedule),
 * drops everything else at the parse step, and writes one property only: the
 * generated Weekly Schedule summary (REQ-4, tracker ADR 0035). It never reads
 * or names any relation property.
 */
export type StudentRecord = { id: string; name: string; stage: string; weeklySchedule: string };

const BASE = "https://api.notion.com/v1";
const NAME = "Student Name";
const STAGE = "Stage";
const SCHEDULE = "Weekly Schedule";
export const MAX_SUMMARY_CHARS = 2000;

const plain = (v: { plain_text: string }[]) => v.map((t) => t.plain_text).join("");

const Page = z.object({
  id: z.guid(),
  properties: z.object({
    [NAME]: z.object({ title: z.array(z.object({ plain_text: z.string() })) }),
    [STAGE]: z.object({ select: z.object({ name: z.string() }).nullable() }).optional(),
    [SCHEDULE]: z.object({ rich_text: z.array(z.object({ plain_text: z.string() })) }).optional(),
  }),
});

export function parseStudentPage(page: unknown): StudentRecord {
  const p = Page.parse(page);
  return {
    id: p.id,
    name: plain(p.properties[NAME].title).trim(),
    stage: p.properties[STAGE]?.select?.name ?? "",
    weeklySchedule: plain(p.properties[SCHEDULE]?.rich_text ?? []),
  };
}

const headers = (config: NotionConfig, json = false) => ({
  Authorization: `Bearer ${config.token}`,
  "Notion-Version": NOTION_VERSION,
  ...(json ? { "Content-Type": "application/json" } : {}),
});

async function call(fetcher: typeof fetch, url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetcher(url, { ...init, cache: "no-store" });
  } catch {
    throw new NotionError("Notion request failed");
  }
}

const Schema = z.object({ properties: z.record(z.string(), z.object({ id: z.string() })) });

/** filter_properties takes property IDs, so look the three IDs up from the schema. */
async function propertyIds(config: NotionConfig, fetcher: typeof fetch): Promise<string[]> {
  const res = await call(fetcher, `${BASE}/data_sources/${config.dataSourceId}`, { method: "GET", headers: headers(config) });
  if (!res.ok) throw new NotionError(`Notion returned ${res.status}`, res.status);
  const parsed = Schema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new NotionError("Unexpected Notion response");
  const ids = [NAME, STAGE, SCHEDULE].map((n) => parsed.data.properties[n]?.id);
  if (ids.some((i) => !i)) throw new NotionError("Students database is missing a needed property");
  return ids as string[];
}
// Notion returns property IDs already URL-encoded, so they go in as they are.
const filterQuery = (ids: string[]) => ids.map((i) => `filter_properties[]=${i}`).join("&");

const Response_ = z.object({
  results: z.array(z.unknown()),
  has_more: z.boolean().optional(),
  next_cursor: z.string().nullable().optional(),
});

/** Students at stage Active or Onboarding. Capped at 50 pages of 100, like fetchStaff. */
export async function fetchScheduledStudents(config: NotionConfig, fetcher: typeof fetch = fetch): Promise<StudentRecord[]> {
  const ids = await propertyIds(config, fetcher);
  const filter = { or: ["Active", "Onboarding"].map((name) => ({ property: STAGE, select: { equals: name } })) };
  const out: StudentRecord[] = [];
  let cursor: string | undefined;
  for (let guard = 0; guard < 50; guard++) {
    const res = await call(fetcher, `${BASE}/data_sources/${config.dataSourceId}/query?${filterQuery(ids)}`, {
      method: "POST",
      headers: headers(config, true),
      body: JSON.stringify({ page_size: 100, filter, ...(cursor ? { start_cursor: cursor } : {}) }),
    });
    if (!res.ok) throw new NotionError(`Notion returned ${res.status}`, res.status);
    const parsed = Response_.safeParse(await res.json().catch(() => null));
    if (!parsed.success) throw new NotionError("Unexpected Notion response");
    for (const raw of parsed.data.results) {
      if (Page.safeParse(raw).success) out.push(parseStudentPage(raw));
    }
    if (!parsed.data.has_more || !parsed.data.next_cursor) return out;
    cursor = parsed.data.next_cursor;
  }
  throw new NotionError("Too many Notion pages");
}

/** One student, fresh. Null when Notion says the page does not exist. */
export async function fetchStudentSchedule(config: NotionConfig, pageId: string, fetcher: typeof fetch = fetch): Promise<StudentRecord | null> {
  if (!z.guid().safeParse(pageId).success) throw new NotionError("Invalid page ID");
  const ids = await propertyIds(config, fetcher);
  const res = await call(fetcher, `${BASE}/pages/${pageId}?${filterQuery(ids)}`, { method: "GET", headers: headers(config) });
  if (res.status === 404) return null;
  if (!res.ok) throw new NotionError(`Notion returned ${res.status}`, res.status);
  const body = await res.json().catch(() => null);
  const ok = Page.safeParse(body);
  if (!ok.success) throw new NotionError("Unexpected Notion response");
  return parseStudentPage(body);
}

/** The only Notion write in the scheduler: the Weekly Schedule property of one page. */
export async function writeWeeklySchedule(config: NotionConfig, pageId: string, text: string, fetcher: typeof fetch = fetch): Promise<void> {
  if (!z.guid().safeParse(pageId).success) throw new NotionError("Invalid page ID");
  if (text.length > MAX_SUMMARY_CHARS) throw new NotionError("Summary is too long for one Notion text segment");
  const rich_text = text === "" ? [] : [{ type: "text", text: { content: text } }];
  const res = await call(fetcher, `${BASE}/pages/${pageId}`, {
    method: "PATCH",
    headers: headers(config, true),
    body: JSON.stringify({ properties: { [SCHEDULE]: { rich_text } } }),
  });
  if (!res.ok) throw new NotionError(`Notion returned ${res.status}`, res.status);
}
