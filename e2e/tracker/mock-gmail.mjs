// Mock of the Gmail calls Iris makes (REQ-42), on 127.0.0.1:54334. The tracker
// reaches it through IRIS_GMAIL_API_BASE: POST /token for the service account
// JWT, GET /gmail/v1/users/me/messages (list, newest first; REQ-44: q "in:sent ..." lists only messages
// labelled SENT, and any other q leaves them out) and
// GET /gmail/v1/users/me/messages/:id (format=full). REQ-48 adds POST /gmail/v1/users/me/messages/send
// (stores the decoded message, labelled SENT, in its thread), q "rfc822msgid:<id>" on the list call, and
// GET /gmail/v1/users/me/threads/:id?format=metadata. Test helpers:
//   POST /__gmail/add        body: a Gmail message; adds it to the inbox
//   POST /__gmail/fail-list  toggles a 500 on the list call
//   POST /__gmail/slow       toggles a 1.5 second delay on the list call (two runs at once overlap)
//   GET  /__gmail/calls      every Gmail call so far, in order
//   POST /__gmail/reset      clears the call journal
//   GET  /__gmail/sent       every message accepted by messages.send: { id, threadId, raw, headers, body }
//   POST /__gmail/fail-send  toggles a 500 on messages.send (nothing stored)
//   POST /__gmail/accept-then-fail  toggles storing the message and then answering 500 (a crash after Gmail accepted it)
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
const sent = [];
let failList = false;
let slowList = false;
let failSend = false;
let acceptThenFail = false;

/** A raw RFC 5322 message (base64url) as headers and a decoded text body. */
function decodeRaw(raw) {
  const text = Buffer.from(raw, "base64url").toString("utf8");
  const [head, ...rest] = text.split("\r\n\r\n");
  const headers = head.split("\r\n").map((l) => ({ name: l.slice(0, l.indexOf(":")), value: l.slice(l.indexOf(":") + 1).trim() }));
  const encoded = headers.find((h) => h.name.toLowerCase() === "content-transfer-encoding")?.value === "base64";
  const body = encoded ? Buffer.from(rest.join("\r\n\r\n").replace(/\r\n/g, ""), "base64").toString("utf8") : rest.join("\r\n\r\n");
  return { headers, body };
}
const headerOf = (m, name) => (m.payload?.headers ?? []).find((h) => h.name.toLowerCase() === name.toLowerCase())?.value;
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
  if (url.pathname === "/__gmail/sent") return send(res, 200, sent);
  if (url.pathname === "/__gmail/fail-send") { failSend = !failSend; return send(res, 200, { failSend }); }
  if (url.pathname === "/__gmail/accept-then-fail") { acceptThenFail = !acceptThenFail; return send(res, 200, { acceptThenFail }); }
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
    const q = url.searchParams.get("q") ?? "";
    if (q.startsWith("rfc822msgid:")) {
      const want = q.slice("rfc822msgid:".length).replace(/^<|>$/g, "");
      const hits = [...inbox.values()].filter((m) => (headerOf(m, "Message-ID") ?? "").replace(/^<|>$/g, "") === want).map((m) => ({ id: m.id, threadId: m.threadId }));
      return send(res, 200, hits.length > 0 ? { messages: hits, resultSizeEstimate: hits.length } : { resultSizeEstimate: 0 });
    }
    const sentOnly = q.startsWith("in:sent");
    const ids = [...inbox.values()]
      .filter((m) => (m.labelIds ?? []).includes("SENT") === sentOnly)
      .sort((a, b) => Number(b.internalDate) - Number(a.internalDate))
      .map((m) => ({ id: m.id, threadId: m.threadId }));
    return send(res, 200, { messages: ids, resultSizeEstimate: ids.length });
  }
  if (url.pathname === "/gmail/v1/users/me/messages/send" && req.method === "POST") {
    if (failSend) return send(res, 500, { error: { code: 500, message: `backend error for ${MAILBOX}` } });
    const { raw: rawMessage, threadId } = JSON.parse(raw);
    const { headers, body } = decodeRaw(rawMessage);
    const id = `sent-${sent.length + 1}`;
    const stored = {
      id, threadId: threadId ?? `thread-${id}`, internalDate: String(Date.now()), snippet: body.slice(0, 120), labelIds: ["SENT"],
      payload: { mimeType: "text/plain", headers, body: { data: b64(body) } },
    };
    inbox.set(id, stored);
    sent.push({ id, threadId: stored.threadId, raw: rawMessage, headers, body });
    if (acceptThenFail) return send(res, 500, { error: { code: 500 } });
    return send(res, 200, { id, threadId: stored.threadId, labelIds: ["SENT"] });
  }
  const threadMatch = /^\/gmail\/v1\/users\/me\/threads\/([^/]+)$/.exec(url.pathname)?.[1];
  if (threadMatch && req.method === "GET") {
    const wanted = url.searchParams.getAll("metadataHeaders").map((h) => h.toLowerCase());
    const messages = [...inbox.values()]
      .filter((m) => m.threadId === decodeURIComponent(threadMatch))
      .map((m) => ({ id: m.id, threadId: m.threadId, payload: { headers: (m.payload?.headers ?? []).filter((h) => wanted.includes(h.name.toLowerCase())) } }));
    return messages.length > 0 ? send(res, 200, { id: decodeURIComponent(threadMatch), messages }) : send(res, 404, { error: { code: 404 } });
  }
  const id = /^\/gmail\/v1\/users\/me\/messages\/([^/]+)$/.exec(url.pathname)?.[1];
  if (id && req.method === "GET") {
    const m = inbox.get(decodeURIComponent(id));
    return m ? send(res, 200, m) : send(res, 404, { error: { code: 404 } });
  }
  send(res, 405, { error: { code: 405 } });
}).listen(54334, "127.0.0.1", () => console.log("mock gmail on :54334"));
