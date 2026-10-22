import "server-only";
import { z } from "zod";
import type { ReadResult, WorkSource } from "../console/contracts";
import { NOTION_VERSION, notionApiBaseOverride, type NotionConfig, type WorkConfig } from "./config";
import { pagedQuery, parseRows, prop, propertyFilter, type ReaderOptions, val } from "./paged";
import { NotionError, notionHttpError } from "./staff";

/**
 * Notion writes for the daily teacher-texts task (REQ-8, tracker ADR 0039):
 * one page in Work, one entry in Work Log, and blocks inside that page. Plain
 * fetch, like students.ts. Errors carry a status and never a response body,
 * because bodies can echo student names. No function here ever sends a
 * `checked` field after a to-do exists: the tick is Charlie's.
 */
const BASE = `${notionApiBaseOverride() ?? "https://api.notion.com"}/v1`;
const MAX_TEXT = 2000;

export type TeacherRender = { todoText: string; bullets: string[]; linkLabel: string; linkUrl: string; copyText: string };
export type TaskPage = { pageId: string; pageUrl: string };
export type ToDo = { id: string; checked: boolean; lastEditedTime: string };

const headers = (config: WorkConfig, json = false) => ({
  Authorization: `Bearer ${config.token}`,
  "Notion-Version": NOTION_VERSION,
  ...(json ? { "Content-Type": "application/json" } : {}),
});

async function call(config: WorkConfig, fetcher: typeof fetch, path: string, method: string, body?: unknown): Promise<unknown> {
  let res: Response;
  try {
    res = await fetcher(`${BASE}${path}`, { method, headers: headers(config, body !== undefined), ...(body !== undefined ? { body: JSON.stringify(body) } : {}), cache: "no-store" });
  } catch {
    throw new NotionError("Notion request failed");
  }
  if (!res.ok) throw notionHttpError(res);
  return res.json().catch(() => ({}));
}

const text = (content: string, link?: string) => [{ type: "text", text: { content: content.slice(0, MAX_TEXT), ...(link ? { link: { url: link } } : {}) } }];
const paragraph = (content: string) => ({ object: "block", type: "paragraph", paragraph: { rich_text: text(content) } });

function teacherChildren(t: TeacherRender) {
  return [
    ...t.bullets.map((b) => ({ object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: text(b) } })),
    { object: "block", type: "paragraph", paragraph: { rich_text: text(t.linkLabel, t.linkUrl) } },
    { object: "block", type: "code", code: { rich_text: text(t.copyText), language: "plain text" } },
  ];
}
const newToDo = (t: TeacherRender, prefix = "") => ({
  object: "block", type: "to_do", to_do: { rich_text: text(`${prefix ? `${prefix} ` : ""}${t.todoText}`), checked: false, children: teacherChildren(t) },
});

const Created = z.object({ id: z.guid(), url: z.string().optional() });

export async function createTaskPage(
  config: WorkConfig,
  input: { date: string; title: string; intro: string; teachers: TeacherRender[] },
  fetcher: typeof fetch = fetch,
): Promise<TaskPage> {
  const body = await call(config, fetcher, "/pages", "POST", {
    parent: { type: "data_source_id", data_source_id: config.workId },
    properties: {
      Name: { title: text(input.title) },
      Area: { select: { name: "Delivery" } },
      Type: { select: { name: "Recurring" } },
      State: { select: { name: "Next" } },
      Owner: { rich_text: text("Charlie") },
      Alignment: { select: { name: "Maintenance" } },
      "Due / Review": { date: { start: input.date } },
    },
    children: [paragraph(input.intro), ...input.teachers.map((t) => newToDo(t))],
  });
  const p = Created.safeParse(body);
  if (!p.success) throw new NotionError("Unexpected Notion response");
  return { pageId: p.data.id, pageUrl: p.data.url ?? "" };
}

const Query = z.object({ results: z.array(z.object({ id: z.guid(), url: z.string().optional() })) });

/** The Work page with exactly this title, or null. Used so a retry adopts a page instead of creating a second. */
export async function findTaskByTitle(config: WorkConfig, title: string, fetcher: typeof fetch = fetch): Promise<TaskPage | null> {
  const body = await call(config, fetcher, `/data_sources/${config.workId}/query`, "POST", { page_size: 2, filter: { property: "Name", title: { equals: title } } });
  const p = Query.safeParse(body);
  if (!p.success) throw new NotionError("Unexpected Notion response");
  const hit = p.data.results[0];
  return hit ? { pageId: hit.id, pageUrl: hit.url ?? "" } : null;
}

const Children = z.object({
  results: z.array(z.object({ id: z.string(), type: z.string().optional(), last_edited_time: z.string().optional(), to_do: z.object({ checked: z.boolean() }).optional() })),
  has_more: z.boolean().optional(),
  next_cursor: z.string().nullable().optional(),
});

async function children(config: WorkConfig, fetcher: typeof fetch, blockId: string) {
  const out: z.infer<typeof Children>["results"] = [];
  let cursor: string | undefined;
  for (let guard = 0; guard < 20; guard++) {
    const body = await call(config, fetcher, `/blocks/${blockId}/children?page_size=100${cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : ""}`, "GET");
    const p = Children.safeParse(body);
    if (!p.success) throw new NotionError("Unexpected Notion response");
    out.push(...p.data.results);
    if (!p.data.has_more || !p.data.next_cursor) return out;
    cursor = p.data.next_cursor;
  }
  throw new NotionError("Too many Notion blocks");
}

