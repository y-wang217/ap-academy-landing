import { AsyncLocalStorage } from "node:async_hooks";

type Metric = { ms: number; calls: number };
type Metrics = { auth: Metric; db: Metric };
type Timer = { metrics: Metrics; now: () => number };

const als = new AsyncLocalStorage<Timer>();

const round = (n: number) => Math.round(n * 10) / 10;

export function formatServerTiming(m: Metrics, totalMs: number): string {
  const part = (name: string, x: Metric) => `${name};dur=${round(x.ms)};desc="${x.calls} calls"`;
  return `${part("auth", m.auth)}, ${part("db", m.db)}, total;dur=${round(totalMs)}`;
}

function metricFor(input: RequestInfo | URL): keyof Metrics | null {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.includes("/auth/v1/")) return "auth";
  if (url.includes("/rest/v1/")) return "db";
  return null;
}

/** fetch for the Supabase client: records auth and db time inside withServerTiming, else plain fetch. */
export const timedFetch: typeof fetch = async (input, init) => {
  const timer = als.getStore();
  const key = timer ? metricFor(input) : null;
  if (!timer || !key) return fetch(input, init);
  const start = timer.now();
  try {
    return await fetch(input, init);
  } finally {
    timer.metrics[key].ms += timer.now() - start;
    timer.metrics[key].calls += 1;
  }
};

/** Wraps a GET route handler so its response carries a Server-Timing header. */
export function withServerTiming<A extends unknown[]>(
  fn: (...args: A) => Promise<Response>,
  now: () => number = () => performance.now(),
): (...args: A) => Promise<Response> {
  return async (...args: A) => {
    const timer: Timer = {
      metrics: { auth: { ms: 0, calls: 0 }, db: { ms: 0, calls: 0 } },
      now,
    };
    const start = now();
    const res = await als.run(timer, () => fn(...args));
    const value = formatServerTiming(timer.metrics, now() - start);
    try {
      res.headers.set("Server-Timing", value);
      return res;
    } catch {
      const headers = new Headers(res.headers);
      headers.set("Server-Timing", value);
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
    }
  };
}
