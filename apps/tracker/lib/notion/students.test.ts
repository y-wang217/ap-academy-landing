import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ACTIVE_STUDENT_STAGES, fetchScheduledStudentNames, fetchScheduledStudents, fetchStudentNames, fetchStudentPeople, fetchStudentSchedule, parseStudentPage, writeWeeklySchedule } from "./students";
import { NotionError } from "./staff";

const S1 = "11111111-1111-4111-8111-111111111111";
const cfg = { token: "secret_x", dataSourceId: "ds-students" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const SCHEMA = {
  properties: {
    "Student Name": { id: "title", type: "title" },
    Stage: { id: "st%3Ag", type: "select" },
    "Weekly Schedule": { id: "wk1", type: "rich_text" },
    "Parent Email": { id: "pe", type: "email" },
    Owner: { id: "ow", type: "relation" },
    "Trial Teacher": { id: "tt", type: "relation" },
  },
};
const page = (id: string, name: string, stage: string | null, text: string) => ({
  object: "page",
  id,
  properties: {
    "Student Name": { type: "title", title: [{ plain_text: name }] },
    Stage: { type: "select", select: stage ? { name: stage } : null },
    "Weekly Schedule": { type: "rich_text", rich_text: text ? [{ plain_text: text }] : [] },
    "Parent Email": { type: "email", email: "parent@example.com" },
    "Parent Phone": { type: "phone_number", phone_number: "555-0100" },
    Owner: { type: "relation", relation: [{ id: "o" }] },
    "Trial Teacher": { type: "relation", relation: [{ id: "t" }] },
    Notes: { type: "rich_text", rich_text: [{ plain_text: "private" }] },
  },
});

type Call = { url: string; method: string; body: unknown };
function recorder(handler: (c: Call) => Response) {
  const calls: Call[] = [];
  const fetcher = (async (url: string, init?: RequestInit) => {
    const c = { url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(c);
    return handler(c);
  }) as unknown as typeof fetch;
  return { calls, fetcher };
}

describe("parseStudentPage", () => {
  it("AC20: keeps exactly four keys and drops owner, trial teacher, parent and notes fields", () => {
    const rec = parseStudentPage(page(S1, "Sam Lee", "Active", "Tue 17:30-18:30 | Math | Jane Doe"));
    expect(Object.keys(rec).sort()).toEqual(["id", "name", "stage", "weeklySchedule"]);
    expect(JSON.stringify(rec)).not.toMatch(/parent|555|private|Owner|Trial/);
  });
  it("joins rich-text segments and tolerates empty values", () => {
    const p = page(S1, "Sam", null, "");
    expect(parseStudentPage(p)).toEqual({ id: S1, name: "Sam", stage: "", weeklySchedule: "" });
  });
});

describe("fetchScheduledStudents", () => {
  it("AC20: filters on Stage and asks Notion for the three properties only", async () => {
    const { calls, fetcher } = recorder((c) => (c.method === "GET" ? json(SCHEMA) : json({ results: [page(S1, "Sam", "Active", "x")], has_more: false })));
    const out = await fetchScheduledStudents(cfg, fetcher);
    expect(out).toHaveLength(1);
    const q = calls.find((c) => c.method === "POST")!;
    expect(q.url).toContain("/v1/data_sources/ds-students/query");
    const params = new URL(q.url).searchParams.getAll("filter_properties[]");
    expect(params.sort()).toEqual(["st:g", "title", "wk1"].sort());
    expect(JSON.stringify(q.body)).toContain("Onboarding");
    expect(JSON.stringify(q.body)).toContain("Active");
    expect(JSON.stringify(q.body)).not.toContain("Paused");
  });

  it("follows pagination and fails clearly when Notion errors", async () => {
    let n = 0;
    const { fetcher } = recorder((c) => {
      if (c.method === "GET") return json(SCHEMA);
      n++;
      return n === 1
        ? json({ results: [page(S1, "A", "Active", "x")], has_more: true, next_cursor: "c1" })
        : json({ results: [page("22222222-2222-4222-8222-222222222222", "B", "Active", "y")], has_more: false });
    });
    expect(await fetchScheduledStudents(cfg, fetcher)).toHaveLength(2);
    const bad = recorder(() => json({}, 500));
    await expect(fetchScheduledStudents(cfg, bad.fetcher)).rejects.toBeInstanceOf(NotionError);
  });

  it("fails when a needed property is missing from the schema", async () => {
    const { fetcher } = recorder(() => json({ properties: { Stage: { id: "s", type: "select" } } }));
    await expect(fetchScheduledStudents(cfg, fetcher)).rejects.toBeInstanceOf(NotionError);
  });
});

describe("fetchStudentNames (REQ-6 AC7, AC18)", () => {
  it("asks Notion for the Student Name property only and returns a map", async () => {
    const { calls, fetcher } = recorder((c) => (c.method === "GET" ? json(SCHEMA) : json({ results: [page(S1, "Sam Lee", "Active", "private text")], has_more: false })));
    const names = await fetchStudentNames(cfg, fetcher);
    expect([...names]).toEqual([[S1, "Sam Lee"]]);
    const q = calls.find((c) => c.method === "POST")!;
    expect(new URL(q.url).searchParams.getAll("filter_properties[]")).toEqual(["title"]);
    expect(JSON.stringify(q.body)).toContain("Onboarding");
  });
  it("skips malformed pages and fails clearly when Notion errors", async () => {
    const { fetcher } = recorder((c) => (c.method === "GET" ? json(SCHEMA) : json({ results: [{ id: "nope" }, page(S1, "Sam", "Active", "")], has_more: false })));
    expect((await fetchStudentNames(cfg, fetcher)).size).toBe(1);
    const bad = recorder(() => json({}, 500));
    await expect(fetchStudentNames(cfg, bad.fetcher)).rejects.toBeInstanceOf(NotionError);
  });
});

describe("fetchScheduledStudentNames (REQ-33 AC13, AC8)", () => {
  it("asks for Student Name only, filters on stage and a non-empty Weekly Schedule, returns [id, name] pairs", async () => {
    const { calls, fetcher } = recorder((c) => (c.method === "GET" ? json(SCHEMA) : json({ results: [page(S1, "Sam Lee", "Active", "Tue 17:30-18:30 | Math | Jane")], has_more: false })));
    const out = await fetchScheduledStudentNames(cfg, fetcher);
    expect(out).toEqual([[S1, "Sam Lee"]]);
    expect(JSON.stringify(out)).not.toContain("17:30");
    const posts = calls.filter((c) => c.method === "POST");
    expect(posts).toHaveLength(1);
    expect(posts[0].url).toContain("/v1/data_sources/ds-students/query");
    expect(new URL(posts[0].url).searchParams.getAll("filter_properties[]")).toEqual(["title"]);
    expect((posts[0].body as { filter: unknown }).filter).toEqual({
      and: [
        { or: [{ property: "Stage", select: { equals: "Active" } }, { property: "Stage", select: { equals: "Onboarding" } }] },
        { property: "Weekly Schedule", rich_text: { is_not_empty: true } },
      ],
    });
    expect(calls.every((c) => c.url.includes("/data_sources/ds-students"))).toBe(true);
  });
  it("follows next_cursor and throws NotionError on a non-OK answer", async () => {
    let n = 0;
    const { calls, fetcher } = recorder((c) => {
      if (c.method === "GET") return json(SCHEMA);
      n++;
      return n === 1
        ? json({ results: [page(S1, "A", "Active", "x")], has_more: true, next_cursor: "c1" })
        : json({ results: [page("22222222-2222-4222-8222-222222222222", "B", "Active", "y")], has_more: false });
    });
    expect((await fetchScheduledStudentNames(cfg, fetcher)).map(([, name]) => name)).toEqual(["A", "B"]);
    expect((calls.filter((c) => c.method === "POST")[1].body as { start_cursor?: string }).start_cursor).toBe("c1");
    const bad = recorder((c) => (c.method === "GET" ? json(SCHEMA) : json({}, 503)));
    await expect(fetchScheduledStudentNames(cfg, bad.fetcher)).rejects.toBeInstanceOf(NotionError);
  });
});

describe("fetchStudentSchedule", () => {
  it("reads one page's Weekly Schedule, and returns null on 404", async () => {
    const { calls, fetcher } = recorder((c) => (c.url.includes("/data_sources/") ? json(SCHEMA) : json(page(S1, "Sam", "Active", "Tue 17:30-18:30 | A | B"))));
    expect(await fetchStudentSchedule(cfg, S1, fetcher)).toEqual({ id: S1, name: "Sam", stage: "Active", weeklySchedule: "Tue 17:30-18:30 | A | B" });
    expect(calls.at(-1)!.url).toContain(`/v1/pages/${S1}`);
    const nf = recorder((c) => (c.url.includes("/data_sources/") ? json(SCHEMA) : json({}, 404)));
    expect(await fetchStudentSchedule(cfg, S1, nf.fetcher)).toBeNull();
  });
});

describe("writeWeeklySchedule", () => {
  it("AC18: PATCHes /v1/pages/{id} with exactly one property key", async () => {
    const { calls, fetcher } = recorder(() => json(page(S1, "Sam", "Active", "x")));
    await writeWeeklySchedule(cfg, S1, "Tue 17:30-18:30 | A | B", fetcher);
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("PATCH");
    expect(calls[0].url).toBe(`https://api.notion.com/v1/pages/${S1}`);
    const body = calls[0].body as { properties: Record<string, { rich_text: { text: { content: string } }[] }> };
    expect(Object.keys(body)).toEqual(["properties"]);
    expect(Object.keys(body.properties)).toEqual(["Weekly Schedule"]);
    expect(body.properties["Weekly Schedule"].rich_text).toEqual([{ type: "text", text: { content: "Tue 17:30-18:30 | A | B" } }]);
  });
  it("writes an empty summary as an empty rich_text array", async () => {
    const { calls, fetcher } = recorder(() => json({}));
    await writeWeeklySchedule(cfg, S1, "", fetcher);
    expect((calls[0].body as { properties: Record<string, unknown> }).properties["Weekly Schedule"]).toEqual({ rich_text: [] });
  });
  it("AC18: rejects text over 2000 characters without calling Notion", async () => {
    const { calls, fetcher } = recorder(() => json({}));
    await expect(writeWeeklySchedule(cfg, S1, "x".repeat(2001), fetcher)).rejects.toBeInstanceOf(NotionError);
    expect(calls).toHaveLength(0);
  });
  it("rejects a non-GUID page ID and surfaces Notion errors", async () => {
    const { fetcher } = recorder(() => json({}, 429));
    await expect(writeWeeklySchedule(cfg, "../x", "a", fetcher)).rejects.toBeInstanceOf(NotionError);
    await expect(writeWeeklySchedule(cfg, S1, "a", fetcher)).rejects.toMatchObject({ status: 429 });
  });
});

describe("source scan", () => {
  const dir = join(__dirname);
  const read = (f: string) => readFileSync(join(dir, f), "utf8");
  it("AC4/AC18: students.ts never names Owner or Trial Teacher and writes only the Weekly Schedule property", () => {
    const src = read("students.ts");
    expect(src).not.toMatch(/Owner|Trial Teacher/);
    expect(src.match(/method: "PATCH"/g)).toHaveLength(1);
    expect(src).not.toMatch(/lessons|payout/i);
  });
  it("only billing.ts (read-only, REQ-25), lessons.ts (REQ-39), staff.ts, students.ts and work.ts call api.notion.com", () => {
    const hits = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && read(f).includes("api.notion.com")).sort();
    expect(hits).toEqual(["billing.ts", "lessons.ts", "staff.ts", "students.ts", "work.ts"]);
  });
});

describe("fetchStudentPeople (REQ-38 AC3)", () => {
  it("asks for Student Name and Stage only, over every stage, and never returns Weekly Schedule", async () => {
    const { calls, fetcher } = recorder((c) => (c.method === "GET" ? json(SCHEMA) : json({ results: [page(S1, " Sam Lee ", "Lost", "private text")], has_more: false })));
    const people = await fetchStudentPeople(cfg, fetcher);
    expect(people).toEqual([{ id: S1, name: "Sam Lee", stage: "Lost" }]);
    const q = calls.find((c) => c.method === "POST")!;
    expect(new URL(q.url).searchParams.getAll("filter_properties[]")).toEqual(["title", "st:g"]);
    expect(q.body).not.toHaveProperty("filter");
    expect(JSON.stringify(people)).not.toMatch(/private|parent@|555/);
  });
  it("paginates", async () => {
    const S2 = "22222222-2222-4222-8222-222222222222";
    let n = 0;
    const { calls, fetcher } = recorder((c) => {
      if (c.method === "GET") return json(SCHEMA);
      n += 1;
      return n === 1 ? json({ results: [page(S1, "A", "Active", "")], has_more: true, next_cursor: "c2" }) : json({ results: [page(S2, "B", null, "")], has_more: false });
    });
    expect((await fetchStudentPeople(cfg, fetcher)).map((p) => [p.id, p.stage])).toEqual([[S1, "Active"], [S2, ""]]);
    expect((calls[2].body as { start_cursor: string }).start_cursor).toBe("c2");
  });
  it("fails clearly when Notion errors", async () => {
    await expect(fetchStudentPeople(cfg, recorder(() => json({}, 500)).fetcher)).rejects.toBeInstanceOf(NotionError);
  });
  it("names the active stages once", () => {
    expect(ACTIVE_STUDENT_STAGES).toEqual(["Active", "Onboarding"]);
  });
});
