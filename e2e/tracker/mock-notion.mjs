// Mock of the Notion calls the scheduler makes in the tracker e2e: the Staff
// data source query, and (REQ-6) the Students schema plus a names-only query.
// Two active teachers and three students. REQ-7: one student page can be read and its Weekly Schedule
// written (the scheduler adopts a student and regenerates that one property). REQ-8 adds in-memory Work and
// Work Log pages with blocks: create a page, list and edit its blocks, and GET /__work to see what was written.
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
const student = (id, name) => ({ id, properties: { "Student Name": { title: [{ plain_text: name }] } } });
const STUDENTS = [
  student("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0001", "Sam Student"),
  student("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0002", "Kim Kuby-Student"),
  student("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0003", "Nobody Booked"),
];

// Weekly Schedule text per student, empty to start (so a first booking can adopt the student).
const schedule = new Map(STUDENTS.map((s) => [s.id, ""]));
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
function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => resolve(raw ? JSON.parse(raw) : {}));
  });
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
  if (await workApi(req, res)) return;
  const pageId = /^\/v1\/pages\/([0-9a-f-]{36})(\?.*)?$/.exec(req.url ?? "")?.[1];
  if (pageId && schedule.has(pageId)) {
    if (req.method === "GET") {
      res.end(JSON.stringify(studentPage(pageId)));
      return;
    }
    if (req.method === "PATCH") {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        const text = JSON.parse(raw || "{}").properties?.["Weekly Schedule"]?.rich_text?.[0]?.text?.content ?? "";
        schedule.set(pageId, text);
        res.end(JSON.stringify(studentPage(pageId)));
      });
      return;
    }
  }
  if (req.method === "GET" && req.url === `/v1/data_sources/${STUDENTS_DS}`) {
    res.end(JSON.stringify({ properties: { "Student Name": { id: "title" }, Stage: { id: "stage" }, "Weekly Schedule": { id: "wk" } } }));
    return;
  }
  if (req.method === "POST" && (req.url ?? "").startsWith(`/v1/data_sources/${STUDENTS_DS}/query`)) {
    res.end(JSON.stringify({ results: STUDENTS, has_more: false, next_cursor: null }));
    return;
  }
  if (req.method === "POST" && /^\/v1\/data_sources\/[^/]+\/query$/.test(req.url ?? "")) {
    res.end(JSON.stringify({ results: STAFF, has_more: false, next_cursor: null }));
    return;
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ object: "error", status: 404 }));
}).listen(54333, "127.0.0.1");
