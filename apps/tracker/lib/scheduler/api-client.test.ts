import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { SCHEDULER_API, createApiClient } from "./api-client";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("api-client (AC11)", () => {
  it("SCHEDULER_API equals the app's basePath plus /api/scheduler", () => {
    const cfg = readFileSync(resolve(__dirname, "../../next.config.ts"), "utf8");
    const base = /basePath:\s*"([^"]+)"/.exec(cfg)?.[1];
    expect(SCHEDULER_API).toBe(`${base}/api/scheduler`);
  });
  it("a non-2xx answer is ok:false with a message", async () => {
    const c = createApiClient(vi.fn(async () => json(500, { error: "boom" })) as never);
    expect(await c.send("POST", "/windows", "k", { a: 1 })).toMatchObject({ ok: false, stale: false });
  });
  it("a thrown fetch is ok:false", async () => {
    const c = createApiClient(vi.fn(async () => { throw new TypeError("offline"); }) as never);
    const r = await c.send("POST", "/windows", "k", {});
    expect(r.ok).toBe(false);
  });
  it("409 maps to stale", async () => {
    const c = createApiClient(vi.fn(async () => json(409, { error: "stale" })) as never);
    expect(await c.send("PATCH", "/windows/1", "k", {})).toMatchObject({ ok: false, stale: true });
  });
  it("a retry of the same action reuses its requestId; success frees it", async () => {
    const seen: string[] = [];
    let fail = true;
    const fetchFn = vi.fn(async (_u: string, init: RequestInit) => {
      seen.push(JSON.parse(init.body as string).requestId);
      return fail ? json(503, {}) : json(201, { ok: true });
    });
    const c = createApiClient(fetchFn as never);
    await c.send("POST", "/windows", "add:mon:9-12", { x: 1 });
    await c.send("POST", "/windows", "add:mon:9-12", { x: 1 });
    fail = false;
    await c.send("POST", "/windows", "add:mon:9-12", { x: 1 });
    await c.send("POST", "/windows", "add:mon:9-12", { x: 1 });
    expect(seen[0]).toBe(seen[1]);
    expect(seen[1]).toBe(seen[2]);
    expect(seen[3]).not.toBe(seen[2]);
    expect(fetchFn.mock.calls[0][0]).toBe(`${SCHEDULER_API}/windows`);
  });
  it("DELETE sends no body; GET parses json", async () => {
    const fetchFn = vi.fn(async () => json(200, { ok: true }));
    const c = createApiClient(fetchFn as never);
    await c.send("DELETE", "/windows/1", "k");
    expect((fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1].body).toBeUndefined();
    expect(await c.get("/availability?x=1")).toEqual({ ok: true, data: { ok: true } });
  });
});
