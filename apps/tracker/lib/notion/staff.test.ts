import { describe, expect, it } from "vitest";
import { fetchStaff, fetchStaffForSync, NotionError, parseStaffPage } from "./staff";

const ID1 = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";

function page(id: string, name: string) {
  return {
    object: "page",
    id,
    properties: {
      Name: { type: "title", title: [{ plain_text: name }] },
      Email: { type: "email", email: "t@example.com" },
      Status: { type: "select", select: { name: "Active" } },
      Function: { type: "multi_select", multi_select: [{ name: "Teacher" }] },
      Subjects: { type: "multi_select", multi_select: [{ name: "MHF4U" }, { name: "SPH3U" }] },
      "Hourly Rate (CAD)": { type: "number", number: 60 },
      "Payment Method": { type: "select", select: { name: "E-transfer" } },
      Phone: { type: "phone_number", phone_number: "555-0100" },
      Notes: { type: "rich_text", rich_text: [{ plain_text: "secret" }] },
      Role: { type: "select", select: { name: "Lead Teacher" } },
      "Lessons Taught": { type: "relation", relation: [{ id: "x" }] },
    },
  };
}

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const cfg = { token: "secret_x", dataSourceId: "ds-1" };

describe("parseStaffPage", () => {
  it("keeps exactly six keys and drops financial and personal fields", () => {
    const rec = parseStaffPage(page(ID1, "Mr. Ryan"));
    expect(Object.keys(rec).sort()).toEqual(["email", "functions", "id", "name", "status", "subjects"]);
    expect(rec).toEqual({
      id: ID1, name: "Mr. Ryan", email: "t@example.com", functions: ["Teacher"], status: "Active",
      subjects: ["MHF4U", "SPH3U"],
    });
    expect(JSON.stringify(rec)).not.toMatch(/60|E-transfer|555|secret|Lead Teacher/);
  });
  it("tolerates empty email, status and function", () => {
    const p = page(ID1, "X");
    p.properties.Email = { type: "email", email: null as never };
    p.properties.Status = { type: "select", select: null as never };
    p.properties.Function = { type: "multi_select", multi_select: [] };
    const rec = parseStaffPage(p);
    expect(rec.email).toBeNull();
    expect(rec.status).toBeNull();
    expect(rec.functions).toEqual([]);
  });
});

describe("fetchStaff", () => {
  it("follows next_cursor and sends the token and version header", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetcher = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return calls.length === 1
        ? ok({ results: [page(ID1, "A")], has_more: true, next_cursor: "c2" })
        : ok({ results: [page(ID2, "B")], has_more: false, next_cursor: null });
    }) as unknown as typeof fetch;
    const staff = await fetchStaff(cfg, fetcher);
    expect(staff.map((s) => s.name)).toEqual(["A", "B"]);
    expect(calls[0].url).toBe("https://api.notion.com/v1/data_sources/ds-1/query");
    const h = calls[0].init.headers as Record<string, string>;
    expect(h.Authorization).toBe("Bearer secret_x");
    expect(h["Notion-Version"]).toBe("2025-09-03");
    expect(JSON.parse(calls[1].init.body as string).start_cursor).toBe("c2");
  });
  it("throws a typed error on a non-200", async () => {
    const fetcher = (async () => new Response("{}", { status: 429 })) as unknown as typeof fetch;
    await expect(fetchStaff(cfg, fetcher)).rejects.toBeInstanceOf(NotionError);
  });
  it("throws a typed error on a network failure", async () => {
    const fetcher = (async () => { throw new Error("down"); }) as unknown as typeof fetch;
    await expect(fetchStaff(cfg, fetcher)).rejects.toBeInstanceOf(NotionError);
  });
  it("skips pages that are not valid staff rows instead of failing the list", async () => {
    const fetcher = (async () => ok({ results: [{ id: "not-a-uuid", properties: {} }, page(ID1, "A")], has_more: false })) as unknown as typeof fetch;
    expect((await fetchStaff(cfg, fetcher)).map((s) => s.id)).toEqual([ID1]);
  });
});

describe("fetchStaffForSync (REQ-38 AC3)", () => {
  const SCHEMA = {
    properties: {
      Name: { id: "title" }, Email: { id: "em" }, Status: { id: "st" }, Function: { id: "fn" }, Subjects: { id: "sb" },
      "Hourly Rate (CAD)": { id: "rt" }, Phone: { id: "ph" },
    },
  };
  function recorder(respond: (url: string, init: RequestInit) => Response) {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetcher = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return respond(url, init);
    }) as unknown as typeof fetch;
    return { calls, fetcher };
  }

  it("reads the schema, then queries with exactly Name, Status, Function and Subjects, never Email", async () => {
    const { calls, fetcher } = recorder((_url, init) => (init.method === "GET" ? ok(SCHEMA) : ok({ results: [page(ID1, " Mr. Ryan ")], has_more: false })));
    const staff = await fetchStaffForSync(cfg, fetcher);
    expect(staff).toEqual([{ id: ID1, name: "Mr. Ryan", subjects: ["MHF4U", "SPH3U"], active: true }]);
    expect(Object.keys(staff[0]).sort()).toEqual(["active", "id", "name", "subjects"]);
    expect(calls[0].url).toBe("https://api.notion.com/v1/data_sources/ds-1");
    const q = calls.find((c) => c.init.method === "POST")!;
    expect(new URL(q.url).searchParams.getAll("filter_properties[]")).toEqual(["title", "st", "fn", "sb"]);
    expect(q.url).not.toContain("em");
    expect(JSON.stringify(staff)).not.toMatch(/t@example.com|60|555|secret/);
  });
  it("paginates and computes active from Status and Function", async () => {
    const inactive = page(ID2, "B");
    inactive.properties.Status = { type: "select", select: { name: "Inactive" } };
    let n = 0;
    const { calls, fetcher } = recorder((_url, init) => {
      if (init.method === "GET") return ok(SCHEMA);
      n += 1;
      return n === 1 ? ok({ results: [page(ID1, "A")], has_more: true, next_cursor: "c2" }) : ok({ results: [inactive], has_more: false });
    });
    const staff = await fetchStaffForSync(cfg, fetcher);
    expect(staff.map((s) => [s.id, s.active])).toEqual([[ID1, true], [ID2, false]]);
    expect(JSON.parse(calls[2].init.body as string).start_cursor).toBe("c2");
  });
  it("throws NotionError on a 500 and on a missing property", async () => {
    await expect(fetchStaffForSync(cfg, recorder(() => new Response("{}", { status: 500 })).fetcher)).rejects.toBeInstanceOf(NotionError);
    const noSubjects = { properties: { Name: { id: "title" }, Status: { id: "st" }, Function: { id: "fn" } } };
    await expect(fetchStaffForSync(cfg, recorder(() => ok(noSubjects)).fetcher)).rejects.toBeInstanceOf(NotionError);
  });
});
