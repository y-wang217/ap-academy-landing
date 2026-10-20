/**
 * Browser-side wrapper for the scheduler API. Client-safe: no server imports.
 * `fetch` does not add the Next basePath, so it is spelled out here. It must
 * equal next.config.ts's basePath + "/api/scheduler" (a unit test checks).
 * The path is relative, so it also works behind the landing rewrite.
 */
export const SCHEDULER_API = "/tracker/api/scheduler";

export type BookingProblemJson = { date: string; startTime: string; endTime: string; reason: string };
export type ApiFailure = { ok: false; message: string; stale: boolean; status?: number; error?: string; problems?: BookingProblemJson[]; more?: number };
export type ApiResult<T> = { ok: true; data: T } | ApiFailure;
type FetchFn = typeof fetch;

export function createApiClient(fetchFn: FetchFn = (...a) => fetch(...a)) {
  // One request ID per in-flight action key: a retry (or a double tap) reuses it, a success frees it.
  const pending = new Map<string, string>();

  async function run<T>(path: string, init: RequestInit): Promise<ApiResult<T>> {
    try {
      const res = await fetchFn(`${SCHEDULER_API}${path}`, init);
      const data = await res.json().catch(() => null);
      if (res.ok) return { ok: true, data: data as T };
      // has_outcome (REQ-39): the class is logged or marked, which no reload changes.
      if (res.status === 409 && data?.error === "has_outcome") return { ok: false, stale: false, status: 409, error: "has_outcome", message: "This class is already logged or marked. Ask Charlie to clear it first." };
      if (res.status === 409) return { ok: false, stale: true, message: "Someone else changed this. Showing the latest." };
      const failure: ApiFailure = { ok: false, stale: false, status: res.status, message: "That did not save. Please try again." };
      if (data && typeof data === "object") {
        if (typeof data.error === "string") failure.error = data.error;
        if (Array.isArray(data.problems)) failure.problems = data.problems;
        if (typeof data.more === "number") failure.more = data.more;
      }
      return failure;
    } catch {
      return { ok: false, stale: false, message: "Could not reach the server. Please try again." };
    }
  }

  return {
    get: <T>(path: string) => run<T>(path, { cache: "no-store" }),
    /**
     * The lesson routes (REQ-39): no request ID, since the class itself is the
     * key, and every refusal comes back by name for the dialog's copy.
     */
    async act<T = unknown>(method: "POST" | "DELETE", path: string, body: Record<string, unknown>): Promise<{ ok: true; status: number; data: T } | { ok: false; status?: number; error?: string }> {
      try {
        const res = await fetchFn(`${SCHEDULER_API}${path}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const data = await res.json().catch(() => null);
        if (res.ok) return { ok: true, status: res.status, data: data as T };
        return { ok: false, status: res.status, error: data && typeof data.error === "string" ? data.error : undefined };
      } catch {
        return { ok: false };
      }
    },
    async send<T = unknown>(method: "POST" | "PATCH" | "DELETE", path: string, key: string, body?: Record<string, unknown>): Promise<ApiResult<T>> {
      const requestId = pending.get(key) ?? crypto.randomUUID();
      pending.set(key, requestId);
      const init: RequestInit = { method, headers: { "Content-Type": "application/json" } };
      init.body = JSON.stringify({ ...body, requestId });
      const r = await run<T>(path, init);
      if (r.ok || r.stale) pending.delete(key);
      return r;
    },
  };
}

export const api = createApiClient();
