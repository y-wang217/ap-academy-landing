import { describe, expect, it, vi } from "vitest";
import { handleIrisSettings, handleRunNow, loadInbox, loadIrisSettings, type IrisAdminDeps, type IrisReader } from "../../../lib/iris/handlers";
import type { SchedulerIdentity } from "../../../lib/scheduler/identity";

// REQ-42 AC23, AC27: the owner-only Iris routes and page loaders.
const ORG = "10000000-0000-0000-0000-00000000aaaa";
const S1 = "11111111-1111-4111-8111-111111111111";
const ryan = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001", name: "Ryan", email: "ryan@example.com", functions: ["Teacher"], status: "Active", subjects: [] };
const ADMIN: SchedulerIdentity = { scope: "admin", orgId: ORG, staff: null };
const NOT_OWNERS: [string, SchedulerIdentity][] = [
  ["grade teacher", { scope: "none" }],
  ["scheduling teacher", { scope: "teacher", orgId: ORG, staff: ryan }],
  ["student", { scope: "none" }],
  ["parent", { scope: "none" }],
];

function fakeReader(over: Partial<IrisReader> = {}) {
  const calls: string[] = [];
  const spy = <T,>(name: string, v: T) => async (..._a: unknown[]) => (calls.push(name), v);
  const reader: IrisReader = {
    getSettings: spy("getSettings", { paused: true, mailbox: null, lastPollAt: null, lastPollResult: null, lastError: null }),
    lastRun: spy("lastRun", null),
    listNeedsYou: spy("listNeedsYou", [
      { id: "m1", gmailThreadId: "g1", fromEmail: "ann@example.com", subject: "Question", snippet: "Hi", receivedAt: "2026-10-20T10:00:00Z", state: "escalated" as const, escalationReason: "unknown_sender", notionStudentIds: [] },
    ]),
    listRecent: spy("listRecent", [
      { id: "m2", gmailThreadId: "g2", fromEmail: "pat@example.com", subject: "Re: Tuesday", snippet: "ok", receivedAt: "2026-10-20T11:00:00Z", state: "matched" as const, escalationReason: null, notionStudentIds: [S1] },
    ]),
    updatePaused: spy("updatePaused", 1),
    ...over,
  };
  return { reader, calls };
}

function deps(identity: SchedulerIdentity, over: Partial<IrisReader> = {}) {
  const r = fakeReader(over);
  const readerFor = vi.fn((_org: string) => r.reader);
  const d: IrisAdminDeps = { identity: async () => identity, reader: readerFor };
  return { d, readerFor, calls: r.calls };
}

describe("PATCH /api/iris/settings", () => {
  for (const [who, identity] of NOT_OWNERS) {
    it(`a ${who} gets 403 and nothing is read`, async () => {
      const w = deps(identity);
      const res = await handleIrisSettings(w.d, { paused: true });
      expect(res.status).toBe(403);
      expect(w.readerFor).not.toHaveBeenCalled();
    });
  }

  it("signed out is 401", async () => {
    const w = deps({ scope: "signed_out" });
    expect((await handleIrisSettings(w.d, { paused: true })).status).toBe(401);
    expect(w.readerFor).not.toHaveBeenCalled();
  });

  it("the owner pauses", async () => {
    const w = deps(ADMIN);
    const res = await handleIrisSettings(w.d, { paused: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ paused: true });
    expect(w.readerFor).toHaveBeenCalledWith(ORG);
  });

  it("unpause needs confirmed: true", async () => {
    const w = deps(ADMIN);
    const refused = await handleIrisSettings(w.d, { paused: false });
    expect(refused.status).toBe(400);
    expect(await refused.json()).toEqual({ error: "confirm_required" });
    expect(w.calls).not.toContain("updatePaused");
    const ok = await handleIrisSettings(w.d, { paused: false, confirmed: true });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ paused: false });
  });

  it("refuses an unknown field or a bad body with 400", async () => {
    const w = deps(ADMIN);
    expect((await handleIrisSettings(w.d, { paused: true, sending_enabled: true })).status).toBe(400);
    expect((await handleIrisSettings(w.d, null)).status).toBe(400);
  });

  it("zero rows updated is 403; a failed update is 503", async () => {
    expect((await handleIrisSettings(deps(ADMIN, { updatePaused: async () => 0 }).d, { paused: true })).status).toBe(403);
    const failed = await handleIrisSettings(deps(ADMIN, { updatePaused: async () => { throw new Error("x"); } }).d, { paused: true });
    expect(failed.status).toBe(503);
    expect(await failed.json()).toEqual({ error: "iris_unavailable" });
  });
});

