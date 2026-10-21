import "server-only";
import { z } from "zod";
import { lessonHours, LessonLinkError, type LessonLinkPort, type LessonRow, type NewLesson } from "../domain/schedule/lesson-link";
import { NOTION_VERSION, notionApiBaseOverride, type NotionConfig } from "./config";
import { NotionError } from "./staff";

/**
 * Lessons in Notion, read and written with plain fetch (REQ-39, ADR 0056).
 * Lessons is payout-adjacent, so this file asks for four properties only
 * (Date, Teacher, the student relation, Class occurrence) and drops the rest
 * at the parse step. It has exactly two write shapes: a create with six fixed
 * keys, and a patch of `Class occurrence` alone. It never archives a page.
 */
// The e2e stack points this at a local mock; production leaves the override unset.
const BASE = `${notionApiBaseOverride() ?? "https://api.notion.com"}/v1`;
const LESSON = "Lesson";
const DATE = "Date";
const TEACHER = "Teacher";
const STUDENT = "Related to Students & Parents (Lessons 1)";
const DURATION = "Duration (hrs)";
const REF = "Class occurrence";
export const LESSON_TITLE = "Logged from schedule";
const MAX_PAGES = 10;

const plain = (v: { plain_text: string }[]) => v.map((t) => t.plain_text).join("");
const relation = z.object({ relation: z.array(z.object({ id: z.string() })) });

const Page = z.object({
  id: z.guid(),
  properties: z.object({
    [DATE]: z.object({ date: z.object({ start: z.string() }).nullable() }).optional(),
    [TEACHER]: relation.optional(),
    [STUDENT]: relation.optional(),
    [REF]: z.object({ rich_text: z.array(z.object({ plain_text: z.string() })) }).optional(),
  }),
});

