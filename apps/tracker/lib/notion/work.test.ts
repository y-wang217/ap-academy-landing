import { describe, expect, it } from "vitest";
import {
  appendTeacher, createLogEntry, createTaskPage, fetchWorkItems, findTaskByTitle, listChildren, updateIntro, updateLogDecisions, updateTeacher, WORK_PROPS, type TeacherRender,
} from "./work";
import { filterIds, notionFake, onlyReads, v } from "./console-reader.fake";
import { NotionError } from "./staff";

const CONFIG = { token: "secret", workId: "3031b455-9be0-4f8d-b200-70fcfcf1a0b8", logId: "03257601-dfe2-42dd-affb-49dcfe1d2dcf" };
const PAGE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BLOCK = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
type Call = { url: string; method: string; body: unknown };

function fake(responses: (call: Call) => { status?: number; json?: unknown }) {
  const calls: Call[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    const call = { url, method: init.method ?? "GET", body: init.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(call);
    const r = responses(call);
    return new Response(JSON.stringify(r.json ?? {}), { status: r.status ?? 200 });
  }) as unknown as typeof fetch;
  return { calls, fetcher };
}

const teacher: TeacherRender = {
  todoText: "Ryan Test: 2 classes", bullets: ["16:00-17:00 Sam Student, MHF4U", "18:00-19:00 Kim, SPH3U"],
  linkLabel: "Ryan Test's schedule", linkUrl: "https://www.apacademy.ca/tracker/schedule?staffId=x&date=2026-10-19", copyText: "Hi Ryan",
};
const hasKey = (value: unknown, key: string): boolean =>
  !!value && typeof value === "object" && (key in value || Object.values(value).some((v) => hasKey(v, key)));

describe("createTaskPage (AC2)", () => {
  it("sends exactly the Work properties, never Agent permission, Bet or Build hours, and unchecked to-dos", async () => {
    const { calls, fetcher } = fake(() => ({ json: { id: PAGE, url: "https://notion.so/p" } }));
    const page = await createTaskPage(CONFIG, { date: "2026-10-19", title: "T", intro: "Nothing is sent automatically.", teachers: [teacher] }, fetcher);
    expect(page).toEqual({ pageId: PAGE, pageUrl: "https://notion.so/p" });
    const body = calls[0].body as { parent: unknown; properties: Record<string, unknown>; children: { type: string; to_do?: { checked: boolean } }[] };
    expect(body.parent).toEqual({ type: "data_source_id", data_source_id: CONFIG.workId });
    expect(Object.keys(body.properties).sort()).toEqual(["Alignment", "Area", "Due / Review", "Name", "Owner", "State", "Type"]);
    expect(body.properties).toMatchObject({
      Area: { select: { name: "Delivery" } }, Type: { select: { name: "Recurring" } }, State: { select: { name: "Next" } },
      Alignment: { select: { name: "Maintenance" } }, "Due / Review": { date: { start: "2026-10-19" } },
    });
    const todos = body.children.filter((c) => c.type === "to_do");
    expect(todos).toHaveLength(1);
    expect(todos.every((t) => t.to_do!.checked === false)).toBe(true);
    expect(JSON.stringify(body)).toContain("16:00-17:00 Sam Student, MHF4U");
  });
});

