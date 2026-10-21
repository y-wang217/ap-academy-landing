import { describe, expect, it, vi } from "vitest";
import { handleIrisRun, type IrisRunDeps } from "./handlers";
import { GmailError, type GmailMessage } from "./gmail";
import type { GmailPort } from "./intake";
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

function world(opts: { paused?: boolean; listFails?: boolean } = {}) {
  const db = fakeIrisStore({ paused: opts.paused ?? false });
  const gmailCalls: string[] = [];
  const gmail: GmailPort = {
    token: async () => (gmailCalls.push("token"), "tok"),
    list: async () => {
      gmailCalls.push("list");
      if (opts.listFails) throw new GmailError("Gmail returned 403", 403);
      return ["m1"];
    },
    get: async (_t, id) => (gmailCalls.push(`get:${id}`), message(id, "who@z.com")),
  };
  const directoryCalls: number[] = [];
  const deps: IrisRunDeps = { store: db.store, gmail, directory: async () => (directoryCalls.push(1), []), mailbox: "charlie@apacademy.ca" };
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
