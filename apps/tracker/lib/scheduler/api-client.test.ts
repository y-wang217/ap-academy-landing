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
  it("DELETE sends its JSON body with the requestId (REQ-7 AC20: the cancel endpoint needs one); GET parses json", async () => {
    const fetchFn = vi.fn(async () => json(200, { ok: true }));
    const c = createApiClient(fetchFn as never);
    await c.send("DELETE", "/classes/s/occurrences/2026-10-26", "k", { scope: "this" });
    const body = JSON.parse((fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body).toMatchObject({ scope: "this" });
    expect(body.requestId).toEqual(expect.any(String));
    expect(await c.get("/availability?x=1")).toEqual({ ok: true, data: { ok: true } });
  });
  it("a failure exposes status, error and the booking problems (REQ-7 AC20)", async () => {
    const problems = [{ date: "2026-10-21", startTime: "16:00", endTime: "17:00", reason: "teacher_busy" }];
    const c = createApiClient(vi.fn(async () => json(422, { error: "booking_conflict", problems, more: 2 })) as never);
    expect(await c.send("PATCH", "/x", "k", {})).toMatchObject({ ok: false, stale: false, status: 422, error: "booking_conflict", problems, more: 2 });
  });
  it("a double-submit of the same action key sends one requestId", async () => {
    const ids: string[] = [];
    const c = createApiClient(vi.fn(async (_u: string, init: RequestInit) => { ids.push(JSON.parse(init.body as string).requestId); return json(503, {}); }) as never);
    await Promise.all([c.send("DELETE", "/x", "cancel:1", {}), c.send("DELETE", "/x", "cancel:1", {})]);
    expect(ids[0]).toBe(ids[1]);
  });
});