describe("never sends checked after creation (AC5)", () => {
  it("updateTeacher and appendTeacher updates carry no checked field; appended blocks are unchecked", async () => {
    const { calls, fetcher } = fake((c) => {
      if (c.method === "GET" && c.url.endsWith(`/blocks/${BLOCK}/children?page_size=100`)) return { json: { results: [{ id: "old1" }], has_more: false } };
      if (c.method === "GET") return { json: { id: BLOCK, last_edited_time: "2026-10-19T10:01:00.000Z" } };
      if (c.method === "PATCH" && c.url.endsWith(`/blocks/${PAGE}/children`)) return { json: { results: [{ id: BLOCK, last_edited_time: "2026-10-19T10:02:00.000Z" }] } };
      return { json: {} };
    });
    const edited = await updateTeacher(CONFIG, BLOCK, teacher, "Resend: schedule changed after you texted.", fetcher);
    expect(edited).toBe("2026-10-19T10:01:00.000Z");
    const appended = await appendTeacher(CONFIG, PAGE, teacher, fetcher);
    expect(appended).toEqual({ blockId: BLOCK, lastEditedTime: "2026-10-19T10:02:00.000Z" });
    const textWrite = calls.find((c) => c.method === "PATCH" && c.url.endsWith(`/blocks/${BLOCK}`))!;
    expect(JSON.stringify(textWrite.body)).toContain("Resend: schedule changed after you texted. Ryan Test: 2 classes");
    for (const c of calls.filter((x) => x.method === "PATCH" && x.url.endsWith(`/blocks/${BLOCK}`))) expect(hasKey(c.body, "checked")).toBe(false);
    const append = calls.find((c) => c.method === "PATCH" && c.url.endsWith(`/blocks/${PAGE}/children`))!;
    expect(JSON.stringify(append.body)).toContain('"checked":false');
    expect(calls.some((c) => c.method === "DELETE" && c.url.endsWith("/blocks/old1"))).toBe(true);
  });
});

describe("listChildren, findTaskByTitle", () => {
  it("returns the intro paragraph and the to-dos with their ticks", async () => {
    const { fetcher } = fake(() => ({
      json: {
        has_more: false,
        results: [
          { id: "p1", type: "paragraph", last_edited_time: "t0" },
          { id: "t1", type: "to_do", to_do: { checked: true }, last_edited_time: "2026-10-19T12:00:00.000Z" },
          { id: "t2", type: "to_do", to_do: { checked: false }, last_edited_time: "2026-10-19T10:00:00.000Z" },
        ],
      },
    }));
    expect(await listChildren(CONFIG, PAGE, fetcher)).toEqual({
      introId: "p1",
      todos: [{ id: "t1", checked: true, lastEditedTime: "2026-10-19T12:00:00.000Z" }, { id: "t2", checked: false, lastEditedTime: "2026-10-19T10:00:00.000Z" }],
    });
  });
  it("finds a page by exact title", async () => {
    const { calls, fetcher } = fake(() => ({ json: { results: [{ id: PAGE, url: "https://notion.so/p" }], has_more: false } }));
    expect(await findTaskByTitle(CONFIG, "Text teachers their schedules — 2026-10-19", fetcher)).toEqual({ pageId: PAGE, pageUrl: "https://notion.so/p" });
    expect(calls[0].body).toMatchObject({ filter: { property: "Name", title: { equals: "Text teachers their schedules — 2026-10-19" } } });
  });
  it("returns null when there is none", async () => {
    const { fetcher } = fake(() => ({ json: { results: [], has_more: false } }));
    expect(await findTaskByTitle(CONFIG, "x", fetcher)).toBeNull();
  });
});

describe("Work Log (AC14)", () => {
  it("creates one entry with the Playbook properties and updates only Decisions", async () => {
    const { calls, fetcher } = fake(() => ({ json: { id: BLOCK } }));
    expect(await createLogEntry(CONFIG, { summary: "Daily teacher texts task created for 2026-10-19", date: "2026-10-19", workPageId: PAGE, sessionLink: "https://www.apacademy.ca/tracker/schedule", decisions: "Created" }, fetcher)).toBe(BLOCK);
    expect(calls[0].body).toMatchObject({
      parent: { type: "data_source_id", data_source_id: CONFIG.logId },
      properties: { Source: { select: { name: "Agent" } }, "Logged by": { select: { name: "Session itself" } }, Alignment: { select: { name: "Maintenance" } }, Work: { relation: [{ id: PAGE }] } },
    });
    await updateLogDecisions(CONFIG, BLOCK, "Refreshed 2 times, last at 08:15", fetcher);
    expect(Object.keys((calls[1].body as { properties: object }).properties)).toEqual(["Decisions"]);
  });
  it("updateIntro edits only the paragraph text", async () => {
    const { calls, fetcher } = fake(() => ({ json: {} }));
    await updateIntro(CONFIG, BLOCK, "Nothing is sent automatically. Last updated 08:15", fetcher);
    expect(calls[0].method).toBe("PATCH");
    expect(JSON.stringify(calls[0].body)).toContain("Last updated 08:15");
  });
});

