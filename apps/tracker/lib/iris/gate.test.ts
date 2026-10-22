import { describe, expect, it } from "vitest";
import { AUTO_SEND_CANDIDATES, evaluateGate, type GateRun } from "./gate";
import { ESCALATE_ONLY, NEVER_AUTO_SEND } from "./policy";

// REQ-45 AC10: the auto-send gate, at and just under every threshold.
const POLICY = 3;
const MODEL = "claude-test";
const passingRun = (over: Partial<GateRun> = {}): GateRun => ({
  policyVersion: POLICY,
  model: MODEL,
  perType: { cancellation: { precision: 0.95, recall: 0.9, count: 20 } },
  sensitiveRecall: 1,
  meanRatingPerType: { cancellation: 4 },
  ...over,
});
const streak = (n = 20, version: number | null = POLICY) => ({ uneditedStreak: n, streakPolicyVersion: version });
const gate = (run: GateRun | null, rt = streak(), type = "cancellation") => evaluateGate({ type, run, replyType: rt, policyVersion: POLICY, model: MODEL });

describe("evaluateGate", () => {
  it("passes at exactly 20 labelled, 0.95, 1.0, 4 and a streak of 20", () => {
    expect(gate(passingRun())).toEqual({ pass: true, failing: [] });
  });

  it.each([
    ["labelled_count", passingRun({ perType: { cancellation: { precision: 0.95, recall: 1, count: 19 } } }), streak()],
    ["precision", passingRun({ perType: { cancellation: { precision: 0.94, recall: 1, count: 20 } } }), streak()],
    ["sensitive_recall", passingRun({ sensitiveRecall: 0.99 }), streak()],
    ["mean_rating", passingRun({ meanRatingPerType: { cancellation: 3.99 } }), streak()],
    ["streak", passingRun(), streak(19)],
  ])("one step below fails with %s alone", (condition, run, rt) => {
    expect(gate(run, rt)).toEqual({ pass: false, failing: [condition] });
  });

  it("null precision, sensitive recall and mean rating fail", () => {
    const r = gate(passingRun({ perType: { cancellation: { precision: null, recall: null, count: 20 } }, sensitiveRecall: null, meanRatingPerType: {} }));
    expect(r.failing).toEqual(["precision", "sensitive_recall", "mean_rating"]);
  });

  it("a type missing from the run fails count, precision and mean rating", () => {
    expect(gate(passingRun(), streak(), "general_question").failing).toEqual(["labelled_count", "precision", "mean_rating"]);
  });

  it("names several failures together", () => {
    const r = gate(passingRun({ sensitiveRecall: 0.5, meanRatingPerType: { cancellation: 2 } }), streak(3));
    expect(r).toEqual({ pass: false, failing: ["sensitive_recall", "mean_rating", "streak"] });
  });

  it("no run, a stale policy or a stale model", () => {
    expect(gate(null).failing).toEqual(["no_run"]);
    expect(gate(null, streak(0)).failing).toEqual(["no_run", "streak"]);
    expect(gate(passingRun({ policyVersion: POLICY - 1 })).failing).toEqual(["stale_run"]);
    expect(gate(passingRun({ model: "older-model" })).failing).toEqual(["stale_run"]);
  });

  it("a streak at an older policy version or no reply type row fails streak", () => {
    expect(gate(passingRun(), streak(25, POLICY - 1)).failing).toEqual(["streak"]);
    expect(gate(passingRun(), null).failing).toEqual(["streak"]);
  });

  it("never_auto_send for pause_or_stop and every escalate-only type", () => {
    for (const t of ["pause_or_stop", ...ESCALATE_ONLY]) {
      expect(gate(passingRun(), streak(), t)).toEqual({ pass: false, failing: ["never_auto_send"] });
    }
  });

  it("the candidates are the reply types minus never-auto-send and no_reply_needed", () => {
    expect(AUTO_SEND_CANDIDATES).toEqual(["cancel_with_notice", "late_cancel", "cancellation", "reschedule_request", "reschedule_offer", "general_question"]);
    for (const t of AUTO_SEND_CANDIDATES) expect(NEVER_AUTO_SEND).not.toContain(t);
  });
});
