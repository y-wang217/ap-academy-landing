import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { config, proxy } from "./proxy";

// Supabase env is unset in unit tests, so updateSession reports configured: false and passes through.
// nextConfig.basePath makes nextUrl.pathname relative to /tracker, as it is behind the real basePath.
const req = (path: string, init: { method?: string; headers?: Record<string, string> } = {}) =>
  new NextRequest(`http://localhost:3001/tracker${path}`, { method: "POST", nextConfig: { basePath: "/tracker" }, ...init });

describe("proxy cross-site check", () => {
  it("answers a cross-origin scheduler write with 403, JSON and no-store", async () => {
    const res = await proxy(req("/api/scheduler/classes", { headers: { origin: "https://evil.example" } }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden" });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("passes a scheduler write from the site origin", async () => {
    const res = await proxy(req("/api/scheduler/classes", { headers: { origin: "https://www.apacademy.ca" } }));
    expect(res.status).not.toBe(403);
  });

  it("does not check paths outside /api/scheduler/", async () => {
    const res = await proxy(req("/schedule", { headers: { "sec-fetch-site": "cross-site", origin: "https://evil.example" } }));
    expect(res.status).not.toBe(403);
  });

  it("keeps the bearer-only run endpoint out of the matcher", () => {
    expect(config.matcher[1].source).toContain("api/scheduler/daily-task/run$");
  });
});
