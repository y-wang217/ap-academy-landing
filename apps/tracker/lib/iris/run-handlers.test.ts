import { describe, expect, it, vi } from "vitest";
import type { ClassifyPort } from "./classify";
import type { DraftPort } from "./draft";
import { handleIrisRun, type IrisRunDeps } from "./handlers";
import { GmailError, type GmailMessage } from "./gmail";
import type { GmailPort } from "./intake";
import { POLICY_VERSION } from "./policy";
import { fakeIrisStore } from "./store.fake";

// REQ-42 AC10, AC11, AC12, AC19, AC20: the bearer-protected run.
const SECRET = "iris-secret-value";
const ORG = "10000000-0000-0000-0000-00000000aaaa";
const AUTH = `Bearer ${SECRET}`;
const T0 = Date.parse("2026-10-20T12:00:00Z");

const message = (id: string, from: string): GmailMessage => ({
  id, threadId: `t-${id}`, internalDate: String(T0 - 60_000), snippet: "hi",
  payload: { mimeType: "text/plain", headers: [{ name: "From", value: from }, { name: "Subject", value: "Hi" }], body: { data: Buffer.from("hello").toString("base64url") } },
});

function world(opts: { paused?: boolean; listFails?: boolean; classify?: ClassifyPort | null; draft?: DraftPort | null; push?: IrisRunDeps["push"]; history?: GmailMessage[] } = {}) {
  const db = fakeIrisStore({ paused: opts.paused ?? false });
  const gmailCalls: string[] = [];
  const gmail: GmailPort = {
    token: async () => (gmailCalls.push("token"), "tok"),
    list: async () => {
      gmailCalls.push("list");
      if (opts.listFails) throw new GmailError("Gmail returned 403", 403);
      return ["m1"];
    },
    listRefs: async (_t, q) => (gmailCalls.push(`listRefs:${q.split(" ")[0]}`), q.startsWith("in:sent") ? [] : (opts.history ?? []).map((m) => ({ id: m.id, threadId: m.threadId }))),
    get: async (_t, id) => (gmailCalls.push(`get:${id}`), opts.history?.find((m) => m.id === id) ?? message(id, "who@z.com")),
  };
  const directoryCalls: number[] = [];
  const deps: IrisRunDeps = { store: db.store, gmail, directory: async () => (directoryCalls.push(1), []), mailbox: "charlie@apacademy.ca", classify: opts.classify ?? null, draft: opts.draft ?? null, push: opts.push ?? null,
    evalClassify: opts.classify ?? null, evalDraft: opts.draft ?? null, model: "m",
  };
  const build = vi.fn((org: string) => (org ? deps : null));
  const run = (authorization: string | null = AUTH, env = { secret: SECRET as string | undefined, orgId: ORG as string | undefined }) =>
    handleIrisRun({ authorization, env, build, now: () => new Date(T0) });
  return { db, gmailCalls, directoryCalls, build, run };
}

describe("handleIrisRun: authentication first", () => {
  it("an unset secret is 503 and a missing or wrong bearer is 401, with no build", async () => {
    const w = world();
    const unset = await w.run(AUTH, { secret: undefined, orgId: ORG });
    expect(unset.status).toBe(503);
    expect(await unset.json()).toEqual({ error: "iris_not_configured" });
    expect((await w.run(null)).status).toBe(401);
    expect((await w.run("Bearer wrong")).status).toBe(401);
    expect((await w.run(SECRET)).status).toBe(401);
    expect(w.build).not.toHaveBeenCalled();
    expect(w.db.calls).toEqual([]);
    expect(w.gmailCalls).toEqual([]);
  });

  it("a bad org id or a missing build is 503 iris_not_configured", async () => {
    const w = world();
    const bad = await w.run(AUTH, { secret: SECRET, orgId: "not-a-guid" });
    expect(bad.status).toBe(503);
    expect(await bad.json()).toEqual({ error: "iris_not_configured" });
    expect(w.build).not.toHaveBeenCalled();
    w.build.mockReturnValueOnce(null as unknown as IrisRunDeps);
    const none = await w.run();
    expect(none.status).toBe(503);
    expect(await none.json()).toEqual({ error: "iris_not_configured" });
  });

  it("a settings read error is 503 iris_unavailable", async () => {
    const w = world();
    w.db.fail.add("getSettings");
    const res = await w.run();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "iris_unavailable" });
  });
});

