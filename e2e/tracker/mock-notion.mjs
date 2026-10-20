// Mock of the Notion calls the scheduler makes in the tracker e2e: the Staff
// data source query, and (REQ-6) the Students schema plus a names-only query.
// Two active teachers and three students. REQ-7: one student page can be read and its Weekly Schedule
// written (the scheduler adopts a student and regenerates that one property). REQ-8 adds in-memory Work and
// Work Log pages with blocks: create a page, list and edit its blocks, and GET /__work to see what was written.
// REQ-25 adds Invoices, Missed Sessions & Credits, billing pages, /files/*.pdf and POST /__billing/fail (toggles a 500 on invoices).
// REQ-28 adds POST /__schedule/fail: toggles a 500 on student-page PATCHes (the Weekly Schedule write).
// REQ-38 adds the Staff schema (the people sync asks for property IDs), a Stage on every student, and
// POST /__people/fail (toggles a 500 on the Staff and Students reads), /__people/rename (Ryan becomes
// "Ryan Renamed") and /__people/inactive (toggles Ryan's Status between Active and Inactive).
// REQ-33: a Students query whose filter holds a Weekly Schedule is_not_empty clause gets only students with schedule text.
import http from "node:http";
import { randomUUID } from "node:crypto";

const page = (id, name, email) => ({
  id,
  properties: {
    Name: { title: [{ plain_text: name }] },
    Email: { email },
    Status: { select: { name: "Active" } },
    Function: { multi_select: [{ name: "Teacher" }] },
    Subjects: { multi_select: [{ name: "MHF4U" }] },
  },
});
const STAFF = [
  page("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001", "Ryan Test", "ryan@example.com"),
  page("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0002", "Kuby Test", "kuby@example.com"),
];

const STUDENTS_DS = "fe3d651a-70c6-4d1e-8a38-656163d6bc63";
const student = (id, name) => ({ id, properties: { "Student Name": { title: [{ plain_text: name }] }, Stage: { select: { name: "Active" } } } });
const STUDENTS = [
  student("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0001", "Sam Student"),
  student("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0002", "Kim Kuby-Student"),
  student("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0003", "Nobody Booked"),
];

// Weekly Schedule text per student, empty to start (so a first booking can adopt the student).
const schedule = new Map(STUDENTS.map((s) => [s.id, ""]));
let scheduleFails = false;
let peopleFails = false;
const RYAN_PAGE = STAFF[0];
const STAFF_SCHEMA = { properties: { Name: { id: "title" }, Email: { id: "em" }, Status: { id: "st" }, Function: { id: "fn" }, Subjects: { id: "sb" } } };
const studentPage = (id) => {
  const base = STUDENTS.find((s) => s.id === id);
  return {
    id,
    properties: {
      ...base.properties,
      Stage: { select: { name: "Active" } },
      "Weekly Schedule": { rich_text: schedule.get(id) ? [{ plain_text: schedule.get(id) }] : [] },
    },
  };
};

// REQ-8: Work and Work Log, in memory. Blocks are kept flat with a parent ID so children listing is a filter.
const WORK_DS = "3031b455-9be0-4f8d-b200-70fcfcf1a0b8";
const LOG_DS = "03257601-dfe2-42dd-affb-49dcfe1d2dcf";
const workPages = new Map(); // id -> { id, url, ds, props }
const blocks = new Map(); // id -> { id, parent, type, ...content, edited }
let clock = Date.now();
const stamp = () => new Date(++clock).toISOString();
const textOf = (rich = []) => rich.map((r) => r.text?.content ?? "").join("");
function addBlock(parent, b) {
  const id = randomUUID();
  const type = b.type;
  const block = { id, parent, type, content: b[type] ?? {}, edited: stamp() };
  blocks.set(id, block);
  for (const child of b[type]?.children ?? []) addBlock(id, child);
  return block;
}
const blockJson = (b) => ({
  id: b.id, type: b.type, last_edited_time: b.edited,
  [b.type]: { ...b.content, children: undefined, ...(b.type === "to_do" ? { checked: !!b.content.checked } : {}) },
});
const childrenOf = (parent) => [...blocks.values()].filter((b) => b.parent === parent);
const dump = () => ({
  pages: [...workPages.values()].map((p) => ({
    id: p.id, ds: p.ds, props: p.props,
    todos: childrenOf(p.id).filter((b) => b.type === "to_do").map((b) => ({
      id: b.id, text: textOf(b.content.rich_text), checked: !!b.content.checked,
      children: childrenOf(b.id).map((c) => textOf(c.content.rich_text)),
    })),
  })),
});
// The body is buffered once, up front, so the journal and the handlers can both read it.
const readBody = async (req) => (req.rawBody ? JSON.parse(req.rawBody) : {});
const bufferBody = (req) =>
  new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => { req.rawBody = raw; resolve(); });
  });

