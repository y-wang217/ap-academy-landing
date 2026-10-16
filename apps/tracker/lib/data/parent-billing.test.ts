import { describe, expect, it } from "vitest";
import type { BillingReader } from "../notion/billing";
import type { Db } from "./client";
import { fileHostAllowed, invoicePdfResponse, loadChildBilling, readNotionId, type PdfDeps } from "./parent-billing";

const NOTION = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0001";
const CHILD = { id: "11111111-1111-4111-8111-111111111111", firstName: "Ada", lastInitial: "P" };
const INV = "eeeeeeee-eeee-4eee-8eee-eeeeeeee0001";

function fakeDb(result: { data: unknown; error: unknown }): { db: Db; asked: string[] } {
  const asked: string[] = [];
  const chain = {
    select: (cols: string) => { asked.push(cols); return chain; },
    eq: (col: string, val: string) => { asked.push(`${col}=${val}`); return chain; },
    maybeSingle: async () => result,
  };
  return { db: { tracker: { from: (t: string) => { asked.push(t); return chain; } } } as unknown as Db, asked };
}
const ROW = { notion_student_id: NOTION, grade_level: 11 };

function reader(over: Partial<BillingReader> = {}): { reader: BillingReader; calls: string[] } {
  const calls: string[] = [];
  const log = <T,>(name: string, v: () => Promise<T>) => async () => { calls.push(name); return v(); };
  const base: BillingReader = {
    childBilling: log("child", async () => ({ rate: 60, cadence: "2x/week", family: "Afzal" })),
    invoices: log("invoices", async () => [{
      id: INV, number: "AP-2026-0005", month: "2026-10", amount: 420, creditApplied: 0, creditIds: [], issued: "2026-10-13",
      due: "2026-10-20", status: "Sent" as const, hasPdf: true, studentIds: [NOTION],
    }]),
    credits: log("credits", async () => []),
    sharers: log("sharers", async () => ({ "AP-2026-0005": ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0004"] })),
    siblings: log("siblings", async () => ({ "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0004": { firstName: "Haider", family: "Afzal" } })),
    invoicePdf: log("pdf", async () => null),
  };
  const merged = { ...base } as BillingReader;
  for (const [k, fn] of Object.entries(over)) (merged as Record<string, unknown>)[k] = async (...a: unknown[]) => { calls.push(k); return (fn as (...x: unknown[]) => unknown)(...a); };
  return { reader: merged, calls };
}

describe("loadChildBilling (AC7, AC13)", () => {
  it("a null notion_student_id is not available, with zero Notion calls", async () => {
    const { db } = fakeDb({ data: { ...ROW, notion_student_id: null }, error: null });
    const r = reader();
    expect(await loadChildBilling({ db }, CHILD, { reader: r.reader }, "2026-10-16")).toEqual({ kind: "not_available" });
    expect(r.calls).toEqual([]);
  });
  it("no Notion config is not available, and the students row is not even needed", async () => {
    const { db } = fakeDb({ data: ROW, error: null });
    expect(await loadChildBilling({ db }, CHILD, { reader: null }, "2026-10-16")).toEqual({ kind: "not_available" });
  });
  it("reads only notion_student_id and grade_level for the child", async () => {
    const { db, asked } = fakeDb({ data: ROW, error: null });
    await loadChildBilling({ db }, CHILD, { reader: reader().reader }, "2026-10-16");
    expect(asked).toEqual(["students", "notion_student_id, grade_level", `id=${CHILD.id}`]);
  });
  for (const core of ["invoices", "credits", "childBilling"] as const) {
    it(`a ${core} throw is an error, never an empty state`, async () => {
      const { db } = fakeDb({ data: ROW, error: null });
      const r = reader({ [core]: async () => { throw new Error("down"); } });
      expect(await loadChildBilling({ db }, CHILD, { reader: r.reader }, "2026-10-16")).toEqual({ kind: "error" });
    });
  }
  it("a failed students read is an error", async () => {
    const { db } = fakeDb({ data: null, error: { message: "denied" } });
    expect(await loadChildBilling({ db }, CHILD, { reader: reader().reader }, "2026-10-16")).toEqual({ kind: "error" });
  });
  it("ready carries the shared line from the sibling lookup", async () => {
    const { db } = fakeDb({ data: ROW, error: null });
    const r = reader();
    const out = await loadChildBilling({ db }, CHILD, { reader: r.reader }, "2026-10-16");
    expect(out.kind).toBe("ready");
    if (out.kind === "ready") expect(out.view.card?.shared).toBe("Shared invoice with Haider");
    expect(r.calls.slice(0, 3).sort()).toEqual(["child", "credits", "invoices"]);
  });
  for (const soft of ["sharers", "siblings"] as const) {
    it(`a ${soft} throw still renders, without the shared line`, async () => {
      const { db } = fakeDb({ data: ROW, error: null });
      const r = reader({ [soft]: async () => { throw new Error("429"); } });
      const out = await loadChildBilling({ db }, CHILD, { reader: r.reader }, "2026-10-16");
      expect(out.kind).toBe("ready");
      if (out.kind === "ready") {
        expect(out.view.card?.amount).toBe("$420");
        expect(out.view.card?.shared).toBeNull();
      }
    });
  }
});

describe("readNotionId", () => {
  it("returns the child's link or null", async () => {
    expect(await readNotionId(fakeDb({ data: ROW, error: null }).db, CHILD.id)).toBe(NOTION);
    expect(await readNotionId(fakeDb({ data: { notion_student_id: null }, error: null }).db, CHILD.id)).toBeNull();
    expect(await readNotionId(fakeDb({ data: null, error: { message: "x" } }).db, CHILD.id)).toBeNull();
  });
});

describe("fileHostAllowed (Decision 6)", () => {
  it("allows Notion's file hosts over https and the mock origin only when set", () => {
    expect(fileHostAllowed("https://prod-files-secure.s3.us-west-2.amazonaws.com/a.pdf", null)).toBe(true);
    expect(fileHostAllowed("https://file.notion.so/f/a.pdf", null)).toBe(true);
    expect(fileHostAllowed("https://s3.notion-static.com/a.pdf", null)).toBe(true);
    expect(fileHostAllowed("http://prod-files-secure.s3.us-west-2.amazonaws.com/a.pdf", null)).toBe(false);
    expect(fileHostAllowed("https://evil.example/a.pdf", null)).toBe(false);
    expect(fileHostAllowed("https://amazonaws.com.evil.example/a.pdf", null)).toBe(false);
    expect(fileHostAllowed("http://127.0.0.1:54333/files/a.pdf", null)).toBe(false);
    expect(fileHostAllowed("http://127.0.0.1:54333/files/a.pdf", "http://127.0.0.1:54333")).toBe(true);
    expect(fileHostAllowed("not a url", null)).toBe(false);
  });
});

describe("invoicePdfResponse (AC9, AC10)", () => {
  const FILE = "https://prod-files-secure.s3.us-west-2.amazonaws.com/x.pdf";
  const PDF = new TextEncoder().encode("%PDF-1.4 test");
  const okDeps = (over: Partial<PdfDeps> = {}): PdfDeps => ({
    getViewer: async () => ({ kind: "parent", db: {} as Db }),
    listChildren: async () => [{ id: CHILD.id, published: true }],
    readNotionId: async () => NOTION,
    fetchInvoicePdf: async () => ({ number: "AP-2026-0005", fileUrl: FILE }),
    fetcher: (async () => new Response(PDF, { status: 200 })) as unknown as typeof fetch,
    apiBase: null,
    ...over,
  });
  const params = { studentId: CHILD.id, invoiceId: INV };
  const is404 = async (res: Response) => res.status === 404 && (await res.text()) === "";

  it("200 with the exact headers and the bytes", async () => {
    let asked: RequestInit | undefined;
    const res = await invoicePdfResponse(params, okDeps({ fetcher: (async (_u: string, init: RequestInit) => { asked = init; return new Response(PDF); }) as unknown as typeof fetch }));
    expect(res.status).toBe(200);
    expect(Object.fromEntries(res.headers)).toMatchObject({
      "content-type": "application/pdf",
      "content-disposition": 'inline; filename="AP-2026-0005.pdf"',
      "cache-control": "private, no-store, max-age=0",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    });
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PDF);
    expect(asked?.redirect).toBe("error");
  });
  it("sanitises the filename", async () => {
    const res = await invoicePdfResponse(params, okDeps({ fetchInvoicePdf: async () => ({ number: 'AP"/../2026-0005 ', fileUrl: FILE }) }));
    expect(res.headers.get("content-disposition")).toBe('inline; filename="AP2026-0005.pdf"');
  });
  it("404 for a non-parent, non-GUID IDs, an unlinked or unpublished child and a null link", async () => {
    expect(await is404(await invoicePdfResponse(params, okDeps({ getViewer: async () => ({ kind: "staff" }) })))).toBe(true);
    expect(await is404(await invoicePdfResponse({ ...params, invoiceId: "x" }, okDeps()))).toBe(true);
    expect(await is404(await invoicePdfResponse({ ...params, studentId: "x" }, okDeps()))).toBe(true);
    expect(await is404(await invoicePdfResponse(params, okDeps({ listChildren: async () => [] })))).toBe(true);
    expect(await is404(await invoicePdfResponse(params, okDeps({ listChildren: async () => [{ id: CHILD.id, published: false }] })))).toBe(true);
    expect(await is404(await invoicePdfResponse(params, okDeps({ readNotionId: async () => null })))).toBe(true);
  });
  it("404 when the invoice is not the child's (null from Notion) or the host is not allowed", async () => {
    expect(await is404(await invoicePdfResponse(params, okDeps({ fetchInvoicePdf: async () => null })))).toBe(true);
    expect(await is404(await invoicePdfResponse(params, okDeps({ fetchInvoicePdf: async () => ({ number: "A", fileUrl: "https://evil.example/x.pdf" }) })))).toBe(true);
  });
  it("502 for a redirecting, failing, non-2xx or 11 MB file", async () => {
    const big = new Uint8Array(11 * 1024 * 1024);
    const cases: (typeof fetch)[] = [
      (async () => { throw new TypeError("redirect"); }) as unknown as typeof fetch,
      (async () => new Response("no", { status: 403 })) as unknown as typeof fetch,
      (async () => new Response(big)) as unknown as typeof fetch,
      (async () => new Response(PDF, { headers: { "content-length": String(11 * 1024 * 1024) } })) as unknown as typeof fetch,
    ];
    for (const fetcher of cases) expect((await invoicePdfResponse(params, okDeps({ fetcher }))).status).toBe(502);
  });
  it("502 when Notion itself fails", async () => {
    expect((await invoicePdfResponse(params, okDeps({ fetchInvoicePdf: async () => { throw new Error("500"); } }))).status).toBe(502);
  });
});
