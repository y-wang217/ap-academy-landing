// Mock of the Notion calls the scheduler makes in the tracker e2e: the Staff
// data source query, and (REQ-6) the Students schema plus a names-only query.
// Two active teachers and three students. Writes are not mocked: a PATCH is a 404.
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

http.createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
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