/** The task page's first paragraph (the intro) and its top-level to-dos in page order, with their ticks. */
export async function listChildren(config: WorkConfig, pageId: string, fetcher: typeof fetch = fetch): Promise<{ introId: string | null; todos: ToDo[] }> {
  const all = await children(config, fetcher, pageId);
  return {
    introId: all.find((b) => b.type === "paragraph")?.id ?? null,
    todos: all.filter((b) => b.type === "to_do").map((b) => ({ id: b.id, checked: b.to_do?.checked ?? false, lastEditedTime: b.last_edited_time ?? "" })),
  };
}

const Edited = z.object({ last_edited_time: z.string() });
async function lastEdited(config: WorkConfig, fetcher: typeof fetch, blockId: string): Promise<string> {
  const p = Edited.safeParse(await call(config, fetcher, `/blocks/${blockId}`, "GET"));
  if (!p.success) throw new NotionError("Unexpected Notion response");
  return p.data.last_edited_time;
}

/**
 * Rewrites one teacher's to-do text and its children. Sends no `checked`.
 * Returns the block's last_edited_time after the write, which is what the
 * refresh compares Charlie's next tick against.
 */
export async function updateTeacher(config: WorkConfig, blockId: string, t: TeacherRender, label: string, fetcher: typeof fetch = fetch): Promise<string> {
  await call(config, fetcher, `/blocks/${blockId}`, "PATCH", { to_do: { rich_text: text(`${label ? `${label} ` : ""}${t.todoText}`) } });
  for (const old of await children(config, fetcher, blockId)) await call(config, fetcher, `/blocks/${old.id}`, "DELETE");
  await call(config, fetcher, `/blocks/${blockId}/children`, "PATCH", { children: teacherChildren(t) });
  return lastEdited(config, fetcher, blockId);
}

const Appended = z.object({ results: z.array(z.object({ id: z.string(), last_edited_time: z.string().optional() })) });

/** A teacher with no block yet: appended unchecked at the end of the page. */
export async function appendTeacher(config: WorkConfig, pageId: string, t: TeacherRender, fetcher: typeof fetch = fetch, label = ""): Promise<{ blockId: string; lastEditedTime: string }> {
  const body = await call(config, fetcher, `/blocks/${pageId}/children`, "PATCH", { children: [newToDo(t, label)] });
  const p = Appended.safeParse(body);
  const block = p.success ? p.data.results[p.data.results.length - 1] : undefined;
  if (!block) throw new NotionError("Unexpected Notion response");
  return { blockId: block.id, lastEditedTime: block.last_edited_time ?? (await lastEdited(config, fetcher, block.id)) };
}

export async function updateIntro(config: WorkConfig, blockId: string, content: string, fetcher: typeof fetch = fetch): Promise<void> {
  await call(config, fetcher, `/blocks/${blockId}`, "PATCH", { paragraph: { rich_text: text(content) } });
}

export type LogInput = { summary: string; date: string; workPageId: string; sessionLink: string; decisions: string };

/** One Work Log entry per day, per the Agent Playbook. */
export async function createLogEntry(config: WorkConfig, input: LogInput, fetcher: typeof fetch = fetch): Promise<string> {
  const body = await call(config, fetcher, "/pages", "POST", {
    parent: { type: "data_source_id", data_source_id: config.logId },
    properties: {
      Summary: { title: text(input.summary) },
      Date: { date: { start: input.date } },
      Source: { select: { name: "Agent" } },
      "Logged by": { select: { name: "Session itself" } },
      Alignment: { select: { name: "Maintenance" } },
      Work: { relation: [{ id: input.workPageId }] },
      "Session link": { url: input.sessionLink },
      Decisions: { rich_text: text(input.decisions) },
    },
  });
  const p = Created.safeParse(body);
  if (!p.success) throw new NotionError("Unexpected Notion response");
  return p.data.id;
}

export async function updateLogDecisions(config: WorkConfig, logId: string, decisions: string, fetcher: typeof fetch = fetch): Promise<void> {
  await call(config, fetcher, `/pages/${logId}`, "PATCH", { properties: { Decisions: { rich_text: text(decisions) } } });
}

/** The Founder Console's content work read (REQ-54, ADR 0065): open Work rows, read-only. */
export const WORK_PROPS = ["Name", "Area", "State", "Type", "Due / Review", "Owner", "Task Type"] as const;

const WorkPage = z.object({
  id: z.guid(),
  properties: z.object({
    Name: prop.title,
    Area: prop.select,
    State: prop.select,
    Type: prop.select,
    "Due / Review": prop.date,
    Owner: prop.text,
    "Task Type": prop.relation,
  }),
});

const toWork = (page: z.output<typeof WorkPage>): WorkSource => {
  const p = page.properties;
  return {
    id: page.id,
    name: p.Name.title.trim(),
    area: val.select(p.Area),
    state: val.select(p.State),
    type: val.select(p.Type),
    dueReview: val.date(p["Due / Review"]),
    owner: val.text(p.Owner),
    taskTypeIds: val.ids(p["Task Type"]),
  };
};

/** Every Work row whose State is not Done, Due / Review ascending. */
export async function fetchWorkItems(config: NotionConfig, opts: ReaderOptions): Promise<ReadResult<WorkSource>> {
  const fetcher = opts.fetcher ?? fetch;
  const filterQuery = await propertyFilter(config.token, fetcher, config.dataSourceId, WORK_PROPS, "Work");
  const read = await pagedQuery({
    token: config.token, fetcher, dataSourceId: config.dataSourceId, filterQuery, maxPages: opts.maxPages,
    body: { filter: { property: "State", select: { does_not_equal: "Done" } }, sorts: [{ property: "Due / Review", direction: "ascending" }] },
  });
  return { ...parseRows(read.rows, WorkPage, toWork), complete: read.complete, pages: read.pages };
}
