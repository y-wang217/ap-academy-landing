import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { Db } from "../../../lib/data/client";
import type { Viewer } from "../../../lib/data/queries";
import { handleConsoleHealth, handleConsoleSales } from "../../../lib/console/handlers";
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

  it("every console route answers GET only", () => {
    for (const f of routes(root)) {
      const src = readFileSync(f, "utf8");
      expect([...src.matchAll(/export (?:async )?function (\w+)/g)].map((m) => m[1]), f).toEqual(["GET"]);
      expect(src, f).not.toMatch(/export const (POST|PUT|PATCH|DELETE)\b/);
    }
  });

  it("the health and sales routes pass createConsoleDeps", () => {
    expect(readFileSync(join(root, "health", "route.ts"), "utf8")).toMatch(/deps: createConsoleDeps/);
    expect(readFileSync(join(root, "sales", "route.ts"), "utf8")).toMatch(/handleConsoleSales\(\{ viewer: getViewer, deps: createConsoleDeps \}\)/);
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
