// Mock of the one Notion call the scheduler makes in the tracker e2e: the Staff
// data source query. Two active teachers; no other endpoint exists.
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

http.createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.method === "POST" && /^\/v1\/data_sources\/[^/]+\/query$/.test(req.url ?? "")) {
    res.end(JSON.stringify({ results: STAFF, has_more: false, next_cursor: null }));
    return;
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ object: "error", status: 404 }));
}).listen(54333, "127.0.0.1");
