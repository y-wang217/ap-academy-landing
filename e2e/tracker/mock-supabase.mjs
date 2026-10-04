// Local stand-in for a Supabase project (tracker ADR 0023): the Auth endpoints
// the apps call, a proxy from /rest/v1 to a real PostgREST, and a test-only
// /__session endpoint that signs a user in. Tokens are HS256 JWTs signed with
// the same secret PostgREST verifies, so RLS sees real claims.
import { execFileSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import http from "node:http";

const PORT = Number(process.env.MOCK_PORT ?? 54321);
const POSTGREST = process.env.POSTGREST_URL ?? "http://127.0.0.1:54331";
const SECRET = process.env.JWT_SECRET;
const PG = process.env.PG_URL; // postgres://postgres@127.0.0.1:54340/migrated
if (!SECRET || !PG) throw new Error("JWT_SECRET and PG_URL are required");

const b64url = (v) => Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64url");
export function sign(payload) {
  const head = b64url({ alg: "HS256", typ: "JWT" });
  const body = b64url(payload);
  const sig = createHmac("sha256", SECRET).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}
function verify(token) {
  const [head, body, sig] = (token ?? "").split(".");
  if (!sig) return null;
  const expected = createHmac("sha256", SECRET).update(`${head}.${body}`).digest("base64url");
  if (expected !== sig) return null;
  const claims = JSON.parse(Buffer.from(body, "base64url").toString());
  return claims.exp && claims.exp * 1000 < Date.now() ? null : claims;
}

const revoked = new Set();

function psql(sql) {
  return execFileSync("psql", [PG, "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-c", sql]).toString().trim();
}

function userFor(email) {
  const lower = email.toLowerCase();
  const found = psql(`select id from auth.users where email = '${lower.replace(/'/g, "''")}'`);
  if (found) return found;
  const id = randomUUID();
  psql(`insert into auth.users (id, email) values ('${id}', '${lower.replace(/'/g, "''")}')`);
  return id;
}

const send = (res, code, body, headers = {}) => {
  res.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*", ...headers });
  res.end(body === undefined ? "" : JSON.stringify(body));
};

http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === "OPTIONS") return send(res, 204);

  // Test helper: GET /__session?email=... returns the auth cookie value.
  if (url.pathname === "/__session") {
    const email = url.searchParams.get("email");
    const id = userFor(email);
    const exp = Math.floor(Date.now() / 1000) + 3600 * 24;
    const access_token = sign({ sub: id, email: email.toLowerCase(), role: "authenticated", aud: "authenticated", exp, session_id: randomUUID() });
    const session = { access_token, token_type: "bearer", expires_in: 86400, expires_at: exp, refresh_token: randomUUID(), user: { id, email: email.toLowerCase(), aud: "authenticated", role: "authenticated" } };
    return send(res, 200, { id, cookieValue: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url") });
  }

  if (url.pathname === "/auth/v1/user") {
    const token = (req.headers.authorization ?? "").replace(/^Bearer /, "");
    const claims = verify(token);
    if (!claims || !claims.sub || revoked.has(claims.session_id)) return send(res, 401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
    return send(res, 200, { id: claims.sub, aud: "authenticated", role: "authenticated", email: claims.email, app_metadata: { provider: "email" }, user_metadata: {}, created_at: "2026-10-01T00:00:00Z" });
  }
  if (url.pathname === "/auth/v1/logout") {
    const claims = verify((req.headers.authorization ?? "").replace(/^Bearer /, ""));
    if (claims?.session_id) revoked.add(claims.session_id);
    return send(res, 204);
  }

  if (url.pathname.startsWith("/rest/v1/")) {
    const target = new URL(url.pathname.slice("/rest/v1".length) + url.search, POSTGREST);
    const headers = { ...req.headers, host: target.host };
    const upstream = http.request(target, { method: req.method, headers }, (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    });
    upstream.on("error", (e) => send(res, 502, { message: String(e) }));
    req.pipe(upstream);
    return;
  }
  send(res, 404, { msg: `not mocked: ${url.pathname}` });
}).listen(PORT, "127.0.0.1", () => console.log(`mock supabase on :${PORT}`));
