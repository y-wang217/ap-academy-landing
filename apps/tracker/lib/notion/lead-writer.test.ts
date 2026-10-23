import { describe, expect, it } from "vitest";
import { CONTRACT_FIELDS, type LeadPatch } from "../console/outcomes";
import { createLeadWriter, hasValue, LAST_TXN, leadPatchBody, NotionUncertain, TXN_ID, WRITABLE } from "./lead-writer";
import { NotionError } from "./staff";

// REQ-61 AC3, AC8, AC13: the console's Notion write path, over a recording fetch.
const cfg = { token: "secret_x", studentsId: "ds-students", touchesId: "ds-touches" };
const LEAD = "11111111-1111-4111-8111-111111111111";
const TOUCH = "22222222-2222-4222-8222-222222222222";
const STAFF = "33333333-3333-4333-8333-333333333333";
const REQ = "44444444-4444-4444-8444-444444444444";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const STUDENT_PROPS = [
  ...Object.values(WRITABLE).map((w) => w.name), "Trial Time", ...CONTRACT_FIELDS, "Invoices", "Hours Paid", "Notes", "Weekly Schedule",
];
const studentsSchema = (withTxn = true) => ({
  properties: Object.fromEntries([...STUDENT_PROPS, ...(withTxn ? [LAST_TXN] : [])].map((n, i) => [n, { id: `s${i}`, type: n === LAST_TXN ? "rich_text" : "x" }])),
});
const touchesSchema = (withTxn = true) => ({
  properties: Object.fromEntries(["Touch", "Type", "Outcome", "Student", "Staff", "Note", "When", ...(withTxn ? [TXN_ID] : [])].map((n, i) => [n, { id: `t${i}`, type: n === TXN_ID ? "rich_text" : "x" }])),
});
const leadPage = {
  object: "page", id: LEAD, last_edited_time: "2026-10-26T13:00:00.000Z",
  properties: {
    Stage: { select: { name: "Working" } },
    Attempts: { number: 2 },
    "Next Action": { select: { name: "Call" } },
    "Next Action Due": { date: { start: "2026-10-26T15:00:00.000-04:00" } },
    Owner: { relation: [{ id: STAFF }] },
    "Lost Reason": { select: null },
    "Trial Time": { date: null },
    [LAST_TXN]: { rich_text: [{ plain_text: REQ }] },
    "Parent Name": { rich_text: [{ plain_text: "Pat Parent" }] },
    "Student Name": { title: [{ plain_text: "Sam Student" }] },
    "Parent Phone": { phone_number: "555-0199" },
    "Sales Notes": { rich_text: [{ plain_text: "Secret sales note" }] },
    "Hourly Rate (CAD)": { number: 65 },
    "Last Payment Date": { date: { start: "2026-10-01" } },
    Subjects: { multi_select: [] },
    Grade: { select: null },
    "Target Program": { rich_text: [] },
    "Lesson Cadence": { select: { name: "Weekly" } },
  },
};

