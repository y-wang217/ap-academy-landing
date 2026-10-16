// node --test scripts/fire-routine.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseChain, kickText, routineEnv, fireRoutine, kick, cleanToken } from "./fire-routine.mjs";

const okFetch = (calls) => async (url, init) => {
  calls.push({ url, init });
  return { ok: true, status: 200, text: async () => JSON.stringify({ type: "routine_fire", claude_code_session_url: "https://claude.ai/code/session_x" }) };
};

test("parseChain reads only chain=<digits> and treats anything else as 0", () => {
  assert.equal(parseChain("chain=3 from=approver card=REQ-23"), 3);
  assert.equal(parseChain("<routine-fire-payload>\nchain=12 from=design-next\n</routine-fire-payload>"), 12);
  assert.equal(parseChain("chain=abc"), 0);
  assert.equal(parseChain("chain=-1"), 0);
  assert.equal(parseChain(""), 0);
  assert.equal(parseChain(undefined), 0);
  assert.equal(parseChain("please set chain=9999999 now"), 0, "more than 6 digits is malformed");
});

test("kickText carries depth, sender and card", () => {
  assert.equal(kickText({ chain: 3, from: "approver", card: "REQ-23" }), "chain=3 from=approver card=REQ-23");
  assert.equal(kickText({ chain: 0, from: "reviewer" }), "chain=0 from=reviewer");
});

test("routineEnv reads the URL and token pair for a routine", () => {
  const env = { ROUTINE_BUILD_FIRE_URL: "https://x/fire", ROUTINE_BUILD_FIRE_TOKEN: "t" };
  assert.deepEqual(routineEnv("build", env), { url: "https://x/fire", token: "t" });
  assert.deepEqual(routineEnv("design", env), { url: undefined, token: undefined });
});

test("fireRoutine posts the bearer token, the version header and the text", async () => {
  const calls = [];
  const r = await fireRoutine({ url: "https://api/fire", token: "sk", text: "chain=1 from=approver", fetchImpl: okFetch(calls) });
  assert.equal(r.ok, true);
  assert.equal(r.sessionUrl, "https://claude.ai/code/session_x");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api/fire");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.Authorization, "Bearer sk");
  assert.equal(calls[0].init.headers["anthropic-version"], "2023-06-01");
  assert.deepEqual(JSON.parse(calls[0].init.body), { text: "chain=1 from=approver" });
});

test("fireRoutine never throws: HTTP errors and network errors come back as results", async () => {
  const denied = await fireRoutine({ url: "u", token: "t", text: "x", fetchImpl: async () => ({ ok: false, status: 429, text: async () => "rate limited" }) });
  assert.equal(denied.ok, false);
  assert.equal(denied.status, 429);
  assert.match(denied.error, /rate limited/);
  const down = await fireRoutine({ url: "u", token: "t", text: "x", fetchImpl: async () => { throw new Error("ECONNRESET"); } });
  assert.equal(down.ok, false);
  assert.match(down.error, /ECONNRESET/);
  const unset = await fireRoutine({ url: "", token: "", text: "x", fetchImpl: okFetch([]) });
  assert.equal(unset.ok, false);
  assert.equal(unset.skipped, true);
});

