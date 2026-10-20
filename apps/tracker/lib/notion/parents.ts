import "server-only";
import { z } from "zod";
import { NOTION_VERSION, notionApiBaseOverride, type NotionConfig } from "./config";
import { NotionError, notionHttpError } from "./staff";

/**
 * The family directory for Iris (REQ-42, workspace ADR 0004 and 0005): who a
 * parent is, read live from Students & Parents once per Iris run. Exactly four
 * properties are requested (Student Name, Stage, Parent Email, Parent Name)
 * and every other field is dropped at the parse step. Never cached and never
 * stored: Iris keeps only the matched Notion page ids. Imported only by the
 * Iris run. Its small helpers are copied from students.ts on purpose, so this
 * file stays self-contained for the source scans.
 */
export type FamilyEntry = { studentId: string; studentName: string; stage: string; parentEmail: string; parentName: string };

const BASE = `${notionApiBaseOverride() ?? "https://api.notion.com"}/v1`;
const NAME = "Student Name";
const STAGE = "Stage";
const EMAIL = "Parent Email";
const PARENT = "Parent Name";
const STAGES = ["Active", "Onboarding", "Paused"];

const plain = (v: { plain_text: string }[]) => v.map((t) => t.plain_text).join("");

const Page = z.object({
  id: z.guid(),
  properties: z.object({
    [NAME]: z.object({ title: z.array(z.object({ plain_text: z.string() })) }),
    [STAGE]: z.object({ select: z.object({ name: z.string() }).nullable() }).optional(),
    [EMAIL]: z.object({ email: z.string().nullable() }).optional(),
    [PARENT]: z.object({ rich_text: z.array(z.object({ plain_text: z.string() })) }).optional(),
  }),
});

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

async function propertyIds(config: NotionConfig, fetcher: typeof fetch): Promise<string[]> {
  const res = await call(fetcher, `${BASE}/data_sources/${config.dataSourceId}`, { method: "GET", headers: headers(config) });
  if (!res.ok) throw notionHttpError(res);
  const parsed = Schema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new NotionError("Unexpected Notion response");
  const ids = [NAME, STAGE, EMAIL, PARENT].map((n) => parsed.data.properties[n]?.id);
  if (ids.some((i) => !i)) throw new NotionError("Students database is missing a needed property");
  return ids as string[];
}

const Results = z.object({
  results: z.array(z.unknown()),
  has_more: z.boolean().optional(),
  next_cursor: z.string().nullable().optional(),
});

/** Every student at stage Active, Onboarding or Paused, with the parent fields Iris matches on. Capped at 50 pages of 100. */
export async function fetchFamilyDirectory(config: NotionConfig, fetcher: typeof fetch = fetch): Promise<FamilyEntry[]> {
  const ids = await propertyIds(config, fetcher);
  const query = ids.map((i) => `filter_properties[]=${i}`).join("&");
  const filter = { or: STAGES.map((name) => ({ property: STAGE, select: { equals: name } })) };
  const out: FamilyEntry[] = [];
  let cursor: string | undefined;
  for (let guard = 0; guard < 50; guard++) {
    const res = await call(fetcher, `${BASE}/data_sources/${config.dataSourceId}/query?${query}`, {
      method: "POST",
      headers: headers(config, true),
      body: JSON.stringify({ page_size: 100, filter, ...(cursor ? { start_cursor: cursor } : {}) }),
    });
    if (!res.ok) throw notionHttpError(res);
    const parsed = Results.safeParse(await res.json().catch(() => null));
    if (!parsed.success) throw new NotionError("Unexpected Notion response");
    for (const raw of parsed.data.results) {
      const p = Page.safeParse(raw);
      if (!p.success) continue;
      const props = p.data.properties;
      out.push({
        studentId: p.data.id,
        studentName: plain(props[NAME].title).trim(),
        stage: props[STAGE]?.select?.name ?? "",
        parentEmail: props[EMAIL]?.email ?? "",
        parentName: plain(props[PARENT]?.rich_text ?? []).trim(),
      });
    }
    if (!parsed.data.has_more || !parsed.data.next_cursor) return out;
    cursor = parsed.data.next_cursor;
  }
  throw new NotionError("Too many Notion pages");
}
