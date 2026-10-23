import type { InsertResult, NewTransition, OutcomeStore, Transition, TransitionMarks } from "./outcome-store";

/**
 * In-memory transition log for tests (REQ-61). It keeps the rules the
 * migration enforces: request_id unique, one open row per page, finished rows
 * never move, and an uncertain row goes back to running only by a claim.
 * `audits` counts the state changes the audit trigger would record.
 */
export function fakeOutcomeStore(clock: () => Date = () => new Date()) {
  const rows = new Map<string, Transition>();
  const audits: { pageId: string; state: string }[] = [];
  const calls: string[] = [];
  const open = (pageId: string) => [...rows.values()].find((r) => r.pageId === pageId && (r.state === "running" || r.state === "uncertain")) ?? null;
  const copy = (r: Transition | null | undefined) => (r ? structuredClone(r) : null);

  const store: OutcomeStore = {
    async get(requestId) {
      calls.push("get");
      return copy(rows.get(requestId));
    },
    async openFor(pageId) {
      calls.push("openFor");
      return copy(open(pageId));
    },
    async insert(row: NewTransition): Promise<InsertResult> {
      calls.push("insert");
      if (rows.has(row.requestId)) return { ok: false, conflict: "request_id" };
      const other = open(row.pageId);
      if (other) return { ok: false, conflict: "open", openRequestId: other.requestId };
      const t: Transition = {
        requestId: row.requestId, pageId: row.pageId, outcome: row.outcome, patch: structuredClone(row.patch), touch: { ...row.touch }, expected: { ...row.expected },
        state: "running", attempts: 1, leaseUntil: new Date(clock().getTime() + row.leaseSeconds * 1000).toISOString(), patchSentAt: null, patchVerifiedAt: null,
        touchSentAt: null, touchPageId: null, result: null, lastError: null, createdAt: clock().toISOString(),
      };
      rows.set(row.requestId, t);
      return { ok: true, row: copy(t)! };
    },
    async claim(requestId, leaseSeconds) {
      calls.push("claim");
      const r = rows.get(requestId);
      if (!r) return null;
      const expired = r.state === "running" && (r.leaseUntil === null || Date.parse(r.leaseUntil) < clock().getTime());
      if (r.state !== "uncertain" && !expired) return null;
      r.state = "running";
      r.attempts += 1;
      r.leaseUntil = new Date(clock().getTime() + leaseSeconds * 1000).toISOString();
      return copy(r);
    },
    async mark(requestId, marks: TransitionMarks) {
      calls.push("mark");
      const r = rows.get(requestId);
      if (!r || r.state !== "running") throw new Error("mark on a row that is not running");
      Object.assign(r, marks);
    },
    async finish(requestId, state, result, error) {
      calls.push(`finish:${state}`);
      const r = rows.get(requestId);
      if (!r || r.state !== "running") throw new Error("finish on a row that is not running");
      r.state = state;
      r.leaseUntil = null;
      r.result = result;
      r.lastError = error;
      audits.push({ pageId: r.pageId, state });
    },
  };
  return { store, rows, audits, calls };
}