// REQ-9: every request the tracker makes, in order, and one Lessons page that must never be requested or changed.
const journal = [];
const LESSONS_DS = "6300f58a-8b8c-4789-88c1-e44272079b0f";
const LESSON_ID = "cccccccc-cccc-4ccc-8ccc-cccccccc0001";
const LESSON = {
  id: LESSON_ID,
  properties: {
    Lesson: { title: [{ plain_text: "Seeded lesson" }] },
    "Paid to Teacher": { checkbox: true },
    "Pay Period": { select: { name: "2026-10" } },
    "Duration (hrs)": { number: 1 },
  },
};


// REQ-25: the parent Billing tab. Invoices and Missed Sessions & Credits, plus billing properties on the Students &
// Parents pages REQ-24 links (Ada dddd…0001, Cy dddd…0002) and Ada's sibling Haider (bbbb…0004, Billing Family Afzal).
// Months are computed from today's Toronto date. Canary values prove the tracker drops unrequested properties.
const INVOICES_DS = "be0f91e4-f054-4055-9ca6-c4e1a22c4f27";
const CREDITS_DS = "38cdcded-9bef-4e68-bceb-a56920f098bd";
const ORIGIN = "http://127.0.0.1:54333";
const ADA = "dddddddd-dddd-4ddd-8ddd-dddddddd0001";
const CY = "dddddddd-dddd-4ddd-8ddd-dddddddd0002";
const HAIDER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0004";
const torontoDay = (offset = 0) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(new Date(Date.now() + offset * 86400000));
const thisYm = torontoDay().slice(0, 7);
const prevYm = (() => { const [y, m] = thisYm.split("-").map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`; })();
const monYear = (ym) => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", year: "numeric" });
const rt = (s) => ({ rich_text: s ? [{ plain_text: s }] : [] });
const billingStudent = (id, name, rate, cadence, family) => ({
  id,
  properties: {
    "Student Name": { title: [{ plain_text: name }] },
    "Hourly Rate (CAD)": { number: rate },
    "Lesson Cadence": { select: cadence ? { name: cadence } : null },
    "Billing Family": rt(family),
    "Parent Phone": { phone_number: "555-0199" },
    Notes: rt("CANARY-NOTE"),
  },
});
const BILLING_STUDENTS = new Map([
  [ADA, billingStudent(ADA, "Ada Afzal", 60, "2x/week", "Afzal")],
  [CY, billingStudent(CY, "Cy Other", 70, "1x/week", "Other")],
  [HAIDER, billingStudent(HAIDER, "Haider Afzal", 60, "1x/week", " afzal ")],
]);
const file = (name) => ({ name, type: "file", file: { url: `${ORIGIN}/files/${name}`, expiry_time: "2099-01-01T00:00:00Z" } });
const invoice = (id, number, month, amount, status, student, extra = {}) => ({
  id,
  parent: { type: "data_source_id", data_source_id: INVOICES_DS },
  properties: {
    Invoice: { title: [{ plain_text: number }] },
    Month: rt(month),
    "Amount (CAD)": { number: amount },
    "Credit Applied (CAD)": { number: extra.creditApplied ?? 0 },
    Credits: { relation: (extra.credits ?? []).map((c) => ({ id: c })) },
    Issued: { date: { start: `${month}-01` } },
    Due: { date: { start: extra.due ?? `${month}-08` } },
    Status: { select: { name: status } },
    PDF: { files: extra.pdf ? [file(extra.pdf)] : [] },
    Student: { relation: [{ id: student }] },
    Notes: rt("CANARY-NOTE"),
  },
});
const CREDIT_APPLIED = "ffffffff-ffff-4fff-8fff-ffffffff0001";
const INVOICES = [
  invoice("eeeeeeee-eeee-4eee-8eee-eeeeeeee0001", "AP-E2E-0007", thisYm, 420, "Sent", ADA, { creditApplied: 60, credits: [CREDIT_APPLIED], due: torontoDay(-1), pdf: "ada-current.pdf" }),
  invoice("eeeeeeee-eeee-4eee-8eee-eeeeeeee0002", "AP-E2E-0007", thisYm, 315, "Sent", HAIDER),
  invoice("eeeeeeee-eeee-4eee-8eee-eeeeeeee0003", "AP-E2E-0003", prevYm, 480, "Paid", ADA, { pdf: "ada-past.pdf" }),
  invoice("eeeeeeee-eeee-4eee-8eee-eeeeeeee0004", "AP-E2E-0009", thisYm, 999, "Draft", ADA, { pdf: "ada-draft.pdf" }),
  invoice("eeeeeeee-eeee-4eee-8eee-eeeeeeee0005", "AP-E2E-0008", prevYm, 888, "Void", ADA),
  invoice("eeeeeeee-eeee-4eee-8eee-eeeeeeee0006", "AP-E2E-0011", thisYm, 777, "Sent", CY, { pdf: "cy.pdf" }),
];
const credit = (id, date, course, status, appliedTo, student) => ({
  id,
  properties: {
    Session: { title: [{ plain_text: `${course} ${date}` }] },
    Date: { date: { start: date } },
    Course: rt(course),
    Hours: { number: 1 },
    "Rate (CAD)": { number: 60 },
    "Credit Status": { select: { name: status } },
    "Applied To": rt(appliedTo),
    Student: { relation: [{ id: student }] },
    Notes: rt("CANARY-NOTE"),
  },
});
const CREDITS = [
  credit(CREDIT_APPLIED, `${prevYm}-03`, "MHF4U", "Applied", `AP-E2E-0007, ${monYear(thisYm)}`, ADA),
  credit("ffffffff-ffff-4fff-8fff-ffffffff0002", `${thisYm}-02`, "MCV4U", "Open", "", ADA),
  credit("ffffffff-ffff-4fff-8fff-ffffffff0003", `${thisYm}-02`, "ZZZ9Z", "Open", "", CY),
];
let billingFails = false;
const titleOf = (p) => (p.title ?? []).map((t) => t.plain_text).join("");
function matches(row, f) {
  if (!f) return true;
  if (f.and) return f.and.every((g) => matches(row, g));
  if (f.or) return f.or.some((g) => matches(row, g));
  const prop = row.properties[f.property];
  if (!prop) return false;
  if (f.relation) return (prop.relation ?? []).some((r) => r.id === f.relation.contains);
  if (f.select) return "does_not_equal" in f.select ? prop.select?.name !== f.select.does_not_equal : prop.select?.name === f.select.equals;
  if (f.title) return titleOf(prop) === f.title.equals;
  return false;
}
const schema = (names) => ({ properties: Object.fromEntries(names.map((n, i) => [n, { id: `p${i}` }])) });
const INVOICE_SCHEMA = schema(["Invoice", "Month", "Amount (CAD)", "Credit Applied (CAD)", "Credits", "Issued", "Due", "Status", "PDF", "Student", "Hours", "Rate (CAD)", "Paid On", "Notes"]);
const CREDIT_SCHEMA = schema(["Session", "Date", "Course", "Hours", "Rate (CAD)", "Credit Status", "Applied To", "Student", "Notes", "Billed Month", "Invoice"]);

async function billingApi(req, res) {
  const url = req.url ?? "";
  const path = url.split("?")[0];
  if (req.method === "GET" && path.startsWith("/files/")) {
    res.setHeader("Content-Type", "application/pdf");
    return res.end(`%PDF-1.4 ${path.slice(7)}`), true;
  }
  if (req.method === "GET" && path === `/v1/data_sources/${INVOICES_DS}`) return res.end(JSON.stringify(INVOICE_SCHEMA)), true;
  if (req.method === "GET" && path === `/v1/data_sources/${CREDITS_DS}`) return res.end(JSON.stringify(CREDIT_SCHEMA)), true;
  for (const [ds, rows] of [[INVOICES_DS, INVOICES], [CREDITS_DS, CREDITS]]) {
    if (req.method === "POST" && path === `/v1/data_sources/${ds}/query`) {
      if (billingFails && ds === INVOICES_DS) { res.statusCode = 500; return res.end(JSON.stringify({ object: "error", status: 500 })), true; }
      const body = await readBody(req);
      return res.end(JSON.stringify({ results: rows.filter((r) => matches(r, body.filter)), has_more: false, next_cursor: null })), true;
    }
  }
  const pageId = /^\/v1\/pages\/([0-9a-f-]{36})$/.exec(path)?.[1];
  if (pageId && req.method === "GET") {
    const page = BILLING_STUDENTS.get(pageId) ?? INVOICES.find((i) => i.id === pageId);
    if (page) return res.end(JSON.stringify(page)), true;
  }
  return false;
}

async function workApi(req, res) {
  const url = req.url ?? "";
  if (req.method === "GET" && url === "/__work") return res.end(JSON.stringify(dump())), true;
  if (req.method === "POST" && url.startsWith("/__work/tick")) {
    const name = new URL(url, "http://x").searchParams.get("name") ?? "";
    for (const b of blocks.values()) if (b.type === "to_do" && textOf(b.content.rich_text).includes(name)) { b.content.checked = !b.content.checked; b.edited = stamp(); }
    return res.end("{}"), true;
  }
  if (req.method === "POST" && url === "/v1/pages") {
    const body = await readBody(req);
    const ds = body.parent?.data_source_id;
    if (ds !== WORK_DS && ds !== LOG_DS) return false;
    const id = randomUUID();
    workPages.set(id, { id, ds, props: body.properties, url: `https://notion.example/${id}` });
    for (const child of body.children ?? []) addBlock(id, child);
    return res.end(JSON.stringify({ id, url: workPages.get(id).url })), true;
  }
  const pageId = /^\/v1\/pages\/([0-9a-f-]{36})$/.exec(url)?.[1];
  if (pageId && workPages.has(pageId) && req.method === "PATCH") {
    const body = await readBody(req);
    Object.assign(workPages.get(pageId).props, body.properties ?? {});
    return res.end("{}"), true;
  }
  if (req.method === "POST" && url === `/v1/data_sources/${WORK_DS}/query`) {
    const body = await readBody(req);
    const title = body.filter?.title?.equals;
    const hits = [...workPages.values()].filter((p) => p.ds === WORK_DS && textOf(p.props.Name?.title) === title);
    return res.end(JSON.stringify({ results: hits.map((p) => ({ id: p.id, url: p.url })), has_more: false, next_cursor: null })), true;
  }
  const m = /^\/v1\/blocks\/([0-9a-f-]{36})(\/children)?(\?.*)?$/.exec(url);
  if (!m) return false;
  const [, id, kids] = m;
  if (kids && req.method === "GET") return res.end(JSON.stringify({ results: childrenOf(id).map(blockJson), has_more: false, next_cursor: null })), true;
  if (kids && req.method === "PATCH") {
    const body = await readBody(req);
    const added = (body.children ?? []).map((c) => addBlock(id, c));
    const parent = blocks.get(id);
    if (parent) parent.edited = stamp();
    return res.end(JSON.stringify({ results: added.map(blockJson) })), true;
  }
  const block = blocks.get(id);
  if (!block) return false;
  if (req.method === "GET") return res.end(JSON.stringify(blockJson(block))), true;
  if (req.method === "DELETE") { blocks.delete(id); return res.end("{}"), true; }
  if (req.method === "PATCH") {
    const body = await readBody(req);
    // Only the text changes; a `checked` in the body would be a bug in the caller, so it is ignored loudly.
    if (body[block.type]?.checked !== undefined) console.error("unexpected checked in block update");
    if (body[block.type]?.rich_text) block.content.rich_text = body[block.type].rich_text;
    block.edited = stamp();
    return res.end(JSON.stringify(blockJson(block))), true;
  }
  return false;
}

