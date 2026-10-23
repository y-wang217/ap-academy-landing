import { describe, expect, it } from "vitest";
import { createIrisStore, type IrisClient } from "./iris";

// REQ-46 AC8: a schedule no-show stays draftable until it has a draft, and flags come with each row.
const ORG = "10000000-0000-0000-0000-00000000aaaa";
const ROW = {
  id: "70000000-0000-4000-8000-000000000001", thread_id: "80000000-0000-4000-8000-000000000001", received_at: "2026-10-21T11:00:00Z",
  body_text: "Sorry, we missed it.", retry_count: 0, state: "escalated", intent: "no_show", notion_student_id: null,
  escalation_reason: "schedule_no_show", flags: ["schedule_unknown"],
};

function client() {
  const ops: [string, string, unknown[]][] = [];
  const iris = {
    from(table: string) {
      const q: Record<string, unknown> = {};
      for (const op of ["select", "eq", "or", "lt", "order", "limit", "in"]) q[op] = (...args: unknown[]) => (ops.push([table, op, args]), q);
      q.then = (resolve: (v: unknown) => void) => resolve(table === "messages" ? { data: [ROW], error: null } : { data: [], error: null });
      return q;
    },
  };
  return { ops, iris: iris as unknown as IrisClient };
}

describe("listDraftable", () => {
  it("accepts schedule_no_show beside escalate_only and selects flags and the reason", async () => {
    const c = client();
    const rows = await createIrisStore(c.iris, ORG).listDraftable(3, 10);
    const or = c.ops.find(([t, op]) => t === "messages" && op === "or")![2][0] as string;
    expect(or).toContain("escalation_reason.in.(escalate_only,schedule_no_show)");
    expect(or).toContain("intent.eq.no_show");
    expect(or).toContain("handled_at.is.null");
    const select = c.ops.find(([t, op]) => t === "messages" && op === "select")![2][0] as string;
    expect(select).toContain("flags");
    expect(select).toContain("escalation_reason");
    expect(rows).toEqual([expect.objectContaining({ id: ROW.id, state: "escalated", intent: "no_show", flags: ["schedule_unknown"], escalationReason: "schedule_no_show" })]);
  });
});
