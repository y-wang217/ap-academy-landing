// Mock of the Gmail calls Iris makes (REQ-42), on 127.0.0.1:54334. The tracker
// reaches it through IRIS_GMAIL_API_BASE: POST /token for the service account
// JWT, GET /gmail/v1/users/me/messages (list, newest first) and
// GET /gmail/v1/users/me/messages/:id (format=full). Test helpers:
//   POST /__gmail/add        body: a Gmail message; adds it to the inbox
//   POST /__gmail/fail-list  toggles a 500 on the list call
//   POST /__gmail/slow       toggles a 1.5 second delay on the list call (two runs at once overlap)
//   GET  /__gmail/calls      every Gmail call so far, in order
//   POST /__gmail/reset      clears the call journal
// Every fixture is synthetic. The mailbox is charlie@apacademy.ca.
import http from "node:http";

const MAILBOX = "charlie@apacademy.ca";
const NOW = Date.now();
const b64 = (s) => Buffer.from(s).toString("base64url");
let seq = 0;
function message(id, { thread, from, subject, plain, html, headers = {}, minutesAgo, snippet }) {
  const parts = [];
  if (plain !== undefined) parts.push({ mimeType: "text/plain", headers: [{ name: "Content-Type", value: "text/plain; charset=UTF-8" }], body: { data: b64(plain) } });
  if (html !== undefined) parts.push({ mimeType: "text/html", headers: [{ name: "Content-Type", value: "text/html; charset=UTF-8" }], body: { data: b64(html) } });
  return {
    id,
    threadId: thread ?? `thread-${id}`,
    internalDate: String(NOW - minutesAgo * 60_000 + ++seq),
    snippet: snippet ?? (plain ?? html ?? "").replace(/<[^>]+>/g, "").slice(0, 120),
    payload: {
      mimeType: "multipart/alternative",
      headers: [
        { name: "From", value: from },
        { name: "To", value: MAILBOX },
        { name: "Subject", value: subject },
        { name: "Message-ID", value: `<${id}@mail.example>` },
        ...Object.entries(headers).map(([name, value]) => ({ name, value })),
      ],
      parts,
    },
  };
}

// m1 Sam's parent, plain text. m2 the sibling family (Haider and Ada), HTML only. m3 an unknown sender.
// m4 a newsletter with List-Unsubscribe. m5 Sam's parent, a 25,000-character body. m6 the mailbox replying
// in m1's thread. m7 the mailbox writing in a new thread.
const inbox = new Map(
  [
    message("m1", { thread: "thread-sam", from: "Pat Student <Sam.Parent@Example.com>", subject: "Sam is sick", plain: "Hi Charlie, Sam is sick today and will miss class.", minutesAgo: 120 }),
    message("m2", { from: "Afzal Family <afzal.family@example.com>", subject: "Both kids away", html: "<p>Hi Charlie,</p><p>Haider and Ada are <b>away</b> next week.</p>", minutesAgo: 110 }),
    message("m3", { from: "Lead Person <lead@example.org>", subject: "Question about fall classes", plain: "Hi, I saw your site and wanted to ask about fall classes.", minutesAgo: 100 }),
    message("m4", { from: "Newsletter <news@shop.example>", subject: "Weekly digest", plain: "Deals of the week.", headers: { "List-Unsubscribe": "<https://shop.example/u>" }, minutesAgo: 90 }),
    message("m5", { from: "sam.parent@example.com", subject: "Long note", plain: "L".repeat(25000), minutesAgo: 80 }),
    message("m6", { thread: "thread-sam", from: "Charlie <charlie@apacademy.ca>", subject: "Re: Sam is sick", plain: "Thanks, feel better Sam.", minutesAgo: 70 }),
    message("m7", { from: "charlie@apacademy.ca", subject: "Hello", plain: "A note I wrote.", minutesAgo: 60 }),
  ].map((m) => [m.id, m]),
);

const calls = [];
let failList = false;
let slowList = false;
const send = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};
const readBody = (req) =>
  new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => resolve(raw));
  });

http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1:54334");
  const raw = await readBody(req);
  if (url.pathname === "/__gmail/calls") return send(res, 200, calls);
  if (url.pathname === "/__gmail/reset") { calls.length = 0; return send(res, 200, { ok: true }); }
  if (url.pathname === "/__gmail/fail-list") { failList = !failList; return send(res, 200, { failList }); }
  if (url.pathname === "/__gmail/slow") { slowList = !slowList; return send(res, 200, { slowList }); }
  if (url.pathname === "/__gmail/add" && req.method === "POST") {
    const m = JSON.parse(raw);
    inbox.set(m.id, m);
    return send(res, 200, { ok: true });
  }

  calls.push({ method: req.method, path: url.pathname, q: url.searchParams.get("q"), format: url.searchParams.get("format") });
  if (url.pathname === "/token" && req.method === "POST") {
    const form = new URLSearchParams(raw);
    const ok = form.get("grant_type") === "urn:ietf:params:oauth:grant-type:jwt-bearer" && (form.get("assertion") ?? "").split(".").length === 3;
    return ok ? send(res, 200, { access_token: "mock-gmail-token", expires_in: 3600, token_type: "Bearer" }) : send(res, 400, { error: "invalid_grant" });
  }
  if (req.headers.authorization !== "Bearer mock-gmail-token") return send(res, 401, { error: { code: 401 } });
  if (url.pathname === "/gmail/v1/users/me/messages" && req.method === "GET") {
    if (slowList) await new Promise((r) => setTimeout(r, 1500));
    if (failList) return send(res, 500, { error: { code: 500, message: `backend error for ${MAILBOX}` } });
    const ids = [...inbox.values()].sort((a, b) => Number(b.internalDate) - Number(a.internalDate)).map((m) => ({ id: m.id, threadId: m.threadId }));
    return send(res, 200, { messages: ids, resultSizeEstimate: ids.length });
  }
  const id = /^\/gmail\/v1\/users\/me\/messages\/([^/]+)$/.exec(url.pathname)?.[1];
  if (id && req.method === "GET") {
    const m = inbox.get(decodeURIComponent(id));
    return m ? send(res, 200, m) : send(res, 404, { error: { code: 404 } });
  }
  send(res, 405, { error: { code: 405 } });
}).listen(54334, "127.0.0.1", () => console.log("mock gmail on :54334"));