describe("handleIrisRun: paused and busy", () => {
  it("paused answers paused, calls no Gmail or Notion and writes no row", async () => {
    const w = world({ paused: true });
    const res = await w.run();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ result: "paused" });
    expect(w.gmailCalls).toEqual([]);
    expect(w.directoryCalls).toEqual([]);
    expect(w.db.calls).toEqual(["getSettings"]);
  });

  it("paused with a pending import and eval makes no Gmail or Claude call (REQ-45 AC14)", async () => {
    const classify = vi.fn<ClassifyPort>();
    const w = world({ paused: true, classify });
    w.db.request("eval_import_requested");
    w.db.request("eval_run_requested", { policy_version: POLICY_VERSION, model: "m" });
    expect(await (await w.run()).json()).toEqual({ result: "paused" });
    expect(w.gmailCalls).toEqual([]);
    expect(classify).not.toHaveBeenCalled();
  });

  it("a held lease answers busy with no Gmail call", async () => {
    const w = world();
    w.db.settings.leaseUntil = T0 + 999_999_999;
    const res = await w.run();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ result: "busy" });
    expect(w.gmailCalls).toEqual([]);
    for (const c of ["purge", "insertRun", "releasePoll"]) expect(w.db.calls).not.toContain(c);
  });
});

describe("handleIrisRun: the end of every run (AC20)", () => {
  it("success: 200 with counts, one purge, one run row, the lease released", async () => {
    const w = world();
    const res = await w.run();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ result: "ok", seen: 1, stored: 1, matched: 0, escalated: 1, skipped: 0, failed: 0, purged: 0 });
    expect(body.runId).toBe(w.db.runs[0].id);
    expect(body).not.toHaveProperty("error");
    expect(w.db.calls.filter((c) => c === "purge")).toHaveLength(1);
    expect(w.db.runs).toHaveLength(1);
    expect(w.db.runs[0]).toMatchObject({ result: "ok", stored: 1, escalated: 1 });
    expect(w.db.calls.filter((c) => c === "releasePoll")).toHaveLength(1);
    expect(w.db.settings).toMatchObject({ lastPollResult: "ok", lastError: null, leaseUntil: null, lastPollAt: new Date(T0).toISOString() });
  });

  it("a Gmail list failure is 502, recorded failed, with last_error saved and no error text in the response", async () => {
    const w = world({ listFails: true });
    const res = await w.run();
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.result).toBe("failed");
    // The run id is a random UUID and can contain "403" by chance, so leave it out.
    expect(JSON.stringify({ ...body, runId: undefined })).not.toContain("403");
    expect(JSON.stringify(body)).not.toContain("Gmail");
    expect(w.db.runs[0]).toMatchObject({ result: "failed", error: "Gmail returned 403" });
    expect(w.db.settings).toMatchObject({ lastPollResult: "failed", lastError: "Gmail returned 403", leaseUntil: null });
    expect(w.db.calls.filter((c) => c === "purge")).toHaveLength(1);
  });

  it("a store that throws mid-run still answers 200 failed and ends the run", async () => {
    const w = world();
    w.db.fail.add("insertMessage");
    const res = await w.run();
    expect(res.status).toBe(200);
    expect((await res.json()).result).toBe("failed");
    for (const c of ["purge", "insertRun", "releasePoll"]) expect(w.db.calls.filter((x) => x === c), c).toHaveLength(1);
    expect(w.db.settings.lastPollResult).toBe("failed");
  });

  it("a purge that throws still ends ok, with its short error kept", async () => {
    const w = world();
    w.db.fail.add("purge");
    const res = await w.run();
    expect(res.status).toBe(200);
    expect((await res.json()).result).toBe("ok");
    expect(w.db.settings.lastError).toBe("Purge failed");
    expect(w.db.runs[0].error).toBe("Purge failed");
  });

  it("never throws, even when the run row and the release fail", async () => {
    const w = world();
    w.db.fail.add("insertRun");
    w.db.fail.add("releasePoll");
    const res = await w.run();
    expect(res.status).toBe(200);
    expect((await res.json()).result).toBe("ok");
  });
});