type Call = { url: string; method: string; body: Record<string, unknown> | undefined };
function recorder(handler: (c: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetcher = (async (url: string, init?: RequestInit) => {
    const c = { url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(c);
    return handler(c);
  }) as unknown as typeof fetch;
  return { calls, fetcher };
}
const notion = (over: (c: Call) => Response | undefined = () => undefined) => recorder((c) => {
  const r = over(c);
  if (r) return r;
  if (c.method === "GET" && c.url.endsWith("/data_sources/ds-students")) return json(studentsSchema());
  if (c.method === "GET" && c.url.endsWith("/data_sources/ds-touches")) return json(touchesSchema());
  if (c.method === "GET" && c.url.includes(`/pages/${LEAD}`)) return json(leadPage);
  if (c.method === "PATCH") return json({ id: LEAD });
  if (c.method === "POST" && c.url.endsWith("/pages")) return json({ id: TOUCH });
  if (c.method === "POST" && c.url.endsWith("/query")) return json({ results: [] });
  if (c.method === "GET" && c.url.includes(`/pages/${TOUCH}`)) return json({ id: TOUCH, properties: { Student: { relation: [{ id: LEAD }] }, [TXN_ID]: { rich_text: [{ plain_text: REQ }] } } });
  return json({}, 404);
});

const FULL: Required<LeadPatch> = {
  stage: "Trial Booked", owner: null, nextAction: "Deliver trial", nextActionDue: null, attempts: 3, lastContact: "2026-10-26", lostReason: "Not interested",
  contactedAt: "2026-10-26", trialBookedAt: "2026-10-26", closedAt: "2026-10-26",
};

describe("leadPatchBody (AC3)", () => {
  it("maps every plan key to exactly its Notion property, plus Last Txn", () => {
    const body = leadPatchBody(FULL, REQ);
    expect(Object.keys(body.properties).sort()).toEqual([
      "Attempts", "Closed At", "Contacted At", "Last Contact", "Last Txn", "Lost Reason", "Next Action", "Next Action Due", "Owner", "Stage", "Trial Booked At",
    ]);
    expect(body.properties).toMatchObject({
      Stage: { select: { name: "Trial Booked" } }, Owner: { relation: [] }, "Next Action Due": { date: null }, Attempts: { number: 3 },
      "Last Contact": { date: { start: "2026-10-26" } }, [LAST_TXN]: { rich_text: [{ type: "text", text: { content: REQ } }] },
    });
  });

  it("throws on any other key before a request is made", () => {
    for (const key of ["lastPaymentDate", "Last Payment Date", "invoices", "hoursPaid", "hourlyRate", "salesNotes", "toString", "__proto__"]) {
      expect(() => leadPatchBody({ [key]: "x" } as LeadPatch, REQ)).toThrow(NotionError);
    }
  });

  it("the writable map names no billing, parent, note or schedule property", () => {
    const names = Object.values(WRITABLE).map((w) => w.name);
    for (const banned of ["Last Payment Date", "Invoices", "Hours Paid", "Hours Paid (Lessons)", "Hourly Rate (CAD)", "Lesson Cadence", "Parent Name", "Parent Phone", "Parent Email", "Sales Notes", "Notes", "Weekly Schedule"]) {
      expect(names).not.toContain(banned);
    }
  });
});

describe("createLeadWriter", () => {
  it("checkReady names missing Txn ID and Last Txn, and is empty when both exist", async () => {
    expect(await createLeadWriter(cfg, notion().fetcher).checkReady()).toEqual([]);
    const missing = notion((c) =>
      c.url.endsWith("/data_sources/ds-students") ? json(studentsSchema(false)) : c.url.endsWith("/data_sources/ds-touches") ? json(touchesSchema(false)) : undefined);
    expect(await createLeadWriter(cfg, missing.fetcher).checkReady()).toEqual([TXN_ID, LAST_TXN]);
    expect(missing.calls.every((c) => c.method === "GET")).toBe(true);
  });

  it("readLead asks for exactly the read properties and returns contract fields as booleans only", async () => {
    const n = notion();
    const lead = await createLeadWriter(cfg, n.fetcher).readLead(LEAD);
    const get = n.calls.find((c) => c.url.includes(`/pages/${LEAD}`))!;
    expect(get.method).toBe("GET");
    const asked = [...get.url.matchAll(/filter_properties\[\]=([^&]+)/g)].map((m) => m[1]);
    const ids = studentsSchema().properties;
    const names = asked.map((id) => Object.entries(ids).find(([, v]) => v.id === id)![0]);
    expect(names).not.toContain("Invoices");
    expect(names).not.toContain("Notes");
    expect(names).not.toContain("Weekly Schedule");
    expect(lead).toMatchObject({
      id: LEAD, stage: "Working", attempts: 2, nextAction: "Call", owner: STAFF, lastTxn: REQ, lastEditedAt: "2026-10-26T13:00:00.000Z", trialTime: null,
    });
    expect(lead.present).toMatchObject({
      "Parent Name": true, "Student Name": true, "Parent Phone": true, "Sales Notes": true, "Hourly Rate (CAD)": true, "Last Payment Date": true,
      Subjects: false, Grade: false, "Target Program": false, "Trial Time": false, "Lesson Cadence": true,
    });
    const out = JSON.stringify(lead);
    for (const secret of ["555-0199", "Secret sales note", "Pat Parent", "65", "2026-10-01"]) expect(out).not.toContain(secret);
  });

  it("patchLead sends one PATCH with the mapped body; an unknown key sends nothing", async () => {
    const n = notion();
    const w = createLeadWriter(cfg, n.fetcher);
    await w.patchLead(LEAD, { attempts: 3 }, REQ);
    expect(n.calls).toEqual([{ url: expect.stringContaining(`/pages/${LEAD}`), method: "PATCH", body: leadPatchBody({ attempts: 3 }, REQ) }]);
    await expect(w.patchLead(LEAD, { invoices: 1 } as LeadPatch, REQ)).rejects.toThrow(NotionError);
    expect(n.calls).toHaveLength(1);
  });

  it("createTouch sends exactly the seven keys, dropping Staff and Note when empty", async () => {
    const n = notion();
    const w = createLeadWriter(cfg, n.fetcher);
    expect(await w.createTouch({ studentId: LEAD, staffId: STAFF, type: "Call", outcome: "No answer", title: "Call · Oct 26 10:00", note: "Left a message", requestId: REQ })).toEqual({ id: TOUCH });
    const body = n.calls[0].body as { parent: unknown; properties: Record<string, unknown> };
    expect(body.parent).toEqual({ type: "data_source_id", data_source_id: "ds-touches" });
    expect(Object.keys(body.properties).sort()).toEqual(["Note", "Outcome", "Staff", "Student", "Touch", "Txn ID", "Type"]);
    expect(body.properties[TXN_ID]).toEqual({ rich_text: [{ type: "text", text: { content: REQ } }] });
    await w.createTouch({ studentId: LEAD, staffId: null, type: "Call", outcome: "No answer", title: "t", note: "  ", requestId: REQ });
    expect(Object.keys((n.calls[1].body as { properties: object }).properties).sort()).toEqual(["Outcome", "Student", "Touch", "Txn ID", "Type"]);
  });

  it("findTouches queries Touches by Txn ID", async () => {
    const n = notion((c) => (c.url.endsWith("/query") ? json({ results: [{ id: TOUCH, properties: { Student: { relation: [{ id: LEAD }] }, [TXN_ID]: { rich_text: [{ plain_text: REQ }] } } }] }) : undefined));
    expect(await createLeadWriter(cfg, n.fetcher).findTouches(REQ)).toEqual([{ id: TOUCH, studentIds: [LEAD], txnId: REQ }]);
    expect(n.calls[0]).toEqual({
      url: expect.stringMatching(/\/data_sources\/ds-touches\/query$/), method: "POST",
      body: { filter: { property: TXN_ID, rich_text: { equals: REQ } }, page_size: 5 },
    });
  });

  it("getTouch reads one touch back, null when it is gone", async () => {
    expect(await createLeadWriter(cfg, notion().fetcher).getTouch(TOUCH)).toEqual({ id: TOUCH, studentIds: [LEAD], txnId: REQ });
    expect(await createLeadWriter(cfg, notion((c) => (c.url.includes(TOUCH) ? json({}, 404) : undefined)).fetcher).getTouch(TOUCH)).toBeNull();
  });

  it("classifies errors: a 400 did not land; timeout, network, 409, 429 and 5xx may have", async () => {
    const failing = (r: () => Response | Promise<Response>) => createLeadWriter(cfg, recorder(r).fetcher);
    await expect(failing(() => json({}, 400)).patchLead(LEAD, { attempts: 1 }, REQ)).rejects.toBeInstanceOf(NotionError);
    await expect(failing(() => json({}, 404)).patchLead(LEAD, { attempts: 1 }, REQ)).rejects.toBeInstanceOf(NotionError);
    for (const status of [409, 429, 500, 502, 503]) {
      await expect(failing(() => json({}, status)).patchLead(LEAD, { attempts: 1 }, REQ)).rejects.toBeInstanceOf(NotionUncertain);
    }
    await expect(failing(() => { throw new TypeError("fetch failed"); }).createTouch({ studentId: LEAD, staffId: null, type: "Call", outcome: "x", title: "t", note: "", requestId: REQ }))
      .rejects.toBeInstanceOf(NotionUncertain);
    await expect(failing(() => { throw new DOMException("timed out", "TimeoutError"); }).patchLead(LEAD, { attempts: 1 }, REQ)).rejects.toBeInstanceOf(NotionUncertain);
  });
});

describe("hasValue", () => {
  it("is true only for a filled value of any type", () => {
    expect([
      { title: [{ plain_text: " " }] }, { rich_text: [] }, { select: null }, { multi_select: [] }, { date: null }, { number: null }, { phone_number: "" }, { relation: [] }, null, undefined,
    ].map(hasValue)).toEqual(Array(10).fill(false));
    expect([
      { title: [{ plain_text: "x" }] }, { rich_text: [{ plain_text: "x" }] }, { select: { name: "x" } }, { multi_select: [{ name: "x" }] }, { date: { start: "2026-10-01" } },
      { number: 0 }, { phone_number: "5" }, { relation: [{ id: "x" }] }, { email: "a@b.c" },
    ].map(hasValue)).toEqual(Array(9).fill(true));
  });
});