function parseLesson(raw: unknown): LessonRow {
  const p = Page.parse(raw).properties;
  return {
    id: Page.parse(raw).id,
    date: p[DATE]?.date?.start.slice(0, 10) ?? null,
    staffIds: (p[TEACHER]?.relation ?? []).map((r) => r.id),
    studentIds: (p[STUDENT]?.relation ?? []).map((r) => r.id),
    ref: plain(p[REF]?.rich_text ?? []),
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
const QueryResponse = z.object({
  results: z.array(z.unknown()),
  has_more: z.boolean().optional(),
  next_cursor: z.string().nullable().optional(),
});
const text = (s: string) => [{ type: "text", text: { content: s } }];

export function createLessonsPort(config: NotionConfig, fetcher: typeof fetch = fetch): LessonLinkPort {
  /** filter_properties takes IDs. A missing `Class occurrence` means Charlie has not added it yet. */
  async function propertyIds(): Promise<string> {
    const res = await call(fetcher, `${BASE}/data_sources/${config.dataSourceId}`, { method: "GET", headers: headers(config) });
    if (!res.ok) throw new NotionError(`Notion returned ${res.status}`, res.status);
    const parsed = Schema.safeParse(await res.json().catch(() => null));
    if (!parsed.success) throw new NotionError("Unexpected Notion response");
    if (!parsed.data.properties[REF]) throw new LessonLinkError("lessons_not_ready");
    const ids = [DATE, TEACHER, STUDENT, REF].map((n) => parsed.data.properties[n]?.id);
    if (ids.some((i) => !i)) throw new NotionError("Lessons database is missing a needed property");
    // Notion returns property IDs already URL-encoded, so they go in as they are.
    return ids.map((i) => `filter_properties[]=${i}`).join("&");
  }

  async function query(filterQuery: string, body: Record<string, unknown>): Promise<z.infer<typeof QueryResponse>> {
    const res = await call(fetcher, `${BASE}/data_sources/${config.dataSourceId}/query?${filterQuery}`, {
      method: "POST",
      headers: headers(config, true),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new NotionError(`Notion returned ${res.status}`, res.status);
    const parsed = QueryResponse.safeParse(await res.json().catch(() => null));
    if (!parsed.success) throw new NotionError("Unexpected Notion response");
    return parsed.data;
  }

  async function patchRef(lessonId: string, value: string): Promise<void> {
    if (!z.guid().safeParse(lessonId).success) throw new NotionError("Invalid page ID");
    const res = await call(fetcher, `${BASE}/pages/${lessonId}`, {
      method: "PATCH",
      headers: headers(config, true),
      body: JSON.stringify({ properties: { [REF]: { rich_text: value === "" ? [] : text(value) } } }),
    });
    if (!res.ok) throw new NotionError(`Notion returned ${res.status}`, res.status);
  }

  async function getLesson(lessonId: string): Promise<LessonRow | null> {
    if (!z.guid().safeParse(lessonId).success) throw new NotionError("Invalid page ID");
    const fq = await propertyIds();
    const res = await call(fetcher, `${BASE}/pages/${lessonId}?${fq}`, { method: "GET", headers: headers(config) });
    if (res.status === 404) return null;
    if (!res.ok) throw new NotionError(`Notion returned ${res.status}`, res.status);
    const body = await res.json().catch(() => null);
    if (!Page.safeParse(body).success) throw new NotionError("Unexpected Notion response");
    return parseLesson(body);
  }

  return {
    async findLessonFor(ref) {
      const fq = await propertyIds();
      const { results } = await query(fq, { page_size: 2, filter: { property: REF, rich_text: { equals: ref } } });
      if (results.length > 1) throw new LessonLinkError("duplicate_link");
      if (results.length === 0) return null;
      const page = Page.safeParse(results[0]);
      if (!page.success) throw new NotionError("Unexpected Notion response");
      return { lessonId: page.data.id };
    },

    async linkLesson(lessonId, ref) {
      await propertyIds();
      await patchRef(lessonId, ref);
    },

    async unlinkLesson(lessonId, ref) {
      const lesson = await getLesson(lessonId);
      if (!lesson) return "gone";
      if (lesson.ref !== ref) return "kept";
      await patchRef(lessonId, "");
      return "cleared";
    },

    getLesson,

    async createLesson(input: NewLesson) {
      await propertyIds();
      const res = await call(fetcher, `${BASE}/pages`, {
        method: "POST",
        headers: headers(config, true),
        body: JSON.stringify({
          parent: { type: "data_source_id", data_source_id: config.dataSourceId },
          properties: {
            [LESSON]: { title: text(LESSON_TITLE) },
            [DATE]: { date: { start: input.date } },
            [TEACHER]: { relation: [{ id: input.staffId }] },
            [STUDENT]: { relation: [{ id: input.studentId }] },
            [DURATION]: { number: lessonHours(input.durationMinutes) },
            [REF]: { rich_text: text(input.ref) },
          },
        }),
      });
      if (!res.ok) throw new NotionError(`Notion returned ${res.status}`, res.status);
      const parsed = z.object({ id: z.guid() }).safeParse(await res.json().catch(() => null));
      if (!parsed.success) throw new NotionError("Unexpected Notion response");
      return { lessonId: parsed.data.id };
    },

    async listUnlinkedLessons(range) {
      const fq = await propertyIds();
      const filter = { and: [
        { property: DATE, date: { on_or_after: range.from } },
        { property: DATE, date: { on_or_before: range.to } },
        { property: REF, rich_text: { is_empty: true } },
      ] };
      const out: LessonRow[] = [];
      let cursor: string | undefined;
      for (let guard = 0; guard < MAX_PAGES; guard++) {
        const data = await query(fq, { page_size: 100, filter, ...(cursor ? { start_cursor: cursor } : {}) });
        for (const raw of data.results) if (Page.safeParse(raw).success) out.push(parseLesson(raw));
        if (!data.has_more || !data.next_cursor) return out;
        cursor = data.next_cursor;
      }
      throw new NotionError("Too many Notion pages");
    },
  };
}
