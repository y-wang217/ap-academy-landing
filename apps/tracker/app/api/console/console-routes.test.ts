import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { Db } from "../../../lib/data/client";
import type { Viewer } from "../../../lib/data/queries";
import { handleConsoleHealth } from "../../../lib/console/handlers";

// REQ-53 AC1, AC3, AC5: the console JSON boundary.
const ORG = "10000000-0000-0000-0000-00000000aaaa";
const base = { userId: "u1", email: "x@example.com" };
const NOW = new Date("2026-10-22T12:00:00.000Z");

function fakeDb(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn(async (_fn: string, _args: unknown) => result);
  return { db: { tracker: { rpc } } as unknown as Db, rpc };
}

async function call(viewer: Viewer) {
  const res = await handleConsoleHealth({ viewer: async () => viewer, now: () => NOW });
  return { res, text: await res.text() };
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
      const { res, text } = await call(make(f.db));
      expect(res.status).toBe(403);
      expect(text).toBe('{"error":"forbidden"}');
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(f.rpc).not.toHaveBeenCalled();
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

  it("the owner gets 200 after is_org_owner on their own client", async () => {
    const f = fakeDb({ data: true, error: null });
    const { res, text } = await call({ kind: "staff", ...base, orgId: ORG, role: "owner", db: f.db });
    expect(res.status).toBe(200);
    expect(JSON.parse(text)).toEqual({ status: "ok", checkedAt: NOW.toISOString() });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(f.rpc).toHaveBeenCalledTimes(1);
    expect(f.rpc).toHaveBeenCalledWith("is_org_owner", { target_org: ORG });
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
    const res = await handleConsoleHealth({ viewer: async () => { throw new Error("cookies"); }, now: () => NOW });
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

  it("the health route answers GET only", () => {
    const src = readFileSync(join(root, "health", "route.ts"), "utf8");
    expect([...src.matchAll(/export (?:async )?function (\w+)/g)].map((m) => m[1])).toEqual(["GET"]);
  });
});