describe("POST /api/iris/run-now", () => {
  const runResponse = { result: "ok", runId: "r1", seen: 1, stored: 1, matched: 1, escalated: 0, skipped: 0, failed: 0, purged: 0 };
  const fetcherOf = (status: number, body: unknown) => vi.fn(async (_u: string, _i?: RequestInit) => new Response(JSON.stringify(body), { status }));

  for (const [who, identity] of NOT_OWNERS) {
    it(`a ${who} gets 403 and nothing is fetched`, async () => {
      const fetcher = fetcherOf(200, runResponse);
      const res = await handleRunNow({ identity: async () => identity, secret: "s", runUrl: "http://t/tracker/api/iris/run", fetcher: fetcher as unknown as typeof fetch });
      expect(res.status).toBe(403);
      expect(fetcher).not.toHaveBeenCalled();
    });
  }

  it("signed out is 401", async () => {
    const fetcher = fetcherOf(200, runResponse);
    expect((await handleRunNow({ identity: async () => ({ scope: "signed_out" }), secret: "s", runUrl: "u", fetcher: fetcher as unknown as typeof fetch })).status).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("posts to the run URL with the bearer and relays a 200", async () => {
    const fetcher = fetcherOf(200, runResponse);
    const res = await handleRunNow({ identity: async () => ADMIN, secret: "s3cret", runUrl: "http://t/tracker/api/iris/run", fetcher: fetcher as unknown as typeof fetch });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(runResponse);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("http://t/tracker/api/iris/run");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer s3cret");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("relays a 502 failed run", async () => {
    const fetcher = fetcherOf(502, { ...runResponse, result: "failed" });
    const res = await handleRunNow({ identity: async () => ADMIN, secret: "s", runUrl: "u", fetcher: fetcher as unknown as typeof fetch });
    expect(res.status).toBe(502);
    expect((await res.json()).result).toBe("failed");
  });

  it("no secret is 503", async () => {
    const fetcher = fetcherOf(200, runResponse);
    const res = await handleRunNow({ identity: async () => ADMIN, secret: undefined, runUrl: "u", fetcher: fetcher as unknown as typeof fetch });
    expect(res.status).toBe(503);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("an unreachable run is 503 iris_unavailable", async () => {
    const fetcher = vi.fn(async () => { throw new Error("down"); });
    const res = await handleRunNow({ identity: async () => ADMIN, secret: "s", runUrl: "u", fetcher: fetcher as unknown as typeof fetch });
    expect(res.status).toBe(503);
  });
});

describe("page loaders", () => {
  for (const [who, identity] of [...NOT_OWNERS, ["signed out", { scope: "signed_out" }] as [string, SchedulerIdentity]]) {
    it(`a ${who} is sent away before any read`, async () => {
      const w = deps(identity);
      const names = vi.fn(async () => new Map<string, string>());
      expect(await loadInbox({ ...w.d, studentNames: names })).toEqual({ kind: "denied" });
      expect(await loadIrisSettings(w.d, [])).toEqual({ kind: "denied" });
      expect(w.readerFor).not.toHaveBeenCalled();
      expect(names).not.toHaveBeenCalled();
    });
  }

  it("an unavailable identity is an error, not a redirect", async () => {
    const w = deps({ scope: "unavailable" });
    expect(await loadInbox({ ...w.d, studentNames: async () => new Map() })).toEqual({ kind: "error" });
  });

  it("the owner gets both lists with family labels", async () => {
    const w = deps(ADMIN);
    const inbox = await loadInbox({ ...w.d, studentNames: async () => new Map([[S1, "Sam Lee"]]) });
    expect(inbox.kind).toBe("ok");
    if (inbox.kind !== "ok") return;
    expect(inbox.paused).toBe(true);
    expect(inbox.needsYou.map((r) => r.family)).toEqual(["ann@example.com"]);
    expect(inbox.recent.map((r) => r.family)).toEqual(["Sam Lee"]);
  });

  it("a student not in the names map shows as Paused student", async () => {
    const w = deps(ADMIN);
    const inbox = await loadInbox({ ...w.d, studentNames: async () => new Map() });
    if (inbox.kind !== "ok") throw new Error("expected ok");
    expect(inbox.recent[0].family).toBe("Paused student");
  });

  it("a failed read is an error", async () => {
    const w = deps(ADMIN, { listRecent: async () => { throw new Error("x"); } });
    expect(await loadInbox({ ...w.d, studentNames: async () => new Map() })).toEqual({ kind: "error" });
  });

  it("settings carry the state, the last run and the missing env names", async () => {
    const w = deps(ADMIN);
    const s = await loadIrisSettings(w.d, ["IRIS_GMAIL_PRIVATE_KEY"]);
    expect(s).toEqual({ kind: "ok", paused: true, lastRun: null, lastError: null, missing: ["IRIS_GMAIL_PRIVATE_KEY"] });
  });
});
