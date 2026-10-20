import "server-only";
import { z } from "zod";
import { NOTION_VERSION, notionApiBaseOverride, type NotionConfig } from "./config";

/**
 * The Staff list from Notion, read with plain fetch (no SDK). Every property
 * except these six is dropped at the parse step, so rates, payment method,
 * phone, notes and lesson history never reach app memory past this file.
 */
export type StaffRecord = {
  id: string;
  name: string;
  email: string | null;
  functions: string[];
  status: string | null;
  subjects: string[];
};

export class NotionError extends Error {
  /** `status` is undefined for a network error or an abort. `retryAfterSeconds` comes from a 429's Retry-After header. */
  constructor(message: string, readonly status?: number, readonly retryAfterSeconds?: number) {
    super(message);
    this.name = "NotionError";
  }
}

/** The error for a non-2xx Notion answer, with Retry-After kept on a 429 (REQ-35). */
export function notionHttpError(res: Response): NotionError {
  const after = res.status === 429 ? Number(res.headers.get("retry-after")) : NaN;
  return new NotionError(`Notion returned ${res.status}`, res.status, Number.isFinite(after) && after > 0 ? after : undefined);
}

const names = (v: { name: string }[] | undefined) => (v ?? []).map((o) => o.name);

const Page = z.object({
  id: z.guid(),
  properties: z.object({
    Name: z.object({ title: z.array(z.object({ plain_text: z.string() })) }),
    Email: z.object({ email: z.string().nullable() }).optional(),
    Status: z.object({ select: z.object({ name: z.string() }).nullable() }).optional(),
    Function: z.object({ multi_select: z.array(z.object({ name: z.string() })) }).optional(),
    Subjects: z.object({ multi_select: z.array(z.object({ name: z.string() })) }).optional(),
  }),
});

export function parseStaffPage(page: unknown): StaffRecord {
  const p = Page.parse(page);
  const props = p.properties;
  return {
    id: p.id,
    name: props.Name.title.map((t) => t.plain_text).join("").trim(),
    email: props.Email?.email?.trim().toLowerCase() || null,
    functions: names(props.Function?.multi_select),
    status: props.Status?.select?.name ?? null,
    subjects: names(props.Subjects?.multi_select),
  };
}

const Response_ = z.object({
  results: z.array(z.unknown()),
  has_more: z.boolean().optional(),
  next_cursor: z.string().nullable().optional(),
});

export async function fetchStaff(config: NotionConfig, fetcher: typeof fetch = fetch): Promise<StaffRecord[]> {
  const out: StaffRecord[] = [];
  let cursor: string | undefined;
  for (let guard = 0; guard < 50; guard++) {
    let res: Response;
    try {
      res = await fetcher(`${notionApiBaseOverride() ?? "https://api.notion.com"}/v1/data_sources/${config.dataSourceId}/query`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.token}`,
          "Notion-Version": NOTION_VERSION,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
        cache: "no-store",
      });
    } catch {
      throw new NotionError("Notion request failed");
    }
    if (!res.ok) throw notionHttpError(res);
    const parsed = Response_.safeParse(await res.json().catch(() => null));
    if (!parsed.success) throw new NotionError("Unexpected Notion response");
    for (const raw of parsed.data.results) {
      const rec = Page.safeParse(raw);
      if (rec.success) out.push(parseStaffPage(raw));
    }
    if (!parsed.data.has_more || !parsed.data.next_cursor) return out;
    cursor = parsed.data.next_cursor;
  }
  throw new NotionError("Too many Notion pages");
}
