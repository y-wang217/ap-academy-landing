import "server-only";
import { z } from "zod";
import { NOTION_VERSION, notionApiBaseOverride } from "./config";
import { NotionError, notionHttpError } from "./staff";

/**
 * The Founder Console's shared Notion pager (REQ-54, ADR 0065). Read-only:
 * one schema GET to turn property names into filter_properties ids, then data
 * source queries. A read that reaches `maxPages` with rows left says so with
 * `complete: false` instead of throwing, so the panel can be stale, never
 * silently short. Errors carry a status and never a response body.
 */
// The e2e stack points this at a local mock; production leaves the override unset.
const BASE = `${notionApiBaseOverride() ?? "https://api.notion.com"}/v1/data_sources`;

/** How a console reader is called: a fetcher (bound to an abort signal by the caller) and a page cap. */
export type ReaderOptions = { fetcher?: typeof fetch; maxPages: number };

const headers = (token: string, json = false) => ({
  Authorization: `Bearer ${token}`,
  "Notion-Version": NOTION_VERSION,
  ...(json ? { "Content-Type": "application/json" } : {}),
});

const isAbort = (e: unknown) => e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError");

async function call(fetcher: typeof fetch, url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetcher(url, { ...init, cache: "no-store" });
  } catch (e) {
    // An abort is the caller's timeout and goes back as itself, so the facade can name it.
    if (isAbort(e)) throw e;
    throw new NotionError("Notion request failed");
  }
}

const Schema = z.object({ properties: z.record(z.string(), z.object({ id: z.string() })) });

/** filter_properties for exactly these property names. A missing one fails the read, naming it. */
export async function propertyFilter(token: string, fetcher: typeof fetch, dataSourceId: string, names: readonly string[], label: string): Promise<string> {
  const res = await call(fetcher, `${BASE}/${dataSourceId}`, { method: "GET", headers: headers(token) });
  if (!res.ok) throw notionHttpError(res);
  const parsed = Schema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new NotionError("Unexpected Notion response");
  const missing = names.find((n) => !parsed.data.properties[n]);
  if (missing) throw new NotionError(`${label} is missing ${missing}`);
  // Notion returns property IDs already URL-encoded, so they go in as they are.
  return names.map((n) => `filter_properties[]=${parsed.data.properties[n].id}`).join("&");
}

const QueryResponse = z.object({
  results: z.array(z.unknown()),
  has_more: z.boolean().optional(),
  next_cursor: z.string().nullable().optional(),
});

export async function pagedQuery(input: {
  token: string;
  fetcher: typeof fetch;
  dataSourceId: string;
  filterQuery: string;
  body: Record<string, unknown>;
  maxPages: number;
}): Promise<{ rows: unknown[]; complete: boolean; pages: number }> {
  const rows: unknown[] = [];
  let cursor: string | undefined;
  for (let pages = 1; pages <= input.maxPages; pages++) {
    const res = await call(input.fetcher, `${BASE}/${input.dataSourceId}/query?${input.filterQuery}`, {
      method: "POST",
      headers: headers(input.token, true),
      body: JSON.stringify({ page_size: 100, ...input.body, ...(cursor ? { start_cursor: cursor } : {}) }),
    });
    if (!res.ok) throw notionHttpError(res);
    const parsed = QueryResponse.safeParse(await res.json().catch(() => null));
    if (!parsed.success) throw new NotionError("Unexpected Notion response");
    rows.push(...parsed.data.results);
    if (!parsed.data.has_more || !parsed.data.next_cursor) return { rows, complete: true, pages };
    cursor = parsed.data.next_cursor;
  }
  return { rows, complete: false, pages: input.maxPages };
}

/** Parses each raw page; one that fails is skipped and counted, never guessed. */
export function parseRows<S extends z.ZodType, T>(raw: unknown[], schema: S, map: (page: z.output<S>) => T): { rows: T[]; skipped: number } {
  const rows: T[] = [];
  let skipped = 0;
  for (const r of raw) {
    const page = schema.safeParse(r);
    if (page.success) rows.push(map(page.data));
    else skipped++;
  }
  return { rows, skipped };
}

// Notion property value shapes. Every one is optional: an empty Notion value can be absent.
const plain = z.array(z.object({ plain_text: z.string() })).transform((v) => v.map((t) => t.plain_text).join(""));
export const prop = {
  title: z.object({ title: plain }),
  text: z.object({ rich_text: plain }).optional(),
  select: z.object({ select: z.object({ name: z.string() }).nullable() }).optional(),
  multi: z.object({ multi_select: z.array(z.object({ name: z.string() })) }).optional(),
  date: z.object({ date: z.object({ start: z.string() }).nullable() }).optional(),
  number: z.object({ number: z.number().nullable() }).optional(),
  relation: z.object({ relation: z.array(z.object({ id: z.string() })) }).optional(),
  created: z.object({ created_time: z.string() }).optional(),
};
type Out<K extends keyof typeof prop> = z.output<(typeof prop)[K]>;
export const val = {
  text: (p: Out<"text">) => p?.rich_text.trim() || null,
  present: (p: Out<"text">) => Boolean(p?.rich_text.trim()),
  select: (p: Out<"select">) => p?.select?.name ?? null,
  multi: (p: Out<"multi">) => (p?.multi_select ?? []).map((o) => o.name),
  date: (p: Out<"date">) => p?.date?.start ?? null,
  number: (p: Out<"number">) => p?.number ?? null,
  ids: (p: Out<"relation">) => (p?.relation ?? []).map((r) => r.id),
  firstId: (p: Out<"relation">) => p?.relation[0]?.id ?? null,
};
