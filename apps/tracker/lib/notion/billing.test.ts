import { describe, expect, it } from "vitest";
import {
  fetchChildBilling, fetchCredits, fetchInvoicePdf, fetchInvoices, fetchInvoiceSharers, fetchSiblingNames,
  type BillingConfig,
} from "./billing";
import { NotionError } from "./staff";

const INVOICES = "be0f91e4-f054-4055-9ca6-c4e1a22c4f27";
const CREDITS = "38cdcded-9bef-4e68-bceb-a56920f098bd";
const STUDENTS = "fe3d651a-70c6-4d1e-8a38-656163d6bc63";
const config: BillingConfig = { token: "t", invoicesId: INVOICES, creditsId: CREDITS, studentsId: STUDENTS };
const CHILD = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0001";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0002";
const INV_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeee0001";

// Every property the real databases have that this card must not request is in the schema too, with an ID.
const SCHEMAS: Record<string, Record<string, string>> = {
  [INVOICES]: {
    Invoice: "title", Month: "mon", "Amount (CAD)": "amt", "Credit Applied (CAD)": "cap", Credits: "crs", Issued: "iss",
    Due: "due", Status: "sta", PDF: "pdf", Student: "stu", Hours: "hrs", "Rate (CAD)": "rat", "Paid On": "pon", Notes: "nts",
  },
  [CREDITS]: {
    Session: "title", Date: "dat", Course: "cou", Hours: "hrs", "Rate (CAD)": "rat", "Credit Status": "cst", "Applied To": "apt",
    Student: "stu", Notes: "nts", Reason: "rsn", "Billed Month": "bmo", Invoice: "inv",
  },
  [STUDENTS]: {
    "Student Name": "title", "Hourly Rate (CAD)": "hr", "Lesson Cadence": "lc", "Billing Family": "bf", "Parent Phone": "pp", Notes: "nts",
  },
};
const schemaBody = (ds: string) => ({ properties: Object.fromEntries(Object.entries(SCHEMAS[ds]).map(([n, id]) => [n, { id }])) });

const rt = (s: string) => ({ rich_text: s ? [{ plain_text: s }] : [] });
const rel = (...ids: string[]) => ({ relation: ids.map((id) => ({ id })) });
const invoicePage = (over: { id?: string; number?: string; status?: string; student?: string; files?: unknown[] } = {}) => ({
  id: over.id ?? INV_ID,
  parent: { type: "data_source_id", data_source_id: INVOICES },
  properties: {
    Invoice: { title: [{ plain_text: over.number ?? "AP-2026-0005" }] },
    Month: rt("2026-10"),
    "Amount (CAD)": { number: 420 },
    "Credit Applied (CAD)": { number: 60 },
    Credits: rel("cccccccc-0000-4000-8000-000000000001"),
    Issued: { date: { start: "2026-10-13" } },
    Due: { date: { start: "2026-10-20" } },
    Status: { select: { name: over.status ?? "Sent" } },
    PDF: { files: over.files ?? [{ name: "a.pdf", type: "file", file: { url: "https://prod-files-secure.s3.us-west-2.amazonaws.com/x.pdf", expiry_time: "z" } }] },
    Student: rel(over.student ?? CHILD),
    Notes: rt("CANARY-NOTE"),
    "Parent Phone": { phone_number: "555-0199" },
  },
});
const creditPage = (over: { id?: string; status?: string; student?: string } = {}) => ({
  id: over.id ?? "cccccccc-0000-4000-8000-000000000001",
  properties: {
    Date: { date: { start: "2026-10-03" } },
    Course: rt("MHF4U"),
    Hours: { number: 1 },
    "Rate (CAD)": { number: 60 },
    "Credit Status": { select: { name: over.status ?? "Applied" } },
    "Applied To": rt("AP-2026-0005, Oct 2026"),
    Student: rel(over.student ?? CHILD),
    Notes: rt("CANARY-NOTE"),
    Reason: { select: { name: "Student missed" } },
  },
});

type Call = { method: string; url: string; body: unknown };
function fakeFetch(handlers: { query?: (ds: string, body: Record<string, unknown>) => unknown; page?: (id: string) => { status?: number; body?: unknown } } = {}) {
  const calls: Call[] = [];
  const fetcher = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ method, url, body });
    const path = new URL(url).pathname;
    const schema = /^\/v1\/data_sources\/([^/]+)$/.exec(path);
    if (schema && method === "GET") return Response.json(schemaBody(schema[1]));
    const query = /^\/v1\/data_sources\/([^/]+)\/query$/.exec(path);
    if (query && method === "POST") return Response.json({ results: handlers.query?.(query[1], body) ?? [], has_more: false, next_cursor: null });
    const page = /^\/v1\/pages\/([^/]+)$/.exec(path);
    if (page && method === "GET") {
      const out = handlers.page?.(page[1]) ?? { status: 404 };
      return Response.json(out.body ?? { object: "error" }, { status: out.status ?? 200 });
    }
    return Response.json({ object: "error" }, { status: 404 });
  }) as typeof fetch;
  return { fetcher, calls };
}
const props = (url: string) => new URL(url).searchParams.getAll("filter_properties[]").sort();
const noWrites = (calls: Call[]) => calls.every((c) => c.method !== "PATCH" && !(c.method === "POST" && new URL(c.url).pathname === "/v1/pages"));

