import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fetchFamilyDirectory } from "./parents";
import { NotionError } from "./staff";

// REQ-42 AC17, AC25: the family directory, read live and uncached for one Iris run.
const cfg = { token: "secret_x", dataSourceId: "ds-students" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const S1 = "11111111-1111-4111-8111-111111111111";
const SCHEMA = {
  properties: {
    "Student Name": { id: "title" },
    Stage: { id: "st%3Ag" },
    "Parent Email": { id: "pe" },
    "Parent Name": { id: "pn" },
    "Parent Phone": { id: "pp" },
    "Hourly Rate (CAD)": { id: "hr" },
  },
};
const page = (id: string, name: string, email: string | null) => ({
  object: "page",
  id,
  properties: {
    "Student Name": { type: "title", title: [{ plain_text: name }] },
    Stage: { type: "select", select: { name: "Paused" } },
    "Parent Email": { type: "email", email },
    "Parent Name": { type: "rich_text", rich_text: [{ plain_text: "Pat Lee" }] },
    "Parent Phone": { type: "phone_number", phone_number: "555-0100" },
    "Hourly Rate (CAD)": { type: "number", number: 60 },
  },
});

type Call = { url: string; method: string; body: unknown; cache: RequestCache | undefined };
function recorder(handler: (c: Call, n: number) => Response) {
  const calls: Call[] = [];
  const fetcher = (async (url: string, init?: RequestInit) => {
    const c = { url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined, cache: init?.cache };
    calls.push(c);
    return handler(c, calls.length);
  }) as unknown as typeof fetch;
  return { calls, fetcher };
}

describe("fetchFamilyDirectory", () => {
  it("reads the schema once, then queries exactly four properties for Active, Onboarding and Paused", async () => {
    const r = recorder((c) => (c.method === "GET" ? json(SCHEMA) : json({ results: [page(S1, "Sam Lee", "Ann@X.com")], has_more: false, next_cursor: null })));
    const dir = await fetchFamilyDirectory(cfg, r.fetcher);
    expect(r.calls.map((c) => c.method)).toEqual(["GET", "POST"]);
    expect(r.calls[0].url).toMatch(/\/v1\/data_sources\/ds-students$/);
    const q = r.calls[1].url.split("?")[1];
    expect(q.split("&").sort()).toEqual(["filter_properties[]=pe", "filter_properties[]=pn", "filter_properties[]=st%3Ag", "filter_properties[]=title"]);
    expect(r.calls[1].body).toMatchObject({
      page_size: 100,
      filter: { or: ["Active", "Onboarding", "Paused"].map((name) => ({ property: "Stage", select: { equals: name } })) },
    });
    for (const c of r.calls) expect(c.cache).toBe("no-store");
    expect(dir).toEqual([{ studentId: S1, studentName: "Sam Lee", stage: "Paused", parentEmail: "Ann@X.com", parentName: "Pat Lee" }]);
  });

  it("keeps the four fields only, even when the page carries more", async () => {
    const r = recorder((c) => (c.method === "GET" ? json(SCHEMA) : json({ results: [page(S1, "Sam Lee", null)], has_more: false })));
    const [entry] = await fetchFamilyDirectory(cfg, r.fetcher);
    expect(Object.keys(entry).sort()).toEqual(["parentEmail", "parentName", "stage", "studentId", "studentName"]);
    expect(entry.parentEmail).toBe("");
    expect(JSON.stringify(entry)).not.toMatch(/555|60/);
  });

  it("throws NotionError when a property is missing", async () => {
    const r = recorder(() => json({ properties: { "Student Name": { id: "title" }, Stage: { id: "s" } } }));
    const err = await fetchFamilyDirectory(cfg, r.fetcher).catch((e) => e);
    expect(err).toBeInstanceOf(NotionError);
    expect(err.message).toBe("Students database is missing a needed property");
  });

  it("stops paging at 50 pages", async () => {
    const r = recorder((c, n) => (c.method === "GET" ? json(SCHEMA) : json({ results: [], has_more: true, next_cursor: `c${n}` })));
    await expect(fetchFamilyDirectory(cfg, r.fetcher)).rejects.toBeInstanceOf(NotionError);
    expect(r.calls.filter((c) => c.method === "POST")).toHaveLength(50);
  });

  it("a failed query is a NotionError", async () => {
    const r = recorder((c) => (c.method === "GET" ? json(SCHEMA) : json({}, 500)));
    await expect(fetchFamilyDirectory(cfg, r.fetcher)).rejects.toBeInstanceOf(NotionError);
  });

  it("uses only GET and POST", () => {
    const src = readFileSync(join(__dirname, "parents.ts"), "utf8");
    expect(src).not.toMatch(/"PATCH"|"DELETE"|"PUT"/);
  });
});