describe("failures (AC10)", () => {
  it("throws a NotionError with the status only, never the body", async () => {
    const { fetcher } = fake(() => ({ status: 500, json: { message: "student Sam Student secret detail" } }));
    const err = await createTaskPage(CONFIG, { date: "2026-10-19", title: "T", intro: "i", teachers: [] }, fetcher).catch((e) => e);
    expect(err).toBeInstanceOf(NotionError);
    expect(err.message).toBe("Notion returned 500");
    expect(err.message).not.toContain("Sam");
  });
  it("turns a network error into a NotionError", async () => {
    const boom = (async () => { throw new Error("socket Sam Student"); }) as unknown as typeof fetch;
    const err = await findTaskByTitle(CONFIG, "x", boom).catch((e) => e);
    expect(err).toBeInstanceOf(NotionError);
    expect(err.message).toBe("Notion request failed");
  });
});

describe("fetchWorkItems (REQ-54 AC1, AC6, AC7)", () => {
  const DS = CONFIG.workId;
  const SCHEMA = { Name: "title", Area: "ar", State: "sa", Type: "ty", "Due / Review": "du", Owner: "ow", "Task Type": "tt", Alignment: "al", "Expected result": "er", "Build hours": "bh" };
  const item = (id: string) => ({
    object: "page", id, properties: {
      Name: v.title("Write SAT post"), Area: v.select("Marketing"), State: v.select("Next"), Type: v.select("Task"),
      "Due / Review": v.date("2026-10-24"), Owner: v.text("Charlie"), "Task Type": v.rel(BLOCK), "Expected result": v.text("secret plan"),
    },
  });

  it("WORK_PROPS is the design list; State not Done, Due / Review ascending, listed ids only", async () => {
    expect([...WORK_PROPS]).toEqual(["Name", "Area", "State", "Type", "Due / Review", "Owner", "Task Type"]);
    const f = notionFake({ dataSourceId: DS, schema: SCHEMA, pages: [[item(PAGE)]] });
    const r = await fetchWorkItems({ token: "t", dataSourceId: DS }, { fetcher: f.fetcher, maxPages: 10 });
    expect(filterIds(f.calls[1])).toEqual(["title", "ar", "sa", "ty", "du", "ow", "tt"]);
    expect(f.calls[1].body).toEqual({ page_size: 100, filter: { property: "State", select: { does_not_equal: "Done" } }, sorts: [{ property: "Due / Review", direction: "ascending" }] });
    expect(r.rows).toEqual([{ id: PAGE, name: "Write SAT post", area: "Marketing", state: "Next", type: "Task", dueReview: "2026-10-24", owner: "Charlie", taskTypeIds: [BLOCK] }]);
    expect(JSON.stringify(r)).not.toContain("secret plan");
  });

  it("full, paginated and truncated reads make only schema GETs and data source queries", async () => {
    for (const [pages, maxPages, complete] of [[[[item(PAGE)]], 10, true], [[[item(PAGE)], [item(BLOCK)]], 10, true], [[[item(PAGE)], [item(BLOCK)]], 1, false]] as const) {
      const f = notionFake({ dataSourceId: DS, schema: SCHEMA, pages: pages as unknown[][] });
      const r = await fetchWorkItems({ token: "t", dataSourceId: DS }, { fetcher: f.fetcher, maxPages });
      expect(r.complete).toBe(complete);
      expect(onlyReads(f.calls, DS)).toBe(true);
    }
  });
});
