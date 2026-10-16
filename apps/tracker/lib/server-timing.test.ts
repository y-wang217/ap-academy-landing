import { afterEach, describe, expect, it, vi } from "vitest";
import { formatServerTiming, timedFetch, withServerTiming } from "./server-timing";

afterEach(() => vi.unstubAllGlobals());

function clock(...ticks: number[]) {
  let i = 0;
  return () => ticks[Math.min(i++, ticks.length - 1)];
}

describe("formatServerTiming", () => {
  it("formats exactly, rounds to 1 decimal, keeps order", () => {
    const s = formatServerTiming({ auth: { ms: 12.34, calls: 2 }, db: { ms: 5.06, calls: 1 } }, 40.04);
    expect(s).toBe('auth;dur=12.3;desc="2 calls", db;dur=5.1;desc="1 calls", total;dur=40');
  });
  it("emits zero metrics when there were no calls", () => {
    expect(formatServerTiming({ auth: { ms: 0, calls: 0 }, db: { ms: 0, calls: 0 } }, 3)).toBe(
      'auth;dur=0;desc="0 calls", db;dur=0;desc="0 calls", total;dur=3',
    );
  });
});

describe("timedFetch", () => {
  it("passes through untouched with no active timer", async () => {
    const f = vi.fn(async () => new Response("ok"));
    vi.stubGlobal("fetch", f);
    const res = await timedFetch("https://x.supabase.co/rest/v1/a", { method: "GET" });
    expect(await res.text()).toBe("ok");
    expect(f).toHaveBeenCalledWith("https://x.supabase.co/rest/v1/a", { method: "GET" });
  });

  it("records auth and db calls inside withServerTiming, ignores others", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}")));
    const handler = withServerTiming(async () => {
      await timedFetch("https://x.supabase.co/auth/v1/user");
      await timedFetch("https://x.supabase.co/rest/v1/a");
      await timedFetch("https://x.supabase.co/rest/v1/rpc/b");
      await timedFetch("https://api.notion.com/v1/pages");
      return Response.json({});
    }, clock(0, 1, 3, 3, 7, 7, 12, 12, 12, 20));
    const res = await handler();
    const h = res.headers.get("Server-Timing")!;
    expect(h).toContain('auth;dur=');
    expect(h).toContain('auth;dur=2;desc="1 calls"');
    expect(h).toContain('db;dur=9;desc="2 calls"');
    expect(h).toContain("total;dur=");
  });

  it("records a rejected fetch and rethrows", async () => {
    const boom = new Error("net");
    vi.stubGlobal("fetch", vi.fn(async () => { throw boom; }));
    let seen: unknown;
    const handler = withServerTiming(async () => {
      try { await timedFetch("https://x.supabase.co/rest/v1/a"); } catch (e) { seen = e; }
      return Response.json({});
    });
    const res = await handler();
    expect(seen).toBe(boom);
    expect(res.headers.get("Server-Timing")).toContain('db;dur=');
    expect(res.headers.get("Server-Timing")).toContain('desc="1 calls"');
  });

  it("does not leak metrics between requests", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}")));
    const a = withServerTiming(async () => { await timedFetch("https://x/rest/v1/a"); return Response.json({}); });
    const b = withServerTiming(async () => Response.json({}));
    await a();
    const res = await b();
    expect(res.headers.get("Server-Timing")).toContain('db;dur=0;desc="0 calls"');
  });
});

describe("withServerTiming", () => {
  it("keeps status, body and headers on denials and adds the header", async () => {
    const handler = withServerTiming(async () =>
      Response.json({ error: "no" }, { status: 401, headers: { "Cache-Control": "no-store" } }),
    );
    const res = await handler();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "no" });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Server-Timing")).toMatch(/^auth;dur=0/);
  });

  it("handles immutable headers", async () => {
    const handler = withServerTiming(async () => {
      const r = Response.redirect("https://example.com/", 302);
      return r;
    });
    const res = await handler();
    expect(res.status).toBe(302);
    expect(res.headers.get("Server-Timing")).toContain("total;dur=");
    expect(res.headers.get("Location")).toBe("https://example.com/");
  });

  it("passes handler arguments through", async () => {
    const handler = withServerTiming(async (a: string, b: number) => Response.json({ a, b }));
    expect(await (await handler("x", 2)).json()).toEqual({ a: "x", b: 2 });
  });

  it("rethrows the same error", async () => {
    const err = new Error("bad");
    const handler = withServerTiming(async () => { throw err; });
    await expect(handler()).rejects.toBe(err);
  });
});