describe("fetchInvoices (AC3, AC11)", () => {
  it("asks for exactly the listed properties, filtered on the child and the visible statuses", async () => {
    const { fetcher, calls } = fakeFetch({ query: () => [invoicePage()] });
    await fetchInvoices(config, CHILD, { fetcher });
    const q = calls.find((c) => c.url.includes("/query"))!;
    expect(props(q.url)).toEqual(["amt", "cap", "crs", "due", "iss", "mon", "pdf", "sta", "stu", "title"]);
    expect(q.body).toMatchObject({
      filter: { and: [
        { property: "Student", relation: { contains: CHILD } },
        { property: "Status", select: { does_not_equal: "Draft" } },
        { property: "Status", select: { does_not_equal: "Void" } },
      ] },
    });
    expect(noWrites(calls)).toBe(true);
  });
  it("drops Draft, Void and another student's rows, and keeps no canary or file URL", async () => {
    const { fetcher } = fakeFetch({
      query: () => [
        invoicePage({ id: "eeeeeeee-eeee-4eee-8eee-eeeeeeee0001" }),
        invoicePage({ id: "eeeeeeee-eeee-4eee-8eee-eeeeeeee0002", status: "Draft" }),
        invoicePage({ id: "eeeeeeee-eeee-4eee-8eee-eeeeeeee0003", status: "Void" }),
        invoicePage({ id: "eeeeeeee-eeee-4eee-8eee-eeeeeeee0004", student: OTHER }),
      ],
    });
    const out = await fetchInvoices(config, CHILD, { fetcher });
    expect(out.map((i) => i.id)).toEqual(["eeeeeeee-eeee-4eee-8eee-eeeeeeee0001"]);
    expect(out[0]).toMatchObject({
      number: "AP-2026-0005", month: "2026-10", amount: 420, creditApplied: 60, issued: "2026-10-13", due: "2026-10-20",
      status: "Sent", hasPdf: true, creditIds: ["cccccccc-0000-4000-8000-000000000001"],
    });
    const text = JSON.stringify(out);
    for (const canary of ["CANARY-NOTE", "555-0199", "amazonaws", "http"]) expect(text).not.toContain(canary);
  });
  it("an external-only PDF is no PDF", async () => {
    const { fetcher } = fakeFetch({ query: () => [invoicePage({ files: [{ name: "x", type: "external", external: { url: "https://evil.example/x.pdf" } }] })] });
    expect((await fetchInvoices(config, CHILD, { fetcher }))[0].hasPdf).toBe(false);
  });
  it("a non-2xx answer throws NotionError", async () => {
    const fetcher = (async () => Response.json({}, { status: 500 })) as unknown as typeof fetch;
    await expect(fetchInvoices(config, CHILD, { fetcher })).rejects.toBeInstanceOf(NotionError);
  });
});

describe("fetchCredits (AC11)", () => {
  it("asks for exactly the listed properties, filtered on the child, and drops other rows and canaries", async () => {
    const { fetcher, calls } = fakeFetch({ query: () => [creditPage(), creditPage({ id: "cccccccc-0000-4000-8000-000000000002", student: OTHER })] });
    const out = await fetchCredits(config, CHILD, { fetcher });
    const q = calls.find((c) => c.url.includes("/query"))!;
    expect(props(q.url)).toEqual(["apt", "cou", "cst", "dat", "hrs", "rat", "stu"]);
    expect(q.body).toMatchObject({ filter: { property: "Student", relation: { contains: CHILD } } });
    expect(out).toEqual([{ id: "cccccccc-0000-4000-8000-000000000001", date: "2026-10-03", course: "MHF4U", hours: 1, rate: 60, status: "Applied", appliedTo: "AP-2026-0005, Oct 2026" }]);
    expect(JSON.stringify(out)).not.toMatch(/CANARY|Student missed/);
    expect(noWrites(calls)).toBe(true);
  });
});

