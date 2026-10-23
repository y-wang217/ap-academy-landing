import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { Db } from "../../../lib/data/client";
import type { Viewer } from "../../../lib/data/queries";
import { handleConsoleHealth, handleConsoleOutcome, handleConsoleSales, handleConsoleSignals, type SignalSources } from "../../../lib/console/handlers";
import { fakeOutcomeStore } from "../../../lib/console/outcome-store.fake";
import { fakeLeadWriter } from "../../../lib/notion/lead-writer.fake";
import type { OperationsPanels } from "../../../lib/console/operations";
import { SignalsViewSchema } from "../../../lib/console/signals";
import { SalesViewSchema } from "../../../lib/console/sales-view";
import type { FacadeDeps, NotionPorts } from "../../../lib/console/facade";
import type { OwnerViewer } from "../../../lib/console/guard";
import { consoleFreshness } from "../../../lib/console/providers";

// REQ-53 AC1, AC3, AC5: the console JSON boundary.
const ORG = "10000000-0000-0000-0000-00000000aaaa";
const base = { userId: "u1", email: "x@example.com" };
const NOW = new Date("2026-10-22T12:00:00.000Z");

function fakeDb(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn<(fn: string, args: unknown) => Promise<typeof result>>(async () => result);
  return { db: { tracker: { rpc } } as unknown as Db, rpc };
}

// REQ-54: the facade behind the owner's health check, over fake ports.
const SENTINEL = "Sam Sentinel";
const S1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001";
const SOURCES = { leads: "fe3d651a", touches: "772939bd", trialLessons: "6300f58a", work: "3031b455", invoices: "be0f91e4" };
const ok = <T,>(rows: T[]) => ({ rows, complete: true, skipped: 0, pages: 1 });
function fakePorts(over: Partial<NotionPorts> = {}): NotionPorts {
  return {
    leads: async () => ok([{ id: S1, createdAt: null, name: SENTINEL, stage: "New", ownerStaffId: null, nextAction: null, nextActionDue: null, attempts: null, lastContact: null, source: null, lostReason: null, contactedAt: null, trialBookedAt: null, trialAttendedAt: null, closedAt: null, trialTime: null, trialTeacherId: null, level: null, hasMajorGaps: false, recommendedPlan: null, hasTrialSummary: false, parentName: "Parent Sentinel", leadId: null, grade: null, subjects: [], majorGaps: null, trialSummary: null }]),
    touches: async () => ok([]),
    trialLessons: async () => ok([]),
    work: async () => ok([{ id: S1, name: "Work Sentinel", area: null, state: "Next", type: null, dueReview: null, owner: null, taskTypes: [], parentProjectIds: [], expectedResult: null }]),
    invoices: async () => ok([]),
    ...over,
  };
}
function fakeDeps(over: Partial<FacadeDeps> = {}) {
  return vi.fn((viewer: OwnerViewer, now: () => Date): FacadeDeps => ({
    orgId: viewer.orgId, now, sources: SOURCES, notion: fakePorts(), timeoutMs: 8_000, maxPages: 10, touchesPerStudent: 5, touchesWindowDays: 90,
    people: async () => ({ students: [{ id: S1, name: SENTINEL, stage: "New", active: true }], staff: [], syncedAt: new Date(now().getTime() - 60_000).toISOString() }),
    freshness: new Map(),
    ...over,
  }));
}

async function call(viewer: Viewer, deps = fakeDeps(), now = NOW) {
  const res = await handleConsoleHealth({ viewer: async () => viewer, now: () => now, deps });
  return { res, text: await res.text(), deps };
}

