// Mock of the Notion calls the scheduler makes in the tracker e2e: the Staff
// data source query, and (REQ-6) the Students schema plus a names-only query.
// Two active teachers and three students. REQ-7: one student page can be read and its Weekly Schedule
// written (the scheduler adopts a student and regenerates that one property); nothing else is writable.
import http from "node:http";

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

http.createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
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