// REQ-43 AC7, AC13: the run classifies after intake, reading the directory once.
describe("handleIrisRun: classification", () => {
  const SAM = "11111111-1111-4111-8111-111111111111";
  const family = [{ studentId: SAM, studentName: "Sam Lee", stage: "Active", parentEmail: "ann@x.com", parentName: "Ann Lee" }];
  const port: ClassifyPort = async () => ({
    ok: true, model: "m", inputTokens: 1, outputTokens: 1,
    output: { intents: ["general_question"], primary: "general_question", confidence: 0.95, flags: [], childName: "", summary: "" },
  });

  it("carries classified in the response and the run row, with one directory read", async () => {
    const w = world({ classify: port });
    const deps = w.build.getMockImplementation()!("x") as IrisRunDeps;
    deps.directory = async () => (w.directoryCalls.push(1), family);
    deps.gmail.get = async (_t, id) => message(id, "ann@x.com");
    const res = await w.run();
    const body = await res.json();
    expect(body).toMatchObject({ result: "ok", stored: 1, matched: 1, classified: 1 });
    expect(w.db.runs[0]).toMatchObject({ classified: 1, matched: 1 });
    expect(w.directoryCalls).toHaveLength(1);
    expect(w.db.aiCalls).toHaveLength(1);
  });

  it("with no classify port the run classifies nothing", async () => {
    const w = world({ classify: null });
    const deps = w.build.getMockImplementation()!("x") as IrisRunDeps;
    deps.directory = async () => family;
    deps.gmail.get = async (_t, id) => message(id, "ann@x.com");
    const body = await (await w.run()).json();
    expect(body).toMatchObject({ matched: 1, classified: 0 });
    expect(w.db.aiCalls).toHaveLength(0);
  });
});

// REQ-44 AC24: intake, supersede, classify, draft, push, purge, with drafted counted and the directory read once.
describe("handleIrisRun: drafting and the phone backup", () => {
  const SAM = "11111111-1111-4111-8111-111111111111";
  const family = [{ studentId: SAM, studentName: "Sam Lee", stage: "Active", parentEmail: "ann@x.com", parentName: "Ann Lee" }];

  function drafting() {
    const order: string[] = [];
    const classify: ClassifyPort = async () => (order.push("classify"), {
      ok: true, model: "m", inputTokens: 1, outputTokens: 1,
      output: { intents: ["cancellation"], primary: "cancellation", confidence: 0.95, flags: [], childName: "", summary: "" },
    });
    const draft: DraftPort = async () => (order.push("draft"), { ok: true, model: "m", inputTokens: 1, outputTokens: 1, output: { body: "Hi Ann,\n\nThanks.", needsCharlie: false, reason: "" } });
    const push: IrisRunDeps["push"] = async () => (order.push("push"), { pushed: 1, failed: 0, removed: 0, error: null });
    const w = world({ classify, draft, push });
    const deps = w.build.getMockImplementation()!("x") as IrisRunDeps;
    deps.directory = async () => (w.directoryCalls.push(1), family);
    deps.gmail.get = async (_t, id) => message(id, "ann@x.com");
    deps.gmail.list = async (_t, q) => (order.push(`list:${q.split(" ")[0]}`), ["m1"]);
    const purge = w.db.store.purge;
    w.db.store.purge = async () => (order.push("purge"), purge());
    return { w, order };
  }

  it("runs in order and carries drafted in the response and the run row", async () => {
    const { w, order } = drafting();
    const body = await (await w.run()).json();
    expect(order).toEqual(["list:in:inbox", "list:in:sent", "classify", "draft", "push", "purge"]);
    expect(body).toMatchObject({ result: "ok", classified: 1, drafted: 1 });
    expect(w.db.runs[0]).toMatchObject({ drafted: 1, classified: 1 });
    expect(w.directoryCalls).toHaveLength(1);
    expect(w.db.aiCalls.map((c) => c.purpose)).toEqual(["classify", "draft"]);
  });

  it("no push after the push budget", async () => {
    const { w, order } = drafting();
    let t = T0;
    const res = await handleIrisRun({ authorization: AUTH, env: { secret: SECRET, orgId: ORG }, build: w.build, now: () => new Date((t += 40_000)) });
    expect(res.status).toBe(200);
    expect(order).not.toContain("push");
  });

  it("a push error is kept as the run's last error, and the run stays ok", async () => {
    const { w } = drafting();
    const deps = w.build.getMockImplementation()!("x") as IrisRunDeps;
    deps.push = async () => ({ pushed: 0, failed: 1, removed: 0, error: "Notion returned 500" });
    const body = await (await w.run()).json();
    expect(body.result).toBe("ok");
    expect(w.db.settings.lastError).toBe("Notion returned 500");
  });
});