describe("fetchChildBilling and fetchSiblingNames (AC8, AC11)", () => {
  const studentPage = (id: string, name: string, family: string) => ({
    id,
    properties: {
      "Student Name": { title: [{ plain_text: name }] },
      "Hourly Rate (CAD)": { number: 60 },
      "Lesson Cadence": { select: { name: "2x/week" } },
      "Billing Family": rt(family),
      "Parent Phone": { phone_number: "555-0199" },
    },
  });
  it("the child page asks for the rate, cadence and family only", async () => {
    const { fetcher, calls } = fakeFetch({ page: (id) => ({ body: studentPage(id, "Ada P", "Afzal") }) });
    expect(await fetchChildBilling(config, CHILD, { fetcher })).toEqual({ rate: 60, cadence: "2x/week", family: "Afzal" });
    expect(props(calls.find((c) => c.url.includes("/pages/"))!.url)).toEqual(["bf", "hr", "lc"]);
  });
  it("a failed child page throws", async () => {
    const { fetcher } = fakeFetch({ page: () => ({ status: 404 }) });
    await expect(fetchChildBilling(config, CHILD, { fetcher })).rejects.toBeInstanceOf(NotionError);
  });
  it("sibling GETs ask for Student Name and Billing Family only, at most 4, first names only", async () => {
    const ids = [1, 2, 3, 4, 5].map((n) => `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb000${n}`);
    const { fetcher, calls } = fakeFetch({ page: (id) => ({ body: studentPage(id, "Haider Afzal", "Afzal") }) });
    const out = await fetchSiblingNames(config, ids, { fetcher });
    const gets = calls.filter((c) => c.url.includes("/pages/"));
    expect(gets).toHaveLength(4);
    for (const g of gets) expect(props(g.url)).toEqual(["bf", "title"]);
    expect(out[ids[0]]).toEqual({ firstName: "Haider", family: "Afzal" });
    expect(JSON.stringify(out)).not.toContain("555-0199");
  });
});

describe("fetchInvoiceSharers (AC7, AC11)", () => {
  it("one query over the numbers returns the other students per number", async () => {
    const { fetcher, calls } = fakeFetch({
      query: () => [invoicePage({ number: "AP-2026-0007", student: CHILD }), invoicePage({ id: "eeeeeeee-eeee-4eee-8eee-eeeeeeee0009", number: "AP-2026-0007", student: OTHER })],
    });
    const out = await fetchInvoiceSharers(config, ["AP-2026-0007", "AP-2026-0001"], CHILD, { fetcher });
    expect(out).toEqual({ "AP-2026-0007": [OTHER] });
    const q = calls.filter((c) => c.url.includes("/query"));
    expect(q).toHaveLength(1);
    expect(props(q[0].url)).toEqual(["sta", "stu", "title"]);
    expect(JSON.stringify(q[0].body)).toContain('"title":{"equals":"AP-2026-0007"}');
  });
  it("no numbers makes no request", async () => {
    const { fetcher, calls } = fakeFetch();
    expect(await fetchInvoiceSharers(config, [], CHILD, { fetcher })).toEqual({});
    expect(calls).toHaveLength(0);
  });
});

describe("fetchInvoicePdf (AC10)", () => {
  const run = async (page: unknown, status = 200) => {
    const { fetcher, calls } = fakeFetch({ page: () => ({ status, body: page }) });
    return { out: await fetchInvoicePdf(config, INV_ID, CHILD, { fetcher }), calls };
  };
  it("returns the number and the file URL for the child's Sent or Paid invoice", async () => {
    const { out, calls } = await run(invoicePage());
    expect(out).toEqual({ number: "AP-2026-0005", fileUrl: "https://prod-files-secure.s3.us-west-2.amazonaws.com/x.pdf" });
    expect(props(calls.find((c) => c.url.includes("/pages/"))!.url)).toEqual(["pdf", "sta", "stu", "title"]);
  });
  it("is null for another data source, another student, a Draft, an external file or a missing page", async () => {
    expect((await run({ ...invoicePage(), parent: { type: "data_source_id", data_source_id: CREDITS } })).out).toBeNull();
    expect((await run(invoicePage({ student: OTHER }))).out).toBeNull();
    expect((await run(invoicePage({ status: "Draft" }))).out).toBeNull();
    expect((await run(invoicePage({ files: [{ name: "x", type: "external", external: { url: "https://x.amazonaws.com/a.pdf" } }] }))).out).toBeNull();
    expect((await run(null, 404)).out).toBeNull();
  });
  it("is null for an ID that is not a GUID, with no request", async () => {
    const { fetcher, calls } = fakeFetch();
    expect(await fetchInvoicePdf(config, "../secrets", CHILD, { fetcher })).toBeNull();
    expect(calls).toHaveLength(0);
  });
});