http.createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.method === "GET" && req.url === "/__journal") return res.end(JSON.stringify(journal));
  if (req.method === "POST" && req.url === "/__billing/fail") { billingFails = !billingFails; return res.end(JSON.stringify({ billingFails })); }
  if (req.method === "POST" && req.url === "/__schedule/fail") { scheduleFails = !scheduleFails; return res.end(JSON.stringify({ scheduleFails })); }
  if (req.method === "POST" && req.url === "/__people/fail") { peopleFails = !peopleFails; return res.end(JSON.stringify({ peopleFails })); }
  if (req.method === "POST" && req.url === "/__people/rename") { RYAN_PAGE.properties.Name = { title: [{ plain_text: "Ryan Renamed" }] }; return res.end("{}"); }
  if (req.method === "POST" && req.url === "/__people/inactive") {
    const now = RYAN_PAGE.properties.Status.select.name === "Active" ? "Inactive" : "Active";
    RYAN_PAGE.properties.Status = { select: { name: now } };
    return res.end(JSON.stringify({ status: now }));
  }
  await bufferBody(req);
  if (!req.headers["x-e2e-probe"]) journal.push({ method: req.method, path: req.url, body: req.rawBody ? JSON.parse(req.rawBody) : null });
  // Read-only: the seeded lesson answers a GET and nothing else.
  if (req.method === "GET" && req.url === `/v1/pages/${LESSON_ID}`) return res.end(JSON.stringify(LESSON));
  if ((req.url ?? "").includes(LESSON_ID) || (req.url ?? "").includes(LESSONS_DS)) { res.statusCode = 405; return res.end(JSON.stringify({ object: "error", status: 405 })); }
  if (await workApi(req, res)) return;
  if (await billingApi(req, res)) return;
  const pageId = /^\/v1\/pages\/([0-9a-f-]{36})(\?.*)?$/.exec(req.url ?? "")?.[1];
  if (pageId && schedule.has(pageId)) {
    if (req.method === "GET") {
      res.end(JSON.stringify(studentPage(pageId)));
      return;
    }
    if (req.method === "PATCH" && scheduleFails) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ object: "error", status: 500 }));
    }
    if (req.method === "PATCH") {
      const text = (await readBody(req)).properties?.["Weekly Schedule"]?.rich_text?.[0]?.text?.content ?? "";
      schedule.set(pageId, text);
      res.end(JSON.stringify(studentPage(pageId)));
      return;
    }
  }
  const peopleRead = /^\/v1\/data_sources\/[^/?]+(\/query)?(\?.*)?$/.test(req.url ?? "") && !(req.url ?? "").includes(WORK_DS);
  if (peopleFails && peopleRead) {
    res.statusCode = 500;
    return res.end(JSON.stringify({ object: "error", status: 500 }));
  }
  if (req.method === "GET" && req.url === `/v1/data_sources/${STUDENTS_DS}`) {
    res.end(JSON.stringify({ properties: {
      "Student Name": { id: "title" }, Stage: { id: "stage" }, "Weekly Schedule": { id: "wk" },
      "Hourly Rate (CAD)": { id: "hr" }, "Lesson Cadence": { id: "lc" }, "Billing Family": { id: "bf" }, "Parent Phone": { id: "pp" }, Notes: { id: "nts" },
    } }));
    return;
  }
  if (req.method === "POST" && (req.url ?? "").startsWith(`/v1/data_sources/${STUDENTS_DS}/query`)) {
    const wantsScheduled = JSON.stringify((await readBody(req)).filter ?? {}).includes('{"property":"Weekly Schedule","rich_text":{"is_not_empty":true}}');
    const results = wantsScheduled ? STUDENTS.filter((s) => schedule.get(s.id)) : STUDENTS;
    res.end(JSON.stringify({ results, has_more: false, next_cursor: null }));
    return;
  }
  if (req.method === "POST" && /^\/v1\/data_sources\/[^/]+\/query(\?.*)?$/.test(req.url ?? "")) {
    res.end(JSON.stringify({ results: STAFF, has_more: false, next_cursor: null }));
    return;
  }
  if (req.method === "GET" && /^\/v1\/data_sources\/[^/?]+$/.test(req.url ?? "")) {
    res.end(JSON.stringify(STAFF_SCHEMA));
    return;
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ object: "error", status: 404 }));
}).listen(54333, "127.0.0.1");
