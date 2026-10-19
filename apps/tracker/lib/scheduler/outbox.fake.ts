import { dailyTaskKey, summaryKey, type OutboxFinish, type OutboxKind, type OutboxRetry, type OutboxRow, type OutboxStatus, type OutboxStore } from "./outbox-store";

type FakeRow = OutboxRow & { version: number; leaseUntil: number | null; supersededBy: string | null; payloadHash: string | null };

/**
 * An in-memory outbox with the rules of 0021: one pending row per key, claims
 * skip a key with a live running row, `done` supersedes older failed or
 * uncertain rows, and retry hands a failed row to a pending one. `enqueue`
 * stands in for the database trigger. Test only.
 */
export function fakeOutbox(orgId: string, clock: () => number = () => Date.now()) {
  const rows: FakeRow[] = [];
  const calls: string[] = [];
  /** The keys each findPending was asked for. */
  const asked: string[][] = [];
  let n = 0;
  let tick = 0;
  const iso = (ms: number) => new Date(ms).toISOString();
  const id = () => `0b000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;

  const enqueue = (kind: OutboxKind, targetId: string): string => {
    const key = kind === "summary" ? summaryKey(targetId) : dailyTaskKey(targetId);
    const pending = rows.find((r) => r.dedupeKey === key && r.status === "pending");
    // requested_at orders rows, so each enqueue is stamped a moment after the last; it is due at once.
    const at = iso(clock() + ++tick);
    const due = iso(clock());
    if (pending) {
      pending.version += 1;
      pending.requestedAt = at;
      pending.nextAttemptAt = due;
      return pending.id;
    }
    const row: FakeRow = {
      id: id(), kind, targetId, dedupeKey: key, status: "pending", attempts: 0, nextAttemptAt: due, lastError: null, requestedAt: at,
      version: 1, leaseUntil: null, supersededBy: null, payloadHash: null,
    };
    rows.push(row);
    return row.id;
  };

  const copy = (r: FakeRow): OutboxRow => ({
    id: r.id, kind: r.kind, targetId: r.targetId, dedupeKey: r.dedupeKey, status: r.status, attempts: r.attempts,
    nextAttemptAt: r.nextAttemptAt, lastError: r.lastError, requestedAt: r.requestedAt,
  });
  const live = (r: FakeRow) => r.status === "running" && r.leaseUntil !== null && r.leaseUntil >= clock();

  void orgId;
  const store: OutboxStore = {
    claim: async (ids, limit, leaseSeconds) => {
      calls.push("claim");
      const now = clock();
      for (const r of rows) if (r.kind === "daily_task" && r.status === "running" && !live(r)) Object.assign(r, { status: "uncertain", leaseUntil: null });
      for (const r of rows) {
        const pending = rows.find((p) => p.dedupeKey === r.dedupeKey && p.status === "pending");
        if (r.kind === "summary" && r.status === "running" && !live(r) && pending) Object.assign(r, { status: "superseded", leaseUntil: null, supersededBy: pending.id });
      }
      const picked = rows
        .filter((r) => !ids || ids.includes(r.id))
        .filter((r) => (r.status === "pending" && Date.parse(r.nextAttemptAt) <= now) || (r.status === "running" && r.kind === "summary" && !live(r)))
        .filter((r) => !rows.some((o) => o.id !== r.id && o.dedupeKey === r.dedupeKey && live(o)))
        .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt))
        .slice(0, limit);
      for (const r of picked) Object.assign(r, { status: "running" as OutboxStatus, leaseUntil: now + leaseSeconds * 1000, attempts: r.attempts + 1 });
      return picked.map(copy);
    },
    finish: async (row, patch: OutboxFinish) => {
      calls.push(`finish:${patch.status}`);
      const r = rows.find((x) => x.id === row.id)!;
      const sibling = rows.find((p) => p.id !== r.id && p.dedupeKey === r.dedupeKey && p.status === "pending");
      if (patch.status === "pending" && sibling) {
        Object.assign(r, { status: "superseded", supersededBy: sibling.id, leaseUntil: null });
        return;
      }
      Object.assign(r, { status: patch.status, leaseUntil: null });
      if (patch.attempts !== undefined) r.attempts = patch.attempts;
      if (patch.nextAttemptAt !== undefined) r.nextAttemptAt = patch.nextAttemptAt;
      if (patch.lastError !== undefined) r.lastError = patch.lastError;
      if (patch.payloadHash !== undefined) r.payloadHash = patch.payloadHash;
      if (patch.status === "done") {
        for (const o of rows) {
          if (o.dedupeKey === r.dedupeKey && (o.status === "failed" || o.status === "uncertain") && o.requestedAt < r.requestedAt) {
            Object.assign(o, { status: "superseded", supersededBy: r.id });
          }
        }
      }
    },
    findPending: async (keys) => {
      calls.push("findPending");
      asked.push([...keys].sort());
      return rows.filter((r) => r.status === "pending" && keys.includes(r.dedupeKey)).map((r) => ({ id: r.id, kind: r.kind, targetId: r.targetId }));
    },
    listOpen: async (staleBefore) => {
      calls.push("listOpen");
      return rows
        .filter((r) => r.status === "failed" || r.status === "uncertain" || ((r.status === "pending" || r.status === "running") && r.requestedAt < staleBefore))
        .map(copy);
    },
    retry: async (rowId): Promise<OutboxRetry> => {
      calls.push("retry");
      const r = rows.find((x) => x.id === rowId);
      if (!r) return "not_found";
      if (r.status === "pending") {
        r.nextAttemptAt = iso(clock());
        return { id: r.id, status: "pending", supersededBy: null };
      }
      if (r.status !== "failed" && r.status !== "uncertain") return "not_retryable";
      const pending = rows.find((p) => p.dedupeKey === r.dedupeKey && p.status === "pending");
      if (pending) {
        Object.assign(r, { status: "superseded", supersededBy: pending.id });
        pending.nextAttemptAt = iso(clock());
        return { id: pending.id, status: "pending", supersededBy: r.id };
      }
      Object.assign(r, { status: "pending", nextAttemptAt: iso(clock()), lastError: null, attempts: 0 });
      return { id: r.id, status: "pending", supersededBy: null };
    },
    enqueueSummaries: async (studentIds) => {
      calls.push("enqueueSummaries");
      return [...new Set(studentIds)].map((s) => enqueue("summary", s));
    },
  };
  return { store, rows, calls, asked, enqueue, row: (rowId: string) => rows.find((r) => r.id === rowId) };
}
