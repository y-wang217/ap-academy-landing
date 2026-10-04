// Stand-in for Supabase Auth and PostgREST: just enough for the single-domain
// SSO acceptance checks. Accepts one fixed access token for one user, who has a
// tracker membership with role "teacher" (so /tracker shows the teacher home).
import http from "node:http";

const USER = {
  id: "00000000-0000-0000-0000-00000000000a",
  aud: "authenticated",
  role: "authenticated",
  email: "student@example.com",
  app_metadata: { provider: "email" },
  user_metadata: {},
  created_at: "2026-10-02T00:00:00Z",
};
const TOKEN = "header.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMGEifQ.sig";
let loggedOut = false;
const log = [];

const server = http.createServer((req, res) => {
  const auth = req.headers.authorization ?? "";
  log.push(`${req.method} ${req.url} profile=${req.headers["accept-profile"] ?? "-"}`);
  const json = (code, body) => {
    res.writeHead(code, {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "*",
    });
    res.end(body === undefined ? "" : JSON.stringify(body));
  };
  if (req.method === "OPTIONS") return json(204);
  if (req.url === "/__reset") {
    loggedOut = false;
    return json(200, {});
  }
  if (req.url.startsWith("/auth/v1/user")) {
    return auth === `Bearer ${TOKEN}` && !loggedOut
      ? json(200, USER)
      : json(401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
  }
  if (req.url.startsWith("/auth/v1/logout")) {
    loggedOut = true;
    return json(204);
  }
  if (req.url.startsWith("/rest/v1/memberships")) {
    return json(200, req.headers["accept-profile"] === "tracker" ? [{ role: "teacher", org_id: "10000000-0000-0000-0000-000000000001" }] : []);
  }
  if (req.url.startsWith("/rest/v1/")) return json(200, []);
  if (req.url === "/__log") return json(200, log);
  json(404, { msg: "not mocked" });
});
server.listen(54321, "127.0.0.1", () => console.log("mock supabase on :54321"));
