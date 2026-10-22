import { describe, expect, it } from "vitest";
import { LessonLinkError } from "../domain/schedule/lesson-link";
import { filterIds, notionFake, onlyReads, v } from "./console-reader.fake";
import { createLessonsPort, fetchTrialLessons, LESSON_TITLE, TRIAL_PROPS } from "./lessons";

const cfg = { token: "secret_x", dataSourceId: "ds-lessons" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const L1 = "11111111-1111-4111-8111-111111111111";
const L2 = "22222222-2222-4222-8222-222222222222";
const STAFF = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const STUDENT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const REF = "sched:cccccccc-cccc-4ccc-8ccc-cccccccccccc:2026-10-13";

const SCHEMA = {
  properties: {
    Lesson: { id: "title", type: "title" },
    Date: { id: "d%3At", type: "date" },
    Teacher: { id: "te", type: "relation" },
    "Related to Students & Parents (Lessons 1)": { id: "st", type: "relation" },
    "Duration (hrs)": { id: "du", type: "number" },
    "Paid to Teacher": { id: "pd", type: "checkbox" },
    "Pay Period": { id: "pp", type: "select" },
    "Class occurrence": { id: "co", type: "rich_text" },
  },
};
const NO_REF = { properties: Object.fromEntries(Object.entries(SCHEMA.properties).filter(([k]) => k !== "Class occurrence")) };
const page = (id: string, ref = "", date = "2026-10-13") => ({
  object: "page",
  id,
  properties: {
    Date: { type: "date", date: { start: date } },
    Teacher: { type: "relation", relation: [{ id: STAFF }] },
    "Related to Students & Parents (Lessons 1)": { type: "relation", relation: [{ id: STUDENT }] },
    "Class occurrence": { type: "rich_text", rich_text: ref ? [{ plain_text: ref }] : [] },
    "Paid to Teacher": { type: "checkbox", checkbox: true },
    "Pay Period": { type: "select", select: { name: "Oct 1-15" } },
  },
});

type Call = { url: string; method: string; body: Record<string, unknown> | undefined };
function recorder(handler: (c: Call) => Response) {
  const calls: Call[] = [];
  const fetcher = (async (url: string, init?: RequestInit) => {
    const c = { url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(c);
    return handler(c);
  }) as unknown as typeof fetch;
  return { calls, fetcher };
}
const FILTER = "filter_properties[]=d%3At&filter_properties[]=te&filter_properties[]=st&filter_properties[]=co";
const isSchema = (c: Call) => c.method === "GET" && c.url.endsWith("/data_sources/ds-lessons");

describe("findLessonFor", () => {
  it("queries by equals on Class occurrence, page_size 2, only the four filter_properties", async () => {
    const r = recorder((c) => (isSchema(c) ? json(SCHEMA) : json({ results: [page(L1, REF)] })));
    expect(await createLessonsPort(cfg, r.fetcher).findLessonFor(REF)).toEqual({ lessonId: L1 });
    const q = r.calls[1];
    expect(q.method).toBe("POST");
    expect(q.url).toContain("/data_sources/ds-lessons/query?");
    expect(q.url.split("?")[1]).toBe(FILTER);
    expect(q.body).toEqual({ page_size: 2, filter: { property: "Class occurrence", rich_text: { equals: REF } } });
  });
  it("none gives null, two throw duplicate_link", async () => {
    const none = recorder((c) => (isSchema(c) ? json(SCHEMA) : json({ results: [] })));
    expect(await createLessonsPort(cfg, none.fetcher).findLessonFor(REF)).toBeNull();
    const two = recorder((c) => (isSchema(c) ? json(SCHEMA) : json({ results: [page(L1, REF), page(L2, REF)] })));
    await expect(createLessonsPort(cfg, two.fetcher).findLessonFor(REF)).rejects.toMatchObject({ code: "duplicate_link" });
  });
  it("a schema without Class occurrence throws lessons_not_ready and makes no query", async () => {
    const r = recorder(() => json(NO_REF));
    const err = await createLessonsPort(cfg, r.fetcher).findLessonFor(REF).catch((e) => e);
    expect(err).toBeInstanceOf(LessonLinkError);
    expect(err.code).toBe("lessons_not_ready");
    expect(r.calls).toHaveLength(1);
  });
});

describe("createLesson", () => {
  it("sends exactly the six keys with the AC3 values", async () => {
    const r = recorder((c) => (isSchema(c) ? json(SCHEMA) : json({ id: L1 })));
    const out = await createLessonsPort(cfg, r.fetcher).createLesson({ ref: REF, date: "2026-10-15", staffId: STAFF, studentId: STUDENT, durationMinutes: 50 });
    expect(out).toEqual({ lessonId: L1 });
    const post = r.calls[1];
    expect(post.method).toBe("POST");
    expect(post.url).toMatch(/\/v1\/pages$/);
    expect(post.body).toEqual({
      parent: { type: "data_source_id", data_source_id: "ds-lessons" },
      properties: {
        Lesson: { title: [{ type: "text", text: { content: LESSON_TITLE } }] },
        Date: { date: { start: "2026-10-15" } },
        Teacher: { relation: [{ id: STAFF }] },
        "Related to Students & Parents (Lessons 1)": { relation: [{ id: STUDENT }] },
        "Duration (hrs)": { number: 0.83 },
        "Class occurrence": { rich_text: [{ type: "text", text: { content: REF } }] },
      },
    });
  });
  it("refuses before any write when Class occurrence is missing", async () => {
    const r = recorder(() => json(NO_REF));
    await expect(createLessonsPort(cfg, r.fetcher).createLesson({ ref: REF, date: "2026-10-15", staffId: STAFF, studentId: STUDENT, durationMinutes: 60 }))
      .rejects.toMatchObject({ code: "lessons_not_ready" });
    expect(r.calls.filter((c) => c.method !== "GET")).toEqual([]);
  });
  it("a Notion error surfaces with its status", async () => {
    const r = recorder((c) => (isSchema(c) ? json(SCHEMA) : json({}, 504)));
    await expect(createLessonsPort(cfg, r.fetcher).createLesson({ ref: REF, date: "2026-10-15", staffId: STAFF, studentId: STUDENT, durationMinutes: 60 }))
      .rejects.toMatchObject({ name: "NotionError", status: 504 });
  });
});

describe("linkLesson and unlinkLesson", () => {
  it("linkLesson sends only Class occurrence", async () => {
    const r = recorder((c) => (isSchema(c) ? json(SCHEMA) : json({ id: L1 })));
    await createLessonsPort(cfg, r.fetcher).linkLesson(L1, REF);
    const patch = r.calls.find((c) => c.method === "PATCH")!;
    expect(patch.url).toMatch(new RegExp(`/v1/pages/${L1}$`));
    expect(patch.body).toEqual({ properties: { "Class occurrence": { rich_text: [{ type: "text", text: { content: REF } }] } } });
  });
  it("unlinkLesson reads first and clears only an equal value", async () => {
    const r = recorder((c) => (isSchema(c) ? json(SCHEMA) : c.method === "GET" ? json(page(L1, REF)) : json({ id: L1 })));
    expect(await createLessonsPort(cfg, r.fetcher).unlinkLesson(L1, REF)).toBe("cleared");
    const get = r.calls.find((c) => c.method === "GET" && c.url.includes("/pages/"))!;
    expect(get.url.split("?")[1]).toBe(FILTER);
    const patch = r.calls.find((c) => c.method === "PATCH")!;
    expect(patch.body).toEqual({ properties: { "Class occurrence": { rich_text: [] } } });
  });
  it("another value or a 404 makes no PATCH", async () => {
    const other = recorder((c) => (isSchema(c) ? json(SCHEMA) : json(page(L1, "sched:other"))));
    expect(await createLessonsPort(cfg, other.fetcher).unlinkLesson(L1, REF)).toBe("kept");
    expect(other.calls.some((c) => c.method === "PATCH")).toBe(false);
    const gone = recorder((c) => (isSchema(c) ? json(SCHEMA) : json({}, 404)));
    expect(await createLessonsPort(cfg, gone.fetcher).unlinkLesson(L1, REF)).toBe("gone");
    expect(gone.calls.some((c) => c.method === "PATCH")).toBe(false);
  });
});

describe("getLesson and listUnlinkedLessons", () => {
  it("a page carrying Paid to Teacher is parsed without it", async () => {
    const r = recorder((c) => (isSchema(c) ? json(SCHEMA) : json(page(L1, REF))));
    const row = await createLessonsPort(cfg, r.fetcher).getLesson(L1);
    expect(row).toEqual({ id: L1, date: "2026-10-13", staffIds: [STAFF], studentIds: [STUDENT], ref: REF });
    expect(JSON.stringify(row)).not.toMatch(/Paid|Pay Period|Oct 1-15|true/);
  });
  it("lists rows in the range with an empty Class occurrence", async () => {
    const r = recorder((c) => (isSchema(c) ? json(SCHEMA) : json({ results: [page(L1), page(L2)], has_more: false })));
    const rows = await createLessonsPort(cfg, r.fetcher).listUnlinkedLessons({ from: "2026-10-05", to: "2026-10-18" });
    expect(rows.map((x) => x.id)).toEqual([L1, L2]);
    const q = r.calls[1];
    expect(q.url.split("?")[1]).toBe(FILTER);
    expect(q.body).toEqual({
      page_size: 100,
      filter: { and: [
        { property: "Date", date: { on_or_after: "2026-10-05" } },
        { property: "Date", date: { on_or_before: "2026-10-18" } },
        { property: "Class occurrence", rich_text: { is_empty: true } },
      ] },
    });
  });
  it("stops after 10 pages", async () => {
    const r = recorder((c) => (isSchema(c) ? json(SCHEMA) : json({ results: [page(L1)], has_more: true, next_cursor: "x" })));
    await expect(createLessonsPort(cfg, r.fetcher).listUnlinkedLessons({ from: "2026-10-05", to: "2026-10-18" })).rejects.toMatchObject({ name: "NotionError" });
    expect(r.calls.filter((c) => c.method === "POST")).toHaveLength(10);
  });
});

describe("fetchTrialLessons (REQ-54 AC1, AC6, AC7)", () => {
  const DS = "6300f58a-8b8c-4789-88c1-e44272079b0f";
  const TRIAL_SCHEMA = {
    Lesson: "title", Type: "ty", Date: "dt", Teacher: "te", "Related to Students & Parents (Lessons 1)": "st", "Duration (hrs)": "du",
    "Topic Covered": "tc", "Trial: Diagnosis": "dg", "Trial: Preferred Lesson Day": "pd", "Paid to Teacher": "pt", "Pay Period": "pp",
  };
  const trial = (id: string, topic = "Quadratics", diagnosis = "") => ({
    object: "page", id, properties: {
      Type: v.select("Trial"), Date: v.date("2026-10-18"), Teacher: v.rel(STAFF), "Related to Students & Parents (Lessons 1)": v.rel(STUDENT),
      "Duration (hrs)": v.num(1), "Topic Covered": v.text(topic), "Trial: Diagnosis": v.text(diagnosis), "Trial: Preferred Lesson Day": v.multi(["Tue", "Thu"]),
      "Paid to Teacher": { type: "checkbox", checkbox: true }, "Pay Period": v.select("Oct 1-15"),
    },
  });

  it("TRIAL_PROPS is the design list and names no payout field", () => {
    expect([...TRIAL_PROPS]).toEqual(["Type", "Date", "Teacher", "Related to Students & Parents (Lessons 1)", "Duration (hrs)", "Topic Covered", "Trial: Diagnosis", "Trial: Preferred Lesson Day"]);
    expect(TRIAL_PROPS.join("|")).not.toMatch(/Paid to Teacher|Pay Period/);
  });

  it("asks for Type = Trial, Date descending, the listed ids only, and works with no Class occurrence", async () => {
    const f = notionFake({ dataSourceId: DS, schema: TRIAL_SCHEMA, pages: [[trial(L1)]] });
    const r = await fetchTrialLessons({ token: "t", dataSourceId: DS }, { fetcher: f.fetcher, maxPages: 10 });
    expect(filterIds(f.calls[1])).toEqual(["ty", "dt", "te", "st", "du", "tc", "dg", "pd"]);
    expect(f.calls[1].body).toEqual({ page_size: 100, filter: { property: "Type", select: { equals: "Trial" } }, sorts: [{ property: "Date", direction: "descending" }] });
    expect(r.rows).toEqual([{ id: L1, date: "2026-10-18", teacherId: STAFF, studentId: STUDENT, durationHours: 1, hasTopic: true, hasDiagnosis: false, preferredDays: ["Tue", "Thu"] }]);
    expect(JSON.stringify(r)).not.toMatch(/Quadratics|Oct 1-15/);
  });

  it("full, paginated and truncated reads make only schema GETs and data source queries", async () => {
    for (const [pages, maxPages, complete] of [[[[trial(L1)]], 10, true], [[[trial(L1)], [trial(L2)]], 10, true], [[[trial(L1)], [trial(L2)]], 1, false]] as const) {
      const f = notionFake({ dataSourceId: DS, schema: TRIAL_SCHEMA, pages: pages as unknown[][] });
      const r = await fetchTrialLessons({ token: "t", dataSourceId: DS }, { fetcher: f.fetcher, maxPages });
      expect(r.complete).toBe(complete);
      expect(onlyReads(f.calls, DS)).toBe(true);
    }
  });
});