describe("GET /api/console/health", () => {
  const denied: [string, (db: Db) => Viewer][] = [
    ["grade teacher", (db) => ({ kind: "staff", ...base, orgId: ORG, role: "teacher", db })],
    ["student", (db) => ({ kind: "student", ...base, studentId: "s1", db })],
    ["parent", (db) => ({ kind: "parent", ...base, db })],
    ["role-less user (also a scheduling teacher or a revoked link)", () => ({ kind: "none", ...base })],
  ];
  for (const [who, make] of denied) {
    it(`a ${who} gets 403 and no database call`, async () => {
      const f = fakeDb({ data: true, error: null });
      const { res, text, deps } = await call(make(f.db));
      expect(res.status).toBe(403);
      expect(text).toBe('{"error":"forbidden"}');
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(f.rpc).not.toHaveBeenCalled();
      expect(deps).not.toHaveBeenCalled();
    });
  }

  it("signed out is 401", async () => {
    const { res, text } = await call({ kind: "signed_out" });
    expect(res.status).toBe(401);
    expect(text).toBe('{"error":"unauthenticated"}');
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("not configured is 503", async () => {
    const { res, text } = await call({ kind: "not_configured" });
    expect(res.status).toBe(503);
    expect(text).toBe('{"error":"console_not_configured"}');
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("the owner gets 200 after is_org_owner on their own client, with exactly the AC9 shape", async () => {
    const f = fakeDb({ data: true, error: null });
    const { res, text, deps } = await call({ kind: "staff", ...base, orgId: ORG, role: "owner", db: f.db });
    expect(res.status).toBe(200);
    const body = JSON.parse(text);
    expect(Object.keys(body).sort()).toEqual(["checkedAt", "providers", "status"]);
    expect(body.status).toBe("ok");
    expect(body.checkedAt).toBe(NOW.toISOString());
    expect(Object.keys(body.providers).sort()).toEqual(["invoices", "leads", "people", "touches", "trialLessons", "work"]);
    for (const p of Object.values(body.providers)) {
      expect(Object.keys(p as object).sort()).toEqual(["errorMessage", "lastCheckedAt", "lastSuccessfulFetchAt", "staleReason", "status"]);
      expect(["ready", "empty"]).toContain((p as { status: string }).status);
    }
    expect(text).not.toMatch(/Sentinel|count|"data"/);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(f.rpc).toHaveBeenCalledTimes(1);
    expect(f.rpc).toHaveBeenCalledWith("is_org_owner", { target_org: ORG });
    expect(deps).toHaveBeenCalledTimes(1);
  });

  it("one failed provider makes the top status degraded, the rest still report", async () => {
    const f = fakeDb({ data: true, error: null });
    const deps = fakeDeps({ notion: fakePorts({ invoices: async () => { throw new Error("x"); } }) });
    const { res, text } = await call({ kind: "staff", ...base, orgId: ORG, role: "owner", db: f.db }, deps);
    expect(res.status).toBe(200);
    const body = JSON.parse(text);
    expect(body.status).toBe("degraded");
    expect(body.providers.invoices).toEqual({ status: "error", lastCheckedAt: NOW.toISOString(), lastSuccessfulFetchAt: null, staleReason: null, errorMessage: "Read failed" });
    expect(body.providers.leads.status).toBe("ready");
  });

  it("freshness carries over between requests through consoleFreshness", async () => {
    const f = fakeDb({ data: true, error: null });
    const owner: Viewer = { kind: "staff", ...base, orgId: "10000000-0000-0000-0000-00000000f00d", role: "owner", db: f.db };
    let fail = false;
    const deps = fakeDeps({ freshness: consoleFreshness, notion: fakePorts({ leads: async () => { if (fail) throw new Error("x"); return ok([]); } }) });
    await call(owner, deps, NOW);
    fail = true;
    const T2 = new Date("2026-10-22T12:10:00.000Z");
    const second = JSON.parse((await call(owner, deps, T2)).text);
    expect(second.providers.leads).toMatchObject({ status: "error", lastCheckedAt: T2.toISOString(), lastSuccessfulFetchAt: NOW.toISOString() });
  });

  it("is_org_owner false is 403", async () => {
    const f = fakeDb({ data: false, error: null });
    const { res, text } = await call({ kind: "staff", ...base, orgId: ORG, role: "owner", db: f.db });
    expect(res.status).toBe(403);
    expect(text).toBe('{"error":"forbidden"}');
  });

  it("an rpc error is 503 console_unavailable", async () => {
    const f = fakeDb({ data: null, error: { message: "boom" } });
    const { res, text } = await call({ kind: "staff", ...base, orgId: ORG, role: "owner", db: f.db });
    expect(res.status).toBe(503);
    expect(text).toBe('{"error":"console_unavailable"}');
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("a throwing rpc or viewer is 503, never a throw", async () => {
    const rpc = vi.fn(async () => { throw new Error("network"); });
    const db = { tracker: { rpc } } as unknown as Db;
    expect((await call({ kind: "staff", ...base, orgId: ORG, role: "owner", db })).res.status).toBe(503);
    const res = await handleConsoleHealth({ viewer: async () => { throw new Error("cookies"); }, now: () => NOW, deps: fakeDeps() });
    expect(res.status).toBe(503);
    expect(await res.text()).toBe('{"error":"console_unavailable"}');
  });
});

describe("console routes", () => {
  const root = __dirname;
  const routes = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? routes(p) : n === "route.ts" ? [p] : [];
    });

  it("there is at least one route and each calls a handler from lib/console/handlers", () => {
    const found = routes(root);
    expect(found.length).toBeGreaterThan(0);
    for (const f of found) {
      const src = readFileSync(f, "utf8");
      expect(src, f).toMatch(/from "@\/lib\/console\/handlers"/);
      expect(src, f).toMatch(/handleConsole\w+\(/);
      expect(src, f).toContain('export const dynamic = "force-dynamic"');
    }
  });

  it("every console route answers GET only, except the outcomes write (REQ-61), which is POST only", () => {
    for (const f of routes(root)) {
      const src = readFileSync(f, "utf8");
      const write = f.endsWith(join("outcomes", "route.ts"));
      expect([...src.matchAll(/export (?:async )?function (\w+)/g)].map((m) => m[1]), f).toEqual([write ? "POST" : "GET"]);
      expect(src, f).not.toMatch(/export const (POST|PUT|PATCH|DELETE)\b/);
    }
  });

  it("the health and sales routes pass createConsoleDeps", () => {
    expect(readFileSync(join(root, "health", "route.ts"), "utf8")).toMatch(/deps: createConsoleDeps/);
    expect(readFileSync(join(root, "sales", "route.ts"), "utf8")).toMatch(/handleConsoleSales\(\{ viewer: getViewer, deps: createConsoleDeps \}\)/);
    expect(readFileSync(join(root, "signals", "route.ts"), "utf8")).toMatch(/handleConsoleSignals\(\{ viewer: getViewer, deps: createConsoleDeps, sources: createSignalSources \}\)/);
  });
});

// REQ-57 AC11: the sales route behind the same owner gate.
describe("GET /api/console/sales", () => {
  const sales = async (viewer: Viewer, deps = fakeDeps()) => {
    const res = await handleConsoleSales({ viewer: async () => viewer, now: () => NOW, deps });
    return { res, text: await res.text(), deps };
  };
  const owner = (db: Db): Viewer => ({ kind: "staff", ...base, orgId: ORG, role: "owner", db });

  it("the owner gets 200, no-store, a body that parses with the schema and has no other key", async () => {
    const f = fakeDb({ data: true, error: null });
    const { res, text } = await sales(owner(f.db));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = JSON.parse(text);
    expect(SalesViewSchema.parse(body)).toEqual(body);
    expect(Object.keys(body).sort()).toEqual(["queue", "radar"]);
    expect(body.queue.data.items.map((i: { name: string }) => i.name)).toEqual([SENTINEL]);
    expect(text).not.toMatch(/Parent Sentinel|parentName/);
    expect(f.rpc).toHaveBeenCalledWith("is_org_owner", { target_org: ORG });
  });

  const denied: [string, (db: Db) => Viewer][] = [
    ["grade teacher", (db) => ({ kind: "staff", ...base, orgId: ORG, role: "teacher", db })],
    ["student", (db) => ({ kind: "student", ...base, studentId: "s1", db })],
    ["parent", (db) => ({ kind: "parent", ...base, db })],
    ["role-less user", () => ({ kind: "none", ...base })],
  ];
  for (const [who, make] of denied) {
    it(`a ${who} gets 403 and nothing is read`, async () => {
      const f = fakeDb({ data: true, error: null });
      const { res, text, deps } = await sales(make(f.db));
      expect([res.status, text]).toEqual([403, '{"error":"forbidden"}']);
      expect(f.rpc).not.toHaveBeenCalled();
      expect(deps).not.toHaveBeenCalled();
    });
  }

  it("is_org_owner false is 403, an rpc error or a throwing viewer is 503", async () => {
    expect((await sales(owner(fakeDb({ data: false, error: null }).db))).res.status).toBe(403);
    expect((await sales(owner(fakeDb({ data: null, error: { message: "x" } }).db))).text).toBe('{"error":"console_unavailable"}');
    const res = await handleConsoleSales({ viewer: async () => { throw new Error("x"); }, now: () => NOW, deps: fakeDeps() });
    expect(res.status).toBe(503);
  });
});

// REQ-62 AC5: the signals route behind the same owner gate, and nothing private in its body.
describe("GET /api/console/signals", () => {
  const empty = <T,>(panel: string, data: T) => ({
    panel, status: "empty" as const, data, count: 0, lastCheckedAt: NOW.toISOString(), lastSuccessfulFetchAt: NOW.toISOString(), staleReason: null, errorMessage: null, sourceEvidence: [],
  });
  const fakeSources = () => vi.fn((): SignalSources => ({
    operations: async () => ({
      teacherLoad: empty("teacherLoad", null), upcoming: empty("upcoming", []), capacity: empty("capacity", null),
      lessonGaps: empty("lessonGaps", { window: { from: "a", to: "b", days: 14, label: "" }, gaps: [], moreGaps: 0, noShows: [], moreNoShows: 0, pendingLogs: 0, toggle: { href: "?", label: "" }, unlinkedHref: "/" }),
    }) as unknown as OperationsPanels,
    outbox: async () => ({ ok: true, checkedAt: NOW.toISOString(), rows: [{ id: "o1", kind: "summary", finishedAt: null, last_error: "Sentinel error for parent@example.com" } as never] }),
    teaching: async () => ({ state: "free" }),
  }));
  const signals = async (viewer: Viewer, deps = fakeDeps(), sources = fakeSources()) => {
    const res = await handleConsoleSignals({ viewer: async () => viewer, now: () => NOW, deps, sources });
    return { res, text: await res.text(), deps, sources };
  };
  const owner = (db: Db): Viewer => ({ kind: "staff", ...base, orgId: ORG, role: "owner", db });
  const LEAD = { createdAt: new Date(NOW.getTime() - 3_600_000).toISOString(), parentPhone: "555-0177", parentEmail: "parent@example.com" };

  it("the owner gets 200, no-store, a schema-shaped body with no phone, email or last_error", async () => {
    const f = fakeDb({ data: true, error: null });
    const ports = fakePorts({ leads: async () => ok([{ ...(await fakePorts().leads({} as never)).rows[0], ...LEAD }]) });
    const { res, text, sources } = await signals(owner(f.db), fakeDeps({ notion: ports }));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = JSON.parse(text);
    expect(SignalsViewSchema.parse(body)).toEqual(body);
    expect(Object.keys(body).sort()).toEqual(["checkedAt", "checks", "health", "protectedTime", "signals"]);
    expect(body.signals.map((s: { kind: string; title: string }) => `${s.kind} ${s.title}`)).toContain(`fresh_lead ${SENTINEL}`);
    expect(text).not.toMatch(/555-0177|@|Sentinel error|Parent Sentinel/);
    expect(f.rpc).toHaveBeenCalledWith("is_org_owner", { target_org: ORG });
    expect(sources).toHaveBeenCalledTimes(1);
  });

  const denied: [string, (db: Db) => Viewer, number, string][] = [
    ["grade teacher", (db) => ({ kind: "staff", ...base, orgId: ORG, role: "teacher", db }), 403, '{"error":"forbidden"}'],
    ["student", (db) => ({ kind: "student", ...base, studentId: "s1", db }), 403, '{"error":"forbidden"}'],
    ["parent", (db) => ({ kind: "parent", ...base, db }), 403, '{"error":"forbidden"}'],
    ["role-less user", () => ({ kind: "none", ...base }), 403, '{"error":"forbidden"}'],
    ["signed-out request", () => ({ kind: "signed_out" }), 401, '{"error":"unauthenticated"}'],
    ["not-configured request", () => ({ kind: "not_configured" }), 503, '{"error":"console_not_configured"}'],
  ];
  for (const [who, make, status, body] of denied) {
    it(`a ${who} gets ${status} with the fixed body and nothing is read`, async () => {
      const f = fakeDb({ data: true, error: null });
      const { res, text, deps, sources } = await signals(make(f.db));
      expect([res.status, text]).toEqual([status, body]);
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(f.rpc).not.toHaveBeenCalled();
      expect(deps).not.toHaveBeenCalled();
      expect(sources).not.toHaveBeenCalled();
    });
  }

  it("is_org_owner false is 403, an rpc error or a throwing source is 503", async () => {
    expect((await signals(owner(fakeDb({ data: false, error: null }).db))).res.status).toBe(403);
    expect((await signals(owner(fakeDb({ data: null, error: { message: "x" } }).db))).text).toBe('{"error":"console_unavailable"}');
    const throwing = vi.fn((): SignalSources => { throw new Error("x"); });
    const { res, text } = await signals(owner(fakeDb({ data: true, error: null }).db), fakeDeps(), throwing);
    expect([res.status, text]).toEqual([503, '{"error":"console_unavailable"}']);
  });
});

// REQ-61 AC5: POST /api/console/outcomes, the console's one write route.
describe("POST /api/console/outcomes", () => {
  const PAGE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa00f1";
  const STAFF = "cccccccc-cccc-4ccc-8ccc-cccccccc0001";
  const EDITED = "2026-10-22T11:00:00.000Z";
  const valid = (over: Record<string, unknown> = {}) => ({
    requestId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0001", pageId: PAGE, outcome: "no_answer",
    expected: { stage: "Working", attempts: 1, lastEditedAt: EDITED }, note: "Left a message", ...over,
  });
  function rig(rpc: (fn: string) => { data: unknown; error: unknown } = (fn) => ({ data: fn === "my_staff_id" ? STAFF : true, error: null })) {
    const calls: string[] = [];
    const db = { tracker: { rpc: vi.fn(async (fn: string) => (calls.push(fn), rpc(fn))) } } as unknown as Db;
    const notion = fakeLeadWriter({ id: PAGE, stage: "Working", attempts: 1, lastEditedAt: EDITED }, () => NOW);
    const log = fakeOutcomeStore(() => NOW);
    const deps = vi.fn(() => ({ store: log.store, writer: notion.writer }));
    return { db, calls, notion, log, deps };
  }
  const post = async (viewer: Viewer, r: ReturnType<typeof rig>, body: unknown = valid()) => {
    const request = new Request("http://localhost/tracker/api/console/outcomes", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });
    const res = await handleConsoleOutcome({ viewer: async () => viewer, request, now: () => NOW, deps: r.deps });
    return { res, text: await res.text() };
  };
  const owner = (db: Db): Viewer => ({ kind: "staff", ...base, orgId: ORG, role: "owner", db });

  const denied: [string, (db: Db) => Viewer, number, string][] = [
    ["grade teacher", (db) => ({ kind: "staff", ...base, orgId: ORG, role: "teacher", db }), 403, '{"error":"forbidden"}'],
    ["student", (db) => ({ kind: "student", ...base, studentId: "s1", db }), 403, '{"error":"forbidden"}'],
    ["parent", (db) => ({ kind: "parent", ...base, db }), 403, '{"error":"forbidden"}'],
    ["role-less user", () => ({ kind: "none", ...base }), 403, '{"error":"forbidden"}'],
    ["signed-out request", () => ({ kind: "signed_out" }), 401, '{"error":"unauthenticated"}'],
    ["not-configured request", () => ({ kind: "not_configured" }), 503, '{"error":"console_not_configured"}'],
  ];
  for (const [who, make, status, body] of denied) {
    it(`a ${who} gets ${status}, and nothing touches Notion or the transition log`, async () => {
      const r = rig();
      const { res, text } = await post(make(r.db), r);
      expect([res.status, text]).toEqual([status, body]);
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(r.calls).toEqual([]);
      expect(r.deps).not.toHaveBeenCalled();
      expect(r.notion.log).toEqual([]);
      expect(r.log.calls).toEqual([]);
    });
  }

  it("an owner whose is_org_owner says false is 403 before any write", async () => {
    const r = rig((fn) => ({ data: fn === "is_org_owner" ? false : STAFF, error: null }));
    const { res } = await post(owner(r.db), r);
    expect(res.status).toBe(403);
    expect(r.deps).not.toHaveBeenCalled();
  });

  for (const [what, body] of [
    ["not JSON", "{"],
    ["an unknown key", valid({ lastPaymentDate: "2026-10-01" })],
    ["an unknown outcome", valid({ outcome: "paid" })],
    ["a note over 2000 characters", valid({ note: "x".repeat(2001) })],
    ["a bad page id", valid({ pageId: "not-a-page" })],
    ["no expected values", valid({ expected: undefined })],
    ["an unlisted next action", valid({ outcome: "follow_up", nextAction: "Assign teacher", due: "2026-10-23T18:00:00.000Z" })],
  ] as const) {
    it(`a body with ${what} is 400 and writes nothing`, async () => {
      const r = rig();
      const { res, text } = await post(owner(r.db), r, body);
      expect([res.status, text]).toEqual([400, '{"error":"bad_request"}']);
      expect(r.notion.log).toEqual([]);
      expect(r.log.calls).toEqual([]);
    });
  }

  it("the owner logs an outcome: 200 with the read-back, the staff id from their own client", async () => {
    const r = rig();
    const { res, text } = await post(owner(r.db), r);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = JSON.parse(text);
    expect(body).toMatchObject({ status: "done", cadenceUsedUp: false, staffLinked: true, result: { stage: "Working", attempts: 2 } });
    expect(r.calls).toEqual(["is_org_owner", "my_staff_id"]);
    expect(r.notion.touches[0].input.staffId).toBe(STAFF);
  });

  it("maps each run result to its status", async () => {
    const r = rig();
    expect((await post(owner(r.db), r, valid({ expected: { stage: "New", attempts: 1, lastEditedAt: EDITED } }))).res.status).toBe(409);
    expect((await post(owner(r.db), r, valid({ outcome: "won" }))).res.status).toBe(422);
    r.notion.state.missing = ["Txn ID"];
    const notReady = await post(owner(r.db), r);
    expect([notReady.res.status, notReady.text]).toEqual([503, '{"error":"notion_not_ready","missing":["Txn ID"]}']);
    r.notion.state.missing = [];
    r.notion.faults.patch = ["timeout-after"];
    expect((await post(owner(r.db), r)).res.status).toBe(202);
    const blocked = await post(owner(r.db), r, valid({ requestId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0002" }));
    expect([blocked.res.status, JSON.parse(blocked.text)]).toEqual([409, { error: "unresolved_transition", requestId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0001" }]);
    const r2 = rig();
    r2.notion.faults.patch = ["400"];
    expect((await post(owner(r2.db), r2)).res.status).toBe(502);
  });

  it("no Notion token is 503 notion_not_ready, with no write", async () => {
    const r = rig();
    const request = new Request("http://localhost/x", { method: "POST", body: JSON.stringify(valid()) });
    const res = await handleConsoleOutcome({ viewer: async () => owner(r.db), request, now: () => NOW, deps: () => null });
    expect([res.status, await res.text()]).toEqual([503, '{"error":"notion_not_ready","missing":["NOTION_TOKEN"]}']);
  });

  it("is POST only", () => {
    const src = readFileSync(join(__dirname, "outcomes/route.ts"), "utf8");
    expect(src).toMatch(/export async function POST/);
    expect(src).not.toMatch(/export async function (GET|PUT|PATCH|DELETE)/);
  });
});
