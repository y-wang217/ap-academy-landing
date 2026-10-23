import { describe, expect, it } from "vitest";
import { scoreEval } from "../iris/eval-score";
import { createIrisReader, type IrisClient } from "./iris";
import { createEvalReader } from "./iris-eval";

// REQ-45 AC3, AC5, AC8: the Iris queries this card changes, over a recording client.
const ORG = "10000000-0000-0000-0000-00000000aaaa";
const UID = "a0000000-0000-4000-8000-000000000001";
const M1 = "22222222-2222-4222-8222-222222222222";
const M2 = "33333333-3333-4333-8333-333333333333";
const R1 = "66666666-6666-4666-8666-666666666666";
const R2 = "77777777-7777-4777-8777-777777777777";

type Op = [string, ...unknown[]];
type Query = { table: string; ops: Op[] };
type Answer = { data: unknown; error: unknown };

/** A Supabase-like client: every builder call is recorded; `answer` decides what a finished query returns. */
function recordingClient(answer: (q: Query) => Answer) {
  const queries: Query[] = [];
  const from = (table: string) => {
    const q: Query = { table, ops: [] };
    queries.push(q);
    const b: Record<string, unknown> = {
      then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => Promise.resolve(answer(q)).then(resolve, reject),
      maybeSingle: () => {
        q.ops.push(["maybeSingle"]);
        const a = answer(q);
        return Promise.resolve({ ...a, data: Array.isArray(a.data) ? (a.data[0] ?? null) : a.data });
      },
      single: () => (q.ops.push(["single"]), Promise.resolve(answer(q))),
    };
    for (const m of ["select", "eq", "neq", "in", "is", "not", "or", "order", "limit", "gte", "lt", "insert", "update", "upsert", "delete"]) {
      b[m] = (...args: unknown[]) => (q.ops.push([m, ...args]), b);
    }
    return b;
  };
  const client = { from, rpc: () => Promise.resolve({ data: null, error: null }) } as unknown as IrisClient;
  return { client, queries };
}
const has = (q: Query, op: string) => q.ops.some((o) => o[0] === op);

describe("inbox Recent (AC3)", () => {
  it("excludes history imported for the eval; the other sections do not need to", async () => {
    const { client, queries } = recordingClient(() => ({ data: [], error: null }));
    const reader = createIrisReader(client, ORG);
    await reader.listRecent(50);
    expect(queries[0].ops).toContainEqual(["or", "escalation_reason.is.null,escalation_reason.neq.history_import"]);
    await reader.listNeedsYou(50);
    // Needs you already requires handled_at is null, which history never has.
    expect(queries[1].ops).toContainEqual(["is", "handled_at", null]);
  });
});

describe("saveLabel (AC5)", () => {
  it("updates the one label row when it exists, and never inserts a second", async () => {
    const { client, queries } = recordingClient((q) => {
      if (q.table === "messages") return { data: [{ id: M1 }], error: null };
      if (q.table === "eval_labels" && has(q, "update")) return { data: [{ message_id: M1 }], error: null };
      return { data: [], error: null };
    });
    const r = await createEvalReader(client, ORG, async () => UID).saveLabel(M1, { goldIntent: "cancellation", goldReplyType: "cancellation", goldEscalate: false, note: null });
    expect(r).toBe("ok");
    const msg = queries.find((q) => q.table === "messages")!;
    expect(msg.ops).toContainEqual(["eq", "escalation_reason", "history_import"]);
    const labels = queries.filter((q) => q.table === "eval_labels");
    expect(labels).toHaveLength(1);
    const update = labels[0].ops.find((o) => o[0] === "update")![1] as Record<string, unknown>;
    expect(update).toMatchObject({ gold_intent: "cancellation", gold_reply_type: "cancellation", gold_escalate: false, labelled_by: UID });
    expect(labels[0].ops).toContainEqual(["eq", "message_id", M1]);
  });

  it("inserts the first label without labelled_at (the owner's insert grant has none)", async () => {
    const { client, queries } = recordingClient((q) => (q.table === "messages" ? { data: [{ id: M1 }], error: null } : { data: [], error: null }));
    await createEvalReader(client, ORG, async () => UID).saveLabel(M1, { goldIntent: "other", goldReplyType: null, goldEscalate: true, note: "n" });
    const insert = queries.find((q) => q.table === "eval_labels" && has(q, "insert"))!.ops.find((o) => o[0] === "insert")![1] as Record<string, unknown>;
    expect(insert).toEqual({ org_id: ORG, message_id: M1, gold_intent: "other", gold_reply_type: null, gold_escalate: true, note: "n", labelled_by: UID });
  });

  it("a message that is not imported history is not_found and writes nothing", async () => {
    const { client, queries } = recordingClient(() => ({ data: [], error: null }));
    expect(await createEvalReader(client, ORG, async () => UID).saveLabel(M1, { goldIntent: "other", goldReplyType: null, goldEscalate: true, note: null })).toBe("not_found");
    expect(queries.some((q) => q.table === "eval_labels")).toBe(false);
  });
});