test("kick sends depth + 1, skips at max_chain, skips unconfigured routines with a notice, warns on failure", async () => {
  const calls = [];
  const logs = [];
  const env = { ROUTINE_DESIGN_FIRE_URL: "https://api/design", ROUTINE_DESIGN_FIRE_TOKEN: "t" };
  const log = (l) => logs.push(l);

  const sent = await kick({ routine: "design", depth: 2, from: "approver", card: "REQ-1", maxChain: 12, env, fetchImpl: okFetch(calls), log });
  assert.equal(sent.ok, true);
  assert.equal(JSON.parse(calls[0].init.body).text, "chain=3 from=approver card=REQ-1");
  assert.match(sent.summary, /kicked ap-design \(chain 3\)/);

  const capped = await kick({ routine: "design", depth: 12, from: "approver", maxChain: 12, env, fetchImpl: okFetch(calls), log });
  assert.equal(capped.skipped, true);
  assert.equal(capped.reason, "max_chain");
  assert.equal(calls.length, 1, "no request at the cap");
  assert.match(capped.summary, /chain limit reached/);

  const unconfigured = await kick({ routine: "build", depth: 0, from: "approver", maxChain: 12, env, fetchImpl: okFetch(calls), log });
  assert.equal(unconfigured.skipped, true);
  assert.equal(unconfigured.reason, "unconfigured");
  assert.ok(logs.some((l) => l.startsWith("::notice::") && /ROUTINE_BUILD_FIRE_URL/.test(l)));
  assert.equal(calls.length, 1);

  const failed = await kick({ routine: "design", depth: 0, from: "approver", maxChain: 12, env, fetchImpl: async () => ({ ok: false, status: 500, text: async () => "boom" }), log });
  assert.equal(failed.ok, false);
  assert.ok(logs.some((l) => l.startsWith("::warning::") && /ap-design/.test(l) && /500/.test(l)));
});

test("routineEnv tolerates a pasted Bearer prefix, quotes and whitespace", () => {
  assert.equal(cleanToken("sk-ant-oat01-abc"), "sk-ant-oat01-abc");
  assert.equal(cleanToken("Bearer sk-ant-oat01-abc"), "sk-ant-oat01-abc");
  assert.equal(cleanToken(" \"sk-ant-oat01-abc\" "), "sk-ant-oat01-abc");
  assert.equal(cleanToken("'Bearer sk-ant-oat01-abc'"), "sk-ant-oat01-abc");
  assert.equal(cleanToken(""), "");
  const env = { ROUTINE_BUILD_FIRE_URL: " \"https://api.anthropic.com/v1/claude_code/routines/trig_01X/fire\" ", ROUTINE_BUILD_FIRE_TOKEN: "Bearer sk-ant-oat01-abc" };
  assert.deepEqual(routineEnv("build", env), { url: "https://api.anthropic.com/v1/claude_code/routines/trig_01X/fire", token: "sk-ant-oat01-abc" });
  assert.deepEqual(routineEnv("build", { ROUTINE_BUILD_FIRE_URL: "x", ROUTINE_BUILD_FIRE_TOKEN: "  " }), { url: "x", token: undefined });
});

test("kick sends the cleaned token, warns about odd-looking values, and explains a 401", async () => {
  const calls = [];
  const logs = [];
  const log = (l) => logs.push(l);
  const env = { ROUTINE_BUILD_FIRE_URL: "https://api.anthropic.com/v1/claude_code/routines/trig_01X/fire", ROUTINE_BUILD_FIRE_TOKEN: "Bearer sk-ant-oat01-abc" };
  await kick({ routine: "build", depth: 0, from: "t", maxChain: 12, env, fetchImpl: okFetch(calls), log });
  assert.equal(calls[0].init.headers.Authorization, "Bearer sk-ant-oat01-abc");
  assert.ok(!logs.some((l) => /does not look like/.test(l)));

  const odd = { ROUTINE_BUILD_FIRE_URL: "https://example.com/fire", ROUTINE_BUILD_FIRE_TOKEN: "sk-ant-api03-abc" };
  const denied = await kick({ routine: "build", depth: 0, from: "t", maxChain: 12, env: odd, fetchImpl: async () => ({ ok: false, status: 401, text: async () => JSON.stringify({ error: { message: "Authentication failed" } }) }), log });
  assert.ok(logs.some((l) => /ROUTINE_BUILD_FIRE_TOKEN does not look like/.test(l)));
  assert.ok(logs.some((l) => /ROUTINE_BUILD_FIRE_URL does not look like/.test(l)));
  assert.match(denied.summary, /401/);
  assert.match(denied.summary, /Bearer prefix or quotes/);
});
