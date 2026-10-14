/**
 * Browser-side wrapper for the scheduler API. Client-safe: no server imports.
 * `fetch` does not add the Next basePath, so it is spelled out here. It must
 * equal next.config.ts's basePath + "/api/scheduler" (a unit test checks).
 * The path is relative, so it also works behind the landing rewrite.
 */
export const SCHEDULER_API = "/tracker/api/scheduler";

export type ApiResult<T> = { ok: true; data: T } | { ok: false; message: string; stale: boolean };
type FetchFn = typeof fetch;

export function createApiClient(fetchFn: FetchFn = (...a) => fetch(...a)) {
  // One request ID per in-flight action key: a retry (or a double tap) reuses it, a success frees it.
  const pending = new Map<string, string>();

  async function run<T>(path: string, init: RequestInit): Promise<ApiResult<T>> {
    try {
      const res = await fetchFn(`${SCHEDULER_API}${path}`, init);
      const data = await res.json().catch(() => null);
      if (res.ok) return { ok: true, data: data as T };
      if (res.status === 409) return { ok: false, stale: true, message: "Someone else changed this. Showing the latest." };
      return { ok: false, stale: false, message: "That did not save. Please try again." };
    } catch {
      return { ok: false, stale: false, message: "Could not reach the server. Please try again." };
    }
  }

  return {
    get: <T>(path: string) => run<T>(path, { cache: "no-store" }),
    async send<T = unknown>(method: "POST" | "PATCH" | "DELETE", path: string, key: string, body?: Record<string, unknown>): Promise<ApiResult<T>> {
      const requestId = pending.get(key) ?? crypto.randomUUID();
      pending.set(key, requestId);
      const init: RequestInit = { method, headers: { "Content-Type": "application/json" } };
      if (method !== "DELETE") init.body = JSON.stringify({ ...body, requestId });
      const r = await run<T>(path, init);
      if (r.ok || r.stale) pending.delete(key);
      return r;
    },
  };
}

export const api = createApiClient();