describe("recordRun (AC8)", () => {
  const REQ = 41;
  const events = [
    { id: 42, at: "2026-10-21T14:10:00Z", kind: "eval_run_finished", detail: { request_id: REQ, scored: 2, errors: 0 } },
    { id: REQ, at: "2026-10-21T14:00:00Z", kind: "eval_run_requested", detail: { policy_version: 3, model: "claude-test" } },
  ];
  const result = (id: string, messageId: string, predicted: string | null, escalate: boolean, outcome = "ok") => ({
    id, message_id: messageId, request_event_id: REQ, policy_version: 3, model: "claude-test", predicted_intent: predicted, predicted_reply_type: predicted,
    predicted_escalate: escalate, draft_body: escalate ? null : "Thanks.", outcome,
  });
  const labels = [
    { message_id: M1, gold_intent: "cancellation", gold_reply_type: "cancellation", gold_escalate: false, draft_rating: 5, note: null, rated_result_id: R1 },
    { message_id: M2, gold_intent: "refund_request", gold_reply_type: null, gold_escalate: true, draft_rating: null, note: null, rated_result_id: null },
  ];

  function world(results: unknown[]) {
    return recordingClient((q) => {
      if (q.table === "events") return { data: events, error: null };
      if (q.table === "eval_results") return { data: results, error: null };
      if (q.table === "eval_labels") return { data: labels, error: null };
      return { data: [], error: null };
    });
  }

  it("inserts exactly the scoreEval output for the finished request", async () => {
    const results = [result(R1, M1, "cancellation", false), result(R2, M2, null, true)];
    const { client, queries } = world(results);
    expect(await createEvalReader(client, ORG, async () => UID).recordRun(REQ)).toBe("ok");
    const insert = queries.find((q) => q.table === "eval_runs")!.ops.find((o) => o[0] === "insert")![1];
    const s = scoreEval([
      { goldIntent: "cancellation", goldReplyType: "cancellation", goldEscalate: false, predictedReplyType: "cancellation", predictedEscalate: false, rating: 5 },
      { goldIntent: "refund_request", goldReplyType: null, goldEscalate: true, predictedReplyType: null, predictedEscalate: true, rating: null },
    ]);
    expect(insert).toEqual({
      org_id: ORG, policy_version: 3, model: "claude-test", labelled_count: s.labelledCount, per_type: s.perType, sensitive_recall: 1, mean_rating_per_type: s.meanRatingPerType,
    });
  });

  it("refuses with has_errors, not_finished or not_found and inserts nothing", async () => {
    const withError = world([result(R1, M1, "cancellation", false), result(R2, M2, null, true, "error")]);
    expect(await createEvalReader(withError.client, ORG, async () => UID).recordRun(REQ)).toBe("has_errors");
    expect(withError.queries.some((q) => q.table === "eval_runs")).toBe(false);
    const other = world([]);
    expect(await createEvalReader(other.client, ORG, async () => UID).recordRun(99)).toBe("not_found");
    const pending = recordingClient((q) => (q.table === "events" ? { data: [{ id: 50, at: "x", kind: "eval_run_requested", detail: {} }], error: null } : { data: [], error: null }));
    expect(await createEvalReader(pending.client, ORG, async () => UID).recordRun(50)).toBe("not_finished");
  });
});