// REQ-45 AC3: the history import and the eval run ride the run, after push and before purge, and never feed the live path.
describe("handleIrisRun: history import and eval", () => {
  const SAM = "11111111-1111-4111-8111-111111111111";
  const family = [{ studentId: SAM, studentName: "Sam Lee", stage: "Active", parentEmail: "ann@x.com", parentName: "Ann Lee" }];
  const old = (id: string): GmailMessage => ({ ...message(id, "ann@x.com"), threadId: `t-${id}`, internalDate: String(T0 - 30 * 86_400_000) });

  function evalWorld() {
    const order: string[] = [];
    const classify: ClassifyPort = async () => (order.push("classify"), {
      ok: true, model: "m", inputTokens: 1, outputTokens: 1,
      output: { intents: ["cancellation"], primary: "cancellation", confidence: 0.95, flags: [], childName: "", summary: "" },
    });
    const draft: DraftPort = async () => (order.push("draft"), { ok: true, model: "m", inputTokens: 1, outputTokens: 1, output: { body: "Hi Ann,\n\nThanks.", needsCharlie: false, reason: "" } });
    const push: IrisRunDeps["push"] = async ({ store }) => {
      order.push("push");
      await store.listPushable(5, 20).then((rows) => order.push(`pushable:${rows.length}`));
      return { pushed: 0, failed: 0, removed: 0, error: null };
    };
    const w = world({ classify, draft, push, history: [old("h1")] });
    const deps = w.build.getMockImplementation()!("x") as IrisRunDeps;
    deps.directory = async () => (w.directoryCalls.push(1), family);
    deps.gmail.list = async () => (order.push("list"), []);
    const listRefs = deps.gmail.listRefs;
    deps.gmail.listRefs = async (t, q) => (order.push(`listRefs:${q.split(" ")[0]}`), listRefs(t, q));
    const purge = w.db.store.purge;
    w.db.store.purge = async () => (order.push("purge"), purge());
    return { w, order, deps };
  }

  it("imports after push and before purge, and the next run leaves the history message alone", async () => {
    const { w, order } = evalWorld();
    w.db.request("eval_import_requested");
    expect((await w.run()).status).toBe(200);
    expect(order.indexOf("push")).toBeLessThan(order.indexOf("listRefs:newer_than:365d"));
    expect(order.indexOf("listRefs:in:sent")).toBeLessThan(order.indexOf("purge"));
    const h = w.db.byGmailId("h1")!;
    expect(h).toMatchObject({ escalationReason: "history_import", state: "escalated" });
    expect(w.db.events.some((e) => e.kind === "eval_import_finished")).toBe(true);

    order.length = 0;
    await w.run();
    // Not classified, drafted, pushed or listed by any live step.
    expect(order).not.toContain("classify");
    expect(order).toContain("pushable:0");
    expect(w.db.drafts.size).toBe(0);
    expect(await w.db.store.listRetryable(3, 50)).toEqual([]);
    expect(await w.db.store.listClassifiable(3, 50)).toEqual([]);
    expect(await w.db.store.listDraftable(3, 50)).toEqual([]);
    expect(await w.db.store.listPushable(5, 50)).toEqual([]);
    expect(await w.db.store.supersedeThread(h.threadId, new Date(T0).toISOString())).toEqual([]);
    expect(w.directoryCalls).toHaveLength(2);
  });

  it("evaluates a labelled message after the import, with purpose eval", async () => {
    const { w, order } = evalWorld();
    w.db.request("eval_import_requested");
    await w.run();
    const h = w.db.byGmailId("h1")!;
    w.db.labels.set(h.id, { goldIntent: "cancellation", goldReplyType: "cancellation", goldEscalate: false });
    w.db.request("eval_run_requested", { policy_version: POLICY_VERSION, model: "m" });
    order.length = 0;
    await w.run();
    expect(order.slice(-3)).toEqual(["classify", "draft", "purge"]);
    expect(w.db.aiCalls.map((c) => c.purpose)).toEqual(["eval", "eval"]);
    expect(w.db.evalResults).toHaveLength(1);
    expect(w.db.events.some((e) => e.kind === "eval_run_finished")).toBe(true);
  });

  it("no import or eval when intake failed", async () => {
    const { w, order, deps } = evalWorld();
    deps.gmail.list = async () => {
      throw new GmailError("Gmail returned 500", 500);
    };
    w.db.request("eval_import_requested");
    expect((await w.run()).status).toBe(502);
    expect(order.some((o) => o.startsWith("listRefs"))).toBe(false);
  });
});
